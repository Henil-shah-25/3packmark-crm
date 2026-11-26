import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/rbac';
import { processDueB2bAutomations } from '@/lib/automations/b2b-runner';

export async function POST(req: Request) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {}

    const targetWs = String(body.workspaceId || 'ws-default').trim();
    const authContext = await getAuthenticatedUser(req, targetWs);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const forceAllPending = Boolean(body.forceAllPending);
    const summary = await processDueB2bAutomations(authContext.user.workspaceId, {
      forceAllPending,
    });

    return NextResponse.json({
      ok: true,
      ...summary,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to process due automations' }, { status: 500 });
  }
}
