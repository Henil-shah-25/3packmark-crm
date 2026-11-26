/**
 * DEVELOPSTER HUB CRM — CENTRAL AI GATEWAY
 * Provider-Independent Adapter Interface
 *
 * Strict Architectural Boundary:
 * - Pure abstraction isolating the Gateway orchestrator from provider SDKs.
 * - Zero external or third-party provider SDK dependencies.
 */

import { AiGatewayRequest, AiGatewayResponse, ProviderCapability } from '../types';

export interface ProviderHealthCheckResult {
  healthy: boolean;
  latencyMs: number;
  message?: string;
  provider: string;
}

/**
 * Universal Provider Adapter Contract.
 * Every provider integration (Gemini in AI-03.2, future providers) must implement this interface.
 */
export interface IAiProviderAdapter {
  /**
   * Unique provider identifier (e.g. 'gemini', 'mock')
   */
  readonly providerName: string;

  /**
   * Returns capabilities supported by the specified model under this provider.
   */
  getCapabilities(model: string): ProviderCapability;

  /**
   * Executes a normalized AI gateway request against the provider.
   *
   * @param request Normalized gateway request with trusted context.
   * @param model Target model identifier to execute.
   * @param signal Optional AbortSignal for request cancellation and timeout enforcement.
   * @returns Normalized AI gateway response with usage metadata.
   */
  execute<TOutput = unknown>(
    request: AiGatewayRequest<TOutput>,
    model: string,
    signal?: AbortSignal
  ): Promise<AiGatewayResponse<TOutput>>;

  /**
   * Diagnostic health check probing provider connectivity and latency.
   *
   * @param signal Optional AbortSignal for health check timeout.
   */
  healthCheck(signal?: AbortSignal): Promise<ProviderHealthCheckResult>;
}
