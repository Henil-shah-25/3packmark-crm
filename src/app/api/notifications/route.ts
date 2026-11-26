import { NextRequest, NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';
import { getAuthenticatedUser } from '@/lib/auth/rbac';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId') || 'ws-default';

    const authContext = await getAuthenticatedUser(request, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const notifications = await crmRepo.getNotifications(workspaceId);
    const unreadCount = notifications.filter((n) => !n.isRead).length;

    return NextResponse.json({ notifications, unreadCount });
  } catch (error: any) {
    console.error('[API Notifications GET Error]:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch notifications' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { workspaceId = 'ws-default', action = 'mark_all_read', id } = body;

    const authContext = await getAuthenticatedUser(request, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    if (action === 'mark_read' && id) {
      await crmRepo.markNotificationRead(workspaceId, id);
    } else {
      await crmRepo.markAllNotificationsRead(workspaceId);
    }

    const notifications = await crmRepo.getNotifications(workspaceId);
    const unreadCount = notifications.filter((n) => !n.isRead).length;

    return NextResponse.json({ success: true, notifications, unreadCount });
  } catch (error: any) {
    console.error('[API Notifications PUT Error]:', error);
    return NextResponse.json({ error: error.message || 'Failed to update notifications' }, { status: 500 });
  }
}
