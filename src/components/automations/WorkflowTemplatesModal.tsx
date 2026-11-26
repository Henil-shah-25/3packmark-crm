'use client';

import React, { useState } from 'react';
import {
  X,
  Sparkles,
  ArrowRight,
  Zap,
  Split,
  CheckSquare,
  Clock,
  Search,
  Filter,
} from 'lucide-react';
import {
  PipelineStage,
  TeamMember,
  VisualWorkflowNode,
  VisualWorkflowEdge,
  AutomationSequenceStep,
  AutomationStopConditions,
  AutomationSendingWindow,
} from '@/types/crm';
import { PREBUILT_TEMPLATES, PrebuiltTemplateDefinition } from '@/lib/automations/templates';

interface TemplateSelectPayload {
  name: string;
  description: string;
  triggerType: string;
  triggerStageId?: string;
  sequence?: AutomationSequenceStep[];
  stopConditions?: AutomationStopConditions;
  sendingWindow?: AutomationSendingWindow;
  nodes: VisualWorkflowNode[];
  edges: VisualWorkflowEdge[];
}

export function WorkflowTemplatesModal({
  isOpen,
  stages,
  members,
  onSelectTemplate,
  onClose,
}: {
  isOpen: boolean;
  stages: PipelineStage[];
  members: TeamMember[];
  onSelectTemplate: (template: TemplateSelectPayload) => void;
  onClose: () => void;
}) {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  if (!isOpen) return null;

  const categories = ['All', 'Inbound', 'Qualification', 'Sales Cadence', 'Closing', 'Retention & Winback'];

  const filteredTemplates = PREBUILT_TEMPLATES.filter((tpl: PrebuiltTemplateDefinition) => {
    if (selectedCategory !== 'All' && tpl.category !== selectedCategory) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchTitle = tpl.title.toLowerCase().includes(q);
      const matchDesc = tpl.description.toLowerCase().includes(q);
      const matchTrigger = tpl.triggerType.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchTrigger) return false;
    }
    return true;
  });

  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="modal-content w-full max-w-5xl h-[88vh] rounded-3xl bg-[var(--surface)] border border-[var(--rim)] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-[var(--rim)] flex items-center justify-between bg-[var(--surface)] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-[var(--ink)] text-[var(--butter)] flex items-center justify-center shadow-xs">
              <Sparkles className="w-5 h-5 text-[#F0CF58]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[var(--text)]">Preconfigured Automation Library</h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--well)] text-[var(--muted)]">
                  {PREBUILT_TEMPLATES.length} templates
                </span>
              </div>
              <p className="text-xs text-[var(--muted)]">
                Enterprise sales cadences preconfigured with multi-step delays, stop conditions, and automatic graph generation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-[var(--well)] text-[var(--muted)] hover:text-[var(--text)] flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter bar */}
        <div className="px-5 py-3 border-b border-[var(--rim)] bg-[var(--well)] flex items-center justify-between gap-3 flex-wrap shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto py-1">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  selectedCategory === cat
                    ? 'bg-[var(--text)] text-[var(--surface)] font-semibold shadow-xs'
                    : 'bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)] border border-[var(--rim)]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="relative min-w-[220px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search templates..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-full bg-[var(--surface)] border border-[var(--rim)] focus:outline-none focus:ring-1 focus:ring-[var(--text)]"
            />
          </div>
        </div>

        {/* Templates Grid */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map((tpl: PrebuiltTemplateDefinition) => {
            return (
              <div
                key={tpl.id}
                className="p-5 rounded-2xl bg-[var(--surface)] border border-[var(--rim)] hover:border-[var(--text)] transition-all duration-200 flex flex-col justify-between group shadow-2xs hover:shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--well)] text-[var(--muted)]">
                      {tpl.category}
                    </span>
                    <span className="text-[10px] text-[var(--muted)] font-mono truncate">
                      {tpl.defaultSequence.length} step sequence
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-[var(--text)] group-hover:text-[var(--good)] transition-colors">
                    {tpl.title}
                  </h3>
                  <p className="text-xs text-[var(--muted)] mt-1.5 line-clamp-3 leading-relaxed">
                    {tpl.description}
                  </p>

                  {/* Sequence Preview */}
                  <div className="space-y-1.5 mt-4 pt-3 border-t border-[var(--rim)]">
                    {tpl.defaultSequence.slice(0, 3).map((step: AutomationSequenceStep) => (
                      <div key={step.id} className="flex items-center justify-between text-[11px] text-[var(--text)]">
                        <div className="flex items-center gap-1.5 truncate">
                          <CheckSquare className="w-3 h-3 text-[var(--good)] shrink-0" />
                          <span className="truncate">{step.label}</span>
                        </div>
                        {step.delayAmount > 0 ? (
                          <span className="text-[10px] text-[var(--muted)] font-mono shrink-0 ml-1">
                            +{step.delayAmount} {step.delayUnit}
                          </span>
                        ) : (
                          <span className="text-[9.5px] font-bold text-[var(--good)] shrink-0 ml-1">
                            Instant
                          </span>
                        )}
                      </div>
                    ))}
                    {tpl.defaultSequence.length > 3 && (
                      <div className="text-[10px] text-[var(--muted)] font-medium pt-0.5">
                        +{tpl.defaultSequence.length - 3} more automated steps...
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const data = tpl.generateGraph(stages, members, tpl.defaultSequence);
                    onSelectTemplate({
                      name: tpl.title,
                      description: tpl.description,
                      triggerType: tpl.triggerType,
                      triggerStageId: data.triggerStageId,
                      sequence: tpl.defaultSequence,
                      stopConditions: tpl.defaultStopConditions,
                      sendingWindow: tpl.defaultSendingWindow,
                      nodes: data.nodes,
                      edges: data.edges,
                    });
                  }}
                  className="mt-5 w-full py-2.5 rounded-xl bg-[var(--well)] group-hover:bg-[var(--text)] group-hover:text-[var(--surface)] text-[var(--text)] font-semibold text-xs flex items-center justify-center gap-1.5 transition-all shadow-2xs"
                >
                  <span>Use This Automation</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
