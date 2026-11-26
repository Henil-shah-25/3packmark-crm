/**
 * DEVELOPSTER HUB CRM — CENTRAL AI GATEWAY
 * Gemini Provider Adapter Implementation
 *
 * Strict Architectural Boundary:
 * - Implements IAiProviderAdapter using the installed @google/genai SDK.
 * - Provider-specific SDK types are isolated strictly within this adapter.
 * - Uses ONLY Developster's platform-level process.env.GEMINI_API_KEY.
 * - Never uses workspace/customer API keys; no BYOK.
 * - Missing or empty API key fails closed with ProviderConfigurationError.
 * - Server-side only: prohibited from execution in browser/client environments.
 */

import { GoogleGenAI } from '@google/genai';
import {
  AiGatewayRequest,
  AiGatewayResponse,
  AiMessage,
  AiToolCall,
  ProviderCapability,
} from '../types';
import { GATEWAY_CONFIG, estimateProviderCost } from '../config';
import {
  AiGatewayError,
  ProviderConfigurationError,
  ProviderTimeoutError,
  ProviderCommunicationError,
  OutputValidationError,
  normalizeToGatewayError,
} from '../errors';
import { IAiProviderAdapter, ProviderHealthCheckResult } from './provider.interface';

// Ensure the adapter cannot be executed in client bundles
if (typeof window !== 'undefined') {
  throw new Error('GeminiProviderAdapter can only be executed in a server-side environment.');
}

export interface GeminiAdapterOptions {
  /**
   * Optional platform API key override (for testing or explicit injection).
   * In production, defaults strictly to process.env.GEMINI_API_KEY.
   */
  apiKey?: string;

  /**
   * Optional injected GoogleGenAI client instance (for unit testing without network I/O).
   */
  client?: GoogleGenAI;
}

/**
 * Universal Gemini Provider Adapter for Developster AI Gateway
 */
export class GeminiProviderAdapter implements IAiProviderAdapter {
  public readonly providerName = 'gemini';
  private client: GoogleGenAI | null = null;
  private isKeyConfigured: boolean = false;

  constructor(options?: GeminiAdapterOptions) {
    if (options?.client) {
      this.client = options.client;
      this.isKeyConfigured = true;
      return;
    }

    const key = this.resolvePlatformApiKey(options?.apiKey);
    if (key) {
      this.client = new GoogleGenAI({ apiKey: key });
      this.isKeyConfigured = true;
    } else {
      this.client = null;
      this.isKeyConfigured = false;
    }
  }

