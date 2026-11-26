/**
 * Atomic Webhook Idempotency Store
 * Developster Hub CRM — Phase 5 Security Remediation
 * 
 * Manages:
 * - Durable PostgreSQL idempotency storage (webhook_deliveries table)
 * - Unique constraint protection: (workspace_id, provider, delivery_id)
 * - Atomic transitions between 'processing', 'completed', and 'failed' states
 * - Safe concurrent duplicate handling using PostgreSQL ON CONFLICT semantics
 * - Stale processing timeout recovery (> 5 minutes)
 * - In-memory adapter for local tests and offline dev mode
 */

import crypto from 'crypto';
import { isPostgresConfigured, getPostgresPool } from './client';

export type WebhookStatus = 'processing' | 'completed' | 'failed';

export interface WebhookDeliveryRecord {
  id: string;
  workspaceId: string;
  provider: 'shopify' | 'woocommerce' | 'generic';
  deliveryId: string;
  eventType: string;
  status: WebhookStatus;
  payloadHash: string;
  attemptCount: number;
  lastError?: string;
  createdAt: number;
  processedAt?: number;
}

export interface AcquireResult {
  acquired: boolean;
  isDuplicate: boolean;
  status?: WebhookStatus;
  message?: string;
}

export class AtomicWebhookIdempotencyStore {
  private memoryDeliveries: Map<string, WebhookDeliveryRecord> = new Map();

  private makeKey(workspaceId: string, provider: string, deliveryId: string): string {
    return `${workspaceId}:${provider}:${deliveryId}`;
  }

  /**
   * Atomically acquires execution rights for a webhook delivery.
   * In PostgreSQL: Uses atomic INSERT ... ON CONFLICT DO UPDATE with conditional logic.
   * In Memory: Uses atomic check-and-set.
   */
  async acquireDelivery(params: {
    workspaceId: string;
    provider: 'shopify' | 'woocommerce' | 'generic';
    deliveryId: string;
    eventType: string;
    rawPayload: string;
  }): Promise<AcquireResult> {
    const payloadHash = crypto.createHash('sha256').update(params.rawPayload).digest('hex');
    const now = Date.now();

    if (isPostgresConfigured()) {
      try {
        const pool = getPostgresPool();
        const id = `whd_${crypto.randomUUID()}`;

        // Atomic upsert with conditional state handling
        const queryText = `
          INSERT INTO webhook_deliveries (
            id, workspace_id, provider, delivery_id, event_type, status, payload_hash, attempt_count, created_at
          ) VALUES ($1, $2, $3, $4, $5, 'processing', $6, 1, NOW())
          ON CONFLICT (workspace_id, provider, delivery_id) DO UPDATE
            SET 
              status = CASE 
                WHEN webhook_deliveries.status = 'failed' THEN 'processing'
                WHEN webhook_deliveries.status = 'processing' AND webhook_deliveries.created_at < NOW() - INTERVAL '5 minutes' THEN 'processing'
                ELSE webhook_deliveries.status 
              END,
              attempt_count = CASE
                WHEN webhook_deliveries.status = 'failed' OR (webhook_deliveries.status = 'processing' AND webhook_deliveries.created_at < NOW() - INTERVAL '5 minutes')
                THEN webhook_deliveries.attempt_count + 1
                ELSE webhook_deliveries.attempt_count
              END,
              last_error = CASE
                WHEN webhook_deliveries.status = 'failed' THEN NULL
                ELSE webhook_deliveries.last_error
              END,
              created_at = CASE
                WHEN webhook_deliveries.status = 'failed' OR (webhook_deliveries.status = 'processing' AND webhook_deliveries.created_at < NOW() - INTERVAL '5 minutes')
                THEN NOW()
                ELSE webhook_deliveries.created_at
              END
          RETURNING id, status, attempt_count, (xmax = 0) AS is_new_insert;
        `;

        const res = await pool.query(queryText, [
          id,
          params.workspaceId,
          params.provider,
          params.deliveryId,
          params.eventType,
          payloadHash,
        ]);

        if (res.rows.length === 0) {
          return {
            acquired: false,
            isDuplicate: true,
            status: 'processing',
            message: `Delivery ${params.deliveryId} is currently locked`,
          };
        }

        const row = res.rows[0];
        const isNew = row.is_new_insert;
        const currentStatus = row.status as WebhookStatus;

        if (isNew) {
          return { acquired: true, isDuplicate: false, status: 'processing' };
        }

        if (currentStatus === 'completed') {
          return {
            acquired: false,
            isDuplicate: true,
            status: 'completed',
            message: `Delivery ${params.deliveryId} already completed for workspace ${params.workspaceId}`,
          };
        }

        // If it was reset to processing because of retry or stale processing
        if (currentStatus === 'processing' && row.attempt_count > 1) {
          return { acquired: true, isDuplicate: false, status: 'processing' };
        }

        // Still in active processing by another worker
        return {
          acquired: false,
          isDuplicate: true,
          status: 'processing',
          message: `Delivery ${params.deliveryId} is currently being processed by another worker`,
        };
      } catch (err: any) {
        console.error('[WebhookIdempotencyStore PostgreSQL Error]:', err.message);
        if (process.env.NODE_ENV === 'production') {
          throw new Error(`[WebhookIdempotencyStore Error]: Database failure during delivery acquisition: ${err.message}`);
        }
      }
    }

    // In-memory fallback for local tests and development
    const key = this.makeKey(params.workspaceId, params.provider, params.deliveryId);
    const existing = this.memoryDeliveries.get(key);

    if (existing) {
      if (existing.status === 'completed') {
        return {
          acquired: false,
          isDuplicate: true,
          status: 'completed',
          message: `Delivery ${params.deliveryId} already completed for workspace ${params.workspaceId}`,
        };
      }

      if (existing.status === 'processing') {
        const isStale = (now - existing.createdAt) > 300000;
        if (!isStale) {
          return {
            acquired: false,
            isDuplicate: true,
            status: 'processing',
            message: `Delivery ${params.deliveryId} is currently being processed by another worker`,
          };
        }
      }

      // If failed or stale: allow retry
      existing.status = 'processing';
      existing.attemptCount += 1;
      existing.createdAt = now;
      existing.payloadHash = payloadHash;
      return { acquired: true, isDuplicate: false, status: 'processing' };
    }

    // New delivery
    const newRecord: WebhookDeliveryRecord = {
      id: `whd_${crypto.randomUUID()}`,
      workspaceId: params.workspaceId,
      provider: params.provider,
      deliveryId: params.deliveryId,
      eventType: params.eventType,
      status: 'processing',
      payloadHash,
      attemptCount: 1,
      createdAt: now,
    };

    this.memoryDeliveries.set(key, newRecord);
    return { acquired: true, isDuplicate: false, status: 'processing' };
  }

