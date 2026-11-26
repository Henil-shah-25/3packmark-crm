import { NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';
import { getAuthenticatedUser, filterPipelinesForUser, filterLeadsForUser, DEFAULT_ROLE_PERMISSIONS } from '@/lib/auth/rbac';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId') || 'ws-default';

    const data = await crmRepo.getBootstrapData(workspaceId);
    const authContext = await getAuthenticatedUser(req, workspaceId);

    if (!authContext) {
      return NextResponse.json(
        { error: 'Unauthorized: Session required or not an active member of this workspace' },
        { status: 401 }
      );
    }

    // Log Master Admin access to customer workspaces for transparency and audit accountability
    if (authContext.isMasterAdmin) {
      await crmRepo.logAudit(workspaceId, {
        userId: authContext.user.id,
        userName: authContext.user.name,
        action: 'master_admin.workspace_access',
        details: `Platform Master Admin accessed tenant workspace data: ${workspaceId}`,
      });
    }

    const filteredPipelines = filterPipelinesForUser(authContext.user, data.pipelines);
    const filteredLeads = filterLeadsForUser(authContext.user, data.leads, data.pipelines);

    return NextResponse.json({
      ...data,
      pipelines: filteredPipelines,
      leads: filteredLeads,
      currentUser: authContext.user,
      userPermissions: authContext.permissions,
      isMasterAdmin: authContext.isMasterAdmin,
    });
  } catch (err: any) {
    console.error('[API Bootstrap GET Error]:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to load bootstrap data' },
      { status: 500 }
    );
  }
}
