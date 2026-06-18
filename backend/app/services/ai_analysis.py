"""
app/services/ai_analysis.py
Pure-Python intelligence layer: risk scoring, grading, and professional report generation.
No external AI API required — uses deterministic templates + finding data.
"""
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SCORING: dict[str, int] = {
    "critical": 25,
    "high": 15,
    "medium": 8,
    "low": 3,
    "informational": 0,
}

GRADE_THRESHOLDS: dict[str, tuple[int, int]] = {
    "A": (0, 20),
    "B": (21, 40),
    "C": (41, 60),
    "D": (61, 80),
    "F": (81, 100),
}

SEVERITY_ORDER = ["critical", "high", "medium", "low", "informational"]


# ---------------------------------------------------------------------------
# Scoring & Grading
# ---------------------------------------------------------------------------


def calculate_risk_score(findings: list[dict]) -> tuple[float, str]:
    """
    Calculate a normalised 0-100 risk score and letter grade from a findings list.

    Scoring formula:
        raw_score = sum(SCORING[sev] for each finding)
        normalised = min(100, raw_score)  (capped at 100)

    Args:
        findings: List of finding dicts, each containing a 'severity' key.

    Returns:
        Tuple of (score: float, grade: str) where score is 0-100 and grade is A-F.
    """
    raw = sum(SCORING.get(f.get("severity", "informational"), 0) for f in findings)
    score = min(100.0, float(raw))

    grade = "A"
    for g, (low, high) in GRADE_THRESHOLDS.items():
        if low <= score <= high:
            grade = g
            break

    return score, grade


# ---------------------------------------------------------------------------
# Counting helpers
# ---------------------------------------------------------------------------


def _count_by_severity(findings: list[dict]) -> dict[str, int]:
    counts: dict[str, int] = {s: 0 for s in SEVERITY_ORDER}
    for f in findings:
        sev = f.get("severity", "informational")
        if sev in counts:
            counts[sev] += 1
    return counts


def _sorted_findings(findings: list[dict]) -> list[dict]:
    """Return findings sorted from most to least severe."""
    order = {s: i for i, s in enumerate(SEVERITY_ORDER)}
    return sorted(findings, key=lambda f: order.get(f.get("severity", "informational"), 99))


# ---------------------------------------------------------------------------
# Narrative generators
# ---------------------------------------------------------------------------


def generate_executive_summary(
    url: str,
    findings: list[dict],
    score: float,
    grade: str,
) -> str:
    """
    Generate a professional 3-paragraph executive summary suitable for C-suite reporting.

    Args:
        url: The scanned URL.
        findings: Complete list of findings from all scanner modules.
        score: Calculated risk score (0–100).
        grade: Letter grade (A–F).

    Returns:
        Multi-paragraph professional security assessment narrative.
    """
    counts = _count_by_severity(findings)
    total = len(findings)
    scan_date = datetime.now(timezone.utc).strftime("%B %d, %Y")

    # Grade narrative
    grade_narrative = {
        "A": "demonstrates a strong security posture with minimal exposure",
        "B": "maintains a satisfactory security baseline with some areas requiring attention",
        "C": "presents a moderate risk profile with several issues that require remediation",
        "D": "exhibits significant security weaknesses that pose material risk to operations",
        "F": "is critically exposed with multiple high-severity vulnerabilities requiring immediate remediation",
    }.get(grade, "has been assessed for security posture")

    # Risk level label
    risk_label = {
        "A": "LOW",
        "B": "LOW-MEDIUM",
        "C": "MEDIUM",
        "D": "HIGH",
        "F": "CRITICAL",
    }.get(grade, "UNKNOWN")

    # Paragraph 1 — overview
    para1 = (
        f"This security assessment of {url}, conducted on {scan_date}, assigned a risk score "
        f"of {score:.1f}/100 (Grade: {grade}), indicating an overall {risk_label} risk level. "
        f"The target {grade_narrative}. A total of {total} security findings were identified "
        f"across {counts['critical']} critical, {counts['high']} high, {counts['medium']} medium, "
        f"{counts['low']} low, and {counts['informational']} informational severity categories."
    )

    # Paragraph 2 — key concerns
    critical_high = _sorted_findings([
        f for f in findings if f.get("severity") in ("critical", "high")
    ])
    if critical_high:
        top_issues = [f.get("title", "Unspecified Issue") for f in critical_high[:3]]
        top_issues_str = "; ".join(top_issues)
        para2 = (
            f"The most significant findings requiring immediate attention include: {top_issues_str}. "
            f"These findings represent exploitable attack vectors that adversaries actively target "
            f"in opportunistic and targeted campaigns. Failure to address critical and high severity "
            f"issues exposes the organisation to risks including data breach, service disruption, "
            f"reputational damage, and regulatory non-compliance."
        )
    else:
        para2 = (
            f"No critical or high severity vulnerabilities were identified during this assessment. "
            f"The {counts['medium']} medium and {counts['low']} low severity findings represent "
            f"areas where defence-in-depth improvements are recommended. Proactive remediation "
            f"of these issues will further harden the security posture ahead of evolving threat landscapes."
        )

    # Paragraph 3 — recommendation
    if grade in ("F", "D"):
        para3 = (
            f"Given the severity of findings identified, it is strongly recommended that remediation "
            f"efforts begin immediately, prioritising critical and high severity items within 24–72 hours. "
            f"A follow-up assessment should be conducted within 30 days to validate remediation effectiveness. "
            f"The security team should also review access logs for indicators of prior exploitation and "
            f"consider engaging an incident response team if a breach is suspected."
        )
    elif grade == "C":
        para3 = (
            f"It is recommended that the identified medium and high severity findings be addressed "
            f"within the next 30 days as part of a structured remediation plan. Each finding in this "
            f"report includes specific technical remediation guidance. A re-scan should be conducted "
            f"after remediation to verify improvements and maintain continuous security visibility."
        )
    else:
        para3 = (
            f"While the overall security posture is acceptable, the identified findings should be "
            f"addressed in the next scheduled maintenance cycle. Continuous monitoring and periodic "
            f"reassessment are recommended to maintain this security standard as the application "
            f"and threat landscape evolve."
        )

    return f"{para1}\n\n{para2}\n\n{para3}"


