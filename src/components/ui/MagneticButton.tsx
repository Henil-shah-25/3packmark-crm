'use client';

import React, { useRef, useEffect } from 'react';
import { attachMagnetic } from '@/lib/motion';

interface MagneticButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  strength?: number;
  className?: string;
}

export function MagneticButton({
  children,
  strength = 0.24,
  className = '',
  ...props
}: MagneticButtonProps) {
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = btnRef.current;
    if (!el) return;
    const cleanup = attachMagnetic(el, strength, strength * 1.25);
    return cleanup;
  }, [strength]);

  return (
    <button
      ref={btnRef}
      className={`magnetic active:scale-[0.96] transition-transform duration-140 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
