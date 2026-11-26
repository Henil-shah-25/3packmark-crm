'use client';

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Zap, Play, CheckCircle2, AlertCircle } from 'lucide-react';
import { WorkflowNodeData } from '@/types/crm';

export const TriggerNode = memo(({ data, selected }: NodeProps<any>) => {
  const nodeData = data as WorkflowNodeData;
  const isRunning = nodeData.status === 'running';
  const isSuccess = nodeData.status === 'success';
  const isFailed = nodeData.status === 'failed';

  return (
    <div
      className={`min-w-[220px] max-w-[260px] rounded-2xl bg-[#FBFAF6] border transition-all duration-200 shadow-2xs ${
        selected
          ? 'border-[#376E60] ring-2 ring-[#376E60]/20'
          : isFailed
          ? 'border-[#CC5537]'
          : 'border-[#E4E0D6] hover:border-[#252725]'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#F4F1E9] rounded-t-2xl border-b border-[#E4E0D6]">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-[#376E60] text-white flex items-center justify-center shrink-0">
            <Zap className="w-3 h-3" />
          </div>
          <span className="text-[10px] font-bold text-[#376E60]">Trigger</span>
        </div>
        {isRunning && <span className="w-2 h-2 rounded-full bg-[#376E60] animate-ping" />}
        {isSuccess && <CheckCircle2 className="w-3.5 h-3.5 text-[#376E60]" />}
        {isFailed && <AlertCircle className="w-3.5 h-3.5 text-[#CC5537]" />}
      </div>

      {/* Content */}
      <div className="p-3.5 space-y-1">
        <h4 className="text-xs font-bold text-[#252725] line-clamp-1">{nodeData.label || 'Select Trigger'}</h4>
        <p className="text-[11px] text-[#77766F] leading-tight line-clamp-2">
          {nodeData.description || 'Starts when configured CRM event fires'}
        </p>

        {nodeData.triggerConfig?.stageId && (
          <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-[#E4E0D6] text-[10px] font-mono text-[#55544E]">
            <span>Stage: {nodeData.triggerConfig.stageId}</span>
          </div>
        )}
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="out"
        className="w-3 h-3 !bg-[#376E60] !border-2 !border-white rounded-full transition-transform hover:scale-125"
      />
    </div>
  );
});

TriggerNode.displayName = 'TriggerNode';
