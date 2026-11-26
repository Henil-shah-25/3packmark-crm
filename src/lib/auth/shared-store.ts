/**
 * Shared Distributed Auth & Lockout Store
 * Developster Hub CRM — Phase 5 Security Remediation
 * 
 * Provides:
 * - Shared lockout state across serverless instances via Upstash Redis REST API (when configured)
 * - Distributed session revocation verification supported in Node.js and Edge Runtime
 * - Safe, non-blocking fallback to memory/file store when Redis is unconfigured
 */

export interface SharedLockoutState {
  attempts: number;
  lockedUntil: number | null;
  lastAttempt: number;
}

export type RevocationStatus = 'active' | 'revoked' | 'store_unavailable' | 'unconfigured';

export interface RevocationResult {
  isRevoked: boolean;
  status: RevocationStatus;
  errorMessage?: string;
}

function getRedisConfig() {
  const restUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return {
    isConfigured: Boolean(restUrl && restToken),
    restUrl,
    restToken,
  };
}

/**
 * Checks whether Redis is configured for shared distributed storage.
 */
export function isSharedRedisConfigured(): boolean {
  return getRedisConfig().isConfigured;
}

/**
 * Comprehensive distributed session revocation verification.
 * 
 * In serverless deployments with Google Sheets (without Upstash Redis):
 * - If Redis is unconfigured, proceeds in standalone mode using cryptographic HMAC signatures,
 *   tamper-proof claims, and token expiration verification.
 * - If Redis is configured, checks distributed revocation state via Redis REST API.
 */
export async function checkDistributedRevocation(jti: string): Promise<RevocationResult> {
  if (!jti) {
    return { isRevoked: true, status: 'revoked', errorMessage: 'Missing session identifier (jti)' };
  }

  const isProd = process.env.NODE_ENV === 'production';
  const { isConfigured, restUrl, restToken } = getRedisConfig();

  if (!isConfigured || !restUrl || !restToken) {
    // When Redis is not configured, revocation state is managed locally per instance,
    // relying on HMAC session signatures and token expiry. Returns unconfigured status transparently.
    return {
      isRevoked: false,
      status: 'unconfigured',
      errorMessage: 'Distributed Redis store is not configured; operating in standalone mode',
    };
  }

  try {
    const res = await fetch(`${restUrl}/get/crm:revoked:${encodeURIComponent(jti)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${restToken}`,
      },
      signal: AbortSignal.timeout(1200),
    });

    if (!res.ok) {
      if (isProd) {
        return {
          isRevoked: true,
          status: 'store_unavailable',
          errorMessage: `SHARED_AUTH_STORE_UNAVAILABLE: Redis returned HTTP ${res.status}`,
        };
      }
      return { isRevoked: false, status: 'store_unavailable' };
    }

    const data = await res.json();
    const isRevoked = data.result !== null && data.result !== undefined;
    return {
      isRevoked,
      status: isRevoked ? 'revoked' : 'active',
    };
  } catch (err: any) {
    if (isProd) {
      // Fail closed in production for transient network errors, timeouts, or store unavailability
      return {
        isRevoked: true,
        status: 'store_unavailable',
        errorMessage: `SHARED_AUTH_STORE_TIMEOUT: ${err.message || 'Connection failed'}`,
      };
    }
    // Development fallback
    return { isRevoked: false, status: 'store_unavailable' };
  }
}

/**
 * Checks if a session JTI is revoked in the shared distributed store.
 * Safe for both Edge Runtime and Node.js.
 */
export async function isDistributedSessionRevoked(jti: string): Promise<boolean> {
  const result = await checkDistributedRevocation(jti);
  return result.isRevoked;
}

/**
 * Records a session revocation in the shared distributed store.
 */
export async function recordDistributedRevocation(jti: string, ttlSeconds: number = 30 * 24 * 3600): Promise<void> {
  if (!jti) return;
  const { isConfigured, restUrl, restToken } = getRedisConfig();
  if (!isConfigured || !restUrl || !restToken) {
    return;
  }

  try {
    await fetch(`${restUrl}/setex/crm:revoked:${encodeURIComponent(jti)}/${ttlSeconds}/1`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${restToken}`,
      },
      signal: AbortSignal.timeout(1500),
    });
  } catch (err: any) {
    console.warn('[SharedAuthStore] Failed recording distributed revocation:', err.message);
  }
}

/**
 * Checks shared lockout status for an email/IP.
 */
export async function checkSharedLockoutState(
  email: string,
  ip: string
): Promise<SharedLockoutState | null> {
  const { isConfigured, restUrl, restToken } = getRedisConfig();
  if (!isConfigured || !restUrl || !restToken) {
    return null;
  }

  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanIp = (ip || 'unknown').trim();
  const key = `crm:lockout:${cleanEmail}:${cleanIp}`;

  try {
    const res = await fetch(`${restUrl}/get/${encodeURIComponent(key)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${restToken}`,
      },
      signal: AbortSignal.timeout(1000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (!data.result) return null;
    return typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
  } catch {
    return null;
  }
}

/**
 * Updates shared lockout state in Redis.
 */
export async function setSharedLockoutState(
  email: string,
  ip: string,
  state: SharedLockoutState,
  ttlSeconds: number
): Promise<void> {
  const { isConfigured, restUrl, restToken } = getRedisConfig();
  if (!isConfigured || !restUrl || !restToken) {
    return;
  }

  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanIp = (ip || 'unknown').trim();
  const key = `crm:lockout:${cleanEmail}:${cleanIp}`;

  try {
    await fetch(
      `${restUrl}/setex/${encodeURIComponent(key)}/${ttlSeconds}/${encodeURIComponent(JSON.stringify(state))}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${restToken}`,
        },
        signal: AbortSignal.timeout(1500),
      }
    );
  } catch (err: any) {
    console.warn('[SharedAuthStore] Failed persisting shared lockout state:', err.message);
  }
}

/**
 * Clears shared lockout state upon successful authentication.
 */
export async function resetSharedLockoutState(email: string, ip: string): Promise<void> {
  const { isConfigured, restUrl, restToken } = getRedisConfig();
  if (!isConfigured || !restUrl || !restToken) {
    return;
  }

  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanIp = (ip || 'unknown').trim();
  const key = `crm:lockout:${cleanEmail}:${cleanIp}`;

  try {
    await fetch(`${restUrl}/del/${encodeURIComponent(key)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${restToken}`,
      },
      signal: AbortSignal.timeout(1500),
    });
  } catch (err: any) {
    console.warn('[SharedAuthStore] Failed resetting shared lockout state:', err.message);
  }
}

