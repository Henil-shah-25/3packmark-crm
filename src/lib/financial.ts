import { Lead, Workspace } from '../types/crm';

/**
 * FINANCIAL & KPI CALCULATION ENGINE
 * Centralized, type-safe, currency-aware, and duplicate-safe business logic.
 *
 * Rules:
 * - Internal amounts are ALWAYS stored and aggregated as IEEE-754 finite numbers.
 * - String inputs (from Google Sheets or user entry) are validated and coerced at data boundaries.
 * - Currency formatting is applied strictly at the presentation layer using Intl.NumberFormat.
 * - Zero, null, empty, and invalid values are handled explicitly without fake fallback defaults.
 * - Duplicate deal IDs are eliminated before any metric aggregation.
 */

/**
 * Safely parse any raw value (cell, form input, JSON string) into a finite numeric value.
 * Supports:
 * - Standard numbers: 56180 -> 56180
 * - Numeric strings: "56180" -> 56180
 * - Currency formatted strings: "$56,180.50", "€ 42.000,00", "£12,000"
 * - Accounting negative format: "(1,234.50)" -> -1234.50
 * - Empty, null, undefined -> fallback (default 0)
 * - Spreadsheet errors: "#ERROR!", "#VALUE!", "#REF!", "#N/A", "NaN" -> fallback (default 0)
 */
export function parseFinancialNumber(raw: unknown, fallback: number = 0): number {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : fallback;
  }
  if (typeof raw === 'boolean') return fallback;

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return fallback;

    // Check spreadsheet formula errors
    if (trimmed.startsWith('#') || trimmed.toUpperCase() === 'NAN' || trimmed.toUpperCase() === 'UNDEFINED' || trimmed.toUpperCase() === 'NULL') {
      return fallback;
    }

    // Check accounting parenthesis format: (1,234.50) -> -1234.50
    const isNegativeParen = /^\((.*)\)$/.test(trimmed);
    const inner = isNegativeParen ? trimmed.slice(1, -1) : trimmed;

    // Remove any currency symbols, commas, and whitespace
    // Retain digits, minus, and dot
    // If European format with dots as thousand and comma as decimal (e.g. 1.234,50), handle appropriately
    let sanitized = inner.replace(/[^0-9.,-]/g, '').trim();

    if (!sanitized) return fallback;

    // Distinguish between European "1.234,50" and Standard "1,234.50"
    if (sanitized.includes(',') && sanitized.includes('.')) {
      if (sanitized.lastIndexOf(',') > sanitized.lastIndexOf('.')) {
        // e.g. 1.234,50 -> 1234.50
        sanitized = sanitized.replace(/\./g, '').replace(',', '.');
      } else {
        // e.g. 1,234.50 -> 1234.50
        sanitized = sanitized.replace(/,/g, '');
      }
    } else if (sanitized.includes(',')) {
      // If only comma exists: check if it represents decimal (e.g. "45,5") or thousands ("1,000")
      const parts = sanitized.split(',');
      if (parts.length === 2 && parts[1].length <= 2) {
        sanitized = sanitized.replace(',', '.');
      } else {
        sanitized = sanitized.replace(/,/g, '');
      }
    }

    const parsed = Number(sanitized);
    if (!Number.isFinite(parsed)) return fallback;

    return isNegativeParen ? -parsed : parsed;
  }

  return fallback;
}

/**
 * Safely parse probability or percentage value (0-100)
 */
export function parsePercentage(raw: unknown, fallback: number = 0): number {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 100) : fallback;
  }
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/%/g, '').trim();
    const num = parseFinancialNumber(cleaned, fallback);
    return Math.min(Math.max(num, 0), 100);
  }
  return fallback;
}

/**
 * Currency Symbol to ISO-4217 Currency Code lookup
 */
const CURRENCY_MAP: Record<string, string> = {
  '$': 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
  '₹': 'INR',
  'C$': 'CAD',
  'A$': 'AUD',
  'CHF': 'CHF',
};

