import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


# ── Conversation Session ─────────────────────────────────────

class ConversationSessionCreate(BaseModel):
    device_id: str
    session_type: str = "mobile"


class ConversationSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    device_id: str
    agreement_id: Optional[uuid.UUID]
    current_node: str
    is_complete: bool
    completed_at: Optional[datetime]
    session_type: str
    extracted_data: Optional[dict[str, Any]]
    created_at: datetime
    updated_at: datetime


# ── Chat Message ─────────────────────────────────────────────

class ChatMessageCreate(BaseModel):
    role: str
    content: str


class ChatMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    session_id: uuid.UUID
    role: str
    content: str
    token_count: Optional[int]
    created_at: datetime


class ChatReply(BaseModel):
    message: ChatMessageOut
    rule_delta: Optional[dict[str, Any]]
    session: ConversationSessionOut


# ── Prospect ─────────────────────────────────────────────────

class ProspectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    caller_phone: Optional[str]
    caller_name: Optional[str]
    company_name: Optional[str]
    company_email: Optional[str]
    agreement_id: Optional[uuid.UUID]
    session_id: Optional[uuid.UUID]
    status: str
    admin_notes: Optional[str]
    reviewed_by: Optional[uuid.UUID]
    reviewed_at: Optional[datetime]
    invited_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


class ProspectUpdate(BaseModel):
    status: Optional[str] = None
    admin_notes: Optional[str] = None
    caller_name: Optional[str] = None
    company_name: Optional[str] = None
    company_email: Optional[str] = None


class ProvisionIn(BaseModel):
    org_name: str
    org_slug: str
    admin_email: str
    admin_first_name: str
    admin_last_name: str
