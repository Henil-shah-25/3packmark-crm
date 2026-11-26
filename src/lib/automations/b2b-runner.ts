import { AutomationCondition, AutomationRule, Lead, PipelineStage } from '@/types/crm';
import { crmRepo } from '@/lib/google-sheets/repository';
import { sendLiveCrmEmail } from '@/lib/email/live-dispatcher';
import {
  B2B_CHEMICAL_AUTOMATIONS,
  buildDefaultB2bAutomationRules,
  renderB2bAutomationEmail,
} from '@/lib/automations/b2b-email-templates';

export interface B2bAutomationExecutionResult {
  ruleId: string;
  ruleName: string;
  leadId: string;
  leadTitle: string;
  executed: boolean;
  queued?: boolean;
  scheduledFor?: string;
  skippedReason?: string;
  emailSent: boolean;
  recipientEmail?: string;
  emailError?: string;
  emailSkippedReason?: string;
  emailMode: 'auto_send' | 'manual_confirm';
  taskCreated: boolean;
  taskTitle?: string;
  activityLogged: boolean;
  runCount: number;
}

function isDealClosedWonOrLost(lead: Lead, stages: PipelineStage[]): boolean {
  const stageObj = stages.find((s) => s.id === lead.stageId);
  const stageName = (stageObj?.name || lead.stageId || '').toLowerCase();
  return stageName.includes('won') || stageName.includes('lost') || stageName.includes('closed');
}

export async function resolveLeadRecipientEmail(workspaceId: string, lead: Lead): Promise<string> {
  const direct = ((lead as any).customerEmail || lead.email || '').trim();
  if (direct && direct.includes('@')) return direct;

  try {
    const customers = await crmRepo.getCustomers(workspaceId);
    const matched = customers.find(
      (c) =>
        ((lead as any).customerId && c.id === (lead as any).customerId) ||
        (lead.company && c.company?.trim().toLowerCase() === lead.company.trim().toLowerCase()) ||
        (lead.contactName && c.name?.trim().toLowerCase() === lead.contactName.trim().toLowerCase())
    );
    const custEmail = (matched?.email || '').trim();
    if (custEmail && custEmail.includes('@')) return custEmail;
  } catch { }

  return '';
}

export function evaluateB2bConditions(
  conditions: AutomationCondition[] | undefined,
  lead: Lead,
  stages: PipelineStage[],
  logic: 'AND' | 'OR' = 'AND',
  resolvedEmail?: string
): { passed: boolean; reason?: string } {
  if (!conditions || conditions.length === 0) return { passed: true };

  const normalizeToken = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  const results = conditions.map((c) => {
    const valStr = String(c.value ?? '').toLowerCase();
    switch (c.field) {
      case 'stageId': {
        const current = (lead.stageId || '').toLowerCase();
        const currentStageObj = stages.find((s) => s.id === lead.stageId);
        const currentNameNorm = normalizeToken(currentStageObj?.name || '');
        const valNorm = normalizeToken(valStr.replace(/^stg-/, ''));
        const match =
          current === valStr ||
          (currentNameNorm !== '' && (valNorm === currentNameNorm || valNorm.includes(currentNameNorm) || currentNameNorm.includes(valNorm)));
        return c.operator === 'not_equals' ? !match : match;
      }
      case 'deal_status': {
        const closed = isDealClosedWonOrLost(lead, stages);
        const isOpen = !closed;
        if (valStr === 'open') return c.operator === 'not_equals' ? !isOpen : isOpen;
        return true;
      }
      case 'has_email': {
        const emailToCheck = resolvedEmail || (lead as any).customerEmail || lead.email || '';
        const hasEmail = Boolean(emailToCheck.includes('@'));
        const want = String(c.value) === 'true';
        return c.operator === 'not_equals' ? hasEmail !== want : hasEmail === want;
      }
      case 'creditTerms': {
        const terms = (lead.creditTerms || 'Advance').toLowerCase();
        if (c.operator === 'not_equals') return terms !== valStr;
        if (c.operator === 'equals') return terms === valStr;
        return terms.includes(valStr);
      }
      case 'source': {
        const src = (lead.source || '').toLowerCase();
        if (c.operator === 'not_equals') return src !== valStr;
        if (c.operator === 'equals') return src === valStr;
        return src.includes(valStr);
      }
      case 'value': {
        const num = Number(lead.value || 0);
        const target = Number(c.value || 0);
        if (c.operator === 'greater_than') return num > target;
        if (c.operator === 'less_than') return num < target;
        return num === target;
      }
      default:
        return true;
    }
  });

  const passed = logic === 'OR' ? results.some(Boolean) : results.every(Boolean);
  return {
    passed,
    reason: passed ? undefined : 'Condition check did not match lead attributes',
  };
}

