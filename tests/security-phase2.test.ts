import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
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
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  revokeSessionToken,
  isSessionRevoked,
  createPasswordResetToken,
  verifyPasswordResetToken,
  consumePasswordResetToken,
} from '../src/lib/auth';
import {
  getAuthenticatedUser,
  DEFAULT_ROLE_PERMISSIONS,
  isMasterAdmin,
  canUserAccessPipeline,
  canUserAccessLead,
} from '../src/lib/auth/rbac';
import {
  createOAuthState,
  verifyOAuthState,
} from '../src/lib/calendar/google-calendar';
import {
  encryptSecret,
  decryptSecret,
  maskSecret,
  maskEmail,
  getMaskedWorkspaceCredentials,
  saveWorkspaceCredentials,
} from '../src/lib/config/credentials';
import { crmRepo } from '../src/lib/google-sheets/repository';

import { POST as postLogin } from '../src/app/api/auth/login/route';
import { POST as postLogout } from '../src/app/api/auth/logout/route';
import { GET as getMe } from '../src/app/api/auth/me/route';
import {
  GET as getMembers,
  POST as postMember,
  PUT as putMember,
  DELETE as deleteMember,
} from '../src/app/api/members/route';

function createMockRequest(url: string, options: {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
} = {}): NextRequest {
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
      ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body))
      : undefined,
  };

  return new NextRequest(new URL(url, 'http://localhost:3000'), reqInit);
}

// ---------------------------------------------------------------------------
// TEST 1: Invalid Login Credentials & Enumeration Prevention
// ---------------------------------------------------------------------------
test('Security Phase 2 — 1. Invalid Login Credentials & Account Enumeration Prevention', async () => {
  // 1A. Non-existent email -> 401 with generic message
  const reqBadEmail = createMockRequest('http://localhost:3000/api/auth/login', {
    method: 'POST',
    body: { email: 'nonexistent-user-12345@developster.com', password: 'WrongPassword123!' },
  });
  const resBadEmail = await postLogin(reqBadEmail);
  assert.equal(resBadEmail.status, 401);
  const dataBadEmail = await resBadEmail.json();
  assert.equal(dataBadEmail.error, 'Invalid email or password.');

  // 1B. Valid admin email with wrong password -> identical 401 and generic message
  const reqBadPass = createMockRequest('http://localhost:3000/api/auth/login', {
    method: 'POST',
    body: { email: process.env.ADMIN_EMAIL || 'admin@developster.com', password: 'DefinitivelyIncorrectPassword!99' },
  });
  const resBadPass = await postLogin(reqBadPass);
  assert.equal(resBadPass.status, 401);
  const dataBadPass = await resBadPass.json();
  assert.equal(dataBadPass.error, 'Invalid email or password.', 'Generic error prevents username enumeration');
});

// ---------------------------------------------------------------------------
// TEST 2: Password Hash Verification (scrypt, legacy SHA, constant-time)
// ---------------------------------------------------------------------------
test('Security Phase 2 — 2. Modern Scrypt Password Hashing & Legacy Compatibility', () => {
  const plain = 'SecurePassphrase#2026!';

  // 2A. Modern scrypt hashing
  const hash = hashPassword(plain);
  assert.ok(hash.startsWith('scrypt:'), 'Hash format must start with scrypt:');
  const parts = hash.split(':');
  assert.equal(parts.length, 3, 'Format must be scrypt:<salt_hex>:<hash_hex>');
  assert.equal(parts[1].length, 32, 'Salt must be 16 bytes (32 hex characters)');
  assert.equal(parts[2].length, 128, 'Derived key must be 64 bytes (128 hex characters)');

  // Correct password matches
  assert.equal(verifyPassword(plain, hash), true, 'Correct password passes scrypt verification');
  // Wrong password fails
  assert.equal(verifyPassword('WrongPass#2026!', hash), false, 'Wrong password fails scrypt verification');

  // 2B. Legacy SHA-256 pre-hashed support
  const sha256Hex = crypto.createHash('sha256').update(plain, 'utf8').digest('hex');
  assert.equal(verifyPassword(plain, sha256Hex), true, 'Legacy SHA-256 pre-hashed passes');
  assert.equal(verifyPassword('WrongPass', sha256Hex), false, 'Wrong password on legacy SHA-256 fails');

  // 2C. Legacy SHA-512 pre-hashed support
  const sha512Hex = crypto.createHash('sha512').update(plain, 'utf8').digest('hex');
  assert.equal(verifyPassword(plain, sha512Hex), true, 'Legacy SHA-512 pre-hashed passes');
  assert.equal(verifyPassword('WrongPass', sha512Hex), false, 'Wrong password on legacy SHA-512 fails');

  // 2D. Legacy plaintext environment fallback
  const legacyPlain = 'LegacyEnvPassword2026';
  assert.equal(verifyPassword(legacyPlain, legacyPlain), true, 'Plaintext env password passes via constant-time check');
  assert.equal(verifyPassword('wrong', legacyPlain), false, 'Wrong password on plaintext env fails');
});

