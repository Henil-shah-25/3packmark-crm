import { NextResponse } from 'next/server';
import { handleOAuthCallback } from '@/lib/calendar/google-calendar';
import { getAppBaseUrl } from '@/lib/app-url';

/**
 * GOOGLE OAUTH CALLBACK ALIAS
 * Supports both /api/auth/google/callback and /api/calendar/callback
 * so users can use either in Google Cloud Console without redirect mismatch errors.
 */
export async function GET(req: Request) {
  const appOrigin = getAppBaseUrl(req);
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      return NextResponse.redirect(`${appOrigin}/?tab=settings&integration=google_calendar&error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return NextResponse.redirect(`${appOrigin}/?tab=settings&integration=google_calendar&error=Missing_code_or_state`);
    }

    const result = await handleOAuthCallback(code, state, req);

    return NextResponse.redirect(
      `${appOrigin}/?tab=settings&integration=google_calendar&status=connected&email=${encodeURIComponent(result.userEmail || '')}`
    );
  } catch (err: any) {
    return NextResponse.redirect(
      `${appOrigin}/?tab=settings&integration=google_calendar&error=${encodeURIComponent(err.message || 'Authorization_failed')}`
    );
  }
}
