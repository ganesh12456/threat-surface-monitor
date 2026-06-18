"""
app/core/supabase.py
Supabase Client SDK interface with a robust in-memory RAM database fallback.
Bypasses local PostgreSQL database completely.
"""
import logging
import uuid
from datetime import datetime, date, timezone
from typing import Any

from supabase import create_client, Client
from app.core.config import settings

logger = logging.getLogger(__name__)

# Initialize client if configured
supabase_url = settings.SUPABASE_URL
supabase_key = settings.SUPABASE_PUBLISHABLE_KEY

is_supabase_configured = False

supabase: Client = None
if supabase_url and supabase_key:
    try:
        supabase = create_client(supabase_url, supabase_key)
        is_supabase_configured = True
        logger.info("Supabase client initialised successfully (using Publishable Key).")
    except Exception as exc:
        logger.warning("Failed to initialize Supabase client: %s. Falling back to mock mode.", exc)

# ---------------------------------------------------------------------------
# In-Memory RAM Store (persists while the server is running)
# ---------------------------------------------------------------------------
_users = {}             # id -> user dict
_websites = {}          # id -> website dict
_scans = {}             # id -> scan dict
_findings = {}          # id -> finding dict
_risk_scores = {}       # id -> risk_score dict
_recommendations = {}   # id -> recommendation dict
_wordpress_data = {}    # id -> wp dict
_cloudflare_data = {}   # id -> cf dict
_historical_scans = {}  # id -> historical_scan dict
_alerts = {}            # id -> alert dict
_reports = {}           # id -> report dict


# Pre-seed the default demo user
from app.core.security import hash_password
_demo_user_id = "00000000-0000-0000-0000-000000000000"
_users[_demo_user_id] = {
    "id": _demo_user_id,
    "email": "demo@threatmonitor.io",
    "hashed_password": hash_password("demo1234"),
    "full_name": "Demo User",
    "role": "admin",
    "is_active": True,
    "created_at": datetime.now(timezone.utc),
    "updated_at": datetime.now(timezone.utc),
}

# ---------------------------------------------------------------------------
# Core DB functions
# ---------------------------------------------------------------------------

