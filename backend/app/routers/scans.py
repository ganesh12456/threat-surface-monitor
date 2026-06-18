"""
app/routers/scans.py
Scan retrieval endpoints: list, detail with findings, pipeline status.
"""
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core import supabase as db_service
from app.core.security import get_current_user
from app.schemas.finding import FindingResponse
from app.schemas.scan import PIPELINE_STAGES, PipelineStatus, ScanDetail, ScanResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/scans", tags=["Scans"])


async def _get_scan_or_404(scan_id: str) -> dict:
    """Fetch scan row or raise 404."""
    s = await db_service.get_scan(scan_id)
    if not s:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan not found.")
    
    # Enrich scan metadata with risk score details if available
    risk = await db_service.get_risk_score_by_scan(scan_id)
    
    return {
        "id": s["id"],
        "website_id": s["website_id"],
        "status": s["status"],
        "pipeline_stage": s.get("pipeline_stage"),
        "started_at": s.get("started_at"),
        "completed_at": s.get("completed_at"),
        "duration_seconds": s.get("duration_seconds"),
        "error_message": s.get("error_message"),
        "scan_metadata": s.get("scan_metadata", {}),
        "created_at": s["created_at"],
        "risk_score": risk.get("score") if risk else None,
        "grade": risk.get("grade") if risk else None,
        "critical_count": risk.get("critical_count", 0) if risk else 0,
        "high_count": risk.get("high_count", 0) if risk else 0,
        "medium_count": risk.get("medium_count", 0) if risk else 0,
        "low_count": risk.get("low_count", 0) if risk else 0,
        "info_count": risk.get("info_count", 0) if risk else 0,
    }


@router.get(
    "/",
    response_model=list[ScanResponse],
    summary="List scans with optional filters",
)
async def list_scans(
    website_id: str | None = Query(default=None),
    scan_status: str | None = Query(default=None, alias="status"),
    skip: int = 0,
    limit: int = 50,
    current_user: dict = Depends(get_current_user),
) -> list[ScanResponse]:
    """
    List scans accessible to the current user.
    Optionally filter by website_id or status.
    """
    raw_scans = await db_service.list_scans(
        user_id=current_user["sub"],
        status=scan_status,
        website_id=website_id,
        limit=limit,
        skip=skip,
    )
    
    enriched_scans = []
    for s in raw_scans:
        risk = await db_service.get_risk_score_by_scan(s["id"])
        enriched_scans.append({
            "id": s["id"],
            "website_id": s["website_id"],
            "status": s["status"],
            "pipeline_stage": s.get("pipeline_stage"),
            "started_at": s.get("started_at"),
            "completed_at": s.get("completed_at"),
            "duration_seconds": s.get("duration_seconds"),
            "error_message": s.get("error_message"),
            "scan_metadata": s.get("scan_metadata", {}),
            "created_at": s["created_at"],
            "risk_score": risk.get("score") if risk else None,
            "grade": risk.get("grade") if risk else None,
            "critical_count": risk.get("critical_count", 0) if risk else 0,
            "high_count": risk.get("high_count", 0) if risk else 0,
            "medium_count": risk.get("medium_count", 0) if risk else 0,
            "low_count": risk.get("low_count", 0) if risk else 0,
            "info_count": risk.get("info_count", 0) if risk else 0,
        })
        
    return [ScanResponse(**s) for s in enriched_scans]


