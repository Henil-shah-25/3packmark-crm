/**
 * DEVELOPSTER HUB CRM — CENTRAL AI GATEWAY
 * AI-03.5 Usage Metering & Diagnostic Telemetry Test Suite
 *
 * Verifies operational usage recording, tenant/user/agent attribution,
 * bounded ring buffer behaviour, error sanitization, and resilience.
 */

import test, { describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  AiGatewayService,
  IAiProviderAdapter,
  AiGatewayRequest,
  AiGatewayResponse,
  ProviderHealthCheckResult,
  TrustedExecutionContext,
  GatewayValidationError,
  ContextAuthorizationError,
  ProviderTimeoutError,
  createSystemExecutionContext,
  InMemoryTelemetryService,
  AiTelemetryEvent,
  IAiTelemetryService,
  RecordTelemetryInput,
} from '../src/lib/ai-gateway';
import { setRateLimiterStore, MemoryRateLimiterStore } from '../src/lib/rate-limit';

// High-fidelity Mock Adapter with configurable token usage and error injection
class TelemetryMockAdapter implements IAiProviderAdapter {
  public readonly providerName = 'gemini';
  public mockPromptTokens = 150;
  public mockCompletionTokens = 85;
  public mockOmitUsage = false;
  public throwError?: Error;
  public delayMs = 0;

  async execute<TOutput>(
    request: AiGatewayRequest<TOutput>,
    model: string,
    signal?: AbortSignal
  ): Promise<AiGatewayResponse<TOutput>> {
    if (this.delayMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, this.delayMs);
        if (signal) {
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new ProviderTimeoutError('Aborted by signal', request.context.traceId));
          });
        }
      });
    }

    if (this.throwError) {
      throw this.throwError;
    }

    return {
      success: true,
      text: 'Mock telemetry response',
      model,
      provider: this.providerName,
      traceId: request.context.traceId,
      usage: this.mockOmitUsage
        ? undefined
        : {
            promptTokens: this.mockPromptTokens,
            completionTokens: this.mockCompletionTokens,
            totalTokens: this.mockPromptTokens + this.mockCompletionTokens,
            durationMs: 10,
          },
    };
  }

  async healthCheck(): Promise<ProviderHealthCheckResult> {
    return { healthy: true, latencyMs: 1, provider: this.providerName };
  }
}

