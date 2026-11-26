export interface StageColorPreset {
  hex: string;
  label: string;
}

export const STAGE_COLOR_PRESETS: StageColorPreset[] = [
  { hex: '#F2C94C', label: 'Mineral Mustard' },
  { hex: '#C8431F', label: 'Terracotta Red' },
  { hex: '#2F5C50', label: 'Pine Green' },
  { hex: '#27496D', label: 'Slate Navy' },
  { hex: '#6B2D5C', label: 'Deep Plum' },
  { hex: '#4A5D23', label: 'Olive Moss' },
  { hex: '#8C4A27', label: 'Burnt Sienna' },
  { hex: '#1F5E6B', label: 'Deep Petrol' },
  { hex: '#7A283A', label: 'Burgundy Wine' },
  { hex: '#4E3B31', label: 'Espresso Umber' },
  { hex: '#17191A', label: 'Charcoal Ink' },
];

const DEFAULT_STAGE_HEX_BY_ID: Record<string, string> = {
  'stg-new-lead': '#F2C94C',
  'stg-call-status': '#C8431F',
  'stg-inquiry': '#2F5C50',
  'stg-quotation': '#27496D',
  'stg-quotation-follow-up': '#6B2D5C',
  'stg-purchase-order': '#4A5D23',
  'stg-invoice': '#8C4A27',
  'stg-dispatch': '#1F5E6B',
  'stg-credit-days': '#7A283A',
  'stg-credit-follow-up': '#4E3B31',
  'stg-closed': '#17191A',
};

const LEGACY_COLOR_MAP: Record<string, string> = {
  blue: '#27496D',
  slate: '#C8431F',
  mustard: '#F2C94C',
  yellow: '#F2C94C',
  indigo: '#27496D',
  teal: '#2F5C50',
  purple: '#6B2D5C',
  cyan: '#1F5E6B',
  amber: '#8C4A27',
  orange: '#C8431F',
  terracotta: '#C8431F',
  rose: '#7A283A',
  red: '#7A283A',
  green: '#4A5D23',
  charcoal: '#17191A',
  black: '#17191A',
  ink: '#17191A',
};

export function normalizeHex(raw?: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return trimmed.toUpperCase();
  if (/^#[0-9A-Fa-f]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed.split('');
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return null;
}

export function resolveStageHex(stage: { id?: string; name?: string; color?: string }): string {
  // Always honor an explicit saved #HEX color first
  const directHex = normalizeHex(stage.color);
  if (directHex) return directHex;

  const colorKey = (stage.color || '').trim().toLowerCase();
  if (colorKey && LEGACY_COLOR_MAP[colorKey]) {
    return LEGACY_COLOR_MAP[colorKey];
  }

  const idKey = (stage.id || '').trim().toLowerCase();
  if (DEFAULT_STAGE_HEX_BY_ID[idKey]) {
    return DEFAULT_STAGE_HEX_BY_ID[idKey];
  }

  const name = (stage.name || '').toLowerCase();
  if (name.includes('new lead')) return '#F2C94C';
  if (name.includes('call status')) return '#C8431F';
  if (name.includes('inquiry')) return '#2F5C50';
  if (name.includes('quotation follow')) return '#6B2D5C';
  if (name.includes('quotation')) return '#27496D';
  if (name.includes('purchase order')) return '#4A5D23';
  if (name.includes('invoice')) return '#8C4A27';
  if (name.includes('dispatch')) return '#1F5E6B';
  if (name.includes('credit days')) return '#7A283A';
  if (name.includes('credit follow')) return '#4E3B31';
  if (name.includes('closed')) return '#17191A';

  return '#17191A';
}

export function isLightHex(hex: string): boolean {
  const norm = normalizeHex(hex) || '#17191A';
  const r = parseInt(norm.slice(1, 3), 16);
  const g = parseInt(norm.slice(3, 5), 16);
  const b = parseInt(norm.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6;
}

export function getContrastTextHex(bgHex: string): string {
  return isLightHex(bgHex) ? '#17191A' : '#FFFFFF';
}
