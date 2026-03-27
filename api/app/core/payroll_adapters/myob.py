"""MYOB Payroll CSV file export adapter."""
import csv
import io
import logging

from app.core.payroll_adapters.base import ExportResult, PayrollAdapter

logger = logging.getLogger(__name__)


class MYOBAdapter(PayrollAdapter):
    """
    Generates MYOB-compatible CSV files for payroll import.
    Returns the CSV content in ExportResult.payload["file_content"].
    """

    async def test_connection(self) -> bool:
        # File-based adapter — always available
        return True

    async def export_agreement(self, agreement_id: str, db) -> ExportResult:
        """Generate MYOB pay codes CSV from agreement allowances and rule lines."""
        try:
            from sqlalchemy import select
            from app.models.agreement import Agreement, AgreementAllowance, WageGrade

            result = await db.execute(select(Agreement).where(Agreement.id == agreement_id))
            agreement = result.scalar_one_or_none()
            if agreement is None:
                return ExportResult(success=False, platform="myob", records_exported=0, errors=[f"Agreement {agreement_id} not found"])

            output = io.StringIO()
            writer = csv.writer(output)

            # Header row — MYOB Pay Codes import format
            writer.writerow(["Co./Last Name", "Pay Code", "Pay Code Type", "Rate", "Unit Type", "Notes"])

            records_exported = 0

            # Export wage grades as hourly rates
            wg_result = await db.execute(select(WageGrade).where(WageGrade.agreement_id == agreement_id))
            for wg in wg_result.scalars().all():
                rates = wg.rates or {}
                hourly_rate = rates.get("hourly_rate", rates.get("base_rate", ""))
                writer.writerow([
                    agreement.agreement_code,
                    wg.grade_name,
                    "Hourly",
                    str(hourly_rate),
                    "Hours",
                    wg.classification or "",
                ])
                records_exported += 1

            # Export allowances
            al_result = await db.execute(select(AgreementAllowance).where(AgreementAllowance.agreement_id == agreement_id))
            for al in al_result.scalars().all():
                writer.writerow([
                    agreement.agreement_code,
                    al.payslip_name or al.allowance_name,
                    "Allowance",
                    "",
                    "Fixed",
                    al.allowance_name,
                ])
                records_exported += 1

            csv_content = output.getvalue()

            return ExportResult(
                success=True,
                platform="myob",
                records_exported=records_exported,
                errors=[],
                payload={
                    "file_content": csv_content,
                    "filename": f"myob_paycodes_{agreement.agreement_code}.csv",
                    "content_type": "text/csv",
                },
            )

        except Exception as e:
            logger.error("MYOB export_agreement error: %s", e)
            return ExportResult(success=False, platform="myob", records_exported=0, errors=[str(e)])

    async def export_timesheets(self, timesheet_ids: list[str], db) -> ExportResult:
        """Generate MYOB Payroll timesheet CSV."""
        try:
            from sqlalchemy import select
            from app.models.workforce import Timesheet, TimesheetEntry
            from app.models.user import User

            output = io.StringIO()
            writer = csv.writer(output)

            # MYOB Timesheets import format
            writer.writerow([
                "Employee ID",
                "Pay Period Start",
                "Pay Period End",
                "Date",
                "Start Time",
                "End Time",
                "Break Minutes",
                "Ordinary Hours",
                "Overtime Hours",
                "Award Code",
            ])

            records_exported = 0
            errors = []

            for ts_id in timesheet_ids:
                ts_result = await db.execute(select(Timesheet).where(Timesheet.id == ts_id))
                ts = ts_result.scalar_one_or_none()
                if ts is None:
                    errors.append(f"Timesheet {ts_id} not found")
                    continue

                entries_result = await db.execute(select(TimesheetEntry).where(TimesheetEntry.timesheet_id == ts_id))
                for entry in entries_result.scalars().all():
                    writer.writerow([
                        str(ts.user_id),
                        str(ts.period_start),
                        str(ts.period_end),
                        str(entry.date),
                        entry.start_time.strftime("%H:%M") if entry.start_time else "",
                        entry.end_time.strftime("%H:%M") if entry.end_time else "",
                        entry.break_minutes,
                        str(entry.ordinary_hours or ""),
                        str(entry.overtime_hours or ""),
                        entry.award_code or "",
                    ])
                    records_exported += 1

            csv_content = output.getvalue()

            return ExportResult(
                success=len(errors) == 0,
                platform="myob",
                records_exported=records_exported,
                errors=errors,
                payload={
                    "file_content": csv_content,
                    "filename": "myob_timesheets.csv",
                    "content_type": "text/csv",
                },
            )

        except Exception as e:
            logger.error("MYOB export_timesheets error: %s", e)
            return ExportResult(success=False, platform="myob", records_exported=0, errors=[str(e)])
