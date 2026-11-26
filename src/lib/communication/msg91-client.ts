import crypto from 'crypto';

export interface Msg91BalanceResult {
  success: boolean;
  isConfigured: boolean;
  balance?: number;
  currency?: string;
  transactionalCredits?: number;
  promotionalCredits?: number;
  whatsappCredits?: number;
  error?: string;
  verifiedAt?: string;
}

export interface Msg91Overview {
  connectionStatus: 'connected' | 'not_connected';
  verifiedAt?: string;
  balance: number;
  currency: string;
  whatsapp: {
    status: 'connected' | 'pending_setup' | 'not_configured';
    connectedNumber?: string;
    businessAccount?: string;
    qualityRating?: string;
    templatesCount: {
      total: number;
      approved: number;
      pending: number;
      rejected: number;
    };
  };
  sms: {
    status: 'connected' | 'pending_dlt' | 'not_configured';
    senderId?: string;
    dltStatus?: 'approved' | 'pending' | 'not_registered';
    templatesCount: {
      total: number;
      approved: number;
      pending: number;
    };
  };
}

// In-memory rate limiting for PIN security checks (Keyed by workspaceId)
const pinAttemptStore = new Map<string, { attempts: number; lockedUntil: number }>();

/**
 * Hash a 4-digit security PIN using PBKDF2 with SHA-256
 */
export function hashSecurityPin(pin: string): string {
  const salt = process.env.PIN_SALT || 'developster-security-pin-salt-2026';
  const hash = crypto.pbkdf2Sync(pin.trim(), salt, 10000, 32, 'sha256');
  return hash.toString('hex');
}

/**
 * Verify a 4-digit security PIN against its stored hash with rate-limiting
 */
export function verifySecurityPin(workspaceId: string, enteredPin: string, storedHash: string): {
  valid: boolean;
  locked?: boolean;
  remainingAttempts?: number;
  error?: string;
} {
  const now = Date.now();
  const rateLimit = pinAttemptStore.get(workspaceId);

  if (rateLimit && rateLimit.lockedUntil > now) {
    const minutesLeft = Math.ceil((rateLimit.lockedUntil - now) / 60000);
    return {
      valid: false,
      locked: true,
      error: `Security lockout: Too many failed PIN attempts. Please try again in ${minutesLeft} minute(s).`,
    };
  }

  const enteredHash = hashSecurityPin(enteredPin);
  const isValid = crypto.timingSafeEqual(Buffer.from(enteredHash, 'hex'), Buffer.from(storedHash, 'hex'));

  if (!isValid) {
    const currentAttempts = (rateLimit ? rateLimit.attempts : 0) + 1;
    if (currentAttempts >= 5) {
      pinAttemptStore.set(workspaceId, { attempts: currentAttempts, lockedUntil: now + 15 * 60 * 1000 });
      return {
        valid: false,
        locked: true,
        error: 'Too many incorrect attempts. Your account security PIN verification is locked for 15 minutes.',
      };
    } else {
      pinAttemptStore.set(workspaceId, { attempts: currentAttempts, lockedUntil: 0 });
      return {
        valid: false,
        remainingAttempts: 5 - currentAttempts,
        error: `Incorrect PIN. ${5 - currentAttempts} attempt(s) remaining before security lockout.`,
      };
    }
  }

  // Clear attempts on success
  pinAttemptStore.delete(workspaceId);
  return { valid: true };
}

/**
 * Validates MSG91 Auth Key against official MSG91 balance / profile endpoint
 * Base URL: https://api.msg91.com/api/v5/
 */
export async function testMsg91AuthKey(authKey: string): Promise<Msg91BalanceResult> {
  const cleanKey = (authKey || '').trim();
  if (!cleanKey) {
    return {
      success: false,
      isConfigured: false,
      error: 'MSG91 Auth Key is required.',
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    // Official MSG91 wallet / balance query
    const res = await fetch('https://api.msg91.com/api/v5/wallet/balance', {
      method: 'GET',
      headers: {
        authkey: cleanKey,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (res.status === 401 || res.status === 403) {
      return {
        success: false,
        isConfigured: false,
        error: 'Authentication failed: Invalid MSG91 Auth Key. Please check your credentials in MSG91 dashboard.',
      };
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return {
        success: false,
        isConfigured: false,
        error: `MSG91 API error (${res.status}): ${errText || res.statusText}`,
      };
    }

    const data = await res.json().catch(() => ({}));
    return {
      success: true,
      isConfigured: true,
      balance: typeof data.balance === 'number' ? data.balance : Number(data.amount || 0),
      currency: data.currency || 'INR',
      transactionalCredits: data.transactional || 0,
      promotionalCredits: data.promotional || 0,
      whatsappCredits: data.whatsapp || 0,
      verifiedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return {
        success: false,
        isConfigured: false,
        error: 'Connection timed out while contacting MSG91 API gateway.',
      };
    }
    return {
      success: false,
      isConfigured: false,
      error: err.message || 'Network error verifying MSG91 credentials.',
    };
  }
}

