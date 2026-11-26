import { NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';
import { createGoogleCalendarEvent, getCalendarConnectionStatus } from '@/lib/calendar/google-calendar';
import { sendMeetingInvite } from '@/lib/email/smtp';
import { getAuthenticatedUser, canUserAccessLead } from '@/lib/auth/rbac';
import { getClientIp } from '@/lib/auth/get-ip';
import { checkRateLimit, createRateLimitResponse, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';
import { parseAndValidateJson } from '@/lib/security';
import { CalendarEvent } from '@/types/crm';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId') || 'ws-default';

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const events = await crmRepo.getCalendarEvents(workspaceId);
    return NextResponse.json(events);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const jsonResult = await parseAndValidateJson<any>(req, { maxBytes: 64 * 1024 });
    if (!jsonResult.success) {
      return jsonResult.response;
    }
    const body = jsonResult.data;
    const {
      workspaceId = 'ws-default',
      leadId,
      dealTitle,
      title,
      description,
      startIso,
      endIso,
      timezone,
      attendees,
      enableMeet,
      sendEmailNotification,
    } = body;

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const ip = getClientIp(req);
    const syncLimit = await checkRateLimit({
      limit: RATE_LIMIT_PRESETS.CALENDAR_SYNC.limit,
      windowMs: RATE_LIMIT_PRESETS.CALENDAR_SYNC.windowMs,
      identifier: `ip:${ip}:calendar-sync`,
      category: 'calendar-sync',
    });

    if (!syncLimit.success) {
      return createRateLimitResponse(
        syncLimit,
        `Calendar event scheduling rate limit exceeded. Please retry in ${syncLimit.retryAfterSeconds} seconds.`
      );
    }

    if (authContext.user.role === 'Read-only') {
      return NextResponse.json({ error: 'Permission denied: Read-only viewers cannot schedule meetings' }, { status: 403 });
    }

    if (!workspaceId || !title || !startIso) {
      return NextResponse.json(
        { error: 'WorkspaceId, title, and start time (startIso) are required.' },
        { status: 400 }
      );
    }

    const start = new Date(startIso);
    if (isNaN(start.getTime())) {
      return NextResponse.json({ error: 'Invalid start time format.' }, { status: 400 });
    }

    const end = endIso ? new Date(endIso) : new Date(start.getTime() + 45 * 60 * 1000);
    if (end <= start) {
      return NextResponse.json({ error: 'End time must be after start time.' }, { status: 400 });
    }

    const attendeeList: string[] = Array.isArray(attendees)
      ? attendees.filter((a) => typeof a === 'string' && a.includes('@'))
      : [];

    let googleEventId: string | undefined = undefined;
    let calendarEventUrl: string | undefined = undefined;
    let meetUrl: string | undefined = undefined;
    let conferenceStatus: 'confirmed' | 'pending' | 'failed' | 'disabled' = 'disabled';
    let isSynced = false;
    let syncError: string | undefined = undefined;

    // Check if Google Calendar integration is connected
    const calStatus = await getCalendarConnectionStatus(workspaceId);
    if (calStatus.isConnected) {
      const gcalRes = await createGoogleCalendarEvent({
        workspaceId,
        title,
        description,
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        timezone: timezone || 'UTC',
        attendees: attendeeList,
        enableMeet: enableMeet !== false,
      });

      if (gcalRes.success) {
        googleEventId = gcalRes.googleEventId;
        calendarEventUrl = gcalRes.calendarEventUrl;
        meetUrl = gcalRes.meetUrl;
        conferenceStatus = gcalRes.conferenceStatus || (meetUrl ? 'confirmed' : 'disabled');
        isSynced = true;
      } else {
        syncError = gcalRes.error;
      }
    }

    // Persist to CRM (Google Sheets / Store)
    const newEvent: CalendarEvent = await crmRepo.createCalendarEvent(workspaceId, {
      leadId,
      dealTitle,
      title,
      description,
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      timezone: timezone || 'UTC',
      attendees: attendeeList,
      meetUrl,
      googleEventId,
      calendarEventUrl,
      conferenceStatus,
      status: 'scheduled',
      synced: isSynced,
      syncError,
      lastSyncAt: isSynced ? new Date().toISOString() : undefined,
    });

    // Optional email invitation via Gmail SMTP
    let emailDispatched = false;
    if (sendEmailNotification !== false && attendeeList.length > 0) {
      const lead = leadId ? await crmRepo.getLeadById(workspaceId, leadId) : null;
      const emailRes = await sendMeetingInvite(newEvent, lead);
      emailDispatched = emailRes.success;
    }

    // Trigger workflow automation engine for meeting_created
    if (leadId) {
      const lead = await crmRepo.getLeadById(workspaceId, leadId);
      if (lead) {
        await crmRepo.executeAutomationsForEvent(workspaceId, 'meeting_created', lead);
      }
    }

    return NextResponse.json({
      success: true,
      event: newEvent,
      googleCalendarConnected: calStatus.isConnected,
      meetGenerated: Boolean(meetUrl),
      meetUrl,
      emailDispatched,
      message: `Meeting scheduled for ${start.toLocaleDateString()} at ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
