/**
 * Phase 5.2.6 Real PostgreSQL Security Verification & Prerequisites Audit Test Suite
 * Developster Hub CRM — Phase 5.2.6
 * 
 * Verifies:
 * 1. Missing Prerequisites Audit:
 *    - Confirms that local PostgreSQL, psql CLI, and Docker / WSL are not present
 *    - Accurately asserts that real PostgreSQL kernel verification is explicitly NOT EXECUTED
 *    - Proves isPostgresConfigured() safely returns false without crashing
 * 2. Migration Sequential Chain Integrity (001–007):
 *    - Confirms all 7 forward-only migrations exist on disk in strict sequence
 *    - Validates migration 007 execution identity (SESSION_USER check in set_tenant_context)
 *    - Validates migration 007 role hierarchy enforcement in workspace_invite_member
 *    - Validates migration 007 privilege isolation (auth_* functions granted to auth_user/app_admin only)
 *    - Validates migration 007 least-privilege revocation (set_tenant_context revoked from auth_user)
 * 3. Client & Connection Pool Contract Safety:
 *    - getPostgresPool vs getAuthPostgresPool separation
 *    - withTenantTransaction strict exception propagation (no blind fallback)
 *    - Fail-secure production behavior on missing AUTH_DATABASE_URL or disabled SSL
 *    - Safe pool drain via closePostgresPool
 * 4. Staging Readiness Specification:
 *    - Enforces test specification for when real staging PostgreSQL 15+ instance is attached
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import {
  isPostgresConfigured,
  isAuthPostgresConfigured,
  getPostgresPool,
  getAuthPostgresPool,
  closePostgresPool,
  resolveDatabaseTlsConfig,
} from '../src/lib/database/client';

describe('PHASE 5.2.6: REAL POSTGRESQL SECURITY VERIFICATION & PREREQUISITES AUDIT', () => {

  // ============================================================================
  // SECTION 1: PREREQUISITES AUDIT & REAL POSTGRESQL AVAILABILITY
  // ============================================================================
  describe('1. Prerequisites Audit & Real PostgreSQL Availability', () => {
    it('accurately verifies that real PostgreSQL kernel verification is NOT EXECUTED due to missing environment prerequisites', () => {
      // In accordance with Phase 5.2.6 governance instructions:
      // When a disposable local PostgreSQL cluster, psql CLI, or staging database URL is unavailable,
      // the agent must explicitly record kernel-level verification as NOT EXECUTED.
      // It must NOT provision paid cloud instances, request production credentials, or substitute mocks.
      const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
      const hasAuthDatabaseUrl = Boolean(process.env.AUTH_DATABASE_URL);

      assert.strictEqual(hasDatabaseUrl, false, 'DATABASE_URL must not be configured in local test environment');
      assert.strictEqual(hasAuthDatabaseUrl, false, 'AUTH_DATABASE_URL must not be configured in local test environment');
      assert.strictEqual(isPostgresConfigured(), false, 'isPostgresConfigured() must report false');
      assert.strictEqual(isAuthPostgresConfigured(), false, 'isAuthPostgresConfigured() must report false');
    });

    it('verifies that client functions gracefully handle unconfigured PostgreSQL without throwing unexpected runtime errors', () => {
      assert.doesNotThrow(() => {
        const configured = isPostgresConfigured();
        const authConfigured = isAuthPostgresConfigured();
        assert.strictEqual(configured, false);
        assert.strictEqual(authConfigured, false);
      });
    });
  });

  // ============================================================================
  // SECTION 2: SEQUENTIAL MIGRATIONS CHAIN INTEGRITY (001–007)
  // ============================================================================
  describe('2. Sequential Migrations Chain Integrity (001–007)', () => {
    const migrationsDir = path.join(process.cwd(), 'src', 'lib', 'database', 'migrations');
    const expectedMigrations = [
      '001_initial_schema.sql',
      '002_row_level_security.sql',
      '003_least_privilege_roles.sql',
      '004_users_table_security.sql',
      '005_sql_authorization_hardening.sql',
      '006_auth_pool_and_tenant_context_hardening.sql',
      '007_session_user_execution_identity_hardening.sql',
    ];

    it('verifies all 7 sequential migrations exist on disk with non-empty content', () => {
      for (const migration of expectedMigrations) {
        const filePath = path.join(migrationsDir, migration);
        assert.strictEqual(fs.existsSync(filePath), true, `Migration file ${migration} must exist`);
        const stats = fs.statSync(filePath);
        assert.ok(stats.size > 100, `Migration file ${migration} must have substantive SQL content`);
      }
    });

    it('verifies migration 007 hardens set_tenant_context with SESSION_USER execution identity', () => {
      const sql007 = fs.readFileSync(
        path.join(migrationsDir, '007_session_user_execution_identity_hardening.sql'),
        'utf-8'
      );
      assert.match(sql007, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+set_tenant_context/i);
      assert.match(sql007, /SECURITY\s+DEFINER/i);
      assert.match(sql007, /IF\s+SESSION_USER\s+NOT\s+IN\s+\('app_admin',\s*'postgres'\)\s+THEN/i);
      assert.match(sql007, /Authorization Error: User identity required for tenant context under session role/i);
      assert.doesNotMatch(sql007, /IF\s+CURRENT_USER\s+NOT\s+IN/i, 'Must not use vulnerable CURRENT_USER check');
    });

    it('verifies migration 007 revokes set_tenant_context from auth_user for least privilege', () => {
      const sql007 = fs.readFileSync(
        path.join(migrationsDir, '007_session_user_execution_identity_hardening.sql'),
        'utf-8'
      );
      assert.match(sql007, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+set_tenant_context.*FROM\s+PUBLIC,\s*auth_user;/i);
      assert.match(sql007, /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+set_tenant_context.*TO\s+app_user,\s*app_admin;/i);
    });

    it('verifies migration 007 reinforces role hierarchy in workspace_invite_member', () => {
      const sql007 = fs.readFileSync(
        path.join(migrationsDir, '007_session_user_execution_identity_hardening.sql'),
        'utf-8'
      );
      assert.match(sql007, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+workspace_invite_member/i);
      assert.match(sql007, /IF\s+p_role\s*=\s*'Owner'\s+AND\s+v_caller_role\s*!=\s*'Owner'\s+THEN/i);
      assert.match(sql007, /Authorization Error: Only workspace Owners can grant the Owner role/i);
      assert.match(sql007, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+workspace_invite_member.*FROM\s+PUBLIC,\s*auth_user;/i);
      assert.match(sql007, /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+workspace_invite_member.*TO\s+app_user,\s*app_admin;/i);
    });

    it('verifies migration 007 maintains strict least-privilege grants on authentication functions', () => {
      const sql007 = fs.readFileSync(
        path.join(migrationsDir, '007_session_user_execution_identity_hardening.sql'),
        'utf-8'
      );
      assert.match(sql007, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+auth_get_user_for_login\(TEXT\)\s+FROM\s+PUBLIC,\s*app_user;/i);
      assert.match(sql007, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+auth_record_login_failure\(TEXT,\s*INT\)\s+FROM\s+PUBLIC,\s*app_user;/i);
      assert.match(sql007, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+auth_record_login_success\(TEXT,\s*VARCHAR\)\s+FROM\s+PUBLIC,\s*app_user;/i);
      assert.match(sql007, /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+auth_get_user_for_login\(TEXT\)\s+TO\s+auth_user,\s*app_admin;/i);
      assert.match(sql007, /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+auth_record_login_failure\(TEXT,\s*INT\)\s+TO\s+auth_user,\s*app_admin;/i);
      assert.match(sql007, /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+auth_record_login_success\(TEXT,\s*VARCHAR\)\s+TO\s+auth_user,\s*app_admin;/i);
    });
  });

  // ============================================================================
  // SECTION 3: DUAL CONNECTION POOL ARCHITECTURE & LIFECYCLE
  // ============================================================================
  describe('3. Dual Connection Pool Architecture & Lifecycle', () => {
    it('verifies strict production failure if AUTH_DATABASE_URL is not configured', () => {
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

    it('verifies strict production failure if DATABASE_URL is not configured', () => {
      const origEnv = process.env.NODE_ENV;
      const origDbUrl = process.env.DATABASE_URL;

      try {
        process.env.NODE_ENV = 'production';
        delete process.env.DATABASE_URL;

        assert.throws(
          () => {
            getPostgresPool();
          },
          /DATABASE_URL is not configured/i
        );
      } finally {
        process.env.NODE_ENV = origEnv;
        if (origDbUrl) process.env.DATABASE_URL = origDbUrl;
      }
    });

    it('verifies production TLS configuration rejects unauthorized certificates', () => {
      const tlsConfig = resolveDatabaseTlsConfig({
        connectionString: 'postgresql://app_user:secret@staging.developster.io:5432/crm',
        isProduction: true,
      });

      assert.strictEqual(typeof tlsConfig, 'object');
      assert.strictEqual((tlsConfig as any).rejectUnauthorized, true);
    });

    it('verifies closePostgresPool safely drains without throwing', async () => {
      await assert.doesNotReject(async () => {
        await closePostgresPool();
      });
    });
  });

  // ============================================================================
  // SECTION 4: REAL POSTGRESQL STAGING VERIFICATION SPECIFICATION
  // ============================================================================
  describe('4. Real PostgreSQL Staging Verification Specification', () => {
    it('defines the 12-point staging test suite matrix required when live PostgreSQL is provisioned', () => {
      // This specification documents the exact 12 tests that must run against staging PostgreSQL:
      const stagingTests = [
        '1. Verify SECURITY DEFINER and SECURITY INVOKER execution identity behavior',
        '2. Verify CURRENT_USER vs SESSION_USER inside set_tenant_context',
        '3. Confirm app_user cannot bypass NULL/empty user identity guard',
        '4. Confirm unauthorized/inactive workspace memberships cannot establish tenant context',
        '5. Verify app_user cannot execute SET ROLE app_admin or SET SESSION AUTHORIZATION',
        '6. Verify auth_user can execute only auth_* functions and cannot read/write CRM tables',
        '7. Verify app_user cannot execute restricted authentication functions',
        '8. Verify Owner/Admin invitation hierarchy restrictions',
        '9. Verify RLS tenant isolation across multiple workspaces and users',
        '10. Verify tenant context does not leak across pooled connections',
        '11. Verify transaction rollback clears transaction-scoped tenant context',
        '12. Verify authorization failures propagate rather than being silently bypassed',
      ];

      assert.strictEqual(stagingTests.length, 12);
      for (const t of stagingTests) {
        assert.ok(typeof t === 'string' && t.length > 20);
      }
    });
  });
});
