export type WorkspaceRole = 'Owner' | 'Admin' | 'Manager' | 'Member' | 'Read-only';

export type CrmRole = 'Master Admin' | 'Pipeline Manager' | 'Employee' | 'Viewer';

export interface UserPermissions {
  canManagePipelines: boolean; // Create/edit/delete/archive pipelines, stages
  canViewMasterPipeline: boolean; // Access organization-wide master pipeline
  canAssignLeads: boolean; // Reassign leads across employees/pipelines
  canCreatePrivateLeads: boolean; // Create private leads isolated from peers
  canViewAllLeads: boolean; // View all leads in accessible pipelines
  canExportData: boolean; // Export CSV, reports
  canManageAutomations: boolean; // Create, edit, toggle automations
  canManageTeam: boolean; // Add/edit team members & roles
  canEditWorkspaceSettings: boolean; // Currency, branding, timezone
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  industry: string;
  currency: string;
  timezone: string;
  logoUrl?: string;
  monthlyTarget: number;
  companyName?: string;
  senderName?: string;
  senderEmail?: string;
  phone?: string;
  website?: string;
  portfolioUrl?: string;
  emailSignature?: string;
  defaultCountryCode?: string;
  tallyUrl?: string;
  tallyCompanyName?: string;
  tallySalesLedger?: string;
  tallyMode?: 'live' | 'download';
  sellerAddress?: string;
  sellerGstin?: string;
  sellerState?: string;
  sellerCin?: string;
  sellerPan?: string;
  sellerContact?: string;
  bankName?: string;
  bankAccountNo?: string;
  bankBranchIfsc?: string;
  signatureName?: string;
  signatureImageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  id: string;
  workspaceId: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  avatar: string;
  color?: string;
  department?: string;
  phone?: string;
  password?: string;
  permissions?: Partial<UserPermissions>;
  assignedPipelineIds?: string[];
  isMasterAdmin?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type StageColor = 'mustard' | 'green' | 'terracotta' | 'charcoal' | string;

export interface PipelineStage {
  id: string;
  workspaceId: string;
  pipelineId: string;
  name: string;
  order: number;
  color: StageColor;
  probability: number; // 0-100%
  isWon?: boolean;
  isLost?: boolean;
  description?: string;
}

export interface Pipeline {
  id: string;
  workspaceId: string;
  name: string;
  isDefault: boolean;
  order: number;
  stages: PipelineStage[];
  createdAt: string;
  isMaster?: boolean;
  visibility?: 'master' | 'shared' | 'private';
  status?: 'active' | 'archived';
  allowedUserIds?: string[];
  description?: string;
  updatedAt?: string;
}

export type LeadStatus = 'New' | 'Contacted' | 'Qualified' | 'Proposal' | 'Negotiation' | 'Won' | 'Lost';
export type Priority = 'low' | 'medium' | 'high';

export interface LeadNote {
  id: string;
  leadId: string;
  content: string;
  pinned?: boolean;
  createdAt: string;
  updatedAt?: string;
  authorName?: string;
}

export interface Lead {
  id: string;
  workspaceId: string;
  title: string;
  contactName: string;
  email: string;
  phone?: string;
  alternatePhone?: string;
  whatsappNumber?: string;
  whatsappSameAsPhone?: boolean;
  designation?: string;
  countryCode?: string;

  company: string;
  industry?: string;
  companySize?: string;
  website?: string;
  city?: string;
  state?: string;
  country?: string;
  address?: string;
  gstTaxId?: string;
  leadSource?: string;
  isDecisionMakerReached?: boolean;
  callSubStatus?: string;
  quotationSubStatus?: string;
  creditTerms?: string;
  products?: DealProductItem[];
  lineItems?: DealProductItem[];
  lastAutomatedEmailStage?: string;
  lastAutomatedEmailAt?: string;
  servicesInterested?: string[] | string;
  estimatedBudget?: number;
  notes?: string;
  leadNotes?: LeadNote[];

