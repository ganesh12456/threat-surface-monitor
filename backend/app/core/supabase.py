"""
app/core/supabase.py
Direct PostgreSQL connection pool integration using psycopg2.
Bypasses Supabase Client HTTP SDK completely, utilizing direct database connections.
Provides a robust in-memory RAM database fallback when DATABASE_URL is not set or fails.
"""
import os
import sys
import logging
import uuid
import asyncio
import json
from datetime import datetime, date, timezone
from typing import Any

from dotenv import load_dotenv

# Load env variables from backend/.env relative to this file
base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
dotenv_path = os.path.join(base_dir, ".env")
load_dotenv(dotenv_path)

import psycopg2
from psycopg2.pool import ThreadedConnectionPool
from psycopg2.extras import RealDictCursor, Json
from app.core.config import settings

logger = logging.getLogger(__name__)

# Global client interface (mocked for compatibility, will remain None)
supabase = None
is_supabase_configured = False

# Initialize PostgreSQL pool
db_pool = None
is_postgres_configured = False

database_url = os.getenv("DATABASE_URL")
if database_url:
    try:
        # Standardize connection string password characters if necessary
        db_pool = ThreadedConnectionPool(1, 20, dsn=database_url)
        is_postgres_configured = True
        is_supabase_configured = True
        logger.info("PostgreSQL Threaded Connection Pool initialized successfully.")
    except Exception as exc:
        logger.warning("Failed to initialize PostgreSQL pool: %s. Falling back to mock RAM mode.", exc)

# ---------------------------------------------------------------------------
# In-Memory RAM Store (persists while the server is running as fallback)
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
# PostgreSQL Query Helpers
# ---------------------------------------------------------------------------

def _run_query_sync(
    query: str,
    params: tuple = None,
    fetch_one: bool = False,
    fetch_all: bool = False,
    is_update: bool = False
) -> Any:
    if not db_pool:
        raise Exception("PostgreSQL pool is not initialized.")
    
    conn = None
    try:
        conn = db_pool.getconn()
        if conn.closed:
            db_pool.putconn(conn, close=True)
            conn = db_pool.getconn()
            
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params)
            if is_update:
                conn.commit()
                try:
                    if fetch_one:
                        row = cur.fetchone()
                        return dict(row) if row else None
                    if fetch_all:
                        return [dict(r) for r in cur.fetchall()]
                except Exception:
                    return None
                return None
            
            if fetch_one:
                row = cur.fetchone()
                return dict(row) if row else None
            if fetch_all:
                return [dict(r) for r in cur.fetchall()]
                
    except (psycopg2.OperationalError, psycopg2.InterfaceError) as conn_exc:
        logger.warning("Database connection error, retrying: %s", conn_exc)
        if conn:
            try:
                db_pool.putconn(conn, close=True)
            except Exception:
                pass
        
        # Retry logic once
        conn = db_pool.getconn()
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params)
            if is_update:
                conn.commit()
                try:
                    if fetch_one:
                        row = cur.fetchone()
                        return dict(row) if row else None
                    if fetch_all:
                        return [dict(r) for r in cur.fetchall()]
                except Exception:
                    return None
                return None
            if fetch_one:
                row = cur.fetchone()
                return dict(row) if row else None
            if fetch_all:
                return [dict(r) for r in cur.fetchall()]
                
    except Exception as exc:
        if conn:
            conn.rollback()
        raise exc
    finally:
        if conn:
            db_pool.putconn(conn)


async def _execute_query(query: str, params: tuple = None, fetch_one: bool = False, fetch_all: bool = False) -> Any:
    return await asyncio.to_thread(_run_query_sync, query, params, fetch_one, fetch_all, False)


async def _execute_update(query: str, params: tuple = None, fetch_one: bool = False, fetch_all: bool = False) -> Any:
    return await asyncio.to_thread(_run_query_sync, query, params, fetch_one, fetch_all, True)


