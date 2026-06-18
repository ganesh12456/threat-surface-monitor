"""
app/services/scanner/cloudflare_check.py
Detects Cloudflare CDN/WAF presence and identifies potential IP origin exposure.
"""
import logging
import socket
from ipaddress import ip_address, ip_network
from typing import Any
from urllib.parse import urlparse

import aiohttp

logger = logging.getLogger(__name__)

# Known Cloudflare IP ranges (IPv4) — updated periodically
# Full list: https://www.cloudflare.com/ips-v4/
CLOUDFLARE_IP_RANGES = [
    "173.245.48.0/20",
    "103.21.244.0/22",
    "103.22.200.0/22",
    "103.31.4.0/22",
    "141.101.64.0/18",
    "108.162.192.0/18",
    "190.93.240.0/20",
    "188.114.96.0/20",
    "197.234.240.0/22",
    "198.41.128.0/17",
    "162.158.0.0/15",
    "104.16.0.0/13",
    "104.24.0.0/14",
    "172.64.0.0/13",
    "131.0.72.0/22",
]


def _is_cloudflare_ip(ip: str) -> bool:
    """Return True if *ip* falls within a known Cloudflare CIDR range."""
    try:
        addr = ip_address(ip)
        return any(addr in ip_network(cidr) for cidr in CLOUDFLARE_IP_RANGES)
    except ValueError:
        return False


def _resolve_ip(hostname: str) -> str | None:
    """Synchronous DNS A-record lookup; returns first IP or None."""
    try:
        return socket.gethostbyname(hostname)
    except socket.gaierror:
        return None


async def check_cloudflare(
    url: str,
    session: aiohttp.ClientSession,
) -> dict[str, Any]:
    """
    Detect Cloudflare CDN/WAF and surface IP-origin exposure risks.

    Detection methods:
        - CF-Ray response header
        - Server: cloudflare header
        - Via header containing 'cloudflare'
        - DNS A-record matching Cloudflare IP ranges

    Args:
        url: Full URL of the target.
        session: Shared aiohttp ClientSession.

    Returns:
        dict with keys:
            - is_behind_cloudflare: bool
            - cf_ray: str | None
            - server_header: str | None
            - ssl_mode: str | None
            - resolved_ip: str | None
            - findings: list[dict]
    """
    findings: list[dict[str, Any]] = []
    is_behind_cloudflare = False
    cf_ray: str | None = None
    server_header: str | None = None
    ssl_mode: str | None = None
    resolved_ip: str | None = None

    try:
        hostname = urlparse(url).hostname or ""
        resolved_ip = _resolve_ip(hostname)

        async with session.get(
            url,
            allow_redirects=True,
            timeout=aiohttp.ClientTimeout(total=15),
            ssl=False,
        ) as response:
            headers = {k.lower(): v for k, v in response.headers.items()}

            cf_ray = headers.get("cf-ray")
            server_header = headers.get("server", "")
            via_header = headers.get("via", "")

            # Detection logic
            if cf_ray:
                is_behind_cloudflare = True
            elif "cloudflare" in server_header.lower():
                is_behind_cloudflare = True
            elif "cloudflare" in via_header.lower():
                is_behind_cloudflare = True
            elif resolved_ip and _is_cloudflare_ip(resolved_ip):
                is_behind_cloudflare = True

            # Infer SSL mode from Upgrade-Insecure-Requests / CF-Visitor header
            cf_visitor = headers.get("cf-visitor", "")
            if '"scheme":"https"' in cf_visitor:
                ssl_mode = "full"
            elif url.startswith("https://"):
                ssl_mode = "flexible"
            else:
                ssl_mode = "off"

            # ---------------------------------------------------------------
            # Findings
            # ---------------------------------------------------------------
            if not is_behind_cloudflare:
                findings.append({
                    "category": "Cloudflare / CDN",
                    "title": "Site Not Behind Cloudflare or CDN",
                    "description": (
                        f"No Cloudflare indicators were detected for {url}. "
                        "The origin server IP may be directly exposed, bypassing any "
                        "DDoS protection, WAF, or rate limiting typically provided by a CDN."
                    ),
                    "severity": "informational",
                    "affected_url": url,
                    "evidence": (
                        f"No CF-Ray header, Server: cloudflare not present, "
                        f"resolved IP ({resolved_ip}) not in Cloudflare ranges."
                    ),
                    "remediation": (
                        "Consider routing traffic through Cloudflare or another CDN/WAF "
                        "provider to benefit from DDoS mitigation, WAF filtering, SSL offloading, "
                        "and global performance improvements."
                    ),
                })
            else:
                # Behind Cloudflare — check if origin IP is still discoverable
                if resolved_ip and not _is_cloudflare_ip(resolved_ip):
                    findings.append({
                        "category": "Cloudflare / CDN",
                        "title": "Origin IP Directly Resolvable (Cloudflare Bypass Risk)",
                        "description": (
                            f"The site uses Cloudflare, but the domain resolves to {resolved_ip}, "
                            "which is not a Cloudflare IP. This suggests the origin server IP is "
                            "exposed in DNS, allowing attackers to bypass Cloudflare protections "
                            "by connecting directly to the origin."
                        ),
                        "severity": "high",
                        "affected_url": url,
                        "evidence": f"DNS resolves to {resolved_ip} (non-Cloudflare range).",
                        "remediation": (
                            "1. Ensure all DNS A records point to Cloudflare IPs (proxy enabled in Cloudflare dashboard). "
                            "2. Configure your origin server firewall to only accept connections from Cloudflare IP ranges. "
                            "3. Check for historical DNS records in SecurityTrails or Shodan that may have leaked the origin IP."
                        ),
                    })

                # WAF status (informational positive)
                findings.append({
                    "category": "Cloudflare / CDN",
                    "title": "Site is Protected by Cloudflare",
                    "description": (
                        f"Cloudflare CDN/WAF detected (CF-Ray: {cf_ray or 'detected via other indicators'}). "
                        "The site benefits from DDoS protection, CDN caching, and potentially WAF filtering."
                    ),
                    "severity": "informational",
                    "affected_url": url,
                    "evidence": f"CF-Ray: {cf_ray}, Server: {server_header}",
                    "remediation": (
                        "Ensure Cloudflare WAF rules are enabled and SSL mode is set to 'Full (Strict)' "
                        "for end-to-end encryption. Review Cloudflare security event logs regularly."
                    ),
                })

    except aiohttp.ClientConnectorError as exc:
        logger.warning("Cloudflare check — connection failed for %s: %s", url, exc)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Cloudflare check — unexpected error for %s: %s", url, exc)

    return {
        "is_behind_cloudflare": is_behind_cloudflare,
        "cf_ray": cf_ray,
        "server_header": server_header,
        "ssl_mode": ssl_mode,
        "resolved_ip": resolved_ip,
        "findings": findings,
    }