def _convert_dates(data: Any) -> Any:
    """Helper to convert dates, datetimes, and UUIDs to string for JSON serialization."""
    if isinstance(data, dict):
        return {k: _convert_dates(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [_convert_dates(x) for x in data]
    elif isinstance(data, (datetime, date)):
        return data.isoformat()
    elif isinstance(data, uuid.UUID):
        return str(data)
    return data

# --- Users ---

async def get_user_by_email(email: str) -> dict | None:
    if supabase:
        try:
            res = supabase.table("users").select("*").eq("email", email).execute()
            return res.data[0] if res.data else None
        except Exception as exc:
            logger.warning("Supabase get_user_by_email failed: %s. Using RAM store.", exc)
    
    for u in _users.values():
        if u["email"] == email:
            return u
    return None

async def get_user_by_id(user_id: str) -> dict | None:
    if supabase:
        try:
            res = supabase.table("users").select("*").eq("id", user_id).execute()
            return res.data[0] if res.data else None
        except Exception as exc:
            logger.warning("Supabase get_user_by_id failed: %s. Using RAM store.", exc)
            
    return _users.get(str(user_id))

async def create_user(user_data: dict) -> dict:
    serialized = _convert_dates(user_data)
    if supabase:
        try:
            res = supabase.table("users").insert(serialized).execute()
            if res.data:
                return res.data[0]
        except Exception as exc:
            logger.warning("Supabase create_user failed: %s. Using RAM store.", exc)
            
    _users[str(user_data["id"])] = user_data
    return user_data

# --- Websites ---

async def list_websites(user_id: str) -> list[dict]:
    if supabase:
        try:
            res = supabase.table("websites").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
            return res.data
        except Exception as exc:
            logger.warning("Supabase list_websites failed: %s. Using RAM store.", exc)
            
    return [w for w in _websites.values() if str(w["user_id"]) == str(user_id)]

async def get_website(website_id: str, user_id: str) -> dict | None:
    if supabase:
        try:
            res = supabase.table("websites").select("*").eq("id", website_id).eq("user_id", user_id).execute()
            return res.data[0] if res.data else None
        except Exception as exc:
            logger.warning("Supabase get_website failed: %s. Using RAM store.", exc)
            
    w = _websites.get(str(website_id))
    if w and str(w["user_id"]) == str(user_id):
        return w
    return None


async def get_website_by_id(website_id: str) -> dict | None:
    if supabase:
        try:
            res = supabase.table("websites").select("*").eq("id", website_id).execute()
            return res.data[0] if res.data else None
        except Exception as exc:
            logger.warning("Supabase get_website_by_id failed: %s. Using RAM store.", exc)
            
    return _websites.get(str(website_id))

async def create_website(website_data: dict) -> dict:
    serialized = _convert_dates(website_data)
    if supabase:
        try:
            res = supabase.table("websites").insert(serialized).execute()
            if res.data:
                return res.data[0]
        except Exception as exc:
            logger.warning("Supabase create_website failed: %s. Using RAM store.", exc)
            
    _websites[str(website_data["id"])] = website_data
    return website_data

async def update_website(website_id: str, updates: dict) -> dict | None:
    serialized = _convert_dates(updates)
    if supabase:
        try:
            res = supabase.table("websites").update(serialized).eq("id", website_id).execute()
            if res.data:
                return res.data[0]
        except Exception as exc:
            logger.warning("Supabase update_website failed: %s. Using RAM store.", exc)
            
    w = _websites.get(str(website_id))
    if w:
        w.update(updates)
        return w
    return None

async def delete_website(website_id: str) -> bool:
    if supabase:
        try:
            supabase.table("websites").delete().eq("id", website_id).execute()
            return True
        except Exception as exc:
            logger.warning("Supabase delete_website failed: %s. Using RAM store.", exc)
            
    # Cascade delete in RAM
    if str(website_id) in _websites:
        del _websites[str(website_id)]
        
        # Scans
        scan_ids = [s_id for s_id, s in _scans.items() if str(s["website_id"]) == str(website_id)]
        for s_id in scan_ids:
            if s_id in _scans:
                del _scans[s_id]
            # Findings
            for f_id in list(_findings.keys()):
                if str(_findings[f_id]["scan_id"]) == s_id:
                    del _findings[f_id]
            # Risk scores
            for r_id in list(_risk_scores.keys()):
                if str(_risk_scores[r_id]["scan_id"]) == s_id:
                    del _risk_scores[r_id]
            # Recommendations
            for rec_id in list(_recommendations.keys()):
                if str(_recommendations[rec_id]["scan_id"]) == s_id:
                    del _recommendations[rec_id]
            # WP Data
            for wp_id in list(_wordpress_data.keys()):
                if str(_wordpress_data[wp_id]["scan_id"]) == s_id:
                    del _wordpress_data[wp_id]
            # CF Data
            for cf_id in list(_cloudflare_data.keys()):
                if str(_cloudflare_data[cf_id]["scan_id"]) == s_id:
                    del _cloudflare_data[cf_id]
                    
        # Historical Scans
        for h_id in list(_historical_scans.keys()):
            if str(_historical_scans[h_id]["website_id"]) == str(website_id):
                del _historical_scans[h_id]
        # Alerts
        for a_id in list(_alerts.keys()):
            if str(_alerts[a_id]["website_id"]) == str(website_id):
                del _alerts[a_id]
        return True
    return False

# --- Scans ---

async def create_scan(scan_data: dict) -> dict:
    serialized = _convert_dates(scan_data)
    if supabase:
        try:
            res = supabase.table("scans").insert(serialized).execute()
            if res.data:
                return res.data[0]
        except Exception as exc:
            logger.warning("Supabase create_scan failed: %s. Using RAM store.", exc)
            
    _scans[str(scan_data["id"])] = scan_data
    return scan_data

async def update_scan(scan_id: str, updates: dict) -> dict | None:
    serialized = _convert_dates(updates)
    if supabase:
        try:
            res = supabase.table("scans").update(serialized).eq("id", scan_id).execute()
            if res.data:
                return res.data[0]
        except Exception as exc:
            logger.warning("Supabase update_scan failed: %s. Using RAM store.", exc)
            
    s = _scans.get(str(scan_id))
    if s:
        s.update(updates)
        return s
    return None

async def get_scan(scan_id: str) -> dict | None:
    if supabase:
        try:
            res = supabase.table("scans").select("*").eq("id", scan_id).execute()
            return res.data[0] if res.data else None
        except Exception as exc:
            logger.warning("Supabase get_scan failed: %s. Using RAM store.", exc)
            
    return _scans.get(str(scan_id))

async def list_scans_by_website(website_id: str) -> list[dict]:
    if supabase:
        try:
            res = supabase.table("scans").select("*").eq("website_id", website_id).order("created_at", desc=True).execute()
            return res.data
        except Exception as exc:
            logger.warning("Supabase list_scans_by_website failed: %s. Using RAM store.", exc)
            
    return [s for s in _scans.values() if str(s["website_id"]) == str(website_id)]

async def get_latest_completed_scan(website_id: str) -> dict | None:
    if supabase:
        try:
            res = supabase.table("scans").select("*").eq("website_id", website_id).eq("status", "completed").order("created_at", desc=True).limit(1).execute()
            return res.data[0] if res.data else None
        except Exception as exc:
            logger.warning("Supabase get_latest_completed_scan failed: %s. Using RAM store.", exc)
            
    scans = [s for s in _scans.values() if str(s["website_id"]) == str(website_id) and s.get("status") == "completed"]
    if not scans:
        return None
    scans.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return scans[0]

# --- Findings ---

async def create_findings(findings_list: list[dict]) -> list[dict]:
    serialized = _convert_dates(findings_list)
    if supabase:
        try:
            res = supabase.table("findings").insert(serialized).execute()
            if res.data:
                return res.data
        except Exception as exc:
            logger.warning("Supabase create_findings failed: %s. Using RAM store.", exc)
            
    for f in findings_list:
        _findings[str(f["id"])] = f
    return findings_list

async def list_findings_by_website(website_id: str, severity: str | None = None) -> list[dict]:
    if supabase:
        try:
            q = supabase.table("findings").select("*").eq("website_id", website_id)
            if severity:
                q = q.eq("severity", severity)
            res = q.execute()
            return res.data
        except Exception as exc:
            logger.warning("Supabase list_findings_by_website failed: %s. Using RAM store.", exc)
            
    res = [f for f in _findings.values() if str(f["website_id"]) == str(website_id)]
    if severity:
        res = [f for f in res if f.get("severity") == severity]
    return res

async def list_findings_by_scan(scan_id: str) -> list[dict]:
    if supabase:
        try:
            res = supabase.table("findings").select("*").eq("scan_id", scan_id).execute()
            return res.data
        except Exception as exc:
            logger.warning("Supabase list_findings_by_scan failed: %s. Using RAM store.", exc)
            
    return [f for f in _findings.values() if str(f["scan_id"]) == str(scan_id)]

async def get_latest_finding_counts(website_id: str) -> dict[str, int]:
    """Return finding counts by severity from the latest completed scan of the website."""
    scan = await get_latest_completed_scan(website_id)
    if not scan:
        return {}
    findings = await list_findings_by_scan(scan["id"])
    counts = {}
    for f in findings:
        sev = f.get("severity")
        if sev:
            counts[sev] = counts.get(sev, 0) + 1
    return counts

# --- Risk Scores ---

async def create_risk_score(risk_score_data: dict) -> dict:
    serialized = _convert_dates(risk_score_data)
    if supabase:
        try:
            res = supabase.table("risk_scores").insert(serialized).execute()
            if res.data:
                return res.data[0]
        except Exception as exc:
            logger.warning("Supabase create_risk_score failed: %s. Using RAM store.", exc)
            
    _risk_scores[str(risk_score_data["id"])] = risk_score_data
    return risk_score_data

async def get_latest_risk_score(website_id: str) -> dict | None:
    if supabase:
        try:
            res = supabase.table("risk_scores").select("*").eq("website_id", website_id).order("created_at", desc=True).limit(1).execute()
            return res.data[0] if res.data else None
        except Exception as exc:
            logger.warning("Supabase get_latest_risk_score failed: %s. Using RAM store.", exc)
            
    scores = [s for s in _risk_scores.values() if str(s["website_id"]) == str(website_id)]
    if not scores:
        return None
    scores.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return scores[0]

# --- Recommendations ---

async def create_recommendations(rec_data: dict) -> dict:
    serialized = _convert_dates(rec_data)
    if supabase:
        try:
            res = supabase.table("recommendations").insert(serialized).execute()
            if res.data:
                return res.data[0]
        except Exception as exc:
            logger.warning("Supabase create_recommendations failed: %s. Using RAM store.", exc)
            
    _recommendations[str(rec_data["id"])] = rec_data
    return rec_data

async def get_recommendations(website_id: str) -> dict | None:
    if supabase:
        try:
            res = supabase.table("recommendations").select("*").eq("website_id", website_id).order("created_at", desc=True).limit(1).execute()
            return res.data[0] if res.data else None
        except Exception as exc:
            logger.warning("Supabase get_recommendations failed: %s. Using RAM store.", exc)
            
    recs = [r for r in _recommendations.values() if str(r["website_id"]) == str(website_id)]
    if not recs:
        return None
    recs.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return recs[0]

# --- WordPress Data ---

async def create_wordpress_data(wp_data: dict) -> dict:
    serialized = _convert_dates(wp_data)
    if supabase:
        try:
            res = supabase.table("wordpress_data").insert(serialized).execute()
            if res.data:
                return res.data[0]
        except Exception as exc:
            logger.warning("Supabase create_wordpress_data failed: %s. Using RAM store.", exc)
            
    _wordpress_data[str(wp_data["id"])] = wp_data
    return wp_data

async def get_wordpress_data(website_id: str) -> dict | None:
    if supabase:
        try:
            res = supabase.table("wordpress_data").select("*").eq("website_id", website_id).order("created_at", desc=True).limit(1).execute()
            return res.data[0] if res.data else None
        except Exception as exc:
            logger.warning("Supabase get_wordpress_data failed: %s. Using RAM store.", exc)
            
    wp = [w for w in _wordpress_data.values() if str(w["website_id"]) == str(website_id)]
    if not wp:
        return None
    wp.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return wp[0]

# --- Cloudflare Data ---

async def create_cloudflare_data(cf_data: dict) -> dict:
    serialized = _convert_dates(cf_data)
    if supabase:
        try:
            res = supabase.table("cloudflare_data").insert(serialized).execute()
            if res.data:
                return res.data[0]
        except Exception as exc:
            logger.warning("Supabase create_cloudflare_data failed: %s. Using RAM store.", exc)
            
    _cloudflare_data[str(cf_data["id"])] = cf_data
    return cf_data

async def get_cloudflare_data(website_id: str) -> dict | None:
    if supabase:
        try:
            res = supabase.table("cloudflare_data").select("*").eq("website_id", website_id).order("created_at", desc=True).limit(1).execute()
            return res.data[0] if res.data else None
        except Exception as exc:
            logger.warning("Supabase get_cloudflare_data failed: %s. Using RAM store.", exc)
            
    cf = [c for c in _cloudflare_data.values() if str(c["website_id"]) == str(website_id)]
    if not cf:
        return None
    cf.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return cf[0]

# --- Historical Scans ---

async def create_historical_scan(hist_data: dict) -> dict:
    serialized = _convert_dates(hist_data)
    if supabase:
        try:
            res = supabase.table("historical_scans").insert(serialized).execute()
            if res.data:
                return res.data[0]
        except Exception as exc:
            logger.warning("Supabase create_historical_scan failed: %s. Using RAM store.", exc)
            
    _historical_scans[str(hist_data["id"])] = hist_data
    return hist_data

async def list_historical_scans(website_id: str, days: int = 30) -> list[dict]:
    if supabase:
        try:
            # Query historical scans for the website
            res = supabase.table("historical_scans").select("*").eq("website_id", website_id).order("scan_date", desc=False).execute()
            # Filter manually or by date if possible
            # Postgrest doesn't easily support raw intervals, so we select recent rows
            return res.data
        except Exception as exc:
            logger.warning("Supabase list_historical_scans failed: %s. Using RAM store.", exc)
            
    return [h for h in _historical_scans.values() if str(h["website_id"]) == str(website_id)]

# --- Alerts ---

async def create_alert(alert_data: dict) -> dict:
    serialized = _convert_dates(alert_data)
    if supabase:
        try:
            res = supabase.table("alerts").insert(serialized).execute()
            if res.data:
                return res.data[0]
        except Exception as exc:
            logger.warning("Supabase create_alert failed: %s. Using RAM store.", exc)
            
    _alerts[str(alert_data["id"])] = alert_data
    return alert_data

async def list_alerts(user_id: str) -> list[dict]:
    if supabase:
        try:
            # Postgrest join: select alerts for user's websites
            res = supabase.table("alerts").select("*, websites!inner(user_id)").eq("websites.user_id", user_id).execute()
            # Clean up the embedded object
            alerts_list = []
            for r in res.data:
                alert_copy = r.copy()
                if "websites" in alert_copy:
                    del alert_copy["websites"]
                alerts_list.append(alert_copy)
            return alerts_list
        except Exception as exc:
            logger.warning("Supabase list_alerts failed: %s. Using RAM store.", exc)
            
    # RAM fallback: join with websites
    user_website_ids = {str(w["id"]) for w in _websites.values() if str(w["user_id"]) == str(user_id)}
    return [a for a in _alerts.values() if str(a["website_id"]) in user_website_ids]

async def update_alert(alert_id: str, updates: dict) -> dict | None:
    serialized = _convert_dates(updates)
    if supabase:
        try:
            res = supabase.table("alerts").update(serialized).eq("id", alert_id).execute()
            if res.data:
                return res.data[0]
        except Exception as exc:
            logger.warning("Supabase update_alert failed: %s. Using RAM store.", exc)
            
    a = _alerts.get(str(alert_id))
    if a:
        a.update(updates)
        return a
    return None

async def delete_alert(alert_id: str) -> bool:
    if supabase:
        try:
            supabase.table("alerts").delete().eq("id", alert_id).execute()
            return True
        except Exception as exc:
            logger.warning("Supabase delete_alert failed: %s. Using RAM store.", exc)
            
    if str(alert_id) in _alerts:
        del _alerts[str(alert_id)]
        return True
    return False


# --- Custom Scan details ---

async def get_risk_score_by_scan(scan_id: str) -> dict | None:
    if supabase:
        try:
            res = supabase.table("risk_scores").select("*").eq("scan_id", scan_id).order("created_at", desc=True).limit(1).execute()
            return res.data[0] if res.data else None
        except Exception as exc:
            logger.warning("Supabase get_risk_score_by_scan failed: %s. Using RAM store.", exc)
    for r in _risk_scores.values():
        if str(r.get("scan_id")) == str(scan_id):
            return r
    return None

async def get_recommendation_by_scan(scan_id: str) -> dict | None:
    if supabase:
        try:
            res = supabase.table("recommendations").select("*").eq("scan_id", scan_id).limit(1).execute()
            return res.data[0] if res.data else None
        except Exception as exc:
            logger.warning("Supabase get_recommendation_by_scan failed: %s. Using RAM store.", exc)
    for r in _recommendations.values():
        if str(r.get("scan_id")) == str(scan_id):
            return r
    return None

async def list_scans(user_id: str, status: str | None = None, website_id: str | None = None, limit: int = 50, skip: int = 0) -> list[dict]:
    if supabase:
        try:
            q = supabase.table("scans").select("*, websites!inner(user_id)").eq("websites.user_id", user_id)
            if website_id:
                q = q.eq("website_id", website_id)
            if status:
                q = q.eq("status", status)
            res = q.order("created_at", desc=True).range(skip, skip + limit - 1).execute()
            scans_list = []
            for r in res.data:
                copy_s = r.copy()
                if "websites" in copy_s:
                    del copy_s["websites"]
                scans_list.append(copy_s)
            return scans_list
        except Exception as exc:
            logger.warning("Supabase list_scans failed: %s. Using RAM store.", exc)
            
    website_ids = {str(w["id"]) for w in _websites.values() if str(w["user_id"]) == str(user_id)}
    res = [s for s in _scans.values() if str(s["website_id"]) in website_ids]
    if website_id:
        res = [s for s in res if str(s["website_id"]) == str(website_id)]
    if status:
        res = [s for s in res if s.get("status") == status]
    res.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return res[skip : skip + limit]


async def list_findings_across_websites(
    user_id: str,
    website_id: str | None = None,
    scan_id: str | None = None,
    severity: str | None = None,
    category: str | None = None,
    is_new: bool | None = None,
    is_fixed: bool | None = None,
    limit: int = 50,
    skip: int = 0
) -> list[dict]:
    if supabase:
        try:
            q = supabase.table("findings").select("*, websites!inner(user_id)").eq("websites.user_id", user_id)
            if website_id:
                q = q.eq("website_id", website_id)
            if scan_id:
                q = q.eq("scan_id", scan_id)
            if severity:
                q = q.eq("severity", severity)
            if category:
                q = q.ilike("category", f"%{category}%")
            if is_new is not None:
                q = q.eq("is_new", is_new)
            if is_fixed is not None:
                q = q.eq("is_fixed", is_fixed)
            
            res = q.execute()
            findings_list = []
            for r in res.data:
                copy_f = r.copy()
                if "websites" in copy_f:
                    del copy_f["websites"]
                findings_list.append(copy_f)
                
            severity_order = {"critical": 1, "high": 2, "medium": 3, "low": 4, "informational": 5}
            findings_list.sort(key=lambda x: (severity_order.get(x.get("severity", "informational"), 6), x.get("created_at", "")), reverse=True)
            
            return findings_list[skip : skip + limit]
        except Exception as exc:
            logger.warning("Supabase list_findings_across_websites failed: %s. Using RAM store.", exc)
            
    user_website_ids = {str(w["id"]) for w in _websites.values() if str(w["user_id"]) == str(user_id)}
    res = [f for f in _findings.values() if str(f["website_id"]) in user_website_ids]
    if website_id:
        res = [f for f in res if str(f["website_id"]) == str(website_id)]
    if scan_id:
        res = [f for f in res if str(f["scan_id"]) == str(scan_id)]
    if severity:
        res = [f for f in res if f.get("severity") == severity]
    if category:
        res = [f for f in res if category.lower() in f.get("category", "").lower()]
    if is_new is not None:
        res = [f for f in res if f.get("is_new") == is_new]
    if is_fixed is not None:
        res = [f for f in res if f.get("is_fixed") == is_fixed]
        
    severity_order = {"critical": 1, "high": 2, "medium": 3, "low": 4, "informational": 5}
    res.sort(key=lambda x: (severity_order.get(x.get("severity", "informational"), 6), x.get("created_at", "")), reverse=True)
    
    return res[skip : skip + limit]


async def create_report(report_data: dict) -> dict:
    serialized = _convert_dates(report_data)
    if supabase:
        try:
            res = supabase.table("reports").insert(serialized).execute()
            if res.data:
                return res.data[0]
        except Exception as exc:
            logger.warning("Supabase create_report failed: %s. Using RAM store.", exc)
    _reports[str(report_data["id"])] = report_data
    return report_data


async def list_reports(user_id: str, website_id: str | None = None, limit: int = 50, skip: int = 0) -> list[dict]:
    if supabase:
        try:
            q = supabase.table("reports").select("*").eq("generated_by", user_id)
            if website_id:
                q = q.eq("website_id", website_id)
            res = q.order("created_at", desc=True).range(skip, skip + limit - 1).execute()
            return res.data
        except Exception as exc:
            logger.warning("Supabase list_reports failed: %s. Using RAM store.", exc)
    res = [r for r in _reports.values() if str(r.get("generated_by")) == str(user_id)]
    if website_id:
        res = [r for r in res if str(r.get("website_id")) == str(website_id)]
    res.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return res[skip : skip + limit]


async def get_report(report_id: str, user_id: str) -> dict | None:
    if supabase:
        try:
            res = supabase.table("reports").select("*").eq("id", report_id).eq("generated_by", user_id).execute()
            return res.data[0] if res.data else None
        except Exception as exc:
            logger.warning("Supabase get_report failed: %s. Using RAM store.", exc)
    r = _reports.get(str(report_id))
    if r and str(r.get("generated_by")) == str(user_id):
        return r
    return None



