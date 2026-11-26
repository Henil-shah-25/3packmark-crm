'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Phone,
  Video,
  CheckCircle2,
  Clock,
  Calendar,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  MoreVertical,
  RotateCcw,
  Sparkles,
  MessageSquare,
  FileText,
  UserCheck,
  X,
  Check,
} from 'lucide-react';
import { Task, CalendarEvent, Lead, Workspace } from '@/types/crm';
import { PhoneActions } from '@/components/ui/PhoneActions';

interface TodayTasksSectionProps {
  workspace: Workspace;
  leads: Lead[];
  onOpenLead: (lead: Lead) => void;
  onRefreshData?: () => void;
}

export function TodayTasksSection({
  workspace,
  leads,
  onOpenLead,
  onRefreshData,
}: TodayTasksSectionProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [meetings, setMeetings] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal / Popover states for Actions
  const [activeCallNoteModalTask, setActiveCallNoteModalTask] = useState<Task | null>(null);
  const [callNoteText, setCallNoteText] = useState('');
  const [isSubmittingDone, setIsSubmittingDone] = useState(false);

  // Snooze popover
  const [snoozeMenuTaskId, setSnoozeMenuTaskId] = useState<string | null>(null);
  const [customSnoozeDate, setCustomSnoozeDate] = useState('');

  useEffect(() => {
    loadTodayData();
  }, [workspace?.id]);

  const loadTodayData = async () => {
    setIsLoading(true);
    try {
      const wsId = workspace?.id || 'ws-default';
      const [tasksRes, meetingsRes] = await Promise.all([
        fetch(`/api/tasks?workspaceId=${wsId}`),
        fetch(`/api/calendar/events?workspaceId=${wsId}`),
      ]);

      if (tasksRes.ok) {
        const data = await tasksRes.json();
        setTasks(Array.isArray(data) ? data : []);
      }
      if (meetingsRes.ok) {
        const data = await meetingsRes.json();
        setMeetings(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('[TodayTasksSection] Failed loading data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper map: leadId -> Lead
  const leadMap = useMemo(() => {
    const map = new Map<string, Lead>();
    leads.forEach((l) => map.set(l.id, l));
    return map;
  }, [leads]);

  // Today date boundaries (local)
  const todayStr = useMemo(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  }, []);

  // Classify Tasks & Meetings
  const {
    todayMeetings,
    todayCallbacks,
    todayDailyNewLeadCalls,
    overdueTasks,
    doneCount,
    totalCount,
  } = useMemo(() => {
    const now = new Date();

    // 1. Meetings Today (not cancelled)
    const todayM = meetings.filter((m) => {
      if (m.status === 'cancelled') return false;
      const mDate = m.startIso ? m.startIso.split('T')[0] : '';
      return mDate === todayStr;
    }).sort((a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime());

    // 2. Overdue Tasks (dueDate < today and not completed)
    const overdue = tasks.filter((t) => {
      if (t.completed || t.status === 'done') return false;
      const d = t.dueDate ? t.dueDate.split('T')[0] : '';
      return d !== '' && d < todayStr;
    });

    // 3. Call-backs Today
    const callbacks = tasks.filter((t) => {
      if (t.completed || t.status === 'done') return false;
      const isToday = (t.dueDate ? t.dueDate.split('T')[0] : '') === todayStr;
      const isCallbackType = t.type === 'call_back' || (!t.type && t.title?.toLowerCase().includes('call back'));
      return isToday && isCallbackType;
    });

    // 4. Daily New-Lead Calls Today
    const dailyCalls = tasks.filter((t) => {
      if (t.completed || t.status === 'done') return false;
      const isToday = (t.dueDate ? t.dueDate.split('T')[0] : '') === todayStr;
      return isToday && t.type === 'new_lead_call';
    });

    // Compute progress counts
    const todayTasksOnly = tasks.filter((t) => {
      const d = t.dueDate ? t.dueDate.split('T')[0] : '';
      return d === todayStr;
    });

    const doneT = todayTasksOnly.filter((t) => t.completed || t.status === 'done').length;
    const totalT = todayTasksOnly.length + todayM.length;

    return {
      todayMeetings: todayM,
      todayCallbacks: callbacks,
      todayDailyNewLeadCalls: dailyCalls,
      overdueTasks: overdue,
      doneCount: doneT,
      totalCount: totalT,
    };
  }, [tasks, meetings, todayStr]);

  // Handle Mark Done
  const handleMarkTaskDone = async (task: Task, callNote?: string) => {
    setIsSubmittingDone(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace?.id || 'ws-default',
          status: 'done',
          completed: true,
          callNote: callNote || undefined,
        }),
      });

      if (res.ok) {
        setActiveCallNoteModalTask(null);
        setCallNoteText('');
        await loadTodayData();
        if (onRefreshData) onRefreshData();
      }
    } catch (err) {
      console.error('Failed marking task done:', err);
    } finally {
      setIsSubmittingDone(false);
    }
  };

  // Handle Snooze
  const handleSnoozeTask = async (task: Task, snoozeOption: '1h' | 'tomorrow' | 'custom', customDate?: string) => {
    try {
      let newDueIso = '';
      const now = new Date();

      if (snoozeOption === '1h') {
        now.setHours(now.getHours() + 1);
        newDueIso = now.toISOString();
      } else if (snoozeOption === 'tomorrow') {
        now.setDate(now.getDate() + 1);
        now.setHours(9, 0, 0, 0);
        newDueIso = now.toISOString();
      } else if (snoozeOption === 'custom' && customDate) {
        newDueIso = new Date(customDate + 'T09:00:00.000Z').toISOString();
      }

      const newDueDate = newDueIso.split('T')[0];

      await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace?.id || 'ws-default',
          status: 'snoozed',
          dueDate: newDueDate,
          dueAt: newDueIso,
          snoozedUntil: newDueIso,
        }),
      });

      setSnoozeMenuTaskId(null);
      await loadTodayData();
      if (onRefreshData) onRefreshData();
    } catch (err) {
      console.error('Failed snoozing task:', err);
    }
  };

  const hasAnyDueToday =
    todayMeetings.length > 0 ||
    todayCallbacks.length > 0 ||
    todayDailyNewLeadCalls.length > 0 ||
    overdueTasks.length > 0;

  // Calculate Progress Percent
  const progressPercent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 100;
  const strokeDashoffset = 100 - progressPercent;

  return (
    <section className="w-full rounded-[32px] bg-[var(--glass-2)] border border-[var(--rim)] shadow-xs p-6 md:p-8 space-y-6 transition-all">
      {/* Section Header: Title, Counts, and Circular Progress Ring */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--rim)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[var(--solid)] border border-[var(--rim)] flex items-center justify-center text-[var(--accent)] font-bold shadow-xs">
            <Calendar className="w-5 h-5 text-[var(--text)]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-extrabold text-lg sm:text-xl text-[var(--text)] tracking-tight">
                Today&apos;s Focus & Action Plan
              </h2>
              <span className="px-2.5 py-0.5 rounded-full bg-[var(--text)] text-[var(--bg)] text-[11px] font-bold">
                {totalCount - doneCount} Pending
              </span>
            </div>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              Live scheduled call-backs, upcoming syncs, and fresh lead follow-ups.
            </p>
          </div>
        </div>

        {/* Progress Ring (Done / Total) */}
        <div className="flex items-center gap-3 self-start sm:self-center bg-[var(--solid)] px-4 py-2 rounded-2xl border border-[var(--rim)] shadow-xs">
          <div className="relative w-9 h-9 flex items-center justify-center">
            <svg className="w-9 h-9 -rotate-90" viewBox="0 0 36 36">
              <circle
                cx="18"
                cy="18"
                r="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.5"
                className="text-[var(--rim)]"
              />
              <circle
                cx="18"
                cy="18"
                r="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.5"
                strokeDasharray="88"
                strokeDashoffset={88 - (88 * progressPercent) / 100}
                strokeLinecap="round"
                className="text-[var(--pine)] transition-all duration-500 ease-out"
              />
            </svg>
            <span className="absolute text-[10px] font-bold text-[var(--text)]">
              {progressPercent}%
            </span>
          </div>

          <div className="text-left">
            <div className="text-xs font-bold text-[var(--text)]">
              {doneCount} of {totalCount} Done
            </div>
            <div className="text-[10px] text-[var(--muted)] font-medium">Daily momentum</div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      {isLoading ? (
        <div className="py-12 text-center text-xs text-[var(--muted)] animate-pulse">
          Loading today&apos;s scheduled focus tasks...
        </div>
      ) : !hasAnyDueToday ? (
        /* Empty State */
        <div className="py-12 text-center rounded-2xl bg-[var(--glass-1)] border border-[var(--rim)] p-6">
          <CheckCircle2 className="w-10 h-10 text-[var(--pine)] mx-auto mb-2.5 opacity-80" />
          <h3 className="font-bold text-sm text-[var(--text)]">Nothing due today</h3>
          <p className="text-xs text-[var(--muted)] mt-1 max-w-sm mx-auto">
            All customer outreach, call-backs, and meetings are up to date. You are all set for today!
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 1. OVERDUE TASKS (Red Accent) */}
          {overdueTasks.length > 0 && (
            <div className="p-4 rounded-2xl bg-[var(--bad)]/10 border border-[var(--bad)]/30 space-y-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-[var(--bad)]" />
                <h3 className="text-xs font-bold text-[var(--bad)]">
                  Overdue Follow-ups ({overdueTasks.length})
                </h3>
              </div>

              <div className="space-y-2">
                {overdueTasks.map((t) => {
                  const lead = t.leadId ? leadMap.get(t.leadId) : null;
                  return (
                    <div
                      key={t.id}
                      className="p-3 rounded-xl bg-[var(--solid)] border border-[var(--bad)]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-2xs"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[var(--text)] truncate">{t.title}</span>
                          <span className="px-2 py-0.5 rounded-full bg-[var(--bad)]/20 text-[var(--bad)] text-[10px] font-bold">
                            Due {t.dueDate}
                          </span>
                        </div>
                        {lead && (
                          <div className="text-[11px] text-[var(--muted)] mt-0.5 flex items-center gap-2">
                            <span>{lead.company}</span>
                            {lead.phone && (
                              <div className="inline-flex items-center">
                                <PhoneActions phone={lead.phone} compact />
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setActiveCallNoteModalTask(t)}
                          className="px-3 py-1.5 rounded-full bg-[var(--pine)] text-white text-xs font-semibold hover:opacity-90 transition-all cursor-pointer"
                        >
                          Done
                        </button>
                        {lead && (
                          <button
                            onClick={() => onOpenLead(lead)}
                            className="px-3 py-1.5 rounded-full bg-[var(--glass-2)] hover:bg-[var(--glass-3)] text-xs font-semibold text-[var(--text)] border border-[var(--rim)] cursor-pointer"
                          >
                            Open Lead
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. TODAY'S MEETINGS */}
          {todayMeetings.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--muted)]">
                <Video className="w-4 h-4 text-[var(--text)]" />
                <span>Meetings Today ({todayMeetings.length})</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {todayMeetings.map((m) => {
                  const lead = m.leadId ? leadMap.get(m.leadId) : null;
                  const startTime = new Date(m.startIso).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div
                      key={m.id}
                      className="p-4 rounded-2xl bg-[var(--solid)] border border-[var(--rim)] shadow-xs flex flex-col justify-between space-y-3"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[var(--pine)]/15 text-[var(--pine)] border border-[var(--pine)]/30 font-mono">
                            {startTime}
                          </span>
                          {!lead?.email && (
                            <span className="text-[10px] font-bold text-[var(--butter)] px-2 py-0.5 rounded-full bg-[var(--butter)]/15 border border-[var(--butter)]/30">
                              No email — remind manually
                            </span>
                          )}
                        </div>

                        <h4 className="font-bold text-sm text-[var(--text)] mt-2">{m.title}</h4>
                        {lead && (
                          <p className="text-xs text-[var(--muted)] mt-0.5">
                            {lead.contactName || 'Lead'} • {lead.company}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-[var(--rim)]">
                        {m.meetUrl ? (
                          <a
                            href={m.meetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--pine)] text-white text-xs font-bold hover:opacity-90 transition-all"
                          >
                            <Video className="w-3.5 h-3.5" />
                            <span>Join Meet</span>
                          </a>
                        ) : (
                          <span className="text-xs text-[var(--muted)]">No video link</span>
                        )}

                        {lead && (
                          <button
                            onClick={() => onOpenLead(lead)}
                            className="flex items-center gap-1 text-xs font-semibold text-[var(--text)] hover:underline cursor-pointer"
                          >
                            <span>Open Lead</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. CALL-BACKS SCHEDULED FOR TODAY */}
          {todayCallbacks.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--muted)]">
                <Phone className="w-4 h-4 text-[var(--text)]" />
                <span>Call-Backs Due Today ({todayCallbacks.length})</span>
              </div>

              <div className="space-y-2">
                {todayCallbacks.map((cb) => {
                  const lead = cb.leadId ? leadMap.get(cb.leadId) : null;
                  const lastNote = lead?.leadNotes && lead.leadNotes.length > 0
                    ? lead.leadNotes[0].content
                    : lead?.notes || cb.notes || 'Scheduled follow-up';

                  return (
                    <div
                      key={cb.id}
                      className="p-4 rounded-2xl bg-[var(--solid)] border border-[var(--rim)] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-[var(--text)] truncate">
                            {lead?.contactName || cb.title}
                          </span>
                          {lead?.company && (
                            <span className="text-xs text-[var(--muted)] truncate">
                              • {lead.company}
                            </span>
                          )}
                          {lead?.status && (
                            <span className="px-2 py-0.5 rounded-full bg-[var(--glass-3)] text-[10px] font-semibold text-[var(--text)] border border-[var(--rim)]">
                              {lead.status}
                            </span>
                          )}
                        </div>

                        {/* Phone Actions */}
                        {lead?.phone && (
                          <div className="flex items-center gap-2 pt-0.5">
                            <PhoneActions phone={lead.phone} />
                          </div>
                        )}

                        {/* Last Note Snippet */}
                        <p className="text-[11px] text-[var(--muted)] italic line-clamp-1 opacity-80 pt-0.5">
                          &ldquo;{lastNote}&rdquo;
                        </p>
                      </div>

                      {/* Actions: Done | Snooze | Open Lead */}
                      <div className="flex items-center gap-2 shrink-0 relative">
                        <button
                          onClick={() => setActiveCallNoteModalTask(cb)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[var(--pine)] text-white text-xs font-semibold hover:opacity-90 transition-all cursor-pointer shadow-xs"
                        >
                          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>Done</span>
                        </button>

                        {/* Snooze Dropdown */}
                        <div className="relative">
                          <button
                            onClick={() =>
                              setSnoozeMenuTaskId(snoozeMenuTaskId === cb.id ? null : cb.id)
                            }
                            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[var(--glass-2)] hover:bg-[var(--glass-3)] text-xs font-semibold text-[var(--text)] border border-[var(--rim)] transition-all cursor-pointer"
                          >
                            <Clock className="w-3.5 h-3.5 text-[var(--muted)]" />
                            <span>Snooze</span>
                          </button>

                          {snoozeMenuTaskId === cb.id && (
                            <div className="absolute right-0 mt-2 w-48 p-2 rounded-2xl bg-[var(--solid)] border border-[var(--rim)] shadow-xl z-30 space-y-1 text-xs">
                              <button
                                onClick={() => handleSnoozeTask(cb, '1h')}
                                className="w-full text-left px-3 py-1.5 rounded-xl hover:bg-[var(--glass-2)] text-[var(--text)] transition-colors cursor-pointer"
                              >
                                Snooze 1 Hour
                              </button>
                              <button
                                onClick={() => handleSnoozeTask(cb, 'tomorrow')}
                                className="w-full text-left px-3 py-1.5 rounded-xl hover:bg-[var(--glass-2)] text-[var(--text)] transition-colors cursor-pointer"
                              >
                                Snooze to Tomorrow (9 AM)
                              </button>
                              <div className="pt-1 border-t border-[var(--rim)]">
                                <label className="text-[10px] text-[var(--muted)] block px-2 mb-1">
                                  Pick Specific Date:
                                </label>
                                <input
                                  type="date"
                                  value={customSnoozeDate}
                                  onChange={(e) => {
                                    setCustomSnoozeDate(e.target.value);
                                    if (e.target.value) {
                                      handleSnoozeTask(cb, 'custom', e.target.value);
                                    }
                                  }}
                                  className="w-full p-1.5 rounded-lg bg-[var(--glass-2)] border border-[var(--rim)] text-[11px] text-[var(--text)]"
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {lead && (
                          <button
                            onClick={() => onOpenLead(lead)}
                            className="px-3 py-1.5 rounded-full bg-[var(--glass-2)] hover:bg-[var(--glass-3)] text-xs font-semibold text-[var(--text)] border border-[var(--rim)] cursor-pointer"
                          >
                            Open Lead
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. DAILY NEW-LEAD CALLS */}
          {todayDailyNewLeadCalls.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--muted)]">
                <Sparkles className="w-4 h-4 text-[var(--butter)]" />
                <span>Daily New-Lead Calls ({todayDailyNewLeadCalls.length})</span>
              </div>

              <div className="space-y-2">
                {todayDailyNewLeadCalls.map((nl) => {
                  const lead = nl.leadId ? leadMap.get(nl.leadId) : null;

                  return (
                    <div
                      key={nl.id}
                      className="p-4 rounded-2xl bg-[var(--solid)] border border-[var(--rim)] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-[var(--text)]">
                            {lead?.contactName || nl.title}
                          </span>
                          {lead?.company && (
                            <span className="text-xs text-[var(--muted)]">
                              • {lead.company}
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded-full bg-[var(--butter)]/20 text-[var(--butter)] text-[10px] font-bold">
                            Fresh Lead
                          </span>
                        </div>

                        {lead?.phone && (
                          <div className="flex items-center gap-2 pt-0.5">
                            <PhoneActions phone={lead.phone} />
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setActiveCallNoteModalTask(nl)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[var(--pine)] text-white text-xs font-semibold hover:opacity-90 cursor-pointer shadow-xs"
                        >
                          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>Done</span>
                        </button>

                        {lead && (
                          <button
                            onClick={() => onOpenLead(lead)}
                            className="px-3 py-1.5 rounded-full bg-[var(--glass-2)] hover:bg-[var(--glass-3)] text-xs font-semibold text-[var(--text)] border border-[var(--rim)] cursor-pointer"
                          >
                            Open Lead
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* QUICK CALL NOTE MODAL ON DONE */}
      {activeCallNoteModalTask && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
        >
          <div className="w-full max-w-md rounded-[28px] bg-[var(--solid)] border border-[var(--rim)] p-6 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--rim)]">
              <div>
                <h3 className="font-bold text-sm text-[var(--text)]">Log Call & Complete Task</h3>
                <p className="text-[11px] text-[var(--muted)]">{activeCallNoteModalTask.title}</p>
              </div>
              <button
                onClick={() => setActiveCallNoteModalTask(null)}
                className="text-[var(--muted)] hover:text-[var(--text)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-[var(--muted)] block mb-1">
                Call Debrief / Notes (Optional)
              </label>
              <textarea
                rows={4}
                value={callNoteText}
                onChange={(e) => setCallNoteText(e.target.value)}
                placeholder="Discussed requirements, client budget confirmed for Q1..."
                className="w-full p-3 rounded-2xl bg-[var(--glass-2)] border border-[var(--rim)] text-xs text-[var(--text)] focus:ring-1 focus:ring-[var(--text)] resize-none"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                disabled={isSubmittingDone}
                onClick={() => handleMarkTaskDone(activeCallNoteModalTask)}
                className="px-4 py-2 rounded-full bg-[var(--glass-2)] hover:bg-[var(--glass-3)] text-xs font-semibold text-[var(--text)] border border-[var(--rim)] cursor-pointer"
              >
                Skip Note & Mark Done
              </button>

              <button
                type="button"
                disabled={isSubmittingDone}
                onClick={() => handleMarkTaskDone(activeCallNoteModalTask, callNoteText)}
                className="px-5 py-2 rounded-full bg-[var(--pine)] text-white text-xs font-bold shadow-md hover:opacity-90 cursor-pointer"
              >
                {isSubmittingDone ? 'Saving...' : 'Save & Mark Done'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

