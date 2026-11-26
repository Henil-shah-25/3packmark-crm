import crypto from 'crypto';
import { google } from 'googleapis';
import { crmRepo } from '@/lib/google-sheets/repository';
import { OAuthTokenRecord, CalendarEvent } from '@/types/crm';
import { resolveOAuthRedirectUri } from '@/lib/app-url';
import { getAuthConfig } from '@/lib/auth';

/**
 * GOOGLE CALENDAR & GOOGLE MEET SERVICE
 * Uses official Google APIs Node.js client (googleapis v3).
 * Authorizes via OAuth 2.0 authorization code flow.
 * Creates real Google Calendar events and Google Meet conference video links.
 */

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

export function getCalendarOAuthConfig(req?: Request) {
  const clientId = (process.env.GOOGLE_CLIENT_ID || '').replace(/^["']|["']$/g, '').trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').replace(/^["']|["']$/g, '').trim();
  const redirectUri = resolveOAuthRedirectUri(req);

  return {
    clientId,
    clientSecret,
    redirectUri,
    isConfigured: Boolean(clientId && clientSecret),
  };
}

export function maskClientId(clientId: string): string {
  if (!clientId) return '';
  if (clientId.length <= 15) return 'Configured';
  return `${clientId.slice(0, 12)}...${clientId.slice(-16)}`;
}

export function createOAuth2Client(customRedirectUri?: string, req?: Request) {
  const config = getCalendarOAuthConfig(req);
  if (!config.isConfigured) {
    throw new Error('Google OAuth credentials not configured. Please check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.');
  }

  const redirectUri = customRedirectUri || config.redirectUri;

  return new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    redirectUri
  );
}

/**
 * Creates a cryptographically signed HMAC state parameter for OAuth CSRF protection.
 * Format: <payload_base64url>.<signature_base64url>
 */
export function createOAuthState(workspaceId: string, redirectUri: string): string {
  const { sessionSecret } = getAuthConfig();
  const secret = sessionSecret || process.env.ENCRYPTION_SECRET || 'developster-oauth-state-secret';
  const payload = {
    workspaceId: workspaceId || 'ws-default',
    redirectUri,
    timestamp: Date.now(),
    nonce: crypto.randomBytes(16).toString('hex'),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${signature}`;
}

/**
 * Validates the OAuth state signature, expiry (15 mins), and redirect URI destination.
 */
export function verifyOAuthState(
  state: string | undefined | null,
  req?: Request
): {
  valid: boolean;
  workspaceId: string;
  redirectUri: string;
  error?: string;
} {
  if (!state || typeof state !== 'string') {
    return { valid: false, workspaceId: 'ws-default', redirectUri: '', error: 'Missing state parameter' };
  }

  const parts = state.split('.');
  if (parts.length !== 2) {
    return { valid: false, workspaceId: 'ws-default', redirectUri: '', error: 'Malformed state parameter format' };
  }

  const [payloadB64, signature] = parts;
  const { sessionSecret } = getAuthConfig();
  const secret = sessionSecret || process.env.ENCRYPTION_SECRET || 'developster-oauth-state-secret';

  const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  const actualBuf = Buffer.from(signature, 'utf8');

  if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
    return { valid: false, workspaceId: 'ws-default', redirectUri: '', error: 'OAuth state signature verification failed' };
  }

  let payload: any;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, workspaceId: 'ws-default', redirectUri: '', error: 'Corrupt state payload' };
  }

  // 15-minute expiration
  const fifteenMinutes = 15 * 60 * 1000;
  if (!payload.timestamp || Date.now() - payload.timestamp > fifteenMinutes) {
    return { valid: false, workspaceId: payload.workspaceId || 'ws-default', redirectUri: '', error: 'OAuth state expired' };
  }

  // Strict redirect URI path validation
  const redirectUri = payload.redirectUri || '';
  if (redirectUri) {
    try {
      const parsed = new URL(redirectUri);
      const allowedPaths = ['/api/calendar/callback', '/api/auth/google/callback'];
      if (!allowedPaths.includes(parsed.pathname)) {
        return { valid: false, workspaceId: payload.workspaceId, redirectUri: '', error: 'Unauthorized redirect URI path in OAuth state' };
      }
    } catch {
      return { valid: false, workspaceId: payload.workspaceId, redirectUri: '', error: 'Malformed redirect URI in OAuth state' };
    }
  }

  return {
    valid: true,
    workspaceId: payload.workspaceId || 'ws-default',
    redirectUri,
  };
}

/**
 * Generates the Google OAuth 2.0 consent URL.
 * Passes the environment-aware redirect URI to Google and includes a signed state
 * so token exchange uses the exact matching callback URI and prevents CSRF.
 */
export function generateAuthUrl(workspaceId: string, req?: Request): string {
  const redirectUri = resolveOAuthRedirectUri(req);
  const oauth2Client = createOAuth2Client(redirectUri, req);
  const state = createOAuthState(workspaceId, redirectUri);

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // Force consent so refresh_token is returned
    scope: SCOPES,
    state,
    redirect_uri: redirectUri,
  });
}

/**
 * Handles the OAuth2 code exchange callback.
 * Decodes and cryptographically verifies state to prevent CSRF and redirect spoofing.
 */
export async function handleOAuthCallback(
  code: string,
  state: string,
  req?: Request
): Promise<{
  workspaceId: string;
  userEmail?: string;
  tokens: any;
}> {
  const verification = verifyOAuthState(state, req);
  if (!verification.valid) {
    throw new Error(`Google OAuth state validation failed: ${verification.error}`);
  }

  const workspaceId = verification.workspaceId;
  const redirectUri = verification.redirectUri || resolveOAuthRedirectUri(req);
  const oauth2Client = createOAuth2Client(redirectUri, req);

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  // Retrieve user email
  let userEmail = '';
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    userEmail = userInfo.data.email || '';
  } catch (err) {
    console.warn('[Calendar OAuth] Could not fetch user profile email:', err);
  }

  const tokenRecord: OAuthTokenRecord = {
    workspaceId,
    provider: 'google_calendar',
    accessToken: tokens.access_token || '',
    refreshToken: tokens.refresh_token || undefined,
    expiryDate: tokens.expiry_date || Date.now() + 3600 * 1000,
    scope: tokens.scope || SCOPES.join(' '),
    userEmail,
    updatedAt: new Date().toISOString(),
  };

  await crmRepo.saveOAuthTokens(tokenRecord);

  return { workspaceId, userEmail, tokens };
}

/**
 * Retrieves an authorized OAuth2 client with auto-refreshing capability.
 */
export async function getAuthorizedClient(workspaceId: string) {
  const tokenRecord = await crmRepo.getOAuthTokens(workspaceId, 'google_calendar');
  if (!tokenRecord || !tokenRecord.accessToken) {
    return null;
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: tokenRecord.accessToken,
    refresh_token: tokenRecord.refreshToken,
    expiry_date: tokenRecord.expiryDate,
  });

  // Check if token expired or about to expire in next 2 minutes
  if (tokenRecord.refreshToken && tokenRecord.expiryDate <= Date.now() + 120 * 1000) {
    try {
      const refreshed = await oauth2Client.refreshAccessToken();
      const updatedTokens = refreshed.credentials;

      await crmRepo.saveOAuthTokens({
        ...tokenRecord,
        accessToken: updatedTokens.access_token || tokenRecord.accessToken,
        refreshToken: updatedTokens.refresh_token || tokenRecord.refreshToken,
        expiryDate: updatedTokens.expiry_date || Date.now() + 3600 * 1000,
        updatedAt: new Date().toISOString(),
      });
      oauth2Client.setCredentials(updatedTokens);
    } catch (err: any) {
      console.error('[Calendar OAuth] Token refresh failed:', err.message);
      return null;
    }
  }

  return oauth2Client;
}

/**
 * Checks connection status for the workspace.
 */
export async function getCalendarConnectionStatus(workspaceId: string): Promise<{
  state: 'not_configured' | 'auth_required' | 'connected' | 'error';
  isConnected: boolean;
  isConfigured: boolean;
  userEmail?: string;
  hasRefreshToken: boolean;
  expiryDate?: string;
  redirectUri: string;
  clientIdMasked: string;
  hasClientSecret: boolean;
  message: string;
  error?: string;
}> {
  const config = getCalendarOAuthConfig();
  const clientIdMasked = maskClientId(config.clientId);

  if (!config.isConfigured) {
    return {
      state: 'not_configured',
      isConnected: false,
      isConfigured: false,
      hasRefreshToken: false,
      redirectUri: config.redirectUri,
      clientIdMasked,
      hasClientSecret: Boolean(config.clientSecret),
      message: 'Google OAuth Client ID & Secret are not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
      error: 'Google OAuth Client ID & Secret are not configured in environment variables.',
    };
  }

  const tokenRecord = await crmRepo.getOAuthTokens(workspaceId, 'google_calendar');
  if (!tokenRecord || !tokenRecord.accessToken) {
    return {
      state: 'auth_required',
      isConnected: false,
      isConfigured: true,
      hasRefreshToken: false,
      redirectUri: config.redirectUri,
      clientIdMasked,
      hasClientSecret: Boolean(config.clientSecret),
      message: 'OAuth credentials configured. Account authorization required to sync calendar.',
    };
  }

  return {
    state: 'connected',
    isConnected: true,
    isConfigured: true,
    userEmail: tokenRecord.userEmail,
    hasRefreshToken: Boolean(tokenRecord.refreshToken),
    expiryDate: new Date(tokenRecord.expiryDate).toISOString(),
    redirectUri: config.redirectUri,
    clientIdMasked,
    hasClientSecret: Boolean(config.clientSecret),
    message: `Connected to Google Calendar as ${tokenRecord.userEmail || 'Authorized User'}.`,
  };
}

/**
 * Tests live connection to Google Calendar API when an account is authorized.
 */
export async function testCalendarConnection(workspaceId: string): Promise<{
  success: boolean;
  message: string;
  userEmail?: string;
}> {
  const status = await getCalendarConnectionStatus(workspaceId);
  if (!status.isConfigured) {
    return {
      success: false,
      message: 'Google OAuth is not configured in environment variables.',
    };
  }

  if (!status.isConnected) {
    return {
      success: false,
      message: 'Google Calendar account is not connected yet. Click "Connect Google Account" to authorize.',
    };
  }

  try {
    const auth = await getAuthorizedClient(workspaceId);
    if (!auth) {
      return {
        success: false,
        message: 'Could not obtain active authorization tokens. Please reconnect your Google account.',
      };
    }

    const calendar = google.calendar({ version: 'v3', auth });
    const res = await calendar.calendarList.get({ calendarId: 'primary' });

    return {
      success: true,
      message: `Google Calendar API verified! Primary calendar "${res.data.summary || 'Primary'}" is accessible.`,
      userEmail: status.userEmail,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Calendar API test failed: ${err.message || 'Token may have been revoked. Please reconnect.'}`,
      userEmail: status.userEmail,
    };
  }
}

/**
 * Creates a real Google Calendar Event with Google Meet conference generation.
 */
export async function createGoogleCalendarEvent(params: {
  workspaceId: string;
  title: string;
  description?: string;
  startIso: string;
  endIso: string;
  timezone?: string;
  attendees: string[];
  enableMeet?: boolean;
}): Promise<{
  success: boolean;
  googleEventId?: string;
  calendarEventUrl?: string;
  meetUrl?: string;
  conferenceStatus?: 'confirmed' | 'pending' | 'failed' | 'disabled';
  error?: string;
}> {
  const authClient = await getAuthorizedClient(params.workspaceId);
  if (!authClient) {
    return {
      success: false,
      error: 'Google Calendar not connected. Please authorize Google Calendar in Settings → Integrations.',
    };
  }

  const calendar = google.calendar({ version: 'v3', auth: authClient });

  const eventRequestBody: any = {
    summary: params.title,
    description: params.description,
    start: {
      dateTime: params.startIso,
      timeZone: params.timezone || 'UTC',
    },
    end: {
      dateTime: params.endIso,
      timeZone: params.timezone || 'UTC',
    },
    attendees: params.attendees.map((email) => ({ email })),
  };

  // Google Meet conference request
  if (params.enableMeet !== false) {
    eventRequestBody.conferenceData = {
      createRequest: {
        requestId: `meet-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        conferenceSolutionKey: {
          type: 'hangoutsMeet',
        },
      },
    };
  }

  try {
    const res = await calendar.events.insert({
      calendarId: 'primary',
      conferenceDataVersion: params.enableMeet !== false ? 1 : 0,
      sendUpdates: params.attendees.length > 0 ? 'all' : 'none',
      requestBody: eventRequestBody,
    });

    const data = res.data;
    const googleEventId = data.id || undefined;
    const calendarEventUrl = data.htmlLink || undefined;

    // Extract real Google Meet URL
    let meetUrl: string | undefined = undefined;
    let conferenceStatus: 'confirmed' | 'pending' | 'failed' | 'disabled' = 'disabled';

    if (params.enableMeet !== false) {
      const entryPoints = data.conferenceData?.entryPoints || [];
      const videoEntry = entryPoints.find((ep) => ep.entryPointType === 'video');
      if (videoEntry && videoEntry.uri) {
        meetUrl = videoEntry.uri;
        conferenceStatus = 'confirmed';
      } else if (data.conferenceData?.createRequest?.status?.statusCode === 'pending') {
        conferenceStatus = 'pending';
      } else {
        conferenceStatus = 'failed';
      }
    }

    return {
      success: true,
      googleEventId,
      calendarEventUrl,
      meetUrl,
      conferenceStatus,
    };
  } catch (err: any) {
    console.error('[Google Calendar API Error]:', err.message);
    return {
      success: false,
      error: err.message || 'Failed to create Google Calendar event.',
    };
  }
}

/**
 * Updates an existing Google Calendar event.
 */
export async function updateGoogleCalendarEvent(params: {
  workspaceId: string;
  googleEventId: string;
  title?: string;
  description?: string;
  startIso?: string;
  endIso?: string;
  attendees?: string[];
}): Promise<{
  success: boolean;
  error?: string;
}> {
  const authClient = await getAuthorizedClient(params.workspaceId);
  if (!authClient) {
    return { success: false, error: 'Google Calendar not connected.' };
  }

  const calendar = google.calendar({ version: 'v3', auth: authClient });

  const patchBody: any = {};
  if (params.title) patchBody.summary = params.title;
  if (params.description !== undefined) patchBody.description = params.description;
  if (params.startIso) patchBody.start = { dateTime: params.startIso };
  if (params.endIso) patchBody.end = { dateTime: params.endIso };
  if (params.attendees) patchBody.attendees = params.attendees.map((email) => ({ email }));

  try {
    await calendar.events.patch({
      calendarId: 'primary',
      eventId: params.googleEventId,
      sendUpdates: 'all',
      requestBody: patchBody,
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Deletes / cancels an event on Google Calendar.
 */
export async function deleteGoogleCalendarEvent(
  workspaceId: string,
  googleEventId: string
): Promise<{ success: boolean; error?: string }> {
  const authClient = await getAuthorizedClient(workspaceId);
  if (!authClient) {
    return { success: false, error: 'Google Calendar not connected.' };
  }

  const calendar = google.calendar({ version: 'v3', auth: authClient });
  try {
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: googleEventId,
      sendUpdates: 'all',
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Syncs Google Calendar events within a date range.
 */
export async function syncGoogleCalendarEvents(
  workspaceId: string,
  timeMin?: string,
  timeMax?: string
): Promise<{
  success: boolean;
  importedCount: number;
  error?: string;
}> {
  const authClient = await getAuthorizedClient(workspaceId);
  if (!authClient) {
    return { success: false, importedCount: 0, error: 'Google Calendar not connected.' };
  }

  const calendar = google.calendar({ version: 'v3', auth: authClient });
  const minDate = timeMin || new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const maxDate = timeMax || new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString();

  try {
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: minDate,
      timeMax: maxDate,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 100,
    });

    const googleEvents = res.data.items || [];
    const existingCrmEvents = await crmRepo.getCalendarEvents(workspaceId);
    let imported = 0;

    for (const gEvent of googleEvents) {
      if (!gEvent.id || gEvent.status === 'cancelled') continue;

      const start = gEvent.start?.dateTime || gEvent.start?.date;
      const end = gEvent.end?.dateTime || gEvent.end?.date;
      if (!start || !end) continue;

      const videoEntry = (gEvent.conferenceData?.entryPoints || []).find((ep) => ep.entryPointType === 'video');
      const meetUrl = videoEntry?.uri;

      // Check if already in CRM
      const existing = existingCrmEvents.find((e) => e.googleEventId === gEvent.id);
      if (existing) {
        // Update
        await crmRepo.updateCalendarEvent(workspaceId, existing.id, {
          title: gEvent.summary || existing.title,
          description: gEvent.description || existing.description,
          startIso: new Date(start).toISOString(),
          endIso: new Date(end).toISOString(),
          meetUrl: meetUrl || existing.meetUrl,
          calendarEventUrl: gEvent.htmlLink || existing.calendarEventUrl,
          lastSyncAt: new Date().toISOString(),
          synced: true,
        });
      } else {
        // Create as external calendar event
        await crmRepo.createCalendarEvent(workspaceId, {
          title: gEvent.summary || 'Scheduled Meeting',
          description: gEvent.description || 'Imported from Google Calendar',
          startIso: new Date(start).toISOString(),
          endIso: new Date(end).toISOString(),
          attendees: (gEvent.attendees || []).map((a) => a.email || '').filter(Boolean),
          meetUrl: meetUrl || undefined,
          googleEventId: gEvent.id || undefined,
          calendarEventUrl: gEvent.htmlLink || undefined,
          conferenceStatus: meetUrl ? 'confirmed' : 'disabled',
          status: 'scheduled',
          synced: true,
          lastSyncAt: new Date().toISOString(),
        });
        imported++;
      }
    }

    return { success: true, importedCount: imported };
  } catch (err: any) {
    return { success: false, importedCount: 0, error: err.message };
  }
}
