import { EmailTemplate } from '@/types/crm';
import { crmRepo } from '@/lib/google-sheets/repository';
import { sendSmtpEmail } from '@/lib/email/smtp';
import {
  TemplateRenderContext,
  renderTemplateString,
  htmlToPlainText,
} from './template-parser';
import { sanitizeEmailHtml } from '@/lib/security';

export * from './template-parser';

/**
 * Server function: renderTemplate(templateId, context)
 * Reusable by Automations (Phase 4) and AI Copilot
 */
export async function renderTemplate(
  templateId: string,
  context: TemplateRenderContext = {}
): Promise<{
  subject: string;
  html: string;
  text: string;
  template: EmailTemplate;
}> {
  const workspaceId = context.workspace?.id || 'ws-default';
  const templates = await crmRepo.getEmailTemplates(workspaceId);
  const template = templates.find((t) => t.id === templateId);

  if (!template) {
    throw new Error(`Email template not found: "${templateId}" in workspace "${workspaceId}"`);
  }

  // If workspace context wasn't passed, load it
  let fullWorkspace = context.workspace;
  if (!fullWorkspace) {
    const workspaces = await crmRepo.getWorkspaces();
    fullWorkspace = workspaces.find((w) => w.id === workspaceId) || null;
  }

  const enrichedContext: TemplateRenderContext = {
    ...context,
    workspace: fullWorkspace,
  };

  const subject = renderTemplateString(template.subject, enrichedContext);
  const html = renderTemplateString(template.body, enrichedContext);
  const text = template.plainText
    ? renderTemplateString(template.plainText, enrichedContext)
    : htmlToPlainText(html);

  return {
    subject,
    html,
    text,
    template,
  };
}

/**
 * Server function: sendTemplatedEmail(leadId, templateId, overrides)
 * Sends an email to a lead using a template with optional subject/body overrides.
 * Automatically logs to EmailLogs and Activity history.
 */
export async function sendTemplatedEmail(
  leadId: string,
  templateId: string,
  overrides?: {
    subject?: string;
    body?: string;
    workspaceId?: string;
    isAutomation?: boolean;
  }
): Promise<{
  success: boolean;
  skipped?: boolean;
  logId?: string;
  error?: string;
}> {
  try {
    const workspaceId = overrides?.workspaceId || 'ws-default';

    // 1. Fetch Lead
    const leads = await crmRepo.getLeads(workspaceId);
    const lead = leads.find((l) => l.id === leadId);

    if (!lead) {
      return { success: false, error: `Lead ${leadId} not found.` };
    }

    if (!lead.email || !lead.email.trim()) {
      return {
        success: false,
        skipped: true,
        error: 'skipped: no email',
      };
    }

    // 2. Fetch Workspace
    const workspaces = await crmRepo.getWorkspaces();
    const workspace = workspaces.find((w) => w.id === workspaceId) || null;

    // 3. Render template
    const rendered = await renderTemplate(templateId, {
      lead,
      workspace,
    });

    const finalSubject = (overrides?.subject && overrides.subject.trim())
      ? renderTemplateString(overrides.subject, { lead, workspace })
      : rendered.subject;

    const finalHtml = (overrides?.body && overrides.body.trim())
      ? renderTemplateString(overrides.body, { lead, workspace })
      : rendered.html;

    const sanitizedHtml = sanitizeEmailHtml(finalHtml);
    const finalText = htmlToPlainText(sanitizedHtml);

    // 4. Dispatch via Gmail SMTP
    const sendResult = await sendSmtpEmail({
      to: lead.email,
      subject: finalSubject,
      html: sanitizedHtml,
      text: finalText,
      fromName: workspace?.senderName || workspace?.companyName || 'Developster Team',
    });

    const emailStatus = sendResult.success ? 'sent' : 'failed';
    const isAuto = overrides?.isAutomation === true;

    // 5. Log Email Record
    const log = await crmRepo.logEmail(workspaceId, {
      leadId: lead.id,
      toEmail: lead.email,
      subject: finalSubject,
      bodyPreview: finalText.substring(0, 160),
      status: emailStatus,
      templateId,
      error: sendResult.error,
    });

    // 6. Log Activity for the lead (Marked "Automation" if sent via automation)
    await crmRepo.logActivity(workspaceId, {
      leadId: lead.id,
      type: 'email',
      title: isAuto
        ? `Sent Email: ${rendered.template.name} (Automation)`
        : `Sent Email: ${rendered.template.name}`,
      description: finalSubject,
      authorName: isAuto ? 'Automation' : (workspace?.senderName || 'Developster Mailer'),
      metadata: {
        templateId,
        templateName: rendered.template.name,
        subject: finalSubject,
        status: emailStatus,
        source: isAuto ? 'Automation' : 'Manual',
        error: sendResult.error,
      },
    });

    if (!sendResult.success) {
      // Create notification for email dispatch failure
      try {
        await crmRepo.createNotification(workspaceId, {
          title: `Email Failed: ${rendered.template.name}`,
          message: `Could not deliver "${finalSubject}" to ${lead.email}: ${sendResult.error}`,
          type: 'email_failure',
          leadId: lead.id,
        });
      } catch {}

      return {
        success: false,
        logId: log.id,
        error: sendResult.error,
      };
    }

    return {
      success: true,
      logId: log.id,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to send templated email.',
    };
  }
}
