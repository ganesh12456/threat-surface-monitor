"""
app/routers/websites.py
Website management endpoints: CRUD, scan triggers, and history.
"""
import logging
import uuid
import asyncio
from datetime import datetime, timezone, timedelta, date

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status

from app.core import supabase as db_service
from app.core.security import get_current_user
from app.schemas.website import FindingCounts, WebsiteCreate, WebsiteResponse, WebsiteUpdate
from app.tasks.background import run_website_scan

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/websites", tags=["Websites"])


async def _get_website_or_404(
    website_id: str,
    user_id: str,
) -> dict:
    """Fetch a website owned by user_id or raise 404."""
    row = await db_service.get_website(website_id, user_id)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Website not found.",
        )
    return row


async def _enrich_website(website: dict) -> WebsiteResponse:
    """Attach last risk score, grade, and finding counts to a website dict."""
    website_id = str(website["id"])

    # Latest risk score
    score_row = await db_service.get_latest_risk_score(website_id)

    # Finding counts from latest completed scan
    counts_rows = await db_service.get_latest_finding_counts(website_id)
    finding_counts = FindingCounts()
    for sev, cnt in counts_rows.items():
        if hasattr(finding_counts, sev):
            setattr(finding_counts, sev, cnt)

    return WebsiteResponse(
        id=uuid.UUID(str(website["id"])),
        user_id=uuid.UUID(str(website["user_id"])),
        url=website["url"],
        name=website["name"],
        description=website["description"],
        is_active=website["is_active"],
        scan_frequency=website["scan_frequency"],
        last_scan_at=website.get("last_scan_at"),
        created_at=website["created_at"],
        updated_at=website["updated_at"],
        last_risk_score=float(score_row["score"]) if score_row else None,
        last_grade=score_row["grade"] if score_row else None,
        finding_counts=finding_counts,
    )


@router.get(
    "/",
    response_model=list[WebsiteResponse],
    summary="List all websites for the current user",
)
async def list_websites(
    skip: int = 0,
    limit: int = 50,
    current_user: dict = Depends(get_current_user),
) -> list[WebsiteResponse]:
    """Return all websites owned by the authenticated user, enriched with latest scan data."""
    websites = await db_service.list_websites(current_user["sub"])
    
    # Paginate manually if needed
    paginated = websites[skip : skip + limit]

    # Enrich all concurrently
    enriched = await asyncio.gather(
        *[_enrich_website(w) for w in paginated],
        return_exceptions=False,
    )
    return list(enriched)


@router.post(
    "/",
    response_model=WebsiteResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a new website to monitor",
)
async def create_website(
    body: WebsiteCreate,
    current_user: dict = Depends(get_current_user),
) -> WebsiteResponse:
    """Add a website to the monitoring list and return its record."""
    website_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    website_data = {
        "id": website_id,
        "user_id": current_user["sub"],
        "url": body.url,
        "name": body.name or body.url,
        "description": body.description,
        "is_active": True,
        "scan_frequency": body.scan_frequency,
        "last_scan_at": None,
        "created_at": now,
        "updated_at": now,
    }
    await db_service.create_website(website_data)

    logger.info("Website added: %s by user %s", body.url, current_user["sub"])
    return await _enrich_website(website_data)


@router.get(
    "/{website_id}",
    response_model=WebsiteResponse,
    summary="Get a website by ID",
)
async def get_website(
    website_id: str,
    current_user: dict = Depends(get_current_user),
) -> WebsiteResponse:
    """Return a single website with enriched scan metadata."""
    website = await _get_website_or_404(website_id, current_user["sub"])
    return await _enrich_website(website)


@router.put(
    "/{website_id}",
    response_model=WebsiteResponse,
    summary="Update a website's configuration",
)
async def update_website(
    website_id: str,
    body: WebsiteUpdate,
    current_user: dict = Depends(get_current_user),
) -> WebsiteResponse:
    """Update mutable fields on a website record."""
    await _get_website_or_404(website_id, current_user["sub"])

    updates: dict = {}
    if body.name is not None:
        updates["name"] = body.name
    if body.description is not None:
        updates["description"] = body.description
    if body.is_active is not None:
        updates["is_active"] = body.is_active
    if body.scan_frequency is not None:
        updates["scan_frequency"] = body.scan_frequency

    if updates:
        updates["updated_at"] = datetime.now(timezone.utc)
        await db_service.update_website(website_id, updates)

    website = await _get_website_or_404(website_id, current_user["sub"])
    return await _enrich_website(website)


@router.delete(
    "/{website_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a website and all associated data",
)
async def delete_website(
    website_id: str,
    current_user: dict = Depends(get_current_user),
) -> None:
    """Permanently delete a website (CASCADE deletes scans, findings, etc.)."""
    await _get_website_or_404(website_id, current_user["sub"])
    await db_service.delete_website(website_id)
    logger.info("Website deleted: %s by user %s", website_id, current_user["sub"])


@router.post(
    "/{website_id}/scan",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger a security scan for a website",
)
async def trigger_scan(
    website_id: str,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """
    Create a scan record and dispatch the full pipeline as a background task.
    """
    website = await _get_website_or_404(website_id, current_user["sub"])

    # Check for active scan
    scans = await db_service.list_scans_by_website(website_id)
    active = [s for s in scans if s.get("status") in ("pending", "running")]
    if active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A scan is already in progress for this website.",
        )

    scan_id = str(uuid.uuid4())
    await db_service.create_scan({
        "id": scan_id,
        "website_id": website_id,
        "status": "pending",
        "pipeline_stage": "queued",
        "created_at": datetime.now(timezone.utc),
    })

    background_tasks.add_task(
        run_website_scan,
        scan_id=scan_id,
        website_id=website_id,
        url=website["url"],
    )

    logger.info("Scan triggered: %s for website %s", scan_id, website_id)
    return {
        "scan_id": scan_id,
        "website_id": website_id,
        "url": website["url"],
        "status": "pending",
        "message": "Scan initiated. Poll GET /scans/{scan_id}/pipeline for real-time status.",
    }


@router.get(
    "/{website_id}/history",
    summary="Get historical scan records for a website",
)
async def get_website_history(
    website_id: str,
    days: int = 30,
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    """Return daily risk score history for the past *days* days."""
    await _get_website_or_404(website_id, current_user["sub"])

    h_scans = await db_service.list_historical_scans(website_id, days)
    
    # Filter recent historical scans based on date
    cutoff = date.today() - timedelta(days=days)
    
    recent_scans = []
    for h in h_scans:
        # scan_date could be string or date object depending on source
        scan_date_val = h.get("scan_date")
        if isinstance(scan_date_val, str):
            scan_date = date.fromisoformat(scan_date_val)
        else:
            scan_date = scan_date_val
            
        if scan_date >= cutoff:
            recent_scans.append({
                "scan_date": scan_date.isoformat() if isinstance(scan_date, date) else scan_date,
                "risk_score": h.get("risk_score"),
                "grade": h.get("grade"),
                "critical_count": h.get("critical_count", 0),
                "high_count": h.get("high_count", 0),
                "medium_count": h.get("medium_count", 0),
                "low_count": h.get("low_count", 0),
                "created_at": h.get("created_at"),
            })
            
    recent_scans.sort(key=lambda x: x["scan_date"])
    return recent_scans

