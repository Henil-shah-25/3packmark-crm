import { Lead, Workspace } from '@/types/crm';
import { getWhatsAppUrl } from '@/lib/phone';

export interface WhatsAppSendResult {
  success: boolean;
  configured: boolean;
  messageId?: string;
  waUrl?: string;
  error?: string;
  reason?: string;
}

export function getWhatsAppConfig() {
  const token = (process.env.WHATSAPP_API_TOKEN || '').trim();
  const phoneId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();

  return {
    token,
    phoneId,
    isConfigured: Boolean(token && phoneId),
  };
}

/**
 * Send an automated WhatsApp message to a lead.
 * Respects Meta WhatsApp Cloud API credentials when configured.
 * Safely reports provider status when credentials are not configured.
 */
export async function sendWhatsAppMessage(
  recipientPhone: string,
  message: string,
  options?: {
    templateName?: string;
    templateLanguage?: string;
    lead?: Lead;
    workspace?: Workspace;
  }
): Promise<WhatsAppSendResult> {
  const config = getWhatsAppConfig();
  const cleanPhone = (recipientPhone || '').replace(/[^0-9]/g, '');

  if (!cleanPhone) {
    return {
      success: false,
      configured: config.isConfigured,
      reason: 'invalid_recipient_phone',
      error: 'Recipient has no valid phone number for WhatsApp delivery.',
    };
  }

  const waUrl = getWhatsAppUrl(cleanPhone, message);

  // If WhatsApp Cloud API credentials are NOT configured:
  if (!config.isConfigured) {
    console.warn(`[WhatsApp Gateway] Automated message dispatch blocked: WhatsApp provider is not configured.`);
    return {
      success: false,
      configured: false,
      waUrl,
      reason: 'provider_not_configured',
      error: 'WhatsApp provider is not configured. Live delivery was paused.',
      messageId: `wa-draft-${Date.now()}`,
    };
  }

  // If WhatsApp Cloud API credentials ARE configured:
  try {
    const url = `https://graph.facebook.com/v19.0/${config.phoneId}/messages`;
    const payload = options?.templateName
      ? {
          messaging_product: 'whatsapp',
          to: cleanPhone,
          type: 'template',
          template: {
            name: options.templateName,
            language: { code: options.templateLanguage || 'en_US' },
          },
        }
      : {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanPhone,
          type: 'text',
          text: { preview_url: false, body: message },
        };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error('[WhatsApp Gateway] API Error:', data);
      return {
        success: false,
        configured: true,
        waUrl,
        error: data.error?.message || `WhatsApp API error ${res.status}`,
      };
    }

    const messageId = data.messages?.[0]?.id || `wa-${Date.now()}`;
    return {
      success: true,
      configured: true,
      messageId,
      waUrl,
    };
  } catch (err: any) {
    console.error('[WhatsApp Gateway] Network error:', err.message);
    return {
      success: false,
      configured: true,
      waUrl,
      error: err.message,
    };
  }
}

