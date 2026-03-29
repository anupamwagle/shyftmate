"""Add organisation settings columns + leave_types code/color/is_active columns.

Revision ID: 004
Revises: 003
Create Date: 2026-03-29 00:00:00.000000
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Organisation settings columns
    op.add_column("organisations", sa.Column("payroll_frequency", sa.String(20), nullable=False, server_default="weekly"))
    op.add_column("organisations", sa.Column("pay_week_start", sa.String(10), nullable=False, server_default="Monday"))
    op.add_column("organisations", sa.Column("overtime_threshold_daily", sa.Float, nullable=False, server_default="7.6"))
    op.add_column("organisations", sa.Column("overtime_threshold_weekly", sa.Float, nullable=False, server_default="38.0"))
    op.add_column("organisations", sa.Column("rounding_interval", sa.Integer, nullable=False, server_default="15"))
    op.add_column("organisations", sa.Column("require_gps_clock", sa.Boolean, nullable=False, server_default="false"))
    op.add_column("organisations", sa.Column("clock_in_radius_meters", sa.Integer, nullable=False, server_default="200"))
    op.add_column("organisations", sa.Column("email_notifications", sa.Boolean, nullable=False, server_default="true"))
    op.add_column("organisations", sa.Column("sms_notifications", sa.Boolean, nullable=False, server_default="false"))

    # Leave types extra columns
    op.add_column("leave_types", sa.Column("code", sa.String(10), nullable=False, server_default=""))
    op.add_column("leave_types", sa.Column("color", sa.String(20), nullable=False, server_default="#6366f1"))
    op.add_column("leave_types", sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"))
    op.alter_column("leave_types", "max_balance_days", new_column_name="max_balance")


def downgrade() -> None:
    # Leave types
    op.alter_column("leave_types", "max_balance", new_column_name="max_balance_days")
    op.drop_column("leave_types", "is_active")
    op.drop_column("leave_types", "color")
    op.drop_column("leave_types", "code")

    # Organisation settings
    op.drop_column("organisations", "sms_notifications")
    op.drop_column("organisations", "email_notifications")
    op.drop_column("organisations", "clock_in_radius_meters")
    op.drop_column("organisations", "require_gps_clock")
    op.drop_column("organisations", "rounding_interval")
    op.drop_column("organisations", "overtime_threshold_weekly")
    op.drop_column("organisations", "overtime_threshold_daily")
    op.drop_column("organisations", "pay_week_start")
    op.drop_column("organisations", "payroll_frequency")
