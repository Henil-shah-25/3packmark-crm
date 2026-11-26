import test from 'node:test';
import assert from 'node:assert/strict';

// Initialize session test environment
if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = 'test-session-secret-security-hardening-2026';
}
if (!process.env.ADMIN_EMAIL) {
  process.env.ADMIN_EMAIL = 'admin@developster.com';
}
if (!process.env.ADMIN_PASSWORD) {
  process.env.ADMIN_PASSWORD = 'developster_secret_2026';
}

import {
  aiGateway,
  createSystemExecutionContext,
  isAuthorizedSystemContext,
  normalizeUserRole,
  validateExecutionContextSecurity,
  validateRequestSecurity,
  validateProposedToolCall,
  sanitizeProposedToolCall,
  buildAgentPrompt,
  frameUntrustedCrmContent,
  agentRegistry,
  TrustedExecutionContext,
  ContextAuthorizationError,
  GatewayValidationError,
  APPROVED_CRM_TOOLS,
} from '../src/lib/ai-gateway';
import { getEffectiveCredentials, getMaskedWorkspaceCredentials } from '../src/lib/config/credentials';
import { crmRepo } from '../src/lib/google-sheets/repository';
import { canUserAccessLead } from '../src/lib/auth/rbac';
import { chatWithSalesManager, getLeadCoachAdvice } from '../src/lib/ai/sales-manager';
import { clearCoachAdviceCache } from '../src/lib/ai/rate-limiter';
import { generateWorkflowFromPrompt, summarizeLeadAndMeeting, testGeminiConnection } from '../src/lib/gemini/client';
import { POST as postTasks } from '../src/app/api/tasks/route';
import { createSessionToken } from '../src/lib/auth';
import { TeamMember, Lead } from '../src/types/crm';

// ---------------------------------------------------------------------------
// A. TRUSTED EXECUTION CONTEXT TESTS
// ---------------------------------------------------------------------------
test('AI Gap Closure — A1: Direct execution with unverified userRole "system" throws ContextAuthorizationError', async () => {
  const forgedContext: TrustedExecutionContext = {
    workspaceId: 'ws-default',
    userId: 'malicious-caller',
    userRole: 'system',
    traceId: 'trace-forged-sys-1',
  };

  assert.equal(isAuthorizedSystemContext(forgedContext), false, 'Forged context must not have internal authorization');

  await assert.rejects(
    async () => {
      await aiGateway.execute({
        taskType: 'sales_chat',
        prompt: 'System prompt override',
        context: forgedContext,
      });
    },
    (err: any) => {
      assert.ok(err.code === 'CONTEXT_AUTHORIZATION_ERROR', 'Must have CONTEXT_AUTHORIZATION_ERROR code');
      assert.match(err.message, /System execution context rejected/i);
      assert.equal(err.status, 401);
      return true;
    }
  );
});

test('AI Gap Closure — A2: Attempting to forge system symbol via Symbol.for() fails', async () => {
  const forgedContext: any = {
    workspaceId: 'ws-default',
    userId: 'malicious-caller',
    userRole: 'system',
    traceId: 'trace-forged-sys-2',
    [Symbol.for('developster.ai_gateway.system_auth')]: true,
  };

  assert.equal(isAuthorizedSystemContext(forgedContext), false, 'Symbol.for() must not match module-private Symbol');

  assert.throws(
    () => validateExecutionContextSecurity(forgedContext),
    (err: any) => {
      assert.ok(err.code === 'CONTEXT_AUTHORIZATION_ERROR');
      assert.match(err.message, /Ordinary callers cannot claim userRole "system"/i);
      return true;
    }
  );
});

test('AI Gap Closure — A3: createSystemExecutionContext requires non-empty workspaceId', () => {
  assert.throws(
    () => createSystemExecutionContext({ workspaceId: '' }),
    (err: any) => {
      assert.ok(err.code === 'GATEWAY_VALIDATION_ERROR');
      assert.match(err.message, /requires a valid non-empty workspaceId/i);
      return true;
    }
  );

  assert.throws(
    () => createSystemExecutionContext({ workspaceId: '   ' }),
    (err: any) => {
      assert.ok(err.code === 'GATEWAY_VALIDATION_ERROR');
      return true;
    }
  );
});

