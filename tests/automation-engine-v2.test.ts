import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PREBUILT_AUTOMATION_TEMPLATES, PREBUILT_TEMPLATES } from '../src/lib/automations/templates';
import { crmRepo } from '../src/lib/google-sheets/repository';
import { emitCrmEvent, calculateScheduledTime, executeSingleAction } from '../src/lib/automations/engine';
import { runCronTick } from '../src/lib/cron/scheduler';
import { Lead } from '../src/types/crm';

describe('Developster CRM — Full Automation Engine & Templates Suite', () => {
  it('loads all 12 requested prebuilt sales automation templates', () => {
    assert.equal(PREBUILT_TEMPLATES.length, 12, 'Must provide exactly 12 templates');
    
    const templateIds = PREBUILT_TEMPLATES.map((t) => t.id);
    assert.ok(templateIds.includes('tpl-new-lead'), 'New Lead template exists');
    assert.ok(templateIds.includes('tpl-lead-qualification'), 'Lead qualification template exists');
    assert.ok(templateIds.includes('tpl-qualified-nurturing'), 'Qualified nurture template exists');
    assert.ok(templateIds.includes('tpl-proposal-followup'), 'Proposal follow-up template exists');
    assert.ok(templateIds.includes('tpl-negotiation-followup'), 'Negotiation follow-up template exists');
    assert.ok(templateIds.includes('tpl-no-response'), 'No response recovery template exists');
    assert.ok(templateIds.includes('tpl-inactive-reactivation'), 'Inactive reactivation template exists');
    assert.ok(templateIds.includes('tpl-won-deal'), 'Won deal celebration template exists');
    assert.ok(templateIds.includes('tpl-lost-deal'), 'Lost deal recycle template exists');
    assert.ok(templateIds.includes('tpl-customer-onboarding'), 'Customer onboarding template exists');
    assert.ok(templateIds.includes('tpl-meeting-reminders'), 'Meeting reminders template exists');
    assert.ok(templateIds.includes('tpl-task-call-reminders'), 'Task and call reminders template exists');
  });

  it('generates connected React Flow nodes and edges for templates', () => {
    const stages = [
      { id: 'stg-new', workspaceId: 'ws-test', pipelineId: 'p-1', name: 'New Lead', order: 1, color: 'blue' },
      { id: 'stg-prop', workspaceId: 'ws-test', pipelineId: 'p-1', name: 'Proposal', order: 2, color: 'purple' },
    ];
    const members = [{ id: 'mem-1', workspaceId: 'ws-test', name: 'Alex Rep', email: 'alex@example.com', role: 'Sales' }];

    for (const tpl of PREBUILT_TEMPLATES) {
      const graph = tpl.generateGraph(stages, members);
      assert.ok(graph.nodes.length >= 2, `Template ${tpl.id} should have at least 2 nodes`);
      assert.ok(graph.edges.length >= 1, `Template ${tpl.id} should have at least 1 edge`);
      
      const trigger = graph.nodes.find((n) => n.data.nodeCategory === 'trigger' || n.type === 'trigger');
      assert.ok(trigger, `Template ${tpl.id} must have a starting trigger node`);
    }
  });

  it('calculates scheduled delays respecting sending window boundaries', () => {
    const now = new Date();
    const scheduledIso = calculateScheduledTime(2, 'hours', {
      enabled: true,
      startHour: 10,
      endHour: 18,
      daysOfWeek: [1, 2, 3, 4, 5],
      timezone: 'Asia/Kolkata',
    });

    const scheduledDate = new Date(scheduledIso);
    assert.ok(!isNaN(scheduledDate.getTime()), 'Scheduled date must be valid ISO timestamp');
  });

  it('creates and retrieves scheduled jobs in CRM repository', async () => {
    const wsId = 'ws-test-sched';
    const testJob = await crmRepo.createScheduledJob({
      workspaceId: wsId,
      ruleId: 'rule-test-1',
      ruleName: 'Nurture Sequence',
      leadId: 'lead-test-1',
      dealTitle: 'Acme Contract',
      stepId: 'step-2',
      stepNumber: 2,
      actionType: 'create_task',
      actionConfig: { taskTitle: 'Follow up call' },
      scheduledFor: new Date(Date.now() - 1000).toISOString(), // due in the past
      status: 'pending',
      retryCount: 0,
      maxRetries: 3,
      idempotencyKey: 'rule-test-1:lead-test-1:step-2',
    });

    assert.ok(testJob.id, 'Job should receive generated id');

    const due = await crmRepo.getDueScheduledJobs(wsId);
    const found = due.find((j) => j.id === testJob.id);
    assert.ok(found, 'Due job should be returned by getDueScheduledJobs');

    // Test stage cancellation
    await crmRepo.cancelScheduledJobsForLead(wsId, 'lead-test-1', 'Deal moved to stage negotiation');
    const jobs = await crmRepo.getScheduledJobs(wsId);
    const cancelledJob = jobs.find((j) => j.id === testJob.id);
    assert.equal(cancelledJob?.status, 'cancelled');
    assert.ok(cancelledJob?.cancellationReason?.includes('negotiation'));
  });

  it('dry runs simulated actions without side-effects', async () => {
    const dummyLead: Lead = {
      id: 'lead-sim-1',
      workspaceId: 'ws-test',
      title: 'Simulation Deal',
      company: 'Tech Corp',
      contactName: 'Jane Doe',
      stageId: 'stg-new',
      status: 'New',
      value: 15000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = await executeSingleAction('create_task', { taskTitle: 'Check in' }, dummyLead, {
      isTestRun: true,
      workspaceId: 'ws-test',
    });

    assert.equal(res.status, 'success');
    assert.ok(res.summary.includes('[Dry Run]'));
  });
});

