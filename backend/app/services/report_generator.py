"""
app/services/report_generator.py
PDF and CSV report generation using ReportLab.
"""
import csv
import io
import logging
from datetime import datetime, timezone
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    HRFlowable,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Colour palette
# ---------------------------------------------------------------------------
SEVERITY_COLORS: dict[str, colors.Color] = {
    "critical": colors.HexColor("#DC2626"),
    "high": colors.HexColor("#EA580C"),
    "medium": colors.HexColor("#D97706"),
    "low": colors.HexColor("#16A34A"),
    "informational": colors.HexColor("#2563EB"),
}
BRAND_DARK = colors.HexColor("#0F172A")
BRAND_BLUE = colors.HexColor("#3B82F6")
BRAND_LIGHT = colors.HexColor("#F8FAFC")
BORDER_GRAY = colors.HexColor("#E2E8F0")


def _build_styles() -> dict[str, ParagraphStyle]:
    """Build a map of named paragraph styles."""
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "title",
            parent=base["Title"],
            fontSize=22,
            textColor=colors.white,
            fontName="Helvetica-Bold",
            alignment=TA_CENTER,
            spaceAfter=4,
        ),
        "subtitle": ParagraphStyle(
            "subtitle",
            parent=base["Normal"],
            fontSize=11,
            textColor=colors.HexColor("#CBD5E1"),
            fontName="Helvetica",
            alignment=TA_CENTER,
        ),
        "section_heading": ParagraphStyle(
            "section_heading",
            parent=base["Heading1"],
            fontSize=14,
            textColor=BRAND_DARK,
            fontName="Helvetica-Bold",
            spaceBefore=14,
            spaceAfter=6,
            borderPad=4,
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["Normal"],
            fontSize=9,
            textColor=BRAND_DARK,
            fontName="Helvetica",
            leading=13,
            spaceAfter=4,
        ),
        "bold_body": ParagraphStyle(
            "bold_body",
            parent=base["Normal"],
            fontSize=9,
            textColor=BRAND_DARK,
            fontName="Helvetica-Bold",
            leading=13,
        ),
        "grade_label": ParagraphStyle(
            "grade_label",
            parent=base["Normal"],
            fontSize=48,
            textColor=BRAND_BLUE,
            fontName="Helvetica-Bold",
            alignment=TA_CENTER,
        ),
        "score_label": ParagraphStyle(
            "score_label",
            parent=base["Normal"],
            fontSize=18,
            textColor=BRAND_DARK,
            fontName="Helvetica-Bold",
            alignment=TA_CENTER,
        ),
        "footer": ParagraphStyle(
            "footer",
            parent=base["Normal"],
            fontSize=7,
            textColor=colors.HexColor("#94A3B8"),
            fontName="Helvetica",
            alignment=TA_RIGHT,
        ),
    }


def _severity_cell_style(severity: str) -> list:
    """Return table cell background colour for a severity level."""
    col = SEVERITY_COLORS.get(severity.lower(), colors.HexColor("#6B7280"))
    return col


