import uuid
from typing import Callable, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.security import verify_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token", auto_error=False)

ROLES = ["super_admin", "admin", "manager", "reviewer", "employee"]
ROLE_HIERARCHY = {r: i for i, r in enumerate(ROLES)}


async def _load_user(token: str, db: AsyncSession, allow_otp_pending: bool = False) -> User:
    payload = verify_token(token)
    scope = payload.get("scope", "full")

    if scope == "otp_pending" and not allow_otp_pending:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error_code": "AUTH_OTP_REQUIRED",
                "message": "OTP verification required to access this resource.",
                "detail": None,
            },
        )

    user_id_str = payload.get("sub")
    try:
        user_id = uuid.UUID(user_id_str)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error_code": "AUTH_TOKEN_INVALID",
                "message": "Invalid token subject.",
                "detail": None,
            },
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error_code": "AUTH_USER_NOT_FOUND",
                "message": "User not found.",
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

    return user


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    return await _load_user(token, db, allow_otp_pending=False)


async def get_current_user_otp_pending(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    return await _load_user(token, db, allow_otp_pending=True)


async def get_optional_user(
    token: Optional[str] = Depends(oauth2_scheme_optional),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    if token is None:
        return None
    try:
        return await _load_user(token, db, allow_otp_pending=False)
    except HTTPException:
        return None


def require_roles(*roles: str) -> Callable:
    """
    Returns a dependency that checks the current user's role is at least the minimum
    privilege level of any role listed. E.g. require_roles("manager") allows
    manager, admin, and super_admin.
    """
    min_index = min(ROLE_HIERARCHY.get(r, len(ROLES)) for r in roles)

    async def dependency(current_user: User = Depends(get_current_user)) -> User:
        user_index = ROLE_HIERARCHY.get(current_user.role, len(ROLES))
        if user_index > min_index:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error_code": "AUTH_INSUFFICIENT_ROLE",
                    "message": f"Requires one of roles: {', '.join(roles)}.",
                    "detail": None,
                },
            )
        return current_user

    return dependency
