import { NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';
import { getAuthenticatedUser } from '@/lib/auth/rbac';
import { sendSmtpEmail } from '@/lib/email/smtp';
import { getCommunicationAdapter, calculateSmsSegments } from '@/lib/communication/adapter';
import { CommunicationChannel, CommunicationMessageStatus } from '@/types/communication';
import { parseAndValidateJson, sanitizePlainText, sanitizeEmailHtml, isValidEmail, isValidPhone } from '@/lib/security';


export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId') || 'ws-default';

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const conversationId = searchParams.get('conversationId');
    const customerId = searchParams.get('customerId');

    if (conversationId) {
      const messages = await crmRepo.getMessages(workspaceId, conversationId);
      return NextResponse.json(messages);
    }

    if (customerId) {
      const messages = await crmRepo.getCustomerMessages(workspaceId, customerId);
      return NextResponse.json(messages);
    }

    return NextResponse.json({ error: 'conversationId or customerId is required' }, { status: 400 });
  } catch (err: any) {
    console.error('[API Communication Messages GET Error]:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const jsonResult = await parseAndValidateJson<any>(req, { maxBytes: 128 * 1024 });
    if (!jsonResult.success) {
      return jsonResult.response;
    }
    const body = jsonResult.data;
    const {
      workspaceId,
      conversationId,
      customerId,
      leadId,
      channel,
      recipient,
      content,
      subject,
      status: requestedStatus = 'draft',
      templateId,
      variables,
      dltTemplateId,
    } = body;

    if (!channel || !recipient || !content) {
      return NextResponse.json(
        { error: 'channel, recipient, and content are required' },
        { status: 400 }
      );
    }

    const targetWs = (workspaceId || 'ws-default').trim();
    const authContext = await getAuthenticatedUser(req, targetWs);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    if (authContext.user.role === 'Read-only') {
      return NextResponse.json({ error: 'Permission denied: Viewers cannot send or draft messages' }, { status: 403 });
    }

    const effectiveWorkspaceId = authContext.user.workspaceId;

    // Validate channel enum
    if (!['email', 'sms', 'whatsapp'].includes(channel)) {
      return NextResponse.json({ error: 'Invalid communication channel' }, { status: 400 });
    }

    // Validate recipient format
    const cleanRecipient = String(recipient).trim();
    if (channel === 'email') {
      if (!isValidEmail(cleanRecipient)) {
        return NextResponse.json({ error: 'Invalid recipient email format' }, { status: 400 });
      }
    } else {
      if (!isValidPhone(cleanRecipient)) {
        return NextResponse.json({ error: 'Invalid recipient phone number format' }, { status: 400 });
      }
    }

    // Sanitize content based on channel
    let cleanContent = '';
    if (channel === 'email') {
      cleanContent = sanitizeEmailHtml(String(content).slice(0, 50000));
    } else {
      cleanContent = sanitizePlainText(String(content), 2000);
    }

    const cleanSubject = subject ? sanitizePlainText(String(subject), 300) : undefined;

    // Calculate SMS character segments if SMS
    let segmentData: any = {};
    if (channel === 'sms') {
      segmentData = calculateSmsSegments(cleanContent);
    }

    // If explicit draft requested:
    if (requestedStatus === 'draft') {
      const savedDraft = await crmRepo.createMessage(workspaceId, {
        workspaceId,
        conversationId: conversationId || `conv-${Date.now()}`,
        customerId,
        leadId,
        channel: channel as CommunicationChannel,
        direction: 'outbound',
        senderId: authContext.user.id,
        senderName: authContext.user.name,
        recipient,
        content: cleanContent,
        subject: cleanSubject,
        status: 'draft',
        metadata: {
          templateId,
          templateVariables: variables,
          characterCount: cleanContent.length,
          segmentCount: segmentData.segmentCount || 1,
          dltTemplateId,
        },
      });

      return NextResponse.json({ success: true, message: savedDraft, isDraft: true }, { status: 201 });
    }

    // If user attempted to send (outbound message):
    if (channel === 'email') {
      // 1. Real SMTP Email sending
      const emailResult = await sendSmtpEmail({
        to: recipient,
        subject: subject || 'Message from Developster CRM',
        html: `<div style="font-family: sans-serif; white-space: pre-wrap;">${content}</div>`,
      });

      const finalStatus: CommunicationMessageStatus = emailResult.success ? 'sent' : 'failed';

      const savedMsg = await crmRepo.createMessage(workspaceId, {
        workspaceId,
        conversationId: conversationId || `conv-${Date.now()}`,
        customerId,
        leadId,
        channel: 'email',
        direction: 'outbound',
        senderId: authContext.user.id,
        senderName: authContext.user.name,
        recipient,
        content,
        subject,
        status: finalStatus,
        metadata: {
          templateId,
          templateVariables: variables,
          provider: 'smtp',
          providerMessageId: emailResult.messageId,
          errorMessage: emailResult.error,
        },
      });

      if (!emailResult.success) {
        return NextResponse.json(
          {
            success: false,
            message: savedMsg,
            error: emailResult.error || 'SMTP delivery failed. Message saved as failed record in CRM.',
          },
          { status: 502 }
        );
      }

      return NextResponse.json({ success: true, message: savedMsg }, { status: 201 });
    }

    // 2. WhatsApp or SMS: Provider is not yet connected
    const adapter = getCommunicationAdapter(channel as CommunicationChannel);
    const adapterResult = await adapter.sendMessage({
      workspaceId,
      channel: channel as CommunicationChannel,
      recipient,
      content,
      subject,
      templateId,
      variables,
    });

    // Per business requirement: Do not falsely claim success.
    // Save as draft with explicit error status so the employee's work is preserved.
    const savedMsg = await crmRepo.createMessage(workspaceId, {
      workspaceId,
      conversationId: conversationId || `conv-${Date.now()}`,
      customerId,
      leadId,
      channel: channel as CommunicationChannel,
      direction: 'outbound',
      senderId: authContext.user.id,
      senderName: authContext.user.name,
      recipient,
      content,
      subject,
      status: 'draft',
      metadata: {
        templateId,
        templateVariables: variables,
        characterCount: content.length,
        segmentCount: segmentData.segmentCount || 1,
        dltTemplateId,
        provider: adapter.providerId,
        errorMessage: adapterResult.error || 'Provider not connected.',
      },
    });

    return NextResponse.json(
      {
        success: false,
        providerConnected: false,
        warning: `The ${channel.toUpperCase()} provider (MSG91) is not connected yet. Your message has been safely saved as a draft in the CRM.`,
        message: savedMsg,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('[API Communication Messages POST Error]:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