def generate_technical_summary(findings: list[dict]) -> str:
    """
    Generate a structured technical summary grouping findings by category.

    Args:
        findings: List of finding dicts.

    Returns:
        Technical narrative string suitable for security engineers.
    """
    if not findings:
        return "No findings were identified during this assessment. All tested security controls appear to be functioning correctly."

    # Group by category
    categories: dict[str, list[dict]] = {}
    for f in findings:
        cat = f.get("category", "General")
        categories.setdefault(cat, []).append(f)

    lines: list[str] = [
        f"Technical Assessment Summary — {len(findings)} total finding(s) across {len(categories)} category(ies):\n"
    ]

    for cat, cat_findings in sorted(categories.items()):
        counts = _count_by_severity(cat_findings)
        severity_str = ", ".join(
            f"{v} {k}" for k, v in counts.items() if v > 0
        )
        lines.append(f"[{cat.upper()}] — {len(cat_findings)} finding(s): {severity_str}")
        for f in _sorted_findings(cat_findings):
            sev = f.get("severity", "unknown").upper()
            title = f.get("title", "Untitled")
            affected = f.get("affected_url", "")
            lines.append(f"  • [{sev}] {title}" + (f" ({affected})" if affected else ""))

    lines.append(
        f"\nAll findings include specific remediation guidance. Prioritise critical and high "
        f"severity items immediately, followed by medium severity within 30 days."
    )
    return "\n".join(lines)


def generate_top_risks(findings: list[dict]) -> list[dict]:
    """
    Return the top 5 critical/high severity findings enriched with business context.

    Args:
        findings: Complete findings list.

    Returns:
        List of up to 5 enriched finding dicts with 'risk_context' and 'priority' fields.
    """
    priority_findings = _sorted_findings([
        f for f in findings if f.get("severity") in ("critical", "high")
    ])[:5]

    context_map = {
        "critical": "Immediate exploitation risk. Attackers actively scan for this vulnerability.",
        "high": "Significant risk requiring prompt attention within 24–72 hours.",
    }

    result = []
    for i, f in enumerate(priority_findings, 1):
        sev = f.get("severity", "high")
        result.append({
            "priority": i,
            "title": f.get("title"),
            "severity": sev,
            "category": f.get("category"),
            "affected_url": f.get("affected_url"),
            "description": f.get("description"),
            "remediation": f.get("remediation"),
            "risk_context": context_map.get(sev, ""),
        })
    return result


def generate_business_impact(findings: list[dict], url: str) -> str:
    """
    Generate a business-oriented risk narrative for non-technical stakeholders.

    Args:
        findings: Complete findings list.
        url: The scanned URL.

    Returns:
        Business impact narrative string.
    """
    counts = _count_by_severity(findings)

    impacts: list[str] = []

    if counts["critical"] > 0:
        impacts.append(
            f"The {counts['critical']} critical vulnerability(ies) identified represent an imminent "
            f"risk of data breach, unauthorised access, or complete system compromise. "
            f"A successful exploit could result in regulatory fines (GDPR, PCI DSS), legal liability, "
            f"and significant reputational damage affecting customer trust."
        )

    if counts["high"] > 0:
        impacts.append(
            f"The {counts['high']} high severity finding(s) create exploitable attack surfaces "
            f"that, if leveraged, could lead to partial data exposure, service disruption, or "
            f"serve as initial footholds for more sophisticated intrusions."
        )

    if counts["medium"] > 0:
        impacts.append(
            f"The {counts['medium']} medium severity issue(s) represent security gaps that, "
            f"while not immediately exploitable in isolation, may be chained with other vulnerabilities "
            f"or exploited in targeted attacks. These should be addressed within the next 30-day cycle."
        )

    if not impacts:
        return (
            f"The security assessment of {url} identified only low-severity or informational findings. "
            f"The business risk is currently minimal. Continue routine security monitoring and address "
            f"the identified low-severity items in the next scheduled maintenance window."
        )

    base = f"Business Impact Assessment for {url}:\n\n"
    return base + "\n\n".join(impacts)


