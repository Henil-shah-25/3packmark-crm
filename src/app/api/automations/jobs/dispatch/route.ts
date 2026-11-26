import { NextRequest, NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';
import { executeSingleAction, resumeVisualGraph } from '@/lib/automations/engine';
import { runCronTick } from '@/lib/cron/scheduler';
import { getAuthenticatedUser } from '@/lib/auth/rbac';

function isAuthorizedCronOrUser(req: NextRequest, authContext: any): boolean {
  if (authContext) return true;
  const rawCronSecret = process.env.CRON_SECRET;
  const cronSecret = rawCronSecret ? rawCronSecret.trim() : '';
  if (!cronSecret) return false;

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const xSecret = req.headers.get('x-cron-secret') ? req.headers.get('x-cron-secret')!.trim() : '';
  const provided = token || xSecret;
  if (!provided) return false;

  const providedBuf = Buffer.from(provided, 'utf8');
  const cronBuf = Buffer.from(cronSecret, 'utf8');
  return providedBuf.length === cronBuf.length && require('crypto').timingSafeEqual(providedBuf, cronBuf);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId') || 'ws-default';

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!isAuthorizedCronOrUser(req, authContext)) {
      return NextResponse.json({ error: 'Unauthorized: Session or CRON_SECRET required' }, { status: 401 });
    }

    const jobs = await crmRepo.getScheduledJobs(workspaceId);
    const now = new Date();

    const pending = jobs.filter((j) => j.status === 'pending');
    const due = pending.filter((j) => new Date(j.scheduledFor) <= now);
    const executing = jobs.filter((j) => j.status === 'executing');
    const completed = jobs.filter((j) => j.status === 'completed');
    const failed = jobs.filter((j) => j.status === 'failed');
    const cancelled = jobs.filter((j) => j.status === 'cancelled');

    return NextResponse.json({
      status: 'ok',
      timestamp: now.toISOString(),
      cronSchedule: '0 9 * * * (Daily at 09:00 UTC / 14:30 IST - Vercel Hobby compliant)',
      qstash: {
        configured: Boolean(process.env.QSTASH_TOKEN),
        status: process.env.QSTASH_TOKEN ? 'active' : 'fallback_to_cron_and_dispatcher',
      },
      counts: {
        total: jobs.length,
        pending: pending.length,
        due: due.length,
        executing: executing.length,
        completed: completed.length,
        failed: failed.length,
        cancelled: cancelled.length,
      },
      jobs: jobs.slice(0, 50),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is allowed for dispatch all
    }

    const workspaceId = body.workspaceId || 'ws-default';
    const specificJobId = body.jobId;

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!isAuthorizedCronOrUser(req, authContext)) {
      return NextResponse.json({ error: 'Unauthorized: Session or CRON_SECRET required' }, { status: 401 });
    }

    // 1. DISPATCH SPECIFIC JOB (e.g. from QStash delivery or direct UI "Run Now")
    if (specificJobId) {
      const allJobs = await crmRepo.getScheduledJobs(workspaceId);
      const job = allJobs.find((j) => j.id === specificJobId);

      if (!job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }

      if (job.status !== 'pending' && !body.force) {
        return NextResponse.json({
          status: 'skipped',
          reason: `Job already in state: ${job.status}`,
          job,
        });
      }

      // Atomic lock: set executing
      await crmRepo.updateScheduledJob(job.id, { status: 'executing' });

      const leads = await crmRepo.getLeads(workspaceId);
      const automations = await crmRepo.getAutomations(workspaceId);
      const lead = leads.find((l) => l.id === job.leadId);
      const rule = automations.find((a) => a.id === job.ruleId);

      // Precondition: lead exists
      if (!lead) {
        await crmRepo.updateScheduledJob(job.id, {
          status: 'cancelled',
          cancellationReason: 'Lead record no longer exists in CRM',
        });
        return NextResponse.json({ status: 'cancelled', reason: 'Lead missing' });
      }

      // Precondition: rule is active
      if (!rule || !rule.isActive) {
        await crmRepo.updateScheduledJob(job.id, {
          status: 'cancelled',
          cancellationReason: 'Automation rule was disabled or deleted',
        });
        return NextResponse.json({ status: 'cancelled', reason: 'Rule inactive' });
      }

      // Precondition: stop conditions
      if (rule.stopConditions?.onStageChange && rule.triggerStageId && lead.stageId !== rule.triggerStageId) {
        await crmRepo.updateScheduledJob(job.id, {
          status: 'cancelled',
          cancellationReason: `Lead transitioned out of trigger stage (${lead.stageId} != ${rule.triggerStageId})`,
        });
        return NextResponse.json({ status: 'cancelled', reason: 'Stage changed' });
      }

      if (rule.stopConditions?.onDealWon && (lead.status === 'Won' || lead.stageId === 'stg-won')) {
        await crmRepo.updateScheduledJob(job.id, {
          status: 'cancelled',
          cancellationReason: 'Deal marked Won',
        });
        return NextResponse.json({ status: 'cancelled', reason: 'Deal won' });
      }

      if (rule.stopConditions?.onDealLost && (lead.status === 'Lost' || lead.stageId === 'stg-loss')) {
        await crmRepo.updateScheduledJob(job.id, {
          status: 'cancelled',
          cancellationReason: 'Deal marked Lost',
        });
        return NextResponse.json({ status: 'cancelled', reason: 'Deal lost' });
      }

      // Execute: Workflow node continuation OR single action
      if (job.actionType === 'execute_workflow_node') {
        const targetNodeIds = job.actionConfig?.targetNodeIds || job.remainingNodeIds || [];
        const runRes = await resumeVisualGraph(rule, lead, targetNodeIds, { workspaceId });

        await crmRepo.updateScheduledJob(job.id, {
          status: runRes.status === 'success' ? 'completed' : 'failed',
          result: runRes.log || `Resumed ${targetNodeIds.length} visual node(s)`,
          executedAt: new Date().toISOString(),
          error: runRes.error,
        });

        return NextResponse.json({
          success: runRes.status === 'success',
          jobId: job.id,
          run: runRes,
        });
      } else {
        const actionRes = await executeSingleAction(job.actionType, job.actionConfig, lead, { workspaceId });

        if (actionRes.status === 'failed') {
          const nextRetry = (job.retryCount || 0) + 1;
          if (nextRetry < (job.maxRetries || 3)) {
            const retryDate = new Date(Date.now() + 5 * 60 * 1000).toISOString();
            await crmRepo.updateScheduledJob(job.id, {
              status: 'pending',
              retryCount: nextRetry,
              scheduledFor: retryDate,
              error: actionRes.summary,
            });
            return NextResponse.json({ status: 'retry_scheduled', retryCount: nextRetry });
          } else {
            await crmRepo.updateScheduledJob(job.id, {
              status: 'failed',
              retryCount: nextRetry,
              error: actionRes.summary,
              executedAt: new Date().toISOString(),
            });
            return NextResponse.json({ status: 'failed', error: actionRes.summary });
          }
        }

        await crmRepo.updateScheduledJob(job.id, {
          status: 'completed',
          result: actionRes.summary,
          executedAt: new Date().toISOString(),
        });

        return NextResponse.json({
          success: true,
          jobId: job.id,
          result: actionRes.summary,
        });
      }
    }

    // 2. DISPATCH ALL DUE JOBS (Full batch queue tick)
    const tickResult = await runCronTick();
    return NextResponse.json({
      success: true,
      message: 'Queue tick processed',
      tickResult,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
