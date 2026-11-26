import { AutomationRule, PipelineStage, VisualWorkflowNode, VisualWorkflowEdge } from '@/types/crm';

export interface ValidationIssue {
  nodeId?: string;
  type: 'error' | 'warning';
  message: string;
}

/**
 * Validates a visual workflow definition before activation or save.
 * Pure function: runs in both browser client components and server API routes.
 */
export function validateVisualWorkflow(
  workflow: Partial<AutomationRule>,
  availableStages: PipelineStage[]
): {
  isValid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
} {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const nodes = workflow.nodes || [];
  const edges = workflow.edges || [];

  if (nodes.length === 0) {
    errors.push({ type: 'error', message: 'Workflow must have at least one trigger node.' });
    return { isValid: false, errors, warnings };
  }

  // 1. Require exactly one valid starting trigger
  const triggerNodes = nodes.filter(
    (n) => n.data?.nodeCategory === 'trigger' || n.data?.nodeType === 'trigger' || n.type === 'trigger' || n.type === 'triggerNode'
  );
  if (triggerNodes.length === 0) {
    errors.push({ type: 'error', message: 'Workflow requires a trigger node to initiate execution.' });
  } else if (triggerNodes.length > 1) {
    errors.push({
      nodeId: triggerNodes[1].id,
      type: 'error',
      message: 'Workflow can only have one starting trigger node.',
    });
  }

  // 2. Validate valid stage references and node configurations
  const validStageIds = new Set(availableStages.map((s) => s.id));
  for (const node of nodes) {
    const stageId = node.data?.triggerConfig?.stageId || node.data?.actionConfig?.stageId || node.data?.stageId;
    if (stageId && !validStageIds.has(stageId)) {
      errors.push({
        nodeId: node.id,
        type: 'error',
        message: `Stage reference "${stageId}" is an unknown or unavailable stage. Please re-select a stage.`,
      });
    }

    // Required fields check
    const isAction = node.data?.nodeCategory === 'action' || node.data?.nodeType === 'action' || node.type === 'action' || node.type === 'actionNode';
    const actionType = node.data?.actionType;
    const taskTitle = node.data?.actionConfig?.taskTitle || node.data?.taskTitle;
    const actionStageId = node.data?.actionConfig?.stageId || node.data?.actionConfig?.targetStageId || node.data?.stageId;
    const ownerId = node.data?.actionConfig?.ownerId || node.data?.ownerId;

    if (isAction) {
      if (actionType === 'move_stage' && !actionStageId) {
        errors.push({ nodeId: node.id, type: 'error', message: 'Move Stage action requires selecting a target stage.' });
      } else if (actionType === 'assign_owner' && !ownerId) {
        errors.push({ nodeId: node.id, type: 'error', message: 'Assign Owner action requires selecting a team member.' });
      } else if (actionType === 'create_task' && !taskTitle) {
        errors.push({ nodeId: node.id, type: 'error', message: 'Create Task action requires a task title.' });
      }
    }
  }

  // 3. Detect disconnected nodes (except single trigger)
  const connectedNodeIds = new Set<string>();
  edges.forEach((e) => {
    connectedNodeIds.add(e.source);
    connectedNodeIds.add(e.target);
  });

  for (const node of nodes) {
    if (nodes.length > 1 && !connectedNodeIds.has(node.id)) {
      errors.push({
        nodeId: node.id,
        type: 'error',
        message: `Node "${node.data.label || node.id}" is disconnected and unreachable from the starting trigger.`,
      });
    }
  }

  // 4. Detect cycles and loops using Depth-First Search (DFS)
  const adjacencyList = new Map<string, string[]>();
  for (const node of nodes) {
    adjacencyList.set(node.id, []);
  }
  for (const edge of edges) {
    if (adjacencyList.has(edge.source)) {
      adjacencyList.get(edge.source)!.push(edge.target);
    }
  }

  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function hasCycle(nodeId: string): boolean {
    visited.add(nodeId);
    recursionStack.add(nodeId);

    const neighbors = adjacencyList.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (hasCycle(neighbor)) return true;
      } else if (recursionStack.has(neighbor)) {
        return true;
      }
    }

    recursionStack.delete(nodeId);
    return false;
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      if (hasCycle(node.id)) {
        errors.push({
          nodeId: node.id,
          type: 'error',
          message: 'Loop or cycle detected in workflow connections. Workflows must be directed and acyclic.',
        });
        break;
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
