import { NextResponse } from 'next/server';
import { RateLimitConfig, RateLimitResult, RateLimiterStore } from './types';
import { MemoryRateLimiterStore } from './stores/memory';
import { RedisRateLimiterStore } from './stores/redis';

export * from './types';
export * from './stores/memory';
export * from './stores/redis';

// Default presets tailored to risk classification and operational requirements
export const RATE_LIMIT_PRESETS = {
  // Authentication & Credentials
  AUTH_LOGIN: { limit: 10, windowMs: 60_000, category: 'auth-login' },
  AUTH_PASSWORD_RESET: { limit: 5, windowMs: 15 * 60_000, category: 'auth-password-reset' },
  AUTH_SIGNUP: { limit: 10, windowMs: 10 * 60_000, category: 'auth-signup' },

  // Public Pulse Ingestion
  PULSE_TRACK_IP: { limit: 120, windowMs: 60_000, category: 'pulse-track-ip' },
  PULSE_TRACK_TENANT: { limit: 1000, windowMs: 60_000, category: 'pulse-track-tenant' },
  PULSE_EMAIL_TRACK: { limit: 120, windowMs: 60_000, category: 'pulse-email' },

  // Webhook Integrations (Shopify / WooCommerce: generous allowance to protect provider retries)
  WEBHOOK_BURST: { limit: 300, windowMs: 60_000, category: 'webhook' },

  // AI & Expensive Computation
  AI_USER: { limit: 20, windowMs: 60_000, category: 'ai-user' },
  AI_TENANT: { limit: 60, windowMs: 60_000, category: 'ai-tenant' },

  // Background Automations & Cron
  AUTOMATION_DISPATCH: { limit: 120, windowMs: 60_000, category: 'automation' },
  CRON_TICK: { limit: 12, windowMs: 60_000, category: 'cron' },

  // Outbound Communications (SMS/Email spend protection)
  COMMUNICATION_OUTBOUND: { limit: 30, windowMs: 60_000, category: 'communication' },
  MSG91_KEY_REVEAL: { limit: 5, windowMs: 60_000, category: 'security-sensitive' },

  // Secondary High-Cost Resources (Phase 5)
  ACTIVITIES_WRITE: { limit: 60, windowMs: 60_000, category: 'activities' },
  CALENDAR_SYNC: { limit: 30, windowMs: 60_000, category: 'calendar' },
  SHEETS_IMPORT: { limit: 10, windowMs: 60_000, category: 'sheets-import' },

  // General Application APIs
  STANDARD_WRITE: { limit: 120, windowMs: 60_000, category: 'api-write' },
  SENSITIVE_WRITE: { limit: 30, windowMs: 60_000, category: 'sensitive-write' },
  GENERAL_WRITE: { limit: 120, windowMs: 60_000, category: 'api-write' },
  GENERAL_READ: { limit: 300, windowMs: 60_000, category: 'api-read' },
} as const;

// Global singleton instances
let defaultStore: RateLimiterStore | null = null;

/**
 * Returns the active rate limiter store.
 * Automatically selects RedisRateLimiterStore if Redis credentials are set and operational.
 * In production, logs clear operational diagnostics and prohibits silent fallback without notice (MED-03).
 */
export function getRateLimiterStore(): RateLimiterStore {
  if (defaultStore) return defaultStore;

  const redisStore = new RedisRateLimiterStore();
  if (redisStore.isOperational) {
    defaultStore = redisStore;
    return defaultStore;
  }

  // Production check: Never silently fall back to in-memory store in multi-instance production
  if (process.env.NODE_ENV === 'production') {
    console.error(
      '[RateLimiter Security Warning]: Production environment detected but Upstash Redis (UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN) is not configured. Falling back to single-instance memory store. Distributed rate limiting across serverless instances is NOT active.'
    );

    if (process.env.STRICT_RATE_LIMIT === 'true') {
      throw new Error(
        '[RateLimiter Critical Error]: Distributed Redis rate limiting is required in production when STRICT_RATE_LIMIT=true'
      );
    }
  }

  defaultStore = new MemoryRateLimiterStore();
  return defaultStore;
}

/**
 * Set or override the active rate limiter store (useful for tests or custom injection).
 */
export function setRateLimiterStore(store: RateLimiterStore | null): void {
  defaultStore = store;
}

/**
 * Core rate limiting function.
 * Evaluates the request against the configured quota and window.
 */
export async function checkRateLimit(config: RateLimitConfig): Promise<RateLimitResult> {
  const store = getRateLimiterStore();
  const cost = config.cost ?? 1;
  const now = Date.now();

  const counter = await store.increment(config.identifier, config.windowMs, cost);
  const remaining = Math.max(0, config.limit - counter.count);
  const success = counter.count <= config.limit;
  const retryAfterSeconds = success ? 0 : Math.max(1, Math.ceil((counter.resetTime - now) / 1000));

  return {
    success,
    limit: config.limit,
    remaining,
    resetTime: counter.resetTime,
    retryAfterSeconds,
    category: config.category,
    identifier: config.identifier,
    isDistributed: store.isDistributed,
    storeName: store.name,
  };
}

/**
 * Generates standard rate limit headers to attach to an HTTP response.
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetTime / 1000)),
    'X-RateLimit-Store': result.storeName,
    'X-RateLimit-Distributed': String(result.isDistributed),
  };

  if (!result.success) {
    headers['Retry-After'] = String(result.retryAfterSeconds);
  }

  return headers;
}

/**
 * Generates a standard HTTP 429 Too Many Requests response with appropriate headers and body.
 */
export function createRateLimitResponse(
  result: RateLimitResult,
  customMessage?: string
): NextResponse {
  const message =
    customMessage ||
    `Rate limit exceeded${result.category ? ` for ${result.category}` : ''}. Please retry in ${result.retryAfterSeconds} seconds.`;

  const headers = getRateLimitHeaders(result);

  return NextResponse.json(
    {
      error: 'Too Many Requests',
      message,
      category: result.category,
      limit: result.limit,
      remaining: result.remaining,
      retryAfter: result.retryAfterSeconds,
      resetAt: result.resetTime,
      isDistributed: result.isDistributed,
    },
    {
      status: 429,
      headers,
    }
  );
}

/**
 * Attaches rate limit telemetry headers to an existing successful NextResponse.
 */
export function attachRateLimitHeaders(
  response: NextResponse,
  result: RateLimitResult
): NextResponse {
  const headers = getRateLimitHeaders(result);
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

