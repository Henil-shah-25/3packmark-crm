'use client';

import React, { useRef, useEffect, useState } from 'react';

export interface TabItem {
  id: string;
  label: string;
  badge?: number | string;
  icon?: React.ReactNode;
}

export interface SlidingTabsProps {
  items?: (string | TabItem)[];
  options?: (string | TabItem)[];
  activeId?: string;
  value?: string;
  onChange: (id: string) => void;
  variant?: 'tabs' | 'segmented';
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function SlidingTabs({
  items,
  options,
  activeId,
  value,
  onChange,
  variant = 'tabs',
  className = '',
  size = 'md',
}: SlidingTabsProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const prevBoundsRef = useRef<{ left: number; right: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  const rawList = options || items || [];
  const currentActiveId = value !== undefined ? value : (activeId !== undefined ? activeId : '');

  const normalizedItems: TabItem[] = rawList.map((item) =>
    typeof item === 'string' ? { id: item, label: item } : item
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    const pill = pillRef.current;
    if (!track || !pill) return;

    const activeIndex = normalizedItems.findIndex((it) => it.id === currentActiveId);
    if (activeIndex === -1) return;

    const buttons = track.querySelectorAll<HTMLButtonElement>('button[data-tab]');
    const activeBtn = buttons[activeIndex];
    if (!activeBtn) return;

    const trackWidth = track.scrollWidth;
    const trackHeight = track.offsetHeight;

    const left = activeBtn.offsetLeft;
    const right = trackWidth - (activeBtn.offsetLeft + activeBtn.offsetWidth);
    const top = activeBtn.offsetTop;
    const bottom = trackHeight - (activeBtn.offsetTop + activeBtn.offsetHeight);

    const prev = prevBoundsRef.current;
    prevBoundsRef.current = { left, right };

    if (!prev || !mounted) {
      pill.style.clipPath = `inset(${top}px ${right}px ${bottom}px ${left}px round 999px)`;
      pill.style.opacity = '1';
      return;
    }

    const movingRight = left > prev.left;
    const leadDuration = 360;
    const followDuration = 550;

    const startTime = performance.now();
    let animId: number;

    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
    const easeInOut = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    function animate(now: number) {
      const elapsed = now - startTime;
      const leftProg = Math.min(elapsed / (movingRight ? followDuration : leadDuration), 1);
      const rightProg = Math.min(elapsed / (movingRight ? leadDuration : followDuration), 1);

      const leftEase = movingRight ? easeInOut(leftProg) : easeOut(leftProg);
      const rightEase = movingRight ? easeOut(rightProg) : easeInOut(rightProg);

      const curLeft = prev!.left + (left - prev!.left) * leftEase;
      const curRight = prev!.right + (right - prev!.right) * rightEase;

      pill!.style.clipPath = `inset(${top}px ${curRight.toFixed(1)}px ${bottom}px ${curLeft.toFixed(1)}px round 999px)`;
      pill!.style.opacity = '1';

      if (leftProg < 1 || rightProg < 1) {
        animId = requestAnimationFrame(animate);
      } else {
        pill!.style.clipPath = `inset(${top}px ${right}px ${bottom}px ${left}px round 999px)`;
      }
    }

    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, [currentActiveId, normalizedItems, mounted]);

  const isSeg = variant === 'segmented';

  return (
    <div
      className={`relative inline-flex items-center ${
        isSeg
          ? 'bg-[var(--well)] rounded-full p-[3px]'
          : 'tabs max-w-full overflow-x-auto scrollbar-none rounded-full'
      } ${className}`}
    >
      <div
        ref={trackRef}
        className={`relative flex items-center ${
          isSeg ? 'gap-[2px]' : 'tabs__track gap-[2px] p-1 w-max'
        }`}
      >
        {/* Base Unselected/Normal Buttons */}
        {normalizedItems.map((item) => {
          const isActive = item.id === currentActiveId;
          return (
            <button
              key={item.id}
              data-tab={item.id}
              onClick={() => onChange(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative z-[1] select-none rounded-full font-semibold transition-colors duration-150 flex items-center justify-center gap-1.5 whitespace-nowrap ${
                isSeg
                  ? size === 'sm'
                    ? 'px-3 py-1.5 text-[12px]'
                    : 'px-3.5 py-1.5 text-[12.5px]'
                  : 'px-4 py-2 text-[13.5px]'
              } ${
                isActive
                  ? 'text-[var(--text)]'
                  : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--well)]'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.badge !== undefined && (
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-[var(--well)]">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}

        {/* Clipped Pill Overlay with light copy of the labels */}
        <div
          ref={pillRef}
          aria-hidden="true"
          style={{ opacity: 0 }}
          className={`absolute inset-0 pointer-events-none z-[2] flex items-center ${
            isSeg
              ? 'bg-[var(--glass-3)] text-[var(--text)] shadow-[0_2px_8px_rgba(0,0,0,0.08)] gap-[2px]'
              : 'tabs__pill bg-[var(--pill)] text-[var(--on-pill)] p-1 gap-[2px]'
          }`}
        >
          {normalizedItems.map((item) => (
            <div
              key={`pill-${item.id}`}
              className={`select-none rounded-full font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap ${
                isSeg
                  ? size === 'sm'
                    ? 'px-3 py-1.5 text-[12px]'
                    : 'px-3.5 py-1.5 text-[12.5px]'
                  : 'px-4 py-2 text-[13.5px]'
              } ${isSeg ? 'text-[var(--text)]' : 'text-[var(--on-pill)]'}`}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.badge !== undefined && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                    isSeg ? 'bg-[var(--well)]' : 'bg-white/20'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
