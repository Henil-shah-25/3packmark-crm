import test from 'node:test';
import assert from 'node:assert/strict';
import { isGoogleSheetsConfigured } from '../src/lib/google-sheets/config';
import { googleSheetsClient } from '../src/lib/google-sheets/client';
import { pulseRepo } from '../src/lib/pulse/repository';
import { SHEET_NAMES } from '../src/lib/google-sheets/schema';

test('PULSE-18.5 Live Google Sheets Integration & Verification', async (t) => {
  const configured = isGoogleSheetsConfigured();
  if (!configured) {
    console.warn('[PULSE-18.5] Google Sheets is not configured in environment. Skipping live tests.');
    return;
  }

  // Use a unique, dedicated test workspace to avoid touching real data
  const testWorkspaceId = `ws-live-test-${Date.now()}`;
  let createdWebsiteId = '';
  let createdWebsiteSiteId = '';
  let createdFunnelId = '';
  let createdSegmentId = '';

  await t.test('1. Database Connection & Schema Health', async () => {
    const isConn = await googleSheetsClient.testConnection();
    assert.ok(isConn, 'Google Sheets client connection must succeed');
    assert.equal(isConn.success, true);
    assert.equal(typeof isConn.title, 'string');
    assert.ok(Array.isArray(isConn.sheets));
    assert.ok(isConn.sheets.includes(SHEET_NAMES.PULSE_WEBSITES));
    assert.ok(isConn.sheets.includes(SHEET_NAMES.PULSE_FUNNELS));
    assert.ok(isConn.sheets.includes(SHEET_NAMES.PULSE_SEGMENTS));
    assert.ok(isConn.sheets.includes(SHEET_NAMES.PULSE_EVENTS));
    assert.ok(isConn.sheets.includes(SHEET_NAMES.PULSE_DAILY_ROLLUPS));

    const initResult = await googleSheetsClient.initializeDatabase();
    assert.ok(Array.isArray(initResult.existingSheets), 'existingSheets must be an array');
    assert.ok(Array.isArray(initResult.createdSheets), 'createdSheets must be an array');
  });

  await t.test('2. Websites CRUD (PulseWebsites Tab)', async () => {
    // A. Create website
    const site = await pulseRepo.createWebsite(testWorkspaceId, {
      name: 'Live Test E-Commerce Store',
      domain: 'test-store.example.com',
      whitelistedDomains: ['test-store.example.com', 'checkout.test-store.example.com'],
      ecommercePlatform: 'shopify'
    });

    assert.ok(site.id, 'Website ID must be returned');
    assert.ok(site.siteId, 'System generated siteId must exist');
    assert.equal(site.workspaceId, testWorkspaceId);
    assert.equal(site.domain, 'test-store.example.com');
    assert.equal(site.ecommercePlatform, 'shopify');
    createdWebsiteId = site.id;
    createdWebsiteSiteId = site.siteId;

    // B. Read back from Google Sheets by siteId
    const fetched = await pulseRepo.getWebsiteBySiteId(site.siteId);
    assert.ok(fetched, 'Created website must be readable by siteId');
    assert.equal(fetched.id, site.id);
    assert.equal(fetched.workspaceId, testWorkspaceId);
    assert.ok(Array.isArray(fetched.whitelistedDomains));
    assert.ok(fetched.whitelistedDomains.includes('checkout.test-store.example.com'));

    // C. Update in Google Sheets
    const updated = await pulseRepo.updateWebsite(testWorkspaceId, site.id, {
      ecommercePlatform: 'woocommerce'
    });
    assert.ok(updated, 'Website update must succeed');
    assert.equal(updated.ecommercePlatform, 'woocommerce');

    // D. Verify persistence of update
    const fetchedUpdated = await pulseRepo.getWebsiteById(testWorkspaceId, site.id);
    assert.equal(fetchedUpdated?.ecommercePlatform, 'woocommerce');
  });

  await t.test('3. Funnels CRUD (PulseFunnels Tab)', async () => {
    // A. Create Funnel
    const funnel = await pulseRepo.saveFunnel(testWorkspaceId, {
      name: 'Live Checkout Funnel',
      siteId: createdWebsiteSiteId,
      description: 'End-to-end checkout funnel test',
      timeWindowHours: 12,
      steps: [
        { id: 'step-1', name: 'Product View', eventType: 'pageview', pathFilter: '/products' },
        { id: 'step-2', name: 'Add to Cart', eventType: 'cart_updated' },
        { id: 'step-3', name: 'Checkout Completed', eventType: 'purchase_completed' }
      ]
    });

    assert.ok(funnel.id, 'Funnel ID must be generated');
    assert.equal(funnel.workspaceId, testWorkspaceId);
    assert.equal(funnel.steps.length, 3);
    createdFunnelId = funnel.id;

    // B. Read back from Google Sheets
    const funnels = await pulseRepo.getFunnels(testWorkspaceId);
    const found = funnels.find(f => f.id === funnel.id);
    assert.ok(found, 'Created funnel must be retrievable from Google Sheets');
    assert.equal(found.name, 'Live Checkout Funnel');
    assert.equal(found.steps.length, 3);
    assert.equal(found.steps[0].id, 'step-1');

    // C. Workspace isolation check
    const otherFunnels = await pulseRepo.getFunnels('ws-other-isolated-tenant');
    assert.equal(otherFunnels.some(f => f.id === funnel.id), false, 'Funnel must not leak across workspaces');
  });

  await t.test('4. Segments CRUD (PulseSegments Tab)', async () => {
    // A. Create Segment
    const segment = await pulseRepo.saveSegment(testWorkspaceId, {
      name: 'High Value Customers',
      siteId: createdWebsiteSiteId,
      description: 'Customers with over $500 total spend',
      color: '#10B981',
      matchType: 'ALL',
      rules: [
        { field: 'totalRevenue', operator: 'gte', value: 500 }
      ],
      syncCustomerTags: true,
      crmTag: 'pulse:vip-shopper'
    });

    assert.ok(segment.id, 'Segment ID must be generated');
    assert.equal(segment.workspaceId, testWorkspaceId);
    assert.equal(segment.crmTag, 'pulse:vip-shopper');
    createdSegmentId = segment.id;

    // B. Read back from Google Sheets
    const segments = await pulseRepo.getSegments(testWorkspaceId);
    const found = segments.find(s => s.id === segment.id);
    assert.ok(found, 'Created segment must be retrievable from Google Sheets');
    assert.equal(found.name, 'High Value Customers');
    assert.equal(found.rules.length, 1);
    assert.equal(found.rules[0].field, 'totalRevenue');

    // C. Workspace isolation check
    const otherSegments = await pulseRepo.getSegments('ws-other-isolated-tenant');
    assert.equal(otherSegments.some(s => s.id === segment.id), false, 'Segment must not leak across workspaces');
  });

  await t.test('5. Business Event Persistence & Duplicate Prevention (PulseEvents Tab)', async () => {
    const eventTime = new Date('2026-11-10T14:30:00Z').toISOString();
    const eventId = `evt-live-${Date.now()}`;
    const cartId = `cart-live-${Date.now()}`;
    const orderId = `order-live-${Date.now()}`;

    // A. Append Cart Updated Event
    const cartEvt = await pulseRepo.recordBusinessEvent({
      id: `${eventId}-cart`,
      workspaceId: testWorkspaceId,
      siteId: createdWebsiteSiteId,
      platform: 'shopify',
      sourceEventId: `sh-evt-cart-${Date.now()}`,
      eventType: 'cart_updated',
      occurredAt: eventTime,
      processedAt: new Date().toISOString(),
      customerId: 'cust-shopper-1',
      amount: 120.50,
      currency: 'USD',
      metadata: { itemsCount: 2, cartId }
    });
    assert.equal(cartEvt.isDuplicate, false, 'Cart business event append must succeed and not be marked duplicate');

    // B. Append Purchase Completed Event
    const sourceOrderId = `sh-evt-purch-${Date.now()}`;
    const purchaseEvt = await pulseRepo.recordBusinessEvent({
      id: `${eventId}-purchase`,
      workspaceId: testWorkspaceId,
      siteId: createdWebsiteSiteId,
      platform: 'shopify',
      sourceEventId: sourceOrderId,
      eventType: 'purchase_completed',
      occurredAt: new Date('2026-11-10T15:00:00Z').toISOString(),
      processedAt: new Date().toISOString(),
      customerId: 'cust-shopper-1',
      orderId: orderId,
      amount: 120.50,
      currency: 'USD',
      metadata: { gateway: 'stripe', cartId }
    });
    assert.equal(purchaseEvt.isDuplicate, false, 'Purchase business event append must succeed and not be marked duplicate');

    // C. Duplicate Rejection Test: Re-submitting same platform + sourceEventId
    const dupResult = await pulseRepo.recordBusinessEvent({
      id: `${eventId}-dup`,
      workspaceId: testWorkspaceId,
      siteId: createdWebsiteSiteId,
      platform: 'shopify',
      sourceEventId: sourceOrderId, // exact duplicate of purchase event above
      eventType: 'purchase_completed',
      occurredAt: new Date('2026-11-10T15:00:00Z').toISOString(),
      processedAt: new Date().toISOString(),
      customerId: 'cust-shopper-1',
      amount: 120.50,
      currency: 'USD'
    });
    assert.equal(dupResult.isDuplicate, true, 'Duplicate sourceEventId must be rejected idempotently');

    // D. Read back business events from Google Sheets
    const fetchedEvents = await pulseRepo.getBusinessEvents(testWorkspaceId, { siteId: createdWebsiteSiteId });
    assert.ok(fetchedEvents.length >= 2, 'Persisted events must be queryable by workspace and site');
    const readCart = fetchedEvents.find(e => e.id === `${eventId}-cart`);
    const readPurchase = fetchedEvents.find(e => e.id === `${eventId}-purchase`);
    assert.ok(readCart, 'Cart event must exist in Google Sheets');
    assert.ok(readPurchase, 'Purchase event must exist in Google Sheets');
    assert.equal(readPurchase.orderId, orderId);
    assert.equal(readPurchase.amount, 120.50);
    assert.equal(readPurchase.currency, 'USD');
  });

  await t.test('6. Daily Aggregate Rollups Generation & Querying (PulseDailyRollups Tab)', async () => {
    // Generate daily rollup for the test workspace
    const rollups = await pulseRepo.generateDailyRollups(testWorkspaceId, {
      lookbackDays: 30
    });

    assert.ok(Array.isArray(rollups), 'Rollups array must be returned');
    assert.ok(rollups.length >= 1, 'At least 1 rollup record must be created');

    const dayRollup = rollups.find(r => r.siteId === createdWebsiteSiteId && r.date === '2026-11-10' && r.currency === 'USD');
    assert.ok(dayRollup, 'USD rollup for 2026-11-10 must exist in generated results');
    assert.equal(dayRollup.eventCount, 1);
    assert.equal(dayRollup.totalRevenue, 120.50);

    // Read back rollups directly from Google Sheets via getDailyRollups
    const fetchedRollups = await pulseRepo.getDailyRollups(testWorkspaceId, {
      siteId: createdWebsiteSiteId,
      currency: 'USD'
    });

    assert.ok(fetchedRollups.length >= 1, 'Daily rollup must be returned from Google Sheets');
    const foundDay = fetchedRollups.find(r => r.date === '2026-11-10');
    assert.ok(foundDay, 'Rollup record for 2026-11-10 must be found in Google Sheets');
    assert.equal(foundDay.totalRevenue, 120.50);

    // Idempotency: Re-running generateDailyRollups must update, not create duplicate rows
    const rollupsRerun = await pulseRepo.generateDailyRollups(testWorkspaceId, {
      lookbackDays: 30
    });
    const foundRerun = rollupsRerun.find(r => r.id === dayRollup.id);
    assert.ok(foundRerun, 'Rerun rollup must exist');
    assert.equal(foundRerun.version, (dayRollup.version || 1) + 1, 'Version must increment on re-write');

    const allSheetRollups = await pulseRepo.getDailyRollups(testWorkspaceId, {
      siteId: createdWebsiteSiteId,
      currency: 'USD'
    });
    const identicalRows = allSheetRollups.filter(r => r.id === dayRollup.id);
    assert.equal(identicalRows.length, 1, 'Rollup upsert must be idempotent with exactly 1 row per id in Google Sheets');
  });

  await t.test('7. Overview Metrics Calculation & Store Operation', async () => {
    const overview = await pulseRepo.getPulseOverviewMetrics(testWorkspaceId, {
      period: '30d'
    });

    assert.ok(overview, 'Overview metrics must return a valid object');
    assert.equal(typeof overview.totalSessions, 'number');
    assert.equal(typeof overview.uniqueVisitors, 'number');
    assert.equal(typeof overview.conversionRate, 'string');
    assert.ok(Array.isArray(overview.actionableInsights));
  });

  await t.test('8. Error Handling & Zero Silent Fallback', async () => {
    const origIsReady = googleSheetsClient.isReady;
    try {
      googleSheetsClient.isReady = () => false;

      await assert.rejects(
        async () => {
          await pulseRepo.getWebsites(testWorkspaceId);
        },
        /Google Sheets database is configured but client failed to connect/i,
        'Websites query must fail explicitly without fallback'
      );

      await assert.rejects(
        async () => {
          await pulseRepo.getFunnels(testWorkspaceId);
        },
        /Google Sheets database is configured but client failed to connect/i,
        'Funnels query must fail explicitly without fallback'
      );

      await assert.rejects(
        async () => {
          await pulseRepo.getSegments(testWorkspaceId);
        },
        /Google Sheets database is configured but client failed to connect/i,
        'Segments query must fail explicitly without fallback'
      );

      await assert.rejects(
        async () => {
          await pulseRepo.getBusinessEvents(testWorkspaceId);
        },
        /Google Sheets database is configured but client failed to connect/i,
        'Business events query must fail explicitly without fallback'
      );
    } finally {
      googleSheetsClient.isReady = origIsReady;
    }
  });

  await t.test('9. Clean Up Test Records Only', async () => {
    // Clean up created website, funnel, and segment from Google Sheets
    if (createdWebsiteId) {
      const delWeb = await pulseRepo.deleteWebsite(testWorkspaceId, createdWebsiteId);
      assert.equal(delWeb, true, 'Test website row must be cleanly deleted');
    }
    if (createdFunnelId) {
      const delFnl = await pulseRepo.deleteFunnel(testWorkspaceId, createdFunnelId);
      assert.equal(delFnl, true, 'Test funnel row must be cleanly deleted');
    }
    if (createdSegmentId) {
      const delSeg = await pulseRepo.deleteSegment(testWorkspaceId, createdSegmentId);
      assert.equal(delSeg, true, 'Test segment row must be cleanly deleted');
    }

    // Verify deletion in Google Sheets
    const finalWebsites = await pulseRepo.getWebsites(testWorkspaceId);
    assert.equal(finalWebsites.some(w => w.id === createdWebsiteId), false);

    const finalFunnels = await pulseRepo.getFunnels(testWorkspaceId);
    assert.equal(finalFunnels.some(f => f.id === createdFunnelId), false);

    const finalSegments = await pulseRepo.getSegments(testWorkspaceId);
    assert.equal(finalSegments.some(s => s.id === createdSegmentId), false);
  });
});
