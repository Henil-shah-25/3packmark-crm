'use client';

import React, { useState } from 'react';
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  Circle,
  Clock,
  Plus,
  Video,
  ExternalLink,
  AlertCircle,
  CheckSquare,
  Phone,
  Mail,
  CalendarCheck,
  Flag,
} from 'lucide-react';
import { Task, CalendarEvent, Workspace, TeamMember, Lead } from '@/types/crm';
import { CalendarView } from '@/components/calendar/CalendarView';
import { HeaderReveal } from '@/components/ui/HeaderReveal';
import { SlidingTabs } from '@/components/ui/SlidingTabs';
import { MagneticButton } from '@/components/ui/MagneticButton';

interface ScheduleViewProps {
  workspace: Workspace;
  tasks: Task[];
  calendarEvents: CalendarEvent[];
  members: TeamMember[];
  leads?: Lead[];
  onToggleTask: (taskId: string, completed: boolean) => Promise<void>;
  onCreateTask: (taskData: Omit<Task, 'id' | 'createdAt'>) => Promise<void>;
  onScheduleMeeting: (eventData: any) => Promise<void>;
  onRescheduleMeeting?: (eventId: string, newStart: string, newEnd: string) => Promise<void>;
  onCancelMeeting?: (eventId: string) => Promise<void>;
  onRefreshEvents?: () => Promise<void>;
}

type KindFilter = 'all' | 'call' | 'meeting' | 'email' | 'task';

