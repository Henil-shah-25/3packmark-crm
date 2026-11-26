import { Lead } from '@/types/crm';

export const LEAD_SOURCES = [
  'Phone Call',
  'Visit',
  'Cold Call',
  'Seminar',
] as const;

export const CALL_STATUS_OPTIONS = [
  'Call Not Received',
  'Waiting',
  'Busy',
  'In Meeting',
  'Switch Off',
  'Not Reachable',
] as const;

export const QUOTATION_FOLLOWUP_OPTIONS = [
  'High Price',
  'Approval Stage',
  'Mailing',
  'Purchased from Other',
] as const;

export const CREDIT_TERMS_OPTIONS = [
  'Advanced',
  'Cash on Delivery',
  '30 Days Credit',
  '45 Days Credit',
] as const;

const POST_QUOTATION_STAGE_IDS = new Set([
  'stg-purchase-order',
  'stg-invoice',
  'stg-dispatch',
  'stg-credit-days',
  'stg-credit-follow-up',
  'stg-closed',
  'stg-won',
  'stg-loss',
]);

/**
 * Formats the structured pipeline card subtitle:
 * - Base: `{Contact Name} | {Lead Source}`
 * - Cold Call: `Cold Call (Gatekeeper)` or `Cold Call ✓`
 * - Active tag: `{Contact Name} | {Lead Source} | {Active Stage Tag}`
 */
export function formatLeadCardSubtitle(lead: Lead): string {
  const contactName = (lead.contactName || lead.company || 'Lead').trim();
  const rawSource = (lead.leadSource || lead.source || 'Phone Call').trim();

  const sourceLabel =
    rawSource === 'Cold Call'
      ? lead.isDecisionMakerReached
        ? 'Cold Call ✓'
        : 'Cold Call (Gatekeeper)'
      : rawSource;

  let activeTag = '';
  if (lead.stageId === 'stg-call-status' && lead.callSubStatus) {
    activeTag = lead.callSubStatus.trim();
  } else if (lead.stageId === 'stg-quotation-follow-up' && lead.quotationSubStatus) {
    activeTag = lead.quotationSubStatus.trim();
  } else if (
    (lead.stageId === 'stg-credit-days' || lead.stageId === 'stg-credit-follow-up') &&
    lead.creditTerms
  ) {
    activeTag = lead.creditTerms.trim();
  }

  return activeTag
    ? `${contactName} | ${sourceLabel} | ${activeTag}`
    : `${contactName} | ${sourceLabel}`;
}

/**
 * Computes automatic field erasures when a lead moves to a target stage:
 * - Moving out of Call Status clears `callSubStatus`.
 * - Moving forward to Purchase Order (or beyond) clears `quotationSubStatus`.
 * - Moving into Closed / Won clears `creditTerms` (persists across Credit Follow Up).
 */
export function getStageExitClearUpdates(targetStageId: string): Partial<Lead> {
  const updates: Partial<Lead> = {};

  if (targetStageId !== 'stg-call-status') {
    updates.callSubStatus = '';
  }

  if (POST_QUOTATION_STAGE_IDS.has(targetStageId)) {
    updates.quotationSubStatus = '';
  }

  if (targetStageId === 'stg-closed' || targetStageId === 'stg-won') {
    updates.creditTerms = '';
  }

  return updates;
}
