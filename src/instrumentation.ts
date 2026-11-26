export async function register() {
  // In serverless environments (Vercel), background schedulers do not run in-process.
  // Scheduled jobs are dispatched via HTTP endpoints (e.g. /api/cron/tick) by Vercel Cron.
  if (process.env.VERCEL) {
    return;
  }

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startInProcessScheduler } = await import('@/lib/cron/scheduler');
    startInProcessScheduler();
  }
}

