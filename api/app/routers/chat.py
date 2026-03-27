"""Chat router — mobile BA conversation sessions."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.conversation import ChatMessage, ConversationSession
from app.models.user import User
from app.schemas.conversation import (
    ChatMessageCreate,
    ChatMessageOut,
    ChatReply,
    ConversationSessionCreate,
    ConversationSessionOut,
)
from app.services.llm_service import get_ai_reply

router = APIRouter()

GREETING = (
    "G'day! I'm Aria, your AI consultant for award and EBA rule configuration. "
    "I'll guide you through capturing your agreement details. "
    "To get started, could you tell me the name of the agreement you'd like to configure?"
)


@router.post("/sessions", response_model=ChatReply, status_code=status.HTTP_201_CREATED, summary="Create new session")
async def create_session(
    body: ConversationSessionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = ConversationSession(
        device_id=body.device_id,
        session_type=body.session_type,
        current_node="intro",
        extracted_data={},
    )
    db.add(session)
    await db.flush()

    greeting_msg = ChatMessage(
        session_id=session.id,
        role="assistant",
        content=GREETING,
        created_at=datetime.now(timezone.utc),
    )
    db.add(greeting_msg)
    await db.flush()

    return ChatReply(
        message=ChatMessageOut.model_validate(greeting_msg),
        rule_delta=None,
        session=ConversationSessionOut.model_validate(session),
    )


@router.get("/sessions/{session_id}", response_model=ConversationSessionOut, summary="Get session")
async def get_session(
    session_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ConversationSession)
        .options(selectinload(ConversationSession.messages))
        .where(ConversationSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(
            status_code=404,
            detail={"error_code": "SESSION_NOT_FOUND", "message": "Session not found.", "detail": None},
        )
    return session


@router.put("/sessions/{session_id}", response_model=ConversationSessionOut, summary="Update session (background sync)")
async def update_session(
    session_id: uuid.UUID,
    body: ConversationSessionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = await db.get(ConversationSession, session_id)
    if session is None:
        raise HTTPException(
            status_code=404,
            detail={"error_code": "SESSION_NOT_FOUND", "message": "Session not found.", "detail": None},
        )
    session.device_id = body.device_id
    return session


@router.post("/sessions/{session_id}/messages", response_model=ChatReply, summary="Send message and get AI reply")
async def send_message(
    session_id: uuid.UUID,
    body: ChatMessageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = await db.get(ConversationSession, session_id)
    if session is None:
        raise HTTPException(
            status_code=404,
            detail={"error_code": "SESSION_NOT_FOUND", "message": "Session not found.", "detail": None},
        )

    if session.is_complete:
        raise HTTPException(
            status_code=400,
            detail={"error_code": "SESSION_COMPLETE", "message": "This session is already complete.", "detail": None},
        )

    # Save user message
    user_msg = ChatMessage(
        session_id=session.id,
        role="user",
        content=body.content,
        created_at=datetime.now(timezone.utc),
    )
    db.add(user_msg)
    await db.flush()

    # Get AI reply
    assistant_text, rule_delta = await get_ai_reply(session, body.content, db)

    # Save assistant message
    assistant_msg = ChatMessage(
        session_id=session.id,
        role="assistant",
        content=assistant_text,
        created_at=datetime.now(timezone.utc),
    )
    db.add(assistant_msg)

    # If session is complete, save draft agreement
    if session.is_complete and session.extracted_data and session.agreement_id is None:
        from app.models.agreement import Agreement
        data = session.extracted_data
        agreement = Agreement(
            agreement_code=data.get("agreement_code", f"AI-{session.id.hex[:8].upper()}"),
            agreement_name=data.get("agreement_name", "Draft Agreement"),
            agreement_type=data.get("agreement_type", "modern_award"),
            metadata_=data,
            status="draft",
        )
        db.add(agreement)
        await db.flush()
        session.agreement_id = agreement.id

    await db.flush()

    return ChatReply(
        message=ChatMessageOut.model_validate(assistant_msg),
        rule_delta=rule_delta if rule_delta else None,
        session=ConversationSessionOut.model_validate(session),
    )
