/**
 * CENTRALIZED TIMEZONE & DATE/TIME FORMATTING UTILITY
 * 
 * Default Application Timezone: Asia/Kolkata (IST - Indian Standard Time, UTC+05:30)
 * Locale: en-IN
 * 
 * Design Principles:
 * - Timestamps are stored as canonical UTC ISO strings in database / storage.
 * - Display conversions to Asia/Kolkata (IST) happen strictly at presentation boundaries.
 * - Date-only strings ('YYYY-MM-DD') are shielded against day-shift bugs.
 * - Never throws on invalid dates; returns clean fallbacks.
 */

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';
export const DEFAULT_LOCALE = 'en-IN';

export type DateInput = string | number | Date | null | undefined;

/**
 * Coerce any date input into a valid Date object or null
 */
export function parseDateSafe(input: DateInput): Date | null {
  if (!input) return null;
  if (input instanceof Date) {
    return isNaN(input.getTime()) ? null : input;
  }
  if (typeof input === 'number') {
    const d = new Date(input);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return null;

    // Handle date-only "YYYY-MM-DD" by parsing at midday UTC to avoid day-shift
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [year, month, day] = trimmed.split('-').map(Number);
      const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      return isNaN(d.getTime()) ? null : d;
    }

    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Format a timestamp into user-facing Date and Time in Asia/Kolkata (IST)
 * Example: "4 Nov 2026, 6:30 PM IST" or "04 Nov 2026, 06:30 PM"
 */
export function formatDateTime(
  input: DateInput,
  options?: {
    timeZone?: string;
    includeSeconds?: boolean;
    includeTimezoneName?: boolean;
    fallback?: string;
  }
): string {
  const date = parseDateSafe(input);
  if (!date) return options?.fallback || '—';

  const timeZone = options?.timeZone || DEFAULT_TIMEZONE;

  try {
    return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
      timeZone,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: options?.includeSeconds ? '2-digit' : undefined,
      hour12: true,
      timeZoneName: options?.includeTimezoneName ? 'short' : undefined,
    }).format(date);
  } catch {
    return date.toLocaleString(DEFAULT_LOCALE, { timeZone });
  }
}

/**
 * Format date only (e.g., "4 Nov 2026" or "04/11/2026") in Asia/Kolkata
 */
export function formatDate(
  input: DateInput,
  options?: {
    timeZone?: string;
    monthFormat?: 'short' | 'long' | 'numeric' | '2-digit';
    fallback?: string;
  }
): string {
  const date = parseDateSafe(input);
  if (!date) return options?.fallback || '—';

  const timeZone = options?.timeZone || DEFAULT_TIMEZONE;

  try {
    return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
      timeZone,
      day: 'numeric',
      month: options?.monthFormat || 'short',
      year: 'numeric',
    }).format(date);
  } catch {
    return date.toLocaleDateString(DEFAULT_LOCALE, { timeZone });
  }
}

/**
 * Format date-only string (e.g. expectedCloseDate "2026-11-20") without day-shift bug
 */
export function formatDateOnly(
  dateStr: string | null | undefined,
  fallback: string = '—'
): string {
  if (!dateStr || typeof dateStr !== 'string') return fallback;
  const trimmed = dateStr.trim();
  if (!trimmed) return fallback;

  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    const d = new Date(Date.UTC(year, month, day, 12, 0, 0));
    return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
      timeZone: DEFAULT_TIMEZONE,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(d);
  }

  return formatDate(trimmed, { fallback });
}

/**
 * Format time only (e.g., "6:30 PM IST")
 */
export function formatTime(
  input: DateInput,
  options?: {
    timeZone?: string;
    includeTimezoneName?: boolean;
    fallback?: string;
  }
): string {
  const date = parseDateSafe(input);
  if (!date) return options?.fallback || '—';

  const timeZone = options?.timeZone || DEFAULT_TIMEZONE;

  try {
    return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: options?.includeTimezoneName ? 'short' : undefined,
    }).format(date);
  } catch {
    return date.toLocaleTimeString(DEFAULT_LOCALE, { timeZone });
  }
}

/**
 * Relative time formatter with human-readable IST context
 * Examples: "Just now", "5m ago", "3h ago", "Yesterday", "In 2 days", "4 Nov 2026"
 */
export function formatRelativeTime(
  input: DateInput,
  options?: {
    fallback?: string;
  }
): string {
  const date = parseDateSafe(input);
  if (!date) return options?.fallback || '—';

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHrs = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (Math.abs(diffSec) < 45) {
    return 'Just now';
  }

  if (diffSec > 0) {
    // Past
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHrs < 24) return `${diffHrs}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(date);
  } else {
    // Future
    const absMin = Math.abs(diffMin);
    const absHrs = Math.abs(diffHrs);
    const absDays = Math.abs(diffDays);
    if (absMin < 60) return `In ${absMin}m`;
    if (absHrs < 24) return `In ${absHrs}h`;
    if (absDays === 1) return 'Tomorrow';
    if (absDays < 7) return `In ${absDays}d`;
    return formatDate(date);
  }
}

/**
 * Format timestamp into standard UTC ISO string for database persistence
 */
export function toUtcIsoString(input: DateInput): string {
  const date = parseDateSafe(input) || new Date();
  return date.toISOString();
}

