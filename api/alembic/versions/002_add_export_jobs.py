"""Add payroll_export_jobs table

Revision ID: 002
Revises: 001
Create Date: 2025-01-02 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "payroll_export_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("platform", sa.String(30), nullable=False),
        sa.Column("agreement_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("timesheet_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("result_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["org_id"], ["organisations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_payroll_export_jobs_org_id", "payroll_export_jobs", ["org_id"])
    op.create_index("ix_payroll_export_jobs_status", "payroll_export_jobs", ["status"])
    op.create_index("ix_payroll_export_jobs_created_at", "payroll_export_jobs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_payroll_export_jobs_created_at", table_name="payroll_export_jobs")
    op.drop_index("ix_payroll_export_jobs_status", table_name="payroll_export_jobs")
    op.drop_index("ix_payroll_export_jobs_org_id", table_name="payroll_export_jobs")
    op.drop_table("payroll_export_jobs")
