"""
app/services/notifications.py
Async notification delivery: email (aiosmtplib), Slack, Discord webhooks.
"""
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

import aiohttp
import aiosmtplib

from app.core.config import settings

logger = logging.getLogger(__name__)


async def send_email_alert(
    to: str,
    subject: str,
    body: str,
    html_body: str | None = None,
) -> bool:
    """
    Send an email alert via SMTP using aiosmtplib.

    Args:
        to: Recipient email address.
        subject: Email subject line.
        body: Plain-text email body.
        html_body: Optional HTML body for rich email clients.

    Returns:
        True on success, False on failure.
    """
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.warning("Email alert skipped — SMTP_USER or SMTP_PASSWORD not configured.")
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = settings.SMTP_USER
        msg["To"] = to

        msg.attach(MIMEText(body, "plain"))
        if html_body:
            msg.attach(MIMEText(html_body, "html"))

        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            start_tls=True,
        )
        logger.info("Email alert sent to %s: %s", to, subject)
        return True

    except aiosmtplib.SMTPException as exc:
        logger.error("SMTP error sending alert to %s: %s", to, exc)
        return False
    except Exception as exc:  # noqa: BLE001
        logger.error("Unexpected error sending email to %s: %s", to, exc)
        return False


async def send_slack_alert(message: str, webhook_url: str | None = None) -> bool:
    """
    Send a message to a Slack channel via incoming webhook.

    Args:
        message: Plain text or Slack mrkdwn-formatted message.
        webhook_url: Slack webhook URL. Uses SLACK_WEBHOOK_URL from settings if not provided.

    Returns:
        True on success, False on failure.
    """
    url = webhook_url or settings.SLACK_WEBHOOK_URL
    if not url:
        logger.debug("Slack alert skipped — SLACK_WEBHOOK_URL not configured.")
        return False

    try:
        async with aiohttp.ClientSession() as session:
            payload = {"text": message}
            async with session.post(
                url,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status == 200:
                    logger.info("Slack alert sent successfully.")
                    return True
                else:
                    text = await resp.text()
                    logger.warning("Slack webhook returned HTTP %d: %s", resp.status, text)
                    return False
    except aiohttp.ClientConnectorError as exc:
        logger.error("Slack webhook connection failed: %s", exc)
        return False
    except Exception as exc:  # noqa: BLE001
        logger.error("Slack alert error: %s", exc)
        return False


async def send_discord_alert(message: str, webhook_url: str | None = None) -> bool:
    """
    Send a message to a Discord channel via webhook.

    Args:
        message: Message content (up to 2000 characters).
        webhook_url: Discord webhook URL. Uses DISCORD_WEBHOOK_URL from settings if not provided.

    Returns:
        True on success, False on failure.
    """
    url = webhook_url or settings.DISCORD_WEBHOOK_URL
    if not url:
        logger.debug("Discord alert skipped — DISCORD_WEBHOOK_URL not configured.")
        return False

    try:
        async with aiohttp.ClientSession() as session:
            payload = {"content": message[:2000]}
            async with session.post(
                url,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status in (200, 204):
                    logger.info("Discord alert sent successfully.")
                    return True
                else:
                    text = await resp.text()
                    logger.warning("Discord webhook returned HTTP %d: %s", resp.status, text)
                    return False
    except aiohttp.ClientConnectorError as exc:
        logger.error("Discord webhook connection failed: %s", exc)
        return False
    except Exception as exc:  # noqa: BLE001
        logger.error("Discord alert error: %s", exc)
        return False


async def notify_critical_finding(
    website_url: str,
    finding: dict[str, Any],
) -> None:
    """
    Broadcast a critical finding notification to all configured channels.

    Args:
        website_url: The scanned website URL.
        finding: The critical finding dict (must contain 'title', 'severity', 'description').
    """
    title = finding.get("title", "Unknown Vulnerability")
    severity = finding.get("severity", "critical").upper()
    affected = finding.get("affected_url", website_url)
    description = finding.get("description", "No details available.")[:400]

    message = (
        f"🚨 *CRITICAL SECURITY ALERT* — {website_url}\n"
        f"*Severity:* {severity}\n"
        f"*Finding:* {title}\n"
        f"*Affected URL:* {affected}\n"
        f"*Details:* {description}"
    )

    # Fire all channels concurrently — errors are logged but do not propagate
    import asyncio
    await asyncio.gather(
        send_slack_alert(message),
        send_discord_alert(message),
        return_exceptions=True,
    )

    # Email notification (if SMTP admin user is configured)
    if settings.SMTP_USER:
        email_body = (
            f"CRITICAL SECURITY FINDING DETECTED\n\n"
            f"Website: {website_url}\n"
            f"Severity: {severity}\n"
            f"Finding: {title}\n"
            f"Affected URL: {affected}\n\n"
            f"Details:\n{description}\n\n"
            f"Please log in to the Threat Surface Monitor dashboard to review and remediate."
        )
        await send_email_alert(
            to=settings.SMTP_USER,
            subject=f"[CRITICAL] Security Alert: {title} — {website_url}",
            body=email_body,
        )


async def notify_scan_complete(
    website_url: str,
    score: float,
    grade: str,
    finding_counts: dict[str, int] | None = None,
) -> None:
    """
    Send a scan completion summary notification to all configured channels.

    Args:
        website_url: The scanned website URL.
        score: Calculated risk score (0–100).
        grade: Letter grade (A–F).
        finding_counts: Optional dict of severity -> count.
    """
    counts = finding_counts or {}
    grade_emoji = {"A": "✅", "B": "🟡", "C": "🟠", "D": "🔴", "F": "💀"}.get(grade, "📊")

    message = (
        f"{grade_emoji} *Scan Complete* — {website_url}\n"
        f"*Risk Score:* {score:.1f}/100  |  *Grade:* {grade}\n"
        f"*Findings:* "
        f"🔴 {counts.get('critical', 0)} critical  "
        f"🟠 {counts.get('high', 0)} high  "
        f"🟡 {counts.get('medium', 0)} medium  "
        f"🟢 {counts.get('low', 0)} low"
    )

    import asyncio
    await asyncio.gather(
        send_slack_alert(message),
        send_discord_alert(message),
        return_exceptions=True,
    )
