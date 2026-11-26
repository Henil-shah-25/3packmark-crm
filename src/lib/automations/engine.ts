import {
  AutomationRule,
  AutomationRun,
  AutomationRunStep,
  Lead,
  TriggerType,
  ActionType,
  VisualWorkflowNode,
  VisualWorkflowEdge,
  ScheduledJob,
  AutomationSendingWindow,
} from '@/types/crm';
import { crmRepo } from '@/lib/google-sheets/repository';
import { sendTemplatedEmail, renderTemplate, renderTemplateString } from '@/lib/email/template-engine';
import { sendWhatsAppMessage } from '@/lib/communication/whatsapp';
import { sendSmsMessage } from '@/lib/communication/sms';

export { validateVisualWorkflow, type ValidationIssue } from './validator';

// In-memory idempotency deduplication cache (ruleId:leadId:triggerEvent:targetStage)
const executedTriggerEvents = new Set<string>();

export interface CrmEventPayload {
  type: TriggerType;
  leadId: string;
  previousStageId?: string;
  newStageId?: string;
  pipelineId?: string;
  workspaceId?: string;
  depth?: number;
  metadata?: Record<string, any>;
}

/**
 * Calculates future scheduled execution date based on delay and sending window constraints.
 */
export function calculateScheduledTime(
  delayAmount: number,
  delayUnit: 'minutes' | 'hours' | 'days' | 'weeks',
  sendingWindow?: AutomationSendingWindow
): string {
  let ms = 0;
  switch (delayUnit) {
    case 'minutes':
      ms = delayAmount * 60 * 1000;
      break;
    case 'hours':
      ms = delayAmount * 60 * 60 * 1000;
      break;
    case 'days':
      ms = delayAmount * 24 * 60 * 60 * 1000;
      break;
    case 'weeks':
      ms = delayAmount * 7 * 24 * 60 * 60 * 1000;
      break;
    default:
      ms = delayAmount * 60 * 1000;
  }

  let scheduledDate = new Date(Date.now() + ms);

  // If sending window is enabled, ensure execution lands within allowed business hours & days
  if (sendingWindow && sendingWindow.enabled) {
    const allowedDays = sendingWindow.daysOfWeek && sendingWindow.daysOfWeek.length > 0
      ? sendingWindow.daysOfWeek
      : [1, 2, 3, 4, 5, 6]; // Mon-Sat default
    const startHour = sendingWindow.startHour ?? 10;
    const endHour = sendingWindow.endHour ?? 18;

    for (let i = 0; i < 14; i++) {
      const currentDay = scheduledDate.getDay();
      const currentHour = scheduledDate.getHours();
      const isAllowedDay = allowedDays.includes(currentDay);

      if (!isAllowedDay) {
        scheduledDate.setDate(scheduledDate.getDate() + 1);
        scheduledDate.setHours(startHour, 0, 0, 0);
        continue;
      }

      if (currentHour < startHour) {
        scheduledDate.setHours(startHour, 0, 0, 0);
        break;
      }

      if (currentHour >= endHour) {
        scheduledDate.setDate(scheduledDate.getDate() + 1);
        scheduledDate.setHours(startHour, 0, 0, 0);
        continue;
      }

      break;
    }
  }

  return scheduledDate.toISOString();
}

/**
 * SINGLE SERVER-SIDE EVENT HOOK
 * Triggered whenever leads are created, stages change, or scheduler runs time-based checks.
 * Features:
 * - Dynamic rule lookup from CRM data (no hardcoding).
 * - Stage-aware intelligent auto-cancellation of pending jobs.
 * - Multi-step sequence scheduling backed by Google Sheets and local store.
 * - Idempotency: the same automation never runs twice for the same lead and the same trigger event.
 * - Loop protection: max 3 chained automations triggered by automation-caused stage moves.
 */
