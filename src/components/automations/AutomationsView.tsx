'use client';

import React, { useState } from 'react';
import {
  GitBranch,
  Play,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Sparkles,
  ArrowRight,
  Shield,
  Clock,
  Zap,
  Copy,
  Trash2,
  Sliders,
  History,
  LayoutGrid,
  Check,
  Pause,
} from 'lucide-react';
import {
  AutomationRule,
  AutomationRun,
  Pipeline,
  PipelineStage,
  Workspace,
  TeamMember,
  Lead,
  EmailTemplate,
  VisualWorkflowNode,
  VisualWorkflowEdge,
  ScheduledJob,
} from '@/types/crm';
import { VisualWorkflowCanvas } from './VisualWorkflowCanvas';
import { WorkflowTemplatesModal } from './WorkflowTemplatesModal';
import { WorkflowHistoryModal } from './WorkflowHistoryModal';
import { HeaderReveal } from '@/components/ui/HeaderReveal';
import { SlidingTabs } from '@/components/ui/SlidingTabs';
import { MagneticButton } from '@/components/ui/MagneticButton';
import { B2B_CHEMICAL_AUTOMATIONS, buildDefaultB2bAutomationRules } from '@/lib/automations/b2b-email-templates';

interface AutomationsViewProps {
  workspace: Workspace;
  automations: AutomationRule[];
  runs: AutomationRun[];
  stages: PipelineStage[];
  pipelines?: Pipeline[];
  templates?: EmailTemplate[];
  leads?: Lead[];
  members?: TeamMember[];
  onSaveRule: (rule: Partial<AutomationRule>) => Promise<void>;
  onTestRule: (rule: AutomationRule) => Promise<any>;
  onDeleteRule?: (ruleId: string) => Promise<void>;
  onRefresh?: () => Promise<void> | void;
}

