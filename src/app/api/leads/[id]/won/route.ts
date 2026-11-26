import { NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';
import { emitCrmEvent } from '@/lib/automations/engine';
import { getAuthenticatedUser, canUserModifyLead } from '@/lib/auth/rbac';
import { formatCurrency } from '@/lib/financial';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { workspaceId, finalValue } = body;

    const targetWs = workspaceId || 'ws-default';
    const authContext = await getAuthenticatedUser(req, targetWs);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const effectiveWs = authContext.user.workspaceId;
    const existingLead = await crmRepo.getLeadById(effectiveWs, id);
    if (!existingLead) return NextResponse.json({ error: 'Deal not found' }, { status: 404 });

    if (!canUserModifyLead(authContext.user, existingLead)) {
      return NextResponse.json({ error: 'Permission denied: Cannot mark this deal won' }, { status: 403 });
    }

    const wonLead = await crmRepo.markDealWon(effectiveWs, id, finalValue !== undefined ? Number(finalValue) : undefined);
    if (!wonLead) return NextResponse.json({ error: 'Deal not found or update failed' }, { status: 404 });

    try {
      const { syncLeadTasksOnStageChange } = await import('@/lib/tasks/lifecycle');
      await syncLeadTasksOnStageChange(effectiveWs, wonLead);
    } catch {}

    try {
      await emitCrmEvent({
        type: 'deal_stage_changed',
        leadId: id,
        newStageId: wonLead.stageId,
        pipelineId: wonLead.pipelineId,
        workspaceId: targetWs,
      });
    } catch (e) {
      console.error('[Automations] Error emitting won stage change:', e);
    }

    return NextResponse.json({
      success: true,
      deal: wonLead,
      message: `${wonLead.title} marked won • ${formatCurrency(wonLead.value)}`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
