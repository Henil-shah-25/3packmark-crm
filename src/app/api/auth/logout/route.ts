import { NextRequest, NextResponse } from 'next/server';
import { revokeSessionToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const isHttps = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';

  // Server-side session revocation
  let token = request.cookies.get('crm_session')?.value;
  if (!token) {
    const cookieHeader = request.headers.get('cookie');
    if (cookieHeader) {
      const match = cookieHeader.match(/crm_session=([^;]+)/);
      if (match) token = match[1];
    }
  }
  if (token) {
    revokeSessionToken(token);
  }

  const response = NextResponse.json({ success: true, message: 'Logged out successfully.' });
  response.cookies.set('crm_session', '', {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  });
  return response;
}
