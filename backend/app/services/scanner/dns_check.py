"""
app/services/scanner/dns_check.py
Async DNS security analysis: SPF, DMARC, DNSSEC, zone-transfer attempt.
"""
import asyncio
import logging
from typing import Any
from urllib.parse import urlparse

import dns.asyncresolver
import dns.exception
import dns.query
import dns.resolver
import dns.zone

logger = logging.getLogger(__name__)


def _extract_domain(url: str) -> str:
    """Parse bare hostname from a full URL."""
    parsed = urlparse(url)
    return parsed.hostname or url


async def _query_txt(domain: str, prefix: str = "") -> list[str]:
    """
    Retrieve TXT records for *prefix.domain* (or *domain* if prefix is empty).
    Returns an empty list on any error.
    """
    target = f"{prefix}.{domain}" if prefix else domain
    try:
        resolver = dns.asyncresolver.Resolver()
        answers = await resolver.resolve(target, "TXT")
        return [rdata.to_text().strip('"') for rdata in answers]
    except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer, dns.exception.Timeout):
        return []
    except Exception as exc:  # noqa: BLE001
        logger.debug("DNS TXT query failed for %s: %s", target, exc)
        return []


async def _query_records(domain: str, rtype: str) -> list[str]:
    """Retrieve DNS records of *rtype* for *domain*."""
    try:
        resolver = dns.asyncresolver.Resolver()
        answers = await resolver.resolve(domain, rtype)
        return [rdata.to_text() for rdata in answers]
    except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer, dns.exception.Timeout):
        return []
    except Exception as exc:  # noqa: BLE001
        logger.debug("DNS %s query failed for %s: %s", rtype, domain, exc)
        return []


def _check_zone_transfer(domain: str) -> bool:
    """
    Attempt a zone transfer (AXFR) against the authoritative nameserver.
    Returns True if the transfer succeeds (critical vulnerability).
    """
    try:
        ns_records = dns.resolver.resolve(domain, "NS")
        for ns in ns_records:
            nameserver = str(ns.target).rstrip(".")
            try:
                ns_ip = socket_lookup(nameserver)
                zone = dns.zone.from_xfr(dns.query.xfr(ns_ip, domain, timeout=5))
                if zone:
                    return True
            except Exception:  # noqa: BLE001
                continue
    except Exception:  # noqa: BLE001
        pass
    return False


def socket_lookup(hostname: str) -> str:
    """Resolve hostname to IP via stdlib socket."""
    import socket
    return socket.gethostbyname(hostname)


