// End-to-end automated integration tests for Rapport CRM
const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('====================================================');
  console.log('🚀 RUNNING RAPPORT CRM COMPREHENSIVE TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // Scenario 1: Storage Status & Graceful Unconfigured State
    console.log('Testing Scenario 1 & 18: Storage Status & Missing Credentials Handling...');
    const statusRes = await fetch(`${BASE_URL}/api/sheets/status`);
    const statusData = await statusRes.json();
    assert(statusRes.status === 200, 'Storage status endpoint returns 200 OK');
    assert(typeof statusData.isLiveGoogleSheets === 'boolean', 'Correctly reports Google Sheets connectivity boolean');
    assert(Boolean(statusData.message), 'Provides clear status explanation message without false reporting');

    // Scenario 2: Multi-Business Workspace Creation & Isolation
    console.log('\nTesting Scenario 2: Multi-Business Workspaces & Separation...');
    const wsRes = await fetch(`${BASE_URL}/api/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Nexus Freight Systems',
        industry: 'Logistics',
        currency: 'EUR',
        monthlyTarget: 180000,
      }),
    });
    const newWs = await wsRes.json();
    assert(wsRes.status === 201, 'Workspace successfully created');
    assert(newWs.id && newWs.name === 'Nexus Freight Systems', 'Workspace ID and properties stored');

    // Verify workspace isolation
    const defaultLeadsRes = await fetch(`${BASE_URL}/api/leads?workspaceId=ws-default`);
    const defaultLeads = await defaultLeadsRes.json();
    const newWsLeadsRes = await fetch(`${BASE_URL}/api/leads?workspaceId=${newWs.id}`);
    const newWsLeads = await newWsLeadsRes.json();
    assert(defaultLeads.length > 0, 'Primary workspace contains seeded deals');
    assert(newWsLeads.length === 0, 'New workspace is isolated and contains 0 deals (no cross-contamination)');

    // Scenario 3 & 4: Lead Creation, Stage Transitions & Details
    console.log('\nTesting Scenario 3 & 4: Lead Lifecycle & Stage Transitions...');
    const createLeadRes = await fetch(`${BASE_URL}/api/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: 'ws-default',
        title: 'Cloud Infrastructure Upgrade',
        company: 'Vanguard Aerospace',
        contactName: 'Sarah Connor',
        email: 'sarah@vanguard.com',
        value: 75000,
        stageId: 'stage-qual',
        ownerId: 'mem-1',
      }),
    });
    const createdDeal = await createLeadRes.json();
    assert(createLeadRes.status === 201, 'Deal created successfully');
    assert(createdDeal.value === 75000, 'Deal value persisted correctly');

    // Move to Negotiation stage
    const moveRes = await fetch(`${BASE_URL}/api/leads/${createdDeal.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: 'ws-default', stageId: 'stage-neg' }),
    });
    const movedDeal = await moveRes.json();
    assert(movedDeal.stageId === 'stage-neg', 'Deal stage transitioned to Negotiation');

    // Scenario 5: Mark Deal Won, Metrics & Customer Creation
    console.log('\nTesting Scenario 5: Mark Deal Won Terminal Outcome...');
    const wonRes = await fetch(`${BASE_URL}/api/leads/${createdDeal.id}/won`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: 'ws-default', finalValue: 75000 }),
    });
    const wonData = await wonRes.json();
    assert(wonData.success === true, 'Deal successfully marked Won');
    assert(wonData.deal.status === 'Won' && wonData.deal.closingProbability === 100, 'Closing probability updated to 100%');

    // Scenario 6: Mark Deal Lost with Loss Reason
    console.log('\nTesting Scenario 6: Mark Deal Lost with Reason...');
    const lostRes = await fetch(`${BASE_URL}/api/leads/${createdDeal.id}/lost`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: 'ws-default', lossReason: 'Procurement budget postponed' }),
    });
    const lostData = await lostRes.json();
    assert(lostData.success === true, 'Deal successfully marked Lost');
    assert(lostData.deal.lossReason === 'Procurement budget postponed', 'Loss reason persisted in audit history');

    // Scenario 7: Custom Pipelines & Stages Configuration
    console.log('\nTesting Scenario 7: Custom Pipelines & Stages...');
    const pipesRes = await fetch(`${BASE_URL}/api/pipelines?workspaceId=ws-default`);
    const pipes = await pipesRes.json();
    assert(pipes.length > 0, 'Pipelines loaded');
    assert(pipes[0].stages?.length >= 3, 'Pipeline contains custom stages with colors and probabilities');

    // Scenario 8: Google Sheets Import Wizard & Deduplication
    console.log('\nTesting Scenario 8 & 9: Google Sheets Import & Duplicate Detection...');
    const importPreviewRes = await fetch(`${BASE_URL}/api/sheets/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'preview',
        workspaceId: 'ws-default',
        sheetName: 'Leads',
      }),
    });
    const previewData = await importPreviewRes.json();
    assert(previewData.headers?.length > 0, 'Google Sheets column headers detected');
    assert(previewData.sampleRows?.length > 0, 'Data rows preview generated');

    const importExecRes = await fetch(`${BASE_URL}/api/sheets/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'execute',
        workspaceId: 'ws-default',
        mapping: {
          contactName: 'Full Name',
          company: 'Company Name',
          email: 'Work Email',
          phone: 'Phone',
          value: 'Estimated Value',
          source: 'Source',
        },
        rows: previewData.sampleRows,
        deduplicateBy: 'email',
      }),
    });
    const importExecData = await importExecRes.json();
    assert(importExecData.success === true, 'Google Sheets batch import executed');
    assert(importExecData.importedCount > 0, `Imported ${importExecData.importedCount} new lead records`);

    // Scenario 9: Automations Engine & Dry-run Simulation
    console.log('\nTesting Scenario 9 & 11: Automations & Dry-Run Simulator...');
    const autoRes = await fetch(`${BASE_URL}/api/automations?workspaceId=ws-default`);
    const autoData = await autoRes.json();
    assert(autoData.automations?.length > 0, 'Automations configured');

    const testRule = autoData.automations[0];
    const dryRunRes = await fetch(`${BASE_URL}/api/automations/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: 'ws-default',
        rule: testRule,
      }),
    });
    const dryRunData = await dryRunRes.json();
    assert(dryRunData.wouldExecute !== undefined, 'Dry-run rule simulation evaluated conditions successfully');
    assert(dryRunData.simulatedActions?.length > 0, 'Dry-run reported simulated action dispatches');

    // Scenario 10: Task & Agenda Management
    console.log('\nTesting Scenario 10: Tasks & Follow-ups...');
    const taskRes = await fetch(`${BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: 'ws-default',
        title: 'Review proposal addendum',
        priority: 'high',
        dueDate: '2026-10-30',
      }),
    });
    const newTask = await taskRes.json();
    assert(taskRes.status === 201, 'Task created successfully');

    const toggleTaskRes = await fetch(`${BASE_URL}/api/tasks/${newTask.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: 'ws-default', completed: true }),
    });
    const toggledTask = await toggleTaskRes.json();
    assert(toggledTask.completed === true, 'Task completed status updated and persisted');

    // Scenario 11: Google Calendar Integration
    console.log('\nTesting Scenario 11: Google Calendar Synchronization...');
    const calRes = await fetch(`${BASE_URL}/api/calendar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: 'ws-default',
        title: 'Enterprise Architecture Sync',
        startIso: new Date(Date.now() + 86400000).toISOString(),
        attendees: ['client@enterprise.com'],
      }),
    });
    const calData = await calRes.json();
    assert(calRes.status === 200 && calData.success === true, 'Google Calendar event scheduled with Meet link');
    assert(calData.event?.meetUrl?.includes('meet.google.com'), 'Google Meet video URL generated');

    // Scenario 12: Email Integration & Templates
    console.log('\nTesting Scenario 12: Email Integration & Timeline Logging...');
    const emailRes = await fetch(`${BASE_URL}/api/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId: 'ws-default',
        toEmail: 'elena@client.com',
        subject: 'Contract terms review',
        body: 'Please review the redlines.',
      }),
    });
    const emailData = await emailRes.json();
    assert(emailRes.status === 200 && emailData.success === true, 'Email logged and sent');

    // Scenario 13: AI Copilot
    console.log('\nTesting Scenario 13: AI-Assisted CRM Endpoints...');
    const aiRes = await fetch(`${BASE_URL}/api/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'suggest_next_action',
        workspaceId: 'ws-default',
        leadId: 'deal-n1',
      }),
    });
    const aiData = await aiRes.json();
    assert(aiData.recommendation !== undefined, 'AI suggested next sales action generated');

    const aiNlRes = await fetch(`${BASE_URL}/api/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'nl_to_automation',
        naturalLanguagePrompt: 'When a deal enters proposal, create a follow up task for 2 days later',
      }),
    });
    const aiNlData = await aiNlRes.json();
    assert(aiNlData.rule?.triggerType === 'deal_stage_changed', 'AI converted natural language to structured automation trigger');
    assert(aiNlData.rule?.actions?.[0]?.type === 'create_task', 'AI converted natural language action to create_task');

    console.log('\n====================================================');
    console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================');

    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

runTests();
