-- ==============================================================================
-- Migration 004: Users Table Security, Row-Level Security & Auth Credential Isolation
-- Developster Hub CRM — Phase 5.2 Critical Security Remediation
-- 
-- REMEDIATED:
-- - P0-2: Enable and force Row-Level Security on `users` table
-- - Restrict user record visibility strictly to active workspace members or self
-- - Prevent recursive RLS evaluation via STABLE SECURITY DEFINER helper
-- - Revoke direct access to password hashes, MFA secrets and lockout internals from app_user
-- - Provide hardened SECURITY DEFINER functions for login credential verification
-- - Provide safe workspace_users view omitting authentication credentials
-- ==============================================================================

-- 1. Helper function: check if user is an active member of the transaction's active workspace.
-- Defined as SECURITY DEFINER with fixed search_path to eliminate recursive RLS evaluation
-- between users and workspace_memberships.
CREATE OR REPLACE FUNCTION is_user_in_active_workspace(p_user_id VARCHAR(64))
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.workspace_memberships wm
        WHERE wm.user_id = p_user_id
          AND wm.workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')
          AND wm.status = 'active'
    );
$$;

-- Helper function: get current authenticated user ID from transaction context
CREATE OR REPLACE FUNCTION get_active_user_id()
RETURNS VARCHAR(64)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT NULLIF(current_setting('app.current_user_id', true), '')::VARCHAR(64);
$$;

-- 2. ENABLE AND FORCE ROW LEVEL SECURITY ON USERS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

-- 3. DEFINE GRANULAR ROW LEVEL SECURITY POLICIES ON USERS

-- SELECT Policy: Users can only see themselves OR other users in the same active workspace
CREATE POLICY users_tenant_isolation_select ON users
    FOR SELECT
    TO app_user
    USING (
        id = get_active_user_id()
        OR is_user_in_active_workspace(id)
    );

-- UPDATE Policy: Users can only update their own profile details
CREATE POLICY users_self_update ON users
    FOR UPDATE
    TO app_user
    USING (
        id = get_active_user_id()
    )
    WITH CHECK (
        id = get_active_user_id()
    );

-- INSERT Policy: New users can be registered within a workspace context or self-registration
CREATE POLICY users_tenant_insert ON users
    FOR INSERT
    TO app_user
    WITH CHECK (
        id = get_active_user_id()
        OR NULLIF(current_setting('app.current_workspace_id', true), '') IS NOT NULL
    );

-- Deletion of user records is restricted to app_admin (no DELETE policy for app_user).

-- 4. HARDEN PRIVILEGES & PREVENT CREDENTIAL LEAKAGE
-- Revoke existing broad table-level permissions from app_user
REVOKE ALL ON TABLE users FROM app_user;

-- Grant column-level SELECT on non-sensitive profile columns only.
-- Sensitive columns (password_hash, failed_login_attempts, locked_until, is_master_admin)
-- are NOT readable by app_user through general queries.
GRANT SELECT (id, email, name, status, avatar_url, phone, created_at, updated_at)
    ON TABLE users TO app_user;

-- Grant column-level UPDATE on safe profile fields only
GRANT UPDATE (name, avatar_url, phone, updated_at)
    ON TABLE users TO app_user;

-- Grant column-level INSERT for user registration
GRANT INSERT (id, email, name, status, avatar_url, phone, created_at, updated_at)
    ON TABLE users TO app_user;

-- 5. HARDENED SECURITY DEFINER FUNCTIONS FOR AUTHENTICATION
-- Required for login credential verification without exposing hashes to general queries.
CREATE OR REPLACE FUNCTION auth_get_user_for_login(p_email TEXT)
RETURNS TABLE (
    id VARCHAR(64),
    email VARCHAR(255),
    password_hash VARCHAR(255),
    status VARCHAR(50),
    failed_login_attempts INT,
    locked_until TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Strict input validation
    IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT 
        u.id,
        u.email,
        u.password_hash,
        u.status,
        u.failed_login_attempts,
        u.locked_until
    FROM public.users u
    WHERE LOWER(u.email) = LOWER(trim(p_email))
      AND u.deleted_at IS NULL
    LIMIT 1;
END;
$$;

-- Function to record authentication result (lockout / attempt count / last login)
CREATE OR REPLACE FUNCTION auth_record_login_result(
    p_user_id VARCHAR(64),
    p_success BOOLEAN,
    p_locked_until TIMESTAMPTZ DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_user_id IS NULL OR length(trim(p_user_id)) = 0 THEN
        RETURN;
    END IF;

    IF p_success THEN
        UPDATE public.users
        SET failed_login_attempts = 0,
            locked_until = NULL,
            last_login_at = NOW(),
            updated_at = NOW()
        WHERE id = p_user_id;
    ELSE
        UPDATE public.users
        SET failed_login_attempts = failed_login_attempts + 1,
            locked_until = COALESCE(p_locked_until, locked_until),
            updated_at = NOW()
        WHERE id = p_user_id;
    END IF;
END;
$$;

-- Grant EXECUTE on auth functions to app_user and app_admin
REVOKE ALL ON FUNCTION auth_get_user_for_login(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_record_login_result(VARCHAR, BOOLEAN, TIMESTAMPTZ) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION auth_get_user_for_login(TEXT) TO app_user, app_admin;
GRANT EXECUTE ON FUNCTION auth_record_login_result(VARCHAR, BOOLEAN, TIMESTAMPTZ) TO app_user, app_admin;
GRANT EXECUTE ON FUNCTION is_user_in_active_workspace(VARCHAR) TO app_user, app_admin;
GRANT EXECUTE ON FUNCTION get_active_user_id() TO app_user, app_admin;

-- 6. SAFE PUBLIC VIEW FOR WORKSPACE USER DIRECTORY
CREATE OR REPLACE VIEW workspace_users AS
SELECT 
    u.id,
    u.email,
    u.name,
    u.status,
    u.avatar_url,
    u.phone,
    u.created_at,
    u.updated_at
FROM public.users u;

GRANT SELECT ON workspace_users TO app_user, app_admin;

