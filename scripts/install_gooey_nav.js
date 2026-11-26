const fs = require('fs');

let jsx = fs.readFileSync('scripts/GooeyNav.jsx', 'utf8');
let css = fs.readFileSync('scripts/GooeyNav.css', 'utf8');

// Ensure flex-wrap: nowrap in GooeyNav.css
css = css.replace('.gooey-nav__list {\n  position: relative;\n  display: flex;\n  flex-wrap: wrap;', '.gooey-nav__list {\n  position: relative;\n  display: flex;\n  flex-wrap: nowrap;');

// Apply activeIndex = -1 changes
// 1. Clamping
jsx = jsx.replace(
  'const current = Math.min(Math.max(0, activeIndex ?? innerIndex), Math.max(0, items.length - 1));',
  '// Permit activeIndex = -1 to mean "no active tab" (e.g. Settings route)\n  const rawIndex = activeIndex ?? innerIndex;\n  const current = rawIndex === -1 ? -1 : Math.min(Math.max(0, rawIndex), Math.max(0, items.length - 1));'
);

// 2. settle function
jsx = jsx.replace(
  `    const settle = index => {\n      pills.clear();\n      drops.length = 0;\n      target = index;\n      const state = pill(index);\n      state.mass = 1;\n      state.scale = 1;\n      state.velocity = 0;\n      render();\n    };`,
  `    const settle = index => {\n      pills.clear();\n      drops.length = 0;\n      target = index;\n      if (index >= 0) {\n        const state = pill(index);\n        state.mass = 1;\n        state.scale = 1;\n        state.velocity = 0;\n      }\n      render();\n    };`
);

// 3. go function
jsx = jsx.replace(
  `    const go = (index, animate) => {\n      if (index === target) return;\n      if (!rects[index] || !animate || reduced || target < 0) {\n        settle(index);\n        return;\n      }`,
  `    const go = (index, animate) => {\n      if (index === target) return;\n      if (index < 0 || !rects[index] || !animate || reduced || target < 0) {\n        settle(index);\n        return;\n      }`
);

// 4. frame function resting state and host check
jsx = jsx.replace(
  `      const host = pills.get(target);\n      const resting =\n        drops.length === 0 &&\n        pills.size === 1 &&\n        host &&\n        Math.abs(host.mass - host.scale) < 0.0008 &&\n        Math.abs(host.velocity) < 0.004;`,
  `      const host = pills.get(target);\n      const resting =\n        (target < 0 && pills.size === 0 && drops.length === 0) ||\n        (drops.length === 0 &&\n        pills.size === 1 &&\n        host &&\n        Math.abs(host.mass - host.scale) < 0.0008 &&\n        Math.abs(host.velocity) < 0.004);`
);

jsx = jsx.replace(
  `      if (!resting || hovering) raf = requestAnimationFrame(frame);\n      else {\n        host.mass = 1;\n        host.scale = 1;\n        host.velocity = 0;\n        hover.alpha = hoverGoal;\n        render();\n      }`,
  `      if (!resting || hovering) raf = requestAnimationFrame(frame);\n      else {\n        if (host) {\n          host.mass = 1;\n          host.scale = 1;\n          host.velocity = 0;\n        }\n        hover.alpha = hoverGoal;\n        render();\n      }`
);

// 5. fallback rendering when target < 0
jsx = jsx.replace(
  `      if (!pipeline || !gl) {\n        const box = shape(target, 1);`,
  `      if (!pipeline || !gl) {\n        const box = target >= 0 ? shape(target, 1) : null;`
);

// 6. overlay clipPath when no boxes
jsx = jsx.replace(
  `      const settledPill = boxes.length === 1 && !blobs.length;\n      if (settledPill) {\n        const box = boxes[0];\n        overlay.style.clipPath = \`path('\${pillPath(box.cx - box.hw, box.cy - box.hh, box.hw * 2, box.hh * 2)}')\`;\n      } else {\n        overlay.style.clipPath = \`path('\${trace(boxes, blobs, smooth) || 'M0,0Z'}')\`;\n      }\n      overlay.style.visibility = 'visible';`,
  `      const settledPill = boxes.length === 1 && !blobs.length;\n      if (settledPill) {\n        const box = boxes[0];\n        overlay.style.clipPath = \`path('\${pillPath(box.cx - box.hw, box.cy - box.hh, box.hw * 2, box.hh * 2)}')\`;\n        overlay.style.visibility = 'visible';\n      } else if (boxes.length === 0 && !blobs.length) {\n        overlay.style.clipPath = 'none';\n        overlay.style.visibility = 'hidden';\n      } else {\n        overlay.style.clipPath = \`path('\${trace(boxes, blobs, smooth) || 'M0,0Z'}')\`;\n        overlay.style.visibility = 'visible';\n      }`
);

fs.writeFileSync('src/components/ui/GooeyNav.jsx', jsx, 'utf8');
fs.writeFileSync('src/components/ui/GooeyNav.css', css, 'utf8');

const dts = `import React from 'react';

export interface GooeyNavItem {
  label: string;
  href?: string;
  icon?: React.ReactNode;
}

export interface GooeyNavProps {
  items?: GooeyNavItem[];
  initialActiveIndex?: number;
  activeIndex?: number;
  onChange?: (index: number, item: GooeyNavItem) => void;
  theme?: 'dark' | 'light';
  color?: string;
  activeTextColor?: string;
  colors?: string[];
  size?: 'sm' | 'md' | 'lg';
  frame?: boolean;
  animationTime?: number;
  particleCount?: number;
  timeVariance?: number;
  spread?: number;
  gooeyness?: number;
  wobble?: number;
  hoverEffect?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

declare const GooeyNav: React.FC<GooeyNavProps>;
export default GooeyNav;
`;

fs.writeFileSync('src/components/ui/GooeyNav.d.ts', dts, 'utf8');
console.log('Successfully installed GooeyNav.jsx, GooeyNav.css, GooeyNav.d.ts');