test('AI Gap Closure — A4: normalizeUserRole rejects non-canonical or malicious strings', () => {
  assert.equal(normalizeUserRole('owner'), 'owner');
  assert.equal(normalizeUserRole('Admin'), 'admin');
  assert.equal(normalizeUserRole('Manager'), 'manager');
  assert.equal(normalizeUserRole('Member'), 'member');
  assert.equal(normalizeUserRole('Read-only'), 'read-only');
  assert.equal(normalizeUserRole('system'), 'system');

  // Negative tests
  assert.equal(normalizeUserRole('root'), null);
  assert.equal(normalizeUserRole('superadmin'), null);
  assert.equal(normalizeUserRole('developer'), null);
  assert.equal(normalizeUserRole(''), null);
  assert.equal(normalizeUserRole(123 as any), null);
  assert.equal(normalizeUserRole(null), null);
  assert.equal(normalizeUserRole(undefined), null);
});

test('AI Gap Closure — A5: JSON serialization strictly drops internal system auth symbol', () => {
  const validSystemContext = createSystemExecutionContext({ workspaceId: 'ws-default' });
  assert.equal(isAuthorizedSystemContext(validSystemContext), true);

  // Serialize to JSON and parse back (simulating a client receiving or replaying context)
  const roundtripped = JSON.parse(JSON.stringify(validSystemContext));
  assert.equal(isAuthorizedSystemContext(roundtripped), false, 'Roundtripped JSON context loses private Symbol');

  // When validated, it is rejected because system role lacks the private Symbol
  assert.throws(
    () => validateExecutionContextSecurity(roundtripped),
    (err: any) => {
      assert.ok(err.code === 'CONTEXT_AUTHORIZATION_ERROR');
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// B. TENANT & RECORD-LEVEL ISOLATION TESTS
// ---------------------------------------------------------------------------
test('AI Gap Closure — B1: chatWithSalesManager does not include private lead context if user lacks lead permission', async () => {
  const leads = await crmRepo.getLeads('ws-default');
  const targetLead = leads[0];
  assert.ok(targetLead, 'Must have at least one test lead');

  // Restricted user who does NOT own this lead and has visibility private
  const restrictedUser: TeamMember = {
    id: 'user-restricted-999',
    name: 'Restricted Sales Rep',
    email: 'restricted@developsterhub.com',
    role: 'Member',
    avatar: '',
    status: 'Active',
    assignedLeadsCount: 0,
    workspaceId: 'ws-default',
    permissions: {
      canExportData: false,
      canDeleteDeals: false,
      canManageIntegrations: false,
      canViewAllLeads: false,
      canAssignLeads: false,
      canManageAutomations: false,
    },
  };

  // Create private lead fixture
  const privateLead: Lead = {
    ...targetLead,
    id: 'lead-private-secret-123',
    company: 'SuperSecretCorp',
    contactName: 'SecretContact',
    visibility: 'private',
    ownerId: 'user-other-person',
    createdBy: 'user-other-person',
  };

  assert.equal(canUserAccessLead(restrictedUser, privateLead), false, 'Restricted user must NOT have access to private lead');

  // If chatWithSalesManager is called with @SecretContact by restricted user, it must NOT load private lead context
  const res = await chatWithSalesManager(
    `Tell me about @SecretContact`,
    [],
    'ws-default',
    undefined,
    restrictedUser
  );

  assert.ok(res, 'Chat returns response');
  assert.ok(!res.sourcesUsed.some((s) => s.includes('SuperSecretCorp')), 'Must not leak private lead in sourcesUsed');
});

test('AI Gap Closure — B2: chatWithSalesManager ignores foreign workspace lead ID', async () => {
  const user: TeamMember = {
    id: 'user-1',
    name: 'Standard User',
    email: 'user1@developsterhub.com',
    role: 'Member',
    avatar: '',
    status: 'Active',
    assignedLeadsCount: 1,
    workspaceId: 'ws-default',
  };

  // activeLeadId that does NOT exist in ws-default
  const res = await chatWithSalesManager(
    'Analyze this active lead',
    [],
    'ws-default',
    'lead-from-another-workspace-999',
    user
  );

  assert.ok(res.text, 'Chat returns consultative response');
  assert.ok(!res.sourcesUsed.some((s) => s.includes('lead-from-another-workspace-999')));
});

// ---------------------------------------------------------------------------
// C. TOOL EXECUTION & WRITE PERMISSIONS TESTS
// ---------------------------------------------------------------------------
test('AI Gap Closure — C1: validateProposedToolCall rejects unapproved or dangerous tools', () => {
  assert.throws(
    () => validateProposedToolCall({ name: 'delete_database', arguments: {} }, 'owner'),
    (err: any) => {
      assert.ok(err.code === 'GATEWAY_VALIDATION_ERROR');
      assert.match(err.message, /unknown or unapproved tool/i);
      return true;
    }
  );

  assert.throws(
    () => validateProposedToolCall({ name: 'execute_arbitrary_code', arguments: {} }, 'admin'),
    (err: any) => {
      assert.ok(err.code === 'GATEWAY_VALIDATION_ERROR');
      return true;
    }
  );
});

test('AI Gap Closure — C2: validateProposedToolCall rejects read-only role executing create_task', () => {
  assert.throws(
    () => validateProposedToolCall({ name: 'create_task', arguments: { title: 'New Task' } }, 'read-only'),
    (err: any) => {
      assert.ok(err.code === 'CONTEXT_AUTHORIZATION_ERROR');
      assert.match(err.message, /not authorized to execute tool 'create_task'/i);
      return true;
    }
  );
});

test('AI Gap Closure — C3: sanitizeProposedToolCall strips client/model tenant overrides and binds context', () => {
  const trustedContext: TrustedExecutionContext = {
    workspaceId: 'ws-authoritative-tenant',
    userId: 'user-authoritative-id',
    userRole: 'member',
    traceId: 'trace-sanitize-tool-1',
  };

  const maliciousToolCall = {
    name: 'create_task',
    arguments: {
      title: 'Follow-up Task',
      workspaceId: 'ws-victim-tenant',
      workspace_id: 'ws-victim-tenant-alt',
      userId: 'user-victim-admin',
      user_id: 'user-victim-admin-alt',
      tenantId: 'ws-victim-tenant',
      tenant_id: 'ws-victim-tenant',
      customData: 'legitimate-task-arg',
    },
  };

  const sanitized = sanitizeProposedToolCall(maliciousToolCall, trustedContext);
  assert.equal(sanitized.arguments.workspaceId, 'ws-authoritative-tenant', 'workspaceId bound to trusted context');
  assert.equal(sanitized.arguments.userId, 'user-authoritative-id', 'userId bound to trusted context');
  assert.equal((sanitized.arguments as any).workspace_id, undefined, 'workspace_id stripped');
  assert.equal((sanitized.arguments as any).user_id, undefined, 'user_id stripped');
  assert.equal((sanitized.arguments as any).tenantId, undefined, 'tenantId stripped');
  assert.equal((sanitized.arguments as any).tenant_id, undefined, 'tenant_id stripped');
  assert.equal(sanitized.arguments.customData, 'legitimate-task-arg');
});

test('AI Gap Closure — C4: POST /api/tasks rejects Read-only users with 403 Forbidden', async () => {
  // kabir.joshi@developsterhub.com has role 'Read-only' in ws-default
  const readOnlyToken = createSessionToken('kabir.joshi@developsterhub.com');

  const req = new Request('http://localhost:3000/api/tasks', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `crm_session=${readOnlyToken}`,
    },
    body: JSON.stringify({
      workspaceId: 'ws-default',
      title: 'Attacker task attempt from read-only user',
      dueDate: '2026-12-31',
    }),
  });

  const res = await postTasks(req);
  assert.equal(res.status, 403, 'Read-only user must be rejected with 403');
  const data = await res.json();
  assert.match(data.error, /Viewers cannot create tasks/i);
});

test('AI Gap Closure — C5: POST /api/tasks strictly protects tenant isolation against cross-tenant targets', async () => {
  const userToken = createSessionToken('aarav.mehta@developsterhub.com'); // Member in ws-default

  // Attacker tries to create task in a foreign workspace they do not belong to
  const reqCross = new Request('http://localhost:3000/api/tasks', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `crm_session=${userToken}`,
    },
    body: JSON.stringify({
      workspaceId: 'ws-foreign-victim',
      title: 'Cross tenant task creation attempt',
      dueDate: '2026-12-31',
    }),
  });

  const resCross = await postTasks(reqCross);
  assert.equal(resCross.status, 401, 'Cross-workspace attempt rejected with 401 (not a member of foreign workspace)');

  // Legitimate creation in own workspace succeeds and binds ws-default
  const reqOwn = new Request('http://localhost:3000/api/tasks', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `crm_session=${userToken}`,
    },
    body: JSON.stringify({
      workspaceId: 'ws-default',
      title: 'Valid task creation by member',
      dueDate: '2026-12-31',
    }),
  });

  const resOwn = await postTasks(reqOwn);
  assert.equal(resOwn.status, 201, 'Valid creation returns 201');
  const created = await resOwn.json();
  assert.equal(created.workspaceId, 'ws-default');
});

