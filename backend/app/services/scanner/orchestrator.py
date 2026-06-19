"""
app/services/scanner/orchestrator.py
Central scan pipeline coordinator — runs all scanner modules concurrently,
aggregates findings, scores risk, persists to DB, and triggers notifications.
"""
import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Awaitable

import aiohttp
from app.core import supabase as db_service
from app.core.config import settings
from app.services.scanner.headers_check import check_security_headers
from app.services.scanner.ssl_check import check_ssl
from app.services.scanner.admin_check import check_admin_exposure
from app.services.scanner.wordpress_check import check_wordpress
from app.services.scanner.cloudflare_check import check_cloudflare
from app.services.scanner.dns_check import check_dns
from app.services.scanner.exposure_check import check_exposure
from app.services.scanner.github_check import check_github
from app.services.ai_analysis import (
    calculate_risk_score,
    generate_full_analysis,
)
from app.services.sola_mcp import sola_mcp_service

logger = logging.getLogger(__name__)

# Ordered pipeline stages
PIPELINE_STAGES = [
    "initializing",
    "scanning_headers",
    "scanning_ssl",
    "scanning_admin",
    "scanning_wordpress",
    "scanning_cloudflare",
    "scanning_dns",
    "scanning_exposure",
    "scanning_github",
    "analyzing",
    "storing",
    "completed",
]


async def _update_scan_stage(
    scan_id: str,
    stage: str,
) -> None:
    """Update the pipeline_stage column for the given scan."""
    try:
        await db_service.update_scan(scan_id, {"pipeline_stage": stage})
        logger.info("Scan %s — stage: %s", scan_id, stage)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not update pipeline stage for scan %s: %s", scan_id, exc)


async def _store_findings(
    findings: list[dict],
    scan_id: str,
    website_id: str,
) -> list[str]:
    """
    Persist findings to the database and return their generated IDs.
    """
    finding_ids: list[str] = []
    now = datetime.now(timezone.utc)
    findings_to_insert = []

    for f in findings:
        finding_id = str(uuid.uuid4())
        findings_to_insert.append({
            "id": finding_id,
            "scan_id": scan_id,
            "website_id": website_id,
            "category": f.get("category", "General"),
            "title": f.get("title", "Untitled Finding")[:500],
            "description": f.get("description"),
            "severity": f.get("severity", "informational"),
            "cvss_score": f.get("cvss_score"),
            "affected_url": f.get("affected_url"),
            "evidence": f.get("evidence"),
            "remediation": f.get("remediation"),
            "is_new": True,
            "is_fixed": False,
            "first_seen_at": now.isoformat(),
            "last_seen_at": now.isoformat(),
            "created_at": now.isoformat(),
        })
        finding_ids.append(finding_id)

    if findings_to_insert:
        try:
            await db_service.create_findings(findings_to_insert)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to insert findings: %s", exc)

    return finding_ids


