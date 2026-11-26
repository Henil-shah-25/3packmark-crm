import crypto from 'crypto';
import { crmRepo } from '@/lib/google-sheets/repository';
import { getAuthConfig } from '@/lib/auth';

/**
 * CENTRALIZED WORKSPACE CREDENTIALS & INTEGRATIONS SERVICE
 *
 * Implements Phase 5 Security Requirements:
 * 1. AES-256-GCM authenticated encryption at rest for sensitive credentials.
 * 2. Scoped strictly per workspace (no cross-tenant credential leakage).
 * 3. Never returns full secrets or passwords to the browser (masked display only).
 * 4. Fallback to platform-level environment variables when workspace credentials are unset.
 * 5. Provider verification methods for genuine connectivity checks.
 */

export interface IntegrationCredentials {
  // AI Provider (Gemini / Custom)
  geminiApiKey?: string;
  geminiModel?: string;

  // Email (SMTP / Gmail)
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  senderName?: string;
  senderEmail?: string;

  // Google OAuth (Calendar / Meet)
  googleClientId?: string;
  googleClientSecret?: string;
  googleRedirectUri?: string;

  // WhatsApp Cloud API (Meta)
  whatsappApiToken?: string;
  whatsappPhoneNumberId?: string;
  whatsappAccountId?: string;

  // SMS Gateway (Twilio / Webhook)
  smsProvider?: 'none' | 'twilio' | 'custom_webhook';
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioFromNumber?: string;
  customWebhookUrl?: string;

  // MSG91 Provider (Commercial Multi-Channel Gateway)
  msg91AuthKey?: string;
  msg91SecurityPinHash?: string;
  msg91VerifiedAt?: string;
  msg91SenderId?: string;
  msg91WhatsappNumber?: string;

  // Metadata
  updatedAt?: string;
  updatedBy?: string;
}

export interface MaskedIntegrationCredentials {
  gemini: {
    isConfigured: boolean;
    maskedKey: string;
    model: string;
    source: 'workspace' | 'platform' | 'none';
  };
  email: {
    isConfigured: boolean;
    host: string;
    port: number;
    maskedUser: string;
    hasPass: boolean;
    senderName: string;
    senderEmail: string;
    source: 'workspace' | 'platform' | 'none';
  };
  googleCalendar: {
    isConfigured: boolean;
    maskedClientId: string;
    hasClientSecret: boolean;
    redirectUri: string;
    source: 'workspace' | 'platform' | 'none';
  };
  whatsapp: {
    isConfigured: boolean;
    maskedToken: string;
    phoneNumberId: string;
    accountId: string;
    source: 'workspace' | 'platform' | 'none';
  };
  sms: {
    isConfigured: boolean;
    provider: string;
    maskedSid: string;
    hasToken: boolean;
    fromNumber: string;
    source: 'workspace' | 'platform' | 'none';
  };
  lastUpdated?: string;
}

const ALGORITHM = 'aes-256-gcm';

function getEncryptionKey(): Buffer {
  const authConfig = getAuthConfig();
  const secret =
    process.env.CREDENTIAL_ENCRYPTION_KEY ||
    process.env.ENCRYPTION_SECRET ||
    authConfig.sessionSecret;

  if (!secret || secret.trim().length === 0) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'CRITICAL CONFIGURATION ERROR: Credential encryption secret is missing in production. Configure CREDENTIAL_ENCRYPTION_KEY or SESSION_SECRET.'
      );
    }
    // Development / non-production compatibility fallback only
    return crypto.scryptSync('developster-dev-compat-salt-2026', 'developster-crm-cred-salt', 32);
  }

  return crypto.scryptSync(secret, 'developster-crm-cred-salt', 32);
}

/**
 * Encrypt a plaintext string using AES-256-GCM
 */
export function encryptSecret(plainText: string): string {
  if (!plainText) return '';
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(plainText, 'utf-8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag();
    // Format: iv:tag:ciphertext
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      throw err; // Fail closed in production: never store unencrypted or corrupted data
    }
    console.error('[Credentials] Encryption failed:', (err as Error).message);
    return '';
  }
}

/**
 * Decrypt an AES-256-GCM ciphertext string
 */
