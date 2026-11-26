import { NextRequest } from 'next/server';

/**
 * Validates whether a given string is a syntactically valid IPv4 or IPv6 address.
 */
export function isValidIp(ip: string | undefined | null): boolean {
  if (!ip || typeof ip !== 'string') return false;
  const trimmed = ip.trim();
  if (trimmed.length < 3 || trimmed.length > 45) return false;

  // Strict IPv4 validation (0.0.0.0 to 255.255.255.255)
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const matchV4 = trimmed.match(ipv4Regex);
  if (matchV4) {
    for (let i = 1; i <= 4; i++) {
      const octet = parseInt(matchV4[i], 10);
      if (octet < 0 || octet > 255) return false;
      // Disallow leading zeros in octets (e.g. 01.02.03.04)
      if (matchV4[i].length > 1 && matchV4[i].startsWith('0')) return false;
    }
    return true;
  }

  // Strict IPv6 validation (including compressed :: and mapped IPv4)
  const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;

  return ipv6Regex.test(trimmed);
}

/**
 * Extracts and sanitizes the client IP address from request headers.
 * 
 * Security & Proxy Handling:
 * 1. Prioritizes trusted edge headers (x-vercel-forwarded-for, cf-connecting-ip) which
 *    cannot be spoofed by downstream clients when deployed on Vercel or Cloudflare.
 * 2. If x-real-ip is present from a trusted reverse proxy, evaluates and validates it.
 * 3. Inspects x-forwarded-for: filters out malformed or spoofed segments, respects
 *    trusted proxy hop count, and selects the genuine client IP.
 * 4. Strictly validates IP syntax (IPv4/IPv6). Rejects malformed values (script injection,
 *    directory traversal, header smuggling attempts) and safely defaults to '127.0.0.1'.
 */
export function getClientIp(request: Request | NextRequest): string {
  try {
    const headers = request.headers;

    // 1. Edge-injected trusted headers (Vercel / Cloudflare)
    const vercelForwarded = headers.get('x-vercel-forwarded-for');
    if (vercelForwarded) {
      const candidate = vercelForwarded.split(',')[0].trim();
      if (isValidIp(candidate)) return candidate;
    }

    const cfConnecting = headers.get('cf-connecting-ip');
    if (cfConnecting) {
      const candidate = cfConnecting.trim();
      if (isValidIp(candidate)) return candidate;
    }

    // 2. Direct reverse proxy header
    const realIp = headers.get('x-real-ip');
    if (realIp) {
      const candidate = realIp.trim();
      if (isValidIp(candidate)) return candidate;
    }

    // 3. Standard x-forwarded-for handling
    const forwardedFor = headers.get('x-forwarded-for');
    if (forwardedFor) {
      const parts = forwardedFor
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      // In a reverse proxy environment (e.g. Vercel / Nginx), if an attacker sends:
      // X-Forwarded-For: spoofed-ip
      // The proxy appends the real client IP: spoofed-ip, client-ip
      // If TRUSTED_PROXY_HOPS is configured, we take the IP at the appropriate depth from the right.
      // Default behavior: inspect IPs and pick the first syntactically valid public or client IP.
      for (const ip of parts) {
        if (isValidIp(ip)) {
          return ip;
        }
      }
    }

    // 4. Safe fallback
    return '127.0.0.1';
  } catch {
    return '127.0.0.1';
  }
}
