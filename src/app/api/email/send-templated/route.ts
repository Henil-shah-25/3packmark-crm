import { NextRequest, NextResponse } from 'next/server';
import { sendTemplatedEmail } from '@/lib/email/template-engine';
import { getAuthenticatedUser } from '@/lib/auth/rbac';
import { parseAndValidateJson, sanitizePlainText } from '@/lib/security';

export async function POST(request: NextRequest) {
  try {
    const jsonResult = await parseAndValidateJson<any>(request, { maxBytes: 128 * 1024 });
    if (!jsonResult.success) {
      return jsonResult.response;
    }
    const body = jsonResult.data;
    const { leadId, templateId, workspaceId, overrides = {} } = body;

    const targetWs = (workspaceId || 'ws-default').trim();
    const authContext = await getAuthenticatedUser(request, targetWs);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    if (authContext.user.role === 'Read-only') {
      return NextResponse.json({ error: 'Permission denied: Viewers cannot dispatch emails' }, { status: 403 });
    }

    if (!leadId || typeof leadId !== 'string') {
      return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
    }

    if (!templateId || typeof templateId !== 'string') {
      return NextResponse.json({ error: 'templateId is required' }, { status: 400 });
    }

    const effectiveWorkspaceId = authContext.user.workspaceId;

    const cleanOverrides = {
      ...overrides,
      workspaceId: effectiveWorkspaceId,
      subject: overrides.subject ? sanitizePlainText(String(overrides.subject), 300) : undefined,
    };

    const result = await sendTemplatedEmail(leadId, templateId, cleanOverrides);

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to dispatch email' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      logId: result.logId,
      message: 'Templated email dispatched and logged to activity',
    });
  } catch (error: any) {
    console.error('[API Send Templated Email Error]:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
