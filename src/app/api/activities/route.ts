import { NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';
import { getAuthenticatedUser, canUserAccessLead } from '@/lib/auth/rbac';
import { parseAndValidateJson, sanitizePlainText } from '@/lib/security';
import { checkRateLimit, createRateLimitResponse, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/auth/get-ip';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId') || 'ws-default';
    const leadId = searchParams.get('leadId') || undefined;

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (authContext && leadId) {
      const lead = await crmRepo.getLeadById(workspaceId, leadId);
      if (lead) {
        const pipelines = await crmRepo.getPipelines(workspaceId);
        const pipe = pipelines.find((p) => p.id === lead.pipelineId);
        if (!canUserAccessLead(authContext.user, lead, pipe)) {
          return NextResponse.json({ error: 'Permission denied: Cannot view activities for this lead' }, { status: 403 });
        }
      }
    }

    const activities = await crmRepo.getActivities(workspaceId, leadId);
    return NextResponse.json(activities);
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
    const { workspaceId, leadId, type, title, description, authorName, metadata } = body;
    const targetWs = workspaceId || 'ws-default';

    if (!targetWs || !leadId || !title) {
      return NextResponse.json({ error: 'WorkspaceId, leadId, and title are required' }, { status: 400 });
    }

    const ip = getClientIp(req);
    const limit = await checkRateLimit({
      limit: RATE_LIMIT_PRESETS.ACTIVITIES_WRITE.limit,
      windowMs: RATE_LIMIT_PRESETS.ACTIVITIES_WRITE.windowMs,
      identifier: `ip:${ip}:activities`,
      category: 'activities',
    });
    if (!limit.success) {
      return createRateLimitResponse(limit, 'Activity logging rate limit reached.');
    }

    const authContext = await getAuthenticatedUser(req, targetWs);
    if (authContext) {
      if (authContext.user.role === 'Read-only') {
        return NextResponse.json({ error: 'Viewers cannot create activities' }, { status: 403 });
      }
      const lead = await crmRepo.getLeadById(targetWs, leadId);
      if (lead) {
        const pipelines = await crmRepo.getPipelines(targetWs);
        const pipe = pipelines.find((p) => p.id === lead.pipelineId);
        if (!canUserAccessLead(authContext.user, lead, pipe)) {
          return NextResponse.json({ error: 'Permission denied: Cannot log activity for this lead' }, { status: 403 });
        }
      }
    }

    const effectiveAuthorName = authorName || authContext?.user.name || 'Developster Team';

    const activity = await crmRepo.logActivity(targetWs, {
      leadId,
      type: type || 'note',
      title,
      description: description || '',
      authorName: effectiveAuthorName,
      metadata,
    });

    return NextResponse.json(activity, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
