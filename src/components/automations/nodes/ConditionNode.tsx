'use client';

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Split, CheckCircle2, AlertCircle } from 'lucide-react';
import { WorkflowNodeData } from '@/types/crm';

export const ConditionNode = memo(({ data, selected }: NodeProps<any>) => {
  const nodeData = data as WorkflowNodeData;
  const isRunning = nodeData.status === 'running';
  const isSuccess = nodeData.status === 'success';
  const isFailed = nodeData.status === 'failed';

  return (
    <div
      className={`min-w-[240px] max-w-[280px] rounded-2xl bg-[#FBFAF6] border transition-all duration-200 shadow-2xs ${
        selected
          ? 'border-[#F0CF58] ring-2 ring-[#F0CF58]/30'
          : isFailed
          ? 'border-[#CC5537]'
          : 'border-[#E4E0D6] hover:border-[#252725]'
      }`}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 !bg-[#77766F] !border-2 !border-white rounded-full transition-transform hover:scale-125"
      />

      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-[#F4F1E9] rounded-t-2xl border-b border-[#E4E0D6]">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-[#E5B826] text-[#252725] flex items-center justify-center shrink-0">
            <Split className="w-3 h-3" />
          </div>
          <span className="text-[10px] font-bold text-[#8A6A0B]">Condition</span>
        </div>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white border border-[#E4E0D6] text-[#55544E]">
          {nodeData.conditionLogic || 'AND'}
        </span>
      </div>

      {/* Content */}
      <div className="p-3.5 space-y-1.5">
        <h4 className="text-xs font-bold text-[#252725] line-clamp-1">{nodeData.label || 'Condition Rule'}</h4>
        <p className="text-[11px] text-[#77766F] leading-tight line-clamp-2">
          {nodeData.description || 'Branches execution based on record fields'}
        </p>

        {nodeData.conditions && nodeData.conditions.length > 0 && (
          <div className="space-y-1 pt-1">
            {nodeData.conditions.slice(0, 2).map((c, idx) => {
              const fieldLabelMap: Record<string, string> = {
                stageId: 'Stage',
                deal_status: 'Deal status',
                creditTerms: 'Credit terms',
                has_email: 'Customer email',
                has_phone: 'Customer phone',
                source: 'Lead source',
                value: 'Deal value',
                ownerId: 'Assigned rep',
                industry: 'Industry',
              };
              const opLabelMap: Record<string, string> = {
                equals: 'is',
                not_equals: 'is not',
                greater_than: 'above',
                less_than: 'below',
                contains: 'includes',
                is_not_empty: 'is present',
                is_empty: 'is empty',
              };
              const stageReadableMap: Record<string, string> = {
                'stg-inquiry': 'Inquiry',
                'stg-quotation-follow-up': 'Quotation Follow Up',
                'stg-dispatch': 'Dispatch',
                'stg-credit-follow-up': 'Credit Follow Up',
                'stg-new-lead': 'New Lead',
              };
              const rawVal = String(c.value ?? '');
              const valLabel =
                c.field === 'deal_status' && rawVal === 'open'
                  ? 'Open (Not Won/Lost)'
                  : c.field === 'has_email' || c.field === 'has_phone'
                  ? rawVal === 'true'
                    ? 'Valid & Present'
                    : 'Missing'
                  : c.field === 'stageId'
                  ? stageReadableMap[rawVal] || rawVal.replace(/^stg-/, '').replace(/-/g, ' ')
                  : rawVal;
              return (
                <div key={idx} className="text-[10px] bg-white px-2 py-1 rounded-lg border border-[#EDE8DE] text-[#44433E]">
                  <span className="font-semibold">{fieldLabelMap[c.field] || c.field}</span>{' '}
                  <span className="text-[#77766F]">{opLabelMap[c.operator] || c.operator}</span>{' '}
                  <span className="font-medium text-[#17191A]">{valLabel}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Branch Indicators & Dual Output Handles */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#F8F6F0] rounded-b-2xl border-t border-[#E4E0D6] text-[10px] font-bold">
        <div className="flex items-center gap-1 text-[#CC5537]">
          <span>✕ No</span>
        </div>
        <div className="flex items-center gap-1 text-[#376E60]">
          <span>✓ Yes</span>
        </div>
      </div>

      {/* Dual Handles: Left is No/False (Red), Right is Yes/True (Green) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="no"
        style={{ left: '25%' }}
        className="w-3 h-3 !bg-[#CC5537] !border-2 !border-white rounded-full transition-transform hover:scale-125"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="yes"
        style={{ left: '75%' }}
        className="w-3 h-3 !bg-[#376E60] !border-2 !border-white rounded-full transition-transform hover:scale-125"
      />
    </div>
  );
});

ConditionNode.displayName = 'ConditionNode';
