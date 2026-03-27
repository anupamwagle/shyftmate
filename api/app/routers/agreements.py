"""Agreements router — CRUD, versioning, rollback, and all sub-resources."""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.models.agreement import (
    Agreement,
    AgreementAllowance,
    AgreementLeavePaycode,
    EmployeeTypeConfig,
    KronosConfig,
    KronosPaycode,
    RuleLine,
    WageGrade,
)
from app.models.user import User
from app.schemas.agreement import (
    AgreementActivateIn,
    AgreementAllowanceCreate,
    AgreementAllowanceOut,
    AgreementAllowanceUpdate,
    AgreementCreate,
    AgreementLeavePaycodeCreate,
    AgreementLeavePaycodeOut,
    AgreementOut,
    AgreementUpdate,
    EmployeeTypeConfigCreate,
    EmployeeTypeConfigOut,
    EmployeeTypeConfigUpdate,
    KronosConfigCreate,
    KronosConfigOut,
    KronosConfigUpdate,
    KronosPaycodeCreate,
    KronosPaycodeOut,
    KronosPaycodeUpdate,
    RollbackIn,
    RuleLineCreate,
    RuleLineOut,
    RuleLineUpdate,
    WageGradeCreate,
    WageGradeOut,
    WageGradeUpdate,
)
from app.services.audit_service import log_action

router = APIRouter()


def _ip(request: Request) -> Optional[str]:
    return request.client.host if request.client else None


async def _get_agreement_or_404(db: AsyncSession, agreement_id: uuid.UUID) -> Agreement:
    result = await db.execute(
        select(Agreement)
        .options(
            selectinload(Agreement.employee_type_configs).selectinload(EmployeeTypeConfig.rule_lines).selectinload(RuleLine.sub_rules),
            selectinload(Agreement.allowances),
            selectinload(Agreement.leave_paycodes),
            selectinload(Agreement.wage_grades),
            selectinload(Agreement.kronos_config),
        )
        .where(Agreement.id == agreement_id)
    )
    agreement = result.scalar_one_or_none()
    if agreement is None:
        raise HTTPException(
            status_code=404,
            detail={"error_code": "AGREEMENT_NOT_FOUND", "message": "Agreement not found.", "detail": None},
        )
    return agreement


# ── Agreements CRUD ──────────────────────────────────────────

@router.get("/agreements", response_model=dict, summary="List agreements")
async def list_agreements(
    agreement_type: Optional[str] = Query(None),
    agreement_status: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_roles("reviewer")),
    db: AsyncSession = Depends(get_db),
):
    query = select(Agreement)
    if agreement_type:
        query = query.where(Agreement.agreement_type == agreement_type)
    if agreement_status:
        query = query.where(Agreement.status == agreement_status)

    count_result = await db.execute(select(Agreement.id).where(
        *(([Agreement.agreement_type == agreement_type] if agreement_type else []) +
          ([Agreement.status == agreement_status] if agreement_status else []))
    ))
    total = len(count_result.scalars().all())

    query = query.order_by(Agreement.created_at.desc()).offset((page - 1) * limit).limit(limit)
    result = await db.execute(query)
    items = result.scalars().all()

    return {
        "items": [AgreementOut.model_validate(a) for a in items],
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
    }


