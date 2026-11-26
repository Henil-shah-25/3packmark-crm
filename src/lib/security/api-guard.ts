import { NextResponse } from 'next/server';
import { stripPrototypePollution, hasPrototypePollution } from './validator';

export interface ParseJsonOptions {
  maxBytes?: number;
}

const DEFAULT_MAX_BYTES = 256 * 1024; // 256KB default API payload limit

/**
 * Safely parses and validates a JSON request body.
 * 
 * - Enforces maximum payload size (returns 413 Payload Too Large)
 * - Safely handles malformed JSON syntax (returns 400 Bad Request)
 * - Detects and neutralizes Prototype Pollution attempts
 */
export async function parseAndValidateJson<T = any>(
  req: Request,
  options: ParseJsonOptions = {}
): Promise<{ success: true; data: T } | { success: false; response: NextResponse }> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  // 1. Content-Length header inspection
  const contentLengthHeader = req.headers.get('content-length');
  if (contentLengthHeader) {
    const contentLength = parseInt(contentLengthHeader, 10);
    if (!isNaN(contentLength) && contentLength > maxBytes) {
      return {
        success: false,
        response: NextResponse.json(
          {
            error: 'Payload Too Large',
            message: `Request body exceeds maximum allowed size of ${maxBytes} bytes.`,
          },
          { status: 413 }
        ),
      };
    }
  }

  // 2. Read raw text and inspect length
  let rawText = '';
  try {
    rawText = await req.text();
  } catch (err: any) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Bad Request', message: 'Failed to read request body.' },
        { status: 400 }
      ),
    };
  }

  if (rawText.length > maxBytes) {
    return {
      success: false,
      response: NextResponse.json(
        {
          error: 'Payload Too Large',
          message: `Request body exceeds maximum allowed size of ${maxBytes} bytes.`,
        },
        { status: 413 }
      ),
    };
  }

  // 3. Parse JSON syntax
  let parsed: any;
  try {
    parsed = rawText ? JSON.parse(rawText) : {};
  } catch {
    return {
      success: false,
      response: NextResponse.json(
        {
          error: 'Bad Request',
          message: 'Malformed JSON payload. Please verify JSON syntax.',
        },
        { status: 400 }
      ),
    };
  }

  // 4. Check for Prototype Pollution
  if (hasPrototypePollution(parsed)) {
    console.warn('[Security Guard] Blocked Prototype Pollution attempt in JSON payload');
    return {
      success: false,
      response: NextResponse.json(
        {
          error: 'Bad Request',
          message: 'Invalid property keys detected in request payload.',
        },
        { status: 400 }
      ),
    };
  }

  const cleaned = stripPrototypePollution(parsed);
  return {
    success: true,
    data: cleaned as T,
  };
}

/**
 * Derives the verified tenant workspace ID from authenticated server context.
 * Strictly prevents clients from forging or overriding workspaceId.
 */
export function getEffectiveWorkspaceId(
  authContext: { user: { workspaceId: string }; isMasterAdmin?: boolean },
  requestedWorkspaceId?: string | null
): { workspaceId: string; isValid: boolean } {
  const verifiedWs = authContext.user.workspaceId;

  // If a specific workspace was requested and caller is not a master admin,
  // it must match their authenticated workspace.
  if (requestedWorkspaceId && requestedWorkspaceId !== verifiedWs) {
    if (!authContext.isMasterAdmin) {
      return { workspaceId: verifiedWs, isValid: false };
    }
    return { workspaceId: requestedWorkspaceId, isValid: true };
  }

  return { workspaceId: verifiedWs, isValid: true };
}

