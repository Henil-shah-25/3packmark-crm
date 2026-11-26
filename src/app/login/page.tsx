'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, Lock, AlertCircle, Loader2 } from 'lucide-react';
import { APP_NAME, APP_BUSINESS_NAME } from '@/lib/config';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [lockSecondsRemaining, setLockSecondsRemaining] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startCountdown = (seconds: number) => {
    setIsLocked(true);
    setLockSecondsRemaining(seconds);

    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }

    countdownIntervalRef.current = setInterval(() => {
      setLockSecondsRemaining((prev) => {
        if (prev <= 1) {
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
          setIsLocked(false);
          setErrorMessage('');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const formatCountdown = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const checkInitialLockout = async (targetEmail = '') => {
    try {
      const res = await fetch(`/api/auth/lockout-status?email=${encodeURIComponent(targetEmail)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.isLocked && data.remainingSeconds > 0) {
          startCountdown(data.remainingSeconds);
        } else if (!data.isLocked && isLocked) {
          setIsLocked(false);
          setErrorMessage('');
        }
      }
    } catch {
      // Ignore network errors on passive check
    }
  };

  // Check lockout state on mount
  useEffect(() => {
    checkInitialLockout();
    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked || isLoading) return;

    setIsLoading(true);
    setErrorMessage('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        // Successful login: redirect to returnTo or home
        const params = new URLSearchParams(window.location.search);
        const returnTo = params.get('returnTo') || '/';
        window.location.href = returnTo;
        return;
      }

      if (res.status === 423 || data.isLocked) {
        const remaining = data.remainingSeconds || 1200;
        startCountdown(remaining);
      } else if (data.isConfigurationError || res.status === 503) {
        setErrorMessage(data.error || 'Server authentication configuration missing.');
      } else {
        setErrorMessage(data.error || 'Invalid email or password.');
        if (typeof data.attemptsLeft === 'number') {
          setAttemptsLeft(data.attemptsLeft);
        }
      }
    } catch {
      setErrorMessage('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const brandInitial = (APP_NAME && APP_NAME.charAt(0).toUpperCase()) || 'D';

  return (
    <main className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden select-none bg-[var(--bg)]">
      {/* CRM Warm Ambient Drifting Mesh Blobs */}
      <div className="mesh" aria-hidden="true">
        <i className="mesh__a" />
        <i className="mesh__b" />
        <i className="mesh__c" />
      </div>

      {/* Centered Translucent Login Card */}
      <div
        className="login-card w-full max-w-[420px] rounded-[36px] p-7 sm:p-9 relative z-10"
        style={{
          background: 'rgba(255, 255, 255, 0.78)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          boxShadow: '0 24px 54px -12px rgba(23, 25, 26, 0.10), 0 2px 6px rgba(23, 25, 26, 0.04)',
          border: '1px solid rgba(228, 222, 210, 0.85)',
          animation: 'fadeRise 500ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
      >
        {/* Brand Mark & App Name */}
        <div className="flex flex-col items-center text-center mb-6">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center font-extrabold text-lg text-white mb-2.5 shadow-md"
            style={{
              backgroundColor: '#17191A',
              letterSpacing: '-0.03em',
            }}
          >
            3P
          </div>

          <span className="text-[11px] font-bold text-[#7C7A72] uppercase tracking-wider">
            {APP_BUSINESS_NAME}
          </span>

          <h1 className="text-2xl sm:text-[26px] font-extrabold text-[#17191A] tracking-tight mt-2">
            Sign in to {APP_NAME}
          </h1>
          <p className="text-xs text-[#7C7A72] mt-1 font-medium">
            Enter your 3packmark team ID and password
          </p>
        </div>

        {/* Status / Error Alert Banner */}
        <div aria-live="polite" className="min-h-[24px] mb-4">
          {isLocked ? (
            <div
              className="p-3.5 rounded-2xl flex items-center gap-3 text-xs font-semibold animate-in fade-in"
              style={{
                backgroundColor: 'rgba(200, 67, 31, 0.10)',
                color: '#C8431F',
                border: '1px solid rgba(200, 67, 31, 0.25)',
              }}
            >
              <Lock className="w-4 h-4 shrink-0" />
              <span>
                Too many attempts. Try again in {formatCountdown(lockSecondsRemaining)}.
              </span>
            </div>
          ) : errorMessage ? (
            <div
              className="p-3.5 rounded-2xl flex items-center gap-3 text-xs font-semibold animate-in fade-in"
              style={{
                backgroundColor: 'rgba(200, 67, 31, 0.10)',
                color: '#C8431F',
                border: '1px solid rgba(200, 67, 31, 0.25)',
              }}
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                {errorMessage}
                {attemptsLeft !== null && attemptsLeft > 0 && (
                  <span className="ml-1 opacity-90 font-bold">
                    ({attemptsLeft} {attemptsLeft === 1 ? 'attempt left' : 'attempts left'})
                  </span>
                )}
              </span>
            </div>
          ) : null}
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          {/* Email input (52px pill) */}
          <div>
            <label
              htmlFor="login-email"
              className="block text-[11px] font-bold text-[#56554F] mb-1.5 ml-2"
            >
              Email Address
            </label>
            <input
              id="login-email"
              type="email"
              required
              autoFocus
              autoComplete="username"
              disabled={isLocked || isLoading}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => {
                if (email.trim()) checkInitialLockout(email.trim());
              }}
              placeholder="name@company.com"
              className="w-full h-[52px] px-5 rounded-full text-sm font-medium text-[#17191A] bg-white border transition-all focus:outline-none focus:ring-2 focus:ring-[#17191A]/20 focus:border-[#17191A] disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
              style={{ borderColor: 'rgba(228, 222, 210, 0.95)' }}
            />
          </div>

          {/* Password input (52px pill with toggle) */}
          <div>
            <label
              htmlFor="login-password"
              className="block text-[11px] font-bold text-[#56554F] mb-1.5 ml-2"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                disabled={isLocked || isLoading}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full h-[52px] pl-5 pr-14 rounded-full text-sm font-medium text-[#17191A] bg-white border transition-all focus:outline-none focus:ring-2 focus:ring-[#17191A]/20 focus:border-[#17191A] disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
                style={{ borderColor: 'rgba(228, 222, 210, 0.95)' }}
              />
              <button
                type="button"
                tabIndex={-1}
                disabled={isLocked || isLoading}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-[#7C7A72] hover:text-[#17191A] transition-colors cursor-pointer"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Black Pill Submit Button (52px pill) */}
          <button
            type="submit"
            disabled={isLocked || isLoading}
            className="w-full h-[52px] mt-2 rounded-full text-sm font-bold text-white flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer shadow-md hover:opacity-95 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            style={{
              backgroundColor: '#17191A',
            }}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Signing in...</span>
              </>
            ) : isLocked ? (
              <>
                <Lock className="w-4 h-4" />
                <span>Locked ({formatCountdown(lockSecondsRemaining)})</span>
              </>
            ) : (
              <span>Sign in</span>
            )}
          </button>
        </form>
      </div>

      {/* Global CSS for fadeRise entrance respecting prefers-reduced-motion */}
      <style jsx>{`
        @keyframes fadeRise {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .login-card {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>
    </main>
  );
}
