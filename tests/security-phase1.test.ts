import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { getAuthenticatedUser } from '../src/lib/auth/rbac';
import { createSessionToken } from '../src/lib/auth';
import { pulseRepo } from '../src/lib/pulse/repository';

// Route Handlers
import { GET as getLeads, POST as postLeads } from '../src/app/api/leads/route';
import { GET as getLeadById, PUT as putLeadById, DELETE as deleteLeadById } from '../src/app/api/leads/[id]/route';
import { GET as getTasks, POST as postTasks } from '../src/app/api/tasks/route';
import { PUT as putTaskById, DELETE as deleteTaskById } from '../src/app/api/tasks/[id]/route';
import { GET as getPulseOverview } from '../src/app/api/pulse/v1/overview/route';
import {
  GET as getWebsites,
  POST as postWebsites,
  PUT as putWebsites,
  DELETE as deleteWebsites,
} from '../src/app/api/pulse/v1/websites/route';
import { POST as postShopifyWebhook } from '../src/app/api/pulse/v1/integrations/shopify/webhook/route';
import { POST as postWooCommerceWebhook } from '../src/app/api/pulse/v1/integrations/woocommerce/webhook/route';
import {
  GET as getEmailClick,
  createEmailTrackingSignature,
  verifyEmailTrackingToken,
  isSafeRedirectUrl,
} from '../src/app/api/pulse/v1/email/click/route';
import { middleware } from '../src/middleware';

// Helper to create mock Request with cookie
function createMockRequest(url: string, options: { method?: string; body?: any; cookieToken?: string; headers?: Record<string, string> } = {}): Request {
  const headers = new Headers(options.headers || {});
  if (options.cookieToken) {
    headers.set('cookie', `crm_session=${options.cookieToken}`);
  }
  const init: RequestInit = {
    method: options.method || 'GET',
    headers,
  };
  if (options.body) {
    init.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }
  }
  return new Request(url, init);
}

// Ensure test environment session secret
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'crm-secret-developster-hub-secure-fallback-key-2026';
process.env.ADMIN_EMAIL = 'developsterhub@gmail.com';

test('Security Phase 1 — RBAC Strict Cross-Tenant Isolation & No Fallback', async () => {
  // Aarav is a verified member in 'ws-default'
  const aaravToken = createSessionToken('aarav.mehta@developsterhub.com');
  const reqAaravDefault = createMockRequest('http://localhost:3000/api/leads?workspaceId=ws-default', {
    cookieToken: aaravToken,
  });

  const authDefault = await getAuthenticatedUser(reqAaravDefault, 'ws-default');
  assert.ok(authDefault, 'Aarav is authenticated in ws-default');
  assert.equal(authDefault.user.email, 'aarav.mehta@developsterhub.com');
  assert.equal(authDefault.user.role, 'Member');

  // When Aarav attempts to access a foreign workspace where he is NOT a member:
  const reqAaravForeign = createMockRequest('http://localhost:3000/api/leads?workspaceId=ws-foreign-workspace-999', {
    cookieToken: aaravToken,
  });
  const authForeign = await getAuthenticatedUser(reqAaravForeign, 'ws-foreign-workspace-999');
  assert.equal(
    authForeign,
    null,
    'CRITICAL: Non-member MUST NOT receive synthetic fallback user in foreign workspace — returns null'
  );

  // Unauthenticated request returns null
  const reqUnauth = createMockRequest('http://localhost:3000/api/leads');
  const authUnauth = await getAuthenticatedUser(reqUnauth, 'ws-default');
  assert.equal(authUnauth, null, 'Unauthenticated request returns null');

  // Master Admin can access across workspaces
  const adminToken = createSessionToken('developsterhub@gmail.com');
  const reqAdminForeign = createMockRequest('http://localhost:3000/api/leads?workspaceId=ws-foreign-workspace-999', {
    cookieToken: adminToken,
  });
  const authAdmin = await getAuthenticatedUser(reqAdminForeign, 'ws-foreign-workspace-999');
  assert.ok(authAdmin, 'Master admin is authenticated in any workspace');
  assert.equal(authAdmin.isMasterAdmin, true);
  assert.equal(authAdmin.permissions.canManageTeam, true);
});

