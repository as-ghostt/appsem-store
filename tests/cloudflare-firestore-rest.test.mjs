import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { getMetricsFirestoreRest } from '../server/firestoreRest.js';
import { onRequest } from '../functions/api/interaction.js';

test('Cloudflare API returns safe disabled response without secrets', async () => {
  const response = await onRequest({
    request: new Request('https://appsem-store.pages.dev/api/interaction?appId=fake&visitorId=visitor000'),
    env: {}
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'Métricas del servidor todavía no habilitadas.' });
});

test('Firestore REST uses atomic writes for event, counter and rate limit', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const account = JSON.stringify({ type: 'service_account', project_id: 'webs-8b1bf',
    client_email: 'qa@webs-8b1bf.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
  const previousFetch = globalThis.fetch;
  const writes = [];
  globalThis.fetch = async (input, opts = {}) => {
    const url = String(input);
    if (url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'mock', expires_in: 3600 });
    if (url.endsWith(':beginTransaction')) return Response.json({ transaction: 'synthetic-txn' });
    if (url.endsWith(':rollback')) return Response.json({});
    if (url.endsWith(':commit')) {
      writes.push(...JSON.parse(opts.body).writes);
      return Response.json({ commitTime: '2026-11-10T00:00:00Z' });
    }
    if (url.includes('/apps/app1')) return Response.json({
      fields: { status: { stringValue: 'published' }, likesCount: { integerValue: '7' } }
    });
    throw new Error('Unexpected mock endpoint');
  };
  try {
    const { db, FieldValue } = getMetricsFirestoreRest(account);
    const output = await db.runTransaction(async tx => {
      const app = await tx.get(db.doc('apps/app1'));
      assert.equal(app.data().likesCount, 7);
      tx.create(db.doc('apps/app1/likes/unique'), { createdAt: FieldValue.serverTimestamp() });
      tx.update(db.doc('apps/app1'), { likesCount: FieldValue.increment(1),
        metricsUpdatedAt: FieldValue.serverTimestamp() });
      tx.set(db.doc('metricsLimits/window'), { count: 1, expiresAt: new Date('2026-11-10') });
      return 'ok';
    });
    assert.equal(output, 'ok');
    assert.equal(writes.length, 3);
    assert.equal(writes[0].currentDocument.exists, false);
    assert.equal(writes[1].transform.fieldTransforms[0].increment.integerValue, '1');
    assert.equal(writes[2].update.fields.count.integerValue, '1');
  } finally { globalThis.fetch = previousFetch; }
});
