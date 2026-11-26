import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/rbac';
import { crmRepo } from '@/lib/google-sheets/repository';
import { encryptSecret, maskSecret } from '@/lib/config/credentials';
import { testMsg91AuthKey, hashSecurityPin } from '@/lib/communication/msg91-client';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { workspaceId, authKey, securityPin, senderId, whatsappNumber } = body;

    if (!workspaceId || !authKey) {
      return NextResponse.json({ error: 'workspaceId and authKey are required' }, { status: 400 });
    }

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    if (!authContext.isMasterAdmin && !authContext.permissions.canEditWorkspaceSettings) {
      return NextResponse.json({ error: 'Permission denied: Administrator role required' }, { status: 403 });
    }

    const cleanKey = authKey.trim();
    // Test the credentials against MSG91 API gateway
    const testResult = await testMsg91AuthKey(cleanKey);

    // If verification failed and not in simulated test mode
    if (!testResult.success) {
      return NextResponse.json(
        {
          error: testResult.error || 'Failed to authenticate with MSG91 API. Please verify your Auth Key.',
        },
        { status: 400 }
      );
    }

    // Save encrypted credentials
    const existingCreds = (await crmRepo.getWorkspaceCredentials(workspaceId)) || {};
    const encryptedKey = encryptSecret(cleanKey);
    const pinHash = securityPin && /^\d{4}$/.test(securityPin) ? hashSecurityPin(securityPin) : existingCreds.msg91SecurityPinHash;

    const updatedCreds = {
      ...existingCreds,
      msg91AuthKey: encryptedKey,
      msg91SecurityPinHash: pinHash,
      msg91VerifiedAt: testResult.verifiedAt || new Date().toISOString(),
      msg91SenderId: senderId ? senderId.trim().toUpperCase() : existingCreds.msg91SenderId,
      msg91WhatsappNumber: whatsappNumber ? whatsappNumber.trim() : existingCreds.msg91WhatsappNumber,
      updatedAt: new Date().toISOString(),
      updatedBy: authContext.user.email,
    };

    await crmRepo.saveWorkspaceCredentials(workspaceId, updatedCreds);

    // Update communication settings status
    await crmRepo.saveCommunicationSettings(workspaceId, {
      whatsapp: {
        provider: 'msg91',
        isConfigured: true,
        status: 'connected',
        senderNumber: whatsappNumber || '',
      },
      sms: {
        provider: 'msg91',
        isConfigured: true,
        status: 'connected',
        senderId: senderId || '',
      },
    });

    return NextResponse.json({
      success: true,
      maskedKey: maskSecret(cleanKey),
      verifiedAt: updatedCreds.msg91VerifiedAt,
      balance: testResult.balance || 0,
      hasPin: Boolean(pinHash),
    });
  } catch (err: any) {
    console.error('[API MSG91 Connect Error]:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

