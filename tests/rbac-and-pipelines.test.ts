import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCurrency, parseFinancialNumber } from '../src/lib/financial';
import { formatDateTime, formatDate, formatDateOnly, formatRelativeTime, DEFAULT_TIMEZONE } from '../src/lib/dateTime';
import {
  canUserAccessPipeline,
  canUserAccessLead,
  canUserModifyLead,
  filterPipelinesForUser,
  filterLeadsForUser,
  resolveUserPermissions,
  isMasterAdmin,
  DEFAULT_ROLE_PERMISSIONS,
} from '../src/lib/auth/rbac';
import { TeamMember, Pipeline, Lead } from '../src/types/crm';
import { SEED_MEMBERS, SEED_PIPELINES, SEED_LEADS, SEED_STAGES } from '../src/lib/google-sheets/seed-data';

test('Part 2 — Indian Currency Formatting Engine', () => {
  // Test Indian standard number formatting (en-IN with ₹)
  const formatted1 = formatCurrency(110989);
  assert.equal(formatted1, '₹1,10,989', 'Formats 110989 as ₹1,10,989 with Indian comma separators');

  const formatted2 = formatCurrency(25989);
  assert.equal(formatted2, '₹25,989', 'Formats 25989 as ₹25,989');

  const formatted3 = formatCurrency(100000);
  assert.equal(formatted3, '₹1,00,000', 'Formats 1,00,000 with Indian lakh grouping');

  const formatted4 = formatCurrency(11099);
  assert.equal(formatted4, '₹11,099', 'Formats 11099 as ₹11,099');

  // Test compact Indian notation
  const compactLakh = formatCurrency(250000, 'INR', { compact: true });
  assert.ok(compactLakh.includes('L') || compactLakh.includes('2.5'), 'Uses compact notation for Lakhs');

  // Test preservation of multi-currency when specified
  const usdFormatted = formatCurrency(25989, '$');
  assert.equal(usdFormatted, '$25,989', 'Preserves USD formatting when requested');

  const eurFormatted = formatCurrency(25989, 'EUR');
  assert.ok(eurFormatted.includes('€') || eurFormatted.includes('25,989'), 'Preserves EUR formatting when requested');
});

test('Part 2 — Indian Timezone (Asia/Kolkata IST) Date & Time Engine', () => {
  assert.equal(DEFAULT_TIMEZONE, 'Asia/Kolkata', 'Default timezone is Asia/Kolkata');

  // Fixed UTC timestamp: 2026-11-04 13:00:00 UTC -> 18:30:00 IST (+05:30)
  const utcIso = '2026-11-04T13:00:00.000Z';
  const formattedDt = formatDateTime(utcIso, { includeTimezoneName: true });
  assert.ok(formattedDt.includes('Nov') || formattedDt.includes('11'), 'Contains correct month');
  assert.ok(formattedDt.includes('6:30') || formattedDt.includes('18:30'), 'Converts 13:00 UTC to 6:30 PM IST');
  assert.ok(formattedDt.includes('IST') || formattedDt.includes('pm') || formattedDt.includes('PM'), 'Shows IST context');

  // Date-only string test (shielded against day-shift bug)
  const dateOnlyStr = '2026-11-04';
  const formattedDate = formatDateOnly(dateOnlyStr);
  assert.ok(formattedDate.includes('4') && (formattedDate.includes('Nov') || formattedDate.includes('11')), 'Preserves 4th Nov without day shift');

  // Relative time test
  const justNow = formatRelativeTime(new Date());
  assert.equal(justNow, 'Just now', 'Formats recent timestamp as Just now');

  const pastDate = formatRelativeTime(new Date(Date.now() - 3600000 * 2));
  assert.equal(pastDate, '2h ago', 'Formats 2 hours ago correctly');
});

test('Part 1 — Pipeline Team Member Filters (Dynamic Real CRM Deals >= ₹10,000)', () => {
  // Verify seed data contains only authentic Indian enterprise deals >= ₹10,000
  assert.ok(SEED_LEADS.length > 0, 'Seed leads exist');
  for (const lead of SEED_LEADS) {
    assert.ok(lead.value >= 10000, `Lead ${lead.title} value (${lead.value}) must be >= ₹10,000`);
    assert.ok(lead.contactName, `Lead ${lead.title} must have real contact person`);
    assert.ok(lead.company, `Lead ${lead.title} must have real company name`);
  }

  // Verify seed members do NOT include dummy reps (Sofia, Theo, Amara, Rohan, Hanna)
  const dummyNames = ['Sofia', 'Theo', 'Amara', 'Rohan', 'Hanna'];
  for (const member of SEED_MEMBERS) {
    for (const dummy of dummyNames) {
      assert.notEqual(member.name, dummy, `Member ${member.name} must not be dummy placeholder ${dummy}`);
    }
  }

  // Test dynamic qualifying deals filter logic
  const qualifyingDeals = SEED_LEADS.filter((l) => (l.value || 0) >= 10000);
  assert.equal(qualifyingDeals.length, SEED_LEADS.length, 'All seed leads qualify under >= ₹10,000 rule');

  const ownerIds = new Set(qualifyingDeals.map((l) => l.ownerId).filter(Boolean));
  assert.ok(ownerIds.has('mem-aarav'), 'Aarav Mehta owns qualifying deals');
  assert.ok(ownerIds.has('mem-priya'), 'Priya Sharma owns qualifying deals');
  assert.ok(ownerIds.has('mem-diya'), 'Diya Patel owns qualifying deals');
});

