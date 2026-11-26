import { NextResponse } from 'next/server';
import { generateAuthUrl, getCalendarOAuthConfig } from '@/lib/calendar/google-calendar';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId') || 'ws-default';

    const config = getCalendarOAuthConfig(req);
    if (!config.isConfigured) {
      return NextResponse.json({
        error: 'Google OAuth Client ID & Secret are not configured in environment variables.',
        instructions: 'Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env file.',
      }, { status: 400 });
    }

    const authUrl = generateAuthUrl(workspaceId, req);
    return NextResponse.json({ authUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
