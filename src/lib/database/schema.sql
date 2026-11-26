-- ==============================================================================
-- DEVELOPSTER HUB CRM — POSTGRESQL MULTI-TENANT PRODUCTION SCHEMA
-- Phase 5: Multi-Tenant Isolation, Row-Level Security & Infrastructure Hardening
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. TENANTS & WORKSPACES
-- ==============================================================================
CREATE TABLE IF NOT EXISTS workspaces (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    company_name VARCHAR(255),
    website VARCHAR(255),
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
    plan_tier VARCHAR(50) NOT NULL DEFAULT 'starter',
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived', 'deleted')),
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_workspaces_slug ON workspaces(slug);
CREATE INDEX idx_workspaces_status ON workspaces(status);

-- ==============================================================================
-- 2. USERS & AUTHENTICATION IDENTITIES
-- ==============================================================================
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255), -- Modern scrypt:salt:hash format
    is_master_admin BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended', 'deactivated')),
    avatar_url VARCHAR(500),
    phone VARCHAR(50),
    last_login_at TIMESTAMPTZ,
    failed_login_attempts INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_users_email ON users(LOWER(email));
CREATE INDEX idx_users_status ON users(status);

-- ==============================================================================
-- 3. WORKSPACE MEMBERSHIPS & RBAC
-- ==============================================================================
CREATE TABLE IF NOT EXISTS workspace_memberships (
    id VARCHAR(64) PRIMARY KEY DEFAULT 'mem_' || gen_random_uuid(),
    workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL CHECK (role IN ('Owner', 'Admin', 'Manager', 'Member', 'Read-only')),
    department VARCHAR(100),
    assigned_pipeline_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'disabled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_workspace_user UNIQUE (workspace_id, user_id)
);

CREATE INDEX idx_memberships_workspace ON workspace_memberships(workspace_id);
CREATE INDEX idx_memberships_user ON workspace_memberships(user_id);
CREATE INDEX idx_memberships_role ON workspace_memberships(role);

-- ==============================================================================
-- 4. SUBSCRIPTIONS & ENTITLEMENTS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS subscriptions (
    id VARCHAR(64) PRIMARY KEY DEFAULT 'sub_' || gen_random_uuid(),
    workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL CHECK (provider IN ('stripe', 'razorpay', 'manual')),
    provider_customer_id VARCHAR(255),
    provider_subscription_id VARCHAR(255),
    plan_id VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid')),
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end TIMESTAMPTZ NOT NULL,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    canceled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_workspace_subscription UNIQUE (workspace_id)
);

CREATE INDEX idx_subscriptions_workspace ON subscriptions(workspace_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

CREATE TABLE IF NOT EXISTS usage_counters (
    id VARCHAR(64) PRIMARY KEY DEFAULT 'usg_' || gen_random_uuid(),
    workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    metric VARCHAR(100) NOT NULL, -- 'emails_sent', 'ai_tokens', 'api_calls', 'leads_created'
    period_key VARCHAR(20) NOT NULL, -- e.g. '2026-11'
    counter_value BIGINT NOT NULL DEFAULT 0,
    max_limit BIGINT NOT NULL DEFAULT 0, -- 0 = unlimited
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_workspace_metric_period UNIQUE (workspace_id, metric, period_key)
);

CREATE INDEX idx_usage_workspace_period ON usage_counters(workspace_id, period_key);

-- ==============================================================================
-- 5. INTEGRATIONS & ENCRYPTED CREDENTIALS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS integrations (
    id VARCHAR(64) PRIMARY KEY DEFAULT 'int_' || gen_random_uuid(),
    workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL CHECK (provider IN ('shopify', 'woocommerce', 'msg91', 'google_calendar', 'google_sheets')),
    shop_domain VARCHAR(255), -- For Shopify / WooCommerce multi-store binding
    status VARCHAR(50) NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'error', 'pending')),
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_workspace_provider_domain UNIQUE (workspace_id, provider, shop_domain)
);

CREATE INDEX idx_integrations_workspace ON integrations(workspace_id);
CREATE INDEX idx_integrations_provider ON integrations(provider);
CREATE INDEX idx_integrations_domain ON integrations(shop_domain);

CREATE TABLE IF NOT EXISTS integration_credentials (
    id VARCHAR(64) PRIMARY KEY DEFAULT 'crd_' || gen_random_uuid(),
    integration_id VARCHAR(64) NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
    workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    encrypted_data TEXT NOT NULL, -- AES-256-GCM format: iv:authTag:ciphertext
    key_version INT NOT NULL DEFAULT 1,
    masked_hint VARCHAR(50), -- e.g. '••••••••9876'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_integration_credentials UNIQUE (integration_id)
);

CREATE INDEX idx_credentials_workspace ON integration_credentials(workspace_id);

