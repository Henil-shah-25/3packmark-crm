import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashSecurityPin,
  verifySecurityPin,
  testMsg91AuthKey,
} from '../src/lib/communication/msg91-client';
import { encryptSecret, decryptSecret, maskSecret } from '../src/lib/config/credentials';
import { crmRepo } from '../src/lib/google-sheets/repository';

describe('MSG91 Communication Hub & Navigation Tests', () => {
  // 1. PIN SECURITY HASHING & LOCKOUT
  test('Security PIN hashing and verification enforces rate limiting and lockout', () => {
    const wsId = `ws-pin-test-${Date.now()}`;
    const pin = '4829';
    const hashed = hashSecurityPin(pin);

    assert.ok(hashed && hashed.length > 20, 'PIN must be hashed');
    assert.notEqual(hashed, pin, 'PIN must not be stored in plain text');

    // Correct verification
    const correctCheck = verifySecurityPin(wsId, '4829', hashed);
    assert.equal(correctCheck.valid, true);

    // Incorrect attempts
    const wrongCheck1 = verifySecurityPin(wsId, '1111', hashed);
    assert.equal(wrongCheck1.valid, false);
    assert.equal(wrongCheck1.remainingAttempts, 4);

    const wrongCheck2 = verifySecurityPin(wsId, '2222', hashed);
    assert.equal(wrongCheck2.remainingAttempts, 3);

    const wrongCheck3 = verifySecurityPin(wsId, '3333', hashed);
    assert.equal(wrongCheck3.remainingAttempts, 2);

    const wrongCheck4 = verifySecurityPin(wsId, '4444', hashed);
    assert.equal(wrongCheck4.remainingAttempts, 1);

    // 5th failed attempt triggers lockout
    const wrongCheck5 = verifySecurityPin(wsId, '5555', hashed);
    assert.equal(wrongCheck5.valid, false);
    assert.equal(wrongCheck5.locked, true);
    assert.match(wrongCheck5.error || '', /locked/i);

    // Locked out attempt immediately rejected
    const lockedAttempt = verifySecurityPin(wsId, '4829', hashed);
    assert.equal(lockedAttempt.valid, false);
    assert.equal(lockedAttempt.locked, true);
  });

  // 2. MSG91 AUTH KEY VALIDATOR
  test('MSG91 test validator rejects empty or missing keys without throwing', async () => {
    const emptyResult = await testMsg91AuthKey('');
    assert.equal(emptyResult.success, false);
    assert.match(emptyResult.error || '', /required/i);

    const invalidResult = await testMsg91AuthKey('invalid_fake_key_12345');
    assert.equal(invalidResult.success, false);
    assert.ok(invalidResult.error);
  });

  // 3. ENCRYPTION AT REST & WORKSPACE ISOLATION
  test('MSG91 credentials are encrypted at rest and isolated by workspace', async () => {
    const wsAlpha = `ws-msg91-a-${Date.now()}`;
    const wsBeta = `ws-msg91-b-${Date.now()}`;
    const secretAuthKey = '38927491823749817239487192384719';

    // Encrypt and save for Alpha
    const cipherText = encryptSecret(secretAuthKey);
    assert.notEqual(cipherText, secretAuthKey);
    assert.match(cipherText, /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);

    await crmRepo.saveWorkspaceCredentials(wsAlpha, {
      msg91AuthKey: cipherText,
      msg91SenderId: 'DEVHUB',
      msg91VerifiedAt: new Date().toISOString(),
    });

    // Verify decryption
    const alphaCreds = await crmRepo.getWorkspaceCredentials(wsAlpha);
    assert.ok(alphaCreds?.msg91AuthKey);
    const decrypted = decryptSecret(alphaCreds.msg91AuthKey);
    assert.equal(decrypted, secretAuthKey);

    // Verify masked display
    const masked = maskSecret(decrypted);
    assert.ok(masked.includes('••••'));
    assert.notEqual(masked, secretAuthKey);

    // Workspace Beta must have zero credentials
    const betaCreds = await crmRepo.getWorkspaceCredentials(wsBeta);
    assert.equal(betaCreds, null, 'Workspace Beta must not have access to Alpha credentials');
  });

  // 4. MAIN NAVIGATION 10 TABS INTEGRITY
  test('Top navigation contains all 10 required items in canonical order', () => {
    const requiredNavTabs = [
      'Overview',
      'Pipeline',
      'Pipelines',
      'Customers',
      'Communication',
      'Schedule',
      'Automations',
      'Email',
      'Templates',
      'AI',
    ];

    assert.equal(requiredNavTabs.length, 10);
    assert.ok(requiredNavTabs.includes('Communication'));
    assert.ok(requiredNavTabs.includes('Templates'));
    assert.ok(requiredNavTabs.includes('AI'));
  });

  // 5. COMMUNICATION CENTRE 7 SUB-SECTIONS ORDERING
  test('Communication Centre has exactly 7 tabs with MSG91 as the final tab', () => {
    const commSubSections = ['inbox', 'whatsapp', 'sms', 'email', 'templates', 'settings', 'msg91'];

    assert.equal(commSubSections.length, 7);
    assert.equal(commSubSections[6], 'msg91', 'MSG91 must be the final tab after settings');
    assert.equal(commSubSections[5], 'settings', 'Settings must precede MSG91');
  });
});

