import {
  PipelineStage,
  TeamMember,
  VisualWorkflowNode,
  VisualWorkflowEdge,
  AutomationSequenceStep,
  AutomationStopConditions,
  AutomationSendingWindow,
  ActionType,
} from '@/types/crm';

export interface PrebuiltTemplateDefinition {
  id: string;
  title: string;
  category: string;
  description: string;
  triggerType: string;
  triggerStageMatcher?: string;
  defaultSequence: AutomationSequenceStep[];
  defaultStopConditions: AutomationStopConditions;
  defaultSendingWindow: AutomationSendingWindow;
  generateGraph: (
    stages: PipelineStage[],
    members: TeamMember[],
    customSequence?: AutomationSequenceStep[]
  ) => {
    triggerStageId?: string;
    nodes: VisualWorkflowNode[];
    edges: VisualWorkflowEdge[];
  };
}

// Helper to find a stage by matching name substrings
export function matchStage(stages: PipelineStage[], query: string): PipelineStage {
  const norm = query.toLowerCase();
  const found = stages.find((s) => s.name.toLowerCase().includes(norm));
  return found || stages[0] || { id: 'stg-new-lead', name: 'New lead', order: 0, color: 'blue' };
}

/**
 * Automatically layout sequence steps into a clean horizontal/branching React Flow graph
 */
export function buildGraphFromSequence(
  triggerLabel: string,
  triggerDescription: string,
  triggerType: string,
  triggerConfig: any,
  sequence: AutomationSequenceStep[],
  options?: { triggerStageId?: string }
): { triggerStageId?: string; nodes: VisualWorkflowNode[]; edges: VisualWorkflowEdge[] } {
  const nodes: VisualWorkflowNode[] = [];
  const edges: VisualWorkflowEdge[] = [];

  // 1. Starting Trigger Node
  const triggerId = 'node-trigger-1';
  nodes.push({
    id: triggerId,
    type: 'trigger',
    position: { x: 80, y: 180 },
    data: {
      label: triggerLabel,
      description: triggerDescription,
      nodeCategory: 'trigger',
      triggerType: triggerType as any,
      triggerConfig,
    },
  });

  let previousNodeId = triggerId;
  let currentX = 360;
  let yOffset = 180;

  // 2. Lay out each sequence step with explicit Delay nodes and Action nodes
  sequence.forEach((step, idx) => {
    // If step specifies a delay, insert an explicit Delay / Wait Node
    if (step.delayAmount > 0) {
      const delayNodeId = `node-delay-${step.id || idx + 1}`;
      let preset = 'custom';
      if (step.delayUnit === 'minutes') {
        if (step.delayAmount === 1) preset = '1m';
        else if (step.delayAmount === 5) preset = '5m';
        else if (step.delayAmount === 15) preset = '15m';
        else if (step.delayAmount === 30) preset = '30m';
      } else if (step.delayUnit === 'hours') {
        if (step.delayAmount === 1) preset = '1h';
        else if (step.delayAmount === 2) preset = '2h';
        else if (step.delayAmount === 6) preset = '6h';
        else if (step.delayAmount === 12) preset = '12h';
        else if (step.delayAmount === 24) preset = '24h';
      } else if (step.delayUnit === 'days') {
        if (step.delayAmount === 1) preset = '24h';
        else if (step.delayAmount === 2) preset = '2d';
        else if (step.delayAmount === 3) preset = '3d';
        else if (step.delayAmount === 7) preset = '7d';
      }

      nodes.push({
        id: delayNodeId,
        type: 'delay',
        position: { x: currentX, y: yOffset },
        data: {
          label: `Wait ${step.delayAmount} ${step.delayUnit}`,
          description: `Pause execution for ${step.delayAmount} ${step.delayUnit}`,
          nodeCategory: 'delay',
          delayConfig: {
            preset: preset as any,
            delayAmount: step.delayAmount,
            delayUnit: step.delayUnit,
            respectSendingWindow: true,
            businessDaysOnly: false,
          },
        },
      });

      edges.push({
        id: `edge-${previousNodeId}-${delayNodeId}`,
        source: previousNodeId,
        target: delayNodeId,
        animated: true,
      });

      previousNodeId = delayNodeId;
      currentX += 280;
    }

    // Action Node
    const actionNodeId = `node-action-${step.id || idx + 1}`;
    nodes.push({
      id: actionNodeId,
      type: 'action',
      position: { x: currentX, y: yOffset },
      data: {
        label: `${step.stepNumber}. ${step.label}`,
        description: step.description || step.actionType,
        nodeCategory: 'action',
        actionType: step.actionType,
        actionConfig: {
          ...step.actionConfig,
          delayAmount: step.delayAmount,
          delayUnit: step.delayUnit,
        },
      },
    });

    edges.push({
      id: `edge-${previousNodeId}-${actionNodeId}`,
      source: previousNodeId,
      target: actionNodeId,
      animated: true,
    });

    previousNodeId = actionNodeId;
    currentX += 300;
  });

  // 3. Append Terminal End Node
  const endNodeId = 'node-end-terminal';
  nodes.push({
    id: endNodeId,
    type: 'end',
    position: { x: currentX, y: yOffset },
    data: {
      label: 'End Workflow',
      description: 'Execution finishes cleanly and logs audit trail',
      nodeCategory: 'end',
    },
  });

  edges.push({
    id: `edge-${previousNodeId}-${endNodeId}`,
    source: previousNodeId,
    target: endNodeId,
    animated: false,
  });

  return {
    triggerStageId: options?.triggerStageId,
    nodes,
    edges,
  };
}

