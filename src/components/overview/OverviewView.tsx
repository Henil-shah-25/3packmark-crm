'use client';

import React, { useMemo, useState } from 'react';
import {
  Layers,
  CalendarCheck,
  BellRing,
  Check,
  ArrowUpRight,
  Plus,
  Phone,
  FileText,
  Truck,
  Wallet,
} from 'lucide-react';
import {
  Customer,
  Lead,
  PipelineStage,
  Task,
  TaskQueueCategory,
  TeamMember,
  Workspace,
} from '@/types/crm';
import { deduplicateLeads, formatCurrency, parseFinancialNumber } from '@/lib/financial';
import { resolveStageHex } from '@/lib/pipeline/stage-colors';
import {
  buildStageNameMap,
  formatTaskDisplayTitle,
  isClosedOrPastOrderLead,
  isDealClosedOrWon,
  isTaskEligibleForLeadStage,
  resolveActiveDealForTask,
  resolveTaskQueue,
} from '@/lib/tasks/queues';

interface OverviewViewProps {
  workspace: Workspace;
  leads: Lead[];
  customers?: Customer[];
  stages: PipelineStage[];
  tasks: Task[];
  members?: TeamMember[];
  onSelectLead: (lead: Lead) => void;
  onSelectDealFromTask?: (task: any) => boolean;
  onOpenNewDeal: () => void;
  onNavigateToPipeline: (stageId?: string) => void;
  onOpenSchedule?: () => void;
  onToggleTask?: (taskId: string, completed: boolean) => Promise<void>;
  onRescheduleTask?: (taskId: string, newDueDate: string) => Promise<void>;
}

const QUEUE_PILLS: Array<{ id: 'ALL' | TaskQueueCategory; label: string }> = [
  { id: 'ALL', label: 'All' },
  { id: 'Quotation Follow Up', label: 'Quotation' },
  { id: 'Delivery Follow Up', label: 'Delivery' },
  { id: 'Payment Follow Up', label: 'Payment' },
  { id: 'Call Follow Up', label: 'Call' },
];

function getQueueIcon(queue: TaskQueueCategory) {
  switch (queue) {
    case 'Quotation Follow Up':
      return FileText;
    case 'Delivery Follow Up':
      return Truck;
    case 'Payment Follow Up':
      return Wallet;
    case 'Call Follow Up':
    default:
      return Phone;
  }
}