def generate_remediation_steps(findings: list[dict]) -> list[dict]:
    """
    Generate a prioritised remediation plan from findings.

    Args:
        findings: Complete findings list.

    Returns:
        List of remediation step dicts with 'priority', 'effort', 'impact', 'steps'.
    """
    effort_map = {
        "critical": "Immediate (< 24 hours)",
        "high": "Short-term (24–72 hours)",
        "medium": "Medium-term (within 30 days)",
        "low": "Long-term (within 90 days)",
        "informational": "Backlog",
    }
    impact_map = {
        "critical": "Eliminates immediate exploitation risk",
        "high": "Significantly reduces attack surface",
        "medium": "Improves defence-in-depth posture",
        "low": "Hardens security baseline",
        "informational": "Reduces information disclosure",
    }

    sorted_f = _sorted_findings([f for f in findings if f.get("severity") != "informational"])
    steps = []
    for i, f in enumerate(sorted_f, 1):
        sev = f.get("severity", "low")
        steps.append({
            "priority": i,
            "severity": sev,
            "title": f.get("title"),
            "category": f.get("category"),
            "affected_url": f.get("affected_url"),
            "effort": effort_map.get(sev, "Scheduled"),
            "impact": impact_map.get(sev, "Improves security"),
            "steps": f.get("remediation", "No specific guidance available."),
        })
    return steps


# ---------------------------------------------------------------------------
# Change detection
# ---------------------------------------------------------------------------


def detect_new_findings(current: list[dict], previous: list[dict]) -> list[dict]:
    """
    Identify findings present in *current* but absent from *previous* (by title + category).

    Args:
        current: Findings from the latest scan.
        previous: Findings from the previous scan.

    Returns:
        List of newly introduced finding dicts.
    """
    previous_keys = {
        (f.get("title", ""), f.get("category", ""))
        for f in previous
    }
    return [
        f for f in current
        if (f.get("title", ""), f.get("category", "")) not in previous_keys
    ]


def detect_fixed_findings(current: list[dict], previous: list[dict]) -> list[dict]:
    """
    Identify findings present in *previous* but absent from *current* (resolved vulnerabilities).

    Args:
        current: Findings from the latest scan.
        previous: Findings from the previous scan.

    Returns:
        List of resolved finding dicts.
    """
    current_keys = {
        (f.get("title", ""), f.get("category", ""))
        for f in current
    }
    return [
        f for f in previous
        if (f.get("title", ""), f.get("category", "")) not in current_keys
    ]


# ---------------------------------------------------------------------------
# Unified analysis object
# ---------------------------------------------------------------------------


def generate_full_analysis(
    url: str,
    findings: list[dict],
    previous_findings: list[dict],
    score: float,
    grade: str,
) -> dict:
    """
    Produce the complete AI analysis object stored in the recommendations table.

    Args:
        url: Scanned URL.
        findings: Current scan findings.
        previous_findings: Findings from the prior scan (empty list if first scan).
        score: Calculated risk score.
        grade: Letter grade.

    Returns:
        Full analysis dict ready for DB storage and API response.
    """
    counts = _count_by_severity(findings)
    new_findings = detect_new_findings(findings, previous_findings)
    fixed_findings = detect_fixed_findings(findings, previous_findings)

    return {
        "executive_summary": generate_executive_summary(url, findings, score, grade),
        "technical_summary": generate_technical_summary(findings),
        "top_risks": generate_top_risks(findings),
        "business_impact": generate_business_impact(findings, url),
        "remediation_steps": generate_remediation_steps(findings),
        "metadata": {
            "url": url,
            "score": score,
            "grade": grade,
            "total_findings": len(findings),
            "critical_count": counts["critical"],
            "high_count": counts["high"],
            "medium_count": counts["medium"],
            "low_count": counts["low"],
            "info_count": counts["informational"],
            "new_findings_count": len(new_findings),
            "fixed_findings_count": len(fixed_findings),
            "new_findings": [f.get("title") for f in new_findings],
            "fixed_findings": [f.get("title") for f in fixed_findings],
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
    }