def generate_pdf_report(
    scan_result: dict[str, Any],
    report_type: str = "executive",
) -> bytes:
    """
    Generate a professional security report PDF.

    Args:
        scan_result: Complete scan result dict from the orchestrator, containing:
            url, score, grade, analysis (executive_summary, top_risks,
            business_impact, remediation_steps), findings.
        report_type: "executive" | "technical" | "full"

    Returns:
        Raw PDF bytes.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2.5 * cm,
        bottomMargin=2.5 * cm,
        title="Threat Surface Monitor Security Report",
    )

    styles = _build_styles()
    story: list[Any] = []

    url = scan_result.get("url", "Unknown Target")
    score = scan_result.get("score", 0.0)
    grade = scan_result.get("grade", "N/A")
    analysis = scan_result.get("analysis", {})
    findings = scan_result.get("findings", [])
    scan_date = datetime.now(timezone.utc).strftime("%B %d, %Y")

    # -----------------------------------------------------------------------
    # Header Banner
    # -----------------------------------------------------------------------
    header_table = Table(
        [[
            Paragraph("THREAT SURFACE MONITOR", styles["title"]),
            Paragraph(f"Security Assessment Report<br/>{url}", styles["subtitle"]),
        ]],
        colWidths=[doc.width * 0.45, doc.width * 0.55],
    )
    header_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BRAND_DARK),
        ("TOPPADDING", (0, 0), (-1, -1), 16),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 16),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 12))

    # -----------------------------------------------------------------------
    # Risk Score Badge
    # -----------------------------------------------------------------------
    grade_color = SEVERITY_COLORS.get(
        "critical" if grade == "F" else
        "high" if grade == "D" else
        "medium" if grade == "C" else
        "low",
        BRAND_BLUE,
    )

    badge_table = Table(
        [[
            Paragraph(grade, ParagraphStyle(
                "big_grade", fontSize=52, textColor=grade_color,
                fontName="Helvetica-Bold", alignment=TA_CENTER,
            )),
            [
                Paragraph(f"Risk Score: {score:.1f} / 100", styles["score_label"]),
                Spacer(1, 4),
                Paragraph(f"Scanned: {scan_date}", styles["body"]),
                Paragraph(f"Target: {url}", styles["body"]),
            ],
        ]],
        colWidths=[4 * cm, doc.width - 4 * cm],
    )
    badge_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BRAND_LIGHT),
        ("BOX", (0, 0), (-1, -1), 1, BORDER_GRAY),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
    ]))
    story.append(badge_table)
    story.append(Spacer(1, 16))

    # -----------------------------------------------------------------------
    # Executive Summary
    # -----------------------------------------------------------------------
    story.append(Paragraph("Executive Summary", styles["section_heading"]))
    story.append(HRFlowable(width="100%", thickness=1, color=BORDER_GRAY))
    story.append(Spacer(1, 6))

    exec_summary = analysis.get("executive_summary", "No executive summary available.")
    for para in exec_summary.split("\n\n"):
        if para.strip():
            story.append(Paragraph(para.strip(), styles["body"]))
            story.append(Spacer(1, 4))

    story.append(Spacer(1, 10))

    # -----------------------------------------------------------------------
    # Top Risks
    # -----------------------------------------------------------------------
    top_risks = analysis.get("top_risks", [])
    if top_risks:
        story.append(Paragraph("Top Security Risks", styles["section_heading"]))
        story.append(HRFlowable(width="100%", thickness=1, color=BORDER_GRAY))
        story.append(Spacer(1, 6))

        risks_data = [["#", "Severity", "Title", "Category"]]
        for risk in top_risks:
            sev = risk.get("severity", "unknown")
            risks_data.append([
                str(risk.get("priority", "")),
                sev.upper(),
                Paragraph(str(risk.get("title", ""))[:80], styles["body"]),
                str(risk.get("category", "")),
            ])

        risks_table = Table(
            risks_data,
            colWidths=[1 * cm, 2.5 * cm, 10 * cm, 4 * cm],
            repeatRows=1,
        )
        risk_table_style = [
            ("BACKGROUND", (0, 0), (-1, 0), BRAND_DARK),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BRAND_LIGHT]),
            ("GRID", (0, 0), (-1, -1), 0.5, BORDER_GRAY),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]
        # Colour severity cells
        for i, risk in enumerate(top_risks, 1):
            sev = risk.get("severity", "informational")
            cell_color = SEVERITY_COLORS.get(sev, colors.gray)
            risk_table_style.append(
                ("BACKGROUND", (1, i), (1, i), cell_color)
            )
            risk_table_style.append(
                ("TEXTCOLOR", (1, i), (1, i), colors.white)
            )
            risk_table_style.append(
                ("FONTNAME", (1, i), (1, i), "Helvetica-Bold")
            )

        risks_table.setStyle(TableStyle(risk_table_style))
        story.append(risks_table)
        story.append(Spacer(1, 12))

    # -----------------------------------------------------------------------
    # Business Impact (Executive / Full only)
    # -----------------------------------------------------------------------
    if report_type in ("executive", "full"):
        business_impact = analysis.get("business_impact", "")
        if business_impact:
            story.append(Paragraph("Business Impact", styles["section_heading"]))
            story.append(HRFlowable(width="100%", thickness=1, color=BORDER_GRAY))
            story.append(Spacer(1, 6))
            for para in business_impact.split("\n\n"):
                if para.strip():
                    story.append(Paragraph(para.strip(), styles["body"]))
                    story.append(Spacer(1, 4))
            story.append(Spacer(1, 10))

    # -----------------------------------------------------------------------
    # Full Findings Table (Technical / Full only)
    # -----------------------------------------------------------------------
    if report_type in ("technical", "full") and findings:
        story.append(PageBreak())
        story.append(Paragraph("Complete Findings", styles["section_heading"]))
        story.append(HRFlowable(width="100%", thickness=1, color=BORDER_GRAY))
        story.append(Spacer(1, 6))

        severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "informational": 4}
        sorted_findings = sorted(
            findings,
            key=lambda f: severity_order.get(f.get("severity", "informational"), 99),
        )

        findings_data = [["Severity", "Category", "Title", "URL"]]
        for f in sorted_findings:
            findings_data.append([
                f.get("severity", "unknown").upper(),
                str(f.get("category", ""))[:25],
                Paragraph(str(f.get("title", ""))[:100], styles["body"]),
                Paragraph(str(f.get("affected_url", ""))[:60], styles["body"]),
            ])

        findings_table = Table(
            findings_data,
            colWidths=[2.2 * cm, 3.5 * cm, 8.5 * cm, 3.3 * cm],
            repeatRows=1,
        )
        f_style = [
            ("BACKGROUND", (0, 0), (-1, 0), BRAND_DARK),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 7.5),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BRAND_LIGHT]),
            ("GRID", (0, 0), (-1, -1), 0.4, BORDER_GRAY),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]
        for i, f in enumerate(sorted_findings, 1):
            sev = f.get("severity", "informational")
            cell_color = SEVERITY_COLORS.get(sev, colors.gray)
            f_style.extend([
                ("BACKGROUND", (0, i), (0, i), cell_color),
                ("TEXTCOLOR", (0, i), (0, i), colors.white),
                ("FONTNAME", (0, i), (0, i), "Helvetica-Bold"),
            ])
        findings_table.setStyle(TableStyle(f_style))
        story.append(findings_table)
        story.append(Spacer(1, 12))

    # -----------------------------------------------------------------------
    # Remediation Steps
    # -----------------------------------------------------------------------
    remediation_steps = analysis.get("remediation_steps", [])
    if remediation_steps:
        story.append(Paragraph("Remediation Plan", styles["section_heading"]))
        story.append(HRFlowable(width="100%", thickness=1, color=BORDER_GRAY))
        story.append(Spacer(1, 6))

        for step in remediation_steps[:15]:  # cap at 15 for brevity
            sev = step.get("severity", "low")
            priority = step.get("priority", "")
            title = step.get("title", "")
            effort = step.get("effort", "")
            steps_text = step.get("steps", "")

            story.append(Paragraph(
                f"<b>{priority}. [{sev.upper()}] {title}</b> — {effort}",
                styles["bold_body"],
            ))
            story.append(Paragraph(steps_text[:400], styles["body"]))
            story.append(Spacer(1, 6))

    # -----------------------------------------------------------------------
    # Footer
    # -----------------------------------------------------------------------
    story.append(Spacer(1, 20))
    story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER_GRAY))
    story.append(Spacer(1, 4))
    story.append(Paragraph(
        f"Generated by Threat Surface Monitor on {scan_date}  |  Target: {url}  |  "
        f"Risk Score: {score:.1f}/100 (Grade {grade})  |  CONFIDENTIAL",
        styles["footer"],
    ))

    doc.build(story)
    return buffer.getvalue()


def generate_csv_report(findings: list[dict[str, Any]]) -> str:
    """
    Generate a CSV export of all findings.

    Args:
        findings: List of finding dicts.

    Returns:
        CSV string with header row and one row per finding.
    """
    output = io.StringIO()
    fieldnames = [
        "severity",
        "category",
        "title",
        "description",
        "affected_url",
        "evidence",
        "remediation",
        "cvss_score",
        "is_new",
        "is_fixed",
    ]

    writer = csv.DictWriter(
        output,
        fieldnames=fieldnames,
        extrasaction="ignore",
        lineterminator="\n",
    )
    writer.writeheader()

    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "informational": 4}
    sorted_findings = sorted(
        findings,
        key=lambda f: severity_order.get(f.get("severity", "informational"), 99),
    )

    for f in sorted_findings:
        writer.writerow({field: f.get(field, "") for field in fieldnames})

    return output.getvalue()
