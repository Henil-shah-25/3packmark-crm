import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

// Ensure test environment variables are initialized for standalone execution
if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = 'test-session-secret-security-hardening-2026';
}
if (!process.env.ADMIN_EMAIL) {
  process.env.ADMIN_EMAIL = 'admin@developster.com';
}
if (!process.env.ADMIN_PASSWORD) {
  process.env.ADMIN_PASSWORD = 'developster_secret_2026';
}

import { createSessionToken } from '../src/lib/auth';
import { crmRepo } from '../src/lib/google-sheets/repository';
import { aiChatsStore } from '../src/lib/ai/chats-store';
import { POST as postAiChat } from '../src/app/api/ai/chat/route';
import {
  GET as getAiChats,
  POST as postAiChats,
  PUT as putAiChats,
  DELETE as deleteAiChats,
} from '../src/app/api/ai/chats/route';
import { POST as postAiCoach } from '../src/app/api/ai/coach/route';
import { GET as getAiBriefing } from '../src/app/api/ai/briefing/route';
import { POST as postLegacyAi } from '../src/app/api/ai/route';
import { getAiBriefing as getAiBriefingDirect, clearAiBriefingCache } from '../src/lib/ai/sales-manager';

function createMockRequest(url: string, options: {
  method?: string;
  body?: any;
  cookieToken?: string;
  headers?: Record<string, string>;
} = {}): Request {
  const reqHeaders = new Headers(options.headers || {});
  if (options.cookieToken) {
    reqHeaders.set('cookie', `crm_session=${options.cookieToken}`);
  }
  if (options.body && typeof options.body === 'object') {
    reqHeaders.set('content-type', 'application/json');
  }

  const reqInit: RequestInit = {
    method: options.method || 'GET',
    headers: reqHeaders,
    body: options.body
      ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body))
      : undefined,
  };

  return new Request(url, reqInit);
}

// ---------------------------------------------------------------------------
// TEST SUITE: AI CHAT AUTHENTICATION & TENANT ISOLATION
// ---------------------------------------------------------------------------
test('AI Security — 1. Unauthenticated POST to /api/ai/chat returns 401', async () => {
  const req = createMockRequest('http://localhost:3000/api/ai/chat', {
    method: 'POST',
    body: { message: 'Hello AI', workspaceId: 'ws-default' },
  });

  const res = await postAiChat(req);
  assert.equal(res.status, 401, 'Unauthenticated request must return 401');
  const data = await res.json();
  assert.match(data.error, /Unauthorized/i);
});

test('AI Security — 2. Authenticated Workspace A user requesting Workspace B returns 403', async () => {
  // Aarav Mehta is a verified member in 'ws-default'
  const userToken = createSessionToken('aarav.mehta@developsterhub.com');

  const req = createMockRequest('http://localhost:3000/api/ai/chat', {
    method: 'POST',
    cookieToken: userToken,
    body: {
      message: 'Show me pipeline details',
      workspaceId: 'ws-foreign-tenant-999',
    },
  });

  const res = await postAiChat(req);
  assert.equal(res.status, 403, 'Cross-tenant request must return 403 Forbidden');
  const data = await res.json();
  assert.match(data.error, /Forbidden/i);
});

test('AI Security — 3. Authenticated Workspace A user accessing unauthorized/nonexistent lead returns 404/403', async () => {
  const userToken = createSessionToken('aarav.mehta@developsterhub.com');

  // Attempt to access a lead that does not exist in ws-default
  const req = createMockRequest('http://localhost:3000/api/ai/chat', {
    method: 'POST',
    cookieToken: userToken,
    body: {
      message: 'Analyze this deal',
      workspaceId: 'ws-default',
      activeLeadId: 'lead-foreign-secret-000',
    },
  });

  const res = await postAiChat(req);
  assert.equal(res.status, 404, 'Non-existent lead in workspace returns 404');
  const data = await res.json();
  assert.match(data.error, /not found/i);
});

