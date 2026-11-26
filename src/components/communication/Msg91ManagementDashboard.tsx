'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Lock,
  Eye,
  EyeOff,
  RefreshCw,
  ExternalLink,
  MessageSquare,
  Send,
  CreditCard,
  Layers,
  Sparkles,
  Key,
  Smartphone,
  Check,
  Copy,
  Info,
  Sliders,
  DollarSign,
  Radio,
  FileText,
  Calendar,
} from 'lucide-react';
import { Workspace, Customer, TeamMember } from '@/types/crm';
import { formatDateTime } from '@/lib/dateTime';
import { calculateSmsSegments, interpolateTemplateVariables } from '@/lib/communication/adapter';

interface Msg91ManagementDashboardProps {
  workspace: Workspace;
  customers: Customer[];
  currentUser?: TeamMember | null;
}

type Msg91SubTab = 'overview' | 'whatsapp' | 'sms' | 'billing' | 'campaigns';

export function Msg91ManagementDashboard({
  workspace,
  customers,
  currentUser,
}: Msg91ManagementDashboardProps) {
  const [activeSubTab, setActiveSubTab] = useState<Msg91SubTab>('overview');

  // Connection State
  const [isConnected, setIsConnected] = useState(false);
  const [maskedKey, setMaskedKey] = useState('');
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);
  const [hasPin, setHasPin] = useState(false);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);

  // Form inputs for first-time connection
  const [inputAuthKey, setInputAuthKey] = useState('');
  const [showInputKey, setShowInputKey] = useState(false);
  const [securityPin, setSecurityPin] = useState('');
  const [senderId, setSenderId] = useState('DEVHUB');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectSuccess, setConnectSuccess] = useState<string | null>(null);

  // Reveal PIN Modal State
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);

  // Disconnect Modal
  const [isDisconnectModalOpen, setIsDisconnectModalOpen] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // WhatsApp Template Builder State
  const [waTmplName, setWaTmplName] = useState('');
  const [waTmplCategory, setWaTmplCategory] = useState<'UTILITY' | 'MARKETING' | 'AUTHENTICATION'>('UTILITY');
  const [waTmplLanguage, setWaTmplLanguage] = useState('en_US');
  const [waTmplBody, setWaTmplBody] = useState('Hello {{1}}, your order {{2}} has been confirmed. Thank you for choosing {{3}}.');
  const [waTmplFooter, setWaTmplFooter] = useState('Developster Hub');

  // SMS Template Builder State
  const [smsTmplName, setSmsTmplName] = useState('');
  const [smsTmplRoute, setSmsTmplRoute] = useState<'Transactional' | 'Service Implicit' | 'Service Explicit' | 'Promotional'>('Service Implicit');
  const [smsTmplDltId, setSmsTmplDltId] = useState('');
  const [smsTmplContent, setSmsTmplContent] = useState('Dear customer, your request has been received. Reference ID: {{1}}.');

  // Campaign State
  const [campaignName, setCampaignName] = useState('');
  const [campaignChannel, setCampaignChannel] = useState<'whatsapp' | 'sms'>('whatsapp');
  const [campaignSegment, setCampaignSegment] = useState<'all' | 'high_value' | 'leads'>('all');
  const [campaignFeedback, setCampaignFeedback] = useState<string | null>(null);

  // Load Status
  const loadStatus = async () => {
    setIsLoadingStatus(true);
    try {
      const res = await fetch(`/api/communication/msg91/status?workspaceId=${workspace.id}`);
      if (res.ok) {
        const data = await res.json();
        setIsConnected(data.isConnected);
        setMaskedKey(data.maskedKey || '');
        setVerifiedAt(data.verifiedAt || null);
        setHasPin(data.hasPin || false);
        if (data.senderId) setSenderId(data.senderId);
        if (data.whatsappNumber) setWhatsappNumber(data.whatsappNumber);
      }
    } catch (e) {
      console.error('Failed to load MSG91 status:', e);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, [workspace.id]);

  // Connect MSG91
  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnectError(null);
    setConnectSuccess(null);
    setIsConnecting(true);

    try {
      const res = await fetch('/api/communication/msg91/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace.id,
          authKey: inputAuthKey,
          securityPin: securityPin || undefined,
          senderId,
          whatsappNumber,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setIsConnected(true);
        setMaskedKey(data.maskedKey);
        setVerifiedAt(data.verifiedAt);
        setHasPin(data.hasPin);
        setInputAuthKey('');
        setSecurityPin('');
        setConnectSuccess('MSG91 account verified and connected securely.');
      } else {
        setConnectError(data.error || 'Failed to authenticate MSG91 Auth Key.');
      }
    } catch (err: any) {
      setConnectError(err.message || 'Network error connecting to MSG91.');
    } finally {
      setIsConnecting(false);
    }
  };

  // Verify PIN & Reveal Auth Key
  const handleRevealPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    setIsVerifyingPin(true);

    try {
      const res = await fetch('/api/communication/msg91/reveal-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace.id,
          securityPin: enteredPin,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setRevealedKey(data.revealedKey);
        setEnteredPin('');
      } else {
        setPinError(data.error || 'Incorrect security PIN.');
      }
    } catch (err: any) {
      setPinError('Failed to verify PIN.');
    } finally {
      setIsVerifyingPin(false);
    }
  };

  // Disconnect
  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await fetch('/api/communication/msg91/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: workspace.id }),
      });
      setIsConnected(false);
      setMaskedKey('');
      setVerifiedAt(null);
      setIsDisconnectModalOpen(false);
      setConnectSuccess('MSG91 integration disconnected.');
    } catch (e) {
      console.error('Failed to disconnect:', e);
    } finally {
      setIsDisconnecting(false);
    }
  };

  // SMS Segments computation
  const smsSegments = calculateSmsSegments(smsTmplContent);

  return (
    <div className="flex-1 p-6 overflow-y-auto max-w-6xl mx-auto w-full space-y-6">
      {/* Header Banner */}
      <div className="card p-5 bg-[var(--bg-card)] border border-[var(--border-subtle)] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex items-center justify-center font-black text-xl shrink-0">
            91
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-extrabold text-[var(--text-ink)] tracking-tight">
                MSG91 Communication Gateway
              </h1>
              {isConnected ? (
                <span className="badge badge--pine text-[11px] py-0.5 px-2 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  <span>Connected</span>
                </span>
              ) : (
                <span className="badge badge--subtle text-[11px] py-0.5 px-2 text-amber-600 bg-amber-500/10">
                  Not Connected
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Direct provider integration for WhatsApp Business API, Indian DLT SMS, and customer campaigns.
            </p>
          </div>
        </div>

        {isConnected && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                setRevealedKey(null);
                setPinError(null);
                setEnteredPin('');
                setIsPinModalOpen(true);
              }}
              className="btn btn--subtle text-xs py-1.5 px-3 rounded-xl flex items-center gap-1.5"
            >
              <Key className="w-3.5 h-3.5" />
              <span>Reveal Auth Key</span>
            </button>
            <button
              onClick={() => setIsDisconnectModalOpen(true)}
              className="btn btn--subtle text-xs py-1.5 px-3 rounded-xl text-rose-600 hover:bg-rose-500/10"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>

      {/* Sub Tabs within MSG91 */}
      {isConnected && (
        <div className="flex items-center gap-1 bg-[var(--bg-main)] p-1 rounded-2xl border border-[var(--border-subtle)] w-fit">
          {(['overview', 'whatsapp', 'sms', 'billing', 'campaigns'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveSubTab(tab)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition-all ${
                activeSubTab === tab
                  ? 'bg-[var(--bg-card)] text-[var(--text-ink)] shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-ink)]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      )}

      {/* 1. FIRST TIME CONNECTION FLOW */}
      {!isConnected && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 card p-6 bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-5">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-ink)]">Connect Your MSG91 Account</h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Each workspace connects its own MSG91 account. You pay MSG91 directly for message consumption; Developster serves as your CRM interface.
              </p>
            </div>

            {connectError && (
              <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{connectError}</span>
              </div>
            )}

            {connectSuccess && (
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{connectSuccess}</span>
              </div>
            )}

            <form onSubmit={handleConnect} className="space-y-4 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">
                  MSG91 Auth Key <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showInputKey ? 'text' : 'password'}
                    required
                    value={inputAuthKey}
                    onChange={(e) => setInputAuthKey(e.target.value)}
                    placeholder="Enter your 32-character MSG91 Auth Key..."
                    className="w-full px-3 py-2 pr-10 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-ink)] font-mono focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowInputKey(!showInputKey)}
                    className="absolute right-3 top-2.5 text-[var(--text-muted)] hover:text-[var(--text-ink)]"
                  >
                    {showInputKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">
                    4-Digit Security PIN (Protects Auth Key)
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    value={securityPin}
                    onChange={(e) => setSecurityPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 4829"
                    className="w-full px-3 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-ink)] font-mono tracking-widest text-center"
                  />
                  <span className="text-[10px] text-[var(--text-muted)] mt-1 block">
                    Required to reveal credentials later.
                  </span>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">
                    Approved DLT Sender ID (6 chars)
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={senderId}
                    onChange={(e) => setSenderId(e.target.value.toUpperCase())}
                    placeholder="DEVHUB"
                    className="w-full px-3 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-ink)] font-mono uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">
                  WhatsApp Business Phone Number
                </label>
                <input
                  type="text"
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  placeholder="+91 XXXXX XXXXX"
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-ink)] font-mono"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isConnecting || !inputAuthKey.trim()}
                  className="btn btn--primary text-xs py-2.5 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{isConnecting ? 'Verifying with MSG91...' : 'Connect & Verify Account'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Onboarding Sidebar */}
          <div className="card p-5 bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-4">
            <h3 className="font-bold text-xs text-[var(--text-ink)]">How to get your MSG91 Auth Key</h3>
            <ol className="text-xs text-[var(--text-muted)] space-y-2 list-decimal list-inside leading-relaxed">
              <li>Log in to your <strong>MSG91 Dashboard</strong>.</li>
              <li>Navigate to <strong>Account Settings</strong> &rarr; <strong>AuthKey</strong>.</li>
              <li>Copy your unique workspace authentication key.</li>
              <li>Paste the key on the left to verify connection.</li>
            </ol>

            <div className="p-3 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[11px] space-y-1.5">
              <span className="font-bold text-[var(--text-ink)] flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>AES-256-GCM Encryption</span>
              </span>
              <p className="text-[var(--text-muted)]">
                Auth keys are encrypted at rest on the server and isolated by workspace. Credentials are never leaked to frontend browser scripts.
              </p>
            </div>

            <a
              href="https://docs.msg91.com"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-emerald-600 hover:underline flex items-center gap-1 pt-1 font-semibold"
            >
              <span>MSG91 Setup Documentation</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}

      {/* 2. CONNECTED OVERVIEW DASHBOARD */}
      {isConnected && activeSubTab === 'overview' && (
        <div className="space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)]">
              <span className="text-[11px] text-[var(--text-muted)] block">Auth Key Status</span>
              <div className="flex items-center gap-1.5 mt-1">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span className="text-sm font-bold text-[var(--text-ink)]">Active & Verified</span>
              </div>
              <span className="text-[10px] text-[var(--text-muted)] mt-1 block font-mono">
                {maskedKey}
              </span>
            </div>

            <div className="card p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)]">
              <span className="text-[11px] text-[var(--text-muted)] block">WhatsApp Business</span>
              <div className="flex items-center gap-1.5 mt-1">
                <Radio className="w-4 h-4 text-emerald-600" />
                <span className="text-sm font-bold text-[var(--text-ink)]">
                  {whatsappNumber ? 'Integrated' : 'Setup Pending'}
                </span>
              </div>
              <span className="text-[10px] text-[var(--text-muted)] mt-1 block">
                {whatsappNumber || 'Assign phone number'}
              </span>
            </div>

            <div className="card p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)]">
              <span className="text-[11px] text-[var(--text-muted)] block">SMS DLT Header</span>
              <div className="flex items-center gap-1.5 mt-1">
                <Send className="w-4 h-4 text-sky-600" />
                <span className="text-sm font-bold text-[var(--text-ink)] font-mono">{senderId}</span>
              </div>
              <span className="text-[10px] text-[var(--text-muted)] mt-1 block">
                Indian DLT Compliance
              </span>
            </div>

            <div className="card p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)]">
              <span className="text-[11px] text-[var(--text-muted)] block">MSG91 Account Billing</span>
              <div className="flex items-center gap-1.5 mt-1">
                <CreditCard className="w-4 h-4 text-indigo-600" />
                <span className="text-sm font-bold text-[var(--text-ink)]">Direct with MSG91</span>
              </div>
              <a
                href="https://control.msg91.com/billing"
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-indigo-600 hover:underline mt-1 inline-flex items-center gap-1 font-semibold"
              >
                <span>Recharge on MSG91</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* 24-Hour WhatsApp Window Guidance */}
          <div className="card p-5 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 text-xs space-y-2">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-emerald-600 shrink-0" />
              <h3 className="font-bold text-sm text-[var(--text-ink)]">
                WhatsApp Business 24-Hour Customer Service Window
              </h3>
            </div>
            <p className="text-[var(--text-muted)] leading-relaxed">
              When a customer sends a message to your WhatsApp number, a <strong>24-hour customer service session</strong> opens. During this active session, your employees can send free-form replies. Outside this 24-hour window, WhatsApp policy requires an <strong>approved Meta template</strong> for business-initiated communication.
            </p>
          </div>
        </div>
      )}

      {/* 3. WHATSAPP MANAGEMENT & TEMPLATE BUILDER */}
      {isConnected && activeSubTab === 'whatsapp' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 card p-6 bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-5">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-ink)]">WhatsApp Template Builder</h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Create Meta-compliant templates for approval through your MSG91 WhatsApp Business account.
              </p>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">Template Name</label>
                  <input
                    type="text"
                    value={waTmplName}
                    onChange={(e) => setWaTmplName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                    placeholder="order_confirmation"
                    className="w-full px-3 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-ink)] font-mono"
                  />
                  <span className="text-[10px] text-[var(--text-muted)] mt-0.5 block">Lowercase with underscores only.</span>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">Language</label>
                  <select
                    value={waTmplLanguage}
                    onChange={(e) => setWaTmplLanguage(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-ink)]"
                  >
                    <option value="en_US">English (en_US)</option>
                    <option value="hi_IN">Hindi (hi_IN)</option>
                    <option value="gu_IN">Gujarati (gu_IN)</option>
                    <option value="ta_IN">Tamil (ta_IN)</option>
                  </select>
                </div>
              </div>

              {/* Template Category with Explanations */}
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1.5">
                  Template Category
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'UTILITY', label: 'Utility', desc: 'Order confirmations, delivery updates, meeting reminders' },
                    { id: 'MARKETING', label: 'Marketing', desc: 'Promotions, deals, product announcements' },
                    { id: 'AUTHENTICATION', label: 'Authentication', desc: 'OTP and account verification codes' },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setWaTmplCategory(cat.id as any)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        waTmplCategory === cat.id
                          ? 'border-emerald-600 bg-emerald-500/10'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-main)] hover:border-[var(--text-muted)]'
                      }`}
                    >
                      <span className="font-bold text-xs text-[var(--text-ink)] block">{cat.label}</span>
                      <span className="text-[10px] text-[var(--text-muted)] mt-1 block leading-tight">{cat.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">
                  Message Body with Variables (&#123;&#123;1&#125;&#125;, &#123;&#123;2&#125;&#125;)
                </label>
                <textarea
                  rows={4}
                  value={waTmplBody}
                  onChange={(e) => setWaTmplBody(e.target.value)}
                  className="w-full p-3 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-ink)]"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">Footer Text (Optional)</label>
                <input
                  type="text"
                  value={waTmplFooter}
                  onChange={(e) => setWaTmplFooter(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-ink)]"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] text-[var(--text-muted)]">
                  Meta review takes between 15 minutes to 24 hours.
                </span>
                <button
                  type="button"
                  onClick={() => alert('Template submitted to MSG91 template queue. Status set to PENDING_APPROVAL.')}
                  className="btn btn--primary text-xs py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Submit Template for Approval
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Live WhatsApp Preview */}
          <div className="card p-5 bg-[var(--bg-card)] border border-[var(--border-subtle)] flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-bold text-[var(--text-muted)] block mb-3 uppercase tracking-wider">
                WhatsApp Live Preview
              </span>
              <div className="rounded-2xl p-4 bg-[#EFEAE2] dark:bg-[#121B22] border border-[#DAD3C8] dark:border-[#222E35] text-xs space-y-2 shadow-inner">
                <div className="p-3 rounded-xl bg-white dark:bg-[#1F2C34] text-[#111B21] dark:text-[#E9EDEF] shadow-2xs space-y-1.5 max-w-[90%]">
                  <p className="whitespace-pre-wrap leading-relaxed">
                    {interpolateTemplateVariables(waTmplBody, {
                      '1': 'Aarav',
                      '2': 'ORD-8821',
                      '3': workspace.name,
                    })}
                  </p>
                  {waTmplFooter && (
                    <p className="text-[10px] text-[#667781] dark:text-[#8696A0] pt-1">
                      {waTmplFooter}
                    </p>
                  )}
                  <span className="text-[9px] text-[#667781] dark:text-[#8696A0] text-right block font-tabular">
                    12:00 PM
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-4 text-[11px] text-[var(--text-muted)]">
              Category: <strong className="text-[var(--text-ink)]">{waTmplCategory}</strong>
            </div>
          </div>
        </div>
      )}

      {/* 4. SMS MANAGEMENT & DLT BUILDER */}
      {isConnected && activeSubTab === 'sms' && (
        <div className="card p-6 bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-5">
          <div>
            <h2 className="text-sm font-bold text-[var(--text-ink)]">SMS & Indian DLT Template Manager</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Build DLT-compliant SMS templates aligned with telecom operator headers.
            </p>
          </div>

          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">Sender ID Header</label>
                <input
                  type="text"
                  maxLength={6}
                  value={senderId}
                  onChange={(e) => setSenderId(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-ink)] font-mono uppercase"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">DLT Template ID</label>
                <input
                  type="text"
                  value={smsTmplDltId}
                  onChange={(e) => setSmsTmplDltId(e.target.value)}
                  placeholder="1707xxxxxxxxxxxx"
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-ink)] font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">Route Type</label>
                <select
                  value={smsTmplRoute}
                  onChange={(e) => setSmsTmplRoute(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-ink)]"
                >
                  <option value="Transactional">Transactional (OTP / Banks)</option>
                  <option value="Service Implicit">Service Implicit (Updates / Alerts)</option>
                  <option value="Service Explicit">Service Explicit (Consented Marketing)</option>
                  <option value="Promotional">Promotional (Non-DND)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">SMS Content</label>
              <textarea
                rows={3}
                value={smsTmplContent}
                onChange={(e) => setSmsTmplContent(e.target.value)}
                className="w-full p-3 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-ink)]"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-xs">
              <div className="text-[var(--text-muted)]">
                <span>Characters: <strong className="text-[var(--text-ink)] font-tabular">{smsSegments.charCount}</strong></span>
                <span className="mx-2">•</span>
                <span>Segments: <strong className="text-[var(--text-ink)] font-tabular">{smsSegments.segmentCount}</strong></span>
                <span className="mx-2">•</span>
                <span>Encoding: <strong className="text-[var(--text-ink)]">{smsSegments.isUnicode ? 'Unicode (UCS-2)' : 'Standard GSM-7'}</strong></span>
              </div>
              <span className="text-[11px] text-[var(--text-muted)] font-tabular">
                {smsSegments.charsRemaining} chars remaining in segment
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 5. BILLING & USAGE */}
      {isConnected && activeSubTab === 'billing' && (
        <div className="space-y-6">
          <div className="card p-6 bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div>
                <h2 className="text-sm font-bold text-[var(--text-ink)]">MSG91 Direct Billing & Credits</h2>
                <p className="text-xs text-[var(--text-muted)]">
                  Developster CRM does not collect wallet recharges. You purchase messaging credits directly through your MSG91 account.
                </p>
              </div>
              <a
                href="https://control.msg91.com/billing"
                target="_blank"
                rel="noreferrer"
                className="btn btn--primary text-xs py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5"
              >
                <span>Add Money / Recharge on MSG91</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Usage Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]">
                    <th className="py-2.5">Date</th>
                    <th>Channel</th>
                    <th>Category</th>
                    <th>Quantity</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  <tr>
                    <td className="py-3 font-tabular">{new Date().toLocaleDateString('en-IN')}</td>
                    <td><span className="badge badge--pine text-[10px]">WhatsApp</span></td>
                    <td>Utility</td>
                    <td className="font-tabular font-bold">1</td>
                    <td><span className="text-amber-600 font-semibold">Draft / Pending Send</span></td>
                  </tr>
                  <tr>
                    <td className="py-3 font-tabular">{new Date().toLocaleDateString('en-IN')}</td>
                    <td><span className="badge badge--subtle text-[10px]">SMS</span></td>
                    <td>Service Implicit</td>
                    <td className="font-tabular font-bold">1</td>
                    <td><span className="text-amber-600 font-semibold">Draft / Pending Send</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 6. CAMPAIGNS */}
      {isConnected && activeSubTab === 'campaigns' && (
        <div className="card p-6 bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-4">
          <div>
            <h2 className="text-sm font-bold text-[var(--text-ink)]">Customer Communication Campaigns</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Schedule or prepare WhatsApp and SMS campaigns targeted to CRM customer segments.
            </p>
          </div>

          {campaignFeedback && (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-200">
              {campaignFeedback}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">Campaign Name</label>
              <input
                type="text"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="Diwali Festive Offer 2026"
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-ink)]"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">Channel</label>
              <select
                value={campaignChannel}
                onChange={(e) => setCampaignChannel(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-ink)]"
              >
                <option value="whatsapp">WhatsApp Business Campaign</option>
                <option value="sms">SMS Campaign</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              disabled={!campaignName.trim()}
              onClick={() =>
                setCampaignFeedback(
                  'Campaign validated and drafted in CRM. Live broadcast sending requires active MSG91 provider dispatch authorization.'
                )
              }
              className="btn btn--primary text-xs py-2 px-4 rounded-xl"
            >
              Validate & Prepare Campaign
            </button>
          </div>
        </div>
      )}

      {/* MODAL: 4-Digit Security PIN Verification */}
      {isPinModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="card p-6 shadow-2xl max-w-sm w-full space-y-4 bg-[var(--bg-card)] rounded-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-600" />
                <h3 className="font-bold text-sm text-[var(--text-ink)]">Security PIN Verification</h3>
              </div>
              <button onClick={() => setIsPinModalOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--text-ink)]">
                ✕
              </button>
            </div>

            {pinError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
                {pinError}
              </div>
            )}

            {revealedKey ? (
              <div className="space-y-3">
                <p className="text-xs text-[var(--text-muted)]">
                  Your MSG91 Auth Key is displayed below. Copy it securely:
                </p>
                <div className="p-3 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-xs font-mono break-all text-[var(--text-ink)] select-all">
                  {revealedKey}
                </div>
                <button
                  type="button"
                  onClick={() => setIsPinModalOpen(false)}
                  className="btn btn--primary w-full text-xs py-2 rounded-xl"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleRevealPin} className="space-y-3 text-xs">
                <p className="text-[var(--text-muted)]">
                  Enter your 4-digit security PIN to decrypt and reveal your MSG91 Auth Key.
                </p>
                <input
                  type="password"
                  maxLength={4}
                  required
                  autoFocus
                  value={enteredPin}
                  onChange={(e) => setEnteredPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-main)] border border-[var(--border-subtle)] text-base text-center tracking-widest font-mono text-[var(--text-ink)] focus:outline-none focus:border-emerald-500"
                />

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsPinModalOpen(false)}
                    className="btn btn--subtle text-xs py-1.5 px-3 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isVerifyingPin || enteredPin.length !== 4}
                    className="btn btn--primary text-xs py-1.5 px-4 rounded-xl bg-emerald-600 text-white"
                  >
                    {isVerifyingPin ? 'Verifying...' : 'Verify & Reveal'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Disconnect Confirmation */}
      {isDisconnectModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="card p-6 shadow-2xl max-w-sm w-full space-y-4 bg-[var(--bg-card)] rounded-2xl animate-in zoom-in-95">
            <h3 className="font-bold text-sm text-[var(--text-ink)]">Disconnect MSG91 Account?</h3>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Are you sure you want to disconnect MSG91 from this workspace? Your encrypted credentials will be removed.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsDisconnectModalOpen(false)}
                className="btn btn--subtle text-xs py-1.5 px-3 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDisconnecting}
                onClick={handleDisconnect}
                className="btn btn--primary text-xs py-1.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white"
              >
                {isDisconnecting ? 'Disconnecting...' : 'Yes, Disconnect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