test('Security Phase 1 — Unauthenticated API Routes Lockdown (401 Enforced)', async () => {
  // 1. Leads
  const resGetLeads = await getLeads(createMockRequest('http://localhost:3000/api/leads?workspaceId=ws-default'));
  assert.equal(resGetLeads.status, 401, 'GET /api/leads without auth returns 401');

  const resPostLeads = await postLeads(
    createMockRequest('http://localhost:3000/api/leads', {
      method: 'POST',
      body: { title: 'Unauthorized Deal', company: 'Hacker Corp' },
    })
  );
  assert.equal(resPostLeads.status, 401, 'POST /api/leads without auth returns 401');

  // 2. Leads [id]
  const mockParams = Promise.resolve({ id: 'lead-test-123' });
  const resGetLeadId = await getLeadById(
    createMockRequest('http://localhost:3000/api/leads/lead-test-123?workspaceId=ws-default'),
    { params: mockParams }
  );
  assert.equal(resGetLeadId.status, 401, 'GET /api/leads/[id] without auth returns 401');

  const resPutLeadId = await putLeadById(
    createMockRequest('http://localhost:3000/api/leads/lead-test-123', {
      method: 'PUT',
      body: { title: 'Modified Deal' },
    }),
    { params: mockParams }
  );
  assert.equal(resPutLeadId.status, 401, 'PUT /api/leads/[id] without auth returns 401');

  const resDeleteLeadId = await deleteLeadById(
    createMockRequest('http://localhost:3000/api/leads/lead-test-123?workspaceId=ws-default'),
    { params: mockParams }
  );
  assert.equal(resDeleteLeadId.status, 401, 'DELETE /api/leads/[id] without auth returns 401');

  // 3. Tasks
  const resGetTasks = await getTasks(createMockRequest('http://localhost:3000/api/tasks?workspaceId=ws-default'));
  assert.equal(resGetTasks.status, 401, 'GET /api/tasks without auth returns 401');

  const resPostTasks = await postTasks(
    createMockRequest('http://localhost:3000/api/tasks', {
      method: 'POST',
      body: { title: 'Unauthorized Task', workspaceId: 'ws-default' },
    })
  );
  assert.equal(resPostTasks.status, 401, 'POST /api/tasks without auth returns 401');

  const taskParams = Promise.resolve({ id: 'task-test-123' });
  const resPutTask = await putTaskById(
    createMockRequest('http://localhost:3000/api/tasks/task-test-123', {
      method: 'PUT',
      body: { title: 'Modified Task' },
    }),
    { params: taskParams }
  );
  assert.equal(resPutTask.status, 401, 'PUT /api/tasks/[id] without auth returns 401');

  const resDeleteTask = await deleteTaskById(
    createMockRequest('http://localhost:3000/api/tasks/task-test-123?workspaceId=ws-default'),
    { params: taskParams }
  );
  assert.equal(resDeleteTask.status, 401, 'DELETE /api/tasks/[id] without auth returns 401');

  // 4. Pulse Overview
  const resPulseOverview = await getPulseOverview(
    createMockRequest('http://localhost:3000/api/pulse/v1/overview?workspaceId=ws-default')
  );
  assert.equal(resPulseOverview.status, 401, 'GET /api/pulse/v1/overview without auth returns 401');

  // 5. Pulse Websites
  const resGetWebsites = await getWebsites(
    createMockRequest('http://localhost:3000/api/pulse/v1/websites?workspaceId=ws-default')
  );
  assert.equal(resGetWebsites.status, 401, 'GET /api/pulse/v1/websites without auth returns 401');

  const resPostWebsites = await postWebsites(
    createMockRequest('http://localhost:3000/api/pulse/v1/websites', {
      method: 'POST',
      body: { name: 'Unauthorized Site', domain: 'evil.com', workspaceId: 'ws-default' },
    })
  );
  assert.equal(resPostWebsites.status, 401, 'POST /api/pulse/v1/websites without auth returns 401');

  const resPutWebsites = await putWebsites(
    createMockRequest('http://localhost:3000/api/pulse/v1/websites', {
      method: 'PUT',
      body: { id: 'site-1', name: 'Hacked Site', workspaceId: 'ws-default' },
    })
  );
  assert.equal(resPutWebsites.status, 401, 'PUT /api/pulse/v1/websites without auth returns 401');

  const resDeleteWebsites = await deleteWebsites(
    createMockRequest('http://localhost:3000/api/pulse/v1/websites?id=site-1&workspaceId=ws-default')
  );
  assert.equal(resDeleteWebsites.status, 401, 'DELETE /api/pulse/v1/websites without auth returns 401');
});

test('Security Phase 1 — Pulse Overview Authenticated Access & Secret Redaction', async () => {
  const adminToken = createSessionToken('developsterhub@gmail.com');
  const req = createMockRequest('http://localhost:3000/api/pulse/v1/overview?workspaceId=ws-default', {
    cookieToken: adminToken,
  });

  const res = await getPulseOverview(req);
  assert.equal(res.status, 200, 'Authenticated user can access overview');
  const data = await res.json();
  assert.ok(data.overview, 'Overview metrics returned');
  assert.ok(Array.isArray(data.integrations), 'Integrations array returned');

  // Verify webhook secrets are redacted
  for (const integration of data.integrations) {
    if (integration.webhookSecret) {
      assert.equal(
        integration.webhookSecret,
        '••••••••',
        `Integration ${integration.platform} webhookSecret MUST be redacted with bullets`
      );
    }
  }
});

