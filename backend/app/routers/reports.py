"""
app/routers/reports.py
Report generation and download endpoints using the database service.
"""
import logging
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response

from app.core.config import settings
from app.core import supabase as db_service
from app.core.security import get_current_user
from app.schemas.report import ReportRequest, ReportResponse
from app.services.report_generator import generate_csv_report, generate_pdf_report

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/reports", tags=["Reports"])

# Directory where reports are stored on disk
REPORTS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "reports")


def _ensure_reports_dir() -> str:
    """Create the reports directory if it doesn't exist and return its path."""
    reports_path = os.path.abspath(REPORTS_DIR)
    os.makedirs(reports_path, exist_ok=True)
    return reports_path


async def _get_latest_completed_scan(website_id: str) -> dict | None:
    """Return the most recent completed scan for a website."""
    scan = await db_service.get_latest_completed_scan(website_id)
    if not scan:
        return None
    risk = await db_service.get_risk_score_by_scan(scan["id"])
    return {
        "id": scan["id"],
        "score": risk["score"] if risk else 0.0,
        "grade": risk["grade"] if risk else "N/A"
    }


async def _build_scan_result_dict(
    scan_id: str,
    website_url: str,
) -> dict:
    """Assemble the scan result dict needed by the report generator."""
    # Fetch findings
    raw_findings = await db_service.list_findings_by_scan(scan_id)
    findings = [
        {
            "category": f["category"],
            "title": f["title"],
            "description": f.get("description"),
            "severity": f.get("severity"),
            "affected_url": f.get("affected_url"),
            "evidence": f.get("evidence"),
            "remediation": f.get("remediation"),
            "cvss_score": f.get("cvss_score"),
            "is_new": f.get("is_new", True),
            "is_fixed": f.get("is_fixed", False),
        }
        for f in raw_findings
    ]

    # Fetch risk score and AI analysis
    score_rec = await db_service.get_risk_score_by_scan(scan_id)
    rec_rec = await db_service.get_recommendation_by_scan(scan_id)
    if not rec_rec:
        rec_rec = {}

    analysis = {
        "executive_summary": rec_rec.get("executive_summary"),
        "technical_summary": rec_rec.get("technical_summary"),
        "top_risks": rec_rec.get("top_risks", []),
        "business_impact": rec_rec.get("business_impact"),
        "remediation_steps": rec_rec.get("remediation_steps", []),
    }

    return {
        "scan_id": scan_id,
        "url": website_url,
        "score": float(score_rec["score"]) if score_rec else 0.0,
        "grade": score_rec["grade"] if score_rec else "N/A",
        "findings": findings,
        "analysis": analysis,
    }


@router.post(
    "/generate",
    response_model=ReportResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate a PDF or CSV security report",
)
async def generate_report(
    body: ReportRequest,
    current_user: dict = Depends(get_current_user),
) -> ReportResponse:
    """
    Generate a security report for the specified website.
    """
    # Verify website ownership
    website = await db_service.get_website(str(body.website_id), current_user["sub"])
    if not website:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Website not found.",
        )
    website_url = website["url"]

    # Resolve scan_id
    scan_id = str(body.scan_id) if body.scan_id else None
    if not scan_id:
        latest = await _get_latest_completed_scan(str(body.website_id))
        if not latest:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No completed scans found for this website. Run a scan first.",
            )
        scan_id = latest["id"]

    # Build scan result dict
    scan_result = await _build_scan_result_dict(scan_id, website_url)

    # Generate report bytes
    reports_dir = _ensure_reports_dir()
    report_id = str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"report_{timestamp}_{report_id[:8]}.{body.format}"
    file_path = os.path.join(reports_dir, filename)

    if body.format == "pdf":
        content = generate_pdf_report(scan_result, body.report_type)
        with open(file_path, "wb") as f:
            f.write(content)
    else:  # csv
        content_str = generate_csv_report(scan_result.get("findings", []))
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content_str)

    # Store report metadata
    db_report_id = str(uuid.uuid4())
    await db_service.create_report({
        "id": db_report_id,
        "website_id": str(body.website_id),
        "scan_id": scan_id,
        "report_type": body.report_type,
        "format": body.format,
        "file_path": file_path,
        "generated_by": current_user["sub"],
        "created_at": datetime.now(timezone.utc),
    })

    logger.info(
        "Report generated: %s type=%s format=%s by user=%s",
        db_report_id, body.report_type, body.format, current_user["sub"],
    )

    return ReportResponse(
        id=uuid.UUID(db_report_id),
        website_id=body.website_id,
        scan_id=uuid.UUID(scan_id),
        report_type=body.report_type,
        format=body.format,
        file_path=file_path,
        generated_by=uuid.UUID(current_user["sub"]),
        created_at=datetime.now(timezone.utc),
        download_url=f"/api/v1/reports/{db_report_id}/download",
    )


@router.get(
    "/",
    response_model=list[ReportResponse],
    summary="List generated reports",
)
async def list_reports(
    website_id: str | None = None,
    skip: int = 0,
    limit: int = 50,
    current_user: dict = Depends(get_current_user),
) -> list[ReportResponse]:
    """Return all reports generated by the current user."""
    raw_reports = await db_service.list_reports(
        user_id=current_user["sub"],
        website_id=website_id,
        limit=limit,
        skip=skip,
    )
    
    reports = []
    for r in raw_reports:
        reports.append(ReportResponse(
            id=uuid.UUID(str(r["id"])),
            website_id=uuid.UUID(str(r["website_id"])) if r.get("website_id") else None,
            scan_id=uuid.UUID(str(r["scan_id"])) if r.get("scan_id") else None,
            report_type=r["report_type"],
            format=r["format"],
            file_path=r["file_path"],
            generated_by=uuid.UUID(str(r["generated_by"])),
            created_at=r["created_at"],
            download_url=f"/api/v1/reports/{r['id']}/download"
        ))
    return reports


@router.get(
    "/{report_id}/download",
    summary="Download a generated report file",
)
async def download_report(
    report_id: str,
    current_user: dict = Depends(get_current_user),
) -> Response:
    """Stream a report file for download."""
    report = await db_service.get_report(report_id, current_user["sub"])
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found.",
        )

    file_path = report["file_path"]
    fmt = report["format"]
    report_type = report["report_type"]
    
    if not os.path.exists(file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report file not found on disk. It may have been deleted.",
        )

    media_type = "application/pdf" if fmt == "pdf" else "text/csv"
    filename = f"threat_report_{report_type}.{fmt}"

    with open(file_path, "rb") as f:
        content = f.read()

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

