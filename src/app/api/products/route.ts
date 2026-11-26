import { NextResponse } from 'next/server';
import { crmRepo } from '@/lib/google-sheets/repository';
import { getAuthenticatedUser, isWorkspaceAdmin } from '@/lib/auth/rbac';
import { parseAndValidateJson, sanitizeCsvFormula, sanitizePlainText } from '@/lib/security';
import { ProductUnit } from '@/types/crm';

const VALID_UNITS = new Set<ProductUnit>(['Liters', 'Kg', 'Pack', 'Dozen']);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId') || 'ws-default';
    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    const products = await crmRepo.getProducts(authContext.user.workspaceId);
    return NextResponse.json(products);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch products' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const jsonResult = await parseAndValidateJson<any>(req, { maxBytes: 1024 * 1024 });
    if (!jsonResult.success) {
      return jsonResult.response;
    }
    const body = jsonResult.data;
    const workspaceId = (body.workspaceId || 'ws-default').trim();

    const authContext = await getAuthenticatedUser(req, workspaceId);
    if (!authContext) {
      return NextResponse.json({ error: 'Unauthorized: Session required' }, { status: 401 });
    }

    if (!isWorkspaceAdmin(authContext.user) && !authContext.isMasterAdmin && !authContext.permissions.canEditWorkspaceSettings) {
      return NextResponse.json({ error: 'Forbidden: Admin access required to manage products' }, { status: 403 });
    }

    const effectiveWs = authContext.user.workspaceId;

    // Support bulk import array `{ products: [...] }`
    if (Array.isArray(body.products)) {
      const sanitizedItems = body.products
        .filter((p: any) => p && (p.name || p.sku))
        .map((p: any, idx: number) => {
          const unit: ProductUnit = VALID_UNITS.has(p.unit) ? p.unit : 'Kg';
          return {
            sku: sanitizeCsvFormula(String(p.sku || `3PM-${Date.now()}-${idx}`).slice(0, 80).trim()),
            name: sanitizeCsvFormula(String(p.name || 'Unnamed Chemical').slice(0, 200).trim()),
            category: sanitizePlainText(String(p.category || 'General Chemicals'), 100),
            unit,
            moq: Math.max(0, Number(p.moq) || 1),
            unitPrice: Math.max(0, Number(p.unitPrice) || 0),
          };
        });

      const created = await crmRepo.bulkCreateProducts(effectiveWs, sanitizedItems);
      return NextResponse.json({ importedCount: created.length, products: created }, { status: 201 });
    }

    const { sku, name, category, unit, moq, unitPrice } = body;
    if (!name || !sku) {
      return NextResponse.json({ error: 'Product name and SKU are required' }, { status: 400 });
    }

    const resolvedUnit: ProductUnit = VALID_UNITS.has(unit) ? unit : 'Kg';
    const created = await crmRepo.createProduct(effectiveWs, {
      sku: sanitizeCsvFormula(String(sku).slice(0, 80).trim()),
      name: sanitizeCsvFormula(String(name).slice(0, 200).trim()),
      category: sanitizePlainText(String(category || 'General Chemicals'), 100),
      unit: resolvedUnit,
      moq: Math.max(0, Number(moq) || 1),
      unitPrice: Math.max(0, Number(unitPrice) || 0),
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to create product' }, { status: 500 });
  }
}
