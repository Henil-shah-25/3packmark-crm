'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Building,
  Mail,
  Calendar,
  Trophy,
  XCircle,
  FileText,
  PhoneCall,
  CheckSquare,
  Send,
  Sparkles,
  Tag,
  Clock,
  User,
  ExternalLink,
  Plus,
  Video,
  CheckCircle2,
  Trash2,
  Pin,
  Save,
  Globe,
  MapPin,
  Briefcase,
  AlertCircle,
  Check,
  Undo2,
  Filter,
  Search,
} from 'lucide-react';
import { Lead, PipelineStage, TeamMember, Activity, CalendarEvent, LeadNote, EmailTemplate, EmailLog, Workspace, Product, DealProductItem, TaskQueueCategory } from '@/types/crm';
import { TASK_QUEUES, suggestTaskQueueForStage } from '@/lib/tasks/queues';
import confetti from 'canvas-confetti';
import { formatCurrency } from '@/lib/financial';
import { MagneticButton } from '@/components/ui/MagneticButton';
import { PhoneActions } from '@/components/ui/PhoneActions';
import { renderTemplateString } from '@/lib/email/template-parser';
import { sanitizeUrl, isSafeUrl } from '@/lib/security/validator';
import { LEAD_SOURCES, QUOTATION_FOLLOWUP_OPTIONS } from '@/lib/pipeline/stage-rules';
import { buildQuotationHtml, buildQuotationTextSummary } from '@/lib/tally/quotationHtml';
import { CommercialOfferModal } from './CommercialOfferModal';
import {
  POPULAR_COUNTRIES,
  CountryOption,
  formatToE164,
  isValidPhone,
} from '@/lib/phone';

interface DealDetailDrawerProps {
  lead: Lead | null;
  stages: PipelineStage[];
  members: TeamMember[];
  workspace?: Workspace;
  calendarEvents?: CalendarEvent[];
  products?: Product[];
  allLeads?: Lead[];
  onClose: () => void;
  onUpdateStage: (stageId: string) => Promise<void>;
  onMarkWon: () => Promise<void>;
  onMarkLost: (reason: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onUpdateLead?: (leadId: string, updates: Partial<Lead>) => Promise<void>;
  onScheduleMeeting?: (eventData: any) => Promise<void>;
  onRescheduleMeeting?: (eventId: string, newStart: string, newEnd: string) => Promise<void>;
}

type DrawerTab = 'overview' | 'contact_business' | 'notes' | 'email' | 'tasks' | 'activity';

export function DealDetailDrawer({
  lead,
  stages,
  members,
  workspace,
  calendarEvents = [],
  products = [],
  allLeads = [],
  onClose,
  onUpdateStage,
  onMarkWon,
  onMarkLost,
  onDelete,
  onUpdateLead,
  onScheduleMeeting,
}: DealDetailDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Tab State
  const [activeTab, setActiveTab] = useState<DrawerTab>('overview');

  // Activities & AI
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);
  const [aiInsight, setAiInsight] = useState<{
    recommendation?: string;
    suggestedTaskTitle?: string;
    riskLevel?: string;
    insights?: string[];
  } | null>(null);
  const [isLoadingAi, setIsLoadingAi] = useState(false);

  // Loss reason modal state
  const [showLossModal, setShowLossModal] = useState(false);
  const [lossReason, setLossReason] = useState('Competitor chosen on price');

  // Meeting Form
  const [meetTitle, setMeetTitle] = useState('');
  const [meetDate, setMeetDate] = useState('');
  const [meetTime, setMeetTime] = useState('14:00');
  const [meetDuration, setMeetDuration] = useState(45);
  const [meetAttendees, setMeetAttendees] = useState('');
  const [meetEnableVideo, setMeetEnableVideo] = useState(true);
  const [meetDescription, setMeetDescription] = useState('');
  const [isSubmittingMeeting, setIsSubmittingMeeting] = useState(false);

  // Email Form & Phase 2 Templates & History
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [availableTemplates, setAvailableTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState('all');
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [isQuotationMode, setIsQuotationMode] = useState(false);
  const [quotationFeedback, setQuotationFeedback] = useState<{ message: string; simulated?: boolean } | null>(null);
  const [showMoveToFollowUpPrompt, setShowMoveToFollowUpPrompt] = useState(false);
  const [isMovingToFollowUp, setIsMovingToFollowUp] = useState(false);
  const [isTallyBusy, setIsTallyBusy] = useState(false);
  const [isCommercialOfferOpen, setIsCommercialOfferOpen] = useState(false);
  const [tallyFeedback, setTallyFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    xml?: string;
    filename?: string;
  } | null>(null);
  const [undoCountdown, setUndoCountdown] = useState<number | null>(null);
  const [undoToastActive, setUndoToastActive] = useState(false);
  const undoTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const undoIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pendingEmailData = useRef<{ toEmail: string; subject: string; body: string; templateId?: string } | null>(null);

  // Auto-created Call-Back Modal state (Phase 3)
  const [showCallbackModal, setShowCallbackModal] = useState(false);
  const [callbackTargetStage, setCallbackTargetStage] = useState<PipelineStage | null>(null);
  const [callbackDate, setCallbackDate] = useState('');
  const [callbackNotes, setCallbackNotes] = useState('');
  const [isSchedulingCallback, setIsSchedulingCallback] = useState(false);
  const [isUpdatingStage, setIsUpdatingStage] = useState(false);

  // Task Form
  const [taskTitle, setTaskTitle] = useState('');
  const [taskQueue, setTaskQueue] = useState<TaskQueueCategory>('Call Follow Up');
  const [lineItems, setLineItems] = useState<DealProductItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [duplicateNotice, setDuplicateNotice] = useState<string | null>(null);
  const [taskDue, setTaskDue] = useState('');
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  // Call Logger Form
  const [callOutcome, setCallOutcome] = useState('Connected - Positive');
  const [callNotes, setCallNotes] = useState('');
  const [isLoggingCall, setIsLoggingCall] = useState(false);

  // Editable Contact & Business Details State
  const [editName, setEditName] = useState('');
  const [editDesignation, setEditDesignation] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editCountry, setEditCountry] = useState<CountryOption>(POPULAR_COUNTRIES[0]);
  const [editPhone, setEditPhone] = useState('');
  const [editAltPhone, setEditAltPhone] = useState('');
  const [editWhatsapp, setEditWhatsapp] = useState('');
  const [editSameAsPhone, setEditSameAsPhone] = useState(true);

