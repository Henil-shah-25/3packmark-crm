import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/rbac';
import { crmRepo } from '@/lib/google-sheets/repository';
import { buildDefaultB2bAutomationRules } from '@/lib/automations/b2b-email-templates';
import { runAutomationForLead } from '@/lib/automations/b2b-runner';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const targetWs = String(body.workspaceId || 'ws-default').trim();
    const authContext = await getAuthenticatedUser(req, targetWs);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const effectiveWorkspaceId = authContext.user.workspaceId;
    const ruleId = String(body.ruleId || '').trim();
    const leadId = String(body.leadId || '').trim();
    const mode: 'live' | 'test' = body.mode === 'test' ? 'test' : 'live';

    if (!ruleId) {
      return NextResponse.json({ error: 'ruleId is required' }, { status: 400 });
    }

    const [savedRules, leads, stages, customers] = await Promise.all([
      crmRepo.getAutomations(effectiveWorkspaceId),
      crmRepo.getLeads(effectiveWorkspaceId),
      crmRepo.getStages(effectiveWorkspaceId),
      crmRepo.getCustomers(effectiveWorkspaceId),
    ]);

    const defaultRules = buildDefaultB2bAutomationRules(effectiveWorkspaceId);
    const allRules = [
      ...defaultRules.map((d) => savedRules.find((s) => s.id === d.id) || d),
      ...savedRules.filter((s) => !defaultRules.some((d) => d.id === s.id)),
    ];

    const rule = allRules.find((r) => r.id === ruleId);
    if (!rule) {
      return NextResponse.json({ error: 'Automation rule not found' }, { status: 404 });
    }

    const hasResolvableEmail = (l: typeof leads[number]) => {
      if ((l as any).customerEmail?.includes('@') || l.email?.includes('@')) return true;
      return customers.some(
        (c) =>
          c.email?.includes('@') &&
          (((l as any).customerId && c.id === (l as any).customerId) ||
            (l.company && c.company?.trim().toLowerCase() === l.company.trim().toLowerCase()) ||
            (l.contactName && c.name?.trim().toLowerCase() === l.contactName.trim().toLowerCase()))
      );
    };

    const lead =
      (leadId ? leads.find((l) => l.id === leadId) : undefined) ||
      leads.find((l) => l.stageId === rule.triggerStageId && hasResolvableEmail(l)) ||
      leads.find((l) => l.stageId === rule.triggerStageId) ||
      leads.find((l) => hasResolvableEmail(l)) ||
      leads[0];

    if (!lead) {
      return NextResponse.json({ error: 'No customer/deal available to run automation' }, { status: 404 });
    }

    const result = await runAutomationForLead({
      workspaceId: effectiveWorkspaceId,
      rule,
      lead,
      stages,
      mode,
      bypassDelay: mode === 'test',
    });

    return NextResponse.json({
      ok: true,
      result,
      updatedRule: {
        ...rule,
        runCount: result.runCount,
        lastRunAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to run automation' }, { status: 500 });
  }
}