// ---------------------------------------------------------------------------
// TEST 3: Plaintext Password Storage Prevention
// ---------------------------------------------------------------------------
test('Security Phase 2 — 3. Plaintext Password Storage Prevention in Repository & APIs', async () => {
  const rawSecretPassword = 'UltraSecretPassword#999';

  // 3A. Creating a member via repository directly with hashPassword
  const member = await crmRepo.createMember('ws-default', {
    workspaceId: 'ws-default',
    name: 'Priya Sharma',
    email: `priya.security.${Date.now()}@developster.com`,
    role: 'Member',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=64',
    password: hashPassword(rawSecretPassword),
  });

  // Verify stored password is NOT plaintext
  assert.notEqual(member.password, rawSecretPassword, 'Password is never stored in plaintext');
  assert.ok(member.password?.startsWith('scrypt:'), 'Password must be stored as scrypt hash');
  assert.equal(verifyPassword(rawSecretPassword, member.password!), true, 'verifyPassword validates against stored scrypt hash');

  // 3B. Verify API /api/members redacts password
  const adminToken = createSessionToken(process.env.ADMIN_EMAIL || 'admin@developster.com');
  const reqMembers = createMockRequest('http://localhost:3000/api/members?workspaceId=ws-default', {
    cookies: { crm_session: adminToken },
  });
  const resMembers = await getMembers(reqMembers);
  assert.equal(resMembers.status, 200);
  const membersList = await resMembers.json();
  const foundPriya = membersList.find((m: any) => m.email === member.email);
  assert.ok(foundPriya, 'Created member exists in API output');
  assert.equal(foundPriya.password, undefined, 'Password field must be completely omitted/redacted from API responses');
});

// ---------------------------------------------------------------------------
// TEST 4: Expired Session Rejection
// ---------------------------------------------------------------------------
test('Security Phase 2 — 4. Expired Session Rejection', async () => {
  // Create token with negative duration (expired 10 seconds ago)
  const expiredToken = createSessionToken('user@developster.com', -10000);

  // 4A. verifySessionToken returns null
  const session = verifySessionToken(expiredToken);
  assert.equal(session, null, 'Expired session token returns null from verifySessionToken');

  // 4B. /api/auth/me returns 401 with expired cookie
  const reqMe = createMockRequest('http://localhost:3000/api/auth/me', {
    cookies: { crm_session: expiredToken },
  });
  const resMe = await getMe(reqMe);
  assert.equal(resMe.status, 401);
  const dataMe = await resMe.json();
  assert.equal(dataMe.authenticated, false);
});

// ---------------------------------------------------------------------------
// TEST 5: Tampered Session Rejection
// ---------------------------------------------------------------------------
test('Security Phase 2 — 5. Tampered Session Token Rejection', async () => {
  const validToken = createSessionToken('user@developster.com');
  const [payloadB64, signature] = validToken.split('.');

  // 5A. Tamper with payload (change email)
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  payload.email = 'admin@developster.com';
  const tamperedPayloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const tamperedToken = `${tamperedPayloadB64}.${signature}`;

  assert.equal(verifySessionToken(tamperedToken), null, 'Tampered payload fails HMAC verification');

  // 5B. Tamper with signature
  const brokenSignature = signature.slice(0, -4) + 'abcd';
  const brokenSigToken = `${payloadB64}.${brokenSignature}`;
  assert.equal(verifySessionToken(brokenSigToken), null, 'Tampered signature fails HMAC verification');

  // 5C. /api/auth/me rejects tampered token with 401
  const reqMe = createMockRequest('http://localhost:3000/api/auth/me', {
    cookies: { crm_session: tamperedToken },
  });
  const resMe = await getMe(reqMe);
  assert.equal(resMe.status, 401);
});

