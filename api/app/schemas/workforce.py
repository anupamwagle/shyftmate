import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


# ── Location ─────────────────────────────────────────────────

class LocationCreate(BaseModel):
    name: str
    address: Optional[str] = None
    timezone: str = "Australia/Sydney"


class LocationUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    timezone: Optional[str] = None
    is_active: Optional[bool] = None


class LocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    name: str
    address: Optional[str]
    timezone: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ── Employee Profile ─────────────────────────────────────────

class EmployeeProfileCreate(BaseModel):
    user_id: uuid.UUID
    org_id: uuid.UUID
    employment_type: str = "full_time"
    award_code: Optional[str] = None
    base_hourly_rate: Optional[Decimal] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    emergency_contact: Optional[dict[str, Any]] = None


class EmployeeProfileUpdate(BaseModel):
    employment_type: Optional[str] = None
    award_code: Optional[str] = None
    base_hourly_rate: Optional[Decimal] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    emergency_contact: Optional[dict[str, Any]] = None


class EmployeeProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    org_id: uuid.UUID
    employment_type: str
    award_code: Optional[str]
    base_hourly_rate: Optional[Decimal]
    start_date: Optional[date]
    end_date: Optional[date]
    emergency_contact: Optional[dict[str, Any]]
    created_at: datetime
    updated_at: datetime


# ── Roster ───────────────────────────────────────────────────

class RosterCreate(BaseModel):
    org_id: uuid.UUID
    location_id: Optional[uuid.UUID] = None
    week_start: date


class RosterUpdate(BaseModel):
    location_id: Optional[uuid.UUID] = None
    week_start: Optional[date] = None
    status: Optional[str] = None


class RosterOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    location_id: Optional[uuid.UUID]
    week_start: date
    status: str
    created_by: Optional[uuid.UUID]
    published_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


# ── Shift ────────────────────────────────────────────────────

class ShiftCreate(BaseModel):
    location_id: Optional[uuid.UUID] = None
    assigned_user_id: Optional[uuid.UUID] = None
    role: Optional[str] = None
    start_datetime: datetime
    end_datetime: datetime
    break_minutes: int = 0
    notes: Optional[str] = None


class ShiftUpdate(BaseModel):
    location_id: Optional[uuid.UUID] = None
    assigned_user_id: Optional[uuid.UUID] = None
    role: Optional[str] = None
    start_datetime: Optional[datetime] = None
    end_datetime: Optional[datetime] = None
    break_minutes: Optional[int] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class ShiftOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    roster_id: uuid.UUID
    location_id: Optional[uuid.UUID]
    assigned_user_id: Optional[uuid.UUID]
    role: Optional[str]
    start_datetime: datetime
    end_datetime: datetime
    break_minutes: int
    status: str
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime


# ── Shift flat (frontend-facing field names) ─────────────────

class ShiftFlatCreate(BaseModel):
    user_id: Optional[uuid.UUID] = None
    location_id: Optional[uuid.UUID] = None
    role_name: Optional[str] = None
    start_time: datetime
    end_time: datetime
    break_minutes: int = 0
    notes: Optional[str] = None


class ShiftFlatOut(BaseModel):
    id: uuid.UUID
    org_id: uuid.UUID
    location_id: Optional[uuid.UUID] = None
    location_name: Optional[str] = None
    user_id: Optional[uuid.UUID] = None
    employee_name: Optional[str] = None
    role_name: Optional[str] = None
    start_time: datetime
    end_time: datetime
    break_minutes: int
    status: str
    notes: Optional[str] = None
    is_published: bool
    created_at: datetime


# ── Dashboard ─────────────────────────────────────────────────

class ClockedInEmployeeOut(BaseModel):
    user_id: uuid.UUID
    employee_name: str
    avatar_url: Optional[str] = None
    clocked_in_at: datetime
    location_name: Optional[str] = None


class LabourCostPoint(BaseModel):
    period: str
    cost: float
    hours: float
    location_name: Optional[str] = None


class DashboardActivityItem(BaseModel):
    id: uuid.UUID
    org_id: Optional[str] = None
    user_id: Optional[uuid.UUID] = None
    user_name: Optional[str] = None
    action: str
    resource_type: str
    resource_id: Optional[str] = None
    details: Optional[dict] = None
    created_at: datetime


class DashboardStatsOut(BaseModel):
    labour_cost_this_week: float
    labour_cost_last_week: float
    pending_timesheet_approvals: int
    pending_leave_approvals: int
    clocked_in_now: list[ClockedInEmployeeOut]
    upcoming_shifts: list[ShiftFlatOut]
    recent_activity: list[DashboardActivityItem]
    labour_cost_chart: list[LabourCostPoint]


