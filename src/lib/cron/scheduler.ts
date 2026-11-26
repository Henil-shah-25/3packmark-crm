import { crmRepo } from '@/lib/google-sheets/repository';
import { getSmtpConfig, sendSmtpEmail } from '@/lib/email/smtp';
import { renderTemplate } from '@/lib/email/template-engine';
import { emitCrmEvent, executeSingleAction, calculateScheduledTime } from '@/lib/automations/engine';
import { B2B_CHEMICAL_AUTOMATIONS, buildDefaultB2bAutomationRules, renderB2bAutomationEmail } from '@/lib/automations/b2b-email-templates';
import { ScheduledJob } from '@/types/crm';
import { formatDate, formatTime } from '@/lib/dateTime';

export interface TickResult {
  timestamp: string;
  dailyTasksCreated: number;
  meetingAlertsSent: number;
  scheduledJobsProcessed: number;
  scheduledJobsFailed: number;
  b2bEmailsProcessed: number;
  pulseSegmentsEvaluated: number;
  pulseSegmentErrors: string[];
  pulseRollupsGenerated: number;
  pulseRollupErrors: string[];
  errors: string[];
}

// In-process lock to prevent overlapping cron tick executions
let isCronTickRunning = false;

/**
 * Core Cron Tick Logic
 * Idempotent, durable, and safe against overlapping or double triggers
 */