@router.get(
    "/{scan_id}",
    response_model=ScanDetail,
    summary="Get full scan detail including findings and AI analysis",
)
async def get_scan(
    scan_id: str,
    current_user: dict = Depends(get_current_user),
) -> ScanDetail:
    """Return complete scan data: metadata, findings, risk score, AI recommendations."""
    scan = await _get_scan_or_404(scan_id)

    # Fetch findings
    raw_findings = await db_service.list_findings_by_scan(scan_id)
    
    # Sort findings by severity
    severity_order = {"critical": 1, "high": 2, "medium": 3, "low": 4, "informational": 5}
    raw_findings.sort(key=lambda x: severity_order.get(x.get("severity", "informational"), 6))
    
    findings = [
        FindingResponse(
            id=uuid.UUID(str(f["id"])),
            scan_id=uuid.UUID(str(f["scan_id"])),
            website_id=uuid.UUID(str(f["website_id"])),
            category=f["category"],
            title=f["title"],
            description=f.get("description"),
            severity=f.get("severity"),
            cvss_score=f.get("cvss_score"),
            affected_url=f.get("affected_url"),
            evidence=f.get("evidence"),
            remediation=f.get("remediation"),
            is_new=f.get("is_new", True),
            is_fixed=f.get("is_fixed", False),
            first_seen_at=f.get("first_seen_at"),
            last_seen_at=f.get("last_seen_at"),
            created_at=f["created_at"],
        )
        for f in raw_findings
    ]

    # Fetch AI recommendations
    rec = await db_service.get_recommendation_by_scan(scan_id)
    if not rec:
        rec = {}

    return ScanDetail(
        id=uuid.UUID(str(scan["id"])),
        website_id=uuid.UUID(str(scan["website_id"])),
        status=scan["status"],
        pipeline_stage=scan["pipeline_stage"],
        started_at=scan["started_at"],
        completed_at=scan["completed_at"],
        duration_seconds=scan["duration_seconds"],
        error_message=scan["error_message"],
        scan_metadata=scan["scan_metadata"],
        created_at=scan["created_at"],
        risk_score=scan["risk_score"],
        grade=scan["grade"],
        critical_count=scan["critical_count"],
        high_count=scan["high_count"],
        medium_count=scan["medium_count"],
        low_count=scan["low_count"],
        info_count=scan["info_count"],
        findings=findings,
        executive_summary=rec.get("executive_summary"),
        technical_summary=rec.get("technical_summary"),
        top_risks=rec.get("top_risks", []),
        business_impact=rec.get("business_impact"),
        remediation_steps=rec.get("remediation_steps", []),
        sola_analysis=rec.get("sola_analysis", {}),
    )


@router.get(
    "/{scan_id}/findings",
    response_model=list[FindingResponse],
    summary="Get findings for a scan with severity filter",
)
async def get_scan_findings(
    scan_id: str,
    severity: str | None = Query(default=None),
    category: str | None = Query(default=None),
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user),
) -> list[FindingResponse]:
    """Return findings for a scan, optionally filtered by severity and/or category."""
    await _get_scan_or_404(scan_id)

    raw_findings = await db_service.list_findings_by_scan(scan_id)
    
    # Filter
    filtered = []
    for f in raw_findings:
        if severity and f.get("severity") != severity:
            continue
        if category and category.lower() not in f.get("category", "").lower():
            continue
        filtered.append(f)
        
    # Sort
    severity_order = {"critical": 1, "high": 2, "medium": 3, "low": 4, "informational": 5}
    filtered.sort(key=lambda x: severity_order.get(x.get("severity", "informational"), 6))
    
    # Paginate
    paginated = filtered[skip : skip + limit]
    
    return [
        FindingResponse(
            id=uuid.UUID(str(f["id"])),
            scan_id=uuid.UUID(str(f["scan_id"])),
            website_id=uuid.UUID(str(f["website_id"])),
            category=f["category"],
            title=f["title"],
            description=f.get("description"),
            severity=f.get("severity"),
            cvss_score=f.get("cvss_score"),
            affected_url=f.get("affected_url"),
            evidence=f.get("evidence"),
            remediation=f.get("remediation"),
            is_new=f.get("is_new", True),
            is_fixed=f.get("is_fixed", False),
            first_seen_at=f.get("first_seen_at"),
            last_seen_at=f.get("last_seen_at"),
            created_at=f["created_at"],
        )
        for f in paginated
    ]


@router.get(
    "/{scan_id}/pipeline",
    response_model=PipelineStatus,
    summary="Get real-time pipeline stage progress for a scan",
)
async def get_pipeline_status(
    scan_id: str,
    current_user: dict = Depends(get_current_user),
) -> PipelineStatus:
    """Return the current pipeline stage and estimated progress percentage."""
    s = await db_service.get_scan(scan_id)
    if not s:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan not found.")

    sid = s["id"]
    scan_status = s["status"]
    pipeline_stage = s.get("pipeline_stage")
    started_at = s.get("started_at")
    
    current_stage = pipeline_stage or "initializing"

    try:
        stage_index = PIPELINE_STAGES.index(current_stage)
    except ValueError:
        stage_index = 0

    stages_completed = PIPELINE_STAGES[:stage_index]
    stages_remaining = PIPELINE_STAGES[stage_index + 1:]
    progress = int((stage_index / max(len(PIPELINE_STAGES) - 1, 1)) * 100)

    return PipelineStatus(
        scan_id=sid,
        status=scan_status,
        pipeline_stage=current_stage,
        stages_completed=stages_completed,
        stages_remaining=stages_remaining,
        progress_percent=progress,
        started_at=started_at,
        estimated_completion_seconds=max(0, (len(stages_remaining) * 5)),
    )

