import { NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';
import { emitCrmEvent } from '@/lib/automations/engine';
import { getAuthenticatedUser, canUserModifyLead } from '@/lib/auth/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { workspaceId, reason } = body;

    const targetWs = workspaceId || 'ws-default';
    const authContext = await getAuthenticatedUser(req, targetWs);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const effectiveWs = authContext.user.workspaceId;
    const existingLead = await crmRepo.getLeadById(effectiveWs, id);
    if (!existingLead) return NextResponse.json({ error: 'Deal not found' }, { status: 404 });

    if (!canUserModifyLead(authContext.user, existingLead)) {
      return NextResponse.json({ error: 'Permission denied: Cannot mark this deal lost' }, { status: 403 });
    }

    const lostLead = await crmRepo.markDealLost(effectiveWs, id, reason);
    if (!lostLead) return NextResponse.json({ error: 'Deal not found or update failed' }, { status: 404 });

    try {
      const { syncLeadTasksOnStageChange } = await import('@/lib/tasks/lifecycle');
      await syncLeadTasksOnStageChange(effectiveWs, lostLead);
    } catch {}

    try {
      await emitCrmEvent({
        type: 'deal_stage_changed',
        leadId: id,
        newStageId: lostLead.stageId,
        pipelineId: lostLead.pipelineId,
        workspaceId: targetWs,
      });
    } catch (e) {
      console.error('[Automations] Error emitting lost stage change:', e);
    }

    return NextResponse.json({
      success: true,
      deal: lostLead,
      message: `${lostLead.title} marked lost`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