export async function emitCrmEvent(event: CrmEventPayload): Promise<AutomationRun[]> {
  const wsId = event.workspaceId || 'ws-default';
  const currentDepth = event.depth || 0;

  // Loop protection: stop if chained beyond 3 levels
  if (currentDepth > 3) {
    console.warn(`[Automations Engine] Loop protection triggered. Max depth of 3 reached for lead ${event.leadId}.`);
    return [];
  }

  // Auto-cancellation of pending scheduled jobs when stage changes or deal closes
  if (event.type === 'deal_stage_changed') {
    try {
      await crmRepo.cancelScheduledJobsForLead(
        wsId,
        event.leadId,
        `Deal moved from stage ${event.previousStageId || 'prior'} to ${event.newStageId}`
      );
    } catch (cancelErr) {
      console.warn('[Automations Engine] Stage change cancellation warning:', cancelErr);
    }
  }

  const leads = await crmRepo.getLeads(wsId);
  const lead = leads.find((l) => l.id === event.leadId);
  if (!lead) {
    console.warn(`[Automations Engine] Lead ${event.leadId} not found for event ${event.type}`);
    return [];
  }

  const automations = await crmRepo.getAutomations(wsId);
  const activeRules = automations.filter((r) => r.isActive);
  console.log(`[Automations Engine] Event "${event.type}" on lead ${lead.id} (${lead.title}). Active rules: ${activeRules.length}`);
  const executedRuns: AutomationRun[] = [];

  for (const rule of activeRules) {
    // 1. Check if trigger matches
    const matchesTrigger = isTriggerMatching(rule, event, lead);
    console.log(`[Automations Engine] Rule "${rule.name}" (${rule.id}) matches trigger: ${matchesTrigger}`);
    if (!matchesTrigger) continue;

    // 2. Idempotency Check
    const idempotencyKey = `${rule.id}:${lead.id}:${event.type}:${event.newStageId || ''}`;
    if (executedTriggerEvents.has(idempotencyKey)) {
      console.log(`[Automations Engine] Skipping duplicate trigger run for key: ${idempotencyKey}`);
      continue;
    }

    // Also check persistent run history if available
    try {
      const pastRuns = await crmRepo.getAutomationRuns(wsId);
      const alreadyRan = pastRuns.some(
        (r) => r.ruleId === rule.id && r.leadId === lead.id && r.triggerEvent === event.type && r.status === 'success'
      );
      if (alreadyRan && (event.type === 'lead_created' || event.type === 'deal_stage_changed')) {
        executedTriggerEvents.add(idempotencyKey);
        continue;
      }
    } catch {}

    executedTriggerEvents.add(idempotencyKey);

    // 3. Multi-Step Automation Sequence Handler
    if (rule.sequence && rule.sequence.length > 0) {
      console.log(`[Automations Engine] Handling multi-step sequence for rule "${rule.name}" (${rule.sequence.length} steps)`);
      const steps = [...rule.sequence].sort((a, b) => a.stepNumber - b.stepNumber);
      const step1 = steps[0];

      if (step1.delayAmount === 0 || !step1.delayAmount) {
        // Execute Step 1 immediately
        await executeSingleAction(step1.actionType, step1.actionConfig, lead, {
          workspaceId: wsId,
          depth: currentDepth,
        });

        // Queue Step 2 if multi-step sequence
        if (steps.length > 1) {
          const step2 = steps[1];
          const scheduledFor = calculateScheduledTime(step2.delayAmount, step2.delayUnit, rule.sendingWindow);
          await crmRepo.createScheduledJob({
            workspaceId: wsId,
            ruleId: rule.id,
            ruleName: rule.name,
            leadId: lead.id,
            dealTitle: lead.title,
            stepId: step2.id,
            stepNumber: step2.stepNumber,
            actionType: step2.actionType,
            actionConfig: step2.actionConfig,
            scheduledFor,
            status: 'pending',
            retryCount: 0,
            maxRetries: 3,
            idempotencyKey: `${rule.id}:${lead.id}:step-${step2.stepNumber}`,
          });
          console.log(`[Automations Engine] Queued step ${step2.stepNumber} for lead ${lead.id} at ${scheduledFor}`);
        }
      } else {
        // Step 1 itself is delayed
        const scheduledFor = calculateScheduledTime(step1.delayAmount, step1.delayUnit, rule.sendingWindow);
        await crmRepo.createScheduledJob({
          workspaceId: wsId,
          ruleId: rule.id,
          ruleName: rule.name,
          leadId: lead.id,
          dealTitle: lead.title,
          stepId: step1.id,
          stepNumber: step1.stepNumber,
          actionType: step1.actionType,
          actionConfig: step1.actionConfig,
          scheduledFor,
          status: 'pending',
          retryCount: 0,
          maxRetries: 3,
          idempotencyKey: `${rule.id}:${lead.id}:step-${step1.stepNumber}`,
        });
        console.log(`[Automations Engine] Queued initial step 1 for lead ${lead.id} at ${scheduledFor}`);
      }
    }

    // 4. Execute Visual Graph or Linear Actions
    const run = await executeWorkflow(rule, lead, {
      triggerEvent: event.type,
      workspaceId: wsId,
      depth: currentDepth,
    });
    executedRuns.push(run);
  }

  return executedRuns;
}

/**
 * Checks whether an automation's trigger matches a CRM event
 */
