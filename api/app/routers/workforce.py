"""Workforce management router — Shyftmate endpoints."""
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.main import limiter
from app.models.user import User
from app.models.workforce import (
    Announcement,
    ClockEvent,
    EmployeeAvailability,
    EmployeeProfile,
    LeaveBalance,
    LeaveRequest,
    LeaveType,
    Message,
    MessageGroup,
    Roster,
    Shift,
    ShiftSwap,
    Timesheet,
    TimesheetEntry,
)
from app.schemas.workforce import (
    AnnouncementCreate,
    AnnouncementOut,
    ClockEventCreate,
    ClockEventOut,
    EmployeeProfileCreate,
    EmployeeProfileOut,
    EmployeeProfileUpdate,
    LeaveActionIn,
    LeaveBalanceOut,
    LeaveRequestCreate,
    LeaveRequestOut,
    LeaveTypeCreate,
    LeaveTypeOut,
    LeaveTypeUpdate,
    MessageCreate,
    MessageOut,
    RosterCreate,
    RosterOut,
    RosterUpdate,
    ShiftCreate,
    ShiftOut,
    ShiftUpdate,
    TimesheetEntryOut,
    TimesheetEntryUpdate,
    TimesheetOut,
    TimesheetUpdate,
)

router = APIRouter()


def _ip(request: Request) -> Optional[str]:
    return request.client.host if request.client else None


# ── Clock Events ─────────────────────────────────────────────

