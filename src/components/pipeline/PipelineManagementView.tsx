'use client';

import React, { useState, useMemo } from 'react';
import {
  GitBranch,
  Plus,
  Shield,
  Lock,
  Globe,
  Users,
  Trophy,
  Layers,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Eye,
  Check,
} from 'lucide-react';
import { Pipeline, PipelineStage, Lead, TeamMember, Workspace, UserPermissions } from '@/types/crm';
import { formatCurrency } from '@/lib/financial';
import { HeaderReveal } from '@/components/ui/HeaderReveal';
import { MagneticButton } from '@/components/ui/MagneticButton';

interface PipelineManagementViewProps {
  workspace: Workspace;
  pipelines: Pipeline[];
  stages: PipelineStage[];
  leads: Lead[];
  members: TeamMember[];
  currentUser?: TeamMember | null;
  userPermissions?: UserPermissions;
  onSavePipeline: (pipeline: Pipeline) => Promise<void>;
  onNavigateToPipeline: (pipelineId: string) => void;
}

export function PipelineManagementView({
  workspace,
  pipelines,
  stages,
  leads,
  members,
  currentUser,
  userPermissions,
  onSavePipeline,
  onNavigateToPipeline,
}: PipelineManagementViewProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState('');
  const [newPipelineDesc, setNewPipelineDesc] = useState('');
  const [newPipelineVisibility, setNewPipelineVisibility] = useState<'shared' | 'private' | 'master'>('shared');
  const [selectedAllowedUserIds, setSelectedAllowedUserIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Compute stats per pipeline
  const pipelineStats = useMemo(() => {
    return pipelines.map((pipe) => {
      const pipeLeads = leads.filter((l) => l.pipelineId === pipe.id);
      const totalValue = pipeLeads.reduce((sum, l) => sum + (Number(l.value) || 0), 0);
      const wonValue = pipeLeads
        .filter((l) => l.status === 'Won' || l.stageId === 'stg-won')
        .reduce((sum, l) => sum + (Number(l.value) || 0), 0);
      const pipeStages = pipe.stages && pipe.stages.length > 0
        ? pipe.stages
        : stages.filter((s) => s.pipelineId === pipe.id);

      return {
        pipeline: pipe,
        leadsCount: pipeLeads.length,
        totalValue,
        wonValue,
        stageCount: pipeStages.length,
      };
    });
  }, [pipelines, leads, stages]);

  const totalOrgValue = useMemo(() => {
    return leads.reduce((sum, l) => sum + (Number(l.value) || 0), 0);
  }, [leads]);

  const handleCreatePipeline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPipelineName.trim()) return;

    setIsSaving(true);
    setStatusMessage(null);

    try {
      const pipeId = `pipe-${Date.now().toString(36)}`;
      const baseStages = stages.slice(0, 10).map((s, idx) => ({
        ...s,
        id: `stg-${pipeId}-${idx}`,
        pipelineId: pipeId,
        workspaceId: workspace.id,
      }));

      const newPipeline: Pipeline = {
        id: pipeId,
        workspaceId: workspace.id,
        name: newPipelineName.trim(),
        description: newPipelineDesc.trim() || undefined,
        isDefault: false,
        visibility: newPipelineVisibility,
        isMaster: newPipelineVisibility === 'master',
        allowedUserIds: newPipelineVisibility === 'private' ? selectedAllowedUserIds : undefined,
        order: pipelines.length + 1,
        stages: baseStages,
        createdAt: new Date().toISOString(),
      };

      await onSavePipeline(newPipeline);
      setStatusMessage({ type: 'success', text: `Pipeline "${newPipeline.name}" created successfully!` });
      setNewPipelineName('');
      setNewPipelineDesc('');
      setSelectedAllowedUserIds([]);
      setTimeout(() => {
        setShowCreateModal(false);
        setStatusMessage(null);
      }, 1500);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to create pipeline' });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleUserAllowance = (userId: string) => {
    setSelectedAllowedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  return (
    <div className="space-y-6 pb-16" data-view="pipeline-management">
      {/* Header */}
      <HeaderReveal
        title="Pipeline Architecture & RBAC"
        subtitle="Manage organization-wide Master Pipeline, shared team funnels, and private employee deal flows with granular role access."
        tiles={[
          {
            label: 'Configured Pipelines',
            numericValue: pipelines.length,
            badge: 'Multi-Pipeline',
          },
          {
            label: 'Total Deal Volume',
            numericValue: leads.length,
            badge: formatCurrency(totalOrgValue, workspace.currency || 'INR', { compact: true }),
          },
          {
            label: 'Authorized Team Members',
            numericValue: members.length,
          },
        ]}
      />

      {/* Action Bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)] font-medium">Access Level:</span>
          <span className="badge badge--pine text-xs font-semibold">
            {currentUser?.role === 'Owner' || userPermissions?.canViewMasterPipeline ? 'Master Admin' : currentUser?.role || 'Team Member'}
          </span>
        </div>

        {(currentUser?.role === 'Owner' || userPermissions?.canManagePipelines) && (
          <MagneticButton
            onClick={() => setShowCreateModal(true)}
            className="btn btn--primary"
          >
            <Plus className="w-4 h-4 text-[var(--butter)]" />
            <span>Create New Pipeline</span>
          </MagneticButton>
        )}
      </div>

      {/* Pipelines Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-5">
        {pipelineStats.map(({ pipeline, leadsCount, totalValue, wonValue, stageCount }) => {
          const isMaster = pipeline.isMaster || pipeline.visibility === 'master';
          const isPrivate = pipeline.visibility === 'private';

          return (
            <div
              key={pipeline.id}
              className="card p-6 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl shadow-xs space-y-4 hover:border-[var(--border-strong)] transition-all flex flex-col justify-between"
            >
              <div className="space-y-3">
                {/* Header row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-bold text-[var(--text-ink)]">
                        {pipeline.name}
                      </h3>
                      {pipeline.isDefault && (
                        <span className="badge badge--subtle text-[10px] font-bold">
                          Default
                        </span>
                      )}
                    </div>
                    {pipeline.description && (
                      <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                        {pipeline.description}
                      </p>
                    )}
                  </div>

                  {/* Visibility Badge */}
                  <span
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider border shrink-0 ${
                      isMaster
                        ? 'bg-amber-500/15 text-amber-700 border-amber-500/30'
                        : isPrivate
                        ? 'bg-purple-500/15 text-purple-700 border-purple-500/30'
                        : 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30'
                    }`}
                  >
                    {isMaster ? 'Master Pipeline' : isPrivate ? 'Private' : 'Shared'}
                  </span>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-center">
                  <div>
                    <div className="text-xs font-bold text-[var(--text-ink)]">{leadsCount}</div>
                    <div className="text-[10px] text-[var(--text-muted)]">Active Deals</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[var(--text-ink)]">
                      {formatCurrency(totalValue, workspace.currency || 'INR', { compact: true })}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)]">Pipeline Value</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-emerald-700">
                      {formatCurrency(wonValue, workspace.currency || 'INR', { compact: true })}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)]">Closed Won</div>
                  </div>
                </div>

                {/* Access scope */}
                <div className="text-xs text-[var(--text-muted)] flex items-center gap-1.5 pt-1">
                  {isMaster ? (
                    <>
                      <Shield className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Executive Master Scope — All deals consolidated</span>
                    </>
                  ) : isPrivate ? (
                    <>
                      <Lock className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                      <span>
                        Private Isolation — Restricted to authorized assigned employees
                      </span>
                    </>
                  ) : (
                    <>
                      <Globe className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Shared Collaboration — Accessible to all authorized sales reps</span>
                    </>
                  )}
                </div>
              </div>

              {/* Actions Footer */}
              <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between">
                <span className="text-[11px] text-[var(--text-muted)] font-tabular">
                  {stageCount} Pipeline Stages
                </span>
                <button
                  type="button"
                  onClick={() => onNavigateToPipeline(pipeline.id)}
                  className="btn btn--subtle text-xs py-1.5 px-3 rounded-xl inline-flex items-center gap-1 font-bold text-[var(--terracotta)] hover:bg-[var(--terracotta)]/10"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Open Pipeline &rarr;</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Role-Based Access Control (RBAC) Architecture Matrix */}
      <div className="card p-6 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[var(--pine)]" />
            <h3 className="text-sm font-bold text-[var(--text-ink)]">
              Enterprise Role-Based Access Control (RBAC) Matrix
            </h3>
          </div>
          <span className="badge badge--subtle text-xs">Security Guardrails</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-main)]">
                <th className="py-2.5 px-3 font-bold text-[var(--text-muted)]">Role</th>
                <th className="py-2.5 px-3 font-bold text-[var(--text-muted)]">Master Pipeline</th>
                <th className="py-2.5 px-3 font-bold text-[var(--text-muted)]">Shared Pipelines</th>
                <th className="py-2.5 px-3 font-bold text-[var(--text-muted)]">Private Leads Isolation</th>
                <th className="py-2.5 px-3 font-bold text-[var(--text-muted)]">Lead Assignment</th>
                <th className="py-2.5 px-3 font-bold text-[var(--text-muted)]">Automations & Rules</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              <tr>
                <td className="py-3 px-3 font-bold text-amber-700">Master Admin (Owner)</td>
                <td className="py-3 px-3 text-emerald-600 font-semibold">Full Access (All Leads)</td>
                <td className="py-3 px-3 text-emerald-600 font-semibold">Full Access</td>
                <td className="py-3 px-3 text-emerald-600 font-semibold">Unrestricted Visibility</td>
                <td className="py-3 px-3 text-emerald-600 font-semibold">Any Rep / Pipeline</td>
                <td className="py-3 px-3 text-emerald-600 font-semibold">Full Org Configuration</td>
              </tr>
              <tr>
                <td className="py-3 px-3 font-bold text-blue-700">Pipeline Manager</td>
                <td className="py-3 px-3 text-slate-400">No Access</td>
                <td className="py-3 px-3 text-emerald-600 font-semibold">Assigned Pipelines</td>
                <td className="py-3 px-3 text-emerald-600 font-semibold">Own Private Leads</td>
                <td className="py-3 px-3 text-emerald-600 font-semibold">Assigned Pipeline Scope</td>
                <td className="py-3 px-3 text-emerald-600 font-semibold">Assigned Pipelines</td>
              </tr>
              <tr>
                <td className="py-3 px-3 font-bold text-purple-700">Employee (Member)</td>
                <td className="py-3 px-3 text-slate-400">No Access</td>
                <td className="py-3 px-3 text-slate-700 font-semibold">Assigned Only</td>
                <td className="py-3 px-3 text-purple-700 font-semibold">Strict Creator Isolation</td>
                <td className="py-3 px-3 text-slate-400">No Reassignment</td>
                <td className="py-3 px-3 text-slate-400">Execution Only</td>
              </tr>
              <tr>
                <td className="py-3 px-3 font-bold text-slate-600">Viewer (Read-only)</td>
                <td className="py-3 px-3 text-slate-400">No Access</td>
                <td className="py-3 px-3 text-slate-600 font-semibold">Read-only Assigned</td>
                <td className="py-3 px-3 text-slate-400">No Access</td>
                <td className="py-3 px-3 text-slate-400">No Reassignment</td>
                <td className="py-3 px-3 text-slate-400">No Access</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Pipeline Modal */}
      {showCreateModal && (
        <div className="scrim fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="card p-6 shadow-2xl max-w-lg w-full space-y-4 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-[var(--terracotta)]" />
                <h3 className="text-sm font-bold text-[var(--text-ink)]">
                  Create Sales Pipeline
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="btn btn--subtle btn--icon w-7 h-7 text-xs"
              >
                ✕
              </button>
            </div>

            {statusMessage && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  statusMessage.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-800 border border-emerald-500/30'
                    : 'bg-rose-500/10 text-rose-800 border border-rose-500/30'
                }`}
              >
                {statusMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                )}
                <span>{statusMessage.text}</span>
              </div>
            )}

            <form onSubmit={handleCreatePipeline} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                  Pipeline Name *
                </label>
                <input
                  type="text"
                  required
                  value={newPipelineName}
                  onChange={(e) => setNewPipelineName(e.target.value)}
                  placeholder="e.g. Enterprise Inbound Pipeline"
                  className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--terracotta)] font-semibold"
                />
              </div>

              <div>
                <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={newPipelineDesc}
                  onChange={(e) => setNewPipelineDesc(e.target.value)}
                  placeholder="Briefly describe the purpose and target accounts for this pipeline"
                  className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--terracotta)]"
                />
              </div>

              <div>
                <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                  Pipeline Visibility & Isolation *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewPipelineVisibility('shared')}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      newPipelineVisibility === 'shared'
                        ? 'border-emerald-500 bg-emerald-500/10'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-main)]'
                    }`}
                  >
                    <div className="font-bold text-[var(--text-ink)] flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Shared Pipeline</span>
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)] mt-1">
                      Collaborative funnel accessible to sales team members.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewPipelineVisibility('private')}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      newPipelineVisibility === 'private'
                        ? 'border-purple-500 bg-purple-500/10'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-main)]'
                    }`}
                  >
                    <div className="font-bold text-[var(--text-ink)] flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-purple-600" />
                      <span>Private Pipeline</span>
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)] mt-1">
                      Restricted to specific employees and Master Admin.
                    </p>
                  </button>
                </div>
              </div>

              {newPipelineVisibility === 'private' && (
                <div>
                  <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                    Authorized Employees
                  </label>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto p-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)]">
                    {members.map((m) => {
                      const isChecked = selectedAllowedUserIds.includes(m.id);
                      return (
                        <div
                          key={m.id}
                          onClick={() => toggleUserAllowance(m.id)}
                          className="flex items-center justify-between p-1.5 rounded-lg hover:bg-[var(--bg-card)] cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <img
                              src={m.avatar}
                              alt={m.name}
                              className="w-5 h-5 rounded-full object-cover"
                            />
                            <span className="text-xs font-medium text-[var(--text-ink)]">
                              {m.name} ({m.role})
                            </span>
                          </div>
                          {isChecked && <Check className="w-3.5 h-3.5 text-purple-600" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn btn--subtle text-xs"
                >
                  Cancel
                </button>
                <MagneticButton
                  type="submit"
                  disabled={isSaving}
                  className="btn btn--primary text-xs py-2 px-4 rounded-xl font-bold"
                >
                  {isSaving ? 'Creating Pipeline...' : 'Create Pipeline'}
                </MagneticButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