export async function runCronTick(): Promise<TickResult> {
  const result: TickResult = {
    timestamp: new Date().toISOString(),
    dailyTasksCreated: 0,
    meetingAlertsSent: 0,
    scheduledJobsProcessed: 0,
    scheduledJobsFailed: 0,
    b2bEmailsProcessed: 0,
    pulseSegmentsEvaluated: 0,
    pulseSegmentErrors: [],
    pulseRollupsGenerated: 0,
    pulseRollupErrors: [],
    errors: [],
  };

  if (isCronTickRunning) {
    const skipMsg = 'Skipped overlapping cron tick: previous execution is still running';
    console.warn(`[Scheduler] ${skipMsg}`);
    result.errors.push(skipMsg);
    return result;
  }

  isCronTickRunning = true;

  try {
    const workspaces = await crmRepo.getWorkspaces();
    const primaryWorkspace = workspaces[0] || { id: 'ws-default', timezone: 'Asia/Kolkata' };
    const workspaceId = primaryWorkspace.id;

    const leads = await crmRepo.getLeads(workspaceId);
    const existingTasks = await crmRepo.getTasks(workspaceId);
    const activities = await crmRepo.getActivities(workspaceId);
    const events = await crmRepo.getCalendarEvents(workspaceId);

    // -------------------------------------------------------------
    // 1. GENERATE DAILY CALL TASKS FOR NEW LEADS
    // -------------------------------------------------------------
    const now = new Date();
    const oneDayAgoMs = 24 * 60 * 60 * 1000;

    for (const lead of leads) {
      const createdAtMs = new Date(lead.createdAt || 0).getTime();
      const isRecent = now.getTime() - createdAtMs <= oneDayAgoMs;
      const isNewStage = lead.stageId === 'stg-new-lead' || lead.status === 'New';

      if (!isRecent && !isNewStage) continue;

      // Check if any call has already been logged for this lead
      const hasCallLogged = activities.some(
        (a) => a.leadId === lead.id && (a.type === 'call' || a.title?.toLowerCase().includes('call'))
      );
      if (hasCallLogged) continue;

      // Check deduplication in existing tasks
      const alreadyHasTask = existingTasks.some(
        (t) => t.leadId === lead.id && t.type === 'new_lead_call'
      );
      if (alreadyHasTask) continue;

      // Calculate 9:00 AM target time today
      const today9am = new Date();
      today9am.setHours(9, 0, 0, 0);

      await crmRepo.createTask({
        workspaceId,
        leadId: lead.id,
        dealTitle: lead.title,
        title: `Call new lead: ${lead.contactName || lead.company || 'Inbound Lead'}`,
        description: `Initial outreach for ${lead.company} (${lead.phone || 'Check contact info'}). Review pipeline stage and requirements.`,
        priority: 'high',
        dueDate: today9am.toISOString().split('T')[0],
        dueAt: today9am.toISOString(),
        completed: false,
        ownerId: lead.ownerId || 'mem-1',
        type: 'new_lead_call',
        status: 'open',
        source: 'auto',
        notes: 'Automatically scheduled daily outreach task.',
      });

      result.dailyTasksCreated++;
    }

    // -------------------------------------------------------------
    // 2. 30-MINUTE MEETING ALERTS
    // -------------------------------------------------------------
    const templates = await crmRepo.getEmailTemplates(workspaceId);
    const reminderTemplate = templates.find((t) => t.name.includes('Meeting Reminder (30 min)')) || templates[0];
    const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER || 'developsterhub@gmail.com';

    for (const ev of events) {
      if (ev.status === 'cancelled') continue;

      const startMs = new Date(ev.startIso).getTime();
      if (isNaN(startMs)) continue;

      const minutesUntil = (startMs - now.getTime()) / (1000 * 60);

      // Window: between 20 and 35 minutes before meeting starts
      if (minutesUntil < 20 || minutesUntil > 35) continue;

      const reminders = ev.remindersSent || {};
      let eventUpdated = false;

      // Format human-friendly time with timezone (Asia/Kolkata IST)
      const startDate = new Date(ev.startIso);
      const timeString = formatTime(startDate, { includeTimezoneName: true });
      const dateString = formatDate(startDate);

      const associatedLead = ev.leadId ? leads.find((l) => l.id === ev.leadId) : null;

      // A) Send to ME (In-App Notification + Gmail Email Alert)
      if (!reminders.meSentAt) {
        try {
          // 1. In-App Notification (bell)
          await crmRepo.createNotification(workspaceId, {
            title: `Meeting in 30 minutes: ${ev.title}`,
            message: `Scheduled at ${timeString} with ${associatedLead?.company || 'attendees'}. Join link ready.`,
            type: 'meeting',
            leadId: ev.leadId,
            link: ev.meetUrl,
          });

          // 2. Email alert to ME (Suppressed in test environment)
          if (process.env.NODE_ENV !== 'test') {
            await sendSmtpEmail({
              to: adminEmail,
              subject: `[Reminder] Starting in 30 min: ${ev.title}`,
              html: `
                <div style="font-family:sans-serif;max-width:540px;margin:0 auto;padding:24px;background:#FBFAF6;border:1px solid #E4E0D6;border-radius:20px;">
                  <h3 style="margin-top:0;color:#18181B;">Meeting starting in 30 minutes</h3>
                  <p><strong>Title:</strong> ${ev.title}</p>
                  <p><strong>Time:</strong> ${dateString} at ${timeString}</p>
                  ${associatedLead ? `<p><strong>Lead / Company:</strong> ${associatedLead.contactName} (${associatedLead.company})</p>` : ''}
                  ${ev.meetUrl ? `<p style="margin:20px 0;"><a href="${ev.meetUrl}" style="display:inline-block;padding:12px 24px;background:#18181B;color:#FFFFFF;text-decoration:none;border-radius:9999px;font-weight:600;">Open Google Meet &rarr;</a></p>` : ''}
                </div>
              `,
              fromName: 'Developster Scheduler',
            });
          }

          reminders.meSentAt = new Date().toISOString();
          eventUpdated = true;
          result.meetingAlertsSent++;
        } catch (err: any) {
          result.errors.push(`Failed alerting user for meeting ${ev.id}: ${err.message}`);
        }
      }

      // B) Send to LEAD (Templated Reminder - Suppressed in test environment)
      if (!reminders.leadSentAt) {
        if (associatedLead?.email) {
          try {
            if (reminderTemplate) {
              const rendered = await renderTemplate(reminderTemplate.id, {
                lead: associatedLead,
                workspace: primaryWorkspace,
                meeting: ev,
                extra: {
                  meetingDate: dateString,
                  meetingTime: timeString,
                  meetingLink: ev.meetUrl || '',
                },
              });

              if (process.env.NODE_ENV !== 'test') {
                await sendSmtpEmail({
                  to: associatedLead.email,
                  subject: rendered.subject,
                  html: rendered.html,
                  text: rendered.text,
                  fromName: primaryWorkspace.senderName || 'Developster Team',
                });
              }

              await crmRepo.logActivity(workspaceId, {
                leadId: associatedLead.id,
                type: 'email',
                title: '30-Minute Meeting Reminder Sent',
                description: `Sent "${rendered.subject}" to ${associatedLead.email}`,
                authorName: 'Developster Auto-Scheduler',
              });
            }
            reminders.leadSentAt = new Date().toISOString();
            eventUpdated = true;
            result.meetingAlertsSent++;
          } catch (err: any) {
            result.errors.push(`Failed emailing lead ${associatedLead.email}: ${err.message}`);
          }
        } else {
          // No email on lead -> mark as skipped
          reminders.leadSentAt = 'skipped_no_email';
          eventUpdated = true;
        }
      }

      // Persist reminder state on event
      if (eventUpdated) {
        ev.remindersSent = reminders;
        const allEvents = await crmRepo.getCalendarEvents(workspaceId);
        const idx = allEvents.findIndex((e) => e.id === ev.id);
        if (idx !== -1) {
          allEvents[idx].remindersSent = reminders;
        }
      }
    }

    // -------------------------------------------------------------
    // 3. TIME-BASED AUTOMATION TRIGGERS (stage_unchanged_days, no_activity_days)
    // -------------------------------------------------------------
    for (const lead of leads) {
      const updatedAtMs = new Date(lead.updatedAt || lead.createdAt || 0).getTime();
      const daysSinceUpdate = Math.floor((now.getTime() - updatedAtMs) / (24 * 60 * 60 * 1000));

      if (daysSinceUpdate >= 1) {
        try {
          await emitCrmEvent({
            type: 'stage_unchanged_days',
            leadId: lead.id,
            newStageId: lead.stageId,
            pipelineId: lead.pipelineId,
            workspaceId,
          });
        } catch {}
      }

      // Check days since last activity
      const leadActivities = activities.filter((a) => a.leadId === lead.id);
      const lastAct = leadActivities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      const lastActMs = lastAct ? new Date(lastAct.createdAt).getTime() : updatedAtMs;
      const daysSinceActivity = Math.floor((now.getTime() - lastActMs) / (24 * 60 * 60 * 1000));

      if (daysSinceActivity >= 1) {
        try {
          await emitCrmEvent({
            type: 'no_activity_days',
            leadId: lead.id,
            workspaceId,
          });
        } catch {}
      }
    }

    // -------------------------------------------------------------
    // 4. PERSISTENT MULTI-STEP AUTOMATION SCHEDULED JOBS
    // -------------------------------------------------------------
    try {
      const dueJobs = await crmRepo.getDueScheduledJobs(workspaceId);
      const automations = await crmRepo.getAutomations(workspaceId);

      for (const job of dueJobs) {
        const associatedLead = leads.find((l) => l.id === job.leadId);
        const rule = automations.find((a) => a.id === job.ruleId);

        // Pre-condition 1: Lead must exist
        if (!associatedLead) {
          await crmRepo.updateScheduledJob(job.id, {
            status: 'cancelled',
            cancellationReason: 'Lead record no longer exists',
          });
          continue;
        }

        // Pre-condition 2: Rule must be active
        if (!rule || !rule.isActive) {
          await crmRepo.updateScheduledJob(job.id, {
            status: 'cancelled',
            cancellationReason: 'Automation rule was disabled or removed',
          });
          continue;
        }

        // Pre-condition 2b: Pipeline boundary check
        const rulePipeline = (rule as any).pipelineId;
        if (rulePipeline && associatedLead.pipelineId !== rulePipeline) {
          await crmRepo.updateScheduledJob(job.id, {
            status: 'cancelled',
            cancellationReason: `Lead was moved out of automation pipeline scope (${associatedLead.pipelineId} != ${rulePipeline})`,
          });
          continue;
        }

        // Pre-condition 3: Stage-aware stop conditions
        if (rule.stopConditions?.onStageChange && rule.triggerStageId && associatedLead.stageId !== rule.triggerStageId) {
          await crmRepo.updateScheduledJob(job.id, {
            status: 'cancelled',
            cancellationReason: `Lead transitioned out of trigger stage (${associatedLead.stageId} != ${rule.triggerStageId})`,
          });
          continue;
        }

        if (rule.stopConditions?.onDealWon && (associatedLead.status === 'Won' || associatedLead.stageId === 'stg-won')) {
          await crmRepo.updateScheduledJob(job.id, {
            status: 'cancelled',
            cancellationReason: 'Lead was marked Won',
          });
          continue;
        }

        if (rule.stopConditions?.onDealLost && (associatedLead.status === 'Lost' || associatedLead.stageId === 'stg-loss')) {
          await crmRepo.updateScheduledJob(job.id, {
            status: 'cancelled',
            cancellationReason: 'Lead was marked Lost',
          });
          continue;
        }

        // Pre-condition 4: Sending window check
        if (rule.sendingWindow?.enabled) {
          const allowedDays = rule.sendingWindow.daysOfWeek || [1, 2, 3, 4, 5, 6];
          const startHour = rule.sendingWindow.startHour ?? 10;
          const endHour = rule.sendingWindow.endHour ?? 18;

          const currentDay = now.getDay();
          const currentHour = now.getHours();
          const isAllowed = allowedDays.includes(currentDay) && currentHour >= startHour && currentHour < endHour;

          if (!isAllowed) {
            // Bump scheduledFor into next open window
            const nextScheduledFor = calculateScheduledTime(1, 'hours', rule.sendingWindow);
            await crmRepo.updateScheduledJob(job.id, { scheduledFor: nextScheduledFor });
            continue;
          }
        }

        // Mark executing
        await crmRepo.updateScheduledJob(job.id, { status: 'executing' });

        try {
          if (job.actionType === 'execute_workflow_node') {
            const targetNodeIds = job.actionConfig?.targetNodeIds || job.remainingNodeIds || [];
            const { resumeVisualGraph } = await import('@/lib/automations/engine');
            const runRes = await resumeVisualGraph(rule, associatedLead, targetNodeIds, { workspaceId });

            if (runRes.status === 'failed') {
              const nextRetry = (job.retryCount || 0) + 1;
              if (nextRetry < (job.maxRetries || 3)) {
                const retryDate = new Date(Date.now() + 5 * 60 * 1000).toISOString();
                await crmRepo.updateScheduledJob(job.id, {
                  status: 'pending',
                  retryCount: nextRetry,
                  scheduledFor: retryDate,
                  error: runRes.error || 'Execution failed',
                });
              } else {
                await crmRepo.updateScheduledJob(job.id, {
                  status: 'failed',
                  retryCount: nextRetry,
                  error: runRes.error || 'Execution failed',
                  executedAt: new Date().toISOString(),
                });
                result.scheduledJobsFailed++;
              }
            } else {
              await crmRepo.updateScheduledJob(job.id, {
                status: 'completed',
                result: runRes.log || `Resumed ${targetNodeIds.length} visual node(s)`,
                executedAt: new Date().toISOString(),
              });
              result.scheduledJobsProcessed++;
            }
            continue;
          }

          const actionRes = await executeSingleAction(job.actionType, job.actionConfig, associatedLead, { workspaceId });

          if (actionRes.status === 'failed') {
            const nextRetry = (job.retryCount || 0) + 1;
            if (nextRetry < (job.maxRetries || 3)) {
              // Reschedule retry in 5 minutes
              const retryDate = new Date(Date.now() + 5 * 60 * 1000).toISOString();
              await crmRepo.updateScheduledJob(job.id, {
                status: 'pending',
                retryCount: nextRetry,
                scheduledFor: retryDate,
                error: actionRes.summary,
              });
            } else {
              await crmRepo.updateScheduledJob(job.id, {
                status: 'failed',
                retryCount: nextRetry,
                error: actionRes.summary,
                executedAt: new Date().toISOString(),
              });
              result.scheduledJobsFailed++;
            }
          } else {
            // Completed
            await crmRepo.updateScheduledJob(job.id, {
              status: 'completed',
              result: actionRes.summary,
              executedAt: new Date().toISOString(),
            });
            result.scheduledJobsProcessed++;

            // Schedule next step if part of sequence
            if (rule.sequence && rule.sequence.length > 0) {
              const sortedSteps = [...rule.sequence].sort((a, b) => a.stepNumber - b.stepNumber);
              const nextStep = sortedSteps.find((s) => s.stepNumber > (job.stepNumber ?? 0));

              if (nextStep) {
                const scheduledFor = calculateScheduledTime(nextStep.delayAmount, nextStep.delayUnit, rule.sendingWindow);
                await crmRepo.createScheduledJob({
                  workspaceId,
                  ruleId: rule.id,
                  ruleName: rule.name,
                  leadId: associatedLead.id,
                  dealTitle: associatedLead.title,
                  stepId: nextStep.id,
                  stepNumber: nextStep.stepNumber,
                  actionType: nextStep.actionType,
                  actionConfig: nextStep.actionConfig,
                  scheduledFor,
                  status: 'pending',
                  retryCount: 0,
                  maxRetries: 3,
                  idempotencyKey: `${rule.id}:${associatedLead.id}:step-${nextStep.stepNumber}`,
                });
              }
            }
          }
        } catch (jobExecErr: any) {
          await crmRepo.updateScheduledJob(job.id, {
            status: 'failed',
            error: jobExecErr.message || 'Execution error',
            executedAt: new Date().toISOString(),
          });
          result.scheduledJobsFailed++;
        }
      }
    } catch (schedJobErr: any) {
      result.errors.push(`Scheduled jobs execution error: ${schedJobErr.message}`);
    }

    // Pulse segment & rollup evaluators removed for standalone 3W PACKMARK CRM
    // -------------------------------------------------------------
    // 7. 3PACKMARK RULE-BASED B2B EMAIL AUTOMATIONS (ZERO AI, IDEMPOTENT)
    // -------------------------------------------------------------
    try {
      const savedRules = await crmRepo.getAutomations(workspaceId);
      const defaultRules = buildDefaultB2bAutomationRules(workspaceId);
      const b2bRules = defaultRules.map((def) => savedRules.find((r) => r.id === def.id) || def);
      const smtpConfigured = getSmtpConfig().isConfigured;

      for (const rule of b2bRules) {
        if (!rule.isActive) continue;
        const preset = B2B_CHEMICAL_AUTOMATIONS.find((p) => p.id === rule.id);
        const targetStageId = rule.triggerStageId || preset?.targetStageId;
        if (!targetStageId) continue;

        const actionCfg = (rule.actions?.[0]?.config || {}) as Record<string, any>;
        const delayDays = Number(actionCfg.delayDays ?? preset?.delayDays ?? 0);
        const emailMode = actionCfg.emailMode === 'auto_send' ? 'auto_send' : 'manual_confirm';
        const rawSubject = actionCfg.subject || preset?.defaultSubject || rule.name;
        const rawBody = actionCfg.body || preset?.defaultBody || '';

        for (const lead of leads) {
          if (lead.status === 'Won' || lead.status === 'Lost') continue;
          if (lead.stageId !== targetStageId) continue;
          // Idempotency guard: never trigger twice for the same stage
          if (lead.lastAutomatedEmailStage === lead.stageId) continue;

          if (delayDays > 0) {
            const stageEnteredMs = new Date(lead.updatedAt || lead.createdAt || 0).getTime();
            if (isNaN(stageEnteredMs) || now.getTime() - stageEnteredMs < delayDays * 24 * 60 * 60 * 1000) {
              continue;
            }
          }

          const renderedSubject = renderB2bAutomationEmail(rawSubject, lead);
          const renderedBody = renderB2bAutomationEmail(rawBody, lead);

          if (emailMode === 'auto_send' && lead.email) {
            if (process.env.NODE_ENV !== 'test' && smtpConfigured) {
              await sendSmtpEmail({
                to: lead.email,
                subject: renderedSubject,
                text: renderedBody,
                html: `<div style="font-family:sans-serif;white-space:pre-wrap;color:#18181B;">${renderedBody}</div>`,
                fromName: '3packmark Private Limited',
              });
            }

            await crmRepo.logEmail(workspaceId, {
              leadId: lead.id,
              toEmail: lead.email,
              subject: renderedSubject,
              bodyPreview: `${smtpConfigured ? '' : '[SIMULATED] '}${renderedBody.slice(0, 140)}`,
              status: 'delivered',
              templateId: rule.id,
            });

            await crmRepo.logActivity(workspaceId, {
              leadId: lead.id,
              type: 'email',
              title: `Automated Email: ${rule.name}`,
              description: `${smtpConfigured ? 'Sent' : 'Logged (Simulated)'} to ${lead.email}`,
              authorName: '3packmark Automation',
            });
          } else {
            await crmRepo.createTask({
              workspaceId,
              leadId: lead.id,
              dealTitle: lead.title,
              title: `Send Automated Email: ${rule.name}`,
              description: `Subject: ${renderedSubject}\n\n${renderedBody}`,
              priority: 'medium',
              dueDate: now.toISOString().split('T')[0],
              dueAt: now.toISOString(),
              completed: false,
              ownerId: lead.ownerId || 'mem-1',
              type: 'follow_up',
              queueCategory:
                targetStageId === 'stg-credit-follow-up'
                  ? 'Payment Follow Up'
                  : targetStageId === 'stg-dispatch'
                  ? 'Delivery Follow Up'
                  : 'Quotation Follow Up',
              status: 'open',
              source: 'auto',
            });
          }

          await crmRepo.updateLead(workspaceId, lead.id, {
            lastAutomatedEmailStage: lead.stageId,
            lastAutomatedEmailAt: now.toISOString(),
          });

          result.b2bEmailsProcessed++;
        }
      }
    } catch (b2bErr: any) {
      result.errors.push(`B2B email automation error: ${b2bErr.message}`);
    }
  } catch (globalErr: any) {
    result.errors.push(`Global scheduler error: ${globalErr.message}`);
  } finally {
    isCronTickRunning = false;
  }

  return result;
}

// In-process scheduler timer singleton
let schedulerInterval: NodeJS.Timeout | null = null;

export function startInProcessScheduler() {
  if (schedulerInterval) return;
  console.log('[Scheduler] Starting in-process cron ticker (1 minute interval)...');
  schedulerInterval = setInterval(async () => {
    try {
      await runCronTick();
    } catch (err: any) {
      console.error('[Scheduler Interval Error]:', err.message);
    }
  }, 60 * 1000);
}

