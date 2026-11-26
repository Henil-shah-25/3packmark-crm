/**
 * DEVELOPSTER HUB CRM — CENTRAL AI GATEWAY
 * Provider-Independent Types and Contracts
 *
 * Strict Architectural Boundary:
 * - Pure TypeScript interfaces and types only.
 * - Zero external provider SDK dependencies (no external AI provider imports).
 * - Multi-tenant, context-driven execution contracts.
 */

/**
 * Supported AI Task Categories
 */
export type AiTaskType =
  | 'sales_chat'
  | 'lead_coach'
  | 'executive_briefing'
  | 'workflow_generation'
  | 'summarization'
  | 'connection_probe';

/**
 * Standardized AI Agent / Persona Identifiers
 */
export type AiAgentId =
  | 'sales_intelligence_agent'
  | 'lead_diagnostic_agent'
  | 'executive_briefing_agent'
  | 'workflow_architect_agent'
  | 'system_probe_agent';

export type GatewayUserRole =
  | 'owner'
  | 'admin'
  | 'manager'
  | 'member'
  | 'read-only'
  | 'system';

/**
 * Trusted Server-Side Execution Context.
 * Must be derived from authenticated session tokens or internal system jobs.
 * Untrusted client payloads must NEVER be used to populate these fields.
 */
export interface TrustedExecutionContext {
  readonly workspaceId: string;
  readonly userId: string;
  readonly userRole: GatewayUserRole;
  readonly traceId: string;
  readonly clientIp?: string;
  readonly authenticatedAt?: number;
}

/**
 * Normalized Multi-Turn Chat Message
 */
export interface AiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
}

/**
 * Declarative Tool / Function Definition (JSON Schema standard)
 */
export interface AiToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema object
}

/**
 * Tool Invocation Call requested by the AI Model
 */
export interface AiToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Token Usage & Latency Metadata
 */
export interface AiUsageMetadata {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  durationMs: number;
}

/**
 * Normalized Gateway Request Envelope
 */
export interface AiGatewayRequest<TOutput = unknown> {
  taskType: AiTaskType;
  context: TrustedExecutionContext;
  agentId?: AiAgentId;
  prompt?: string;
  messages?: AiMessage[];
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
  tools?: AiToolDefinition[];
  responseSchema?: Record<string, unknown>; // Optional structured JSON output schema
  timeoutMs?: number;
  abortSignal?: AbortSignal;
  metadata?: Record<string, unknown>;
}

/**
 * Normalized Gateway Response Envelope
 */
export interface AiGatewayResponse<TOutput = unknown> {
  success: boolean;
  data: TOutput;
  text: string;
  agentId?: AiAgentId;
  toolCalls?: AiToolCall[];
  usage: AiUsageMetadata;
  model: string;
  provider: string;
  traceId: string;
  cached?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Model Capability Descriptor
 */
export interface ProviderCapability {
  streaming: boolean;
  toolCalling: boolean;
  structuredOutput: boolean;
  vision: boolean;
  maxContextTokens: number;
}