test('Part 5 — RBAC: Master Admin Universal Access', () => {
  const masterAdmin: TeamMember = SEED_MEMBERS.find((m) => m.role === 'Owner')!;
  assert.ok(masterAdmin, 'Master admin exists');
  assert.ok(isMasterAdmin(masterAdmin), 'isMasterAdmin correctly recognizes Master Admin');

  // Master Admin can access Master Pipeline, Shared Pipelines, and Private Pipelines
  for (const pipeline of SEED_PIPELINES) {
    const canAccess = canUserAccessPipeline(masterAdmin, pipeline);
    assert.equal(canAccess, true, `Master Admin can access pipeline ${pipeline.name}`);
  }

  // Master Admin can access all leads (shared and private)
  for (const lead of SEED_LEADS) {
    const canAccess = canUserAccessLead(masterAdmin, lead);
    assert.equal(canAccess, true, `Master Admin can access lead ${lead.title}`);
    const canModify = canUserModifyLead(masterAdmin, lead);
    assert.equal(canModify, true, `Master Admin can modify lead ${lead.title}`);
  }

  // Filtered lists return all
  const filteredPipes = filterPipelinesForUser(masterAdmin, SEED_PIPELINES);
  assert.equal(filteredPipes.length, SEED_PIPELINES.length, 'Master Admin sees all pipelines');

  const filteredLeads = filterLeadsForUser(masterAdmin, SEED_LEADS, SEED_PIPELINES);
  assert.equal(filteredLeads.length, SEED_LEADS.length, 'Master Admin sees all leads');
});

test('Part 5 — RBAC: Employee A (Aarav) vs Employee B (Diya) Private Isolation', () => {
  const aarav: TeamMember = SEED_MEMBERS.find((m) => m.id === 'mem-aarav')!;
  const diya: TeamMember = SEED_MEMBERS.find((m) => m.id === 'mem-diya')!;
  assert.ok(aarav && diya, 'Both employees exist');

  const masterPipe = SEED_PIPELINES.find((p) => p.id === 'pipe-master')!;
  const sharedPipe = SEED_PIPELINES.find((p) => p.id === 'pipe-sales')!;
  const aaravPipe = SEED_PIPELINES.find((p) => p.id === 'pipe-aarav')!;
  const diyaPipe = SEED_PIPELINES.find((p) => p.id === 'pipe-diya')!;

  // 1. Pipeline Isolation
  // Neither employee can access Master Pipeline
  assert.equal(canUserAccessPipeline(aarav, masterPipe), false, 'Aarav cannot access Master Pipeline');
  assert.equal(canUserAccessPipeline(diya, masterPipe), false, 'Diya cannot access Master Pipeline');

  // Both can access shared sales pipeline
  assert.equal(canUserAccessPipeline(aarav, sharedPipe), true, 'Aarav can access shared sales pipeline');
  assert.equal(canUserAccessPipeline(diya, sharedPipe), true, 'Diya can access shared sales pipeline');

  // Aarav can access his private pipeline, Diya CANNOT
  assert.equal(canUserAccessPipeline(aarav, aaravPipe), true, 'Aarav can access his private pipeline');
  assert.equal(canUserAccessPipeline(diya, aaravPipe), false, 'Diya CANNOT access Aarav private pipeline');

  // Diya can access her private pipeline, Aarav CANNOT
  assert.equal(canUserAccessPipeline(diya, diyaPipe), true, 'Diya can access her private pipeline');
  assert.equal(canUserAccessPipeline(aarav, diyaPipe), false, 'Aarav CANNOT access Diya private pipeline');

  // 2. Private Lead Isolation
  const zomatoLead = SEED_LEADS.find((l) => l.id === 'deal-zomato')!; // Aarav private lead
  const swiggyLead = SEED_LEADS.find((l) => l.id === 'deal-swiggy')!; // Diya private lead

  // Aarav can access Zomato, but NOT Swiggy
  assert.equal(canUserAccessLead(aarav, zomatoLead, aaravPipe), true, 'Aarav can access his private lead (Zomato)');
  assert.equal(canUserAccessLead(aarav, swiggyLead, diyaPipe), false, 'Aarav CANNOT access Diya private lead (Swiggy)');

  // Diya can access Swiggy, but NOT Zomato
  assert.equal(canUserAccessLead(diya, swiggyLead, diyaPipe), true, 'Diya can access her private lead (Swiggy)');
  assert.equal(canUserAccessLead(diya, zomatoLead, aaravPipe), false, 'Diya CANNOT access Aarav private lead (Zomato)');

  // 3. Lead Modification Isolation
  assert.equal(canUserModifyLead(aarav, zomatoLead), true, 'Aarav can modify his private lead');
  assert.equal(canUserModifyLead(diya, zomatoLead), false, 'Diya CANNOT modify Aarav private lead');
  assert.equal(canUserModifyLead(diya, swiggyLead), true, 'Diya can modify her private lead');
  assert.equal(canUserModifyLead(aarav, swiggyLead), false, 'Aarav CANNOT modify Diya private lead');
});

