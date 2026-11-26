# Rapport CRM — Phase 1 Production-Ready Application

> **One CRM. Multiple businesses. Completely customizable workflows. One simple interface.**

Rapport CRM is a multi-business, customizable sales platform inspired by modern visual design aesthetics. It operates with **Google Sheets as its persistent application database**, featuring automated workflow triggers, multi-business workspace isolation, an interactive visual Kanban pipeline with terminal Won/Lost outcomes, Google Calendar meeting synchronization, and an AI-powered sales assistant.

---

## 🎨 Visual Source of Truth

The visual interface recreates the supplied design references:
- **Palette Tokens**: Warm Ivory (`#F4F1E9`), Cream Surface (`#FBFAF6`), Charcoal Navigation & Cards (`#252725`), Mustard Yellow (`#F0CF58`), Muted Forest Green (`#376E60`), and Terracotta Orange (`#CC5537`).
- **Layout**:
  - Vertical slim Charcoal navigation rail (`Search`, `New Deal`, `Hot Deals`, `Schedule`, `Pipeline`, `Email`, `Automations`, `AI Copilot`, `Settings`).
  - Brand header with business workspace switcher and horizontal navigation pills (`Overview`, `Pipeline`, `Customers`, `Schedule`, `Finance`, `Growth`, `Automations`, `Email`, `Settings`).
  - Sales Overview matching Screenshot 1 (KPIs, smooth bezier revenue curve with gradient and target line, 6 hot deals grid, 24% team quota circular gauge, stage mix segmented bar).
  - Deal Pipeline Kanban matching Screenshot 2 (Mustard, Green, and Terracotta columns, drag-and-drop, Won and Lost terminal dropzones, bottom floating undo toast).

---

## 🏗️ Architecture & Core Modules

```
src/
├── app/
│   ├── api/
│   │   ├── activities/           # Timeline & audit log endpoints
│   │   ├── ai/                   # AI Copilot (risk analysis, next actions, NL-to-workflow)
│   │   ├── automations/          # Workflow rule execution & dry-run simulation
│   │   ├── calendar/             # Google Calendar integration & Meet generation
│   │   ├── email/                # Email dispatch & template interpolation
│   │   ├── leads/                # Lead lifecycle & Won/Lost endpoints
│   │   ├── pipelines/            # Custom pipeline & stage configurations
│   │   ├── sheets/import/        # Google Sheets 4-step lead import wizard
│   │   ├── sheets/status/        # Google Sheets live connection & schema initializer
│   │   ├── tasks/                # Agenda, tasks, and follow-ups
│   │   └── workspaces/           # Multi-business workspace isolation
│   ├── globals.css               # Design tokens & responsive styles
│   ├── layout.tsx                # Font & viewport wrapper
│   └── page.tsx                  # Master CRM single-page application
├── components/
│   ├── automations/              # Trigger -> Conditions -> Actions visual builder
│   ├── customers/                # Customer lifetime accounts view
│   ├── deal/                     # DealDetailDrawer & NewDealModal
│   ├── email/                    # Tracked email composer & template manager
│   ├── finance/                  # Quota attainment & revenue forecasting
│   ├── growth/                   # Stage conversion funnels & rep leaderboard
│   ├── layout/                   # SidebarRail, TopNav, SearchModal, CreateWorkspaceModal
│   ├── overview/                 # Sales Overview dashboard (Screenshot 1)
│   ├── pipeline/                 # Deal Pipeline Kanban (Screenshot 2)
│   ├── schedule/                 # Daily agenda & Google Calendar integration
│   ├── settings/                 # Google Sheets persistence setup & stage editor
│   └── sheets/                   # Google Sheets import wizard
├── lib/
│   └── google-sheets/
│       ├── client.ts             # Official Google Sheets API client with retry backoff
│       ├── config.ts             # Runtime & environment credential loader
│       ├── repository.ts         # High-level CRM repository & fallback engine
│       ├── schema.ts             # Documented worksheet tabs and header rows
│       └── seed-data.ts          # Authentic demonstration dataset
└── types/
    └── crm.ts                    # TypeScript models and interfaces
```

---

## 📊 Google Sheets Database Schema

Google Sheets is the persistent application data store. Stable IDs (`deal-...`, `ws-...`) are used across all entities—never row indices.

