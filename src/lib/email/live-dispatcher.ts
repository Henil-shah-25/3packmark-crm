import { getSmtpConfig, sendSmtpEmail } from '@/lib/email/smtp';

export interface LiveEmailDispatchResult {
  sent: boolean;
  simulated: boolean;
  provider: 'resend' | 'smtp' | 'none';
  messageId?: string;
  error?: string;
}

async function sendViaResendIfConfigured(options: {
  to: string;
  subject: string;
  html: string;
  text: string;
  fromName?: string;
}): Promise<{ configured: boolean; success: boolean; messageId?: string; error?: string }> {
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) return { configured: false, success: false };

  const fromEmail = (process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev').trim();
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${options.fromName || '3W PACKMARK PRIVATE LIMITED'} <${fromEmail}>`,
        to: [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text,
      }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { configured: true, success: false, error: data?.message || `Resend error (${res.status})` };
    }
    return { configured: true, success: true, messageId: data?.id };
  } catch (err: any) {
    return { configured: true, success: false, error: err?.message || 'Resend request failed' };
  }
}

/**
 * Shared live email dispatcher using the exact same Resend -> Nodemailer SMTP
 * pipeline (with 8s timeout) as /api/email/send-quotation.
 */
export async function sendLiveCrmEmail(options: {
  to: string;
  subject: string;
  html: string;
  text: string;
  fromName?: string;
}): Promise<LiveEmailDispatchResult> {
  const resendResult = await sendViaResendIfConfigured(options);
  if (resendResult.configured) {
    if (resendResult.success) {
      return {
        sent: true,
        simulated: false,
        provider: 'resend',
        messageId: resendResult.messageId,
      };
    }
    return {
      sent: false,
      simulated: true,
      provider: 'resend',
      error: resendResult.error || 'Resend delivery failed',
    };
  }

  if (getSmtpConfig().isConfigured) {
    try {
      const smtpResult = await Promise.race([
        sendSmtpEmail({
          to: options.to,
          subject: options.subject,
          html: options.html,
          text: options.text,
          fromName: options.fromName || '3W PACKMARK PRIVATE LIMITED',
        }),
        new Promise<{ success: false; error: string }>((resolve) =>
          setTimeout(() => resolve({ success: false, error: 'SMTP timeout after 8s' }), 8000)
        ),
      ]);

      if (smtpResult.success) {
        return {
          sent: true,
          simulated: false,
          provider: 'smtp',
          messageId: (smtpResult as any).messageId,
        };
      }
      return {
        sent: false,
        simulated: true,
        provider: 'smtp',
        error: smtpResult.error || 'SMTP connection refused',
      };
    } catch (smtpErr: any) {
      return {
        sent: false,
        simulated: true,
        provider: 'smtp',
        error: smtpErr?.message || 'SMTP error',
      };
    }
  }

  return {
    sent: false,
    simulated: true,
    provider: 'none',
    error: 'SMTP / Resend not configured in .env or Settings',
  };
}
