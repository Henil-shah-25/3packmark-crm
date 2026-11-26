/**
 * DEVELOPSTER HUB CRM — CENTRAL AI GATEWAY
 * Security Guardrails, Request Validation & Rate Limiting
 *
 * Strict Architectural Boundary:
 * - Runtime validation of execution context and canonical userRole.
 * - Secure isolation of internal system execution context via unforgeable symbol.
 * - Request size bounding (prompts, message counts, total tokens, schema depth).
 * - Prompt boundary containment for untrusted CRM data with Unicode & delimiter normalization.
 * - Tenant-isolated & user-isolated rate limiting via existing rate-limit store.
 * - Server-side tool registry, parameter schema bounds, and tool proposal argument sanitization.
 * - Defensive context freezing and parameter sanitization.
 */

import {
  AiGatewayRequest,
  AiMessage,
  AiToolCall,
  AiToolDefinition,
  TrustedExecutionContext,
  GatewayUserRole,
  AiTaskType,
} from './types';
import {
  GatewayValidationError,
  ContextAuthorizationError,
  AiGatewayError,
} from './errors';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '../rate-limit';

/**
 * Canonical user roles recognized across Developster HUB CRM.
 * Directly maps to WorkspaceRole in src/types/crm.ts ('Owner', 'Admin', 'Manager', 'Member', 'Read-only')
 * plus internal 'system' execution for automated jobs.
 */
export const VALID_USER_ROLES = [
  'owner',
  'admin',
  'manager',
  'member',
  'read-only',
  'system',
] as const;
export type ValidUserRole = (typeof VALID_USER_ROLES)[number];

/**
 * Normalizes a CRM WorkspaceRole or string into a canonical GatewayUserRole.
 */
export function normalizeUserRole(role: unknown): ValidUserRole | null {
  if (typeof role !== 'string') return null;
  const cleaned = role.trim().toLowerCase();
  if (cleaned === 'owner') return 'owner';
  if (cleaned === 'admin') return 'admin';
  if (cleaned === 'manager') return 'manager';
  if (cleaned === 'member') return 'member';
  if (cleaned === 'read-only' || cleaned === 'readonly') return 'read-only';
  if (cleaned === 'system') return 'system';
  return null;
}

/**
 * Genuinely private module-scoped symbol used to authenticate internal system execution.
 * Unlike Symbol.for, this cannot be retrieved or forged via the global symbol registry.
 * Cannot be deserialized from JSON, cookies, or client-controlled request bodies.
 */
const SYSTEM_AUTH_SYMBOL = Symbol('developster.ai_gateway.system_auth');

/**
 * Creates an authorized system execution context for background automations and crons.
 * Internal server-side jobs (cron/tick, jobs/dispatch) must use this factory.
 */
