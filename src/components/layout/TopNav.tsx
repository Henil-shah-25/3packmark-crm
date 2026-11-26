'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { APP_NAME, APP_BUSINESS_NAME } from '@/lib/config';
import {
  ChevronDown,
  ShieldCheck,
  Bell,
  Building2,
  Plus,
  Check,
  Database,
  Sun,
  Moon,
  LogOut,
  User,
  Settings,
  Send,
  FileText,
} from 'lucide-react';
import { Workspace, AppNotification, TeamMember } from '@/types/crm';
import { SlidingTabs } from '@/components/ui/SlidingTabs';
import GooeyNav from '@/components/ui/GooeyNav';

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1100px)');
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return isDesktop;
}

interface TopNavProps {
  currentSection: string;
  onSelectSection: (section: string) => void;
  workspaces: Workspace[];
  activeWorkspace: Workspace;
  onSwitchWorkspace: (workspace: Workspace) => void;
  onOpenCreateWorkspace: () => void;
  storageStatus?: {
    isLiveGoogleSheets: boolean;
    spreadsheetId?: string;
    sheetTitle?: string;
    message?: string;
  };
  unreadNotificationsCount?: number;
  notifications?: AppNotification[];
  onMarkAllNotificationsRead?: () => Promise<void>;
  onOpenLead?: (leadId: string) => void;
  currentUser?: TeamMember | null;
}

