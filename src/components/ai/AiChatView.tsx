'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Send,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  MessageSquare,
  Bot,
  User,
  ArrowRight,
  CheckSquare,
  Mail,
  Square,
  ExternalLink,
  HelpCircle,
  Database,
  Building,
} from 'lucide-react';
import { Lead, Workspace } from '@/types/crm';
import DOMPurify from 'isomorphic-dompurify';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  sourcesUsed?: string[];
  proposedActions?: {
    type: 'create_task' | 'draft_email' | 'open_lead';
    label: string;
    payload: any;
  }[];
}

interface ChatSession {
  id: string;
  title: string;
  workspaceId: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

interface AiChatViewProps {
  workspace: Workspace;
  leads: Lead[];
  onOpenLead?: (lead: Lead) => void;
  onNavigateToTab?: (tab: string) => void;
  onRefreshData?: () => void;
}

const QUICK_START_CHIPS = [
  'What should I focus on today?',
  'Which leads are going cold?',
  'Review my pipeline',
  'Draft a follow-up for a lead',
  'How do I handle this objection?',
  'How should I pitch DROS to an agency?',
];

export function AiChatView({
  workspace,
  leads,
  onOpenLead,
  onNavigateToTab,
  onRefreshData,
}: AiChatViewProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitleText, setEditingTitleText] = useState('');

  // @ Mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState<number>(-1);
  const [taggedLeadId, setTaggedLeadId] = useState<string | null>(null);

  // Abort controller for Stop button
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load chat sessions from server
  useEffect(() => {
    loadSessions();
  }, [workspace?.id]);

  const loadSessions = async () => {
    try {
      const res = await fetch(`/api/ai/chats?workspaceId=${workspace?.id || 'ws-default'}`);
      if (res.ok) {
        const data: ChatSession[] = await res.json();
        setSessions(data);
        if (data.length > 0 && !activeSessionId) {
          setActiveSessionId(data[0].id);
          setMessages(data[0].messages || []);
        } else if (data.length === 0) {
          handleNewChat();
        }
      }
    } catch (e) {
      console.error('Failed loading chat sessions:', e);
    }
  };

  const handleSelectSession = (session: ChatSession) => {
    setActiveSessionId(session.id);
    setMessages(session.messages || []);
  };

