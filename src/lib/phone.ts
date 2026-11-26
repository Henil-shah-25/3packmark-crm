import { parsePhoneNumberFromString, isValidPhoneNumber, CountryCode } from 'libphonenumber-js';

export interface CountryOption {
  code: CountryCode;
  name: string;
  dialCode: string;
  flag: string;
}

export const POPULAR_COUNTRIES: CountryOption[] = [
  { code: 'IN', name: 'India', dialCode: '+91', flag: '🇮🇳' },
  { code: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom', dialCode: '+44', flag: '🇬🇧' },
  { code: 'AE', name: 'United Arab Emirates', dialCode: '+971', flag: '🇦🇪' },
  { code: 'SG', name: 'Singapore', dialCode: '+65', flag: '🇸🇬' },
  { code: 'CA', name: 'Canada', dialCode: '+1', flag: '🇨🇦' },
  { code: 'AU', name: 'Australia', dialCode: '+61', flag: '🇦🇺' },
  { code: 'DE', name: 'Germany', dialCode: '+49', flag: '🇩🇪' },
  { code: 'FR', name: 'France', dialCode: '+33', flag: '🇫🇷' },
  { code: 'SA', name: 'Saudi Arabia', dialCode: '+966', flag: '🇸🇦' },
  { code: 'QA', name: 'Qatar', dialCode: '+974', flag: '🇶🇦' },
  { code: 'NZ', name: 'New Zealand', dialCode: '+64', flag: '🇳🇿' },
  { code: 'MY', name: 'Malaysia', dialCode: '+60', flag: '🇲🇾' },
  { code: 'ZA', name: 'South Africa', dialCode: '+27', flag: '🇿🇦' },
  { code: 'IE', name: 'Ireland', dialCode: '+353', flag: '🇮🇪' },
];

/**
 * Validates a phone string given a default country code
 */
export function isValidPhone(phone: string, defaultCountry: CountryCode = 'IN'): boolean {
  if (!phone || !phone.trim()) return true; // Optional fields are valid if blank
  try {
    const trimmed = phone.trim();
    if (trimmed.startsWith('+')) {
      return isValidPhoneNumber(trimmed);
    }
    return isValidPhoneNumber(trimmed, defaultCountry);
  } catch {
    return false;
  }
}

/**
 * Formats a phone string into standard E.164 (+919876543210)
 */
export function formatToE164(phone: string, defaultCountry: CountryCode = 'IN'): string {
  if (!phone || !phone.trim()) return '';
  const trimmed = phone.trim();
  try {
    const parsed = trimmed.startsWith('+')
      ? parsePhoneNumberFromString(trimmed)
      : parsePhoneNumberFromString(trimmed, defaultCountry);
    if (parsed && parsed.isValid()) {
      return parsed.format('E.164');
    }
  } catch {
    // Fall back to clean input
  }
  // Fallback: If only digits and starts with country dial code or missing +
  const cleanDigits = trimmed.replace(/[^\d+]/g, '');
  return cleanDigits;
}

/**
 * Builds a clean WhatsApp wa.me URL
 * Strips non-digits except initial digits so +91 98765 43210 -> https://wa.me/919876543210
 */
export function getWhatsAppUrl(phone: string, text?: string): string {
  if (!phone) return '';
  const clean = phone.replace(/\D/g, '');
  if (!clean) return '';
  const base = `https://wa.me/${clean}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

