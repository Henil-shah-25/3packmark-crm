'use client';

import React, { useState } from 'react';
import {
  X,
  History,
  CheckCircle2,
  AlertCircle,
  Clock,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { AutomationRun, AutomationRule } from '@/types/crm';

export function WorkflowHistoryModal({
  isOpen,
  rule,
  runs,
  onRetryRun,
  onClose,
}: {
  isOpen: boolean;
  rule?: AutomationRule | null;
  runs: AutomationRun[];
  onRetryRun?: (runId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  if (!isOpen) return null;

  const relevantRuns = rule ? runs.filter((r) => r.ruleId === rule.id) : runs;

  const handleRetry = async (runId: string) => {
    if (!onRetryRun) return;
    setRetryingId(runId);
    try {
      await onRetryRun(runId);
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in-50">
      <div className="bg-[#FBFAF6] rounded-3xl border border-[#E4E0D6] shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-[#E4E0D6] flex items-center justify-between bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#252725] text-white flex items-center justify-center">
              <History className="w-4 h-4 text-[#F0CF58]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#252725]">
                {rule ? `Execution History: ${rule.name}` : 'All Automation Audit Logs'}
              </h2>
              <p className="text-xs text-[#77766F]">
                Step-by-step persistent logs saved in your Google Sheets database
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-[#F4F1E9] text-[#77766F] hover:text-[#252725]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {relevantRuns.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-[#EDE8DE] p-6">
              <Clock className="w-8 h-8 text-[#999891] mx-auto mb-2 opacity-50" />
              <h4 className="text-xs font-bold text-[#252725]">No execution logs yet</h4>
              <p className="text-[11px] text-[#77766F] mt-1 max-w-sm mx-auto">
                When a CRM event (deal creation, stage change, meeting schedule) fires, step-by-step logs will appear here.
              </p>
            </div>
          ) : (
            relevantRuns.map((run) => {
              const isExpanded = expandedRunId === run.id;
              const isSuccess = run.status === 'success';
              const isFailed = run.status === 'failed';

              return (
                <div
                  key={run.id}
                  className="bg-white rounded-2xl border border-[#EDE8DE] overflow-hidden transition-all shadow-2xs"
                >
                  <div
                    onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-[#FBFAF6]"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                          isSuccess
                            ? 'bg-[#EBF2EE] text-[#376E60]'
                            : isFailed
                            ? 'bg-[#FAF0EC] text-[#CC5537]'
                            : 'bg-[#F4F1E9] text-[#77766F]'
                        }`}
                      >
                        {isSuccess && <CheckCircle2 className="w-4 h-4" />}
                        {isFailed && <AlertCircle className="w-4 h-4" />}
                        {!isSuccess && !isFailed && <Clock className="w-4 h-4" />}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#252725]">
                            {run.dealTitle || run.leadId || run.ruleName}
                          </span>
                          <span
                            className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                              isSuccess
                                ? 'bg-[#EBF2EE] text-[#376E60]'
                                : isFailed
                                ? 'bg-[#FAF0EC] text-[#CC5537]'
                                : 'bg-[#F4F1E9] text-[#77766F]'
                            }`}
                          >
                            {run.status}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#77766F] mt-0.5 font-mono">
                          Trigger: {run.triggerEvent} • {new Date(run.executedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isFailed && onRetryRun && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRetry(run.id);
                          }}
                          disabled={retryingId === run.id}
                          className="px-2.5 py-1 rounded-full bg-[#FAF0EC] hover:bg-[#F5DFD7] text-[#CC5537] text-[10px] font-bold flex items-center gap-1"
                        >
                          <RotateCcw className={`w-3 h-3 ${retryingId === run.id ? 'animate-spin' : ''}`} />
                          <span>Retry</span>
                        </button>
                      )}
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-[#77766F]" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-[#77766F]" />
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="p-4 bg-[#F8F6F0] border-t border-[#EDE8DE] text-xs space-y-3 animate-in fade-in-50">
                      <div>
                        <span className="text-[10px] font-bold text-[#77766F]">Execution Summary:</span>
                        <p className="text-xs text-[#252725] font-medium mt-0.5">{run.log}</p>
                        {run.error && (
                          <p className="text-xs text-[#CC5537] font-semibold mt-1">Error: {run.error}</p>
                        )}
                      </div>

                      {run.steps && run.steps.length > 0 && (
                        <div className="space-y-1.5 pt-2 border-t border-[#E4E0D6]">
                          <span className="text-[10px] font-bold text-[#77766F]">Step Breakdown:</span>
                          <div className="space-y-1">
                            {run.steps.map((st, idx) => (
                              <div
                                key={idx}
                                className="flex items-start gap-2 bg-white p-2 rounded-xl border border-[#EDE8DE] text-[11px]"
                              >
                                {st.status === 'success' ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-[#376E60] shrink-0 mt-0.5" />
                                ) : st.status === 'failed' ? (
                                  <AlertCircle className="w-3.5 h-3.5 text-[#CC5537] shrink-0 mt-0.5" />
                                ) : (
                                  <Clock className="w-3.5 h-3.5 text-[#77766F] shrink-0 mt-0.5" />
                                )}
                                <div>
                                  <span className="font-bold text-[#252725]">{st.nodeLabel}: </span>
                                  <span className="text-[#55544E]">{st.detail}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
