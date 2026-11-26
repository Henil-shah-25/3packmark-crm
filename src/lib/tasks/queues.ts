import { Customer, Lead, PipelineStage, Task, TaskQueueCategory } from '@/types/crm';

export const TASK_QUEUES: TaskQueueCategory[] = [
  'Quotation Follow Up',
  'Delivery Follow Up',
  'Payment Follow Up',
  'Call Follow Up',
];

export function buildStageNameMap(stages?: PipelineStage[]): Record<string, string> {
  const map: Record<string, string> = {};
  if (Array.isArray(stages)) {
    for (const s of stages) {
      if (s?.id && s?.name) {
        map[s.id] = s.name.trim().toLowerCase();
      }
    }
  }
  return map;
}

function resolveStageName(
  lead?: Lead,
  stagesOrMap?: PipelineStage[] | Record<string, string>
): string {
  if (!lead) return '';
  if (stagesOrMap && !Array.isArray(stagesOrMap)) {
    return (stagesOrMap[lead.stageId] || (lead as any).stage || '').trim().toLowerCase();
  }
  const stg = stagesOrMap?.find((s) => s.id === lead.stageId);
  return (stg?.name || (lead as any).stage || '').trim().toLowerCase();
}

export function isDealClosedOrWon(
  lead?: Lead,
  stagesOrMap?: PipelineStage[] | Record<string, string>
): boolean {
  if (!lead) return false;
  const resolvedStageName = resolveStageName(lead, stagesOrMap);
  if (resolvedStageName.includes('closed')) return true;
  const sid = (lead.stageId || '').trim().toLowerCase();
  if (sid.includes('closed') || sid === 'stg-won' || sid === 'stg-loss' || sid === 'stg-lost') {
    return true;
  }
  const st = String(lead.status || '').trim().toLowerCase();
  if (st === 'won' || st === 'lost' || st === 'closed') return true;
  if (String(lead.title || '').trim().toLowerCase().startsWith('past order')) return true;
  return false;
}

export function isClosedOrHistorical(
  lead?: Lead,
  stagesOrMap?: PipelineStage[] | Record<string, string>
): boolean {
  return isDealClosedOrWon(lead, stagesOrMap);
}

export function isClosedOrPastOrderLead(
  lead?: Lead,
  stagesOrMap?: PipelineStage[] | Record<string, string>
): boolean {
  return isDealClosedOrWon(lead, stagesOrMap);
}

export function extractTaskSearchName(task: Pick<Task, 'title' | 'dealTitle'>): string {
  return (task.dealTitle || task.title || '')
    .replace(
      /^(call new lead:|call back:|follow[- ]?up:|quotation follow[- ]?up\s*[—:-]?|delivery follow[- ]?up\s*[—:-]?|payment follow[- ]?up\s*[—:-]?|quotation:|delivery:|payment:|call\s+)/i,
      ''
    )
    .trim()
    .toLowerCase();
}

