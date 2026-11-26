import { NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';
import { emitCrmEvent } from '@/lib/automations/engine';
import { getAuthenticatedUser, canUserAccessLead, canUserModifyLead } from '@/lib/auth/rbac';
import { parseAndValidateJson, stripForbiddenFields, sanitizeCsvFormula, sanitizePlainText, isValidEmail } from '@/lib/security';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const targetWs = (searchParams.get('workspaceId') || 'ws-default').trim();
    const authContext = await getAuthenticatedUser(req, targetWs);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const effectiveWorkspaceId = authContext.user.workspaceId;
    const lead = await crmRepo.getLeadById(effectiveWorkspaceId, id);
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    const pipelines = await crmRepo.getPipelines(effectiveWorkspaceId);
    const pipe = pipelines.find((p) => p.id === lead.pipelineId);
    if (!canUserAccessLead(authContext.user, lead, pipe)) {
      return NextResponse.json({ error: 'Access denied to this lead record' }, { status: 403 });
    }

    return NextResponse.json(lead);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const jsonResult = await parseAndValidateJson<any>(req, { maxBytes: 128 * 1024 });
    if (!jsonResult.success) {
      return jsonResult.response;
    }
    const body = jsonResult.data;
    const { workspaceId, ...rawUpdates } = body;
    const targetWs = (workspaceId || new URL(req.url).searchParams.get('workspaceId') || 'ws-default').trim();

    const authContext = await getAuthenticatedUser(req, targetWs);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const effectiveWorkspaceId = authContext.user.workspaceId;
    const previousLead = await crmRepo.getLeadById(effectiveWorkspaceId, id);
    if (!previousLead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    if (!canUserModifyLead(authContext.user, previousLead)) {
      return NextResponse.json({ error: 'Permission denied: Cannot modify this lead' }, { status: 403 });
    }

    // Mass assignment defense: strip immutable and sensitive system fields
    const updates = stripForbiddenFields(rawUpdates, [
      'id',
      'workspaceId',
      'createdBy',
      'createdAt',
    ]) as any;

    // Sanitize string inputs if present
    if (updates.contactName) {
      updates.contactName = sanitizeCsvFormula(String(updates.contactName).slice(0, 200).trim());
    }
    if (updates.company) {
      updates.company = sanitizeCsvFormula(String(updates.company).slice(0, 200).trim());
    }
    if (updates.title) {
      updates.title = sanitizeCsvFormula(String(updates.title).slice(0, 300).trim());
    }
    if (updates.email) {
      const cleanEmail = String(updates.email).trim().toLowerCase().slice(0, 254);
      if (!isValidEmail(cleanEmail)) {
        return NextResponse.json({ error: 'Invalid email address format' }, { status: 400 });
      }
      updates.email = cleanEmail;
    }
    if (updates.value !== undefined) {
      const numVal = Number(updates.value);
      if (isNaN(numVal) || numVal < 0 || numVal > 1e12) {
        return NextResponse.json({ error: 'Invalid value number' }, { status: 400 });
      }
      updates.value = numVal;
    }
    if (updates.closingProbability !== undefined) {
      const numProb = Number(updates.closingProbability);
      if (isNaN(numProb) || numProb < 0 || numProb > 100) {
        return NextResponse.json({ error: 'Closing probability must be between 0 and 100' }, { status: 400 });
      }
      updates.closingProbability = numProb;
    }
    if (updates.notes) {
      updates.notes = sanitizePlainText(String(updates.notes), 5000);
    }

    const incomingStageId = updates.stageId || (updates as any).stage;
    if (updates.status === 'Won' || updates.status === 'Lost' || incomingStageId) {
      const stages = await crmRepo.getStages(effectiveWorkspaceId);
      const closedStage =
        stages.find((s) => s.name?.trim().toLowerCase() === 'closed') ||
        stages.find((s) => s.id === 'stg-closed');
      if ((updates.status === 'Won' || updates.status === 'Lost') && closedStage) {
        updates.stageId = closedStage.id;
        if (updates.status === 'Won' && !updates.wonAt) updates.wonAt = new Date().toISOString();
        if (updates.status === 'Lost' && !updates.lostAt) updates.lostAt = new Date().toISOString();
      } else if (incomingStageId) {
        const targetStg = stages.find((s) => s.id === incomingStageId);
        if (targetStg && targetStg.name?.trim().toLowerCase().includes('closed')) {
          updates.status = updates.status || 'Won';
          updates.wonAt = updates.wonAt || new Date().toISOString();
        }
      }
    }

    const updated = await crmRepo.updateLead(effectiveWorkspaceId, id, updates);
    if (!updated) return NextResponse.json({ error: 'Lead update failed' }, { status: 404 });

    // Auto-cancel pending tasks if deal closed, or supersede old-stage queue tasks on stage move
    if (
      (incomingStageId && previousLead && previousLead.stageId !== incomingStageId) ||
      updates.status === 'Won' ||
      updates.status === 'Lost'
    ) {
      try {
        const { syncLeadTasksOnStageChange } = await import('@/lib/tasks/lifecycle');
        await syncLeadTasksOnStageChange(effectiveWorkspaceId, updated);
      } catch (taskSyncErr) {
        console.warn('[Tasks Lifecycle] Error syncing tasks on stage/status change:', taskSyncErr);
      }
    }

    // Emit stage change event if stage was updated
    let automationResult: { triggered: boolean; workflowName?: string; emailSentTo?: string; reason?: string } | null = null;

    if (incomingStageId && previousLead && previousLead.stageId !== incomingStageId) {
      try {
        const { triggerStageAutomations } = await import('@/lib/automations/b2b-runner');
        const stageSummary = await triggerStageAutomations({
          workspaceId: effectiveWorkspaceId,
          dealId: id,
          newStageId: incomingStageId,
          userId: authContext.user.id,
        });
        automationResult = stageSummary.automationResult;
      } catch (b2bErr) {
        console.error('[B2B Automations] Error running stage automations:', b2bErr);
        automationResult = {
          triggered: false,
          reason: (b2bErr as any)?.message || 'Stage automation runner failed',
        };
      }
      try {
        console.log(`[API Leads PUT] Emitting deal_stage_changed for ${id} from "${previousLead.stageId}" to "${incomingStageId}"`);
        await emitCrmEvent({
          type: 'deal_stage_changed',
          leadId: id,
          previousStageId: previousLead.stageId,
          newStageId: incomingStageId,
          pipelineId: updated.pipelineId,
          workspaceId: effectiveWorkspaceId,
        });
      } catch (e) {
        console.error('[Automations] Error emitting deal_stage_changed:', e);
      }
    }

    return NextResponse.json({
      ...updated,
      ...(automationResult ? { automationResult } : {}),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  return PUT(req, context);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const targetWs = (searchParams.get('workspaceId') || 'ws-default').trim();
    const authContext = await getAuthenticatedUser(req, targetWs);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const effectiveWorkspaceId = authContext.user.workspaceId;
    const previousLead = await crmRepo.getLeadById(effectiveWorkspaceId, id);
    if (!previousLead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    const isLeadOwner = previousLead.ownerId === authContext.user.id || previousLead.createdBy === authContext.user.id;
    const canDelete = authContext.isMasterAdmin || ['Owner', 'Admin', 'Manager'].includes(authContext.user.role) || isLeadOwner;

    if (!canDelete || authContext.user.role === 'Read-only') {
      return NextResponse.json({ error: 'Permission denied: Cannot delete this lead' }, { status: 403 });
    }

    const success = await crmRepo.deleteLead(effectiveWorkspaceId, id);
    if (success) {
      await crmRepo.logAudit(effectiveWorkspaceId, {
        userId: authContext.user.id,
        userName: authContext.user.name,
        action: 'lead.delete',
        details: `Deleted lead ID: ${id} ("${previousLead.title || 'Untitled'}")`,
      });
    }
    return NextResponse.json({ success });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
