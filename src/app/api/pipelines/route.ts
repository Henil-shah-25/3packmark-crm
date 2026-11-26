import { NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';
import { getAuthenticatedUser, filterPipelinesForUser } from '@/lib/auth/rbac';
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

    const pipelines = await crmRepo.getPipelines(workspaceId);
    const filtered = filterPipelinesForUser(authContext.user, pipelines);
    return NextResponse.json(filtered);
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
    const { workspaceId = 'ws-default', pipeline } = body;

    if (!pipeline) {
      return NextResponse.json({ error: 'Pipeline data required' }, { status: 400 });
    }

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const ip = getClientIp(req);
    const limitResult = await checkRateLimit({
      limit: RATE_LIMIT_PRESETS.SENSITIVE_WRITE.limit,
      windowMs: RATE_LIMIT_PRESETS.SENSITIVE_WRITE.windowMs,
      identifier: `ip:${ip}:pipeline-save`,
      category: 'sensitive-write',
    });

    if (!limitResult.success) {
      return createRateLimitResponse(
        limitResult,
        `Pipeline configuration rate limit exceeded. Please retry in ${limitResult.retryAfterSeconds} seconds.`
      );
    }

    if (!authContext.permissions.canManagePipelines && !authContext.isMasterAdmin) {
      return NextResponse.json({ error: 'Permission denied: Cannot manage pipelines' }, { status: 403 });
    }

    const saved = await crmRepo.savePipeline(workspaceId, pipeline);
    return NextResponse.json(saved);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  return POST(req);
}

export async function PATCH(req: Request) {
  try {
    const jsonResult = await parseAndValidateJson<any>(req, { maxBytes: 64 * 1024 });
    if (!jsonResult.success) {
      return jsonResult.response;
    }
    const body = jsonResult.data;
    const { workspaceId = 'ws-default', pipelineId = 'pipe-sales', stageId, color, name, probability } = body;

    if (!stageId) {
      return NextResponse.json({ error: 'stageId is required' }, { status: 400 });
    }

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    if (!authContext.permissions.canManagePipelines && !authContext.isMasterAdmin) {
      return NextResponse.json({ error: 'Permission denied: Cannot manage pipelines' }, { status: 403 });
    }

    const pipelines = await crmRepo.getPipelines(authContext.user.workspaceId);
    const targetPipe = pipelines.find((p) => p.id === pipelineId) || pipelines[0];
    if (!targetPipe) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
    }

    const updatedStages = (targetPipe.stages || []).map((s) =>
      s.id === stageId
        ? {
            ...s,
            ...(color !== undefined ? { color: String(color).trim() } : {}),
            ...(name !== undefined ? { name: String(name).trim() } : {}),
            ...(probability !== undefined ? { probability: Number(probability) } : {}),
          }
        : s
    );

    const saved = await crmRepo.savePipeline(authContext.user.workspaceId, {
      ...targetPipe,
      stages: updatedStages,
    });

    return NextResponse.json({ success: true, pipeline: saved });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
