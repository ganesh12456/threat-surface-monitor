"""
app/schemas/scan.py
Pydantic v2 schemas for scan responses and pipeline status.
"""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas.finding import FindingResponse


class ScanResponse(BaseModel):
    """Summary scan representation returned in list views."""

    id: UUID
    website_id: UUID
    status: str
    pipeline_stage: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    duration_seconds: float | None = None
    error_message: str | None = None
    scan_metadata: dict = {}
    created_at: datetime

    # Aggregated risk info
    risk_score: float | None = None
    grade: str | None = None
    critical_count: int = 0
    high_count: int = 0
    medium_count: int = 0
    low_count: int = 0
    info_count: int = 0

    model_config = {"from_attributes": True}


class ScanDetail(ScanResponse):
    """Detailed scan with embedded findings list."""

    findings: list[FindingResponse] = []
    executive_summary: str | None = None
    technical_summary: str | None = None
    top_risks: list[dict] = []
    business_impact: str | None = None
    remediation_steps: list[dict] = []
    sola_analysis: dict = {}


class PipelineStatus(BaseModel):
    """Real-time pipeline progress returned by /scans/{id}/pipeline."""

    scan_id: UUID
    status: str
    pipeline_stage: str | None = None
    stages_completed: list[str] = []
    stages_remaining: list[str] = []
    progress_percent: int = 0
    started_at: datetime | None = None
    estimated_completion_seconds: int | None = None


PIPELINE_STAGES = [
    "initializing",
    "scanning_headers",
    "scanning_ssl",
    "scanning_admin",
    "scanning_wordpress",
    "scanning_cloudflare",
    "scanning_dns",
    "scanning_exposure",
    "analyzing",
    "storing",
    "completed",
]
