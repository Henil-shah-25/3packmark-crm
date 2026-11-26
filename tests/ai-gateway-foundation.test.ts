/**
 * DEVELOPSTER HUB CRM — CENTRAL AI GATEWAY
 * AI-03.1 Foundation & Contracts Unit Tests
 *
 * Verifies provider-independent gateway foundation using test doubles.
 * Strictly ZERO external network calls or Gemini SDK dependencies.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  AiGatewayService,
  IAiProviderAdapter,
  AiGatewayRequest,
  AiGatewayResponse,
  ProviderCapability,
  ProviderHealthCheckResult,
  GATEWAY_CONFIG,
  resolveModelForTask,
  resolveTimeoutForTask,
  estimateProviderCost,
  validateGatewayConfig,
  AiGatewayError,
  GatewayValidationError,
  ContextAuthorizationError,
  ProviderConfigurationError,
  ProviderTimeoutError,
  ProviderCommunicationError,
  normalizeToGatewayError,
} from '../src/lib/ai-gateway/index.ts';

// Test double for IAiProviderAdapter
class MockProviderAdapter implements IAiProviderAdapter {
  public readonly providerName = 'gemini';
  public lastReceivedRequest?: AiGatewayRequest<any>;
  public lastReceivedModel?: string;
  public delayMs: number = 0;
  public shouldFail: boolean = false;
  public failureError?: Error;
  public mockResponseText: string = 'Mock AI Response Text';
  public mockOutputData: any = { status: 'success', summary: 'Mock assessment' };

  getCapabilities(_model: string): ProviderCapability {
    return {
      streaming: false,
      toolCalling: true,
      structuredOutput: true,
      vision: false,
      maxContextTokens: 1_000_000,
    };
  }

  async execute<TOutput = unknown>(
    request: AiGatewayRequest<TOutput>,
    model: string,
    signal?: AbortSignal
  ): Promise<AiGatewayResponse<TOutput>> {
    this.lastReceivedRequest = request;
    this.lastReceivedModel = model;

    if (this.delayMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, this.delayMs);
        if (signal) {
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new Error('Operation aborted by signal'));
          });
        }
      });
    }

    if (signal?.aborted) {
      throw new Error('Operation aborted by signal');
    }

    if (this.shouldFail) {
      throw this.failureError || new Error('Simulated upstream provider failure');
    }

    return {
      success: true,
      data: this.mockOutputData as TOutput,
      text: this.mockResponseText,
      model,
      provider: this.providerName,
      traceId: request.context.traceId,
      usage: {
        promptTokens: 150,
        completionTokens: 50,
        totalTokens: 200,
        estimatedCostUsd: 0.000026,
        durationMs: 12,
      },
    };
  }

  async healthCheck(signal?: AbortSignal): Promise<ProviderHealthCheckResult> {
    if (signal?.aborted) {
      return { healthy: false, latencyMs: 0, provider: this.providerName, message: 'Aborted' };
    }
    return { healthy: true, latencyMs: 15, provider: this.providerName };
  }
}

describe('Central AI Gateway Foundation Tests (AI-03.1)', { concurrency: 1 }, () => {
  let gateway: AiGatewayService;
  let mockAdapter: MockProviderAdapter;

  beforeEach(() => {
    gateway = new AiGatewayService();
    mockAdapter = new MockProviderAdapter();
  });

  // TEST 1: Valid request accepted
  test('1. Valid request accepted and dispatched to registered adapter', async () => {
    gateway.registerAdapter(mockAdapter);

    const request: AiGatewayRequest = {
      taskType: 'sales_chat',
      prompt: 'Hello, what deals need attention today?',
      context: {
        workspaceId: 'ws-test-100',
        userId: 'usr-agent-01',
        userRole: 'member',
        traceId: 'trace-req-001',
      },
    };

    const response = await gateway.execute(request);

    assert.equal(response.success, true);
    assert.equal(response.text, 'Mock AI Response Text');
    assert.equal(response.traceId, 'trace-req-001');
    assert.equal(response.model, 'gemini-2.5-flash');
    assert.equal(response.provider, 'gemini');
    assert.ok(response.usage.durationMs >= 0);
    assert.ok(response.usage.estimatedCostUsd > 0);
  });

  // TEST 2: Invalid request rejected
  test('2. Invalid request rejected when prompt and messages are both missing', async () => {
    gateway.registerAdapter(mockAdapter);

    const invalidRequest = {
      taskType: 'sales_chat',
      context: {
        workspaceId: 'ws-test-100',
        userId: 'usr-agent-01',
        userRole: 'member',
        traceId: 'trace-req-002',
      },
    } as AiGatewayRequest;

    await assert.rejects(
      async () => {
        await gateway.execute(invalidRequest);
      },
      (err: any) => {
        assert.ok(err instanceof GatewayValidationError);
        assert.equal(err.code, 'GATEWAY_VALIDATION_ERROR');
        assert.equal(err.status, 400);
        return true;
      }
    );
  });

  // TEST 3: Missing trusted context rejected
  test('3. Missing trusted execution context rejected with 401 ContextAuthorizationError', async () => {
    gateway.registerAdapter(mockAdapter);

    // Missing context entirely
    await assert.rejects(
      async () => {
        await gateway.execute({
          taskType: 'sales_chat',
          prompt: 'Hello',
        } as any);
      },
      (err: any) => {
        assert.ok(err instanceof ContextAuthorizationError);
        assert.equal(err.code, 'CONTEXT_AUTHORIZATION_ERROR');
        assert.equal(err.status, 401);
        return true;
      }
    );

    // Missing workspaceId
    await assert.rejects(
      async () => {
        await gateway.execute({
          taskType: 'sales_chat',
          prompt: 'Hello',
          context: {
            workspaceId: '',
            userId: 'usr-1',
            userRole: 'member',
            traceId: 'tr-1',
          },
        });
      },
      (err: any) => {
        assert.ok(err instanceof ContextAuthorizationError);
        assert.match(err.message, /workspaceId is required/i);
        return true;
      }
    );

    // Missing userId
    await assert.rejects(
      async () => {
        await gateway.execute({
          taskType: 'sales_chat',
          prompt: 'Hello',
          context: {
            workspaceId: 'ws-1',
            userId: '',
            userRole: 'member',
            traceId: 'tr-1',
          },
        });
      },
      (err: any) => {
        assert.ok(err instanceof ContextAuthorizationError);
        assert.match(err.message, /userId is required/i);
        return true;
      }
    );
  });

  // TEST 4: Workspace context propagated correctly
  test('4. Workspace context propagated correctly to provider adapter without mutation', async () => {
    gateway.registerAdapter(mockAdapter);

    const request: AiGatewayRequest = {
      taskType: 'lead_coach',
      prompt: 'Review deal status',
      context: {
        workspaceId: 'ws-enterprise-tenant-99',
        userId: 'usr-rep-44',
        userRole: 'owner',
        traceId: 'trace-ws-propagation',
      },
    };

    await gateway.execute(request);

    assert.ok(mockAdapter.lastReceivedRequest);
    assert.equal(
      mockAdapter.lastReceivedRequest.context.workspaceId,
      'ws-enterprise-tenant-99',
      'Workspace ID must be preserved exactly'
    );
  });

  // TEST 5: User context propagated correctly
  test('5. User context (userId and userRole) propagated correctly', async () => {
    gateway.registerAdapter(mockAdapter);

    const request: AiGatewayRequest = {
      taskType: 'executive_briefing',
      prompt: 'Generate daily pipeline summary',
      context: {
        workspaceId: 'ws-org-88',
        userId: 'usr-admin-director',
        userRole: 'admin',
        traceId: 'trace-user-propagation',
      },
    };

    await gateway.execute(request);

    assert.ok(mockAdapter.lastReceivedRequest);
    assert.equal(mockAdapter.lastReceivedRequest.context.userId, 'usr-admin-director');
    assert.equal(mockAdapter.lastReceivedRequest.context.userRole, 'admin');
  });

  // TEST 6: Provider adapter receives the normalized request
  test('6. Provider adapter receives normalized request and resolved model', async () => {
    gateway.registerAdapter(mockAdapter);

    const request: AiGatewayRequest = {
      taskType: 'workflow_generation',
      messages: [{ role: 'user', content: 'Create a drip campaign on stage change' }],
      context: {
        workspaceId: 'ws-wf-01',
        userId: 'usr-eng-02',
        userRole: 'admin',
        traceId: 'trace-wf-001',
      },
    };

    await gateway.execute(request);

    assert.ok(mockAdapter.lastReceivedRequest);
    assert.equal(mockAdapter.lastReceivedRequest.taskType, 'workflow_generation');
    assert.equal(mockAdapter.lastReceivedModel, 'gemini-2.5-flash');
    assert.equal(mockAdapter.lastReceivedRequest.messages?.length, 1);
  });

  // TEST 7: Provider response normalized correctly
  test('7. Provider response normalized with text, data, usage, and traceId', async () => {
    gateway.registerAdapter(mockAdapter);

    const request: AiGatewayRequest = {
      taskType: 'sales_chat',
      prompt: 'What deals need attention?',
      context: {
        workspaceId: 'ws-norm-test',
        userId: 'usr-norm-test',
        userRole: 'member',
        traceId: 'trace-normalized-response',
      },
    };

    const response = await gateway.execute(request);

    assert.equal(response.success, true);
    assert.equal(response.text, 'Mock AI Response Text');
    assert.deepEqual(response.data, { status: 'success', summary: 'Mock assessment' });
    assert.equal(response.traceId, 'trace-normalized-response');
    assert.equal(response.usage.promptTokens, 150);
    assert.equal(response.usage.completionTokens, 50);
    assert.equal(response.usage.totalTokens, 200);
  });

  // TEST 8: Provider errors mapped safely
  test('8. Provider errors mapped safely into normalized AiGatewayError hierarchy', async () => {
    gateway.registerAdapter(mockAdapter);
    mockAdapter.shouldFail = true;
    mockAdapter.failureError = new Error('503 Service Unavailable: upstream overloaded');

    const request: AiGatewayRequest = {
      taskType: 'sales_chat',
      prompt: 'Test provider failure',
      context: {
        workspaceId: 'ws-err-test',
        userId: 'usr-err-test',
        userRole: 'member',
        traceId: 'trace-upstream-failure',
      },
    };

    await assert.rejects(
      async () => {
        await gateway.execute(request);
      },
      (err: any) => {
        assert.ok(err instanceof AiGatewayError);
        assert.equal(err.code, 'PROVIDER_COMMUNICATION_ERROR');
        assert.equal(err.status, 502);
        assert.equal(err.traceId, 'trace-upstream-failure');
        return true;
      }
    );
  });

  // TEST 9: Timeout / cancellation handled correctly
  test('9. Timeout and AbortSignal cancellation handled correctly with ProviderTimeoutError', async () => {
    gateway.registerAdapter(mockAdapter);
    mockAdapter.delayMs = 200; // Adapter delays 200ms

    // Scenario A: Gateway timeout enforcement
    const timeoutRequest: AiGatewayRequest = {
      taskType: 'sales_chat',
      prompt: 'Slow call',
      timeoutMs: 50, // Limit to 50ms
      context: {
        workspaceId: 'ws-timeout-test',
        userId: 'usr-timeout-test',
        userRole: 'member',
        traceId: 'trace-timeout-enforced',
      },
    };

    await assert.rejects(
      async () => {
        await gateway.execute(timeoutRequest);
      },
      (err: any) => {
        assert.ok(err instanceof ProviderTimeoutError);
        assert.equal(err.code, 'PROVIDER_TIMEOUT_ERROR');
        assert.equal(err.status, 504);
        assert.match(err.message, /timeout/i);
        return true;
      }
    );

    // Scenario B: External AbortController cancellation
    const abortCtrl = new AbortController();
    const abortRequest: AiGatewayRequest = {
      taskType: 'sales_chat',
      prompt: 'Aborted call',
      timeoutMs: 5000,
      abortSignal: abortCtrl.signal,
      context: {
        workspaceId: 'ws-abort-test',
        userId: 'usr-abort-test',
        userRole: 'member',
        traceId: 'trace-aborted-call',
      },
    };

    setTimeout(() => abortCtrl.abort(), 20);

    await assert.rejects(
      async () => {
        await gateway.execute(abortRequest);
      },
      (err: any) => {
        assert.ok(err instanceof AiGatewayError);
        assert.equal(err.status, 504);
        return true;
      }
    );
  });

  // TEST 10: No provider SDK dependency introduced
  test('10. Gateway foundation modules contain zero @google/genai imports', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');

    const filesToCheck = [
      path.resolve(process.cwd(), 'src/lib/ai-gateway/types.ts'),
      path.resolve(process.cwd(), 'src/lib/ai-gateway/config.ts'),
      path.resolve(process.cwd(), 'src/lib/ai-gateway/errors.ts'),
      path.resolve(process.cwd(), 'src/lib/ai-gateway/adapters/provider.interface.ts'),
      path.resolve(process.cwd(), 'src/lib/ai-gateway/index.ts'),
    ];

    for (const filePath of filesToCheck) {
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.ok(
        !content.includes('@google/genai'),
        `File ${path.basename(filePath)} must not import @google/genai`
      );
      assert.ok(
        !content.includes('GoogleGenAI'),
        `File ${path.basename(filePath)} must not reference GoogleGenAI class`
      );
    }
  });

  // TEST 11: No external network call made
  test('11. Gateway functions purely in-memory without making external network calls', async () => {
    // When no adapter is registered, gateway fails immediately with ProviderConfigurationError
    const unconfiguredGateway = new AiGatewayService();

    const request: AiGatewayRequest = {
      taskType: 'sales_chat',
      prompt: 'Check unconfigured gateway',
      context: {
        workspaceId: 'ws-unconf',
        userId: 'usr-unconf',
        userRole: 'member',
        traceId: 'trace-unconfigured',
      },
    };

    await assert.rejects(
      async () => {
        await unconfiguredGateway.execute(request);
      },
      (err: any) => {
        assert.ok(err instanceof ProviderConfigurationError);
        assert.equal(err.code, 'PROVIDER_CONFIGURATION_ERROR');
        assert.equal(err.status, 503);
        return true;
      }
    );

    // Health check on unconfigured returns healthy: false without throwing or calling network
    const health = await unconfiguredGateway.healthCheck('gemini');
    assert.equal(health.healthy, false);
    assert.match(health.message || '', /not registered/i);
  });

  // TEST 12: No sensitive values exposed in errors
  test('12. Sensitive values (API keys, bearer tokens) are sanitized from error messages', () => {
    const leakedError = new Error(
      'Authentication failed for key=AIzaSyDaSecretKey1234567890123456789 with Bearer eyJhbGciOiJIUzI1NiJ9.user@example.com'
    );

    const normalized = normalizeToGatewayError(leakedError, 'trace-sanitize-test');

    assert.ok(
      !normalized.message.includes('AIzaSyDaSecretKey1234567890123456789'),
      'Raw API key must be scrubbed'
    );
    assert.ok(
      !normalized.message.includes('user@example.com'),
      'Raw email must be scrubbed'
    );
    assert.match(normalized.message, /\[REDACTED/i, 'Redaction placeholder must be present');
    assert.equal(normalized.traceId, 'trace-sanitize-test');
  });

  // TEST 13: Configuration integrity and cost calculation
  test('13. Configuration validation and provider cost calculations are accurate', () => {
    const validation = validateGatewayConfig();
    assert.equal(validation.valid, true);
    assert.equal(validation.errors.length, 0);

    // Default model resolution
    assert.equal(GATEWAY_CONFIG.defaultModel, 'gemini-2.5-flash');
    assert.equal(resolveModelForTask('sales_chat'), 'gemini-2.5-flash');
    assert.equal(resolveModelForTask('lead_coach'), 'gemini-2.5-flash');

    // Timeout resolution
    assert.equal(resolveTimeoutForTask('sales_chat'), 20_000);
    assert.equal(resolveTimeoutForTask('connection_probe'), 5_000);
    assert.equal(resolveTimeoutForTask('sales_chat', 10_000), 10_000);
    assert.equal(resolveTimeoutForTask('sales_chat', 999_999), GATEWAY_CONFIG.maxTimeoutMs);

    // Cost estimation math: gemini-2.5-flash ($0.075 / 1M in, $0.30 / 1M out)
    // 1M in + 1M out = $0.375
    const cost1M = estimateProviderCost('gemini-2.5-flash', 1_000_000, 1_000_000);
    assert.equal(cost1M, 0.375);

    // 100k in + 20k out:
    // (100,000 / 1M) * 0.075 = 0.0075
    // (20,000 / 1M) * 0.30 = 0.0060
    // Total = 0.0135
    const costSmall = estimateProviderCost('gemini-2.5-flash', 100_000, 20_000);
    assert.equal(costSmall, 0.0135);
  });
});
