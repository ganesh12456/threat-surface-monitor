"""
app/services/scanner/ssl_check.py
Async TLS/SSL certificate and cipher-suite analysis.
"""
import asyncio
import logging
import socket
import ssl
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# TLS versions considered weak
WEAK_TLS_VERSIONS = {"TLSv1", "TLSv1.1", "SSLv2", "SSLv3"}

# Ciphers considered weak (RC4, export, NULL, MD5, 3DES, DES, ANON)
WEAK_CIPHER_PATTERNS = [
    "RC4", "EXPORT", "NULL", "MD5", "3DES", "DES", "ANON",
    "ADH", "AECDH", "aNULL", "eNULL",
]


def _is_self_signed(cert: dict[str, Any]) -> bool:
    """Return True if the certificate subject equals its issuer."""
    subject = dict(x[0] for x in cert.get("subject", []))
    issuer = dict(x[0] for x in cert.get("issuer", []))
    return subject.get("commonName") == issuer.get("commonName")


def _extract_domain(url: str) -> str:
    """Parse the hostname from a full URL."""
    parsed = urlparse(url)
    return parsed.hostname or url


async def check_ssl(url: str) -> dict[str, Any]:
    """
    Perform TLS/SSL analysis on the given URL.

    Checks:
        - Certificate validity and expiration
        - Days until expiration
        - TLS protocol version
        - Weak cipher detection
        - Self-signed certificate detection

    Args:
        url: Full URL (scheme is ignored; port defaults to 443).

    Returns:
        dict with keys:
            - valid: bool
            - expiry_date: str (ISO-8601) or None
            - days_remaining: int or None
            - tls_version: str or None
            - cipher: str or None
            - is_self_signed: bool
            - findings: list[dict]
    """
    domain = _extract_domain(url)
    findings: list[dict[str, Any]] = []
    result: dict[str, Any] = {
        "valid": False,
        "expiry_date": None,
        "days_remaining": None,
        "tls_version": None,
        "cipher": None,
        "is_self_signed": False,
        "findings": findings,
    }

    try:
        loop = asyncio.get_event_loop()
        cert_info = await loop.run_in_executor(None, _fetch_cert_info, domain)
        result.update(cert_info)
        findings.extend(cert_info.get("findings", []))
        result["findings"] = findings

    except ssl.SSLCertVerificationError as exc:
        logger.warning("SSL cert verification failed for %s: %s", domain, exc)
        findings.append({
            "category": "SSL/TLS",
            "title": "SSL Certificate Verification Failed",
            "description": (
                f"The SSL certificate for {domain} could not be verified: {exc}. "
                "This may indicate a self-signed, expired, or misconfigured certificate."
            ),
            "severity": "critical",
            "affected_url": url,
            "evidence": str(exc),
            "remediation": (
                "Obtain a valid certificate from a trusted Certificate Authority (CA) "
                "such as Let's Encrypt (free), DigiCert, or Sectigo."
            ),
        })
    except (socket.gaierror, OSError) as exc:
        logger.warning("SSL check — network error for %s: %s", domain, exc)
        findings.append({
            "category": "SSL/TLS",
            "title": "SSL Connection Failed",
            "description": f"Unable to establish TLS connection to {domain}: {exc}",
            "severity": "high",
            "affected_url": url,
            "evidence": str(exc),
            "remediation": "Verify the host is reachable and TLS is correctly configured on port 443.",
        })
    except Exception as exc:  # noqa: BLE001
        logger.exception("SSL check — unexpected error for %s: %s", domain, exc)

    return result