export function ScheduleView({
  workspace,
  tasks,
  calendarEvents,
  members,
  leads = [],
  onToggleTask,
  onCreateTask,
  onScheduleMeeting,
  onRescheduleMeeting,
  onCancelMeeting,
  onRefreshEvents,
}: ScheduleViewProps) {
  const [activeTab, setActiveTab] = useState<'calendar' | 'tasks'>('calendar');
  const [filter, setFilter] = useState<'all' | 'today' | 'overdue' | 'upcoming'>('all');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [showTaskModal, setShowTaskModal] = useState(false);

  // New task form state
  const [taskTitle, setTaskTitle] = useState('');
  const [todayStr, setTodayStr] = useState('2026-10-26');
  React.useEffect(() => {
    setTodayStr(new Date().toISOString().split('T')[0]);
  }, []);
  const [taskPriority, setTaskPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [taskKind, setTaskKind] = useState<'call' | 'meeting' | 'email' | 'task'>('task');
  const [taskDue, setTaskDue] = useState('2026-10-26');
  const [taskOwner, setTaskOwner] = useState(members[0]?.id || 'mem-1');

  const overdueTasks = tasks.filter((t) => !t.completed && t.dueDate < todayStr);
  const todayTasks = tasks.filter((t) => !t.completed && t.dueDate.startsWith(todayStr));
  const upcomingTasks = tasks.filter((t) => !t.completed && t.dueDate > todayStr);

  // Helper to categorize task into kind
  const inferTaskKind = (title: string): 'call' | 'meeting' | 'email' | 'task' => {
    const t = title.toLowerCase();
    if (t.includes('call') || t.includes('phone') || t.includes('ring')) return 'call';
    if (t.includes('meet') || t.includes('demo') || t.includes('sync')) return 'meeting';
    if (t.includes('email') || t.includes('send') || t.includes('follow-up') || t.includes('proposal')) return 'email';
    return 'task';
  };

  const displayedTasks = tasks.filter((t) => {
    if (filter === 'today' && (!t.dueDate.startsWith(todayStr) || t.completed)) return false;
    if (filter === 'overdue' && (t.completed || t.dueDate >= todayStr)) return false;
    if (filter === 'upcoming' && (t.completed || t.dueDate <= todayStr)) return false;

    if (kindFilter !== 'all') {
      const k = inferTaskKind(t.title);
      if (k !== kindFilter) return false;
    }
    return true;
  });

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle) return;
    await onCreateTask({
      workspaceId: workspace.id,
      title: taskKind !== 'task' ? `[${taskKind.toUpperCase()}] ${taskTitle}` : taskTitle,
      priority: taskPriority,
      dueDate: new Date(taskDue).toISOString(),
      completed: false,
      ownerId: taskOwner,
    });
    setTaskTitle('');
    setShowTaskModal(false);
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Header with reveal and count-up stats */}
      <HeaderReveal
        title="Schedule & Activities"
        subtitle="Meetings agenda, customer interactions & sales action items"
        tiles={[
          {
            label: "Today's Agenda",
            numericValue: todayTasks.length + calendarEvents.filter((e) => e.startIso.startsWith(todayStr)).length,
            badge: 'Active today',
          },
          {
            label: 'Overdue Items',
            numericValue: overdueTasks.length,
            badge: overdueTasks.length > 0 ? 'Urgent' : 'Clear',
          },
          {
            label: 'Upcoming Events',
            numericValue: upcomingTasks.length + calendarEvents.length,
          },
        ]}
      />

      {/* Top Sliding Ink Pill: Calendar vs Tasks */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <SlidingTabs
          options={[
            { id: 'calendar', label: `Calendar & Meet (${calendarEvents.length})` },
            { id: 'tasks', label: `Action Items & Tasks (${tasks.filter((t) => !t.completed).length})` },
          ]}
          value={activeTab}
          onChange={(val) => setActiveTab(val as 'calendar' | 'tasks')}
        />

        {activeTab === 'tasks' && (
          <MagneticButton
            onClick={() => setShowTaskModal(true)}
            className="btn btn--primary self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>New Task</span>
          </MagneticButton>
        )}
      </div>

      {activeTab === 'calendar' ? (
        <CalendarView
          workspace={workspace}
          calendarEvents={calendarEvents}
          leads={leads}
          members={members}
          onScheduleMeeting={onScheduleMeeting}
          onRescheduleMeeting={onRescheduleMeeting}
          onCancelMeeting={onCancelMeeting}
          onRefreshEvents={onRefreshEvents}
        />
      ) : (
        <div className="space-y-6">
          {/* Overdue alert section if overdue tasks exist */}
          {overdueTasks.length > 0 && (
            <div className="card p-4 border border-[var(--tomato)]/30 bg-[var(--tomato-soft)] flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[var(--tomato)] text-white flex items-center justify-center shrink-0">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[var(--tomato)]">
                    {overdueTasks.length} Action Items Past Due
                  </h4>
                  <p className="text-xs text-[var(--text-ink)] mt-0.5">
                    Follow-ups require immediate attention to prevent pipeline velocity stall.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setFilter('overdue')}
                className="btn btn--subtle text-xs shrink-0 font-semibold"
              >
                Review Overdue
              </button>
            </div>
          )}

          {/* Metric Filter Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div
              onClick={() => setFilter(filter === 'overdue' ? 'all' : 'overdue')}
              className={`card p-5 cursor-pointer transition-all duration-200 ${
                filter === 'overdue'
                  ? 'border-[var(--tomato)] ring-2 ring-[var(--tomato)]/20 shadow-md'
                  : ''
              }`}
              data-lift
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--text-muted)]">Overdue Tasks</span>
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--tomato)]" />
              </div>
              <span className="text-3xl font-extrabold mt-2.5 block text-[var(--text-ink)] font-tabular">
                {overdueTasks.length}
              </span>
              <span className="text-[11px] text-[var(--text-muted)]">Action items past scheduled close date</span>
            </div>

            <div
              onClick={() => setFilter(filter === 'today' ? 'all' : 'today')}
              className={`card p-5 cursor-pointer transition-all duration-200 ${
                filter === 'today'
                  ? 'border-[var(--ink)] ring-2 ring-[var(--ink)]/20 shadow-md'
                  : ''
              }`}
              data-lift
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--text-muted)]">Today’s Focus</span>
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--butter)]" />
              </div>
              <span className="text-3xl font-extrabold mt-2.5 block text-[var(--text-ink)] font-tabular">
                {todayTasks.length}
              </span>
              <span className="text-[11px] text-[var(--text-muted)]">Scheduled for completion today</span>
            </div>

            <div
              onClick={() => setFilter(filter === 'upcoming' ? 'all' : 'upcoming')}
              className={`card p-5 cursor-pointer transition-all duration-200 ${
                filter === 'upcoming'
                  ? 'border-[var(--pine)] ring-2 ring-[var(--pine)]/20 shadow-md'
                  : ''
              }`}
              data-lift
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--text-muted)]">Upcoming Tasks</span>
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--pine)]" />
              </div>
              <span className="text-3xl font-extrabold mt-2.5 block text-[var(--text-ink)] font-tabular">
                {upcomingTasks.length}
              </span>
              <span className="text-[11px] text-[var(--text-muted)]">Scheduled for next 7 to 30 days</span>
            </div>
          </div>

          {/* Agenda & Filter Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Kind chips: Call, Meeting, Email, Task */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-[var(--text-muted)] mr-1">Filter:</span>
              <button
                onClick={() => setKindFilter('all')}
                aria-pressed={kindFilter === 'all'}
                className="chip button-press"
              >
                All
              </button>
              <button
                onClick={() => setKindFilter('call')}
                aria-pressed={kindFilter === 'call'}
                className="chip button-press flex items-center gap-1.5"
              >
                <span className="w-2 h-2 rounded-full bg-[var(--pine)]" />
                <span>Call</span>
              </button>
              <button
                onClick={() => setKindFilter('meeting')}
                aria-pressed={kindFilter === 'meeting'}
                className="chip button-press flex items-center gap-1.5"
              >
                <span className="w-2 h-2 rounded-full bg-[var(--tomato)]" />
                <span>Meeting</span>
              </button>
              <button
                onClick={() => setKindFilter('email')}
                aria-pressed={kindFilter === 'email'}
                className="chip button-press flex items-center gap-1.5"
              >
                <span className="w-2 h-2 rounded-full bg-[var(--butter)]" />
                <span>Email</span>
              </button>
              <button
                onClick={() => setKindFilter('task')}
                aria-pressed={kindFilter === 'task'}
                className="chip button-press flex items-center gap-1.5"
              >
                <span className="w-2 h-2 rounded-full bg-[var(--ink)]" />
                <span>Task</span>
              </button>
            </div>

            {/* View filters */}
            <SlidingTabs
              options={[
                { id: 'all', label: 'All' },
                { id: 'today', label: 'Today' },
                { id: 'overdue', label: 'Overdue' },
                { id: 'upcoming', label: 'Upcoming' },
              ]}
              value={filter}
              onChange={(val) => setFilter(val as any)}
            />
          </div>

          {/* Agenda Task List */}
          <div className="card p-6" data-lift>
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)] mb-4">
              <h3 className="text-sm font-bold text-[var(--text-muted)]">
                Action Items ({displayedTasks.length})
              </h3>
              <span className="text-xs text-[var(--text-muted)]">Click checkbox to mark complete</span>
            </div>

            <div className="space-y-3">
              {displayedTasks.map((task) => {
                const kind = inferTaskKind(task.title);
                const isOverdue = !task.completed && task.dueDate < todayStr;
                const isToday = !task.completed && task.dueDate.startsWith(todayStr);

                let dotColor = 'var(--ink)';
                if (kind === 'call') dotColor = 'var(--pine)';
                if (kind === 'meeting') dotColor = 'var(--tomato)';
                if (kind === 'email') dotColor = 'var(--butter)';

                return (
                  <div
                    key={task.id}
                    onClick={() => onToggleTask(task.id, !task.completed)}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                      task.completed
                        ? 'bg-[var(--bg-main)]/60 border-[var(--border-subtle)] opacity-60'
                        : isToday
                        ? 'bg-[var(--bg-card)] border-[var(--ink)] shadow-2xs'
                        : isOverdue
                        ? 'bg-[var(--tomato-soft)]/40 border-[var(--tomato)]/30 shadow-2xs'
                        : 'bg-[var(--bg-card)] border-[var(--border-subtle)] hover:border-[var(--border-strong)] shadow-2xs'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleTask(task.id, !task.completed);
                        }}
                        className="text-[var(--pine)] shrink-0 transition-transform hover:scale-110"
                      >
                        {task.completed ? (
                          <CheckCircle2 className="w-5 h-5 fill-current text-white bg-[var(--pine)] rounded-full" />
                        ) : (
                          <Circle className="w-5 h-5 text-[var(--text-muted)] hover:text-[var(--text-ink)]" />
                        )}
                      </button>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: dotColor }}
                          />
                          <h4
                            className={`text-xs font-bold text-[var(--text-ink)] truncate ${
                              task.completed ? 'line-through text-[var(--text-muted)]' : ''
                            }`}
                          >
                            {task.title}
                          </h4>
                        </div>
                        <p className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate">
                          {task.dealTitle ? `Deal: ${task.dealTitle} • ` : ''}
                          Due: {new Date(task.dueDate).toLocaleDateString()}
                          {isToday && <span className="font-bold text-[var(--text-ink)] ml-1.5">• Today</span>}
                          {isOverdue && <span className="font-bold text-[var(--tomato)] ml-1.5">• Past Due</span>}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`badge ${
                          task.priority === 'high'
                            ? 'badge--tomato'
                            : task.priority === 'medium'
                            ? 'badge--butter'
                            : 'badge--pine'
                        }`}
                      >
                        {task.priority}
                      </span>
                    </div>
                  </div>
                );
              })}

              {displayedTasks.length === 0 && (
                <div className="py-16 flex flex-col items-center justify-center text-center text-xs text-[var(--text-muted)] gap-3">
                  <p>{tasks.length === 0 ? 'No action items yet.' : 'No action items match the selected filter.'}</p>
                  {tasks.length === 0 && (
                    <button
                      type="button"
                      onClick={() => setShowTaskModal(true)}
                      className="btn btn--solid text-xs py-2 px-4 rounded-full inline-flex items-center"
                    >
                      <Plus className="w-4 h-4 mr-1.5" />
                      Add your first task
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Task Modal */}
          {showTaskModal && (
            <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="card p-6 shadow-2xl max-w-md w-full space-y-4 animate-in fade-in zoom-in-95">
                <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                  <h2 className="text-base font-bold text-[var(--text-ink)]">Create Task</h2>
                  <button
                    onClick={() => setShowTaskModal(false)}
                    className="btn btn--subtle btn--icon w-7 h-7 text-xs"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleCreateTask} className="space-y-3.5 text-xs">
                  <div>
                    <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                      Activity Kind
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      <button
                        type="button"
                        onClick={() => setTaskKind('call')}
                        className={`py-1.5 px-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 ${
                          taskKind === 'call'
                            ? 'bg-[var(--pine)] text-white border-[var(--pine)]'
                            : 'bg-[var(--bg-main)] text-[var(--text-ink)] border-[var(--border-subtle)]'
                        }`}
                      >
                        <Phone className="w-3 h-3" />
                        <span>Call</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTaskKind('meeting')}
                        className={`py-1.5 px-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 ${
                          taskKind === 'meeting'
                            ? 'bg-[var(--tomato)] text-white border-[var(--tomato)]'
                            : 'bg-[var(--bg-main)] text-[var(--text-ink)] border-[var(--border-subtle)]'
                        }`}
                      >
                        <CalendarCheck className="w-3 h-3" />
                        <span>Meeting</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTaskKind('email')}
                        className={`py-1.5 px-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 ${
                          taskKind === 'email'
                            ? 'bg-[var(--butter)] text-[#292511] border-[var(--butter)]'
                            : 'bg-[var(--bg-main)] text-[var(--text-ink)] border-[var(--border-subtle)]'
                        }`}
                      >
                        <Mail className="w-3 h-3" />
                        <span>Email</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTaskKind('task')}
                        className={`py-1.5 px-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 ${
                          taskKind === 'task'
                            ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]'
                            : 'bg-[var(--bg-main)] text-[var(--text-ink)] border-[var(--border-subtle)]'
                        }`}
                      >
                        <Flag className="w-3 h-3" />
                        <span>Task</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                      Title *
                    </label>
                    <input
                      type="text"
                      required
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      placeholder="e.g. Follow-up on pricing proposal"
                      className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                        Due Date
                      </label>
                      <input
                        type="date"
                        value={taskDue}
                        onChange={(e) => setTaskDue(e.target.value)}
                        className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)]"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                        Priority
                      </label>
                      <select
                        value={taskPriority}
                        onChange={(e) => setTaskPriority(e.target.value as any)}
                        className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)]"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
                    <button
                      type="button"
                      onClick={() => setShowTaskModal(false)}
                      className="btn btn--subtle"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn--primary"
                    >
                      Save Task
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