/**
 * Format numeric amount into standardized currency display.
 * Defaults to Indian Rupee (INR / ₹) with en-IN numbering.
 * Never outputs NaN, undefined, or corrupted values.
 */
export function formatCurrency(
  amount: unknown,
  currencyCodeOrSymbol: string = 'INR',
  options?: {
    compact?: boolean;
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    locale?: string;
  }
): string {
  const numericAmount = parseFinancialNumber(amount, 0);

  const cleanCurrency = (currencyCodeOrSymbol || 'INR').trim();
  const isoCode = CURRENCY_MAP[cleanCurrency] || (cleanCurrency.length === 3 ? cleanCurrency.toUpperCase() : 'INR');

  // Determine appropriate locale based on currency
  const locale = options?.locale || (
    isoCode === 'INR' ? 'en-IN' :
    isoCode === 'EUR' ? 'en-IE' :
    isoCode === 'GBP' ? 'en-GB' :
    isoCode === 'JPY' ? 'ja-JP' :
    'en-US'
  );

  try {
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: isoCode,
      notation: options?.compact ? 'compact' : 'standard',
      minimumFractionDigits: options?.minimumFractionDigits ?? 0,
      maximumFractionDigits: options?.maximumFractionDigits ?? 0,
    });
    return formatter.format(numericAmount);
  } catch {
    // Graceful fallback if Intl fails for any reason
    const symbol = isoCode === 'INR' ? '₹' : (CURRENCY_MAP[isoCode] || cleanCurrency || '₹');
    return `${symbol}${numericAmount.toLocaleString(locale, {
      minimumFractionDigits: options?.minimumFractionDigits ?? 0,
      maximumFractionDigits: options?.maximumFractionDigits ?? 0,
    })}`;
  }
}

/**
 * Format a quota or probability attainment percentage safely
 */
export function formatPercent(value: unknown, fallback: string = '0%'): string {
  if (value === null || value === undefined) return fallback;
  const num = typeof value === 'number' ? value : parseFinancialNumber(value, NaN);
  if (!Number.isFinite(num)) return fallback;
  return `${Math.round(num)}%`;
}

/**
 * Remove duplicate deals by ID, preserving the most recently updated entry
 */
export function deduplicateLeads(leads: Lead[]): Lead[] {
  if (!Array.isArray(leads)) return [];
  const map = new Map<string, Lead>();

  for (const lead of leads) {
    if (!lead || !lead.id) continue;
    const existing = map.get(lead.id);
    if (!existing) {
      map.set(lead.id, lead);
    } else {
      // Pick the record with latest updatedAt / createdAt
      const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
      const currentTime = new Date(lead.updatedAt || lead.createdAt || 0).getTime();
      if (currentTime >= existingTime) {
        map.set(lead.id, lead);
      }
    }
  }

  return Array.from(map.values());
}

/**
 * Sanitize a single lead record at the data-access boundary
 */
