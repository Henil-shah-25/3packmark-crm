import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateLeadScore,
  calculateLeadScoreFromMetrics,
  getTemperatureTier,
  isHighIntentPage,
  DirectScoringMetrics,
} from '../src/lib/scoring/lead-scorer';
import { sanitizeLead } from '../src/lib/financial';
import { SHEET_HEADERS, SHEET_NAMES } from '../src/lib/google-sheets/schema';
import { Lead, Activity, EmailLog } from '../src/types/crm';
import { PulseEvent } from '../src/types/pulse';

test('Lead Scoring: Temperature tiers match exact thresholds', () => {
  assert.equal(getTemperatureTier(0), 'COLD');
  assert.equal(getTemperatureTier(29), 'COLD');
  assert.equal(getTemperatureTier(30), 'WARM');
  assert.equal(getTemperatureTier(69), 'WARM');
  assert.equal(getTemperatureTier(70), 'HOT');
  assert.equal(getTemperatureTier(100), 'HOT');
});

test('Lead Scoring: High-intent URL detection works accurately', () => {
  assert.equal(isHighIntentPage('/pricing'), true);
  assert.equal(isHighIntentPage('https://example.com/pricing-plans'), true);
  assert.equal(isHighIntentPage('/products/enterprise'), true);
  assert.equal(isHighIntentPage('/demo'), true);
  assert.equal(isHighIntentPage('/quote'), true);
  assert.equal(isHighIntentPage('/checkout/step1'), true);
  assert.equal(isHighIntentPage('/cart'), true);
  assert.equal(isHighIntentPage('/blog/article-1'), false);
  assert.equal(isHighIntentPage('/about-us'), false);
  assert.equal(isHighIntentPage(undefined), false);
});

test('Lead Scoring: Cold lead with zero engagement receives 0 points and COLD tier', () => {
  const metrics: DirectScoringMetrics = {
    emailOpens: 0,
    emailClicks: 0,
    websiteVisits: 0,
    highIntentPageViews: 0,
    connectedCalls: 0,
    daysSinceLastActivity: 0,
  };

  const result = calculateLeadScoreFromMetrics(metrics);
  assert.equal(result.score, 0);
  assert.equal(result.temperature, 'COLD');
  assert.equal(result.breakdown.rawScore, 0);
  assert.equal(result.breakdown.decay, 0);
  assert.ok(result.reasons.length > 0);
  assert.ok(result.reasons[0].includes('Cold lead'));
});

test('Lead Scoring: Email engagement is correctly weighted and capped at 25', () => {
  // 1 open = 5 pts
  const r1 = calculateLeadScoreFromMetrics({ emailOpens: 1, daysSinceLastActivity: 0 });
  assert.equal(r1.score, 5);
  assert.equal(r1.breakdown.email, 5);
  assert.equal(r1.temperature, 'COLD');

  // 3 opens (15 pts) + 1 click (10 pts) = 25 pts (cap 25)
  const r2 = calculateLeadScoreFromMetrics({ emailOpens: 3, emailClicks: 1, daysSinceLastActivity: 0 });
  assert.equal(r2.score, 25);
  assert.equal(r2.breakdown.email, 25);

  // 10 opens + 10 clicks = still capped at 25 pts
  const r3 = calculateLeadScoreFromMetrics({ emailOpens: 10, emailClicks: 10, daysSinceLastActivity: 0 });
  assert.equal(r3.score, 25);
  assert.equal(r3.breakdown.email, 25);
});

test('Lead Scoring: Pulse website engagement is correctly weighted and capped at 30', () => {
  // 2 visits (10 pts) + 2 high-intent (15 pts cap) + repeat days (10 pts) = 30 pts (cap 30)
  const r1 = calculateLeadScoreFromMetrics({
    websiteVisits: 2,
    highIntentPageViews: 2,
    repeatVisitDays: 3,
    daysSinceLastActivity: 0,
  });

  assert.equal(r1.score, 30);
  assert.equal(r1.breakdown.website, 30);
  assert.equal(r1.temperature, 'WARM');
});

test('Lead Scoring: WhatsApp & SMS engagement is correctly weighted and capped at 25', () => {
  // Delivery (5) + Click (10) + Reply (15) = 30 raw, capped at 25
  const r1 = calculateLeadScoreFromMetrics({
    whatsappDeliveredOrRead: true,
    whatsappLinkClicked: true,
    whatsappInboundReply: true,
    daysSinceLastActivity: 0,
  });

  assert.equal(r1.score, 25);
  assert.equal(r1.breakdown.messaging, 25);
});

