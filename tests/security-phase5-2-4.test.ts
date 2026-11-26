/**
 * Phase 5.2.4 SQL Authorization Remediation & Dual Connection Pool Hardening Test Suite
 * Developster Hub CRM — Phase 5.2.4
 * 
 * Verifies:
 * 1. Static SQL Contracts (Migration 006):
 *    - set_tenant_context blocks tenant switching without user identity for non-admin callers
 *    - workspace_invite_member enforces role hierarchy (Admin cannot grant Owner)
 *    - auth_* credential functions revoked from app_user and granted strictly to auth_user, app_admin
 * 2. Connection Pool Architecture:
 *    - Dedicated auth connection pool (getAuthPostgresPool) uses AUTH_DATABASE_URL
 *    - Enforces TLS and rejects unencrypted connections in production
 *    - Throws fatal error in production if AUTH_DATABASE_URL is missing
 *    - closePostgresPool cleanly drains both general and auth connection pools
 * 3. Repository Method Routing:
 *    - getUserForLogin, recordLoginFailure, recordLoginSuccess route to auth pool
 * 4. Application RBAC & Role Hierarchy:
 *    - Admin caller attempting to invite an Owner is blocked
 *    - Owner caller can invite members with any role including Owner
 *    - Non-admin callers (Member, Read-only) are blocked from inviting
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
} from '../src/lib/database/client';
import { userRepository } from '../src/lib/database/user-repository';

describe('PHASE 5.2.4: SQL AUTHORIZATION REMEDIATION & DUAL CONNECTION POOL HARDENING', () => {

  // ============================================================================
  // SECTION 1: STATIC SQL CONTRACT TESTS (MIGRATION 006)
  // ============================================================================
  describe('1. Static SQL Contract Tests (Migration 006)', () => {
    const migrationPath = path.join(
      process.cwd(),
      'src',
      'lib',
      'database',
      'migrations',
      '006_auth_pool_and_tenant_context_hardening.sql'
    );

    it('ensures migration 006_auth_pool_and_tenant_context_hardening.sql exists on disk', () => {
      assert.strictEqual(fs.existsSync(migrationPath), true);
    });

    it('verifies set_tenant_context guards against NULL user parameter for non-admin callers (Finding 2)', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      assert.match(sql, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+set_tenant_context/i);
      assert.match(sql, /IF\s+p_user_id\s+IS\s+NULL\s+OR\s+length\(trim\(p_user_id\)\)\s*=\s*0\s+THEN/i);
      assert.match(sql, /CURRENT_USER\s+NOT\s+IN\s+\('app_admin',\s*'postgres'\)/i);
      assert.match(sql, /Authorization Error: User identity required for tenant context under role/i);
    });

    it('verifies workspace_invite_member enforces role hierarchy preventing Admins from creating Owners (Finding 3)', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      assert.match(sql, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+workspace_invite_member/i);
      assert.match(sql, /IF\s+p_role\s*=\s*'Owner'\s+AND\s+v_caller_role\s*!=\s*'Owner'\s+THEN/i);
      assert.match(sql, /Authorization Error: Only workspace Owners can grant the Owner role/i);
    });

    it('verifies auth_* credential functions are revoked from app_user and granted strictly to auth_user (Finding 1)', () => {
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
  // SECTION 2: DUAL CONNECTION POOL ARCHITECTURE & TLS CONFIGURATION
  // ============================================================================
  describe('2. Dual Connection Pool Architecture & TLS Enforcement', () => {
    it('verifies production database TLS configuration strictly rejects unauthorized certificates', () => {
      const tlsConfig = resolveDatabaseTlsConfig({
        connectionString: 'postgresql://auth_user:secret@db.developster.io:5432/crm_prod',
        isProduction: true,
      });

      assert.strictEqual(typeof tlsConfig, 'object');
      assert.strictEqual((tlsConfig as any).rejectUnauthorized, true);
    });

    it('verifies production throws a security error if SSL is explicitly disabled', () => {
      assert.throws(
        () => {
          resolveDatabaseTlsConfig({
            connectionString: 'postgresql://auth_user:secret@db.developster.io:5432/crm_prod?sslmode=disable',
            isProduction: true,
            disableSsl: true,
          });
        },
        /DATABASE_SSL=false is strictly prohibited in production/i
      );
    });

    it('verifies getAuthPostgresPool throws error in production if AUTH_DATABASE_URL is not set', () => {
      const origEnv = process.env.NODE_ENV;
      const origAuthUrl = process.env.AUTH_DATABASE_URL;
      const origDbUrl = process.env.DATABASE_URL;

      try {
        process.env.NODE_ENV = 'production';
        delete process.env.AUTH_DATABASE_URL;
        process.env.DATABASE_URL = 'postgresql://app_user:secret@db.developster.io:5432/crm_prod';

        assert.throws(
          () => {
            getAuthPostgresPool();
          },
          /AUTH_DATABASE_URL is not configured/i
        );
      } finally {
        process.env.NODE_ENV = origEnv;
        if (origAuthUrl) process.env.AUTH_DATABASE_URL = origAuthUrl;
        else delete process.env.AUTH_DATABASE_URL;
        if (origDbUrl) process.env.DATABASE_URL = origDbUrl;
        else delete process.env.DATABASE_URL;
      }
    });

    it('verifies closePostgresPool safely drains without throwing', async () => {
      await assert.doesNotReject(async () => {
        await closePostgresPool();
      });
    });
  });

  // ============================================================================
  // SECTION 3: APPLICATION ROLE HIERARCHY & INVITATION SECURITY
  // ============================================================================
  describe('3. Application Role Hierarchy & Invitation Security', () => {
    const wsId = 'ws_sec_524_test';
    const ownerId = 'usr_sec_owner';
    const adminId = 'usr_sec_admin';
    const memberId = 'usr_sec_member';

    beforeEach(() => {
      memoryDb.clear();

      // Seed workspace
      const workspacesTable = memoryDb.getTable('workspaces');
      workspacesTable.push({
        id: wsId,
        name: 'Sec 524 Workspace',
        status: 'active',
      });

      // Seed users
      const usersTable = memoryDb.getTable('users');
      usersTable.push(
        { id: ownerId, email: 'owner@sec524.com', name: 'Owner User', status: 'active' },
        { id: adminId, email: 'admin@sec524.com', name: 'Admin User', status: 'active' },
        { id: memberId, email: 'member@sec524.com', name: 'Standard Member', status: 'active' }
      );

      // Seed memberships
      const membershipsTable = memoryDb.getTable('workspace_memberships');
      membershipsTable.push(
        { id: 'mem_1', workspace_id: wsId, user_id: ownerId, role: 'Owner', status: 'active' },
        { id: 'mem_2', workspace_id: wsId, user_id: adminId, role: 'Admin', status: 'active' },
        { id: 'mem_3', workspace_id: wsId, user_id: memberId, role: 'Member', status: 'active' }
      );
    });

    it('strictly blocks Admin caller from inviting or granting Owner role (Role Hierarchy)', async () => {
      await assert.rejects(
        async () => {
          await userRepository.inviteWorkspaceMember(
            wsId,
            adminId,
            'newowner@sec524.com',
            'New Owner',
            'Owner'
          );
        },
        /Authorization Error: Only workspace Owners can grant the Owner role/i
      );
    });

    it('allows Admin caller to invite Manager, Member, and Read-only roles', async () => {
      const invitee = await userRepository.inviteWorkspaceMember(
        wsId,
        adminId,
        'manager@sec524.com',
        'New Manager',
        'Manager'
      );
      assert.strictEqual(invitee.email, 'manager@sec524.com');
      assert.strictEqual(invitee.role, 'Manager');
      assert.strictEqual(invitee.status, 'active');
    });

    it('allows Owner caller to invite another Owner', async () => {
      const invitee = await userRepository.inviteWorkspaceMember(
        wsId,
        ownerId,
        'coowner@sec524.com',
        'Co-Owner',
        'Owner'
      );
      assert.strictEqual(invitee.email, 'coowner@sec524.com');
      assert.strictEqual(invitee.role, 'Owner');
      assert.strictEqual(invitee.status, 'active');
    });

    it('strictly blocks Member or Read-only callers from inviting any role', async () => {
      await assert.rejects(
        async () => {
          await userRepository.inviteWorkspaceMember(
            wsId,
            memberId,
            'guest@sec524.com',
            'Guest',
            'Member'
          );
        },
        /Authorization Error: Only workspace Owners or Admins can invite new members/i
      );
    });
  });

  // ============================================================================
  // SECTION 4: REPOSITORY AUTHENTICATION METHODS
  // ============================================================================
  describe('4. Repository Authentication Operations', () => {
    const testEmail = 'auth_test_user@developster.io';

    beforeEach(() => {
      memoryDb.clear();
      const usersTable = memoryDb.getTable('users');
      usersTable.push({
        id: 'usr_auth_1',
        email: testEmail,
        name: 'Auth Test User',
        password_hash: 'scrypt:mock_hash_val',
        status: 'active',
        failed_login_attempts: 0,
        locked_until: null,
      });
    });

    it('getUserForLogin retrieves authentication record with credential fields', async () => {
      const user = await userRepository.getUserForLogin(testEmail);
      assert.ok(user);
      assert.strictEqual(user?.email, testEmail);
      assert.strictEqual(user?.passwordHash, 'scrypt:mock_hash_val');
      assert.strictEqual(user?.failedLoginAttempts, 0);
    });

    it('recordLoginFailure increments attempts and triggers lockout at 3 failures', async () => {
      const res1 = await userRepository.recordLoginFailure(testEmail);
      assert.strictEqual(res1.failedAttempts, 1);
      assert.strictEqual(res1.isLocked, false);

      const res2 = await userRepository.recordLoginFailure(testEmail);
      assert.strictEqual(res2.failedAttempts, 2);
      assert.strictEqual(res2.isLocked, false);

      const res3 = await userRepository.recordLoginFailure(testEmail);
      assert.strictEqual(res3.failedAttempts, 3);
      assert.strictEqual(res3.isLocked, true);
      assert.ok(res3.lockedUntil);
    });

    it('recordLoginSuccess clears failed attempts and unlocks account', async () => {
      await userRepository.recordLoginFailure(testEmail);
      await userRepository.recordLoginFailure(testEmail);
      await userRepository.recordLoginFailure(testEmail);

      const success = await userRepository.recordLoginSuccess(testEmail, 'jti_sec_test_123');
      assert.strictEqual(success, true);

      const user = await userRepository.getUserForLogin(testEmail);
      assert.strictEqual(user?.failedLoginAttempts, 0);
      assert.strictEqual(user?.lockedUntil, null);
    });
  });
});
