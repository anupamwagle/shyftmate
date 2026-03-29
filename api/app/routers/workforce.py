"""Workforce management router — Shyftmate endpoints."""
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import and_, cast, func, or_, select
from sqlalchemy.dialects.postgresql import DATE
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import cache_del, cache_get, cache_set
from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.limiter import limiter
from app.models.audit import AuditLog
from app.models.user import User
from app.models.workforce import (
    Announcement,
    ClockEvent,
    EmployeeAvailability,
    EmployeeProfile,
    LeaveBalance,
    LeaveRequest,
    LeaveType,
    Location,
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
    DashboardStatsOut,
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
    LocationCreate,
    LocationOut,
    LocationUpdate,
    MessageCreate,
    MessageOut,
    RosterCreate,
    RosterOut,
    RosterUpdate,
    ShiftCreate,
    ShiftFlatCreate,
    ShiftFlatOut,
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


# ── Locations (Admin) ────────────────────────────────────────

@router.get("/admin/locations", response_model=list[LocationOut], summary="List locations")
async def list_locations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = current_user.org_id
    query = select(Location)
    if org_id:
        query = query.where(Location.org_id == org_id)
    query = query.order_by(Location.name)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/admin/locations", response_model=LocationOut, status_code=201, summary="Create location")
async def create_location(
    body: LocationCreate,
    request: Request,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    if not current_user.org_id:
        raise HTTPException(status_code=400, detail={"error_code": "NO_ORG", "message": "User has no organisation.", "detail": None})
    loc = Location(org_id=current_user.org_id, **body.model_dump())
    db.add(loc)
    await db.flush()
    await db.refresh(loc)
    db.add(AuditLog(
        entity_type="location", entity_id=loc.id,
        action="create", actor=current_user.id,
        after_payload={"name": loc.name}, ip_address=_ip(request),
        created_at=datetime.now(timezone.utc),
    ))
    await db.commit()
    return loc


@router.patch("/admin/locations/{loc_id}", response_model=LocationOut, summary="Update location")
async def update_location(
    loc_id: uuid.UUID,
    body: LocationUpdate,
    request: Request,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    loc = await db.get(Location, loc_id)
    if loc is None:
        raise HTTPException(status_code=404, detail={"error_code": "LOCATION_NOT_FOUND", "message": "Location not found.", "detail": None})
    changes = body.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(loc, field, value)
    db.add(AuditLog(
        entity_type="location", entity_id=loc.id,
        action="update", actor=current_user.id,
        after_payload=changes, ip_address=_ip(request),
        created_at=datetime.now(timezone.utc),
    ))
    await db.commit()
    await db.refresh(loc)
    return loc


@router.delete("/admin/locations/{loc_id}", status_code=204, summary="Delete location")
async def delete_location(
    loc_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    loc = await db.get(Location, loc_id)
    if loc is None:
        raise HTTPException(status_code=404, detail={"error_code": "LOCATION_NOT_FOUND", "message": "Location not found.", "detail": None})
    db.add(AuditLog(
        entity_type="location", entity_id=loc.id,
        action="delete", actor=current_user.id,
        before_payload={"name": loc.name}, ip_address=_ip(request),
        created_at=datetime.now(timezone.utc),
    ))
    await db.delete(loc)
    await db.commit()


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
    if not current_user.org_id:
        raise HTTPException(status_code=400, detail={"error_code": "NO_ORG", "message": "User has no organisation.", "detail": None})
    lt = LeaveType(org_id=current_user.org_id, **body.model_dump())
    db.add(lt)
    await db.flush()
    await db.refresh(lt)
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


@router.delete("/leave-types/{lt_id}", status_code=204, summary="Delete leave type")
async def delete_leave_type(
    lt_id: uuid.UUID,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    lt = await db.get(LeaveType, lt_id)
    if lt is None:
        raise HTTPException(status_code=404, detail={"error_code": "LEAVE_TYPE_NOT_FOUND", "message": "Leave type not found.", "detail": None})
    await db.delete(lt)
    return None


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


# ── Messages Channels (backed by MessageGroups) ───────────────

@router.get("/messages/channels", summary="List message channels")
async def list_message_channels(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.org_id is None:
        return []
    result = await db.execute(
        select(MessageGroup)
        .where(MessageGroup.org_id == current_user.org_id)
        .order_by(MessageGroup.name)
    )
    groups = result.scalars().all()

    # Ensure a "general" channel always exists
    if not groups:
        general = MessageGroup(
            org_id=current_user.org_id,
            name="general",
            member_ids=[],
        )
        db.add(general)
        await db.flush()
        groups = [general]

    channels = []
    for g in groups:
        # Get last message for this channel
        last_msg_result = await db.execute(
            select(Message)
            .where(Message.group_id == g.id)
            .order_by(Message.created_at.desc())
            .limit(1)
        )
        last_msg = last_msg_result.scalar_one_or_none()
        channels.append({
            "id": str(g.id),
            "name": g.name,
            "type": "general" if g.name == "general" else "team",
            "unread_count": 0,
            "last_message": last_msg.body if last_msg else None,
            "last_message_at": last_msg.created_at.isoformat() if last_msg else None,
        })
    return channels


@router.get("/messages/channels/{channel_id}/messages", summary="List messages in channel")
async def list_channel_messages(
    channel_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    msgs_result = await db.execute(
        select(Message, User.first_name, User.last_name, User.avatar_url)
        .join(User, Message.sender_id == User.id)
        .where(Message.group_id == channel_id)
        .order_by(Message.created_at.asc())
        .limit(200)
    )
    rows = msgs_result.all()
    return [
        {
            "id": str(msg.id),
            "org_id": str(msg.org_id),
            "sender_id": str(msg.sender_id),
            "sender_name": f"{first_name} {last_name}".strip(),
            "sender_avatar": avatar_url,
            "content": msg.body,
            "channel": str(channel_id),
            "created_at": msg.created_at.isoformat(),
            "is_read": msg.read_at is not None,
        }
        for msg, first_name, last_name, avatar_url in rows
    ]


@router.post("/messages/channels/{channel_id}/messages", status_code=201, summary="Send message to channel")
async def send_channel_message(
    channel_id: uuid.UUID,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.org_id is None:
        raise HTTPException(status_code=400, detail={"error_code": "NO_ORG", "message": "User must belong to an organisation.", "detail": None})
    content = body.get("content", "").strip()
    if not content:
        raise HTTPException(status_code=422, detail={"error_code": "EMPTY_MESSAGE", "message": "Message content cannot be empty.", "detail": None})
    message = Message(
        org_id=current_user.org_id,
        sender_id=current_user.id,
        group_id=channel_id,
        body=content,
        created_at=datetime.now(timezone.utc),
    )
    db.add(message)
    await db.flush()
    return {
        "id": str(message.id),
        "org_id": str(message.org_id),
        "sender_id": str(message.sender_id),
        "sender_name": f"{current_user.first_name} {current_user.last_name}".strip(),
        "sender_avatar": current_user.avatar_url,
        "content": message.body,
        "channel": str(channel_id),
        "created_at": message.created_at.isoformat(),
        "is_read": False,
    }


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


# ── Dashboard Stats ───────────────────────────────────────────

@router.get("/dashboard/stats", response_model=DashboardStatsOut, summary="Dashboard KPIs")
async def dashboard_stats(
    current_user: User = Depends(require_roles("manager")),
    db: AsyncSession = Depends(get_db),
):
    org_id = current_user.org_id
    cache_key = f"dashboard:stats:{org_id}"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    now = datetime.now(timezone.utc)
    today = now.date()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=7)
    last_week_start = week_start - timedelta(days=7)

    # Labour costs
    r = await db.execute(
        select(func.coalesce(func.sum(Timesheet.total_cost), 0))
        .where(Timesheet.org_id == org_id, Timesheet.period_start >= week_start, Timesheet.period_start < week_end)
    )
    labour_cost_this_week = float(r.scalar())

    r = await db.execute(
        select(func.coalesce(func.sum(Timesheet.total_cost), 0))
        .where(Timesheet.org_id == org_id, Timesheet.period_start >= last_week_start, Timesheet.period_start < week_start)
    )
    labour_cost_last_week = float(r.scalar())

    # Pending approvals
    r = await db.execute(
        select(func.count(Timesheet.id)).where(Timesheet.org_id == org_id, Timesheet.status == "submitted")
    )
    pending_timesheet_approvals = r.scalar() or 0

    r = await db.execute(
        select(func.count(LeaveRequest.id))
        .join(User, LeaveRequest.user_id == User.id)
        .where(User.org_id == org_id, LeaveRequest.status == "pending")
    )
    pending_leave_approvals = r.scalar() or 0

    # Clocked in now (reuse logic from /clock/live)
    clock_in_r = await db.execute(
        select(ClockEvent)
        .join(User, ClockEvent.user_id == User.id)
        .where(User.org_id == org_id, ClockEvent.event_type == "clock_in", func.date(ClockEvent.recorded_at) == today)
        .order_by(ClockEvent.recorded_at.desc())
    )
    clock_ins = clock_in_r.scalars().all()

    clock_out_r = await db.execute(
        select(ClockEvent.user_id)
        .join(User, ClockEvent.user_id == User.id)
        .where(User.org_id == org_id, ClockEvent.event_type == "clock_out", func.date(ClockEvent.recorded_at) == today)
    )
    clocked_out_ids = {row[0] for row in clock_out_r.all()}

    seen: set[uuid.UUID] = set()
    clocked_in_now = []
    for ci in clock_ins:
        if ci.user_id in seen or ci.user_id in clocked_out_ids:
            continue
        seen.add(ci.user_id)
        u_r = await db.execute(select(User).where(User.id == ci.user_id))
        u = u_r.scalar_one_or_none()
        loc_name = None
        if ci.location_id:
            loc_r = await db.execute(select(Location).where(Location.id == ci.location_id))
            loc = loc_r.scalar_one_or_none()
            loc_name = loc.name if loc else None
        if u:
            clocked_in_now.append({
                "user_id": u.id,
                "employee_name": f"{u.first_name or ''} {u.last_name or ''}".strip() or u.email,
                "avatar_url": getattr(u, "avatar_url", None),
                "clocked_in_at": ci.recorded_at,
                "location_name": loc_name,
            })

    # Upcoming shifts (next 24h)
    next_24h = now + timedelta(hours=24)
    upcoming_r = await db.execute(
        select(Shift, Roster, User, Location)
        .join(Roster, Shift.roster_id == Roster.id)
        .outerjoin(User, Shift.assigned_user_id == User.id)
        .outerjoin(Location, Shift.location_id == Location.id)
        .where(Roster.org_id == org_id, Shift.start_datetime >= now, Shift.start_datetime <= next_24h)
        .order_by(Shift.start_datetime)
        .limit(10)
    )
    upcoming_shifts = []
    for row in upcoming_r.all():
        s, ros, u, loc = row
        upcoming_shifts.append({
            "id": s.id,
            "org_id": ros.org_id,
            "location_id": s.location_id,
            "location_name": loc.name if loc else None,
            "user_id": s.assigned_user_id,
            "employee_name": (f"{u.first_name or ''} {u.last_name or ''}".strip() or u.email) if u else None,
            "role_name": s.role,
            "start_time": s.start_datetime,
            "end_time": s.end_datetime,
            "break_minutes": s.break_minutes,
            "status": s.status,
            "notes": s.notes,
            "is_published": ros.status == "published",
            "created_at": s.created_at,
        })

    # Recent activity (last 5 audit logs)
    audit_r = await db.execute(
        select(AuditLog, User)
        .outerjoin(User, AuditLog.actor == User.id)
        .order_by(AuditLog.created_at.desc())
        .limit(5)
    )
    recent_activity = []
    for row in audit_r.all():
        log, u = row
        recent_activity.append({
            "id": log.id,
            "org_id": str(org_id),
            "user_id": log.actor,
            "user_name": (f"{u.first_name or ''} {u.last_name or ''}".strip() or u.email) if u else None,
            "action": f"{log.entity_type} {log.action}",
            "resource_type": log.entity_type,
            "resource_id": str(log.entity_id),
            "details": log.after_payload,
            "created_at": log.created_at,
        })

    # Labour cost chart (Mon–Sun of current week)
    chart = []
    day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    for i in range(7):
        day = week_start + timedelta(days=i)
        r = await db.execute(
            select(
                func.coalesce(func.sum(Timesheet.total_cost), 0),
                func.coalesce(func.sum(Timesheet.total_hours), 0),
            ).where(Timesheet.org_id == org_id, Timesheet.period_start == day)
        )
        cost, hours = r.one()
        chart.append({"period": day_names[i], "cost": float(cost), "hours": float(hours), "location_name": None})

    result = {
        "labour_cost_this_week": labour_cost_this_week,
        "labour_cost_last_week": labour_cost_last_week,
        "pending_timesheet_approvals": pending_timesheet_approvals,
        "pending_leave_approvals": pending_leave_approvals,
        "clocked_in_now": clocked_in_now,
        "upcoming_shifts": upcoming_shifts,
        "recent_activity": recent_activity,
        "labour_cost_chart": chart,
    }
    await cache_set(cache_key, result, ttl=30)
    return result


# ── Flat Shifts (frontend-facing) ────────────────────────────

@router.get("/shifts", response_model=list[ShiftFlatOut], summary="List shifts across all rosters")
async def list_shifts_flat(
    start: Optional[datetime] = Query(None),
    end: Optional[datetime] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = current_user.org_id
    stmt = (
        select(Shift, Roster, User, Location)
        .join(Roster, Shift.roster_id == Roster.id)
        .outerjoin(User, Shift.assigned_user_id == User.id)
        .outerjoin(Location, Shift.location_id == Location.id)
        .where(Roster.org_id == org_id)
    )
    if start:
        stmt = stmt.where(Shift.start_datetime >= start)
    if end:
        stmt = stmt.where(Shift.start_datetime < end)
    result = await db.execute(stmt.order_by(Shift.start_datetime))
    shifts = []
    for row in result.all():
        s, ros, u, loc = row
        shifts.append({
            "id": s.id,
            "org_id": ros.org_id,
            "location_id": s.location_id,
            "location_name": loc.name if loc else None,
            "user_id": s.assigned_user_id,
            "employee_name": (f"{u.first_name or ''} {u.last_name or ''}".strip() or u.email) if u else None,
            "role_name": s.role,
            "start_time": s.start_datetime,
            "end_time": s.end_datetime,
            "break_minutes": s.break_minutes,
            "status": s.status,
            "notes": s.notes,
            "is_published": ros.status == "published",
            "created_at": s.created_at,
        })
    return shifts


@router.post("/shifts", response_model=ShiftFlatOut, status_code=201, summary="Create shift (auto-assigns to roster)")
async def create_shift_flat(
    body: ShiftFlatCreate,
    current_user: User = Depends(require_roles("manager")),
    db: AsyncSession = Depends(get_db),
):
    org_id = current_user.org_id
    # Find or create roster for the week containing start_time
    week_start = body.start_time.date() - timedelta(days=body.start_time.weekday())
    r = await db.execute(select(Roster).where(Roster.org_id == org_id, Roster.week_start == week_start))
    roster = r.scalar_one_or_none()
    if not roster:
        roster = Roster(org_id=org_id, week_start=week_start, status="draft", created_by=current_user.id)
        db.add(roster)
        await db.flush()

    shift = Shift(
        roster_id=roster.id,
        location_id=body.location_id,
        assigned_user_id=body.user_id,
        role=body.role_name,
        start_datetime=body.start_time,
        end_datetime=body.end_time,
        break_minutes=body.break_minutes,
        notes=body.notes,
    )
    db.add(shift)
    await db.flush()

    u, loc = None, None
    if shift.assigned_user_id:
        u_r = await db.execute(select(User).where(User.id == shift.assigned_user_id))
        u = u_r.scalar_one_or_none()
    if shift.location_id:
        loc_r = await db.execute(select(Location).where(Location.id == shift.location_id))
        loc = loc_r.scalar_one_or_none()

    return {
        "id": shift.id,
        "org_id": roster.org_id,
        "location_id": shift.location_id,
        "location_name": loc.name if loc else None,
        "user_id": shift.assigned_user_id,
        "employee_name": (f"{u.first_name or ''} {u.last_name or ''}".strip() or u.email) if u else None,
        "role_name": shift.role,
        "start_time": shift.start_datetime,
        "end_time": shift.end_datetime,
        "break_minutes": shift.break_minutes,
        "status": shift.status,
        "notes": shift.notes,
        "is_published": roster.status == "published",
        "created_at": shift.created_at,
    }


@router.post("/shifts/publish", summary="Publish current week's roster")
async def publish_current_roster(
    current_user: User = Depends(require_roles("manager")),
    db: AsyncSession = Depends(get_db),
):
    org_id = current_user.org_id
    today = datetime.now(timezone.utc).date()
    week_start = today - timedelta(days=today.weekday())
    r = await db.execute(select(Roster).where(Roster.org_id == org_id, Roster.week_start == week_start))
    roster = r.scalar_one_or_none()
    if not roster:
        raise HTTPException(status_code=404, detail={"error_code": "ROSTER_NOT_FOUND", "message": "No roster for current week.", "detail": None})
    roster.status = "published"
    roster.published_at = datetime.now(timezone.utc)
    await db.commit()
    return {"message": "Roster published", "roster_id": str(roster.id)}
