import test from 'node:test';
import assert from 'node:assert/strict';
import { crmRepo } from '../src/lib/google-sheets/repository.ts';
import { Lead } from '../src/types/crm.ts';

test('Pipeline movement, Won/Lost state transitions and persistence', async (t) => {
  const workspaceId = 'ws-test-' + Date.now();

  await t.test('createLead coerces numeric values and generates stable ID', async () => {
    const created = await crmRepo.createLead({
      workspaceId,
      title: 'Enterprise Contract Alpha',
      company: 'OmniCorp',
      contactName: 'Sarah Connor',
      email: 'sconnor@omnicorp.com',
      value: '75000' as any, // String input
      stageId: 'stg-qual',
      status: 'Qualified',
      closingProbability: '60%' as any,
    });

    assert.ok(created.id);
    assert.equal(created.workspaceId, workspaceId);
    assert.equal(typeof created.value, 'number');
    assert.equal(created.value, 75000);
    assert.equal(created.closingProbability, 60);
  });

  await t.test('markDealWon updates status, wonAt, and closingProbability', async () => {
    const created = await crmRepo.createLead({
      workspaceId,
      title: 'Deal to Win',
      company: 'SkyNet',
      contactName: 'Miles Dyson',
      email: 'mdyson@skynet.com',
      value: 120000,
      stageId: 'stg-prop',
      status: 'Proposal',
      closingProbability: 70,
    });

    const won = await crmRepo.markDealWon(workspaceId, created.id);
    assert.ok(won);
    assert.equal(won.status, 'Won');
    assert.equal(won.stageId, 'stg-won');
    assert.equal(won.closingProbability, 100);
    assert.ok(won.wonAt);
  });

  await t.test('moving deal back to active stage clears stale wonAt and prevents double-counting', async () => {
    const created = await crmRepo.createLead({
      workspaceId,
      title: 'Deal to Reopen',
      company: 'Cyberdyne',
      contactName: 'John',
      email: 'john@cyberdyne.com',
      value: 50000,
      stageId: 'stg-won',
      status: 'Won',
      closingProbability: 100,
    });

    // Reopen deal back to an open stage
    const reopened = await crmRepo.updateLead(workspaceId, created.id, {
      stageId: 'stg-negot',
      status: 'Negotiation',
      closingProbability: 75,
    });

    assert.ok(reopened);
    assert.equal(reopened.status, 'Negotiation');
    assert.equal(reopened.stageId, 'stg-negot');
    assert.equal(reopened.wonAt, undefined);
    assert.equal(reopened.closingProbability, 75);

    // Verify via getLeads that there is still only 1 record (no duplicate row created)
    const allLeads = await crmRepo.getLeads(workspaceId);
    const matching = allLeads.filter((l) => l.id === created.id);
    assert.equal(matching.length, 1);
  });

  await t.test('reconcileWorkspaceData repairs anomalies and removes duplicates', async () => {
    const res = await crmRepo.reconcileWorkspaceData(workspaceId);
    assert.equal(res.success, true);
    assert.ok(res.reconciledCount >= 3);
  });
});
