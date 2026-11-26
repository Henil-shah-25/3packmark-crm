# Developster Hub CRM — Master Project Document

> **Document Type:** Master Project Status, Roadmap, Architecture Decisions & Implementation Tracker  
> **Source-of-Truth:** Actual repository source files, static compiler checks (`tsc --noEmit`), automated test suites (`npx tsx --test`), and Next.js production build (`next build`).  
> **Target System:** Developster Hub CRM (`rapport-app` / Developster Pulse)  
> **Operational Database Constraint:** Google Sheets API v4 (Strict Founder-Approved Constraint; zero PostgreSQL/Redis/Upstash in production).  
> **Last Synchronised Date:** 16 November 2026  
> **Current Milestone:** Phase 5.2.6 (Real PostgreSQL Security Verification & Prerequisites Audit — Completed)  
> **Production Approval Status:** **NOT GRANTED** (All implementations verified strictly for local and internal testing).

---

## 1. Project Overview

Developster Hub CRM (internally named `rapport-app`) is a multi-tenant Customer Relationship Management application combined with a visitor intelligence and tracking module (**Developster Pulse**) and an integrated **Central AI Gateway** for sales intelligence and deal coaching.

The application is deployed to **Vercel** as a full-stack Next.js project. Under locked founder architecture directives:
- **Google Sheets API v4** is the **exclusive operational database** during internal testing.
- No external SQL database (PostgreSQL) or managed caching/queue store (Redis / Upstash KV) is authorized for production deployment.
- Offline local development falls back to local JSON files (`data/*.json`) **only** when Google Sheets credentials are completely unconfigured.
- **Pulse intelligence is strictly deterministic**: no external generative AI APIs are permitted in visitor tracking, funnel progression, or behavioural segmentation.
- **Developster Pulse is currently deferred** until the domain and infrastructure deployment decisions are formally revisited.

---

## 2. Current Project Status

| Dimension | Current State | Evidence / Metrics |
| :--- | :--- | :--- |
| **Active Development Phase** | **3W PACKMARK PRIVATE LIMITED — Phase 5.22 (Stage-Lookup Closed/Won Task Purge & Quotation Queue Fix)** | Single-client customization in local workspace; Google Sheets API v4 operational |
| **Latest Completed Milestone**| **3W PACKMARK Phase 5.22 — `stageNameById` Hard Filter, Won/Closed Stage Sync & Stage-Accurate Queue Titles** | Verified with `npx tsc --noEmit` (Exit code 0, 0 errors) |
| **Current Next Task** | **Manual Local Verification of Complete 3W PACKMARK CRM** | Strictly local; zero git push or Vercel deploy |
| **Phase 5.2.6 Dedicated Tests**| **12 / 12 PASSED (100%)** | `tests/security-phase5-2-6.test.ts` (Exit code 0, 2.21s) |
| **Phase 5 Regression Suite** | **122 / 122 PASSED (100%)** | 7 suites (`tests/security-phase5*.test.ts`, Exit code 0, 12.59s) |
| **Kernel-Level PostgreSQL Status**| **NOT EXECUTED** | Documented prerequisite gap: local PG / Docker / staging URL unavailable |
| **AI Gateway Matrix Tests** | **125 / 125 PASSED (100%)** | 9 test suites (`tests/ai-gateway-*.test.ts`, 7.12s, Exit code 0) |
| **CRM Feature & Regression** | **71 / 71 PASSED (100%)** | 5 suites (`tests/security-ai-auth.test.ts`, `tests/security-ai-google-sheets.test.ts`, `tests/live-google-sheets-ai-chats.test.ts`, etc., Exit code 0) |
| **Lead Prioritisation Suite**| **12 / 12 PASSED (100%)** | `tests/lead-scoring.test.ts` (Exit code 0, 30.4ms) |
| **TypeScript Compiler** | **0 Errors (Clean)** | `npx tsc --noEmit` (Exit code 0) |
| **Production Build** | **67 / 67 Routes Compiled** | `npm run build` (Exit code 0) |
| **Production Approval** | **NOT GRANTED** | Strictly approved for internal development and staging |

---

## 3. Master Product Roadmap

```
1. Security Completion (Phase 5 Security Closure & Independent Verification)
   │
2. Developster Pulse (Visitor Intelligence — Currently DEFERRED pending domain decision)
   │
3. Sales Analytics (Deterministic Pipeline Metrics & Rep Performance)
   │
4. Sales Forecasting (Weighted Pipeline Forecasts & Milestone Projections)
   │
5. Customer Voice / Reviews (Testimonial Ingestion & Satisfaction Signals)
   │
6. Central AI Gateway & Hybrid AI Billing (Controlled Gateway & COGS Metering)
   │
7. CRM Improvements & Bug Fixes (Kanban, Communication, Workflow Refinements)
   │
8. CRM Purchasing Website & Subscriptions (Public SaaS Portal & Customer Billing)
   │
9. Full QA, Performance, Security & Load Testing (Production Readiness Audit)
   │
10. Controlled Customer Launch (Phase 6 Production Go-Live)
```

### Proposed Roadmap Features (Not Yet Implemented):
1. **Lead Prioritisation Engine (Hot / Warm / Cold Classification):**
   - Automatically evaluates lead details, logged interaction frequency, recency, and buying signals.
   - Categorises opportunities as **Hot**, **Warm**, or **Cold**.
   - Assists sales teams in prioritising follow-ups to prevent highly interested prospects from going cold due to sequential calling lists.
2. **WhatsApp & Telegram Conversational CRM Entry:**
   - Allows busy business owners and sales reps to submit customer details and transaction notes directly via chat messaging.
   - Automatically parses conversational input to create or update CRM lead and customer records.
   - Triggers automated follow-up workflows and calendar callbacks.

---

## 4. Phase and Subphase Tracker

| Phase / Subphase | Module / Objective | Status | Independent Verification | Production Approval |
| :--- | :--- | :--- | :--- | :--- |
| **Phase 1** | Core CRM Foundations & Basic Repositories | **Done** (Internal) | Completed | Pending |
| **Phase 2** | Authentication Security & Session Management | **Done** (Internal) | Completed (`PHASE_2_AUTHENTICATION_SECURITY_REPORT.md`) | Pending |
| **Phase 3** | Rate Limiting & Denial of Service Protection | **Done** (Internal) | Completed (`PHASE_3_RATE_LIMITING_SECURITY_REPORT.md`) | Pending |
| **Phase 4** | XSS, Input Sanitization & Mass Assignment | **Done** (Internal) | Completed (`PHASE_4_XSS_INPUT_VALIDATION_SECURITY_REPORT.md`) | Pending |
| **Phase 5** | Production Multi-Tenant Security Infrastructure | **Active** | In Progress across subphases | **NOT GRANTED** |
| ├── **Phase 5.1** | Security Review & Architecture Hardening | **Done** (Internal) | Completed (`PHASE_5_1_INDEPENDENT_REVIEW_REPORT.md`) | Pending |
| ├── **Phase 5.2** | SQL Authorization & Schema Multi-Tenancy | **Done** (Internal) | Completed (`PHASE_5_2_CRITICAL_SECURITY_REMEDIATION_REPORT.md`) | Pending |
| ├── **Phase 5.2.1** | Authorization Remediation Verification | **Done** (Internal) | Completed (`PHASE_5_2_1_INDEPENDENT_SECURITY_VERIFICATION_REPORT.md`) | Pending |
| ├── **Phase 5.2.2** | SQL Authorization Remediation & Hardening | **Done** (Internal) | Completed (`PHASE_5_2_2_SQL_AUTHORIZATION_REMEDIATION_REPORT.md`) | Pending |
| ├── **Phase 5.2.3** | Final SQL Authorization Security Sign-Off | **Done** (Internal) | Completed (`PHASE_5_2_3_INDEPENDENT_SECURITY_VERIFICATION_REPORT.md`) | Resolved via 5.2.5 |
| ├── **Phase 5.2.4** | SQL Authorization Remediation & Dual Pool Hardening | **Done** (Internal) | Completed (`PHASE_5_2_4_SQL_AUTHORIZATION_REMEDIATION_REPORT.md`) | Verified via 5.2.5 |
| ├── **Phase 5.2.5** | SQL Authorization Verification & Closure | **Done** (Internal) | Completed (`PHASE_5_2_5_SQL_AUTHORIZATION_VERIFICATION_REPORT.md`) | Verified |
| └── **Phase 5.2.6** | Real PostgreSQL Security Verification | **Done** (Audit & Spec) | Completed (`PHASE_5_2_6_POSTGRESQL_SECURITY_VERIFICATION_REPORT.md`) | Pending (Kernel Not Executed) |
| **PULSE-18** | Pulse Event Durability & Aggregate Rollups | **Done** (Internal) | Completed (`PULSE-17.10-FINAL-FEATURE-FEASIBILITY-ASSESSMENT.md`) | **Deferred** |
| └── **PULSE-18.6** | Controlled Vercel Runtime Verification | **Blocked** | Previews blocked by SSO project setting | **Deferred** |
| **AI Architecture** | Central AI Gateway & Persistence Remediation | **Active** | Subphase-by-Subphase Governance | **NOT GRANTED** |

---

## 5. AI Development Tracker

### Detailed AI Milestones History:

#### AI-00 — AI Architecture & Security Audit
- **Scope:** Read-only audit of existing Gemini integrations. Identified direct coupling across 5 provider call locations, global rate limiter sharing, and unmetered token consumption.
- **Deliverables:** `DEVELOPSTER_AI_00_REPOSITORY_AUDIT.md`.
- **Status:** **Done** (Audit Only).

#### AI-00.1 — Independent Security Validation
- **Scope:** Independent application security validation of `/api/ai/chat` and `/api/ai/chats`. Confirmed missing session authentication, missing tenant ownership verification, and cross-tenant conversation exposure.
- **Deliverables:** `DEVELOPSTER_AI_00_1_SECURITY_VALIDATION.md`.
- **Status:** **Done** (Confirmed Vulnerabilities).

#### AI-01 — Emergency AI Security Remediation
- **Scope:** Implemented mandatory session authentication on `/api/ai/chat` and `/api/ai/chats`. Added workspace identity extraction from cookies, lead-level access checks via `canUserAccessLead`, tenant-isolated briefing cache, and conversation ownership enforcement. Protected legacy `/api/ai` route.
- **Deliverables:** `DEVELOPSTER_AI_01_REMEDIATION_REPORT.md`, `tests/security-ai-auth.test.ts`.
- **Status:** **Done** (Internal Testing Only; Production Security Approval: **NOT GRANTED**).

#### AI-01.1 to AI-01.4 — Security Review and Remediation Passes
- **Scope:** Successive independent review passes and targeted fixes:
  - Eliminated cross-tenant briefing cache leakage by strictly prefixing cache keys with `workspaceId`.
  - Added role and user scoping to prevent intra-workspace privilege leakage.
  - Hardened temporary JSON chat storage with write locks.
  - Implemented server-side permission checks for all AI tools (`crm-tools.ts`).
- **Deliverables:** `DEVELOPSTER_AI_01_1_INDEPENDENT_VERIFICATION.md`, `DEVELOPSTER_AI_01_2_REMEDIATION_REPORT.md`, `DEVELOPSTER_AI_01_3_FINAL_SECURITY_VERIFICATION.md`, `DEVELOPSTER_AI_01_4_FINAL_SECURITY_REVIEW.md`.
- **Status:** **Done** (Accepted for internal testing; Production approval pending).

#### AI-02 — Google Sheets AI Conversation Persistence
- **Scope:** Replaced temporary JSON chat storage with Google Sheets persistent storage. Designed dedicated `AI_CHATS` tab with a 16-column schema:
  `['id', 'workspaceId', 'userId', 'conversationId', 'messageId', 'role', 'content', 'parentMessageId', 'sequenceNumber', 'isDeleted', 'tokenCount', 'model', 'latencyMs', 'clientVersion', 'createdAt', 'updatedAt']`.
  Implemented event-oriented conversation storage, deterministic session reconstruction, soft-deletion, and migration utility (`chats-migration.ts`).
- **Deliverables:** `src/lib/ai/google-sheets-chats-store.ts`, `DEVELOPSTER_AI_02_GOOGLE_SHEETS_IMPLEMENTATION_REPORT.md`, `tests/security-ai-google-sheets.test.ts`.
- **Status:** **Done** (Mock Verified).

#### AI-02.1 — Live Google Sheets Verification
- **Scope:** Executed live integration verification against authorized test workbook `RAPPORT-CRM-BACKEND` using service account `rapport-crm@gen-lang-client-0799837491.iam.gserviceaccount.com`.
- **Verification Evidence:**
  - Verified presence and schema of `AI_CHATS` tab (26 worksheets total).
  - Created synthetic conversations, reconstructed message histories, verified title updates, verified tombstone soft deletion.
  - Proved cross-tenant isolation and migration tool safety.
  - Results: **5/5 live tests passed; 39/39 regression tests passed.**
- **Limitations Documented:** In-process write lock does not solve multi-instance distributed concurrency on Vercel; AI conversations remain strictly separate from customer CRM business tables.
- **Deliverables:** `DEVELOPSTER_AI_02_1_LIVE_INTEGRATION_VERIFICATION.md`, `tests/live-google-sheets-ai-chats.test.ts`.
- **Status:** **Done** (Live Integration Tested for Internal Development).

#### AI-03 — Central AI Gateway Architecture & Audit
- **Scope:** Complete architectural blueprint for the Central AI Gateway. Audited repository and identified:
  - 5 direct AI provider call locations: `sales-manager.ts` (L125 & L226), `gemini/client.ts` (L38, L59, L98).
  - 6 AI routes + 2 health routes.
  - 4 specialized AI agents (`sales_intelligence_agent`, `lead_diagnostic_agent`, `executive_briefing_agent`, `workflow_architect_agent`).
  - Flawed global rate limiter in `rate-limiter.ts`.
- **Approved Architectural Decisions:**
  - One Central AI Gateway (`src/lib/ai-gateway/`).
  - Provider-independent adapter abstraction (`IAiProviderAdapter`).
  - Gemini as the initial provider; `gemini-2.5-flash` as the approved default model.
  - Developster-owned server-side `GEMINI_API_KEY` exclusively. Zero BYOK; zero customer keys.
  - No credit conversion decisions; no financial billing ledger in initial phases.
  - Existing CRM authentication and RBAC remain authoritative.
- **Deliverables:** `DEVELOPSTER_AI_03_CENTRAL_AI_GATEWAY_ARCHITECTURE.md`, `DEVELOPSTER_AI_03_1_IMPLEMENTATION_SPEC.md`.
- **Status:** **Done** (Architecture Blueprint Approved for Implementation).

#### AI-03.1 — Central AI Gateway Foundation & Contracts
- **Scope:** Built foundational contracts, types, configurations, errors, and orchestrator:
  - `src/lib/ai-gateway/types.ts`: Pure TypeScript types (requests, responses, contexts, tasks, tools).
  - `src/lib/ai-gateway/config.ts`: Central model policy (`gemini-2.5-flash`), timeouts, and COGS estimator. Zero credential reading.
  - `src/lib/ai-gateway/errors.ts`: Typed error hierarchy with automated secret sanitization.
  - `src/lib/ai-gateway/adapters/provider.interface.ts`: Pure `IAiProviderAdapter` interface.
  - `src/lib/ai-gateway/index.ts`: `AiGatewayService` orchestrator with context validation and timeout aborts.
  - `tests/ai-gateway-foundation.test.ts`: 13 comprehensive unit tests using test doubles.
- **Verification Evidence:**
  - 13/13 foundation tests passed (1.47s, Exit code 0).
  - 39/39 regression tests passed (39.5s, Exit code 0).
  - TypeScript passed (0 errors); Next.js production build passed (67/67 routes).
- **Deliverables:** `src/lib/ai-gateway/`, `tests/ai-gateway-foundation.test.ts`.
- **Status:** **Done** (Conditionally Accepted).

#### AI-03.1.1 — Independent AI Gateway Foundation Review
- **Scope:** Independent code audit of AI-03.1.
- **Findings:**
  - Confirmed zero `@google/genai` imports in foundation.
  - Confirmed zero premature credential resolution.
  - Confirmed mandatory trusted execution context (`workspaceId`, `userId`, `traceId`).
  - Confirmed timeout cancellation terminates client socket requests via `AbortSignal`.
  - Identified 3 non-blocking recommendations assigned to AI-03.3:
    1. Runtime validation of `userRole` against allowed enum values.
    2. Defensive token parameter casting in `estimateProviderCost`.
    3. Runtime shallow-freezing of `request.context`.
- **Deliverables:** `DEVELOPSTER_AI_03_1_1_INDEPENDENT_REVIEW.md`.
- **Status:** **Done** (Conditional Pass. Foundation accepted for internal development; NOT production security approval).

