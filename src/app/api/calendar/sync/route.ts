import { NextResponse } from 'next/server';
import { syncGoogleCalendarEvents } from '@/lib/calendar/google-calendar';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const workspaceId = body.workspaceId || 'ws-default';

    const result = await syncGoogleCalendarEvents(workspaceId);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