  value: number;
  pipelineId: string;
  stageId: string;
  ownerId: string;
  priority: Priority;
  status: LeadStatus;
  source: string;
  expectedCloseDate: string;
  closingProbability: number; // calculated from stage or custom
  lossReason?: string;
  wonAt?: string;
  lostAt?: string;
  tags: string[];
  notesCount?: number;
  customFields?: Record<string, string | number | boolean>;
  visibility?: 'master' | 'shared' | 'private';
  createdBy?: string;
  assignedAt?: string;
  currency?: string;
  leadScore?: number;
  lead_score?: number;
  leadTemperature?: 'HOT' | 'WARM' | 'COLD';
  lead_temperature?: 'HOT' | 'WARM' | 'COLD';
  scoreReasons?: string[];
  score_reasons?: string[] | string;
  createdAt: string;
  updatedAt: string;
}

export type LeadTemperature = 'HOT' | 'WARM' | 'COLD';

export interface ScoreBreakdown {
  email: number;
  website: number;
  messaging: number;
  calls: number;
  decay: number;
  rawScore: number;
  finalScore: number;
}

export interface LeadScoreResult {
  score: number;
  temperature: LeadTemperature;
  reasons: string[];
  breakdown: ScoreBreakdown;
  calculatedAt: string;
}

export interface Customer {
  id: string;
  workspaceId: string;
  name: string;
  company: string;
  email: string;
  phone?: string;
  status: 'Active' | 'Churned' | 'Lead';
  totalRevenue: number;
  dealsCount: number;
  lastContactedAt: string;
  tags?: string[];
  createdAt: string;
}

export type ProductUnit = 'Liters' | 'Kg' | 'Pack' | 'Dozen';

export interface Product {
  id: string;
  workspaceId: string;
  sku: string;
  name: string;
  category: string;
  unit: ProductUnit;
  moq: number;
  unitPrice: number;
  hsnCode?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DealProductItem {
  productId: string;
  sku: string;
  name: string;
  unit: ProductUnit;
  moq: number;
  extraQuantity: number;
  totalQuantity: number;
  unitPrice: number;
  lineTotal: number;
  hsnCode?: string;
}

export type TaskQueueCategory =
  | 'Quotation Follow Up'
  | 'Delivery Follow Up'
  | 'Payment Follow Up'
  | 'Call Follow Up';

export type TaskType = 'call_back' | 'meeting' | 'new_lead_call' | 'follow_up' | 'custom' | 'call';
export type TaskStatus = 'open' | 'done' | 'snoozed';
export type TaskSource = 'manual' | 'auto';

export interface Task {
  id: string;
  workspaceId: string;
  leadId?: string;
  dealTitle?: string;
  title: string;
  description?: string;
  priority: Priority;
  dueDate: string;
  completed: boolean;
  completedAt?: string;
  ownerId: string;
  createdAt: string;
  // Phase 3 additive fields
  type?: TaskType;
  queueCategory?: TaskQueueCategory;
  dueAt?: string; // UTC ISO string
  status?: TaskStatus;
  source?: TaskSource;
  notes?: string;
  snoozedUntil?: string; // UTC ISO string
  autoStageTrigger?: string;
}

export type ActivityType = 
  | 'note'
  | 'call'
  | 'email'
  | 'whatsapp'
  | 'sms'
  | 'stage_change'
  | 'status_change'
  | 'task'
  | 'deal_won'
  | 'deal_lost'
  | 'meeting'
  | 'ai_action'
  | 'website_visit'
  | 'product_view'
  | 'cart_activity'
  | 'checkout'
  | 'purchase'
  | 'form_submission';

export interface Activity {
  id: string;
  workspaceId: string;
  leadId: string;
  type: ActivityType;
  title: string;
  description: string;
  authorName: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

export type TriggerType =
  | 'lead_created'
  | 'deal_created'
  | 'deal_stage_changed'
  | 'stage_unchanged_days'
  | 'meeting_booked'
  | 'meeting_30m_away'
  | 'no_activity_days'
  | 'deal_stage_left'
  | 'deal_won'
  | 'deal_lost'
  | 'lead_field_changed'
  | 'followup_due'
  | 'task_overdue'
  | 'meeting_created'
  | 'meeting_rescheduled'
  | 'meeting_cancelled'
  | 'sheet_imported'
  | 'pulse_page_visited'
  | 'pulse_product_viewed'
  | 'pulse_item_added_to_cart'
  | 'pulse_cart_updated'
  | 'pulse_checkout_started'
  | 'pulse_checkout_abandoned'
  | 'pulse_purchase_completed'
  | 'pulse_form_submitted'
  | 'pulse_email_clicked'
  | 'pulse_return_visit'
  | 'pulse_segment_entered'
  | 'pulse_segment_exited';

export type ActionType =
  // Communication Actions
  | 'send_email'
  | 'send_template'
  | 'send_whatsapp'
  | 'send_sms'
  | 'notify'
  | 'notify_me'
  // Sales Management Actions
  | 'create_task'
  | 'schedule_call'
  | 'schedule_meeting'
  | 'assign_owner'
  | 'add_note'
  | 'update_field'
  | 'move_stage'
  | 'move_pipeline'
  | 'mark_won'
  | 'mark_lost'
  | 'add_tag'
  | 'remove_tag'
  | 'log_activity'
  // Scheduling & Timing
  | 'wait_delay'
  | 'create_calendar_meeting'
  | 'schedule_reminder'
  | 'execute_workflow_node'
  | 'end_workflow';

export interface AutomationCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'is_empty' | 'is_not_empty';
  value: string | number | boolean;
  logic?: 'AND' | 'OR';
}

export interface AutomationAction {
  type: ActionType;
  config: {
    pipelineId?: string;
    stageId?: string;
    stageName?: string;
    targetStageId?: string;
    targetStageName?: string;
    targetPipelineId?: string;
    ownerId?: string;
    ownerName?: string;
    fieldName?: string;
    fieldValue?: string | number;
    taskTitle?: string;
    taskType?: TaskType;
    taskDueDays?: number;
    templateId?: string;
    templateName?: string;
    emailTemplateId?: string;
    emailSubject?: string;
    emailBody?: string;
    whatsappMessage?: string;
    whatsappTemplateName?: string;
    smsMessage?: string;
    tag?: string;
    message?: string;
    noteText?: string;
    meetingTitle?: string;
    meetingDurationMinutes?: number;
    enableMeet?: boolean;
    delayAmount?: number;
    delayUnit?: 'minutes' | 'hours' | 'days' | 'weeks';
    delayMinutes?: number;
    recipientType?: 'lead' | 'owner' | 'admin' | 'team';
    recipientEmails?: string[];
  };
}

export interface AutomationSequenceStep {
  id: string;
  stepNumber: number;
  label: string;
  description?: string;
  actionType: ActionType;
  delayAmount: number;
  delayUnit: 'minutes' | 'hours' | 'days' | 'weeks';
  conditions?: AutomationCondition[];
  actionConfig: AutomationAction['config'];
}

export interface AutomationStopConditions {
  onStageChange?: boolean;
  onLeadReply?: boolean;
  onMeetingBooked?: boolean;
  onDealWon?: boolean;
  onDealLost?: boolean;
  onUnsubscribe?: boolean;
}

export interface AutomationSendingWindow {
  enabled: boolean;
  startHour: number; // e.g. 10 (10 AM)
  endHour: number;   // e.g. 18 (6 PM)
  daysOfWeek: number[]; // [1, 2, 3, 4, 5, 6] = Mon-Sat
  timezone: string; // 'Asia/Kolkata' default
}

export interface ScheduledJob {
  id: string;
  workspaceId: string;
  ruleId: string;
  ruleName: string;
  leadId: string;
  dealTitle: string;
  stepId?: string;
  stepNumber?: number;
  actionType: ActionType;
  actionConfig: any;
  scheduledFor: string; // ISO 8601 string
  status: 'pending' | 'executing' | 'completed' | 'cancelled' | 'failed';
  cancellationReason?: string;
  retryCount: number;
  maxRetries: number;
  idempotencyKey: string;
  createdAt: string;
  executedAt?: string;
  result?: string;
  error?: string;
  nodeId?: string;
  remainingNodeIds?: string[];
}

export interface WorkflowDelayConfig {
  delayAmount?: number;
  delayUnit?: 'minutes' | 'hours' | 'days' | 'weeks';
  preset?: '1m' | '5m' | '15m' | '30m' | '1h' | '2h' | '6h' | '12h' | '24h' | '2d' | '3d' | '7d' | 'custom' | 'specific_date';
  specificDate?: string;
  respectSendingWindow?: boolean;
  businessDaysOnly?: boolean;
}

export interface WorkflowNodeData {
  label: string;
  description?: string;
  nodeCategory: 'trigger' | 'condition' | 'action' | 'delay' | 'end';
  nodeType?: string;
  stageId?: string;
  taskTitle?: string;
  ownerId?: string;
  triggerType?: TriggerType;
  triggerConfig?: {
    pipelineId?: string;
    stageId?: string;
    stageName?: string;
    days?: number;
    fieldName?: string;
  };
  conditionLogic?: 'AND' | 'OR';
  conditions?: AutomationCondition[];
  actionType?: ActionType;
  actionConfig?: AutomationAction['config'];
  delayConfig?: WorkflowDelayConfig;
  status?: 'idle' | 'running' | 'success' | 'failed' | 'skipped';
  error?: string;
}

export interface VisualWorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: WorkflowNodeData;
}

export interface VisualWorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: 'yes' | 'no' | 'out' | null;
  targetHandle?: string | null;
  label?: string;
  animated?: boolean;
}

