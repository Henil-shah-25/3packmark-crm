/**
 * Phase 5 Dedicated Remediation Test Suite (P0 / P1 / P2 Audit Fixes)
 * Developster Hub CRM — Phase 5 Security Remediation
 * 
 * Verifies:
 * - CRIT-01: Real PostgreSQL client wiring and pool lifecycle management
 * - CRIT-02: RLS Master Admin GUC bypass mitigation (app_user cannot bypass RLS via session GUC)
 * - HIGH-03: set_config transaction-local tenant context isolation
 * - HIGH-01: PostgreSQL-backed Session Revocation Store & fail-closed behavior
 * - HIGH-02: PostgreSQL-backed Webhook Idempotency Store & atomic state transitions
 * - HIGH-04: AI Briefing route authentication & cross-tenant access rejection
 * - HIGH-05: WooCommerce Webhook source validation & cross-tenant rejection
 * - MED-01: CSP production hardening (no unsafe-eval in production)
 * - MED-02: Migrator dry-run vs real execution distinction
 * - MED-03: Redis rate limiter production diagnostics
 * - MED-04: Open redirect prevention via isValidReturnTo
 * - MED-06: buildUpdateQuery standardized (table, updates, where) parameter order
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { NextRequest, NextResponse } from 'next/server';
import {
  buildUpdateQuery,
  buildSelectQuery,
  assertSafeIdentifier,
} from '../src/lib/database/query-builder';
import {
  withTenantTransaction,
  isPostgresConfigured,
  getPostgresPool,
  closePostgresPool,
  memoryDb,
} from '../src/lib/database/client';
import { sessionRevocationStore } from '../src/lib/database/session-store';
import { webhookIdempotencyStore } from '../src/lib/database/idempotency-store';
import { isValidReturnTo, applySecurityHeaders } from '../src/middleware';
import { JsonToPostgresMigrator } from '../src/lib/database/migrator';
import { getRateLimiterStore, setRateLimiterStore } from '../src/lib/rate-limit';
import { POST as wooWebhookPost } from '../src/app/api/pulse/v1/integrations/woocommerce/webhook/route';
import { GET as briefingGet, POST as briefingPost } from '../src/app/api/ai/briefing/route';

describe('PHASE 5 REMEDIATION: P0 / P1 / P2 AUDIT VERIFICATION', () => {

  // 1. CRIT-01 & HIGH-03: PostgreSQL Client & Transaction-Local Tenant Context
  describe('CRIT-01 & HIGH-03: Database Client & set_config Tenant Context', () => {
    it('provides isPostgresConfigured() reflecting environment presence', () => {
      const configured = isPostgresConfigured();
      assert.strictEqual(typeof configured, 'boolean');
    });

    it('prohibits in-memory database fallback when NODE_ENV is production and DATABASE_URL is missing', async () => {
      const originalEnv = process.env.NODE_ENV;
      const originalUrl = process.env.DATABASE_URL;

      try {
        process.env.NODE_ENV = 'production';
        delete process.env.DATABASE_URL;

        await assert.rejects(
          async () => {
            await withTenantTransaction({ workspaceId: 'ws-prod-test' }, async () => {});
          },
          /Production environment requires PostgreSQL/
        );
      } finally {
        process.env.NODE_ENV = originalEnv;
        if (originalUrl) process.env.DATABASE_URL = originalUrl;
      }
    });

    it('reverts tenant context safely after transaction commit or rollback', async () => {
      let activeInside = '';
      await withTenantTransaction({ workspaceId: 'ws-tenant-scoped' }, async () => {
        activeInside = memoryDb.getActiveWorkspaceId() || '';
      });

      assert.strictEqual(activeInside, 'ws-tenant-scoped');
      assert.strictEqual(memoryDb.getActiveWorkspaceId(), null);
    });
  });

  // 2. CRIT-02: RLS Master Admin Bypass Mitigation
  describe('CRIT-02: Master Admin GUC Bypass Mitigation', () => {
    it('always returns false for getIsMasterAdmin() regardless of caller session variables', () => {
      assert.strictEqual(memoryDb.getIsMasterAdmin(), false);
    });

    it('replaces app.is_master_admin check with strict tenant isolation in SQL migration', async () => {
      const fs = await import('fs');
      const sqlContent = fs.readFileSync('src/lib/database/migrations/002_row_level_security.sql', 'utf8');

      // Unsafe user-controlled GUC check must be removed from policies
      assert.ok(
        !sqlContent.includes("current_setting('app.is_master_admin', true) = 'true'"),
        'Vulnerable app.is_master_admin GUC check must not exist in RLS policies'
      );

      // Function must return false
      assert.ok(
        sqlContent.includes('RETURN FALSE;'),
        'is_master_admin_session must return FALSE'
      );
    });
  });

  // 3. HIGH-01: Session Revocation Durability
  describe('HIGH-01: Session Revocation Store Durability & Interfaces', () => {
    it('records and verifies revocation synchronously and asynchronously', async () => {
      const jti = `jti-remed-${Date.now()}`;
      assert.strictEqual(sessionRevocationStore.isRevokedSync(jti), false);
      assert.strictEqual(await sessionRevocationStore.isRevoked(jti), false);

      sessionRevocationStore.revokeTokenSync(jti, 'user@example.com', 'security_audit', 7200);
      assert.strictEqual(sessionRevocationStore.isRevokedSync(jti), true);
      assert.strictEqual(await sessionRevocationStore.isRevoked(jti), true);
    });

    it('prunes expired revocations cleanly', async () => {
      const expiredJti = `jti-exp-${Date.now()}`;
      sessionRevocationStore.revokeTokenSync(expiredJti, 'exp@example.com', 'test', -60);
      
      const pruned = await sessionRevocationStore.pruneExpired();
      assert.ok(pruned >= 1);
      assert.strictEqual(sessionRevocationStore.isRevokedSync(expiredJti), false);
    });
  });

  // 4. HIGH-02: Webhook Idempotency Store
  describe('HIGH-02: Webhook Idempotency Atomic Transitions', () => {
    it('prevents concurrent double-execution on duplicate delivery ID', async () => {
      const deliveryId = `wh-remed-${Date.now()}`;
      const params = {
        workspaceId: 'ws-acme',
        provider: 'shopify' as const,
        deliveryId,
        eventType: 'orders/create',
        rawPayload: JSON.stringify({ id: 101, total: '99.00' }),
      };

      const firstClaim = await webhookIdempotencyStore.acquireDelivery(params);
      assert.strictEqual(firstClaim.acquired, true);
      assert.strictEqual(firstClaim.isDuplicate, false);

      // Concurrent duplicate delivery
      const secondClaim = await webhookIdempotencyStore.acquireDelivery(params);
      assert.strictEqual(secondClaim.acquired, false);
      assert.strictEqual(secondClaim.isDuplicate, true);

      // Mark completed
      await webhookIdempotencyStore.completeDelivery('ws-acme', 'shopify', deliveryId);

      // Third attempt after completion
      const thirdClaim = await webhookIdempotencyStore.acquireDelivery(params);
      assert.strictEqual(thirdClaim.acquired, false);
      assert.strictEqual(thirdClaim.isDuplicate, true);
      assert.strictEqual(thirdClaim.status, 'completed');
    });

    it('allows retry if previous delivery attempt failed', async () => {
      const deliveryId = `wh-retry-${Date.now()}`;
      const params = {
        workspaceId: 'ws-acme',
        provider: 'woocommerce' as const,
        deliveryId,
        eventType: 'order.updated',
        rawPayload: '{"id":202}',
      };

      const firstClaim = await webhookIdempotencyStore.acquireDelivery(params);
      assert.strictEqual(firstClaim.acquired, true);

      // Record failure
      await webhookIdempotencyStore.failDelivery('ws-acme', 'woocommerce', deliveryId, 'Network timeout');

      // Retry should be allowed
      const retryClaim = await webhookIdempotencyStore.acquireDelivery(params);
      assert.strictEqual(retryClaim.acquired, true);
      assert.strictEqual(retryClaim.isDuplicate, false);
    });
  });

  // 5. HIGH-04: AI Briefing Route Authentication & Access Control
  describe('HIGH-04: AI Briefing Route Authentication & Tenant Isolation', () => {
    it('rejects unauthenticated GET requests with 401', async () => {
      const req = new Request('http://localhost:3000/api/ai/briefing?workspaceId=ws-default', {
        method: 'GET',
      });

      const res = await briefingGet(req);
      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.ok(data.error.includes('Unauthorized'));
    });

    it('rejects unauthenticated POST requests with 401', async () => {
      const req = new Request('http://localhost:3000/api/ai/briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: 'ws-default' }),
      });

      const res = await briefingPost(req);
      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.ok(data.error.includes('Unauthorized'));
    });
  });

  // 6. HIGH-05: WooCommerce Webhook Strict Source & Domain Validation
  describe('HIGH-05: WooCommerce Webhook Strict Source & Tenant Binding', () => {
    it('rejects webhook requests missing x-wc-webhook-source header with 401', async () => {
      const req = new Request('http://localhost:3000/api/pulse/v1/integrations/woocommerce/webhook', {
        method: 'POST',
        headers: {
          'x-wc-webhook-topic': 'order.created',
          'x-wc-webhook-signature': 'invalid_sig',
          'x-wc-webhook-delivery-id': 'del-test-123',
        },
        body: JSON.stringify({ id: 123 }),
      });

      const res = await wooWebhookPost(req);
      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.ok(data.error.includes('Missing x-wc-webhook-source header'));
    });

    it('rejects unregistered WooCommerce store domains with 401 (no fallback to ws-default)', async () => {
      const req = new Request('http://localhost:3000/api/pulse/v1/integrations/woocommerce/webhook', {
        method: 'POST',
        headers: {
          'x-wc-webhook-topic': 'order.created',
          'x-wc-webhook-signature': 'invalid_sig',
          'x-wc-webhook-delivery-id': 'del-test-124',
          'x-wc-webhook-source': 'https://unregistered-hacker-store.com',
        },
        body: JSON.stringify({ id: 124 }),
      });

      const res = await wooWebhookPost(req);
      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.ok(data.error.includes('Unregistered or misconfigured WooCommerce shop domain'));
    });
  });

  // 7. MED-01: CSP Production Hardening
  describe('MED-01: Content Security Policy Production Hardening', () => {
    it('removes unsafe-eval from script-src in production mode', () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        const baseRes = NextResponse.next();
        const res = applySecurityHeaders(baseRes, true);

        const csp = res.headers.get('Content-Security-Policy') || '';
        assert.ok(!csp.includes("'unsafe-eval'"), "Production CSP must not contain 'unsafe-eval'");
        assert.ok(csp.includes("script-src 'self'"), "CSP must retain 'self'");
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  // 8. MED-02: Migrator Execution Mode Distinction
  describe('MED-02: Migrator Dry-Run vs Real Execution Distinction', () => {
    it('never executes queries when dryRun is true', async () => {
      const migrator = new JsonToPostgresMigrator();
      const res = await migrator.runMigration({ dryRun: true });

      assert.strictEqual(res.dryRun, true);
      assert.strictEqual(res.executedQueriesCount, 0);
    });

    it('accurately reports database requirement when dryRun is false without connection', async () => {
      const migrator = new JsonToPostgresMigrator();
      const res = await migrator.runMigration({ dryRun: false });

      assert.strictEqual(res.dryRun, false);
      if (!isPostgresConfigured()) {
        assert.strictEqual(res.executedQueriesCount, 0);
        assert.ok(res.issues.some((i) => i.message.includes('requires an active PostgreSQL connection')));
      }
    });
  });

  // 9. MED-03: Redis Rate Limiter Production Diagnostics
  describe('MED-03: Redis Rate Limiter Production Diagnostics', () => {
    it('prohibits silent fallback when STRICT_RATE_LIMIT=true in production', () => {
      const originalEnv = process.env.NODE_ENV;
      const originalStrict = process.env.STRICT_RATE_LIMIT;
      setRateLimiterStore(null); // Reset singleton

      try {
        process.env.NODE_ENV = 'production';
        process.env.STRICT_RATE_LIMIT = 'true';

        assert.throws(
          () => {
            getRateLimiterStore();
          },
          /Distributed Redis rate limiting is required in production/
        );
      } finally {
        process.env.NODE_ENV = originalEnv;
        process.env.STRICT_RATE_LIMIT = originalStrict;
        setRateLimiterStore(null);
      }
    });
  });

  // 10. MED-04: Open Redirect Prevention
  describe('MED-04: Open Redirect Prevention via isValidReturnTo', () => {
    it('accepts safe relative application paths', () => {
      assert.strictEqual(isValidReturnTo('/'), true);
      assert.strictEqual(isValidReturnTo('/leads'), true);
      assert.strictEqual(isValidReturnTo('/settings?tab=general'), true);
      assert.strictEqual(isValidReturnTo('/pipelines/view?id=123'), true);
    });

    it('rejects protocol-relative and external domain URLs', () => {
      assert.strictEqual(isValidReturnTo('//evil.com'), false);
      assert.strictEqual(isValidReturnTo('///evil.com'), false);
      assert.strictEqual(isValidReturnTo('/\\evil.com'), false);
      assert.strictEqual(isValidReturnTo('https://evil.com'), false);
      assert.strictEqual(isValidReturnTo('http://evil.com'), false);
    });

    it('rejects dangerous schemes and control characters', () => {
      assert.strictEqual(isValidReturnTo('javascript:alert(1)'), false);
      assert.strictEqual(isValidReturnTo('/leads\x00'), false);
      assert.strictEqual(isValidReturnTo('/deals\r\nSet-Cookie:bad'), false);
      assert.strictEqual(isValidReturnTo('data:text/html,<script>alert(1)</script>'), false);
    });

    it('rejects backslash traversal and evasion tricks', () => {
      assert.strictEqual(isValidReturnTo('/\\evil.com'), false);
      assert.strictEqual(isValidReturnTo('/leads\\something'), false);
      assert.strictEqual(isValidReturnTo('%2F%2Fevil.com'), false);
    });
  });

  // 11. MED-06: buildUpdateQuery Standard Parameter Ordering
  describe('MED-06: buildUpdateQuery Standard Parameter Ordering', () => {
    it('correctly maps updates ($1..$k) then where ($k+1..$n) placeholders', () => {
      const query = buildUpdateQuery(
        'leads',
        { status: 'Qualified', value: 5000 },
        { id: 'lead-123', workspace_id: 'ws-alpha' }
      );

      assert.strictEqual(
        query.text,
        'UPDATE leads SET status = $1, value = $2 WHERE id = $3 AND workspace_id = $4 RETURNING *'
      );
      assert.deepStrictEqual(query.values, ['Qualified', 5000, 'lead-123', 'ws-alpha']);
    });

    it('throws error when updates or where clause is empty', () => {
      assert.throws(
        () => buildUpdateQuery('leads', {}, { id: 'lead-1' }),
        /Cannot build UPDATE query with empty updates object/
      );

      assert.throws(
        () => buildUpdateQuery('leads', { status: 'Closed' }, {}),
        /Refusing to execute unconstrained UPDATE without WHERE clause/
      );
    });
  });
});
