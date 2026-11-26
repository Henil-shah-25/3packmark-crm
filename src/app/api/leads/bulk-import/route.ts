import { NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';
import { getAuthenticatedUser } from '@/lib/auth/rbac';
import { parseAndValidateJson, sanitizeCsvFormula, sanitizePlainText } from '@/lib/security';
import { DealProductItem, Lead, Product } from '@/types/crm';

function normalizePhoneKey(raw?: string): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length < 7) return '';
  return digits.slice(-10);
}

function normalizeLeadSource(raw?: string): 'Phone Call' | 'Visit' | 'Cold Call' | 'Seminar' {
  const v = String(raw || '').trim().toLowerCase();
  if (v.includes('phone') || v.includes('inbound') || (v.includes('call') && !v.includes('cold'))) return 'Phone Call';
  if (v.includes('visit') || v.includes('field') || v.includes('meeting')) return 'Visit';
  if (v.includes('seminar') || v.includes('expo') || v.includes('event') || v.includes('conference')) return 'Seminar';
  return 'Cold Call';
}

function resolveOrQueueProduct(
  rawQuery: string,
  catalog: Product[],
  pendingMap: Map<string, Product>
): Product {
  const q = rawQuery.trim();
  const qLower = q.toLowerCase();

  const existing =
    catalog.find((p) => p.sku.toLowerCase() === qLower || p.name.toLowerCase() === qLower) ||
    catalog.find((p) => p.name.toLowerCase().includes(qLower) || qLower.includes(p.name.toLowerCase()));
  if (existing) return existing;

  const pending = pendingMap.get(qLower);
  if (pending) return pending;

  const placeholder: Product = {
    id: `prod-imp-${Date.now()}-${pendingMap.size}-${Math.random().toString(36).slice(2, 5)}`,
    workspaceId: catalog[0]?.workspaceId || 'ws-default',
    sku: `3PM-IMP-${String(pendingMap.size + 1).padStart(3, '0')}`,
    name: sanitizeCsvFormula(q.slice(0, 200)) || 'Imported Chemical',
    category: 'Imported Chemicals',
    unit: 'Liters',
    moq: 1,
    unitPrice: 0,
  };
  pendingMap.set(qLower, placeholder);
  return placeholder;
}

function parseProductSegment(
  segment: string,
  catalog: Product[],
  pendingMap: Map<string, Product>
): DealProductItem | null {
  const trimmed = segment.trim();
  if (!trimmed) return null;

  const colonIdx = trimmed.lastIndexOf(':');
  let namePart = trimmed;
  let qty = 1;

  if (colonIdx > 0) {
    const possibleQtyStr = trimmed.slice(colonIdx + 1).replace(/[^\d.]/g, '');
    const parsedQty = Number(possibleQtyStr);
    if (possibleQtyStr && Number.isFinite(parsedQty) && parsedQty > 0) {
      namePart = trimmed.slice(0, colonIdx).trim();
      qty = parsedQty;
    }
  }

  if (!namePart) return null;
  const prod = resolveOrQueueProduct(namePart, catalog, pendingMap);
  const moq = Math.max(0, Number(prod.moq) || 1);
  const totalQuantity = Math.max(0, qty);
  const extraQuantity = Math.max(0, totalQuantity - moq);
  const unitPrice = Math.max(0, Number(prod.unitPrice) || 0);
  const lineTotal = totalQuantity * unitPrice;

  return {
    productId: prod.id,
    sku: prod.sku,
    name: prod.name,
    unit: prod.unit,
    moq,
    extraQuantity,
    totalQuantity,
    unitPrice,
    lineTotal,
  };
}

function parseCurrentProducts(
  raw: unknown,
  catalog: Product[],
  pendingMap: Map<string, Product>
): DealProductItem[] {
  const str = String(raw || '').trim();
  if (!str) return [];
  const segments = str.split(/[;\n]+/);
  const items: DealProductItem[] = [];
  for (const seg of segments) {
    const item = parseProductSegment(seg, catalog, pendingMap);
    if (item) items.push(item);
  }
  return items;
}

