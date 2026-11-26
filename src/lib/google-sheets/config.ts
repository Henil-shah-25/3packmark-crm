import fs from 'fs';
import path from 'path';
import { encryptSecret, decryptSecret } from '@/lib/config/credentials';

export interface CredentialsConfig {
  spreadsheetId: string;
  spreadsheetName?: string;
  clientEmail: string;
  privateKey: string;
  clientId?: string;
  clientSecret?: string;
  apiKey?: string;
  apiEnabled: boolean;
}

export interface ConfigValidationResult {
  isValid: boolean;
  hasSpreadsheetId: boolean;
  hasClientEmail: boolean;
  hasPrivateKey: boolean;
  hasOAuthClientId: boolean;
  hasOAuthClientSecret: boolean;
  isApiEnabled: boolean;
  spreadsheetIdMasked: string;
  clientEmailMasked: string;
  spreadsheetName: string;
  errors: string[];
}

export function getRuntimeConfigPath(): string {
  return path.join(process.cwd(), 'data', 'google-credentials.json');
}

/**
 * Programmatically extract the clean spreadsheet ID from full URLs, path segments, or raw IDs.
 * Examples handled:
 * - https://docs.google.com/spreadsheets/d/1UuIfp2bvNRighzwD4hyl7bezNEU58_bE40KmRr_u69w/edit#gid=0
 * - /spreadsheets/d/1UuIfp2bvNRighzwD4hyl7bezNEU58_bE40KmRr_u69w
 * - d/1UuIfp2bvNRighzwD4hyl7bezNEU58_bE40KmRr_u69w
 * - 1UuIfp2bvNRighzwD4hyl7bezNEU58_bE40KmRr_u69w
 */
export function extractSpreadsheetId(input?: string | null): string {
  if (!input) return '';
  let cleaned = input.trim();
  // Strip surrounding quotes
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  // Full or partial URL match: /spreadsheets/d/<id>
  const urlMatch = cleaned.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch && urlMatch[1]) return urlMatch[1];

  // Shorthand: d/<id>
  const shortMatch = cleaned.match(/^d\/([a-zA-Z0-9-_]+)/);
  if (shortMatch && shortMatch[1]) return shortMatch[1];

  // Regex for standard 40+ char Google Spreadsheet ID
  const directMatch = cleaned.match(/^([a-zA-Z0-9-_]{20,})$/);
  if (directMatch && directMatch[1]) return directMatch[1];

  // Fallback: extract longest alphanumeric sequence with dashes/underscores
  const fallback = cleaned.match(/[a-zA-Z0-9-_]{25,}/);
  if (fallback && fallback[0]) return fallback[0];

  return cleaned;
}

/**
 * Normalize private keys: unescape escaped newline characters (\n -> actual newline),
 * remove accidental wrapping quotes, and preserve key content.
 */
