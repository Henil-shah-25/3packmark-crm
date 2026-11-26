'use client';

import React, { useState, useMemo, useRef } from 'react';
import {
  Send,
  Mail,
  Plus,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Search,
  Sparkles,
  Bookmark,
  Check,
  ChevronDown,
  ChevronUp,
  RotateCw,
  Copy,
} from 'lucide-react';
import { EmailTemplate, EmailLog, Workspace, Lead } from '@/types/crm';
import { formatCurrency } from '@/lib/financial';
import { formatDateTime, formatRelativeTime } from '@/lib/dateTime';
import { HeaderReveal } from '@/components/ui/HeaderReveal';
import { MagneticButton } from '@/components/ui/MagneticButton';

interface EmailViewProps {
  workspace: Workspace;
  templates: EmailTemplate[];
  leads: Lead[];
  onSendEmail: (data: {
    leadId?: string;
    toEmail: string;
    subject: string;
    body: string;
    templateId?: string;
  }) => Promise<void>;
}

export function EmailView({ workspace, templates, leads, onSendEmail }: EmailViewProps) {
  const [showCompose, setShowCompose] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string>(leads[0]?.id || '');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [toEmail, setToEmail] = useState(leads[0]?.email || '');
  const [ccEmail, setCcEmail] = useState('');
  const [bccEmail, setBccEmail] = useState('');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [subject, setSubject] = useState('Following up: Proposal Review');
  const [body, setBody] = useState(
    'Hi {{contactName}},\n\nFollowing up on our proposal for {{company}} regarding {{title}} valued at {{value}}.\n\nBest regards,\nDevelopster Sales Team'
  );
  const [isSending, setIsSending] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sent logs history (seeded with real sample logs for audit trail)
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([
    {
      id: 'log-seed-1',
      workspaceId: workspace.id,
      leadId: leads[0]?.id,
      toEmail: leads[0]?.email || 'rajesh.varma@tcs.com',
      subject: 'Tata Consultancy Services - Cloud CRM Transformation Proposal',
      bodyPreview: 'Dear Rajesh, here is the comprehensive proposal for the Cloud CRM transformation...',
      status: 'delivered',
      sentAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    },
    {
      id: 'log-seed-2',
      workspaceId: workspace.id,
      leadId: leads[1]?.id,
      toEmail: leads[1]?.email || 'ananya.iyer@relianceretail.com',
      subject: 'Executive Demo Confirmation: Omnichannel POS Sync',
      bodyPreview: 'Hi Ananya, confirming our executive alignment demo scheduled for this week...',
      status: 'sent',
      sentAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    },
  ]);

  // Extract template categories
  const categories = useMemo(() => {
    const cats = new Set<string>(['All']);
    templates.forEach((t) => {
      if (t.category) cats.add(t.category);
    });
    return Array.from(cats);
  }, [templates]);

  // Filter templates
  const filteredTemplates = useMemo(() => {
    return templates.filter((tpl) => {
      const matchCat = selectedCategory === 'All' || tpl.category === selectedCategory;
      const q = templateSearch.toLowerCase().trim();
      const matchSearch =
        !q ||
        tpl.name.toLowerCase().includes(q) ||
        tpl.subject.toLowerCase().includes(q) ||
        tpl.body.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [templates, selectedCategory, templateSearch]);

  // Selected lead context
  const activeLead = useMemo(() => {
    return leads.find((l) => l.id === selectedLeadId) || leads[0];
  }, [leads, selectedLeadId]);

  // Apply template with lead replacement
  const handleApplyTemplate = (tpl: EmailTemplate) => {
    setSelectedTemplateId(tpl.id);
    let sub = tpl.subject;
    let txt = tpl.body;

    if (activeLead) {
      const formattedVal = formatCurrency(activeLead.value, workspace.currency || 'INR');
      sub = sub
        .replace(/{{contactName}}/g, activeLead.contactName || 'Valued Client')
        .replace(/{{company}}/g, activeLead.company || 'Enterprise')
        .replace(/{{title}}/g, activeLead.title || 'Deal')
        .replace(/{{value}}/g, formattedVal);

      txt = txt
        .replace(/{{contactName}}/g, activeLead.contactName || 'Valued Client')
        .replace(/{{company}}/g, activeLead.company || 'Enterprise')
        .replace(/{{title}}/g, activeLead.title || 'Deal')
        .replace(/{{value}}/g, formattedVal);

      if (activeLead.email) {
        setToEmail(activeLead.email);
      }
    }

    setSubject(sub);
    setBody(txt);
  };

  // Insert dynamic variable at cursor position
  const handleInsertVariable = (variableToken: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setBody((prev) => prev + variableToken);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newBody = body.substring(0, start) + variableToken + body.substring(end);
    setBody(newBody);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + variableToken.length, start + variableToken.length);
    }, 50);
  };

  // Save Draft
  const handleSaveDraft = () => {
    if (!subject.trim()) return;
    const draftLog: EmailLog = {
      id: `draft-${Date.now()}`,
      workspaceId: workspace.id,
      leadId: selectedLeadId,
      toEmail: toEmail || '(Draft - No Recipient)',
      subject: `[Draft] ${subject}`,
      bodyPreview: body.substring(0, 120),
      status: 'draft',
      sentAt: new Date().toISOString(),
    };
    setEmailLogs((prev) => [draftLog, ...prev]);
    setFeedbackMessage({ type: 'success', text: 'Email saved to drafts.' });
    setTimeout(() => setFeedbackMessage(null), 3000);
  };

  // Send Email
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!toEmail || !subject) return;

    setIsSending(true);
    setFeedbackMessage(null);

    try {
      await onSendEmail({
        leadId: selectedLeadId,
        toEmail,
        subject,
        body,
        templateId: selectedTemplateId || undefined,
      });

      setEmailLogs((prev) => [
        {
          id: `log-${Date.now()}`,
          workspaceId: workspace.id,
          leadId: selectedLeadId,
          toEmail,
          subject,
          bodyPreview: body.substring(0, 120),
          status: 'sent',
          sentAt: new Date().toISOString(),
        },
        ...prev,
      ]);

      setFeedbackMessage({ type: 'success', text: `Email dispatched successfully to ${toEmail}` });
      setTimeout(() => {
        setShowCompose(false);
        setFeedbackMessage(null);
      }, 1500);
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Failed to dispatch email' });
    } finally {
      setIsSending(false);
    }
  };

  // AI Coach Suggestions
  const coachSuggestions = [
    {
      title: 'Add Urgency & Decision Hook',
      description: 'Offer a 48-hour executive priority hold on pricing to accelerate client decision.',
      snippet: '\n\nNote: To ensure team availability for our targeted deployment date, this proposal pricing is reserved for the next 48 hours.',
    },
    {
      title: 'Actionable Call-to-Action',
      description: 'Propose a quick 15-minute alignment call with a direct scheduling link.',
      snippet: '\n\nAre you available for a brief 15-minute alignment call this Thursday at 3:00 PM IST? Let me know or reply with your preferred slot.',
    },
    {
      title: 'ROI & Value Metric Highlight',
      description: 'Emphasize guaranteed ROI and operational turnaround improvement.',
      snippet: '\n\nBased on similar deployments, our solution typically reduces deal turnaround times by 40% within the first 30 days.',
    },
  ];

  const handleApplyCoachSuggestion = (snippet: string) => {
    setBody((prev) => prev.trim() + snippet);
    setFeedbackMessage({ type: 'success', text: 'AI recommendation applied to composer!' });
    setTimeout(() => setFeedbackMessage(null), 2500);
  };

  return (
    <div className="space-y-6 pb-16" data-view="email">
      {/* Header with reveal & animated count-up tiles */}
      <HeaderReveal
        title="Email & Messaging Hub"
        subtitle="Tracked enterprise sales outreach, high-converting templates & automated follow-up dispatches"
        tiles={[
          {
            label: 'Ready Templates',
            numericValue: templates.length,
            badge: 'Personalized',
          },
          {
            label: 'Dispatches Logged',
            numericValue: emailLogs.length,
            badge: 'Tracked',
          },
          {
            label: 'Active Leads in Reach',
            numericValue: leads.filter((l) => Boolean(l.email)).length,
          },
        ]}
      />

      {/* Top Actions Bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)] font-medium">Default Timezone:</span>
          <span className="badge badge--subtle text-xs font-mono">Asia/Kolkata (IST)</span>
        </div>
        <MagneticButton
          onClick={() => {
            setShowCompose(true);
            if (activeLead?.email) setToEmail(activeLead.email);
          }}
          className="btn btn--primary"
        >
          <Send className="w-3.5 h-3.5 text-[var(--butter)]" />
          <span>Compose Email</span>
        </MagneticButton>
      </div>

      {/* Main Grid: Template Gallery, Composer & Dispatch History */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Template Gallery (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="card p-5 space-y-3.5 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl shadow-xs">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[var(--terracotta)]" />
                <h2 className="text-sm font-bold text-[var(--text-ink)]">
                  Sales Templates
                </h2>
              </div>
              <span className="text-[11px] font-bold text-[var(--text-muted)]">
                {filteredTemplates.length} of {templates.length}
              </span>
            </div>

            {/* Template Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                placeholder="Search templates..."
                className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[var(--text-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--terracotta)]"
              />
            </div>

            {/* Category Filter Chips */}
            <div className="flex flex-wrap gap-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-[var(--terracotta)] text-white shadow-xs'
                      : 'bg-[var(--bg-main)] text-[var(--text-muted)] hover:text-[var(--text-ink)] border border-[var(--border-subtle)]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Template Cards List */}
            <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
              {filteredTemplates.map((tpl) => {
                const isSelected = selectedTemplateId === tpl.id;
                return (
                  <div
                    key={tpl.id}
                    onClick={() => {
                      handleApplyTemplate(tpl);
                      setShowCompose(true);
                    }}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer group space-y-1.5 ${
                      isSelected
                        ? 'bg-[var(--bg-card)] border-[var(--terracotta)] ring-1 ring-[var(--terracotta)] shadow-xs'
                        : 'bg-[var(--bg-main)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-bold text-[var(--text-ink)] group-hover:text-[var(--terracotta)] transition-colors truncate">
                        {tpl.name}
                      </h3>
                      {tpl.category && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[var(--pine)]/10 text-[var(--pine)] shrink-0">
                          {tpl.category}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] line-clamp-2 leading-relaxed">
                      {tpl.body}
                    </p>
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex flex-wrap gap-1">
                        {tpl.variables?.slice(0, 3).map((v) => (
                          <span
                            key={v}
                            className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border-subtle)]"
                          >
                            {`{{${v}}}`}
                          </span>
                        ))}
                      </div>
                      <span className="text-[10px] font-bold text-[var(--terracotta)] group-hover:underline">
                        Apply &rarr;
                      </span>
                    </div>
                  </div>
                );
              })}

              {filteredTemplates.length === 0 && (
                <div className="py-8 text-center text-xs text-[var(--text-muted)]">
                  No templates matching your criteria.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Composer or Dispatch History & AI Coach (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Active Composer Box (always ready or expandable) */}
          <div className="card p-6 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-[var(--pine)]" />
                <h2 className="text-sm font-bold text-[var(--text-ink)]">
                  Email Composer
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {selectedTemplateId && (
                  <span className="badge badge--subtle text-[11px]">
                    Template applied
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setShowCcBcc(!showCcBcc)}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text-ink)] font-semibold cursor-pointer"
                >
                  {showCcBcc ? 'Hide CC/BCC' : 'Show CC/BCC'}
                </button>
              </div>
            </div>

            {feedbackMessage && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  feedbackMessage.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-800 border border-emerald-500/30'
                    : 'bg-rose-500/10 text-rose-800 border border-rose-500/30'
                }`}
              >
                {feedbackMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                )}
                <span>{feedbackMessage.text}</span>
              </div>
            )}

            <form onSubmit={handleSend} className="space-y-4 text-xs">
              {/* Context Selector: Target Deal */}
              <div>
                <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                  Target Deal Context
                </label>
                <select
                  value={selectedLeadId}
                  onChange={(e) => {
                    const lId = e.target.value;
                    setSelectedLeadId(lId);
                    const lead = leads.find((l) => l.id === lId);
                    if (lead?.email) setToEmail(lead.email);
                  }}
                  className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--terracotta)] font-medium"
                >
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title} — {l.company} ({formatCurrency(l.value, workspace.currency || 'INR')})
                    </option>
                  ))}
                </select>
              </div>

              {/* Recipient */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                    To *
                  </label>
                  <input
                    type="email"
                    required
                    value={toEmail}
                    onChange={(e) => setToEmail(e.target.value)}
                    placeholder="recipient@company.com"
                    className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--terracotta)] font-mono text-xs"
                  />
                </div>
                {showCcBcc && (
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                        CC
                      </label>
                      <input
                        type="email"
                        value={ccEmail}
                        onChange={(e) => setCcEmail(e.target.value)}
                        placeholder="cc@company.com"
                        className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--terracotta)] font-mono text-xs"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                        BCC
                      </label>
                      <input
                        type="email"
                        value={bccEmail}
                        onChange={(e) => setBccEmail(e.target.value)}
                        placeholder="bcc@company.com"
                        className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--terracotta)] font-mono text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Subject */}
              <div>
                <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                  Subject *
                </label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Enter email subject"
                  className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--terracotta)] font-semibold"
                />
              </div>

              {/* Dynamic Variable Insertion Chips */}
              <div>
                <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block mb-1.5">
                  Insert Variables:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: 'Contact Name', token: '{{contactName}}' },
                    { label: 'Company', token: '{{company}}' },
                    { label: 'Deal Title', token: '{{title}}' },
                    { label: 'Deal Value', token: '{{value}}' },
                  ].map((v) => (
                    <button
                      key={v.token}
                      type="button"
                      onClick={() => handleInsertVariable(v.token)}
                      className="px-2.5 py-1 rounded-lg bg-[var(--bg-main)] hover:bg-[var(--border-subtle)] border border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-ink)] cursor-pointer transition-all"
                      title={`Click to insert ${v.token}`}
                    >
                      + {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Email Body */}
              <div>
                <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                  Email Body *
                </label>
                <textarea
                  ref={textareaRef}
                  required
                  rows={6}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--terracotta)] leading-relaxed font-sans"
                />
              </div>

              {/* Actions Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  className="btn btn--subtle text-xs py-2 px-3.5 inline-flex items-center gap-1.5 rounded-xl"
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  <span>Save Draft</span>
                </button>

                <div className="flex items-center gap-2">
                  <MagneticButton
                    type="submit"
                    disabled={isSending}
                    className="btn btn--primary py-2 px-4 rounded-xl font-bold flex items-center gap-2"
                  >
                    <Send className="w-3.5 h-3.5 text-[var(--butter)]" />
                    <span>{isSending ? 'Dispatching...' : 'Send Tracked Email'}</span>
                  </MagneticButton>
                </div>
              </div>
            </form>
          </div>

          {/* AI Outreach Coach Section */}
          <div className="card p-5 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <h3 className="text-xs font-bold text-[var(--text-ink)] uppercase tracking-wider">
                  AI Outreach Coach Recommendations
                </h3>
              </div>
              <span className="badge badge--pine text-[10px]">Active</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {coachSuggestions.map((sug, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] space-y-2 flex flex-col justify-between"
                >
                  <div>
                    <h4 className="text-xs font-bold text-[var(--text-ink)]">
                      {sug.title}
                    </h4>
                    <p className="text-[11px] text-[var(--text-muted)] mt-1 leading-relaxed">
                      {sug.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleApplyCoachSuggestion(sug.snippet)}
                    className="text-[11px] font-bold text-[var(--terracotta)] hover:underline inline-flex items-center gap-1 cursor-pointer pt-1"
                  >
                    <span>+ Apply to Email</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Sent Email Delivery Logs */}
          <div className="card p-6 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[var(--text-muted)]" />
                <h2 className="text-sm font-bold text-[var(--text-ink)]">
                  Dispatch History & Delivery Logs
                </h2>
              </div>
              <span className="badge badge--subtle text-xs">
                Real IST Timestamps
              </span>
            </div>

            <div className="space-y-3">
              {emailLogs.map((log) => {
                const statusBadge =
                  log.status === 'delivered' ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30' :
                  log.status === 'sent' ? 'bg-blue-500/10 text-blue-700 border-blue-500/30' :
                  log.status === 'draft' ? 'bg-amber-500/10 text-amber-700 border-amber-500/30' :
                  'bg-rose-500/10 text-rose-700 border-rose-500/30';

                return (
                  <div
                    key={log.id}
                    className="p-4 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] flex items-start justify-between gap-4 transition-all"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0 mt-0.5">
                        <Mail className="w-4 h-4 text-[var(--pine)]" />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-xs font-bold text-[var(--text-ink)] truncate">
                            {log.subject}
                          </h4>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${statusBadge}`}>
                            {log.status}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          To: <span className="font-semibold text-[var(--text-ink)]">{log.toEmail}</span>
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)] bg-[var(--bg-card)] p-2 rounded-lg border border-[var(--border-subtle)] leading-relaxed">
                          {log.bodyPreview}
                        </p>
                      </div>
                    </div>

                    <div className="text-[10px] text-[var(--text-muted)] font-tabular shrink-0 text-right space-y-0.5">
                      <div className="font-semibold text-[var(--text-ink)]">
                        {formatDateTime(log.sentAt, { includeTimezoneName: true })}
                      </div>
                      <div className="opacity-75">
                        {formatRelativeTime(log.sentAt)}
                      </div>
                    </div>
                  </div>
                );
              })}

              {emailLogs.length === 0 && (
                <div className="py-12 text-center text-xs text-[var(--text-muted)] border border-dashed border-[var(--border-subtle)] rounded-xl bg-[var(--bg-main)]">
                  No outbound email dispatches logged yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