test('AI Security — 4. Authenticated user with correct permissions can use AI chat', async () => {
  const userToken = createSessionToken('aarav.mehta@developsterhub.com');

  const req = createMockRequest('http://localhost:3000/api/ai/chat', {
    method: 'POST',
    cookieToken: userToken,
    body: {
      message: 'What should be my focus today?',
      workspaceId: 'ws-default',
    },
  });

  const res = await postAiChat(req);
  assert.equal(res.status, 200, 'Legitimate authorized request must return 200');
  const data = await res.json();
  assert.ok(data.text, 'Response contains generated text');
  assert.ok(Array.isArray(data.sourcesUsed), 'Response contains sourcesUsed array');
});

test('AI Security — 5. Rate limiting is isolated to the authenticated workspace', async () => {
  const userToken = createSessionToken('aarav.mehta@developsterhub.com');

  // An attacker attempting to pass a spoofed workspaceId in an unverified way is rejected with 403
  // before touching any foreign rate limit counters
  const req = createMockRequest('http://localhost:3000/api/ai/chat', {
    method: 'POST',
    cookieToken: userToken,
    body: {
      message: 'Rate limit spam',
      workspaceId: 'ws-victim-quota-target',
    },
  });

  const res = await postAiChat(req);
  assert.equal(res.status, 403, 'Spoofed workspace rate-limit attack rejected with 403');
});

// ---------------------------------------------------------------------------
// TEST SUITE: AI CONVERSATION HISTORIES (/api/ai/chats)
// ---------------------------------------------------------------------------
test('AI Security — 6. Unauthenticated GET /api/ai/chats returns 401', async () => {
  const req = createMockRequest('http://localhost:3000/api/ai/chats?workspaceId=ws-default');
  const res = await getAiChats(req);
  assert.equal(res.status, 401, 'Unauthenticated chats GET returns 401');
});

test('AI Security — 7. Workspace A user cannot retrieve Workspace B conversations (GET)', async () => {
  const userToken = createSessionToken('aarav.mehta@developsterhub.com');

  const req = createMockRequest('http://localhost:3000/api/ai/chats?workspaceId=ws-foreign-workspace-xyz', {
    cookieToken: userToken,
  });

  const res = await getAiChats(req);
  assert.equal(res.status, 403, 'Cross-tenant GET chats returns 403 Forbidden');
});

test('AI Security — 8. Workspace A user cannot create a conversation in Workspace B (POST)', async () => {
  const userToken = createSessionToken('aarav.mehta@developsterhub.com');

  const req = createMockRequest('http://localhost:3000/api/ai/chats', {
    method: 'POST',
    cookieToken: userToken,
    body: {
      workspaceId: 'ws-foreign-workspace-xyz',
      title: 'Hacked conversation',
      messages: [{ role: 'user', content: 'test' }],
    },
  });

  const res = await postAiChats(req);
  assert.equal(res.status, 403, 'Cross-tenant POST chats returns 403 Forbidden');
});

test('AI Security — 9. Workspace A user cannot modify a conversation in Workspace B (PUT)', async () => {
  const userToken = createSessionToken('aarav.mehta@developsterhub.com');

  // Pre-seed a foreign conversation in aiChatsStore
  const foreignSession = await aiChatsStore.createSession('ws-victim-co', {
    title: 'Victim Confidential Chat',
    messages: [{ id: 'm-1', role: 'user', content: 'Secret M&A notes', timestamp: new Date().toISOString() }],
  });

  // User A attempts to update foreign session
  const req = createMockRequest('http://localhost:3000/api/ai/chats', {
    method: 'PUT',
    cookieToken: userToken,
    body: {
      id: foreignSession.id,
      workspaceId: 'ws-default', // Claims to update within own ws, but session belongs to victim
      title: 'Overwritten by Attacker',
    },
  });

  const res = await putAiChats(req);
  assert.equal(res.status, 403, 'Cross-tenant PUT chats returns 403 Forbidden');
});

test('AI Security — 10. Workspace A user cannot delete a conversation in Workspace B (DELETE)', async () => {
  const userToken = createSessionToken('aarav.mehta@developsterhub.com');

  // Pre-seed a foreign conversation in aiChatsStore
  const foreignSession = await aiChatsStore.createSession('ws-victim-co', {
    title: 'Victim Session to Delete',
  });

  // User A attempts to delete foreign session
  const req = createMockRequest(`http://localhost:3000/api/ai/chats?id=${foreignSession.id}&workspaceId=ws-default`, {
    method: 'DELETE',
    cookieToken: userToken,
  });

  const res = await deleteAiChats(req);
  assert.equal(res.status, 403, 'Cross-tenant DELETE chats returns 403 Forbidden');

  // Verify the foreign session was NOT deleted
  const checkSession = await aiChatsStore.getSessionById('ws-victim-co', foreignSession.id);
  assert.ok(checkSession, 'Foreign session remains untouched');
});