function parsePastPurchases(
  raw: unknown,
  catalog: Product[],
  pendingMap: Map<string, Product>
): Array<{ wonAt: string; value: number; items: DealProductItem[]; title: string }> {
  const str = String(raw || '').trim();
  if (!str) return [];
  const entries = str.split(/[;\n]+/);
  const orders: Array<{ wonAt: string; value: number; items: DealProductItem[]; title: string }> = [];

  for (const entry of entries) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    const parts = trimmed.split('|').map((p) => p.trim()).filter(Boolean);
    let dateStr = '';
    let productPart = '';
    let amountVal: number | null = null;

    if (parts.length >= 3) {
      dateStr = parts[0];
      productPart = parts[1];
      const num = Number(parts[2].replace(/[^0-9.]/g, ''));
      if (Number.isFinite(num)) amountVal = num;
    } else if (parts.length === 2) {
      if (/^\d{4}-\d{2}-\d{2}/.test(parts[0]) || !isNaN(Date.parse(parts[0]))) {
        dateStr = parts[0];
        productPart = parts[1];
      } else {
        productPart = parts[0];
        const num = Number(parts[1].replace(/[^0-9.]/g, ''));
        if (Number.isFinite(num)) amountVal = num;
      }
    } else {
      productPart = parts[0];
    }

    const item = parseProductSegment(productPart, catalog, pendingMap);
    const items = item ? [item] : [];
    const parsedDate = dateStr && !isNaN(Date.parse(dateStr))
      ? new Date(dateStr).toISOString()
      : new Date().toISOString();
    const computedValue =
      amountVal !== null
        ? amountVal
        : items.reduce((s, i) => s + (Number(i.lineTotal) || 0), 0);

    orders.push({
      wonAt: parsedDate,
      value: computedValue,
      items,
      title: item ? `Past Order: ${item.name} (${item.totalQuantity} ${item.unit})` : `Past Order (${productPart})`,
    });
  }

  return orders;
}

