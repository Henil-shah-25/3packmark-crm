import fs from 'fs';
import path from 'path';

// Load .env variables into process.env before importing client
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

import { testGeminiConnection, getGeminiModel, generateWorkflowFromPrompt, summarizeLeadAndMeeting } from '../src/lib/gemini/client';

async function main() {
  console.log('--- Configured Gemini Model ---');
  const model = getGeminiModel();
  console.log('Model:', model);

  console.log('\n--- Running testGeminiConnection() ---');
  const connResult = await testGeminiConnection();
  console.log('Connection Test Result:', JSON.stringify(connResult, null, 2));

  if (!connResult.success) {
    console.error('Gemini connection test failed:', connResult.message);
    process.exit(1);
  }

  console.log('\n--- Testing generateWorkflowFromPrompt() ---');
  const mockStages = [
    { id: 'stg-1', workspaceId: 'ws-1', pipelineId: 'pipe-1', name: 'Proposal', order: 1, color: 'terracotta', probability: 50 },
    { id: 'stg-2', workspaceId: 'ws-1', pipelineId: 'pipe-1', name: 'Won', order: 2, color: 'green', probability: 100 },
  ];
  const mockMembers = [
    { id: 'mem-1', workspaceId: 'ws-1', name: 'Elena Vance', email: 'elena@crm.com', role: 'admin' as const, avatarUrl: '' },
  ];
  const workflow = await generateWorkflowFromPrompt('When deal moves to Proposal, create a task to follow up', mockStages, mockMembers);
  console.log('Workflow Name:', workflow.name);
  console.log('Trigger Type:', workflow.triggerType);
  console.log('Nodes count:', workflow.nodes?.length);

  console.log('\n--- Testing summarizeLeadAndMeeting() ---');
  const mockLead = {
    id: 'lead-1',
    workspaceId: 'ws-1',
    title: 'Enterprise ERP Rollout',
    company: 'Acme Corp',
    contactName: 'Jane Doe',
    email: 'jane@acme.com',
    phone: '555-0100',
    value: 50000,
    stageId: 'stg-1',
    status: 'Open' as const,
    closingProbability: 60,
    expectedCloseDate: '2026-11-15',
    ownerId: 'mem-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const summary = await summarizeLeadAndMeeting(mockLead, []);
  console.log('Summary:', summary.summary);
  console.log('Recommended Actions:', summary.recommendedActions);

  console.log('\nALL GEMINI CHECKS PASSED SUCCESSFULLY!');
}

main().catch((err) => {
  console.error('Execution error:', err);
  process.exit(1);
});
