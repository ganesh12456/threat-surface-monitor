"""
app/tasks/background.py
Background task executor for security scans using the Supabase database service.
"""
import logging
from datetime import datetime, timezone

from app.core import supabase as db_service
from app.services.scanner.orchestrator import scan_orchestrator
from app.services.notifications import notify_critical_finding, notify_scan_complete

logger = logging.getLogger(__name__)


async def run_website_scan(
    scan_id: str,
    website_id: str,
    url: str,
) -> None:
    """
    Background task that runs the full security scan pipeline.

    Called from the POST /websites/{id}/scan endpoint via FastAPI BackgroundTasks.
    """
    logger.info("Background scan started — scan_id=%s url=%s", scan_id, url)

    try:
        # Mark scan as running
        await db_service.update_scan(
            scan_id,
            {
                "status": "running",
                "started_at": datetime.now(timezone.utc),
                "pipeline_stage": "initializing",
            }
        )

        # Notification callback for critical findings
        async def _notify(
            site_url: str,
            critical_findings: list,
            score: float,
            grade: str,
        ) -> None:
            """Async callback invoked by orchestrator on critical findings."""
            for finding in critical_findings[:5]:  # limit to top 5
                await notify_critical_finding(site_url, finding)
            await notify_scan_complete(
                website_url=site_url,
                score=score,
                grade=grade,
                finding_counts={},
            )

        # Run the full scan pipeline
        result = await scan_orchestrator.run_scan(
            website_id=website_id,
            url=url,
            scan_id=scan_id,
            notify_callback=_notify,
        )

        logger.info(
            "Background scan completed — scan_id=%s score=%.1f grade=%s findings=%d",
            scan_id,
            result.get("score", 0),
            result.get("grade", "N/A"),
            result.get("finding_count", 0),
        )

    except Exception as exc:
        logger.exception(
            "Background scan FAILED — scan_id=%s url=%s: %s",
            scan_id,
            url,
            exc,
        )
        try:
            await db_service.update_scan(
                scan_id,
                {
                    "status": "failed",
                    "pipeline_stage": "failed",
                    "error_message": str(exc)[:1000],
                    "completed_at": datetime.now(timezone.utc),
                }
            )
        except Exception as db_exc:  # noqa: BLE001
            logger.error(
                "Could not update scan status to failed for %s: %s",
                scan_id,
                db_exc,
            )