test('Security Phase 1 — Shopify Webhook Mandatory HMAC Verification', async () => {
  const secret = 'shpss_test_secret_key_84920';
  await pulseRepo.saveIntegration('ws-default', {
    platform: 'shopify',
    status: 'connected',
    shopDomain: 'store.myshopify.com',
    webhookSecret: secret,
    enabledEvents: ['orders/create'],
    autoCreateDeals: false,
    autoCreateCustomers: false,
  });

  const rawPayload = JSON.stringify({
    id: 991823,
    email: 'shopify.buyer@example.com',
    total_price: '5400.00',
    currency: 'INR',
  });

  // 1. Missing HMAC header -> 401
  const reqNoHeader = createMockRequest('http://localhost:3000/api/pulse/v1/integrations/shopify/webhook?workspaceId=ws-default', {
    method: 'POST',
    body: rawPayload,
    headers: {
      'x-shopify-topic': 'orders/create',
    },
  });
  const resNoHeader = await postShopifyWebhook(reqNoHeader);
  assert.equal(resNoHeader.status, 401, 'Missing x-shopify-hmac-sha256 header returns 401');

  // 2. Invalid HMAC header -> 401
  const reqInvalidHmac = createMockRequest('http://localhost:3000/api/pulse/v1/integrations/shopify/webhook?workspaceId=ws-default', {
    method: 'POST',
    body: rawPayload,
    headers: {
      'x-shopify-topic': 'orders/create',
      'x-shopify-shop-domain': 'store.myshopify.com',
      'x-shopify-webhook-id': 'wh-test-inv-1',
      'x-shopify-hmac-sha256': 'dGhpcy1pcy1hbi1pbnZhbGlkLWJhc2U2NC1zaWduYXR1cmU=',
    },
  });
  const resInvalidHmac = await postShopifyWebhook(reqInvalidHmac);
  assert.equal(resInvalidHmac.status, 401, 'Invalid HMAC signature returns 401');

  // 3. Valid HMAC header -> 200
  const validHmac = crypto.createHmac('sha256', secret).update(rawPayload, 'utf8').digest('base64');
  const reqValid = createMockRequest('http://localhost:3000/api/pulse/v1/integrations/shopify/webhook?workspaceId=ws-default', {
    method: 'POST',
    body: rawPayload,
    headers: {
      'x-shopify-topic': 'orders/create',
      'x-shopify-shop-domain': 'store.myshopify.com',
      'x-shopify-webhook-id': 'wh-test-valid-1',
      'x-shopify-hmac-sha256': validHmac,
    },
  });
  const resValid = await postShopifyWebhook(reqValid);
  assert.equal(resValid.status, 200, 'Valid HMAC signature returns 200');
  const validData = await resValid.json();
  assert.equal(validData.received, true);
});

test('Security Phase 1 — WooCommerce Webhook Mandatory Signature Verification', async () => {
  const secret = 'wc_secret_hash_key_918237';
  await pulseRepo.saveIntegration('ws-default', {
    platform: 'woocommerce',
    status: 'connected',
    webhookSecret: secret,
    storeUrl: 'https://shop.developster.io',
    enabledEvents: ['order.created'],
    autoCreateDeals: false,
    autoCreateCustomers: false,
  });

  const rawPayload = JSON.stringify({
    id: 88291,
    billing: { email: 'wc.shopper@example.com', first_name: 'Rahul' },
    total: '8999.00',
    currency: 'INR',
  });

  // 1. Missing signature header -> 401
  const reqNoSig = createMockRequest('http://localhost:3000/api/pulse/v1/integrations/woocommerce/webhook?workspaceId=ws-default', {
    method: 'POST',
    body: rawPayload,
    headers: {
      'x-wc-webhook-topic': 'order.created',
    },
  });
  const resNoSig = await postWooCommerceWebhook(reqNoSig);
  assert.equal(resNoSig.status, 401, 'Missing x-wc-webhook-signature header returns 401');

  // 2. Invalid signature header -> 401
  const reqInvalidSig = createMockRequest('http://localhost:3000/api/pulse/v1/integrations/woocommerce/webhook?workspaceId=ws-default', {
    method: 'POST',
    body: rawPayload,
    headers: {
      'x-wc-webhook-topic': 'order.created',
      'x-wc-webhook-delivery-id': 'wc-test-inv-1',
      'x-wc-webhook-signature': 'aW52YWxpZC1zaWduYXR1cmUtYmFzZTY0',
    },
  });
  const resInvalidSig = await postWooCommerceWebhook(reqInvalidSig);
  assert.equal(resInvalidSig.status, 401, 'Invalid WooCommerce signature returns 401');

  // 3. Valid signature header -> 200
  const validSig = crypto.createHmac('sha256', secret).update(rawPayload, 'utf8').digest('base64');
  const reqValid = createMockRequest('http://localhost:3000/api/pulse/v1/integrations/woocommerce/webhook?workspaceId=ws-default', {
    method: 'POST',
    body: rawPayload,
    headers: {
      'x-wc-webhook-topic': 'order.created',
      'x-wc-webhook-delivery-id': 'wc-test-valid-1',
      'x-wc-webhook-signature': validSig,
    },
  });
  const resValid = await postWooCommerceWebhook(reqValid);
  assert.equal(resValid.status, 200, 'Valid WooCommerce signature returns 200');
  const validData = await resValid.json();
  assert.equal(validData.received, true);
});

