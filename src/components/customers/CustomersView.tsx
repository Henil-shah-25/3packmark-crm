'use client';

import React, { useState, useMemo } from 'react';
import {
  Users,
  Search,
  Plus,
  Mail,
  Phone,
  Building,
  DollarSign,
  Briefcase,
  Star,
  ArrowUpDown,
  ExternalLink,
} from 'lucide-react';
import { Customer, Lead, PipelineStage, Task, TeamMember, Workspace } from '@/types/crm';
import { formatCurrency, parseFinancialNumber } from '@/lib/financial';
import { HeaderReveal } from '@/components/ui/HeaderReveal';
import { SlidingTabs } from '@/components/ui/SlidingTabs';
import { MagneticButton } from '@/components/ui/MagneticButton';
import { CustomerInfoBento } from './CustomerInfoBento';

interface CustomersViewProps {
  workspace: Workspace;
  customers: Customer[];
  leads?: Lead[];
  stages?: PipelineStage[];
  tasks?: Task[];
  members?: TeamMember[];
  onAddCustomer: (customerData: Omit<Customer, 'id' | 'workspaceId' | 'createdAt'>) => Promise<void>;
  onSelectLead?: (lead: Lead) => void;
  onOpenNewDeal?: () => void;
  onCreateTask?: (taskData: Partial<Task>) => Promise<void>;
  onUpdateLeadRecord?: (leadId: string, updates: Partial<Lead>) => Promise<void>;
}

type SegmentFilter = 'all' | 'enterprise' | 'growth' | 'starred';

const MEMOJI_PROFILES = [
  { emoji: '🧑‍💼', bg: '#E0E7FF' },
  { emoji: '👩‍💼', bg: '#FCE7F3' },
  { emoji: '👨‍🔬', bg: '#D1FAE5' },
  { emoji: '👩‍🔬', bg: '#FEF3C7' },
  { emoji: '🧑‍🏭', bg: '#FFEDD5' },
  { emoji: '👨‍💼', bg: '#E0F2FE' },
];

function getMemojiForCustomer(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return MEMOJI_PROFILES[Math.abs(hash) % MEMOJI_PROFILES.length];
}

