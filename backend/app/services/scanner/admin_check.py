"""
app/services/scanner/admin_check.py
Probes common admin panel paths to detect exposed or unprotected admin interfaces.
"""
import asyncio
import logging
from typing import Any
from urllib.parse import urljoin

import aiohttp

logger = logging.getLogger(__name__)

# Paths to probe for admin exposure
ADMIN_PATHS = [
    "/wp-admin",
    "/wp-admin/",
    "/admin",
    "/admin/",
    "/administrator",
    "/administrator/",
    "/login",
    "/wp-login.php",
    "/phpmyadmin",
    "/phpmyadmin/",
    "/cpanel",
    "/.htaccess",
    "/manager/html",   # Tomcat manager
    "/adminer.php",
    "/admin.php",
    "/backend",
    "/backend/",
]


async def _probe_path(
    base_url: str,
    path: str,
    session: aiohttp.ClientSession,
    findings: list[dict[str, Any]],
    timeout: int = 10,
) -> None:
    """
    Probe a single path and append findings based on HTTP status code.

    Args:
        base_url: Root URL of the target site.
        path: Relative path to probe.
        session: Shared aiohttp session.
        findings: Mutable list to append findings to.
        timeout: Per-request timeout in seconds.
    """
    target_url = urljoin(base_url.rstrip("/") + "/", path.lstrip("/"))
    try:
        async with session.get(
            target_url,
            allow_redirects=False,  # catch 302 redirects to login pages
            timeout=aiohttp.ClientTimeout(total=timeout),
            ssl=False,
        ) as response:
            status = response.status

            if status in (200, 302, 301):
                # Accessible admin panel — critical finding
                findings.append({
                    "category": "Admin Exposure",
                    "title": f"Admin Panel Exposed: {path}",
                    "description": (
                        f"The administrative interface at '{target_url}' returned HTTP {status}, "
                        "indicating it is publicly accessible. Exposed admin panels are a prime "
                        "target for brute-force, credential stuffing, and authentication bypass attacks."
                    ),
                    "severity": "critical",
                    "affected_url": target_url,
                    "evidence": f"HTTP {status} response from {target_url}",
                    "remediation": (
                        f"Restrict access to {path} by IP allowlisting, VPN requirement, or "
                        "moving the admin interface to a non-standard URL. Ensure multi-factor "
                        "authentication is enforced on all admin accounts."
                    ),
                })

            elif status in (401, 403):
                # Authentication/authorization required — informational
                findings.append({
                    "category": "Admin Exposure",
                    "title": f"Admin Panel Protected: {path}",
                    "description": (
                        f"'{target_url}' exists but requires authentication (HTTP {status}). "
                        "While protected, the presence of this URL is confirmed and should "
                        "be monitored for brute-force attempts."
                    ),
                    "severity": "informational",
                    "affected_url": target_url,
                    "evidence": f"HTTP {status} response from {target_url}",
                    "remediation": (
                        "Ensure strong password policies and rate limiting are in place. "
                        "Consider IP restriction as an additional layer of defence."
                    ),
                })

    except asyncio.TimeoutError:
        logger.debug("Admin check — timeout for %s", target_url)
    except aiohttp.ClientConnectorError:
        logger.debug("Admin check — connection refused for %s", target_url)
    except Exception as exc:  # noqa: BLE001
        logger.debug("Admin check — error probing %s: %s", target_url, exc)


async def check_admin_exposure(
    url: str,
    session: aiohttp.ClientSession,
) -> dict[str, Any]:
    """
    Probe well-known admin panel paths and report exposed interfaces.

    Args:
        url: Base URL of the target site.
        session: Shared aiohttp ClientSession.

    Returns:
        dict with keys:
            - paths_checked: list[str]
            - exposed_paths: list[str]
            - protected_paths: list[str]
            - findings: list[dict]
    """
    findings: list[dict[str, Any]] = []

    # Probe all paths concurrently
    tasks = [
        _probe_path(url, path, session, findings)
        for path in ADMIN_PATHS
    ]
    await asyncio.gather(*tasks, return_exceptions=True)

    exposed = [
        f["affected_url"]
        for f in findings
        if f["severity"] == "critical"
    ]
    protected = [
        f["affected_url"]
        for f in findings
        if f["severity"] == "informational"
    ]

    return {
        "paths_checked": ADMIN_PATHS,
        "exposed_paths": exposed,
        "protected_paths": protected,
        "findings": findings,
    }
