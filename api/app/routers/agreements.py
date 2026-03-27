"""Agreements router — CRUD, versioning, rollback, and all sub-resources."""
from fastapi import APIRouter

router = APIRouter()

# TODO Phase 2: implement endpoints
# GET/POST   /agreements
# GET/PATCH  /agreements/{id}
# GET        /agreements/{id}/history
# POST       /agreements/{id}/activate
# POST       /agreements/{id}/rollback/{target_version_id}
# GET/POST   /agreements/{id}/employee-types
# GET/PATCH/DELETE /agreements/{id}/employee-types/{et}
# GET/POST   /agreements/{id}/employee-types/{et}/rule-lines
# GET/POST   /agreements/{id}/allowances
# GET/POST   /agreements/{id}/leave-paycodes
# GET/POST   /agreements/{id}/wage-table
# GET/POST   /agreements/{id}/kronos-config
# GET/PUT    /agreements/{id}/recurring-allowances
# GET/POST   /paycodes  — global Kronos paycodes library