// ---------------------------------------------------------------------------
// D. FUNCTIONAL & PROVIDER FAILURE COVERAGE (Mocked vs Fallback)
// ---------------------------------------------------------------------------
test('AI Gap Closure — D1: chatWithSalesManager provides consultative fallback when provider fails', async () => {
  const originalKey = process.env.GEMINI_API_KEY;
  try {
    delete process.env.GEMINI_API_KEY; // Simulate missing key / provider down

    const result = await chatWithSalesManager('What should be my focus today?', []);
    assert.ok(result.text.includes("Today's Sales Priorities"), 'Returns deterministic consultative fallback');
    assert.ok(result.proposedActions && result.proposedActions.length > 0, 'Includes human-in-the-loop proposed action');
    assert.equal(result.proposedActions[0].type, 'create_task');
  } finally {
    if (originalKey) process.env.GEMINI_API_KEY = originalKey;
  }
});

test('AI Gap Closure — D2: getLeadCoachAdvice provides heuristic fallback when provider fails', async () => {
  clearCoachAdviceCache();
  const originalKey = process.env.GEMINI_API_KEY;
  const leads = await crmRepo.getLeads('ws-default');
  const testLead = leads[0];
  assert.ok(testLead);

  try {
    delete process.env.GEMINI_API_KEY; // Simulate offline fallback

    const advice = await getLeadCoachAdvice(testLead.id, 'ws-default');
    assert.ok(advice.assessment, 'Fallback advice contains assessment');
    assert.ok(advice.temperature, 'Fallback contains temperature');
    assert.ok(typeof advice.confidence === 'number', 'Fallback contains confidence');
  } finally {
    if (originalKey) process.env.GEMINI_API_KEY = originalKey;
  }
});

