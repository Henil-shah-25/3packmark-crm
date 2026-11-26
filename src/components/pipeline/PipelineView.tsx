'use client';

import React, { useState, useRef, useMemo, useDeferredValue, useEffect } from 'react';
import {
  Trophy,
  TrendingUp,
  Calendar,
  Search,
  Plus,
  Download,
  MoreHorizontal,
  LayoutGrid,
  List,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Sparkles,
  FileSpreadsheet,
  Phone,
  Trash2,
} from 'lucide-react';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { Lead, Pipeline, PipelineStage, TeamMember } from '@/types/crm';
import confetti from 'canvas-confetti';
import {
  formatCurrency,
  formatPercent,
  parseFinancialNumber,
  calculateOpenPipeline,
  calculateWeightedForecast,
  deduplicateLeads,
} from '@/lib/financial';
import { HeaderReveal } from '@/components/ui/HeaderReveal';
import { BulkLeadImportModal } from './BulkLeadImportModal';
import { formatDateOnly } from '@/lib/dateTime';
import { SlidingTabs } from '@/components/ui/SlidingTabs';
import { MagneticButton } from '@/components/ui/MagneticButton';
import {
  formatLeadCardSubtitle,
  CALL_STATUS_OPTIONS,
  CREDIT_TERMS_OPTIONS,
} from '@/lib/pipeline/stage-rules';
import { resolveStageHex, getContrastTextHex } from '@/lib/pipeline/stage-colors';

interface PipelineViewProps {
  pipeline: Pipeline;
  pipelines?: Pipeline[];
  onSelectPipeline?: (pipelineId: string) => void;
  stages: PipelineStage[];
  leads: Lead[];
  members: TeamMember[];
  currency?: string;
  workspace?: any;
  onOpenSheetsImport?: () => void;
  onRefreshLeads?: () => Promise<void> | void;
  onSelectLead: (lead: Lead) => void;
  onOpenNewDeal: (defaultStageId?: string) => void;
  onUpdateLeadStage: (leadId: string, targetStageId: string, extraUpdates?: Partial<Lead>) => Promise<void>;
  onMarkDealWon: (lead: Lead) => Promise<void>;
  onMarkDealLost: (lead: Lead) => void;
  onDeleteLead?: (lead: Lead) => Promise<void> | void;
  onExportCSV: () => void;
}

function formatCardPhone(rawPhone?: string): string {
  if (!rawPhone || !rawPhone.trim()) return '';
  try {
    const parsed = parsePhoneNumberFromString(rawPhone);
    if (parsed && parsed.isValid()) {
      return parsed.formatInternational();
    }
  } catch (e) {}
  const trimmed = rawPhone.trim();
  return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
}

