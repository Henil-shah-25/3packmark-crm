'use client';

import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  X,
  UploadCloud,
  Download,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import { Lead } from '@/types/crm';

interface BulkLeadImportModalProps {
  isOpen: boolean;
  workspaceId: string;
  existingLeads: Lead[];
  onClose: () => void;
  onImportComplete: () => Promise<void> | void;
}

type TargetFieldKey =
  | 'companyName'
  | 'contactPerson'
  | 'phone'
  | 'email'
  | 'cityState'
  | 'leadSource'
  | 'initialStage'
  | 'assignedRep'
  | 'currentProducts'
  | 'pastPurchases'
  | 'notes';

const TARGET_FIELDS: { key: TargetFieldKey; label: string; required?: boolean }[] = [
  { key: 'companyName', label: 'Company Name', required: true },
  { key: 'contactPerson', label: 'Contact Person' },
  { key: 'phone', label: 'Phone / Mobile' },
  { key: 'email', label: 'Email' },
  { key: 'cityState', label: 'City / State' },
  { key: 'leadSource', label: 'Lead Source' },
  { key: 'initialStage', label: 'Initial Stage' },
  { key: 'assignedRep', label: 'Assigned Rep' },
  { key: 'currentProducts', label: 'Current Products' },
  { key: 'pastPurchases', label: 'Past Purchases' },
  { key: 'notes', label: 'Notes' },
];

function fuzzyMatchHeader(header: string): TargetFieldKey | '' {
  const h = header.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!h) return '';
  if (h.includes('currentproduct') || h === 'products' || h === 'product' || h === 'items') return 'currentProducts';
  if (h.includes('pastpurchase') || h.includes('purchasehistory') || h.includes('pastorder')) return 'pastPurchases';
  if (h.includes('company') || h.includes('party') || h.includes('firm') || h.includes('organization')) return 'companyName';
  if (h.includes('contactperson') || h.includes('contactname') || h === 'name' || h === 'person') return 'contactPerson';
  if (h.includes('phone') || h.includes('mobile') || h.includes('contactno') || h.includes('whatsapp') || h.includes('tel')) return 'phone';
  if (h.includes('email') || h.includes('mail')) return 'email';
  if (h.includes('city') || h.includes('state') || h.includes('location') || h.includes('address')) return 'cityState';
  if (h.includes('source') || h.includes('channel')) return 'leadSource';
  if (h.includes('stage') || h.includes('status')) return 'initialStage';
  if (h.includes('rep') || h.includes('owner') || h.includes('assigned') || h.includes('salesperson')) return 'assignedRep';
  if (h.includes('note') || h.includes('remark') || h.includes('comment')) return 'notes';
  return '';
}

function normalizePhoneKey(raw?: string): string {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-10) : '';
}

function normalizeSourceLabel(raw?: string): 'Phone Call' | 'Visit' | 'Cold Call' | 'Seminar' {
  const v = String(raw || '').trim().toLowerCase();
  if (v.includes('phone') || v.includes('inbound') || (v.includes('call') && !v.includes('cold'))) return 'Phone Call';
  if (v.includes('visit') || v.includes('field') || v.includes('meeting')) return 'Visit';
  if (v.includes('seminar') || v.includes('expo') || v.includes('event') || v.includes('conference')) return 'Seminar';
  return 'Cold Call';
}

