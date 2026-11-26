import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

// Native env loader
function loadEnvFile(file: string) {
  const p = path.resolve(process.cwd(), file);
  if (!fs.existsSync(p)) return;
  const content = fs.readFileSync(p, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = 'test-session-secret-security-hardening-2026';
}

import { googleSheetsClient } from '../src/lib/google-sheets/client';
import { SHEET_NAMES } from '../src/lib/google-sheets/schema';
import {
  GoogleSheetsAiChatsStore,
  googleSheetsAiChatsStore,
  AiChatMessage,
  AiChatEventRow,
} from '../src/lib/ai/google-sheets-chats-store';
import { migrateJsonChatsToGoogleSheets } from '../src/lib/ai/chats-migration';
import { isGoogleSheetsConfigured } from '../src/lib/google-sheets/config';

// Ensure live credentials are ready
test('Live Google Sheets — 1. Verify Authentication & Spreadsheet Handshake', async () => {
  const isConfigured = isGoogleSheetsConfigured();
  assert.equal(isConfigured, true, 'Live Google Sheets credentials must be configured in environment');

  const conn = await googleSheetsClient.testConnection();
  assert.equal(conn.success, true, `Connection failed: ${conn.error}`);
  assert.ok(conn.title, 'Spreadsheet has a title');
  assert.ok(Array.isArray(conn.sheets), 'Spreadsheet returned worksheet titles');
  console.log(`[Live Test] Connected to spreadsheet "${conn.title}" with ${conn.sheets?.length} sheets.`);
});

test('Live Google Sheets — 2. Idempotent Schema Initialization of AI_CHATS Tab', async () => {
  // Ensure AI_CHATS worksheet exists with correct headers
  const initResult = await googleSheetsClient.initializeDatabase();
  assert.ok(initResult, 'initializeDatabase completed');

  // Verify AI_CHATS exists now
  const conn = await googleSheetsClient.testConnection();
  assert.ok(conn.sheets?.includes(SHEET_NAMES.AI_CHATS), 'AI_CHATS sheet must exist in spreadsheet');

  // Verify headers
  const rows = await googleSheetsClient.getAllRows(SHEET_NAMES.AI_CHATS, true);
  assert.ok(Array.isArray(rows), 'AI_CHATS returns an array of rows');
  console.log(`[Live Test] Verified AI_CHATS worksheet schema. Current rows count: ${rows.length}.`);
});

test('Live Google Sheets — 3. End-to-End Live Conversation Lifecycle & Reconstruction', async () => {
  const liveStore = new GoogleSheetsAiChatsStore();
  const testWs = `ws-live-test-${Date.now()}`;
  const testUserId = `usr-tester-${Date.now()}`;
  const initialTitle = 'Live Synthetic Deal Consultation';

  // 1. Create a unique test conversation
  const initialMsg: AiChatMessage = {
    id: `msg-${Date.now()}-1`,
    role: 'user',
    content: 'SYNTHETIC TEST: What is the recommended strategy for a $15k proposal?',
    timestamp: new Date().toISOString(),
  };

  const created = await liveStore.createSession(testWs, {
    title: initialTitle,
    userId: testUserId,
    messages: [initialMsg],
  });

  assert.ok(created.id, 'Session created with ID');
  assert.equal(created.workspaceId, testWs);
  assert.equal(created.userId, testUserId);
  assert.equal(created.title, initialTitle);
  assert.equal(created.messages.length, 1);
  assert.equal(created.messages[0].id, initialMsg.id);
  console.log(`[Live Test] Created test conversation "${created.id}" in live spreadsheet.`);

  // 2. Append assistant response
  const assistantMsg: AiChatMessage = {
    id: `msg-${Date.now()}-2`,
    role: 'assistant',
    content: 'SYNTHETIC TEST: Recommend scheduling an executive alignment call to review redlined terms.',
    timestamp: new Date().toISOString(),
    sourcesUsed: ['Live Knowledge Base'],
    proposedActions: [{ type: 'create_task', label: 'Call Client' }],
  };

  const appendRes1 = await liveStore.appendMessages(testWs, created.id, [assistantMsg]);
  assert.equal(appendRes1.success, true);
  assert.equal(appendRes1.session?.messages.length, 2);

  // 3. Append user follow-up
  const followUpMsg: AiChatMessage = {
    id: `msg-${Date.now()}-3`,
    role: 'user',
    content: 'SYNTHETIC TEST: Draft the follow-up email please.',
    timestamp: new Date().toISOString(),
  };

  const appendRes2 = await liveStore.appendMessages(testWs, created.id, [followUpMsg]);
  assert.equal(appendRes2.success, true);
  assert.equal(appendRes2.session?.messages.length, 3);

  // 4. Retrieve and reconstruct directly from live sheet
  const retrieved = await liveStore.getSessionById(testWs, created.id);
  assert.ok(retrieved, 'Reconstructed session from live Google Sheet');
  assert.equal(retrieved.id, created.id);
  assert.equal(retrieved.messages.length, 3);
  assert.equal(retrieved.messages[0].id, initialMsg.id);
  assert.equal(retrieved.messages[1].id, assistantMsg.id);
  assert.equal(retrieved.messages[2].id, followUpMsg.id);
  assert.deepEqual(retrieved.messages[1].sourcesUsed, ['Live Knowledge Base']);

  // 5. Update conversation title via live event
  const updatedTitle = 'Updated Live Strategy Session (Confirmed)';
  const titleRes = await liveStore.updateTitle(testWs, created.id, updatedTitle);
  assert.equal(titleRes.success, true);
  assert.equal(titleRes.session?.title, updatedTitle);

  // Verify reload reflects title update
  const reloaded = await liveStore.getSessionById(testWs, created.id);
  assert.equal(reloaded?.title, updatedTitle);
  console.log(`[Live Test] Verified title update and message reconstruction.`);

  // 6. Test duplicate message append idempotency on live spreadsheet
  const duplicateRes = await liveStore.appendMessages(testWs, created.id, [followUpMsg]);
  assert.equal(duplicateRes.success, true);
  assert.equal(duplicateRes.session?.messages.length, 3, 'Duplicate message append must be idempotently ignored');

  // 7. Soft-delete the conversation
  const deleteRes = await liveStore.deleteSession(testWs, created.id);
  assert.equal(deleteRes.success, true);

  // 8. Verify deleted conversation is no longer returned
  const postDeleteLookup = await liveStore.getSessionById(testWs, created.id);
  assert.equal(postDeleteLookup, null, 'Soft-deleted conversation must not be returned');

  const workspaceList = await liveStore.getSessions(testWs);
  assert.equal(workspaceList.some((s) => s.id === created.id), false, 'Deleted conversation excluded from workspace list');
  console.log(`[Live Test] Verified soft-delete and tombstone filtering.`);
});

test('Live Google Sheets — 4. Multi-Tenant and User Authorization Enforcement', async () => {
  const liveStore = new GoogleSheetsAiChatsStore();
  const wsAlpha = `ws-alpha-auth-${Date.now()}`;
  const wsBeta = `ws-beta-auth-${Date.now()}`;

  // Create session in Alpha
  const sessionAlpha = await liveStore.createSession(wsAlpha, {
    title: 'Alpha Confidential Notes',
    userId: 'usr-alpha-exclusive',
  });

  // 1. Cross-tenant retrieval blocked
  const crossTenantGet = await liveStore.getSessionById(wsBeta, sessionAlpha.id);
  assert.equal(crossTenantGet, null, 'Tenant Beta cannot retrieve Tenant Alpha conversation');

  // 2. Cross-tenant append blocked
  const crossTenantAppend = await liveStore.appendMessages(wsBeta, sessionAlpha.id, [
    { id: 'fake-msg', role: 'user', content: 'Unauthorized injection', timestamp: new Date().toISOString() },
  ]);
  assert.equal(crossTenantAppend.success, false, 'Cross-tenant message append must fail');

  // 3. Cross-user isolation within same workspace
  const nonPrivilegedGet = await liveStore.getSessionById(wsAlpha, sessionAlpha.id, 'usr-other-peer', false);
  assert.equal(nonPrivilegedGet, null, 'Peer user cannot access private conversation without permission');

  const adminGet = await liveStore.getSessionById(wsAlpha, sessionAlpha.id, 'usr-workspace-admin', true);
  assert.ok(adminGet, 'Workspace admin can access member conversation');

  // Clean up test session
  await liveStore.deleteSession(wsAlpha, sessionAlpha.id);
});

test('Live Google Sheets — 5. Migration Utility Verification with Target Scoping', async () => {
  const liveStore = new GoogleSheetsAiChatsStore();

  // Create a temporary isolated source file for migration verification
  const tempSourcePath = path.join(process.cwd(), 'data', `test-migration-source-${Date.now()}.json`);
  const syntheticLegacySession = {
    id: `chat-legacy-migrated-${Date.now()}`,
    workspaceId: `ws-migrated-${Date.now()}`,
    userId: 'usr-migrated-verified',
    title: 'Pre-existing Legacy Chat',
    messages: [
      { id: 'mig-m1', role: 'user', content: 'Legacy question', timestamp: '2026-11-14T10:00:00.000Z' },
      { id: 'mig-m2', role: 'assistant', content: 'Legacy answer', timestamp: '2026-11-14T10:00:05.000Z' },
    ],
    createdAt: '2026-11-14T10:00:00.000Z',
    updatedAt: '2026-11-14T10:00:05.000Z',
  };

  const syntheticUnownedSession = {
    id: `chat-legacy-unowned-${Date.now()}`,
    workspaceId: `ws-migrated-${Date.now()}`,
    title: 'Unowned Legacy Chat',
    messages: [{ id: 'mig-un1', role: 'user', content: 'Anonymous notes', timestamp: '2026-11-14T11:00:00.000Z' }],
    createdAt: '2026-11-14T11:00:00.000Z',
    updatedAt: '2026-11-14T11:00:00.000Z',
  };

  fs.writeFileSync(tempSourcePath, JSON.stringify([syntheticLegacySession, syntheticUnownedSession], null, 2), 'utf-8');

  try {
    // 1. Run migration without fallback user: Unowned session must be skipped and documented
    const report1 = await migrateJsonChatsToGoogleSheets(liveStore, {
      customSourcePath: tempSourcePath,
      fallbackUserId: undefined,
    });

    assert.equal(report1.success, true);
    assert.equal(report1.importedCount, 1, 'Only attributed session was imported');
    assert.equal(report1.skippedCount, 1, 'Unowned session was skipped for manual review');
    assert.equal(report1.skippedRecords[0].id, syntheticUnownedSession.id);

    // Verify imported session exists in live Google Sheet
    const liveImported = await liveStore.getSessionById(syntheticLegacySession.workspaceId, syntheticLegacySession.id);
    assert.ok(liveImported, 'Imported legacy session found in live sheet');
    assert.equal(liveImported.messages.length, 2);

    // 2. Run migration a second time: Must be idempotent (0 new records, 1 already exists)
    const report2 = await migrateJsonChatsToGoogleSheets(liveStore, {
      customSourcePath: tempSourcePath,
      fallbackUserId: undefined,
    });

    assert.equal(report2.importedCount, 0, 'Repeat migration must import 0 new records');
    assert.equal(report2.alreadyExistsCount, 1, 'Pre-existing record identified as already existing');

    // Clean up live imported session
    await liveStore.deleteSession(syntheticLegacySession.workspaceId, syntheticLegacySession.id);
  } finally {
    // Clean up temporary local file
    try { fs.unlinkSync(tempSourcePath); } catch {}
  }
});
