# Design Tokens Specification

Extracted directly from `_reference/` files:
- `_reference/index-Dxe3jV5a.css`
- `_reference/overview-B5nk_6Xf.css`
- `_reference/pipeline-BFzOllNL.css`
- `_reference/customers-BKd8WRW4.css`
- `_reference/schedule-D1EmyAoQ.css`
- `_reference/finance-xaw0gAQF.css`
- `_reference/growth-UUCB0_ZR.css`
- `_reference/projects-DHVOFd1L.css`
- `_reference/index-Dywa6qru.js.download`
- `_reference/css2`

---

## 1. Font Families & Typography

### Source: `_reference/css2` & `_reference/index-Dxe3jV5a.css`
- **Primary Font Family**: `'Urbanist', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif` (`--font`, `index-Dxe3jV5a.css:2`)
- **Weights**: `400`, `500`, `600`, `700` (`_reference/css2:5,14`, `index-Dxe3jV5a.css:2`)
- **Base Body Font**: `500 14px/1.45 var(--font)` (`index-Dxe3jV5a.css:2`)
- **Font Feature Settings**: `"tnum" 0` (tabular figures enabled on numbers via `.num, b[data-count], .tnum { font-variant-numeric: tabular-nums }`, `index-Dxe3jV5a.css:2`)

### Type Scale (Sizes & Line Heights)
- **Display / Page Header Title**: `clamp(28px, 2.6vw, 38px)`, line-height `1.04`, font-weight `600`, letter-spacing `-0.025em` (`index-Dxe3jV5a.css:2`)
- **Big Value / Metric**:
  - Revenue Hero: `clamp(30px, 3vw, 42px)`, line-height `1`, font-weight `600`, letter-spacing `-0.03em` (`overview-B5nk_6Xf.css:2`)
  - Ring Center Value: `38px`, line-height `1`, font-weight `600`, letter-spacing `-0.03em` (`overview-B5nk_6Xf.css:2`)
  - Growth Big Stat: `clamp(26px, 2.4vw, 34px)`, line-height `1.05`, font-weight `600`, letter-spacing `-0.03em` (`growth-UUCB0_ZR.css:2`)
  - Drawer Big Amount: `30px` (pipeline `pd-head__amt`) / `40px` (customer peek `peek__amt`), font-weight `700`, letter-spacing `-0.02em` / `-0.03em` (`pipeline-BFzOllNL.css:2`, `customers-BKd8WRW4.css:2`)
  - Finance Cash Total: `28px`, font-weight `700`, letter-spacing `-0.02em` (`finance-xaw0gAQF.css:2`)
- **Heading 1 / Drawer Title**: `25px`, line-height `1.12`, font-weight `700`, letter-spacing `-0.02em` (`pipeline-BFzOllNL.css:2`, `projects-DHVOFd1L.css:2`)
- **Heading 2**: `22px`, font-weight `700`, letter-spacing `-0.02em` (`index-Dxe3jV5a.css:2`, `customers-BKd8WRW4.css:2`)
- **Brand Logo Title**: `21px`, font-weight `700`, letter-spacing `-0.02em` (`index-Dxe3jV5a.css:2`)
- **Stat Value / Tile Amount**: `21px`, line-height `1.1`, font-weight `600` or `700`, letter-spacing `-0.01em` to `-0.02em` (`index-Dxe3jV5a.css:2`, `overview-B5nk_6Xf.css:2`, `customers-BKd8WRW4.css:2`)
- **Modal Title**: `20px`, font-weight `700`, letter-spacing `-0.015em` (`index-Dxe3jV5a.css:2`)
- **Card / Tile Title**:
  - Hot Tile Title: `19px`, line-height `1.14`, font-weight `600`, letter-spacing `-0.015em` (`overview-B5nk_6Xf.css:2`)
  - Deal Face Title: `17px`, line-height `1.16`, font-weight `700`, letter-spacing `-0.015em` (`pipeline-BFzOllNL.css:2`)
  - Standard Card Title: `15px`, font-weight `600`, letter-spacing `-0.005em` (`index-Dxe3jV5a.css:2`)
  - Pipeline Column Name: `14.5px`, font-weight `700`, letter-spacing `-0.01em` (`pipeline-BFzOllNL.css:2`)
