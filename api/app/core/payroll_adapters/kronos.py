"""UKG Pro WFM (Kronos) OAuth2 payroll adapter."""
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx

from app.config import get_settings
from app.core.payroll_adapters.base import ExportResult, PayrollAdapter

logger = logging.getLogger(__name__)


class KronosAdapter(PayrollAdapter):
    """
    Exports award agreements and timesheets to UKG Pro WFM (formerly Kronos Workforce Central).
    Uses OAuth2 client credentials flow.
    """

    def __init__(self):
        settings = get_settings()
        self.base_url = settings.KRONOS_BASE_URL.rstrip("/")
        self.client_id = settings.KRONOS_CLIENT_ID
        self.client_secret = settings.KRONOS_CLIENT_SECRET
        self.company_short_name = settings.KRONOS_COMPANY_SHORT_NAME
        self._access_token: Optional[str] = None
        self._token_expires_at: Optional[datetime] = None

    async def _get_token(self) -> str:
        """Obtain or return a cached OAuth2 access token."""
        if self._access_token and self._token_expires_at and self._token_expires_at > datetime.now(timezone.utc):
            return self._access_token

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self.base_url}/oauth2/token",
                data={
                    "grant_type": "client_credentials",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                },
            )
            response.raise_for_status()
            data = response.json()
            self._access_token = data["access_token"]
            expires_in = data.get("expires_in", 3600)
            self._token_expires_at = datetime.now(timezone.utc).replace(
                second=datetime.now(timezone.utc).second + expires_in - 60
            )
            return self._access_token

    def _auth_headers(self, token: str) -> dict:
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "appkey": self.client_id,
        }

    async def test_connection(self) -> bool:
        try:
            token = await self._get_token()
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.base_url}/api/v1/commons/system/server-date",
                    headers=self._auth_headers(token),
                )
                return response.status_code == 200
        except Exception as e:
            logger.error("Kronos connection test failed: %s", e)
            return False

    async def export_agreement(self, agreement_id: str, db) -> ExportResult:
        """Export award work rules to Kronos Pay Rules API."""
        try:
            from sqlalchemy import select
            from app.models.agreement import Agreement, KronosConfig, RuleLine, EmployeeTypeConfig

            result = await db.execute(select(Agreement).where(Agreement.id == agreement_id))
            agreement = result.scalar_one_or_none()
            if agreement is None:
                return ExportResult(
                    success=False,
                    platform="kronos",
                    records_exported=0,
                    errors=[f"Agreement {agreement_id} not found"],
                )

            token = await self._get_token()
            headers = self._auth_headers(token)
            records_exported = 0
            errors = []

            # Export Kronos Config as a work rule
            kronos_config_result = await db.execute(
                select(KronosConfig).where(KronosConfig.agreement_id == agreement_id)
            )
            kc = kronos_config_result.scalar_one_or_none()

            if kc:
                work_rule_payload = {
                    "name": agreement.agreement_code,
                    "description": agreement.agreement_name,
                    "fixedRule": kc.fixed_rule,
                    "exceptionRule": kc.exception_rule,
                    "roundingRule": kc.rounding_rule,
                    "breakRule": kc.break_rule,
                    "punchInterpretationRule": kc.punch_interpretation_rule,
                }

                async with httpx.AsyncClient(timeout=30.0) as client:
                    resp = await client.post(
                        f"{self.base_url}/api/v1/timekeeping/setup/work_rules",
                        headers=headers,
                        json=work_rule_payload,
                    )
                    if resp.status_code in (200, 201):
                        records_exported += 1
                    else:
                        errors.append(f"Work rule export failed: {resp.status_code} {resp.text}")

            return ExportResult(
                success=len(errors) == 0,
                platform="kronos",
                records_exported=records_exported,
                errors=errors,
                payload={"agreement_id": agreement_id, "records": records_exported},
            )

        except Exception as e:
            logger.error("Kronos export_agreement error: %s", e)
            return ExportResult(
                success=False,
                platform="kronos",
                records_exported=0,
                errors=[str(e)],
            )

    async def export_timesheets(self, timesheet_ids: list[str], db) -> ExportResult:
        """Export timesheet entries as Kronos punches."""
        try:
            from sqlalchemy import select
            from app.models.workforce import Timesheet, TimesheetEntry

            token = await self._get_token()
            headers = self._auth_headers(token)
            records_exported = 0
            errors = []

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
                    punches = []
                    if entry.start_time:
                        punches.append({
                            "punchType": "IN",
                            "punchDateTime": entry.start_time.isoformat(),
                            "employeeId": str(ts.user_id),
                        })
                    if entry.end_time:
                        punches.append({
                            "punchType": "OUT",
                            "punchDateTime": entry.end_time.isoformat(),
                            "employeeId": str(ts.user_id),
                        })

                    for punch in punches:
                        async with httpx.AsyncClient(timeout=30.0) as client:
                            resp = await client.post(
                                f"{self.base_url}/api/v1/timekeeping/punches",
                                headers=headers,
                                json=punch,
                            )
                            if resp.status_code in (200, 201):
                                records_exported += 1
                            else:
                                errors.append(f"Punch export failed: {resp.status_code}")

            return ExportResult(
                success=len(errors) == 0,
                platform="kronos",
                records_exported=records_exported,
                errors=errors,
                payload={"timesheet_ids": timesheet_ids, "punches_exported": records_exported},
            )

        except Exception as e:
            logger.error("Kronos export_timesheets error: %s", e)
            return ExportResult(
                success=False,
                platform="kronos",
                records_exported=0,
                errors=[str(e)],
            )