export async function POST(req: Request) {
  try {
    const jsonResult = await parseAndValidateJson<any>(req, { maxBytes: 4 * 1024 * 1024 });
    if (!jsonResult.success) {
      return jsonResult.response;
    }

    const body = jsonResult.data;
    const targetWs = (body.workspaceId || 'ws-default').trim();
    const authContext = await getAuthenticatedUser(req, targetWs);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    if (authContext.user.role === 'Read-only') {
      return NextResponse.json({ error: 'Forbidden: Read-only users cannot import leads' }, { status: 403 });
    }

    const effectiveWs = authContext.user.workspaceId;
    const rawRows: any[] = Array.isArray(body.leads) ? body.leads : [];
    const skipDuplicates = body.skipDuplicates !== false;

    if (rawRows.length === 0) {
      return NextResponse.json({ error: 'No leads provided for import' }, { status: 400 });
    }
    if (rawRows.length > 2500) {
      return NextResponse.json({ error: 'Maximum 2,500 rows allowed per upload' }, { status: 400 });
    }

    const [existingLeads, stages, members, catalogProducts] = await Promise.all([
      crmRepo.getLeads(effectiveWs),
      crmRepo.getStages(effectiveWs),
      crmRepo.getMembers(effectiveWs),
      crmRepo.getProducts(effectiveWs),
    ]);

    const existingPhones = new Set<string>();
    const existingEmails = new Set<string>();
    for (const l of existingLeads) {
      const pk = normalizePhoneKey(l.phone);
      if (pk) existingPhones.add(pk);
      const ek = (l.email || '').trim().toLowerCase();
      if (ek) existingEmails.add(ek);
    }

    const defaultStageId = stages[0]?.id || 'stg-new-lead';
    const pendingNewProducts = new Map<string, Product>();
    const validLeadsToCreate: Partial<Lead>[] = [];
    const historicalWonLeadsToCreate: Partial<Lead>[] = [];
    let skippedDuplicates = 0;
    let invalidCount = 0;

    for (const row of rawRows) {
      if (!row || typeof row !== 'object') {
        invalidCount++;
        continue;
      }

      const companyName = sanitizeCsvFormula(String(row.companyName || row.company || '').slice(0, 200).trim());
      const contactPerson = sanitizeCsvFormula(String(row.contactPerson || row.contactName || '').slice(0, 200).trim());
      const phone = sanitizeCsvFormula(String(row.phone || '').slice(0, 40).trim());
      const email = String(row.email || '').trim().toLowerCase().slice(0, 254);

      if (!companyName && !contactPerson) {
        invalidCount++;
        continue;
      }

      const phoneKey = normalizePhoneKey(phone);
      const emailKey = email && email.includes('@') ? email : '';

      if (skipDuplicates) {
        if ((phoneKey && existingPhones.has(phoneKey)) || (emailKey && existingEmails.has(emailKey))) {
          skippedDuplicates++;
          continue;
        }
      }

      if (phoneKey) existingPhones.add(phoneKey);
      if (emailKey) existingEmails.add(emailKey);

      const cityState = sanitizePlainText(String(row.cityState || row.city || ''), 120);
      const leadSource = normalizeLeadSource(row.leadSource || row.source);
      const notes = sanitizePlainText(String(row.notes || ''), 2000);

      const rawStage = String(row.initialStage || row.stage || '').trim().toLowerCase();
      const matchedStage = rawStage
        ? stages.find((s) => s.id.toLowerCase() === rawStage || s.name.toLowerCase() === rawStage)
        : undefined;
      const stageId = matchedStage?.id || defaultStageId;

      const rawRep = String(row.assignedRep || row.ownerId || '').trim().toLowerCase();
      const matchedMember = rawRep
        ? members.find(
            (m) =>
              m.id.toLowerCase() === rawRep ||
              m.email.toLowerCase() === rawRep ||
              m.name.toLowerCase() === rawRep
          )
        : undefined;
      const ownerId =
        matchedMember && (authContext.permissions.canAssignLeads || matchedMember.id === authContext.user.id)
          ? matchedMember.id
          : authContext.user.id;

      // Auto-link Current Products
      const lineItems = parseCurrentProducts(row.currentProducts, catalogProducts, pendingNewProducts);
      const dealValue = lineItems.reduce((sum, item) => sum + (Number(item.lineTotal) || 0), 0);

      const resolvedCompany = companyName || contactPerson;
      const resolvedContact = contactPerson || companyName;

      validLeadsToCreate.push({
        company: resolvedCompany,
        contactName: resolvedContact,
        title: `${resolvedCompany} Opportunity`,
        phone,
        email: emailKey,
        city: cityState,
        leadSource,
        source: leadSource,
        stageId,
        pipelineId: matchedStage?.pipelineId || 'pipe-sales',
        ownerId,
        notes,
        products: lineItems,
        lineItems,
        value: dealValue,
        closingProbability: matchedStage?.probability ?? 10,
      });

      // Auto-populate Conditional Past Purchase History (ONLY when Past Purchases is non-empty)
      const pastOrders = parsePastPurchases(row.pastPurchases, catalogProducts, pendingNewProducts);
      for (const po of pastOrders) {
        historicalWonLeadsToCreate.push({
          company: resolvedCompany,
          contactName: resolvedContact,
          title: po.title,
          phone,
          email: emailKey,
          city: cityState,
          leadSource,
          source: leadSource,
          stageId: 'stg-closed',
          status: 'Won',
          pipelineId: matchedStage?.pipelineId || 'pipe-sales',
          ownerId,
          products: po.items,
          lineItems: po.items,
          value: po.value,
          wonAt: po.wonAt,
          closingProbability: 100,
        });
      }
    }

    // Persist any auto-created placeholder catalog products in one batch
    let newProductsCreated = 0;
    if (pendingNewProducts.size > 0) {
      const toCreate = Array.from(pendingNewProducts.values()).map((p) => ({
        sku: p.sku,
        name: p.name,
        category: p.category,
        unit: p.unit,
        moq: p.moq,
        unitPrice: p.unitPrice,
      }));
      const createdProds = await crmRepo.bulkCreateProducts(effectiveWs, toCreate);
      newProductsCreated = createdProds.length;
    }

    const allLeadsToAppend = [...validLeadsToCreate, ...historicalWonLeadsToCreate];
    await crmRepo.bulkCreateLeads(effectiveWs, allLeadsToAppend);

    await crmRepo.logAudit(effectiveWs, {
      userId: authContext.user.id,
      userName: authContext.user.name,
      action: 'BULK_IMPORT_LEADS',
      details: `Imported ${validLeadsToCreate.length} leads + ${historicalWonLeadsToCreate.length} past orders + ${newProductsCreated} new products (Skipped duplicates: ${skippedDuplicates}, Invalid: ${invalidCount})`,
    });

    return NextResponse.json(
      {
        success: true,
        importedCount: validLeadsToCreate.length,
        historicalOrdersCreated: historicalWonLeadsToCreate.length,
        newProductsCreated,
        skippedDuplicates,
        invalidCount,
        totalReceived: rawRows.length,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('[API Bulk Import Leads Error]:', err);
    return NextResponse.json({ error: err.message || 'Bulk import failed' }, { status: 500 });
  }
}
