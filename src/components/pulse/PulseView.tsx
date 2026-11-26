'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  Globe,
  ShoppingBag,
  ShoppingCart,
  Users,
  Layers,
  List,
  Filter,
  ShieldCheck,
  Sliders,
  Zap,
  Mail,
  Copy,
  Check,
  RefreshCw,
  Plus,
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  CreditCard,
  Eye,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Search,
  Code,
  Smartphone,
  Monitor,
  Tablet,
  MapPin,
  Clock,
  Compass,
  Tag,
  Trash2,
  Play,
  Edit2,
} from 'lucide-react';
import { Workspace, Customer, TeamMember } from '@/types/crm';
import {
  PulseWebsite,
  PulseEcommerceIntegration,
  PulseEvent,
  PulseVisitorSession,
  PulseFunnel,
  PulseFunnelAnalyticsResult,
  PulseSegment,
  PulseSegmentRule,
  PulseConsentRecord,
  PulseTrackingSettings,
} from '@/types/pulse';
import { formatCurrency } from '@/lib/financial';
import { formatDateTime } from '@/lib/dateTime';

interface PulseViewProps {
  workspace: Workspace;
  customers?: Customer[];
  members?: TeamMember[];
}

type SubTab =
  | 'overview'
  | 'live'
  | 'websites'
  | 'integrations'
  | 'events'
  | 'journeys'
  | 'funnels'
  | 'segments'
  | 'ecommerce'
  | 'email_analytics'
  | 'triggers'
  | 'consent'
  | 'settings';

