"""
app/services/scanner/headers_check.py
Checks HTTP response headers for security best practices.
"""
import logging
from typing import Any

import aiohttp

logger = logging.getLogger(__name__)

# Headers we actively audit
SECURITY_HEADERS = [
    "Content-Security-Policy",
    "Strict-Transport-Security",
    "X-Frame-Options",
    "X-Content-Type-Options",
    "Referrer-Policy",
    "Permissions-Policy",
    "X-XSS-Protection",
]

# Mapping: header -> (severity, remediation)
HEADER_FINDINGS_MAP: dict[str, dict[str, str]] = {
    "Content-Security-Policy": {
        "severity": "high",
        "description": (
            "Content-Security-Policy (CSP) header is missing. CSP is a powerful "
            "mitigation layer against Cross-Site Scripting (XSS) and data injection "
            "attacks by restricting which resources the browser is allowed to load."
        ),
        "remediation": (
            "Add a Content-Security-Policy header to all HTTP responses. Start with "
            "a restrictive policy such as: "
            "\"Content-Security-Policy: default-src 'self'; script-src 'self'\" "
            "and progressively expand as needed. Use report-uri or report-to for "
            "monitoring policy violations before enforcing."
        ),
    },
    "Strict-Transport-Security": {
        "severity": "high",
        "description": (
            "HTTP Strict-Transport-Security (HSTS) header is missing. Without HSTS, "
            "browsers may accept plain HTTP connections, leaving users vulnerable to "
            "SSL stripping and man-in-the-middle attacks."
        ),
        "remediation": (
            "Add: \"Strict-Transport-Security: max-age=31536000; includeSubDomains; preload\" "
            "Ensure your site and all subdomains are HTTPS-only before enabling preload. "
            "Submit to the HSTS preload list at https://hstspreload.org."
        ),
    },
    "X-Frame-Options": {
        "severity": "medium",
        "description": (
            "X-Frame-Options header is missing. This makes the site vulnerable to "
            "clickjacking attacks where an attacker embeds your page in an iframe "
            "to trick users into performing unintended actions."
        ),
        "remediation": (
            "Add: \"X-Frame-Options: DENY\" or \"X-Frame-Options: SAMEORIGIN\". "
            "Alternatively, use the frame-ancestors CSP directive for more granular control: "
            "\"Content-Security-Policy: frame-ancestors 'none'\"."
        ),
    },
    "X-Content-Type-Options": {
        "severity": "medium",
        "description": (
            "X-Content-Type-Options header is missing. Without this header, browsers "
            "may perform MIME-type sniffing, potentially executing malicious content "
            "uploaded as a different file type."
        ),
        "remediation": (
            "Add: \"X-Content-Type-Options: nosniff\" to all HTTP responses. "
            "This is a one-line change in your web server or application framework configuration."
        ),
    },
    "Referrer-Policy": {
        "severity": "low",
        "description": (
            "Referrer-Policy header is missing. The browser default behaviour may "
            "leak sensitive URL parameters or internal path information in the "
            "Referer header to third-party sites."
        ),
        "remediation": (
            "Add: \"Referrer-Policy: strict-origin-when-cross-origin\" or "
            "\"Referrer-Policy: no-referrer\" for maximum privacy. "
            "Choose a policy that balances analytics needs with privacy requirements."
        ),
    },
    "Permissions-Policy": {
        "severity": "low",
        "description": (
            "Permissions-Policy (formerly Feature-Policy) header is missing. "
            "Without this, browser features such as geolocation, camera, and "
            "microphone may be accessible to embedded third-party scripts."
        ),
        "remediation": (
            "Add a Permissions-Policy header restricting unused browser features: "
            "\"Permissions-Policy: geolocation=(), camera=(), microphone=(), "
            "payment=(), usb=()\" — adjust based on features your application actually uses."
        ),
    },
}