export interface AutomationRule {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  triggerType: TriggerType | string;
  triggerStageId?: string;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  sequence?: AutomationSequenceStep[];
  stopConditions?: AutomationStopConditions;
  sendingWindow?: AutomationSendingWindow;
  nodes?: VisualWorkflowNode[];
  edges?: VisualWorkflowEdge[];
  isActive: boolean;
  executionMode?: 'auto_send' | 'draft_only' | 'manual_confirm';
  delayMinutes?: number;
  version?: number;
  runCount: number;
  lastRunAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AutomationRunStep {
  nodeId: string;
  nodeLabel: string;
  type: 'trigger' | 'condition' | 'action' | 'delay' | 'end';
  status: 'success' | 'failed' | 'skipped';
  detail: string;
  executedAt: string;
}

export interface AutomationRun {
  id: string;
  workspaceId: string;
  ruleId: string;
  ruleName: string;
  leadId?: string;
  dealTitle?: string;
  status: 'success' | 'failed' | 'skipped' | 'running';
  triggerEvent: string;
  actionsExecuted: string[];
  steps?: AutomationRunStep[];
  log: string;
  error?: string;
  executedAt: string;
}

export interface EmailTemplate {
  id: string;
  workspaceId: string;
  name: string;
  subject: string;
  body: string;
  variables: string[];
  createdAt: string;
  // Phase 2 additive fields
  category?: string;
  plainText?: string;
  isPrebuilt?: boolean;
  updatedAt?: string;
}

export interface EmailLog {
  id: string;
  workspaceId: string;
  leadId?: string;
  toEmail: string;
  subject: string;
  bodyPreview: string;
  status: 'sent' | 'failed' | 'scheduled' | 'delivered' | 'draft';
  templateId?: string;
  sentAt: string;
  error?: string;
}

export interface CalendarEvent {
  id: string;
  workspaceId: string;
  leadId?: string;
  dealId?: string;
  dealTitle?: string;
  title: string;
  description?: string;
  startIso: string;
  endIso: string;
  timezone?: string;
  attendees: string[];
  meetUrl?: string;
  googleEventId?: string;
  calendarEventUrl?: string;
  conferenceStatus?: 'confirmed' | 'pending' | 'failed' | 'disabled';
  status?: 'scheduled' | 'completed' | 'cancelled' | 'rescheduled';
  synced: boolean;
  syncError?: string;
  lastSyncAt?: string;
  createdAt: string;
  updatedAt?: string;
  // Phase 3 reminder tracking (idempotent)
  remindersSent?: {
    meSentAt?: string;
    meEmailSentAt?: string;
    leadSentAt?: string;
  };
}

export interface AppNotification {
  id: string;
  workspaceId: string;
  title: string;
  message: string;
  type: 'reminder' | 'meeting' | 'task' | 'email_failure' | 'system';
  leadId?: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}

export interface OAuthTokenRecord {
  workspaceId: string;
  provider: 'google_calendar';
  accessToken: string;
  refreshToken?: string;
  expiryDate: number;
  scope: string;
  userEmail?: string;
  updatedAt: string;
}

export interface CustomField {
  id: string;
  workspaceId: string;
  targetEntity: 'lead' | 'customer';
  name: string;
  fieldKey: string;
  fieldType: 'text' | 'number' | 'currency' | 'date' | 'dropdown' | 'checkbox';
  options?: string[];
  isRequired: boolean;
  createdAt: string;
}

export interface ImportJob {
  id: string;
  workspaceId: string;
  spreadsheetId: string;
  sheetName: string;
  totalRows: number;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  errors: string[];
  createdAt: string;
}

export interface GoogleSheetsConfig {
  spreadsheetId: string;
  clientEmail: string;
  privateKey: string;
  isConfigured: boolean;
  lastConnectedAt?: string;
}

export interface AuditLogEntry {
  id: string;
  workspaceId: string;
  userId: string;
  userName: string;
  action: string;
  details?: string;
  createdAt: string;
}

export * from './communication';
