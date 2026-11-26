'use client';

import React, { useEffect, useState, useRef } from 'react';
import { formatSplitTitle, animateCountUp } from '@/lib/motion';
import { Trophy, PhoneCall, TrendingUp } from 'lucide-react';

export interface StatTileData {
  id?: string;
  icon?: React.ReactNode;
  label: string;
  value?: number;
  numericValue?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  badge?: string;
  format?: (n: number) => string;
}

interface HeaderRevealProps {
  title: string;
  subtitle?: string;
  stats?: StatTileData[];
  tiles?: StatTileData[];
  actions?: React.ReactNode;
  className?: string;
}

export function HeaderReveal({
  title,
  subtitle,
  stats,
  tiles,
  actions,
  className = '',
}: HeaderRevealProps) {
  const { ariaLabel, words } = formatSplitTitle(title);
  const [animated, setAnimated] = useState(false);

  const displayTiles = tiles || stats || [];

  useEffect(() => {
    // Trigger entrance animation for letters
    const timer = setTimeout(() => {
      setAnimated(true);
    }, 40);
    return () => clearTimeout(timer);
  }, [title]);

  let globalCharIndex = 0;

  return (
    <header className={`head ${className}`}>
      <div className="head__lead min-w-0">
        <h1
          className="head__title select-none"
          aria-label={ariaLabel}
        >
          {words.map((w, wIdx) => (
            <span
              key={`word-${wIdx}`}
              className="word inline-block align-top pb-[0.08em] -mb-[0.08em] overflow-hidden mr-[0.25em]"
              aria-hidden="true"
            >
              {w.chars.map((ch, cIdx) => {
                const charDelay = (globalCharIndex++) * 0.022;
                return (
                  <span
                    key={`ch-${wIdx}-${cIdx}`}
                    className="ch inline-block transition-transform duration-[850ms] will-change-transform"
                    style={{
                      transform: animated
                        ? 'translate3d(0, 0, 0) rotate(0deg)'
                        : 'translate3d(0, 115%, 0) rotate(6deg)',
                      transitionTimingFunction: 'cubic-bezier(0.1, 0.9, 0.2, 1)',
                      transitionDelay: `${charDelay.toFixed(3)}s`,
                    }}
                  >
                    {ch}
                  </span>
                );
              })}
            </span>
          ))}
        </h1>
        {subtitle && (
          <p className="text-[14px] text-[var(--muted)] mt-1.5 max-w-xl leading-relaxed font-normal">
            {subtitle}
          </p>
        )}
      </div>

      {/* Stats with count-up animation in ONE row beside title */}
      {displayTiles.length > 0 && (
        <dl className="head__stats">
          {displayTiles.map((stat, idx) => (
            <StatTile key={stat.id || idx} stat={stat} delayMs={idx * 80 + 120} />
          ))}
        </dl>
      )}

      {actions && <div className="head__actions">{actions}</div>}
    </header>
  );
}

function StatTile({ stat, delayMs = 0 }: { stat: StatTileData; delayMs?: number }) {
  const targetVal = stat.numericValue !== undefined ? stat.numericValue : (stat.value !== undefined ? stat.value : 0);
  const [displayVal, setDisplayVal] = useState(0);
  const prevValRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      animateCountUp(prevValRef.current, targetVal, 1200, (v) => {
        setDisplayVal(v);
      }, () => {
        prevValRef.current = targetVal;
      });
    }, delayMs);

    return () => clearTimeout(timer);
  }, [targetVal, delayMs]);

  const formattedValue = stat.format
    ? stat.format(displayVal)
    : `${stat.prefix || ''}${
        stat.decimals
          ? displayVal.toFixed(stat.decimals)
          : Math.round(displayVal).toLocaleString('en-US')
      }${stat.suffix || ''}`;

  // Default monochrome ink icon if none provided
  const renderIcon = () => {
    if (stat.icon) return stat.icon;
    const lower = (stat.label || '').toLowerCase();
    if (lower.includes('won')) return <Trophy className="w-6 h-6 text-[var(--ink)]" />;
    if (lower.includes('rate')) return <TrendingUp className="w-6 h-6 text-[var(--ink)]" />;
    return <PhoneCall className="w-6 h-6 text-[var(--ink)]" />;
  };

  // Hide 0% goal badges or zero badges as per user rules
  const showBadge = stat.badge &&
    !stat.badge.startsWith('0%') &&
    !stat.badge.startsWith('0.0%') &&
    stat.badge !== '+0%' &&
    stat.badge !== '0 deals';

  return (
    <div className="stat">
      <div className="stat__ico-58">
        {renderIcon()}
      </div>
      <div>
        <dd className="stat__value-26">
          <b data-count>{formattedValue}</b>
          {showBadge && (
            <span className="badge badge--pine text-[11px] py-0.5 px-2 font-medium">
              {stat.badge}
            </span>
          )}
        </dd>
        <dt className="stat__label-15">
          {stat.label}
        </dt>
      </div>
    </div>
  );
}
