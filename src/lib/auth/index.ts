import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { sessionRevocationStore } from '../database/session-store';
import {
  isSharedRedisConfigured,
  recordDistributedRevocation,
  isDistributedSessionRevoked,
  checkSharedLockoutState,
  setSharedLockoutState,
  resetSharedLockoutState,
} from './shared-store';

export interface SessionPayload {
  email: string;
  jti?: string; // Unique session token identifier
  exp: number; // Unix timestamp ms
  iat: number; // Unix timestamp ms
}

export interface LockoutRecord {
  attempts: number;
  lastAttempt: number;
  lockedUntil: number | null;
}

export interface LockoutStore {
  [key: string]: LockoutRecord;
}

const LOCKOUT_FILE = process.env.VERCEL
  ? path.join('/tmp', 'auth-lockout.json')
  : path.join(process.cwd(), 'data', 'auth-lockout.json');

const memoryLockoutStore: LockoutStore = {};

export function stripOuterQuotes(val: string | undefined | null): string {
  if (!val) return '';
  let s = val;
  // If wrapped in single or double quotes, strip only the enclosing outer quotes
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    s = s.slice(1, -1);
  }
  // Strip trailing line terminators if any, but do NOT trim internal or leading/trailing whitespace
  return s.replace(/\r?\n$/, '');
}

export function stripQuotes(val: string | undefined | null): string {
  return stripOuterQuotes(val).trim();
}

// Read environment configs with safe fallbacks and quote stripping
export function getAuthConfig() {
  const rawAdminEmail = process.env.ADMIN_EMAIL || '';
  const rawAdminPassword = process.env.ADMIN_PASSWORD || '';
  const rawSessionSecret = process.env.SESSION_SECRET || '';

  // Email: normalized by trimming whitespace and lowercasing
  const adminEmail = stripOuterQuotes(rawAdminEmail).trim().toLowerCase();

  // Password: do NOT trim or modify - only strip enclosing outer quotes and trailing newline
  const adminPassword = stripOuterQuotes(rawAdminPassword);

  // Session secret: stripped of outer quotes and trimmed
  const sessionSecret = stripOuterQuotes(rawSessionSecret).trim();

  const lockoutMinutes = parseInt(stripQuotes(process.env.LOCKOUT_MINUTES || '20'), 10) || 20;
  const maxAttempts = parseInt(stripQuotes(process.env.MAX_ATTEMPTS || '3'), 10) || 3;

  const deploymentEnv = process.env.VERCEL_ENV || (process.env.NODE_ENV === 'production' ? 'production' : 'development');

  const missingVars: string[] = [];
  if (!adminEmail) missingVars.push('ADMIN_EMAIL');
  if (!adminPassword) missingVars.push('ADMIN_PASSWORD');
  if (!sessionSecret) missingVars.push('SESSION_SECRET');

  const isConfigured = missingVars.length === 0;

  return {
    adminEmail,
    adminPassword,
    rawAdminPassword,
    sessionSecret,
    lockoutMinutes,
    maxAttempts,
    deploymentEnv,
    missingVars,
    isConfigured,
  };
}

/**
 * Hash a password using modern, cryptographically secure scrypt (RFC 7914).
 * Uses 16-byte random salt, N=16384, r=8, p=1, 64-byte key length.
 * Output format: scrypt:<salt_hex>:<hash_hex>
 */
export function hashPassword(password: string): string {
  if (!password) {
    throw new Error('Password cannot be empty');
  }
  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 32 * 1024 * 1024,
  });
  return `scrypt:${salt.toString('hex')}:${derivedKey.toString('hex')}`;
}

