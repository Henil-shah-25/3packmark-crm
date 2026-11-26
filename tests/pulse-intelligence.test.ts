import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { NextRequest } from 'next/server';
import { pulseRepo } from '../src/lib/pulse/repository';
import { runCronTick } from '../src/lib/cron/scheduler';
import { normalizeSdkPayload, normalizeShopifyWebhook, normalizeWooCommerceWebhook } from '../src/lib/pulse/normalizer';
import { anonymizeIp, isBotUserAgent, isTrackingPermitted } from '../src/lib/pulse/privacy';
import { processIngestedEvent } from '../src/lib/pulse/tracker';
import { PulseEvent } from '../src/types/pulse';

describe('Developster Pulse — Website Visitor Intelligence & Behavioural Tracking', () => {
  const testWorkspaceId = 'ws-pulse-test-' + Date.now();
  let testSiteId = 'psite_test_' + Math.random().toString(36).substring(2, 8);

  test('Privacy Engine — Zero-Fingerprinting & IP Anonymization', () => {
    // IPv4 truncation: last octet zeroed
    assert.strictEqual(anonymizeIp('103.21.244.150'), '103.21.244.0');
    assert.strictEqual(anonymizeIp('192.168.1.42'), '192.168.1.0');

    // IPv6 truncation
    assert.strictEqual(anonymizeIp('2405:201:6800:1234::1'), '2405:201:6800::0');

    // Handles null / empty
    assert.strictEqual(anonymizeIp(null), '0.0.0.0');

    // Bot detection
    assert.strictEqual(isBotUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'), true);
    assert.strictEqual(isBotUserAgent('facebookexternalhit/1.1'), true);
    assert.strictEqual(isBotUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'), false);
  });

  test('Payload Normalization — SDK, Shopify & WooCommerce Payload Contracts', () => {
    // 1. Browser SDK
    const rawSdk = {
      visitorId: 'vis_client_123',
      sessionId: 'ses_client_456',
      type: 'product_viewed',
      name: 'Viewed Leather Bag',
      url: 'https://shop.example.com/products/bag',
      properties: { price: 2999 },
    };
    const normSdk = normalizeSdkPayload(rawSdk, testWorkspaceId, testSiteId);
    assert.strictEqual(normSdk.visitorId, 'vis_client_123');
    assert.strictEqual(normSdk.type, 'product_viewed');
    assert.strictEqual(normSdk.source, 'sdk');
    assert.ok(normSdk.idempotencyKey);

    // 2. Shopify Webhook (Order Created)
    const rawShopify = {
      id: 994827103,
      order_number: 1042,
      total_price: '4999.00',
      currency: 'INR',
      customer: {
        id: 8812,
        email: 'rahul.verma@example.com',
        first_name: 'Rahul',
        last_name: 'Verma',
      },
      line_items: [
        { product_id: 101, title: 'Cotton Oxford Shirt', price: '4999.00', quantity: 1 },
      ],
    };
    const normShopify = normalizeShopifyWebhook('orders/create', rawShopify, testWorkspaceId, testSiteId);
    assert.strictEqual(normShopify.type, 'purchase_completed');
    assert.strictEqual(normShopify.source, 'shopify');
    assert.strictEqual(normShopify.ecommerce?.orderId, '1042');
    assert.strictEqual(normShopify.ecommerce?.total, 4999);
    assert.strictEqual(normShopify.identities?.email, 'rahul.verma@example.com');

    // 3. WooCommerce Webhook (Completed Order)
    const rawWc = {
      id: 5541,
      status: 'completed',
      total: '2499.00',
      currency: 'INR',
      billing: {
        email: 'ananya.iyer@example.com',
        first_name: 'Ananya',
        last_name: 'Iyer',
      },
      line_items: [
        { product_id: 202, name: 'Silk Stole', price: 2499, quantity: 1 },
      ],
    };
    const normWc = normalizeWooCommerceWebhook('order.created', rawWc, testWorkspaceId, testSiteId);
    assert.strictEqual(normWc.type, 'purchase_completed');
    assert.strictEqual(normWc.source, 'woocommerce');
    assert.strictEqual(normWc.ecommerce?.total, 2499);
    assert.strictEqual(normWc.identities?.email, 'ananya.iyer@example.com');
  });

  test('Pulse Repository — Websites, Events Ingestion, and Metrics Calculation', async () => {
    // 1. Create registered site
    const site = await pulseRepo.createWebsite({
      workspaceId: testWorkspaceId,
      name: 'Test Store',
      domain: 'teststore.in',
      whitelistedDomains: ['teststore.in', 'localhost'],
      status: 'active',
      snippetInstalled: true,
      ecommercePlatform: 'shopify',
    });
    assert.ok(site.id);
    assert.ok(site.siteId.startsWith('psite_'));
    testSiteId = site.siteId;

    // 2. Record Event (Page View)
    await pulseRepo.recordEvent({
      id: 'evt-test-1',
      workspaceId: testWorkspaceId,
      siteId: testSiteId,
      visitorId: 'vis-test-user-1',
      sessionId: 'ses-test-1',
      type: 'page_view',
      name: 'Homepage Visit',
      source: 'sdk',
      url: 'https://teststore.in/',
      path: '/',
      properties: {},
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    // 3. Record Event (Add to Cart)
    await pulseRepo.recordEvent({
      id: 'evt-test-2',
      workspaceId: testWorkspaceId,
      siteId: testSiteId,
      visitorId: 'vis-test-user-1',
      sessionId: 'ses-test-1',
      type: 'item_added_to_cart',
      name: 'Added to Cart: Oxford Shirt',
      source: 'sdk',
      ecommerce: {
        total: 1999,
        items: [{ id: 'prod-1', name: 'Oxford Shirt', price: 1999, quantity: 1 }],
      },
      properties: {},
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    // 4. Record Event (Checkout Started)
    await pulseRepo.recordEvent({
      id: 'evt-test-3',
      workspaceId: testWorkspaceId,
      siteId: testSiteId,
      visitorId: 'vis-test-user-1',
      sessionId: 'ses-test-1',
      type: 'checkout_started',
      name: 'Checkout Started',
      source: 'sdk',
      ecommerce: {
        total: 1999,
        items: [{ id: 'prod-1', name: 'Oxford Shirt', price: 1999, quantity: 1 }],
      },
      properties: {},
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    // 5. Record Server-Side Purchase Completed
    await pulseRepo.recordEvent({
      id: 'evt-test-4',
      workspaceId: testWorkspaceId,
      siteId: testSiteId,
      visitorId: 'vis-test-user-1',
      sessionId: 'ses-test-1',
      customerId: 'cust-test-1',
      type: 'purchase_completed',
      name: 'Shopify Order #1042 Completed',
      source: 'shopify',
      ecommerce: {
        orderId: '1042',
        total: 1999,
        items: [{ id: 'prod-1', name: 'Oxford Shirt', price: 1999, quantity: 1 }],
      },
      identities: {
        email: 'rahul.verma@example.com',
      },
      properties: {},
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    // 6. Identity Resolution
    const session = await pulseRepo.linkVisitorToCustomer(testWorkspaceId, 'vis-test-user-1', {
      email: 'rahul.verma@example.com',
      name: 'Rahul Verma',
    });
    assert.strictEqual(session?.isIdentified, true);
    assert.strictEqual(session?.ordersCount, 1);
    assert.strictEqual(session?.totalSpent, 1999);

    // 7. Overview Metrics Aggregation
    const metrics = await pulseRepo.getPulseOverviewMetrics(testWorkspaceId);
    assert.strictEqual(metrics.totalSessions, 1);
    assert.strictEqual(metrics.uniqueVisitors, 1);
    assert.strictEqual(metrics.pageViews, 1);
    assert.strictEqual(metrics.addToCarts, 1);
    assert.strictEqual(metrics.checkoutStarts, 1);
    assert.strictEqual(metrics.completedPurchases, 1);
    assert.strictEqual(metrics.totalRevenue, 1999);
    assert.strictEqual(metrics.conversionRate, '100.0');
    assert.strictEqual(metrics.topProducts.length, 1);
    assert.strictEqual(metrics.topProducts[0].name, 'Oxford Shirt');
  });

  test('Tracker Pipeline — End-to-End Ingestion, Origin & Consent Validation', async () => {
    // Accepted SDK Event
    const res = await processIngestedEvent(
      {
        siteId: testSiteId,
        visitorId: 'vis-test-pipeline-1',
        type: 'page_view',
        name: 'Product Catalog',
        url: 'https://teststore.in/shop',
      },
      {
        siteId: testSiteId,
        origin: 'https://teststore.in',
        clientIp: '49.36.128.55',
        userAgent: 'Mozilla/5.0 Chrome/120.0',
      }
    );

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.status, 'accepted');
    assert.ok(res.eventId);

    // Bot filtering
    const botRes = await processIngestedEvent(
      {
        siteId: testSiteId,
        visitorId: 'vis-bot-1',
        type: 'page_view',
      },
      {
        siteId: testSiteId,
        origin: 'https://teststore.in',
        userAgent: 'Googlebot/2.1 (+http://www.google.com/bot.html)',
      }
    );
    assert.strictEqual(botRes.success, false);
    assert.strictEqual(botRes.status, 'ignored_bot');
  });

  test('Time-Period Filtering, Comparative Deltas & Actionable Business Intelligence', async () => {
    // Test getPulseOverviewMetrics with specific periods ('today', '7d', '30d', 'all')
    const metricsAll = await pulseRepo.getPulseOverviewMetrics(testWorkspaceId, { period: 'all' });
    assert.ok(metricsAll);
    assert.strictEqual(metricsAll.totalSessions, 2);
    assert.strictEqual(metricsAll.completedPurchases, 1);
    assert.strictEqual(metricsAll.totalRevenue, 1999);
    // Period 'all' has no preceding time window, so deltas are null
    assert.strictEqual(metricsAll.deltas, null);
    assert.ok(Array.isArray(metricsAll.actionableInsights));
    const identityInsight = metricsAll.actionableInsights.find((i) => i.id === 'identity-resolution-rate');
    assert.ok(identityInsight);
    assert.ok(identityInsight.description.includes('50%'));

    const metrics30d = await pulseRepo.getPulseOverviewMetrics(testWorkspaceId, { period: '30d' });
    assert.ok(metrics30d);
    assert.strictEqual(metrics30d.totalSessions, 2);
    assert.strictEqual(metrics30d.completedPurchases, 1);
    assert.strictEqual(metrics30d.totalRevenue, 1999);
    assert.ok(metrics30d.deltas);
    // Since events are today, current period has 2 sessions, previous 30-day period had 0 -> delta should be +100.0%
    assert.strictEqual(metrics30d.deltas.sessions.percent, 100);
    assert.strictEqual(metrics30d.deltas.purchases.percent, 100);
    assert.strictEqual(metrics30d.deltas.revenue.percent, 100);

    const metricsToday = await pulseRepo.getPulseOverviewMetrics(testWorkspaceId, { period: 'today' });
    assert.ok(metricsToday);
    assert.strictEqual(metricsToday.totalSessions, 2);
    assert.strictEqual(metricsToday.completedPurchases, 1);
    assert.ok(metricsToday.deltas);
  });

  test('PULSE-12 — Dynamic Multi-Step Funnel Progression, Drop-Offs & Boundary Isolation', async () => {
    const funnelWs = 'ws-funnel-test-' + Date.now();
    const siteA = 'psite_funnel_a_' + Math.random().toString(36).substring(2, 6);
    const siteB = 'psite_funnel_b_' + Math.random().toString(36).substring(2, 6);

    // 1. Create Funnel Definition (4 steps: Product Viewed -> Add to Cart -> Checkout Started -> Purchase Completed)
    const funnel = await pulseRepo.saveFunnel(funnelWs, {
      name: 'E-commerce Checkout Journey',
      description: 'End-to-end purchasing path',
      timeWindowHours: 24,
      steps: [
        { id: 'step-1', name: 'Product Discovery', eventType: 'product_viewed', pageUrlPattern: '/products/*' },
        { id: 'step-2', name: 'Item in Cart', eventType: 'item_added_to_cart' },
        { id: 'step-3', name: 'Initiated Checkout', eventType: 'checkout_started' },
        { id: 'step-4', name: 'Order Completed', eventType: 'purchase_completed' },
      ],
    });
    assert.ok(funnel.id);
    assert.strictEqual(funnel.steps.length, 4);

    const now = Date.now();
    const isoAt = (offsetMinutes: number) => new Date(now + offsetMinutes * 60000).toISOString();

    // 2. Visitor 1: Full Normal Progression (Steps 1 -> 2 -> 3 -> 4)
    // Also include repeated events within Step 1 and Step 2 to verify zero double-counting
    const v1Events = [
      { id: 'e1-1', type: 'product_viewed' as const, path: '/products/leather-jacket', visitorId: 'vis-1', timestamp: isoAt(-120) },
      { id: 'e1-2', type: 'product_viewed' as const, path: '/products/leather-jacket-black', visitorId: 'vis-1', timestamp: isoAt(-115) }, // repeat step 1
      { id: 'e1-3', type: 'item_added_to_cart' as const, path: '/cart', visitorId: 'vis-1', timestamp: isoAt(-100) },
      { id: 'e1-4', type: 'item_added_to_cart' as const, path: '/cart', visitorId: 'vis-1', timestamp: isoAt(-95) }, // repeat step 2
      { id: 'e1-5', type: 'checkout_started' as const, path: '/checkout', visitorId: 'vis-1', timestamp: isoAt(-80) },
      { id: 'e1-6', type: 'purchase_completed' as const, path: '/thank-you', visitorId: 'vis-1', timestamp: isoAt(-60) },
    ];

    // 3. Visitor 2: Drops off at Step 2 (completes Step 1 only)
    const v2Events = [
      { id: 'e2-1', type: 'product_viewed' as const, path: '/products/sneakers', visitorId: 'vis-2', timestamp: isoAt(-110) },
    ];

    // 4. Visitor 3: Drops off at Step 3 (completes Step 1 and Step 2)
    const v3Events = [
      { id: 'e3-1', type: 'product_viewed' as const, path: '/products/boots', visitorId: 'vis-3', timestamp: isoAt(-105) },
      { id: 'e3-2', type: 'item_added_to_cart' as const, path: '/cart', visitorId: 'vis-3', timestamp: isoAt(-90) },
    ];

    // 5. Visitor 4: Drops off at Step 4 (completes Step 1, Step 2, and Step 3)
    const v4Events = [
      { id: 'e4-1', type: 'product_viewed' as const, path: '/products/sunglasses', visitorId: 'vis-4', timestamp: isoAt(-100) },
      { id: 'e4-2', type: 'item_added_to_cart' as const, path: '/cart', visitorId: 'vis-4', timestamp: isoAt(-85) },
      { id: 'e4-3', type: 'checkout_started' as const, path: '/checkout', visitorId: 'vis-4', timestamp: isoAt(-70) },
    ];

    // 6. Visitor 5: Out-of-order timestamps in physical storage (Step 2 event recorded before Step 1, but timestamps are correct)
    // And Visitor 6: Invalid event sequence (did Checkout BEFORE Product view -> should NOT count Step 3)
    const v5Events = [
      { id: 'e5-2', type: 'item_added_to_cart' as const, path: '/cart', visitorId: 'vis-5', timestamp: isoAt(-75) },
      { id: 'e5-1', type: 'product_viewed' as const, path: '/products/watch', visitorId: 'vis-5', timestamp: isoAt(-95) },
    ];

    const v6Events = [
      // Checkout happened BEFORE product view (chronologically reversed)
      { id: 'e6-1', type: 'checkout_started' as const, path: '/checkout', visitorId: 'vis-6', timestamp: isoAt(-90) },
      { id: 'e6-2', type: 'product_viewed' as const, path: '/products/wallet', visitorId: 'vis-6', timestamp: isoAt(-70) },
    ];

    // 7. Workspace and Website Isolation Events
    const otherWsEvents = [
      { id: 'e-other-1', type: 'product_viewed' as const, path: '/products/bag', visitorId: 'vis-other', timestamp: isoAt(-50), workspaceId: 'ws-foreign-workspace' },
    ];
    const siteBEvents = [
      { id: 'e-site-b-1', type: 'product_viewed' as const, path: '/products/hat', visitorId: 'vis-site-b', timestamp: isoAt(-45), siteId: siteB },
    ];

    // 8. Invalid Events (missing visitorId, malformed timestamp)
    const invalidEvents = [
      { id: 'e-inv-1', type: 'product_viewed' as const, visitorId: '', timestamp: isoAt(-40) },
      { id: 'e-inv-2', type: 'product_viewed' as const, visitorId: 'vis-inv', timestamp: 'not-a-valid-date' },
    ];

    // Record all events in Pulse store
    for (const raw of [...v1Events, ...v2Events, ...v3Events, ...v4Events, ...v5Events, ...v6Events, ...siteBEvents, ...invalidEvents]) {
      await pulseRepo.recordEvent({
        id: raw.id,
        workspaceId: funnelWs,
        siteId: (raw as any).siteId || siteA,
        visitorId: raw.visitorId,
        sessionId: 'ses-' + raw.visitorId,
        type: raw.type,
        name: raw.type,
        source: 'sdk',
        path: (raw as any).path || '/',
        url: 'https://teststore.in' + ((raw as any).path || '/'),
        properties: {},
        timestamp: raw.timestamp,
        createdAt: raw.timestamp,
      });
    }

    for (const raw of otherWsEvents) {
      await pulseRepo.recordEvent({
        id: raw.id,
        workspaceId: raw.workspaceId,
        siteId: siteA,
        visitorId: raw.visitorId,
        sessionId: 'ses-' + raw.visitorId,
        type: raw.type,
        name: raw.type,
        source: 'sdk',
        path: raw.path,
        url: 'https://teststore.in' + raw.path,
        properties: {},
        timestamp: raw.timestamp,
        createdAt: raw.timestamp,
      });
    }

    // 9. Compute Funnel Analytics for funnelWs
    const result = await pulseRepo.computeFunnelDropoffs(funnel.id, funnelWs, { period: 'today' });
    assert.ok(result);
    assert.strictEqual(result.funnelId, funnel.id);
    assert.strictEqual(result.workspaceId, funnelWs);
    assert.strictEqual(result.steps.length, 4);

    // Verify Unique Visitor Counts:
    // Step 1 entrants: vis-1, vis-2, vis-3, vis-4, vis-5, vis-6 = 6 visitors
    // (vis-site-b also viewed a product on site B, making 7 total in workspace without site filter)
    assert.strictEqual(result.totalEntrants, 7);

    // Filter strictly by siteA
    const siteAResult = await pulseRepo.computeFunnelDropoffs(funnel.id, funnelWs, { period: 'today', siteId: siteA });
    assert.ok(siteAResult);
    // On Site A, entrants are exactly 6: vis-1, vis-2, vis-3, vis-4, vis-5, vis-6
    assert.strictEqual(siteAResult.totalEntrants, 6);

    // Step 2 visitors (Item in Cart):
    // vis-1 (progressed), vis-3 (progressed), vis-4 (progressed), vis-5 (out-of-order storage, but timestamp -75 > -95, progressed) = 4 visitors
    // vis-2 only did step 1.
    // vis-6 did checkout BEFORE product view, never added to cart.
    assert.strictEqual(siteAResult.steps[1].visitors, 4);
    assert.strictEqual(siteAResult.steps[1].conversionRateFromPrevious, 66.7); // 4 / 6 = 66.7%
    assert.strictEqual(siteAResult.steps[1].dropoffCount, 2); // 6 - 4 = 2 dropped
    assert.strictEqual(siteAResult.steps[1].dropoffRateFromPrevious, 33.3); // 2 / 6 = 33.3%

    // Step 3 visitors (Checkout Started):
    // vis-1, vis-4 = 2 visitors
    // (vis-3 dropped off before checkout; vis-5 dropped off before checkout)
    assert.strictEqual(siteAResult.steps[2].visitors, 2);
    assert.strictEqual(siteAResult.steps[2].conversionRateFromPrevious, 50.0); // 2 / 4 = 50.0%
    assert.strictEqual(siteAResult.steps[2].dropoffCount, 2); // 4 - 2 = 2 dropped
    assert.strictEqual(siteAResult.steps[2].dropoffRateFromPrevious, 50.0);

    // Step 4 visitors (Purchase Completed):
    // vis-1 = 1 visitor
    // (vis-4 dropped off before purchase)
    assert.strictEqual(siteAResult.steps[3].visitors, 1);
    assert.strictEqual(siteAResult.steps[3].conversionRateFromPrevious, 50.0); // 1 / 2 = 50.0%
    assert.strictEqual(siteAResult.steps[3].dropoffCount, 1); // 2 - 1 = 1 dropped
    assert.strictEqual(siteAResult.steps[3].dropoffRateFromPrevious, 50.0);

    // Overall Funnel Conversion:
    // 1 completed out of 6 entrants = 16.7%
    assert.strictEqual(siteAResult.totalCompleted, 1);
    assert.strictEqual(siteAResult.overallConversionRate, 16.7);
    assert.strictEqual(siteAResult.overallDropoffCount, 5);
    assert.strictEqual(siteAResult.overallDropoffRate, 83.3);

    // 10. Workspace Isolation Check
    // Foreign workspace should have 0 entrants and not see funnelWs data
    const foreignAnalytics = await pulseRepo.computeFunnelDropoffs(funnel.id, 'ws-foreign-workspace', { period: 'today' });
    assert.strictEqual(foreignAnalytics, null);

    // 11. Empty Funnel Check
    const emptyFunnel = await pulseRepo.saveFunnel(funnelWs, {
      name: 'Empty Funnel',
      steps: [],
    });
    const emptyResult = await pulseRepo.computeFunnelDropoffs(emptyFunnel.id, funnelWs, { period: 'today' });
    assert.ok(emptyResult);
    assert.strictEqual(emptyResult.totalEntrants, 0);
    assert.strictEqual(emptyResult.totalCompleted, 0);
    assert.strictEqual(emptyResult.overallConversionRate, 0);

    // Clean up test funnel
    await pulseRepo.deleteFunnel(funnelWs, emptyFunnel.id);
  });

  test('PULSE-13 — Dynamic Behavioural Segmentation Engine, CRM Tagging & Automation Deduplication', async () => {
    const { crmRepo } = await import('../src/lib/google-sheets/repository');

    const segWs = 'ws-seg-test-' + Date.now();
    const site1 = 'psite_seg_1_' + Math.random().toString(36).substring(2, 6);
    const site2 = 'psite_seg_2_' + Math.random().toString(36).substring(2, 6);

    // 1. Create a CRM customer to test identity linking and tag synchronization
    const cust1 = await crmRepo.createCustomer(segWs, {
      name: 'Arjun Mehta',
      email: 'arjun.mehta@example.com',
      company: 'Mehta Textiles',
      status: 'Active',
      totalRevenue: 0,
      dealsCount: 0,
      lastContactedAt: new Date().toISOString(),
    });
    assert.ok(cust1.id);

    // 2. Link visitor 'vis-shopper-1' to cust1
    await pulseRepo.linkVisitorToCustomer(segWs, 'vis-shopper-1', {
      customerId: cust1.id,
      email: 'arjun.mehta@example.com',
      name: 'Arjun Mehta',
    });

    const now = Date.now();
    const isoAt = (offsetMinutes: number) => new Date(now + offsetMinutes * 60000).toISOString();

    // 3. Record Activity for vis-shopper-1 (Identified as cust1)
    // - 4 Product Views
    // - 1 Add to Cart with total ₹7,500
    // - 1 Checkout Started
    // - NO Purchase Completed yet
    for (let i = 1; i <= 4; i++) {
      await pulseRepo.recordEvent({
        id: `e-v1-pv-${i}`,
        workspaceId: segWs,
        siteId: site1,
        visitorId: 'vis-shopper-1',
        sessionId: 'ses-v1',
        customerId: cust1.id,
        type: 'product_viewed',
        name: `Viewed Product ${i}`,
        source: 'sdk',
        path: `/products/shirt-${i}`,
        url: `https://store.in/products/shirt-${i}`,
        properties: {},
        timestamp: isoAt(-100 + i * 5),
        createdAt: isoAt(-100 + i * 5),
      });
    }

    await pulseRepo.recordEvent({
      id: 'e-v1-cart',
      workspaceId: segWs,
      siteId: site1,
      visitorId: 'vis-shopper-1',
      sessionId: 'ses-v1',
      customerId: cust1.id,
      type: 'item_added_to_cart',
      name: 'Added Luxury Blazer',
      source: 'sdk',
      ecommerce: { total: 7500 },
      properties: {},
      timestamp: isoAt(-50),
      createdAt: isoAt(-50),
    });

    await pulseRepo.recordEvent({
      id: 'e-v1-checkout',
      workspaceId: segWs,
      siteId: site1,
      visitorId: 'vis-shopper-1',
      sessionId: 'ses-v1',
      customerId: cust1.id,
      type: 'checkout_started',
      name: 'Checkout Started',
      source: 'sdk',
      ecommerce: { total: 7500 },
      properties: {},
      timestamp: isoAt(-30),
      createdAt: isoAt(-30),
    });

    // 4. Record Activity for vis-shopper-2 (Anonymous, Purchased low-ticket item)
    await pulseRepo.recordEvent({
      id: 'e-v2-pv',
      workspaceId: segWs,
      siteId: site1,
      visitorId: 'vis-shopper-2',
      sessionId: 'ses-v2',
      type: 'product_viewed',
      name: 'Viewed Socks',
      source: 'sdk',
      properties: {},
      timestamp: isoAt(-40),
      createdAt: isoAt(-40),
    });

    await pulseRepo.recordEvent({
      id: 'e-v2-cart',
      workspaceId: segWs,
      siteId: site1,
      visitorId: 'vis-shopper-2',
      sessionId: 'ses-v2',
      type: 'item_added_to_cart',
      name: 'Added Socks',
      source: 'sdk',
      ecommerce: { total: 1200 },
      properties: {},
      timestamp: isoAt(-35),
      createdAt: isoAt(-35),
    });

    await pulseRepo.recordEvent({
      id: 'e-v2-purchase',
      workspaceId: segWs,
      siteId: site1,
      visitorId: 'vis-shopper-2',
      sessionId: 'ses-v2',
      type: 'purchase_completed',
      name: 'Purchased Socks',
      source: 'sdk',
      ecommerce: { total: 1200 },
      properties: {},
      timestamp: isoAt(-20),
      createdAt: isoAt(-20),
    });

    // 5. Record Activity for vis-shopper-3 (Browsed site2 only)
    for (let i = 1; i <= 3; i++) {
      await pulseRepo.recordEvent({
        id: `e-v3-pv-${i}`,
        workspaceId: segWs,
        siteId: site2,
        visitorId: 'vis-shopper-3',
        sessionId: 'ses-v3',
        type: 'product_viewed',
        name: `Viewed Shoe ${i}`,
        source: 'sdk',
        properties: {},
        timestamp: isoAt(-30 + i * 5),
        createdAt: isoAt(-30 + i * 5),
      });
    }

    // 6. Record Activity in Foreign Workspace (Isolation check)
    await pulseRepo.recordEvent({
      id: 'e-v-foreign',
      workspaceId: 'ws-foreign-seg',
      siteId: site1,
      visitorId: 'vis-foreign',
      sessionId: 'ses-foreign',
      type: 'product_viewed',
      name: 'Foreign View',
      source: 'sdk',
      properties: {},
      timestamp: isoAt(-10),
      createdAt: isoAt(-10),
    });

    // ==========================================
    // TEST 1: Match ALL (AND) Rules Evaluation & CRM Customer Tagging
    // ==========================================
    const segCartAbandoners = await pulseRepo.saveSegment(segWs, {
      name: 'High-Intent Cart Abandoners',
      description: 'Cart value > 5000 without purchase and viewed at least 3 products',
      color: '#E0533C',
      matchType: 'ALL',
      crmTag: 'pulse:vip-cart-abandoner',
      syncCustomerTags: true,
      rules: [
        { field: 'has_cart_without_purchase', operator: 'equals', value: true },
        { field: 'cart_value', operator: 'greater_than', value: 5000 },
        { field: 'product_views_count', operator: 'greater_than_or_equal', value: 3 },
      ],
    });

    const evalRes1 = await pulseRepo.evaluateSegment(segWs, segCartAbandoners.id);
    assert.ok(evalRes1);
    assert.strictEqual(evalRes1.memberCount, 1);
    assert.strictEqual(evalRes1.memberVisitorIds[0], 'vis-shopper-1');
    assert.strictEqual(evalRes1.identifiedCount, 1);
    assert.strictEqual(evalRes1.memberCustomerIds[0], cust1.id);
    assert.strictEqual(evalRes1.membershipChanges?.enteredVisitorIds.length, 1);
    assert.strictEqual(evalRes1.membershipChanges?.enteredCustomerIds[0], cust1.id);

    // Verify CRM Customer has been tagged
    const updatedCust1 = (await crmRepo.getCustomers(segWs)).find((c) => c.id === cust1.id);
    assert.ok(updatedCust1?.tags?.includes('pulse:vip-cart-abandoner'));

    // ==========================================
    // TEST 2: Match ANY (OR) Rules Evaluation
    // ==========================================
    const segAny = await pulseRepo.saveSegment(segWs, {
      name: 'Purchased OR High Cart Value',
      matchType: 'ANY',
      rules: [
        { field: 'has_purchase_completed', operator: 'equals', value: true },
        { field: 'cart_value', operator: 'greater_than', value: 5000 },
      ],
    });

    const evalRes2 = await pulseRepo.evaluateSegment(segWs, segAny.id);
    assert.ok(evalRes2);
    // vis-shopper-1 (cart_value > 5000) and vis-shopper-2 (purchase_completed) both match
    assert.strictEqual(evalRes2.memberCount, 2);
    assert.ok(evalRes2.memberVisitorIds.includes('vis-shopper-1'));
    assert.ok(evalRes2.memberVisitorIds.includes('vis-shopper-2'));

    // ==========================================
    // TEST 3: Recency Condition ('days_since_last_visit')
    // ==========================================
    const segRecency = await pulseRepo.saveSegment(segWs, {
      name: 'Active in Last 2 Days',
      matchType: 'ALL',
      rules: [
        { field: 'days_since_last_visit', operator: 'less_than_or_equal', value: 2 },
      ],
    });

    const evalRes3 = await pulseRepo.evaluateSegment(segWs, segRecency.id);
    assert.ok(evalRes3);
    // All 3 local visitors were active today
    assert.strictEqual(evalRes3.memberCount, 3);

    // ==========================================
    // TEST 4: Segment Exit Detection & Tag Removal
    // ==========================================
    // Now vis-shopper-1 completes their purchase
    await pulseRepo.recordEvent({
      id: 'e-v1-purchase-complete',
      workspaceId: segWs,
      siteId: site1,
      visitorId: 'vis-shopper-1',
      sessionId: 'ses-v1',
      customerId: cust1.id,
      type: 'purchase_completed',
      name: 'Luxury Blazer Completed',
      source: 'sdk',
      ecommerce: { total: 7500 },
      properties: {},
      timestamp: isoAt(-5),
      createdAt: isoAt(-5),
    });

    // Re-evaluate segCartAbandoners: vis-shopper-1 has now purchased!
    const evalRes4 = await pulseRepo.evaluateSegment(segWs, segCartAbandoners.id);
    assert.ok(evalRes4);
    assert.strictEqual(evalRes4.memberCount, 0);
    assert.strictEqual(evalRes4.membershipChanges?.exitedVisitorIds[0], 'vis-shopper-1');
    assert.strictEqual(evalRes4.membershipChanges?.exitedCustomerIds[0], cust1.id);

    // Verify tag 'pulse:vip-cart-abandoner' is removed from cust1
    const custAfterExit = (await crmRepo.getCustomers(segWs)).find((c) => c.id === cust1.id);
    assert.strictEqual(custAfterExit?.tags?.includes('pulse:vip-cart-abandoner'), false);

    // ==========================================
    // TEST 5: Workspace & Website Isolation
    // ==========================================
    // Foreign workspace events never enter segWs segments
    const foreignSegments = await pulseRepo.getSegments('ws-foreign-seg');
    assert.strictEqual(foreignSegments.length, 0);

    // Website-scoped segment: only match site1
    const segSite1Only = await pulseRepo.saveSegment(segWs, {
      name: 'Site 1 Frequent Browsers',
      siteId: site1,
      matchType: 'ALL',
      rules: [
        { field: 'product_views_count', operator: 'greater_than_or_equal', value: 3 },
      ],
    });
    const evalSite1 = await pulseRepo.evaluateSegment(segWs, segSite1Only.id);
    assert.ok(evalSite1);
    // vis-shopper-1 viewed 4 on site1. vis-shopper-3 viewed 3 on site2 -> vis-shopper-3 must be excluded!
    assert.strictEqual(evalSite1.memberCount, 1);
    assert.strictEqual(evalSite1.memberVisitorIds[0], 'vis-shopper-1');

    // ==========================================
    // TEST 6: Duplicate Prevention on Unchanged Re-Evaluation
    // ==========================================
    const evalIdempotent = await pulseRepo.evaluateSegment(segWs, segSite1Only.id);
    assert.ok(evalIdempotent);
    assert.strictEqual(evalIdempotent.membershipChanges?.enteredVisitorIds.length, 0);
    assert.strictEqual(evalIdempotent.membershipChanges?.exitedVisitorIds.length, 0);

    // ==========================================
    // TEST 7: Invalid Rule Handling
    // ==========================================
    const segInvalid = await pulseRepo.saveSegment(segWs, {
      name: 'Invalid Rule Fallback',
      matchType: 'ALL',
      rules: [
        { field: 'non_existent_field' as any, operator: 'equals', value: 'foo' },
      ],
    });
    const evalInvalid = await pulseRepo.evaluateSegment(segWs, segInvalid.id);
    assert.ok(evalInvalid);
    assert.strictEqual(evalInvalid.memberCount, 0);

    // Clean up test segments
    await pulseRepo.deleteSegment(segWs, segCartAbandoners.id);
    await pulseRepo.deleteSegment(segWs, segAny.id);
    await pulseRepo.deleteSegment(segWs, segRecency.id);
    await pulseRepo.deleteSegment(segWs, segSite1Only.id);
    await pulseRepo.deleteSegment(segWs, segInvalid.id);
  });

  test('PULSE-14 — Background Cron Segment Evaluator, Workspace Isolation & Error Reporting', async () => {
    const { crmRepo } = await import('../src/lib/google-sheets/repository');
    const { GET: cronHandler } = await import('../src/app/api/cron/tick/route');

    const testSecret = 'pulse-14-cron-secret-test';
    const originalSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = testSecret;

    try {
      // 1. Cron Authentication: reject missing / invalid credentials
      const reqNoSecret = new NextRequest('http://localhost:3000/api/cron/tick');
      const resNoSecret = await cronHandler(reqNoSecret);
      assert.strictEqual(resNoSecret.status, 401);
      const dataNoSecret = await resNoSecret.json();
      assert.ok(dataNoSecret.error.includes('CRON_SECRET'));

      const reqWrongSecret = new NextRequest('http://localhost:3000/api/cron/tick', {
        headers: { Authorization: 'Bearer wrong-secret-token' },
      });
      const resWrongSecret = await cronHandler(reqWrongSecret);
      assert.strictEqual(resWrongSecret.status, 401);

      // 2. Set up two isolated workspaces for background segment evaluation
      const ws1 = await crmRepo.createWorkspace({
        name: 'Cron Workspace A',
        slug: 'ws-cron-a-' + Date.now(),
        industry: 'Retail',
        currency: 'INR',
        timezone: 'Asia/Kolkata',
        monthlyTarget: 100000,
      });
      const ws2 = await crmRepo.createWorkspace({
        name: 'Cron Workspace B',
        slug: 'ws-cron-b-' + Date.now(),
        industry: 'SaaS',
        currency: 'INR',
        timezone: 'Asia/Kolkata',
        monthlyTarget: 200000,
      });
      const wsA = ws1.id;
      const wsB = ws2.id;

      // Workspace A Segment: Inactive >= 5 days
      const segA = await pulseRepo.saveSegment(wsA, {
        name: 'Workspace A Inactive Visitors',
        matchType: 'ALL',
        rules: [{ field: 'days_since_last_visit', operator: 'greater_than_or_equal', value: 5 }],
      });

      // Workspace B Segment: High Product Discovery (>= 2 views)
      const segB = await pulseRepo.saveSegment(wsB, {
        name: 'Workspace B Engaged Discovery',
        matchType: 'ALL',
        rules: [{ field: 'product_views_count', operator: 'greater_than_or_equal', value: 2 }],
      });

      // Events for Workspace A (Visitor inactive for 10 days)
      const tenDaysAgo = new Date(Date.now() - 10 * 86400 * 1000).toISOString();
      await pulseRepo.recordEvent({
        id: 'e-cron-a-1',
        workspaceId: wsA,
        siteId: 'site-a',
        visitorId: 'vis-cron-a-old',
        sessionId: 'ses-a-old',
        type: 'page_view',
        name: 'Old Visit',
        source: 'sdk',
        timestamp: tenDaysAgo,
        createdAt: tenDaysAgo,
        properties: {},
      });

      // Events for Workspace B (Visitor active with 3 product views)
      for (let i = 1; i <= 3; i++) {
        await pulseRepo.recordEvent({
          id: `e-cron-b-${i}`,
          workspaceId: wsB,
          siteId: 'site-b',
          visitorId: 'vis-cron-b-active',
          sessionId: 'ses-b-active',
          type: 'product_viewed',
          name: `Product ${i}`,
          source: 'sdk',
          timestamp: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          properties: {},
        });
      }

      // 3. Execute Cron Tick via authenticated API endpoint
      const reqAuth = new NextRequest('http://localhost:3000/api/cron/tick', {
        headers: { Authorization: `Bearer ${testSecret}` },
      });
      const resAuth = await cronHandler(reqAuth);
      assert.strictEqual(resAuth.status, 200);
      const dataAuth = await resAuth.json();
      assert.strictEqual(dataAuth.success, true);
      assert.ok(dataAuth.data.pulseSegmentsEvaluated >= 2);
      assert.strictEqual(dataAuth.data.pulseSegmentErrors.length, 0);

      // Verify Workspace Isolation:
      const updatedSegA = await pulseRepo.getSegmentById(wsA, segA.id);
      assert.ok(updatedSegA);
      assert.strictEqual(updatedSegA.memberCount, 1);
      assert.strictEqual(updatedSegA.memberVisitorIds?.[0], 'vis-cron-a-old');

      const updatedSegB = await pulseRepo.getSegmentById(wsB, segB.id);
      assert.ok(updatedSegB);
      assert.strictEqual(updatedSegB.memberCount, 1);
      assert.strictEqual(updatedSegB.memberVisitorIds?.[0], 'vis-cron-b-active');

      // 4. Repeated Run Deduplication Check:
      // Second tick should evaluate segments without throwing or double-counting
      const tick2Result = await runCronTick();
      assert.ok(tick2Result.pulseSegmentsEvaluated >= 2);
      assert.strictEqual(tick2Result.pulseSegmentErrors.length, 0);

      // Clean up segments
      await pulseRepo.deleteSegment(wsA, segA.id);
      await pulseRepo.deleteSegment(wsB, segB.id);
    } finally {
      if (originalSecret) process.env.CRON_SECRET = originalSecret;
      else delete process.env.CRON_SECRET;
    }
  });

  test('PULSE-15 — Website Settings & Webhook Credential Management API', async () => {
    const originalSessionSecret = process.env.SESSION_SECRET;
    const originalAdminEmail = process.env.ADMIN_EMAIL;
    process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'developster-pulse-test-session-secret-32-chars-long';
    process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@developster.io';

    try {
      const { PUT: updateWebsiteHandler, GET: getWebsiteHandler, DELETE: deleteWebsiteHandler } = await import(
        '../src/app/api/pulse/v1/websites/[id]/route'
      );
      const { createSessionToken, getAuthConfig } = await import('../src/lib/auth');
      const { crmRepo } = await import('../src/lib/google-sheets/repository');

      const authConfig = getAuthConfig();
      const adminEmail = authConfig.adminEmail || 'admin@developster.io';
      const adminToken = createSessionToken(adminEmail);

    const testWs = 'ws-pulse15-' + Date.now();
    await crmRepo.createWorkspace({
      id: testWs,
      name: 'Pulse 15 Test Workspace',
      ownerEmail: adminEmail,
    });

    // Create a Read-only member in this workspace for RBAC testing
    const readOnlyEmail = `viewer-${Date.now()}@test.io`;
    await crmRepo.createMember(testWs, {
      name: 'Viewer Member',
      email: readOnlyEmail,
      role: 'Read-only',
      workspaceId: testWs,
    });
    const readOnlyToken = createSessionToken(readOnlyEmail);

    // Create initial website
    const initialSite = await pulseRepo.createWebsite({
      workspaceId: testWs,
      name: 'Initial Store',
      domain: 'store.testsite.com',
      whitelistedDomains: ['store.testsite.com', 'localhost'],
      status: 'active',
      ecommercePlatform: 'none',
    });

    const routeParams = Promise.resolve({ id: initialSite.id });

    // 1. Missing Authentication -> 401
    const unauthReq = new Request(`http://localhost:3000/api/pulse/v1/websites/${initialSite.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: testWs, name: 'Hacked Name' }),
    });
    const unauthRes = await updateWebsiteHandler(unauthReq, { params: routeParams });
    assert.strictEqual(unauthRes.status, 401);

    // 2. Read-only / Viewer role -> 403
    const viewerReq = new Request(`http://localhost:3000/api/pulse/v1/websites/${initialSite.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        cookie: `crm_session=${readOnlyToken}`,
      },
      body: JSON.stringify({ workspaceId: testWs, name: 'Attempted Name' }),
    });
    const viewerRes = await updateWebsiteHandler(viewerReq, { params: routeParams });
    assert.strictEqual(viewerRes.status, 403);

    // 3. Cross-workspace / Not Found -> 404
    const otherWs = 'ws-other-' + Date.now();
    const crossWsReq = new Request(`http://localhost:3000/api/pulse/v1/websites/${initialSite.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        cookie: `crm_session=${adminToken}`,
      },
      body: JSON.stringify({ workspaceId: otherWs, name: 'Cross Update' }),
    });
    const crossWsRes = await updateWebsiteHandler(crossWsReq, { params: routeParams });
    assert.strictEqual(crossWsRes.status, 404);

    // 4. Unsupported / Immutable fields rejected -> 400
    const unsupportedReq = new Request(`http://localhost:3000/api/pulse/v1/websites/${initialSite.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        cookie: `crm_session=${adminToken}`,
      },
      body: JSON.stringify({
        workspaceId: testWs,
        siteId: 'tampered-site-id',
      }),
    });
    const unsupportedRes = await updateWebsiteHandler(unsupportedReq, { params: routeParams });
    assert.strictEqual(unsupportedRes.status, 400);

    // 5. Malformed domain rejected -> 400
    const badDomainReq = new Request(`http://localhost:3000/api/pulse/v1/websites/${initialSite.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        cookie: `crm_session=${adminToken}`,
      },
      body: JSON.stringify({
        workspaceId: testWs,
        domain: 'not a domain @!#$',
      }),
    });
    const badDomainRes = await updateWebsiteHandler(badDomainReq, { params: routeParams });
    assert.strictEqual(badDomainRes.status, 400);

    // 6. Legitimate Update of Website Settings & Allowed Domains
    const validUpdateReq = new Request(`http://localhost:3000/api/pulse/v1/websites/${initialSite.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        cookie: `crm_session=${adminToken}`,
      },
      body: JSON.stringify({
        workspaceId: testWs,
        name: 'Updated Flagship Store',
        domain: 'shop.flagship.io',
        whitelistedDomains: ['shop.flagship.io', 'checkout.flagship.io', 'localhost'],
        status: 'active',
        ecommercePlatform: 'shopify',
      }),
    });
    const validUpdateRes = await updateWebsiteHandler(validUpdateReq, { params: routeParams });
    assert.strictEqual(validUpdateRes.status, 200);
    const validData = await validUpdateRes.json();
    assert.strictEqual(validData.website.name, 'Updated Flagship Store');
    assert.strictEqual(validData.website.domain, 'shop.flagship.io');
    assert.ok(validData.website.whitelistedDomains.includes('checkout.flagship.io'));

    // 7. E-commerce Integration & Webhook Secret Management
    const initialSecret = 'shpss_secret_vault_987654321';
    const integUpdateReq = new Request(`http://localhost:3000/api/pulse/v1/websites/${initialSite.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        cookie: `crm_session=${adminToken}`,
      },
      body: JSON.stringify({
        workspaceId: testWs,
        ecommercePlatform: 'shopify',
        integration: {
          platform: 'shopify',
          name: 'Flagship Shopify Production',
          storeUrl: 'https://shop.flagship.io',
          shopDomain: 'shop.flagship.io',
          webhookSecret: initialSecret,
          autoSyncOrders: true,
        },
      }),
    });
    const integRes = await updateWebsiteHandler(integUpdateReq, { params: routeParams });
    assert.strictEqual(integRes.status, 200);
    const integData = await integRes.json();

    // Verify plaintext secret is NEVER returned in response
    assert.strictEqual(integData.integration.webhookSecret, '••••••••');
    assert.notStrictEqual(integData.integration.webhookSecret, initialSecret);

    // Verify secret was stored in repository
    const storedInteg = await pulseRepo.getIntegrationByPlatform(testWs, 'shopify');
    assert.ok(storedInteg);
    assert.strictEqual(storedInteg.webhookSecret, initialSecret);

    // 8. Omitted / Blank Secret Preserves Existing Webhook Secret
    const partialUpdateReq = new Request(`http://localhost:3000/api/pulse/v1/websites/${initialSite.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        cookie: `crm_session=${adminToken}`,
      },
      body: JSON.stringify({
        workspaceId: testWs,
        name: 'Flagship Store Renamed',
        integration: {
          platform: 'shopify',
          storeUrl: 'https://shop.flagship.io',
          // webhookSecret intentionally omitted
        },
      }),
    });
    const partialRes = await updateWebsiteHandler(partialUpdateReq, { params: routeParams });
    assert.strictEqual(partialRes.status, 200);

    const postPreserveInteg = await pulseRepo.getIntegrationByPlatform(testWs, 'shopify');
    assert.ok(postPreserveInteg);
    assert.strictEqual(postPreserveInteg.webhookSecret, initialSecret); // Preserved!

    // 9. Audit Logging Check
    const activities = await crmRepo.getActivities(testWs);
    const websiteAuditLog = activities.find(
      (a) => a.title === 'Website Settings Updated' && a.description.includes('Flagship Store Renamed')
    );
    assert.ok(websiteAuditLog, 'Expected audit activity log for website settings update');

    // 10. GET Single Website & DELETE Website
    const getReq = new Request(`http://localhost:3000/api/pulse/v1/websites/${initialSite.id}?workspaceId=${testWs}`, {
      method: 'GET',
      headers: { cookie: `crm_session=${adminToken}` },
    });
    const getRes = await getWebsiteHandler(getReq, { params: routeParams });
    assert.strictEqual(getRes.status, 200);
    const getData = await getRes.json();
    assert.strictEqual(getData.website.id, initialSite.id);
    assert.strictEqual(getData.integration.webhookSecret, '••••••••');

    const deleteReq = new Request(`http://localhost:3000/api/pulse/v1/websites/${initialSite.id}?workspaceId=${testWs}`, {
      method: 'DELETE',
      headers: { cookie: `crm_session=${adminToken}` },
    });
    const deleteRes = await deleteWebsiteHandler(deleteReq, { params: routeParams });
    assert.strictEqual(deleteRes.status, 200);

    const verifyDeleted = await pulseRepo.getWebsiteById(testWs, initialSite.id);
    assert.strictEqual(verifyDeleted, null);
  } finally {
    if (originalSessionSecret) process.env.SESSION_SECRET = originalSessionSecret;
    else delete process.env.SESSION_SECRET;
    if (originalAdminEmail) process.env.ADMIN_EMAIL = originalAdminEmail;
    else delete process.env.ADMIN_EMAIL;
  }
});

test('PULSE-18.1 — Durable Google Sheets Configuration Persistence & Tenant Isolation', async () => {
  const wsA = 'ws-pulse-sheets-a-' + Date.now();
  const wsB = 'ws-pulse-sheets-b-' + Date.now();

  // 1. Website Persistence & Isolation
  const siteA = await pulseRepo.createWebsite(wsA, {
    name: 'Tenant A Store',
    domain: 'tenanta.com',
    whitelistedDomains: ['tenanta.com'],
    ecommercePlatform: 'shopify',
  });
  assert.ok(siteA.id);
  assert.strictEqual(siteA.workspaceId, wsA);

  const siteB = await pulseRepo.createWebsite(wsB, {
    name: 'Tenant B Store',
    domain: 'tenantb.com',
    whitelistedDomains: ['tenantb.com'],
    ecommercePlatform: 'woocommerce',
  });
  assert.ok(siteB.id);
  assert.strictEqual(siteB.workspaceId, wsB);

  // Cross-tenant read check
  const listA = await pulseRepo.getWebsites(wsA);
  assert.ok(listA.some((s) => s.id === siteA.id));
  assert.strictEqual(listA.some((s) => s.id === siteB.id), false, 'Workspace A must not see Workspace B websites');

  const listB = await pulseRepo.getWebsites(wsB);
  assert.ok(listB.some((s) => s.id === siteB.id));
  assert.strictEqual(listB.some((s) => s.id === siteA.id), false, 'Workspace B must not see Workspace A websites');

  // Direct ID read cross-tenant protection
  const crossRead = await pulseRepo.getWebsiteById(wsA, siteB.id);
  assert.strictEqual(crossRead, null, 'Workspace A must not fetch Workspace B website by ID');

  // Update website
  const updatedA = await pulseRepo.updateWebsite(wsA, siteA.id, {
    name: 'Tenant A Store Updated',
  });
  assert.ok(updatedA);
  assert.strictEqual(updatedA.name, 'Tenant A Store Updated');

  // 2. Funnel Persistence & Isolation
  const funnelA = await pulseRepo.saveFunnel(wsA, {
    name: 'Funnel A',
    description: 'Funnel for Tenant A',
    timeWindowHours: 12,
    steps: [
      { id: 's1', name: 'Step 1', eventType: 'page_view' },
      { id: 's2', name: 'Step 2', eventType: 'checkout_started' },
    ],
  });
  assert.ok(funnelA.id);
  assert.strictEqual(funnelA.workspaceId, wsA);

  const funnelsA = await pulseRepo.getFunnels(wsA);
  assert.ok(funnelsA.some((f) => f.id === funnelA.id));

  const funnelsB = await pulseRepo.getFunnels(wsB);
  assert.strictEqual(funnelsB.some((f) => f.id === funnelA.id), false, 'Workspace B must not see Workspace A funnels');

  // 3. Segment Persistence & Isolation
  const segmentA = await pulseRepo.saveSegment(wsA, {
    name: 'Segment A Cart Abandoners',
    rules: [
      { field: 'has_event', operator: 'equals', value: 'checkout_started', eventType: 'checkout_started' },
    ],
  });
  assert.ok(segmentA.id);
  assert.strictEqual(segmentA.workspaceId, wsA);

  const segmentsA = await pulseRepo.getSegments(wsA);
  assert.ok(segmentsA.some((s) => s.id === segmentA.id));

  const segmentsB = await pulseRepo.getSegments(wsB);
  assert.strictEqual(segmentsB.some((s) => s.id === segmentA.id), false, 'Workspace B must not see Workspace A segments');

  const segmentByIdA = await pulseRepo.getSegmentById(wsA, segmentA.id);
  assert.ok(segmentByIdA);
  assert.strictEqual(segmentByIdA.name, 'Segment A Cart Abandoners');

  const crossSegmentRead = await pulseRepo.getSegmentById(wsB, segmentA.id);
  assert.strictEqual(crossSegmentRead, null, 'Workspace B must not fetch Workspace A segment by ID');

  // 4. Deletion
  const deletedFunnel = await pulseRepo.deleteFunnel(wsA, funnelA.id);
  assert.strictEqual(deletedFunnel, true);
  const verifyFunnelDeleted = (await pulseRepo.getFunnels(wsA)).some((f) => f.id === funnelA.id);
  assert.strictEqual(verifyFunnelDeleted, false);

  const deletedSegment = await pulseRepo.deleteSegment(wsA, segmentA.id);
  assert.strictEqual(deletedSegment, true);
  const verifySegmentDeleted = await pulseRepo.getSegmentById(wsA, segmentA.id);
  assert.strictEqual(verifySegmentDeleted, null);

  const deletedSite = await pulseRepo.deleteWebsite(wsA, siteA.id);
  assert.strictEqual(deletedSite, true);
  const verifySiteDeleted = await pulseRepo.getWebsiteById(wsA, siteA.id);
  assert.strictEqual(verifySiteDeleted, null);
});

test('PULSE-18.1.1 — Google Sheets Fallback Correctness & Explicit Error Handling', async () => {
  const { pulseRepo } = await import('../src/lib/pulse/repository');
  const googleSheetsConfig = await import('../src/lib/google-sheets/config');
  const googleSheetsClientModule = await import('../src/lib/google-sheets/client');

  const ws = 'ws-fallback-test-' + Date.now();

  // 1. In unconfigured state (default test env), verify local JSON store is used cleanly
  assert.strictEqual(googleSheetsConfig.isGoogleSheetsConfigured(), false);
  const unconfiguredSite = await pulseRepo.createWebsite(ws, {
    name: 'Unconfigured Test Site',
    domain: 'unconfigured.example.com',
  });
  assert.ok(unconfiguredSite.id);
  const unconfiguredSites = await pulseRepo.getWebsites(ws);
  assert.ok(unconfiguredSites.some((s) => s.id === unconfiguredSite.id));

  // Clean up
  await pulseRepo.deleteWebsite(ws, unconfiguredSite.id);

  // 2. When Google Sheets IS configured but client is NOT ready, it MUST throw explicitly
  const origEnvSpreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const origEnvClientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const origEnvPrivateKey = process.env.GOOGLE_PRIVATE_KEY;
  const origIsReady = googleSheetsClientModule.googleSheetsClient.isReady;

  try {
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = 'test-spreadsheet-id-for-fallback';
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'service-account@test.iam.gserviceaccount.com';
    process.env.GOOGLE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC3\n-----END PRIVATE KEY-----';

    assert.strictEqual(googleSheetsConfig.isGoogleSheetsConfigured(), true);
    googleSheetsClientModule.googleSheetsClient.isReady = () => false;

    // A. Website Operations Must Throw Explicit Error
    await assert.rejects(
      async () => {
        await pulseRepo.getWebsites(ws);
      },
      {
        message: /Google Sheets database is configured but client failed to connect/,
      },
      'getWebsites must fail explicitly when Sheets is configured but client is not ready'
    );

    await assert.rejects(
      async () => {
        await pulseRepo.createWebsite(ws, {
          name: 'Should Fail Site',
          domain: 'fail.example.com',
        });
      },
      {
        message: /Google Sheets database is configured but client failed to connect/,
      },
      'createWebsite must fail explicitly and NOT write to local JSON store'
    );

    // B. Funnel Operations Must Throw Explicit Error
    await assert.rejects(
      async () => {
        await pulseRepo.getFunnels(ws);
      },
      {
        message: /Google Sheets database is configured but client failed to connect/,
      },
      'getFunnels must fail explicitly when Sheets is configured but client is not ready'
    );

    await assert.rejects(
      async () => {
        await pulseRepo.saveFunnel(ws, {
          name: 'Should Fail Funnel',
          steps: [],
        });
      },
      {
        message: /Google Sheets database is configured but client failed to connect/,
      },
      'saveFunnel must fail explicitly and NOT silently fallback to JSON'
    );

    await assert.rejects(
      async () => {
        await pulseRepo.deleteFunnel(ws, 'some-funnel-id');
      },
      {
        message: /Google Sheets database is configured but client failed to connect/,
      },
      'deleteFunnel must fail explicitly when Sheets is configured but client is not ready'
    );

    // C. Segment Operations Must Throw Explicit Error
    await assert.rejects(
      async () => {
        await pulseRepo.getSegments(ws);
      },
      {
        message: /Google Sheets database is configured but client failed to connect/,
      },
      'getSegments must fail explicitly when Sheets is configured but client is not ready'
    );

    await assert.rejects(
      async () => {
        await pulseRepo.getSegmentById(ws, 'some-seg-id');
      },
      {
        message: /Google Sheets database is configured but client failed to connect/,
      },
      'getSegmentById must fail explicitly when Sheets is configured but client is not ready'
    );

    await assert.rejects(
      async () => {
        await pulseRepo.saveSegment(ws, {
          name: 'Should Fail Segment',
          rules: [],
        });
      },
      {
        message: /Google Sheets database is configured but client failed to connect/,
      },
      'saveSegment must fail explicitly and NOT silently fallback to JSON'
    );

    await assert.rejects(
      async () => {
        await pulseRepo.deleteSegment(ws, 'some-seg-id');
      },
      {
        message: /Google Sheets database is configured but client failed to connect/,
      },
      'deleteSegment must fail explicitly when Sheets is configured but client is not ready'
    );

    // 3. Verify when client IS ready but an API call throws an error (e.g. quota/network), it does NOT fallback to JSON
    googleSheetsClientModule.googleSheetsClient.isReady = () => true;
    const origGetAllRows = googleSheetsClientModule.googleSheetsClient.getAllRows;
    const origAppendRow = googleSheetsClientModule.googleSheetsClient.appendRow;

    googleSheetsClientModule.googleSheetsClient.getAllRows = async () => {
      throw new Error('Google Sheets API 503 Backend Error');
    };
    googleSheetsClientModule.googleSheetsClient.appendRow = async () => {
      throw new Error('Google Sheets API 429 Quota Exceeded');
    };

    try {
      await assert.rejects(
        async () => {
          await pulseRepo.getWebsites(ws);
        },
        {
          message: /Google Sheets API 503 Backend Error/,
        },
        'getWebsites must propagate Google Sheets API error without swallowing'
      );

      await assert.rejects(
        async () => {
          await pulseRepo.createWebsite(ws, {
            name: 'API Error Site',
            domain: 'api-error.example.com',
          });
        },
        {
          message: /Google Sheets API 429 Quota Exceeded/,
        },
        'createWebsite must propagate appendRow error without swallowing or redirecting to local JSON'
      );

      await assert.rejects(
        async () => {
          await pulseRepo.saveFunnel(ws, {
            name: 'API Error Funnel',
            steps: [],
          });
        },
        {
          message: /Google Sheets API 503 Backend Error/,
        },
        'saveFunnel must propagate API error during existing lookup'
      );

      await assert.rejects(
        async () => {
          await pulseRepo.saveSegment(ws, {
            name: 'API Error Segment',
            rules: [],
          });
        },
        {
          message: /Google Sheets API 503 Backend Error/,
        },
        'saveSegment must propagate API error during existing lookup'
      );
    } finally {
      googleSheetsClientModule.googleSheetsClient.getAllRows = origGetAllRows;
      googleSheetsClientModule.googleSheetsClient.appendRow = origAppendRow;
    }
  } finally {
    if (origEnvSpreadsheetId !== undefined) {
      process.env.GOOGLE_SHEETS_SPREADSHEET_ID = origEnvSpreadsheetId;
    } else {
      delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    }
    if (origEnvClientEmail !== undefined) {
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = origEnvClientEmail;
    } else {
      delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    }
    if (origEnvPrivateKey !== undefined) {
      process.env.GOOGLE_PRIVATE_KEY = origEnvPrivateKey;
    } else {
      delete process.env.GOOGLE_PRIVATE_KEY;
    }
    googleSheetsClientModule.googleSheetsClient.isReady = origIsReady;
  }
});

test('PULSE-18.2 — Durable Business Event Persistence & Webhook Ingestion Tests', async () => {
  const { pulseRepo } = await import('../src/lib/pulse/repository');
  const { crmRepo } = await import('../src/lib/google-sheets/repository');
  const googleSheetsConfig = await import('../src/lib/google-sheets/config');
  const googleSheetsClientModule = await import('../src/lib/google-sheets/client');

  const ws = 'ws-p18-2-test-' + Date.now();
  const siteId = 'psite_test_' + Math.random().toString(36).substring(2, 6);

  // 1. Storage: Unconfigured local development retains safe JSON fallback without claiming durability
  assert.strictEqual(googleSheetsConfig.isGoogleSheetsConfigured(), false);
  const localEvent = {
    id: `pbe-local-${Date.now()}`,
    workspaceId: ws,
    siteId,
    platform: 'shopify' as const,
    sourceEventId: 'sp-order-101',
    eventType: 'purchase_completed',
    amount: 2500,
    currency: 'INR',
    occurredAt: new Date().toISOString(),
    processedAt: new Date().toISOString(),
  };

  const { event: savedLocal, isDuplicate: isDup1 } = await pulseRepo.recordBusinessEvent(localEvent);
  assert.strictEqual(isDup1, false);
  assert.strictEqual(savedLocal.sourceEventId, 'sp-order-101');

  // Verify duplicate detection in unconfigured local storage
  const { isDuplicate: isDup2 } = await pulseRepo.recordBusinessEvent(localEvent);
  assert.strictEqual(isDup2, true);

  // 2. Storage: Configured Google Sheets Mode
  const origEnvSpreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const origEnvClientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const origEnvPrivateKey = process.env.GOOGLE_PRIVATE_KEY;
  const origIsReady = googleSheetsClientModule.googleSheetsClient.isReady;

  try {
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = 'test-spreadsheet-id-for-p18-2';
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'service-account@test.iam.gserviceaccount.com';
    process.env.GOOGLE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC3\n-----END PRIVATE KEY-----';
    googleSheetsClientModule.googleSheetsClient.isReady = () => true;

    // A. Mock successful Google Sheets storage
    const fakeSheetStore: Record<string, any[]> = {};
    const origGetAllRows = googleSheetsClientModule.googleSheetsClient.getAllRows;
    const origAppendRow = googleSheetsClientModule.googleSheetsClient.appendRow;

    googleSheetsClientModule.googleSheetsClient.getAllRows = async (sheetName: string) => {
      return (fakeSheetStore[sheetName] || []) as any[];
    };
    googleSheetsClientModule.googleSheetsClient.appendRow = async (sheetName: string, row: any) => {
      if (!fakeSheetStore[sheetName]) fakeSheetStore[sheetName] = [];
      fakeSheetStore[sheetName].push(row);
    };

    const durableEvent = {
      id: `pbe-shopify-ord-202`,
      workspaceId: ws,
      siteId,
      platform: 'shopify' as const,
      sourceEventId: 'sp-ord-202',
      eventType: 'purchase_completed',
      customerId: 'cust-ext-99',
      orderId: 'ord-202',
      amount: 4999,
      currency: 'INR',
      occurredAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
    };

    const res1 = await pulseRepo.recordBusinessEvent(durableEvent);
    assert.strictEqual(res1.isDuplicate, false);
    assert.strictEqual(fakeSheetStore['PulseEvents']?.length, 1);
    assert.strictEqual(fakeSheetStore['PulseEvents'][0].orderId, 'ord-202');

    // Duplicate webhook delivery returns isDuplicate: true and does not append row
    const res2 = await pulseRepo.recordBusinessEvent(durableEvent);
    assert.strictEqual(res2.isDuplicate, true);
    assert.strictEqual(fakeSheetStore['PulseEvents']?.length, 1);

    // B. Google Sheets Write Failure must throw explicitly and NEVER silently fall back to local JSON
    googleSheetsClientModule.googleSheetsClient.appendRow = async () => {
      throw new Error('Google Sheets API 503 Backend Failure');
    };

    await assert.rejects(
      async () => {
        await pulseRepo.recordBusinessEvent({
          id: `pbe-shopify-ord-303`,
          workspaceId: ws,
          siteId,
          platform: 'shopify' as const,
          sourceEventId: 'sp-ord-303',
          eventType: 'purchase_completed',
          occurredAt: new Date().toISOString(),
          processedAt: new Date().toISOString(),
        });
      },
      {
        message: /Google Sheets API 503 Backend Failure/,
      },
      'Durable business event write must throw explicitly on Sheets failure'
    );

    // Clean mock
    googleSheetsClientModule.googleSheetsClient.getAllRows = origGetAllRows;
    googleSheetsClientModule.googleSheetsClient.appendRow = origAppendRow;
  } finally {
    if (origEnvSpreadsheetId !== undefined) {
      process.env.GOOGLE_SHEETS_SPREADSHEET_ID = origEnvSpreadsheetId;
    } else {
      delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    }
    if (origEnvClientEmail !== undefined) {
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = origEnvClientEmail;
    } else {
      delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    }
    if (origEnvPrivateKey !== undefined) {
      process.env.GOOGLE_PRIVATE_KEY = origEnvPrivateKey;
    } else {
      delete process.env.GOOGLE_PRIVATE_KEY;
    }
    googleSheetsClientModule.googleSheetsClient.isReady = origIsReady;
  }

  // 3. CRM Customer Timeline Integration & Workspace Boundary
  const wsTimelineA = 'ws-crm-tl-a-' + Date.now();
  const wsTimelineB = 'ws-crm-tl-b-' + Date.now();

  const customerA = await crmRepo.createCustomer(wsTimelineA, {
    name: 'Sunil Deshmukh',
    email: 'sunil.deshmukh@mahindra.com',
    company: 'Mahindra & Mahindra',
    status: 'Active',
    totalRevenue: 0,
  });

  const leadsInA = await crmRepo.getLeads(wsTimelineA);
  const matchedLead = leadsInA.find((l) => l.email === 'sunil.deshmukh@mahindra.com') || leadsInA[0];
  assert.ok(matchedLead, 'Should find matched lead in workspace A');

  // Verify processIngestedEvent logs milestone activity without duplicate
  const { processIngestedEvent } = await import('../src/lib/pulse/tracker');

  // Register site in wsTimelineA
  await pulseRepo.createWebsite(wsTimelineA, {
    name: 'Mahindra Auto Store',
    domain: 'mahindra.com',
  });
  const siteA = (await pulseRepo.getWebsites(wsTimelineA))[0];

  const milestoneEvent = {
    workspaceId: wsTimelineA,
    siteId: siteA.siteId,
    type: 'purchase_completed' as const,
    name: 'Purchase Completed (#ORD-901)',
    ecommerce: {
      orderId: 'ORD-901',
      total: 12500,
      currency: 'INR',
    },
    identities: {
      email: 'sunil.deshmukh@mahindra.com',
      name: 'Sunil Deshmukh',
    },
    timestamp: new Date().toISOString(),
  };

  // Ingestion 1: Creates timeline activity
  await processIngestedEvent(milestoneEvent, { siteId: siteA.siteId, origin: 'https://mahindra.com' });
  const activities1 = await crmRepo.getActivities(wsTimelineA, matchedLead.id);
  const purchaseActs1 = activities1.filter((a) => a.type === 'purchase');
  assert.strictEqual(purchaseActs1.length, 1);
  assert.ok(purchaseActs1[0].description.includes('ORD-901'));

  // Ingestion 2 (Duplicate Webhook Delivery): Timeline activity must NOT duplicate
  await processIngestedEvent(milestoneEvent, { siteId: siteA.siteId, origin: 'https://mahindra.com' });
  const activities2 = await crmRepo.getActivities(wsTimelineA, matchedLead.id);
  const purchaseActs2 = activities2.filter((a) => a.type === 'purchase');
  assert.strictEqual(purchaseActs2.length, 1, 'Duplicate webhook must not create duplicate CRM timeline activity');

  // Cross-workspace isolation check: Workspace B must NOT see lead A activities
  const activitiesB = await crmRepo.getActivities(wsTimelineB, matchedLead.id);
  assert.strictEqual(activitiesB.length, 0, 'Workspace B must not access Workspace A customer activities');

  // 4. Webhook Route Execution Tests (Shopify & WooCommerce)
  const shopifyRoute = await import('../src/app/api/pulse/v1/integrations/shopify/webhook/route');
  const wooRoute = await import('../src/app/api/pulse/v1/integrations/woocommerce/webhook/route');
  const crypto = await import('crypto');

  const webhookSecret = 'test_webhook_secret_key_123';
  await pulseRepo.saveIntegration(wsTimelineA, {
    workspaceId: wsTimelineA,
    platform: 'shopify',
    shopDomain: 'sethbooks.myshopify.com',
    webhookSecret,
    status: 'connected',
  });

  const shopifyPayload = JSON.stringify({
    id: 998877,
    order_number: 1001,
    total_price: '7500.00',
    currency: 'INR',
    created_at: new Date().toISOString(),
    customer: {
      id: 554433,
      email: 'vikram.seth@example.com',
      first_name: 'Vikram',
      last_name: 'Seth',
    },
    line_items: [
      { id: 1, title: 'Hardcover Collector Set', price: '7500.00', quantity: 1 },
    ],
  });

  // A. Shopify: Invalid Signature Rejected
  const invalidSigReq = new Request('http://localhost/api/pulse/v1/integrations/shopify/webhook', {
    method: 'POST',
    headers: {
      'x-shopify-topic': 'orders/create',
      'x-shopify-hmac-sha256': 'invalid_hmac_base64_string',
      'x-shopify-shop-domain': 'sethbooks.myshopify.com',
      'x-shopify-webhook-id': 'wh-test-invalid-1',
    },
    body: shopifyPayload,
  });
  const invalidRes = await shopifyRoute.POST(invalidSigReq);
  assert.strictEqual(invalidRes.status, 401);

  // B. Shopify: Valid Signature and Purchase Event Persistence
  const validHmac = crypto.createHmac('sha256', webhookSecret).update(shopifyPayload, 'utf8').digest('base64');
  const validReq = new Request('http://localhost/api/pulse/v1/integrations/shopify/webhook', {
    method: 'POST',
    headers: {
      'x-shopify-topic': 'orders/create',
      'x-shopify-hmac-sha256': validHmac,
      'x-shopify-shop-domain': 'sethbooks.myshopify.com',
      'x-shopify-webhook-id': 'wh-test-valid-1',
    },
    body: shopifyPayload,
  });

  const validRes = await shopifyRoute.POST(validReq);
  assert.strictEqual(validRes.status, 200);
  const validData = await validRes.json();
  assert.strictEqual(validData.received, true);
  assert.strictEqual(validData.eventId, 'pbe-shopify-1001');

  // C. Shopify: Duplicate Webhook Delivery Handling
  const dupReq = new Request('http://localhost/api/pulse/v1/integrations/shopify/webhook', {
    method: 'POST',
    headers: {
      'x-shopify-topic': 'orders/create',
      'x-shopify-hmac-sha256': validHmac,
      'x-shopify-shop-domain': 'sethbooks.myshopify.com',
      'x-shopify-webhook-id': 'wh-test-valid-1', // same delivery ID
    },
    body: shopifyPayload,
  });
  const dupRes = await shopifyRoute.POST(dupReq);
  assert.strictEqual(dupRes.status, 200);
  const dupData = await dupRes.json();
  assert.strictEqual(dupData.duplicate, true);

  // D. WooCommerce: Webhook Test
  await pulseRepo.saveIntegration(wsTimelineA, {
    workspaceId: wsTimelineA,
    platform: 'woocommerce',
    shopDomain: 'sethbooks.in',
    webhookSecret,
    status: 'connected',
  });

  const wcPayload = JSON.stringify({
    id: 4004,
    status: 'completed',
    total: '3200.00',
    currency: 'INR',
    date_created_gmt: new Date().toISOString(),
    billing: {
      first_name: 'Vikram',
      last_name: 'Seth',
      email: 'vikram.seth@example.com',
    },
    line_items: [
      { id: 2, name: 'Paperback Edition', price: '3200.00', quantity: 1 },
    ],
  });

  const wcValidSig = crypto.createHmac('sha256', webhookSecret).update(wcPayload, 'utf8').digest('base64');
  const wcReq = new Request('http://localhost/api/pulse/v1/integrations/woocommerce/webhook', {
    method: 'POST',
    headers: {
      'x-wc-webhook-topic': 'order.created',
      'x-wc-webhook-signature': wcValidSig,
      'x-wc-webhook-source': 'https://sethbooks.in',
      'x-wc-webhook-id': 'wc-deliv-1',
    },
    body: wcPayload,
  });
  const wcRes = await wooRoute.POST(wcReq);
  assert.strictEqual(wcRes.status, 200);
  const wcData = await wcRes.json();
  assert.strictEqual(wcData.received, true);
  assert.strictEqual(wcData.eventId, 'pbe-wc-4004');
});

test('PULSE-18.3 — Daily Pulse Aggregate Rollups, Currency Separation, Late Events & Idempotency', async () => {
  const wsRollupA = 'ws-rollup-a-' + Date.now();
  const wsRollupB = 'ws-rollup-b-' + Date.now();
  const siteA1 = 'site-roll-a1';
  const siteA2 = 'site-roll-a2';
  const siteB1 = 'site-roll-b1';

  // Day 1: 2026-11-10
  // Day 2: 2026-11-11
  // Day 3: 2026-11-12
  const d1 = '2026-11-10T14:30:00.000Z';
  const d2 = '2026-11-11T09:15:00.000Z';
  const d3 = '2026-11-12T18:00:00.000Z';

  // Seed events for wsRollupA - siteA1:
  // Day 1: 2 orders in INR (1500 and 2500 = 4000 total)
  await pulseRepo.recordBusinessEvent({
    id: 'pbe-roll-1',
    workspaceId: wsRollupA,
    siteId: siteA1,
    platform: 'shopify',
    sourceEventId: 'ord-101',
    eventType: 'purchase_completed',
    amount: 1500,
    currency: 'INR',
    occurredAt: d1,
    processedAt: new Date().toISOString(),
  });
  await pulseRepo.recordBusinessEvent({
    id: 'pbe-roll-2',
    workspaceId: wsRollupA,
    siteId: siteA1,
    platform: 'shopify',
    sourceEventId: 'ord-102',
    eventType: 'purchase_completed',
    amount: 2500,
    currency: 'INR',
    occurredAt: d1,
    processedAt: new Date().toISOString(),
  });

  // Day 1: 1 order in USD ($50) on siteA1
  await pulseRepo.recordBusinessEvent({
    id: 'pbe-roll-3',
    workspaceId: wsRollupA,
    siteId: siteA1,
    platform: 'shopify',
    sourceEventId: 'ord-103',
    eventType: 'purchase_completed',
    amount: 50,
    currency: 'USD',
    occurredAt: d1,
    processedAt: new Date().toISOString(),
  });

  // Day 1: 1 order in INR (1200) on siteA2 (different site in same workspace)
  await pulseRepo.recordBusinessEvent({
    id: 'pbe-roll-4',
    workspaceId: wsRollupA,
    siteId: siteA2,
    platform: 'woocommerce',
    sourceEventId: 'wc-201',
    eventType: 'purchase_completed',
    amount: 1200,
    currency: 'INR',
    occurredAt: d1,
    processedAt: new Date().toISOString(),
  });

  // Day 2: 1 order in INR (3000) on siteA1
  await pulseRepo.recordBusinessEvent({
    id: 'pbe-roll-5',
    workspaceId: wsRollupA,
    siteId: siteA1,
    platform: 'shopify',
    sourceEventId: 'ord-104',
    eventType: 'purchase_completed',
    amount: 3000,
    currency: 'INR',
    occurredAt: d2,
    processedAt: new Date().toISOString(),
  });

  // Seed events for wsRollupB (tenant isolation check)
  await pulseRepo.recordBusinessEvent({
    id: 'pbe-roll-b-1',
    workspaceId: wsRollupB,
    siteId: siteB1,
    platform: 'shopify',
    sourceEventId: 'ord-b-1',
    eventType: 'purchase_completed',
    amount: 9999,
    currency: 'INR',
    occurredAt: d1,
    processedAt: new Date().toISOString(),
  });

  // Step 1: Generate rollups for wsRollupA
  const rollupsA = await pulseRepo.generateDailyRollups(wsRollupA, { lookbackDays: 30 });
  assert.ok(rollupsA.length >= 4);

  // Verify siteA1, 2026-11-10, INR
  const rSiteA1D1Inr = rollupsA.find((r) => r.siteId === siteA1 && r.date === '2026-11-10' && r.currency === 'INR');
  assert.ok(rSiteA1D1Inr);
  assert.strictEqual(rSiteA1D1Inr.eventCount, 2);
  assert.strictEqual(rSiteA1D1Inr.totalRevenue, 4000);
  assert.strictEqual(rSiteA1D1Inr.version, 1);
  assert.strictEqual(rSiteA1D1Inr.id, `rl_${wsRollupA}_${siteA1}_2026-11-10_purchase_completed_INR`);

  // Verify multi-currency separation: siteA1, 2026-11-10, USD
  const rSiteA1D1Usd = rollupsA.find((r) => r.siteId === siteA1 && r.date === '2026-11-10' && r.currency === 'USD');
  assert.ok(rSiteA1D1Usd);
  assert.strictEqual(rSiteA1D1Usd.eventCount, 1);
  assert.strictEqual(rSiteA1D1Usd.totalRevenue, 50);

  // Verify site isolation: siteA2, 2026-11-10, INR
  const rSiteA2D1Inr = rollupsA.find((r) => r.siteId === siteA2 && r.date === '2026-11-10' && r.currency === 'INR');
  assert.ok(rSiteA2D1Inr);
  assert.strictEqual(rSiteA2D1Inr.eventCount, 1);
  assert.strictEqual(rSiteA2D1Inr.totalRevenue, 1200);

  // Verify Day 2: siteA1, 2026-11-11, INR
  const rSiteA1D2Inr = rollupsA.find((r) => r.siteId === siteA1 && r.date === '2026-11-11' && r.currency === 'INR');
  assert.ok(rSiteA1D2Inr);
  assert.strictEqual(rSiteA1D2Inr.eventCount, 1);
  assert.strictEqual(rSiteA1D2Inr.totalRevenue, 3000);

  // Verify Tenant Isolation: wsRollupA does NOT contain wsRollupB aggregates
  const wsBRollups = await pulseRepo.getDailyRollups(wsRollupB);
  assert.strictEqual(wsBRollups.length, 0); // Not generated yet for B
  await pulseRepo.generateDailyRollups(wsRollupB, { lookbackDays: 30 });
  const wsBGenerated = await pulseRepo.getDailyRollups(wsRollupB);
  assert.strictEqual(wsBGenerated.length, 1);
  assert.strictEqual(wsBGenerated[0].totalRevenue, 9999);

  // Step 2: Idempotency check — rerun generateDailyRollups on wsRollupA with NO new events
  const rollupsARerun = await pulseRepo.generateDailyRollups(wsRollupA, { lookbackDays: 30 });
  assert.strictEqual(rollupsARerun.length, rollupsA.length);
  const rRerun = rollupsARerun.find((r) => r.id === rSiteA1D1Inr.id);
  assert.ok(rRerun);
  assert.strictEqual(rRerun.eventCount, 2);
  assert.strictEqual(rRerun.totalRevenue, 4000);
  assert.strictEqual(rRerun.version, 2); // Version increments on re-write

  // Step 3: Late Event Absorber
  // A late order arrives today for Day 1 (2026-11-10) on siteA1 for 1000 INR
  await pulseRepo.recordBusinessEvent({
    id: 'pbe-roll-late-1',
    workspaceId: wsRollupA,
    siteId: siteA1,
    platform: 'shopify',
    sourceEventId: 'ord-late-1',
    eventType: 'purchase_completed',
    amount: 1000,
    currency: 'INR',
    occurredAt: d1,
    processedAt: new Date().toISOString(),
  });

  // Re-run rollup generator (simulates daily cron tick covering the lookback window)
  const rollupsAfterLate = await pulseRepo.generateDailyRollups(wsRollupA, { lookbackDays: 30 });
  const rUpdated = rollupsAfterLate.find((r) => r.id === rSiteA1D1Inr.id);
  assert.ok(rUpdated);
  assert.strictEqual(rUpdated.eventCount, 3); // 2 + 1
  assert.strictEqual(rUpdated.totalRevenue, 5000); // 4000 + 1000
  assert.strictEqual(rUpdated.version, 3);

  // Step 4: Querying getDailyRollups with filters
  const filteredInr = await pulseRepo.getDailyRollups(wsRollupA, {
    siteId: siteA1,
    currency: 'INR',
  });
  assert.strictEqual(filteredInr.length, 2); // 2026-11-10 and 2026-11-11
  assert.strictEqual(filteredInr[0].date, '2026-11-10');
  assert.strictEqual(filteredInr[0].totalRevenue, 5000);
  assert.strictEqual(filteredInr[1].date, '2026-11-11');
  assert.strictEqual(filteredInr[1].totalRevenue, 3000);

  // Step 5: Test Cron Tick integration executes daily rollups without throwing
  const cronRes = await runCronTick();
  assert.ok(typeof cronRes.pulseRollupsGenerated === 'number');
  assert.ok(Array.isArray(cronRes.pulseRollupErrors));
  assert.strictEqual(cronRes.pulseRollupErrors.length, 0);
});

test('PULSE-18.4 — Mathematical Models: Time-Series Forecasting, Cart Recovery & Intent Scoring', async () => {
  const {
    calculateDefensibleDelta,
    calculateDeterministicEngagementScore,
    computeObservedCartRecovery,
    evaluateAndForecastDailyMetric,
  } = await import('../src/lib/pulse/mathematics');

  // 1. Delta calculation: Zero baseline & valid differences
  const dValid = calculateDefensibleDelta(150, 100);
  assert.strictEqual(dValid.status, 'VALID');
  assert.strictEqual(dValid.percent, 50);
  assert.strictEqual(dValid.isPositive, true);

  const dZeroPrev = calculateDefensibleDelta(200, 0);
  assert.strictEqual(dZeroPrev.status, 'ZERO_BASELINE');
  assert.strictEqual(dZeroPrev.percent, 100);
  assert.strictEqual(dZeroPrev.isPositive, true);

  const dNoData = calculateDefensibleDelta(100, null);
  assert.strictEqual(dNoData.status, 'NO_PREVIOUS_DATA');
  assert.strictEqual(dNoData.percent, null);

  // 2. Deterministic Behavioural Engagement Scoring (Documented weights & missing data safety)
  const intentEmpty = calculateDeterministicEngagementScore(0, 0, 0, 0, 0, null);
  assert.strictEqual(intentEmpty.tier, 'INSUFFICIENT_DATA');
  assert.strictEqual(intentEmpty.score, null); // Score is null, never a misleading numeric 0

  // Active user: 1 day ago (25 recency) + 3 product views (15 pts) + 1 cart (5 pts) + 1 checkout (10 pts) + 1 purchase (10 pts) = 65 pts
  const intentActive = calculateDeterministicEngagementScore(10, 3, 1, 1, 1, 1);
  assert.strictEqual(intentActive.score, 65);
  assert.strictEqual(intentActive.tier, 'HIGH');
  assert.strictEqual(intentActive.breakdown.recencyPoints, 25);
  assert.strictEqual(intentActive.breakdown.engagementPoints, 15);
  assert.strictEqual(intentActive.breakdown.progressionPoints, 15);
  assert.strictEqual(intentActive.breakdown.purchasePoints, 10);

  // Partial user with missing recency (null) - must not be penalized
  const partialUser = calculateDeterministicEngagementScore(5, 2, 0, 0, 0, null);
  assert.strictEqual(partialUser.breakdown.recencyPoints, 0);
  assert.strictEqual(partialUser.score, 10);
  assert.strictEqual(partialUser.tier, 'LOW');

  // Maximum cap verification
  const maxUser = calculateDeterministicEngagementScore(500, 20, 10, 10, 10, 0);
  assert.strictEqual(maxUser.score, 100);
  assert.strictEqual(maxUser.tier, 'VERY_HIGH');

  // 3. Observed Cart Recovery Linkage with Verifiable Cart ID
  const testWs = 'ws-recovery-math-' + Date.now();
  const testSite = 'site-rec-1';
  const otherWs = 'ws-other-' + Date.now();

  const recoveryEvents = [
    // Cart 1: Added to cart with cartId 'cart-1', but no purchase within window -> Eligible Abandoned
    {
      workspaceId: testWs,
      siteId: testSite,
      visitorId: 'vis-1',
      cartId: 'cart-1',
      type: 'item_added_to_cart',
      timestamp: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
      ecommerce: { total: 1200, currency: 'INR' },
    },
    // Cart 2: Checkout started 4 hours ago, purchase completed 2 hours later (> 1 hr window) explicitly linking cart-2 -> Recovered Cart!
    {
      workspaceId: testWs,
      siteId: testSite,
      visitorId: 'vis-2',
      cartId: 'cart-2',
      type: 'checkout_started',
      timestamp: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
      ecommerce: { total: 2500, currency: 'INR' },
    },
    {
      workspaceId: testWs,
      siteId: testSite,
      visitorId: 'vis-2',
      linkedCartId: 'cart-2',
      type: 'purchase_completed',
      timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
      ecommerce: { total: 2500, currency: 'INR', orderId: 'ord-rec-2' },
    },
    // Duplicate order webhook delivery for cart-2 (must not double-count recovered cart)
    {
      workspaceId: testWs,
      siteId: testSite,
      visitorId: 'vis-2',
      linkedCartId: 'cart-2',
      type: 'purchase_completed',
      timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
      ecommerce: { total: 2500, currency: 'INR', orderId: 'ord-rec-2' },
    },
    // Cart 3: Same visitor as cart 1, but creates cart 3 which completes checkout immediately (< 5 mins) -> Normal purchase, not abandoned
    {
      workspaceId: testWs,
      siteId: testSite,
      visitorId: 'vis-1',
      cartId: 'cart-3',
      type: 'checkout_started',
      timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      ecommerce: { total: 800, currency: 'USD' },
    },
    {
      workspaceId: testWs,
      siteId: testSite,
      visitorId: 'vis-1',
      linkedCartId: 'cart-3',
      type: 'purchase_completed',
      timestamp: new Date(Date.now() - 28 * 60 * 1000).toISOString(),
      ecommerce: { total: 800, currency: 'USD', orderId: 'ord-norm-3' },
    },
    // Cart 4: Different workspace (tenant boundary check)
    {
      workspaceId: otherWs,
      siteId: testSite,
      visitorId: 'vis-x',
      cartId: 'cart-x',
      type: 'item_added_to_cart',
      timestamp: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
      ecommerce: { total: 9999, currency: 'INR' },
    },
  ];

  const cartRecovery = computeObservedCartRecovery(recoveryEvents, testWs, testSite, 60 * 60 * 1000);
  assert.strictEqual(cartRecovery.cartsCreated, 3); // cart-1, cart-2, cart-3 in testWs
  assert.strictEqual(cartRecovery.eligibleAbandonedCarts, 2); // cart-1 (still abandoned) and cart-2 (abandoned then recovered)
  assert.strictEqual(cartRecovery.verifiedRecoveredCarts, 1); // cart-2
  assert.strictEqual(cartRecovery.recoveryRatePercent, 50.0); // 1 / 2 = 50%
  assert.strictEqual(cartRecovery.recoveredRevenueByCurrency['INR'], 2500);

  // Cart Recovery Zero Denominator Guardrail
  const zeroRecovery = computeObservedCartRecovery([], testWs, testSite);
  assert.strictEqual(zeroRecovery.eligibleAbandonedCarts, 0);
  assert.strictEqual(zeroRecovery.verifiedRecoveredCarts, 0);
  assert.strictEqual(zeroRecovery.recoveryRatePercent, null);
  assert.strictEqual(zeroRecovery.status, 'INSUFFICIENT_DATA');

  // 4. Time-Series Forecasting: Missing Observations vs Zero-Purchase Days
  const sparseHistory = [
    { date: '2026-11-01', value: 100 },
    { date: '2026-11-02', value: 120 },
    { date: '2026-11-03', value: null }, // Missing day
    { date: '2026-11-04', value: 0, isVerifiedZero: true }, // Verified zero
  ];
  const sparseResult = evaluateAndForecastDailyMetric(sparseHistory, 7);
  assert.strictEqual(sparseResult.status, 'INSUFFICIENT_DATA');
  assert.strictEqual(sparseResult.validObservationsCount, 3); // 100, 120, and 0
  assert.strictEqual(sparseResult.missingDaysCount, 1);
  assert.strictEqual(sparseResult.forecastPoints.length, 0);

  // Incomplete Day Telemetry Guardrail
  const incompleteHistory: Array<{ date: string; value: number; isCompleteDay?: boolean }> = [];
  for (let i = 0; i < 30; i++) {
    incompleteHistory.push({
      date: `2026-10-${String(i + 1).padStart(2, '0')}`,
      value: 100,
      isCompleteDay: i !== 5, // Day 5 had tracking downtime
    });
  }
  const incompleteResult = evaluateAndForecastDailyMetric(incompleteHistory, 7);
  assert.strictEqual(incompleteResult.status, 'INCOMPLETE_DATA');
  assert.strictEqual(incompleteResult.validObservationsCount, 29);

  // 5. Time-Series Forecasting: 35 days continuous series (>= 28 days requirement)
  // Evaluates chronological holdout, dual baselines (Mean and Seasonal Naive), and MAE / WAPE
  const fullHistory: Array<{ date: string; value: number }> = [];
  const baseDate = new Date('2026-10-01');
  for (let i = 0; i < 35; i++) {
    const curDate = new Date(baseDate.getTime() + i * 86400 * 1000);
    // Weekly pattern: repeats every 7 days (100, 110, 120, 130, 140, 150, 160)
    const val = 100 + (i % 7) * 10;
    fullHistory.push({ date: curDate.toISOString().slice(0, 10), value: val });
  }

  const validatedResult = evaluateAndForecastDailyMetric(fullHistory, 7);
  assert.strictEqual(validatedResult.historicalDaysCount, 35);
  assert.strictEqual(validatedResult.validObservationsCount, 35);
  assert.strictEqual(validatedResult.testDaysCount, 7);
  assert.strictEqual(validatedResult.trainDaysCount, 28);
  assert.strictEqual(validatedResult.strongestBaseline, 'SEASONAL_NAIVE'); // Seasonal naive perfectly matches weekly cycle
  assert.strictEqual(validatedResult.seasonalNaiveMae, 0); // Exact match on test set
  assert.strictEqual(validatedResult.status, 'BASELINE_SUPERIOR'); // Since baseline MAE is 0, proposed model cannot beat it
  assert.ok(validatedResult.historicalMeanMae > 0);
  assert.strictEqual(validatedResult.forecastPoints.length, 7);

  // Zero actual test window: WAPE must be safely returned as null rather than NaN / Infinity
  const zeroTestHistory: Array<{ date: string; value: number }> = [];
  for (let i = 0; i < 28; i++) {
    zeroTestHistory.push({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, value: 50 });
  }
  for (let i = 0; i < 7; i++) {
    zeroTestHistory.push({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, value: 0 }); // 0 sales on all test days
  }
  const zeroWapeResult = evaluateAndForecastDailyMetric(zeroTestHistory, 7);
  assert.strictEqual(zeroWapeResult.baselineWape, null);
  assert.strictEqual(zeroWapeResult.proposedWape, null);

  // 6. PULSE-18.4.2 — Forecast Labelling, Temporal Ordering & Data Completeness Regressions
  // A. Disclaimers: no claim of statistical validation, scope strictly limited to holdout
  const superiorTrendHistory: Array<{ date: string; value: number }> = [];
  // Build a series where 7-day smoothing strictly beats both historical mean and seasonal naive
  // Upward trend where each week is higher, but day-to-day is smooth
  for (let i = 0; i < 35; i++) {
    const d = new Date(baseDate.getTime() + i * 86400 * 1000).toISOString().slice(0, 10);
    superiorTrendHistory.push({ date: d, value: 50 + i * 5 }); // 50, 55, 60, ...
  }
  const trendResult = evaluateAndForecastDailyMetric(superiorTrendHistory, 7);
  assert.strictEqual(trendResult.status, 'VALIDATED_AGAINST_BASELINE');
  assert.ok(trendResult.explanation.includes('tested 7-day chronological holdout window'));
  assert.ok(trendResult.explanation.includes('does not establish general predictive reliability'));
  assert.ok(trendResult.explanation.includes('does not constitute statistical validation'));

  // B. Calendar Gaps: 15 points spanning 45 calendar days (30 missing days)
  const gappedHistory: Array<{ date: string; value: number }> = [];
  for (let i = 0; i < 15; i++) {
    const d = new Date(baseDate.getTime() + i * 3 * 86400 * 1000).toISOString().slice(0, 10);
    gappedHistory.push({ date: d, value: 100 });
  }
  const gappedResult = evaluateAndForecastDailyMetric(gappedHistory, 7);
  assert.strictEqual(gappedResult.status, 'INSUFFICIENT_DATA');
  assert.strictEqual(gappedResult.validObservationsCount, 15);
  assert.ok(gappedResult.missingDaysCount >= 28); // Detected omitted calendar days

  // 7. PULSE-18.4.2 — Real-Shaped Normalized E-Commerce Fixtures & Cart Linkage
  // A. Real-shaped Shopify Webhook Fixtures
  const shopifyCheckoutPayload = {
    id: 88776655,
    token: 'sp_chk_token_alpha',
    cart_token: 'sp_cart_token_alpha',
    total_price: '4500.00',
    currency: 'INR',
    created_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    customer: { id: 701, email: 'buyer@shopify.test', first_name: 'Shopify', last_name: 'User' },
    line_items: [{ id: 1, title: 'Cotton Kurta', price: '4500.00', quantity: 1 }],
  };
  const normalizedShopifyCheckout = normalizeShopifyWebhook(
    'checkouts/create',
    shopifyCheckoutPayload,
    testWs,
    testSite
  );
  assert.strictEqual(normalizedShopifyCheckout.properties?.cartId, 'sp_cart_token_alpha');
  assert.strictEqual(normalizedShopifyCheckout.properties?.checkoutId, '88776655');

  const shopifyOrderPayload = {
    id: 99887766,
    order_number: 1089,
    cart_token: 'sp_cart_token_alpha',
    checkout_id: 88776655,
    total_price: '4500.00',
    currency: 'INR',
    created_at: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
    customer: { id: 701, email: 'buyer@shopify.test', first_name: 'Shopify', last_name: 'User' },
    line_items: [{ id: 1, title: 'Cotton Kurta', price: '4500.00', quantity: 1 }],
  };
  const normalizedShopifyOrder = normalizeShopifyWebhook(
    'orders/create',
    shopifyOrderPayload,
    testWs,
    testSite
  );
  assert.strictEqual(normalizedShopifyOrder.properties?.linkedCartId, 'sp_cart_token_alpha');
  assert.strictEqual(normalizedShopifyOrder.properties?.cartId, 'sp_cart_token_alpha');

  // B. Real-shaped WooCommerce Webhook Fixtures
  const wcOrderPendingPayload = {
    id: 3344,
    cart_hash: 'wc_cart_hash_bravo',
    order_key: 'wc_order_key_bravo',
    status: 'pending',
    total: '3200.00',
    currency: 'INR',
    date_created_gmt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    billing: { email: 'buyer@woo.test', first_name: 'Woo', last_name: 'Customer' },
    meta_data: [{ key: '_cart_hash', value: 'wc_cart_hash_bravo' }],
    line_items: [{ id: 11, name: 'Silk Stole', price: '3200.00', quantity: 1 }],
  };
  const normalizedWcPending = normalizeWooCommerceWebhook(
    'order.created',
    wcOrderPendingPayload,
    testWs,
    testSite
  );
  assert.strictEqual(normalizedWcPending.properties?.cartId, 'wc_cart_hash_bravo');
  assert.strictEqual(normalizedWcPending.properties?.linkedCartId, 'wc_cart_hash_bravo');

  const wcOrderCompletedPayload = {
    id: 3344,
    cart_hash: 'wc_cart_hash_bravo',
    order_key: 'wc_order_key_bravo',
    status: 'completed',
    total: '3200.00',
    currency: 'INR',
    date_created_gmt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    billing: { email: 'buyer@woo.test', first_name: 'Woo', last_name: 'Customer' },
    meta_data: [{ key: '_cart_hash', value: 'wc_cart_hash_bravo' }],
    line_items: [{ id: 11, name: 'Silk Stole', price: '3200.00', quantity: 1 }],
  };
  const normalizedWcCompleted = normalizeWooCommerceWebhook(
    'order.updated',
    wcOrderCompletedPayload,
    testWs,
    testSite
  );
  assert.strictEqual(normalizedWcCompleted.properties?.linkedCartId, 'wc_cart_hash_bravo');

  // C. Test End-to-End Observed Cart Recovery with real-shaped fixtures
  const ecomEvents = [
    {
      workspaceId: testWs,
      siteId: testSite,
      visitorId: 'vis-shopify-1',
      cartId: normalizedShopifyCheckout.properties?.cartId,
      checkoutId: normalizedShopifyCheckout.properties?.checkoutId,
      type: 'checkout_started',
      timestamp: normalizedShopifyCheckout.timestamp!,
      ecommerce: normalizedShopifyCheckout.ecommerce,
    },
    {
      workspaceId: testWs,
      siteId: testSite,
      visitorId: 'vis-shopify-1',
      linkedCartId: normalizedShopifyOrder.properties?.linkedCartId,
      type: 'purchase_completed',
      timestamp: normalizedShopifyOrder.timestamp!,
      ecommerce: normalizedShopifyOrder.ecommerce,
    },
    {
      workspaceId: testWs,
      siteId: testSite,
      visitorId: 'vis-wc-1',
      cartId: normalizedWcPending.properties?.cartId,
      checkoutId: normalizedWcPending.properties?.checkoutId,
      type: 'checkout_started',
      timestamp: normalizedWcPending.timestamp!,
      ecommerce: normalizedWcPending.ecommerce,
    },
    {
      workspaceId: testWs,
      siteId: testSite,
      visitorId: 'vis-wc-1',
      linkedCartId: normalizedWcCompleted.properties?.linkedCartId,
      type: 'purchase_completed',
      timestamp: normalizedWcCompleted.timestamp!,
      ecommerce: normalizedWcCompleted.ecommerce,
    },
  ];
  const ecomRecovery = computeObservedCartRecovery(ecomEvents, testWs, testSite, 60 * 60 * 1000);
  assert.strictEqual(ecomRecovery.status, 'OBSERVED');
  assert.strictEqual(ecomRecovery.cartsCreated, 2);
  assert.strictEqual(ecomRecovery.eligibleAbandonedCarts, 2);
  assert.strictEqual(ecomRecovery.verifiedRecoveredCarts, 2);
  assert.strictEqual(ecomRecovery.recoveryRatePercent, 100.0);
  assert.strictEqual(ecomRecovery.recoveredRevenueByCurrency['INR'], 7700);

  // D. Unlinked Orders: telemetry with abandoned carts but unlinked purchases must return INSUFFICIENT_DATA
  const unlinkedEvents = [
    {
      workspaceId: testWs,
      siteId: testSite,
      visitorId: 'vis-unlinked-1',
      cartId: 'cart-abandoned-unlinked',
      type: 'item_added_to_cart',
      timestamp: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
      ecommerce: { total: 2000, currency: 'INR' },
    },
    {
      workspaceId: testWs,
      siteId: testSite,
      visitorId: 'vis-unlinked-2',
      // No linkedCartId provided on purchase event!
      type: 'purchase_completed',
      timestamp: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
      ecommerce: { total: 5000, currency: 'INR', orderId: 'ord-unlinked-99' },
    },
  ];
  const unlinkedResult = computeObservedCartRecovery(unlinkedEvents, testWs, testSite, 60 * 60 * 1000);
  assert.strictEqual(unlinkedResult.status, 'INSUFFICIENT_DATA');
  assert.strictEqual(unlinkedResult.recoveryRatePercent, null);
  assert.strictEqual(unlinkedResult.verifiedRecoveredCarts, 0);
  assert.ok(unlinkedResult.explanation.includes('Reliable cart-to-order linkage is unavailable'));
});
});

