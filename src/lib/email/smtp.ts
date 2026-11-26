import nodemailer from 'nodemailer';
import { CalendarEvent, Lead } from '@/types/crm';
import { formatDate, formatTime } from '@/lib/dateTime';

/**
 * GMAIL SMTP CLIENT & EMAIL DISPATCHER
 * Reuses existing environment variables: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS.
 * Never logs or exposes password secrets to frontend or logs.
 */

export interface SmtpConfigInfo {
  host: string;
  port: number;
  user: string;
  isConfigured: boolean;
  hasUser: boolean;
  hasPass: boolean;
}

export function getSmtpConfig(): SmtpConfigInfo & { pass: string } {
  const host = (
    process.env.SMTP_HOST ||
    process.env.GMAIL_SMTP_HOST ||
    'smtp.gmail.com'
  ).replace(/^["']|["']$/g, '').trim();

  const portRaw = (
    process.env.SMTP_PORT ||
    process.env.GMAIL_SMTP_PORT ||
    '587'
  ).replace(/^["']|["']$/g, '').trim();
  const port = parseInt(portRaw, 10) || 587;

  const user = (
    process.env.SMTP_USER ||
    process.env.GMAIL_USER ||
    process.env.EMAIL_USER ||
    process.env.GMAIL_ADDRESS ||
    ''
  ).replace(/^["']|["']$/g, '').trim();

  const pass = (
    process.env.SMTP_PASS ||
    process.env.SMTP_PASSWORD ||
    process.env.GMAIL_PASS ||
    process.env.GMAIL_APP_PASSWORD ||
    process.env.EMAIL_PASS ||
    process.env.EMAIL_PASSWORD ||
    ''
  ).replace(/^["']|["']$/g, '').trim();

  const hasUser = user.length > 0;
  const hasPass = pass.length > 0;

  return {
    host,
    port,
    user,
    pass,
    hasUser,
    hasPass,
    isConfigured: hasUser && hasPass,
  };
}

export function getMaskedUser(email: string): string {
  if (!email || !email.includes('@')) return email ? 'Configured' : '';
  const [name, domain] = email.split('@');
  if (name.length <= 2) return `${name}***@${domain}`;
  return `${name.slice(0, 2)}***${name.slice(-1)}@${domain}`;
}

function createTransporter() {
  const config = getSmtpConfig();

  if (!config.isConfigured) {
    throw new Error('SMTP credentials not configured. Please verify SMTP_USER and SMTP_PASS in .env or Settings.');
  }

  const isSecure = config.port === 465;

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: isSecure, // true for 465, false for 587
    requireTLS: !isSecure && config.port === 587,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });
}

/**
 * Verifies SMTP connection without sending an email.
 */
export async function testSmtpConnection(): Promise<{
  success: boolean;
  state: 'not_configured' | 'configured' | 'connected' | 'auth_failed' | 'error';
  message: string;
  host: string;
  port: number;
  user: string;
  isConfigured: boolean;
}> {
  const config = getSmtpConfig();

  if (!config.isConfigured) {
    let msg = 'SMTP credentials are not configured.';
    if (!config.hasUser && !config.hasPass) {
      msg = 'SMTP_USER and SMTP_PASS (Google App Password) are missing from your environment variables.';
    } else if (!config.hasUser) {
      msg = 'SMTP_USER (your Gmail address) is missing in environment variables.';
    } else if (!config.hasPass) {
      msg = 'SMTP_PASS (your 16-character Google App Password) is missing in environment variables.';
    }

    return {
      success: false,
      state: 'not_configured',
      isConfigured: false,
      message: msg,
      host: config.host,
      port: config.port,
      user: getMaskedUser(config.user),
    };
  }

  try {
    const transporter = createTransporter();
    await transporter.verify();
    return {
      success: true,
      state: 'connected',
      isConfigured: true,
      message: `Connected successfully to Gmail SMTP (${config.host}:${config.port}) as ${config.user}`,
      host: config.host,
      port: config.port,
      user: getMaskedUser(config.user),
    };
  } catch (err: any) {
    const rawMsg = err.message || '';
    if (
      rawMsg.includes('535') ||
      rawMsg.includes('Username and Password not accepted') ||
      rawMsg.includes('Invalid login') ||
      rawMsg.includes('BadCredentials')
    ) {
      return {
        success: false,
        state: 'auth_failed',
        isConfigured: true,
        message: 'Gmail authentication failed (535-5.7.8). For Google accounts with 2-Step Verification, you must generate a 16-character App Password at myaccount.google.com/apppasswords.',
        host: config.host,
        port: config.port,
        user: getMaskedUser(config.user),
      };
    }

    if (rawMsg.includes('ETIMEDOUT') || rawMsg.includes('ECONNREFUSED') || rawMsg.includes('ENOTFOUND')) {
      return {
        success: false,
        state: 'error',
        isConfigured: true,
        message: `Network connection to SMTP server (${config.host}:${config.port}) failed: ${rawMsg}`,
        host: config.host,
        port: config.port,
        user: getMaskedUser(config.user),
      };
    }

    return {
      success: false,
      state: 'error',
      isConfigured: true,
      message: rawMsg || 'SMTP authentication failed.',
      host: config.host,
      port: config.port,
      user: getMaskedUser(config.user),
    };
  }
}

/**
 * Sends a real email via Gmail SMTP.
 */
export async function sendSmtpEmail(options: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  fromName?: string;
  attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }>;
}): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  try {
    const transporter = createTransporter();
    const config = getSmtpConfig();
    const fromAddress = `"${options.fromName || '3W PACKMARK PRIVATE LIMITED'}" <${config.user}>`;

    const info = await transporter.sendMail({
      from: fromAddress,
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || options.html.replace(/<[^>]*>?/gm, ''),
      attachments: options.attachments,
    });

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (err: any) {
    console.error('[SMTP Send Error]:', err.message);
    return {
      success: false,
      error: err.message || 'Failed to dispatch email via SMTP transporter.',
    };
  }
}

/**
 * Sends an executive meeting invitation with Google Meet details.
 */
export async function sendMeetingInvite(
  meeting: CalendarEvent,
  lead?: Lead | null
): Promise<{ success: boolean; error?: string }> {
  if (!meeting.attendees || meeting.attendees.length === 0) {
    return { success: false, error: 'No attendee emails provided.' };
  }

  const startDate = new Date(meeting.startIso);
  const formattedDate = formatDate(startDate);
  const formattedTime = formatTime(startDate, { includeTimezoneName: true });

  const meetButtonHtml = meeting.meetUrl
    ? `
      <div style="margin: 24px 0;">
        <a href="${meeting.meetUrl}" style="background-color: #376E60; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 9999px; font-weight: bold; font-size: 14px; display: inline-block;">
          Join with Google Meet
        </a>
        <p style="margin-top: 8px; font-size: 12px; color: #77766F;">
          Or copy link: <a href="${meeting.meetUrl}" style="color: #376E60;">${meeting.meetUrl}</a>
        </p>
      </div>
    `
    : '';

  const html = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FBFAF6; padding: 24px; color: #252725;">
        <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border: 1px solid #E4E0D6; border-radius: 24px; padding: 32px;">
          <h2 style="font-size: 20px; font-weight: bold; margin-top: 0; color: #252725;">
            ${meeting.title}
          </h2>
          <p style="font-size: 14px; color: #55544E; line-height: 1.5;">
            You have been invited to a scheduled discovery session with Rapport CRM.
          </p>

          <div style="background-color: #F8F6F0; border-radius: 16px; padding: 18px; margin: 20px 0; border: 1px solid #EDE8DE;">
            <p style="margin: 0 0 8px 0; font-size: 13px;"><strong>Date:</strong> ${formattedDate}</p>
            <p style="margin: 0 0 8px 0; font-size: 13px;"><strong>Time:</strong> ${formattedTime}</p>
            ${lead ? `<p style="margin: 0 0 8px 0; font-size: 13px;"><strong>Company:</strong> ${lead.company}</p>` : ''}
            ${meeting.description ? `<p style="margin: 0; font-size: 13px;"><strong>Agenda:</strong> ${meeting.description}</p>` : ''}
          </div>

          ${meetButtonHtml}

          <hr style="border: none; border-top: 1px solid #EDE8DE; margin: 24px 0;" />
          <p style="font-size: 11px; color: #8A8880; margin-bottom: 0;">
            Sent by Rapport CRM • Google Calendar & Google Meet Integrated
          </p>
        </div>
      </body>
    </html>
  `;

  return sendSmtpEmail({
    to: meeting.attendees,
    subject: `Invitation: ${meeting.title} @ ${formattedDate} (${formattedTime})`,
    html,
  });
}
