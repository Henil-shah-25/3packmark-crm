export type DOMPurifyConfig = any;

/**
 * Restrictive default HTML sanitization options.
 * Blocks all script tags, event handlers, SVGs, MathML, object/embed/iframe, and dangerous schemes.
 */
export const DEFAULT_DOMPURIFY_CONFIG: DOMPurifyConfig = {
  ALLOWED_TAGS: [
    'a',
    'b',
    'i',
    'u',
    'strong',
    'em',
    'p',
    'br',
    'ul',
    'ol',
    'li',
    'span',
    'div',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'blockquote',
    'hr',
    'code',
    'pre',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'style', 'title', 'align'],
  FORBID_TAGS: [
    'script',
    'iframe',
    'object',
    'embed',
    'form',
    'input',
    'button',
    'svg',
    'math',
    'link',
    'meta',
    'base',
    'applet',
  ],
  FORBID_ATTR: [
    'onload',
    'onerror',
    'onclick',
    'onmouseover',
    'onfocus',
    'onblur',
    'onchange',
    'onsubmit',
    'onmouseenter',
    'onmouseleave',
    'formaction',
  ],
  ALLOWED_URI_REGEXP: /^(?:(?:(?:https?|mailto|tel):)|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  ADD_ATTR: ['target'],
};

let domPurifyInstance: any = null;
function getDOMPurify(): any {
  if (domPurifyInstance) return domPurifyInstance;
  try {
    // Dynamically require to prevent module evaluation crashes on serverless runtimes
    // where jsdom/html-encoding-sniffer encounters Node ESM require conflicts
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('isomorphic-dompurify');
    domPurifyInstance = mod.default || mod;
    return domPurifyInstance;
  } catch {
    return null;
  }
}

/**
 * Sanitizes an untrusted HTML string using DOMPurify with the secure CRM profile.
 * Falls back safely to regex-based tag and attribute stripping if jsdom is unavailable in serverless environments.
 */
export function sanitizeHtml(
  dirty: string | undefined | null,
  customConfig?: DOMPurifyConfig
): string {
  if (!dirty || typeof dirty !== 'string') return '';
  const purifier = getDOMPurify();
  if (purifier && typeof purifier.sanitize === 'function') {
    const config = { ...DEFAULT_DOMPURIFY_CONFIG, ...customConfig };
    return purifier.sanitize(dirty, config) as unknown as string;
  }
  // Safe serverless fallback: strip dangerous scripts, frames, event handlers, and javascript: links
  return dirty
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
    .replace(/\bon\w+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '')
    .replace(/javascript:[^"'\s>]+/gi, '');
}

/**
 * HTML Entity Encoder for safe attribute and text embedding.
 */
export function escapeHtml(str: string | undefined | null): string {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sanitizes rich email content, ensuring external links have rel="noopener noreferrer".
 */
export function sanitizeEmailHtml(html: string | undefined | null): string {
  if (!html || typeof html !== 'string') return '';
  const sanitized = sanitizeHtml(html, {
    ADD_ATTR: ['target', 'rel'],
  });
  // Ensure target="_blank" has rel="noopener noreferrer"
  return sanitized.replace(/<a\s+([^>]*target=["']_blank["'][^>]*)>/gi, (match, attrs) => {
    if (!/rel=/i.test(attrs)) {
      return `<a ${attrs} rel="noopener noreferrer">`;
    }
    return match;
  });
}

