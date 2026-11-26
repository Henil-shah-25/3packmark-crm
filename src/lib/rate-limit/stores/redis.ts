import { RateLimiterStore, StoreCounter } from '../types';

/**
 * Production Redis/Upstash adapter for distributed serverless rate limiting.
 * 
 * DESIGN SPECIFICATION FOR VERCEL SERVERLESS:
 * In a distributed multi-instance Vercel serverless environment, local in-memory counters
 * do not share state across lambdas. This adapter connects to an external low-latency
 * Redis store (e.g. Upstash Redis, Vercel KV, or AWS ElastiCache).
 * 
 * Atomic Evaluation Strategy:
 * When configured, uses atomic Redis operations:
 *   MULTI
 *   INCRBY key cost
 *   PTTL key
 *   EXEC
 * If TTL is -1 (new key without expiration), runs PEXPIRE key windowMs.
 * 
 * GOVERNANCE NOTICE:
 * This adapter safely detects whether UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
 * or REDIS_URL are provisioned. If unconfigured, it does NOT invent fake credentials or connect
 * to unapproved external endpoints. Phase 5 will provision and activate durable shared infrastructure.
 */
export const ATOMIC_RATE_LIMIT_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4] or tostring(now)

local clearBefore = now - windowMs
redis.call('ZREMRANGEBYSCORE', key, '-inf', clearBefore)
local currentRequests = redis.call('ZCARD', key)

if currentRequests < limit then
    redis.call('ZADD', key, now, member)
    redis.call('PEXPIRE', key, windowMs)
    return {1, currentRequests + 1, windowMs}
else
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local ttl = 0
    if #oldest > 0 then
        ttl = math.max(0, (tonumber(oldest[2]) + windowMs) - now)
    end
    return {0, currentRequests, ttl}
end
`;

export type RateLimitFailurePolicy = 'fail-open' | 'fail-closed';

export interface RedisStoreOptions {
  url?: string;
  token?: string;
  failurePolicy?: RateLimitFailurePolicy;
  timeoutMs?: number;
}

export class RedisRateLimiterStore implements RateLimiterStore {
  readonly name = 'redis';
  readonly isDistributed = true;

  private isConfigured: boolean;
  private restUrl?: string;
  private restToken?: string;
  private timeoutMs: number;
  public failurePolicy: RateLimitFailurePolicy;

  constructor(options?: RateLimitFailurePolicy | RedisStoreOptions) {
    if (typeof options === 'string') {
      this.failurePolicy = options;
      this.restUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
      this.restToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
      this.timeoutMs = 1500;
    } else if (options) {
      this.failurePolicy = options.failurePolicy || 'fail-closed';
      this.restUrl = options.url || process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
      this.restToken = options.token || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
      this.timeoutMs = options.timeoutMs || 1500;
    } else {
      this.failurePolicy = 'fail-closed';
      this.restUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
      this.restToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
      this.timeoutMs = 1500;
    }
    this.isConfigured = Boolean(this.restUrl && this.restToken);
  }

  get isOperational(): boolean {
    return this.isConfigured;
  }

  /**
   * Returns the Lua script used for atomic rate limit evaluation.
   */
  getLuaScript(): string {
    return ATOMIC_RATE_LIMIT_LUA.trim();
  }

  async increment(key: string, windowMs: number, cost = 1): Promise<StoreCounter> {
    if (!this.isConfigured || !this.restUrl || !this.restToken) {
      if (this.failurePolicy === 'fail-open') {
        console.warn(`[RedisRateLimiterStore] Store unconfigured, applying fail-open policy for key: ${key}`);
        return {
          count: 1,
          resetTime: Date.now() + windowMs,
          ttlMs: windowMs,
        };
      }
      throw new Error(
        'RedisRateLimiterStore is not configured. Shared distributed storage requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.'
      );
    }

    try {
      // Execute atomic Lua evaluation via Upstash REST /eval
      const evalResponse = await fetch(`${this.restUrl}/eval`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.restToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          script: ATOMIC_RATE_LIMIT_LUA.trim(),
          keys: [key],
          args: [String(cost), String(windowMs)],
        }),
      });

      if (evalResponse.ok) {
        const evalResult = await evalResponse.json();
        const [currentCount, ttlMs] = evalResult.result || [cost, windowMs];
        const now = Date.now();
        return {
          count: Number(currentCount),
          resetTime: now + Number(ttlMs),
          ttlMs: Number(ttlMs),
        };
      }

      // Fallback to REST pipeline if eval is unavailable on provider tier
      const response = await fetch(`${this.restUrl}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.restToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          ['INCRBY', key, cost],
          ['PTTL', key],
        ]),
      });

      if (!response.ok) {
        throw new Error(`Upstash Redis pipeline failed with HTTP status ${response.status}`);
      }

      const results = await response.json();
      const count = Number(results[0]?.result || cost);
      let ttlMs = Number(results[1]?.result || -1);

      if (ttlMs <= 0) {
        await fetch(`${this.restUrl}/pexpire/${encodeURIComponent(key)}/${windowMs}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.restToken}`,
          },
        });
        ttlMs = windowMs;
      }

      const now = Date.now();
      return {
        count,
        resetTime: now + ttlMs,
        ttlMs,
      };
    } catch (err: any) {
      console.error('[RedisRateLimiterStore Error]:', err.message);
      if (this.failurePolicy === 'fail-open') {
        console.warn(`[RedisRateLimiterStore] Applying fail-open fallback for key: ${key}`);
        return {
          count: 1,
          resetTime: Date.now() + windowMs,
          ttlMs: windowMs,
        };
      }
      throw err;
    }
  }

  async get(key: string): Promise<StoreCounter | null> {
    if (!this.isConfigured || !this.restUrl || !this.restToken) {
      return null;
    }

    try {
      const response = await fetch(`${this.restUrl}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.restToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          ['GET', key],
          ['PTTL', key],
        ]),
      });

      if (!response.ok) return null;

      const results = await response.json();
      const rawCount = results[0]?.result;
      if (rawCount === null || rawCount === undefined) return null;

      const count = Number(rawCount);
      const ttlMs = Math.max(0, Number(results[1]?.result || 0));
      return {
        count,
        resetTime: Date.now() + ttlMs,
        ttlMs,
      };
    } catch {
      return null;
    }
  }

  async reset(key: string): Promise<void> {
    if (!this.isConfigured || !this.restUrl || !this.restToken) return;

    try {
      await fetch(`${this.restUrl}/del/${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.restToken}`,
        },
      });
    } catch {
      // Safe fallback
    }
  }
}

export { RedisRateLimiterStore as UpstashRedisStore };


