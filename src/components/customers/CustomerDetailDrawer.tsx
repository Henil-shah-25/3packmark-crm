'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Building,
  Mail,
  Phone,
  MessageSquare,
  Send,
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  DollarSign,
  User,
  Plus,
  PhoneCall,
  Edit3,
  Calendar,
  AlertTriangle,
  Activity as ActivityIcon,
  Globe,
  ShoppingBag,
  ShoppingCart,
} from 'lucide-react';
import { Customer, Workspace, TeamMember } from '@/types/crm';
import {
  CommunicationTemplate,
  CustomerTimelineItem,
  CommunicationChannel,
} from '@/types/communication';
import { formatCurrency, parseFinancialNumber } from '@/lib/financial';
import { formatDateTime } from '@/lib/dateTime';
import { calculateSmsSegments, interpolateTemplateVariables } from '@/lib/communication/adapter';

interface CustomerDetailDrawerProps {
  customer: Customer | null;
  workspace: Workspace;
  currentUser?: TeamMember | null;
  onClose: () => void;
  onUpdateCustomer?: (updated: Customer) => void;
}

export function CustomerDetailDrawer({
  customer,
  workspace,
  currentUser,
  onClose,
  onUpdateCustomer,
}: CustomerDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<'timeline' | 'whatsapp' | 'sms' | 'email' | 'call' | 'note'>('timeline');
  const [timelineFilter, setTimelineFilter] = useState<'all' | 'whatsapp' | 'sms' | 'email' | 'call' | 'note' | 'pulse'>('all');
  const [timelineItems, setTimelineItems] = useState<CustomerTimelineItem[]>([]);
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(false);
  const [templates, setTemplates] = useState<CommunicationTemplate[]>([]);

  // Composer States
  const [waMessage, setWaMessage] = useState('');
  const [smsMessage, setSmsMessage] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [callOutcome, setCallOutcome] = useState('Connected');
  const [callDuration, setCallDuration] = useState('5');
  const [callNotes, setCallNotes] = useState('');
  const [noteContent, setNoteContent] = useState('');

  // Status Alerts
  const [composerFeedback, setComposerFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currency = workspace.currency || '$';

  // Load customer timeline and templates
  const loadTimeline = async () => {
    if (!customer?.id) return;
    setIsLoadingTimeline(true);
    try {
      const res = await fetch(`/api/communication/customers/${customer.id}/timeline?workspaceId=${workspace.id}`);
      if (res.ok) {
        const data = await res.json();
        setTimelineItems(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Failed to load customer timeline:', e);
    } finally {
      setIsLoadingTimeline(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const res = await fetch(`/api/communication/templates?workspaceId=${workspace.id}`);
      if (res.ok) {
        const data = await res.json();
        setTemplates(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Failed to load templates:', e);
    }
  };

  useEffect(() => {
    if (customer?.id) {
      loadTimeline();
      loadTemplates();
      setComposerFeedback(null);
      setActiveTab('timeline');
    }
  }, [customer?.id, workspace.id]);

  if (!customer) return null;

  // SMS Segment calculation
  const smsSegments = calculateSmsSegments(smsMessage);

  // Template applicator
  const applyTemplate = (template: CommunicationTemplate, channel: 'whatsapp' | 'sms' | 'email') => {
    const vars: Record<string, string> = {
      customer_name: customer.name || 'Valued Customer',
      business_name: workspace.name || 'Developster',
      employee_name: currentUser?.name || 'Customer Support',
      order_id: `ORD-${Date.now().toString().slice(-5)}`,
    };

    const interpolatedContent = interpolateTemplateVariables(template.content, vars);

    if (channel === 'whatsapp') {
      setWaMessage(interpolatedContent);
    } else if (channel === 'sms') {
      setSmsMessage(interpolatedContent);
    } else if (channel === 'email') {
      setEmailBody(interpolatedContent);
      if (template.subject) {
        setEmailSubject(interpolateTemplateVariables(template.subject, vars));
      }
    }
  };

  // Submit WhatsApp message
  const handleSaveWhatsApp = async (asDraftOnly: boolean) => {
    if (!waMessage.trim()) return;
    setIsSubmitting(true);
    setComposerFeedback(null);

    try {
      const res = await fetch('/api/communication/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace.id,
          customerId: customer.id,
          channel: 'whatsapp',
          recipient: customer.phone || 'Unknown Phone',
          content: waMessage,
          status: asDraftOnly ? 'draft' : 'send',
        }),
      });

      const data = await res.json();

      if (asDraftOnly) {
        setComposerFeedback({
          type: 'success',
          message: 'WhatsApp draft saved successfully in customer communication history.',
        });
      } else {
        // Not draft: Provider is not yet connected
        setComposerFeedback({
          type: 'warning',
          message: data.warning || 'WhatsApp provider (MSG91) is not connected yet. Message saved as draft.',
        });
      }

      setWaMessage('');
      await loadTimeline();
    } catch (err: any) {
      setComposerFeedback({
        type: 'error',
        message: err.message || 'Failed to save WhatsApp message.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit SMS message
  const handleSaveSms = async (asDraftOnly: boolean) => {
    if (!smsMessage.trim()) return;
    setIsSubmitting(true);
    setComposerFeedback(null);

    try {
      const res = await fetch('/api/communication/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace.id,
          customerId: customer.id,
          channel: 'sms',
          recipient: customer.phone || 'Unknown Phone',
          content: smsMessage,
          status: asDraftOnly ? 'draft' : 'send',
        }),
      });

      const data = await res.json();

      if (asDraftOnly) {
        setComposerFeedback({
          type: 'success',
          message: 'SMS draft saved successfully in customer communication history.',
        });
      } else {
        setComposerFeedback({
          type: 'warning',
          message: data.warning || 'SMS provider (MSG91) is not connected yet. Message saved as draft.',
        });
      }

      setSmsMessage('');
      await loadTimeline();
    } catch (err: any) {
      setComposerFeedback({
        type: 'error',
        message: err.message || 'Failed to process SMS message.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Email message
  const handleSendEmail = async () => {
    if (!emailBody.trim()) return;
    setIsSubmitting(true);
    setComposerFeedback(null);

    try {
      const res = await fetch('/api/communication/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace.id,
          customerId: customer.id,
          channel: 'email',
          recipient: customer.email || '',
          subject: emailSubject || `Message from ${workspace.name}`,
          content: emailBody,
          status: 'send',
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setComposerFeedback({
          type: 'success',
          message: 'Email dispatched via SMTP successfully and logged in history.',
        });
        setEmailSubject('');
        setEmailBody('');
        await loadTimeline();
      } else {
        setComposerFeedback({
          type: 'error',
          message: data.error || 'Failed to dispatch email. Please check SMTP configuration.',
        });
        await loadTimeline();
      }
    } catch (err: any) {
      setComposerFeedback({
        type: 'error',
        message: err.message || 'Network error sending email.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Log Call
  const handleLogCall = async () => {
    if (!callNotes.trim()) return;
    setIsSubmitting(true);
    setComposerFeedback(null);

    try {
      const res = await fetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace.id,
          leadId: customer.id,
          type: 'call',
          title: `Call (${callOutcome}) - ${callDuration} mins`,
          description: callNotes,
          authorName: currentUser?.name || 'Agent',
          metadata: {
            customerId: customer.id,
            durationMinutes: callDuration,
            outcome: callOutcome,
          },
        }),
      });

      if (res.ok) {
        setComposerFeedback({
          type: 'success',
          message: 'Call activity logged successfully.',
        });
        setCallNotes('');
        await loadTimeline();
      } else {
        throw new Error('Failed to log call');
      }
    } catch (err: any) {
      setComposerFeedback({
        type: 'error',
        message: err.message || 'Error logging call.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Log Note
  const handleLogNote = async () => {
    if (!noteContent.trim()) return;
    setIsSubmitting(true);
    setComposerFeedback(null);

    try {
      const res = await fetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace.id,
          leadId: customer.id,
          type: 'note',
          title: 'Customer Note',
          description: noteContent,
          authorName: currentUser?.name || 'Agent',
          metadata: {
            customerId: customer.id,
          },
        }),
      });

      if (res.ok) {
        setComposerFeedback({
          type: 'success',
          message: 'Note saved successfully.',
        });
        setNoteContent('');
        await loadTimeline();
      } else {
        throw new Error('Failed to save note');
      }
    } catch (err: any) {
      setComposerFeedback({
        type: 'error',
        message: err.message || 'Error saving note.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredTimeline = timelineItems.filter((item) => {
    if (timelineFilter === 'all') return true;
    if (timelineFilter === 'pulse') {
      return (
        item.type === 'website_visit' ||
        item.type === 'product_view' ||
        item.type === 'cart_activity' ||
        item.type === 'checkout' ||
        item.type === 'purchase' ||
        item.type === 'form_submission' ||
        item.title?.startsWith('[Pulse]')
      );
    }
    return item.type === timelineFilter;
  });

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-[var(--bg-card)] border-l border-[var(--border-subtle)] shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="p-5 border-b border-[var(--border-subtle)] flex items-start justify-between bg-[var(--bg-main)]">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-[var(--border-subtle)]/30 border border-[var(--border-subtle)] text-[var(--text-ink)] flex items-center justify-center font-black text-lg shrink-0">
              {(customer.company || customer.name || 'C').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-[var(--text-ink)] tracking-tight truncate">
                  {customer.company}
                </h2>
                <span className="badge badge--pine text-[11px] py-0.5 px-2">
                  {customer.status || 'Active'}
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] truncate flex items-center gap-2 mt-0.5">
                <span>{customer.name}</span>
                <span>•</span>
                <span>LTV: {formatCurrency(customer.totalRevenue, currency)}</span>
                <span>•</span>
                <span>{parseFinancialNumber(customer.dealsCount, 1)} Deals</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-ink)] hover:bg-[var(--border-subtle)]/40 transition-colors"
            title="Close customer profile"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Toolbar */}
        <div className="p-3 bg-[var(--bg-card)] border-b border-[var(--border-subtle)] flex items-center gap-2 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('timeline')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'timeline'
                ? 'bg-[var(--text-ink)] text-[var(--bg-card)] shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-ink)] hover:bg-[var(--border-subtle)]/30'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Timeline</span>
          </button>

          <button
            onClick={() => { setActiveTab('whatsapp'); setComposerFeedback(null); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'whatsapp'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-emerald-600 hover:bg-emerald-500/10'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>WhatsApp</span>
          </button>

          <button
            onClick={() => { setActiveTab('sms'); setComposerFeedback(null); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'sms'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'text-sky-600 hover:bg-sky-500/10'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>SMS</span>
          </button>

          <button
            onClick={() => { setActiveTab('email'); setComposerFeedback(null); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'email'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-indigo-600 hover:bg-indigo-500/10'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Email</span>
          </button>

          <button
            onClick={() => { setActiveTab('call'); setComposerFeedback(null); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'call'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-amber-600 hover:bg-amber-500/10'
            }`}
          >
            <PhoneCall className="w-3.5 h-3.5" />
            <span>Log Call</span>
          </button>

          <button
            onClick={() => { setActiveTab('note'); setComposerFeedback(null); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'note'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-purple-600 hover:bg-purple-500/10'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Add Note</span>
          </button>
        </div>

        {/* Body Area */}
        <div className="flex-1 overflow-y-auto p-5">
          {composerFeedback && (
            <div
              className={`mb-4 p-3.5 rounded-2xl border text-xs flex items-start gap-2.5 animate-in fade-in ${
                composerFeedback.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                  : composerFeedback.type === 'warning'
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
              }`}
            >
              {composerFeedback.type === 'success' ? (
                <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
              ) : composerFeedback.type === 'warning' ? (
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 font-medium">{composerFeedback.message}</div>
            </div>
          )}

          {/* 1. WHATSAPP COMPOSER */}
          {activeTab === 'whatsapp' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">WhatsApp Provider (MSG91) Pending:</span>
                  <p className="mt-0.5 opacity-90">
                    The external messaging provider is not connected yet. Messages can be composed, interpolated with variables, and saved as drafts without pretending live delivery occurred.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">Customer</label>
                  <input
                    type="text"
                    disabled
                    value={customer.name}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[var(--text-ink)] text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">WhatsApp Phone</label>
                  <input
                    type="text"
                    disabled
                    value={customer.phone || 'No phone number available'}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[var(--text-ink)] text-xs font-mono"
                  />
                </div>
              </div>

              {/* Template Quick Selector */}
              {templates.filter((t) => t.channel === 'whatsapp').length > 0 && (
                <div>
                  <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1.5">
                    Insert WhatsApp Template
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {templates
                      .filter((t) => t.channel === 'whatsapp')
                      .map((tmpl) => (
                        <button
                          key={tmpl.id}
                          type="button"
                          onClick={() => applyTemplate(tmpl, 'whatsapp')}
                          className="px-2.5 py-1 rounded-lg bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-ink)] hover:border-emerald-500 transition-colors"
                        >
                          {tmpl.name}
                        </button>
                      ))}
                  </div>
                </div>
              )}

              <div>
                <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">
                  Message Content
                </label>
                <textarea
                  rows={5}
                  value={waMessage}
                  onChange={(e) => setWaMessage(e.target.value)}
                  placeholder="Type your WhatsApp message or select a template..."
                  className="w-full p-3 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-ink)] focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] text-[var(--text-muted)]">
                  {waMessage.length} characters
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isSubmitting || !waMessage.trim()}
                    onClick={() => handleSaveWhatsApp(true)}
                    className="btn btn--subtle text-xs py-2 px-3.5 rounded-xl"
                  >
                    Save as Draft
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting || !waMessage.trim()}
                    onClick={() => handleSaveWhatsApp(false)}
                    className="btn btn--primary text-xs py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    Send (Test Provider)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 2. SMS COMPOSER */}
          {activeTab === 'sms' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">SMS Provider (MSG91 / DLT) Pending:</span>
                  <p className="mt-0.5 opacity-90">
                    External SMS gateway is reserved for future integration. Character counts, multi-part GSM segments, and drafts are fully supported.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">Customer</label>
                  <input
                    type="text"
                    disabled
                    value={customer.name}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[var(--text-ink)] text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">Phone Number</label>
                  <input
                    type="text"
                    disabled
                    value={customer.phone || 'No phone number available'}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[var(--text-ink)] text-xs font-mono"
                  />
                </div>
              </div>

              {/* Template Quick Selector */}
              {templates.filter((t) => t.channel === 'sms').length > 0 && (
                <div>
                  <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1.5">
                    Insert SMS Template
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {templates
                      .filter((t) => t.channel === 'sms')
                      .map((tmpl) => (
                        <button
                          key={tmpl.id}
                          type="button"
                          onClick={() => applyTemplate(tmpl, 'sms')}
                          className="px-2.5 py-1 rounded-lg bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-ink)] hover:border-sky-500 transition-colors"
                        >
                          {tmpl.name}
                        </button>
                      ))}
                  </div>
                </div>
              )}

              <div>
                <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">
                  SMS Text
                </label>
                <textarea
                  rows={4}
                  value={smsMessage}
                  onChange={(e) => setSmsMessage(e.target.value)}
                  placeholder="Type SMS message..."
                  className="w-full p-3 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-ink)] focus:outline-none focus:border-sky-500 transition-colors"
                />
              </div>

              {/* Segment & Character Counter */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-xs">
                <div className="text-[var(--text-muted)]">
                  <span>Characters: <strong className="text-[var(--text-ink)] font-tabular">{smsSegments.charCount}</strong></span>
                  <span className="mx-2">•</span>
                  <span>Segments: <strong className="text-[var(--text-ink)] font-tabular">{smsSegments.segmentCount}</strong></span>
                  <span className="mx-2">•</span>
                  <span>Encoding: <strong className="text-[var(--text-ink)]">{smsSegments.isUnicode ? 'Unicode (UCS-2)' : 'Standard GSM-7'}</strong></span>
                </div>
                <span className="text-[11px] text-[var(--text-muted)] font-tabular">
                  {smsSegments.charsRemaining} chars left in segment
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isSubmitting || !smsMessage.trim()}
                  onClick={() => handleSaveSms(true)}
                  className="btn btn--subtle text-xs py-2 px-3.5 rounded-xl"
                >
                  Save as Draft
                </button>
                <button
                  type="button"
                  disabled={isSubmitting || !smsMessage.trim()}
                  onClick={() => handleSaveSms(false)}
                  className="btn btn--primary text-xs py-2 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white"
                >
                  Send (Test Provider)
                </button>
              </div>
            </div>
          )}

          {/* 3. EMAIL COMPOSER */}
          {activeTab === 'email' && (
            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">To Email</label>
                <input
                  type="text"
                  disabled
                  value={customer.email || 'No email registered'}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[var(--text-ink)] text-xs font-mono"
                />
              </div>

              {/* Template Quick Selector */}
              {templates.filter((t) => t.channel === 'email').length > 0 && (
                <div>
                  <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1.5">
                    Insert Email Template
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {templates
                      .filter((t) => t.channel === 'email')
                      .map((tmpl) => (
                        <button
                          key={tmpl.id}
                          type="button"
                          onClick={() => applyTemplate(tmpl, 'email')}
                          className="px-2.5 py-1 rounded-lg bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-ink)] hover:border-indigo-500 transition-colors"
                        >
                          {tmpl.name}
                        </button>
                      ))}
                  </div>
                </div>
              )}

              <div>
                <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">Subject</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="Email subject..."
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[var(--text-ink)] text-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">Body</label>
                <textarea
                  rows={6}
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  placeholder="Write email message..."
                  className="w-full p-3 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-ink)] focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isSubmitting || !emailBody.trim() || !customer.email}
                  onClick={handleSendEmail}
                  className="btn btn--primary text-xs py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send via SMTP</span>
                </button>
              </div>
            </div>
          )}

          {/* 4. LOG CALL */}
          {activeTab === 'call' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">Call Outcome</label>
                  <select
                    value={callOutcome}
                    onChange={(e) => setCallOutcome(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[var(--text-ink)] text-xs"
                  >
                    <option value="Connected">Connected & Discussed</option>
                    <option value="Left Voicemail">Left Voicemail</option>
                    <option value="No Answer">No Answer / Ringing</option>
                    <option value="Busy">Busy / Line Engaged</option>
                    <option value="Wrong Number">Wrong Number</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">Duration (minutes)</label>
                  <input
                    type="number"
                    min="1"
                    value={callDuration}
                    onChange={(e) => setCallDuration(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[var(--text-ink)] text-xs font-tabular"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">Call Notes & Key Takeaways</label>
                <textarea
                  rows={4}
                  value={callNotes}
                  onChange={(e) => setCallNotes(e.target.value)}
                  placeholder="Summarize the discussion, customer requirements, or agreed next steps..."
                  className="w-full p-3 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-ink)] focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  disabled={isSubmitting || !callNotes.trim()}
                  onClick={handleLogCall}
                  className="btn btn--primary text-xs py-2 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white"
                >
                  Log Call Activity
                </button>
              </div>
            </div>
          )}

          {/* 5. ADD NOTE */}
          {activeTab === 'note' && (
            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">Internal Note</label>
                <textarea
                  rows={5}
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Add an internal note about this account..."
                  className="w-full p-3 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-ink)] focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  disabled={isSubmitting || !noteContent.trim()}
                  onClick={handleLogNote}
                  className="btn btn--primary text-xs py-2 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white"
                >
                  Save Note
                </button>
              </div>
            </div>
          )}

          {/* 6. COMMUNICATION TIMELINE */}
          {activeTab === 'timeline' && (
            <div>
              {/* Timeline Filter Pills */}
              <div className="flex items-center gap-1.5 mb-4 overflow-x-auto scrollbar-none pb-1">
                {(['all', 'whatsapp', 'sms', 'email', 'call', 'note', 'pulse'] as const).map((filterKey) => (
                  <button
                    key={filterKey}
                    onClick={() => setTimelineFilter(filterKey)}
                    className={`px-2.5 py-1 rounded-lg text-xs capitalize transition-colors ${
                      timelineFilter === filterKey
                        ? 'bg-[var(--text-ink)] text-[var(--bg-card)] font-semibold'
                        : 'bg-[var(--bg-main)] text-[var(--text-muted)] hover:text-[var(--text-ink)]'
                    }`}
                  >
                    {filterKey === 'pulse' ? 'Pulse Web' : filterKey}
                  </button>
                ))}
              </div>

              {isLoadingTimeline ? (
                <div className="py-12 text-center text-xs text-[var(--text-muted)]">
                  Loading communication history...
                </div>
              ) : filteredTimeline.length === 0 ? (
                <div className="py-16 text-center text-xs text-[var(--text-muted)] card border-dashed p-6">
                  <Clock className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-2 opacity-40" />
                  <p className="font-semibold text-sm text-[var(--text-ink)]">No timeline records</p>
                  <p className="mt-1">Events, website visits, and communication history will appear here.</p>
                </div>
              ) : (
                <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-[var(--border-subtle)]">
                  {filteredTimeline.map((item) => {
                    const isWhatsApp = item.type === 'whatsapp';
                    const isSms = item.type === 'sms';
                    const isEmail = item.type === 'email';
                    const isCall = item.type === 'call';
                    const isNote = item.type === 'note';
                    const isPulse =
                      item.type === 'website_visit' ||
                      item.type === 'product_view' ||
                      item.type === 'cart_activity' ||
                      item.type === 'checkout' ||
                      item.type === 'purchase' ||
                      item.type === 'form_submission' ||
                      item.title?.startsWith('[Pulse]');

                    const dotColor = isWhatsApp
                      ? 'bg-emerald-500'
                      : isSms
                      ? 'bg-sky-500'
                      : isEmail
                      ? 'bg-indigo-500'
                      : isCall
                      ? 'bg-amber-500'
                      : isPulse
                      ? 'bg-cyan-500'
                      : 'bg-purple-500';

                    return (
                      <div key={item.id} className="relative group">
                        {/* Timeline Marker */}
                        <div
                          className={`absolute -left-6 top-1.5 w-3 h-3 rounded-full border-2 border-[var(--bg-card)] ${dotColor} shadow-2xs`}
                        />

                        <div className="card p-3.5 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-subtle)] hover:border-[var(--text-muted)]/40 transition-colors">
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <div className="flex items-center gap-2">
                              {isPulse && <Globe className="w-3.5 h-3.5 text-cyan-500" />}
                              <span className="font-bold text-[var(--text-ink)]">{item.title}</span>
                              {item.status && (
                                <span
                                  className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-md ${
                                    item.status === 'sent' || item.status === 'delivered'
                                      ? 'bg-emerald-500/10 text-emerald-600'
                                      : item.status === 'failed'
                                      ? 'bg-rose-500/10 text-rose-600'
                                      : 'bg-amber-500/10 text-amber-600'
                                  }`}
                                >
                                  {item.status}
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-[var(--text-muted)] font-tabular" title="Asia/Kolkata (IST)">
                              {formatDateTime(item.createdAt, { includeTimezoneName: true })}
                            </span>
                          </div>

                          <p className="text-xs text-[var(--text-ink)] whitespace-pre-wrap leading-relaxed">
                            {item.content}
                          </p>

                          <div className="mt-2.5 pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                            <span>Logged by: <strong className="text-[var(--text-ink)] font-medium">{item.authorName}</strong></span>
                            {item.recipient && (
                              <span className="font-mono text-[10px]">{item.recipient}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

