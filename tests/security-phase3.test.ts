import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

// Ensure test environment variables are initialized for standalone execution
if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = 'test-session-secret-security-hardening-2026';
}
if (!process.env.ADMIN_EMAIL) {
  process.env.ADMIN_EMAIL = 'admin@developster.com';
}
if (!process.env.ADMIN_PASSWORD) {
  process.env.ADMIN_PASSWORD = 'developster_secret_2026';
}

import {
  checkRateLimit,
  createRateLimitResponse,
  getRateLimitHeaders,
  getRateLimiterStore,
  setRateLimiterStore,
  MemoryRateLimiterStore,
  RedisRateLimiterStore,
  RATE_LIMIT_PRESETS,
} from '../src/lib/rate-limit';
import { getClientIp, isValidIp } from '../src/lib/auth/get-ip';
import { POST as postLogin } from '../src/app/api/auth/login/route';
import { POST as postTrack } from '../src/app/api/pulse/v1/track/route';
import { POST as postMember } from '../src/app/api/members/route';
import { POST as postAiChat } from '../src/app/api/ai/chat/route';
import { POST as postShopifyWebhook } from '../src/app/api/pulse/v1/integrations/shopify/webhook/route';
import { createSessionToken } from '../src/lib/auth';
import { pulseRepo } from '../src/lib/pulse/repository';