export function createSystemExecutionContext(options: {
  workspaceId: string;
  userId?: string;
  traceId?: string;
  clientIp?: string;
}): TrustedExecutionContext {
  if (!options || typeof options.workspaceId !== 'string' || options.workspaceId.trim().length === 0) {
    throw new GatewayValidationError('createSystemExecutionContext requires a valid non-empty workspaceId');
  }

  const sanitizedUserId = options.userId && typeof options.userId === 'string' && options.userId.trim().length > 0
    ? options.userId.trim()
    : 'system-cron';

  const context: TrustedExecutionContext = {
    workspaceId: options.workspaceId.trim(),
    userId: sanitizedUserId,
    userRole: 'system',
    traceId: options.traceId || `trace-sys-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    clientIp: options.clientIp || '127.0.0.1',
    authenticatedAt: Date.now(),
  };

  Object.defineProperty(context, SYSTEM_AUTH_SYMBOL, {
    value: true,
    writable: false,
    enumerable: false,
    configurable: false,
  });

  return Object.freeze(context);
}

/**
 * Verifies if a context claiming 'system' has genuine internal server-side authorization.
 */
export function isAuthorizedSystemContext(context: TrustedExecutionContext): boolean {
  return (context as any)[SYSTEM_AUTH_SYMBOL] === true;
}

/**
 * Approved model identifiers for the Central AI Gateway.
 */
export const APPROVED_MODELS = ['gemini-2.5-flash'] as const;

/**
 * Strict request bounds to prevent resource exhaustion and buffer overflows.
 */
export const REQUEST_LIMITS = {
  MAX_PROMPT_CHARS: 50_000,
  MAX_MESSAGE_COUNT: 100,
  MAX_SINGLE_MESSAGE_CHARS: 25_000,
  MAX_TOTAL_CONTEXT_CHARS: 100_000,
  MIN_TEMPERATURE: 0.0,
  MAX_TEMPERATURE: 2.0,
  MIN_MAX_OUTPUT_TOKENS: 1,
  MAX_MAX_OUTPUT_TOKENS: 8_192,
  MAX_TOOL_DEFINITIONS: 20,
  MAX_TOOL_NAME_LENGTH: 64,
  MAX_TOOL_DESCRIPTION_LENGTH: 1_024,
} as const;

/**
 * Schema and payload resource limits for tool definitions and model proposals.
 */
export const SCHEMA_LIMITS = {
  MAX_SCHEMA_BYTE_SIZE: 16_384,      // 16 KB max for a single tool schema
  MAX_SCHEMA_DEPTH: 6,               // Max recursion depth for properties
  MAX_ARGUMENT_BYTE_SIZE: 32_768,    // 32 KB max for proposed tool arguments
} as const;

/**
 * Validates that userRole is one of the supported CRM roles.
 */
export function isValidUserRole(role: unknown): role is ValidUserRole {
  return typeof role === 'string' && (VALID_USER_ROLES as readonly string[]).includes(role as ValidUserRole);
}

/**
 * Creates an immutable, frozen copy of the trusted execution context.
 * Preserves the internal system authentication symbol if present.
 */
export function createImmutableExecutionContext(
  context: TrustedExecutionContext
): TrustedExecutionContext {
  const isSys = isAuthorizedSystemContext(context);
  const copy = { ...context };
  if (isSys) {
    Object.defineProperty(copy, SYSTEM_AUTH_SYMBOL, {
      value: true,
      writable: false,
      enumerable: false,
      configurable: false,
    });
  }
  return Object.freeze(copy);
}

/**
 * Validates trusted execution context structure, types, and roles.
 * Enforces that userRole 'system' cannot be claimed by ordinary unverified contexts.
 */
export function validateExecutionContextSecurity(context: TrustedExecutionContext): void {
  if (!context || typeof context !== 'object') {
    throw new ContextAuthorizationError('Missing trusted execution context');
  }

  if (!context.workspaceId || typeof context.workspaceId !== 'string' || context.workspaceId.trim().length === 0) {
    throw new ContextAuthorizationError('Invalid execution context: workspaceId is required');
  }

  if (!context.userId || typeof context.userId !== 'string' || context.userId.trim().length === 0) {
    throw new ContextAuthorizationError('Invalid execution context: userId is required');
  }

  if (!context.traceId || typeof context.traceId !== 'string' || context.traceId.trim().length === 0) {
    throw new ContextAuthorizationError('Invalid execution context: traceId is required');
  }

  if (!isValidUserRole(context.userRole)) {
    throw new ContextAuthorizationError(
      `Invalid execution context: userRole must be one of: ${VALID_USER_ROLES.join(', ')}`
    );
  }

  // Protect system role: Ordinary HTTP or unverified callers cannot assert system role
  if (context.userRole === 'system' && !isAuthorizedSystemContext(context)) {
    throw new ContextAuthorizationError(
      'System execution context rejected: Ordinary callers cannot claim userRole "system" without internal system authorization.'
    );
  }
}

/**
 * Validates tool JSON schema objects for byte-size and nesting depth.
 * Prevents memory exhaustion or stack overflows from circular/oversized schemas.
 */
export function validateJsonSchemaSecurity(
  schema: unknown,
  maxDepth = SCHEMA_LIMITS.MAX_SCHEMA_DEPTH
): void {
  if (!schema || typeof schema !== 'object') {
    throw new GatewayValidationError('Tool schema must be a non-null object');
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(schema);
  } catch {
    throw new GatewayValidationError('Tool schema contains circular references or cannot be serialized to JSON');
  }

  const byteLength = Buffer.byteLength(serialized, 'utf8');
  if (byteLength > SCHEMA_LIMITS.MAX_SCHEMA_BYTE_SIZE) {
    throw new GatewayValidationError(
      `Tool schema size (${byteLength} bytes) exceeds maximum limit of ${SCHEMA_LIMITS.MAX_SCHEMA_BYTE_SIZE} bytes`
    );
  }

  function checkDepth(obj: any, currentDepth: number, visited = new WeakSet()): void {
    if (currentDepth > maxDepth) {
      throw new GatewayValidationError(
        `Tool schema nesting depth exceeds maximum allowed limit of ${maxDepth} levels`
      );
    }
    if (obj && typeof obj === 'object') {
      if (visited.has(obj)) return;
      visited.add(obj);
      for (const key of Object.keys(obj)) {
        checkDepth(obj[key], currentDepth + 1, visited);
      }
    }
  }

  checkDepth(schema, 0);
}

/**
 * Validates the byte size of proposed tool arguments returned by AI models.
 */
export function validateToolArgumentsSize(args: unknown): void {
  if (args === undefined || args === null) return;
  try {
    const serialized = JSON.stringify(args);
    const byteLength = Buffer.byteLength(serialized, 'utf8');
    if (byteLength > SCHEMA_LIMITS.MAX_ARGUMENT_BYTE_SIZE) {
      throw new GatewayValidationError(
        `Tool arguments payload (${byteLength} bytes) exceeds limit of ${SCHEMA_LIMITS.MAX_ARGUMENT_BYTE_SIZE} bytes`
      );
    }
  } catch (err: any) {
    if (err instanceof GatewayValidationError) throw err;
    throw new GatewayValidationError('Tool arguments could not be safely validated');
  }
}

/**
 * Validates incoming request structure, bounds, schemas, and configurations.
 */
export function validateRequestSecurity(
  request: AiGatewayRequest,
  targetModel?: string
): void {
  if (!request || typeof request !== 'object') {
    throw new GatewayValidationError('Gateway request payload is missing');
  }

  if (!request.taskType || typeof request.taskType !== 'string') {
    throw new GatewayValidationError('Gateway request taskType is required');
  }

  // Validate model identifier if specified
  if (targetModel) {
    if (!(APPROVED_MODELS as readonly string[]).includes(targetModel)) {
      throw new GatewayValidationError(
        `Model '${targetModel}' is not approved for use. Approved models: ${APPROVED_MODELS.join(', ')}`
      );
    }
  }

  // Validate Prompt Size
  if (request.prompt !== undefined) {
    if (typeof request.prompt !== 'string') {
      throw new GatewayValidationError('Prompt must be a string');
    }
    if (request.prompt.length > REQUEST_LIMITS.MAX_PROMPT_CHARS) {
      throw new GatewayValidationError(
        `Prompt length (${request.prompt.length}) exceeds maximum allowed limit of ${REQUEST_LIMITS.MAX_PROMPT_CHARS} characters`
      );
    }
  }

  // Validate Multi-Turn Messages
  if (request.messages !== undefined) {
    if (!Array.isArray(request.messages)) {
      throw new GatewayValidationError('Messages must be an array');
    }

    if (request.messages.length > REQUEST_LIMITS.MAX_MESSAGE_COUNT) {
      throw new GatewayValidationError(
        `Message count (${request.messages.length}) exceeds maximum allowed limit of ${REQUEST_LIMITS.MAX_MESSAGE_COUNT}`
      );
    }

    let totalChars = 0;
    for (let i = 0; i < request.messages.length; i++) {
      const msg = request.messages[i];
      if (!msg || typeof msg !== 'object') {
        throw new GatewayValidationError(`Message at index ${i} is invalid`);
      }
      if (!msg.role || !['system', 'user', 'assistant', 'tool'].includes(msg.role)) {
        throw new GatewayValidationError(`Message at index ${i} has invalid role: ${msg.role}`);
      }
      if (typeof msg.content !== 'string') {
        throw new GatewayValidationError(`Message at index ${i} content must be a string`);
      }
      if (msg.content.length > REQUEST_LIMITS.MAX_SINGLE_MESSAGE_CHARS) {
        throw new GatewayValidationError(
          `Message at index ${i} length (${msg.content.length}) exceeds limit of ${REQUEST_LIMITS.MAX_SINGLE_MESSAGE_CHARS} characters`
        );
      }
      totalChars += msg.content.length;
    }

    if (totalChars > REQUEST_LIMITS.MAX_TOTAL_CONTEXT_CHARS) {
      throw new GatewayValidationError(
        `Total conversation context size (${totalChars} chars) exceeds maximum limit of ${REQUEST_LIMITS.MAX_TOTAL_CONTEXT_CHARS} characters`
      );
    }
  }

  // Require prompt, non-empty messages, or connection probe
  const hasPrompt = typeof request.prompt === 'string' && request.prompt.trim().length > 0;
  const hasMessages = Array.isArray(request.messages) && request.messages.length > 0;
  const isProbe = request.taskType === 'connection_probe';

  if (!hasPrompt && !hasMessages && !isProbe) {
    throw new GatewayValidationError(
      'Gateway request must provide either a non-empty prompt or a messages array'
    );
  }

  // Validate Generation Parameters
  if (request.temperature !== undefined) {
    if (
      typeof request.temperature !== 'number' ||
      Number.isNaN(request.temperature) ||
      request.temperature < REQUEST_LIMITS.MIN_TEMPERATURE ||
      request.temperature > REQUEST_LIMITS.MAX_TEMPERATURE
    ) {
      throw new GatewayValidationError(
        `Temperature must be a number between ${REQUEST_LIMITS.MIN_TEMPERATURE} and ${REQUEST_LIMITS.MAX_TEMPERATURE}`
      );
    }
  }

  if (request.maxOutputTokens !== undefined) {
    if (
      typeof request.maxOutputTokens !== 'number' ||
      !Number.isInteger(request.maxOutputTokens) ||
      request.maxOutputTokens < REQUEST_LIMITS.MIN_MAX_OUTPUT_TOKENS ||
      request.maxOutputTokens > REQUEST_LIMITS.MAX_MAX_OUTPUT_TOKENS
    ) {
      throw new GatewayValidationError(
        `maxOutputTokens must be an integer between ${REQUEST_LIMITS.MIN_MAX_OUTPUT_TOKENS} and ${REQUEST_LIMITS.MAX_MAX_OUTPUT_TOKENS}`
      );
    }
  }

  // Validate Tool Definitions
  if (request.tools !== undefined) {
    validateToolDefinitions(request.tools);
  }
}

/**
 * Validates declarative tool definitions, schema sizes, and recursion depths.
 */
export function validateToolDefinitions(tools: AiToolDefinition[]): void {
  if (!Array.isArray(tools)) {
    throw new GatewayValidationError('Tools must be an array');
  }

  if (tools.length > REQUEST_LIMITS.MAX_TOOL_DEFINITIONS) {
    throw new GatewayValidationError(
      `Number of tool definitions (${tools.length}) exceeds maximum of ${REQUEST_LIMITS.MAX_TOOL_DEFINITIONS}`
    );
  }

  for (let i = 0; i < tools.length; i++) {
    const tool = tools[i];
    if (!tool || typeof tool !== 'object') {
      throw new GatewayValidationError(`Tool at index ${i} is invalid`);
    }

    if (!tool.name || typeof tool.name !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(tool.name)) {
      throw new GatewayValidationError(
        `Tool at index ${i} has invalid name. Must be 1-64 alphanumeric characters, underscores, or dashes.`
      );
    }

    if (
      !tool.description ||
      typeof tool.description !== 'string' ||
      tool.description.length > REQUEST_LIMITS.MAX_TOOL_DESCRIPTION_LENGTH
    ) {
      throw new GatewayValidationError(
        `Tool '${tool.name}' has invalid description. Must be string up to ${REQUEST_LIMITS.MAX_TOOL_DESCRIPTION_LENGTH} chars.`
      );
    }

    if (!tool.parameters || typeof tool.parameters !== 'object') {
      throw new GatewayValidationError(`Tool '${tool.name}' parameters must be a JSON Schema object`);
    }

    // Enforce schema size and recursion depth limits
    validateJsonSchemaSecurity(tool.parameters);
  }
}

/**
 * Frames untrusted CRM content (notes, emails, transcripts) within an explicit structural boundary.
 * Sanitizes delimiter injection attempts, whitespace variations, and Unicode homoglyphs.
 *
 * NOTE: Prompt boundary framing is a containment measure, NOT a complete prompt injection defense.
 * Real permissions must always be checked independently server-side.
 */
export function frameUntrustedCrmContent(sourceLabel: string, rawContent: string): string {
  const sanitizedSource = (sourceLabel || 'crm_data')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .substring(0, 32);

  let safeContent = String(rawContent ?? '');

  // 1. Normalize Unicode brackets that models could interpret as XML/tag delimiters
  safeContent = safeContent
    .replace(/\uFF1C/g, '<')  // Fullwidth less-than ＜
    .replace(/\uFF1E/g, '>')  // Fullwidth greater-than ＞
    .replace(/\u27E8/g, '<')  // Mathematical left angle bracket ⟨
    .replace(/\u27E9/g, '>'); // Mathematical right angle bracket ⟩

  // 2. Escape all closing tag variants (accounting for arbitrary whitespace, attributes, or casing)
  safeContent = safeContent.replace(/<\/\s*untrusted_crm_context\b[^>]*>/gi, '&lt;/untrusted_crm_context&gt;');

  // 3. Escape all opening tag variants
  safeContent = safeContent.replace(/<\s*untrusted_crm_context\b/gi, '&lt;untrusted_crm_context');

  return `<untrusted_crm_context source="${sanitizedSource}">\n${safeContent}\n</untrusted_crm_context>`;
}

/**
 * Approved CRM Tools Registry Definition.
 */
export interface ApprovedToolSpec {
  name: string;
  allowedRoles: readonly ValidUserRole[];
  requiredParams?: string[];
}

/**
 * Default Approved Server-Side Tool Registry for CRM AI Features.
 * Reflects canonical CRM role permissions (Owner, Admin, Manager, Member, Read-only, System).
 */
export const APPROVED_CRM_TOOLS: Record<string, ApprovedToolSpec> = {
  get_lead_details: {
    name: 'get_lead_details',
    allowedRoles: ['owner', 'admin', 'manager', 'member', 'read-only', 'system'],
    requiredParams: ['id'],
  },
  search_leads: {
    name: 'search_leads',
    allowedRoles: ['owner', 'admin', 'manager', 'member', 'read-only', 'system'],
  },
  query_pipeline_metrics: {
    name: 'query_pipeline_metrics',
    allowedRoles: ['owner', 'admin', 'manager', 'system'],
  },
  create_task: {
    name: 'create_task',
    allowedRoles: ['owner', 'admin', 'manager', 'member', 'system'],
    requiredParams: ['title'],
  },
  search_knowledge_base: {
    name: 'search_knowledge_base',
    allowedRoles: ['owner', 'admin', 'manager', 'member', 'read-only', 'system'],
  },
};

/**
 * Validates tool call proposals returned by an AI model against the server-side registry.
 * Guarantees that AI models cannot invent unapproved tools or exceed user permissions.
 */
export function validateProposedToolCall(
  call: AiToolCall,
  userRole: ValidUserRole,
  customRegistry?: Record<string, ApprovedToolSpec>
): void {
  const registry = customRegistry || APPROVED_CRM_TOOLS;
  const spec = registry[call.name];

  if (!spec) {
    throw new GatewayValidationError(
      `AI model proposed an unknown or unapproved tool: '${call.name}'. Execution rejected.`
    );
  }

  if (!spec.allowedRoles.includes(userRole)) {
    throw new ContextAuthorizationError(
      `User role '${userRole}' is not authorized to execute tool '${call.name}'.`
    );
  }

  // Validate tool argument payload bounds
  validateToolArgumentsSize(call.arguments);

  if (spec.requiredParams && spec.requiredParams.length > 0) {
    const args = call.arguments || {};
    for (const param of spec.requiredParams) {
      if (args[param] === undefined || args[param] === null || String(args[param]).trim().length === 0) {
        throw new GatewayValidationError(
          `Tool '${call.name}' proposed without required argument: '${param}'.`
        );
      }
    }
  }
}

/**
 * Sanitizes tool call proposals returned by an AI model.
 * Strict architectural boundary: Model-generated arguments can NEVER override trusted tenant or user identities.
 * Authoritatively strips any model-suggested workspaceId or userId and binds the authenticated context.
 */
export function sanitizeProposedToolCall(
  call: AiToolCall,
  context: TrustedExecutionContext
): AiToolCall {
  const rawArgs = call.arguments && typeof call.arguments === 'object' ? { ...call.arguments } : {};

  // Strip any model-hallucinated or adversarial tenant/user identity overrides
  delete (rawArgs as any).workspaceId;
  delete (rawArgs as any).workspace_id;
  delete (rawArgs as any).userId;
  delete (rawArgs as any).user_id;
  delete (rawArgs as any).tenantId;
  delete (rawArgs as any).tenant_id;

  // Authoritatively bind trusted execution context
  const boundArgs = {
    ...rawArgs,
    workspaceId: context.workspaceId,
    userId: context.userId,
  };

  return {
    ...call,
    arguments: boundArgs,
  };
}

/**
 * Evaluates tenant-level and user-level rate limits using the CRM rate-limiter store.
 * Isolate limits strictly by authenticated workspace and user identity.
 */
export async function enforceAiGatewayRateLimits(
  context: TrustedExecutionContext
): Promise<void> {
  const tenantId = `tenant:${context.workspaceId}:ai`;
  const userId = `user:${context.workspaceId}:${context.userId}:ai`;

  // 1. Check Tenant Rate Limit (60 req / min)
  const tenantCheck = await checkRateLimit({
    identifier: tenantId,
    limit: RATE_LIMIT_PRESETS.AI_TENANT.limit,
    windowMs: RATE_LIMIT_PRESETS.AI_TENANT.windowMs,
  });

  if (!tenantCheck.success) {
    throw new AiGatewayError(
      'AI rate limit exceeded for workspace. Please retry after a brief delay.',
      'PROVIDER_COMMUNICATION_ERROR',
      429,
      true,
      context.traceId
    );
  }

  // 2. Check User Rate Limit (20 req / min)
  const userCheck = await checkRateLimit({
    identifier: userId,
    limit: RATE_LIMIT_PRESETS.AI_USER.limit,
    windowMs: RATE_LIMIT_PRESETS.AI_USER.windowMs,
  });

  if (!userCheck.success) {
    throw new AiGatewayError(
      'AI rate limit exceeded for user. Please retry after a brief delay.',
      'PROVIDER_COMMUNICATION_ERROR',
      429,
      true,
      context.traceId
    );
  }
}
