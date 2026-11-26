import { NextRequest, NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';
import { sendSmtpEmail } from '@/lib/email/smtp';
import { htmlToPlainText, renderTemplateString } from '@/lib/email/template-engine';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      workspaceId = 'ws-default',
      subject,
      body: htmlBody,
      previewVariant = 'full', // 'full' | 'name_only' | 'no_name'
    } = body;

    const targetEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER || 'developsterhub@gmail.com';

    // Mock leads according to preview variant
    const workspaces = await crmRepo.getWorkspaces();
    const workspace = workspaces.find((w) => w.id === workspaceId) || null;

    let mockLead: any = null;
    if (previewVariant === 'full') {
      mockLead = {
        id: 'mock-full-lead',
        contactName: 'Rahul Sharma',
        designation: 'VP Engineering',
        company: 'Apex Technologies',
        email: targetEmail,
        phone: '+919876543210',
        title: 'Cloud Architecture Redesign',
        value: 45000,
        status: 'Qualified',
      };
    } else if (previewVariant === 'name_only') {
      mockLead = {
        id: 'mock-name-only',
        contactName: 'Ananya Verma',
        designation: '',
        company: '',
        email: targetEmail,
        phone: '',
        title: 'Project Inbound',
        value: 0,
        status: 'New Lead',
      };
    } else {
      // no name or company
      mockLead = {
        id: 'mock-no-name',
        contactName: '',
        designation: '',
        company: '',
        email: targetEmail,
        phone: '',
        title: '',
        value: 0,
        status: 'New Lead',
      };
    }

    const renderedSubject = `[TEST PREVIEW] ${renderTemplateString(subject || 'Test Email Preview', { lead: mockLead, workspace })}`;
    const renderedHtml = renderTemplateString(htmlBody || '<p>Test email body</p>', { lead: mockLead, workspace });
    const renderedText = htmlToPlainText(renderedHtml);

    const sendResult = await sendSmtpEmail({
      to: targetEmail,
      subject: renderedSubject,
      html: renderedHtml,
      text: renderedText,
      fromName: `${workspace?.senderName || 'Developster Team'} (Test)`,
    });

    if (!sendResult.success) {
      return NextResponse.json({
        success: false,
        error: sendResult.error || 'SMTP delivery failed. Check Gmail credentials.',
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Test email dispatched to ${targetEmail}`,
      messageId: sendResult.messageId,
    });
  } catch (error: any) {
    console.error('[API Test Self Email Error]:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

