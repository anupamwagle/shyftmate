"""Users & Orgs router."""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.models.user import Organisation, User
from app.models.workforce import Location
from app.schemas.user import (
    OrganisationCreate,
    OrganisationOut,
    OrganisationUpdate,
    OrgSettingsOut,
    OrgSettingsUpdate,
    UserCreate,
    UserOut,
    UserUpdate,
)
from app.schemas.workforce import LocationCreate, LocationOut, LocationUpdate
from app.security import hash_password
from app.services.audit_service import log_action
from app.services.email_service import get_email_service
from app.config import get_settings

router = APIRouter()


# ── Organisations ────────────────────────────────────────────

@router.get("/orgs", response_model=list[OrganisationOut], summary="List all organisations")
async def list_orgs(
    current_user: User = Depends(require_roles("super_admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Organisation).order_by(Organisation.created_at.desc()))
    return result.scalars().all()


@router.post("/orgs", response_model=OrganisationOut, status_code=status.HTTP_201_CREATED, summary="Create organisation")
async def create_org(
    body: OrganisationCreate,
    request: Request,
    current_user: User = Depends(require_roles("super_admin")),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(Organisation).where(Organisation.slug == body.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error_code": "ORG_SLUG_EXISTS", "message": "Slug already in use.", "detail": None},
        )
    org = Organisation(**body.model_dump())
    db.add(org)
    await db.flush()
    await log_action(db, "organisation", org.id, "created", current_user.id,
                     after=body.model_dump(), ip_address=request.client.host if request.client else None)
    return org


@router.get("/orgs/{org_id}", response_model=OrganisationOut, summary="Get organisation")
async def get_org(
    org_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org = await db.get(Organisation, org_id)
    if org is None:
        raise HTTPException(status_code=404, detail={"error_code": "ORG_NOT_FOUND", "message": "Organisation not found.", "detail": None})
    # super_admin can see any; others must belong to same org
    if current_user.role != "super_admin" and current_user.org_id != org_id:
        raise HTTPException(status_code=403, detail={"error_code": "AUTH_INSUFFICIENT_ROLE", "message": "Access denied.", "detail": None})
    return org


@router.patch("/orgs/{org_id}", response_model=OrganisationOut, summary="Update organisation")
async def update_org(
    org_id: uuid.UUID,
    body: OrganisationUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org = await db.get(Organisation, org_id)
    if org is None:
        raise HTTPException(status_code=404, detail={"error_code": "ORG_NOT_FOUND", "message": "Organisation not found.", "detail": None})

    from app.dependencies import ROLE_HIERARCHY
    user_index = ROLE_HIERARCHY.get(current_user.role, 99)
    admin_index = ROLE_HIERARCHY.get("admin", 99)
    if current_user.role != "super_admin" and (user_index > admin_index or current_user.org_id != org_id):
        raise HTTPException(status_code=403, detail={"error_code": "AUTH_INSUFFICIENT_ROLE", "message": "Access denied.", "detail": None})

    before = OrganisationOut.model_validate(org).model_dump()
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(org, field, value)
    await log_action(db, "organisation", org.id, "updated", current_user.id,
                     before=before, after=body.model_dump(exclude_unset=True),
                     ip_address=request.client.host if request.client else None)
    return org


@router.delete("/orgs/{org_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Soft-delete organisation")
async def delete_org(
    org_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_roles("super_admin")),
    db: AsyncSession = Depends(get_db),
):
    org = await db.get(Organisation, org_id)
    if org is None:
        raise HTTPException(status_code=404, detail={"error_code": "ORG_NOT_FOUND", "message": "Organisation not found.", "detail": None})
    org.is_active = False
    await log_action(db, "organisation", org.id, "deleted", current_user.id,
                     ip_address=request.client.host if request.client else None)


# ── Org Settings (current user's org) ─────────────────────────

@router.get("/orgs/me/settings", response_model=OrgSettingsOut, summary="Get org settings")
async def get_org_settings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.org_id is None:
        raise HTTPException(
            status_code=400,
            detail={"error_code": "NO_ORG", "message": "User is not assigned to an organisation.", "detail": None},
        )
    org = await db.get(Organisation, current_user.org_id)
    if org is None:
        raise HTTPException(status_code=404, detail={"error_code": "ORG_NOT_FOUND", "message": "Organisation not found.", "detail": None})
    return org


@router.patch("/orgs/me/settings", response_model=OrgSettingsOut, summary="Update org settings")
async def update_org_settings(
    body: OrgSettingsUpdate,
    request: Request,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    if current_user.org_id is None:
        raise HTTPException(
            status_code=400,
            detail={"error_code": "NO_ORG", "message": "User is not assigned to an organisation.", "detail": None},
        )
    org = await db.get(Organisation, current_user.org_id)
    if org is None:
        raise HTTPException(status_code=404, detail={"error_code": "ORG_NOT_FOUND", "message": "Organisation not found.", "detail": None})

    # Check for slug uniqueness if changing slug
    updates = body.model_dump(exclude_unset=True)
    if "slug" in updates and updates["slug"] != org.slug:
        existing = await db.execute(select(Organisation).where(Organisation.slug == updates["slug"]))
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=409,
                detail={"error_code": "ORG_SLUG_EXISTS", "message": "Slug already in use.", "detail": None},
            )

    before = OrgSettingsOut.model_validate(org).model_dump()
    for field, value in updates.items():
        setattr(org, field, value)
    await log_action(db, "organisation", org.id, "settings_updated", current_user.id,
                     before=before, after=updates,
                     ip_address=request.client.host if request.client else None)
    return org


# ── Admin User Management ─────────────────────────────────────

@router.get("/admin/users", response_model=list[dict], summary="List all users (admin)")
async def admin_list_users(
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role == "super_admin":
        q = (
            select(User, Organisation.name.label("org_name"))
            .outerjoin(Organisation, User.org_id == Organisation.id)
            .order_by(User.created_at.desc())
        )
    else:
        q = (
            select(User, Organisation.name.label("org_name"))
            .outerjoin(Organisation, User.org_id == Organisation.id)
            .where(User.org_id == current_user.org_id)
            .order_by(User.created_at.desc())
        )
    rows = (await db.execute(q)).all()
    return [
        {
            "id": str(u.id),
            "user_id": str(u.id),
            "org_id": str(u.org_id) if u.org_id else None,
            "org_name": org_name,
            "email": u.email,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "role": u.role,
            "is_active": u.is_active,
            "avatar_url": u.avatar_url,
            "last_login": u.last_login_at.isoformat() if u.last_login_at else None,
            "created_at": u.created_at.isoformat(),
        }
        for u, org_name in rows
    ]


@router.post("/admin/users/invite", response_model=UserOut, status_code=status.HTTP_201_CREATED, summary="Invite user (admin)")
async def admin_invite_user(
    body: UserCreate,
    request: Request,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(User).where(User.email == body.email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail={"error_code": "USER_EMAIL_EXISTS", "message": "Email already registered.", "detail": None},
        )
    org_id = body.org_id or current_user.org_id
    user = User(
        email=body.email.lower(),
        hashed_password=None,
        first_name=body.first_name,
        last_name=body.last_name,
        phone=body.phone,
        org_id=org_id,
        role=body.role,
        otp_verified=False,
    )
    db.add(user)
    await db.flush()
    settings = get_settings()
    invite_link = f"{settings.API_BASE_URL}/accept-invite?user_id={user.id}"
    get_email_service().send_invite_email(
        to_email=user.email,
        first_name=user.first_name,
        org_name="Your Organisation",
        invite_link=invite_link,
    )
    await log_action(db, "user", user.id, "invited", current_user.id,
                     after={"email": user.email, "role": user.role},
                     ip_address=request.client.host if request.client else None)
    return user


@router.patch("/admin/users/{user_id}", response_model=UserOut, summary="Update user (admin)")
async def admin_update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    request: Request,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=404,
            detail={"error_code": "USER_NOT_FOUND", "message": "User not found.", "detail": None},
        )
    if current_user.role != "super_admin" and current_user.org_id != user.org_id:
        raise HTTPException(
            status_code=403,
            detail={"error_code": "AUTH_INSUFFICIENT_ROLE", "message": "Access denied.", "detail": None},
        )
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    await log_action(db, "user", user.id, "updated", current_user.id,
                     after=body.model_dump(exclude_unset=True),
                     ip_address=request.client.host if request.client else None)
    return user


# ── Users ────────────────────────────────────────────────────

@router.get("/users/me", response_model=UserOut, summary="Current user profile")
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/users/me", response_model=UserOut, summary="Update own profile")
async def update_me(
    body: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    allowed = {"first_name", "last_name", "phone", "avatar_url"}
    for field, value in body.model_dump(exclude_unset=True).items():
        if field in allowed:
            setattr(current_user, field, value)
    return current_user


@router.get("/orgs/{org_id}/users", response_model=list[UserOut], summary="List org users")
async def list_org_users(
    org_id: uuid.UUID,
    current_user: User = Depends(require_roles("manager")),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role != "super_admin" and current_user.org_id != org_id:
        raise HTTPException(status_code=403, detail={"error_code": "AUTH_INSUFFICIENT_ROLE", "message": "Access denied.", "detail": None})
    result = await db.execute(select(User).where(User.org_id == org_id).order_by(User.created_at))
    return result.scalars().all()


@router.post("/orgs/{org_id}/users", response_model=UserOut, status_code=status.HTTP_201_CREATED, summary="Create/invite user")
async def create_org_user(
    org_id: uuid.UUID,
    body: UserCreate,
    request: Request,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role != "super_admin" and current_user.org_id != org_id:
        raise HTTPException(status_code=403, detail={"error_code": "AUTH_INSUFFICIENT_ROLE", "message": "Access denied.", "detail": None})

    existing = await db.execute(select(User).where(User.email == body.email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail={"error_code": "USER_EMAIL_EXISTS", "message": "Email already registered.", "detail": None})

    user = User(
        email=body.email.lower(),
        hashed_password=hash_password(body.password) if body.password else None,
        first_name=body.first_name,
        last_name=body.last_name,
        phone=body.phone,
        org_id=org_id,
        role=body.role,
        otp_verified=False,
    )
    db.add(user)
    await db.flush()

    settings = get_settings()
    invite_link = f"{settings.API_BASE_URL}/accept-invite?user_id={user.id}"
    get_email_service().send_invite_email(
        to_email=user.email,
        first_name=user.first_name,
        org_name="Your Organisation",
        invite_link=invite_link,
    )

    await log_action(db, "user", user.id, "created", current_user.id,
                     after={"email": user.email, "role": user.role, "org_id": str(org_id)},
                     ip_address=request.client.host if request.client else None)
    return user


@router.patch("/users/{user_id}", response_model=UserOut, summary="Update user")
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    request: Request,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail={"error_code": "USER_NOT_FOUND", "message": "User not found.", "detail": None})

    if current_user.role != "super_admin" and current_user.org_id != user.org_id:
        raise HTTPException(status_code=403, detail={"error_code": "AUTH_INSUFFICIENT_ROLE", "message": "Access denied.", "detail": None})

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    await log_action(db, "user", user.id, "updated", current_user.id,
                     after=body.model_dump(exclude_unset=True),
                     ip_address=request.client.host if request.client else None)
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Deactivate user")
async def deactivate_user(
    user_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail={"error_code": "USER_NOT_FOUND", "message": "User not found.", "detail": None})
    if current_user.role != "super_admin" and current_user.org_id != user.org_id:
        raise HTTPException(status_code=403, detail={"error_code": "AUTH_INSUFFICIENT_ROLE", "message": "Access denied.", "detail": None})
    user.is_active = False
    await log_action(db, "user", user.id, "deleted", current_user.id,
                     ip_address=request.client.host if request.client else None)


# ── Locations ────────────────────────────────────────────────

@router.get("/orgs/{org_id}/locations", response_model=list[LocationOut], summary="List locations")
async def list_locations(
    org_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role != "super_admin" and current_user.org_id != org_id:
        raise HTTPException(status_code=403, detail={"error_code": "AUTH_INSUFFICIENT_ROLE", "message": "Access denied.", "detail": None})
    result = await db.execute(select(Location).where(Location.org_id == org_id))
    return result.scalars().all()


@router.post("/orgs/{org_id}/locations", response_model=LocationOut, status_code=status.HTTP_201_CREATED, summary="Create location")
async def create_location(
    org_id: uuid.UUID,
    body: LocationCreate,
    request: Request,
    current_user: User = Depends(require_roles("manager")),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role != "super_admin" and current_user.org_id != org_id:
        raise HTTPException(status_code=403, detail={"error_code": "AUTH_INSUFFICIENT_ROLE", "message": "Access denied.", "detail": None})
    location = Location(org_id=org_id, **body.model_dump())
    db.add(location)
    await db.flush()
    await log_action(db, "location", location.id, "created", current_user.id,
                     after=body.model_dump(), ip_address=request.client.host if request.client else None)
    return location


@router.patch("/locations/{location_id}", response_model=LocationOut, summary="Update location")
async def update_location(
    location_id: uuid.UUID,
    body: LocationUpdate,
    request: Request,
    current_user: User = Depends(require_roles("manager")),
    db: AsyncSession = Depends(get_db),
):
    location = await db.get(Location, location_id)
    if location is None:
        raise HTTPException(status_code=404, detail={"error_code": "LOCATION_NOT_FOUND", "message": "Location not found.", "detail": None})
    if current_user.role != "super_admin" and current_user.org_id != location.org_id:
        raise HTTPException(status_code=403, detail={"error_code": "AUTH_INSUFFICIENT_ROLE", "message": "Access denied.", "detail": None})
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(location, field, value)
    await log_action(db, "location", location.id, "updated", current_user.id,
                     after=body.model_dump(exclude_unset=True),
                     ip_address=request.client.host if request.client else None)
    return location


# ── Org Context Switching (super_admin only) ─────────────────

@router.post("/orgs/switch", response_model=dict, summary="Switch org context (super_admin)")
async def switch_org_context(
    body: dict,
    request: Request,
    current_user: User = Depends(require_roles("super_admin")),
    db: AsyncSession = Depends(get_db),
):
    """Super admin switches their active org context. Returns a new JWT scoped to the target org."""
    from app.security import create_access_token
    org_id = body.get("org_id")
    if not org_id:
        raise HTTPException(status_code=422, detail={"error_code": "VALIDATION_ERROR", "message": "org_id is required.", "detail": None})
    org = await db.get(Organisation, uuid.UUID(org_id))
    if org is None:
        raise HTTPException(status_code=404, detail={"error_code": "ORG_NOT_FOUND", "message": "Organisation not found.", "detail": None})
    # Issue a new access token scoped to the target org (role remains super_admin)
    settings = get_settings()
    token = create_access_token(
        subject=str(current_user.id),
        role=current_user.role,
        org_id=str(org.id),
        expires_minutes=settings.JWT_ACCESS_EXPIRE_MINUTES,
    )
    await log_action(db, "organisation", org.id, "context_switch", current_user.id,
                     ip_address=request.client.host if request.client else None)
    return {"access_token": token, "org_id": str(org.id), "org_name": org.name}


@router.delete("/locations/{location_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete location")
async def delete_location(
    location_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    location = await db.get(Location, location_id)
    if location is None:
        raise HTTPException(status_code=404, detail={"error_code": "LOCATION_NOT_FOUND", "message": "Location not found.", "detail": None})
    if current_user.role != "super_admin" and current_user.org_id != location.org_id:
        raise HTTPException(status_code=403, detail={"error_code": "AUTH_INSUFFICIENT_ROLE", "message": "Access denied.", "detail": None})
    await db.delete(location)
    await log_action(db, "location", location_id, "deleted", current_user.id,
                     ip_address=request.client.host if request.client else None)
