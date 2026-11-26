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

    const channel = searchParams.get('channel') || undefined;
    const status = searchParams.get('status') || undefined;
    const search = searchParams.get('search') || undefined;
    let employeeId = searchParams.get('employeeId') || undefined;

    // RBAC: If employee cannot view all leads and is not Master Admin, restrict to assigned conversations
    if (!authContext.isMasterAdmin && !authContext.permissions.canViewAllLeads) {
      employeeId = authContext.user.id;
    }

    const conversations = await crmRepo.getConversations(workspaceId, {
      channel,
      status,
      search,
      employeeId,
    });

    return NextResponse.json(conversations);
  } catch (err: any) {
    console.error('[API Communication Conversations GET Error]:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const jsonResult = await parseAndValidateJson<any>(req, { maxBytes: 64 * 1024 });
    if (!jsonResult.success) {
      return jsonResult.response;
    }
    const body = jsonResult.data;
    const { workspaceId, customerId, customerName, customerPhone, customerEmail, channel, assignedEmployeeId, assignedEmployeeName } = body;

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const ip = getClientIp(req);
    const limitResult = await checkRateLimit({
      limit: RATE_LIMIT_PRESETS.STANDARD_WRITE.limit,
      windowMs: RATE_LIMIT_PRESETS.STANDARD_WRITE.windowMs,
      identifier: `ip:${ip}:conversation-create`,
      category: 'standard-write',
    });

    if (!limitResult.success) {
      return createRateLimitResponse(
        limitResult,
        `Conversation creation rate limit exceeded. Please retry in ${limitResult.retryAfterSeconds} seconds.`
      );
    }

    if (authContext.user.role === 'Read-only') {
      return NextResponse.json({ error: 'Permission denied: Viewers cannot create conversations' }, { status: 403 });
    }

    if (!customerName || !channel) {
      return NextResponse.json({ error: 'customerName and channel are required' }, { status: 400 });
    }

    // Check if conversation already exists for customer + channel
    const existing = await crmRepo.getConversations(workspaceId, { channel });
    const match = existing.find((c) => (customerId && c.customerId === customerId) || (customerPhone && c.customerPhone === customerPhone));
    if (match) {
      return NextResponse.json(match);
    }

    const newConv = await crmRepo.createConversation(workspaceId, {
      workspaceId,
      customerId,
      customerName,
      customerPhone,
      customerEmail,
      channel,
      status: 'open',
      assignedEmployeeId: assignedEmployeeId || authContext.user.id,
      assignedEmployeeName: assignedEmployeeName || authContext.user.name,
      lastMessageAt: new Date().toISOString(),
      lastMessagePreview: 'Conversation started',
      lastMessageDirection: 'outbound',
      unreadCount: 0,
    });

    return NextResponse.json(newConv, { status: 201 });
  } catch (err: any) {
    console.error('[API Communication Conversations POST Error]:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

