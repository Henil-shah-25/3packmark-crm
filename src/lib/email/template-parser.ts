import { Lead, Workspace, TeamMember, CalendarEvent } from '@/types/crm';
import { formatCurrency } from '@/lib/financial';
import { formatDate, formatTime } from '@/lib/dateTime';

export interface SupportedVariable {
  key: string;
  label: string;
  desc: string;
  example: string;
  category: 'Greeting' | 'Lead' | 'Company' | 'Deal' | 'Owner' | 'Meeting' | 'My Business';
}

export const SUPPORTED_VARIABLES: SupportedVariable[] = [
  { key: 'greeting', label: 'Smart Greeting', desc: '"Dear <First Name>," or "Dear Sir/Madam,"', example: 'Dear Rahul,', category: 'Greeting' },
  { key: 'lead.name', label: 'Lead Full Name', desc: 'Full contact name', example: 'Rahul Sharma', category: 'Lead' },
  { key: 'lead.firstName', label: 'Lead First Name', desc: 'First name with fallback ("there")', example: 'Rahul', category: 'Lead' },
  { key: 'lead.email', label: 'Lead Email', desc: 'Email address of the contact', example: 'rahul@apex.com', category: 'Lead' },
  { key: 'lead.phone', label: 'Lead Phone', desc: 'Phone number in E.164 format', example: '+919876543210', category: 'Lead' },
  { key: 'lead.designation', label: 'Lead Designation', desc: 'Job role or title', example: 'VP Technology', category: 'Lead' },
  { key: 'company.name', label: 'Company Name', desc: 'Company ("your company" fallback)', example: 'Apex Technologies', category: 'Company' },
  { key: 'deal.title', label: 'Deal / Opportunity Title', desc: 'Title of the opportunity', example: 'Mobile App Redesign', category: 'Deal' },
  { key: 'deal.value', label: 'Deal Value', desc: 'Formatted currency deal value', example: '$25,000', category: 'Deal' },
  { key: 'deal.stage', label: 'Deal Stage', desc: 'Pipeline stage name', example: 'Qualified', category: 'Deal' },
  { key: 'owner.name', label: 'Owner Name', desc: 'Name of the account executive', example: 'Developster Team', category: 'Owner' },
  { key: 'meeting.date', label: 'Meeting Date', desc: 'Formatted date of scheduled meeting', example: 'Friday, Nov 14, 2026', category: 'Meeting' },
  { key: 'meeting.time', label: 'Meeting Time', desc: 'Formatted meeting time with timezone', example: '3:00 PM IST', category: 'Meeting' },
  { key: 'meeting.link', label: 'Meeting Link', desc: 'Google Meet or conference link', example: 'https://meet.google.com/abc-defg-hij', category: 'Meeting' },
  { key: 'my.company', label: 'My Company Name', desc: 'Your business name from Settings', example: 'Developster Hub', category: 'My Business' },
  { key: 'my.website', label: 'My Website', desc: 'Official website URL from Settings', example: 'https://developster.com', category: 'My Business' },
  { key: 'my.portfolio', label: 'My Portfolio URL', desc: 'Portfolio or case studies link', example: 'https://developster.com/portfolio', category: 'My Business' },
  { key: 'my.phone', label: 'My Phone', desc: 'Your direct business phone', example: '+91 98765 43210', category: 'My Business' },
  { key: 'my.signature', label: 'My Signature', desc: 'Rendered HTML email signature', example: '<p>Best regards,<br>Developster Team</p>', category: 'My Business' },
];

export interface TemplateRenderContext {
  lead?: Partial<Lead> | null;
  workspace?: Partial<Workspace> | null;
  owner?: Partial<TeamMember> | null;
  meeting?: Partial<CalendarEvent> | null;
  extra?: Record<string, string | number | boolean>;
}

/**
 * Extracts all variable tags from a text string.
 * Supports {{variable}} and {{variable | "fallback"}}
 */
