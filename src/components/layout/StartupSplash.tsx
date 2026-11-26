'use client';

import React, { useEffect, useState } from 'react';

const SPLASH_SESSION_KEY = '3packmark_splash_seen';

export function StartupSplash() {
  const [phase, setPhase] = useState<'visible' | 'fading' | 'done'>('visible');

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && sessionStorage.getItem(SPLASH_SESSION_KEY) === '1') {
        setPhase('done');
        return;
      }

      const fadeTimer = setTimeout(() => {
        setPhase('fading');
      }, 1450);

      const doneTimer = setTimeout(() => {
        try {
          sessionStorage.setItem(SPLASH_SESSION_KEY, '1');
        } catch {
          // Ignore storage errors
        }
        setPhase('done');
      }, 1800);

      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(doneTimer);
      };
    } catch {
      setPhase('done');
    }
  }, []);

  if (phase === 'done') {
    return null;
  }

  return (
    <div
      aria-label="3W PACKMARK PRIVATE LIMITED"
      style={{ transition: 'opacity 350ms ease-out' }}
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#F4F1E9] text-[#17191A] select-none ${
        phase === 'fading' ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="flex flex-col items-center text-center px-6">
        <div className="w-14 h-14 rounded-2xl bg-[#17191A] text-white flex items-center justify-center font-extrabold text-xl tracking-tight shadow-md mb-5">
          3W
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#17191A]">
          3W PACKMARK PRIVATE LIMITED
        </h1>
        <p className="text-xs font-medium tracking-[0.18em] uppercase text-[#7C7A72] mt-2">
          Enterprise Sales &amp; Operations CRM
        </p>

        <div className="w-40 h-[2px] bg-[#E4DED2] rounded-full overflow-hidden mt-6">
          <div
            className="h-full bg-[#17191A] rounded-full"
            style={{
              animation: 'splashProgress 1.45s cubic-bezier(0.22, 1, 0.36, 1) forwards',
            }}
          />
        </div>
      </div>

      <style jsx>{`
        @keyframes splashProgress {
          0% {
            width: 0%;
          }
          100% {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
