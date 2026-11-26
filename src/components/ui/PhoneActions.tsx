'use client';

import React, { useState } from 'react';
import { Phone, MessageSquare, Copy, Check } from 'lucide-react';
import { getWhatsAppUrl } from '@/lib/phone';

interface PhoneActionsProps {
  phone?: string;
  whatsappNumber?: string;
  className?: string;
  showText?: boolean;
  compact?: boolean;
}

export function PhoneActions({
  phone,
  whatsappNumber,
  className = '',
  showText,
  compact = false,
}: PhoneActionsProps) {
  const [copied, setCopied] = useState(false);

  const effectivePhone = (phone || '').trim();
  const effectiveWhatsapp = (whatsappNumber || effectivePhone).trim();

  if (!effectivePhone && !effectiveWhatsapp) {
    return <span className="text-[var(--text-muted)] italic text-xs">No phone added</span>;
  }

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (effectivePhone) {
      navigator.clipboard.writeText(effectivePhone);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const waUrl = getWhatsAppUrl(effectiveWhatsapp);
  const isTextVisible = showText !== undefined ? showText : !compact;

  return (
    <div className={`inline-flex items-center gap-1.5 flex-wrap ${className}`}>
      {/* Tel link */}
      {effectivePhone && (
        <a
          href={`tel:${effectivePhone}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-[var(--text-ink)] hover:text-[var(--brand)] font-medium text-xs py-0.5 px-2 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--border-subtle)] border border-[var(--border-subtle)] transition-colors shadow-2xs"
          title={`Call ${effectivePhone}`}
        >
          <Phone className="w-3 h-3 text-[var(--text-muted)]" />
          {isTextVisible && <span className="font-tabular">{effectivePhone}</span>}
        </a>
      )}

      {/* WhatsApp Button */}
      {waUrl && (
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-[#25D366]/10 hover:bg-[#25D366]/25 text-[#128C7E] dark:text-[#25D366] border border-[#25D366]/20 transition-all shadow-2xs"
          title={`Open WhatsApp chat with ${effectiveWhatsapp}`}
          aria-label="Chat on WhatsApp"
        >
          <MessageSquare className="w-3 h-3 fill-current" />
        </a>
      )}

      {/* Copy Button */}
      {effectivePhone && (
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-ink)] border border-[var(--border-subtle)] transition-colors shadow-2xs cursor-pointer"
          title={copied ? 'Copied!' : 'Copy phone number'}
          aria-label="Copy phone number"
        >
          {copied ? (
            <Check className="w-3 h-3 text-emerald-600 animate-in zoom-in-75" />
          ) : (
            <Copy className="w-3 h-3" />
          )}
        </button>
      )}
    </div>
  );
}