@router.post("/clock", response_model=ClockEventOut, status_code=status.HTTP_201_CREATED, summary="Record clock event")
@limiter.limit("2/minute")
async def record_clock_event(
    body: ClockEventCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    event = ClockEvent(
        user_id=current_user.id,
        event_type=body.event_type,
        recorded_at=body.recorded_at,
        gps_lat=body.gps_lat,
        gps_lng=body.gps_lng,
        method=body.method,
        shift_id=body.shift_id,
        notes=body.notes,
        created_at=datetime.now(timezone.utc),
    )
    db.add(event)
    await db.flush()
    return event


# ── Timesheets ───────────────────────────────────────────────

@router.get("/timesheets", response_model=list[TimesheetOut], summary="List timesheets")
async def list_timesheets(
    user_id: Optional[uuid.UUID] = Query(None),
    ts_status: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Timesheet)

    from app.dependencies import ROLE_HIERARCHY
    is_manager = ROLE_HIERARCHY.get(current_user.role, 99) <= ROLE_HIERARCHY.get("manager", 99)

    if not is_manager:
        # Employees can only see their own
        query = query.where(Timesheet.user_id == current_user.id)
    elif user_id:
        query = query.where(Timesheet.user_id == user_id)

    if ts_status:
        query = query.where(Timesheet.status == ts_status)

    query = query.order_by(Timesheet.period_start.desc()).offset((page - 1) * limit).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/timesheets/{ts_id}", response_model=TimesheetOut, summary="Get timesheet")
async def get_timesheet(
    ts_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ts = await db.get(Timesheet, ts_id)
    if ts is None:
        raise HTTPException(status_code=404, detail={"error_code": "TIMESHEET_NOT_FOUND", "message": "Timesheet not found.", "detail": None})

    from app.dependencies import ROLE_HIERARCHY
    is_manager = ROLE_HIERARCHY.get(current_user.role, 99) <= ROLE_HIERARCHY.get("manager", 99)
    if not is_manager and ts.user_id != current_user.id:
        raise HTTPException(status_code=403, detail={"error_code": "AUTH_INSUFFICIENT_ROLE", "message": "Access denied.", "detail": None})
    return ts


@router.patch("/timesheets/{ts_id}", response_model=TimesheetOut, summary="Update timesheet")
async def update_timesheet(
    ts_id: uuid.UUID,
    body: TimesheetUpdate,
    current_user: User = Depends(require_roles("manager")),
    db: AsyncSession = Depends(get_db),
):
    ts = await db.get(Timesheet, ts_id)
    if ts is None:
        raise HTTPException(status_code=404, detail={"error_code": "TIMESHEET_NOT_FOUND", "message": "Timesheet not found.", "detail": None})
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(ts, field, value)
    return ts


@router.post("/timesheets/{ts_id}/submit", response_model=TimesheetOut, summary="Submit timesheet")
async def submit_timesheet(
    ts_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ts = await db.get(Timesheet, ts_id)
    if ts is None:
        raise HTTPException(status_code=404, detail={"error_code": "TIMESHEET_NOT_FOUND", "message": "Timesheet not found.", "detail": None})
    if ts.user_id != current_user.id:
        raise HTTPException(status_code=403, detail={"error_code": "AUTH_INSUFFICIENT_ROLE", "message": "Access denied.", "detail": None})
    if ts.status != "draft":
        raise HTTPException(status_code=400, detail={"error_code": "TIMESHEET_INVALID_STATUS", "message": "Only draft timesheets can be submitted.", "detail": None})
    ts.status = "submitted"
    ts.submitted_at = datetime.now(timezone.utc)
    return ts


@router.post("/timesheets/{ts_id}/approve", response_model=TimesheetOut, summary="Approve timesheet")
async def approve_timesheet(
    ts_id: uuid.UUID,
    current_user: User = Depends(require_roles("manager")),
    db: AsyncSession = Depends(get_db),
):
    ts = await db.get(Timesheet, ts_id)
    if ts is None:
        raise HTTPException(status_code=404, detail={"error_code": "TIMESHEET_NOT_FOUND", "message": "Timesheet not found.", "detail": None})
    if ts.status != "submitted":
        raise HTTPException(status_code=400, detail={"error_code": "TIMESHEET_INVALID_STATUS", "message": "Only submitted timesheets can be approved.", "detail": None})
    ts.status = "approved"
    ts.approved_by = current_user.id
    ts.approved_at = datetime.now(timezone.utc)
    return ts


# ── Leave Types ──────────────────────────────────────────────

@router.get("/leave-types", response_model=list[LeaveTypeOut], summary="List leave types")
async def list_leave_types(
    org_id: Optional[uuid.UUID] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    effective_org_id = org_id or current_user.org_id
    query = select(LeaveType)
    if effective_org_id:
        query = query.where(LeaveType.org_id == effective_org_id)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/leave-types", response_model=LeaveTypeOut, status_code=201, summary="Create leave type")
async def create_leave_type(
    body: LeaveTypeCreate,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    lt = LeaveType(**body.model_dump())
    db.add(lt)
    await db.flush()
    return lt


@router.patch("/leave-types/{lt_id}", response_model=LeaveTypeOut, summary="Update leave type")
async def update_leave_type(
    lt_id: uuid.UUID,
    body: LeaveTypeUpdate,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    lt = await db.get(LeaveType, lt_id)
    if lt is None:
        raise HTTPException(status_code=404, detail={"error_code": "LEAVE_TYPE_NOT_FOUND", "message": "Leave type not found.", "detail": None})
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(lt, field, value)
    return lt


# ── Leave Balances ───────────────────────────────────────────

@router.get("/leave-balances", response_model=list[LeaveBalanceOut], summary="Get leave balances")
async def get_leave_balances(
    user_id: Optional[uuid.UUID] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.dependencies import ROLE_HIERARCHY
    is_manager = ROLE_HIERARCHY.get(current_user.role, 99) <= ROLE_HIERARCHY.get("manager", 99)
    effective_user_id = user_id if (is_manager and user_id) else current_user.id
    result = await db.execute(select(LeaveBalance).where(LeaveBalance.user_id == effective_user_id))
    return result.scalars().all()


# ── Leave Requests ───────────────────────────────────────────

@router.get("/leave-requests", response_model=list[LeaveRequestOut], summary="List leave requests")
async def list_leave_requests(
    req_status: Optional[str] = Query(None, alias="status"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.dependencies import ROLE_HIERARCHY
    is_manager = ROLE_HIERARCHY.get(current_user.role, 99) <= ROLE_HIERARCHY.get("manager", 99)

    query = select(LeaveRequest)
    if not is_manager:
        query = query.where(LeaveRequest.user_id == current_user.id)
    if req_status:
        query = query.where(LeaveRequest.status == req_status)

    result = await db.execute(query.order_by(LeaveRequest.created_at.desc()))
    return result.scalars().all()


@router.post("/leave-requests", response_model=LeaveRequestOut, status_code=201, summary="Create leave request")
async def create_leave_request(
    body: LeaveRequestCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lr = LeaveRequest(user_id=current_user.id, **body.model_dump())
    db.add(lr)
    await db.flush()
    return lr


@router.post("/leave-requests/{lr_id}/approve", response_model=LeaveRequestOut, summary="Approve leave request")
async def approve_leave_request(
    lr_id: uuid.UUID,
    body: LeaveActionIn,
    current_user: User = Depends(require_roles("manager")),
    db: AsyncSession = Depends(get_db),
):
    lr = await db.get(LeaveRequest, lr_id)
    if lr is None:
        raise HTTPException(status_code=404, detail={"error_code": "LEAVE_REQUEST_NOT_FOUND", "message": "Leave request not found.", "detail": None})
    lr.status = "approved"
    lr.manager_id = current_user.id
    lr.managed_at = datetime.now(timezone.utc)
    return lr


@router.post("/leave-requests/{lr_id}/reject", response_model=LeaveRequestOut, summary="Reject leave request")
async def reject_leave_request(
    lr_id: uuid.UUID,
    body: LeaveActionIn,
    current_user: User = Depends(require_roles("manager")),
    db: AsyncSession = Depends(get_db),
):
    lr = await db.get(LeaveRequest, lr_id)
    if lr is None:
        raise HTTPException(status_code=404, detail={"error_code": "LEAVE_REQUEST_NOT_FOUND", "message": "Leave request not found.", "detail": None})
    lr.status = "rejected"
    lr.manager_id = current_user.id
    lr.managed_at = datetime.now(timezone.utc)
    return lr


@router.post("/leave-requests/{lr_id}/cancel", response_model=LeaveRequestOut, summary="Cancel leave request")
async def cancel_leave_request(
    lr_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lr = await db.get(LeaveRequest, lr_id)
    if lr is None:
        raise HTTPException(status_code=404, detail={"error_code": "LEAVE_REQUEST_NOT_FOUND", "message": "Leave request not found.", "detail": None})
    if lr.user_id != current_user.id:
        raise HTTPException(status_code=403, detail={"error_code": "AUTH_INSUFFICIENT_ROLE", "message": "Can only cancel your own leave requests.", "detail": None})
    if lr.status not in ("pending",):
        raise HTTPException(status_code=400, detail={"error_code": "LEAVE_REQUEST_INVALID_STATUS", "message": "Only pending leave requests can be cancelled.", "detail": None})
    lr.status = "cancelled"
    return lr


# ── Rosters ──────────────────────────────────────────────────

@router.get("/rosters", response_model=list[RosterOut], summary="List rosters")
async def list_rosters(
    org_id: Optional[uuid.UUID] = Query(None),
    roster_status: Optional[str] = Query(None, alias="status"),
    current_user: User = Depends(require_roles("manager")),
    db: AsyncSession = Depends(get_db),
):
    effective_org_id = org_id or current_user.org_id
    query = select(Roster)
    if effective_org_id:
        query = query.where(Roster.org_id == effective_org_id)
    if roster_status:
        query = query.where(Roster.status == roster_status)
    result = await db.execute(query.order_by(Roster.week_start.desc()))
    return result.scalars().all()


@router.post("/rosters", response_model=RosterOut, status_code=201, summary="Create roster")
async def create_roster(
    body: RosterCreate,
    current_user: User = Depends(require_roles("manager")),
    db: AsyncSession = Depends(get_db),
):
    roster = Roster(**body.model_dump(), created_by=current_user.id)
    db.add(roster)
    await db.flush()
    return roster


@router.get("/rosters/{roster_id}", response_model=RosterOut, summary="Get roster")
async def get_roster(
    roster_id: uuid.UUID,
    current_user: User = Depends(require_roles("manager")),
    db: AsyncSession = Depends(get_db),
):
    roster = await db.get(Roster, roster_id)
    if roster is None:
        raise HTTPException(status_code=404, detail={"error_code": "ROSTER_NOT_FOUND", "message": "Roster not found.", "detail": None})
    return roster


@router.patch("/rosters/{roster_id}", response_model=RosterOut, summary="Update roster")
async def update_roster(
    roster_id: uuid.UUID,
    body: RosterUpdate,
    current_user: User = Depends(require_roles("manager")),
    db: AsyncSession = Depends(get_db),
):
    roster = await db.get(Roster, roster_id)
    if roster is None:
        raise HTTPException(status_code=404, detail={"error_code": "ROSTER_NOT_FOUND", "message": "Roster not found.", "detail": None})
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(roster, field, value)
    return roster


@router.post("/rosters/{roster_id}/publish", response_model=RosterOut, summary="Publish roster")
async def publish_roster(
    roster_id: uuid.UUID,
    current_user: User = Depends(require_roles("manager")),
    db: AsyncSession = Depends(get_db),
):
    roster = await db.get(Roster, roster_id)
    if roster is None:
        raise HTTPException(status_code=404, detail={"error_code": "ROSTER_NOT_FOUND", "message": "Roster not found.", "detail": None})
    roster.status = "published"
    roster.published_at = datetime.now(timezone.utc)
    return roster


# ── Shifts ───────────────────────────────────────────────────

@router.get("/rosters/{roster_id}/shifts", response_model=list[ShiftOut], summary="List shifts")
async def list_shifts(
    roster_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Shift).where(Shift.roster_id == roster_id).order_by(Shift.start_datetime))
    return result.scalars().all()


@router.post("/rosters/{roster_id}/shifts", response_model=ShiftOut, status_code=201, summary="Create shift")
async def create_shift(
    roster_id: uuid.UUID,
    body: ShiftCreate,
    current_user: User = Depends(require_roles("manager")),
    db: AsyncSession = Depends(get_db),
):
    shift = Shift(roster_id=roster_id, **body.model_dump())
    db.add(shift)
    await db.flush()
    return shift


@router.patch("/shifts/{shift_id}", response_model=ShiftOut, summary="Update shift")
async def update_shift(
    shift_id: uuid.UUID,
    body: ShiftUpdate,
    current_user: User = Depends(require_roles("manager")),
    db: AsyncSession = Depends(get_db),
):
    shift = await db.get(Shift, shift_id)
    if shift is None:
        raise HTTPException(status_code=404, detail={"error_code": "SHIFT_NOT_FOUND", "message": "Shift not found.", "detail": None})
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(shift, field, value)
    return shift


# ── Announcements ────────────────────────────────────────────

@router.get("/announcements", response_model=list[AnnouncementOut], summary="List announcements")
async def list_announcements(
    org_id: Optional[uuid.UUID] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    effective_org_id = org_id or current_user.org_id
    query = select(Announcement)
    if effective_org_id:
        query = query.where(Announcement.org_id == effective_org_id)
    result = await db.execute(query.order_by(Announcement.created_at.desc()))
    return result.scalars().all()


@router.post("/announcements", response_model=AnnouncementOut, status_code=201, summary="Create announcement")
async def create_announcement(
    body: AnnouncementCreate,
    current_user: User = Depends(require_roles("manager")),
    db: AsyncSession = Depends(get_db),
):
    if current_user.org_id is None:
        raise HTTPException(status_code=400, detail={"error_code": "NO_ORG", "message": "User must belong to an organisation.", "detail": None})
    announcement = Announcement(org_id=current_user.org_id, created_by=current_user.id, **body.model_dump())
    db.add(announcement)
    await db.flush()
    return announcement


# ── Messages ─────────────────────────────────────────────────

@router.get("/messages", response_model=list[MessageOut], summary="List messages")
async def list_messages(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Message)
        .where(
            (Message.recipient_id == current_user.id) | (Message.sender_id == current_user.id)
        )
        .order_by(Message.created_at.desc())
        .limit(100)
    )
    return result.scalars().all()


@router.post("/messages", response_model=MessageOut, status_code=201, summary="Send message")
async def send_message(
    body: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.org_id is None:
        raise HTTPException(status_code=400, detail={"error_code": "NO_ORG", "message": "User must belong to an organisation.", "detail": None})
    message = Message(
        org_id=current_user.org_id,
        sender_id=current_user.id,
        recipient_id=body.recipient_id,
        group_id=body.group_id,
        body=body.body,
        created_at=datetime.now(timezone.utc),
    )
    db.add(message)
    await db.flush()
    return message


# ── Shift Swaps ──────────────────────────────────────────────

@router.get("/shift-swaps", response_model=list[dict])
async def list_shift_swaps(
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(ShiftSwap).where(
        or_(
            ShiftSwap.requesting_user_id == current_user.id,
            ShiftSwap.covering_user_id == current_user.id,
        )
    )
    if status:
        q = q.where(ShiftSwap.status == status)
    result = await db.execute(q.order_by(ShiftSwap.created_at.desc()))
    swaps = result.scalars().all()
    return [{"id": str(s.id), "shift_id": str(s.shift_id), "status": s.status,
             "requesting_user_id": str(s.requesting_user_id),
             "covering_user_id": str(s.covering_user_id) if s.covering_user_id else None,
             "created_at": s.created_at.isoformat()} for s in swaps]

@router.post("/shift-swaps", status_code=201, response_model=dict)
async def create_shift_swap(
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    swap = ShiftSwap(
        shift_id=uuid.UUID(body["shift_id"]),
        requesting_user_id=current_user.id,
        covering_user_id=uuid.UUID(body["covering_user_id"]) if body.get("covering_user_id") else None,
        status="pending",
    )
    db.add(swap)
    await db.commit()
    await db.refresh(swap)
    return {"id": str(swap.id), "status": swap.status}

@router.post("/shift-swaps/{swap_id}/approve", response_model=dict)
async def approve_shift_swap(
    swap_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("manager")),
):
    result = await db.execute(select(ShiftSwap).where(ShiftSwap.id == swap_id))
    swap = result.scalar_one_or_none()
    if not swap:
        raise HTTPException(404, "Shift swap not found")
    swap.status = "approved"
    swap.manager_id = current_user.id
    swap.resolved_at = datetime.now(timezone.utc)
    # Reassign the shift
    shift_result = await db.execute(select(Shift).where(Shift.id == swap.shift_id))
    shift = shift_result.scalar_one_or_none()
    if shift and swap.covering_user_id:
        shift.assigned_user_id = swap.covering_user_id
    await db.commit()
    return {"id": str(swap.id), "status": swap.status}

@router.post("/shift-swaps/{swap_id}/reject", response_model=dict)
async def reject_shift_swap(
    swap_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("manager")),
):
    result = await db.execute(select(ShiftSwap).where(ShiftSwap.id == swap_id))
    swap = result.scalar_one_or_none()
    if not swap:
        raise HTTPException(404, "Shift swap not found")
    swap.status = "rejected"
    swap.manager_id = current_user.id
    swap.resolved_at = datetime.now(timezone.utc)
    await db.commit()
    return {"id": str(swap.id), "status": swap.status}


# ── Message Groups ────────────────────────────────────────────

@router.get("/message-groups", response_model=list[dict])
async def list_message_groups(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(MessageGroup).where(MessageGroup.org_id == current_user.org_id)
        .order_by(MessageGroup.name)
    )
    groups = result.scalars().all()
    return [{"id": str(g.id), "name": g.name, "member_ids": [str(m) for m in (g.member_ids or [])], "created_at": g.created_at.isoformat()} for g in groups]

@router.post("/message-groups", status_code=201, response_model=dict)
async def create_message_group(
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("manager")),
):
    group = MessageGroup(
        org_id=current_user.org_id,
        name=body["name"],
        member_ids=[uuid.UUID(m) for m in body.get("member_ids", [])],
    )
    db.add(group)
    await db.commit()
    await db.refresh(group)
    return {"id": str(group.id), "name": group.name}

@router.patch("/message-groups/{group_id}", response_model=dict)
async def update_message_group(
    group_id: uuid.UUID,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("manager")),
):
    result = await db.execute(select(MessageGroup).where(MessageGroup.id == group_id, MessageGroup.org_id == current_user.org_id))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(404, "Message group not found")
    if "name" in body:
        group.name = body["name"]
    if "member_ids" in body:
        group.member_ids = [uuid.UUID(m) for m in body["member_ids"]]
    await db.commit()
    return {"id": str(group.id), "name": group.name}

@router.delete("/message-groups/{group_id}", status_code=204)
async def delete_message_group(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("manager")),
):
    result = await db.execute(select(MessageGroup).where(MessageGroup.id == group_id, MessageGroup.org_id == current_user.org_id))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(404, "Message group not found")
    await db.delete(group)
    await db.commit()


# ── Reports ──────────────────────────────────────────────────

@router.get("/reports/labour-cost", summary="Labour cost report")
async def report_labour_cost(
    from_date: str = Query(...),
    to_date: str = Query(...),
    org_id: Optional[uuid.UUID] = Query(None),
    location_id: Optional[uuid.UUID] = Query(None),
    current_user: User = Depends(require_roles("manager")),
    db: AsyncSession = Depends(get_db),
):
    effective_org_id = org_id or current_user.org_id
    query = select(Timesheet).where(
        Timesheet.org_id == effective_org_id,
        Timesheet.period_start >= from_date,
        Timesheet.period_end <= to_date,
    )
    if location_id:
        query = query.where(Timesheet.location_id == location_id)
    result = await db.execute(query)
    timesheets = result.scalars().all()

    total_hours = sum(float(ts.total_hours or 0) for ts in timesheets)
    total_cost = sum(float(ts.total_cost or 0) for ts in timesheets)

    return {
        "from_date": from_date,
        "to_date": to_date,
        "total_timesheets": len(timesheets),
        "total_hours": round(total_hours, 2),
        "total_cost": round(total_cost, 2),
    }


@router.get("/reports/overtime", summary="Overtime report")
async def report_overtime(
    from_date: str = Query(...),
    to_date: str = Query(...),
    current_user: User = Depends(require_roles("manager")),
    db: AsyncSession = Depends(get_db),
):
    return {
        "from_date": from_date,
        "to_date": to_date,
        "message": "Overtime report — aggregate from timesheet entries with overtime_hours > 0.",
        "data": [],
    }


@router.get("/reports/leave-liability", summary="Leave liability report")
async def report_leave_liability(
    current_user: User = Depends(require_roles("manager")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LeaveBalance).where(
            LeaveBalance.balance_days > 0
        )
    )
    balances = result.scalars().all()
    total_liability_days = sum(float(b.balance_days) for b in balances)

    return {
        "total_employees_with_balance": len(balances),
        "total_balance_days": round(total_liability_days, 2),
        "data": [LeaveBalanceOut.model_validate(b) for b in balances],
    }


@router.get("/reports/award-compliance", summary="Award compliance report")
async def report_award_compliance(
    timesheet_id: uuid.UUID = Query(...),
    current_user: User = Depends(require_roles("manager")),
    db: AsyncSession = Depends(get_db),
):
    ts = await db.get(Timesheet, timesheet_id)
    if ts is None:
        raise HTTPException(status_code=404, detail={"error_code": "TIMESHEET_NOT_FOUND", "message": "Timesheet not found.", "detail": None})

    result = await db.execute(
        select(TimesheetEntry).where(TimesheetEntry.timesheet_id == timesheet_id)
    )
    entries = result.scalars().all()

    violations = []
    for entry in entries:
        if entry.overtime_hours and entry.overtime_hours > 0 and not entry.penalty_multiplier:
            violations.append({
                "entry_id": str(entry.id),
                "date": str(entry.date),
                "issue": "Overtime hours present but no penalty multiplier applied.",
            })

    return {
        "timesheet_id": str(timesheet_id),
        "period_start": str(ts.period_start),
        "period_end": str(ts.period_end),
        "total_entries": len(entries),
        "violations": violations,
        "compliant": len(violations) == 0,
    }


# ── Live Clock-In ─────────────────────────────────────────────

@router.get("/clock/live", response_model=list[dict], summary="List currently clocked-in users")
async def get_live_clock_ins(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("manager")),
):
    """Return all users currently clocked in (clock_in event today with no subsequent clock_out)."""
    from sqlalchemy import func as sqlfunc

    today = datetime.now(timezone.utc).date()

    # All clock_in events today for users in this org (join through User for org filtering)
    clock_in_result = await db.execute(
        select(ClockEvent)
        .join(User, ClockEvent.user_id == User.id)
        .where(
            User.org_id == current_user.org_id,
            ClockEvent.event_type == "clock_in",
            sqlfunc.date(ClockEvent.recorded_at) == today,
        )
        .order_by(ClockEvent.recorded_at.desc())
    )
    clock_ins = clock_in_result.scalars().all()

    # Users who have a clock_out today (exclude them)
    clock_out_result = await db.execute(
        select(ClockEvent.user_id)
        .join(User, ClockEvent.user_id == User.id)
        .where(
            User.org_id == current_user.org_id,
            ClockEvent.event_type == "clock_out",
            sqlfunc.date(ClockEvent.recorded_at) == today,
        )
    )
    clocked_out_user_ids = {row[0] for row in clock_out_result.all()}

    active = [ci for ci in clock_ins if ci.user_id not in clocked_out_user_ids]

    # Deduplicate by user_id — keep only the latest clock_in per user
    seen: set[uuid.UUID] = set()
    unique_active = []
    for ci in active:
        if ci.user_id not in seen:
            seen.add(ci.user_id)
            unique_active.append(ci)

    results = []
    for ci in unique_active:
        user_result = await db.execute(select(User).where(User.id == ci.user_id))
        user = user_result.scalar_one_or_none()
        location: Optional[Location] = None
        if ci.location_id:
            loc_result = await db.execute(select(Location).where(Location.id == ci.location_id))
            location = loc_result.scalar_one_or_none()
        if user:
            results.append({
                "user_id": str(user.id),
                "user_name": f"{user.first_name or ''} {user.last_name or ''}".strip() or user.email,
                "avatar_url": getattr(user, "avatar_url", None),
                "location_id": str(ci.location_id) if ci.location_id else None,
                "location_name": location.name if location else "Unknown",
                "clocked_in_at": ci.recorded_at.isoformat(),
                "shift_end": None,
            })
    return results