  const [editCompany, setEditCompany] = useState('');
  const [editIndustry, setEditIndustry] = useState('');
  const [editCompanySize, setEditCompanySize] = useState('1-10');
  const [editWebsite, setEditWebsite] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editState, setEditState] = useState('');
  const [editCountryName, setEditCountryName] = useState('India');
  const [editAddress, setEditAddress] = useState('');
  const [editGst, setEditGst] = useState('');
  const [editLeadSource, setEditLeadSource] = useState('Phone Call');
  const [editEstimatedBudget, setEditEstimatedBudget] = useState('0');
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [saveDetailsSuccess, setSaveDetailsSuccess] = useState(false);

  // Notes Timeline State
  const [notesList, setNotesList] = useState<LeadNote[]>([]);
  const [noteDraft, setNoteDraft] = useState('');
  const [isPinnedDraft, setIsPinnedDraft] = useState(false);
  const [hasUnsavedNotes, setHasUnsavedNotes] = useState(false);
  const [isAutosaving, setIsAutosaving] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);

  // Focus trap & Escape listener setup
  useEffect(() => {
    if (lead) {
      previousActiveElement.current = document.activeElement as HTMLElement;
      // Initialize states from lead
      setEditName(lead.contactName || '');
      setEditDesignation(lead.designation || '');
      setEditEmail(lead.email || '');
      setEditPhone(lead.phone || '');
      setEditAltPhone(lead.alternatePhone || '');
      setEditWhatsapp(lead.whatsappNumber || lead.phone || '');
      setEditSameAsPhone(lead.whatsappSameAsPhone !== undefined ? lead.whatsappSameAsPhone : true);

      // Determine country option
      const foundCountry = POPULAR_COUNTRIES.find((c) => c.dialCode === lead.countryCode) || POPULAR_COUNTRIES[0];
      setEditCountry(foundCountry);

      setEditCompany(lead.company || '');
      setEditIndustry(lead.industry || '');
      setEditCompanySize(lead.companySize || '1-10');
      setEditWebsite(lead.website || '');
      setEditCity(lead.city || '');
      setEditState(lead.state || '');
      setEditCountryName(lead.country || 'India');
      setEditAddress(lead.address || '');
      setEditGst(lead.gstTaxId || '');
      setEditLeadSource(lead.leadSource || lead.source || 'Phone Call');
      setEditEstimatedBudget(String(lead.estimatedBudget || lead.value || 0));
      setTaskQueue(suggestTaskQueueForStage(lead.stageId));
      const initialItems = Array.isArray(lead.lineItems)
        ? lead.lineItems
        : Array.isArray(lead.products)
        ? lead.products
        : [];
      setLineItems(initialItems);
      setProductSearch('');
      setShowProductPicker(false);
      setDuplicateNotice(null);

      // Initialize Notes Timeline
      let initialNotes: LeadNote[] = [];
      if (Array.isArray(lead.leadNotes) && lead.leadNotes.length > 0) {
        initialNotes = [...lead.leadNotes];
      } else if (lead.notes && lead.notes.trim()) {
        initialNotes = [
          {
            id: `note-legacy-${lead.id}`,
            leadId: lead.id,
            content: lead.notes,
            pinned: false,
            createdAt: lead.createdAt || new Date().toISOString(),
          },
        ];
      }
      setNotesList(initialNotes);
      setNoteDraft('');
      setHasUnsavedNotes(false);
      setLastSavedTime(null);

      // Communication presets
      setEmailSubject(`Update regarding ${lead.title} — ${lead.company}`);
      setEmailBody(`Hi ${lead.contactName || 'there'},\n\nFollowing up regarding our discussion on ${lead.title}.\n\nPlease let me know if you have any questions.\n\nBest regards,\nDevelopster Team`);
      setMeetTitle(`Strategy & Discovery: ${lead.company}`);
      setMeetAttendees(lead.email || '');
      setMeetDescription(`Discuss ${lead.title} timeline and scope milestones.`);
      const now = new Date();
      setMeetDate(now.toISOString().split('T')[0]);

      loadActivities();
      loadAiInsights();
    }
  }, [lead?.id]);

  const handlePrefillEmail = (subject: string, body: string) => {
    setEmailSubject(subject);
    setEmailBody(body);
    setActiveTab('email');
  };

  const noteDraftRef = useRef(noteDraft);
  noteDraftRef.current = noteDraft;
  const hasUnsavedNotesRef = useRef(hasUnsavedNotes);
  hasUnsavedNotesRef.current = hasUnsavedNotes;

  const handleSafeClose = () => {
    if (hasUnsavedNotesRef.current && noteDraftRef.current.trim()) {
      if (!confirm('You have unsaved text in your note editor. Are you sure you want to exit without adding it?')) {
        return;
      }
    }
    onClose();
  };

  // Trap Focus within drawer (only bind/cleanup per lead?.id so typing never steals focus)
  useEffect(() => {
    if (!lead?.id) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleSafeClose();
      }

      if (e.key === 'Tab' && drawerRef.current) {
        const focusableElements = drawerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            lastElement.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement.focus();
            e.preventDefault();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (previousActiveElement.current) {
        previousActiveElement.current.focus();
      }
    };
  }, [lead?.id]);

  const loadActivities = async () => {
    if (!lead) return;
    setIsLoadingActivities(true);
    try {
      const res = await fetch(`/api/activities?workspaceId=${lead.workspaceId}&leadId=${lead.id}`);
      if (res.ok) {
        const data = await res.json();
        setActivities(data);
      }
    } catch (err) {
      console.error('Failed to load activities', err);
    } finally {
      setIsLoadingActivities(false);
    }
  };

  const loadAiInsights = async () => {
    if (!lead) return;
    setIsLoadingAi(true);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'deal_insights',
          deal: lead,
          activities,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiInsight(data);
      }
    } catch {
      // AI service optional
    } finally {
      setIsLoadingAi(false);
    }
  };

  // Save Contact & Business updates
  const handleSaveContactAndBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead) return;

    if (editPhone && !isValidPhone(editPhone, editCountry.code)) {
      alert('Please enter a valid phone number or clear it.');
      return;
    }

    setIsSavingDetails(true);
    setSaveDetailsSuccess(false);

    try {
      const e164Phone = editPhone ? formatToE164(editPhone, editCountry.code) : '';
      const e164AltPhone = editAltPhone ? formatToE164(editAltPhone, editCountry.code) : '';
      const e164Whatsapp = editSameAsPhone
        ? e164Phone
        : editWhatsapp
        ? formatToE164(editWhatsapp, editCountry.code)
        : '';
      const budgetNum = parseFloat(editEstimatedBudget) || 0;

      const updates: Partial<Lead> = {
        contactName: editName.trim() || lead.contactName,
        designation: editDesignation.trim(),
        email: editEmail.trim(),
        phone: e164Phone,
        alternatePhone: e164AltPhone,
        whatsappNumber: e164Whatsapp,
        whatsappSameAsPhone: editSameAsPhone,
        countryCode: editCountry.dialCode,

        company: editCompany.trim() || lead.company,
        industry: editIndustry.trim(),
        companySize: editCompanySize,
        website: editWebsite.trim(),
        city: editCity.trim(),
        state: editState.trim(),
        country: editCountryName.trim(),
        address: editAddress.trim(),
        gstTaxId: editGst.trim(),
        leadSource: editLeadSource,
        estimatedBudget: budgetNum,
        value: budgetNum > 0 ? budgetNum : lead.value,
      };

      if (onUpdateLead) {
        await onUpdateLead(lead.id, updates);
      } else {
        await fetch(`/api/leads/${lead.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId: lead.workspaceId, ...updates }),
        });
      }

      setSaveDetailsSuccess(true);
      setTimeout(() => setSaveDetailsSuccess(false), 2500);
    } catch (err: any) {
      alert(err.message || 'Failed to update lead');
    } finally {
      setIsSavingDetails(false);
    }
  };

  // Notes Timeline Handlers
  const handleNoteDraftChange = (text: string) => {
    setNoteDraft(text);
    setHasUnsavedNotes(Boolean(text.trim()));
  };

  const handleAddNote = async () => {
    if (!lead || !noteDraft.trim()) return;

    const newNote: LeadNote = {
      id: `note-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      leadId: lead.id,
      content: noteDraft.trim(),
      pinned: isPinnedDraft,
      createdAt: new Date().toISOString(),
    };

    const updatedNotes = isPinnedDraft
      ? [newNote, ...notesList]
      : [
          ...notesList.filter((n) => n.pinned),
          newNote,
          ...notesList.filter((n) => !n.pinned),
        ];

    setNotesList(updatedNotes);
    setNoteDraft('');
    setIsPinnedDraft(false);
    setHasUnsavedNotes(false);
    setIsAutosaving(true);

    try {
      if (onUpdateLead) {
        await onUpdateLead(lead.id, {
          leadNotes: updatedNotes,
          notes: updatedNotes[0]?.content || '',
        });
      }

      await fetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: lead.workspaceId,
          leadId: lead.id,
          type: 'note',
          title: 'Note Added',
          description: newNote.content,
          authorName: 'User',
        }),
      });

      setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      await loadActivities();
    } catch (err) {
      console.error('Failed to save note', err);
    } finally {
      setIsAutosaving(false);
    }
  };

  const handleTogglePinNote = async (noteId: string) => {
    if (!lead) return;
    const updated = notesList.map((n) => (n.id === noteId ? { ...n, pinned: !n.pinned } : n));
    // Sort pinned to top
    const sorted = [...updated.filter((n) => n.pinned), ...updated.filter((n) => !n.pinned)];
    setNotesList(sorted);

    if (onUpdateLead) {
      await onUpdateLead(lead.id, { leadNotes: sorted });
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!lead) return;
    if (!confirm('Are you sure you want to delete this note?')) return;
    const updated = notesList.filter((n) => n.id !== noteId);
    setNotesList(updated);

    if (onUpdateLead) {
      await onUpdateLead(lead.id, { leadNotes: updated });
    }
  };

  // Quick Action Loggers
  const handleLogCall = async () => {
    if (!lead) return;
    setIsLoggingCall(true);
    try {
      await fetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: lead.workspaceId,
          leadId: lead.id,
          type: 'call',
          title: `Phone Call: ${callOutcome}`,
          description: callNotes || `Logged customer call with ${lead.contactName}. Outcome: ${callOutcome}`,
          authorName: 'User',
        }),
      });
      setCallNotes('');
      await loadActivities();
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoggingCall(false);
    }
  };

  const handleCreateTask = async () => {
    if (!lead || !taskTitle.trim()) return;
    setIsCreatingTask(true);
    try {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: lead.workspaceId,
          leadId: lead.id,
          dealTitle: lead.title,
          title: taskTitle.trim(),
          dueDate: taskDue || new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
          priority: 'high',
          ownerId: lead.ownerId,
          queueCategory: taskQueue,
        }),
      });
      setTaskTitle('');
      await loadActivities();
    } catch (err) {
      console.error(err);
    } finally {
      setIsCreatingTask(false);
    }
  };

  // Multi-Product Selector Helpers (MOQ + Extra = Total)
  const filteredCatalogProducts = useMemo(() => {
    const q = productSearch.toLowerCase().trim();
    if (!q) return products.slice(0, 40);
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      .slice(0, 40);
  }, [products, productSearch]);

  const syncDealProducts = async (nextItems: DealProductItem[]) => {
    if (!lead) return;
    setLineItems(nextItems);
    const nextValue = nextItems.reduce((sum, item) => sum + item.lineTotal, 0);
    await onUpdateLead?.(lead.id, {
      lineItems: nextItems,
      products: nextItems,
      value: nextValue,
    });
  };

  const handleAttachProduct = async (product: Product) => {
    const existing = lineItems.find((item) => item.productId === product.id);
    if (existing) {
      setDuplicateNotice(`"${product.name}" is already added — adjust Extra Qty below.`);
      setTimeout(() => setDuplicateNotice(null), 3500);
      return;
    }
    const newItem: DealProductItem = {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      unit: product.unit,
      moq: product.moq,
      extraQuantity: 0,
      totalQuantity: product.moq,
      unitPrice: product.unitPrice,
      lineTotal: product.moq * product.unitPrice,
    };
    setDuplicateNotice(null);
    setShowProductPicker(false);
    setProductSearch('');
    await syncDealProducts([...lineItems, newItem]);
  };

  const handleExtraQuantityChange = async (productId: string, rawExtra: string) => {
    const extra = Math.max(0, Math.floor(Number(rawExtra) || 0));
    const nextItems = lineItems.map((item) => {
      if (item.productId !== productId) return item;
      const totalQuantity = item.moq + extra;
      return {
        ...item,
        extraQuantity: extra,
        totalQuantity,
        lineTotal: totalQuantity * item.unitPrice,
      };
    });
    await syncDealProducts(nextItems);
  };

  const handleRemoveProduct = async (productId: string) => {
    const nextItems = lineItems.filter((item) => item.productId !== productId);
    await syncDealProducts(nextItems);
  };

  // Conditional Past Purchase History (Closed / Won orders for same customer)
  const pastOrders = useMemo(() => {
    if (!lead || !Array.isArray(allLeads)) return [];
    const normCompany = (lead.company || '').trim().toLowerCase();
    const normContact = (lead.contactName || '').trim().toLowerCase();
    const normEmail = (lead.email || '').trim().toLowerCase();

    return allLeads.filter((other) => {
      if (!other || other.id === lead.id) return false;
      const isClosedWon =
        other.status === 'Won' || other.stageId === 'stg-closed' || other.stageId === 'stg-won';
      if (!isClosedWon) return false;

      const otherCompany = (other.company || '').trim().toLowerCase();
      const otherContact = (other.contactName || '').trim().toLowerCase();
      const otherEmail = (other.email || '').trim().toLowerCase();

      return (
        (normCompany && otherCompany === normCompany) ||
        (normContact && otherContact === normContact) ||
        (normEmail && otherEmail === normEmail)
      );
    });
  }, [lead, allLeads]);

  // Load email templates and history
  const loadEmailData = async () => {
    if (!lead) return;
    try {
      const [tplRes, logsRes] = await Promise.all([
        fetch(`/api/email/templates?workspaceId=${lead.workspaceId || 'ws-default'}`),
        fetch(`/api/email/logs?workspaceId=${lead.workspaceId || 'ws-default'}&leadId=${lead.id}`),
      ]);
      if (tplRes.ok) {
        const d = await tplRes.json();
        setAvailableTemplates(d.templates || []);
      }
      if (logsRes.ok) {
        const d = await logsRes.json();
        setEmailLogs(d.logs || []);
      }
    } catch (e) {
      console.error('Failed loading email data in drawer:', e);
    }
  };

  useEffect(() => {
    if (activeTab === 'email') {
      loadEmailData();
    }
  }, [activeTab, lead?.id]);

  // When a template is chosen from the picker, render for THIS lead
  const handleSelectTemplate = (tpl: EmailTemplate) => {
    if (!lead) return;
    setSelectedTemplateId(tpl.id);
    const renderedSub = renderTemplateString(tpl.subject, {
      lead,
      workspace: { name: 'Developster Hub', senderName: 'Developster Team' },
    });
    const renderedBdy = renderTemplateString(tpl.body, {
      lead,
      workspace: { name: 'Developster Hub', senderName: 'Developster Team' },
    });
    setEmailSubject(renderedSub);
    setEmailBody(renderedBdy);
  };

  // 5-second Undo send logic
  const initiateSendEmailWithUndo = () => {
    if (!lead || !lead.email || !emailSubject.trim()) return;

    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    if (undoIntervalRef.current) clearInterval(undoIntervalRef.current);

    pendingEmailData.current = {
      toEmail: lead.email,
      subject: emailSubject,
      body: emailBody,
      templateId: selectedTemplateId || undefined,
    };

    setUndoCountdown(5);
    setUndoToastActive(true);

    let remaining = 5;
    undoIntervalRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        setUndoCountdown(remaining);
      } else {
        if (undoIntervalRef.current) clearInterval(undoIntervalRef.current);
      }
    }, 1000);

    undoTimeoutRef.current = setTimeout(async () => {
      setUndoToastActive(false);
      setUndoCountdown(null);
      await executeSendEmail();
    }, 5000);
  };

  const handleCancelUndoSend = () => {
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    if (undoIntervalRef.current) clearInterval(undoIntervalRef.current);
    undoTimeoutRef.current = null;
    undoIntervalRef.current = null;
    pendingEmailData.current = null;
    setUndoToastActive(false);
    setUndoCountdown(null);
  };

  const executeSendEmail = async () => {
    if (!lead || !pendingEmailData.current) return;
    setIsSendingEmail(true);
    const dataToSend = pendingEmailData.current;
    try {
      const res = await fetch('/api/email/send-templated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id,
          templateId: dataToSend.templateId || (availableTemplates[0]?.id || 'tpl-prebuilt-1'),
          overrides: {
            subject: dataToSend.subject,
            body: dataToSend.body,
            workspaceId: lead.workspaceId,
          },
        }),
      });

      if (res.ok) {
        await loadActivities();
        await loadEmailData();
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to dispatch email');
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Error sending email');
    } finally {
      setIsSendingEmail(false);
      pendingEmailData.current = null;
    }
  };

  const triggerXmlDownload = (xml: string, filename: string) => {
    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleTallyQuotation = async (action: 'push' | 'download') => {
    if (!lead || isTallyBusy) return;
    setIsTallyBusy(true);
    setTallyFeedback(null);
    try {
      const res = await fetch('/api/tally/quotation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: lead.workspaceId || 'ws-default',
          leadId: lead.id,
          action,
        }),
      });
      const data = await res.json();
      if (action === 'download' && res.ok && data.xml) {
        triggerXmlDownload(data.xml, data.filename || `Tally_Quotation_${lead.id}.xml`);
        setTallyFeedback({ type: 'success', message: data.message || 'TallyPrime XML downloaded.' });
        await loadActivities();
      } else if (res.ok && data.success) {
        setTallyFeedback({ type: 'success', message: data.message || 'Pushed to TallyPrime successfully.' });
        await loadActivities();
      } else {
        setTallyFeedback({
          type: 'error',
          message: data.error || 'Failed to sync with TallyPrime.',
          xml: data.xml,
          filename: data.filename,
        });
      }
    } catch (err: any) {
      setTallyFeedback({
        type: 'error',
        message: err?.message || 'TallyPrime request failed.',
      });
    } finally {
      setIsTallyBusy(false);
    }
  };

  const handleOpenQuotationEmail = () => {
    if (!lead) return;
    setIsCommercialOfferOpen(true);
  };

  const handleDownloadQuotationSummary = () => {
    if (!lead) return;
    const html = buildQuotationHtml({ lead, lineItems });
    const ref = `QT-${lead.id.slice(-6).toUpperCase()}`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Quotation_${ref}_${(lead.company || 'Customer').replace(/[^a-zA-Z0-9_-]/g, '_')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSendQuotationEmailNow = async () => {
    if (!lead || !lead.email || !emailSubject.trim()) return;
    setIsSendingEmail(true);
    setQuotationFeedback(null);
    try {
      const html = buildQuotationHtml({ lead, lineItems });
      const res = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: lead.workspaceId || 'ws-default',
          leadId: lead.id,
          toEmail: lead.email,
          subject: emailSubject,
          body: emailBody,
          html,
          isQuotation: true,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setQuotationFeedback({
          message: data.message || `Quotation sent to ${lead.email}`,
          simulated: Boolean(data.simulated),
        });
        setShowMoveToFollowUpPrompt(true);
        await loadActivities();
        await loadEmailData();
      } else {
        alert(data.error || 'Failed to send quotation email');
      }
    } catch (err: any) {
      alert(err?.message || 'Error sending quotation email');
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleMoveToQuotationFollowUpAndSchedule = async () => {
    if (!lead || isMovingToFollowUp) return;
    setIsMovingToFollowUp(true);
    try {
      const followUpStage = stages.find(
        (s) => s.id === 'stg-quotation-follow-up' || s.name.toLowerCase() === 'quotation follow up'
      );
      if (followUpStage && followUpStage.id !== lead.stageId) {
        await onUpdateStage(followUpStage.id);
      }

      const twoDaysLater = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      const dueDateStr = twoDaysLater.toISOString().split('T')[0];
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: lead.workspaceId || 'ws-default',
          leadId: lead.id,
          dealTitle: lead.title,
          title: `Quotation Follow Up: ${lead.company || lead.contactName}`,
          description: `Follow up on quotation sent to ${lead.email || lead.contactName} (Total: ${formatCurrency(lead.value)}).`,
          priority: 'high',
          dueDate: dueDateStr,
          dueAt: twoDaysLater.toISOString(),
          ownerId: lead.ownerId || 'mem-1',
          type: 'follow_up',
          queueCategory: 'Quotation Follow Up' as TaskQueueCategory,
          status: 'open',
          source: 'auto',
        }),
      });
      setShowMoveToFollowUpPrompt(false);
      await loadActivities();
    } finally {
      setIsMovingToFollowUp(false);
    }
  };

  // Phase 3 Stage Move Interception
  const handleStageClick = async (stage: PipelineStage) => {
    if (!lead || isUpdatingStage || stage.id === lead.stageId) return;
    setIsUpdatingStage(true);
    try {
      const name = stage.name;
      if (
        name === 'Call me after weeks' ||
        name === 'Call me after 3 months' ||
        name === 'Call me after 6 months'
      ) {
        const d = new Date();
        if (name === 'Call me after weeks') {
          d.setDate(d.getDate() + 14);
        } else if (name === 'Call me after 3 months') {
          d.setMonth(d.getMonth() + 3);
        } else if (name === 'Call me after 6 months') {
          d.setMonth(d.getMonth() + 6);
        }
        setCallbackTargetStage(stage);
        setCallbackDate(d.toISOString().split('T')[0]);
        setCallbackNotes('');
        setShowCallbackModal(true);
      } else {
        try {
          await fetch(`/api/tasks/auto-callback?workspaceId=${lead.workspaceId}&leadId=${lead.id}`, {
            method: 'DELETE',
          });
        } catch (e) {
          console.error(e);
        }
        await onUpdateStage(stage.id);
      }
    } finally {
      setIsUpdatingStage(false);
    }
  };

  const handleConfirmCallback = async () => {
    if (!lead || !callbackTargetStage) return;
    setIsSchedulingCallback(true);
    try {
      await onUpdateStage(callbackTargetStage.id);
      await fetch('/api/tasks/auto-callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: lead.workspaceId,
          leadId: lead.id,
          stageName: callbackTargetStage.name,
          dueDate: callbackDate,
          notes: callbackNotes,
        }),
      });
      setShowCallbackModal(false);
      await loadActivities();
    } catch (err) {
      console.error('Failed scheduling callback task:', err);
    } finally {
      setIsSchedulingCallback(false);
    }
  };

  const handleScheduleMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead || !meetTitle.trim() || !meetDate || !meetTime) return;
    setIsSubmittingMeeting(true);

    try {
      const startDateTime = new Date(`${meetDate}T${meetTime}:00`);
      const endDateTime = new Date(startDateTime.getTime() + meetDuration * 60 * 1000);
      const attendeeList = meetAttendees
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);

      const payload = {
        workspaceId: lead.workspaceId,
        leadId: lead.id,
        title: meetTitle,
        startIso: startDateTime.toISOString(),
        endIso: endDateTime.toISOString(),
        attendees: attendeeList,
        description: meetDescription,
        createMeetLink: meetEnableVideo,
        sendInviteEmails: true,
      };

      if (onScheduleMeeting) {
        await onScheduleMeeting(payload);
      } else {
        const res = await fetch('/api/calendar/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Failed to create calendar event');
      }

      await loadActivities();
      alert('Google Calendar meeting scheduled and synced!');
    } catch (err: any) {
      alert('Error scheduling meeting: ' + err.message);
    } finally {
      setIsSubmittingMeeting(false);
    }
  };

  if (!lead) return null;

  const currentStage = stages.find((s) => s.id === lead.stageId);
  const owner = members.find((m) => m.id === lead.ownerId);

  // Stage tone color
  const stageTone = (() => {
    const s = (lead.stageId || '').toLowerCase();
    if (s.includes('qual')) return '#F2C94C';
    if (s.includes('prop')) return '#2F5C50';
    if (s.includes('neg')) return '#C8431F';
    if (s.includes('clos')) return '#17191A';
    if (s.includes('meet')) return '#236F70';
    if (s.includes('won')) return '#2D7A58';
    if (s.includes('loss') || s.includes('lost')) return '#963F45';
    return '#596C79';
  })();

  const isDarkToneText = stageTone === '#F2C94C';
  const prob = lead.closingProbability || 50;
  const circum = 2 * Math.PI * 34;
  const offset = circum * (1 - prob / 100);

  // Next meeting check
  const nowIso = new Date().toISOString();
  const dealMeetings = calendarEvents.filter((ev) => ev.leadId === lead.id && ev.status !== 'cancelled');
  const nextMeeting = dealMeetings
    .filter((ev) => ev.endIso >= nowIso)
    .sort((a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime())[0];

  return (
    <div
      className="scrim fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-xs transition-opacity"
      onClick={handleSafeClose}
      role="dialog"
      aria-modal="true"
      aria-label="Lead Details Panel"
    >
      <div
        ref={drawerRef}
        className="w-full min-[900px]:max-w-[min(1180px,78vw)] max-[899px]:w-full max-[899px]:max-w-full bg-[var(--bg-main)] h-full shadow-2xl border-l border-[var(--border-subtle)] flex flex-col justify-between overflow-hidden animate-in slide-in-from-right duration-200 ease-out"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header (Stage dot, Title, Close) */}
        <div className="px-6 py-3.5 border-b border-[var(--border-subtle)] bg-[var(--bg-card)]/90 backdrop-blur-md flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="w-3 h-3 rounded-full shrink-0 shadow-2xs"
              style={{ backgroundColor: stageTone }}
            />
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-[var(--text-ink)] truncate flex items-center gap-2">
                <span>{lead.title}</span>
                <span className="text-[11px] font-normal text-[var(--text-muted)]">
                  • {lead.company}
                </span>
              </h2>
              <span className="text-[10px] font-extrabold text-[var(--text-muted)]">
                {currentStage?.name || 'Deal Opportunity'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <MagneticButton
              onClick={handleSafeClose}
              className="btn btn--subtle btn--icon rounded-full"
              title="Close Panel (Esc)"
            >
              <X className="w-4 h-4 text-[var(--text-ink)]" />
            </MagneticButton>
          </div>
        </div>

        {/* Scrollable Main Area */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Coloured Summary Card (Stays at the top) */}
          <div
            className="rounded-[28px] p-5.5 relative overflow-hidden shadow-sm shrink-0"
            style={{
              backgroundColor: stageTone,
              color: isDarkToneText ? '#292511' : '#FFFFFF',
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1 opacity-90 text-xs">
                  <span className="font-bold">{lead.company}</span>
                  <span>•</span>
                  <span>Closes {lead.expectedCloseDate || 'Soon'}</span>
                </div>

                <h3 className="text-xl sm:text-2xl font-black tracking-tight leading-snug truncate">
                  {lead.title}
                </h3>

                <div className="mt-2.5 flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-black font-tabular tracking-tight">
                    {formatCurrency(lead.value)}
                  </span>
                  <span className="text-xs opacity-85 font-semibold">Deal value</span>
                </div>
              </div>

              {/* Progress Ring */}
              <div className="relative w-20 h-20 shrink-0 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 80 80">
                  <circle
                    cx="40"
                    cy="40"
                    r="34"
                    stroke={isDarkToneText ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.22)'}
                    strokeWidth="6"
                    fill="transparent"
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r="34"
                    stroke={isDarkToneText ? '#292511' : '#FFFFFF'}
                    strokeWidth="6"
                    strokeDasharray={circum}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    fill="transparent"
                    className="transition-all duration-700 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-sm font-black font-tabular leading-none">{prob}%</span>
                  <span className="text-[8px] font-bold opacity-85 mt-0.5">Win prob</span>
                </div>
              </div>
            </div>

            {/* Bottom Row in Card */}
            <div
              className={`flex items-center justify-between pt-3 mt-3 border-t ${
                isDarkToneText ? 'border-black/15' : 'border-white/20'
              } text-xs font-semibold`}
            >
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-black/20 text-current flex items-center justify-center font-bold text-[9px]">
                  {owner ? (owner.name || 'U').charAt(0).toUpperCase() : 'U'}
                </div>
                <span className="text-[11px]">{owner?.name || 'Unassigned Rep'}</span>
              </div>
              <span
                className={`px-3 py-0.5 rounded-full text-[10px] font-medium ${
                  isDarkToneText ? 'bg-black/15' : 'bg-white/25'
                }`}
              >
                {lead.status || 'Active'}
              </span>
            </div>
          </div>

          {/* Quick Terminal Outcomes & Move Stage Chips */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <MagneticButton
                onClick={async () => {
                  confetti({ particleCount: 80, spread: 70 });
                  await onMarkWon();
                }}
                className="flex-1 btn btn--pine py-2.5 font-bold flex items-center justify-center gap-2 rounded-2xl shadow-xs"
              >
                <Trophy className="w-4 h-4 text-[var(--butter)]" />
                <span>Mark Deal Won</span>
              </MagneticButton>

              <MagneticButton
                onClick={() => setShowLossModal(true)}
                className="flex-1 btn btn--tomato py-2.5 font-bold flex items-center justify-center gap-2 rounded-2xl shadow-xs"
              >
                <XCircle className="w-4 h-4" />
                <span>Mark Lost</span>
              </MagneticButton>
            </div>

            {/* Move Deal Stage Chips */}
            <div className="card p-3.5 bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)]">
              <span className="text-[10px] font-bold text-[var(--text-muted)] block mb-2 uppercase tracking-wider">
                Move Deal Stage
              </span>
              <div className="flex flex-wrap gap-1.5">
                {stages.map((stage) => {
                  const isSelected = stage.id === lead.stageId;
                  return (
                    <button
                      key={stage.id}
                      type="button"
                      disabled={isUpdatingStage || isSelected}
                      onClick={() => handleStageClick(stage)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-emerald-600 text-white font-bold shadow-sm ring-2 ring-emerald-500/30'
                          : 'bg-[var(--bg-main)] text-[var(--text-ink)] hover:bg-[var(--bg-card)] hover:border-emerald-500/40 border border-[var(--border-subtle)] disabled:opacity-50'
                      }`}
                      title={isSelected ? `Current stage: ${stage.name}` : `Move deal to ${stage.name}`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 text-white shrink-0" />}
                      <span>{stage.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Next Meeting Reminder Banner (if scheduled) */}
          {nextMeeting && (
            <div className="card p-3.5 border border-emerald-500/30 bg-emerald-500/10 rounded-2xl flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <Calendar className="w-4 h-4 text-emerald-600" />
                <div>
                  <span className="font-bold text-[var(--text-ink)]">{nextMeeting.title}</span>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {new Date(nextMeeting.startIso).toLocaleDateString([], { month: 'short', day: 'numeric' })} at{' '}
                    {new Date(nextMeeting.startIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
              {nextMeeting.meetUrl && isSafeUrl(nextMeeting.meetUrl) && (
                <a
                  href={sanitizeUrl(nextMeeting.meetUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn--pine text-xs py-1.5 px-3 flex items-center gap-1.5 rounded-xl"
                >
                  <Video className="w-3.5 h-3.5" />
                  <span>Join Meet</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </div>
          )}

          {/* Split Container: Main Tab Area + Wide Screen AI Coach Placeholder Column */}
          <div className="flex flex-col min-[1100px]:flex-row gap-5 items-start">
            {/* Left / Main Column */}
            <div className="flex-1 w-full space-y-4 min-w-0">
              {/* Tab Navigation Bar */}
              <div className="flex items-center gap-1 p-1 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-2xl overflow-x-auto text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setActiveTab('overview')}
                  className={`py-2 px-3 rounded-xl transition-all whitespace-nowrap cursor-pointer ${
                    activeTab === 'overview'
                      ? 'bg-[var(--solid)] text-[var(--text-ink)] shadow-2xs font-bold'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-ink)]'
                  }`}
                >
                  Overview
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('contact_business')}
                  className={`py-2 px-3 rounded-xl transition-all whitespace-nowrap cursor-pointer ${
                    activeTab === 'contact_business'
                      ? 'bg-[var(--solid)] text-[var(--text-ink)] shadow-2xs font-bold'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-ink)]'
                  }`}
                >
                  Contact & Business
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('notes')}
                  className={`py-2 px-3 rounded-xl transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'notes'
                      ? 'bg-[var(--solid)] text-[var(--text-ink)] shadow-2xs font-bold'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-ink)]'
                  }`}
                >
                  <span>Notes</span>
                  {notesList.length > 0 && (
                    <span className="w-4 h-4 rounded-full bg-[var(--border-subtle)] text-[10px] grid place-items-center">
                      {notesList.length}
                    </span>
                  )}
                  {hasUnsavedNotes && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('email')}
                  className={`py-2 px-3 rounded-xl transition-all whitespace-nowrap cursor-pointer ${
                    activeTab === 'email'
                      ? 'bg-[var(--solid)] text-[var(--text-ink)] shadow-2xs font-bold'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-ink)]'
                  }`}
                >
                  Email
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('tasks')}
                  className={`py-2 px-3 rounded-xl transition-all whitespace-nowrap cursor-pointer ${
                    activeTab === 'tasks'
                      ? 'bg-[var(--solid)] text-[var(--text-ink)] shadow-2xs font-bold'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-ink)]'
                  }`}
                >
                  Tasks
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('activity')}
                  className={`py-2 px-3 rounded-xl transition-all whitespace-nowrap cursor-pointer ${
                    activeTab === 'activity'
                      ? 'bg-[var(--solid)] text-[var(--text-ink)] shadow-2xs font-bold'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-ink)]'
                  }`}
                >
                  Activity
                </button>
              </div>

              {/* TAB 1: OVERVIEW */}
              {activeTab === 'overview' && (
                <div className="space-y-4 animate-in fade-in">
                  <div className="card p-5 bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] space-y-3">
                    <h4 className="text-xs font-bold text-[var(--text-muted)]">
                      Account & Contact Summary
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-[11px] text-[var(--text-muted)] block">Contact Person</span>
                        <p className="font-bold text-[var(--text-ink)]">{lead.contactName}</p>
                        {lead.designation && (
                          <span className="text-[11px] text-[var(--text-muted)]">{lead.designation}</span>
                        )}
                      </div>

                      <div>
                        <span className="text-[11px] text-[var(--text-muted)] block">Company</span>
                        <p className="font-bold text-[var(--text-ink)]">{lead.company}</p>
                        {lead.industry && (
                          <span className="text-[11px] text-[var(--text-muted)]">{lead.industry}</span>
                        )}
                      </div>

                      <div>
                        <span className="text-[11px] text-[var(--text-muted)] block">Email</span>
                        {lead.email ? (
                          <a
                            href={`mailto:${lead.email}`}
                            className="font-medium text-[var(--text-ink)] hover:underline truncate block"
                          >
                            {lead.email}
                          </a>
                        ) : (
                          <span className="text-[var(--text-muted)] italic">Not set</span>
                        )}
                      </div>

                      <div>
                        <span className="text-[11px] text-[var(--text-muted)] block mb-1">Phone & Actions</span>
                        <PhoneActions phone={lead.phone} whatsappNumber={lead.whatsappNumber} />
                      </div>

                      <div>
                        <span className="text-[11px] text-[var(--text-muted)] block">Deal value</span>
                        <p className="font-extrabold text-[var(--text-ink)] font-tabular">{formatCurrency(lead.value)}</p>
                      </div>

                      <div>
                        <span className="text-[11px] text-[var(--text-muted)] block">Assigned owner</span>
                        <p className="font-bold text-[var(--text-ink)]">{owner?.name || 'Unassigned'}</p>
                      </div>

                      <div>
                        <span className="text-[11px] text-[var(--text-muted)] block mb-1">Lead Source</span>
                        <select
                          value={lead.leadSource || lead.source || 'Phone Call'}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditLeadSource(val);
                            onUpdateLead?.(lead.id, { leadSource: val });
                          }}
                          className="w-full p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-xs font-medium text-[var(--text-ink)]"
                        >
                          {LEAD_SOURCES.map((src) => (
                            <option key={src} value={src}>
                              {src}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <span className="text-[11px] text-[var(--text-muted)] block">Target Close Date</span>
                        <p className="font-medium text-[var(--text-ink)] font-tabular">{lead.expectedCloseDate || 'N/A'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Cold Call Decision-Maker Conversion */}
                  {(lead.leadSource || lead.source) === 'Cold Call' && (
                    <div className="card p-5 bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <h4 className="text-xs font-bold text-[var(--text-ink)]">
                            Cold Call Contact Level
                          </h4>
                          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                            {lead.isDecisionMakerReached
                              ? 'Decision Maker (CEO / Purchase Head) ✓'
                              : 'Admin / Gatekeeper'}
                          </p>
                        </div>
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                            lead.isDecisionMakerReached
                              ? 'bg-emerald-500/15 text-emerald-700'
                              : 'bg-amber-500/15 text-amber-800'
                          }`}
                        >
                          {lead.isDecisionMakerReached ? 'Cold Call ✓' : 'Gatekeeper'}
                        </span>
                      </div>

                      {!lead.isDecisionMakerReached && (
                        <button
                          type="button"
                          onClick={() => onUpdateLead?.(lead.id, { isDecisionMakerReached: true })}
                          className="w-full py-2.5 px-4 rounded-xl bg-[#17191A] text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
                        >
                          Convert to Real Lead (Decision Maker Reached)
                        </button>
                      )}
                    </div>
                  )}

                  {/* Stage 5 (Quotation Follow Up) — 4-Option Selector */}
                  {lead.stageId === 'stg-quotation-follow-up' && (
                    <div className="card p-5 bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] space-y-3">
                      <div>
                        <h4 className="text-xs font-bold text-[var(--text-ink)]">
                          Quotation Follow Up Status
                        </h4>
                        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                          Select the active quotation follow-up outcome shown on the pipeline card.
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {QUOTATION_FOLLOWUP_OPTIONS.map((opt) => {
                          const isSelected = lead.quotationSubStatus === opt;
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => onUpdateLead?.(lead.id, { quotationSubStatus: opt })}
                              className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-[#17191A] text-white border-[#17191A]'
                                  : 'bg-[var(--bg-main)] text-[var(--text-ink)] border-[var(--border-subtle)] hover:border-[#17191A]'
                              }`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>

                      {lead.quotationSubStatus === 'Purchased from Other' && (
                        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-between gap-3">
                          <span className="text-[11px] font-medium text-[#C8431F]">
                            Client purchased from another vendor. Mark deal as Closed (Lost)?
                          </span>
                          <button
                            type="button"
                            onClick={() => onMarkLost('Purchased from Other')}
                            className="px-3 py-1.5 rounded-lg bg-[#C8431F] text-white text-[11px] font-semibold shrink-0 cursor-pointer"
                          >
                            Mark Closed (Lost)
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Chemical Products Selector (MOQ + Extra = Total) */}
                  <div className="card p-5 bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h4 className="text-xs font-bold text-[var(--text-ink)]">
                          Chemical Products ({lineItems.length})
                        </h4>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          Attach multiple products with automatic MOQ + Extra quantity calculation
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowProductPicker((prev) => !prev)}
                        className="px-3 py-1.5 rounded-full bg-[#17191A] text-white text-[11px] font-semibold cursor-pointer"
                      >
                        + Add Chemical Product
                      </button>
                    </div>

                    {duplicateNotice && (
                      <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] font-semibold text-amber-800">
                        {duplicateNotice}
                      </div>
                    )}

                    {showProductPicker && (
                      <div className="p-3 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-subtle)] space-y-2">
                        <input
                          type="text"
                          value={productSearch}
                          onChange={(e) => setProductSearch(e.target.value)}
                          placeholder="Search 600+ chemical products by name or SKU..."
                          className="w-full p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] text-xs focus:outline-none"
                          autoFocus
                        />
                        <div className="max-h-48 overflow-y-auto divide-y divide-[var(--border-subtle)]">
                          {filteredCatalogProducts.map((prod) => (
                            <button
                              key={prod.id}
                              type="button"
                              onClick={() => handleAttachProduct(prod)}
                              className="w-full py-2 px-2 text-left hover:bg-[var(--bg-card)] flex items-center justify-between gap-2 text-xs cursor-pointer"
                            >
                              <div className="min-w-0">
                                <p className="font-semibold text-[var(--text-ink)] truncate">{prod.name}</p>
                                <p className="text-[10px] text-[var(--text-muted)] font-mono">
                                  {prod.sku} • MOQ: {prod.moq} {prod.unit}
                                </p>
                              </div>
                              <span className="font-bold text-[var(--text-ink)] shrink-0 font-tabular">
                                {formatCurrency(prod.unitPrice)}/{prod.unit}
                              </span>
                            </button>
                          ))}
                          {filteredCatalogProducts.length === 0 && (
                            <p className="py-3 text-center text-[11px] text-[var(--text-muted)]">
                              No matching chemical products found.
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {lineItems.length > 0 && (
                      <div className="space-y-2.5">
                        {lineItems.map((item) => (
                          <div
                            key={item.productId}
                            className="p-3 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-subtle)] space-y-2 text-xs"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-bold text-[var(--text-ink)] truncate">{item.name}</p>
                                <p className="text-[10px] text-[var(--text-muted)] font-mono">
                                  {item.sku} • {formatCurrency(item.unitPrice)} / {item.unit}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="font-extrabold text-[var(--text-ink)] font-tabular">
                                  {formatCurrency(item.lineTotal)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveProduct(item.productId)}
                                  title="Remove product"
                                  className="p-1 rounded-lg text-[#C8431F] hover:bg-rose-500/10 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-[var(--border-subtle)]">
                              <span className="px-2.5 py-1 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-ink)] font-tabular">
                                MOQ = {item.moq} {item.unit} + {item.extraQuantity} {item.unit} extra = {item.totalQuantity} {item.unit}
                              </span>

                              <div className="flex items-center gap-1.5">
                                <label className="text-[10px] font-semibold text-[var(--text-muted)]">
                                  Extra Qty ({item.unit}):
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  value={item.extraQuantity}
                                  onChange={(e) => handleExtraQuantityChange(item.productId, e.target.value)}
                                  className="w-20 p-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-xs font-bold text-right font-tabular"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* TallyPrime & Quotation Actions */}
                    <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={isTallyBusy}
                        onClick={() => handleTallyQuotation('push')}
                        className="px-3 py-1.5 rounded-full bg-[#17191A] hover:bg-black text-white text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                      >
                        {isTallyBusy ? 'Syncing...' : 'Push to TallyPrime'}
                      </button>
                      <button
                        type="button"
                        disabled={isTallyBusy}
                        onClick={() => handleTallyQuotation('download')}
                        className="px-3 py-1.5 rounded-full bg-[var(--bg-main)] border border-[var(--border-subtle)] hover:bg-white text-[var(--text-ink)] text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                      >
                        Download Tally XML
                      </button>
                      <button
                        type="button"
                        onClick={handleOpenQuotationEmail}
                        className="px-3 py-1.5 rounded-full bg-[#376E60] hover:opacity-90 text-white text-[11px] font-semibold cursor-pointer"
                      >
                        Send Quotation Email
                      </button>
                    </div>

                    {tallyFeedback && (
                      <div
                        className={`p-3 rounded-xl text-[11px] flex items-center justify-between gap-2 ${
                          tallyFeedback.type === 'success'
                            ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-800'
                            : 'bg-rose-500/10 border border-rose-500/30 text-[#C8431F]'
                        }`}
                      >
                        <span className="font-medium">{tallyFeedback.message}</span>
                        {tallyFeedback.xml && tallyFeedback.filename && (
                          <button
                            type="button"
                            onClick={() => triggerXmlDownload(tallyFeedback.xml!, tallyFeedback.filename!)}
                            className="px-2.5 py-1 rounded-lg bg-white border border-rose-300 text-[#C8431F] font-semibold shrink-0 cursor-pointer"
                          >
                            Download XML
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Conditional Past Purchase History (rendered ONLY when >= 1 past Closed/Won order exists) */}
                  {pastOrders.length > 0 && (
                    <div className="card p-5 bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-[var(--text-ink)]">
                          Past Purchase History ({pastOrders.length})
                        </h4>
                        <span className="text-[10px] font-semibold text-[var(--pine)]">
                          Repeat Customer
                        </span>
                      </div>
                      <div className="space-y-2">
                        {pastOrders.map((order) => {
                          const orderDate = order.wonAt || order.updatedAt || order.createdAt;
                          const orderItems: DealProductItem[] = Array.isArray(order.products) ? order.products : [];
                          return (
                            <div
                              key={order.id}
                              className="p-3 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-xs space-y-1"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-[var(--text-ink)] truncate">{order.title}</span>
                                <span className="font-extrabold text-[var(--text-ink)] font-tabular shrink-0">
                                  {formatCurrency(order.value)}
                                </span>
                              </div>
                              <p className="text-[10px] text-[var(--text-muted)] font-tabular">
                                Closed {orderDate ? new Date(orderDate).toLocaleDateString() : 'N/A'}
                              </p>
                              {orderItems.length > 0 && (
                                <ul className="pt-1 space-y-0.5 text-[11px] text-[var(--text-muted)]">
                                  {orderItems.map((pi) => (
                                    <li key={pi.productId}>
                                      • {pi.name}: {pi.moq} + {pi.extraQuantity} extra = {pi.totalQuantity} {pi.unit}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: CONTACT & BUSINESS (Full Details Editor) */}
              {activeTab === 'contact_business' && (
                <form onSubmit={handleSaveContactAndBusiness} className="space-y-4 animate-in fade-in">
                  <div className="card p-5 bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
                      <h4 className="text-xs font-bold text-[var(--text-muted)]">
                        Primary Contact Details
                      </h4>
                      <PhoneActions phone={editPhone} whatsappNumber={editWhatsapp} showText={false} />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                          Full Name *
                        </label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Contact Name"
                          className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)]"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                          Designation
                        </label>
                        <input
                          type="text"
                          value={editDesignation}
                          onChange={(e) => setEditDesignation(e.target.value)}
                          placeholder="Role / Title"
                          className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)]"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                          Email Address
                        </label>
                        <input
                          type="email"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          placeholder="email@company.com"
                          className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)]"
                        />
                      </div>

                      {/* Phone with Country Selector */}
                      <div>
                        <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                          Phone (Validated with E.164)
                        </label>
                        <div className="flex gap-1.5">
                          <select
                            value={editCountry.code}
                            onChange={(e) => {
                              const found = POPULAR_COUNTRIES.find((c) => c.code === e.target.value);
                              if (found) setEditCountry(found);
                            }}
                            className="w-24 px-2 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] text-xs focus:outline-none shrink-0"
                          >
                            {POPULAR_COUNTRIES.map((c) => (
                              <option key={c.code} value={c.code}>
                                {c.flag} {c.dialCode}
                              </option>
                            ))}
                          </select>
                          <input
                            type="tel"
                            value={editPhone}
                            onChange={(e) => {
                              setEditPhone(e.target.value);
                              if (editSameAsPhone) setEditWhatsapp(e.target.value);
                            }}
                            placeholder="Phone number"
                            className="w-full p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)]"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                          Alternate Phone
                        </label>
                        <input
                          type="tel"
                          value={editAltPhone}
                          onChange={(e) => setEditAltPhone(e.target.value)}
                          placeholder="Alternate phone"
                          className="w-full p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)]"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="font-bold text-[11px] text-[var(--text-muted)]">
                            WhatsApp Number
                          </label>
                          <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={editSameAsPhone}
                              onChange={(e) => {
                                setEditSameAsPhone(e.target.checked);
                                if (e.target.checked) setEditWhatsapp(editPhone);
                              }}
                              className="rounded accent-[var(--ink)]"
                            />
                            <span>Same as phone</span>
                          </label>
                        </div>
                        <input
                          type="tel"
                          disabled={editSameAsPhone}
                          value={editSameAsPhone ? editPhone : editWhatsapp}
                          onChange={(e) => setEditWhatsapp(e.target.value)}
                          className={`w-full p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] ${
                            editSameAsPhone ? 'opacity-60 cursor-not-allowed' : ''
                          }`}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="card p-5 bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] space-y-4">
                    <h4 className="text-xs font-bold text-[var(--text-muted)] pb-2 border-b border-[var(--border-subtle)]">
                      Business & Company Profile
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                          Company Name *
                        </label>
                        <input
                          type="text"
                          value={editCompany}
                          onChange={(e) => setEditCompany(e.target.value)}
                          className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)]"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                          Industry
                        </label>
                        <input
                          type="text"
                          value={editIndustry}
                          onChange={(e) => setEditIndustry(e.target.value)}
                          placeholder="e.g. Technology / SaaS"
                          className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)]"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                          Website
                        </label>
                        <input
                          type="url"
                          value={editWebsite}
                          onChange={(e) => setEditWebsite(e.target.value)}
                          placeholder="https://..."
                          className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)]"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                          GST / Tax ID
                        </label>
                        <input
                          type="text"
                          value={editGst}
                          onChange={(e) => setEditGst(e.target.value)}
                          placeholder="GST / Registration"
                          className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)]"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                          City & State
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={editCity}
                            onChange={(e) => setEditCity(e.target.value)}
                            placeholder="City"
                            className="w-1/2 p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)]"
                          />
                          <input
                            type="text"
                            value={editState}
                            onChange={(e) => setEditState(e.target.value)}
                            placeholder="State"
                            className="w-1/2 p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)]"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                          Country
                        </label>
                        <input
                          type="text"
                          value={editCountryName}
                          onChange={(e) => setEditCountryName(e.target.value)}
                          className="w-full p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)]"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                          Address
                        </label>
                        <textarea
                          rows={2}
                          value={editAddress}
                          onChange={(e) => setEditAddress(e.target.value)}
                          className="w-full p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)]"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                          Estimated Budget ($)
                        </label>
                        <input
                          type="number"
                          value={editEstimatedBudget}
                          onChange={(e) => setEditEstimatedBudget(e.target.value)}
                          className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] font-tabular"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                          Company Size
                        </label>
                        <select
                          value={editCompanySize}
                          onChange={(e) => setEditCompanySize(e.target.value)}
                          className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)]"
                        >
                          <option value="1-10">1-10 employees</option>
                          <option value="11-50">11-50 employees</option>
                          <option value="51-200">51-200 employees</option>
                          <option value="201-500">201-500 employees</option>
                          <option value="500+">500+ Enterprise</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-[var(--border-subtle)]">
                      <div className="flex items-center gap-2">
                        <button
                          type="submit"
                          disabled={isSavingDetails}
                          className="btn btn--primary text-xs font-bold py-2 px-5 rounded-full flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>{isSavingDetails ? 'Saving...' : 'Save Lead Details'}</span>
                        </button>

                        {saveDetailsSuccess && (
                          <span className="text-xs text-emerald-600 font-bold flex items-center gap-1 animate-in fade-in">
                            <Check className="w-3.5 h-3.5" /> Updated on pipeline!
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </form>
              )}

              {/* TAB 3: NOTES (Large Editor with Timeline & Autosave) */}
              {activeTab === 'notes' && (
                <div className="space-y-4 animate-in fade-in">
                  {/* Large Editor (min-height 320px) */}
                  <div className="card p-5 bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-[var(--text-ink)]" />
                        <h4 className="text-xs font-bold text-[var(--text-ink)]">
                          Add Client Note / Meeting Debrief
                        </h4>
                      </div>

                      <div className="flex items-center gap-3">
                        {isAutosaving ? (
                          <span className="text-[11px] text-[var(--text-muted)] animate-pulse flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Saving...
                          </span>
                        ) : lastSavedTime ? (
                          <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                            <Check className="w-3 h-3" /> Saved at {lastSavedTime}
                          </span>
                        ) : null}

                        <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)] cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isPinnedDraft}
                            onChange={(e) => setIsPinnedDraft(e.target.checked)}
                            className="rounded accent-[var(--ink)]"
                          />
                          <Pin className="w-3 h-3 text-[var(--text-muted)]" />
                          <span>Pin to top</span>
                        </label>
                      </div>
                    </div>

                    <textarea
                      key={`note-editor-${lead.id}`}
                      value={noteDraft}
                      onChange={(e) => handleNoteDraftChange(e.target.value)}
                      placeholder="Type your notes, meeting outcomes, action items, or customer requirements here..."
                      className="w-full min-h-[320px] p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] placeholder-[var(--text-muted)] text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-[var(--ink)] resize-y"
                    />

                    <div className="flex items-center justify-between pt-2">
                      <span className="text-[11px] text-[var(--text-muted)]">
                        {hasUnsavedNotes ? (
                          <span className="text-amber-600 font-medium">Unsaved changes in editor</span>
                        ) : (
                          'All timeline notes are synchronized'
                        )}
                      </span>

                      <div className="flex items-center gap-2">
                        {noteDraft && (
                          <button
                            type="button"
                            onClick={() => {
                              setNoteDraft('');
                              setHasUnsavedNotes(false);
                            }}
                            className="btn btn--subtle text-xs py-1.5 px-3 rounded-full"
                          >
                            Clear
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleAddNote}
                          disabled={!noteDraft.trim()}
                          className="btn btn--primary text-xs font-bold py-2 px-5 rounded-full cursor-pointer disabled:opacity-40"
                        >
                          Add to Timeline
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Timestamped Timeline (Newest first) */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-[var(--text-muted)] px-1">
                      Notes Timeline ({notesList.length})
                    </h4>

                    {notesList.map((note) => (
                      <div
                        key={note.id}
                        className={`p-4 rounded-2xl border transition-all ${
                          note.pinned
                            ? 'bg-[var(--butter)]/15 border-[var(--butter)]/50'
                            : 'bg-[var(--bg-card)] border-[var(--border-subtle)]'
                        }`}
                      >
                        <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]/60 text-xs">
                          <div className="flex items-center gap-2">
                            {note.pinned && (
                              <span className="badge badge--pine text-[10px] flex items-center gap-1">
                                <Pin className="w-2.5 h-2.5" /> Pinned
                              </span>
                            )}
                            <span className="text-[11px] text-[var(--text-muted)] font-tabular">
                              {new Date(note.createdAt).toLocaleString()}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleTogglePinNote(note.id)}
                              className="p-1 rounded-lg hover:bg-[var(--solid)] text-[var(--text-muted)] hover:text-[var(--text-ink)]"
                              title={note.pinned ? 'Unpin note' : 'Pin note to top'}
                            >
                              <Pin className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteNote(note.id)}
                              className="p-1 rounded-lg hover:bg-red-50 text-[var(--text-muted)] hover:text-red-600"
                              title="Delete note"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <p className="pt-3 text-xs text-[var(--text-ink)] whitespace-pre-wrap leading-relaxed">
                          {note.content}
                        </p>
                      </div>
                    ))}

                    {notesList.length === 0 && (
                      <div className="p-8 text-center bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] text-xs text-[var(--text-muted)]">
                        No notes logged yet. Use the large editor above to save your first deal note.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: EMAIL (Phase 2 Enhanced + Phase 4 Quotation Emailer) */}
              {activeTab === 'email' && (
                <div className="space-y-5 animate-in fade-in text-xs">
                  {/* Direct Chemical Quotation Emailer Bar */}
                  <div className="card p-4 bg-[#FAF8F2] rounded-2xl border border-[#E3DCCF] flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-xs text-[#262720]">3packmark Chemical Quotation Emailer</h4>
                      <p className="text-[11px] text-[#77766D]">
                        Pre-fill itemized MOQ + Extra breakdown &amp; send Tally-style quotation directly.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleOpenQuotationEmail}
                        className="px-3 py-1.5 rounded-full bg-[#17191A] text-white text-[11px] font-semibold cursor-pointer"
                      >
                        Load Chemical Quotation
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadQuotationSummary}
                        className="px-3 py-1.5 rounded-full bg-white border border-[#E3DCCF] text-[#262720] text-[11px] font-semibold cursor-pointer"
                      >
                        Download Quotation (.html)
                      </button>
                    </div>
                  </div>

                  {isQuotationMode && lineItems.length > 0 && (
                    <div className="card p-4 bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[11px] text-[var(--text-ink)]">
                          Attached Quotation Line Items ({lineItems.length})
                        </span>
                        <span className="font-extrabold text-xs text-[var(--text-ink)] font-tabular">
                          Total: {formatCurrency(lineItems.reduce((s, i) => s + (Number(i.lineTotal) || 0), 0))}
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-[11px] border-collapse">
                          <thead>
                            <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)] text-left">
                              <th className="py-1.5 pr-2">Product</th>
                              <th className="py-1.5 px-2">MOQ + Extra = Total</th>
                              <th className="py-1.5 pl-2 text-right">Line Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border-subtle)]">
                            {lineItems.map((item) => (
                              <tr key={item.productId}>
                                <td className="py-1.5 pr-2 font-semibold">{item.name}</td>
                                <td className="py-1.5 px-2 font-tabular">
                                  {item.moq} + {item.extraQuantity} = <strong>{item.totalQuantity} {item.unit}</strong>
                                </td>
                                <td className="py-1.5 pl-2 text-right font-bold font-tabular">
                                  {formatCurrency(item.lineTotal)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {quotationFeedback && (
                    <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-900 space-y-2">
                      <div className="font-semibold text-xs">{quotationFeedback.message}</div>
                      {showMoveToFollowUpPrompt && (
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-emerald-500/20">
                          <span className="text-[11px]">
                            Move lead to <strong>Quotation Follow Up</strong> &amp; schedule next follow-up (+2 days)?
                          </span>
                          <button
                            type="button"
                            disabled={isMovingToFollowUp}
                            onClick={handleMoveToQuotationFollowUpAndSchedule}
                            className="px-3 py-1.5 rounded-full bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                          >
                            {isMovingToFollowUp ? 'Updating...' : 'Move & Schedule Follow-Up'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Floating 5-Second Undo Toast */}
                  {undoToastActive && (
                    <div className="p-4 rounded-2xl bg-[var(--ink)] text-white shadow-2xl flex items-center justify-between gap-4 border border-[var(--border-subtle)] animate-in slide-in-from-top-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[var(--tomato)] flex items-center justify-center font-bold font-mono text-sm">
                          {undoCountdown}
                        </div>
                        <div>
                          <div className="font-bold text-sm">Dispatching email via Gmail...</div>
                          <div className="text-[11px] opacity-80">Click Undo within {undoCountdown}s to cancel.</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleCancelUndoSend}
                        className="px-4 py-2 rounded-full bg-white text-black text-xs font-bold hover:bg-gray-200 transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                        <span>Undo</span>
                      </button>
                    </div>
                  )}

                  {/* Missing Email Alert */}
                  {!lead.email && (
                    <div className="p-4 rounded-2xl bg-[var(--tomato)]/10 border border-[var(--tomato)]/30 text-[var(--tomato)] flex items-center gap-3">
                      <AlertCircle className="w-5 h-5 shrink-0" />
                      <div>
                        <span className="font-bold block">No Email Address Configured</span>
                        <span className="text-[11px]">
                          This lead does not have an email address. Add one in the <strong>Contact & Business</strong> tab to dispatch emails.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Template Picker Section */}
                  <div className="card p-5 bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[var(--border-subtle)]">
                      <div>
                        <h4 className="font-bold text-xs text-[var(--text-muted)]">
                          Choose Template
                        </h4>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          Select an engineered template to auto-fill details tailored for {lead.contactName || lead.company}.
                        </p>
                      </div>

                      <div className="relative w-full sm:w-56">
                        <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={templateSearch}
                          onChange={(e) => setTemplateSearch(e.target.value)}
                          placeholder="Search templates..."
                          className="w-full pl-8 pr-3 py-1.5 rounded-full bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-ink)] focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Category Filter Chips */}
                    <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-1">
                      {['all', 'outreach', 'sales', 'meeting', 'follow_up'].map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setTemplateCategoryFilter(cat)}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all cursor-pointer whitespace-nowrap ${
                            templateCategoryFilter === cat
                              ? 'bg-[var(--ink)] text-[var(--bg-card)]'
                              : 'bg-[var(--bg-main)] text-[var(--text-muted)] hover:text-[var(--text-ink)] border border-[var(--border-subtle)]'
                          }`}
                        >
                          {cat === 'all' ? 'All' : cat.replace('_', ' ').toUpperCase()}
                        </button>
                      ))}
                    </div>

                    {/* Template Chips / Cards */}
                    <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto pr-1">
                      {availableTemplates
                        .filter((tpl) => {
                          const matchesSearch =
                            tpl.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
                            tpl.subject.toLowerCase().includes(templateSearch.toLowerCase());
                          const matchesCat =
                            templateCategoryFilter === 'all' ||
                            (tpl.category && tpl.category.toLowerCase() === templateCategoryFilter.toLowerCase());
                          return matchesSearch && matchesCat;
                        })
                        .map((tpl) => {
                          const isSelected = selectedTemplateId === tpl.id;
                          return (
                            <button
                              key={tpl.id}
                              type="button"
                              onClick={() => handleSelectTemplate(tpl)}
                              className={`px-3 py-2 rounded-xl text-left border transition-all cursor-pointer flex flex-col ${
                                isSelected
                                  ? 'bg-[var(--ink)] text-[var(--bg-card)] border-transparent shadow-xs'
                                  : 'bg-[var(--bg-main)] border-[var(--border-subtle)] text-[var(--text-ink)] hover:border-[var(--text-muted)]'
                              }`}
                            >
                              <span className="font-bold text-[11px] truncate max-w-[200px]">{tpl.name}</span>
                              <span className="text-[10px] opacity-75 truncate max-w-[200px]">{tpl.subject}</span>
                            </button>
                          );
                        })}
                    </div>
                  </div>

                  {/* Message Composer & Live Preview */}
                  <div className="card p-5 bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
                      <span className="font-bold text-xs text-[var(--text-muted)]">
                        Compose & Send (To: {lead.email || 'No email'})
                      </span>
                      {selectedTemplateId && (
                        <span className="text-[10px] text-[var(--pine)] font-semibold px-2 py-0.5 rounded-full bg-[var(--pine)]/15">
                          Template Applied
                        </span>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                          Subject Line *
                        </label>
                        <input
                          type="text"
                          value={emailSubject}
                          onChange={(e) => setEmailSubject(e.target.value)}
                          placeholder="Subject line..."
                          className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                          Email Message *
                        </label>
                        <textarea
                          rows={8}
                          value={emailBody}
                          onChange={(e) => setEmailBody(e.target.value)}
                          placeholder="Email body text or HTML..."
                          className="w-full p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none leading-relaxed font-sans"
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                        <span className="text-[11px] text-[var(--text-muted)]">
                          {isQuotationMode
                            ? 'Sends formatted Tally-style quotation HTML & logs to Activity timeline.'
                            : 'Dispatched via connected Gmail account with 5-second undo protection.'}
                        </span>

                        <div className="flex items-center gap-2">
                          {isQuotationMode ? (
                            <button
                              type="button"
                              onClick={handleSendQuotationEmailNow}
                              disabled={isSendingEmail || !lead.email || !emailSubject.trim()}
                              className="btn btn--tomato text-xs font-bold py-2.5 px-6 rounded-full flex items-center gap-2 cursor-pointer disabled:opacity-50 shadow-md"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>{isSendingEmail ? 'Sending Quotation...' : 'Send Quotation Email'}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={initiateSendEmailWithUndo}
                              disabled={isSendingEmail || !lead.email || !emailSubject.trim()}
                              className="btn btn--tomato text-xs font-bold py-2.5 px-6 rounded-full flex items-center gap-2 cursor-pointer disabled:opacity-50 shadow-md"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>{isSendingEmail ? 'Sending...' : 'Send Email'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Sent Email History */}
                  <div className="card p-5 bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] space-y-3">
                    <h4 className="font-bold text-xs text-[var(--text-muted)] pb-2 border-b border-[var(--border-subtle)] flex items-center justify-between">
                      <span>Sent Email History ({emailLogs.length})</span>
                      <button
                        type="button"
                        onClick={loadEmailData}
                        className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-ink)] cursor-pointer"
                      >
                        Refresh
                      </button>
                    </h4>

                    {emailLogs.length === 0 ? (
                      <div className="py-6 text-center text-xs text-[var(--text-muted)]">
                        No emails dispatched to this lead yet.
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-56 overflow-y-auto">
                        {emailLogs.map((log) => (
                          <div
                            key={log.id}
                            className="p-3 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <span className="font-bold text-xs text-[var(--text-ink)] block truncate">
                                {log.subject}
                              </span>
                              <span className="text-[11px] text-[var(--text-muted)] block truncate">
                                To: {log.toEmail} • {log.bodyPreview}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  log.status === 'sent'
                                    ? 'bg-[var(--pine)]/15 text-[var(--pine)]'
                                    : 'bg-[var(--tomato)]/15 text-[var(--tomato)]'
                                }`}
                              >
                                {log.status.toUpperCase()}
                              </span>
                              <span className="text-[10px] text-[var(--text-muted)] font-mono">
                                {new Date(log.sentAt).toLocaleDateString([], {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 5: TASKS */}
              {activeTab === 'tasks' && (
                <div className="space-y-4 animate-in fade-in">
                  <div className="card p-5 bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] space-y-3 text-xs">
                    <h4 className="font-bold text-xs text-[var(--text-muted)] pb-2 border-b border-[var(--border-subtle)]">
                      Create Deal Follow-up Task
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                          Task Description *
                        </label>
                        <input
                          type="text"
                          value={taskTitle}
                          onChange={(e) => setTaskTitle(e.target.value)}
                          placeholder="e.g. Send revised proposal"
                          className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                          Due Date
                        </label>
                        <input
                          type="date"
                          value={taskDue}
                          onChange={(e) => setTaskDue(e.target.value)}
                          className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                          Follow-Up Queue
                        </label>
                        <select
                          value={taskQueue}
                          onChange={(e) => setTaskQueue(e.target.value as TaskQueueCategory)}
                          className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none"
                        >
                          {TASK_QUEUES.map((q) => (
                            <option key={q} value={q}>
                              {q}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="button"
                        onClick={handleCreateTask}
                        disabled={isCreatingTask || !taskTitle.trim()}
                        className="btn btn--primary text-xs font-bold py-2 px-5 rounded-full cursor-pointer disabled:opacity-50"
                      >
                        {isCreatingTask ? 'Adding...' : 'Schedule Task'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 6: ACTIVITY & TIMELINE */}
              {activeTab === 'activity' && (
                <div className="space-y-4 animate-in fade-in">
                  {/* Call Logger */}
                  <div className="card p-4.5 bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] space-y-3 text-xs">
                    <h4 className="font-bold text-xs text-[var(--text-muted)]">
                      Log Phone Interaction
                    </h4>
                    <div className="flex gap-2">
                      <select
                        value={callOutcome}
                        onChange={(e) => setCallOutcome(e.target.value)}
                        className="p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)]"
                      >
                        <option>Connected - Positive</option>
                        <option>Connected - Follow-up Needed</option>
                        <option>Left Voicemail</option>
                        <option>No Answer</option>
                      </select>
                      <input
                        type="text"
                        value={callNotes}
                        onChange={(e) => setCallNotes(e.target.value)}
                        placeholder="Call notes & next steps..."
                        className="flex-1 p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)]"
                      />
                      <button
                        type="button"
                        onClick={handleLogCall}
                        disabled={isLoggingCall}
                        className="btn btn--pine text-xs font-bold px-4 rounded-xl cursor-pointer"
                      >
                        {isLoggingCall ? 'Logging...' : 'Log'}
                      </button>
                    </div>
                  </div>

                  {/* Google Calendar & Meet Scheduler */}
                  <form
                    onSubmit={handleScheduleMeeting}
                    className="card p-4.5 bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] space-y-3 text-xs"
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-[var(--pine)]">
                      <Video className="w-3.5 h-3.5" />
                      <span>Schedule Google Calendar & Meet Session</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div className="sm:col-span-3">
                        <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                          Meeting Title *
                        </label>
                        <input
                          type="text"
                          required
                          value={meetTitle}
                          onChange={(e) => setMeetTitle(e.target.value)}
                          className="w-full p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)]"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                          Date *
                        </label>
                        <input
                          type="date"
                          required
                          value={meetDate}
                          onChange={(e) => setMeetDate(e.target.value)}
                          className="w-full p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)]"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                          Time *
                        </label>
                        <input
                          type="time"
                          required
                          value={meetTime}
                          onChange={(e) => setMeetTime(e.target.value)}
                          className="w-full p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)]"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                          Duration
                        </label>
                        <select
                          value={meetDuration}
                          onChange={(e) => setMeetDuration(Number(e.target.value))}
                          className="w-full p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)]"
                        >
                          <option value={15}>15 mins</option>
                          <option value={30}>30 mins</option>
                          <option value={45}>45 mins</option>
                          <option value={60}>60 mins</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)]">
                      <span className="font-semibold text-[var(--text-ink)]">Generate Google Meet link</span>
                      <input
                        type="checkbox"
                        checked={meetEnableVideo}
                        onChange={(e) => setMeetEnableVideo(e.target.checked)}
                        className="accent-[var(--pine)]"
                      />
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={isSubmittingMeeting}
                        className="btn btn--pine text-xs font-bold py-2 px-5 rounded-full cursor-pointer disabled:opacity-50"
                      >
                        {isSubmittingMeeting ? 'Creating...' : 'Sync Event'}
                      </button>
                    </div>
                  </form>

                  {/* Activity History List */}
                  <div className="space-y-2.5">
                    <h4 className="text-xs font-bold text-[var(--text-muted)] px-1">
                      Chronological History
                    </h4>

                    {activities.map((act) => (
                      <div
                        key={act.id}
                        className="p-3.5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-1 text-xs"
                      >
                        <div className="flex items-center justify-between text-[var(--text-muted)] text-[10px]">
                          <span className="font-bold">{act.type}</span>
                          <span className="font-tabular">{new Date(act.createdAt).toLocaleString()}</span>
                        </div>
                        <h5 className="font-bold text-[var(--text-ink)]">{act.title}</h5>
                        <p className="text-[var(--text-muted)] text-[11px] whitespace-pre-wrap">{act.description}</p>
                      </div>
                    ))}

                    {activities.length === 0 && !isLoadingActivities && (
                      <div className="p-8 text-center bg-[var(--bg-card)] rounded-2xl border border-[var(--border-subtle)] text-xs text-[var(--text-muted)]">
                        No activity records found yet.
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>

        {/* Footer (Delete Opportunity on Left, Done on Right) */}
        <div className="p-4 bg-[var(--bg-card)]/95 backdrop-blur-md border-t border-[var(--border-subtle)] flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onDelete}
            className="btn btn--subtle text-xs text-[var(--tomato)] hover:bg-[var(--tomato-soft)] font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Opportunity</span>
          </button>

          <MagneticButton
            onClick={handleSafeClose}
            className="btn btn--primary px-6 py-2 rounded-full font-bold text-xs cursor-pointer"
          >
            Done
          </MagneticButton>
        </div>
      </div>

      {/* Closed Lost Confirmation Modal */}
      {showLossModal && (
        <div
          className="scrim fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setShowLossModal(false)}
        >
          <div
            className="card p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 bg-[var(--bg-card)] rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-[var(--text-ink)]">Mark Deal as Closed Lost</h3>
            <p className="text-xs text-[var(--text-muted)]">
              Specify the primary reason to preserve conversion analytics.
            </p>

            <select
              value={lossReason}
              onChange={(e) => setLossReason(e.target.value)}
              className="w-full text-xs p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none"
            >
              <option>Competitor chosen on price</option>
              <option>Budget frozen or canceled</option>
              <option>Features / Scope mismatch</option>
              <option>No executive decision sponsor</option>
              <option>Timeline postponed past next year</option>
            </select>

            <div className="flex justify-end gap-2.5 pt-2 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setShowLossModal(false)}
                className="btn btn--subtle text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await onMarkLost(lossReason);
                  setShowLossModal(false);
                }}
                className="btn btn--tomato text-xs font-bold"
              >
                Confirm Lost
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-created Call-Back Date Prompt Modal (Phase 3) */}
      {showCallbackModal && callbackTargetStage && (
        <div
          className="scrim fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setShowCallbackModal(false)}
        >
          <div
            className="card p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 bg-[var(--bg-card)] rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <div>
                <h3 className="text-base font-bold text-[var(--text-ink)]">
                  Schedule Auto Call-Back Task
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Moving deal to &ldquo;{callbackTargetStage.name}&rdquo;
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCallbackModal(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-ink)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                  Target Call-Back Date *
                </label>
                <input
                  type="date"
                  value={callbackDate}
                  onChange={(e) => setCallbackDate(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-[11px] text-[var(--text-muted)] block mb-1">
                  Follow-up Notes / Context (Optional)
                </label>
                <textarea
                  rows={3}
                  value={callbackNotes}
                  onChange={(e) => setCallbackNotes(e.target.value)}
                  placeholder="e.g. Call to discuss budget revision after fiscal quarter ends..."
                  className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] focus:outline-none resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setShowCallbackModal(false)}
                className="btn btn--subtle text-xs py-2 px-4 rounded-full"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSchedulingCallback || !callbackDate}
                onClick={handleConfirmCallback}
                className="btn btn--pine text-xs font-bold py-2 px-5 rounded-full"
              >
                {isSchedulingCallback ? 'Saving...' : 'Set Call-Back & Move Stage'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Pre-Send Credit Terms Popup & Commercial Offer Preview */}
      {lead && (
        <CommercialOfferModal
          isOpen={isCommercialOfferOpen}
          lead={lead}
          lineItems={lineItems}
          workspace={workspace}
          onClose={() => setIsCommercialOfferOpen(false)}
          onSentSuccess={async (res) => {
            if (onUpdateLead) {
              await onUpdateLead(lead.id, { creditTerms: res.creditTerms });
            }
            setQuotationFeedback({
              message: res.message,
              simulated: res.simulated,
            });
            setShowMoveToFollowUpPrompt(true);
            await loadActivities();
            await loadEmailData();
          }}
        />
      )}
    </div>
  );
}
