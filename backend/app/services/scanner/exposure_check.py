"""
app/services/scanner/exposure_check.py
Detects publicly accessible sensitive files: .git, .env, backups, debug logs, etc.
"""
import asyncio
import logging
from typing import Any
from urllib.parse import urljoin

import aiohttp

logger = logging.getLogger(__name__)

# (path, description_fragment, severity)
SENSITIVE_PATHS: list[tuple[str, str, str]] = [
    ("/.git/HEAD",         "Git repository HEAD file",              "critical"),
    ("/.git/config",       "Git repository config file",            "critical"),
    ("/.git/COMMIT_EDITMSG","Git commit message file",              "critical"),
    ("/.env",              "Environment variables file",            "critical"),
    ("/.env.production",   "Production environment file",           "critical"),
    ("/.env.local",        "Local environment variables file",      "critical"),
    ("/backup.sql",        "SQL database backup",                   "critical"),
    ("/database.sql",      "SQL database dump",                     "critical"),
    ("/dump.sql",          "SQL database dump",                     "critical"),
    ("/backup.zip",        "Site backup archive",                   "critical"),
    ("/backup.tar.gz",     "Site backup archive",                   "critical"),
    ("/wp-config.php.bak", "WordPress config backup",               "critical"),
    ("/config.php.bak",    "PHP config backup",                     "critical"),
    ("/config.bak",        "Application config backup",             "critical"),
    ("/debug.log",         "Application debug log",                 "high"),
    ("/error.log",         "Web server error log",                  "high"),
    ("/phpinfo.php",       "PHP info disclosure page",              "high"),
    ("/info.php",          "PHP info disclosure page",              "high"),
    ("/test.php",          "PHP test file",                         "medium"),
    ("/robots.txt",        "Robots.txt (check for sensitive paths)", "informational"),
    ("/sitemap.xml",       "Sitemap file",                          "informational"),
    ("/.DS_Store",         "macOS .DS_Store directory metadata",    "medium"),
    ("/Thumbs.db",         "Windows Thumbs.db file",                "medium"),
    ("/web.config.bak",    "IIS web.config backup",                 "critical"),
]

SEVERITY_FINDING_TEMPLATE = {
    "critical": (
        "A critically sensitive file is publicly accessible at {url}. "
        "{description} exposure can lead to credential theft, database compromise, "
        "or full application takeover."
    ),
    "high": (
        "A sensitive file is accessible at {url}. "
        "{description} exposure provides attackers with valuable intelligence "
        "about the application stack, configuration, or error details."
    ),
    "medium": (
        "A potentially sensitive file was found at {url}. "
        "{description} may assist attackers in reconnaissance."
    ),
    "informational": (
        "File found at {url}: {description}. "
        "Review the content for unintentionally disclosed sensitive paths or information."
    ),
}

REMEDIATION_MAP: dict[str, str] = {
    "critical": (
        "Immediately remove or restrict access to this file via your web server configuration. "
        "For Apache: deny access using .htaccess. For Nginx: add 'location ~ \\.env { deny all; }'. "
        "Rotate any credentials that may have been exposed and audit access logs for prior access."
    ),
    "high": (
        "Remove this file from the web root or restrict access via web server configuration. "
        "Review and rotate any sensitive information that may have been disclosed."
    ),
    "medium": (
        "Remove or relocate this file outside the web root. "
        "If the file is required, restrict access using IP allowlisting or authentication."
    ),
    "informational": (
        "Review the file contents and ensure no sensitive internal paths or data are disclosed."
    ),
}