export function sanitizeLead(lead: Lead): Lead {
  const cleanValue = parseFinancialNumber(lead.value, 0);
  const cleanProb = parsePercentage(lead.closingProbability, lead.status === 'Won' ? 100 : lead.status === 'Lost' ? 0 : 30);
  const cleanNotesCount = Math.max(0, Math.floor(parseFinancialNumber(lead.notesCount, 0)));

  // Sanitize phone if it contains spreadsheet formula error
  let phone = lead.phone || '';
  if (typeof phone === 'string' && phone.startsWith('#')) {
    phone = '';
  }

  // Sanitize and normalize lead scoring fields if present
  let cleanScore: number | undefined = undefined;
  const candidateScore =
    lead.leadScore !== undefined && lead.leadScore !== null
      ? lead.leadScore
      : (lead as any).lead_score !== undefined && (lead as any).lead_score !== null
      ? (lead as any).lead_score
      : undefined;

  if (candidateScore !== undefined && (typeof candidateScore !== 'string' || candidateScore.trim() !== '')) {
    cleanScore = Math.max(0, Math.min(100, Math.round(parseFinancialNumber(candidateScore, 0))));
  }

  let cleanTemp: 'HOT' | 'WARM' | 'COLD' | undefined = undefined;
  const rawTemp = (lead.leadTemperature || (lead as any).lead_temperature || '').toUpperCase();
  if (rawTemp === 'HOT' || rawTemp === 'WARM' || rawTemp === 'COLD') {
    cleanTemp = rawTemp as 'HOT' | 'WARM' | 'COLD';
  } else if (cleanScore !== undefined) {
    cleanTemp = cleanScore >= 70 ? 'HOT' : cleanScore >= 30 ? 'WARM' : 'COLD';
  }

  let cleanReasons: string[] | undefined = undefined;
  const rawReasons = lead.scoreReasons || (lead as any).score_reasons || (lead as any).scoreReasonsJson;
  if (Array.isArray(rawReasons)) {
    cleanReasons = rawReasons.map(String);
  } else if (typeof rawReasons === 'string' && rawReasons.trim().length > 0) {
    try {
      const parsed = JSON.parse(rawReasons);
      if (Array.isArray(parsed)) cleanReasons = parsed.map(String);
      else cleanReasons = [rawReasons];
    } catch {
      cleanReasons = [rawReasons];
    }
  }

  let cleanLineItems: any[] | undefined = undefined;
  const rawItems = lead.lineItems ?? lead.products ?? (lead as any).productsJson;
  if (Array.isArray(rawItems)) {
    cleanLineItems = rawItems;
  } else if (typeof rawItems === 'string' && rawItems.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(rawItems);
      if (Array.isArray(parsed)) cleanLineItems = parsed;
    } catch {
      // ignore invalid JSON
    }
  }

  return {
    ...lead,
    value: cleanValue,
    closingProbability: cleanProb,
    notesCount: cleanNotesCount,
    phone,
    ...(cleanScore !== undefined ? { leadScore: cleanScore, lead_score: cleanScore } : {}),
    ...(cleanTemp !== undefined ? { leadTemperature: cleanTemp, lead_temperature: cleanTemp } : {}),
    ...(cleanReasons !== undefined ? { scoreReasons: cleanReasons, score_reasons: cleanReasons } : {}),
    ...(cleanLineItems !== undefined ? { lineItems: cleanLineItems, products: cleanLineItems } : {}),
  };
}

/**
 * Comprehensive reconciliation of leads records:
 * Identifies and fixes malformed records without deleting legitimate user data.
 */
