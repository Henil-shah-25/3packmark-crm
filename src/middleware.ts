import { NextRequest, NextResponse } from 'next/server';
import { checkDistributedRevocation, RevocationStatus } from './lib/auth/shared-store';

function decodeBase64Url(str: string): string {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  return atob(padded);
}

function stripOuterQuotes(val: string | undefined | null): string {
  if (!val) return '';
  let s = val;
  if ((s.startsWith('"') && s.endsWith('"') && s.length >= 2) || (s.startsWith("'") && s.endsWith("'") && s.length >= 2)) {
    s = s.slice(1, -1);
  }
  return s.replace(/\r?\n$/, '').trim();
}

/**
 * Validates returnTo path to prevent open redirects.
 * Only permits strictly safe, relative application paths.
 */
export function isValidReturnTo(returnTo: string | undefined | null): boolean {
  if (!returnTo || typeof returnTo !== 'string') return false;
  const trimmed = returnTo.trim();

  // Must start with '/' and not '//' or '/\' or '\'
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\') || trimmed.startsWith('\\')) {
    return false;
  }

  // Reject control characters
  if (/[\x00-\x1F\x7F]/.test(trimmed)) {
    return false;
  }

  // Reject backslashes
  if (trimmed.includes('\\')) {
    return false;
  }

  // Reject dangerous schemes
  if (/javascript:|data:|vbscript:/i.test(trimmed)) {
    return false;
  }

  // Reject URI scheme prefixes (e.g. https://, http://, ftp://)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return false;
  }

  // Validate URL decoding
  try {
    const decoded = decodeURIComponent(trimmed);
    if (
      !decoded.startsWith('/') ||
      decoded.startsWith('//') ||
      decoded.startsWith('/\\') ||
      decoded.includes('\\') ||
      /[\x00-\x1F\x7F]/.test(decoded) ||
      /javascript:|data:|vbscript:/i.test(decoded) ||
      /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(decoded)
    ) {
      return false;
    }
  } catch {
    return false;
  }

  return true;
}

async function verifySessionTokenEdge(
  token: string | undefined | null,
  secret: string
): Promise<{ valid: boolean; email?: string; jti?: string }> {
  if (!token || typeof token !== 'string') return { valid: false };
  if (!secret) return { valid: false };
  const parts = token.split('.');
  if (parts.length !== 2) return { valid: false };

  const [payloadB64, signatureB64] = parts;

  let payload: { email?: string; exp?: number; iat?: number; jti?: string };
  try {
    const payloadJson = decodeBase64Url(payloadB64);
    payload = JSON.parse(payloadJson);
    if (!payload.exp || Date.now() > payload.exp) {
      return { valid: false };
    }
  } catch {
    return { valid: false };
  }

  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const sigBinary = decodeBase64Url(signatureB64);
    const sigBytes = new Uint8Array(sigBinary.length);
    for (let i = 0; i < sigBinary.length; i++) {
      sigBytes[i] = sigBinary.charCodeAt(i);
    }

    const dataBytes = enc.encode(payloadB64);
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, dataBytes);
    return { valid, email: payload.email, jti: payload.jti };
  } catch {
    return { valid: false };
  }
}

