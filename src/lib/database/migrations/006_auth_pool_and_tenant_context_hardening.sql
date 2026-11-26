-- ==============================================================================
-- Migration 006: Auth Connection Pool & Tenant Context Authorization Hardening
-- Developster Hub CRM — Phase 5.2.4 Security Remediation
-- 
-- REMEDIATED:
-- 1. Finding 1 (P0): Dedicated Authentication Connection Pool
--    - Re-asserts dedicated auth_user role privileges for authentication functions
--    - Ensures absolute separation: app_user has zero access to auth_* credential functions
--    - auth_user has least-privilege EXECUTE permissions exclusively on:
--      * auth_get_user_for_login(TEXT)
--      * auth_record_login_failure(TEXT, INT)
--      * auth_record_login_success(TEXT, VARCHAR)
-- 2. Finding 2 (P1): Tenant Context Spoofing via NULL User Parameter
--    - Hardens set_tenant_context() function
--    - When p_user_id is NULL or empty, verifies calling database role is app_admin or postgres
--    - Strictly blocks app_user from establishing workspace context without valid user binding
--    - Validates active membership when p_user_id is provided
-- 3. Finding 3 (P2): Role Hierarchy Enforcement in Member Invitations
--    - Hardens workspace_invite_member() function
--    - Strictly prevents Admin callers from inviting or granting the 'Owner' role
--    - Only existing workspace Owners can grant the Owner role
-- ==============================================================================

-- ==============================================================================
-- 1. HARDEN TENANT CONTEXT SWITCHING (Finding 2 — P1)
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

    -- Guard against omitting user ID for tenant switching
    IF p_user_id IS NULL OR length(trim(p_user_id)) = 0 THEN
        -- Only administrative maintenance roles can establish workspace-only context without user binding
        IF CURRENT_USER NOT IN ('app_admin', 'postgres') THEN
            RAISE EXCEPTION 'Authorization Error: User identity required for tenant context under role %', CURRENT_USER;
        END IF;
        -- Explicitly clear user context for admin maintenance sessions
        PERFORM set_config('app.current_user_id', '', true);
    ELSE
        -- Verify active membership for the specified user
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

-- ==============================================================================
-- 2. HARDEN MEMBER INVITATION & ROLE HIERARCHY (Finding 3 — P2)
-- ==============================================================================
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

    -- Enforce role hierarchy: Admin cannot grant Owner role
    IF p_role = 'Owner' AND v_caller_role != 'Owner' THEN
        RAISE EXCEPTION 'Authorization Error: Only workspace Owners can grant the Owner role';
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
-- 3. RE-ASSERT LEAST-PRIVILEGE ROLE PERMISSIONS (Finding 1 — P0)
-- ==============================================================================
-- Ensure auth_user role exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'auth_user') THEN
        CREATE ROLE auth_user WITH LOGIN NOINHERIT NOBYPASSRLS;
    END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO auth_user;

-- Explicitly revoke authentication function execution from general application role and PUBLIC
REVOKE ALL ON FUNCTION auth_get_user_for_login(TEXT) FROM PUBLIC, app_user;
REVOKE ALL ON FUNCTION auth_record_login_failure(TEXT, INT) FROM PUBLIC, app_user;
REVOKE ALL ON FUNCTION auth_record_login_success(TEXT, VARCHAR) FROM PUBLIC, app_user;

-- Grant execution strictly to dedicated auth_user role and app_admin
GRANT EXECUTE ON FUNCTION auth_get_user_for_login(TEXT) TO auth_user, app_admin;
GRANT EXECUTE ON FUNCTION auth_record_login_failure(TEXT, INT) TO auth_user, app_admin;
GRANT EXECUTE ON FUNCTION auth_record_login_success(TEXT, VARCHAR) TO auth_user, app_admin;
