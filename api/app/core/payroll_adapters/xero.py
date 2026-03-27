"""Xero Payroll CSV file export adapter."""
import csv
import io
import logging

from app.core.payroll_adapters.base import ExportResult, PayrollAdapter

logger = logging.getLogger(__name__)


class XeroAdapter(PayrollAdapter):
    """
    Generates Xero Payroll-compatible CSV files.
    Returns the CSV content in ExportResult.payload["file_content"].
    """

    async def test_connection(self) -> bool:
        # File-based adapter — always available
        return True

    async def export_agreement(self, agreement_id: str, db) -> ExportResult:
        """Generate Xero Payroll earnings rates CSV from agreement data."""
        try:
            from sqlalchemy import select
            from app.models.agreement import Agreement, AgreementAllowance, WageGrade

            result = await db.execute(select(Agreement).where(Agreement.id == agreement_id))
            agreement = result.scalar_one_or_none()
            if agreement is None:
                return ExportResult(success=False, platform="xero", records_exported=0, errors=[f"Agreement {agreement_id} not found"])

            output = io.StringIO()
            writer = csv.writer(output)

            # Xero Payroll Earnings Rates import format
            writer.writerow([
                "Name",
                "EarningsType",
                "RateType",
                "RatePerUnit",
                "Multiplier",
                "AccrueLeave",
                "TypeOfUnits",
                "CurrentRecord",
            ])

            records_exported = 0

            # Wage grades → earnings rates
            wg_result = await db.execute(select(WageGrade).where(WageGrade.agreement_id == agreement_id))
            for wg in wg_result.scalars().all():
                rates = wg.rates or {}
                hourly_rate = rates.get("hourly_rate", rates.get("base_rate", "0.00"))
                writer.writerow([
                    wg.grade_name,
                    "REGULAREARNINGS",
                    "RATEPERUNIT",
                    str(hourly_rate),
                    "1.0",
                    "true",
                    "Hours",
                    "Y",
                ])
                records_exported += 1

            # Allowances
            al_result = await db.execute(select(AgreementAllowance).where(AgreementAllowance.agreement_id == agreement_id))
            for al in al_result.scalars().all():
                allowance_type = "ALLOWANCE"
                if al.allowance_class == "R":
                    allowance_type = "REGULAREARNINGS"
                writer.writerow([
                    al.payslip_name or al.allowance_name,
                    allowance_type,
                    "FIXEDAMOUNT",
                    "0.00",
                    "1.0",
                    "false",
                    "Hours",
                    "Y",
                ])
                records_exported += 1

            csv_content = output.getvalue()

            return ExportResult(
                success=True,
                platform="xero",
                records_exported=records_exported,
                errors=[],
                payload={
                    "file_content": csv_content,
                    "filename": f"xero_earnings_rates_{agreement.agreement_code}.csv",
                    "content_type": "text/csv",
                },
            )

        except Exception as e:
            logger.error("Xero export_agreement error: %s", e)
            return ExportResult(success=False, platform="xero", records_exported=0, errors=[str(e)])

    async def export_timesheets(self, timesheet_ids: list[str], db) -> ExportResult:
        """Generate Xero Payroll timesheet import CSV."""
        try:
            from sqlalchemy import select
            from app.models.workforce import Timesheet, TimesheetEntry

            output = io.StringIO()
            writer = csv.writer(output)

            # Xero Timesheets CSV format
            writer.writerow([
                "Employee FirstName",
                "Employee LastName",
                "Employee Email",
                "Start Date",
                "End Date",
                "EarningsLineCategory",
                "NumberOfUnits",
            ])

            records_exported = 0
            errors = []

            for ts_id in timesheet_ids:
                ts_result = await db.execute(select(Timesheet).where(Timesheet.id == ts_id))
                ts = ts_result.scalar_one_or_none()
                if ts is None:
                    errors.append(f"Timesheet {ts_id} not found")
                    continue

                # Load user for name/email
                from app.models.user import User
                user_result = await db.execute(select(User).where(User.id == ts.user_id))
                user = user_result.scalar_one_or_none()
                first_name = user.first_name if user else ""
                last_name = user.last_name if user else ""
                email = user.email if user else ""

                entries_result = await db.execute(select(TimesheetEntry).where(TimesheetEntry.timesheet_id == ts_id))
                for entry in entries_result.scalars().all():
                    total_hours = float(entry.ordinary_hours or 0) + float(entry.overtime_hours or 0)
                    if total_hours > 0:
                        writer.writerow([
                            first_name,
                            last_name,
                            email,
                            str(entry.date),
                            str(entry.date),
                            entry.rule_key or "Ordinary Time",
                            str(round(total_hours, 2)),
                        ])
                        records_exported += 1

            csv_content = output.getvalue()

            return ExportResult(
                success=len(errors) == 0,
                platform="xero",
                records_exported=records_exported,
                errors=errors,
                payload={
                    "file_content": csv_content,
                    "filename": "xero_timesheets.csv",
                    "content_type": "text/csv",
                },
            )

        except Exception as e:
            logger.error("Xero export_timesheets error: %s", e)
            return ExportResult(success=False, platform="xero", records_exported=0, errors=[str(e)])