- **Body / Tab / Button Text**: `13.5px`, font-weight `600` (`index-Dxe3jV5a.css:2`)
- **Secondary / Subtitle**: `12.5px` – `13px`, font-weight `500` (`index-Dxe3jV5a.css:2`)
- **Badges / Micro Tags / Hints**: `11px` – `12px`, font-weight `600` – `700` (`index-Dxe3jV5a.css:2`)

---

## 2. Colour Palette

### Light Theme (`:root`, `index-Dxe3jV5a.css:2`)
- `--bg`: `#ebe8e1` (Canvas warm linen background)
- `--mesh-a`: `#f2d3bd` (Soft peach blob)
- `--mesh-b`: `#cfdfcd` (Soft sage blob)
- `--mesh-c`: `#f1e4bf` (Soft honey blob)
- `--glass`: `#ffffff75` (rgba 255, 255, 255, 0.46)
- `--glass-2`: `#ffffffa3` (rgba 255, 255, 255, 0.64)
- `--glass-3`: `#ffffffd1` (rgba 255, 255, 255, 0.82)
- `--solid`: `#f6f4ef`
- `--float`: `#fdfcf9`
- `--well`: `#17191a0f` (rgba 23, 25, 26, 0.06)
- `--line`: `#17191a17` (rgba 23, 25, 26, 0.09)
- `--line-2`: `#17191a29` (rgba 23, 25, 26, 0.16)
- `--rim`: `#ffffffc7` (rgba 255, 255, 255, 0.78)
- `--text`: `#17191a` (Deep rich ink charcoal)
- `--muted`: `#676a66` (Mid-tone warm gray)
- `--faint`: `#8e918c` (Light sub-tone gray)
- `--cream`: `#fbf8f2`
- `--butter`: `#f2c94c` (Warm mustard gold)
- `--on-butter`: `#17191a` (High-contrast ink on butter)
- `--pine`: `#2f5c50` (Deep forest sage green)
- `--on-pine`: `#fbf8f2` (Light cream on pine)
- `--tomato`: `#c8431f` (Vibrant terracotta rust)
- `--on-tomato`: `#fbf8f2` (Light cream on tomato)
- `--ink`: `#17191a`
- `--on-ink`: `#fbf8f2`
- `--plain`: `#ffffff94`
- `--on-plain`: `#17191a`
- `--good`: `#2f7a52` (Emerald success green)
- `--bad`: `#c8431f` (Alert rust red)
- `--dock`: `#17191a`
- `--on-dock`: `#fbf8f2`
- `--pill`: `#17191a`
- `--on-pill`: `#fbf8f2`

### Dark Theme (`:root[data-theme=dark]`, `index-Dxe3jV5a.css:2`)
- `--bg`: `#111412` (Deep Obsidian / Forest Dark)
- `--mesh-a`: `#c8431f47`
- `--mesh-b`: `#2f5c5080`
- `--mesh-c`: `#f2c94c1a`
- `--glass`: `#ffffff0d` (rgba 255, 255, 255, 0.05)
- `--glass-2`: `#ffffff16` (rgba 255, 255, 255, 0.09)
- `--glass-3`: `#222624`
- `--solid`: `#1c201e`
- `--float`: `#242927`
- `--well`: `#ffffff0f` (rgba 255, 255, 255, 0.06)
- `--line`: `#ffffff14` (rgba 255, 255, 255, 0.08)
- `--line-2`: `#ffffff29` (rgba 255, 255, 255, 0.16)
- `--rim`: `#ffffff12` (rgba 255, 255, 255, 0.07)
- `--text`: `#f1eee8`
- `--muted`: `#a3a6a0`
- `--faint`: `#7d807b`
- `--ink`: `#f1eee8`
- `--on-ink`: `#17191a`
- `--tomato`: `#d8532d`
- `--plain`: `#ffffff12`
- `--on-plain`: `#f1eee8`
- `--good`: `#6cc59a`
- `--bad`: `#f08a68`
- `--dock`: `#ffffff14`
- `--on-dock`: `#f1eee8`
- `--pill`: `#f1eee8`
- `--on-pill`: `#17191a`
- `--pine` (Dark mode overrides): `#3d7465` (pipeline), `#3f7b6b` (growth), stroke `#6cc59a`

