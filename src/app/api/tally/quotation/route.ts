import { NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';
import { getAuthenticatedUser, canUserAccessLead } from '@/lib/auth/rbac';
import { buildTallyQuotationXml } from '@/lib/tally/tallyXmlBuilder';

function extractXmlTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? match[1].trim() : null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      workspaceId = 'ws-default',
      leadId,
      action = 'push',
      voucherDate,
      referenceNo,
    } = body as {
      workspaceId?: string;
      leadId?: string;
      action?: 'push' | 'download';
      voucherDate?: string;
      referenceNo?: string;
    };

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    if (!leadId) {
      return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
    }

    const lead = await crmRepo.getLeadById(workspaceId, leadId);
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const pipelines = await crmRepo.getPipelines(workspaceId);
    const pipe = pipelines.find((p) => p.id === lead.pipelineId);
    if (!canUserAccessLead(authContext.user, lead, pipe)) {
      return NextResponse.json({ error: 'Permission denied: Cannot access targeted lead' }, { status: 403 });
    }

    const workspaces = await crmRepo.getWorkspaces();
    const workspace = workspaces.find((w) => w.id === workspaceId) || workspaces[0];
    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    const ref = referenceNo || `QT-${lead.id.slice(-6).toUpperCase()}`;
    const xml = buildTallyQuotationXml({
      lead,
      workspace,
      voucherDate,
      referenceNo: ref,
    });

    const filename = `Tally_Quotation_${ref}_${(lead.company || 'Customer').replace(/[^a-zA-Z0-9_-]/g, '_')}.xml`;

    if (action === 'download') {
      await crmRepo.logActivity(workspaceId, {
        leadId: lead.id,
        type: 'note',
        title: `TallyPrime Quotation XML Downloaded (${ref})`,
        description: `Generated Optional Sales Order XML for ${lead.company || lead.contactName} by ${authContext.user.name}.`,
        authorName: authContext.user.name,
      });

      return NextResponse.json({
        success: true,
        mode: 'download',
        referenceNo: ref,
        filename,
        xml,
        message: `TallyPrime XML ready for ${ref}`,
      });
    }

    // Live HTTP XML Sync
    const tallyUrl = (workspace.tallyUrl || '').trim();
    if (!tallyUrl) {
      return NextResponse.json(
        {
          success: false,
          mode: 'live',
          error: 'Tally Endpoint URL is not configured. Please set it in Settings -> TallyPrime Integration, or use Download Tally XML.',
          xml,
          filename,
        },
        { status: 400 }
      );
    }

    try {
      const response = await fetch(tallyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
        },
        body: xml,
        signal: AbortSignal.timeout(8000),
      });

      const responseText = await response.text();
      const lineError = extractXmlTag(responseText, 'LINEERROR');
      const errorsCount = Number(extractXmlTag(responseText, 'ERRORS') || '0');
      const createdCount = Number(extractXmlTag(responseText, 'CREATED') || '0');

      if (!response.ok || lineError || errorsCount > 0) {
        return NextResponse.json(
          {
            success: false,
            mode: 'live',
            error: lineError || `TallyPrime returned HTTP ${response.status}${errorsCount > 0 ? ` (${errorsCount} errors)` : ''}`,
            tallyResponse: responseText.slice(0, 600),
            xml,
            filename,
          },
          { status: 502 }
        );
      }

      await crmRepo.logActivity(workspaceId, {
        leadId: lead.id,
        type: 'note',
        title: `Pushed Quotation to TallyPrime (${ref})`,
        description: `Optional Sales Order voucher synced to ${workspace.tallyCompanyName || '3packmark Private Limited'} at ${tallyUrl} (Created: ${createdCount || 1}).`,
        authorName: authContext.user.name,
      });

      return NextResponse.json({
        success: true,
        mode: 'live',
        referenceNo: ref,
        createdCount: createdCount || 1,
        message: `Quotation ${ref} pushed to TallyPrime (${workspace.tallyCompanyName || '3packmark Private Limited'}).`,
      });
    } catch (fetchErr: any) {
      const reason =
        fetchErr?.name === 'TimeoutError'
          ? `Connection to TallyPrime at ${tallyUrl} timed out after 8s.`
          : `Could not reach TallyPrime at ${tallyUrl}: ${fetchErr?.message || 'Network error'}. Use "Download Tally XML" if Tally is on an offline PC.`;

      return NextResponse.json(
        {
          success: false,
          mode: 'live',
          error: reason,
          xml,
          filename,
        },
        { status: 502 }
      );
    }
  } catch (err: any) {
    console.error('[API Tally Quotation Error]:', err);
    return NextResponse.json({ error: err.message || 'Failed to process TallyPrime quotation' }, { status: 500 });
  }
}
