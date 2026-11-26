import { AutomationRule, Lead, VisualWorkflowNode, VisualWorkflowEdge } from '@/types/crm';

export interface B2bEmailAutomationPreset {
  id: string;
  name: string;
  description: string;
  targetStageId: string;
  targetStageName: string;
  waitLabel: string;
  delayDays: number;
  conditionSummary: string;
  actionSummary: string;
  taskTitle: string;
  taskDueDays: number;
  defaultMode: 'auto_send' | 'manual_confirm';
  defaultSubject: string;
  defaultBody: string;
  defaultConditions: {
    field: string;
    operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'is_not_empty' | 'is_empty';
    value: string | number | boolean;
    logic?: 'AND' | 'OR';
  }[];
}

export const B2B_CHEMICAL_AUTOMATIONS: B2bEmailAutomationPreset[] = [
  {
    id: 'auto-3pm-quotation-followup',
    name: 'Quotation Follow-Up Reminder',
    description: 'Sends a polite quotation follow-up and schedules a rep call when entering Quotation Follow Up.',
    targetStageId: 'stg-quotation-follow-up',
    targetStageName: 'Quotation Follow Up',
    waitLabel: 'Immediate',
    delayDays: 0,
    conditionSummary: 'Lead is still in Quotation Follow Up & not Won/Lost',
    actionSummary: 'Send follow-up email + create Quotation Follow Up task',
    taskTitle: 'Quotation Follow Up',
    taskDueDays: 2,
    defaultMode: 'auto_send',
    defaultSubject: 'Following up on our Commercial Offer — 3W PACKMARK PRIVATE LIMITED',
    defaultBody:
      'Dear {{contactName}},\n\nWe wanted to follow up on the Commercial Offer shared for {{company}} (Total Value: ₹{{dealValue}}). Please let us know if you need any technical datasheet (COA/MSDS) or revised MOQ quantities.\n\nWarm regards,\n3W PACKMARK PRIVATE LIMITED',
    defaultConditions: [
      { field: 'stageId', operator: 'equals', value: 'stg-quotation-follow-up', logic: 'AND' },
      { field: 'deal_status', operator: 'equals', value: 'open', logic: 'AND' },
    ],
  },
  {
    id: 'auto-3pm-dispatch-notify',
    name: 'Order Dispatch Notification',
    description: 'Notifies the customer upon dispatch and creates a delivery confirmation task for the sales rep.',
    targetStageId: 'stg-dispatch',
    targetStageName: 'Dispatch',
    waitLabel: 'Immediate',
    delayDays: 0,
    conditionSummary: 'Lead has valid customer email & active products',
    actionSummary: 'Send dispatch confirmation email + create Delivery Follow Up task',
    taskTitle: 'Delivery Follow Up',
    taskDueDays: 1,
    defaultMode: 'auto_send',
    defaultSubject: 'Order Dispatched — {{company}} | 3W PACKMARK PRIVATE LIMITED',
    defaultBody:
      'Dear {{contactName}},\n\nYour chemical order for {{company}} has been dispatched from our facility. Our logistics team will share LR/tracking details shortly.\n\nWarm regards,\n3W PACKMARK PRIVATE LIMITED',
    defaultConditions: [
      { field: 'has_email', operator: 'equals', value: true, logic: 'AND' },
    ],
  },
  {
    id: 'auto-3pm-credit-reminder',
    name: 'Credit Payment Reminder',
    description: 'Reminds credit-terms accounts on Credit Follow Up and assigns a payment collection follow-up task.',
    targetStageId: 'stg-credit-follow-up',
    targetStageName: 'Credit Follow Up',
    waitLabel: 'Immediate',
    delayDays: 0,
    conditionSummary: 'Payment status is unpaid & credit terms ≠ Advance',
    actionSummary: 'Send polite payment reminder email + create Payment Follow Up task',
    taskTitle: 'Payment Follow Up',
    taskDueDays: 1,
    defaultMode: 'auto_send',
    defaultSubject: 'Payment Reminder ({{creditTerms}}) — {{company}} | 3W PACKMARK PRIVATE LIMITED',
    defaultBody:
      'Dear {{contactName}},\n\nThis is a gentle reminder regarding the upcoming payment for {{company}} (Amount: ₹{{dealValue}}) under your agreed {{creditTerms}} terms.\n\nKindly share remittance details once processed.\n\nWarm regards,\n3W PACKMARK PRIVATE LIMITED',
    defaultConditions: [
      { field: 'creditTerms', operator: 'not_equals', value: 'Advance', logic: 'AND' },
      { field: 'deal_status', operator: 'equals', value: 'open', logic: 'AND' },
    ],
  },
  {
    id: 'auto-3pm-inquiry-welcome',
    name: 'Inquiry Welcome & Product Spec Intro',
    description: 'Welcomes inbound inquiries with company credentials and product catalog overview immediately.',
    targetStageId: 'stg-inquiry',
    targetStageName: 'Inquiry',
    waitLabel: 'Immediate',
    delayDays: 0,
    conditionSummary: 'Lead source is not Cold Call (Gatekeeper)',
    actionSummary: 'Send company intro & catalog overview email',
    taskTitle: 'Inquiry Qualification Call',
    taskDueDays: 1,
    defaultMode: 'auto_send',
    defaultSubject: 'Thank you for your Inquiry — 3W PACKMARK PRIVATE LIMITED',
    defaultBody:
      'Dear {{contactName}},\n\nThank you for reaching out to 3W PACKMARK PRIVATE LIMITED regarding chemical supply for {{company}}. Our sales specialist is reviewing your MOQ requirements and will share a formal Commercial Offer shortly.\n\nWarm regards,\n3W PACKMARK PRIVATE LIMITED',
    defaultConditions: [
      { field: 'source', operator: 'not_equals', value: 'Cold Call (Gatekeeper)', logic: 'AND' },
    ],
  },
];

