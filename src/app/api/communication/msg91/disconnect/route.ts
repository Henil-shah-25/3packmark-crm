import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/rbac';
import { crmRepo } from '@/lib/google-sheets/repository';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { workspaceId } = body;

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    if (!authContext.isMasterAdmin && !authContext.permissions.canEditWorkspaceSettings) {
      return NextResponse.json({ error: 'Permission denied: Administrator role required' }, { status: 403 });
    }

    const creds = (await crmRepo.getWorkspaceCredentials(workspaceId)) || {};
    delete creds.msg91AuthKey;
    delete creds.msg91VerifiedAt;

    await crmRepo.saveWorkspaceCredentials(workspaceId, creds);

    // Update communication settings status
    await crmRepo.saveCommunicationSettings(workspaceId, {
      whatsapp: {
        provider: 'msg91',
        isConfigured: false,
        status: 'not_configured',
      },
      sms: {
        provider: 'msg91',
        isConfigured: false,
        status: 'not_configured',
      },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[API MSG91 Disconnect Error]:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