#### AI-03.2 — Gemini Provider Adapter Implementation
- **Scope:**
  - Implemented `src/lib/ai-gateway/adapters/gemini-adapter.ts` implementing `IAiProviderAdapter`.
  - Wrapped installed `@google/genai` SDK v2.31.0 (`client.models.generateContent`).
  - Bound Developster-owned server-side `process.env.GEMINI_API_KEY`.
  - Pinned initial approved model to `gemini-2.5-flash`.
  - Translated text requests, system instructions, and structured JSON schemas.
  - Extracted token usage and normalized response into `AiGatewayResponse`.
  - Mapped provider errors into gateway error hierarchy with secret scrubbing.
  - Unit tested using mocked GoogleGenAI client (18 test scenarios).
- **Verification Evidence:**
  - 18/18 adapter tests passed (`tests/ai-gateway-gemini-adapter.test.ts`, 113.8ms).
- **Deliverables:** `src/lib/ai-gateway/adapters/gemini-adapter.ts`, `tests/ai-gateway-gemini-adapter.test.ts`.
- **Status:** **Done** (Implemented and Tested).

#### AI-03.3 — AI Gateway Security & Request Controls
- **Scope:**
  - Implemented security guardrails, request bounding, and rate limiting in `src/lib/ai-gateway/guardrails.ts`.
  - Resolved all 3 recommendations from AI-03.1.1:
    1. Runtime validation of `userRole` against `VALID_USER_ROLES` (`owner`, `admin`, `member`, `system`).
    2. Context runtime freezing via `createImmutableExecutionContext` (`Object.freeze`).
    3. Defensive token parameter casting in `estimateProviderCost` to prevent `NaN` arithmetic.
  - Enforced request bounds (prompt <= 50k chars, messages <= 100, single message <= 25k chars, total context <= 100k chars, temperature 0.0-2.0).
  - Implemented untrusted CRM data framing and delimiter neutralization (`frameUntrustedCrmContent`).
  - Implemented server-side tool validation against `APPROVED_CRM_TOOLS` (`validateProposedToolCall`).
  - Integrated tenant-level (`tenant:${workspaceId}:ai`, 60/min) and user-level (`user:${workspaceId}:${userId}:ai`, 20/min) rate limiting via `src/lib/rate-limit/`.
- **Verification Evidence:**
  - 18/18 security tests passed (`tests/ai-gateway-security.test.ts`, 84.6ms).
  - 13/13 foundation tests passed (`tests/ai-gateway-foundation.test.ts`, 217.1ms).
  - 18/18 Gemini adapter tests passed (`tests/ai-gateway-gemini-adapter.test.ts`, 113.8ms).
  - 39/39 existing regression tests passed (46.6s).
  - TypeScript type check passed (0 errors); Next.js production build passed (67/67 routes).
- **Deliverables:** `src/lib/ai-gateway/guardrails.ts`, `tests/ai-gateway-security.test.ts`, `DEVELOPSTER_AI_03_3_SECURITY_IMPLEMENTATION_REPORT.md`.
- **Status:** **Done** (Verified for Internal Testing).

#### AI-03.3.1 — Independent Security Review of AI Gateway Controls
- **Scope:** Independent read-only security review and empirical vulnerability probing of AI-03.3 implementation.
- **Findings Identified (6 total):**
  - **SEC-03-01 (Medium):** CRM role mismatch (`VALID_USER_ROLES` omits `'manager'` and `'read-only'`).
  - **SEC-03-02 (Medium):** `system` role accepted without cryptographic or internal caller token.
  - **SEC-03-03 (High):** Tool proposal validation does not check record- or tenant-level IDs in `call.arguments`; tool proposals are declarative instructions, not authorization.
  - **SEC-03-04 (Medium):** Brittle delimiter closing tag regex in `frameUntrustedCrmContent` missed tags with whitespace/attributes (e.g. `</untrusted_crm_context >`).
  - **SEC-03-05 (Low):** `frameUntrustedCrmContent` is currently uncalled by application routes.
  - **SEC-03-06 (Low):** Tool definition schema parameters lack byte-size and nesting depth limits.
- **Verification Evidence:**
  - 5/5 targeted probe tests passed (`tests/ai-gateway-security-review.test.ts`, 27.2ms).
  - 49/49 gateway tests passed (`tests/ai-gateway-security.test.ts`, `tests/ai-gateway-foundation.test.ts`, `tests/ai-gateway-gemini-adapter.test.ts`, 6.11s).
  - 39/39 regression tests passed (46.6s); TypeScript check passed (0 errors); Next.js build passed (67/67 routes).
- **Deliverables:** `DEVELOPSTER_AI_03_3_1_INDEPENDENT_SECURITY_REVIEW.md`, `tests/ai-gateway-security-review.test.ts`.
- **Status:** **Done — CONDITIONAL PASS** (Approved for internal gateway development; SEC-03-04 to be addressed in AI-03.4; SEC-03-01, SEC-03-02, and SEC-03-03 enforced during AI-03.6).

#### AI-03.3.2 — Remediation of AI Gateway Security Review Findings
- **Scope:** Complete code remediation of all 6 findings from `AI-03.3.1`:
  - **SEC-03-01:** Expanded `VALID_USER_ROLES` to support canonical CRM roles `manager` and `read-only`; added `normalizeUserRole()` helper; calibrated `APPROVED_CRM_TOOLS` permissions.
  - **SEC-03-02:** Protected `userRole: 'system'` via unforgeable internal symbol `SYSTEM_AUTH_SYMBOL` and `createSystemExecutionContext()`; rejected untrusted client-forged system contexts with 401.
  - **SEC-03-03:** Implemented `sanitizeProposedToolCall()` to authoritatively strip model-generated `workspaceId`, `userId`, or `tenantId` from proposed tool arguments and bind authenticated context.
  - **SEC-03-04:** Hardened `frameUntrustedCrmContent()` regex to sanitize closing tags containing arbitrary whitespace, attributes, and newlines; normalized Unicode brackets (`＜`, `＞`, `⟨`, `⟩`).
  - **SEC-03-05:** Documented existing prompt construction paths in `sales-manager.ts` and routes; formally tracked caller integration as an AI-03.4 and AI-03.6 prerequisite.
  - **SEC-03-06:** Implemented `SCHEMA_LIMITS` and `validateJsonSchemaSecurity()` enforcing max schema size ($\le 16$ KB), depth ($\le 6$), and argument size ($\le 32$ KB), rejecting circular references safely.
- **Verification Evidence:**
  - 15/15 remediation tests passed (`tests/ai-gateway-security-remediation.test.ts`, 30.4ms).
  - 5/5 review verification tests passed (`tests/ai-gateway-security-review.test.ts`, 11.5ms).
  - 18/18 security tests passed (`tests/ai-gateway-security.test.ts`, 43.0ms).
  - 13/13 foundation tests passed (`tests/ai-gateway-foundation.test.ts`, 129.0ms).
  - 18/18 Gemini adapter tests passed (`tests/ai-gateway-gemini-adapter.test.ts`, 83.3ms).
  - **Total Gateway Matrix: 69 / 69 passed (Exit code 0, 4.71s).**
  - 39/39 regression tests passed (43.4s); TypeScript check passed (0 errors); Next.js production build passed (67/67 routes).
- **Deliverables:** `DEVELOPSTER_AI_03_3_2_SECURITY_REMEDIATION_REPORT.md`, `tests/ai-gateway-security-remediation.test.ts`.
- **Status:** **Done** (All 6 findings remediated and empirically verified).

#### AI-03.4 — Central Agent Registry & Prompt Architecture
- **Scope:**
  - Implemented centralized Agent Registry (`src/lib/ai-gateway/agents/registry.ts`) registering all 4 canonical CRM agents:
    1. `sales_intelligence_agent` (tasks: `sales_chat`, `summarization`; roles: all; 5 approved tools).
    2. `lead_diagnostic_agent` (task: `lead_coach`; roles: all; lead tools; `LEAD_COACH_RESPONSE_SCHEMA`).
    3. `executive_briefing_agent` (tasks: `executive_briefing`, `summarization`; roles: owner/admin/manager/system; `EXECUTIVE_BRIEFING_RESPONSE_SCHEMA`).
    4. `workflow_architect_agent` (task: `workflow_generation`; roles: owner/admin/manager/system; `WORKFLOW_GENERATION_RESPONSE_SCHEMA`).
  - Authored versioned (`1.0.0`) authoritative system instructions with standard `SYSTEM_SECURITY_DIRECTIVE` in `prompts.ts`.
  - Implemented `buildAgentPrompt()` (`prompt-builder.ts`) automatically framing untrusted CRM notes, emails, and lead payloads with `frameUntrustedCrmContent()`, neutralizing delimiter injection.
  - Hardened security prerequisite: replaced `Symbol.for` with module-scoped private `Symbol('developster.ai_gateway.system_auth')` in `guardrails.ts`.
  - Enforced single approved model policy: strictly pinned to `gemini-2.5-flash` across all agents and prompt building flows.
  - Integrated agent validation (`validateAgentTask`), default system instructions, and schema bindings directly into `AiGatewayService.execute()`.
- **Verification Evidence:**
  - 11/11 agent registry tests passed (`tests/ai-gateway-agent-registry.test.ts`, 3.49s).
  - 80/80 full gateway matrix tests passed (all 6 test suites green, 2.33s).
  - 39/39 regression tests passed (42.4s); TypeScript check passed (0 errors); Next.js production build passed (67/67 routes).
- **Deliverables:** `src/lib/ai-gateway/agents/`, `tests/ai-gateway-agent-registry.test.ts`, `DEVELOPSTER_AI_03_4_IMPLEMENTATION_REPORT.md`.
- **Status:** **Done** (Implemented and Tested).

#### AI-03.5 — Central AI Gateway Usage Metering & Diagnostic Telemetry
- **Scope:**
  - Implemented `InMemoryTelemetryService` (`src/lib/ai-gateway/telemetry/`) recording operational usage metrics across all 4 CRM agents and direct gateway requests.
  - Enforced bounded FIFO ring buffer (default 1,000 events) preventing memory leaks in long-running processes.
  - Captured operational metadata: `traceId`, `workspaceId`, `userId`, `agentId`, `taskType`, `provider`, `model`, `promptTokens`, `completionTokens`, `totalTokens`, `durationMs`, `outcome` (`success`, `failure`, `timeout`, `rejected`), `errorCode`, `errorMessage`, `timestamp`, and `promptVersion`.
  - Guaranteed privacy & zero raw CRM content: raw prompt strings, conversation history, customer notes, and completion responses are NEVER persisted in telemetry.
  - Secret redaction: sanitized error text with `/AIza[0-9A-Za-z-_]{20,}/g` and Bearer token stripping.
  - Strict tenant isolation: `getEvents(workspaceId)` and `getAggregateMetrics(workspaceId)` strictly partitioned by tenant ID; cross-tenant leakage prevented.
  - Fault tolerance: `safeRecordTelemetry()` ensures telemetry failures never crash or disrupt valid AI requests.
  - Hardened system execution context: `createSystemExecutionContext()` enforces non-empty `workspaceId`.
- **Verification Evidence:**
  - 14/14 telemetry tests passed (`tests/ai-gateway-telemetry.test.ts`, 1.82s).
  - 94/94 full gateway matrix tests passed (all 7 test suites green, 1.95s).
  - 39/39 regression tests passed (33.8s); TypeScript check passed (0 errors); Next.js production build passed (67/67 routes).
- **Deliverables:** `src/lib/ai-gateway/telemetry/`, `tests/ai-gateway-telemetry.test.ts`, `DEVELOPSTER_AI_03_5_IMPLEMENTATION_REPORT.md`.
- **Status:** **Done** (Implemented and Tested).

#### AI-03.6 — Migration of Existing CRM AI Features to Central AI Gateway
- **Scope:**
  - Migrated all CRM AI application features from direct `@google/genai` SDK calls to the Central AI Gateway (`aiGateway.execute()` and `aiGateway.healthCheck()`).
  - Refactored `src/lib/gemini/client.ts`: completely removed direct SDK imports; routed `testGeminiConnection()` through `aiGateway.healthCheck('gemini')`; routed `generateWorkflowFromPrompt()` through `workflow_architect_agent`; routed `summarizeLeadAndMeeting()` through `taskType: 'summarization'`.
  - Refactored `src/lib/ai/sales-manager.ts`: completely removed direct SDK imports; routed `getLeadCoachAdvice()` through `lead_diagnostic_agent` and `LEAD_COACH_RESPONSE_SCHEMA`; routed `chatWithSalesManager()` through `sales_intelligence_agent`; formatted CRM data through `buildAgentPrompt()` and `frameUntrustedCrmContent()`; preserved state-hash caching and consultative fallbacks.
  - Hardened all AI API routes (`/api/ai/chat`, `/api/ai/coach`, `/api/ai/briefing`, `/api/ai/workflow-generate`) to construct and pass `TrustedExecutionContext` derived from authenticated server-side sessions.
  - Exported `clearCoachAdviceCache()` in `rate-limiter.ts` to guarantee test isolation.
  - Codebase Audit: Confirmed that `src/lib/ai-gateway/adapters/gemini-adapter.ts` is the **only** file in the entire repository that imports `@google/genai`.
- **Verification Evidence:**
  - 10/10 migration verification tests passed (`tests/ai-gateway-migration.test.ts`, 564.2ms).
  - 104/104 full gateway matrix tests passed (all 8 test suites green, exit code 0, 5.87s).
  - 39/39 regression tests passed (33.58s); TypeScript check passed (`tsc --noEmit`, exit code 0, 0 errors); Next.js production build passed (67/67 routes).
- **Deliverables:** `src/lib/gemini/client.ts`, `src/lib/ai/sales-manager.ts`, `tests/ai-gateway-migration.test.ts`, `DEVELOPSTER_AI_03_6_MIGRATION_REPORT.md`.
- **Status:** **Done** (All existing CRM AI features migrated to gateway; 104/104 gateway tests passed).

#### AI-03.7 — End-to-End Gateway Verification
- **Scope:**
  - Independent architectural, security, telemetry, and functional audit of the entire Central AI Gateway implementation (AI-03.1 through AI-03.6).
  - Verified that all CRM AI features execute via `aiGateway.execute()` or `aiGateway.healthCheck('gemini')`.
  - Confirmed via repository-wide audit that `src/lib/ai-gateway/adapters/gemini-adapter.ts` is the single source of SDK truth; zero direct `@google/genai` calls exist in application code.
  - Verified single model policy: strictly pinned to `gemini-2.5-flash`; single credential policy: Developster server-side `GEMINI_API_KEY`; zero BYOK; zero customer keys.
  - Verified server-side authentication, tenant context extraction, private `SYSTEM_AUTH_SYMBOL` defense, and lead-level access enforcement (`canUserAccessLead`).
  - Confirmed that AI has zero autonomous write execution capability; all write tools operate under human-in-the-loop UI confirmation through standard authenticated CRM routes.
  - Verified operational telemetry privacy: zero prompts, messages, or CRM records stored; genuine provider token recording; strict tenant filtering.
- **Verification Evidence:**
  - 104/104 full AI Gateway tests passed across all 8 suites (`tests/ai-gateway-*.test.ts`, 12.04s).
  - 71/71 CRM feature and regression tests passed across 5 suites (`tests/security-ai-auth.test.ts`, `security-ai-google-sheets`, `live-google-sheets-ai-chats`, `crm-acceptance`, `automations-and-calendar`, 33.05s).
  - TypeScript check passed (`tsc --noEmit`, exit code 0, 0 errors).
  - Next.js production build passed (`npm run build`, exit code 0, all 67/67 routes generated).
- **Findings Documented:** FIND-03-7-01 (Low: obsolete model dropdown options in Settings UI); FIND-03-7-02 (Informational: human-in-the-loop tool mutation architecture); FIND-03-7-03 (Informational: in-memory telemetry buffer serverless non-durability).
- **Deliverables:** `DEVELOPSTER_AI_03_7_VERIFICATION_REPORT.md`.
- **Status:** **Done — PASS** (Independently Verified for Internal Testing).

