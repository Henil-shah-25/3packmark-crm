export type PulseEventType =
  // Standard Web & Navigation
  | 'page_view'
  | 'session_start'
  | 'session_end'
  | 'return_visit'
  // Ecommerce Funnel
  | 'product_viewed'
  | 'item_added_to_cart'
  | 'item_removed_from_cart'
  | 'cart_updated'
  | 'checkout_started'
  | 'checkout_abandoned'
  | 'purchase_completed'
  | 'order_cancelled'
  | 'order_refunded'
  // Lead & Form Activity
  | 'form_started'
  | 'form_submitted'
  | 'demo_requested'
  | 'account_registered'
  | 'user_logged_in'
  // Email Engagement
  | 'email_delivered'
  | 'email_opened_reported'
  | 'email_link_clicked'
  | 'email_bounced'
  | 'email_unsubscribed'
  | 'email_spam_complaint'
  // Custom
  | 'custom_event';

export type PulseEventSource = 'sdk' | 'shopify' | 'woocommerce' | 'custom_api' | 'email_tracker';

export interface PulseEvent {
  id: string;
  workspaceId: string;
  siteId: string;
  visitorId: string; // Anonymous or resolved visitor ID
  sessionId: string;
  customerId?: string; // Linked CRM customer ID if identified
  leadId?: string; // Linked CRM lead ID if applicable
  type: PulseEventType;
  name: string;
  source: PulseEventSource;
  url?: string;
  path?: string;
  title?: string;
  referrer?: string;
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
    term?: string;
    content?: string;
  };
  device?: {
    type?: 'desktop' | 'mobile' | 'tablet';
    browser?: string;
    os?: string;
  };
  geo?: {
    country?: string;
    city?: string;
    timezone?: string;
  };
  properties: Record<string, any>;
  ecommerce?: {
    currency?: string;
    orderId?: string;
    total?: number;
    subtotal?: number;
    tax?: number;
    shipping?: number;
    discount?: number;
    coupon?: string;
    items?: Array<{
      id: string;
      sku?: string;
      name: string;
      price: number;
      quantity: number;
      category?: string;
      imageUrl?: string;
      variant?: string;
    }>;
  };
  identities?: {
    email?: string;
    phone?: string;
    name?: string;
    externalId?: string;
    leadId?: string;
    customerId?: string;
  };
  idempotencyKey?: string;
  timestamp: string; // ISO string
  createdAt: string; // ISO string
}

export interface PulseVisitorSession {
  id: string;
  workspaceId: string;
  siteId: string;
  visitorId: string;
  customerId?: string;
  leadId?: string;
  isIdentified: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  pageViewsCount: number;
  eventsCount: number;
  entryUrl: string;
  exitUrl?: string;
  referrer?: string;
  utm?: PulseEvent['utm'];
  device?: PulseEvent['device'];
  geo?: PulseEvent['geo'];
  cart?: {
    updatedAt: string;
    currency: string;
    total: number;
    itemsCount: number;
    items: Array<{
      id: string;
      name: string;
      price: number;
      quantity: number;
    }>;
    checkoutStartedAt?: string;
    abandonedAt?: string;
  };
  ordersCount: number;
  totalSpent: number;
}

export interface PulseWebsite {
  id: string;
  workspaceId: string;
  siteId: string; // Public token (e.g. psite_xxxxxxxx)
  name: string;
  domain: string;
  whitelistedDomains: string[];
  status: 'active' | 'unverified' | 'paused';
  snippetInstalled: boolean;
  lastPingAt?: string;
  eventsCountTotal: number;
  ecommercePlatform?: 'none' | 'shopify' | 'woocommerce' | 'custom';
  createdAt: string;
  updatedAt: string;
}

