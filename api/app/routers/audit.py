"""Audit log router."""
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_roles
from app.models.audit import AuditLog
from app.models.user import User

router = APIRouter()


class AuditLogOut:
    pass


from pydantic import BaseModel, ConfigDict


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    action: str
    actor: Optional[uuid.UUID]
    before_payload: Optional[dict]
    after_payload: Optional[dict]
    ip_address: Optional[str]
    created_at: datetime


@router.get("", response_model=dict, summary="Query audit log")
async def query_audit_log(
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[uuid.UUID] = Query(None),
    actor: Optional[uuid.UUID] = Query(None),
    from_date: Optional[datetime] = Query(None),
    to_date: Optional[datetime] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    query = select(AuditLog)

    if entity_type:
        query = query.where(AuditLog.entity_type == entity_type)
    if entity_id:
        query = query.where(AuditLog.entity_id == entity_id)
    if actor:
        query = query.where(AuditLog.actor == actor)
    if from_date:
        query = query.where(AuditLog.created_at >= from_date)
    if to_date:
        query = query.where(AuditLog.created_at <= to_date)

    # Count total
    count_query = select(AuditLog.id)
    if entity_type:
        count_query = count_query.where(AuditLog.entity_type == entity_type)
    if entity_id:
        count_query = count_query.where(AuditLog.entity_id == entity_id)
    if actor:
        count_query = count_query.where(AuditLog.actor == actor)
    if from_date:
        count_query = count_query.where(AuditLog.created_at >= from_date)
    if to_date:
        count_query = count_query.where(AuditLog.created_at <= to_date)

    count_result = await db.execute(count_query)
    total = len(count_result.scalars().all())

    query = query.order_by(AuditLog.created_at.desc()).offset((page - 1) * limit).limit(limit)
    result = await db.execute(query)
    items = result.scalars().all()

    return {
        "items": [AuditLogOut.model_validate(item) for item in items],
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
    }
