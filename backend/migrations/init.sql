-- =============================================================================
-- Website Threat Surface Monitor — Supabase / PostgreSQL Schema
-- Run this once against a fresh Supabase project or local Postgres instance.
-- =============================================================================

-- Enable UUID generation (Supabase already has this; harmless if re-run)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email            VARCHAR(255) UNIQUE NOT NULL,
    hashed_password  VARCHAR(255) NOT NULL,
    full_name        VARCHAR(255),
    role             VARCHAR(50)  DEFAULT 'viewer'
                         CHECK (role IN ('admin', 'analyst', 'viewer')),
    is_active        BOOLEAN      DEFAULT TRUE,
    created_at       TIMESTAMPTZ  DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- websites
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS websites (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID REFERENCES users(id) ON DELETE CASCADE,
    url            VARCHAR(500) NOT NULL,
    name           VARCHAR(255),
    description    TEXT,
    is_active      BOOLEAN     DEFAULT TRUE,
    scan_frequency VARCHAR(50) DEFAULT 'daily',
    last_scan_at   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- scans
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scans (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    website_id       UUID REFERENCES websites(id) ON DELETE CASCADE,
    status           VARCHAR(50) DEFAULT 'pending'
                         CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    pipeline_stage   VARCHAR(100),
    started_at       TIMESTAMPTZ,
    completed_at     TIMESTAMPTZ,
    duration_seconds FLOAT,
    error_message    TEXT,
    scan_metadata    JSONB       DEFAULT '{}',
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- findings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS findings (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id       UUID REFERENCES scans(id) ON DELETE CASCADE,
    website_id    UUID REFERENCES websites(id) ON DELETE CASCADE,
    category      VARCHAR(100) NOT NULL,
    title         VARCHAR(500) NOT NULL,
    description   TEXT,
    severity      VARCHAR(50)
                      CHECK (severity IN ('critical', 'high', 'medium', 'low', 'informational')),
    cvss_score    FLOAT,
    affected_url  TEXT,
    evidence      TEXT,
    remediation   TEXT,
    is_new        BOOLEAN     DEFAULT TRUE,
    is_fixed      BOOLEAN     DEFAULT FALSE,
    first_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at  TIMESTAMPTZ DEFAULT NOW(),
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- risk_scores
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS risk_scores (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id        UUID REFERENCES scans(id) ON DELETE CASCADE,
    website_id     UUID REFERENCES websites(id) ON DELETE CASCADE,
    score          FLOAT NOT NULL,
    grade          VARCHAR(5),
    critical_count INT   DEFAULT 0,
    high_count     INT   DEFAULT 0,
    medium_count   INT   DEFAULT 0,
    low_count      INT   DEFAULT 0,
    info_count     INT   DEFAULT 0,
    previous_score FLOAT,
    score_delta    FLOAT,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- recommendations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recommendations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id           UUID REFERENCES scans(id) ON DELETE CASCADE,
    website_id        UUID REFERENCES websites(id) ON DELETE CASCADE,
    executive_summary TEXT,
    technical_summary TEXT,
    top_risks         JSONB DEFAULT '[]',
    business_impact   TEXT,
    remediation_steps JSONB DEFAULT '[]',
    sola_analysis     JSONB DEFAULT '{}',
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- alerts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alerts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    website_id       UUID REFERENCES websites(id) ON DELETE CASCADE,
    scan_id          UUID REFERENCES scans(id),
    finding_id       UUID REFERENCES findings(id),
    alert_type       VARCHAR(100) NOT NULL,
    title            VARCHAR(500) NOT NULL,
    message          TEXT,
    severity         VARCHAR(50),
    is_acknowledged  BOOLEAN DEFAULT FALSE,
    channels_sent    JSONB   DEFAULT '[]',
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- wordpress_data
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wordpress_data (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id          UUID REFERENCES scans(id) ON DELETE CASCADE,
    website_id       UUID REFERENCES websites(id) ON DELETE CASCADE,
    is_wordpress     BOOLEAN DEFAULT FALSE,
    version          VARCHAR(50),
    version_outdated BOOLEAN DEFAULT FALSE,
    plugins          JSONB   DEFAULT '[]',
    themes           JSONB   DEFAULT '[]',
    vulnerabilities  JSONB   DEFAULT '[]',
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- cloudflare_data
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cloudflare_data (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id             UUID REFERENCES scans(id) ON DELETE CASCADE,
    website_id          UUID REFERENCES websites(id) ON DELETE CASCADE,
    is_behind_cloudflare BOOLEAN DEFAULT FALSE,
    waf_enabled         BOOLEAN,
    ssl_mode            VARCHAR(50),
    cf_ray_header       TEXT,
    dns_records         JSONB DEFAULT '[]',
    security_headers    JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- historical_scans
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS historical_scans (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    website_id     UUID REFERENCES websites(id) ON DELETE CASCADE,
    scan_date      DATE NOT NULL,
    risk_score     FLOAT,
    grade          VARCHAR(5),
    critical_count INT DEFAULT 0,
    high_count     INT DEFAULT 0,
    medium_count   INT DEFAULT 0,
    low_count      INT DEFAULT 0,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    website_id   UUID REFERENCES websites(id),
    scan_id      UUID REFERENCES scans(id),
    report_type  VARCHAR(100),
    format       VARCHAR(20),
    file_path    TEXT,
    generated_by UUID REFERENCES users(id),
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Indexes for common query patterns
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_websites_user_id       ON websites(user_id);
CREATE INDEX IF NOT EXISTS idx_scans_website_id       ON scans(website_id);
CREATE INDEX IF NOT EXISTS idx_scans_status           ON scans(status);
CREATE INDEX IF NOT EXISTS idx_findings_scan_id       ON findings(scan_id);
CREATE INDEX IF NOT EXISTS idx_findings_website_id    ON findings(website_id);
CREATE INDEX IF NOT EXISTS idx_findings_severity      ON findings(severity);
CREATE INDEX IF NOT EXISTS idx_risk_scores_website_id ON risk_scores(website_id);
CREATE INDEX IF NOT EXISTS idx_alerts_website_id      ON alerts(website_id);
CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged    ON alerts(is_acknowledged);
CREATE INDEX IF NOT EXISTS idx_historical_website_id  ON historical_scans(website_id);
CREATE INDEX IF NOT EXISTS idx_historical_scan_date   ON historical_scans(scan_date);
