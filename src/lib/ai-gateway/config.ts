/**
 * DEVELOPSTER HUB CRM — CENTRAL AI GATEWAY
 * Central Configuration & Model Policies
 *
 * Strict Architectural Boundary:
 * - Centralizes approved model identifiers and timeout budgets.
 * - DOES NOT read or resolve GEMINI_API_KEY (Credential resolution belongs strictly to AI-03.2).
 * - Default model is strictly pinned to gemini-2.5-flash per founder decision.
 */

import { AiTaskType } from './types';

export interface ModelPricing {
  inputPricePerMillion: number;
  outputPricePerMillion: number;
}

export interface GatewayConfig {
  defaultProvider: 'gemini';
  defaultModel: string;
  supportedProviders: readonly string[];
  taskModelMap: Record<AiTaskType, string>;
  taskTimeoutMap: Record<AiTaskType, number>;
  pricing: Record<string, ModelPricing>;
  defaultTimeoutMs: number;
  maxTimeoutMs: number;
}

/**
 * Approved Central Gateway Configuration for Internal Testing
 */
export const GATEWAY_CONFIG: GatewayConfig = {
  defaultProvider: 'gemini',
  defaultModel: 'gemini-2.5-flash',
  supportedProviders: ['gemini'] as const,
  taskModelMap: {
    sales_chat: 'gemini-2.5-flash',
    lead_coach: 'gemini-2.5-flash',
    executive_briefing: 'gemini-2.5-flash',
    workflow_generation: 'gemini-2.5-flash',
    summarization: 'gemini-2.5-flash',
    connection_probe: 'gemini-2.5-flash',
  },
  taskTimeoutMap: {
    sales_chat: 20_000,
    lead_coach: 15_000,
    executive_briefing: 20_000,
    workflow_generation: 25_000,
    summarization: 15_000,
    connection_probe: 5_000,
  },
  pricing: {
    'gemini-2.5-flash': {
      inputPricePerMillion: 0.075,
      outputPricePerMillion: 0.30,
    },
  },
  defaultTimeoutMs: 15_000,
  maxTimeoutMs: 45_000,
};

/**
 * Resolve the approved model identifier for a specific task.
 */
export function resolveModelForTask(taskType: AiTaskType): string {
  return GATEWAY_CONFIG.taskModelMap[taskType] || GATEWAY_CONFIG.defaultModel;
}

/**
 * Resolve the default timeout for a specific task.
 */
export function resolveTimeoutForTask(taskType: AiTaskType, customTimeoutMs?: number): number {
  if (customTimeoutMs && customTimeoutMs > 0) {
    return Math.min(customTimeoutMs, GATEWAY_CONFIG.maxTimeoutMs);
  }
  return GATEWAY_CONFIG.taskTimeoutMap[taskType] || GATEWAY_CONFIG.defaultTimeoutMs;
}

/**
 * Calculates raw estimated provider cost in USD based on published token pricing.
 * Does NOT implement platform credits or billing conversion.
 */
export function estimateProviderCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const modelPricing = GATEWAY_CONFIG.pricing[model] || GATEWAY_CONFIG.pricing[GATEWAY_CONFIG.defaultModel];
  if (!modelPricing) return 0;

  const safeInput = Number.isFinite(Number(inputTokens)) ? Math.max(0, Number(inputTokens)) : 0;
  const safeOutput = Number.isFinite(Number(outputTokens)) ? Math.max(0, Number(outputTokens)) : 0;

  const inputCost = (safeInput / 1_000_000) * modelPricing.inputPricePerMillion;
  const outputCost = (safeOutput / 1_000_000) * modelPricing.outputPricePerMillion;
  const total = inputCost + outputCost;

  // Round to 6 decimal places for USD precision
  return Math.round(total * 1_000_000) / 1_000_000;
}

/**
 * Validates structural integrity of gateway configuration.
 */
export function validateGatewayConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!GATEWAY_CONFIG.defaultModel) {
    errors.push('GATEWAY_CONFIG.defaultModel must be set');
  }
  if (!GATEWAY_CONFIG.supportedProviders.includes(GATEWAY_CONFIG.defaultProvider)) {
    errors.push(`defaultProvider ${GATEWAY_CONFIG.defaultProvider} is not in supportedProviders`);
  }
  if (GATEWAY_CONFIG.defaultTimeoutMs <= 0) {
    errors.push('defaultTimeoutMs must be positive');
  }
  return { valid: errors.length === 0, errors };
}
