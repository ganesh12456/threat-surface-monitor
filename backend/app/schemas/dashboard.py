"""
app/schemas/dashboard.py
Pydantic v2 schemas for dashboard statistics and analytics.
"""
from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel


class DashboardStats(BaseModel):
    """Top-level summary statistics for the dashboard hero section."""

    total_websites: int = 0
    active_websites: int = 0
    critical_findings: int = 0
    high_findings: int = 0
    avg_risk_score: float = 0.0
    security_grade: str = "N/A"
    active_alerts: int = 0
    recent_scans_count: int = 0  # scans in last 24 h
    websites_with_critical: int = 0
    last_updated: datetime | None = None

    # Connected Data Sources status
    connected_sources: dict[str, bool] = {
        "sola_web_checker": True,
        "wordpress_scanner": True,
        "cloudflare": True,
        "github": True
    }
    
    # Threat Surface Overview
    external_assets_count: int = 0
    repositories_count: int = 0
    cloudflare_zones_count: int = 0
    wordpress_sites_count: int = 0

    # Top Risks
    top_risks: list[str] = []


class TrendPoint(BaseModel):
    """Single data point in a time-series trend."""

    date: date
    risk_score: float
    grade: str
    critical_count: int = 0
    high_count: int = 0
    scan_count: int = 0


class TrendData(BaseModel):
    """30-day risk score trend data for charts."""

    website_id: UUID | None = None
    website_url: str | None = None
    data_points: list[TrendPoint] = []
    average_score: float = 0.0
    score_change_30d: float = 0.0  # positive = worsened, negative = improved


class WebsiteRanking(BaseModel):
    """Single website entry in the risk ranking table."""

    rank: int
    website_id: UUID
    url: str
    name: str | None = None
    risk_score: float
    grade: str
    critical_count: int = 0
    high_count: int = 0
    last_scan_at: datetime | None = None


class SeverityBreakdown(BaseModel):
    """Finding counts grouped by severity across all or one website."""

    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    informational: int = 0
    total: int = 0

    def model_post_init(self, __context) -> None:  # noqa: ANN001
        self.total = (
            self.critical
            + self.high
            + self.medium
            + self.low
            + self.informational
        )
