-- ==============================================================================
-- Migration 003: Least-Privilege Database Roles & Permissions
-- Developster Hub CRM — Phase 5 Security Remediation
-- 
-- REMEDIATED:
-- - app_admin created WITH NOINHERIT to prevent accidental privilege inheritance (MED-05)
-- - app_user explicitly denied SUPERUSER and BYPASSRLS
-- - is_master_admin_session revoked from app_user
-- ==============================================================================

-- 1. Create Application Runtime Role (NOBYPASSRLS, NOINHERIT)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user WITH LOGIN NOINHERIT NOBYPASSRLS;
    END IF;
END
$$;

-- 2. Create Migration / Platform Administrator Role (NOINHERIT, explicit BYPASSRLS)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_admin') THEN
        CREATE ROLE app_admin WITH LOGIN NOINHERIT BYPASSRLS;
    END IF;
END
$$;

-- Revoke all default public permissions
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

-- 3. Grant schema usage
GRANT USAGE ON SCHEMA public TO app_user;
GRANT USAGE ON SCHEMA public TO app_admin;

-- 4. Grant Runtime Application Permissions to app_user (CRUD only, NO DDL)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    workspaces,
    users,
    workspace_memberships,
    subscriptions,
    usage_counters,
    integrations,
    integration_credentials,
    session_revocations,
    webhook_deliveries,
    audit_logs,
    pulse_websites,
    pulse_visitor_sessions,
    pulse_events,
    pulse_consent_records
TO app_user;

-- Grant execution of tenant helper functions (strictly get_active_workspace_id only)
GRANT EXECUTE ON FUNCTION get_active_workspace_id() TO app_user;
REVOKE EXECUTE ON FUNCTION is_master_admin_session() FROM PUBLIC, app_user;

-- 5. Grant Migration Admin full permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO app_admin;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO app_admin;

-- Ensure app_user is NEVER granted SUPERUSER or BYPASSRLS
ALTER ROLE app_user NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