test('AI Gap Closure — D3: generateWorkflowFromPrompt provides heuristic fallback when provider fails', async () => {
  const originalKey = process.env.GEMINI_API_KEY;
  try {
    delete process.env.GEMINI_API_KEY;

    const stages = await crmRepo.getStages('ws-default');
    const members = await crmRepo.getMembers('ws-default');

    const workflow = await generateWorkflowFromPrompt('When deal is won notify team', stages, members);
    assert.ok(workflow.name, 'Fallback workflow has name');
    assert.ok(workflow.nodes && workflow.nodes.length > 0, 'Fallback workflow has nodes');
    assert.ok(workflow.edges && workflow.edges.length > 0, 'Fallback workflow has edges');
  } finally {
    if (originalKey) process.env.GEMINI_API_KEY = originalKey;
  }
});

test('AI Gap Closure — D4: summarizeLeadAndMeeting provides deterministic summary when provider fails', async () => {
  const originalKey = process.env.GEMINI_API_KEY;
  try {
    delete process.env.GEMINI_API_KEY;

    const leads = await crmRepo.getLeads('ws-default');
    const summary = await summarizeLeadAndMeeting(leads[0]);
    assert.ok(summary.summary, 'Summary generated');
    assert.ok(summary.recommendedActions.length >= 2, 'Recommended actions provided');
  } finally {
    if (originalKey) process.env.GEMINI_API_KEY = originalKey;
  }
});

