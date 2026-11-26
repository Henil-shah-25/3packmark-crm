import { ScheduledJob } from '@/types/crm';

export interface QStashPublishResult {
  scheduled: boolean;
  messageId?: string;
  reason?: string;
}

/**
 * Dispatches a delayed job to Upstash QStash for sub-daily scheduling.
 * 
 * Free Tier: 500 requests/day ($0 cost).
 * Requires environment variables:
 * - QSTASH_TOKEN: Token from console.upstash.com
 * - NEXT_PUBLIC_APP_URL or VERCEL_PROJECT_PRODUCTION_URL: Base URL for destination webhook
 */
export async function scheduleQStashJob(job: ScheduledJob): Promise<QStashPublishResult> {
  const token = process.env.QSTASH_TOKEN;
  if (!token) {
    // QStash is optional; fallback to daily cron and on-demand queue processing
    return {
      scheduled: false,
      reason: 'QSTASH_TOKEN is not configured. Job is stored in persistent CRM storage and will run via Daily Cron (0 9 * * *) or manual/in-process dispatcher.',
    };
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : 'https://developster-hub-crm.vercel.app');

  const destinationWebhook = `${appUrl.replace(/\/$/, '')}/api/automations/jobs/dispatch`;

  try {
    const scheduledTimeMs = new Date(job.scheduledFor).getTime();
    const notBeforeSec = Math.floor(scheduledTimeMs / 1000);

    const res = await fetch(`https://qstash.upstash.io/v2/publish/${encodeURI(destinationWebhook)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Upstash-Not-Before': String(notBeforeSec),
        'Upstash-Retries': '3',
      },
      body: JSON.stringify({
        jobId: job.id,
        workspaceId: job.workspaceId,
        source: 'qstash_scheduled_delivery',
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[QStash] Publish error: ${res.status} ${errText}`);
      return { scheduled: false, reason: `QStash returned ${res.status}: ${errText}` };
    }

    const json = await res.json();
    return {
      scheduled: true,
      messageId: json.messageId,
    };
  } catch (err: any) {
    console.warn('[QStash] Dispatch exception:', err.message);
    return { scheduled: false, reason: err.message };
  }
}