@router.post("/agreements", response_model=AgreementOut, status_code=status.HTTP_201_CREATED, summary="Create agreement")
async def create_agreement(
    body: AgreementCreate,
    request: Request,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    data = body.model_dump()
    agreement = Agreement(**data, created_by=current_user.id)
    db.add(agreement)
    await db.flush()
    await log_action(db, "agreement", agreement.id, "created", current_user.id,
                     after=data, ip_address=_ip(request))
    return agreement


@router.get("/agreements/{agreement_id}", response_model=AgreementOut, summary="Get agreement")
async def get_agreement(
    agreement_id: uuid.UUID,
    current_user: User = Depends(require_roles("reviewer")),
    db: AsyncSession = Depends(get_db),
):
    return await _get_agreement_or_404(db, agreement_id)


@router.patch("/agreements/{agreement_id}", response_model=AgreementOut, summary="Update agreement")
async def update_agreement(
    agreement_id: uuid.UUID,
    body: AgreementUpdate,
    request: Request,
    current_user: User = Depends(require_roles("reviewer")),
    db: AsyncSession = Depends(get_db),
):
    agreement = await _get_agreement_or_404(db, agreement_id)
    before = AgreementOut.model_validate(agreement).model_dump(mode="json")

    if agreement.status == "active":
        # Version chain: create new draft with incremented version
        new_data = {k: v for k, v in before.items() if k not in ("id", "created_at", "updated_at", "validated_at", "sync_attempted_at")}
        # Apply updates
        update_dict = body.model_dump(exclude_unset=True)
        new_data.update(update_dict)
        new_data["parent_version_id"] = agreement.id
        new_data["version"] = agreement.version + 1
        new_data["status"] = "draft"
        new_data["created_by"] = current_user.id
        new_data["validated_by"] = None
        new_data["validated_at"] = None
        # Remove computed/relationship fields
        for key in ("employee_type_configs", "allowances", "leave_paycodes", "wage_grades", "kronos_config"):
            new_data.pop(key, None)
        new_agreement = Agreement(**new_data)
        db.add(new_agreement)
        await db.flush()
        await log_action(db, "agreement", new_agreement.id, "created", current_user.id,
                         after=update_dict, ip_address=_ip(request))
        return new_agreement
    else:
        update_dict = body.model_dump(exclude_unset=True)
        for field, value in update_dict.items():
            setattr(agreement, field, value)
        await log_action(db, "agreement", agreement.id, "updated", current_user.id,
                         before=before, after=update_dict, ip_address=_ip(request))
        return agreement


@router.get("/agreements/{agreement_id}/history", response_model=list[AgreementOut], summary="Agreement version history")
async def agreement_history(
    agreement_id: uuid.UUID,
    current_user: User = Depends(require_roles("reviewer")),
    db: AsyncSession = Depends(get_db),
):
    agreement = await _get_agreement_or_404(db, agreement_id)
    # Find all versions with same agreement_code
    result = await db.execute(
        select(Agreement)
        .where(Agreement.agreement_code == agreement.agreement_code)
        .order_by(Agreement.version.asc())
    )
    return result.scalars().all()


@router.post("/agreements/{agreement_id}/activate", response_model=AgreementOut, summary="Activate agreement")
async def activate_agreement(
    agreement_id: uuid.UUID,
    body: AgreementActivateIn,
    request: Request,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    agreement = await _get_agreement_or_404(db, agreement_id)
    if agreement.status != "draft":
        raise HTTPException(
            status_code=400,
            detail={"error_code": "AGREEMENT_NOT_DRAFT", "message": "Only draft agreements can be activated.", "detail": None},
        )

    # Supersede any currently active version with same code
    active_result = await db.execute(
        select(Agreement).where(
            Agreement.agreement_code == agreement.agreement_code,
            Agreement.status == "active",
            Agreement.id != agreement_id,
        )
    )
    for prev in active_result.scalars().all():
        prev.status = "superseded"

    agreement.status = "active"
    agreement.validated_by = current_user.id
    agreement.validated_at = datetime.now(timezone.utc)

    await log_action(db, "agreement", agreement.id, "activated", current_user.id,
                     after={"reason": body.reason}, ip_address=_ip(request))
    return agreement


@router.post("/agreements/{agreement_id}/rollback/{target_version_id}", response_model=AgreementOut, summary="Rollback agreement")
async def rollback_agreement(
    agreement_id: uuid.UUID,
    target_version_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    current = await _get_agreement_or_404(db, agreement_id)
    target = await db.get(Agreement, target_version_id)
    if target is None:
        raise HTTPException(status_code=404, detail={"error_code": "VERSION_NOT_FOUND", "message": "Target version not found.", "detail": None})

    if current.agreement_code != target.agreement_code:
        raise HTTPException(status_code=400, detail={"error_code": "VERSION_MISMATCH", "message": "Target version belongs to a different agreement.", "detail": None})

    # Mark current as superseded
    if current.status == "active":
        current.status = "superseded"

    # Re-activate target
    target.status = "active"
    target.validated_by = current_user.id
    target.validated_at = datetime.now(timezone.utc)

    await log_action(db, "agreement", target.id, "rolled_back", current_user.id,
                     before={"from_version": str(agreement_id)},
                     after={"to_version": str(target_version_id)},
                     ip_address=_ip(request))
    return target


# ── Employee Type Configs ────────────────────────────────────

@router.get("/agreements/{agreement_id}/employee-types", response_model=list[EmployeeTypeConfigOut])
async def list_employee_types(
    agreement_id: uuid.UUID,
    current_user: User = Depends(require_roles("reviewer")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(EmployeeTypeConfig)
        .where(EmployeeTypeConfig.agreement_id == agreement_id)
        .order_by(EmployeeTypeConfig.sort_order)
    )
    return result.scalars().all()


@router.post("/agreements/{agreement_id}/employee-types", response_model=EmployeeTypeConfigOut, status_code=201)
async def create_employee_type(
    agreement_id: uuid.UUID,
    body: EmployeeTypeConfigCreate,
    request: Request,
    current_user: User = Depends(require_roles("reviewer")),
    db: AsyncSession = Depends(get_db),
):
    et = EmployeeTypeConfig(agreement_id=agreement_id, **body.model_dump())
    db.add(et)
    await db.flush()
    await log_action(db, "employee_type_config", et.id, "created", current_user.id,
                     after=body.model_dump(), ip_address=_ip(request))
    return et


@router.get("/agreements/{agreement_id}/employee-types/{et_id}", response_model=EmployeeTypeConfigOut)
async def get_employee_type(
    agreement_id: uuid.UUID,
    et_id: uuid.UUID,
    current_user: User = Depends(require_roles("reviewer")),
    db: AsyncSession = Depends(get_db),
):
    et = await db.get(EmployeeTypeConfig, et_id)
    if et is None or et.agreement_id != agreement_id:
        raise HTTPException(status_code=404, detail={"error_code": "ET_NOT_FOUND", "message": "Employee type config not found.", "detail": None})
    return et


@router.patch("/agreements/{agreement_id}/employee-types/{et_id}", response_model=EmployeeTypeConfigOut)
async def update_employee_type(
    agreement_id: uuid.UUID,
    et_id: uuid.UUID,
    body: EmployeeTypeConfigUpdate,
    request: Request,
    current_user: User = Depends(require_roles("reviewer")),
    db: AsyncSession = Depends(get_db),
):
    et = await db.get(EmployeeTypeConfig, et_id)
    if et is None or et.agreement_id != agreement_id:
        raise HTTPException(status_code=404, detail={"error_code": "ET_NOT_FOUND", "message": "Employee type config not found.", "detail": None})
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(et, field, value)
    await log_action(db, "employee_type_config", et.id, "updated", current_user.id,
                     after=body.model_dump(exclude_unset=True), ip_address=_ip(request))
    return et


@router.delete("/agreements/{agreement_id}/employee-types/{et_id}", status_code=204)
async def delete_employee_type(
    agreement_id: uuid.UUID,
    et_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    et = await db.get(EmployeeTypeConfig, et_id)
    if et is None or et.agreement_id != agreement_id:
        raise HTTPException(status_code=404, detail={"error_code": "ET_NOT_FOUND", "message": "Employee type config not found.", "detail": None})
    await db.delete(et)
    await log_action(db, "employee_type_config", et_id, "deleted", current_user.id, ip_address=_ip(request))


# ── Rule Lines ───────────────────────────────────────────────

@router.get("/agreements/{agreement_id}/employee-types/{et_id}/rule-lines", response_model=list[RuleLineOut])
async def list_rule_lines(
    agreement_id: uuid.UUID,
    et_id: uuid.UUID,
    current_user: User = Depends(require_roles("reviewer")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(RuleLine)
        .options(selectinload(RuleLine.sub_rules))
        .where(
            RuleLine.emp_type_config_id == et_id,
            RuleLine.parent_rule_id == None,
        )
        .order_by(RuleLine.sort_order)
    )
    return result.scalars().all()


@router.post("/agreements/{agreement_id}/employee-types/{et_id}/rule-lines", response_model=RuleLineOut, status_code=201)
async def create_rule_line(
    agreement_id: uuid.UUID,
    et_id: uuid.UUID,
    body: RuleLineCreate,
    request: Request,
    current_user: User = Depends(require_roles("reviewer")),
    db: AsyncSession = Depends(get_db),
):
    rule = RuleLine(emp_type_config_id=et_id, **body.model_dump())
    db.add(rule)
    await db.flush()
    await log_action(db, "rule_line", rule.id, "created", current_user.id,
                     after=body.model_dump(), ip_address=_ip(request))
    return rule


# ── Allowances ───────────────────────────────────────────────

@router.get("/agreements/{agreement_id}/allowances", response_model=list[AgreementAllowanceOut])
async def list_allowances(
    agreement_id: uuid.UUID,
    current_user: User = Depends(require_roles("reviewer")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AgreementAllowance)
        .where(AgreementAllowance.agreement_id == agreement_id)
        .order_by(AgreementAllowance.sort_order)
    )
    return result.scalars().all()


@router.post("/agreements/{agreement_id}/allowances", response_model=AgreementAllowanceOut, status_code=201)
async def create_allowance(
    agreement_id: uuid.UUID,
    body: AgreementAllowanceCreate,
    request: Request,
    current_user: User = Depends(require_roles("reviewer")),
    db: AsyncSession = Depends(get_db),
):
    allowance = AgreementAllowance(agreement_id=agreement_id, **body.model_dump())
    db.add(allowance)
    await db.flush()
    await log_action(db, "allowance", allowance.id, "created", current_user.id,
                     after=body.model_dump(), ip_address=_ip(request))
    return allowance


@router.patch("/allowances/{allowance_id}", response_model=AgreementAllowanceOut)
async def update_allowance(
    allowance_id: uuid.UUID,
    body: AgreementAllowanceUpdate,
    request: Request,
    current_user: User = Depends(require_roles("reviewer")),
    db: AsyncSession = Depends(get_db),
):
    allowance = await db.get(AgreementAllowance, allowance_id)
    if allowance is None:
        raise HTTPException(status_code=404, detail={"error_code": "ALLOWANCE_NOT_FOUND", "message": "Allowance not found.", "detail": None})
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(allowance, field, value)
    await log_action(db, "allowance", allowance.id, "updated", current_user.id,
                     after=body.model_dump(exclude_unset=True), ip_address=_ip(request))
    return allowance


@router.delete("/allowances/{allowance_id}", status_code=204)
async def delete_allowance(
    allowance_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    allowance = await db.get(AgreementAllowance, allowance_id)
    if allowance is None:
        raise HTTPException(status_code=404, detail={"error_code": "ALLOWANCE_NOT_FOUND", "message": "Allowance not found.", "detail": None})
    await db.delete(allowance)
    await log_action(db, "allowance", allowance_id, "deleted", current_user.id, ip_address=_ip(request))


# ── Leave Paycodes ───────────────────────────────────────────

@router.get("/agreements/{agreement_id}/leave-paycodes", response_model=list[AgreementLeavePaycodeOut])
async def list_leave_paycodes(
    agreement_id: uuid.UUID,
    current_user: User = Depends(require_roles("reviewer")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AgreementLeavePaycode)
        .where(AgreementLeavePaycode.agreement_id == agreement_id)
        .order_by(AgreementLeavePaycode.sort_order)
    )
    return result.scalars().all()


@router.post("/agreements/{agreement_id}/leave-paycodes", response_model=AgreementLeavePaycodeOut, status_code=201)
async def create_leave_paycode(
    agreement_id: uuid.UUID,
    body: AgreementLeavePaycodeCreate,
    request: Request,
    current_user: User = Depends(require_roles("reviewer")),
    db: AsyncSession = Depends(get_db),
):
    lp = AgreementLeavePaycode(agreement_id=agreement_id, **body.model_dump())
    db.add(lp)
    await db.flush()
    return lp


@router.patch("/leave-paycodes/{lp_id}", response_model=AgreementLeavePaycodeOut)
async def update_leave_paycode(
    lp_id: uuid.UUID,
    body: AgreementLeavePaycodeCreate,
    current_user: User = Depends(require_roles("reviewer")),
    db: AsyncSession = Depends(get_db),
):
    lp = await db.get(AgreementLeavePaycode, lp_id)
    if lp is None:
        raise HTTPException(status_code=404, detail={"error_code": "LEAVE_PAYCODE_NOT_FOUND", "message": "Leave paycode not found.", "detail": None})
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(lp, field, value)
    return lp


@router.delete("/leave-paycodes/{lp_id}", status_code=204)
async def delete_leave_paycode(
    lp_id: uuid.UUID,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    lp = await db.get(AgreementLeavePaycode, lp_id)
    if lp is None:
        raise HTTPException(status_code=404, detail={"error_code": "LEAVE_PAYCODE_NOT_FOUND", "message": "Leave paycode not found.", "detail": None})
    await db.delete(lp)


# ── Wage Table ───────────────────────────────────────────────

@router.get("/agreements/{agreement_id}/wage-table", response_model=list[WageGradeOut])
async def list_wage_grades(
    agreement_id: uuid.UUID,
    current_user: User = Depends(require_roles("reviewer")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WageGrade)
        .where(WageGrade.agreement_id == agreement_id)
        .order_by(WageGrade.sort_order)
    )
    return result.scalars().all()


@router.post("/agreements/{agreement_id}/wage-table", response_model=WageGradeOut, status_code=201)
async def create_wage_grade(
    agreement_id: uuid.UUID,
    body: WageGradeCreate,
    current_user: User = Depends(require_roles("reviewer")),
    db: AsyncSession = Depends(get_db),
):
    wg = WageGrade(agreement_id=agreement_id, **body.model_dump())
    db.add(wg)
    await db.flush()
    return wg


@router.patch("/wage-grades/{wg_id}", response_model=WageGradeOut)
async def update_wage_grade(
    wg_id: uuid.UUID,
    body: WageGradeUpdate,
    current_user: User = Depends(require_roles("reviewer")),
    db: AsyncSession = Depends(get_db),
):
    wg = await db.get(WageGrade, wg_id)
    if wg is None:
        raise HTTPException(status_code=404, detail={"error_code": "WAGE_GRADE_NOT_FOUND", "message": "Wage grade not found.", "detail": None})
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(wg, field, value)
    return wg


@router.delete("/wage-grades/{wg_id}", status_code=204)
async def delete_wage_grade(
    wg_id: uuid.UUID,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    wg = await db.get(WageGrade, wg_id)
    if wg is None:
        raise HTTPException(status_code=404, detail={"error_code": "WAGE_GRADE_NOT_FOUND", "message": "Wage grade not found.", "detail": None})
    await db.delete(wg)


# ── Kronos Config ────────────────────────────────────────────

@router.get("/agreements/{agreement_id}/kronos-config", response_model=Optional[KronosConfigOut])
async def get_kronos_config(
    agreement_id: uuid.UUID,
    current_user: User = Depends(require_roles("reviewer")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(KronosConfig).where(KronosConfig.agreement_id == agreement_id)
    )
    return result.scalar_one_or_none()


@router.post("/agreements/{agreement_id}/kronos-config", response_model=KronosConfigOut, status_code=201)
async def create_kronos_config(
    agreement_id: uuid.UUID,
    body: KronosConfigCreate,
    request: Request,
    current_user: User = Depends(require_roles("reviewer")),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(KronosConfig).where(KronosConfig.agreement_id == agreement_id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail={"error_code": "KRONOS_CONFIG_EXISTS", "message": "Kronos config already exists. Use PATCH.", "detail": None})
    kc = KronosConfig(agreement_id=agreement_id, **body.model_dump())
    db.add(kc)
    await db.flush()
    await log_action(db, "kronos_config", kc.id, "created", current_user.id,
                     after=body.model_dump(), ip_address=_ip(request))
    return kc


@router.patch("/agreements/{agreement_id}/kronos-config", response_model=KronosConfigOut)
async def update_kronos_config(
    agreement_id: uuid.UUID,
    body: KronosConfigUpdate,
    request: Request,
    current_user: User = Depends(require_roles("reviewer")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(KronosConfig).where(KronosConfig.agreement_id == agreement_id))
    kc = result.scalar_one_or_none()
    if kc is None:
        raise HTTPException(status_code=404, detail={"error_code": "KRONOS_CONFIG_NOT_FOUND", "message": "Kronos config not found.", "detail": None})
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(kc, field, value)
    await log_action(db, "kronos_config", kc.id, "updated", current_user.id,
                     after=body.model_dump(exclude_unset=True), ip_address=_ip(request))
    return kc


# ── Global Kronos Paycodes ───────────────────────────────────

@router.get("/paycodes", response_model=list[KronosPaycodeOut])
async def list_paycodes(
    current_user: User = Depends(require_roles("reviewer")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(KronosPaycode).order_by(KronosPaycode.paycode))
    return result.scalars().all()


@router.post("/paycodes", response_model=KronosPaycodeOut, status_code=201)
async def create_paycode(
    body: KronosPaycodeCreate,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    kp = KronosPaycode(**body.model_dump())
    db.add(kp)
    await db.flush()
    return kp


@router.patch("/paycodes/{paycode_id}", response_model=KronosPaycodeOut)
async def update_paycode(
    paycode_id: uuid.UUID,
    body: KronosPaycodeUpdate,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    kp = await db.get(KronosPaycode, paycode_id)
    if kp is None:
        raise HTTPException(status_code=404, detail={"error_code": "PAYCODE_NOT_FOUND", "message": "Paycode not found.", "detail": None})
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(kp, field, value)
    return kp


@router.delete("/paycodes/{paycode_id}", status_code=204)
async def delete_paycode(
    paycode_id: uuid.UUID,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    kp = await db.get(KronosPaycode, paycode_id)
    if kp is None:
        raise HTTPException(status_code=404, detail={"error_code": "PAYCODE_NOT_FOUND", "message": "Paycode not found.", "detail": None})
    await db.delete(kp)