test('Lead Scoring: Call logs award duration threshold bonuses', () => {
  // Call connected (<30s) = 5 pts
  const rShort = calculateLeadScoreFromMetrics({ connectedCalls: 1, longestCallSeconds: 20, daysSinceLastActivity: 0 });
  assert.equal(rShort.score, 5);
  assert.equal(rShort.breakdown.calls, 5);

  // Call connected (>30s) = 5 base + 5 duration = 10 pts
  const rMed = calculateLeadScoreFromMetrics({ connectedCalls: 1, longestCallSeconds: 45, daysSinceLastActivity: 0 });
  assert.equal(rMed.score, 10);
  assert.equal(rMed.breakdown.calls, 10);

  // Call connected (>60s) = 5 base + 10 duration = 15 pts
  const rLong = calculateLeadScoreFromMetrics({ connectedCalls: 1, longestCallSeconds: 90, daysSinceLastActivity: 0 });
  assert.equal(rLong.score, 15);
  assert.equal(rLong.breakdown.calls, 15);

  // Call connected (>180s) = 5 base + 15 duration = 20 pts
  const rVeryLong = calculateLeadScoreFromMetrics({ connectedCalls: 1, longestCallSeconds: 240, daysSinceLastActivity: 0 });
  assert.equal(rVeryLong.score, 20);
  assert.equal(rVeryLong.breakdown.calls, 20);
});

test('Lead Scoring: High multi-channel engagement reaches HOT tier (70..100)', () => {
  // Email (25) + Website (30) + WhatsApp Reply (25) + Connected Call >180s (20) = 100
  const rHot = calculateLeadScoreFromMetrics({
    emailOpens: 3,
    emailClicks: 2,
    websiteVisits: 2,
    highIntentPageViews: 2,
    repeatVisitDays: 2,
    whatsappDeliveredOrRead: true,
    whatsappLinkClicked: true,
    whatsappInboundReply: true,
    connectedCalls: 1,
    longestCallSeconds: 200,
    daysSinceLastActivity: 1, // Fresh
  });

  assert.equal(rHot.score, 100);
  assert.equal(rHot.temperature, 'HOT');
  assert.ok(rHot.reasons.length >= 4);
});

test('Lead Scoring: Recency decay reduces score when inactive', () => {
  const baseMetrics = {
    emailOpens: 3, // 15
    emailClicks: 1, // 10 -> email 25
    websiteVisits: 2, // 10
    highIntentPageViews: 1, // 10 -> website 20
    whatsappInboundReply: true, // 15
    connectedCalls: 1,
    longestCallSeconds: 120, // 15 -> call 15
    // Raw score = 25 + 20 + 15 + 15 = 75 (HOT)
  };

  // Active (within 7d): 0 decay -> 75 (HOT)
  const rFresh = calculateLeadScoreFromMetrics({ ...baseMetrics, daysSinceLastActivity: 3 });
  assert.equal(rFresh.score, 75);
  assert.equal(rFresh.temperature, 'HOT');
  assert.equal(rFresh.breakdown.decay, 0);

  // Inactive 10d (>7d): -10 decay -> 65 (WARM)
  const r7d = calculateLeadScoreFromMetrics({ ...baseMetrics, daysSinceLastActivity: 10 });
  assert.equal(r7d.score, 65);
  assert.equal(r7d.temperature, 'WARM');
  assert.equal(r7d.breakdown.decay, 10);

  // Inactive 20d (>14d): -20 decay -> 55 (WARM)
  const r14d = calculateLeadScoreFromMetrics({ ...baseMetrics, daysSinceLastActivity: 20 });
  assert.equal(r14d.score, 55);
  assert.equal(r14d.temperature, 'WARM');
  assert.equal(r14d.breakdown.decay, 20);

  // Inactive 40d (>30d): -35 decay -> 40 (WARM)
  const r30d = calculateLeadScoreFromMetrics({ ...baseMetrics, daysSinceLastActivity: 40 });
  assert.equal(r30d.score, 40);
  assert.equal(r30d.temperature, 'WARM');
  assert.equal(r30d.breakdown.decay, 35);
});

test('Lead Scoring: Decay cannot reduce score below 0', () => {
  const r = calculateLeadScoreFromMetrics({
    emailOpens: 1, // 5 pts
    daysSinceLastActivity: 60, // -35 pts decay
  });

  assert.equal(r.score, 0);
  assert.equal(r.temperature, 'COLD');
});