export function renderB2bAutomationEmail(templateText: string, lead: Lead): string {
  return (templateText || '')
    .replace(/\{\{contactName\}\}/g, lead.contactName || 'Customer')
    .replace(/\{\{company\}\}/g, lead.company || 'your organization')
    .replace(/\{\{creditTerms\}\}/g, lead.creditTerms || 'Standard Credit Terms')
    .replace(/\{\{dealValue\}\}/g, Number(lead.value || 0).toLocaleString('en-IN'));
}

export function buildPresetNodesAndEdges(preset: B2bEmailAutomationPreset): {
  nodes: VisualWorkflowNode[];
  edges: VisualWorkflowEdge[];
} {
  const triggerId = `${preset.id}-trigger`;
  const delayId = `${preset.id}-delay`;
  const condId = `${preset.id}-cond`;
  const actionId = `${preset.id}-action`;
  const endId = `${preset.id}-end`;

  const delayAmount =
    preset.delayDays > 0
      ? preset.delayDays
      : preset.waitLabel === '1 Hour'
      ? 1
      : 0;
  const delayUnit: 'minutes' | 'hours' | 'days' =
    preset.delayDays > 0 ? 'days' : preset.waitLabel === '1 Hour' ? 'hours' : 'minutes';

  const nodes: VisualWorkflowNode[] = [
    {
      id: triggerId,
      type: 'trigger',
      position: { x: 260, y: 40 },
      data: {
        label: `Stage: ${preset.targetStageName}`,
        description: `Fires when deal enters ${preset.targetStageName}`,
        nodeCategory: 'trigger',
        triggerType: 'deal_stage_changed',
        triggerConfig: {
          stageId: preset.targetStageId,
        },
      },
    },
    {
      id: delayId,
      type: 'delay',
      position: { x: 260, y: 250 },
      data: {
        label: `Wait: ${preset.waitLabel}`,
        description:
          delayAmount === 0
            ? 'Executes immediately without waiting'
            : `Waits ${preset.waitLabel} before evaluating conditions`,
        nodeCategory: 'delay',
        delayConfig: {
          delayAmount,
          delayUnit,
          preset: preset.delayDays === 2 ? '2d' : preset.waitLabel === '1 Hour' ? '1h' : '1m',
        },
      },
    },
    {
      id: condId,
      type: 'condition',
      position: { x: 260, y: 460 },
      data: {
        label: preset.conditionSummary,
        description: preset.conditionSummary,
        nodeCategory: 'condition',
        conditionLogic: 'AND',
        conditions: preset.defaultConditions,
      },
    },
    {
      id: actionId,
      type: 'action',
      position: { x: 260, y: 670 },
      data: {
        label: preset.actionSummary,
        description: `Subject: ${preset.defaultSubject}`,
        nodeCategory: 'action',
        actionType: 'send_email',
        actionConfig: {
          emailSubject: preset.defaultSubject,
          emailBody: preset.defaultBody,
          taskTitle: preset.taskTitle,
          taskDueDays: preset.taskDueDays,
        },
      },
    },
    {
      id: endId,
      type: 'end',
      position: { x: 260, y: 880 },
      data: {
        label: 'Complete Workflow',
        description: 'Logs execution to Deal Activity timeline',
        nodeCategory: 'end',
      },
    },
  ];

  const edges: VisualWorkflowEdge[] = [
    { id: `${preset.id}-e1`, source: triggerId, target: delayId },
    { id: `${preset.id}-e2`, source: delayId, target: condId },
    { id: `${preset.id}-e3`, source: condId, sourceHandle: 'yes', target: actionId, label: 'Yes' },
    { id: `${preset.id}-e4`, source: actionId, target: endId },
  ];

  return { nodes, edges };
}

export function buildDefaultB2bAutomationRules(workspaceId = 'ws-default'): AutomationRule[] {
  return B2B_CHEMICAL_AUTOMATIONS.map((preset) => {
    const { nodes, edges } = buildPresetNodesAndEdges(preset);
    return {
      id: preset.id,
      workspaceId,
      name: preset.name,
      description: preset.description,
      triggerType: 'deal_stage_changed',
      triggerStageId: preset.targetStageId,
      conditions: preset.defaultConditions,
      actions: [
        {
          type: 'send_email',
          config: {
            subject: preset.defaultSubject,
            body: preset.defaultBody,
            emailMode: preset.defaultMode,
            delayDays: preset.delayDays,
            taskTitle: preset.taskTitle,
            taskDueDays: preset.taskDueDays,
          } as any,
        },
      ],
      nodes,
      edges,
      isActive: true,
      executionMode: preset.defaultMode,
      delayMinutes: 0,
      runCount: 0,
      createdAt: '2026-01-22T00:00:00.000Z',
    };
  });
}
