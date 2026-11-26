'use client';

import React, { useState, useEffect } from 'react';
import {
  Activity,
  Database,
  Mail,
  Sparkles,
  Calendar,
  Clock,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Shield,
  Layers,
  Users,
} from 'lucide-react';

interface SystemHealthData {
  timestamp: string;
  timezone: string;
  database: {
    type: string;
    isLive: boolean;
    spreadsheetId: string;
    message: string;
  };
  email: {
    isConfigured: boolean;
    connected: boolean;
    host?: string;
    port?: number;
    message: string;
  };
  ai: {
    isConfigured: boolean;
    connected: boolean;
    model: string;
    state: string;
    message: string;
  };
  googleCalendar: {
    isConfigured: boolean;
    connected: boolean;
    userEmail: string | null;
    message: string;
  };
  scheduler: {
    cronSchedule: string;
    totalJobs: number;
    pendingCount: number;
    failedCount: number;
    completedCount: number;
    recentFailed: Array<{ id: string; ruleId: string; error: string; scheduledFor: string }>;
  };
  tenancy: {
    activeWorkspaceId: string;
    totalWorkspaces: number;
    totalTeamMembers: number;
  };
}

interface SystemHealthTabProps {
  workspaceId: string;
}

export function SystemHealthTab({ workspaceId }: SystemHealthTabProps) {
  const [data, setData] = useState<SystemHealthData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/system/health?workspaceId=${workspaceId}`);
      if (!res.ok) {
        throw new Error(`Health check request failed (${res.status})`);
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || 'Failed to perform health check');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, [workspaceId]);

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header bar */}
      <div className="p-5 rounded-3xl bg-[#FAF8F2] border border-[#E3DCCF] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-[#262720] flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#2F5C50]" />
            <span>Real-time System Health & Infrastructure Diagnosis</span>
          </h2>
          <p className="text-xs text-[#77766D] mt-0.5">
            Live genuine diagnostic verification across database persistence, email mailers, AI copilot, and automation scheduling.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchHealth}
          disabled={isLoading}
          className="btn btn--subtle text-xs py-1.5 px-4 rounded-full flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>{isLoading ? 'Checking...' : 'Run Diagnostics'}</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
          <XCircle className="w-4 h-4 shrink-0" />
          <span>Diagnostic error: {error}</span>
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* 1. Database Health */}
          <div className="bg-[#FAF8F2] rounded-3xl p-6 border border-[#E3DCCF] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-2xl bg-[#EBF2EE] text-[#2F5C50] flex items-center justify-center font-bold">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#262720]">Database Persistence</h3>
                  <span className="text-[10px] text-[#77766D]">{data.database.type}</span>
                </div>
              </div>

              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 ${
                  data.database.isLive
                    ? 'bg-[#EBF2EE] text-[#2F5C50] border border-[#2F5C50]/20'
                    : 'bg-[#FCF7E6] text-[#292511] border border-[#F2C94C]/40'
                }`}
              >
                {data.database.isLive ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                <span>{data.database.isLive ? 'Live Sheets Connected' : 'Local / Serverless Store'}</span>
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/80 border border-[#E3DCCF] space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-[#77766D]">
                <span>Status Detail:</span>
                <span className="font-medium text-[#262720] text-right truncate max-w-[200px]">{data.database.message}</span>
              </div>
              <div className="flex items-center justify-between text-[#77766D]">
                <span>Spreadsheet ID:</span>
                <span className="font-mono text-[#262720] text-[11px] truncate max-w-[180px]">{data.database.spreadsheetId}</span>
              </div>
            </div>
          </div>

          {/* 2. Email SMTP Health */}
          <div className="bg-[#FAF8F2] rounded-3xl p-6 border border-[#E3DCCF] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-2xl bg-[#EBF2EE] text-[#2F5C50] flex items-center justify-center font-bold">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#262720]">Email SMTP Delivery</h3>
                  <span className="text-[10px] text-[#77766D]">{data.email.host || 'smtp.gmail.com'}</span>
                </div>
              </div>

              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 ${
                  data.email.connected
                    ? 'bg-[#EBF2EE] text-[#2F5C50] border border-[#2F5C50]/20'
                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                }`}
              >
                {data.email.connected ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                <span>{data.email.connected ? 'Verified Active' : 'Disconnected'}</span>
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/80 border border-[#E3DCCF] space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-[#77766D]">
                <span>Port / Transport:</span>
                <span className="font-mono text-[#262720]">{data.email.port || 587} (STARTTLS)</span>
              </div>
              <div className="text-[11px] pt-1 border-t border-[#E3DCCF]/60 text-[#77766D]">
                {data.email.message}
              </div>
            </div>
          </div>

          {/* 4. Automation Scheduler Queue */}
          <div className="bg-[#FAF8F2] rounded-3xl p-6 border border-[#E3DCCF] space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-2xl bg-[#EBF2EE] text-[#2F5C50] flex items-center justify-center font-bold">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#262720]">Automation Job Scheduler</h3>
                  <span className="text-[10px] text-[#77766D]">Vercel Hobby Compliant Cron</span>
                </div>
              </div>

              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#EBF2EE] text-[#2F5C50] border border-[#2F5C50]/20 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                <span>Active ({data.scheduler.totalJobs} jobs)</span>
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/80 border border-[#E3DCCF] space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-[#77766D]">
                <span>Schedule:</span>
                <span className="font-mono text-[#262720] text-[11px]">{data.scheduler.cronSchedule}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-[#E3DCCF]/60 text-center text-xs">
                <div>
                  <span className="text-[10px] text-[#77766D] block">Pending</span>
                  <span className="font-bold text-amber-700">{data.scheduler.pendingCount}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#77766D] block">Completed</span>
                  <span className="font-bold text-emerald-700">{data.scheduler.completedCount}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#77766D] block">Failed</span>
                  <span className="font-bold text-rose-700">{data.scheduler.failedCount}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tenancy & Multi-business Status */}
      {data && (
        <div className="p-5 rounded-3xl bg-[#FAF8F2] border border-[#E3DCCF] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-2xl bg-[#EBF2EE] text-[#2F5C50] flex items-center justify-center font-bold">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-[#262720] block">Commercial Multi-Business Architecture</span>
              <span className="text-[11px] text-[#77766D]">
                Active Workspace: <strong className="font-mono text-[#262720]">{data.tenancy.activeWorkspaceId}</strong> | Serving {data.tenancy.totalWorkspaces} Business Workspace(s) with {data.tenancy.totalTeamMembers} Team Member(s)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="badge badge--pine text-[11px] flex items-center gap-1">
              <Shield className="w-3 h-3" /> Multi-Tenant Scoped
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

