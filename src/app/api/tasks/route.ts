import { NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';
import { getAuthenticatedUser } from '@/lib/auth/rbac';
import { parseAndValidateJson, sanitizeCsvFormula, sanitizePlainText } from '@/lib/security';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId') || 'ws-default';

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const wsId = authContext.user.workspaceId;
    const [tasks, leads, stages, customers] = await Promise.all([
      crmRepo.getTasks(wsId),
      crmRepo.getLeads(wsId),
      crmRepo.getStages(wsId),
      crmRepo.getCustomers(wsId),
    ]);

    const { buildStageNameMap, isDealClosedOrWon, resolveActiveDealForTask } = await import('@/lib/tasks/queues');
    const stageNameById = buildStageNameMap(stages);
    const leadsById = new Map(leads.map((l) => [l.id, l]));

    const cleanedTasks = tasks.flatMap((t) => {
      if (/^past order:/i.test(t.title || '') || /^past order:/i.test(t.dealTitle || '')) {
        return [];
      }
      const directId = (t as any).dealId || t.leadId;
      const directDeal = directId ? leadsById.get(directId) : undefined;
      if (directDeal && isDealClosedOrWon(directDeal, stageNameById)) {
        return [];
      }
      const res = resolveActiveDealForTask(t, leads, stages, {
        customers,
        allowClosedFallback: false,
      });
      if (res.deal && isDealClosedOrWon(res.deal, stageNameById)) {
        return [];
      }
      if (res.remapped && res.deal) {
        return [{ ...t, leadId: res.deal.id, dealTitle: res.deal.title || t.dealTitle }];
      }
      return [t];
    });

    return NextResponse.json(cleanedTasks);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const jsonResult = await parseAndValidateJson<any>(req, { maxBytes: 128 * 1024 });
    if (!jsonResult.success) {
      return jsonResult.response;
    }
    const body = jsonResult.data;
    const {
      workspaceId,
      leadId,
      dealTitle,
      title,
      description,
      priority,
      dueDate,
      dueAt,
      ownerId,
      type,
      status,
      source,
      notes,
      snoozedUntil,
      autoStageTrigger,
      queueCategory,
    } = body;

    const targetWs = (workspaceId || 'ws-default').trim();
    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'Valid title is required' }, { status: 400 });
    }

    const authContext = await getAuthenticatedUser(req, targetWs);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const effectiveWorkspaceId = authContext.user.workspaceId;

    if (authContext.user.role === 'Read-only') {
      return NextResponse.json({ error: 'Viewers cannot create tasks' }, { status: 403 });
    }

    const effectiveDueDate = dueDate || (dueAt ? dueAt.split('T')[0] : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    const effectiveDueAt = dueAt || (dueDate ? new Date(dueDate).toISOString() : new Date().toISOString());
    const effectiveOwnerId = (authContext.permissions.canAssignLeads && ownerId)
      ? ownerId
      : authContext.user.id;

    const cleanTitle = sanitizeCsvFormula(title.slice(0, 300).trim());
    const cleanDesc = description ? sanitizePlainText(String(description), 2000) : '';

    const task = await crmRepo.createTask({
      workspaceId: effectiveWorkspaceId,
      leadId: leadId ? String(leadId).slice(0, 100) : undefined,
      dealTitle: dealTitle ? sanitizePlainText(String(dealTitle), 300) : undefined,
      title: cleanTitle,
      description: cleanDesc,
      completed: status === 'done' || status === 'Completed' || false,
      priority: priority || 'Medium',
      dueDate: effectiveDueDate,
      dueAt: effectiveDueAt,
      ownerId: effectiveOwnerId,
      type: type || 'To-Do',
      status: status || 'Pending',
      source: source || 'User',
      notes: notes ? sanitizePlainText(String(notes), 2000) : undefined,
      snoozedUntil: snoozedUntil || undefined,
      autoStageTrigger: autoStageTrigger ? String(autoStageTrigger) : undefined,
      queueCategory: queueCategory || undefined,
    });

    return NextResponse.json(task, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