export function CustomersView({
  workspace,
  customers,
  leads = [],
  stages = [],
  tasks = [],
  members = [],
  onAddCustomer,
  onSelectLead,
  onOpenNewDeal,
  onCreateTask,
  onUpdateLeadRecord,
}: CustomersViewProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [segment, setSegment] = useState<SegmentFilter>('all');
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<'name' | 'revenue' | 'health'>('revenue');
  const [sortAsc, setSortAsc] = useState(false);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [initialRevenue, setInitialRevenue] = useState('0');

  const currency = workspace.currency || '$';

  // Toggle star
  const toggleStar = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setStarredIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Compute customer health deterministically from totalRevenue & dealsCount
  const getCustomerHealth = (c: Customer): number => {
    const rev = parseFinancialNumber(c.totalRevenue, 0);
    const deals = parseFinancialNumber(c.dealsCount, 1);
    if (rev > 100000 || deals >= 3) return 92;
    if (rev > 40000 || deals >= 2) return 78;
    if (rev > 15000) return 64;
    return 48;
  };

  const getHealthColor = (score: number) => {
    if (score >= 80) return 'var(--pine)';
    if (score >= 60) return 'var(--butter)';
    return 'var(--tomato)';
  };

  const { filtered, totalRevenue, openPipelineTotal, totalAccountsCount, avgHealth } = useMemo(() => {
    const q = search.toLowerCase().trim();
    const normPhone = (p?: string) => {
      const d = String(p || '').replace(/\D/g, '');
      return d.length >= 7 ? d.slice(-10) : '';
    };

    type MergedCustomer = Customer & {
      openPipelineValue?: number;
      wonOrdersCount?: number;
      currentStage?: string;
      leadSource?: string;
      city?: string;
      primaryLead?: Lead;
    };

    const mergedMap = new Map<string, MergedCustomer>();
    const findMatchKey = (company?: string, email?: string, phone?: string): string | null => {
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

    for (const c of customers) {
      if (!c?.id) continue;
      mergedMap.set(`cust:${c.id}`, {
        ...c,
        openPipelineValue: 0,
        wonOrdersCount: parseFinancialNumber(c.totalRevenue, 0) > 0 ? 1 : 0,
      });
    }

    for (const l of leads) {
      const existingKey = findMatchKey(l.company, l.email, l.phone);
      const isWon = l.status === 'Won' || l.stageId === 'stg-closed' || l.stageId === 'stg-won';
      const isLost = l.status === 'Lost' || l.stageId === 'stg-lost' || l.stageId === 'stg-loss';
      const val = parseFinancialNumber(l.value, 0);
      const stgName = stages.find((s) => s.id === l.stageId)?.name || l.status || 'New Lead';
      const src = l.leadSource || l.source || 'Cold Call';

      if (existingKey) {
        const entry = mergedMap.get(existingKey)!;
        entry.dealsCount = (entry.dealsCount || 0) + 1;
        if (!entry.leadSource) entry.leadSource = src;
        if (!entry.city && l.city) entry.city = l.city;
        if (!entry.primaryLead) entry.primaryLead = l;
        if (isWon) {
          entry.totalRevenue = parseFinancialNumber(entry.totalRevenue, 0) + val;
          entry.wonOrdersCount = (entry.wonOrdersCount || 0) + 1;
        } else if (!isLost) {
          entry.openPipelineValue = (entry.openPipelineValue || 0) + val;
          entry.currentStage = stgName;
          entry.primaryLead = l;
        }
      } else {
        mergedMap.set(`lead:${l.id}`, {
          id: `cust-${l.id}`,
          workspaceId: workspace.id,
          name: l.contactName || l.company || 'Primary Contact',
          company: l.company || l.contactName || 'Unnamed Account',
          email: l.email || '',
          phone: l.phone || '',
          status: isWon ? 'Active' : 'Lead',
          totalRevenue: isWon ? val : 0,
          openPipelineValue: !isWon && !isLost ? val : 0,
          wonOrdersCount: isWon ? 1 : 0,
          dealsCount: 1,
          currentStage: stgName,
          leadSource: src,
          city: l.city || '',
          primaryLead: l,
          lastContactedAt: l.updatedAt || l.createdAt,
          createdAt: l.createdAt,
        });
      }
    }

    const unique = Array.from(mergedMap.values());

    let list = unique.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q)
    );

    // Segment filter
    if (segment === 'enterprise') {
      list = list.filter((c) => parseFinancialNumber(c.totalRevenue, 0) >= 50000);
    } else if (segment === 'growth') {
      list = list.filter((c) => parseFinancialNumber(c.totalRevenue, 0) < 50000);
    } else if (segment === 'starred') {
      list = list.filter((c) => starredIds.has(c.id));
    }

    // Sort
    list.sort((a, b) => {
      if (sortField === 'name') {
        const diff = a.company.localeCompare(b.company);
        return sortAsc ? diff : -diff;
      }
      if (sortField === 'health') {
        const diff = getCustomerHealth(a) - getCustomerHealth(b);
        return sortAsc ? diff : -diff;
      }
      const diff =
        parseFinancialNumber(a.totalRevenue, 0) +
        (a.openPipelineValue || 0) -
        (parseFinancialNumber(b.totalRevenue, 0) + (b.openPipelineValue || 0));
      return sortAsc ? diff : -diff;
    });

    const total = unique.reduce((sum, c) => sum + parseFinancialNumber(c.totalRevenue, 0), 0);
    const openTotal = unique.reduce((sum, c) => sum + parseFinancialNumber(c.openPipelineValue, 0), 0);
    const healthSum = unique.reduce((sum, c) => sum + getCustomerHealth(c), 0);
    const avg = unique.length > 0 ? Math.round(healthSum / unique.length) : 0;

    return {
      filtered: list,
      totalRevenue: total,
      openPipelineTotal: openTotal,
      totalAccountsCount: unique.length,
      avgHealth: avg,
    };
  }, [customers, leads, stages, workspace.id, search, segment, starredIds, sortField, sortAsc]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !company || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onAddCustomer({
        name,
        company,
        email,
        phone,
        status: 'Active',
        totalRevenue: parseFinancialNumber(initialRevenue, 0),
        dealsCount: 1,
        lastContactedAt: new Date().toISOString(),
      });
      setName('');
      setCompany('');
      setEmail('');
      setPhone('');
      setShowAddModal(false);
    } catch (err: any) {
      alert(`Could not save customer: ${err.message || 'Please check your connection and try again.'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (selectedCustomer) {
    const normCompany = (selectedCustomer.company || '').trim().toLowerCase();
    const normEmail = (selectedCustomer.email || '').trim().toLowerCase();
    const normPhone = String(selectedCustomer.phone || '').replace(/\D/g, '').slice(-10);

    const customerLeads = leads.filter((l) => {
      const lc = (l.company || '').trim().toLowerCase();
      const le = (l.email || '').trim().toLowerCase();
      const lp = String(l.phone || '').replace(/\D/g, '').slice(-10);
      return (
        (normCompany && lc === normCompany) ||
        (normEmail && le === normEmail) ||
        (normPhone.length >= 7 && lp === normPhone)
      );
    });
    const customerLeadIds = new Set(customerLeads.map((l) => l.id));
    const customerTasks = tasks.filter((t) => t.leadId && customerLeadIds.has(t.leadId));

    return (
      <CustomerInfoBento
        customer={selectedCustomer}
        customerLeads={customerLeads}
        customerTasks={customerTasks}
        stages={stages}
        members={members}
        currency={currency}
        onBack={() => setSelectedCustomer(null)}
        onSelectLead={(l) => {
          if (onSelectLead) onSelectLead(l);
        }}
        onOpenNewDeal={() => {
          if (onOpenNewDeal) onOpenNewDeal();
        }}
        onCreateTask={async (taskData) => {
          if (onCreateTask) await onCreateTask(taskData);
        }}
        onUpdateLeadRecord={async (leadId, updates) => {
          if (onUpdateLeadRecord) await onUpdateLeadRecord(leadId, updates);
        }}
      />
    );
  }

  return (
    <div className="space-y-6 pb-16">
      {/* Header with reveal and count-up stats */}
      <HeaderReveal
        title="Customer Accounts"
        subtitle="3packmark Private Limited • B2B chemical accounts, open pipeline & completed orders"
        tiles={[
          {
            label: 'Total Accounts',
            numericValue: totalAccountsCount,
            badge: `${filtered.length} shown`,
          },
          {
            label: 'Total Won Revenue',
            numericValue: totalRevenue,
            prefix: currency,
          },
          {
            label: 'Open Pipeline',
            numericValue: openPipelineTotal,
            prefix: currency,
          },
        ]}
      />

      {/* Toolbar: Search, Segment Chips, Grid/Table Toggle, Add Account */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search & Chips */}
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search companies or contacts..."
              className="w-full bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-full pl-9 pr-4 py-2 text-xs text-[var(--text-ink)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)] shadow-2xs transition-all"
            />
          </div>

          {/* Segment Chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setSegment('all')}
              aria-pressed={segment === 'all'}
              className="chip button-press"
            >
              All Accounts
            </button>
            <button
              onClick={() => setSegment('enterprise')}
              aria-pressed={segment === 'enterprise'}
              className="chip button-press"
            >
              Enterprise
            </button>
            <button
              onClick={() => setSegment('growth')}
              aria-pressed={segment === 'growth'}
              className="chip button-press"
            >
              Growth
            </button>
            <button
              onClick={() => setSegment('starred')}
              aria-pressed={segment === 'starred'}
              className="chip button-press"
            >
              ★ Starred ({starredIds.size})
            </button>
          </div>
        </div>

        {/* View Toggle & Add Button */}
        <div className="flex items-center gap-3 shrink-0 self-start md:self-auto">
          <SlidingTabs
            options={[
              { id: 'grid', label: 'Grid' },
              { id: 'table', label: 'Table' },
            ]}
            value={viewMode}
            onChange={(val) => setViewMode(val as 'grid' | 'table')}
          />

          <MagneticButton
            onClick={() => setShowAddModal(true)}
            className="btn btn--primary"
          >
            <Plus className="w-4 h-4" />
            <span>Add Account</span>
          </MagneticButton>
        </div>
      </div>

      {/* Grid View — Apple-Inspired Clean Card Layout */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map((cust) => {
            const health = getCustomerHealth(cust);
            const isStarred = starredIds.has(cust.id);
            const healthColor = getHealthColor(health);
            const memoji = getMemojiForCustomer(cust.company || cust.name || cust.id);
            const wonCount = cust.wonOrdersCount || 0;
            const openVal = parseFinancialNumber(cust.openPipelineValue, 0);

            return (
              <div
                key={cust.id}
                onClick={() => setSelectedCustomer(cust)}
                className="bg-white rounded-3xl border border-[#E3DCCF]/70 p-5 flex flex-col justify-between gap-4 relative group cursor-pointer transition-all duration-200 hover:shadow-md hover:border-[#1F2421]/25"
              >
                {/* 1. Top Row: Apple Memoji Portrait Badge + Star Toggle */}
                <div className="flex items-start justify-between gap-3">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-2xl shrink-0 shadow-2xs select-none"
                    style={{ backgroundColor: memoji.bg }}
                  >
                    {memoji.emoji}
                  </div>

                  <button
                    type="button"
                    onClick={(e) => toggleStar(cust.id, e)}
                    aria-pressed={isStarred}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                      isStarred
                        ? 'text-amber-500 bg-amber-500/10'
                        : 'text-[#9A988E] hover:text-[#1F2421] hover:bg-[#F5F2EB]'
                    }`}
                    title={isStarred ? 'Unstar account' : 'Star account'}
                  >
                    <Star className={`w-4 h-4 ${isStarred ? 'fill-current' : ''}`} />
                  </button>
                </div>

                {/* 2. Identity Block */}
                <div className="space-y-0.5 min-w-0">
                  <h3 className="font-bold text-[15px] text-[#1F2421] tracking-tight truncate">
                    {cust.name}
                  </h3>
                  <p className="text-xs text-[#6E6C64] truncate">
                    {cust.leadSource || 'Cold Call'} • {cust.company}
                  </p>
                  {cust.city && (
                    <span className="inline-block text-[10px] font-medium text-[#7C7A72] bg-[#F5F2EB] px-2 py-0.5 rounded-full mt-1">
                      {cust.city}
                    </span>
                  )}
                </div>

                {/* 3. Borderless Metric Row */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <span className="text-[11px] text-[#7C7A72] block">Open Pipeline</span>
                    <span className="text-sm font-extrabold text-[#1F2421] font-tabular">
                      {formatCurrency(openVal, currency)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-[#7C7A72] block">Won Orders</span>
                    <span className="text-sm font-extrabold text-[#1F2421] font-tabular">
                      {formatCurrency(cust.totalRevenue, currency)} ({wonCount})
                    </span>
                  </div>
                </div>

                {/* 4. Sleek Progress & Action Footer */}
                <div className="space-y-3 pt-1">
                  <div className="h-1.5 w-full rounded-full bg-[#F5F2EB] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${health}%`,
                        backgroundColor: healthColor,
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="px-2.5 py-1 rounded-full bg-[#F5F2EB] text-[#1F2421] text-[10px] font-semibold truncate max-w-[140px]">
                      {cust.currentStage || cust.status || 'Active'}
                    </span>

                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => {
                          if (cust.primaryLead && onSelectLead) {
                            onSelectLead(cust.primaryLead);
                          } else {
                            setSelectedCustomer(cust);
                          }
                        }}
                        title="Send Email"
                        className="w-7 h-7 rounded-full bg-[#F5F2EB] hover:bg-[#EAE5D9] text-[#1F2421] flex items-center justify-center cursor-pointer"
                      >
                        <Mail className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (cust.primaryLead && onSelectLead) {
                            onSelectLead(cust.primaryLead);
                          } else {
                            setSelectedCustomer(cust);
                          }
                        }}
                        title="Log Call"
                        className="w-7 h-7 rounded-full bg-[#F5F2EB] hover:bg-[#EAE5D9] text-[#1F2421] flex items-center justify-center cursor-pointer"
                      >
                        <Phone className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="col-span-full py-16 flex flex-col items-center justify-center text-center text-xs text-[var(--text-muted)] card border-dashed gap-3">
              <p>{customers.length === 0 ? 'No customers yet.' : 'No customer accounts match the selected filters.'}</p>
              {customers.length === 0 && (
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="btn btn--solid text-xs py-2 px-4 rounded-full inline-flex items-center"
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  Add your first customer
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table min-w-[760px]">
              <thead>
                <tr>
                  <th
                    className="cursor-pointer select-none"
                    onClick={() => {
                      setSortField('name');
                      setSortAsc(!sortAsc);
                    }}
                    aria-sort={sortField === 'name' ? (sortAsc ? 'ascending' : 'descending') : 'none'}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Customer & Company</span>
                      <ArrowUpDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    </div>
                  </th>
                  <th>Contact Details</th>
                  <th
                    className="cursor-pointer select-none"
                    onClick={() => {
                      setSortField('revenue');
                      setSortAsc(!sortAsc);
                    }}
                    aria-sort={sortField === 'revenue' ? (sortAsc ? 'ascending' : 'descending') : 'none'}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Lifetime Value</span>
                      <ArrowUpDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    </div>
                  </th>
                  <th>Deals Closed</th>
                  <th
                    className="cursor-pointer select-none"
                    onClick={() => {
                      setSortField('health');
                      setSortAsc(!sortAsc);
                    }}
                    aria-sort={sortField === 'health' ? (sortAsc ? 'ascending' : 'descending') : 'none'}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Account Health</span>
                      <ArrowUpDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    </div>
                  </th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center">
                      <Users className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-2 opacity-40" />
                      <p className="text-sm font-semibold text-[var(--text-ink)]">
                        {customers.length === 0 ? 'No customers yet' : 'No customers match your filter'}
                      </p>
                      {customers.length === 0 && (
                        <button
                          type="button"
                          onClick={() => setShowAddModal(true)}
                          className="btn btn--solid text-xs py-2 px-4 rounded-full inline-flex items-center mt-3"
                        >
                          <Plus className="w-4 h-4 mr-1.5" />
                          Add your first customer
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  filtered.map((cust) => {
                    const health = getCustomerHealth(cust);
                    const isStarred = starredIds.has(cust.id);
                    const healthColor = getHealthColor(health);

                    return (
                      <tr
                        key={cust.id}
                        onClick={() => setSelectedCustomer(cust)}
                        className="cursor-pointer hover:bg-[var(--bg-main)]/50 transition-colors"
                      >
                      <td>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={(e) => toggleStar(cust.id, e)}
                            className={`p-1 rounded-md transition-colors ${
                              isStarred ? 'text-[var(--butter)] fill-current' : 'text-[var(--text-muted)] hover:text-[var(--text-ink)]'
                            }`}
                          >
                            <Star className={`w-3.5 h-3.5 ${isStarred ? 'fill-current' : ''}`} />
                          </button>
                          <div className="w-8 h-8 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[var(--text-ink)] flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                            {(cust.company || 'C').charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <span className="font-bold text-[var(--text-ink)] block truncate">{cust.company}</span>
                            <span className="text-[11px] text-[var(--text-muted)] block truncate">{cust.name}</span>
                          </div>
                        </div>
                      </td>
                      <td className="text-[var(--text-muted)]">
                        <span className="block truncate text-xs text-[var(--text-ink)]">{cust.email || '—'}</span>
                        <span className="block truncate text-[11px]">{cust.phone || '—'}</span>
                      </td>
                      <td>
                        <span className="font-extrabold text-[var(--text-ink)] font-tabular">
                          {formatCurrency(cust.totalRevenue, currency)}
                        </span>
                      </td>
                      <td>
                        <span className="badge badge--subtle font-tabular">
                          {parseFinancialNumber(cust.dealsCount, 1)} deal(s)
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="meter h-2 w-16 rounded-full bg-[var(--bg-main)] border border-[var(--border-subtle)] overflow-hidden">
                            <div
                              className="meter__fill h-full rounded-full transition-transform duration-700"
                              style={{
                                transform: `scaleX(${health / 100})`,
                                transformOrigin: 'left',
                                backgroundColor: healthColor,
                              }}
                            />
                          </div>
                          <span className="text-xs font-bold font-tabular" style={{ color: healthColor }}>
                            {health}%
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge--pine">
                          {cust.status || 'Active'}
                        </span>
                      </td>
                      <td className="text-right">
                        <MagneticButton
                          className="btn btn--subtle btn--icon"
                          title="Open account"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                        </MagneticButton>
                      </td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Customer Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="card p-6 shadow-2xl max-w-md w-full space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <h2 className="text-base font-bold text-[var(--text-ink)]">Add Customer Account</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="btn btn--subtle btn--icon w-7 h-7 text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-[var(--text-muted)] mb-1">Company Name</label>
                <input
                  type="text"
                  required
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="e.g. Global Logistics Corp"
                  className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[var(--text-muted)] mb-1">Primary Contact</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Jane Doe"
                  className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-[var(--text-muted)] mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="contact@company.com"
                    className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[var(--text-muted)] mb-1">Phone</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 555-0192"
                    className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[var(--text-muted)] mb-1">Initial Lifetime Value ({currency})</label>
                <input
                  type="number"
                  value={initialRevenue}
                  onChange={(e) => setInitialRevenue(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] font-tabular focus:outline-none focus:ring-1 focus:ring-[var(--ink)]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn btn--subtle"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn--primary"
                >
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
