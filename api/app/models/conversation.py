import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDPrimaryKey


class ConversationSession(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "conversation_sessions"

    device_id: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    agreement_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agreements.id", ondelete="SET NULL"), nullable=True
    )
    state_machine: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    extracted_data: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    current_node: Mapped[str] = mapped_column(String(100), default="intro")
    is_complete: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    session_type: Mapped[str] = mapped_column(String(20), default="mobile")
    # mobile | telephony

    messages: Mapped[list["ChatMessage"]] = relationship(
        "ChatMessage", back_populates="session", cascade="all, delete-orphan"
    )


class ChatMessage(Base, UUIDPrimaryKey):
    __tablename__ = "chat_messages"

    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversation_sessions.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    # user | assistant | system
    content: Mapped[str] = mapped_column(Text, nullable=False)
    token_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    session: Mapped["ConversationSession"] = relationship("ConversationSession", back_populates="messages")


class Prospect(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "prospects"

    caller_phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    caller_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    company_name: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    company_email: Mapped[Optional[str]] = mapped_column(String(320), nullable=True)
    agreement_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agreements.id", ondelete="SET NULL"), nullable=True
    )
    session_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversation_sessions.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), default="new", index=True)
    # new | reviewed | invited | converted | declined
    admin_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    invited_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
