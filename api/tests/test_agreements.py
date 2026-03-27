"""Agreement CRUD and versioning tests."""
import pytest
import uuid
from app.security import hash_password


async def _create_admin_and_get_token(client, db_session):
    """Helper: create admin user and return auth token."""
    from app.models.user import Organisation, User

    org = Organisation(id=uuid.uuid4(), name="Test Org", slug=f"test-{uuid.uuid4().hex[:8]}")
    db_session.add(org)
    await db_session.flush()

    user = User(
        id=uuid.uuid4(),
        org_id=org.id,
        email=f"admin-{uuid.uuid4().hex[:8]}@test.com",
        hashed_password=hash_password("Admin123!"),
        role="admin",
        otp_verified=True,
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()

    resp = await client.post(
        "/api/v1/auth/token",
        json={"email": user.email, "password": "Admin123!"},
    )
    return resp.json()["access_token"]


@pytest.mark.asyncio
async def test_create_agreement(client, db_session):
    token = await _create_admin_and_get_token(client, db_session)
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.post(
        "/api/v1/agreements",
        json={
            "agreement_name": "Test Modern Award",
            "agreement_code": "MA999999",
            "agreement_type": "modern_award",
        },
        headers=headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["agreement_code"] == "MA999999"
    assert data["status"] == "draft"
    assert data["version"] == 1


@pytest.mark.asyncio
async def test_agreement_version_chain(client, db_session):
    token = await _create_admin_and_get_token(client, db_session)
    headers = {"Authorization": f"Bearer {token}"}

    # Create draft
    r1 = await client.post(
        "/api/v1/agreements",
        json={"agreement_name": "Award v1", "agreement_code": "MA888888", "agreement_type": "modern_award"},
        headers=headers,
    )
    assert r1.status_code == 201
    v1_id = r1.json()["id"]

    # Activate
    r2 = await client.post(
        f"/api/v1/agreements/{v1_id}/activate",
        json={"reason": "Test activation"},
        headers=headers,
    )
    assert r2.status_code == 200
    assert r2.json()["status"] == "active"

    # PATCH on active creates new version
    r3 = await client.patch(
        f"/api/v1/agreements/{v1_id}",
        json={"agreement_name": "Award v2"},
        headers=headers,
    )
    assert r3.status_code == 200
    v2 = r3.json()
    assert v2["version"] == 2
    assert v2["status"] == "draft"
    assert v2["parent_version_id"] == v1_id


@pytest.mark.asyncio
async def test_agreement_requires_auth(client):
    response = await client.get("/api/v1/agreements")
    assert response.status_code == 401
