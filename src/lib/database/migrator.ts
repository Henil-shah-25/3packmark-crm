/**
 * JSON-to-PostgreSQL Data Migration Engine
 * Developster Hub CRM — Phase 5 Security Remediation
 * 
 * Supports:
 * - Dry-run validation (schema checks, orphaned FK detection, duplicates detection)
 * - Atomic transactional migration with rollback on error
 * - Deduplication via ON CONFLICT DO UPDATE
 * - Comprehensive migration audit logging
 */

import fs from 'fs';
import path from 'path';
import { buildInsertQuery, ParameterizedQuery } from './query-builder';
import { isPostgresConfigured, getPostgresPool } from './client';
import type { PoolClient } from 'pg';

export interface MigrationOptions {
  dryRun?: boolean;
  dataPath?: string;
  poolClient?: PoolClient;
  sourceFiles?: {
    crmStorage?: string;
    pulseStorage?: string;
    authRevocations?: string;
    authLockout?: string;
  };
}

export interface EntityMigrationStats {
  workspaces: number;
  users: number;
  memberships: number;
  pulseWebsites: number;
  pulseSessions: number;
  pulseEvents: number;
  sessionRevocations: number;
}

export interface MigrationValidationIssue {
  entity: string;
  id?: string;
  severity: 'error' | 'warning';
  message: string;
  details?: any;
}

export interface MigrationResult {
  success: boolean;
  dryRun: boolean;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  stats: EntityMigrationStats;
  issues: MigrationValidationIssue[];
  executedQueriesCount: number;
  rollbackPlan: string;
}

export class JsonToPostgresMigrator {
  private baseDataDir: string;

  constructor(baseDataDir?: string) {
    this.baseDataDir = baseDataDir || path.join(process.cwd(), 'data');
  }

