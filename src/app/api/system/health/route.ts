import { NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';
import { getAuthenticatedUser } from '@/lib/auth/rbac';
import { testSmtpConnection } from '@/lib/email/smtp';
import { getCalendarConnectionStatus } from '@/lib/calendar/google-calendar';


/**
 * GET /api/system/health
 * Genuine server-side system health diagnosis for Administrators.
 * Strictly verifies database, email delivery, AI copilot, calendar sync, and job queue.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId') || 'ws-default';

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    if (!authContext.permissions.canEditWorkspaceSettings && !authContext.isMasterAdmin) {
      return NextResponse.json({ error: 'Permission denied: Administrator role required' }, { status: 403 });
    }

    // 1. Database & Google Sheets
    const dbStatus = await crmRepo.getStorageStatus();

    // 2. Email SMTP Provider
    const emailStatus = await testSmtpConnection();

    // 3. AI Copilot (Disabled for 3W PACKMARK CRM)
    const aiStatus = {
      isConfigured: Boolean(process.env.GEMINI_API_KEY),
      success: false,
      model: 'gemini-2.5-flash',
      state: 'disabled',
      message: 'AI UI disabled in 3W PACKMARK CRM',
    };

    // 4. Google Calendar & Meet
    const calendarStatus = await getCalendarConnectionStatus(workspaceId);

    // 5. Automation Scheduler & Jobs
    const jobs = await crmRepo.getScheduledJobs(workspaceId);
    const pendingJobs = jobs.filter((j) => j.status === 'pending');
    const failedJobs = jobs.filter((j) => j.status === 'failed');
    const completedJobs = jobs.filter((j) => j.status === 'completed');

    // 6. Workspaces & Team Count
    const workspaces = await crmRepo.getWorkspaces();
    const members = await crmRepo.getMembers(workspaceId);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      timezone: 'Asia/Kolkata (IST)',
      database: {
        type: dbStatus.isLiveGoogleSheets ? 'Google Sheets' : 'Local Persistent Store (Fallback)',
        isLive: dbStatus.isLiveGoogleSheets,
        spreadsheetId: dbStatus.spreadsheetId || 'None (Local JSON /tmp fallback active)',
        message: dbStatus.message,
      },
      email: {
        isConfigured: emailStatus.isConfigured,
        connected: emailStatus.success,
        host: emailStatus.host,
        port: emailStatus.port,
        message: emailStatus.message,
      },
      ai: {
        isConfigured: aiStatus.isConfigured,
        connected: aiStatus.success,
        model: aiStatus.model,
        state: aiStatus.state,
        message: aiStatus.message,
      },
      googleCalendar: {
        isConfigured: calendarStatus.isConfigured,
        connected: calendarStatus.isConnected,
        userEmail: calendarStatus.userEmail || null,
        message: calendarStatus.message || (calendarStatus.isConnected ? 'Connected' : 'Not Connected'),
      },
      scheduler: {
        cronSchedule: '0 9 * * * (Daily at 09:00 UTC / 14:30 IST — Vercel Hobby compliant)',
        totalJobs: jobs.length,
        pendingCount: pendingJobs.length,
        failedCount: failedJobs.length,
        completedCount: completedJobs.length,
        recentFailed: failedJobs.slice(0, 5).map((f) => ({
          id: f.id,
          ruleId: f.ruleId,
          error: f.error || f.cancellationReason || 'Unknown error',
          scheduledFor: f.scheduledFor,
        })),
      },
      tenancy: {
        activeWorkspaceId: workspaceId,
        totalWorkspaces: workspaces.length,
        totalTeamMembers: members.length,
      },
    });
  } catch (err: any) {
    console.error('[API System Health Error]:', err);
    return NextResponse.json({ error: err.message || 'System health check failed' }, { status: 500 });
  }
}

