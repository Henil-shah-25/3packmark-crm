/**
 * DEVELOPSTER HUB CRM — CENTRAL AI GATEWAY
 * Central Agent Registry & Prompt Architecture Types
 *
 * Strict Architectural Boundary:
 * - Pure TypeScript interfaces for registered AI agents and prompt management.
 * - Single approved model policy: strictly 'gemini-2.5-flash'.
 * - Mandatory role-based authorization for agent access.
 * - Centralized untrusted CRM data framing integration contracts.
 */

import {
  AiAgentId,
  AiTaskType,
  AiToolDefinition,
  GatewayUserRole,
} from '../types';

/**
 * Specification and metadata for a registered CRM AI agent.
 */
export interface AgentDefinition {
  /** Unique standardized agent identifier */
  readonly id: AiAgentId;

  /** Human-readable display name */
  readonly name: string;

  /** Semantic version of this agent's configuration and prompt */
  readonly version: string;

  /** Clear operational purpose and responsibilities */
  readonly purpose: string;

  /** Comprehensive, authoritative system instruction for this persona */
  readonly systemPrompt: string;

  /** Allowed task types this agent is authorized to handle */
  readonly allowedTaskTypes: readonly AiTaskType[];

  /** Roles authorized to invoke this agent */
  readonly allowedRoles: readonly GatewayUserRole[];

  /** Names of approved CRM tools available to this agent */
  readonly approvedTools: readonly string[];

  /** Optional JSON Schema specification for structured output tasks */
  readonly responseSchema?: Record<string, any>;

  /** Description of expected context inputs */
  readonly contextRequirements?: string[];
}

/**
 * Options for constructing a prompt via the central prompt builder.
 */
export interface PromptBuildOptions {
  /** Target agent persona */
  agentId: AiAgentId;

  /** Primary user instruction or query */
  userInput?: string;

  /**
   * Untrusted CRM data elements (notes, email bodies, call transcripts, customer records).
   * Automatically contained and sanitized within <untrusted_crm_context> tags.
   */
  untrustedCrmData?: Array<{
    source: string;
    content: string;
  }>;

  /** Optional trusted system-level context (e.g. current date, workspace settings) */
  trustedContext?: string;

  /** Optional custom system prompt append */
  systemPromptAppend?: string;
}

/**
 * Output of the central prompt builder ready for gateway dispatch.
 */
export interface BuiltAgentPrompt {
  /** Target agent persona identifier */
  readonly agentId: AiAgentId;

  /** Authoritative system instruction */
  readonly systemInstruction: string;

  /** Final assembled user prompt with framed untrusted data */
  readonly userPrompt: string;

  /** Pinned model identifier (strictly 'gemini-2.5-flash') */
  readonly model: 'gemini-2.5-flash';

  /** Output schema if defined for this agent */
  readonly responseSchema?: Record<string, any>;

  /** Version of the agent configuration used */
  readonly version: string;
}
