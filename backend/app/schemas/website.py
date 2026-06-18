"""
app/schemas/website.py
Pydantic v2 schemas for website management endpoints.
"""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, HttpUrl, Field, field_validator


class WebsiteCreate(BaseModel):
    """Request body for adding a new website."""

    url: str = Field(..., description="Full URL including scheme, e.g. https://example.com")
    name: str | None = None
    description: str | None = None
    scan_frequency: str = Field(
        default="daily",
        pattern="^(hourly|daily|weekly|monthly|manual)$",
    )

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        v = v.strip()
        if not v.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")
        return v


class WebsiteUpdate(BaseModel):
    """Request body for updating a website (all fields optional)."""

    name: str | None = None
    description: str | None = None
    is_active: bool | None = None
    scan_frequency: str | None = Field(
        default=None,
        pattern="^(hourly|daily|weekly|monthly|manual)$",
    )


class FindingCounts(BaseModel):
    """Severity-bucketed finding counts attached to website responses."""

    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    informational: int = 0


class WebsiteResponse(BaseModel):
    """Full website representation returned by the API."""

    id: UUID
    user_id: UUID
    url: str
    name: str | None = None
    description: str | None = None
    is_active: bool
    scan_frequency: str
    last_scan_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    # Aggregated data (populated by service layer)
    last_risk_score: float | None = None
    last_grade: str | None = None
    finding_counts: FindingCounts = FindingCounts()

    model_config = {"from_attributes": True}
