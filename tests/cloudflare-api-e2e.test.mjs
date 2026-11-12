import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { onRequest } from '../functions/api/interaction.js';

const origin = 'https://appsem-store.pages.dev';
const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
  .export({ type: 'pkcs8', format: 'pem' });
const env = {
  METRICS_BACKEND_ENABLED: 'true',
  PUBLIC_SITE_ORIGIN: origin,
  METRICS_HMAC_SECRET: 'test-only-HMAC-secret-for-AppsEM-metrics-0123456789abcdef',
  TURNSTILE_SECRET_KEY: 'test-only-turnstile-secret',
  FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
    type: 'service_account',
    project_id: 'webs-8b1bf',
    client_email: 'integration@webs-8b1bf.iam.gserviceaccount.com',
    private_key: privateKey
  })
};
const body = {
  action: 'like', appId: 'synthetic-published-app',
  visitorId: '672ee19a-b0dc-4957-873e-fa7f9b5dc4de',
  turnstileToken: 'synthetic-approved-token-for-tests'
};
const ip = '203.0.113.42';
function req(data, headers = {}) {
  return new Request(origin + '/api/interaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin,
      'CF-Connecting-IP': ip, ...headers },
    body: JSON.stringify(data)
  });
}

test('Cloudflare POST with valid mocked Turnstile writes one atomic transaction', async () => {
  const original = globalThis.fetch;
  const writes = [];
  let verified = 0, oauth = 0;
  globalThis.fetch = async (url, options = {}) => {
    const endpoint = String(url);
    if (endpoint === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
      verified++;
      const value = JSON.parse(options.body);
      assert.equal(value.secret, env.TURNSTILE_SECRET_KEY);
      assert.equal(value.response, body.turnstileToken);
      assert.equal(value.remoteip, ip);
      return Response.json({ success: true, hostname: 'appsem-store.pages.dev', action: 'appsem-metrics' });
    }
    if (endpoint === 'https://oauth2.googleapis.com/token') {
      oauth++;
      return Response.json({ access_token: 'synthetic-access-token', expires_in: 3600 });
    }
    if (endpoint.includes('firestore.googleapis.com/v1/projects/webs-8b1bf/databases/(default)/documents')) {
      assert.match(options.headers.authorization, /^Bearer /);
      if (endpoint.endsWith(':beginTransaction')) return Response.json({ transaction: 'synthetic-transaction' });
      if (endpoint.endsWith(':commit')) {
        const request = JSON.parse(options.body);
        assert.equal(request.transaction, 'synthetic-transaction');
        writes.push(...request.writes);
        return Response.json({ commitTime: new Date().toISOString() });
      }
      if (endpoint.endsWith(':rollback')) return Response.json({});
      if (endpoint.includes('/apps/synthetic-published-app?')) {
        return Response.json({ fields: {
          status: { stringValue: 'published' },
          likesCount: { integerValue: '2' }
        } });
      }
      return Response.json({ error: { status: 'NOT_FOUND' } }, { status: 404 });
    }
    throw Error('Fetch inesperado: ' + endpoint);
  };
  try {
    const response = await onRequest({ request: req(body), env });
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.deepEqual(payload, { action: 'like', alreadyRecorded: false });
    assert.equal(verified, 1);
    assert.equal(oauth, 1);
    assert.equal(writes.length, 3);
    assert.match(writes[0].update.name, /\/apps\/synthetic-published-app\/likes\/[0-9a-f]{64}$/);
    assert.equal(writes[0].currentDocument.exists, false);
    assert.equal(writes[1].transform.document.endsWith('/apps/synthetic-published-app'), true);
    assert.equal(writes[1].transform.fieldTransforms.find(f => f.fieldPath === 'likesCount')?.increment.integerValue, '1');
    assert.match(writes[2].update.name, /\/metricsLimits\//);
    assert.equal(writes[2].update.fields.count.integerValue, '1');
  } finally {
    globalThis.fetch = original;
  }
});

test('Cloudflare active POST rejects forged Origin without contacting remote services', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = () => { throw Error('No se debe llamar al servidor'); };
  try {
    const response = await onRequest({ request: req(body, { Origin: 'https://fake.example' }), env });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'Origen no autorizado.' });
  } finally { globalThis.fetch = original; }
});

test('Cloudflare read-only mode rejects POST before verifying Turnstile', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = () => { throw Error('No se debe llamar al servidor'); };
  try {
    const response = await onRequest({ request: req(body), env: { ...env, METRICS_BACKEND_ENABLED: 'read-only' } });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /todavía no habilitado/);
  } finally { globalThis.fetch = original; }
});

test('Cloudflare POST with invalid mocked Turnstile never contacts Firestore', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async url => {
    assert.equal(String(url), 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    calls++;
    return Response.json({ success: false, 'error-codes': ['invalid-input-response'] });
  };
  try {
    const response = await onRequest({ request: req(body), env });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, 'No se pudo validar la interacción.');
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});
