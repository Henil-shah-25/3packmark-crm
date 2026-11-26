import { NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';
import { executeWorkflow, validateVisualWorkflow } from '@/lib/automations/engine';
import { getAuthenticatedUser } from '@/lib/auth/rbac';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { workspaceId, rule, leadId } = body;

    if (!workspaceId || !rule) {
      return NextResponse.json({ error: 'WorkspaceId and rule required' }, { status: 400 });
    }

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }
    if (!authContext.permissions.canManageAutomations && !authContext.isMasterAdmin) {
      return NextResponse.json({ error: 'Forbidden: Admin access required to test automations' }, { status: 403 });
    }

    const stages = await crmRepo.getStages(workspaceId);
    const validation = validateVisualWorkflow(rule, stages);

    const leads = await crmRepo.getLeads(workspaceId);
    const testLead = leadId ? leads.find((l) => l.id === leadId) : leads[0];

    if (!testLead) {
      return NextResponse.json({
        validation,
        error: 'No leads available to simulate test against. Please add at least one lead.',
      }, { status: 404 });
    }

    // Execute in simulation mode (isTestRun: true)
    const runResult = await executeWorkflow(rule, testLead, {
      triggerEvent: rule.triggerType || 'test_simulation',
      isTestRun: true,
      workspaceId,
    });

    return NextResponse.json({
      success: true,
      validation,
      testLead: {
        id: testLead.id,
        title: testLead.title,
        company: testLead.company,
        value: testLead.value,
        stageId: testLead.stageId,
        ownerId: testLead.ownerId,
      },
      simulationRun: runResult,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
