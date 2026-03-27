"""Telephony router — SignalWire webhook + WebSocket Media Streams + prospects."""
import base64
import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Form, HTTPException, Query, Request, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db, AsyncSessionLocal
from app.dependencies import get_current_user, require_roles
from app.models.conversation import Prospect
from app.models.user import Organisation, User
from app.schemas.conversation import ProspectOut, ProspectUpdate, ProvisionIn
from app.security import hash_password
from app.services.audit_service import log_action
from app.services.email_service import get_email_service
from app.services.telephony_service import (
    create_call_session,
    end_call,
    handle_audio_chunk,
    _active_calls,
)

router = APIRouter()


def _ip(request: Request) -> Optional[str]:
    return request.client.host if request.client else None


# ── POST /inbound ────────────────────────────────────────────

@router.post("/inbound", summary="SignalWire inbound webhook")
async def inbound_call(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    form = await request.form()
    call_sid = form.get("CallSid", "")
    caller = form.get("From", "")

    call = await create_call_session(call_sid, caller, db)
    settings = get_settings()

    swml_response = {
        "version": "1.0",
        "sections": {
            "main": [
                {"answer": {}},
                {
                    "connect": {
                        "to": f"wss://{settings.API_BASE_URL.replace('https://', '').replace('http://', '')}/api/v1/telephony/stream/{call.session_id}"
                    }
                },
            ]
        },
    }

    from fastapi.responses import JSONResponse
    return JSONResponse(content=swml_response)


# ── WS /stream/{session_id} ──────────────────────────────────

@router.websocket("/stream/{session_id}")
async def media_stream(
    websocket: WebSocket,
    session_id: uuid.UUID,
):
    await websocket.accept()
    call_sid: Optional[str] = None

    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            event = msg.get("event")

            match event:
                case "start":
                    call_sid = msg.get("start", {}).get("callSid")

                case "media":
                    if call_sid is None:
                        continue
                    audio_b64 = msg.get("media", {}).get("payload", "")
                    if not audio_b64:
                        continue

                    async with AsyncSessionLocal() as db:
                        response_audio = await handle_audio_chunk(call_sid, audio_b64, db)
                        await db.commit()

                    if response_audio is not None:
                        await websocket.send_text(json.dumps({
                            "event": "media",
                            "media": {
                                "payload": response_audio.decode() if isinstance(response_audio, bytes) else response_audio
                            },
                        }))

                case "stop":
                    if call_sid:
                        async with AsyncSessionLocal() as db:
                            await end_call(call_sid, db)
                            await db.commit()
                    break

    except WebSocketDisconnect:
        if call_sid:
            async with AsyncSessionLocal() as db:
                await end_call(call_sid, db)
                await db.commit()

    except Exception:
        if call_sid:
            async with AsyncSessionLocal() as db:
                await end_call(call_sid, db)
                await db.commit()


# ── POST /status ─────────────────────────────────────────────

@router.post("/status", summary="SignalWire call status callback")
async def call_status(request: Request, db: AsyncSession = Depends(get_db)):
    form = await request.form()
    call_sid = form.get("CallSid", "")
    call_status_val = form.get("CallStatus", "")

    if call_status_val in ("completed", "failed", "busy", "no-answer") and call_sid:
        if call_sid in _active_calls:
            await end_call(call_sid, db)

    return {"received": True}


# ── GET /prospects ───────────────────────────────────────────

@router.get("/prospects", response_model=list[ProspectOut], summary="List prospects")
async def list_prospects(
    prospect_status: Optional[str] = Query(None, alias="status"),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    query = select(Prospect)
    if prospect_status:
        query = query.where(Prospect.status == prospect_status)
    query = query.order_by(Prospect.created_at.desc()).offset((page - 1) * limit).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/prospects/{prospect_id}", response_model=ProspectOut, summary="Get prospect detail")
async def get_prospect(
    prospect_id: uuid.UUID,
    current_user: User = Depends(require_roles("reviewer")),
    db: AsyncSession = Depends(get_db),
):
    prospect = await db.get(Prospect, prospect_id)
    if prospect is None:
        raise HTTPException(
            status_code=404,
            detail={"error_code": "PROSPECT_NOT_FOUND", "message": "Prospect not found.", "detail": None},
        )
    return prospect


@router.patch("/prospects/{prospect_id}", response_model=ProspectOut, summary="Update prospect")
async def update_prospect(
    prospect_id: uuid.UUID,
    body: ProspectUpdate,
    request: Request,
    current_user: User = Depends(require_roles("reviewer")),
    db: AsyncSession = Depends(get_db),
):
    prospect = await db.get(Prospect, prospect_id)
    if prospect is None:
        raise HTTPException(
            status_code=404,
            detail={"error_code": "PROSPECT_NOT_FOUND", "message": "Prospect not found.", "detail": None},
        )

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(prospect, field, value)

    if "status" in body.model_dump(exclude_unset=True):
        prospect.reviewed_by = current_user.id
        prospect.reviewed_at = datetime.now(timezone.utc)

    await log_action(
        db, "prospect", prospect.id, "updated", current_user.id,
        after=body.model_dump(exclude_unset=True), ip_address=_ip(request),
    )
    return prospect


@router.post("/prospects/{prospect_id}/provision", response_model=dict, summary="Provision org account for prospect")
async def provision_prospect(
    prospect_id: uuid.UUID,
    body: ProvisionIn,
    request: Request,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    prospect = await db.get(Prospect, prospect_id)
    if prospect is None:
        raise HTTPException(
            status_code=404,
            detail={"error_code": "PROSPECT_NOT_FOUND", "message": "Prospect not found.", "detail": None},
        )

    if prospect.status == "invited":
        raise HTTPException(
            status_code=409,
            detail={"error_code": "ALREADY_PROVISIONED", "message": "Prospect has already been provisioned.", "detail": None},
        )

    # Check slug uniqueness
    slug_result = await db.execute(select(Organisation).where(Organisation.slug == body.org_slug))
    if slug_result.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail={"error_code": "ORG_SLUG_EXISTS", "message": "Organisation slug already in use.", "detail": None},
        )

    # Create organisation
    org = Organisation(
        name=body.org_name,
        slug=body.org_slug,
        plan="starter",
    )
    db.add(org)
    await db.flush()

    # Check if admin user exists
    existing_user = await db.execute(select(User).where(User.email == body.admin_email.lower()))
    admin_user = existing_user.scalar_one_or_none()

    if admin_user is None:
        admin_user = User(
            email=body.admin_email.lower(),
            first_name=body.admin_first_name,
            last_name=body.admin_last_name,
            org_id=org.id,
            role="admin",
            otp_verified=False,
        )
        db.add(admin_user)
        await db.flush()
    else:
        admin_user.org_id = org.id
        admin_user.role = "admin"

    # Update prospect
    prospect.status = "invited"
    prospect.invited_at = datetime.now(timezone.utc)

    settings = get_settings()
    invite_link = f"{settings.API_BASE_URL}/accept-invite?user_id={admin_user.id}"

    get_email_service().send_invite_email(
        to_email=body.admin_email,
        first_name=body.admin_first_name,
        org_name=body.org_name,
        invite_link=invite_link,
    )

    await log_action(
        db, "prospect", prospect.id, "provisioned", current_user.id,
        after={"org_id": str(org.id), "admin_user_id": str(admin_user.id)},
        ip_address=_ip(request),
    )

    return {
        "message": "Organisation provisioned and invite sent.",
        "org_id": str(org.id),
        "admin_user_id": str(admin_user.id),
    }