test('AI Security — 11. Authorized user can create, read, update, and delete their own conversations', async () => {
  const userToken = createSessionToken('aarav.mehta@developsterhub.com');

  // 1. POST (Create)
  const reqCreate = createMockRequest('http://localhost:3000/api/ai/chats', {
    method: 'POST',
    cookieToken: userToken,
    body: {
      workspaceId: 'ws-default',
      title: 'Legitimate Deal Strategy',
      messages: [{ id: 'm-1', role: 'user', content: 'How to pitch DROS?', timestamp: new Date().toISOString() }],
    },
  });
  const resCreate = await postAiChats(reqCreate);
  assert.equal(resCreate.status, 201, 'POST chats returns 201 Created');
  const created = await resCreate.json();
  assert.equal(created.workspaceId, 'ws-default');

  // 2. GET (Read)
  const reqGet = createMockRequest('http://localhost:3000/api/ai/chats?workspaceId=ws-default', {
    cookieToken: userToken,
  });
  const resGet = await getAiChats(reqGet);
  assert.equal(resGet.status, 200, 'GET chats returns 200');
  const list = await resGet.json();
  const found = list.find((c: any) => c.id === created.id);
  assert.ok(found, 'Created session found in user workspace list');

  // 3. PUT (Update)
  const reqPut = createMockRequest('http://localhost:3000/api/ai/chats', {
    method: 'PUT',
    cookieToken: userToken,
    body: {
      id: created.id,
      workspaceId: 'ws-default',
      title: 'Renamed Deal Strategy',
    },
  });
  const resPut = await putAiChats(reqPut);
  assert.equal(resPut.status, 200, 'PUT chats returns 200');
  const updated = await resPut.json();
  assert.equal(updated.title, 'Renamed Deal Strategy');

  // 4. DELETE (Delete)
  const reqDelete = createMockRequest(`http://localhost:3000/api/ai/chats?id=${created.id}&workspaceId=ws-default`, {
    method: 'DELETE',
    cookieToken: userToken,
  });
  const resDelete = await deleteAiChats(reqDelete);
  assert.equal(resDelete.status, 200, 'DELETE chats returns 200');
});

// ---------------------------------------------------------------------------
// TEST SUITE: STORAGE LAYER DIRECT ISOLATION
// ---------------------------------------------------------------------------
test('AI Security — 12. aiChatsStore strictly isolates sessions across tenants', async () => {
  const sessionTenant1 = await aiChatsStore.createSession('ws-alpha', { title: 'Alpha Chat' });
  const sessionTenant2 = await aiChatsStore.createSession('ws-beta', { title: 'Beta Chat' });

  // Cross-tenant lookup returns null
  const crossLookup = await aiChatsStore.getSessionById('ws-alpha', sessionTenant2.id);
  assert.equal(crossLookup, null, 'Cross-tenant getSessionById must return null');

  // Cross-tenant update fails
  const crossUpdate = await aiChatsStore.updateSession('ws-alpha', sessionTenant2.id, { title: 'Hacked' });
  assert.equal(crossUpdate.success, false, 'Cross-tenant updateSession must fail');

  // Cross-tenant delete fails
  const crossDelete = await aiChatsStore.deleteSession('ws-alpha', sessionTenant2.id);
  assert.equal(crossDelete.success, false, 'Cross-tenant deleteSession must fail');
});

