/**
 * DEVELOPSTER HUB CRM — CENTRAL AI GATEWAY
 * Foundation Orchestrator & Dependency Injection Engine
 *
 * Strict Architectural Boundary:
 * - Provider-independent orchestrator enforcing execution context validation,
 *   timeout budgets, request tracing, and error normalization.
 * - Zero direct Gemini SDK communication (dispatches exclusively via IAiProviderAdapter).
 * - Does NOT create fake successful AI responses in production code.
 * - If no provider adapter is configured, fails closed with ProviderConfigurationError.
 */

import {
  AiGatewayRequest,
  AiGatewayResponse,
  AiToolCall,
  TrustedExecutionContext,
} from './types';
import {
  GATEWAY_CONFIG,
  resolveModelForTask,
  resolveTimeoutForTask,
  estimateProviderCost,
} from './config';
import {
  AiGatewayError,
  GatewayValidationError,
  ContextAuthorizationError,
  ProviderConfigurationError,
  ProviderTimeoutError,
  normalizeToGatewayError,
} from './errors';
import { IAiProviderAdapter, ProviderHealthCheckResult } from './adapters/provider.interface';
import { createGeminiAdapter, GeminiProviderAdapter } from './adapters/gemini-adapter';
import {
  validateExecutionContextSecurity,
  createImmutableExecutionContext,
  validateRequestSecurity,
  enforceAiGatewayRateLimits,
  validateProposedToolCall,
  sanitizeProposedToolCall,
} from './guardrails';
import { agentRegistry } from './agents';
import {
  telemetryService,
  IAiTelemetryService,
  AiTelemetryOutcome,
  RecordTelemetryInput,
} from './telemetry';

export * from './types';
export * from './config';
export * from './errors';
export * from './adapters/provider.interface';
export * from './adapters/gemini-adapter';
export * from './guardrails';
export * from './agents';
export * from './telemetry';

export class AiGatewayService {
  private adapters: Map<string, IAiProviderAdapter>;
  private telemetry: IAiTelemetryService;

  constructor(initialAdapters?: IAiProviderAdapter[], telemetry?: IAiTelemetryService) {
    this.adapters = new Map();
    this.telemetry = telemetry || telemetryService;
    if (initialAdapters) {
      for (const adapter of initialAdapters) {
        this.registerAdapter(adapter);
      }
    }
  }

  /**
   * Retrieves the active usage telemetry service.
   */
  public getTelemetryService(): IAiTelemetryService {
    return this.telemetry;
  }

  /**
   * Swaps the active usage telemetry service (Dependency Injection).
   */
  public setTelemetryService(service: IAiTelemetryService): void {
    if (service) {
      this.telemetry = service;
    }
  }

  /**
   * Safely dispatches event to telemetry without allowing telemetry errors to crash AI requests.
   */
  private safeRecordTelemetry(input: RecordTelemetryInput): void {
    try {
      this.telemetry.recordEvent(input);
    } catch (err: unknown) {
      // Telemetry failures must NEVER crash or block the AI execution path
      console.warn('[AI Gateway Telemetry Warning] Failed to record usage telemetry:', err);
    }
  }

  /**
   * Registers a provider adapter (Dependency Injection).
   */
  public registerAdapter(adapter: IAiProviderAdapter): void {
    if (!adapter || !adapter.providerName) {
      throw new GatewayValidationError('Cannot register adapter: invalid adapter instance');
    }
    this.adapters.set(adapter.providerName.toLowerCase(), adapter);
  }

  /**
   * Clears all registered adapters (primarily for test teardown).
   */
  public clearAdapters(): void {
    this.adapters.clear();
  }

  /**
   * Checks whether a provider adapter is registered.
   */
  public hasAdapter(providerName: string): boolean {
    return this.adapters.has(providerName.toLowerCase());
  }