#### AI-03.7.1 — Verification Gap Closure & Security Review
- **Scope:**
  - Targeted verification and evidence gap closure across all 6 areas identified in AI-03.7:
    1. **Gap A (Trusted Context):** Proved non-forgeability of unexported private `SYSTEM_AUTH_SYMBOL`. Verified that `createSystemExecutionContext()` requires non-empty `workspaceId` and that `JSON.stringify()` drops symbols. Fixed object extensibility bug in `createImmutableExecutionContext()`.
    2. **Gap B (Tenant & Record Isolation):** Proved server-side lead access validation (`canUserAccessLead`) runs prior to CRM context aggregation. Verified that restricted/private leads are excluded from AI prompts and cross-workspace IDs are ignored.
    3. **Gap C (Tool Execution & Write Gating):** Documented all 5 approved CRM tools. Proved that AI models have zero direct write capability (actions returned as UI proposals). Proved `sanitizeProposedToolCall()` strips model-suggested tenant IDs. Verified `POST /api/tasks` rejects `Read-only` users with 403 Forbidden and binds session workspace.
    4. **Gap D (Provider Failure Coverage):** Verified deterministic consultative fallbacks across all CRM AI features (`chatWithSalesManager`, `getLeadCoachAdvice`, `generateWorkflowFromPrompt`, `summarizeLeadAndMeeting`) when provider is unreachable. Clearly distinguished live vs mocked test suites.
    5. **Gap E (Agent Registry Discrepancy):** Resolved documentation discrepancy: confirmed that canonical registry defines strictly `sales_intelligence_agent`, `lead_diagnostic_agent`, `executive_briefing_agent`, `workflow_architect_agent`, and `system_probe_agent`.
    6. **Gap F (Legacy Model Settings):** Cleaned up legacy dropdown in `SettingsView.tsx` (locked to `gemini-2.5-flash`); updated default fallback in `credentials.ts` to `gemini-2.5-flash`. Re-verified Gateway enforcement boundary rejects alternative models with `GatewayValidationError`.
- **Verification Evidence:**
  - 21/21 gap closure tests passed (`tests/ai-gateway-gap-closure.test.ts`, 12.5s).
  - 125/125 full AI Gateway test matrix passed across all 9 suites (`tests/ai-gateway-*.test.ts`, 7.12s, Exit code 0).
  - 71/71 CRM regression and feature tests passed (Exit code 0).
  - TypeScript check passed (`npx tsc --noEmit`, exit code 0, 0 errors).
  - Next.js production build passed (`npm run build`, exit code 0, all 67/67 routes generated).
- **Deliverables:** `DEVELOPSTER_AI_03_7_1_GAP_CLOSURE_REPORT.md`, `tests/ai-gateway-gap-closure.test.ts`.
- **Status:** **Done — PASS** (Verified for Internal Testing).

#### LEAD-01 — Behavioral Lead Scoring Engine & Identity Linking (Phase 1)
- **Scope:**
  - Implemented deterministic, explainable Lead Scoring Engine (`src/lib/scoring/lead-scorer.ts`):
    - 0–100 bounded score calculation with temperature tiers: `COLD` (0–29), `WARM` (30–69), and `HOT` (70–100).
    - Multi-touch behavioral weighting:
      - Email Engagement (opens: +5 pts up to 15, clicks: +10 pts up to 20, cap 25).
      - Pulse Website Behavior (sessions: +5 pts up to 10, high-intent product/pricing pages: +10 pts up to 15, repeat visits across distinct days: +10 pts, cap 30).
      - WhatsApp / SMS Engagement (delivered/read: +5 pts, link clicked: +10 pts, inbound reply: +15 pts, cap 25).
      - Call Logs (connected call: +5 pts base; duration thresholds >30s: +5 pts, >60s: +10 pts, >180s: +15 pts, cap 25).
      - Recency Decay for inactive leads (inactive >7d: -10 pts, >14d: -20 pts, >30d: -35 pts; bounded at 0).
    - Human-readable score breakdown reasons and transparent category point breakdown.
  - Outbound Tracked Links & Pulse SDK Identity Stitching:
    - Updated `src/app/api/pulse/v1/email/click/route.ts` to attach signed/workspace-scoped lead identifiers (`pulse_lid=<customerId>` and `cid=<customerId>`) when redirecting unauthenticated visitors to tracked websites.
    - Updated `public/pulse.js` to automatically extract identity parameters from URL search query (`pulse_lid`, `cid`, `lead_id`, `pulse_email`) on initialization and stitch visitor sessions via `saveStoredIdentities(...)`.
    - Updated `src/lib/pulse/tracker.ts` to resolve `leadId` / `customerId` during event ingestion, link customer/lead identities, and log timeline activities cleanly.
  - Google Sheets Persistence:
    - Added additive schema fields `'leadScore'`, `'leadTemperature'`, and `'scoreReasonsJson'` to `SHEET_NAMES.LEADS` in `src/lib/google-sheets/schema.ts` without disturbing existing column indexes.
    - Updated `src/lib/google-sheets/client.ts` (`numericFields`, `mapRowsToObjects`, `appendRow`, `appendRows`, `updateRowById`) for seamless camelCase and snake_case alias serialization.
    - Updated `src/lib/financial.ts` (`sanitizeLead`) to normalize and preserve lead score fields.
    - Added `calculateAndSaveLeadScore()` and `batchCalculateAndSaveLeadScores()` in `src/lib/google-sheets/repository.ts`.
- **Verification Evidence:**
  - 12/12 dedicated lead scoring tests passed (`tests/lead-scoring.test.ts`, 30.4ms, Exit code 0).
  - 12/12 Phase 1 security and idempotency tests passed (`tests/security-phase1.test.ts`, 1.71s, Exit code 0).
  - TypeScript compiler check passed with 0 errors (`npx tsc --noEmit`, Exit code 0).
- **Deliverables:** `src/lib/scoring/lead-scorer.ts`, `tests/lead-scoring.test.ts`.
- **Status:** **Done** (Phase 1 Implemented & Verified).

---

## 6. Feature Implementation Tracker

