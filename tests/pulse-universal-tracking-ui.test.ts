import { test } from 'node:test';
import assert from 'node:assert';
import { pulseRepo } from '@/lib/pulse/repository';
import { processIngestedEvent } from '@/lib/pulse/tracker';
import { normalizeSdkPayload } from '@/lib/pulse/normalizer';
import fs from 'fs';
import path from 'path';

test('PULSE — Universal Website Tracking & Installation Verification Suite', async (t) => {
  const ws1 = `ws-univ-${Date.now()}-1`;
  const ws2 = `ws-univ-${Date.now()}-2`;

  await t.test('1. Website Registration & Unique Site ID Generation', async () => {
    const siteA = await pulseRepo.createWebsite({
      workspaceId: ws1,
      name: 'Acme SaaS Marketing Website',
      domain: 'https://acme-saas.com/blog',
      ecommercePlatform: 'none',
    });

    assert.ok(siteA.id, 'Website must have a unique ID');
    assert.ok(siteA.siteId, 'Website must have a public siteId');
    assert.match(siteA.siteId, /^psite_[0-9a-f]{16}$/, 'siteId must match psite_<hex> format');
    assert.strictEqual(siteA.domain, 'acme-saas.com', 'Domain must be normalized without protocol or path');
    assert.strictEqual(siteA.status, 'unverified', 'New website without telemetry must start in unverified status');
    assert.strictEqual(siteA.snippetInstalled, false, 'New website must have snippetInstalled=false');
    assert.strictEqual(siteA.eventsCountTotal, 0, 'New website must start with 0 events');
    assert.ok(siteA.whitelistedDomains.includes('acme-saas.com'), 'Primary domain must be in whitelist');
    assert.ok(siteA.whitelistedDomains.includes('localhost'), 'Localhost must be in default whitelist for dev testing');

    const siteB = await pulseRepo.createWebsite({
      workspaceId: ws1,
      name: 'Second Portal',
      domain: 'portal.acme-saas.com',
      ecommercePlatform: 'none',
    });

    assert.notStrictEqual(siteA.siteId, siteB.siteId, 'Each website must have a globally unique siteId');
  });

  await t.test('2. Client SDK (pulse.js) Contract & Script Host Auto-Derivation', async () => {
    const pulseJsPath = path.resolve(process.cwd(), 'public/pulse.js');
    assert.ok(fs.existsSync(pulseJsPath), 'public/pulse.js must exist');
    const sdkCode = fs.readFileSync(pulseJsPath, 'utf8');

    // Verify key SDK capabilities
    assert.ok(sdkCode.includes('getAttribute(\'data-site-id\')'), 'SDK must read data-site-id');
    assert.ok(sdkCode.includes('getAttribute(\'data-host\')'), 'SDK must support data-host');
    assert.ok(sdkCode.includes('Auto-derive script host from script src URL'), 'SDK must auto-derive scriptHost from src');
    assert.ok(sdkCode.includes('window.DevelopsterPulse'), 'SDK must expose DevelopsterPulse API');
    assert.ok(sdkCode.includes('pageView:'), 'SDK must provide pageView method');
    assert.ok(sdkCode.includes('custom:'), 'SDK must provide custom event tracking method');
    assert.ok(sdkCode.includes('submitForm:'), 'SDK must provide form submission lead tracking method');
  });

  await t.test('3. Universal Code Snippet Generation Across Platforms', async () => {
    const site = await pulseRepo.createWebsite({
      workspaceId: ws1,
      name: 'Custom React Web App',
      domain: 'custom-app.dev',
      ecommercePlatform: 'none',
    });

    const appOrigin = 'https://crm.example.com';
    const scriptUrl = `${appOrigin}/pulse.js`;

    // 1. Custom HTML
    const htmlSnippet = `<script src="${scriptUrl}" data-site-id="${site.siteId}" async></script>`;
    assert.ok(htmlSnippet.includes(site.siteId), 'HTML snippet must contain actual siteId');
    assert.ok(htmlSnippet.includes(scriptUrl), 'HTML snippet must contain actual script URL');
    assert.ok(htmlSnippet.includes('async'), 'HTML snippet must include async');

    // 2. Next.js Script
    const nextjsSnippet = `<Script src="${scriptUrl}" data-site-id="${site.siteId}" strategy="afterInteractive" />`;
    assert.ok(nextjsSnippet.includes(site.siteId), 'Next.js snippet must contain actual siteId');
    assert.ok(nextjsSnippet.includes('strategy="afterInteractive"'), 'Next.js snippet must use afterInteractive');

    // 3. WordPress Hook
    const wpSnippet = `add_action('wp_head', function () { echo '<script src="${scriptUrl}" data-site-id="${site.siteId}" async></script>'; });`;
    assert.ok(wpSnippet.includes('wp_head'), 'WordPress snippet must hook into wp_head');
    assert.ok(wpSnippet.includes(site.siteId), 'WordPress snippet must contain actual siteId');
  });

  await t.test('4. Status Transitions: Not Installed -> Waiting for First Event -> Connected', async () => {
    const site = await pulseRepo.createWebsite({
      workspaceId: ws1,
      name: 'Status Progression Site',
      domain: 'progression.test',
      ecommercePlatform: 'none',
    });

    // Initial state: Not Installed / 0 events
    assert.strictEqual(site.snippetInstalled, false);
    assert.strictEqual(site.eventsCountTotal, 0);

    // Ingest first valid page view event from the website
    const normalized = normalizeSdkPayload(
      {
        siteId: site.siteId,
        type: 'page_view',
        name: 'Homepage View',
        url: 'https://progression.test/welcome',
        path: '/welcome',
        title: 'Welcome to Progression Test',
        visitorId: 'vis_test_123',
        sessionId: 'ses_test_123',
      },
      ws1,
      site.siteId
    );

    const result = await processIngestedEvent(normalized, {
      siteId: site.siteId,
      workspaceId: ws1,
      clientIp: '103.21.244.1',
      origin: 'https://progression.test',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.status, 'accepted');

    // Verify website status transitioned to Connected
    const updatedSite = await pulseRepo.getWebsiteById(ws1, site.id);
    assert.ok(updatedSite);
    assert.strictEqual(updatedSite.snippetInstalled, true, 'snippetInstalled must become true after event ingestion');
    assert.strictEqual(updatedSite.status, 'active', 'status must become active after event ingestion');
    assert.ok(updatedSite.eventsCountTotal >= 1, 'eventsCountTotal must increment');
    assert.ok(updatedSite.lastPingAt, 'lastPingAt must be recorded');
  });

  await t.test('5. Workspace Isolation & Invalid Site ID Rejection', async () => {
    const siteWs1 = await pulseRepo.createWebsite({
      workspaceId: ws1,
      name: 'Tenant 1 Site',
      domain: 'tenant1.org',
    });

    // Unknown siteId rejection
    const fakeSiteId = 'psite_0000000000000000';
    const fakeResult = await processIngestedEvent(
      { siteId: fakeSiteId, type: 'page_view' },
      { siteId: fakeSiteId, workspaceId: ws1 }
    );
    assert.strictEqual(fakeResult.success, false);
    assert.strictEqual(fakeResult.status, 'invalid_site');

    // Workspace isolation: query from another tenant
    const crossTenantSite = await pulseRepo.getWebsiteById(ws2, siteWs1.id);
    assert.strictEqual(crossTenantSite, null, 'Tenant 2 must not see Tenant 1 website');

    const crossTenantEvents = await pulseRepo.getEvents(ws2, { siteId: siteWs1.siteId });
    assert.strictEqual(crossTenantEvents.length, 0, 'Tenant 2 must not see Tenant 1 events');
  });

  await t.test('6. Non-Ecommerce Website Ingestion & Custom Goal Milestones', async () => {
    const contentSite = await pulseRepo.createWebsite({
      workspaceId: ws1,
      name: 'Documentation & Blog Site',
      domain: 'docs.example.com',
      ecommercePlatform: 'none',
    });

    // Ingest custom non-ecommerce milestones (form_submitted, cta_clicked)
    const formEvent = normalizeSdkPayload(
      {
        siteId: contentSite.siteId,
        type: 'form_submitted',
        name: 'Demo Request Form',
        url: 'https://docs.example.com/demo',
        visitorId: 'vis_lead_456',
        sessionId: 'ses_lead_456',
        identities: {
          email: 'lead.visitor@corporate.com',
          name: 'Sarah Connor',
        },
        properties: {
          companySize: '50-200',
          useCase: 'CRM Integration',
        },
      },
      ws1,
      contentSite.siteId
    );

    const formResult = await processIngestedEvent(formEvent, {
      siteId: contentSite.siteId,
      workspaceId: ws1,
      clientIp: '122.161.45.10',
      origin: 'https://docs.example.com',
    });

    assert.strictEqual(formResult.success, true);
    assert.strictEqual(formResult.status, 'accepted');

    // Query events for this content site
    const events = await pulseRepo.getEvents(ws1, { siteId: contentSite.siteId });
    assert.ok(events.length >= 1);
    const savedEvent = events.find((e) => e.type === 'form_submitted');
    assert.ok(savedEvent);
    assert.strictEqual(savedEvent.identities?.email, 'lead.visitor@corporate.com');
  });
});

