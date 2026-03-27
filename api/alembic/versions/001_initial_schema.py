"""Initial schema — all tables

Revision ID: 001
Revises:
Create Date: 2025-01-01 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── organisations ────────────────────────────────────────────
    op.create_table(
        "organisations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("plan", sa.String(50), nullable=False, server_default="free"),
        sa.Column("timezone", sa.String(50), nullable=False, server_default="Australia/Sydney"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )

    # ── users ────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("hashed_password", sa.String(256), nullable=True),
        sa.Column("role", sa.String(30), nullable=False, server_default="employee"),
        sa.Column("first_name", sa.String(100), nullable=False, server_default=""),
        sa.Column("last_name", sa.String(100), nullable=False, server_default=""),
        sa.Column("phone", sa.String(30), nullable=True),
        sa.Column("avatar_url", sa.String(500), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("otp_secret", sa.String(32), nullable=True),
        sa.Column("otp_verified", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("google_sub", sa.String(200), nullable=True),
        sa.Column("apple_sub", sa.String(200), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["org_id"], ["organisations.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
        sa.UniqueConstraint("google_sub"),
        sa.UniqueConstraint("apple_sub"),
    )
    op.create_index("ix_users_email", "users", ["email"])

    # ── refresh_tokens ───────────────────────────────────────────
    op.create_table(
        "refresh_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("token_hash", sa.String(256), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default="false"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )

    # ── otp_codes ────────────────────────────────────────────────
    op.create_table(
        "otp_codes",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(10), nullable=False),
        sa.Column("purpose", sa.String(30), nullable=False, server_default="login"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── agreements ───────────────────────────────────────────────
    op.create_table(
        "agreements",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("parent_version_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("agreement_type", sa.String(30), nullable=False, server_default="modern_award"),
        sa.Column("agreement_code", sa.String(50), nullable=False),
        sa.Column("exhr_name", sa.String(200), nullable=True),
        sa.Column("agreement_name", sa.String(300), nullable=False),
        sa.Column("agreement_number", sa.String(100), nullable=True),
        sa.Column("effective_from", sa.Date(), nullable=True),
        sa.Column("effective_to", sa.Date(), nullable=True),
        sa.Column("payroll_frequency", sa.String(30), nullable=True),
        sa.Column("pay_week_definition", sa.String(30), nullable=True),
        sa.Column("pay_day", sa.String(30), nullable=True),
        sa.Column("metadata", postgresql.JSONB(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("validated_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("validated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sync_status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("sync_error", sa.Text(), nullable=True),
        sa.Column("sync_attempted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["parent_version_id"], ["agreements.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agreements_agreement_code", "agreements", ["agreement_code"])
    op.create_index("ix_agreements_status", "agreements", ["status"])

    # ── employee_type_configs ────────────────────────────────────
    op.create_table(
        "employee_type_configs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("agreement_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("emp_type", sa.String(50), nullable=False),
        sa.Column("label", sa.String(100), nullable=False),
        sa.Column("ord_hours_per_week", sa.Numeric(5, 2), nullable=True),
        sa.Column("ord_hours_per_day", sa.Numeric(5, 2), nullable=True),
        sa.Column("rdo_accrual_per_day", sa.Numeric(5, 4), nullable=True),
        sa.Column("overnight_shift_rule", sa.String(20), nullable=True),
        sa.Column("ordinary_span", sa.String(100), nullable=True),
        sa.Column("afternoon_shift_definition", sa.Text(), nullable=True),
        sa.Column("night_shift_definition", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["agreement_id"], ["agreements.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── rule_lines ───────────────────────────────────────────────
    op.create_table(
        "rule_lines",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("emp_type_config_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("parent_rule_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("scenario", sa.String(200), nullable=True),
        sa.Column("rule_definition", sa.Text(), nullable=True),
        sa.Column("timesheet_input", sa.String(100), nullable=True),
        sa.Column("kronos_name", sa.String(100), nullable=True),
        sa.Column("jde_standard_costing", sa.String(100), nullable=True),
        sa.Column("jde_billing", sa.String(100), nullable=True),
        sa.Column("expreshr_name", sa.String(200), nullable=True),
        sa.Column("payslip_name", sa.String(200), nullable=True),
        sa.Column("clause_ref", sa.String(50), nullable=True),
        sa.Column("page_ref", sa.Integer(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["emp_type_config_id"], ["employee_type_configs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_rule_id"], ["rule_lines.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── agreement_allowances ─────────────────────────────────────
    op.create_table(
        "agreement_allowances",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("agreement_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("allowance_name", sa.String(200), nullable=False),
        sa.Column("rule_definition", sa.Text(), nullable=True),
        sa.Column("kronos_name", sa.String(100), nullable=True),
        sa.Column("jde_standard_costing", sa.String(100), nullable=True),
        sa.Column("jde_billing", sa.String(100), nullable=True),
        sa.Column("expreshr_name", sa.String(200), nullable=True),
        sa.Column("payslip_name", sa.String(200), nullable=True),
        sa.Column("clause_ref", sa.String(50), nullable=True),
        sa.Column("page_ref", sa.Integer(), nullable=True),
        sa.Column("allowance_class", sa.String(1), nullable=True),
        sa.Column("sub_kronos_name", sa.String(100), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["agreement_id"], ["agreements.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── agreement_leave_paycodes ─────────────────────────────────
    op.create_table(
        "agreement_leave_paycodes",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("agreement_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("paycode", sa.String(100), nullable=False),
        sa.Column("is_required", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("category", sa.String(20), nullable=False, server_default="duration"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["agreement_id"], ["agreements.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── wage_grades ──────────────────────────────────────────────
    op.create_table(
        "wage_grades",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("agreement_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("grade_name", sa.String(200), nullable=False),
        sa.Column("classification", sa.String(100), nullable=True),
        sa.Column("level_number", sa.Integer(), nullable=True),
        sa.Column("exhr_grade_name", sa.String(300), nullable=True),
        sa.Column("rates", postgresql.JSONB(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["agreement_id"], ["agreements.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── kronos_configs ───────────────────────────────────────────
    op.create_table(
        "kronos_configs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("agreement_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("fixed_rule", sa.String(100), nullable=True),
        sa.Column("exception_rule", sa.String(100), nullable=True),
        sa.Column("rounding_rule", sa.String(100), nullable=True),
        sa.Column("break_rule", sa.String(100), nullable=True),
        sa.Column("punch_interpretation_rule", sa.String(100), nullable=True),
        sa.Column("day_divide", sa.String(50), nullable=True),
        sa.Column("shift_guarantee", sa.String(50), nullable=True),
        sa.Column("work_rules_access_profile", sa.String(100), nullable=True),
        sa.Column("pay_codes_access_profile", sa.String(100), nullable=True),
        sa.Column("standard_hours", sa.Numeric(5, 2), nullable=True),
        sa.Column("activity_profile", sa.String(100), nullable=True),
        sa.Column("access_profile", sa.String(100), nullable=True),
        sa.Column("interactive_processes", postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column("payrule_mappings", postgresql.JSONB(), nullable=True),
        sa.Column("recurring_allowances", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["agreement_id"], ["agreements.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("agreement_id"),
    )

    # ── kronos_paycodes ──────────────────────────────────────────
    op.create_table(
        "kronos_paycodes",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("aus_oracle_element", sa.String(200), nullable=True),
        sa.Column("paycode", sa.String(100), nullable=False),
        sa.Column("paycode_type", sa.String(50), nullable=True),
        sa.Column("aus_oracle_leave_reason", sa.String(200), nullable=True),
        sa.Column("export_to_payroll", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("paycode"),
    )

    # ── locations ────────────────────────────────────────────────
    op.create_table(
        "locations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("address", sa.String(500), nullable=True),
        sa.Column("timezone", sa.String(50), nullable=False, server_default="Australia/Sydney"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["org_id"], ["organisations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── employee_profiles ────────────────────────────────────────
    op.create_table(
        "employee_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("employment_type", sa.String(30), nullable=False, server_default="full_time"),
        sa.Column("award_code", sa.String(50), nullable=True),
        sa.Column("base_hourly_rate", sa.Numeric(10, 4), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("tax_file_number_encrypted", sa.Text(), nullable=True),
        sa.Column("bank_details_encrypted", postgresql.JSONB(), nullable=True),
        sa.Column("emergency_contact", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["org_id"], ["organisations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )

    # ── employee_availability ────────────────────────────────────
    op.create_table(
        "employee_availability",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("day_of_week", sa.Integer(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=True),
        sa.Column("end_time", sa.Time(), nullable=True),
        sa.Column("is_unavailable", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("effective_from", sa.Date(), nullable=True),
        sa.Column("effective_to", sa.Date(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── rosters ──────────────────────────────────────────────────
    op.create_table(
        "rosters",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("location_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("week_start", sa.Date(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["org_id"], ["organisations.id"]),
        sa.ForeignKeyConstraint(["location_id"], ["locations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── shifts ───────────────────────────────────────────────────
    op.create_table(
        "shifts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("roster_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("location_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("assigned_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("role", sa.String(100), nullable=True),
        sa.Column("start_datetime", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_datetime", sa.DateTime(timezone=True), nullable=False),
        sa.Column("break_minutes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["roster_id"], ["rosters.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["location_id"], ["locations.id"]),
        sa.ForeignKeyConstraint(["assigned_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── clock_events ─────────────────────────────────────────────
    op.create_table(
        "clock_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("location_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("shift_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("event_type", sa.String(30), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("gps_lat", sa.Numeric(10, 7), nullable=True),
        sa.Column("gps_lng", sa.Numeric(10, 7), nullable=True),
        sa.Column("method", sa.String(20), nullable=False, server_default="mobile"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["location_id"], ["locations.id"]),
        sa.ForeignKeyConstraint(["shift_id"], ["shifts.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── timesheets ───────────────────────────────────────────────
    op.create_table(
        "timesheets",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("location_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("total_hours", sa.Numeric(8, 2), nullable=True),
        sa.Column("total_cost", sa.Numeric(12, 2), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["org_id"], ["organisations.id"]),
        sa.ForeignKeyConstraint(["location_id"], ["locations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── timesheet_entries ────────────────────────────────────────
    op.create_table(
        "timesheet_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("timesheet_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("start_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("break_minutes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("award_code", sa.String(50), nullable=True),
        sa.Column("rule_key", sa.String(100), nullable=True),
        sa.Column("ordinary_hours", sa.Numeric(8, 2), nullable=True),
        sa.Column("overtime_hours", sa.Numeric(8, 2), nullable=True),
        sa.Column("penalty_multiplier", sa.Numeric(5, 4), nullable=True),
        sa.Column("calculated_cost", sa.Numeric(12, 2), nullable=True),
        sa.Column("is_manual_override", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("override_reason", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["timesheet_id"], ["timesheets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── leave_types ──────────────────────────────────────────────
    op.create_table(
        "leave_types",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("is_paid", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("accrual_rate", sa.Numeric(8, 4), nullable=True),
        sa.Column("requires_approval", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("max_balance_days", sa.Numeric(8, 2), nullable=True),
        sa.ForeignKeyConstraint(["org_id"], ["organisations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── leave_balances ───────────────────────────────────────────
    op.create_table(
        "leave_balances",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("leave_type_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("balance_days", sa.Numeric(8, 2), nullable=False, server_default="0"),
        sa.Column("accrued_days", sa.Numeric(8, 2), nullable=False, server_default="0"),
        sa.Column("taken_days", sa.Numeric(8, 2), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["leave_type_id"], ["leave_types.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── leave_requests ───────────────────────────────────────────
    op.create_table(
        "leave_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("leave_type_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("total_days", sa.Numeric(8, 2), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("manager_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("managed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["leave_type_id"], ["leave_types.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── announcements ────────────────────────────────────────────
    op.create_table(
        "announcements",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("audience_filter", postgresql.JSONB(), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["org_id"], ["organisations.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── messages ─────────────────────────────────────────────────
    op.create_table(
        "messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sender_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("recipient_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("group_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["org_id"], ["organisations.id"]),
        sa.ForeignKeyConstraint(["sender_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["recipient_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── conversation_sessions ────────────────────────────────────
    op.create_table(
        "conversation_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("device_id", sa.String(200), nullable=False),
        sa.Column("agreement_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("state_machine", postgresql.JSONB(), nullable=True),
        sa.Column("extracted_data", postgresql.JSONB(), nullable=True),
        sa.Column("current_node", sa.String(100), nullable=False, server_default="intro"),
        sa.Column("is_complete", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("session_type", sa.String(20), nullable=False, server_default="mobile"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["agreement_id"], ["agreements.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_conversation_sessions_device_id", "conversation_sessions", ["device_id"])

    # ── chat_messages ────────────────────────────────────────────
    op.create_table(
        "chat_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("token_count", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["conversation_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_chat_messages_session_id", "chat_messages", ["session_id"])

    # ── prospects ────────────────────────────────────────────────
    op.create_table(
        "prospects",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("caller_phone", sa.String(30), nullable=True),
        sa.Column("caller_name", sa.String(200), nullable=True),
        sa.Column("company_name", sa.String(300), nullable=True),
        sa.Column("company_email", sa.String(320), nullable=True),
        sa.Column("agreement_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="new"),
        sa.Column("admin_notes", sa.Text(), nullable=True),
        sa.Column("reviewed_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("invited_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["agreement_id"], ["agreements.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["session_id"], ["conversation_sessions.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_prospects_status", "prospects", ["status"])

    # ── audit_logs ───────────────────────────────────────────────
    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("actor", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("before_payload", postgresql.JSONB(), nullable=True),
        sa.Column("after_payload", postgresql.JSONB(), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["actor"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_logs_entity_type", "audit_logs", ["entity_type"])
    op.create_index("ix_audit_logs_entity_id", "audit_logs", ["entity_id"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("prospects")
    op.drop_table("chat_messages")
    op.drop_table("conversation_sessions")
    op.drop_table("messages")
    op.drop_table("announcements")
    op.drop_table("leave_requests")
    op.drop_table("leave_balances")
    op.drop_table("leave_types")
    op.drop_table("timesheet_entries")
    op.drop_table("timesheets")
    op.drop_table("clock_events")
    op.drop_table("shifts")
    op.drop_table("rosters")
    op.drop_table("employee_availability")
    op.drop_table("employee_profiles")
    op.drop_table("locations")
    op.drop_table("kronos_paycodes")
    op.drop_table("kronos_configs")
    op.drop_table("wage_grades")
    op.drop_table("agreement_leave_paycodes")
    op.drop_table("agreement_allowances")
    op.drop_table("rule_lines")
    op.drop_table("employee_type_configs")
    op.drop_table("agreements")
    op.drop_table("otp_codes")
    op.drop_table("refresh_tokens")
    op.drop_table("users")
    op.drop_table("organisations")