def _convert_dates(data: Any) -> Any:
    """Helper to convert dates, datetimes, and UUIDs to string for JSON serialization (RAM fallback)."""
    if isinstance(data, dict):
        return {k: _convert_dates(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [_convert_dates(x) for x in data]
    elif isinstance(data, (datetime, date)):
        return data.isoformat()
    elif isinstance(data, uuid.UUID):
        return str(data)
    return data

# ---------------------------------------------------------------------------
# Core DB functions
# ---------------------------------------------------------------------------

# --- Users ---

async def get_user_by_email(email: str) -> dict | None:
    if is_postgres_configured:
        try:
            return await _execute_query(
                "SELECT * FROM users WHERE email = %s",
                (email,),
                fetch_one=True
            )
        except Exception as exc:
            logger.warning("Postgres get_user_by_email failed: %s. Using RAM store.", exc)
    
    for u in _users.values():
        if u["email"] == email:
            return u
    return None

async def get_user_by_id(user_id: str) -> dict | None:
    if is_postgres_configured:
        try:
            return await _execute_query(
                "SELECT * FROM users WHERE id = %s",
                (str(user_id),),
                fetch_one=True
            )
        except Exception as exc:
            logger.warning("Postgres get_user_by_id failed: %s. Using RAM store.", exc)
            
    return _users.get(str(user_id))

async def create_user(user_data: dict) -> dict:
    if is_postgres_configured:
        try:
            query = """
                INSERT INTO users (id, email, hashed_password, full_name, role, is_active, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
            """
            res = await _execute_update(
                query,
                (
                    str(user_data["id"]),
                    user_data["email"],
                    user_data["hashed_password"],
                    user_data.get("full_name"),
                    user_data.get("role", "viewer"),
                    user_data.get("is_active", True),
                    user_data.get("created_at", datetime.now(timezone.utc)),
                    user_data.get("updated_at", datetime.now(timezone.utc)),
                ),
                fetch_one=True
            )
            if res:
                return res
        except Exception as exc:
            logger.warning("Postgres create_user failed: %s. Using RAM store.", exc)
            
    _users[str(user_data["id"])] = user_data
    return user_data

# --- Websites ---

async def list_websites(user_id: str) -> list[dict]:
    if is_postgres_configured:
        try:
            return await _execute_query(
                "SELECT * FROM websites WHERE user_id = %s ORDER BY created_at DESC",
                (str(user_id),),
                fetch_all=True
            )
        except Exception as exc:
            logger.warning("Postgres list_websites failed: %s. Using RAM store.", exc)
            
    return [w for w in _websites.values() if str(w["user_id"]) == str(user_id)]

async def list_all_websites_global() -> list[dict]:
    if is_postgres_configured:
        try:
            return await _execute_query("SELECT * FROM websites", fetch_all=True)
        except Exception as exc:
            logger.warning("Postgres list_all_websites_global failed: %s. Using RAM store.", exc)
    return list(_websites.values())

async def get_website(website_id: str, user_id: str) -> dict | None:
    if is_postgres_configured:
        try:
            return await _execute_query(
                "SELECT * FROM websites WHERE id = %s AND user_id = %s",
                (str(website_id), str(user_id)),
                fetch_one=True
            )
        except Exception as exc:
            logger.warning("Postgres get_website failed: %s. Using RAM store.", exc)
            
    w = _websites.get(str(website_id))
    if w and str(w["user_id"]) == str(user_id):
        return w
    return None

async def get_website_by_id(website_id: str) -> dict | None:
    if is_postgres_configured:
        try:
            return await _execute_query(
                "SELECT * FROM websites WHERE id = %s",
                (str(website_id),),
                fetch_one=True
            )
        except Exception as exc:
            logger.warning("Postgres get_website_by_id failed: %s. Using RAM store.", exc)
            
    return _websites.get(str(website_id))

async def create_website(website_data: dict) -> dict:
    if is_postgres_configured:
        try:
            query = """
                INSERT INTO websites (id, user_id, url, name, description, is_active, scan_frequency, last_scan_at, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
            """
            res = await _execute_update(
                query,
                (
                    str(website_data["id"]),
                    str(website_data["user_id"]) if website_data.get("user_id") else None,
                    website_data["url"],
                    website_data.get("name"),
                    website_data.get("description"),
                    website_data.get("is_active", True),
                    website_data.get("scan_frequency", "daily"),
                    website_data.get("last_scan_at"),
                    website_data.get("created_at", datetime.now(timezone.utc)),
                    website_data.get("updated_at", datetime.now(timezone.utc)),
                ),
                fetch_one=True
            )
            if res:
                return res
        except Exception as exc:
            logger.warning("Postgres create_website failed: %s. Using RAM store.", exc)
            
    _websites[str(website_data["id"])] = website_data
    return website_data

async def update_website(website_id: str, updates: dict) -> dict | None:
    if is_postgres_configured:
        try:
            keys = list(updates.keys())
            if not keys:
                return await get_website_by_id(website_id)
            
            set_clause = ", ".join([f"{k} = %s" for k in keys])
            params = [updates[k] for k in keys]
            params.append(str(website_id))
            
            query = f"UPDATE websites SET {set_clause} WHERE id = %s RETURNING *"
            res = await _execute_update(query, tuple(params), fetch_one=True)
            if res:
                return res
        except Exception as exc:
            logger.warning("Postgres update_website failed: %s. Using RAM store.", exc)
            
    w = _websites.get(str(website_id))
    if w:
        w.update(updates)
        return w
    return None

async def delete_website(website_id: str) -> bool:
    if is_postgres_configured:
        try:
            # Foreign key constraints set up with onDelete: Cascade will delete child items automatically
            await _execute_update("DELETE FROM websites WHERE id = %s", (str(website_id),))
            return True
        except Exception as exc:
            logger.warning("Postgres delete_website failed: %s. Using RAM store.", exc)
            
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
    if is_postgres_configured:
        try:
            query = """
                INSERT INTO scans (id, website_id, status, pipeline_stage, started_at, completed_at, duration_seconds, error_message, scan_metadata, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
            """
            res = await _execute_update(
                query,
                (
                    str(scan_data["id"]),
                    str(scan_data["website_id"]),
                    scan_data.get("status", "pending"),
                    scan_data.get("pipeline_stage"),
                    scan_data.get("started_at"),
                    scan_data.get("completed_at"),
                    scan_data.get("duration_seconds"),
                    scan_data.get("error_message"),
                    Json(scan_data.get("scan_metadata", {})),
                    scan_data.get("created_at", datetime.now(timezone.utc)),
                ),
                fetch_one=True
            )
            if res:
                return res
        except Exception as exc:
            logger.warning("Postgres create_scan failed: %s. Using RAM store.", exc)
            
    _scans[str(scan_data["id"])] = scan_data
    return scan_data

async def update_scan(scan_id: str, updates: dict) -> dict | None:
    if is_postgres_configured:
        try:
            keys = list(updates.keys())
            if not keys:
                return await get_scan(scan_id)
            
            set_clause = ", ".join([f"{k} = %s" for k in keys])
            params = []
            for k in keys:
                val = updates[k]
                if k == "scan_metadata":
                    val = Json(val)
                params.append(val)
            params.append(str(scan_id))
            
            query = f"UPDATE scans SET {set_clause} WHERE id = %s RETURNING *"
            res = await _execute_update(query, tuple(params), fetch_one=True)
            if res:
                return res
        except Exception as exc:
            logger.warning("Postgres update_scan failed: %s. Using RAM store.", exc)
            
    s = _scans.get(str(scan_id))
    if s:
        s.update(updates)
        return s
    return None

async def get_scan(scan_id: str) -> dict | None:
    if is_postgres_configured:
        try:
            return await _execute_query(
                "SELECT * FROM scans WHERE id = %s",
                (str(scan_id),),
                fetch_one=True
            )
        except Exception as exc:
            logger.warning("Postgres get_scan failed: %s. Using RAM store.", exc)
            
    return _scans.get(str(scan_id))

async def list_scans_by_website(website_id: str) -> list[dict]:
    if is_postgres_configured:
        try:
            return await _execute_query(
                "SELECT * FROM scans WHERE website_id = %s ORDER BY created_at DESC",
                (str(website_id),),
                fetch_all=True
            )
        except Exception as exc:
            logger.warning("Postgres list_scans_by_website failed: %s. Using RAM store.", exc)
            
    return [s for s in _scans.values() if str(s["website_id"]) == str(website_id)]

async def get_latest_completed_scan(website_id: str) -> dict | None:
    if is_postgres_configured:
        try:
            return await _execute_query(
                "SELECT * FROM scans WHERE website_id = %s AND status = 'completed' ORDER BY created_at DESC LIMIT 1",
                (str(website_id),),
                fetch_one=True
            )
        except Exception as exc:
            logger.warning("Postgres get_latest_completed_scan failed: %s. Using RAM store.", exc)
            
    scans = [s for s in _scans.values() if str(s["website_id"]) == str(website_id) and s.get("status") == "completed"]
    if not scans:
        return None
    scans.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return scans[0]

# --- Findings ---

async def create_findings(findings_list: list[dict]) -> list[dict]:
    if is_postgres_configured:
        try:
            inserted = []
            for f in findings_list:
                query = """
                    INSERT INTO findings (id, scan_id, website_id, category, title, description, severity, cvss_score, affected_url, evidence, remediation, is_new, is_fixed, first_seen_at, last_seen_at, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING *
                """
                res = await _execute_update(
                    query,
                    (
                        str(f["id"]),
                        str(f["scan_id"]),
                        str(f["website_id"]),
                        f.get("category", "General"),
                        f.get("title", "Untitled Finding")[:500],
                        f.get("description"),
                        f.get("severity", "informational"),
                        f.get("cvss_score"),
                        f.get("affected_url"),
                        f.get("evidence"),
                        f.get("remediation"),
                        f.get("is_new", True),
                        f.get("is_fixed", False),
                        f.get("first_seen_at", datetime.now(timezone.utc)),
                        f.get("last_seen_at", datetime.now(timezone.utc)),
                        f.get("created_at", datetime.now(timezone.utc)),
                    ),
                    fetch_one=True
                )
                if res:
                    inserted.append(res)
            return inserted
        except Exception as exc:
            logger.warning("Postgres create_findings failed: %s. Using RAM store.", exc)
            
    for f in findings_list:
        _findings[str(f["id"])] = f
    return findings_list

async def list_findings_by_website(website_id: str, severity: str | None = None) -> list[dict]:
    if is_postgres_configured:
        try:
            if severity:
                return await _execute_query(
                    "SELECT * FROM findings WHERE website_id = %s AND severity = %s",
                    (str(website_id), severity),
                    fetch_all=True
                )
            else:
                return await _execute_query(
                    "SELECT * FROM findings WHERE website_id = %s",
                    (str(website_id),),
                    fetch_all=True
                )
        except Exception as exc:
            logger.warning("Postgres list_findings_by_website failed: %s. Using RAM store.", exc)
            
    res = [f for f in _findings.values() if str(f["website_id"]) == str(website_id)]
    if severity:
        res = [f for f in res if f.get("severity") == severity]
    return res

async def list_findings_by_scan(scan_id: str) -> list[dict]:
    if is_postgres_configured:
        try:
            return await _execute_query(
                "SELECT * FROM findings WHERE scan_id = %s",
                (str(scan_id),),
                fetch_all=True
            )
        except Exception as exc:
            logger.warning("Postgres list_findings_by_scan failed: %s. Using RAM store.", exc)
            
    return [f for f in _findings.values() if str(f["scan_id"]) == str(scan_id)]

async def get_latest_finding_counts(website_id: str) -> dict[str, int]:
    if is_postgres_configured:
        try:
            query = """
                SELECT f.severity, COUNT(*) as count 
                FROM findings f
                JOIN scans s ON f.scan_id = s.id
                WHERE s.website_id = %s AND s.status = 'completed'
                GROUP BY f.severity
            """
            rows = await _execute_query(query, (str(website_id),), fetch_all=True)
            counts = {}
            for r in rows:
                sev = r["severity"]
                if sev:
                    counts[sev] = int(r["count"])
            return counts
        except Exception as exc:
            logger.warning("Postgres get_latest_finding_counts failed: %s. Using RAM store.", exc)
            
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
    if is_postgres_configured:
        try:
            query = """
                INSERT INTO risk_scores (id, scan_id, website_id, score, grade, critical_count, high_count, medium_count, low_count, info_count, previous_score, score_delta, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
            """
            res = await _execute_update(
                query,
                (
                    str(risk_score_data["id"]),
                    str(risk_score_data["scan_id"]),
                    str(risk_score_data["website_id"]),
                    float(risk_score_data["score"]),
                    risk_score_data.get("grade"),
                    risk_score_data.get("critical_count", 0),
                    risk_score_data.get("high_count", 0),
                    risk_score_data.get("medium_count", 0),
                    risk_score_data.get("low_count", 0),
                    risk_score_data.get("info_count", 0),
                    risk_score_data.get("previous_score"),
                    risk_score_data.get("score_delta"),
                    risk_score_data.get("created_at", datetime.now(timezone.utc)),
                ),
                fetch_one=True
            )
            if res:
                return res
        except Exception as exc:
            logger.warning("Postgres create_risk_score failed: %s. Using RAM store.", exc)
            
    _risk_scores[str(risk_score_data["id"])] = risk_score_data
    return risk_score_data

async def get_latest_risk_score(website_id: str) -> dict | None:
    if is_postgres_configured:
        try:
            return await _execute_query(
                "SELECT * FROM risk_scores WHERE website_id = %s ORDER BY created_at DESC LIMIT 1",
                (str(website_id),),
                fetch_one=True
            )
        except Exception as exc:
            logger.warning("Postgres get_latest_risk_score failed: %s. Using RAM store.", exc)
            
    scores = [s for s in _risk_scores.values() if str(s["website_id"]) == str(website_id)]
    if not scores:
        return None
    scores.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return scores[0]

# --- Recommendations ---

async def create_recommendations(rec_data: dict) -> dict:
    if is_postgres_configured:
        try:
            query = """
                INSERT INTO recommendations (id, scan_id, website_id, executive_summary, technical_summary, top_risks, business_impact, remediation_steps, sola_analysis, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
            """
            res = await _execute_update(
                query,
                (
                    str(rec_data["id"]),
                    str(rec_data["scan_id"]),
                    str(rec_data["website_id"]),
                    rec_data.get("executive_summary"),
                    rec_data.get("technical_summary"),
                    Json(rec_data.get("top_risks", [])),
                    rec_data.get("business_impact"),
                    Json(rec_data.get("remediation_steps", [])),
                    Json(rec_data.get("sola_analysis", {})),
                    rec_data.get("created_at", datetime.now(timezone.utc)),
                ),
                fetch_one=True
            )
            if res:
                return res
        except Exception as exc:
            logger.warning("Postgres create_recommendations failed: %s. Using RAM store.", exc)
            
    _recommendations[str(rec_data["id"])] = rec_data
    return rec_data

async def get_recommendations(website_id: str) -> dict | None:
    if is_postgres_configured:
        try:
            return await _execute_query(
                "SELECT * FROM recommendations WHERE website_id = %s ORDER BY created_at DESC LIMIT 1",
                (str(website_id),),
                fetch_one=True
            )
        except Exception as exc:
            logger.warning("Postgres get_recommendations failed: %s. Using RAM store.", exc)
            
    recs = [r for r in _recommendations.values() if str(r["website_id"]) == str(website_id)]
    if not recs:
        return None
    recs.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return recs[0]

# --- WordPress Data ---

async def create_wordpress_data(wp_data: dict) -> dict:
    if is_postgres_configured:
        try:
            query = """
                INSERT INTO wordpress_data (id, scan_id, website_id, is_wordpress, version, version_outdated, plugins, themes, vulnerabilities, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
            """
            res = await _execute_update(
                query,
                (
                    str(wp_data["id"]),
                    str(wp_data["scan_id"]),
                    str(wp_data["website_id"]),
                    wp_data.get("is_wordpress", False),
                    wp_data.get("version"),
                    wp_data.get("version_outdated", False),
                    Json(wp_data.get("plugins", [])),
                    Json(wp_data.get("themes", [])),
                    Json(wp_data.get("vulnerabilities", [])),
                    wp_data.get("created_at", datetime.now(timezone.utc)),
                ),
                fetch_one=True
            )
            if res:
                return res
        except Exception as exc:
            logger.warning("Postgres create_wordpress_data failed: %s. Using RAM store.", exc)
            
    _wordpress_data[str(wp_data["id"])] = wp_data
    return wp_data

async def get_wordpress_data(website_id: str) -> dict | None:
    if is_postgres_configured:
        try:
            return await _execute_query(
                "SELECT * FROM wordpress_data WHERE website_id = %s ORDER BY created_at DESC LIMIT 1",
                (str(website_id),),
                fetch_one=True
            )
        except Exception as exc:
            logger.warning("Postgres get_wordpress_data failed: %s. Using RAM store.", exc)
            
    wp = [w for w in _wordpress_data.values() if str(w["website_id"]) == str(website_id)]
    if not wp:
        return None
    wp.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return wp[0]

# --- Cloudflare Data ---

async def create_cloudflare_data(cf_data: dict) -> dict:
    if is_postgres_configured:
        try:
            query = """
                INSERT INTO cloudflare_data (id, scan_id, website_id, is_behind_cloudflare, waf_enabled, ssl_mode, cf_ray_header, dns_records, security_headers, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
            """
            res = await _execute_update(
                query,
                (
                    str(cf_data["id"]),
                    str(cf_data["scan_id"]),
                    str(cf_data["website_id"]),
                    cf_data.get("is_behind_cloudflare", False),
                    cf_data.get("waf_enabled"),
                    cf_data.get("ssl_mode"),
                    cf_data.get("cf_ray_header"),
                    Json(cf_data.get("dns_records", [])),
                    Json(cf_data.get("security_headers", {})),
                    cf_data.get("created_at", datetime.now(timezone.utc)),
                ),
                fetch_one=True
            )
            if res:
                return res
        except Exception as exc:
            logger.warning("Postgres create_cloudflare_data failed: %s. Using RAM store.", exc)
            
    _cloudflare_data[str(cf_data["id"])] = cf_data
    return cf_data

async def get_cloudflare_data(website_id: str) -> dict | None:
    if is_postgres_configured:
        try:
            return await _execute_query(
                "SELECT * FROM cloudflare_data WHERE website_id = %s ORDER BY created_at DESC LIMIT 1",
                (str(website_id),),
                fetch_one=True
            )
        except Exception as exc:
            logger.warning("Postgres get_cloudflare_data failed: %s. Using RAM store.", exc)
            
    cf = [c for c in _cloudflare_data.values() if str(c["website_id"]) == str(website_id)]
    if not cf:
        return None
    cf.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return cf[0]

# --- Historical Scans ---

async def create_historical_scan(hist_data: dict) -> dict:
    if is_postgres_configured:
        try:
            query = """
                INSERT INTO historical_scans (id, website_id, scan_date, risk_score, grade, critical_count, high_count, medium_count, low_count, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
            """
            s_date = hist_data.get("scan_date")
            if isinstance(s_date, str):
                s_date = date.fromisoformat(s_date)
                
            res = await _execute_update(
                query,
                (
                    str(hist_data["id"]),
                    str(hist_data["website_id"]),
                    s_date,
                    float(hist_data["risk_score"]) if hist_data.get("risk_score") is not None else None,
                    hist_data.get("grade"),
                    hist_data.get("critical_count", 0),
                    hist_data.get("high_count", 0),
                    hist_data.get("medium_count", 0),
                    hist_data.get("low_count", 0),
                    hist_data.get("created_at", datetime.now(timezone.utc)),
                ),
                fetch_one=True
            )
            if res:
                return res
        except Exception as exc:
            logger.warning("Postgres create_historical_scan failed: %s. Using RAM store.", exc)
            
    _historical_scans[str(hist_data["id"])] = hist_data
    return hist_data

async def list_historical_scans(website_id: str, days: int = 30) -> list[dict]:
    if is_postgres_configured:
        try:
            return await _execute_query(
                "SELECT * FROM historical_scans WHERE website_id = %s ORDER BY scan_date ASC",
                (str(website_id),),
                fetch_all=True
            )
        except Exception as exc:
            logger.warning("Postgres list_historical_scans failed: %s. Using RAM store.", exc)
            
    return [h for h in _historical_scans.values() if str(h["website_id"]) == str(website_id)]

# --- Alerts ---

async def create_alert(alert_data: dict) -> dict:
    if is_postgres_configured:
        try:
            query = """
                INSERT INTO alerts (id, website_id, scan_id, finding_id, alert_type, title, message, severity, is_acknowledged, channels_sent, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
            """
            res = await _execute_update(
                query,
                (
                    str(alert_data["id"]),
                    str(alert_data["website_id"]),
                    str(alert_data["scan_id"]) if alert_data.get("scan_id") else None,
                    str(alert_data["finding_id"]) if alert_data.get("finding_id") else None,
                    alert_data["alert_type"],
                    alert_data["title"][:500],
                    alert_data.get("message"),
                    alert_data.get("severity"),
                    alert_data.get("is_acknowledged", False),
                    Json(alert_data.get("channels_sent", [])),
                    alert_data.get("created_at", datetime.now(timezone.utc)),
                ),
                fetch_one=True
            )
            if res:
                return res
        except Exception as exc:
            logger.warning("Postgres create_alert failed: %s. Using RAM store.", exc)
            
    _alerts[str(alert_data["id"])] = alert_data
    return alert_data

async def list_alerts(user_id: str) -> list[dict]:
    if is_postgres_configured:
        try:
            query = """
                SELECT a.* 
                FROM alerts a
                JOIN websites w ON a.website_id = w.id
                WHERE w.user_id = %s
                ORDER BY a.created_at DESC
            """
            return await _execute_query(query, (str(user_id),), fetch_all=True)
        except Exception as exc:
            logger.warning("Postgres list_alerts failed: %s. Using RAM store.", exc)
            
    user_website_ids = {str(w["id"]) for w in _websites.values() if str(w["user_id"]) == str(user_id)}
    return [a for a in _alerts.values() if str(a["website_id"]) in user_website_ids]

async def update_alert(alert_id: str, updates: dict) -> dict | None:
    if is_postgres_configured:
        try:
            keys = list(updates.keys())
            if not keys:
                return await _execute_query("SELECT * FROM alerts WHERE id = %s", (str(alert_id),), fetch_one=True)
            
            set_clause = ", ".join([f"{k} = %s" for k in keys])
            params = []
            for k in keys:
                val = updates[k]
                if k == "channels_sent":
                    val = Json(val)
                params.append(val)
            params.append(str(alert_id))
            
            query = f"UPDATE alerts SET {set_clause} WHERE id = %s RETURNING *"
            res = await _execute_update(query, tuple(params), fetch_one=True)
            if res:
                return res
        except Exception as exc:
            logger.warning("Postgres update_alert failed: %s. Using RAM store.", exc)
            
    a = _alerts.get(str(alert_id))
    if a:
        a.update(updates)
        return a
    return None

async def delete_alert(alert_id: str) -> bool:
    if is_postgres_configured:
        try:
            await _execute_update("DELETE FROM alerts WHERE id = %s", (str(alert_id),))
            return True
        except Exception as exc:
            logger.warning("Postgres delete_alert failed: %s. Using RAM store.", exc)
            
    if str(alert_id) in _alerts:
        del _alerts[str(alert_id)]
        return True
    return False

# --- Custom Scan details ---

async def get_risk_score_by_scan(scan_id: str) -> dict | None:
    if is_postgres_configured:
        try:
            return await _execute_query(
                "SELECT * FROM risk_scores WHERE scan_id = %s ORDER BY created_at DESC LIMIT 1",
                (str(scan_id),),
                fetch_one=True
            )
        except Exception as exc:
            logger.warning("Postgres get_risk_score_by_scan failed: %s. Using RAM store.", exc)
            
    for r in _risk_scores.values():
        if str(r.get("scan_id")) == str(scan_id):
            return r
    return None

async def get_recommendation_by_scan(scan_id: str) -> dict | None:
    if is_postgres_configured:
        try:
            return await _execute_query(
                "SELECT * FROM recommendations WHERE scan_id = %s LIMIT 1",
                (str(scan_id),),
                fetch_one=True
            )
        except Exception as exc:
            logger.warning("Postgres get_recommendation_by_scan failed: %s. Using RAM store.", exc)
            
    for r in _recommendations.values():
        if str(r.get("scan_id")) == str(scan_id):
            return r
    return None

async def list_scans(user_id: str, status: str | None = None, website_id: str | None = None, limit: int = 50, skip: int = 0) -> list[dict]:
    if is_postgres_configured:
        try:
            query = """
                SELECT s.* 
                FROM scans s
                JOIN websites w ON s.website_id = w.id
                WHERE w.user_id = %s
            """
            params = [str(user_id)]
            if website_id:
                query += " AND s.website_id = %s"
                params.append(str(website_id))
            if status:
                query += " AND s.status = %s"
                params.append(status)
            
            query += " ORDER BY s.created_at DESC LIMIT %s OFFSET %s"
            params.extend([limit, skip])
            
            return await _execute_query(query, tuple(params), fetch_all=True)
        except Exception as exc:
            logger.warning("Postgres list_scans failed: %s. Using RAM store.", exc)
            
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
    if is_postgres_configured:
        try:
            query = """
                SELECT f.* 
                FROM findings f
                JOIN websites w ON f.website_id = w.id
                WHERE w.user_id = %s
            """
            params = [str(user_id)]
            if website_id:
                query += " AND f.website_id = %s"
                params.append(str(website_id))
            if scan_id:
                query += " AND f.scan_id = %s"
                params.append(str(scan_id))
            if severity:
                query += " AND f.severity = %s"
                params.append(severity)
            if category:
                query += " AND f.category ILIKE %s"
                params.append(f"%{category}%")
            if is_new is not None:
                query += " AND f.is_new = %s"
                params.append(is_new)
            if is_fixed is not None:
                query += " AND f.is_fixed = %s"
                params.append(is_fixed)
            
            query += """
                ORDER BY 
                  CASE f.severity
                    WHEN 'critical' THEN 1
                    WHEN 'high' THEN 2
                    WHEN 'medium' THEN 3
                    WHEN 'low' THEN 4
                    ELSE 5
                  END ASC,
                  f.created_at DESC
                LIMIT %s OFFSET %s
            """
            params.extend([limit, skip])
            
            return await _execute_query(query, tuple(params), fetch_all=True)
        except Exception as exc:
            logger.warning("Postgres list_findings_across_websites failed: %s. Using RAM store.", exc)
            
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

# --- Reports ---

async def create_report(report_data: dict) -> dict:
    if is_postgres_configured:
        try:
            query = """
                INSERT INTO reports (id, website_id, scan_id, report_type, format, file_path, generated_by, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
            """
            res = await _execute_update(
                query,
                (
                    str(report_data["id"]),
                    str(report_data["website_id"]) if report_data.get("website_id") else None,
                    str(report_data["scan_id"]) if report_data.get("scan_id") else None,
                    report_data.get("report_type"),
                    report_data.get("format"),
                    report_data.get("file_path"),
                    str(report_data["generated_by"]) if report_data.get("generated_by") else None,
                    report_data.get("created_at", datetime.now(timezone.utc)),
                ),
                fetch_one=True
            )
            if res:
                return res
        except Exception as exc:
            logger.warning("Postgres create_report failed: %s. Using RAM store.", exc)
            
    _reports[str(report_data["id"])] = report_data
    return report_data

async def list_reports(user_id: str, website_id: str | None = None, limit: int = 50, skip: int = 0) -> list[dict]:
    if is_postgres_configured:
        try:
            query = "SELECT * FROM reports WHERE generated_by = %s"
            params = [str(user_id)]
            if website_id:
                query += " AND website_id = %s"
                params.append(str(website_id))
            query += " ORDER BY created_at DESC LIMIT %s OFFSET %s"
            params.extend([limit, skip])
            return await _execute_query(query, tuple(params), fetch_all=True)
        except Exception as exc:
            logger.warning("Postgres list_reports failed: %s. Using RAM store.", exc)
            
    res = [r for r in _reports.values() if str(r.get("generated_by")) == str(user_id)]
    if website_id:
        res = [r for r in res if str(r.get("website_id")) == str(website_id)]
    res.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return res[skip : skip + limit]

async def get_report(report_id: str, user_id: str) -> dict | None:
    if is_postgres_configured:
        try:
            return await _execute_query(
                "SELECT * FROM reports WHERE id = %s AND generated_by = %s",
                (str(report_id), str(user_id)),
                fetch_one=True
            )
        except Exception as exc:
            logger.warning("Postgres get_report failed: %s. Using RAM store.", exc)
            
    r = _reports.get(str(report_id))
    if r and str(r.get("generated_by")) == str(user_id):
        return r
    return None
