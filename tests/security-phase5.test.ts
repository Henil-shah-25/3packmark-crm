/**
 * Phase 5 Dedicated Security Test Suite
 * Developster Hub CRM — Phase 5 Security Remediation
 * 
 * Verifies:
 * 1. PostgreSQL Schema & RLS policies (tenant context scoping, transaction boundaries)
 * 2. Distributed Session Revocation Store
 * 3. Webhook Atomic Idempotency Store
 * 4. Redis Lua Script Rate Limiting & Fail-Open/Closed Policies
 * 5. Secondary Route Rate Limits & JSON Body Caps
 * 6. CSP & Security Headers
 * 7. Migration Engine Dry-Run & Integrity Checks
 * 8. Comprehensive SQL Injection Attack Suite (15+ SQLi vectors)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { NextRequest, NextResponse } from 'next/server';
import {
  buildSelectQuery,
  buildInsertQuery,
  buildUpdateQuery,
  buildDeleteQuery,
  assertSafeIdentifier,
  assertSafeSortDirection,
} from '../src/lib/database/query-builder';
import { withTenantTransaction, memoryDb } from '../src/lib/database/client';
import { sessionRevocationStore } from '../src/lib/database/session-store';
import { webhookIdempotencyStore } from '../src/lib/database/idempotency-store';
import { ATOMIC_RATE_LIMIT_LUA, UpstashRedisStore } from '../src/lib/rate-limit/stores/redis';
import { RATE_LIMIT_PRESETS, checkRateLimit } from '../src/lib/rate-limit';
import { applySecurityHeaders } from '../src/middleware';
import { parseAndValidateJson } from '../src/lib/security';
import { JsonToPostgresMigrator } from '../src/lib/database/migrator';

describe('PHASE 5: MULTI-TENANT POSTGRESQL & INFRASTRUCTURE HARDENING', () => {

  // 1. Transaction-Scoped Tenant Context & RLS Isolation
  describe('1. Tenant Boundary & Transaction-Scoped Context', () => {
    it('enforces active tenant context within transaction', async () => {
      let capturedWs = '';
      await withTenantTransaction({ workspaceId: 'ws-tenant-alpha' }, async (executor) => {
        capturedWs = executor.workspaceId;
        assert.strictEqual(memoryDb.getActiveWorkspaceId(), 'ws-tenant-alpha');
        assert.strictEqual(memoryDb.getIsMasterAdmin(), false);
      });

      assert.strictEqual(capturedWs, 'ws-tenant-alpha');
      // Verify session reverted after transaction completion (connection pool safety)
      assert.strictEqual(memoryDb.getActiveWorkspaceId(), null);
    });

    it('rejects transaction execution without workspaceId', async () => {
      await assert.rejects(
        async () => {
          await withTenantTransaction({ workspaceId: '' }, async () => {});
        },
        /Tenant Boundary Violation/
      );
    });

    it('reverts tenant context even when transaction throws error', async () => {
      try {
        await withTenantTransaction({ workspaceId: 'ws-failing' }, async () => {
          throw new Error('Transaction failure simulation');
        });
      } catch (err: any) {
        assert.strictEqual(err.message, 'Transaction failure simulation');
      }

      // Must be null to avoid cross-tenant contamination in connection pool
      assert.strictEqual(memoryDb.getActiveWorkspaceId(), null);
    });
  });

  // 2. Distributed Session Revocation Store
  describe('2. Distributed Session Revocation Store', () => {
    it('records and verifies revoked token JTI', () => {
      const testJti = `jti-test-${Date.now()}`;
      assert.strictEqual(sessionRevocationStore.isRevokedSync(testJti), false);

      sessionRevocationStore.revokeTokenSync(testJti, 'usr-123', 'admin_logout', 3600);
      assert.strictEqual(sessionRevocationStore.isRevokedSync(testJti), true);
    });

    it('handles expired revocations pruning cleanly', () => {
      const expiredJti = `jti-expired-${Date.now()}`;
      // Revoke with negative TTL (already expired)
      sessionRevocationStore.revokeTokenSync(expiredJti, 'usr-exp', 'test', -10);

      // Trigger prune
      sessionRevocationStore.pruneExpired();
      assert.strictEqual(sessionRevocationStore.isRevokedSync(expiredJti), false);
    });
  });

  // 3. Webhook Atomic Idempotency Store
  describe('3. Webhook Atomic Idempotency Store', () => {
    it('manages atomic lifecycle transitions: processing -> completed', async () => {
      const deliveryId = `del-${Date.now()}`;
      const record = await webhookIdempotencyStore.checkAndRecord({
        workspaceId: 'ws-store-1',
        provider: 'shopify',
        deliveryId,
      });

      assert.strictEqual(record.isDuplicate, false);
      assert.strictEqual(record.status, 'processing');

      // Duplicate delivery while processing
      const dup = await webhookIdempotencyStore.checkAndRecord({
        workspaceId: 'ws-store-1',
        provider: 'shopify',
        deliveryId,
      });
      assert.strictEqual(dup.isDuplicate, true);
      assert.strictEqual(dup.status, 'processing');

      // Mark completed
      await webhookIdempotencyStore.markCompleted('ws-store-1', 'shopify', deliveryId, { orderId: '1001' });

      // Duplicate delivery after completion
      const afterComplete = await webhookIdempotencyStore.checkAndRecord({
        workspaceId: 'ws-store-1',
        provider: 'shopify',
        deliveryId,
      });
      assert.strictEqual(afterComplete.isDuplicate, true);
      assert.strictEqual(afterComplete.status, 'completed');
    });

    it('scopes idempotency records to workspace and provider (no cross-tenant collision)', async () => {
      const sharedDeliveryId = `shared-event-${Date.now()}`;

      // Tenant A
      const tenantA = await webhookIdempotencyStore.checkAndRecord({
        workspaceId: 'ws-tenant-a',
        provider: 'shopify',
        deliveryId: sharedDeliveryId,
      });
      assert.strictEqual(tenantA.isDuplicate, false);

      // Tenant B (same delivery ID, different tenant)
      const tenantB = await webhookIdempotencyStore.checkAndRecord({
        workspaceId: 'ws-tenant-b',
        provider: 'shopify',
        deliveryId: sharedDeliveryId,
      });
      assert.strictEqual(tenantB.isDuplicate, false);
    });
  });

  // 4. Redis Lua Script & Rate Limiter Resilience
  describe('4. Redis Lua Script & Fail-Open/Closed Resilience', () => {
    it('contains valid atomic Lua script definition with sliding window algorithm', () => {
      assert.ok(ATOMIC_RATE_LIMIT_LUA.includes('redis.call(\'ZREMRANGEBYSCORE\''));
      assert.ok(ATOMIC_RATE_LIMIT_LUA.includes('redis.call(\'ZCARD\''));
      assert.ok(ATOMIC_RATE_LIMIT_LUA.includes('redis.call(\'ZADD\''));
      assert.ok(ATOMIC_RATE_LIMIT_LUA.includes('PEXPIRE') || ATOMIC_RATE_LIMIT_LUA.includes('EXPIRE'));
    });

    it('enforces fail-open vs fail-closed policy on connection failure', async () => {
      // Create store pointing to unreachable URL
      const failOpenStore = new UpstashRedisStore({
        url: 'http://127.0.0.1:9',
        token: 'mock-token',
        failurePolicy: 'fail-open',
        timeoutMs: 100,
      });

      const failClosedStore = new UpstashRedisStore({
        url: 'http://127.0.0.1:9',
        token: 'mock-token',
        failurePolicy: 'fail-closed',
        timeoutMs: 100,
      });

      const openCounter = await failOpenStore.increment('test:fail-open', 60000, 1);
      assert.strictEqual(openCounter.count, 1); // Allows request to proceed in fail-open mode

      await assert.rejects(
        async () => {
          await failClosedStore.increment('test:fail-closed', 60000, 1);
        },
        /Upstash Redis|fetch failed|ECONNREFUSED/
      );
    });
  });

  // 5. Secondary Route Rate Limits & JSON Body Caps
  describe('5. Rate Limit Presets & JSON Size Caps', () => {
    it('defines required Phase 5 rate limit presets', () => {
      assert.ok(RATE_LIMIT_PRESETS.ACTIVITIES_WRITE);
      assert.strictEqual(RATE_LIMIT_PRESETS.ACTIVITIES_WRITE.limit, 60);

      assert.ok(RATE_LIMIT_PRESETS.CALENDAR_SYNC);
      assert.strictEqual(RATE_LIMIT_PRESETS.CALENDAR_SYNC.limit, 30);

      assert.ok(RATE_LIMIT_PRESETS.SHEETS_IMPORT);
      assert.strictEqual(RATE_LIMIT_PRESETS.SHEETS_IMPORT.limit, 10);
    });

    it('enforces payload size cap via parseAndValidateJson', async () => {
      // 100KB payload
      const largeData = { text: 'X'.repeat(100 * 1024) };
      const req = new NextRequest('http://localhost:3000/api/activities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(JSON.stringify(largeData).length),
        },
        body: JSON.stringify(largeData),
      });

      // Cap at 64KB
      const result = await parseAndValidateJson(req, { maxBytes: 64 * 1024 });
      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.strictEqual(result.response.status, 413);
      }
    });
  });

  // 6. Content Security Policy & Security Headers
  describe('6. Content Security Policy & Strict Security Headers', () => {
    it('attaches complete production security headers via middleware', () => {
      const baseRes = NextResponse.next();
      const res = applySecurityHeaders(baseRes, false);

      const csp = res.headers.get('Content-Security-Policy');
      assert.ok(csp, 'CSP header must be present');
      assert.ok(csp.includes("default-src 'self'"), 'CSP must restrict default-src');
      assert.ok(csp.includes("frame-ancestors 'none'"), 'CSP must restrict frame-ancestors');
      assert.ok(csp.includes("object-src 'none'"), 'CSP must restrict object-src');

      assert.strictEqual(res.headers.get('X-Content-Type-Options'), 'nosniff');
      assert.strictEqual(res.headers.get('X-Frame-Options'), 'DENY');
      assert.strictEqual(res.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin');
      assert.strictEqual(res.headers.get('Permissions-Policy'), 'camera=(), microphone=(), geolocation=(), payment=()');
    });
  });

  // 7. Migration Engine Dry-Run & Integrity Checks
  describe('7. Data Migration Engine Dry-Run Validation', () => {
    it('executes dry-run against data files and validates schema integrity', async () => {
      const migrator = new JsonToPostgresMigrator();
      const result = await migrator.runMigration({ dryRun: true });

      assert.strictEqual(result.dryRun, true);
      assert.strictEqual(result.executedQueriesCount, 0);
      assert.ok(result.stats.workspaces >= 1, 'Must detect at least 1 workspace in data');
      assert.ok(result.stats.users >= 1, 'Must detect at least 1 user in data');
      assert.ok(result.rollbackPlan.includes('ROLLBACK PROCEDURE'));
    });
  });

  // 8. Comprehensive SQL Injection Attack Suite (15+ SQLi Vectors)
  describe('8. Comprehensive SQL Injection Attack Suite (15+ Vectors)', () => {
    const sqliVectors = [
      { name: '1. Classical Tautology', payload: "' OR '1'='1" },
      { name: '2. Comment Truncation', payload: "admin' --" },
      { name: '3. Inline Block Comment', payload: "admin' /*" },
      { name: '4. Stacked Queries', payload: "'; DROP TABLE users; --" },
      { name: '5. UNION SELECT Attack', payload: "' UNION SELECT id, password_hash, email FROM users --" },
      { name: '6. Blind Boolean AND', payload: "' AND 1=1 --" },
      { name: '7. Blind Time-Based sleep', payload: "' OR pg_sleep(5) --" },
      { name: '8. Subquery Injection', payload: "(SELECT password_hash FROM users LIMIT 1)" },
      { name: '9. Hex Encoded Tautology', payload: "0x27204f5220313d31" },
      { name: '10. Escaped Backslash Quote', payload: "\\'; SELECT * FROM users; --" },
      { name: '11. Second Order Vector', payload: "test' UNION ALL SELECT 1, 2, 3 --" },
      { name: '12. Nested Function Call', payload: "version() || CURRENT_USER" },
      { name: '13. String Concatenation Bypass', payload: "' || 'a' || '" },
      { name: '14. Case-Insensitive Tautology', payload: "' oR 'x'='x" },
      { name: '15. Blind Error-Based CAST', payload: "CAST((SELECT table_name FROM information_schema.tables LIMIT 1) AS INT)" },
    ];

    it('safely parameterizes all 15 SQLi vectors in SELECT query builder (values NEVER inlined into SQL)', () => {
      for (const vector of sqliVectors) {
        const query = buildSelectQuery({
          table: 'leads',
          fields: ['id', 'email', 'status'],
          where: {
            workspace_id: 'ws-default',
            email: vector.payload,
          },
        });

        // 1. Injected payload MUST NOT appear in the SQL text string
        assert.ok(
          !query.text.includes(vector.payload),
          `Vector ${vector.name} leaked into SQL text: ${query.text}`
        );

        // 2. Query text must contain parameter placeholders ($1, $2, etc.)
        assert.ok(query.text.includes('$1') && query.text.includes('$2'));

        // 3. Vector must be isolated as an element in the values array
        assert.ok(
          query.values.includes(vector.payload),
          `Vector ${vector.name} missing from parameterized values array`
        );
      }
    });

    it('safely parameterizes all 15 SQLi vectors in INSERT query builder', () => {
      for (const vector of sqliVectors) {
        const query = buildInsertQuery('audit_logs', {
          id: 'log-1',
          workspace_id: 'ws-default',
          action: vector.payload,
        });

        assert.ok(!query.text.includes(vector.payload));
        assert.ok(query.values.includes(vector.payload));
      }
    });

    it('safely parameterizes all 15 SQLi vectors in UPDATE query builder', () => {
      for (const vector of sqliVectors) {
        const query = buildUpdateQuery(
          'leads',
          { status: vector.payload },
          { id: 'lead-1', workspace_id: 'ws-default' }
        );

        assert.ok(!query.text.includes(vector.payload));
        assert.ok(query.values.includes(vector.payload));
      }
    });

    it('safely parameterizes all 15 SQLi vectors in DELETE query builder', () => {
      for (const vector of sqliVectors) {
        const query = buildDeleteQuery('leads', {
          id: vector.payload,
          workspace_id: 'ws-default',
        });

        assert.ok(!query.text.includes(vector.payload));
        assert.ok(query.values.includes(vector.payload));
      }
    });

    it('strictly rejects malicious SQL injection attempts in table and column identifiers', () => {
      const maliciousIdentifiers = [
        'users; DROP TABLE workspaces;',
        'users WHERE 1=1',
        'leads-- ',
        'workspace/*comment*/',
        'id, password_hash FROM users--',
        '`users`',
        'users.id',
        '1=1',
      ];

      for (const id of maliciousIdentifiers) {
        assert.throws(
          () => assertSafeIdentifier(id),
          /SQL Injection Attempt Detected/,
          `Identifier ${id} should have been rejected`
        );
      }
    });

    it('strictly rejects malicious SQL injection attempts in sort order direction', () => {
      const maliciousDirections = [
        'ASC; DROP TABLE users;',
        'DESC--',
        'ASC UNION SELECT 1',
        '1=1',
      ];

      for (const dir of maliciousDirections) {
        assert.throws(
          () => assertSafeSortDirection(dir),
          /SQL Injection Attempt Detected/,
          `Sort direction ${dir} should have been rejected`
        );
      }
    });
  });
});
