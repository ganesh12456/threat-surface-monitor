"""
app/routers/risk_scores.py
Risk score endpoints: get latest risk score.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from app.core import supabase as db_service
from app.core.security import get_current_user
from app.schemas.risk_score import RiskScoreResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/risk-scores", tags=["Risk Scores"])


@router.get(
    "/website/{website_id}/latest",
    response_model=RiskScoreResponse,
    summary="Get the latest risk score for a website",
)
async def get_latest_risk_score(
    website_id: str,
    current_user: dict = Depends(get_current_user),
) -> RiskScoreResponse:
    """
    Return the latest risk score record for the specified website.
    """
    # Verify website ownership
    w = await db_service.get_website(website_id, current_user["sub"])
    if not w:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Website not found.",
        )

    row = await db_service.get_latest_risk_score(website_id)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No risk score found for this website.",
        )

    return RiskScoreResponse(**row)
