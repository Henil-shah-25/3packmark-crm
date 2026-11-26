import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFinancialNumber,
  parsePercentage,
  formatCurrency,
  formatPercent,
  deduplicateLeads,
  sanitizeLead,
  reconcileLeads,
  calculateWonRevenue,
  calculateWonThisMonth,
  calculateOpenPipeline,
  calculateWeightedForecast,
  calculateAverageDealSize,
  calculateWinRate,
  calculateQuotaAttainment,
  calculateMonthlyRevenueTrend,
} from '../src/lib/financial.ts';
import { Lead } from '../src/types/crm.ts';

test('1. Financial Number Parsing Boundary', async (t) => {
  await t.test('parses standard numbers and floats', () => {
    assert.equal(parseFinancialNumber(56180), 56180);
    assert.equal(parseFinancialNumber(1250.75), 1250.75);
    assert.equal(parseFinancialNumber(0), 0);
  });

  await t.test('parses numeric strings without string concatenation hazard', () => {
    assert.equal(parseFinancialNumber('17970'), 17970);
    assert.equal(parseFinancialNumber('49040'), 49040);
    // Crucial anti-corruption check: addition of two parsed strings must equal 67010, NOT '1797049040'
    const sum = parseFinancialNumber('17970') + parseFinancialNumber('49040');
    assert.equal(sum, 67010);
    assert.notEqual(String(sum), '1797049040');
  });

  await t.test('parses currency formatted strings with symbols and commas', () => {
    assert.equal(parseFinancialNumber('$56,180.50'), 56180.50);
    assert.equal(parseFinancialNumber('£12,000'), 12000);
    assert.equal(parseFinancialNumber('¥ 500,000'), 500000);
    assert.equal(parseFinancialNumber('€ 42.000,00'), 42000);
  });

  await t.test('parses accounting negative parentheses format', () => {
    assert.equal(parseFinancialNumber('(1,234.50)'), -1234.50);
    assert.equal(parseFinancialNumber('($500)'), -500);
  });

  await t.test('handles empty, null, undefined, and non-numeric inputs safely', () => {
    assert.equal(parseFinancialNumber(null), 0);
    assert.equal(parseFinancialNumber(undefined), 0);
    assert.equal(parseFinancialNumber(''), 0);
    assert.equal(parseFinancialNumber('   '), 0);
    assert.equal(parseFinancialNumber(true), 0);
    assert.equal(parseFinancialNumber(false), 0);
    assert.equal(parseFinancialNumber('invalid_str'), 0);
  });

  await t.test('handles spreadsheet formula errors explicitly', () => {
    assert.equal(parseFinancialNumber('#ERROR!'), 0);
    assert.equal(parseFinancialNumber('#VALUE!'), 0);
    assert.equal(parseFinancialNumber('#REF!'), 0);
    assert.equal(parseFinancialNumber('#N/A'), 0);
    assert.equal(parseFinancialNumber('NaN'), 0);
    assert.equal(parseFinancialNumber('null'), 0);
    assert.equal(parseFinancialNumber('undefined'), 0);
  });
});

test('2. Percentage Parsing and Validation', async (t) => {
  await t.test('parses numeric percentages and clamps to 0-100', () => {
    assert.equal(parsePercentage(75), 75);
    assert.equal(parsePercentage(120), 100);
    assert.equal(parsePercentage(-20), 0);
    assert.equal(parsePercentage('85%'), 85);
    assert.equal(parsePercentage('150%'), 100);
  });

  await t.test('handles null, empty, and invalid percentages', () => {
    assert.equal(parsePercentage(null, 50), 50);
    assert.equal(parsePercentage(undefined, 30), 30);
    assert.equal(parsePercentage('invalid', 25), 25);
  });
});

test('3. Safe Currency Formatting Presentation', async (t) => {
  await t.test('formats currency with Intl.NumberFormat', () => {
    const usd = formatCurrency(56180, 'USD');
    assert.match(usd, /\$56,180/);

    const eur = formatCurrency(42000, 'EUR');
    assert.match(eur, /42/);

    // Never formats as NaN, undefined, or empty
    assert.notEqual(formatCurrency(0, 'USD'), '');
    assert.match(formatCurrency(0, 'USD'), /\$0/);
    assert.match(formatCurrency(NaN, 'USD'), /\$0/);
    assert.match(formatCurrency(null as any, 'USD'), /\$0/);
  });
});

