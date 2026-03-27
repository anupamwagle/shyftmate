import base64
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.conversation import ConversationSession, Prospect
from app.services.llm_service import get_ai_reply
from app.services.stt_service import TranscribeSession
from app.services.tts_service import synthesize_speech
from app.services.email_service import get_email_service

logger = logging.getLogger(__name__)

# In-memory store: call_sid → CallSession
_active_calls: dict[str, "CallSession"] = {}

# Buffer size before sending audio to LLM (rough silence detection via chunk count)
AUDIO_BUFFER_CHUNKS = 50  # ~50 * 20ms = ~1s of audio
SILENCE_THRESHOLD_CHUNKS = 30


@dataclass
class CallSession:
    session_id: uuid.UUID
    call_sid: str
    caller_phone: str
    state: str = "greeting"
    # greeting | interviewing | reviewing | completing | ended
    transcribe_session: TranscribeSession = field(default_factory=TranscribeSession)
    audio_buffer: list[bytes] = field(default_factory=list)
    silence_chunks: int = 0
    accumulated_text: str = ""
    conversation_session_id: Optional[uuid.UUID] = None


async def create_call_session(
    call_sid: str,
    caller_phone: str,
    db: AsyncSession,
) -> CallSession:
    """Creates ConversationSession + Prospect record and starts Transcribe."""
    # Create DB conversation session
    conv_session = ConversationSession(
        device_id=call_sid,
        session_type="telephony",
        current_node="intro",
        extracted_data={},
    )
    db.add(conv_session)

    prospect = Prospect(
        caller_phone=caller_phone,
        session_id=conv_session.id,
        status="new",
    )
    db.add(prospect)
    await db.flush()

    call = CallSession(
        session_id=conv_session.id,
        call_sid=call_sid,
        caller_phone=caller_phone,
        conversation_session_id=conv_session.id,
    )
    _active_calls[call_sid] = call

    await call.transcribe_session.start(call_sid)
    logger.info("CallSession created for %s (sid=%s)", caller_phone, call_sid)
    return call


async def handle_audio_chunk(
    call_sid: str,
    audio_b64: str,
    db: AsyncSession,
) -> Optional[bytes]:
    """
    Process incoming mulaw audio → STT → LLM → TTS.
    Returns base64-encoded mulaw response audio, or None.
    """
    call = _active_calls.get(call_sid)
    if call is None or call.state == "ended":
        return None

    # Decode mulaw audio
    try:
        audio_bytes = base64.b64decode(audio_b64)
    except Exception:
        return None

    # Send to Transcribe
    transcript_fragment = await call.transcribe_session.send_audio(audio_bytes)

    if transcript_fragment:
        call.accumulated_text += " " + transcript_fragment
        call.silence_chunks = 0
    else:
        call.silence_chunks += 1

    # Process after detecting end of utterance (silence)
    if call.silence_chunks >= SILENCE_THRESHOLD_CHUNKS and call.accumulated_text.strip():
        user_text = call.accumulated_text.strip()
        call.accumulated_text = ""
        call.silence_chunks = 0

        # Get conversation session from DB
        from sqlalchemy import select
        result = await db.execute(
            select(ConversationSession).where(
                ConversationSession.id == call.conversation_session_id
            )
        )
        conv_session = result.scalar_one_or_none()
        if conv_session is None:
            return None

        # Save user message
        from app.models.conversation import ChatMessage
        user_msg = ChatMessage(
            session_id=conv_session.id,
            role="user",
            content=user_text,
            created_at=datetime.now(timezone.utc),
        )
        db.add(user_msg)

        # Get AI reply
        assistant_text, _delta = await get_ai_reply(conv_session, user_text, db)

        # Save assistant message
        assistant_msg = ChatMessage(
            session_id=conv_session.id,
            role="assistant",
            content=assistant_text,
            created_at=datetime.now(timezone.utc),
        )
        db.add(assistant_msg)
        await db.flush()

        # Synthesize speech response
        audio_response = await synthesize_speech(assistant_text)
        return audio_response

    return None


async def end_call(call_sid: str, db: AsyncSession) -> None:
    """Finalize session, save agreement if complete, send admin notification."""
    call = _active_calls.pop(call_sid, None)
    if call is None:
        return

    call.state = "ended"
    await call.transcribe_session.close()

    # Load conversation session
    from sqlalchemy import select
    result = await db.execute(
        select(ConversationSession).where(
            ConversationSession.id == call.conversation_session_id
        )
    )
    conv_session = result.scalar_one_or_none()

    if conv_session and conv_session.is_complete and conv_session.extracted_data:
        # Update related prospect
        prospect_result = await db.execute(
            select(Prospect).where(Prospect.session_id == conv_session.id)
        )
        prospect = prospect_result.scalar_one_or_none()
        if prospect:
            data = conv_session.extracted_data
            prospect.caller_name = data.get("caller_name") or prospect.caller_name
            prospect.company_name = data.get("company_name") or prospect.company_name
            prospect.company_email = data.get("company_email") or prospect.company_email

        await db.flush()

        # Notify admin via email
        settings_obj = __import__("app.config", fromlist=["get_settings"]).get_settings()
        email_svc = get_email_service()
        email_svc.send_prospect_notification_email(
            to_email=settings_obj.SUPER_ADMIN_EMAIL,
            prospect_name=conv_session.extracted_data.get("caller_name", "Unknown"),
            company=conv_session.extracted_data.get("company_name", "Unknown"),
            phone=call.caller_phone,
        )

    logger.info("CallSession ended for sid=%s", call_sid)
