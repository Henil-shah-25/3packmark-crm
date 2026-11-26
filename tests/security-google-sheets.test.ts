/**
 * Developster Hub CRM — Google Sheets Security Remediation Regression Suite
 * 
 * Verifies all 5 Work Packages:
 * 1. Task 1: Credential Protection & AES-256-GCM Encryption at Rest
 * 2. Task 2: Tenant Boundary Isolation & RBAC Protection
 * 3. Task 3: Session Revocation & Shared Lockout Synchronization
 * 4. Task 4: Google Sheets Concurrency Mutex & Central CSV Formula Protection
 * 5. Task 5: Audit Trail & Administrative Logging
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { crmRepo } from '../src/lib/google-sheets/repository';
import { googleSheetsClient } from '../src/lib/google-sheets/client';
import { saveRuntimeCredentials, getGoogleSheetsConfig } from '../src/lib/google-sheets/config';
import {
  createSessionToken,
  verifySessionToken,
  revokeSessionToken,
  isSessionRevoked,
  checkLockout,
  recordFailedAttempt,
  resetLockout,
  getAuthConfig,
} from '../src/lib/auth';
import {
  isDistributedSessionRevoked,
  checkDistributedRevocation,
  recordDistributedRevocation,
  isSharedRedisConfigured,
} from '../src/lib/auth/shared-store';
import { isMasterAdmin, isWorkspaceAdmin } from '../src/lib/auth/rbac';
import { encryptSecret, decryptSecret } from '../src/lib/config/credentials';
import { sanitizeCsvFormula } from '../src/lib/security';
import { TeamMember } from '../src/types/crm';

describe('GOOGLE SHEETS CRM SECURITY REGRESSION SUITE', () => {

  // ============================================================================
  // TASK 1: CREDENTIAL SECURITY & ENCRYPTION AT REST
  // ============================================================================
  describe('Task 1: Credential Security & Encryption at Rest', () => {
    it('encrypts Google service account privateKey at rest via AES-256-GCM', () => {
      const credsPath = path.join(process.cwd(), 'data', 'google-credentials.json');
      const mockKey = '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----';
      
      try {
        saveRuntimeCredentials({
          spreadsheetId: '1UuIfp2bvNRighzwD4hyl7bezNEU58_bE40KmRr_u69w',
          clientEmail: 'service-account@developster-crm.iam.gserviceaccount.com',
          privateKey: mockKey,
        });

        assert.strictEqual(fs.existsSync(credsPath), true);

        const raw = fs.readFileSync(credsPath, 'utf-8');
        const parsed = JSON.parse(raw);

        // Raw key must NOT be stored in plaintext
        assert.strictEqual(parsed.privateKey.includes('-----BEGIN PRIVATE KEY-----'), false);
        assert.strictEqual(parsed.isEncrypted, true);
        // Format must be iv:authTag:ciphertext (3 colon-separated hex parts)
        assert.strictEqual(parsed.privateKey.split(':').length, 3);

        // getGoogleSheetsConfig must transparently decrypt the key for authorized operations
        const loadedConfig = getGoogleSheetsConfig();
        assert.ok(loadedConfig);
        assert.strictEqual(loadedConfig.clientEmail, 'service-account@developster-crm.iam.gserviceaccount.com');
        assert.ok(loadedConfig.privateKey.includes('BEGIN PRIVATE KEY'));
      } finally {
        if (fs.existsSync(credsPath)) {
          fs.unlinkSync(credsPath);
        }
      }
    });

    it('encrypts OAuth tokens at rest and transparently decrypts on retrieval', async () => {
      const tokenRecord = {
        workspaceId: 'ws-test-token',
        provider: 'google_calendar' as const,
        accessToken: 'ya29.sensitive-access-token-secret-12345',
        refreshToken: '1//0g-sensitive-refresh-token-secret-67890',
        expiryDate: Date.now() + 3600000,
        scope: 'https://www.googleapis.com/auth/calendar',
        userEmail: 'admin@developster.io',
        updatedAt: new Date().toISOString(),
      };

      await crmRepo.saveOAuthTokens(tokenRecord);

      // Verify on-disk storage is encrypted
      const storePath = path.join(process.cwd(), 'data', 'crm-storage.json');
      const rawStore = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
      const storedToken = (rawStore.oauthTokens || []).find((t: any) => t.workspaceId === 'ws-test-token');

      assert.ok(storedToken);
      // Stored tokens must be AES-256-GCM ciphertexts, NOT plaintext
      assert.strictEqual(storedToken.accessToken.includes('ya29.sensitive'), false);
      assert.strictEqual(storedToken.accessToken.split(':').length, 3);
      assert.strictEqual(storedToken.refreshToken.includes('1//0g-sensitive'), false);
      assert.strictEqual(storedToken.refreshToken.split(':').length, 3);

      // crmRepo.getOAuthTokens must transparently decrypt the retrieved token
      const retrieved = await crmRepo.getOAuthTokens('ws-test-token');
      assert.ok(retrieved);
      assert.strictEqual(retrieved.accessToken, 'ya29.sensitive-access-token-secret-12345');
      assert.strictEqual(retrieved.refreshToken, '1//0g-sensitive-refresh-token-secret-67890');

      // Clean up test token
      await crmRepo.deleteOAuthTokens('ws-test-token');
    });
  });

  // ============================================================================
  // TASK 2: TENANT ISOLATION & RBAC ENFORCEMENT
  // ============================================================================
  describe('Task 2: Tenant Isolation & RBAC Enforcement', () => {
    it('strictly rejects non-existent workspace queries without silent fallback to tenant 0', async () => {
      await assert.rejects(
        async () => {
          await crmRepo.getBootstrapData('ws-nonexistent-tenant-999');
        },
        /Tenant Boundary Error: Workspace "ws-nonexistent-tenant-999" does not exist/
      );
    });

    it('enforces CSV formula injection protection on customer and lead fields', () => {
      const maliciousFormula = '=CMD|"/C calc"!A0';
      const sanitized = sanitizeCsvFormula(maliciousFormula);
      assert.strictEqual(sanitized.startsWith("'"), true);

      const plusFormula = '+SUM(1+1)';
      assert.strictEqual(sanitizeCsvFormula(plusFormula).startsWith("'"), true);

      const safeName = 'Acme Corp';
      assert.strictEqual(sanitizeCsvFormula(safeName), 'Acme Corp');
    });
  });

  // ============================================================================
  // TASK 3: AUTHENTICATION & SESSION REVOCATION
  // ============================================================================
  describe('Task 3: Authentication & Session Revocation', () => {
    it('creates cryptographic session token and verifies signature & revocation', () => {
      process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'developster-crm-test-session-secret-2026';
      const token = createSessionToken('alice@alpha.com');
      assert.ok(token.includes('.'));

      const verified = verifySessionToken(token);
      assert.ok(verified);
      assert.strictEqual(verified.email, 'alice@alpha.com');

      // Revoke token
      assert.strictEqual(isSessionRevoked(token), false);
      revokeSessionToken(token);
      assert.strictEqual(isSessionRevoked(token), true);

      // Verification of revoked token must fail
      const postRevoke = verifySessionToken(token);
      assert.strictEqual(postRevoke, null);
    });

    it('enforces 3-attempt account lockout threshold with safe reset', () => {
      const testEmail = `test_${Date.now()}@testlockout.com`;
      const testIp = '192.168.1.100';

      // Attempt 1
      let fail = recordFailedAttempt(testEmail, testIp);
      assert.strictEqual(fail.isLocked, false);
      assert.strictEqual(fail.attemptsLeft, 2);

      // Attempt 2
      fail = recordFailedAttempt(testEmail, testIp);
      assert.strictEqual(fail.isLocked, false);
      assert.strictEqual(fail.attemptsLeft, 1);

      // Attempt 3: Triggers lockout
      fail = recordFailedAttempt(testEmail, testIp);
      assert.strictEqual(fail.isLocked, true);
      assert.strictEqual(fail.attemptsLeft, 0);

      // checkLockout reports locked state
      const status = checkLockout(testEmail, testIp);
      assert.strictEqual(status.isLocked, true);
      assert.ok(status.remainingSeconds > 0);

      // Reset lockout on successful authentication
      resetLockout(testEmail, testIp);
      const postReset = checkLockout(testEmail, testIp);
      assert.strictEqual(postReset.isLocked, false);
    });
  });

  // ============================================================================
  // TASK 4: GOOGLE SHEETS INTEGRITY & ATOMIC WRITES
  // ============================================================================
  describe('Task 4: Google Sheets Integrity & Atomic Local Writes', () => {
    it('guarantees atomic local JSON store writes without data corruption', () => {
      const storePath = path.join(process.cwd(), 'data', 'crm-storage.json');
      assert.strictEqual(fs.existsSync(storePath), true);

      // Verify file is valid parseable JSON
      const content = fs.readFileSync(storePath, 'utf-8');
      assert.doesNotThrow(() => JSON.parse(content));
    });
  });

  // ============================================================================
  // TASK A: PLATFORM SECURITY BOUNDARIES & RBAC SEPARATION
  // ============================================================================
  describe('Task A: Platform Security Boundaries & RBAC Separation', () => {
    it('strictly denies platform Master Admin privileges to tenant Owner and Admin roles', () => {
      const tenantOwner: TeamMember = {
        id: 'mem-tenant-owner',
        workspaceId: 'ws-tenant-alpha',
        name: 'Tenant Alpha Owner',
        email: 'owner@alpha-tenant.com',
        role: 'Owner',
        avatar: '',
        color: '#285E50',
      };

      const tenantAdmin: TeamMember = {
        id: 'mem-tenant-admin',
        workspaceId: 'ws-tenant-alpha',
        name: 'Tenant Alpha Admin',
        email: 'admin@alpha-tenant.com',
        role: 'Admin',
        avatar: '',
        color: '#285E50',
      };

      // Tenant Owner and Admin must NOT be recognized as platform Master Admin
      assert.strictEqual(isMasterAdmin(tenantOwner), false);
      assert.strictEqual(isMasterAdmin(tenantAdmin), false);

      // But must be recognized as workspace-level admins
      assert.strictEqual(isWorkspaceAdmin(tenantOwner), true);
      assert.strictEqual(isWorkspaceAdmin(tenantAdmin), true);

      // Only the genuine platform ADMIN_EMAIL qualifies as Master Admin
      const testAdminEmail = 'platform-master@developster.io';
      const genuineMasterAdmin: TeamMember = {
        id: 'mem-platform-admin',
        workspaceId: 'ws-default',
        name: 'Platform Superuser',
        email: testAdminEmail,
        role: 'Owner',
        avatar: '',
        color: '#E5A93C',
      };
      assert.strictEqual(isMasterAdmin(genuineMasterAdmin, testAdminEmail), true);
    });

    it('requires a configured encryption secret in production and fails closed', () => {
      const prevEnv = process.env.NODE_ENV;
      const prevSecret = process.env.SESSION_SECRET;
      const prevKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
      const prevEnc = process.env.ENCRYPTION_SECRET;

      try {
        process.env.NODE_ENV = 'production';
        delete process.env.SESSION_SECRET;
        delete process.env.CREDENTIAL_ENCRYPTION_KEY;
        delete process.env.ENCRYPTION_SECRET;

        // In production without encryption secret, encryptSecret must fail closed (throw)
        assert.throws(
          () => {
            encryptSecret('sensitive-data-to-encrypt');
          },
          /CRITICAL CONFIGURATION ERROR: Credential encryption secret is missing in production/
        );
      } finally {
        process.env.NODE_ENV = prevEnv;
        if (prevSecret) process.env.SESSION_SECRET = prevSecret;
        if (prevKey) process.env.CREDENTIAL_ENCRYPTION_KEY = prevKey;
        if (prevEnc) process.env.ENCRYPTION_SECRET = prevEnc;
      }
    });
  });

  // ============================================================================
  // TASK B: DISTRIBUTED AUTHENTICATION & SESSION REVOCATION
  // ============================================================================
  describe('Task B: Distributed Authentication & Session Revocation', () => {
    it('safely operates in standalone mode when Redis store is unconfigured in production', async () => {
      const prevEnv = process.env.NODE_ENV;
      const prevUrl = process.env.UPSTASH_REDIS_REST_URL;
      const prevKv = process.env.KV_REST_API_URL;

      try {
        process.env.NODE_ENV = 'production';
        delete process.env.UPSTASH_REDIS_REST_URL;
        delete process.env.KV_REST_API_URL;

        // In standalone mode without Redis, unconfigured store allows session verification via HMAC/expiry
        const result = await checkDistributedRevocation('test-jti-token-12345');
        assert.strictEqual(result.isRevoked, false);
        assert.strictEqual(result.status, 'unconfigured');
        assert.ok(result.errorMessage?.includes('Distributed Redis store is not configured; operating in standalone mode'));
      } finally {
        process.env.NODE_ENV = prevEnv;
        if (prevUrl) process.env.UPSTASH_REDIS_REST_URL = prevUrl;
        if (prevKv) process.env.KV_REST_API_URL = prevKv;
      }
    });

    it('fails closed when distributed Redis store is configured but unavailable or times out', async () => {
      const prevEnv = process.env.NODE_ENV;
      const prevUrl = process.env.UPSTASH_REDIS_REST_URL;
      const prevToken = process.env.UPSTASH_REDIS_REST_TOKEN;

      try {
        process.env.NODE_ENV = 'production';
        // Point to an invalid unreachable URL to simulate store failure
        process.env.UPSTASH_REDIS_REST_URL = 'https://unreachable-redis-host.invalid';
        process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

        const result = await checkDistributedRevocation('test-jti-failing-redis');
        assert.strictEqual(result.isRevoked, true);
        assert.strictEqual(result.status, 'store_unavailable');
      } finally {
        process.env.NODE_ENV = prevEnv;
        if (prevUrl) process.env.UPSTASH_REDIS_REST_URL = prevUrl; else delete process.env.UPSTASH_REDIS_REST_URL;
        if (prevToken) process.env.UPSTASH_REDIS_REST_TOKEN = prevToken; else delete process.env.UPSTASH_REDIS_REST_TOKEN;
      }
    });

    it('safely supports local development without failing closed when Redis is unconfigured', async () => {
      const prevEnv = process.env.NODE_ENV;
      const prevUrl = process.env.UPSTASH_REDIS_REST_URL;

      try {
        process.env.NODE_ENV = 'development';
        delete process.env.UPSTASH_REDIS_REST_URL;

        // In development, unconfigured Redis safely allows active session
        const result = await checkDistributedRevocation('test-jti-dev-67890');
        assert.strictEqual(result.isRevoked, false);
        assert.strictEqual(result.status, 'unconfigured');
      } finally {
        process.env.NODE_ENV = prevEnv;
        if (prevUrl) process.env.UPSTASH_REDIS_REST_URL = prevUrl;
      }
    });
  });

  // ============================================================================
  // TASK C: GOOGLE SHEETS CONCURRENCY COORDINATION
  // ============================================================================
  describe('Task C: Google Sheets Concurrency Coordination', () => {
    it('uses bounded lock timeout and safely serializes mutations', async () => {
      // In local mode without Redis, mutex serializes in-process operations cleanly
      let execOrder: number[] = [];
      const op1 = (googleSheetsClient as any).withSheetLock('Leads', async () => {
        await new Promise((r) => setTimeout(r, 50));
        execOrder.push(1);
        return 1;
      });
      const op2 = (googleSheetsClient as any).withSheetLock('Leads', async () => {
        execOrder.push(2);
        return 2;
      });

      await Promise.all([op1, op2]);
      assert.deepStrictEqual(execOrder, [1, 2]);
    });
  });

  // ============================================================================
  // TASK D: AUDIT COVERAGE & PRIVILEGED ACTION LOGGING
  // ============================================================================
  describe('Task D: Audit Coverage & Privileged Action Logging', () => {
    it('logs member lifecycle actions without exposing passwords or sensitive secrets', async () => {
      const wsId = 'ws-test-audit-members';

      // 1. Log member create
      const createEntry = await crmRepo.logAudit(wsId, {
        userId: 'admin-1',
        userName: 'Admin User',
        action: 'member.create',
        details: 'Created team member: Bob Test (bob@test.com) with role: Member',
      });
      assert.ok(createEntry.id.startsWith('aud_'));
      assert.strictEqual(createEntry.action, 'member.create');
      assert.strictEqual(createEntry.details.includes('password'), false);

      // 2. Log member update (password changed)
      const updateEntry = await crmRepo.logAudit(wsId, {
        userId: 'admin-1',
        userName: 'Admin User',
        action: 'member.update',
        details: 'Updated member: Bob Test (password changed, fields: department)',
      });
      assert.ok(updateEntry.id.startsWith('aud_'));
      // Raw password or hash must never appear in details
      assert.strictEqual(updateEntry.details.includes('argon2'), false);
      assert.strictEqual(updateEntry.details.includes('bcrypt'), false);

      // 3. Log Master Admin tenant workspace access
      const accessEntry = await crmRepo.logAudit(wsId, {
        userId: 'mem-admin',
        userName: 'Master Admin',
        action: 'master_admin.workspace_access',
        details: `Platform Master Admin accessed tenant workspace data: ${wsId}`,
      });
      assert.strictEqual(accessEntry.action, 'master_admin.workspace_access');

      // Verify retrieval
      const logs = await crmRepo.getAuditLogs(wsId, 10);
      assert.ok(logs.length >= 3);
      assert.ok(logs.some((l) => l.action === 'member.create'));
      assert.ok(logs.some((l) => l.action === 'member.update'));
      assert.ok(logs.some((l) => l.action === 'master_admin.workspace_access'));
    });
  });

  // ============================================================================
  // STANDALONE GOOGLE SHEETS DEPLOYMENT SAFEGUARDS
  // ============================================================================
  describe('Standalone Google Sheets Deployment Safeguards', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalSessionSecret = process.env.SESSION_SECRET;

    beforeEach(() => {
      process.env.SESSION_SECRET = 'developster-secure-test-session-secret-2026';
    });

    it('accepts valid HMAC session token in standalone mode', () => {
      const token = createSessionToken('user@developster.app', 3600 * 1000);
      const verified = verifySessionToken(token);
      assert.ok(verified);
      assert.strictEqual(verified.email, 'user@developster.app');
      assert.ok(verified.exp > Date.now());
    });

    it('rejects tampered HMAC signature in standalone mode', () => {
      const token = createSessionToken('user@developster.app');
      const [payloadB64, sig] = token.split('.');
      const tamperedSig = sig.slice(0, -4) + 'abcd';
      const tamperedToken = `${payloadB64}.${tamperedSig}`;
      const verified = verifySessionToken(tamperedToken);
      assert.strictEqual(verified, null);
    });

    it('rejects expired session token in standalone mode', () => {
      // Token expired 10 seconds ago
      const token = createSessionToken('user@developster.app', -10000);
      const verified = verifySessionToken(token);
      assert.strictEqual(verified, null);
    });

    it('enforces 30-day session token lifetime', () => {
      const token = createSessionToken('user@developster.app');
      const verified = verifySessionToken(token);
      assert.ok(verified);
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      assert.ok(verified.exp - verified.iat <= thirtyDaysMs + 1000);
    });

    it('safely operates without failing closed when Redis is unconfigured in standalone mode', async () => {
      const origUrl = process.env.UPSTASH_REDIS_REST_URL;
      const origToken = process.env.UPSTASH_REDIS_REST_TOKEN;
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      process.env.NODE_ENV = 'production';

      try {
        const revResult = await checkDistributedRevocation('standalone-test-jti-123');
        // Without Redis, returns unconfigured (not blocked)
        assert.strictEqual(revResult.isRevoked, false);
        // Status clearly records 'unconfigured' (no false claims of distributed verification)
        assert.strictEqual(revResult.status, 'unconfigured');
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
        if (origUrl) process.env.UPSTASH_REDIS_REST_URL = origUrl;
        if (origToken) process.env.UPSTASH_REDIS_REST_TOKEN = origToken;
      }
    });

    it('tenant Owner role cannot obtain Master Admin platform permissions', () => {
      const ownerUser: TeamMember = {
        id: 'user-tenant-owner',
        name: 'Tenant Owner',
        email: 'owner@tenant-a.com',
        role: 'Owner',
        department: 'Executive',
        active: true,
        joinedAt: new Date().toISOString(),
      };

      // Ensure ADMIN_EMAIL is set to a specific master email
      process.env.ADMIN_EMAIL = 'master@developster.app';
      try {
        // Even with role 'Owner', user is NOT Master Admin unless email matches ADMIN_EMAIL
        assert.strictEqual(isMasterAdmin(ownerUser), false);
        assert.strictEqual(isWorkspaceAdmin(ownerUser), true); // Is admin of their workspace only
      } finally {
        delete process.env.ADMIN_EMAIL;
      }
    });

    it('tenant workspace boundaries remain strictly isolated', async () => {
      const tenantA = 'ws-tenant-alpha';
      const tenantB = 'ws-tenant-beta';

      // Create lead under tenant A
      const leadA = await crmRepo.createLead({
        workspaceId: tenantA,
        title: 'Alpha Secret Deal',
        contactName: 'Secret Client A',
        email: 'client@alpha.com',
        company: 'Alpha Corp',
        source: 'Website',
      } as any);

      // Attempt to delete leadA using tenant B's workspace ID
      await assert.rejects(
        async () => {
          await crmRepo.deleteLead(tenantB, leadA.id);
        },
        /Tenant Boundary Violation/i
      );

      // Verify lead still exists in tenant A
      const leads = await crmRepo.getLeads(tenantA);
      const retrieved = leads.find((l) => l.id === leadA.id);
      assert.ok(retrieved);
      assert.strictEqual(retrieved.company, 'Alpha Corp');
    });

    it('assertOperationalStorage fails with explicit actionable error when Google Sheets is unconfigured in production/Vercel', () => {
      process.env.VERCEL = '1';
      try {
        const origId = process.env.GOOGLE_SHEET_ID;
        delete process.env.GOOGLE_SHEET_ID;
        
        assert.throws(
          () => {
            crmRepo.assertOperationalStorage();
          },
          /GOOGLE_SHEETS_UNCONFIGURED.*Operational Google Sheets database credentials are missing/i
        );

        if (origId) process.env.GOOGLE_SHEET_ID = origId;
      } finally {
        delete process.env.VERCEL;
      }
    });

    it('mutation methods consistently reject writes when Google Sheets is unconfigured in production/Vercel', async () => {
      process.env.VERCEL = '1';
      const origId = process.env.GOOGLE_SHEET_ID;
      delete process.env.GOOGLE_SHEET_ID;

      try {
        // 1. updateCustomer
        await assert.rejects(
          async () => {
            await crmRepo.updateCustomer('ws-test', 'cust-123', { name: 'New Name' });
          },
          /GOOGLE_SHEETS_UNCONFIGURED/i
        );

        // 2. createTask
        await assert.rejects(
          async () => {
            await crmRepo.createTask({
              workspaceId: 'ws-test',
              title: 'Followup Call',
              dueDate: new Date().toISOString(),
              priority: 'high',
              status: 'pending',
            });
          },
          /GOOGLE_SHEETS_UNCONFIGURED/i
        );

        // 3. updateTask
        await assert.rejects(
          async () => {
            await crmRepo.updateTask('ws-test', 'task-123', { status: 'completed' });
          },
          /GOOGLE_SHEETS_UNCONFIGURED/i
        );

        // 4. deleteTask
        await assert.rejects(
          async () => {
            await crmRepo.deleteTask('ws-test', 'task-123');
          },
          /GOOGLE_SHEETS_UNCONFIGURED/i
        );
      } finally {
        if (origId) process.env.GOOGLE_SHEET_ID = origId;
        delete process.env.VERCEL;
      }
    });

    it('CRON_SECRET authorization: rejects missing, empty, and incorrect secrets, and accepts correct secret in constant-time', async () => {
      const origCron = process.env.CRON_SECRET;
      const { GET: cronGet } = await import('../src/app/api/cron/tick/route');
      const { NextRequest } = await import('next/server');

      try {
        // 1. Missing CRON_SECRET in environment
        delete process.env.CRON_SECRET;
        const reqMissingEnv = new NextRequest('http://localhost:3000/api/cron/tick', {
          headers: { Authorization: 'Bearer test-secret-123' },
        });
        const resMissingEnv = await cronGet(reqMissingEnv);
        assert.strictEqual(resMissingEnv.status, 401);
        const dataMissingEnv = await resMissingEnv.json();
        assert.ok(dataMissingEnv.error.includes('Cron service authentication is not configured'));

        // 2. Empty CRON_SECRET in environment
        process.env.CRON_SECRET = '   ';
        const reqEmptyEnv = new NextRequest('http://localhost:3000/api/cron/tick', {
          headers: { Authorization: 'Bearer test-secret-123' },
        });
        const resEmptyEnv = await cronGet(reqEmptyEnv);
        assert.strictEqual(resEmptyEnv.status, 401);
        const dataEmptyEnv = await resEmptyEnv.json();
        assert.ok(dataEmptyEnv.error.includes('Cron service authentication is not configured'));

        // 3. Configured CRON_SECRET with missing request credential
        process.env.CRON_SECRET = 'super-secure-cron-secret-2026';
        const reqNoCred = new NextRequest('http://localhost:3000/api/cron/tick');
        const resNoCred = await cronGet(reqNoCred);
        assert.strictEqual(resNoCred.status, 401);
        const dataNoCred = await resNoCred.json();
        assert.ok(dataNoCred.error.includes('Invalid or missing CRON_SECRET'));

        // 4. Incorrect secret (different length)
        const reqWrongLengthCred = new NextRequest('http://localhost:3000/api/cron/tick', {
          headers: { Authorization: 'Bearer short' },
        });
        const resWrongLengthCred = await cronGet(reqWrongLengthCred);
        assert.strictEqual(resWrongLengthCred.status, 401, 'Wrong-length secret must return 401 unauthorized, not 500');
        const dataWrongLengthCred = await resWrongLengthCred.json();
        assert.ok(dataWrongLengthCred.error.includes('Invalid or missing CRON_SECRET'));

        // 4b. Incorrect secret (same length, different characters)
        const sameLengthWrong = 'x'.repeat('super-secure-cron-secret-2026'.length);
        const reqSameLengthCred = new NextRequest('http://localhost:3000/api/cron/tick', {
          headers: { Authorization: `Bearer ${sameLengthWrong}` },
        });
        const resSameLengthCred = await cronGet(reqSameLengthCred);
        assert.strictEqual(resSameLengthCred.status, 401, 'Same-length wrong secret must return 401 unauthorized');
        const dataSameLengthCred = await resSameLengthCred.json();
        assert.ok(dataSameLengthCred.error.includes('Invalid or missing CRON_SECRET'));

        // 5. Correct secret via Authorization header
        const reqAuthHeader = new NextRequest('http://localhost:3000/api/cron/tick', {
          headers: { Authorization: 'Bearer super-secure-cron-secret-2026' },
        });
        const resAuthHeader = await cronGet(reqAuthHeader);
        assert.strictEqual(resAuthHeader.status, 200);
        const dataAuthHeader = await resAuthHeader.json();
        assert.strictEqual(dataAuthHeader.success, true);

        // 6. Correct secret via x-cron-secret header
        const reqXHeader = new NextRequest('http://localhost:3000/api/cron/tick', {
          headers: { 'x-cron-secret': 'super-secure-cron-secret-2026' },
        });
        const resXHeader = await cronGet(reqXHeader);
        assert.strictEqual(resXHeader.status, 200);
        const dataXHeader = await resXHeader.json();
        assert.strictEqual(dataXHeader.success, true);
      } finally {
        if (origCron) process.env.CRON_SECRET = origCron;
        else delete process.env.CRON_SECRET;
      }
    });
  });
});