test('Security Phase 1 — Email Click Open Redirect Elimination & Token Verification', async () => {
  // Ensure registered website in ws-default
  await pulseRepo.createWebsite({
    workspaceId: 'ws-default',
    name: 'Developster App',
    domain: 'developsterhub.com',
    whitelistedDomains: ['developsterhub.com', 'shop.developsterhub.com'],
    status: 'active',
  });

  // 1. External untrusted destination blocked
  const resUntrusted = await getEmailClick(
    createMockRequest('http://localhost:3000/api/pulse/v1/email/click?wid=ws-default&target=https://attacker-phishing.com/steal-creds')
  );
  assert.equal(resUntrusted.status, 400, 'Arbitrary external redirect target is rejected with 400');

  // 2. Protocol-relative URL blocked
  const resProtoRelative = await getEmailClick(
    createMockRequest('http://localhost:3000/api/pulse/v1/email/click?wid=ws-default&target=//attacker.com/evil')
  );
  assert.equal(resProtoRelative.status, 400, 'Protocol-relative // redirect is rejected with 400');

  // 3. Backslash protocol-relative URL blocked
  const resBackslash = await getEmailClick(
    createMockRequest('http://localhost:3000/api/pulse/v1/email/click?wid=ws-default&target=/\\attacker.com/evil')
  );
  assert.equal(resBackslash.status, 400, 'Backslash protocol-relative redirect is rejected with 400');

  // 4. Javascript URI scheme blocked
  const resJs = await getEmailClick(
    createMockRequest('http://localhost:3000/api/pulse/v1/email/click?wid=ws-default&target=javascript:alert(1)')
  );
  assert.equal(resJs.status, 400, 'javascript: URI is rejected with 400');

  // 5. Allowed relative path redirects safely
  const resRelative = await getEmailClick(
    createMockRequest('http://localhost:3000/api/pulse/v1/email/click?wid=ws-default&target=/overview?utm_source=email')
  );
  assert.equal(resRelative.status, 307, 'Safe relative URL redirects with 307');
  const relLocation = resRelative.headers.get('location');
  assert.ok(relLocation && relLocation.includes('/overview?utm_source=email'));

  // 6. Registered website domain redirects safely
  const resWhitelisted = await getEmailClick(
    createMockRequest('http://localhost:3000/api/pulse/v1/email/click?wid=ws-default&target=https://shop.developsterhub.com/special-offer')
  );
  assert.equal(resWhitelisted.status, 307, 'Whitelisted website domain redirects with 307');
  assert.equal(resWhitelisted.headers.get('location'), 'https://shop.developsterhub.com/special-offer');

  // 7. Signed tamper-resistant token verification
  const expFuture = Date.now() + 60 * 60 * 1000;
  const token = createEmailTrackingSignature({
    target: '/pricing',
    wid: 'ws-default',
    mid: 'msg-promo-1',
    exp: expFuture,
  });

  const resValidToken = await getEmailClick(
    createMockRequest(
      `http://localhost:3000/api/pulse/v1/email/click?wid=ws-default&target=/pricing&mid=msg-promo-1&exp=${expFuture}&token=${token}`
    )
  );
  assert.equal(resValidToken.status, 307, 'Valid signed tracking token is accepted and redirects');

  // 8. Expired token is rejected
  const expPast = Date.now() - 10000;
  const expiredToken = createEmailTrackingSignature({
    target: '/pricing',
    wid: 'ws-default',
    mid: 'msg-promo-1',
    exp: expPast,
  });
  const resExpired = await getEmailClick(
    createMockRequest(
      `http://localhost:3000/api/pulse/v1/email/click?wid=ws-default&target=/pricing&mid=msg-promo-1&exp=${expPast}&token=${expiredToken}`
    )
  );
  assert.equal(resExpired.status, 401, 'Expired tracking token returns 401');

  // 9. Tampered token is rejected
  const resTampered = await getEmailClick(
    createMockRequest(
      `http://localhost:3000/api/pulse/v1/email/click?wid=ws-default&target=/pricing&mid=msg-promo-1&exp=${expFuture}&token=tamperedtoken123`
    )
  );
  assert.equal(resTampered.status, 401, 'Tampered tracking token returns 401');
});