async def _store_risk_score(
    scan_id: str,
    website_id: str,
    score: float,
    grade: str,
    findings: list[dict],
    previous_score: float | None,
) -> None:
    """Persist the calculated risk score record."""
    from collections import Counter
    counts = Counter(f.get("severity", "informational") for f in findings)
    delta = round(score - previous_score, 2) if previous_score is not None else None

    try:
        await db_service.create_risk_score({
            "id": str(uuid.uuid4()),
            "scan_id": scan_id,
            "website_id": website_id,
            "score": score,
            "grade": grade,
            "critical_count": counts.get("critical", 0),
            "high_count": counts.get("high", 0),
            "medium_count": counts.get("medium", 0),
            "low_count": counts.get("low", 0),
            "info_count": counts.get("informational", 0),
            "previous_score": previous_score,
            "score_delta": delta,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to store risk score for scan %s: %s", scan_id, exc)


async def _store_recommendations(
    scan_id: str,
    website_id: str,
    analysis: dict,
    sola_result: dict,
) -> None:
    """Persist AI analysis recommendations."""
    try:
        await db_service.create_recommendations({
            "id": str(uuid.uuid4()),
            "scan_id": scan_id,
            "website_id": website_id,
            "executive_summary": analysis.get("executive_summary"),
            "technical_summary": analysis.get("technical_summary"),
            "top_risks": analysis.get("top_risks", []),
            "business_impact": analysis.get("business_impact"),
            "remediation_steps": analysis.get("remediation_steps", []),
            "sola_analysis": sola_result,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to store recommendations for scan %s: %s", scan_id, exc)


async def _store_wordpress_data(
    scan_id: str,
    website_id: str,
    wp_result: dict,
) -> None:
    """Persist WordPress scan data."""
    try:
        await db_service.create_wordpress_data({
            "id": str(uuid.uuid4()),
            "scan_id": scan_id,
            "website_id": website_id,
            "is_wordpress": wp_result.get("is_wordpress", False),
            "version": wp_result.get("version"),
            "version_outdated": wp_result.get("version_outdated", False),
            "plugins": wp_result.get("plugins", []),
            "themes": wp_result.get("themes", []),
            "vulnerabilities": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to store WordPress data for scan %s: %s", scan_id, exc)


async def _store_cloudflare_data(
    scan_id: str,
    website_id: str,
    cf_result: dict,
) -> None:
    """Persist Cloudflare scan data."""
    try:
        await db_service.create_cloudflare_data({
            "id": str(uuid.uuid4()),
            "scan_id": scan_id,
            "website_id": website_id,
            "is_behind_cloudflare": cf_result.get("is_behind_cloudflare", False),
            "waf_enabled": cf_result.get("waf_enabled"),
            "ssl_mode": cf_result.get("ssl_mode"),
            "cf_ray_header": cf_result.get("cf_ray"),
            "dns_records": [],
            "security_headers": {},
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to store Cloudflare data for scan %s: %s", scan_id, exc)


async def _get_previous_findings(
    website_id: str,
) -> list[dict]:
    """Retrieve findings from the most recent completed scan for change detection."""
    try:
        scan = await db_service.get_latest_completed_scan(website_id)
        if not scan:
            return []
        findings = await db_service.list_findings_by_scan(scan["id"])
        return [{"title": f.get("title"), "category": f.get("category"), "severity": f.get("severity")} for f in findings]
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not fetch previous findings for %s: %s", website_id, exc)
        return []


async def _get_previous_score(
    website_id: str,
) -> float | None:
    """Retrieve the most recent risk score for the website."""
    try:
        score_rec = await db_service.get_latest_risk_score(website_id)
        return float(score_rec["score"]) if score_rec else None
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not fetch previous score for %s: %s", website_id, exc)
        return None


class ScanOrchestrator:
    """
    Central coordinator for the multi-module security scan pipeline.

    Runs all scanner modules concurrently where safe, aggregates findings,
    performs AI analysis, persists results to the database, and sends
    notifications for critical findings.
    """

    async def run_scan(
        self,
        website_id: str,
        url: str,
        scan_id: str,
        notify_callback: Callable[..., Awaitable[None]] | None = None,
    ) -> dict[str, Any]:
        """
        Execute the full 11-stage security scan pipeline.
        """
        started_at = datetime.now(timezone.utc)
        all_findings: list[dict[str, Any]] = []

        try:
            # ------------------------------------------------------------------
            # Stage 1 — Initializing
            # ------------------------------------------------------------------
            await _update_scan_stage(scan_id, "initializing")

            connector = aiohttp.TCPConnector(limit=20, ssl=False)
            timeout = aiohttp.ClientTimeout(total=settings.SCAN_TIMEOUT)

            headers_result: dict = {}
            ssl_result: dict = {}
            admin_result: dict = {}
            wp_result: dict = {}
            cf_result: dict = {}
            dns_result: dict = {}
            exposure_result: dict = {}
            github_result: dict = {}

            async with aiohttp.ClientSession(
                connector=connector,
                timeout=timeout,
                headers={"User-Agent": "ThreatSurfaceMonitor/1.0 Security Scanner"},
            ) as session:
                # ------------------------------------------------------------------
                # Stages 2–8 — Concurrent scanning
                # We update stages sequentially but run probes concurrently.
                # ------------------------------------------------------------------
                await _update_scan_stage(scan_id, "scanning_headers")

                # Run all scan modules concurrently (except SSL which uses a thread)
                (
                    headers_result,
                    ssl_result,
                    admin_result,
                    wp_result,
                    cf_result,
                    dns_result,
                    exposure_result,
                    github_result,
                ) = await asyncio.gather(
                    _safe_run(check_security_headers(url, session), "headers"),
                    _safe_run(check_ssl(url), "ssl"),
                    _safe_run(check_admin_exposure(url, session), "admin"),
                    _safe_run(check_wordpress(url, session), "wordpress"),
                    _safe_run(check_cloudflare(url, session), "cloudflare"),
                    _safe_run(check_dns(url), "dns"),
                    _safe_run(check_exposure(url, session), "exposure"),
                    _safe_run(check_github(url, session), "github"),
                )

            # Update stages for observability
            for stage in [
                "scanning_ssl", "scanning_admin", "scanning_wordpress",
                "scanning_cloudflare", "scanning_dns", "scanning_exposure",
                "scanning_github",
            ]:
                await _update_scan_stage(scan_id, stage)

            # Aggregate all findings
            for result in [
                headers_result, ssl_result, admin_result,
                wp_result, cf_result, dns_result, exposure_result, github_result,
            ]:
                if isinstance(result, dict):
                    all_findings.extend(result.get("findings", []))

            # ------------------------------------------------------------------
            # Stage 9 — AI Analysis
            # ------------------------------------------------------------------
            await _update_scan_stage(scan_id, "analyzing")

            previous_findings = await _get_previous_findings(website_id)
            previous_score = await _get_previous_score(website_id)
            score, grade = calculate_risk_score(all_findings)

            analysis = generate_full_analysis(
                url=url,
                findings=all_findings,
                previous_findings=previous_findings,
                score=score,
                grade=grade,
            )

            # Sola MCP enrichment
            sola_result = await sola_mcp_service.enrich_findings(all_findings, url)

            # ------------------------------------------------------------------
            # Stage 10 — Storing
            # ------------------------------------------------------------------
            await _update_scan_stage(scan_id, "storing")

            finding_ids = await _store_findings(all_findings, scan_id, website_id)
            await _store_risk_score(
                scan_id, website_id, score, grade, all_findings, previous_score
            )
            await _store_recommendations(scan_id, website_id, analysis, sola_result)

            if isinstance(wp_result, dict):
                await _store_wordpress_data(scan_id, website_id, wp_result)
            if isinstance(cf_result, dict):
                await _store_cloudflare_data(scan_id, website_id, cf_result)

            # Update historical record
            await _upsert_historical_scan(scan_id, website_id, score, grade, all_findings)

            # Update website last_scan_at
            await db_service.update_website(website_id, {"last_scan_at": datetime.now(timezone.utc)})

            # ------------------------------------------------------------------
            # Notifications
            # ------------------------------------------------------------------
            critical_findings = [
                f for f in all_findings if f.get("severity") == "critical"
            ]
            if critical_findings and notify_callback:
                await notify_callback(url, critical_findings, score, grade)

            # Google Sheets sync (fire-and-forget)
            asyncio.create_task(
                _sync_to_sheets(
                    scan_id, website_id, url, score, grade, all_findings
                )
            )

            # ------------------------------------------------------------------
            # Stage 11 — Completed
            # ------------------------------------------------------------------
            completed_at = datetime.now(timezone.utc)
            duration = (completed_at - started_at).total_seconds()

            # Save GitHub repo info in metadata
            scan_meta = {
                "github": {
                    "repo_name": github_result.get("repo_name"),
                    "repo_url": github_result.get("repo_url"),
                    "metadata": github_result.get("metadata", {}),
                }
            }

            await db_service.update_scan(
                scan_id,
                {
                    "status": "completed",
                    "pipeline_stage": "completed",
                    "completed_at": completed_at,
                    "duration_seconds": duration,
                    "scan_metadata": scan_meta,
                }
            )
            await _update_scan_stage(scan_id, "completed")

            logger.info(
                "Scan %s completed — %s | score: %.1f (%s) | %d findings | %.1fs",
                scan_id, url, score, grade, len(all_findings), duration,
            )

            return {
                "scan_id": scan_id,
                "website_id": website_id,
                "url": url,
                "status": "completed",
                "score": score,
                "grade": grade,
                "duration_seconds": duration,
                "findings": all_findings,
                "finding_count": len(all_findings),
                "finding_ids": finding_ids,
                "analysis": analysis,
                "sola_enrichment": sola_result,
                "scanner_results": {
                    "headers": headers_result,
                    "ssl": ssl_result,
                    "admin": admin_result,
                    "wordpress": wp_result,
                    "cloudflare": cf_result,
                    "dns": dns_result,
                    "exposure": exposure_result,
                },
            }

        except Exception as exc:
            logger.exception("Scan %s failed for %s: %s", scan_id, url, exc)
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
            except Exception:  # noqa: BLE001
                pass
            raise


async def _safe_run(coro: Any, label: str) -> dict:
    """
    Run a scanner coroutine safely, returning an empty dict on failure.
    """
    try:
        return await coro
    except Exception as exc:  # noqa: BLE001
        logger.warning("Scanner '%s' failed: %s", label, exc)
        return {"findings": []}


async def _upsert_historical_scan(
    scan_id: str,
    website_id: str,
    score: float,
    grade: str,
    findings: list[dict],
) -> None:
    """Insert or update the daily historical scan record."""
    from collections import Counter
    counts = Counter(f.get("severity", "informational") for f in findings)
    today = datetime.now(timezone.utc).date()

    try:
        await db_service.create_historical_scan({
            "id": str(uuid.uuid4()),
            "website_id": website_id,
            "scan_date": today.isoformat(),
            "risk_score": score,
            "grade": grade,
            "critical_count": counts.get("critical", 0),
            "high_count": counts.get("high", 0),
            "medium_count": counts.get("medium", 0),
            "low_count": counts.get("low", 0),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not upsert historical scan: %s", exc)


async def _sync_to_sheets(
    scan_id: str,
    website_id: str,
    url: str,
    score: float,
    grade: str,
    findings: list[dict],
) -> None:
    """Fire-and-forget Google Sheets sync task."""
    try:
        from app.services.google_sheets import GoogleSheetsService
        gs = GoogleSheetsService()
        await gs.sync_scan_results({
            "scan_id": scan_id,
            "website_id": website_id,
            "url": url,
            "score": score,
            "grade": grade,
            "findings": findings,
        })
    except Exception as exc:  # noqa: BLE001
        logger.debug("Google Sheets sync skipped: %s", exc)


# Module-level singleton
scan_orchestrator = ScanOrchestrator()
