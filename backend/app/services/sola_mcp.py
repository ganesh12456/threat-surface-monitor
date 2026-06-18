"""
app/services/sola_mcp.py
Sola MCP (Model Context Protocol) integration layer.

Sola MCP is a federated security intelligence MCP server. When configured with
Claude Desktop or Cursor's MCP client, it provides unified context from multiple
security data sources. This module defines the integration layer — the actual MCP
server connection is handled by the client's MCP runtime.

See backend/SETUP.md for configuration instructions.
"""
import logging
from typing import Any

import aiohttp

from app.core.config import settings

logger = logging.getLogger(__name__)


class SolaMCPService:
    """
    Sola MCP Integration Layer.

    Sola MCP is a Model Context Protocol server that acts as a federated
    intelligence layer. In this platform it represents the architecture
    layer between the scanner pipeline and AI analysis.

    When configured with a Claude/Cursor MCP client, Sola MCP provides:
        - Unified security context aggregated from multiple scanner tools
        - Enriched threat intelligence correlated across scans
        - Cross-tool finding correlation and deduplication
        - Historical trend context for anomaly detection

    In standalone mode (no MCP endpoint configured), this service returns
    structured metadata that describes what Sola MCP would contribute when
    configured, and enriches findings with locally computed context.

    See SETUP.md for MCP server configuration instructions.
    """

    def __init__(self) -> None:
        self._endpoint = settings.SOLA_MCP_ENDPOINT
        self._configured = bool(
            self._endpoint
            and settings.SOLA_MCP_CLIENT_ID
            and settings.SOLA_MCP_CLIENT_SECRET
        )

    async def get_architecture_info(self) -> dict[str, Any]:
        """
        Return Sola MCP architecture information for dashboard display.

        Returns:
            dict describing the MCP layer status and connected intelligence sources.
        """
        return {
            "name": "Sola MCP",
            "status": "configured" if self._configured else "standalone",
            "endpoint": self._endpoint or "not configured",
            "connected_sources": [
                "Sola Web Checker",
                "WordPress Scanner",
                "Cloudflare Integration",
                "Historical Scan Data",
                "Google Sheets Sync",
                "DNS Security Analyser",
                "SSL/TLS Inspector",
            ],
            "description": (
                "Federated security intelligence layer. "
                "Aggregates findings from all scanner modules and provides "
                "enriched context, cross-tool correlation, and threat intelligence."
            ),
            "capabilities": [
                "finding_enrichment",
                "cross_tool_correlation",
                "historical_trend_analysis",
                "threat_intelligence_overlay",
                "automated_triage",
            ],
        }

    async def enrich_findings(
        self,
        findings: list[dict],
        url: str,
    ) -> dict[str, Any]:
        """
        Enrich scanner findings with Sola MCP intelligence context.

        When SOLA_MCP_ENDPOINT is configured, this method forwards findings
        to the MCP server for enrichment. In standalone mode, it computes
        local enrichment metadata.

        Args:
            findings: Raw finding dicts from all scanner modules.
            url: The scanned URL for context.

        Returns:
            Enrichment result dict with metadata and enriched findings.
        """
        if self._configured:
            return await self._call_mcp_endpoint(findings, url)
        return self._local_enrichment(findings, url)

    async def _call_mcp_endpoint(
        self,
        findings: list[dict],
        url: str,
    ) -> dict[str, Any]:
        """
        Forward findings to the configured Sola MCP server endpoint.

        Args:
            findings: Scanner findings to enrich.
            url: Target URL context.

        Returns:
            Enriched findings from MCP server, or local enrichment on error.
        """
        try:
            async with aiohttp.ClientSession() as session:
                payload = {
                    "url": url,
                    "findings": findings,
                    "source": "threat-surface-monitor",
                }
                import base64

                auth_str = f"{settings.SOLA_MCP_CLIENT_ID}:{settings.SOLA_MCP_CLIENT_SECRET}"
                auth_b64 = base64.b64encode(auth_str.encode("utf-8")).decode("utf-8")

                headers = {
                    "Authorization": f"Basic {auth_b64}",
                    "X-Sola-Client-Id": settings.SOLA_MCP_CLIENT_ID,
                    "X-Sola-Client-Secret": settings.SOLA_MCP_CLIENT_SECRET,
                    "Content-Type": "application/json",
                }
                async with session.post(
                    f"{self._endpoint}/enrich",
                    json=payload,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=30),
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        logger.info(
                            "Sola MCP enrichment successful for %s (%d findings)",
                            url,
                            len(findings),
                        )
                        return data
                    else:
                        logger.warning(
                            "Sola MCP returned HTTP %d for %s — falling back to local enrichment",
                            resp.status,
                            url,
                        )
        except aiohttp.ClientConnectorError:
            logger.warning(
                "Sola MCP endpoint unreachable at %s — using local enrichment",
                self._endpoint,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Sola MCP enrichment failed: %s — using local enrichment", exc)

        return self._local_enrichment(findings, url)

    def _local_enrichment(
        self,
        findings: list[dict],
        url: str,
    ) -> dict[str, Any]:
        """
        Compute local enrichment metadata without an external MCP server.

        Provides category breakdowns, severity distribution, and basic
        deduplication that Sola MCP would otherwise supply.

        Args:
            findings: Scanner findings list.
            url: Target URL.

        Returns:
            Local enrichment dict in Sola MCP response format.
        """
        from collections import Counter

        severity_dist = Counter(f.get("severity", "informational") for f in findings)
        category_dist = Counter(f.get("category", "General") for f in findings)

        # Deduplicate by title+category
        seen: set[tuple[str, str]] = set()
        deduplicated: list[dict] = []
        for f in findings:
            key = (f.get("title", ""), f.get("category", ""))
            if key not in seen:
                seen.add(key)
                deduplicated.append(f)

        return {
            "enriched": True,
            "source": "sola_mcp_local",
            "mcp_configured": False,
            "findings_count": len(findings),
            "deduplicated_count": len(deduplicated),
            "severity_distribution": dict(severity_dist),
            "category_distribution": dict(category_dist),
            "enriched_findings": deduplicated,
            "intelligence_sources": [
                {
                    "name": "Local Scanner Pipeline",
                    "status": "active",
                    "findings_contributed": len(findings),
                }
            ],
            "note": (
                "Running in standalone mode. Configure SOLA_MCP_ENDPOINT in .env "
                "and set up the Sola MCP server for full federated intelligence."
            ),
        }


# Module-level singleton
sola_mcp_service = SolaMCPService()