function isTriggerMatching(rule: AutomationRule, event: CrmEventPayload, lead: Lead): boolean {
  // Check trigger from visual trigger node if present
  let ruleTriggerType = rule.triggerType;
  let ruleTriggerStageId = rule.triggerStageId;
  let ruleTriggerPipelineId: string | undefined;

  if (rule.nodes && rule.nodes.length > 0) {
    const triggerNode = rule.nodes.find((n) => n.data.nodeCategory === 'trigger' || n.type === 'trigger');
    if (triggerNode) {
      ruleTriggerType = triggerNode.data.triggerType || ruleTriggerType;
      ruleTriggerStageId = triggerNode.data.triggerConfig?.stageId || triggerNode.data.stageId || ruleTriggerStageId;
      ruleTriggerPipelineId = triggerNode.data.triggerConfig?.pipelineId;
    }
  }

  const effectivePipelineId = (rule as any).pipelineId || ruleTriggerPipelineId;
  if (event.pipelineId && effectivePipelineId && event.pipelineId !== effectivePipelineId) {
    return false;
  }

  // A) Lead Created
  if (event.type === 'lead_created' || event.type === 'deal_created') {
    return ruleTriggerType === 'lead_created' || ruleTriggerType === 'deal_created';
  }

  // B) Moved into a stage
  if (event.type === 'deal_stage_changed') {
    if (ruleTriggerType !== 'deal_stage_changed') return false;
    // If specific stage is designated in trigger
    if (ruleTriggerStageId && event.newStageId) {
      return (
        ruleTriggerStageId === event.newStageId ||
        ruleTriggerStageId.toLowerCase() === (event.newStageId || '').toLowerCase() ||
        ruleTriggerStageId === lead.status
      );
    }
    return true;
  }

  // C) Time-based triggers
  if (event.type === 'stage_unchanged_days' && ruleTriggerType === 'stage_unchanged_days') {
    return !ruleTriggerStageId || ruleTriggerStageId === event.newStageId || ruleTriggerStageId === lead.stageId;
  }

  if (event.type === 'no_activity_days' && ruleTriggerType === 'no_activity_days') {
    return true;
  }

  if (event.type === 'meeting_booked' && (ruleTriggerType === 'meeting_booked' || ruleTriggerType === 'meeting_created')) {
    return true;
  }

  if (event.type === 'meeting_30m_away' && ruleTriggerType === 'meeting_30m_away') {
    return true;
  }

  return ruleTriggerType === event.type;
}

/**
 * Backend workflow executor.
 */
