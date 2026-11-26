import { NextRequest, NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId') || 'ws-default';
    const leadId = searchParams.get('leadId') || undefined;

    const logs = await crmRepo.getEmailLogs(workspaceId, leadId);
    return NextResponse.json({ logs });
  } catch (error: any) {
    console.error('[API Email Logs GET Error]:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch email logs' }, { status: 500 });
  }
}