  /**
   * Validates trusted execution context.
   * Rejects requests missing workspaceId, userId, traceId, or having invalid userRole.
   */
  private validateExecutionContext(context: TrustedExecutionContext): void {
    validateExecutionContextSecurity(context);
  }

  /**
   * Validates incoming request structure and security bounds.
   */
  private validateRequestStructure<TOutput>(
    request: AiGatewayRequest<TOutput>,
    model?: string
  ): void {
    validateRequestSecurity(request as AiGatewayRequest, model);
  }

  /**
   * Executes a normalized AI request through the registered provider adapter.
   */
  public async execute<TOutput = unknown>(
    request: AiGatewayRequest<TOutput>
  ): Promise<AiGatewayResponse<TOutput>> {
    const startTime = Date.now();
    const traceId = request?.context?.traceId;
    let resolvedModel: string = 'gemini-2.5-flash';
    let resolvedProvider: string = GATEWAY_CONFIG.defaultProvider;
    let resolvedPromptVersion: string | undefined;
    let providerDispatched = false;

    try {
      // 1. Enforce trusted server-side execution context & make immutable
      this.validateExecutionContext(request?.context);
      const immutableContext = createImmutableExecutionContext(request.context);
      const secureRequest: AiGatewayRequest<TOutput> = {
        ...request,
        context: immutableContext,
      };

      // 2. Validate agent and task authorization if agentId is supplied
      if (secureRequest.agentId) {
        const agent = agentRegistry.validateAgentTask(
          secureRequest.agentId,
          secureRequest.taskType,
          immutableContext.userRole
        );
        resolvedPromptVersion = agent.version;
        if (!secureRequest.systemInstruction) {
          secureRequest.systemInstruction = agent.systemPrompt;
        }
        if (!secureRequest.responseSchema && agent.responseSchema) {
          secureRequest.responseSchema = agent.responseSchema;
        }
      }

      // 3. Resolve approved model for the specified task
      const model = resolveModelForTask(secureRequest.taskType);
      resolvedModel = model;

      // 4. Validate request structure and security limits
      this.validateRequestStructure(secureRequest, model);

      // 5. Enforce tenant-isolated and user-isolated rate limits
      await enforceAiGatewayRateLimits(immutableContext);

      // 6. Resolve target provider and adapter
      const providerName = GATEWAY_CONFIG.defaultProvider;
      const adapter = this.adapters.get(providerName.toLowerCase());

      if (!adapter) {
        throw new ProviderConfigurationError(
          `AI provider adapter '${providerName}' is not configured or registered`,
          traceId
        );
      }
      resolvedProvider = adapter.providerName;

      // 7. Setup timeout and cancellation signal
      const timeoutMs = resolveTimeoutForTask(secureRequest.taskType, secureRequest.timeoutMs);
      const abortController = new AbortController();

      // Chain external abortSignal if supplied
      let externalSignalListener: (() => void) | undefined;
      if (secureRequest.abortSignal) {
        if (secureRequest.abortSignal.aborted) {
          throw new ProviderTimeoutError('Request was aborted prior to execution', traceId);
        }
        externalSignalListener = () => abortController.abort();
        secureRequest.abortSignal.addEventListener('abort', externalSignalListener);
      }

      let timeoutTimer: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutTimer = setTimeout(() => {
          abortController.abort();
          reject(new ProviderTimeoutError(`AI provider request exceeded timeout of ${timeoutMs}ms`, traceId));
        }, timeoutMs);
      });

