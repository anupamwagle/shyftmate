-- Global Kronos Paycodes Library
-- Sourced from: Kronos Rules Spec - Sample.xlsx, "List of Kronos Paycodes" sheet
-- These are platform-wide reference codes, not agreement-specific

INSERT INTO kronos_paycodes (id, aus_oracle_element, paycode, paycode_type, aus_oracle_leave_reason, export_to_payroll, is_active)
VALUES
    -- Hours paycodes
    (gen_random_uuid(), 'OTE', 'WORK_TIME', 'Hours', NULL, true, true),
    (gen_random_uuid(), 'OTE', 'ORD_TIME', 'Hours', NULL, true, true),
    (gen_random_uuid(), 'OVERTIME', 'OVERTIME_1_5', 'Hours', NULL, true, true),
    (gen_random_uuid(), 'OVERTIME', 'OVERTIME_2_0', 'Hours', NULL, true, true),
    (gen_random_uuid(), 'DOUBLE_TIME', 'DOUBLE_TIME', 'Hours', NULL, true, true),
    (gen_random_uuid(), 'PENALTY', 'SAT_ORD', 'Hours', NULL, true, true),
    (gen_random_uuid(), 'PENALTY', 'SUN_ORD', 'Hours', NULL, true, true),
    (gen_random_uuid(), 'PENALTY', 'PH_ORD', 'Hours', NULL, true, true),
    (gen_random_uuid(), 'PENALTY', 'PH_NOT_WORKED', 'Hours', NULL, true, true),
    (gen_random_uuid(), 'NIGHT_SHIFT', 'NIGHT_SHIFT_ALLOW', 'Hours', NULL, true, true),
    (gen_random_uuid(), 'AFT_SHIFT', 'AFT_SHIFT_ALLOW', 'Hours', NULL, true, true),
    -- Leave paycodes
    (gen_random_uuid(), 'ANNUAL_LEAVE', 'AL_TAKEN', 'Hours', 'Annual Leave', true, true),
    (gen_random_uuid(), 'ANNUAL_LEAVE_LOADING', 'AL_LOADING', 'Hours', 'Annual Leave Loading', true, true),
    (gen_random_uuid(), 'PERSONAL_LEAVE', 'PL_TAKEN', 'Hours', 'Personal/Carer Leave', true, true),
    (gen_random_uuid(), 'LONG_SERVICE_LEAVE', 'LSL_TAKEN', 'Hours', 'Long Service Leave', true, true),
    (gen_random_uuid(), 'COMPASSIONATE_LEAVE', 'COMP_LEAVE', 'Hours', 'Compassionate Leave', true, true),
    (gen_random_uuid(), 'LWOP', 'LWOP', 'Hours', 'Leave Without Pay', false, true),
    (gen_random_uuid(), 'WORKERS_COMP', 'WC_SUITABLE', 'Hours', 'Workers Comp Suitable Duties', true, true),
    -- Allowance paycodes
    (gen_random_uuid(), 'LAFHA', 'LAFHA', 'Allowance', NULL, true, true),
    (gen_random_uuid(), 'SITE_ALLOWANCE', 'SITE_ALW', 'Allowance', NULL, true, true),
    (gen_random_uuid(), 'SITE_ALLOWANCE_OT', 'SITE_ALW_OT', 'Allowance', NULL, true, true),
    (gen_random_uuid(), 'LEADING_HAND', 'LH_ALW', 'Allowance', NULL, true, true),
    (gen_random_uuid(), 'MEAL_ALLOWANCE', 'MEAL_ALW', 'Allowance', NULL, true, true),
    (gen_random_uuid(), 'TOOL_ALLOWANCE', 'TOOL_ALW', 'Allowance', NULL, true, true),
    (gen_random_uuid(), 'UNIFORM_ALLOWANCE', 'UNIFORM_ALW', 'Allowance', NULL, true, true),
    (gen_random_uuid(), 'VEHICLE_ALLOWANCE', 'VEHICLE_ALW', 'Allowance', NULL, true, true),
    (gen_random_uuid(), 'RDO_ACCRUAL', 'RDO_ACCR', 'Allowance', NULL, false, true),
    (gen_random_uuid(), 'RDO_TAKEN', 'RDO_TAKEN', 'Hours', NULL, true, true)
ON CONFLICT (paycode) DO NOTHING;
