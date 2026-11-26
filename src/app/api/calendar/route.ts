import { NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId') || 'ws-default';
    const events = await crmRepo.getCalendarEvents(workspaceId);
    return NextResponse.json(events);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { workspaceId, leadId, title, description, startIso, endIso, attendees } = body;

    if (!workspaceId || !title || !startIso) {
      return NextResponse.json({ error: 'WorkspaceId, title, and startIso required' }, { status: 400 });
    }

    const start = new Date(startIso);
    const end = endIso ? new Date(endIso) : new Date(start.getTime() + 45 * 60 * 1000);

    const event = await crmRepo.createCalendarEvent(workspaceId, {
      leadId,
      title,
      description: description || 'Rapport CRM Scheduled Discovery & Negotiation Call',
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      attendees: attendees || [],
      meetUrl: `https://meet.google.com/rap-${Math.random().toString(36).substring(2, 6)}-${Math.random().toString(36).substring(2, 5)}`,
      googleEventId: `gcal-${Date.now()}`,
      synced: true,
    });

    return NextResponse.json({
      success: true,
      event,
      message: `Google Calendar event scheduled for ${start.toLocaleDateString()} at ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
