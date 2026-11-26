import { NextRequest, NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';
import { googleSheetsClient } from '@/lib/google-sheets/client';
import { saveRuntimeCredentials, validateGoogleSheetsConfig } from '@/lib/google-sheets/config';
import { getAuthenticatedUser } from '@/lib/auth/rbac';

export async function GET(req: NextRequest) {
  try {
    const authContext = await getAuthenticatedUser(req);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const status = await crmRepo.getStorageStatus();

    // Sensitive platform configuration details are strictly exposed to genuine Master Admin
    if (!authContext.isMasterAdmin) {
      return NextResponse.json({
        isLiveGoogleSheets: status.isLiveGoogleSheets,
        message: status.message,
      });
    }

    const configValidation = validateGoogleSheetsConfig();
    return NextResponse.json({
      ...status,
      config: {
        isValid: configValidation.isValid,
        hasSpreadsheetId: configValidation.hasSpreadsheetId,
        hasClientEmail: configValidation.hasClientEmail,
        hasPrivateKey: configValidation.hasPrivateKey,
        hasOAuthClientId: configValidation.hasOAuthClientId,
        hasOAuthClientSecret: configValidation.hasOAuthClientSecret,
        spreadsheetIdMasked: configValidation.spreadsheetIdMasked,
        clientEmailMasked: configValidation.clientEmailMasked,
        spreadsheetName: configValidation.spreadsheetName,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ isLiveGoogleSheets: false, message: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authContext = await getAuthenticatedUser(req);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    // Administrative operations strictly require genuine platform Master Admin authorization.
    // Tenant Owners/Admins are explicitly denied access to shared database credentials and structure.
    if (!authContext.isMasterAdmin) {
      return NextResponse.json(
        { error: 'Permission denied: Genuine platform Master Admin authorization required for shared database operations' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { action, spreadsheetId, clientEmail, privateKey } = body;

    if (action === 'save_credentials') {
      if (!spreadsheetId || !clientEmail || !privateKey) {
        return NextResponse.json({ error: 'Missing required credentials fields.' }, { status: 400 });
      }
      saveRuntimeCredentials({ spreadsheetId, clientEmail, privateKey });
      await crmRepo.logAudit('ws-platform', {
        userId: authContext.user.id,
        userName: authContext.user.name,
        action: 'database.save_credentials',
        details: `Saved Google Sheets credentials for sheet ID ${spreadsheetId.slice(0, 8)}...`,
      });
      return NextResponse.json({ success: true, message: 'Google Sheets credentials saved successfully.' });
    }

    if (action === 'test_connection') {
      const test = await googleSheetsClient.testConnection();
      return NextResponse.json(test);
    }

    if (action === 'comprehensive_test') {
      const diagnostic = await googleSheetsClient.runComprehensiveDiagnostic();
      return NextResponse.json(diagnostic);
    }

    if (action === 'init_database') {
      const res = await googleSheetsClient.initializeDatabase();
      await crmRepo.logAudit('ws-platform', {
        userId: authContext.user.id,
        userName: authContext.user.name,
        action: 'database.init_database',
        details: `Re-initialized shared Google Sheets database (${res.createdSheets?.length || 0} sheets created)`,
      });
      return NextResponse.json({ success: true, ...res });
    }

    if (action === 'export_to_sheets') {
      const exportRes = await crmRepo.exportAllToGoogleSheets();
      await crmRepo.logAudit('ws-platform', {
        userId: authContext.user.id,
        userName: authContext.user.name,
        action: 'database.export_all_to_sheets',
        details: `Exported full database to Google Sheets (${exportRes.rowsExported || 0} rows exported)`,
      });
      return NextResponse.json(exportRes);
    }

    if (action === 'reconcile_data') {
      const workspaceId = body.workspaceId || authContext.user.workspaceId || 'ws-main';
      const reconcileRes = await crmRepo.reconcileWorkspaceData(workspaceId);
      return NextResponse.json(reconcileRes);
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Operation failed' }, { status: 500 });
  }
}