  /**
   * Resolves Developster's server-side platform Gemini API key.
   * Strictly ignores workspace credentials and forbids BYOK.
   */
  private resolvePlatformApiKey(explicitKey?: string): string {
    const rawKey = explicitKey || process.env.GEMINI_API_KEY || '';
    const cleanKey = rawKey.replace(/^["']|["']$/g, '').trim();
    return cleanKey;
  }

  /**
   * Returns model capabilities under the Gemini provider.
   */
  public getCapabilities(model: string = GATEWAY_CONFIG.defaultModel): ProviderCapability {
    return {
      streaming: true,
      toolCalling: true,
      structuredOutput: true,
      vision: true,
      maxContextTokens: model.includes('pro') ? 2_000_000 : 1_000_000,
    };
  }

  /**
   * Translates normalized gateway messages/prompts to Gemini contents format.
   */
  private formatContents(request: AiGatewayRequest): {
    contents: any;
    extractedSystemInstruction?: string;
  } {
    let extractedSystemInstruction: string | undefined = request.systemInstruction;

    if (Array.isArray(request.messages) && request.messages.length > 0) {
      const contentsList: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

      for (const msg of request.messages) {
        if (msg.role === 'system') {
          // Append system messages to system instruction
          extractedSystemInstruction = extractedSystemInstruction
            ? `${extractedSystemInstruction}\n\n${msg.content}`
            : msg.content;
        } else if (msg.role === 'assistant') {
          contentsList.push({
            role: 'model',
            parts: [{ text: msg.content }],
          });
        } else {
          // Both 'user' and 'tool' roles map to user content in standard chat turns
          contentsList.push({
            role: 'user',
            parts: [{ text: msg.content }],
          });
        }
      }

      if (contentsList.length > 0) {
        return { contents: contentsList, extractedSystemInstruction };
      }
    }

    // Default to plain prompt text if messages array is absent or empty
    return {
      contents: request.prompt || '',
      extractedSystemInstruction,
    };
  }

  /**
   * Builds the configuration object for GoogleGenAI.models.generateContent
   */
  private buildGenerationConfig(
    request: AiGatewayRequest,
    systemInstruction?: string,
    signal?: AbortSignal
  ): Record<string, any> {
    const config: Record<string, any> = {};

    if (systemInstruction && systemInstruction.trim().length > 0) {
      config.systemInstruction = systemInstruction.trim();
    }

    if (typeof request.temperature === 'number') {
      config.temperature = request.temperature;
    }

    if (typeof request.maxOutputTokens === 'number') {
      config.maxOutputTokens = request.maxOutputTokens;
    }

    // Structured JSON Output mapping
    if (request.responseSchema) {
      config.responseMimeType = 'application/json';
      config.responseSchema = request.responseSchema;
    }

    // Tools / Function declarations mapping
    if (Array.isArray(request.tools) && request.tools.length > 0) {
      config.tools = [
        {
          functionDeclarations: request.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ];
    }

    // Cancellation: pass AbortSignal where supported by SDK
    // NOTE: In @google/genai, AbortSignal is a client-side cancellation mechanism.
    const activeSignal = signal || request.abortSignal;
    if (activeSignal) {
      config.abortSignal = activeSignal;
    }

    return config;
  }

  /**
   * Executes a normalized gateway request via the GoogleGenAI SDK.
   */
  public async execute<TOutput = unknown>(
    request: AiGatewayRequest<TOutput>,
    model: string = GATEWAY_CONFIG.defaultModel,
    signal?: AbortSignal
  ): Promise<AiGatewayResponse<TOutput>> {
    const traceId = request?.context?.traceId;

    // Fail closed immediately if credentials are missing
    if (!this.client || !this.isKeyConfigured) {
      throw new ProviderConfigurationError(
        'Developster platform GEMINI_API_KEY is not configured or is empty. Configure GEMINI_API_KEY in server environment.',
        traceId
      );
    }

    // Check pre-execution abort
    if (signal?.aborted || request.abortSignal?.aborted) {
      throw new ProviderTimeoutError('Gemini request was aborted prior to execution', traceId);
    }

    const { contents, extractedSystemInstruction } = this.formatContents(request);
    const config = this.buildGenerationConfig(request, extractedSystemInstruction, signal);

    try {
      const response = await this.client.models.generateContent({
        model,
        contents,
        config,
      });

      return this.normalizeResponse<TOutput>(response, request, model, traceId);
    } catch (err: unknown) {
      throw this.mapProviderError(err, traceId, signal);
    }
  }

  /**
   * Normalizes raw Gemini response into standard AiGatewayResponse contract.
   */
  private normalizeResponse<TOutput>(
    response: any,
    request: AiGatewayRequest<TOutput>,
    model: string,
    traceId?: string
  ): AiGatewayResponse<TOutput> {
    const responseText = response?.text || '';

    // Handle completely empty responses
    const hasCandidates = Array.isArray(response?.candidates) && response.candidates.length > 0;
    if (!responseText && !hasCandidates) {
      throw new ProviderCommunicationError(
        'Gemini provider returned an empty or malformed response',
        true,
        traceId
      );
    }

    // Extract structured output data if JSON schema was requested
    let outputData: TOutput = undefined as unknown as TOutput;
    if (request.responseSchema) {
      if (!responseText || responseText.trim().length === 0) {
        throw new OutputValidationError(
          'Gemini model returned empty response when structured JSON was expected',
          traceId
        );
      }

      try {
        outputData = JSON.parse(responseText) as TOutput;
      } catch (parseErr: unknown) {
        throw new OutputValidationError(
          `Failed to parse structured JSON response from Gemini model: ${(parseErr as Error).message}`,
          traceId
        );
      }
    }

    // Extract declarative tool calls if present in candidate parts
    let toolCalls: AiToolCall[] | undefined;
    const parts = response?.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) {
      const calls: AiToolCall[] = [];
      for (const part of parts) {
        if (part?.functionCall) {
          calls.push({
            id: part.functionCall.id || part.functionCall.name,
            name: part.functionCall.name,
            arguments: part.functionCall.args || {},
          });
        }
      }
      if (calls.length > 0) {
        toolCalls = calls;
      }
    }

    // Extract token usage metadata from response
    const usageMetadata = response?.usageMetadata;
    const promptTokens = usageMetadata?.promptTokenCount || 0;
    const completionTokens = usageMetadata?.candidatesTokenCount || 0;
    const totalTokens = usageMetadata?.totalTokenCount || promptTokens + completionTokens;
    const estimatedCostUsd = estimateProviderCost(model, promptTokens, completionTokens);

    return {
      success: true,
      data: outputData,
      text: responseText,
      toolCalls,
      model: response?.modelVersion || model,
      provider: this.providerName,
      traceId: traceId || request?.context?.traceId || '',
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCostUsd,
        durationMs: 0, // Enriched by gateway orchestrator
      },
    };
  }

  /**
   * Maps Gemini SDK errors to the Central AI Gateway error hierarchy.
   */
  private mapProviderError(error: unknown, traceId?: string, signal?: AbortSignal): AiGatewayError {
    if (error instanceof AiGatewayError) {
      return error;
    }

    if (signal?.aborted) {
      return new ProviderTimeoutError('Gemini request was canceled via AbortSignal', traceId);
    }

    if (error instanceof Error) {
      const msg = error.message || '';
      const lowerMsg = msg.toLowerCase();

      // Timeout / Abort checks
      if (
        lowerMsg.includes('abort') ||
        lowerMsg.includes('timeout') ||
        lowerMsg.includes('timed out') ||
        error.name === 'AbortError'
      ) {
        return new ProviderTimeoutError('Gemini request timed out or was aborted by client', traceId);
      }

      // Authentication / Credential failures
      if (
        lowerMsg.includes('api_key_invalid') ||
        lowerMsg.includes('invalid api key') ||
        lowerMsg.includes('unauthenticated') ||
        lowerMsg.includes('permission_denied') ||
        lowerMsg.includes('api_key_service_blocked') ||
        msg.includes('401') ||
        msg.includes('403')
      ) {
        return new ProviderConfigurationError(
          'Gemini provider authentication failed. Verify server GEMINI_API_KEY configuration.',
          traceId
        );
      }

      // Rate limit / Quota exceeded
      if (
        lowerMsg.includes('resource_exhausted') ||
        lowerMsg.includes('quota') ||
        lowerMsg.includes('rate limit') ||
        msg.includes('429')
      ) {
        return new AiGatewayError(
          'Gemini API rate limit exceeded. Please retry after a brief delay.',
          'PROVIDER_COMMUNICATION_ERROR',
          429,
          true,
          traceId
        );
      }

      // Provider outage / 5xx
      if (
        lowerMsg.includes('unavailable') ||
        lowerMsg.includes('internal error') ||
        lowerMsg.includes('overloaded') ||
        msg.includes('500') ||
        msg.includes('503') ||
        msg.includes('502')
      ) {
        return new ProviderCommunicationError(
          'Gemini service temporarily unavailable or overloaded. Please retry.',
          true,
          traceId
        );
      }
    }

    return normalizeToGatewayError(error, traceId);
  }

  /**
   * Probes Gemini API connectivity with a lightweight ping.
   */
  public async healthCheck(signal?: AbortSignal): Promise<ProviderHealthCheckResult> {
    if (!this.client || !this.isKeyConfigured) {
      return {
        healthy: false,
        latencyMs: 0,
        provider: this.providerName,
        message: 'Developster platform GEMINI_API_KEY is not configured',
      };
    }

    const startTime = Date.now();

    try {
      const response = await this.client.models.generateContent({
        model: GATEWAY_CONFIG.defaultModel,
        contents: 'Respond with: PING_OK',
        config: {
          maxOutputTokens: 5,
          abortSignal: signal,
        },
      });

      const latencyMs = Date.now() - startTime;
      const text = response?.text || '';

      if (text.includes('PING') || text.length > 0) {
        return {
          healthy: true,
          latencyMs,
          provider: this.providerName,
        };
      }

      return {
        healthy: false,
        latencyMs,
        provider: this.providerName,
        message: 'Gemini health probe returned empty response',
      };
    } catch (err: unknown) {
      const mapped = this.mapProviderError(err, 'health-check', signal);
      return {
        healthy: false,
        latencyMs: Date.now() - startTime,
        provider: this.providerName,
        message: mapped.message,
      };
    }
  }
}

/**
 * Factory helper to instantiate the GeminiProviderAdapter.
 */
export function createGeminiAdapter(options?: GeminiAdapterOptions): GeminiProviderAdapter {
  return new GeminiProviderAdapter(options);
}
