'use client';

import React, { useState } from 'react';
import { X, Building2 } from 'lucide-react';
import { Workspace } from '@/types/crm';

interface CreateWorkspaceModalProps {
  onClose: () => void;
  onCreate: (data: {
    name: string;
    industry: string;
    currency: string;
    timezone: string;
    monthlyTarget: number;
  }) => Promise<void>;
}

export function CreateWorkspaceModal({ onClose, onCreate }: CreateWorkspaceModalProps) {
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('Logistics & Freight');
  const [currency, setCurrency] = useState('$');
  const [timezone, setTimezone] = useState('America/New_York');
  const [target, setTarget] = useState('100000');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      await onCreate({
        name,
        industry,
        currency,
        timezone,
        monthlyTarget: parseFloat(target) || 100000,
      });
      onClose();
    } catch (err: any) {
      alert(err.message || 'Failed to create workspace');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in-50 duration-200">
      <div className="bg-[#FAF8F2] rounded-3xl p-6 sm:p-7 border border-[#E3DCCF] shadow-2xl max-w-md w-full space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#E3DCCF]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-2xl bg-[#EBF2EE] flex items-center justify-center">
              <Building2 className="w-4 h-4 text-[#2F5C50]" />
            </div>
            <h2 className="text-base font-bold text-[#262720]">Create Business Workspace</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white border border-[#E3DCCF] hover:bg-[#EAE5D9] flex items-center justify-center text-[#77766D] hover:text-[#262720] button-press transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="font-semibold block mb-1 text-[#262720]">Business / Company Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Aldercrest Hospitality Group"
              className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-white text-[#262720] focus:outline-none focus:ring-1 focus:ring-[#262720]"
            />
          </div>

          <div>
            <label className="font-semibold block mb-1 text-[#262720]">Industry</label>
            <input
              type="text"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-white text-[#262720] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold block mb-1 text-[#262720]">Currency</label>
              <input
                type="text"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-white text-[#262720] focus:outline-none"
              />
            </div>
            <div>
              <label className="font-semibold block mb-1 text-[#262720]">Monthly Target ($)</label>
              <input
                type="number"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-white text-[#262720] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-[#E3DCCF]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full border border-[#E3DCCF] text-[#77766D] hover:text-[#262720] hover:bg-[#EAE5D9] button-press transition-all font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-full bg-[#262720] hover:bg-[#1E201E] text-white font-semibold shadow-xs button-press transition-all disabled:opacity-50"
            >
              {isSubmitting ? 'Creating...' : 'Create Business'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
