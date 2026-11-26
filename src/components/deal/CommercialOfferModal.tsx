'use client';

import React, { useMemo, useState } from 'react';
import { X, FileText, Printer, Send, ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import { DealProductItem, Lead, Workspace } from '@/types/crm';
import {
  buildCommercialOfferHtml,
  CommercialOfferConfig,
  GstTypeOption,
  PaymentTermOption,
} from '@/lib/quotation/commercialOfferTemplate';
import { downloadCommercialOfferPdf } from '@/lib/quotation/commercialOfferPdf';

interface CommercialOfferModalProps {
  isOpen: boolean;
  lead: Lead;
  lineItems: DealProductItem[];
  workspace?: Partial<Workspace> | null;
  onClose: () => void;
  onSentSuccess: (result: {
    voucherNo: string;
    grandTotal: number;
    creditTerms: PaymentTermOption;
    message: string;
    simulated?: boolean;
  }) => Promise<void> | void;
}

const PAYMENT_OPTIONS: PaymentTermOption[] = [
  'Advance',
  'Cash on Delivery',
  '30 Days Credit',
  '45 Days Credit',
  '60 Days Credit',
];

export function CommercialOfferModal({
  isOpen,
  lead,
  lineItems,
  workspace,
  onClose,
  onSentSuccess,
}: CommercialOfferModalProps) {
  const defaultPayment = PAYMENT_OPTIONS.includes(lead.creditTerms as PaymentTermOption)
    ? (lead.creditTerms as PaymentTermOption)
    : '30 Days Credit';

  const defaultCity = (lead.city || 'KOSAMBA').trim().toUpperCase();
  const defaultValidity = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const defaultGst: GstTypeOption =
    !lead.state || lead.state.toLowerCase().includes('gujarat') ? 'intra_gujarat' : 'inter_state';

  const [step, setStep] = useState<'config' | 'preview'>('config');
  const [paymentTerms, setPaymentTerms] = useState<PaymentTermOption>(defaultPayment);
  const [termsOfDelivery, setTermsOfDelivery] = useState(`F.O.R: ${defaultCity}`);
  const [otherReferences, setOtherReferences] = useState(
    lead.contactName ? `SHRI ${lead.contactName}` : ''
  );
  const [validityDate, setValidityDate] = useState(defaultValidity);
  const [gstType, setGstType] = useState<GstTypeOption>(defaultGst);
  const [toEmail, setToEmail] = useState(lead.email || '');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentResult, setSentResult] = useState<{
    voucherNo: string;
    message: string;
    simulated?: boolean;
  } | null>(null);

  const config: CommercialOfferConfig = useMemo(
    () => ({
      paymentTerms,
      termsOfDelivery: termsOfDelivery.trim() || 'F.O.R: EX-WORKS',
      otherReferences: otherReferences.trim(),
      validityDate,
      gstType,
    }),
    [paymentTerms, termsOfDelivery, otherReferences, validityDate, gstType]
  );

  const preview = useMemo(
    () =>
      buildCommercialOfferHtml({
        lead,
        lineItems,
        workspace,
        config,
      }),
    [lead, lineItems, workspace, config]
  );

  if (!isOpen) return null;

  const handlePrintPdf = () => {
    downloadCommercialOfferPdf({
      lead,
      lineItems,
      workspace,
      config: { ...config, voucherNo: preview.voucherNo },
    });
  };

  const handleSendEmailNow = async () => {
    if (!toEmail.trim()) {
      setSendError('Please enter a customer email address.');
      return;
    }
    setIsSending(true);
    setSendError(null);
    try {
      const res = await fetch('/api/email/send-quotation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: lead.workspaceId || 'ws-default',
          leadId: lead.id,
          toEmail: toEmail.trim(),
          config,
          lineItems,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to send Commercial Offer');
      }
      setSentResult({
        voucherNo: data.voucherNo,
        message: data.message,
        simulated: data.simulated,
      });
      await onSentSuccess({
        voucherNo: data.voucherNo,
        grandTotal: data.grandTotal,
        creditTerms: paymentTerms,
        message: data.message,
        simulated: data.simulated,
      });
    } catch (err: any) {
      setSendError(err?.message || 'Failed to send Commercial Offer');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-white border border-[#E3DCCF] rounded-3xl shadow-2xl w-full flex flex-col overflow-hidden text-xs ${
          step === 'preview' ? 'max-w-5xl h-[92vh]' : 'max-w-xl max-h-[90vh]'
        }`}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 bg-[#FAF8F2] border-b border-[#E3DCCF] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {step === 'preview' && !sentResult && (
              <button
                type="button"
                onClick={() => setStep('config')}
                className="p-1.5 rounded-full hover:bg-[#EFECE3] text-[#262720] cursor-pointer"
                title="Back to options"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="w-8 h-8 rounded-xl bg-[#17191A] text-white flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#17191A]">
                {step === 'config'
                  ? 'Commercial Offer — Pre-Send Configuration'
                  : `Commercial Offer Preview (#${preview.voucherNo})`}
              </h3>
              <p className="text-[11px] text-[#77766D]">
                {lead.company || lead.title} • {lineItems.length} item(s)
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

        {/* Step 1: Configuration */}
        {step === 'config' && (
          <div className="p-6 overflow-y-auto space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-[#262720] mb-1.5">
                1. Mode / Terms of Payment (Mandatory) *
              </label>
              <div className="flex flex-wrap gap-2">
                {PAYMENT_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setPaymentTerms(opt)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border cursor-pointer transition-all ${
                      paymentTerms === opt
                        ? 'bg-[#17191A] text-white border-[#17191A]'
                        : 'bg-[#FAF8F2] text-[#262720] border-[#E3DCCF] hover:bg-[#EFECE3]'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-[#262720] mb-1">
                  2. Terms of Delivery (F.O.R.)
                </label>
                <input
                  type="text"
                  value={termsOfDelivery}
                  onChange={(e) => setTermsOfDelivery(e.target.value)}
                  placeholder="F.O.R: KOSAMBA"
                  className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-[#FAF8F2] text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#262720] mb-1">
                  3. Other References / Kind Attn
                </label>
                <input
                  type="text"
                  value={otherReferences}
                  onChange={(e) => setOtherReferences(e.target.value)}
                  placeholder="SHRI Chintan Jardosh"
                  className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-[#FAF8F2] text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#262720] mb-1">
                  4. Offer Validity Date
                </label>
                <input
                  type="date"
                  value={validityDate}
                  onChange={(e) => setValidityDate(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-[#FAF8F2] text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#262720] mb-1">
                  5. GST Type
                </label>
                <select
                  value={gstType}
                  onChange={(e) => setGstType(e.target.value as GstTypeOption)}
                  className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-[#FAF8F2] text-xs"
                >
                  <option value="intra_gujarat">Intra-State Gujarat (CGST 9% + SGST 9%)</option>
                  <option value="inter_state">Inter-State (IGST 18%)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#262720] mb-1">
                Recipient Email Address
              </label>
              <input
                type="email"
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
                placeholder="customer@company.com"
                className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-[#FAF8F2] text-xs"
              />
            </div>

            <div className="pt-3 border-t border-[#E3DCCF] flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-full bg-[#FAF8F2] border border-[#E3DCCF] text-[#262720] font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setStep('preview')}
                className="px-5 py-2 rounded-full bg-[#17191A] text-white font-semibold cursor-pointer"
              >
                Generate &amp; Preview Commercial Offer
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Full-Screen Preview */}
        {step === 'preview' && (
          <>
            <div className="flex-1 bg-[#EAE5D9] p-4 overflow-hidden flex flex-col gap-3">
              {sendError && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-[#C8431F] font-semibold">
                  {sendError}
                </div>
              )}
              {sentResult && (
                <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-900 font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{sentResult.message}</span>
                </div>
              )}
              <iframe
                title="Commercial Offer Preview"
                srcDoc={preview.html}
                className="w-full flex-1 bg-white rounded-2xl border border-[#E3DCCF] shadow-sm"
              />
            </div>

            <div className="px-6 py-4 bg-[#FAF8F2] border-t border-[#E3DCCF] flex flex-wrap items-center justify-between gap-3">
              <div className="text-[11px] text-[#77766D]">
                Grand Total (incl. 18% GST):{' '}
                <strong className="text-[#17191A]">
                  ₹{preview.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </strong>{' '}
                • Payment: <strong className="text-[#17191A]">{paymentTerms}</strong>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintPdf}
                  className="px-4 py-2 rounded-full bg-white border border-[#E3DCCF] hover:bg-[#EFECE3] text-[#17191A] font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Download / Print PDF
                </button>
                <button
                  type="button"
                  disabled={isSending || Boolean(sentResult)}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSendEmailNow();
                  }}
                  className="px-5 py-2 rounded-full bg-[#376E60] hover:opacity-90 text-white font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {isSending
                      ? 'Sending Commercial Offer...'
                      : sentResult
                      ? 'Sent & Logged'
                      : 'Send via Email Now'}
                  </span>
                </button>
                {sentResult && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onClose();
                    }}
                    className="px-4 py-2 rounded-full bg-[#17191A] text-white font-semibold cursor-pointer"
                  >
                    Close Preview
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
