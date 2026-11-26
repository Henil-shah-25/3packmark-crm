import { NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';
import { validateVisualWorkflow } from '@/lib/automations/engine';
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

    // Auto-flush due scheduled automations on load (non-blocking if none due)
    try {
      const { processDueB2bAutomations } = await import('@/lib/automations/b2b-runner');
      await processDueB2bAutomations(workspaceId);
    } catch {}

    const automations = await crmRepo.getAutomations(workspaceId);
    const runs = await crmRepo.getAutomationRuns(workspaceId);
    return NextResponse.json({ automations, rules: automations, runs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const jsonResult = await parseAndValidateJson<any>(req, { maxBytes: 128 * 1024 });
    if (!jsonResult.success) {
      return jsonResult.response;
    }
    const body = jsonResult.data;
    const { workspaceId = 'ws-default', rule } = body;

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const ip = getClientIp(req);
    const writeLimit = await checkRateLimit({
      limit: RATE_LIMIT_PRESETS.SENSITIVE_WRITE.limit,
      windowMs: RATE_LIMIT_PRESETS.SENSITIVE_WRITE.windowMs,
      identifier: `ip:${ip}:automations`,
      category: 'sensitive-write',
    });

    if (!writeLimit.success) {
      return createRateLimitResponse(
        writeLimit,
        `Rate limit exceeded. Please retry in ${writeLimit.retryAfterSeconds} seconds.`
      );
    }

    if (!authContext.permissions.canManageAutomations && !authContext.isMasterAdmin) {
      return NextResponse.json({ error: 'Permission denied: Cannot manage automations' }, { status: 403 });
    }

    if (!rule?.name) {
      return NextResponse.json({ error: 'Rule name is required' }, { status: 400 });
    }

    // Validate visual workflow only when visual nodes are explicitly provided
    const stages = await crmRepo.getStages(workspaceId);
    const hasVisualNodes = Array.isArray(rule.nodes) && rule.nodes.length > 0;
    const validation = hasVisualNodes
      ? validateVisualWorkflow(rule, stages)
      : { isValid: true, errors: [], warnings: [] };

    if (hasVisualNodes && rule.isActive && !validation.isValid) {
      return NextResponse.json({
        error: 'Workflow has validation errors and cannot be activated.',
        errors: validation.errors,
      }, { status: 422 });
    }

    const saved = await crmRepo.saveAutomationRule(workspaceId, rule);
    return NextResponse.json({
      success: true,
      rule: saved,
      validation,
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  return POST(req);
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId') || 'ws-default';
    const id = searchParams.get('id');

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    if (!authContext.permissions.canManageAutomations && !authContext.isMasterAdmin) {
      return NextResponse.json({ error: 'Permission denied: Cannot manage automations' }, { status: 403 });
    }

    if (!id) {
      return NextResponse.json({ error: 'Missing automation ID' }, { status: 400 });
    }

    await crmRepo.deleteAutomationRule(workspaceId, id);
    return NextResponse.json({ success: true, deletedId: id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