test('Security Phase 1 — Middleware Public Exemptions & Route Guardrails', async () => {
  // Helper to test middleware
  const testMiddleware = async (url: string, cookie?: string) => {
    const nextReq = new NextRequest(url, {
      headers: cookie ? { cookie: `crm_session=${cookie}` } : undefined,
    });
    return middleware(nextReq);
  };

  // 1. Static asset /pulse.js must be accessible publicly
  const resPulseJs = await testMiddleware('http://localhost:3000/pulse.js');
  assert.equal(resPulseJs.status, 200, '/pulse.js is publicly accessible (status 200)');

  // 2. /api/pulse/v1/track must be accessible publicly
  const resTrack = await testMiddleware('http://localhost:3000/api/pulse/v1/track');
  assert.equal(resTrack.status, 200, '/api/pulse/v1/track is exempt from middleware cookie check');

  // 3. Webhook endpoints must be accessible publicly
  const resShopify = await testMiddleware('http://localhost:3000/api/pulse/v1/integrations/shopify/webhook');
  assert.equal(resShopify.status, 200, 'Shopify webhook is exempt from middleware cookie check');

  const resWc = await testMiddleware('http://localhost:3000/api/pulse/v1/integrations/woocommerce/webhook');
  assert.equal(resWc.status, 200, 'WooCommerce webhook is exempt from middleware cookie check');

  // 4. Email click and open endpoints must be accessible publicly
  const resEmailOpen = await testMiddleware('http://localhost:3000/api/pulse/v1/email/open');
  assert.equal(resEmailOpen.status, 200, '/api/pulse/v1/email/open is exempt from middleware cookie check');

  const resEmailClick = await testMiddleware('http://localhost:3000/api/pulse/v1/email/click');
  assert.equal(resEmailClick.status, 200, '/api/pulse/v1/email/click is exempt from middleware cookie check');

  // 5. Protected endpoints without cookie MUST return 401 from middleware
  const resOverviewNoCookie = await testMiddleware('http://localhost:3000/api/pulse/v1/overview');
  assert.equal(resOverviewNoCookie.status, 401, 'GET /api/pulse/v1/overview without cookie returns 401 from middleware');

  const resLeadsNoCookie = await testMiddleware('http://localhost:3000/api/leads');
  assert.equal(resLeadsNoCookie.status, 401, 'GET /api/leads without cookie returns 401 from middleware');

  const resTasksNoCookie = await testMiddleware('http://localhost:3000/api/tasks');
  assert.equal(resTasksNoCookie.status, 401, 'GET /api/tasks without cookie returns 401 from middleware');

  // 6. Unauthenticated page visit redirects to /login
  const resPageNoCookie = await testMiddleware('http://localhost:3000/?section=Customers');
  assert.equal(resPageNoCookie.status, 307, 'Unauthenticated page visits redirect to /login with 307');
  const redirectUrl = resPageNoCookie.headers.get('location');
  assert.ok(redirectUrl && redirectUrl.includes('/login'));
});

test('Security Phase 1.1 — Shopify & WooCommerce Webhook Idempotency & Replay Protection', async () => {
  const shopifySecret = 'sec_shopify_idempotency_test';
  await pulseRepo.saveIntegration('ws-default', {
    platform: 'shopify',
    status: 'connected',
    webhookSecret: shopifySecret,
    shopDomain: 'idempotent-shop.myshopify.com',
    storeUrl: 'https://idempotent-shop.myshopify.com',
    enabledEvents: ['orders/create'],
    autoCreateDeals: false,
    autoCreateCustomers: false,
  });

  const payload = JSON.stringify({ id: 1001, total_price: '1999.00', currency: 'INR' });
  const hmac = crypto.createHmac('sha256', shopifySecret).update(payload, 'utf8').digest('base64');
  const deliveryId = `wh-delivery-${Date.now()}-abc`;

  // First delivery: should process successfully
  const req1 = createMockRequest('http://localhost:3000/api/pulse/v1/integrations/shopify/webhook', {
    method: 'POST',
    body: payload,
    headers: {
      'x-shopify-topic': 'orders/create',
      'x-shopify-shop-domain': 'idempotent-shop.myshopify.com',
      'x-shopify-webhook-id': deliveryId,
      'x-shopify-hmac-sha256': hmac,
    },
  });
  const res1 = await postShopifyWebhook(req1);
  assert.equal(res1.status, 200);
  const data1 = await res1.json();
  assert.equal(data1.received, true);
  assert.equal(data1.duplicate, undefined);

  // Replay (duplicate delivery): should safely return already_processed without re-processing
  const req2 = createMockRequest('http://localhost:3000/api/pulse/v1/integrations/shopify/webhook', {
    method: 'POST',
    body: payload,
    headers: {
      'x-shopify-topic': 'orders/create',
      'x-shopify-shop-domain': 'idempotent-shop.myshopify.com',
      'x-shopify-webhook-id': deliveryId,
      'x-shopify-hmac-sha256': hmac,
    },
  });
  const res2 = await postShopifyWebhook(req2);
  assert.equal(res2.status, 200);
  const data2 = await res2.json();
  assert.equal(data2.received, true);
  assert.equal(data2.duplicate, true);
  assert.equal(data2.status, 'already_processed');

  // Same for WooCommerce
  const wcSecret = 'sec_wc_idempotency_test';
  await pulseRepo.saveIntegration('ws-default', {
    platform: 'woocommerce',
    status: 'connected',
    webhookSecret: wcSecret,
    storeUrl: 'https://shop.developster.io',
    enabledEvents: ['order.created'],
    autoCreateDeals: false,
    autoCreateCustomers: false,
  });

  const wcPayload = JSON.stringify({ id: 2002, total: '2999.00', currency: 'INR' });
  const wcSig = crypto.createHmac('sha256', wcSecret).update(wcPayload, 'utf8').digest('base64');
  const wcDeliveryId = `wc-delivery-${Date.now()}-xyz`;

  // First WooCommerce delivery
  const wcReq1 = createMockRequest('http://localhost:3000/api/pulse/v1/integrations/woocommerce/webhook?workspaceId=ws-default', {
    method: 'POST',
    body: wcPayload,
    headers: {
      'x-wc-webhook-topic': 'order.created',
      'x-wc-webhook-delivery-id': wcDeliveryId,
      'x-wc-webhook-signature': wcSig,
    },
  });
  const wcRes1 = await postWooCommerceWebhook(wcReq1);
  assert.equal(wcRes1.status, 200);
  const wcData1 = await wcRes1.json();
  assert.equal(wcData1.received, true);
  assert.equal(wcData1.duplicate, undefined);

  // Duplicate WooCommerce delivery
  const wcReq2 = createMockRequest('http://localhost:3000/api/pulse/v1/integrations/woocommerce/webhook?workspaceId=ws-default', {
    method: 'POST',
    body: wcPayload,
    headers: {
      'x-wc-webhook-topic': 'order.created',
      'x-wc-webhook-delivery-id': wcDeliveryId,
      'x-wc-webhook-signature': wcSig,
    },
  });
  const wcRes2 = await postWooCommerceWebhook(wcReq2);
  assert.equal(wcRes2.status, 200);
  const wcData2 = await wcRes2.json();
  assert.equal(wcData2.received, true);
  assert.equal(wcData2.duplicate, true);
  assert.equal(wcData2.status, 'already_processed');
});