// Constant-time password comparison to prevent timing attacks.
// Supports modern scrypt hashes, legacy SHA-256 / SHA-512 hashes, and legacy plaintext fallbacks.
// Does NOT trim or modify the provided password.
export function verifyPassword(
  providedPassword: string,
  expectedPasswordOrHash: string,
  rawExpectedPassword?: string
): boolean {
  try {
    if (!providedPassword || !expectedPasswordOrHash) return false;

    // 1. Modern scrypt hash format: scrypt:<salt_hex>:<hash_hex>
    if (expectedPasswordOrHash.startsWith('scrypt:')) {
      const parts = expectedPasswordOrHash.split(':');
      if (parts.length === 3) {
        const salt = Buffer.from(parts[1], 'hex');
        const expectedKey = Buffer.from(parts[2], 'hex');
        const derivedKey = crypto.scryptSync(providedPassword, salt, expectedKey.length, {
          N: 16384,
          r: 8,
          p: 1,
          maxmem: 32 * 1024 * 1024,
        });
        if (derivedKey.length === expectedKey.length && crypto.timingSafeEqual(derivedKey, expectedKey)) {
          return true;
        }
      }
      return false;
    }

    // 2. Legacy SHA-256 pre-hashed password support (64 hex characters)
    const trimmedExpected = expectedPasswordOrHash.trim();
    if (/^[a-f0-9]{64}$/i.test(trimmedExpected)) {
      const provHashHex = crypto.createHash('sha256').update(providedPassword, 'utf8').digest('hex').toLowerCase();
      const expHexBuffer = Buffer.from(trimmedExpected.toLowerCase(), 'utf8');
      const provHexBuffer = Buffer.from(provHashHex, 'utf8');
      if (provHexBuffer.length === expHexBuffer.length && crypto.timingSafeEqual(provHexBuffer, expHexBuffer)) {
        return true;
      }
    }

    // 3. Legacy SHA-512 pre-hashed password support (128 hex characters)
    if (/^[a-f0-9]{128}$/i.test(trimmedExpected)) {
      const provSha512 = crypto.createHash('sha512').update(providedPassword, 'utf8').digest('hex').toLowerCase();
      const expHexBuffer = Buffer.from(trimmedExpected.toLowerCase(), 'utf8');
      const provHexBuffer = Buffer.from(provSha512, 'utf8');
      if (provHexBuffer.length === expHexBuffer.length && crypto.timingSafeEqual(provHexBuffer, expHexBuffer)) {
        return true;
      }
    }

    // 4. Exact constant-time match (legacy plaintext env value)
    const providedHash = crypto.createHash('sha256').update(providedPassword, 'utf8').digest();
    const expectedHash = crypto.createHash('sha256').update(expectedPasswordOrHash, 'utf8').digest();
    if (crypto.timingSafeEqual(providedHash, expectedHash)) {
      return true;
    }

    // 5. Raw expected password comparison (if quotes were stripped)
    if (rawExpectedPassword && rawExpectedPassword !== expectedPasswordOrHash) {
      const rawExpHash = crypto.createHash('sha256').update(rawExpectedPassword, 'utf8').digest();
      if (crypto.timingSafeEqual(providedHash, rawExpHash)) {
        return true;
      }
    }

    // 6. Trimmed expected password comparison
    if (trimmedExpected !== expectedPasswordOrHash && trimmedExpected.length > 0) {
      const trimmedExpHash = crypto.createHash('sha256').update(trimmedExpected, 'utf8').digest();
      if (crypto.timingSafeEqual(providedHash, trimmedExpHash)) {
        return true;
      }
    }

    return false;
  } catch (err) {
    return false;
  }
}

// Constant-time email verification with case and quote normalization
export function verifyEmail(providedEmail: string, expectedEmail: string): boolean {
  try {
    const normProvided = stripOuterQuotes(providedEmail).trim().toLowerCase();
    const normExpected = stripOuterQuotes(expectedEmail).trim().toLowerCase();
    if (!normProvided || !normExpected) return false;
    const providedHash = crypto.createHash('sha256').update(normProvided, 'utf8').digest();
    const expectedHash = crypto.createHash('sha256').update(normExpected, 'utf8').digest();
    return crypto.timingSafeEqual(providedHash, expectedHash);
  } catch (err) {
    return false;
  }
}

// --- SESSION REVOCATION STORE ---

const REVOCATION_FILE = process.env.VERCEL
  ? path.join('/tmp', 'auth-revocations.json')
  : path.join(process.cwd(), 'data', 'auth-revocations.json');

export interface RevokedTokenRecord {
  jti: string;
  email?: string;
  revokedAt: number;
  expiresAt: number;
}

export interface RevocationStore {
  [jti: string]: RevokedTokenRecord;
}

const memoryRevocationStore: RevocationStore = {};

