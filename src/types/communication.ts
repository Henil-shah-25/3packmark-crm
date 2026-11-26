export type CommunicationChannel = 'whatsapp' | 'sms' | 'email';

export type CommunicationMessageStatus =
  | 'draft'
  | 'queued'
  | 'submitted'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'cancelled';

export type ConversationStatus = 'open' | 'closed' | 'archived';

export interface CommunicationConversation {
  id: string;
  workspaceId: string;
  customerId?: string;
  leadId?: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  channel: CommunicationChannel;
  status: ConversationStatus;
  assignedEmployeeId?: string;
  assignedEmployeeName?: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  lastMessageDirection: 'inbound' | 'outbound';
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommunicationMessage {
  id: string;
  workspaceId: string;
  conversationId: string;
  customerId?: string;
  leadId?: string;
  channel: CommunicationChannel;
  direction: 'inbound' | 'outbound';
  senderId?: string;
  senderName: string;
  recipient: string; // phone or email
  content: string;
  subject?: string; // used for email
  status: CommunicationMessageStatus;
  metadata?: {
    templateId?: string;
    templateVariables?: Record<string, string>;
    characterCount?: number;
    segmentCount?: number;
    provider?: string;
    providerMessageId?: string;
    errorMessage?: string;
    dltTemplateId?: string; // for future SMS/MSG91 DLT compliance
  };
  createdAt: string;
  updatedAt: string;
}

export interface CommunicationTemplate {
  id: string;
  workspaceId: string;
  name: string;
  channel: CommunicationChannel;
  category: string; // e.g. 'Welcome', 'Follow Up', 'Meeting', 'Billing', 'Promotional'
  content: string;
  subject?: string; // for email
  variables: string[]; // e.g. ['customer_name', 'business_name', 'employee_name', 'order_id']
  isExternalApproved?: boolean; // clearly distinguishes CRM template from DLT/WhatsApp approved
  externalTemplateId?: string; // e.g. MSG91 or WhatsApp Template ID
  createdAt: string;
  updatedAt: string;
}

export interface CommunicationSettings {
  workspaceId: string;
  whatsapp: {
    provider: 'msg91' | 'meta' | 'none';
    isConfigured: boolean;
    status: 'coming_soon' | 'not_configured' | 'connected';
    senderNumber?: string;
    authKeyPlaceholder?: string;
  };
  sms: {
    provider: 'msg91' | 'twilio' | 'none';
    isConfigured: boolean;
    status: 'coming_soon' | 'not_configured' | 'connected';
    senderId?: string;
    dltEntityId?: string;
  };
  email: {
    provider: 'smtp';
    isConfigured: boolean;
    fromEmail?: string;
    fromName?: string;
  };
  webhook: {
    inboundUrl: string;
    secretConfigured: boolean;
  };
  updatedAt: string;
}

export interface CustomerTimelineItem {
  id: string;
  type: 'whatsapp' | 'sms' | 'email' | 'call' | 'note' | 'website_visit' | 'product_view' | 'cart_activity' | 'checkout' | 'purchase' | 'form_submission';
  title: string;
  content: string;
  authorName: string;
  status?: CommunicationMessageStatus;
  channel?: CommunicationChannel;
  recipient?: string;
  direction?: 'inbound' | 'outbound';
  metadata?: Record<string, any>;
  createdAt: string; // ISO
}

