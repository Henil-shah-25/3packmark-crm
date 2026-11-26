'use client';

import React, { useState, useDeferredValue } from 'react';
import { Search, X, Building, User, DollarSign, ArrowRight } from 'lucide-react';
import { Lead, Customer } from '@/types/crm';
import { formatCurrency } from '@/lib/financial';
import { MagneticButton } from '@/components/ui/MagneticButton';

interface SearchModalProps {
  leads: Lead[];
  customers: Customer[];
  onClose: () => void;
  onSelectLead: (lead: Lead) => void;
}

export function SearchModal({ leads, customers, onClose, onSelectLead }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  const filteredLeads = deferredQuery.trim()
    ? leads.filter(
        (l) =>
          l.title.toLowerCase().includes(deferredQuery.toLowerCase()) ||
          l.company.toLowerCase().includes(deferredQuery.toLowerCase()) ||
          l.contactName.toLowerCase().includes(deferredQuery.toLowerCase())
      )
    : leads.slice(0, 5);

  return (
    <div className="scrim fixed inset-0 z-50 flex items-start justify-center pt-20 p-4" onClick={onClose}>
      <div
        className="card p-5 shadow-2xl max-w-lg w-full space-y-4 animate-in fade-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search deals, companies, contacts..."
            className="w-full pl-9 pr-10 py-2.5 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-ink)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)] shadow-2xs"
          />
          <button
            onClick={onClose}
            className="btn btn--subtle btn--icon absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 text-xs"
          >
            <X className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          </button>
        </div>

        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          <span className="text-[10px] font-bold text-[var(--text-muted)] px-2 block">
            {query.trim() ? 'Matching Opportunities' : 'Recent Opportunities'}
          </span>

          {filteredLeads.map((lead) => (
            <div
              key={lead.id}
              onClick={() => {
                onSelectLead(lead);
                onClose();
              }}
              className="p-3.5 rounded-2xl bg-[var(--bg-main)] hover:bg-[var(--border-subtle)]/40 border border-[var(--border-subtle)] flex items-center justify-between cursor-pointer transition-all text-xs"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-[var(--butter)] text-[#292511] flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                  {lead.company[0]}
                </div>
                <div className="min-w-0">
                  <h4 className="font-bold text-[var(--text-ink)] truncate">{lead.title}</h4>
                  <p className="text-[11px] text-[var(--text-muted)] truncate">{lead.company} • {lead.contactName}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="font-extrabold text-[var(--text-ink)] font-tabular">{formatCurrency(lead.value)}</span>
                <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              </div>
            </div>
          ))}

          {filteredLeads.length === 0 && (
            <div className="py-8 text-center text-xs text-[var(--text-muted)]">
              No records found matching "{query}"
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
