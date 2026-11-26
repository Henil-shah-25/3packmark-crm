'use client';

import React, { useState, useEffect } from 'react';
import {
  Database,
  Building2,
  GitBranch,
  Save,
  CheckCircle,
  AlertCircle,
  Download,
  Plus,
  RefreshCw,
  ExternalLink,
  Shield,
  Sparkles,
  Mail,
  Calendar,
  Video,
  Send,
  Unplug,
  Check,
  Copy,
  Key,
} from 'lucide-react';
import { Workspace, Pipeline, PipelineStage } from '@/types/crm';
import { HeaderReveal } from '@/components/ui/HeaderReveal';
import { SlidingTabs } from '@/components/ui/SlidingTabs';
import { MagneticButton } from '@/components/ui/MagneticButton';
import { APP_BUSINESS_NAME } from '@/lib/config';
import { SystemHealthTab } from './SystemHealthTab';
import DOMPurify from 'isomorphic-dompurify';
import { STAGE_COLOR_PRESETS, resolveStageHex, getContrastTextHex } from '@/lib/pipeline/stage-colors';
import { DEFAULT_3W_SELLER } from '@/lib/quotation/commercialOfferTemplate';

interface SettingsViewProps {
  workspaces: Workspace[];
  activeWorkspace: Workspace;
  pipeline: Pipeline;
  stages: PipelineStage[];
  userRole?: string;
  onUpdateWorkspace: (updates: Partial<Workspace>) => Promise<void>;
  onSavePipeline: (updatedPipeline: Pipeline) => Promise<void>;
  onRefreshStorageStatus: () => Promise<void>;
  onExportCSV: () => void;
  storageStatus?: {
    isLiveGoogleSheets: boolean;
    spreadsheetId?: string;
    sheetTitle?: string;
    message?: string;
  };
}

