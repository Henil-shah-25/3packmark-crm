'use client';

import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Connection,
  Edge,
  Node,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  Sparkles,
  Play,
  Save,
  Plus,
  Trash2,
  Copy,
  Undo2,
  Redo2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Zap,
  Split,
  CheckSquare,
  History,
  X,
  RefreshCw,
  Clock,
  Flag,
} from 'lucide-react';
import {
  AutomationRule,
  PipelineStage,
  Pipeline,
  Lead,
  TeamMember,
  EmailTemplate,
  VisualWorkflowNode,
  VisualWorkflowEdge,
} from '@/types/crm';
import { TriggerNode } from './nodes/TriggerNode';
import { ConditionNode } from './nodes/ConditionNode';
import { ActionNode } from './nodes/ActionNode';
import { DelayNode } from './nodes/DelayNode';
import { EndNode } from './nodes/EndNode';
import { WorkflowInspector } from './WorkflowInspector';
import { validateVisualWorkflow, ValidationIssue } from '@/lib/automations/validator';

interface VisualWorkflowCanvasProps {
  workflow?: AutomationRule;
  initialWorkflow?: AutomationRule;
  stages: PipelineStage[];
  pipelines?: Pipeline[];
  leads?: Lead[];
  members: TeamMember[];
  templates?: EmailTemplate[];
  onSave?: (rule: Partial<AutomationRule>) => Promise<void>;
  onSaveWorkflow?: (workflow: AutomationRule) => Promise<void>;
  onClose: () => void;
  onOpenHistory?: () => void;
  onTest?: (rule: AutomationRule) => Promise<any>;
}