function createMockRequest(
  url: string,
  options: {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
  } = {}
): NextRequest {
  const reqHeaders = new Headers(options.headers || {});
  if (options.cookies) {
    const cookieStr = Object.entries(options.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
    reqHeaders.set('cookie', cookieStr);
  }
  if (options.body && typeof options.body === 'object') {
    reqHeaders.set('content-type', 'application/json');
  }

  const reqInit: RequestInit = {
    method: options.method || 'GET',
    headers: reqHeaders,
    body: options.body
      ? typeof options.body === 'string'
        ? options.body
        : JSON.stringify(options.body)
      : undefined,
  };

  return new NextRequest(new URL(url, 'http://localhost:3000'), reqInit);
}

// ---------------------------------------------------------------------------
// TEST 1: Login Rate Limiting (Brute Force / Flooding Defense)
// ---------------------------------------------------------------------------
test('Security Phase 3 — 1. Login Rate Limiting triggers 429 when IP limit is exceeded', async () => {
  const testIp = '192.0.2.10';
  const store = getRateLimiterStore();
  await store.reset(`ip:${testIp}:login`);

  const reqUrl = 'http://localhost:3000/api/auth/login';

  // AUTH_LOGIN limit is 10 requests per minute
  let lastStatus = 200;
  for (let i = 0; i < 10; i++) {
    const req = createMockRequest(reqUrl, {
      method: 'POST',
      headers: { 'x-forwarded-for': testIp },
      body: { email: 'wrong-user@developster.com', password: 'wrong-password' },
    });
    const res = await postLogin(req);
    lastStatus = res.status;
    assert.notEqual(res.status, 429, `Attempt ${i + 1} should not be rate limited yet`);
  }

  // 11th attempt must trigger rate limit 429
  const reqBlocked = createMockRequest(reqUrl, {
    method: 'POST',
    headers: { 'x-forwarded-for': testIp },
    body: { email: 'wrong-user@developster.com', password: 'wrong-password' },
  });
  const resBlocked = await postLogin(reqBlocked);
  assert.equal(resBlocked.status, 429, '11th attempt must return HTTP 429');

  const jsonBlocked = await resBlocked.json();
  assert.equal(jsonBlocked.error, 'Too Many Requests');
  assert(jsonBlocked.retryAfter > 0, 'Must include positive retryAfter');
  assert(resBlocked.headers.get('retry-after'), 'Must include Retry-After header');
});

// ---------------------------------------------------------------------------
// TEST 2: Password Reset Rate Limiting
// ---------------------------------------------------------------------------
test('Security Phase 3 — 2. Password Reset Rate Limiting enforces strict threshold', async () => {
  const testIp = '192.0.2.20';
  const resetConfig = {
    limit: RATE_LIMIT_PRESETS.AUTH_PASSWORD_RESET.limit, // 5
    windowMs: RATE_LIMIT_PRESETS.AUTH_PASSWORD_RESET.windowMs,
    identifier: `ip:${testIp}:password-reset`,
    category: 'auth-password-reset',
  };

  const store = getRateLimiterStore();
  await store.reset(resetConfig.identifier);

  // First 5 attempts succeed
  for (let i = 0; i < 5; i++) {
    const result = await checkRateLimit(resetConfig);
    assert.equal(result.success, true, `Password reset attempt ${i + 1} should succeed`);
    assert.equal(result.remaining, 5 - (i + 1));
  }

  // 6th attempt must fail
  const blocked = await checkRateLimit(resetConfig);
  assert.equal(blocked.success, false, '6th password reset attempt must be blocked');
  assert.equal(blocked.remaining, 0);
  assert(blocked.retryAfterSeconds > 0);
});

// ---------------------------------------------------------------------------
// TEST 3: Signup & Member Creation Rate Limiting
// ---------------------------------------------------------------------------
test('Security Phase 3 — 3. Signup & Member Creation Rate Limiting triggers 429', async () => {
  const testIp = '192.0.2.30';
  const store = getRateLimiterStore();
  await store.reset(`ip:${testIp}:member-create`);

  const ownerToken = createSessionToken('admin@developster.com');

  const reqUrl = 'http://localhost:3000/api/members';

  // AUTH_SIGNUP limit is 10
  for (let i = 0; i < 10; i++) {
    const req = createMockRequest(reqUrl, {
      method: 'POST',
      headers: { 'x-forwarded-for': testIp },
      cookies: { crm_session: ownerToken },
      body: {
        workspaceId: 'ws-default',
        name: `Member Test ${i}`,
        email: `member-test-${Date.now()}-${i}@developster.com`,
        role: 'Member',
      },
    });
    const res = await postMember(req);
    assert.notEqual(res.status, 429, `Member creation ${i + 1} should be within limit`);
  }

  // 11th creation attempt from same IP must be rate limited
  const reqBlocked = createMockRequest(reqUrl, {
    method: 'POST',
    headers: { 'x-forwarded-for': testIp },
    cookies: { crm_session: ownerToken },
    body: {
      workspaceId: 'ws-default',
      name: 'Blocked Member',
      email: 'blocked-member@developster.com',
      role: 'Member',
    },
  });
  const resBlocked = await postMember(reqBlocked);
  assert.equal(resBlocked.status, 429, '11th member creation must be blocked with HTTP 429');
});

// ---------------------------------------------------------------------------
// TEST 4: Public Pulse Ingestion Limits (Oversized payload, IP flood, Tenant limits)
// ---------------------------------------------------------------------------
test('Security Phase 3 — 4. Public Pulse Ingestion Limits (Payload Size, IP limit, Tenant limit)', async () => {
  // 4A: Oversized payload (> 64KB) rejection
  const largeData = 'x'.repeat(70 * 1024); // 70KB
  const reqLarge = createMockRequest('http://localhost:3000/api/pulse/v1/track', {
    method: 'POST',
    headers: { 'x-forwarded-for': '192.0.2.40' },
    body: JSON.stringify({ siteId: 'psite_live_dev7a9b2c4', data: largeData }),
  });
  const resLarge = await postTrack(reqLarge);
  assert.equal(resLarge.status, 413, 'Oversized payload (>64KB) must return 413 Payload Too Large');

  // 4B: IP rate limit
  const testIp = '192.0.2.41';
  const store = getRateLimiterStore();
  await store.reset(`ip:${testIp}:pulse-track`);

  // Fill IP quota (PULSE_TRACK_IP limit: 120)
  for (let i = 0; i < 120; i++) {
    await store.increment(`ip:${testIp}:pulse-track`, 60_000, 1);
  }

  // Next request with valid payload must trigger 429
  const reqIpBlocked = createMockRequest('http://localhost:3000/api/pulse/v1/track', {
    method: 'POST',
    headers: { 'x-forwarded-for': testIp },
    body: { siteId: 'psite_live_dev7a9b2c4', type: 'pageview', path: '/' },
  });
  const resIpBlocked = await postTrack(reqIpBlocked);
  assert.equal(resIpBlocked.status, 429, 'Pulse tracking must return 429 when IP limit is exhausted');

  // 4C: Tenant / Site quota limit (1000 req/min)
  const tenantKey = 'tenant:ws-default:site:psite_live_dev7a9b2c4:pulse-track';
  await store.reset(tenantKey);
  for (let i = 0; i < 1000; i++) {
    await store.increment(tenantKey, 60_000, 1);
  }

  const reqTenantBlocked = createMockRequest('http://localhost:3000/api/pulse/v1/track', {
    method: 'POST',
    headers: { 'x-forwarded-for': '192.0.2.42' }, // Fresh IP
    body: { siteId: 'psite_live_dev7a9b2c4', type: 'pageview', path: '/' },
  });
  const resTenantBlocked = await postTrack(reqTenantBlocked);
  assert.equal(resTenantBlocked.status, 429, 'Pulse tracking must return 429 when tenant limit is exhausted');
});

// ---------------------------------------------------------------------------
// TEST 5: Tenant-Specific Limits & Isolation
// ---------------------------------------------------------------------------
test('Security Phase 3 — 5. Tenant-specific limits isolate tenants (Tenant A exhaustion does not block Tenant B)', async () => {
  const store = getRateLimiterStore();
  const tenantAKey = 'tenant:ws-tenant-alpha:ai';
  const tenantBKey = 'tenant:ws-tenant-beta:ai';

  await store.reset(tenantAKey);
  await store.reset(tenantBKey);

  // Exhaust Tenant A's AI quota (limit 60)
  for (let i = 0; i < 60; i++) {
    await checkRateLimit({
      limit: 60,
      windowMs: 60_000,
      identifier: tenantAKey,
      category: 'ai-tenant',
    });
  }

  // Tenant A is now blocked
  const resA = await checkRateLimit({
    limit: 60,
    windowMs: 60_000,
    identifier: tenantAKey,
    category: 'ai-tenant',
  });
  assert.equal(resA.success, false, 'Tenant A must be blocked');

  // Tenant B is completely unaffected
  const resB = await checkRateLimit({
    limit: 60,
    windowMs: 60_000,
    identifier: tenantBKey,
    category: 'ai-tenant',
  });
  assert.equal(resB.success, true, 'Tenant B must NOT be blocked by Tenant A exhaustion');
  assert.equal(resB.remaining, 59);
});

// ---------------------------------------------------------------------------
// TEST 6: IP-Based Limits & Isolation
// ---------------------------------------------------------------------------
test('Security Phase 3 — 6. IP-based limits isolate clients (Attacker IP blocked, clean IP allowed)', async () => {
  const attackerIp = '198.51.100.1';
  const cleanIp = '198.51.100.2';
  const store = getRateLimiterStore();

  await store.reset(`ip:${attackerIp}:test`);
  await store.reset(`ip:${cleanIp}:test`);

  const limit = 5;
  for (let i = 0; i < limit; i++) {
    await checkRateLimit({ limit, windowMs: 60_000, identifier: `ip:${attackerIp}:test` });
  }

  // Attacker is rate limited
  const attackerResult = await checkRateLimit({ limit, windowMs: 60_000, identifier: `ip:${attackerIp}:test` });
  assert.equal(attackerResult.success, false, 'Attacker IP must be blocked');

  // Clean client is unaffected
  const cleanResult = await checkRateLimit({ limit, windowMs: 60_000, identifier: `ip:${cleanIp}:test` });
  assert.equal(cleanResult.success, true, 'Clean IP must be permitted');
  assert.equal(cleanResult.remaining, 4);
});

// ---------------------------------------------------------------------------
// TEST 7: Malformed Forwarded IP Headers Handling & IP Sanitization
// ---------------------------------------------------------------------------
test('Security Phase 3 — 7. Malformed Forwarded IP Headers Handling & Sanitization', async () => {
  // Test isValidIp unit helper
  assert.equal(isValidIp('192.168.1.1'), true);
  assert.equal(isValidIp('8.8.8.8'), true);
  assert.equal(isValidIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334'), true);
  assert.equal(isValidIp('::1'), true);

  // Invalid IPs
  assert.equal(isValidIp('999.999.999.999'), false);
  assert.equal(isValidIp('1.2.3.256'), false);
  assert.equal(isValidIp('1.2.3'), false);
  assert.equal(isValidIp(''), false);
  assert.equal(isValidIp(null as any), false);
  assert.equal(isValidIp('<script>alert(1)</script>'), false);
  assert.equal(isValidIp('../../etc/passwd'), false);
  assert.equal(isValidIp("1.2.3.4' OR '1'='1"), false);

  // getClientIp extraction test cases:
  // Case A: Spoofed header with malicious script tag falls back to valid IP or 127.0.0.1
  const reqXss = createMockRequest('http://localhost:3000/api/test', {
    headers: { 'x-forwarded-for': '<script>evil()</script>' },
  });
  assert.equal(getClientIp(reqXss), '127.0.0.1', 'Malformed XSS header must fall back to 127.0.0.1');

  // Case B: Injected traversal falls back safely
  const reqTraversal = createMockRequest('http://localhost:3000/api/test', {
    headers: { 'x-forwarded-for': '../../attack' },
  });
  assert.equal(getClientIp(reqTraversal), '127.0.0.1');

  // Case C: Vercel trusted header takes precedence over spoofed x-forwarded-for
  const reqVercel = createMockRequest('http://localhost:3000/api/test', {
    headers: {
      'x-forwarded-for': '1.2.3.4, 5.6.7.8',
      'x-vercel-forwarded-for': '203.0.113.195',
    },
  });
  assert.equal(getClientIp(reqVercel), '203.0.113.195', 'x-vercel-forwarded-for must take precedence');

  // Case D: Cloudflare cf-connecting-ip
  const reqCf = createMockRequest('http://localhost:3000/api/test', {
    headers: {
      'x-forwarded-for': '1.2.3.4',
      'cf-connecting-ip': '203.0.113.88',
    },
  });
  assert.equal(getClientIp(reqCf), '203.0.113.88', 'cf-connecting-ip must take precedence');
});

// ---------------------------------------------------------------------------
// TEST 8: Rate-Limit Reset and Expiry
// ---------------------------------------------------------------------------
test('Security Phase 3 — 8. Rate-limit reset and expiry restores quota', async () => {
  const store = getRateLimiterStore();
  const testKey = 'test:expiry-window';
  await store.reset(testKey);

  // Use a short 200ms window
  const shortConfig = {
    limit: 2,
    windowMs: 200,
    identifier: testKey,
  };

  const r1 = await checkRateLimit(shortConfig);
  assert.equal(r1.success, true);
  const r2 = await checkRateLimit(shortConfig);
  assert.equal(r2.success, true);
  const r3 = await checkRateLimit(shortConfig);
  assert.equal(r3.success, false, '3rd request within window must be rate limited');

  // Wait for window to expire
  await new Promise((resolve) => setTimeout(resolve, 250));

  // Next request must be permitted as a new window
  const r4 = await checkRateLimit(shortConfig);
  assert.equal(r4.success, true, 'Request after window expiration must succeed');
  assert.equal(r4.remaining, 1);
});

// ---------------------------------------------------------------------------
// TEST 9: HTTP 429 Response Behavior & Standard Headers
// ---------------------------------------------------------------------------
test('Security Phase 3 — 9. HTTP 429 response behavior, Retry-After header and body format', async () => {
  const mockResult = {
    success: false,
    limit: 10,
    remaining: 0,
    resetTime: Date.now() + 15_000,
    retryAfterSeconds: 15,
    category: 'auth-login',
    identifier: 'ip:127.0.0.1:login',
    isDistributed: false,
    storeName: 'memory',
  };

  const res = createRateLimitResponse(mockResult, 'Custom rate limit warning');
  assert.equal(res.status, 429, 'Status must be 429');
  assert.equal(res.headers.get('retry-after'), '15', 'Retry-After header must be set');
  assert.equal(res.headers.get('x-ratelimit-limit'), '10');
  assert.equal(res.headers.get('x-ratelimit-remaining'), '0');
  assert(res.headers.get('x-ratelimit-reset'));

  const json = await res.json();
  assert.equal(json.error, 'Too Many Requests');
  assert.equal(json.retryAfter, 15);
  assert.equal(json.limit, 10);
  assert.equal(json.remaining, 0);
  assert.equal(json.category, 'auth-login');
});

// ---------------------------------------------------------------------------
// TEST 10: Legitimate Webhook Retries Compatibility
// ---------------------------------------------------------------------------
test('Security Phase 3 — 10. Legitimate Webhook Retries (Generous burst limit protects retries)', async () => {
  const store = getRateLimiterStore();
  const shopIp = '192.0.2.100';
  await store.reset(`ip:${shopIp}:shopify-webhook`);

  // Ensure shop is registered in pulseRepo for tests
  await pulseRepo.saveIntegration('ws-default', {
    id: 'int-shopify-test',
    workspaceId: 'ws-default',
    platform: 'shopify',
    status: 'connected',
    shopDomain: 'mystore.myshopify.com',
    webhookSecret: 'shpss_test_secret_key_12345',
    createdAt: new Date().toISOString(),
  });

  const rawBody = JSON.stringify({ id: 99991, email: 'customer@myshopify.com' });
  const cryptoModule = await import('crypto');
  const hmac = cryptoModule
    .createHmac('sha256', 'shpss_test_secret_key_12345')
    .update(rawBody, 'utf8')
    .digest('base64');

  // Send 10 rapid deliveries & retries from Shopify
  for (let i = 0; i < 10; i++) {
    const req = createMockRequest('http://localhost:3000/api/pulse/v1/integrations/shopify/webhook', {
      method: 'POST',
      headers: {
        'x-forwarded-for': shopIp,
        'x-shopify-topic': 'orders/create',
        'x-shopify-hmac-sha256': hmac,
        'x-shopify-shop-domain': 'mystore.myshopify.com',
        'x-shopify-webhook-id': `delivery-retry-${i}`,
      },
      body: rawBody,
    });

    const res = await postShopifyWebhook(req);
    // Should NOT be 429
    assert.notEqual(res.status, 429, `Webhook retry ${i + 1} must not be blocked by rate limiting`);
    assert.equal(res.status, 200);
  }
});

// ---------------------------------------------------------------------------
// TEST 11: Concurrent Requests & Atomic Counting
// ---------------------------------------------------------------------------
test('Security Phase 3 — 11. Concurrent requests increment counter accurately without race conditions', async () => {
  const store = getRateLimiterStore();
  const testKey = 'test:concurrent-requests';
  await store.reset(testKey);

  const limit = 20;
  const totalConcurrent = 35;
  const config = {
    limit,
    windowMs: 60_000,
    identifier: testKey,
  };

  // Dispatch 35 concurrent requests
  const promises: Promise<any>[] = [];
  for (let i = 0; i < totalConcurrent; i++) {
    promises.push(checkRateLimit(config));
  }

  const results = await Promise.all(promises);

  const accepted = results.filter((r) => r.success).length;
  const rejected = results.filter((r) => !r.success).length;

  assert.equal(accepted, limit, `Exactly ${limit} requests should be accepted`);
  assert.equal(rejected, totalConcurrent - limit, `Exactly ${totalConcurrent - limit} requests should be rejected`);

  // Verify counter value
  const finalState = await store.get(testKey);
  assert.equal(finalState?.count, totalConcurrent, 'Final store counter must accurately match total requests');
});

// ---------------------------------------------------------------------------
// TEST 12: Attempts to Bypass Rate Limits through Tenant Switching
// ---------------------------------------------------------------------------
test('Security Phase 3 — 12. Attempts to bypass IP limits through tenant switching are blocked', async () => {
  const attackerIp = '198.51.100.99';
  const store = getRateLimiterStore();
  await store.reset(`ip:${attackerIp}:login`);

  const reqUrl = 'http://localhost:3000/api/auth/login';

  // Attacker fires requests switching target emails/workspaces from same IP
  for (let i = 0; i < 10; i++) {
    const req = createMockRequest(reqUrl, {
      method: 'POST',
      headers: { 'x-forwarded-for': attackerIp },
      body: {
        email: `victim-${i}@different-workspace-${i}.com`,
        password: 'Password123!',
      },
    });
    await postLogin(req);
  }

  // 11th request switching to yet another tenant email MUST be blocked by IP limiter
  const reqSwitch = createMockRequest(reqUrl, {
    method: 'POST',
    headers: { 'x-forwarded-for': attackerIp },
    body: {
      email: 'victim-final@another-tenant.com',
      password: 'Password123!',
    },
  });
  const resSwitch = await postLogin(reqSwitch);
  assert.equal(
    resSwitch.status,
    429,
    'Attacker cycling tenant accounts from the same IP must be stopped by the IP rate limiter'
  );
});