      try {
        providerDispatched = true;

        // Race adapter execution against timeout
        const response = await Promise.race([
          adapter.execute<TOutput>(secureRequest, model, abortController.signal),
          timeoutPromise,
        ]);

        const durationMs = Date.now() - startTime;

        // 7. Validate and sanitize proposed tool calls against server-side authorization
        if (Array.isArray(response.toolCalls) && response.toolCalls.length > 0) {
          const sanitizedCalls: AiToolCall[] = [];
          for (const call of response.toolCalls) {
            validateProposedToolCall(call, immutableContext.userRole);
            sanitizedCalls.push(sanitizeProposedToolCall(call, immutableContext));
          }
          response.toolCalls = sanitizedCalls;
        }

        // 8. Enrich and normalize usage and cost metadata
        const promptTokens = response.usage?.promptTokens || 0;
        const completionTokens = response.usage?.completionTokens || 0;
        const totalTokens = response.usage?.totalTokens || promptTokens + completionTokens;
        const estimatedCostUsd =
          response.usage?.estimatedCostUsd ||
          estimateProviderCost(model, promptTokens, completionTokens);

        // 9. Record successful usage telemetry
        this.safeRecordTelemetry({
          traceId: traceId || response.traceId || 'unknown-trace',
          workspaceId: immutableContext.workspaceId,
          userId: immutableContext.userId,
          agentId: secureRequest.agentId,
          taskType: secureRequest.taskType,
          provider: response.provider || adapter.providerName,
          model: response.model || model,
          promptTokens,
          completionTokens,
          totalTokens,
          durationMs,
          outcome: 'success',
          promptVersion: resolvedPromptVersion,
        });

        return {
          ...response,
          agentId: secureRequest.agentId,
          traceId: traceId || response.traceId,
          model: response.model || model,
          provider: response.provider || adapter.providerName,
          usage: {
            promptTokens,
            completionTokens,
            totalTokens,
            estimatedCostUsd,
            durationMs: response.usage?.durationMs || durationMs,
          },
        };
      } finally {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (secureRequest.abortSignal && externalSignalListener) {
          secureRequest.abortSignal.removeEventListener('abort', externalSignalListener);
        }
      }
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const normalized = normalizeToGatewayError(err, traceId);

      let outcome: AiTelemetryOutcome = 'failure';
      if (normalized instanceof ProviderTimeoutError || normalized.code === 'PROVIDER_TIMEOUT_ERROR') {
        outcome = 'timeout';
      } else if (
        !providerDispatched ||
        normalized instanceof GatewayValidationError ||
        normalized instanceof ContextAuthorizationError ||
        normalized.code === 'GATEWAY_VALIDATION_ERROR' ||
        normalized.code === 'CONTEXT_AUTHORIZATION_ERROR' ||
        normalized.status === 400 ||
        normalized.status === 401 ||
        normalized.status === 403 ||
        (normalized.status === 429 && !providerDispatched)
      ) {
        outcome = 'rejected';
      }

      this.safeRecordTelemetry({
        traceId: traceId || 'unknown-trace',
        workspaceId: request?.context?.workspaceId || 'unknown-workspace',
        userId: request?.context?.userId || 'unknown-user',
        agentId: request?.agentId,
        taskType: request?.taskType || 'unknown-task',
        provider: resolvedProvider,
        model: resolvedModel,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        durationMs,
        outcome,
        errorCode: normalized.code,
        errorMessage: normalized.message,
        promptVersion: resolvedPromptVersion,
      });

      throw normalized;
    }
  }

  /**
   * Diagnostic health check probing provider connectivity.
   */
  public async healthCheck(providerName: string = GATEWAY_CONFIG.defaultProvider): Promise<ProviderHealthCheckResult> {
    const adapter = this.adapters.get(providerName.toLowerCase());
    if (!adapter) {
      return {
        healthy: false,
        latencyMs: 0,
        provider: providerName,
        message: `Provider adapter '${providerName}' is not registered`,
      };
    }

    try {
      return await adapter.healthCheck();
    } catch (err: unknown) {
      const normalized = normalizeToGatewayError(err);
      return {
        healthy: false,
        latencyMs: 0,
        provider: providerName,
        message: normalized.message,
      };
    }
  }
}

// Global Gateway Singleton initialized with the official Gemini adapter
export const aiGateway = new AiGatewayService([createGeminiAdapter()]);
