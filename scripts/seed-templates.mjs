import fs from 'fs';
import { PREBUILT_TEMPLATES } from '../src/lib/email/prebuilt-templates.ts';

const path = 'data/crm-storage.json';
const store = JSON.parse(fs.readFileSync(path, 'utf8'));

if (!store.emailTemplates) store.emailTemplates = [];

const existingIds = new Set(store.emailTemplates.map((t) => t.id));

PREBUILT_TEMPLATES.forEach((tpl, idx) => {
  const id = `tpl-prebuilt-${idx + 1}`;
  if (!existingIds.has(id)) {
    store.emailTemplates.push({
      ...tpl,
      id,
      workspaceId: 'ws-default',
      isPrebuilt: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  }
});

fs.writeFileSync(path, JSON.stringify(store, null, 2), 'utf8');
console.log('Seeded templates count:', store.emailTemplates.length);
console.log('Templates:', store.emailTemplates.map((t) => `${t.id}: ${t.name}`));
