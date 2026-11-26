import { RateLimiterStore, StoreCounter } from '../types';

interface MemoryEntry {
  count: number;
  resetTime: number;
}

/**
 * In-memory rate limiter store using sliding/fixed window counters.
 * 
 * NOTE ON SERVERLESS ENVIRONMENTS:
 * This store runs in the local process memory. In multi-container or distributed serverless
 * architectures (such as Vercel Lambdas), individual instances maintain isolated memory.
 * For shared distributed guarantees across multiple lambdas, use RedisRateLimiterStore (Phase 5).
 */
export class MemoryRateLimiterStore implements RateLimiterStore {
  readonly name = 'memory';
  readonly isDistributed = false;

  private store = new Map<string, MemoryEntry>();
  private lastCleanup = Date.now();
  private readonly cleanupIntervalMs = 60_000;

  constructor() {}

  private cleanExpired(): void {
    const now = Date.now();
    if (now - this.lastCleanup < this.cleanupIntervalMs) return;
    this.lastCleanup = now;

    for (const [key, entry] of this.store.entries()) {
      if (entry.resetTime <= now) {
        this.store.delete(key);
      }
    }
  }

  async increment(key: string, windowMs: number, cost = 1): Promise<StoreCounter> {
    this.cleanExpired();
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || entry.resetTime <= now) {
      // New or expired window
      const newEntry: MemoryEntry = {
        count: cost,
        resetTime: now + windowMs,
      };
      this.store.set(key, newEntry);
      return {
        count: cost,
        resetTime: newEntry.resetTime,
        ttlMs: windowMs,
      };
    }

    // Existing active window
    entry.count += cost;
    const ttlMs = Math.max(0, entry.resetTime - now);
    return {
      count: entry.count,
      resetTime: entry.resetTime,
      ttlMs,
    };
  }

  async get(key: string): Promise<StoreCounter | null> {
    this.cleanExpired();
    const now = Date.now();
    const entry = this.store.get(key);
    if (!entry || entry.resetTime <= now) {
      return null;
    }
    return {
      count: entry.count,
      resetTime: entry.resetTime,
      ttlMs: Math.max(0, entry.resetTime - now),
    };
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}

