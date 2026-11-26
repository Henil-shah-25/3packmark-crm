import { NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';
import { executeSingleAction } from '@/lib/automations/engine';
import { getAuthenticatedUser } from '@/lib/auth/rbac';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId') || 'ws-default';
    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }
    const jobs = await crmRepo.getScheduledJobs(authContext.user.workspaceId);
    return NextResponse.json({ jobs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { workspaceId = 'ws-default', jobId, action, reason } = body;

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }
    if (!authContext.permissions.canManageAutomations && !authContext.isMasterAdmin) {
      return NextResponse.json({ error: 'Forbidden: Admin access required to manage automation jobs' }, { status: 403 });
    }

    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
    }

    const jobs = await crmRepo.getScheduledJobs(workspaceId);
    const job = jobs.find((j) => j.id === jobId);

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (action === 'cancel') {
      const updated = await crmRepo.updateScheduledJob(jobId, {
        status: 'cancelled',
        cancellationReason: reason || 'Cancelled manually by user',
      });
      return NextResponse.json({ success: true, job: updated });
    }

    if (action === 'trigger_now') {
      const leads = await crmRepo.getLeads(workspaceId);
      const automations = await crmRepo.getAutomations(workspaceId);
      const lead = leads.find((l) => l.id === job.leadId);
      const rule = automations.find((a) => a.id === job.ruleId);

      if (!lead) {
        return NextResponse.json({ error: 'Associated lead not found' }, { status: 404 });
      }

      await crmRepo.updateScheduledJob(jobId, { status: 'executing' });

      if (job.actionType === 'execute_workflow_node') {
        const { resumeVisualGraph } = await import('@/lib/automations/engine');
        const targetNodeIds = job.actionConfig?.targetNodeIds || job.remainingNodeIds || [];
        const runRes = await resumeVisualGraph(rule || ({ id: job.ruleId, name: job.ruleName } as any), lead, targetNodeIds, { workspaceId });

        const updated = await crmRepo.updateScheduledJob(jobId, {
          status: runRes.status === 'success' ? 'completed' : 'failed',
          result: runRes.log || `Resumed ${targetNodeIds.length} visual node(s)`,
          executedAt: new Date().toISOString(),
          error: runRes.error,
        });

        return NextResponse.json({ success: runRes.status === 'success', job: updated, run: runRes });
      }

      const execResult = await executeSingleAction(job.actionType, job.actionConfig, lead, { workspaceId });

      const updated = await crmRepo.updateScheduledJob(jobId, {
        status: execResult.status === 'failed' ? 'failed' : 'completed',
        result: execResult.summary,
        executedAt: new Date().toISOString(),
      });

      return NextResponse.json({ success: true, job: updated, result: execResult });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