export const PREBUILT_AUTOMATION_TEMPLATES: PrebuiltTemplateDefinition[] = [
  // -------------------------------------------------------------
  // 1. NEW LEAD AUTOMATION
  // -------------------------------------------------------------
  {
    id: 'tpl-new-lead',
    title: 'New Lead Instant Response & Assignment',
    category: 'Inbound & Lead Capture',
    description: 'Instant welcome email, round-robin owner assignment, and scheduled same-day introductory outreach call task.',
    triggerType: 'lead_created',
    defaultStopConditions: { onStageChange: true, onLeadReply: true, onDealWon: true, onDealLost: true },
    defaultSendingWindow: { enabled: true, startHour: 9, endHour: 19, daysOfWeek: [1, 2, 3, 4, 5, 6], timezone: 'Asia/Kolkata' },
    defaultSequence: [
      {
        id: 'step-1',
        stepNumber: 1,
        label: 'Send Welcome Introduction Email',
        description: 'Sends prebuilt introduction email template to inbound lead',
        actionType: 'send_template',
        delayAmount: 0,
        delayUnit: 'minutes',
        actionConfig: {
          templateId: 'tpl-intro-capabilities',
          templateName: 'Introduction & Capabilities',
          recipientType: 'lead',
        },
      },
      {
        id: 'step-2',
        stepNumber: 2,
        label: 'Assign Lead Owner',
        description: 'Assigns lead to designated sales representative',
        actionType: 'assign_owner',
        delayAmount: 0,
        delayUnit: 'minutes',
        actionConfig: {
          ownerId: 'mem-1',
          ownerName: 'Sales Lead',
        },
      },
      {
        id: 'step-3',
        stepNumber: 3,
        label: 'Schedule Fast Qualification Call Task',
        description: 'Creates priority qualification call due today',
        actionType: 'schedule_call',
        delayAmount: 2,
        delayUnit: 'hours',
        actionConfig: {
          taskTitle: 'Introductory Qualification Call',
          taskDueDays: 0,
        },
      },
      {
        id: 'step-4',
        stepNumber: 4,
        label: 'Internal Notification Alert',
        description: 'Alerts sales rep of hot inbound opportunity',
        actionType: 'notify_me',
        delayAmount: 0,
        delayUnit: 'minutes',
        actionConfig: {
          message: 'New prospective lead captured. Review requirements and call today.',
        },
      },
    ],
    generateGraph: (stages, members, customSeq) => {
      const seq = customSeq || PREBUILT_AUTOMATION_TEMPLATES[0].defaultSequence;
      return buildGraphFromSequence(
        'Lead Created',
        'Fires immediately when a lead enters the CRM',
        'lead_created',
        {},
        seq
      );
    },
  },

  // -------------------------------------------------------------
  // 2. LEAD QUALIFICATION AUTOMATION
  // -------------------------------------------------------------
  {
    id: 'tpl-lead-qualification',
    title: 'Lead Qualification Cadence',
    category: 'Inbound & Lead Capture',
    description: 'Nurtures unverified leads with qualification questions, WhatsApp check-in, and review tasks.',
    triggerType: 'deal_stage_changed',
    triggerStageMatcher: 'qualification',
    defaultStopConditions: { onStageChange: true, onLeadReply: true, onMeetingBooked: true, onDealWon: true },
    defaultSendingWindow: { enabled: true, startHour: 10, endHour: 18, daysOfWeek: [1, 2, 3, 4, 5, 6], timezone: 'Asia/Kolkata' },
    defaultSequence: [
      {
        id: 'step-1',
        stepNumber: 1,
        label: 'Send Discovery Questionnaire Email',
        description: 'Dispatches questionnaire template to understand project scope',
        actionType: 'send_template',
        delayAmount: 0,
        delayUnit: 'minutes',
        actionConfig: {
          templateId: 'tpl-scope-discovery',
          templateName: 'Discovery & Scope Questionnaire',
        },
      },
      {
        id: 'step-2',
        stepNumber: 2,
        label: 'WhatsApp Quick Check-in',
        description: 'Sends conversational WhatsApp follow-up',
        actionType: 'send_whatsapp',
        delayAmount: 1,
        delayUnit: 'days',
        actionConfig: {
          whatsappMessage: 'Hi there! Just following up on our email. Do you have 5 minutes this week for a brief alignment call?',
        },
      },
      {
        id: 'step-3',
        stepNumber: 3,
        label: 'Create Qualification Review Task',
        description: 'Tasks sales owner to score project viability',
        actionType: 'create_task',
        delayAmount: 2,
        delayUnit: 'days',
        actionConfig: {
          taskTitle: 'Evaluate Qualification & Determine Budget Viability',
          taskDueDays: 2,
        },
      },
    ],
    generateGraph: (stages, members, customSeq) => {
      const stage = matchStage(stages, 'qualif');
      const seq = customSeq || PREBUILT_AUTOMATION_TEMPLATES[1].defaultSequence;
      return buildGraphFromSequence(
        `Enters ${stage.name}`,
        `Lead moves to ${stage.name} stage`,
        'deal_stage_changed',
        { stageId: stage.id, stageName: stage.name },
        seq,
        { triggerStageId: stage.id }
      );
    },
  },

  // -------------------------------------------------------------
  // 3. QUALIFIED LEAD NURTURING
  // -------------------------------------------------------------
  {
    id: 'tpl-qualified-nurturing',
    title: 'Qualified Lead Multi-Channel Nurturing',
    category: 'Pipeline Nurturing',
    description: 'Comprehensive 7-step multi-touch sequence combining email, WhatsApp, SMS, and tasks across 12 days.',
    triggerType: 'deal_stage_changed',
    triggerStageMatcher: 'qualified',
    defaultStopConditions: { onStageChange: true, onLeadReply: true, onMeetingBooked: true, onDealWon: true, onDealLost: true },
    defaultSendingWindow: { enabled: true, startHour: 10, endHour: 18, daysOfWeek: [1, 2, 3, 4, 5, 6], timezone: 'Asia/Kolkata' },
    defaultSequence: [
      {
        id: 'step-1',
        stepNumber: 1,
        label: 'Immediately: Send Value Proposition Email',
        description: 'Case studies and architecture overview',
        actionType: 'send_template',
        delayAmount: 0,
        delayUnit: 'minutes',
        actionConfig: {
          templateId: 'tpl-value-case-study',
          templateName: 'Value Proposition & Client Success',
        },
      },
      {
        id: 'step-2',
        stepNumber: 2,
        label: 'After 1 Day: WhatsApp Follow-up',
        description: 'Direct conversational touchpoint',
        actionType: 'send_whatsapp',
        delayAmount: 1,
        delayUnit: 'days',
        actionConfig: {
          whatsappMessage: 'Hi! Reaching out from Developster Hub. Wanted to check if you had any questions regarding the solution overview we sent over.',
        },
      },
      {
        id: 'step-3',
        stepNumber: 3,
        label: 'After 2 Days: Create Call Task & Notify',
        description: 'Tasks rep to conduct direct phone call',
        actionType: 'schedule_call',
        delayAmount: 2,
        delayUnit: 'days',
        actionConfig: {
          taskTitle: 'Phone Outreach: Qualified Lead Follow-up',
          taskDueDays: 1,
        },
      },
      {
        id: 'step-4',
        stepNumber: 4,
        label: 'After 4 Days: Send ROI & Tech Breakdown Email',
        description: 'Deeper technical breakdown',
        actionType: 'send_template',
        delayAmount: 4,
        delayUnit: 'days',
        actionConfig: {
          templateId: 'tpl-technical-deep-dive',
          templateName: 'ROI & Technical Architecture',
        },
      },
      {
        id: 'step-5',
        stepNumber: 5,
        label: 'After 7 Days: Send SMS Reminder',
        description: 'Concise SMS touchpoint',
        actionType: 'send_sms',
        delayAmount: 7,
        delayUnit: 'days',
        actionConfig: {
          smsMessage: 'Hi, checking in regarding your Developster CRM inquiry. Let us know if you would like to book a quick demo this week.',
        },
      },
      {
        id: 'step-6',
        stepNumber: 6,
        label: 'After 9 Days: Create Second Outreach Task',
        description: 'Second follow-up phone check-in',
        actionType: 'create_task',
        delayAmount: 9,
        delayUnit: 'days',
        actionConfig: {
          taskTitle: 'Executive Check-in Call',
          taskDueDays: 2,
        },
      },
      {
        id: 'step-7',
        stepNumber: 7,
        label: 'After 12 Days: Final Follow-up Email',
        description: 'Gentle closing loop template',
        actionType: 'send_template',
        delayAmount: 12,
        delayUnit: 'days',
        actionConfig: {
          templateId: 'tpl-gentle-close-loop',
          templateName: 'Final Friendly Check-in',
        },
      },
    ],
    generateGraph: (stages, members, customSeq) => {
      const stage = matchStage(stages, 'qualif');
      const seq = customSeq || PREBUILT_AUTOMATION_TEMPLATES[2].defaultSequence;
      return buildGraphFromSequence(
        `Enters ${stage.name}`,
        `Lead qualifies and enters ${stage.name}`,
        'deal_stage_changed',
        { stageId: stage.id, stageName: stage.name },
        seq,
        { triggerStageId: stage.id }
      );
    },
  },

  // -------------------------------------------------------------
  // 4. PROPOSAL FOLLOW-UP
  // -------------------------------------------------------------
  {
    id: 'tpl-proposal-followup',
    title: 'Commercial Proposal Follow-Up & Review',
    category: 'Closing & Commercials',
    description: 'Tracks sent proposals, queues 48h and 5d review tasks, and sends client check-in emails.',
    triggerType: 'deal_stage_changed',
    triggerStageMatcher: 'proposal',
    defaultStopConditions: { onStageChange: true, onLeadReply: true, onDealWon: true, onDealLost: true },
    defaultSendingWindow: { enabled: true, startHour: 10, endHour: 18, daysOfWeek: [1, 2, 3, 4, 5, 6], timezone: 'Asia/Kolkata' },
    defaultSequence: [
      {
        id: 'step-1',
        stepNumber: 1,
        label: 'Tag Deal: "Proposal Delivered"',
        description: 'Applies tracking tag to deal record',
        actionType: 'add_tag',
        delayAmount: 0,
        delayUnit: 'minutes',
        actionConfig: { tag: 'Proposal Delivered' },
      },
      {
        id: 'step-2',
        stepNumber: 2,
        label: 'After 2 Days: 48-Hour Review Task',
        description: 'Follow up on client evaluation of proposal',
        actionType: 'create_task',
        delayAmount: 2,
        delayUnit: 'days',
        actionConfig: {
          taskTitle: '48-Hour Proposal Feedback Check-in',
          taskDueDays: 1,
        },
      },
      {
        id: 'step-3',
        stepNumber: 3,
        label: 'After 5 Days: Proposal Check-in Email',
        description: 'Inquires about committee review and next steps',
        actionType: 'send_template',
        delayAmount: 5,
        delayUnit: 'days',
        actionConfig: {
          templateId: 'tpl-proposal-checkin',
          templateName: 'Proposal Status & Clarifications',
        },
      },
      {
        id: 'step-4',
        stepNumber: 4,
        label: 'After 8 Days: WhatsApp Check-in',
        description: 'Direct WhatsApp message to decision maker',
        actionType: 'send_whatsapp',
        delayAmount: 8,
        delayUnit: 'days',
        actionConfig: {
          whatsappMessage: 'Hi, hope your week is going well! Have you had a chance to review the commercial proposal? Happy to jump on a 10-minute call to answer any questions.',
        },
      },
    ],
    generateGraph: (stages, members, customSeq) => {
      const stage = matchStage(stages, 'proposal');
      if (customSeq && customSeq.length > 0) {
        return buildGraphFromSequence(
          `Enters ${stage.name}`,
          `Proposal delivered and moves to ${stage.name}`,
          'deal_stage_changed',
          { stageId: stage.id, stageName: stage.name },
          customSeq,
          { triggerStageId: stage.id }
        );
      }
      // Built-in full rich multi-node branching graph
      const nodes: VisualWorkflowNode[] = [
        {
          id: 'node-trigger-1',
          type: 'trigger',
          position: { x: 80, y: 220 },
          data: {
            label: `Deal Enters ${stage.name}`,
            description: `Triggered when deal moves to ${stage.name}`,
            nodeCategory: 'trigger',
            triggerType: 'deal_stage_changed',
            triggerConfig: { stageId: stage.id, stageName: stage.name },
          },
        },
        {
          id: 'node-cond-1',
          type: 'condition',
          position: { x: 360, y: 220 },
          data: {
            label: `In ${stage.name}?`,
            description: `Verify deal is currently in ${stage.name}`,
            nodeCategory: 'condition',
            conditionLogic: 'AND',
            conditions: [{ field: 'stageId', operator: 'equals', value: stage.id }],
          },
        },
        {
          id: 'node-delay-1',
          type: 'delay',
          position: { x: 640, y: 220 },
          data: {
            label: 'Wait 1 hour',
            description: 'Hold initial outreach for 1 hour to allow client review',
            nodeCategory: 'delay',
            delayConfig: {
              preset: '1h',
              delayAmount: 1,
              delayUnit: 'hours',
              respectSendingWindow: true,
              businessDaysOnly: false,
            },
          },
        },
        {
          id: 'node-cond-2',
          type: 'condition',
          position: { x: 920, y: 220 },
          data: {
            label: 'Still In Proposal?',
            description: `Verify deal is still in ${stage.name} and not closed`,
            nodeCategory: 'condition',
            conditionLogic: 'AND',
            conditions: [
              { field: 'stageId', operator: 'equals', value: stage.id },
            ],
          },
        },
        {
          id: 'node-action-1',
          type: 'action',
          position: { x: 1200, y: 220 },
          data: {
            label: 'Send Follow-up Email',
            description: 'Dispatches Proposal Status & Clarifications template',
            nodeCategory: 'action',
            actionType: 'send_template',
            actionConfig: {
              templateId: 'tpl-proposal-checkin',
              templateName: 'Proposal Status & Clarifications',
            },
          },
        },
        {
          id: 'node-delay-2',
          type: 'delay',
          position: { x: 1480, y: 220 },
          data: {
            label: 'Wait 24 hours',
            description: 'Pause 24 hours before second touchpoint',
            nodeCategory: 'delay',
            delayConfig: {
              preset: '24h',
              delayAmount: 24,
              delayUnit: 'hours',
              respectSendingWindow: true,
              businessDaysOnly: true,
            },
          },
        },
        {
          id: 'node-cond-3',
          type: 'condition',
          position: { x: 1760, y: 220 },
          data: {
            label: 'Still In Proposal?',
            description: `Verify deal is still awaiting decision in ${stage.name}`,
            nodeCategory: 'condition',
            conditionLogic: 'AND',
            conditions: [
              { field: 'stageId', operator: 'equals', value: stage.id },
            ],
          },
        },
        {
          id: 'node-action-2',
          type: 'action',
          position: { x: 2040, y: 220 },
          data: {
            label: 'Send Second Follow-up Email',
            description: 'Sends gentle closing loop and offers quick call',
            nodeCategory: 'action',
            actionType: 'send_template',
            actionConfig: {
              templateId: 'tpl-gentle-close-loop',
              templateName: 'Final Friendly Check-in',
            },
          },
        },
        {
          id: 'node-end-1',
          type: 'end',
          position: { x: 2320, y: 220 },
          data: {
            label: 'End Workflow',
            description: 'Proposal follow-up cadence completed cleanly',
            nodeCategory: 'end',
          },
        },
      ];

      const edges: VisualWorkflowEdge[] = [
        { id: 'edge-1', source: 'node-trigger-1', target: 'node-cond-1', animated: true },
        { id: 'edge-2', source: 'node-cond-1', target: 'node-delay-1', sourceHandle: 'yes', label: 'Yes', animated: true },
        { id: 'edge-3', source: 'node-delay-1', target: 'node-cond-2', animated: true },
        { id: 'edge-4', source: 'node-cond-2', target: 'node-action-1', sourceHandle: 'yes', label: 'Yes', animated: true },
        { id: 'edge-5', source: 'node-action-1', target: 'node-delay-2', animated: true },
        { id: 'edge-6', source: 'node-delay-2', target: 'node-cond-3', animated: true },
        { id: 'edge-7', source: 'node-cond-3', target: 'node-action-2', sourceHandle: 'yes', label: 'Yes', animated: true },
        { id: 'edge-8', source: 'node-action-2', target: 'node-end-1', animated: false },
        { id: 'edge-no-1', source: 'node-cond-1', target: 'node-end-1', sourceHandle: 'no', label: 'No' },
        { id: 'edge-no-2', source: 'node-cond-2', target: 'node-end-1', sourceHandle: 'no', label: 'No' },
        { id: 'edge-no-3', source: 'node-cond-3', target: 'node-end-1', sourceHandle: 'no', label: 'No' },
      ];

      return {
        triggerStageId: stage.id,
        nodes,
        edges,
      };
    },
  },

  // -------------------------------------------------------------
  // 5. NEGOTIATION FOLLOW-UP
  // -------------------------------------------------------------
  {
    id: 'tpl-negotiation-followup',
    title: 'Negotiation & Contract Closing Cadence',
    category: 'Closing & Commercials',
    description: 'Manages legal/contract reviews, queues deal-closer tasks, and alerts sales management.',
    triggerType: 'deal_stage_changed',
    triggerStageMatcher: 'negotiat',
    defaultStopConditions: { onStageChange: true, onDealWon: true, onDealLost: true },
    defaultSendingWindow: { enabled: true, startHour: 10, endHour: 18, daysOfWeek: [1, 2, 3, 4, 5, 6], timezone: 'Asia/Kolkata' },
    defaultSequence: [
      {
        id: 'step-1',
        stepNumber: 1,
        label: 'Notify Management of Negotiation Stage',
        description: 'Alerts leadership of late-stage negotiation',
        actionType: 'notify_me',
        delayAmount: 0,
        delayUnit: 'minutes',
        actionConfig: {
          message: 'Deal has entered Negotiation. Prepare agreement terms and review closing timeline.',
        },
      },
      {
        id: 'step-2',
        stepNumber: 2,
        label: 'After 2 Days: Agreement Finalization Task',
        description: 'Review redlines and finalized terms',
        actionType: 'create_task',
        delayAmount: 2,
        delayUnit: 'days',
        actionConfig: {
          taskTitle: 'Contract Review & Redline Verification',
          taskDueDays: 2,
        },
      },
      {
        id: 'step-3',
        stepNumber: 3,
        label: 'After 4 Days: Schedule Closing Call',
        description: 'Direct call to execute contract',
        actionType: 'schedule_call',
        delayAmount: 4,
        delayUnit: 'days',
        actionConfig: {
          taskTitle: 'Contract Signature & Final Execution Call',
          taskDueDays: 1,
        },
      },
    ],
    generateGraph: (stages, members, customSeq) => {
      const stage = matchStage(stages, 'negotiat');
      const seq = customSeq || PREBUILT_AUTOMATION_TEMPLATES[4].defaultSequence;
      return buildGraphFromSequence(
        `Enters ${stage.name}`,
        `Deal enters ${stage.name}`,
        'deal_stage_changed',
        { stageId: stage.id, stageName: stage.name },
        seq,
        { triggerStageId: stage.id }
      );
    },
  },

  // -------------------------------------------------------------
  // 6. NO RESPONSE FOLLOW-UP
  // -------------------------------------------------------------
  {
    id: 'tpl-no-response',
    title: 'Call Not Received & No Response Recovery',
    category: 'Pipeline Nurturing',
    description: 'Triggers when a call is unanswered or lead enters Call Not Received: sends instant SMS/WhatsApp and reschedules callback.',
    triggerType: 'deal_stage_changed',
    triggerStageMatcher: 'call not',
    defaultStopConditions: { onStageChange: true, onLeadReply: true, onMeetingBooked: true },
    defaultSendingWindow: { enabled: true, startHour: 10, endHour: 18, daysOfWeek: [1, 2, 3, 4, 5, 6], timezone: 'Asia/Kolkata' },
    defaultSequence: [
      {
        id: 'step-1',
        stepNumber: 1,
        label: 'Instant WhatsApp: "Sorry I missed you"',
        description: 'Immediate conversational follow-up after missed call',
        actionType: 'send_whatsapp',
        delayAmount: 5,
        delayUnit: 'minutes',
        actionConfig: {
          whatsappMessage: 'Hi! Just tried calling you regarding your inquiry with Developster Hub. When would be a convenient time for a brief 5-minute chat today?',
        },
      },
      {
        id: 'step-2',
        stepNumber: 2,
        label: 'Send "Missed You" Email',
        description: 'Sends email with calendar link to book time directly',
        actionType: 'send_template',
        delayAmount: 1,
        delayUnit: 'hours',
        actionConfig: {
          templateId: 'tpl-missed-call',
          templateName: 'Missed Call Follow-Up & Scheduling Link',
        },
      },
      {
        id: 'step-3',
        stepNumber: 3,
        label: 'After 1 Day: Second Callback Task',
        description: 'Schedules morning retry call',
        actionType: 'schedule_call',
        delayAmount: 1,
        delayUnit: 'days',
        actionConfig: {
          taskTitle: 'Retry Call: Follow-up on unanswered outreach',
          taskDueDays: 1,
        },
      },
    ],
    generateGraph: (stages, members, customSeq) => {
      const stage = matchStage(stages, 'call not');
      const seq = customSeq || PREBUILT_AUTOMATION_TEMPLATES[5].defaultSequence;
      return buildGraphFromSequence(
        `Enters ${stage.name}`,
        `Lead moves to ${stage.name}`,
        'deal_stage_changed',
        { stageId: stage.id, stageName: stage.name },
        seq,
        { triggerStageId: stage.id }
      );
    },
  },

  // -------------------------------------------------------------
  // 7. INACTIVE LEAD REACTIVATION
  // -------------------------------------------------------------
  {
    id: 'tpl-inactive-reactivation',
    title: 'Inactive & Stalled Lead Reactivation',
    category: 'Pipeline Nurturing',
    description: 'Fires when a lead has zero activity for 14+ days. Sends re-engagement email and queues account review.',
    triggerType: 'no_activity_days',
    defaultStopConditions: { onStageChange: true, onLeadReply: true, onMeetingBooked: true },
    defaultSendingWindow: { enabled: true, startHour: 10, endHour: 17, daysOfWeek: [1, 2, 3, 4, 5], timezone: 'Asia/Kolkata' },
    defaultSequence: [
      {
        id: 'step-1',
        stepNumber: 1,
        label: 'Send Re-engagement Email',
        description: 'Gentle check-in inquiring if project timeline has evolved',
        actionType: 'send_template',
        delayAmount: 0,
        delayUnit: 'minutes',
        actionConfig: {
          templateId: 'tpl-stalled-reactivation',
          templateName: 'Gentle Check-in & Timeline Review',
        },
      },
      {
        id: 'step-2',
        stepNumber: 2,
        label: 'After 3 Days: Tag "Reactivation Pending"',
        description: 'Labels deal for marketing campaign targeting',
        actionType: 'add_tag',
        delayAmount: 3,
        delayUnit: 'days',
        actionConfig: { tag: 'Reactivation Pending' },
      },
      {
        id: 'step-3',
        stepNumber: 3,
        label: 'After 7 Days: Create Decision Task',
        description: 'Tasks rep to either archive or re-qualify opportunity',
        actionType: 'create_task',
        delayAmount: 7,
        delayUnit: 'days',
        actionConfig: {
          taskTitle: 'Account Review: Re-engage or Archive Lead',
          taskDueDays: 2,
        },
      },
    ],
    generateGraph: (stages, members, customSeq) => {
      const seq = customSeq || PREBUILT_AUTOMATION_TEMPLATES[6].defaultSequence;
      return buildGraphFromSequence(
        '14+ Days No Activity',
        'Fires when opportunity is untouched for 14 days',
        'no_activity_days',
        { days: 14 },
        seq
      );
    },
  },

  // -------------------------------------------------------------
  // 8. WON DEAL AUTOMATION
  // -------------------------------------------------------------
  {
    id: 'tpl-won-deal',
    title: 'Won Deal Celebration & Handover',
    category: 'Retention & Onboarding',
    description: 'Executes immediately when a deal is closed won: records revenue, applies customer tag, and alerts team.',
    triggerType: 'deal_won',
    defaultStopConditions: {},
    defaultSendingWindow: { enabled: false, startHour: 0, endHour: 24, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timezone: 'Asia/Kolkata' },
    defaultSequence: [
      {
        id: 'step-1',
        stepNumber: 1,
        label: 'Celebrate & Internal Notification',
        description: 'Congratulates sales team on won contract',
        actionType: 'notify_me',
        delayAmount: 0,
        delayUnit: 'minutes',
        actionConfig: {
          message: 'Deal Closed Won! Revenue recorded in active pipeline.',
        },
      },
      {
        id: 'step-2',
        stepNumber: 2,
        label: 'Tag Deal: "Customer - Active"',
        description: 'Marks client record as active account',
        actionType: 'add_tag',
        delayAmount: 0,
        delayUnit: 'minutes',
        actionConfig: { tag: 'Customer - Active' },
      },
      {
        id: 'step-3',
        stepNumber: 3,
        label: 'Create Invoice & Contract Handover Task',
        description: 'Tasks finance to issue invoice and verify payment terms',
        actionType: 'create_task',
        delayAmount: 1,
        delayUnit: 'days',
        actionConfig: {
          taskTitle: 'Finance Check: Generate Tax Invoice & Billing Setup',
          taskDueDays: 1,
        },
      },
    ],
    generateGraph: (stages, members, customSeq) => {
      const seq = customSeq || PREBUILT_AUTOMATION_TEMPLATES[7].defaultSequence;
      return buildGraphFromSequence(
        'Deal Marked Won',
        'Contract finalized and marked Won',
        'deal_won',
        {},
        seq
      );
    },
  },

  // -------------------------------------------------------------
  // 9. LOST DEAL AUTOMATION
  // -------------------------------------------------------------
  {
    id: 'tpl-lost-deal',
    title: 'Lost Deal Exit Survey & 90-Day Recycle',
    category: 'Pipeline Nurturing',
    description: 'Cancels pending sales nurtures, logs loss reason, sends polite thank-you email, and schedules 90-day recycle check.',
    triggerType: 'deal_lost',
    defaultStopConditions: {},
    defaultSendingWindow: { enabled: true, startHour: 10, endHour: 17, daysOfWeek: [1, 2, 3, 4, 5], timezone: 'Asia/Kolkata' },
    defaultSequence: [
      {
        id: 'step-1',
        stepNumber: 1,
        label: 'Send Polite Thank You & Feedback Email',
        description: 'Maintains professional relationship and requests feedback',
        actionType: 'send_template',
        delayAmount: 2,
        delayUnit: 'hours',
        actionConfig: {
          templateId: 'tpl-lost-feedback',
          templateName: 'Thank You & Service Feedback',
        },
      },
      {
        id: 'step-2',
        stepNumber: 2,
        label: 'Tag Deal: "Closed Lost - Future Prospect"',
        description: 'Categorizes lost deal for future reactivation cohorts',
        actionType: 'add_tag',
        delayAmount: 0,
        delayUnit: 'minutes',
        actionConfig: { tag: 'Closed Lost - Future Prospect' },
      },
      {
        id: 'step-3',
        stepNumber: 3,
        label: 'Schedule 90-Day Future Check-in Task',
        description: 'Re-evaluates client budget in the next quarter',
        actionType: 'create_task',
        delayAmount: 90,
        delayUnit: 'days',
        actionConfig: {
          taskTitle: 'Quarterly Check-in: Re-connect with past prospective client',
          taskDueDays: 90,
        },
      },
    ],
    generateGraph: (stages, members, customSeq) => {
      const seq = customSeq || PREBUILT_AUTOMATION_TEMPLATES[8].defaultSequence;
      return buildGraphFromSequence(
        'Deal Marked Lost',
        'Deal moved to Lost outcome',
        'deal_lost',
        {},
        seq
      );
    },
  },

  // -------------------------------------------------------------
  // 10. CUSTOMER ONBOARDING
  // -------------------------------------------------------------
  {
    id: 'tpl-customer-onboarding',
    title: 'New Client Onboarding & Welcome Sequence',
    category: 'Retention & Onboarding',
    description: 'Guides newly signed clients through kickoff scheduling, platform provisioning, and 14-day check-in.',
    triggerType: 'deal_won',
    defaultStopConditions: {},
    defaultSendingWindow: { enabled: true, startHour: 10, endHour: 18, daysOfWeek: [1, 2, 3, 4, 5], timezone: 'Asia/Kolkata' },
    defaultSequence: [
      {
        id: 'step-1',
        stepNumber: 1,
        label: 'Send Official Welcome Kit Email',
        description: 'Dispatches onboarding materials and account access info',
        actionType: 'send_template',
        delayAmount: 0,
        delayUnit: 'minutes',
        actionConfig: {
          templateId: 'tpl-welcome-kit',
          templateName: 'Client Onboarding & Welcome Kit',
        },
      },
      {
        id: 'step-2',
        stepNumber: 2,
        label: 'Create Kickoff Meeting Task',
        description: 'Tasks account manager to coordinate kickoff session',
        actionType: 'schedule_meeting',
        delayAmount: 1,
        delayUnit: 'days',
        actionConfig: {
          meetingTitle: 'Solution Kickoff & Integration Planning Session',
          meetingDurationMinutes: 60,
          enableMeet: true,
        },
      },
      {
        id: 'step-3',
        stepNumber: 3,
        label: 'After 7 Days: Check-in WhatsApp',
        description: 'Ensures client has everything they need',
        actionType: 'send_whatsapp',
        delayAmount: 7,
        delayUnit: 'days',
        actionConfig: {
          whatsappMessage: 'Hi! Checking in from Developster Hub. How is the initial deployment going? Let us know if you need any assistance!',
        },
      },
      {
        id: 'step-4',
        stepNumber: 4,
        label: 'After 14 Days: 2-Week Satisfaction Review',
        description: 'Schedules 14-day health check call',
        actionType: 'create_task',
        delayAmount: 14,
        delayUnit: 'days',
        actionConfig: {
          taskTitle: '14-Day Customer Health Check & Milestone Review',
          taskDueDays: 2,
        },
      },
    ],
    generateGraph: (stages, members, customSeq) => {
      const seq = customSeq || PREBUILT_AUTOMATION_TEMPLATES[9].defaultSequence;
      return buildGraphFromSequence(
        'Client Signed (Won)',
        'Kick off customer success onboarding lifecycle',
        'deal_won',
        {},
        seq
      );
    },
  },

  // -------------------------------------------------------------
  // 11. MEETING REMINDER AUTOMATION
  // -------------------------------------------------------------
  {
    id: 'tpl-meeting-reminders',
    title: 'Automated 24h & 30m Meeting Reminders',
    category: 'Reminders & Tasks',
    description: 'Reduces no-shows with calendar invites, 24-hour reminder email, and 30-minute Google Meet alert with direct join link.',
    triggerType: 'meeting_created',
    defaultStopConditions: {},
    defaultSendingWindow: { enabled: false, startHour: 0, endHour: 24, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timezone: 'Asia/Kolkata' },
    defaultSequence: [
      {
        id: 'step-1',
        stepNumber: 1,
        label: 'Send Calendar Confirmation & Meet Link',
        description: 'Initial booking confirmation with Google Meet URL',
        actionType: 'create_calendar_meeting',
        delayAmount: 0,
        delayUnit: 'minutes',
        actionConfig: {
          meetingTitle: 'Strategy & Solution Demo Call',
          meetingDurationMinutes: 45,
          enableMeet: true,
        },
      },
      {
        id: 'step-2',
        stepNumber: 2,
        label: 'Send 24-Hour Advance Reminder Email',
        description: 'Reminds attendee with agenda and prep points',
        actionType: 'send_template',
        delayAmount: 1,
        delayUnit: 'days',
        actionConfig: {
          templateId: 'tpl-meeting-reminder-24h',
          templateName: 'Meeting Reminder (24 Hours)',
        },
      },
      {
        id: 'step-3',
        stepNumber: 3,
        label: 'Send 30-Minute WhatsApp / SMS Join Alert',
        description: 'Pings lead right before call starts with direct Meet link',
        actionType: 'send_whatsapp',
        delayAmount: 30,
        delayUnit: 'minutes',
        actionConfig: {
          whatsappMessage: 'Your meeting with Developster Hub starts in 30 minutes! Please check your email for the Google Meet link.',
        },
      },
    ],
    generateGraph: (stages, members, customSeq) => {
      const seq = customSeq || PREBUILT_AUTOMATION_TEMPLATES[10].defaultSequence;
      return buildGraphFromSequence(
        'Meeting Scheduled',
        'Fires when meeting is booked on Google Calendar',
        'meeting_created',
        {},
        seq
      );
    },
  },

  // -------------------------------------------------------------
  // 12. TASK & CALL REMINDER AUTOMATION
  // -------------------------------------------------------------
  {
    id: 'tpl-task-call-reminders',
    title: 'Daily Overdue Task & Call-Back Sentinel',
    category: 'Reminders & Tasks',
    description: 'Monitors pending call-backs and overdue tasks, escalating to sales management if unaddressed for 24 hours.',
    triggerType: 'task_overdue',
    defaultStopConditions: {},
    defaultSendingWindow: { enabled: true, startHour: 9, endHour: 18, daysOfWeek: [1, 2, 3, 4, 5, 6], timezone: 'Asia/Kolkata' },
    defaultSequence: [
      {
        id: 'step-1',
        stepNumber: 1,
        label: 'Notify Assigned Rep of Overdue Task',
        description: 'In-app bell alert & email reminder',
        actionType: 'notify_me',
        delayAmount: 0,
        delayUnit: 'minutes',
        actionConfig: {
          message: 'You have a scheduled call or task past its due date. Please complete or reschedule.',
        },
      },
      {
        id: 'step-2',
        stepNumber: 2,
        label: 'After 1 Day: Escalate Priority to High',
        description: 'Updates task priority to High',
        actionType: 'update_field',
        delayAmount: 1,
        delayUnit: 'days',
        actionConfig: {
          fieldName: 'priority',
          fieldValue: 'high',
        },
      },
      {
        id: 'step-3',
        stepNumber: 3,
        label: 'After 2 Days: Reassign to Sales Supervisor',
        description: 'Reassigns stalled task to team manager',
        actionType: 'assign_owner',
        delayAmount: 2,
        delayUnit: 'days',
        actionConfig: {
          ownerId: 'mem-1',
          ownerName: 'Sales Manager',
        },
      },
    ],
    generateGraph: (stages, members, customSeq) => {
      const seq = customSeq || PREBUILT_AUTOMATION_TEMPLATES[11].defaultSequence;
      return buildGraphFromSequence(
        'Task Overdue',
        'Fires when a scheduled CRM task is overdue',
        'task_overdue',
        {},
        seq
      );
    },
  },
];

export const PREBUILT_TEMPLATES = PREBUILT_AUTOMATION_TEMPLATES;

