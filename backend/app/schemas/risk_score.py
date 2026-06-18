"""
app/schemas/risk_score.py
Pydantic schema for risk score details.
"""
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class RiskScoreResponse(BaseModel):
    id: UUID
    scan_id: UUID
    website_id: UUID
    score: float
    grade: str
    critical_count: int
    high_count: int
    medium_count: int
    low_count: int
    info_count: int
    previous_score: float | None = None
    score_delta: float | None = None
    created_at: datetime
