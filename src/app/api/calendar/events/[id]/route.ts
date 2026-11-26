import { NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';
import { updateGoogleCalendarEvent, deleteGoogleCalendarEvent } from '@/lib/calendar/google-calendar';
import { getAuthenticatedUser } from '@/lib/auth/rbac';

export async function PATCH(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const body = await req.json();
    const { workspaceId, title, description, startIso, endIso, attendees, status } = body;

    const wsId = workspaceId || 'ws-default';
    const authContext = await getAuthenticatedUser(req, wsId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    if (authContext.user.role === 'Read-only') {
      return NextResponse.json({ error: 'Permission denied: Read-only viewers cannot modify meetings' }, { status: 403 });
    }

    const events = await crmRepo.getCalendarEvents(wsId);
    const existing = events.find((e) => e.id === id);

    if (!existing) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    // Update on Google Calendar if event ID exists
    if (existing.googleEventId) {
      await updateGoogleCalendarEvent({
        workspaceId: wsId,
        googleEventId: existing.googleEventId,
        title,
        description,
        startIso,
        endIso,
        attendees,
      });
    }

    const updated = await crmRepo.updateCalendarEvent(wsId, id, {
      title: title || existing.title,
      description: description !== undefined ? description : existing.description,
      startIso: startIso || existing.startIso,
      endIso: endIso || existing.endIso,
      attendees: attendees || existing.attendees,
      status: status || existing.status,
      lastSyncAt: new Date().toISOString(),
    });

    // Log reschedule activity if time changed
    if (startIso && startIso !== existing.startIso && existing.leadId) {
      await crmRepo.logActivity(wsId, {
        leadId: existing.leadId,
        type: 'meeting',
        title: `Meeting Rescheduled: ${existing.title}`,
        description: `Moved from ${new Date(existing.startIso).toLocaleString()} to ${new Date(startIso).toLocaleString()}`,
        authorName: 'Calendar Scheduler',
      });
    }

    return NextResponse.json({ success: true, event: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId') || 'ws-default';

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    if (authContext.user.role === 'Read-only') {
      return NextResponse.json({ error: 'Permission denied: Read-only viewers cannot cancel meetings' }, { status: 403 });
    }

    const events = await crmRepo.getCalendarEvents(workspaceId);
    const existing = events.find((e) => e.id === id);

    if (existing && existing.googleEventId) {
      await deleteGoogleCalendarEvent(workspaceId, existing.googleEventId);
    }

    await crmRepo.updateCalendarEvent(workspaceId, id, { status: 'cancelled' });

    if (existing?.leadId) {
      await crmRepo.logActivity(workspaceId, {
        leadId: existing.leadId,
        type: 'meeting',
        title: `Meeting Cancelled: ${existing.title}`,
        description: `Cancelled session originally for ${new Date(existing.startIso).toLocaleString()}`,
        authorName: 'Calendar Scheduler',
      });
    }

    return NextResponse.json({ success: true, message: 'Meeting cancelled successfully' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
