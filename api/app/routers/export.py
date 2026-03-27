"""Payroll export router."""
from fastapi import APIRouter

router = APIRouter()

# TODO Phase 11: implement endpoints
# POST /trigger         — enqueue export job (platform, rule_ids, timesheet_ids)
# GET  /jobs/{id}       — poll job status
# GET  /platforms       — platforms + connection status