export function applySecurityHeaders(response: NextResponse, isHttps: boolean = false): NextResponse {
  const isProd = process.env.NODE_ENV === 'production';

  // In production, 'unsafe-eval' is removed to satisfy MED-01
  const scriptDirectives = isProd
    ? "script-src 'self' 'unsafe-inline' https://apis.google.com https://accounts.google.com"
    : "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://apis.google.com https://accounts.google.com";

  // 1. Content Security Policy (CSP)
  const csp = [
    "default-src 'self'",
    scriptDirectives,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: https://images.unsplash.com https://lh3.googleusercontent.com",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https://accounts.google.com https://www.googleapis.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  if (isHttps) {
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }

  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const sessionSecret = stripOuterQuotes(process.env.SESSION_SECRET || '');

  const isHttps =
    request.nextUrl.protocol === 'https:' ||
    request.headers.get('x-forwarded-proto') === 'https' ||
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL === '1';

  const normalizedPath = pathname.replace(/\/+$/, '').toLowerCase() || '/';

  // 1. Static assets and Next.js internals are always public
  if (
    normalizedPath.startsWith('/_next') ||
    normalizedPath.startsWith('/static') ||
    normalizedPath === '/favicon.ico' ||
    normalizedPath === '/manifest.json' ||
    normalizedPath.endsWith('.svg') ||
    normalizedPath.endsWith('.png') ||
    normalizedPath.endsWith('.jpg') ||
    normalizedPath.endsWith('.ico') ||
    normalizedPath.endsWith('.woff2')
  ) {
    return applySecurityHeaders(NextResponse.next(), isHttps);
  }

  // 3. Public auth endpoints and cron
  if (
    normalizedPath === '/api/auth/login' ||
    normalizedPath === '/api/auth/logout' ||
    normalizedPath === '/api/auth/lockout-status' ||
    normalizedPath === '/api/cron/tick'
  ) {
    return applySecurityHeaders(NextResponse.next(), isHttps);
  }

  const token = request.cookies.get('crm_session')?.value;
  const { valid, email: sessionEmail, jti } = await verifySessionTokenEdge(token, sessionSecret);

  // Reject stale Developster Hub legacy session cookies so 3packmark users must sign in
  const LEGACY_EMAILS = new Set([
    'developsterhub@gmail.com',
    'priya.sharma@developsterhub.com',
    'aarav.mehta@developsterhub.com',
    'diya.patel@developsterhub.com',
    'kabir.joshi@developsterhub.com',
  ]);
  const isLegacySession = Boolean(sessionEmail && LEGACY_EMAILS.has(sessionEmail.toLowerCase().trim()));

  // If token signature is valid, verify it has not been revoked in the distributed store
  let isRevoked = false;
  let revocationStatus: RevocationStatus = 'active';
  let revocationError: string | undefined;

  if (valid && jti) {
    const revCheck = await checkDistributedRevocation(jti);
    isRevoked = revCheck.isRevoked;
    revocationStatus = revCheck.status;
    revocationError = revCheck.errorMessage;
  }

  // When Redis is unconfigured, checkDistributedRevocation returns status: 'unconfigured' and isRevoked: false.
  // Only if Redis was explicitly configured but failed or timed out during request handling do we handle store_unavailable.
  if (valid && revocationStatus === 'store_unavailable') {
    if (pathname.startsWith('/api/')) {
      const response = NextResponse.json(
        {
          error: 'Authentication service temporarily unavailable: Distributed session verification failed.',
          code: revocationStatus,
          message: revocationError,
        },
        { status: 503 }
      );
      response.headers.set('Retry-After', '5');
      response.headers.set('X-Auth-Revocation-Status', revocationStatus);
      return applySecurityHeaders(response, isHttps);
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('error', 'auth_service_unavailable');
    loginUrl.searchParams.set('code', revocationStatus);
    const response = NextResponse.redirect(loginUrl);
    response.headers.set('X-Auth-Revocation-Status', revocationStatus);
    return applySecurityHeaders(response, isHttps);
  }

  const isSessionActive = valid && !isRevoked && !isLegacySession;

  // 3. Login page handling
  if (pathname === '/login') {
    if (isSessionActive) {
      // Logged-in user visiting /login goes to the app
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.search = '';
      return applySecurityHeaders(NextResponse.redirect(url), isHttps);
    }
    return applySecurityHeaders(NextResponse.next(), isHttps);
  }

  // 4. Authenticated request: slide renewal if needed & allow
  if (isSessionActive) {
    const response = NextResponse.next();

    // Sliding session renewal: refresh cookie expiry to 30 days
    if (token) {
      response.cookies.set('crm_session', token, {
        httpOnly: true,
        secure: isHttps,
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60,
      });
    }
    return applySecurityHeaders(response, isHttps);
  }

  // 5. Unauthenticated: API routes return 401
  if (pathname.startsWith('/api/')) {
    return applySecurityHeaders(
      NextResponse.json({ error: 'Unauthorized. Authentication required.' }, { status: 401 }),
      isHttps
    );
  }

  // 6. Unauthenticated: Pages redirect to /login with validated returnTo (Open redirect defense)
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  const returnTo = pathname + (search || '');
  if (returnTo !== '/' && returnTo !== '' && isValidReturnTo(returnTo)) {
    loginUrl.searchParams.set('returnTo', returnTo);
  }
  const redirectRes = NextResponse.redirect(loginUrl);
  if (isLegacySession) {
    redirectRes.cookies.delete('crm_session');
  }
  return applySecurityHeaders(redirectRes, isHttps);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