test('4. Deal Deduplication and Sanitization', async (t) => {
  const sampleLeads: Lead[] = [
    {
      id: 'lead-1',
      workspaceId: 'ws-main',
      title: 'First Deal',
      company: 'Acme Inc',
      contactName: 'Alice',
      email: 'alice@acme.com',
      phone: '+1-555-0100',
      value: 10000,
      stageId: 'stg-won',
      status: 'Won',
      pipelineId: 'pipe-main',
      ownerId: 'mem-1',
      closingProbability: 100,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-02',
    },
    {
      // Duplicate ID
      id: 'lead-1',
      workspaceId: 'ws-main',
      title: 'First Deal Duplicate',
      company: 'Acme Inc',
      contactName: 'Alice',
      email: 'alice@acme.com',
      phone: '+1-555-0100',
      value: 10000,
      stageId: 'stg-won',
      status: 'Won',
      pipelineId: 'pipe-main',
      ownerId: 'mem-1',
      closingProbability: 100,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-02',
    },
    {
      id: 'lead-2',
      workspaceId: 'ws-main',
      title: 'Second Deal',
      company: 'Beta Corp',
      contactName: 'Bob',
      email: 'bob@beta.com',
      phone: '#ERROR!',
      value: '25000' as any, // Corrupted string value
      stageId: 'stg-prop',
      status: 'Contacted',
      pipelineId: 'pipe-main',
      ownerId: 'mem-2',
      closingProbability: '70%' as any,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-02',
    },
  ];

  await t.test('deduplicates deals by id', () => {
    const deduplicated = deduplicateLeads(sampleLeads);
    assert.equal(deduplicated.length, 2);
    assert.equal(deduplicated[0].id, 'lead-1');
    assert.equal(deduplicated[1].id, 'lead-2');
  });

  await t.test('sanitizes lead values and clears formula error in phone', () => {
    const sanitized = sanitizeLead(sampleLeads[2]);
    assert.equal(typeof sanitized.value, 'number');
    assert.equal(sanitized.value, 25000);
    assert.equal(sanitized.phone, '');
    assert.equal(sanitized.closingProbability, 70);
  });

  await t.test('reconciles malformed leads without data loss', () => {
    const { reconciled, issuesFixed } = reconcileLeads(sampleLeads);
    assert.equal(reconciled.length, 2);
    assert.ok(issuesFixed.length >= 2); // Flagged duplicate and string value
    assert.equal(typeof reconciled[1].value, 'number');
    assert.equal(reconciled[1].value, 25000);
  });
});

