import { NextResponse } from 'next/server';
import { getCalendarConnectionStatus } from '@/lib/calendar/google-calendar';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId') || 'ws-default';

    const status = await getCalendarConnectionStatus(workspaceId);
    return NextResponse.json({
      ...status,
      connected: status.isConnected,
      email: status.userEmail,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
