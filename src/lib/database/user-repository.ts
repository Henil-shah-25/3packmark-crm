/**
 * Multi-Tenant PostgreSQL User & Authentication Repository
 * Developster Hub CRM — Phase 5.2 Critical Security Remediation
 * 
 * Enforces:
 * - P0-2: Isolation of user records across workspaces
 * - Zero exposure of password hashes or MFA secrets through general user queries
 * - Secure authentication credential retrieval via SECURITY DEFINER functions
 * - Safe workspace user directory views with column-level privilege protection
 */

import { getPostgresPool, getAuthPostgresPool, isPostgresConfigured, withTenantTransaction, memoryDb } from './client';
import { ParameterizedQuery } from './query-builder';

export interface AuthUserRecord {
  id: string;
  email: string;
  passwordHash: string | null;
  status: string;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
}

export interface WorkspaceUser {
  id: string;
  email: string;
  name: string;
  status: string;
  avatarUrl?: string | null;
  phone?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateUserProfileInput {
  name?: string;
  avatarUrl?: string;
  phone?: string;
}

export class PostgresUserRepository {
  /**
   * Retrieves authentication credentials for a user by email.
   * Invokes the hardened SECURITY DEFINER function `auth_get_user_for_login(p_email)`.
   * Never exposed to general application tenant queries.
   */
  async getUserForLogin(email: string): Promise<AuthUserRecord | null> {
    if (!email || typeof email !== 'string' || !email.trim()) {
      return null;
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (isPostgresConfigured()) {
      const pool = getAuthPostgresPool();
      const res = await pool.query(
        'SELECT id, email, password_hash as "passwordHash", status, failed_login_attempts as "failedLoginAttempts", locked_until as "lockedUntil" FROM auth_get_user_for_login($1)',
        [normalizedEmail]
      );

      if (!res.rows || res.rows.length === 0) {
        return null;
      }

      const row = res.rows[0];
      return {
        id: row.id,
        email: row.email,
        passwordHash: row.passwordHash,
        status: row.status,
        failedLoginAttempts: parseInt(row.failedLoginAttempts || '0', 10),
        lockedUntil: row.lockedUntil ? new Date(row.lockedUntil) : null,
      };
    }

    // In-memory fallback for local test execution
    const usersTable = memoryDb.getTable('users');
    const user = usersTable.find(
      (u) => typeof u.email === 'string' && u.email.toLowerCase() === normalizedEmail && !u.deleted_at
    );

    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      passwordHash: user.password_hash || null,
      status: user.status || 'active',
      failedLoginAttempts: user.failed_login_attempts || 0,
      lockedUntil: user.locked_until ? new Date(user.locked_until) : null,
    };
  }

  /**
   * Records authentication outcome (success resets failed attempts; failure increments / locks).
   * Routes to tamper-resistant functions auth_record_login_success / auth_record_login_failure.
   */
  async recordLoginResult(userId: string, success: boolean, lockedUntil?: Date | null, email?: string): Promise<void> {
    if (!userId && !email) return;

    if (isPostgresConfigured()) {
      const pool = getAuthPostgresPool();
      if (success) {
        await pool.query(
          'SELECT auth_record_login_success($1, $2)',
          [email || userId, `jti_${Date.now()}`]
        );
      } else {
        const lockoutSec = lockedUntil ? Math.max(1, Math.round((lockedUntil.getTime() - Date.now()) / 1000)) : 1200;
        await pool.query(
          'SELECT * FROM auth_record_login_failure($1, $2)',
          [email || userId, lockoutSec]
        );
      }
      return;
    }

    // In-memory fallback for tests
    const usersTable = memoryDb.getTable('users');
    const user = usersTable.find((u) => u.id === userId || (email && u.email.toLowerCase() === email.toLowerCase()));
    if (user) {
      if (success) {
        user.failed_login_attempts = 0;
        user.locked_until = null;
        user.last_login_at = new Date().toISOString();
      } else {
        user.failed_login_attempts = (user.failed_login_attempts || 0) + 1;
        if (lockedUntil) {
          user.locked_until = lockedUntil.toISOString();
        } else if (user.failed_login_attempts >= 3) {
          user.locked_until = new Date(Date.now() + 1200 * 1000).toISOString();
        }
      }
      user.updated_at = new Date().toISOString();
    }
  }

