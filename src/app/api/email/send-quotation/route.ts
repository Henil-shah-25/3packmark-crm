import { NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';
import { getAuthenticatedUser, canUserAccessLead } from '@/lib/auth/rbac';
import { getSmtpConfig, sendSmtpEmail } from '@/lib/email/smtp';
import {
  buildCommercialOfferHtml,
  COMMERCIAL_OFFER_TEMPLATE_ID,
  COMMERCIAL_OFFER_TEMPLATE_NAME,
  CommercialOfferConfig,
  DEFAULT_3W_SELLER,
  resolveSellerCompanyName,
} from '@/lib/quotation/commercialOfferTemplate';
import { buildCommercialOfferPdfBuffer } from '@/lib/quotation/commercialOfferPdf';
import { DealProductItem } from '@/types/crm';

async function sendViaResendIfConfigured(options: {
  to: string;
  subject: string;
  html: string;
  text: string;
  fromName?: string;
  pdfAttachment?: { filename: string; contentBase64: string };
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
        from: `${options.fromName || DEFAULT_3W_SELLER.companyName} <${fromEmail}>`,
        to: [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text,
        ...(options.pdfAttachment
          ? {
              attachments: [
                {
                  filename: options.pdfAttachment.filename,
                  content: options.pdfAttachment.contentBase64,
                },
              ],
            }
          : {}),
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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      workspaceId = 'ws-default',
      leadId,
      toEmail,
      subject,
      config,
      lineItems: overrideItems,
    } = body as {
      workspaceId?: string;
      leadId?: string;
      toEmail?: string;
      subject?: string;
      config?: CommercialOfferConfig;
      lineItems?: DealProductItem[];
    };

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    if (!leadId || !config) {
      return NextResponse.json({ error: 'leadId and quotation config are required' }, { status: 400 });
    }

    const effectiveWs = authContext.user.workspaceId;
    const lead = await crmRepo.getLeadById(effectiveWs, leadId);
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const pipelines = await crmRepo.getPipelines(effectiveWs);
    const pipe = pipelines.find((p) => p.id === lead.pipelineId);
    if (!canUserAccessLead(authContext.user, lead, pipe)) {
      return NextResponse.json({ error: 'Permission denied: Cannot access targeted lead' }, { status: 403 });
    }

    const recipient = (toEmail || lead.email || '').trim();
    if (!recipient) {
      return NextResponse.json({ error: 'Customer email address is required' }, { status: 400 });
    }

    const [workspaces, emailTemplates] = await Promise.all([
      crmRepo.getWorkspaces(),
      crmRepo.getEmailTemplates(effectiveWs),
    ]);
    const workspace = workspaces.find((w) => w.id === effectiveWs) || workspaces[0];
    const customOfferTpl = emailTemplates.find(
      (t) => t.id === COMMERCIAL_OFFER_TEMPLATE_ID || t.name === COMMERCIAL_OFFER_TEMPLATE_NAME
    );

    const items: DealProductItem[] =
      Array.isArray(overrideItems) && overrideItems.length > 0
        ? overrideItems
        : Array.isArray(lead.lineItems) && lead.lineItems.length > 0
        ? lead.lineItems
        : Array.isArray(lead.products)
        ? lead.products
        : [];

    const { html, voucherNo, grandTotal, subject: defaultSubject } = buildCommercialOfferHtml({
      lead,
      lineItems: items,
      workspace,
      config,
      customHtmlTemplate: customOfferTpl?.body,
    });

    const { buffer: pdfBuffer } = buildCommercialOfferPdfBuffer({
      lead,
      lineItems: items,
      workspace,
      config: { ...config, voucherNo },
    });
    const pdfFilename = `Commercial_Offer_${voucherNo}.pdf`;

    const sellerDisplay = resolveSellerCompanyName(workspace);
    const emailSubject = subject?.trim() || defaultSubject;
    const plainText = `Dear ${lead.contactName || 'Customer'}, Please find attached our Commercial Offer #${voucherNo} from ${sellerDisplay}. Grand Total: INR ${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}. Payment Terms: ${config.paymentTerms}. Terms of Delivery: ${config.termsOfDelivery}.`;

    let simulated = false;
    let deliveryNote = '';
    const resendResult = await sendViaResendIfConfigured({
      to: recipient,
      subject: emailSubject,
      html,
      text: plainText,
      fromName: sellerDisplay,
      pdfAttachment: {
        filename: pdfFilename,
        contentBase64: pdfBuffer.toString('base64'),
      },
    });

    if (resendResult.configured) {
      if (!resendResult.success) {
        simulated = true;
        deliveryNote = resendResult.error || 'Resend unreachable';
      }
    } else if (getSmtpConfig().isConfigured) {
      try {
        const smtpResult = await Promise.race([
          sendSmtpEmail({
            to: recipient,
            subject: emailSubject,
            html,
            text: plainText,
            fromName: sellerDisplay,
            attachments: [
              {
                filename: pdfFilename,
                content: pdfBuffer,
                contentType: 'application/pdf',
              },
            ],
          }),
          new Promise<{ success: false; error: string }>((resolve) =>
            setTimeout(() => resolve({ success: false, error: 'SMTP timeout after 8s' }), 8000)
          ),
        ]);
        if (!smtpResult.success) {
          simulated = true;
          deliveryNote = smtpResult.error || 'SMTP connection refused';
        }
      } catch (smtpErr: any) {
        simulated = true;
        deliveryNote = smtpErr?.message || 'SMTP error';
      }
    } else {
      simulated = true;
    }

    // Update lead creditTerms so pipeline card badge updates automatically
    await crmRepo.updateLead(effectiveWs, lead.id, {
      creditTerms: config.paymentTerms,
    });

    await crmRepo.logEmail(effectiveWs, {
      leadId: lead.id,
      toEmail: recipient,
      subject: emailSubject,
      bodyPreview: `${simulated ? '[LOGGED PREVIEW] ' : ''}Commercial Offer #${voucherNo} • ₹${grandTotal.toLocaleString('en-IN')}`,
      status: 'delivered',
    });

    await crmRepo.logActivity(effectiveWs, {
      leadId: lead.id,
      type: 'email',
      title: `Commercial Offer ${simulated ? 'Logged' : 'Sent'} (#${voucherNo})`,
      description: `Recipient: ${recipient} • Payment: ${config.paymentTerms} • Grand Total: ₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}${simulated ? ` (Logged preview${deliveryNote ? `: ${deliveryNote}` : ' — configure SMTP in Settings for live inbox delivery'})` : ''}`,
      authorName: authContext.user.name,
    });

    return NextResponse.json({
      success: true,
      mode: simulated ? 'logged_preview' : 'live',
      simulated,
      voucherNo,
      grandTotal,
      creditTerms: config.paymentTerms,
      message: simulated
        ? 'Commercial Offer logged to Activity (configure SMTP in Settings for live inbox delivery)'
        : `Commercial Offer #${voucherNo} sent to ${recipient}.`,
    });
  } catch (err: any) {
    console.error('[API Send Quotation Error]:', err);
    return NextResponse.json({ error: err.message || 'Failed to send commercial offer' }, { status: 500 });
  }
}
