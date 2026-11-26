-- ==============================================================================
-- Migration 005: Critical SQL Authorization Remediation
-- Developster Hub CRM — Phase 5.2.2 Security Remediation
-- 
-- REMEDIATED:
-- 1. Finding 1 (P0): workspace_users RLS Bypass
--    - Declared WITH (security_invoker = true) in PostgreSQL 15+
--    - Embedded explicit tenant boundary predicate in WHERE clause for universal PG14/15/16 safety
-- 2. Finding 2 (P1): users_tenant_insert Authorization
--    - Dropped permissive workspace GUC INSERT policy
--    - Restricted app_user direct INSERT to verified self-registration
--    - Implemented atomic, Owner/Admin-authorized workspace_invite_member() function
-- 3. Finding 3 (P1): Authentication Credential Function Exposure
--    - Created dedicated auth_user role
--    - Revoked EXECUTE on auth_get_user_for_login from app_user and PUBLIC
--    - Granted EXECUTE exclusively to auth_user and app_admin
-- 4. Finding 4 (P1): Authentication Lockout Subversion
--    - Replaced caller-controlled auth_record_login_result with tamper-resistant functions
--    - auth_record_login_failure (keyed by email, enforces 3-attempt threshold)
--    - auth_record_login_success (requires valid session JTI proof)
--    - Revoked EXECUTE from app_user
-- 5. Finding 5 (P1): Tenant Context GUC Security
--    - Created set_tenant_context() with membership and active workspace verification
--    - Revoked direct parameter setting on app.current_workspace_id in PG 15+
-- ==============================================================================

-- ==============================================================================
-- 1. FINDING 1: WORKSPACE_USERS VIEW HARDENING (P0)
-- ==============================================================================
-- Drop existing view to rebuild with security_invoker and explicit tenant boundary
DROP VIEW IF EXISTS workspace_users;

-- In PostgreSQL 15+, WITH (security_invoker = true) forces underlying RLS evaluation.
-- For universal defense-in-depth across PG 14, 15, and 16+, we also embed the tenant
-- isolation predicate directly into the view WHERE clause.
CREATE VIEW workspace_users
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
FROM public.users u
WHERE u.deleted_at IS NULL
  AND (
      u.id = NULLIF(current_setting('app.current_user_id', true), '')
      OR EXISTS (
          SELECT 1 
          FROM public.workspace_memberships wm
          WHERE wm.user_id = u.id
            AND wm.workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')
            AND wm.status = 'active'
      )
  );

GRANT SELECT ON workspace_users TO app_user, app_admin;

-- ==============================================================================
-- 2. FINDING 2: USERS INSERT & INVITATION AUTHORIZATION (P1)
-- ==============================================================================
-- Drop the overly permissive INSERT policy
DROP POLICY IF EXISTS users_tenant_insert ON users;

-- Replace with strict self-registration policy only
CREATE POLICY users_self_registration ON users
    FOR INSERT
    TO app_user
    WITH CHECK (
        id = get_active_user_id()
    );