test('Security Phase 1.1 — Concurrent Duplicate Webhook Delivery Safety', async () => {
  const secret = 'sec_concurrent_test';
  await pulseRepo.saveIntegration('ws-default', {
    platform: 'shopify',
    status: 'connected',
    webhookSecret: secret,
    shopDomain: 'concurrent-shop.myshopify.com',
    storeUrl: 'https://concurrent-shop.myshopify.com',
    enabledEvents: ['orders/create'],
    autoCreateDeals: false,
    autoCreateCustomers: false,
  });

  const payload = JSON.stringify({ id: 3003, total_price: '450.00', currency: 'INR' });
  const hmac = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('base64');
  const deliveryId = `wh-concurrent-${Date.now()}`;

  const createReq = () =>
    createMockRequest('http://localhost:3000/api/pulse/v1/integrations/shopify/webhook', {
      method: 'POST',
      body: payload,
      headers: {
        'x-shopify-topic': 'orders/create',
        'x-shopify-shop-domain': 'concurrent-shop.myshopify.com',
        'x-shopify-webhook-id': deliveryId,
        'x-shopify-hmac-sha256': hmac,
      },
    });

  // Fire both requests simultaneously
  const [resA, resB] = await Promise.all([
    postShopifyWebhook(createReq()),
    postShopifyWebhook(createReq()),
  ]);

  assert.equal(resA.status, 200);
  assert.equal(resB.status, 200);

  const dataA = await resA.json();
  const dataB = await resB.json();

  const duplicates = [dataA, dataB].filter((d) => d.duplicate === true);
  const processed = [dataA, dataB].filter((d) => d.duplicate === undefined && d.received === true);

  assert.equal(processed.length, 1, 'Exactly one concurrent delivery was processed');
  assert.equal(duplicates.length, 1, 'Exactly one concurrent delivery was safely flagged as duplicate');
});

test('Security Phase 1.1 — Cross-Tenant Webhook ID Isolation (Same Webhook ID across Tenants)', async () => {
  const tenantASecret = 'sec_tenant_alpha_webhook';
  const tenantBSecret = 'sec_tenant_beta_webhook';
  const sharedWebhookId = `wh-shared-uuid-${Date.now()}`;

  await pulseRepo.saveIntegration('ws-tenant-alpha', {
    platform: 'shopify',
    status: 'connected',
    webhookSecret: tenantASecret,
    shopDomain: 'tenant-alpha.myshopify.com',
    storeUrl: 'https://tenant-alpha.myshopify.com',
    enabledEvents: ['orders/create'],
    autoCreateDeals: false,
    autoCreateCustomers: false,
  });

  await pulseRepo.saveIntegration('ws-tenant-beta', {
    platform: 'shopify',
    status: 'connected',
    webhookSecret: tenantBSecret,
    shopDomain: 'tenant-beta.myshopify.com',
    storeUrl: 'https://tenant-beta.myshopify.com',
    enabledEvents: ['orders/create'],
    autoCreateDeals: false,
    autoCreateCustomers: false,
  });

  const payload = JSON.stringify({ id: 4004, total_price: '799.00', currency: 'INR' });
  const hmacA = crypto.createHmac('sha256', tenantASecret).update(payload, 'utf8').digest('base64');
  const hmacB = crypto.createHmac('sha256', tenantBSecret).update(payload, 'utf8').digest('base64');

  // Tenant A delivery with sharedWebhookId
  const reqA = createMockRequest('http://localhost:3000/api/pulse/v1/integrations/shopify/webhook', {
    method: 'POST',
    body: payload,
    headers: {
      'x-shopify-topic': 'orders/create',
      'x-shopify-shop-domain': 'tenant-alpha.myshopify.com',
      'x-shopify-webhook-id': sharedWebhookId,
      'x-shopify-hmac-sha256': hmacA,
    },
  });
  const resA = await postShopifyWebhook(reqA);
  assert.equal(resA.status, 200);
  const dataA = await resA.json();
  assert.equal(dataA.received, true);
  assert.equal(dataA.duplicate, undefined);

  // Tenant B delivery with the EXACT SAME sharedWebhookId: MUST NOT collide or be blocked as duplicate
  const reqB = createMockRequest('http://localhost:3000/api/pulse/v1/integrations/shopify/webhook', {
    method: 'POST',
    body: payload,
    headers: {
      'x-shopify-topic': 'orders/create',
      'x-shopify-shop-domain': 'tenant-beta.myshopify.com',
      'x-shopify-webhook-id': sharedWebhookId,
      'x-shopify-hmac-sha256': hmacB,
    },
  });
  const resB = await postShopifyWebhook(reqB);
  assert.equal(resB.status, 200, 'Tenant B delivery with same webhook ID succeeds due to tenant scoping');
  const dataB = await resB.json();
  assert.equal(dataB.received, true);
  assert.equal(dataB.duplicate, undefined, 'Tenant B is not marked duplicate by Tenant A delivery');

  // Re-delivery to Tenant A with same ID: now duplicate within Tenant A
  const reqADup = createMockRequest('http://localhost:3000/api/pulse/v1/integrations/shopify/webhook', {
    method: 'POST',
    body: payload,
    headers: {
      'x-shopify-topic': 'orders/create',
      'x-shopify-shop-domain': 'tenant-alpha.myshopify.com',
      'x-shopify-webhook-id': sharedWebhookId,
      'x-shopify-hmac-sha256': hmacA,
    },
  });
  const resADup = await postShopifyWebhook(reqADup);
  assert.equal(resADup.status, 200);
  const dataADup = await resADup.json();
  assert.equal(dataADup.duplicate, true, 'Tenant A detects duplicate within its own scope');
});