export async function executeWorkflow(
  workflow: AutomationRule,
  lead: Lead,
  context: {
    triggerEvent: string;
    isTestRun?: boolean;
    workspaceId: string;
    depth?: number;
  }
): Promise<AutomationRun> {
  const runId = `run-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const startTime = new Date().toISOString();
  const stepLogs: AutomationRunStep[] = [];
  const actionsExecuted: string[] = [];

  try {
    if (workflow.nodes && workflow.nodes.length > 0 && workflow.edges) {
      await executeVisualGraph(workflow, lead, context, stepLogs, actionsExecuted);
    } else {
      await executeLinearRule(workflow, lead, context, stepLogs, actionsExecuted);
    }

    const run: AutomationRun = {
      id: runId,
      workspaceId: context.workspaceId,
      ruleId: workflow.id,
      ruleName: workflow.name,
      leadId: lead.id,
      dealTitle: lead.title,
      status: 'success',
      triggerEvent: context.triggerEvent,
      actionsExecuted,
      steps: stepLogs,
      log: `Successfully executed ${actionsExecuted.length} automated actions for "${lead.title}".`,
      executedAt: startTime,
    };

    if (!context.isTestRun) {
      await recordRunPersistently(context.workspaceId, workflow.id, run);
    }

    return run;
  } catch (err: any) {
    const failedRun: AutomationRun = {
      id: runId,
      workspaceId: context.workspaceId,
      ruleId: workflow.id,
      ruleName: workflow.name,
      leadId: lead.id,
      dealTitle: lead.title,
      status: 'failed',
      triggerEvent: context.triggerEvent,
      actionsExecuted,
      steps: stepLogs,
      error: err.message || 'Workflow execution encountered an error.',
      log: `Execution halted with error: ${err.message}`,
      executedAt: startTime,
    };

    if (!context.isTestRun) {
      await recordRunPersistently(context.workspaceId, workflow.id, failedRun);
    }

    return failedRun;
  }
}

/**
 * Traverses visual node graph from trigger node down each branch.
 * Supports startNodeIds for resuming after scheduled delays.
 */
async function executeVisualGraph(
  workflow: AutomationRule,
  lead: Lead,
  context: { isTestRun?: boolean; workspaceId: string; depth?: number },
  stepLogs: AutomationRunStep[],
  actionsExecuted: string[],
  startNodeIds?: string[]
) {
  const nodes = workflow.nodes || [];
  const edges = workflow.edges || [];

  let queue: string[] = [];

  if (startNodeIds && startNodeIds.length > 0) {
    // Resuming workflow after scheduled delay
    queue = [...startNodeIds];
  } else {
    const triggerNode = nodes.find((n) => n.data?.nodeCategory === 'trigger' || n.type === 'trigger');
    if (!triggerNode) {
      throw new Error('No starting trigger node found in visual workflow.');
    }

    stepLogs.push({
      nodeId: triggerNode.id,
      nodeLabel: triggerNode.data?.label || 'Workflow Trigger',
      type: 'trigger',
      status: 'success',
      detail: `Trigger matched for "${lead.title}" (${lead.company || 'Individual'})`,
      executedAt: new Date().toISOString(),
    });

    queue = [triggerNode.id];
  }

  const visited = new Set<string>();

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const currentNode = nodes.find((n) => n.id === currentId);
    if (!currentNode) continue;

    const nodeCat = ((currentNode.data?.nodeCategory || currentNode.type) ?? '') as string;

    // 1. Condition Node
    if (nodeCat === 'condition') {
      const conditionPassed = evaluateConditions(
        currentNode.data?.conditions || [],
        lead,
        currentNode.data?.conditionLogic || 'AND'
      );

      stepLogs.push({
        nodeId: currentNode.id,
        nodeLabel: currentNode.data?.label || 'Condition Check',
        type: 'condition',
        status: conditionPassed ? 'success' : 'skipped',
        detail: conditionPassed ? 'All condition criteria met (Yes branch)' : 'Criteria not met (No branch)',
        executedAt: new Date().toISOString(),
      });

      const targetHandle = conditionPassed ? 'yes' : 'no';
      const outgoingEdges = edges.filter((e) => e.source === currentId);

      for (const edge of outgoingEdges) {
        if (!edge.sourceHandle || edge.sourceHandle === targetHandle) {
          queue.push(edge.target);
        }
      }
      continue;
    }

    // 2. Delay / Wait Node
    if (nodeCat === 'delay' || nodeCat === 'wait' || nodeCat === 'wait_delay') {
      const delayConfig = currentNode.data?.delayConfig || { delayAmount: 1, delayUnit: 'hours', preset: '1h' };
      const outgoingEdges = edges.filter((e) => e.source === currentId);
      const targetNodeIds = outgoingEdges.map((e) => e.target);

      if (context.isTestRun) {
        stepLogs.push({
          nodeId: currentNode.id,
          nodeLabel: currentNode.data?.label || 'Wait Node',
          type: 'delay',
          status: 'success',
          detail: `[Dry Run] Would pause execution for ${delayConfig.delayAmount || 1} ${delayConfig.delayUnit || 'hours'}. Continuing test simulation.`,
          executedAt: new Date().toISOString(),
        });
        for (const edge of outgoingEdges) {
          queue.push(edge.target);
        }
      } else {
        // Compute scheduled time in UTC
        let scheduledFor: string;
        if (delayConfig.preset === 'specific_date' && delayConfig.specificDate) {
          scheduledFor = new Date(delayConfig.specificDate).toISOString();
        } else {
          scheduledFor = calculateScheduledTime(
            delayConfig.delayAmount || 1,
            delayConfig.delayUnit || 'hours',
            delayConfig.respectSendingWindow ? workflow.sendingWindow : undefined
          );
        }

        // Create persistent scheduled job
        try {
          const job = await crmRepo.createScheduledJob({
            workspaceId: context.workspaceId,
            ruleId: workflow.id,
            ruleName: workflow.name,
            leadId: lead.id,
            dealTitle: lead.title,
            stepId: currentNode.id,
            stepNumber: 1,
            actionType: 'execute_workflow_node',
            actionConfig: { targetNodeIds },
            nodeId: currentNode.id,
            remainingNodeIds: targetNodeIds,
            scheduledFor,
            status: 'pending',
            retryCount: 0,
            maxRetries: 3,
            idempotencyKey: `${workflow.id}:${lead.id}:${currentNode.id}`,
          });

          // Attempt QStash async publish if enabled
          try {
            const { scheduleQStashJob } = await import('@/lib/cron/qstash');
            await scheduleQStashJob(job);
          } catch {
            // Graceful fallback to daily cron / manual queue
          }
        } catch (jobErr: any) {
          console.warn('[Workflow Engine] Error scheduling delay job:', jobErr.message);
        }

        stepLogs.push({
          nodeId: currentNode.id,
          nodeLabel: currentNode.data?.label || 'Wait Node',
          type: 'delay',
          status: 'success',
          detail: `Workflow paused for ${delayConfig.delayAmount || 1} ${delayConfig.delayUnit || 'hours'}. Resumes at ${scheduledFor}.`,
          executedAt: new Date().toISOString(),
        });

        // Do not add outgoing edges to immediate execution queue. Branch halts until scheduled time arrives.
      }
      continue;
    }

    // 3. Action Node
    if (nodeCat === 'action') {
      const actionType = currentNode.data?.actionType || (currentNode.data as any)?.action;
      const actionConfig = currentNode.data?.actionConfig || {};

      const result = await executeSingleAction(actionType, actionConfig, lead, context);
      actionsExecuted.push(result.summary);

      stepLogs.push({
        nodeId: currentNode.id,
        nodeLabel: currentNode.data?.label || 'Action Step',
        type: 'action',
        status: result.status,
        detail: result.summary,
        executedAt: new Date().toISOString(),
      });

      const outgoingEdges = edges.filter((e) => e.source === currentId);
      for (const edge of outgoingEdges) {
        queue.push(edge.target);
      }
      continue;
    }

    // 4. Terminal / End Node
    if (nodeCat === 'end') {
      stepLogs.push({
        nodeId: currentNode.id,
        nodeLabel: currentNode.data?.label || 'End Workflow',
        type: 'end',
        status: 'success',
        detail: 'Terminal point reached. Workflow completed successfully.',
        executedAt: new Date().toISOString(),
      });
      continue;
    }

    // Default passthrough for any other node types
    const outgoingEdges = edges.filter((e) => e.source === currentId);
    for (const edge of outgoingEdges) {
      queue.push(edge.target);
    }
  }
}

/**
 * Resumes execution of a visual graph from designated target node IDs.
 * Called by scheduler when a scheduled delay expires.
 */
export async function resumeVisualGraph(
  workflow: AutomationRule,
  lead: Lead,
  startNodeIds: string[],
  context: { isTestRun?: boolean; workspaceId: string; depth?: number }
): Promise<AutomationRun> {
  const startTime = new Date().toISOString();
  const stepLogs: AutomationRunStep[] = [];
  const actionsExecuted: string[] = [];

  try {
    await executeVisualGraph(workflow, lead, context, stepLogs, actionsExecuted, startNodeIds);
    const run: AutomationRun = {
      id: `run-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      workspaceId: context.workspaceId,
      ruleId: workflow.id,
      ruleName: workflow.name,
      leadId: lead.id,
      dealTitle: lead.title,
      status: 'success',
      triggerEvent: 'scheduled_resume',
      actionsExecuted,
      steps: stepLogs,
      log: `Resumed workflow at node(s): ${startNodeIds.join(', ')}`,
      executedAt: startTime,
    };
    if (!context.isTestRun) {
      await recordRunPersistently(context.workspaceId, workflow.id, run);
    }
    return run;
  } catch (err: any) {
    const failedRun: AutomationRun = {
      id: `run-err-${Date.now()}`,
      workspaceId: context.workspaceId,
      ruleId: workflow.id,
      ruleName: workflow.name,
      leadId: lead.id,
      dealTitle: lead.title,
      status: 'failed',
      triggerEvent: 'scheduled_resume',
      actionsExecuted,
      steps: stepLogs,
      error: err.message || 'Error resuming visual workflow.',
      log: `Resumed execution failed: ${err.message}`,
      executedAt: startTime,
    };
    if (!context.isTestRun) {
      await recordRunPersistently(context.workspaceId, workflow.id, failedRun);
    }
    return failedRun;
  }
}

