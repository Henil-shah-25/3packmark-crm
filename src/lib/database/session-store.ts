/**
 * Distributed Session Revocation Store
 * Developster Hub CRM — Phase 5 Security Remediation
 * 
 * Provides:
 * - Durable PostgreSQL-backed revocation storage (session_revocations table)
 * - JTI-level revocation with reason and expiration timestamps
 * - Memory caching for fast-path verification with safe database synchronization
 * - Fail-closed security policy when database is configured but unreachable
 * - Automatic expiry pruning
 */

import { isPostgresConfigured, getPostgresPool } from './client';
import { buildInsertQuery, buildSelectQuery, buildDeleteQuery } from './query-builder';

export interface RevocationRecord {
  jti: string;
  email: string;
  workspaceId?: string;
  reason?: string;
  revokedAt: number; // Unix ms
  expiresAt: number; // Unix ms
}

export class SharedSessionRevocationStore {
  private memoryCache: Map<string, RevocationRecord> = new Map();

  /**
   * Persists a revoked token to PostgreSQL (when configured) and updates memory cache.
   */
  async revokeToken(record: RevocationRecord): Promise<void> {
    if (!record.jti) {
      throw new Error('Cannot revoke session without valid JTI');
    }

    const normalized: RevocationRecord = {
      jti: record.jti,
      email: (record.email || 'unknown').toLowerCase().trim(),
      workspaceId: record.workspaceId || 'ws-default',
      reason: record.reason || 'logout',
      revokedAt: record.revokedAt || Date.now(),
      expiresAt: record.expiresAt || (Date.now() + 30 * 24 * 60 * 60 * 1000),
    };

    // 1. Update local fast-path memory cache
    this.memoryCache.set(normalized.jti, normalized);
    if (normalized.email) {
      this.memoryCache.set(`email:${normalized.email}:${normalized.jti}`, normalized);
    }

    // 2. Persist to PostgreSQL if configured
    if (isPostgresConfigured()) {
      try {
        const pool = getPostgresPool();
        const query = buildInsertQuery('session_revocations', {
          jti: normalized.jti,
          user_email: normalized.email,
          workspace_id: normalized.workspaceId,
          reason: normalized.reason,
          revoked_at: new Date(normalized.revokedAt).toISOString(),
          expires_at: new Date(normalized.expiresAt).toISOString(),
        });
        // Upsert on jti conflict
        const upsertText = `${query.text} ON CONFLICT (jti) DO UPDATE SET reason = EXCLUDED.reason, expires_at = EXCLUDED.expires_at`;
        await pool.query(upsertText, query.values);
      } catch (err: any) {
        console.error('[SessionRevocationStore Error]: Failed to persist revocation to PostgreSQL:', err.message);
        throw new Error(`Failed to durably persist session revocation: ${err.message}`);
      }
    }
  }

  /**
   * Synchronous revocation for memory cache (useful in sync edge routes and tests).
   */
  revokeTokenSync(jti: string, userId?: string, reason?: string, ttlSec: number = 3600): void {
    if (!jti) return;
    const now = Date.now();
    const expiresAt = now + ttlSec * 1000;
    const record: RevocationRecord = {
      jti,
      email: userId || 'unknown',
      workspaceId: 'ws-default',
      reason: reason || 'logout',
      revokedAt: now,
      expiresAt,
    };
    this.memoryCache.set(jti, record);

    // Asynchronously persist to PostgreSQL if configured
    if (isPostgresConfigured()) {
      this.revokeToken(record).catch((err) => {
        console.error('[SessionRevocationStore Async Sync Error]:', err.message);
      });
    }
  }

  /**
   * Synchronous check against local memory cache.
   */
  isRevokedSync(jti: string): boolean {
    if (!jti) return false;
    const record = this.memoryCache.get(jti);
    if (!record) return false;
    if (record.expiresAt && record.expiresAt < Date.now()) {
      this.memoryCache.delete(jti);
      return false;
    }
    return true;
  }

  /**
   * Asynchronous verification. First checks memory cache, then falls back to PostgreSQL.
   * If PostgreSQL is configured but fails, applies fail-closed security for unknown records.
   */
  async isRevoked(jti: string): Promise<boolean> {
    if (!jti) return false;

    // Check fast-path memory cache first
    if (this.isRevokedSync(jti)) {
      return true;
    }

    // If PostgreSQL is configured, verify durable state
    if (isPostgresConfigured()) {
      try {
        const pool = getPostgresPool();
        const res = await pool.query(
          'SELECT jti, expires_at FROM session_revocations WHERE jti = $1',
          [jti]
        );

        if (res.rows.length > 0) {
          const row = res.rows[0];
          const expiresAt = new Date(row.expires_at).getTime();
          if (expiresAt > Date.now()) {
            // Cache back into memory
            this.memoryCache.set(jti, {
              jti,
              email: 'verified_db',
              revokedAt: Date.now(),
              expiresAt,
            });
            return true;
          } else {
            return false;
          }
        }
        return false;
      } catch (err: any) {
        console.error('[SessionRevocationStore Error]: PostgreSQL lookup failed:', err.message);
        // Fail-closed policy: If DB outage occurs and token was not verified in clean cache, do not trust
        if (process.env.NODE_ENV === 'production') {
          throw new Error('[SessionRevocationStore Security Error]: Cannot verify session revocation status due to database outage');
        }
        return false;
      }
    }

    return false;
  }

  /**
   * Prunes expired revocation records from memory and PostgreSQL.
   */
  async pruneExpired(): Promise<number> {
    const now = Date.now();
    let count = 0;
    for (const [key, record] of this.memoryCache.entries()) {
      if (record.expiresAt && record.expiresAt < now) {
        this.memoryCache.delete(key);
        count++;
      }
    }

    if (isPostgresConfigured()) {
      try {
        const pool = getPostgresPool();
        const res = await pool.query(
          'DELETE FROM session_revocations WHERE expires_at < $1',
          [new Date(now).toISOString()]
        );
        count += (res.rowCount ?? 0);
      } catch (err: any) {
        console.error('[SessionRevocationStore Error]: PostgreSQL pruning failed:', err.message);
      }
    }

    return count;
  }

  clear() {
    this.memoryCache.clear();
  }
}

export const sessionRevocationStore = new SharedSessionRevocationStore();
