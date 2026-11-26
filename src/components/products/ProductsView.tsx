'use client';

import React, { useMemo, useState } from 'react';
import { Package, Search, Plus, Upload, X } from 'lucide-react';
import { Product, ProductUnit, TeamMember, Workspace } from '@/types/crm';
import { HeaderReveal } from '@/components/ui/HeaderReveal';
import { formatCurrency } from '@/lib/financial';

interface ProductsViewProps {
  workspace: Workspace;
  products: Product[];
  currentUser?: TeamMember | null;
  onProductsChanged: () => Promise<void>;
}

const UNITS: ProductUnit[] = ['Liters', 'Kg', 'Pack', 'Dozen'];

export function ProductsView({
  workspace,
  products,
  currentUser,
  onProductsChanged,
}: ProductsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [unitFilter, setUnitFilter] = useState<'ALL' | ProductUnit>('ALL');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);

  // Add single product state
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Industrial Chemicals');
  const [unit, setUnit] = useState<ProductUnit>('Liters');
  const [moq, setMoq] = useState('20');
  const [unitPrice, setUnitPrice] = useState('150');
  const [isSaving, setIsSaving] = useState(false);

  // Bulk import CSV state
  const [bulkCsv, setBulkCsv] = useState('');
  const [bulkStatus, setBulkStatus] = useState<string | null>(null);

  const isAdmin = !currentUser || currentUser.role === 'Owner' || currentUser.role === 'Admin';

  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return products.filter((p) => {
      if (unitFilter !== 'ALL' && p.unit !== unitFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q)
      );
    });
  }, [products, searchQuery, unitFilter]);

  const categoriesCount = useMemo(() => {
    return new Set(products.map((p) => p.category).filter(Boolean)).size;
  }, [products]);

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sku.trim() || !name.trim()) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace.id,
          sku: sku.trim(),
          name: name.trim(),
          category: category.trim() || 'General Chemicals',
          unit,
          moq: Math.max(1, Number(moq) || 1),
          unitPrice: Math.max(0, Number(unitPrice) || 0),
        }),
      });
      if (res.ok) {
        setSku('');
        setName('');
        setShowAddModal(false);
        await onProductsChanged();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to add product');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleBulkImport = async () => {
    const lines = bulkCsv
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    const parsed: any[] = [];
    for (let i = 0; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim());
      if (i === 0 && cols[0]?.toLowerCase() === 'sku') continue;
      if (cols.length < 2) continue;
      const rawUnit = cols[3] as ProductUnit;
      parsed.push({
        sku: cols[0],
        name: cols[1],
        category: cols[2] || 'General Chemicals',
        unit: UNITS.includes(rawUnit) ? rawUnit : 'Kg',
        moq: Math.max(1, Number(cols[4]) || 1),
        unitPrice: Math.max(0, Number(cols[5]) || 0),
      });
    }

    if (parsed.length === 0) {
      setBulkStatus('No valid CSV rows found. Expected: sku,name,category,unit,moq,unitPrice');
      return;
    }

    setIsSaving(true);
    setBulkStatus(null);
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: workspace.id, products: parsed }),
      });
      const data = await res.json();
      if (res.ok) {
        setBulkStatus(`Imported ${data.importedCount} products successfully.`);
        setBulkCsv('');
        await onProductsChanged();
      } else {
        setBulkStatus(data.error || 'Bulk import failed.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-16">
      <HeaderReveal
        title="Chemical Products Catalog"
        subtitle="3packmark Private Limited SKU directory with MOQ & unit pricing"
        tiles={[
          { label: 'Total SKUs', numericValue: products.length, badge: 'Active catalog' },
          { label: 'Categories', numericValue: categoriesCount, badge: 'Chemical lines' },
          { label: 'Matching Filter', numericValue: filteredProducts.length, badge: unitFilter },
        ]}
      />

      <div className="card rounded-[32px] p-5 sm:p-6 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-[var(--muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search 600+ chemicals by name, SKU, or category..."
              className="w-full pl-10 pr-4 py-2.5 rounded-full bg-[var(--glass-2)] border border-[var(--rim)] text-xs text-[var(--text)] focus:outline-none focus:border-[var(--text)]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(['ALL', ...UNITS] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnitFilter(u)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                  unitFilter === u
                    ? 'bg-[#17191A] text-white border-[#17191A]'
                    : 'bg-[var(--glass-2)] text-[var(--muted)] border-[var(--rim)] hover:text-[var(--text)]'
                }`}
              >
                {u}
              </button>
            ))}

            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => setShowBulkModal(true)}
                  className="btn btn--subtle text-xs px-3.5 py-2 rounded-full flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Bulk Import CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="btn btn--primary text-xs px-4 py-2 rounded-full flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Product</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-2xl border border-[var(--rim)]">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[var(--glass-2)] border-b border-[var(--rim)] text-[var(--muted)] font-semibold">
                <th className="py-3 px-4">SKU</th>
                <th className="py-3 px-4">Product Name</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Unit</th>
                <th className="py-3 px-4 text-right">MOQ</th>
                <th className="py-3 px-4 text-right">Unit Price (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--rim)]">
              {filteredProducts.map((p) => (
                <tr key={p.id} className="hover:bg-[var(--glass-2)]/60 transition-colors">
                  <td className="py-3 px-4 font-mono text-[11px] font-semibold text-[var(--muted)]">{p.sku}</td>
                  <td className="py-3 px-4 font-semibold text-[var(--text)]">
                    <div className="flex items-center gap-2">
                      <Package className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />
                      <span>{p.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-[var(--muted)]">{p.category}</td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--glass-2)] border border-[var(--rim)]">
                      {p.unit}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-tabular font-semibold text-[var(--text)]">
                    {p.moq} {p.unit}
                  </td>
                  <td className="py-3 px-4 text-right font-tabular font-bold text-[var(--text)]">
                    {formatCurrency(p.unitPrice, 'INR')}
                  </td>
                </tr>
              ))}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-[var(--muted)]">
                    No chemical products match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Product Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs" onClick={() => setShowAddModal(false)}>
          <form
            onSubmit={handleAddProduct}
            onClick={(e) => e.stopPropagation()}
            className="card max-w-md w-full p-6 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[var(--text-ink)]">Add Chemical Product</h3>
              <button type="button" onClick={() => setShowAddModal(false)} className="p-1.5 rounded-full hover:bg-[var(--bg-main)]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">SKU *</label>
                <input required value={sku} onChange={(e) => setSku(e.target.value)} placeholder="3PM-CHM-026" className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)]" />
              </div>
              <div>
                <label className="font-semibold block mb-1">Unit *</label>
                <select value={unit} onChange={(e) => setUnit(e.target.value as ProductUnit)} className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)]">
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="font-semibold block mb-1">Product Name *</label>
                <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Industrial Sodium Hypochlorite 12%" className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)]" />
              </div>
              <div className="col-span-2">
                <label className="font-semibold block mb-1">Category</label>
                <input value={category} onChange={(e) => setCategory(e.target.value)} className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)]" />
              </div>
              <div>
                <label className="font-semibold block mb-1">MOQ *</label>
                <input type="number" min="1" required value={moq} onChange={(e) => setMoq(e.target.value)} className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)]" />
              </div>
              <div>
                <label className="font-semibold block mb-1">Unit Price (₹) *</label>
                <input type="number" min="0" step="0.01" required value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)]" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowAddModal(false)} className="btn btn--subtle text-xs px-4 py-2 rounded-full">Cancel</button>
              <button type="submit" disabled={isSaving} className="btn btn--primary text-xs px-5 py-2 rounded-full">
                {isSaving ? 'Saving...' : 'Save Product'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs" onClick={() => setShowBulkModal(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="card max-w-lg w-full p-6 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[var(--text-ink)]">Bulk Import Products (CSV)</h3>
              <button type="button" onClick={() => setShowBulkModal(false)} className="p-1.5 rounded-full hover:bg-[var(--bg-main)]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Paste CSV lines with columns: <code className="font-mono">sku,name,category,unit,moq,unitPrice</code> (Units: Liters, Kg, Pack, Dozen).
            </p>
            <textarea
              rows={8}
              value={bulkCsv}
              onChange={(e) => setBulkCsv(e.target.value)}
              placeholder={'sku,name,category,unit,moq,unitPrice\n3PM-CHM-026,Formic Acid 85%,Organic Acids,Liters,35,92'}
              className="w-full p-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-main)] font-mono text-xs"
            />
            {bulkStatus && <p className="text-xs font-semibold text-[var(--pine)]">{bulkStatus}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowBulkModal(false)} className="btn btn--subtle text-xs px-4 py-2 rounded-full">Close</button>
              <button type="button" disabled={isSaving || !bulkCsv.trim()} onClick={handleBulkImport} className="btn btn--primary text-xs px-5 py-2 rounded-full">
                {isSaving ? 'Importing...' : 'Import Products'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