export function PipelineView({
  pipeline,
  pipelines = [],
  onSelectPipeline,
  stages,
  leads,
  members,
  currency = 'INR',
  workspace,
  onOpenSheetsImport,
  onRefreshLeads,
  onSelectLead,
  onOpenNewDeal,
  onUpdateLeadStage,
  onMarkDealWon,
  onMarkDealLost,
  onDeleteLead,
  onExportCSV,
}: PipelineViewProps) {
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [stageFilterMode, setStageFilterMode] = useState<'all' | 'active' | 'outcomes'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearch = useDeferredValue(searchQuery);

  // Dynamic high-value deal filters (deals >= ₹10,000)
  const qualifyingDeals = useMemo(() => {
    return leads.filter((l) => (Number(l.value) || 0) >= 10000);
  }, [leads]);

  const [filterMode, setFilterMode] = useState<'employees' | 'contacts'>('employees');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [selectedContactName, setSelectedContactName] = useState<string | null>(null);
  const transparentDragImgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    transparentDragImgRef.current = img;
  }, []);

  // Real assigned employees (deal owners) on qualifying deals
  const qualifyingEmployees = useMemo(() => {
    const ownerIds = new Set(qualifyingDeals.map((l) => l.ownerId).filter(Boolean));
    const matched = members.filter((m) => ownerIds.has(m.id));
    return matched.map((m) => ({
      id: m.id,
      name: m.name,
      avatar: m.avatar,
      color: m.color || '#285E50',
      dealCount: qualifyingDeals.filter((l) => l.ownerId === m.id).length,
    }));
  }, [qualifyingDeals, members]);

  // Real contact persons associated with qualifying deals
  const qualifyingContacts = useMemo(() => {
    const map = new Map<string, { id: string; name: string; company: string; count: number }>();
    for (const d of qualifyingDeals) {
      const name = d.contactName?.trim();
      if (!name) continue;
      const existing = map.get(name);
      if (!existing) {
        map.set(name, {
          id: `contact-${name.toLowerCase().replace(/\s+/g, '-')}`,
          name,
          company: d.company || 'Enterprise',
          count: 1,
        });
      } else {
        existing.count += 1;
      }
    }
    return Array.from(map.values());
  }, [qualifyingDeals]);

  const [draggingLeadId, setDraggingLeadId] = useState<string | null>(null);
  const dragOverlayRef = useRef<HTMLDivElement | null>(null);
  const initialDragPosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!draggingLeadId) {
      initialDragPosRef.current = null;
      return;
    }
    const handleWindowDragOver = (e: DragEvent) => {
      e.preventDefault();
      if ((e.clientX !== 0 || e.clientY !== 0) && dragOverlayRef.current) {
        dragOverlayRef.current.style.transform = `translate3d(${e.clientX + 12}px, ${e.clientY + 12}px, 0)`;
      }
    };
    const handleWindowDragEnd = () => {
      setDraggingLeadId(null);
      setDragOverStageId(null);
    };
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('dragend', handleWindowDragEnd);
    return () => {
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('dragend', handleWindowDragEnd);
    };
  }, [draggingLeadId]);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);
  const [activeMenuLeadId, setActiveMenuLeadId] = useState<string | null>(null);
  const [pendingStageModal, setPendingStageModal] = useState<{
    lead: Lead;
    targetStageId: 'stg-call-status' | 'stg-credit-days';
  } | null>(null);
  const [selectedModalOption, setSelectedModalOption] = useState<string>('');
  const [isConfirmingStageModal, setIsConfirmingStageModal] = useState(false);

  const boardScrollRef = useRef<HTMLDivElement>(null);

  // Floating Undo Toast state
  const [undoToast, setUndoToast] = useState<{
    visible: boolean;
    leadTitle: string;
    amount: number;
    leadId: string;
    previousStageId: string;
  } | null>(null);

  // Deduplicate and filter leads based on search and selected owner
  const filteredLeads = useMemo(() => {
    const unique = deduplicateLeads(leads);
    const q = deferredSearch.toLowerCase().trim();

    return unique.filter((l) => {
      if (q) {
        const match =
          l.title.toLowerCase().includes(q) ||
          l.company.toLowerCase().includes(q) ||
          l.contactName.toLowerCase().includes(q) ||
          (l.source && l.source.toLowerCase().includes(q));
        if (!match) return false;
      }
      if (selectedMemberId && l.ownerId !== selectedMemberId) return false;
      if (selectedContactName && l.contactName !== selectedContactName) return false;
      return true;
    });
  }, [leads, deferredSearch, selectedMemberId, selectedContactName]);

  // Active leads (excluding terminal won & loss for top KPI metrics)
  const activeLeads = useMemo(() => {
    return filteredLeads.filter(
      (l) => l.status !== 'Won' && l.status !== 'Lost' && l.stageId !== 'stg-won' && l.stageId !== 'stg-loss'
    );
  }, [filteredLeads]);

  // Top KPI calculations
  const openPipelineValue = useMemo(() => {
    return calculateOpenPipeline(filteredLeads);
  }, [filteredLeads]);

  const weightedForecast = useMemo(() => {
    return calculateWeightedForecast(filteredLeads);
  }, [filteredLeads]);

  const dealsClosingThisMonth = useMemo(() => {
    const now = typeof window !== 'undefined' ? new Date() : new Date('2026-10-26T12:00:00Z');
    return activeLeads.filter((l) => {
      if (!l.expectedCloseDate) return false;
      const d = new Date(l.expectedCloseDate);
      return !isNaN(d.getTime()) && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
  }, [activeLeads]);

  const closingThisMonthSum = useMemo(() => {
    return dealsClosingThisMonth.reduce((sum, l) => sum + parseFinancialNumber(l.value, 0), 0);
  }, [dealsClosingThisMonth]);

  // Terminal counts
  const wonDeals = useMemo(
    () => filteredLeads.filter((l) => l.status === 'Won' || l.stageId === 'stg-won'),
    [filteredLeads]
  );
  const lostDeals = useMemo(
    () => filteredLeads.filter((l) => l.status === 'Lost' || l.stageId === 'stg-loss'),
    [filteredLeads]
  );
  const wonSum = useMemo(
    () => wonDeals.reduce((sum, l) => sum + parseFinancialNumber(l.value, 0), 0),
    [wonDeals]
  );

  // Sort stages by order and safely deduplicate by id and name
  const sortedStages = useMemo(() => {
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();
    const unique: PipelineStage[] = [];
    for (const s of stages) {
      const normId = s.id;
      const normName = s.name?.trim().toLowerCase();
      if (seenIds.has(normId) || (normName && seenNames.has(normName))) continue;
      seenIds.add(normId);
      if (normName) seenNames.add(normName);
      unique.push(s);
    }
    return unique.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  }, [stages]);

  // Determine which stages to display based on filter toggle
  const displayStages = useMemo(() => {
    if (stageFilterMode === 'active') {
      return sortedStages.filter((s) => !s.isWon && !s.isLost && s.id !== 'stg-won' && s.id !== 'stg-loss');
    }
    if (stageFilterMode === 'outcomes') {
      return sortedStages.filter((s) => s.isWon || s.isLost || s.id === 'stg-won' || s.id === 'stg-loss');
    }
    return sortedStages;
  }, [sortedStages, stageFilterMode]);

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    e.dataTransfer.setData('text/plain', leadId);
    e.dataTransfer.effectAllowed = 'move';
    if (transparentDragImgRef.current) {
      e.dataTransfer.setDragImage(transparentDragImgRef.current, 0, 0);
    }
    initialDragPosRef.current = { x: e.clientX + 12, y: e.clientY + 12 };
    setDraggingLeadId(leadId);
  };

  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverStageId !== stageId) {
      setDragOverStageId(stageId);
    }
  };

  const handleDragLeave = () => {
    setDragOverStageId(null);
  };

  const requestStageMove = async (lead: Lead, targetStageId: string) => {
    if (!lead || lead.stageId === targetStageId) return;

    if (targetStageId === 'stg-won' || targetStageId === 'stg-closed') {
      triggerWonCelebration(lead);
      if (targetStageId === 'stg-closed') {
        await onUpdateLeadStage(lead.id, 'stg-closed');
      } else {
        await onMarkDealWon(lead);
      }
      return;
    }
    if (targetStageId === 'stg-loss') {
      onMarkDealLost(lead);
      return;
    }
    if (targetStageId === 'stg-call-status') {
      setSelectedModalOption(lead.callSubStatus || CALL_STATUS_OPTIONS[0]);
      setPendingStageModal({ lead, targetStageId: 'stg-call-status' });
      return;
    }
    if (targetStageId === 'stg-credit-days') {
      setSelectedModalOption(lead.creditTerms || CREDIT_TERMS_OPTIONS[0]);
      setPendingStageModal({ lead, targetStageId: 'stg-credit-days' });
      return;
    }

    await onUpdateLeadStage(lead.id, targetStageId);
  };

  const handleConfirmStageModal = async () => {
    if (!pendingStageModal || !selectedModalOption) return;
    setIsConfirmingStageModal(true);
    try {
      const { lead, targetStageId } = pendingStageModal;
      const extraUpdates: Partial<Lead> =
        targetStageId === 'stg-call-status'
          ? { callSubStatus: selectedModalOption }
          : { creditTerms: selectedModalOption };
      await onUpdateLeadStage(lead.id, targetStageId, extraUpdates);
      setPendingStageModal(null);
      setSelectedModalOption('');
    } finally {
      setIsConfirmingStageModal(false);
    }
  };

  const handleDropOnStage = async (e: React.DragEvent, targetStageId: string) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('text/plain') || draggingLeadId;
    setDragOverStageId(null);
    setDraggingLeadId(null);

    if (!leadId) return;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.stageId === targetStageId) return;

    await requestStageMove(lead, targetStageId);
  };

  const handleDropOnWonDropzone = async (e: React.DragEvent) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('text/plain') || draggingLeadId;
    setDragOverStageId(null);
    setDraggingLeadId(null);
    if (!leadId) return;
    const lead = leads.find((l) => l.id === leadId);
    if (lead) {
      triggerWonCelebration(lead);
      await onMarkDealWon(lead);
    }
  };

  const handleDropOnLostDropzone = (e: React.DragEvent) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('text/plain') || draggingLeadId;
    setDragOverStageId(null);
    setDraggingLeadId(null);
    if (!leadId) return;
    const lead = leads.find((l) => l.id === leadId);
    if (lead) {
      onMarkDealLost(lead);
    }
  };

  const handleDropOnDeleteDropzone = async (e: React.DragEvent) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('text/plain') || draggingLeadId;
    setDragOverStageId(null);
    setDraggingLeadId(null);
    if (!leadId || !onDeleteLead) return;
    const lead = leads.find((l) => l.id === leadId);
    if (lead) {
      await onDeleteLead(lead);
    }
  };

  const triggerWonCelebration = (lead: Lead) => {
    confetti({
      particleCount: 80,
      spread: 60,
      origin: { y: 0.8 },
      colors: ['#376E60', '#F0CF58', '#CC5537', '#252725'],
    });

    setUndoToast({
      visible: true,
      leadTitle: lead.title,
      amount: parseFinancialNumber(lead.value, 0),
      leadId: lead.id,
      previousStageId: lead.stageId,
    });

    setTimeout(() => {
      setUndoToast((prev) => (prev?.leadId === lead.id ? null : prev));
    }, 8000);
  };

  const handleUndoWon = async () => {
    if (!undoToast) return;
    await onUpdateLeadStage(undoToast.leadId, undoToast.previousStageId || 'stg-qualified');
    setUndoToast(null);
  };

  // User-defined stage colour mapper preserving exact colour specifications
  const getStageStyle = (stage: PipelineStage) => {
    const hex = resolveStageHex(stage);
    const contrastText = getContrastTextHex(hex);
    const normId = stage.id?.toLowerCase() || '';
    const normName = stage.name?.toLowerCase().trim() || '';
    const isLost = normId === 'stg-loss' || normId === 'stg-lost' || stage.isLost || normName.includes('lost');

    return {
      pillBg: hex,
      pillText: contrastText,
      dotColor: hex,
      columnBg: isLost ? 'bg-[#FAF2F3]/70 border-[#E5C7C9]' : 'bg-[#FAF8F2] border-[#E3DCCF]',
      accent: hex,
    };
  };

  return (
    <div className="w-full flex-1 flex flex-col min-h-0 min-w-0" data-view="pipeline">
      {/* Compact Page Header with two-line title & horizontal KPI stats matching Rapport reference */}
      <div className="pl-head">
        <div className="flex items-center gap-6 lg:gap-10 flex-wrap lg:flex-nowrap min-w-0">
          <div className="pl-title-block shrink-0">
            <h1 className="pl-title-bottom text-lg font-bold text-[var(--ink)] whitespace-nowrap">
              3packmark Sales Pipeline
            </h1>
          </div>

          {/* 3 stats in ONE horizontal row beside the title */}
          <div className="pl-stats-row">
            {/* Stat 1: Open Pipeline */}
            <div className="pl-stat-item">
              <div className="pl-stat-icon">
                <Trophy className="w-4 h-4 text-[var(--ink)]" />
              </div>
              <div>
                <div className="pl-stat-num">
                  <span>{formatCurrency(openPipelineValue, currency)}</span>
                </div>
                <div className="pl-stat-label">Open pipeline</div>
              </div>
            </div>

            {/* Stat 2: Weighted Forecast */}
            <div className="pl-stat-item">
              <div className="pl-stat-icon">
                <TrendingUp className="w-4 h-4 text-[var(--ink)]" />
              </div>
              <div>
                <div className="pl-stat-num">
                  <span>{formatCurrency(weightedForecast, currency)}</span>
                </div>
                <div className="pl-stat-label">Weighted forecast</div>
              </div>
            </div>

            {/* Stat 3: Closing This Month */}
            <div className="pl-stat-item">
              <div className="pl-stat-icon">
                <Calendar className="w-4 h-4 text-[var(--ink)]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="pl-stat-num">{dealsClosingThisMonth.length}</span>
                  {closingThisMonthSum > 0 && (
                    <span className="pl-stat-badge">
                      {formatCurrency(closingThisMonthSum, currency, { compact: true })}
                    </span>
                  )}
                </div>
                <div className="pl-stat-label">Deals closing this month</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Step 6: Compact Toolbar (~36-38px) */}
      <div className="pl-toolbar">
        {/* Left Side: Search + Owner/Rep chips */}
        <div className="flex items-center flex-wrap gap-2 flex-1 min-w-0">
          {/* Search: 36px tall translucent pill (~210px width) */}
          <div className="pl-search">
            <Search className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search deals.."
            />
          </div>

          {/* Sales Rep Quick-Filter Pills */}
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <button
              type="button"
              onClick={() => {
                setSelectedMemberId(null);
                setSelectedContactName(null);
              }}
              aria-pressed={!selectedMemberId}
              className={`pl-rep-chip ${!selectedMemberId ? 'is-active' : ''}`}
            >
              <span>All Reps</span>
            </button>
            {members.map((emp) => {
              const isSelected = selectedMemberId === emp.id;
              return (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => setSelectedMemberId(isSelected ? null : emp.id)}
                  aria-pressed={isSelected}
                  className={`pl-rep-chip ${isSelected ? 'is-active' : ''}`}
                  title={`Filter deals assigned to ${emp.name}`}
                >
                  <span>{emp.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Side: View Filters + Segmented Control + Import + Export + New Deal */}
        <div className="flex items-center flex-wrap gap-2 shrink-0 ml-auto">
          {/* Board / List Segmented Control */}
          <div className="pl-seg shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('board')}
              aria-pressed={viewMode === 'board'}
              className={viewMode === 'board' ? 'is-active' : ''}
            >
              <span>Board</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-pressed={viewMode === 'list'}
              className={viewMode === 'list' ? 'is-active' : ''}
            >
              <span>List</span>
            </button>
          </div>

          {/* Single Bulk Excel / CSV Lead Importer Button */}
          <button
            type="button"
            onClick={() => setIsBulkImportOpen(true)}
            className="pl-btn-ghost"
            title="Import Leads from Excel (.xlsx / .xls) or CSV"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-[var(--muted)]" />
            <span>Import Excel / CSV</span>
          </button>

          {/* Export Button */}
          <button
            type="button"
            onClick={onExportCSV}
            title="Export Deals to CSV"
            className="pl-btn-icon"
            aria-label="Export Deals to CSV"
          >
            <Download className="w-3.5 h-3.5 text-[var(--muted)]" />
          </button>

          {/* New Deal Black Pill Button */}
          <button
            type="button"
            onClick={() => onOpenNewDeal()}
            className="pl-btn-new-deal"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>New deal</span>
          </button>
        </div>
      </div>

      {/* Main Kanban Board View: Single Continuous Horizontal Row with Smooth Internal Scrolling */}
      {viewMode === 'board' ? (
        <div className="pl-board-wrap">
          {/* Horizontally scrolling columns container */}
          <div
            ref={boardScrollRef}
            className="pl-cols-scroll"
          >
            {displayStages.map((stage) => {
              const stageLeads = filteredLeads.filter((l) => l.stageId === stage.id);
              const stageTotal = stageLeads.reduce((sum, l) => sum + parseFinancialNumber(l.value, 0), 0);
              const style = getStageStyle(stage);
              const isOver = dragOverStageId === stage.id;

              return (
                <div
                  key={stage.id}
                  onDragOver={(e) => handleDragOver(e, stage.id)}
                  onDrop={(e) => handleDropOnStage(e, stage.id)}
                  style={{
                    borderColor: isOver ? style.pillBg : 'transparent',
                    backgroundColor: isOver ? `${style.pillBg}0D` : undefined,
                  }}
                  className="pl-col-panel border-2 transition-colors duration-150"
                >
                  {/* Column Header (42px) */}
                  <div className="pl-col-header">
                    <div className="flex items-center gap-2 min-w-0">
                      {/* 16px Dot: ring with coloured core in stage colour */}
                      <div
                        className="pl-dot-ring"
                        style={{
                          backgroundColor: `${style.pillBg}26`,
                          boxShadow: `0 0 0 1px ${style.pillBg}4D`,
                        }}
                      >
                        <div
                          className="pl-dot-core"
                          style={{ backgroundColor: style.pillBg }}
                        />
                      </div>

                      {/* Name 15px font-semibold */}
                      <span className="pl-col-title" title={stage.name}>
                        {stage.name}
                      </span>

                      {/* Count pill */}
                      <span className="pl-count-pill">
                        {stageLeads.length}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Stage Total Value (₹) */}
                      <span className="pl-col-total font-tabular">
                        {formatCurrency(stageTotal, currency)}
                      </span>

                      {/* 28px circular add button */}
                      <button
                        onClick={() => onOpenNewDeal(stage.id)}
                        title={`Add deal to ${stage.name}`}
                        className="pl-add-btn"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Drop Guide Gap */}
                  {isOver && (
                    <div className="mb-2 py-2 px-3 rounded-[18px] border-2 border-dashed border-[var(--text)] bg-[var(--well)] text-center text-xs font-semibold text-[var(--text)] animate-pulse">
                      Drop deal here
                    </div>
                  )}

                  {/* Column Body: Thin custom scrollbar, 10px gap */}
                  <div className="pl-cards-body">
                    {stageLeads.map((lead) => {
                      const owner = members.find((m) => m.id === lead.ownerId);
                      const isDraggingThis = draggingLeadId === lead.id;
                      const isMenuOpen = activeMenuLeadId === lead.id;

                      return (
                        <div
                          key={lead.id}
                          tabIndex={0}
                          role="button"
                          draggable
                          onDragStart={(e) => handleDragStart(e, lead.id)}
                          onDragEnd={() => {
                            setDraggingLeadId(null);
                            setDragOverStageId(null);
                          }}
                          onClick={() => onSelectLead(lead)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onSelectLead(lead);
                            }
                          }}
                          style={
                            isDraggingThis
                              ? {
                                  backgroundColor: 'transparent',
                                  color: 'var(--muted)',
                                  borderColor: 'var(--line-2)',
                                  boxShadow: 'none',
                                }
                              : {
                                  backgroundColor: style.pillBg,
                                  color: style.pillText,
                                  borderColor: 'transparent',
                                }
                          }
                          className={`pl-deal-card border-2 transition-colors duration-150 ${
                            isDraggingThis ? 'border-dashed opacity-45' : ''
                          }`}
                        >
                          {/* Top row: Close date (12.5px, opacity 85%) + 28px circular ⋯ button */}
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[12.5px] font-normal opacity-85 truncate">
                              {lead.expectedCloseDate
                                ? `Closes ${formatDateOnly(lead.expectedCloseDate)}`
                                : 'No date'}
                            </span>

                            <div className="relative" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => setActiveMenuLeadId(isMenuOpen ? null : lead.id)}
                                title="Deal actions"
                                className="pl-card-menu-btn"
                              >
                                <MoreHorizontal className="w-3.5 h-3.5" />
                              </button>

                              {isMenuOpen && (
                                <div className="pop absolute right-0 top-8 z-50 w-52 p-2 text-xs text-[var(--text)] shadow-lg">
                                  <div className="px-3 py-1 font-bold text-[9px] text-[var(--muted)] border-b border-[var(--line)]">
                                    Move to Stage
                                  </div>
                                  <div className="max-h-48 overflow-y-auto py-1">
                                    {sortedStages.map((s) => (
                                      <button
                                        key={s.id}
                                        onClick={async () => {
                                          setActiveMenuLeadId(null);
                                          await requestStageMove(lead, s.id);
                                        }}
                                        className={`menu__item ${s.id === lead.stageId ? 'bg-[var(--well)]' : ''}`}
                                      >
                                        <span className="truncate">{s.name}</span>
                                        {s.id === lead.stageId && (
                                          <CheckCircle2 className="w-3.5 h-3.5 text-[var(--good)] shrink-0 ml-auto" />
                                        )}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Middle: Clean 3-Line Layout (Company Headline + Structured Subtitle) */}
                          <div>
                            <div className="flex items-start justify-between gap-1.5">
                              <h2 className="pl-card-title-compact leading-snug">
                                {lead.company?.trim() || lead.title.replace(/\s+Opportunity$/i, '')}
                              </h2>
                              {(lead.status === 'Won' || lead.status === 'Lost') && (
                                <span
                                  className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase shrink-0 ${
                                    lead.status === 'Won'
                                      ? 'bg-emerald-500 text-white'
                                      : 'bg-rose-600 text-white'
                                  }`}
                                >
                                  {lead.status}
                                </span>
                              )}
                            </div>
                            <p
                              className="text-[11.5px] font-semibold mt-1 leading-snug opacity-90"
                              style={{ color: style.pillText }}
                              title={formatLeadCardSubtitle(lead)}
                            >
                              {formatLeadCardSubtitle(lead)}
                            </p>
                          </div>

                          {/* Footer row: bold ₹ value on left, text-only rep initials pill on right */}
                          <div className="pl-card-footer-compact">
                            <span className="pl-card-amt-compact font-tabular">
                              {formatCurrency(lead.value, currency)}
                            </span>

                            {(() => {
                              const repName = owner?.name || 'Admin';
                              const repUpper = repName.toUpperCase();
                              const initials = repUpper.includes('SALES 1')
                                ? 'S1'
                                : repUpper.includes('SALES 2')
                                ? 'S2'
                                : repUpper.includes('SALES 3')
                                ? 'S3'
                                : repUpper.includes('ADMIN')
                                ? 'AD'
                                : repName
                                    .split(/\s+/)
                                    .map((p) => p[0])
                                    .join('')
                                    .slice(0, 2)
                                    .toUpperCase();
                              return (
                                <span
                                  title={`Assigned Rep: ${repName}`}
                                  className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide border shrink-0"
                                  style={{
                                    borderColor: `${style.pillText}40`,
                                    backgroundColor: `${style.pillText}18`,
                                    color: style.pillText,
                                  }}
                                >
                                  {initials}
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    })}

                    {stageLeads.length === 0 && (
                      <div className="py-8 px-3 flex flex-col items-center justify-center border border-dashed border-[var(--line-2)] rounded-[18px] text-center text-xs font-normal text-[var(--muted)]">
                        <span>Drop a deal here</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Won / Lost: Narrow tall dashed boxes (radius 24px, 105px wide) sticky on RIGHT */}
          <div className="pl-wonlost-sticky">
            {/* Won Dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOverStageId !== 'stg-won') setDragOverStageId('stg-won');
              }}
              onDrop={handleDropOnWonDropzone}
              className={`pl-drop-zone-box won-zone ${
                dragOverStageId === 'stg-won' ? 'is-over' : ''
              }`}
            >
              <div className="pl-zone-icon-circle bg-[#285E50] text-white shadow-xs">
                <Trophy className="w-4 h-4 text-white" />
              </div>
              <div>
                <b className="text-[14px] font-semibold block text-[var(--text)]">Won</b>
                <span className="text-[11px] text-[var(--muted)] block mt-0.5 font-normal tabular-nums">
                  {wonDeals.length} this month • {formatCurrency(wonSum, currency, { compact: true })}
                </span>
              </div>
            </div>

            {/* Lost Dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOverStageId !== 'stg-loss') setDragOverStageId('stg-loss');
              }}
              onDrop={handleDropOnLostDropzone}
              className={`pl-drop-zone-box lost-zone ${
                dragOverStageId === 'stg-loss' ? 'is-over' : ''
              }`}
            >
              <div className="pl-zone-icon-circle bg-black/5 dark:bg-white/10 text-[var(--muted)]">
                <XCircle className="w-4 h-4 text-[var(--muted)]" />
              </div>
              <div>
                <b className="text-[14px] font-semibold block text-[var(--muted)]">Lost</b>
                <span className="text-[11px] text-[var(--muted)] block mt-0.5 font-normal tabular-nums">
                  {lostDeals.length} closed lost
                </span>
              </div>
            </div>

            {/* Delete Dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOverStageId !== 'stg-delete') setDragOverStageId('stg-delete');
              }}
              onDrop={handleDropOnDeleteDropzone}
              style={
                dragOverStageId === 'stg-delete'
                  ? {
                      backgroundColor: 'rgba(185, 28, 28, 0.12)',
                      borderColor: '#DC2626',
                      boxShadow: '0 0 0 2px rgba(220, 38, 38, 0.35)',
                    }
                  : undefined
              }
              className="pl-drop-zone-box lost-zone transition-colors duration-150"
            >
              <div
                className={`pl-zone-icon-circle shadow-2xs ${
                  dragOverStageId === 'stg-delete'
                    ? 'bg-rose-600 text-white'
                    : 'bg-rose-500/10 text-rose-700'
                }`}
              >
                <Trash2 className="w-4 h-4" />
              </div>
              <div>
                <b
                  className={`text-[14px] font-semibold block ${
                    dragOverStageId === 'stg-delete' ? 'text-rose-700' : 'text-[var(--muted)]'
                  }`}
                >
                  Delete
                </b>
                <span className="text-[11px] text-[var(--muted)] block mt-0.5 font-normal">
                  Drop to delete
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* List / Table View: Responsive Sortable Table with Coloured Stage Pills */
        <div className="w-full flex-1 card p-0 overflow-hidden shadow-2xs">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="py-3 px-4">Deal Title</th>
                  <th className="py-3 px-4">Company</th>
                  <th className="py-3 px-4">Value</th>
                  <th className="py-3 px-4">Stage</th>
                  <th className="py-3 px-4">Close Date</th>
                  <th className="py-3 px-4">Owner</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((lead) => {
                  const stage = stages.find((s) => s.id === lead.stageId);
                  const owner = members.find((m) => m.id === lead.ownerId);
                  const stageStyle = stage ? getStageStyle(stage) : null;

                  return (
                    <tr
                      key={lead.id}
                      onClick={() => onSelectLead(lead)}
                      className="cursor-pointer"
                    >
                      <td className="font-semibold text-[var(--text)]">{lead.title}</td>
                      <td className="text-[var(--muted)]">{lead.company}</td>
                      <td className="font-bold text-[var(--text)] tabular-nums">
                        {formatCurrency(lead.value, currency)}
                      </td>
                      <td>
                        {stageStyle ? (
                          <span
                            className="badge shadow-2xs"
                            style={{ backgroundColor: stageStyle.pillBg, color: stageStyle.pillText }}
                          >
                            {stage?.name || lead.stageId}
                          </span>
                        ) : (
                          <span className="badge badge--plain">
                            {stage?.name || lead.stageId}
                          </span>
                        )}
                      </td>
                      <td className="text-[var(--muted)] text-[12px] tabular-nums">
                        {lead.expectedCloseDate || '—'}
                      </td>
                      <td>
                        <div className="cell-person">
                          {owner && (
                            <div
                              className="w-6 h-6 rounded-full text-white grid place-items-center text-[10px] font-bold shrink-0"
                              style={{ backgroundColor: owner.color || '#376E60' }}
                              title={owner.name}
                            >
                              {(owner.name || 'U').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <span className="text-[12px] text-[var(--text)]">{owner?.name || 'Unassigned'}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}



      {/* Mandatory Stage Modal: Call Status (6 options) & Credit Days (4 options) */}
      {pendingStageModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
          onClick={() => setPendingStageModal(null)}
        >
          <div
            className="card max-w-md w-full p-6 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xl space-y-4 animate-in fade-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-base font-bold text-[var(--text-ink)]">
                {pendingStageModal.targetStageId === 'stg-call-status'
                  ? 'Select Call Status'
                  : 'Select Credit / Payment Terms'}
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                {pendingStageModal.targetStageId === 'stg-call-status'
                  ? `Choose the call outcome for ${pendingStageModal.lead.contactName || pendingStageModal.lead.title}:`
                  : `Choose the payment terms for ${pendingStageModal.lead.contactName || pendingStageModal.lead.title}:`}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(pendingStageModal.targetStageId === 'stg-call-status'
                ? CALL_STATUS_OPTIONS
                : CREDIT_TERMS_OPTIONS
              ).map((option) => {
                const isSelected = selectedModalOption === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setSelectedModalOption(option)}
                    className={`p-3 rounded-2xl border text-xs font-semibold text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#17191A] text-white border-[#17191A] shadow-sm'
                        : 'bg-[var(--bg-main)] text-[var(--text-ink)] border-[var(--border-subtle)] hover:border-[#17191A]'
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setPendingStageModal(null)}
                className="btn btn--subtle text-xs px-4 py-2 rounded-full cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedModalOption || isConfirmingStageModal}
                onClick={handleConfirmStageModal}
                className="btn btn--primary text-xs px-5 py-2 rounded-full cursor-pointer disabled:opacity-50"
              >
                {isConfirmingStageModal ? 'Saving...' : 'Confirm & Move'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Undo Toast */}
      {undoToast && (
        <div className="toast fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3">
          <Trophy className="w-4 h-4 text-[var(--butter)]" />
          <span>
            {undoToast.leadTitle} marked Won • {formatCurrency(undoToast.amount, currency)}
          </span>
          <button
            onClick={handleUndoWon}
            className="toast__undo button-press flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Undo</span>
          </button>
        </div>
      )}
      {/* Live Color-Morphing Floating Drag Overlay (GPU-translated via ref, zero 60fps re-renders) */}
      {draggingLeadId && (() => {
        const draggedLead = leads.find((l) => l.id === draggingLeadId);
        if (!draggedLead) return null;
        const sourceStage = stages.find((s) => s.id === draggedLead.stageId);
        const hoveredStage = stages.find((s) => s.id === dragOverStageId);

        let bg = sourceStage ? resolveStageHex(sourceStage) : '#1E3A8A';
        let fg = getContrastTextHex(bg);
        if (dragOverStageId === 'stg-won') {
          bg = '#065F46';
          fg = '#FFFFFF';
        } else if (dragOverStageId === 'stg-loss') {
          bg = '#881337';
          fg = '#FFFFFF';
        } else if (dragOverStageId === 'stg-delete') {
          bg = '#991B1B';
          fg = '#FFFFFF';
        } else if (hoveredStage) {
          bg = resolveStageHex(hoveredStage);
          fg = getContrastTextHex(bg);
        }

        const startX = initialDragPosRef.current?.x ?? 0;
        const startY = initialDragPosRef.current?.y ?? 0;

        return (
          <div
            ref={dragOverlayRef}
            style={{
              left: 0,
              top: 0,
              transform: `translate3d(${startX}px, ${startY}px, 0)`,
              pointerEvents: 'none',
              backgroundColor: bg,
              color: fg,
              width: 264,
            }}
            className="fixed z-[9999] rounded-[20px] p-3.5 shadow-2xl scale-[1.03] rotate-[1.5deg] transition-colors duration-150 border border-white/20"
          >
            <div className="text-[11px] opacity-80 mb-1">
              {dragOverStageId === 'stg-delete'
                ? 'Release to Delete'
                : hoveredStage
                ? `Move to ${hoveredStage.name}`
                : draggedLead.expectedCloseDate
                ? `Closes ${formatDateOnly(draggedLead.expectedCloseDate)}`
                : 'Moving deal'}
            </div>
            <div className="font-bold text-sm leading-snug">
              {draggedLead.company?.trim() || draggedLead.title.replace(/\s+Opportunity$/i, '')}
            </div>
            <div className="text-[11px] font-semibold opacity-90 mt-0.5 truncate">
              {formatLeadCardSubtitle(draggedLead)}
            </div>
            <div className="mt-2.5 font-extrabold text-sm font-tabular">
              {formatCurrency(draggedLead.value, currency)}
            </div>
          </div>
        );
      })()}

      {/* Bulk Excel / CSV Lead Import Modal */}
      <BulkLeadImportModal
        isOpen={isBulkImportOpen}
        workspaceId={workspace?.id || pipeline?.workspaceId || 'ws-default'}
        existingLeads={leads}
        onClose={() => setIsBulkImportOpen(false)}
        onImportComplete={async () => {
          if (onRefreshLeads) {
            await onRefreshLeads();
          }
        }}
      />
    </div>
  );
}
