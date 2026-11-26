import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/rbac';
import {
  getMaskedWorkspaceCredentials,
  saveWorkspaceCredentials,
  IntegrationCredentials,
} from '@/lib/config/credentials';

/**
 * GET /api/integrations/config
 * Returns masked/sanitized configuration state for Integrations & API Settings.
 * Strictly requires authentication and never leaks raw secrets, passwords, or full API keys.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId') || 'ws-default';

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const maskedConfig = await getMaskedWorkspaceCredentials(workspaceId);

    return NextResponse.json(maskedConfig);
  } catch (err: any) {
    console.error('[API integrations/config GET] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/integrations/config
 * Securely saves workspace-level encrypted credentials.
 * Scoped strictly to the target workspace without cross-tenant leakage.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { target, workspaceId = 'ws-default', ...fields } = body;

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    if (!authContext.permissions.canEditWorkspaceSettings && !authContext.isMasterAdmin) {
      return NextResponse.json({ error: 'Permission denied: Settings management permission required' }, { status: 403 });
    }

    const updates: Partial<IntegrationCredentials> = {};

    if (target === 'gemini') {
      if (fields.geminiApiKey !== undefined) updates.geminiApiKey = fields.geminiApiKey;
      if (fields.geminiModel !== undefined) updates.geminiModel = fields.geminiModel;
    } else if (target === 'email' || target === 'smtp') {
      if (fields.smtpHost !== undefined) updates.smtpHost = fields.smtpHost;
      if (fields.smtpPort !== undefined) updates.smtpPort = Number(fields.smtpPort);
      if (fields.smtpUser !== undefined) updates.smtpUser = fields.smtpUser;
      if (fields.smtpPass !== undefined) updates.smtpPass = fields.smtpPass;
      if (fields.senderName !== undefined) updates.senderName = fields.senderName;
      if (fields.senderEmail !== undefined) updates.senderEmail = fields.senderEmail;
    } else if (target === 'google_calendar') {
      if (fields.clientId !== undefined) updates.googleClientId = fields.clientId;
      if (fields.clientSecret !== undefined) updates.googleClientSecret = fields.clientSecret;
      if (fields.redirectUri !== undefined) updates.googleRedirectUri = fields.redirectUri;
    } else if (target === 'whatsapp') {
      if (fields.whatsappApiToken !== undefined) updates.whatsappApiToken = fields.whatsappApiToken;
      if (fields.whatsappPhoneNumberId !== undefined) updates.whatsappPhoneNumberId = fields.whatsappPhoneNumberId;
      if (fields.whatsappAccountId !== undefined) updates.whatsappAccountId = fields.whatsappAccountId;
    } else if (target === 'sms') {
      if (fields.smsProvider !== undefined) updates.smsProvider = fields.smsProvider;
      if (fields.twilioAccountSid !== undefined) updates.twilioAccountSid = fields.twilioAccountSid;
      if (fields.twilioAuthToken !== undefined) updates.twilioAuthToken = fields.twilioAuthToken;
      if (fields.twilioFromNumber !== undefined) updates.twilioFromNumber = fields.twilioFromNumber;
    } else {
      return NextResponse.json({ error: `Unsupported integration target: "${target}"` }, { status: 400 });
    }

    await saveWorkspaceCredentials(workspaceId, updates, authContext.user.id);

    const refreshed = await getMaskedWorkspaceCredentials(workspaceId);

    return NextResponse.json({
      success: true,
      message: `${target.toUpperCase()} credentials saved and encrypted at rest.`,
      config: refreshed,
    });
  } catch (err: any) {
    console.error('[API integrations/config POST] Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to update credentials' }, { status: 500 });
  }
}