export function resolveActiveDealForTask(
  task: Task & { dealId?: string },
  leads: Lead[],
  stages?: PipelineStage[],
  options?: { customers?: Customer[]; allowClosedFallback?: boolean }
): { deal?: Lead; remapped: boolean; wasClosedDirect: boolean } {
  const openDeals = leads.filter((l) => !isClosedOrHistorical(l, stages));
  const directId = task.dealId || task.leadId;
  const linkedDeal = directId ? leads.find((l) => l.id === directId) : undefined;

  // Step 1: Direct ID points to an OPEN active deal
  if (linkedDeal && !isClosedOrHistorical(linkedDeal, stages)) {
    return { deal: linkedDeal, remapped: false, wasClosedDirect: false };
  }

  const wasClosedDirect = Boolean(linkedDeal && isClosedOrHistorical(linkedDeal, stages));
  const getCompany = (d: any) => String(d?.companyName || d?.company || '').trim().toLowerCase();
  const getContact = (d: any) => String(d?.contactPerson || d?.contactName || '').trim().toLowerCase();

  // Step 2: Bridge via Closed Deal's Company Name (or Contact Name)
  if (linkedDeal) {
    const closedCompany = getCompany(linkedDeal);
    const closedContact = getContact(linkedDeal);
    const bridgeMatch = openDeals.find((d) => {
      const dCompany = getCompany(d);
      const dContact = getContact(d);
      if (closedCompany && dCompany && dCompany === closedCompany) return true;
      if (closedContact && dContact && dContact === closedContact) return true;
      return false;
    });
    if (bridgeMatch) {
      return { deal: bridgeMatch, remapped: true, wasClosedDirect };
    }
  }

  // Step 3: Bridge via Customer Directory + Task Title
  const needle = extractTaskSearchName(task);
  const customers = options?.customers || [];
  let targetCompany = '';

  if (needle && needle.length >= 2 && customers.length > 0) {
    const matchedCust = customers.find((c) => {
      const cName = String((c as any).contactPerson || c.name || '').trim().toLowerCase();
      const cCompany = String((c as any).companyName || c.company || '').trim().toLowerCase();
      return (
        (cName && (cName.includes(needle) || needle.includes(cName))) ||
        (cCompany && (cCompany.includes(needle) || needle.includes(cCompany)))
      );
    });
    if (matchedCust) {
      targetCompany = String((matchedCust as any).companyName || matchedCust.company || '').trim().toLowerCase();
    }
  }

  if ((needle && needle.length >= 2) || targetCompany) {
    const activeMatch = openDeals.find((d) => {
      const dContact = getContact(d);
      const dCompany = getCompany(d);
      const dTitle = (d.title || '').trim().toLowerCase();

      if (targetCompany) {
        if (dCompany && (dCompany.includes(targetCompany) || targetCompany.includes(dCompany))) return true;
        if (dTitle && dTitle.includes(targetCompany)) return true;
      }
      if (needle && needle.length >= 2) {
        if (dContact && (dContact.includes(needle) || needle.includes(dContact))) return true;
        if (dCompany && (dCompany.includes(needle) || needle.includes(dCompany))) return true;
        if (dTitle && (dTitle.includes(needle) || needle.includes(dTitle))) return true;
      }
      return false;
    });
    if (activeMatch) {
      return { deal: activeMatch, remapped: true, wasClosedDirect };
    }
  }

  // Step 4: Only if Steps 1-3 return undefined, fall back to linkedDeal (or closed name match)
  if (options?.allowClosedFallback) {
    const fallback =
      linkedDeal ||
      (needle && needle.length >= 2
        ? leads.find((d) => {
            const dContact = getContact(d);
            const dCompany = getCompany(d);
            const dTitle = (d.title || '').trim().toLowerCase();
            return (
              (dContact && (dContact.includes(needle) || needle.includes(dContact))) ||
              (dCompany && (dCompany.includes(needle) || needle.includes(dCompany))) ||
              (dTitle && (dTitle.includes(needle) || needle.includes(dTitle)))
            );
          })
        : undefined);
    return { deal: fallback, remapped: false, wasClosedDirect };
  }

  return { deal: undefined, remapped: false, wasClosedDirect };
}

/**
 * Strict 4-queue stage-eligibility mapping:
 * - Call Follow Up: New Lead, Call Status, Inquiry
 * - Quotation Follow Up: Quotation, Quotation Follow Up
 * - Delivery Follow Up: Purchase Order, Invoice, Dispatch
 * - Payment Follow Up: Credit Days, Credit Follow Up
 * - Closed/Won/Lost: null (no active follow-up queue)
 */
export function getEligibleQueueForStage(
  stageId?: string,
  stageName?: string
): TaskQueueCategory | null {
  const s = (stageId || '').trim().toLowerCase();
  const n = (stageName || '').trim().toLowerCase();

  if (
    s === 'stg-closed' ||
    s === 'stg-won' ||
    s === 'stg-loss' ||
    s === 'stg-lost' ||
    n === 'closed' ||
    n === 'won' ||
    n === 'lost'
  ) {
    return null;
  }

  if (
    s === 'stg-new-lead' ||
    s === 'stg-call-status' ||
    s === 'stg-inquiry' ||
    n === 'new lead' ||
    n === 'call status' ||
    n === 'inquiry'
  ) {
    return 'Call Follow Up';
  }

  if (
    s === 'stg-quotation' ||
    s === 'stg-quotation-follow-up' ||
    n === 'quotation' ||
    n === 'quotation follow up'
  ) {
    return 'Quotation Follow Up';
  }

  if (
    s === 'stg-purchase-order' ||
    s === 'stg-invoice' ||
    s === 'stg-dispatch' ||
    n === 'purchase order' ||
    n === 'invoice' ||
    n === 'dispatch'
  ) {
    return 'Delivery Follow Up';
  }

  if (
    s === 'stg-credit-days' ||
    s === 'stg-credit-follow-up' ||
    n === 'credit days' ||
    n === 'credit follow up'
  ) {
    return 'Payment Follow Up';
  }

  return 'Call Follow Up';
}

