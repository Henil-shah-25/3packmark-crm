import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateVisualWorkflow, executeWorkflow } from '../src/lib/automations/engine';
import { PipelineStage, AutomationRule, VisualWorkflowNode, VisualWorkflowEdge } from '../src/types/crm';
import { crmRepo } from '../src/lib/google-sheets/repository';

describe('Rapport CRM — Visual Workflow Automation Engine Tests', () => {
  const mockStages: PipelineStage[] = [
    { id: 'stg-new-lead', workspaceId: 'ws-test', pipelineId: 'pipe-1', name: 'New Lead', order: 1, color: 'mustard', probability: 10 },
    { id: 'stg-qualified', workspaceId: 'ws-test', pipelineId: 'pipe-1', name: 'Qualified', order: 2, color: 'mustard', probability: 25 },
    { id: 'stg-proposal', workspaceId: 'ws-test', pipelineId: 'pipe-1', name: 'Proposal', order: 6, color: 'terracotta', probability: 60 },
    { id: 'stg-won', workspaceId: 'ws-test', pipelineId: 'pipe-1', name: 'Won', order: 9, color: 'green', probability: 100 },
    { id: 'stg-loss', workspaceId: 'ws-test', pipelineId: 'pipe-1', name: 'Loss', order: 10, color: 'charcoal', probability: 0 },
  ];

  test('Validation succeeds for valid linear trigger -> action workflow', () => {
    const nodes: VisualWorkflowNode[] = [
      {
        id: 'node-trigger',
        type: 'triggerNode',
        position: { x: 100, y: 100 },
        data: {
          label: 'When Deal Enters Proposal',
          nodeType: 'trigger',
          nodeCategory: 'trigger',
          triggerType: 'deal_stage_changed',
          stageId: 'stg-proposal',
        },
      },
      {
        id: 'node-action',
        type: 'actionNode',
        position: { x: 100, y: 250 },
        data: {
          label: 'Create Follow-up Task',
          nodeType: 'action',
          nodeCategory: 'action',
          actionType: 'create_task',
          taskTitle: 'Send proposal document to client',
          taskDueDays: 2,
        },
      },
    ];

    const edges: VisualWorkflowEdge[] = [
      { id: 'e-1', source: 'node-trigger', target: 'node-action' },
    ];

    const rule: AutomationRule = {
      id: 'rule-test-1',
      workspaceId: 'ws-test',
      name: 'Proposal Follow-up',
      triggerType: 'deal_stage_changed',
      triggerStageId: 'stg-proposal',
      nodes,
      edges,
      conditions: [],
      actions: [],
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    const validation = validateVisualWorkflow(rule, mockStages);
    assert.equal(validation.isValid, true, `Workflow should be valid. Errors: ${JSON.stringify(validation.errors)}`);
    assert.equal(validation.errors.length, 0, 'Should have 0 errors');
  });

  test('Validation detects and reports cycle / loop in workflow graph', () => {
    const nodes: VisualWorkflowNode[] = [
      {
        id: 'n-trig',
        type: 'triggerNode',
        position: { x: 0, y: 0 },
        data: { label: 'Lead Created', nodeCategory: 'trigger', triggerType: 'lead_created' },
      },
      {
        id: 'n-act1',
        type: 'actionNode',
        position: { x: 0, y: 100 },
        data: { label: 'Action 1', nodeCategory: 'action', actionType: 'create_task', taskTitle: 'Task 1' },
      },
      {
        id: 'n-act2',
        type: 'actionNode',
        position: { x: 0, y: 200 },
        data: { label: 'Action 2', nodeCategory: 'action', actionType: 'create_task', taskTitle: 'Task 2' },
      },
    ];

    // Cycle: n-act1 -> n-act2 -> n-act1
    const edges: VisualWorkflowEdge[] = [
      { id: 'e1', source: 'n-trig', target: 'n-act1' },
      { id: 'e2', source: 'n-act1', target: 'n-act2' },
      { id: 'e3', source: 'n-act2', target: 'n-act1' },
    ];

    const rule: AutomationRule = {
      id: 'rule-cycle',
      workspaceId: 'ws-test',
      name: 'Cyclic Workflow',
      triggerType: 'lead_created',
      nodes,
      edges,
      conditions: [],
      actions: [],
      isActive: false,
      createdAt: new Date().toISOString(),
    };

    const validation = validateVisualWorkflow(rule, mockStages);
    assert.equal(validation.isValid, false, 'Cycle should be flagged as invalid');
    const hasCycleError = validation.errors.some((err) => err.message.toLowerCase().includes('cycle') || err.message.toLowerCase().includes('loop'));
    assert.equal(hasCycleError, true, 'Validation must explicitly report cycle/loop');
  });

  test('Validation detects disconnected or unreachable nodes', () => {
    const nodes: VisualWorkflowNode[] = [
      {
        id: 'n-trig',
        type: 'triggerNode',
        position: { x: 0, y: 0 },
        data: { label: 'Lead Created', nodeCategory: 'trigger', triggerType: 'lead_created' },
      },
      {
        id: 'n-connected',
        type: 'actionNode',
        position: { x: 0, y: 100 },
        data: { label: 'Task A', nodeCategory: 'action', actionType: 'create_task', taskTitle: 'Call lead' },
      },
      {
        id: 'n-floating',
        type: 'actionNode',
        position: { x: 200, y: 200 },
        data: { label: 'Orphan Action', nodeCategory: 'action', actionType: 'create_task', taskTitle: 'Never runs' },
      },
    ];

    const edges: VisualWorkflowEdge[] = [
      { id: 'e1', source: 'n-trig', target: 'n-connected' },
    ];

    const rule: AutomationRule = {
      id: 'rule-orphan',
      workspaceId: 'ws-test',
      name: 'Orphan Node Workflow',
      triggerType: 'lead_created',
      nodes,
      edges,
      conditions: [],
      actions: [],
      isActive: false,
      createdAt: new Date().toISOString(),
    };

    const validation = validateVisualWorkflow(rule, mockStages);
    assert.equal(validation.isValid, false, 'Should fail validation due to orphan node');
    const hasDisconnectedError = validation.errors.some((err) => err.message.includes('disconnected and unreachable'));
    assert.equal(hasDisconnectedError, true, 'Must report unreachable node');
  });

  test('Validation flags invalid or deleted pipeline stage references', () => {
    const nodes: VisualWorkflowNode[] = [
      {
        id: 'n-trig',
        type: 'triggerNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Stage Enter',
          nodeCategory: 'trigger',
          triggerType: 'deal_stage_changed',
          stageId: 'stg-deleted-from-sheets',
        },
      },
    ];

    const rule: AutomationRule = {
      id: 'rule-bad-stage',
      workspaceId: 'ws-test',
      name: 'Bad Stage Rule',
      triggerType: 'deal_stage_changed',
      triggerStageId: 'stg-deleted-from-sheets',
      nodes,
      edges: [],
      conditions: [],
      actions: [],
      isActive: false,
      createdAt: new Date().toISOString(),
    };

    const validation = validateVisualWorkflow(rule, mockStages);
    assert.equal(validation.isValid, false);
    const hasStageError = validation.errors.some((err) => err.message.includes('unknown or unavailable stage'));
    assert.equal(hasStageError, true, 'Must prevent activation of unavailable stage');
  });

  test('Execution engine simulates execution and creates step-by-step audit logs', async () => {
    const rule: AutomationRule = {
      id: 'rule-exec-1',
      workspaceId: 'ws-test',
      name: 'New Lead Auto Task',
      triggerType: 'lead_created',
      conditions: [{ field: 'value', operator: 'greater_than', value: 1000 }],
      actions: [
        {
          type: 'create_task',
          config: { taskTitle: 'Follow-up with client', taskDueDays: 1 },
        },
      ],
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    const sampleLead = {
      id: 'lead-test-100',
      workspaceId: 'ws-test',
      title: 'Enterprise Licence',
      company: 'Acme Corp',
      contactName: 'Alice',
      email: 'alice@acme.com',
      value: 5000,
      stageId: 'stg-new-lead',
      status: 'Qualified' as const,
      closingProbability: 25,
      expectedCloseDate: '2026-11-15',
      ownerId: 'mem-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = await executeWorkflow(rule, sampleLead, { isDryRun: true });
    assert.equal(result.status, 'success');
    assert.ok(result.id, 'Must generate run ID');
    assert.ok(result.steps && result.steps.length > 0, 'Must have step logs');
  });
});

describe('Rapport CRM — Google Calendar & OAuth Repository Tests', () => {
  test('OAuth tokens are safely persisted and retrieved from local storage fallback', async () => {
    const wsId = 'ws-unit-test';
    const sampleToken = {
      workspaceId: wsId,
      provider: 'google_calendar' as const,
      accessToken: 'test-access-token-12345',
      refreshToken: 'test-refresh-token-67890',
      expiryDate: Date.now() + 3600000,
      scope: 'https://www.googleapis.com/auth/calendar.events',
      tokenType: 'Bearer',
      email: 'user@example.com',
      updatedAt: new Date().toISOString(),
    };

    await crmRepo.saveOAuthTokens(sampleToken);
    const retrieved = await crmRepo.getOAuthTokens(wsId);

    assert.ok(retrieved, 'Token record should be retrieved');
    assert.equal(retrieved?.workspaceId, wsId);
    assert.equal(retrieved?.email, 'user@example.com');
    assert.equal(retrieved?.accessToken, 'test-access-token-12345');

    // Clean up
    await crmRepo.deleteOAuthTokens(wsId);
    const afterDelete = await crmRepo.getOAuthTokens(wsId);
    assert.equal(afterDelete, null, 'Token record should be deleted');
  });

  test('Calendar meeting rescheduling updates time without duplicating event', async () => {
    const wsId = 'ws-unit-test';
    const newMeeting = await crmRepo.createCalendarEvent(wsId, {
      title: 'Product Demonstration',
      startIso: '2026-11-01T10:00:00.000Z',
      endIso: '2026-11-01T10:45:00.000Z',
      attendees: ['client@corp.com'],
      meetUrl: 'https://meet.google.com/rap-demo-123',
      googleEventId: 'gcal-evt-123',
      synced: true,
    });

    assert.ok(newMeeting.id, 'Meeting should have an ID');

    const updated = await crmRepo.updateCalendarEvent(wsId, newMeeting.id, {
      startIso: '2026-11-02T14:00:00.000Z',
      endIso: '2026-11-02T14:45:00.000Z',
      status: 'confirmed',
    });

    assert.ok(updated, 'Should return updated event');
    assert.equal(updated?.startIso, '2026-11-02T14:00:00.000Z');

    // Cancellation test
    await crmRepo.deleteCalendarEvent(wsId, newMeeting.id);
    const events = await crmRepo.getCalendarEvents(wsId);
    const found = events.find((e) => e.id === newMeeting.id);
    assert.ok(found?.status === 'cancelled' || !found, 'Event should be marked cancelled or removed');
  });
});
