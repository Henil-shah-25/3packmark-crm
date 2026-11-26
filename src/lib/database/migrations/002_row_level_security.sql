-- ==============================================================================
-- Migration 002: PostgreSQL Row-Level Security (RLS) & Tenant Isolation
-- Developster Hub CRM — Phase 5 Security Remediation
-- 
-- REMEDIATED:
-- - Removed unsafe user-settable GUC `app.is_master_admin` bypass (CRIT-02)
-- - Bound policies explicitly TO app_user
-- - Enforced strict workspace tenant isolation without backdoor session flags
-- ==============================================================================

-- 1. Helper function to retrieve active transaction workspace context safely
CREATE OR REPLACE FUNCTION get_active_workspace_id() RETURNS TEXT AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_workspace_id', true), '');
END;
$$ LANGUAGE plpgsql STABLE;

-- Deprecated: Kept only as a stub returning FALSE to prevent callers from breaking.
-- User-controlled session variables are prohibited as proof of Master Admin authority.
CREATE OR REPLACE FUNCTION is_master_admin_session() RETURNS BOOLEAN AS $$
BEGIN
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE;

-- ==============================================================================
-- 2. ENABLE RLS AND POLICIES FOR WORKSPACES
-- ==============================================================================
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;

CREATE POLICY workspace_tenant_isolation ON workspaces
    FOR ALL
    TO app_user
    USING (
        id = get_active_workspace_id()
    )
    WITH CHECK (
        id = get_active_workspace_id()
    );

-- ==============================================================================
-- 3. ENABLE RLS AND POLICIES FOR WORKSPACE MEMBERSHIPS
-- ==============================================================================
ALTER TABLE workspace_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_memberships FORCE ROW LEVEL SECURITY;

CREATE POLICY membership_tenant_isolation ON workspace_memberships
    FOR ALL
    TO app_user
    USING (
        workspace_id = get_active_workspace_id()
    )
    WITH CHECK (
        workspace_id = get_active_workspace_id()
    );

-- ==============================================================================
-- 4. ENABLE RLS AND POLICIES FOR SUBSCRIPTIONS & USAGE
-- ==============================================================================
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;

CREATE POLICY subscription_tenant_isolation ON subscriptions
    FOR ALL
    TO app_user
    USING (
        workspace_id = get_active_workspace_id()
    )
    WITH CHECK (
        workspace_id = get_active_workspace_id()
    );

ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_counters FORCE ROW LEVEL SECURITY;

CREATE POLICY usage_tenant_isolation ON usage_counters
    FOR ALL
    TO app_user
    USING (
        workspace_id = get_active_workspace_id()
    )
    WITH CHECK (
        workspace_id = get_active_workspace_id()
    );

-- ==============================================================================
-- 5. ENABLE RLS AND POLICIES FOR INTEGRATIONS & CREDENTIALS
-- ==============================================================================
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations FORCE ROW LEVEL SECURITY;

CREATE POLICY integration_tenant_isolation ON integrations
    FOR ALL
    TO app_user
    USING (
        workspace_id = get_active_workspace_id()
    )
    WITH CHECK (
        workspace_id = get_active_workspace_id()
    );

ALTER TABLE integration_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_credentials FORCE ROW LEVEL SECURITY;

CREATE POLICY credentials_tenant_isolation ON integration_credentials
    FOR ALL
    TO app_user
    USING (
        workspace_id = get_active_workspace_id()
    )
    WITH CHECK (
        workspace_id = get_active_workspace_id()
    );

-- ==============================================================================
-- 6. ENABLE RLS AND POLICIES FOR WEBHOOK IDEMPOTENCY
-- ==============================================================================
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries FORCE ROW LEVEL SECURITY;

CREATE POLICY webhook_tenant_isolation ON webhook_deliveries
    FOR ALL
    TO app_user
    USING (
        workspace_id = get_active_workspace_id()
    )
    WITH CHECK (
        workspace_id = get_active_workspace_id()
    );

-- ==============================================================================
-- 7. ENABLE RLS AND POLICIES FOR AUDIT LOGS
-- ==============================================================================
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_tenant_isolation ON audit_logs
    FOR ALL
    TO app_user
    USING (
        workspace_id = get_active_workspace_id()
    )
    WITH CHECK (
        workspace_id = get_active_workspace_id()
    );

-- ==============================================================================
-- 8. ENABLE RLS AND POLICIES FOR PULSE VISITOR INTELLIGENCE
-- ==============================================================================
ALTER TABLE pulse_websites ENABLE ROW LEVEL SECURITY;
ALTER TABLE pulse_websites FORCE ROW LEVEL SECURITY;

CREATE POLICY pulse_websites_tenant_isolation ON pulse_websites
    FOR ALL
    TO app_user
    USING (
        workspace_id = get_active_workspace_id()
    )
    WITH CHECK (
        workspace_id = get_active_workspace_id()
    );

ALTER TABLE pulse_visitor_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pulse_visitor_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY pulse_sessions_tenant_isolation ON pulse_visitor_sessions
    FOR ALL
    TO app_user
    USING (
        workspace_id = get_active_workspace_id()
    )
    WITH CHECK (
        workspace_id = get_active_workspace_id()
    );

ALTER TABLE pulse_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE pulse_events FORCE ROW LEVEL SECURITY;

CREATE POLICY pulse_events_tenant_isolation ON pulse_events
    FOR ALL
    TO app_user
    USING (
        workspace_id = get_active_workspace_id()
    )
    WITH CHECK (
        workspace_id = get_active_workspace_id()
    );

ALTER TABLE pulse_consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE pulse_consent_records FORCE ROW LEVEL SECURITY;

CREATE POLICY pulse_consent_tenant_isolation ON pulse_consent_records
    FOR ALL
    TO app_user
    USING (
        workspace_id = get_active_workspace_id()
    )
    WITH CHECK (
        workspace_id = get_active_workspace_id()
    );
