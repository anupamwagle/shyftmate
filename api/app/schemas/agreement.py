import uuid
from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


# ── Agreement ────────────────────────────────────────────────

class AgreementCreate(BaseModel):
    agreement_type: str = "modern_award"
    agreement_code: str
    exhr_name: Optional[str] = None
    agreement_name: str
    agreement_number: Optional[str] = None
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    payroll_frequency: Optional[str] = None
    pay_week_definition: Optional[str] = None
    pay_day: Optional[str] = None
    metadata_: Optional[dict[str, Any]] = None


class AgreementUpdate(BaseModel):
    agreement_type: Optional[str] = None
    exhr_name: Optional[str] = None
    agreement_name: Optional[str] = None
    agreement_number: Optional[str] = None
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    payroll_frequency: Optional[str] = None
    pay_week_definition: Optional[str] = None
    pay_day: Optional[str] = None
    metadata_: Optional[dict[str, Any]] = None


class AgreementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    parent_version_id: Optional[uuid.UUID]
    version: int
    agreement_type: str
    agreement_code: str
    exhr_name: Optional[str]
    agreement_name: str
    agreement_number: Optional[str]
    effective_from: Optional[date]
    effective_to: Optional[date]
    payroll_frequency: Optional[str]
    pay_week_definition: Optional[str]
    pay_day: Optional[str]
    metadata_: Optional[dict[str, Any]]
    status: str
    created_by: Optional[uuid.UUID]
    validated_by: Optional[uuid.UUID]
    validated_at: Optional[datetime]
    sync_status: str
    sync_error: Optional[str]
    sync_attempted_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


# ── Employee Type Config ─────────────────────────────────────

class EmployeeTypeConfigCreate(BaseModel):
    emp_type: str
    label: str
    ord_hours_per_week: Optional[float] = None
    ord_hours_per_day: Optional[float] = None
    rdo_accrual_per_day: Optional[float] = None
    overnight_shift_rule: Optional[str] = None
    ordinary_span: Optional[str] = None
    afternoon_shift_definition: Optional[str] = None
    night_shift_definition: Optional[str] = None
    sort_order: int = 0


class EmployeeTypeConfigUpdate(BaseModel):
    emp_type: Optional[str] = None
    label: Optional[str] = None
    ord_hours_per_week: Optional[float] = None
    ord_hours_per_day: Optional[float] = None
    rdo_accrual_per_day: Optional[float] = None
    overnight_shift_rule: Optional[str] = None
    ordinary_span: Optional[str] = None
    afternoon_shift_definition: Optional[str] = None
    night_shift_definition: Optional[str] = None
    sort_order: Optional[int] = None


class EmployeeTypeConfigOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    agreement_id: uuid.UUID
    emp_type: str
    label: str
    ord_hours_per_week: Optional[float]
    ord_hours_per_day: Optional[float]
    rdo_accrual_per_day: Optional[float]
    overnight_shift_rule: Optional[str]
    ordinary_span: Optional[str]
    afternoon_shift_definition: Optional[str]
    night_shift_definition: Optional[str]
    sort_order: int
    created_at: datetime
    updated_at: datetime


# ── Rule Line ────────────────────────────────────────────────

class RuleLineCreate(BaseModel):
    parent_rule_id: Optional[uuid.UUID] = None
    scenario: Optional[str] = None
    rule_definition: Optional[str] = None
    timesheet_input: Optional[str] = None
    kronos_name: Optional[str] = None
    jde_standard_costing: Optional[str] = None
    jde_billing: Optional[str] = None
    expreshr_name: Optional[str] = None
    payslip_name: Optional[str] = None
    clause_ref: Optional[str] = None
    page_ref: Optional[int] = None
    sort_order: int = 0


class RuleLineUpdate(BaseModel):
    parent_rule_id: Optional[uuid.UUID] = None
    scenario: Optional[str] = None
    rule_definition: Optional[str] = None
    timesheet_input: Optional[str] = None
    kronos_name: Optional[str] = None
    jde_standard_costing: Optional[str] = None
    jde_billing: Optional[str] = None
    expreshr_name: Optional[str] = None
    payslip_name: Optional[str] = None
    clause_ref: Optional[str] = None
    page_ref: Optional[int] = None
    sort_order: Optional[int] = None


class RuleLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    emp_type_config_id: uuid.UUID
    parent_rule_id: Optional[uuid.UUID]
    scenario: Optional[str]
    rule_definition: Optional[str]
    timesheet_input: Optional[str]
    kronos_name: Optional[str]
    jde_standard_costing: Optional[str]
    jde_billing: Optional[str]
    expreshr_name: Optional[str]
    payslip_name: Optional[str]
    clause_ref: Optional[str]
    page_ref: Optional[int]
    sort_order: int
    sub_rules: list["RuleLineOut"] = []
    created_at: datetime
    updated_at: datetime


RuleLineOut.model_rebuild()


# ── Allowance ────────────────────────────────────────────────

class AgreementAllowanceCreate(BaseModel):
    allowance_name: str
    rule_definition: Optional[str] = None
    kronos_name: Optional[str] = None
    jde_standard_costing: Optional[str] = None
    jde_billing: Optional[str] = None
    expreshr_name: Optional[str] = None
    payslip_name: Optional[str] = None
    clause_ref: Optional[str] = None
    page_ref: Optional[int] = None
    allowance_class: Optional[str] = None
    sub_kronos_name: Optional[str] = None
    sort_order: int = 0