// ---------------------------------------------------------------------------
// TEST 6: Logout & Server-Side Session Revocation
// ---------------------------------------------------------------------------
test('Security Phase 2 — 6. Logout & Server-Side Session Revocation', async () => {
  const email = `session-revoked-${Date.now()}@developster.com`;
  const token = createSessionToken(email);

  // Token is initially valid
  const verifiedBefore = verifySessionToken(token);
  assert.ok(verifiedBefore, 'Token is valid prior to logout');
  assert.equal(verifiedBefore?.email, email);

  // Perform logout via POST /api/auth/logout with token cookie
  const reqLogout = createMockRequest('http://localhost:3000/api/auth/logout', {
    method: 'POST',
    cookies: { crm_session: token },
  });
  const resLogout = await postLogout(reqLogout);
  assert.equal(resLogout.status, 200);

  // Assert cookie clearance headers
  const setCookie = resLogout.headers.get('set-cookie') || '';
  assert.ok(setCookie.includes('crm_session=;'), 'Sets cookie value to empty');
  assert.ok(setCookie.includes('Max-Age=0') || setCookie.includes('expires='), 'Sets immediate expiration');

  // Assert server-side revocation: The identical token string must now be REJECTED
  assert.equal(isSessionRevoked(token), true, 'Token is registered as revoked in server store');
  const verifiedAfter = verifySessionToken(token);
  assert.equal(verifiedAfter, null, 'Revoked token is rejected by verifySessionToken');
});

// ---------------------------------------------------------------------------
// TEST 7: Cookie Security Configuration
// ---------------------------------------------------------------------------
test('Security Phase 2 — 7. Cookie Security Attributes Configuration', async () => {
  const reqLogin = createMockRequest('http://localhost:3000/api/auth/login', {
    method: 'POST',
    body: {
      email: process.env.ADMIN_EMAIL || 'admin@developster.com',
      password: process.env.ADMIN_PASSWORD || 'developster_secret_2026',
    },
  });
  const resLogin = await postLogin(reqLogin);
  assert.equal(resLogin.status, 200);

  const cookie = resLogin.cookies.get('crm_session');
  assert.ok(cookie, 'crm_session cookie must be set on response');
  assert.equal(cookie.httpOnly, true, 'Cookie must have httpOnly=true');
  assert.equal(String(cookie.sameSite).toLowerCase(), 'lax', 'Cookie must have sameSite=lax');
  assert.equal(cookie.path, '/', 'Cookie must be scoped to path=/');
  assert.equal(cookie.maxAge, 30 * 24 * 60 * 60, 'Cookie must have 30-day maxAge (2,592,000 seconds)');
});

// ---------------------------------------------------------------------------
// TEST 8: Employee Privilege Escalation Attempts
// ---------------------------------------------------------------------------
test('Security Phase 2 — 8. Employee Privilege Escalation Prevention', async () => {
  // Create an employee member
  const employee = await crmRepo.createMember('ws-default', {
    workspaceId: 'ws-default',
    name: 'Aarav Patel',
    email: `aarav.privilege.${Date.now()}@developster.com`,
    role: 'Member',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=64',
  });

  const employeeToken = createSessionToken(employee.email);

  // 8A. Employee attempts to create a team member -> 403 Forbidden
  const reqCreateMember = createMockRequest('http://localhost:3000/api/members', {
    method: 'POST',
    cookies: { crm_session: employeeToken },
    body: {
      workspaceId: 'ws-default',
      name: 'Rogue User',
      email: 'rogue@developster.com',
      role: 'Admin',
    },
  });
  const resCreateMember = await postMember(reqCreateMember);
  assert.equal(resCreateMember.status, 403, 'Employee without canManageTeam cannot create members');

  // 8B. Employee attempts to promote themselves to Admin -> 403 Forbidden
  const reqSelfPromote = createMockRequest('http://localhost:3000/api/members', {
    method: 'PUT',
    cookies: { crm_session: employeeToken },
    body: {
      id: employee.id,
      workspaceId: 'ws-default',
      role: 'Admin',
    },
  });
  const resSelfPromote = await putMember(reqSelfPromote);
  assert.equal(resSelfPromote.status, 403, 'Employee cannot self-escalate role');

  // 8C. Admin attempts to assign Owner role -> 403 Forbidden (Only Owner can assign Owner role)
  const adminMember = await crmRepo.createMember('ws-default', {
    workspaceId: 'ws-default',
    name: 'Diya Admin',
    email: `diya.admin.${Date.now()}@developster.com`,
    role: 'Admin',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=64',
  });
  const adminToken = createSessionToken(adminMember.email);

  const reqPromoteToOwner = createMockRequest('http://localhost:3000/api/members', {
    method: 'PUT',
    cookies: { crm_session: adminToken },
    body: {
      id: employee.id,
      workspaceId: 'ws-default',
      role: 'Owner',
    },
  });
  const resPromoteToOwner = await putMember(reqPromoteToOwner);
  assert.equal(resPromoteToOwner.status, 403, 'Non-Owner Admin cannot assign the Owner role');
});

