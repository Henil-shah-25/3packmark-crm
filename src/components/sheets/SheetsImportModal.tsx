'use client';

import React, { useState } from 'react';
import {
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  X,
  ArrowRight,
  Database,
  RefreshCw,
} from 'lucide-react';
import { Workspace } from '@/types/crm';

interface SheetsImportModalProps {
  workspace: Workspace;
  onClose: () => void;
  onImportComplete: () => Promise<void>;
}

export function SheetsImportModal({
  workspace,
  onClose,
  onImportComplete,
}: SheetsImportModalProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [spreadsheetId, setSpreadsheetId] = useState('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');
  const [sheetName, setSheetName] = useState('Leads');
  const [deduplicateBy, setDeduplicateBy] = useState<'email' | 'company'>('email');

  // Preview data
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<any[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Column mapping
  const [mapping, setMapping] = useState<{
    contactName: string;
    company: string;
    email: string;
    phone: string;
    value: string;
    source: string;
  }>({
    contactName: '',
    company: '',
    email: '',
    phone: '',
    value: '',
    source: '',
  });

  // Import execution result
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<{
    importedCount: number;
    updatedCount: number;
    skippedCount: number;
    errors: string[];
  } | null>(null);

  const handleFetchPreview = async () => {
    setIsLoadingPreview(true);
    try {
      const res = await fetch('/api/sheets/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview',
          workspaceId: workspace.id,
          spreadsheetId,
          sheetName,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setHeaders(data.headers);
        setSampleRows(data.sampleRows);

        // Auto guess mapping
        const autoMap: any = {};
        data.headers.forEach((h: string) => {
          const lower = h.toLowerCase();
          if (lower.includes('name')) autoMap.contactName = h;
          if (lower.includes('company') || lower.includes('org')) autoMap.company = h;
          if (lower.includes('email') || lower.includes('mail')) autoMap.email = h;
          if (lower.includes('phone') || lower.includes('mobile')) autoMap.phone = h;
          if (lower.includes('value') || lower.includes('amount') || lower.includes('deal')) autoMap.value = h;
          if (lower.includes('source') || lower.includes('channel')) autoMap.source = h;
        });

        setMapping((prev) => ({ ...prev, ...autoMap }));
        setStep(2);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to read spreadsheet preview');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleExecuteImport = async () => {
    setIsImporting(true);
    try {
      const res = await fetch('/api/sheets/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'execute',
          workspaceId: workspace.id,
          spreadsheetId,
          sheetName,
          mapping,
          rows: sampleRows,
          deduplicateBy,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setResult(data);
        setStep(4);
        await onImportComplete();
      }
    } catch (err: any) {
      alert(err.message || 'Import execution failed');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in-50 duration-200">
      <div className="bg-[#FAF8F2] rounded-3xl p-6 sm:p-7 border border-[#E3DCCF] shadow-2xl max-w-xl w-full space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#E3DCCF]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-2xl bg-[#EBF2EE] flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4 text-[#2F5C50]" />
            </div>
            <h2 className="text-base font-bold text-[#262720]">
              Import Leads from Google Sheets
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white border border-[#E3DCCF] hover:bg-[#EAE5D9] flex items-center justify-center text-[#77766D] hover:text-[#262720] button-press transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center justify-between text-[11px] font-semibold text-[#77766D] px-2 py-1 bg-[#F3EFE5] rounded-full border border-[#E3DCCF]">
          <span className={step >= 1 ? 'text-[#2F5C50]' : ''}>1. Spreadsheet</span>
          <ArrowRight className="w-3 h-3 text-[#77766D]/60" />
          <span className={step >= 2 ? 'text-[#2F5C50]' : ''}>2. Column Mapping</span>
          <ArrowRight className="w-3 h-3 text-[#77766D]/60" />
          <span className={step >= 3 ? 'text-[#2F5C50]' : ''}>3. Preview & Dedupe</span>
          <ArrowRight className="w-3 h-3 text-[#77766D]/60" />
          <span className={step >= 4 ? 'text-[#2F5C50]' : ''}>4. Results</span>
        </div>

        {/* Step 1: Select Sheet */}
        {step === 1 && (
          <div className="space-y-3.5 text-xs">
            <div>
              <label className="font-semibold block mb-1 text-[#262720]">Google Spreadsheet ID or URL *</label>
              <input
                type="text"
                value={spreadsheetId}
                onChange={(e) => setSpreadsheetId(e.target.value)}
                placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
                className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-white text-[#262720] font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-[#262720]"
              />
              <p className="text-[10px] text-[#77766D] mt-1">
                Enter either the full sheet URL or ID from your Google Drive.
              </p>
            </div>

            <div>
              <label className="font-semibold block mb-1 text-[#262720]">Worksheet Tab Name</label>
              <input
                type="text"
                value={sheetName}
                onChange={(e) => setSheetName(e.target.value)}
                placeholder="Leads or Sheet1"
                className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-white text-[#262720] focus:outline-none focus:ring-1 focus:ring-[#262720]"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-[#E3DCCF]">
              <button onClick={onClose} className="px-4 py-2 rounded-full border border-[#E3DCCF] text-xs font-semibold text-[#77766D] hover:text-[#262720] hover:bg-[#EAE5D9] button-press transition-all">
                Cancel
              </button>
              <button
                onClick={handleFetchPreview}
                disabled={isLoadingPreview}
                className="px-5 py-2 rounded-full bg-[#262720] hover:bg-[#1E201E] text-white text-xs font-semibold button-press transition-all disabled:opacity-50"
              >
                {isLoadingPreview ? 'Scanning Sheet...' : 'Next: Map Columns'}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Column Mapping */}
        {step === 2 && (
          <div className="space-y-3 text-xs">
            <p className="text-[#77766F]">
              Match your Google Sheet columns with Rapport CRM fields:
            </p>

            <div className="grid grid-cols-2 gap-3 max-h-60 overflow-y-auto p-1">
              <div>
                <label className="font-semibold block mb-1">Contact Name *</label>
                <select
                  value={mapping.contactName}
                  onChange={(e) => setMapping({ ...mapping, contactName: e.target.value })}
                  className="w-full p-2 rounded-xl border border-[#E4E0D6] bg-white"
                >
                  <option value="">Select column</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold block mb-1">Company Name *</label>
                <select
                  value={mapping.company}
                  onChange={(e) => setMapping({ ...mapping, company: e.target.value })}
                  className="w-full p-2 rounded-xl border border-[#E4E0D6] bg-white"
                >
                  <option value="">Select column</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold block mb-1">Email</label>
                <select
                  value={mapping.email}
                  onChange={(e) => setMapping({ ...mapping, email: e.target.value })}
                  className="w-full p-2 rounded-xl border border-[#E4E0D6] bg-white"
                >
                  <option value="">Select column</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold block mb-1">Deal Value ($)</label>
                <select
                  value={mapping.value}
                  onChange={(e) => setMapping({ ...mapping, value: e.target.value })}
                  className="w-full p-2 rounded-xl border border-[#E4E0D6] bg-white"
                >
                  <option value="">Select column</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-[#E4E0D6]">
              <button onClick={() => setStep(1)} className="px-3 py-1 rounded-full border border-[#E4E0D6]">
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="px-5 py-1.5 rounded-full bg-[#252725] text-white font-medium"
              >
                Next: Deduplication & Preview
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Deduplication & Preview */}
        {step === 3 && (
          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-2xl bg-white border border-[#E4E0D6] space-y-2">
              <span className="font-bold text-[#292A27] block">Duplicate Prevention Strategy</span>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="dedupe"
                    checked={deduplicateBy === 'email'}
                    onChange={() => setDeduplicateBy('email')}
                  />
                  <span>Match on Email (Update existing)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="dedupe"
                    checked={deduplicateBy === 'company'}
                    onChange={() => setDeduplicateBy('company')}
                  />
                  <span>Match on Company</span>
                </label>
              </div>
            </div>

            <div>
              <span className="font-semibold text-[#292A27] block mb-1">
                Preview Data ({sampleRows.length} rows scanned)
              </span>
              <div className="max-h-40 overflow-y-auto rounded-xl border border-[#E4E0D6] bg-white">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-[#EAE6DC]/40 text-[#77766F] font-semibold border-b border-[#E4E0D6]">
                    <tr>
                      <th className="p-2">Contact</th>
                      <th className="p-2">Company</th>
                      <th className="p-2">Email</th>
                      <th className="p-2">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sampleRows.slice(0, 4).map((row, idx) => (
                      <tr key={idx} className="border-b border-[#E4E0D6]/40">
                        <td className="p-2 font-medium">{row[mapping.contactName] || '—'}</td>
                        <td className="p-2 text-[#77766F]">{row[mapping.company] || '—'}</td>
                        <td className="p-2 text-[#77766F]">{row[mapping.email] || '—'}</td>
                        <td className="p-2 font-bold">${row[mapping.value] || '5,000'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-[#E3DCCF]">
              <button onClick={() => setStep(2)} className="px-3.5 py-1.5 rounded-full border border-[#E3DCCF] text-xs font-semibold text-[#77766D] hover:text-[#262720] hover:bg-[#EAE5D9] button-press transition-all">
                Back
              </button>
              <button
                onClick={handleExecuteImport}
                disabled={isImporting}
                className="px-5 py-2 rounded-full bg-[#2F5C50] hover:bg-[#205749] text-white text-xs font-semibold flex items-center gap-2 shadow-xs button-press transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isImporting ? 'animate-spin' : ''}`} />
                <span>{isImporting ? 'Importing...' : 'Execute Import & Sync'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Results */}
        {step === 4 && result && (
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-2xl bg-[#EBF2EE] border border-[#2F5C50]/30 space-y-2">
              <div className="flex items-center gap-2 text-[#2F5C50] font-bold text-sm">
                <CheckCircle className="w-5 h-5" />
                <span>Import Completed Successfully</span>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-2 text-[#262720]">
                <div className="bg-white p-3 rounded-xl border border-[#2F5C50]/20">
                  <span className="text-[10px] text-[#77766D] block">Created Leads</span>
                  <span className="text-lg font-bold text-[#2F5C50]">{result.importedCount}</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-[#2F5C50]/20">
                  <span className="text-[10px] text-[#77766D] block">Updated Duplicates</span>
                  <span className="text-lg font-bold text-[#262720]">{result.updatedCount}</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-[#2F5C50]/20">
                  <span className="text-[10px] text-[#77766D] block">Skipped / Errors</span>
                  <span className="text-lg font-bold text-[#77766D]">{result.skippedCount}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={onClose}
                className="px-6 py-2 rounded-full bg-[#262720] hover:bg-[#1E201E] text-white text-xs font-semibold button-press transition-all"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