export async function runAutomationForLead(params: {
  workspaceId: string;
  rule: AutomationRule;
  lead: Lead;
  stages: PipelineStage[];
  mode?: 'live' | 'test';
  bypassDelay?: boolean;
}): Promise<B2bAutomationExecutionResult> {
  const { workspaceId, rule, lead, stages, mode = 'live', bypassDelay = false } = params;
  const preset = B2B_CHEMICAL_AUTOMATIONS.find((p) => p.id === rule.id);
  const actionCfg = ((rule.actions?.[0]?.config as any) || {}) as Record<string, any>;
  const rawMode = rule.executionMode || actionCfg.emailMode || 'auto_send';
  const emailMode: 'auto_send' | 'manual_confirm' =
    rawMode === 'draft_only' || rawMode === 'manual_confirm' ? 'manual_confirm' : 'auto_send';

  if (mode === 'live' && !rule.isActive) {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      leadId: lead.id,
      leadTitle: lead.title || lead.company || lead.contactName,
      executed: false,
      skippedReason: 'Workflow is paused',
      emailSent: false,
      emailMode,
      taskCreated: false,
      activityLogged: false,
      runCount: rule.runCount || 0,
    };
  }

  // Idempotency guard for live stage transitions
  const targetStageKey = rule.triggerStageId || preset?.targetStageId || '';
  if (mode === 'live' && !bypassDelay && targetStageKey && lead.lastAutomatedEmailStage === targetStageKey) {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      leadId: lead.id,
      leadTitle: lead.title || lead.company || lead.contactName,
      executed: false,
      skippedReason: `Already executed for stage ${targetStageKey}`,
      emailSent: false,
      emailMode,
      taskCreated: false,
      activityLogged: false,
      runCount: rule.runCount || 0,
    };
  }

  // 1. Resolve Customer Email BEFORE condition evaluation so has_email checks Customers sheet too
  const recipientEmail = await resolveLeadRecipientEmail(workspaceId, lead);

  // Condition evaluation (skip stageId check in test mode so rep can test on any sample deal)
  const rawConditions =
    (rule.conditions && rule.conditions.length > 0 ? rule.conditions : preset?.defaultConditions) || [];
  const evalConditions =
    mode === 'test' ? rawConditions.filter((c) => c.field !== 'stageId' && c.field !== 'has_email') : rawConditions;
  const condResult = evaluateB2bConditions(evalConditions, lead, stages, 'AND', recipientEmail);

  if (!condResult.passed) {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      leadId: lead.id,
      leadTitle: lead.title || lead.company || lead.contactName,
      executed: false,
      skippedReason: condResult.reason,
      emailSent: false,
      emailMode,
      taskCreated: false,
      activityLogged: false,
      runCount: rule.runCount || 0,
    };
  }

  // 2. Email Execution (Always send immediately in Test Run, or when Auto-Send in live mode)
  const rawSubject = actionCfg.subject || preset?.defaultSubject || `${rule.name} — 3W PACKMARK PRIVATE LIMITED`;
  const rawBody = actionCfg.body || preset?.defaultBody || `Hello {{contactName}},\n\nFollowing up regarding {{company}}.`;
  const renderedSubject = renderB2bAutomationEmail(rawSubject, lead);
  const renderedBody = renderB2bAutomationEmail(rawBody, lead);

  let emailSent = false;
  let emailError: string | undefined;
  let emailSkippedReason: string | undefined;

  const shouldSendEmail = mode === 'test' || emailMode === 'auto_send' || bypassDelay;
  if (shouldSendEmail) {
    if (!recipientEmail) {
      emailSkippedReason = 'Email Skipped: No email address on lead';
    } else {
      const htmlBody = `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;line-height:1.6;color:#17191A;white-space:pre-line;background:#ffffff;padding:20px;border-radius:8px;">${renderedBody}</div>`;
      const dispatchRes = await sendLiveCrmEmail({
        to: recipientEmail,
        subject: renderedSubject,
        html: htmlBody,
        text: renderedBody,
        fromName: '3W PACKMARK PRIVATE LIMITED',
      });
      emailSent = dispatchRes.sent;
      if (!dispatchRes.sent) {
        emailError = dispatchRes.error || 'Email delivery failed';
      }

      try {
        await crmRepo.logEmail(workspaceId, {
          leadId: lead.id,
          toEmail: recipientEmail,
          subject: renderedSubject,
          bodyPreview: `${emailSent ? '' : '[FAILED/FALLBACK] '}${renderedBody.slice(0, 140)}`,
          status: emailSent ? 'delivered' : 'failed',
        });
      } catch { }
    }
  } else {
    emailSkippedReason = 'Draft / Task Only mode (Auto-Send disabled)';
  }

  // 3. Follow-Up Task Creation
  const taskTitleBase = actionCfg.taskTitle || preset?.taskTitle || `${rule.name} Follow Up`;
  const taskTitle = `${taskTitleBase} — ${lead.company || lead.contactName || lead.title}`;
  const dueDays = Number(actionCfg.taskDueDays ?? preset?.taskDueDays ?? 1);
  const dueDate = new Date(Date.now() + dueDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  let taskCreated = false;
  try {
    await crmRepo.createTask({
      workspaceId,
      leadId: lead.id,
      title: taskTitle,
      dueDate,
      completed: false,
      priority: 'medium',
      ownerId: lead.ownerId || 'mem-1',
    });
    taskCreated = true;
  } catch (err) {
    console.warn('[B2B Automation Runner] Task creation warning:', err);
  }

  // 4. Activity Timeline Log
  let activityLogged = false;
  try {
    const emailSummary = emailSent
      ? `Email sent to ${recipientEmail}`
      : emailSkippedReason
        ? emailSkippedReason
        : `Email failed (${emailError || 'SMTP error'})`;

    await crmRepo.logActivity(workspaceId, {
      leadId: lead.id,
      type: emailSent ? 'email' : 'task',
      title: `Automation Executed: ${rule.name}`,
      description: `Automation Executed: ${rule.name} (${emailSummary}${taskCreated ? `, Task created: "${taskTitle}"` : ''})`,
      authorName: '3W PACKMARK Automation',
    });
    activityLogged = true;
  } catch (err) {
    console.warn('[B2B Automation Runner] Activity log warning:', err);
  }

  // 5. Persist Idempotency Stamp & Rule Run Count in Google Sheets
  const nextRunCount = (rule.runCount || 0) + 1;
  try {
    if (mode === 'live' && targetStageKey) {
      await crmRepo.updateLead(workspaceId, lead.id, {
        lastAutomatedEmailStage: targetStageKey,
      });
    }
    await crmRepo.saveAutomationRule(workspaceId, {
      ...rule,
      runCount: nextRunCount,
      lastRunAt: new Date().toISOString(),
    });
  } catch { }

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    leadId: lead.id,
    leadTitle: lead.title || lead.company || lead.contactName,
    executed: true,
    emailSent,
    recipientEmail: recipientEmail || undefined,
    emailError,
    emailSkippedReason,
    emailMode,
    taskCreated,
    taskTitle,
    activityLogged,
    runCount: nextRunCount,
  };
}