export function normalizePrivateKey(rawKey?: string | null): string {
  if (!rawKey) return '';
  let cleaned = rawKey.trim();

  // Strip enclosing quotes (both single and double, multiple times if nested)
  while (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'")) ||
    (cleaned.startsWith('`') && cleaned.endsWith('`'))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  // Handle double-escaped newlines: '\\n' -> '\n'
  cleaned = cleaned.replace(/\\n/g, '\n');
  // Normalize Windows CRLF: '\r\n' -> '\n'
  cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Ensure trailing newline
  if (!cleaned.endsWith('\n')) {
    cleaned += '\n';
  }

  return cleaned;
}

/**
 * Mask sensitive string values for safe logging/display without revealing secrets
 */
function maskSecret(val?: string | null): string {
  if (!val) return '(not configured)';
  if (val.length <= 8) return '****';
  return `${val.substring(0, 4)}...${val.substring(val.length - 4)}`;
}

/**
 * Retrieve active Google Sheets credentials, checking runtime override first, then environment variables.
 */
export function getGoogleSheetsConfig(): CredentialsConfig | null {
  // Check API enabled flag (defaults to true unless explicitly 'false')
  const apiEnabled = process.env.GOOGLE_SHEETS_API_ENABLED !== 'false';
  if (!apiEnabled) {
    return null;
  }

  // 1. Check runtime override file (allows configuration via CRM UI)
  try {
    const runtimePath = getRuntimeConfigPath();
    if (fs.existsSync(runtimePath)) {
      const raw = fs.readFileSync(runtimePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed.spreadsheetId && parsed.clientEmail && parsed.privateKey) {
        let resolvedKey = parsed.privateKey;
        // If stored key is AES-256-GCM encrypted, decrypt it safely
        if (parsed.isEncrypted || (typeof parsed.privateKey === 'string' && parsed.privateKey.split(':').length === 3 && !parsed.privateKey.includes('-----BEGIN'))) {
          try {
            const decrypted = decryptSecret(parsed.privateKey);
            if (decrypted) {
              resolvedKey = decrypted;
            }
          } catch {
            // Keep resolvedKey as is if decryption fails
          }
        }

        return {
          spreadsheetId: extractSpreadsheetId(parsed.spreadsheetId),
          spreadsheetName: parsed.spreadsheetName || process.env.GOOGLE_SHEETS_SPREADSHEET_NAME || 'RAPPORT-CRM-BACKEND',
          clientEmail: parsed.clientEmail.trim(),
          privateKey: normalizePrivateKey(resolvedKey),
          clientId: parsed.clientId || process.env.GOOGLE_CLIENT_ID,
          clientSecret: parsed.clientSecret || process.env.GOOGLE_CLIENT_SECRET,
          apiKey: parsed.apiKey || process.env.GOOGLE_API_KEY,
          apiEnabled: true,
        };
      }
    }
  } catch (err) {
    console.error('[GoogleSheetsConfig] Error reading runtime credentials:', err);
  }

  // 2. Check environment variables (supporting standard names and common Vercel/cloud aliases)
  const rawSpreadsheetId =
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID ||
    process.env.SPREADSHEET_ID ||
    process.env.GOOGLE_SPREADSHEET_ID ||
    process.env.GOOGLE_SHEET_ID;

  const clientEmail =
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
    process.env.GOOGLE_CLIENT_EMAIL ||
    process.env.GOOGLE_SHEETS_CLIENT_EMAIL ||
    process.env.SERVICE_ACCOUNT_EMAIL;

  const rawPrivateKey =
    process.env.GOOGLE_PRIVATE_KEY ||
    process.env.GOOGLE_SHEETS_PRIVATE_KEY ||
    process.env.PRIVATE_KEY;

  if (rawSpreadsheetId && clientEmail && rawPrivateKey) {
    return {
      spreadsheetId: extractSpreadsheetId(rawSpreadsheetId),
      spreadsheetName: process.env.GOOGLE_SHEETS_SPREADSHEET_NAME || 'RAPPORT-CRM-BACKEND',
      clientEmail: clientEmail.trim(),
      privateKey: normalizePrivateKey(rawPrivateKey),
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      apiKey: process.env.GOOGLE_API_KEY,
      apiEnabled: true,
    };
  }

  return null;
}

/**
 * Validate configuration without revealing secret values in logs or responses.
 */
export function validateGoogleSheetsConfig(): ConfigValidationResult {
  const config = getGoogleSheetsConfig();
  const errors: string[] = [];

  const rawSpreadsheetId =
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID ||
    process.env.SPREADSHEET_ID ||
    process.env.GOOGLE_SPREADSHEET_ID ||
    process.env.GOOGLE_SHEET_ID;

  const clientEmail =
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
    process.env.GOOGLE_CLIENT_EMAIL ||
    process.env.GOOGLE_SHEETS_CLIENT_EMAIL ||
    process.env.SERVICE_ACCOUNT_EMAIL;

  const rawPrivateKey =
    process.env.GOOGLE_PRIVATE_KEY ||
    process.env.GOOGLE_SHEETS_PRIVATE_KEY ||
    process.env.PRIVATE_KEY;

  const apiEnabled = process.env.GOOGLE_SHEETS_API_ENABLED !== 'false';

  const hasSpreadsheetId = Boolean(rawSpreadsheetId);
  const hasClientEmail = Boolean(clientEmail);
  const hasPrivateKey = Boolean(rawPrivateKey);
  const hasOAuthClientId = Boolean(process.env.GOOGLE_CLIENT_ID);
  const hasOAuthClientSecret = Boolean(process.env.GOOGLE_CLIENT_SECRET);

  if (!hasSpreadsheetId) errors.push('GOOGLE_SHEETS_SPREADSHEET_ID (or SPREADSHEET_ID) is missing.');
  if (!hasClientEmail) errors.push('GOOGLE_SERVICE_ACCOUNT_EMAIL (or GOOGLE_CLIENT_EMAIL) is missing.');
  if (!hasPrivateKey) errors.push('GOOGLE_PRIVATE_KEY is missing.');
  if (!apiEnabled) errors.push('GOOGLE_SHEETS_API_ENABLED is set to false.');

  if (config) {
    if (!config.spreadsheetId || config.spreadsheetId.length < 20) {
      errors.push('Spreadsheet ID format appears invalid (expected 20+ alphanumeric characters).');
    }
    if (!config.clientEmail.includes('@') || !config.clientEmail.includes('.iam.gserviceaccount.com')) {
      errors.push('Client email does not appear to be a standard GCP service account email.');
    }
    if (!config.privateKey.includes('BEGIN PRIVATE KEY') || !config.privateKey.includes('END PRIVATE KEY')) {
      errors.push('Private key missing PEM header or footer.');
    }
  }

  return {
    isValid: errors.length === 0 && config !== null,
    hasSpreadsheetId,
    hasClientEmail,
    hasPrivateKey,
    hasOAuthClientId,
    hasOAuthClientSecret,
    isApiEnabled: apiEnabled,
    spreadsheetIdMasked: maskSecret(config?.spreadsheetId),
    clientEmailMasked: config ? `${config.clientEmail.split('@')[0].slice(0, 4)}***@${config.clientEmail.split('@')[1] || ''}` : '(not configured)',
    spreadsheetName: config?.spreadsheetName || process.env.GOOGLE_SHEETS_SPREADSHEET_NAME || 'RAPPORT-CRM-BACKEND',
    errors,
  };
}

/**
 * Save credentials to runtime override (if configured via UI)
 * Automatically encrypts the private key using AES-256-GCM authenticated encryption at rest.
 */
export function saveRuntimeCredentials(config: {
  spreadsheetId: string;
  clientEmail: string;
  privateKey: string;
  spreadsheetName?: string;
}): void {
  const runtimePath = getRuntimeConfigPath();
  const dir = path.dirname(runtimePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const normalizedKey = normalizePrivateKey(config.privateKey);
  let storedKey = normalizedKey;
  let isEncrypted = false;

  try {
    const encrypted = encryptSecret(normalizedKey);
    if (encrypted) {
      storedKey = encrypted;
      isEncrypted = true;
    }
  } catch (err) {
    console.warn('[GoogleSheetsConfig] Could not encrypt private key at rest, saving normalized format:', err);
  }

  const payload = {
    spreadsheetId: extractSpreadsheetId(config.spreadsheetId),
    clientEmail: config.clientEmail.trim(),
    privateKey: storedKey,
    isEncrypted,
    spreadsheetName: config.spreadsheetName || 'RAPPORT-CRM-BACKEND',
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(runtimePath, JSON.stringify(payload, null, 2), 'utf-8');
}

/**
 * Check if Google Sheets credentials exist and are syntactically valid
 */
export function isGoogleSheetsConfigured(): boolean {
  return getGoogleSheetsConfig() !== null;
}
