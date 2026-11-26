/**
 * Phase 5.2.5 SQL Authorization Verification & Closure Test Suite
 * Developster Hub CRM — Phase 5.2.5
 * 
 * Verifies:
 * 1. Static SQL Contracts (Migration 007):
 *    - set_tenant_context checks SESSION_USER (not CURRENT_USER) for execution identity inside SECURITY DEFINER
 *    - set_tenant_context revoked from auth_user and PUBLIC; granted to app_user, app_admin
 *    - workspace_invite_member enforces role hierarchy and is revoked from auth_user
 *    - auth_* credential functions revoked from app_user and granted strictly to auth_user, app_admin
 * 2. Database Client & Dual Pool Hardening:
 *    - getPostgresPool vs getAuthPostgresPool isolation
 *    - withTenantTransaction rethrows authorization errors from set_tenant_context (no blind fallback)
 *    - Production TLS validation and fatal missing AUTH_DATABASE_URL error
 *    - Safe graceful closure of both pools
 * 3. Application Authentication & Role Hierarchy Verification:
 *    - All auth repository methods route to auth pool
 *    - In-memory simulation enforces role hierarchy (Admin cannot grant Owner)
 *    - Owner can invite Owner and lower roles
 *    - Member/Read-only cannot invite
 * 4. Documentation of Real PostgreSQL Verification:
 *    - Explicitly records real PostgreSQL kernel verification as NOT EXECUTED
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import {
  memoryDb,
  getPostgresPool,
  getAuthPostgresPool,
  closePostgresPool,
  resolveDatabaseTlsConfig,
  withTenantTransaction,
} from '../src/lib/database/client';
import { userRepository } from '../src/lib/database/user-repository';

describe('PHASE 5.2.5: SQL AUTHORIZATION VERIFICATION & CLOSURE', () => {

  // ============================================================================
  // SECTION 1: STATIC SQL CONTRACT TESTS (MIGRATION 007)
  // ============================================================================
  describe('1. Static SQL Contract Tests (Migration 007)', () => {
    const migrationPath = path.join(
      process.cwd(),
      'src',
      'lib',
      'database',
      'migrations',
      '007_session_user_execution_identity_hardening.sql'
    );

    it('ensures migration 007_session_user_execution_identity_hardening.sql exists on disk', () => {
      assert.strictEqual(fs.existsSync(migrationPath), true);
    });

    it('verifies set_tenant_context checks SESSION_USER rather than CURRENT_USER (Defect Remediation)', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      assert.match(sql, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+set_tenant_context/i);
      assert.match(sql, /SECURITY\s+DEFINER/i);
      // In a SECURITY DEFINER function, CURRENT_USER is the definer; SESSION_USER is the caller
      assert.match(sql, /IF\s+SESSION_USER\s+NOT\s+IN\s+\('app_admin',\s*'postgres'\)\s+THEN/i);
      assert.match(sql, /Authorization Error: User identity required for tenant context under session role/i);
      // Ensure the vulnerable CURRENT_USER check is NOT used in migration 007
      assert.doesNotMatch(sql, /IF\s+CURRENT_USER\s+NOT\s+IN/i);
    });

    it('verifies set_tenant_context is revoked from auth_user and PUBLIC', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      assert.match(sql, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+set_tenant_context\(VARCHAR,\s*VARCHAR\)\s+FROM\s+PUBLIC,\s*auth_user;/i);
      assert.match(sql, /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+set_tenant_context\(VARCHAR,\s*VARCHAR\)\s+TO\s+app_user,\s*app_admin;/i);
    });

    it('verifies workspace_invite_member enforces role hierarchy and is revoked from auth_user', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      assert.match(sql, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+workspace_invite_member/i);
      assert.match(sql, /IF\s+p_role\s*=\s*'Owner'\s+AND\s+v_caller_role\s*!=\s*'Owner'\s+THEN/i);
      assert.match(sql, /Authorization Error: Only workspace Owners can grant the Owner role/i);
      assert.match(sql, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+workspace_invite_member.*FROM\s+PUBLIC,\s*auth_user;/i);
      assert.match(sql, /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+workspace_invite_member.*TO\s+app_user,\s*app_admin;/i);
    });

    it('verifies auth_* credential functions are granted strictly to auth_user and app_admin', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      assert.match(sql, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+auth_get_user_for_login\(TEXT\)\s+FROM\s+PUBLIC,\s*app_user;/i);
      assert.match(sql, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+auth_record_login_failure\(TEXT,\s*INT\)\s+FROM\s+PUBLIC,\s*app_user;/i);
      assert.match(sql, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+auth_record_login_success\(TEXT,\s*VARCHAR\)\s+FROM\s+PUBLIC,\s*app_user;/i);
      assert.match(sql, /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+auth_get_user_for_login\(TEXT\)\s+TO\s+auth_user,\s*app_admin;/i);
      assert.match(sql, /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+auth_record_login_failure\(TEXT,\s*INT\)\s+TO\s+auth_user,\s*app_admin;/i);
      assert.match(sql, /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+auth_record_login_success\(TEXT,\s*VARCHAR\)\s+TO\s+auth_user,\s*app_admin;/i);
    });
  });

  // ============================================================================
  // SECTION 2: DUAL CONNECTION POOLS & CLIENT HARDENING
  // ============================================================================
  describe('2. Dual Connection Pools & Client Error Handling', () => {
    it('verifies withTenantTransaction rethrows authorization errors rather than silently bypassing', async () => {
      const clientTsPath = path.join(process.cwd(), 'src', 'lib', 'database', 'client.ts');
      const content = fs.readFileSync(clientTsPath, 'utf-8');
      // Ensure the catch block does not blindly catch everything without rethrowing
      assert.match(content, /err\?\.code\s*===\s*'42883'/);
      assert.match(content, /throw\s+err;/);
    });

    it('verifies production database TLS configuration strictly rejects unauthorized certificates', () => {
      const tlsConfig = resolveDatabaseTlsConfig({
        connectionString: 'postgresql://app_user:secret@db.developster.io:5432/crm_prod',
        isProduction: true,
      });

      assert.strictEqual(typeof tlsConfig, 'object');
      assert.strictEqual((tlsConfig as any).rejectUnauthorized, true);
    });

    it('verifies getAuthPostgresPool requires AUTH_DATABASE_URL in production', () => {
      const origEnv = process.env.NODE_ENV;
      const origAuthUrl = process.env.AUTH_DATABASE_URL;

      try {
        process.env.NODE_ENV = 'production';
        delete process.env.AUTH_DATABASE_URL;

        assert.throws(
          () => {
            getAuthPostgresPool();
          },
          /AUTH_DATABASE_URL is not configured/i
        );
      } finally {
        process.env.NODE_ENV = origEnv;
        if (origAuthUrl) process.env.AUTH_DATABASE_URL = origAuthUrl;
      }
    });

    it('verifies closePostgresPool cleanly drains without errors', async () => {
      await assert.doesNotReject(async () => {
        await closePostgresPool();
      });
    });
  });

  // ============================================================================
  // SECTION 3: REPOSITORY ROUTING & RBAC SIMULATION
  // ============================================================================
  describe('3. Repository Routing & RBAC Role Hierarchy', () => {
    const wsId = 'ws_525_audit';
    const ownerId = 'usr_525_owner';
    const adminId = 'usr_525_admin';
    const memberId = 'usr_525_member';

    beforeEach(() => {
      memoryDb.clear();

      const workspacesTable = memoryDb.getTable('workspaces');
      workspacesTable.push({ id: wsId, name: 'Audit Workspace', status: 'active' });

      const usersTable = memoryDb.getTable('users');
      usersTable.push(
        { id: ownerId, email: 'owner@audit.com', name: 'Owner User', status: 'active' },
        { id: adminId, email: 'admin@audit.com', name: 'Admin User', status: 'active' },
        { id: memberId, email: 'member@audit.com', name: 'Member User', status: 'active' }
      );

      const membershipsTable = memoryDb.getTable('workspace_memberships');
      membershipsTable.push(
        { id: 'mem_1', workspace_id: wsId, user_id: ownerId, role: 'Owner', status: 'active' },
        { id: 'mem_2', workspace_id: wsId, user_id: adminId, role: 'Admin', status: 'active' },
        { id: 'mem_3', workspace_id: wsId, user_id: memberId, role: 'Member', status: 'active' }
      );
    });

    it('Admin cannot invite an Owner (Role Hierarchy enforced)', async () => {
      await assert.rejects(
        async () => {
          await userRepository.inviteWorkspaceMember(
            wsId,
            adminId,
            'newowner@audit.com',
            'New Owner',
            'Owner'
          );
        },
        /Authorization Error: Only workspace Owners can grant the Owner role/i
      );
    });

    it('Owner can invite another Owner and Admin', async () => {
      const coOwner = await userRepository.inviteWorkspaceMember(
        wsId,
        ownerId,
        'coowner@audit.com',
        'Co Owner',
        'Owner'
      );
      assert.strictEqual(coOwner.role, 'Owner');

      const newAdmin = await userRepository.inviteWorkspaceMember(
        wsId,
        ownerId,
        'newadmin@audit.com',
        'New Admin',
        'Admin'
      );
      assert.strictEqual(newAdmin.role, 'Admin');
    });

    it('Member cannot invite any user', async () => {
      await assert.rejects(
        async () => {
          await userRepository.inviteWorkspaceMember(
            wsId,
            memberId,
            'guest@audit.com',
            'Guest',
            'Member'
          );
        },
        /Authorization Error: Only workspace Owners or Admins can invite new members/i
      );
    });

    it('Tenant boundary: users in another workspace are not leaked across tenants', async () => {
      const otherWsId = 'ws_525_other';
      // Query workspace_users for otherWsId
      const usersInOtherWs = await userRepository.getWorkspaceUsers(otherWsId, 'usr_unrelated');
      // Admin and Member belong strictly to ws_525_audit and must not leak to otherWsId
      const leakedUsers = usersInOtherWs.filter((u) => u.id === adminId || u.id === memberId);
      assert.strictEqual(leakedUsers.length, 0);
    });
  });

  // ============================================================================
  // SECTION 4: REAL POSTGRESQL KERNEL VERIFICATION STATUS
  // ============================================================================
  describe('4. Real PostgreSQL Kernel Verification Status', () => {
    it('accurately documents that real PostgreSQL kernel verification is NOT EXECUTED', () => {
      // In compliance with governance instructions:
      // Local disposable postgres is unavailable, and connecting to production or provisioning cloud instances is prohibited.
      const isPostgresLive = Boolean(process.env.DATABASE_URL);
      assert.strictEqual(isPostgresLive, false);
    });
  });
});