  const handleNewChat = () => {
    const newSession: ChatSession = {
      id: `chat-${Date.now()}`,
      workspaceId: workspace?.id || 'ws-default',
      title: 'New Conversation',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setMessages([]);

    fetch('/api/ai/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSession),
    }).catch(console.error);
  };

  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this conversation?')) return;

    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) {
      const remaining = sessions.filter((s) => s.id !== id);
      if (remaining.length > 0) {
        setActiveSessionId(remaining[0].id);
        setMessages(remaining[0].messages || []);
      } else {
        handleNewChat();
      }
    }

    await fetch(`/api/ai/chats?id=${id}`, { method: 'DELETE' });
  };

  const handleSaveTitle = async (id: string) => {
    if (!editingTitleText.trim()) return;
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title: editingTitleText.trim() } : s))
    );
    setEditingTitleId(null);

    await fetch('/api/ai/chats', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, title: editingTitleText.trim() }),
    });
  };

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Handle Input & Mention trigger
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursorPos);
    const lastAtMatch = textBeforeCursor.match(/@(\w*)$/);

    if (lastAtMatch) {
      setMentionQuery(lastAtMatch[1].toLowerCase());
      setMentionIndex(lastAtMatch.index!);
    } else {
      setMentionQuery(null);
    }
  };

  const handleSelectMention = (lead: Lead) => {
    if (mentionIndex >= 0) {
      const before = inputText.slice(0, mentionIndex);
      const after = inputText.slice(textareaRef.current?.selectionStart || mentionIndex);
      const inserted = `@${lead.company || lead.contactName} `;
      setInputText(before + inserted + after);
      setTaggedLeadId(lead.id);
      setMentionQuery(null);
      textareaRef.current?.focus();
    }
  };

  // Send message
  const handleSendMessage = async (textToSend?: string) => {
    const prompt = (textToSend || inputText).trim();
    if (!prompt || isLoading) return;

    setInputText('');
    setMentionQuery(null);

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: prompt,
      timestamp: new Date().toISOString(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setIsLoading(true);

    // Update session title if first message
    if (messages.length === 0 && activeSessionId) {
      const cleanTitle = prompt.slice(0, 32) + (prompt.length > 32 ? '...' : '');
      setSessions((prev) =>
        prev.map((s) => (s.id === activeSessionId ? { ...s, title: cleanTitle } : s))
      );
      fetch('/api/ai/chats', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activeSessionId, title: cleanTitle }),
      }).catch(console.error);
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          message: prompt,
          history: messages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
          workspaceId: workspace?.id || 'ws-default',
          activeLeadId: taggedLeadId || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Sales Manager response failed.');
      }

      const data = await res.json();
      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: data.text,
        timestamp: new Date().toISOString(),
        sourcesUsed: data.sourcesUsed || [],
        proposedActions: data.proposedActions || [],
      };

      const updatedMessages = [...newMessages, assistantMessage];
      setMessages(updatedMessages);

      // Persist to session
      if (activeSessionId) {
        fetch('/api/ai/chats', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: activeSessionId, messages: updatedMessages }),
        }).catch(console.error);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        const errorMsg: ChatMessage = {
          id: `msg-${Date.now() + 1}`,
          role: 'assistant',
          content: `⚠️ Error: ${err.message || 'Could not reach Sales Manager. Please try again.'}`,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
      setTaggedLeadId(null);
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
    }
  };

  const handleExecuteProposedAction = async (action: any) => {
    if (action.type === 'create_task') {
      try {
        const payload = action.payload || {};
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + (payload.dueOffsetDays || 1));

        await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId: workspace?.id || 'ws-default',
            title: payload.title || 'Follow-up Task',
            type: payload.taskType || 'follow_up',
            dueDate: dueDate.toISOString().split('T')[0],
            dueAt: dueDate.toISOString(),
            priority: 'high',
            status: 'open',
            source: 'auto',
          }),
        });

        alert('Task created successfully in CRM!');
        if (onRefreshData) onRefreshData();
      } catch (e) {
        console.error(e);
      }
    } else if (action.type === 'open_lead' && onOpenLead) {
      const target = leads.find((l) => l.id === action.payload?.leadId);
      if (target) onOpenLead(target);
    }
  };

  // Filter leads for @ mention
  const matchingLeads = mentionQuery !== null
    ? leads
        .filter(
          (l) =>
            l.contactName?.toLowerCase().includes(mentionQuery) ||
            l.company?.toLowerCase().includes(mentionQuery)
        )
        .slice(0, 5)
    : [];

  return (
    <div className="flex h-[calc(100vh-140px)] min-h-[580px] rounded-3xl bg-[var(--solid)] border border-[var(--border-subtle)] shadow-xs overflow-hidden">
      {/* LEFT SIDEBAR: CONVERSATION SESSIONS */}
      <div className="w-64 sm:w-72 bg-[var(--bg-main)] border-r border-[var(--border-subtle)] flex flex-col shrink-0">
        <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-[var(--butter)] text-[#252725] grid place-items-center font-bold">
              <Sparkles className="w-3.5 h-3.5 fill-current" />
            </div>
            <span className="font-bold text-xs text-[var(--text-ink)]">Conversations</span>
          </div>
          <button
            type="button"
            onClick={handleNewChat}
            className="p-1.5 rounded-xl bg-[var(--bg-card)] hover:bg-[var(--border-subtle)] text-[var(--text-ink)] transition-all cursor-pointer"
            title="New Chat"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2.5 space-y-1">
          {sessions.map((s) => {
            const isActive = s.id === activeSessionId;
            const isEditing = editingTitleId === s.id;

            return (
              <div
                key={s.id}
                onClick={() => handleSelectSession(s)}
                className={`group flex items-center justify-between p-2.5 rounded-2xl cursor-pointer text-xs transition-all ${
                  isActive
                    ? 'bg-[var(--bg-card)] text-[var(--text-ink)] font-bold shadow-2xs border border-[var(--border-subtle)]'
                    : 'text-[var(--text-muted)] hover:bg-[var(--bg-card)]/50 hover:text-[var(--text-ink)]'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                  {isEditing ? (
                    <input
                      type="text"
                      value={editingTitleText}
                      onChange={(e) => setEditingTitleText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle(s.id)}
                      autoFocus
                      className="w-full text-xs bg-transparent border-b border-[var(--text-ink)] outline-none"
                    />
                  ) : (
                    <span className="truncate">{s.title || 'Conversation'}</span>
                  )}
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {isEditing ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSaveTitle(s.id);
                      }}
                      className="p-1 hover:text-[var(--pine)]"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingTitleId(s.id);
                        setEditingTitleText(s.title);
                      }}
                      className="p-1 hover:text-[var(--text-ink)]"
                      title="Rename"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => handleDeleteSession(s.id, e)}
                    className="p-1 hover:text-[var(--tomato)]"
                    title="Delete"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT MAIN CHAT AREA */}
      <div className="flex-1 flex flex-col h-full bg-[var(--bg-card)] relative">
        {/* Chat Header */}
        <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-card)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[var(--butter)] text-[#252725] grid place-items-center shadow-xs">
              <Bot className="w-4 h-4 fill-current" />
            </div>
            <div>
              <h3 className="font-bold text-xs text-[var(--text-ink)]">AI Sales Manager</h3>
              <p className="text-[10px] text-[var(--text-muted)]">Developster Hub • Grounded in CRM Data & DROS</p>
            </div>
          </div>
          <span className="badge badge--pine text-[10px]">
            Ready
          </span>
        </div>

        {/* Messages List */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
          {/* Quick-Start Chips if no messages */}
          {messages.length === 0 && (
            <div className="py-12 max-w-xl mx-auto text-center space-y-5 animate-in fade-in">
              <div className="w-12 h-12 rounded-3xl bg-[var(--butter)] text-[#252725] grid place-items-center mx-auto shadow-xs">
                <Sparkles className="w-6 h-6 fill-current" />
              </div>
              <div>
                <h4 className="font-extrabold text-base text-[var(--text-ink)]">
                  How can I help you close more deals today?
                </h4>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Ask me about active pipeline health, draft a message for a lead, or discuss objection playbooks.
                </p>
              </div>

              <div className="flex flex-wrap justify-center gap-2 pt-2">
                {QUICK_START_CHIPS.map((chip, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSendMessage(chip)}
                    className="px-3.5 py-2 rounded-2xl bg-[var(--bg-main)] hover:bg-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-ink)] border border-[var(--border-subtle)] transition-all cursor-pointer shadow-2xs hover:scale-[1.02]"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Render Messages */}
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-3xl ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
              >
                <div
                  className={`w-7 h-7 rounded-full grid place-items-center shrink-0 mt-1 shadow-2xs ${
                    isUser
                      ? 'bg-[var(--solid)] text-[var(--text-ink)] border border-[var(--border-subtle)]'
                      : 'bg-[var(--butter)] text-[#252725]'
                  }`}
                >
                  {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5 fill-current" />}
                </div>

                <div className="space-y-2 min-w-0">
                  <div
                    className={`p-4 rounded-3xl text-xs leading-relaxed ${
                      isUser
                        ? 'bg-[var(--text-ink)] text-white rounded-tr-none'
                        : 'bg-[var(--bg-main)] text-[var(--text-ink)] border border-[var(--border-subtle)] rounded-tl-none shadow-2xs whitespace-pre-wrap'
                    }`}
                  >
                    {msg.content}
                  </div>

                  {/* Sources Used Badge */}
                  {!isUser && msg.sourcesUsed && msg.sourcesUsed.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-[var(--text-muted)] pl-2">
                      <Database className="w-3 h-3 text-[var(--pine)] shrink-0" />
                      <span>Used:</span>
                      {msg.sourcesUsed.map((src, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded-full bg-[var(--bg-main)] border border-[var(--border-subtle)] font-medium text-[var(--text-ink)]"
                        >
                          {src}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Proposed Action Buttons */}
                  {!isUser && msg.proposedActions && msg.proposedActions.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap pl-2 pt-1">
                      {msg.proposedActions.map((act, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => handleExecuteProposedAction(act)}
                          className="px-3 py-1.5 rounded-full bg-[var(--pine)] text-white text-[11px] font-bold hover:opacity-90 transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>{act.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Loading Indicator */}
          {isLoading && (
            <div className="flex gap-3 max-w-xl animate-in fade-in">
              <div className="w-7 h-7 rounded-full bg-[var(--butter)] text-[#252725] grid place-items-center shrink-0 shadow-2xs">
                <Bot className="w-3.5 h-3.5 fill-current" />
              </div>
              <div className="p-3.5 rounded-3xl bg-[var(--bg-main)] border border-[var(--border-subtle)] flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <span className="w-2 h-2 rounded-full bg-[var(--pine)] animate-ping" />
                <span>Consulting CRM records & company knowledge...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar & @ Autocomplete Popup */}
        <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-card)] relative">
          {/* @ Mention Autocomplete Popup */}
          {matchingLeads.length > 0 && (
            <div className="absolute bottom-full mb-2 left-4 w-72 bg-white rounded-2xl border border-[var(--border-subtle)] shadow-xl overflow-hidden z-30 animate-in slide-in-from-bottom-2">
              <div className="p-2 bg-[var(--bg-main)] border-b border-[var(--border-subtle)] text-[10px] font-bold text-[var(--text-muted)] flex items-center gap-1">
                <Building className="w-3 h-3" />
                <span>Mention Lead from CRM:</span>
              </div>
              <div className="p-1 max-h-48 overflow-y-auto">
                {matchingLeads.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => handleSelectMention(l)}
                    className="w-full text-left p-2 rounded-xl hover:bg-[var(--bg-main)] text-xs flex items-center justify-between cursor-pointer"
                  >
                    <div className="min-w-0">
                      <span className="font-bold text-[var(--text-ink)] block truncate">
                        {l.company || l.contactName}
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)] block truncate">
                        {l.contactName} • {l.status}
                      </span>
                    </div>
                    {l.value ? (
                      <span className="text-[10px] font-bold text-[var(--pine)]">
                        ${l.value.toLocaleString()}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Form */}
          <div className="flex items-end gap-2 p-1.5 rounded-3xl bg-[var(--bg-main)] border border-[var(--border-subtle)] focus-within:border-[var(--text-ink)] transition-all">
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Ask your Sales Manager (type @ to reference any lead)..."
              className="flex-1 bg-transparent border-none text-xs text-[var(--text-ink)] placeholder-[var(--text-muted)] p-2.5 resize-none max-h-32 focus:outline-none"
            />

            {isLoading ? (
              <button
                type="button"
                onClick={handleStop}
                className="px-3 py-2 rounded-2xl bg-[var(--tomato)] text-white text-xs font-bold hover:opacity-90 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleSendMessage()}
                disabled={!inputText.trim()}
                className="p-2.5 rounded-full bg-[var(--text-ink)] text-white hover:opacity-90 disabled:opacity-30 transition-all cursor-pointer"
                title="Send Message"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] px-3 pt-1.5">
            <span>Type <strong>@</strong> to mention any CRM lead</span>
            <span>Safety protected: Lead notes are treated as data, not instructions</span>
          </div>
        </div>
      </div>
    </div>
  );
}