export default function PulseView({ workspace, customers = [], members = [] }: PulseViewProps) {
  const [activeTab, setActiveTab] = useState<SubTab>('overview');
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | '7d' | '30d' | 'all'>('30d');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Loaded Data
  const [overviewData, setOverviewData] = useState<any>(null);
  const [websites, setWebsites] = useState<PulseWebsite[]>([]);
  const [integrations, setIntegrations] = useState<PulseEcommerceIntegration[]>([]);
  const [events, setEvents] = useState<PulseEvent[]>([]);
  const [sessions, setSessions] = useState<PulseVisitorSession[]>([]);
  const [funnels, setFunnels] = useState<PulseFunnel[]>([]);
  const [funnelAnalytics, setFunnelAnalytics] = useState<PulseFunnelAnalyticsResult[]>([]);
  const [segments, setSegments] = useState<PulseSegment[]>([]);
  const [consentRecords, setConsentRecords] = useState<PulseConsentRecord[]>([]);
  const [trackingSettings, setTrackingSettings] = useState<PulseTrackingSettings | null>(null);

  // Filter & Search states
  const [eventSearch, setEventSearch] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('all');
  const [selectedVisitorId, setSelectedVisitorId] = useState<string | null>(null);

  // New Website Modal State
  const [isAddWebsiteOpen, setIsAddWebsiteOpen] = useState(false);
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteDomain, setNewSiteDomain] = useState('');
  const [newSiteEcommerce, setNewSiteEcommerce] = useState<'none' | 'shopify' | 'woocommerce'>('none');
  const [isSavingSite, setIsSavingSite] = useState(false);

  // Edit Website Modal State
  const [editingWebsite, setEditingWebsite] = useState<PulseWebsite | null>(null);
  const [editName, setEditName] = useState('');
  const [editDomain, setEditDomain] = useState('');
  const [editWhitelistedDomains, setEditWhitelistedDomains] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'unverified' | 'paused' | 'archived'>('active');
  const [editEcommercePlatform, setEditEcommercePlatform] = useState<'none' | 'shopify' | 'woocommerce' | 'custom'>('none');
  const [editWebhookSecret, setEditWebhookSecret] = useState('');
  const [editStoreUrl, setEditStoreUrl] = useState('');
  const [editShopDomain, setEditShopDomain] = useState('');
  const [editAutoSyncOrders, setEditAutoSyncOrders] = useState(true);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editErrorMessage, setEditErrorMessage] = useState('');

  // Website Installation Guide & Verification State
  const [installGuideWebsite, setInstallGuideWebsite] = useState<PulseWebsite | null>(null);
  const [activePlatformTab, setActivePlatformTab] = useState<'html' | 'react' | 'nextjs' | 'wordpress' | 'custom_js'>('html');
  const [verifyingSiteId, setVerifyingSiteId] = useState<string | null>(null);
  const [verificationResults, setVerificationResults] = useState<Record<string, any>>({});
  const [isSendingTestEvent, setIsSendingTestEvent] = useState(false);
  const [testEventFeedback, setTestEventFeedback] = useState<string | null>(null);

  // Segment Modal and Evaluation State
  const [isAddSegmentOpen, setIsAddSegmentOpen] = useState(false);
  const [isEvaluatingSegments, setIsEvaluatingSegments] = useState(false);
  const [newSegName, setNewSegName] = useState('');
  const [newSegDescription, setNewSegDescription] = useState('');
  const [newSegColor, setNewSegColor] = useState('#06B6D4');
  const [newSegMatchType, setNewSegMatchType] = useState<'ALL' | 'ANY'>('ALL');
  const [newSegCrmTag, setNewSegCrmTag] = useState('');
  const [newSegSyncTags, setNewSegSyncTags] = useState(true);
  const [newSegRules, setNewSegRules] = useState<PulseSegmentRule[]>([
    { field: 'has_cart_without_purchase', operator: 'equals', value: true },
  ]);
  const [isSavingSegment, setIsSavingSegment] = useState(false);

  // Load pulse data
  const loadData = async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const res = await fetch(`/api/pulse/v1/overview?workspaceId=${workspace.id}&period=${selectedPeriod}`);
      if (res.ok) {
        const data = await res.json();
        setOverviewData(data.overview);
        setWebsites(data.websites || []);
        setIntegrations(data.integrations || []);
        setEvents(data.events || []);
        setSessions(data.sessions || []);
        setFunnels(data.funnels || []);
        setFunnelAnalytics(data.funnelAnalytics || []);
        setSegments(data.segments || []);
        setConsentRecords(data.consentRecords || []);
        setTrackingSettings(data.settings || null);
      }
    } catch (err) {
      console.error('Failed to load Pulse data:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleEvaluateSegment = async (segmentId: string) => {
    setIsEvaluatingSegments(true);
    try {
      const res = await fetch(`/api/pulse/v1/segments?workspaceId=${workspace.id}&action=evaluate&id=${segmentId}`, {
        method: 'POST',
      });
      if (res.ok) {
        await loadData(true);
      }
    } catch (err) {
      console.error('Failed to evaluate segment:', err);
    } finally {
      setIsEvaluatingSegments(false);
    }
  };

  const handleEvaluateAllSegments = async () => {
    setIsEvaluatingSegments(true);
    try {
      const res = await fetch(`/api/pulse/v1/segments?workspaceId=${workspace.id}&action=evaluate`, {
        method: 'POST',
      });
      if (res.ok) {
        await loadData(true);
      }
    } catch (err) {
      console.error('Failed to evaluate segments:', err);
    } finally {
      setIsEvaluatingSegments(false);
    }
  };

  const handleDeleteSegment = async (segmentId: string) => {
    if (!confirm('Are you sure you want to delete this segment?')) return;
    try {
      const res = await fetch(`/api/pulse/v1/segments?workspaceId=${workspace.id}&id=${segmentId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setSegments((prev) => prev.filter((s) => s.id !== segmentId));
      }
    } catch (err) {
      console.error('Failed to delete segment:', err);
    }
  };

  const handleSaveSegment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSegName.trim() || newSegRules.length === 0) return;
    setIsSavingSegment(true);
    try {
      const res = await fetch(`/api/pulse/v1/segments?workspaceId=${workspace.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSegName.trim(),
          description: newSegDescription.trim(),
          color: newSegColor,
          matchType: newSegMatchType,
          crmTag: newSegCrmTag.trim() || undefined,
          syncCustomerTags: newSegSyncTags,
          rules: newSegRules,
        }),
      });
      if (res.ok) {
        setIsAddSegmentOpen(false);
        setNewSegName('');
        setNewSegDescription('');
        setNewSegCrmTag('');
        setNewSegRules([{ field: 'has_cart_without_purchase', operator: 'equals', value: true }]);
        await loadData(true);
      }
    } catch (err) {
      console.error('Failed to save segment:', err);
    } finally {
      setIsSavingSegment(false);
    }
  };

  const formatRuleDescription = (rule: PulseSegmentRule): string => {
    const opMap: Record<string, string> = {
      equals: '=',
      not_equals: '≠',
      greater_than: '>',
      greater_than_or_equal: '≥',
      less_than: '<',
      less_than_or_equal: '≤',
      contains: 'contains',
    };
    const op = opMap[rule.operator] || rule.operator;
    const windowStr = rule.timeWindowDays ? ` (last ${rule.timeWindowDays}d)` : '';

    switch (rule.field) {
      case 'product_views_count':
        return `Product Views ${op} ${rule.value}${windowStr}`;
      case 'has_cart_without_purchase':
        return `Cart without Purchase = ${rule.value}${windowStr}`;
      case 'cart_value':
        return `Cart Value ${op} ₹${Number(rule.value).toLocaleString('en-IN')}`;
      case 'visit_count':
        return `Visits ${op} ${rule.value}${windowStr}`;
      case 'has_checkout_abandoned':
        return `Checkout Abandoned = ${rule.value}${windowStr}`;
      case 'has_purchase_completed':
        return typeof rule.value === 'number'
          ? `Purchases ${op} ${rule.value}${windowStr}`
          : `Completed Purchase = ${rule.value}${windowStr}`;
      case 'days_since_last_visit':
        return `Last Visit ${op} ${rule.value} day(s) ago`;
      case 'visited_page':
        return `Visited Page ${op} "${rule.value}"`;
      case 'total_spent':
        return `Total Spent ${op} ₹${Number(rule.value).toLocaleString('en-IN')}`;
      case 'has_event':
        return `Has Event ${rule.value || rule.eventType}`;
      case 'event_count':
        return `Event Count (${rule.eventType || 'all'}) ${op} ${rule.value}${windowStr}`;
      default:
        return `${rule.field} ${op} ${rule.value}`;
    }
  };

  useEffect(() => {
    loadData();
  }, [workspace.id, selectedPeriod]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleCreateWebsite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSiteName.trim() || !newSiteDomain.trim()) return;

    setIsSavingSite(true);
    try {
      const res = await fetch('/api/pulse/v1/websites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace.id,
          name: newSiteName.trim(),
          domain: newSiteDomain.trim(),
          ecommercePlatform: newSiteEcommerce,
        }),
      });

      if (res.ok) {
        const createdSite: PulseWebsite = await res.json();
        setIsAddWebsiteOpen(false);
        setNewSiteName('');
        setNewSiteDomain('');
        setNewSiteEcommerce('none');
        await loadData();
        // Immediately present the generated tracking snippet and platform setup instructions
        setInstallGuideWebsite(createdSite);
        setActivePlatformTab('html');
      }
    } catch (err) {
      console.error('Failed to create website:', err);
    } finally {
      setIsSavingSite(false);
    }
  };

  const getWebsiteStatus = (site: PulseWebsite) => {
    const vResult = verificationResults[site.id];
    if (vResult) {
      if (vResult.status === 'connected') {
        return {
          status: 'connected' as const,
          label: 'Connected',
          badgeClass: 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20',
          dotClass: 'bg-emerald-500 animate-pulse',
        };
      }
      if (vResult.status === 'waiting_for_first_event') {
        return {
          status: 'waiting_for_first_event' as const,
          label: 'Waiting for First Event',
          badgeClass: 'bg-amber-500/10 text-amber-600 border border-amber-500/20',
          dotClass: 'bg-amber-500',
        };
      }
      if (vResult.status === 'verification_failed') {
        return {
          status: 'verification_failed' as const,
          label: 'Verification Failed',
          badgeClass: 'bg-rose-500/10 text-rose-600 border border-rose-500/20',
          dotClass: 'bg-rose-500',
        };
      }
      return {
        status: 'not_installed' as const,
        label: 'Not Installed',
        badgeClass: 'bg-slate-500/10 text-slate-600 border border-slate-500/20',
        dotClass: 'bg-slate-400',
      };
    }

    if (site.snippetInstalled && (site.eventsCountTotal > 0 || site.lastPingAt)) {
      return {
        status: 'connected' as const,
        label: 'Connected',
        badgeClass: 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20',
        dotClass: 'bg-emerald-500 animate-pulse',
      };
    }

    if (site.status === 'unverified' || (!site.snippetInstalled && (site.eventsCountTotal || 0) === 0)) {
      return {
        status: 'not_installed' as const,
        label: 'Not Installed',
        badgeClass: 'bg-slate-500/10 text-slate-600 border border-slate-500/20',
        dotClass: 'bg-slate-400',
      };
    }

    return {
      status: 'waiting_for_first_event' as const,
      label: 'Waiting for First Event',
      badgeClass: 'bg-amber-500/10 text-amber-600 border border-amber-500/20',
      dotClass: 'bg-amber-500',
    };
  };

  const handleVerifyWebsite = async (site: PulseWebsite, probe = true) => {
    setVerifyingSiteId(site.id);
    setTestEventFeedback(null);
    try {
      const res = await fetch(
        `/api/pulse/v1/websites/${site.id}/verify?workspaceId=${workspace.id}&probe=${probe ? 'true' : 'false'}`
      );
      const data = await res.json();
      setVerificationResults((prev) => ({ ...prev, [site.id]: data }));
      await loadData();
    } catch (err: any) {
      setVerificationResults((prev) => ({
        ...prev,
        [site.id]: {
          status: 'verification_failed',
          statusLabel: 'Verification Failed',
          checks: { siteRegistered: true, scriptLoading: false, validRequestReceived: false, workspaceMatched: true },
          message: err.message || 'Verification check failed',
        },
      }));
    } finally {
      setVerifyingSiteId(null);
    }
  };

  const handleSendTestEvent = async (site: PulseWebsite) => {
    setIsSendingTestEvent(true);
    setTestEventFeedback(null);
    try {
      const res = await fetch('/api/pulse/v1/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: site.siteId,
          type: 'page_view',
          name: 'Verification Test Page View',
          url: `https://${site.domain}/?utm_source=pulse_verifier&t=${Date.now()}`,
          path: '/',
          title: `${site.name} — Test Ping`,
          properties: {
            probe: true,
            source: 'installation_tester',
          },
        }),
      });

      if (res.ok) {
        setTestEventFeedback('Test page-view event transmitted successfully! Re-checking verification status...');
        await handleVerifyWebsite(site, false);
        await loadData();
      } else {
        const errJson = await res.json().catch(() => ({}));
        setTestEventFeedback(`Test event failed: ${errJson.error || 'Server rejected event'}`);
      }
    } catch (err: any) {
      setTestEventFeedback(`Network error: ${err.message}`);
    } finally {
      setIsSendingTestEvent(false);
    }
  };

  const getSnippetsForSite = (site: PulseWebsite) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://developster-crm.com';
    const scriptUrl = `${origin}/pulse.js`;

    const htmlSnippet = `<!-- Developster Pulse — Universal Website Tracking -->
<script
  src="${scriptUrl}"
  data-site-id="${site.siteId}"
  async
></script>`;

    const reactSnippet = `// Option A: Add to your public/index.html inside <head>:
<script
  src="${scriptUrl}"
  data-site-id="${site.siteId}"
  async
></script>

// Option B: React Route Tracker (App.tsx or usePulse.ts for SPA route navigation)
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export function usePulseRouteTracker() {
  const location = useLocation();

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).DevelopsterPulse) {
      (window as any).DevelopsterPulse.pageView({ path: location.pathname });
    }
  }, [location]);
}`;

    const nextjsSnippet = `// app/layout.tsx (Next.js 13+ App Router)
import Script from 'next/script';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Script
          src="${scriptUrl}"
          data-site-id="${site.siteId}"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}`;

    const wordpressSnippet = `// Add to your active theme's functions.php or via WPCode header plugin:
add_action('wp_head', function () {
    ?>
    <!-- Developster Pulse Tracking -->
    <script
      src="${scriptUrl}"
      data-site-id="${site.siteId}"
      async
    ></script>
    <?php
});`;

    const customJsSnippet = `<!-- 1. Universal Script Tag (Paste in Header or before </body>) -->
<script
  src="${scriptUrl}"
  data-site-id="${site.siteId}"
  async
></script>

<!-- 2. Track Custom Goals, Buttons & Form Submissions -->
<script>
  // Track button clicks or milestone events:
  window.DevelopsterPulse?.custom('cta_clicked', { button: 'Get Started' });

  // Track lead forms and automatically associate with CRM contacts:
  window.DevelopsterPulse?.submitForm({
    formName: 'Inquiry Form',
    email: 'visitor@example.com',
    name: 'Customer Name'
  });
</script>`;

    return {
      scriptUrl,
      htmlSnippet,
      reactSnippet,
      nextjsSnippet,
      wordpressSnippet,
      customJsSnippet,
    };
  };

  const openEditModal = (site: PulseWebsite) => {
    setEditingWebsite(site);
    setEditName(site.name);
    setEditDomain(site.domain);
    setEditWhitelistedDomains((site.whitelistedDomains || []).join(', '));
    setEditStatus(site.status || 'active');
    setEditEcommercePlatform(site.ecommercePlatform || 'none');
    const integ = integrations.find((i) => i.platform === site.ecommercePlatform);
    setEditWebhookSecret(''); // Kept empty so user can leave unchanged
    setEditStoreUrl(integ?.storeUrl || '');
    setEditShopDomain(integ?.shopDomain || '');
    setEditAutoSyncOrders(integ?.autoSyncOrders ?? true);
    setEditErrorMessage('');
  };

  const handleUpdateWebsite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWebsite) return;
    setIsSavingEdit(true);
    setEditErrorMessage('');

    try {
      const parsedWhitelist = editWhitelistedDomains
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean);

      const payload: any = {
        workspaceId: workspace.id,
        name: editName.trim(),
        domain: editDomain.trim(),
        whitelistedDomains: parsedWhitelist.length > 0 ? parsedWhitelist : [editDomain.trim()],
        status: editStatus,
        ecommercePlatform: editEcommercePlatform,
      };

      if (editEcommercePlatform && editEcommercePlatform !== 'none') {
        payload.integration = {
          platform: editEcommercePlatform,
          name: `${editName.trim()} ${editEcommercePlatform.toUpperCase()}`,
          storeUrl: editStoreUrl.trim(),
          shopDomain: editShopDomain.trim() || undefined,
          autoSyncOrders: editAutoSyncOrders,
        };
        if (editWebhookSecret.trim()) {
          payload.integration.webhookSecret = editWebhookSecret.trim();
        }
      }

      const res = await fetch(`/api/pulse/v1/websites/${editingWebsite.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setEditingWebsite(null);
        loadData();
      } else {
        const data = await res.json();
        setEditErrorMessage(data.error || 'Failed to update website');
      }
    } catch (err: any) {
      setEditErrorMessage(err.message || 'Error updating website');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Filtered Events
  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      const matchesType = eventTypeFilter === 'all' || e.type === eventTypeFilter;
      const q = eventSearch.toLowerCase();
      const matchesSearch =
        !q ||
        e.name.toLowerCase().includes(q) ||
        (e.url && e.url.toLowerCase().includes(q)) ||
        e.visitorId.toLowerCase().includes(q) ||
        (e.identities?.email && e.identities.email.toLowerCase().includes(q));
      return matchesType && matchesSearch;
    });
  }, [events, eventTypeFilter, eventSearch]);

  const activeWebsite = websites[0];
  const snippetCode = activeWebsite
    ? `<!-- Developster Pulse Tracking Code -->\n<script async src="${typeof window !== 'undefined' ? window.location.origin : ''}/pulse.js" data-site-id="${activeWebsite.siteId}"></script>`
    : '<!-- Register a website below to obtain your unique snippet -->';

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 max-w-7xl mx-auto w-full space-y-6">
      {/* 1. Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[var(--border-subtle)]">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black tracking-tight text-[var(--text-ink)]">Developster Pulse</h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-600 border border-cyan-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
              Live Visitor Intelligence
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Privacy-compliant website analytics, customer behavioural journeys & server-verified ecommerce tracking.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Date Range Selector */}
          <div className="flex items-center p-0.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-xs font-semibold">
            {[
              { id: 'today', label: 'Today' },
              { id: '7d', label: '7 Days' },
              { id: '30d', label: '30 Days' },
              { id: 'all', label: 'All Time' },
            ].map((p) => {
              const isSelected = selectedPeriod === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedPeriod(p.id as any)}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[var(--bg-card)] text-[var(--text-ink)] shadow-2xs'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-ink)]'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => loadData(true)}
            disabled={isRefreshing}
            className="px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-main)] text-xs font-medium text-[var(--text-ink)] flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setIsAddWebsiteOpen(true)}
            className="px-3.5 py-1.5 rounded-xl bg-[var(--text-ink)] hover:opacity-90 text-[var(--bg-card)] text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Website
          </button>
        </div>
      </div>

      {/* 2. Sub-Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-b border-[var(--border-subtle)]">
        {[
          { id: 'overview', label: 'Overview', icon: TrendingUp },
          { id: 'live', label: 'Live Feed', icon: Activity },
          { id: 'websites', label: 'Websites', icon: Globe },
          { id: 'integrations', label: 'Integrations', icon: Layers },
          { id: 'events', label: 'Event Log', icon: List },
          { id: 'journeys', label: 'Customer Journeys', icon: Compass },
          { id: 'funnels', label: 'Funnels', icon: Filter },
          { id: 'segments', label: 'Segments', icon: Users },
          { id: 'ecommerce', label: 'Ecommerce', icon: ShoppingBag },
          { id: 'email_analytics', label: 'Email Tracking', icon: Mail },
          { id: 'triggers', label: 'Automations', icon: Zap },
          { id: 'consent', label: 'DPDP & Consent', icon: ShieldCheck },
          { id: 'settings', label: 'Settings', icon: Sliders },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as SubTab)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-2 transition-all cursor-pointer ${
                isActive
                  ? 'bg-[var(--text-ink)] text-[var(--bg-card)] shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-ink)] hover:bg-[var(--bg-card)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 3. Tab Contents */}

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-muted)] font-medium">Total Sessions</span>
                {overviewData?.deltas?.sessions && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      overviewData.deltas.sessions.isPositive
                        ? 'bg-emerald-500/10 text-emerald-600'
                        : 'bg-rose-500/10 text-rose-600'
                    }`}
                  >
                    {overviewData.deltas.sessions.isPositive ? '+' : ''}
                    {overviewData.deltas.sessions.percent}%
                  </span>
                )}
              </div>
              <div className="text-2xl font-black text-[var(--text-ink)] mt-1.5">
                {overviewData?.totalSessions?.toLocaleString() || 0}
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-[11px] text-[var(--text-muted)]">
                <span>Unique:</span>
                <strong className="text-[var(--text-ink)] font-semibold">{overviewData?.uniqueVisitors || 0}</strong>
              </div>
            </div>

            <div className="card p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-muted)] font-medium">Page Views</span>
                {overviewData?.deltas?.pageViews && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      overviewData.deltas.pageViews.isPositive
                        ? 'bg-emerald-500/10 text-emerald-600'
                        : 'bg-rose-500/10 text-rose-600'
                    }`}
                  >
                    {overviewData.deltas.pageViews.isPositive ? '+' : ''}
                    {overviewData.deltas.pageViews.percent}%
                  </span>
                )}
              </div>
              <div className="text-2xl font-black text-cyan-600 mt-1.5">
                {overviewData?.pageViews?.toLocaleString() || 0}
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-[11px] text-[var(--text-muted)]">
                <span>Identified:</span>
                <strong className="text-emerald-600 font-semibold">{overviewData?.identifiedVisitors || 0}</strong>
              </div>
            </div>

            <div className="card p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-muted)] font-medium">Completed Purchases</span>
                {overviewData?.deltas?.purchases && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      overviewData.deltas.purchases.isPositive
                        ? 'bg-emerald-500/10 text-emerald-600'
                        : 'bg-rose-500/10 text-rose-600'
                    }`}
                  >
                    {overviewData.deltas.purchases.isPositive ? '+' : ''}
                    {overviewData.deltas.purchases.percent}%
                  </span>
                )}
              </div>
              <div className="text-2xl font-black text-emerald-600 mt-1.5">
                {overviewData?.completedPurchases || 0}
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-[11px] text-[var(--text-muted)]">
                <span>Conversion rate:</span>
                <strong className="text-[var(--text-ink)] font-semibold">{overviewData?.conversionRate || '0.0'}%</strong>
              </div>
            </div>

            <div className="card p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-muted)] font-medium">Total Revenue</span>
                {overviewData?.deltas?.revenue && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      overviewData.deltas.revenue.isPositive
                        ? 'bg-emerald-500/10 text-emerald-600'
                        : 'bg-rose-500/10 text-rose-600'
                    }`}
                  >
                    {overviewData.deltas.revenue.isPositive ? '+' : ''}
                    {overviewData.deltas.revenue.percent}%
                  </span>
                )}
              </div>
              <div className="text-2xl font-black text-[var(--text-ink)] mt-1.5">
                {overviewData?.primaryCurrency || 'INR'} {(overviewData?.totalRevenue || 0).toLocaleString('en-IN')}
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-[11px] text-amber-600">
                <span>Observed Abandoned:</span>
                <strong className="font-semibold">{overviewData?.abandonedCheckouts || 0}</strong>
              </div>
            </div>
          </div>

          {/* Predictive Model & Forecast Evaluation Banner */}
          {overviewData?.forecastEvaluation && (
            <div className={`p-4 rounded-2xl border ${
              overviewData.forecastEvaluation.status === 'VALIDATED_AGAINST_BASELINE'
                ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-900'
                : 'bg-amber-500/5 border-amber-500/20 text-amber-900'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    overviewData.forecastEvaluation.status === 'VALIDATED_AGAINST_BASELINE'
                      ? 'bg-emerald-500/10 text-emerald-600'
                      : 'bg-amber-500/10 text-amber-600'
                  }`}>
                    {overviewData.forecastEvaluation.status === 'VALIDATED_AGAINST_BASELINE' ? 'Validated Against Baseline (Holdout Only)' : 'Forecast Withheld'}
                  </span>
                  <span className="text-xs font-semibold">
                    {overviewData.forecastEvaluation.status === 'VALIDATED_AGAINST_BASELINE'
                      ? `7-Day Trend Model (Outperformed ${overviewData.forecastEvaluation.strongestBaseline || 'Baseline'} on ${overviewData.forecastEvaluation.testDaysCount || 7}-Day Holdout)`
                      : 'Predictive Projections Guardrail Active'}
                  </span>
                </div>
                <span className="text-[11px] text-[var(--text-muted)] font-mono">
                  Holdout: {overviewData.forecastEvaluation.testDaysCount || 7}d | Observations: {overviewData.forecastEvaluation.validObservationsCount || overviewData.forecastEvaluation.historicalDaysCount} / 28 Required
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-2 leading-relaxed">
                {overviewData.forecastEvaluation.explanation}
              </p>
              {overviewData.forecastEvaluation.status === 'VALIDATED_AGAINST_BASELINE' && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 pt-3 border-t border-emerald-500/10 text-xs">
                    <div>
                      <span className="text-[10px] text-[var(--text-muted)] block">Proposed MAE</span>
                      <strong className="font-bold text-emerald-700">{overviewData.forecastEvaluation.proposedMae}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-[var(--text-muted)] block">Baseline MAE ({overviewData.forecastEvaluation.strongestBaseline})</span>
                      <strong className="font-bold text-[var(--text-ink)]">{overviewData.forecastEvaluation.baselineMae}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-[var(--text-muted)] block">Proposed WAPE</span>
                      <strong className="font-bold text-emerald-700">{overviewData.forecastEvaluation.proposedWape !== null ? `${overviewData.forecastEvaluation.proposedWape}%` : 'N/A'}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-[var(--text-muted)] block">Baseline WAPE</span>
                      <strong className="font-bold text-[var(--text-ink)]">{overviewData.forecastEvaluation.baselineWape !== null ? `${overviewData.forecastEvaluation.baselineWape}%` : 'N/A'}</strong>
                    </div>
                  </div>
                  <div className="mt-2.5 text-[10px] text-[var(--text-muted)] italic">
                    * Scope: Baseline outperformance applies solely to the tested {overviewData.forecastEvaluation.testDaysCount || 7}-day holdout window. This does not establish general predictive reliability, nor does it constitute statistical validation.
                  </div>
                </>
              )}
            </div>
          )}

          {/* Actionable Business Intelligence Cards */}
          {overviewData?.actionableInsights?.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {overviewData.actionableInsights.map((insight: any) => (
                <div
                  key={insight.id}
                  className="card p-4 rounded-2xl bg-[var(--bg-card)] border border-amber-500/30 shadow-2xs space-y-1.5"
                >
                  <div className="flex items-center gap-2 text-amber-700">
                    <Zap className="w-4 h-4 text-amber-500" />
                    <h4 className="text-xs font-bold uppercase tracking-wide">{insight.title}</h4>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">{insight.description}</p>
                  {insight.actionText && (
                    <span className="text-[11px] font-semibold text-cyan-600 hover:underline block pt-1 cursor-pointer">
                      → {insight.actionText}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Quick Snippet Banner */}
          {activeWebsite && (
            <div className="card p-4 rounded-2xl bg-[var(--bg-card)] border border-cyan-500/20 shadow-2xs">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Code className="w-4 h-4 text-cyan-600" />
                    <h3 className="text-xs font-bold text-[var(--text-ink)] uppercase tracking-wide">
                      Active Website Tracking Snippet ({activeWebsite.name})
                    </h3>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    Paste this non-blocking tag into your website's <code className="text-cyan-600 font-mono">&lt;head&gt;</code> tag to begin automatic intelligence capture.
                  </p>
                </div>
                <button
                  onClick={() => copyToClipboard(snippetCode, 'quick-snippet')}
                  className="px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors shadow-2xs cursor-pointer"
                >
                  {copiedKey === 'quick-snippet' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedKey === 'quick-snippet' ? 'Copied Tag' : 'Copy Tag'}
                </button>
              </div>
              <pre className="mt-3 p-3 rounded-xl bg-[var(--bg-main)] text-[11px] font-mono text-[var(--text-muted)] overflow-x-auto border border-[var(--border-subtle)]">
                {snippetCode}
              </pre>
            </div>
          )}

          {/* Top Pages and Top Products */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xs">
              <h3 className="text-sm font-bold text-[var(--text-ink)] mb-3 flex items-center gap-2">
                <Globe className="w-4 h-4 text-indigo-500" />
                Top Visited Pages
              </h3>
              {overviewData?.topPages?.length > 0 ? (
                <div className="space-y-2.5">
                  {overviewData.topPages.map((pg: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)]">
                      <span className="font-mono text-[var(--text-ink)] truncate max-w-[70%]">{pg.path}</span>
                      <span className="font-bold text-[var(--text-ink)] px-2 py-0.5 rounded-md bg-[var(--bg-card)]">
                        {pg.count} views
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-[var(--text-muted)]">No page views recorded yet.</div>
              )}
            </div>

            <div className="card p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xs">
              <h3 className="text-sm font-bold text-[var(--text-ink)] mb-3 flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-emerald-500" />
                Top Products
              </h3>
              {overviewData?.topProducts?.length > 0 ? (
                <div className="space-y-2.5">
                  {overviewData.topProducts.map((prod: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)]">
                      <span className="font-semibold text-[var(--text-ink)] truncate max-w-[60%]">{prod.name}</span>
                      <div className="text-right">
                        <span className="font-bold text-[var(--text-ink)]">{prod.count} units</span>
                        {prod.revenue > 0 && (
                          <span className="text-[11px] text-emerald-600 block">₹{prod.revenue.toLocaleString('en-IN')}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-[var(--text-muted)]">No product activity recorded yet.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: LIVE STREAM FEED */}
      {activeTab === 'live' && (
        <div className="card p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <h3 className="text-sm font-bold text-[var(--text-ink)]">Real-Time Event Stream</h3>
            </div>
            <span className="text-xs text-[var(--text-muted)]">Auto-refreshed from active sessions</span>
          </div>

          {events.length === 0 ? (
            <div className="py-16 text-center text-xs text-[var(--text-muted)]">
              Waiting for live incoming visitor signals...
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {events.slice(0, 25).map((ev) => (
                <div key={ev.id} className="py-3 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div
                      className={`p-2 rounded-xl mt-0.5 ${
                        ev.type === 'purchase_completed'
                          ? 'bg-emerald-500/10 text-emerald-600'
                          : ev.type === 'checkout_started' || ev.type === 'item_added_to_cart'
                          ? 'bg-amber-500/10 text-amber-600'
                          : ev.type === 'product_viewed'
                          ? 'bg-indigo-500/10 text-indigo-600'
                          : 'bg-cyan-500/10 text-cyan-600'
                      }`}
                    >
                      {ev.type === 'purchase_completed' ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : ev.type === 'checkout_started' || ev.type === 'item_added_to_cart' ? (
                        <ShoppingCart className="w-4 h-4" />
                      ) : ev.type === 'product_viewed' ? (
                        <ShoppingBag className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[var(--text-ink)]">{ev.name}</span>
                        <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[var(--bg-main)] text-[var(--text-muted)]">
                          {ev.source}
                        </span>
                        {ev.identities?.email && (
                          <span className="text-[11px] font-semibold text-emerald-600 px-2 py-0.5 rounded-full bg-emerald-500/10">
                            {ev.identities.email}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-[var(--text-muted)] mt-1">
                        <span className="font-mono">{ev.path || ev.url || 'Direct'}</span>
                        {ev.device?.type && (
                          <span className="capitalize">· {ev.device.type}</span>
                        )}
                        {ev.geo?.country && <span>· {ev.geo.country}</span>}
                      </div>
                    </div>
                  </div>
                  <span className="text-[11px] text-[var(--text-muted)] whitespace-nowrap font-tabular">
                    {formatDateTime(ev.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: WEBSITES MANAGEMENT & UNIVERSAL TRACKING */}
      {activeTab === 'websites' && (
        <div className="space-y-6">
          {/* Universal Tracking vs E-commerce Explanation Banner */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-500/10 via-sky-500/5 to-transparent border border-cyan-500/20 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-cyan-600" />
                <h3 className="text-sm font-bold text-[var(--text-ink)]">Universal Website Tracking</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/15 text-cyan-700">
                  Privacy-First · Zero Cookies
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] max-w-2xl leading-relaxed">
                Connect any custom-coded website, React SPA, Next.js application, WordPress blog, Webflow site, or plain HTML page. Universal tracking captures visitor sessions, page views, and custom milestones independently of e-commerce platforms.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setIsAddWebsiteOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-[var(--text-ink)] text-[var(--bg-card)] text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs hover:opacity-90 transition-opacity"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Website
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-[var(--text-ink)]">Registered Websites ({websites.length})</h2>
              <p className="text-xs text-[var(--text-muted)]">
                Manage website tracking snippets, verify live telemetry ingestion, and inspect domain allowlists.
              </p>
            </div>
          </div>

          {websites.length === 0 ? (
            <div className="card p-10 rounded-3xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-600 flex items-center justify-center mx-auto">
                <Globe className="w-6 h-6" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h3 className="text-sm font-bold text-[var(--text-ink)]">No Websites Registered Yet</h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Add your first website to generate an embeddable tracking snippet and start tracking visitor sessions with zero cookies.
                </p>
              </div>
              <button
                onClick={() => setIsAddWebsiteOpen(true)}
                className="px-4 py-2 rounded-xl bg-[var(--text-ink)] text-[var(--bg-card)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Plus className="w-4 h-4" />
                Add Your First Website
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {websites.map((site) => {
                const statusInfo = getWebsiteStatus(site);
                const snippets = getSnippetsForSite(site);
                const isVerifying = verifyingSiteId === site.id;

                return (
                  <div
                    key={site.id}
                    className="card p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xs space-y-4 flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Globe className="w-4 h-4 text-cyan-600 shrink-0" />
                            <h3 className="text-sm font-bold text-[var(--text-ink)] truncate">{site.name}</h3>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1.5 ${statusInfo.badgeClass}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dotClass}`} />
                              {statusInfo.label}
                            </span>
                          </div>
                          <a
                            href={`https://${site.domain}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-[var(--text-muted)] hover:text-cyan-600 flex items-center gap-1 mt-1 font-mono"
                          >
                            <span>{site.domain}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => openEditModal(site)}
                            className="p-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-main)] hover:bg-[var(--bg-card)] text-[var(--text-ink)] text-xs font-semibold cursor-pointer transition-all shadow-2xs"
                            title="Edit Settings"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                          </button>
                          <span className="text-[11px] font-semibold text-[var(--text-ink)] px-2 py-1 rounded-lg bg-[var(--bg-main)]">
                            {site.eventsCountTotal || 0} events
                          </span>
                        </div>
                      </div>

                      {/* Public Site ID */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-semibold text-[var(--text-muted)]">
                            Public Site ID
                          </label>
                          <button
                            onClick={() => copyToClipboard(site.siteId, `site-${site.id}`)}
                            className="text-[10px] font-semibold text-cyan-600 hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            {copiedKey === `site-${site.id}` ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy ID</span>
                              </>
                            )}
                          </button>
                        </div>
                        <input
                          type="text"
                          readOnly
                          value={site.siteId}
                          className="w-full text-xs font-mono p-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[var(--text-ink)]"
                        />
                      </div>

                      {/* Universal Tracking Snippet Preview */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-semibold text-[var(--text-muted)]">
                            Universal Tracking Snippet
                          </label>
                          <button
                            onClick={() => copyToClipboard(snippets.htmlSnippet, `snip-${site.id}`)}
                            className="text-[11px] font-semibold text-cyan-600 hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            {copiedKey === `snip-${site.id}` ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="text-emerald-600">Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy Code</span>
                              </>
                            )}
                          </button>
                        </div>
                        <pre className="p-2.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[10px] font-mono text-[var(--text-muted)] overflow-x-auto select-all">
                          {snippets.htmlSnippet}
                        </pre>
                      </div>

                      {/* Telemetry info */}
                      <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] pt-1">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {site.lastPingAt ? `Last active: ${formatDateTime(site.lastPingAt)}` : 'No telemetry received yet'}
                        </span>
                        <span className="capitalize">
                          {site.ecommercePlatform === 'none' ? 'Universal / Custom' : site.ecommercePlatform}
                        </span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--border-subtle)]">
                      <button
                        onClick={() => {
                          setInstallGuideWebsite(site);
                          setActivePlatformTab('html');
                        }}
                        className="px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] hover:bg-[var(--bg-card)] text-[var(--text-ink)] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                      >
                        <Code className="w-3.5 h-3.5 text-cyan-600" />
                        <span>Installation Guide</span>
                      </button>
                      <button
                        onClick={() => handleVerifyWebsite(site, true)}
                        disabled={isVerifying}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                          statusInfo.status === 'connected'
                            ? 'bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 border border-emerald-500/20'
                            : 'bg-[var(--text-ink)] text-[var(--bg-card)] hover:opacity-90'
                        }`}
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isVerifying ? 'animate-spin' : ''}`} />
                        <span>{isVerifying ? 'Verifying...' : 'Verify Installation'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: INTEGRATIONS (Shopify & WooCommerce) */}
      {activeTab === 'integrations' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-base font-bold text-[var(--text-ink)]">Ecommerce & Webhook Integrations</h2>
            <p className="text-xs text-[var(--text-muted)]">
              Connect authoritative server-side order webhooks from Shopify, WooCommerce, or custom platforms.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Shopify Card */}
            <div className="card p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 font-black text-base">
                    S
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-ink)]">Shopify Store</h3>
                    <span className="text-[11px] text-[var(--text-muted)]">Server-side HMAC Order Ingestion</span>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600">
                  Ready
                </span>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">
                  Webhook Target URL
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/pulse/v1/integrations/shopify/webhook?workspaceId=${workspace.id}`}
                    className="w-full text-xs font-mono p-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[var(--text-ink)]"
                  />
                  <button
                    onClick={() =>
                      copyToClipboard(
                        `${typeof window !== 'undefined' ? window.location.origin : ''}/api/pulse/v1/integrations/shopify/webhook?workspaceId=${workspace.id}`,
                        'shopify-wh'
                      )
                    }
                    className="p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] cursor-pointer"
                  >
                    {copiedKey === 'shopify-wh' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[var(--bg-main)] text-xs text-[var(--text-muted)] space-y-1 border border-[var(--border-subtle)]">
                <span className="font-semibold text-[var(--text-ink)] block">Supported Topics:</span>
                <div>• <code className="text-cyan-600">orders/create</code>, <code className="text-cyan-600">orders/paid</code> (Completed purchases)</div>
                <div>• <code className="text-cyan-600">checkouts/create</code>, <code className="text-cyan-600">checkouts/update</code> (Funnel progression)</div>
              </div>
            </div>

            {/* WooCommerce Card */}
            <div className="card p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-600 font-black text-base">
                    W
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-ink)]">WooCommerce Store</h3>
                    <span className="text-[11px] text-[var(--text-muted)]">REST Webhook Signature Verification</span>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-600">
                  Ready
                </span>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">
                  Webhook Delivery URL
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/pulse/v1/integrations/woocommerce/webhook?workspaceId=${workspace.id}`}
                    className="w-full text-xs font-mono p-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[var(--text-ink)]"
                  />
                  <button
                    onClick={() =>
                      copyToClipboard(
                        `${typeof window !== 'undefined' ? window.location.origin : ''}/api/pulse/v1/integrations/woocommerce/webhook?workspaceId=${workspace.id}`,
                        'wc-wh'
                      )
                    }
                    className="p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] cursor-pointer"
                  >
                    {copiedKey === 'wc-wh' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[var(--bg-main)] text-xs text-[var(--text-muted)] space-y-1 border border-[var(--border-subtle)]">
                <span className="font-semibold text-[var(--text-ink)] block">Supported Topics:</span>
                <div>• <code className="text-purple-600">order.created</code>, <code className="text-purple-600">order.updated</code> (Full order states)</div>
                <div>• <code className="text-purple-600">customer.created</code> (Identity resolution)</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: EVENT LOG */}
      {activeTab === 'events' && (
        <div className="card p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Search event, URL, or visitor..."
                value={eventSearch}
                onChange={(e) => setEventSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-xs text-[var(--text-ink)]"
              />
            </div>

            <select
              value={eventTypeFilter}
              onChange={(e) => setEventTypeFilter(e.target.value)}
              className="w-full sm:w-auto px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-xs text-[var(--text-ink)] font-medium"
            >
              <option value="all">All Event Types</option>
              <option value="page_view">Page View</option>
              <option value="product_viewed">Product Viewed</option>
              <option value="item_added_to_cart">Added to Cart</option>
              <option value="checkout_started">Checkout Started</option>
              <option value="purchase_completed">Purchase Completed</option>
              <option value="form_submitted">Form Submitted</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)] font-semibold">
                  <th className="py-2.5 px-3">Event</th>
                  <th className="py-2.5 px-3">Source</th>
                  <th className="py-2.5 px-3">Path / Details</th>
                  <th className="py-2.5 px-3">Identified Customer</th>
                  <th className="py-2.5 px-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {filteredEvents.map((ev) => (
                  <tr key={ev.id} className="hover:bg-[var(--bg-main)] transition-colors">
                    <td className="py-3 px-3">
                      <span className="font-bold text-[var(--text-ink)] block">{ev.name}</span>
                      <span className="text-[10px] text-[var(--text-muted)] font-mono">{ev.type}</span>
                    </td>
                    <td className="py-3 px-3 uppercase font-mono text-[10px] text-[var(--text-muted)]">
                      {ev.source}
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-mono text-cyan-700 truncate max-w-xs block">
                        {ev.path || ev.url || '—'}
                      </span>
                      {ev.ecommerce?.orderId && (
                        <span className="text-[10px] text-emerald-600 block">
                          Order #{ev.ecommerce.orderId} (₹{(ev.ecommerce.total || 0).toLocaleString('en-IN')})
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      {ev.identities?.email ? (
                        <span className="text-xs font-semibold text-emerald-600">{ev.identities.email}</span>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)] font-mono">
                          {ev.visitorId.slice(0, 12)}...
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-[var(--text-muted)] whitespace-nowrap font-tabular">
                      {formatDateTime(ev.timestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 6: CUSTOMER JOURNEYS */}
      {activeTab === 'journeys' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="card p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xs space-y-2">
            <h3 className="text-xs font-bold text-[var(--text-ink)] uppercase tracking-wide mb-3">
              Visitor Sessions ({sessions.length})
            </h3>
            <div className="space-y-1.5 max-h-[600px] overflow-y-auto">
              {sessions.map((ses) => {
                const isSelected = selectedVisitorId === ses.visitorId;
                return (
                  <div
                    key={ses.id}
                    onClick={() => setSelectedVisitorId(ses.visitorId)}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition-colors ${
                      isSelected
                        ? 'border-cyan-500 bg-cyan-500/10'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-main)] hover:border-[var(--text-muted)]/40'
                    }`}
                  >
                    <div className="flex items-center justify-between font-semibold text-[var(--text-ink)]">
                      <span>{ses.customerId ? `Customer: ${ses.customerId}` : ses.visitorId.slice(0, 16)}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-card)]">
                        {ses.pageViewsCount} views
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] mt-1">
                      <span>{ses.device?.type || 'desktop'}</span>
                      <span className="font-tabular">{formatDateTime(ses.lastSeenAt)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="md:col-span-2 card p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xs">
            <h3 className="text-sm font-bold text-[var(--text-ink)] mb-4 flex items-center gap-2">
              <Compass className="w-4 h-4 text-cyan-600" />
              Chronological Path Flow
            </h3>

            {selectedVisitorId ? (
              <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-[var(--border-subtle)]">
                {events
                  .filter((e) => e.visitorId === selectedVisitorId)
                  .map((ev) => (
                    <div key={ev.id} className="relative">
                      <div className="absolute -left-6 top-1.5 w-3 h-3 rounded-full border-2 border-[var(--bg-card)] bg-cyan-500" />
                      <div className="card p-3 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)]">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-bold text-[var(--text-ink)]">{ev.name}</span>
                          <span className="text-[11px] text-[var(--text-muted)]">{formatDateTime(ev.timestamp)}</span>
                        </div>
                        <p className="text-xs font-mono text-cyan-700">{ev.path || ev.url || '/'}</p>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="py-20 text-center text-xs text-[var(--text-muted)]">
                Select a visitor session on the left to inspect their step-by-step browsing journey.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 7: FUNNELS */}
      {activeTab === 'funnels' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[var(--text-ink)]">Multi-Step Conversion Funnels</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/10 text-cyan-600 border border-cyan-500/20">
                  PULSE-12 Engine
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Dynamic behavioral progression analytics tracking unique visitor step-by-step conversion and drop-off rates across user journeys.
              </p>
            </div>

            {/* Time Window Selector for Funnels */}
            <div className="inline-flex items-center p-1 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl shadow-2xs self-start sm:self-auto">
              {(['today', '7d', '30d', 'all'] as const).map((period) => (
                <button
                  key={period}
                  onClick={() => setSelectedPeriod(period)}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all capitalize ${
                    selectedPeriod === period
                      ? 'bg-cyan-500 text-white shadow-xs'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-ink)] hover:bg-[var(--bg-main)]'
                  }`}
                >
                  {period === 'all' ? 'All Time' : period === 'today' ? 'Today' : `Last ${period}`}
                </button>
              ))}
            </div>
          </div>

          {isLoading && funnels.length === 0 ? (
            <div className="card p-12 text-center rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-3">
              <RefreshCw className="w-6 h-6 mx-auto animate-spin text-cyan-500" />
              <p className="text-xs text-[var(--text-muted)]">Computing sequential funnel drop-off analytics...</p>
            </div>
          ) : funnels.length === 0 ? (
            <div className="card p-12 text-center rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-3">
              <Filter className="w-8 h-8 mx-auto text-[var(--text-muted)] opacity-50" />
              <h3 className="text-sm font-bold text-[var(--text-ink)]">No Conversion Funnels Configured</h3>
              <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
                Define multi-step journeys to measure progression and identify friction points where prospective customers drop out.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {funnels.map((fnl) => {
                const analytics = funnelAnalytics.find((a) => a.funnelId === fnl.id);

                return (
                  <div
                    key={fnl.id}
                    className="card p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xs space-y-6"
                  >
                    {/* Funnel Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-[var(--text-ink)]">{fnl.name}</h3>
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
                            {fnl.timeWindowHours || 24}h Window
                          </span>
                        </div>
                        {fnl.description && (
                          <p className="text-xs text-[var(--text-muted)] mt-1">{fnl.description}</p>
                        )}
                      </div>

                      {analytics?.previousPeriodComparison && (
                        <div className="text-[11px] text-[var(--text-muted)] bg-[var(--bg-main)] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)]">
                          Comparing with preceding equal period
                        </div>
                      )}
                    </div>

                    {/* Summary KPI Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="p-3.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] space-y-1">
                        <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                          Funnel Entrants
                        </span>
                        <div className="flex items-baseline gap-2">
                          <span className="text-xl font-black text-[var(--text-ink)]">
                            {analytics?.totalEntrants?.toLocaleString() ?? 0}
                          </span>
                          {analytics?.previousPeriodComparison && (
                            <span
                              className={`text-[10px] font-bold flex items-center ${
                                (analytics.previousPeriodComparison.entrantsDeltaPercent ?? 0) >= 0
                                  ? 'text-emerald-600'
                                  : 'text-rose-600'
                              }`}
                            >
                              {(analytics.previousPeriodComparison.entrantsDeltaPercent ?? 0) >= 0 ? '+' : ''}
                              {analytics.previousPeriodComparison.entrantsDeltaPercent}%
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-[var(--text-muted)] truncate">
                          Step 1: {fnl.steps[0]?.name || 'Entry'}
                        </div>
                      </div>

                      <div className="p-3.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] space-y-1">
                        <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                          Completed Funnel
                        </span>
                        <div className="flex items-baseline gap-2">
                          <span className="text-xl font-black text-emerald-600">
                            {analytics?.totalCompleted?.toLocaleString() ?? 0}
                          </span>
                          {analytics?.previousPeriodComparison && (
                            <span
                              className={`text-[10px] font-bold flex items-center ${
                                (analytics.previousPeriodComparison.completedDeltaPercent ?? 0) >= 0
                                  ? 'text-emerald-600'
                                  : 'text-rose-600'
                              }`}
                            >
                              {(analytics.previousPeriodComparison.completedDeltaPercent ?? 0) >= 0 ? '+' : ''}
                              {analytics.previousPeriodComparison.completedDeltaPercent}%
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-[var(--text-muted)] truncate">
                          Step {fnl.steps.length}: {fnl.steps[fnl.steps.length - 1]?.name || 'Goal'}
                        </div>
                      </div>

                      <div className="p-3.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] space-y-1">
                        <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                          Overall Conversion
                        </span>
                        <div className="flex items-baseline gap-2">
                          <span className="text-xl font-black text-cyan-600">
                            {analytics?.overallConversionRate ?? 0}%
                          </span>
                          {analytics?.previousPeriodComparison && (
                            <span
                              className={`text-[10px] font-bold flex items-center ${
                                (analytics.previousPeriodComparison.overallConversionRateDelta ?? 0) >= 0
                                  ? 'text-emerald-600'
                                  : 'text-rose-600'
                              }`}
                            >
                              {(analytics.previousPeriodComparison.overallConversionRateDelta ?? 0) >= 0 ? '+' : ''}
                              {analytics.previousPeriodComparison.overallConversionRateDelta}%
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-[var(--text-muted)]">Journey completion rate</div>
                      </div>

                      <div className="p-3.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] space-y-1">
                        <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                          Total Drop-Off
                        </span>
                        <div className="flex items-baseline gap-2">
                          <span className="text-xl font-black text-amber-600">
                            {analytics?.overallDropoffCount?.toLocaleString() ?? 0}
                          </span>
                          <span className="text-[10px] font-bold text-amber-600">
                            ({analytics?.overallDropoffRate ?? 0}%)
                          </span>
                        </div>
                        <div className="text-[10px] text-[var(--text-muted)]">Lost across funnel path</div>
                      </div>
                    </div>

                    {/* Step Progression Visual Pipeline */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-[var(--text-ink)] uppercase tracking-wider">
                          Sequential Journey Progression
                        </h4>
                        <span className="text-[11px] text-[var(--text-muted)]">
                          Strict chronological evaluation · Zero double-counting
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        {(analytics?.steps || fnl.steps.map((s, i) => ({
                          stepId: s.id,
                          stepIndex: i + 1,
                          name: s.name,
                          eventType: s.eventType,
                          pageUrlPattern: s.pageUrlPattern,
                          visitors: 0,
                          conversionRateFromPrevious: i === 0 ? 100 : 0,
                          dropoffCount: 0,
                          dropoffRateFromPrevious: 0,
                          deltaFromPreviousPeriod: null,
                        }))).map((step, idx) => {
                          const retentionRatio =
                            analytics && analytics.totalEntrants > 0
                              ? Math.round((step.visitors / analytics.totalEntrants) * 100)
                              : idx === 0 && step.visitors > 0
                              ? 100
                              : 0;

                          return (
                            <div
                              key={step.stepId}
                              className="relative p-4 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] space-y-3 flex flex-col justify-between"
                            >
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-cyan-600 uppercase tracking-wider">
                                    Step {step.stepIndex}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-cyan-500/10 text-cyan-600">
                                    {step.eventType}
                                  </span>
                                </div>

                                <div>
                                  <h5 className="text-xs font-bold text-[var(--text-ink)] leading-snug">
                                    {step.name}
                                  </h5>
                                  {step.pageUrlPattern && (
                                    <div className="text-[10px] text-[var(--text-muted)] font-mono truncate mt-0.5">
                                      {step.pageUrlPattern}
                                    </div>
                                  )}
                                </div>

                                <div className="pt-1">
                                  <div className="flex items-baseline justify-between">
                                    <span className="text-lg font-black text-[var(--text-ink)]">
                                      {step.visitors.toLocaleString()}
                                    </span>
                                    <span className="text-[11px] font-semibold text-[var(--text-muted)]">
                                      {retentionRatio}% retained
                                    </span>
                                  </div>

                                  {/* Progress Bar */}
                                  <div className="w-full h-1.5 bg-[var(--border-subtle)] rounded-full overflow-hidden mt-1.5">
                                    <div
                                      className="h-full bg-cyan-500 rounded-full transition-all duration-500"
                                      style={{ width: `${Math.max(retentionRatio, 2)}%` }}
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* Conversion & Drop-off Rates */}
                              <div className="pt-2 border-t border-[var(--border-subtle)] space-y-1.5">
                                {idx > 0 ? (
                                  <>
                                    <div className="flex items-center justify-between text-[11px]">
                                      <span className="text-[var(--text-muted)] font-medium">Step Conversion</span>
                                      <span className="font-bold text-emerald-600">
                                        {step.conversionRateFromPrevious}%
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between text-[11px]">
                                      <span className="text-[var(--text-muted)] font-medium">Drop-Off</span>
                                      <span className="font-bold text-amber-600">
                                        {step.dropoffRateFromPrevious}% ({step.dropoffCount})
                                      </span>
                                    </div>
                                    {step.deltaFromPreviousPeriod && (
                                      <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] pt-0.5">
                                        <span>vs prev period</span>
                                        <span
                                          className={`font-semibold ${
                                            step.deltaFromPreviousPeriod.conversionRateDeltaPercent >= 0
                                              ? 'text-emerald-600'
                                              : 'text-rose-600'
                                          }`}
                                        >
                                          {step.deltaFromPreviousPeriod.conversionRateDeltaPercent >= 0 ? '+' : ''}
                                          {step.deltaFromPreviousPeriod.conversionRateDeltaPercent}%
                                        </span>
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <div className="text-[11px] text-[var(--text-muted)] text-center py-1">
                                    Initial Funnel Ingress
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Step Breakdown Audit Table */}
                    <div className="space-y-2 pt-2">
                      <h4 className="text-xs font-bold text-[var(--text-ink)] uppercase tracking-wider">
                        Detailed Drop-Off Audit
                      </h4>
                      <div className="overflow-x-auto border border-[var(--border-subtle)] rounded-xl">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-[var(--bg-main)] text-[var(--text-muted)] uppercase text-[10px] font-bold border-b border-[var(--border-subtle)]">
                            <tr>
                              <th className="py-2.5 px-3">Step</th>
                              <th className="py-2.5 px-3">Trigger Event</th>
                              <th className="py-2.5 px-3 text-right">Unique Visitors</th>
                              <th className="py-2.5 px-3 text-right">Step Conversion</th>
                              <th className="py-2.5 px-3 text-right">Drop-Off Count</th>
                              <th className="py-2.5 px-3 text-right">Drop-Off %</th>
                              <th className="py-2.5 px-3 text-right">Journey Retention</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border-subtle)]">
                            {(analytics?.steps || []).map((st, i) => {
                              const overallRet =
                                analytics && analytics.totalEntrants > 0
                                  ? Math.round((st.visitors / analytics.totalEntrants) * 1000) / 10
                                  : 0;

                              return (
                                <tr key={st.stepId} className="hover:bg-[var(--bg-main)]/50 transition-colors">
                                  <td className="py-2 px-3 font-bold text-[var(--text-ink)]">
                                    {st.stepIndex}. {st.name}
                                  </td>
                                  <td className="py-2 px-3">
                                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
                                      {st.eventType}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 text-right font-black text-[var(--text-ink)]">
                                    {st.visitors.toLocaleString()}
                                  </td>
                                  <td className="py-2 px-3 text-right font-bold text-emerald-600">
                                    {st.conversionRateFromPrevious}%
                                  </td>
                                  <td className="py-2 px-3 text-right font-semibold text-amber-600">
                                    {st.dropoffCount > 0 ? st.dropoffCount.toLocaleString() : '-'}
                                  </td>
                                  <td className="py-2 px-3 text-right font-semibold text-amber-600">
                                    {st.dropoffRateFromPrevious > 0 ? `${st.dropoffRateFromPrevious}%` : '-'}
                                  </td>
                                  <td className="py-2 px-3 text-right font-black text-cyan-600">
                                    {overallRet}%
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Zero Entrants Guidance Notice */}
                    {analytics && analytics.totalEntrants === 0 && (
                      <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>
                          No visitors completed Step 1 ({fnl.steps[0]?.name}) during the selected period ({selectedPeriod}). Switch to a broader date range or verify snippet installation.
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 8: SEGMENTS */}
      {activeTab === 'segments' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[var(--text-ink)]">Behavioural Visitor Segments</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/10 text-cyan-600 border border-cyan-500/20">
                  PULSE-13 Engine
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Dynamic cohorts automatically partitioned by browsing intent, cart value, recency, and purchase history. Automatically tags identified CRM customer records.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleEvaluateAllSegments}
                disabled={isEvaluatingSegments || segments.length === 0}
                className="px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-main)] text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer text-[var(--text-ink)] disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isEvaluatingSegments ? 'animate-spin text-cyan-500' : ''}`} />
                {isEvaluatingSegments ? 'Evaluating...' : 'Evaluate All'}
              </button>

              <button
                onClick={() => setIsAddSegmentOpen(true)}
                className="px-3.5 py-1.5 rounded-xl bg-[var(--text-ink)] hover:opacity-90 text-[var(--bg-card)] text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                New Segment
              </button>
            </div>
          </div>

          {segments.length === 0 ? (
            <div className="card p-12 text-center rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-3">
              <Users className="w-8 h-8 mx-auto text-[var(--text-muted)] opacity-50" />
              <h3 className="text-sm font-bold text-[var(--text-ink)]">No Behavioural Segments Defined</h3>
              <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
                Create rule-based audience segments to track high-intent shoppers, cart abandoners, and frequent visitors, syncing membership directly to CRM customer tags.
              </p>
              <button
                onClick={() => setIsAddSegmentOpen(true)}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                Create First Segment
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {segments.map((seg) => {
                const defaultTag = `pulse:${seg.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
                const tag = seg.crmTag || defaultTag;

                return (
                  <div
                    key={seg.id}
                    className="card p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xs space-y-4 flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      {/* Top Row: Name, Match Type Badge & Actions */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: seg.color || '#06B6D4' }}
                          />
                          <h3 className="text-sm font-bold text-[var(--text-ink)] leading-snug">{seg.name}</h3>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleEvaluateSegment(seg.id)}
                            disabled={isEvaluatingSegments}
                            title="Evaluate Segment Membership"
                            className="p-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--bg-main)] text-[var(--text-muted)] hover:text-cyan-600 transition-colors cursor-pointer"
                          >
                            <Play className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteSegment(seg.id)}
                            title="Delete Segment"
                            className="p-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-rose-500/10 text-[var(--text-muted)] hover:text-rose-600 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {seg.description && (
                        <p className="text-xs text-[var(--text-muted)] line-clamp-2">{seg.description}</p>
                      )}

                      {/* Audience Size & CRM Sync Indicators */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-cyan-500/10 text-cyan-600 border border-cyan-500/20">
                          {seg.memberCount || 0} unique visitors
                        </span>

                        {seg.memberCustomerIds && seg.memberCustomerIds.length > 0 && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                            {seg.memberCustomerIds.length} CRM Customers
                          </span>
                        )}

                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[var(--bg-main)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                          Match {seg.matchType || 'ALL'}
                        </span>
                      </div>

                      {/* CRM Tag Sync Pill */}
                      {seg.syncCustomerTags !== false && (
                        <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] bg-[var(--bg-main)] px-2.5 py-1 rounded-lg border border-[var(--border-subtle)]">
                          <Tag className="w-3 h-3 text-cyan-500 shrink-0" />
                          <span className="truncate">CRM Tag: <code className="font-mono text-cyan-600">{tag}</code></span>
                        </div>
                      )}

                      {/* Active Rules List */}
                      <div className="space-y-1.5 pt-2 border-t border-[var(--border-subtle)]">
                        <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">
                          Rule Conditions ({seg.rules.length})
                        </span>
                        <div className="space-y-1">
                          {seg.rules.map((rule, idx) => (
                            <div
                              key={idx}
                              className="text-[11px] font-medium text-[var(--text-ink)] bg-[var(--bg-main)] px-2 py-1 rounded-md border border-[var(--border-subtle)] flex items-center justify-between"
                            >
                              <span>{formatRuleDescription(rule)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="pt-3 border-t border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)] flex items-center justify-between">
                      <span>
                        {seg.lastEvaluatedAt
                          ? `Evaluated: ${formatDateTime(seg.lastEvaluatedAt)}`
                          : 'Not evaluated yet'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 9: ECOMMERCE ANALYTICS */}
      {activeTab === 'ecommerce' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xs">
              <span className="text-xs text-[var(--text-muted)]">Cart Additions</span>
              <div className="text-2xl font-black text-[var(--text-ink)] mt-1">
                {overviewData?.addToCarts || 0}
              </div>
            </div>
            <div className="card p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xs">
              <span className="text-xs text-[var(--text-muted)]">Checkouts Started</span>
              <div className="text-2xl font-black text-[var(--text-ink)] mt-1">
                {overviewData?.checkoutStarts || 0}
              </div>
            </div>
            <div className="card p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xs">
              <span className="text-xs text-[var(--text-muted)]">Completed Orders</span>
              <div className="text-2xl font-black text-emerald-600 mt-1">
                {overviewData?.completedPurchases || 0}
              </div>
            </div>
          </div>

          <div className="card p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xs">
            <h3 className="text-sm font-bold text-[var(--text-ink)] mb-3">Top Performing Products</h3>
            {overviewData?.topProducts?.length > 0 ? (
              <div className="divide-y divide-[var(--border-subtle)]">
                {overviewData.topProducts.map((p: any, i: number) => (
                  <div key={i} className="py-2.5 flex items-center justify-between text-xs">
                    <span className="font-semibold text-[var(--text-ink)]">{p.name}</span>
                    <div className="flex items-center gap-4">
                      <span>{p.count} units</span>
                      <strong className="text-emerald-600">₹{p.revenue.toLocaleString('en-IN')}</strong>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-[var(--text-muted)]">No product sales yet.</div>
            )}
          </div>
        </div>
      )}

      {/* TAB 10: EMAIL TRACKING */}
      {activeTab === 'email_analytics' && (
        <div className="card p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xs space-y-4">
          <div>
            <h2 className="text-base font-bold text-[var(--text-ink)]">Email Engagement Analytics</h2>
            <p className="text-xs text-[var(--text-muted)]">
              Accurate tracking of email link clicks and reported opens with privacy proxy detection.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 leading-relaxed">
            <strong>Privacy Disclosure:</strong> Apple Mail Privacy Protection and email security scanners pre-fetch tracking pixels. Opens are recorded as <em>Reported Opens</em> and distinguished from verified link clicks.
          </div>

          <div className="divide-y divide-[var(--border-subtle)]">
            {events
              .filter((e) => e.type.startsWith('email_'))
              .map((ev) => (
                <div key={ev.id} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-[var(--text-ink)] block">{ev.name}</span>
                    <span className="text-[11px] text-[var(--text-muted)]">{ev.identities?.email || 'Unknown recipient'}</span>
                  </div>
                  <span className="text-[11px] text-[var(--text-muted)] font-tabular">{formatDateTime(ev.timestamp)}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* TAB 11: AUTOMATION TRIGGERS */}
      {activeTab === 'triggers' && (
        <div className="card p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xs space-y-4">
          <div>
            <h2 className="text-base font-bold text-[var(--text-ink)]">Pulse CRM Automation Triggers</h2>
            <p className="text-xs text-[var(--text-muted)]">
              Trigger real-time CRM workflows when visitors abandon checkouts, view high-value products, or submit forms.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                trigger: 'pulse_checkout_abandoned',
                title: 'Abandoned Checkout Recovery',
                desc: 'Dispatches WhatsApp/Email follow-up 60 mins after checkout starts if no purchase is completed.',
              },
              {
                trigger: 'pulse_purchase_completed',
                title: 'Order Confirmation & Onboarding',
                desc: 'Sends automated invoice details and moves CRM deal to "Won / Completed".',
              },
              {
                trigger: 'pulse_item_added_to_cart',
                title: 'High-Intent Cart Follow-up',
                desc: 'Creates a priority task for sales agents when high-ticket items are added.',
              },
              {
                trigger: 'pulse_form_submitted',
                title: 'Instant Lead Capture',
                desc: 'Instantly creates or updates customer lead record upon form submission.',
              },
            ].map((trig, idx) => (
              <div key={idx} className="p-4 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] space-y-2">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  <h4 className="text-xs font-bold text-[var(--text-ink)]">{trig.title}</h4>
                </div>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">{trig.desc}</p>
                <code className="text-[10px] font-mono text-cyan-700 block">{trig.trigger}</code>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 12: CONSENT & DPDP */}
      {activeTab === 'consent' && (
        <div className="card p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xs space-y-4">
          <div>
            <h2 className="text-base font-bold text-[var(--text-ink)]">DPDP & Privacy Compliance</h2>
            <p className="text-xs text-[var(--text-muted)]">
              Digital Personal Data Protection Act compliance, consent tracking, and communication suppression status.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-800 space-y-1">
            <strong>Zero-Fingerprinting Guarantee:</strong> Developster Pulse never collects canvas fingerprints, hardware hashes, or raw IP addresses. All client IPs are anonymized at ingest.
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-bold text-[var(--text-ink)] uppercase tracking-wide">
              Logged Consent Records ({consentRecords.length})
            </h4>
            <div className="divide-y divide-[var(--border-subtle)]">
              {consentRecords.map((cr) => (
                <div key={cr.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-[var(--text-ink)]">{cr.visitorId}</span>
                    <span className="text-[11px] text-[var(--text-muted)] block">Source: {cr.consentSource}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-emerald-600 font-semibold">Analytics: {cr.analyticsConsent ? 'Granted' : 'Declined'}</span>
                    <span className="text-[11px] text-[var(--text-muted)] font-tabular">{formatDateTime(cr.consentTimestamp)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 13: SETTINGS */}
      {activeTab === 'settings' && (
        <div className="card p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-2xs space-y-4 max-w-2xl">
          <div>
            <h2 className="text-base font-bold text-[var(--text-ink)]">Pulse Tracking Settings</h2>
            <p className="text-xs text-[var(--text-muted)]">Configure workspace retention and bot filtering options.</p>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)]">
              <div>
                <span className="text-xs font-bold text-[var(--text-ink)] block">IP Anonymization</span>
                <span className="text-[11px] text-[var(--text-muted)]">Zeros out the last octet of visitor IP addresses</span>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600">
                Enforced Always
              </span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)]">
              <div>
                <span className="text-xs font-bold text-[var(--text-ink)] block">Bot & Crawler Filter</span>
                <span className="text-[11px] text-[var(--text-muted)]">Ignores Googlebot, Bing, spiders, and scrapers</span>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600">
                Enabled
              </span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)]">
              <div>
                <span className="text-xs font-bold text-[var(--text-ink)] block">Session Inactivity Timeout</span>
                <span className="text-[11px] text-[var(--text-muted)]">Time before a new browsing session is created</span>
              </div>
              <span className="text-xs font-bold text-[var(--text-ink)]">30 Minutes</span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)]">
              <div>
                <span className="text-xs font-bold text-[var(--text-ink)] block">Raw Clickstream Retention</span>
                <span className="text-[11px] text-[var(--text-muted)]">Bounded event window size</span>
              </div>
              <span className="text-xs font-bold text-[var(--text-ink)]">180 Days</span>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD WEBSITE */}
      {isAddWebsiteOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-3xl shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-[var(--text-ink)]">Register Website</h3>
            <form onSubmit={handleCreateWebsite} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-[var(--text-ink)] block mb-1">Website Name</label>
                <input
                  type="text"
                  placeholder="e.g. My Online Store"
                  value={newSiteName}
                  onChange={(e) => setNewSiteName(e.target.value)}
                  required
                  className="w-full text-xs p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--text-ink)] block mb-1">Domain</label>
                <input
                  type="text"
                  placeholder="e.g. mystore.com"
                  value={newSiteDomain}
                  onChange={(e) => setNewSiteDomain(e.target.value)}
                  required
                  className="w-full text-xs p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--text-ink)] block mb-1">Ecommerce Platform</label>
                <select
                  value={newSiteEcommerce}
                  onChange={(e) => setNewSiteEcommerce(e.target.value as any)}
                  className="w-full text-xs p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] font-medium"
                >
                  <option value="none">Standard Website (No Ecommerce)</option>
                  <option value="shopify">Shopify</option>
                  <option value="woocommerce">WooCommerce</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddWebsiteOpen(false)}
                  className="px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] text-xs text-[var(--text-muted)] hover:text-[var(--text-ink)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingSite}
                  className="px-4 py-1.5 rounded-xl bg-[var(--text-ink)] text-[var(--bg-card)] text-xs font-semibold cursor-pointer"
                >
                  {isSavingSite ? 'Saving...' : 'Register Website'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: WEBSITE INSTALLATION & VERIFICATION GUIDE */}
      {installGuideWebsite && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-3xl shadow-2xl p-6 space-y-5 my-8">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-[var(--border-subtle)] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Globe className="w-5 h-5 text-cyan-600" />
                  <h3 className="text-base font-bold text-[var(--text-ink)]">
                    Universal Tracking Setup — {installGuideWebsite.name}
                  </h3>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Embed this single lightweight snippet to track visitor sessions, page views, and conversions with zero cookies.
                </p>
              </div>
              <button
                onClick={() => {
                  setInstallGuideWebsite(null);
                  setTestEventFeedback(null);
                }}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-ink)] cursor-pointer p-1.5 rounded-lg hover:bg-[var(--bg-main)]"
              >
                ✕
              </button>
            </div>

            {/* Quick Website Identity Bar */}
            <div className="p-3 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-subtle)] grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
              <div>
                <span className="text-[10px] font-semibold text-[var(--text-muted)] block uppercase">Domain</span>
                <span className="text-xs font-mono font-medium text-[var(--text-ink)]">{installGuideWebsite.domain}</span>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-[var(--text-muted)] block uppercase">Site ID</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono font-medium text-[var(--text-ink)] truncate">{installGuideWebsite.siteId}</span>
                  <button
                    onClick={() => copyToClipboard(installGuideWebsite.siteId, `modal-site-${installGuideWebsite.id}`)}
                    className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-ink)]"
                    title="Copy Site ID"
                  >
                    {copiedKey === `modal-site-${installGuideWebsite.id}` ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-[var(--text-muted)] block uppercase">Status</span>
                {(() => {
                  const s = getWebsiteStatus(installGuideWebsite);
                  return (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${s.badgeClass}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${s.dotClass}`} />
                      {s.label}
                    </span>
                  );
                })()}
              </div>
            </div>

            {/* Platform Selection Tabs */}
            <div className="space-y-3">
              <label className="text-xs font-semibold text-[var(--text-ink)] block">
                Select Your Technology / Platform:
              </label>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-[var(--border-subtle)]">
                {[
                  { id: 'html', label: 'Custom HTML / Static' },
                  { id: 'react', label: 'React (SPA)' },
                  { id: 'nextjs', label: 'Next.js' },
                  { id: 'wordpress', label: 'WordPress' },
                  { id: 'custom_js', label: 'Other CMS / Custom JS' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActivePlatformTab(tab.id as any)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                      activePlatformTab === tab.id
                        ? 'bg-[var(--text-ink)] text-[var(--bg-card)]'
                        : 'bg-[var(--bg-main)] text-[var(--text-muted)] hover:text-[var(--text-ink)]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Platform Instructions & Snippet */}
            {(() => {
              const snippets = getSnippetsForSite(installGuideWebsite);

              let currentSnippet = snippets.htmlSnippet;
              let placementTitle = 'Where to place the script';
              let placementDesc = 'Paste the code inside the <head> tag of every page you want to track (recommended), or right before the closing </body> tag.';
              let extraTip = 'The async attribute ensures the tracking script loads asynchronously without blocking page rendering or degrading Core Web Vitals.';

              if (activePlatformTab === 'react') {
                currentSnippet = snippets.reactSnippet;
                placementTitle = 'React (Vite / Create React App / SPA)';
                placementDesc = 'Option A: Paste the <script> tag into your public/index.html file within the <head> element. Option B: For client-side Single Page Applications, hook into route changes with window.DevelopsterPulse.pageView().';
                extraTip = 'React SPAs do not perform full browser reloads between routes; calling DevelopsterPulse.pageView() on navigation ensures every virtual pageview is logged.';
              } else if (activePlatformTab === 'nextjs') {
                currentSnippet = snippets.nextjsSnippet;
                placementTitle = 'Next.js (App Router: app/layout.tsx)';
                placementDesc = 'Import the Next.js Script component from "next/script" and add it inside your RootLayout <body>. For Pages Router, place it in pages/_app.tsx.';
                extraTip = 'Using strategy="afterInteractive" instructs Next.js to load the script after the page becomes interactive, maintaining maximum PageSpeed performance.';
              } else if (activePlatformTab === 'wordpress') {
                currentSnippet = snippets.wordpressSnippet;
                placementTitle = 'WordPress (Theme functions.php or Header Plugin)';
                placementDesc = 'Add the snippet to your active child theme functions.php via wp_head, or use a plugin like WPCode / "Insert Headers and Footers" to insert into the Header.';
                extraTip = 'Ensure the snippet is loaded across all public template pages (home, single post, archive, checkout).';
              } else if (activePlatformTab === 'custom_js') {
                currentSnippet = snippets.customJsSnippet;
                placementTitle = 'Webflow, Squarespace, Wix, or Custom JS Integration';
                placementDesc = 'Go to your site builder Settings → Custom Code → Header Code, and paste the tracking snippet. You can also trigger custom milestones and form submissions.';
                extraTip = 'DevelopsterPulse.submitForm() automatically captures email and name fields to resolve visitor sessions to CRM contacts.';
              }

              return (
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/15 text-xs text-[var(--text-ink)] space-y-1">
                    <span className="font-bold block text-cyan-800 dark:text-cyan-400">{placementTitle}</span>
                    <p className="text-[var(--text-muted)] text-[11px] leading-relaxed">{placementDesc}</p>
                    <p className="text-[10px] text-cyan-600 dark:text-cyan-500 italic mt-0.5">{extraTip}</p>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--text-ink)]">Generated Installation Code</span>
                      <button
                        onClick={() => copyToClipboard(currentSnippet, `guide-${activePlatformTab}`)}
                        className="px-2.5 py-1 rounded-lg bg-cyan-500/10 text-cyan-700 hover:bg-cyan-500/20 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        {copiedKey === `guide-${activePlatformTab}` ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-emerald-600">Copied to Clipboard!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Code</span>
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="p-3 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-ink)] overflow-x-auto max-h-52 select-all leading-relaxed">
                      {currentSnippet}
                    </pre>
                  </div>
                </div>
              );
            })()}

            {/* Interactive Verification Checklist & Action */}
            <div className="p-4 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-subtle)] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-[var(--text-ink)]">Installation Verification</h4>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Confirm that your website is registered, the tracking script is reachable, and telemetry events are arriving.
                  </p>
                </div>
                <button
                  onClick={() => handleVerifyWebsite(installGuideWebsite, true)}
                  disabled={verifyingSiteId === installGuideWebsite.id}
                  className="px-3.5 py-1.5 rounded-xl bg-[var(--text-ink)] text-[var(--bg-card)] text-xs font-semibold flex items-center gap-1.5 cursor-pointer hover:opacity-90 transition-opacity"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${verifyingSiteId === installGuideWebsite.id ? 'animate-spin' : ''}`} />
                  <span>{verifyingSiteId === installGuideWebsite.id ? 'Verifying...' : 'Verify Installation'}</span>
                </button>
              </div>

              {/* Status Checks Breakdown */}
              {(() => {
                const vResult = verificationResults[installGuideWebsite.id];
                const s = getWebsiteStatus(installGuideWebsite);

                return (
                  <div className="space-y-2 pt-1 border-t border-[var(--border-subtle)]">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <div className="p-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <div className="min-w-0">
                          <span className="text-[10px] font-semibold text-[var(--text-muted)] block uppercase">1. Site ID</span>
                          <span className="text-xs font-semibold text-emerald-600">Registered</span>
                        </div>
                      </div>

                      <div className="p-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <div className="min-w-0">
                          <span className="text-[10px] font-semibold text-[var(--text-muted)] block uppercase">2. Tracking Script</span>
                          <span className="text-xs font-semibold text-emerald-600">Available (/pulse.js)</span>
                        </div>
                      </div>

                      <div className="p-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] flex items-center gap-2">
                        {s.status === 'connected' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : s.status === 'verification_failed' ? (
                          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                        ) : (
                          <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <span className="text-[10px] font-semibold text-[var(--text-muted)] block uppercase">3. Telemetry Event</span>
                          <span className={`text-xs font-semibold ${
                            s.status === 'connected'
                              ? 'text-emerald-600'
                              : s.status === 'verification_failed'
                              ? 'text-rose-600'
                              : 'text-amber-600'
                          }`}>
                            {s.status === 'connected'
                              ? `${installGuideWebsite.eventsCountTotal || 1} Event(s) Received`
                              : s.status === 'verification_failed'
                              ? 'Verification Failed'
                              : 'Waiting for Event'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Detailed Result Message */}
                    {vResult ? (
                      <div className={`p-3 rounded-xl border text-xs ${
                        vResult.status === 'connected'
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700'
                          : vResult.status === 'verification_failed'
                          ? 'bg-rose-500/10 border-rose-500/20 text-rose-700'
                          : 'bg-amber-500/10 border-amber-500/20 text-amber-700'
                      }`}>
                        <div className="font-semibold flex items-center gap-1.5">
                          {vResult.status === 'connected' && <CheckCircle2 className="w-4 h-4" />}
                          {vResult.status === 'verification_failed' && <AlertCircle className="w-4 h-4" />}
                          {vResult.status === 'waiting_for_first_event' && <Clock className="w-4 h-4" />}
                          <span>{vResult.statusLabel}: {vResult.message}</span>
                        </div>
                        {vResult.checks?.scriptProbeNote && (
                          <p className="text-[11px] opacity-80 mt-1">{vResult.checks.scriptProbeNote}</p>
                        )}
                        {vResult.lastPingAt && (
                          <p className="text-[10px] opacity-75 mt-0.5">
                            Last received ping: {formatDateTime(vResult.lastPingAt)}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs text-[var(--text-muted)] flex items-center justify-between">
                        <span>Click "Verify Installation" to probe your website or check for received telemetry.</span>
                      </div>
                    )}

                    {/* Test Event Probe Button & Feedback */}
                    <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                      <div className="text-[11px] text-[var(--text-muted)]">
                        Testing in development or localhost? Send a direct test event to verify the pipeline.
                      </div>
                      <button
                        onClick={() => handleSendTestEvent(installGuideWebsite)}
                        disabled={isSendingTestEvent}
                        className="px-3 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-main)] text-[var(--text-ink)] text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs whitespace-nowrap"
                      >
                        <Play className={`w-3 h-3 text-cyan-600 ${isSendingTestEvent ? 'animate-spin' : ''}`} />
                        <span>{isSendingTestEvent ? 'Sending Ping...' : 'Send Test Event'}</span>
                      </button>
                    </div>

                    {testEventFeedback && (
                      <p className="text-[11px] font-medium text-cyan-700 dark:text-cyan-400 mt-1">
                        {testEventFeedback}
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <button
                onClick={() => {
                  setInstallGuideWebsite(null);
                  setTestEventFeedback(null);
                }}
                className="px-4 py-2 rounded-xl bg-[var(--text-ink)] text-[var(--bg-card)] text-xs font-semibold cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT WEBSITE SETTINGS */}
      {editingWebsite && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-3xl shadow-2xl p-6 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div>
                <h3 className="text-base font-bold text-[var(--text-ink)]">Edit Website Settings</h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Configure tracking domains, e-commerce integrations, and webhook credentials.
                </p>
              </div>
              <button
                onClick={() => setEditingWebsite(null)}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-ink)] cursor-pointer"
              >
                ✕
              </button>
            </div>

            {editErrorMessage && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{editErrorMessage}</span>
              </div>
            )}

            <form onSubmit={handleUpdateWebsite} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[var(--text-ink)] block mb-1">Website Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                    className="w-full text-xs p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] font-medium"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[var(--text-ink)] block mb-1">Primary Domain</label>
                  <input
                    type="text"
                    value={editDomain}
                    onChange={(e) => setEditDomain(e.target.value)}
                    required
                    className="w-full text-xs p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--text-ink)] block mb-1">
                  Allowed Whitelisted Domains (comma-separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. mystore.com, app.mystore.com, localhost"
                  value={editWhitelistedDomains}
                  onChange={(e) => setEditWhitelistedDomains(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)] font-mono"
                />
                <span className="text-[11px] text-[var(--text-muted)] mt-1 block">
                  Only incoming events matching these domains or subdomains are ingested.
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[var(--text-ink)] block mb-1">Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as any)}
                    className="w-full text-xs p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)]"
                  >
                    <option value="active">Active (Collecting)</option>
                    <option value="paused">Paused</option>
                    <option value="archived">Archived</option>
                    <option value="unverified">Unverified</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-[var(--text-ink)] block mb-1">Ecommerce Platform</label>
                  <select
                    value={editEcommercePlatform}
                    onChange={(e) => setEditEcommercePlatform(e.target.value as any)}
                    className="w-full text-xs p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)]"
                  >
                    <option value="none">Standard Website (No Ecommerce)</option>
                    <option value="shopify">Shopify</option>
                    <option value="woocommerce">WooCommerce</option>
                    <option value="custom">Custom API</option>
                  </select>
                </div>
              </div>

              {editEcommercePlatform && editEcommercePlatform !== 'none' && (
                <div className="p-3.5 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-subtle)] space-y-3">
                  <h4 className="text-xs font-bold text-[var(--text-ink)]">
                    {editEcommercePlatform.toUpperCase()} Integration Credentials
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">Store URL</label>
                      <input
                        type="text"
                        placeholder="https://shop.example.com"
                        value={editStoreUrl}
                        onChange={(e) => setEditStoreUrl(e.target.value)}
                        className="w-full text-xs p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-ink)] font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">Shop Domain</label>
                      <input
                        type="text"
                        placeholder="shop.example.com"
                        value={editShopDomain}
                        onChange={(e) => setEditShopDomain(e.target.value)}
                        className="w-full text-xs p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-ink)] font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">
                      Webhook Secret (HMAC Signing Secret)
                    </label>
                    <input
                      type="password"
                      placeholder="Leave blank to preserve existing secret"
                      value={editWebhookSecret}
                      onChange={(e) => setEditWebhookSecret(e.target.value)}
                      className="w-full text-xs p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-ink)] font-mono"
                    />
                    <span className="text-[10px] text-[var(--text-muted)] mt-1 block">
                      Existing secret is safely retained if left blank. Never exposed in API responses.
                    </span>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={editAutoSyncOrders}
                      onChange={(e) => setEditAutoSyncOrders(e.target.checked)}
                      className="rounded accent-cyan-600"
                    />
                    <span className="text-xs text-[var(--text-ink)] font-medium">
                      Automatically sync completed orders into CRM customer profiles
                    </span>
                  </label>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setEditingWebsite(null)}
                  className="px-3.5 py-1.5 rounded-xl border border-[var(--border-subtle)] text-xs text-[var(--text-muted)] hover:text-[var(--text-ink)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-4 py-1.5 rounded-xl bg-[var(--text-ink)] text-[var(--bg-card)] text-xs font-semibold cursor-pointer shadow-xs"
                >
                  {isSavingEdit ? 'Saving Changes...' : 'Save Settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Segment Builder Modal */}
      {isAddSegmentOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-3xl shadow-2xl p-6 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div>
                <h3 className="text-base font-bold text-[var(--text-ink)]">Create Behavioural Segment</h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Define automated dynamic cohort rules based on visitor actions and shopping behaviour.
                </p>
              </div>
              <button
                onClick={() => setIsAddSegmentOpen(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-ink)] text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSegment} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[var(--text-ink)] block mb-1">Segment Name</label>
                  <input
                    type="text"
                    placeholder="e.g. High-Intent Cart Abandoners"
                    value={newSegName}
                    onChange={(e) => {
                      setNewSegName(e.target.value);
                      if (!newSegCrmTag) {
                        setNewSegCrmTag(`pulse:${e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
                      }
                    }}
                    required
                    className="w-full text-xs p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)]"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-[var(--text-ink)] block mb-1">Color Badge</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={newSegColor}
                      onChange={(e) => setNewSegColor(e.target.value)}
                      className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent p-0"
                    />
                    <input
                      type="text"
                      value={newSegColor}
                      onChange={(e) => setNewSegColor(e.target.value)}
                      className="w-full text-xs p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] font-mono text-[var(--text-ink)]"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--text-ink)] block mb-1">Description</label>
                <input
                  type="text"
                  placeholder="e.g. Visitors with items in cart who have not completed a purchase"
                  value={newSegDescription}
                  onChange={(e) => setNewSegDescription(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--text-ink)]"
                />
              </div>

              {/* Match Condition Logic & CRM Tag */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-[var(--bg-main)] rounded-xl border border-[var(--border-subtle)]">
                <div>
                  <label className="text-xs font-semibold text-[var(--text-ink)] block mb-1">Match Condition Logic</label>
                  <select
                    value={newSegMatchType}
                    onChange={(e) => setNewSegMatchType(e.target.value as 'ALL' | 'ANY')}
                    className="w-full text-xs p-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-ink)] font-medium"
                  >
                    <option value="ALL">Match ALL Rules (AND)</option>
                    <option value="ANY">Match ANY Rule (OR)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[var(--text-ink)] block mb-1">CRM Customer Tag</label>
                  <input
                    type="text"
                    placeholder="pulse:cart-abandoner"
                    value={newSegCrmTag}
                    onChange={(e) => setNewSegCrmTag(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] font-mono text-[var(--text-ink)]"
                  />
                </div>
              </div>

              {/* Rule Builder Rows */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[var(--text-ink)] uppercase tracking-wider">
                    Rule Criteria ({newSegRules.length})
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setNewSegRules([
                        ...newSegRules,
                        { field: 'product_views_count', operator: 'greater_than_or_equal', value: 3 },
                      ])
                    }
                    className="text-xs text-cyan-600 hover:text-cyan-700 font-semibold cursor-pointer flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add Condition
                  </button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {newSegRules.map((rule, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-cyan-600 uppercase">Condition {idx + 1}</span>
                        {newSegRules.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setNewSegRules(newSegRules.filter((_, i) => i !== idx))}
                            className="text-[10px] text-rose-500 hover:text-rose-600 cursor-pointer"
                          >
                            Remove
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {/* Field Selector */}
                        <select
                          value={rule.field}
                          onChange={(e) => {
                            const f = e.target.value as any;
                            const updated = [...newSegRules];
                            let defVal: any = 1;
                            let defOp: any = 'greater_than_or_equal';
                            if (f === 'has_cart_without_purchase' || f === 'has_checkout_abandoned') {
                              defVal = true;
                              defOp = 'equals';
                            } else if (f === 'visited_page') {
                              defVal = '/products';
                              defOp = 'contains';
                            }
                            updated[idx] = { field: f, operator: defOp, value: defVal };
                            setNewSegRules(updated);
                          }}
                          className="text-xs p-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-ink)]"
                        >
                          <option value="has_cart_without_purchase">Cart without Purchase</option>
                          <option value="has_checkout_abandoned">Checkout Abandoned</option>
                          <option value="product_views_count">Product Views Count</option>
                          <option value="cart_value">Cart Value (₹)</option>
                          <option value="visit_count">Visit / Session Count</option>
                          <option value="has_purchase_completed">Completed Purchase</option>
                          <option value="days_since_last_visit">Days Since Last Visit</option>
                          <option value="visited_page">Visited Page URL</option>
                          <option value="total_spent">Total Spent (₹)</option>
                        </select>

                        {/* Operator */}
                        <select
                          value={rule.operator}
                          onChange={(e) => {
                            const updated = [...newSegRules];
                            updated[idx] = { ...updated[idx], operator: e.target.value as any };
                            setNewSegRules(updated);
                          }}
                          className="text-xs p-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-ink)]"
                        >
                          <option value="equals">=</option>
                          <option value="greater_than_or_equal">≥</option>
                          <option value="greater_than">&gt;</option>
                          <option value="less_than_or_equal">≤</option>
                          <option value="less_than">&lt;</option>
                          <option value="contains">contains</option>
                        </select>

                        {/* Value Input */}
                        {rule.field === 'has_cart_without_purchase' || rule.field === 'has_checkout_abandoned' ? (
                          <select
                            value={String(rule.value)}
                            onChange={(e) => {
                              const updated = [...newSegRules];
                              updated[idx] = { ...updated[idx], value: e.target.value === 'true' };
                              setNewSegRules(updated);
                            }}
                            className="text-xs p-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-ink)]"
                          >
                            <option value="true">True (Yes)</option>
                            <option value="false">False (No)</option>
                          </select>
                        ) : (
                          <input
                            type={rule.field === 'visited_page' ? 'text' : 'number'}
                            value={rule.value}
                            onChange={(e) => {
                              const updated = [...newSegRules];
                              updated[idx] = {
                                ...updated[idx],
                                value: rule.field === 'visited_page' ? e.target.value : Number(e.target.value),
                              };
                              setNewSegRules(updated);
                            }}
                            placeholder="Value"
                            className="text-xs p-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-ink)]"
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setIsAddSegmentOpen(false)}
                  className="px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] text-xs text-[var(--text-muted)] hover:text-[var(--text-ink)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingSegment}
                  className="px-4 py-1.5 rounded-xl bg-[var(--text-ink)] text-[var(--bg-card)] text-xs font-semibold cursor-pointer flex items-center gap-1.5"
                >
                  {isSavingSegment ? 'Evaluating...' : 'Create & Evaluate Segment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

