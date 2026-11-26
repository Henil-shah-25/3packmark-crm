'use client';

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Flag, CheckCircle2 } from 'lucide-react';
import { WorkflowNodeData } from '@/types/crm';

export const EndNode = memo(({ data, selected }: NodeProps<any>) => {
  const nodeData = data as WorkflowNodeData;

  return (
    <div
      className={`min-w-[180px] max-w-[220px] rounded-2xl bg-[#FBFAF6] border transition-all duration-200 shadow-2xs ${
        selected
          ? 'border-[#262720] ring-2 ring-[#262720]/20'
          : 'border-[#E4E0D6] hover:border-[#262720]'
      }`}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 !bg-[#77766F] !border-2 !border-white rounded-full transition-transform hover:scale-125"
      />

      <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-[#F4F1E9] rounded-2xl border-b border-[#E4E0D6]">
        <div className="w-6 h-6 rounded-full bg-[#262720] text-white flex items-center justify-center shrink-0 shadow-xs">
          <Flag className="w-3 h-3 text-[#F0CF58]" />
        </div>
        <div>
          <span className="text-[10px] font-bold text-[#77766F] uppercase tracking-wider block">Terminal</span>
          <h4 className="text-xs font-bold text-[#262720]">{nodeData.label || 'Workflow End'}</h4>
        </div>
      </div>
    </div>
  );
});

EndNode.displayName = 'EndNode';