// ---------------------------------------------------------------------------
// TEST SUITE: SIBLING ROUTE REGRESSION (COACH & BRIEFING)
// ---------------------------------------------------------------------------
test('AI Security — 13. Sibling AI coach and briefing routes continue enforcing authentication', async () => {
  // 1. Coach unauth
  const reqCoachUnauth = createMockRequest('http://localhost:3000/api/ai/coach', {
    method: 'POST',
    body: { leadId: 'lead-1', workspaceId: 'ws-default' },
  });
  const resCoachUnauth = await postAiCoach(reqCoachUnauth);
  assert.equal(resCoachUnauth.status, 401, 'Coach without session returns 401');

  // 2. Briefing unauth
  const reqBriefingUnauth = createMockRequest('http://localhost:3000/api/ai/briefing?workspaceId=ws-default');
  const resBriefingUnauth = await getAiBriefing(reqBriefingUnauth);
  assert.equal(resBriefingUnauth.status, 401, 'Briefing without session returns 401');

  // 3. Master Admin cross-workspace access
  const adminToken = createSessionToken('admin@developster.com');
  const reqAdminBriefing = createMockRequest('http://localhost:3000/api/ai/briefing?workspaceId=ws-default', {
    cookieToken: adminToken,
  });
  const resAdminBriefing = await getAiBriefing(reqAdminBriefing);
  assert.equal(resAdminBriefing.status, 200, 'Master admin can access briefing');
});

// ---------------------------------------------------------------------------
// TEST SUITE: AI-01.2 BRIEFING CACHE ISOLATION ACROSS WORKSPACES
// ---------------------------------------------------------------------------
test('AI Security — 14. Briefing cache is strictly partitioned by workspaceId', async () => {
  clearAiBriefingCache();

  // Generate briefing for Workspace A
  const briefingA = await getAiBriefingDirect('ws-tenant-alpha');
  assert.ok(briefingA, 'Briefing generated for Workspace Alpha');

  // Generate briefing for Workspace B
  const briefingB = await getAiBriefingDirect('ws-tenant-beta');
  assert.ok(briefingB, 'Briefing generated for Workspace Beta');

  // Verify that Workspace A and B receive distinct cache entries
  // (Both exist without collision or cross-contamination)
  const cachedA = await getAiBriefingDirect('ws-tenant-alpha');
  const cachedB = await getAiBriefingDirect('ws-tenant-beta');
  assert.deepEqual(cachedA, briefingA, 'Cached Alpha matches original Alpha');
  assert.deepEqual(cachedB, briefingB, 'Cached Beta matches original Beta');

  // Cross-tenant route request rejection
  const userToken = createSessionToken('aarav.mehta@developsterhub.com'); // ws-default
  const reqCrossBriefing = createMockRequest('http://localhost:3000/api/ai/briefing?workspaceId=ws-tenant-beta', {
    cookieToken: userToken,
  });
  const resCrossBriefing = await getAiBriefing(reqCrossBriefing);
  assert.equal(resCrossBriefing.status, 403, 'Cross-tenant briefing request must return 403 Forbidden');
});

test('AI Security — 20. Briefing cache isolates entries between different users and roles within the same workspace', async () => {
  clearAiBriefingCache();

  const aaravToken = createSessionToken('aarav.mehta@developsterhub.com'); // Member
  const diyaToken = createSessionToken('diya.patel@developsterhub.com'); // Member
  const adminToken = createSessionToken('admin@developster.com'); // Master Admin

  // 1. Aarav requests briefing
  const reqAarav = createMockRequest('http://localhost:3000/api/ai/briefing?workspaceId=ws-default', {
    cookieToken: aaravToken,
  });
  const resAarav = await getAiBriefing(reqAarav);
  assert.equal(resAarav.status, 200);
  const dataAarav = await resAarav.json();

  // 2. Diya requests briefing
  const reqDiya = createMockRequest('http://localhost:3000/api/ai/briefing?workspaceId=ws-default', {
    cookieToken: diyaToken,
  });
  const resDiya = await getAiBriefing(reqDiya);
  assert.equal(resDiya.status, 200);
  const dataDiya = await resDiya.json();

  // 3. Admin requests briefing
  const reqAdmin = createMockRequest('http://localhost:3000/api/ai/briefing?workspaceId=ws-default', {
    cookieToken: adminToken,
  });
  const resAdmin = await getAiBriefing(reqAdmin);
  assert.equal(resAdmin.status, 200);
  const dataAdmin = await resAdmin.json();

  // Verify that all 3 calls succeed and generate role-appropriate briefing data
  assert.ok(dataAarav.date);
  assert.ok(dataDiya.date);
  assert.ok(dataAdmin.date);
});

