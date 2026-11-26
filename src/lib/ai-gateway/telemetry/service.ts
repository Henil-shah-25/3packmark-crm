/**
 * DEVELOPSTER HUB CRM — CENTRAL AI GATEWAY
 * AI-03.5 In-Memory Rolling Usage Telemetry Service
 *
 * Operational & Storage Notice:
 * - This in-memory telemetry service is process-local and is NOT durable or
 *   distributed across separate serverless instances or cold starts.
 * - Enforces bounded memory limits via FIFO eviction (default 1,000 events)
 *   to guarantee deterministic heap usage.
 * - Stores ZERO raw prompts, completion texts, customer notes, or credentials.
 * - Telemetry querying is strictly tenant-scoped (isolated by workspaceId).
 */

import {
  AiTelemetryEvent,
  RecordTelemetryInput,
  AiTelemetryMetrics,
  IAiTelemetryService,
} from './types';
import { sanitizeErrorMessage } from '../errors';

export const DEFAULT_TELEMETRY_BUFFER_SIZE = 1_000;

export class InMemoryTelemetryService implements IAiTelemetryService {
  private buffer: AiTelemetryEvent[] = [];
  private readonly maxBufferSize: number;

  constructor(options?: { maxBufferSize?: number }) {
    const size = options?.maxBufferSize;
    this.maxBufferSize = typeof size === 'number' && size > 0 ? Math.floor(size) : DEFAULT_TELEMETRY_BUFFER_SIZE;
  }

  /**
   * Records a telemetry event in the bounded in-memory ring buffer.
   * Sanitizes error messages and strips all sensitive data.
   */
  public recordEvent(input: RecordTelemetryInput): void {
    if (!input) return;

    // 1. Sanitize error message if present (scrubs API keys, bearer tokens, emails)
    const sanitizedError = input.errorMessage ? sanitizeErrorMessage(input.errorMessage) : undefined;

    // 2. Normalize and bounds-check token counts (do not invent tokens; preserve nulls when unrecorded)
    let promptTokens: number | null = null;
    let completionTokens: number | null = null;
    let totalTokens: number | null = null;

    if (input.outcome === 'success') {
      promptTokens = typeof input.promptTokens === 'number' && !isNaN(input.promptTokens) ? Math.max(0, input.promptTokens) : 0;
      completionTokens = typeof input.completionTokens === 'number' && !isNaN(input.completionTokens) ? Math.max(0, input.completionTokens) : 0;
      totalTokens = typeof input.totalTokens === 'number' && !isNaN(input.totalTokens)
        ? Math.max(0, input.totalTokens)
        : promptTokens + completionTokens;
    } else {
      // For rejections, timeouts, or pre-dispatch failures, provider token usage is strictly 0 or null
      promptTokens = typeof input.promptTokens === 'number' && !isNaN(input.promptTokens) && input.promptTokens > 0 ? input.promptTokens : 0;
      completionTokens = typeof input.completionTokens === 'number' && !isNaN(input.completionTokens) && input.completionTokens > 0 ? input.completionTokens : 0;
      totalTokens = typeof input.totalTokens === 'number' && !isNaN(input.totalTokens) && input.totalTokens > 0 ? input.totalTokens : 0;
    }

    const event: AiTelemetryEvent = {
      id: `tel_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      traceId: String(input.traceId || 'unknown-trace').trim(),
      workspaceId: String(input.workspaceId || 'unknown-workspace').trim(),
      userId: String(input.userId || 'unknown-user').trim(),
      agentId: input.agentId ? String(input.agentId).trim() : undefined,
      taskType: String(input.taskType || 'unknown-task').trim(),
      provider: String(input.provider || 'gemini').trim(),
      model: String(input.model || 'gemini-2.5-flash').trim(),
      promptTokens,
      completionTokens,
      totalTokens,
      durationMs: Math.max(0, Number(input.durationMs) || 0),
      outcome: input.outcome,
      errorCode: input.errorCode ? String(input.errorCode).trim() : undefined,
      errorMessage: sanitizedError,
      timestamp: input.timestamp || new Date().toISOString(),
      promptVersion: input.promptVersion ? String(input.promptVersion).trim() : undefined,
    };

    // 3. Enforce bounded ring buffer with FIFO eviction
    while (this.buffer.length >= this.maxBufferSize) {
      this.buffer.shift();
    }

    this.buffer.push(Object.freeze(event));
  }

  /**
   * Retrieves telemetry events strictly scoped to the specified tenant workspace.
   * Prevents cross-tenant observability leaks.
   */
  public getEvents(workspaceId: string, limit?: number): AiTelemetryEvent[] {
    if (!workspaceId || typeof workspaceId !== 'string' || workspaceId.trim().length === 0) {
      return [];
    }

    const cleanWorkspaceId = workspaceId.trim();
    const tenantEvents = this.buffer.filter((e) => e.workspaceId === cleanWorkspaceId);

    if (typeof limit === 'number' && limit > 0) {
      return tenantEvents.slice(-limit);
    }

    return [...tenantEvents];
  }

  /**
   * Computes aggregated usage statistics for a specific tenant workspace.
   */
  public getAggregateMetrics(workspaceId: string): AiTelemetryMetrics {
    const cleanWorkspaceId = typeof workspaceId === 'string' ? workspaceId.trim() : '';
    if (!cleanWorkspaceId) {
      return {
        workspaceId: '',
        totalRequests: 0,
        successCount: 0,
        failureCount: 0,
        timeoutCount: 0,
        rejectedCount: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        totalTokens: 0,
        averageDurationMs: 0,
        lastActiveAt: null,
      };
    }

    const events = this.buffer.filter((e) => e.workspaceId === cleanWorkspaceId);
    let successCount = 0;
    let failureCount = 0;
    let timeoutCount = 0;
    let rejectedCount = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokens = 0;
    let totalDurationMs = 0;
    let lastActiveAt: string | null = null;

    for (const e of events) {
      if (e.outcome === 'success') successCount++;
      else if (e.outcome === 'failure') failureCount++;
      else if (e.outcome === 'timeout') timeoutCount++;
      else if (e.outcome === 'rejected') rejectedCount++;

      totalPromptTokens += e.promptTokens || 0;
      totalCompletionTokens += e.completionTokens || 0;
      totalTokens += e.totalTokens || 0;
      totalDurationMs += e.durationMs;

      if (!lastActiveAt || e.timestamp > lastActiveAt) {
        lastActiveAt = e.timestamp;
      }
    }

    const totalRequests = events.length;
    const averageDurationMs = totalRequests > 0 ? Math.round(totalDurationMs / totalRequests) : 0;

    return {
      workspaceId: cleanWorkspaceId,
      totalRequests,
      successCount,
      failureCount,
      timeoutCount,
      rejectedCount,
      totalPromptTokens,
      totalCompletionTokens,
      totalTokens,
      averageDurationMs,
      lastActiveAt,
    };
  }

  /**
   * Clears in-memory buffer (primarily for test isolation and teardown).
   */
  public clearEvents(): void {
    this.buffer = [];
  }

  /**
   * Returns current count of stored telemetry events.
   */
  public getBufferSize(): number {
    return this.buffer.length;
  }

  /**
   * Returns maximum capacity of the telemetry buffer.
   */
  public getMaxBufferSize(): number {
    return this.maxBufferSize;
  }
}

// Global default telemetry singleton
export const telemetryService = new InMemoryTelemetryService();
