"""Startup seed — creates super admin org and user if they don't exist."""
import uuid
from datetime import datetime, timezone

from passlib.context import CryptContext
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

PLATFORM_ORG_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
SUPER_ADMIN_ID = uuid.UUID("00000000-0000-0000-0000-000000000002")


async def run_seed(db: AsyncSession) -> None:
    settings = get_settings()

    # Ensure platform org exists
    result = await db.execute(
        text("SELECT id FROM organisations WHERE id = :id"),
        {"id": PLATFORM_ORG_ID},
    )
    if not result.scalar_one_or_none():
        await db.execute(
            text(
                "INSERT INTO organisations (id, name, slug, plan, timezone, is_active) "
                "VALUES (:id, :name, :slug, :plan, :tz, true)"
            ),
            {
                "id": PLATFORM_ORG_ID,
                "name": "Gator Platform",
                "slug": "platform",
                "plan": "enterprise",
                "tz": "Australia/Sydney",
            },
        )

    # Ensure super admin user exists
    result = await db.execute(
        text("SELECT id FROM users WHERE email = :email"),
        {"email": settings.SUPER_ADMIN_EMAIL},
    )
    if not result.scalar_one_or_none():
        hashed = pwd_context.hash(settings.SUPER_ADMIN_PASSWORD)
        await db.execute(
            text(
                "INSERT INTO users "
                "(id, org_id, email, hashed_password, role, first_name, last_name, is_active, otp_verified) "
                "VALUES (:id, :org_id, :email, :pwd, 'super_admin', 'Super', 'Admin', true, true)"
            ),
            {
                "id": SUPER_ADMIN_ID,
                "org_id": PLATFORM_ORG_ID,
                "email": settings.SUPER_ADMIN_EMAIL,
                "pwd": hashed,
            },
        )
        await db.commit()
