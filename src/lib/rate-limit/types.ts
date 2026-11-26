export interface RateLimitConfig {
  /** Maximum number of allowed requests in the time window */
  limit: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Unique key identifying the entity (e.g. `ip:1.2.3.4`, `user:usr-1:ai`, `tenant:ws-1:track`) */
  identifier: string;
  /** Logical category for telemetry, errors, and headers (e.g. 'auth', 'ai', 'pulse-track') */
  category?: string;
  /** Cost/weight of this request against the limit quota (default: 1) */
  cost?: number;
}

export interface RateLimitResult {
  /** Whether the request is permitted within the rate limit */
  success: boolean;
  /** The maximum limit configured for this window */
  limit: number;
  /** Number of remaining requests allowed in the current window */
  remaining: number;
  /** Timestamp (epoch ms) when the current window resets */
  resetTime: number;
  /** Number of seconds until the rate limit resets (for Retry-After header) */
  retryAfterSeconds: number;
  /** Logical category */
  category?: string;
  /** Identifier tested */
  identifier: string;
  /** Whether the underlying store is distributed across multi-instance serverless runtimes */
  isDistributed: boolean;
  /** Name of the active store engine */
  storeName: string;
}

export interface StoreCounter {
  count: number;
  resetTime: number;
  ttlMs: number;
}

export interface RateLimiterStore {
  readonly name: string;
  readonly isDistributed: boolean;

  /**
   * Increment the counter for key by cost within windowMs.
   */
  increment(key: string, windowMs: number, cost?: number): Promise<StoreCounter>;

  /**
   * Get the current counter value for key without incrementing.
   */
  get(key: string): Promise<StoreCounter | null>;

  /**
   * Reset/clear the rate limit key.
   */
  reset(key: string): Promise<void>;

  /**
   * Clear all records in the store (useful in test suites).
   */
  clear?(): Promise<void>;
}

