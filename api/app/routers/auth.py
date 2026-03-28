"""Auth router — email+password, Google OAuth2, Apple Sign-In, OTP 2FA, refresh, logout."""
import hashlib
import logging
import random
import string
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.dependencies import get_current_user_otp_pending
from app.models.user import OTPCode, RefreshToken, User
from app.schemas.user import (
    AppleAuthIn,
    GoogleAuthIn,
    LoginIn,
    OTPRequest,
    OTPVerify,
    RefreshIn,
    TokenOut,
    UserOut,
)
from app.security import (
    create_access_token,
    create_refresh_token,
    verify_password,
    verify_token,
)
from app.services.email_service import get_email_service

router = APIRouter()
logger = logging.getLogger(__name__)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _generate_otp(length: int = 6) -> str:
    return "".join(random.choices(string.digits, k=length))


def _make_tokens(user: User) -> tuple[str, str]:
    scope = "otp_pending" if not user.otp_verified else "full"
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "org_id": str(user.org_id) if user.org_id else None,
        "scope": scope,
    }
    access_token = create_access_token(payload)
    refresh_token = create_refresh_token(payload)
    return access_token, refresh_token


async def _store_refresh_token(user_id, raw_token: str, db: AsyncSession) -> None:
    settings = get_settings()
    rt = RefreshToken(
        user_id=user_id,
        token_hash=_hash_token(raw_token),
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_EXPIRE_DAYS),
        created_at=datetime.now(timezone.utc),
    )
    db.add(rt)


# ── POST /login ──────────────────────────────────────────────

@router.post("/login", response_model=TokenOut, summary="Email/password login")
async def login(
    body: LoginIn,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == body.email.lower()))
    user = result.scalar_one_or_none()

    if user is None or not user.hashed_password or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error_code": "AUTH_INVALID_CREDENTIALS",
                "message": "Invalid email or password.",
                "detail": None,
            },
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error_code": "AUTH_USER_INACTIVE",
                "message": "This account has been deactivated.",
                "detail": None,
            },
        )

    user.last_login_at = datetime.now(timezone.utc)
    access_token, refresh_token = _make_tokens(user)
    await _store_refresh_token(user.id, refresh_token, db)

    return TokenOut(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserOut.model_validate(user),
    )


# ── POST /refresh ────────────────────────────────────────────

@router.post("/refresh", response_model=TokenOut, summary="Refresh access token")
async def refresh(
    body: RefreshIn,
    db: AsyncSession = Depends(get_db),
):
    token_hash = _hash_token(body.refresh_token)
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    rt = result.scalar_one_or_none()

    if rt is None or rt.revoked:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error_code": "AUTH_TOKEN_INVALID",
                "message": "Refresh token is invalid or revoked.",
                "detail": None,
            },
        )

    if rt.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error_code": "AUTH_TOKEN_EXPIRED",
                "message": "Refresh token has expired.",
                "detail": None,
            },
        )

    # Verify JWT is still structurally valid
    verify_token(body.refresh_token)

    user_result = await db.execute(select(User).where(User.id == rt.user_id))
    user = user_result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error_code": "AUTH_USER_INACTIVE",
                "message": "User account is inactive.",
                "detail": None,
            },
        )

    rt.revoked = True
    access_token, new_refresh_token = _make_tokens(user)
    await _store_refresh_token(user.id, new_refresh_token, db)

    return TokenOut(
        access_token=access_token,
        refresh_token=new_refresh_token,
        user=UserOut.model_validate(user),
    )


# ── POST /logout ─────────────────────────────────────────────

@router.post("/logout", summary="Revoke refresh token")
async def logout(
    body: RefreshIn,
    db: AsyncSession = Depends(get_db),
):
    token_hash = _hash_token(body.refresh_token)
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.token_hash == token_hash)
        .values(revoked=True)
    )
    return {"message": "Logged out successfully."}


# ── POST /social/google ──────────────────────────────────────

@router.post("/social/google", response_model=TokenOut, summary="Google OAuth2 sign-in")
async def google_auth(
    body: GoogleAuthIn,
    db: AsyncSession = Depends(get_db),
):
    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests as google_requests

        settings = get_settings()
        idinfo = google_id_token.verify_oauth2_token(
            body.id_token,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID,
        )
        google_sub = idinfo["sub"]
        email = idinfo.get("email", "").lower()
        first_name = idinfo.get("given_name", "")
        last_name = idinfo.get("family_name", "")

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error_code": "AUTH_GOOGLE_INVALID_TOKEN",
                "message": "Invalid Google ID token.",
                "detail": str(e),
            },
        )

    result = await db.execute(select(User).where(User.google_sub == google_sub))
    user = result.scalar_one_or_none()

    if user is None:
        email_result = await db.execute(select(User).where(User.email == email))
        user = email_result.scalar_one_or_none()
        if user:
            user.google_sub = google_sub
        else:
            user = User(
                email=email,
                first_name=first_name,
                last_name=last_name,
                google_sub=google_sub,
                otp_verified=False,
            )
            db.add(user)
            await db.flush()
            get_email_service().send_welcome_email(email, first_name)

    access_token, refresh_token = _make_tokens(user)
    await _store_refresh_token(user.id, refresh_token, db)

    return TokenOut(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserOut.model_validate(user),
    )


