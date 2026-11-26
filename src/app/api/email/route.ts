import { NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';
import { getAuthenticatedUser, canUserAccessLead } from '@/lib/auth/rbac';
import { getSmtpConfig, sendSmtpEmail } from '@/lib/email/smtp';

async function sendViaResendIfConfigured(options: {
  to: string;
  subject: string;
  html: string;
  text: string;
  fromName?: string;
}): Promise<{ configured: boolean; success: boolean; messageId?: string; error?: string }> {
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    return { configured: false, success: false };
  }

  const fromEmail = (process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev').trim();
  const from = `${options.fromName || '3packmark Private Limited'} <${fromEmail}>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        configured: true,
        success: false,
        error: data?.message || `Resend API error (${res.status})`,
      };
    }

    return {
      configured: true,
      success: true,
      messageId: data?.id,
    };
  } catch (err: any) {
    return {
      configured: true,
      success: false,
      error: err?.message || 'Resend request failed',
    };
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId') || 'ws-default';

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const templates = await crmRepo.getEmailTemplates(workspaceId);
    return NextResponse.json({ templates });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      workspaceId = 'ws-default',
      leadId,
      toEmail,
      subject,
      body: emailBody,
      html: customHtml,
      templateId,
      isQuotation,
    } = body;

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    if (!toEmail || !subject || !emailBody) {
      return NextResponse.json({ error: 'Recipient email, subject, and body are required' }, { status: 400 });
    }

    if (leadId) {
      const lead = await crmRepo.getLeadById(workspaceId, leadId);
      if (lead) {
        const pipelines = await crmRepo.getPipelines(workspaceId);
        const pipe = pipelines.find((p) => p.id === lead.pipelineId);
        if (!canUserAccessLead(authContext.user, lead, pipe)) {
          return NextResponse.json({ error: 'Permission denied: Cannot access targeted lead' }, { status: 403 });
        }
      }
    }

    const htmlPayload =
      customHtml ||
      `<div style="font-family: sans-serif; white-space: pre-wrap; color: #1e293b;">${emailBody}</div>`;

    // 1. Try Resend if configured
    const resendResult = await sendViaResendIfConfigured({
      to: toEmail,
      subject,
      html: htmlPayload,
      text: emailBody,
      fromName: '3packmark Private Limited',
    });

    if (resendResult.configured) {
      if (!resendResult.success) {
        await crmRepo.logEmail(workspaceId, {
          leadId,
          toEmail,
          subject,
          bodyPreview: emailBody.substring(0, 160),
          status: 'failed',
          templateId,
        });
        return NextResponse.json(
          { success: false, error: `Resend delivery failed: ${resendResult.error}` },
          { status: 502 }
        );
      }

      const log = await crmRepo.logEmail(workspaceId, {
        leadId,
        toEmail,
        subject,
        bodyPreview: emailBody.substring(0, 160),
        status: 'delivered',
        templateId,
      });

      if (leadId) {
        await crmRepo.logActivity(workspaceId, {
          leadId,
          type: 'email',
          title: isQuotation ? `Quotation Email Sent: ${subject}` : `Email Sent: ${subject}`,
          description: `Delivered to ${toEmail} via Resend by ${authContext.user.name}`,
          authorName: authContext.user.name,
        });
      }

      return NextResponse.json({
        success: true,
        simulated: false,
        log,
        message: `Email successfully delivered to ${toEmail}`,
      });
    }

    // 2. Try SMTP if configured
    const smtpConfig = getSmtpConfig();
    if (smtpConfig.isConfigured) {
      const sendResult = await sendSmtpEmail({
        to: toEmail,
        subject,
        text: emailBody,
        html: htmlPayload,
        fromName: '3packmark Private Limited',
      });

      if (!sendResult.success) {
        await crmRepo.logEmail(workspaceId, {
          leadId,
          toEmail,
          subject,
          bodyPreview: emailBody.substring(0, 160),
          status: 'failed',
          templateId,
        });

        return NextResponse.json(
          {
            success: false,
            error: `Email delivery failed: ${sendResult.error || 'SMTP rejection'}`,
          },
          { status: 502 }
        );
      }

      const log = await crmRepo.logEmail(workspaceId, {
        leadId,
        toEmail,
        subject,
        bodyPreview: emailBody.substring(0, 160),
        status: 'delivered',
        templateId,
      });

      if (leadId) {
        await crmRepo.logActivity(workspaceId, {
          leadId,
          type: 'email',
          title: isQuotation ? `Quotation Email Sent: ${subject}` : `Email Sent: ${subject}`,
          description: `Delivered to ${toEmail} by ${authContext.user.name}`,
          authorName: authContext.user.name,
        });
      }

      return NextResponse.json({
        success: true,
        simulated: false,
        log,
        message: `Email successfully delivered to ${toEmail}`,
      });
    }

    // 3. Simulated / Logged mode when neither SMTP nor Resend credentials are set in .env
    const simulatedLog = await crmRepo.logEmail(workspaceId, {
      leadId,
      toEmail,
      subject,
      bodyPreview: `[SIMULATED] ${emailBody.substring(0, 145)}`,
      status: 'delivered',
      templateId,
    });

    if (leadId) {
      await crmRepo.logActivity(workspaceId, {
        leadId,
        type: 'email',
        title: isQuotation ? `Quotation Email Logged (Simulated): ${subject}` : `Email Logged (Simulated): ${subject}`,
        description: `Logged for ${toEmail} by ${authContext.user.name}. Configure SMTP_USER/SMTP_PASS or RESEND_API_KEY in .env for live delivery.`,
        authorName: authContext.user.name,
      });
    }

    return NextResponse.json({
      success: true,
      simulated: true,
      log: simulatedLog,
      message: `Quotation email logged in CRM for ${toEmail} (Simulated mode — add SMTP or Resend credentials in .env for live dispatch).`,
    });
  } catch (err: any) {
    console.error('[API Email POST Error]:', err);
    return NextResponse.json({ error: err.message || 'Failed to dispatch email' }, { status: 500 });
  }
}
