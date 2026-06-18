"""
app/schemas/finding.py
Pydantic v2 schemas for security findings.
"""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class FindingResponse(BaseModel):
    """Full finding representation returned by the API."""

    id: UUID
    scan_id: UUID
    website_id: UUID
    category: str
    title: str
    description: str | None = None
    severity: str
    cvss_score: float | None = None
    affected_url: str | None = None
    evidence: str | None = None
    remediation: str | None = None
    is_new: bool
    is_fixed: bool
    first_seen_at: datetime
    last_seen_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class FindingFilter(BaseModel):
    """Query-parameter filter model for listing findings."""

    website_id: UUID | None = None
    scan_id: UUID | None = None
    severity: str | None = Field(
        default=None,
        pattern="^(critical|high|medium|low|informational)$",
    )
    category: str | None = None
    is_new: bool | None = None
    is_fixed: bool | None = None
    skip: int = Field(default=0, ge=0)
    limit: int = Field(default=50, ge=1, le=200)