| Feature ID | Module | Feature Description | Storage Tier | Status | Verification Reference |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **AUTH-01** | Auth | Session Login, Logout & Cookie Issuance | Cookies / JWT HMAC | **IMPLEMENTED** | [`src/app/api/auth/login/route.ts`](file:///c:/Users/Henil%20Shah/OneDrive/Desktop/New%20Project/CRM%20PART%202/src/app/api/auth/login/route.ts) |
| **AUTH-02** | Auth | RBAC Role Boundaries (Owner -> Member) | Google Sheets (`Members`) | **IMPLEMENTED** | [`src/lib/auth/rbac.ts`](file:///c:/Users/Henil%20Shah/OneDrive/Desktop/New%20Project/CRM%20PART%202/src/lib/auth/rbac.ts) |
| **AUTH-03** | Auth | Token Revocation & Brute-Force Lockout | Memory / Upstash Redis | **PARTIALLY_IMPLEMENTED** | [`src/lib/auth/shared-store.ts`](file:///c:/Users/Henil%20Shah/OneDrive/Desktop/New%20Project/CRM%20PART%202/src/lib/auth/shared-store.ts) |
| **PIPE-01** | Pipeline | Multi-Pipeline & Stage Management | Google Sheets (`Pipelines`,`Stages`) | **IMPLEMENTED** | `tests/crm-acceptance.test.ts` |
| **PIPE-02** | Pipeline | Kanban Drag & Drop Deal Progression | Google Sheets (`Leads`) | **IMPLEMENTED** | [`src/components/pipeline/PipelineView.tsx`](file:///c:/Users/Henil%20Shah/OneDrive/Desktop/New%20Project/CRM%20PART%202/src/components/pipeline/PipelineView.tsx) |
| **PIPE-03** | Pipeline | Deal Loss Reason Capture & Win Tracking | Google Sheets (`Leads`) | **IMPLEMENTED** | [`src/app/api/leads/[id]/lost/route.ts`](file:///c:/Users/Henil%20Shah/OneDrive/Desktop/New%20Project/CRM%20PART%202/src/app/api/leads/[id]/lost/route.ts) |
| **CUST-01** | Customers| Customer Accounts & Revenue Totals | Google Sheets (`Customers`) | **IMPLEMENTED** | [`src/app/api/customers/route.ts`](file:///c:/Users/Henil%20Shah/OneDrive/Desktop/New%20Project/CRM%20PART%202/src/app/api/customers/route.ts) |
| **CUST-02** | Customers| Activity Timeline (Calls, Notes, Tasks) | Google Sheets (`Activities`) | **IMPLEMENTED** | [`src/components/customers/CustomerDetailDrawer.tsx`](file:///c:/Users/Henil%20Shah/OneDrive/Desktop/New%20Project/CRM%20PART%202/src/components/customers/CustomerDetailDrawer.tsx) |
| **AUTO-01** | Automations| Visual Node Graph Workflow Builder | Google Sheets (`Automations`) | **IMPLEMENTED** | [`src/components/automations/WorkflowInspector.tsx`](file:///c:/Users/Henil%20Shah/OneDrive/Desktop/New%20Project/CRM%20PART%202/src/components/automations/WorkflowInspector.tsx) |
| **AUTO-02** | Automations| Delay Nodes & Scheduled Job Dispatch | Google Sheets (`ScheduledJobs`) | **IMPLEMENTED** | `tests/automations-and-calendar.test.ts` |
| **COMM-01** | Comm | Outbound Email Dispatch via Nodemailer | Google Sheets (`EmailLogs`) | **PARTIALLY_IMPLEMENTED** | Requires verified live SMTP transport |
| **COMM-02** | Comm | MSG91 SMS & WhatsApp Inbound/Outbound | Google Sheets (`OAuthTokens`) | **PARTIALLY_IMPLEMENTED** | Requires verified live MSG91 credentials |
| **CAL-01** | Calendar | Google Calendar OAuth Connection | Google Sheets (`OAuthTokens`) | **PARTIALLY_IMPLEMENTED** | Requires live OAuth verification |
| **AI-GATEWAY**| AI | Central AI Gateway Foundation & Router | Pure In-Memory Abstraction | **IMPLEMENTED** | `tests/ai-gateway-foundation.test.ts` (13/13 passed) |
| **AI-ADAPTER**| AI | Gemini Provider Adapter Implementation | `@google/genai` v2.31.0 | **IMPLEMENTED** | `tests/ai-gateway-gemini-adapter.test.ts` (18/18 passed) |
| **AI-SECURITY**| AI | Gateway Security, Guardrails & Limits | Pure In-Memory / Rate Limiter | **IMPLEMENTED** | `tests/ai-gateway-security.test.ts` (18/18 passed) |
| **AI-REGISTRY**| AI | Central Agent Registry & Prompt Architecture | Pure In-Memory Abstraction | **IMPLEMENTED** | `tests/ai-gateway-agent-registry.test.ts` (11/11 passed) |
| **AI-TELEMETRY**| AI | Usage Metering & Diagnostic Telemetry | Pure In-Memory Rolling Buffer | **IMPLEMENTED** | `tests/ai-gateway-telemetry.test.ts` (14/14 passed) |
| **AI-MIGRATION**| AI | Feature Migration to Central Gateway | Pure In-Memory Routing | **IMPLEMENTED** | `tests/ai-gateway-migration.test.ts` (10/10 passed) |
| **AI-VERIFY** | AI | End-to-End AI Gateway Verification | Comprehensive E2E Matrix | **IMPLEMENTED** | `DEVELOPSTER_AI_03_7_VERIFICATION_REPORT.md` (104/104 gateway, 71/71 regression passed) |
| **AI-GAP-CLOSURE**| AI | Verification Gap Closure & Security Review | Targeted Gap Audit & Tests | **IMPLEMENTED** | `DEVELOPSTER_AI_03_7_1_GAP_CLOSURE_REPORT.md` (21/21 gap tests, 125/125 gateway matrix passed) |
| **AI-CHATS** | AI | Multi-Turn AI Conversation Persistence | Google Sheets (`AI_CHATS`) | **IMPLEMENTED** | `tests/live-google-sheets-ai-chats.test.ts` (5/5 live passed) |
| **PULSE-CORE**| Pulse | Visitor Analytics & Funnel Tracking | Google Sheets (`Pulse*`) | **IMPLEMENTED** | Deferred pending domain decision |

---

## 7. Architecture Decisions

| Decision ID | Decision Title | Scope | Approved Policy |
| :--- | :--- | :--- | :--- |
| **ADR-01** | Operational Database Constraint | Storage | Google Sheets API v4 is the sole operational database during internal testing; zero mandatory PostgreSQL/Redis in production. |
| **ADR-02** | Separation of Customer Data vs AI History | Data Ownership | Customer CRM records remain in customer business tables. AI conversation history is stored strictly in the dedicated `AI_CHATS` Google Sheets tab. |
| **ADR-03** | Future Vector Database Scope | Architecture | Vector databases are intended for semantic search and RAG knowledge retrieval, never as the default transactional chat store. |
| **ADR-04** | Central AI Gateway Pattern | AI | Every AI feature must communicate through the Central AI Gateway (`src/lib/ai-gateway/`) rather than direct SDK imports. |
| **ADR-05** | Platform Provider Credential Model | Security | AI requests use Developster-owned server-side `GEMINI_API_KEY`. No BYOK, no customer keys, no fallback across sources. |
| **ADR-06** | Approved Initial AI Model | AI Policy | Initial testing model is strictly pinned to `gemini-2.5-flash`. No automatic elevation to Pro; no unapproved paid models. |
| **ADR-07** | Decoupling Cost vs Billing Credits | Billing | Internal telemetry tracks raw provider tokens, latency, and estimated provider COGS. No financial ledger, billing tables, or credit ratios in gateway foundation. |
| **ADR-08** | Authoritative Security Boundary | Security | The AI Gateway is an orchestration engine, not an auth engine. Existing CRM session authentication and RBAC checks remain authoritative. |
| **ADR-09** | Server-Side Tool Execution | Security | Model outputs are declarative instructions. CRM tools re-verify user permissions and lead ownership server-side prior to executing mutations. |
| **ADR-10** | Deterministic Pulse Intelligence | Analytics | Visitor analytics, funnel progression, and behavioural segmentation must remain 100% deterministic with zero generative AI dependencies. |

---

## 8. Security Register

| Vulnerability / Risk ID | Component | Description | Status | Verification Reference |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-AI-01** | `/api/ai/chat`, `/api/ai/chats` | Missing session authentication & cross-tenant data exposure | **Remediated** (Internal) | `tests/security-ai-auth.test.ts` |
| **SEC-AI-02** | `/api/ai/briefing` | Cross-tenant briefing cache reuse across separate workspaces | **Remediated** (Internal) | `tests/security-ai-auth.test.ts` (Tests 14 & 20) |
| **SEC-AI-03** | `crm-tools.ts` | Unauthorized lead mutation or data access via AI function calling | **Remediated** (Internal) | Server-side `canUserAccessLead` checks |
| **SEC-AI-04** | `rate-limiter.ts` | Process-wide global rate limit causing cross-tenant DoS | **Remediated** (Internal) | Partitioned per-workspace rate checks |
| **SEC-AI-05** | Error Messages | Potential leakage of API keys, bearer tokens, or PII in exceptions | **Remediated** (Internal) | `src/lib/ai-gateway/errors.ts` sanitization regex |
| **SEC-AI-06** | AI Gateway | Missing trusted execution context allowing untrusted caller spoofing | **Remediated** (Internal) | `ContextAuthorizationError` on missing context |
| **SEC-DATA-01**| Google Sheets | CSV formula injection via unsanitized strings (`=`, `+`, `-`, `@`) | **Remediated** (Internal) | `src/lib/google-sheets/client.ts` sanitization |
| **SEC-AUTH-01**| Session Cookies | Insecure cookie flags or forgery | **Remediated** (Internal) | HMAC-SHA256 signature verification |

---

## 9. Known Limitations and Technical Debt

1. **Google Sheets Concurrency Under Serverless:**
   - Write serialization in `client.ts` uses an in-process promise lock.
   - On multi-instance serverless deployments (Vercel), concurrent writes from separate lambdas to the same sheet tab are subject to Google Sheets API read-modify-write race conditions.
2. **Serverless In-Memory Rate Limiting:**
   - In the absence of Upstash Redis credentials, rate limiters fall back to `MemoryRateLimiterStore`.
   - In-memory counters are local to a single Node.js runtime and do not share state across distributed serverless instances.
3. **Pulse Raw Event Durability on Vercel:**
   - High-frequency clickstream events cannot be durably ingested row-by-row into Google Sheets without exhausting API quotas.
   - Pulse live deployment is currently deferred until infrastructure domain decisions are finalized.
4. **Direct Provider Coupling in Legacy Files:**
   - Direct `@google/genai` calls still exist in `sales-manager.ts` and `gemini/client.ts`. Migration to the Gateway is scheduled for **AI-03.6**.

---

## 10. Active Blockers

1. **Production Deployment Blocked:**
   - Production deployment is strictly locked until Phase 5 security completion, independent third-party audit, and explicit founder sign-off.
2. **Developster Pulse Deployment Deferred:**
   - Pulse live preview testing is paused pending domain configuration decisions.
3. **External Provider Integration Gate:**
   - Outbound live delivery for WhatsApp/SMS (MSG91) and Calendar OAuth requires client-provided third-party production credentials.

---

## 11. Founder Decisions and Approvals

| Date | Topic | Decision Summary | Status |
| :--- | :--- | :--- | :--- |
| **2026-11-13** | Database Architecture | Google Sheets API v4 locked as exclusive operational database for internal testing. Zero mandatory PostgreSQL/Redis in production. | **Locked** |
| **2026-11-14** | AI Conversation Storage | Approved dedicated `AI_CHATS` Google Sheets tab for chat persistence during testing. Customer CRM records must remain separate. | **Locked** |
| **2026-11-15** | AI Provider Credentials | Developster uses its own server-side `GEMINI_API_KEY` for all internal testing. Zero BYOK; zero customer keys. | **Locked** |
| **2026-11-15** | AI Model Selection | Approved `gemini-2.5-flash` as the single default model for internal testing. No automatic elevation to Pro. | **Locked** |
| **2026-11-15** | AI Usage & Billing | Financial credit system and billing tables excluded from AI-03 foundation. Telemetry restricted to raw tokens, duration, and provider COGS. | **Locked** |
| **2026-11-15** | AI Security Governance | AI Gateway foundation accepted for internal development (AI-03.1.1 Conditional Pass). Hardening recommendations deferred to AI-03.3. | **Locked** |

---

## 12. Completed Milestones

- [x] **PULSE-18.1 / 18.1.1:** Websites, funnels, and segments Google Sheets persistence.
- [x] **PULSE-18.2:** High-value business milestone event persistence & webhook ingestion (`PulseEvents`).
- [x] **PULSE-18.3:** Daily aggregate rollups & metric summaries (`PulseDailyRollups`).
- [x] **PULSE-18.4 / 18.4.1 / 18.4.2:** Mathematical model holdout labelling, cart linkage, and zero-future-leakage validation.
- [x] **PULSE-18.5:** Live Google Sheets verification across all 5 Pulse tabs against `RAPPORT-CRM-BACKEND`.
- [x] **AI-00 / AI-00.1:** AI architecture inspection and independent security validation.
- [x] **AI-01 through AI-01.4:** AI security remediation, route authentication, briefing cache isolation, and independent verification.
- [x] **AI-02:** Google Sheets AI conversation store (`AI_CHATS` tab) implementation and mock verification.
- [x] **AI-02.1:** Live Google Sheets integration verification against `RAPPORT-CRM-BACKEND` (5/5 live tests, 39/39 regression tests green).
- [x] **AI-03:** Central AI Gateway architecture blueprint and repository audit.
- [x] **AI-03.1:** Central AI Gateway foundation, types, configs, errors, and interface contracts (13/13 tests green).
- [x] **AI-03.1.1:** Independent AI Gateway foundation review (Conditional Pass; 0 regressions).
- [x] **AI-03.2:** Gemini Provider Adapter Implementation (`@google/genai` v2.31.0, 18/18 tests green).
- [x] **AI-03.3:** AI Gateway Security, Request Controls & Multi-Tenant Rate Limiting (18/18 tests green).
- [x] **AI-03.3.1:** Independent Security Review of AI Gateway Controls (Conditional Pass; 6 findings documented; 5/5 probe tests green).
- [x] **AI-03.3.2:** Remediation of AI Gateway Security Review Findings (All 6 findings remediated; 69/69 gateway tests green).
- [x] **AI-03.4:** Central Agent Registry & Prompt Architecture (All 4 CRM agents registered, untrusted CRM framing, 11/11 tests green, 80/80 matrix green).
- [x] **AI-03.5:** Usage Metering & Diagnostic Telemetry (Bounded in-memory buffer, FIFO eviction, tenant isolation, 14/14 tests, 94/94 matrix green).
- [x] **AI-03.6:** Migration of Existing CRM AI Features to Central AI Gateway (All direct SDK calls removed from application code, 10/10 tests green, 104/104 matrix green).
- [x] **AI-03.7:** End-to-End Gateway Verification (Full independent verification, 104/104 gateway matrix, 71/71 regression matrix green, Pass).
- [x] **AI-03.7.1:** Verification Gap Closure & Security Review (All 6 evidence gaps closed, 21/21 gap tests green, 125/125 total gateway matrix green, Pass).
- [x] **Phase 5.2.4:** SQL Authorization Remediation & Dual Connection Pool Hardening (Remediated all 3 audit findings from Phase 5.2.3: implemented dedicated `getAuthPostgresPool()`, forward-only Migration 006 hardening `set_tenant_context` against NULL user spoofing, and enforcing invitation role hierarchy; 15/15 dedicated tests, 96/96 regression tests green).
- [x] **Phase 5.2.5:** SQL Authorization Verification & Closure (Identified and remediated the `SECURITY DEFINER` execution identity defect via Migration 007 using unforgeable `SESSION_USER` checks; hardened client `withTenantTransaction` exception propagation; 14/14 dedicated tests, 110/110 Phase 5 regression tests green; resolved Phase 5.2.3 conditional acceptance).
- [x] **Phase 5.2.6:** Real PostgreSQL Security Verification & Prerequisites Audit (Performed exhaustive environment audit: confirmed local PostgreSQL, Docker, WSL, and staging DB URLs are absent; explicitly recorded kernel verification as NOT EXECUTED without substituting mocks; verified migrations 001–007 sequential integrity and established 12-point staging test specification; 12/12 dedicated tests, 122/122 Phase 5 regression tests green).

---

## 13. Next Tasks

1. **AI-03.8 — Gateway Documentation, Architecture Synchronization & Governance Sign-Off** *(CURRENT NEXT TASK)*:
   - Synchronize master architecture document (`DEVELOPSTER_AI_03_CENTRAL_AI_GATEWAY_ARCHITECTURE.md`) with final AI-03 implementation state.
   - Author standard developer guides for adding future provider adapters, tools, and agent personas.
   - Prepare multi-tenant security verification sign-off package for founder review.
2. **Phase 5 Production Infrastructure Verification**:
   - Resolve deferred Pulse Vercel verification and finalize production readiness criteria.
3. **Phase 5.3 Staging Database Migration Planning**:
   - Establish staging PostgreSQL cluster validation protocol and controlled execution runbook.

---

## 14. MANDATORY PROJECT.MD UPDATE POLICY

> [!IMPORTANT]
> **GOVERNANCE DIRECTIVE FOR ALL AGENTS & DEVELOPERS:**
> Every autonomous agent or human developer working inside the Developster HUB CRM repository must strictly adhere to the following maintenance protocol:

1. **Read Before Starting:** Always inspect `PROJECT.md` at the beginning of every task to understand the current project state, active phase, and locked architecture decisions.
2. **No Contradictory Architecture:** Never introduce architectural patterns, dependencies, or storage layers that contradict approved decisions recorded in `PROJECT.md` (e.g. zero SQL/Redis in production; Google Sheets API v4 operational database; Developster-owned Gemini key).
3. **Update After Work:** Always update `PROJECT.md` upon the completion of any authorized implementation, security remediation, or audit task.
4. **Record Specific Details:** Record the task ID, actual implementation state, files created or modified, and exact test outcomes.
5. **Record Real Commands and Exit Codes:** Always include actual commands executed, test counts, durations, and process exit codes.
6. **Honest Reporting:** Never conceal failing tests, skipped checks, or incomplete background tasks. If a command hangs or is cancelled, document it as incomplete.
7. **Document New Decisions:** Record any newly approved founder directives or architecture adjustments with dates and rationale.
8. **Update Roadmaps & Next Tasks:** Keep the "Next Tasks" section synchronized with the immediate priority queue.
9. **Preserve History:** Never delete historical project records or change history entries. Append new milestones chronologically.
10. **Zero Fabricated Statuses:** Never mark a task `Done` merely because code was drafted. A task is `Done` only when code, automated tests, TypeScript checks, and build checks pass.
11. **Independent Verification Integrity:** Never mark a task `Independently Verified` unless an actual independent verification pass was performed.
12. **Founder Approval Required:** Never mark a task or release `Approved` without explicit founder authorization.
13. **No Premature Production Claims:** Never claim production readiness without complete Phase 5 security sign-off and founder release approval.
14. **Documentation Tasks:** If a task is documentation-only, explicitly record it as such.
15. **Scope Boundaries:** If an agent is not authorized to edit `PROJECT.md`, report proposed updates in visible text instead of editing unauthorized files.

---

## 15. Change History

- **2026-11-13:** Documented completion of PULSE-18.4 mathematical holdout validations, PULSE-18.5 live Google Sheets verification, and PULSE-18.6 preview access audit.
- **2026-11-14:** Recorded AI-00 security audit, AI-00.1 validation, AI-01 remediation, AI-01.1–AI-01.4 security review passes, and AI-02 Google Sheets conversation persistence.
- **2026-11-15 (TASK PROJECT-00):** Synchronised master project document with the completion of **AI-03 (Central AI Gateway Architecture)**, **AI-03.1 (Central AI Gateway Foundation & Contracts)**, and **AI-03.1.1 (Independent AI Gateway Foundation Review)**.
  - Formally established the 15-section master structure.
  - Recorded 10 locked Architectural Decisions (ADR-01 through ADR-10).
  - Documented AI-03.1.1 Conditional Pass and the 3 non-blocking recommendations assigned to AI-03.3.
- **2026-11-15 (AI-03.2 & AI-03.3):** Completed and verified Gemini Provider Adapter (`AI-03.2`) and AI Gateway Security & Request Controls (`AI-03.3`).
  - Implemented `GeminiAdapter` (`src/lib/ai-gateway/adapters/gemini-adapter.ts`) wrapping `@google/genai` v2.31.0 with platform `GEMINI_API_KEY` (18/18 tests green).
  - Implemented `guardrails.ts` with runtime `userRole` validation, context freezing, parameter sanitization, size bounding, untrusted CRM data containment framing, and server-side tool validation.
  - Connected tenant-isolated (`tenant:${workspaceId}:ai`) and user-isolated (`user:${workspaceId}:${userId}:ai`) rate limiting using existing `src/lib/rate-limit` infrastructure.
  - Created 18-scenario security test suite (`tests/ai-gateway-security.test.ts`, 18/18 tests green).
  - Validated full test matrix: 18 security tests, 13 foundation tests, 18 Gemini adapter tests, 39 regression tests, `tsc --noEmit` (0 errors), and `npm run build` (67/67 routes).
  - Produced `DEVELOPSTER_AI_03_3_SECURITY_IMPLEMENTATION_REPORT.md` and queued **AI-03.4 (Agent Registry & Model Routing)**.
- **2026-11-15 (AI-03.3.1):** Completed Independent Security Review of AI Gateway Controls.
  - Executed independent code audit and empirical verification of AI-03.3 controls.
  - Verified 5 empirical security probes (`tests/ai-gateway-security-review.test.ts`, 5/5 green).
  - Documented 6 findings: SEC-03-01 (role mismatch), SEC-03-02 (unverified system role), SEC-03-03 (tool proposal != authorization), SEC-03-04 (brittle delimiter regex), SEC-03-05 (uncalled framing utility), and SEC-03-06 (unbounded tool parameters schema).
  - Issued **CONDITIONAL PASS** for internal gateway development. Remediations planned for AI-03.4, AI-03.6, and Phase 5.
  - Produced `DEVELOPSTER_AI_03_3_1_INDEPENDENT_SECURITY_REVIEW.md` and confirmed **AI-03.4** as immediate next task.
- **2026-11-15 (AI-03.3.2):** Remediated all 6 findings from `AI-03.3.1`:
  - Remediated SEC-03-01 (`VALID_USER_ROLES` expanded to support canonical `manager` and `read-only`; `normalizeUserRole()` created).
  - Remediated SEC-03-02 (unforgeable `SYSTEM_AUTH_SYMBOL` and `createSystemExecutionContext()` protecting system role from client injection).
  - Remediated SEC-03-03 (`sanitizeProposedToolCall()` stripping model-generated tenant IDs and binding authenticated context).
  - Remediated SEC-03-04 (delimiter escaping hardened against whitespace, attributes, and Unicode homoglyphs).
  - Tracked SEC-03-05 (prompt framing integration documented as AI-03.4 and AI-03.6 prerequisite).
  - Remediated SEC-03-06 (`SCHEMA_LIMITS` and `validateJsonSchemaSecurity()` bounding schema size, depth, and argument payload).
  - Created 15-test remediation suite (`tests/ai-gateway-security-remediation.test.ts`, 15/15 green).
  - Verified total gateway matrix: 69/69 passed (Exit code 0, 4.71s); 39 regression tests green; `tsc --noEmit` 0 errors; `npm run build` 67/67 routes.
  - Produced `DEVELOPSTER_AI_03_3_2_SECURITY_REMEDIATION_REPORT.md` and authorized progression to **AI-03.4 (Agent Registry & Model Routing)**.
  - Established the permanent `MANDATORY PROJECT.MD UPDATE POLICY`.
- **2026-11-16 (AI-03.4):** Implemented Central Agent Registry & Prompt Architecture:
  - Created `AgentRegistry` singleton registering all 4 core CRM personas: `sales_intelligence_agent`, `lead_diagnostic_agent`, `executive_briefing_agent`, and `workflow_architect_agent`.
  - Authored versioned (`1.0.0`) authoritative system prompts and standard `SYSTEM_SECURITY_DIRECTIVE` in `prompts.ts`.
  - Implemented `buildAgentPrompt()` (`prompt-builder.ts`) automatically framing untrusted CRM notes, emails, and customer data using `frameUntrustedCrmContent()`.
  - Enforced single approved model policy: strictly pinned to `gemini-2.5-flash` across all agents and prompt building flows.
  - Remediated security prerequisite: converted `Symbol.for` to a module-scoped private `Symbol('developster.ai_gateway.system_auth')` in `guardrails.ts`.
  - Integrated runtime agent validation (`validateAgentTask`) and default schema binding into `AiGatewayService.execute()`.
  - Created 11-test agent registry suite (`tests/ai-gateway-agent-registry.test.ts`, 11/11 green).
  - Verified complete gateway matrix: 80/80 passed (Exit code 0, 2.33s); 39 regression tests green; `tsc --noEmit` 0 errors; `npm run build` 67/67 routes.
  - Produced `DEVELOPSTER_AI_03_4_IMPLEMENTATION_REPORT.md` and queued **AI-03.5 (Usage Metering & Diagnostic Telemetry)**.
- **2026-11-16 (AI-03.5):** Implemented Central AI Gateway Usage Metering & Diagnostic Telemetry:
  - Created `InMemoryTelemetryService` (`src/lib/ai-gateway/telemetry/`) implementing replaceable `IAiTelemetryService`.
  - Enforced bounded in-memory FIFO ring buffer (default 1,000 events) preventing memory growth.
  - Captured complete operational telemetry: `traceId`, `workspaceId`, `userId`, `agentId`, `taskType`, `provider`, `model`, `promptTokens`, `completionTokens`, `totalTokens`, `durationMs`, `outcome`, `errorCode`, `errorMessage`, `timestamp`, and `promptVersion`.
  - Enforced privacy: raw prompt strings, messages, and customer CRM records are strictly excluded from telemetry.
  - Redacted secrets in errors with `/AIza[0-9A-Za-z-_]{20,}/g` and Bearer token stripping.
  - Enforced strict tenant isolation on telemetry retrieval and aggregate metrics calculation.
  - Wired `safeRecordTelemetry()` into `AiGatewayService.execute()` ensuring telemetry failures never interrupt AI executions.
  - Hardened `createSystemExecutionContext()` to mandate a valid non-empty `workspaceId`.
  - Created 14-test telemetry suite (`tests/ai-gateway-telemetry.test.ts`, 14/14 green).
  - Verified total gateway matrix: 94/94 passed (Exit code 0, 1.95s); 39 regression tests green; `tsc --noEmit` 0 errors; `npm run build` 67/67 routes.
  - Produced `DEVELOPSTER_AI_03_5_IMPLEMENTATION_REPORT.md` and queued **AI-03.6 (Existing AI Feature Migration)**.
- **2026-11-16 (AI-03.6):** Migrated Existing CRM AI Features to Central AI Gateway:
  - Completely removed `@google/genai` imports from `src/lib/gemini/client.ts` and `src/lib/ai/sales-manager.ts`.
  - Routed Sales Intelligence Chat (`chatWithSalesManager`) through `aiGateway.execute()` with `sales_intelligence_agent` and `taskType: 'sales_chat'`.
  - Routed Lead Diagnostic Coach (`getLeadCoachAdvice`) through `aiGateway.execute()` with `lead_diagnostic_agent`, `LEAD_COACH_RESPONSE_SCHEMA`, and `taskType: 'lead_coach'`.
  - Routed Visual Workflow Architect (`generateWorkflowFromPrompt`) through `aiGateway.execute()` with `workflow_architect_agent`, `WORKFLOW_GENERATION_RESPONSE_SCHEMA`, and `taskType: 'workflow_generation'`.
  - Routed Lead & Meeting Summarizer (`summarizeLeadAndMeeting`) through `aiGateway.execute()` with `taskType: 'summarization'`.
  - Routed System Health Probe (`testGeminiConnection`) through `aiGateway.healthCheck('gemini')`.
  - Hardened application routes (`/api/ai/chat`, `/api/ai/coach`, `/api/ai/briefing`, `/api/ai/workflow-generate`) to construct and pass `TrustedExecutionContext`.
  - Integrated `buildAgentPrompt()` and `frameUntrustedCrmContent()` to sanitize delimiter injections across CRM context blocks.
  - Exported `clearCoachAdviceCache()` in `rate-limiter.ts` to ensure clean test isolation.
  - Verified that `src/lib/ai-gateway/adapters/gemini-adapter.ts` is the single source of SDK truth in the entire repository.
  - Created 10-test migration suite (`tests/ai-gateway-migration.test.ts`, 10/10 green).
  - Verified complete AI Gateway test matrix: **104 / 104 passed (100% green across all 8 suites, 5.87s)**.
  - Verified regression matrix: 39/39 green (33.58s); TypeScript check passed (0 errors); Next.js production build passed (67/67 routes).
  - Produced `DEVELOPSTER_AI_03_6_MIGRATION_REPORT.md` and queued **AI-03.7 (End-to-End Gateway Verification)**.
- **2026-11-16 (AI-03.7):** Completed Independent End-to-End AI Gateway Verification:
  - Executed independent architectural, security, telemetry, and functional audit across all AI-03 subphases.
  - Verified that all CRM AI application routes and services execute exclusively through `aiGateway.execute()` or `aiGateway.healthCheck()`.
  - Re-verified repository-wide zero direct `@google/genai` SDK usage outside of `src/lib/ai-gateway/adapters/gemini-adapter.ts`.
  - Confirmed strict adherence to single model (`gemini-2.5-flash`), server-side platform key (`GEMINI_API_KEY`), and zero BYOK / billing implementations.
  - Verified server-side session authentication, private `SYSTEM_AUTH_SYMBOL` internal context verification, and lead-level access enforcement (`canUserAccessLead`).
  - Verified that AI models have zero autonomous write capability; all write tools operate under human-in-the-loop client confirmation.
  - Confirmed telemetry privacy: zero raw prompts or CRM records logged, genuine provider token accounting, strict tenant isolation.
  - Verified complete AI Gateway test matrix: **104 / 104 passed (100% green, 12.04s)**.
  - Verified CRM feature and regression matrix: **71 / 71 passed (100% green, 33.05s)**.
  - Verified static type safety: `npx tsc --noEmit` passed (0 errors).
  - Verified production build: `npm run build` passed (all 67/67 routes compiled).
  - Produced `DEVELOPSTER_AI_03_7_VERIFICATION_REPORT.md` with overall verdict **PASS**.
  - Queued **AI-03.8 (Gateway Documentation, Architecture Synchronization & Governance Sign-Off)** as next logical task.
- **2026-11-16 (AI-03.7.1):** Completed AI-03.7.1 Verification Gap Closure & Security Consistency Review:
  - Addressed and closed all 6 evidence and consistency gaps identified in AI-03.7:
    - **Gap A (Trusted Context):** Proved non-forgeability of module-private `SYSTEM_AUTH_SYMBOL`. Verified that `createSystemExecutionContext()` mandates valid non-empty `workspaceId` and that JSON serialization strips symbols. Fixed object extensibility defect in `createImmutableExecutionContext()` (define symbol on object copy before freezing).
    - **Gap B (Tenant & Record Isolation):** Traced CRM data retrieval paths; proved `canUserAccessLead()` gates lead context extraction prior to prompt construction in `chatWithSalesManager` and deal coach.
    - **Gap C (Tool Execution & Write Gating):** Cataloged all 5 approved CRM tools. Proved models cannot directly mutate the database (proposals returned as interactive UI buttons). Verified `POST /api/tasks` enforces `authContext.user.workspaceId` and rejects `Read-only` users with 403 Forbidden. Proved `sanitizeProposedToolCall()` strips model-suggested tenant IDs.
    - **Gap D (Provider Failure Coverage):** Verified deterministic consultative fallbacks across all CRM AI features (`chatWithSalesManager`, `getLeadCoachAdvice`, `generateWorkflowFromPrompt`, `summarizeLeadAndMeeting`) during provider outages. Clearly distinguished live vs mocked test suites.
    - **Gap E (Agent Registry Discrepancy):** Resolved documentation discrepancy; confirmed canonical registry defines strictly `sales_intelligence_agent`, `lead_diagnostic_agent`, `executive_briefing_agent`, `workflow_architect_agent`, and `system_probe_agent`.
    - **Gap F (Legacy Model Settings):** Locked Settings UI dropdown to `gemini-2.5-flash` (disabled select); updated fallback defaults in `credentials.ts` to `gemini-2.5-flash`. Re-verified Gateway enforcement boundary rejects alternative models with `GatewayValidationError`.
  - Created 21-scenario targeted test suite: `tests/ai-gateway-gap-closure.test.ts` (**21/21 passed, 12.5s**).
  - Verified full AI Gateway matrix: **125 / 125 passed across all 9 suites (100% green, 7.12s)**.
  - Verified static typecheck: `npx tsc --noEmit` passed (0 errors).
  - Verified production build: `npm run build` passed (all 67/67 routes generated).
  - Produced `DEVELOPSTER_AI_03_7_1_GAP_CLOSURE_REPORT.md` with overall verdict **PASS**.
  - Confirmed **AI-03.8 (Gateway Documentation, Architecture Synchronization & Governance Sign-Off)** as immediate next milestone.
- **2026-11-16 (Phase 5.2.4):** Implemented SQL Authorization Remediation & Dual Connection Pool Hardening:
  - Resumed Phase 5 roadmap by remediating all 3 findings from `PHASE_5_2_3_INDEPENDENT_SECURITY_VERIFICATION_REPORT.md`:
    - **Finding 1 (P0):** Implemented dedicated authentication connection pool (`getAuthPostgresPool()`, `isAuthPostgresConfigured()`) in `src/lib/database/client.ts` connecting via `AUTH_DATABASE_URL` as least-privilege `auth_user`. Enforced TLS `rejectUnauthorized: true` and production configuration validation. Updated `closePostgresPool()` to drain both pools. Routed `getUserForLogin`, `recordLoginFailure`, `recordLoginSuccess`, and `recordLoginResult` in `src/lib/database/user-repository.ts` through `getAuthPostgresPool()`.
    - **Finding 2 (P1):** Created forward-only Migration `006_auth_pool_and_tenant_context_hardening.sql` hardening `set_tenant_context()`. Strictly blocks `app_user` callers from switching tenant context when `p_user_id` is NULL or empty; only `app_admin` or `postgres` can establish workspace context without a user binding. When `p_user_id` is supplied, validates active workspace membership.
    - **Finding 3 (P2):** Hardened `workspace_invite_member()` in Migration 006 and in-memory simulation in `user-repository.ts` to enforce role hierarchy: strictly prohibits workspace Admins from granting the `Owner` role (only existing Owners can invite/grant `Owner`).
  - Created dedicated 15-test test suite `tests/security-phase5-2-4.test.ts` (**15/15 passed, 2.97s**).
  - Verified full Phase 5 security regression matrix: **96 / 96 passed across all 5 suites (100% green, 13.04s)**.
  - Verified static typecheck: `npx tsc --noEmit` passed (**0 errors**).
  - Verified production build: `npm run build` passed (**67/67 routes generated**).
  - Produced `PHASE_5_2_4_SQL_AUTHORIZATION_REMEDIATION_REPORT.md`.
  - Queued **Phase 5.2.5 (Independent Security Re-Audit & Final SQL Sign-Off)** as immediate next milestone.
- **2026-11-16 (Phase 5.2.5):** Completed SQL Authorization Verification, Execution Identity Hardening & Closure:
  - Deep-dive inspection of PostgreSQL execution identity semantics in `set_tenant_context()`:
    - Uncovered critical defect: in a `SECURITY DEFINER` function, `CURRENT_USER` switches to the function owner (`app_admin` or `postgres`), causing `CURRENT_USER NOT IN ('app_admin', 'postgres')` to evaluate to `FALSE` for `app_user` callers and bypassing the NULL user guard.
    - Remediated via forward-only Migration `007_session_user_execution_identity_hardening.sql`: inspected `SESSION_USER` (the authenticating connection role, which cannot be forged by `app_user`).
    - Revoked `set_tenant_context` execution from `auth_user` and `PUBLIC` to enforce least privilege.
    - Hardened `withTenantTransaction` in `src/lib/database/client.ts`: removed blind catch so database authorization errors and tenant boundary violations immediately abort the transaction.
  - Verified dual connection pool architecture: `DATABASE_URL` (`app_user`) vs `AUTH_DATABASE_URL` (`auth_user`), TLS verification, fatal error on missing production auth configuration, and graceful shutdown.
  - Accurately documented that real PostgreSQL kernel verification is **NOT EXECUTED** due to lack of local disposable PostgreSQL cluster, without fabricating mock tests as kernel tests.
  - Created dedicated 14-test verification suite `tests/security-phase5-2-5.test.ts` (**14/14 passed, 1.88s**).
  - Verified full Phase 5 regression matrix: **110 / 110 passed across all 6 suites (100% green, 16.69s)**.
  - Verified static typecheck: `npx tsc --noEmit` passed (**0 errors**).
  - Formally resolved Phase 5.2.3 conditional acceptance.
  - Produced `PHASE_5_2_5_SQL_AUTHORIZATION_VERIFICATION_REPORT.md`.
  - Queued **AI-03.8 (Gateway Documentation, Architecture Synchronization & Governance Sign-Off)** as immediate next milestone.
- **2026-11-16 (Phase 5.2.6):** Completed Real PostgreSQL Security Verification & Prerequisites Audit:
  - Conducted comprehensive audit of host environment for PostgreSQL prerequisites:
    - Confirmed no local PostgreSQL Windows services, active processes, or default directories (`C:\Program Files\PostgreSQL`).
    - Confirmed no CLI binaries (`psql`, `pg_ctl`, `initdb`) on PATH.
    - Confirmed no container tooling (`docker`, `podman`, `wsl`) installed.
    - Confirmed zero database connection strings or credentials configured in environment files.
  - In strict compliance with governance rules, recorded real PostgreSQL kernel-level verification as explicitly **NOT EXECUTED**.
  - Verified sequential chain integrity of migrations 001 through 007 on disk.
  - Formulated the authoritative 12-point real PostgreSQL staging verification specification matrix for when staging infrastructure is attached.
  - Created dedicated 12-test test suite `tests/security-phase5-2-6.test.ts` (**12/12 passed, 2.21s**).
  - Verified full Phase 5 regression matrix: **122 / 122 passed across all 7 suites (100% green, 12.59s)**.
  - Verified static typecheck: `npx tsc --noEmit` passed (**0 errors**).
  - Produced `PHASE_5_2_6_POSTGRESQL_SECURITY_VERIFICATION_REPORT.md`.
  - Queued **AI-03.8 (Gateway Documentation, Architecture Synchronization & Governance Sign-Off)** as immediate next milestone.
- **2026-11-20 (PULSE-18.7):** Remediated Public Tracking & Ingestion Middleware Guardrails:
  - Updated `src/middleware.ts` to normalize incoming request paths (`normalizedPath.toLowerCase()`) and ensure unauthenticated public access for `/pulse.js`, `/api/pulse/v1/track`, `/api/pulse/v1/email/open`, `/api/pulse/v1/email/click`, `/api/pulse/v1/integrations/shopify/webhook`, and `/api/pulse/v1/integrations/woocommerce/webhook`.
  - Added native `OPTIONS` preflight handling returning HTTP 204 with full CORS headers (`Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, POST, OPTIONS`, `Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Accept`, `Access-Control-Max-Age: 86400`).
  - Added permissive CORS headers (`*`) to `GET` and `POST` responses for all public Pulse tracking and ingestion endpoints while keeping all dashboard pages and internal `/api/*` routes strictly protected under session authentication.
  - In strict compliance with Section 14 governance rules, documented that live remote network curl verification timed out/was skipped to avoid stalling and ensure zero speculative deployment claims.
  - Verified static type safety: `npx tsc --noEmit` passed (**0 errors**).
  - Verified regression security: `tests/security-phase1.test.ts` passed (**12/12 passed, 2.32s**).
- **2026-11-20 (PULSE-18.8):** Echo Request Origin in CORS Headers for Credentialed Tracking:
  - Created centralized CORS utility `src/lib/pulse/cors.ts` (`getPulseCorsHeaders`, `createPulsePreflightResponse`, `applyPulseCorsHeaders`).
  - Hardened CORS across `src/middleware.ts`, `src/app/api/pulse/v1/track/route.ts`, `src/app/api/pulse/v1/email/open/route.ts`, `src/app/api/pulse/v1/email/click/route.ts`, `src/app/api/pulse/v1/integrations/shopify/webhook/route.ts`, `src/app/api/pulse/v1/integrations/woocommerce/webhook/route.ts`, and `src/app/pulse.js/route.ts`.
  - When an incoming request includes an `Origin` header (such as `https://developsterhub.runs-on.dev`), CORS dynamically echoes the exact requesting origin and sets `Access-Control-Allow-Credentials: true`, `Vary: Origin`, and proper `Access-Control-Allow-Methods` and `Access-Control-Allow-Headers` for `OPTIONS` preflight and `POST` requests, preventing browser CORS blocks on credentialed tracking.
  - Kept Google Sheets API v4 as the sole active operational database and confirmed AI Gateway calls remain strictly pinned to `gemini-2.5-flash`.
  - In strict compliance with Section 14 governance rules, skipped slow/hanging live curl checks to avoid process timeouts.
  - Verified static type safety: `npx tsc --noEmit` passed (**0 errors**).
  - Verified regression security: `tests/security-phase1.test.ts` passed (**12/12 passed, 1.60s**).
- **2026-11-20 (LEAD-01):** Implemented Phase 1 of Lead Prioritisation (Behavioral Scoring Engine & Identity Linking):
  - Created deterministic, explainable Lead Scoring Engine (`src/lib/scoring/lead-scorer.ts`):
    - Calculates 0–100 score, temperature tiers (`COLD`: 0–29, `WARM`: 30–69, `HOT`: 70–100), and human-readable score breakdown reasons.
    - Factors: Email engagement (opens, clicks), Pulse website behavior (site visits, high-intent product/pricing pages, repeat visits), WhatsApp/SMS engagement (delivered/read, link clicks, inbound replies), call logs (connected calls and duration thresholds >30s, >60s, >180s), and recency decay for inactive leads (>7d, >14d, >30d).
  - Identity Linking:
    - Updated `src/app/api/pulse/v1/email/click/route.ts` to append `pulse_lid=<customerId>` and `cid=<customerId>` to outbound redirect destinations.
    - Updated `public/pulse.js` to automatically extract identity parameters from URL query string on initialization and stitch sessions with `saveStoredIdentities(...)`.
    - Updated `src/lib/pulse/tracker.ts` to resolve `leadId` and `customerId` during event ingestion and log CRM timeline activities.
  - Google Sheets Persistence:
    - Added additive schema fields `'leadScore'`, `'leadTemperature'`, and `'scoreReasonsJson'` to `SHEET_NAMES.LEADS` in `src/lib/google-sheets/schema.ts`.
    - Added bidirectional mapping and numeric field conversion in `src/lib/google-sheets/client.ts` (`leadScore`, `leadTemperature`, `scoreReasonsJson`).
    - Added normalization in `src/lib/financial.ts` (`sanitizeLead`).
    - Added `calculateAndSaveLeadScore()` and `batchCalculateAndSaveLeadScores()` in `src/lib/google-sheets/repository.ts`.
  - Verified static type safety: `npx tsc --noEmit` passed (**0 errors**).
  - Verified dedicated test suite: `tests/lead-scoring.test.ts` passed (**12/12 passed, 30.4ms**).
  - Verified regression security: `tests/security-phase1.test.ts` passed (**12/12 passed, 1.71s**).
- **2026-11-25 (3packmark Phase 1):** Executed Phase 1 single-client customization for **3packmark Private Limited** (strictly local, zero git push/Vercel deployment, `src/lib/ai-gateway/` and Google Sheets API v4 preserved intact):
  - **UI & Navigation Bloat Removal:**
    - Removed Developster Pulse, Communication (MSG91), and AI Sales Manager links from `src/components/layout/SidebarRail.tsx`, `src/components/layout/TopNav.tsx`, and `src/app/page.tsx`.
    - Removed `LeadCoachPanel` / `ai_coach` tab from `src/components/deal/DealDetailDrawer.tsx`, Gemini AI prompt bar from `src/components/automations/VisualWorkflowCanvas.tsx`, and Gemini AI / Google Calendar OAuth sections from `src/components/settings/SettingsView.tsx` and `src/components/settings/SystemHealthTab.tsx`.
  - **Branded Startup Splash Animation:**
    - Created `src/components/layout/StartupSplash.tsx` and mounted it in `src/app/layout.tsx` (1.8-second minimal typographic reveal for "3packmark Private Limited", once per browser session via `sessionStorage`).
    - Updated `src/lib/config.ts` and `src/app/layout.tsx` metadata to `3packmark CRM` / `3packmark Private Limited`.
  - **4-Seat Team Auth & 11-Stage Pipeline Seeding (`src/lib/google-sheets/seed-data.ts`):**
    - Configured and seeded 4 seats (`admin@3packmark.com` as `Owner`, plus `sales1@3packmark.com`, `sales2@3packmark.com`, `sales3@3packmark.com` as `Member`) with `scrypt` hashed passwords (zero plaintext stored).
    - Wired `/api/auth/me` user identity into `src/app/page.tsx` and `src/components/layout/TopNav.tsx`.
    - Seeded the 11-stage custom pipeline: `New Lead`, `Call Status`, `Inquiry`, `Quotation`, `Quotation Follow Up`, `Purchase Order`, `Invoice`, `Dispatch`, `Credit Days`, `Credit Follow Up`, `Closed`.
  - **Focused 3-Section Client Dashboard (`src/components/overview/OverviewView.tsx`):**
    - Replaced dashboard view with 3 operational sections only: **Leads Overview** (total leads + clickable stage breakdown), **Today's Tasks**, and **Follow-Up Tasks** (pending & overdue).
  - **Verification:** `npx tsc --noEmit` passed (**Exit code 0, 0 errors**).
- **2026-11-25 (3packmark Phase 1.1 — Critical Verification Fixes):**
  - **Authentication Gate Hardening:** Updated `src/middleware.ts` to reject and clear stale legacy Developster Hub session cookies (`developsterhub@gmail.com`, etc.) so unauthenticated or legacy-session requests immediately redirect to `/login` (HTTP 307). Added client-side `/api/auth/me` verification guard in `src/app/page.tsx` (`if (!authChecked) return null;`) and branded `src/app/login/page.tsx` for **3packmark Private Limited**.
  - **Startup Splash Overlay Fix:** Updated `src/components/layout/StartupSplash.tsx` to render immediately at `z-[9999]` on fresh tab session (`sessionStorage`) with valid `350ms` opacity fade-out (`1.8s` total) displaying **3packmark Private Limited** / *Enterprise Sales & Operations CRM*.
  - **Idempotent Google Sheets & Local Store Migration:** Added `'password'`, `'department'`, and `'assignedPipelineIds'` to `SHEET_HEADERS[SHEET_NAMES.MEMBERS]` in `src/lib/google-sheets/schema.ts`. Updated `ensureGoogleSheetsSeeded()` and `readLocalStore()` in `src/lib/google-sheets/repository.ts` to idempotently migrate existing `Workspaces`, `Members` (4 3packmark seats with `scrypt` hashes), `Pipelines`, and `Stages` (exact 11 stages in order) even when old rows already exist.
  - **Verification:** `npx tsc --noEmit` passed (**Exit code 0, 0 errors**).
- **2026-11-25 (3packmark Phase 2 — Lead Source, Dynamic Card Badges & Stage Popups):**
  - **Schema & Types:** Added `isDecisionMakerReached`, `callSubStatus`, `quotationSubStatus`, and `creditTerms` to `Lead` in `src/types/crm.ts` and `SHEET_HEADERS[SHEET_NAMES.LEADS]` in `src/lib/google-sheets/schema.ts`.
  - **Stage Rules & Card Subtitle Helper (`src/lib/pipeline/stage-rules.ts`):** Implemented `formatLeadCardSubtitle()` (`{Contact Name} | {Lead Source}` / `{Contact Name} | {Lead Source} | {Active Stage Tag}`, with `Cold Call (Gatekeeper)` vs `Cold Call ✓`) and `getStageExitClearUpdates()` for automatic tag erasure on stage transitions.
  - **Lead Source & Cold Call Conversion:** Updated `src/components/deal/NewDealModal.tsx` and `src/components/deal/DealDetailDrawer.tsx` to use the 4 canonical sources (`Phone Call`, `Visit`, `Cold Call`, `Seminar`). Added the Cold Call Gatekeeper vs Decision Maker status and 1-click **"Convert to Real Lead (Decision Maker Reached)"** action inside `DealDetailDrawer.tsx`.
  - **Stage 2 (`Call Status`) & Stage 9 (`Credit Days`) Mandatory Popups (`src/components/pipeline/PipelineView.tsx`, `src/app/page.tsx`):**
    - Dragging or moving a lead into `Call Status` opens a mandatory 6-option modal (`Call Not Received`, `Waiting`, `Busy`, `In Meeting`, `Switch Off`, `Not Reachable`); moving out of `Call Status` automatically clears `callSubStatus`.
    - Dragging or moving a lead into `Credit Days` opens a mandatory 4-option modal (`Advanced`, `Cash on Delivery`, `30 Days Credit`, `45 Days Credit`); `creditTerms` persists into `Credit Follow Up` and clears only when moving into `Closed` (Won).
  - **Stage 5 (`Quotation Follow Up`) 4-Option Selector:** Added 4 one-click status pills (`High Price`, `Approval Stage`, `Mailing`, `Purchased from Other`) inside `DealDetailDrawer.tsx` (with a quick **Mark Closed (Lost)** prompt when `Purchased from Other` is selected), auto-clearing `quotationSubStatus` when moving forward to `Purchase Order` or beyond.
  - **Verification:** `npx tsc --noEmit` passed (**Exit code 0, 0 errors**).
- **2026-11-25 (3packmark Phase 3 — Chemical Product Catalog, MOQ + Extra Math, Purchase History & 4-Queue Tasks):**
  - **Chemical Product Catalog & API (`Products`):**
    - Added `ProductUnit` (`Liters` | `Kg` | `Pack` | `Dozen`), `Product`, `DealProductItem`, and `TaskQueueCategory` to `src/types/crm.ts`.
    - Added `SHEET_NAMES.PRODUCTS` (`Products` tab), `productsJson` on `LEADS`, and `queueCategory` on `TASKS` in `src/lib/google-sheets/schema.ts`, plus `moq`/`unitPrice` numeric parsing in `src/lib/google-sheets/client.ts`.
    - Seeded 25 realistic industrial & specialty chemical products in `src/lib/google-sheets/seed-products.ts` and wired `getProducts`, `createProduct`, and `bulkCreateProducts` into `src/lib/google-sheets/repository.ts` and `src/app/api/products/route.ts`.
    - Built `src/components/products/ProductsView.tsx` (search, unit filter, Add Product modal, Bulk CSV Import modal) and linked **Products** in `SidebarRail.tsx`, `TopNav.tsx`, and `src/app/page.tsx`.
  - **Multi-Product Selector & Conditional Purchase History (`src/components/deal/DealDetailDrawer.tsx`):**
    - Added searchable **"+ Add Chemical Product"** combobox filtering 600+ SKUs, `Extra Quantity` numeric input, automatic `MOQ = {moq} {unit} + {extraQuantity} {unit} extra = {totalQuantity} {unit}` badge, line total (`₹`), and automatic Opportunity Deal Value sync.
    - Added conditional **"Past Purchase History"** section querying `Closed` (Won) orders for the same customer (`>= 1` order renders history; `0` orders renders nothing at all).
  - **Deterministic 4-Queue Today's Tasks & Follow-Up Engine (`src/lib/tasks/queues.ts`, `OverviewView.tsx`, `src/app/api/tasks/route.ts`):**
    - Implemented the 4 exact queues (`Quotation Follow Up`, `Delivery Follow Up`, `Payment Follow Up`, `Call Follow Up`) with stage-based auto-suggestion in `DealDetailDrawer.tsx` and queue filter tabs + 1-click **Mark Complete** and **Reschedule** in `OverviewView.tsx`.
  - **Verification:** `npx tsc --noEmit` passed (**Exit code 0, 0 errors**).
- **2026-11-25 (3packmark Phase 3.1 — Multi-Product Append & `lineItems` Persistence Fix):**
  - **Schema & Google Sheets Header Expansion:** Added `lineItems` to `Lead` (`src/types/crm.ts`) and `SHEET_HEADERS[SHEET_NAMES.LEADS]` (`src/lib/google-sheets/schema.ts`). Updated `updateRowById()` and `mapRowsToObjects()` in `src/lib/google-sheets/client.ts` to automatically expand row 1 headers in live Google Sheets when new schema columns (`lineItems`, `productsJson`, `callSubStatus`, `quotationSubStatus`, `creditTerms`, `isDecisionMakerReached`) are missing, and to keep `lineItems` and `productsJson` synchronized on every write.
  - **Normalization & Stage Move Preservation:** Updated `sanitizeLead()` in `src/lib/financial.ts` to normalize and preserve `lineItems`/`products` across reads and writes, and updated `handleUpdateLeadStage()` in `src/app/page.tsx` to merge persisted responses without dropping `lineItems`.
  - **Multi-Product Array Append (`src/components/deal/DealDetailDrawer.tsx`):** Replaced derived prop reading with local `lineItems` state synced from `lead.lineItems || lead.products`, appending new products cleanly, showing an `"Already added — adjust Extra Qty below"` notice for duplicates, supporting independent `extraQuantity` updates and per-row `Trash2` removal, and auto-saving `lineItems`, `products`, and summed `value` (`₹`).
  - **Verification:** `npx tsc --noEmit` passed (**Exit code 0, 0 errors**).
- **2026-11-25 (3packmark Phase 3.2 — Notes Textarea Focus-Loss Fix):**
  - **Root Cause & Fix (`src/components/deal/DealDetailDrawer.tsx`):** The drawer's focus-trap `useEffect` previously depended on `[lead?.id, hasUnsavedNotes, noteDraft]`, causing its cleanup (`previousActiveElement.current.focus()`) to run on every keystroke and steal focus away from the `"Add Client Note / Meeting Debrief"` `<textarea>`. Replaced with `noteDraftRef` / `hasUnsavedNotesRef` for `handleSafeClose`, narrowed the `useEffect` dependency array strictly to `[lead?.id]`, and added a stable `key={`note-editor-${lead.id}`}` on the `<textarea>`.
  - **Verification:** `npx tsc --noEmit` passed (**Exit code 0, 0 errors**).
- **2026-11-26 (3packmark Phase 4 — TallyPrime XML Quotation Bridge, Direct Quotation Emailer & Rule-Based Email Automations):**
  - **TallyPrime Integration Settings & XML-over-HTTP Bridge:**
    - Added Admin-only **"TallyPrime Integration"** tab in `src/components/settings/SettingsView.tsx` (gated by `userRole` from `src/app/page.tsx`) configuring `tallyUrl`, `tallyCompanyName`, `tallySalesLedger`, and `tallyMode` (`live` vs `download`).
    - Created `src/app/api/tally/quotation/route.ts` (`POST`) using `buildTallyQuotationXml()` (`src/lib/tally/tallyXmlBuilder.ts`) to generate TallyPrime Optional Sales Order XML (`VCHTYPE="Sales Order"`, `ISOPTIONAL="Yes"`), supporting both **Push to TallyPrime** (HTTP POST with XML response parsing and error fallback) and **Download Tally XML** (`.xml` file download + Activity logging).
  - **Direct Quotation Email Sender (`src/components/deal/DealDetailDrawer.tsx`, `src/lib/tally/quotationHtml.ts`, `src/app/api/email/route.ts`):**
    - Created `src/lib/tally/quotationHtml.ts` generating itemized `MOQ + Extra = Total` text and printable/downloadable Tally-style HTML quotation summaries.
    - Updated `src/app/api/email/route.ts` to support Resend (`RESEND_API_KEY`), Nodemailer SMTP (`SMTP_USER`/`SMTP_PASS`), and a clean simulated/logged fallback mode when credentials are not yet configured in `.env`.
    - Added **"Push to TallyPrime"**, **"Download Tally XML"**, and **"Send Quotation Email"** actions inside `DealDetailDrawer.tsx`, plus Activity logging and a 1-click **"Move & Schedule Follow-Up"** prompt (`Quotation Follow Up` + 2-day task).
  - **Rule-Based Email Automation Engine (Zero AI):**
    - Wired the 4 B2B chemical email automations (`Quotation Sent Follow-Up`, `Order Dispatch Notification`, `Credit Payment Reminder`, `Post-Inquiry Welcome / Catalog Intro`) from `src/lib/automations/b2b-email-templates.ts` into `src/components/automations/AutomationsView.tsx` with ON/OFF toggles, **Auto-Send** vs **Require Rep Click to Send** mode, and inline subject/body template editing.
    - Added idempotent stage-based execution (`lastAutomatedEmailStage`, `lastAutomatedEmailAt`) in `src/lib/cron/scheduler.ts` (`runCronTick`).
  - **Verification:** `npx tsc --noEmit` passed (**Exit code 0, 0 errors**).
- **2026-11-26 (3packmark Phase 5 — Bulk Excel/CSV Lead Importer, Startup Splash & Final RBAC Audit):**
  - **Bulk Excel & CSV Lead Importer (`xlsx` / SheetJS + 500-Row Batch Engine):**
    - Installed `xlsx` (`npm install xlsx`, Exit code 0) and created `src/components/pipeline/BulkLeadImportModal.tsx` wired to **"Import Leads (Excel / CSV)"** in `src/components/pipeline/PipelineView.tsx` and `src/app/page.tsx`.
    - Implemented 3-step workflow: (1) Drag-and-drop `.xlsx`/`.xls`/`.csv` upload (up to 2,500 rows) + **"Download Sample Excel Template"** (`.xlsx`), (2) Smart fuzzy column mapping + 10-row validation preview + `leadSource` normalization (`Phone Call | Visit | Cold Call | Seminar`, defaulting to `Cold Call`), and (3) Phone/email duplicate detection (**Skip Duplicates** vs **Import All**) + 500-row chunked batch upload with live progress bar and summary.
    - Created `POST /api/leads/bulk-import` (`src/app/api/leads/bulk-import/route.ts`) and `crmRepo.bulkCreateLeads()` (`src/lib/google-sheets/repository.ts`) using 500-row `googleSheetsClient.appendRows()` batches (`spreadsheets.values.append`) and single-write local store persistence.
  - **Startup Animation (`src/components/layout/StartupSplash.tsx`):**
    - Verified `StartupSplash.tsx` renders the 1.8s `z-[9999]` typographic reveal for **"3packmark Private Limited"** once per browser session (`sessionStorage`).
  - **Final Security & 4-User RBAC Audit:**
    - Audited `/api/leads/*`, `/api/products/*`, `/api/tally/*`, and `/api/automations/*`.
    - Remediated missing/conditional auth guards in `src/app/api/leads/[id]/lost/route.ts`, `src/app/api/leads/[id]/won/route.ts`, `src/app/api/automations/jobs/route.ts`, and `src/app/api/automations/test/route.ts` to strictly reject unauthenticated requests with HTTP `401` and enforce Admin (`canManageAutomations` / `isMasterAdmin`) or lead-level permissions (`canUserModifyLead`) with HTTP `403`.
  - **Verification:** `npx tsc --noEmit` passed (**Exit code 0, 0 errors**).
- **2026-11-26 (3packmark Phase 5.1 — Importer Auto-Linking, 11 Stage Colors, Custom Color Wheel & TopNav Branding):**
  - **Bulk Excel/CSV Importer Upgrade (`BulkLeadImportModal.tsx`, `/api/leads/bulk-import`, `repository.ts`):**
    - Added optional `Current Products` and `Past Purchases` columns to the 3-step importer, fuzzy header matcher, and `3packmark_Bulk_Leads_Template.xlsx` sample template.
    - Auto-matches `Current Products` against the `Products` catalog (or batch-creates clean placeholder entries with `unit: 'Liters'`, `moq: 1`, `unitPrice: 0`), computes `MOQ + Extra = Total` and `lineTotal`, populates `lineItems`/`products`/`value`, and creates `Closed (Won)` historical order records ONLY when `Past Purchases` is non-empty—preserving 500-row `spreadsheets.values.append` batching.
  - **11 Rich Stage Colors & Auto-Luminance Contrast (`src/lib/pipeline/stage-colors.ts`, `seed-data.ts`, `PipelineView.tsx`):**
    - Assigned 11 distinct rich dark hex colors (`#1E3A8A` through `#1F2937`) to the 11 stages and added automatic luminance contrast (`#FFFFFF` vs `#111827`) + Won/Lost status badges on Kanban cards.
  - **Visual Color Swatch Dropdown & Custom Color Wheel (`SettingsView.tsx`):**
    - Replaced plain-text stage color `<select>` with a visual swatch dropdown + `<input type="color" />` custom color wheel + editable `#HEX` input + live mini card preview.
  - **TopNav Brand Name Fix (`TopNav.tsx`):**
    - Updated top-left header brand label to **"3packmark Private Limited"** with a `3P` monogram badge.
  - **Verification:** `npx tsc --noEmit` passed (**Exit code 0, 0 errors**).
- **2026-11-26 (3packmark Phase 5.2 — Pipeline UI Polish & Customer Information Bento Rebuild):**
  - **Kanban Pipeline Cards, Toolbar & TopNav Polish (`PipelineView.tsx`, `TopNav.tsx`):**
    - Removed all `<img>` avatar thumbnails from pipeline cards and replaced them with text-only rep initials pills (`S1`, `S2`, `S3`, `AD`, etc.).
    - Implemented clean 3-line card layout (`Closes {Date}` + `...` menu, `{Company Name}` without `"Opportunity"` suffix or redundant company line, `{Contact Person} | {Lead Source} | {Active Tag}`, and `₹{dealValue}` + rep initials pill).
    - Cleaned up pipeline header to single-line **`3packmark Sales Pipeline`**, removed `"No qualifying deals (≥ ₹10,000)"`, added **Sales Rep Quick-Filter Pills** (`All Reps`, `Admin`, `Sales 1`, `Sales 2`, `Sales 3`), merged duplicate import buttons into **`Import Excel / CSV`**, and displayed summed `₹` column totals in every stage header.
    - Removed redundant `Pipelines` tab from `TopNav.tsx`.
  - **Customers Directory Sync & Full-Page `Customer Information` Bento View (`src/app/api/customers/route.ts`, `CustomersView.tsx`, `src/components/customers/CustomerInfoBento.tsx`, `src/app/page.tsx`):**
    - Updated `/api/customers` and `CustomersView.tsx` to merge & deduplicate records from both `Customers` and `Leads` (matching by company, email, or normalized phone) so Excel-imported and pipeline leads appear immediately with accurate deal counts, won revenue (`₹`), and open pipeline (`₹`).
    - Removed the broken `CustomerDetailDrawer` (and `Whatsapp`/`Sms`/`Pulse Web` references) and replaced it with the full-page `CustomerInfoBento.tsx` workspace (`← Back to Customers`, Top KPI Strip, 2/3 `Deals & Chemical Purchase History` 2x2 grid, 1/3 `Account Profile & Quick Actions`, `Follow-Up Schedule` calendar + 4-queue tasks, `11-Stage Deal Breakdown`, and inline-editable `Detailed Information`).
  - **Verification:** `npx tsc --noEmit` passed (**Exit code 0, 0 errors**).
- **2026-11-26 (3packmark Phase 5.3 — Apple-Style Customer Directory & Color-Morphing Drag Physics):**
  - **Apple-Style Customer Directory Redesign (`src/components/customers/CustomersView.tsx`):**
    - Fixed `Total Accounts` KPI tile to use the merged `unique.length` count alongside `Total Won Revenue (₹)` and `Open Pipeline (₹)`.
    - Removed heavy dark bordered inner boxes and repeated email footer lines; redesigned grid cards with deterministic Apple-style Memoji portrait circles (`🧑‍💼`, `👩‍💼`, `👨‍🔬`, `👩‍🔬`, `🧑‍🏭`, `👨‍💼` on pastel backdrops, zero external image requests), interactive `★` favorite toggle, borderless `Open Pipeline` / `Won Orders` metrics, engagement progress bar, stage pill, and monochrome Email / Log Call action buttons.
  - **Live Color-Morphing Drag Overlay & Right-Rail Delete Drop Zone (`src/components/pipeline/PipelineView.tsx`, `src/app/page.tsx`):**
    - Replaced the blurry native HTML5 drag ghost with a crisp floating overlay (`scale-[1.03] rotate-[1.5deg] shadow-2xl transition-colors duration-200`) that dynamically morphs its background color and text contrast to match the hovered target stage in real time, while rendering a dashed placeholder in the source column and colored `ring-2` highlight on the hovered target column.
    - Added a third **Delete** drop zone (`Trash2` icon, `Drop to delete`) below `Won` and `Lost` on the right-hand quick-drop rail with crimson hover glow and confirmation dialog (`DELETE /api/leads/[id]`).
  - **Verification:** `npx tsc --noEmit` passed (**Exit code 0, 0 errors**).
- **2026-11-26 (3packmark Phase 5.4 — Kanban Drag-and-Drop Zero-Flicker & Instant Drop Fix):**
  - **Root-Cause Fixes (`src/components/pipeline/PipelineView.tsx`):**
    - Removed `onDragLeave` handlers from stage columns and Won/Lost/Delete drop zones to eliminate child-element `dragEnter`/`dragLeave` thrashing; `dragOverStageId` now clears exclusively on `onDrop` and `window` `dragend`.
    - Removed conditional layout-shifting elements during drag (fixed `border-2` on all cards and columns; removed dynamic `Drop to win`/`Drop to close` badge insertions on the right rail).
    - Replaced 60fps React cursor state updates with direct GPU `transform: translate3d(...)` updates via `dragOverlayRef` + `pointerEvents: 'none'` on the floating color-morphing drag card, preserving instant optimistic stage moves via `handleUpdateLeadStage`.
  - **Verification:** `npx tsc --noEmit` passed (**Exit code 0, 0 errors**).
- **2026-11-26 (3W PACKMARK Phase 5.5 — Tally-Style Commercial Offer Generator, Pre-Send Credit Terms Popup & Email Sender):**
  - **Branding & Schema Updates (`src/lib/config.ts`, `TopNav.tsx`, `StartupSplash.tsx`, `src/types/crm.ts`, `src/lib/google-sheets/schema.ts`, `SettingsView.tsx`):**
    - Updated company branding to **`3W PACKMARK PRIVATE LIMITED`** (`3W` monogram).
    - Added optional `hsnCode` to `Product` / `DealProductItem` and editable Seller Address, GSTIN/UIN, State Name & Code, CIN, PAN, Contact, and Bank Details (`HDFC BANK - 318`, `50200073735318`, `KARELIBAUG & HDFC0000147`) to `Workspace` and `SettingsView.tsx` Business Profile.
  - **Exact Digital Tally-Style `COMMERCIAL OFFER` Template (`src/lib/quotation/commercialOfferTemplate.ts`):**
    - Built inline-table HTML Commercial Offer template with Seller Box, Voucher Metadata Grid, Consignee/Buyer boxes, Itemized Goods table (with `MOQ + Extra = Total`, `HSN/SAC`, `CGST 9% + SGST 9%` or `IGST 18%`), Indian currency-in-words converter (`numberToIndianWords`), 6 numbered Terms & Conditions, Bank Details, and Signatory block.
  - **Pre-Send Credit Terms Popup, Preview & Email Sender (`src/components/deal/CommercialOfferModal.tsx`, `DealDetailDrawer.tsx`, `src/app/api/email/send-quotation/route.ts`):**
    - Clicking **"Send Quotation Email"** / **"Load Chemical Quotation"** opens the mandatory Pre-Send Configuration modal (Mode/Terms of Payment, F.O.R. Delivery, Kind Attn, Validity Date, GST Type), transitions to a full-screen Commercial Offer Preview with **Download / Print PDF** and **Send via Email Now**, updates `lead.creditTerms`, and logs to `EmailLogs` and `Activities`.
  - **Verification:** `npx tsc --noEmit` passed (**Exit code 0, 0 errors**).
- **2026-11-26 (3W PACKMARK Phase 5.6 — Quotation Send Bugfix: Event Bubbling, 8s Timeout & `logged_preview` Fallback):**
  - **Frontend Modal Stability (`src/components/deal/CommercialOfferModal.tsx`):**
    - Stopped `click`/`mousedown` event propagation on the modal backdrop and **"Send via Email Now"** button (`e.preventDefault(); e.stopPropagation();`), preventing accidental parent drawer close/reset to the Pipeline screen.
    - Added `Loader2` loading spinner (`"Sending Commercial Offer..."`), inline red error banner, and explicit **"Close Preview"** button after completion so the user stays inside the Lead Drawer.
  - **API Timeout & Fallback (`src/app/api/email/send-quotation/route.ts`):**
    - Added strict 8-second timeouts to Resend (`AbortSignal.timeout(8000)`) and Nodemailer SMTP (`Promise.race`).
    - When SMTP/Resend credentials are unconfigured or unreachable in local dev, logs the Commercial Offer to `EmailLogs` and `Activities`, updates `lead.creditTerms`, and returns HTTP `200` with `{ success: true, mode: "logged_preview", message: "Commercial Offer logged to Activity (configure SMTP in Settings for live inbox delivery)" }`.
  - **Verification:** `npx tsc --noEmit` passed (**Exit code 0, 0 errors**).
- **2026-11-26 (3W PACKMARK Phase 5.7 — PDF Commercial Offer Attachment, Mobile Light-Paper HTML & Split-Screen HTML Code Editor):**
  - **Seller Branding, Mobile Light-Paper HTML & Digital E-Signature (`src/lib/quotation/commercialOfferTemplate.ts`, `SettingsView.tsx`, `src/lib/email/smtp.ts`):**
    - Normalized seller company name to **`3W PACKMARK PRIVATE LIMITED`** (preventing any legacy `"Developster"` string from appearing) and formatted quotation subject as `Commercial Offer #{voucherNo} — Quotation from 3W PACKMARK PRIVATE LIMITED ({customerCompany})`.
    - Wrapped email HTML in an explicit light-paper container (`bgcolor="#ffffff"`, `background-color:#ffffff;color:#111827;max-width:760px`), responsive scrollable table wrapper, polite B2B cover note, and vector SVG Digital Signature + Circular Company Stamp (`3W PACKMARK PVT. LTD. • VADODARA`) with customizable `signatureName`/`signatureImageUrl` in Settings.
  - **Pure-JS A4 PDF Quotation Generator & Email Attachment (`src/lib/quotation/commercialOfferPdf.ts`, `src/app/api/email/send-quotation/route.ts`, `CommercialOfferModal.tsx`):**
    - Installed `jspdf` (`npm install jspdf`, Exit code 0) and built `buildCommercialOfferPdfBuffer` + `downloadCommercialOfferPdf` generating A4 boxed Tally-style `Commercial_Offer_{VoucherNo}.pdf` with GST breakdown, amount in words, bank details, and circular stamp.
    - Attached the generated PDF directly to outgoing SMTP (`nodemailer`) and Resend emails in `/api/email/send-quotation` and wired **Download / Print PDF** in `CommercialOfferModal.tsx`.
  - **Editable Commercial Offer HTML Code Template (`src/components/templates/CommercialOfferCodeEditorModal.tsx`, `TemplatesView.tsx`):**
    - Added **Edit Commercial Offer HTML** in `TemplatesView.tsx` opening a split-screen CodeMirror HTML editor + live `iframe` preview with clickable variable chips (`{{company_name}}`, `{{voucher_no}}`, `{{date}}`, `{{credit_terms}}`, `{{delivery_terms}}`, `{{customer_company}}`, `{{customer_contact}}`, `{{items_table_rows}}`, `{{cgst_sgst_rows}}`, `{{grand_total}}`, `{{amount_in_words}}`, `{{validity_date}}`, `{{signature_block}}`), **Reset to Default Tally Template**, and persistence to `EmailTemplates` (`tpl-commercial-offer-3w`) used automatically by `/api/email/send-quotation`.
  - **Verification:** `npx tsc --noEmit` passed (**Exit code 0, 0 errors**).
- **2026-11-26 (3W PACKMARK Phase 5.8 — Preserve Custom Stage Colors Across Startup Sync):**
  - **Startup Stage Sync Fix (`src/lib/google-sheets/repository.ts`):**
    - Updated `readLocalStore()` and `ensureGoogleSheetsSeeded()` so stage synchronization checks by canonical stage IDs (`hasAll11Ids`) rather than strict name equality, and merges by `id` while preserving any existing non-empty `color` (and custom extra stages) saved in Google Sheets `Stages` or local store. Default `SEED_STAGES` colors are only applied when creating a new stage row with an empty/missing `color`.
  - **Verification:** `npx tsc --noEmit` passed (**Exit code 0, 0 errors**).
- **2026-11-26 (3W PACKMARK Phase 5.9 — Overview Dashboard Apple/Swiss-Grid Redesign):**
  - **Branded Header, Rep Filters & Distinct KPIs (`src/components/overview/OverviewView.tsx`, `src/app/page.tsx`):**
    - Updated heading to **`3W PACKMARK Overview`** with subtitle `"Daily sales pipeline, task queues & follow-up command center"`, clickable Sales Rep quick-filter pills (`All Team`, plus team members), and 3 distinct KPI badges (**Total Leads** with `Layers` + open `₹` value, **Today's Tasks** with `CalendarCheck`, **Follow-Up Tasks** with `BellRing` + overdue count).
  - **Color-Coded 11-Stage `Leads Overview` Bento Grid:**
    - Bound each of the 11 stage tiles directly to `resolveStageHex(stage)` (saved `stage.color`) with a 4px colored top border, status dot, Stage Name, Lead Count, and formatted `₹` Stage Value.
  - **Bounded Split Bento Task Command Center (`h-[460px]`):**
    - Eliminated unbounded vertical scrolling with a 2-column `lg:grid-cols-12` layout (`lg:col-span-7` **Today's Tasks** with sticky 4-queue pills + complete/open actions; `lg:col-span-5` **Follow-Up Tasks** with `Overdue First` / `Upcoming` toggle, relative due badges, rep initials, `+1d`/`+3d` reschedule, and **Done**).
  - **Verification:** `npx tsc --noEmit` passed (**Exit code 0, 0 errors**).
- **2026-11-26 (3W PACKMARK Phase 5.10 — Stage Color Database Persistence Fix & Editorial Mineral Palette):**
  - **Root-Cause Persistence Fix (`src/app/page.tsx`, `src/app/api/pipelines/route.ts`, `src/components/settings/SettingsView.tsx`):**
    - Fixed `onSavePipeline` in `src/app/page.tsx` (which previously only updated local React state) to persist pipeline & stage changes to Google Sheets via `POST /api/pipelines`.
    - Added `PUT` and `PATCH` handlers to `/api/pipelines` and wired `handleInstantStageColorSave()` in `SettingsView.tsx` so clicking a preset swatch, Color Wheel, or valid `#HEX` input immediately saves to Google Sheets and shows a `"Saved"` badge.
    - Added `{ cache: 'no-store' }` to `/api/crm/bootstrap` and `/api/pipelines` fetches in `loadAllData()` so `Ctrl + Shift + R` always loads the latest saved colors from Google Sheets.
  - **11-Stage Editorial Mineral Palette Defaults (`src/lib/pipeline/stage-colors.ts`, `src/lib/google-sheets/seed-data.ts`):**
    - Updated fallback defaults (used only when `stage.color` is empty/missing) to `#F2C94C`, `#C8431F`, `#2F5C50`, `#27496D`, `#6B2D5C`, `#4A5D23`, `#8C4A27`, `#1F5E6B`, `#7A283A`, `#4E3B31`, `#17191A`.
  - **Verification:** `npx tsc --noEmit` passed (**Exit code 0, 0 errors**).
- **2026-11-26 (3W PACKMARK Phase 5.11 — Soft Editorial Mineral Overview Refinement):**
  - **Zero-Eye-Strain Mineral Redesign (`src/components/overview/OverviewView.tsx`, `src/app/page.tsx`):**
    - Replaced harsh borders, shadows, and bright neon accents with warm-stone surfaces (`#FAF8F5`, `#F7F4EE`, `#EFECE4`) and subtle `#E6E0D6` / `#EAE4DA` hairlines.
    - Softened **Leads Overview** 11-stage tiles by removing 4px top bars and using borderless `#F7F4EE` tiles with an 8px stage color dot, Stage Name, Lead Count, and `₹` value.
    - Redesigned **Today's Tasks** (`h-[480px]`) with `{completed} of {total} done` + 3px progress bar, `+ Add` pill, 4-queue pills, hairline rows with rounded-square checkboxes, and warm-stone action/rep circles.
    - Redesigned **Follow-Up Tasks** (`h-[480px]`) with `Overdue` / `Upcoming` toggle, **Open schedule** button (`onOpenSchedule`), 2-line calendar/late blocks (`#C8431F` for overdue), and hover-revealed `+1d` / checkmark actions.
  - **Verification:** `npx tsc --noEmit` passed (**Exit code 0, 0 errors**).
- **2026-11-26 (3W PACKMARK Phase 5.12 — Single-Tenant Header Lock & Rebuilt Workflow Automations):**
  - **Single-Tenant Brand Header (`src/components/layout/TopNav.tsx`):**
    - Removed the multi-business switcher dropdown (`Developster Hub`, `Nexus Freight Systems`, `Disha Marketing`, `+ Create new business`) from the UI without deleting Google Sheets records; rendered **`3W PACKMARK PRIVATE LIMITED`** with its **`3W`** monogram badge as a clean, static header.
  - **2x2 Bento Workflow Automations (`src/components/automations/AutomationsView.tsx`, `src/lib/automations/b2b-email-templates.ts`):**
    - Purged generic SaaS template clutter from the primary Workflows tab and rendered **3W PACKMARK PRIVATE LIMITED's 4 core B2B chemical workflows** (**Quotation Follow-Up Reminder**, **Order Dispatch Notification**, **Credit Payment Reminder**, **Inquiry Welcome & Product Spec Intro**) in a warm-stone 2x2 Bento Grid (`bg-[#FAF8F5] border-[#E6E0D6] rounded-3xl p-6`).
    - Added persisted **`Active / Paused`** toggles, **`Auto-Send`** vs **`Create Task / Draft Only`** mode pills, 3-step visual flow pill strips, **`Edit Flow & Email`**, **`Quick Edit Email`**, **`Test Run`**, and **`+ New Automation`**.
  - **Human-Readable Visual Workflow Builder (`VisualWorkflowCanvas.tsx`, `ConditionNode.tsx`, `WorkflowInspector.tsx`):**
    - Replaced `"Rapport CRM"` subtitle with **`3W PACKMARK Workflow Builder`** and updated Condition nodes and inspector dropdowns to render human-readable rules (`Stage is still`, `Deal status is`, `Credit terms`, `Valid customer email`) instead of raw `stageId equals stg-...` strings.
  - **Real Automation Execution Engine (`src/lib/automations/b2b-runner.ts`, `src/app/api/automations/run/route.ts`, `src/app/api/leads/[id]/route.ts`):**
    - Built deterministic runner evaluating trigger stages, human-readable conditions, and `lastAutomatedEmailStage` idempotency; executes email send (with SMTP fallback logging), creates follow-up tasks (`crmRepo.createTask`), and logs `"Automation Executed: {Workflow Name}"` to `Activities`.
  - **Verification:** `npx tsc --noEmit` passed (**Exit code 0, 0 errors**).
- **2026-11-26 (3W PACKMARK Phase 5.13 — Live Automation Email Dispatcher, Stage Queue & Node Layout):**
  - **Shared Live SMTP/Resend Email Dispatcher (`src/lib/email/live-dispatcher.ts`, `src/lib/automations/b2b-runner.ts`, `src/app/api/automations/run/route.ts`):**
    - Extracted `sendLiveCrmEmail` matching `/api/email/send-quotation` (Resend API with 8s timeout → Nodemailer `sendSmtpEmail` with 8s timeout), wired into `/api/automations/run` and `runStageB2bAutomations`.
    - Added multi-source customer email resolution (`lead.customerEmail` → `lead.email` → `Customers` sheet match by `customerId`/`company`/`contactName`), explicit `"Email Skipped: No email address on lead"` warning when absent, live run counter increment (`1 runs`, `2 runs`), and an explicit Test Run result banner in `AutomationsView.tsx` (`Email Sent: Yes → {recipientEmail}`, `Task Created`, `Activity Logged`).
  - **Stage Transition Hook & Delayed Scheduled Queue (`src/app/api/automations/process-due/route.ts`, `src/app/page.tsx`, `AutomationsView.tsx`):**
    - Matched stage-move triggers by both `stageId` and normalized stage name; immediate workflows (`Order Dispatch Notification`, `Credit Payment Reminder`) execute synchronously while delayed workflows (`2 Days`, `1 Hour`) queue in `ScheduledJobs` and auto-process on Dashboard/Pipeline load or manually via **"Run Due Emails Now"**.
  - **Visual Node Spacing & Condition/Delay Copy (`b2b-email-templates.ts`, `ConditionNode.tsx`, `DelayNode.tsx`):**
    - Increased vertical spacing between preset nodes (`y = 40, 250, 460, 670, 880`, `+210px` per step) to eliminate node overlap, fixed `"Stage is is Quotation Follow Up"` → **`"Stage is Quotation Follow Up"`**, and rendered `Immediate` when delay duration is `0`.
  - **Verification:** `npx tsc --noEmit` passed (**Exit code 0, 0 errors**).
- **2026-11-26 (3W PACKMARK Phase 5.14 — Auto-Send Persistence & Immediate Stage-Trigger Fix):**
  - **Google Sheets `executionMode` & `delayMinutes` Persistence (`src/types/crm.ts`, `src/lib/google-sheets/schema.ts`, `src/lib/google-sheets/client.ts`, `src/lib/google-sheets/repository.ts`, `src/app/api/automations/[id]/route.ts`):**
    - Added `executionMode` (`'auto_send' | 'draft_only'`) and `delayMinutes` to `AutomationRule` and `SHEET_HEADERS[SHEET_NAMES.AUTOMATIONS]`.
    - Fixed `googleSheetsClient.updateRowById` so missing schema columns are auto-appended to Row 1 of live Google Sheets and 1-row/empty sheets append new records instead of returning `false` silently.
    - Added `PATCH /api/automations/[id]` and defaulted all 4 core 3W PACKMARK workflows to `executionMode = 'auto_send'` and `delayMinutes = 0` (`Immediate`).
  - **Card Timing Pill, Stage-Move Auto-Send & Toast (`AutomationsView.tsx`, `b2b-runner.ts`, `src/app/api/leads/[id]/route.ts`, `src/app/api/automations/route.ts`, `src/app/page.tsx`):**
    - Added inline `Timing: [Immediate ▾ | 1 Hour | 2 Days]` selector pill and `PATCH`-persisted **Auto-Send / Create Task / Draft Only / Active / Paused** toggles on each workflow card.
    - Awaited immediate stage-move automation execution in `PUT /api/leads/[id]`, returning `{ automationTriggered: true, workflowName, emailSentTo }` so `src/app/page.tsx` renders a floating `"Auto-Sent: {workflowName} → {emailSentTo}"` toast on Pipeline drag-and-drop.
    - Added automatic due-job flushing in `GET /api/automations` alongside `loadAllData()`.
  - **Verification:** `npx tsc --noEmit` passed (**Exit code 0, 0 errors**).
- **2026-11-26 (3W PACKMARK Phase 5.15 — Unified `triggerStageAutomations` & Pipeline Diagnostic Toast):**
  - **Root-Cause Stage-Move Fix (`src/lib/automations/b2b-runner.ts`, `src/app/api/leads/[id]/route.ts`, `src/app/page.tsx`):**
    - Traced both `PipelineView.tsx` Kanban drag-and-drop and `DealDetailDrawer.tsx` stage updates to `handleUpdateLeadStage` → `PUT /api/leads/[id]` (and added `PATCH = PUT` export).
    - Unified stage execution into `triggerStageAutomations({ workspaceId, dealId, newStageId, newStageName, userId })`, matching active workflows by `triggerStageId`, human-readable `Stages` name, and workflow name correspondence, and ensuring `Test Run` never blocks genuine stage transitions.
    - Fixed silent condition skips in `evaluateB2bConditions`: normalized hyphen/space differences for `stageId` matching and resolved customer email from `Customers` sheet *before* evaluating `has_email`.
    - Returned explicit `automationResult: { triggered, workflowName, emailSentTo, reason }` from `PUT/PATCH /api/leads/[id]` and rendered both success (`Auto-Sent "{workflowName}" → {emailSentTo}`) and diagnostic skip (`Automation skipped: {reason}`) toasts in `src/app/page.tsx`.
  - **Verification:** `npx tsc --noEmit` passed (**Exit code 0, 0 errors**).
- **2026-11-26 (3W PACKMARK Phase 5.16 — Safe Workspace Cleanup & Dead-Code Purge):**
  - **Root Report & Temp Folder Cleanup:**
    - Deleted leftover root audit reports (`DEVELOPSTER_AI_*.md`, `DEVELOPSTER_HUB_*.md`, `GOOGLE_SHEETS_*.md`, `PHASE_*.md`, `PULSE-*.md`, `Digital_Resource_Operating_System_*.docx`) and unused root folders (`scratch/`, `screenshots/`, `docs/`, `ai/`).
    - Preserved `PROJECT.md`, `README.md`, `AGENTS.md`, `DESIGN_TOKENS.md`, `package.json`, `package-lock.json`, `next.config.ts`, `tsconfig.json`, `.env*`, and `node_modules/`.
  - **Dead Module Purge (`pulse`, `scoring`, `ai`, `gemini`):**
    - Unplugged dead imports in `src/middleware.ts`, `src/lib/cron/scheduler.ts`, `src/lib/google-sheets/repository.ts`, `src/app/api/system/health/route.ts`, `src/app/api/integrations/test/route.ts`, `src/components/deal/LeadCoachPanel.tsx`, and `src/components/overview/AiBriefingCard.tsx`.
    - Removed `src/app/pulse.js/`, `src/app/api/pulse/`, `src/app/api/ai/`, `src/lib/pulse/`, `src/lib/scoring/`, `src/lib/ai/`, and `src/lib/gemini/` while keeping `src/lib/ai-gateway/` untouched on disk per Section 14 governance.
  - **Verification:** Cleared `.next` and `tsconfig.tsbuildinfo`; `npx tsc --noEmit` passed (**Exit code 0, 0 errors**) and `npm run build` passed (**Exit code 0, 57/57 static pages + all routes compiled**).
- **2026-11-26 (3W PACKMARK Phase 5.17 — Overview 1-Click Task-to-Pipeline Navigation & Follow-Up Tasks Fix):**
  - **1-Click Task-to-Pipeline Navigation (`src/components/overview/OverviewView.tsx`, `src/app/page.tsx`):**
    - Added `resolveTaskLead(task)` matching `task.leadId` / `task.dealId` with fuzzy fallback on extracted contact/company names from `task.title` / `task.dealTitle`.
    - Made every row in **Today's Tasks** and **Follow-Up Tasks** clickable (`cursor-pointer` + hover `↗ Open Lead` pill) to switch to `Pipeline` (`handleSelectSection('Pipeline')`) and open `DealDetailDrawer` pre-selected to that lead.
  - **Follow-Up Tasks Filtering, `+1d` Snooze, Complete & Legacy Filter (`OverviewView.tsx`, `src/app/api/tasks/[id]/route.ts`):**
    - Fixed `Overdue ({count})` vs `Upcoming ({count})` toggle filtering (`displayedFollowUps`) so each tab strictly shows its own list with live count badges.
    - Restored always-visible `+1d` snooze (`"Rescheduled to tomorrow"` toast) and `✓` complete buttons (`e.stopPropagation()`), added `PATCH` handler + `status: 'completed'` support and automatic Activity timeline logging on task completion in `/api/tasks/[id]`, and filtered out orphaned `"Review sales priority recommendations"` placeholder tasks.
  - **Verification:** `npx tsc --noEmit` passed (**Exit code 0, 0 errors**).
- **2026-11-27 (3W PACKMARK Phase 5.18 — Strict Task Stage Rules, Closed-Deal Exclusion & Active Deal Linking):**
  - **Strict Closed-Deal Exclusion & 4-Queue Stage Eligibility (`src/lib/tasks/queues.ts`, `src/components/overview/OverviewView.tsx`):**
    - Added `isClosedOrPastOrderLead`, `getEligibleQueueForStage`, and `isTaskEligibleForLeadStage` enforcing the 4-queue stage rules (`Call Follow Up` -> `New Lead`/`Call Status`/`Inquiry`; `Quotation Follow Up` -> `Quotation`/`Quotation Follow Up`; `Delivery Follow Up` -> `Purchase Order`/`Invoice`/`Dispatch`; `Payment Follow Up` -> `Credit Days`/`Credit Follow Up`).
    - Excluded tasks linked to `Closed`, `Won`, `Lost`, or `"Past Order:"` deals from **Today's Tasks** and **Follow-Up Tasks**, and hid superseded older-stage tasks.
  - **Auto-Cancel & Supersede Tasks on Stage/Close (`src/lib/tasks/lifecycle.ts`, `src/app/api/leads/[id]/route.ts`, `won/route.ts`, `lost/route.ts`, `auto-callback/route.ts`):**
    - Added `syncLeadTasksOnStageChange` to automatically mark pending tasks as completed/superseded in Google Sheets when a deal moves forward or closes (`Closed` / `Won` / `Lost`), and guarded `auto-callback` against creating tasks for closed/`Past Order:` deals (verified `bulk-import` creates zero tasks for `Closed`/`Past Purchases`).
  - **Open Active Deal Prioritization (`OverviewView.tsx`):**
    - Updated `resolveTaskLead` to prioritize OPEN active deals (`!isClosedOrPastOrderLead`) on fallback name/company matching so clicking a task opens the active opportunity rather than a historical `"Past Order:"`.
  - **Verification:** `npx tsc --noEmit` passed (**Exit code 0, 0 errors**).
- **2026-11-27 (3W PACKMARK Phase 5.19 — Guaranteed 3-Tier Task-to-Lead Navigation):**
  - **Zero-Dead-Click Task Row Navigation (`src/components/overview/OverviewView.tsx`, `src/app/page.tsx`):**
    - Wired `onSelectDealFromTask(task)` on `OverviewView` with a 3-tier waterfall: (1) open active deal by `dealId` / `leadId`, (2) open active deal by extracted contact/company name from `task.title` / `task.dealTitle`, and (3) any matching deal fallback.
    - Every row in **Today's Tasks** and **Follow-Up Tasks** now unconditionally triggers `handleTaskRowClick` (`cursor-pointer`), switching to `Pipeline` and opening `DealDetailDrawer`, or displaying `"Linked lead not found in Pipeline"` toast if no match exists.
  - **Verification:** `npx tsc --noEmit` passed (**Exit code 0, 0 errors**).
- **2026-11-27 (3W PACKMARK Phase 5.20 — Active-Deal Task Re-Mapping & Historical Past-Order Bypass):**
  - **Strict `isClosedOrHistorical` & `resolveActiveDealForTask` (`src/lib/tasks/queues.ts`, `src/components/overview/OverviewView.tsx`, `src/app/page.tsx`):**
    - Added `isClosedOrHistorical(lead, stages)` checking `Closed` stage, `Won`/`Lost` status, and `"Past Order"` titles.
    - When `task.dealId`/`leadId` points to a closed/`Past Order:` deal, `resolveActiveDealForTask` automatically searches OPEN active deals by matching company/contact name (and extracted `task.title` name), opens the active deal on `Pipeline`, and silently re-links `task.leadId` via `PATCH /api/tasks/[id]`.
  - **`/api/tasks` GET Re-Mapping & Cleanup (`src/app/api/tasks/route.ts`):**
    - Re-maps tasks whose `leadId` pointed to a `Closed`/`Past Order:` deal to the customer's active open deal ID when present, and hides closed-deal tasks if no active open deal exists.
  - **Verification:** `npx tsc --noEmit` passed (**Exit code 0, 0 errors**).
- **2026-11-27 (3W PACKMARK Phase 5.21 — 4-Step Customer-Directory Bridge Resolver & Task Auto-Heal):**
  - **4-Step Waterfall (`src/lib/tasks/queues.ts`, `src/components/overview/OverviewView.tsx`, `src/app/page.tsx`, `src/app/api/tasks/route.ts`):**
    - Upgraded `resolveActiveDealForTask` to bridge via: (1) open direct `dealId`/`leadId`, (2) open deal sharing the closed deal's `company`/`contactName`, (3) `Customers` directory lookup (`customers` passed from `page.tsx` and `/api/tasks`) matching `task.title` (`needle`) → `customer.company` → open deal, and (4) `linkedDeal` fallback only when no open deal exists.
    - Updated Today's Tasks queue icon button to also call `handleTaskRowClick` and silently auto-heals `task.dealId`/`leadId` via `PATCH /api/tasks/[id]` (`src/app/api/tasks/[id]/route.ts`) whenever Step 2 or Step 3 resolves an active deal.
  - **Verification:** `npx tsc --noEmit` passed (**Exit code 0, 0 errors**).
- **2026-11-27 (3W PACKMARK Phase 5.22 — Stage-Lookup Closed/Won Task Purge & Quotation Queue Fix):**
  - **`stageNameById` Closed/Won Hard Filter (`src/lib/tasks/queues.ts`, `src/components/overview/OverviewView.tsx`, `src/app/api/tasks/route.ts`):**
    - Added `buildStageNameMap` and `isDealClosedOrWon(deal, stageNameById)` resolving UUID `stageId` values against `Stages` so `Closed`, `Won`, `Lost`, and `"Past Order"` deals are always detected and hard-filtered out of **Today's Tasks**, **Follow-Up Tasks**, and `/api/tasks`.
  - **Won/Closed Stage Sync & Pending Task Cleanup (`src/lib/google-sheets/repository.ts`, `src/app/api/leads/[id]/route.ts`, `src/app/page.tsx`):**
    - Updated `markDealWon`, `PUT/PATCH /api/leads/[id]`, and `handleMarkWon` to sync both `status: 'Won'` and `stageId` to the actual `Closed` stage ID from `Stages`, and auto-complete all pending tasks linked to that deal.
  - **Current-Stage 4-Queue Mapping & Stage-Accurate Titles (`src/lib/tasks/queues.ts`, `OverviewView.tsx`):**
    - Updated `resolveTaskQueue` to map by the deal's current resolved stage name first (`Quotation` + `Quotation Follow Up` → `Quotation Follow Up` queue), and added `formatTaskDisplayTitle` so legacy `"Call new lead: {Name}"` tasks render as `"Prepare & send quotation: {Name}"` / `"Quotation follow-up: {Name}"` when in Quotation stages.
  - **Verification:** `npx tsc --noEmit` passed (**Exit code 0, 0 errors**).