export function VisualWorkflowCanvas({
  workflow,
  initialWorkflow,
  stages,
  pipelines = [],
  leads = [],
  members,
  templates = [],
  onSave,
  onSaveWorkflow,
  onClose,
  onOpenHistory,
  onTest,
}: VisualWorkflowCanvasProps) {
  const effectiveWorkflow = workflow || initialWorkflow || {
    id: `rule-${Date.now()}`,
    workspaceId: 'ws-default',
    name: 'New Visual Automation',
    triggerType: 'deal_stage_changed',
    isActive: false,
    nodes: [],
    edges: [],
    conditions: [],
    actions: [],
    runCount: 0,
    createdAt: new Date().toISOString(),
  };

  // Workflow meta
  const [name, setName] = useState(effectiveWorkflow.name || 'Untitled Automation');
  const [description, setDescription] = useState(effectiveWorkflow.description || '');
  const [isActive, setIsActive] = useState(effectiveWorkflow.isActive ?? true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // AI Assistant state
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Nodes and edges state
  const defaultInitialNodes: Node[] = [
    {
      id: 'node-trigger-1',
      type: 'trigger',
      position: { x: 80, y: 160 },
      data: {
        label: 'Deal Enters Stage',
        description: 'Triggered when deal enters selected stage',
        nodeCategory: 'trigger',
        triggerType: 'deal_stage_changed',
        triggerConfig: { stageId: stages[0]?.id || 'stg-new-lead' },
      },
    },
    {
      id: 'node-delay-1',
      type: 'delay',
      position: { x: 380, y: 160 },
      data: {
        label: 'Wait 1 hour',
        description: 'Pauses cadence before checking deal status',
        nodeCategory: 'delay',
        delayConfig: {
          delayAmount: 1,
          delayUnit: 'hours',
          preset: '1h',
          respectSendingWindow: true,
          businessDaysOnly: false,
        },
      },
    },
    {
      id: 'node-condition-1',
      type: 'condition',
      position: { x: 680, y: 160 },
      data: {
        label: 'Still in Stage & Not Won/Lost',
        description: 'Verifies deal qualification before sending outreach',
        nodeCategory: 'condition',
        conditionLogic: 'AND',
        conditions: [
          { field: 'stageId', operator: 'equals', value: stages[0]?.id || 'stg-new-lead' },
          { field: 'status', operator: 'not_equals', value: 'Lost' },
        ],
      },
    },
    {
      id: 'node-action-1',
      type: 'action',
      position: { x: 980, y: 110 },
      data: {
        label: 'Send Follow-up Email',
        description: 'Dispatches introductory outreach with {{lead.name}} personalization',
        nodeCategory: 'action',
        actionType: 'send_email',
        actionConfig: {
          subject: 'Following up on your inquiry — {{company.name}}',
          body: 'Hi {{lead.name}},\n\nFollowing up to see if you had any questions regarding our initial discussion.\n\nBest regards,\n{{user.name}}',
        },
      },
    },
    {
      id: 'node-end-1',
      type: 'end',
      position: { x: 1280, y: 160 },
      data: {
        label: 'Complete Workflow',
        description: 'Cadence branch completed successfully',
        nodeCategory: 'end',
      },
    },
  ] as unknown as Node[];

  const defaultInitialEdges: Edge[] = [
    {
      id: 'edge-t1-d1',
      source: 'node-trigger-1',
      target: 'node-delay-1',
      animated: true,
    },
    {
      id: 'edge-d1-c1',
      source: 'node-delay-1',
      target: 'node-condition-1',
      animated: true,
    },
    {
      id: 'edge-c1-a1',
      source: 'node-condition-1',
      target: 'node-action-1',
      sourceHandle: 'yes',
      label: 'Yes',
      style: { stroke: '#376E60', strokeWidth: 2 },
    },
    {
      id: 'edge-a1-e1',
      source: 'node-action-1',
      target: 'node-end-1',
      animated: true,
    },
  ] as unknown as Edge[];

  const initialNodes: Node[] = (effectiveWorkflow.nodes && effectiveWorkflow.nodes.length > 0
    ? effectiveWorkflow.nodes
    : defaultInitialNodes) as unknown as Node[];

  const initialEdges: Edge[] = (effectiveWorkflow.edges && effectiveWorkflow.edges.length > 0
    ? effectiveWorkflow.edges
    : defaultInitialEdges) as unknown as Edge[];

  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);

  // History stack for Undo / Redo
  const [history, setHistory] = useState<{ nodes: Node[]; edges: Edge[] }[]>([
    { nodes: initialNodes, edges: initialEdges },
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Selection & Inspector
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Test Simulation State
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<any | null>(null);

  // Validation State
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const nodeTypes = useMemo(
    () => ({
      trigger: TriggerNode as any,
      condition: ConditionNode as any,
      action: ActionNode as any,
      delay: DelayNode as any,
      wait: DelayNode as any,
      wait_delay: DelayNode as any,
      end: EndNode as any,
      triggerNode: TriggerNode as any,
      conditionNode: ConditionNode as any,
      actionNode: ActionNode as any,
      delayNode: DelayNode as any,
      endNode: EndNode as any,
    }),
    []
  );

  const pushHistory = (newNodes: Node[], newEdges: Edge[]) => {
    const updatedHistory = history.slice(0, historyIndex + 1);
    setHistory([...updatedHistory, { nodes: newNodes, edges: newEdges }]);
    setHistoryIndex(updatedHistory.length);
    setHasUnsavedChanges(true);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1];
      setNodes(prev.nodes);
      setEdges(prev.edges);
      setHistoryIndex(historyIndex - 1);
      setHasUnsavedChanges(true);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1];
      setNodes(next.nodes);
      setEdges(next.edges);
      setHistoryIndex(historyIndex + 1);
      setHasUnsavedChanges(true);
    }
  };

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      setNodes((nds) => {
        const nextNodes = applyNodeChanges(changes, nds);
        setHasUnsavedChanges(true);
        return nextNodes;
      });
    },
    []
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      setEdges((eds) => {
        const nextEdges = applyEdgeChanges(changes, eds);
        setHasUnsavedChanges(true);
        return nextEdges;
      });
    },
    []
  );

  const onConnect: OnConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => {
        const newEdge: Edge = {
          ...params,
          id: `edge-${params.source}-${params.target}-${Date.now()}`,
          animated: false,
          label: params.sourceHandle === 'yes' ? 'Yes' : params.sourceHandle === 'no' ? 'No' : undefined,
          style: {
            stroke: params.sourceHandle === 'yes' ? '#376E60' : params.sourceHandle === 'no' ? '#CC5537' : '#252725',
            strokeWidth: 2,
          },
        };
        const updated = addEdge(newEdge, eds);
        pushHistory(nodes, updated as Edge[]);
        return updated;
      });
    },
    [nodes, history, historyIndex]
  );

  const onNodeClick = (_: any, node: Node) => {
    setSelectedNodeId(node.id);
  };

  const onPaneClick = () => {
    setSelectedNodeId(null);
  };

  const handleAddNode = (category: 'trigger' | 'condition' | 'action' | 'delay' | 'end') => {
    const id = `node-${category}-${Date.now()}`;
    const position = {
      x: 200 + (nodes.length % 4) * 80,
      y: 120 + (nodes.length % 4) * 80,
    };

    let newNode: Node;

    if (category === 'trigger') {
      newNode = {
        id,
        type: 'trigger',
        position,
        data: {
          label: 'Stage Change Trigger',
          description: 'Fires when a deal transitions to a stage',
          nodeCategory: 'trigger',
          triggerType: 'deal_stage_changed',
          triggerConfig: { stageId: stages[0]?.id || 'stg-new-lead' },
        },
      };
    } else if (category === 'condition') {
      newNode = {
        id,
        type: 'condition',
        position,
        data: {
          label: 'Filter Value > $10k',
          description: 'Evaluates deal attributes before branching',
          nodeCategory: 'condition',
          conditionLogic: 'AND',
          conditions: [{ field: 'value', operator: 'greater_than', value: 10000 }],
        },
      };
    } else if (category === 'delay') {
      newNode = {
        id,
        type: 'delay',
        position,
        data: {
          label: 'Wait 1 hour',
          description: 'Pauses cadence before advancing to next step',
          nodeCategory: 'delay',
          delayConfig: {
            delayAmount: 1,
            delayUnit: 'hours',
            preset: '1h',
            respectSendingWindow: true,
            businessDaysOnly: false,
          },
        },
      };
    } else if (category === 'end') {
      newNode = {
        id,
        type: 'end',
        position,
        data: {
          label: 'Complete Workflow',
          description: 'Terminal node marking completion of this branch',
          nodeCategory: 'end',
        },
      };
    } else {
      newNode = {
        id,
        type: 'action',
        position,
        data: {
          label: 'Follow-up Task',
          description: 'Queues action in CRM',
          nodeCategory: 'action',
          actionType: 'create_task',
          actionConfig: {
            taskTitle: 'Follow-up on opportunity',
            taskDueDays: 2,
            ownerId: members[0]?.id || 'mem-1',
          },
        },
      };
    }

    const updatedNodes = [...nodes, newNode];
    setNodes(updatedNodes);
    setSelectedNodeId(id);
    pushHistory(updatedNodes, edges);
  };

  const handleUpdateNodeData = (nodeId: string, updates: Partial<any>) => {
    setNodes((nds) => {
      const next = nds.map((n) => {
        if (n.id === nodeId) {
          return { ...n, data: { ...n.data, ...updates } };
        }
        return n;
      });
      return next;
    });
    setHasUnsavedChanges(true);
  };

  const handleDuplicateNode = (nodeId: string) => {
    const target = nodes.find((n) => n.id === nodeId);
    if (!target) return;

    const newId = `node-${target.data.nodeCategory}-${Date.now()}`;
    const duplicate: Node = {
      ...target,
      id: newId,
      position: { x: target.position.x + 40, y: target.position.y + 40 },
      data: { ...target.data, label: `${target.data.label} (Copy)` },
      selected: false,
    };

    const updatedNodes = [...nodes, duplicate];
    setNodes(updatedNodes);
    setSelectedNodeId(newId);
    pushHistory(updatedNodes, edges);
  };

  const handleDeleteNode = (nodeId: string) => {
    const updatedNodes = nodes.filter((n) => n.id !== nodeId);
    const updatedEdges = edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
    setNodes(updatedNodes);
    setEdges(updatedEdges);
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
    pushHistory(updatedNodes, updatedEdges);
  };

  // Run Test Simulation
  const handleTestSimulation = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const rulePayload: AutomationRule = {
        ...effectiveWorkflow,
        name,
        description,
        isActive,
        nodes: nodes as unknown as VisualWorkflowNode[],
        edges: edges as unknown as VisualWorkflowEdge[],
        conditions: [],
        actions: [],
      };

      const res = await fetch('/api/automations/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: effectiveWorkflow.workspaceId,
          rule: rulePayload,
        }),
      });

      const data = await res.json();
      setTestResult(data);

      if (data.validation) {
        setValidationIssues(data.validation.errors || []);
      }

      // Animate edges on test
      setEdges((eds) => eds.map((e) => ({ ...e, animated: true })));
      setTimeout(() => {
        setEdges((eds) => eds.map((e) => ({ ...e, animated: false })));
      }, 3500);
    } catch (err: any) {
      alert(`Simulation failed: ${err.message}`);
    } finally {
      setIsTesting(false);
    }
  };

  // Save to Google Sheets
  const handleSave = async () => {
    setIsSaving(true);
    setValidationIssues([]);

    try {
      const rulePayload: AutomationRule = {
        ...effectiveWorkflow,
        name,
        description,
        isActive,
        version: (effectiveWorkflow.version || 1) + 1,
        sequence: effectiveWorkflow.sequence,
        stopConditions: effectiveWorkflow.stopConditions,
        sendingWindow: effectiveWorkflow.sendingWindow,
        nodes: nodes as unknown as VisualWorkflowNode[],
        edges: edges as unknown as VisualWorkflowEdge[],
        conditions: [],
        actions: [],
      };

      const validation = validateVisualWorkflow(rulePayload, stages);
      if (isActive && !validation.isValid) {
        setValidationIssues(validation.errors);
        alert(`Validation Error: ${validation.errors[0]?.message}`);
        setIsSaving(false);
        return;
      }

      if (onSave) {
        await onSave(rulePayload);
      }
      if (onSaveWorkflow) {
        await onSaveWorkflow(rulePayload);
      }
      setHasUnsavedChanges(false);
      alert('Workflow saved and synchronized directly with your Google Sheets CRM database.');
    } catch (err: any) {
      alert(`Save failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Generate with Gemini AI
  const handleGenerateAi = async () => {
    if (!aiPrompt.trim()) return;
    setIsGeneratingAi(true);
    setAiError(null);

    try {
      const res = await fetch('/api/ai/workflow-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: effectiveWorkflow.workspaceId,
          prompt: aiPrompt,
        }),
      });

      const data = await res.json();
      if (res.ok && data.workflow) {
        setName(data.workflow.name || name);
        setDescription(data.workflow.description || description);
        setNodes(data.workflow.nodes || []);
        setEdges(data.workflow.edges || []);
        pushHistory(data.workflow.nodes || [], data.workflow.edges || []);
        setAiPrompt('');
      } else {
        setAiError(data.error || 'Failed to generate workflow with Gemini.');
      }
    } catch (err: any) {
      setAiError(err.message || 'AI generation request failed.');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const selectedNode = ((nodes.find((n) => n.id === selectedNodeId) as unknown) as VisualWorkflowNode) || null;

  return (
    <div className="fixed inset-0 z-40 bg-[#F4F1E9] flex flex-col overflow-hidden animate-in fade-in-50">
      {/* Top Navigation & Controls Bar */}
      <div className="h-16 bg-[#FBFAF6] border-b border-[#E4E0D6] px-4 sm:px-6 flex items-center justify-between z-30 shadow-2xs">
        {/* Left: Title, Unsaved Badge, Active Toggle */}
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-[#EDE8DE] text-[#77766F] hover:text-[#252725] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setHasUnsavedChanges(true);
                }}
                className="text-sm font-bold text-[#252725] bg-transparent border-b border-transparent hover:border-[#E4E0D6] focus:border-[#376E60] focus:outline-hidden px-1 py-0.5 rounded"
              />
              {hasUnsavedChanges && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FAF0EC] text-[#CC5537] border border-[#F5DFD7]">
                  • Unsaved Changes
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#77766F] px-1 line-clamp-1">
              {description || '3W PACKMARK Workflow Builder'}
            </p>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Active / Paused Toggle */}
          <div className="flex items-center gap-2 px-3 py-1 bg-white rounded-full border border-[#E4E0D6] text-xs">
            <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-[#376E60]' : 'bg-[#77766F]'}`} />
            <span className="font-semibold text-[#252725] text-[11px]">{isActive ? 'Active' : 'Paused'}</span>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => {
                setIsActive(e.target.checked);
                setHasUnsavedChanges(true);
              }}
              className="rounded text-[#376E60] focus:ring-[#376E60]"
            />
          </div>

          {/* Undo / Redo */}
          <div className="flex items-center gap-0.5 border border-[#E4E0D6] bg-white rounded-full p-0.5">
            <button
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className="p-1.5 text-[#77766F] hover:text-[#252725] disabled:opacity-30 rounded-full hover:bg-[#F4F1E9]"
              title="Undo"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className="p-1.5 text-[#77766F] hover:text-[#252725] disabled:opacity-30 rounded-full hover:bg-[#F4F1E9]"
              title="Redo"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Test Simulation */}
          <button
            type="button"
            onClick={handleTestSimulation}
            disabled={isTesting}
            className="px-3.5 py-1.5 rounded-full border border-[#E4E0D6] bg-white hover:bg-[#F4F1E9] text-xs font-semibold text-[#252725] flex items-center gap-1.5"
          >
            <Play className={`w-3.5 h-3.5 text-[#376E60] ${isTesting ? 'animate-spin' : ''}`} />
            <span>{isTesting ? 'Simulating...' : 'Test Run'}</span>
          </button>

          {/* Audit Logs button */}
          {onOpenHistory && (
            <button
              type="button"
              onClick={onOpenHistory}
              className="p-2 rounded-full border border-[#E4E0D6] bg-white hover:bg-[#F4F1E9] text-[#77766F] hover:text-[#252725]"
              title="View Execution Audit Logs"
            >
              <History className="w-4 h-4" />
            </button>
          )}

          {/* Save to Sheets */}
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-1.5 rounded-full bg-[#252725] hover:bg-[#1E201E] text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs"
          >
            <Save className={`w-3.5 h-3.5 ${isSaving ? 'animate-spin' : ''}`} />
            <span>{isSaving ? 'Saving...' : 'Save Workflow'}</span>
          </button>
        </div>
      </div>

      {/* Main Canvas + Left Node Palette + Right Inspector */}
      <div className="flex-1 flex relative overflow-hidden">
        {/* Left Floating Node Library Palette */}
        <div className="absolute top-4 left-4 z-20 bg-white/95 backdrop-blur-md p-3 rounded-2xl border border-[#E4E0D6] shadow-md space-y-2">
          <span className="text-[10px] font-bold text-[#77766F] px-1 block">
            Add Workflow Node
          </span>
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => handleAddNode('trigger')}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-[#EBF2EE] text-[#376E60] hover:bg-[#DCEAE3] transition-colors"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>+ Trigger Node</span>
            </button>
            <button
              type="button"
              onClick={() => handleAddNode('condition')}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-[#FAF4DF] text-[#8A6A0B] hover:bg-[#F5EDD0] transition-colors"
            >
              <Split className="w-3.5 h-3.5" />
              <span>+ Condition Node</span>
            </button>
            <button
              type="button"
              onClick={() => handleAddNode('delay')}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-[#FFF8E7] text-[#B26B00] hover:bg-[#FEEFC3] transition-colors"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>+ Delay / Wait Node</span>
            </button>
            <button
              type="button"
              onClick={() => handleAddNode('action')}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-[#F4F1E9] text-[#252725] hover:bg-[#EAE5D9] transition-colors"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>+ Action Node</span>
            </button>
            <button
              type="button"
              onClick={() => handleAddNode('end')}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-[#F0EDE6] text-[#55544E] hover:bg-[#E4DFD5] transition-colors"
            >
              <Flag className="w-3.5 h-3.5" />
              <span>+ End Node</span>
            </button>
          </div>
        </div>

        {/* Validation Errors Pill Overlay if any */}
        {validationIssues.length > 0 && (
          <div className="absolute top-4 right-4 z-20 bg-[#FAF0EC] border border-[#F5DFD7] text-[#CC5537] p-3 rounded-2xl shadow-md max-w-sm text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Validation Issues ({validationIssues.length}):</span>
            </div>
            <ul className="list-disc list-inside space-y-0.5 text-[11px] text-[#A83D24]">
              {validationIssues.map((v, i) => (
                <li key={i}>{v.message}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Test Result Drawer / Floating Banner */}
        {testResult && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 bg-white border border-[#E4E0D6] rounded-2xl p-4 shadow-xl max-w-xl w-full flex items-center justify-between text-xs animate-in slide-in-from-bottom">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#EBF2EE] text-[#376E60] flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-[#252725]">Simulation Passed (Test Lead: {testResult.testLead?.title})</span>
                <p className="text-[11px] text-[#77766F] mt-0.5">
                  {testResult.simulationRun?.actionsExecuted?.length || 0} automated actions verified safely without modifying production data.
                </p>
              </div>
            </div>
            <button
              onClick={() => setTestResult(null)}
              className="p-1 rounded-md text-[#77766F] hover:text-[#252725]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* React Flow Visual Canvas */}
        <div className="flex-1 h-full w-full">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            fitView
            defaultViewport={{ x: 0, y: 0, zoom: 0.95 }}
            minZoom={0.2}
            maxZoom={2.0}
            className="bg-[#F8F6F0]"
          >
            <Background color="#DCD7CB" gap={20} size={1} variant={BackgroundVariant.Dots} />
            <Controls className="!bg-white !border !border-[#E4E0D6] !rounded-xl !shadow-sm overflow-hidden" />
            <MiniMap
              nodeColor={(n) => {
                const cat = (n as any)?.data?.nodeCategory || (n as any)?.type;
                if (cat === 'trigger') return '#376E60';
                if (cat === 'condition') return '#F0CF58';
                if (cat === 'delay' || cat === 'wait_delay') return '#E5B826';
                if (cat === 'end') return '#77766F';
                return '#252725';
              }}
              className="!bg-white !border !border-[#E4E0D6] !rounded-2xl !shadow-sm"
              zoomable
              pannable
            />
          </ReactFlow>
        </div>

        {/* Right Configuration Inspector */}
        {selectedNode && (
          <WorkflowInspector
            node={selectedNode}
            stages={stages}
            pipelines={pipelines}
            members={members}
            templates={templates}
            onUpdateNode={handleUpdateNodeData}
            onDuplicateNode={handleDuplicateNode}
            onDeleteNode={handleDeleteNode}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>
    </div>
  );
}
