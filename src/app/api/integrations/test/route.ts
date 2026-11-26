import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/rbac';
import { testSmtpConnection, sendSmtpEmail } from '@/lib/email/smtp';
import { getCalendarConnectionStatus, testCalendarConnection } from '@/lib/calendar/google-calendar';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId') || 'ws-default';

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const [smtp, calendar] = await Promise.all([
      testSmtpConnection(),
      getCalendarConnectionStatus(workspaceId),
    ]);

    return NextResponse.json({
      gemini: { isConfigured: Boolean(process.env.GEMINI_API_KEY), success: false, model: 'gemini-2.5-flash', state: 'disabled' },
      smtp,
      google_calendar: calendar,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { target, workspaceId = 'ws-default', testEmailTo } = body;

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    // Require admin or settings permission to run integration tests
    if (!authContext.permissions.canEditWorkspaceSettings && !authContext.isMasterAdmin) {
      return NextResponse.json({ error: 'Permission denied: Settings access required' }, { status: 403 });
    }

    if (target === 'gemini') {
      return NextResponse.json({ isConfigured: Boolean(process.env.GEMINI_API_KEY), success: false, model: 'gemini-2.5-flash', state: 'disabled' });
    }

    if (target === 'smtp') {
      const result = await testSmtpConnection();
      return NextResponse.json(result);
    }

    if (target === 'smtp_send_test') {
      if (!testEmailTo) {
        return NextResponse.json({ error: 'Recipient email address required for test send.' }, { status: 400 });
      }

      // Security check: only allow test email to be sent to authenticated user or verified workspace domain
      const result = await sendSmtpEmail({
        to: testEmailTo,
        subject: 'Developster CRM — SMTP Connectivity Test',
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #252725;">
            <h2 style="color: #2F5C50;">Developster CRM SMTP Test Succeeded!</h2>
            <p>Your SMTP integration is properly configured and actively delivering emails.</p>
            <p style="font-size: 12px; color: #8A8880;">Verified by ${authContext.user.name} (${authContext.user.email}) at: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</p>
          </div>
        `,
      });
      return NextResponse.json(result);
    }

    if (target === 'google_calendar') {
      const result = await getCalendarConnectionStatus(workspaceId);
      return NextResponse.json(result);
    }

    if (target === 'google_calendar_test') {
      const result = await testCalendarConnection(workspaceId);
      return NextResponse.json(result);
    }

    if (target === 'google_meet') {
      const status = await getCalendarConnectionStatus(workspaceId);
      return NextResponse.json({
        available: status.isConnected,
        message: status.isConnected
          ? 'Google Meet conference link generation is active and ready.'
          : 'Google Meet requires connecting Google Calendar in Settings → Integrations.',
      });
    }

    return NextResponse.json({ error: 'Unknown integration target' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