def _fetch_cert_info(domain: str, port: int = 443) -> dict[str, Any]:
    """
    Synchronous helper (run in executor) that opens a TLS socket and inspects the cert.
    """
    findings: list[dict[str, Any]] = []
    ctx = ssl.create_default_context()

    with socket.create_connection((domain, port), timeout=15) as raw_sock:
        with ctx.wrap_socket(raw_sock, server_hostname=domain) as tls_sock:
            cert = tls_sock.getpeercert()
            cipher_info = tls_sock.cipher()  # (name, protocol, bits)
            tls_version = tls_sock.version()

    cipher_name = cipher_info[0] if cipher_info else None
    expiry_str = cert.get("notAfter", "")
    expiry_dt: datetime | None = None
    days_remaining: int | None = None

    if expiry_str:
        expiry_dt = datetime.strptime(expiry_str, "%b %d %H:%M:%S %Y %Z").replace(
            tzinfo=timezone.utc
        )
        now = datetime.now(timezone.utc)
        days_remaining = (expiry_dt - now).days

        if days_remaining < 0:
            findings.append({
                "category": "SSL/TLS",
                "title": "SSL Certificate Expired",
                "description": (
                    f"The SSL/TLS certificate for {domain} expired on "
                    f"{expiry_dt.date().isoformat()} ({abs(days_remaining)} days ago). "
                    "Visitors will see browser security warnings and traffic may be blocked."
                ),
                "severity": "critical",
                "affected_url": f"https://{domain}",
                "evidence": f"Certificate notAfter: {expiry_str}",
                "remediation": (
                    "Renew the certificate immediately. Consider automating renewal "
                    "with Let's Encrypt / Certbot or your hosting provider's auto-renewal."
                ),
            })
        elif days_remaining <= 30:
            findings.append({
                "category": "SSL/TLS",
                "title": f"SSL Certificate Expiring Soon ({days_remaining} days)",
                "description": (
                    f"The SSL/TLS certificate for {domain} expires in {days_remaining} day(s) "
                    f"on {expiry_dt.date().isoformat()}. Failure to renew will cause browser "
                    "warnings and potential service disruption."
                ),
                "severity": "high",
                "affected_url": f"https://{domain}",
                "evidence": f"Certificate notAfter: {expiry_str}",
                "remediation": (
                    "Renew the certificate now. Set up automated renewal to prevent future expiry."
                ),
            })
        elif days_remaining <= 90:
            findings.append({
                "category": "SSL/TLS",
                "title": f"SSL Certificate Expiring in {days_remaining} Days",
                "description": (
                    f"The SSL/TLS certificate for {domain} will expire in "
                    f"{days_remaining} days on {expiry_dt.date().isoformat()}. "
                    "Plan renewal before the 30-day critical window."
                ),
                "severity": "medium",
                "affected_url": f"https://{domain}",
                "evidence": f"Certificate notAfter: {expiry_str}",
                "remediation": "Schedule certificate renewal within the next 60 days.",
            })

    # TLS version check
    if tls_version and tls_version in WEAK_TLS_VERSIONS:
        findings.append({
            "category": "SSL/TLS",
            "title": f"Weak TLS Protocol: {tls_version}",
            "description": (
                f"The server supports {tls_version}, which is deprecated and known to be "
                "vulnerable to POODLE, BEAST, and other protocol-level attacks. "
                "PCI DSS and NIST SP 800-52 Rev 2 both prohibit TLS 1.0 and 1.1."
            ),
            "severity": "high",
            "affected_url": f"https://{domain}",
            "evidence": f"Negotiated TLS version: {tls_version}",
            "remediation": (
                "Disable TLS 1.0 and TLS 1.1 in your web server configuration. "
                "Enable only TLS 1.2 and TLS 1.3. Consult Mozilla SSL Configuration Generator "
                "for recommended cipher suites: https://ssl-config.mozilla.org/"
            ),
        })

    # Cipher check
    if cipher_name:
        for weak in WEAK_CIPHER_PATTERNS:
            if weak.upper() in cipher_name.upper():
                findings.append({
                    "category": "SSL/TLS",
                    "title": f"Weak Cipher Suite Detected: {cipher_name}",
                    "description": (
                        f"The negotiated cipher suite '{cipher_name}' is considered cryptographically "
                        "weak and should be disabled. Weak ciphers can allow attackers to decrypt "
                        "intercepted traffic."
                    ),
                    "severity": "high",
                    "affected_url": f"https://{domain}",
                    "evidence": f"Negotiated cipher: {cipher_name}",
                    "remediation": (
                        "Configure your web server to prefer ECDHE and AES-GCM cipher suites. "
                        "Use Mozilla's SSL Configuration Generator for a hardened baseline."
                    ),
                })
                break

    # Self-signed check
    is_self_signed = _is_self_signed(cert)
    if is_self_signed:
        findings.append({
            "category": "SSL/TLS",
            "title": "Self-Signed SSL Certificate",
            "description": (
                f"The SSL certificate for {domain} is self-signed and not issued by "
                "a trusted Certificate Authority. Browsers will display a prominent "
                "security warning to visitors."
            ),
            "severity": "high",
            "affected_url": f"https://{domain}",
            "evidence": "Certificate issuer matches subject (self-signed).",
            "remediation": (
                "Replace the self-signed certificate with one issued by a trusted CA. "
                "Let's Encrypt provides free, automatically-renewed certificates."
            ),
        })

    return {
        "valid": not is_self_signed and (days_remaining is None or days_remaining > 0),
        "expiry_date": expiry_dt.isoformat() if expiry_dt else None,
        "days_remaining": days_remaining,
        "tls_version": tls_version,
        "cipher": cipher_name,
        "is_self_signed": is_self_signed,
        "findings": findings,
    }