export function TopNav({
  currentSection,
  onSelectSection,
  workspaces,
  activeWorkspace,
  onSwitchWorkspace,
  onOpenCreateWorkspace,
  storageStatus,
  unreadNotificationsCount = 0,
  notifications = [],
  onMarkAllNotificationsRead,
  onOpenLead,
  currentUser,
}: TopNavProps) {
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>('light');
  const isDesktop = useIsDesktop();

  // Deduplicate workspaces by id (Map keyed by id, last write wins)
  const uniqueWorkspaces = useMemo(() => {
    const map = new Map<string, Workspace>();
    for (const ws of workspaces || []) {
      if (ws && ws.id) {
        map.set(ws.id, ws);
      }
    }
    return Array.from(map.values());
  }, [workspaces]);

  // Dynamic theme detection
  useEffect(() => {
    const updateTheme = () => {
      const active = document.documentElement.getAttribute('data-theme') as 'light' | 'dark';
      if (active === 'dark' || active === 'light') {
        setCurrentTheme(active);
      }
    };
    updateTheme();

    const observer = new MutationObserver(() => updateTheme());
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => observer.disconnect();
  }, []);

  const toggleTheme = () => {
    const next = currentTheme === 'dark' ? 'light' : 'dark';
    setCurrentTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('rapport_theme', next);
    } catch (e) {}
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {}
    window.location.href = '/login';
  };

  // Single source of truth for the top navigation tabs
  const navTabs = useMemo(
    () => [
      'Overview',
      'Pipeline',
      'Customers',
      'Products',
      'Schedule',
      'Automations',
      'Email',
      'Templates',
    ],
    []
  );

  // Label-only items for GooeyNav (never hrefs, to avoid full page reloads)
  const gooeyItems = useMemo(
    () => navTabs.map((label) => ({ label })),
    [navTabs]
  );

  // activeIndex derived from current section; returns -1 for unlisted routes like Settings
  const activeIndex = useMemo(() => {
    const normalized = (currentSection || '').toLowerCase().trim();
    if (normalized === 'pipelinemanagement') {
      return navTabs.indexOf('Pipelines');
    }
    return navTabs.findIndex(
      (tab) => tab.toLowerCase() === normalized
    );
  }, [navTabs, currentSection]);

  const isDark = currentTheme === 'dark';
  const gooeyStyle = {
    '--gn-font': '12.8px',
    '--gn-x': '10.5px',
    '--gn-y': '9px',
    '--gn-pad': '4.5px',
    '--gn-gap': '2px',
    '--gn-ink': isDark ? '#F4F4F5' : '#17191A',
    '--gn-muted': isDark ? 'rgba(244,244,245,0.68)' : 'rgba(38,39,32,0.65)',
    '--gn-frame': isDark ? 'rgba(28, 30, 34, 0.65)' : 'rgba(255, 255, 255, 0.65)',
    '--gn-frame-edge': isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
    '--gn-frame-highlight': isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.95)',
    '--gn-frame-shadow': isDark
      ? '0 6px 20px -8px rgba(0, 0, 0, 0.45), 0 2px 6px -2px rgba(0, 0, 0, 0.25)'
      : '0 4px 16px -4px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.03)',
  } as React.CSSProperties;

  const brandInitial = '3P';
  const orgName = activeWorkspace?.name || APP_BUSINESS_NAME;

  return (
    <header className="top w-full">
      {/* Left: Static Single-Tenant Brand Header */}
      <div className="relative min-w-0 shrink-0">
        <div
          className="brand select-none border-0 bg-transparent p-0 text-left flex items-center gap-2.5"
          title="3W PACKMARK PRIVATE LIMITED"
        >
          <div className="brand__mark text-xs font-extrabold tracking-tight">
            3W
          </div>
          <span className="brand__name">
            3W PACKMARK PRIVATE LIMITED
          </span>
        </div>
      </div>

      {/* Center: Premium Gooey Navigation Bar with liquid morphing and all 10 visible items */}
      <div
        className="top__nav-center min-w-0 max-w-full hidden lg:flex items-center justify-center px-1"
      >
        <GooeyNav
          items={gooeyItems}
          activeIndex={activeIndex}
          initialActiveIndex={activeIndex >= 0 ? activeIndex : 0}
          onChange={(index: number) => {
            if (index >= 0 && index < navTabs.length) {
              onSelectSection(navTabs[index]);
            }
          }}
          theme={isDark ? 'dark' : 'light'}
          color={isDark ? '#F4F4F5' : '#17191A'}
          activeTextColor={isDark ? '#17191A' : '#FFFFFF'}
          frame={true}
          size="md"
          animationTime={500}
          particleCount={10}
          gooeyness={0.48}
          wobble={0.42}
          hoverEffect={true}
          style={gooeyStyle}
        />
      </div>

      {/* Right: Round 50px Icon Buttons (Inbox, Bell, User Avatar) */}
      <div className="top__tools justify-end shrink-0">
        {/* Inbox / Email Section Button (Round 50px) */}
        <button
          type="button"
          onClick={() => onSelectSection('Email')}
          className="top__btn-50"
          title="Inbox"
          aria-label="Inbox"
        >
          <Database className="w-5 h-5 text-[var(--muted)]" />
        </button>

        {/* Bell with Badge (Round 50px) */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsNotificationOpen(!isNotificationOpen)}
            className="top__btn-50"
            title="Notifications"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5 text-[var(--muted)]" />
            {unreadNotificationsCount > 0 && (
              <span className="dot-badge" />
            )}
          </button>

          {isNotificationOpen && (
            <div
              className="pop absolute right-0 mt-2 w-88 p-3 z-50 shadow-2xl rounded-2xl max-h-96 overflow-y-auto"
              onMouseLeave={() => setIsNotificationOpen(false)}
            >
              <div className="pop__head flex items-center justify-between pb-2 mb-2 border-b border-[var(--rim)]">
                <span className="pop__title text-xs font-medium text-[var(--text)]">
                  Notifications ({unreadNotificationsCount})
                </span>
                {notifications.length > 0 && onMarkAllNotificationsRead && (
                  <button
                    type="button"
                    onClick={async () => {
                      await onMarkAllNotificationsRead();
                    }}
                    className="text-[11px] font-medium text-[var(--pine)] hover:underline cursor-pointer"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              {notifications.length === 0 ? (
                <div className="py-8 px-4 text-center text-xs text-[var(--muted)]">
                  No new notifications. Everything is up to date.
                </div>
              ) : (
                <div className="space-y-2">
                  {notifications.slice(0, 10).map((n) => (
                    <div
                      key={n.id}
                      className={`p-2.5 rounded-xl border text-xs transition-all ${
                        !n.isRead
                          ? 'bg-[var(--glass-2)] border-[var(--text)]/20 text-[var(--text)]'
                          : 'bg-transparent border-[var(--rim)] text-[var(--muted)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-semibold text-[11px] truncate">{n.title}</span>
                        <span className="text-[10px] opacity-70 shrink-0 font-mono">
                          {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-[11px] leading-relaxed line-clamp-2">{n.message}</p>
                      {n.leadId && onOpenLead && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsNotificationOpen(false);
                            onOpenLead(n.leadId!);
                          }}
                          className="mt-1.5 text-[10px] font-medium text-[var(--pine)] hover:underline block cursor-pointer"
                        >
                          View related lead &rarr;
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* User Profile Avatar: 54px circle with 3px white ring, pine background, initials centred (16px/500, white) */}
        <div className="relative flex-none">
          <button
            type="button"
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="w-[54px] h-[54px] min-w-[54px] min-h-[54px] rounded-full flex-none overflow-hidden p-0 flex items-center justify-center cursor-pointer shadow-md ring-[3px] ring-white dark:ring-white/20 transition-transform hover:scale-105 active:scale-95"
            style={{ width: '54px', height: '54px' }}
            title="Account & Settings"
            aria-label="User Account Menu"
          >
            <div className="w-full h-full rounded-full bg-[var(--pine)] text-white flex items-center justify-center font-medium text-[16px]">
              {currentUser?.name
                ? currentUser.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()
                : '3P'}
            </div>
          </button>

          {isUserMenuOpen && (
            <div
              className="pop absolute right-0 mt-2 w-64 p-2 z-50 animate-in fade-in zoom-in-95"
              onMouseLeave={() => setIsUserMenuOpen(false)}
            >
              <div className="px-3 py-2 border-b border-[var(--rim)]">
                <span className="font-bold text-xs text-[var(--text)] block truncate">
                  {currentUser?.name || '3packmark Team'}
                </span>
                <span className="text-[11px] text-[var(--muted)] block truncate">
                  {currentUser?.email || 'admin@3packmark.com'}
                </span>
                {currentUser?.role && (
                  <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--glass-2)] border border-[var(--rim)] text-[var(--text)]">
                    {currentUser.role}
                  </span>
                )}
              </div>

              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onSelectSection('Settings');
                  }}
                  className="menu__item w-full text-left"
                >
                  <Settings className="w-4 h-4 text-[var(--muted)]" />
                  <span>Settings & Preferences</span>
                </button>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="menu__item w-full text-left"
                >
                  {currentTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  <span>Toggle theme</span>
                </button>
              </div>

              <div className="pt-1 border-t border-[var(--rim)]">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="menu__item w-full text-left text-[var(--bad)] hover:bg-[var(--bad)]/10"
                >
                  <LogOut className="w-4 h-4 text-[var(--bad)]" />
                  <span className="font-semibold">Sign out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile navigation tab scroll (hidden on desktop) */}
      <div className="lg:hidden w-full basis-full mt-2 overflow-x-auto scrollbar-none shrink-0">
        <SlidingTabs
          items={navTabs}
          activeId={currentSection}
          onChange={onSelectSection}
          variant="tabs"
          size="sm"
        />
      </div>
    </header>
  );
}
