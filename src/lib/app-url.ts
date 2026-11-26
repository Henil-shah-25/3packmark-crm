/**
 * Application URL and OAuth Redirect URI Resolver
 * Environment-aware: supports Vercel production/preview deployments, custom domains,
 * reverse proxies (x-forwarded-host / x-forwarded-proto), and local development.
 */

export function getAppBaseUrl(req?: Request): string {
  // 1. Explicitly configured application URL
  const envUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) {
    const cleaned = envUrl.trim().replace(/\/+$/, '');
    if (cleaned) {
      const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
      // In production, do not use localhost even if accidentally left in env
      if (!isProd || (!cleaned.includes('localhost') && !cleaned.includes('127.0.0.1'))) {
        return cleaned.startsWith('http') ? cleaned : `https://${cleaned}`;
      }
    }
  }

  // 2. Incoming request headers (Vercel, Cloudflare, custom domain reverse proxies)
  if (req) {
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    if (host) {
      const isLocalHost = host.includes('localhost') || host.includes('127.0.0.1');
      const proto = req.headers.get('x-forwarded-proto') || (isLocalHost ? 'http' : 'https');
      return `${proto}://${host}`.replace(/\/+$/, '');
    }
    try {
      const parsed = new URL(req.url);
      if (parsed.origin && parsed.origin !== 'null') {
        return parsed.origin.replace(/\/+$/, '');
      }
    } catch {
      // ignore
    }
  }

  // 3. Vercel deployment system variables
  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelProd) {
    return `https://${vercelProd.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
  }
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) {
    return `https://${vercelUrl.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
  }

  // 4. Local development fallback
  const port = process.env.PORT || '3000';
  return `http://localhost:${port}`;
}

/**
 * Resolves the Google OAuth redirect URI environment-aware.
 * Ensures production never redirects to localhost while preserving local development.
 */
export function resolveOAuthRedirectUri(req?: Request): string {
  const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
  const configuredUri = (process.env.GOOGLE_REDIRECT_URI || '').replace(/^["']|["']$/g, '').trim();

  if (configuredUri) {
    const hasLocalhost = configuredUri.includes('localhost') || configuredUri.includes('127.0.0.1');
    if (isProd) {
      // In production, only use configuredUri if it does not contain localhost
      if (!hasLocalhost) {
        return configuredUri;
      }
    } else {
      // In local development, configuredUri is fine
      return configuredUri;
    }
  }

  // Dynamically construct redirect URI using current environment base URL
  const baseUrl = getAppBaseUrl(req);
  return `${baseUrl}/api/calendar/callback`;
}