test('Lead Scoring: Full context scoring from CRM Lead, Activities, and Pulse Events', () => {
  const refDate = '2026-11-20T12:00:00.000Z';
  const lead: Lead = {
    id: 'lead-test-001',
    workspaceId: 'ws-test',
    title: 'Enterprise CRM Evaluation',
    contactName: 'Alice Developer',
    email: 'alice@developster.io',
    company: 'Developster Enterprise',
    value: 500000,
    pipelineId: 'pipe-1',
    stageId: 'lead_captured',
    ownerId: 'user-1',
    priority: 'High',
    status: 'Lead',
    source: 'Website',
    expectedCloseDate: '2026-12-31',
    closingProbability: 50,
    tags: ['enterprise'],
    createdAt: '2026-11-15T09:00:00.000Z',
    updatedAt: '2026-11-19T10:00:00.000Z', // 1.08 days ago relative to refDate
  };

  const activities: Activity[] = [
    {
      id: 'act-1',
      workspaceId: 'ws-test',
      leadId: 'lead-test-001',
      type: 'email',
      title: 'Marketing Email Opened',
      description: 'Opened Q4 Feature Update',
      authorName: 'System',
      metadata: { opened: true },
      createdAt: '2026-11-18T10:00:00.000Z',
    },
    {
      id: 'act-2',
      workspaceId: 'ws-test',
      leadId: 'lead-test-001',
      type: 'whatsapp',
      title: 'Inbound WhatsApp Reply',
      description: 'Can we schedule a live product demo tomorrow?',
      authorName: 'Customer',
      metadata: { direction: 'inbound', inbound: true },
      createdAt: '2026-11-19T14:00:00.000Z',
    },
    {
      id: 'act-3',
      workspaceId: 'ws-test',
      leadId: 'lead-test-001',
      type: 'call',
      title: 'Discovery Call',
      description: 'Discussed requirements with engineering head',
      authorName: 'Sales Rep',
      metadata: { status: 'connected', duration: 195 }, // >180s duration
      createdAt: '2026-11-19T16:00:00.000Z',
    },
  ];

  const pulseEvents: PulseEvent[] = [
    {
      id: 'pe-1',
      workspaceId: 'ws-test',
      siteId: 'site-1',
      type: 'page_view',
      name: 'Pricing Page',
      source: 'sdk',
      url: 'https://developster.io/pricing',
      path: '/pricing',
      leadId: 'lead-test-001',
      customerId: 'lead-test-001',
      timestamp: '2026-11-19T11:00:00.000Z',
      createdAt: '2026-11-19T11:00:00.000Z',
    },
    {
      id: 'pe-2',
      workspaceId: 'ws-test',
      siteId: 'site-1',
      type: 'page_view',
      name: 'Product Page',
      source: 'sdk',
      url: 'https://developster.io/product/analytics',
      path: '/product/analytics',
      leadId: 'lead-test-001',
      customerId: 'lead-test-001',
      timestamp: '2026-11-20T08:00:00.000Z',
      createdAt: '2026-11-20T08:00:00.000Z',
    },
  ];

  const result = calculateLeadScore({
    lead,
    activities,
    pulseEvents,
    referenceDate: refDate,
  });

  // Email: 1 open = 5 pts
  // Website: 2 visits (10) + 2 high intent (15) + repeat days (10) = 30 (cap 30)
  // WhatsApp: Inbound reply = 15 pts
  // Call: Connected + >180s = 20 pts
  // Total raw = 5 + 30 + 15 + 20 = 70 pts (HOT)
  // Decay: last activity was ~4 hours ago -> 0 decay
  assert.equal(result.score, 70);
  assert.equal(result.temperature, 'HOT');
  assert.ok(result.reasons.length >= 4);
});

test('Google Sheets Schema & sanitizeLead preserves score fields', () => {
  // Schema check
  const leadHeaders = SHEET_HEADERS[SHEET_NAMES.LEADS];
  assert.ok(leadHeaders.includes('leadScore'), 'Schema must include leadScore');
  assert.ok(leadHeaders.includes('leadTemperature'), 'Schema must include leadTemperature');
  assert.ok(leadHeaders.includes('scoreReasonsJson'), 'Schema must include scoreReasonsJson');

  // sanitizeLead check
  const rawLead: any = {
    id: 'lead-1',
    workspaceId: 'ws-1',
    title: 'Test Deal',
    contactName: 'Bob',
    email: 'bob@example.com',
    company: 'Acme Corp',
    value: 10000,
    pipelineId: 'p1',
    stageId: 'lead_captured',
    ownerId: 'u1',
    priority: 'Medium',
    status: 'Lead',
    source: 'Referral',
    expectedCloseDate: '2026-12-01',
    closingProbability: 30,
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    leadScore: 85,
    leadTemperature: 'HOT',
    scoreReasons: ['+25 pts: Strong engagement', '+15 pts: Reply received'],
  };

  const sanitized = sanitizeLead(rawLead);
  assert.equal(sanitized.leadScore, 85);
  assert.equal(sanitized.lead_score, 85);
  assert.equal(sanitized.leadTemperature, 'HOT');
  assert.equal(sanitized.lead_temperature, 'HOT');
  assert.deepEqual(sanitized.scoreReasons, ['+25 pts: Strong engagement', '+15 pts: Reply received']);
});
