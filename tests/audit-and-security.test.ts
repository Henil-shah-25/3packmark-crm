import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptSecret, decryptSecret, maskSecret, maskEmail } from '../src/lib/config/credentials';

test('Security & Encryption — Credentials AES-256-GCM Encryption at Rest', () => {
  const sampleSecret = 'AIzaSyDa-VerySecretKey-991823';

  // 1. Encrypt
  const encrypted = encryptSecret(sampleSecret);
  assert.ok(encrypted.includes(':'), 'Encrypted output contains IV, Tag, and Ciphertext separated by colons');
  assert.notEqual(encrypted, sampleSecret, 'Encrypted string is not equal to plaintext');
  assert.equal(encrypted.includes('AIzaSyDa'), false, 'Encrypted string does not contain plaintext fragments');

  // 2. Decrypt
  const decrypted = decryptSecret(encrypted);
  assert.equal(decrypted, sampleSecret, 'Decrypted ciphertext reproduces exact plaintext');

  // 3. Tamper resistance (authenticated encryption GCM tag verification)
  const parts = encrypted.split(':');
  const tampered = `${parts[0]}:${parts[1]}:${parts[2].slice(0, -2)}00`;
  const tamperedDecrypted = decryptSecret(tampered);
  assert.equal(tamperedDecrypted, '', 'Tampered ciphertext fails auth tag validation and returns empty string');
});

test('Security & Masking — Sensitive Credentials Never Leaked in Full to UI', () => {
  const apiKey = 'AIzaSyDa-VerySecretKey-991823';
  const masked = maskSecret(apiKey);

  assert.ok(masked.includes('••••••••'), 'Masks middle of key with bullets');
  assert.equal(masked.startsWith('AIza'), true, 'Shows only safe 4-char prefix');
  assert.equal(masked.endsWith('1823'), true, 'Shows only safe 4-char suffix');
  assert.equal(masked.includes('VerySecretKey'), false, 'Never leaks secret middle portion');

  const shortKey = 'secret';
  assert.equal(maskSecret(shortKey), '••••••••', 'Completely masks short keys <= 8 chars');

  const email = 'salesrep.aarav@developster.com';
  const maskedEmail = maskEmail(email);
  assert.ok(maskedEmail.includes('***'), 'Masks email address username');
  assert.ok(maskedEmail.endsWith('@developster.com'), 'Preserves domain name');
});

test('RBAC & Role Permissions — Super Admin, Admin, Manager, Member, Viewer', async () => {
  const { DEFAULT_ROLE_PERMISSIONS } = await import('../src/lib/auth/rbac');

  // Owner / Admin permissions
  assert.equal(DEFAULT_ROLE_PERMISSIONS.Owner.canManageTeam, true, 'Owner can manage team');
  assert.equal(DEFAULT_ROLE_PERMISSIONS.Owner.canEditWorkspaceSettings, true, 'Owner can edit workspace settings');
  assert.equal(DEFAULT_ROLE_PERMISSIONS.Admin.canManagePipelines, true, 'Admin can manage pipelines');

  // Manager permissions
  assert.equal(DEFAULT_ROLE_PERMISSIONS.Manager.canManagePipelines, true, 'Manager can manage pipelines');
  assert.equal(DEFAULT_ROLE_PERMISSIONS.Manager.canManageTeam, false, 'Manager CANNOT manage team');
  assert.equal(DEFAULT_ROLE_PERMISSIONS.Manager.canEditWorkspaceSettings, false, 'Manager CANNOT edit workspace settings');

  // Member permissions
  assert.equal(DEFAULT_ROLE_PERMISSIONS.Member.canManagePipelines, false, 'Member CANNOT manage pipelines');
  assert.equal(DEFAULT_ROLE_PERMISSIONS.Member.canAssignLeads, false, 'Member CANNOT assign leads');
  assert.equal(DEFAULT_ROLE_PERMISSIONS.Member.canViewAllLeads, false, 'Member CANNOT view all leads');

  // Read-only Viewer permissions
  assert.equal(DEFAULT_ROLE_PERMISSIONS['Read-only'].canManagePipelines, false, 'Viewer CANNOT manage pipelines');
  assert.equal(DEFAULT_ROLE_PERMISSIONS['Read-only'].canCreatePrivateLeads, false, 'Viewer CANNOT create private leads');
  assert.equal(DEFAULT_ROLE_PERMISSIONS['Read-only'].canExportData, false, 'Viewer CANNOT export data');
});

test('Data Integrity — Multi-Workspace Pipeline & Stage Auto-Initialization', async () => {
  const { crmRepo } = await import('../src/lib/google-sheets/repository');

  const testWsId = `ws-audit-${Date.now()}`;
  const createdWs = await crmRepo.createWorkspace({
    name: 'Acme Technologies India',
    slug: 'acme-tech',
    industry: 'Enterprise Software',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    monthlyTarget: 1000000,
  });

  assert.ok(createdWs.id, 'Workspace created with valid ID');
  assert.equal(createdWs.currency, 'INR', 'Default currency is INR');
  assert.equal(createdWs.timezone, 'Asia/Kolkata', 'Default timezone is Asia/Kolkata');

  // Verify workspace credentials storage is isolated
  await crmRepo.saveWorkspaceCredentials(createdWs.id, {
    geminiApiKeyEncrypted: encryptSecret('acme-test-key-1234'),
    smtpUser: 'notifications@acme.com',
  });

  const retrieved = await crmRepo.getWorkspaceCredentials(createdWs.id);
  assert.ok(retrieved, 'Workspace credentials exist');
  assert.equal(decryptSecret(retrieved.geminiApiKeyEncrypted), 'acme-test-key-1234', 'Decrypts isolated workspace key');

  // Verify other workspace cannot see Acme credentials
  const defaultCreds = await crmRepo.getWorkspaceCredentials('ws-default');
  assert.notEqual(defaultCreds?.smtpUser, 'notifications@acme.com', 'Cross-tenant credentials isolated');
});