# ── Clock Event ──────────────────────────────────────────────

class ClockEventCreate(BaseModel):
    event_type: str
    recorded_at: datetime
    gps_lat: Optional[Decimal] = None
    gps_lng: Optional[Decimal] = None
    method: str = "mobile"
    shift_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None


class ClockEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    location_id: Optional[uuid.UUID]
    shift_id: Optional[uuid.UUID]
    event_type: str
    recorded_at: datetime
    gps_lat: Optional[Decimal]
    gps_lng: Optional[Decimal]
    method: str
    notes: Optional[str]
    created_at: datetime


# ── Timesheet ────────────────────────────────────────────────

class TimesheetUpdate(BaseModel):
    status: Optional[str] = None
    total_hours: Optional[Decimal] = None
    total_cost: Optional[Decimal] = None


class TimesheetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    org_id: uuid.UUID
    location_id: Optional[uuid.UUID]
    period_start: date
    period_end: date
    status: str
    total_hours: Optional[Decimal]
    total_cost: Optional[Decimal]
    submitted_at: Optional[datetime]
    approved_by: Optional[uuid.UUID]
    approved_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


class TimesheetEntryUpdate(BaseModel):
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    break_minutes: Optional[int] = None
    ordinary_hours: Optional[Decimal] = None
    overtime_hours: Optional[Decimal] = None
    penalty_multiplier: Optional[Decimal] = None
    calculated_cost: Optional[Decimal] = None
    is_manual_override: Optional[bool] = None
    override_reason: Optional[str] = None


class TimesheetEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    timesheet_id: uuid.UUID
    date: date
    start_time: Optional[datetime]
    end_time: Optional[datetime]
    break_minutes: int
    award_code: Optional[str]
    rule_key: Optional[str]
    ordinary_hours: Optional[Decimal]
    overtime_hours: Optional[Decimal]
    penalty_multiplier: Optional[Decimal]
    calculated_cost: Optional[Decimal]
    is_manual_override: bool
    override_reason: Optional[str]


# ── Leave ────────────────────────────────────────────────────

class LeaveTypeCreate(BaseModel):
    org_id: uuid.UUID
    name: str
    is_paid: bool = True
    accrual_rate: Optional[Decimal] = None
    requires_approval: bool = True
    max_balance_days: Optional[Decimal] = None


class LeaveTypeUpdate(BaseModel):
    name: Optional[str] = None
    is_paid: Optional[bool] = None
    accrual_rate: Optional[Decimal] = None
    requires_approval: Optional[bool] = None
    max_balance_days: Optional[Decimal] = None


class LeaveTypeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    name: str
    is_paid: bool
    accrual_rate: Optional[Decimal]
    requires_approval: bool
    max_balance_days: Optional[Decimal]


class LeaveBalanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    leave_type_id: uuid.UUID
    balance_days: Decimal
    accrued_days: Decimal
    taken_days: Decimal
    updated_at: datetime


class LeaveRequestCreate(BaseModel):
    leave_type_id: uuid.UUID
    start_date: date
    end_date: date
    total_days: Decimal
    reason: Optional[str] = None


class LeaveRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    leave_type_id: uuid.UUID
    start_date: date
    end_date: date
    total_days: Decimal
    reason: Optional[str]
    status: str
    manager_id: Optional[uuid.UUID]
    managed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


class LeaveActionIn(BaseModel):
    reason: Optional[str] = None


# ── Communication ────────────────────────────────────────────

class AnnouncementCreate(BaseModel):
    title: str
    body: str
    audience_filter: Optional[dict[str, Any]] = None
    published_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None


class AnnouncementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    created_by: uuid.UUID
    title: str
    body: str
    audience_filter: Optional[dict[str, Any]]
    published_at: Optional[datetime]
    expires_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


class MessageCreate(BaseModel):
    recipient_id: Optional[uuid.UUID] = None
    group_id: Optional[uuid.UUID] = None
    body: str


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    sender_id: uuid.UUID
    recipient_id: Optional[uuid.UUID]
    group_id: Optional[uuid.UUID]
    body: str
    read_at: Optional[datetime]
    created_at: datetime


# ── Export Job ───────────────────────────────────────────────

class ExportTriggerIn(BaseModel):
    platform: str
    agreement_id: Optional[uuid.UUID] = None
    timesheet_ids: Optional[list[uuid.UUID]] = None
    environment: str = "dev"


class ExportJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    platform: str
    agreement_id: Optional[uuid.UUID]
    timesheet_ids: Optional[list]
    status: str
    result_payload: Optional[dict[str, Any]]
    created_by: Optional[uuid.UUID]
    created_at: datetime
    completed_at: Optional[datetime]
