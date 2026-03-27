import uuid
from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base
from app.models.base import TimestampMixin, UUIDPrimaryKey


class Agreement(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "agreements"

    parent_version_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agreements.id", ondelete="SET NULL"), nullable=True
    )
    version: Mapped[int] = mapped_column(Integer, default=1)
    agreement_type: Mapped[str] = mapped_column(String(30), default="modern_award")
    # agreement_type: modern_award | eba
    agreement_code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    exhr_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    agreement_name: Mapped[str] = mapped_column(String(300), nullable=False)
    agreement_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    effective_from: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    effective_to: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    payroll_frequency: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    pay_week_definition: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    pay_day: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    metadata_: Mapped[Optional[dict[str, Any]]] = mapped_column("metadata", JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft", index=True)
    # status: draft | active | superseded | archived
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    validated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    validated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    sync_status: Mapped[str] = mapped_column(String(20), default="pending")
    sync_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sync_attempted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    employee_type_configs: Mapped[list["EmployeeTypeConfig"]] = relationship(
        "EmployeeTypeConfig", back_populates="agreement", cascade="all, delete-orphan"
    )
    allowances: Mapped[list["AgreementAllowance"]] = relationship(
        "AgreementAllowance", back_populates="agreement", cascade="all, delete-orphan"
    )
    leave_paycodes: Mapped[list["AgreementLeavePaycode"]] = relationship(
        "AgreementLeavePaycode", back_populates="agreement", cascade="all, delete-orphan"
    )
    wage_grades: Mapped[list["WageGrade"]] = relationship(
        "WageGrade", back_populates="agreement", cascade="all, delete-orphan"
    )
    kronos_config: Mapped[Optional["KronosConfig"]] = relationship(
        "KronosConfig", back_populates="agreement", uselist=False, cascade="all, delete-orphan"
    )


class EmployeeTypeConfig(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "employee_type_configs"

    agreement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agreements.id", ondelete="CASCADE"), nullable=False
    )
    emp_type: Mapped[str] = mapped_column(String(50), nullable=False)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    ord_hours_per_week: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    ord_hours_per_day: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    rdo_accrual_per_day: Mapped[Optional[float]] = mapped_column(Numeric(5, 4), nullable=True)
    overnight_shift_rule: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    ordinary_span: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    afternoon_shift_definition: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    night_shift_definition: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    agreement: Mapped["Agreement"] = relationship("Agreement", back_populates="employee_type_configs")
    rule_lines: Mapped[list["RuleLine"]] = relationship(
        "RuleLine", back_populates="employee_type_config",
        cascade="all, delete-orphan",
        foreign_keys="RuleLine.emp_type_config_id",
    )


class RuleLine(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "rule_lines"

    emp_type_config_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employee_type_configs.id", ondelete="CASCADE"), nullable=False
    )
    parent_rule_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("rule_lines.id", ondelete="CASCADE"), nullable=True
    )
    scenario: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    rule_definition: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    timesheet_input: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    kronos_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    jde_standard_costing: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    jde_billing: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    expreshr_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    payslip_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    clause_ref: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    page_ref: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    employee_type_config: Mapped["EmployeeTypeConfig"] = relationship(
        "EmployeeTypeConfig", back_populates="rule_lines", foreign_keys=[emp_type_config_id]
    )
    sub_rules: Mapped[list["RuleLine"]] = relationship(
        "RuleLine", back_populates="parent_rule",
        foreign_keys="RuleLine.parent_rule_id",
        cascade="all, delete-orphan",
    )
    parent_rule: Mapped[Optional["RuleLine"]] = relationship(
        "RuleLine", back_populates="sub_rules",
        remote_side="RuleLine.id",
        foreign_keys=[parent_rule_id],
    )


class AgreementAllowance(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "agreement_allowances"

    agreement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agreements.id", ondelete="CASCADE"), nullable=False
    )
    allowance_name: Mapped[str] = mapped_column(String(200), nullable=False)
    rule_definition: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    kronos_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    jde_standard_costing: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    jde_billing: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    expreshr_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    payslip_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    clause_ref: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    page_ref: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    allowance_class: Mapped[Optional[str]] = mapped_column(String(1), nullable=True)
    # C=Claimable, D=Derivable, R=Recurring, P=Payrollable
    sub_kronos_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    agreement: Mapped["Agreement"] = relationship("Agreement", back_populates="allowances")


class AgreementLeavePaycode(Base, UUIDPrimaryKey):
    __tablename__ = "agreement_leave_paycodes"

    agreement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agreements.id", ondelete="CASCADE"), nullable=False
    )
    paycode: Mapped[str] = mapped_column(String(100), nullable=False)
    is_required: Mapped[bool] = mapped_column(Boolean, default=False)
    category: Mapped[str] = mapped_column(String(20), default="duration")
    # duration | other
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    agreement: Mapped["Agreement"] = relationship("Agreement", back_populates="leave_paycodes")


class WageGrade(Base, UUIDPrimaryKey):
    __tablename__ = "wage_grades"

    agreement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agreements.id", ondelete="CASCADE"), nullable=False
    )
    grade_name: Mapped[str] = mapped_column(String(200), nullable=False)
    classification: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    level_number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    exhr_grade_name: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    rates: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    agreement: Mapped["Agreement"] = relationship("Agreement", back_populates="wage_grades")


class KronosConfig(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "kronos_configs"

    agreement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agreements.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    fixed_rule: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    exception_rule: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    rounding_rule: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    break_rule: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    punch_interpretation_rule: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    day_divide: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    shift_guarantee: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    work_rules_access_profile: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    pay_codes_access_profile: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    standard_hours: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    activity_profile: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    access_profile: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    interactive_processes: Mapped[Optional[list[str]]] = mapped_column(ARRAY(Text), nullable=True)
    payrule_mappings: Mapped[Optional[list[dict]]] = mapped_column(JSONB, nullable=True)
    recurring_allowances: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    agreement: Mapped["Agreement"] = relationship("Agreement", back_populates="kronos_config")


class KronosPaycode(Base, UUIDPrimaryKey):
    __tablename__ = "kronos_paycodes"

    aus_oracle_element: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    paycode: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    paycode_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    # Hours | Allowance | Penalty
    aus_oracle_leave_reason: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    export_to_payroll: Mapped[bool] = mapped_column(Boolean, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class AwardConstant(Base, UUIDPrimaryKey):
    __tablename__ = "award_constants"
    award_code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    constant_key: Mapped[str] = mapped_column(String(100), nullable=False)
    constant_value: Mapped[dict] = mapped_column(JSONB, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    effective_from: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    effective_to: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    __table_args__ = (UniqueConstraint("award_code", "constant_key", name="uq_award_constants_code_key"),)
