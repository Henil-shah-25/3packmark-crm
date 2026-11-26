'use client';

import React, { useMemo } from 'react';
import {
  X,
  Trash2,
  Copy,
  AlertCircle,
  CheckCircle2,
  Plus,
  Mail,
  CheckSquare,
  ArrowRightCircle,
  Bell,
  UserCheck,
  FileText,
  Clock,
} from 'lucide-react';
import {
  VisualWorkflowNode,
  Pipeline,
  PipelineStage,
  TeamMember,
  EmailTemplate,
  TriggerType,
  ActionType,
  AutomationCondition,
} from '@/types/crm';

interface WorkflowInspectorProps {
  node: VisualWorkflowNode | null;
  stages: PipelineStage[];
  pipelines?: Pipeline[];
  members: TeamMember[];
  templates: EmailTemplate[];
  onUpdateNode: (nodeId: string, updates: Partial<VisualWorkflowNode['data']>) => void;
  onDuplicateNode: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onClose: () => void;
}

export function WorkflowInspector({
  node,
  stages,
  pipelines = [],
  members,
  templates,
  onUpdateNode,
  onDuplicateNode,
  onDeleteNode,
  onClose,
}: WorkflowInspectorProps) {
  // Filter stages based on selected pipeline in trigger or action
  const triggerPipelineId = node?.data?.triggerConfig?.pipelineId;
  const filteredTriggerStages = useMemo(() => {
    if (!triggerPipelineId) return stages;
    return stages.filter((s) => s.pipelineId === triggerPipelineId);
  }, [stages, triggerPipelineId]);

  if (!node) return null;

  const data = node.data || ({} as any);
  const nodeCategory = data.nodeCategory || node.type || 'action';
  const isTrigger = nodeCategory === 'trigger' || node.type === 'trigger';
  const isCondition = nodeCategory === 'condition' || node.type === 'condition';
  const isDelay = nodeCategory === 'delay' || node.type === 'delay' || node.type === 'wait' || node.type === 'wait_delay';
  const isEnd = nodeCategory === 'end' || node.type === 'end';
  const isAction = !isTrigger && !isCondition && !isDelay && !isEnd;

  const handleUpdate = (fields: Partial<VisualWorkflowNode['data']>) => {
    onUpdateNode(node.id, fields);
  };

  const handleAddCondition = () => {
    const current = data.conditions || [];
    const newCond: AutomationCondition = {
      field: 'value',
      operator: 'greater_than',
      value: 10000,
      logic: 'AND',
    };
    handleUpdate({ conditions: [...current, newCond] });
  };

  const handleRemoveCondition = (index: number) => {
    const current = data.conditions || [];
    handleUpdate({ conditions: current.filter((_, i) => i !== index) });
  };

  const handleConditionChange = (index: number, updates: Partial<AutomationCondition>) => {
    const current = [...(data.conditions || [])];
    current[index] = { ...current[index], ...updates };
    handleUpdate({ conditions: current });
  };

  return (
    <div className="w-80 md:w-96 bg-[#FBFAF6] border-l border-[#E4E0D6] flex flex-col h-full shadow-lg z-20 animate-in slide-in-from-right duration-200">
      {/* Top Header */}
      <div className="p-4 border-b border-[#E4E0D6] flex items-center justify-between bg-white">
        <div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#F4F1E9] text-[#252725]">
            {(nodeCategory || 'STEP').toUpperCase()} CONFIGURATION
          </span>
          <h3 className="text-sm font-bold text-[#252725] mt-1">{data.label || 'Node Details'}</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onDuplicateNode(node.id)}
            title="Duplicate node"
            className="p-1.5 text-[#77766F] hover:text-[#252725] rounded-lg hover:bg-[#F4F1E9] cursor-pointer"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDeleteNode(node.id)}
            title="Delete node"
            className="p-1.5 text-[#77766F] hover:text-[#CC5537] rounded-lg hover:bg-[#FAF0EC] cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-[#77766F] hover:text-[#252725] rounded-lg hover:bg-[#F4F1E9] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Configuration Form Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Step Label & Description */}
        <div className="space-y-3 bg-white p-3.5 rounded-2xl border border-[#EDE8DE]">
          <div>
            <label className="text-xs font-semibold text-[#252725] block mb-1">Step Name / Label</label>
            <input
              type="text"
              value={data.label || ''}
              onChange={(e) => handleUpdate({ label: e.target.value })}
              className="w-full text-xs p-2 rounded-xl border border-[#E4E0D6] bg-[#FBFAF6] focus:bg-white focus:outline-[#376E60]"
              placeholder="e.g. Lead Enters Call Not Received"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[#252725] block mb-1">Description</label>
            <textarea
              rows={2}
              value={data.description || ''}
              onChange={(e) => handleUpdate({ description: e.target.value })}
              className="w-full text-xs p-2 rounded-xl border border-[#E4E0D6] bg-[#FBFAF6] focus:bg-white focus:outline-[#376E60]"
              placeholder="Explains what this automation step achieves"
            />
          </div>
        </div>

        {/* 1. TRIGGER CONFIGURATION */}
        {isTrigger && (
          <div className="space-y-3 bg-white p-3.5 rounded-2xl border border-[#EDE8DE]">
            <div>
              <label className="text-xs font-semibold text-[#252725] block mb-1">Trigger Event *</label>
              <select
                value={data.triggerType || 'deal_stage_changed'}
                onChange={(e) => {
                  const newType = e.target.value as TriggerType;
                  handleUpdate({
                    triggerType: newType,
                    label:
                      newType === 'deal_stage_changed'
                        ? 'Moved into a stage'
                        : newType === 'lead_created'
                        ? 'Lead created'
                        : newType === 'stage_unchanged_days'
                        ? 'Stage unchanged for N days'
                        : newType === 'meeting_booked'
                        ? 'Meeting booked'
                        : newType === 'meeting_30m_away'
                        ? 'Meeting 30 minutes away'
                        : newType === 'no_activity_days'
                        ? 'No activity for N days'
                        : newType === 'pulse_checkout_abandoned'
                        ? 'Pulse: Checkout Abandoned'
                        : newType === 'pulse_purchase_completed'
                        ? 'Pulse: Purchase Completed'
                        : newType === 'pulse_item_added_to_cart'
                        ? 'Pulse: Added to Cart'
                        : newType === 'pulse_product_viewed'
                        ? 'Pulse: Product Viewed'
                        : newType === 'pulse_page_visited'
                        ? 'Pulse: Page Visited'
                        : newType === 'pulse_form_submitted'
                        ? 'Pulse: Form Submitted'
                        : 'Trigger Event',
                  });
                }}
                className="w-full text-xs p-2 rounded-xl border border-[#E4E0D6] bg-[#FBFAF6] font-medium"
              >
                <option value="lead_created">Lead created</option>
                <option value="deal_stage_changed">Moved into a stage</option>
                <option value="stage_unchanged_days">Stage unchanged for N days</option>
                <option value="meeting_booked">Meeting booked</option>
                <option value="meeting_30m_away">Meeting 30 minutes away</option>
                <option value="no_activity_days">No activity for N days</option>
                <optgroup label="Developster Pulse (Web & Ecommerce)">
                  <option value="pulse_checkout_abandoned">Pulse: Checkout Abandoned</option>
                  <option value="pulse_purchase_completed">Pulse: Purchase Completed</option>
                  <option value="pulse_item_added_to_cart">Pulse: Added to Cart</option>
                  <option value="pulse_product_viewed">Pulse: Product Viewed</option>
                  <option value="pulse_page_visited">Pulse: Page Visited</option>
                  <option value="pulse_form_submitted">Pulse: Form Submitted</option>
                </optgroup>
              </select>
            </div>

            {/* Pipeline Selector */}
            {pipelines.length > 0 && (
              <div>
                <label className="text-xs font-semibold text-[#252725] block mb-1">Pipeline</label>
                <select
                  value={data.triggerConfig?.pipelineId || ''}
                  onChange={(e) =>
                    handleUpdate({
                      triggerConfig: { ...data.triggerConfig, pipelineId: e.target.value },
                    })
                  }
                  className="w-full text-xs p-2 rounded-xl border border-[#E4E0D6] bg-[#FBFAF6] font-medium"
                >
                  <option value="">All Pipelines</option>
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Stage Selector */}
            {(data.triggerType === 'deal_stage_changed' || data.triggerType === 'stage_unchanged_days') && (
              <div>
                <label className="text-xs font-semibold text-[#252725] block mb-1">Pipeline Stage *</label>
                <select
                  value={data.triggerConfig?.stageId || ''}
                  onChange={(e) => {
                    const stg = stages.find((s) => s.id === e.target.value);
                    handleUpdate({
                      triggerConfig: {
                        ...data.triggerConfig,
                        stageId: e.target.value,
                        stageName: stg?.name,
                      },
                    });
                  }}
                  className="w-full text-xs p-2 rounded-xl border border-[#E4E0D6] bg-[#FBFAF6] font-medium"
                >
                  <option value="">Select a Stage...</option>
                  {filteredTriggerStages.map((stg) => (
                    <option key={stg.id} value={stg.id}>
                      {stg.order}. {stg.name}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-[#77766F] mt-1">
                  Populated from your real stages (e.g. &quot;Call Not Received&quot;, &quot;15 min Meeting Booked&quot;, etc.)
                </p>
              </div>
            )}

            {/* Days input for stage_unchanged_days or no_activity_days */}
            {(data.triggerType === 'stage_unchanged_days' || data.triggerType === 'no_activity_days') && (
              <div>
                <label className="text-xs font-semibold text-[#252725] block mb-1">Number of Days (N)</label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={data.triggerConfig?.days || 7}
                  onChange={(e) =>
                    handleUpdate({
                      triggerConfig: {
                        ...data.triggerConfig,
                        days: parseInt(e.target.value, 10) || 1,
                      },
                    })
                  }
                  className="w-full text-xs p-2 rounded-xl border border-[#E4E0D6] bg-[#FBFAF6]"
                  placeholder="e.g. 7, 14, 30"
                />
              </div>
            )}
          </div>
        )}

        {/* 2. CONDITION CONFIGURATION */}
        {isCondition && (
          <div className="space-y-3 bg-white p-3.5 rounded-2xl border border-[#EDE8DE]">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[#252725]">Matching Logic</label>
              <div className="flex items-center gap-1 bg-[#F4F1E9] p-0.5 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => handleUpdate({ conditionLogic: 'AND' })}
                  className={`px-2.5 py-0.5 rounded-md font-bold text-[10px] ${
                    data.conditionLogic !== 'OR' ? 'bg-[#252725] text-white' : 'text-[#77766F]'
                  }`}
                >
                  AND
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdate({ conditionLogic: 'OR' })}
                  className={`px-2.5 py-0.5 rounded-md font-bold text-[10px] ${
                    data.conditionLogic === 'OR' ? 'bg-[#252725] text-white' : 'text-[#77766F]'
                  }`}
                >
                  OR
                </button>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              {(data.conditions || []).map((cond, idx) => (
                <div key={idx} className="p-2.5 rounded-xl bg-[#FBFAF6] border border-[#E4E0D6] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-[#77766F]">Filter #{idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveCondition(idx)}
                      className="text-[#CC5537] hover:text-[#A83D24] text-[10px] font-semibold cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={cond.field}
                      onChange={(e) => handleConditionChange(idx, { field: e.target.value })}
                      className="text-[11px] p-1.5 rounded-lg border border-[#E4E0D6] bg-white"
                    >
                      <option value="stageId">Stage is still</option>
                      <option value="deal_status">Deal status is</option>
                      <option value="creditTerms">Credit terms</option>
                      <option value="has_email">Valid customer email</option>
                      <option value="has_phone">Valid phone number</option>
                      <option value="source">Lead source</option>
                      <option value="value">Deal value (₹)</option>
                      <option value="ownerId">Assigned sales rep</option>
                      <option value="industry">Industry</option>
                    </select>

                    <select
                      value={cond.operator}
                      onChange={(e) => handleConditionChange(idx, { operator: e.target.value as any })}
                      className="text-[11px] p-1.5 rounded-lg border border-[#E4E0D6] bg-white"
                    >
                      <option value="equals">Is</option>
                      <option value="not_equals">Is not</option>
                      <option value="greater_than">Above (&gt;)</option>
                      <option value="less_than">Below (&lt;)</option>
                      <option value="contains">Contains</option>
                      <option value="is_not_empty">Is present</option>
                      <option value="is_empty">Is empty</option>
                    </select>
                  </div>

                  {cond.field === 'ownerId' ? (
                    <select
                      value={String(cond.value)}
                      onChange={(e) => handleConditionChange(idx, { value: e.target.value })}
                      className="w-full text-[11px] p-1.5 rounded-lg border border-[#E4E0D6] bg-white font-medium"
                    >
                      <option value="">Select Sales Rep...</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  ) : cond.field === 'deal_status' ? (
                    <select
                      value={String(cond.value || 'open')}
                      onChange={(e) => handleConditionChange(idx, { value: e.target.value })}
                      className="w-full text-[11px] p-1.5 rounded-lg border border-[#E4E0D6] bg-white font-medium"
                    >
                      <option value="open">Open (Not Won / Lost)</option>
                      <option value="won">Closed Won</option>
                      <option value="lost">Closed Lost</option>
                    </select>
                  ) : cond.field === 'creditTerms' ? (
                    <select
                      value={String(cond.value || 'Advance')}
                      onChange={(e) => handleConditionChange(idx, { value: e.target.value })}
                      className="w-full text-[11px] p-1.5 rounded-lg border border-[#E4E0D6] bg-white font-medium"
                    >
                      <option value="Advance">Advance</option>
                      <option value="15 Days">15 Days</option>
                      <option value="30 Days">30 Days</option>
                      <option value="45 Days">45 Days</option>
                      <option value="60 Days">60 Days</option>
                    </select>
                  ) : cond.field === 'has_email' || cond.field === 'has_phone' ? (
                    <select
                      value={String(cond.value)}
                      onChange={(e) => handleConditionChange(idx, { value: e.target.value === 'true' })}
                      className="w-full text-[11px] p-1.5 rounded-lg border border-[#E4E0D6] bg-white font-medium"
                    >
                      <option value="true">Yes (Present)</option>
                      <option value="false">No (Missing)</option>
                    </select>
                  ) : cond.field === 'stageId' ? (
                    <select
                      value={String(cond.value)}
                      onChange={(e) => handleConditionChange(idx, { value: e.target.value })}
                      className="w-full text-[11px] p-1.5 rounded-lg border border-[#E4E0D6] bg-white font-medium"
                    >
                      <option value="">Select Stage...</option>
                      {stages.map((stg) => (
                        <option key={stg.id} value={stg.id}>
                          {stg.order}. {stg.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={cond.field === 'value' ? 'number' : 'text'}
                      value={String(cond.value ?? '')}
                      onChange={(e) => handleConditionChange(idx, { value: e.target.value })}
                      className="w-full text-[11px] p-1.5 rounded-lg border border-[#E4E0D6] bg-white"
                      placeholder={cond.field === 'value' ? 'e.g. 50000' : 'Filter value...'}
                    />
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={handleAddCondition}
                className="w-full py-1.5 rounded-xl border border-dashed border-[#C4BFB2] hover:border-[#252725] text-[11px] font-semibold text-[#55544E] flex items-center justify-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Add Condition Filter (AND)</span>
              </button>
            </div>
          </div>
        )}

        {/* 2.5 DELAY / WAIT CONFIGURATION */}
        {isDelay && (
          <div className="space-y-3 bg-white p-3.5 rounded-2xl border border-[#EDE8DE]">
            <div>
              <label className="text-xs font-semibold text-[#252725] block mb-1">Delay Duration Preset</label>
              <select
                value={data.delayConfig?.preset || '1h'}
                onChange={(e) => {
                  const preset = e.target.value;
                  let amount = 1;
                  let unit: 'minutes' | 'hours' | 'days' | 'weeks' = 'hours';
                  if (preset === '1m') { amount = 1; unit = 'minutes'; }
                  else if (preset === '5m') { amount = 5; unit = 'minutes'; }
                  else if (preset === '15m') { amount = 15; unit = 'minutes'; }
                  else if (preset === '30m') { amount = 30; unit = 'minutes'; }
                  else if (preset === '1h') { amount = 1; unit = 'hours'; }
                  else if (preset === '2h') { amount = 2; unit = 'hours'; }
                  else if (preset === '6h') { amount = 6; unit = 'hours'; }
                  else if (preset === '12h') { amount = 12; unit = 'hours'; }
                  else if (preset === '24h') { amount = 24; unit = 'hours'; }
                  else if (preset === '2d') { amount = 2; unit = 'days'; }
                  else if (preset === '3d') { amount = 3; unit = 'days'; }
                  else if (preset === '7d') { amount = 7; unit = 'days'; }

                  handleUpdate({
                    delayConfig: {
                      ...data.delayConfig,
                      preset: preset as any,
                      delayAmount: amount,
                      delayUnit: unit,
                    },
                    label: preset === 'custom' || preset === 'specific_date' ? data.label : `Wait ${amount} ${unit}`,
                  });
                }}
                className="w-full text-xs p-2 rounded-xl border border-[#E4E0D6] bg-[#FBFAF6] font-medium"
              >
                <option value="1m">1 minute</option>
                <option value="5m">5 minutes</option>
                <option value="15m">15 minutes</option>
                <option value="30m">30 minutes</option>
                <option value="1h">1 hour</option>
                <option value="2h">2 hours</option>
                <option value="6h">6 hours</option>
                <option value="12h">12 hours</option>
                <option value="24h">24 hours (1 day)</option>
                <option value="2d">2 days</option>
                <option value="3d">3 days</option>
                <option value="7d">7 days (1 week)</option>
                <option value="custom">Custom duration...</option>
                <option value="specific_date">Specific date & time...</option>
              </select>
            </div>

            {/* Custom Delay Amount & Unit */}
            {data.delayConfig?.preset === 'custom' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-[#252725] block mb-1">Amount</label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={data.delayConfig?.delayAmount ?? 1}
                    onChange={(e) =>
                      handleUpdate({
                        delayConfig: {
                          ...data.delayConfig,
                          delayAmount: Math.max(1, parseInt(e.target.value, 10) || 1),
                        },
                      })
                    }
                    className="w-full text-xs p-2 rounded-xl border border-[#E4E0D6] bg-[#FBFAF6]"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#252725] block mb-1">Unit</label>
                  <select
                    value={data.delayConfig?.delayUnit ?? 'hours'}
                    onChange={(e) =>
                      handleUpdate({
                        delayConfig: {
                          ...data.delayConfig,
                          delayUnit: e.target.value as any,
                        },
                      })
                    }
                    className="w-full text-xs p-2 rounded-xl border border-[#E4E0D6] bg-[#FBFAF6]"
                  >
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                    <option value="weeks">Weeks</option>
                  </select>
                </div>
              </div>
            )}

            {/* Specific Date & Time */}
            {data.delayConfig?.preset === 'specific_date' && (
              <div>
                <label className="text-xs font-semibold text-[#252725] block mb-1">Target Execution Date</label>
                <input
                  type="datetime-local"
                  value={data.delayConfig?.specificDate || ''}
                  onChange={(e) =>
                    handleUpdate({
                      delayConfig: {
                        ...data.delayConfig,
                        specificDate: e.target.value,
                      },
                    })
                  }
                  className="w-full text-xs p-2 rounded-xl border border-[#E4E0D6] bg-[#FBFAF6]"
                />
              </div>
            )}

            {/* Constraints */}
            <div className="space-y-2 pt-1 border-t border-[#EDE8DE]">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(data.delayConfig?.respectSendingWindow ?? true)}
                  onChange={(e) =>
                    handleUpdate({
                      delayConfig: {
                        ...data.delayConfig,
                        respectSendingWindow: e.target.checked,
                      },
                    })
                  }
                  className="rounded text-[#376E60] focus:ring-[#376E60]"
                />
                <span className="text-xs text-[#252725] font-medium">Respect sending window (10 AM - 6 PM)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(data.delayConfig?.businessDaysOnly)}
                  onChange={(e) =>
                    handleUpdate({
                      delayConfig: {
                        ...data.delayConfig,
                        businessDaysOnly: e.target.checked,
                      },
                    })
                  }
                  className="rounded text-[#376E60] focus:ring-[#376E60]"
                />
                <span className="text-xs text-[#252725] font-medium">Weekdays only (skip Saturday & Sunday)</span>
              </label>
            </div>
          </div>
        )}

        {/* 2.6 TERMINAL / END NODE CONFIGURATION */}
        {isEnd && (
          <div className="p-4 rounded-2xl bg-white border border-[#EDE8DE] space-y-2">
            <h4 className="text-xs font-bold text-[#252725]">Workflow Terminal Point</h4>
            <p className="text-xs text-[#77766F] leading-relaxed">
              When an eligible deal reaches this terminal node, execution terminates cleanly. All audit logs and execution steps are permanently recorded.
            </p>
          </div>
        )}

        {/* 3. ACTION CONFIGURATION */}
        {isAction && (
          <div className="space-y-3 bg-white p-3.5 rounded-2xl border border-[#EDE8DE]">
            <div>
              <label className="text-xs font-semibold text-[#252725] block mb-1">Action Type *</label>
              <select
                value={data.actionType || 'send_template'}
                onChange={(e) => {
                  const newAction = e.target.value as ActionType;
                  handleUpdate({
                    actionType: newAction,
                    label:
                      newAction === 'send_template'
                        ? 'Send email template'
                        : newAction === 'send_email'
                        ? 'Send custom email'
                        : newAction === 'send_whatsapp'
                        ? 'Send WhatsApp message'
                        : newAction === 'send_sms'
                        ? 'Send SMS message'
                        : newAction === 'create_task'
                        ? 'Create follow-up task'
                        : newAction === 'schedule_call'
                        ? 'Schedule priority call'
                        : newAction === 'move_stage'
                        ? 'Move to another stage'
                        : newAction === 'notify_me'
                        ? 'Notify me'
                        : newAction === 'assign_owner'
                        ? 'Assign owner'
                        : newAction === 'add_note'
                        ? 'Add a note'
                        : newAction === 'add_tag'
                        ? 'Add tag'
                        : 'Action Step',
                  });
                }}
                className="w-full text-xs p-2 rounded-xl border border-[#E4E0D6] bg-[#FBFAF6] font-medium"
              >
                <option value="send_template">Send email template</option>
                <option value="send_email">Send custom email</option>
                <option value="send_whatsapp">Send WhatsApp message</option>
                <option value="send_sms">Send SMS message</option>
                <option value="create_task">Create follow-up task</option>
                <option value="schedule_call">Schedule priority call</option>
                <option value="move_stage">Move to another stage</option>
                <option value="notify_me">Notify me (In-app alert)</option>
                <option value="assign_owner">Assign owner</option>
                <option value="add_note">Add a note</option>
                <option value="add_tag">Add tag</option>
              </select>
            </div>

            {/* SEND EMAIL TEMPLATE ACTION */}
            {(data.actionType === 'send_template' || data.actionType === 'send_email') && (
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-semibold text-[#252725] block mb-1">Select Email Template *</label>
                  <select
                    value={data.actionConfig?.templateId || data.actionConfig?.emailTemplateId || ''}
                    onChange={(e) => {
                      const tpl = templates.find((t) => t.id === e.target.value);
                      handleUpdate({
                        actionConfig: {
                          ...data.actionConfig,
                          templateId: e.target.value,
                          templateName: tpl?.name,
                          emailTemplateId: e.target.value,
                        },
                        label: tpl ? `Send "${tpl.name}"` : 'Send email template',
                      });
                    }}
                    className="w-full text-xs p-2 rounded-xl border border-[#E4E0D6] bg-[#FBFAF6] font-medium"
                  >
                    <option value="">Select a template...</option>
                    {templates.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.name} ({tpl.category})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="p-2 rounded-xl bg-[#EBF2EE] text-[#376E60] text-[11px] leading-relaxed">
                  ✓ Template variables (e.g. &#123;&#123;lead.name&#125;&#125;, &#123;&#123;greeting&#125;&#125;) are resolved per lead.
                  <br />
                  ✓ Skips safely if lead has no email and logs &quot;skipped: no email&quot;.
                  <br />
                  ✓ Appears in lead Activity marked <strong>Automation</strong>.
                </div>
              </div>
            )}

            {/* CREATE CALL/FOLLOW-UP TASK ACTION */}
            {data.actionType === 'create_task' && (
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-semibold text-[#252725] block mb-1">Task Title *</label>
                  <input
                    type="text"
                    value={data.actionConfig?.taskTitle || ''}
                    onChange={(e) =>
                      handleUpdate({
                        actionConfig: { ...data.actionConfig, taskTitle: e.target.value },
                      })
                    }
                    className="w-full text-xs p-2 rounded-xl border border-[#E4E0D6] bg-[#FBFAF6]"
                    placeholder="e.g. Call back lead regarding DROS overview"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-semibold text-[#252725] block mb-1">Task Type</label>
                    <select
                      value={data.actionConfig?.taskType || 'call_back'}
                      onChange={(e) =>
                        handleUpdate({
                          actionConfig: { ...data.actionConfig, taskType: e.target.value as any },
                        })
                      }
                      className="w-full text-xs p-2 rounded-xl border border-[#E4E0D6] bg-[#FBFAF6]"
                    >
                      <option value="call_back">Call back</option>
                      <option value="follow_up">Follow up</option>
                      <option value="meeting">Meeting</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[#252725] block mb-1">Due In (Days)</label>
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={data.actionConfig?.taskDueDays || 1}
                      onChange={(e) =>
                        handleUpdate({
                          actionConfig: {
                            ...data.actionConfig,
                            taskDueDays: parseInt(e.target.value, 10) || 1,
                          },
                        })
                      }
                      className="w-full text-xs p-2 rounded-xl border border-[#E4E0D6] bg-[#FBFAF6]"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* MOVE TO ANOTHER STAGE ACTION */}
            {data.actionType === 'move_stage' && (
              <div>
                <label className="text-xs font-semibold text-[#252725] block mb-1">Target Stage *</label>
                <select
                  value={data.actionConfig?.targetStageId || data.actionConfig?.stageId || ''}
                  onChange={(e) => {
                    const stg = stages.find((s) => s.id === e.target.value);
                    handleUpdate({
                      actionConfig: {
                        ...data.actionConfig,
                        targetStageId: e.target.value,
                        targetStageName: stg?.name,
                        stageId: e.target.value,
                        stageName: stg?.name,
                      },
                      label: stg ? `Move to ${stg.name}` : 'Move to another stage',
                    });
                  }}
                  className="w-full text-xs p-2 rounded-xl border border-[#E4E0D6] bg-[#FBFAF6] font-medium"
                >
                  <option value="">Select target stage...</option>
                  {stages.map((stg) => (
                    <option key={stg.id} value={stg.id}>
                      {stg.order}. {stg.name}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-[#77766F] mt-1">
                  Protected by loop prevention (max 3 chained automations).
                </p>
              </div>
            )}

            {/* NOTIFY ME ACTION */}
            {(data.actionType === 'notify_me' || data.actionType === 'notify') && (
              <div>
                <label className="text-xs font-semibold text-[#252725] block mb-1">Notification Message *</label>
                <textarea
                  rows={2}
                  value={data.actionConfig?.message || ''}
                  onChange={(e) =>
                    handleUpdate({
                      actionConfig: { ...data.actionConfig, message: e.target.value },
                    })
                  }
                  className="w-full text-xs p-2 rounded-xl border border-[#E4E0D6] bg-[#FBFAF6]"
                  placeholder="e.g. Lead moved to Call Not Received - requires attention"
                />
              </div>
            )}

            {/* ASSIGN OWNER ACTION */}
            {data.actionType === 'assign_owner' && (
              <div>
                <label className="text-xs font-semibold text-[#252725] block mb-1">Assign To Owner *</label>
                <select
                  value={data.actionConfig?.ownerId || ''}
                  onChange={(e) => {
                    const mem = members.find((m) => m.id === e.target.value);
                    handleUpdate({
                      actionConfig: {
                        ...data.actionConfig,
                        ownerId: e.target.value,
                        ownerName: mem?.name,
                      },
                    });
                  }}
                  className="w-full text-xs p-2 rounded-xl border border-[#E4E0D6] bg-[#FBFAF6] font-medium"
                >
                  <option value="">Select Team Member...</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.role})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* ADD A NOTE ACTION */}
            {data.actionType === 'add_note' && (
              <div>
                <label className="text-xs font-semibold text-[#252725] block mb-1">Note Content *</label>
                <textarea
                  rows={3}
                  value={data.actionConfig?.noteText || ''}
                  onChange={(e) =>
                    handleUpdate({
                      actionConfig: { ...data.actionConfig, noteText: e.target.value },
                    })
                  }
                  className="w-full text-xs p-2 rounded-xl border border-[#E4E0D6] bg-[#FBFAF6]"
                  placeholder="e.g. Reached out automatically via Missed Call Follow-up template."
                />
              </div>
            )}

            {/* SEND WHATSAPP ACTION */}
            {data.actionType === 'send_whatsapp' && (
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-semibold text-[#252725] block mb-1">WhatsApp Message *</label>
                  <textarea
                    rows={4}
                    value={data.actionConfig?.message || ''}
                    onChange={(e) =>
                      handleUpdate({
                        actionConfig: { ...data.actionConfig, message: e.target.value },
                      })
                    }
                    className="w-full text-xs p-2 rounded-xl border border-[#E4E0D6] bg-[#FBFAF6]"
                    placeholder="Hi {{lead.name}}, following up on our proposal..."
                  />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-[#77766F] block mb-1">Click variable to append:</span>
                  <div className="flex flex-wrap gap-1">
                    {['{{lead.name}}', '{{lead.phone}}', '{{deal.title}}', '{{deal.value}}'].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => {
                          const curr = data.actionConfig?.message || '';
                          handleUpdate({
                            actionConfig: { ...data.actionConfig, message: curr ? `${curr} ${v}` : v },
                          });
                        }}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-[#F4F1E9] text-[#252725] hover:bg-[#E4E0D6] font-mono"
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* SEND SMS ACTION */}
            {data.actionType === 'send_sms' && (
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-semibold text-[#252725] block mb-1">SMS Message *</label>
                  <textarea
                    rows={3}
                    value={data.actionConfig?.message || ''}
                    onChange={(e) =>
                      handleUpdate({
                        actionConfig: { ...data.actionConfig, message: e.target.value },
                      })
                    }
                    className="w-full text-xs p-2 rounded-xl border border-[#E4E0D6] bg-[#FBFAF6]"
                    placeholder="Hi {{lead.name}}, quick update regarding your request..."
                  />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-[#77766F] block mb-1">Click variable to append:</span>
                  <div className="flex flex-wrap gap-1">
                    {['{{lead.name}}', '{{lead.phone}}', '{{deal.title}}'].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => {
                          const curr = data.actionConfig?.message || '';
                          handleUpdate({
                            actionConfig: { ...data.actionConfig, message: curr ? `${curr} ${v}` : v },
                          });
                        }}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-[#F4F1E9] text-[#252725] hover:bg-[#E4E0D6] font-mono"
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ADD TAG ACTION */}
            {data.actionType === 'add_tag' && (
              <div>
                <label className="text-xs font-semibold text-[#252725] block mb-1">Tag Name *</label>
                <input
                  type="text"
                  value={data.actionConfig?.tag || ''}
                  onChange={(e) =>
                    handleUpdate({
                      actionConfig: { ...data.actionConfig, tag: e.target.value },
                      label: e.target.value ? `Add tag "${e.target.value}"` : 'Add tag',
                    })
                  }
                  className="w-full text-xs p-2 rounded-xl border border-[#E4E0D6] bg-[#FBFAF6]"
                  placeholder="e.g. VIP, unresponsive, high-intent"
                />
              </div>
            )}

            {/* SCHEDULE CALL ACTION */}
            {data.actionType === 'schedule_call' && (
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-semibold text-[#252725] block mb-1">Call Purpose *</label>
                  <input
                    type="text"
                    value={data.actionConfig?.taskTitle || ''}
                    onChange={(e) =>
                      handleUpdate({
                        actionConfig: { ...data.actionConfig, taskTitle: e.target.value },
                      })
                    }
                    className="w-full text-xs p-2 rounded-xl border border-[#E4E0D6] bg-[#FBFAF6]"
                    placeholder="e.g. Priority Discovery Call"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#252725] block mb-1">Due In (Days)</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={data.actionConfig?.taskDueDays || 1}
                    onChange={(e) =>
                      handleUpdate({
                        actionConfig: { ...data.actionConfig, taskDueDays: parseInt(e.target.value, 10) || 1 },
                      })
                    }
                    className="w-full text-xs p-2 rounded-xl border border-[#E4E0D6] bg-[#FBFAF6]"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
