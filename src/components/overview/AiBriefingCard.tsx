'use client';

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Phone,
  Flame,
  Snowflake,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { Workspace, Lead } from '@/types/crm';
type AiBriefing = {
  topPriorities: any[];
  leadsGoingCold: any[];
  [key: string]: any;
};

interface AiBriefingCardProps {
  workspace: Workspace;
  leads: Lead[];
  onOpenLead: (lead: Lead) => void;
}

export function AiBriefingCard({
  workspace,
  leads,
  onOpenLead,
}: AiBriefingCardProps) {
  const [briefing, setBriefing] = useState<AiBriefing | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const loadBriefing = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/ai/briefing?workspaceId=${workspace?.id || 'ws-default'}`);
      if (res.ok) {
        const data: AiBriefing = await res.json();
        setBriefing(data);
      }
    } catch (err) {
      console.error('[AiBriefingCard] Error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBriefing();
  }, [workspace?.id]);

  const leadMap = new Map<string, Lead>();
  leads.forEach((l) => leadMap.set(l.id, l));

  return (
    <div className="w-full rounded-[32px] bg-[var(--solid)] border border-[var(--butter)]/40 p-6 shadow-xs space-y-4 transition-all">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[var(--butter)] text-[#292511] grid place-items-center shadow-xs font-bold">
            <Sparkles className="w-5 h-5 fill-current" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-base sm:text-lg text-[var(--text-ink)] tracking-tight">
                AI Sales Manager Briefing
              </h3>
              <span className="px-2.5 py-0.5 rounded-full bg-[var(--butter)] text-[#292511] font-bold text-[10px]">
                Daily Insight
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Prioritized opportunities, cold lead alerts, and pipeline momentum.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadBriefing}
            disabled={isLoading}
            className="p-2 rounded-xl bg-[var(--bg-main)] hover:bg-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-ink)] transition-all cursor-pointer disabled:opacity-50"
            title="Refresh AI Briefing"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2 rounded-xl bg-[var(--bg-main)] hover:bg-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-ink)] transition-all cursor-pointer"
            title={isExpanded ? 'Collapse Briefing' : 'Expand Briefing'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && briefing && (
        <div className="space-y-4 pt-2 border-t border-[var(--border-subtle)]/60 animate-in fade-in">
          {/* Strategic Insight Banner */}
          <div className="p-4 rounded-2xl bg-[var(--butter)]/15 border border-[var(--butter)]/30 flex items-start gap-3 text-xs">
            <TrendingUp className="w-4 h-4 text-[#8A6A0B] dark:text-[var(--butter)] shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold text-[#8A6A0B] dark:text-[var(--butter)] text-[10px]">
                Pipeline Strategic Insight
              </span>
              <p className="text-[var(--text-ink)] leading-relaxed">
                {briefing.pipelineInsight}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Column 1: Top 5 Priorities */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[var(--text-muted)] flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-[var(--tomato)]" />
                  Top 5 Leads to Contact Today
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">
                  {briefing.topPriorities.length} Opportunities
                </span>
              </div>

              {briefing.topPriorities.map((item, idx) => {
                const targetLead = leadMap.get(item.leadId);
                return (
                  <div
                    key={idx}
                    className="p-3.5 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-subtle)] hover:border-[var(--text-ink)] transition-all flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--text-ink)] truncate">
                          {item.company || item.leadName}
                        </span>
                        {item.value ? (
                          <span className="px-2 py-0.5 rounded-full bg-[var(--pine)]/15 text-[var(--pine)] text-[10px] font-bold">
                            ${item.value.toLocaleString()}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5 line-clamp-1">
                        {item.reason}
                      </p>
                    </div>

                    {targetLead && (
                      <button
                        type="button"
                        onClick={() => onOpenLead(targetLead)}
                        className="px-3 py-1.5 rounded-full bg-[var(--bg-card)] hover:bg-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-ink)] border border-[var(--border-subtle)] shrink-0 cursor-pointer flex items-center gap-1"
                      >
                        <span>Open</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}

              {briefing.topPriorities.length === 0 && (
                <div className="p-4 rounded-xl bg-[var(--bg-main)] text-center text-xs text-[var(--text-muted)]">
                  No active priorities identified today.
                </div>
              )}
            </div>

            {/* Column 2: Leads Going Cold */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[var(--text-muted)] flex items-center gap-1.5">
                  <Snowflake className="w-3.5 h-3.5 text-[var(--blueberry)]" />
                  Leads Going Cold (7+ Days Inactive)
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">
                  {briefing.leadsGoingCold.length} At Risk
                </span>
              </div>

              {briefing.leadsGoingCold.map((cold, idx) => {
                const targetLead = leadMap.get(cold.leadId);
                return (
                  <div
                    key={idx}
                    className="p-3.5 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-subtle)] hover:border-[var(--text-ink)] transition-all flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--text-ink)] truncate">
                          {cold.company || cold.leadName}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-[var(--tomato)]/15 text-[var(--tomato)] text-[10px] font-bold">
                          {cold.daysInactive}d silent
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5 line-clamp-1">
                        {cold.reengagementTip}
                      </p>
                    </div>

                    {targetLead && (
                      <button
                        type="button"
                        onClick={() => onOpenLead(targetLead)}
                        className="px-3 py-1.5 rounded-full bg-[var(--bg-card)] hover:bg-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-ink)] border border-[var(--border-subtle)] shrink-0 cursor-pointer flex items-center gap-1"
                      >
                        <span>Re-engage</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}

              {briefing.leadsGoingCold.length === 0 && (
                <div className="p-4 rounded-xl bg-[var(--bg-main)] text-center text-xs text-[var(--text-muted)]">
                  No cold leads detected. Great follow-up cadence!
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

