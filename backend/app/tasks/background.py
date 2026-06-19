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

        # ----------------------------------------------------------------------
        # Auto-create database alerts for critical and high findings
        # ----------------------------------------------------------------------
        try:
            import uuid
            raw_findings = await db_service.list_findings_by_scan(scan_id)
            for f in raw_findings:
                severity = f.get("severity", "informational")
                if severity in ("critical", "high"):
                    alert_id = str(uuid.uuid4())
                    await db_service.create_alert({
                        "id": alert_id,
                        "website_id": website_id,
                        "scan_id": scan_id,
                        "finding_id": f["id"],
                        "alert_type": f"{severity}_vulnerability",
                        "title": f"New {severity} vulnerability: {f.get('title')}",
                        "message": f"A {severity} severity vulnerability was detected on {url}. Category: {f.get('category')}. Description: {f.get('description')}",
                        "severity": severity,
                        "is_acknowledged": False,
                        "channels_sent": ["system"],
                        "created_at": datetime.now(timezone.utc),
                    })
                    logger.info("Created DB alert %s for finding %s", alert_id, f["id"])
        except Exception as alert_exc:
            logger.exception("Failed to create DB alerts for scan %s: %s", scan_id, alert_exc)

        # ----------------------------------------------------------------------
        # Auto-generate executive PDF report
        # ----------------------------------------------------------------------
        try:
            import os
            import uuid
            from app.services.report_generator import generate_pdf_report
            
            # Get website to retrieve user_id
            website = await db_service.get_website_by_id(website_id)
            if website:
                user_id = website["user_id"]
                
                # Fetch findings
                raw_findings = await db_service.list_findings_by_scan(scan_id)
                findings = [
                    {
                        "category": f["category"],
                        "title": f["title"],
                        "description": f.get("description"),
                        "severity": f.get("severity"),
                        "affected_url": f.get("affected_url"),
                        "evidence": f.get("evidence"),
                        "remediation": f.get("remediation"),
                        "cvss_score": f.get("cvss_score"),
                        "is_new": f.get("is_new", True),
                        "is_fixed": f.get("is_fixed", False),
                    }
                    for f in raw_findings
                ]

                # Fetch risk score and AI analysis
                score_rec = await db_service.get_risk_score_by_scan(scan_id)
                rec_rec = await db_service.get_recommendation_by_scan(scan_id)
                if not rec_rec:
                    rec_rec = {}

                analysis = {
                    "executive_summary": rec_rec.get("executive_summary"),
                    "technical_summary": rec_rec.get("technical_summary"),
                    "top_risks": rec_rec.get("top_risks", []),
                    "business_impact": rec_rec.get("business_impact"),
                    "remediation_steps": rec_rec.get("remediation_steps", []),
                }

                scan_result = {
                    "scan_id": scan_id,
                    "url": url,
                    "score": float(score_rec["score"]) if score_rec else 0.0,
                    "grade": score_rec["grade"] if score_rec else "N/A",
                    "findings": findings,
                    "analysis": analysis,
                }

                reports_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "reports"))
                os.makedirs(reports_dir, exist_ok=True)
                
                report_id = str(uuid.uuid4())
                timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
                filename = f"report_{timestamp}_{report_id[:8]}.pdf"
                file_path = os.path.join(reports_dir, filename)

                content = generate_pdf_report(scan_result, "executive")
                with open(file_path, "wb") as f:
                    f.write(content)

                # Store report metadata
                db_report_id = str(uuid.uuid4())
                await db_service.create_report({
                    "id": db_report_id,
                    "website_id": website_id,
                    "scan_id": scan_id,
                    "report_type": "executive",
                    "format": "pdf",
                    "file_path": file_path,
                    "generated_by": user_id,
                    "created_at": datetime.now(timezone.utc),
                })
                logger.info("Auto-generated report %s for scan %s", db_report_id, scan_id)
        except Exception as report_exc:
            logger.exception("Failed to auto-generate report for scan %s: %s", scan_id, report_exc)

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

