export const SHEET_NAMES = {
  WORKSPACES: 'Workspaces',
  MEMBERS: 'Members',
  PIPELINES: 'Pipelines',
  STAGES: 'Stages',
  LEADS: 'Leads',
  CUSTOMERS: 'Customers',
  TASKS: 'Tasks',
  ACTIVITIES: 'Activities',
  AUTOMATIONS: 'Automations',
  AUTOMATION_RUNS: 'AutomationRuns',
  SCHEDULED_JOBS: 'ScheduledJobs',
  EMAIL_TEMPLATES: 'EmailTemplates',
  EMAIL_LOGS: 'EmailLogs',
  CALENDAR_EVENTS: 'CalendarEvents',
  CUSTOM_FIELDS: 'CustomFields',
  IMPORT_JOBS: 'ImportJobs',
  AUDIT_LOGS: 'AuditLogs',
  OAUTH_TOKENS: 'OAuthTokens',
  PULSE_WEBSITES: 'PulseWebsites',
  PULSE_FUNNELS: 'PulseFunnels',
  PULSE_SEGMENTS: 'PulseSegments',
  PULSE_EVENTS: 'PulseEvents',
  PULSE_DAILY_ROLLUPS: 'PulseDailyRollups',
  AI_CHATS: 'AI_CHATS',
  PRODUCTS: 'Products',
} as const;