# ── POST /social/apple ───────────────────────────────────────

@router.post("/social/apple", response_model=TokenOut, summary="Apple Sign-In")
async def apple_auth(
    body: AppleAuthIn,
    db: AsyncSession = Depends(get_db),
):
    try:
        import httpx as _httpx
        import jwt as _jwt
        from jwt.algorithms import RSAAlgorithm

        async with _httpx.AsyncClient() as client:
            keys_resp = await client.get("https://appleid.apple.com/auth/keys")
            keys_resp.raise_for_status()
            keys_data = keys_resp.json()

        header = _jwt.get_unverified_header(body.identity_token)
        kid = header["kid"]
        key_data = next((k for k in keys_data["keys"] if k["kid"] == kid), None)
        if key_data is None:
            raise ValueError("Matching Apple public key not found")

        public_key = RSAAlgorithm.from_jwk(key_data)
        settings = get_settings()

        payload = _jwt.decode(
            body.identity_token,
            public_key,
            algorithms=["RS256"],
            audience=settings.APPLE_CLIENT_ID,
        )
        apple_sub = payload["sub"]
        email = payload.get("email", "").lower()

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error_code": "AUTH_APPLE_INVALID_TOKEN",
                "message": "Invalid Apple identity token.",
                "detail": str(e),
            },
        )

    result = await db.execute(select(User).where(User.apple_sub == apple_sub))
    user = result.scalar_one_or_none()

    if user is None and email:
        email_result = await db.execute(select(User).where(User.email == email))
        user = email_result.scalar_one_or_none()
        if user:
            user.apple_sub = apple_sub
        else:
            user = User(
                email=email,
                apple_sub=apple_sub,
                otp_verified=False,
            )
            db.add(user)
            await db.flush()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error_code": "AUTH_APPLE_NO_EMAIL",
                "message": "No email returned from Apple. Cannot create account.",
                "detail": None,
            },
        )

    access_token, refresh_token = _make_tokens(user)
    await _store_refresh_token(user.id, refresh_token, db)

    return TokenOut(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserOut.model_validate(user),
    )


# ── POST /otp/request ────────────────────────────────────────

@router.post("/otp/request", summary="Request OTP code")
async def request_otp(
    body: OTPRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == body.email.lower()))
    user = result.scalar_one_or_none()

    if user is None:
        return {"message": "If that email is registered, an OTP has been sent."}

    # Invalidate existing unused OTPs for same purpose
    existing = await db.execute(
        select(OTPCode).where(
            OTPCode.user_id == user.id,
            OTPCode.purpose == body.purpose,
            OTPCode.used == False,
        )
    )
    for otp in existing.scalars().all():
        otp.used = True

    code = _generate_otp()
    otp_record = OTPCode(
        user_id=user.id,
        code=code,
        purpose=body.purpose,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
        created_at=datetime.now(timezone.utc),
    )
    db.add(otp_record)

    settings = get_settings()
    if settings.ENV == "dev":
        logger.warning("DEV MODE — OTP for %s: %s", user.email, code)
    else:
        get_email_service().send_otp_email(user.email, code, body.purpose)

    return {"message": "If that email is registered, an OTP has been sent."}


# ── POST /otp/verify ─────────────────────────────────────────

@router.post("/otp/verify", response_model=TokenOut, summary="Verify OTP and upgrade scope")
async def verify_otp(
    body: OTPVerify,
    current_user: User = Depends(get_current_user_otp_pending),
    db: AsyncSession = Depends(get_db),
):
    if current_user.email.lower() != body.email.lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error_code": "AUTH_OTP_INVALID",
                "message": "Email does not match authenticated user.",
                "detail": None,
            },
        )

    result = await db.execute(
        select(OTPCode)
        .where(
            OTPCode.user_id == current_user.id,
            OTPCode.used == False,
        )
        .order_by(OTPCode.created_at.desc())
    )
    otp_record = result.scalars().first()

    if otp_record is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error_code": "AUTH_OTP_INVALID",
                "message": "No valid OTP found. Please request a new code.",
                "detail": None,
            },
        )

    if otp_record.attempts >= 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error_code": "AUTH_OTP_MAX_ATTEMPTS",
                "message": "Maximum OTP attempts exceeded. Request a new code.",
                "detail": None,
            },
        )

    if otp_record.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error_code": "AUTH_OTP_EXPIRED",
                "message": "OTP has expired. Please request a new code.",
                "detail": None,
            },
        )

    if otp_record.code != body.code:
        otp_record.attempts += 1
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error_code": "AUTH_OTP_INVALID",
                "message": "Invalid OTP code.",
                "detail": None,
            },
        )

    otp_record.used = True
    current_user.otp_verified = True

    access_token, refresh_token = _make_tokens(current_user)
    await _store_refresh_token(current_user.id, refresh_token, db)

    return TokenOut(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserOut.model_validate(current_user),
    )