test('AI Gap Closure — D5: aiGateway.execute rejects invalid agentId', async () => {
  const context = createSystemExecutionContext({ workspaceId: 'ws-default' });

  await assert.rejects(
    async () => {
      await aiGateway.execute({
        agentId: 'non_existent_fake_agent' as any,
        taskType: 'sales_chat',
        prompt: 'Hello',
        context,
      });
    },
    (err: any) => {
      assert.ok(err.code === 'GATEWAY_VALIDATION_ERROR', 'Error must be GATEWAY_VALIDATION_ERROR');
      assert.match(err.message, /is not registered/i);
      return true;
    }
  );
});

test('AI Gap Closure — D6: validateRequestSecurity rejects unapproved model override', () => {
  const context = createSystemExecutionContext({ workspaceId: 'ws-default' });

  assert.throws(
    () => {
      validateRequestSecurity(
        {
          taskType: 'sales_chat',
          prompt: 'Hello',
          context,
        },
        'gemini-3.8-flash' // Disallowed model override
      );
    },
    (err: any) => {
      assert.ok(err.code === 'GATEWAY_VALIDATION_ERROR');
      assert.match(err.message, /not approved for use/i);
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// E. AGENT REGISTRY DISCREPANCY RESOLUTION & VERIFICATION
// ---------------------------------------------------------------------------
test('AI Gap Closure — E1: Canonical agent registry contains exact approved personas', () => {
  const allAgents = agentRegistry.getAllAgents();
  const registeredIds = allAgents.map((a) => a.id);

  // 4 canonical CRM agents + 1 system probe agent
  assert.deepEqual(
    registeredIds.sort(),
    [
      'executive_briefing_agent',
      'lead_diagnostic_agent',
      'sales_intelligence_agent',
      'system_probe_agent',
      'workflow_architect_agent',
    ].sort()
  );

  // Verify that older documentation aliases (sales_coach_agent, workflow_synthesis_agent) are NOT registered
  assert.equal(registeredIds.includes('sales_coach_agent' as any), false);
  assert.equal(registeredIds.includes('workflow_synthesis_agent' as any), false);

  // Check versioning
  const salesAgent = agentRegistry.getAgent('sales_intelligence_agent');
  assert.ok(salesAgent);
  assert.equal(salesAgent.version, '1.0.0');
  const leadAgent = agentRegistry.getAgent('lead_diagnostic_agent');
  assert.ok(leadAgent);
  assert.equal(leadAgent.version, '1.0.0');
  const briefingAgent = agentRegistry.getAgent('executive_briefing_agent');
  assert.ok(briefingAgent);
  assert.equal(briefingAgent.version, '1.0.0');
  const workflowAgent = agentRegistry.getAgent('workflow_architect_agent');
  assert.ok(workflowAgent);
  assert.equal(workflowAgent.version, '1.0.0');
});

// ---------------------------------------------------------------------------
// F. LEGACY MODEL SETTINGS CLEANUP VERIFICATION
// ---------------------------------------------------------------------------
test('AI Gap Closure — F1: getEffectiveCredentials resolves strictly approved gemini-2.5-flash', async () => {
  const { credentials } = await getEffectiveCredentials('ws-default');
  assert.equal(credentials.geminiModel, 'gemini-2.5-flash', 'Must resolve to gemini-2.5-flash');
});

test('AI Gap Closure — F2: getMaskedWorkspaceCredentials renders strictly approved gemini-2.5-flash', async () => {
  const masked = await getMaskedWorkspaceCredentials('ws-default');
  assert.equal(masked.gemini.model, 'gemini-2.5-flash', 'UI model must render gemini-2.5-flash');
});