/**
 * Linear rule execution fallback
 */
async function executeLinearRule(
  workflow: AutomationRule,
  lead: Lead,
  context: { isTestRun?: boolean; workspaceId: string; depth?: number },
  stepLogs: AutomationRunStep[],
  actionsExecuted: string[]
) {
  const conditions = workflow.conditions || [];
  const passed = evaluateConditions(conditions, lead, 'AND');
  if (!passed) {
    stepLogs.push({
      nodeId: 'cond-main',
      nodeLabel: 'Conditions Check',
      type: 'condition',
      status: 'skipped',
      detail: 'Rule conditions did not match lead record properties.',
      executedAt: new Date().toISOString(),
    });
    return;
  }

  const actions = workflow.actions || [];
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const result = await executeSingleAction(action.type, action.config, lead, context);
    actionsExecuted.push(result.summary);
    stepLogs.push({
      nodeId: `action-${i}`,
      nodeLabel: `Action ${i + 1}`,
      type: 'action',
      status: result.status,
      detail: result.summary,
      executedAt: new Date().toISOString(),
    });
  }
}

/**
 * Condition evaluator supporting deal value, source, owner, email, phone, industry
 */
export function evaluateConditions(
  conditions: any[],
  lead: Lead,
  logic: 'AND' | 'OR' = 'AND'
): boolean {
  if (!conditions || conditions.length === 0) return true;

  const results: boolean[] = conditions.map((cond) => {
    let rawVal: any;

    // Special field normalizations
    if (cond.field === 'has_email') {
      const hasEmail = Boolean(lead.email && lead.email.trim());
      return cond.operator === 'equals' ? hasEmail === (cond.value === true || cond.value === 'true') : hasEmail;
    }
    if (cond.field === 'has_phone') {
      const hasPhone = Boolean(lead.phone && lead.phone.trim());
      return cond.operator === 'equals' ? hasPhone === (cond.value === true || cond.value === 'true') : hasPhone;
    }
    if (cond.field === 'source' || cond.field === 'leadSource') {
      rawVal = lead.leadSource || lead.source;
    } else {
      rawVal = (lead as any)[cond.field];
    }

    if (cond.operator === 'equals') return String(rawVal ?? '').toLowerCase() === String(cond.value ?? '').toLowerCase();
    if (cond.operator === 'not_equals') return String(rawVal ?? '').toLowerCase() !== String(cond.value ?? '').toLowerCase();
    if (cond.operator === 'greater_than') return Number(rawVal || 0) > Number(cond.value || 0);
    if (cond.operator === 'less_than') return Number(rawVal || 0) < Number(cond.value || 0);
    if (cond.operator === 'contains') return String(rawVal ?? '').toLowerCase().includes(String(cond.value ?? '').toLowerCase());
    if (cond.operator === 'is_empty') return rawVal === undefined || rawVal === null || String(rawVal).trim() === '';
    if (cond.operator === 'is_not_empty') return rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '';

    return true;
  });

  return logic === 'OR' ? results.some(Boolean) : results.every(Boolean);
}

