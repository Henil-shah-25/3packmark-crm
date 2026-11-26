import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { runCronTick } from '@/lib/cron/scheduler';

export async function GET(request: NextRequest) {
  return handleCronTick(request);
}

export async function POST(request: NextRequest) {
  return handleCronTick(request);
}

async function handleCronTick(request: NextRequest) {
  try {
    const rawConfiguredSecret = process.env.CRON_SECRET;
    const configuredSecret = rawConfiguredSecret ? rawConfiguredSecret.trim() : '';

    // If CRON_SECRET is missing or empty, fail closed: reject safely without allowing execution
    if (!configuredSecret) {
      console.error('[API Cron Tick Error]: CRON_SECRET environment variable is not configured.');
      return NextResponse.json(
        { error: 'Unauthorized. Cron service authentication is not configured.' },
        { status: 401 }
      );
    }

    // Check headers and query params
    const authHeader = request.headers.get('authorization') || '';
    const cronSecretHeader = request.headers.get('x-cron-secret') || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    const providedSecret = (cronSecretHeader || bearerToken || request.nextUrl.searchParams.get('secret') || '').trim();

    if (!providedSecret) {
      return NextResponse.json(
        { error: 'Unauthorized. Invalid or missing CRON_SECRET.' },
        { status: 401 }
      );
    }

    // Constant-time comparison to prevent timing attacks without leaking secret in logs
    const providedBuffer = Buffer.from(providedSecret, 'utf8');
    const configuredBuffer = Buffer.from(configuredSecret, 'utf8');

    if (
      providedBuffer.length !== configuredBuffer.length ||
      !crypto.timingSafeEqual(providedBuffer, configuredBuffer)
    ) {
      return NextResponse.json(
        { error: 'Unauthorized. Invalid or missing CRON_SECRET.' },
        { status: 401 }
      );
    }

    const tickResult = await runCronTick();
    const hasErrors = Array.isArray(tickResult.errors) && tickResult.errors.length > 0;

    return NextResponse.json(
      {
        success: !hasErrors,
        data: tickResult,
        ...(hasErrors ? { error: 'Cron tick completed with errors', errors: tickResult.errors } : {}),
      },
      { status: hasErrors ? 207 : 200 }
    );
  } catch (error: any) {
    console.error('[API Cron Tick Error]:', error.message || 'Execution error');
    return NextResponse.json({ error: error.message || 'Cron tick execution failed' }, { status: 500 });
  }
}