// ---------------------------------------------------------------------------
// TEST 9: Cross-Tenant Authentication Attempts
// ---------------------------------------------------------------------------
test('Security Phase 2 — 9. Strict Cross-Tenant Authentication & Isolation', async () => {
  const wsAlpha = `ws-alpha-${Date.now()}`;
  const wsBeta = `ws-beta-${Date.now()}`;

  // Member in Tenant Alpha
  const memberAlpha = await crmRepo.createMember(wsAlpha, {
    workspaceId: wsAlpha,
    name: 'Alpha Member',
    email: `member.alpha.${Date.now()}@alpha-corp.com`,
    role: 'Member',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=64',
  });

  const alphaToken = createSessionToken(memberAlpha.email);

  // Authenticate against Alpha: succeeds
  const authContextAlpha = await getAuthenticatedUser(
    createMockRequest(`http://localhost:3000?workspaceId=${wsAlpha}`, { cookies: { crm_session: alphaToken } }),
    wsAlpha
  );
  assert.ok(authContextAlpha, 'Member authenticates cleanly in their own workspace');
  assert.equal(authContextAlpha?.user.email, memberAlpha.email);

  // Authenticate against Beta with Alpha token: MUST return null (401 access denied)
  const authContextBeta = await getAuthenticatedUser(
    createMockRequest(`http://localhost:3000?workspaceId=${wsBeta}`, { cookies: { crm_session: alphaToken } }),
    wsBeta
  );
  assert.equal(authContextBeta, null, 'Alpha tenant member is denied access to Tenant Beta');
});

// ---------------------------------------------------------------------------
// TEST 10: Master Admin Access Restrictions
// ---------------------------------------------------------------------------
test('Security Phase 2 — 10. Master Admin Access Restrictions & Universal Privileges', async () => {
  const masterAdminEmail = process.env.ADMIN_EMAIL || 'admin@developster.com';
  const masterAdminToken = createSessionToken(masterAdminEmail);

  const authMaster = await getAuthenticatedUser(
    createMockRequest('http://localhost:3000', { cookies: { crm_session: masterAdminToken } }),
    'ws-default'
  );

  assert.ok(authMaster);
  assert.equal(authMaster?.isMasterAdmin, true, 'ADMIN_EMAIL is resolved as Master Admin');
  assert.equal(authMaster?.user.role, 'Owner');
  assert.equal(authMaster?.permissions.canManageTeam, true);
  assert.equal(authMaster?.permissions.canViewMasterPipeline, true);

  // Regular member is NOT Master Admin
  const regularMember = await crmRepo.createMember('ws-default', {
    workspaceId: 'ws-default',
    name: 'Regular Rep',
    email: `rep.${Date.now()}@developster.com`,
    role: 'Member',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=64',
  });

  assert.equal(isMasterAdmin(regularMember), false, 'Regular member is not Master Admin');

  // Verify Master Pipeline restriction
  const masterPipeline = {
    id: 'pipe-master',
    workspaceId: 'ws-default',
    name: 'Executive Master Pipeline',
    isMaster: true,
    visibility: 'master' as const,
    stages: [],
  };

  assert.equal(canUserAccessPipeline(regularMember, masterPipeline), false, 'Regular member blocked from Master Pipeline');
  assert.equal(canUserAccessPipeline(authMaster?.user, masterPipeline), true, 'Master Admin can access Master Pipeline');
});

// ---------------------------------------------------------------------------
// TEST 11: Google OAuth State Cryptographic Validation
// ---------------------------------------------------------------------------
test('Security Phase 2 — 11. Google OAuth State Cryptographic Validation', () => {
  const validRedirect = 'http://localhost:3000/api/calendar/callback';
  const state = createOAuthState('ws-default', validRedirect);

  // 11A. Valid signed state verifies cleanly
  const verified = verifyOAuthState(state);
  assert.equal(verified.valid, true, 'Valid signed state passes verification');
  assert.equal(verified.workspaceId, 'ws-default');
  assert.equal(verified.redirectUri, validRedirect);

  // 11B. Tampered state fails signature verification
  const [payloadB64, sig] = state.split('.');
  const tamperedSig = sig.slice(0, -2) + '00';
  const tamperedState = `${payloadB64}.${tamperedSig}`;
  const verifyTampered = verifyOAuthState(tamperedState);
  assert.equal(verifyTampered.valid, false, 'Tampered state fails signature verification');
  assert.equal(verifyTampered.error, 'OAuth state signature verification failed');

  // 11C. Open-redirect prevention in OAuth state
  const maliciousRedirect = 'https://attacker-stealer.com/steal-code';
  const maliciousState = createOAuthState('ws-default', maliciousRedirect);
  const verifyMalicious = verifyOAuthState(maliciousState);
  assert.equal(verifyMalicious.valid, false, 'External unauthorized redirect URI is blocked');
  assert.equal(verifyMalicious.error, 'Unauthorized redirect URI path in OAuth state');
});

