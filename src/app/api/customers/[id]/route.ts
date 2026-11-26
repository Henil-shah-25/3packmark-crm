import { NextRequest, NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';
import { getAuthenticatedUser } from '@/lib/auth/rbac';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId') || 'ws-default';

    const authContext = await getAuthenticatedUser(request, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const effectiveWorkspaceId = authContext.user.workspaceId;
    const canDelete = authContext.isMasterAdmin || ['Owner', 'Admin', 'Manager'].includes(authContext.user.role);
    if (!canDelete) {
      return NextResponse.json(
        { error: 'Permission denied: Only Workspace Owners, Admins, or Managers can delete customers' },
        { status: 403 }
      );
    }

    await crmRepo.deleteCustomer(effectiveWorkspaceId, id);
    await crmRepo.logAudit(effectiveWorkspaceId, {
      userId: authContext.user.id,
      userName: authContext.user.name,
      action: 'customer.delete',
      details: `Deleted customer record ID: ${id}`,
    });
    return NextResponse.json({ success: true, deletedId: id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