export function extractVariableNames(text: string): string[] {
  if (!text) return [];
  const matches = text.matchAll(/\{\{\s*([\w.]+)(?:\s*\|\s*(?:"([^"]*)"|'([^']*)'|([^}]+)))?\s*\}\}/g);
  const vars: string[] = [];
  for (const m of matches) {
    if (m[1] && !vars.includes(m[1])) {
      vars.push(m[1]);
    }
  }
  return vars;
}

/**
 * Validates template variables and missing fields
 */
export function validateTemplate(template: { subject: string; body: string }) {
  const warnings: string[] = [];
  const unknownVariables: string[] = [];
  const validKeys = new Set(SUPPORTED_VARIABLES.map((v) => v.key));

  if (!template.subject || !template.subject.trim()) {
    warnings.push('Subject line is missing. Emails require a subject before sending.');
  }

  const allVars = [
    ...extractVariableNames(template.subject || ''),
    ...extractVariableNames(template.body || ''),
  ];

  for (const v of allVars) {
    if (!validKeys.has(v)) {
      unknownVariables.push(v);
      warnings.push(`Unknown variable "{{${v}}}". It may render empty or cause issues.`);
    }
  }

  return {
    valid: warnings.length === 0,
    warnings,
    unknownVariables,
  };
}

/**
 * Strips HTML tags and decodes entities into clean plain text
 */
export function htmlToPlainText(html: string): string {
  if (!html) return '';
  const text = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text;
}

/**
 * Renders a string containing template variables with robust fallback resolution
 */
export function renderTemplateString(rawText: string, context: TemplateRenderContext = {}): string {
  if (!rawText) return '';

  const lead = context.lead || null;
  const workspace = context.workspace || null;
  const owner = context.owner || null;
  const meeting = context.meeting || null;
  const extra = context.extra || {};

  // Resolve values for each known key
  const contactName = lead?.contactName?.trim() || '';
  const firstName = contactName ? contactName.split(/\s+/)[0] : '';
  const companyName = lead?.company?.trim() || '';

  // Smart greeting: "Dear <firstName>," if name exists, else "Dear Sir/Madam,"
  const greetingValue = contactName
    ? `Dear ${firstName},`
    : 'Dear Sir/Madam,';

  // Format deal value using Indian Rupee (INR / ₹) standard
  let dealValueStr = '';
  if (lead?.value !== undefined && lead?.value !== null) {
    dealValueStr = typeof lead.value === 'number'
      ? formatCurrency(lead.value, workspace?.currency || 'INR')
      : String(lead.value);
  }

  // Format meeting date & time in Indian Standard Time (Asia/Kolkata)
  let meetingDateStr = (extra.meetingDate as string) || '';
  let meetingTimeStr = (extra.meetingTime as string) || '';
  const meetingLinkStr = meeting?.meetUrl || meeting?.calendarEventUrl || (extra.meetingLink as string) || '';

  if (meeting?.startIso && (!meetingDateStr || !meetingTimeStr)) {
    try {
      const d = new Date(meeting.startIso);
      if (!isNaN(d.getTime())) {
        meetingDateStr = formatDate(d);
        meetingTimeStr = formatTime(d, { includeTimezoneName: true });
      }
    } catch {}
  }

  // Pre-resolved map of supported variables
  const resolvedValues: Record<string, string> = {
    'greeting': greetingValue,
    'lead.name': contactName,
    'lead.firstName': firstName,
    'lead.email': lead?.email?.trim() || '',
    'lead.phone': lead?.phone?.trim() || '',
    'lead.designation': lead?.designation?.trim() || '',
    'company.name': companyName,
    'deal.title': lead?.title?.trim() || '',
    'deal.value': dealValueStr,
    'deal.stage': lead?.status || (extra.stageName as string) || '',
    'owner.name': owner?.name || (workspace as any)?.senderName || 'Developster Team',
    'meeting.date': meetingDateStr,
    'meeting.time': meetingTimeStr,
    'meeting.link': meetingLinkStr,
    'my.company': workspace?.companyName || workspace?.name || 'Developster Hub',
    'my.website': workspace?.website || 'https://developster.com',
    'my.portfolio': workspace?.portfolioUrl || '',
    'my.phone': workspace?.phone || '',
    'my.signature': workspace?.emailSignature || '<p>Best regards,<br>Developster Team</p>',
  };

  // Replace variable pattern {{key}} or {{key | "fallback"}}
  const rendered = rawText.replace(/\{\{\s*([\w.]+)(?:\s*\|\s*(?:"([^"]*)"|'([^']*)'|([^}]+)))?\s*\}\}/g, (match, key, qDouble, qSingle, unquoted) => {
    const explicitFallback = qDouble !== undefined ? qDouble : (qSingle !== undefined ? qSingle : (unquoted !== undefined ? unquoted.trim() : undefined));
    const val = resolvedValues[key];

    // If we have a non-empty resolved value, use it
    if (val !== undefined && val !== '') {
      return val;
    }

    // If explicit fallback was provided in the syntax: {{lead.firstName | "there"}}
    if (explicitFallback !== undefined) {
      return explicitFallback;
    }

    // Built-in smart fallbacks for key variables so no broken gap appears
    switch (key) {
      case 'greeting':
        return 'Dear Sir/Madam,';
      case 'company.name':
        return 'your company';
      case 'lead.firstName':
      case 'lead.name':
        return 'there';
      case 'lead.designation':
        return 'decision maker';
      case 'deal.title':
        return 'our project discussion';
      case 'deal.value':
        return 'the proposed scope';
      case 'deal.stage':
        return 'in progress';
      case 'owner.name':
        return 'our team';
      case 'meeting.date':
        return 'the scheduled date';
      case 'meeting.time':
        return 'the scheduled time';
      case 'meeting.link':
        return 'our virtual room link';
      case 'my.company':
        return 'our company';
      case 'my.website':
      case 'my.portfolio':
      case 'my.phone':
      case 'my.signature':
        return '';
      default:
        // Do not leave raw {{...}} or undefined
        return '';
    }
  });

  return rendered;
}