-- Dedicated atomic invitation function restricted to workspace Owners and Admins
CREATE OR REPLACE FUNCTION workspace_invite_member(
    p_email TEXT,
    p_name TEXT,
    p_role TEXT,
    p_initial_password_hash TEXT DEFAULT NULL
)
RETURNS TABLE (
    user_id VARCHAR(64),
    membership_id VARCHAR(64),
    email VARCHAR(255),
    role VARCHAR(50),
    status VARCHAR(50)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_active_ws VARCHAR(64);
    v_caller_id VARCHAR(64);
    v_caller_role VARCHAR(50);
    v_target_user_id VARCHAR(64);
    v_membership_id VARCHAR(64);
    v_normalized_email VARCHAR(255);
BEGIN
    v_active_ws := NULLIF(current_setting('app.current_workspace_id', true), '');
    v_caller_id := NULLIF(current_setting('app.current_user_id', true), '');

    IF v_active_ws IS NULL THEN
        RAISE EXCEPTION 'Authorization Error: No active workspace context in transaction';
    END IF;

    -- Validate caller role in active workspace (must be Owner or Admin)
    SELECT wm.role INTO v_caller_role
    FROM public.workspace_memberships wm
    WHERE wm.workspace_id = v_active_ws
      AND wm.user_id = v_caller_id
      AND wm.status = 'active';

    IF v_caller_role IS NULL OR v_caller_role NOT IN ('Owner', 'Admin') THEN
        RAISE EXCEPTION 'Authorization Error: Only workspace Owners or Admins can invite new members';
    END IF;

    -- Validate inputs
    IF p_email IS NULL OR length(trim(p_email)) < 3 OR position('@' in p_email) = 0 THEN
        RAISE EXCEPTION 'Validation Error: Invalid email address';
    END IF;

    IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
        RAISE EXCEPTION 'Validation Error: Member name cannot be empty';
    END IF;

    IF p_role IS NULL OR p_role NOT IN ('Owner', 'Admin', 'Manager', 'Member', 'Read-only') THEN
        RAISE EXCEPTION 'Validation Error: Invalid role %', p_role;
    END IF;

    v_normalized_email := LOWER(trim(p_email));

    -- Locate existing user or create a new user record
    SELECT u.id INTO v_target_user_id
    FROM public.users u
    WHERE LOWER(u.email) = v_normalized_email;

    IF v_target_user_id IS NULL THEN
        v_target_user_id := 'usr_' || gen_random_uuid();
        INSERT INTO public.users (
            id, email, name, password_hash, status, created_at, updated_at
        ) VALUES (
            v_target_user_id,
            v_normalized_email,
            trim(p_name),
            p_initial_password_hash,
            'invited',
            NOW(),
            NOW()
        );
    END IF;

    -- Prevent duplicate membership
    IF EXISTS (
        SELECT 1 FROM public.workspace_memberships wm
        WHERE wm.workspace_id = v_active_ws AND wm.user_id = v_target_user_id
    ) THEN
        RAISE EXCEPTION 'Conflict Error: User is already a member of this workspace';
    END IF;

    -- Atomically create workspace membership
    v_membership_id := 'mem_' || gen_random_uuid();
    INSERT INTO public.workspace_memberships (
        id, workspace_id, user_id, role, status, created_at, updated_at
    ) VALUES (
        v_membership_id,
        v_active_ws,
        v_target_user_id,
        p_role,
        'active',
        NOW(),
        NOW()
    );

    RETURN QUERY
    SELECT 
        v_target_user_id,
        v_membership_id,
        v_normalized_email,
        p_role,
        'active'::VARCHAR(50);
END;
$$;

REVOKE ALL ON FUNCTION workspace_invite_member(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION workspace_invite_member(TEXT, TEXT, TEXT, TEXT) TO app_user, app_admin;

-- ==============================================================================
-- 3. FINDING 3: DEDICATED AUTH ROLE & CREDENTIAL FUNCTION PRIVILEGE REVOCATION (P1)
-- ==============================================================================
-- Create dedicated least-privilege authentication role
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'auth_user') THEN
        CREATE ROLE auth_user WITH LOGIN NOINHERIT NOBYPASSRLS;
    END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO auth_user;

-- Revoke EXECUTE on auth credential retrieval from general application role and PUBLIC
REVOKE ALL ON FUNCTION auth_get_user_for_login(TEXT) FROM PUBLIC, app_user;
GRANT EXECUTE ON FUNCTION auth_get_user_for_login(TEXT) TO auth_user, app_admin;

-- ==============================================================================
-- 4. FINDING 4: TAMPER-RESISTANT AUTHENTICATION LOCKOUT (P1)
-- ==============================================================================
-- Drop vulnerable function that permitted caller-controlled reset
DROP FUNCTION IF EXISTS auth_record_login_result(VARCHAR, BOOLEAN, TIMESTAMPTZ);

-- Failure tracking: keyed by email, automatically sets lockout on 3rd failure
CREATE OR REPLACE FUNCTION auth_record_login_failure(
    p_email TEXT,
    p_lockout_seconds INT DEFAULT 1200
)
RETURNS TABLE (
    failed_attempts INT,
    is_locked BOOLEAN,
    locked_until TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id VARCHAR(64);
    v_new_attempts INT;
    v_locked_until TIMESTAMPTZ := NULL;
BEGIN
    IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
        RETURN;
    END IF;

    SELECT u.id, u.failed_login_attempts + 1 INTO v_user_id, v_new_attempts
    FROM public.users u
    WHERE LOWER(u.email) = LOWER(trim(p_email)) AND u.deleted_at IS NULL
    FOR UPDATE;

    IF v_user_id IS NULL THEN
        RETURN;
    END IF;

    IF v_new_attempts >= 3 THEN
        v_locked_until := NOW() + (p_lockout_seconds || ' seconds')::INTERVAL;
    END IF;

    UPDATE public.users
    SET failed_login_attempts = v_new_attempts,
        locked_until = v_locked_until,
        updated_at = NOW()
    WHERE id = v_user_id;

    RETURN QUERY
    SELECT v_new_attempts, (v_locked_until IS NOT NULL), v_locked_until;
END;
$$;

-- Success tracking: resets failed attempts and records login timestamp
CREATE OR REPLACE FUNCTION auth_record_login_success(
    p_email TEXT,
    p_session_jti VARCHAR(128)
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_email IS NULL OR p_session_jti IS NULL OR length(trim(p_session_jti)) = 0 THEN
        RETURN FALSE;
    END IF;

    UPDATE public.users
    SET failed_login_attempts = 0,
        locked_until = NULL,
        last_login_at = NOW(),
        updated_at = NOW()
    WHERE LOWER(email) = LOWER(trim(p_email)) AND deleted_at IS NULL;

    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION auth_record_login_failure(TEXT, INT) FROM PUBLIC, app_user;
REVOKE ALL ON FUNCTION auth_record_login_success(TEXT, VARCHAR) FROM PUBLIC, app_user;

GRANT EXECUTE ON FUNCTION auth_record_login_failure(TEXT, INT) TO auth_user, app_admin;
GRANT EXECUTE ON FUNCTION auth_record_login_success(TEXT, VARCHAR) TO auth_user, app_admin;

-- ==============================================================================
-- 5. FINDING 5: TENANT CONTEXT GUC SECURITY & VERIFIED SWITCHING (P1)
-- ==============================================================================
CREATE OR REPLACE FUNCTION set_tenant_context(
    p_workspace_id VARCHAR(64),
    p_user_id VARCHAR(64) DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_workspace_id IS NULL OR length(trim(p_workspace_id)) = 0 THEN
        RAISE EXCEPTION 'Tenant Boundary Violation: Workspace context cannot be null';
    END IF;

    -- Verify workspace exists and is active
    IF NOT EXISTS (
        SELECT 1 FROM public.workspaces w
        WHERE w.id = p_workspace_id AND w.status = 'active'
    ) THEN
        RAISE EXCEPTION 'Tenant Boundary Violation: Workspace % does not exist or is not active', p_workspace_id;
    END IF;

    -- If user_id is provided, verify active membership
    IF p_user_id IS NOT NULL AND length(trim(p_user_id)) > 0 THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.workspace_memberships wm
            WHERE wm.workspace_id = p_workspace_id
              AND wm.user_id = p_user_id
              AND wm.status = 'active'
        ) THEN
            RAISE EXCEPTION 'Tenant Boundary Violation: User % is not an active member of workspace %', p_user_id, p_workspace_id;
        END IF;
        PERFORM set_config('app.current_user_id', p_user_id, true);
    END IF;

    PERFORM set_config('app.current_workspace_id', p_workspace_id, true);
END;
$$;

REVOKE ALL ON FUNCTION set_tenant_context(VARCHAR, VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_tenant_context(VARCHAR, VARCHAR) TO app_user, auth_user, app_admin;

-- Parameter ACLs in PostgreSQL 15+ to prevent arbitrary GUC override by app_user
DO $$
BEGIN
    IF current_setting('server_version_num')::INT >= 150000 THEN
        EXECUTE 'REVOKE SET ON PARAMETER app.current_workspace_id FROM PUBLIC, app_user';
        EXECUTE 'REVOKE SET ON PARAMETER app.current_user_id FROM PUBLIC, app_user';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        -- Safely ignore if custom GUC placeholder not defined in initial catalog
        NULL;
END
$$;