class AgreementAllowanceUpdate(BaseModel):
    allowance_name: Optional[str] = None
    rule_definition: Optional[str] = None
    kronos_name: Optional[str] = None
    jde_standard_costing: Optional[str] = None
    jde_billing: Optional[str] = None
    expreshr_name: Optional[str] = None
    payslip_name: Optional[str] = None
    clause_ref: Optional[str] = None
    page_ref: Optional[int] = None
    allowance_class: Optional[str] = None
    sub_kronos_name: Optional[str] = None
    sort_order: Optional[int] = None


class AgreementAllowanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    agreement_id: uuid.UUID
    allowance_name: str
    rule_definition: Optional[str]
    kronos_name: Optional[str]
    jde_standard_costing: Optional[str]
    jde_billing: Optional[str]
    expreshr_name: Optional[str]
    payslip_name: Optional[str]
    clause_ref: Optional[str]
    page_ref: Optional[int]
    allowance_class: Optional[str]
    sub_kronos_name: Optional[str]
    sort_order: int
    created_at: datetime
    updated_at: datetime


# ── Leave Paycode ────────────────────────────────────────────

class AgreementLeavePaycodeCreate(BaseModel):
    paycode: str
    is_required: bool = False
    category: str = "duration"
    sort_order: int = 0


class AgreementLeavePaycodeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    agreement_id: uuid.UUID
    paycode: str
    is_required: bool
    category: str
    sort_order: int


# ── Wage Grade ───────────────────────────────────────────────

class WageGradeCreate(BaseModel):
    grade_name: str
    classification: Optional[str] = None
    level_number: Optional[int] = None
    exhr_grade_name: Optional[str] = None
    rates: Optional[dict[str, Any]] = None
    sort_order: int = 0


class WageGradeUpdate(BaseModel):
    grade_name: Optional[str] = None
    classification: Optional[str] = None
    level_number: Optional[int] = None
    exhr_grade_name: Optional[str] = None
    rates: Optional[dict[str, Any]] = None
    sort_order: Optional[int] = None


class WageGradeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    agreement_id: uuid.UUID
    grade_name: str
    classification: Optional[str]
    level_number: Optional[int]
    exhr_grade_name: Optional[str]
    rates: Optional[dict[str, Any]]
    sort_order: int


# ── Kronos Config ────────────────────────────────────────────

class KronosConfigCreate(BaseModel):
    fixed_rule: Optional[str] = None
    exception_rule: Optional[str] = None
    rounding_rule: Optional[str] = None
    break_rule: Optional[str] = None
    punch_interpretation_rule: Optional[str] = None
    day_divide: Optional[str] = None
    shift_guarantee: Optional[str] = None
    work_rules_access_profile: Optional[str] = None
    pay_codes_access_profile: Optional[str] = None
    standard_hours: Optional[float] = None
    activity_profile: Optional[str] = None
    access_profile: Optional[str] = None
    interactive_processes: Optional[list[str]] = None
    payrule_mappings: Optional[list[dict]] = None
    recurring_allowances: Optional[dict] = None


class KronosConfigUpdate(BaseModel):
    fixed_rule: Optional[str] = None
    exception_rule: Optional[str] = None
    rounding_rule: Optional[str] = None
    break_rule: Optional[str] = None
    punch_interpretation_rule: Optional[str] = None
    day_divide: Optional[str] = None
    shift_guarantee: Optional[str] = None
    work_rules_access_profile: Optional[str] = None
    pay_codes_access_profile: Optional[str] = None
    standard_hours: Optional[float] = None
    activity_profile: Optional[str] = None
    access_profile: Optional[str] = None
    interactive_processes: Optional[list[str]] = None
    payrule_mappings: Optional[list[dict]] = None
    recurring_allowances: Optional[dict] = None


class KronosConfigOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    agreement_id: uuid.UUID
    fixed_rule: Optional[str]
    exception_rule: Optional[str]
    rounding_rule: Optional[str]
    break_rule: Optional[str]
    punch_interpretation_rule: Optional[str]
    day_divide: Optional[str]
    shift_guarantee: Optional[str]
    work_rules_access_profile: Optional[str]
    pay_codes_access_profile: Optional[str]
    standard_hours: Optional[float]
    activity_profile: Optional[str]
    access_profile: Optional[str]
    interactive_processes: Optional[list[str]]
    payrule_mappings: Optional[list[dict]]
    recurring_allowances: Optional[dict]
    created_at: datetime
    updated_at: datetime


# ── Kronos Paycode ───────────────────────────────────────────

class KronosPaycodeCreate(BaseModel):
    aus_oracle_element: Optional[str] = None
    paycode: str
    paycode_type: Optional[str] = None
    aus_oracle_leave_reason: Optional[str] = None
    export_to_payroll: bool = True
    is_active: bool = True


class KronosPaycodeUpdate(BaseModel):
    aus_oracle_element: Optional[str] = None
    paycode_type: Optional[str] = None
    aus_oracle_leave_reason: Optional[str] = None
    export_to_payroll: Optional[bool] = None
    is_active: Optional[bool] = None


class KronosPaycodeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    aus_oracle_element: Optional[str]
    paycode: str
    paycode_type: Optional[str]
    aus_oracle_leave_reason: Optional[str]
    export_to_payroll: bool
    is_active: bool


# ── Version Control ──────────────────────────────────────────

class RollbackIn(BaseModel):
    target_version_id: uuid.UUID


class AgreementActivateIn(BaseModel):
    reason: Optional[str] = None


# ── Paginated response ───────────────────────────────────────

class PaginatedAgreements(BaseModel):
    items: list[AgreementOut]
    total: int
    page: int
    limit: int
    pages: int
