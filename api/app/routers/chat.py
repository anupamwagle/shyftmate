"""Chat router — mobile BA conversation sessions."""
import base64
import io
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.limiter import limiter
from app.models.conversation import ChatMessage, ConversationSession
from app.models.user import User
from app.schemas.conversation import (
    ChatMessageCreate,
    ChatMessageOut,
    ChatReply,
    ConversationSessionCreate,
    ConversationSessionDetailOut,
    ConversationSessionOut,
)
from app.services.llm_service import get_ai_reply

log = logging.getLogger("gator.api.chat")


class TranscribeRequest(BaseModel):
    audio_base64: str
    mime_type: str = "audio/m4a"


class TranscribeResponse(BaseModel):
    transcript: str
    confidence: float

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


@router.get("/sessions/{session_id}", response_model=ConversationSessionDetailOut, summary="Get session")
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
@limiter.limit("10/minute")
async def send_message(
    session_id: uuid.UUID,
    body: ChatMessageCreate,
    request: Request,
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

    log.info(
        "[CHAT] session=%s node=%s user_msg_len=%d",
        session.id, session.current_node, len(body.content),
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
    log.info("[CHAT] Calling LLM for session=%s …", session.id)
    assistant_text, rule_delta = await get_ai_reply(session, body.content, db)
    log.info(
        "[CHAT] LLM replied for session=%s node=%s reply_len=%d",
        session.id, session.current_node, len(assistant_text),
    )

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


@router.post("/sessions/{session_id}/complete", response_model=ConversationSessionDetailOut, summary="Mark session complete")
async def complete_session(
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
    if not session.is_complete:
        session.is_complete = True
        session.completed_at = datetime.now(timezone.utc)
    return session


@router.post("/sessions/transcribe", response_model=TranscribeResponse, summary="Transcribe audio via Whisper")
async def transcribe_audio(
    body: TranscribeRequest,
    current_user: User = Depends(get_current_user),
):
    import logging
    log = logging.getLogger("gator.api.chat")
    settings = get_settings()
    log.info("[TRANSCRIBE] Received audio transcription request (mime=%s, size=%d bytes)",
             body.mime_type, len(body.audio_base64))
    if not settings.OPENAI_API_KEY:
        log.warning("[TRANSCRIBE] No OPENAI_API_KEY configured — voice transcription unavailable")
        raise HTTPException(
            status_code=503,
            detail={
                "error_code": "STT_NOT_CONFIGURED",
                "message": "Voice transcription is not configured on this server. Please switch to Chat mode to type your message.",
                "detail": None,
            },
        )
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        audio_bytes = base64.b64decode(body.audio_base64)
        ext = body.mime_type.split("/")[-1].replace("mpeg", "mp3").replace("x-m4a", "m4a")
        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = f"audio.{ext}"
        transcript = await client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
        )
        log.info("[TRANSCRIBE] Success — transcript length=%d chars", len(transcript.text))
        return TranscribeResponse(transcript=transcript.text, confidence=1.0)
    except Exception as exc:
        log.error("[TRANSCRIBE] Whisper API failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail={"error_code": "TRANSCRIPTION_ERROR", "message": str(exc), "detail": None},
        )


class TTSRequest(BaseModel):
    text: str
    voice: str = "nova"   # nova or shimmer — both natural female voices


class TTSResponse(BaseModel):
    audio_base64: str
    voice: str
    format: str = "mp3"


@router.post("/tts", response_model=TTSResponse, summary="Text-to-speech via OpenAI TTS (nova voice)")
async def text_to_speech(
    body: TTSRequest,
    current_user: User = Depends(get_current_user),
):
    settings = get_settings()
    if not settings.OPENAI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail={
                "error_code": "TTS_NOT_CONFIGURED",
                "message": "OpenAI TTS is not configured. Add OPENAI_API_KEY to .env.dev.",
                "detail": None,
            },
        )
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        log.info("[TTS] voice=%s text_len=%d", body.voice, len(body.text))
        response = await client.audio.speech.create(
            model="tts-1",
            voice=body.voice,
            input=body.text,
            response_format="mp3",
        )
        audio_bytes = response.content
        audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
        log.info("[TTS] Done — %d audio bytes", len(audio_bytes))
        return TTSResponse(audio_base64=audio_b64, voice=body.voice)
    except Exception as exc:
        log.error("[TTS] Error: %s", exc)
        raise HTTPException(
            status_code=500,
            detail={"error_code": "TTS_ERROR", "message": str(exc), "detail": None},
        )


@router.get("/settings/llm", summary="Get LLM provider settings")
async def get_llm_settings(
    current_user: User = Depends(get_current_user),
):
    settings = get_settings()
    return {"llm_provider": settings.LLM_PROVIDER, "ollama_url": settings.OLLAMA_BASE_URL}


@router.put("/settings/llm", summary="Update LLM provider settings (runtime only)")
async def update_llm_settings(
    body: dict,
    current_user: User = Depends(require_roles("admin")),
):
    # Runtime update not persisted; returns current effective settings
    settings = get_settings()
    return {"llm_provider": settings.LLM_PROVIDER, "ollama_url": settings.OLLAMA_BASE_URL}
