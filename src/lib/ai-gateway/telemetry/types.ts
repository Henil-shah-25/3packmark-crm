/**
 * DEVELOPSTER HUB CRM — CENTRAL AI GATEWAY
 * AI-03.5 Usage Metering & Diagnostic Telemetry Contracts
 *
 * Strict Architectural Boundary:
 * - Captures operational metrics (tokens, latency, outcome, agent attribution).
 * - NEVER captures raw user prompts, message content, CRM customer records, or API keys.
 * - Usage metering is decoupled from financial billing; no credit wallets or ledgers.
 */

export type AiTelemetryOutcome = 'success' | 'failure' | 'timeout' | 'rejected';

/**
 * Immutable telemetry event representing an AI gateway request lifecycle outcome.
 */
export interface AiTelemetryEvent {
  /** Unique telemetry event identifier (e.g. tel_1731750000_abc123) */
  id: string;
  /** Request correlation trace identifier */
  traceId: string;
  /** Authenticated workspace tenant identifier */
  workspaceId: string;
  /** Authenticated user identifier */
  userId: string;
  /** Registered CRM agent identifier (if dispatched to an agent) */
  agentId?: string;
  /** Task type (e.g. sales_chat, lead_coach, executive_briefing, workflow_generation) */
  taskType: string;
  /** Provider name (e.g. gemini) */
  provider: string;
  /** Model identifier (strictly approved, e.g. gemini-2.5-flash) */
  model: string;
  /** Prompt token count (null if unavailable or request rejected before dispatch) */
  promptTokens: number | null;
  /** Completion token count (null if unavailable or request rejected before dispatch) */
  completionTokens: number | null;
  /** Total token count (null if unavailable or request rejected before dispatch) */
  totalTokens: number | null;
  /** Total request duration / latency in milliseconds */
  durationMs: number;
  /** Final execution outcome */
  outcome: AiTelemetryOutcome;
  /** Machine-readable error code if failed or rejected */
  errorCode?: string;
  /** Sanitized error description (redacted of keys, tokens, PII) */
  errorMessage?: string;
  /** ISO-8601 timestamp when the event was recorded */
  timestamp: string;
  /** Version of agent prompt used (e.g. 1.0.0) */
  promptVersion?: string;
}

/**
 * Input payload for recording a telemetry event.
 */
export interface RecordTelemetryInput {
  traceId: string;
  workspaceId: string;
  userId: string;
  agentId?: string;
  taskType: string;
  provider: string;
  model: string;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  durationMs: number;
  outcome: AiTelemetryOutcome;
  errorCode?: string;
  errorMessage?: string;
  timestamp?: string;
  promptVersion?: string;
}

/**
 * Aggregated tenant metrics summary for usage analysis and COGS estimation.
 */
export interface AiTelemetryMetrics {
  workspaceId: string;
  totalRequests: number;
  successCount: number;
  failureCount: number;
  timeoutCount: number;
  rejectedCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  averageDurationMs: number;
  lastActiveAt: string | null;
}

/**
 * Replaceable Telemetry Service interface.
 * Allows transparent swapping from in-memory ring buffer to persistent storage in future phases.
 */
export interface IAiTelemetryService {
  recordEvent(input: RecordTelemetryInput): Promise<void> | void;
  getEvents(workspaceId: string, limit?: number): AiTelemetryEvent[];
  getAggregateMetrics(workspaceId: string): AiTelemetryMetrics;
  clearEvents(): void;
  getBufferSize(): number;
  getMaxBufferSize(): number;
}
