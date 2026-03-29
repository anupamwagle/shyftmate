"""Payroll export router."""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.models.user import User
from app.schemas.workforce import ExportJobOut, ExportTriggerIn

router = APIRouter()

SUPPORTED_PLATFORMS = ["kronos", "keypay", "myob", "xero"]


@router.get("/platforms", summary="List export platforms with connection status")
async def list_platforms(
    current_user: User = Depends(require_roles("reviewer")),
):
    from app.config import get_settings
    settings = get_settings()

    platforms = [
        {
            "id": "kronos",
            "name": "UKG Pro WFM (Kronos)",
            "connected": bool(settings.KRONOS_BASE_URL and settings.KRONOS_CLIENT_ID),
            "description": "Export work rules and timesheets to Kronos/UKG Pro.",
            "modes": ["timesheets", "rules"],
        },
        {
            "id": "keypay",
            "name": "KeyPay / Employment Hero",
            "connected": False,
            "description": "Export pay categories and timesheets to KeyPay.",
            "modes": ["timesheets", "pay_categories"],
        },
        {
            "id": "myob",
            "name": "MYOB Payroll",
            "connected": False,
            "description": "Generate MYOB-compatible CSV exports.",
            "modes": ["timesheets"],
        },
        {
            "id": "xero",
            "name": "Xero Payroll",
            "connected": False,
            "description": "Generate Xero Payroll CSV exports.",
            "modes": ["timesheets"],
        },
    ]
    return platforms


@router.post("/trigger", summary="Trigger payroll export job", status_code=status.HTTP_201_CREATED)
async def trigger_export(
    body: ExportTriggerIn,
    current_user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    if body.platform not in SUPPORTED_PLATFORMS:
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "EXPORT_INVALID_PLATFORM",
                "message": f"Unsupported platform '{body.platform}'. Supported: {', '.join(SUPPORTED_PLATFORMS)}",
                "detail": None,
            },
        )

    # Import here to avoid circular imports and to handle missing models gracefully
    try:
        from app.models.workforce import PayrollExportJob
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail={"error_code": "MODEL_NOT_FOUND", "message": "PayrollExportJob model not available.", "detail": None},
        )

    if current_user.org_id is None:
        raise HTTPException(
            status_code=400,
            detail={"error_code": "NO_ORG", "message": "User must belong to an organisation.", "detail": None},
        )

    job = PayrollExportJob(
        org_id=current_user.org_id,
        platform=body.platform,
        agreement_id=body.agreement_id,
        timesheet_ids=[str(tid) for tid in body.timesheet_ids] if body.timesheet_ids else None,
        status="pending",
        created_by=current_user.id,
        created_at=datetime.now(timezone.utc),
    )
    db.add(job)
    await db.flush()

    # In a real implementation, enqueue to background worker (Celery/ARQ)
    # For now, run synchronously for small exports
    await _run_export_job(job.id, body.platform, body.agreement_id, body.timesheet_ids, db)

    return ExportJobOut.model_validate(job)


@router.get("/jobs", response_model=list[dict])
async def list_export_jobs(
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        from app.models.workforce import PayrollExportJob
    except ImportError:
        raise HTTPException(status_code=500, detail={"error_code": "MODEL_NOT_FOUND", "message": "PayrollExportJob model not available.", "detail": None})

    result = await db.execute(
        select(PayrollExportJob)
        .where(PayrollExportJob.org_id == current_user.org_id)
        .order_by(PayrollExportJob.created_at.desc())
        .limit(limit)
    )
    jobs = result.scalars().all()
    return [
        {
            "id": str(j.id),
            "platform": j.platform,
            "status": j.status,
            "result_payload": j.result_payload,
            "created_at": j.created_at.isoformat(),
            "completed_at": j.completed_at.isoformat() if j.completed_at else None,
        }
        for j in jobs
    ]


@router.get("/jobs/{job_id}", response_model=ExportJobOut, summary="Get export job status")
async def get_export_job(
    job_id: uuid.UUID,
    current_user: User = Depends(require_roles("reviewer")),
    db: AsyncSession = Depends(get_db),
):
    try:
        from app.models.workforce import PayrollExportJob
    except ImportError:
        raise HTTPException(status_code=500, detail={"error_code": "MODEL_NOT_FOUND", "message": "PayrollExportJob model not available.", "detail": None})

    job = await db.get(PayrollExportJob, job_id)
    if job is None:
        raise HTTPException(
            status_code=404,
            detail={"error_code": "JOB_NOT_FOUND", "message": "Export job not found.", "detail": None},
        )
    return job


async def _run_export_job(
    job_id: uuid.UUID,
    platform: str,
    agreement_id: Optional[uuid.UUID],
    timesheet_ids: Optional[list[uuid.UUID]],
    db: AsyncSession,
) -> None:
    """Run the export synchronously and update job status."""
    try:
        from app.models.workforce import PayrollExportJob
        job = await db.get(PayrollExportJob, job_id)
        if job is None:
            return

        job.status = "running"
        await db.flush()

        # Load adapter
        from app.core.payroll_adapters.base import ExportResult
        result: Optional[ExportResult] = None

        match platform:
            case "kronos":
                from app.core.payroll_adapters.kronos import KronosAdapter
                adapter = KronosAdapter()
            case "keypay":
                from app.core.payroll_adapters.keypay import KeyPayAdapter
                adapter = KeyPayAdapter()
            case "myob":
                from app.core.payroll_adapters.myob import MYOBAdapter
                adapter = MYOBAdapter()
            case "xero":
                from app.core.payroll_adapters.xero import XeroAdapter
                adapter = XeroAdapter()
            case _:
                adapter = None

        if adapter is not None:
            if agreement_id:
                result = await adapter.export_agreement(str(agreement_id), db)
            elif timesheet_ids:
                result = await adapter.export_timesheets([str(tid) for tid in timesheet_ids], db)

        job.status = "success" if (result is None or result.success) else "failed"
        job.result_payload = result.payload if result else {"message": "No export performed"}
        job.completed_at = datetime.now(timezone.utc)

    except Exception as e:
        try:
            from app.models.workforce import PayrollExportJob
            job = await db.get(PayrollExportJob, job_id)
            if job:
                job.status = "failed"
                job.result_payload = {"error": str(e)}
                job.completed_at = datetime.now(timezone.utc)
        except Exception:
            pass
