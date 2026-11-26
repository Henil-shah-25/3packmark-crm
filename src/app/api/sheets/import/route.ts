import { NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';
import { googleSheetsClient } from '@/lib/google-sheets/client';
import { getAuthenticatedUser } from '@/lib/auth/rbac';
import { parseAndValidateJson, sanitizeCsvFormula, sanitizePlainText, hasPathTraversal } from '@/lib/security';

const MAX_IMPORT_ROWS = 1000;

export async function POST(req: Request) {
  try {
    const jsonResult = await parseAndValidateJson<any>(req, { maxBytes: 512 * 1024 });
    if (!jsonResult.success) {
      return jsonResult.response;
    }
    const body = jsonResult.data;
    const { action, workspaceId, sheetName, mapping = {}, rows, deduplicateBy } = body;

    const targetWs = (workspaceId || 'ws-default').trim();
    const authContext = await getAuthenticatedUser(req, targetWs);

    // 1. Mandatory authentication check
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    // 2. Tenant isolation: enforce authenticated user's workspace
    const effectiveWorkspaceId = authContext.user.workspaceId;

    // Check path traversal on sheetName
    if (sheetName && hasPathTraversal(sheetName)) {
      return NextResponse.json({ error: 'Invalid sheet name' }, { status: 400 });
    }

    // Action 1: Preview rows from a sheet
    if (action === 'preview') {
      if (authContext.user.role === 'Read-only') {
        return NextResponse.json({ error: 'Viewers cannot preview import sheets' }, { status: 403 });
      }
      if (googleSheetsClient.isReady()) {
        const rawRows = await googleSheetsClient.getAllRows(sheetName || 'Sheet1');
        return NextResponse.json({
          headers: rawRows.length > 0 ? Object.keys(rawRows[0]) : [],
          sampleRows: rawRows.slice(0, 10),
          totalRows: rawRows.length,
        });
      } else {
        return NextResponse.json({
          headers: [],
          sampleRows: [],
          totalRows: 0,
          isDemoPreview: false,
        });
      }
    }

    // Action 2: Execute Import Job with duplicate prevention
    if (action === 'execute') {
      if (!authContext.permissions.canManagePipelines && !authContext.permissions.canAssignLeads) {
        return NextResponse.json({ error: 'Permission denied: Cannot execute bulk sheet imports' }, { status: 403 });
      }

      const rowsToProcess = Array.isArray(rows) ? rows : [];
      if (rowsToProcess.length > MAX_IMPORT_ROWS) {
        return NextResponse.json(
          { error: `Import batch too large. Maximum allowed rows is ${MAX_IMPORT_ROWS}.` },
          { status: 400 }
        );
      }

      const existingLeads = await crmRepo.getLeads(effectiveWorkspaceId);
      const pipelines = await crmRepo.getPipelines(effectiveWorkspaceId);
      const defaultPipeline = pipelines[0];
      const defaultStageId = defaultPipeline?.stages[0]?.id || 'stage-qual';
      const members = await crmRepo.getMembers(effectiveWorkspaceId);
      const defaultOwnerId = members[0]?.id || 'mem-1';

      let importedCount = 0;
      let updatedCount = 0;
      const skippedCount = 0;
      const errors: string[] = [];

      for (const row of rowsToProcess) {
        try {
          if (!row || typeof row !== 'object') continue;

          // Sanitize formula injection and cap string lengths
          const rawContact = row[mapping.contactName] ? String(row[mapping.contactName]).slice(0, 200) : '';
          const rawCompany = row[mapping.company] ? String(row[mapping.company]).slice(0, 200) : '';
          const contactName = sanitizeCsvFormula(rawContact || 'Unnamed Lead');
          const company = sanitizeCsvFormula(rawCompany || 'Unknown Company');

          const email = (row[mapping.email] ? String(row[mapping.email]).slice(0, 254) : '').trim().toLowerCase();
          const rawVal = row[mapping.value] ? String(row[mapping.value]).replace(/[^0-9.]/g, '') : '0';
          const value = parseFloat(rawVal) || 5000;
          const phone = row[mapping.phone] ? sanitizePlainText(String(row[mapping.phone]), 50) : '';
          const source = row[mapping.source] ? sanitizePlainText(String(row[mapping.source]), 100) : 'Google Sheets Import';

          // Duplicate detection check
          let existing = null;
          if (deduplicateBy === 'email' && email) {
            existing = existingLeads.find((l) => l.email.toLowerCase() === email);
          } else if (deduplicateBy === 'company') {
            existing = existingLeads.find((l) => l.company.toLowerCase() === company.toLowerCase());
          }

          if (existing) {
            // Update existing lead
            await crmRepo.updateLead(effectiveWorkspaceId, existing.id, {
              contactName: contactName || existing.contactName,
              phone: phone || existing.phone,
              value: value || existing.value,
              alternatePhone: mapping.alternatePhone && row[mapping.alternatePhone] ? sanitizePlainText(String(row[mapping.alternatePhone]), 50) : existing.alternatePhone,
              whatsappNumber: mapping.whatsappNumber && row[mapping.whatsappNumber] ? sanitizePlainText(String(row[mapping.whatsappNumber]), 50) : existing.whatsappNumber,
              designation: mapping.designation && row[mapping.designation] ? sanitizePlainText(String(row[mapping.designation]), 150) : existing.designation,
              website: mapping.website && row[mapping.website] ? sanitizePlainText(String(row[mapping.website]), 250) : existing.website,
              city: mapping.city && row[mapping.city] ? sanitizePlainText(String(row[mapping.city]), 100) : existing.city,
              state: mapping.state && row[mapping.state] ? sanitizePlainText(String(row[mapping.state]), 100) : existing.state,
              country: mapping.country && row[mapping.country] ? sanitizePlainText(String(row[mapping.country]), 100) : existing.country,
              address: mapping.address && row[mapping.address] ? sanitizePlainText(String(row[mapping.address]), 500) : existing.address,
              gstTaxId: mapping.gstTaxId && row[mapping.gstTaxId] ? sanitizePlainText(String(row[mapping.gstTaxId]), 50) : existing.gstTaxId,
              notes: mapping.notes && row[mapping.notes] ? sanitizePlainText(String(row[mapping.notes]), 5000) : existing.notes,
              updatedAt: new Date().toISOString(),
            });
            updatedCount++;
          } else {
            // Create new lead
            await crmRepo.createLead({
              workspaceId: effectiveWorkspaceId,
              title: `${company} Expansion`,
              contactName,
              email,
              phone,
              alternatePhone: mapping.alternatePhone && row[mapping.alternatePhone] ? sanitizePlainText(String(row[mapping.alternatePhone]), 50) : '',
              whatsappNumber: mapping.whatsappNumber && row[mapping.whatsappNumber] ? sanitizePlainText(String(row[mapping.whatsappNumber]), 50) : '',
              designation: mapping.designation && row[mapping.designation] ? sanitizePlainText(String(row[mapping.designation]), 150) : '',
              company,
              industry: mapping.industry && row[mapping.industry] ? sanitizePlainText(String(row[mapping.industry]), 100) : '',
              companySize: mapping.companySize && row[mapping.companySize] ? sanitizePlainText(String(row[mapping.companySize]), 50) : '',
              website: mapping.website && row[mapping.website] ? sanitizePlainText(String(row[mapping.website]), 250) : '',
              city: mapping.city && row[mapping.city] ? sanitizePlainText(String(row[mapping.city]), 100) : '',
              state: mapping.state && row[mapping.state] ? sanitizePlainText(String(row[mapping.state]), 100) : '',
              country: mapping.country && row[mapping.country] ? sanitizePlainText(String(row[mapping.country]), 100) : '',
              address: mapping.address && row[mapping.address] ? sanitizePlainText(String(row[mapping.address]), 500) : '',
              gstTaxId: mapping.gstTaxId && row[mapping.gstTaxId] ? sanitizePlainText(String(row[mapping.gstTaxId]), 50) : '',
              leadSource: source,
              notes: mapping.notes && row[mapping.notes] ? sanitizePlainText(String(row[mapping.notes]), 5000) : '',
              value,
              pipelineId: defaultPipeline?.id || 'pipe-sales',
              stageId: defaultStageId,
              ownerId: defaultOwnerId,
              priority: 'medium',
              status: 'New',
              source,
              expectedCloseDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              closingProbability: 50,
              tags: ['Imported'],
              visibility: 'shared',
              createdBy: authContext.user.id,
            });
            importedCount++;
          }
        } catch (rowErr: any) {
          errors.push(rowErr.message || 'Error processing row');
        }
      }

      await crmRepo.logAudit(effectiveWorkspaceId, {
        userId: authContext.user.id,
        userName: authContext.user.name,
        action: 'sheets.import_execute',
        details: `Bulk sheet import: ${importedCount} imported, ${updatedCount} updated, ${skippedCount} skipped`,
      });

      return NextResponse.json({
        success: true,
        importedCount,
        updatedCount,
        skippedCount,
        errors: errors.slice(0, 10),
      });
    }

    return NextResponse.json({ error: 'Unknown action specified' }, { status: 400 });
  } catch (err: any) {
    console.error('[API sheets import error]:', err);
    return NextResponse.json({ error: err.message || 'Import error' }, { status: 500 });
  }
}
