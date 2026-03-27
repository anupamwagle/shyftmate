import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog


async def log_action(
    db: AsyncSession,
    entity_type: str,
    entity_id: uuid.UUID,
    action: str,
    actor: Optional[uuid.UUID],
    before: Optional[dict] = None,
    after: Optional[dict] = None,
    ip_address: Optional[str] = None,
) -> None:
    """
    Create an AuditLog record.
    Does NOT commit — the caller is responsible for transaction management.
    """
    entry = AuditLog(
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        actor=actor,
        before_payload=before,
        after_payload=after,
        ip_address=ip_address,
        created_at=datetime.now(timezone.utc),
    )
    db.add(entry)
