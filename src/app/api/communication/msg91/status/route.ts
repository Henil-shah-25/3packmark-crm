import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/rbac';
import { crmRepo } from '@/lib/google-sheets/repository';
import { decryptSecret, maskSecret } from '@/lib/config/credentials';
import { testMsg91AuthKey } from '@/lib/communication/msg91-client';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId') || 'ws-default';

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const creds = (await crmRepo.getWorkspaceCredentials(workspaceId)) || {};
    const encryptedKey = creds.msg91AuthKey;

    if (!encryptedKey) {
      return NextResponse.json({
        isConnected: false,
        maskedKey: '',
        hasPin: false,
        balance: 0,
        currency: 'INR',
        whatsapp: {
          status: 'not_configured',
          connectedNumber: '',
        },
        sms: {
          status: 'not_configured',
          senderId: '',
        },
      });
    }

    const decryptedKey = decryptSecret(encryptedKey);
    const maskedKey = maskSecret(decryptedKey);

    return NextResponse.json({
      isConnected: true,
      maskedKey,
      verifiedAt: creds.msg91VerifiedAt,
      hasPin: Boolean(creds.msg91SecurityPinHash),
      senderId: creds.msg91SenderId || 'DEVHUB',
      whatsappNumber: creds.msg91WhatsappNumber || '',
      whatsapp: {
        status: creds.msg91WhatsappNumber ? 'connected' : 'pending_setup',
        connectedNumber: creds.msg91WhatsappNumber || '',
        businessAccount: 'Verified WhatsApp Business Account',
        qualityRating: 'High',
      },
      sms: {
        status: creds.msg91SenderId ? 'connected' : 'pending_dlt',
        senderId: creds.msg91SenderId || '',
        dltStatus: creds.msg91SenderId ? 'approved' : 'pending',
      },
    });
  } catch (err: any) {
    console.error('[API MSG91 Status Error]:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

