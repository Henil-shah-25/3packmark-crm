import { NextRequest, NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      workspaceId = 'ws-default',
      leadId,
      stageName,
      dueDate,
      notes,
    } = body;

    if (!leadId) {
      return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
    }

    const leads = await crmRepo.getLeads(workspaceId);
    const lead = leads.find((l) => l.id === leadId);
    const { isClosedOrPastOrderLead } = await import('@/lib/tasks/queues');
    if (lead && isClosedOrPastOrderLead(lead)) {
      return NextResponse.json({
        success: false,
        skipped: true,
        reason: 'Skipped auto-task for closed/won/lost or Past Order lead',
      });
    }

    const title = `Call back: ${lead?.contactName || lead?.company || 'Lead'}`;
    const dueAt = dueDate ? new Date(dueDate + 'T09:00:00.000Z').toISOString() : new Date().toISOString();

    const task = await crmRepo.createTask({
      workspaceId,
      leadId,
      dealTitle: lead?.title,
      title,
      description: `Follow-up outreach scheduled via "${stageName}". ${notes || ''}`.trim(),
      priority: 'high',
      dueDate: dueDate || dueAt.split('T')[0],
      dueAt,
      completed: false,
      status: 'open',
      type: 'call_back',
      source: 'auto',
      autoStageTrigger: stageName,
      notes: notes || '',
      ownerId: lead?.ownerId || 'mem-1',
    });

    return NextResponse.json({ success: true, task }, { status: 201 });
  } catch (error: any) {
    console.error('[API Auto-Callback Task POST Error]:', error);
    return NextResponse.json({ error: error.message || 'Failed creating auto-callback task' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId') || 'ws-default';
    const leadId = searchParams.get('leadId');

    if (!leadId) {
      return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
    }

    const cancelledCount = await crmRepo.cancelAutoTasks(workspaceId, leadId);
    return NextResponse.json({ success: true, cancelledCount });
  } catch (error: any) {
    console.error('[API Auto-Callback Task DELETE Error]:', error);
    return NextResponse.json({ error: error.message || 'Failed cancelling auto tasks' }, { status: 500 });
  }
}

