/**
 * Motion & Animation Primitives based on Rapport Reference
 * Uses CSS transitions, Web Animations API, and requestAnimationFrame.
 * Fully respects prefers-reduced-motion.
 */

export function isReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function isFinePointer(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: fine)').matches;
}

/**
 * Splits plain text into words and per-character spans.
 * Sets aria-label on parent and aria-hidden on children.
 */
export function formatSplitTitle(text: string) {
  const clean = text.trim();
  const words = clean.split(/\s+/);
  return {
    ariaLabel: clean,
    words: words.map((word) => ({
      word,
      chars: Array.from(word),
    })),
  };
}

/**
 * Count up numerical stats with rAF using cubic power3.out easing.
 * Always guarantees final value is exactly correct.
 */
export function animateCountUp(
  startVal: number,
  endVal: number,
  durationMs: number = 1200,
  onUpdate: (val: number) => void,
  onComplete?: () => void
): () => void {
  if (isReducedMotion() || startVal === endVal) {
    onUpdate(endVal);
    onComplete?.();
    return () => {};
  }

  let rafId: number;
  const startTime = performance.now();

  // power3.out easing: 1 - (1 - t)^3
  const easeOutPower3 = (t: number) => 1 - Math.pow(1 - t, 3);

  function step(now: number) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / durationMs, 1);
    const eased = easeOutPower3(progress);
    const current = startVal + (endVal - startVal) * eased;

    onUpdate(progress >= 1 ? endVal : current);

    if (progress < 1) {
      rafId = requestAnimationFrame(step);
    } else {
      onComplete?.();
    }
  }

  rafId = requestAnimationFrame(step);
  return () => cancelAnimationFrame(rafId);
}

/**
 * Magnetic button follower for fine pointer devices
 */
export function attachMagnetic(el: HTMLElement, strengthX = 0.24, strengthY = 0.3) {
  if (!isFinePointer()) return () => {};

  let currentX = 0;
  let currentY = 0;
  let targetX = 0;
  let targetY = 0;
  let animId: number | null = null;

  function render() {
    currentX += (targetX - currentX) * 0.18;
    currentY += (targetY - currentY) * 0.18;

    el.style.transform = `translate3d(${currentX.toFixed(2)}px, ${currentY.toFixed(2)}px, 0)`;

    if (Math.abs(targetX - currentX) > 0.05 || Math.abs(targetY - currentY) > 0.05) {
      animId = requestAnimationFrame(render);
    } else {
      el.style.transform = targetX === 0 ? '' : `translate3d(${targetX}px, ${targetY}px, 0)`;
      animId = null;
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (isReducedMotion()) return;
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    targetX = (e.clientX - centerX) * strengthX;
    targetY = (e.clientY - centerY) * strengthY;

    if (!animId) {
      animId = requestAnimationFrame(render);
    }
  }

  function onPointerLeave() {
    targetX = 0;
    targetY = 0;
    if (!animId) {
      animId = requestAnimationFrame(render);
    }
  }

  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerleave', onPointerLeave);

  return () => {
    el.removeEventListener('pointermove', onPointerMove);
    el.removeEventListener('pointerleave', onPointerLeave);
    if (animId) cancelAnimationFrame(animId);
    el.style.transform = '';
  };
}
