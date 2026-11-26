import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/rbac';
import { crmRepo } from '@/lib/google-sheets/repository';
import { buildDefaultB2bAutomationRules } from '@/lib/automations/b2b-email-templates';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const targetWs = String(body.workspaceId || 'ws-default').trim();
    const authContext = await getAuthenticatedUser(req, targetWs);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const effectiveWs = authContext.user.workspaceId;
    const savedRules = await crmRepo.getAutomations(effectiveWs);
    const defaultRules = buildDefaultB2bAutomationRules(effectiveWs);
    const existing =
      savedRules.find((r) => r.id === id) ||
      defaultRules.find((r) => r.id === id);

    if (!existing) {
      return NextResponse.json({ error: 'Automation rule not found' }, { status: 404 });
    }

    const nextExecutionMode: 'auto_send' | 'draft_only' | undefined =
      body.executionMode === 'auto_send' || body.executionMode === 'draft_only'
        ? body.executionMode
        : body.executionMode === 'manual_confirm'
        ? 'draft_only'
        : existing.executionMode;

    const nextDelayMinutes =
      body.delayMinutes !== undefined && !isNaN(Number(body.delayMinutes))
        ? Number(body.delayMinutes)
        : existing.delayMinutes;

    const nextRule = {
      ...existing,
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.isActive !== undefined ? { isActive: Boolean(body.isActive) } : {}),
      ...(nextExecutionMode !== undefined ? { executionMode: nextExecutionMode } : {}),
      ...(nextDelayMinutes !== undefined ? { delayMinutes: nextDelayMinutes } : {}),
      ...(body.actions !== undefined ? { actions: body.actions } : {}),
      ...(body.nodes !== undefined ? { nodes: body.nodes } : {}),
      ...(body.edges !== undefined ? { edges: body.edges } : {}),
    };

    const saved = await crmRepo.saveAutomationRule(effectiveWs, nextRule);
    return NextResponse.json({ ok: true, rule: saved });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to update automation' }, { status: 500 });
  }
}