  private loadJsonFile<T = any>(filePath: string): T | null {
    try {
      if (!fs.existsSync(filePath)) return null;
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  }

  /**
   * Performs migration validation (dry-run) or full data insertion.
   */
  async runMigration(options: MigrationOptions = {}): Promise<MigrationResult> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    const dryRun = options.dryRun ?? true;

    const crmPath = options.sourceFiles?.crmStorage || path.join(this.baseDataDir, 'crm-storage.json');
    const pulsePath = options.sourceFiles?.pulseStorage || path.join(this.baseDataDir, 'pulse-storage.json');
    const revocationsPath = options.sourceFiles?.authRevocations || path.join(this.baseDataDir, 'auth-revocations.json');

    const issues: MigrationValidationIssue[] = [];
    const stats: EntityMigrationStats = {
      workspaces: 0,
      users: 0,
      memberships: 0,
      pulseWebsites: 0,
      pulseSessions: 0,
      pulseEvents: 0,
      sessionRevocations: 0,
    };

    const plannedQueries: ParameterizedQuery[] = [];

    // 1. Process CRM Data (Workspaces, Members, Users)
    const crmData = this.loadJsonFile(crmPath);
    const validWorkspaceIds = new Set<string>();
    const seenUserEmails = new Set<string>();

    if (crmData) {
      // 1a. Workspaces
      const workspaces: any[] = Array.isArray(crmData.workspaces) ? crmData.workspaces : [];
      for (const ws of workspaces) {
        if (!ws.id || typeof ws.id !== 'string') {
          issues.push({ entity: 'workspaces', severity: 'error', message: 'Workspace missing valid id', details: ws });
          continue;
        }
        if (!ws.name || typeof ws.name !== 'string') {
          issues.push({ entity: 'workspaces', id: ws.id, severity: 'error', message: 'Workspace missing required name', details: ws });
          continue;
        }

        validWorkspaceIds.add(ws.id);
        stats.workspaces++;

        plannedQueries.push(
          buildInsertQuery('workspaces', {
            id: ws.id,
            name: ws.name,
            slug: ws.slug || ws.id,
            industry: ws.industry || 'Technology',
            currency: ws.currency || 'INR',
            timezone: ws.timezone || 'Asia/Kolkata',
            logo_url: ws.logoUrl || null,
            monthly_target: ws.monthlyTarget || 0,
            settings: JSON.stringify({
              companyName: ws.companyName,
              senderName: ws.senderName,
              senderEmail: ws.senderEmail,
              phone: ws.phone,
              website: ws.website,
              portfolioUrl: ws.portfolioUrl,
            }),
            created_at: ws.createdAt || new Date().toISOString(),
            updated_at: ws.updatedAt || new Date().toISOString(),
          })
        );
      }

      // 1b. Members -> Users & Memberships
      const members: any[] = Array.isArray(crmData.members) ? crmData.members : [];
      for (const m of members) {
        if (!m.id || !m.email) {
          issues.push({ entity: 'users', severity: 'error', message: 'Member missing id or email', details: m });
          continue;
        }

        const normalizedEmail = String(m.email).trim().toLowerCase();
        const wsId = m.workspaceId || 'ws-default';

        // Check orphaned foreign key
        if (!validWorkspaceIds.has(wsId) && wsId !== 'ws-default') {
          issues.push({
            entity: 'workspace_memberships',
            id: m.id,
            severity: 'warning',
            message: `Member references non-existent workspace ${wsId}`,
            details: { email: m.email, workspaceId: wsId },
          });
        }

        // Deduplicate central users by email
        if (!seenUserEmails.has(normalizedEmail)) {
          seenUserEmails.add(normalizedEmail);
          stats.users++;
          plannedQueries.push(
            buildInsertQuery('users', {
              id: m.id,
              email: normalizedEmail,
              password_hash: m.password || '',
              name: m.name || normalizedEmail.split('@')[0],
              phone: m.phone || null,
              is_master_admin: Boolean(m.isMasterAdmin),
              status: 'active',
              created_at: m.createdAt || new Date().toISOString(),
              updated_at: m.updatedAt || new Date().toISOString(),
            })
          );
        }

        // Workspace membership
        stats.memberships++;
        plannedQueries.push(
          buildInsertQuery('workspace_memberships', {
            id: `mem-${m.id}`,
            workspace_id: wsId,
            user_id: m.id,
            role: m.role || 'Member',
            department: m.department || null,
            assigned_pipeline_ids: JSON.stringify(m.assignedPipelineIds || []),
            status: 'active',
            created_at: m.createdAt || new Date().toISOString(),
            updated_at: m.updatedAt || new Date().toISOString(),
          })
        );
      }
    } else {
      issues.push({ entity: 'crm-storage', severity: 'warning', message: `CRM storage file not found at ${crmPath}` });
    }

    // 2. Process Pulse Data
    const pulseData = this.loadJsonFile(pulsePath);
    if (pulseData) {
      const websites: any[] = Array.isArray(pulseData.websites) ? pulseData.websites : [];
      const validWebsiteIds = new Set<string>();

      for (const site of websites) {
        if (!site.id || !site.workspaceId) {
          issues.push({ entity: 'pulse_websites', severity: 'error', message: 'Pulse website missing id or workspaceId', details: site });
          continue;
        }
        validWebsiteIds.add(site.id);
        stats.pulseWebsites++;

        plannedQueries.push(
          buildInsertQuery('pulse_websites', {
            id: site.id,
            workspace_id: site.workspaceId,
            domain: site.domain,
            name: site.name || site.domain,
            api_key: site.apiKey,
            status: site.status || 'active',
            tracking_config: JSON.stringify(site.trackingConfig || {}),
            created_at: site.createdAt || new Date().toISOString(),
            updated_at: site.updatedAt || new Date().toISOString(),
          })
        );
      }

      const sessions: any[] = Array.isArray(pulseData.sessions) ? pulseData.sessions : [];
      for (const sess of sessions) {
        if (!sess.id || !sess.websiteId) continue;
        stats.pulseSessions++;
        plannedQueries.push(
          buildInsertQuery('pulse_visitor_sessions', {
            id: sess.id,
            website_id: sess.websiteId,
            visitor_id: sess.visitorId || 'anon',
            first_seen_at: sess.firstSeenAt || new Date().toISOString(),
            last_seen_at: sess.lastSeenAt || new Date().toISOString(),
            session_count: sess.sessionCount || 1,
            total_duration_sec: sess.totalDurationSec || 0,
            traffic_source: sess.trafficSource || 'direct',
            ip_hash: sess.ipHash || null,
            country: sess.country || null,
            city: sess.city || null,
            device_type: sess.deviceType || 'unknown',
            browser: sess.browser || 'unknown',
            os: sess.os || 'unknown',
          })
        );
      }

      const events: any[] = Array.isArray(pulseData.events) ? pulseData.events : [];
      for (const evt of events) {
        if (!evt.id || !evt.websiteId) continue;
        stats.pulseEvents++;
        plannedQueries.push(
          buildInsertQuery('pulse_events', {
            id: evt.id,
            website_id: evt.websiteId,
            visitor_id: evt.visitorId || 'anon',
            session_id: evt.sessionId || null,
            event_type: evt.eventType || 'pageview',
            page_url: evt.pageUrl || '/',
            page_title: evt.pageTitle || null,
            event_data: JSON.stringify(evt.eventData || {}),
            timestamp: evt.timestamp || new Date().toISOString(),
          })
        );
      }
    }

    // 3. Process Session Revocations
    const revocationsData = this.loadJsonFile(revocationsPath);
    if (revocationsData && Array.isArray(revocationsData.revocations)) {
      for (const rev of revocationsData.revocations) {
        if (!rev.jti) continue;
        stats.sessionRevocations++;
        plannedQueries.push(
          buildInsertQuery('session_revocations', {
            jti: rev.jti,
            user_id: rev.userId || null,
            reason: rev.reason || 'logout',
            revoked_at: rev.revokedAt || new Date().toISOString(),
            expires_at: rev.expiresAt || new Date(Date.now() + 86400000).toISOString(),
          })
        );
      }
    }

    let executedQueriesCount = 0;

    // Real Execution vs Dry-Run Distinction (MED-02)
    if (!dryRun) {
      if (options.poolClient) {
        try {
          await options.poolClient.query('BEGIN');
          for (const q of plannedQueries) {
            await options.poolClient.query(q.text, q.values);
            executedQueriesCount++;
          }
          await options.poolClient.query('COMMIT');
        } catch (execErr: any) {
          try {
            await options.poolClient.query('ROLLBACK');
          } catch {}
          issues.push({
            entity: 'Execution',
            severity: 'error',
            message: `Migration transaction aborted: ${execErr.message}`,
          });
        }
      } else if (isPostgresConfigured()) {
        const pool = getPostgresPool();
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          for (const q of plannedQueries) {
            await client.query(q.text, q.values);
            executedQueriesCount++;
          }
          await client.query('COMMIT');
        } catch (execErr: any) {
          try {
            await client.query('ROLLBACK');
          } catch {}
          issues.push({
            entity: 'Execution',
            severity: 'error',
            message: `Migration transaction aborted: ${execErr.message}`,
          });
        } finally {
          client.release();
        }
      } else {
        issues.push({
          entity: 'Database',
          severity: 'error',
          message: 'Real migration execution requires an active PostgreSQL connection. Neither poolClient nor DATABASE_URL is configured.',
        });
      }
    }

    const hasFatalErrors = issues.some((i) => i.severity === 'error');
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTime;

    return {
      success: !hasFatalErrors,
      dryRun,
      startedAt,
      completedAt,
      durationMs,
      stats,
      issues,
      executedQueriesCount: dryRun ? 0 : executedQueriesCount,
      rollbackPlan: `
-- ROLLBACK PROCEDURE
-- To roll back this migration in emergency:
-- 1. Begin transaction: BEGIN;
-- 2. Truncate populated tables with cascade (or delete by migration marker):
--    TRUNCATE pulse_events, pulse_visitor_sessions, pulse_websites, 
--             session_revocations, workspace_memberships, users, workspaces CASCADE;
-- 3. Verify empty state: SELECT count(*) FROM workspaces;
-- 4. Revert application connection string to fallback or read-only mode.
-- 5. COMMIT;
      `.trim(),
    };
  }
}