export function suggestTaskQueueForStage(stageId?: string, stageName?: string): TaskQueueCategory {
  return getEligibleQueueForStage(stageId, stageName) || 'Call Follow Up';
}

export function resolveTaskQueue(
  task: Task,
  lead?: Lead,
  stagesOrMap?: PipelineStage[] | Record<string, string>
): TaskQueueCategory {
  // Always map by the deal's current resolved stage name first when linked to a deal
  if (lead?.stageId) {
    const resolvedStageName = resolveStageName(lead, stagesOrMap);
    const stageQueue = getEligibleQueueForStage(lead.stageId, resolvedStageName);
    if (stageQueue) return stageQueue;
  }
  if (task.queueCategory && TASK_QUEUES.includes(task.queueCategory)) {
    return task.queueCategory;
  }
  const text = `${task.title || ''} ${task.description || ''}`.toLowerCase();
  if (text.includes('payment') || text.includes('credit')) {
    return 'Payment Follow Up';
  }
  if (text.includes('deliver') || text.includes('dispatch') || text.includes('invoice') || text.includes('purchase order')) {
    return 'Delivery Follow Up';
  }
  if (text.includes('quot')) {
    return 'Quotation Follow Up';
  }
  return 'Call Follow Up';
}

export function formatTaskDisplayTitle(
  task: Task,
  lead?: Lead,
  stagesOrMap?: PipelineStage[] | Record<string, string>
): string {
  const rawTitle = (task.title || '').trim();
  if (!lead) return rawTitle;

  const isLegacyCallTitle = /^(call new lead:|call back:)/i.test(rawTitle);
  if (!isLegacyCallTitle) return rawTitle;

  const stageName = resolveStageName(lead, stagesOrMap);
  const sid = (lead.stageId || '').trim().toLowerCase();
  const displaySubject =
    rawTitle.replace(/^(call new lead:|call back:)\s*/i, '').trim() ||
    lead.contactName ||
    lead.company ||
    lead.title;

  if (stageName === 'quotation follow up' || sid === 'stg-quotation-follow-up') {
    return `Quotation follow-up: ${displaySubject}`;
  }
  if (stageName === 'quotation' || sid === 'stg-quotation') {
    return `Prepare & send quotation: ${displaySubject}`;
  }
  if (
    stageName === 'purchase order' ||
    stageName === 'invoice' ||
    stageName === 'dispatch' ||
    sid === 'stg-purchase-order' ||
    sid === 'stg-invoice' ||
    sid === 'stg-dispatch'
  ) {
    return `Delivery follow-up: ${displaySubject}`;
  }
  if (
    stageName === 'credit days' ||
    stageName === 'credit follow up' ||
    sid === 'stg-credit-days' ||
    sid === 'stg-credit-follow-up'
  ) {
    return `Payment follow-up: ${displaySubject}`;
  }
  return rawTitle;
}

export function isTaskEligibleForLeadStage(
  task: Task,
  lead?: Lead,
  stagesOrMap?: PipelineStage[] | Record<string, string>
): boolean {
  if (!lead) return true;
  if (isDealClosedOrWon(lead, stagesOrMap)) return false;

  const stageName = resolveStageName(lead, stagesOrMap);
  const eligibleQueue = getEligibleQueueForStage(lead.stageId, stageName);
  if (!eligibleQueue) return false;

  return resolveTaskQueue(task, lead, stagesOrMap) === eligibleQueue;
}
