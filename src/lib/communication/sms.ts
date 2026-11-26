export interface SmsSendResult {
  success: boolean;
  configured: boolean;
  messageId?: string;
  error?: string;
  reason?: string;
}

export function getSmsConfig() {
  const provider = (process.env.SMS_PROVIDER || 'none').trim().toLowerCase();
  const twilioSid = (process.env.TWILIO_ACCOUNT_SID || '').trim();
  const twilioToken = (process.env.TWILIO_AUTH_TOKEN || '').trim();
  const twilioFrom = (process.env.TWILIO_FROM_NUMBER || '').trim();

  const isConfigured =
    provider === 'twilio' ? Boolean(twilioSid && twilioToken && twilioFrom) : false;

  return {
    provider,
    twilioSid,
    twilioToken,
    twilioFrom,
    isConfigured,
  };
}

/**
 * Send an automated SMS to a lead.
 * Does not pretend SMS is operational if provider credentials are not configured.
 */
export async function sendSmsMessage(
  recipientPhone: string,
  message: string
): Promise<SmsSendResult> {
  const config = getSmsConfig();
  const cleanPhone = (recipientPhone || '').trim();

  if (!cleanPhone) {
    return {
      success: false,
      configured: config.isConfigured,
      reason: 'invalid_recipient_phone',
      error: 'Recipient has no valid phone number for SMS delivery.',
    };
  }

  // If SMS provider is not configured:
  if (!config.isConfigured) {
    const errorMsg =
      config.provider === 'none'
        ? 'SMS provider is not configured in environment variables (SMS_PROVIDER=none).'
        : `SMS provider "${config.provider}" is missing required credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_FROM_NUMBER).`;

    console.warn(`[SMS Gateway] ${errorMsg}`);
    return {
      success: false,
      configured: false,
      reason: 'provider_not_configured',
      error: errorMsg,
    };
  }

  // Twilio Gateway
  if (config.provider === 'twilio') {
    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${config.twilioSid}/Messages.json`;
      const auth = Buffer.from(`${config.twilioSid}:${config.twilioToken}`).toString('base64');

      const params = new URLSearchParams();
      params.append('To', cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`);
      params.append('From', config.twilioFrom);
      params.append('Body', message);

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.error('[SMS Gateway] Twilio API Error:', data);
        return {
          success: false,
          configured: true,
          error: data.message || `Twilio HTTP error ${res.status}`,
        };
      }

      return {
        success: true,
        configured: true,
        messageId: data.sid || `sms-${Date.now()}`,
      };
    } catch (err: any) {
      console.error('[SMS Gateway] Network error:', err.message);
      return {
        success: false,
        configured: true,
        error: err.message,
      };
    }
  }

  return {
    success: false,
    configured: false,
    error: `Unsupported SMS provider: ${config.provider}`,
  };
}

