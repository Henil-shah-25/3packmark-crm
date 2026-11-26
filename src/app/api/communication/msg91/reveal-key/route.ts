import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/rbac';
import { crmRepo } from '@/lib/google-sheets/repository';
import { decryptSecret } from '@/lib/config/credentials';
import { verifySecurityPin } from '@/lib/communication/msg91-client';
import { getClientIp } from '@/lib/auth/get-ip';
import { checkRateLimit, createRateLimitResponse, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { workspaceId, securityPin } = body;

    if (!workspaceId || !securityPin) {
      return NextResponse.json({ error: 'workspaceId and securityPin are required' }, { status: 400 });
    }

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    if (!authContext.isMasterAdmin && !authContext.permissions.canEditWorkspaceSettings) {
      return NextResponse.json({ error: 'Permission denied: Administrator role required' }, { status: 403 });
    }

    // Rate limit secret key reveal operations
    const ip = getClientIp(req);
    const revealLimit = await checkRateLimit({
      limit: RATE_LIMIT_PRESETS.MSG91_KEY_REVEAL.limit,
      windowMs: RATE_LIMIT_PRESETS.MSG91_KEY_REVEAL.windowMs,
      identifier: `user:${authContext.user.id}:ip:${ip}:msg91-reveal`,
      category: 'msg91-key-reveal',
    });

    if (!revealLimit.success) {
      return createRateLimitResponse(
        revealLimit,
        `Too many key reveal attempts. Please retry in ${revealLimit.retryAfterSeconds} seconds.`
      );
    }

    const creds = (await crmRepo.getWorkspaceCredentials(workspaceId)) || {};
    const storedPinHash = creds.msg91SecurityPinHash;
    const encryptedKey = creds.msg91AuthKey;

    if (!encryptedKey) {
      return NextResponse.json({ error: 'No MSG91 Auth Key stored for this workspace' }, { status: 404 });
    }

    if (!storedPinHash) {
      return NextResponse.json(
        { error: 'Security PIN has not been set for this workspace. Please configure a PIN first.' },
        { status: 400 }
      );
    }

    // Verify PIN with rate limiting
    const pinCheck = verifySecurityPin(workspaceId, securityPin, storedPinHash);
    if (!pinCheck.valid) {
      return NextResponse.json(
        {
          error: pinCheck.error || 'Invalid security PIN',
          locked: pinCheck.locked,
          remainingAttempts: pinCheck.remainingAttempts,
        },
        { status: 403 }
      );
    }

    // Decrypt Auth Key safely
    const revealedKey = decryptSecret(encryptedKey);
    return NextResponse.json({
      success: true,
      revealedKey,
    });
  } catch (err: any) {
    console.error('[API MSG91 Reveal Key Error]:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

