'use client';

import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  User,
  Building2,
  Mail,
  Phone,
  MapPin,
  Radio,
  UserCheck,
  Clock,
  Pencil,
  PhoneCall,
  Plus,
  CalendarPlus,
  Check,
  X,
} from 'lucide-react';
import {
  Customer,
  DealProductItem,
  Lead,
  PipelineStage,
  Task,
  TaskQueueCategory,
  TeamMember,
} from '@/types/crm';
import { formatCurrency } from '@/lib/financial';
import { formatDateOnly } from '@/lib/dateTime';

interface CustomerInfoBentoProps {
  customer: Customer & { openPipelineValue?: number; wonRevenue?: number; currentStage?: string };
  customerLeads: Lead[];
  customerTasks: Task[];
  stages: PipelineStage[];
  members: TeamMember[];
  currency: string;
  onBack: () => void;
  onSelectLead: (lead: Lead) => void;
  onOpenNewDeal: () => void;
  onCreateTask: (taskData: Partial<Task>) => Promise<void>;
  onUpdateLeadRecord: (leadId: string, updates: Partial<Lead>) => Promise<void>;
}

const TASK_QUEUES: TaskQueueCategory[] = [
  'Quotation Follow Up',
  'Delivery Follow Up',
  'Payment Follow Up',
  'Call Follow Up',
];

