import { NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';
import { getAuthenticatedUser } from '@/lib/auth/rbac';
import { parseAndValidateJson, stripForbiddenFields, sanitizeCsvFormula, sanitizePlainText } from '@/lib/security';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const jsonResult = await parseAndValidateJson<any>(req, { maxBytes: 128 * 1024 });
    if (!jsonResult.success) {
      return jsonResult.response;
    }
    const body = jsonResult.data;
    const { workspaceId, ...rawUpdates } = body;

    const targetWs = (workspaceId || 'ws-default').trim();
    const authContext = await getAuthenticatedUser(req, targetWs);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }
    if (authContext.user.role === 'Read-only') {
      return NextResponse.json({ error: 'Viewers cannot modify tasks' }, { status: 403 });
    }

    const effectiveWorkspaceId = authContext.user.workspaceId;
    const updates = stripForbiddenFields(rawUpdates, ['id', 'workspaceId', 'createdAt', 'createdBy']) as any;
    if (updates.dealId && !updates.leadId) {
      updates.leadId = updates.dealId;
    }

    if (updates.title) {
      updates.title = sanitizeCsvFormula(String(updates.title).slice(0, 300).trim());
    }
    if (updates.description) {
      updates.description = sanitizePlainText(String(updates.description), 2000);
    }
    if (updates.notes) {
      updates.notes = sanitizePlainText(String(updates.notes), 2000);
    }

    if (updates.completed === true || updates.status === 'done' || updates.status === 'completed') {
      updates.completed = true;
      updates.status = 'done';
      updates.completedAt = new Date().toISOString();
    } else if (updates.completed === false || updates.status === 'open') {
      updates.completed = false;
      updates.status = 'open';
      updates.completedAt = undefined;
    } else if (updates.status === 'snoozed') {
      updates.completed = false;
    }

    const updated = await crmRepo.updateTask(effectiveWorkspaceId, id, updates);
    if (!updated) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    // Log task completion in the lead's Activity timeline
    if (updates.completed === true && updated.leadId && !body.callNote) {
      try {
        await crmRepo.logActivity(effectiveWorkspaceId, {
          leadId: updated.leadId,
          type: 'task',
          title: `Task Completed: ${updated.title}`,
          description: `Follow-up task "${updated.title}" marked complete.`,
          authorName: authContext?.user.name || 'User',
        });
      } catch {}
    }

    // If call note was logged when completing a call task
    if (body.callNote && updated.leadId) {
      await crmRepo.logActivity(effectiveWorkspaceId, {
        leadId: updated.leadId,
        type: 'call',
        title: `Logged Call: ${updated.title}`,
        description: sanitizePlainText(String(body.callNote), 2000),
        authorName: authContext?.user.name || 'User',
      });
    }

    return NextResponse.json(updated);
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
    const workspaceId = searchParams.get('workspaceId') || 'ws-default';

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }
    if (authContext.user.role === 'Read-only') {
      return NextResponse.json({ error: 'Viewers cannot delete tasks' }, { status: 403 });
    }

    const effectiveWorkspaceId = authContext.user.workspaceId;
    const deleted = await crmRepo.deleteTask(effectiveWorkspaceId, id);
    if (!deleted) return NextResponse.json({ error: 'Task not found or deletion failed' }, { status: 404 });

    return NextResponse.json({ success: true, deletedId: id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
