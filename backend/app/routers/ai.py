"""
app/routers/ai.py
AI recommendations router: returns AI recommendations for a website.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from app.core import supabase as db_service
from app.core.security import get_current_user
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai", tags=["AI"])


class RecommendationResponse(BaseModel):
    executive_summary: str | None = None
    technical_summary: str | None = None
    top_risks: list[dict] = []
    business_impact: str | None = None
    remediation_steps: list[dict] = []


@router.get(
    "/recommendations/{website_id}",
    response_model=RecommendationResponse,
    summary="Get the latest AI security recommendations for a website",
)
async def get_latest_recommendations(
    website_id: str,
    current_user: dict = Depends(get_current_user),
) -> RecommendationResponse:
    """
    Return the latest AI-generated security assessment and recommendations for the specified website.
    """
    # Verify website ownership
    w = await db_service.get_website(website_id, current_user["sub"])
    if not w:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Website not found.",
        )

    row = await db_service.get_recommendations(website_id)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No AI recommendations found for this website.",
        )

    return RecommendationResponse(
        executive_summary=row.get("executive_summary"),
        technical_summary=row.get("technical_summary"),
        top_risks=row.get("top_risks", []),
        business_impact=row.get("business_impact"),
        remediation_steps=row.get("remediation_steps", []),
    )