export function BulkLeadImportModal({
  isOpen,
  workspaceId,
  existingLeads,
  onClose,
  onImportComplete,
}: BulkLeadImportModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fileName, setFileName] = useState<string>('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([]);
  const [columnMap, setColumnMap] = useState<Record<TargetFieldKey, string>>({
    companyName: '',
    contactPerson: '',
    phone: '',
    email: '',
    cityState: '',
    leadSource: '',
    initialStage: '',
    assignedRep: '',
    currentProducts: '',
    pastPurchases: '',
    notes: '',
  });
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Step 3 state
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [importSummary, setImportSummary] = useState<{
    importedCount: number;
    skippedDuplicates: number;
    invalidCount: number;
    totalReceived: number;
  } | null>(null);

  const mappedRows = useMemo(() => {
    return rawRows.map((row) => {
      const getVal = (field: TargetFieldKey) => {
        const col = columnMap[field];
        return col ? String(row[col] ?? '').trim() : '';
      };
      const companyName = getVal('companyName');
      const contactPerson = getVal('contactPerson');
      const phone = getVal('phone');
      const email = getVal('email');
      const cityState = getVal('cityState');
      const leadSource = normalizeSourceLabel(getVal('leadSource'));
      const initialStage = getVal('initialStage');
      const assignedRep = getVal('assignedRep');
      const currentProducts = getVal('currentProducts');
      const pastPurchases = getVal('pastPurchases');
      const notes = getVal('notes');

      const warnings: string[] = [];
      if (!companyName && !contactPerson) warnings.push('Missing Company/Contact Name');
      if (!phone) warnings.push('Missing Phone');

      return {
        companyName,
        contactPerson,
        phone,
        email,
        cityState,
        leadSource,
        initialStage,
        assignedRep,
        currentProducts,
        pastPurchases,
        notes,
        warnings,
        isValid: Boolean(companyName || contactPerson),
      };
    });
  }, [rawRows, columnMap]);

  const duplicateEstimate = useMemo(() => {
    const phoneSet = new Set<string>();
    const emailSet = new Set<string>();
    for (const l of existingLeads) {
      const pk = normalizePhoneKey(l.phone);
      if (pk) phoneSet.add(pk);
      const ek = (l.email || '').trim().toLowerCase();
      if (ek) emailSet.add(ek);
    }

    let dupes = 0;
    for (const r of mappedRows) {
      if (!r.isValid) continue;
      const pk = normalizePhoneKey(r.phone);
      const ek = r.email.trim().toLowerCase();
      if ((pk && phoneSet.has(pk)) || (ek && emailSet.has(ek))) {
        dupes++;
      } else {
        if (pk) phoneSet.add(pk);
        if (ek) emailSet.add(ek);
      }
    }
    return dupes;
  }, [mappedRows, existingLeads]);

  if (!isOpen) return null;

  const handleDownloadSampleTemplate = () => {
    const sampleData = [
      {
        'Company Name': 'Apex Chemical Industries Pvt Ltd',
        'Contact Person': 'Rajesh Mehta',
        Phone: '+91 98201 11223',
        Email: 'rajesh@apexchem.in',
        'City / State': 'Mumbai, Maharashtra',
        'Lead Source': 'Cold Call',
        'Initial Stage': 'New Lead',
        'Assigned Rep': 'sales1@3packmark.com',
        'Current Products': 'Industrial Sodium Hypochlorite 12%: 200; Silicone Defoamer Emulsion: 20',
        'Past Purchases': '2026-08-15 | Caustic Soda Flakes 99%: 100 | ₹4500',
        Notes: 'Interested in 200 Liters industrial solvent',
      },
      {
        'Company Name': 'Bharat Polymers & Resins',
        'Contact Person': 'Sneha Kulkarni',
        Phone: '+91 98765 44321',
        Email: 'sneha@bharatpolymers.com',
        'City / State': 'Pune, Maharashtra',
        'Lead Source': 'Phone Call',
        'Initial Stage': 'Inquiry',
        'Assigned Rep': 'sales2@3packmark.com',
        'Current Products': 'Epoxy Resin Hardener Grade-A: 42',
        'Past Purchases': '',
        Notes: 'Requested COA and MOQ pricing',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '3packmark_Leads_Template');
    XLSX.writeFile(wb, '3packmark_Bulk_Leads_Template.xlsx');
  };

  const handleFile = async (file: File) => {
    setParseError(null);
    setImportSummary(null);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheet = workbook.SheetNames[0];
      if (!firstSheet) {
        setParseError('The uploaded file has no sheets.');
        return;
      }
      const sheet = workbook.Sheets[firstSheet];
      const jsonRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
      if (jsonRows.length === 0) {
        setParseError('The uploaded file is empty.');
        return;
      }
      if (jsonRows.length > 2500) {
        setParseError(`Found ${jsonRows.length} rows. Maximum 2,500 rows allowed per upload.`);
        return;
      }

      const detectedHeaders = Object.keys(jsonRows[0]);
      const autoMap: Record<TargetFieldKey, string> = {
        companyName: '',
        contactPerson: '',
        phone: '',
        email: '',
        cityState: '',
        leadSource: '',
        initialStage: '',
        assignedRep: '',
        currentProducts: '',
        pastPurchases: '',
        notes: '',
      };

      for (const h of detectedHeaders) {
        const matched = fuzzyMatchHeader(h);
        if (matched && !autoMap[matched]) {
          autoMap[matched] = h;
        }
      }

      setFileName(file.name);
      setHeaders(detectedHeaders);
      setRawRows(jsonRows);
      setColumnMap(autoMap);
      setStep(2);
    } catch (err: any) {
      setParseError(err?.message || 'Failed to parse Excel/CSV file.');
    }
  };

  const handleRunBatchImport = async () => {
    setIsImporting(true);
    setProgressPct(5);
    setImportSummary(null);

    try {
      const CHUNK_SIZE = 500;
      let totalImported = 0;
      let totalSkipped = 0;
      let totalInvalid = 0;

      const totalChunks = Math.ceil(mappedRows.length / CHUNK_SIZE);
      for (let i = 0; i < mappedRows.length; i += CHUNK_SIZE) {
        const chunk = mappedRows.slice(i, i + CHUNK_SIZE);
        const res = await fetch('/api/leads/bulk-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId,
            skipDuplicates,
            leads: chunk,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `Batch ${Math.floor(i / CHUNK_SIZE) + 1} failed`);
        }

        totalImported += Number(data.importedCount || 0);
        totalSkipped += Number(data.skippedDuplicates || 0);
        totalInvalid += Number(data.invalidCount || 0);

        const doneChunks = Math.floor(i / CHUNK_SIZE) + 1;
        setProgressPct(Math.round((doneChunks / totalChunks) * 100));
      }

      setImportSummary({
        importedCount: totalImported,
        skippedDuplicates: totalSkipped,
        invalidCount: totalInvalid,
        totalReceived: mappedRows.length,
      });

      await onImportComplete();
    } catch (err: any) {
      setParseError(err?.message || 'Bulk import failed.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden text-xs">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[#FAF8F2]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#17191A] text-white flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#17191A]">Bulk Import Leads (Excel / CSV)</h2>
              <p className="text-[11px] text-[#77766D]">
                Step {step} of 3 • High-speed 500-row batch engine (up to 2,500 rows)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-[#EFECE3] text-[#77766D] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {parseError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-[#C8431F] flex items-center gap-2 font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{parseError}</span>
            </div>
          )}

          {/* STEP 1 */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 p-4 rounded-2xl bg-[#FAF8F2] border border-[#E3DCCF]">
                <div>
                  <div className="font-bold text-[#262720]">Need the 3packmark Excel format?</div>
                  <div className="text-[11px] text-[#77766D]">
                    Download our pre-formatted `.xlsx` template with standard chemical B2B columns.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadSampleTemplate}
                  className="px-3.5 py-2 rounded-full bg-white border border-[#E3DCCF] hover:bg-[#EFECE3] text-[#262720] font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Sample Excel Template
                </button>
              </div>

              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleFile(file);
                }}
                className={`flex flex-col items-center justify-center p-10 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${
                  isDragging
                    ? 'border-[#17191A] bg-[#FAF8F2]'
                    : 'border-[#E3DCCF] bg-[#FAF8F2]/60 hover:bg-[#FAF8F2]'
                }`}
              >
                <UploadCloud className="w-9 h-9 text-[#77766D] mb-3" />
                <div className="font-bold text-sm text-[#262720]">
                  Drag &amp; drop your Excel (.xlsx / .xls) or CSV file here
                </div>
                <div className="text-[11px] text-[#77766D] mt-1">
                  Or click to browse • Up to 2,500 leads per upload
                </div>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                />
              </label>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-[#262720]">
                    Column Mapping ({fileName} — {rawRows.length.toLocaleString()} rows)
                  </div>
                  <div className="text-[11px] text-[#77766D]">
                    Verify auto-matched columns. Lead Source normalizes to Phone Call | Visit | Cold Call | Seminar.
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-2xl bg-[#FAF8F2] border border-[#E3DCCF]">
                {TARGET_FIELDS.map((tf) => (
                  <div key={tf.key}>
                    <label className="block text-[10px] font-bold text-[#77766D] mb-1">
                      {tf.label} {tf.required ? '*' : ''}
                    </label>
                    <select
                      value={columnMap[tf.key]}
                      onChange={(e) => setColumnMap((prev) => ({ ...prev, [tf.key]: e.target.value }))}
                      className="w-full p-2 rounded-xl border border-[#E3DCCF] bg-white text-xs text-[#262720]"
                    >
                      <option value="">-- Skip / Not Mapped --</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div>
                <div className="font-bold text-[#262720] mb-2">Validation Preview (First 10 Rows)</div>
                <div className="overflow-x-auto border border-[#E3DCCF] rounded-2xl">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-[#FAF8F2] border-b border-[#E3DCCF] text-[#77766D]">
                      <tr>
                        <th className="p-2.5">#</th>
                        <th className="p-2.5">Company</th>
                        <th className="p-2.5">Contact</th>
                        <th className="p-2.5">Phone</th>
                        <th className="p-2.5">Source</th>
                        <th className="p-2.5">Validation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EFECE3]">
                      {mappedRows.slice(0, 10).map((r, idx) => (
                        <tr key={idx}>
                          <td className="p-2.5 text-[#77766D]">{idx + 1}</td>
                          <td className="p-2.5 font-semibold">{r.companyName || '-'}</td>
                          <td className="p-2.5">{r.contactPerson || '-'}</td>
                          <td className="p-2.5 font-mono">{r.phone || '-'}</td>
                          <td className="p-2.5">{r.leadSource}</td>
                          <td className="p-2.5">
                            {r.warnings.length === 0 ? (
                              <span className="text-emerald-700 font-semibold">Valid</span>
                            ) : (
                              <span className="text-amber-700 font-semibold">{r.warnings.join(', ')}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3.5 rounded-2xl bg-[#FAF8F2] border border-[#E3DCCF]">
                  <div className="text-[11px] text-[#77766D]">Total Rows</div>
                  <div className="text-lg font-bold text-[#262720]">{mappedRows.length.toLocaleString()}</div>
                </div>
                <div className="p-3.5 rounded-2xl bg-[#FAF8F2] border border-[#E3DCCF]">
                  <div className="text-[11px] text-[#77766D]">Valid Rows</div>
                  <div className="text-lg font-bold text-emerald-700">
                    {mappedRows.filter((r) => r.isValid).length.toLocaleString()}
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-[#FAF8F2] border border-[#E3DCCF]">
                  <div className="text-[11px] text-[#77766D]">Detected Duplicates</div>
                  <div className="text-lg font-bold text-amber-700">{duplicateEstimate.toLocaleString()}</div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#FAF8F2] border border-[#E3DCCF] flex items-center justify-between gap-4">
                <div>
                  <div className="font-bold text-[#262720]">Duplicate Handling (Phone / Email)</div>
                  <div className="text-[11px] text-[#77766D]">
                    Choose whether to skip rows matching existing leads in your CRM.
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isImporting}
                    onClick={() => setSkipDuplicates(true)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-semibold cursor-pointer ${
                      skipDuplicates ? 'bg-[#17191A] text-white' : 'bg-white border border-[#E3DCCF] text-[#262720]'
                    }`}
                  >
                    Skip Duplicates
                  </button>
                  <button
                    type="button"
                    disabled={isImporting}
                    onClick={() => setSkipDuplicates(false)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-semibold cursor-pointer ${
                      !skipDuplicates ? 'bg-[#17191A] text-white' : 'bg-white border border-[#E3DCCF] text-[#262720]'
                    }`}
                  >
                    Import All
                  </button>
                </div>
              </div>

              {isImporting && (
                <div className="space-y-2 p-4 rounded-2xl bg-white border border-[#E3DCCF]">
                  <div className="flex justify-between font-semibold">
                    <span>Importing leads in 500-row batches...</span>
                    <span>{progressPct}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-[#EFECE3] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#17191A] transition-all duration-300"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              )}

              {importSummary && (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-sm">
                    <CheckCircle2 className="w-4 h-4" />
                    Bulk Import Complete
                  </div>
                  <div className="text-xs font-semibold">
                    Imported: {importSummary.importedCount} | Skipped Duplicates: {importSummary.skippedDuplicates} | Invalid Rows: {importSummary.invalidCount}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--border-subtle)] bg-[#FAF8F2] flex items-center justify-between">
          <div>
            {step > 1 && !importSummary && (
              <button
                type="button"
                disabled={isImporting}
                onClick={() => setStep((s) => (s === 3 ? 2 : 1))}
                className="px-4 py-2 rounded-full bg-white border border-[#E3DCCF] text-[#262720] font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {step === 2 && (
              <button
                type="button"
                onClick={() => setStep(3)}
                className="px-5 py-2 rounded-full bg-[#17191A] text-white font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                Continue to Duplicate Check
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {step === 3 && !importSummary && (
              <button
                type="button"
                disabled={isImporting}
                onClick={handleRunBatchImport}
                className="px-5 py-2 rounded-full bg-[#17191A] text-white font-semibold cursor-pointer disabled:opacity-50"
              >
                {isImporting ? 'Importing...' : `Start Batch Import (${mappedRows.length} rows)`}
              </button>
            )}

            {importSummary && (
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-full bg-[#17191A] text-white font-semibold cursor-pointer"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
