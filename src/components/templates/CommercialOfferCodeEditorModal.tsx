'use client';

import React, { useMemo, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { html } from '@codemirror/lang-html';
import { X, RotateCcw, Save, CheckCircle2, Code2, Eye } from 'lucide-react';
import { Workspace, Lead, DealProductItem } from '@/types/crm';
import {
  buildCommercialOfferHtml,
  COMMERCIAL_OFFER_TEMPLATE_ID,
  COMMERCIAL_OFFER_TEMPLATE_NAME,
  COMMERCIAL_OFFER_VARIABLES,
  DEFAULT_COMMERCIAL_OFFER_HTML_TEMPLATE,
} from '@/lib/quotation/commercialOfferTemplate';

interface CommercialOfferCodeEditorModalProps {
  isOpen: boolean;
  workspace: Workspace;
  initialHtml?: string;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

const SAMPLE_LEAD: Lead = {
  id: 'lead-sample-06',
  workspaceId: 'ws-default',
  title: 'Chemical Supply',
  contactName: 'SHRI Chintan Jardosh',
  email: 'purchase@narmadachem.in',
  phone: '+91 98250 11223',
  company: 'Narmada Water Treatment Co',
  city: 'KOSAMBA',
  state: 'Gujarat',
  country: 'India',
  address: 'Plot 42, GIDC Industrial Estate, Kosamba',
  gstTaxId: '24AAACN1234F1Z5',
  value: 9600,
  pipelineId: 'pipe-sales',
  stageId: 'stg-quotation',
  ownerId: 'mem-1',
  priority: 'high',
  status: 'Proposal',
  source: 'Phone Call',
  expectedCloseDate: '',
  closingProbability: 45,
  tags: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const SAMPLE_ITEMS: DealProductItem[] = [
  {
    productId: 'prod-1',
    sku: 'NC-123',
    name: 'NC 123 PLUS (AEROSOL) 12 X 300 GRM',
    unit: 'Pack',
    moq: 10,
    extraQuantity: 2,
    totalQuantity: 12,
    unitPrice: 800,
    lineTotal: 9600,
    hsnCode: '38140010',
  },
];

export function CommercialOfferCodeEditorModal({
  isOpen,
  workspace,
  initialHtml,
  onClose,
  onSaved,
}: CommercialOfferCodeEditorModalProps) {
  const [code, setCode] = useState<string>(
    initialHtml && initialHtml.trim().length > 40
      ? initialHtml
      : DEFAULT_COMMERCIAL_OFFER_HTML_TEMPLATE
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const livePreview = useMemo(() => {
    return buildCommercialOfferHtml({
      lead: SAMPLE_LEAD,
      lineItems: SAMPLE_ITEMS,
      workspace,
      config: {
        paymentTerms: '30 Days Credit',
        termsOfDelivery: 'F.O.R: KOSAMBA',
        otherReferences: 'SHRI Chintan Jardosh',
        validityDate: new Date(Date.now() + 14 * 86400_000).toISOString().split('T')[0],
        gstType: 'intra_gujarat',
        voucherNo: '1611202606',
      },
      customHtmlTemplate: code,
    });
  }, [code, workspace]);

  if (!isOpen) return null;

  const handleInsertVariable = (variable: string) => {
    setCode((prev) => `${prev}\n${variable}`);
  };

  const handleReset = () => {
    if (!confirm('Reset the Commercial Offer HTML template back to the default Tally layout?')) return;
    setCode(DEFAULT_COMMERCIAL_OFFER_HTML_TEMPLATE);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    try {
      const res = await fetch('/api/email/templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace.id || 'ws-default',
          id: COMMERCIAL_OFFER_TEMPLATE_ID,
          name: COMMERCIAL_OFFER_TEMPLATE_NAME,
          category: 'sales',
          subject: 'Commercial Offer #{{voucher_no}} — Quotation from {{company_name}} ({{customer_company}})',
          body: code,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save Commercial Offer template');
      }
      setSaveSuccess('Saved Commercial Offer HTML template. All future quotations will use this layout.');
      await onSaved();
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save template');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white border border-[#E3DCCF] rounded-3xl shadow-2xl w-full max-w-7xl h-[92vh] flex flex-col overflow-hidden text-xs">
        {/* Header */}
        <div className="px-6 py-4 bg-[#FAF8F2] border-b border-[#E3DCCF] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-[#17191A]">
              Commercial Offer (Quotation) — HTML Code Editor &amp; Live Preview
            </h2>
            <p className="text-[11px] text-[#77766D]">
              Edit raw HTML code on the left; preview renders live with sample chemical order data on the right.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="px-3.5 py-2 rounded-full bg-white border border-[#E3DCCF] hover:bg-[#EFECE3] text-[#17191A] font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset to Default Tally Template
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSave}
              className="px-4 py-2 rounded-full bg-[#17191A] hover:bg-black text-white font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {isSaving ? 'Saving...' : 'Save HTML Template'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full hover:bg-[#EFECE3] text-[#77766D] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Variable Chips Bar */}
        <div className="px-6 py-2.5 bg-[#FAF8F2]/60 border-b border-[#E3DCCF] flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-bold text-[#77766D] uppercase mr-1">Insert Variable:</span>
          {COMMERCIAL_OFFER_VARIABLES.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => handleInsertVariable(v)}
              className="px-2 py-0.5 rounded-md bg-white border border-[#E3DCCF] hover:border-[#17191A] text-[10px] font-mono text-[#17191A] cursor-pointer"
            >
              {v}
            </button>
          ))}
        </div>

        {(saveSuccess || saveError) && (
          <div
            className={`mx-6 mt-3 p-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
              saveSuccess
                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-900'
                : 'bg-rose-500/15 border border-rose-500/30 text-[#C8431F]'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{saveSuccess || saveError}</span>
          </div>
        )}

        {/* Split Screen */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 min-h-0 overflow-hidden">
          {/* Left: HTML Code Editor */}
          <div className="flex flex-col min-h-0 border-r border-[#E3DCCF]">
            <div className="px-4 py-2 bg-[#F4F1EA] border-b border-[#E3DCCF] flex items-center gap-1.5 text-[11px] font-bold text-[#262720]">
              <Code2 className="w-3.5 h-3.5" />
              Raw HTML Template Code
            </div>
            <div className="flex-1 overflow-auto">
              <CodeMirror
                value={code}
                height="100%"
                extensions={[html()]}
                onChange={(val) => setCode(val)}
                className="text-xs h-full"
              />
            </div>
          </div>

          {/* Right: Live Preview */}
          <div className="flex flex-col min-h-0 bg-[#EAE5D9] p-3">
            <div className="px-2 pb-2 flex items-center gap-1.5 text-[11px] font-bold text-[#262720]">
              <Eye className="w-3.5 h-3.5" />
              Live Rendered Preview (Sample Chemical Order)
            </div>
            <iframe
              title="Commercial Offer Live Preview"
              srcDoc={livePreview.html}
              className="w-full flex-1 bg-white rounded-2xl border border-[#E3DCCF] shadow-sm"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