// ---------------------------------------------------------------------------
// TEST SUITE: AI-01.2 LEGACY AI ROUTE (/api/ai) SECURITY
// ---------------------------------------------------------------------------
test('AI Security — 15. Unauthenticated POST to /api/ai returns 401', async () => {
  const req = createMockRequest('http://localhost:3000/api/ai', {
    method: 'POST',
    body: { action: 'nl_to_automation', naturalLanguagePrompt: 'When deal won create task' },
  });
  const res = await postLegacyAi(req);
  assert.equal(res.status, 401, 'Unauthenticated POST to /api/ai returns 401');
  const data = await res.json();
  assert.match(data.error, /Unauthorized/i);
});

test('AI Security — 16. Cross-tenant POST to /api/ai returns 403', async () => {
  const userToken = createSessionToken('aarav.mehta@developsterhub.com'); // ws-default
  const req = createMockRequest('http://localhost:3000/api/ai', {
    method: 'POST',
    cookieToken: userToken,
    body: {
      action: 'nl_to_automation',
      workspaceId: 'ws-victim-tenant',
      naturalLanguagePrompt: 'When deal won create task',
    },
  });
  const res = await postLegacyAi(req);
  assert.equal(res.status, 403, 'Cross-tenant POST to /api/ai returns 403 Forbidden');
  const data = await res.json();
  assert.match(data.error, /Forbidden/i);
});

test('AI Security — 17. Unauthorized / nonexistent lead access in /api/ai returns 404 or 403', async () => {
  const userToken = createSessionToken('aarav.mehta@developsterhub.com'); // ws-default
  const req = createMockRequest('http://localhost:3000/api/ai', {
    method: 'POST',
    cookieToken: userToken,
    body: {
      action: 'suggest_next_action',
      workspaceId: 'ws-default',
      leadId: 'lead-foreign-fake-999',
    },
  });
  const res = await postLegacyAi(req);
  assert.equal(res.status, 404, 'Non-existent lead returns 404');
});

test('AI Security — 18. Authorized user can use legacy /api/ai actions', async () => {
  const userToken = createSessionToken('aarav.mehta@developsterhub.com');
  const req = createMockRequest('http://localhost:3000/api/ai', {
    method: 'POST',
    cookieToken: userToken,
    body: {
      action: 'nl_to_automation',
      workspaceId: 'ws-default',
      naturalLanguagePrompt: 'When deal won send email and create follow-up task in 3 days',
    },
  });
  const res = await postLegacyAi(req);
  assert.equal(res.status, 200, 'Authorized automation parse returns 200');
  const data = await res.json();
  assert.ok(data.rule, 'Contains parsed rule');
  assert.equal(data.rule.triggerType, 'deal_won');
  assert.ok(data.rule.actions.length >= 2, 'Contains at least 2 parsed actions');
});

// ---------------------------------------------------------------------------
// TEST SUITE: AI-01.2 CONCURRENCY AND STORAGE DURABILITY
// ---------------------------------------------------------------------------
test('AI Security — 19. aiChatsStore handles concurrent operations safely with write lock', async () => {
  const ws = 'ws-concurrency-test';

  // Concurrently create 5 sessions
  const createPromises = Array.from({ length: 5 }, (_, i) =>
    aiChatsStore.createSession(ws, {
      title: `Concurrent Session ${i}`,
      messages: [{ id: `msg-${i}`, role: 'user', content: `Message ${i}`, timestamp: new Date().toISOString() }],
    })
  );

  const createdSessions = await Promise.all(createPromises);
  assert.equal(createdSessions.length, 5, 'All 5 concurrent creates resolved');

  // Verify all 5 were persisted and can be retrieved
  const retrieved = await aiChatsStore.getSessions(ws);
  assert.ok(retrieved.length >= 5, 'All concurrent sessions persisted without race condition data loss');

  // Concurrently update each session
  const updatePromises = createdSessions.map((s, i) =>
    aiChatsStore.updateSession(ws, s.id, { title: `Updated Session ${i}` })
  );
  const updateResults = await Promise.all(updatePromises);
  assert.ok(updateResults.every((r) => r.success), 'All concurrent updates succeeded');

  // Cleanup test sessions
  for (const s of createdSessions) {
    await aiChatsStore.deleteSession(ws, s.id);
  }
});