function readRevocationStore(): RevocationStore {
  try {
    if (fs.existsSync(REVOCATION_FILE)) {
      const raw = fs.readFileSync(REVOCATION_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    // Fall back to memory store if filesystem read fails
  }
  return memoryRevocationStore;
}

function writeRevocationStore(store: RevocationStore): void {
  for (const k of Object.keys(memoryRevocationStore)) {
    delete memoryRevocationStore[k];
  }
  Object.assign(memoryRevocationStore, store);

  try {
    const dir = path.dirname(REVOCATION_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(REVOCATION_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (e) {
    // Preserved in memory
  }
}

/**
 * Revoke a session token or JTI
 */
export function revokeSessionToken(tokenOrJti: string | SessionPayload): boolean {
  if (!tokenOrJti) return false;
  let jti = '';
  let email: string | undefined;
  let exp = Date.now() + 30 * 24 * 60 * 60 * 1000;
  let rawToken = '';

  if (typeof tokenOrJti === 'object') {
    jti = tokenOrJti.jti || '';
    email = tokenOrJti.email;
    exp = tokenOrJti.exp || exp;
  } else if (typeof tokenOrJti === 'string') {
    rawToken = tokenOrJti;
    if (tokenOrJti.includes('.')) {
      try {
        const parts = tokenOrJti.split('.');
        const payload: SessionPayload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
        jti = payload.jti || parts[1];
        email = payload.email;
        exp = payload.exp || exp;
      } catch {
        jti = tokenOrJti;
      }
    } else {
      jti = tokenOrJti;
    }
  }

  if (!jti && !rawToken) return false;

  const store = readRevocationStore();
  const record: RevokedTokenRecord = {
    jti: jti || rawToken,
    email,
    revokedAt: Date.now(),
    expiresAt: exp,
  };

  if (jti) store[jti] = record;
  if (rawToken) store[rawToken] = record;
  if (rawToken && rawToken.includes('.')) {
    const sig = rawToken.split('.')[1];
    if (sig) store[sig] = record;
  }

  // Clean expired revocations
  const now = Date.now();
  for (const [k, v] of Object.entries(store)) {
    if (v.expiresAt && v.expiresAt < now) {
      delete store[k];
    }
  }

  writeRevocationStore(store);

  // Sync with distributed shared session revocation store
  if (jti) {
    recordDistributedRevocation(jti, Math.ceil(Math.max(60, (exp - Date.now()) / 1000))).catch(() => {});
    sessionRevocationStore.revokeToken({
      jti,
      email: email || '',
      revokedAt: Date.now(),
      expiresAt: exp,
    }).catch(() => {});
  }

  return true;
}

/**
 * Check if a session token or JTI has been revoked
 */
export function isSessionRevoked(tokenOrJti: string | SessionPayload): boolean {
  if (!tokenOrJti) return true;
  const store = readRevocationStore();

  let targetJti: string | undefined;

  if (typeof tokenOrJti === 'string') {
    if (store[tokenOrJti]) return true;
    if (tokenOrJti.includes('.')) {
      const parts = tokenOrJti.split('.');
      if (parts[1] && store[parts[1]]) return true;
      try {
        const payload: SessionPayload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
        if (payload.jti) {
          targetJti = payload.jti;
          if (store[payload.jti]) return true;
        }
      } catch {}
    } else {
      targetJti = tokenOrJti;
    }
  } else if (typeof tokenOrJti === 'object') {
    if (tokenOrJti.jti) {
      targetJti = tokenOrJti.jti;
      if (store[tokenOrJti.jti]) return true;
    }
  }

  if (targetJti && sessionRevocationStore.isRevokedSync(targetJti)) {
    return true;
  }

  return false;
}

// Create HMAC-signed session token with unique JTI
export function createSessionToken(email: string, durationMs?: number): string {
  const { sessionSecret } = getAuthConfig();
  if (!sessionSecret) {
    throw new Error('SESSION_SECRET environment variable is not configured');
  }
  const now = Date.now();
  const duration = durationMs || 30 * 24 * 60 * 60 * 1000; // 30 days default

  const payload: SessionPayload = {
    email: email.trim().toLowerCase(),
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + duration,
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', sessionSecret)
    .update(payloadB64)
    .digest('base64url');

  return `${payloadB64}.${signature}`;
}

// Verify HMAC-signed session token with expiration and revocation checks
export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, signature] = parts;
  const { sessionSecret } = getAuthConfig();
  if (!sessionSecret) return null;

  try {
    const expectedSignature = crypto
      .createHmac('sha256', sessionSecret)
      .update(payloadB64)
      .digest('base64url');

    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    const actualBuffer = Buffer.from(signature, 'utf8');

    if (expectedBuffer.length !== actualBuffer.length) return null;
    if (!crypto.timingSafeEqual(expectedBuffer, actualBuffer)) return null;

    const payload: SessionPayload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!payload.exp || Date.now() > payload.exp) {
      return null; // Expired
    }

    // Check server-side revocation list
    if (payload.jti && isSessionRevoked(payload.jti)) {
      return null; // Revoked
    }
    if (isSessionRevoked(token)) {
      return null;
    }

    return payload;
  } catch (err) {
    return null;
  }
}

// --- PASSWORD RESET TOKEN FLOW ---

export function createPasswordResetToken(email: string): { token: string; expiresAt: number } {
  const { sessionSecret } = getAuthConfig();
  if (!sessionSecret) {
    throw new Error('SESSION_SECRET environment variable is not configured');
  }
  const now = Date.now();
  const expiresAt = now + 60 * 60 * 1000; // 1 hour expiration
  const payload = {
    email: email.trim().toLowerCase(),
    nonce: crypto.randomBytes(16).toString('hex'),
    exp: expiresAt,
    type: 'pwd_reset',
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSecret).update(payloadB64).digest('base64url');
  return {
    token: `${payloadB64}.${signature}`,
    expiresAt,
  };
}

export function verifyPasswordResetToken(token: string | undefined | null): {
  valid: boolean;
  email?: string;
  error?: string;
} {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token is required' };
  }
  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'Malformed token format' };
  }
  const [payloadB64, signature] = parts;
  const { sessionSecret } = getAuthConfig();
  if (!sessionSecret) {
    return { valid: false, error: 'Server authentication unconfigured' };
  }

  try {
    const expectedSig = crypto.createHmac('sha256', sessionSecret).update(payloadB64).digest('base64url');
    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    const actualBuf = Buffer.from(signature, 'utf8');

    if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
      return { valid: false, error: 'Invalid token signature' };
    }

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (payload.type !== 'pwd_reset') {
      return { valid: false, error: 'Invalid token type' };
    }
    if (!payload.exp || Date.now() > payload.exp) {
      return { valid: false, error: 'Password reset token has expired' };
    }

    if (isSessionRevoked(token)) {
      return { valid: false, error: 'Token has already been consumed or revoked' };
    }

    return { valid: true, email: payload.email };
  } catch (err: any) {
    return { valid: false, error: err.message || 'Token verification failed' };
  }
}

