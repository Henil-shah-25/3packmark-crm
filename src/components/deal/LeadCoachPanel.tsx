'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  RefreshCw,
  Phone,
  Mail,
  MessageSquare,
  MessageCircle,
  Copy,
  Check,
  Calendar,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  ArrowRight,
  ExternalLink,
  Flame,
  Sun,
  Snowflake,
  Plus,
} from 'lucide-react';
import { Lead, Workspace } from '@/types/crm';
type LeadCoachAdvice = {
  dos: any[];
  donts: any[];
  channelPlan: { steps: any[]; [key: string]: any };
  suggestedTasks: any[];
  questionsToAsk: any[];
  missingInfoAndRisks: any[];
  [key: string]: any;
};
import { getWhatsAppUrl } from '@/lib/phone';
import DOMPurify from 'isomorphic-dompurify';

interface LeadCoachPanelProps {
  lead: Lead;
  workspace: Workspace;
  onPrefillEmail?: (subject: string, body: string) => void;
  onRefreshLead?: () => void;
  compact?: boolean;
}

export function LeadCoachPanel({
  lead,
  workspace,
  onPrefillEmail,
  onRefreshLead,
  compact = false,
}: LeadCoachPanelProps) {
  const [advice, setAdvice] = useState<LeadCoachAdvice | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [taskCreatingIdx, setTaskCreatingIdx] = useState<number | null>(null);
  const [taskCreatedSet, setTaskCreatedSet] = useState<Set<number>>(new Set());

  const fetchAdvice = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id,
          workspaceId: workspace?.id || 'ws-default',
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to fetch coach advice.');
      }

      const data: LeadCoachAdvice = await res.json();
      setAdvice(data);
    } catch (err: any) {
      setError(err.message || 'Could not load coach recommendations.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    async function loadInitialAdvice() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/ai/coach', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leadId: lead.id,
            workspaceId: workspace?.id || 'ws-default',
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to fetch coach advice.');
        }

        const data: LeadCoachAdvice = await res.json();
        if (isMounted) setAdvice(data);
      } catch (err: any) {
        if (isMounted) setError(err.message || 'Could not load coach recommendations.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadInitialAdvice();
    return () => {
      isMounted = false;
    };
  }, [lead.id, workspace?.id]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleCreateTask = async (task: { title: string; type: any; dueOffsetDays: number }, idx: number) => {
    setTaskCreatingIdx(idx);
    try {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + (task.dueOffsetDays || 1));

      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace?.id || 'ws-default',
          leadId: lead.id,
          title: task.title,
          dealTitle: lead.title,
          type: task.type || 'call_back',
          dueDate: dueDate.toISOString().split('T')[0],
          dueAt: dueDate.toISOString(),
          priority: 'high',
          status: 'open',
          source: 'auto',
          notes: `Suggested by AI Deal Coach for ${lead.company}.`,
        }),
      });

      if (res.ok) {
        setTaskCreatedSet((prev) => new Set(prev).add(idx));
        if (onRefreshLead) onRefreshLead();
      }
    } catch (e) {
      console.error('Failed creating suggested task:', e);
    } finally {
      setTaskCreatingIdx(null);
    }
  };

  const tempBadge = advice ? (
    advice.temperature === 'hot' ? (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[var(--tomato)]/15 text-[var(--tomato)] font-bold text-[10px]">
        <Flame className="w-3 h-3 fill-current" />
        Hot Opportunity
      </span>
    ) : advice.temperature === 'warm' ? (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[var(--butter)]/40 text-[#6B5A10] dark:text-[var(--butter)] font-bold text-[10px]">
        <Sun className="w-3 h-3 fill-current" />
        Warm Lead
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[var(--blueberry)]/15 text-[var(--blueberry)] font-bold text-[10px]">
        <Snowflake className="w-3 h-3" />
        Cold Lead
      </span>
    )
  ) : null;

  return (
    <div className="space-y-4 text-xs">
      {/* Top Header Card */}
      <div className="card p-4 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] space-y-3 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[var(--butter)] text-[#252725] grid place-items-center shadow-2xs font-bold">
              <Sparkles className="w-3.5 h-3.5 fill-current" />
            </div>
            <div>
              <h4 className="font-bold text-xs text-[var(--text-ink)]">AI Deal Coach</h4>
              <p className="text-[10px] text-[var(--text-muted)]">Developster Hub Sales Manager</p>
            </div>
          </div>

          <button
            type="button"
            onClick={fetchAdvice}
            disabled={isLoading}
            className="p-1.5 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-main)] text-[var(--text-muted)] hover:text-[var(--text-ink)] transition-all cursor-pointer disabled:opacity-50"
            title="Refresh Coach Analysis"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {advice && (
          <div className="flex items-center justify-between pt-1 border-t border-[var(--border-subtle)]">
            {tempBadge}
            <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
              <span>Confidence:</span>
              <span className="font-bold text-[var(--text-ink)]">{advice.confidence}%</span>
            </div>
          </div>
        )}
      </div>

      {/* Loading Skeleton */}
      {isLoading && !advice && (
        <div className="card p-6 rounded-3xl border border-[var(--border-subtle)] text-center space-y-3 animate-pulse">
          <div className="w-8 h-8 rounded-full bg-[var(--border-subtle)] mx-auto" />
          <p className="font-semibold text-[var(--text-ink)] text-xs">Analyzing lead signals & timeline...</p>
          <p className="text-[11px] text-[var(--text-muted)]">Comparing against company knowledge and DROS playbooks.</p>
        </div>
      )}

      {/* Error state */}
      {error && !advice && (
        <div className="card p-4 rounded-2xl border border-[var(--tomato)]/40 bg-[var(--tomato)]/10 text-[var(--tomato)] space-y-2">
          <div className="flex items-center gap-1.5 font-bold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Could not load coach advice</span>
          </div>
          <p className="text-[11px]">{error}</p>
          <button
            type="button"
            onClick={fetchAdvice}
            className="text-[11px] underline font-semibold cursor-pointer"
          >
            Try again
          </button>
        </div>
      )}

      {/* Advice Cards */}
      {advice && (
        <div className="space-y-3.5">
          {/* 1. Assessment Card */}
          <div className="card p-4 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[var(--text-muted)]">
                Assessment
              </span>
              {advice.isThinData && (
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-[var(--butter)]/30 text-[#6B5A10] dark:text-[var(--butter)] font-bold">
                  Thin Data
                </span>
              )}
            </div>
            <p className="text-[11px] text-[var(--text-ink)] leading-relaxed">
              {advice.assessment}
            </p>
          </div>

          {/* 2. Next Best Action Card */}
          <div className="card p-4 rounded-3xl border border-[var(--pine)]/40 bg-[var(--pine)]/5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[var(--pine)]">
                Next Best Action
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-[var(--pine)]/30 text-[var(--pine)] font-semibold capitalize">
                {advice.nextBestAction.channel} • {advice.nextBestAction.when}
              </span>
            </div>
            <h5 className="font-bold text-xs text-[var(--text-ink)]">
              {advice.nextBestAction.what}
            </h5>
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              {advice.nextBestAction.why}
            </p>
          </div>

          {/* 3. Do's and Don'ts Card */}
          <div className="card p-4 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] space-y-3">
            <div>
              <span className="text-[10px] font-bold text-[var(--pine)] block mb-1.5">
                Do&apos;s for this lead
              </span>
              <ul className="space-y-1.5 text-[11px] text-[var(--text-ink)]">
                {advice.dos.map((d, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[var(--pine)] shrink-0 mt-0.5" />
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="pt-2 border-t border-[var(--border-subtle)]">
              <span className="text-[10px] font-bold text-[var(--tomato)] block mb-1.5">
                Don&apos;ts
              </span>
              <ul className="space-y-1.5 text-[11px] text-[var(--text-muted)]">
                {advice.donts.map((d, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-[var(--tomato)] font-bold text-xs leading-none shrink-0 mt-0.5">✕</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 4. Channel Plan & Cadence Card */}
          {advice.channelPlan && (
            <div className="card p-4 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-[var(--text-muted)]">
                  Channel Cadence Plan
                </span>
                <span className="text-[10px] text-[var(--text-muted)] italic">
                  {advice.channelPlan.stopCondition}
                </span>
              </div>
              <p className="text-[11px] font-semibold text-[var(--text-ink)]">
                {advice.channelPlan.cadence}
              </p>

              {advice.channelPlan.steps && advice.channelPlan.steps.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {advice.channelPlan.steps.map((s, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] flex items-center justify-between text-[11px]"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--text-ink)]">{s.day}:</span>
                        <span className="text-[var(--text-muted)]">{s.action}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-[var(--bg-card)] border border-[var(--border-subtle)] font-medium text-[10px]">
                        {s.channel}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 5. Draft Messages (Email, WhatsApp, SMS) */}
          {advice.draftMessages && (
            <div className="card p-4 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] space-y-3">
              <span className="text-[10px] font-bold text-[var(--text-muted)] block">
                Tailored Outreach Drafts
              </span>

              {/* Email Draft */}
              {advice.draftMessages.email && (
                <div className="p-3 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-subtle)] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs flex items-center gap-1.5 text-[var(--text-ink)]">
                      <Mail className="w-3.5 h-3.5 text-[var(--pine)]" />
                      Email Draft
                    </span>
                    <div className="flex items-center gap-1">
                      {onPrefillEmail && (
                        <button
                          type="button"
                          onClick={() =>
                            onPrefillEmail(
                              advice.draftMessages.email.subject,
                              advice.draftMessages.email.body
                            )
                          }
                          className="px-2 py-1 rounded-lg bg-[var(--pine)] text-white text-[10px] font-semibold hover:opacity-90 transition-all cursor-pointer"
                        >
                          Use as email &rarr;
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(
                            `Subject: ${advice.draftMessages.email.subject}\n\n${advice.draftMessages.email.body.replace(/<[^>]*>?/gm, '')}`,
                            'draft-email'
                          )
                        }
                        className="p-1 rounded-lg hover:bg-[var(--bg-card)] text-[var(--text-muted)] cursor-pointer"
                        title="Copy Email Text"
                      >
                        {copiedKey === 'draft-email' ? (
                          <Check className="w-3 h-3 text-[var(--pine)]" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="text-[11px] font-semibold text-[var(--text-ink)]">
                    Sub: {advice.draftMessages.email.subject}
                  </div>
                  <div
                    className="text-[10px] text-[var(--text-muted)] line-clamp-3 bg-white p-2 rounded-xl border border-[var(--border-subtle)]"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(advice.draftMessages.email.body) }}
                  />
                </div>
              )}

              {/* WhatsApp Draft */}
              {advice.draftMessages.whatsapp && (
                <div className="p-3 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-subtle)] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs flex items-center gap-1.5 text-[var(--text-ink)]">
                      <MessageSquare className="w-3.5 h-3.5 text-[#25D366]" />
                      WhatsApp Draft
                    </span>
                    <div className="flex items-center gap-1">
                      {lead.whatsappNumber || lead.phone ? (
                        <a
                          href={getWhatsAppUrl(lead.whatsappNumber || lead.phone || '', advice.draftMessages.whatsapp)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-1 rounded-lg bg-[#25D366] text-white text-[10px] font-semibold hover:opacity-90 inline-flex items-center gap-1"
                        >
                          Open WhatsApp <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleCopy(advice.draftMessages.whatsapp, 'draft-wa')}
                        className="p-1 rounded-lg hover:bg-[var(--bg-card)] text-[var(--text-muted)] cursor-pointer"
                        title="Copy WhatsApp Draft"
                      >
                        {copiedKey === 'draft-wa' ? (
                          <Check className="w-3 h-3 text-[var(--pine)]" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-[var(--text-ink)] bg-white p-2 rounded-xl border border-[var(--border-subtle)]">
                    {advice.draftMessages.whatsapp}
                  </p>
                </div>
              )}

              {/* SMS Draft */}
              {advice.draftMessages.sms && (
                <div className="p-3 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-subtle)] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs flex items-center gap-1.5 text-[var(--text-ink)]">
                      <MessageCircle className="w-3.5 h-3.5 text-[var(--blueberry)]" />
                      SMS Draft
                    </span>
                    <div className="flex items-center gap-1">
                      {lead.phone && (
                        <a
                          href={`sms:${lead.phone}?body=${encodeURIComponent(advice.draftMessages.sms)}`}
                          className="px-2 py-1 rounded-lg bg-[var(--blueberry)] text-white text-[10px] font-semibold hover:opacity-90 inline-flex items-center gap-1"
                        >
                          Open SMS <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => handleCopy(advice.draftMessages.sms, 'draft-sms')}
                        className="p-1 rounded-lg hover:bg-[var(--bg-card)] text-[var(--text-muted)] cursor-pointer"
                        title="Copy SMS Draft"
                      >
                        {copiedKey === 'draft-sms' ? (
                          <Check className="w-3 h-3 text-[var(--pine)]" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-[var(--text-ink)] bg-white p-2 rounded-xl border border-[var(--border-subtle)]">
                    {advice.draftMessages.sms}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 6. Suggested Tasks */}
          {advice.suggestedTasks && advice.suggestedTasks.length > 0 && (
            <div className="card p-4 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] space-y-2">
              <span className="text-[10px] font-bold text-[var(--text-muted)] block">
                Suggested Follow-up Tasks
              </span>
              <div className="space-y-2">
                {advice.suggestedTasks.map((t, idx) => {
                  const isDone = taskCreatedSet.has(idx);
                  const isCreating = taskCreatingIdx === idx;
                  return (
                    <div
                      key={idx}
                      className="p-2.5 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-subtle)] flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <span className="font-bold text-xs text-[var(--text-ink)] block truncate">
                          {t.title}
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)]">
                          Due in {t.dueOffsetDays} day(s) • {t.reason}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCreateTask(t, idx)}
                        disabled={isDone || isCreating}
                        className={`px-2.5 py-1 rounded-xl text-[10px] font-bold shrink-0 transition-all cursor-pointer ${
                          isDone
                            ? 'bg-[var(--pine)]/20 text-[var(--pine)] cursor-default'
                            : 'bg-[var(--solid)] hover:bg-[var(--text-ink)] text-white'
                        }`}
                      >
                        {isDone ? '✓ Created' : isCreating ? 'Adding...' : '+ Create task'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 7. Missing Info & Discovery Questions */}
          {advice.questionsToAsk && advice.questionsToAsk.length > 0 ? (
            <div className="card p-4 rounded-3xl border border-[var(--butter)]/50 bg-[var(--butter)]/10 space-y-2">
              <span className="text-[10px] font-bold text-[#6B5A10] dark:text-[var(--butter)] flex items-center gap-1">
                <HelpCircle className="w-3.5 h-3.5" />
                Ask these 3 questions on the next call:
              </span>
              <ul className="space-y-1.5 text-[11px] text-[var(--text-ink)] pt-1">
                {advice.questionsToAsk.map((q, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="font-bold text-[#6B5A10] dark:text-[var(--butter)]">{idx + 1}.</span>
                    <span>{q}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : advice.missingInfoAndRisks && advice.missingInfoAndRisks.length > 0 ? (
            <div className="card p-4 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] space-y-2">
              <span className="text-[10px] font-bold text-[var(--text-muted)] block">
                Missing Information & Deal Risks
              </span>
              <ul className="space-y-1 text-[11px] text-[var(--text-muted)]">
                {advice.missingInfoAndRisks.map((r, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="text-[var(--tomato)] font-bold">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

