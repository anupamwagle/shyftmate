// ─── Auth ─────────────────────────────────────────────────────────────────────

export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'manager'
  | 'employee'

export interface UserOut {
  id: string
  email: string
  first_name: string
  last_name: string
  role: UserRole
  org_id: string | null
  org_name: string | null
  avatar_url: string | null
  is_active: boolean
  last_login: string | null
  created_at: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  otp_pending?: boolean
  user?: UserOut
}

export interface OtpVerifyResponse {
  access_token: string
  refresh_token: string
  token_type: string
}

// ─── Organisations ────────────────────────────────────────────────────────────

export interface Org {
  id: string
  name: string
  slug: string
  plan: string
  is_active: boolean
  created_at: string
  user_count: number
}

// ─── Locations ────────────────────────────────────────────────────────────────

export interface Location {
  id: string
  org_id: string
  name: string
  address: string | null
  timezone: string
  is_active: boolean
  created_at: string
}

// ─── Employees / Users ────────────────────────────────────────────────────────

export interface Employee {
  id: string
  user_id: string
  org_id: string
  employee_number: string | null
  first_name: string
  last_name: string
  email: string
  role: UserRole
  location_id: string | null
  location_name: string | null
  is_active: boolean
  last_login: string | null
  avatar_url: string | null
  created_at: string
}

// ─── Schedule / Shifts ────────────────────────────────────────────────────────

export type ShiftStatus = 'open' | 'filled' | 'cancelled'

export interface Shift {
  id: string
  org_id: string
  location_id: string | null
  location_name: string | null
  user_id: string | null
  employee_name: string | null
  role_name: string | null
  start_time: string
  end_time: string
  break_minutes: number
  status: ShiftStatus
  notes: string | null
  is_published: boolean
  created_at: string
}

export interface ShiftCreateInput {
  user_id?: string | null
  location_id?: string | null
  role_name?: string | null
  start_time: string
  end_time: string
  break_minutes?: number
  notes?: string | null
}

// ─── Timesheets ───────────────────────────────────────────────────────────────

export type TimesheetStatus = 'draft' | 'submitted' | 'approved' | 'rejected'

export interface Timesheet {
  id: string
  org_id: string
  user_id: string
  employee_name: string
  period_start: string
  period_end: string
  status: TimesheetStatus
  total_hours: number
  total_cost: number
  location_id: string | null
  location_name: string | null
  submitted_at: string | null
  approved_at: string | null
  approved_by: string | null
  created_at: string
}

// ─── Leave ────────────────────────────────────────────────────────────────────

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export interface LeaveRequest {
  id: string
  org_id: string
  user_id: string
  employee_name: string
  leave_type_id: string
  leave_type_name: string
  start_date: string
  end_date: string
  days: number
  status: LeaveStatus
  notes: string | null
  approved_by: string | null
  approved_at: string | null
  created_at: string
}

export interface LeaveBalance {
  id: string
  user_id: string
  employee_name: string
  leave_type_id: string
  leave_type_name: string
  balance_days: number
  accrued_days: number
  taken_days: number
  updated_at: string
}

