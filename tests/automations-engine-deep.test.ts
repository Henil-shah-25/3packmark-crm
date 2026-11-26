import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateScheduledTime, evaluateConditions, executeSingleAction } from '../src/lib/automations/engine';
import { PREBUILT_AUTOMATION_TEMPLATES } from '../src/lib/automations/templates';
import { validateVisualWorkflow } from '../src/lib/automations/validator';
import { PipelineStage, TeamMember, Lead } from '../src/types/crm';

const mockStages: PipelineStage[] = [
  { id: 'stg-new-lead', name: 'New lead', order: 1, color: 'blue', probability: 20, workspaceId: 'ws-default', pipelineId: 'pip-1' },
  { id: 'stg-contacted', name: 'Contacted', order: 2, color: 'yellow', probability: 40, workspaceId: 'ws-default', pipelineId: 'pip-1' },
  { id: 'stg-proposal', name: 'Proposal', order: 3, color: 'purple', probability: 70, workspaceId: 'ws-default', pipelineId: 'pip-1' },
  { id: 'stg-negotiation', name: 'Negotiation', order: 4, color: 'orange', probability: 90, workspaceId: 'ws-default', pipelineId: 'pip-1' },
];

const mockMembers: TeamMember[] = [
  { id: 'mem-1', workspaceId: 'ws-default', name: 'Henil Shah', email: 'henil@example.com', role: 'Owner', avatar: 'HS' },
];

const mockLead: Lead = {
  id: 'lead-test-1',
  workspaceId: 'ws-default',
  pipelineId: 'pip-1',
  stageId: 'stg-proposal',
  title: 'Acme Corp Deal',
  contactName: 'Alice Johnson',
  company: 'Acme Corp',
  email: 'alice@acme.com',
  phone: '+15551234567',
  value: 12000,
  currency: 'USD',
  probability: 70,
  source: 'Inbound Website',
  status: 'Proposal',
  ownerId: 'mem-1',
  tags: ['enterprise'],
  notes: 'Interested in automation tier',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

test('Deep Automation Engine — Delay Time Calculations', () => {
  const baseTime = Date.now();

  // Minutes
  const time1m = new Date(calculateScheduledTime(1, 'minutes')).getTime();
  assert.ok(Math.abs(time1m - (baseTime + 60 * 1000)) < 5000, '1m delay matches');

  const time15m = new Date(calculateScheduledTime(15, 'minutes')).getTime();
  assert.ok(Math.abs(time15m - (baseTime + 15 * 60 * 1000)) < 5000, '15m delay matches');

  // Hours
  const time1h = new Date(calculateScheduledTime(1, 'hours')).getTime();
  assert.ok(Math.abs(time1h - (baseTime + 60 * 60 * 1000)) < 5000, '1h delay matches');

  const time24h = new Date(calculateScheduledTime(24, 'hours')).getTime();
  assert.ok(Math.abs(time24h - (baseTime + 24 * 60 * 60 * 1000)) < 5000, '24h delay matches');

  // Days
  const time2d = new Date(calculateScheduledTime(2, 'days')).getTime();
  assert.ok(Math.abs(time2d - (baseTime + 2 * 24 * 60 * 60 * 1000)) < 5000, '2d delay matches');
});

test('Deep Automation Engine — All 12 Prebuilt Templates Generate Valid Graphs', () => {
  assert.equal(PREBUILT_AUTOMATION_TEMPLATES.length, 12, 'Must have exactly 12 prebuilt templates');

  for (const tpl of PREBUILT_AUTOMATION_TEMPLATES) {
    const graph = tpl.generateGraph(mockStages, mockMembers);
    assert.ok(graph.nodes.length >= 3, `Template ${tpl.id} has at least 3 nodes (has ${graph.nodes.length})`);
    assert.ok(graph.edges.length >= 2, `Template ${tpl.id} has connected edges (has ${graph.edges.length})`);

    // Verify presence of starting trigger
    const triggerNode = graph.nodes.find((n) => n.data.nodeCategory === 'trigger' || n.type === 'trigger');
    assert.ok(triggerNode, `Template ${tpl.id} has trigger node`);

    // Verify presence of terminal end node
    const endNode = graph.nodes.find((n) => n.data.nodeCategory === 'end' || n.type === 'end');
    assert.ok(endNode, `Template ${tpl.id} has terminal end node`);

    // Validation check
    const validation = validateVisualWorkflow(
      { nodes: graph.nodes, edges: graph.edges },
      mockStages
    );
    assert.equal(validation.isValid, true, `Template ${tpl.id} passes graph validation: ${validation.errors.map(e => e.message).join('; ')}`);
  }
});

test('Deep Automation Engine — Proposal Follow-up Template Generates Full Requested Branching Sequence', () => {
  const proposalTpl = PREBUILT_AUTOMATION_TEMPLATES.find((t) => t.id === 'tpl-proposal-followup');
  assert.ok(proposalTpl, 'Found proposal template');

  const graph = proposalTpl.generateGraph(mockStages, mockMembers);
  assert.equal(graph.nodes.length, 9, 'Proposal template has 9 nodes');

  const nodeCategories = graph.nodes.map((n) => n.data.nodeCategory);
  assert.deepEqual(nodeCategories, [
    'trigger',
    'condition',
    'delay',
    'condition',
    'action',
    'delay',
    'condition',
    'action',
    'end',
  ], 'Nodes match requested: Trigger -> Condition -> Delay -> Condition -> Action -> Delay -> Condition -> Action -> End');

  // Verify delay nodes presets
  const delay1 = graph.nodes[2];
  assert.equal(delay1.data.delayConfig?.delayAmount, 1);
  assert.equal(delay1.data.delayConfig?.delayUnit, 'hours');

  const delay2 = graph.nodes[5];
  assert.equal(delay2.data.delayConfig?.delayAmount, 24);
  assert.equal(delay2.data.delayConfig?.delayUnit, 'hours');
});

test('Deep Automation Engine — Dry Run Simulation and Actions', async () => {
  // Test Dry Run WhatsApp action
  const dryRunRes = await executeSingleAction(
    'send_whatsapp',
    { message: 'Hello {{lead.name}}' },
    mockLead,
    { isTestRun: true, workspaceId: 'ws-default' }
  );
  assert.equal(dryRunRes.status, 'success');
  assert.ok(dryRunRes.summary.includes('Dry Run'));

  // Test Condition evaluation with AND / OR
  const condPassed = evaluateConditions(
    [
      { field: 'value', operator: 'greater_than', value: 10000 },
      { field: 'stageId', operator: 'equals', value: 'stg-proposal' },
    ],
    mockLead,
    'AND'
  );
  assert.equal(condPassed, true, 'AND condition passed');

  const condFailed = evaluateConditions(
    [
      { field: 'value', operator: 'greater_than', value: 50000 },
    ],
    mockLead,
    'AND'
  );
  assert.equal(condFailed, false, 'Condition failed correctly');
});