  /**
   * Marks a delivery as successfully completed.
   */
  async completeDelivery(workspaceId: string, provider: string, deliveryId: string): Promise<void> {
    if (isPostgresConfigured()) {
      try {
        const pool = getPostgresPool();
        await pool.query(
          `UPDATE webhook_deliveries 
           SET status = 'completed', processed_at = NOW() 
           WHERE workspace_id = $1 AND provider = $2 AND delivery_id = $3`,
          [workspaceId, provider, deliveryId]
        );
      } catch (err: any) {
        console.error('[WebhookIdempotencyStore Error]: Failed to mark complete in PostgreSQL:', err.message);
      }
    }

    const key = this.makeKey(workspaceId, provider, deliveryId);
    const record = this.memoryDeliveries.get(key);
    if (record) {
      record.status = 'completed';
      record.processedAt = Date.now();
    }
  }

  /**
   * Convenience test & API wrapper
   */
  async checkAndRecord(params: {
    workspaceId: string;
    provider: 'shopify' | 'woocommerce' | 'generic';
    deliveryId: string;
    eventType?: string;
    rawPayload?: string;
  }): Promise<{ isDuplicate: boolean; status: WebhookStatus; message?: string }> {
    const res = await this.acquireDelivery({
      workspaceId: params.workspaceId,
      provider: params.provider,
      deliveryId: params.deliveryId,
      eventType: params.eventType || 'webhook',
      rawPayload: params.rawPayload || '{}',
    });
    return {
      isDuplicate: res.isDuplicate,
      status: res.status || 'processing',
      message: res.message,
    };
  }

  async markCompleted(workspaceId: string, provider: string, deliveryId: string, metadata?: any): Promise<void> {
    return this.completeDelivery(workspaceId, provider, deliveryId);
  }

  /**
   * Marks a delivery as failed, recording the error so future retries can be evaluated.
   */
  async failDelivery(workspaceId: string, provider: string, deliveryId: string, error: string): Promise<void> {
    if (isPostgresConfigured()) {
      try {
        const pool = getPostgresPool();
        await pool.query(
          `UPDATE webhook_deliveries 
           SET status = 'failed', last_error = $4, processed_at = NOW() 
           WHERE workspace_id = $1 AND provider = $2 AND delivery_id = $3`,
          [workspaceId, provider, deliveryId, error]
        );
      } catch (err: any) {
        console.error('[WebhookIdempotencyStore Error]: Failed to mark failed in PostgreSQL:', err.message);
      }
    }

    const key = this.makeKey(workspaceId, provider, deliveryId);
    const record = this.memoryDeliveries.get(key);
    if (record) {
      record.status = 'failed';
      record.lastError = error;
      record.processedAt = Date.now();
    }
  }

  /**
   * Returns current delivery record if exists.
   */
  async getDelivery(workspaceId: string, provider: string, deliveryId: string): Promise<WebhookDeliveryRecord | null> {
    if (isPostgresConfigured()) {
      try {
        const pool = getPostgresPool();
        const res = await pool.query(
          `SELECT id, workspace_id, provider, delivery_id, event_type, status, payload_hash, attempt_count, last_error, created_at, processed_at
           FROM webhook_deliveries 
           WHERE workspace_id = $1 AND provider = $2 AND delivery_id = $3`,
          [workspaceId, provider, deliveryId]
        );
        if (res.rows.length > 0) {
          const row = res.rows[0];
          return {
            id: row.id,
            workspaceId: row.workspace_id,
            provider: row.provider,
            deliveryId: row.delivery_id,
            eventType: row.event_type,
            status: row.status,
            payloadHash: row.payload_hash,
            attemptCount: row.attempt_count,
            lastError: row.last_error,
            createdAt: new Date(row.created_at).getTime(),
            processedAt: row.processed_at ? new Date(row.processed_at).getTime() : undefined,
          };
        }
      } catch (err: any) {
        console.error('[WebhookIdempotencyStore Error]: Lookup failed:', err.message);
      }
    }

    const key = this.makeKey(workspaceId, provider, deliveryId);
    return this.memoryDeliveries.get(key) || null;
  }

  clear() {
    this.memoryDeliveries.clear();
  }
}

export const webhookIdempotencyStore = new AtomicWebhookIdempotencyStore();
