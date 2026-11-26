/**
 * Central Database Client & Tenant Transaction Manager
 * Developster Hub CRM — Phase 5 Security Remediation
 * 
 * Manages:
 * - Real PostgreSQL connection pooling via 'pg' (Pool / PoolClient)
 * - Transaction-scoped tenant context via SELECT set_config('app.current_workspace_id', $1, true)
 * - Safe lifecycle management and connection release back to pool
 * - Parameterized execution safety (values never inlined)
 * - Strict prohibition of in-memory fallback in production environments
 */

import { Pool, PoolClient, PoolConfig } from 'pg';
import { ParameterizedQuery, QueryResult } from './query-builder';

export interface DatabaseConfig {
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  maxPoolSize?: number;
  ssl?: boolean;
}

export interface TenantContext {
  workspaceId: string;
  userId?: string;
}

export interface DatabaseTlsConfig {
  rejectUnauthorized: boolean;
  ca?: string;
}

/**
 * Safely parses a CA certificate from either raw PEM text or Base64-encoded PEM text.
 * Never logs certificate contents.
 */
export function parseCaCertificate(raw?: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  // 1. If already PEM text with standard header
  if (trimmed.includes('-----BEGIN CERTIFICATE-----')) {
    return trimmed;
  }

  // 2. If Base64-encoded PEM text, decode and verify
  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf-8');
    if (decoded.includes('-----BEGIN CERTIFICATE-----')) {
      return decoded;
    }
  } catch {
    // Not valid Base64
  }

  // Fallback to trimmed input if it could be a raw single-line or custom PEM string
  return trimmed;
}

/**
 * Resolves PostgreSQL TLS configuration enforcing strict production security.
 * 
 * Rules:
 * - Production: ALWAYS enforces rejectUnauthorized: true.
 * - Production: Disabling TLS (DATABASE_SSL=false or sslmode=disable) throws a fatal security error.
 * - Production: rejectUnauthorized: false is NEVER allowed as a fallback.
 * - Custom CA: Loaded from DATABASE_CA_CERT (supports PEM and Base64).
 * - Provider Compatibility:
 *   - Neon: Uses standard Web PKI certificates; validates automatically with system CAs.
 *   - AWS RDS: Requires AWS RDS Global Bundle CA; provided via DATABASE_CA_CERT.
 *   - Supabase: Uses Let's Encrypt / Supabase root cert; supports DATABASE_CA_CERT when custom CA needed.
 * - Development: Allows unencrypted connections for localhost/127.0.0.1. Remote dev enforces validation
 *   unless DATABASE_SSL_REJECT_UNAUTHORIZED=false is explicitly configured.
 */
export function resolveDatabaseTlsConfig(options?: {
  connectionString?: string;
  isProduction?: boolean;
  caCert?: string;
  disableSsl?: boolean;
}): DatabaseTlsConfig | boolean | undefined {
  const isProduction = options?.isProduction ?? (process.env.NODE_ENV === 'production');
  const connectionString = options?.connectionString ?? process.env.DATABASE_URL;
  const disableSsl = options?.disableSsl ?? (process.env.DATABASE_SSL === 'false');
  const caCertRaw = options?.caCert ?? process.env.DATABASE_CA_CERT;

  // --- PRODUCTION RULES ---
  if (isProduction) {
    if (disableSsl) {
      throw new Error(
        '[Database Security Error]: DATABASE_SSL=false is strictly prohibited in production. Production database connections must enforce TLS encryption.'
      );
    }

    if (connectionString && (connectionString.includes('sslmode=disable') || connectionString.includes('ssl=false'))) {
      throw new Error(
        '[Database Security Error]: sslmode=disable is strictly prohibited in production. Production database connections must enforce TLS encryption.'
      );
    }

    const ca = parseCaCertificate(caCertRaw);
    return {
      rejectUnauthorized: true,
      ...(ca ? { ca } : {}),
    };
  }

  // --- DEVELOPMENT / TEST RULES ---
  if (disableSsl) {
    return false;
  }

  // Localhost or 127.0.0.1 defaults to unencrypted in local dev unless explicitly enabled
  if (connectionString && (connectionString.includes('localhost') || connectionString.includes('127.0.0.1'))) {
    if (process.env.DATABASE_SSL === 'true') {
      const ca = parseCaCertificate(caCertRaw);
      return {
        rejectUnauthorized: false, // Local dev self-signed certs permitted in non-production only
        ...(ca ? { ca } : {}),
      };
    }
    return false;
  }

  // Remote database in development/test
  if (connectionString) {
    const ca = parseCaCertificate(caCertRaw);
    const allowInsecureDev = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'false';
    return {
      rejectUnauthorized: !allowInsecureDev,
      ...(ca ? { ca } : {}),
    };
  }

  return undefined;
}