### Stage Colors (CRM Preserved Map + Reference Tone Mapping)
- **Qualification**: `#F2D15B` (Butter / Mustard tone: text `#292511` / `#17191a`)
- **Proposal**: `#286B5B` (Pine / Forest green tone: text `#FFFFFF`)
- **Negotiation**: `#C94F32` (Tomato / Terracotta tone: text `#FFFFFF`)
- **New Lead**: `#596C79` (Slate Blue tone: text `#FFFFFF`)
- **Meeting**: `#236F70` (Teal tone: text `#FFFFFF`)
- **Won**: `#2D7A58` (`--good`, Emerald green: text `#FFFFFF`)
- **Lost**: `#963F45` (Faint/crimson tone: text `#FFFFFF`)

### Lead Source Colors (`growth-UUCB0_ZR.css:2`)
- **WhatsApp**: `#1f9d55` (dark: `#49c27e`)
- **Slack**: `#8a3f8d` (dark: `#d58ad8`)
- **LinkedIn**: `#0a66c2` (dark: `#6fb1f5`)
- **Discord**: `#5865f2` (dark: `#9aa2ff`)
- **Email**: `var(--tomato)` (`#c8431f`)
- **Website**: `var(--pine)` (`#2f5c50`, dark: `#8cc7b4`)

---

## 3. Radii & Shapes (`index-Dxe3jV5a.css:2`)
- `--r-card`: `26px` (Main cards, modal dialogs, drawers)
- `--r-tile`: `22px` (Deal cards, overview tiles, task tiles)
- `--r-ctl`: `999px` (Pills, buttons, chips, search inputs, tabs, segmented controls)
- Secondary radii:
  - Mini cards / inner rows: `18px`, `16px`, `14px`, `12px`
  - Floating popover: `18px`
  - Toast: `999px`
  - Avatars: `50%` (circular)

---

## 4. Shadows & Lighting (`index-Dxe3jV5a.css:2`)
- `--shadow` (Cards, Panels):
  - Light: `0 1px 0 #ffffffb3 inset, 0 24px 48px -30px #46321e47`
  - Dark: `0 1px 0 #ffffff0d inset, 0 24px 48px -30px #000000b3`
- `--shadow-pop` (Modals, Drawers, Popovers, Dragging Cards, Toasts):
  - Light: `0 24px 60px -18px #281e1452, 0 2px 6px #281e1414`
  - Dark: `0 24px 60px -18px #000000b3, 0 0 0 1px #ffffff14`
- Deal Face Shadow (`pipeline-BFzOllNL.css:2`): `inset 0 1px #ffffff2e, 0 14px 24px -20px #1e140a80`
- Deal Drag Lift Shadow (`pipeline-BFzOllNL.css:2`): `0 34px 50px -18px #1e140a80, 0 10px 20px -10px #1e140a4d` (Dark: `0 34px 60px -14px #000c`)
- Dock Shadow: `0 20px 40px -18px #00000073`

---

## 5. Spacing & Layout Sizes (`index-Dxe3jV5a.css:2`)
- `--gap`: `16px`
- `--dock-x`: `20px` (desktop > 1180px), `14px` (<= 1180px)
- `--dock-w`: `60px`
- `--gutter`: `clamp(16px, 1.6vw, 28px)`
- `--app-max`: `1840px`
- App Padding (`index-Dxe3jV5a.css:2`):
  - Desktop: `22px var(--gutter) 48px calc(var(--dock-x) + var(--dock-w) + var(--gutter))`
  - Mobile (<= 760px): `14px max(14px, env(safe-area-inset-right)) calc(96px + env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left))`

---

## 6. Motion, Transitions & Animations

### Source: `index-Dxe3jV5a.css` & `index-Dywa6qru.js.download`

1. **Standard CSS Timing Function**:
   - `--ease`: `cubic-bezier(0.2, 0.8, 0.2, 1)` (`index-Dxe3jV5a.css:2`)
   - JS Equivalent: `power3.out` / `power4.out`