// ---------------------------------------------------------------------------
// TEST 12: Integration Credential Masking & Redaction
// ---------------------------------------------------------------------------
test('Security Phase 2 — 12. Integration Credential Encryption & Masked UI Redaction', async () => {
  const wsId = `ws-cred-${Date.now()}`;
  const rawGeminiKey = 'AIzaSyA88921BcdVerySecretAPIKey';
  const rawSmtpPass = 'gmailAppPassword1234';

  // Save encrypted credentials
  await saveWorkspaceCredentials(wsId, {
    geminiApiKey: rawGeminiKey,
    smtpPass: rawSmtpPass,
    smtpUser: 'notifications@developster.com',
  });

  // Fetch masked credentials for UI
  const masked = await getMaskedWorkspaceCredentials(wsId);

  // Verify full secret is never leaked
  assert.ok(masked.gemini.isConfigured);
  assert.ok(masked.gemini.maskedKey.includes('••••••••'), 'Masks secret key with bullets');
  assert.equal(masked.gemini.maskedKey.includes('VerySecret'), false, 'Never leaks internal plaintext string');
  assert.equal(masked.email.hasPass, true, 'Exposes boolean hasPass flag only');
  assert.equal((masked.email as any).smtpPass, undefined, 'Raw password is never returned');
  assert.ok(masked.email.maskedUser.includes('***'), 'Email username is masked');
  assert.ok(masked.email.maskedUser.endsWith('@developster.com'), 'Email domain is preserved');
});

// ---------------------------------------------------------------------------
// TEST 13: Unauthorised Account Access Protection
// ---------------------------------------------------------------------------
test('Security Phase 2 — 13. Unauthorised Protected API Access Rejection', async () => {
  // 13A. Request with no cookie to /api/members -> 401
  const reqNoCookie = createMockRequest('http://localhost:3000/api/members');
  const resNoCookie = await getMembers(reqNoCookie);
  assert.equal(resNoCookie.status, 401);

  // 13B. Request with bogus string cookie -> 401
  const reqBogus = createMockRequest('http://localhost:3000/api/members', {
    cookies: { crm_session: 'bogus-invalid-cookie-token' },
  });
  const resBogus = await getMembers(reqBogus);
  assert.equal(resBogus.status, 401);

  // 13C. Request with empty email session payload -> 401
  const reqEmpty = createMockRequest('http://localhost:3000/api/auth/me');
  const resEmpty = await getMe(reqEmpty);
  assert.equal(resEmpty.status, 401);
});

// ---------------------------------------------------------------------------
// TEST 14: Password Reset Token Security & Consumption
// ---------------------------------------------------------------------------
test('Security Phase 2 — 14. Password Reset Token Generation, Expiration & Single-Use Consumption', () => {
  const email = 'user-reset@developster.com';

  // 14A. Token generation
  const { token, expiresAt } = createPasswordResetToken(email);
  assert.ok(token.includes('.'), 'Token has payload.signature structure');
  assert.ok(expiresAt > Date.now(), 'Token has valid future expiration');

  // 14B. Valid token verifies cleanly
  const verifyValid = verifyPasswordResetToken(token);
  assert.equal(verifyValid.valid, true);
  assert.equal(verifyValid.email, email);

  // 14C. Tampered reset token fails verification
  const [payloadB64, sig] = token.split('.');
  const tamperedToken = `${payloadB64}.${sig.slice(0, -4)}abcd`;
  const verifyTampered = verifyPasswordResetToken(tamperedToken);
  assert.equal(verifyTampered.valid, false);
  assert.equal(verifyTampered.error, 'Invalid token signature');

  // 14D. Single-use consumption: consuming the token revokes it
  consumePasswordResetToken(token);
  const verifyConsumed = verifyPasswordResetToken(token);
  assert.equal(verifyConsumed.valid, false, 'Consumed token cannot be reused');
  assert.ok(verifyConsumed.error?.includes('consumed or revoked'));
});
