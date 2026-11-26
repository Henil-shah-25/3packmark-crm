'use client';

import React, { useState, useEffect } from 'react';
import { SidebarRail } from '@/components/layout/SidebarRail';
import { TopNav } from '@/components/layout/TopNav';
import { OverviewView } from '@/components/overview/OverviewView';
import { PipelineView } from '@/components/pipeline/PipelineView';
import { PipelineManagementView } from '@/components/pipeline/PipelineManagementView';
import { DealDetailDrawer } from '@/components/deal/DealDetailDrawer';
import { NewDealModal } from '@/components/deal/NewDealModal';
import { CustomersView } from '@/components/customers/CustomersView';
import { ScheduleView } from '@/components/schedule/ScheduleView';
import { AutomationsView } from '@/components/automations/AutomationsView';
import { EmailView } from '@/components/email/EmailView';
import { SettingsView } from '@/components/settings/SettingsView';
import { SheetsImportModal } from '@/components/sheets/SheetsImportModal';
import { CreateWorkspaceModal } from '@/components/layout/CreateWorkspaceModal';
import { SearchModal } from '@/components/layout/SearchModal';
import { TemplatesView } from '@/components/templates/TemplatesView';
import { ProductsView } from '@/components/products/ProductsView';
import { getStageExitClearUpdates } from '@/lib/pipeline/stage-rules';
import { SEED_PRODUCTS } from '@/lib/google-sheets/seed-products';
import {
  Workspace,
  Pipeline,
  PipelineStage,
  Lead,
  Customer,
  Task,
  TeamMember,
  AutomationRule,
  AutomationRun,
  CalendarEvent,
  EmailTemplate,
  AppNotification,
  Product,
} from '@/types/crm';
import {
  SEED_WORKSPACE,
  SEED_MEMBERS,
  SEED_PIPELINES,
  SEED_STAGES,
  SEED_LEADS,
  SEED_CUSTOMERS,
  SEED_TASKS,
  SEED_AUTOMATIONS,
  SEED_EMAIL_TEMPLATES,
} from '@/lib/google-sheets/seed-data';

