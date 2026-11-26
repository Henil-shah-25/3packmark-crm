'use client';

import React from 'react';
import {
  Search,
  Plus,
  Star,
  Calendar,
  Phone,
  Send,
  FileText,
  GitBranch,
  Settings,
  Moon,
  Sun,
  Package,
} from 'lucide-react';

interface SidebarRailProps {
  activeSection: string;
  onNavigate: (section: string) => void;
  onOpenNewDeal: () => void;
  onOpenSearch: () => void;
}

export function SidebarRail({
  activeSection,
  onNavigate,
  onOpenNewDeal,
  onOpenSearch,
}: SidebarRailProps) {
  const [currentTheme, setCurrentTheme] = React.useState<'light' | 'dark'>('light');

  React.useEffect(() => {
    const active = document.documentElement.getAttribute('data-theme') as 'light' | 'dark';
    if (active) setCurrentTheme(active);
  }, []);

  const toggleTheme = () => {
    const next = currentTheme === 'dark' ? 'light' : 'dark';
    setCurrentTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('rapport_theme', next);
    } catch (e) {}
  };

  return (
    <aside
      className="dock"
      aria-label="Quick Actions Dock"
    >
      {/* Search */}
      <button
        onClick={onOpenSearch}
        className="dock__btn group"
        aria-label="Search (Ctrl+K)"
      >
        <Search className="w-5 h-5 text-inherit" />
        <span className="dock__tip">
          Search <kbd>⌘K</kbd>
        </span>
      </button>

      {/* New Deal */}
      <button
        onClick={onOpenNewDeal}
        className="dock__btn group"
        style={{ color: 'var(--butter)' }}
        aria-label="New Deal"
      >
        <Plus className="w-5 h-5 stroke-[2.5]" />
        <span className="dock__tip">
          New Deal <kbd>N</kbd>
        </span>
      </button>

      <div className="dock__sep" />

      {/* Overview / Star */}
      <button
        onClick={() => onNavigate('Overview')}
        aria-current={activeSection === 'Overview' ? 'page' : undefined}
        className="dock__btn group"
        aria-label="Overview"
      >
        <Star className="w-5 h-5 text-inherit" />
        <span className="dock__tip">Overview</span>
      </button>

      {/* Schedule */}
      <button
        onClick={() => onNavigate('Schedule')}
        aria-current={activeSection === 'Schedule' ? 'page' : undefined}
        className="dock__btn group"
        aria-label="Schedule"
      >
        <Calendar className="w-5 h-5 text-inherit" />
        <span className="dock__tip">Schedule</span>
      </button>

      {/* Pipeline */}
      <button
        onClick={() => onNavigate('Pipeline')}
        aria-current={activeSection === 'Pipeline' ? 'page' : undefined}
        className="dock__btn group"
        aria-label="Pipelines"
      >
        <Phone className="w-5 h-5 text-inherit" />
        <span className="dock__tip">Deal Pipeline</span>
      </button>

      {/* Pipeline Management & RBAC */}
      <button
        onClick={() => onNavigate('PipelineManagement')}
        aria-current={activeSection === 'PipelineManagement' ? 'page' : undefined}
        className="dock__btn group text-amber-500"
        aria-label="Pipeline Management"
      >
        <GitBranch className="w-5 h-5 text-inherit" />
        <span className="dock__tip">Pipeline Architecture</span>
      </button>

      {/* Chemical Products Catalog */}
      <button
        onClick={() => onNavigate('Products')}
        aria-current={activeSection === 'Products' ? 'page' : undefined}
        className="dock__btn group"
        aria-label="Products Catalog"
      >
        <Package className="w-5 h-5 text-inherit" />
        <span className="dock__tip">Products</span>
      </button>

      {/* Email */}
      <button
        onClick={() => onNavigate('Email')}
        aria-current={activeSection === 'Email' ? 'page' : undefined}
        className="dock__btn group"
        aria-label="Email Hub"
      >
        <Send className="w-5 h-5 text-inherit" />
        <span className="dock__tip">Email</span>
      </button>

      {/* Templates */}
      <button
        onClick={() => onNavigate('Templates')}
        aria-current={activeSection === 'Templates' ? 'page' : undefined}
        className="dock__btn group"
        aria-label="Email Templates"
      >
        <FileText className="w-5 h-5 text-inherit" />
        <span className="dock__tip">Templates</span>
      </button>

      {/* Automations */}
      <button
        onClick={() => onNavigate('Automations')}
        aria-current={activeSection === 'Automations' ? 'page' : undefined}
        className="dock__btn group"
        aria-label="Automations"
      >
        <GitBranch className="w-5 h-5 text-inherit" />
        <span className="dock__tip">Automations</span>
      </button>

      <div className="dock__sep" />

      {/* Settings */}
      <button
        onClick={() => onNavigate('Settings')}
        aria-current={activeSection === 'Settings' ? 'page' : undefined}
        className="dock__btn group"
        aria-label="Settings"
      >
        <Settings className="w-5 h-5 text-inherit" />
        <span className="dock__tip">Settings</span>
      </button>

      {/* Theme */}
      <button
        onClick={toggleTheme}
        className="dock__btn group"
        aria-label="Toggle Theme"
      >
        {currentTheme === 'dark' ? (
          <Sun className="w-5 h-5 text-[var(--butter)]" />
        ) : (
          <Moon className="w-5 h-5 text-inherit" />
        )}
        <span className="dock__tip">Toggle theme</span>
      </button>
    </aside>
  );
}
