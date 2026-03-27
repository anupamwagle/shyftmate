/**
 * Canonical TypeScript types for the full agreement structure.
 * Used by both mobile (Gator) and Shyftmate web portal.
 * These mirror the Pydantic schemas in api/app/schemas/agreement.py
 */

export type AgreementType = 'modern_award' | 'eba'
export type AgreementStatus = 'draft' | 'active' | 'superseded' | 'archived'
export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'error'
export type AllowanceClass = 'C' | 'D' | 'R' | 'P'  // Claimable | Derivable | Recurring | Payrollable
export type LeavePaycodeCategory = 'duration' | 'other'

export interface Agreement {
  id: string
  parent_version_id: string | null
  version: number
  agreement_type: AgreementType
  agreement_code: string
  exhr_name: string | null
  agreement_name: string
  agreement_number: string | null
  effective_from: string | null   // ISO date
  effective_to: string | null
  payroll_frequency: string | null
  pay_week_definition: string | null
  pay_day: string | null
  metadata_: Record<string, unknown> | null
  status: AgreementStatus
  created_by: string | null
  validated_by: string | null
  validated_at: string | null
  sync_status: SyncStatus
  sync_error: string | null
  sync_attempted_at: string | null
  created_at: string
  updated_at: string
  // Nested relationships (only when fetched with detail)
  employee_type_configs?: EmployeeTypeConfig[]
  allowances?: AgreementAllowance[]
  leave_paycodes?: AgreementLeavePaycode[]
  wage_grades?: WageGrade[]
  kronos_config?: KronosConfig | null
}

export interface EmployeeTypeConfig {
  id: string
  agreement_id: string
  emp_type: string
  label: string
  ord_hours_per_week: number | null
  ord_hours_per_day: number | null
  rdo_accrual_per_day: number | null
  overnight_shift_rule: string | null
  ordinary_span: string | null
  afternoon_shift_definition: string | null
  night_shift_definition: string | null
  sort_order: number
  created_at: string
  updated_at: string
  // Nested
  rule_lines?: RuleLine[]
}

export interface RuleLine {
  id: string
  emp_type_config_id: string
  parent_rule_id: string | null
  scenario: string | null
  rule_definition: string | null
  timesheet_input: string | null
  kronos_name: string | null
  jde_standard_costing: string | null
  jde_billing: string | null
  expreshr_name: string | null
  payslip_name: string | null
  clause_ref: string | null
  page_ref: number | null
  sort_order: number
  created_at: string
  updated_at: string
  // Nested sub-rules
  sub_rules?: RuleLine[]
}

export interface AgreementAllowance {
  id: string
  agreement_id: string
  allowance_name: string
  rule_definition: string | null
  kronos_name: string | null
  jde_standard_costing: string | null
  jde_billing: string | null
  expreshr_name: string | null
  payslip_name: string | null
  clause_ref: string | null
  page_ref: number | null
  allowance_class: AllowanceClass | null
  sub_kronos_name: string | null
  sort_order: number
}

export interface AgreementLeavePaycode {
  id: string
  agreement_id: string
  paycode: string
  is_required: boolean
  category: LeavePaycodeCategory
  sort_order: number
}

export interface WageGrade {
  id: string
  agreement_id: string
  grade_name: string
  classification: string | null
  level_number: number | null
  exhr_grade_name: string | null
  rates: Record<string, unknown> | null
  sort_order: number
}

export interface KronosConfig {
  id: string
  agreement_id: string
  fixed_rule: string | null
  exception_rule: string | null
  rounding_rule: string | null
  break_rule: string | null
  punch_interpretation_rule: string | null
  day_divide: string | null
  shift_guarantee: string | null
  work_rules_access_profile: string | null
  pay_codes_access_profile: string | null
  standard_hours: number | null
  activity_profile: string | null
  access_profile: string | null
  interactive_processes: string[] | null
  payrule_mappings: PayruleMapping[] | null
  recurring_allowances: Record<string, unknown> | null
}

export interface PayruleMapping {
  eba: string
  payrule_name: string
  description: string
}

export interface KronosPaycode {
  id: string
  aus_oracle_element: string | null
  paycode: string
  paycode_type: 'Hours' | 'Allowance' | 'Penalty' | null
  aus_oracle_leave_reason: string | null
  export_to_payroll: boolean
  is_active: boolean
}

// ── Conversation / Telephony ─────────────────────────────────

export interface ConversationSession {
  id: string
  device_id: string
  agreement_id: string | null
  state_machine: Record<string, unknown> | null
  extracted_data: Record<string, unknown> | null
  current_node: string
  is_complete: boolean
  completed_at: string | null
  session_type: 'mobile' | 'telephony'
  created_at: string
  updated_at: string
  messages?: ChatMessage[]
}

export interface ChatMessage {
  id: string
  session_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  token_count: number | null
  created_at: string
}

export interface Prospect {
  id: string
  caller_phone: string | null
  caller_name: string | null
  company_name: string | null
  company_email: string | null
  agreement_id: string | null
  session_id: string | null
  status: 'new' | 'reviewed' | 'invited' | 'converted' | 'declined'
  admin_notes: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  invited_at: string | null
  created_at: string
  updated_at: string
}