export function CustomerInfoBento({
  customer,
  customerLeads,
  customerTasks,
  stages,
  members,
  currency,
  onBack,
  onSelectLead,
  onOpenNewDeal,
  onCreateTask,
  onUpdateLeadRecord,
}: CustomerInfoBentoProps) {
  const primaryLead = useMemo(() => {
    return [...customerLeads].sort(
      (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
    )[0] || null;
  }, [customerLeads]);

  const wonDeals = useMemo(
    () => customerLeads.filter((l) => l.status === 'Won' || l.stageId === 'stg-closed' || l.stageId === 'stg-won'),
    [customerLeads]
  );
  const openDeals = useMemo(
    () => customerLeads.filter((l) => l.status !== 'Won' && l.status !== 'Lost' && l.stageId !== 'stg-closed'),
    [customerLeads]
  );

  const wonTotal = useMemo(() => {
    const fromLeads = wonDeals.reduce((s, l) => s + (Number(l.value) || 0), 0);
    return Math.max(fromLeads, Number(customer.totalRevenue || 0));
  }, [wonDeals, customer.totalRevenue]);

  const openTotal = useMemo(
    () => openDeals.reduce((s, l) => s + (Number(l.value) || 0), 0),
    [openDeals]
  );

  const pendingTasks = useMemo(
    () => customerTasks.filter((t) => !t.completed && t.status !== 'done'),
    [customerTasks]
  );

  const sortedDeals = useMemo(
    () =>
      [...customerLeads].sort(
        (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
      ),
    [customerLeads]
  );

  // Inline editable Detailed Information state
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editContactName, setEditContactName] = useState(primaryLead?.contactName || customer.name || '');
  const [editCompany, setEditCompany] = useState(primaryLead?.company || customer.company || '');
  const [editEmail, setEditEmail] = useState(primaryLead?.email || customer.email || '');
  const [editPhone, setEditPhone] = useState(primaryLead?.phone || customer.phone || '');
  const [editCity, setEditCity] = useState(primaryLead?.city || '');
  const [editLeadSource, setEditLeadSource] = useState(primaryLead?.leadSource || primaryLead?.source || 'Cold Call');
  const [editOwnerId, setEditOwnerId] = useState(primaryLead?.ownerId || members[0]?.id || 'mem-1');

  // Quick Task Modal state
  const [showAddTask, setShowAddTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState(`Follow up with ${customer.company}`);
  const [taskDueDate, setTaskDueDate] = useState(new Date(Date.now() + 86400_000).toISOString().split('T')[0]);
  const [taskQueue, setTaskQueue] = useState<TaskQueueCategory>('Quotation Follow Up');

  const monogram = (customer.company || customer.name || 'CU')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const assignedRep = members.find((m) => m.id === (primaryLead?.ownerId || editOwnerId));
  const leadSourceText = primaryLead?.leadSource || primaryLead?.source || 'Cold Call';
  const isColdCall = leadSourceText.toLowerCase() === 'cold call';
  const dmBadge = isColdCall
    ? primaryLead?.isDecisionMakerReached
      ? 'Cold Call ✓'
      : 'Cold Call (Gatekeeper)'
    : leadSourceText;

  // Calendar grid for current month
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthLabel = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOffset = new Date(year, month, 1).getDay();

  const scheduledDaySet = useMemo(() => {
    const set = new Set<number>();
    for (const t of pendingTasks) {
      if (!t.dueDate) continue;
      const d = new Date(t.dueDate);
      if (d.getFullYear() === year && d.getMonth() === month) {
        set.add(d.getDate());
      }
    }
    return set;
  }, [pendingTasks, year, month]);

  const handleSaveDetails = async () => {
    if (!primaryLead) {
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    try {
      await onUpdateLeadRecord(primaryLead.id, {
        contactName: editContactName.trim(),
        company: editCompany.trim(),
        email: editEmail.trim(),
        phone: editPhone.trim(),
        city: editCity.trim(),
        leadSource: editLeadSource,
        source: editLeadSource,
        ownerId: editOwnerId,
      });
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuickAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    await onCreateTask({
      leadId: primaryLead?.id,
      dealTitle: primaryLead?.title || customer.company,
      title: taskTitle.trim(),
      dueDate: taskDueDate,
      dueAt: new Date(`${taskDueDate}T10:00:00`).toISOString(),
      priority: 'high',
      queueCategory: taskQueue,
      ownerId: primaryLead?.ownerId || members[0]?.id || 'mem-1',
      type: 'follow_up',
      status: 'open',
      source: 'manual',
    });
    setShowAddTask(false);
  };

  return (
    <div className="space-y-6 pb-16 bg-[#F5F2EB] min-h-screen -mx-4 sm:-mx-6 px-4 sm:px-6 pt-2">
      {/* Top KPI Header Strip */}
      <div className="bg-white rounded-3xl border border-[#E3DCCF] p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5 shadow-2xs">
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            onClick={onBack}
            className="w-10 h-10 rounded-full bg-[#F5F2EB] hover:bg-[#EAE5D9] text-[#1F2421] flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title="Back to Customers"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-[#1F2421] tracking-tight">Customer Information</h1>
            <p className="text-xs text-[#6E6C64]">
              {customer.company} • {customer.name}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-8">
          <div>
            <div className="text-[11px] font-semibold text-[#6E6C64]">Total Won Business</div>
            <div className="text-xl font-extrabold text-[#1F2421] font-tabular">
              {formatCurrency(wonTotal, currency)}
            </div>
            <div className="text-[11px] text-[#6E6C64]">Won from {wonDeals.length} completed orders</div>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-[#6E6C64]">Open Pipeline</div>
            <div className="text-xl font-extrabold text-[#1F2421] font-tabular">
              {formatCurrency(openTotal, currency)}
            </div>
            <div className="text-[11px] text-[#6E6C64]">Active across {openDeals.length} deals</div>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-[#6E6C64]">Pending Follow-Ups</div>
            <div className="text-xl font-extrabold text-[#1F2421] font-tabular">{pendingTasks.length}</div>
            <div className="text-[11px] text-[#6E6C64]">Tasks scheduled</div>
          </div>
        </div>
      </div>

      {/* Row 1: Deals & Chemical Purchase History (2/3) + Account Profile & Quick Actions (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left Bento Card (2/3) */}
        <div className="lg:col-span-2 bg-white rounded-3xl border border-[#E3DCCF] p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[#1F2421]">Deals &amp; Chemical Purchase History</h2>
              <p className="text-xs text-[#6E6C64]">
                Click any deal or completed order to open full details &amp; Tally quotation tools
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-[#F5F2EB] text-[#1F2421] text-[11px] font-semibold">
              {sortedDeals.length} total
            </span>
          </div>

          {sortedDeals.length === 0 ? (
            <div className="p-8 rounded-2xl bg-[#F8F7F4] border border-dashed border-[#E3DCCF] text-center text-xs text-[#6E6C64]">
              No deals or orders recorded yet for this customer.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {sortedDeals.slice(0, 4).map((deal, idx) => {
                const isLatest = idx === 0;
                const isWon = deal.status === 'Won' || deal.stageId === 'stg-closed' || deal.stageId === 'stg-won';
                const stageName = stages.find((s) => s.id === deal.stageId)?.name || deal.status;
                const items: DealProductItem[] = Array.isArray(deal.lineItems) && deal.lineItems.length > 0
                  ? deal.lineItems
                  : Array.isArray(deal.products)
                  ? deal.products
                  : [];

                return (
                  <button
                    key={deal.id}
                    type="button"
                    onClick={() => onSelectLead(deal)}
                    className={`text-left p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                      isLatest
                        ? 'bg-[#1F2421] text-white border-[#1F2421] shadow-md'
                        : 'bg-[#F8F7F4] text-[#1F2421] border-[#E3DCCF] hover:border-[#1F2421]/40'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className={isLatest ? 'text-white/70' : 'text-[#6E6C64]'}>
                          {formatDateOnly(deal.wonAt || deal.updatedAt || deal.createdAt)}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isWon
                              ? 'bg-emerald-600 text-white'
                              : isLatest
                              ? 'bg-white/15 text-white'
                              : 'bg-[#EAE5D9] text-[#1F2421]'
                          }`}
                        >
                          {isWon ? '✓ Won' : stageName}
                        </span>
                      </div>

                      <div className="font-bold text-sm leading-snug">{deal.title}</div>

                      {items.length > 0 ? (
                        <div className={`text-[11px] space-y-0.5 ${isLatest ? 'text-white/80' : 'text-[#55544E]'}`}>
                          {items.slice(0, 2).map((it, i) => (
                            <div key={i} className="truncate">
                              {it.name}: {it.moq} + {it.extraQuantity} = <strong>{it.totalQuantity} {it.unit}</strong>
                            </div>
                          ))}
                          {items.length > 2 && <div>+{items.length - 2} more chemical items</div>}
                        </div>
                      ) : (
                        <div className={`text-[11px] ${isLatest ? 'text-white/60' : 'text-[#6E6C64]'}`}>
                          No chemical items attached
                        </div>
                      )}
                    </div>

                    <div className="text-base font-extrabold font-tabular pt-2 border-t border-current/10">
                      {formatCurrency(deal.value, currency)}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Bento Card: Account Profile & Quick Actions (1/3) */}
        <div className="bg-white rounded-3xl border border-[#E3DCCF] p-5 sm:p-6 flex flex-col justify-between gap-5">
          <div className="space-y-4">
            <div className="flex items-center gap-3.5">
              <div className="w-14 h-14 rounded-2xl bg-[#1F2421] text-white flex items-center justify-center font-extrabold text-lg tracking-tight shrink-0">
                {monogram}
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-base text-[#1F2421] truncate">{customer.name}</h3>
                <p className="text-xs font-semibold text-[#55544E] truncate">{customer.company}</p>
                {primaryLead?.city && (
                  <p className="text-[11px] text-[#6E6C64] truncate">{primaryLead.city}</p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <span className="px-2.5 py-1 rounded-full bg-[#F5F2EB] border border-[#E3DCCF] text-[11px] font-semibold text-[#1F2421]">
                {dmBadge}
              </span>
              {primaryLead?.creditTerms && (
                <span className="px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-[11px] font-semibold text-amber-900">
                  {primaryLead.creditTerms}
                </span>
              )}
            </div>
          </div>

          <div className="space-y-2 pt-3 border-t border-[#EFECE3]">
            <div className="text-[11px] font-bold text-[#6E6C64] uppercase tracking-wider">Quick Actions</div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="px-3 py-1.5 rounded-full bg-[#F5F2EB] hover:bg-[#EAE5D9] text-[#1F2421] text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Pencil className="w-3 h-3" /> Edit Details
              </button>
              {primaryLead && (
                <button
                  type="button"
                  onClick={() => onSelectLead(primaryLead)}
                  className="px-3 py-1.5 rounded-full bg-[#F5F2EB] hover:bg-[#EAE5D9] text-[#1F2421] text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Mail className="w-3 h-3" /> Send Email
                </button>
              )}
              {primaryLead && (
                <button
                  type="button"
                  onClick={() => onSelectLead(primaryLead)}
                  className="px-3 py-1.5 rounded-full bg-[#F5F2EB] hover:bg-[#EAE5D9] text-[#1F2421] text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <PhoneCall className="w-3 h-3" /> Log Call
                </button>
              )}
              <button
                type="button"
                onClick={onOpenNewDeal}
                className="px-3 py-1.5 rounded-full bg-[#1F2421] hover:bg-black text-white text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3 h-3" /> New Deal
              </button>
              <button
                type="button"
                onClick={() => setShowAddTask((v) => !v)}
                className="px-3 py-1.5 rounded-full bg-[#F5F2EB] hover:bg-[#EAE5D9] text-[#1F2421] text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <CalendarPlus className="w-3 h-3" /> Add Follow-Up Task
              </button>
            </div>

            {showAddTask && (
              <form onSubmit={handleQuickAddTask} className="p-3 rounded-2xl bg-[#F8F7F4] border border-[#E3DCCF] space-y-2 mt-2 text-xs">
                <input
                  type="text"
                  required
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="Task title..."
                  className="w-full p-2 rounded-xl border border-[#E3DCCF] bg-white text-xs"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={taskDueDate}
                    onChange={(e) => setTaskDueDate(e.target.value)}
                    className="p-2 rounded-xl border border-[#E3DCCF] bg-white text-xs"
                  />
                  <select
                    value={taskQueue}
                    onChange={(e) => setTaskQueue(e.target.value as TaskQueueCategory)}
                    className="p-2 rounded-xl border border-[#E3DCCF] bg-white text-xs"
                  >
                    {TASK_QUEUES.map((q) => (
                      <option key={q} value={q}>
                        {q}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddTask(false)}
                    className="px-3 py-1 rounded-full bg-white border border-[#E3DCCF] text-[11px] font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1 rounded-full bg-[#1F2421] text-white text-[11px] font-semibold cursor-pointer"
                  >
                    Save Task
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Follow-Up Schedule (1/3) + 11-Stage Deal Breakdown (1/3) + Detailed Information (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Follow-Up Schedule */}
        <div className="bg-white rounded-3xl border border-[#E3DCCF] p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#1F2421]">Follow-Up Schedule</h2>
            <span className="text-[11px] font-semibold text-[#6E6C64]">{monthLabel}</span>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-[#6E6C64]">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <div key={i} className="py-1">
                {d}
              </div>
            ))}
            {Array.from({ length: firstDayOffset }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const day = idx + 1;
              const isToday = day === now.getDate();
              const hasTask = scheduledDaySet.has(day);
              return (
                <div
                  key={day}
                  className={`py-1.5 rounded-lg font-tabular ${
                    hasTask
                      ? 'bg-[#1F2421] text-white font-bold'
                      : isToday
                      ? 'bg-[#F5F2EB] text-[#1F2421] font-bold border border-[#1F2421]/30'
                      : 'text-[#1F2421]'
                  }`}
                >
                  {day}
                </div>
              );
            })}
          </div>

          <div className="space-y-2 pt-2 border-t border-[#EFECE3]">
            {pendingTasks.length === 0 ? (
              <p className="text-xs text-[#6E6C64]">No pending follow-up tasks scheduled.</p>
            ) : (
              pendingTasks.slice(0, 4).map((t) => (
                <div key={t.id} className="p-2.5 rounded-xl bg-[#F8F7F4] border border-[#E3DCCF] text-xs space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#1F2421] truncate">{t.title}</span>
                    <span className="text-[10px] font-mono text-[#6E6C64] shrink-0">{t.dueDate}</span>
                  </div>
                  <div className="text-[10px] font-semibold text-[#6E6C64]">
                    {t.queueCategory || 'Call Follow Up'}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 11-Stage Deal Breakdown */}
        <div className="bg-white rounded-3xl border border-[#E3DCCF] p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-[#1F2421]">11-Stage Deal Breakdown</h2>
            <div className="text-2xl font-extrabold text-[#1F2421] font-tabular mt-1">
              {formatCurrency(openTotal, currency)}
            </div>
            <p className="text-[11px] text-[#6E6C64]">Total active pipeline across stages</p>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {stages.map((st) => {
              const stageDeals = customerLeads.filter((l) => l.stageId === st.id);
              const stageSum = stageDeals.reduce((s, l) => s + (Number(l.value) || 0), 0);
              return (
                <div
                  key={st.id}
                  className={`px-3 py-2 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                    stageDeals.length > 0
                      ? 'bg-[#F8F7F4] border-[#1F2421]/30 font-semibold text-[#1F2421]'
                      : 'bg-white border-[#EFECE3] text-[#6E6C64]'
                  }`}
                >
                  <span className="truncate">{st.name}</span>
                  <span className="font-tabular shrink-0">
                    {stageDeals.length} • {formatCurrency(stageSum, currency)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detailed Information (Inline Editable) */}
        <div className="bg-white rounded-3xl border border-[#E3DCCF] p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#1F2421]">Detailed Information</h2>
            {!isEditing ? (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="text-xs font-semibold text-[#1F2421] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Pencil className="w-3 h-3" /> Edit
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="p-1.5 rounded-full bg-[#F5F2EB] text-[#6E6C64] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleSaveDetails}
                  className="px-3 py-1 rounded-full bg-[#1F2421] text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-3 h-3" /> {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex items-start gap-2.5">
              <User className="w-4 h-4 text-[#6E6C64] mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-semibold text-[#6E6C64]">Contact Person</div>
                {isEditing ? (
                  <input
                    type="text"
                    value={editContactName}
                    onChange={(e) => setEditContactName(e.target.value)}
                    className="w-full mt-0.5 p-1.5 rounded-lg border border-[#E3DCCF] text-xs"
                  />
                ) : (
                  <div className="font-semibold text-[#1F2421] truncate">{editContactName || '—'}</div>
                )}
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <Building2 className="w-4 h-4 text-[#6E6C64] mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-semibold text-[#6E6C64]">Company Name</div>
                {isEditing ? (
                  <input
                    type="text"
                    value={editCompany}
                    onChange={(e) => setEditCompany(e.target.value)}
                    className="w-full mt-0.5 p-1.5 rounded-lg border border-[#E3DCCF] text-xs"
                  />
                ) : (
                  <div className="font-semibold text-[#1F2421] truncate">{editCompany || '—'}</div>
                )}
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <Mail className="w-4 h-4 text-[#6E6C64] mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-semibold text-[#6E6C64]">Email Address</div>
                {isEditing ? (
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full mt-0.5 p-1.5 rounded-lg border border-[#E3DCCF] text-xs"
                  />
                ) : (
                  <div className="font-semibold text-[#1F2421] truncate">{editEmail || '—'}</div>
                )}
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <Phone className="w-4 h-4 text-[#6E6C64] mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-semibold text-[#6E6C64]">Phone Number</div>
                {isEditing ? (
                  <input
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full mt-0.5 p-1.5 rounded-lg border border-[#E3DCCF] text-xs"
                  />
                ) : (
                  <div className="font-semibold text-[#1F2421] font-tabular truncate">{editPhone || '—'}</div>
                )}
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <MapPin className="w-4 h-4 text-[#6E6C64] mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-semibold text-[#6E6C64]">City / State</div>
                {isEditing ? (
                  <input
                    type="text"
                    value={editCity}
                    onChange={(e) => setEditCity(e.target.value)}
                    className="w-full mt-0.5 p-1.5 rounded-lg border border-[#E3DCCF] text-xs"
                  />
                ) : (
                  <div className="font-semibold text-[#1F2421] truncate">{editCity || '—'}</div>
                )}
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <Radio className="w-4 h-4 text-[#6E6C64] mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-semibold text-[#6E6C64]">Lead Source &amp; Decision-Maker</div>
                {isEditing ? (
                  <select
                    value={editLeadSource}
                    onChange={(e) => setEditLeadSource(e.target.value)}
                    className="w-full mt-0.5 p-1.5 rounded-lg border border-[#E3DCCF] text-xs bg-white"
                  >
                    <option value="Phone Call">Phone Call</option>
                    <option value="Visit">Visit</option>
                    <option value="Cold Call">Cold Call</option>
                    <option value="Seminar">Seminar</option>
                  </select>
                ) : (
                  <div className="font-semibold text-[#1F2421]">{dmBadge}</div>
                )}
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <UserCheck className="w-4 h-4 text-[#6E6C64] mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-semibold text-[#6E6C64]">Assigned Sales Rep</div>
                {isEditing ? (
                  <select
                    value={editOwnerId}
                    onChange={(e) => setEditOwnerId(e.target.value)}
                    className="w-full mt-0.5 p-1.5 rounded-lg border border-[#E3DCCF] text-xs bg-white"
                  >
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="font-semibold text-[#1F2421]">{assignedRep?.name || 'Admin'}</div>
                )}
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-[#6E6C64] mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-semibold text-[#6E6C64]">Last Contacted</div>
                <div className="font-semibold text-[#1F2421]">
                  {customer.lastContactedAt ? formatDateOnly(customer.lastContactedAt) : '—'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