export function AutomationsView({
  workspace,
  automations,
  runs,
  stages,
  pipelines = [],
  templates = [],
  leads = [],
  members = [],
  onSaveRule,
  onTestRule,
  onDeleteRule,
  onRefresh,
}: AutomationsViewProps) {
  // Navigation / Modal states
  const [mainTab, setMainTab] = useState<'workflows' | 'queue' | 'audit'>('workflows');
  const [selectedWorkflowForCanvas, setSelectedWorkflowForCanvas] = useState<AutomationRule | null | 'new'>(null);
  const [isTemplatesModalOpen, setIsTemplatesModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedWorkflowForHistory, setSelectedWorkflowForHistory] = useState<AutomationRule | null>(null);

  // Scheduled Jobs Queue state
  const [scheduledJobs, setScheduledJobs] = useState<ScheduledJob[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [actionInProgressJobId, setActionInProgressJobId] = useState<string | null>(null);

  // Test simulation state
  const [testResult, setTestResult] = useState<any | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testedRuleName, setTestedRuleName] = useState<string>('');

  // Filtering
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused'>('all');

  // B2B Chemical Email Automations state
  const [editingB2bId, setEditingB2bId] = useState<string | null>(null);
  const [b2bSubjectDraft, setB2bSubjectDraft] = useState('');
  const [b2bBodyDraft, setB2bBodyDraft] = useState('');
  const [isSavingB2b, setIsSavingB2b] = useState(false);
  const [isProcessingDue, setIsProcessingDue] = useState(false);
  const [localRunCounts, setLocalRunCounts] = useState<Record<string, number>>({});
  const [liveRunBanner, setLiveRunBanner] = useState<{
    ruleName: string;
    leadTitle: string;
    emailSent: boolean;
    recipientEmail?: string;
    emailError?: string;
    emailSkippedReason?: string;
    taskCreated: boolean;
    activityLogged: boolean;
  } | null>(null);

  const defaultB2bRules = buildDefaultB2bAutomationRules(workspace.id);
  const b2bEmailAutomations = defaultB2bRules.map((def) => {
    const saved = automations.find((a) => a.id === def.id);
    return saved || def;
  });

  const patchB2bRule = async (rule: AutomationRule, patch: Record<string, any>) => {
    setIsSavingB2b(true);
    try {
      const res = await fetch(`/api/automations/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace.id,
          ...patch,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save automation');
      await onRefresh?.();
    } catch (err: any) {
      alert(err.message || 'Failed to persist automation change');
    } finally {
      setIsSavingB2b(false);
    }
  };

  const handleToggleB2bActive = async (rule: AutomationRule) => {
    await patchB2bRule(rule, { isActive: !rule.isActive });
  };

  const handleToggleB2bMode = async (rule: AutomationRule, mode: 'auto_send' | 'manual_confirm') => {
    const executionMode = mode === 'auto_send' ? 'auto_send' : 'draft_only';
    const updatedActions = (rule.actions && rule.actions.length > 0 ? rule.actions : [{ type: 'send_email', config: {} }]).map((act, idx) =>
      idx === 0 ? { ...act, config: { ...(act.config || {}), emailMode: mode } } : act
    );
    await patchB2bRule(rule, { executionMode, actions: updatedActions });
  };

  const handleChangeB2bTiming = async (rule: AutomationRule, delayMinutes: number) => {
    await patchB2bRule(rule, { delayMinutes });
  };

  const handleSaveB2bTemplate = async (rule: AutomationRule) => {
    setIsSavingB2b(true);
    try {
      const updatedActions = (rule.actions && rule.actions.length > 0 ? rule.actions : [{ type: 'send_email', config: {} }]).map((act, idx) =>
        idx === 0
          ? {
              ...act,
              config: {
                ...(act.config || {}),
                subject: b2bSubjectDraft,
                body: b2bBodyDraft,
              },
            }
          : act
      );
      await onSaveRule({ ...rule, actions: updatedActions as any });
      setEditingB2bId(null);
    } finally {
      setIsSavingB2b(false);
    }
  };

  const activeCount = automations.filter((a) => a.isActive).length;
  const successfulRuns = runs.filter((r) => r.status === 'success').length;
  const successRate = runs.length > 0 ? Math.round((successfulRuns / runs.length) * 100) : 100;

  const fetchScheduledJobs = async () => {
    setIsLoadingJobs(true);
    try {
      const res = await fetch(`/api/automations/jobs?workspaceId=${workspace.id}`);
      if (res.ok) {
        const data = await res.json();
        setScheduledJobs(data.jobs || []);
      }
    } catch (e) {
      console.warn('Failed to fetch scheduled jobs:', e);
    } finally {
      setIsLoadingJobs(false);
    }
  };

  React.useEffect(() => {
    if (mainTab === 'queue') {
      fetchScheduledJobs();
    }
  }, [mainTab, workspace.id]);

  const handleTriggerJobNow = async (jobId: string) => {
    setActionInProgressJobId(jobId);
    try {
      const res = await fetch('/api/automations/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace.id,
          jobId,
          action: 'trigger_now',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        alert('Job executed successfully!');
        await fetchScheduledJobs();
      } else {
        alert(data.error || 'Failed to trigger job');
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setActionInProgressJobId(null);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    if (!confirm('Cancel this scheduled automation job?')) return;
    setActionInProgressJobId(jobId);
    try {
      const res = await fetch('/api/automations/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace.id,
          jobId,
          action: 'cancel',
        }),
      });
      if (res.ok) {
        await fetchScheduledJobs();
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setActionInProgressJobId(null);
    }
  };

  const filteredAutomations = automations.filter((rule) => {
    const matchesSearch =
      rule.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      (rule.description && rule.description.toLowerCase().includes(searchFilter.toLowerCase()));
    const matchesStatus =
      statusFilter === 'all' ? true : statusFilter === 'active' ? rule.isActive : !rule.isActive;
    return matchesSearch && matchesStatus;
  });

  const handleDryRunTest = async (rule: AutomationRule) => {
    setIsTesting(true);
    setTestedRuleName(rule.name);
    try {
      const result = await onTestRule(rule);
      setTestResult(result);
    } catch (err: any) {
      alert(err.message || 'Test execution failed');
    } finally {
      setIsTesting(false);
    }
  };

  const handleToggleActive = async (rule: AutomationRule) => {
    await onSaveRule({
      ...rule,
      isActive: !rule.isActive,
    });
  };

  const handleDuplicate = async (rule: AutomationRule) => {
    const cloned: Partial<AutomationRule> = {
      name: `${rule.name} (Copy)`,
      description: rule.description,
      triggerType: rule.triggerType,
      triggerStageId: rule.triggerStageId,
      sequence: rule.sequence ? JSON.parse(JSON.stringify(rule.sequence)) : undefined,
      stopConditions: rule.stopConditions ? JSON.parse(JSON.stringify(rule.stopConditions)) : undefined,
      sendingWindow: rule.sendingWindow ? JSON.parse(JSON.stringify(rule.sendingWindow)) : undefined,
      nodes: rule.nodes ? JSON.parse(JSON.stringify(rule.nodes)) : undefined,
      edges: rule.edges ? JSON.parse(JSON.stringify(rule.edges)) : undefined,
      conditions: rule.conditions ? JSON.parse(JSON.stringify(rule.conditions)) : [],
      actions: rule.actions ? JSON.parse(JSON.stringify(rule.actions)) : [],
      isActive: false,
    };
    await onSaveRule(cloned);
  };

  const handleDelete = async (ruleId: string) => {
    if (!confirm('Are you sure you want to delete this automation rule?')) return;
    if (onDeleteRule) {
      await onDeleteRule(ruleId);
    } else {
      await fetch(`/api/automations?workspaceId=${workspace.id}&id=${ruleId}`, {
        method: 'DELETE',
      });
      window.location.reload();
    }
  };

  const handleSelectTemplate = (templateData: {
    name: string;
    description: string;
    triggerType: string;
    triggerStageId?: string;
    sequence?: any[];
    stopConditions?: any;
    sendingWindow?: any;
    nodes: VisualWorkflowNode[];
    edges: VisualWorkflowEdge[];
  }) => {
    setIsTemplatesModalOpen(false);
    const newWorkflowDraft: AutomationRule = {
      id: `rule-draft-${Date.now()}`,
      workspaceId: workspace.id,
      name: templateData.name,
      description: templateData.description,
      triggerType: templateData.triggerType as any,
      triggerStageId: templateData.triggerStageId,
      sequence: templateData.sequence,
      stopConditions: templateData.stopConditions,
      sendingWindow: templateData.sendingWindow,
      nodes: templateData.nodes,
      edges: templateData.edges,
      conditions: [],
      actions: [],
      isActive: false,
      runCount: 0,
      createdAt: new Date().toISOString(),
    };
    setSelectedWorkflowForCanvas(newWorkflowDraft);
  };

  // If canvas is open, show full canvas view
  if (selectedWorkflowForCanvas) {
    return (
      <VisualWorkflowCanvas
        workflow={selectedWorkflowForCanvas === 'new' ? undefined : selectedWorkflowForCanvas}
        stages={stages}
        pipelines={pipelines}
        templates={templates}
        leads={leads}
        members={members}
        onSave={async (rule: Partial<AutomationRule>) => {
          await onSaveRule(rule);
          setSelectedWorkflowForCanvas(null);
        }}
        onClose={() => setSelectedWorkflowForCanvas(null)}
        onTest={onTestRule}
      />
    );
  }

  return (
    <div className="space-y-6 pb-16">
      {/* Header with reveal & animated count-up tiles */}
      <HeaderReveal
        title="Workflow Automations"
        subtitle="Visual node-based triggers, stage transitions & autonomous background jobs"
        tiles={[
          {
            label: 'Total Workflows',
            numericValue: automations.length,
            badge: `${activeCount} active`,
          },
          {
            label: 'Total Executions',
            numericValue: runs.length,
            badge: 'Audit logged',
          },
          {
            label: 'Execution Success',
            numericValue: successRate,
            suffix: '%',
          },
        ]}
      />

      {/* Primary View Switcher: Workflows | Scheduled Queue | Audit History */}
      <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-3">
        <button
          type="button"
          onClick={() => setMainTab('workflows')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            mainTab === 'workflows'
              ? 'bg-[var(--ink)] text-white shadow-xs'
              : 'text-[var(--text-muted)] hover:text-[var(--text-ink)] hover:bg-[var(--bg-main)]'
          }`}
        >
          Workflows ({automations.length})
        </button>
        <button
          type="button"
          onClick={() => setMainTab('queue')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
            mainTab === 'queue'
              ? 'bg-[var(--ink)] text-white shadow-xs'
              : 'text-[var(--text-muted)] hover:text-[var(--text-ink)] hover:bg-[var(--bg-main)]'
          }`}
        >
          <span>Scheduled Queue</span>
          {scheduledJobs.filter((j) => j.status === 'pending').length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[var(--pine)] text-white">
              {scheduledJobs.filter((j) => j.status === 'pending').length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setMainTab('audit')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            mainTab === 'audit'
              ? 'bg-[var(--ink)] text-white shadow-xs'
              : 'text-[var(--text-muted)] hover:text-[var(--text-ink)] hover:bg-[var(--bg-main)]'
          }`}
        >
          Audit History ({runs.length})
        </button>
      </div>

      {mainTab === 'queue' && (
        <div className="space-y-4">
          {/* Scheduling Architecture Badge */}
          <div className="card p-4 bg-[#F4F1E9]/60 border border-[#E4E0D6] flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#376E60] animate-pulse"></span>
                <span className="font-bold text-[#252725]">Durable Automation Scheduler Active</span>
                <span className="badge badge--pine text-[10px]">Vercel Hobby 0 9 * * * & QStash Compatible</span>
              </div>
              <p className="text-[#77766F] text-[11px]">
                Jobs persist in Google Sheets / local database. Hourly & minute jobs execute via QStash delivery, in-process ticker, and daily maintenance cron at 09:00 UTC.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  setIsLoadingJobs(true);
                  try {
                    const res = await fetch('/api/automations/jobs/dispatch', { method: 'POST' });
                    const data = await res.json();
                    if (res.ok) {
                      alert(`Dispatched successfully! Processed: ${data.tickResult?.scheduledJobsProcessed ?? 0} due job(s).`);
                      await fetchScheduledJobs();
                    } else {
                      alert(data.error || 'Dispatch error');
                    }
                  } catch (e: any) {
                    alert(e.message);
                  } finally {
                    setIsLoadingJobs(false);
                  }
                }}
                disabled={isLoadingJobs}
                className="btn btn--primary text-xs flex items-center gap-1.5 whitespace-nowrap"
              >
                <span>Process Due Jobs Now</span>
              </button>
            </div>
          </div>

          <div className="card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-[var(--text-ink)]">Scheduled Multi-Step Cadence Queue</h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Pending actions waiting for execution delays and sending windows. Automatically cancelled on deal replies, meetings, or stage moves.
                </p>
              </div>
              <button
                type="button"
                onClick={fetchScheduledJobs}
                disabled={isLoadingJobs}
                className="btn btn--subtle text-xs"
              >
                {isLoadingJobs ? 'Refreshing...' : 'Refresh Queue'}
              </button>
            </div>

            <div className="overflow-x-auto pt-2">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)] font-semibold">
                    <th className="pb-2">Deal / Lead</th>
                    <th className="pb-2">Workflow Rule</th>
                    <th className="pb-2">Step</th>
                    <th className="pb-2">Action</th>
                    <th className="pb-2">Scheduled For</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {scheduledJobs.map((job) => (
                    <tr key={job.id} className="hover:bg-[var(--bg-main)]/50">
                      <td className="py-3 font-semibold text-[var(--text-ink)]">{job.dealTitle || job.leadId}</td>
                      <td className="py-3 text-[var(--text-muted)]">{job.ruleName}</td>
                      <td className="py-3 font-mono">Step {job.stepNumber}</td>
                      <td className="py-3">
                        <span className="badge badge--subtle text-[10px] uppercase font-mono">
                          {job.actionType}
                        </span>
                      </td>
                      <td className="py-3 text-[var(--text-muted)] font-mono">
                        {new Date(job.scheduledFor).toLocaleString()}
                      </td>
                      <td className="py-3">
                        <span
                          className={`badge text-[10px] ${
                            job.status === 'completed'
                              ? 'badge--pine'
                              : job.status === 'pending'
                              ? 'badge--butter'
                              : job.status === 'cancelled'
                              ? 'badge--subtle'
                              : 'badge--tomato'
                          }`}
                        >
                          {job.status}
                        </span>
                        {job.cancellationReason && (
                          <span className="block text-[10px] text-[var(--text-muted)] line-clamp-1 mt-0.5">
                            {job.cancellationReason}
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        {job.status === 'pending' && (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleTriggerJobNow(job.id)}
                              disabled={actionInProgressJobId === job.id}
                              className="btn btn--subtle text-[11px] py-1 px-2.5 text-[var(--pine)]"
                            >
                              Trigger Now
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCancelJob(job.id)}
                              disabled={actionInProgressJobId === job.id}
                              className="btn btn--subtle text-[11px] py-1 px-2 text-[var(--tomato)]"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {scheduledJobs.length === 0 && !isLoadingJobs && (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-[var(--text-muted)]">
                        No pending scheduled jobs in the queue.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {mainTab === 'audit' && (
        <div className="space-y-4">
          <div className="card p-5 space-y-3">
            <div>
              <h3 className="font-bold text-sm text-[var(--text-ink)]">Permanent Automation Run Audit Logs</h3>
              <p className="text-xs text-[var(--text-muted)]">
                Durable history surviving browser refreshes and container recycles, backed by Google Sheets and local JSON store.
              </p>
            </div>

            <div className="overflow-x-auto pt-2">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)] font-semibold">
                    <th className="pb-2">Timestamp</th>
                    <th className="pb-2">Workflow Rule</th>
                    <th className="pb-2">Deal / Lead</th>
                    <th className="pb-2">Trigger Event</th>
                    <th className="pb-2">Actions Executed</th>
                    <th className="pb-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {runs.map((r) => (
                    <tr key={r.id} className="hover:bg-[var(--bg-main)]/50">
                      <td className="py-3 text-[var(--text-muted)] font-mono">
                        {r.executedAt ? new Date(r.executedAt).toLocaleString() : 'Recent'}
                      </td>
                      <td className="py-3 font-semibold text-[var(--text-ink)]">{r.ruleName}</td>
                      <td className="py-3 text-[var(--text-muted)]">{r.dealTitle || r.leadId}</td>
                      <td className="py-3 font-mono text-[11px]">{r.triggerEvent}</td>
                      <td className="py-3">
                        <span className="text-[11px] font-medium text-[var(--text-ink)]">
                          {r.actionsExecuted?.length || 0} action(s)
                        </span>
                      </td>
                      <td className="py-3">
                        <span className={`badge text-[10px] ${r.status === 'success' ? 'badge--pine' : 'badge--tomato'}`}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {runs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-[var(--text-muted)]">
                        No automation runs recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {mainTab === 'workflows' && (
        <div className="space-y-6">
          {/* 3W PACKMARK PRIVATE LIMITED Core B2B Chemical Workflows (2x2 Bento Grid) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-[#17191A] tracking-tight">
                3W PACKMARK PRIVATE LIMITED — Core Sales Workflows
              </h2>
              <p className="text-xs text-[#6B675E] mt-0.5">
                4 deterministic stage workflows with human-readable conditions, Google Sheets persistence, and instant execution.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={isProcessingDue}
                onClick={async () => {
                  setIsProcessingDue(true);
                  try {
                    const res = await fetch('/api/automations/process-due', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        workspaceId: workspace.id,
                        forceAllPending: true,
                      }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || 'Failed to process due emails');
                    await onRefresh?.();
                    alert(`Processed ${data.processed ?? 0} due scheduled automation(s).`);
                  } catch (err: any) {
                    alert(err.message || 'Failed to run due emails');
                  } finally {
                    setIsProcessingDue(false);
                  }
                }}
                className="px-3.5 py-2 rounded-full bg-white border border-[#E6E0D6] text-[#17191A] text-xs font-semibold cursor-pointer hover:bg-[#F5F2EB] transition-colors disabled:opacity-50"
              >
                {isProcessingDue ? 'Running Due Emails...' : 'Run Due Emails Now'}
              </button>

              <MagneticButton
                onClick={() => setSelectedWorkflowForCanvas('new')}
                className="btn btn--primary text-xs"
              >
                <Plus className="w-3.5 h-3.5 text-[#F2C94C]" />
                <span>+ New Automation</span>
              </MagneticButton>
            </div>
          </div>

          {liveRunBanner && (
            <div className="rounded-2xl bg-[#FAF8F5] border border-[#E6E0D6] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="space-y-1">
                <div className="font-bold text-[#17191A] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#2F5C50]" />
                  <span>Test Run Completed: {liveRunBanner.ruleName}</span>
                  <span className="font-normal text-[#6B675E]">({liveRunBanner.leadTitle})</span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#55544E]">
                  <span>
                    <strong>Email Sent:</strong>{' '}
                    {liveRunBanner.emailSent
                      ? `Yes → ${liveRunBanner.recipientEmail}`
                      : liveRunBanner.emailSkippedReason || `No (${liveRunBanner.emailError || 'SMTP error'})`}
                  </span>
                  <span>•</span>
                  <span>
                    <strong>Task Created:</strong> {liveRunBanner.taskCreated ? 'Yes' : 'No'}
                  </span>
                  <span>•</span>
                  <span>
                    <strong>Activity Logged:</strong> {liveRunBanner.activityLogged ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLiveRunBanner(null)}
                className="px-3 py-1 rounded-full bg-white border border-[#E6E0D6] text-[11px] font-semibold text-[#55544E] cursor-pointer self-start sm:self-center"
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {b2bEmailAutomations.map((rule) => {
              const preset = B2B_CHEMICAL_AUTOMATIONS.find((p) => p.id === rule.id);
              const actionCfg = (rule.actions?.[0]?.config || {}) as Record<string, any>;
              const rawExecMode = rule.executionMode || actionCfg.emailMode || 'auto_send';
              const emailMode: 'auto_send' | 'manual_confirm' =
                rawExecMode === 'draft_only' || rawExecMode === 'manual_confirm' ? 'manual_confirm' : 'auto_send';
              const delayMinutes = rule.delayMinutes ?? 0;
              const timingLabel =
                delayMinutes === 0 ? 'Immediate' : delayMinutes === 60 ? '1 Hour' : delayMinutes === 2880 ? '2 Days' : `${delayMinutes}m`;
              const subject = actionCfg.subject || preset?.defaultSubject || '';
              const body = actionCfg.body || preset?.defaultBody || '';
              const isEditing = editingB2bId === rule.id;

              return (
                <div
                  key={rule.id}
                  className="bg-[#FAF8F5] border border-[#E6E0D6] rounded-3xl p-6 flex flex-col justify-between gap-4 transition-all"
                >
                  <div className="space-y-4">
                    {/* Header: Title + 1-line Summary + Active/Paused Toggle */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              rule.isActive ? 'bg-[#2F5C50]' : 'bg-[#B3B0A7]'
                            }`}
                          />
                          <h3 className="text-sm font-bold text-[#17191A] truncate">{rule.name}</h3>
                        </div>
                        <p className="text-xs text-[#6B675E] mt-1 leading-relaxed">{rule.description}</p>
                      </div>

                      <button
                        type="button"
                        disabled={isSavingB2b}
                        onClick={() => handleToggleB2bActive(rule)}
                        className={`px-3 py-1.5 rounded-full text-[11px] font-bold shrink-0 cursor-pointer transition-all flex items-center gap-1.5 ${
                          rule.isActive
                            ? 'bg-[#2F5C50] text-white'
                            : 'bg-[#E6E0D6] text-[#55544E]'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${rule.isActive ? 'bg-[#F2C94C]' : 'bg-[#77766F]'}`} />
                        <span>{rule.isActive ? 'Active' : 'Paused'}</span>
                      </button>
                    </div>

                    {/* 3-Step Visual Flow Pill Strip */}
                    <div className="flex flex-wrap items-center gap-1.5 p-3 rounded-2xl bg-[#F5F2EB] border border-[#E6E0D6] text-[11px]">
                      <span className="px-2.5 py-1 rounded-full bg-white border border-[#E6E0D6] font-semibold text-[#17191A]">
                        Trigger: {preset?.targetStageName || 'Stage'} ({timingLabel})
                      </span>
                      <ArrowRight className="w-3 h-3 text-[#77766F] shrink-0" />
                      <span className="px-2.5 py-1 rounded-full bg-white border border-[#E6E0D6] font-medium text-[#55544E]">
                        Condition: {preset?.conditionSummary || 'Deal is open'}
                      </span>
                      <ArrowRight className="w-3 h-3 text-[#77766F] shrink-0" />
                      <span className="px-2.5 py-1 rounded-full bg-white border border-[#E6E0D6] font-medium text-[#2F5C50]">
                        Action: {preset?.actionSummary || 'Email + Task'}
                      </span>
                    </div>

                    {/* Execution Mode Pills */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={isSavingB2b}
                          onClick={() => handleToggleB2bMode(rule, 'auto_send')}
                          className={`px-3 py-1 rounded-full text-[11px] font-semibold cursor-pointer transition-colors ${
                            emailMode === 'auto_send'
                              ? 'bg-[#17191A] text-white'
                              : 'bg-white text-[#6B675E] border border-[#E6E0D6]'
                          }`}
                        >
                          Auto-Send
                        </button>
                        <button
                          type="button"
                          disabled={isSavingB2b}
                          onClick={() => handleToggleB2bMode(rule, 'manual_confirm')}
                          className={`px-3 py-1 rounded-full text-[11px] font-semibold cursor-pointer transition-colors ${
                            emailMode === 'manual_confirm'
                              ? 'bg-[#17191A] text-white'
                              : 'bg-white text-[#6B675E] border border-[#E6E0D6]'
                          }`}
                        >
                          Create Task / Draft Only
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-[#E6E0D6] text-[11px] text-[#55544E]">
                          <span className="font-semibold text-[#6B675E]">Timing:</span>
                          <select
                            disabled={isSavingB2b}
                            value={String(delayMinutes)}
                            onChange={(e) => handleChangeB2bTiming(rule, Number(e.target.value))}
                            className="bg-transparent font-semibold text-[#17191A] focus:outline-none cursor-pointer"
                          >
                            <option value="0">Immediate</option>
                            <option value="60">1 Hour</option>
                            <option value="2880">2 Days</option>
                          </select>
                        </label>

                        <span className="text-[11px] text-[#77766F] font-medium">
                          {localRunCounts[rule.id] ?? rule.runCount ?? 0} runs
                        </span>
                      </div>
                    </div>

                    {/* Inline Email Editor (optional quick edit) */}
                    {isEditing && (
                      <div className="space-y-2.5 p-3.5 rounded-2xl bg-white border border-[#E6E0D6]">
                        <div>
                          <label className="block text-[10px] font-semibold text-[#6B675E] mb-1">
                            Email Subject
                          </label>
                          <input
                            type="text"
                            value={b2bSubjectDraft}
                            onChange={(e) => setB2bSubjectDraft(e.target.value)}
                            className="w-full p-2 rounded-xl border border-[#E6E0D6] bg-[#FAF8F5] text-xs text-[#17191A]"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-[#6B675E] mb-1">
                            Email Body (Variables: {'{{contactName}}'}, {'{{company}}'}, {'{{creditTerms}}'}, {'{{dealValue}}'})
                          </label>
                          <textarea
                            rows={4}
                            value={b2bBodyDraft}
                            onChange={(e) => setB2bBodyDraft(e.target.value)}
                            className="w-full p-2 rounded-xl border border-[#E6E0D6] bg-[#FAF8F5] text-xs font-sans text-[#17191A]"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isSavingB2b}
                            onClick={() => handleSaveB2bTemplate(rule)}
                            className="px-4 py-1.5 rounded-full bg-[#17191A] text-white text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                          >
                            {isSavingB2b ? 'Saving...' : 'Save Template'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingB2bId(null)}
                            className="px-3 py-1.5 rounded-full bg-[#F5F2EB] text-[#55544E] text-[11px] font-semibold cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Bottom Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#E6E0D6]">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedWorkflowForCanvas(rule)}
                        className="px-3.5 py-1.5 rounded-full bg-[#17191A] text-white text-[11px] font-semibold cursor-pointer hover:bg-[#2F5C50] transition-colors flex items-center gap-1.5"
                      >
                        <Sliders className="w-3 h-3 text-[#F2C94C]" />
                        <span>Edit Flow & Email</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (isEditing) {
                            setEditingB2bId(null);
                          } else {
                            setEditingB2bId(rule.id);
                            setB2bSubjectDraft(subject);
                            setB2bBodyDraft(body);
                          }
                        }}
                        className="px-3 py-1.5 rounded-full bg-white border border-[#E6E0D6] text-[#17191A] text-[11px] font-semibold cursor-pointer hover:bg-[#F5F2EB]"
                      >
                        {isEditing ? 'Close Editor' : 'Quick Edit Email'}
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={isTesting}
                      onClick={async () => {
                        setIsTesting(true);
                        setTestedRuleName(rule.name);
                        try {
                          const res = await fetch('/api/automations/run', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              workspaceId: workspace.id,
                              ruleId: rule.id,
                              leadId: leads[0]?.id,
                              mode: 'test',
                            }),
                          });
                          const data = await res.json();
                          if (!res.ok) throw new Error(data.error || 'Run failed');
                          const r = data.result;
                          if (typeof r?.runCount === 'number') {
                            setLocalRunCounts((prev) => ({ ...prev, [rule.id]: r.runCount }));
                          }
                          setLiveRunBanner({
                            ruleName: rule.name,
                            leadTitle: r?.leadTitle || 'Sample Deal',
                            emailSent: Boolean(r?.emailSent),
                            recipientEmail: r?.recipientEmail,
                            emailError: r?.emailError,
                            emailSkippedReason: r?.emailSkippedReason,
                            taskCreated: Boolean(r?.taskCreated),
                            activityLogged: Boolean(r?.activityLogged),
                          });
                          await onRefresh?.();
                        } catch (err: any) {
                          alert(err.message || 'Test run failed');
                        } finally {
                          setIsTesting(false);
                        }
                      }}
                      className="px-3 py-1.5 rounded-full bg-white border border-[#E6E0D6] text-[#2F5C50] text-[11px] font-semibold cursor-pointer hover:bg-[#F5F2EB] flex items-center gap-1"
                    >
                      <Play className="w-3 h-3" />
                      <span>Test Run</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Dry Run Test Result Modal */}
      {testResult && (
        <div className="scrim fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="card p-6 shadow-2xl max-w-md w-full space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-[var(--pine)]" />
              <h2 className="text-base font-bold text-[var(--text-ink)]">Simulation Complete</h2>
            </div>

            <div className="p-3.5 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-subtle)] space-y-2.5 text-xs">
              <p className="text-[var(--text-muted)]">
                Tested Workflow: <strong className="text-[var(--text-ink)]">{testedRuleName}</strong>
              </p>
              <p className="text-[var(--text-muted)]">
                Status:{' '}
                <strong className={testResult.conditionsPassed ? 'text-[var(--pine)]' : 'text-[var(--tomato)]'}>
                  {testResult.conditionsPassed
                    ? 'CRITERIA MET (Actions Dispatched)'
                    : 'FILTERED OUT (Conditions Not Met)'}
                </strong>
              </p>
              {testResult.log && (
                <p className="text-[var(--text-muted)] bg-[var(--bg-card)] p-2 rounded-xl font-mono text-[11px] border border-[var(--border-subtle)]">
                  {testResult.log}
                </p>
              )}
              {testResult.testLead && (
                <p className="text-[var(--text-muted)]">
                  Sample Deal: <strong className="text-[var(--text-ink)]">{testResult.testLead.title}</strong>
                </p>
              )}
            </div>

            <div className="flex justify-end">
              <MagneticButton
                onClick={() => setTestResult(null)}
                className="btn btn--primary"
              >
                Close Summary
              </MagneticButton>
            </div>
          </div>
        </div>
      )}

      {/* Templates Gallery Modal */}
      <WorkflowTemplatesModal
        isOpen={isTemplatesModalOpen}
        stages={stages}
        members={members}
        onSelectTemplate={handleSelectTemplate}
        onClose={() => setIsTemplatesModalOpen(false)}
      />

      {/* Step-by-Step History Modal */}
      <WorkflowHistoryModal
        isOpen={isHistoryModalOpen}
        rule={selectedWorkflowForHistory}
        runs={runs}
        onClose={() => {
          setIsHistoryModalOpen(false);
          setSelectedWorkflowForHistory(null);
        }}
      />
    </div>
  );
}
