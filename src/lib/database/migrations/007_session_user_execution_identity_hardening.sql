-- ==============================================================================
-- Migration 007: Execution Identity & Session User Authorization Hardening
-- Developster Hub CRM — Phase 5.2.5 Security Remediation & Verification
-- 
-- REMEDIATED:
-- 1. Defect: SECURITY DEFINER Execution Identity Trap in set_tenant_context
--    - In PostgreSQL, inside a SECURITY DEFINER function, CURRENT_USER (and USER)
--      evaluates to the role that OWNS the function (e.g. app_admin or postgres).
--    - Consequently, checking `CURRENT_USER NOT IN ('app_admin', 'postgres')`
--      ALWAYS evaluated to FALSE when called by app_user because CURRENT_USER had
--      switched to the definer, allowing unprivileged callers to bypass the NULL user guard.
--    - Remediation: Inspect SESSION_USER (the authenticating connection role).
--      SESSION_USER represents the actual connection identity (app_user, auth_user, etc.)
--      and cannot be forged by app_user because app_user is created WITH NOINHERIT
--      and has no permissions to execute SET SESSION AUTHORIZATION or SET ROLE app_admin.
-- 2. Principle of Least Privilege for auth_user:
--    - Explicitly revoke set_tenant_context from auth_user.
--    - auth_user is dedicated strictly to authentication credential retrieval and lockout
--      tracking, and must have zero permission to switch tenant contexts.
-- 3. Reinforcement of Role Hierarchy in workspace_invite_member:
--    - Re-affirms that Admin callers cannot invite or promote any user to Owner.
--    - Restricts function execution strictly to app_user and app_admin.
-- ==============================================================================

-- ==============================================================================
-- 1. HARDEN TENANT CONTEXT EXECUTION IDENTITY (SESSION_USER Check)
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

    -- Verify workspace exists and is active (bypasses RLS because function is SECURITY DEFINER)
    IF NOT EXISTS (
        SELECT 1 FROM public.workspaces w
        WHERE w.id = p_workspace_id AND w.status = 'active'
    ) THEN
        RAISE EXCEPTION 'Tenant Boundary Violation: Workspace % does not exist or is not active', p_workspace_id;
    END IF;

    -- Guard against omitting user ID for tenant switching
    IF p_user_id IS NULL OR length(trim(p_user_id)) = 0 THEN
        -- CRITICAL: Inside a SECURITY DEFINER function, CURRENT_USER is the function owner (app_admin/postgres).
        -- We MUST evaluate SESSION_USER to identify the calling client database connection role!
        IF SESSION_USER NOT IN ('app_admin', 'postgres') THEN
            RAISE EXCEPTION 'Authorization Error: User identity required for tenant context under session role %', SESSION_USER;
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

-- Revoke from PUBLIC and auth_user (auth_user never requires tenant context switching)
REVOKE ALL ON FUNCTION set_tenant_context(VARCHAR, VARCHAR) FROM PUBLIC, auth_user;
-- Grant exclusively to application runtime and administrative roles
GRANT EXECUTE ON FUNCTION set_tenant_context(VARCHAR, VARCHAR) TO app_user, app_admin;

-- ==============================================================================
-- 2. REINFORCE MEMBER INVITATION ROLE HIERARCHY
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

REVOKE ALL ON FUNCTION workspace_invite_member(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, auth_user;
GRANT EXECUTE ON FUNCTION workspace_invite_member(TEXT, TEXT, TEXT, TEXT) TO app_user, app_admin;

-- ==============================================================================
-- 3. RE-ASSERT LEAST PRIVILEGE ON AUTHENTICATION FUNCTIONS
-- ==============================================================================
REVOKE ALL ON FUNCTION auth_get_user_for_login(TEXT) FROM PUBLIC, app_user;
REVOKE ALL ON FUNCTION auth_record_login_failure(TEXT, INT) FROM PUBLIC, app_user;
REVOKE ALL ON FUNCTION auth_record_login_success(TEXT, VARCHAR) FROM PUBLIC, app_user;

GRANT EXECUTE ON FUNCTION auth_get_user_for_login(TEXT) TO auth_user, app_admin;
GRANT EXECUTE ON FUNCTION auth_record_login_failure(TEXT, INT) TO auth_user, app_admin;
GRANT EXECUTE ON FUNCTION auth_record_login_success(TEXT, VARCHAR) TO auth_user, app_admin;
