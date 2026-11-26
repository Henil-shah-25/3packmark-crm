/**
 * Central Input Validation, Sanitization, and Injection Defense Module
 * 
 * Part of Developster Hub CRM Security Architecture (Phase 4).
 */

/**
 * Strips dangerous prototype pollution keys (__proto__, constructor, prototype) from an object.
 */
export function stripPrototypePollution<T>(obj: T): T {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return obj;
  }

  const cleaned: any = {};
  for (const key of Object.getOwnPropertyNames(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    const value = (obj as any)[key];
    if (value && typeof value === 'object') {
      if (Array.isArray(value)) {
        cleaned[key] = value.map((item) =>
          item && typeof item === 'object' ? stripPrototypePollution(item) : item
        );
      } else {
        cleaned[key] = stripPrototypePollution(value);
      }
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned as T;
}

/**
 * Validates whether an object contains prototype pollution attempts.
 */
export function hasPrototypePollution(obj: any): boolean {
  if (!obj || typeof obj !== 'object') return false;

  // Check if prototype was modified away from standard Object.prototype
  const proto = Object.getPrototypeOf(obj);
  if (proto !== null && proto !== Object.prototype && !Array.isArray(obj)) {
    if (typeof proto === 'object' && (proto.constructor === Object || Object.keys(proto).length > 0)) {
      return true;
    }
  }

  const keys = [...Object.keys(obj), ...Object.getOwnPropertyNames(obj)];
  for (const key of keys) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return true;
    }
    if (obj[key] && typeof obj[key] === 'object') {
      if (hasPrototypePollution(obj[key])) return true;
    }
  }
  return false;
}

/**
 * CSV / Spreadsheet Formula Injection defense.
 * 
 * Characters '=', '+', '-', '@', '\t', '\r' at the start of a cell in Excel or Google Sheets
 * can trigger dynamic DDE code execution or formula calculation.
 * Escapes the leading character by prefixing with a single quote.
 */
export function sanitizeCsvFormula(value: string | undefined | null): string {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  const dangerousPrefixes = ['=', '+', '-', '@', '\t', '\r'];
  if (dangerousPrefixes.some((p) => trimmed.startsWith(p))) {
    return `'${trimmed}`;
  }
  return value;
}

/**
 * Tests whether a string contains potential spreadsheet formula injection.
 */
export function isPotentialFormulaInjection(value: string | undefined | null): boolean {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  const dangerousPrefixes = ['=', '+', '-', '@', '\t', '\r'];
  return dangerousPrefixes.some((p) => trimmed.startsWith(p));
}

/**
 * Validates and sanitizes URLs to prevent 'javascript:', 'data:', and 'vbscript:' XSS.
 * Only allows safe protocols: http, https, mailto, tel.
 */
export function isSafeUrl(url: string | undefined | null, allowRelative = true): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();

  // Block control characters and whitespace tricks
  if (/[\x00-\x1F\x7F]/.test(trimmed)) return false;

  // Block protocol-relative URLs that could point to arbitrary domains
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) return false;

  // Relative URLs
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return allowRelative;
  }

  // Parse absolute URL
  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();
    const safeProtocols = ['http:', 'https:', 'mailto:', 'tel:'];
    return safeProtocols.includes(protocol);
  } catch {
    return false;
  }
}

/**
 * Sanitizes a URL, returning an empty string if unsafe.
 */
export function sanitizeUrl(url: string | undefined | null, fallback = ''): string {
  if (!isSafeUrl(url)) return fallback;
  return (url || '').trim();
}

/**
 * Strips all HTML/XML tags from a string.
 */
export function stripHtmlTags(input: string | undefined | null): string {
  if (!input || typeof input !== 'string') return '';
  return input.replace(/<[^>]*>/g, '').trim();
}

/**
 * Normalizes and validates basic email addresses.
 */
export function isValidEmail(email: string | undefined | null): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length > 254 || trimmed.length < 5) return false;
  // RFC 5322 compliant practical regex
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(trimmed);
}

/**
 * Validates basic phone number format (digits, optional leading +, dashes, spaces, brackets).
 */
export function isValidPhone(phone: string | undefined | null): boolean {
  if (!phone || typeof phone !== 'string') return false;
  const trimmed = phone.trim();
  if (trimmed.length < 5 || trimmed.length > 30) return false;
  // Allow leading +, digits, hyphens, dots, parentheses, spaces
  return /^\+?[\d\s\-\.\(\)]{5,30}$/.test(trimmed);
}

/**
 * Checks for path traversal attempts (e.g. '../', '..\', '%2e%2e').
 */
export function hasPathTraversal(pathStr: string | undefined | null): boolean {
  if (!pathStr || typeof pathStr !== 'string') return false;
  const decoded = decodeURIComponent(pathStr);
  return (
    decoded.includes('..') ||
    decoded.includes('/.') ||
    decoded.includes('\\.') ||
    decoded.includes('\0')
  );
}

/**
 * Filter an object by an allowlist of keys (prevents mass-assignment).
 */
export function pickAllowedFields<T extends Record<string, any>>(
  source: T,
  allowedKeys: readonly (keyof T | string)[]
): Partial<T> {
  if (!source || typeof source !== 'object') return {};
  const result: any = {};
  for (const key of allowedKeys) {
    if (Object.prototype.hasOwnProperty.call(source, key) && source[key as keyof T] !== undefined) {
      result[key] = source[key as keyof T];
    }
  }
  return result;
}

/**
 * Strips forbidden fields (such as role, workspaceId, permissions) from client updates.
 */
export function stripForbiddenFields<T extends Record<string, any>>(
  source: T,
  forbiddenKeys: readonly string[]
): Partial<T> {
  if (!source || typeof source !== 'object') return {};
  const result: any = { ...source };
  for (const key of forbiddenKeys) {
    delete result[key];
  }
  return result;
}

/**
 * Sanitizes plain text input with max length and formula escaping.
 */
export function sanitizePlainText(
  input: string | undefined | null,
  maxLength = 1000
): string {
  if (!input || typeof input !== 'string') return '';
  let str = input.trim().slice(0, maxLength);
  str = stripHtmlTags(str);
  str = sanitizeCsvFormula(str);
  return str;
}

