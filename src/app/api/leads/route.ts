import { NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';
import { emitCrmEvent } from '@/lib/automations/engine';
import { getAuthenticatedUser, filterLeadsForUser, canUserAccessPipeline } from '@/lib/auth/rbac';
import { parseAndValidateJson, sanitizeCsvFormula, sanitizePlainText, isValidEmail } from '@/lib/security';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId') || 'ws-default';
    const stageId = searchParams.get('stageId') || undefined;
    const ownerId = searchParams.get('ownerId') || undefined;
    const status = searchParams.get('status') || undefined;

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const leads = await crmRepo.getLeads(workspaceId, { stageId, ownerId, status });
    const pipelines = await crmRepo.getPipelines(workspaceId);
    const filteredLeads = filterLeadsForUser(authContext.user, leads, pipelines);
    return NextResponse.json(filteredLeads);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
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
      title,
      contactName,
      email,
      phone,
      alternatePhone,
      whatsappNumber,
      whatsappSameAsPhone,
      designation,
      countryCode,
      company,
      industry,
      companySize,
      website,
      city,
      state,
      country,
      address,
      gstTaxId,
      leadSource,
      servicesInterested,
      estimatedBudget,
      notes,
      leadNotes,
      value,
      pipelineId,
      stageId,
      ownerId,
      priority,
      status,
      source,
      expectedCloseDate,
      closingProbability,
      tags,
      visibility,
    } = body;

    // Tenant isolation: Derive tenant context strictly from verified session
    const authContext = await getAuthenticatedUser(req, 'ws-default');
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const effectiveWorkspaceId = authContext.user.workspaceId;

    if (authContext.user.role === 'Read-only') {
      return NextResponse.json({ error: 'Viewers cannot create leads' }, { status: 403 });
    }

    // Check target pipeline access
    const pipelines = await crmRepo.getPipelines(effectiveWorkspaceId);
    const targetPipeId = pipelineId || 'pipe-sales';
    const targetPipe = pipelines.find((p) => p.id === targetPipeId);
    if (targetPipe && !canUserAccessPipeline(authContext.user, targetPipe)) {
      return NextResponse.json({ error: 'Permission denied: Cannot create lead in unauthorized pipeline' }, { status: 403 });
    }

    // Prevent non-managers/non-admins from forging ownerId
    if (ownerId && ownerId !== authContext.user.id && !authContext.permissions.canAssignLeads) {
      return NextResponse.json({ error: 'Permission denied: Cannot assign lead to another user' }, { status: 403 });
    }

    // Input sanitization: Length limits, tag stripping & formula injection protection
    const rawContact = typeof contactName === 'string' ? contactName.slice(0, 200) : '';
    const rawCompany = typeof company === 'string' ? company.slice(0, 200) : '';
    const effectiveCompany = sanitizePlainText(rawCompany || rawContact || '', 200);
    const effectiveContactName = sanitizePlainText(rawContact || rawCompany || '', 200);

    if (!effectiveCompany && !effectiveContactName) {
      return NextResponse.json({ error: 'Either Name or Company is required' }, { status: 400 });
    }

    const rawTitle = typeof title === 'string' ? title.slice(0, 300) : '';
    const effectiveTitle = sanitizePlainText(rawTitle || `${effectiveCompany} Opportunity`, 300);

    // Validate email format if provided
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase().slice(0, 254) : '';
    if (cleanEmail && !isValidEmail(cleanEmail)) {
      return NextResponse.json({ error: 'Invalid email address format' }, { status: 400 });
    }

    // Validate numeric value
    const numValue = value !== undefined ? Number(value) : 0;
    if (isNaN(numValue) || numValue < 0 || numValue > 1e12) {
      return NextResponse.json({ error: 'Value must be a valid positive number' }, { status: 400 });
    }

    // Validate probability
    const numProb = closingProbability !== undefined ? Number(closingProbability) : 50;
    if (isNaN(numProb) || numProb < 0 || numProb > 100) {
      return NextResponse.json({ error: 'Closing probability must be between 0 and 100' }, { status: 400 });
    }

    // Creator is strictly the authenticated user, cannot be spoofed from client
    const creatorId = authContext.user.id;
    const effectiveOwnerId = (authContext.permissions.canAssignLeads && ownerId)
      ? ownerId
      : (ownerId === authContext.user.id ? ownerId : authContext.user.id);

    const cleanNotes = typeof notes === 'string' ? sanitizePlainText(notes, 5000) : (typeof leadNotes === 'string' ? sanitizePlainText(leadNotes, 5000) : '');

    const newLead = await crmRepo.createLead({
      workspaceId: effectiveWorkspaceId,
      title: effectiveTitle,
      contactName: effectiveContactName,
      email: cleanEmail,
      phone: typeof phone === 'string' ? sanitizePlainText(phone, 50) : '',
      alternatePhone: typeof alternatePhone === 'string' ? sanitizePlainText(alternatePhone, 50) : '',
      whatsappNumber: typeof whatsappNumber === 'string' ? sanitizePlainText(whatsappNumber, 50) : '',
      whatsappSameAsPhone: Boolean(whatsappSameAsPhone),
      designation: typeof designation === 'string' ? sanitizePlainText(designation, 150) : '',
      countryCode: typeof countryCode === 'string' ? sanitizePlainText(countryCode, 10) : '',
      company: effectiveCompany,
      industry: typeof industry === 'string' ? sanitizePlainText(industry, 100) : '',
      companySize: typeof companySize === 'string' ? sanitizePlainText(companySize, 50) : '',
      website: typeof website === 'string' ? sanitizePlainText(website, 250) : '',
      city: typeof city === 'string' ? sanitizePlainText(city, 100) : '',
      state: typeof state === 'string' ? sanitizePlainText(state, 100) : '',
      country: typeof country === 'string' ? sanitizePlainText(country, 100) : '',
      address: typeof address === 'string' ? sanitizePlainText(address, 500) : '',
      gstTaxId: typeof gstTaxId === 'string' ? sanitizePlainText(gstTaxId, 50) : '',
      leadSource: typeof leadSource === 'string' ? sanitizePlainText(leadSource, 100) : (typeof source === 'string' ? sanitizePlainText(source, 100) : 'Direct'),
      servicesInterested: Array.isArray(servicesInterested) ? servicesInterested.slice(0, 20).map(s => String(s).slice(0, 100)) : [],
      estimatedBudget: estimatedBudget !== undefined && !isNaN(Number(estimatedBudget)) ? Number(estimatedBudget) : undefined,
      notes: cleanNotes,
      leadNotes: cleanNotes ? [{
        id: `note-${Date.now()}`,
        leadId: '',
        content: cleanNotes,
        createdAt: new Date().toISOString(),
      }] : [],
      value: numValue,
      pipelineId: targetPipeId,
      stageId: stageId || targetPipe?.stages[0]?.id || 'stage-qual',
      ownerId: effectiveOwnerId,
      priority: (priority === 'low' || priority === 'medium' || priority === 'high') ? priority : 'medium',
      status: (status === 'New' || status === 'Contacted' || status === 'Qualified' || status === 'Proposal' || status === 'Negotiation' || status === 'Won' || status === 'Lost') ? status : 'New',
      source: typeof source === 'string' ? sanitizePlainText(source, 100) : 'Direct',
      expectedCloseDate: expectedCloseDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      closingProbability: numProb,
      tags: Array.isArray(tags) ? tags.slice(0, 30).map(t => String(t).slice(0, 50)) : [],
      visibility: (visibility === 'master' || visibility === 'shared' || visibility === 'private') ? visibility : 'shared',
      createdBy: creatorId,
    });

    // Emit CRM event for automations
    try {
      await emitCrmEvent({
        type: 'lead_created',
        leadId: newLead.id,
        workspaceId: effectiveWorkspaceId,
        pipelineId: newLead.pipelineId,
        newStageId: newLead.stageId,
      });
    } catch (e) {
      console.error('[Automations] Error emitting lead_created:', e);
    }

    return NextResponse.json(newLead, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
