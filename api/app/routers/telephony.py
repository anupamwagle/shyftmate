"""Telephony router — SignalWire webhook + WebSocket Media Streams + prospects."""
from fastapi import APIRouter

router = APIRouter()

# TODO Phase 3b: implement endpoints
# POST /inbound               — SignalWire webhook: create prospect + session, return SWML
# WS   /stream/{session_id}  — SignalWire Media Streams WebSocket (audio pipeline)
# POST /status                — SignalWire call status callback
# GET  /prospects             — list captured prospects (admin only)
# GET  /prospects/{id}        — prospect detail + agreement preview
# POST /prospects/{id}/provision — create org + user + send SES invite
