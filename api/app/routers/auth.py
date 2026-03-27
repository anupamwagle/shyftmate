"""Auth router — Google OAuth2, Apple Sign-In, OTP 2FA, email+password."""
from fastapi import APIRouter

router = APIRouter()

# TODO Phase 1: implement endpoints
# POST /token          — email+password login
# POST /refresh        — refresh JWT
# POST /logout         — revoke refresh token
# POST /social/google  — exchange Google ID token → JWT
# POST /social/apple   — exchange Apple identity token → JWT
# POST /otp/request    — send OTP via AWS SES
# POST /otp/verify     — verify OTP → full-scope JWT
