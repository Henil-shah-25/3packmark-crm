import { NextRequest, NextResponse } from 'next/server';
import { checkLockout, getAuthConfig } from '@/lib/auth';
import { getClientIp } from '@/lib/auth/get-ip';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email') || '';
  const ip = getClientIp(request);

  const status = checkLockout(email, ip);
  const authConfig = getAuthConfig();

  return NextResponse.json({
    isLocked: status.isLocked,
    remainingSeconds: status.remainingSeconds,
    attempts: status.attempts,
    maxAttempts: status.maxAttempts,
    diagnostics: {
      isConfigured: authConfig.isConfigured,
      deploymentEnv: authConfig.deploymentEnv,
      missingVars: authConfig.missingVars,
      hasAdminEmail: Boolean(authConfig.adminEmail),
      hasAdminPassword: Boolean(authConfig.adminPassword),
      hasSessionSecret: Boolean(authConfig.sessionSecret),
    },
  });
}