async def check_security_headers(
    url: str,
    session: aiohttp.ClientSession,
) -> dict[str, Any]:
    """
    Fetch the target URL and audit its HTTP response headers for security best practices.

    Args:
        url: Full URL to check (e.g. https://example.com).
        session: Shared aiohttp ClientSession.

    Returns:
        dict with keys:
            - headers_found: dict[str, str] — present security headers and their values
            - missing_headers: list[str] — headers absent from the response
            - findings: list[dict] — structured finding dicts for each issue detected
    """
    headers_found: dict[str, str] = {}
    missing_headers: list[str] = []
    findings: list[dict[str, Any]] = []

    try:
        async with session.get(
            url,
            allow_redirects=True,
            timeout=aiohttp.ClientTimeout(total=15),
            ssl=False,
        ) as response:
            resp_headers = dict(response.headers)

            # Normalise header names to title-case for consistent lookup
            normalised: dict[str, str] = {
                k.title(): v for k, v in resp_headers.items()
            }

            for header in SECURITY_HEADERS:
                header_title = header.title()
                value = normalised.get(header_title)

                if value:
                    headers_found[header] = value
                    # Additional value validation
                    _validate_header_value(header, value, findings, url)
                else:
                    if header != "X-XSS-Protection":  # informational only
                        missing_headers.append(header)
                        _build_missing_finding(header, findings, url)

            # X-XSS-Protection presence is informational
            xss_val = normalised.get("X-Xss-Protection")
            if xss_val:
                headers_found["X-XSS-Protection"] = xss_val
                if xss_val.startswith("0"):
                    findings.append({
                        "category": "Security Headers",
                        "title": "X-XSS-Protection Disabled",
                        "description": (
                            "The X-XSS-Protection header is set to 0 (disabled). "
                            "Although modern browsers rely on CSP, some legacy browsers "
                            "benefit from this header being enabled."
                        ),
                        "severity": "informational",
                        "affected_url": url,
                        "remediation": "Consider setting X-XSS-Protection: 1; mode=block.",
                    })

    except aiohttp.ClientConnectorError as exc:
        logger.warning("Header check — connection failed for %s: %s", url, exc)
        findings.append({
            "category": "Connectivity",
            "title": "Host Unreachable During Header Scan",
            "description": f"Could not connect to {url} to retrieve HTTP headers: {exc}",
            "severity": "informational",
            "affected_url": url,
            "remediation": "Verify the target URL is accessible from the scanner.",
        })
    except Exception as exc:  # noqa: BLE001
        logger.exception("Header check — unexpected error for %s: %s", url, exc)

    return {
        "headers_found": headers_found,
        "missing_headers": missing_headers,
        "findings": findings,
    }


def _build_missing_finding(
    header: str,
    findings: list[dict[str, Any]],
    url: str,
) -> None:
    """Append a structured finding for a missing security header."""
    meta = HEADER_FINDINGS_MAP.get(header, {})
    findings.append({
        "category": "Security Headers",
        "title": f"Missing Security Header: {header}",
        "description": meta.get(
            "description",
            f"The {header} header was not found in the HTTP response.",
        ),
        "severity": meta.get("severity", "low"),
        "affected_url": url,
        "remediation": meta.get("remediation", f"Add the {header} header to all responses."),
        "evidence": f"Header '{header}' absent from response.",
    })


def _validate_header_value(
    header: str,
    value: str,
    findings: list[dict[str, Any]],
    url: str,
) -> None:
    """Perform value-level validation for headers that are present."""
    if header == "Strict-Transport-Security":
        directives = [d.strip().lower() for d in value.split(";")]
        max_age = 0
        for d in directives:
            if d.startswith("max-age="):
                try:
                    max_age = int(d.split("=")[1])
                except ValueError:
                    pass
        if max_age < 31536000:
            findings.append({
                "category": "Security Headers",
                "title": "HSTS max-age Too Short",
                "description": (
                    f"Strict-Transport-Security max-age is {max_age} seconds "
                    f"(value: '{value}'). OWASP recommends at least 31536000 (1 year)."
                ),
                "severity": "medium",
                "affected_url": url,
                "evidence": f"Strict-Transport-Security: {value}",
                "remediation": "Set max-age to at least 31536000 and add includeSubDomains.",
            })
        if "includesubdomains" not in directives:
            findings.append({
                "category": "Security Headers",
                "title": "HSTS Missing includeSubDomains",
                "description": (
                    "The Strict-Transport-Security header does not include "
                    "'includeSubDomains', leaving subdomains unprotected."
                ),
                "severity": "low",
                "affected_url": url,
                "evidence": f"Strict-Transport-Security: {value}",
                "remediation": "Add 'includeSubDomains' to your HSTS header.",
            })

    elif header == "X-Frame-Options":
        allowed = {"deny", "sameorigin"}
        if value.strip().lower() not in allowed:
            findings.append({
                "category": "Security Headers",
                "title": "X-Frame-Options Has Non-Standard Value",
                "description": (
                    f"X-Frame-Options is set to '{value}', which is not a recognised value. "
                    "Valid values are DENY and SAMEORIGIN."
                ),
                "severity": "medium",
                "affected_url": url,
                "evidence": f"X-Frame-Options: {value}",
                "remediation": "Set X-Frame-Options to DENY or SAMEORIGIN.",
            })

    elif header == "X-Content-Type-Options":
        if value.strip().lower() != "nosniff":
            findings.append({
                "category": "Security Headers",
                "title": "X-Content-Type-Options Incorrect Value",
                "description": (
                    f"X-Content-Type-Options is set to '{value}'. "
                    "The only valid value is 'nosniff'."
                ),
                "severity": "medium",
                "affected_url": url,
                "evidence": f"X-Content-Type-Options: {value}",
                "remediation": "Set X-Content-Type-Options: nosniff",
            })