test('Security Phase 1.1 — Shopify Shop-Domain Validation & Tenant Binding', async () => {
  const secretA = 'sec_domain_validation_alpha';
  const secretB = 'sec_domain_validation_beta';

  await pulseRepo.saveIntegration('ws-tenant-alpha', {
    platform: 'shopify',
    status: 'connected',
    webhookSecret: secretA,
    shopDomain: 'real-store.myshopify.com',
    storeUrl: 'https://real-store.myshopify.com',
    enabledEvents: ['orders/create'],
    autoCreateDeals: false,
    autoCreateCustomers: false,
  });

  await pulseRepo.saveIntegration('ws-tenant-beta', {
    platform: 'shopify',
    status: 'connected',
    webhookSecret: secretB,
    shopDomain: 'other-store.myshopify.com',
    storeUrl: 'https://other-store.myshopify.com',
    enabledEvents: ['orders/create'],
    autoCreateDeals: false,
    autoCreateCustomers: false,
  });

  const payload = JSON.stringify({ id: 5005, total_price: '100.00', currency: 'INR' });
  const validHmacForA = crypto.createHmac('sha256', secretA).update(payload, 'utf8').digest('base64');

  // 1. Valid signature with unregistered shop domain -> 401
  const reqUnregistered = createMockRequest('http://localhost:3000/api/pulse/v1/integrations/shopify/webhook', {
    method: 'POST',
    body: payload,
    headers: {
      'x-shopify-topic': 'orders/create',
      'x-shopify-shop-domain': 'unregistered-domain.myshopify.com',
      'x-shopify-webhook-id': 'wh-dom-1',
      'x-shopify-hmac-sha256': validHmacForA,
    },
  });
  const resUnregistered = await postShopifyWebhook(reqUnregistered);
  assert.equal(resUnregistered.status, 401, 'Unregistered shop domain rejected with 401');

  // 2. Valid signature for Store A, but sent with registered Store B domain -> 401 (signature doesn't match Store B secret)
  const reqWrongDomain = createMockRequest('http://localhost:3000/api/pulse/v1/integrations/shopify/webhook', {
    method: 'POST',
    body: payload,
    headers: {
      'x-shopify-topic': 'orders/create',
      'x-shopify-shop-domain': 'other-store.myshopify.com',
      'x-shopify-webhook-id': 'wh-dom-2',
      'x-shopify-hmac-sha256': validHmacForA,
    },
  });
  const resWrongDomain = await postShopifyWebhook(reqWrongDomain);
  assert.equal(resWrongDomain.status, 401, 'Signature for Tenant A fails against Tenant B domain');

  // 3. Query parameter spoofing: Store A domain provided, but query param has workspaceId=ws-tenant-beta -> 401
  const reqQueryMismatch = createMockRequest(
    'http://localhost:3000/api/pulse/v1/integrations/shopify/webhook?workspaceId=ws-tenant-beta',
    {
      method: 'POST',
      body: payload,
      headers: {
        'x-shopify-topic': 'orders/create',
        'x-shopify-shop-domain': 'real-store.myshopify.com',
        'x-shopify-webhook-id': 'wh-dom-3',
        'x-shopify-hmac-sha256': validHmacForA,
      },
    }
  );
  const resQueryMismatch = await postShopifyWebhook(reqQueryMismatch);
  assert.equal(resQueryMismatch.status, 401, 'Cross-tenant query parameter mismatch rejected with 401');
});

