import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { googleSheetsClient } from './client';
import { isGoogleSheetsConfigured } from './config';
import { SHEET_NAMES } from './schema';
import {
  Workspace,
  TeamMember,
  Pipeline,
  PipelineStage,
  Lead,
  Customer,
  Task,
  Activity,
  AutomationRule,
  AutomationRun,
  EmailTemplate,
  EmailLog,
  CalendarEvent,
  CustomField,
  ImportJob,
  OAuthTokenRecord,
  AppNotification,
  ScheduledJob,
  CommunicationConversation,
  CommunicationMessage,
  CommunicationTemplate,
  CommunicationSettings,
  CustomerTimelineItem,
  AuditLogEntry,
  Product,
} from '@/types/crm';
import {
  SEED_WORKSPACE,
  SEED_MEMBERS,
  SEED_PIPELINES,
  SEED_STAGES,
  SEED_LEADS,
  SEED_CUSTOMERS,
  SEED_TASKS,
  SEED_ACTIVITIES,
  SEED_AUTOMATIONS,
  SEED_EMAIL_TEMPLATES,
} from './seed-data';
import { SEED_PRODUCTS } from './seed-products';
import {
  parseFinancialNumber,
  deduplicateLeads,
  sanitizeLead,
  reconcileLeads,
} from '../financial';
import { encryptSecret, decryptSecret } from '../config/credentials';

export const LEGACY_STAGE_MAP: Record<string, string> = {
  'stage-qual': 'stg-qualified',
  'stage-qualification': 'stg-qualified',
  'stg-qual': 'stg-qualified',
  'stage-prop': 'stg-proposal',
  'stage-proposal': 'stg-proposal',
  'stg-prop': 'stg-proposal',
  'stage-neg': 'stg-agreement',
  'stage-negotiation': 'stg-agreement',
  'stg-neg': 'stg-agreement',
  'stage-won': 'stg-won',
  'stage-lost': 'stg-loss',
  'stage-loss': 'stg-loss',
  'stg-1793003368072-1': 'stg-qualified',
  'stg-1793003368078-2': 'stg-proposal',
  'stg-1793003368079-3': 'stg-agreement',
  'stg-1793003368079-4': 'stg-won',
  'stg-1793003368079-5': 'stg-loss',
  'stg-1793018874818-1': 'stg-qualified',
  'stg-1793018874818-2': 'stg-proposal',
  'stg-1793018874818-3': 'stg-agreement',
  'stg-1793018874818-4': 'stg-won',
  'stg-1793018874818-5': 'stg-loss',
};

export function normalizeStageId(stageId?: string): string {
  if (!stageId) return 'stg-new-lead';
  return LEGACY_STAGE_MAP[stageId] || stageId;
}

interface LocalStoreData {
  workspaces: Workspace[];
  members: TeamMember[];
  pipelines: Pipeline[];
  stages: PipelineStage[];
  leads: Lead[];
  customers: Customer[];
  tasks: Task[];
  activities: Activity[];
  automations: AutomationRule[];
  automationRuns: AutomationRun[];
  emailTemplates: EmailTemplate[];
  emailLogs: EmailLog[];
  calendarEvents: CalendarEvent[];
  customFields: CustomField[];
  importJobs: ImportJob[];
  oauthTokens: OAuthTokenRecord[];
  notifications?: AppNotification[];
  scheduledJobs?: ScheduledJob[];
  workspaceCredentials?: Record<string, any>;
  conversations?: CommunicationConversation[];
  communicationMessages?: CommunicationMessage[];
  communicationTemplates?: CommunicationTemplate[];
  communicationSettings?: Record<string, CommunicationSettings>;
  auditLogs?: AuditLogEntry[];
  products?: Product[];
  lastUpdated: string;
}