export function consumePasswordResetToken(token: string): void {
  revokeSessionToken(token);
}

// --- PERSISTENT LOCKOUT STORE ---

function readLockoutStore(): LockoutStore {
  try {
    if (fs.existsSync(LOCKOUT_FILE)) {
      const raw = fs.readFileSync(LOCKOUT_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    // Fall back to memory store if filesystem read fails
  }
  return memoryLockoutStore;
}

function writeLockoutStore(store: LockoutStore): void {
  // Always update memory store
  for (const k of Object.keys(memoryLockoutStore)) {
    delete memoryLockoutStore[k];
  }
  Object.assign(memoryLockoutStore, store);

  try {
    const dir = path.dirname(LOCKOUT_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LOCKOUT_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (e) {
    // If writing fails (e.g. read-only filesystem), in-memory lockout is safely preserved
  }
}

export function getLockoutKey(email: string, ip: string): string {
  const normEmail = (email || '').trim().toLowerCase();
  const cleanIp = (ip || 'unknown').trim();
  return `${normEmail}::${cleanIp}`;
}

// Check current lockout state for a given email + IP
export function checkLockout(email: string, ip: string): {
  isLocked: boolean;
  remainingSeconds: number;
  attempts: number;
  maxAttempts: number;
} {
  const { lockoutMinutes, maxAttempts } = getAuthConfig();
  const lockoutMs = lockoutMinutes * 60 * 1000;
  const store = readLockoutStore();
  const normEmail = (email || '').trim().toLowerCase();
  const cleanIp = (ip || 'unknown').trim();
  let key = `${normEmail}::${cleanIp}`;
  let record = store[key];

  const now = Date.now();

  // If no direct record by email, check if this IP has an active locked record
  if (!record) {
    for (const [k, v] of Object.entries(store)) {
      if (k.endsWith(`::${cleanIp}`) && v.lockedUntil && v.lockedUntil > now) {
        key = k;
        record = v;
        break;
      }
    }
  }

  if (!record) {
    return { isLocked: false, remainingSeconds: 0, attempts: 0, maxAttempts };
  }

  // If locked
  if (record.lockedUntil) {
    if (record.lockedUntil > now) {
      const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
      return { isLocked: true, remainingSeconds, attempts: record.attempts, maxAttempts };
    } else {
      // Lock expired automatically!
      delete store[key];
      writeLockoutStore(store);
      return { isLocked: false, remainingSeconds: 0, attempts: 0, maxAttempts };
    }
  }

  // If attempt window expired (> lockoutMinutes since last failure)
  if (record.lastAttempt && (now - record.lastAttempt > lockoutMs)) {
    delete store[key];
    writeLockoutStore(store);
    return { isLocked: false, remainingSeconds: 0, attempts: 0, maxAttempts };
  }

  return { isLocked: false, remainingSeconds: 0, attempts: record.attempts || 0, maxAttempts };
}

// Record a failed login attempt
export function recordFailedAttempt(email: string, ip: string): {
  isLocked: boolean;
  remainingSeconds: number;
  attemptsLeft: number;
} {
  const { lockoutMinutes, maxAttempts } = getAuthConfig();
  const store = readLockoutStore();
  const key = getLockoutKey(email, ip);
  const now = Date.now();

  const record = store[key] || { attempts: 0, lastAttempt: now, lockedUntil: null };

  // If already locked and not expired
  if (record.lockedUntil && record.lockedUntil > now) {
    const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
    return { isLocked: true, remainingSeconds, attemptsLeft: 0 };
  }

  record.attempts = (record.attempts || 0) + 1;
  record.lastAttempt = now;

  if (record.attempts >= maxAttempts) {
    record.lockedUntil = now + lockoutMinutes * 60 * 1000;
    store[key] = record;
    writeLockoutStore(store);
    const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
    return { isLocked: true, remainingSeconds, attemptsLeft: 0 };
  }

  store[key] = record;
  writeLockoutStore(store);

  return {
    isLocked: false,
    remainingSeconds: 0,
    attemptsLeft: Math.max(0, maxAttempts - record.attempts),
  };
}

// Reset lockout state on successful authentication
export function resetLockout(email: string, ip: string): void {
  const store = readLockoutStore();
  const normEmail = (email || '').trim().toLowerCase();
  const cleanIp = (ip || 'unknown').trim();
  const key = `${normEmail}::${cleanIp}`;
  let changed = false;
  if (store[key]) {
    delete store[key];
    changed = true;
  }
  for (const k of Object.keys(store)) {
    if (k.endsWith(`::${cleanIp}`)) {
      delete store[k];
      changed = true;
    }
  }
  if (changed) {
    writeLockoutStore(store);
  }
}

/**
 * Distributed lockout check querying Redis when configured, with seamless local store fallback.
 */
export async function checkLockoutAsync(email: string, ip: string): Promise<{
  isLocked: boolean;
  remainingSeconds: number;
  attempts: number;
  maxAttempts: number;
}> {
  if (isSharedRedisConfigured()) {
    try {
      const shared = await checkSharedLockoutState(email, ip);
      if (shared && shared.lockedUntil && shared.lockedUntil > Date.now()) {
        const { maxAttempts } = getAuthConfig();
        const remainingSeconds = Math.ceil((shared.lockedUntil - Date.now()) / 1000);
        return { isLocked: true, remainingSeconds, attempts: shared.attempts, maxAttempts };
      }
    } catch {
      // Fall through to local store
    }
  }
  return checkLockout(email, ip);
}

/**
 * Distributed failure tracking syncing to Redis when configured.
 */
export async function recordFailedAttemptAsync(email: string, ip: string): Promise<{
  isLocked: boolean;
  remainingSeconds: number;
  attemptsLeft: number;
}> {
  const result = recordFailedAttempt(email, ip);
  if (isSharedRedisConfigured()) {
    try {
      const { lockoutMinutes } = getAuthConfig();
      const ttlSeconds = lockoutMinutes * 60;
      const store = readLockoutStore();
      const key = getLockoutKey(email, ip);
      const rec = store[key];
      if (rec) {
        await setSharedLockoutState(
          email,
          ip,
          {
            attempts: rec.attempts,
            lockedUntil: rec.lockedUntil,
            lastAttempt: rec.lastAttempt,
          },
          ttlSeconds
        );
      }
    } catch {
      // Local tracking is preserved
    }
  }
  return result;
}

/**
 * Distributed lockout reset syncing to Redis when configured.
 */
export async function resetLockoutAsync(email: string, ip: string): Promise<void> {
  resetLockout(email, ip);
  if (isSharedRedisConfigured()) {
    try {
      await resetSharedLockoutState(email, ip);
    } catch {
      // Local reset is preserved
    }
  }
}
