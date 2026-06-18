"""
app/main.py
FastAPI application factory — registers routers, middleware, lifespan events.
"""
import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.routers import alerts, auth, dashboard, findings, reports, scans, websites, risk_scores, ai

# ---------------------------------------------------------------------------
# Logging configuration
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


def get_static_dir() -> str | None:
    """Return the compiled frontend directory when it exists."""
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    static_dir = os.path.join(base_dir, "static")
    if os.path.exists(static_dir):
        return static_dir

    dist_dir = os.path.abspath(os.path.join(base_dir, "..", "frontend", "dist"))
    if os.path.exists(dist_dir):
        return dist_dir

    return None


# ---------------------------------------------------------------------------
# Lifespan — startup / shutdown
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Application lifespan context manager.

    Startup:
        - Logs configuration summary
        - Verifies DB connectivity (warns on failure; does not crash)
        - Starts APScheduler background scan tasks

    Shutdown:
        - Shuts down APScheduler
    """
    # --- Startup ---
    logger.info("=" * 60)
    logger.info("  %s v%s", settings.APP_NAME, settings.VERSION)
    logger.info("  Debug mode: %s", settings.DEBUG)
    from app.core.supabase import is_supabase_configured
    logger.info("  Database: %s", "Supabase" if is_supabase_configured else "In-Memory RAM Store")
    logger.info("  Supabase: %s", "configured and initialized" if is_supabase_configured else "not configured or failed initialization")
    logger.info("  Sola MCP: %s", "configured" if settings.SOLA_MCP_ENDPOINT else "standalone mode")
    logger.info("  Google Sheets: %s", "configured" if settings.GOOGLE_SHEETS_SPREADSHEET_ID else "not configured")
    logger.info("=" * 60)

    logger.info("Supabase DB service initialized: %s", "yes" if is_supabase_configured else "no (using in-memory RAM store)")
    
    try:
        from app.tasks.scheduler import start_scheduler
        start_scheduler()
    except Exception as exc:
        logger.error("Failed to start APScheduler background job: %s", exc)

    yield
    
    # --- Shutdown ---
    try:
        from app.tasks.scheduler import shutdown_scheduler
        shutdown_scheduler()
    except Exception as exc:
        logger.error("Failed to shutdown APScheduler: %s", exc)
        
    logger.info("Shutdown complete.")


# ---------------------------------------------------------------------------
# Application factory
# ---------------------------------------------------------------------------

def create_app() -> FastAPI:
    """Create and configure the FastAPI application instance."""
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.VERSION,
        description=(
            "Website Threat Surface Monitor — automated security scanning, "
            "AI-powered risk analysis, and real-time alerting for web applications."
        ),
        contact={
            "name": "Threat Surface Monitor",
            "url": "https://github.com/your-org/threat-surface-monitor",
        },
        license_info={"name": "MIT"},
        openapi_tags=[
            {"name": "Authentication", "description": "User registration, login, and JWT management"},
            {"name": "Websites", "description": "Website monitoring configuration and scan triggers"},
            {"name": "Scans", "description": "Scan history, findings, and pipeline status"},
            {"name": "Findings", "description": "Security finding retrieval and filtering"},
            {"name": "Alerts", "description": "Real-time security alert management"},
            {"name": "Reports", "description": "PDF and CSV security report generation"},
            {"name": "Dashboard", "description": "Aggregated analytics and statistics"},
        ],
        lifespan=lifespan,
    )

    # -----------------------------------------------------------------------
    # Middleware
    # -----------------------------------------------------------------------
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:3000",      # Next.js dev server
            "http://localhost:5173",      # Vite dev server
            "http://127.0.0.1:3000",
            "http://127.0.0.1:5173",
            # Add your production domain here, e.g.:
            # "https://yourdomain.com",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    # app.add_middleware(GZipMiddleware, minimum_size=1000)

    # -----------------------------------------------------------------------
    # Routers — all under /api/v1
    # -----------------------------------------------------------------------
    API_PREFIX = "/api/v1"

    app.include_router(auth.router, prefix=API_PREFIX)
    app.include_router(websites.router, prefix=API_PREFIX)
    app.include_router(scans.router, prefix=API_PREFIX)
    app.include_router(findings.router, prefix=API_PREFIX)
    app.include_router(alerts.router, prefix=API_PREFIX)
    app.include_router(reports.router, prefix=API_PREFIX)
    app.include_router(dashboard.router, prefix=API_PREFIX)
    app.include_router(risk_scores.router, prefix=API_PREFIX)
    app.include_router(ai.router, prefix=API_PREFIX)

    # -----------------------------------------------------------------------
    # Health check endpoint
    # -----------------------------------------------------------------------
    @app.get(
        "/health",
        tags=["Health"],
        summary="Service health check",
    )
    async def health_check() -> JSONResponse:
        """
        Returns service health status including DB connectivity.

        Used by load balancers, Docker health checks, and monitoring tools.
        """
        from app.core.supabase import is_supabase_configured

        db_status = "supabase" if is_supabase_configured else "in-memory (development)"
        overall = "healthy"

        return JSONResponse(
            content={
                "status": overall,
                "app": settings.APP_NAME,
                "version": settings.VERSION,
                "database": db_status,
                "sola_mcp": "configured" if settings.SOLA_MCP_ENDPOINT else "standalone",
            },
            status_code=200,
        )

    @app.get(
        "/",
        tags=["Health"],
        summary="API root",
    )
    async def root() -> JSONResponse:
        """Return API metadata for local backend-only runs."""
        return JSONResponse(
            content={
                "name": settings.APP_NAME,
                "version": settings.VERSION,
                "mode": "api-only" if not settings.SERVE_FRONTEND else "unified",
                "health": "/health",
                "docs": "/docs",
                "openapi": "/openapi.json",
                "api_prefix": API_PREFIX,
            },
            status_code=200,
        )

    @app.get(
        f"{API_PREFIX}/status",
        tags=["Health"],
        summary="System integration status",
    )
    async def system_status() -> JSONResponse:
        """
        Return real-time status of all integrations (Sola MCP, Google Sheets, DB).
        Used by the frontend Settings page to show accurate connection badges.
        """
        from app.core.supabase import is_supabase_configured
        from app.services.sola_mcp import sola_mcp_service

        sola_info = await sola_mcp_service.get_architecture_info()
        sola_configured = sola_info.get("status") == "configured"

        return JSONResponse(
            content={
                "database": {
                    "type": "supabase" if is_supabase_configured else "in_memory",
                    "status": "connected" if is_supabase_configured else "standalone",
                },
                "sola_mcp": {
                    "configured": sola_configured,
                    "status": "configured" if sola_configured else "standalone",
                    "endpoint": settings.SOLA_MCP_ENDPOINT or "not set",
                    "connected_sources": sola_info.get("connected_sources", []),
                    "capabilities": sola_info.get("capabilities", []),
                    "note": (
                        "Live MCP enrichment active."
                        if sola_configured
                        else "Running in standalone mode. Set SOLA_MCP_CLIENT_ID and SOLA_MCP_CLIENT_SECRET in .env to enable."
                    ),
                },
                "google_sheets": {
                    "configured": bool(settings.GOOGLE_SHEETS_SPREADSHEET_ID),
                    "status": "configured" if settings.GOOGLE_SHEETS_SPREADSHEET_ID else "not_configured",
                },
                "notifications": {
                    "slack": bool(settings.SLACK_WEBHOOK_URL),
                    "discord": bool(settings.DISCORD_WEBHOOK_URL),
                    "smtp": bool(settings.SMTP_USER),
                },
            },
            status_code=200,
        )

    # -----------------------------------------------------------------------
    # Custom 404 Handler for Single Page Application (SPA) Routing
    # -----------------------------------------------------------------------
    static_dir = get_static_dir()
    should_serve_frontend = settings.SERVE_FRONTEND and static_dir is not None

    if settings.SERVE_FRONTEND and static_dir is None:
        logger.warning("SERVE_FRONTEND is enabled but no compiled frontend assets were found.")

    if should_serve_frontend:
        @app.exception_handler(404)
        async def spa_404_handler(request, exc):
            # API requests return standard 404 JSON
            if request.url.path.startswith("/api"):
                return JSONResponse(status_code=404, content={"detail": "Not Found"})

            index_path = os.path.join(static_dir, "index.html")
            if os.path.exists(index_path):
                return FileResponse(index_path)

            return JSONResponse(
                status_code=404,
                content={"detail": "React build files not found. Please compile frontend."}
            )

    # -----------------------------------------------------------------------
    # Serve static React frontend files
    # -----------------------------------------------------------------------
    if should_serve_frontend:
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="frontend")

    return app


# Module-level app instance (used by uvicorn)
app = create_app()
