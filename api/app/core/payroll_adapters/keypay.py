"""KeyPay / Employment Hero REST payroll adapter."""
import logging

import httpx

from app.core.payroll_adapters.base import ExportResult, PayrollAdapter

logger = logging.getLogger(__name__)

KEYPAY_BASE_URL = "https://api.keypay.com.au/api/v2"


class KeyPayAdapter(PayrollAdapter):
    """
    Exports award agreements and timesheets to KeyPay / Employment Hero.
    Uses API key authentication.
    """

    def __init__(self, api_key: str = "", business_id: str = ""):
        self.api_key = api_key
        self.business_id = business_id

    def _headers(self) -> dict:
        import base64
        credentials = base64.b64encode(f"{self.api_key}:".encode()).decode()
        return {
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/json",
        }

    async def test_connection(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{KEYPAY_BASE_URL}/business/{self.business_id}",
                    headers=self._headers(),
                )
                return response.status_code == 200
        except Exception as e:
            logger.error("KeyPay connection test failed: %s", e)
            return False

    async def export_agreement(self, agreement_id: str, db) -> ExportResult:
        """Map rule lines to KeyPay pay categories."""
        try:
            from sqlalchemy import select
            from app.models.agreement import Agreement, AgreementAllowance, RuleLine, EmployeeTypeConfig

            result = await db.execute(select(Agreement).where(Agreement.id == agreement_id))
            agreement = result.scalar_one_or_none()
            if agreement is None:
                return ExportResult(success=False, platform="keypay", records_exported=0, errors=[f"Agreement {agreement_id} not found"])

            records_exported = 0
            errors = []

            # Export allowances as pay categories
            allowances_result = await db.execute(
                select(AgreementAllowance).where(AgreementAllowance.agreement_id == agreement_id)
            )
            allowances = allowances_result.scalars().all()

            async with httpx.AsyncClient(timeout=30.0) as client:
                for allowance in allowances:
                    payload = {
                        "name": allowance.allowance_name,
                        "rateType": "Fixed",
                        "units": 1,
                        "generalLedgerMappingCode": allowance.jde_standard_costing,
                    }
                    resp = await client.post(
                        f"{KEYPAY_BASE_URL}/business/{self.business_id}/paycategory",
                        headers=self._headers(),
                        json=payload,
                    )
                    if resp.status_code in (200, 201):
                        records_exported += 1
                    else:
                        errors.append(f"Pay category '{allowance.allowance_name}' failed: {resp.status_code}")

            return ExportResult(
                success=len(errors) == 0,
                platform="keypay",
                records_exported=records_exported,
                errors=errors,
                payload={"agreement_id": agreement_id},
            )

        except Exception as e:
            logger.error("KeyPay export_agreement error: %s", e)
            return ExportResult(success=False, platform="keypay", records_exported=0, errors=[str(e)])

    async def export_timesheets(self, timesheet_ids: list[str], db) -> ExportResult:
        """Export timesheet entries to KeyPay."""
        try:
            from sqlalchemy import select
            from app.models.workforce import Timesheet, TimesheetEntry

            records_exported = 0
            errors = []

            async with httpx.AsyncClient(timeout=30.0) as client:
                for ts_id in timesheet_ids:
                    ts_result = await db.execute(select(Timesheet).where(Timesheet.id == ts_id))
                    ts = ts_result.scalar_one_or_none()
                    if ts is None:
                        errors.append(f"Timesheet {ts_id} not found")
                        continue

                    entries_result = await db.execute(
                        select(TimesheetEntry).where(TimesheetEntry.timesheet_id == ts_id)
                    )
                    entries = entries_result.scalars().all()

                    for entry in entries:
                        if entry.start_time and entry.end_time:
                            payload = {
                                "employeeId": str(ts.user_id),
                                "start": entry.start_time.isoformat(),
                                "end": entry.end_time.isoformat(),
                                "breaksDuration": entry.break_minutes,
                                "units": float(entry.ordinary_hours or 0),
                            }
                            resp = await client.post(
                                f"{KEYPAY_BASE_URL}/business/{self.business_id}/timesheet",
                                headers=self._headers(),
                                json=payload,
                            )
                            if resp.status_code in (200, 201):
                                records_exported += 1
                            else:
                                errors.append(f"Timesheet entry failed: {resp.status_code}")

            return ExportResult(
                success=len(errors) == 0,
                platform="keypay",
                records_exported=records_exported,
                errors=errors,
                payload={"timesheet_ids": timesheet_ids},
            )

        except Exception as e:
            logger.error("KeyPay export_timesheets error: %s", e)
            return ExportResult(success=False, platform="keypay", records_exported=0, errors=[str(e)])