test('Security Phase 1.1 — Webhook Header Validation (Missing/Malformed Domain & Webhook ID)', async () => {
  const secret = 'sec_header_val_test';
  await pulseRepo.saveIntegration('ws-default', {
    platform: 'shopify',
    status: 'connected',
    webhookSecret: secret,
    shopDomain: 'valid-header-shop.myshopify.com',
    storeUrl: 'https://valid-header-shop.myshopify.com',
    enabledEvents: ['orders/create'],
    autoCreateDeals: false,
    autoCreateCustomers: false,
  });

  const payload = JSON.stringify({ id: 6006 });
  const hmac = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('base64');

  // 1. Missing shop domain header -> 400
  const reqNoDomain = createMockRequest('http://localhost:3000/api/pulse/v1/integrations/shopify/webhook', {
    method: 'POST',
    body: payload,
    headers: {
      'x-shopify-topic': 'orders/create',
      'x-shopify-webhook-id': 'wh-hdr-1',
      'x-shopify-hmac-sha256': hmac,
    },
  });
  const resNoDomain = await postShopifyWebhook(reqNoDomain);
  assert.equal(resNoDomain.status, 400, 'Missing x-shopify-shop-domain returns 400');

  // 2. Empty/whitespace shop domain header -> 400
  const reqEmptyDomain = createMockRequest('http://localhost:3000/api/pulse/v1/integrations/shopify/webhook', {
    method: 'POST',
    body: payload,
    headers: {
      'x-shopify-topic': 'orders/create',
      'x-shopify-shop-domain': '   ',
      'x-shopify-webhook-id': 'wh-hdr-2',
      'x-shopify-hmac-sha256': hmac,
    },
  });
  const resEmptyDomain = await postShopifyWebhook(reqEmptyDomain);
  assert.equal(resEmptyDomain.status, 400, 'Whitespace x-shopify-shop-domain returns 400');

  // 3. Malformed shop domain (invalid characters) -> 400
  const reqMalformedDomain = createMockRequest('http://localhost:3000/api/pulse/v1/integrations/shopify/webhook', {
    method: 'POST',
    body: payload,
    headers: {
      'x-shopify-topic': 'orders/create',
      'x-shopify-shop-domain': 'malformed$domain@!.com',
      'x-shopify-webhook-id': 'wh-hdr-3',
      'x-shopify-hmac-sha256': hmac,
    },
  });
  const resMalformedDomain = await postShopifyWebhook(reqMalformedDomain);
  assert.equal(resMalformedDomain.status, 400, 'Malformed x-shopify-shop-domain returns 400');

  // 4. Missing webhook ID header in Shopify -> 400
  const reqNoWebhookId = createMockRequest('http://localhost:3000/api/pulse/v1/integrations/shopify/webhook', {
    method: 'POST',
    body: payload,
    headers: {
      'x-shopify-topic': 'orders/create',
      'x-shopify-shop-domain': 'valid-header-shop.myshopify.com',
      'x-shopify-hmac-sha256': hmac,
    },
  });
  const resNoWebhookId = await postShopifyWebhook(reqNoWebhookId);
  assert.equal(resNoWebhookId.status, 400, 'Missing x-shopify-webhook-id returns 400');

  // 5. Empty webhook ID in Shopify -> 400
  const reqEmptyWebhookId = createMockRequest('http://localhost:3000/api/pulse/v1/integrations/shopify/webhook', {
    method: 'POST',
    body: payload,
    headers: {
      'x-shopify-topic': 'orders/create',
      'x-shopify-shop-domain': 'valid-header-shop.myshopify.com',
      'x-shopify-webhook-id': '   ',
      'x-shopify-hmac-sha256': hmac,
    },
  });
  const resEmptyWebhookId = await postShopifyWebhook(reqEmptyWebhookId);
  assert.equal(resEmptyWebhookId.status, 400, 'Empty x-shopify-webhook-id returns 400');

  // 6. Missing delivery ID in WooCommerce -> 400
  const wcSecret = 'sec_wc_hdr_test';
  await pulseRepo.saveIntegration('ws-default', {
    platform: 'woocommerce',
    status: 'connected',
    webhookSecret: wcSecret,
    storeUrl: 'https://shop.developster.io',
    enabledEvents: ['order.created'],
    autoCreateDeals: false,
    autoCreateCustomers: false,
  });
  const wcSig = crypto.createHmac('sha256', wcSecret).update(payload, 'utf8').digest('base64');

  const reqWcNoDeliveryId = createMockRequest('http://localhost:3000/api/pulse/v1/integrations/woocommerce/webhook?workspaceId=ws-default', {
    method: 'POST',
    body: payload,
    headers: {
      'x-wc-webhook-topic': 'order.created',
      'x-wc-webhook-signature': wcSig,
    },
  });
  const resWcNoDeliveryId = await postWooCommerceWebhook(reqWcNoDeliveryId);
  assert.equal(resWcNoDeliveryId.status, 400, 'Missing x-wc-webhook-delivery-id returns 400');

  // 7. Empty delivery ID in WooCommerce -> 400
  const reqWcEmptyDeliveryId = createMockRequest('http://localhost:3000/api/pulse/v1/integrations/woocommerce/webhook?workspaceId=ws-default', {
    method: 'POST',
    body: payload,
    headers: {
      'x-wc-webhook-topic': 'order.created',
      'x-wc-webhook-delivery-id': '   ',
      'x-wc-webhook-signature': wcSig,
    },
  });
  const resWcEmptyDeliveryId = await postWooCommerceWebhook(reqWcEmptyDeliveryId);
  assert.equal(resWcEmptyDeliveryId.status, 400, 'Empty x-wc-webhook-delivery-id returns 400');
});