export interface PulseEcommerceIntegration {
  id: string;
  workspaceId: string;
  platform: 'shopify' | 'woocommerce' | 'custom';
  name: string;
  storeUrl: string;
  shopDomain?: string; // Canonical registered shop domain (e.g. store.myshopify.com)
  status: 'connected' | 'error' | 'disconnected';
  webhookSecret: string; // Used to verify HMAC signature
  autoSyncOrders: boolean;
  lastSyncAt?: string;
  lastWebhookReceivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PulseBusinessEvent {
  id: string;
  workspaceId: string;
  siteId: string;
  platform: 'shopify' | 'woocommerce' | 'sdk' | 'custom_api';
  sourceEventId: string;
  eventType: 'purchase_completed' | 'checkout_completed' | 'customer_milestone' | string;
  customerId?: string;
  orderId?: string;
  amount?: number;
  currency?: string;
  occurredAt: string;
  processedAt: string;
  metadata?: Record<string, any>;
}

export interface PulseDailyRollup {
  id: string; // Deterministic logical key: rl_<workspaceId>_<siteId>_<date>_<eventType>_<currency>
  workspaceId: string;
  siteId: string;
  date: string; // YYYY-MM-DD in UTC
  eventType: string;
  currency: string;
  eventCount: number;
  totalRevenue: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PulseWebhookDelivery {
  id: string;
  workspaceId: string;
  platform: 'shopify' | 'woocommerce';
  webhookId: string; // Unique provider delivery/event ID
  topic?: string;
  processedAt: string;
}

export interface PulseFunnelStep {
  id: string;
  name: string;
  eventType: PulseEventType;
  pageUrlPattern?: string;
}

export interface PulseFunnel {
  id: string;
  workspaceId: string;
  siteId?: string;
  name: string;
  description?: string;
  steps: PulseFunnelStep[];
  timeWindowHours: number;
  createdAt: string;
  updatedAt: string;
}

export interface PulseFunnelStepAnalytics {
  stepId: string;
  stepIndex: number;
  name: string;
  eventType: PulseEventType;
  pageUrlPattern?: string;
  visitors: number;
  conversionRateFromPrevious: number; // e.g. 75.5 (%)
  dropoffCount: number;
  dropoffRateFromPrevious: number; // e.g. 24.5 (%)
  deltaFromPreviousPeriod?: {
    visitorsDeltaPercent: number;
    conversionRateDeltaPercent: number;
  } | null;
}

export interface PulseFunnelAnalyticsResult {
  funnelId: string;
  funnelName: string;
  workspaceId: string;
  siteId?: string;
  period: 'today' | '7d' | '30d' | 'all' | 'custom';
  timeWindowHours: number;
  totalEntrants: number;
  totalCompleted: number;
  overallConversionRate: number;
  overallDropoffCount: number;
  overallDropoffRate: number;
  steps: PulseFunnelStepAnalytics[];
  previousPeriodComparison?: {
    totalEntrants: number;
    totalCompleted: number;
    overallConversionRate: number;
    overallConversionRateDelta: number;
    entrantsDeltaPercent: number;
    completedDeltaPercent: number;
  } | null;
  computedAt: string;
}

export type PulseSegmentRuleField =
  | 'product_views_count'
  | 'has_cart_without_purchase'
  | 'cart_value'
  | 'visit_count'
  | 'has_checkout_abandoned'
  | 'has_purchase_completed'
  | 'days_since_last_visit'
  | 'visited_page'
  | 'total_spent'
  | 'has_event'
  | 'event_count';

export type PulseSegmentRuleOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'greater_than_or_equal'
  | 'less_than'
  | 'less_than_or_equal'
  | 'contains';

export interface PulseSegmentRule {
  id?: string;
  field: PulseSegmentRuleField;
  operator: PulseSegmentRuleOperator;
  value: any;
  eventType?: PulseEventType;
  pageUrlPattern?: string;
  timeWindowDays?: number; // e.g. within last 7 days
}

export interface PulseSegmentEvaluationResult {
  segmentId: string;
  workspaceId: string;
  name: string;
  memberVisitorIds: string[];
  memberCustomerIds: string[];
  memberCount: number;
  identifiedCount: number;
  evaluatedAt: string;
  membershipChanges?: {
    enteredVisitorIds: string[];
    exitedVisitorIds: string[];
    enteredCustomerIds: string[];
    exitedCustomerIds: string[];
  };
}

export interface PulseSegment {
  id: string;
  workspaceId: string;
  siteId?: string;
  name: string;
  description?: string;
  color?: string;
  rules: PulseSegmentRule[];
  matchType: 'ALL' | 'ANY';
  memberCount?: number;
  memberVisitorIds?: string[];
  memberCustomerIds?: string[];
  lastEvaluatedAt?: string;
  syncCustomerTags?: boolean;
  crmTag?: string;
  autoTriggerAutomations?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PulseConsentRecord {
  id: string;
  workspaceId: string;
  visitorId: string;
  customerId?: string;
  analyticsConsent: boolean;
  marketingConsent: boolean;
  consentSource: 'cookie_banner' | 'form' | 'api' | 'manual';
  consentTimestamp: string;
  ipAnonymized: boolean;
  suppressionStatus?: {
    emailOptOut?: boolean;
    whatsappOptOut?: boolean;
    smsOptOut?: boolean;
    optedOutAt?: string;
  };
}

export interface PulseTrackingSettings {
  workspaceId: string;
  retentionDays: number; // e.g. 90, 180, 365
  anonymizeIp: boolean;
  filterKnownBots: boolean;
  excludedUrls: string[];
  trackOutboundLinks: boolean;
  sessionTimeoutMinutes: number; // e.g. 30
  updatedAt: string;
}