describe('AI Gateway Usage Metering & Diagnostic Telemetry Tests (AI-03.5)', () => {
  let gateway: AiGatewayService;
  let mockAdapter: TelemetryMockAdapter;
  let telemetry: InMemoryTelemetryService;

  const validContext: TrustedExecutionContext = {
    workspaceId: 'ws-tenant-telemetry',
    userId: 'usr-analyst-01',
    userRole: 'manager',
    traceId: 'tr-telemetry-001',
  };

  beforeEach(() => {
    setRateLimiterStore(new MemoryRateLimiterStore());
    telemetry = new InMemoryTelemetryService({ maxBufferSize: 10 });
    gateway = new AiGatewayService(undefined, telemetry);
    mockAdapter = new TelemetryMockAdapter();
    gateway.registerAdapter(mockAdapter);
  });

  // 1. Successful usage recording
  test('1. Successful AI execution records telemetry event with expected fields', async () => {
    const res = await gateway.execute({
      context: validContext,
      taskType: 'sales_chat',
      prompt: 'Summarize quarterly pipeline',
    });

    assert.equal(res.success, true);

    const events = telemetry.getEvents(validContext.workspaceId);
    assert.equal(events.length, 1);

    const event = events[0];
    assert.ok(event.id.startsWith('tel_'));
    assert.equal(event.traceId, validContext.traceId);
    assert.equal(event.workspaceId, validContext.workspaceId);
    assert.equal(event.userId, validContext.userId);
    assert.equal(event.taskType, 'sales_chat');
    assert.equal(event.provider, 'gemini');
    assert.equal(event.model, 'gemini-2.5-flash');
    assert.equal(event.outcome, 'success');
    assert.equal(event.promptTokens, 150);
    assert.equal(event.completionTokens, 85);
    assert.equal(event.totalTokens, 235);
    assert.ok(typeof event.durationMs === 'number' && event.durationMs >= 0);
    assert.ok(event.timestamp);
  });

  // 2. Correct workspace/user/agent attribution
  test('2. Correct workspace, user, and registered agent attribution', async () => {
    await gateway.execute({
      context: validContext,
      agentId: 'lead_diagnostic_agent',
      taskType: 'lead_coach',
      prompt: 'Diagnose lead status',
    });

    const events = telemetry.getEvents(validContext.workspaceId);
    assert.equal(events.length, 1);
    const event = events[0];

    assert.equal(event.workspaceId, 'ws-tenant-telemetry');
    assert.equal(event.userId, 'usr-analyst-01');
    assert.equal(event.agentId, 'lead_diagnostic_agent');
    assert.equal(event.taskType, 'lead_coach');
    assert.equal(event.promptVersion, '1.0.0');
  });

  // 3. Token metadata recording & aggregation
  test('3. Token metadata recording and accurate tenant metrics aggregation', async () => {
    await gateway.execute({
      context: validContext,
      taskType: 'sales_chat',
      prompt: 'Request 1',
    });

    mockAdapter.mockPromptTokens = 200;
    mockAdapter.mockCompletionTokens = 100;

    await gateway.execute({
      context: validContext,
      taskType: 'sales_chat',
      prompt: 'Request 2',
    });

    const metrics = telemetry.getAggregateMetrics(validContext.workspaceId);
    assert.equal(metrics.workspaceId, validContext.workspaceId);
    assert.equal(metrics.totalRequests, 2);
    assert.equal(metrics.successCount, 2);
    assert.equal(metrics.failureCount, 0);
    assert.equal(metrics.totalPromptTokens, 350); // 150 + 200
    assert.equal(metrics.totalCompletionTokens, 185); // 85 + 100
    assert.equal(metrics.totalTokens, 535); // 235 + 300
    assert.ok(metrics.averageDurationMs >= 0);
    assert.ok(metrics.lastActiveAt);
  });

  // 4. Missing provider usage metadata
  test('4. Missing provider usage metadata defaults safely to 0 without throwing', async () => {
    mockAdapter.mockOmitUsage = true;

    const res = await gateway.execute({
      context: validContext,
      taskType: 'sales_chat',
      prompt: 'Analyze lead data',
    });

    assert.equal(res.success, true);
    const events = telemetry.getEvents(validContext.workspaceId);
    assert.equal(events.length, 1);
    assert.equal(events[0].promptTokens, 0);
    assert.equal(events[0].completionTokens, 0);
    assert.equal(events[0].totalTokens, 0);
  });

  // 5. Failed provider request recording
  test('5. Provider communication failure records outcome: failure with 0 token usage', async () => {
    mockAdapter.throwError = new Error('Upstream provider 503 service unavailable');

    await assert.rejects(
      async () => {
        await gateway.execute({
          context: validContext,
          taskType: 'sales_chat',
          prompt: 'Generate email template',
        });
      },
      (err: any) => {
        assert.equal(err.code, 'PROVIDER_COMMUNICATION_ERROR');
        return true;
      }
    );

    const events = telemetry.getEvents(validContext.workspaceId);
    assert.equal(events.length, 1);
    assert.equal(events[0].outcome, 'failure');
    assert.equal(events[0].promptTokens, 0);
    assert.equal(events[0].completionTokens, 0);
    assert.equal(events[0].totalTokens, 0);
    assert.equal(events[0].errorCode, 'PROVIDER_COMMUNICATION_ERROR');
  });

  // 6. Timeout and rejected request handling
  test('6. Timeout maps to "timeout" and pre-dispatch validation maps to "rejected"', async () => {
    // 6a. Pre-dispatch rejection (mismatched agent taskType)
    await assert.rejects(
      async () => {
        await gateway.execute({
          context: validContext,
          agentId: 'lead_diagnostic_agent',
          taskType: 'sales_chat' as any,
          prompt: 'test',
        });
      },
      (err: any) => {
        assert.equal(err.code, 'GATEWAY_VALIDATION_ERROR');
        return true;
      }
    );

    let events = telemetry.getEvents(validContext.workspaceId);
    assert.equal(events.length, 1);
    assert.equal(events[0].outcome, 'rejected');
    assert.equal(events[0].promptTokens, 0);
    assert.equal(events[0].errorCode, 'GATEWAY_VALIDATION_ERROR');

    // 6b. Timeout
    mockAdapter.delayMs = 200;
    await assert.rejects(
      async () => {
        await gateway.execute({
          context: validContext,
          taskType: 'sales_chat',
          prompt: 'test timeout',
          timeoutMs: 50,
        });
      },
      (err: any) => {
        assert.equal(err.code, 'PROVIDER_TIMEOUT_ERROR');
        return true;
      }
    );

    events = telemetry.getEvents(validContext.workspaceId);
    assert.equal(events.length, 2);
    assert.equal(events[1].outcome, 'timeout');
    assert.equal(events[1].errorCode, 'PROVIDER_TIMEOUT_ERROR');
    assert.equal(events[1].promptTokens, 0);
  });

  // 7. Latency calculation
  test('7. Request latency is recorded accurately in durationMs', async () => {
    mockAdapter.delayMs = 40;

    await gateway.execute({
      context: validContext,
      taskType: 'sales_chat',
      prompt: 'Calculate latency',
    });

    const events = telemetry.getEvents(validContext.workspaceId);
    assert.equal(events.length, 1);
    assert.ok(events[0].durationMs >= 35, `Expected durationMs >= 35, got ${events[0].durationMs}`);
  });

  // 8. Bounded buffer behaviour & FIFO eviction
  test('8. Bounded ring buffer evicts oldest records when capacity is reached', () => {
    const smallTelemetry = new InMemoryTelemetryService({ maxBufferSize: 3 });

    for (let i = 1; i <= 5; i++) {
      smallTelemetry.recordEvent({
        traceId: `tr-${i}`,
        workspaceId: 'ws-bounded-test',
        userId: 'usr-1',
        taskType: 'sales_chat',
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        durationMs: 10,
        outcome: 'success',
        promptTokens: i * 10,
      });
    }

    assert.equal(smallTelemetry.getBufferSize(), 3);
    const events = smallTelemetry.getEvents('ws-bounded-test');
    assert.equal(events.length, 3);
    // Oldest events (1, 2) were evicted; remaining should be 3, 4, 5
    assert.equal(events[0].traceId, 'tr-3');
    assert.equal(events[1].traceId, 'tr-4');
    assert.equal(events[2].traceId, 'tr-5');
  });

  // 9. Concurrent request isolation
  test('9. Concurrent requests from separate workspaces maintain strict isolation', async () => {
    const ws1 = 'ws-tenant-alpha';
    const ws2 = 'ws-tenant-beta';

    const req1 = gateway.execute({
      context: { ...validContext, workspaceId: ws1, traceId: 'tr-alpha' },
      taskType: 'sales_chat',
      prompt: 'Workspace Alpha call',
    });

    const req2 = gateway.execute({
      context: { ...validContext, workspaceId: ws2, traceId: 'tr-beta' },
      taskType: 'sales_chat',
      prompt: 'Workspace Beta call',
    });

    await Promise.all([req1, req2]);

    const alphaEvents = telemetry.getEvents(ws1);
    const betaEvents = telemetry.getEvents(ws2);

    assert.equal(alphaEvents.length, 1);
    assert.equal(betaEvents.length, 1);
    assert.equal(alphaEvents[0].workspaceId, ws1);
    assert.equal(alphaEvents[0].traceId, 'tr-alpha');
    assert.equal(betaEvents[0].workspaceId, ws2);
    assert.equal(betaEvents[0].traceId, 'tr-beta');

    // Querying with unknown workspace returns empty array
    assert.deepEqual(telemetry.getEvents('ws-unknown'), []);
  });

  // 10. No raw prompts or CRM data in telemetry
  test('10. Telemetry events NEVER contain raw prompts, message history, or CRM data', async () => {
    await gateway.execute({
      context: validContext,
      taskType: 'sales_chat',
      prompt: 'SENSITIVE_CRM_CUSTOMER_NOTE: John Doe owes $50,000 on deal D-1234',
    });

    const events = telemetry.getEvents(validContext.workspaceId);
    assert.equal(events.length, 1);
    const event = events[0] as any;

    assert.equal(event.prompt, undefined);
    assert.equal(event.messages, undefined);
    assert.equal(event.text, undefined);
    assert.equal(event.data, undefined);
    assert.equal(event.untrustedCrmData, undefined);

    const serialized = JSON.stringify(event);
    assert.equal(serialized.includes('John Doe'), false);
    assert.equal(serialized.includes('50,000'), false);
  });

  // 11. Secret redaction
  test('11. API keys and bearer tokens in error messages are scrubbed from telemetry', async () => {
    mockAdapter.throwError = new Error('API failure with AIzaSyD3x4mpleK3yFakeAPIKey123456789 and Bearer secret-token-xyz');

    await assert.rejects(async () => {
      await gateway.execute({
        context: validContext,
        taskType: 'sales_chat',
        prompt: 'Secret test',
      });
    });

    const events = telemetry.getEvents(validContext.workspaceId);
    assert.equal(events.length, 1);
    const errorMsg = events[0].errorMessage || '';

    assert.equal(errorMsg.includes('AIzaSyD3x4mpleK3yFakeAPIKey123456789'), false);
    assert.equal(errorMsg.includes('secret-token-xyz'), false);
    assert.ok(errorMsg.includes('[REDACTED_API_KEY]'));
    assert.ok(errorMsg.includes('Bearer [REDACTED_TOKEN]'));
  });

  // 12. Telemetry failure does not crash AI execution
  test('12. Telemetry failure does NOT crash or affect successful AI execution', async () => {
    // Failing telemetry mock
    const brokenTelemetry: IAiTelemetryService = {
      recordEvent: () => {
        throw new Error('Simulated telemetry storage failure');
      },
      getEvents: () => [],
      getAggregateMetrics: () => ({} as any),
      clearEvents: () => {},
      getBufferSize: () => 0,
      getMaxBufferSize: () => 0,
    };

    gateway.setTelemetryService(brokenTelemetry);

    // AI execution must succeed without being interrupted by telemetry failure
    const res = await gateway.execute({
      context: validContext,
      taskType: 'sales_chat',
      prompt: 'Execute despite telemetry error',
    });

    assert.equal(res.success, true);
    assert.equal(res.text, 'Mock telemetry response');
  });

  // 13. Fixed approved model and provider policy remain intact
  test('13. Fixed approved model (gemini-2.5-flash) and provider (gemini) are preserved in telemetry', async () => {
    await gateway.execute({
      context: validContext,
      taskType: 'sales_chat',
      prompt: 'Policy check',
    });

    const events = telemetry.getEvents(validContext.workspaceId);
    assert.equal(events.length, 1);
    assert.equal(events[0].provider, 'gemini');
    assert.equal(events[0].model, 'gemini-2.5-flash');
  });

  // 14. System execution context security validation
  test('14. createSystemExecutionContext validates workspaceId and enforces non-empty tenant', () => {
    assert.throws(
      () => createSystemExecutionContext({ workspaceId: '' }),
      (err: any) => {
        assert.ok(err instanceof GatewayValidationError);
        assert.match(err.message, /valid non-empty workspaceId/);
        return true;
      }
    );

    const validSys = createSystemExecutionContext({ workspaceId: 'ws-cron-tenant' });
    assert.equal(validSys.workspaceId, 'ws-cron-tenant');
    assert.equal(validSys.userRole, 'system');
    assert.equal(validSys.userId, 'system-cron');
  });
});
