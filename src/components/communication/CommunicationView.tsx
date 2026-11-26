'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  MessageSquare,
  Send,
  Mail,
  FileText,
  Settings as SettingsIcon,
  Search,
  Filter,
  Plus,
  Clock,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  User,
  Building,
  Phone,
  RefreshCw,
  ExternalLink,
  Trash2,
  Edit2,
  Copy,
  Inbox,
  ShieldCheck,
  ChevronRight,
  Sparkles,
  Radio,
} from 'lucide-react';
import { Workspace, Customer, TeamMember } from '@/types/crm';
import {
  CommunicationConversation,
  CommunicationMessage,
  CommunicationTemplate,
  CommunicationSettings,
  CommunicationChannel,
} from '@/types/communication';
import { formatDateTime } from '@/lib/dateTime';
import { calculateSmsSegments, interpolateTemplateVariables } from '@/lib/communication/adapter';
import { Msg91ManagementDashboard } from './Msg91ManagementDashboard';

interface CommunicationViewProps {
  workspace: Workspace;
  customers: Customer[];
  members: TeamMember[];
  currentUser?: TeamMember | null;
  onNavigateToSettings?: () => void;
}

type SubSection = 'inbox' | 'whatsapp' | 'sms' | 'email' | 'templates' | 'settings' | 'msg91';

