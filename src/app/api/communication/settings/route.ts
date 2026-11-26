import { NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';
import { getAuthenticatedUser } from '@/lib/auth/rbac';
import { getClientIp } from '@/lib/auth/get-ip';
import { checkRateLimit, createRateLimitResponse, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';
import { parseAndValidateJson } from '@/lib/security';


export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId') || 'ws-default';

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const settings = await crmRepo.getCommunicationSettings(workspaceId);
    return NextResponse.json(settings);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const jsonResult = await parseAndValidateJson<any>(req, { maxBytes: 64 * 1024 });
    if (!jsonResult.success) {
      return jsonResult.response;
    }
    const body = jsonResult.data;
    const { workspaceId, ...updates } = body;

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const ip = getClientIp(req);
    const limitResult = await checkRateLimit({
      limit: RATE_LIMIT_PRESETS.SENSITIVE_WRITE.limit,
      windowMs: RATE_LIMIT_PRESETS.SENSITIVE_WRITE.windowMs,
      identifier: `ip:${ip}:comm-settings`,
      category: 'sensitive-write',
    });

    if (!limitResult.success) {
      return createRateLimitResponse(
        limitResult,
        `Rate limit exceeded. Please retry in ${limitResult.retryAfterSeconds} seconds.`
      );
    }

    if (!authContext.isMasterAdmin && !authContext.permissions.canEditWorkspaceSettings) {
      return NextResponse.json({ error: 'Permission denied: Administrator role required to update settings' }, { status: 403 });
    }

    const saved = await crmRepo.saveCommunicationSettings(workspaceId, updates);
    return NextResponse.json(saved);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

