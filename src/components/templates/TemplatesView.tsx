'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Plus,
  Copy,
  Trash2,
  Edit3,
  Eye,
  Send,
  AlertTriangle,
  Check,
  Code2,
  FileText,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Info,
  Clock,
  Layout,
  X,
  Filter,
} from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { html } from '@codemirror/lang-html';
import DOMPurify from 'isomorphic-dompurify';
import { EmailTemplate, Workspace } from '@/types/crm';
import {
  SUPPORTED_VARIABLES,
  SupportedVariable,
  validateTemplate,
  renderTemplateString,
  htmlToPlainText,
} from '@/lib/email/template-parser';
import { CommercialOfferCodeEditorModal } from './CommercialOfferCodeEditorModal';
import {
  COMMERCIAL_OFFER_TEMPLATE_ID,
  COMMERCIAL_OFFER_TEMPLATE_NAME,
} from '@/lib/quotation/commercialOfferTemplate';

interface TemplatesViewProps {
  workspace: Workspace;
  onNavigateToSettings?: () => void;
}

type PreviewVariant = 'full' | 'name_only' | 'no_name';

const MOCK_LEADS: Record<PreviewVariant, { name: string; contactName: string; designation: string; company: string; email: string; phone: string; title: string; value: number; status: string }> = {
  full: {
    name: 'Full data lead',
    contactName: 'Vikram Malhotra',
    designation: 'VP Technology',
    company: 'Malhotra Enterprises',
    email: 'vikram@malhotratech.com',
    phone: '+919876543210',
    title: 'Enterprise AI & Cloud Infrastructure',
    value: 50000,
    status: 'Qualified',
  },
  name_only: {
    name: 'Name only',
    contactName: 'Ananya Verma',
    designation: '',
    company: '',
    email: 'ananya@example.com',
    phone: '',
    title: 'Mobile Application Scope',
    value: 0,
    status: 'New lead',
  },
  no_name: {
    name: 'No name or company',
    contactName: '',
    designation: '',
    company: '',
    email: 'contact@domain.com',
    phone: '',
    title: 'Inbound Inquiry',
    value: 0,
    status: 'New lead',
  },
};

const CATEGORIES = [
  { id: 'all', label: 'All Templates' },
  { id: 'outreach', label: 'Outreach & Intro' },
  { id: 'sales', label: 'Sales & Proposal' },
  { id: 'meeting', label: 'Meetings & Syncs' },
  { id: 'follow_up', label: 'Follow-ups & Check-ins' },
  { id: 'general', label: 'General' },
];