export const SHEET_HEADERS: Record<string, string[]> = {
  [SHEET_NAMES.WORKSPACES]: [
    'id', 'name', 'slug', 'industry', 'currency', 'timezone', 'logoUrl', 'monthlyTarget',
    'companyName', 'senderName', 'senderEmail', 'phone', 'website', 'portfolioUrl', 'emailSignature', 'defaultCountryCode',
    'tallyUrl', 'tallyCompanyName', 'tallySalesLedger', 'tallyMode',
    'sellerAddress', 'sellerGstin', 'sellerState', 'sellerCin', 'sellerPan', 'sellerContact',
    'bankName', 'bankAccountNo', 'bankBranchIfsc',
    'createdAt', 'updatedAt'
  ],
  [SHEET_NAMES.MEMBERS]: [
    'id', 'workspaceId', 'name', 'email', 'role', 'password', 'avatar', 'color', 'department', 'assignedPipelineIds'
  ],
  [SHEET_NAMES.PIPELINES]: [
    'id', 'workspaceId', 'name', 'isDefault', 'order', 'createdAt'
  ],
  [SHEET_NAMES.STAGES]: [
    'id', 'workspaceId', 'pipelineId', 'name', 'order', 'color', 'probability', 'isWon', 'isLost', 'description'
  ],
  [SHEET_NAMES.LEADS]: [
    'id', 'workspaceId', 'title', 'contactName', 'email', 'phone', 'company', 'value', 'pipelineId', 'stageId',
    'ownerId', 'priority', 'status', 'source', 'expectedCloseDate', 'closingProbability', 'lossReason',
    'wonAt', 'lostAt', 'tags', 'notesCount', 'customFieldsJson',
    'alternatePhone', 'whatsappNumber', 'designation', 'industry', 'companySize', 'website', 'city', 'state', 'country', 'address', 'gstTaxId', 'leadSource', 'servicesInterested', 'estimatedBudget', 'notes', 'leadNotesJson',
    'createdAt', 'updatedAt',
    'leadScore', 'leadTemperature', 'scoreReasonsJson',
    'isDecisionMakerReached', 'callSubStatus', 'quotationSubStatus', 'creditTerms', 'productsJson', 'lineItems',
    'lastAutomatedEmailStage', 'lastAutomatedEmailAt'
  ],
  [SHEET_NAMES.CUSTOMERS]: [
    'id', 'workspaceId', 'name', 'company', 'email', 'phone', 'status', 'totalRevenue', 'dealsCount', 'lastContactedAt', 'createdAt'
  ],
  [SHEET_NAMES.TASKS]: [
    'id', 'workspaceId', 'leadId', 'dealTitle', 'title', 'description', 'priority', 'dueDate', 'completed', 'completedAt', 'ownerId', 'type', 'queueCategory', 'dueAt', 'status', 'source', 'notes', 'snoozedUntil', 'autoStageTrigger', 'createdAt'
  ],
  [SHEET_NAMES.PRODUCTS]: [
    'id', 'workspaceId', 'sku', 'name', 'category', 'unit', 'moq', 'unitPrice', 'hsnCode', 'createdAt', 'updatedAt'
  ],
  [SHEET_NAMES.ACTIVITIES]: [
    'id', 'workspaceId', 'leadId', 'type', 'title', 'description', 'authorName', 'metadataJson', 'createdAt'
  ],
  [SHEET_NAMES.AUTOMATIONS]: [
    'id', 'workspaceId', 'name', 'description', 'triggerType', 'triggerStageId', 'conditionsJson', 'actionsJson', 'sequenceJson', 'stopConditionsJson', 'sendingWindowJson', 'nodesJson', 'edgesJson', 'isActive', 'executionMode', 'delayMinutes', 'version', 'runCount', 'lastRunAt', 'createdAt', 'updatedAt'
  ],
  [SHEET_NAMES.AUTOMATION_RUNS]: [
    'id', 'workspaceId', 'ruleId', 'ruleName', 'leadId', 'dealTitle', 'status', 'triggerEvent', 'actionsExecutedJson', 'stepsJson', 'log', 'error', 'executedAt'
  ],
  [SHEET_NAMES.SCHEDULED_JOBS]: [
    'id', 'workspaceId', 'ruleId', 'ruleName', 'leadId', 'dealTitle', 'stepId', 'stepNumber', 'actionType', 'actionConfigJson', 'scheduledFor', 'status', 'cancellationReason', 'retryCount', 'maxRetries', 'idempotencyKey', 'result', 'error', 'createdAt', 'executedAt'
  ],
  [SHEET_NAMES.EMAIL_TEMPLATES]: [
    'id', 'workspaceId', 'name', 'subject', 'body', 'variablesJson', 'category', 'plainText', 'isPrebuilt', 'updatedAt', 'createdAt'
  ],
  [SHEET_NAMES.EMAIL_LOGS]: [
    'id', 'workspaceId', 'leadId', 'toEmail', 'subject', 'bodyPreview', 'status', 'templateId', 'sentAt', 'error'
  ],
  [SHEET_NAMES.CALENDAR_EVENTS]: [
    'id', 'workspaceId', 'leadId', 'dealTitle', 'title', 'description', 'startIso', 'endIso', 'timezone', 'attendeesJson', 'meetUrl', 'googleEventId', 'calendarEventUrl', 'conferenceStatus', 'status', 'synced', 'lastSyncAt', 'remindersSentJson', 'createdAt', 'updatedAt'
  ],
  [SHEET_NAMES.CUSTOM_FIELDS]: [
    'id', 'workspaceId', 'targetEntity', 'name', 'fieldKey', 'fieldType', 'optionsJson', 'isRequired', 'createdAt'
  ],
  [SHEET_NAMES.IMPORT_JOBS]: [
    'id', 'workspaceId', 'spreadsheetId', 'sheetName', 'totalRows', 'importedCount', 'updatedCount', 'skippedCount', 'errorsJson', 'createdAt'
  ],
  [SHEET_NAMES.AUDIT_LOGS]: [
    'id', 'workspaceId', 'userId', 'userName', 'action', 'details', 'createdAt'
  ],
  [SHEET_NAMES.OAUTH_TOKENS]: [
    'workspaceId', 'provider', 'accessToken', 'refreshToken', 'expiryDate', 'scope', 'userEmail', 'updatedAt'
  ],
  [SHEET_NAMES.PULSE_WEBSITES]: [
    'id', 'workspaceId', 'siteId', 'name', 'domain', 'whitelistedDomainsJson', 'status', 'snippetInstalled',
    'ecommercePlatform', 'encryptedWebhookSecret', 'eventsCountTotal', 'lastPingAt', 'createdAt', 'updatedAt'
  ],
  [SHEET_NAMES.PULSE_FUNNELS]: [
    'id', 'workspaceId', 'siteId', 'name', 'description', 'timeWindowHours', 'stepsJson', 'createdAt', 'updatedAt'
  ],
  [SHEET_NAMES.PULSE_SEGMENTS]: [
    'id', 'workspaceId', 'siteId', 'name', 'description', 'color', 'matchType', 'rulesJson', 'memberCount',
    'memberVisitorIdsJson', 'memberCustomerIdsJson', 'syncCustomerTags', 'crmTag', 'autoTriggerAutomations',
    'lastEvaluatedAt', 'createdAt', 'updatedAt'
  ],
  [SHEET_NAMES.PULSE_EVENTS]: [
    'id', 'workspaceId', 'siteId', 'platform', 'sourceEventId', 'eventType', 'customerId', 'orderId',
    'amount', 'currency', 'occurredAt', 'processedAt', 'metadataJson'
  ],
  [SHEET_NAMES.PULSE_DAILY_ROLLUPS]: [
    'id', 'workspaceId', 'siteId', 'date', 'eventType', 'currency', 'eventCount',
    'totalRevenue', 'version', 'createdAt', 'updatedAt'
  ],
  [SHEET_NAMES.AI_CHATS]: [
    'id', 'workspaceId', 'userId', 'conversationId', 'title', 'messageId',
    'role', 'content', 'eventType', 'messageOrder', 'isDeleted', 'idempotencyKey',
    'sourcesUsedJson', 'proposedActionsJson', 'createdAt', 'updatedAt'
  ]
};