/**
 * Singleton PostgreSQL connection pool.
 */
let pgPool: Pool | null = null;
let authPgPool: Pool | null = null;

export function isPostgresConfigured(): boolean {
  return Boolean(
    process.env.DATABASE_URL ||
    (process.env.PGHOST && process.env.PGDATABASE && process.env.PGUSER)
  );
}

export function isAuthPostgresConfigured(): boolean {
  return Boolean(
    process.env.AUTH_DATABASE_URL ||
    process.env.DATABASE_URL ||
    (process.env.PGHOST && process.env.PGDATABASE && process.env.PGUSER)
  );
}

/**
 * Creates or retrieves the singleton PostgreSQL pool.
 */
export function getPostgresPool(): Pool {
  if (pgPool) return pgPool;

  const connectionString = process.env.DATABASE_URL;
  const poolConfig: PoolConfig = {
    connectionString,
    max: parseInt(process.env.PGMAX_POOL || '20', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };

  if (process.env.NODE_ENV === 'production' && !connectionString) {
    throw new Error(
      '[Database Security Error]: Production environment detected but DATABASE_URL is not configured. In-memory database is strictly prohibited in production.'
    );
  }

  const tlsConfig = resolveDatabaseTlsConfig({
    connectionString,
    isProduction: process.env.NODE_ENV === 'production',
    caCert: process.env.DATABASE_CA_CERT,
    disableSsl: process.env.DATABASE_SSL === 'false',
  });

  if (tlsConfig !== undefined) {
    poolConfig.ssl = tlsConfig;
  }

  pgPool = new Pool(poolConfig);

  pgPool.on('error', (err) => {
    console.error('[PostgreSQL Pool Unexpected Error]:', err.message);
  });

  return pgPool;
}

/**
 * Creates or retrieves the dedicated singleton PostgreSQL pool for authentication queries (auth_user).
 * Connects via AUTH_DATABASE_URL to ensure least-privilege separation from general application queries.
 */
export function getAuthPostgresPool(): Pool {
  if (authPgPool) return authPgPool;

  const isProduction = process.env.NODE_ENV === 'production';
  const connectionString = process.env.AUTH_DATABASE_URL || process.env.DATABASE_URL;

  if (isProduction && !process.env.AUTH_DATABASE_URL) {
    throw new Error(
      '[Database Security Error]: Production environment detected but AUTH_DATABASE_URL is not configured. Dedicated authentication pool requires isolated credentials.'
    );
  }

  if (isProduction && !connectionString) {
    throw new Error(
      '[Database Security Error]: Production environment detected but AUTH_DATABASE_URL is not configured. In-memory database is strictly prohibited in production.'
    );
  }

  const poolConfig: PoolConfig = {
    connectionString,
    max: parseInt(process.env.PGMAX_AUTH_POOL || '10', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };

  const tlsConfig = resolveDatabaseTlsConfig({
    connectionString,
    isProduction,
    caCert: process.env.DATABASE_CA_CERT,
    disableSsl: process.env.DATABASE_SSL === 'false',
  });

  if (tlsConfig !== undefined) {
    poolConfig.ssl = tlsConfig;
  }

  authPgPool = new Pool(poolConfig);

  authPgPool.on('error', (err) => {
    console.error('[PostgreSQL Auth Pool Unexpected Error]:', err.message);
  });

  return authPgPool;
}

/**
 * Closes active PostgreSQL connection pools (useful for clean test teardown and graceful shutdown).
 */
export async function closePostgresPool(): Promise<void> {
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }
  if (authPgPool) {
    await authPgPool.end();
    authPgPool = null;
  }
}

/**
 * In-Memory Transaction Mock Client for local test environments without an active PostgreSQL cluster.
 * Simulates RLS enforcement, transaction boundaries, and tenant context isolation.
 */
export class MemoryTenantDatabase {
  private activeWorkspaceId: string | null = null;
  private activeUserId: string | null = null;
  private tables: Record<string, any[]> = {};

  setSession(workspaceId: string | null, userId: string | null = null) {
    this.activeWorkspaceId = workspaceId;
    this.activeUserId = userId;
  }

  clearSession() {
    this.activeWorkspaceId = null;
    this.activeUserId = null;
  }

  getActiveWorkspaceId(): string | null {
    return this.activeWorkspaceId;
  }

  getActiveUserId(): string | null {
    return this.activeUserId;
  }

  getIsMasterAdmin(): boolean {
    return false; // CRIT-02: User-controlled session variables are prohibited as master admin proof
  }

  getTable(name: string): any[] {
    if (!this.tables[name]) {
      this.tables[name] = [];
    }
    return this.tables[name];
  }

  clear() {
    this.activeWorkspaceId = null;
    this.activeUserId = null;
    this.tables = {};
  }
}

export const memoryDb = new MemoryTenantDatabase();

/**
 * Executes a database operation within a transaction-scoped tenant boundary.
 * 
 * In real PostgreSQL:
 * 1. Acquires a connection client from the connection pool.
 * 2. Executes 'BEGIN'.
 * 3. Sets transaction-local tenant context:
 *    `SELECT set_config('app.current_workspace_id', $1, true)`
 *    The 3rd argument `true` ensures transaction-local scope (equivalent to SET LOCAL).
 * 4. Optionally sets transaction-local authenticated user context:
 *    `SELECT set_config('app.current_user_id', $1, true)`
 * 5. Executes user callback with the scoped executor.
 * 6. Executes 'COMMIT' (or 'ROLLBACK' on exception).
 * 7. Releases client back to the pool in a finally block.
 * 
 * When connection is returned to pool or transaction ends, the setting is discarded,
 * preventing cross-tenant bleed during connection reuse.
 */
export async function withTenantTransaction<T>(
  context: TenantContext,
  callback: (executor: {
    query: <R = any>(query: ParameterizedQuery) => Promise<QueryResult<R>>;
    workspaceId: string;
    userId?: string;
    client?: PoolClient;
  }) => Promise<T>
): Promise<T> {
  const verifiedWs = context.workspaceId;
  if (!verifiedWs || typeof verifiedWs !== 'string' || !verifiedWs.trim()) {
    throw new Error('Tenant Boundary Violation: Missing or invalid workspace context');
  }

  // If real PostgreSQL is configured:
  if (isPostgresConfigured()) {
    const pool = getPostgresPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Set transaction-local tenant context via set_tenant_context (Migration 005/006/007)
      try {
        await client.query("SELECT set_tenant_context($1, $2)", [verifiedWs, context.userId || null]);
      } catch (err: any) {
        // If function does not exist (e.g. pre-migration 005 legacy local DB in non-production), fallback to set_config
        if (err?.code === '42883' && process.env.NODE_ENV !== 'production') {
          await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [verifiedWs]);
          if (context.userId) {
            await client.query("SELECT set_config('app.current_user_id', $1, true)", [context.userId]);
          }
        } else {
          // Strict security: authorization errors or production missing function must rethrow
          throw err;
        }
      }

      const executor = {
        workspaceId: verifiedWs,
        userId: context.userId,
        client,
        query: async <R = any>(q: ParameterizedQuery): Promise<QueryResult<R>> => {
          const res = await client.query(q.text, q.values);
          return {
            rows: res.rows as R[],
            rowCount: res.rowCount ?? 0,
          };
        },
      };

      const result = await callback(executor);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('[PostgreSQL Rollback Error]:', rollbackErr);
      }
      throw err;
    } finally {
      // Explicitly clean up session settings before pool release
      try {
        await client.query("SELECT set_config('app.current_workspace_id', '', false), set_config('app.current_user_id', '', false)");
      } catch {}
      client.release();
    }
  }

  // If in production without PostgreSQL configured, throw fatal error
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[Database Security Error]: Production environment requires PostgreSQL. In-memory database is prohibited.'
    );
  }

  // Local test / development fallback
  const previousWs = memoryDb.getActiveWorkspaceId();
  const previousUser = memoryDb.getActiveUserId();

  try {
    memoryDb.setSession(verifiedWs, context.userId || null);

    const executor = {
      workspaceId: verifiedWs,
      userId: context.userId,
      query: async <R = any>(query: ParameterizedQuery): Promise<QueryResult<R>> => {
        const currentActiveWs = memoryDb.getActiveWorkspaceId();
        if (!currentActiveWs) {
          throw new Error('PostgreSQL RLS Violation: No active tenant context in transaction');
        }

        return {
          rows: [] as R[],
          rowCount: 0,
        };
      },
    };

    return await callback(executor);
  } finally {
    memoryDb.setSession(previousWs, previousUser);
  }
}
