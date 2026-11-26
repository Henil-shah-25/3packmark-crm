import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/rbac';
import { verifySessionToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('crm_session')?.value;
  if (!token) {
    return NextResponse.json({ authenticated: false, error: 'No session cookie present' }, { status: 401 });
  }

  const session = verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ authenticated: false, error: 'Invalid or expired session token' }, { status: 401 });
  }

  const authContext = await getAuthenticatedUser(request);

  return NextResponse.json({
    authenticated: true,
    email: session.email,
    user: authContext?.user || null,
    permissions: authContext?.permissions || null,
    isMasterAdmin: authContext?.isMasterAdmin ?? false,
  });
}
