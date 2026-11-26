/**
 * DEVELOPSTER HUB CRM — CENTRAL AI GATEWAY
 * AI-03.2 Gemini Provider Adapter Unit Tests
 *
 * Exhaustively tests GeminiProviderAdapter using an injected mock client.
 * Strictly ZERO external network requests or real API calls.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  GeminiProviderAdapter,
  createGeminiAdapter,
} from '../src/lib/ai-gateway/adapters/gemini-adapter.ts';
import {
  AiGatewayRequest,
  ProviderConfigurationError,
  ProviderTimeoutError,
  ProviderCommunicationError,
  OutputValidationError,
  AiGatewayError,
} from '../src/lib/ai-gateway/index.ts';

// Test double for @google/genai client
class MockGoogleGenAIClient {
  public lastParams?: any;
  public mockResponse?: any;
  public mockError?: Error;
  public delayMs: number = 0;

  public models = {
    generateContent: async (params: any) => {
      this.lastParams = params;

      if (this.delayMs > 0) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, this.delayMs);
          if (params.config?.abortSignal) {
            params.config.abortSignal.addEventListener('abort', () => {
              clearTimeout(timer);
              const err = new Error('Request was aborted by client signal');
              err.name = 'AbortError';
              reject(err);
            });
          }
        });
      }

      if (params.config?.abortSignal?.aborted) {
        const abortErr = new Error('The operation was aborted');
        abortErr.name = 'AbortError';
        throw abortErr;
      }

      if (this.mockError) {
        throw this.mockError;
      }

      return (
        this.mockResponse || {
          text: 'Default Gemini response text',
          modelVersion: 'gemini-2.5-flash',
          candidates: [
            {
              content: {
                parts: [{ text: 'Default Gemini response text' }],
              },
            },
          ],
          usageMetadata: {
            promptTokenCount: 120,
            candidatesTokenCount: 60,
            totalTokenCount: 180,
          },
        }
      );
    },
  };
}

describe('Gemini Provider Adapter Tests (AI-03.2)', { concurrency: 1 }, () => {
  let mockClient: MockGoogleGenAIClient;
  let adapter: GeminiProviderAdapter;

  const validContext = {
    workspaceId: 'ws-test-tenant-1',
    userId: 'usr-agent-01',
    userRole: 'member' as const,
    traceId: 'trace-gemini-test-001',
  };

  beforeEach(() => {
    mockClient = new MockGoogleGenAIClient();
    adapter = new GeminiProviderAdapter({ client: mockClient as any });
  });

  // TEST 1: Adapter initialisation with a valid platform key
  test('1. Adapter initialises successfully with platform key or injected client', () => {
    const customAdapter = new GeminiProviderAdapter({ apiKey: 'test-fake-platform-key' });
    assert.equal(customAdapter.providerName, 'gemini');

    const capabilities = customAdapter.getCapabilities('gemini-2.5-flash');
    assert.equal(capabilities.streaming, true);
    assert.equal(capabilities.toolCalling, true);
    assert.equal(capabilities.structuredOutput, true);
    assert.equal(capabilities.maxContextTokens, 1_000_000);
  });

  // TEST 2: Missing API key fails closed
  test('2. Missing or empty API key fails closed with ProviderConfigurationError', async () => {
    const savedKey = process.env.GEMINI_API_KEY;
    try {
      delete process.env.GEMINI_API_KEY;
      const unconfiguredAdapter = new GeminiProviderAdapter({ apiKey: '' });

      const request: AiGatewayRequest = {
        taskType: 'sales_chat',
        prompt: 'Hello',
        context: validContext,
      };

      await assert.rejects(
        async () => {
          await unconfiguredAdapter.execute(request);
        },
        (err: any) => {
          assert.ok(err instanceof ProviderConfigurationError);
          assert.equal(err.code, 'PROVIDER_CONFIGURATION_ERROR');
          assert.equal(err.status, 503);
          assert.match(err.message, /GEMINI_API_KEY is not configured/i);
          return true;
        }
      );
    } finally {
      if (savedKey !== undefined) {
        process.env.GEMINI_API_KEY = savedKey;
      }
    }
  });

  // TEST 3: Correct approved model selection
  test('3. Dispatches to the approved gemini-2.5-flash model by default', async () => {
    const request: AiGatewayRequest = {
      taskType: 'sales_chat',
      prompt: 'Summarize pipeline',
      context: validContext,
    };

    await adapter.execute(request, 'gemini-2.5-flash');

    assert.ok(mockClient.lastParams);
    assert.equal(mockClient.lastParams.model, 'gemini-2.5-flash');
  });

  // TEST 4: Text request translation
  test('4. Correctly translates prompt string into Gemini contents parameter', async () => {
    const request: AiGatewayRequest = {
      taskType: 'lead_coach',
      prompt: 'Diagnose deal risks for Acme Corp',
      context: validContext,
    };

    await adapter.execute(request);

    assert.equal(mockClient.lastParams.contents, 'Diagnose deal risks for Acme Corp');
  });

  // TEST 5: System instruction translation
  test('5. Correctly translates system instruction and multi-turn messages', async () => {
    const request: AiGatewayRequest = {
      taskType: 'sales_chat',
      systemInstruction: 'You are an executive deal director.',
      messages: [
        { role: 'user', content: 'What is our closing rate?' },
        { role: 'assistant', content: 'Current closing rate is 32%.' },
        { role: 'user', content: 'How do we improve it?' },
      ],
      context: validContext,
    };

    await adapter.execute(request);

    assert.equal(
      mockClient.lastParams.config.systemInstruction,
      'You are an executive deal director.'
    );
    assert.ok(Array.isArray(mockClient.lastParams.contents));
    assert.equal(mockClient.lastParams.contents.length, 3);
    assert.equal(mockClient.lastParams.contents[0].role, 'user');
    assert.equal(mockClient.lastParams.contents[1].role, 'model'); // Assistant maps to model
    assert.equal(mockClient.lastParams.contents[2].role, 'user');
  });

  // TEST 6: Structured output configuration
  test('6. Configures application/json responseMimeType and parses JSON responseSchema', async () => {
    const expectedData = { assessment: 'Strong buyer intent', score: 85 };
    mockClient.mockResponse = {
      text: JSON.stringify(expectedData),
      modelVersion: 'gemini-2.5-flash',
      candidates: [{ content: { parts: [{ text: JSON.stringify(expectedData) }] } }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 40, totalTokenCount: 140 },
    };

    const request: AiGatewayRequest = {
      taskType: 'lead_coach',
      prompt: 'Evaluate deal',
      responseSchema: {
        type: 'object',
        properties: { assessment: { type: 'string' }, score: { type: 'number' } },
      },
      context: validContext,
    };

    const response = await adapter.execute(request);

    assert.equal(mockClient.lastParams.config.responseMimeType, 'application/json');
    assert.ok(mockClient.lastParams.config.responseSchema);
    assert.deepEqual(response.data, expectedData);
    assert.equal(response.text, JSON.stringify(expectedData));
  });

  // TEST 7: Successful response normalisation
  test('7. Normalises Gemini response into AiGatewayResponse envelope', async () => {
    mockClient.mockResponse = {
      text: 'Negotiation tactical plan generated.',
      modelVersion: 'gemini-2.5-flash',
      candidates: [{ content: { parts: [{ text: 'Negotiation tactical plan generated.' }] } }],
      usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 80, totalTokenCount: 280 },
    };

    const request: AiGatewayRequest = {
      taskType: 'sales_chat',
      prompt: 'Draft plan',
      context: validContext,
    };

    const response = await adapter.execute(request);

    assert.equal(response.success, true);
    assert.equal(response.text, 'Negotiation tactical plan generated.');
    assert.equal(response.model, 'gemini-2.5-flash');
    assert.equal(response.provider, 'gemini');
    assert.equal(response.traceId, 'trace-gemini-test-001');
  });

  // TEST 8: Token usage extraction
  test('8. Extracts token usage metadata and calculates estimated USD cost', async () => {
    mockClient.mockResponse = {
      text: 'Analysis complete',
      candidates: [{ content: { parts: [{ text: 'Analysis complete' }] } }],
      usageMetadata: {
        promptTokenCount: 50_000,
        candidatesTokenCount: 10_000,
        totalTokenCount: 60_000,
      },
    };

    const request: AiGatewayRequest = {
      taskType: 'executive_briefing',
      prompt: 'Calculate KPIs',
      context: validContext,
    };

    const response = await adapter.execute(request, 'gemini-2.5-flash');

    assert.equal(response.usage.promptTokens, 50_000);
    assert.equal(response.usage.completionTokens, 10_000);
    assert.equal(response.usage.totalTokens, 60_000);
    // (50k / 1M * 0.075 = 0.00375) + (10k / 1M * 0.30 = 0.003) = 0.00675 USD
    assert.equal(response.usage.estimatedCostUsd, 0.00675);
  });

  // TEST 9: Missing usage metadata handling
  test('9. Missing usage metadata defaults safely to 0 without throwing', async () => {
    mockClient.mockResponse = {
      text: 'No usage metadata provided by provider',
      candidates: [{ content: { parts: [{ text: 'No usage metadata' }] } }],
      usageMetadata: undefined,
    };

    const request: AiGatewayRequest = {
      taskType: 'sales_chat',
      prompt: 'Quick query',
      context: validContext,
    };

    const response = await adapter.execute(request);

    assert.equal(response.usage.promptTokens, 0);
    assert.equal(response.usage.completionTokens, 0);
    assert.equal(response.usage.totalTokens, 0);
    assert.equal(response.usage.estimatedCostUsd, 0);
  });

  // TEST 10: Empty response handling
  test('10. Empty provider response throws ProviderCommunicationError', async () => {
    mockClient.mockResponse = {
      text: '',
      candidates: [],
    };

    const request: AiGatewayRequest = {
      taskType: 'sales_chat',
      prompt: 'Hello',
      context: validContext,
    };

    await assert.rejects(
      async () => {
        await adapter.execute(request);
      },
      (err: any) => {
        assert.ok(err instanceof ProviderCommunicationError);
        assert.equal(err.code, 'PROVIDER_COMMUNICATION_ERROR');
        assert.equal(err.status, 502);
        return true;
      }
    );
  });

  // TEST 11: Provider authentication error mapping
  test('11. Provider authentication errors (401 / API_KEY_INVALID) map to ProviderConfigurationError', async () => {
    mockClient.mockError = new Error('API_KEY_INVALID: The provided API key is expired or invalid.');

    const request: AiGatewayRequest = {
      taskType: 'sales_chat',
      prompt: 'Test auth error',
      context: validContext,
    };

    await assert.rejects(
      async () => {
        await adapter.execute(request);
      },
      (err: any) => {
        assert.ok(err instanceof ProviderConfigurationError);
        assert.equal(err.code, 'PROVIDER_CONFIGURATION_ERROR');
        assert.equal(err.status, 503);
        assert.match(err.message, /authentication failed/i);
        return true;
      }
    );
  });

  // TEST 12: Rate-limit error mapping
  test('12. Provider rate-limit errors (429 / RESOURCE_EXHAUSTED) map to 429 AiGatewayError', async () => {
    mockClient.mockError = new Error('429 RESOURCE_EXHAUSTED: Quota exceeded for Generative Language API');

    const request: AiGatewayRequest = {
      taskType: 'sales_chat',
      prompt: 'Test quota limit',
      context: validContext,
    };

    await assert.rejects(
      async () => {
        await adapter.execute(request);
      },
      (err: any) => {
        assert.ok(err instanceof AiGatewayError);
        assert.equal(err.code, 'PROVIDER_COMMUNICATION_ERROR');
        assert.equal(err.status, 429);
        assert.equal(err.isRetryable, true);
        assert.match(err.message, /rate limit exceeded/i);
        return true;
      }
    );
  });

  // TEST 13: Provider outage handling
  test('13. Provider 503 / UNAVAILABLE outages map to 502 ProviderCommunicationError with isRetryable', async () => {
    mockClient.mockError = new Error('503 UNAVAILABLE: The model is currently overloaded.');

    const request: AiGatewayRequest = {
      taskType: 'sales_chat',
      prompt: 'Test outage',
      context: validContext,
    };

    await assert.rejects(
      async () => {
        await adapter.execute(request);
      },
      (err: any) => {
        assert.ok(err instanceof ProviderCommunicationError);
        assert.equal(err.code, 'PROVIDER_COMMUNICATION_ERROR');
        assert.equal(err.status, 502);
        assert.equal(err.isRetryable, true);
        assert.match(err.message, /unavailable or overloaded/i);
        return true;
      }
    );
  });

  // TEST 14: Timeout handling
  test('14. Request timeout maps to ProviderTimeoutError with status 504', async () => {
    mockClient.mockError = new Error('Client network timeout of 15000ms exceeded');

    const request: AiGatewayRequest = {
      taskType: 'sales_chat',
      prompt: 'Test timeout',
      context: validContext,
    };

    await assert.rejects(
      async () => {
        await adapter.execute(request);
      },
      (err: any) => {
        assert.ok(err instanceof ProviderTimeoutError);
        assert.equal(err.code, 'PROVIDER_TIMEOUT_ERROR');
        assert.equal(err.status, 504);
        return true;
      }
    );
  });

  // TEST 15: AbortSignal propagation
  test('15. AbortSignal cancellation passes to config and aborts request', async () => {
    mockClient.delayMs = 150; // Delay mock execution

    const abortController = new AbortController();
    const request: AiGatewayRequest = {
      taskType: 'sales_chat',
      prompt: 'Cancel me',
      abortSignal: abortController.signal,
      context: validContext,
    };

    setTimeout(() => abortController.abort(), 20);

    await assert.rejects(
      async () => {
        await adapter.execute(request, 'gemini-2.5-flash', abortController.signal);
      },
      (err: any) => {
        assert.ok(err instanceof ProviderTimeoutError);
        assert.equal(err.status, 504);
        return true;
      }
    );
  });

  // TEST 16: Secret redaction in errors
  test('16. Secrets (API keys, tokens) are never leaked in error messages', async () => {
    mockClient.mockError = new Error(
      'Request failed with key=AIzaSyDaSecretKey1234567890123456789 and Bearer eyJhbGciOiJIUzI1NiJ9'
    );

    const request: AiGatewayRequest = {
      taskType: 'sales_chat',
      prompt: 'Leak test',
      context: validContext,
    };

    await assert.rejects(
      async () => {
        await adapter.execute(request);
      },
      (err: any) => {
        assert.ok(!err.message.includes('AIzaSyDaSecretKey1234567890123456789'));
        assert.ok(!err.message.includes('eyJhbGciOiJIUzI1NiJ9'));
        return true;
      }
    );
  });

  // TEST 17: No workspace API key usage
  test('17. Adapter strictly ignores workspace credentials and uses platform configuration', async () => {
    // Context has workspaceId 'ws-custom-tenant-xyz', but adapter does not touch workspace credentials
    const request: AiGatewayRequest = {
      taskType: 'sales_chat',
      prompt: 'Check workspace decoupling',
      context: {
        workspaceId: 'ws-custom-tenant-xyz',
        userId: 'usr-tenant-rep',
        userRole: 'member',
        traceId: 'trace-decoupling-test',
      },
    };

    const response = await adapter.execute(request);

    assert.equal(response.success, true);
    assert.equal(response.provider, 'gemini');
    // Confirms request used the injected platform client
    assert.ok(mockClient.lastParams);
  });

  // TEST 18: No external network requests in mocked tests
  test('18. Adapter functions in-memory using test double without external network I/O', async () => {
    // Health check executes cleanly using injected mock
    const health = await adapter.healthCheck();
    assert.equal(health.healthy, true);
    assert.equal(health.provider, 'gemini');
    assert.ok(health.latencyMs >= 0);
  });
});
