"""
app/routers/findings.py
Findings retrieval endpoint with flexible filtering using the database service.
"""
import logging
import uuid

from fastapi import APIRouter, Depends, Query

from app.core import supabase as db_service
from app.core.security import get_current_user
from app.schemas.finding import FindingResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/findings", tags=["Findings"])


@router.get(
    "/",
    response_model=list[FindingResponse],
    summary="List findings with optional filters",
)
async def list_findings(
    website_id: str | None = Query(default=None),
    scan_id: str | None = Query(default=None),
    severity: str | None = Query(default=None),
    category: str | None = Query(default=None),
    is_new: bool | None = Query(default=None),
    is_fixed: bool | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    current_user: dict = Depends(get_current_user),
) -> list[FindingResponse]:
    """
    Retrieve findings across websites owned by the current user.
    """
    raw_findings = await db_service.list_findings_across_websites(
        user_id=current_user["sub"],
        website_id=website_id,
        scan_id=scan_id,
        severity=severity,
        category=category,
        is_new=is_new,
        is_fixed=is_fixed,
        limit=limit,
        skip=skip,
    )
    
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
        for f in raw_findings
    ]

