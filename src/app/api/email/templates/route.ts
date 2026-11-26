import { NextRequest, NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';
import { extractVariableNames, htmlToPlainText, validateTemplate } from '@/lib/email/template-engine';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId') || 'ws-default';
    const templates = await crmRepo.getEmailTemplates(workspaceId);
    return NextResponse.json({ templates });
  } catch (error: any) {
    console.error('[API Email Templates GET Error]:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch templates' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      workspaceId = 'ws-default',
      name,
      category = 'general',
      subject,
      body: htmlBody,
      plainText,
      action = 'create', // 'create' | 'duplicate'
      sourceTemplateId,
    } = body;

    if (action === 'duplicate' && sourceTemplateId) {
      const existing = (await crmRepo.getEmailTemplates(workspaceId)).find((t) => t.id === sourceTemplateId);
      if (!existing) {
        return NextResponse.json({ error: 'Source template to duplicate not found' }, { status: 404 });
      }

      const duplicateName = `${existing.name} (Copy)`;
      const newTemplate = await crmRepo.saveEmailTemplate(workspaceId, {
        name: duplicateName,
        category: existing.category || 'general',
        subject: existing.subject,
        body: existing.body,
        plainText: existing.plainText,
        variables: existing.variables || [],
        isPrebuilt: false,
      });

      return NextResponse.json({ success: true, template: newTemplate }, { status: 201 });
    }

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Template name is required' }, { status: 400 });
    }

    const variables = [
      ...extractVariableNames(subject || ''),
      ...extractVariableNames(htmlBody || ''),
    ];

    const validation = validateTemplate({ subject: subject || '', body: htmlBody || '' });

    const newTemplate = await crmRepo.saveEmailTemplate(workspaceId, {
      name: name.trim(),
      category,
      subject: subject || '',
      body: htmlBody || '',
      plainText: plainText || htmlToPlainText(htmlBody || ''),
      variables,
      isPrebuilt: false,
    });

    return NextResponse.json({
      success: true,
      template: newTemplate,
      warnings: validation.warnings,
    }, { status: 201 });
  } catch (error: any) {
    console.error('[API Email Templates POST Error]:', error);
    return NextResponse.json({ error: error.message || 'Failed to create template' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      workspaceId = 'ws-default',
      id,
      name,
      category,
      subject,
      body: htmlBody,
      plainText,
    } = body;

    if (!id) {
      return NextResponse.json({ error: 'Template id is required for update' }, { status: 400 });
    }

    const variables = [
      ...extractVariableNames(subject || ''),
      ...extractVariableNames(htmlBody || ''),
    ];

    const validation = validateTemplate({ subject: subject || '', body: htmlBody || '' });

    const updated = await crmRepo.saveEmailTemplate(workspaceId, {
      id,
      name,
      category,
      subject,
      body: htmlBody,
      plainText: plainText || (htmlBody ? htmlToPlainText(htmlBody) : undefined),
      variables,
    });

    return NextResponse.json({
      success: true,
      template: updated,
      warnings: validation.warnings,
    });
  } catch (error: any) {
    console.error('[API Email Templates PUT Error]:', error);
    return NextResponse.json({ error: error.message || 'Failed to update template' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId') || 'ws-default';
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Template id is required' }, { status: 400 });
    }

    const templates = await crmRepo.getEmailTemplates(workspaceId);
    const existing = templates.find((t) => t.id === id);

    if (!existing) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    if (existing.isPrebuilt) {
      return NextResponse.json(
        { error: 'Pre-built templates cannot be deleted, only duplicated.' },
        { status: 403 }
      );
    }

    await crmRepo.deleteEmailTemplate(workspaceId, id);
    return NextResponse.json({ success: true, deletedId: id });
  } catch (error: any) {
    console.error('[API Email Templates DELETE Error]:', error);
    return NextResponse.json({ error: error.message || 'Failed to delete template' }, { status: 500 });
  }
}