/**
 * Executes a single concrete action against CRM data, templates, or Google Workspace
 */
export async function executeSingleAction(
  actionType?: string,
  config?: any,
  lead?: Lead,
  context?: { isTestRun?: boolean; workspaceId: string; depth?: number }
): Promise<{ summary: string; status: 'success' | 'skipped' | 'failed' }> {
  const wsId = context?.workspaceId || lead?.workspaceId || 'ws-default';
  const cfg = config || {};

  // 1. Dry run simulation check
  if (context?.isTestRun) {
    if (actionType === 'send_template' || actionType === 'send_email') {
      const templateName = cfg.templateName || cfg.templateId || 'Selected Template';
      if (!lead?.email || !lead.email.trim()) {
        return { summary: `[Dry Run] Would skip email (no email on lead): ${templateName}`, status: 'skipped' };
      }
      return { summary: `[Dry Run] Would send email template "${templateName}" to ${lead.email}`, status: 'success' };
    }
    if (actionType === 'create_task') {
      return { summary: `[Dry Run] Would create task: "${cfg.taskTitle || 'Follow-up'}" (Due in ${cfg.taskDueDays || 1}d)`, status: 'success' };
    }
    if (actionType === 'move_stage') {
      return { summary: `[Dry Run] Would move lead to stage: "${cfg.targetStageName || cfg.targetStageId || cfg.stageId}"`, status: 'success' };
    }
    if (actionType === 'notify_me' || actionType === 'notify') {
      return { summary: `[Dry Run] Would notify user: "${cfg.message || 'Notification'}"`, status: 'success' };
    }
    if (actionType === 'assign_owner') {
      return { summary: `[Dry Run] Would assign lead owner to: "${cfg.ownerName || cfg.ownerId}"`, status: 'success' };
    }
    if (actionType === 'add_note') {
      return { summary: `[Dry Run] Would add note: "${cfg.noteText || ''}"`, status: 'success' };
    }
    return { summary: `[Dry Run] Would execute ${actionType}`, status: 'success' };
  }

  if (!lead) {
    return { summary: 'No lead context provided for action', status: 'failed' };
  }

  // 2. SEND EMAIL TEMPLATE
  if (actionType === 'send_template' || actionType === 'send_email') {
    const templateId = cfg.templateId || cfg.emailTemplateId;
    if (!templateId) {
      return { summary: 'Skipped email: No template selected', status: 'skipped' };
    }

    if (!lead.email || !lead.email.trim()) {
      // Per instructions: "Skip email actions if the lead has no email, and log 'skipped: no email'"
      return { summary: 'skipped: no email', status: 'skipped' };
    }

    const sendRes = await sendTemplatedEmail(lead.id, templateId, {
      workspaceId: wsId,
      isAutomation: true,
    });

    if (sendRes.skipped) {
      return { summary: 'skipped: no email', status: 'skipped' };
    }

    if (!sendRes.success) {
      return { summary: `Email dispatch failed: ${sendRes.error}`, status: 'failed' };
    }

    return { summary: `Sent automation email using template to ${lead.email}`, status: 'success' };
  }

  // 3. CREATE TASK
  if (actionType === 'create_task') {
    const days = Number(cfg.taskDueDays || cfg.taskDueOffsetDays || 1);
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + days);

    const taskTitle = cfg.taskTitle || `Follow up: ${lead.title || lead.company}`;

    await crmRepo.createTask({
      workspaceId: wsId,
      leadId: lead.id,
      dealTitle: lead.title,
      title: taskTitle,
      priority: 'medium',
      dueDate: dueDate.toISOString().split('T')[0],
      dueAt: dueDate.toISOString(),
      completed: false,
      ownerId: cfg.ownerId || lead.ownerId || 'mem-1',
      type: cfg.taskType || 'follow_up',
      status: 'open',
      source: 'auto',
      notes: 'Created automatically by CRM Automation Engine',
    });

    return { summary: `Created task: "${taskTitle}"`, status: 'success' };
  }

  // 4. MOVE STAGE
  if (actionType === 'move_stage') {
    const targetStageId = cfg.targetStageId || cfg.stageId;
    if (targetStageId && targetStageId !== lead.stageId) {
      await crmRepo.updateLead(wsId, lead.id, { stageId: targetStageId });

      // Chained automation trigger with loop protection
      const nextDepth = (context?.depth || 0) + 1;
      if (nextDepth <= 3) {
        // Emit stage change asynchronously
        setTimeout(() => {
          emitCrmEvent({
            type: 'deal_stage_changed',
            leadId: lead.id,
            previousStageId: lead.stageId,
            newStageId: targetStageId,
            workspaceId: wsId,
            depth: nextDepth,
          }).catch((e) => console.error('[Chained Automation Error]:', e));
        }, 50);
      }

      return { summary: `Moved deal to stage "${cfg.targetStageName || targetStageId}"`, status: 'success' };
    }
    return { summary: 'Stage already matches target stage', status: 'skipped' };
  }

  // 5. NOTIFY ME
  if (actionType === 'notify_me' || actionType === 'notify') {
    const message = cfg.message || `Automation triggered for ${lead.company || lead.title}`;
    await crmRepo.createNotification(wsId, {
      title: 'Automation Alert',
      message,
      type: 'system',
      leadId: lead.id,
    });
    return { summary: `Created in-app notification: "${message}"`, status: 'success' };
  }

  // 6. ASSIGN OWNER
  if (actionType === 'assign_owner') {
    if (cfg.ownerId) {
      await crmRepo.updateLead(wsId, lead.id, { ownerId: cfg.ownerId });
      return { summary: `Assigned owner to "${cfg.ownerName || cfg.ownerId}"`, status: 'success' };
    }
    return { summary: 'No owner ID specified', status: 'skipped' };
  }

  // 7. ADD NOTE
  if (actionType === 'add_note') {
    const note = cfg.noteText || cfg.message || '';
    if (note) {
      const existingNotes = lead.notes || '';
      const updatedNotes = existingNotes ? `${existingNotes}\n\n[Automation Note]: ${note}` : `[Automation Note]: ${note}`;
      await crmRepo.updateLead(wsId, lead.id, { notes: updatedNotes });
      await crmRepo.logActivity(wsId, {
        leadId: lead.id,
        type: 'note',
        title: 'Automation Note Added',
        description: note,
        authorName: 'Automation',
      });
      return { summary: `Added note: "${note.substring(0, 50)}..."`, status: 'success' };
    }
    return { summary: 'No note content provided', status: 'skipped' };
  }

  // 8. SEND WHATSAPP MESSAGE
  if (actionType === 'send_whatsapp') {
    if (!lead.phone || !lead.phone.trim()) {
      return { summary: 'skipped: no phone number on lead for WhatsApp', status: 'skipped' };
    }
    const message = cfg.message || cfg.customMessage || `Hello ${lead.contactName || lead.company}, following up from Developster CRM.`;
    const res = await sendWhatsAppMessage(lead.phone, message, {
      templateName: cfg.templateName,
      lead,
    });
    if (res.success) {
      await crmRepo.logActivity(wsId, {
        leadId: lead.id,
        type: 'whatsapp',
        title: 'Automation WhatsApp Sent',
        description: `Sent message to ${lead.phone}`,
        authorName: 'Automation Engine',
      });
      return { summary: `Sent WhatsApp to ${lead.phone}`, status: 'success' };
    }
    // Auto-save as draft in Communication Hub so work is never lost
    await crmRepo.createMessage(wsId, {
      workspaceId: wsId,
      conversationId: `conv-auto-${lead.id}`,
      leadId: lead.id,
      channel: 'whatsapp',
      direction: 'outbound',
      senderName: 'Automation Engine',
      recipient: lead.phone,
      content: message,
      status: 'draft',
      metadata: {
        errorMessage: 'MSG91 WhatsApp provider not connected. Automation prepared message as draft.',
      },
    });
    return { summary: `WhatsApp: ${res.error || 'Provider not connected (saved as draft)'}`, status: 'skipped' };
  }

  // 9. SEND SMS MESSAGE
  if (actionType === 'send_sms') {
    if (!lead.phone || !lead.phone.trim()) {
      return { summary: 'skipped: no phone number on lead for SMS', status: 'skipped' };
    }
    const message = cfg.message || cfg.smsMessage || `Hello ${lead.contactName || lead.company}, following up from Developster CRM.`;
    const res = await sendSmsMessage(lead.phone, message);
    if (res.success) {
      await crmRepo.logActivity(wsId, {
        leadId: lead.id,
        type: 'sms',
        title: 'Automation SMS Sent',
        description: `Sent SMS to ${lead.phone}`,
        authorName: 'Automation Engine',
      });
      return { summary: `Sent SMS to ${lead.phone}`, status: 'success' };
    }
    // Auto-save as draft in Communication Hub so work is never lost
    await crmRepo.createMessage(wsId, {
      workspaceId: wsId,
      conversationId: `conv-auto-${lead.id}`,
      leadId: lead.id,
      channel: 'sms',
      direction: 'outbound',
      senderName: 'Automation Engine',
      recipient: lead.phone,
      content: message,
      status: 'draft',
      metadata: {
        errorMessage: 'MSG91 SMS provider not connected. Automation prepared message as draft.',
      },
    });
    return { summary: `SMS: ${res.error || 'Provider not connected (saved as draft)'}`, status: 'skipped' };
  }

  // 10. SCHEDULE CALL TASK
  if (actionType === 'schedule_call') {
    const days = Number(cfg.taskDueDays || cfg.delayAmount || 1);
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + days);
    const callTitle = cfg.title || `Call: ${lead.contactName || lead.title || lead.company}`;
    await crmRepo.createTask({
      workspaceId: wsId,
      leadId: lead.id,
      dealTitle: lead.title,
      title: callTitle,
      priority: 'high',
      dueDate: dueDate.toISOString().split('T')[0],
      dueAt: dueDate.toISOString(),
      completed: false,
      ownerId: cfg.ownerId || lead.ownerId || 'mem-1',
      type: 'call',
      status: 'open',
      source: 'auto',
      notes: cfg.notes || 'Automated scheduled phone call task',
    });
    return { summary: `Scheduled call task "${callTitle}"`, status: 'success' };
  }

  // 11. SCHEDULE MEETING
  if (actionType === 'schedule_meeting') {
    const meetingTitle = cfg.meetingTitle || `Meeting: ${lead.title || lead.company}`;
    const days = Number(cfg.delayAmount || 2);
    const meetingDate = new Date();
    meetingDate.setDate(meetingDate.getDate() + days);
    meetingDate.setHours(15, 0, 0, 0);

    await crmRepo.createCalendarEvent(wsId, {
      leadId: lead.id,
      title: meetingTitle,
      description: cfg.description || 'Automated meeting invite from CRM',
      startIso: meetingDate.toISOString(),
      endIso: new Date(meetingDate.getTime() + (cfg.meetingDurationMinutes || 30) * 60000).toISOString(),
      meetUrl: cfg.enableMeet !== false ? `https://meet.google.com/new` : undefined,
      status: 'scheduled',
      attendees: lead.email ? [lead.email] : [],
      synced: false,
    });
    return { summary: `Scheduled meeting "${meetingTitle}"`, status: 'success' };
  }

  // 12. MARK WON
  if (actionType === 'mark_won') {
    await crmRepo.updateLead(wsId, lead.id, { stageId: 'stg-won', status: 'Won' });
    await crmRepo.cancelScheduledJobsForLead(wsId, lead.id, 'Deal marked Won');
    await crmRepo.logActivity(wsId, {
      leadId: lead.id,
      type: 'status_change',
      title: 'Deal Marked Won',
      description: `Automation marked deal "${lead.title}" as Closed Won.`,
      authorName: 'Automation Engine',
    });
    return { summary: `Marked deal as Closed Won`, status: 'success' };
  }

  // 13. MARK LOST
  if (actionType === 'mark_lost') {
    await crmRepo.updateLead(wsId, lead.id, { stageId: 'stg-loss', status: 'Lost' });
    await crmRepo.cancelScheduledJobsForLead(wsId, lead.id, 'Deal marked Lost');
    await crmRepo.logActivity(wsId, {
      leadId: lead.id,
      type: 'status_change',
      title: 'Deal Marked Lost',
      description: `Automation marked deal "${lead.title}" as Closed Lost. Reason: ${cfg.reason || 'Unresponsive'}`,
      authorName: 'Automation Engine',
    });
    return { summary: `Marked deal as Closed Lost`, status: 'success' };
  }

  // 14. UPDATE FIELD / ADD TAG
  if (actionType === 'update_field') {
    if (cfg.field) {
      await crmRepo.updateLead(wsId, lead.id, { [cfg.field]: cfg.value });
      return { summary: `Updated field "${cfg.field}" to "${cfg.value}"`, status: 'success' };
    }
    return { summary: 'No field specified for update', status: 'skipped' };
  }

  if (actionType === 'add_tag') {
    const tag = cfg.tag || cfg.value;
    if (tag) {
      const existingTags = lead.tags || [];
      if (!existingTags.includes(tag)) {
        await crmRepo.updateLead(wsId, lead.id, { tags: [...existingTags, tag] });
      }
      return { summary: `Added tag "${tag}" to lead`, status: 'success' };
    }
    return { summary: 'No tag provided', status: 'skipped' };
  }

  return { summary: `Executed action: ${actionType}`, status: 'success' };
}

/**
 * Dry Run Simulation helper for frontend
 */
export async function simulateWorkflowDryRun(
  workflow: AutomationRule,
  lead: Lead,
  workspaceId: string
): Promise<AutomationRun> {
  return executeWorkflow(workflow, lead, {
    triggerEvent: 'dry_run_simulation',
    isTestRun: true,
    workspaceId,
  });
}

async function recordRunPersistently(workspaceId: string, ruleId: string, run: AutomationRun) {
  try {
    const store = (crmRepo as any).readLocalStore ? (crmRepo as any).readLocalStore() : null;
    if (store) {
      if (!store.automationRuns) store.automationRuns = [];
      store.automationRuns.unshift(run);

      const rIdx = store.automations.findIndex((a: any) => a.id === ruleId);
      if (rIdx >= 0) {
        store.automations[rIdx].runCount = (store.automations[rIdx].runCount || 0) + 1;
        store.automations[rIdx].lastRunAt = new Date().toISOString();
      }
      (crmRepo as any).writeLocalStore(store);
    }
  } catch (err) {
    console.warn('[Workflow Engine] Error persisting run locally:', err);
  }
}
