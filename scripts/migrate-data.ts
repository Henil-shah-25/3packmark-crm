import fs from 'fs';
import path from 'path';
import { SEED_STAGES } from '../src/lib/google-sheets/seed-data';

const storePath = path.join(process.cwd(), 'data', 'crm-storage.json');
const raw = fs.readFileSync(storePath, 'utf8');
const data = JSON.parse(raw);

const LEGACY_MAP: Record<string, string> = {
  'stage-qual': 'stg-qualified',
  'stage-qualification': 'stg-qualified',
  'stg-qual': 'stg-qualified',
  'stage-prop': 'stg-proposal',
  'stage-proposal': 'stg-proposal',
  'stg-prop': 'stg-proposal',
  'stage-neg': 'stg-agreement',
  'stage-negotiation': 'stg-agreement',
  'stg-neg': 'stg-agreement',
  'stg-negot': 'stg-agreement',
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

// 1. Leads normalization
let leadsUpdated = 0;
data.leads = (data.leads || []).map((l: any) => {
  const mapped = LEGACY_MAP[l.stageId];
  if (mapped && mapped !== l.stageId) {
    leadsUpdated++;
    return { ...l, stageId: mapped };
  }
  return l;
});
console.log('Leads stage IDs normalized:', leadsUpdated);

// 2. Customers deduplication
const seenCustId = new Set<string>();
const seenCustComp = new Set<string>();
const uniqueCustomers: any[] = [];
for (const c of data.customers || []) {
  const normComp = (c.company || '').trim().toLowerCase();
  const compKey = normComp + ':' + c.workspaceId;
  if (seenCustId.has(c.id) || (normComp && seenCustComp.has(compKey))) {
    console.log('Duplicate customer found & reconciled:', c.id, c.name, c.company);
    continue;
  }
  seenCustId.add(c.id);
  if (normComp) seenCustComp.add(compKey);
  uniqueCustomers.push(c);
}
console.log('Unique customers count:', uniqueCustomers.length, 'from', data.customers?.length);
data.customers = uniqueCustomers;

// 3. Pipelines & stages normalization
const allStages: any[] = [];
data.pipelines = (data.pipelines || []).map((pipe: any) => {
  const stages = SEED_STAGES.map((s) => ({
    ...s,
    workspaceId: pipe.workspaceId,
    pipelineId: pipe.id,
  }));
  allStages.push(...stages);
  return {
    ...pipe,
    stages,
  };
});
data.stages = allStages;

console.log('Normalized pipelines count:', data.pipelines.length);
console.log('Total normalized stages:', data.stages.length);
fs.writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf8');
console.log('Successfully updated data/crm-storage.json');
