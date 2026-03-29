import uuid
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import (
    ARRAY, Boolean, Date, DateTime, ForeignKey, Integer, Numeric,
    String, Text, Time,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base
from app.models.base import TimestampMixin, UUIDPrimaryKey


class Location(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "locations"

    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organisations.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    address: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    timezone: Mapped[str] = mapped_column(String(50), default="Australia/Sydney")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    organisation: Mapped["Organisation"] = relationship("Organisation", back_populates="locations")


class EmployeeProfile(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "employee_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organisations.id"))
    employment_type: Mapped[str] = mapped_column(String(30), default="full_time")
    award_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    base_hourly_rate: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 4), nullable=True)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    tax_file_number_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    bank_details_encrypted: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    emergency_contact: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)


class EmployeeAvailability(Base, UUIDPrimaryKey):
    __tablename__ = "employee_availability"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    day_of_week: Mapped[int] = mapped_column(Integer)  # 0=Mon..6=Sun
    start_time: Mapped[Optional[time]] = mapped_column(Time, nullable=True)
    end_time: Mapped[Optional[time]] = mapped_column(Time, nullable=True)
    is_unavailable: Mapped[bool] = mapped_column(Boolean, default=False)
    effective_from: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    effective_to: Mapped[Optional[date]] = mapped_column(Date, nullable=True)


# ── Scheduling ──────────────────────────────────────────────

class Roster(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "rosters"

    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organisations.id"))
    location_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id"), nullable=True
    )
    week_start: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    # draft | published | archived
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    shifts: Mapped[list["Shift"]] = relationship("Shift", back_populates="roster", cascade="all, delete-orphan")


class Shift(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "shifts"

    roster_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("rosters.id", ondelete="CASCADE")
    )
    location_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id"), nullable=True
    )
    assigned_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    role: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    start_datetime: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_datetime: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    break_minutes: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="open")
    # open | filled | confirmed | cancelled
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    roster: Mapped["Roster"] = relationship("Roster", back_populates="shifts")


# ── Time & Attendance ────────────────────────────────────────

class ClockEvent(Base, UUIDPrimaryKey):
    __tablename__ = "clock_events"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    location_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id"), nullable=True
    )
    shift_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("shifts.id"), nullable=True
    )
    event_type: Mapped[str] = mapped_column(String(30))
    # clock_in | clock_out | break_start | break_end
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    gps_lat: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 7), nullable=True)
    gps_lng: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 7), nullable=True)
    method: Mapped[str] = mapped_column(String(20), default="mobile")
    # mobile | kiosk | manual
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Timesheet(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "timesheets"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organisations.id"))
    location_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id"), nullable=True
    )
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    # draft | submitted | approved | exported | paid
    total_hours: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 2), nullable=True)
    total_cost: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    entries: Mapped[list["TimesheetEntry"]] = relationship(
        "TimesheetEntry", back_populates="timesheet", cascade="all, delete-orphan"
    )


class TimesheetEntry(Base, UUIDPrimaryKey):
    __tablename__ = "timesheet_entries"

    timesheet_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("timesheets.id", ondelete="CASCADE")
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    end_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    break_minutes: Mapped[int] = mapped_column(Integer, default=0)
    award_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    rule_key: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    ordinary_hours: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 2), nullable=True)
    overtime_hours: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 2), nullable=True)
    penalty_multiplier: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 4), nullable=True)
    calculated_cost: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    is_manual_override: Mapped[bool] = mapped_column(Boolean, default=False)
    override_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    timesheet: Mapped["Timesheet"] = relationship("Timesheet", back_populates="entries")


# ── Leave ────────────────────────────────────────────────────

class LeaveType(Base, UUIDPrimaryKey):
    __tablename__ = "leave_types"

    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organisations.id"))
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str] = mapped_column(String(10), nullable=False, server_default="")
    is_paid: Mapped[bool] = mapped_column(Boolean, default=True)
    accrual_rate: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 4), nullable=True)
    requires_approval: Mapped[bool] = mapped_column(Boolean, default=True)
    max_balance: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 2), nullable=True)
    color: Mapped[str] = mapped_column(String(20), nullable=False, server_default="'#6366f1'")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")


class LeaveBalance(Base, UUIDPrimaryKey):
    __tablename__ = "leave_balances"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    leave_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leave_types.id")
    )
    balance_days: Mapped[Decimal] = mapped_column(Numeric(8, 2), default=0)
    accrued_days: Mapped[Decimal] = mapped_column(Numeric(8, 2), default=0)
    taken_days: Mapped[Decimal] = mapped_column(Numeric(8, 2), default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class LeaveRequest(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "leave_requests"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    leave_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leave_types.id")
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    total_days: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    # pending | approved | rejected | cancelled
    manager_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    managed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


# ── Communication ────────────────────────────────────────────

class Announcement(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "announcements"

    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organisations.id"))
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    audience_filter: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class Message(Base, UUIDPrimaryKey):
    __tablename__ = "messages"

    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organisations.id"))
    sender_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    recipient_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    group_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


# ── Payroll Export ───────────────────────────────────────────

class PayrollExportJob(Base, UUIDPrimaryKey):
    __tablename__ = "payroll_export_jobs"

    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organisations.id"))
    platform: Mapped[str] = mapped_column(String(30))
    # kronos | keypay | myob | xero
    agreement_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    timesheet_ids: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    # pending | running | done | failed
    result_payload: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


# ── Shift Swaps ──────────────────────────────────────────────

class ShiftSwap(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "shift_swaps"
    shift_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("shifts.id", ondelete="CASCADE"), nullable=False, index=True)
    requesting_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    covering_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="pending")  # pending|approved|rejected
    manager_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class MessageGroup(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "message_groups"
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    member_ids: Mapped[list] = mapped_column(ARRAY(UUID(as_uuid=True)), nullable=False, server_default="{}")


class EmployeeSkill(Base, UUIDPrimaryKey):
    __tablename__ = "employee_skills"
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    skill_name: Mapped[str] = mapped_column(String(100), nullable=False)
    certified_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    expires_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class EmployeeDocument(Base, UUIDPrimaryKey):
    __tablename__ = "employee_documents"
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    document_type: Mapped[str] = mapped_column(String(50), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    expires_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class ShiftTemplate(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "shift_templates"
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True)
    location_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("locations.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    start_time: Mapped[Optional[time]] = mapped_column(Time, nullable=True)
    end_time: Mapped[Optional[time]] = mapped_column(Time, nullable=True)
    role_required: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    min_staff: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