export function SettingsView({
  workspaces,
  activeWorkspace,
  pipeline,
  stages,
  userRole,
  onUpdateWorkspace,
  onSavePipeline,
  onRefreshStorageStatus,
  onExportCSV,
  storageStatus,
}: SettingsViewProps) {
  const isAdmin = !userRole || userRole === 'Owner' || userRole === 'Admin';
  const [activeTab, setActiveTab] = useState<'business_profile' | 'workspace' | 'tally' | 'integrations' | 'sheets' | 'pipeline' | 'health'>('business_profile');

  // TallyPrime Integration state
  const [tallyUrl, setTallyUrl] = useState(activeWorkspace.tallyUrl || 'http://localhost:9000');
  const [tallyCompanyName, setTallyCompanyName] = useState(activeWorkspace.tallyCompanyName || '3packmark Private Limited');
  const [tallySalesLedger, setTallySalesLedger] = useState(activeWorkspace.tallySalesLedger || 'Sales Accounts');
  const [tallyMode, setTallyMode] = useState<'live' | 'download'>(activeWorkspace.tallyMode || 'live');
  const [isSavingTally, setIsSavingTally] = useState(false);
  const [tallySavedSuccess, setTallySavedSuccess] = useState(false);
  const [openColorDropdownStageId, setOpenColorDropdownStageId] = useState<string | null>(null);
  const [savedStageColorId, setSavedStageColorId] = useState<string | null>(null);

  // Business Profile & Quotation Seller form state
  const [bpCompanyName, setBpCompanyName] = useState(activeWorkspace.companyName || DEFAULT_3W_SELLER.companyName);
  const [bpSenderName, setBpSenderName] = useState(activeWorkspace.senderName || '3W PACKMARK Team');
  const [bpSenderEmail, setBpSenderEmail] = useState(activeWorkspace.senderEmail || 'sales@3wpackmark.com');
  const [bpPhone, setBpPhone] = useState(activeWorkspace.phone || DEFAULT_3W_SELLER.contact);
  const [bpSellerAddress, setBpSellerAddress] = useState(activeWorkspace.sellerAddress || DEFAULT_3W_SELLER.address);
  const [bpSellerGstin, setBpSellerGstin] = useState(activeWorkspace.sellerGstin || DEFAULT_3W_SELLER.gstin);
  const [bpSellerState, setBpSellerState] = useState(activeWorkspace.sellerState || DEFAULT_3W_SELLER.stateName);
  const [bpSellerCin, setBpSellerCin] = useState(activeWorkspace.sellerCin || DEFAULT_3W_SELLER.cin);
  const [bpSellerPan, setBpSellerPan] = useState(activeWorkspace.sellerPan || DEFAULT_3W_SELLER.pan);
  const [bpBankName, setBpBankName] = useState(activeWorkspace.bankName || DEFAULT_3W_SELLER.bankName);
  const [bpBankAccountNo, setBpBankAccountNo] = useState(activeWorkspace.bankAccountNo || DEFAULT_3W_SELLER.bankAccountNo);
  const [bpBankBranchIfsc, setBpBankBranchIfsc] = useState(activeWorkspace.bankBranchIfsc || DEFAULT_3W_SELLER.bankBranchIfsc);
  const [bpSignatureName, setBpSignatureName] = useState(activeWorkspace.signatureName || DEFAULT_3W_SELLER.signatureName);
  const [bpSignatureImageUrl, setBpSignatureImageUrl] = useState(activeWorkspace.signatureImageUrl || '');
  const [bpWebsite, setBpWebsite] = useState(activeWorkspace.website || 'https://developster.com');
  const [bpPortfolioUrl, setBpPortfolioUrl] = useState(activeWorkspace.portfolioUrl || 'https://developster.com/portfolio');
  const [bpSignature, setBpSignature] = useState(
    activeWorkspace.emailSignature ||
    '<p>Best regards,<br/><strong>Developster Hub</strong><br/><a href="https://developster.com">developster.com</a></p>'
  );
  const [bpTimezone, setBpTimezone] = useState(activeWorkspace.timezone || 'Asia/Kolkata');
  const [bpCountryCode, setBpCountryCode] = useState(activeWorkspace.defaultCountryCode || '+91');
  const [isSavingBp, setIsSavingBp] = useState(false);
  const [bpSavedSuccess, setBpSavedSuccess] = useState(false);

  // Integrations state
  const [geminiStatus, setGeminiStatus] = useState<{
    tested: boolean;
    isConfigured?: boolean;
    success?: boolean;
    state?: string;
    message?: string;
    model?: string;
    keySource?: string;
    loading?: boolean;
  }>({ tested: false });

  const [smtpStatus, setSmtpStatus] = useState<{
    tested: boolean;
    isConfigured?: boolean;
    success?: boolean;
    state?: string;
    message?: string;
    host?: string;
    port?: number;
    user?: string;
    hasUser?: boolean;
    hasPass?: boolean;
    loading?: boolean;
  }>({ tested: false });

  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<string | null>(null);

  const [calendarStatus, setCalendarStatus] = useState<{
    tested: boolean;
    connected: boolean;
    isConfigured: boolean;
    state?: string;
    email?: string;
    redirectUri?: string;
    clientIdMasked?: string;
    hasClientSecret?: boolean;
    message?: string;
    loading?: boolean;
    testing?: boolean;
    testMessage?: string | null;
  }>({ tested: false, connected: false, isConfigured: false });

  // OAuth & Credentials Form State
  const [calClientId, setCalClientId] = useState('');
  const [calClientSecret, setCalClientSecret] = useState('');
  const [calRedirectUri, setCalRedirectUri] = useState('');
  const [calSaving, setCalSaving] = useState(false);
  const [calSavedMessage, setCalSavedMessage] = useState<string | null>(null);
  const [calCopied, setCalCopied] = useState(false);

  const [showSmtpForm, setShowSmtpForm] = useState(false);
  const [smtpUserInput, setSmtpUserInput] = useState('');
  const [smtpPassInput, setSmtpPassInput] = useState('');
  const [smtpHostInput, setSmtpHostInput] = useState('');
  const [smtpPortInput, setSmtpPortInput] = useState('587');
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpSavedMessage, setSmtpSavedMessage] = useState<string | null>(null);

  const [showGeminiForm, setShowGeminiForm] = useState(false);
  const [geminiApiKeyInput, setGeminiApiKeyInput] = useState('');
  const [geminiModelInput, setGeminiModelInput] = useState('gemini-2.5-flash');
  const [geminiSaving, setGeminiSaving] = useState(false);
  const [geminiSavedMessage, setGeminiSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    // Initial silent check of integration status & load sanitized config
    checkAllIntegrations();
  }, [activeWorkspace.id]);

  const checkAllIntegrations = async () => {
    // 1. Load sanitized config metadata from backend
    try {
      const configRes = await fetch(`/api/integrations/config?workspaceId=${activeWorkspace.id}`);
      if (configRes.ok) {
        const configData = await configRes.json();
        if (configData.google_calendar) {
          setCalRedirectUri(configData.google_calendar.redirectUri || '');
          setCalendarStatus((prev) => ({
            ...prev,
            isConfigured: configData.google_calendar.isConfigured,
            connected: configData.google_calendar.isConnected,
            email: configData.google_calendar.userEmail,
            redirectUri: configData.google_calendar.redirectUri,
            clientIdMasked: configData.google_calendar.clientIdMasked,
            hasClientSecret: configData.google_calendar.hasClientSecret,
            state: configData.google_calendar.state,
          }));
        }
        if (configData.smtp) {
          setSmtpHostInput(configData.smtp.host || 'smtp.gmail.com');
          setSmtpPortInput(String(configData.smtp.port || 587));
        }
      }
    } catch (e) { }

    // 2. Check Calendar OAuth status
    try {
      const res = await fetch(`/api/calendar/status?workspaceId=${activeWorkspace.id}`);
      if (res.ok) {
        const data = await res.json();
        setCalendarStatus((prev) => ({
          ...prev,
          tested: true,
          connected: Boolean(data.isConnected || data.connected),
          isConfigured: Boolean(data.isConfigured),
          email: data.userEmail || data.email,
          redirectUri: data.redirectUri || prev.redirectUri,
          clientIdMasked: data.clientIdMasked || prev.clientIdMasked,
          hasClientSecret: Boolean(data.hasClientSecret),
          state: data.state || (data.isConnected ? 'connected' : data.isConfigured ? 'auth_required' : 'not_configured'),
          message: data.message,
        }));
      }
    } catch (e) { }

    // 3. Safe check of Gemini
    testGemini(true);

    // 4. Safe check of SMTP
    testSmtp(true);
  };

  const testGemini = async (silent = false) => {
    if (!silent) setGeminiStatus((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch('/api/integrations/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'gemini', workspaceId: activeWorkspace.id }),
      });
      const data = await res.json();
      setGeminiStatus({
        tested: true,
        success: data.success,
        isConfigured: data.isConfigured,
        state: data.state,
        keySource: data.keySource,
        message: data.message || (data.success ? 'Gemini AI operational' : 'Verification failed'),
        model: data.model || 'gemini-3.8-flash',
        loading: false,
      });
    } catch (err: any) {
      setGeminiStatus({
        tested: true,
        success: false,
        message: err.message,
        loading: false,
      });
    }
  };

  const testSmtp = async (silent = false) => {
    if (!silent) setSmtpStatus((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch('/api/integrations/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'smtp', workspaceId: activeWorkspace.id }),
      });
      const data = await res.json();
      setSmtpStatus({
        tested: true,
        success: data.success,
        isConfigured: data.isConfigured,
        state: data.state,
        message: data.message || (data.success ? 'Gmail SMTP connection verified' : 'Connection failed'),
        host: data.host,
        port: data.port,
        user: data.user,
        hasUser: data.hasUser,
        hasPass: data.hasPass,
        loading: false,
      });
    } catch (err: any) {
      setSmtpStatus({
        tested: true,
        success: false,
        message: err.message,
        loading: false,
      });
    }
  };

  const handleTestCalendar = async () => {
    setCalendarStatus((prev) => ({ ...prev, testing: true, testMessage: null }));
    try {
      const res = await fetch('/api/integrations/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'google_calendar_test', workspaceId: activeWorkspace.id }),
      });
      const data = await res.json();
      setCalendarStatus((prev) => ({
        ...prev,
        testing: false,
        testMessage: data.message || (data.success ? 'Calendar API connection verified!' : 'Test failed'),
      }));
    } catch (err: any) {
      setCalendarStatus((prev) => ({
        ...prev,
        testing: false,
        testMessage: err.message || 'Network test failed.',
      }));
    }
  };

  const handleSaveCalendarConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setCalSaving(true);
    setCalSavedMessage(null);
    try {
      const res = await fetch('/api/integrations/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: 'google_calendar',
          clientId: calClientId,
          clientSecret: calClientSecret,
          redirectUri: calRedirectUri,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCalSavedMessage('Google Calendar OAuth credentials saved to server configuration.');
        setCalClientSecret(''); // Clear secret from client-side state
        checkAllIntegrations();
      } else {
        setCalSavedMessage(`Error: ${data.error || 'Failed to save configuration'}`);
      }
    } catch (err: any) {
      setCalSavedMessage(`Error: ${err.message}`);
    } finally {
      setCalSaving(false);
    }
  };

  const handleSaveSmtpConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSmtpSaving(true);
    setSmtpSavedMessage(null);
    try {
      const res = await fetch('/api/integrations/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: 'smtp',
          smtpHost: smtpHostInput,
          smtpPort: smtpPortInput,
          smtpUser: smtpUserInput,
          smtpPass: smtpPassInput,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSmtpSavedMessage('SMTP credentials saved to server configuration.');
        setSmtpPassInput(''); // Clear password from client-side state
        checkAllIntegrations();
      } else {
        setSmtpSavedMessage(`Error: ${data.error || 'Failed to save SMTP settings'}`);
      }
    } catch (err: any) {
      setSmtpSavedMessage(`Error: ${err.message}`);
    } finally {
      setSmtpSaving(false);
    }
  };

  const handleSaveGeminiConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeminiSaving(true);
    setGeminiSavedMessage(null);
    try {
      const res = await fetch('/api/integrations/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: 'gemini',
          geminiApiKey: geminiApiKeyInput,
          geminiModel: geminiModelInput,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setGeminiSavedMessage('Gemini AI API Key saved to server configuration.');
        setGeminiApiKeyInput(''); // Clear key from client-side state
        checkAllIntegrations();
      } else {
        setGeminiSavedMessage(`Error: ${data.error || 'Failed to save Gemini settings'}`);
      }
    } catch (err: any) {
      setGeminiSavedMessage(`Error: ${err.message}`);
    } finally {
      setGeminiSaving(false);
    }
  };

  const handleCopyRedirectUri = () => {
    const fallback = typeof window !== 'undefined' ? `${window.location.origin}/api/calendar/callback` : 'http://localhost:3000/api/calendar/callback';
    const uri = calRedirectUri || fallback;
    navigator.clipboard.writeText(uri);
    setCalCopied(true);
    setTimeout(() => setCalCopied(false), 2000);
  };

  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmailAddress) return;
    setIsSendingTestEmail(true);
    setTestEmailResult(null);
    try {
      const res = await fetch('/api/integrations/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: 'smtp_send_test',
          testEmailTo: testEmailAddress,
          workspaceId: activeWorkspace.id,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestEmailResult(`Test email successfully delivered to ${testEmailAddress}`);
      } else {
        setTestEmailResult(`Error: ${data.error || 'Failed to dispatch email'}`);
      }
    } catch (err: any) {
      setTestEmailResult(`Delivery failed: ${err.message}`);
    } finally {
      setIsSendingTestEmail(false);
    }
  };

  const handleSaveTallySettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingTally(true);
    setTallySavedSuccess(false);
    try {
      await onUpdateWorkspace({
        tallyUrl: tallyUrl.trim(),
        tallyCompanyName: tallyCompanyName.trim() || '3packmark Private Limited',
        tallySalesLedger: tallySalesLedger.trim() || 'Sales Accounts',
        tallyMode,
      });
      setTallySavedSuccess(true);
      setTimeout(() => setTallySavedSuccess(false), 3000);
    } finally {
      setIsSavingTally(false);
    }
  };

  const handleConnectCalendar = async () => {
    try {
      const res = await fetch(`/api/calendar/auth?workspaceId=${activeWorkspace.id}`);
      if (res.ok) {
        const { authUrl } = await res.json();
        if (authUrl) window.location.href = authUrl;
      } else {
        alert('Could not start OAuth flow. Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Google Calendar setup below.');
      }
    } catch (err: any) {
      alert('OAuth error: ' + err.message);
    }
  };

  const handleDisconnectCalendar = async () => {
    if (!confirm('Disconnect Google Calendar for this workspace?')) return;
    try {
      const res = await fetch(`/api/calendar/disconnect?workspaceId=${activeWorkspace.id}`, { method: 'POST' });
      if (res.ok) {
        setCalendarStatus((prev) => ({ ...prev, tested: true, connected: false, state: 'auth_required' }));
      }
    } catch (err: any) {
      alert('Error disconnecting: ' + err.message);
    }
  };

  // Google Sheets credentials state
  const [spreadsheetId, setSpreadsheetId] = useState(storageStatus?.spreadsheetId || '');
  const [clientEmail, setClientEmail] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [isSavingCreds, setIsSavingCreds] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initResult, setInitResult] = useState<string | null>(null);
  const [diagnosticReport, setDiagnosticReport] = useState<any | null>(null);
  const [isRunningDiagnostic, setIsRunningDiagnostic] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconcileReport, setReconcileReport] = useState<{
    success: boolean;
    reconciledCount: number;
    issuesFixed: { leadId: string; title: string; issue: string }[];
  } | null>(null);

  const handleReconcileData = async () => {
    setIsReconciling(true);
    setReconcileReport(null);
    try {
      const res = await fetch('/api/sheets/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reconcile_data', workspaceId: activeWorkspace.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setReconcileReport(data);
        await onRefreshStorageStatus();
      } else {
        alert(data.error || 'Reconciliation failed');
      }
    } catch (err: any) {
      alert(err.message || 'Reconciliation failed');
    } finally {
      setIsReconciling(false);
    }
  };

  const handleRunComprehensiveTest = async () => {
    setIsRunningDiagnostic(true);
    setDiagnosticReport(null);
    try {
      const res = await fetch('/api/sheets/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'comprehensive_test' }),
      });
      const data = await res.json();
      setDiagnosticReport(data);
      await onRefreshStorageStatus();
    } catch (err: any) {
      setDiagnosticReport({ overallSuccess: false, error: err.message, steps: [] });
    } finally {
      setIsRunningDiagnostic(false);
    }
  };

  // Workspace form state
  const [wsName, setWsName] = useState(activeWorkspace.name);
  const [wsIndustry, setWsIndustry] = useState(activeWorkspace.industry);
  const [wsCurrency, setWsCurrency] = useState(activeWorkspace.currency);
  const [wsTarget, setWsTarget] = useState(String(activeWorkspace.monthlyTarget || 0));
  const [isSavingWs, setIsSavingWs] = useState(false);

  // Pipeline stages editor state
  const [editableStages, setEditableStages] = useState<PipelineStage[]>(stages);
  const [isSavingPipe, setIsSavingPipe] = useState(false);

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingCreds(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/sheets/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_credentials',
          spreadsheetId,
          clientEmail,
          privateKey,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult({ success: true, message: 'Credentials saved! You can now initialize the sheet tables.' });
        await onRefreshStorageStatus();
      } else {
        setTestResult({ success: false, message: data.error || 'Failed to save credentials' });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setIsSavingCreds(false);
    }
  };

  const handleInitializeSheetDatabase = async () => {
    setIsInitializing(true);
    setInitResult(null);
    try {
      const res = await fetch('/api/sheets/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'init_database' }),
      });
      const data = await res.json();
      if (res.ok) {
        setInitResult(`Database tables initialized successfully in your Google Sheet! Created: ${data.createdSheets?.join(', ') || 'All verified'}`);
        await onRefreshStorageStatus();
      } else {
        setInitResult(`Initialization error: ${data.error}`);
      }
    } catch (err: any) {
      setInitResult(`Error: ${err.message}`);
    } finally {
      setIsInitializing(false);
    }
  };

  const handlePushAllToSheets = async () => {
    setIsInitializing(true);
    try {
      const res = await fetch('/api/sheets/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'export_to_sheets' }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Successfully synced ${data.rowsExported} CRM records directly to your Google Sheet!`);
        await onRefreshStorageStatus();
      } else {
        alert(`Export error: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsInitializing(false);
    }
  };

  const handleSaveBusinessProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingBp(true);
    setBpSavedSuccess(false);
    try {
      await onUpdateWorkspace({
        companyName: bpCompanyName,
        name: bpCompanyName,
        senderName: bpSenderName,
        senderEmail: bpSenderEmail,
        phone: bpPhone,
        sellerContact: bpPhone,
        sellerAddress: bpSellerAddress,
        sellerGstin: bpSellerGstin,
        sellerState: bpSellerState,
        sellerCin: bpSellerCin,
        sellerPan: bpSellerPan,
        bankName: bpBankName,
        bankAccountNo: bpBankAccountNo,
        bankBranchIfsc: bpBankBranchIfsc,
        signatureName: bpSignatureName,
        signatureImageUrl: bpSignatureImageUrl,
        website: bpWebsite,
        portfolioUrl: bpPortfolioUrl,
        emailSignature: bpSignature,
        timezone: bpTimezone,
        defaultCountryCode: bpCountryCode,
      });
      setBpSavedSuccess(true);
      setTimeout(() => setBpSavedSuccess(false), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to update business profile');
    } finally {
      setIsSavingBp(false);
    }
  };

  const handleSaveWorkspaceProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingWs(true);
    try {
      await onUpdateWorkspace({
        name: wsName,
        industry: wsIndustry,
        currency: wsCurrency,
        monthlyTarget: parseFloat(wsTarget) || 0,
      });
      alert('Business workspace profile updated.');
    } catch (err: any) {
      alert(err.message || 'Failed to update workspace');
    } finally {
      setIsSavingWs(false);
    }
  };

  const handleSavePipelineStages = async () => {
    setIsSavingPipe(true);
    try {
      await onSavePipeline({
        ...pipeline,
        stages: editableStages,
      });
      alert('Pipeline stages updated successfully.');
    } catch (err: any) {
      alert(err.message || 'Failed to update pipeline stages');
    } finally {
      setIsSavingPipe(false);
    }
  };

  const handleInstantStageColorSave = async (idx: number, newColor: string) => {
    const updated = editableStages.map((s, i) => (i === idx ? { ...s, color: newColor } : s));
    setEditableStages(updated);
    const stageId = updated[idx]?.id;
    try {
      await onSavePipeline({
        ...pipeline,
        stages: updated,
      });
      if (stageId) {
        setSavedStageColorId(stageId);
        setTimeout(() => setSavedStageColorId((prev) => (prev === stageId ? null : prev)), 2000);
      }
    } catch (err) {
      console.error('Failed to persist stage color:', err);
    }
  };

  const handleAddCustomStage = () => {
    const newStage: PipelineStage = {
      id: `stage-${Date.now()}`,
      workspaceId: activeWorkspace.id,
      pipelineId: pipeline.id,
      name: 'Custom Review',
      order: editableStages.length + 1,
      color: 'charcoal',
      probability: 60,
    };
    setEditableStages([...editableStages, newStage]);
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Header with reveal & animated count-up tiles */}
      <HeaderReveal
        title="System Settings"
        subtitle="Integrations dashboard, Google Sheets persistent database, workspace configuration & pipeline stages"
        tiles={[
          {
            label: 'Integrations',
            numericValue: 4,
            badge: 'APIs & OAuth',
          },
          {
            label: 'Workspaces',
            numericValue: workspaces.length,
            badge: activeWorkspace.name,
          },
          {
            label: 'Pipeline Stages',
            numericValue: editableStages.length,
            badge: pipeline.name,
          },
        ]}
      />

      {/* Sliding Tabs */}
      <SlidingTabs
        options={[
          { id: 'business_profile', label: 'Business Profile' },
          { id: 'workspace', label: 'Business Workspaces' },
          ...(isAdmin ? [{ id: 'tally', label: 'TallyPrime Integration' }] : []),
          { id: 'integrations', label: 'Integrations & APIs' },
          { id: 'sheets', label: 'Google Sheets Database' },
          { id: 'pipeline', label: 'Custom Pipelines & Stages' },
          { id: 'health', label: 'System Health' },
        ]}
        value={activeTab}
        onChange={(val) => setActiveTab(val as any)}
      />

      {/* TAB: Business Profile (Feeds Email templates, Reminders & AI) */}
      {activeTab === 'business_profile' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="p-5 rounded-3xl bg-[#FAF8F2] border border-[#E3DCCF]">
            <h2 className="text-sm font-bold text-[#262720]">Business Profile & Communication Identity</h2>
            <p className="text-xs text-[#77766D] mt-0.5">
              Configure your core business identity, sender credentials, timezone, and HTML signature. These details automatically feed email templates and workspace defaults.
            </p>
          </div>

          <div className="bg-[#FAF8F2] rounded-3xl p-6 sm:p-7 border border-[#E3DCCF] space-y-6">
            <form onSubmit={handleSaveBusinessProfile} className="space-y-5 text-xs max-w-2xl">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Company Name */}
                <div>
                  <label className="font-semibold block mb-1 text-[#262720]">Company / Business Name *</label>
                  <input
                    type="text"
                    required
                    value={bpCompanyName}
                    onChange={(e) => setBpCompanyName(e.target.value)}
                    placeholder="Developster Hub"
                    className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-white text-[#262720] focus:outline-none focus:ring-1 focus:ring-[#262720]"
                  />
                </div>

                {/* Sender Name */}
                <div>
                  <label className="font-semibold block mb-1 text-[#262720]">Sender Name (Display)</label>
                  <input
                    type="text"
                    value={bpSenderName}
                    onChange={(e) => setBpSenderName(e.target.value)}
                    placeholder="e.g. Developster Team"
                    className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-white text-[#262720] focus:outline-none focus:ring-1 focus:ring-[#262720]"
                  />
                </div>

                {/* Sender Email Display */}
                <div>
                  <label className="font-semibold block mb-1 text-[#262720]">Sender Email Address</label>
                  <input
                    type="email"
                    value={bpSenderEmail}
                    onChange={(e) => setBpSenderEmail(e.target.value)}
                    placeholder="developsterhub@gmail.com"
                    className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-white text-[#262720] focus:outline-none focus:ring-1 focus:ring-[#262720]"
                  />
                </div>

                {/* Business Phone */}
                <div>
                  <label className="font-semibold block mb-1 text-[#262720]">Business Phone</label>
                  <input
                    type="tel"
                    value={bpPhone}
                    onChange={(e) => setBpPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-white text-[#262720] focus:outline-none focus:ring-1 focus:ring-[#262720]"
                  />
                </div>

                {/* Website */}
                <div>
                  <label className="font-semibold block mb-1 text-[#262720]">Official Website</label>
                  <input
                    type="url"
                    value={bpWebsite}
                    onChange={(e) => setBpWebsite(e.target.value)}
                    placeholder="https://developster.com"
                    className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-white text-[#262720] focus:outline-none focus:ring-1 focus:ring-[#262720]"
                  />
                </div>

                {/* Portfolio URL */}
                <div>
                  <label className="font-semibold block mb-1 text-[#262720]">Portfolio / Case Studies URL</label>
                  <input
                    type="url"
                    value={bpPortfolioUrl}
                    onChange={(e) => setBpPortfolioUrl(e.target.value)}
                    placeholder="https://developster.com/portfolio"
                    className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-white text-[#262720] focus:outline-none focus:ring-1 focus:ring-[#262720]"
                  />
                </div>

                {/* Timezone (Default Asia/Kolkata) */}
                <div>
                  <label className="font-semibold block mb-1 text-[#262720]">Timezone</label>
                  <select
                    value={bpTimezone}
                    onChange={(e) => setBpTimezone(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-white text-[#262720] focus:outline-none focus:ring-1 focus:ring-[#262720]"
                  >
                    <option value="Asia/Kolkata">Asia/Kolkata (IST - UTC+05:30)</option>
                    <option value="UTC">UTC (Universal Time)</option>
                    <option value="America/New_York">America/New_York (EST/EDT)</option>
                    <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
                    <option value="Europe/London">Europe/London (GMT/BST)</option>
                    <option value="Asia/Dubai">Asia/Dubai (GST - UTC+04:00)</option>
                    <option value="Asia/Singapore">Asia/Singapore (SGT - UTC+08:00)</option>
                  </select>
                </div>

                {/* Default Country Code */}
                <div>
                  <label className="font-semibold block mb-1 text-[#262720]">Default Country Code</label>
                  <select
                    value={bpCountryCode}
                    onChange={(e) => setBpCountryCode(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-white text-[#262720] focus:outline-none focus:ring-1 focus:ring-[#262720]"
                  >
                    <option value="+91">🇮🇳 India (+91)</option>
                    <option value="+1">🇺🇸 United States / Canada (+1)</option>
                    <option value="+44">🇬🇧 United Kingdom (+44)</option>
                    <option value="+971">🇦🇪 United Arab Emirates (+971)</option>
                    <option value="+65">🇸🇬 Singapore (+65)</option>
                    <option value="+61">🇦🇺 Australia (+61)</option>
                    <option value="+49">🇩🇪 Germany (+49)</option>
                  </select>
                </div>

                {/* Quotation Seller & Bank Details */}
                <div className="sm:col-span-2 pt-3 border-t border-[#E3DCCF]">
                  <h3 className="text-xs font-bold text-[#262720] mb-3">
                    Commercial Offer Seller, Tax &amp; Bank Profile
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="font-semibold block mb-1 text-[#262720]">Registered Seller Address</label>
                      <input
                        type="text"
                        value={bpSellerAddress}
                        onChange={(e) => setBpSellerAddress(e.target.value)}
                        className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-white text-[#262720]"
                      />
                    </div>
                    <div>
                      <label className="font-semibold block mb-1 text-[#262720]">GSTIN / UIN</label>
                      <input
                        type="text"
                        value={bpSellerGstin}
                        onChange={(e) => setBpSellerGstin(e.target.value)}
                        className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-white text-[#262720]"
                      />
                    </div>
                    <div>
                      <label className="font-semibold block mb-1 text-[#262720]">State Name &amp; Code</label>
                      <input
                        type="text"
                        value={bpSellerState}
                        onChange={(e) => setBpSellerState(e.target.value)}
                        className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-white text-[#262720]"
                      />
                    </div>
                    <div>
                      <label className="font-semibold block mb-1 text-[#262720]">CIN</label>
                      <input
                        type="text"
                        value={bpSellerCin}
                        onChange={(e) => setBpSellerCin(e.target.value)}
                        className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-white text-[#262720]"
                      />
                    </div>
                    <div>
                      <label className="font-semibold block mb-1 text-[#262720]">Company PAN</label>
                      <input
                        type="text"
                        value={bpSellerPan}
                        onChange={(e) => setBpSellerPan(e.target.value)}
                        className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-white text-[#262720]"
                      />
                    </div>
                    <div>
                      <label className="font-semibold block mb-1 text-[#262720]">Bank Name</label>
                      <input
                        type="text"
                        value={bpBankName}
                        onChange={(e) => setBpBankName(e.target.value)}
                        className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-white text-[#262720]"
                      />
                    </div>
                    <div>
                      <label className="font-semibold block mb-1 text-[#262720]">Bank Account No.</label>
                      <input
                        type="text"
                        value={bpBankAccountNo}
                        onChange={(e) => setBpBankAccountNo(e.target.value)}
                        className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-white text-[#262720]"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="font-semibold block mb-1 text-[#262720]">Branch &amp; IFS Code</label>
                      <input
                        type="text"
                        value={bpBankBranchIfsc}
                        onChange={(e) => setBpBankBranchIfsc(e.target.value)}
                        className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-white text-[#262720]"
                      />
                    </div>
                    <div>
                      <label className="font-semibold block mb-1 text-[#262720]">Authorised Signatory Title</label>
                      <input
                        type="text"
                        value={bpSignatureName}
                        onChange={(e) => setBpSignatureName(e.target.value)}
                        placeholder="Authorised Signatory"
                        className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-white text-[#262720]"
                      />
                    </div>
                    <div>
                      <label className="font-semibold block mb-1 text-[#262720]">Custom Signature Image URL (Optional)</label>
                      <input
                        type="url"
                        value={bpSignatureImageUrl}
                        onChange={(e) => setBpSignatureImageUrl(e.target.value)}
                        placeholder="https://... (leave blank for digital vector signature)"
                        className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-white text-[#262720]"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Email Signature (HTML) */}
              <div>
                <label className="font-semibold block mb-1 text-[#262720]">
                  Email Signature (HTML)
                </label>
                <textarea
                  rows={4}
                  value={bpSignature}
                  onChange={(e) => setBpSignature(e.target.value)}
                  placeholder="<p>Best regards,<br/><strong>Developster Hub</strong></p>"
                  className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-white text-[#262720] font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-[#262720]"
                />
                <div className="mt-2 p-3 bg-white rounded-xl border border-[#E3DCCF]">
                  <span className="text-[10px] font-bold text-[#77766D] block mb-1">
                    Signature Preview:
                  </span>
                  <div
                    className="text-xs text-[#262720]"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(bpSignature) }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSavingBp}
                  className="px-6 py-2.5 rounded-full bg-[#262720] hover:bg-[#1E201E] text-white font-semibold transition-all shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {isSavingBp ? 'Saving Profile...' : 'Save Business Profile'}
                </button>

                {bpSavedSuccess && (
                  <span className="text-xs font-bold text-emerald-600 flex items-center gap-1 animate-in fade-in">
                    <Check className="w-4 h-4" /> Profile saved successfully!
                  </span>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 0: INTEGRATIONS DASHBOARD */}
      {activeTab === 'integrations' && (
        <div className="space-y-6">
          <div className="p-5 rounded-3xl bg-[#FAF8F2] border border-[#E3DCCF]">
            <h2 className="text-sm font-bold text-[#262720]">Active Services & API Connections</h2>
            <p className="text-xs text-[#77766D] mt-0.5">
              Securely powered by backend environment variables and Google OAuth 2.0. Sensitive keys and tokens are never exposed to the client.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* 2. Gmail SMTP Integration Card */}
            <div className="bg-[#FAF8F2] rounded-3xl p-6 border border-[#E3DCCF] hover-lift transition-all space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-2xl bg-[#EBF2EE] text-[#2F5C50] flex items-center justify-center font-bold">
                      <Mail className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-[#262720]">Gmail SMTP Mailer</h3>
                      <span className="text-[10px] text-[#77766D]">Meeting invitations & automated alerts</span>
                    </div>
                  </div>

                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${smtpStatus.success
                        ? 'bg-[#EBF2EE] text-[#2F5C50] border border-[#2F5C50]/20'
                        : smtpStatus.state === 'not_configured'
                          ? 'bg-[#F3EFE5] text-[#77766D] border border-[#E3DCCF]'
                          : smtpStatus.state === 'auth_failed'
                            ? 'bg-[#FAF0EC] text-[#C8431F] border border-[#C8431F]/20'
                            : !smtpStatus.tested
                              ? 'bg-[#FCF7E6] text-[#292511] border border-[#F2C94C]/40'
                              : 'bg-[#FAF0EC] text-[#C8431F] border border-[#C8431F]/20'
                      }`}
                  >
                    {smtpStatus.success
                      ? 'Connected & Verified'
                      : smtpStatus.state === 'not_configured'
                        ? 'Not Configured'
                        : smtpStatus.state === 'auth_failed'
                          ? 'Auth Failed (App Password)'
                          : !smtpStatus.tested
                            ? 'Configured in .env'
                            : 'Connection Failed'}
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/80 border border-[#E3DCCF] space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-[#77766D]">
                    <span>Host / Port:</span>
                    <span className="font-mono text-[#262720]">{smtpStatus.host || 'smtp.gmail.com'}:{smtpStatus.port || 587}</span>
                  </div>
                  <div className="flex items-center justify-between text-[#77766D]">
                    <span>Account:</span>
                    <span className="font-mono text-[#262720]">{smtpStatus.user || 'Not configured in .env'}</span>
                  </div>
                  {smtpStatus.message && (
                    <div className={`text-[11px] pt-1.5 border-t border-[#E3DCCF]/60 leading-relaxed ${smtpStatus.success ? 'text-[#2F5C50]' : 'text-[#C8431F]'
                      }`}>
                      {smtpStatus.message}
                    </div>
                  )}
                </div>

                {/* Optional SMTP Credentials Setup Form */}
                {showSmtpForm && (
                  <form onSubmit={handleSaveSmtpConfig} className="p-3.5 rounded-2xl bg-white border border-[#E3DCCF] space-y-2 text-xs animate-in fade-in-50">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] font-semibold text-[#262720]">SMTP Host</label>
                        <input
                          type="text"
                          value={smtpHostInput}
                          onChange={(e) => setSmtpHostInput(e.target.value)}
                          placeholder="smtp.gmail.com"
                          className="w-full mt-1 p-2 rounded-xl bg-[#FAF8F2] border border-[#E3DCCF] text-[11px] focus:outline-none focus:ring-1 focus:ring-[#262720]"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-[#262720]">Port</label>
                        <input
                          type="text"
                          value={smtpPortInput}
                          onChange={(e) => setSmtpPortInput(e.target.value)}
                          placeholder="587"
                          className="w-full mt-1 p-2 rounded-xl bg-[#FAF8F2] border border-[#E3DCCF] text-[11px] focus:outline-none focus:ring-1 focus:ring-[#262720]"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-[#262720]">Gmail Address (SMTP_USER)</label>
                      <input
                        type="email"
                        value={smtpUserInput}
                        onChange={(e) => setSmtpUserInput(e.target.value)}
                        placeholder="your-name@gmail.com"
                        className="w-full mt-1 p-2 rounded-xl bg-[#FAF8F2] border border-[#E3DCCF] text-[11px] focus:outline-none focus:ring-1 focus:ring-[#262720]"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-[#262720]">Google App Password (SMTP_PASS)</label>
                      <input
                        type="password"
                        value={smtpPassInput}
                        onChange={(e) => setSmtpPassInput(e.target.value)}
                        placeholder="16-character Google App Password"
                        className="w-full mt-1 p-2 rounded-xl bg-[#FAF8F2] border border-[#E3DCCF] text-[11px] focus:outline-none focus:ring-1 focus:ring-[#262720]"
                      />
                      <span className="text-[10px] text-[#77766D] mt-0.5 block">
                        Requires 2-Step Verification: Generate at myaccount.google.com/apppasswords
                      </span>
                    </div>
                    {smtpSavedMessage && (
                      <p className={`text-[11px] ${smtpSavedMessage.startsWith('Error') ? 'text-[#C8431F]' : 'text-[#2F5C50]'}`}>
                        {smtpSavedMessage}
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={smtpSaving}
                      className="w-full py-2 rounded-xl bg-[#262720] hover:bg-[#1E201E] text-white text-[11px] font-semibold button-press transition-all disabled:opacity-50"
                    >
                      {smtpSaving ? 'Saving...' : 'Save SMTP Settings'}
                    </button>
                  </form>
                )}

                {/* Optional Test Email Dispatcher */}
                <form onSubmit={handleSendTestEmail} className="flex items-center gap-1.5 pt-1">
                  <input
                    type="email"
                    value={testEmailAddress}
                    onChange={(e) => setTestEmailAddress(e.target.value)}
                    placeholder="Enter recipient email to test dispatch..."
                    className="flex-1 text-[11px] p-2 rounded-xl bg-white border border-[#E3DCCF] focus:outline-none focus:ring-1 focus:ring-[#262720]"
                  />
                  <button
                    type="submit"
                    disabled={isSendingTestEmail}
                    className="px-3.5 py-2 rounded-xl bg-[#262720] hover:bg-[#1E201E] text-white text-[11px] font-semibold shrink-0 button-press transition-all disabled:opacity-50 shadow-2xs"
                  >
                    {isSendingTestEmail ? 'Sending...' : 'Send Test'}
                  </button>
                </form>
                {testEmailResult && (
                  <p className="text-[11px] text-[#2F5C50] font-medium">{testEmailResult}</p>
                )}
              </div>

              <div className="pt-2 border-t border-[#E3DCCF] flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setShowSmtpForm(!showSmtpForm)}
                  className="text-xs text-[#77766D] hover:text-[#262720] font-semibold underline underline-offset-2 button-press"
                >
                  {showSmtpForm ? 'Hide Setup' : 'Configure SMTP'}
                </button>
                <button
                  onClick={() => testSmtp(false)}
                  disabled={smtpStatus.loading}
                  className="px-3.5 py-1.5 rounded-full bg-white border border-[#E3DCCF] hover:bg-[#EAE5D9] text-xs font-semibold text-[#262720] flex items-center gap-1.5 button-press transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${smtpStatus.loading ? 'animate-spin' : ''}`} />
                  <span>{smtpStatus.loading ? 'Verifying...' : 'Verify SMTP Server'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 1: Google Sheets Configuration */}
      {activeTab === 'sheets' && (
        <div className="space-y-6">
          {/* Status Banner */}
          <div className={`p-5 rounded-3xl border flex items-start justify-between gap-4 shadow-2xs ${storageStatus?.isLiveGoogleSheets
              ? 'bg-[#EBF2EE] border-[#2F5C50]/30 text-[#262720]'
              : 'bg-[#FCF7E6] border-[#F2C94C]/60 text-[#262720]'
            }`}>
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Database className="w-4 h-4 text-[#2F5C50]" />
                <span>
                  {storageStatus?.isLiveGoogleSheets
                    ? 'Connected to Live Google Sheets Database'
                    : 'Awaiting Google Sheets Credentials (Running in Demo Sandbox)'}
                </span>
              </div>
              <p className="text-xs text-[#77766D]">
                {storageStatus?.message}
              </p>
            </div>

            <button
              onClick={onRefreshStorageStatus}
              className="p-2 bg-white rounded-full border border-[#E3DCCF] hover:bg-[#EAE5D9] text-[#77766D] hover:text-[#262720] button-press transition-all"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Setup / Credential Form */}
          <div className="bg-[#FAF8F2] rounded-3xl p-6 sm:p-7 border border-[#E3DCCF] space-y-4">
            <h2 className="text-sm font-semibold text-[#262720]">
              Google Service Account Credentials Setup
            </h2>
            <p className="text-xs text-[#77766D]">
              Provide your Google Cloud service account credentials to make Google Sheets your sole persistent application database.
            </p>

            <form onSubmit={handleSaveCredentials} className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold block mb-1 text-[#262720]">Google Spreadsheet ID *</label>
                <input
                  type="text"
                  required
                  value={spreadsheetId}
                  onChange={(e) => setSpreadsheetId(e.target.value)}
                  placeholder="e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
                  className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-white font-mono text-[11px] text-[#262720] focus:outline-none focus:ring-1 focus:ring-[#262720]"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1 text-[#262720]">Service Account Client Email *</label>
                <input
                  type="email"
                  required
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="rapport-crm-svc@your-project.iam.gserviceaccount.com"
                  className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-white font-mono text-[11px] text-[#262720] focus:outline-none focus:ring-1 focus:ring-[#262720]"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1 text-[#262720]">Private Key (PEM format) *</label>
                <textarea
                  required
                  rows={4}
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  placeholder="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwgg...-----END PRIVATE KEY-----"
                  className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-white font-mono text-[10px] text-[#262720] focus:outline-none focus:ring-1 focus:ring-[#262720]"
                />
              </div>

              {testResult && (
                <div className={`p-3.5 rounded-xl text-xs flex items-center gap-2 ${testResult.success ? 'bg-[#EBF2EE] text-[#2F5C50]' : 'bg-[#FAF0EC] text-[#C8431F]'
                  }`}>
                  {testResult.success ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  <span>{testResult.message}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#E3DCCF]">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRunComprehensiveTest}
                    disabled={isRunningDiagnostic}
                    className="px-4 py-2 rounded-full bg-[#2F5C50] hover:bg-[#205749] text-white font-semibold flex items-center gap-1.5 button-press transition-all shadow-2xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRunningDiagnostic ? 'animate-spin' : ''}`} />
                    <span>{isRunningDiagnostic ? 'Running 6-Point Check...' : 'Run 6-Point Verification Test'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleInitializeSheetDatabase}
                    disabled={isInitializing}
                    className="px-4 py-2 rounded-full border border-[#E3DCCF] bg-white hover:bg-[#EAE5D9] text-[#262720] font-semibold flex items-center gap-1.5 button-press transition-all"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isInitializing ? 'animate-spin' : ''}`} />
                    <span>Auto-Initialize Schema</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePushAllToSheets}
                    className="px-4 py-2 rounded-full border border-[#E3DCCF] bg-white hover:bg-[#EAE5D9] text-[#262720] font-semibold button-press transition-all"
                  >
                    Sync Demo Data to Sheet
                  </button>

                  <button
                    type="submit"
                    disabled={isSavingCreds}
                    className="px-5 py-2 rounded-full bg-[#262720] hover:bg-[#1E201E] text-white font-semibold shadow-xs button-press transition-all disabled:opacity-50"
                  >
                    {isSavingCreds ? 'Saving...' : 'Save & Verify Credentials'}
                  </button>
                </div>
              </div>
            </form>

            {diagnosticReport && (
              <div className="p-4 rounded-2xl bg-white border border-[#E3DCCF] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {diagnosticReport.overallSuccess ? (
                      <CheckCircle className="w-5 h-5 text-[#2F5C50]" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-[#C8431F]" />
                    )}
                    <span className="font-bold text-xs text-[#262720]">
                      {diagnosticReport.overallSuccess
                        ? 'All 6 Server-Side Connection Checks Passed 100%'
                        : 'Connection Verification Encountered Issues'}
                    </span>
                  </div>
                  {diagnosticReport.spreadsheetTitle && (
                    <span className="text-[11px] font-mono text-[#77766D] bg-[#F3EFE5] px-2 py-0.5 rounded-md">
                      {diagnosticReport.spreadsheetTitle}
                    </span>
                  )}
                </div>

                <div className="space-y-2 pt-2 border-t border-[#E3DCCF]/60">
                  {(diagnosticReport.steps || []).map((step: any, idx: number) => (
                    <div key={idx} className="flex items-start gap-2 text-xs">
                      {step.success ? (
                        <CheckCircle className="w-4 h-4 text-[#2F5C50] shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-[#C8431F] shrink-0 mt-0.5" />
                      )}
                      <div>
                        <span className="font-semibold text-[#262720]">{step.step}: </span>
                        <span className="text-[#77766D]">{step.message}</span>
                        {step.durationMs !== undefined && (
                          <span className="text-[10px] text-[#77766D]/70 ml-1.5">({step.durationMs}ms)</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {initResult && (
              <p className="text-xs p-3.5 rounded-xl bg-white border border-[#E3DCCF] text-[#262720]">
                {initResult}
              </p>
            )}
          </div>

          {/* Backup / Export CSV Card */}
          <div className="bg-[#FAF8F2] rounded-3xl p-6 border border-[#E3DCCF] flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#262720]">Data Export & Backup</h2>
              <p className="text-xs text-[#77766D] mt-0.5">
                Download all CRM leads and deals for this business as a standard CSV file.
              </p>
            </div>
            <button
              onClick={onExportCSV}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white border border-[#E3DCCF] hover:bg-[#EAE5D9] text-xs font-semibold text-[#262720] button-press transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>

          {/* Data Reconciliation & Integrity Engine */}
          <div className="bg-[#FAF8F2] rounded-3xl p-6 border border-[#E3DCCF] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[#2F5C50]" />
                  <h2 className="text-sm font-semibold text-[#262720]">Data Reconciliation & Integrity Engine</h2>
                </div>
                <p className="text-xs text-[#77766D] mt-0.5">
                  Safely scan spreadsheet records, normalize financial amounts, remove duplicate deal IDs, and clear malformed values without data loss.
                </p>
              </div>
              <button
                type="button"
                onClick={handleReconcileData}
                disabled={isReconciling}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#262720] hover:bg-[#1E201E] text-white text-xs font-semibold shadow-xs button-press transition-all shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isReconciling ? 'animate-spin' : ''}`} />
                <span>{isReconciling ? 'Reconciling Data...' : 'Run Safe Reconciliation'}</span>
              </button>
            </div>

            {reconcileReport && (
              <div className="p-4 rounded-2xl bg-white border border-[#E3DCCF] space-y-2 text-xs">
                <div className="flex items-center gap-2 text-[#2F5C50] font-semibold">
                  <CheckCircle className="w-4 h-4" />
                  <span>Reconciliation Complete: {reconcileReport.reconciledCount} records verified</span>
                </div>
                {reconcileReport.issuesFixed.length > 0 ? (
                  <div className="space-y-1.5 pt-2 border-t border-[#E3DCCF]/60">
                    <span className="font-semibold text-[#77766D]">Resolved Anomalies ({reconcileReport.issuesFixed.length}):</span>
                    <ul className="space-y-1 max-h-40 overflow-y-auto">
                      {reconcileReport.issuesFixed.map((fix, idx) => (
                        <li key={idx} className="flex items-start gap-1.5 text-[11px] text-[#262720]">
                          <span className="text-[#C8431F]">•</span>
                          <span><strong>{fix.title}:</strong> {fix.issue}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-[11px] text-[#77766D] pt-1">
                    All records are currently clean, deduplicated, and mathematically sound.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: TallyPrime Integration (Admin Only) */}
      {activeTab === 'tally' && isAdmin && (
        <div className="space-y-6 animate-in fade-in">
          <div className="p-5 rounded-3xl bg-[#FAF8F2] border border-[#E3DCCF]">
            <h2 className="text-sm font-bold text-[#262720]">TallyPrime XML-over-HTTP Quotation Bridge</h2>
            <p className="text-xs text-[#77766D] mt-0.5">
              Configure your TallyPrime HTTP XML server or offline XML download mode. Pushing a quotation creates an Optional Sales Order Voucher (<code className="bg-[#EFECE3] px-1.5 py-0.5 rounded">ISOPTIONAL=Yes</code>) in TallyPrime.
            </p>
          </div>

          <div className="bg-[#FAF8F2] rounded-3xl p-6 sm:p-7 border border-[#E3DCCF] space-y-6">
            <form onSubmit={handleSaveTallySettings} className="space-y-5 text-xs max-w-2xl">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="font-semibold block mb-1 text-[#262720]">Tally Endpoint URL</label>
                  <input
                    type="url"
                    value={tallyUrl}
                    onChange={(e) => setTallyUrl(e.target.value)}
                    placeholder="http://localhost:9000"
                    className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-white text-[#262720] focus:outline-none focus:ring-1 focus:ring-[#262720]"
                  />
                  <p className="text-[11px] text-[#77766D] mt-1">
                    Default TallyPrime XML port is 9000 (e.g., <code className="bg-[#EFECE3] px-1 rounded">http://localhost:9000</code> or your office static IP / tunnel URL).
                  </p>
                </div>

                <div>
                  <label className="font-semibold block mb-1 text-[#262720]">Tally Active Company Name *</label>
                  <input
                    type="text"
                    required
                    value={tallyCompanyName}
                    onChange={(e) => setTallyCompanyName(e.target.value)}
                    placeholder="3packmark Private Limited"
                    className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-white text-[#262720] focus:outline-none focus:ring-1 focus:ring-[#262720]"
                  />
                </div>

                <div>
                  <label className="font-semibold block mb-1 text-[#262720]">Default Sales Ledger Name *</label>
                  <input
                    type="text"
                    required
                    value={tallySalesLedger}
                    onChange={(e) => setTallySalesLedger(e.target.value)}
                    placeholder="Sales Accounts"
                    className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-white text-[#262720] focus:outline-none focus:ring-1 focus:ring-[#262720]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="font-semibold block mb-2 text-[#262720]">Connection Mode</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setTallyMode('live')}
                      className={`p-3.5 rounded-2xl border text-left transition-all ${
                        tallyMode === 'live'
                          ? 'border-[#262720] bg-white shadow-sm'
                          : 'border-[#E3DCCF] bg-[#FAF8F2] hover:bg-white'
                      }`}
                    >
                      <div className="font-bold text-[#262720]">Live HTTP XML Sync</div>
                      <div className="text-[11px] text-[#77766D] mt-0.5">
                        Directly POSTs XML to TallyPrime Endpoint URL.
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTallyMode('download')}
                      className={`p-3.5 rounded-2xl border text-left transition-all ${
                        tallyMode === 'download'
                          ? 'border-[#262720] bg-white shadow-sm'
                          : 'border-[#E3DCCF] bg-[#FAF8F2] hover:bg-white'
                      }`}
                    >
                      <div className="font-bold text-[#262720]">Download Tally XML File</div>
                      <div className="text-[11px] text-[#77766D] mt-0.5">
                        Downloads `.xml` voucher file for offline PC import.
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSavingTally}
                  className="px-5 py-2.5 rounded-full bg-[#262720] hover:bg-[#1E201E] text-white font-semibold button-press transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  <Save className="w-3.5 h-3.5" />
                  {isSavingTally ? 'Saving...' : 'Save TallyPrime Settings'}
                </button>
                {tallySavedSuccess && (
                  <span className="text-emerald-700 font-semibold flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> Saved to workspace
                  </span>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 2: Business Workspaces */}
      {activeTab === 'workspace' && (
        <div className="space-y-6">
          <div className="bg-[#FAF8F2] rounded-3xl p-6 sm:p-7 border border-[#E3DCCF] space-y-4">
            <h2 className="text-sm font-semibold text-[#262720]">
              Current Business Profile: {activeWorkspace.name}
            </h2>

            <form onSubmit={handleSaveWorkspaceProfile} className="space-y-3.5 text-xs max-w-lg">
              <div>
                <label className="font-semibold block mb-1 text-[#262720]">Business Name *</label>
                <input
                  type="text"
                  required
                  value={wsName}
                  onChange={(e) => setWsName(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-white text-[#262720] focus:outline-none focus:ring-1 focus:ring-[#262720]"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1 text-[#262720]">Industry</label>
                <input
                  type="text"
                  value={wsIndustry}
                  onChange={(e) => setWsIndustry(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-white text-[#262720] focus:outline-none focus:ring-1 focus:ring-[#262720]"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1 text-[#262720]">Currency Symbol</label>
                <input
                  type="text"
                  value={wsCurrency}
                  onChange={(e) => setWsCurrency(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-white text-[#262720] focus:outline-none focus:ring-1 focus:ring-[#262720]"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1 text-[#262720]">Monthly Sales Revenue Target ($)</label>
                <input
                  type="number"
                  value={wsTarget}
                  onChange={(e) => setWsTarget(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-[#E3DCCF] bg-white text-[#262720] focus:outline-none focus:ring-1 focus:ring-[#262720]"
                />
              </div>

              <button
                type="submit"
                disabled={isSavingWs}
                className="px-5 py-2.5 rounded-full bg-[#262720] hover:bg-[#1E201E] text-white font-semibold button-press transition-all disabled:opacity-50"
              >
                {isSavingWs ? 'Saving...' : 'Save Workspace Profile'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 3: Custom Pipelines & Stages */}
      {activeTab === 'pipeline' && (
        <div className="bg-[#FAF8F2] rounded-3xl p-6 sm:p-7 border border-[#E3DCCF] space-y-4">
          <div className="flex items-center justify-between border-b border-[#E3DCCF] pb-3">
            <div>
              <h2 className="text-sm font-semibold text-[#262720]">
                Pipeline Stages Configuration ({pipeline.name})
              </h2>
              <p className="text-xs text-[#77766D]">
                Configure stage names, order, colors (mustard, green, terracotta, charcoal), and probabilities.
              </p>
            </div>

            <button
              onClick={handleAddCustomStage}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white border border-[#E3DCCF] hover:bg-[#EAE5D9] text-xs font-semibold text-[#262720] button-press transition-all"
            >
              <Plus className="w-3.5 h-3.5 text-[#F2C94C]" />
              <span>Add Custom Stage</span>
            </button>
          </div>

          <div className="space-y-3">
            {editableStages.map((stage, idx) => (
              <div
                key={stage.id}
                className="p-3.5 rounded-2xl bg-white/80 border border-[#E3DCCF] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover-lift transition-all"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#EAE5D9] text-[#262720] font-bold flex items-center justify-center text-[10px]">
                    {idx + 1}
                  </span>
                  <input
                    type="text"
                    value={stage.name}
                    onChange={(e) => {
                      const updated = [...editableStages];
                      updated[idx].name = e.target.value;
                      setEditableStages(updated);
                    }}
                    className="p-2 rounded-xl border border-[#E3DCCF] font-semibold text-[#262720] focus:outline-none focus:ring-1 focus:ring-[#262720]"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Visual Color Swatch Dropdown + Custom Color Wheel */}
                  <div className="flex flex-wrap items-center gap-2 relative">
                    <span className="text-[#77766D]">Color:</span>
                    {(() => {
                      const activeHex = resolveStageHex(stage);
                      const activePreset = STAGE_COLOR_PRESETS.find(
                        (p) => p.hex.toUpperCase() === activeHex.toUpperCase()
                      );
                      const previewTextColor = getContrastTextHex(activeHex);
                      const isOpen = openColorDropdownStageId === stage.id;

                      return (
                        <>
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setOpenColorDropdownStageId(isOpen ? null : stage.id)}
                              className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-[#E3DCCF] bg-white text-[#262720] font-semibold cursor-pointer hover:bg-[#FAF8F2]"
                            >
                              <span
                                className="w-4 h-4 rounded-full border border-black/15 shrink-0"
                                style={{ backgroundColor: activeHex }}
                              />
                              <span className="text-xs">{activePreset?.label || 'Custom'}</span>
                              <span className="text-[10px] font-mono text-[#77766D]">{activeHex}</span>
                            </button>

                            {isOpen && (
                              <div className="absolute left-0 top-10 z-50 w-56 p-1.5 rounded-2xl bg-white border border-[#E3DCCF] shadow-xl space-y-0.5 max-h-64 overflow-y-auto">
                                {STAGE_COLOR_PRESETS.map((preset) => (
                                  <button
                                    key={preset.hex}
                                    type="button"
                                    onClick={() => {
                                      setOpenColorDropdownStageId(null);
                                      void handleInstantStageColorSave(idx, preset.hex);
                                    }}
                                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-left text-xs hover:bg-[#FAF8F2] cursor-pointer ${
                                      activeHex.toUpperCase() === preset.hex.toUpperCase() ? 'bg-[#FAF8F2] font-bold' : ''
                                    }`}
                                  >
                                    <span className="flex items-center gap-2">
                                      <span
                                        className="w-4 h-4 rounded-full border border-black/15 shrink-0"
                                        style={{ backgroundColor: preset.hex }}
                                      />
                                      <span>{preset.label}</span>
                                    </span>
                                    <span className="text-[10px] font-mono text-[#77766D]">{preset.hex}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Custom Color Wheel + Editable HEX */}
                          <label
                            title="Pick custom stage color"
                            className="flex items-center gap-1.5 px-2 py-1 rounded-xl border border-[#E3DCCF] bg-white cursor-pointer"
                          >
                            <input
                              type="color"
                              value={activeHex}
                              onChange={(e) => {
                                void handleInstantStageColorSave(idx, e.target.value.toUpperCase());
                              }}
                              className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent p-0"
                            />
                            <input
                              type="text"
                              value={activeHex}
                              onChange={(e) => {
                                const val = e.target.value;
                                const updated = [...editableStages];
                                updated[idx].color = val;
                                setEditableStages(updated);
                                if (/^#[0-9A-Fa-f]{6}$/.test(val.trim())) {
                                  void handleInstantStageColorSave(idx, val.trim().toUpperCase());
                                }
                              }}
                              className="w-16 text-[11px] font-mono text-[#262720] bg-transparent focus:outline-none"
                              maxLength={7}
                            />
                          </label>

                          {/* Live Mini Deal Card Preview */}
                          <div
                            className="px-2.5 py-1 rounded-lg text-[10px] font-semibold border border-black/10 shrink-0"
                            style={{ backgroundColor: activeHex, color: previewTextColor }}
                          >
                            Card Preview
                          </div>
                          {savedStageColorId === stage.id && (
                            <span className="text-[10px] font-bold text-emerald-700 flex items-center gap-0.5">
                              <Check className="w-3 h-3" /> Saved
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-[#77766D]">Prob (%):</span>
                    <input
                      type="number"
                      value={stage.probability}
                      onChange={(e) => {
                        const updated = [...editableStages];
                        updated[idx].probability = parseInt(e.target.value) || 0;
                        setEditableStages(updated);
                      }}
                      className="w-16 p-2 rounded-xl border border-[#E3DCCF] text-center text-[#262720] focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-3 border-t border-[#E3DCCF]">
            <button
              onClick={handleSavePipelineStages}
              disabled={isSavingPipe}
              className="px-5 py-2.5 rounded-full bg-[#262720] hover:bg-[#1E201E] text-white font-semibold button-press transition-all disabled:opacity-50"
            >
              {isSavingPipe ? 'Saving...' : 'Save Pipeline Changes'}
            </button>
          </div>
        </div>
      )}

      {/* TAB: System Health & Diagnosis */}
      {activeTab === 'health' && (
        <SystemHealthTab workspaceId={activeWorkspace.id} />
      )}
    </div>
  );
}
