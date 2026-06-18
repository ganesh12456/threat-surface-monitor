"""
app/schemas/report.py
Pydantic v2 schemas for report generation and retrieval.
"""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ReportRequest(BaseModel):
    """Request body for generating a new report."""

    website_id: UUID
    scan_id: UUID | None = None  # if None, uses latest completed scan
    report_type: str = Field(
        default="executive",
        pattern="^(executive|technical|full)$",
    )
    format: str = Field(
        default="pdf",
        pattern="^(pdf|csv)$",
    )


class ReportResponse(BaseModel):
    """Report metadata returned after generation or in list views."""

    id: UUID
    website_id: UUID | None = None
    scan_id: UUID | None = None
    report_type: str | None = None
    format: str | None = None
    file_path: str | None = None
    generated_by: UUID | None = None
    created_at: datetime
    download_url: str | None = None  # populated by the router

    model_config = {"from_attributes": True}