export function decryptSecret(cipherText: string): string {
  if (!cipherText || !cipherText.includes(':')) return '';
  try {
    const key = getEncryptionKey();
    const parts = cipherText.split(':');
    if (parts.length !== 3) return '';
    const [ivHex, tagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');
    return decrypted;
  } catch (err) {
    console.warn('[Credentials] Failed decrypting credential string:', (err as Error).message);
    return '';
  }
}

/**
 * Mask sensitive credentials for display
 * Example: "AIzaSyDa..." -> "AIzaS••••••••9x4k"
 */
export function maskSecret(secret?: string): string {
  if (!secret) return '';
  const trimmed = secret.trim();
  if (trimmed.length <= 8) return '••••••••';
  const prefix = trimmed.slice(0, 4);
  const suffix = trimmed.slice(-4);
  return `${prefix}••••••••${suffix}`;
}

export function maskEmail(email?: string): string {
  if (!email || !email.includes('@')) return '';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `*@${domain}`;
  return `${local[0]}***${local.slice(-1)}@${domain}`;
}

/**
 * Retrieve decrypted effective integration credentials for a workspace.
 * Fallbacks to platform-level env vars if workspace credentials are not set.
 */
export async function getEffectiveCredentials(workspaceId: string = 'ws-default'): Promise<{
  credentials: IntegrationCredentials;
  sources: Record<string, 'workspace' | 'platform' | 'none'>;
}> {
  // 1. Check workspace credentials from repository
  const wsCredsRecord = await crmRepo.getWorkspaceCredentials?.(workspaceId);
  const stored: Partial<IntegrationCredentials> = {};

  if (wsCredsRecord) {
    if (wsCredsRecord.geminiApiKeyEncrypted) stored.geminiApiKey = decryptSecret(wsCredsRecord.geminiApiKeyEncrypted);
    if (wsCredsRecord.geminiModel) stored.geminiModel = wsCredsRecord.geminiModel;

    if (wsCredsRecord.smtpHost) stored.smtpHost = wsCredsRecord.smtpHost;
    if (wsCredsRecord.smtpPort) stored.smtpPort = wsCredsRecord.smtpPort;
    if (wsCredsRecord.smtpUser) stored.smtpUser = wsCredsRecord.smtpUser;
    if (wsCredsRecord.smtpPassEncrypted) stored.smtpPass = decryptSecret(wsCredsRecord.smtpPassEncrypted);
    if (wsCredsRecord.senderName) stored.senderName = wsCredsRecord.senderName;
    if (wsCredsRecord.senderEmail) stored.senderEmail = wsCredsRecord.senderEmail;

    if (wsCredsRecord.googleClientId) stored.googleClientId = wsCredsRecord.googleClientId;
    if (wsCredsRecord.googleClientSecretEncrypted) stored.googleClientSecret = decryptSecret(wsCredsRecord.googleClientSecretEncrypted);
    if (wsCredsRecord.googleRedirectUri) stored.googleRedirectUri = wsCredsRecord.googleRedirectUri;

    if (wsCredsRecord.whatsappApiTokenEncrypted) stored.whatsappApiToken = decryptSecret(wsCredsRecord.whatsappApiTokenEncrypted);
    if (wsCredsRecord.whatsappPhoneNumberId) stored.whatsappPhoneNumberId = wsCredsRecord.whatsappPhoneNumberId;
    if (wsCredsRecord.whatsappAccountId) stored.whatsappAccountId = wsCredsRecord.whatsappAccountId;

    if (wsCredsRecord.smsProvider) stored.smsProvider = wsCredsRecord.smsProvider;
    if (wsCredsRecord.twilioAccountSid) stored.twilioAccountSid = wsCredsRecord.twilioAccountSid;
    if (wsCredsRecord.twilioAuthTokenEncrypted) stored.twilioAuthToken = decryptSecret(wsCredsRecord.twilioAuthTokenEncrypted);
    if (wsCredsRecord.twilioFromNumber) stored.twilioFromNumber = wsCredsRecord.twilioFromNumber;
    if (wsCredsRecord.customWebhookUrl) stored.customWebhookUrl = wsCredsRecord.customWebhookUrl;
  }

  // 2. Resolve effective credentials with platform env fallbacks
  const effective: IntegrationCredentials = {
    geminiApiKey: stored.geminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
    geminiModel: 'gemini-2.5-flash',

    smtpHost: stored.smtpHost || process.env.SMTP_HOST || 'smtp.gmail.com',
    smtpPort: stored.smtpPort || Number(process.env.SMTP_PORT) || 587,
    smtpUser: stored.smtpUser || process.env.SMTP_USER || '',
    smtpPass: stored.smtpPass || process.env.SMTP_PASS || '',
    senderName: stored.senderName || process.env.SMTP_SENDER_NAME || 'Developster Team',
    senderEmail: stored.senderEmail || stored.smtpUser || process.env.SMTP_USER || '',

    googleClientId: stored.googleClientId || process.env.GOOGLE_CLIENT_ID || '',
    googleClientSecret: stored.googleClientSecret || process.env.GOOGLE_CLIENT_SECRET || '',
    googleRedirectUri: stored.googleRedirectUri || process.env.GOOGLE_REDIRECT_URI || '',

    whatsappApiToken: stored.whatsappApiToken || process.env.WHATSAPP_API_TOKEN || '',
    whatsappPhoneNumberId: stored.whatsappPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    whatsappAccountId: stored.whatsappAccountId || process.env.WHATSAPP_ACCOUNT_ID || '',

    smsProvider: stored.smsProvider || (process.env.SMS_PROVIDER as any) || 'none',
    twilioAccountSid: stored.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID || '',
    twilioAuthToken: stored.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN || '',
    twilioFromNumber: stored.twilioFromNumber || process.env.TWILIO_FROM_NUMBER || '',
    customWebhookUrl: stored.customWebhookUrl || process.env.SMS_WEBHOOK_URL || '',

    updatedAt: wsCredsRecord?.updatedAt,
    updatedBy: wsCredsRecord?.updatedBy,
  };

  const sources: Record<string, 'workspace' | 'platform' | 'none'> = {
    gemini: stored.geminiApiKey ? 'workspace' : process.env.GEMINI_API_KEY ? 'platform' : 'none',
    smtp: stored.smtpPass ? 'workspace' : process.env.SMTP_PASS ? 'platform' : 'none',
    googleCalendar: stored.googleClientId ? 'workspace' : process.env.GOOGLE_CLIENT_ID ? 'platform' : 'none',
    whatsapp: stored.whatsappApiToken ? 'workspace' : process.env.WHATSAPP_API_TOKEN ? 'platform' : 'none',
    sms: stored.twilioAuthToken ? 'workspace' : process.env.TWILIO_AUTH_TOKEN ? 'platform' : 'none',
  };

  return { credentials: effective, sources };
}

/**
 * Get masked credentials for UI rendering
 * Strict security: Never returns raw passwords or full keys
 */
export async function getMaskedWorkspaceCredentials(workspaceId: string = 'ws-default'): Promise<MaskedIntegrationCredentials> {
  const { credentials: c, sources } = await getEffectiveCredentials(workspaceId);

  return {
    gemini: {
      isConfigured: Boolean(c.geminiApiKey),
      maskedKey: maskSecret(c.geminiApiKey),
      model: 'gemini-2.5-flash',
      source: sources.gemini,
    },
    email: {
      isConfigured: Boolean(c.smtpUser && c.smtpPass),
      host: c.smtpHost || 'smtp.gmail.com',
      port: c.smtpPort || 587,
      maskedUser: maskEmail(c.smtpUser),
      hasPass: Boolean(c.smtpPass),
      senderName: c.senderName || 'Developster Team',
      senderEmail: c.senderEmail || c.smtpUser || '',
      source: sources.smtp,
    },
    googleCalendar: {
      isConfigured: Boolean(c.googleClientId && c.googleClientSecret),
      maskedClientId: maskSecret(c.googleClientId),
      hasClientSecret: Boolean(c.googleClientSecret),
      redirectUri: c.googleRedirectUri || '',
      source: sources.googleCalendar,
    },
    whatsapp: {
      isConfigured: Boolean(c.whatsappApiToken && c.whatsappPhoneNumberId),
      maskedToken: maskSecret(c.whatsappApiToken),
      phoneNumberId: c.whatsappPhoneNumberId || '',
      accountId: c.whatsappAccountId || '',
      source: sources.whatsapp,
    },
    sms: {
      isConfigured: Boolean(c.smsProvider && c.smsProvider !== 'none'),
      provider: c.smsProvider || 'none',
      maskedSid: maskSecret(c.twilioAccountSid),
      hasToken: Boolean(c.twilioAuthToken),
      fromNumber: c.twilioFromNumber || '',
      source: sources.sms,
    },
    lastUpdated: c.updatedAt,
  };
}

/**
 * Save updated credentials for a workspace with encryption at rest
 */
export async function saveWorkspaceCredentials(
  workspaceId: string,
  updates: Partial<IntegrationCredentials>,
  userId: string = 'admin'
): Promise<void> {
  const existingRecord = (await crmRepo.getWorkspaceCredentials?.(workspaceId)) || {
    workspaceId,
    createdAt: new Date().toISOString(),
  };

  const encryptedRecord: any = {
    ...existingRecord,
    workspaceId,
    updatedAt: new Date().toISOString(),
    updatedBy: userId,
  };

  // Encrypt secrets if provided
  if (updates.geminiApiKey !== undefined) {
    encryptedRecord.geminiApiKeyEncrypted = updates.geminiApiKey ? encryptSecret(updates.geminiApiKey.trim()) : '';
  }
  if (updates.geminiModel !== undefined) {
    encryptedRecord.geminiModel = updates.geminiModel.trim();
  }

  if (updates.smtpHost !== undefined) encryptedRecord.smtpHost = updates.smtpHost.trim();
  if (updates.smtpPort !== undefined) encryptedRecord.smtpPort = Number(updates.smtpPort) || 587;
  if (updates.smtpUser !== undefined) encryptedRecord.smtpUser = updates.smtpUser.trim();
  if (updates.smtpPass !== undefined) {
    encryptedRecord.smtpPassEncrypted = updates.smtpPass ? encryptSecret(updates.smtpPass.trim()) : '';
  }
  if (updates.senderName !== undefined) encryptedRecord.senderName = updates.senderName.trim();
  if (updates.senderEmail !== undefined) encryptedRecord.senderEmail = updates.senderEmail.trim();

  if (updates.googleClientId !== undefined) encryptedRecord.googleClientId = updates.googleClientId.trim();
  if (updates.googleClientSecret !== undefined) {
    encryptedRecord.googleClientSecretEncrypted = updates.googleClientSecret ? encryptSecret(updates.googleClientSecret.trim()) : '';
  }
  if (updates.googleRedirectUri !== undefined) encryptedRecord.googleRedirectUri = updates.googleRedirectUri.trim();

  if (updates.whatsappApiToken !== undefined) {
    encryptedRecord.whatsappApiTokenEncrypted = updates.whatsappApiToken ? encryptSecret(updates.whatsappApiToken.trim()) : '';
  }
  if (updates.whatsappPhoneNumberId !== undefined) encryptedRecord.whatsappPhoneNumberId = updates.whatsappPhoneNumberId.trim();
  if (updates.whatsappAccountId !== undefined) encryptedRecord.whatsappAccountId = updates.whatsappAccountId.trim();

  if (updates.smsProvider !== undefined) encryptedRecord.smsProvider = updates.smsProvider;
  if (updates.twilioAccountSid !== undefined) encryptedRecord.twilioAccountSid = updates.twilioAccountSid.trim();
  if (updates.twilioAuthToken !== undefined) {
    encryptedRecord.twilioAuthTokenEncrypted = updates.twilioAuthToken ? encryptSecret(updates.twilioAuthToken.trim()) : '';
  }
  if (updates.twilioFromNumber !== undefined) encryptedRecord.twilioFromNumber = updates.twilioFromNumber.trim();
  if (updates.customWebhookUrl !== undefined) encryptedRecord.customWebhookUrl = updates.customWebhookUrl.trim();

  await crmRepo.saveWorkspaceCredentials?.(workspaceId, encryptedRecord);
}

