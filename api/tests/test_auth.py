"""Auth endpoint tests."""
import pytest
from sqlalchemy import text

from app.security import hash_password


@pytest.mark.asyncio
async def test_login_invalid_credentials(client):
    response = await client.post(
        "/api/v1/auth/token",
        json={"email": "nobody@example.com", "password": "wrong"},
    )
    assert response.status_code == 401
    assert response.json()["detail"]["error_code"] == "AUTH_INVALID_CREDENTIALS"


@pytest.mark.asyncio
async def test_login_success(client, db_session):
    # Create a test user directly in DB
    from app.models.user import Organisation, User
    import uuid

    org = Organisation(id=uuid.uuid4(), name="Test Org", slug="test-org-auth")
    db_session.add(org)
    await db_session.flush()

    user = User(
        id=uuid.uuid4(),
        org_id=org.id,
        email="testuser@example.com",
        hashed_password=hash_password("TestPass123!"),
        role="employee",
        otp_verified=True,
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()

    response = await client.post(
        "/api/v1/auth/token",
        json={"email": "testuser@example.com", "password": "TestPass123!"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["user"]["email"] == "testuser@example.com"


@pytest.mark.asyncio
async def test_otp_request_unknown_email(client):
    response = await client.post(
        "/api/v1/auth/otp/request",
        json={"email": "nobody@nowhere.com", "purpose": "login"},
    )
    # Should always return 200 (don't leak whether email exists)
    assert response.status_code == 200
    assert "OTP" in response.json()["message"]
