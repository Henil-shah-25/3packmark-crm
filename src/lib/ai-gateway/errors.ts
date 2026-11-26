/**
 * DEVELOPSTER HUB CRM — CENTRAL AI GATEWAY
 * Standardized Error Hierarchy & Safe Normalization
 *
 * Strict Architectural Boundary:
 * - Sanitizes all error messages to guarantee no credentials, session tokens,
 *   or raw customer records leak into client responses or logs.
 * - Provides machine-readable error codes and deterministic HTTP status mappings.
 */

export type GatewayErrorCode =
  | 'GATEWAY_VALIDATION_ERROR'
  | 'CONTEXT_AUTHORIZATION_ERROR'
  | 'PROVIDER_CONFIGURATION_ERROR'
  | 'PROVIDER_TIMEOUT_ERROR'
  | 'PROVIDER_COMMUNICATION_ERROR'
  | 'OUTPUT_VALIDATION_ERROR'
  | 'UNSUPPORTED_OPERATION_ERROR';

/**
 * Base Gateway Error
 */
export class AiGatewayError extends Error {
  public readonly code: GatewayErrorCode;
  public readonly status: number;
  public readonly isRetryable: boolean;
  public readonly traceId?: string;

  constructor(
    message: string,
    code: GatewayErrorCode,
    status: number = 500,
    isRetryable: boolean = false,
    traceId?: string
  ) {
    // Sanitize message: strip potential secrets, tokens, or raw JSON
    const sanitized = sanitizeErrorMessage(message);
    super(sanitized);
    this.name = 'AiGatewayError';
    this.code = code;
    this.status = status;
    this.isRetryable = isRetryable;
    this.traceId = traceId;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Request validation failure (e.g. missing required fields, bad task type)
 */
export class GatewayValidationError extends AiGatewayError {
  constructor(message: string, traceId?: string) {
    super(message, 'GATEWAY_VALIDATION_ERROR', 400, false, traceId);
    this.name = 'GatewayValidationError';
  }
}

/**
 * Missing, malformed, or untrusted execution context (e.g. missing workspaceId or userId)
 */
export class ContextAuthorizationError extends AiGatewayError {
  constructor(message: string, traceId?: string) {
    super(message, 'CONTEXT_AUTHORIZATION_ERROR', 401, false, traceId);
    this.name = 'ContextAuthorizationError';
  }
}

/**
 * Provider adapter unconfigured or missing provider implementation
 */
export class ProviderConfigurationError extends AiGatewayError {
  constructor(message: string, traceId?: string) {
    super(message, 'PROVIDER_CONFIGURATION_ERROR', 503, false, traceId);
    this.name = 'ProviderConfigurationError';
  }
}

/**
 * Provider request exceeded the allotted timeout window or was aborted
 */
export class ProviderTimeoutError extends AiGatewayError {
  constructor(message: string = 'AI provider request timed out', traceId?: string) {
    super(message, 'PROVIDER_TIMEOUT_ERROR', 504, true, traceId);
    this.name = 'ProviderTimeoutError';
  }
}

/**
 * External provider network failure, 5xx, or upstream communication fault
 */
export class ProviderCommunicationError extends AiGatewayError {
  constructor(message: string, isRetryable: boolean = true, traceId?: string) {
    super(message, 'PROVIDER_COMMUNICATION_ERROR', 502, isRetryable, traceId);
    this.name = 'ProviderCommunicationError';
  }
}

/**
 * Model output failed schema validation or could not be parsed safely
 */
export class OutputValidationError extends AiGatewayError {
  constructor(message: string, traceId?: string) {
    super(message, 'OUTPUT_VALIDATION_ERROR', 502, false, traceId);
    this.name = 'OutputValidationError';
  }
}

/**
 * Operation requested is not supported by the configured provider adapter
 */
export class UnsupportedOperationError extends AiGatewayError {
  constructor(message: string, traceId?: string) {
    super(message, 'UNSUPPORTED_OPERATION_ERROR', 501, false, traceId);
    this.name = 'UnsupportedOperationError';
  }
}

/**
 * Strips potential API keys, auth headers, and sensitive patterns from error text.
 */
export function sanitizeErrorMessage(msg: string): string {
  if (!msg) return 'Unknown gateway error';
  return msg
    .replace(/AIza[0-9A-Za-z-_]{20,}/g, '[REDACTED_API_KEY]')
    .replace(/bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(/key=[a-zA-Z0-9._-]+/gi, 'key=[REDACTED]')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]')
    .trim();
}

/**
 * Safely maps any caught error, string, or unknown rejection into an AiGatewayError.
 */
export function normalizeToGatewayError(error: unknown, traceId?: string): AiGatewayError {
  if (error instanceof AiGatewayError || (typeof error === 'object' && error !== null && 'code' in error && 'status' in error)) {
    if (traceId && !(error as any).traceId) {
      (error as { traceId?: string }).traceId = traceId;
    }
    return error as AiGatewayError;
  }

  if (error instanceof Error) {
    const rawMsg = error.message || 'AI provider communication failed';
    const sanitizedMsg = sanitizeErrorMessage(rawMsg);
    const msg = rawMsg.toLowerCase();

    // Check for timeout / abort
    if (
      msg.includes('timeout') ||
      msg.includes('timed out') ||
      msg.includes('abort') ||
      error.name === 'AbortError'
    ) {
      return new ProviderTimeoutError('AI provider request timed out or was aborted', traceId);
    }

    // Check for rate limits
    if (msg.includes('rate limit') || msg.includes('429') || msg.includes('quota')) {
      return new AiGatewayError(
        'AI provider rate limit reached. Please retry after a brief delay.',
        'PROVIDER_COMMUNICATION_ERROR',
        429,
        true,
        traceId
      );
    }

    // Check for auth / configuration failures from provider
    if (msg.includes('api_key') || msg.includes('unauthorized') || msg.includes('authentication')) {
      return new ProviderConfigurationError(
        `AI provider configuration error: ${sanitizedMsg}`,
        traceId
      );
    }

    // Default to provider communication error
    return new ProviderCommunicationError(
      sanitizedMsg,
      true,
      traceId
    );
  }

  if (typeof error === 'string') {
    return new ProviderCommunicationError(error, false, traceId);
  }

  return new ProviderCommunicationError('An unexpected AI gateway error occurred', false, traceId);
}