| Worksheet Tab | Column Headers |
|---|---|
| `Workspaces` | `id`, `name`, `slug`, `industry`, `currency`, `timezone`, `logoUrl`, `monthlyTarget`, `createdAt`, `updatedAt` |
| `Members` | `id`, `workspaceId`, `name`, `email`, `role`, `avatar`, `color` |
| `Pipelines` | `id`, `workspaceId`, `name`, `isDefault`, `order`, `createdAt` |
| `Stages` | `id`, `workspaceId`, `pipelineId`, `name`, `order`, `color`, `probability`, `isWon`, `isLost`, `description` |
| `Leads` | `id`, `workspaceId`, `title`, `contactName`, `email`, `phone`, `company`, `value`, `pipelineId`, `stageId`, `ownerId`, `priority`, `status`, `source`, `expectedCloseDate`, `closingProbability`, `lossReason`, `wonAt`, `lostAt`, `tags`, `notesCount`, `customFieldsJson`, `createdAt`, `updatedAt` |
| `Customers` | `id`, `workspaceId`, `name`, `company`, `email`, `phone`, `status`, `totalRevenue`, `dealsCount`, `lastContactedAt`, `createdAt` |
| `Tasks` | `id`, `workspaceId`, `leadId`, `dealTitle`, `title`, `description`, `priority`, `dueDate`, `completed`, `completedAt`, `ownerId`, `createdAt` |
| `Activities` | `id`, `workspaceId`, `leadId`, `type`, `title`, `description`, `authorName`, `metadataJson`, `createdAt` |
| `Automations` | `id`, `workspaceId`, `name`, `triggerType`, `triggerStageId`, `conditionsJson`, `actionsJson`, `isActive`, `runCount`, `lastRunAt`, `createdAt` |
| `AutomationRuns` | `id`, `workspaceId`, `ruleId`, `ruleName`, `leadId`, `status`, `triggerEvent`, `actionsExecutedJson`, `log`, `executedAt` |
| `EmailTemplates` | `id`, `workspaceId`, `name`, `subject`, `body`, `variablesJson`, `createdAt` |
| `CalendarEvents` | `id`, `workspaceId`, `leadId`, `title`, `description`, `startIso`, `endIso`, `attendeesJson`, `meetUrl`, `googleEventId`, `synced`, `createdAt` |

---

## 🚀 Running the Application

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment (Optional for Live Google Sheets)
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```
---

## ⏰ Cron Scheduler & Serverless Hosting Setup

### 1. In-Process Scheduler (Persistent Node.js Servers)
When running as a long-lived Node.js server (`next start` on a VPS, Docker container, Railway, or Render background service), `src/instrumentation.ts` automatically runs an in-process ticker every **60 seconds**:
- Generates daily morning outreach tasks for new leads.
- Evaluates upcoming meetings (25-35 minutes ahead) and dispatches 30-minute reminder emails and notifications.
- Detects past due items and updates overdue statuses.

### 2. External Pinger Setup (Serverless Hosting — e.g. Vercel, Netlify)
Serverless runtime environments (such as Vercel serverless functions) spin down when idle, which pauses in-process `setInterval` loops. To ensure scheduled jobs run reliably in serverless environments:
1. Define `CRON_SECRET` in your environment variables (`.env.local` or host settings).
2. Configure an external cron pinger (e.g., [Cron-Job.org](https://cron-job.org), GitHub Actions, or Vercel Cron) to ping the endpoint every **5 minutes**:
   ```bash
   curl -X POST https://your-crm-domain.com/api/cron/tick \
     -H "x-cron-secret: <CRON_SECRET>"
   ```

#### Detected Hosting Limits:
- **Serverless Execution Timeout**: Serverless functions typically have a 10s to 15s execution timeout. The `/api/cron/tick` endpoint is lightweight and completes execution within 200-500ms.
- **State Persistence**: Lockout state, task states, email logs, and templates are stored durably in `data/crm-storage.json` or your live Google Sheets database, surviving server restarts and function recycles.
- **PWA Web Push**: Background mobile push without active browser focus requires third-party VAPID push infrastructure and platform push services. Developster CRM provides a full web app manifest (`manifest.json`) and service worker (`sw.js`) for homescreen installation, paired with rock-solid in-app notification badges and instant Gmail notifications that reach mobile devices directly.


### 3. Start the Development Server
```bash
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

### 4. Run the Automated Test Suite
```bash
node scripts/test-scenarios.mjs
```
Verifies all 31 critical scenario assertions across workspace separation, lead lifecycles, automations, Google Sheets imports, calendar, email, and AI endpoints.

---

## 🔒 Status & Boundaries

- **Fully Implemented & Verified**: Multi-business workspaces, Sales Overview dashboard, Deal Pipeline Kanban board with drag-and-drop and Won/Lost dropzones, Slide-over Deal Detail Drawer, Google Sheets 4-step import wizard, Visual Workflow Automation Builder with dry-run simulator, Google Calendar event scheduling, Email templates & logging, AI copilot assistants, and CSV data export.
- **Google Sheets Persistence**: Implemented with official Google Sheets v4 SDK, retry backoff, stable ID row mapping, 1-click database initialization, and runtime credential entry.
- **Phase 2 Boundary**: WhatsApp integration is cleanly isolated and excluded from Phase 1 per product specifications.