2. **Ambient Blobs (`Sl`, `index-Dywa6qru.js.download`)**:
   - Blob A (Peach): `x: 60px, y: 40px, scale: 1.08`, duration `14s`, ease `sine.inOut`, yoyo: true, repeat: infinite
   - Blob B (Sage): `x: -50px, y: -60px, scale: 0.94`, duration `18s`, ease `sine.inOut`, yoyo: true, repeat: infinite
   - Blob C (Honey): `x: 40px, y: 50px, scale: 1.1`, duration `22s`, ease `sine.inOut`, yoyo: true, repeat: infinite
   - Entrance: Opacity `0 -> 1`, duration `1.2s`, ease `power2.out`

3. **Page Header Per-Letter Title Reveal (`no`, `index-Dywa6qru.js.download`)**:
   - Target: `.ch` inside `.word`
   - From: `yPercent: 115`, `rotation: 6deg`
   - To: `yPercent: 0`, `rotation: 0deg`
   - Duration: `0.85s`
   - Ease: `power4.out` (`cubic-bezier(0.1, 0.9, 0.2, 1)`)
   - Stagger: `0.022s` per character
   - Parent has `aria-label` set to full text, children have `aria-hidden="true"`

4. **Sliding Ink Pill (`zs`, `index-Dywa6qru.js.download`)**:
   - Technique: `clip-path: inset(top right bottom left round 999px)`
   - Dual-edge Asymmetric Spring:
     - Moving Right:
       - Leading right edge: duration `0.36s`, ease `power3.out`
       - Trailing left edge: duration `0.55s`, ease `power3.inOut`
     - Moving Left:
       - Leading left edge: duration `0.36s`, ease `power3.out`
       - Trailing right edge: duration `0.55s`, ease `power3.inOut`

5. **Fade-Rise Entrance (`io`, `index-Dywa6qru.js.download`)**:
   - From: `opacity: 0, x: 0, y: 12px`
   - To: `opacity: 1, x: 0, y: 0`
   - Duration: `0.55s`
   - Ease: `power3.out`
   - Stagger: `0.045s`

6. **Card Stagger Entrance (`ro` / `ao`, `index-Dywa6qru.js.download`)**:
   - `ro`: From `opacity: 0, y: 34px, scale: 0.985` -> `opacity: 1, y: 0, scale: 1`, duration `0.9s`, ease `power3.out`, stagger `0.07s`
   - `ao` (Tilted Entrance): From `opacity: 0, y: 40px, rotation: i % 2 ? 3 : -3, scale: 0.94` -> `opacity: 1, y: 0, rotation: 0, scale: 1`, duration `0.8s`, ease `back.out(1.4)`, stagger `0.06s`

7. **Hover Lift (`ho`, `index-Dywa6qru.js.download` & `index-Dxe3jV5a.css:120`)**:
   - Pointer Enter: `y: -3px` (cards) or `-4px` (`data-lift`), duration `0.45s`, ease `power3.out`
   - Pointer Leave: `y: 0`, duration `0.5s`, ease `power3.out`
   - CSS Transition: `180ms cubic-bezier(0.2, 0.8, 0.2, 1)`

8. **Magnetic Buttons (`po`, `index-Dywa6qru.js.download`)**:
   - Pointer fine only (`@media (pointer: fine)`)
   - Translation: `dx * 0.24`, `dy * 0.3`
   - Duration: `0.5s`, ease `power3.out`

9. **Count-Up Animation (`uo`, `index-Dywa6qru.js.download`)**:
   - Duration: `1.2s`
   - Ease: `power3.out` (rAF easing)
   - Guarantees final exact numeric output

10. **Meter / Progress Fill (`index-Dxe3jV5a.css:2`)**:
    - Animate with `transform: scaleX(progress)` with `transform-origin: left / 0`, NEVER `width`
    - Transition: `transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)`

11. **Overlays (Modals, Drawers, Menus, Toasts)**:
    - Scale / Fade In: `160ms – 220ms`, `scale(0.96) -> scale(1)`
    - Backdrop Blur: `backdrop-filter: blur(6px)`, fade duration `0.3s`
    - Toast Entrance: `0.35s`, `translateY(12px) -> translateY(0)`
