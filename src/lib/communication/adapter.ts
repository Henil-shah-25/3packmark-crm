import {
  CommunicationChannel,
  CommunicationMessageStatus,
  CommunicationSettings,
} from '@/types/communication';

export interface SendMessageRequest {
  workspaceId: string;
  channel: CommunicationChannel;
  recipient: string;
  content: string;
  subject?: string;
  templateId?: string;
  variables?: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface SendMessageResponse {
  success: boolean;
  messageId?: string;
  status: CommunicationMessageStatus;
  error?: string;
  errorCode?: string;
  provider: string;
  retryable?: boolean;
}

export interface MessageStatusResponse {
  messageId: string;
  status: CommunicationMessageStatus;
  deliveredAt?: string;
  readAt?: string;
  error?: string;
}

export interface ProviderValidationResult {
  isValid: boolean;
  provider: string;
  channel: CommunicationChannel;
  message: string;
}

export interface WebhookEventPayload {
  provider: string;
  channel: CommunicationChannel;
  rawPayload: any;
  headers?: Record<string, string>;
}

export interface ProcessedWebhookEvent {
  recognized: boolean;
  eventType: 'delivery_receipt' | 'inbound_message' | 'read_receipt' | 'failure';
  providerMessageId?: string;
  newStatus?: CommunicationMessageStatus;
  inboundContent?: string;
  sender?: string;
  timestamp?: string;
}

/**
 * Universal interface for all current and future messaging providers (MSG91, Meta, Twilio).
 */
export interface ICommunicationProviderAdapter {
  readonly providerId: string;
  readonly supportedChannels: CommunicationChannel[];
  sendMessage(req: SendMessageRequest): Promise<SendMessageResponse>;
  getMessageStatus(providerMessageId: string): Promise<MessageStatusResponse>;
  validateConfiguration(workspaceId: string): Promise<ProviderValidationResult>;
  processWebhook(payload: WebhookEventPayload): Promise<ProcessedWebhookEvent>;
}

/**
 * MSG91 Adapter Implementation
 * Prepares the architectural foundation for MSG91 WhatsApp and SMS services.
 * In this development phase, it strictly enforces disconnected status and will
 * NEVER pretend a message has been sent or delivered without verified configuration.
 */
export class Msg91ProviderAdapter implements ICommunicationProviderAdapter {
  readonly providerId = 'msg91';
  readonly supportedChannels: CommunicationChannel[] = ['whatsapp', 'sms'];

  async sendMessage(req: SendMessageRequest): Promise<SendMessageResponse> {
    // Under no circumstances do we fabricate a successful external dispatch
    return {
      success: false,
      status: 'failed',
      provider: 'msg91',
      errorCode: 'PROVIDER_NOT_CONNECTED',
      error: `MSG91 ${req.channel.toUpperCase()} provider integration is coming soon. The message has been recorded as a draft.`,
      retryable: false,
    };
  }

  async getMessageStatus(providerMessageId: string): Promise<MessageStatusResponse> {
    return {
      messageId: providerMessageId,
      status: 'failed',
      error: 'MSG91 provider integration pending.',
    };
  }

  async validateConfiguration(workspaceId: string): Promise<ProviderValidationResult> {
    return {
      isValid: false,
      provider: 'msg91',
      channel: 'whatsapp',
      message: 'MSG91 configuration is reserved for future integration. No credentials active.',
    };
  }

  async processWebhook(payload: WebhookEventPayload): Promise<ProcessedWebhookEvent> {
    return {
      recognized: false,
      eventType: 'failure',
    };
  }
}

/**
 * Factory to retrieve the appropriate adapter based on channel and workspace settings
 */
export function getCommunicationAdapter(
  channel: CommunicationChannel,
  settings?: CommunicationSettings
): ICommunicationProviderAdapter {
  // Currently, MSG91 is our planned commercial provider for WhatsApp and SMS
  return new Msg91ProviderAdapter();
}

/**
 * Calculate SMS characters and segments accurately
 * Standard GSM 7-bit: 160 chars for 1 segment, 153 chars per segment if concatenated
 * Unicode (emojis / Indian languages like Hindi): 70 chars for 1 segment, 67 chars per segment if concatenated
 */
export function calculateSmsSegments(text: string): {
  charCount: number;
  segmentCount: number;
  isUnicode: boolean;
  charsRemaining: number;
} {
  if (!text) {
    return { charCount: 0, segmentCount: 1, isUnicode: false, charsRemaining: 160 };
  }

  // Detect non-GSM characters (Unicode)
  // Standard GSM-7 includes basic Latin, digits, common punctuation
  const isUnicode = /[^\u0020-\u007E\u00A0-\u00FF\r\n\t]/.test(text);
  const charCount = text.length;

  if (isUnicode) {
    if (charCount <= 70) {
      return { charCount, segmentCount: 1, isUnicode: true, charsRemaining: 70 - charCount };
    }
    const segmentCount = Math.ceil(charCount / 67);
    const charsRemaining = segmentCount * 67 - charCount;
    return { charCount, segmentCount, isUnicode: true, charsRemaining };
  } else {
    if (charCount <= 160) {
      return { charCount, segmentCount: 1, isUnicode: false, charsRemaining: 160 - charCount };
    }
    const segmentCount = Math.ceil(charCount / 153);
    const charsRemaining = segmentCount * 153 - charCount;
    return { charCount, segmentCount, isUnicode: false, charsRemaining };
  }
}

/**
 * Interpolates variables in a template string safely
 * e.g. "Hello {{customer_name}}, your order {{order_id}} is ready at {{business_name}}."
 */
export function interpolateTemplateVariables(
  template: string,
  variables: Record<string, string | number | undefined | null>
): string {
  if (!template) return '';
  return template.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (match, key) => {
    const val = variables[key];
    if (val !== undefined && val !== null) {
      return String(val);
    }
    return match; // preserve variable token if not provided
  });
}

