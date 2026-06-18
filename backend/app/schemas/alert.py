"""
app/schemas/alert.py
Pydantic v2 schemas for the alerts system.
"""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class AlertResponse(BaseModel):
    """Full alert representation returned by the API."""

    id: UUID
    website_id: UUID
    scan_id: UUID | None = None
    finding_id: UUID | None = None
    alert_type: str
    title: str
    message: str | None = None
    severity: str | None = None
    is_acknowledged: bool
    channels_sent: list[str] = []
    created_at: datetime

    model_config = {"from_attributes": True}


class AlertAcknowledge(BaseModel):
    """Request body for acknowledging an alert."""

    acknowledged: bool = True
    note: str | None = None  # optional operator note