test('Part 5 — RBAC: Viewer (Read-only) Guardrails', () => {
  const viewer: TeamMember = SEED_MEMBERS.find((m) => m.role === 'Read-only')!;
  assert.ok(viewer, 'Viewer exists');

  const sharedPipe = SEED_PIPELINES.find((p) => p.id === 'pipe-sales')!;
  const masterPipe = SEED_PIPELINES.find((p) => p.id === 'pipe-master')!;
  const sharedLead = SEED_LEADS.find((l) => l.id === 'deal-tcs')!;

  // Viewer cannot access Master Pipeline
  assert.equal(canUserAccessPipeline(viewer, masterPipe), false, 'Viewer cannot access Master Pipeline');

  // Viewer can read shared pipeline and shared lead
  assert.equal(canUserAccessPipeline(viewer, sharedPipe), true, 'Viewer can read assigned shared pipeline');
  assert.equal(canUserAccessLead(viewer, sharedLead, sharedPipe), true, 'Viewer can read shared lead');

  // Viewer CAN NEVER modify leads
  assert.equal(canUserModifyLead(viewer, sharedLead), false, 'Viewer CANNOT modify leads');

  const permissions = resolveUserPermissions(viewer);
  assert.equal(permissions.canManagePipelines, false, 'Viewer cannot manage pipelines');
  assert.equal(permissions.canAssignLeads, false, 'Viewer cannot assign leads');
  assert.equal(permissions.canManageAutomations, false, 'Viewer cannot manage automations');
});

test('Audit Hardening — API Security & Permission Isolation Verification', () => {
  const aarav: TeamMember = SEED_MEMBERS.find((m) => m.id === 'mem-aarav')!;
  const diya: TeamMember = SEED_MEMBERS.find((m) => m.id === 'mem-diya')!;
  const viewer: TeamMember = SEED_MEMBERS.find((m) => m.role === 'Read-only')!;
  const admin: TeamMember = SEED_MEMBERS.find((m) => m.role === 'Owner')!;
  const aaravPipe = SEED_PIPELINES.find((p) => p.id === 'pipe-aarav')!;
  const diyaPipe = SEED_PIPELINES.find((p) => p.id === 'pipe-diya')!;
  const aaravLead = SEED_LEADS.find((l) => l.id === 'deal-zomato')!;
  const diyaLead = SEED_LEADS.find((l) => l.id === 'deal-swiggy')!;

  // 1. Direct API access attack: Employee A cannot mark Employee B's lead won or lost
  assert.equal(canUserModifyLead(aarav, diyaLead), false, 'Aarav cannot modify or win/lose Diya lead');
  assert.equal(canUserModifyLead(diya, aaravLead), false, 'Diya cannot modify or win/lose Aarav lead');
  assert.equal(canUserModifyLead(admin, diyaLead), true, 'Admin can modify and win/lose any lead');

  // 2. Lead creation attack: Employee cannot inject lead into unauthorized pipeline
  assert.equal(canUserAccessPipeline(aarav, diyaPipe), false, 'Aarav cannot target Diya private pipeline');
  assert.equal(canUserAccessPipeline(diya, aaravPipe), false, 'Diya cannot target Aarav private pipeline');

  // 3. Owner spoofing attack: Non-assigner employees cannot assign deals to other reps
  const aaravPerms = resolveUserPermissions(aarav);
  assert.equal(aaravPerms.canAssignLeads, false, 'Aarav does not have canAssignLeads permission');
  const adminPerms = resolveUserPermissions(admin);
  assert.equal(adminPerms.canAssignLeads, true, 'Admin has canAssignLeads permission');

  // 4. Viewer cannot modify leads or log activities
  assert.equal(canUserModifyLead(viewer, aaravLead), false, 'Viewer cannot modify private lead');
  const sharedLead = SEED_LEADS.find((l) => l.id === 'deal-tcs')!;
  assert.equal(canUserModifyLead(viewer, sharedLead), false, 'Viewer cannot modify shared lead');
});

test('Audit Hardening — Email Template Parser Formats Currency & Time in INR / IST', async () => {
  const { renderTemplateString } = await import('../src/lib/email/template-parser');

  const testLead: Partial<Lead> = {
    title: 'Enterprise ERP Suite',
    value: 250000,
    contactName: 'Vikram Malhotra',
    company: 'Reliance Retail',
    status: 'Proposal Sent',
  };

  const rendered = renderTemplateString('Hello {{greeting}} Value: {{deal.value}}', {
    lead: testLead as Lead,
  });

  assert.ok(rendered.includes('₹2,50,000'), `Expected ₹2,50,000 in rendered template, got: ${rendered}`);
  assert.ok(rendered.includes('Dear Vikram,'), `Expected Dear Vikram, in greeting, got: ${rendered}`);
});


