"""
app/core/config.py
Application configuration loaded from environment variables via pydantic-settings.
"""
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # Application
    APP_NAME: str = "Website Threat Surface Monitor"
    VERSION: str = "1.0.0"
    DEBUG: bool = False
    SERVE_FRONTEND: bool = False

    @field_validator("DEBUG", mode="before")
    @classmethod
    def parse_debug(cls, value):
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"1", "true", "yes", "on", "debug", "development", "dev"}:
                return True
            if normalized in {"0", "false", "no", "off", "release", "production", "prod", ""}:
                return False
        return value

    @field_validator("SERVE_FRONTEND", mode="before")
    @classmethod
    def parse_serve_frontend(cls, value):
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"1", "true", "yes", "on"}:
                return True
            if normalized in {"0", "false", "no", "off", ""}:
                return False
        return value

    # Security / JWT
    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours

    # Supabase
    SUPABASE_URL: str = ""
    SUPABASE_PUBLISHABLE_KEY: str = ""
    SUPABASE_SERVICE_KEY: str = ""

    # Sola MCP
    SOLA_MCP_ENDPOINT: str = "https://api.sola.security/mcp"
    SOLA_MCP_CLIENT_ID: str = ""
    SOLA_MCP_CLIENT_SECRET: str = ""

    # Cloudflare
    CLOUDFLARE_API_TOKEN: str = ""

    # Google Sheets
    GOOGLE_SHEETS_SPREADSHEET_ID: str = ""
    GOOGLE_SHEETS_CREDENTIALS_JSON: str = ""

    # Email / SMTP
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""

    # Notifications
    SLACK_WEBHOOK_URL: str = ""
    DISCORD_WEBHOOK_URL: str = ""

    # Scanner
    SCAN_TIMEOUT: int = 30
    MAX_CONCURRENT_SCANS: int = 5


settings = Settings()
