import { NextResponse } from 'next/server';
import { handleOAuthCallback } from '@/lib/calendar/google-calendar';
import { getAppBaseUrl } from '@/lib/app-url';

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