async def _probe_path(
    base_url: str,
    path: str,
    description: str,
    severity: str,
    session: aiohttp.ClientSession,
    findings: list[dict[str, Any]],
) -> None:
    """Check a single path and append a finding if it returns HTTP 200."""
    target_url = urljoin(base_url.rstrip("/") + "/", path.lstrip("/"))
    try:
        async with session.get(
            target_url,
            allow_redirects=False,
            timeout=aiohttp.ClientTimeout(total=8),
            ssl=False,
        ) as response:
            if response.status == 200:
                content_preview = ""
                try:
                    body = await response.read()
                    # Only sample first 200 bytes as evidence
                    content_preview = body[:200].decode("utf-8", errors="replace").strip()
                except Exception:  # noqa: BLE001
                    pass

                # Special handling for robots.txt — parse for disallowed paths
                if path == "/robots.txt":
                    _handle_robots_txt(content_preview, target_url, findings)
                    return

                finding_description = SEVERITY_FINDING_TEMPLATE.get(severity, "").format(
                    url=target_url,
                    description=description,
                )

                findings.append({
                    "category": "Sensitive File Exposure",
                    "title": f"Exposed Sensitive File: {path}",
                    "description": finding_description,
                    "severity": severity,
                    "affected_url": target_url,
                    "evidence": (
                        f"HTTP 200 response from {target_url}. "
                        f"Content preview: {content_preview[:150]!r}"
                        if content_preview
                        else f"HTTP 200 response from {target_url}."
                    ),
                    "remediation": REMEDIATION_MAP.get(severity, "Remove or restrict this file."),
                })

    except asyncio.TimeoutError:
        logger.debug("Exposure check — timeout for %s", target_url)
    except aiohttp.ClientConnectorError:
        pass
    except Exception as exc:  # noqa: BLE001
        logger.debug("Exposure check — error probing %s: %s", target_url, exc)


def _handle_robots_txt(
    content: str,
    url: str,
    findings: list[dict[str, Any]],
) -> None:
    """
    Parse robots.txt for Disallow entries that reveal sensitive paths.
    Adds a finding listing potentially interesting paths.
    """
    disallowed: list[str] = []
    for line in content.splitlines():
        line = line.strip()
        if line.lower().startswith("disallow:"):
            path = line.split(":", 1)[1].strip()
            if path and path != "/":
                disallowed.append(path)

    sensitive_keywords = [
        "admin", "backup", "config", "secret", "private",
        "internal", "staging", "api", "database", "db",
    ]
    interesting = [
        p for p in disallowed
        if any(kw in p.lower() for kw in sensitive_keywords)
    ]

    if interesting:
        findings.append({
            "category": "Sensitive File Exposure",
            "title": "robots.txt Discloses Sensitive Paths",
            "description": (
                f"The robots.txt file at {url} contains Disallow entries that may reveal "
                "sensitive internal paths. While robots.txt is intended to guide web crawlers, "
                "it also serves as a roadmap for attackers."
            ),
            "severity": "low",
            "affected_url": url,
            "evidence": f"Interesting Disallow paths: {', '.join(interesting[:10])}",
            "remediation": (
                "Review your robots.txt file. Avoid listing sensitive directories in Disallow; "
                "instead, protect them with proper authentication. Remember: robots.txt is "
                "public and security-by-obscurity offers no real protection."
            ),
        })
    else:
        # robots.txt exists but no sensitive paths — informational
        findings.append({
            "category": "Sensitive File Exposure",
            "title": "robots.txt Found",
            "description": f"robots.txt found at {url}. No obviously sensitive paths detected.",
            "severity": "informational",
            "affected_url": url,
            "evidence": f"robots.txt HTTP 200, {len(disallowed)} Disallow entries.",
            "remediation": "No action required. Continue to review robots.txt after site changes.",
        })


async def check_exposure(
    url: str,
    session: aiohttp.ClientSession,
) -> dict[str, Any]:
    """
    Probe for publicly accessible sensitive files and directories.

    Args:
        url: Base URL of the target site.
        session: Shared aiohttp ClientSession.

    Returns:
        dict with keys:
            - paths_checked: int
            - exposed_files: list[str]
            - findings: list[dict]
    """
    findings: list[dict[str, Any]] = []

    tasks = [
        _probe_path(url, path, description, severity, session, findings)
        for path, description, severity in SENSITIVE_PATHS
    ]
    await asyncio.gather(*tasks, return_exceptions=True)

    exposed_files = [
        f["affected_url"]
        for f in findings
        if f["severity"] in ("critical", "high", "medium")
    ]

    return {
        "paths_checked": len(SENSITIVE_PATHS),
        "exposed_files": exposed_files,
        "findings": findings,
    }