export const SEED_COMMUNICATION_TEMPLATES: CommunicationTemplate[] = [
  {
    id: 'tmpl-comm-1',
    workspaceId: 'ws-default',
    name: 'Customer Welcome (WhatsApp)',
    channel: 'whatsapp',
    category: 'Welcome',
    content: 'Hello {{customer_name}}, thank you for connecting with {{business_name}}! We are delighted to partner with you. How can our team assist you today?',
    variables: ['customer_name', 'business_name'],
    isExternalApproved: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tmpl-comm-2',
    workspaceId: 'ws-default',
    name: 'Quick Follow-Up (SMS)',
    channel: 'sms',
    category: 'Follow Up',
    content: 'Hi {{customer_name}}, following up on our recent conversation from {{business_name}}. Please let us know if you need any further information.',
    variables: ['customer_name', 'business_name'],
    isExternalApproved: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tmpl-comm-3',
    workspaceId: 'ws-default',
    name: 'Meeting Reminder (WhatsApp)',
    channel: 'whatsapp',
    category: 'Meeting',
    content: 'Hi {{customer_name}}, this is a reminder for your upcoming discussion with {{employee_name}} from {{business_name}}. Looking forward to speaking with you!',
    variables: ['customer_name', 'employee_name', 'business_name'],
    isExternalApproved: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tmpl-comm-4',
    workspaceId: 'ws-default',
    name: 'Order Confirmation (SMS)',
    channel: 'sms',
    category: 'Billing',
    content: 'Dear {{customer_name}}, order {{order_id}} has been confirmed by {{business_name}}. Thank you for your business.',
    variables: ['customer_name', 'order_id', 'business_name'],
    isExternalApproved: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'tmpl-comm-5',
    workspaceId: 'ws-default',
    name: 'Proposal Introduction (Email)',
    channel: 'email',
    category: 'Follow Up',
    subject: 'Proposal & Scope from {{business_name}}',
    content: 'Dear {{customer_name}},\n\nIt was a pleasure speaking with you regarding your business goals. Attached is our scope proposal tailored for your team.\n\nWarm regards,\n{{employee_name}}\n{{business_name}}',
    variables: ['customer_name', 'business_name', 'employee_name'],
    isExternalApproved: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const STORE_PATH = path.join(process.cwd(), 'data', 'crm-storage.json');
const TMP_STORE_PATH = path.join('/tmp', 'crm-storage.json');

function getInitialStore(): LocalStoreData {
  return {
    workspaces: [SEED_WORKSPACE],
    members: SEED_MEMBERS,
    pipelines: SEED_PIPELINES,
    stages: SEED_STAGES,
    leads: SEED_LEADS,
    customers: SEED_CUSTOMERS,
    tasks: SEED_TASKS,
    activities: SEED_ACTIVITIES,
    automations: SEED_AUTOMATIONS,
    automationRuns: [],
    emailTemplates: SEED_EMAIL_TEMPLATES,
    emailLogs: [],
    calendarEvents: [],
    customFields: [],
    importJobs: [],
    oauthTokens: [],
    notifications: [],
    scheduledJobs: [],
    workspaceCredentials: {},
    conversations: [],
    communicationMessages: [],
    communicationTemplates: SEED_COMMUNICATION_TEMPLATES,
    communicationSettings: {},
    auditLogs: [],
    products: SEED_PRODUCTS,
    lastUpdated: new Date().toISOString(),
  };
}

function readLocalStore(): LocalStoreData {
  try {
    let targetPath = STORE_PATH;
    if (!fs.existsSync(STORE_PATH) && fs.existsSync(TMP_STORE_PATH)) {
      targetPath = TMP_STORE_PATH;
    }

    if (fs.existsSync(targetPath)) {
      const raw = fs.readFileSync(targetPath, 'utf-8');
      const parsed: LocalStoreData = JSON.parse(raw);
      if (!parsed.oauthTokens) parsed.oauthTokens = [];
      if (!parsed.calendarEvents) parsed.calendarEvents = [];
      if (!parsed.automationRuns) parsed.automationRuns = [];
      if (!parsed.notifications) parsed.notifications = [];
      if (!parsed.workspaceCredentials) parsed.workspaceCredentials = {};
      if (!parsed.conversations) parsed.conversations = [];
      if (!parsed.communicationMessages) parsed.communicationMessages = [];
      if (!parsed.communicationTemplates || parsed.communicationTemplates.length === 0) {
        parsed.communicationTemplates = SEED_COMMUNICATION_TEMPLATES;
      }
      if (!parsed.communicationSettings) parsed.communicationSettings = {};
      if (!parsed.auditLogs) parsed.auditLogs = [];
      if (!Array.isArray(parsed.products) || parsed.products.length === 0) {
        parsed.products = SEED_PRODUCTS;
      }

      // Idempotent 3packmark migration for local fallback store
      const legacyEmails = new Set([
        'developsterhub@gmail.com',
        'priya.sharma@developsterhub.com',
        'aarav.mehta@developsterhub.com',
        'diya.patel@developsterhub.com',
        'kabir.joshi@developsterhub.com',
      ]);
      const hasAll3PackmarkMembers = SEED_MEMBERS.every((seed) =>
        (parsed.members || []).some(
          (m) => m.email?.toLowerCase().trim() === seed.email.toLowerCase().trim() && m.password?.startsWith('scrypt:')
        )
      );
      const hasLegacyMembers = (parsed.members || []).some((m) =>
        legacyEmails.has((m.email || '').toLowerCase().trim())
      );
      if (!hasAll3PackmarkMembers || hasLegacyMembers) {
        const seedByEmail = new Map(SEED_MEMBERS.map((s) => [s.email.toLowerCase().trim(), s]));
        const customMembers = (parsed.members || []).filter((m) => {
          const em = (m.email || '').toLowerCase().trim();
          return em && !legacyEmails.has(em) && !seedByEmail.has(em);
        });
        parsed.members = [...SEED_MEMBERS, ...customMembers];
      }

      if (
        !Array.isArray(parsed.stages) ||
        parsed.stages.length === 0 ||
        !parsed.stages.some((s) => s.id === 'stg-credit-follow-up')
      ) {
        const existingById = new Map((Array.isArray(parsed.stages) ? parsed.stages : []).map((s) => [s.id, s]));
        parsed.stages = SEED_STAGES.map((seed) => {
          const existing = existingById.get(seed.id);
          return existing
            ? { ...seed, ...existing, color: existing.color?.trim() ? existing.color : seed.color }
            : seed;
        });
      }

      if (
        !Array.isArray(parsed.pipelines) ||
        !parsed.pipelines.some((p) => p.id === 'pipe-sales' && p.name === '3packmark Sales & Dispatch Pipeline')
      ) {
        parsed.pipelines = SEED_PIPELINES;
      }

      // Reconcile and sanitize leads at boundary
      if (Array.isArray(parsed.leads)) {
        const { reconciled, issuesFixed } = reconcileLeads(parsed.leads);
        parsed.leads = reconciled;
        if (issuesFixed.length > 0) {
          writeLocalStore(parsed);
        }
      }

      // Deduplicate workspaces on load (Map keyed by id, last write wins)
      if (Array.isArray(parsed.workspaces)) {
        const wsMap = new Map<string, Workspace>();
        let hadWsDups = false;
        for (const w of parsed.workspaces) {
          if (w && w.id) {
            if (wsMap.has(w.id)) hadWsDups = true;
            wsMap.set(w.id, w);
          }
        }
        if (wsMap.size === 0) {
          wsMap.set(SEED_WORKSPACE.id, SEED_WORKSPACE);
          hadWsDups = true;
        }
        parsed.workspaces = Array.from(wsMap.values());
        if (hadWsDups) {
          writeLocalStore(parsed);
        }
      }
      return parsed;
    }
  } catch (err) {
    console.error('[CRMRepository] Error reading local store:', err);
  }
  const init = getInitialStore();
  writeLocalStore(init);
  return init;
}

function writeAtomicFile(targetPath: string, payload: any): void {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf-8');
  try {
    fs.renameSync(tempPath, targetPath);
  } catch (renameErr) {
    // Windows compatibility: if target exists and rename encounters lock, copy and delete
    try {
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }
      fs.renameSync(tempPath, targetPath);
    } catch {
      fs.copyFileSync(tempPath, targetPath);
      try {
        fs.unlinkSync(tempPath);
      } catch {}
    }
  }
}

function writeLocalStore(data: LocalStoreData): void {
  data.lastUpdated = new Date().toISOString();
  try {
    writeAtomicFile(STORE_PATH, data);
  } catch (err) {
    try {
      // Serverless fallback for read-only filesystem environments (e.g. Vercel)
      writeAtomicFile(TMP_STORE_PATH, data);
    } catch (tmpErr) {
      console.error('[CRMRepository] Error writing local store (both primary and /tmp failed):', err, tmpErr);
    }
  }
}

export class CRMRepository {
  private initialSeedingPromise: Promise<void> | null = null;
  private hasCheckedInitialSeed: boolean = false;

  /**
   * Asserts that persistent operational storage is available before executing data mutations.
   * In demonstration deployment or production, missing Google Sheets configuration must fail with
   * an actionable error rather than silently persisting ephemeral data to temporary storage.
   */
  public assertOperationalStorage(): void {
    const isEnforced =
      process.env.NODE_ENV === 'production' ||
      process.env.VERCEL === '1';

    if (isEnforced && !isGoogleSheetsConfigured()) {
      throw new Error(
        'GOOGLE_SHEETS_UNCONFIGURED: Operational Google Sheets database credentials are missing. Production deployment requires valid Google Sheets credentials (GOOGLE_SHEETS_SPREADSHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY) to persist CRM data.'
      );
    }
  }

  /**
   * Return storage mode and Google Sheets connection state
   */
  public async getStorageStatus(): Promise<{
    isLiveGoogleSheets: boolean;
    spreadsheetId?: string;
    sheetTitle?: string;
    message: string;
  }> {
    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      const test = await googleSheetsClient.testConnection();
      if (test.success) {
        return {
          isLiveGoogleSheets: true,
          spreadsheetId: googleSheetsClient.getSpreadsheetId(),
          sheetTitle: test.title,
          message: `Live Connected to Google Sheets: "${test.title}"`,
        };
      } else {
        return {
          isLiveGoogleSheets: false,
          spreadsheetId: googleSheetsClient.getSpreadsheetId(),
          message: `Google Sheets connection error: ${test.error}. Using fallback store.`,
        };
      }
    }

    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '[Storage Warning]: Production environment operating without configured Google Sheets backend. Ephemeral local storage cannot provide durable data persistence across serverless invocations.'
      );
    }

    return {
      isLiveGoogleSheets: false,
      message: 'Awaiting Google Sheets Credentials in Settings. Operating in persistent demo mode.',
    };
  }

  /**
   * Fast auto-seed default workspace & seed data to Google Sheets if newly connected and empty.
   * Executes at most once per container lifecycle using batch requests to avoid rate limits.
   */
  public async ensureGoogleSheetsSeeded(): Promise<void> {
    if (this.hasCheckedInitialSeed) {
      return;
    }
    if (this.initialSeedingPromise) {
      return this.initialSeedingPromise;
    }

    this.initialSeedingPromise = (async () => {
      try {
        if (!isGoogleSheetsConfigured() || !googleSheetsClient.isReady()) {
          this.hasCheckedInitialSeed = true;
          return;
        }

        const batchMap = await googleSheetsClient.batchGetRows([
          SHEET_NAMES.WORKSPACES,
          SHEET_NAMES.MEMBERS,
          SHEET_NAMES.PIPELINES,
          SHEET_NAMES.STAGES,
          SHEET_NAMES.AUTOMATIONS,
          SHEET_NAMES.EMAIL_TEMPLATES,
          SHEET_NAMES.PRODUCTS,
        ]);

        // 1. Workspace (migrate old Developster Hub default workspace if present)
        const existingWorkspaces = (batchMap.get(SHEET_NAMES.WORKSPACES) || []) as Workspace[];
        if (existingWorkspaces.length === 0) {
          console.log('[CRMRepository] Seeding default workspace to Google Sheets...');
          await googleSheetsClient.appendRow(SHEET_NAMES.WORKSPACES, SEED_WORKSPACE);
        } else {
          const defaultWs = existingWorkspaces.find((w) => w.id === 'ws-default');
          if (defaultWs && defaultWs.name !== SEED_WORKSPACE.name) {
            console.log('[CRMRepository] Migrating default workspace to 3packmark Private Limited...');
            await googleSheetsClient.updateRowById(SHEET_NAMES.WORKSPACES, 'ws-default', {
              name: SEED_WORKSPACE.name,
              slug: SEED_WORKSPACE.slug,
              companyName: SEED_WORKSPACE.companyName,
              industry: SEED_WORKSPACE.industry,
            });
          }
        }

        // 2. Members (idempotent upsert of 4 3packmark seats with scrypt hashes)
        const existingMembers = (batchMap.get(SHEET_NAMES.MEMBERS) || []) as TeamMember[];
        const legacyEmails = new Set([
          'developsterhub@gmail.com',
          'priya.sharma@developsterhub.com',
          'aarav.mehta@developsterhub.com',
          'diya.patel@developsterhub.com',
          'kabir.joshi@developsterhub.com',
        ]);
        const hasAll3PackmarkMembers = SEED_MEMBERS.every((seed) =>
          existingMembers.some(
            (m) => m.email?.toLowerCase().trim() === seed.email.toLowerCase().trim() && m.password?.startsWith('scrypt:')
          )
        );
        const hasLegacyMembers = existingMembers.some((m) =>
          legacyEmails.has((m.email || '').toLowerCase().trim())
        );
        if (existingMembers.length === 0 || !hasAll3PackmarkMembers || hasLegacyMembers) {
          console.log('[CRMRepository] Migrating Members sheet to 4 3packmark seats...');
          const seedByEmail = new Map(SEED_MEMBERS.map((s) => [s.email.toLowerCase().trim(), s]));
          const customMembers = existingMembers.filter((m) => {
            const em = (m.email || '').toLowerCase().trim();
            return em && !legacyEmails.has(em) && !seedByEmail.has(em);
          });
          await googleSheetsClient.replaceSheetData(SHEET_NAMES.MEMBERS, [...SEED_MEMBERS, ...customMembers]);
        }

        // 3. Pipelines (migrate to 3packmark Sales & Dispatch Pipeline if needed)
        const existingPipelines = (batchMap.get(SHEET_NAMES.PIPELINES) || []) as Pipeline[];
        const has3PackmarkPipeline = existingPipelines.some(
          (p) => p.id === 'pipe-sales' && p.name === '3packmark Sales & Dispatch Pipeline'
        );
        if (existingPipelines.length === 0 || !has3PackmarkPipeline) {
          console.log('[CRMRepository] Migrating Pipelines sheet to 3packmark pipeline...');
          await googleSheetsClient.replaceSheetData(SHEET_NAMES.PIPELINES, SEED_PIPELINES);
        }

        // 4. Stages (only seed missing 3packmark stages; NEVER overwrite existing custom colors or names)
        const existingStages = (batchMap.get(SHEET_NAMES.STAGES) || []) as PipelineStage[];
        const existingStageById = new Map(existingStages.map((s) => [s.id, s]));
        const hasAll11Ids = SEED_STAGES.every((seed) => existingStageById.has(seed.id));
        if (existingStages.length === 0 || !hasAll11Ids) {
          console.log('[CRMRepository] Syncing missing 11-stage 3packmark pipeline stages (preserving existing colors)...');
          const mergedStages = SEED_STAGES.map((seed) => {
            const existing = existingStageById.get(seed.id);
            if (!existing) return seed;
            return {
              ...seed,
              ...existing,
              color: existing.color && String(existing.color).trim() ? existing.color : seed.color,
            };
          });
          // Preserve any extra custom stages created by the user
          const seedIds = new Set(SEED_STAGES.map((s) => s.id));
          const extraCustomStages = existingStages.filter((s) => !seedIds.has(s.id));
          await googleSheetsClient.replaceSheetData(SHEET_NAMES.STAGES, [...mergedStages, ...extraCustomStages]);
        }

        // 5. Automations
        const existingAutomations = (batchMap.get(SHEET_NAMES.AUTOMATIONS) || []) as AutomationRule[];
        if (existingAutomations.length === 0) {
          await googleSheetsClient.appendRows(SHEET_NAMES.AUTOMATIONS, SEED_AUTOMATIONS);
        }

        // 6. Email Templates
        const existingTemplates = (batchMap.get(SHEET_NAMES.EMAIL_TEMPLATES) || []) as EmailTemplate[];
        if (existingTemplates.length === 0) {
          await googleSheetsClient.appendRows(SHEET_NAMES.EMAIL_TEMPLATES, SEED_EMAIL_TEMPLATES);
        }

        // 7. Products (seed 25 chemical products if empty)
        const existingProducts = (batchMap.get(SHEET_NAMES.PRODUCTS) || []) as Product[];
        if (existingProducts.length === 0) {
          console.log('[CRMRepository] Seeding 25 chemical products to Google Sheets...');
          await googleSheetsClient.appendRows(SHEET_NAMES.PRODUCTS, SEED_PRODUCTS);
        }

        this.hasCheckedInitialSeed = true;
        console.log('[CRMRepository] Google Sheets CRM database sync & check complete!');
      } catch (err: any) {
        console.error('[CRMRepository] Error during Google Sheets initial seeding check:', err.message);
      }
    })();

    return this.initialSeedingPromise;
  }

  /**
   * Unified CRM bootstrap loader:
   * Retrieves all CRM data in a SINGLE batch HTTP request to Google Sheets.
   * Completely avoids rate limits, race conditions, and cold-start slowdowns.
   */
  public async getBootstrapData(workspaceId: string) {
    let workspaces: Workspace[] = [];
    let pipelines: Pipeline[] = [];
    let stages: PipelineStage[] = [];
    let leads: Lead[] = [];
    let customers: Customer[] = [];
    let tasks: Task[] = [];
    let members: TeamMember[] = [];
    let automations: AutomationRule[] = [];
    let emailTemplates: EmailTemplate[] = [];
    let calendarEvents: CalendarEvent[] = [];
    let products: Product[] = [];
    let isLiveGoogleSheets = false;
    let message = 'Local storage active.';

    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      try {
        await this.ensureGoogleSheetsSeeded();
        const batchMap = await googleSheetsClient.batchGetRows([
          SHEET_NAMES.WORKSPACES,
          SHEET_NAMES.PIPELINES,
          SHEET_NAMES.STAGES,
          SHEET_NAMES.LEADS,
          SHEET_NAMES.CUSTOMERS,
          SHEET_NAMES.TASKS,
          SHEET_NAMES.MEMBERS,
          SHEET_NAMES.AUTOMATIONS,
          SHEET_NAMES.EMAIL_TEMPLATES,
          SHEET_NAMES.CALENDAR_EVENTS,
          SHEET_NAMES.PRODUCTS,
        ]);

        workspaces = (batchMap.get(SHEET_NAMES.WORKSPACES) || []) as Workspace[];
        pipelines = (batchMap.get(SHEET_NAMES.PIPELINES) || []) as Pipeline[];
        stages = (batchMap.get(SHEET_NAMES.STAGES) || []) as PipelineStage[];
        leads = (batchMap.get(SHEET_NAMES.LEADS) || []) as Lead[];
        customers = (batchMap.get(SHEET_NAMES.CUSTOMERS) || []) as Customer[];
        tasks = (batchMap.get(SHEET_NAMES.TASKS) || []) as Task[];
        members = (batchMap.get(SHEET_NAMES.MEMBERS) || []) as TeamMember[];
        automations = (batchMap.get(SHEET_NAMES.AUTOMATIONS) || []) as AutomationRule[];
        emailTemplates = (batchMap.get(SHEET_NAMES.EMAIL_TEMPLATES) || []) as EmailTemplate[];
        calendarEvents = (batchMap.get(SHEET_NAMES.CALENDAR_EVENTS) || []) as CalendarEvent[];
        products = (batchMap.get(SHEET_NAMES.PRODUCTS) || []) as Product[];

        isLiveGoogleSheets = true;
        message = 'Live Connected to Google Sheets.';
      } catch (err: any) {
        console.error('[CRMRepository] Error during batchGet in getBootstrapData:', err.message);
        throw new Error(`Google Sheets connection error: ${err.message}`);
      }
    } else {
      const store = readLocalStore();
      workspaces = store.workspaces || [];
      pipelines = store.pipelines || [];
      stages = store.stages || [];
      leads = store.leads || [];
      customers = store.customers || [];
      tasks = store.tasks || [];
      members = store.members || [];
      automations = store.automations || [];
      emailTemplates = store.emailTemplates || [];
      calendarEvents = store.calendarEvents || [];
      products = store.products || SEED_PRODUCTS;
    }

    // Workspaces deduplication & fallback
    const wsMap = new Map<string, Workspace>();
    for (const w of workspaces) {
      if (w && w.id) wsMap.set(w.id, w);
    }
    if (wsMap.size === 0) {
      wsMap.set(SEED_WORKSPACE.id, SEED_WORKSPACE);
    }
    const cleanWorkspaces = Array.from(wsMap.values());
    const matchedActiveWs = cleanWorkspaces.find((w) => w.id === workspaceId);
    if (!matchedActiveWs) {
      throw new Error(`Tenant Boundary Error: Workspace "${workspaceId}" does not exist`);
    }
    if (matchedActiveWs) {
      if (!matchedActiveWs.currency || matchedActiveWs.currency === '$') {
        matchedActiveWs.currency = 'INR';
      }
      if (!matchedActiveWs.timezone) {
        matchedActiveWs.timezone = 'Asia/Kolkata';
      }
    }

    // Pipelines & Stages
    let wsPipelines = pipelines.filter((p) => p.workspaceId === matchedActiveWs.id);
    if (wsPipelines.length === 0) {
      wsPipelines = SEED_PIPELINES.map((p) => ({
        ...p,
        workspaceId: matchedActiveWs.id,
        stages: p.stages.map((s) => ({ ...s, workspaceId: matchedActiveWs.id })),
      }));
    } else {
      // Ensure canonical seed pipelines are present
      const existingIds = new Set(wsPipelines.map((p) => p.id));
      for (const sp of SEED_PIPELINES) {
        if (!existingIds.has(sp.id)) {
          wsPipelines.push({
            ...sp,
            workspaceId: matchedActiveWs.id,
            stages: sp.stages.map((s) => ({ ...s, workspaceId: matchedActiveWs.id })),
          });
        }
      }
    }

    const fullPipelines = wsPipelines.map((pipe) => {
      let pipeStages = stages.filter((s) => s.pipelineId === pipe.id);
      if (pipeStages.length === 0 && Array.isArray(pipe.stages) && pipe.stages.length > 0) {
        pipeStages = pipe.stages;
      }
      if (pipeStages.length < 14) {
        pipeStages = SEED_STAGES.map((s) => ({
          ...s,
          workspaceId: pipe.workspaceId,
          pipelineId: pipe.id,
        }));
      }
      return {
        ...pipe,
        stages: pipeStages,
      };
    });

    const activePipeline = fullPipelines.find((p) => p.id === 'pipe-sales') || fullPipelines[0];
    const activeStages = activePipeline?.stages || [];

    // Filter Leads
    let wsLeads = deduplicateLeads(
      leads.map((l) =>
        sanitizeLead({
          ...l,
          stageId: normalizeStageId(l.stageId),
        })
      )
    ).filter((l) => l.workspaceId === matchedActiveWs.id);

    if (wsLeads.length === 0) {
      wsLeads = SEED_LEADS.map((l) => ({ ...l, workspaceId: matchedActiveWs.id }));
    }

    // Filter Customers (deduplicate by id and company)
    const seenCustIds = new Set<string>();
    const seenCustComps = new Set<string>();
    const wsCustomers: Customer[] = [];
    for (const c of customers.filter((c) => c.workspaceId === matchedActiveWs.id)) {
      const compKey = (c.company || '').trim().toLowerCase();
      if (seenCustIds.has(c.id) || (compKey && seenCustComps.has(compKey))) continue;
      seenCustIds.add(c.id);
      if (compKey) seenCustComps.add(compKey);
      wsCustomers.push(c);
    }

    // Filter Tasks
    const wsTasks = tasks.filter((t) => t.workspaceId === matchedActiveWs.id);

    // Filter Members
    let wsMembers = members.filter((m) => m.workspaceId === matchedActiveWs.id);
    if (wsMembers.length === 0 && matchedActiveWs.id === 'ws-default') {
      wsMembers = SEED_MEMBERS.map((m) => ({ ...m, workspaceId: matchedActiveWs.id }));
    }

    // Filter Automations
    const wsAutomations = automations.filter((a) => a.workspaceId === matchedActiveWs.id).map((a: any) => ({
      ...a,
      conditions: a.conditions || a.conditionsJson || [],
      actions: a.actions || a.actionsJson || [],
      nodes: a.nodes || a.nodesJson,
      edges: a.edges || a.edgesJson,
    }));

    // Filter Email Templates
    let wsTemplates = emailTemplates.filter((t) => t.workspaceId === matchedActiveWs.id);
    if (wsTemplates.length === 0) {
      wsTemplates = SEED_EMAIL_TEMPLATES.map((t) => ({ ...t, workspaceId: matchedActiveWs.id }));
    }

    // Filter Calendar Events
    const wsCalendarEvents = calendarEvents.filter((c) => c.workspaceId === matchedActiveWs.id);

    // Filter Products
    let wsProducts = products.filter((p) => p.workspaceId === matchedActiveWs.id);
    if (wsProducts.length === 0) {
      wsProducts = SEED_PRODUCTS.map((p) => ({ ...p, workspaceId: matchedActiveWs.id }));
    }

    return {
      status: {
        isLiveGoogleSheets,
        spreadsheetId: googleSheetsClient.getSpreadsheetId(),
        message,
      },
      workspaces: cleanWorkspaces,
      activeWorkspace: matchedActiveWs,
      pipelines: fullPipelines,
      activePipeline,
      stages: activeStages,
      leads: wsLeads,
      customers: wsCustomers,
      tasks: wsTasks,
      members: wsMembers,
      automations: wsAutomations,
      emailTemplates: wsTemplates,
      calendarEvents: wsCalendarEvents,
      products: wsProducts,
    };
  }

  // --- PRODUCTS ---
  public async getProducts(workspaceId: string): Promise<Product[]> {
    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      await this.ensureGoogleSheetsSeeded();
      const rows = await googleSheetsClient.getAllRows<Product>(SHEET_NAMES.PRODUCTS);
      const filtered = rows.filter((p) => p.workspaceId === workspaceId);
      if (filtered.length > 0) return filtered;
      return SEED_PRODUCTS.map((p) => ({ ...p, workspaceId }));
    }
    const store = readLocalStore();
    const local = (store.products || []).filter((p) => p.workspaceId === workspaceId);
    return local.length > 0 ? local : SEED_PRODUCTS.map((p) => ({ ...p, workspaceId }));
  }

  public async createProduct(
    workspaceId: string,
    data: Omit<Product, 'id' | 'workspaceId' | 'createdAt' | 'updatedAt'>
  ): Promise<Product> {
    this.assertOperationalStorage();
    const now = new Date().toISOString();
    const product: Product = {
      ...data,
      id: `prod-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      workspaceId,
      createdAt: now,
      updatedAt: now,
    };
    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      await googleSheetsClient.appendRow(SHEET_NAMES.PRODUCTS, product);
    } else {
      const store = readLocalStore();
      if (!store.products) store.products = [...SEED_PRODUCTS];
      store.products.unshift(product);
      writeLocalStore(store);
    }
    return product;
  }

  public async bulkCreateProducts(
    workspaceId: string,
    items: Omit<Product, 'id' | 'workspaceId' | 'createdAt' | 'updatedAt'>[]
  ): Promise<Product[]> {
    this.assertOperationalStorage();
    const now = new Date().toISOString();
    const created: Product[] = items.map((item, idx) => ({
      ...item,
      id: `prod-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 5)}`,
      workspaceId,
      createdAt: now,
      updatedAt: now,
    }));
    if (created.length === 0) return [];
    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      await googleSheetsClient.appendRows(SHEET_NAMES.PRODUCTS, created);
    } else {
      const store = readLocalStore();
      if (!store.products) store.products = [...SEED_PRODUCTS];
      store.products.push(...created);
      writeLocalStore(store);
    }
    return created;
  }

  public async clearAllDemoData(): Promise<void> {
    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      await googleSheetsClient.replaceSheetData(SHEET_NAMES.LEADS, []);
      await googleSheetsClient.replaceSheetData(SHEET_NAMES.CUSTOMERS, []);
      await googleSheetsClient.replaceSheetData(SHEET_NAMES.TASKS, []);
      await googleSheetsClient.replaceSheetData(SHEET_NAMES.ACTIVITIES, []);
      await googleSheetsClient.replaceSheetData(SHEET_NAMES.MEMBERS, []);
    }
    const store = readLocalStore();
    store.leads = [];
    store.customers = [];
    store.tasks = [];
    store.activities = [];
    store.members = [];
    writeLocalStore(store);
  }

  // --- WORKSPACES ---
  public async getWorkspaces(): Promise<Workspace[]> {
    let list: Workspace[] = [];
    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      await this.ensureGoogleSheetsSeeded();
      const rows = await googleSheetsClient.getAllRows<Workspace>(SHEET_NAMES.WORKSPACES);
      if (rows.length > 0) list = rows;
    }
    if (list.length === 0) {
      const store = readLocalStore();
      list = store.workspaces || [];
    }
    const map = new Map<string, Workspace>();
    for (const w of list) {
      if (w && w.id) map.set(w.id, w);
    }
    if (map.size === 0) {
      map.set(SEED_WORKSPACE.id, SEED_WORKSPACE);
    }
    return Array.from(map.values());
  }

  public async getWorkspaceById(id: string): Promise<Workspace | null> {
    const workspaces = await this.getWorkspaces();
    return workspaces.find((w) => w.id === id) || null;
  }

  public async createWorkspace(data: Omit<Workspace, 'id' | 'createdAt' | 'updatedAt'>): Promise<Workspace> {
    const id = `ws-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const newWs: Workspace = {
      id,
      ...data,
      createdAt: now,
      updatedAt: now,
    };

    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      await googleSheetsClient.appendRow(SHEET_NAMES.WORKSPACES, newWs);
    }

    const store = readLocalStore();
    const wsMap = new Map<string, Workspace>();
    for (const w of (store.workspaces || [])) {
      if (w && w.id) wsMap.set(w.id, w);
    }
    wsMap.set(newWs.id, newWs);
    store.workspaces = Array.from(wsMap.values());

    // Create default pipeline and canonical 14 stages for new workspace
    const newPipeId = `pipe-${Date.now()}`;
    const newPipelineStages: PipelineStage[] = SEED_STAGES.map((s) => ({
      ...s,
      workspaceId: id,
      pipelineId: newPipeId,
    }));
    const newPipeline: Pipeline = {
      id: newPipeId,
      workspaceId: id,
      name: 'Standard Sales Pipeline',
      isDefault: true,
      order: 1,
      stages: newPipelineStages,
      createdAt: now,
    };

    store.pipelines.push(newPipeline);
    store.stages.push(...newPipeline.stages);
    writeLocalStore(store);

    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      await googleSheetsClient.appendRow(SHEET_NAMES.PIPELINES, newPipeline);
      for (const stg of newPipeline.stages) {
        await googleSheetsClient.appendRow(SHEET_NAMES.STAGES, stg);
      }
    }

    return newWs;
  }

  public async updateWorkspace(id: string, updates: Partial<Workspace>): Promise<Workspace | null> {
    const now = new Date().toISOString();
    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      await googleSheetsClient.updateRowById(SHEET_NAMES.WORKSPACES, id, { ...updates, updatedAt: now });
    }

    const store = readLocalStore();
    const idx = store.workspaces.findIndex((w) => w.id === id);
    if (idx !== -1) {
      store.workspaces[idx] = {
        ...store.workspaces[idx],
        ...updates,
        updatedAt: now,
      };
      writeLocalStore(store);
      return store.workspaces[idx];
    }
    return null;
  }

  // --- MEMBERS ---
  public async getMembers(workspaceId: string): Promise<TeamMember[]> {
    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      await this.ensureGoogleSheetsSeeded();
      const rows = await googleSheetsClient.getAllRows<TeamMember>(SHEET_NAMES.MEMBERS);
      const filtered = rows.filter((m) => m.workspaceId === workspaceId);
      if (filtered.length > 0) return filtered;
    }
    const store = readLocalStore();
    let local = store.members.filter((m) => m.workspaceId === workspaceId);
    if (workspaceId === 'ws-default') {
      const existingEmails = new Set(local.map((m) => m.email.toLowerCase().trim()));
      const missingSeeds = SEED_MEMBERS.filter((s) => !existingEmails.has(s.email.toLowerCase().trim())).map((s) => ({
        ...s,
        workspaceId: 'ws-default',
      }));
      if (missingSeeds.length > 0) {
        store.members.push(...missingSeeds);
        writeLocalStore(store);
        local = store.members.filter((m) => m.workspaceId === workspaceId);
      }
    }
    return local;
  }

  public async getMemberByEmail(email: string): Promise<TeamMember | null> {
    const normalized = email.toLowerCase().trim();
    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      await this.ensureGoogleSheetsSeeded();
      const rows = await googleSheetsClient.getAllRows<TeamMember>(SHEET_NAMES.MEMBERS);
      const found = rows.find((m) => m.email.toLowerCase().trim() === normalized);
      if (found) return found;
    }
    const store = readLocalStore();
    const found = store.members.find((m) => m.email.toLowerCase().trim() === normalized);
    if (found) return found;
    const seed = SEED_MEMBERS.find((s) => s.email.toLowerCase().trim() === normalized);
    if (seed) {
      return { ...seed, workspaceId: 'ws-default' };
    }
    return null;
  }

  public async createMember(workspaceId: string, data: Omit<TeamMember, 'id' | 'createdAt' | 'updatedAt'>): Promise<TeamMember> {
    this.assertOperationalStorage();
    const id = `mem-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const newMember: TeamMember = {
      ...data,
      id,
      workspaceId,
      createdAt: now,
      updatedAt: now,
    };

    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      await googleSheetsClient.appendRow(SHEET_NAMES.MEMBERS, newMember);
    }

    const store = readLocalStore();
    store.members = [...store.members, newMember];
    writeLocalStore(store);

    return newMember;
  }

  public async updateMember(workspaceId: string, memberId: string, updates: Partial<TeamMember>): Promise<TeamMember | null> {
    const store = readLocalStore();
    const idx = store.members.findIndex((m) => m.id === memberId && m.workspaceId === workspaceId);
    if (idx === -1) return null;

    const updated: TeamMember = {
      ...store.members[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    store.members[idx] = updated;
    writeLocalStore(store);

    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      await googleSheetsClient.updateRowById(SHEET_NAMES.MEMBERS, memberId, updated);
    }

    return updated;
  }

  public async deleteMember(workspaceId: string, memberId: string): Promise<boolean> {
    this.assertOperationalStorage();
    const store = readLocalStore();
    const initialLen = store.members.length;
    store.members = store.members.filter((m) => !(m.id === memberId && m.workspaceId === workspaceId));
    if (store.members.length === initialLen) return false;

    writeLocalStore(store);

    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      await googleSheetsClient.deleteRowById(SHEET_NAMES.MEMBERS, memberId);
    }

    return true;
  }

  // --- PIPELINES & STAGES ---
  public async getPipelines(workspaceId: string): Promise<Pipeline[]> {
    let pipelines: Pipeline[] = [];
    let stages: PipelineStage[] = [];

    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      await this.ensureGoogleSheetsSeeded();
      pipelines = await googleSheetsClient.getAllRows<Pipeline>(SHEET_NAMES.PIPELINES);
      stages = await googleSheetsClient.getAllRows<PipelineStage>(SHEET_NAMES.STAGES);
    }

    if (pipelines.length === 0) {
      const store = readLocalStore();
      pipelines = store.pipelines;
      stages = store.stages;
    }

    const wsPipelines = pipelines.filter((p) => p.workspaceId === workspaceId);
    if (wsPipelines.length === 0) {
      // If no pipelines found for workspace, create/return canonical default pipeline
      const defaultStages = SEED_STAGES.map((s) => ({
        ...s,
        workspaceId,
        pipelineId: 'pipe-sales',
      }));
      return [
        {
          id: 'pipe-sales',
          workspaceId,
          name: 'Primary Enterprise Sales',
          isDefault: true,
          order: 1,
          stages: defaultStages,
          createdAt: new Date().toISOString(),
        },
      ];
    }

    return wsPipelines.map((pipe) => {
      // Find stages belonging strictly to this pipeline
      let pipeStages = stages.filter((s) => s.pipelineId === pipe.id);

      // Fallback: if pipeline has embedded stages
      if (pipeStages.length === 0 && Array.isArray(pipe.stages) && pipe.stages.length > 0) {
        pipeStages = pipe.stages;
      }

      // If still fewer than the standard stages, seed from canonical SEED_STAGES
      if (pipeStages.length < 14) {
        pipeStages = SEED_STAGES.map((s) => ({
          ...s,
          workspaceId: pipe.workspaceId,
          pipelineId: pipe.id,
        }));
      }

      // Safe deduplication by normalized ID and name to guarantee zero duplicate React keys or duplicate columns
      const seenIds = new Set<string>();
      const seenNames = new Set<string>();
      const deduplicated: PipelineStage[] = [];

      for (const stg of pipeStages) {
        const normId = normalizeStageId(stg.id);
        const normName = stg.name?.trim().toLowerCase();
        if (seenIds.has(normId) || (normName && seenNames.has(normName))) {
          continue;
        }
        seenIds.add(normId);
        if (normName) seenNames.add(normName);
        deduplicated.push({
          ...stg,
          id: normId,
        });
      }

      return {
        ...pipe,
        stages: deduplicated.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0)),
      };
    });
  }

  public async getStages(workspaceId: string): Promise<PipelineStage[]> {
    const pipelines = await this.getPipelines(workspaceId);
    if (pipelines.length > 0 && pipelines[0].stages?.length > 0) {
      return pipelines[0].stages;
    }
    return SEED_STAGES.map((s) => ({
      ...s,
      workspaceId,
      pipelineId: 'pipe-sales',
    }));
  }

  public async savePipeline(workspaceId: string, pipeline: Pipeline): Promise<Pipeline> {
    const store = readLocalStore();
    const pipeIdx = store.pipelines.findIndex((p) => p.id === pipeline.id && p.workspaceId === workspaceId);
    if (pipeIdx >= 0) {
      store.pipelines[pipeIdx] = pipeline;
    } else {
      store.pipelines.push(pipeline);
    }

    store.stages = store.stages.filter((s) => s.pipelineId !== pipeline.id);
    store.stages.push(...pipeline.stages);
    writeLocalStore(store);

    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      try {
        await googleSheetsClient.updateRowById(SHEET_NAMES.PIPELINES, pipeline.id, pipeline);
        for (const stage of pipeline.stages) {
          await googleSheetsClient.updateRowById(SHEET_NAMES.STAGES, stage.id, stage);
        }
      } catch (err) {
        console.error('[CRMRepository] Failed to sync pipeline to Sheets:', err);
      }
    }

    return pipeline;
  }

  // --- LEADS & DEALS ---
  public async getLeads(workspaceId: string, filter?: { stageId?: string; ownerId?: string; status?: string }): Promise<Lead[]> {
    let leads: Lead[] = [];
    let fetchedFromSheets = false;

    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      try {
        leads = await googleSheetsClient.getAllRows<Lead>(SHEET_NAMES.LEADS);
        fetchedFromSheets = true;
      } catch (err: any) {
        console.error('[CRMRepository] Error fetching leads from Google Sheets:', err.message);
        throw err;
      }
    }

    if (!fetchedFromSheets) {
      const store = readLocalStore();
      leads = store.leads || [];
    }

    // Normalize legacy stage IDs, sanitize values, and deduplicate
    leads = deduplicateLeads(
      leads.map((l) =>
        sanitizeLead({
          ...l,
          stageId: normalizeStageId(l.stageId),
        })
      )
    );

    let results = leads.filter((l) => l.workspaceId === workspaceId);
    if (results.length === 0 && !filter?.stageId && !filter?.ownerId && !filter?.status) {
      results = SEED_LEADS.map((l) => ({ ...l, workspaceId }));
    }
    if (filter?.stageId) {
      const normFilterStage = normalizeStageId(filter.stageId);
      results = results.filter((l) => l.stageId === normFilterStage);
    }
    if (filter?.ownerId) results = results.filter((l) => l.ownerId === filter.ownerId);
    if (filter?.status) results = results.filter((l) => l.status === filter.status);

    return results;
  }

  public async getLeadById(workspaceId: string, leadId: string): Promise<Lead | null> {
    const leads = await this.getLeads(workspaceId);
    return leads.find((l) => l.id === leadId) || null;
  }

  public async createLead(data: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>): Promise<Lead> {
    this.assertOperationalStorage();
    const id = `deal-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const newLead: Lead = sanitizeLead({
      id,
      ...data,
      value: parseFinancialNumber(data.value, 0),
      stageId: normalizeStageId(data.stageId),
      createdAt: now,
      updatedAt: now,
    });

    if (isGoogleSheetsConfigured()) {
      if (!googleSheetsClient.isReady()) {
        throw new Error('Google Sheets database is configured but client failed to connect. Check credentials.');
      }
      await googleSheetsClient.appendRow(SHEET_NAMES.LEADS, newLead);
    }

    try {
      const store = readLocalStore();
      store.leads.unshift(newLead);
      writeLocalStore(store);
    } catch {
      // In serverless environments with read-only disk, local mirror can be skipped safely
    }

    // Log Activity
    try {
      await this.logActivity(data.workspaceId, {
        leadId: id,
        type: 'note',
        title: 'Deal Created',
        description: `Created new deal "${newLead.title}" for ${newLead.company} valued at $${Number(newLead.value || 0).toLocaleString()}`,
        authorName: 'System',
      });
    } catch (e) {
      console.warn('[CRMRepository] Failed to log activity for deal creation:', e);
    }

    // Trigger automations for deal_created
    try {
      await this.executeAutomationsForEvent(data.workspaceId, 'deal_created', newLead);
    } catch (e) {
      console.warn('[CRMRepository] Failed to execute automations for deal creation:', e);
    }

    return newLead;
  }

  public async updateLead(workspaceId: string, leadId: string, updates: Partial<Lead>): Promise<Lead | null> {
    this.assertOperationalStorage();
    const now = new Date().toISOString();
    let currentLead: Lead | null = null;

    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      const leads = await googleSheetsClient.getAllRows<Lead>(SHEET_NAMES.LEADS);
      currentLead = leads.find((l) => l.id === leadId && l.workspaceId === workspaceId) || null;
    }

    if (!currentLead) {
      const store = readLocalStore();
      const idx = store.leads.findIndex((l) => l.id === leadId && l.workspaceId === workspaceId);
      if (idx !== -1) currentLead = store.leads[idx];
    }

    if (!currentLead) return null;

    const previousStageId = normalizeStageId(currentLead.stageId);
    const targetStageId = updates.stageId ? normalizeStageId(updates.stageId) : previousStageId;

    const effectiveUpdates: Partial<Lead> = {
      ...updates,
      stageId: targetStageId,
    };

    if (updates.value !== undefined) {
      effectiveUpdates.value = parseFinancialNumber(updates.value, currentLead.value);
    }

    // Terminal stage logic for Won & Loss
    if (targetStageId === 'stg-won') {
      effectiveUpdates.status = 'Won';
      effectiveUpdates.closingProbability = 100;
      if (!currentLead.wonAt) effectiveUpdates.wonAt = now;
    } else if (targetStageId === 'stg-loss') {
      effectiveUpdates.status = 'Lost';
      effectiveUpdates.closingProbability = 0;
      if (!currentLead.lostAt) effectiveUpdates.lostAt = now;
    } else if (currentLead.status === 'Won' || currentLead.status === 'Lost') {
      // Reopening deal from terminal state to an active stage
      effectiveUpdates.status = updates.status || 'Qualified';
      effectiveUpdates.wonAt = undefined;
      effectiveUpdates.lostAt = undefined;
      if (updates.closingProbability === undefined && (currentLead.closingProbability === 0 || currentLead.closingProbability === 100)) {
        effectiveUpdates.closingProbability = 50;
      }
    }

    const updatedLead: Lead = sanitizeLead({
      ...currentLead,
      ...effectiveUpdates,
      updatedAt: now,
    });

    if (isGoogleSheetsConfigured()) {
      if (!googleSheetsClient.isReady()) {
        throw new Error('Google Sheets database is configured but client failed to connect.');
      }
      await googleSheetsClient.updateRowById(SHEET_NAMES.LEADS, leadId, updatedLead);
    }

    try {
      const store = readLocalStore();
      const idx = store.leads.findIndex((l) => l.id === leadId && l.workspaceId === workspaceId);
      if (idx !== -1) {
        store.leads[idx] = updatedLead;
      } else {
        store.leads.unshift(updatedLead);
      }
      writeLocalStore(store);
    } catch {
      // In serverless environments, ignore local write failure
    }

    // Check if stage changed
    if (targetStageId !== previousStageId) {
      try {
        await this.logActivity(workspaceId, {
          leadId,
          type: 'stage_change',
          title: 'Stage Changed',
          description: `Deal moved from ${previousStageId} to ${targetStageId}`,
          authorName: 'User',
        });
      } catch (e) {
        console.warn('[CRMRepository] Failed to log activity for stage change:', e);
      }

      // Trigger stage change automation
      try {
        await this.executeAutomationsForEvent(workspaceId, 'deal_stage_changed', updatedLead);
      } catch (e) {
        console.warn('[CRMRepository] Failed to execute automations for stage change:', e);
      }
    }

    return updatedLead;
  }

  public async markDealWon(workspaceId: string, leadId: string, finalValue?: number): Promise<Lead | null> {
    const now = new Date().toISOString();
    const stages = await this.getStages(workspaceId);
    const closedStage =
      stages.find((s) => s.name?.trim().toLowerCase() === 'closed') ||
      stages.find((s) => s.id === 'stg-closed');
    const updates: Partial<Lead> = {
      status: 'Won',
      stageId: closedStage?.id || 'stg-closed',
      wonAt: now,
      closingProbability: 100,
    };
    if (finalValue !== undefined) updates.value = parseFinancialNumber(finalValue, 0);

    const lead = await this.updateLead(workspaceId, leadId, updates);
    if (lead) {
      await this.logActivity(workspaceId, {
        leadId,
        type: 'deal_won',
        title: `Deal Won: $${Number(lead.value || 0).toLocaleString()}`,
        description: `Successfully closed deal "${lead.title}" for ${lead.company}`,
        authorName: 'User',
      });

      // Convert lead to Customer record if not already exists
      const customers = await this.getCustomers(workspaceId);
      const existing = customers.find((c) => c.company.toLowerCase() === lead.company.toLowerCase());
      if (existing) {
        await this.updateCustomer(workspaceId, existing.id, {
          totalRevenue: (Number(existing.totalRevenue) || 0) + Number(lead.value || 0),
          dealsCount: (Number(existing.dealsCount) || 0) + 1,
          lastContactedAt: now,
        });
      } else {
        await this.createCustomer(workspaceId, {
          name: lead.contactName,
          company: lead.company,
          email: lead.email,
          phone: lead.phone,
          status: 'Active',
          totalRevenue: Number(lead.value || 0),
          dealsCount: 1,
          lastContactedAt: now,
        });
      }

      await this.executeAutomationsForEvent(workspaceId, 'deal_won', lead);
    }

    return lead;
  }

  public async markDealLost(workspaceId: string, leadId: string, lossReason: string): Promise<Lead | null> {
    const now = new Date().toISOString();
    const updates: Partial<Lead> = {
      status: 'Lost',
      stageId: 'stg-loss',
      lostAt: now,
      lossReason,
      closingProbability: 0,
    };

    const lead = await this.updateLead(workspaceId, leadId, updates);
    if (lead) {
      await this.logActivity(workspaceId, {
        leadId,
        type: 'deal_lost',
        title: 'Deal Marked Lost',
        description: `Reason: ${lossReason}`,
        authorName: 'User',
      });

      await this.executeAutomationsForEvent(workspaceId, 'deal_lost', lead);
    }

    return lead;
  }

  public async deleteLead(workspaceId: string, leadId: string): Promise<boolean> {
    this.assertOperationalStorage();

    // Verify lead exists and belongs to this workspace before deleting
    let existingLead: Lead | null = null;
    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      const leads = await googleSheetsClient.getAllRows<Lead>(SHEET_NAMES.LEADS);
      existingLead = leads.find((l) => l.id === leadId) || null;
    }

    if (!existingLead) {
      const store = readLocalStore();
      existingLead = store.leads.find((l) => l.id === leadId) || null;
    }

    if (!existingLead) {
      throw new Error(`Lead ${leadId} not found.`);
    }

    if (existingLead.workspaceId !== workspaceId) {
      throw new Error(`Tenant Boundary Violation: Lead ${leadId} belongs to workspace ${existingLead.workspaceId}, not ${workspaceId}`);
    }

    if (isGoogleSheetsConfigured()) {
      if (!googleSheetsClient.isReady()) {
        throw new Error('Google Sheets database is configured but client failed to connect.');
      }
      await googleSheetsClient.deleteRowById(SHEET_NAMES.LEADS, leadId);
    }

    try {
      const store = readLocalStore();
      store.leads = store.leads.filter((l) => !(l.id === leadId && l.workspaceId === workspaceId));
      writeLocalStore(store);
    } catch {
      // In serverless environments, ignore local write failure
    }

    return true;
  }

  public async reconcileWorkspaceData(workspaceId: string): Promise<{
    success: boolean;
    reconciledCount: number;
    issuesFixed: { leadId: string; title: string; issue: string }[];
  }> {
    const store = readLocalStore();
    const wsLeads = store.leads.filter((l) => l.workspaceId === workspaceId);
    const { reconciled, issuesFixed } = reconcileLeads(wsLeads);
    const otherLeads = store.leads.filter((l) => l.workspaceId !== workspaceId);
    store.leads = [...reconciled, ...otherLeads];
    writeLocalStore(store);

    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      await googleSheetsClient.replaceSheetData(SHEET_NAMES.LEADS, store.leads);
    }

    return {
      success: true,
      reconciledCount: reconciled.length,
      issuesFixed,
    };
  }

  /**
   * Calculates deterministic lead score and temperature tier and saves to persistent storage
   */
  public async calculateAndSaveLeadScore(workspaceId: string, leadId: string): Promise<Lead | null> {
    return this.getLeadById(workspaceId, leadId);
  }

  /**
   * Batch scores leads for a workspace efficiently in a single pass
   */
  public async batchCalculateAndSaveLeadScores(workspaceId: string, leadIds?: string[]): Promise<Lead[]> {
    const allLeads = await this.getLeads(workspaceId);
    return leadIds && leadIds.length > 0
      ? allLeads.filter((l) => leadIds.includes(l.id))
      : allLeads;
  }

  // --- CUSTOMERS ---
  public async getCustomers(workspaceId: string): Promise<Customer[]> {
    let rows: Customer[] = [];
    let fetchedFromSheets = false;

    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      try {
        const allRows = await googleSheetsClient.getAllRows<Customer>(SHEET_NAMES.CUSTOMERS);
        rows = allRows.filter((c) => c.workspaceId === workspaceId);
        fetchedFromSheets = true;
      } catch (err: any) {
        console.error('[CRMRepository] Error fetching customers from Google Sheets:', err.message);
        throw err;
      }
    }

    if (!fetchedFromSheets) {
      const store = readLocalStore();
      rows = store.customers.filter((c) => c.workspaceId === workspaceId);
    }

    // Idempotent deduplication by customer ID and company
    const seenIds = new Set<string>();
    const seenCompanies = new Set<string>();
    const uniqueCustomers: Customer[] = [];

    for (const c of rows) {
      const compKey = (c.company || '').trim().toLowerCase();
      if (seenIds.has(c.id) || (compKey && seenCompanies.has(compKey))) {
        continue;
      }
      seenIds.add(c.id);
      if (compKey) seenCompanies.add(compKey);
      uniqueCustomers.push(c);
    }

    return uniqueCustomers;
  }

  public async createCustomer(workspaceId: string, data: Omit<Customer, 'id' | 'workspaceId' | 'createdAt'>): Promise<Customer> {
    this.assertOperationalStorage();
    const store = readLocalStore();
    // Reconcile/check if customer with this company already exists for this workspace
    const existingIdx = store.customers.findIndex(
      (c) => c.workspaceId === workspaceId && c.company.trim().toLowerCase() === data.company.trim().toLowerCase()
    );
    if (existingIdx !== -1) {
      const existing = store.customers[existingIdx];
      const updated: Customer = {
        ...existing,
        ...data,
        totalRevenue: (Number(existing.totalRevenue) || 0) + (Number(data.totalRevenue) || 0),
        dealsCount: (Number(existing.dealsCount) || 0) + (Number(data.dealsCount) || 1),
        lastContactedAt: data.lastContactedAt || new Date().toISOString(),
      };
      if (isGoogleSheetsConfigured()) {
        if (!googleSheetsClient.isReady()) {
          throw new Error('Google Sheets database is configured but client failed to connect.');
        }
        await googleSheetsClient.updateRowById(SHEET_NAMES.CUSTOMERS, updated.id, updated);
      }
      try {
        store.customers[existingIdx] = updated;
        writeLocalStore(store);
      } catch {}
      return updated;
    }

    const id = `cust-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newCust: Customer = {
      id,
      workspaceId,
      ...data,
      createdAt: new Date().toISOString(),
    };

    if (isGoogleSheetsConfigured()) {
      if (!googleSheetsClient.isReady()) {
        throw new Error('Google Sheets database is configured but client failed to connect.');
      }
      await googleSheetsClient.appendRow(SHEET_NAMES.CUSTOMERS, newCust);
    }

    try {
      store.customers.unshift(newCust);
      writeLocalStore(store);
    } catch {}

    return newCust;
  }

  public async deleteCustomer(workspaceId: string, customerId: string): Promise<boolean> {
    this.assertOperationalStorage();
    if (isGoogleSheetsConfigured()) {
      if (!googleSheetsClient.isReady()) {
        throw new Error('Google Sheets database is configured but client failed to connect.');
      }
      await googleSheetsClient.deleteRowById(SHEET_NAMES.CUSTOMERS, customerId);
    }
    try {
      const store = readLocalStore();
      store.customers = store.customers.filter((c) => !(c.id === customerId && c.workspaceId === workspaceId));
      writeLocalStore(store);
    } catch {}
    return true;
  }

  public async updateCustomer(workspaceId: string, customerId: string, updates: Partial<Customer>): Promise<Customer | null> {
    this.assertOperationalStorage();
    let current: Customer | null = null;
    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      const customers = await googleSheetsClient.getAllRows<Customer>(SHEET_NAMES.CUSTOMERS);
      current = customers.find((c) => c.id === customerId && c.workspaceId === workspaceId) || null;
    }
    if (!current) {
      const store = readLocalStore();
      const idx = store.customers.findIndex((c) => c.id === customerId && c.workspaceId === workspaceId);
      if (idx !== -1) current = store.customers[idx];
    }
    if (!current) return null;

    const updated: Customer = { ...current, ...updates };

    if (isGoogleSheetsConfigured()) {
      if (!googleSheetsClient.isReady()) {
        throw new Error('Google Sheets database is configured but client failed to connect.');
      }
      await googleSheetsClient.updateRowById(SHEET_NAMES.CUSTOMERS, customerId, updated);
    }

    try {
      const store = readLocalStore();
      const idx = store.customers.findIndex((c) => c.id === customerId && c.workspaceId === workspaceId);
      if (idx !== -1) {
        store.customers[idx] = updated;
      } else {
        store.customers.unshift(updated);
      }
      writeLocalStore(store);
    } catch {}

    return updated;
  }

  // --- TASKS ---
  public async getTasks(workspaceId: string): Promise<Task[]> {
    let rows: Task[] = [];
    let fetchedFromSheets = false;

    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      try {
        const allRows = await googleSheetsClient.getAllRows<Task>(SHEET_NAMES.TASKS);
        rows = allRows.filter((t) => t.workspaceId === workspaceId);
        fetchedFromSheets = true;
      } catch (err: any) {
        console.error('[CRMRepository] Error fetching tasks from Google Sheets:', err.message);
        throw err;
      }
    }

    if (!fetchedFromSheets) {
      const store = readLocalStore();
      rows = store.tasks.filter((t) => t.workspaceId === workspaceId);
    }

    return rows;
  }

  public async createTask(data: Omit<Task, 'id' | 'createdAt'>): Promise<Task> {
    this.assertOperationalStorage();
    const id = `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newTask: Task = {
      id,
      ...data,
      createdAt: new Date().toISOString(),
    };

    if (isGoogleSheetsConfigured()) {
      if (!googleSheetsClient.isReady()) {
        throw new Error('Google Sheets database is configured but client failed to connect.');
      }
      await googleSheetsClient.appendRow(SHEET_NAMES.TASKS, newTask);
    }

    try {
      const store = readLocalStore();
      store.tasks.unshift(newTask);
      writeLocalStore(store);
    } catch {
      // ignore
    }

    if (data.leadId) {
      try {
        await this.logActivity(data.workspaceId, {
          leadId: data.leadId,
          type: 'task',
          title: 'Task Created',
          description: `Scheduled: ${data.title} (Due: ${new Date(data.dueDate).toLocaleDateString()})`,
          authorName: 'User',
        });
      } catch (e) {
        console.warn('[CRMRepository] Failed to log activity for task creation:', e);
      }
    }

    return newTask;
  }

  public async updateTask(workspaceId: string, taskId: string, updates: Partial<Task>): Promise<Task | null> {
    this.assertOperationalStorage();
    let current: Task | null = null;
    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      const tasks = await googleSheetsClient.getAllRows<Task>(SHEET_NAMES.TASKS);
      current = tasks.find((t) => t.id === taskId && t.workspaceId === workspaceId) || null;
    }
    if (!current) {
      const store = readLocalStore();
      const idx = store.tasks.findIndex((t) => t.id === taskId && t.workspaceId === workspaceId);
      if (idx !== -1) current = store.tasks[idx];
    }
    if (!current) return null;

    const updated: Task = { ...current, ...updates };

    if (isGoogleSheetsConfigured()) {
      if (!googleSheetsClient.isReady()) {
        throw new Error('Google Sheets database is configured but client failed to connect.');
      }
      await googleSheetsClient.updateRowById(SHEET_NAMES.TASKS, taskId, updated);
    }

    try {
      const store = readLocalStore();
      const idx = store.tasks.findIndex((t) => t.id === taskId && t.workspaceId === workspaceId);
      if (idx !== -1) {
        store.tasks[idx] = updated;
      } else {
        store.tasks.unshift(updated);
      }
      writeLocalStore(store);
    } catch {
      // ignore
    }

    return updated;
  }

  public async deleteTask(workspaceId: string, taskId: string): Promise<boolean> {
    this.assertOperationalStorage();
    if (isGoogleSheetsConfigured()) {
      if (!googleSheetsClient.isReady()) {
        throw new Error('Google Sheets database is configured but client failed to connect.');
      }
      await googleSheetsClient.deleteRowById(SHEET_NAMES.TASKS, taskId);
    }

    try {
      const store = readLocalStore();
      store.tasks = store.tasks.filter((t) => !(t.id === taskId && t.workspaceId === workspaceId));
      writeLocalStore(store);
    } catch {
      // ignore
    }

    return true;
  }

  // --- ACTIVITIES ---
  public async getActivities(workspaceId: string, leadId?: string): Promise<Activity[]> {
    let acts: Activity[] = [];
    let fetchedFromSheets = false;

    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      try {
        acts = await googleSheetsClient.getAllRows<Activity>(SHEET_NAMES.ACTIVITIES);
        fetchedFromSheets = true;
      } catch (err: any) {
        console.error('[CRMRepository] Error fetching activities from Google Sheets:', err.message);
        throw err;
      }
    }

    if (!fetchedFromSheets) {
      const store = readLocalStore();
      acts = store.activities || [];
    }

    let filtered = acts.filter((a) => a.workspaceId === workspaceId);
    if (leadId) filtered = filtered.filter((a) => a.leadId === leadId);
    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async logActivity(workspaceId: string, data: Omit<Activity, 'id' | 'workspaceId' | 'createdAt'>): Promise<Activity> {
    const id = `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newAct: Activity = {
      id,
      workspaceId,
      ...data,
      createdAt: new Date().toISOString(),
    };

    if (isGoogleSheetsConfigured()) {
      if (!googleSheetsClient.isReady()) {
        throw new Error('Google Sheets database is configured but client failed to connect.');
      }
      await googleSheetsClient.appendRow(SHEET_NAMES.ACTIVITIES, newAct);
    }

    try {
      const store = readLocalStore();
      store.activities.unshift(newAct);
      writeLocalStore(store);
    } catch {
      // ignore
    }

    return newAct;
  }

  // --- AUTOMATIONS ---
  public async getAutomations(workspaceId: string): Promise<AutomationRule[]> {
    const mapRule = (a: any): AutomationRule => {
      const actions = a.actions || a.actionsJson || [];
      const firstEmailMode = actions?.[0]?.config?.emailMode;
      const rawMode = a.executionMode || firstEmailMode || 'auto_send';
      const executionMode: 'auto_send' | 'draft_only' =
        rawMode === 'draft_only' || rawMode === 'manual_confirm' ? 'draft_only' : 'auto_send';
      const delayMinutes =
        a.delayMinutes !== undefined && a.delayMinutes !== '' && !isNaN(Number(a.delayMinutes))
          ? Number(a.delayMinutes)
          : undefined;
      return {
        ...a,
        conditions: a.conditions || a.conditionsJson || [],
        actions,
        nodes: a.nodes || a.nodesJson,
        edges: a.edges || a.edgesJson,
        executionMode,
        delayMinutes,
        runCount: Number(a.runCount || 0),
        isActive: a.isActive === undefined ? true : a.isActive === true || a.isActive === 'TRUE' || a.isActive === 'true',
      };
    };

    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      await this.ensureGoogleSheetsSeeded();
      const rows = await googleSheetsClient.getAllRows<any>(SHEET_NAMES.AUTOMATIONS);
      const filtered = rows.filter((a) => a.workspaceId === workspaceId).map(mapRule);
      if (filtered.length > 0) return filtered;
    }
    const store = readLocalStore();
    return store.automations.filter((a) => a.workspaceId === workspaceId).map(mapRule);
  }

  public async saveAutomationRule(
    workspaceId: string,
    rule: Omit<AutomationRule, 'id' | 'runCount' | 'createdAt'> & { id?: string; runCount?: number }
  ): Promise<AutomationRule> {
    const id = rule.id || `auto-${Date.now()}`;
    const now = new Date().toISOString();
    const store = readLocalStore();
    const existing = store.automations.find((a) => a.id === id);

    const rawMode = rule.executionMode || (rule.actions?.[0]?.config as any)?.emailMode || existing?.executionMode || 'auto_send';
    const executionMode: 'auto_send' | 'draft_only' =
      rawMode === 'draft_only' || rawMode === 'manual_confirm' ? 'draft_only' : 'auto_send';
    const delayMinutes =
      rule.delayMinutes !== undefined
        ? Number(rule.delayMinutes)
        : existing?.delayMinutes !== undefined
        ? Number(existing.delayMinutes)
        : 0;

    const baseActions = (rule.actions && rule.actions.length > 0 ? rule.actions : existing?.actions || [{ type: 'send_email', config: {} }]).map((act, idx) =>
      idx === 0
        ? {
            ...act,
            config: {
              ...(act.config || {}),
              emailMode: executionMode === 'auto_send' ? 'auto_send' : 'manual_confirm',
            },
          }
        : act
    );

    const fullRule: AutomationRule = {
      id,
      workspaceId,
      name: rule.name || existing?.name || 'Untitled Workflow',
      description: rule.description ?? existing?.description,
      triggerType: rule.triggerType || existing?.triggerType || 'deal_stage_changed',
      triggerStageId: rule.triggerStageId ?? existing?.triggerStageId,
      conditions: rule.conditions || existing?.conditions || [],
      actions: baseActions as any,
      nodes: rule.nodes ?? existing?.nodes,
      edges: rule.edges ?? existing?.edges,
      version: rule.version || existing?.version || 1,
      isActive: rule.isActive ?? existing?.isActive ?? true,
      executionMode,
      delayMinutes,
      runCount: rule.runCount ?? existing?.runCount ?? 0,
      lastRunAt: rule.lastRunAt ?? existing?.lastRunAt,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      await googleSheetsClient.updateRowById(SHEET_NAMES.AUTOMATIONS, id, fullRule);
    }

    const idx = store.automations.findIndex((a) => a.id === id);
    if (idx >= 0) {
      store.automations[idx] = fullRule;
    } else {
      store.automations.push(fullRule);
    }
    writeLocalStore(store);

    return fullRule;
  }

  public async deleteAutomationRule(workspaceId: string, ruleId: string): Promise<boolean> {
    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      await googleSheetsClient.deleteRowById(SHEET_NAMES.AUTOMATIONS, ruleId);
    }

    const store = readLocalStore();
    store.automations = store.automations.filter((a) => !(a.id === ruleId && a.workspaceId === workspaceId));
    writeLocalStore(store);

    return true;
  }

  public async getAutomationRuns(workspaceId: string): Promise<AutomationRun[]> {
    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      const rows = await googleSheetsClient.getAllRows<AutomationRun>(SHEET_NAMES.AUTOMATION_RUNS);
      const filtered = rows.filter((r) => r.workspaceId === workspaceId);
      if (filtered.length > 0) return filtered;
    }
    const store = readLocalStore();
    return (store.automationRuns || []).filter((r) => r.workspaceId === workspaceId);
  }

  // --- SCHEDULED JOBS ---
  public async getScheduledJobs(workspaceId: string): Promise<ScheduledJob[]> {
    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      try {
        const rows = await googleSheetsClient.getAllRows<any>(SHEET_NAMES.SCHEDULED_JOBS);
        const filtered = rows.filter((j) => j.workspaceId === workspaceId).map((j) => ({
          ...j,
          actionConfig: j.actionConfig || j.actionConfigJson || {},
        }));
        if (filtered.length > 0) return filtered;
      } catch (e) {
        // Fallback to local store
      }
    }
    const store = readLocalStore();
    return (store.scheduledJobs || []).filter((j) => j.workspaceId === workspaceId);
  }

  public async createScheduledJob(
    job: Omit<ScheduledJob, 'id' | 'createdAt'> & { id?: string }
  ): Promise<ScheduledJob> {
    const id = job.id || `job-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const fullJob: ScheduledJob = {
      ...job,
      id,
      retryCount: job.retryCount || 0,
      maxRetries: job.maxRetries || 3,
      createdAt: now,
    };

    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      try {
        await googleSheetsClient.appendRows(SHEET_NAMES.SCHEDULED_JOBS, [fullJob]);
      } catch (err: any) {
        console.warn('[CRMRepository] Error appending scheduled job to Google Sheets:', err.message);
      }
    }

    const store = readLocalStore();
    if (!store.scheduledJobs) store.scheduledJobs = [];
    store.scheduledJobs.push(fullJob);
    writeLocalStore(store);

    return fullJob;
  }

  public async updateScheduledJob(
    jobId: string,
    updates: Partial<ScheduledJob>
  ): Promise<ScheduledJob | null> {
    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      try {
        await googleSheetsClient.updateRowById(SHEET_NAMES.SCHEDULED_JOBS, jobId, updates);
      } catch (err: any) {
        console.warn('[CRMRepository] Error updating scheduled job in Google Sheets:', err.message);
      }
    }

    const store = readLocalStore();
    if (!store.scheduledJobs) store.scheduledJobs = [];
    const idx = store.scheduledJobs.findIndex((j) => j.id === jobId);
    if (idx === -1) return null;

    store.scheduledJobs[idx] = {
      ...store.scheduledJobs[idx],
      ...updates,
    };
    writeLocalStore(store);

    return store.scheduledJobs[idx];
  }

  public async cancelScheduledJobsForLead(
    workspaceId: string,
    leadId: string,
    reason: string
  ): Promise<number> {
    let cancelledCount = 0;
    const store = readLocalStore();
    if (!store.scheduledJobs) store.scheduledJobs = [];

    const now = new Date().toISOString();
    for (const job of store.scheduledJobs) {
      if (
        job.workspaceId === workspaceId &&
        job.leadId === leadId &&
        (job.status === 'pending' || job.status === 'executing')
      ) {
        job.status = 'cancelled';
        job.cancellationReason = reason;
        job.executedAt = now;
        cancelledCount++;

        if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
          try {
            await googleSheetsClient.updateRowById(SHEET_NAMES.SCHEDULED_JOBS, job.id, {
              status: 'cancelled',
              cancellationReason: reason,
              executedAt: now,
            });
          } catch {}
        }
      }
    }

    if (cancelledCount > 0) {
      writeLocalStore(store);
      console.log(`[CRMRepository] Cancelled ${cancelledCount} pending jobs for lead ${leadId}: ${reason}`);
    }

    return cancelledCount;
  }

  public async getDueScheduledJobs(
    workspaceId: string,
    beforeDate: string = new Date().toISOString()
  ): Promise<ScheduledJob[]> {
    const allJobs = await this.getScheduledJobs(workspaceId);
    const beforeTime = new Date(beforeDate).getTime();

    return allJobs.filter((job) => {
      if (job.status !== 'pending') return false;
      const scheduledTime = new Date(job.scheduledFor).getTime();
      return !isNaN(scheduledTime) && scheduledTime <= beforeTime;
    });
  }

  /**
   * Execute matching automations for an event (e.g. stage changed, won, created)
   * Delegates directly to the single server-side engine (Phase 4 engine.ts)
   */
  public async executeAutomationsForEvent(workspaceId: string, triggerEvent: string, lead: Lead): Promise<void> {
    try {
      const { emitCrmEvent } = await import('@/lib/automations/engine');
      await emitCrmEvent({
        type: triggerEvent as any,
        leadId: lead.id,
        previousStageId: lead.stageId,
        newStageId: lead.stageId,
        pipelineId: lead.pipelineId,
        workspaceId,
      });
    } catch (err: any) {
      console.error('[CRMRepository] Error executing automations for event:', triggerEvent, err.message);
    }
  }

  // --- EMAIL & CALENDAR ---
  public async getEmailTemplates(workspaceId: string): Promise<EmailTemplate[]> {
    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      await this.ensureGoogleSheetsSeeded();
      const rows = await googleSheetsClient.getAllRows<EmailTemplate>(SHEET_NAMES.EMAIL_TEMPLATES);
      const filtered = rows.filter((t) => t.workspaceId === workspaceId);
      if (filtered.length > 0) return filtered;
    }
    const store = readLocalStore();
    if (!store.emailTemplates) store.emailTemplates = [];

    // Ensure all pre-built templates are present in the store
    const existingIds = new Set(store.emailTemplates.map((t) => t.id));
    let hasChanges = false;
    for (const p of SEED_EMAIL_TEMPLATES) {
      if (!existingIds.has(p.id)) {
        store.emailTemplates.push({ ...p, workspaceId });
        hasChanges = true;
      }
    }
    if (hasChanges) {
      writeLocalStore(store);
    }

    return store.emailTemplates.filter((t) => t.workspaceId === workspaceId);
  }

  public async saveEmailTemplate(workspaceId: string, template: Partial<EmailTemplate>): Promise<EmailTemplate> {
    const store = readLocalStore();
    if (!store.emailTemplates) store.emailTemplates = [];

    const now = new Date().toISOString();
    let saved: EmailTemplate;

    if (template.id && store.emailTemplates.some((t) => t.id === template.id)) {
      const idx = store.emailTemplates.findIndex((t) => t.id === template.id);
      saved = {
        ...store.emailTemplates[idx],
        ...template,
        workspaceId,
        updatedAt: now,
      };
      store.emailTemplates[idx] = saved;

      if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
        await googleSheetsClient.updateRowById(SHEET_NAMES.EMAIL_TEMPLATES, saved.id, saved);
      }
    } else {
      const newId = template.id || `tpl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      saved = {
        id: newId,
        workspaceId,
        name: template.name || 'Untitled Template',
        subject: template.subject || '',
        body: template.body || '',
        category: template.category || 'general',
        plainText: template.plainText || '',
        variables: template.variables || [],
        isPrebuilt: !!template.isPrebuilt,
        createdAt: now,
        updatedAt: now,
      };
      store.emailTemplates.unshift(saved);

      if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
        await googleSheetsClient.appendRow(SHEET_NAMES.EMAIL_TEMPLATES, saved);
      }
    }

    writeLocalStore(store);
    return saved;
  }

  public async deleteEmailTemplate(workspaceId: string, templateId: string): Promise<boolean> {
    const store = readLocalStore();
    if (!store.emailTemplates) return false;
    const existing = store.emailTemplates.find((t) => t.id === templateId && t.workspaceId === workspaceId);
    if (!existing) return false;
    if (existing.isPrebuilt) {
      throw new Error('Pre-built templates cannot be deleted, only duplicated.');
    }

    store.emailTemplates = store.emailTemplates.filter((t) => !(t.id === templateId && t.workspaceId === workspaceId));
    writeLocalStore(store);

    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      await googleSheetsClient.deleteRowById(SHEET_NAMES.EMAIL_TEMPLATES, templateId);
    }

    return true;
  }

  public async getEmailLogs(workspaceId: string, leadId?: string): Promise<EmailLog[]> {
    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      const rows = await googleSheetsClient.getAllRows<EmailLog>(SHEET_NAMES.EMAIL_LOGS);
      return rows.filter((l) => l.workspaceId === workspaceId && (!leadId || l.leadId === leadId));
    }
    const store = readLocalStore();
    if (!store.emailLogs) store.emailLogs = [];
    return store.emailLogs.filter((l) => l.workspaceId === workspaceId && (!leadId || l.leadId === leadId));
  }

  // --- NOTIFICATIONS ---
  public async getNotifications(workspaceId: string): Promise<AppNotification[]> {
    const store = readLocalStore();
    if (!store.notifications) store.notifications = [];
    return store.notifications.filter((n) => n.workspaceId === workspaceId);
  }

  public async createNotification(
    workspaceId: string,
    notification: Omit<AppNotification, 'id' | 'workspaceId' | 'createdAt' | 'isRead'>
  ): Promise<AppNotification> {
    const store = readLocalStore();
    if (!store.notifications) store.notifications = [];

    const newNotification: AppNotification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      workspaceId,
      ...notification,
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    store.notifications.unshift(newNotification);
    writeLocalStore(store);
    return newNotification;
  }

  public async markNotificationRead(workspaceId: string, notificationId: string): Promise<boolean> {
    const store = readLocalStore();
    if (!store.notifications) return false;
    const notif = store.notifications.find((n) => n.id === notificationId && n.workspaceId === workspaceId);
    if (notif) {
      notif.isRead = true;
      writeLocalStore(store);
      return true;
    }
    return false;
  }

  public async markAllNotificationsRead(workspaceId: string): Promise<boolean> {
    const store = readLocalStore();
    if (!store.notifications) return false;
    store.notifications.forEach((n) => {
      if (n.workspaceId === workspaceId) n.isRead = true;
    });
    writeLocalStore(store);
    return true;
  }

  // Auto-task cancellation when deal stage changes away from "Call me..."
  public async cancelAutoTasks(workspaceId: string, leadId: string, stageTrigger?: string): Promise<number> {
    const store = readLocalStore();
    let count = 0;
    store.tasks = store.tasks.filter((t) => {
      if (
        t.workspaceId === workspaceId &&
        t.leadId === leadId &&
        t.source === 'auto' &&
        (!t.status || t.status === 'open')
      ) {
        if (!stageTrigger || t.autoStageTrigger === stageTrigger) {
          count++;
          return false;
        }
      }
      return true;
    });
    if (count > 0) {
      writeLocalStore(store);
    }
    return count;
  }

  public async logEmail(workspaceId: string, email: Omit<EmailLog, 'id' | 'workspaceId' | 'sentAt'>): Promise<EmailLog> {
    const newLog: EmailLog = {
      id: `email-${Date.now()}`,
      workspaceId,
      ...email,
      sentAt: new Date().toISOString(),
    };

    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      await googleSheetsClient.appendRow(SHEET_NAMES.EMAIL_LOGS, newLog);
    }

    const store = readLocalStore();
    if (!store.emailLogs) store.emailLogs = [];
    store.emailLogs.unshift(newLog);
    writeLocalStore(store);

    if (email.leadId) {
      await this.logActivity(workspaceId, {
        leadId: email.leadId,
        type: 'email',
        title: `Sent Email: ${email.subject}`,
        description: `Delivered to ${email.toEmail}`,
        authorName: 'Rapport Mailer',
      });
    }

    return newLog;
  }

  public async getCalendarEvents(workspaceId: string): Promise<CalendarEvent[]> {
    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      try {
        const rows = await googleSheetsClient.getAllRows<CalendarEvent>(SHEET_NAMES.CALENDAR_EVENTS);
        return rows.filter((c) => c.workspaceId === workspaceId);
      } catch (err: any) {
        console.error('[CRMRepository] Error fetching calendar events from Google Sheets:', err.message);
        throw err;
      }
    }
    const store = readLocalStore();
    return store.calendarEvents.filter((c) => c.workspaceId === workspaceId);
  }

  public async createCalendarEvent(workspaceId: string, event: Omit<CalendarEvent, 'id' | 'workspaceId' | 'createdAt'>): Promise<CalendarEvent> {
    const newEv: CalendarEvent = {
      id: `cal-${Date.now()}`,
      workspaceId,
      ...event,
      createdAt: new Date().toISOString(),
    };

    if (isGoogleSheetsConfigured()) {
      if (!googleSheetsClient.isReady()) {
        throw new Error('Google Sheets database is configured but client failed to connect.');
      }
      await googleSheetsClient.appendRow(SHEET_NAMES.CALENDAR_EVENTS, newEv);
    }

    try {
      const store = readLocalStore();
      store.calendarEvents.unshift(newEv);
      writeLocalStore(store);
    } catch {}

    if (event.leadId) {
      await this.logActivity(workspaceId, {
        leadId: event.leadId,
        type: 'meeting',
        title: `Scheduled Meeting: ${event.title}`,
        description: `Calendar event set for ${new Date(event.startIso).toLocaleString()}`,
        authorName: 'Google Calendar Sync',
      });
    }

    return newEv;
  }

  public async updateCalendarEvent(
    workspaceId: string,
    eventId: string,
    updates: Partial<CalendarEvent>
  ): Promise<CalendarEvent | null> {
    let currentEvent: CalendarEvent | null = null;
    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      const events = await googleSheetsClient.getAllRows<CalendarEvent>(SHEET_NAMES.CALENDAR_EVENTS);
      currentEvent = events.find((c) => c.id === eventId && c.workspaceId === workspaceId) || null;
    }

    if (!currentEvent) {
      const store = readLocalStore();
      const idx = store.calendarEvents.findIndex((c) => c.id === eventId && c.workspaceId === workspaceId);
      if (idx !== -1) currentEvent = store.calendarEvents[idx];
    }

    if (!currentEvent) return null;

    const updated: CalendarEvent = {
      ...currentEvent,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    if (isGoogleSheetsConfigured()) {
      if (!googleSheetsClient.isReady()) {
        throw new Error('Google Sheets database is configured but client failed to connect.');
      }
      await googleSheetsClient.updateRowById(SHEET_NAMES.CALENDAR_EVENTS, eventId, updated);
    }

    try {
      const store = readLocalStore();
      const idx = store.calendarEvents.findIndex((c) => c.id === eventId && c.workspaceId === workspaceId);
      if (idx !== -1) {
        store.calendarEvents[idx] = updated;
      } else {
        store.calendarEvents.unshift(updated);
      }
      writeLocalStore(store);
    } catch {}

    return updated;
  }

  public async deleteCalendarEvent(workspaceId: string, eventId: string): Promise<boolean> {
    if (isGoogleSheetsConfigured()) {
      if (!googleSheetsClient.isReady()) {
        throw new Error('Google Sheets database is configured but client failed to connect.');
      }
      await googleSheetsClient.deleteRowById(SHEET_NAMES.CALENDAR_EVENTS, eventId);
    }

    try {
      const store = readLocalStore();
      store.calendarEvents = store.calendarEvents.filter(
        (c) => !(c.id === eventId && c.workspaceId === workspaceId)
      );
      writeLocalStore(store);
    } catch {}

    return true;
  }

  // --- OAUTH TOKENS PERSISTENCE (ENCRYPTED AT REST VIA AES-256-GCM) ---
  private decryptOAuthTokens(record: OAuthTokenRecord): OAuthTokenRecord {
    let access = record.accessToken;
    let refresh = record.refreshToken;
    if (access && access.split(':').length === 3) {
      try {
        const dec = decryptSecret(access);
        if (dec) access = dec;
      } catch {}
    }
    if (refresh && refresh.split(':').length === 3) {
      try {
        const dec = decryptSecret(refresh);
        if (dec) refresh = dec;
      } catch {}
    }
    return {
      ...record,
      accessToken: access,
      refreshToken: refresh,
    };
  }

  public async getOAuthTokens(
    workspaceId: string,
    provider: 'google_calendar' = 'google_calendar'
  ): Promise<OAuthTokenRecord | null> {
    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      try {
        const rows = await googleSheetsClient.getAllRows<OAuthTokenRecord>(SHEET_NAMES.OAUTH_TOKENS);
        const match = rows.find((r) => r.workspaceId === workspaceId && r.provider === provider);
        if (match) return this.decryptOAuthTokens(match);
      } catch (err) {
        // Fall back to local store
      }
    }
    const store = readLocalStore();
    const match = (store.oauthTokens || []).find((t) => t.workspaceId === workspaceId && t.provider === provider) || null;
    return match ? this.decryptOAuthTokens(match) : null;
  }

  public async saveOAuthTokens(tokenRecord: OAuthTokenRecord): Promise<void> {
    // Encrypt sensitive token fields before persisting to storage or Google Sheets
    const encryptedRecord: OAuthTokenRecord = {
      ...tokenRecord,
      provider: tokenRecord.provider || 'google_calendar',
      accessToken: encryptSecret(tokenRecord.accessToken) || tokenRecord.accessToken,
      refreshToken: tokenRecord.refreshToken ? (encryptSecret(tokenRecord.refreshToken) || tokenRecord.refreshToken) : undefined,
    };
    const store = readLocalStore();
    if (!store.oauthTokens) store.oauthTokens = [];
    const idx = store.oauthTokens.findIndex(
      (t) => t.workspaceId === encryptedRecord.workspaceId && (t.provider || 'google_calendar') === encryptedRecord.provider
    );
    if (idx >= 0) {
      store.oauthTokens[idx] = encryptedRecord;
    } else {
      store.oauthTokens.push(encryptedRecord);
    }
    writeLocalStore(store);

    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      try {
        await googleSheetsClient.updateRowById(
          SHEET_NAMES.OAUTH_TOKENS,
          encryptedRecord.workspaceId,
          encryptedRecord
        );
      } catch (err) {
        console.error('[CRMRepository] Failed to sync OAuth token to Sheets:', err);
      }
    }
  }

  public async deleteOAuthTokens(
    workspaceId: string,
    provider: 'google_calendar' = 'google_calendar'
  ): Promise<void> {
    const store = readLocalStore();
    if (store.oauthTokens) {
      store.oauthTokens = store.oauthTokens.filter(
        (t) => !(t.workspaceId === workspaceId && t.provider === provider)
      );
      writeLocalStore(store);
    }
    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      try {
        await googleSheetsClient.deleteRowById(SHEET_NAMES.OAUTH_TOKENS, workspaceId);
      } catch (err) {
        console.warn('[CRMRepository] Failed to remove OAuth token row in Sheets:', err);
      }
    }
  }

  /**
   * One-click push to upload all local store records directly into Google Sheets
   */
  public async exportAllToGoogleSheets(): Promise<{ success: boolean; rowsExported: number; error?: string }> {
    if (!isGoogleSheetsConfigured() || !googleSheetsClient.isReady()) {
      return { success: false, rowsExported: 0, error: 'Google Sheets credentials not configured.' };
    }

    try {
      await googleSheetsClient.initializeDatabase();
      const store = readLocalStore();
      let count = 0;

      for (const ws of store.workspaces) {
        await googleSheetsClient.appendRow(SHEET_NAMES.WORKSPACES, ws);
        count++;
      }
      for (const m of store.members) {
        await googleSheetsClient.appendRow(SHEET_NAMES.MEMBERS, m);
      }
      for (const p of store.pipelines) {
        await googleSheetsClient.appendRow(SHEET_NAMES.PIPELINES, p);
      }
      for (const s of store.stages) {
        await googleSheetsClient.appendRow(SHEET_NAMES.STAGES, s);
      }
      for (const l of store.leads) {
        await googleSheetsClient.appendRow(SHEET_NAMES.LEADS, l);
        count++;
      }
      for (const c of store.customers) {
        await googleSheetsClient.appendRow(SHEET_NAMES.CUSTOMERS, c);
        count++;
      }
      for (const t of store.tasks) {
        await googleSheetsClient.appendRow(SHEET_NAMES.TASKS, t);
        count++;
      }
      for (const a of store.activities) {
        await googleSheetsClient.appendRow(SHEET_NAMES.ACTIVITIES, a);
      }
      for (const a of store.automations) {
        await googleSheetsClient.appendRow(SHEET_NAMES.AUTOMATIONS, a);
      }
      for (const et of store.emailTemplates) {
        await googleSheetsClient.appendRow(SHEET_NAMES.EMAIL_TEMPLATES, et);
      }

      return { success: true, rowsExported: count };
    } catch (err: any) {
      return { success: false, rowsExported: 0, error: err.message };
    }
  }

  public async getWorkspaceCredentials(workspaceId: string): Promise<any | null> {
    const store = readLocalStore();
    return store.workspaceCredentials?.[workspaceId] || null;
  }

  public async saveWorkspaceCredentials(workspaceId: string, creds: any): Promise<void> {
    const store = readLocalStore();
    if (!store.workspaceCredentials) {
      store.workspaceCredentials = {};
    }
    store.workspaceCredentials[workspaceId] = creds;
    writeLocalStore(store);
  }

  // --- COMMUNICATION HUB & CUSTOMER MESSAGING FOUNDATION ---

  public async getConversations(
    workspaceId: string,
    options?: {
      channel?: string;
      status?: string;
      search?: string;
      employeeId?: string;
    }
  ): Promise<CommunicationConversation[]> {
    const store = readLocalStore();
    let list = (store.conversations || []).filter((c) => c.workspaceId === workspaceId);

    if (options?.channel && options.channel !== 'all') {
      list = list.filter((c) => c.channel === options.channel);
    }
    if (options?.status && options.status !== 'all') {
      list = list.filter((c) => c.status === options.status);
    }
    if (options?.employeeId) {
      list = list.filter((c) => c.assignedEmployeeId === options.employeeId);
    }
    if (options?.search) {
      const q = options.search.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.customerName?.toLowerCase().includes(q) ||
          c.customerPhone?.toLowerCase().includes(q) ||
          c.customerEmail?.toLowerCase().includes(q) ||
          c.lastMessagePreview?.toLowerCase().includes(q)
      );
    }

    return list.sort((a, b) => new Date(b.lastMessageAt || b.updatedAt).getTime() - new Date(a.lastMessageAt || a.updatedAt).getTime());
  }

  public async getConversationById(workspaceId: string, conversationId: string): Promise<CommunicationConversation | null> {
    const store = readLocalStore();
    return (store.conversations || []).find((c) => c.id === conversationId && c.workspaceId === workspaceId) || null;
  }

  public async createConversation(
    workspaceId: string,
    data: Omit<CommunicationConversation, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<CommunicationConversation> {
    const store = readLocalStore();
    if (!store.conversations) store.conversations = [];

    const now = new Date().toISOString();
    const newConv: CommunicationConversation = {
      ...data,
      id: `conv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      workspaceId,
      createdAt: now,
      updatedAt: now,
    };

    store.conversations.unshift(newConv);
    writeLocalStore(store);
    return newConv;
  }

  public async updateConversation(
    workspaceId: string,
    conversationId: string,
    updates: Partial<CommunicationConversation>
  ): Promise<CommunicationConversation | null> {
    const store = readLocalStore();
    if (!store.conversations) store.conversations = [];

    const idx = store.conversations.findIndex((c) => c.id === conversationId && c.workspaceId === workspaceId);
    if (idx === -1) return null;

    const updated: CommunicationConversation = {
      ...store.conversations[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    store.conversations[idx] = updated;
    writeLocalStore(store);
    return updated;
  }

  public async getMessages(workspaceId: string, conversationId: string): Promise<CommunicationMessage[]> {
    const store = readLocalStore();
    const list = (store.communicationMessages || []).filter(
      (m) => m.workspaceId === workspaceId && m.conversationId === conversationId
    );
    return list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  public async getCustomerMessages(workspaceId: string, customerId: string): Promise<CommunicationMessage[]> {
    const store = readLocalStore();
    const list = (store.communicationMessages || []).filter(
      (m) => m.workspaceId === workspaceId && m.customerId === customerId
    );
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async createMessage(
    workspaceId: string,
    data: Omit<CommunicationMessage, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<CommunicationMessage> {
    const store = readLocalStore();
    if (!store.communicationMessages) store.communicationMessages = [];

    const now = new Date().toISOString();
    const newMsg: CommunicationMessage = {
      ...data,
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      workspaceId,
      createdAt: now,
      updatedAt: now,
    };

    store.communicationMessages.push(newMsg);

    // Update parent conversation preview if conversation exists
    if (data.conversationId && store.conversations) {
      const convIdx = store.conversations.findIndex((c) => c.id === data.conversationId && c.workspaceId === workspaceId);
      if (convIdx !== -1) {
        store.conversations[convIdx] = {
          ...store.conversations[convIdx],
          lastMessageAt: now,
          lastMessagePreview: data.content.substring(0, 120),
          lastMessageDirection: data.direction,
          updatedAt: now,
        };
      }
    }

    writeLocalStore(store);
    return newMsg;
  }

  public async updateMessage(
    workspaceId: string,
    messageId: string,
    updates: Partial<CommunicationMessage>
  ): Promise<CommunicationMessage | null> {
    const store = readLocalStore();
    if (!store.communicationMessages) store.communicationMessages = [];

    const idx = store.communicationMessages.findIndex((m) => m.id === messageId && m.workspaceId === workspaceId);
    if (idx === -1) return null;

    const updated: CommunicationMessage = {
      ...store.communicationMessages[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    store.communicationMessages[idx] = updated;
    writeLocalStore(store);
    return updated;
  }

  public async getCommunicationTemplates(
    workspaceId: string,
    channel?: string
  ): Promise<CommunicationTemplate[]> {
    const store = readLocalStore();
    let list = (store.communicationTemplates || []).filter(
      (t) => t.workspaceId === workspaceId || t.workspaceId === 'ws-default'
    );

    if (channel && channel !== 'all') {
      list = list.filter((t) => t.channel === channel);
    }

    return list.sort((a, b) => a.name.localeCompare(b.name));
  }

  public async createCommunicationTemplate(
    workspaceId: string,
    data: Omit<CommunicationTemplate, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<CommunicationTemplate> {
    const store = readLocalStore();
    if (!store.communicationTemplates) store.communicationTemplates = [];

    const now = new Date().toISOString();
    const newTmpl: CommunicationTemplate = {
      ...data,
      id: `tmpl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      workspaceId,
      createdAt: now,
      updatedAt: now,
    };

    store.communicationTemplates.push(newTmpl);
    writeLocalStore(store);
    return newTmpl;
  }

  public async updateCommunicationTemplate(
    workspaceId: string,
    id: string,
    updates: Partial<CommunicationTemplate>
  ): Promise<CommunicationTemplate | null> {
    const store = readLocalStore();
    if (!store.communicationTemplates) store.communicationTemplates = [];

    const idx = store.communicationTemplates.findIndex((t) => t.id === id && (t.workspaceId === workspaceId || t.workspaceId === 'ws-default'));
    if (idx === -1) return null;

    const updated: CommunicationTemplate = {
      ...store.communicationTemplates[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    store.communicationTemplates[idx] = updated;
    writeLocalStore(store);
    return updated;
  }

  public async deleteCommunicationTemplate(workspaceId: string, id: string): Promise<boolean> {
    const store = readLocalStore();
    if (!store.communicationTemplates) return false;

    const initialLen = store.communicationTemplates.length;
    store.communicationTemplates = store.communicationTemplates.filter(
      (t) => !(t.id === id && (t.workspaceId === workspaceId || t.workspaceId === 'ws-default'))
    );

    if (store.communicationTemplates.length === initialLen) return false;
    writeLocalStore(store);
    return true;
  }

  public async getCommunicationSettings(workspaceId: string): Promise<CommunicationSettings> {
    const store = readLocalStore();
    const found = store.communicationSettings?.[workspaceId];
    if (found) return found;

    // Return default unconfigured settings showing MSG91 as upcoming provider
    return {
      workspaceId,
      whatsapp: {
        provider: 'msg91',
        isConfigured: false,
        status: 'coming_soon',
        senderNumber: '',
        authKeyPlaceholder: '',
      },
      sms: {
        provider: 'msg91',
        isConfigured: false,
        status: 'coming_soon',
        senderId: '',
        dltEntityId: '',
      },
      email: {
        provider: 'smtp',
        isConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER),
        fromEmail: process.env.SMTP_USER || '',
        fromName: 'Developster CRM',
      },
      webhook: {
        inboundUrl: `/api/communication/webhook`,
        secretConfigured: false,
      },
      updatedAt: new Date().toISOString(),
    };
  }

  public async saveCommunicationSettings(
    workspaceId: string,
    settings: Partial<CommunicationSettings>
  ): Promise<CommunicationSettings> {
    const store = readLocalStore();
    if (!store.communicationSettings) store.communicationSettings = {};

    const current = await this.getCommunicationSettings(workspaceId);
    const updated: CommunicationSettings = {
      ...current,
      ...settings,
      workspaceId,
      updatedAt: new Date().toISOString(),
    };

    store.communicationSettings[workspaceId] = updated;
    writeLocalStore(store);
    return updated;
  }

  public async getCustomerTimeline(workspaceId: string, customerId: string): Promise<CustomerTimelineItem[]> {
    const store = readLocalStore();
    const items: CustomerTimelineItem[] = [];

    // 1. Communication messages (WhatsApp, SMS, Email drafts/dispatches)
    const messages = (store.communicationMessages || []).filter(
      (m) => m.workspaceId === workspaceId && m.customerId === customerId
    );
    for (const msg of messages) {
      items.push({
        id: msg.id,
        type: msg.channel,
        title: `${msg.channel.toUpperCase()} (${msg.direction === 'inbound' ? 'Inbound' : 'Outbound'})`,
        content: msg.content,
        authorName: msg.senderName || 'Agent',
        status: msg.status,
        channel: msg.channel,
        recipient: msg.recipient,
        direction: msg.direction,
        metadata: msg.metadata,
        createdAt: msg.createdAt,
      });
    }

    // 2. Customer activities (Calls, Notes, Stage changes)
    const customer = (store.customers || []).find((c) => c.id === customerId && c.workspaceId === workspaceId);
    if (customer) {
      // Find leads associated with this customer
      const associatedLeadIds = new Set<string>();
      (store.leads || []).forEach((l) => {
        if (
          l.workspaceId === workspaceId &&
          (l.contactName?.toLowerCase() === customer.name?.toLowerCase() ||
           l.email?.toLowerCase() === customer.email?.toLowerCase() ||
           l.company?.toLowerCase() === customer.company?.toLowerCase())
        ) {
          associatedLeadIds.add(l.id);
        }
      });

      const relevantActivities = (store.activities || []).filter(
        (a) => a.workspaceId === workspaceId && (associatedLeadIds.has(a.leadId) || (a.metadata && a.metadata.customerId === customerId))
      );

      for (const act of relevantActivities) {
        if (act.type === 'call' || act.type === 'note' || act.type === 'email' || act.type === 'whatsapp' || act.type === 'sms' || act.type === 'purchase' || act.type === 'checkout' || act.type === 'cart_activity' || act.type === 'website_visit') {
          // Avoid duplicate email/whatsapp items if already in messages
          if (!items.some((item) => item.id === act.id || item.createdAt === act.createdAt)) {
            items.push({
              id: act.id,
              type: act.type as any,
              title: act.title || act.type.toUpperCase(),
              content: act.description,
              authorName: act.authorName || 'Team Member',
              createdAt: act.createdAt,
              metadata: act.metadata,
            });
          }
        }
      }
    }

    // 3. Pulse Events disabled for standalone 3W PACKMARK CRM

    // Sort descending by timestamp
    return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async bulkCreateLeads(workspaceId: string, leadsInput: Partial<Lead>[]): Promise<Lead[]> {
    if (!leadsInput || leadsInput.length === 0) return [];
    const now = new Date().toISOString();

    const createdLeads: Lead[] = leadsInput.map((input, idx) => {
      const id = input.id || `lead-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`;
      const company = (input.company || input.contactName || 'Unknown Company').trim();
      const contactName = (input.contactName || input.company || 'Primary Contact').trim();
      return {
        id,
        workspaceId,
        title: input.title || `${company} Opportunity`,
        contactName,
        email: input.email || '',
        phone: input.phone || '',
        company,
        city: input.city || '',
        state: input.state || '',
        leadSource: input.leadSource || 'Cold Call',
        source: input.source || input.leadSource || 'Cold Call',
        notes: input.notes || '',
        products: input.products,
        lineItems: input.lineItems || input.products,
        wonAt: input.wonAt,
        value: Number(input.value) || 0,
        pipelineId: input.pipelineId || 'pipe-sales',
        stageId: input.stageId || 'stg-new-lead',
        ownerId: input.ownerId || 'mem-1',
        priority: input.priority || 'medium',
        status: input.status || 'New',
        expectedCloseDate: input.expectedCloseDate || new Date(Date.now() + 30 * 86400_000).toISOString().split('T')[0],
        closingProbability: Number(input.closingProbability) || 10,
        tags: Array.isArray(input.tags) ? input.tags : [],
        createdAt: now,
        updatedAt: now,
      };
    });

    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      const CHUNK_SIZE = 500;
      for (let i = 0; i < createdLeads.length; i += CHUNK_SIZE) {
        const chunk = createdLeads.slice(i, i + CHUNK_SIZE);
        await googleSheetsClient.appendRows(SHEET_NAMES.LEADS, chunk);
      }
    }

    const store = readLocalStore();
    store.leads.push(...createdLeads);
    writeLocalStore(store);

    return createdLeads;
  }

  // --- AUDIT LOGGING SERVICE ---
  public async logAudit(
    workspaceId: string,
    entry: {
      userId: string;
      userName: string;
      action: string;
      details?: string;
    }
  ): Promise<AuditLogEntry> {
    const fullEntry: AuditLogEntry = {
      id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      workspaceId,
      userId: entry.userId,
      userName: entry.userName,
      action: entry.action,
      details: entry.details ? String(entry.details).slice(0, 1000) : '',
      createdAt: new Date().toISOString(),
    };

    const store = readLocalStore();
    if (!store.auditLogs) store.auditLogs = [];
    store.auditLogs.unshift(fullEntry);
    if (store.auditLogs.length > 500) {
      store.auditLogs = store.auditLogs.slice(0, 500);
    }
    writeLocalStore(store);

    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      try {
        await googleSheetsClient.appendRow(SHEET_NAMES.AUDIT_LOGS, fullEntry);
      } catch (err) {
        console.warn('[CRMRepository] Failed to sync audit log to Sheets:', err);
      }
    }

    return fullEntry;
  }

  public async getAuditLogs(workspaceId: string, limit = 100): Promise<AuditLogEntry[]> {
    if (isGoogleSheetsConfigured() && googleSheetsClient.isReady()) {
      try {
        const rows = await googleSheetsClient.getAllRows<AuditLogEntry>(SHEET_NAMES.AUDIT_LOGS);
        return rows
          .filter((r) => r.workspaceId === workspaceId)
          .slice(-limit)
          .reverse();
      } catch (err) {
        // Fall back to local store
      }
    }
    const store = readLocalStore();
    return (store.auditLogs || [])
      .filter((a) => a.workspaceId === workspaceId)
      .slice(0, limit);
  }
}

export const crmRepo = new CRMRepository();