  /**
   * Records failed login attempt atomically, enforcing lockout threshold.
   */
  async recordLoginFailure(email: string, lockoutSeconds = 1200): Promise<{ failedAttempts: number; isLocked: boolean; lockedUntil: Date | null }> {
    if (!email || !email.trim()) return { failedAttempts: 0, isLocked: false, lockedUntil: null };

    if (isPostgresConfigured()) {
      const pool = getAuthPostgresPool();
      const res = await pool.query(
        'SELECT failed_attempts as "failedAttempts", is_locked as "isLocked", locked_until as "lockedUntil" FROM auth_record_login_failure($1, $2)',
        [email.trim().toLowerCase(), lockoutSeconds]
      );
      if (res.rows && res.rows[0]) {
        return {
          failedAttempts: res.rows[0].failedAttempts,
          isLocked: Boolean(res.rows[0].isLocked),
          lockedUntil: res.rows[0].lockedUntil ? new Date(res.rows[0].lockedUntil) : null,
        };
      }
      return { failedAttempts: 0, isLocked: false, lockedUntil: null };
    }

    // In-memory fallback
    const usersTable = memoryDb.getTable('users');
    const user = usersTable.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user) return { failedAttempts: 0, isLocked: false, lockedUntil: null };

    user.failed_login_attempts = (user.failed_login_attempts || 0) + 1;
    let lockedUntil: Date | null = null;
    if (user.failed_login_attempts >= 3) {
      lockedUntil = new Date(Date.now() + lockoutSeconds * 1000);
      user.locked_until = lockedUntil.toISOString();
    }
    user.updated_at = new Date().toISOString();

    return {
      failedAttempts: user.failed_login_attempts,
      isLocked: Boolean(lockedUntil),
      lockedUntil,
    };
  }

  /**
   * Records successful login: clears failed attempts, resets lockouts, and records timestamp.
   */
  async recordLoginSuccess(email: string, sessionJti: string): Promise<boolean> {
    if (!email || !sessionJti) return false;

    if (isPostgresConfigured()) {
      const pool = getAuthPostgresPool();
      const res = await pool.query(
        'SELECT auth_record_login_success($1, $2)',
        [email.trim().toLowerCase(), sessionJti]
      );
      return Boolean(res.rows[0]?.auth_record_login_success);
    }

    // In-memory fallback
    const usersTable = memoryDb.getTable('users');
    const user = usersTable.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (user) {
      user.failed_login_attempts = 0;
      user.locked_until = null;
      user.last_login_at = new Date().toISOString();
      user.updated_at = new Date().toISOString();
      return true;
    }
    return false;
  }

