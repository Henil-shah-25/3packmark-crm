import { NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';
import { getAuthenticatedUser } from '@/lib/auth/rbac';
import { getClientIp } from '@/lib/auth/get-ip';
import { checkRateLimit, createRateLimitResponse, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';
import { parseAndValidateJson } from '@/lib/security';

export async function GET(req: Request) {
  try {
    const authContext = await getAuthenticatedUser(req);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const workspaces = await crmRepo.getWorkspaces();
    return NextResponse.json(workspaces);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const authContext = await getAuthenticatedUser(req);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    if (!authContext.isMasterAdmin && authContext.user.role !== 'Owner') {
      return NextResponse.json({ error: 'Permission denied: Master Admin authorization required to create workspaces' }, { status: 403 });
    }

    const ip = getClientIp(req);
    const limitResult = await checkRateLimit({
      limit: RATE_LIMIT_PRESETS.SENSITIVE_WRITE.limit,
      windowMs: RATE_LIMIT_PRESETS.SENSITIVE_WRITE.windowMs,
      identifier: `ip:${ip}:workspace-create`,
      category: 'sensitive-write',
    });

    if (!limitResult.success) {
      return createRateLimitResponse(
        limitResult,
        `Workspace creation rate limit exceeded. Please retry in ${limitResult.retryAfterSeconds} seconds.`
      );
    }

    const jsonResult = await parseAndValidateJson<any>(req, { maxBytes: 64 * 1024 });
    if (!jsonResult.success) {
      return jsonResult.response;
    }
    const body = jsonResult.data;
    const { name, industry, currency, timezone, monthlyTarget } = body;
    if (!name) {
      return NextResponse.json({ error: 'Workspace name is required' }, { status: 400 });
    }

    const ws = await crmRepo.createWorkspace({
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      industry: industry || 'Technology',
      currency: currency || 'INR',
      timezone: timezone || 'Asia/Kolkata',
      monthlyTarget: Number(monthlyTarget) || 0,
    });

    return NextResponse.json(ws, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const jsonResult = await parseAndValidateJson<any>(req, { maxBytes: 64 * 1024 });
    if (!jsonResult.success) {
      return jsonResult.response;
    }
    const body = jsonResult.data;
    const { id, ...updates } = body;
    if (!id) {
      return NextResponse.json({ error: 'Workspace ID is required' }, { status: 400 });
    }

    const authContext = await getAuthenticatedUser(req, id);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    if (!authContext.permissions.canEditWorkspaceSettings && !authContext.isMasterAdmin) {
      return NextResponse.json({ error: 'Permission denied: Cannot edit workspace settings' }, { status: 403 });
    }

    const ip = getClientIp(req);
    const limitResult = await checkRateLimit({
      limit: RATE_LIMIT_PRESETS.SENSITIVE_WRITE.limit,
      windowMs: RATE_LIMIT_PRESETS.SENSITIVE_WRITE.windowMs,
      identifier: `ip:${ip}:workspace-update`,
      category: 'sensitive-write',
    });

    if (!limitResult.success) {
      return createRateLimitResponse(
        limitResult,
        `Workspace update rate limit exceeded. Please retry in ${limitResult.retryAfterSeconds} seconds.`
      );
    }

    const updated = await crmRepo.updateWorkspace(id, updates);
    if (!updated) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