function getRepInitials(member?: TeamMember): string {
  const name = member?.name || 'Admin';
  const upper = name.toUpperCase();
  if (upper.includes('SALES 1')) return 'S1';
  if (upper.includes('SALES 2')) return 'S2';
  if (upper.includes('SALES 3')) return 'S3';
  if (upper.includes('ADMIN')) return 'AD';
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function getDateBlockParts(dueDateStr: string | undefined, todayStr: string): {
  top: string;
  bottom: string;
  isLate: boolean;
} {
  if (!dueDateStr) {
    return { top: 'Soon', bottom: '—', isLate: false };
  }
  const due = dueDateStr.split('T')[0];
  const todayMs = new Date(`${todayStr}T00:00:00`).getTime();
  const dueMs = new Date(`${due}T00:00:00`).getTime();
  const diffDays = Math.round((dueMs - todayMs) / 86400_000);

  if (diffDays < 0) {
    return { top: `${Math.abs(diffDays)}d`, bottom: 'late', isLate: true };
  }
  const d = new Date(`${due}T00:00:00`);
  const mon = d.toLocaleDateString('en-US', { month: 'short' });
  const day = String(d.getDate());
  return { top: mon, bottom: day, isLate: false };
}

export function OverviewView({
  workspace,
  leads,
  customers = [],
  stages,
  tasks,
  members = [],
  onSelectLead,
  onSelectDealFromTask,
  onOpenNewDeal,
  onNavigateToPipeline,
  onOpenSchedule,
  onToggleTask,
  onRescheduleTask,
}: OverviewViewProps) {
  const [selectedRepId, setSelectedRepId] = useState<string>('ALL');
  const [activeQueue, setActiveQueue] = useState<'ALL' | TaskQueueCategory>('ALL');
  const [followUpTab, setFollowUpTab] = useState<'overdue' | 'upcoming'>('overdue');
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [reschedulingTaskId, setReschedulingTaskId] = useState<string | null>(null);

  const currency = workspace.currency || 'INR';
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const uniqueLeads = useMemo(() => {
    const deduped = deduplicateLeads(leads);
    if (selectedRepId === 'ALL') return deduped;
    return deduped.filter((l) => l.ownerId === selectedRepId);
  }, [leads, selectedRepId]);

  const allUniqueLeadsList = useMemo(() => deduplicateLeads(leads), [leads]);

  const allUniqueLeadsMap = useMemo(() => {
    const map = new Map<string, Lead>();
    for (const l of allUniqueLeadsList) {
      if (l?.id) map.set(l.id, l);
    }
    return map;
  }, [allUniqueLeadsList]);

  const stageNameById = useMemo(() => buildStageNameMap(stages), [stages]);

  const openActiveLeadsList = useMemo(
    () => allUniqueLeadsList.filter((l) => !isDealClosedOrWon(l, stageNameById)),
    [allUniqueLeadsList, stageNameById]
  );

  const resolveTaskLead = (task: Task): Lead | undefined => {
    const res = resolveActiveDealForTask(task, allUniqueLeadsList, stages, {
      customers,
      allowClosedFallback: false,
    });
    return res.deal;
  };

  const memberById = useMemo(() => {
    const map = new Map<string, TeamMember>();
    for (const m of members) {
      if (m?.id) map.set(m.id, m);
    }
    return map;
  }, [members]);

  const openPipelineValue = useMemo(() => {
    return uniqueLeads
      .filter((l) => l.status !== 'Won' && l.status !== 'Lost' && l.stageId !== 'stg-closed')
      .reduce((sum, l) => sum + parseFinancialNumber(l.value, 0), 0);
  }, [uniqueLeads]);

  // 11-Stage Leads Overview with saved stage.color & ₹ value
  const stageBreakdown = useMemo(() => {
    const sorted = [...stages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const counts = new Map<string, number>();
    const values = new Map<string, number>();

    for (const l of uniqueLeads) {
      const sid = l.stageId || '';
      counts.set(sid, (counts.get(sid) || 0) + 1);
      values.set(sid, (values.get(sid) || 0) + parseFinancialNumber(l.value, 0));
    }

    return sorted.map((stage) => ({
      stage,
      hex: resolveStageHex(stage),
      count: counts.get(stage.id) || 0,
      value: values.get(stage.id) || 0,
    }));
  }, [stages, uniqueLeads]);

  // Rep-filtered tasks with strict stageNameById closed/won exclusion & 4-queue stage-eligibility enforcement
  const repTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (/^past order:/i.test(t.title || '') || /^past order:/i.test(t.dealTitle || '')) {
        return false;
      }
      // Hard filter: if task's direct dealId/leadId points to a Closed/Won/Lost deal, exclude it immediately
      const directId = (t as any).dealId || t.leadId;
      const directDeal = directId ? allUniqueLeadsMap.get(directId) : undefined;
      if (directDeal && isDealClosedOrWon(directDeal, stageNameById)) {
        return false;
      }

      const res = resolveActiveDealForTask(t, allUniqueLeadsList, stages, {
        customers,
        allowClosedFallback: false,
      });
      const linked = res.deal;
      if (linked && isDealClosedOrWon(linked, stageNameById)) {
        return false;
      }
      if (/review sales priority recommendations/i.test(t.title || '') && !linked) {
        return false;
      }
      if (linked && !isTaskEligibleForLeadStage(t, linked, stageNameById)) {
        return false;
      }
      if (selectedRepId !== 'ALL') {
        const effectiveOwner = t.ownerId || linked?.ownerId;
        if (effectiveOwner !== selectedRepId) return false;
      }
      return true;
    });
  }, [tasks, selectedRepId, allUniqueLeadsList, allUniqueLeadsMap, stages, stageNameById, customers]);

  // Today's Tasks (pending + completed today for progress bar)
  const todaysAllTasks = useMemo(() => {
    return repTasks.filter((t) => (t.dueDate ? t.dueDate.split('T')[0] : '') === todayStr);
  }, [repTasks, todayStr]);

  const completedTodayCount = useMemo(() => {
    return todaysAllTasks.filter((t) => t.completed || t.status === 'done').length;
  }, [todaysAllTasks]);

  const todaysPendingTasks = useMemo(() => {
    return todaysAllTasks.filter((t) => !t.completed && t.status !== 'done');
  }, [todaysAllTasks]);

  const todaysFiltered = useMemo(() => {
    if (activeQueue === 'ALL') return todaysPendingTasks;
    return todaysPendingTasks.filter((t) => {
      const linked = resolveTaskLead(t);
      return resolveTaskQueue(t, linked, stageNameById) === activeQueue;
    });
  }, [todaysPendingTasks, activeQueue, stageNameById, allUniqueLeadsList, customers]);

  // Follow-Up Tasks (Overdue vs Upcoming)
  const followUpPendingAll = useMemo(() => {
    return repTasks.filter((t) => {
      if (t.completed || t.status === 'done') return false;
      const due = t.dueDate ? t.dueDate.split('T')[0] : '';
      const isOverdue = due !== '' && due < todayStr;
      const isFutureOrUndatedFollowUp =
        due !== todayStr &&
        (Boolean(t.queueCategory) ||
          t.type === 'call_back' ||
          t.type === 'new_lead_call' ||
          t.type === 'follow_up' ||
          /follow|call|credit|quotation|delivery|payment/i.test(t.title || ''));
      return isOverdue || isFutureOrUndatedFollowUp;
    });
  }, [repTasks, todayStr]);

  const overdueFollowUps = useMemo(() => {
    return followUpPendingAll
      .filter((t) => {
        const due = t.dueDate ? t.dueDate.split('T')[0] : '';
        return due !== '' && due < todayStr;
      })
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
  }, [followUpPendingAll, todayStr]);

  const upcomingFollowUps = useMemo(() => {
    return followUpPendingAll
      .filter((t) => {
        const due = t.dueDate ? t.dueDate.split('T')[0] : '';
        return due === '' || due >= todayStr;
      })
      .sort((a, b) => (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31'));
  }, [followUpPendingAll, todayStr]);

  const displayedFollowUps =
    followUpTab === 'overdue' ? overdueFollowUps : upcomingFollowUps;

  const [snoozeToast, setSnoozeToast] = useState<string | null>(null);

  const handleTaskRowClick = (task: Task, resolvedLead?: Lead) => {
    if (onSelectDealFromTask) {
      const found = onSelectDealFromTask(task);
      if (!found) {
        setSnoozeToast('Linked lead not found in Pipeline');
        setTimeout(() => setSnoozeToast(null), 3500);
      }
      return;
    }
    if (resolvedLead) {
      onSelectLead(resolvedLead);
      return;
    }
    setSnoozeToast('Linked lead not found in Pipeline');
    setTimeout(() => setSnoozeToast(null), 3500);
  };

  const handleCompleteTask = async (taskId: string) => {
    if (!onToggleTask) return;
    setCompletingTaskId(taskId);
    try {
      await onToggleTask(taskId, true);
    } finally {
      setCompletingTaskId(null);
    }
  };

  const handleQuickReschedule = async (taskId: string, daysOffset: number) => {
    if (!onRescheduleTask) return;
    setReschedulingTaskId(taskId);
    try {
      const target = new Date(Date.now() + daysOffset * 86400_000).toISOString().split('T')[0];
      await onRescheduleTask(taskId, target);
      setSnoozeToast('Rescheduled to tomorrow');
      setTimeout(() => setSnoozeToast(null), 3500);
    } finally {
      setReschedulingTaskId(null);
    }
  };

  const todayProgressPct =
    todaysAllTasks.length > 0 ? Math.round((completedTodayCount / todaysAllTasks.length) * 100) : 0;

  return (
    <div className="space-y-6 pb-12">
      {/* Soft Editorial Header & Sales Rep Quick-Filter Bar */}
      <div className="bg-[#FAF8F5] rounded-3xl border border-[#E6E0D6] p-6 sm:p-7 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#17191A]">
              3W PACKMARK Overview
            </h1>
            <p className="text-xs text-[#6B6860] mt-1">
              Daily sales pipeline, task queues &amp; follow-up command center
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex flex-wrap items-center gap-1 bg-[#F2EFE8] p-1 rounded-full border border-[#E6E0D6]">
              <button
                type="button"
                onClick={() => setSelectedRepId('ALL')}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                  selectedRepId === 'ALL'
                    ? 'bg-[#17191A] text-white'
                    : 'text-[#6B6860] hover:text-[#17191A]'
                }`}
              >
                All Team
              </button>
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedRepId(selectedRepId === m.id ? 'ALL' : m.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                    selectedRepId === m.id
                      ? 'bg-[#17191A] text-white'
                      : 'text-[#6B6860] hover:text-[#17191A]'
                  }`}
                >
                  {m.name}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onOpenNewDeal}
              className="px-4 py-2 rounded-full bg-[#17191A] hover:opacity-90 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              New Deal
            </button>
          </div>
        </div>

        {/* 3 Soft Mineral KPI Tiles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-[#F7F4EE] flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-medium text-[#6B6860]">Total Leads</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-semibold text-[#17191A] font-tabular">
                  {uniqueLeads.length}
                </span>
                <span className="text-xs font-medium text-[#2F5C50] font-tabular">
                  {formatCurrency(openPipelineValue, currency)} open
                </span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-full bg-[#EFECE4] text-[#17191A] flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4" />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#F7F4EE] flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-medium text-[#6B6860]">Today&apos;s Tasks</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-semibold text-[#17191A] font-tabular">
                  {todaysPendingTasks.length}
                </span>
                <span className="text-xs text-[#6B6860]">Due today</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-full bg-[#EFECE4] text-[#2F5C50] flex items-center justify-center shrink-0">
              <CalendarCheck className="w-4 h-4" />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#F7F4EE] flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-medium text-[#6B6860]">Follow-Up Tasks</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-semibold text-[#17191A] font-tabular">
                  {followUpPendingAll.length}
                </span>
                <span className="text-xs font-medium text-[#C8431F]">
                  {overdueFollowUps.length > 0 ? `${overdueFollowUps.length} overdue` : 'On schedule'}
                </span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-full bg-[#EFECE4] text-[#C8431F] flex items-center justify-center shrink-0">
              <BellRing className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>

      {/* Soft 11-Stage Leads Overview Bento Card */}
      <div className="bg-[#FAF8F5] rounded-3xl border border-[#E6E0D6] p-6 sm:p-7 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-[#17191A]">Leads Overview</h2>
            <p className="text-xs text-[#6B6860] mt-0.5">
              11-stage mineral breakdown — click any stage tile to inspect its deals
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateToPipeline()}
            className="text-xs font-medium text-[#17191A] hover:underline flex items-center gap-1 cursor-pointer shrink-0"
          >
            Open Pipeline <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {stageBreakdown.map(({ stage, hex, count, value }) => (
            <button
              key={stage.id}
              type="button"
              onClick={() => onNavigateToPipeline(stage.id)}
              className="text-left bg-[#F7F4EE] hover:bg-[#EFECE4] rounded-2xl p-4 transition-colors cursor-pointer flex flex-col justify-between gap-2.5"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: hex }}
                />
                <span className="text-xs font-medium text-[#57534E] truncate" title={stage.name}>
                  {stage.name}
                </span>
              </div>

              <div>
                <div className="text-2xl font-semibold text-[#17191A] font-tabular leading-none">
                  {count}
                </div>
                <div className="text-xs text-[#78716C] font-tabular mt-1.5">
                  {formatCurrency(value, currency)}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Bounded Split Bento Task Command Center */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Bento Card (7/12): Today's Tasks — Hairline List Rows */}
        <div className="lg:col-span-7 bg-[#FAF8F5] border border-[#E6E0D6] rounded-3xl p-6 h-[480px] flex flex-col">
          {/* Header */}
          <div className="pb-4 border-b border-[#EAE4DA] space-y-3 shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[#17191A]">Today&apos;s Tasks</h2>
                <div className="flex items-center gap-2.5 mt-1">
                  <span className="text-xs text-[#6B6860]">
                    {completedTodayCount} of {todaysAllTasks.length} done
                  </span>
                  <div className="w-24 h-[3px] rounded-full bg-[#E6E0D6] overflow-hidden">
                    <div
                      className="h-full bg-[#2F5C50] rounded-full transition-all duration-300"
                      style={{ width: `${todayProgressPct}%` }}
                    />
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onOpenNewDeal}
                className="bg-[#17191A] hover:opacity-90 text-white rounded-full px-4 py-1.5 text-xs font-medium cursor-pointer shrink-0"
              >
                + Add
              </button>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {QUEUE_PILLS.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setActiveQueue(q.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                    activeQueue === q.id
                      ? 'bg-[#17191A] text-white'
                      : 'bg-[#F2EFE8] text-[#6B6860] hover:text-[#17191A]'
                  }`}
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>

          {/* Clean Hairline List Rows (No Inner Boxes) */}
          <div className="flex-1 overflow-y-auto pt-1">
            {todaysFiltered.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-xs text-[#6B6860] px-4">
                <CalendarCheck className="w-7 h-7 text-[#2F5C50]/50 mb-2" />
                <p className="font-medium text-[#17191A]">All caught up for today</p>
                <p className="text-[11px] mt-0.5">No pending tasks in this queue.</p>
              </div>
            ) : (
              todaysFiltered.map((task) => {
                const linkedLead = resolveTaskLead(task);
                const queue = resolveTaskQueue(task, linkedLead, stageNameById);
                const displayTitle = formatTaskDisplayTitle(task, linkedLead, stageNameById);
                const QueueIcon = getQueueIcon(queue);
                const rep = memberById.get(task.ownerId || linkedLead?.ownerId || '');
                const repInitials = getRepInitials(rep);

                return (
                  <div
                    key={task.id}
                    onClick={() => handleTaskRowClick(task, linkedLead)}
                    className="border-b border-[#EAE4DA] py-3.5 flex items-center justify-between gap-3 hover:bg-[#F3EFE8]/60 px-2 rounded-xl transition-colors group cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        type="button"
                        disabled={completingTaskId === task.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCompleteTask(task.id);
                        }}
                        title="Mark Complete"
                        className="w-5 h-5 rounded-md border border-[#CFC8BC] hover:border-[#17191A] flex items-center justify-center shrink-0 cursor-pointer transition-colors disabled:opacity-50"
                      >
                        {completingTaskId === task.id && (
                          <Check className="w-3 h-3 text-[#17191A]" />
                        )}
                      </button>

                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[#17191A] truncate flex items-center gap-2">
                          <span className="truncate">{displayTitle}</span>
                          {linkedLead && (
                            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white border border-[#E6E0D6] text-[#2F5C50] shrink-0">
                              ↗ Open Lead
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#78716C] truncate mt-0.5">
                          {queue}
                          {linkedLead
                            ? ` · ${linkedLead.company || linkedLead.contactName} · ${formatCurrency(
                                linkedLead.value,
                                currency
                              )}`
                            : ''}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTaskRowClick(task, linkedLead);
                        }}
                        title={queue}
                        className="w-8 h-8 rounded-full bg-[#EFECE4] text-[#57534E] hover:text-[#17191A] flex items-center justify-center cursor-pointer"
                      >
                        <QueueIcon className="w-3.5 h-3.5" />
                      </button>
                      <span
                        title={`Assigned: ${rep?.name || 'Admin'}`}
                        className="w-8 h-8 rounded-full bg-[#EFECE4] text-[#57534E] text-[11px] font-semibold flex items-center justify-center"
                      >
                        {repInitials}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Bento Card (5/12): Follow-Up Tasks — Clean Date-Badge & Airy Rows */}
        <div className="lg:col-span-5 bg-[#FAF8F5] border border-[#E6E0D6] rounded-3xl p-6 h-[480px] flex flex-col">
          {/* Header */}
          <div className="pb-4 border-b border-[#EAE4DA] flex flex-wrap items-center justify-between gap-2 shrink-0">
            <h2 className="text-base font-semibold text-[#17191A]">Follow-Up Tasks</h2>

            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-full bg-[#F2EFE8] p-0.5 text-[11px] font-medium">
                <button
                  type="button"
                  onClick={() => setFollowUpTab('overdue')}
                  className={`px-2.5 py-1 rounded-full cursor-pointer transition-colors ${
                    followUpTab === 'overdue'
                      ? 'bg-[#17191A] text-white'
                      : 'text-[#6B6860] hover:text-[#17191A]'
                  }`}
                >
                  Overdue ({overdueFollowUps.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFollowUpTab('upcoming')}
                  className={`px-2.5 py-1 rounded-full cursor-pointer transition-colors ${
                    followUpTab === 'upcoming'
                      ? 'bg-[#17191A] text-white'
                      : 'text-[#6B6860] hover:text-[#17191A]'
                  }`}
                >
                  Upcoming ({upcomingFollowUps.length})
                </button>
              </div>

              {onOpenSchedule && (
                <button
                  type="button"
                  onClick={onOpenSchedule}
                  className="px-3 py-1 rounded-full bg-[#EFECE4] hover:bg-[#E5E0D5] text-[#17191A] text-[11px] font-medium cursor-pointer"
                >
                  Open schedule
                </button>
              )}
            </div>
          </div>

          {/* Scrollable Airy Rows */}
          <div className="flex-1 overflow-y-auto pt-3">
            {displayedFollowUps.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-xs text-[#6B6860] px-4">
                <BellRing className="w-7 h-7 text-[#6B6860]/40 mb-2" />
                <p className="font-medium text-[#17191A]">No pending follow-ups</p>
                <p className="text-[11px] mt-0.5">Scheduled follow-ups will appear here.</p>
              </div>
            ) : (
              displayedFollowUps.map((task) => {
                const linkedLead = resolveTaskLead(task);
                const queue = resolveTaskQueue(task, linkedLead, stageNameById);
                const displayTitle = formatTaskDisplayTitle(task, linkedLead, stageNameById);
                const dateBlock = getDateBlockParts(task.dueDate, todayStr);

                return (
                  <div
                    key={task.id}
                    onClick={() => handleTaskRowClick(task, linkedLead)}
                    className="bg-[#F2EFE8]/70 hover:bg-[#EAE5DC] rounded-2xl px-4 py-3 mb-2.5 flex items-center justify-between gap-3 transition-colors group cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Left 2-line Calendar Block */}
                      <div className="w-11 text-center shrink-0 leading-tight">
                        <div
                          className={`text-[11px] font-semibold ${
                            dateBlock.isLate ? 'text-[#C8431F]' : 'text-[#6B6860]'
                          }`}
                        >
                          {dateBlock.top}
                        </div>
                        <div
                          className={`text-sm font-semibold ${
                            dateBlock.isLate ? 'text-[#C8431F]' : 'text-[#17191A]'
                          }`}
                        >
                          {dateBlock.bottom}
                        </div>
                      </div>

                      {/* Center Company & Subtitle */}
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[#17191A] truncate flex items-center gap-2">
                          <span className="truncate">{linkedLead?.company || task.dealTitle || displayTitle}</span>
                          {linkedLead && (
                            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white border border-[#E6E0D6] text-[#2F5C50] shrink-0">
                              ↗ Open Lead
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#78716C] truncate mt-0.5">
                          {queue}
                          {linkedLead
                            ? ` · ${linkedLead.contactName} | ${
                                linkedLead.leadSource || linkedLead.source || 'Cold Call'
                              }`
                            : ''}
                        </div>
                      </div>
                    </div>

                    {/* Right Quick Actions (Always accessible, non-overlapping) */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={reschedulingTaskId === task.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleQuickReschedule(task.id, 1);
                        }}
                        title="Snooze +1 day to tomorrow"
                        className="px-2.5 py-1 rounded-full bg-white/90 hover:bg-white border border-[#E6E0D6] text-[11px] font-medium text-[#57534E] cursor-pointer disabled:opacity-50"
                      >
                        +1d
                      </button>
                      <button
                        type="button"
                        disabled={completingTaskId === task.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCompleteTask(task.id);
                        }}
                        title="Mark Done"
                        className="w-7 h-7 rounded-full border border-[#D6CFC3] bg-white/80 hover:bg-[#17191A] hover:text-white hover:border-[#17191A] text-[#57534E] flex items-center justify-center cursor-pointer transition-colors disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {snoozeToast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-2xl bg-[#17191A] text-white px-4 py-2.5 shadow-xl border border-[#2F5C50] text-xs font-medium">
          {snoozeToast}
        </div>
      )}
    </div>
  );
}
