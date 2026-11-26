import { NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';
import { getAuthenticatedUser } from '@/lib/auth/rbac';
import { parseAndValidateJson, sanitizeCsvFormula, sanitizePlainText, isValidEmail } from '@/lib/security';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId') || 'ws-default';

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const wsId = authContext.user.workspaceId;
    const [sheetCustomers, leads, stages] = await Promise.all([
      crmRepo.getCustomers(wsId),
      crmRepo.getLeads(wsId),
      crmRepo.getStages(wsId),
    ]);

    const normPhone = (p?: string) => {
      const d = String(p || '').replace(/\D/g, '');
      return d.length >= 7 ? d.slice(-10) : '';
    };

    const stageNameById = new Map(stages.map((s) => [s.id, s.name]));
    const mergedMap = new Map<string, any>();

    const findExistingKey = (company?: string, email?: string, phone?: string): string | null => {
      const cKey = (company || '').trim().toLowerCase();
      const eKey = (email || '').trim().toLowerCase();
      const pKey = normPhone(phone);
      for (const [k, v] of mergedMap.entries()) {
        if (cKey && v.company?.trim().toLowerCase() === cKey) return k;
        if (eKey && v.email?.trim().toLowerCase() === eKey) return k;
        if (pKey && normPhone(v.phone) === pKey) return k;
      }
      return null;
    };

    for (const c of sheetCustomers) {
      const key = `cust:${c.id}`;
      mergedMap.set(key, {
        ...c,
        openPipelineValue: 0,
        wonRevenue: Number(c.totalRevenue || 0),
        currentStage: c.status,
      });
    }

    for (const l of leads) {
      const existingKey = findExistingKey(l.company, l.email, l.phone);
      const isWon = l.status === 'Won' || l.stageId === 'stg-closed' || l.stageId === 'stg-won';
      const isLost = l.status === 'Lost' || l.stageId === 'stg-lost' || l.stageId === 'stg-loss';
      const val = Number(l.value || 0);
      const stgName = stageNameById.get(l.stageId) || l.status || 'New Lead';

      if (existingKey) {
        const entry = mergedMap.get(existingKey);
        entry.dealsCount = (entry.dealsCount || 0) + 1;
        if (isWon) {
          entry.wonRevenue = (entry.wonRevenue || 0) + val;
          entry.totalRevenue = Math.max(Number(entry.totalRevenue || 0), entry.wonRevenue);
        } else if (!isLost) {
          entry.openPipelineValue = (entry.openPipelineValue || 0) + val;
          entry.currentStage = stgName;
        }
        if (!entry.email && l.email) entry.email = l.email;
        if (!entry.phone && l.phone) entry.phone = l.phone;
        if (l.updatedAt && (!entry.lastContactedAt || l.updatedAt > entry.lastContactedAt)) {
          entry.lastContactedAt = l.updatedAt;
        }
      } else {
        const key = `lead-cust:${(l.company || l.contactName || l.id).trim().toLowerCase()}-${l.id}`;
        mergedMap.set(key, {
          id: `cust-${l.id}`,
          workspaceId: wsId,
          name: l.contactName || l.company || 'Primary Contact',
          company: l.company || l.contactName || 'Unnamed Account',
          email: l.email || '',
          phone: l.phone || '',
          status: isWon ? 'Active' : 'Lead',
          totalRevenue: isWon ? val : 0,
          wonRevenue: isWon ? val : 0,
          openPipelineValue: !isWon && !isLost ? val : 0,
          dealsCount: 1,
          currentStage: stgName,
          lastContactedAt: l.updatedAt || l.createdAt,
          createdAt: l.createdAt,
        });
      }
    }

    return NextResponse.json(Array.from(mergedMap.values()));
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
    const { workspaceId = 'ws-default', name, company, email, phone, status, totalRevenue, dealsCount, lastContactedAt } = body;

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const effectiveWorkspaceId = authContext.user.workspaceId;

    if (authContext.user.role === 'Read-only') {
      return NextResponse.json({ error: 'Permission denied: Read-only viewers cannot create customers' }, { status: 403 });
    }

    if (!name || !company) {
      return NextResponse.json({ error: 'Customer name and company are required' }, { status: 400 });
    }

    const cleanName = sanitizeCsvFormula(String(name).slice(0, 200).trim());
    const cleanCompany = sanitizeCsvFormula(String(company).slice(0, 200).trim());
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase().slice(0, 254) : '';
    if (cleanEmail && !isValidEmail(cleanEmail)) {
      return NextResponse.json({ error: 'Invalid email address format' }, { status: 400 });
    }

    const numRevenue = totalRevenue !== undefined ? Number(totalRevenue) : 0;
    if (isNaN(numRevenue) || numRevenue < 0 || numRevenue > 1e12) {
      return NextResponse.json({ error: 'Total revenue must be a valid positive number' }, { status: 400 });
    }

    const numDeals = dealsCount !== undefined ? Number(dealsCount) : 1;
    if (isNaN(numDeals) || numDeals < 0 || numDeals > 100000) {
      return NextResponse.json({ error: 'Deals count must be a valid non-negative integer' }, { status: 400 });
    }

    const newCustomer = await crmRepo.createCustomer(effectiveWorkspaceId, {
      name: cleanName,
      company: cleanCompany,
      email: cleanEmail,
      phone: typeof phone === 'string' ? sanitizePlainText(phone, 50) : '',
      status: (status === 'Churned' || status === 'Lead' || status === 'Active') ? status : 'Active',
      totalRevenue: numRevenue,
      dealsCount: numDeals,
      lastContactedAt: lastContactedAt || new Date().toISOString(),
    });

    return NextResponse.json(newCustomer, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
