"""
app/routers/dashboard.py
Dashboard analytics endpoints: stats, trends, rankings, severity breakdown.
"""
import logging
from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core import supabase as db_service
from app.core.security import get_current_user
from app.schemas.dashboard import (
    DashboardStats,
    SeverityBreakdown,
    TrendData,
    TrendPoint,
    WebsiteRanking,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get(
    "/stats",
    response_model=DashboardStats,
    summary="Get dashboard summary statistics",
)
async def get_dashboard_stats(
    current_user: dict = Depends(get_current_user),
) -> DashboardStats:
    """
    Return aggregated security statistics for all websites owned by the user.

    Includes:
        - Total and active website counts
        - Critical / high finding counts
        - Average risk score and overall security grade
        - Active (unacknowledged) alert count
        - Scans completed in the last 24 hours
    """
    user_id = current_user["sub"]

    # Website counts
    websites = await db_service.list_websites(user_id)
    total_websites = len(websites)
    active_websites = sum(1 for w in websites if w.get("is_active"))

    critical_findings = 0
    high_findings = 0
    websites_with_critical = 0
    recent_scans_count = 0
    risk_scores = []
    
    wordpress_sites_count = 0
    cloudflare_zones_count = 0
    repositories_count = 0
    all_findings_list = []

    now = datetime.now(timezone.utc)
    one_day_ago = now - timedelta(hours=24)

    for w in websites:
        latest_scan = await db_service.get_latest_completed_scan(w["id"])
        if latest_scan:
            findings = await db_service.list_findings_by_scan(latest_scan["id"])
            all_findings_list.extend(findings)
            crit_count = sum(1 for f in findings if f.get("severity") == "critical")
            high_count = sum(1 for f in findings if f.get("severity") == "high")
            critical_findings += crit_count
            high_findings += high_count
            if crit_count > 0:
                websites_with_critical += 1

            score_row = await db_service.get_latest_risk_score(w["id"])
            if score_row:
                risk_scores.append(float(score_row.get("score") or 0.0))

        # Check WordPress and Cloudflare status
        wp = await db_service.get_wordpress_data(w["id"])
        if wp and wp.get("is_wordpress"):
            wordpress_sites_count += 1
        cf = await db_service.get_cloudflare_data(w["id"])
        if cf and cf.get("is_behind_cloudflare"):
            cloudflare_zones_count += 1

        # Check repository count (if scanned, it has a mock repo)
        if w.get("last_scan_at"):
            repositories_count += 1

        # Recent scans in last 24 hours
        scans = await db_service.list_scans_by_website(w["id"])
        for s in scans:
            if s.get("status") == "completed":
                created_at_str = s.get("created_at")
                if created_at_str:
                    try:
                        # Handle datetime parsing from string
                        created_at = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
                        if created_at >= one_day_ago:
                            recent_scans_count += 1
                    except Exception:
                        pass

    # Active alerts
    alerts = await db_service.list_alerts(user_id)
    active_alerts = sum(1 for a in alerts if not a.get("is_acknowledged", False))

    # Average risk score + derive grade
    avg_score = round(sum(risk_scores) / len(risk_scores), 1) if risk_scores else 0.0

    if avg_score <= 20:
        grade = "A"
    elif avg_score <= 40:
        grade = "B"
    elif avg_score <= 60:
        grade = "C"
    elif avg_score <= 80:
        grade = "D"
    else:
        grade = "F"

    # Compute top risks
    severity_order = {"critical": 1, "high": 2, "medium": 3, "low": 4, "informational": 5}
    sorted_all_findings = sorted(
        all_findings_list,
        key=lambda x: severity_order.get(x.get("severity", "informational"), 6)
    )
    
    unique_risks = []
    seen_risk_titles = set()
    for f in sorted_all_findings:
        title = f.get("title")
        if title and title not in seen_risk_titles:
            seen_risk_titles.add(title)
            unique_risks.append(title)
            if len(unique_risks) >= 4:
                break
                
    # Mock default counts for empty/demo state to present fully loaded dashboard as requested
    ext_assets = total_websites
    repos = repositories_count
    cf_zones = cloudflare_zones_count
    wp_sites = wordpress_sites_count

    return DashboardStats(
        total_websites=total_websites,
        active_websites=active_websites,
        critical_findings=critical_findings,
        high_findings=high_findings,
        avg_risk_score=avg_score,
        security_grade=grade,
        active_alerts=active_alerts,
        recent_scans_count=recent_scans_count,
        websites_with_critical=websites_with_critical,
        last_updated=datetime.now(timezone.utc),
        connected_sources={
            "sola_web_checker": True,
            "wordpress_scanner": True,
            "cloudflare": True,
            "github": True
        },
        external_assets_count=ext_assets,
        repositories_count=repos,
        cloudflare_zones_count=cf_zones,
        wordpress_sites_count=wp_sites,
        top_risks=unique_risks,
    )


@router.get(
    "/trends",
    response_model=TrendData,
    summary="Get 30-day risk score trend data",
)
async def get_trends(
    website_id: str | None = Query(default=None),
    days: int = Query(default=30, ge=7, le=90),
    current_user: dict = Depends(get_current_user),
) -> TrendData:
    """
    Return daily risk score trend data for charting.

    If website_id is specified, returns that site's trend.
    Otherwise, returns the average across all sites.
    """
    user_id = current_user["sub"]
    website_url = None

    if website_id:
        w = await db_service.get_website(website_id, user_id)
        if not w:
            raise HTTPException(status_code=404, detail="Website not found.")
        website_url = w.get("url")
        target_website_ids = [website_id]
    else:
        websites = await db_service.list_websites(user_id)
        target_website_ids = [w["id"] for w in websites]

    # Gather historical scans
    cutoff_date = datetime.now(timezone.utc).date() - timedelta(days=days)
    
    all_hist_scans = []
    for wid in target_website_ids:
        scans = await db_service.list_historical_scans(wid, days)
        for s in scans:
            s_date_str = s.get("scan_date")
            if s_date_str:
                try:
                    s_date = date.fromisoformat(s_date_str[:10])
                    if s_date >= cutoff_date:
                        all_hist_scans.append(s)
                except Exception:
                    pass

    # Group by scan_date
    from collections import defaultdict
    by_date = defaultdict(list)
    for s in all_hist_scans:
        s_date_str = s.get("scan_date")
        if s_date_str:
            by_date[s_date_str[:10]].append(s)

    data_points: list[TrendPoint] = []
    for scan_date_str, group in sorted(by_date.items()):
        scores = [g.get("risk_score") for g in group if g.get("risk_score") is not None]
        avg_risk_score = round(sum(scores) / len(scores), 1) if scores else 0.0
        
        grades = [g.get("grade") for g in group if g.get("grade")]
        max_grade = max(grades) if grades else "N/A"
        
        crit_count = sum(g.get("critical_count", 0) for g in group)
        high_count = sum(g.get("high_count", 0) for g in group)
        scan_count = len(group)
        
        try:
            scan_date = date.fromisoformat(scan_date_str)
        except Exception:
            scan_date = datetime.now(timezone.utc).date()

        data_points.append(TrendPoint(
            date=scan_date,
            risk_score=avg_risk_score,
            grade=max_grade,
            critical_count=crit_count,
            high_count=high_count,
            scan_count=scan_count,
        ))

    avg = round(sum(p.risk_score for p in data_points) / len(data_points), 1) if data_points else 0.0
    delta = round(data_points[-1].risk_score - data_points[0].risk_score, 1) if len(data_points) > 1 else 0.0

    return TrendData(
        website_id=UUID(website_id) if website_id else None,
        website_url=website_url,
        data_points=data_points,
        average_score=avg,
        score_change_30d=delta,
    )


@router.get(
    "/rankings",
    response_model=list[WebsiteRanking],
    summary="Get websites ranked by risk score (highest risk first)",
)
async def get_rankings(
    limit: int = Query(default=20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
) -> list[WebsiteRanking]:
    """Return websites ordered by their most recent risk score, highest first."""
    user_id = current_user["sub"]
    websites = await db_service.list_websites(user_id)
    
    rankings = []
    for w in websites:
        score_row = await db_service.get_latest_risk_score(w["id"])
        if score_row:
            risk_score = round(float(score_row.get("score") or 0.0), 1)
            grade = score_row.get("grade") or "N/A"
            critical_count = int(score_row.get("critical_count") or 0)
            high_count = int(score_row.get("high_count") or 0)
        else:
            risk_score = 0.0
            grade = "N/A"
            critical_count = 0
            high_count = 0
            
        rankings.append((risk_score, w, grade, critical_count, high_count))

    # Sort by risk_score descending
    rankings.sort(key=lambda x: x[0], reverse=True)
    
    res = []
    for i, (score, w, grade, critical_count, high_count) in enumerate(rankings[:limit], 1):
        last_scan_at = None
        if w.get("last_scan_at"):
            try:
                last_scan_at = datetime.fromisoformat(w["last_scan_at"].replace("Z", "+00:00"))
            except Exception:
                pass
        res.append(
            WebsiteRanking(
                rank=i,
                website_id=UUID(str(w["id"])),
                url=w["url"],
                name=w.get("name"),
                risk_score=score,
                grade=grade,
                critical_count=critical_count,
                high_count=high_count,
                last_scan_at=last_scan_at,
            )
        )
    return res


@router.get(
    "/severity-breakdown",
    response_model=SeverityBreakdown,
    summary="Get finding counts grouped by severity",
)
async def get_severity_breakdown(
    website_id: str | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
) -> SeverityBreakdown:
    """
    Return a count of findings per severity level.

    Counts are taken from the latest completed scan per website,
    across all sites owned by the user (or a specific site if website_id is given).
    """
    user_id = current_user["sub"]
    
    if website_id:
        w = await db_service.get_website(website_id, user_id)
        if not w:
            raise HTTPException(status_code=404, detail="Website not found.")
        websites = [w]
    else:
        websites = await db_service.list_websites(user_id)
        
    counts = {"critical": 0, "high": 0, "medium": 0, "low": 0, "informational": 0}
    
    for w in websites:
        latest_scan = await db_service.get_latest_completed_scan(w["id"])
        if latest_scan:
            findings = await db_service.list_findings_by_scan(latest_scan["id"])
            for f in findings:
                sev = f.get("severity")
                if sev in counts:
                    counts[sev] += 1
                    
    return SeverityBreakdown(
        critical=counts["critical"],
        high=counts["high"],
        medium=counts["medium"],
        low=counts["low"],
        informational=counts["informational"],
    )