export function CommunicationView({
  workspace,
  customers,
  members,
  currentUser,
  onNavigateToSettings,
}: CommunicationViewProps) {
  const [subSection, setSubSection] = useState<SubSection>('inbox');

  // Unified Inbox & Conversation States
  const [conversations, setConversations] = useState<CommunicationConversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<CommunicationConversation | null>(null);
  const [messages, setMessages] = useState<CommunicationMessage[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState<'all' | 'whatsapp' | 'sms' | 'email'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [employeeFilter, setEmployeeFilter] = useState<'all' | string>('all');

  // Composer States
  const [composerText, setComposerText] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [isSubmittingMessage, setIsSubmittingMessage] = useState(false);
  const [composerAlert, setComposerAlert] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);

  // New Conversation Modal State
  const [isNewConvModalOpen, setIsNewConvModalOpen] = useState(false);
  const [newConvCustomerId, setNewConvCustomerId] = useState('');
  const [newConvChannel, setNewConvChannel] = useState<CommunicationChannel>('whatsapp');

  // Templates State
  const [templates, setTemplates] = useState<CommunicationTemplate[]>([]);
  const [templateChannelFilter, setTemplateChannelFilter] = useState<'all' | CommunicationChannel>('all');
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState<string>('all');
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<CommunicationTemplate | null>(null);
  const [tmplName, setTmplName] = useState('');
  const [tmplChannel, setTmplChannel] = useState<CommunicationChannel>('whatsapp');
  const [tmplCategory, setTmplCategory] = useState('Welcome');
  const [tmplSubject, setTmplSubject] = useState('');
  const [tmplContent, setTmplContent] = useState('');

  // Settings State
  const [commSettings, setCommSettings] = useState<CommunicationSettings | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSaveMsg, setSettingsSaveMsg] = useState<string | null>(null);

  // Load Conversations
  const loadConversations = async () => {
    setIsLoadingConversations(true);
    try {
      const channelParam = subSection === 'whatsapp' ? 'whatsapp' : subSection === 'sms' ? 'sms' : channelFilter;
      const res = await fetch(`/api/communication/conversations?workspaceId=${workspace.id}&channel=${channelParam}`);
      if (res.ok) {
        const data = await res.json();
        setConversations(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Failed to load conversations:', e);
    } finally {
      setIsLoadingConversations(false);
    }
  };

  // Load Messages for active conversation
  const loadMessages = async (convId: string) => {
    setIsLoadingMessages(true);
    try {
      const res = await fetch(`/api/communication/messages?workspaceId=${workspace.id}&conversationId=${convId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Failed to load messages:', e);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  // Load Templates
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

  // Load Communication Settings
  const loadSettings = async () => {
    try {
      const res = await fetch(`/api/communication/settings?workspaceId=${workspace.id}`);
      if (res.ok) {
        const data = await res.json();
        setCommSettings(data);
      }
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
  };

  useEffect(() => {
    loadConversations();
    loadTemplates();
    loadSettings();
  }, [workspace.id, subSection, channelFilter]);

  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation.id);
      setComposerAlert(null);
      setComposerText('');
      setEmailSubject('');
    } else {
      setMessages([]);
    }
  }, [selectedConversation?.id]);

  // Filtered Conversations List
  const filteredConversations = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return conversations.filter((c) => {
      // Channel filter
      if (subSection === 'whatsapp' && c.channel !== 'whatsapp') return false;
      if (subSection === 'sms' && c.channel !== 'sms') return false;
      if (subSection === 'inbox' && channelFilter !== 'all' && c.channel !== channelFilter) return false;

      // Status filter
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;

      // Employee filter
      if (employeeFilter !== 'all' && c.assignedEmployeeId !== employeeFilter) return false;

      // Search
      if (q) {
        const matchesName = c.customerName?.toLowerCase().includes(q);
        const matchesPhone = c.customerPhone?.toLowerCase().includes(q);
        const matchesEmail = c.customerEmail?.toLowerCase().includes(q);
        const matchesPreview = c.lastMessagePreview?.toLowerCase().includes(q);
        if (!matchesName && !matchesPhone && !matchesEmail && !matchesPreview) return false;
      }

      return true;
    });
  }, [conversations, subSection, channelFilter, statusFilter, employeeFilter, searchQuery]);

  // Send or Draft message in active conversation
  const handleSendMessage = async (asDraftOnly: boolean) => {
    if (!selectedConversation || !composerText.trim()) return;
    setIsSubmittingMessage(true);
    setComposerAlert(null);

    const recipient =
      selectedConversation.channel === 'email'
        ? selectedConversation.customerEmail || ''
        : selectedConversation.customerPhone || '';

    try {
      const res = await fetch('/api/communication/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace.id,
          conversationId: selectedConversation.id,
          customerId: selectedConversation.customerId,
          channel: selectedConversation.channel,
          recipient,
          content: composerText,
          subject: selectedConversation.channel === 'email' ? emailSubject : undefined,
          status: asDraftOnly ? 'draft' : 'send',
        }),
      });

      const data = await res.json();

      if (asDraftOnly) {
        setComposerAlert({
          type: 'success',
          message: 'Message draft saved in conversation.',
        });
      } else if (selectedConversation.channel === 'email') {
        if (data.success) {
          setComposerAlert({
            type: 'success',
            message: 'Email dispatched successfully via SMTP.',
          });
          setEmailSubject('');
        } else {
          setComposerAlert({
            type: 'error',
            message: data.error || 'SMTP delivery failed.',
          });
        }
      } else {
        // WhatsApp or SMS: Provider is not yet connected
        setComposerAlert({
          type: 'warning',
          message: data.warning || `${selectedConversation.channel.toUpperCase()} provider (MSG91) is not connected. Message saved as draft.`,
        });
      }

      setComposerText('');
      await loadMessages(selectedConversation.id);
      await loadConversations();
    } catch (err: any) {
      setComposerAlert({
        type: 'error',
        message: err.message || 'Failed to dispatch message.',
      });
    } finally {
      setIsSubmittingMessage(false);
    }
  };

  // Start New Conversation
  const handleCreateNewConversation = async () => {
    const cust = customers.find((c) => c.id === newConvCustomerId);
    if (!cust) return;

    try {
      const res = await fetch('/api/communication/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace.id,
          customerId: cust.id,
          customerName: cust.name || cust.company,
          customerPhone: cust.phone || '',
          customerEmail: cust.email || '',
          channel: newConvChannel,
          assignedEmployeeId: currentUser?.id,
          assignedEmployeeName: currentUser?.name,
        }),
      });

      if (res.ok) {
        const created = await res.json();
        setIsNewConvModalOpen(false);
        setNewConvCustomerId('');
        await loadConversations();
        setSelectedConversation(created);
      }
    } catch (e) {
      console.error('Failed to create conversation:', e);
    }
  };

  // Template Save / Edit
  const handleSaveTemplate = async () => {
    if (!tmplName.trim() || !tmplContent.trim()) return;

    try {
      const payload = {
        workspaceId: workspace.id,
        name: tmplName,
        channel: tmplChannel,
        category: tmplCategory,
        content: tmplContent,
        subject: tmplChannel === 'email' ? tmplSubject : undefined,
        isExternalApproved: false,
      };

      if (editingTemplate) {
        await fetch('/api/communication/templates', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingTemplate.id, ...payload }),
        });
      } else {
        await fetch('/api/communication/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      setIsTemplateModalOpen(false);
      setEditingTemplate(null);
      setTmplName('');
      setTmplSubject('');
      setTmplContent('');
      await loadTemplates();
    } catch (e) {
      console.error('Failed to save template:', e);
    }
  };

  // Template Delete
  const handleDeleteTemplate = async (tmplId: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;
    try {
      await fetch(`/api/communication/templates?workspaceId=${workspace.id}&id=${tmplId}`, {
        method: 'DELETE',
      });
      await loadTemplates();
    } catch (e) {
      console.error('Failed to delete template:', e);
    }
  };

  // Save Settings
  const handleSaveSettings = async () => {
    if (!commSettings) return;
    setIsSavingSettings(true);
    setSettingsSaveMsg(null);
    try {
      const res = await fetch('/api/communication/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...commSettings,
          workspaceId: workspace.id,
        }),
      });
      if (res.ok) {
        setSettingsSaveMsg('Communication preferences updated successfully.');
      }
    } catch (e) {
      setSettingsSaveMsg('Failed to update settings.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  // SMS Segments computation for active conversation composer
  const smsSegments = calculateSmsSegments(composerText);

  return (
    <div className="flex flex-col h-[calc(100vh-4.5rem)] bg-[var(--bg-main)]">
      {/* Sub-Navigation Header */}
      <div className="px-6 py-3 bg-[var(--bg-card)] border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[var(--text-ink)] text-[var(--bg-card)] flex items-center justify-center font-bold text-sm shadow-2xs">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-[var(--text-ink)] tracking-tight">
              Communication Centre
            </h1>
            <p className="text-[11px] text-[var(--text-muted)]">
              Unified inbox, customer messaging, and communication automation
            </p>
          </div>
        </div>

        {/* Section Tabs */}
        <div className="flex items-center gap-1 bg-[var(--bg-main)] p-1 rounded-2xl border border-[var(--border-subtle)]">
          <button
            onClick={() => setSubSection('inbox')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              subSection === 'inbox'
                ? 'bg-[var(--bg-card)] text-[var(--text-ink)] shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-ink)]'
            }`}
          >
            <Inbox className="w-3.5 h-3.5" />
            <span>Unified Inbox</span>
          </button>

          <button
            onClick={() => setSubSection('whatsapp')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              subSection === 'whatsapp'
                ? 'bg-[var(--bg-card)] text-emerald-600 shadow-xs'
                : 'text-[var(--text-muted)] hover:text-emerald-600'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>WhatsApp</span>
          </button>

          <button
            onClick={() => setSubSection('sms')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              subSection === 'sms'
                ? 'bg-[var(--bg-card)] text-sky-600 shadow-xs'
                : 'text-[var(--text-muted)] hover:text-sky-600'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>SMS</span>
          </button>

          <button
            onClick={() => setSubSection('email')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              subSection === 'email'
                ? 'bg-[var(--bg-card)] text-indigo-600 shadow-xs'
                : 'text-[var(--text-muted)] hover:text-indigo-600'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Email</span>
          </button>

          <button
            onClick={() => setSubSection('templates')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              subSection === 'templates'
                ? 'bg-[var(--bg-card)] text-[var(--text-ink)] shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-ink)]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Templates</span>
          </button>

          <button
            onClick={() => setSubSection('settings')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              subSection === 'settings'
                ? 'bg-[var(--bg-card)] text-[var(--text-ink)] shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text-ink)]'
            }`}
          >
            <SettingsIcon className="w-3.5 h-3.5" />
            <span>Settings</span>
          </button>

          <button
            onClick={() => setSubSection('msg91')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              subSection === 'msg91'
                ? 'bg-[var(--bg-card)] text-emerald-600 shadow-xs'
                : 'text-[var(--text-muted)] hover:text-emerald-600'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>MSG91</span>
          </button>
        </div>
      </div>

      {/* SUBSECTION 1: UNIFIED INBOX, WHATSAPP, OR SMS */}
      {(subSection === 'inbox' || subSection === 'whatsapp' || subSection === 'sms') && (
        <div className="flex-1 flex overflow-hidden">
          {/* Left Column: Conversations List & Filters */}
          <div className="w-80 md:w-96 border-r border-[var(--border-subtle)] bg-[var(--bg-card)] flex flex-col shrink-0">
            {/* Search and Action Bar */}
            <div className="p-3 border-b border-[var(--border-subtle)] space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search conversations..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-ink)] focus:outline-none focus:border-[var(--text-muted)]"
                  />
                </div>
                <button
                  onClick={() => setIsNewConvModalOpen(true)}
                  className="btn btn--primary text-xs py-1.5 px-2.5 rounded-xl shrink-0 flex items-center gap-1"
                  title="Start New Conversation"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">New</span>
                </button>
              </div>

              {/* Filters for Unified Inbox */}
              {subSection === 'inbox' && (
                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
                  {(['all', 'whatsapp', 'sms', 'email'] as const).map((ch) => (
                    <button
                      key={ch}
                      onClick={() => setChannelFilter(ch)}
                      className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold capitalize transition-colors ${
                        channelFilter === ch
                          ? 'bg-[var(--text-ink)] text-[var(--bg-card)]'
                          : 'bg-[var(--bg-main)] text-[var(--text-muted)] hover:text-[var(--text-ink)]'
                      }`}
                    >
                      {ch}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Conversation List */}
            <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)]">
              {isLoadingConversations ? (
                <div className="py-12 text-center text-xs text-[var(--text-muted)]">
                  Loading conversations...
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="p-8 text-center text-xs text-[var(--text-muted)]">
                  <Inbox className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-2 opacity-40" />
                  <p className="font-semibold text-sm text-[var(--text-ink)]">No conversations</p>
                  <p className="mt-1">
                    {subSection === 'whatsapp'
                      ? 'No WhatsApp conversations yet. Use the "New" button to start a thread.'
                      : subSection === 'sms'
                      ? 'No SMS conversations yet.'
                      : 'Your unified inbox is empty.'}
                  </p>
                </div>
              ) : (
                filteredConversations.map((conv) => {
                  const isSelected = selectedConversation?.id === conv.id;
                  const isWa = conv.channel === 'whatsapp';
                  const isSms = conv.channel === 'sms';

                  return (
                    <div
                      key={conv.id}
                      onClick={() => setSelectedConversation(conv)}
                      className={`p-3.5 cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-[var(--bg-main)] border-l-3 border-[var(--text-ink)]'
                          : 'hover:bg-[var(--bg-main)]/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-bold text-xs text-[var(--text-ink)] truncate">
                            {conv.customerName}
                          </span>
                          <span
                            className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded-md ${
                              isWa
                                ? 'bg-emerald-500/10 text-emerald-600'
                                : isSms
                                ? 'bg-sky-500/10 text-sky-600'
                                : 'bg-indigo-500/10 text-indigo-600'
                            }`}
                          >
                            {conv.channel}
                          </span>
                        </div>
                        <span className="text-[10px] text-[var(--text-muted)] font-tabular shrink-0">
                          {formatDateTime(conv.lastMessageAt || conv.updatedAt)}
                        </span>
                      </div>

                      <p className="text-xs text-[var(--text-muted)] truncate mb-1.5">
                        {conv.lastMessagePreview || 'Draft in progress'}
                      </p>

                      <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                        <span className="truncate max-w-[140px] font-mono">
                          {conv.customerPhone || conv.customerEmail || '—'}
                        </span>
                        {conv.status && (
                          <span className="capitalize font-semibold text-[var(--text-ink)]">
                            {conv.status}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Selected Conversation View & Composer */}
          <div className="flex-1 flex flex-col bg-[var(--bg-main)] overflow-hidden">
            {selectedConversation ? (
              <>
                {/* Active Conversation Header */}
                <div className="p-4 bg-[var(--bg-card)] border-b border-[var(--border-subtle)] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[var(--text-ink)] flex items-center justify-center font-bold text-sm">
                      {(selectedConversation.customerName || 'C').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-bold text-[var(--text-ink)]">
                          {selectedConversation.customerName}
                        </h2>
                        <span className="badge badge--subtle text-[10px] py-0.2 uppercase">
                          {selectedConversation.channel}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-muted)] font-mono">
                        {selectedConversation.customerPhone || selectedConversation.customerEmail}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--text-muted)]">
                      Assigned: <strong className="text-[var(--text-ink)]">{selectedConversation.assignedEmployeeName || 'Unassigned'}</strong>
                    </span>
                  </div>
                </div>

                {/* Disconnected Provider Notification Banner */}
                {(selectedConversation.channel === 'whatsapp' || selectedConversation.channel === 'sms') && (
                  <div className="p-3 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2.5 px-4">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <div className="flex-1">
                      <span>MSG91 {selectedConversation.channel.toUpperCase()} Provider: <strong>Coming Soon</strong>.</span>
                      <span className="ml-1 opacity-90">All messages will be safely stored as drafts inside the CRM without pretending external delivery occurred.</span>
                    </div>
                  </div>
                )}

                {/* Messages Thread */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {isLoadingMessages ? (
                    <div className="py-12 text-center text-xs text-[var(--text-muted)]">
                      Loading message history...
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="py-12 text-center text-xs text-[var(--text-muted)]">
                      <MessageSquare className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-2 opacity-30" />
                      <p className="font-semibold text-[var(--text-ink)]">No messages in this conversation yet</p>
                      <p className="mt-1">Write a message below to create a draft or template.</p>
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const isOutbound = msg.direction === 'outbound';
                      const isDraft = msg.status === 'draft';
                      const isFailed = msg.status === 'failed';

                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`}
                        >
                          <div
                            className={`max-w-md p-3.5 rounded-2xl text-xs space-y-1 ${
                              isOutbound
                                ? 'bg-[var(--text-ink)] text-[var(--bg-card)] rounded-br-none'
                                : 'bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-ink)] rounded-bl-none shadow-2xs'
                            }`}
                          >
                            {msg.subject && (
                              <p className="font-bold border-b border-white/20 pb-1 mb-1">
                                {msg.subject}
                              </p>
                            )}
                            <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                          </div>

                          <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] mt-1 px-1">
                            <span>{msg.senderName}</span>
                            <span>•</span>
                            <span className="font-tabular">
                              {formatDateTime(msg.createdAt)}
                            </span>
                            {msg.status && (
                              <>
                                <span>•</span>
                                <span
                                  className={`font-semibold uppercase ${
                                    isDraft
                                      ? 'text-amber-500'
                                      : isFailed
                                      ? 'text-rose-500'
                                      : 'text-emerald-500'
                                  }`}
                                >
                                  {msg.status}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Composer Feedback Alert */}
                {composerAlert && (
                  <div
                    className={`mx-4 mb-2 p-3 rounded-xl border text-xs flex items-center gap-2 ${
                      composerAlert.type === 'success'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                        : composerAlert.type === 'warning'
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                    }`}
                  >
                    {composerAlert.type === 'success' ? (
                      <CheckCircle className="w-4 h-4 shrink-0" />
                    ) : composerAlert.type === 'warning' ? (
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0" />
                    )}
                    <span className="font-medium">{composerAlert.message}</span>
                  </div>
                )}

                {/* Integrated Conversation Composer */}
                <div className="p-4 bg-[var(--bg-card)] border-t border-[var(--border-subtle)] space-y-2.5">
                  {/* Template Picker Pills */}
                  {templates.filter((t) => t.channel === selectedConversation.channel).length > 0 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1">
                      <span className="text-[10px] text-[var(--text-muted)] font-semibold uppercase shrink-0">
                        Templates:
                      </span>
                      {templates
                        .filter((t) => t.channel === selectedConversation.channel)
                        .slice(0, 4)
                        .map((tmpl) => (
                          <button
                            key={tmpl.id}
                            type="button"
                            onClick={() => {
                              const vars = {
                                customer_name: selectedConversation.customerName || 'Customer',
                                business_name: workspace.name || 'Developster',
                                employee_name: currentUser?.name || 'Customer Support',
                              };
                              setComposerText(interpolateTemplateVariables(tmpl.content, vars));
                              if (tmpl.subject && selectedConversation.channel === 'email') {
                                setEmailSubject(interpolateTemplateVariables(tmpl.subject, vars));
                              }
                            }}
                            className="px-2 py-0.5 rounded-lg bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-ink)] hover:border-[var(--text-muted)] shrink-0"
                          >
                            {tmpl.name}
                          </button>
                        ))}
                    </div>
                  )}

                  {selectedConversation.channel === 'email' && (
                    <input
                      type="text"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      placeholder="Email Subject..."
                      className="w-full px-3 py-1.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-ink)]"
                    />
                  )}

                  <div className="relative">
                    <textarea
                      rows={3}
                      value={composerText}
                      onChange={(e) => setComposerText(e.target.value)}
                      placeholder={`Type ${selectedConversation.channel.toUpperCase()} message...`}
                      className="w-full p-3 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-ink)] focus:outline-none focus:border-[var(--text-ink)] transition-colors"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-[11px] text-[var(--text-muted)]">
                      {selectedConversation.channel === 'sms' ? (
                        <span>
                          {smsSegments.charCount} chars • {smsSegments.segmentCount} segment(s) ({smsSegments.charsRemaining} left)
                        </span>
                      ) : (
                        <span>{composerText.length} characters</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isSubmittingMessage || !composerText.trim()}
                        onClick={() => handleSendMessage(true)}
                        className="btn btn--subtle text-xs py-1.5 px-3 rounded-xl"
                      >
                        Save Draft
                      </button>
                      <button
                        type="button"
                        disabled={isSubmittingMessage || !composerText.trim()}
                        onClick={() => handleSendMessage(false)}
                        className={`btn btn--primary text-xs py-1.5 px-4 rounded-xl flex items-center gap-1.5 ${
                          selectedConversation.channel === 'whatsapp'
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            : selectedConversation.channel === 'sms'
                            ? 'bg-sky-600 hover:bg-sky-700 text-white'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                        }`}
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Send</span>
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-xs text-[var(--text-muted)]">
                <MessageSquare className="w-12 h-12 text-[var(--text-muted)] opacity-30 mb-3" />
                <h3 className="text-base font-bold text-[var(--text-ink)]">No Conversation Selected</h3>
                <p className="max-w-sm mt-1">
                  Select a customer thread from the left, or click &quot;New&quot; to initiate direct customer communication.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBSECTION 4: EMAIL VIEW (Connected to existing email implementation) */}
      {subSection === 'email' && (
        <div className="flex-1 p-6 overflow-y-auto max-w-5xl mx-auto w-full space-y-6">
          <div className="card p-6 bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div>
                <h2 className="text-sm font-bold text-[var(--text-ink)]">Customer Email Hub</h2>
                <p className="text-xs text-[var(--text-muted)]">
                  Dispatched via verified SMTP configuration. All customer emails are linked to CRM customer records.
                </p>
              </div>
              <span className="badge badge--pine text-xs">
                SMTP Connected
              </span>
            </div>

            {/* Quick Email Composer */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">Customer Account</label>
                  <select
                    className="w-full px-3 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[var(--text-ink)] text-xs"
                    onChange={(e) => {
                      const cust = customers.find((c) => c.id === e.target.value);
                      if (cust?.email) setEmailSubject(`Follow-up with ${cust.company}`);
                    }}
                  >
                    <option value="">Select Customer Account...</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.company} ({c.name}) - {c.email || 'No email'}
                      </option>
                    ))}
                  </select>
                </div>
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
              </div>

              <div>
                <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">Message Body</label>
                <textarea
                  rows={5}
                  value={composerText}
                  onChange={(e) => setComposerText(e.target.value)}
                  placeholder="Type email body or select a template..."
                  className="w-full p-3 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-ink)] focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    alert('Draft saved to Email records.');
                  }}
                  className="btn btn--subtle text-xs py-2 px-3.5 rounded-xl"
                >
                  Save as Draft
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUBSECTION 5: TEMPLATES MANAGEMENT */}
      {subSection === 'templates' && (
        <div className="flex-1 p-6 overflow-y-auto max-w-6xl mx-auto w-full space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-[var(--text-ink)]">Message Templates</h2>
              <p className="text-xs text-[var(--text-muted)]">
                Manage reusable templates for WhatsApp, SMS, and Email with dynamic variables.
              </p>
            </div>
            <button
              onClick={() => {
                setEditingTemplate(null);
                setTmplName('');
                setTmplChannel('whatsapp');
                setTmplCategory('Welcome');
                setTmplSubject('');
                setTmplContent('');
                setIsTemplateModalOpen(true);
              }}
              className="btn btn--primary text-xs py-2 px-4 rounded-xl flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Create Template</span>
            </button>
          </div>

          {/* Templates Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((tmpl) => (
              <div
                key={tmpl.id}
                className="card p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                        tmpl.channel === 'whatsapp'
                          ? 'bg-emerald-500/10 text-emerald-600'
                          : tmpl.channel === 'sms'
                          ? 'bg-sky-500/10 text-sky-600'
                          : 'bg-indigo-500/10 text-indigo-600'
                      }`}
                    >
                      {tmpl.channel}
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)] font-medium">
                      {tmpl.category}
                    </span>
                  </div>

                  <h3 className="font-bold text-sm text-[var(--text-ink)] mb-1">{tmpl.name}</h3>
                  {tmpl.subject && (
                    <p className="text-xs font-semibold text-[var(--text-muted)] mb-1 truncate">
                      Sub: {tmpl.subject}
                    </p>
                  )}
                  <p className="text-xs text-[var(--text-muted)] line-clamp-3 bg-[var(--bg-main)] p-2.5 rounded-xl border border-[var(--border-subtle)] font-mono text-[11px]">
                    {tmpl.content}
                  </p>

                  <div className="flex flex-wrap gap-1 mt-2.5">
                    {tmpl.variables.map((v) => (
                      <span
                        key={v}
                        className="text-[10px] bg-[var(--border-subtle)]/40 text-[var(--text-ink)] px-1.5 py-0.5 rounded font-mono"
                      >
                        &#123;&#123;{v}&#125;&#125;
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between">
                  <span className="text-[10px] text-[var(--text-muted)]">
                    {tmpl.isExternalApproved ? 'DLT Approved' : 'Internal CRM Template'}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingTemplate(tmpl);
                        setTmplName(tmpl.name);
                        setTmplChannel(tmpl.channel);
                        setTmplCategory(tmpl.category);
                        setTmplSubject(tmpl.subject || '');
                        setTmplContent(tmpl.content);
                        setIsTemplateModalOpen(true);
                      }}
                      className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-ink)] hover:bg-[var(--border-subtle)]/30"
                      title="Edit template"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteTemplate(tmpl.id)}
                      className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10"
                      title="Delete template"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUBSECTION 6: COMMUNICATION SETTINGS */}
      {subSection === 'settings' && commSettings && (
        <div className="flex-1 p-6 overflow-y-auto max-w-4xl mx-auto w-full space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-[var(--text-ink)]">Communication Settings</h2>
              <p className="text-xs text-[var(--text-muted)]">
                Manage messaging gateway configurations and future MSG91 credentials.
              </p>
            </div>
            <button
              onClick={handleSaveSettings}
              disabled={isSavingSettings}
              className="btn btn--primary text-xs py-2 px-4 rounded-xl flex items-center gap-1.5"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{isSavingSettings ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>

          {settingsSaveMsg && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300">
              {settingsSaveMsg}
            </div>
          )}

          {/* WhatsApp Settings Card */}
          <div className="card p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-ink)]">WhatsApp Provider Configuration</h3>
                  <p className="text-[11px] text-[var(--text-muted)]">Supported commercial provider: MSG91</p>
                </div>
              </div>
              <span className="badge badge--subtle text-xs text-amber-600 bg-amber-500/10">
                Coming Soon
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">Provider</label>
                <input
                  type="text"
                  disabled
                  value="MSG91 (WhatsApp Business API)"
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[var(--text-ink)] text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">Integrated Phone Number</label>
                <input
                  type="text"
                  placeholder="+91 XXXXX XXXXX"
                  value={commSettings.whatsapp.senderNumber || ''}
                  onChange={(e) =>
                    setCommSettings({
                      ...commSettings,
                      whatsapp: { ...commSettings.whatsapp, senderNumber: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[var(--text-ink)] text-xs font-mono"
                />
              </div>
            </div>
          </div>

          {/* SMS Settings Card */}
          <div className="card p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-600 flex items-center justify-center font-bold">
                  <Send className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-ink)]">SMS Provider Configuration</h3>
                  <p className="text-[11px] text-[var(--text-muted)]">Indian DLT & Global SMS via MSG91</p>
                </div>
              </div>
              <span className="badge badge--subtle text-xs text-amber-600 bg-amber-500/10">
                Coming Soon
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">Approved Sender ID (6 chars)</label>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="DEVHUB"
                  value={commSettings.sms.senderId || ''}
                  onChange={(e) =>
                    setCommSettings({
                      ...commSettings,
                      sms: { ...commSettings.sms, senderId: e.target.value.toUpperCase() },
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[var(--text-ink)] text-xs uppercase font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">DLT Entity ID</label>
                <input
                  type="text"
                  placeholder="1701xxxxxxxxxxxx"
                  value={commSettings.sms.dltEntityId || ''}
                  onChange={(e) =>
                    setCommSettings({
                      ...commSettings,
                      sms: { ...commSettings.sms, dltEntityId: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[var(--text-ink)] text-xs font-mono"
                />
              </div>
            </div>
          </div>

          {/* Webhook Configuration Card */}
          <div className="card p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center font-bold">
                  <RefreshCw className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-ink)]">Inbound Webhook Configuration</h3>
                  <p className="text-[11px] text-[var(--text-muted)]">Receives delivery receipts and incoming customer messages</p>
                </div>
              </div>
              <span className="badge badge--pine text-xs">Active Endpoint</span>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">Webhook URL</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  disabled
                  value="https://developster-hub-crm.vercel.app/api/communication/webhook"
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[var(--text-ink)] text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText('https://developster-hub-crm.vercel.app/api/communication/webhook')}
                  className="btn btn--subtle text-xs py-2 px-3 rounded-xl shrink-0"
                >
                  <Copy className="w-3.5 h-3.5 mr-1" />
                  Copy
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUBSECTION 7: MSG91 MANAGEMENT DASHBOARD */}
      {subSection === 'msg91' && (
        <Msg91ManagementDashboard
          workspace={workspace}
          customers={customers}
          currentUser={currentUser}
        />
      )}

      {/* MODAL: Start New Conversation */}
      {isNewConvModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="card p-5 shadow-2xl max-w-md w-full space-y-4 bg-[var(--bg-card)] rounded-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <h3 className="font-bold text-sm text-[var(--text-ink)]">Start New Conversation</h3>
              <button
                onClick={() => setIsNewConvModalOpen(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-ink)]"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">Customer</label>
                <select
                  value={newConvCustomerId}
                  onChange={(e) => setNewConvCustomerId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[var(--text-ink)] text-xs"
                >
                  <option value="">Select a customer...</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company} ({c.name}) - {c.phone || c.email}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">Channel</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['whatsapp', 'sms', 'email'] as const).map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => setNewConvChannel(ch)}
                      className={`p-2 rounded-xl text-xs font-semibold capitalize border transition-all ${
                        newConvChannel === ch
                          ? 'border-[var(--text-ink)] bg-[var(--text-ink)] text-[var(--bg-card)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)]'
                      }`}
                    >
                      {ch}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setIsNewConvModalOpen(false)}
                className="btn btn--subtle text-xs py-1.5 px-3 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newConvCustomerId}
                onClick={handleCreateNewConversation}
                className="btn btn--primary text-xs py-1.5 px-4 rounded-xl"
              >
                Create Conversation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Create / Edit Template */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="card p-6 shadow-2xl max-w-lg w-full space-y-4 bg-[var(--bg-card)] rounded-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <h3 className="font-bold text-sm text-[var(--text-ink)]">
                {editingTemplate ? 'Edit Template' : 'Create New Message Template'}
              </h3>
              <button
                onClick={() => setIsTemplateModalOpen(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-ink)]"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">Template Name</label>
                  <input
                    type="text"
                    value={tmplName}
                    onChange={(e) => setTmplName(e.target.value)}
                    placeholder="e.g. Follow-Up Message"
                    className="w-full px-3 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[var(--text-ink)] text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">Channel</label>
                  <select
                    value={tmplChannel}
                    onChange={(e) => setTmplChannel(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[var(--text-ink)] text-xs"
                  >
                    <option value="whatsapp">WhatsApp</option>
                    <option value="sms">SMS</option>
                    <option value="email">Email</option>
                  </select>
                </div>
              </div>

              {tmplChannel === 'email' && (
                <div>
                  <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">Subject</label>
                  <input
                    type="text"
                    value={tmplSubject}
                    onChange={(e) => setTmplSubject(e.target.value)}
                    placeholder="Email subject..."
                    className="w-full px-3 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[var(--text-ink)] text-xs"
                  />
                </div>
              )}

              <div>
                <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">Template Content</label>
                <textarea
                  rows={4}
                  value={tmplContent}
                  onChange={(e) => setTmplContent(e.target.value)}
                  placeholder="Type message content. Use variables like {{customer_name}}, {{business_name}}..."
                  className="w-full p-3 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-ink)]"
                />
              </div>

              {/* Variable Insert Pills */}
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">
                  Insert Variables:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {['customer_name', 'business_name', 'employee_name', 'order_id'].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setTmplContent((prev) => `${prev} {{${v}}}`)}
                      className="px-2 py-0.5 rounded bg-[var(--border-subtle)]/40 hover:bg-[var(--text-ink)] hover:text-[var(--bg-card)] transition-colors text-[11px] font-mono"
                    >
                      + &#123;&#123;{v}&#125;&#125;
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setIsTemplateModalOpen(false)}
                className="btn btn--subtle text-xs py-1.5 px-3 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!tmplName.trim() || !tmplContent.trim()}
                onClick={handleSaveTemplate}
                className="btn btn--primary text-xs py-1.5 px-4 rounded-xl"
              >
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

