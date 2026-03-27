"""Chat router — mobile BA conversation sessions."""
from fastapi import APIRouter

router = APIRouter()

# TODO Phase 3: implement endpoints
# POST /sessions                — start/resume conversation
# GET  /sessions/{id}           — get session state
# POST /sessions/{id}/messages  — send message, get AI reply + rule delta