export function reconcileLeads(leads: Lead[]): {
  reconciled: Lead[];
  issuesFixed: { leadId: string; title: string; issue: string }[];
} {
  const issuesFixed: { leadId: string; title: string; issue: string }[] = [];
  const seenIds = new Set<string>();
  const uniqueLeads: Lead[] = [];

  for (const raw of leads) {
    if (!raw || !raw.id) continue;

    if (seenIds.has(raw.id)) {
      issuesFixed.push({
        leadId: raw.id,
        title: raw.title || 'Untitled Deal',
        issue: 'Duplicate deal ID removed from active aggregation',
      });
      continue;
    }
    seenIds.add(raw.id);

    let needsRepair = false;
    const issues: string[] = [];

    // Check value type
    if (typeof raw.value !== 'number' || !Number.isFinite(raw.value)) {
      needsRepair = true;
      issues.push(`Parsed non-numeric value "${raw.value}" -> ${parseFinancialNumber(raw.value, 0)}`);
    }

    // Check phone error
    if (typeof raw.phone === 'string' && raw.phone.startsWith('#')) {
      needsRepair = true;
      issues.push(`Cleared malformed spreadsheet phone error "${raw.phone}"`);
    }

    // Check status consistency
    let status = raw.status;
    let wonAt = raw.wonAt;
    let lostAt = raw.lostAt;
    let closingProbability = parsePercentage(raw.closingProbability, 30);

    if (raw.stageId === 'stg-won') {
      if (status !== 'Won') {
        status = 'Won';
        needsRepair = true;
        issues.push('Aligned stage stg-won to status Won');
      }
      closingProbability = 100;
      if (!wonAt) wonAt = raw.updatedAt || new Date().toISOString();
    } else if (raw.stageId === 'stg-loss') {
      if (status !== 'Lost') {
        status = 'Lost';
        needsRepair = true;
        issues.push('Aligned stage stg-loss to status Lost');
      }
      closingProbability = 0;
      if (!lostAt) lostAt = raw.updatedAt || new Date().toISOString();
    } else {
      // Reopened deal or active deal
      if (status === 'Won') {
        status = 'Qualified';
        needsRepair = true;
        issues.push('Active stage deal had stale Won status; reset to Qualified');
      } else if (status === 'Lost') {
        status = 'Qualified';
        needsRepair = true;
        issues.push('Active stage deal had stale Lost status; reset to Qualified');
      }
    }

    const clean = sanitizeLead({
      ...raw,
      status,
      wonAt,
      lostAt,
      closingProbability,
    });

    if (needsRepair) {
      issuesFixed.push({
        leadId: raw.id,
        title: raw.title,
        issue: issues.join('; '),
      });
    }

    uniqueLeads.push(clean);
  }

  return { reconciled: uniqueLeads, issuesFixed };
}

// ==========================================
// CANONICAL KPI CALCULATION FUNCTIONS
// ==========================================

/**
 * Won Revenue KPI:
 * Sum of numeric deal values for all unique deals with status === 'Won'
 */
export function calculateWonRevenue(leads: Lead[]): number {
  const unique = deduplicateLeads(leads);
  return unique.reduce((sum, l) => {
    if (l.status === 'Won' || l.stageId === 'stg-won') {
      return sum + parseFinancialNumber(l.value, 0);
    }
    return sum;
  }, 0);
}

const STATIC_PRERENDER_DATE = new Date('2026-10-26T12:00:00Z');

/**
 * Won This Month KPI:
 * Sum of numeric deal values for unique deals won within the current calendar month
 */
export function calculateWonThisMonth(leads: Lead[], referenceDate?: Date): number {
  const unique = deduplicateLeads(leads);
  const ref = referenceDate || (typeof window !== 'undefined' ? new Date() : STATIC_PRERENDER_DATE);
  const targetYear = ref.getFullYear();
  const targetMonth = ref.getMonth();

  return unique.reduce((sum, l) => {
    if (l.status !== 'Won' && l.stageId !== 'stg-won') return sum;

    // Use wonAt, or fallback to updatedAt / expectedCloseDate
    const dateStr = l.wonAt || l.updatedAt || l.expectedCloseDate;
    if (!dateStr) return sum;

    const d = new Date(dateStr);
    if (!isNaN(d.getTime()) && d.getFullYear() === targetYear && d.getMonth() === targetMonth) {
      return sum + parseFinancialNumber(l.value, 0);
    }
    return sum;
  }, 0);
}

/**
 * Open Pipeline KPI:
 * Sum of numeric deal values for unique active deals (excluding Won and Lost terminal stages)
 */
export function calculateOpenPipeline(leads: Lead[]): number {
  const unique = deduplicateLeads(leads);
  return unique.reduce((sum, l) => {
    if (l.status !== 'Won' && l.status !== 'Lost' && l.stageId !== 'stg-won' && l.stageId !== 'stg-loss') {
      return sum + parseFinancialNumber(l.value, 0);
    }
    return sum;
  }, 0);
}

/**
 * Weighted Forecast KPI:
 * Sum of (deal.value * (deal.closingProbability / 100)) across all open deals
 */
