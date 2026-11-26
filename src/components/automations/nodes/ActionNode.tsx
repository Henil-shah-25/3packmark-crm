'use client';

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import {
  CheckSquare,
  ArrowRightCircle,
  Mail,
  Calendar,
  UserCheck,
  Tag,
  Bell,
  Clock,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Smartphone,
} from 'lucide-react';
import { WorkflowNodeData, ActionType } from '@/types/crm';

const ACTION_ICONS: Record<string, React.ReactNode> = {
  create_task: <CheckSquare className="w-3 h-3 text-[#376E60]" />,
  schedule_call: <CheckSquare className="w-3 h-3 text-[#376E60]" />,
  move_stage: <ArrowRightCircle className="w-3 h-3 text-[#252725]" />,
  send_email: <Mail className="w-3 h-3 text-[#252725]" />,
  send_template: <Mail className="w-3 h-3 text-[#376E60]" />,
  send_whatsapp: <MessageSquare className="w-3 h-3 text-[#25D366]" />,
  send_sms: <Smartphone className="w-3 h-3 text-[#376E60]" />,
  create_calendar_meeting: <Calendar className="w-3 h-3 text-[#376E60]" />,
  assign_owner: <UserCheck className="w-3 h-3 text-[#252725]" />,
  add_tag: <Tag className="w-3 h-3 text-[#CC5537]" />,
  notify: <Bell className="w-3 h-3 text-[#E5B826]" />,
  notify_me: <Bell className="w-3 h-3 text-[#E5B826]" />,
  wait_delay: <Clock className="w-3 h-3 text-[#77766F]" />,
};

export const ActionNode = memo(({ data, selected }: NodeProps<any>) => {
  const nodeData = data as WorkflowNodeData;
  const isRunning = nodeData.status === 'running';
  const isSuccess = nodeData.status === 'success';
  const isFailed = nodeData.status === 'failed';

  const icon = ACTION_ICONS[nodeData.actionType || ''] || <CheckSquare className="w-3 h-3 text-[#252725]" />;

  return (
    <div
      className={`min-w-[220px] max-w-[260px] rounded-2xl bg-[#FBFAF6] border transition-all duration-200 shadow-2xs ${
        selected
          ? 'border-[#252725] ring-2 ring-[#252725]/20'
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
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#F4F1E9] rounded-t-2xl border-b border-[#E4E0D6]">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-white border border-[#E4E0D6] flex items-center justify-center shrink-0">
            {icon}
          </div>
          <span className="text-[10px] font-bold text-[#252725]">Action</span>
        </div>
        {isRunning && <span className="w-2 h-2 rounded-full bg-[#376E60] animate-ping" />}
        {isSuccess && <CheckCircle2 className="w-3.5 h-3.5 text-[#376E60]" />}
        {isFailed && <AlertCircle className="w-3.5 h-3.5 text-[#CC5537]" />}
      </div>

      {/* Content */}
      <div className="p-3.5 space-y-1">
        <h4 className="text-xs font-bold text-[#252725] line-clamp-1">{nodeData.label || 'Action Step'}</h4>
        <p className="text-[11px] text-[#77766F] leading-tight line-clamp-2">
          {nodeData.description || 'Executes real CRM automation'}
        </p>

        {nodeData.actionConfig?.taskTitle && (
          <div className="text-[10px] bg-white px-2 py-1 rounded border border-[#EDE8DE] text-[#44433E] font-medium truncate">
            Task: {nodeData.actionConfig.taskTitle}
          </div>
        )}

        {nodeData.actionConfig?.stageId && (
          <div className="text-[10px] bg-white px-2 py-1 rounded border border-[#EDE8DE] text-[#44433E] font-medium truncate">
            Target: {nodeData.actionConfig.stageName || nodeData.actionConfig.stageId}
          </div>
        )}

        {nodeData.actionConfig?.enableMeet && (
          <div className="text-[10px] bg-[#EBF2EE] text-[#376E60] px-2 py-0.5 rounded-full font-semibold inline-block">
            ✓ Google Meet Active
          </div>
        )}
      </div>

      {/* Output Handle for sequential chaining */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="out"
        className="w-3 h-3 !bg-[#252725] !border-2 !border-white rounded-full transition-transform hover:scale-125"
      />
    </div>
  );
});

ActionNode.displayName = 'ActionNode';
