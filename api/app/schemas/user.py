import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr


# ── Organisation ─────────────────────────────────────────────

class OrganisationCreate(BaseModel):
    name: str
    slug: str
    plan: str = "free"
    timezone: str = "Australia/Sydney"


class OrganisationUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    plan: Optional[str] = None
    timezone: Optional[str] = None
    is_active: Optional[bool] = None


class OrganisationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    plan: str
    timezone: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ── User ─────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr
    password: Optional[str] = None
    first_name: str = ""
    last_name: str = ""
    phone: Optional[str] = None
    org_id: Optional[uuid.UUID] = None
    role: str = "employee"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: Optional[uuid.UUID]
    email: str
    role: str
    first_name: str
    last_name: str
    phone: Optional[str]
    avatar_url: Optional[str]
    is_active: bool
    otp_verified: bool
    last_login_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


class UserUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    role: Optional[str] = None


# ── Auth ─────────────────────────────────────────────────────

class LoginIn(BaseModel):
    email: str
    password: str


class RefreshIn(BaseModel):
    refresh_token: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: Optional[UserOut] = None


class OTPRequest(BaseModel):
    email: EmailStr
    purpose: str = "login"


class OTPVerify(BaseModel):
    email: EmailStr
    code: str


class GoogleAuthIn(BaseModel):
    id_token: str


class AppleAuthIn(BaseModel):
    identity_token: str
    authorization_code: str
