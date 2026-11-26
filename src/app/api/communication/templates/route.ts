import { NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';
import { getAuthenticatedUser } from '@/lib/auth/rbac';
import { getClientIp } from '@/lib/auth/get-ip';
import { checkRateLimit, createRateLimitResponse, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';
import { parseAndValidateJson } from '@/lib/security';
import { CommunicationChannel } from '@/types/communication';


export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId') || 'ws-default';

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const channel = searchParams.get('channel') || undefined;
    const templates = await crmRepo.getCommunicationTemplates(workspaceId, channel);
    return NextResponse.json(templates);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const jsonResult = await parseAndValidateJson<any>(req, { maxBytes: 128 * 1024 });
    if (!jsonResult.success) {
      return jsonResult.response;
    }
    const body = jsonResult.data;
    const { workspaceId, name, channel, category, content, subject, variables, isExternalApproved, externalTemplateId } = body;

    if (!workspaceId || !name || !channel || !content) {
      return NextResponse.json({ error: 'workspaceId, name, channel, and content are required' }, { status: 400 });
    }

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const ip = getClientIp(req);
    const limitResult = await checkRateLimit({
      limit: RATE_LIMIT_PRESETS.STANDARD_WRITE.limit,
      windowMs: RATE_LIMIT_PRESETS.STANDARD_WRITE.windowMs,
      identifier: `ip:${ip}:template-create`,
      category: 'standard-write',
    });

    if (!limitResult.success) {
      return createRateLimitResponse(
        limitResult,
        `Template creation rate limit exceeded. Please retry in ${limitResult.retryAfterSeconds} seconds.`
      );
    }

    if (authContext.user.role === 'Read-only') {
      return NextResponse.json({ error: 'Permission denied: Viewers cannot create templates' }, { status: 403 });
    }

    // Extract variables automatically from content e.g. {{variable_name}}
    const detectedVariables: string[] = [];
    const matches = content.matchAll(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g);
    for (const match of matches) {
      if (match[1] && !detectedVariables.includes(match[1])) {
        detectedVariables.push(match[1]);
      }
    }

    const newTmpl = await crmRepo.createCommunicationTemplate(workspaceId, {
      workspaceId,
      name,
      channel: channel as CommunicationChannel,
      category: category || 'General',
      content,
      subject,
      variables: variables && variables.length > 0 ? variables : detectedVariables,
      isExternalApproved: Boolean(isExternalApproved),
      externalTemplateId,
    });

    return NextResponse.json(newTmpl, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const jsonResult = await parseAndValidateJson<any>(req, { maxBytes: 128 * 1024 });
    if (!jsonResult.success) {
      return jsonResult.response;
    }
    const body = jsonResult.data;
    const { workspaceId, id, ...updates } = body;

    if (!workspaceId || !id) {
      return NextResponse.json({ error: 'workspaceId and id are required' }, { status: 400 });
    }

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const ip = getClientIp(req);
    const limitResult = await checkRateLimit({
      limit: RATE_LIMIT_PRESETS.STANDARD_WRITE.limit,
      windowMs: RATE_LIMIT_PRESETS.STANDARD_WRITE.windowMs,
      identifier: `ip:${ip}:template-update`,
      category: 'standard-write',
    });

    if (!limitResult.success) {
      return createRateLimitResponse(
        limitResult,
        `Template update rate limit exceeded. Please retry in ${limitResult.retryAfterSeconds} seconds.`
      );
    }

    if (authContext.user.role === 'Read-only') {
      return NextResponse.json({ error: 'Permission denied: Viewers cannot update templates' }, { status: 403 });
    }

    const updated = await crmRepo.updateCommunicationTemplate(workspaceId, id, updates);
    if (!updated) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId') || 'ws-default';
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    if (authContext.user.role === 'Read-only') {
      return NextResponse.json({ error: 'Permission denied: Viewers cannot delete templates' }, { status: 403 });
    }

    const success = await crmRepo.deleteCommunicationTemplate(workspaceId, id);
    return NextResponse.json({ success });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