export default function RapportCRMApp() {
  const [currentSection, setCurrentSection] = useState('Overview');
  const [currentUser, setCurrentUser] = useState<TeamMember | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(async (r) => {
        if (!r.ok) {
          window.location.replace('/login');
          return;
        }
        const data = await r.json().catch(() => null);
        if (!data?.authenticated) {
          window.location.replace('/login');
          return;
        }
        if (data?.user) {
          setCurrentUser(data.user);
        }
        setAuthChecked(true);
      })
      .catch(() => {
        window.location.replace('/login');
      });
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const syncSectionFromUrl = () => {
        const params = new URLSearchParams(window.location.search);
        const sectionParam = params.get('section');
        if (sectionParam && !['Pulse', 'AI', 'Communication'].includes(sectionParam)) {
          setCurrentSection(sectionParam);
        }
      };

      syncSectionFromUrl();
      window.addEventListener('popstate', syncSectionFromUrl);
      return () => window.removeEventListener('popstate', syncSectionFromUrl);
    }
  }, []);

  const handleSelectSection = (section: string) => {
    setCurrentSection(section);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('section', section);
      window.history.pushState({ section }, '', url.toString());
    }
  };

  // Core Data States
  const [automationToast, setAutomationToast] = useState<{
    triggered: boolean;
    workflowName?: string;
    emailSentTo?: string;
    reason?: string;
  } | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([SEED_WORKSPACE]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace>(SEED_WORKSPACE);
  const [pipelines, setPipelines] = useState<Pipeline[]>(SEED_PIPELINES);
  const [activePipeline, setActivePipeline] = useState<Pipeline>(SEED_PIPELINES[0]);
  const [stages, setStages] = useState<PipelineStage[]>(SEED_STAGES);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [automations, setAutomations] = useState<AutomationRule[]>(SEED_AUTOMATIONS);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>(SEED_EMAIL_TEMPLATES);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [products, setProducts] = useState<Product[]>(SEED_PRODUCTS);

  // Storage connection status
  const [storageStatus, setStorageStatus] = useState<{
    isLiveGoogleSheets: boolean;
    spreadsheetId?: string;
    sheetTitle?: string;
    message?: string;
  }>({
    isLiveGoogleSheets: false,
    message: 'Local storage active. Real data ready.',
  });

  // Modal & Drawer States
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isNewDealModalOpen, setIsNewDealModalOpen] = useState(false);
  const [newDealDefaultStage, setNewDealDefaultStage] = useState<string | undefined>();
  const [isSheetsImportOpen, setIsSheetsImportOpen] = useState(false);
  const [isCreateWorkspaceOpen, setIsCreateWorkspaceOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Restore saved workspace on client mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedWsId = localStorage.getItem('rapport_active_workspace_id');
      if (savedWsId && savedWsId !== activeWorkspace.id) {
        setActiveWorkspace((prev) => ({ ...prev, id: savedWsId }));
      }
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadAllData();
  }, [activeWorkspace.id]);

  // Tab hidden listener to pause ambient animations
  useEffect(() => {
    const handleVisibility = () => {
      document.body.classList.toggle('tab-hidden', document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Global key listener for Ctrl+K search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const loadAllData = async () => {
    try {
      // Trigger non-blocking due automation evaluation when Dashboard/Pipeline loads
      fetch('/api/automations/process-due', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: activeWorkspace.id }),
      }).catch(() => null);

      // Fast single-request batch bootstrap to avoid rate-limiting and quota exhaustion
      const bootRes = await fetch(`/api/crm/bootstrap?workspaceId=${activeWorkspace.id}`, { cache: 'no-store' }).catch(() => null);
      if (bootRes && bootRes.ok) {
        const data = await bootRes.json();
        if (data.status) {
          setStorageStatus(data.status);
        }
        if (Array.isArray(data.workspaces) && data.workspaces.length > 0) {
          setWorkspaces((prev) => {
            const map = new Map<string, Workspace>();
            for (const w of prev) {
              if (w?.id) map.set(w.id, w);
            }
            for (const w of data.workspaces) {
              if (w?.id) map.set(w.id, w);
            }
            return Array.from(map.values());
          });
        }
        if (Array.isArray(data.pipelines) && data.pipelines.length > 0) {
          setPipelines(data.pipelines);
          const matchedPipe = data.pipelines.find((p: Pipeline) => p.id === activePipeline.id) || data.pipelines[0];
          setActivePipeline(matchedPipe);
          if (matchedPipe.stages?.length > 0) {
            setStages(matchedPipe.stages);
          }
        }
        if (Array.isArray(data.leads)) {
          setLeads(data.leads);
        }
        if (Array.isArray(data.customers)) {
          const seenCust = new Set<string>();
          const uniqueCust = data.customers.filter((c: Customer) => {
            if (!c?.id || seenCust.has(c.id)) return false;
            seenCust.add(c.id);
            return true;
          });
          setCustomers(uniqueCust);
        }
        if (Array.isArray(data.tasks)) {
          setTasks(data.tasks);
        }
        if (Array.isArray(data.automations)) {
          setAutomations(data.automations);
        }
        if (Array.isArray(data.calendarEvents)) {
          setCalendarEvents(data.calendarEvents);
        }
        if (Array.isArray(data.members)) {
          setMembers(data.members);
        }
        if (Array.isArray(data.products)) {
          setProducts(data.products);
        }
        return;
      }

      // Parallelize all CRM data fetching in parallel for maximum speed and instant loading
      const [statusRes, wsRes, pipeRes, leadsRes, custRes, tasksRes, autoRes, calRes, membersRes, notifRes] = await Promise.allSettled([
        fetch('/api/sheets/status').then((r) => (r.ok ? r.json() : null)),
        fetch('/api/workspaces').then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/pipelines?workspaceId=${activeWorkspace.id}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/leads?workspaceId=${activeWorkspace.id}`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/customers?workspaceId=${activeWorkspace.id}`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/tasks?workspaceId=${activeWorkspace.id}`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/automations?workspaceId=${activeWorkspace.id}`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/calendar?workspaceId=${activeWorkspace.id}`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/members?workspaceId=${activeWorkspace.id}`).then((r) => (r.ok ? r.json() : null)),
        fetch(`/api/notifications?workspaceId=${activeWorkspace.id}`).then((r) => (r.ok ? r.json() : null)),
      ]);

      if (statusRes.status === 'fulfilled' && statusRes.value) {
        setStorageStatus(statusRes.value);
      }
      if (wsRes.status === 'fulfilled' && Array.isArray(wsRes.value) && wsRes.value.length > 0) {
        setWorkspaces((prev) => {
          const map = new Map<string, Workspace>();
          for (const w of prev) {
            if (w?.id) map.set(w.id, w);
          }
          for (const w of wsRes.value) {
            if (w?.id) map.set(w.id, w);
          }
          return Array.from(map.values());
        });
      }
      if (pipeRes.status === 'fulfilled' && Array.isArray(pipeRes.value) && pipeRes.value.length > 0) {
        setPipelines(pipeRes.value);
        const matchedPipe = pipeRes.value.find((p: Pipeline) => p.id === activePipeline.id) || pipeRes.value[0];
        setActivePipeline(matchedPipe);
        if (matchedPipe.stages?.length > 0) {
          setStages(matchedPipe.stages);
        }
      }
      if (leadsRes.status === 'fulfilled' && Array.isArray(leadsRes.value)) {
        setLeads(leadsRes.value);
      }
      if (custRes.status === 'fulfilled' && Array.isArray(custRes.value)) {
        const seenCust = new Set<string>();
        const uniqueCust = custRes.value.filter((c: Customer) => {
          if (!c?.id || seenCust.has(c.id)) return false;
          seenCust.add(c.id);
          return true;
        });
        setCustomers(uniqueCust);
      }
      if (tasksRes.status === 'fulfilled' && Array.isArray(tasksRes.value)) {
        setTasks(tasksRes.value);
      }
      if (autoRes.status === 'fulfilled' && autoRes.value) {
        if (autoRes.value.automations) setAutomations(autoRes.value.automations);
        if (autoRes.value.runs) setRuns(autoRes.value.runs);
      }
      if (calRes.status === 'fulfilled' && Array.isArray(calRes.value)) {
        setCalendarEvents(calRes.value);
      }
      if (membersRes.status === 'fulfilled' && Array.isArray(membersRes.value)) {
        setMembers(membersRes.value);
      }
      if (notifRes.status === 'fulfilled' && notifRes.value?.notifications) {
        setNotifications(notifRes.value.notifications);
      }
    } catch (err) {
      console.error('Error fetching CRM data:', err);
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: activeWorkspace.id, action: 'mark_all_read' }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch (err) {
      console.error('Failed to mark notifications read:', err);
    }
  };

  // --- ACTIONS ---

  const handleCreateDeal = async (dealData: any) => {
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: activeWorkspace.id,
        pipelineId: activePipeline.id,
        ...dealData,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to create lead (${res.status})`);
    }
    const newDeal = await res.json();
    setLeads((prev) => [newDeal, ...prev]);
    return newDeal;
  };

  // Optimistic UI updates with automatic rollback on network failure
  const handleUpdateLeadStage = async (
    leadId: string,
    stageId: string,
    extraUpdates?: Partial<Lead>
  ) => {
    const previousLeads = [...leads];
    const targetLead = leads.find((l) => l.id === leadId);
    if (!targetLead) return;

    let updatedStatus = targetLead.status;
    let updatedProb = targetLead.closingProbability;
    const now = new Date().toISOString();
    let wonAt = targetLead.wonAt;
    let lostAt = targetLead.lostAt;

    if (stageId === 'stg-won' || stageId === 'stg-closed') {
      updatedStatus = 'Won';
      updatedProb = 100;
      wonAt = now;
    } else if (stageId === 'stg-loss') {
      updatedStatus = 'Lost';
      updatedProb = 0;
      lostAt = now;
    } else if (targetLead.status === 'Won' || targetLead.status === 'Lost') {
      // Reopened deal
      updatedStatus = 'Qualified';
      updatedProb = 50;
    }

    const stageClearUpdates = getStageExitClearUpdates(stageId);

    const optimisticLead: Lead = {
      ...targetLead,
      ...stageClearUpdates,
      ...extraUpdates,
      stageId,
      status: updatedStatus,
      closingProbability: updatedProb,
      wonAt,
      lostAt,
      updatedAt: now,
    };

    // 1. Instant optimistic update
    setLeads((prev) => prev.map((l) => (l.id === leadId ? optimisticLead : l)));
    if (selectedLead?.id === leadId) setSelectedLead(optimisticLead);

    // 2. Background Google Sheets persistence with rollback on failure
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: activeWorkspace.id,
          stageId,
          status: updatedStatus,
          closingProbability: updatedProb,
          wonAt,
          lostAt,
          ...stageClearUpdates,
          ...extraUpdates,
        }),
      });
      if (res.ok) {
        const persisted = await res.json();
        const merged = { ...optimisticLead, ...persisted, stageId };
        setLeads((prev) => prev.map((l) => (l.id === leadId ? merged : l)));
        if (selectedLead?.id === leadId) setSelectedLead(merged);
        if (persisted?.automationResult) {
          setAutomationToast(persisted.automationResult);
          setTimeout(() => setAutomationToast(null), 6000);
        }
      } else {
        throw new Error(`Server returned status ${res.status}`);
      }
    } catch (err) {
      console.error('[handleUpdateLeadStage] Write failed, rolling back optimistic update:', err);
      setLeads(previousLeads);
      if (selectedLead?.id === leadId) setSelectedLead(targetLead);
      alert('Failed to update stage in Google Sheets. The change has been rolled back.');
    }
  };

  const handleMarkWon = async (lead: Lead) => {
    const previousLeads = [...leads];
    const now = new Date().toISOString();
    const closedStageId =
      stages.find((s) => s.name?.trim().toLowerCase() === 'closed')?.id || 'stg-closed';
    const optimisticLead: Lead = {
      ...lead,
      stageId: closedStageId,
      status: 'Won',
      closingProbability: 100,
      wonAt: now,
      updatedAt: now,
    };

    setLeads((prev) => prev.map((l) => (l.id === lead.id ? optimisticLead : l)));
    setTasks((prev) =>
      prev.map((t) =>
        t.leadId === lead.id ? { ...t, completed: true, status: 'done', completedAt: now } : t
      )
    );
    if (selectedLead?.id === lead.id) setSelectedLead(optimisticLead);

    try {
      const res = await fetch(`/api/leads/${lead.id}/won`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: activeWorkspace.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setLeads((prev) => prev.map((l) => (l.id === lead.id ? data.deal : l)));
        if (selectedLead?.id === lead.id) setSelectedLead(data.deal);
      } else {
        throw new Error('Won API failed');
      }
    } catch (err) {
      console.error('[handleMarkWon] Failed, rolling back:', err);
      setLeads(previousLeads);
      if (selectedLead?.id === lead.id) setSelectedLead(lead);
      alert('Failed to save Won deal to Google Sheets. Rolled back.');
    }
  };

  const handleMarkLost = async (lead: Lead, reason: string) => {
    const previousLeads = [...leads];
    const now = new Date().toISOString();
    const optimisticLead: Lead = {
      ...lead,
      stageId: 'stg-loss',
      status: 'Lost',
      closingProbability: 0,
      lostAt: now,
      lossReason: reason,
      updatedAt: now,
    };

    setLeads((prev) => prev.map((l) => (l.id === lead.id ? optimisticLead : l)));
    if (selectedLead?.id === lead.id) setSelectedLead(optimisticLead);

    try {
      const res = await fetch(`/api/leads/${lead.id}/lost`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: activeWorkspace.id, lossReason: reason }),
      });
      if (res.ok) {
        const data = await res.json();
        setLeads((prev) => prev.map((l) => (l.id === lead.id ? data.deal : l)));
        if (selectedLead?.id === lead.id) setSelectedLead(data.deal);
      } else {
        throw new Error('Lost API failed');
      }
    } catch (err) {
      console.error('[handleMarkLost] Failed, rolling back:', err);
      setLeads(previousLeads);
      if (selectedLead?.id === lead.id) setSelectedLead(lead);
      alert('Failed to save Lost deal to Google Sheets. Rolled back.');
    }
  };

  const handleDeleteLead = async (leadId: string, label?: string) => {
    const confirmMsg = label
      ? `Delete ${label}? This cannot be undone.`
      : 'Are you sure you want to delete this deal?';
    if (!confirm(confirmMsg)) return;
    const res = await fetch(`/api/leads/${leadId}?workspaceId=${activeWorkspace.id}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
      setSelectedLead(null);
    }
  };

  const handleUpdateLeadDetails = async (leadId: string, updates: Partial<Lead>) => {
    const previousLeads = [...leads];
    const targetLead = leads.find((l) => l.id === leadId);
    if (!targetLead) return;

    const now = new Date().toISOString();
    const optimisticLead: Lead = {
      ...targetLead,
      ...updates,
      updatedAt: now,
    };

    setLeads((prev) => prev.map((l) => (l.id === leadId ? optimisticLead : l)));
    if (selectedLead?.id === leadId) setSelectedLead(optimisticLead);

    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: activeWorkspace.id, ...updates }),
      });
      if (res.ok) {
        const persisted = await res.json();
        setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...optimisticLead, ...persisted } : l)));
        if (selectedLead?.id === leadId) setSelectedLead((prev) => (prev ? { ...prev, ...persisted } : null));
      } else {
        throw new Error(`Server returned status ${res.status}`);
      }
    } catch (err) {
      console.error('[handleUpdateLeadDetails] Write failed, rolling back:', err);
      setLeads(previousLeads);
      if (selectedLead?.id === leadId) setSelectedLead(targetLead);
      alert('Failed to update lead details.');
    }
  };

  const handleToggleTask = async (taskId: string, completed: boolean) => {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: activeWorkspace.id, completed }),
    });
    if (res.ok) {
      const updated = await res.json();
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
    }
  };

  const handleRescheduleTask = async (taskId: string, newDueDate: string) => {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: activeWorkspace.id,
        dueDate: newDueDate,
        dueAt: new Date(`${newDueDate}T09:00:00.000Z`).toISOString(),
        status: 'open',
        completed: false,
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
    }
  };

  const handleCreateTask = async (taskData: any) => {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskData),
    });
    if (res.ok) {
      const newTask = await res.json();
      setTasks((prev) => [newTask, ...prev]);
    }
  };

  const handleScheduleMeeting = async (eventData: any) => {
    const res = await fetch('/api/calendar/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: activeWorkspace.id, ...eventData }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.event) {
        setCalendarEvents((prev) => [data.event, ...prev]);
      }
      loadAllData();
    }
  };

  const handleRescheduleMeeting = async (eventId: string, newStart: string, newEnd: string) => {
    const res = await fetch(`/api/calendar/events/${eventId}?workspaceId=${activeWorkspace.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startIso: newStart, endIso: newEnd }),
    });
    if (res.ok) {
      setCalendarEvents((prev) =>
        prev.map((e) => (e.id === eventId ? { ...e, startIso: newStart, endIso: newEnd } : e))
      );
      loadAllData();
    }
  };

  const handleCancelMeeting = async (eventId: string) => {
    const res = await fetch(`/api/calendar/events/${eventId}?workspaceId=${activeWorkspace.id}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setCalendarEvents((prev) =>
        prev.map((e) => (e.id === eventId ? { ...e, status: 'cancelled' } : e))
      );
      loadAllData();
    }
  };

  const handleSendEmail = async (emailData: any) => {
    await fetch('/api/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: activeWorkspace.id, ...emailData }),
    });
  };

  const handleSaveAutomationRule = async (ruleData: any) => {
    const res = await fetch('/api/automations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: activeWorkspace.id, rule: ruleData }),
    });
    if (res.ok) {
      const data = await res.json();
      const saved = data.rule;
      setAutomations((prev) => {
        const exists = prev.some((r) => r.id === saved.id);
        if (exists) return prev.map((r) => (r.id === saved.id ? saved : r));
        return [saved, ...prev];
      });
    }
  };

  const handleDeleteAutomationRule = async (ruleId: string) => {
    const res = await fetch(`/api/automations?workspaceId=${activeWorkspace.id}&id=${ruleId}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setAutomations((prev) => prev.filter((r) => r.id !== ruleId));
    }
  };

  const handleTestAutomationRule = async (rule: AutomationRule) => {
    const res = await fetch('/api/automations/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: activeWorkspace.id, rule }),
    });
    if (res.ok) {
      return await res.json();
    }
    throw new Error('Test request failed');
  };

  const handleCreateWorkspace = async (data: any) => {
    const res = await fetch('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const newWs = await res.json();
      setWorkspaces((prev) => {
        const map = new Map<string, Workspace>();
        for (const w of prev) {
          if (w?.id) map.set(w.id, w);
        }
        if (newWs?.id) map.set(newWs.id, newWs);
        return Array.from(map.values());
      });
      setActiveWorkspace(newWs);
      if (typeof window !== 'undefined' && newWs?.id) {
        localStorage.setItem('rapport_active_workspace_id', newWs.id);
      }
    }
  };

  const handleExportCSV = () => {
    const headers = [
      'ID', 'Title', 'Company', 'Contact', 'Email', 'Phone', 'Alternate Phone', 'WhatsApp',
      'Designation', 'Value', 'Stage', 'Status', 'Industry', 'Website', 'City', 'State', 'Country',
      'GST Tax ID', 'Notes', 'Close Date'
    ];
    const rows = leads.map((l) => [
      l.id,
      `"${(l.title || '').replace(/"/g, '""')}"`,
      `"${(l.company || '').replace(/"/g, '""')}"`,
      `"${(l.contactName || '').replace(/"/g, '""')}"`,
      l.email || '',
      l.phone || '',
      l.alternatePhone || '',
      l.whatsappNumber || '',
      `"${(l.designation || '').replace(/"/g, '""')}"`,
      l.value || 0,
      l.stageId,
      l.status,
      `"${(l.industry || '').replace(/"/g, '""')}"`,
      `"${(l.website || '').replace(/"/g, '""')}"`,
      `"${(l.city || '').replace(/"/g, '""')}"`,
      `"${(l.state || '').replace(/"/g, '""')}"`,
      `"${(l.country || '').replace(/"/g, '""')}"`,
      `"${(l.gstTaxId || '').replace(/"/g, '""')}"`,
      `"${(l.notes || '').replace(/"/g, '""')}"`,
      l.expectedCloseDate || '',
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${activeWorkspace.slug}-leads-export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!authChecked) {
    return null;
  }

  return (
    <div className="relative min-h-screen bg-[var(--bg-main)] text-[var(--text-primary)] font-sans overflow-x-clip selection:bg-[#F2C94C]/30">
      {/* Reference Ambient Mesh Glow */}
      <div className="mesh" aria-hidden="true">
        <i className="mesh__a" />
        <i className="mesh__b" />
        <i className="mesh__c" />
      </div>

      {/* Vertical Navigation Rail (Fixed Dock) */}
      <SidebarRail
        activeSection={currentSection}
        onNavigate={handleSelectSection}
        onOpenNewDeal={() => {
          setNewDealDefaultStage(undefined);
          setIsNewDealModalOpen(true);
        }}
        onOpenSearch={() => setIsSearchOpen(true)}
      />

      {/* Main Single-Column App Container with exact padding */}
      <div className="app">
        {/* Top Header Bar */}
        <TopNav
          currentSection={currentSection}
          onSelectSection={handleSelectSection}
          workspaces={workspaces}
          activeWorkspace={activeWorkspace}
          onSwitchWorkspace={(ws) => {
            setActiveWorkspace(ws);
            if (typeof window !== 'undefined' && ws?.id) {
              localStorage.setItem('rapport_active_workspace_id', ws.id);
            }
          }}
          onOpenCreateWorkspace={() => setIsCreateWorkspaceOpen(true)}
          storageStatus={storageStatus}
          unreadNotificationsCount={notifications.filter((n) => !n.isRead).length}
          notifications={notifications}
          onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
          onOpenLead={(leadId) => {
            const l = leads.find((x) => x.id === leadId);
            if (l) setSelectedLead(l);
          }}
          currentUser={currentUser}
        />

        {/* Content View Container */}
        <main className="w-full flex flex-col min-w-0">
          {/* Section Router */}
          {currentSection === 'Overview' && (
            <OverviewView
              workspace={activeWorkspace}
              leads={leads}
              customers={customers}
              stages={stages}
              tasks={tasks}
              members={members}
              onSelectLead={(l) => {
                handleSelectSection('Pipeline');
                setSelectedLead(l);
              }}
              onSelectDealFromTask={(task) => {
                const { resolveActiveDealForTask } = require('@/lib/tasks/queues');
                const res = resolveActiveDealForTask(task, leads, stages, {
                  customers,
                  allowClosedFallback: true,
                });
                const matched = res.deal;

                if (matched) {
                  // Auto-heal task.dealId / task.leadId in Google Sheets when Step 2 or Step 3 resolves an active deal
                  if (res.remapped && task.id && task.leadId !== matched.id) {
                    setTasks((prev) =>
                      prev.map((t) =>
                        t.id === task.id
                          ? { ...t, leadId: matched.id, dealTitle: matched.title || t.dealTitle }
                          : t
                      )
                    );
                    fetch(`/api/tasks/${task.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        workspaceId: activeWorkspace.id,
                        dealId: matched.id,
                        leadId: matched.id,
                        dealTitle: matched.title,
                      }),
                    }).catch(() => null);
                  }
                  handleSelectSection('Pipeline');
                  setSelectedLead(matched);
                  return true;
                }
                return false;
              }}
              onOpenNewDeal={() => {
                setNewDealDefaultStage(undefined);
                setIsNewDealModalOpen(true);
              }}
              onNavigateToPipeline={() => handleSelectSection('Pipeline')}
              onOpenSchedule={() => handleSelectSection('Schedule')}
              onToggleTask={handleToggleTask}
              onRescheduleTask={handleRescheduleTask}
            />
          )}

          {currentSection === 'Pipeline' && (
            <PipelineView
              pipeline={activePipeline}
              pipelines={pipelines}
              onSelectPipeline={(pId) => {
                const found = pipelines.find((p) => p.id === pId);
                if (found) {
                  setActivePipeline(found);
                  if (found.stages && found.stages.length > 0) setStages(found.stages);
                }
              }}
              stages={stages}
              leads={leads}
              members={members}
              currency={activeWorkspace.currency || 'INR'}
              workspace={activeWorkspace}
              onOpenSheetsImport={() => setIsSheetsImportOpen(true)}
              onSelectLead={(l) => {
                handleSelectSection('Pipeline');
                setSelectedLead(l);
              }}
              onOpenNewDeal={(stageId) => {
                setNewDealDefaultStage(stageId);
                setIsNewDealModalOpen(true);
              }}
              onUpdateLeadStage={handleUpdateLeadStage}
              onMarkDealWon={handleMarkWon}
              onMarkDealLost={(lead) => handleMarkLost(lead, 'Closed lost from board dropzone')}
              onDeleteLead={(lead) => handleDeleteLead(lead.id, lead.company || lead.title)}
              onExportCSV={handleExportCSV}
              onRefreshLeads={loadAllData}
            />
          )}

          {(currentSection === 'PipelineManagement' || currentSection === 'Pipelines') && (
            <PipelineManagementView
              workspace={activeWorkspace}
              pipelines={pipelines}
              stages={stages}
              leads={leads}
              members={members}
              currentUser={members[0] || null}
              onSavePipeline={async (p) => {
                const res = await fetch('/api/pipelines', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ workspaceId: activeWorkspace.id, pipeline: p }),
                });
                if (res.ok) {
                  const saved = await res.json();
                  setPipelines((prev) => [...prev.filter((item) => item.id !== saved.id), saved]);
                  setActivePipeline(saved);
                  if (saved.stages && saved.stages.length > 0) setStages(saved.stages);
                }
              }}
              onNavigateToPipeline={(pId) => {
                const found = pipelines.find((p) => p.id === pId);
                if (found) {
                  setActivePipeline(found);
                  if (found.stages && found.stages.length > 0) setStages(found.stages);
                }
                setCurrentSection('Pipeline');
              }}
            />
          )}

          {currentSection === 'Customers' && (
            <CustomersView
              workspace={activeWorkspace}
              customers={customers}
              leads={leads}
              stages={stages}
              tasks={tasks}
              members={members}
              onSelectLead={(l) => {
                handleSelectSection('Pipeline');
                setSelectedLead(l);
              }}
              onOpenNewDeal={() => {
                setNewDealDefaultStage(undefined);
                setIsNewDealModalOpen(true);
              }}
              onCreateTask={handleCreateTask}
              onUpdateLeadRecord={async (leadId, updates) => {
                await fetch(`/api/leads/${leadId}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ workspaceId: activeWorkspace.id, ...updates }),
                });
                await loadAllData();
              }}
              onAddCustomer={async (custData) => {
                const res = await fetch('/api/customers', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ workspaceId: activeWorkspace.id, ...custData }),
                });
                if (res.ok) {
                  const saved = await res.json();
                  setCustomers((prev) => {
                    const withoutExisting = prev.filter((c) => c.id !== saved.id && c.company.toLowerCase() !== saved.company.toLowerCase());
                    return [saved, ...withoutExisting];
                  });
                } else {
                  const err = await res.json().catch(() => ({}));
                  throw new Error(err.error || `Failed to create customer (${res.status})`);
                }
              }}
            />
          )}

          {currentSection === 'Products' && (
            <ProductsView
              workspace={activeWorkspace}
              products={products}
              currentUser={currentUser}
              onProductsChanged={loadAllData}
            />
          )}

          {currentSection === 'Schedule' && (
            <ScheduleView
              workspace={activeWorkspace}
              tasks={tasks}
              calendarEvents={calendarEvents}
              members={members}
              leads={leads}
              onToggleTask={handleToggleTask}
              onCreateTask={handleCreateTask}
              onScheduleMeeting={handleScheduleMeeting}
              onRescheduleMeeting={handleRescheduleMeeting}
              onCancelMeeting={handleCancelMeeting}
              onRefreshEvents={loadAllData}
            />
          )}

          {currentSection === 'Automations' && (
            <AutomationsView
              workspace={activeWorkspace}
              automations={automations}
              runs={runs}
              stages={stages}
              pipelines={pipelines}
              templates={emailTemplates}
              leads={leads}
              members={members}
              onSaveRule={handleSaveAutomationRule}
              onTestRule={handleTestAutomationRule}
              onDeleteRule={handleDeleteAutomationRule}
              onRefresh={loadAllData}
            />
          )}

          {currentSection === 'Email' && (
            <EmailView
              workspace={activeWorkspace}
              templates={emailTemplates}
              leads={leads}
              onSendEmail={handleSendEmail}
            />
          )}

          {currentSection === 'Templates' && (
            <TemplatesView
              workspace={activeWorkspace}
              onNavigateToSettings={() => handleSelectSection('Settings')}
            />
          )}

          {currentSection === 'Settings' && (
            <SettingsView
              workspaces={workspaces}
              activeWorkspace={activeWorkspace}
              pipeline={activePipeline}
              stages={stages}
              userRole={currentUser?.role}
              onUpdateWorkspace={async (updates) => {
                setActiveWorkspace((prev) => ({ ...prev, ...updates }));
                setWorkspaces((prev) => prev.map((w) => (w.id === activeWorkspace.id ? { ...w, ...updates } : w)));
                try {
                  await fetch('/api/workspaces', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: activeWorkspace.id, ...updates }),
                  });
                } catch (e) {
                  console.error('Failed to persist workspace update:', e);
                }
              }}
              onSavePipeline={async (p) => {
                setActivePipeline(p);
                setStages(p.stages);
                setPipelines((prev) => prev.map((item) => (item.id === p.id ? p : item)));
                const res = await fetch('/api/pipelines', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ workspaceId: activeWorkspace.id, pipeline: p }),
                });
                if (!res.ok) {
                  const err = await res.json().catch(() => ({}));
                  throw new Error(err.error || 'Failed to save pipeline stages');
                }
                const saved = await res.json();
                if (saved?.stages) {
                  setActivePipeline(saved);
                  setStages(saved.stages);
                  setPipelines((prev) => prev.map((item) => (item.id === saved.id ? saved : item)));
                }
              }}
              onRefreshStorageStatus={loadAllData}
              onExportCSV={handleExportCSV}
              storageStatus={storageStatus}
            />
          )}
        </main>
      </div>

      {/* Slide-over Deal Detail Drawer */}
      <DealDetailDrawer
        lead={selectedLead}
        stages={stages}
        members={members}
        workspace={activeWorkspace}
        calendarEvents={calendarEvents}
        products={products}
        allLeads={leads}
        onClose={() => setSelectedLead(null)}
        onUpdateStage={(stageId) => selectedLead ? handleUpdateLeadStage(selectedLead.id, stageId) : Promise.resolve()}
        onMarkWon={() => selectedLead ? handleMarkWon(selectedLead) : Promise.resolve()}
        onMarkLost={(reason) => selectedLead ? handleMarkLost(selectedLead, reason) : Promise.resolve()}
        onDelete={() => selectedLead ? handleDeleteLead(selectedLead.id) : Promise.resolve()}
        onUpdateLead={handleUpdateLeadDetails}
        onScheduleMeeting={handleScheduleMeeting}
        onRescheduleMeeting={handleRescheduleMeeting}
      />

      {/* New Deal Modal */}
      {isNewDealModalOpen && (
        <NewDealModal
          stages={stages}
          members={members}
          defaultStageId={newDealDefaultStage}
          onClose={() => setIsNewDealModalOpen(false)}
          onCreate={handleCreateDeal}
        />
      )}

      {/* Google Sheets Import Modal */}
      {isSheetsImportOpen && (
        <SheetsImportModal
          workspace={activeWorkspace}
          onClose={() => setIsSheetsImportOpen(false)}
          onImportComplete={loadAllData}
        />
      )}

      {/* Create Workspace Modal */}
      {isCreateWorkspaceOpen && (
        <CreateWorkspaceModal
          onClose={() => setIsCreateWorkspaceOpen(false)}
          onCreate={handleCreateWorkspace}
        />
      )}

      {/* Global Search Modal */}
      {isSearchOpen && (
        <SearchModal
          leads={leads}
          customers={customers}
          onClose={() => setIsSearchOpen(false)}
          onSelectLead={(lead) => setSelectedLead(lead)}
        />
      )}

      {/* Stage-Trigger Automation Toast */}
      {automationToast && (
        <div
          className={`fixed bottom-6 right-6 z-50 rounded-2xl px-4 py-3 shadow-xl border flex items-center gap-3 text-xs animate-in fade-in slide-in-from-bottom-2 ${
            automationToast.triggered
              ? 'bg-[#17191A] text-white border-[#2F5C50]'
              : 'bg-[#FAF8F5] text-[#17191A] border-[#C8431F]'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              automationToast.triggered ? 'bg-[#F2C94C]' : 'bg-[#C8431F]'
            }`}
          />
          <span>
            {automationToast.triggered ? (
              <>
                <strong>Auto-Sent &ldquo;{automationToast.workflowName}&rdquo;</strong> → {automationToast.emailSentTo}
              </>
            ) : (
              <>
                <strong>Automation skipped:</strong> {automationToast.reason || 'Condition not met'}
              </>
            )}
          </span>
          <button
            type="button"
            onClick={() => setAutomationToast(null)}
            className="opacity-70 hover:opacity-100 ml-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