function getRuleDelayMs(rule: AutomationRule): number {
  if (rule.delayMinutes !== undefined && !isNaN(Number(rule.delayMinutes))) {
    return Math.max(0, Number(rule.delayMinutes)) * 60 * 1000;
  }
  const preset = B2B_CHEMICAL_AUTOMATIONS.find((p) => p.id === rule.id);
  const delayNode = rule.nodes?.find((n) => n.type === 'delay' || n.data?.nodeCategory === 'delay');
  if (delayNode?.data?.delayConfig) {
    const amt = Number(delayNode.data.delayConfig.delayAmount ?? 0);
    const unit = delayNode.data.delayConfig.delayUnit || 'hours';
    if (amt <= 0) return 0;
    if (unit === 'minutes') return amt * 60 * 1000;
    if (unit === 'hours') return amt * 60 * 60 * 1000;
    if (unit === 'days') return amt * 24 * 60 * 60 * 1000;
    if (unit === 'weeks') return amt * 7 * 24 * 60 * 60 * 1000;
  }
  const presetDays = preset?.delayDays ?? 0;
  if (presetDays > 0) return presetDays * 24 * 60 * 60 * 1000;
  return 0;
}

export interface StageAutomationSummary {
  results: B2bAutomationExecutionResult[];
  automationResult: {
    triggered: boolean;
    workflowName?: string;
    emailSentTo?: string;
    reason?: string;
  } | null;
}

