from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ExportResult:
    success: bool
    platform: str
    records_exported: int
    errors: list[str] = field(default_factory=list)
    payload: dict[str, Any] = field(default_factory=dict)


class PayrollAdapter(ABC):
    @abstractmethod
    async def test_connection(self) -> bool:
        """Test connectivity to the target platform. Returns True if successful."""
        ...

    @abstractmethod
    async def export_agreement(self, agreement_id: str, db) -> ExportResult:
        """Export award/EBA agreement (work rules) to the target platform."""
        ...

    @abstractmethod
    async def export_timesheets(self, timesheet_ids: list[str], db) -> ExportResult:
        """Export timesheet entries to the target platform."""
        ...