test('5. Business Financial Metrics & KPI Calculations', async (t) => {
  const testDeals: Lead[] = [
    {
      id: 'deal-1',
      workspaceId: 'ws-1',
      title: 'Won Deal 1',
      company: 'Apex',
      contactName: 'John',
      email: 'j@a.com',
      value: 60000,
      stageId: 'stg-won',
      status: 'Won',
      pipelineId: 'p-1',
      ownerId: 'm-1',
      closingProbability: 100,
      wonAt: '2026-10-15T10:00:00Z',
      createdAt: '2026-09-01',
      updatedAt: '2026-10-15',
    },
    {
      id: 'deal-2',
      workspaceId: 'ws-1',
      title: 'Won Deal 2',
      company: 'Apex',
      contactName: 'Jane',
      email: 'jane@a.com',
      value: 40000,
      stageId: 'stg-won',
      status: 'Won',
      pipelineId: 'p-1',
      ownerId: 'm-1',
      closingProbability: 100,
      wonAt: '2026-09-10T10:00:00Z',
      createdAt: '2026-08-01',
      updatedAt: '2026-09-10',
    },
    {
      id: 'deal-3',
      workspaceId: 'ws-1',
      title: 'Open Deal High Probability',
      company: 'Crest',
      contactName: 'Charlie',
      email: 'c@c.com',
      value: 50000,
      stageId: 'stg-proposal',
      status: 'Negotiation',
      pipelineId: 'p-1',
      ownerId: 'm-2',
      closingProbability: 80,
      createdAt: '2026-10-01',
      updatedAt: '2026-10-20',
    },
    {
      id: 'deal-4',
      workspaceId: 'ws-1',
      title: 'Open Deal Low Probability',
      company: 'Delta',
      contactName: 'Dan',
      email: 'd@d.com',
      value: 30000,
      stageId: 'stg-qualified',
      status: 'Qualified',
      pipelineId: 'p-1',
      ownerId: 'm-2',
      closingProbability: 20,
      createdAt: '2026-10-05',
      updatedAt: '2026-10-22',
    },
    {
      id: 'deal-5',
      workspaceId: 'ws-1',
      title: 'Lost Deal',
      company: 'Echo',
      contactName: 'Eve',
      email: 'e@e.com',
      value: 20000,
      stageId: 'stg-loss',
      status: 'Lost',
      pipelineId: 'p-1',
      ownerId: 'm-1',
      closingProbability: 0,
      lostAt: '2026-10-18T10:00:00Z',
      createdAt: '2026-10-01',
      updatedAt: '2026-10-18',
    },
  ];

  await t.test('calculateWonRevenue aggregates only Won deals', () => {
    const won = calculateWonRevenue(testDeals);
    assert.equal(won, 100000); // 60,000 + 40,000
  });

  await t.test('calculateWonThisMonth filters by target month and year', () => {
    const wonOct = calculateWonThisMonth(testDeals, new Date('2026-10-26T12:00:00Z'));
    assert.equal(wonOct, 60000); // only deal-1 was won in Oct 2026
  });

  await t.test('calculateOpenPipeline excludes Won and Lost deals', () => {
    const openPipeline = calculateOpenPipeline(testDeals);
    assert.equal(openPipeline, 80000); // 50,000 + 30,000
  });

  await t.test('calculateWeightedForecast computes probability-adjusted value', () => {
    // 50,000 * 0.8 + 30,000 * 0.2 = 40,000 + 6,000 = 46,000
    const forecast = calculateWeightedForecast(testDeals);
    assert.equal(forecast, 46000);
  });

  await t.test('calculateAverageDealSize computes correct arithmetic mean', () => {
    // All 5 deals: (60k + 40k + 50k + 30k + 20k) / 5 = 200k / 5 = 40,000
    const avgAll = calculateAverageDealSize(testDeals, 'all');
    assert.equal(avgAll, 40000);

    // Won deals: 100k / 2 = 50,000
    const avgWon = calculateAverageDealSize(testDeals, 'won');
    assert.equal(avgWon, 50000);

    // Open deals: 80k / 2 = 40,000
    const avgOpen = calculateAverageDealSize(testDeals, 'open');
    assert.equal(avgOpen, 40000);

    // Empty list returns 0 safely
    assert.equal(calculateAverageDealSize([], 'all'), 0);
  });

  await t.test('calculateWinRate computes percentage of closed deals won', () => {
    // 2 won, 1 lost. Closed = 3. 2/3 = 66.67% -> rounds to 67%
    const winRate = calculateWinRate(testDeals);
    assert.equal(winRate, 67);

    // No closed deals returns 0, no division by zero
    const openOnly = testDeals.filter((d) => d.status !== 'Won' && d.status !== 'Lost');
    assert.equal(calculateWinRate(openOnly), 0);
  });

  await t.test('calculateQuotaAttainment computes attainment cleanly without corruption', () => {
    // Won revenue 60,000 / target 100,000 = 60%
    assert.equal(calculateQuotaAttainment(60000, 100000), 60);

    // Target 0 returns 0, prevents Infinity or NaN
    assert.equal(calculateQuotaAttainment(60000, 0), 0);
    assert.equal(calculateQuotaAttainment(60000, -500), 0);

    // Prevents corrupted string concatenation quota
    // (if won was corrupted to string "11596049040" / 156700 = 7399896%)
    const cleanRevenue = 115960 + 49040; // 165000
    const attainment = calculateQuotaAttainment(cleanRevenue, 156700);
    assert.equal(attainment, 105);
    assert.notEqual(attainment, 7399896);
  });

  await t.test('calculateMonthlyRevenueTrend generates valid timeline', () => {
    const trend = calculateMonthlyRevenueTrend(testDeals, 6, new Date('2026-10-26T12:00:00Z'), 100000);
    assert.equal(trend.length, 6);
    // Last month should be Oct 2026 with 60000 revenue
    const octEntry = trend[trend.length - 1];
    assert.equal(octEntry.month, 'Oct');
    assert.equal(octEntry.revenue, 60000);
    assert.equal(octEntry.target, 100000);
  });
});