export async function triggerStageAutomations(params: {
  workspaceId: string;
  dealId: string;
  newStageId: string;
  newStageName?: string;
  userId?: string;
}): Promise<StageAutomationSummary> {
  const { workspaceId, dealId, newStageId, newStageName } = params;
  const [lead, savedRules, stages] = await Promise.all([
    crmRepo.getLeadById(workspaceId, dealId),
    crmRepo.getAutomations(workspaceId),
    crmRepo.getStages(workspaceId),
  ]);

  if (!lead) return { results: [], automationResult: null };

  const stageObj = stages.find((s) => s.id === newStageId);
  const resolvedStageName = (newStageName || stageObj?.name || '').trim().toLowerCase();

  const defaultRules = buildDefaultB2bAutomationRules(workspaceId);
  const mergedRules = [
    ...defaultRules.map((def) => savedRules.find((r) => r.id === def.id) || def),
    ...savedRules.filter((r) => !defaultRules.some((d) => d.id === r.id)),
  ];

  const matchingRules = mergedRules.filter((r) => {
    if (!r.isActive) return false;
    const ruleStageId = (r.triggerStageId || '').trim().toLowerCase();
    const targetIdLower = newStageId.trim().toLowerCase();
    if (ruleStageId && ruleStageId === targetIdLower) return true;
    const preset = B2B_CHEMICAL_AUTOMATIONS.find((p) => p.id === r.id);
    if (resolvedStageName && preset?.targetStageName.toLowerCase() === resolvedStageName) return true;
    const ruleNameLower = (r.name || '').toLowerCase();
    if (resolvedStageName === 'quotation follow up' && ruleNameLower.includes('quotation follow')) return true;
    if (resolvedStageName === 'dispatch' && ruleNameLower.includes('dispatch')) return true;
    if (resolvedStageName === 'credit follow up' && ruleNameLower.includes('credit')) return true;
    if (resolvedStageName === 'inquiry' && ruleNameLower.includes('inquiry')) return true;
    return false;
  });

  if (matchingRules.length === 0) {
    return { results: [], automationResult: null };
  }

  const results: B2bAutomationExecutionResult[] = [];
  for (const rule of matchingRules) {
    const execMode = rule.executionMode || (rule.actions?.[0]?.config as any)?.emailMode || 'auto_send';
    if (execMode === 'draft_only' || execMode === 'manual_confirm') {
      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        leadId: lead.id,
        leadTitle: lead.title || lead.company || lead.contactName,
        executed: false,
        skippedReason: `"${rule.name}" is in Create Task / Draft Only mode`,
        emailSent: false,
        emailMode: 'manual_confirm',
        taskCreated: false,
        activityLogged: false,
        runCount: rule.runCount || 0,
      });
      continue;
    }

    const delayMs = getRuleDelayMs(rule);
    if (delayMs > 0) {
      // Queue delayed workflow in ScheduledJobs sheet
      const scheduledFor = new Date(Date.now() + delayMs).toISOString();
      const idempotencyKey = `${rule.id}:${lead.id}:${newStageId}`;
      try {
        const existingJobs = await crmRepo.getScheduledJobs(workspaceId);
        const alreadyPending = existingJobs.some(
          (j) => j.idempotencyKey === idempotencyKey && j.status === 'pending'
        );
        if (!alreadyPending) {
          await crmRepo.createScheduledJob({
            workspaceId,
            ruleId: rule.id,
            ruleName: rule.name,
            leadId: lead.id,
            dealTitle: lead.title || lead.company || lead.contactName,
            stepId: `${rule.id}-step-1`,
            stepNumber: 1,
            actionType: 'send_email',
            actionConfig: (rule.actions?.[0]?.config || {}) as any,
            scheduledFor,
            status: 'pending',
            retryCount: 0,
            maxRetries: 3,
            idempotencyKey,
          });
        }
      } catch (err) {
        console.warn('[B2B Automation Runner] Failed to queue delayed job:', err);
      }

      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        leadId: lead.id,
        leadTitle: lead.title || lead.company || lead.contactName,
        executed: false,
        queued: true,
        scheduledFor,
        skippedReason: `Scheduled for ${new Date(scheduledFor).toLocaleString()}`,
        emailSent: false,
        emailMode: 'auto_send',
        taskCreated: false,
        activityLogged: false,
        runCount: rule.runCount || 0,
      });
    } else {
      const res = await runAutomationForLead({
        workspaceId,
        rule,
        lead,
        stages,
        mode: 'live',
        bypassDelay: true,
      });
      results.push(res);
    }
  }

  const sentRun = results.find((r) => r.executed && r.emailSent && r.recipientEmail);
  if (sentRun) {
    return {
      results,
      automationResult: {
        triggered: true,
        workflowName: sentRun.ruleName,
        emailSentTo: sentRun.recipientEmail,
      },
    };
  }

  const firstIssue = results[0];
  return {
    results,
    automationResult: {
      triggered: false,
      workflowName: firstIssue?.ruleName,
      reason:
        firstIssue?.emailSkippedReason ||
        firstIssue?.emailError ||
        firstIssue?.skippedReason ||
        'Condition or email delivery did not complete',
    },
  };
}