export interface LeaveType {
  id: string
  org_id: string
  name: string
  code: string
  accrual_rate: number
  is_active: boolean
  created_at: string
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export interface Message {
  id: string
  org_id: string
  sender_id: string
  sender_name: string
  sender_avatar: string | null
  content: string
  channel: string
  created_at: string
  is_read: boolean
}

export interface MessageChannel {
  id: string
  name: string
  type: 'general' | 'team' | 'direct'
  unread_count: number
  last_message: string | null
  last_message_at: string | null
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export interface LabourCostData {
  period: string
  cost: number
  hours: number
  location_name: string | null
}

export interface OvertimeData {
  employee_name: string
  regular_hours: number
  overtime_hours: number
  total_cost: number
  period: string
}

export interface LeaveLiabilityData {
  employee_name: string
  leave_type: string
  balance_days: number
  liability_amount: number
}

export interface AwardComplianceData {
  employee_name: string
  agreement_name: string
  rule_name: string
  expected: number
  actual: number
  variance: number
  compliant: boolean
  period: string
}

// ─── Agreements ───────────────────────────────────────────────────────────────

export type AgreementType = 'modern_award' | 'eba' | 'common_law'
export type AgreementStatus = 'draft' | 'active' | 'superseded' | 'archived'
export type SyncStatus = 'synced' | 'pending' | 'error' | 'not_configured'

export interface Agreement {
  id: string
  org_id: string | null
  name: string
  code: string
  type: AgreementType
  status: AgreementStatus
  version: number
  effective_date: string | null
  expiry_date: string | null
  description: string | null
  sync_status: SyncStatus
  last_synced_at: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface AgreementCreateInput {
  name: string
  code: string
  type: AgreementType
  description?: string | null
  effective_date?: string | null
  expiry_date?: string | null
}

export interface EmployeeType {
  id: string
  agreement_id: string
  name: string
  code: string
  description: string | null
  is_active: boolean
  created_at: string
}

export interface RuleLine {
  id: string
  agreement_id: string
  employee_type_id: string
  parent_rule_id: string | null
  rule_name: string
  rule_definition: string | null
  timesheet_input: string | null
  kronos_name: string | null
  jde_standard_costing: string | null
  jde_billing: string | null
  expreshr_name: string | null
  payslip_name: string | null
  clause_ref: string | null
  page_ref: string | null
  sort_order: number
  is_active: boolean
  children?: RuleLine[]
  created_at: string
}

export interface RuleLineCreateInput {
  employee_type_id: string
  parent_rule_id?: string | null
  rule_name: string
  rule_definition?: string | null
  timesheet_input?: string | null
  kronos_name?: string | null
  jde_standard_costing?: string | null
  jde_billing?: string | null
  expreshr_name?: string | null
  payslip_name?: string | null
  clause_ref?: string | null
  page_ref?: string | null
  sort_order?: number
}

export type AllowanceClass = 'C' | 'D' | 'R' | 'P'

export interface Allowance {
  id: string
  agreement_id: string
  employee_type_id: string | null
  name: string
  code: string
  allowance_class: AllowanceClass
  rate: number | null
  unit: string | null
  kronos_name: string | null
  payslip_name: string | null
  is_active: boolean
  created_at: string
}

export interface LeavePaycode {
  id: string
  agreement_id: string
  leave_type_name: string
  leave_type_code: string
  kronos_paycode: string | null
  keypay_code: string | null
  payslip_name: string | null
  accrual_rate: number | null
  is_active: boolean
  created_at: string
}

export interface WageTableEntry {
  id: string
  agreement_id: string
  employee_type_id: string | null
  classification: string
  level: string | null
  base_rate: number
  casual_loading: number | null
  effective_date: string
  expiry_date: string | null
  created_at: string
}

export interface KronosConfig {
  id: string
  agreement_id: string
  config_key: string
  config_value: string
  description: string | null
  created_at: string
}

export interface RecurringAllowance {
  id: string
  agreement_id: string
  employee_type_id: string | null
  name: string
  amount: number
  frequency: 'weekly' | 'fortnightly' | 'monthly'
  kronos_name: string | null
  is_active: boolean
  created_at: string
}

export interface AgreementHistory {
  id: string
  agreement_id: string
  action: string
  changed_by: string
  changed_at: string
  snapshot: Record<string, unknown> | null
  notes: string | null
}

// ─── Paycodes ─────────────────────────────────────────────────────────────────

export interface Paycode {
  id: string
  name: string
  code: string
  type: 'work' | 'leave' | 'allowance' | 'penalty'
  description: string | null
  kronos_code: string | null
  is_active: boolean
  created_at: string
}

// ─── Prospects ────────────────────────────────────────────────────────────────

export type ProspectStatus = 'new' | 'reviewed' | 'invited' | 'converted' | 'declined'

export interface Prospect {
  id: string
  caller_name: string | null
  company_name: string | null
  phone_number: string
  email: string | null
  status: ProspectStatus
  agreement_id: string | null
  agreement_name: string | null
  admin_notes: string | null
  call_recording_url: string | null
  transcript: string | null
  created_at: string
  updated_at: string
}

export interface ProspectStatusHistory {
  id: string
  prospect_id: string
  status: ProspectStatus
  changed_by: string | null
  changed_at: string
  notes: string | null
}

export interface ProvisionInput {
  org_name: string
  org_slug: string
  admin_email: string
  admin_first_name: string
  admin_last_name: string
}

// ─── Export ───────────────────────────────────────────────────────────────────

export type ExportPlatform = 'kronos' | 'keypay' | 'myob' | 'xero'
export type ExportJobStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface ExportPlatformConfig {
  platform: ExportPlatform
  name: string
  is_connected: boolean
  last_export_at: string | null
}

export interface ExportJob {
  id: string
  org_id: string
  platform: ExportPlatform
  status: ExportJobStatus
  records_exported: number | null
  error_message: string | null
  started_at: string
  completed_at: string | null
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

// ─── Audit ────────────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string
  org_id: string
  user_id: string | null
  user_name: string | null
  action: string
  resource_type: string
  resource_id: string | null
  details: Record<string, unknown> | null
  created_at: string
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface DashboardStats {
  labour_cost_this_week: number
  labour_cost_last_week: number
  pending_timesheet_approvals: number
  pending_leave_approvals: number
  clocked_in_now: ClockedInEmployee[]
  upcoming_shifts: Shift[]
  recent_activity: AuditEntry[]
  labour_cost_chart: LabourCostData[]
}

export interface ClockedInEmployee {
  user_id: string
  employee_name: string
  avatar_url: string | null
  clocked_in_at: string
  location_name: string | null
}