  /**
   * Invites a new team member to the workspace atomically.
   * Requires the caller to be an active Owner or Admin of the target workspace.
   */
  async inviteWorkspaceMember(
    workspaceId: string,
    callerUserId: string,
    email: string,
    name: string,
    role: string,
    initialPasswordHash?: string
  ): Promise<{ userId: string; membershipId: string; email: string; role: string; status: string }> {
    if (!workspaceId || !callerUserId || !email || !name || !role) {
      throw new Error('Validation Error: Missing required invitation parameters');
    }

    return withTenantTransaction({ workspaceId, userId: callerUserId }, async (executor) => {
      if (isPostgresConfigured()) {
        const query: ParameterizedQuery = {
          text: 'SELECT user_id as "userId", membership_id as "membershipId", email, role, status FROM workspace_invite_member($1, $2, $3, $4)',
          values: [email.trim().toLowerCase(), name.trim(), role, initialPasswordHash || null],
        };
        const res = await executor.query(query);
        if (!res.rows || res.rows.length === 0) {
          throw new Error('Invitation Error: Failed to invite member');
        }
        return res.rows[0];
      }

      // In-memory simulation of workspace_invite_member:
      const membershipsTable = memoryDb.getTable('workspace_memberships');
      const callerMembership = membershipsTable.find(
        (m) => m.workspace_id === workspaceId && m.user_id === callerUserId && m.status === 'active'
      );

      if (!callerMembership || !['Owner', 'Admin'].includes(callerMembership.role)) {
        throw new Error('Authorization Error: Only workspace Owners or Admins can invite new members');
      }

      // Enforce role hierarchy: Admin cannot grant Owner role
      if (role === 'Owner' && callerMembership.role !== 'Owner') {
        throw new Error('Authorization Error: Only workspace Owners can grant the Owner role');
      }

      const usersTable = memoryDb.getTable('users');
      const normEmail = email.trim().toLowerCase();
      let targetUser = usersTable.find((u) => u.email.toLowerCase() === normEmail);

      if (!targetUser) {
        targetUser = {
          id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          email: normEmail,
          name: name.trim(),
          password_hash: initialPasswordHash || null,
          status: 'invited',
          failed_login_attempts: 0,
          locked_until: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        usersTable.push(targetUser);
      }

      // Check duplicate membership
      const existingMembership = membershipsTable.find(
        (m) => m.workspace_id === workspaceId && m.user_id === targetUser.id
      );
      if (existingMembership) {
        throw new Error('Conflict Error: User is already a member of this workspace');
      }

      const newMembership = {
        id: `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        workspace_id: workspaceId,
        user_id: targetUser.id,
        role,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      membershipsTable.push(newMembership);

      return {
        userId: targetUser.id,
        membershipId: newMembership.id,
        email: normEmail,
        role,
        status: 'active',
      };
    });
  }

  /**
   * Retrieves users within the active workspace.
   * Executes within a transaction with tenant context and reads from the sanitized `workspace_users` view.
   * Credential fields (password_hash, etc.) are strictly omitted.
   */
  async getWorkspaceUsers(workspaceId: string, currentUserId?: string): Promise<WorkspaceUser[]> {
    return withTenantTransaction({ workspaceId, userId: currentUserId }, async (executor) => {
      if (isPostgresConfigured()) {
        const query: ParameterizedQuery = {
          text: 'SELECT id, email, name, status, avatar_url as "avatarUrl", phone, created_at as "createdAt", updated_at as "updatedAt" FROM workspace_users ORDER BY name ASC',
          values: [],
        };
        const res = await executor.query<WorkspaceUser>(query);
        return res.rows;
      }

      // In-memory simulation of RLS on users table:
      // A user is visible if they are an active member of workspaceId OR matches currentUserId
      const usersTable = memoryDb.getTable('users');
      const membershipsTable = memoryDb.getTable('workspace_memberships');
      const activeMemberUserIds = new Set(
        membershipsTable
          .filter((m) => m.workspace_id === workspaceId && m.status === 'active')
          .map((m) => m.user_id)
      );

      return usersTable
        .filter((u) => !u.deleted_at && (activeMemberUserIds.has(u.id) || (currentUserId && u.id === currentUserId)))
        .map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          status: u.status || 'active',
          avatarUrl: u.avatar_url || null,
          phone: u.phone || null,
          createdAt: u.created_at || new Date().toISOString(),
          updatedAt: u.updated_at || new Date().toISOString(),
        }));
    });
  }

  /**
   * Retrieves a single user record by ID within workspace context.
   */
  async getUserById(workspaceId: string, targetUserId: string, currentUserId?: string): Promise<WorkspaceUser | null> {
    const users = await this.getWorkspaceUsers(workspaceId, currentUserId);
    return users.find((u) => u.id === targetUserId) || null;
  }

  /**
   * Updates a user's own profile. Enforces that only self-updates are permitted.
   */
  async updateUserProfile(
    workspaceId: string,
    userId: string,
    updates: UpdateUserProfileInput
  ): Promise<boolean> {
    if (!userId || !workspaceId) return false;

    return withTenantTransaction({ workspaceId, userId }, async (executor) => {
      if (isPostgresConfigured()) {
        const query: ParameterizedQuery = {
          text: `UPDATE users 
                 SET name = COALESCE($1, name),
                     avatar_url = COALESCE($2, avatar_url),
                     phone = COALESCE($3, phone),
                     updated_at = NOW()
                 WHERE id = $4`,
          values: [updates.name || null, updates.avatarUrl || null, updates.phone || null, userId],
        };
        const res = await executor.query(query);
        return res.rowCount > 0;
      }

      // In-memory fallback
      const usersTable = memoryDb.getTable('users');
      const user = usersTable.find((u) => u.id === userId && !u.deleted_at);
      if (!user) return false;

      if (updates.name !== undefined) user.name = updates.name;
      if (updates.avatarUrl !== undefined) user.avatar_url = updates.avatarUrl;
      if (updates.phone !== undefined) user.phone = updates.phone;
      user.updated_at = new Date().toISOString();
      return true;
    });
  }
}

export const userRepository = new PostgresUserRepository();