-- ==============================================================================
-- 6. DISTRIBUTED SESSION REVOCATIONS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS session_revocations (
    jti VARCHAR(128) PRIMARY KEY,
    user_email VARCHAR(255) NOT NULL,
    workspace_id VARCHAR(64) REFERENCES workspaces(id) ON DELETE CASCADE,
    revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_session_revocations_email ON session_revocations(LOWER(user_email));
CREATE INDEX idx_session_revocations_expiry ON session_revocations(expires_at);

-- ==============================================================================
-- 7. ATOMIC WEBHOOK IDEMPOTENCY
-- ==============================================================================
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id VARCHAR(64) PRIMARY KEY DEFAULT 'whd_' || gen_random_uuid(),
    workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL CHECK (provider IN ('shopify', 'woocommerce', 'generic')),
    delivery_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
    payload_hash VARCHAR(128) NOT NULL,
    attempt_count INT NOT NULL DEFAULT 1,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    CONSTRAINT uq_provider_delivery UNIQUE (workspace_id, provider, delivery_id)
);

CREATE INDEX idx_webhook_deliveries_lookup ON webhook_deliveries(workspace_id, provider, delivery_id);
CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX idx_webhook_deliveries_created ON webhook_deliveries(created_at);

-- ==============================================================================
-- 8. AUDIT LOGS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(64) PRIMARY KEY DEFAULT 'aud_' || gen_random_uuid(),
    workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    actor_id VARCHAR(64),
    actor_email VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id VARCHAR(255),
    ip_address VARCHAR(64),
    user_agent TEXT,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_workspace ON audit_logs(workspace_id, created_at DESC);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);

-- ==============================================================================
-- 9. PULSE INTELLIGENCE & VISITOR TRACKING
-- ==============================================================================
CREATE TABLE IF NOT EXISTS pulse_websites (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    site_id VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255) NOT NULL,
    whitelisted_domains JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
    snippet_installed BOOLEAN NOT NULL DEFAULT FALSE,
    ecommerce_platform VARCHAR(50) CHECK (ecommerce_platform IN ('shopify', 'woocommerce', 'custom', 'none')),
    last_ping_at TIMESTAMPTZ,
    events_count_total BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pulse_websites_workspace ON pulse_websites(workspace_id);
CREATE INDEX idx_pulse_websites_site_id ON pulse_websites(site_id);

CREATE TABLE IF NOT EXISTS pulse_visitor_sessions (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    site_id VARCHAR(64) NOT NULL REFERENCES pulse_websites(site_id) ON DELETE CASCADE,
    visitor_id VARCHAR(128) NOT NULL,
    anonymized_ip VARCHAR(64),
    country VARCHAR(10),
    device_type VARCHAR(50),
    browser VARCHAR(50),
    os VARCHAR(50),
    referrer VARCHAR(500),
    landing_page VARCHAR(500),
    duration_seconds INT NOT NULL DEFAULT 0,
    pages_viewed INT NOT NULL DEFAULT 1,
    events_count INT NOT NULL DEFAULT 1,
    customer_id VARCHAR(64),
    lead_id VARCHAR(64),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pulse_sessions_visitor ON pulse_visitor_sessions(workspace_id, visitor_id);
CREATE INDEX idx_pulse_sessions_site ON pulse_visitor_sessions(site_id);
CREATE INDEX idx_pulse_sessions_started ON pulse_visitor_sessions(started_at DESC);

CREATE TABLE IF NOT EXISTS pulse_events (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    site_id VARCHAR(64) NOT NULL REFERENCES pulse_websites(site_id) ON DELETE CASCADE,
    session_id VARCHAR(64) REFERENCES pulse_visitor_sessions(id) ON DELETE SET NULL,
    visitor_id VARCHAR(128) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    source VARCHAR(50) NOT NULL CHECK (source IN ('sdk', 'shopify', 'woocommerce', 'custom_api', 'email_tracker')),
    page_url VARCHAR(1000),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pulse_events_workspace ON pulse_events(workspace_id, created_at DESC);
CREATE INDEX idx_pulse_events_type ON pulse_events(event_type);
CREATE INDEX idx_pulse_events_session ON pulse_events(session_id);

CREATE TABLE IF NOT EXISTS pulse_consent_records (
    id VARCHAR(64) PRIMARY KEY DEFAULT 'cns_' || gen_random_uuid(),
    workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    site_id VARCHAR(64) NOT NULL REFERENCES pulse_websites(site_id) ON DELETE CASCADE,
    visitor_id VARCHAR(128) NOT NULL,
    consent_given BOOLEAN NOT NULL DEFAULT FALSE,
    categories JSONB NOT NULL DEFAULT '[]'::jsonb,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pulse_consent_visitor ON pulse_consent_records(workspace_id, visitor_id);

-- ==============================================================================
-- 11. USERS SECURITY, SAFE VIEW & AUTHENTICATION ISOLATION (Phase 5.2 & 5.2.2)
-- ==============================================================================
-- Safe public view with security_invoker = true and embedded tenant isolation predicate
CREATE OR REPLACE VIEW workspace_users
WITH (security_invoker = true) AS
SELECT 
    u.id,
    u.email,
    u.name,
    u.status,
    u.avatar_url,
    u.phone,
    u.created_at,
    u.updated_at
FROM users u
WHERE u.deleted_at IS NULL
  AND (
      u.id = NULLIF(current_setting('app.current_user_id', true), '')
      OR EXISTS (
          SELECT 1 
          FROM workspace_memberships wm
          WHERE wm.user_id = u.id
            AND wm.workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')
            AND wm.status = 'active'
      )
  );



