"""Rule lines router — edit, delete, reorder individual rule lines."""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_roles
from app.models.agreement import RuleLine
from app.models.user import User
from app.schemas.agreement import RuleLineOut, RuleLineUpdate
from app.services.audit_service import log_action

router = APIRouter()


class ReorderIn(BaseModel):
    sort_order: int


@router.patch("/rule-lines/{rule_id}", response_model=RuleLineOut, summary="Update rule line")
async def update_rule_line(
    rule_id: uuid.UUID,
    body: RuleLineUpdate,
    request: Request,
    current_user: User = Depends(require_roles("reviewer")),
    db: AsyncSession = Depends(get_db),
):
    rule = await db.get(RuleLine, rule_id)
    if rule is None:
        raise HTTPException(
            status_code=404,
            detail={"error_code": "RULE_NOT_FOUND", "message": "Rule line not found.", "detail": None},
        )
    before = RuleLineOut.model_validate(rule).model_dump(mode="json")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(rule, field, value)
    await log_action(
        db, "rule_line", rule.id, "updated", current_user.id,
        before=before, after=body.model_dump(exclude_unset=True),
        ip_address=request.client.host if request.client else None,
    )
    return rule


@router.delete("/rule-lines/{rule_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete rule line")
async def delete_rule_line(
    rule_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    rule = await db.get(RuleLine, rule_id)
    if rule is None:
        raise HTTPException(
            status_code=404,
            detail={"error_code": "RULE_NOT_FOUND", "message": "Rule line not found.", "detail": None},
        )
    await db.delete(rule)
    await log_action(
        db, "rule_line", rule_id, "deleted", current_user.id,
        ip_address=request.client.host if request.client else None,
    )


@router.post("/rule-lines/{rule_id}/reorder", response_model=RuleLineOut, summary="Reorder rule line")
async def reorder_rule_line(
    rule_id: uuid.UUID,
    body: ReorderIn,
    request: Request,
    current_user: User = Depends(require_roles("reviewer")),
    db: AsyncSession = Depends(get_db),
):
    rule = await db.get(RuleLine, rule_id)
    if rule is None:
        raise HTTPException(
            status_code=404,
            detail={"error_code": "RULE_NOT_FOUND", "message": "Rule line not found.", "detail": None},
        )
    old_order = rule.sort_order
    rule.sort_order = body.sort_order
    await log_action(
        db, "rule_line", rule.id, "updated", current_user.id,
        before={"sort_order": old_order}, after={"sort_order": body.sort_order},
        ip_address=request.client.host if request.client else None,
    )
    return rule