export async function runStageB2bAutomations(params: {
  workspaceId: string;
  leadId: string;
  newStageId: string;
}): Promise<B2bAutomationExecutionResult[]> {
  const { results } = await triggerStageAutomations({
    workspaceId: params.workspaceId,
    dealId: params.leadId,
    newStageId: params.newStageId,
  });
  return results;
}

export async function processDueB2bAutomations(
  workspaceId: string,
  options?: { forceAllPending?: boolean }
): Promise<{ processed: number; results: B2bAutomationExecutionResult[] }> {
  const [jobs, savedRules, leads, stages] = await Promise.all([
    crmRepo.getScheduledJobs(workspaceId),
    crmRepo.getAutomations(workspaceId),
    crmRepo.getLeads(workspaceId),
    crmRepo.getStages(workspaceId),
  ]);

  const now = new Date();
  const dueJobs = jobs.filter(
    (j) =>
      j.status === 'pending' &&
      (options?.forceAllPending || new Date(j.scheduledFor) <= now)
  );

  if (dueJobs.length === 0) {
    return { processed: 0, results: [] };
  }

  const defaultRules = buildDefaultB2bAutomationRules(workspaceId);
  const allRules = [
    ...defaultRules.map((def) => savedRules.find((r) => r.id === def.id) || def),
    ...savedRules.filter((r) => !defaultRules.some((d) => d.id === r.id)),
  ];

  const results: B2bAutomationExecutionResult[] = [];
  for (const job of dueJobs) {
    const rule = allRules.find((r) => r.id === job.ruleId);
    const lead = leads.find((l) => l.id === job.leadId);
    if (!rule || !lead) {
      await crmRepo.updateScheduledJob(job.id, {
        status: 'cancelled',
        cancellationReason: 'Rule or lead no longer exists',
      });
      continue;
    }

    const res = await runAutomationForLead({
      workspaceId,
      rule,
      lead,
      stages,
      mode: 'live',
      bypassDelay: true,
    });

    await crmRepo.updateScheduledJob(job.id, {
      status: res.executed ? 'completed' : 'cancelled',
      executedAt: new Date().toISOString(),
      cancellationReason: res.skippedReason,
      result: res.emailSent ? `Email sent to ${res.recipientEmail}` : res.emailSkippedReason || res.emailError,
    });

    results.push(res);
  }

  return { processed: results.length, results };
}
