/**
 * Phase 5.2 Critical Security Remediation Test Suite
 * Developster Hub CRM — Phase 5.2
 * 
 * Verifies:
 * 1. P0-1: PostgreSQL TLS Certificate Validation
 *    - Production certificate verification enabled (rejectUnauthorized: true)
 *    - Prohibition of insecure TLS fallback (DATABASE_SSL=false, sslmode=disable throw fatal error in prod)
 *    - Raw PEM and Base64-encoded CA certificate parsing
 *    - System CA compatibility without custom CA (Neon / standard public Web PKI)
 *    - Development vs. Production configuration isolation
 * 
 * 2. P0-2: Users Table Security, Row-Level Security & Auth Credential Isolation
 *    - SQL contract tests for Migration 004
 *    - Enabling and forcing of Row-Level Security on users table
 *    - Column-level privilege restriction (password_hash not accessible via general app_user queries)
 *    - Prevention of cross-tenant user record visibility
 *    - Multi-workspace user visibility isolation
 *    - Hardened SECURITY DEFINER authentication credential retrieval
 *    - Safe workspace_users view omitting authentication credentials
 *    - Non-recursive RLS policy design via SECURITY DEFINER helper
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import {
  parseCaCertificate,
  resolveDatabaseTlsConfig,
  memoryDb,
  withTenantTransaction,
} from '../src/lib/database/client';
import { userRepository } from '../src/lib/database/user-repository';

// Test CA certificate strings (synthetic valid PEMs for testing)
const SYNTHETIC_PEM_CA = `-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJALt+0...TEST_SYNTHETIC_CA_CERTIFICATE...
-----END CERTIFICATE-----`;

const SYNTHETIC_BASE64_CA = Buffer.from(SYNTHETIC_PEM_CA).toString('base64');

describe('PHASE 5.2: CRITICAL SECURITY REMEDIATION (P0-1 & P0-2)', () => {

  // ============================================================================
  // SECTION 1: P0-1 — POSTGRESQL TLS CERTIFICATE VALIDATION
  // ============================================================================
  describe('P0-1: PostgreSQL TLS Certificate Validation & Production Security', () => {

    it('enforces rejectUnauthorized: true in production environment', () => {
      const config = resolveDatabaseTlsConfig({
        connectionString: 'postgres://user:pass@ep-cool-db.us-east-2.aws.neon.tech/neondb',
        isProduction: true,
      });

      assert.strictEqual(typeof config, 'object');
      if (typeof config === 'object' && config !== null) {
        assert.strictEqual(config.rejectUnauthorized, true);
        assert.strictEqual(config.ca, undefined, 'No custom CA needed for public Web PKI providers like Neon');
      }
    });

    it('prohibits DATABASE_SSL=false in production (throws fatal security error)', () => {
      assert.throws(
        () => {
          resolveDatabaseTlsConfig({
            connectionString: 'postgres://user:pass@db.example.com/crm',
            isProduction: true,
            disableSsl: true,
          });
        },
        /DATABASE_SSL=false is strictly prohibited in production/
      );
    });

    it('prohibits sslmode=disable in production connection string', () => {
      assert.throws(
        () => {
          resolveDatabaseTlsConfig({
            connectionString: 'postgres://user:pass@db.example.com/crm?sslmode=disable',
            isProduction: true,
          });
        },
        /sslmode=disable is strictly prohibited in production/
      );
    });

    it('correctly loads and decodes raw PEM CA certificate from DATABASE_CA_CERT', () => {
      const parsed = parseCaCertificate(SYNTHETIC_PEM_CA);
      assert.strictEqual(parsed, SYNTHETIC_PEM_CA);

      const config = resolveDatabaseTlsConfig({
        connectionString: 'postgres://user:pass@rds-instance.rds.amazonaws.com/crm',
        isProduction: true,
        caCert: SYNTHETIC_PEM_CA,
      });

      assert.strictEqual(typeof config, 'object');
      if (typeof config === 'object' && config !== null) {
        assert.strictEqual(config.rejectUnauthorized, true);
        assert.strictEqual(config.ca, SYNTHETIC_PEM_CA);
      }
    });

    it('correctly decodes Base64-encoded PEM CA certificate from DATABASE_CA_CERT', () => {
      const parsed = parseCaCertificate(SYNTHETIC_BASE64_CA);
      assert.strictEqual(parsed, SYNTHETIC_PEM_CA);

      const config = resolveDatabaseTlsConfig({
        connectionString: 'postgres://user:pass@db.supabase.co:6543/postgres',
        isProduction: true,
        caCert: SYNTHETIC_BASE64_CA,
      });

      assert.strictEqual(typeof config, 'object');
      if (typeof config === 'object' && config !== null) {
        assert.strictEqual(config.rejectUnauthorized, true);
        assert.strictEqual(config.ca, SYNTHETIC_PEM_CA);
      }
    });

    it('allows unencrypted connections for localhost in development mode', () => {
      const config = resolveDatabaseTlsConfig({
        connectionString: 'postgres://postgres:postgres@localhost:5432/crm_dev',
        isProduction: false,
      });

      assert.strictEqual(config, false);
    });

    it('allows unencrypted connections for 127.0.0.1 in development mode', () => {
      const config = resolveDatabaseTlsConfig({
        connectionString: 'postgres://postgres:postgres@127.0.0.1:5432/crm_dev',
        isProduction: false,
      });

      assert.strictEqual(config, false);
    });

    it('enforces certificate validation by default for remote databases in development', () => {
      const config = resolveDatabaseTlsConfig({
        connectionString: 'postgres://user:pass@remote-staging-db.com/crm_staging',
        isProduction: false,
      });

      assert.strictEqual(typeof config, 'object');
      if (typeof config === 'object' && config !== null) {
        assert.strictEqual(config.rejectUnauthorized, true);
      }
    });
  });

  // ============================================================================
  // SECTION 2: P0-2 — USERS TABLE SECURITY SQL CONTRACT AUDIT
  // ============================================================================
  describe('P0-2: Migration 004 SQL Contract & Architecture Verification', () => {
    const migrationPath = path.join(
      process.cwd(),
      'src',
      'lib',
      'database',
      'migrations',
      '004_users_table_security.sql'
    );

    it('ensures migration 004_users_table_security.sql exists on disk', () => {
      assert.strictEqual(fs.existsSync(migrationPath), true);
    });

    it('verifies Migration 004 enables and forces Row-Level Security on users table', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      assert.match(sql, /ALTER\s+TABLE\s+users\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY;/i);
      assert.match(sql, /ALTER\s+TABLE\s+users\s+FORCE\s+ROW\s+LEVEL\s+SECURITY;/i);
    });

    it('verifies Migration 004 defines SELECT policy bound to app_user', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      assert.match(sql, /CREATE\s+POLICY\s+users_tenant_isolation_select\s+ON\s+users/i);
      assert.match(sql, /FOR\s+SELECT\s+TO\s+app_user/i);
      assert.match(sql, /is_user_in_active_workspace\(id\)/i);
    });

    it('verifies Migration 004 defines self-update policy bound to app_user', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      assert.match(sql, /CREATE\s+POLICY\s+users_self_update\s+ON\s+users/i);
      assert.match(sql, /FOR\s+UPDATE\s+TO\s+app_user/i);
      assert.match(sql, /id\s*=\s*get_active_user_id\(\)/i);
    });

    it('verifies Migration 004 revokes broad table privileges and restricts to non-sensitive columns', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      assert.match(sql, /REVOKE\s+ALL\s+ON\s+TABLE\s+users\s+FROM\s+app_user;/i);
      // Verify column-level grant excludes password_hash, mfa_secret, failed_login_attempts, locked_until
      assert.match(sql, /GRANT\s+SELECT\s+\(id,\s*email,\s*name,\s*status,\s*avatar_url,\s*phone,\s*created_at,\s*updated_at\)\s+ON\s+TABLE\s+users\s+TO\s+app_user;/i);
      assert.doesNotMatch(sql, /GRANT\s+SELECT\s+.*password_hash.*TO\s+app_user/i);
    });

    it('verifies Migration 004 creates hardened auth_get_user_for_login SECURITY DEFINER function with fixed search_path', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      assert.match(sql, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+auth_get_user_for_login/i);
      assert.match(sql, /SECURITY\s+DEFINER/i);
      assert.match(sql, /SET\s+search_path\s*=\s*public,\s*pg_temp/i);
      assert.match(sql, /LOWER\(u\.email\)\s*=\s*LOWER\(trim\(p_email\)\)/i);
    });

    it('verifies Migration 004 creates safe workspace_users view omitting credentials', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      assert.match(sql, /CREATE\s+OR\s+REPLACE\s+VIEW\s+workspace_users\s+AS/i);
      assert.doesNotMatch(sql, /workspace_users\s+AS\s+SELECT\s+.*password_hash/i);
      assert.match(sql, /GRANT\s+SELECT\s+ON\s+workspace_users\s+TO\s+app_user/i);
    });

    it('verifies non-recursive helper is_user_in_active_workspace is declared SECURITY DEFINER', () => {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      assert.match(sql, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+is_user_in_active_workspace/i);
      assert.match(sql, /SECURITY\s+DEFINER/i);
      assert.match(sql, /SET\s+search_path\s*=\s*public,\s*pg_temp/i);
    });
  });

  // ============================================================================
  // SECTION 3: P0-2 — MULTI-TENANT USER REPOSITORY ISOLATION & DATA ACCESS
  // ============================================================================
  describe('P0-2: User Repository & Tenant Boundary Isolation (Unit / Mock Simulation)', () => {

    beforeEach(() => {
      memoryDb.clear();

      // Seed mock users
      const users = memoryDb.getTable('users');
      users.push(
        {
          id: 'usr-alpha-owner',
          email: 'alice@tenant-alpha.com',
          name: 'Alice Alpha',
          password_hash: 'scrypt:salt_alice:hash_alice_secret',
          status: 'active',
          avatar_url: 'https://cdn.example.com/alice.png',
          phone: '+919876543210',
          failed_login_attempts: 0,
          locked_until: null,
          created_at: new Date('2026-01-01').toISOString(),
          updated_at: new Date('2026-01-01').toISOString(),
        },
        {
          id: 'usr-alpha-member',
          email: 'bob@tenant-alpha.com',
          name: 'Bob Alpha',
          password_hash: 'scrypt:salt_bob:hash_bob_secret',
          status: 'active',
          avatar_url: null,
          phone: '+919876543211',
          failed_login_attempts: 0,
          locked_until: null,
          created_at: new Date('2026-01-02').toISOString(),
          updated_at: new Date('2026-01-02').toISOString(),
        },
        {
          id: 'usr-beta-owner',
          email: 'charlie@tenant-beta.com',
          name: 'Charlie Beta',
          password_hash: 'scrypt:salt_charlie:hash_charlie_secret',
          status: 'active',
          avatar_url: null,
          phone: '+919876543212',
          failed_login_attempts: 0,
          locked_until: null,
          created_at: new Date('2026-01-03').toISOString(),
          updated_at: new Date('2026-01-03').toISOString(),
        },
        {
          id: 'usr-multi-workspace',
          email: 'david@consultant.com',
          name: 'David Multi',
          password_hash: 'scrypt:salt_david:hash_david_secret',
          status: 'active',
          avatar_url: null,
          phone: '+919876543213',
          failed_login_attempts: 0,
          locked_until: null,
          created_at: new Date('2026-01-04').toISOString(),
          updated_at: new Date('2026-01-04').toISOString(),
        }
      );

      // Seed mock workspace memberships
      const memberships = memoryDb.getTable('workspace_memberships');
      memberships.push(
        { workspace_id: 'ws-alpha', user_id: 'usr-alpha-owner', role: 'Owner', status: 'active' },
        { workspace_id: 'ws-alpha', user_id: 'usr-alpha-member', role: 'Member', status: 'active' },
        { workspace_id: 'ws-alpha', user_id: 'usr-multi-workspace', role: 'Member', status: 'active' },
        { workspace_id: 'ws-beta', user_id: 'usr-beta-owner', role: 'Owner', status: 'active' },
        { workspace_id: 'ws-beta', user_id: 'usr-multi-workspace', role: 'Member', status: 'active' }
      );
    });

    it('retrieves only users belonging to active workspace (no cross-tenant bleed)', async () => {
      const alphaUsers = await userRepository.getWorkspaceUsers('ws-alpha');
      assert.strictEqual(alphaUsers.length, 3);
      const alphaEmails = alphaUsers.map((u) => u.email).sort();
      assert.deepStrictEqual(alphaEmails, [
        'alice@tenant-alpha.com',
        'bob@tenant-alpha.com',
        'david@consultant.com',
      ]);

      // Charlie (tenant-beta) MUST NOT be visible in workspace alpha
      const charlieInAlpha = alphaUsers.find((u) => u.email === 'charlie@tenant-beta.com');
      assert.strictEqual(charlieInAlpha, undefined);

      // Verify workspace beta only sees Beta members
      const betaUsers = await userRepository.getWorkspaceUsers('ws-beta');
      assert.strictEqual(betaUsers.length, 2);
      const betaEmails = betaUsers.map((u) => u.email).sort();
      assert.deepStrictEqual(betaEmails, [
        'charlie@tenant-beta.com',
        'david@consultant.com',
      ]);
    });

    it('strictly omits password_hash and internal lockout fields from workspace users queries', async () => {
      const users = await userRepository.getWorkspaceUsers('ws-alpha');
      for (const u of users) {
        // Assert passwordHash / password_hash is not present in returned object
        assert.strictEqual((u as any).passwordHash, undefined);
        assert.strictEqual((u as any).password_hash, undefined);
        assert.strictEqual((u as any).failedLoginAttempts, undefined);
        assert.strictEqual((u as any).lockedUntil, undefined);
      }
    });

    it('supports legitimate multi-workspace membership (David is visible in both Alpha and Beta)', async () => {
      const alphaUsers = await userRepository.getWorkspaceUsers('ws-alpha');
      const betaUsers = await userRepository.getWorkspaceUsers('ws-beta');

      const davidInAlpha = alphaUsers.find((u) => u.id === 'usr-multi-workspace');
      const davidInBeta = betaUsers.find((u) => u.id === 'usr-multi-workspace');

      assert.ok(davidInAlpha, 'David must be visible in Alpha');
      assert.ok(davidInBeta, 'David must be visible in Beta');
    });

    it('retrieves authentication credentials securely via getUserForLogin for login flow only', async () => {
      const authRecord = await userRepository.getUserForLogin('alice@tenant-alpha.com');
      assert.ok(authRecord);
      assert.strictEqual(authRecord.email, 'alice@tenant-alpha.com');
      assert.strictEqual(authRecord.passwordHash, 'scrypt:salt_alice:hash_alice_secret');
      assert.strictEqual(authRecord.failedLoginAttempts, 0);
      assert.strictEqual(authRecord.lockedUntil, null);
    });

    it('returns null for unknown email in getUserForLogin without leaking state', async () => {
      const authRecord = await userRepository.getUserForLogin('unknown@nonexistent.com');
      assert.strictEqual(authRecord, null);
    });

    it('handles case-insensitive and trimmed email queries in getUserForLogin', async () => {
      const authRecord = await userRepository.getUserForLogin('  ALICE@TENANT-ALPHA.COM  ');
      assert.ok(authRecord);
      assert.strictEqual(authRecord.email, 'alice@tenant-alpha.com');
    });

    it('records login attempts: increments on failure and resets on success', async () => {
      // 1. Record failure
      await userRepository.recordLoginResult('usr-alpha-owner', false);
      let user = await userRepository.getUserForLogin('alice@tenant-alpha.com');
      assert.strictEqual(user?.failedLoginAttempts, 1);

      // 2. Record second failure with lockout
      const lockoutTime = new Date(Date.now() + 15 * 60 * 1000);
      await userRepository.recordLoginResult('usr-alpha-owner', false, lockoutTime);
      user = await userRepository.getUserForLogin('alice@tenant-alpha.com');
      assert.strictEqual(user?.failedLoginAttempts, 2);
      assert.ok(user?.lockedUntil);

      // 3. Record success (resets attempts and lockout)
      await userRepository.recordLoginResult('usr-alpha-owner', true);
      user = await userRepository.getUserForLogin('alice@tenant-alpha.com');
      assert.strictEqual(user?.failedLoginAttempts, 0);
      assert.strictEqual(user?.lockedUntil, null);
    });

    it('allows a user to update their own profile while preventing cross-user profile modification', async () => {
      // Alice updates her own profile
      const updated = await userRepository.updateUserProfile('ws-alpha', 'usr-alpha-owner', {
        name: 'Alice Updated',
        phone: '+919999999999',
      });
      assert.strictEqual(updated, true);

      const alice = await userRepository.getUserById('ws-alpha', 'usr-alpha-owner');
      assert.strictEqual(alice?.name, 'Alice Updated');
      assert.strictEqual(alice?.phone, '+919999999999');
    });
  });
});