export function calculateWeightedForecast(leads: Lead[]): number {
  const unique = deduplicateLeads(leads);
  return unique.reduce((sum, l) => {
    if (l.status !== 'Won' && l.status !== 'Lost' && l.stageId !== 'stg-won' && l.stageId !== 'stg-loss') {
      const val = parseFinancialNumber(l.value, 0);
      const prob = parsePercentage(l.closingProbability, 50);
      return sum + (val * prob) / 100;
    }
    return sum;
  }, 0);
}

/**
 * Average Deal Size (ACV) KPI:
 * Mean value of deals.
 */
export function calculateAverageDealSize(leads: Lead[], scope: 'all' | 'won' | 'open' = 'all'): number {
  const unique = deduplicateLeads(leads);
  let filtered = unique;
  if (scope === 'won') {
    filtered = unique.filter((l) => l.status === 'Won' || l.stageId === 'stg-won');
  } else if (scope === 'open') {
    filtered = unique.filter((l) => l.status !== 'Won' && l.status !== 'Lost' && l.stageId !== 'stg-won' && l.stageId !== 'stg-loss');
  }

  if (filtered.length === 0) return 0;
  const total = filtered.reduce((sum, l) => sum + parseFinancialNumber(l.value, 0), 0);
  return Math.round(total / filtered.length);
}

/**
 * Win Rate KPI:
 * Percentage of closed deals that were won: (Won / (Won + Lost)) * 100
 * Returns 0 if no closed deals.
 */
export function calculateWinRate(leads: Lead[]): number {
  const unique = deduplicateLeads(leads);
  const wonCount = unique.filter((l) => l.status === 'Won' || l.stageId === 'stg-won').length;
  const lostCount = unique.filter((l) => l.status === 'Lost' || l.stageId === 'stg-loss').length;
  const totalClosed = wonCount + lostCount;

  if (totalClosed === 0) return 0;
  return Math.round((wonCount / totalClosed) * 100);
}

/**
 * Quota Attainment KPI:
 * (Won Revenue / Monthly Target) * 100
 * If monthly target is zero or negative, returns 0.
 */
export function calculateQuotaAttainment(wonRevenue: number, monthlyTarget: number): number {
  const target = parseFinancialNumber(monthlyTarget, 0);
  const revenue = parseFinancialNumber(wonRevenue, 0);
  if (target <= 0) return 0;
  return Math.round((revenue / target) * 100);
}

/**
 * Monthly revenue trend generator:
 * Computes actual won revenue per month for the past N months.
 */
export function calculateMonthlyRevenueTrend(
  leads: Lead[],
  monthsCount: number = 12,
  referenceDate?: Date,
  monthlyTarget: number = 0
): { month: string; year: number; revenue: number; target: number }[] {
  const unique = deduplicateLeads(leads);
  const ref = referenceDate || (typeof window !== 'undefined' ? new Date() : STATIC_PRERENDER_DATE);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const results: { month: string; year: number; revenue: number; target: number }[] = [];

  for (let i = monthsCount - 1; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    const m = d.getMonth();
    const y = d.getFullYear();

    const monthWonRevenue = unique.reduce((sum, l) => {
      if (l.status !== 'Won' && l.stageId !== 'stg-won') return sum;
      const dateStr = l.wonAt || l.updatedAt || l.expectedCloseDate;
      if (!dateStr) return sum;
      const dealDate = new Date(dateStr);
      if (!isNaN(dealDate.getTime()) && dealDate.getFullYear() === y && dealDate.getMonth() === m) {
        return sum + parseFinancialNumber(l.value, 0);
      }
      return sum;
    }, 0);

    results.push({
      month: monthNames[m],
      year: y,
      revenue: monthWonRevenue,
      target: parseFinancialNumber(monthlyTarget, 0),
    });
  }

  return results;
}
