'use client';

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Clock, Hourglass, CheckCircle2, AlertCircle } from 'lucide-react';
import { WorkflowNodeData } from '@/types/crm';

export const DelayNode = memo(({ data, selected }: NodeProps<any>) => {
  const nodeData = data as WorkflowNodeData;
  const isRunning = nodeData.status === 'running';
  const isSuccess = nodeData.status === 'success';
  const isFailed = nodeData.status === 'failed';

  const delayConfig = nodeData.delayConfig;
  const amount = delayConfig?.delayAmount ?? 0;
  const unit = delayConfig?.delayUnit ?? 'hours';
  const durationDisplay = amount <= 0 ? 'Immediate' : `${amount} ${unit}`;
  const isBizHours = delayConfig?.respectSendingWindow;
  const isBizDays = delayConfig?.businessDaysOnly;

  return (
    <div
      className={`min-w-[220px] max-w-[260px] rounded-2xl bg-[#FBFAF6] border transition-all duration-200 shadow-2xs ${
        selected
          ? 'border-[#262720] ring-2 ring-[#262720]/20'
          : isFailed
          ? 'border-[#CC5537]'
          : 'border-[#E4E0D6] hover:border-[#262720]'
      }`}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 !bg-[#77766F] !border-2 !border-white rounded-full transition-transform hover:scale-125"
      />

      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#FAF4DF] rounded-t-2xl border-b border-[#E4E0D6]">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-[#E5B826] text-[#262720] flex items-center justify-center shrink-0">
            <Clock className="w-3 h-3 stroke-[2.5]" />
          </div>
          <span className="text-[10px] font-bold text-[#8A6A0B] uppercase tracking-wider">Delay / Wait</span>
        </div>
        {isRunning && <span className="w-2 h-2 rounded-full bg-[#E5B826] animate-ping" />}
        {isSuccess && <CheckCircle2 className="w-3.5 h-3.5 text-[#376E60]" />}
        {isFailed && <AlertCircle className="w-3.5 h-3.5 text-[#CC5537]" />}
      </div>

      {/* Content */}
      <div className="p-3.5 space-y-1.5">
        <h4 className="text-xs font-bold text-[#262720] line-clamp-1">
          {nodeData.label || (amount <= 0 ? 'Wait: Immediate' : `Wait ${amount} ${unit}`)}
        </h4>
        <p className="text-[11px] text-[#77766F] leading-tight line-clamp-2">
          {nodeData.description || (amount <= 0 ? 'Executes immediately without delay' : `Pauses execution for ${amount} ${unit} before continuing`)}
        </p>

        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <div className="text-[10px] font-mono bg-white px-2 py-0.5 rounded-full border border-[#EDE8DE] text-[#262720] font-semibold">
            ⏱ {durationDisplay}
          </div>
          {isBizHours && (
            <span className="text-[9.5px] bg-[#EBF2EE] text-[#376E60] px-2 py-0.5 rounded-full font-medium">
              Business Hours
            </span>
          )}
          {isBizDays && (
            <span className="text-[9.5px] bg-[#FAF4DF] text-[#8A6A0B] px-2 py-0.5 rounded-full font-medium">
              Weekdays Only
            </span>
          )}
        </div>
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="out"
        className="w-3 h-3 !bg-[#262720] !border-2 !border-white rounded-full transition-transform hover:scale-125"
      />
    </div>
  );
});

DelayNode.displayName = 'DelayNode';