async def check_dns(domain_or_url: str) -> dict[str, Any]:
    """
    Perform DNS security analysis for the target domain.

    Checks performed:
        - A / AAAA record resolution
        - MX records
        - SPF record (looks for v=spf1 in TXT)
        - DMARC record (_dmarc TXT)
        - DNSSEC (DNSKEY record presence)
        - Zone transfer attempt (AXFR)

    Args:
        domain_or_url: Either a bare domain or full URL.

    Returns:
        dict with keys:
            - domain: str
            - a_records: list[str]
            - aaaa_records: list[str]
            - mx_records: list[str]
            - spf_record: str | None
            - dmarc_record: str | None
            - dnssec_enabled: bool
            - zone_transfer_allowed: bool
            - findings: list[dict]
    """
    domain = _extract_domain(domain_or_url)
    findings: list[dict[str, Any]] = []

    # Run all DNS queries concurrently
    (
        a_records,
        aaaa_records,
        mx_records,
        txt_records,
        dmarc_records,
        dnskey_records,
    ) = await asyncio.gather(
        _query_records(domain, "A"),
        _query_records(domain, "AAAA"),
        _query_records(domain, "MX"),
        _query_txt(domain),
        _query_txt(domain, "_dmarc"),
        _query_records(domain, "DNSKEY"),
        return_exceptions=True,
    )

    # Safely default exceptions to empty lists
    if isinstance(a_records, Exception):
        a_records = []
    if isinstance(aaaa_records, Exception):
        aaaa_records = []
    if isinstance(mx_records, Exception):
        mx_records = []
    if isinstance(txt_records, Exception):
        txt_records = []
    if isinstance(dmarc_records, Exception):
        dmarc_records = []
    if isinstance(dnskey_records, Exception):
        dnskey_records = []

    # -----------------------------------------------------------------------
    # SPF check
    # -----------------------------------------------------------------------
    spf_record: str | None = next(
        (r for r in txt_records if r.startswith("v=spf1")), None
    )
    if not spf_record:
        findings.append({
            "category": "DNS Security",
            "title": "Missing SPF Record",
            "description": (
                f"No SPF (Sender Policy Framework) TXT record was found for {domain}. "
                "Without SPF, anyone can send emails that appear to originate from your "
                "domain, enabling phishing and email spoofing attacks."
            ),
            "severity": "medium",
            "affected_url": domain,
            "evidence": f"No TXT record starting with 'v=spf1' found for {domain}.",
            "remediation": (
                "Add a TXT record to your DNS: "
                "\"v=spf1 include:_spf.google.com ~all\" (adjust for your email provider). "
                "Use the SPF wizard at https://dmarcian.com/spf-wizard/ to build the correct record."
            ),
        })
    else:
        # Check for overly permissive SPF
        if "+all" in spf_record:
            findings.append({
                "category": "DNS Security",
                "title": "SPF Record Uses +all (Permissive)",
                "description": (
                    f"The SPF record for {domain} ends with '+all', meaning any server "
                    "is authorised to send email on behalf of this domain. This completely "
                    "negates the protection SPF is intended to provide."
                ),
                "severity": "high",
                "affected_url": domain,
                "evidence": f"SPF record: {spf_record}",
                "remediation": (
                    "Change '+all' to '~all' (soft fail) or '-all' (hard fail) in your SPF record. "
                    "'-all' is recommended for domains that only send email from known servers."
                ),
            })

    # -----------------------------------------------------------------------
    # DMARC check
    # -----------------------------------------------------------------------
    dmarc_record: str | None = next(
        (r for r in dmarc_records if r.startswith("v=DMARC1")), None
    )
    if not dmarc_record:
        findings.append({
            "category": "DNS Security",
            "title": "Missing DMARC Record",
            "description": (
                f"No DMARC (Domain-based Message Authentication, Reporting, and Conformance) "
                f"record was found at _dmarc.{domain}. Without DMARC, email receivers cannot "
                "determine your policy for handling authentication failures, allowing spoofed "
                "emails to reach recipients."
            ),
            "severity": "medium",
            "affected_url": domain,
            "evidence": f"No DMARC TXT record at _dmarc.{domain}.",
            "remediation": (
                "Add a DMARC TXT record: "
                "\"v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com\" "
                "Start with p=none to monitor, then move to p=quarantine or p=reject. "
                "Use https://dmarcian.com/ for guided setup."
            ),
        })
    else:
        # Check for DMARC policy=none (monitoring only — not enforcing)
        if "p=none" in dmarc_record.lower():
            findings.append({
                "category": "DNS Security",
                "title": "DMARC Policy Set to 'none' (Not Enforcing)",
                "description": (
                    f"The DMARC record for {domain} uses p=none, which only monitors "
                    "email authentication but takes no action against spoofed emails. "
                    "Attackers can still successfully deliver spoofed messages."
                ),
                "severity": "low",
                "affected_url": domain,
                "evidence": f"DMARC record: {dmarc_record}",
                "remediation": (
                    "After reviewing DMARC reports, update the policy to p=quarantine "
                    "and eventually p=reject to enforce email authentication."
                ),
            })

    # -----------------------------------------------------------------------
    # DNSSEC check
    # -----------------------------------------------------------------------
    dnssec_enabled = bool(dnskey_records)
    if not dnssec_enabled:
        findings.append({
            "category": "DNS Security",
            "title": "DNSSEC Not Enabled",
            "description": (
                f"DNSSEC (DNS Security Extensions) is not configured for {domain}. "
                "Without DNSSEC, DNS responses cannot be cryptographically validated, "
                "leaving the domain vulnerable to DNS cache poisoning / spoofing attacks "
                "that could redirect users to malicious sites."
            ),
            "severity": "low",
            "affected_url": domain,
            "evidence": f"No DNSKEY records found for {domain}.",
            "remediation": (
                "Enable DNSSEC through your domain registrar or DNS hosting provider. "
                "Most major registrars (Cloudflare, AWS Route 53, GoDaddy) support "
                "one-click DNSSEC activation."
            ),
        })

    # -----------------------------------------------------------------------
    # Zone transfer check (run synchronously in executor to avoid blocking)
    # -----------------------------------------------------------------------
    loop = asyncio.get_event_loop()
    zone_transfer_allowed = False
    try:
        zone_transfer_allowed = await loop.run_in_executor(
            None, _check_zone_transfer, domain
        )
    except Exception as exc:  # noqa: BLE001
        logger.debug("Zone transfer check error for %s: %s", domain, exc)

    if zone_transfer_allowed:
        findings.append({
            "category": "DNS Security",
            "title": "DNS Zone Transfer Allowed (AXFR)",
            "description": (
                f"The DNS nameserver for {domain} allows unauthorized zone transfers (AXFR). "
                "This exposes the complete DNS zone data including all subdomains, internal "
                "hostnames, and IP addresses — providing attackers with a comprehensive "
                "map of your infrastructure."
            ),
            "severity": "critical",
            "affected_url": domain,
            "evidence": "AXFR zone transfer request was successfully fulfilled.",
            "remediation": (
                "Configure your DNS server to restrict AXFR requests to authorised secondary "
                "nameservers only. In BIND, use: allow-transfer { trusted-secondary-ip; }; "
                "In most managed DNS services, zone transfers are disabled by default."
            ),
        })

    return {
        "domain": domain,
        "a_records": a_records,
        "aaaa_records": aaaa_records,
        "mx_records": mx_records,
        "spf_record": spf_record,
        "dmarc_record": dmarc_record,
        "dnssec_enabled": dnssec_enabled,
        "zone_transfer_allowed": zone_transfer_allowed,
        "findings": findings,
    }
