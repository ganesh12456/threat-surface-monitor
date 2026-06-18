"""
app/services/google_sheets.py
Async Google Sheets integration for syncing scan results and findings.
"""
import json
import logging
from datetime import datetime, timezone
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)


class GoogleSheetsService:
    """
    Google Sheets integration for appending scan results and findings.

    Requires GOOGLE_SHEETS_SPREADSHEET_ID and GOOGLE_SHEETS_CREDENTIALS_JSON
    to be configured in settings. Gracefully skips if not configured.

    The service account in the credentials JSON must have editor access
    to the target spreadsheet.
    """

    def __init__(self) -> None:
        self._spreadsheet_id = settings.GOOGLE_SHEETS_SPREADSHEET_ID
        self._credentials_json = settings.GOOGLE_SHEETS_CREDENTIALS_JSON
        self._configured = bool(self._spreadsheet_id and self._credentials_json)
        self._service: Any = None

    def _get_service(self) -> Any:
        """
        Lazily initialise the Google Sheets API service client.

        Returns:
            Google Sheets API service resource, or None if not configured.
        """
        if not self._configured:
            return None
        if self._service:
            return self._service

        try:
            import google.auth  # noqa: F401
            from google.oauth2.service_account import Credentials
            from googleapiclient.discovery import build

            creds_dict = json.loads(self._credentials_json)
            credentials = Credentials.from_service_account_info(
                creds_dict,
                scopes=["https://www.googleapis.com/auth/spreadsheets"],
            )
            self._service = build("sheets", "v4", credentials=credentials, cache_discovery=False)
            logger.info("Google Sheets service initialised successfully.")
            return self._service
        except json.JSONDecodeError as exc:
            logger.error("GOOGLE_SHEETS_CREDENTIALS_JSON is not valid JSON: %s", exc)
            return None
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to initialise Google Sheets service: %s", exc)
            return None

    async def sync_scan_results(self, scan_result: dict[str, Any]) -> bool:
        """
        Append a scan result row to the 'Scans' sheet.

        Columns: Date | Website | Score | Grade | Critical | High | Medium | Low | Info | Scan ID

        Args:
            scan_result: Scan result dict from the orchestrator.

        Returns:
            True on success, False on skip/failure.
        """
        if not self._configured:
            logger.debug("Google Sheets sync skipped — not configured.")
            return False

        import asyncio

        url = scan_result.get("url", "")
        score = scan_result.get("score", 0.0)
        grade = scan_result.get("grade", "N/A")
        findings = scan_result.get("findings", [])
        scan_id = scan_result.get("scan_id", "")
        scan_date = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

        from collections import Counter
        counts = Counter(f.get("severity", "informational") for f in findings)

        row = [[
            scan_date,
            url,
            f"{score:.1f}",
            grade,
            str(counts.get("critical", 0)),
            str(counts.get("high", 0)),
            str(counts.get("medium", 0)),
            str(counts.get("low", 0)),
            str(counts.get("informational", 0)),
            scan_id,
        ]]

        try:
            result = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: self._append_rows("Scans!A:J", row),
            )
            logger.info("Google Sheets: appended scan result for %s (score %.1f)", url, score)
            return bool(result)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Google Sheets sync_scan_results failed: %s", exc)
            return False

    async def sync_findings(
        self,
        findings: list[dict[str, Any]],
        website_url: str,
    ) -> bool:
        """
        Append individual findings to the 'Findings' sheet.

        Columns: Date | Website | Severity | Category | Title | Affected URL | Remediation

        Args:
            findings: List of finding dicts.
            website_url: The scanned website URL.

        Returns:
            True on success, False on skip/failure.
        """
        if not self._configured:
            logger.debug("Google Sheets findings sync skipped — not configured.")
            return False

        import asyncio

        scan_date = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        rows = [
            [
                scan_date,
                website_url,
                f.get("severity", "informational"),
                f.get("category", ""),
                f.get("title", "")[:200],
                f.get("affected_url", "")[:200],
                (f.get("remediation", "") or "")[:300],
            ]
            for f in findings
        ]

        if not rows:
            return True

        try:
            result = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: self._append_rows("Findings!A:G", rows),
            )
            logger.info(
                "Google Sheets: appended %d findings for %s", len(rows), website_url
            )
            return bool(result)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Google Sheets sync_findings failed: %s", exc)
            return False

    def _append_rows(self, range_: str, rows: list[list[str]]) -> dict | None:
        """
        Synchronous helper (run in executor) that calls the Sheets API.

        Args:
            range_: Sheet range in A1 notation, e.g. 'Scans!A:J'.
            rows: List of row value lists.

        Returns:
            API response dict or None on error.
        """
        service = self._get_service()
        if not service:
            return None

        body = {"values": rows}
        result = (
            service.spreadsheets()
            .values()
            .append(
                spreadsheetId=self._spreadsheet_id,
                range=range_,
                valueInputOption="USER_ENTERED",
                insertDataOption="INSERT_ROWS",
                body=body,
            )
            .execute()
        )
        return result
