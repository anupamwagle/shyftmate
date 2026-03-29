import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base
from app.models.base import TimestampMixin, UUIDPrimaryKey


class Organisation(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "organisations"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    plan: Mapped[str] = mapped_column(String(50), default="free")
    timezone: Mapped[str] = mapped_column(String(50), default="Australia/Sydney")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Payroll settings
    payroll_frequency: Mapped[str] = mapped_column(String(20), default="weekly")
    pay_week_start: Mapped[str] = mapped_column(String(10), default="Monday")
    overtime_threshold_daily: Mapped[float] = mapped_column(Float, default=7.6)
    overtime_threshold_weekly: Mapped[float] = mapped_column(Float, default=38.0)

    # Attendance settings
    rounding_interval: Mapped[int] = mapped_column(Integer, default=15)
    require_gps_clock: Mapped[bool] = mapped_column(Boolean, default=False)
    clock_in_radius_meters: Mapped[int] = mapped_column(Integer, default=200)

    # Notification settings
    email_notifications: Mapped[bool] = mapped_column(Boolean, default=True)
    sms_notifications: Mapped[bool] = mapped_column(Boolean, default=False)

    users: Mapped[list["User"]] = relationship("User", back_populates="organisation")
    locations: Mapped[list["Location"]] = relationship("Location", back_populates="organisation")


class User(Base, UUIDPrimaryKey, TimestampMixin):
    __tablename__ = "users"

    org_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organisations.id", ondelete="SET NULL"), nullable=True
    )
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    hashed_password: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    role: Mapped[str] = mapped_column(String(30), default="employee")
    # Roles: super_admin | admin | manager | reviewer | employee
    first_name: Mapped[str] = mapped_column(String(100), default="")
    last_name: Mapped[str] = mapped_column(String(100), default="")
    phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # OTP 2FA
    otp_secret: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    otp_verified: Mapped[bool] = mapped_column(Boolean, default=False)

    # Social auth
    google_sub: Mapped[Optional[str]] = mapped_column(String(200), nullable=True, unique=True)
    apple_sub: Mapped[Optional[str]] = mapped_column(String(200), nullable=True, unique=True)

    organisation: Mapped[Optional["Organisation"]] = relationship("Organisation", back_populates="users")
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship("RefreshToken", back_populates="user")
    otp_codes: Mapped[list["OTPCode"]] = relationship("OTPCode", back_populates="user")


class RefreshToken(Base, UUIDPrimaryKey):
    __tablename__ = "refresh_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(256), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)

    user: Mapped["User"] = relationship("User", back_populates="refresh_tokens")


class OTPCode(Base, UUIDPrimaryKey):
    __tablename__ = "otp_codes"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(10), nullable=False)
    purpose: Mapped[str] = mapped_column(String(30), default="login")
    # purpose: login | invite | password_reset
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    attempts: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    user: Mapped["User"] = relationship("User", back_populates="otp_codes")


class KronosToken(Base, UUIDPrimaryKey):
    __tablename__ = "kronos_tokens"
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True)
    environment: Mapped[str] = mapped_column(String(20), nullable=False, server_default="sandbox")
    access_token: Mapped[str] = mapped_column(Text, nullable=False)
    refresh_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    __table_args__ = (UniqueConstraint("org_id", "environment", name="uq_kronos_tokens_org_env"),)
