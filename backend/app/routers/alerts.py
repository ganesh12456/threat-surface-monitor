"""
app/routers/alerts.py
Alert management endpoints: list, acknowledge, delete using database service.
"""
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core import supabase as db_service
from app.core.security import get_current_user
from app.schemas.alert import AlertAcknowledge, AlertResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/alerts", tags=["Alerts"])


async def _get_alert_or_404(alert_id: str, user_id: str) -> dict:
    """Fetch an alert that belongs to one of the user's websites."""
    alerts = await db_service.list_alerts(user_id)
    found = [a for a in alerts if str(a["id"]) == str(alert_id)]
    if not found:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found.")
    return found[0]


@router.get(
    "/",
    response_model=list[AlertResponse],
    summary="List alerts for the current user's websites",
)
async def list_alerts(
    website_id: str | None = Query(default=None),
    acknowledged: bool | None = Query(default=None),
    severity: str | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    current_user: dict = Depends(get_current_user),
) -> list[AlertResponse]:
    """
    List security alerts for websites owned by the current user.
    """
    alerts = await db_service.list_alerts(current_user["sub"])

    # Apply filters
    if website_id:
        alerts = [a for a in alerts if str(a.get("website_id")) == str(website_id)]
    if acknowledged is not None:
        alerts = [a for a in alerts if a.get("is_acknowledged") == acknowledged]
    if severity:
        alerts = [a for a in alerts if a.get("severity") == severity]

    # Sort and paginate
    alerts.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    paginated = alerts[skip : skip + limit]

    return [
        AlertResponse(
            id=uuid.UUID(str(a["id"])),
            website_id=uuid.UUID(str(a["website_id"])),
            scan_id=uuid.UUID(str(a["scan_id"])) if a.get("scan_id") else None,
            finding_id=uuid.UUID(str(a["finding_id"])) if a.get("finding_id") else None,
            alert_type=a["alert_type"],
            title=a["title"],
            message=a.get("message"),
            severity=a.get("severity"),
            is_acknowledged=a.get("is_acknowledged", False),
            channels_sent=a.get("channels_sent", []),
            created_at=a["created_at"],
        )
        for a in paginated
    ]


@router.patch(
    "/{alert_id}/acknowledge",
    response_model=AlertResponse,
    summary="Acknowledge an alert",
)
async def acknowledge_alert(
    alert_id: str,
    body: AlertAcknowledge,
    current_user: dict = Depends(get_current_user),
) -> AlertResponse:
    """Mark an alert as acknowledged (or un-acknowledge if acknowledged=False)."""
    await _get_alert_or_404(alert_id, current_user["sub"])

    updated = await db_service.update_alert(alert_id, {"is_acknowledged": body.acknowledged})
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found.")

    return AlertResponse(
        id=uuid.UUID(str(updated["id"])),
        website_id=uuid.UUID(str(updated["website_id"])),
        scan_id=uuid.UUID(str(updated["scan_id"])) if updated.get("scan_id") else None,
        finding_id=uuid.UUID(str(updated["finding_id"])) if updated.get("finding_id") else None,
        alert_type=updated["alert_type"],
        title=updated["title"],
        message=updated.get("message"),
        severity=updated.get("severity"),
        is_acknowledged=updated.get("is_acknowledged", False),
        channels_sent=updated.get("channels_sent", []),
        created_at=updated["created_at"],
    )


@router.post(
    "/{alert_id}/acknowledge",
    response_model=AlertResponse,
    summary="Acknowledge an alert (POST endpoint for frontend compatibility)",
)
async def acknowledge_alert_post(
    alert_id: str,
    current_user: dict = Depends(get_current_user),
) -> AlertResponse:
    """Mark an alert as acknowledged (defaults to True)."""
    await _get_alert_or_404(alert_id, current_user["sub"])

    updated = await db_service.update_alert(alert_id, {"is_acknowledged": True})
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found.")

    return AlertResponse(
        id=uuid.UUID(str(updated["id"])),
        website_id=uuid.UUID(str(updated["website_id"])),
        scan_id=uuid.UUID(str(updated["scan_id"])) if updated.get("scan_id") else None,
        finding_id=uuid.UUID(str(updated["finding_id"])) if updated.get("finding_id") else None,
        alert_type=updated["alert_type"],
        title=updated["title"],
        message=updated.get("message"),
        severity=updated.get("severity"),
        is_acknowledged=updated.get("is_acknowledged", True),
        channels_sent=updated.get("channels_sent", []),
        created_at=updated["created_at"],
    )


@router.delete(
    "/{alert_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an alert",
)
async def delete_alert(
    alert_id: str,
    current_user: dict = Depends(get_current_user),
) -> None:
    """Permanently delete an alert record."""
    await _get_alert_or_404(alert_id, current_user["sub"])
    await db_service.delete_alert(alert_id)
    logger.info("Alert %s deleted by user %s", alert_id, current_user["sub"])