export function TemplatesView({ workspace, onNavigateToSettings }: TemplatesViewProps) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Editor Modal / Drawer state
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorName, setEditorName] = useState('');
  const [editorCategory, setEditorCategory] = useState('outreach');
  const [editorSubject, setEditorSubject] = useState('');
  const [editorBody, setEditorBody] = useState('');
  const [editorPlainText, setEditorPlainText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editorActiveTab, setEditorActiveTab] = useState<'html' | 'plaintext'>('html');

  // Preview variant
  const [previewVariant, setPreviewVariant] = useState<PreviewVariant>('full');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testSentSuccess, setTestSentSuccess] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Focus tracking for variable click-to-insert
  const lastFocusedField = useRef<'subject' | 'body'>('body');
  const [isCommercialOfferEditorOpen, setIsCommercialOfferEditorOpen] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, [workspace?.id]);

  const loadTemplates = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/email/templates?workspaceId=${workspace?.id || 'ws-default'}`);
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
      }
    } catch (err) {
      console.error('Failed loading email templates:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMessage({ type, text });
    setTimeout(() => setFeedbackMessage(null), 4000);
  };

  // Open Editor for new template
  const handleOpenNew = () => {
    setEditingTemplate(null);
    setEditorName('New Email Template');
    setEditorCategory('outreach');
    setEditorSubject('Connecting with {{company.name}}');
    setEditorBody(`<p>{{greeting}}</p>\n<p>I wanted to reach out regarding our collaboration on {{deal.title}}.</p>\n<p>Looking forward to hearing from you.</p>\n{{my.signature}}`);
    setEditorPlainText(`{{greeting}}\n\nI wanted to reach out regarding our collaboration on {{deal.title}}.\n\nLooking forward to hearing from you.\n\n{{my.signature}}`);
    setPreviewVariant('full');
    setIsEditorOpen(true);
  };

  // Open Editor for existing template
  const handleOpenEdit = (t: EmailTemplate) => {
    setEditingTemplate(t);
    setEditorName(t.name);
    setEditorCategory(t.category || 'general');
    setEditorSubject(t.subject);
    setEditorBody(t.body);
    setEditorPlainText(t.plainText || htmlToPlainText(t.body));
    setPreviewVariant('full');
    setIsEditorOpen(true);
  };

  // Duplicate template
  const handleDuplicate = async (t: EmailTemplate) => {
    try {
      const res = await fetch('/api/email/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace?.id || 'ws-default',
          action: 'duplicate',
          sourceTemplateId: t.id,
        }),
      });

      if (res.ok) {
        showToast(`Duplicated "${t.name}" successfully!`);
        await loadTemplates();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to duplicate template', 'error');
      }
    } catch {
      showToast('Error duplicating template', 'error');
    }
  };

  // Delete template
  const handleDelete = async (t: EmailTemplate) => {
    if (t.isPrebuilt) {
      showToast('Pre-built templates cannot be deleted, only duplicated.', 'error');
      return;
    }

    if (!confirm(`Are you sure you want to delete template "${t.name}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/email/templates?workspaceId=${workspace?.id || 'ws-default'}&id=${t.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        showToast(`Template "${t.name}" deleted.`);
        await loadTemplates();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to delete template', 'error');
      }
    } catch {
      showToast('Error deleting template', 'error');
    }
  };

  // Save template
  const handleSaveTemplate = async () => {
    if (!editorName.trim()) {
      showToast('Template name is required', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const isUpdate = !!editingTemplate?.id;
      const url = '/api/email/templates';
      const method = isUpdate ? 'PUT' : 'POST';

      const payload = {
        workspaceId: workspace?.id || 'ws-default',
        ...(isUpdate ? { id: editingTemplate.id } : {}),
        name: editorName.trim(),
        category: editorCategory,
        subject: editorSubject.trim(),
        body: editorBody,
        plainText: editorPlainText || htmlToPlainText(editorBody),
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        showToast(isUpdate ? 'Template updated successfully!' : 'New template created!');
        setIsEditorOpen(false);
        await loadTemplates();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to save template', 'error');
      }
    } catch {
      showToast('Network error while saving template', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Insert variable into active field
  const handleInsertVariable = (variableTag: string) => {
    const formattedTag = `{{${variableTag}}}`;
    if (lastFocusedField.current === 'subject') {
      setEditorSubject((prev) => `${prev} ${formattedTag}`);
    } else {
      setEditorBody((prev) => `${prev} ${formattedTag}`);
      setEditorPlainText((prev) => `${prev} ${formattedTag}`);
    }
  };

  // Send test to myself
  const handleSendTestToSelf = async () => {
    setIsSendingTest(true);
    setTestSentSuccess(false);

    try {
      const res = await fetch('/api/email/test-self', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace?.id || 'ws-default',
          subject: editorSubject,
          body: editorBody,
          previewVariant,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTestSentSuccess(true);
        showToast(`Test email sent to ${workspace?.senderEmail || 'your email'}!`);
        setTimeout(() => setTestSentSuccess(false), 3000);
      } else {
        showToast(data.error || 'SMTP delivery failed. Check Gmail credentials.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error dispatching test email', 'error');
    } finally {
      setIsSendingTest(false);
    }
  };

  // Filter templates
  const filteredTemplates = templates.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.category && t.category.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory =
      selectedCategory === 'all' || (t.category && t.category.toLowerCase() === selectedCategory.toLowerCase());

    return matchesSearch && matchesCategory;
  });

  // Template validation warnings in editor
  const editorValidation = validateTemplate({ subject: editorSubject, body: editorBody });

  // Render live preview for the currently selected mock lead variant
  const activeMockLead = MOCK_LEADS[previewVariant];
  const renderedPreviewSubject = renderTemplateString(editorSubject, {
    lead: activeMockLead as any,
    workspace,
  });
  const renderedPreviewHtml = renderTemplateString(editorBody, {
    lead: activeMockLead as any,
    workspace,
  });
  const sanitizedPreviewHtml = DOMPurify.sanitize(renderedPreviewHtml);

  const isMissingPortfolio = !workspace?.portfolioUrl;

  return (
    <div className="flex-1 w-full min-h-screen p-6 md:p-8 space-y-6">
      {/* Missing Portfolio Banner */}
      {isMissingPortfolio && (
        <div className="flex items-center justify-between p-4 rounded-2xl bg-[var(--butter)]/15 border border-[var(--butter)]/40 text-[var(--text)]">
          <div className="flex items-center gap-3">
            <Info className="w-5 h-5 text-[var(--butter)] shrink-0" />
            <div className="text-xs">
              <span className="font-bold">Portfolio URL is not configured:</span> Templates using{' '}
              <code className="px-1.5 py-0.5 rounded bg-[var(--surface)] text-[var(--accent)] font-mono text-[11px]">
                {'{{my.portfolio}}'}
              </code>{' '}
              will render empty until you set your portfolio link in Settings.
            </div>
          </div>
          {onNavigateToSettings && (
            <button
              onClick={onNavigateToSettings}
              className="px-3 py-1.5 rounded-full bg-[var(--text)] text-[var(--bg)] text-xs font-semibold hover:opacity-90 transition-all cursor-pointer whitespace-nowrap ml-4"
            >
              Configure in Settings &rarr;
            </button>
          )}
        </div>
      )}

      {/* Header & New Template Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text)]">
            Email Templates
          </h1>
          <p className="text-xs sm:text-sm text-[var(--muted)] mt-1">
            Engineered messaging blueprints with intelligent variable resolution and one-click dispatch.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsCommercialOfferEditorOpen(true)}
            className="px-4 py-2.5 rounded-full bg-[#17191A] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer hover:opacity-90"
          >
            <Code2 className="w-3.5 h-3.5" />
            Edit Commercial Offer HTML
          </button>
          <button
            type="button"
            onClick={handleOpenNew}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[var(--text)] text-[var(--bg)] font-semibold text-xs shadow-md hover:opacity-90 active:scale-98 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>New Template</span>
          </button>
        </div>
      </div>

      {/* Toast Feedback */}
      {feedbackMessage && (
        <div
          className={`p-3 rounded-xl text-xs font-semibold transition-all flex items-center justify-between ${
            feedbackMessage.type === 'success'
              ? 'bg-[var(--pine)]/15 text-[var(--pine)] border border-[var(--pine)]/30'
              : 'bg-[var(--bad)]/15 text-[var(--bad)] border border-[var(--bad)]/30'
          }`}
        >
          <span>{feedbackMessage.text}</span>
          <button onClick={() => setFeedbackMessage(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search & Category Filter Pills */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search Bar */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[var(--muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates by title, subject, or tag..."
            className="w-full pl-10 pr-4 py-2 rounded-full bg-[var(--glass-2)] border border-[var(--rim)] text-xs text-[var(--text)] placeholder-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-[var(--text)] transition-all"
          />
        </div>

        {/* Category Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1">
          {CATEGORIES.map((cat) => {
            const isActive = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-[var(--text)] text-[var(--bg)] shadow-xs'
                    : 'bg-[var(--glass-2)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--solid)] border border-[var(--rim)]'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Templates Grid */}
      {isLoading ? (
        <div className="py-20 text-center text-xs text-[var(--muted)] animate-pulse">
          Loading email templates...
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="py-20 text-center rounded-3xl bg-[var(--glass-1)] border border-[var(--rim)] p-8">
          <FileText className="w-10 h-10 text-[var(--muted)] mx-auto mb-3 opacity-60" />
          <h3 className="font-bold text-sm text-[var(--text)]">No templates found</h3>
          <p className="text-xs text-[var(--muted)] mt-1 max-w-xs mx-auto">
            {searchQuery
              ? `No templates matched "${searchQuery}". Try a different keyword.`
              : 'Create your first email template to speed up your sales outreach.'}
          </p>
          <button
            onClick={handleOpenNew}
            className="mt-4 px-4 py-2 rounded-full bg-[var(--text)] text-[var(--bg)] font-semibold text-xs cursor-pointer"
          >
            Create Template
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map((t) => (
            <div
              key={t.id}
              className="group p-5 rounded-3xl bg-[var(--glass-2)] hover:bg-[var(--solid)] border border-[var(--rim)] transition-all flex flex-col justify-between shadow-xs hover:shadow-md"
            >
              <div>
                {/* Top Badge & Category */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--glass-3)] text-[var(--muted)] border border-[var(--rim)]">
                    {t.category || 'general'}
                  </span>
                  {t.isPrebuilt ? (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--pine)]/15 text-[var(--pine)] border border-[var(--pine)]/30">
                      Pre-built
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30">
                      Custom
                    </span>
                  )}
                </div>

                {/* Title */}
                <h3 className="font-bold text-sm text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">
                  {t.name}
                </h3>

                {/* Subject */}
                <p className="text-xs text-[var(--muted)] mt-1.5 font-medium line-clamp-1">
                  <span className="opacity-70">Subject:</span> {t.subject}
                </p>

                {/* Preview Snippet */}
                <p className="text-xs text-[var(--muted)] mt-3 line-clamp-3 leading-relaxed opacity-85">
                  {t.plainText || htmlToPlainText(t.body)}
                </p>
              </div>

              {/* Action Buttons Footer */}
              <div className="flex items-center justify-between pt-4 mt-4 border-t border-[var(--rim)]">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleOpenEdit(t)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[var(--glass-3)] hover:bg-[var(--solid)] text-xs font-semibold text-[var(--text)] border border-[var(--rim)] transition-all cursor-pointer"
                    title="Edit or Inspect Template"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-[var(--muted)]" />
                    <span>Edit</span>
                  </button>

                  <button
                    onClick={() => handleDuplicate(t)}
                    className="p-1.5 rounded-full bg-[var(--glass-3)] hover:bg-[var(--solid)] text-[var(--muted)] hover:text-[var(--text)] border border-[var(--rim)] transition-all cursor-pointer"
                    title="Duplicate Template"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>

                {!t.isPrebuilt && (
                  <button
                    onClick={() => handleDelete(t)}
                    className="p-1.5 rounded-full hover:bg-[var(--bad)]/15 text-[var(--muted)] hover:text-[var(--bad)] transition-all cursor-pointer"
                    title="Delete Template"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* FULL-SCREEN CODE-BASED TEMPLATE EDITOR DRAWER / MODAL */}
      {isEditorOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
        >
          <div className="w-full max-w-6xl h-[92vh] rounded-[32px] bg-[var(--solid)] border border-[var(--rim)] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
            {/* Header */}
            <div className="px-6 py-4 border-b border-[var(--rim)] flex items-center justify-between shrink-0 bg-[var(--glass-1)]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-[var(--glass-3)] border border-[var(--rim)] flex items-center justify-center text-[var(--accent)] font-bold">
                  <Code2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-bold text-base text-[var(--text)] leading-tight">
                    {editingTemplate ? `Edit: ${editorName}` : 'Create New Template'}
                  </h2>
                  <p className="text-[11px] text-[var(--muted)]">
                    CodeMirror 6 HTML engine • Variables & Fallbacks live preview
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsEditorOpen(false)}
                  className="p-2 rounded-full hover:bg-[var(--glass-2)] text-[var(--muted)] hover:text-[var(--text)] transition-all cursor-pointer"
                  title="Close (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Validation Warnings */}
            {editorValidation.warnings.length > 0 && (
              <div className="px-6 py-2 bg-[var(--butter)]/15 border-b border-[var(--butter)]/30 flex items-center gap-2 text-xs text-[var(--text)]">
                <AlertTriangle className="w-4 h-4 text-[var(--butter)] shrink-0" />
                <span className="font-semibold">Notice:</span>
                <span>{editorValidation.warnings.join(' • ')}</span>
              </div>
            )}

            {/* Editor Body Grid: Left (Editor) & Right (Live Preview + Variables) */}
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
              {/* LEFT COLUMN: Template Fields & CodeMirror Editor (7 cols) */}
              <div className="lg:col-span-7 flex flex-col h-full border-r border-[var(--rim)] overflow-y-auto p-6 space-y-4">
                {/* Name & Category Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[11px] font-bold text-[var(--muted)]">
                      Template Name *
                    </label>
                    <input
                      type="text"
                      value={editorName}
                      onChange={(e) => setEditorName(e.target.value)}
                      placeholder="e.g. Executive Follow-up"
                      className="w-full px-4 py-2 rounded-full bg-[var(--glass-2)] border border-[var(--rim)] text-xs text-[var(--text)] focus:ring-1 focus:ring-[var(--text)]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-[var(--muted)]">
                      Category
                    </label>
                    <select
                      value={editorCategory}
                      onChange={(e) => setEditorCategory(e.target.value)}
                      className="w-full px-3 py-2 rounded-full bg-[var(--glass-2)] border border-[var(--rim)] text-xs text-[var(--text)] focus:ring-1 focus:ring-[var(--text)]"
                    >
                      <option value="outreach">Outreach</option>
                      <option value="sales">Sales</option>
                      <option value="meeting">Meeting</option>
                      <option value="follow_up">Follow-up</option>
                      <option value="general">General</option>
                    </select>
                  </div>
                </div>

                {/* Subject Line Input */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-[var(--muted)] flex items-center justify-between">
                    <span>Subject Line (Variables Allowed) *</span>
                    <span className="text-[10px] text-[var(--muted)] font-normal">
                      e.g. Meeting for {'{{company.name}}'}
                    </span>
                  </label>
                  <input
                    type="text"
                    value={editorSubject}
                    onFocus={() => {
                      lastFocusedField.current = 'subject';
                    }}
                    onChange={(e) => setEditorSubject(e.target.value)}
                    placeholder="Subject line with {{variables}}..."
                    className="w-full px-4 py-2 rounded-full bg-[var(--glass-2)] border border-[var(--rim)] text-xs text-[var(--text)] focus:ring-1 focus:ring-[var(--text)]"
                  />
                </div>

                {/* Code Editor Tabs (HTML / Plain Text) */}
                <div className="flex-1 flex flex-col min-h-[340px] space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 p-1 rounded-full bg-[var(--glass-2)] border border-[var(--rim)]">
                      <button
                        type="button"
                        onClick={() => setEditorActiveTab('html')}
                        className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-all ${
                          editorActiveTab === 'html'
                            ? 'bg-[var(--text)] text-[var(--bg)] shadow-xs'
                            : 'text-[var(--muted)] hover:text-[var(--text)]'
                        }`}
                      >
                        HTML Code
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditorActiveTab('plaintext');
                          if (!editorPlainText) {
                            setEditorPlainText(htmlToPlainText(editorBody));
                          }
                        }}
                        className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-all ${
                          editorActiveTab === 'plaintext'
                            ? 'bg-[var(--text)] text-[var(--bg)] shadow-xs'
                            : 'text-[var(--muted)] hover:text-[var(--text)]'
                        }`}
                      >
                        Plain Text (Fallback)
                      </button>
                    </div>

                    <span className="text-[10px] text-[var(--muted)] font-mono">
                      {editorActiveTab === 'html' ? 'HTML Highlighted (CodeMirror 6)' : 'Plain text version'}
                    </span>
                  </div>

                  {editorActiveTab === 'html' ? (
                    <div
                      className="flex-1 min-h-[320px] rounded-2xl border border-[var(--rim)] overflow-hidden bg-[#1E1E1E]"
                      onClick={() => {
                        lastFocusedField.current = 'body';
                      }}
                    >
                      <CodeMirror
                        value={editorBody}
                        height="360px"
                        theme="dark"
                        extensions={[html()]}
                        onChange={(val) => {
                          setEditorBody(val);
                          setEditorPlainText(htmlToPlainText(val));
                        }}
                        className="text-xs font-mono h-full"
                      />
                    </div>
                  ) : (
                    <textarea
                      value={editorPlainText}
                      onChange={(e) => setEditorPlainText(e.target.value)}
                      placeholder="Plain-text auto-generated version..."
                      rows={14}
                      className="w-full flex-1 p-4 rounded-2xl bg-[var(--glass-2)] border border-[var(--rim)] text-xs text-[var(--text)] font-mono resize-none focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
                    />
                  )}
                </div>

                {/* Footer Save & Discard Buttons */}
                <div className="flex items-center justify-between pt-4 border-t border-[var(--rim)] shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsEditorOpen(false)}
                    className="px-4 py-2 rounded-full bg-[var(--glass-2)] hover:bg-[var(--solid)] text-xs font-semibold text-[var(--muted)] hover:text-[var(--text)] border border-[var(--rim)] transition-all cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleSaveTemplate}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-[var(--text)] text-[var(--bg)] font-semibold text-xs shadow-md hover:opacity-90 active:scale-98 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Check className="w-4 h-4 stroke-[2.5]" />
                    <span>{isSaving ? 'Saving...' : 'Save Template'}</span>
                  </button>
                </div>
              </div>

              {/* RIGHT COLUMN: Variables Side Panel + Live Preview (5 cols) */}
              <div className="lg:col-span-5 flex flex-col h-full overflow-hidden bg-[var(--glass-1)]">
                {/* Top: Live Preview Header & Variant Switcher */}
                <div className="p-4 border-b border-[var(--rim)] space-y-3 shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Eye className="w-4 h-4 text-[var(--muted)]" />
                      <span className="font-bold text-xs text-[var(--text)]">Live Preview Sandbox</span>
                    </div>

                    <button
                      onClick={handleSendTestToSelf}
                      disabled={isSendingTest}
                      className="flex items-center gap-1 px-3 py-1 rounded-full bg-[var(--pine)]/20 hover:bg-[var(--pine)]/30 text-[var(--pine)] text-[11px] font-bold border border-[var(--pine)]/40 transition-all cursor-pointer disabled:opacity-50"
                      title="Sends rendered preview to your email"
                    >
                      <Send className="w-3 h-3" />
                      <span>{isSendingTest ? 'Sending...' : testSentSuccess ? 'Sent!' : 'Send test to myself'}</span>
                    </button>
                  </div>

                  {/* Switcher: Full data lead | Name only | No name or company */}
                  <div className="flex items-center gap-1 p-1 rounded-full bg-[var(--glass-2)] border border-[var(--rim)]">
                    {(['full', 'name_only', 'no_name'] as PreviewVariant[]).map((v) => (
                      <button
                        key={v}
                        onClick={() => setPreviewVariant(v)}
                        className={`flex-1 py-1 rounded-full text-[11px] font-semibold transition-all cursor-pointer text-center truncate px-2 ${
                          previewVariant === v
                            ? 'bg-[var(--text)] text-[var(--bg)] shadow-xs'
                            : 'text-[var(--muted)] hover:text-[var(--text)]'
                        }`}
                      >
                        {v === 'full' ? 'Full Lead' : v === 'name_only' ? 'Name only' : 'No name / co'}
                      </button>
                    ))}
                  </div>

                  {/* Rendered Subject Line */}
                  <div className="p-2.5 rounded-xl bg-[var(--glass-2)] border border-[var(--rim)] text-xs text-[var(--text)]">
                    <span className="text-[10px] font-bold text-[var(--muted)] block mb-0.5">
                      Subject
                    </span>
                    <span className="font-semibold">{renderedPreviewSubject || '(No subject)'}</span>
                  </div>
                </div>

                {/* Middle: Sanitized Iframe Preview */}
                <div className="flex-1 min-h-[220px] p-4 overflow-hidden flex flex-col">
                  <div className="w-full flex-1 rounded-2xl bg-white border border-[var(--rim)] shadow-inner overflow-hidden">
                    <iframe
                      title="Email Preview"
                      srcDoc={`
                        <!DOCTYPE html>
                        <html>
                          <head>
                            <meta charset="utf-8" />
                            <style>
                              body {
                                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                                font-size: 13px;
                                line-height: 1.55;
                                color: #27272A;
                                padding: 20px;
                                margin: 0;
                                background-color: #FFFFFF;
                              }
                              a { color: #0969DA; }
                              p { margin: 0 0 12px 0; }
                            </style>
                          </head>
                          <body>
                            ${sanitizedPreviewHtml}
                          </body>
                        </html>
                      `}
                      className="w-full h-full border-0"
                      sandbox="allow-same-origin"
                    />
                  </div>
                </div>

                {/* Bottom: Variables Quick Insert Chips */}
                <div className="p-4 border-t border-[var(--rim)] bg-[var(--solid)] shrink-0 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[var(--text)]">
                      Variables Side Panel
                    </span>
                    <span className="text-[10px] text-[var(--muted)]">
                      Click to insert at active field
                    </span>
                  </div>

                  <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin">
                    <div className="flex flex-wrap gap-1">
                      {SUPPORTED_VARIABLES.map((v) => (
                        <button
                          key={v.key}
                          type="button"
                          onClick={() => handleInsertVariable(v.key)}
                          className="px-2 py-1 rounded-lg bg-[var(--glass-2)] hover:bg-[var(--text)] hover:text-[var(--bg)] text-[11px] font-mono text-[var(--text)] border border-[var(--rim)] transition-all cursor-pointer flex items-center gap-1 group"
                          title={`${v.label} — ${v.desc} (e.g. ${v.example})`}
                        >
                          <span>{`{{${v.key}}}`}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Split-Screen Commercial Offer (Quotation) HTML Code Editor */}
      <CommercialOfferCodeEditorModal
        isOpen={isCommercialOfferEditorOpen}
        workspace={workspace}
        initialHtml={
          templates.find(
            (t) => t.id === COMMERCIAL_OFFER_TEMPLATE_ID || t.name === COMMERCIAL_OFFER_TEMPLATE_NAME
          )?.body
        }
        onClose={() => setIsCommercialOfferEditorOpen(false)}
        onSaved={loadTemplates}
      />
    </div>
  );
}
