import { NextRequest, NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';
import {
  getAuthConfig,
  verifyEmail,
  verifyPassword,
  hashPassword,
  createSessionToken,
  checkLockoutAsync,
  recordFailedAttemptAsync,
  resetLockoutAsync,
} from '@/lib/auth';
import { getClientIp } from '@/lib/auth/get-ip';
import { checkRateLimit, createRateLimitResponse, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    // Normalize email: trim whitespace and convert to lowercase
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    // Do not trim or otherwise modify the password itself
    const password = typeof body.password === 'string' ? body.password : '';

    const ip = getClientIp(request);
    const authConfig = getAuthConfig();
    const {
      adminEmail,
      adminPassword,
      rawAdminPassword,
      isConfigured,
      missingVars,
      deploymentEnv,
    } = authConfig;

    const isHttps =
      request.nextUrl.protocol === 'https:' ||
      request.headers.get('x-forwarded-proto') === 'https' ||
      process.env.NODE_ENV === 'production' ||
      process.env.VERCEL === '1';

    // 1. Safe diagnostic configuration check
    if (!isConfigured) {
      console.error('[auth/login] Configuration missing in deployment:', {
        deploymentEnv,
        missing: missingVars,
        hasAdminEmail: Boolean(adminEmail),
        hasAdminPassword: Boolean(adminPassword),
        hasSessionSecret: Boolean(authConfig.sessionSecret),
      });

      return NextResponse.json(
        {
          error: `Authentication configuration missing for ${deploymentEnv} deployment. Missing: ${missingVars.join(', ')}. Please check Vercel environment variables.`,
          isConfigurationError: true,
          deploymentEnv,
          missingVars,
        },
        { status: 503 }
      );
    }

    // 1b. Enforce IP-based rate limiting (prevent request flooding / brute force attacks)
    const ipRateLimit = await checkRateLimit({
      limit: RATE_LIMIT_PRESETS.AUTH_LOGIN.limit,
      windowMs: RATE_LIMIT_PRESETS.AUTH_LOGIN.windowMs,
      identifier: `ip:${ip}:login`,
      category: 'login',
    });

    if (!ipRateLimit.success) {
      console.warn(`[auth/login] Rate limit exceeded for IP=${ip ? `${ip.slice(0, 4)}***` : 'unknown'}`);
      return createRateLimitResponse(
        ipRateLimit,
        `Too many login attempts from this IP address. Please retry in ${ipRateLimit.retryAfterSeconds} seconds.`
      );
    }

    // 2. Check existing lockout (checking shared store if configured, otherwise local)
    const lockStatus = await checkLockoutAsync(email, ip);
    if (lockStatus.isLocked) {
      console.warn(`[auth/login] Locked attempt from IP=${ip ? `${ip.slice(0, 4)}***` : 'unknown'}, remainingSeconds=${lockStatus.remainingSeconds}`);
      // 400ms delay on failed attempts
      await new Promise((r) => setTimeout(r, 400));
      return NextResponse.json(
        {
          error: 'Too many attempts.',
          isLocked: true,
          remainingSeconds: lockStatus.remainingSeconds,
        },
        { status: 423 }
      );
    }

    // 3. Validate email and password with server-side constant-time check
    const emailMatch = verifyEmail(email, adminEmail);
    const passMatch = verifyPassword(password, adminPassword, rawAdminPassword);
    let isValid = emailMatch && passMatch;
    let loggedInEmail = adminEmail;

    // Check team member credentials if not admin
    if (!isValid) {
      const { crmRepo } = await import('@/lib/google-sheets/repository');
      const member = await crmRepo.getMemberByEmail(email);
      if (member) {
        // Check member password using constant-time verifyPassword (scrypt / SHA / legacy)
        const memberPassValid = member.password
          ? verifyPassword(password, member.password)
          : passMatch; // allow initial login with workspace password if member has not set personal password

        if (memberPassValid) {
          isValid = true;
          loggedInEmail = member.email;

          // Transparent automatic migration: If member password is not yet scrypt, upgrade to scrypt
          if (member.password && !member.password.startsWith('scrypt:')) {
            try {
              const upgradedHash = hashPassword(password);
              await crmRepo.updateMember(member.workspaceId, member.id, {
                password: upgradedHash,
              });
              console.log(`[auth/login] Transparently migrated member password to scrypt for ${member.email}`);
            } catch (err) {
              console.warn('[auth/login] Failed automatic scrypt migration:', err);
            }
          }
        }
      }
    }

    // Safe diagnostic logging (never exposes email, password, hash, or secrets)
    console.log('[auth/login] Diagnostic check:', {
      ip: ip ? `${ip.slice(0, 4)}***` : 'unknown',
      emailProvidedLength: email.length,
      hasAdminEmailEnv: Boolean(adminEmail),
      emailMatch,
      passwordProvidedLength: password.length,
      hasAdminPasswordEnv: Boolean(adminPassword),
      passwordMatch: passMatch,
      isHttps,
      deploymentEnv,
    });

    if (!isValid) {
      // Record failed attempt
      const failResult = await recordFailedAttemptAsync(email, ip);
      // Fixed 400ms delay on every failed attempt
      await new Promise((r) => setTimeout(r, 400));

      if (failResult.isLocked) {
        return NextResponse.json(
          {
            error: 'Too many attempts.',
            isLocked: true,
            remainingSeconds: failResult.remainingSeconds,
          },
          { status: 423 }
        );
      }

      return NextResponse.json(
        {
          error: 'Invalid email or password.',
          isLocked: false,
          attemptsLeft: failResult.attemptsLeft,
        },
        { status: 401 }
      );
    }

    // 4. Successful login - reset lockout counters
    await resetLockoutAsync(email, ip);

    // Audit log Master Admin authentication
    if (loggedInEmail === adminEmail) {
      crmRepo.logAudit('ws-default', {
        userId: 'mem-admin',
        userName: 'Master Admin',
        action: 'auth.master_admin_login',
        details: `Master Admin authenticated successfully from IP: ${ip ? `${ip.slice(0, 4)}***` : 'unknown'}`,
      }).catch(() => {});
    }

    // 5. Create signed 30-day session token
    const token = createSessionToken(loggedInEmail);

    const response = NextResponse.json({
      success: true,
      email: loggedInEmail,
    });

    response.cookies.set('crm_session', token, {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return response;
  } catch (error) {
    console.error('[API auth/login] Unexpected error:', error);
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ error: 'Authentication service error. Please try again.' }, { status: 500 });
  }
}
