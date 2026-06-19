import logging
import uuid
import asyncio
from datetime import datetime, timezone
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.core import supabase as db_service
from app.core.supabase import supabase, _websites
from app.tasks.background import run_website_scan

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()

async def list_all_websites_global() -> list[dict]:
    """Fetch all websites globally across all users for scheduling scans."""
    return await db_service.list_all_websites_global()

async def trigger_scheduled_scan(website_id: str, url: str) -> None:
    """Trigger a scheduled scan task in the background."""
    scan_id = str(uuid.uuid4())
    logger.info("Triggering scheduled scan — website_id=%s url=%s scan_id=%s", website_id, url, scan_id)
    
    # Create the scan entry in the database
    now = datetime.now(timezone.utc)
    scan_data = {
        "id": scan_id,
        "website_id": website_id,
        "status": "pending",
        "pipeline_stage": "initializing",
        "started_at": now,
        "created_at": now,
    }
    try:
        await db_service.create_scan(scan_data)
        # Execute the scan task asynchronously
        asyncio.create_task(run_website_scan(scan_id=scan_id, website_id=website_id, url=url))
    except Exception as exc:
        logger.error("Failed to trigger scheduled scan for website %s: %s", website_id, exc)

async def _load_and_schedule_jobs() -> None:
    logger.info("Loading websites for APScheduler...")
    websites = await list_all_websites_global()
    scheduled_count = 0
    
    for w in websites:
        if not w.get("is_active", True):
            continue
            
        freq = w.get("scan_frequency", "daily").lower()
        w_id = str(w["id"])
        url = w["url"]
        
        # Schedule based on frequency
        if freq == "daily":
            scheduler.add_job(
                trigger_scheduled_scan,
                "interval",
                hours=24,
                args=[w_id, url],
                id=f"scan_{w_id}",
                replace_existing=True
            )
            scheduled_count += 1
        elif freq == "weekly":
            scheduler.add_job(
                trigger_scheduled_scan,
                "interval",
                weeks=1,
                args=[w_id, url],
                id=f"scan_{w_id}",
                replace_existing=True
            )
            scheduled_count += 1
        elif freq == "monthly":
            scheduler.add_job(
                trigger_scheduled_scan,
                "interval",
                days=30,
                args=[w_id, url],
                id=f"scan_{w_id}",
                replace_existing=True
            )
            scheduled_count += 1
            
    logger.info("APScheduler initialized: scheduled %d websites", scheduled_count)

def schedule_website_jobs() -> None:
    """Query all websites and schedule scan jobs based on their frequency."""
    if scheduler.running:
        scheduler.remove_all_jobs()
        # Schedule reload in async task
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(_load_and_schedule_jobs())
        except RuntimeError:
            asyncio.run(_load_and_schedule_jobs())

def start_scheduler() -> None:
    if not scheduler.running:
        scheduler.start()
        logger.info("APScheduler started.")
        schedule_website_jobs()

def shutdown_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown()
        logger.info("APScheduler shutdown.")
