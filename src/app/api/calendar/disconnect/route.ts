import { NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const workspaceId = body.workspaceId || 'ws-default';

    await crmRepo.deleteOAuthTokens(workspaceId, 'google_calendar');

    return NextResponse.json({
      success: true,
      message: 'Google Calendar integration disconnected successfully.',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
