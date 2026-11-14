import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateInteraction, validateDownloadTarget, nextRating, keyedHash,
  recordInteraction, getInteractionStatus, PublicError
} from '../server/metricsCore.js';

const secret = '1234567890123456789012345678901234567';
const visitorId = 'e4c7c97a-8789-4c4d-90f4-253518a62ad0';
const token = 'fake-turnstile-valid-in-unit-tests';
const sample = { action: 'like', appId: 'testapp', visitorId, turnstileToken: token };

function mockDb() {
  const docs = new Map([
    ['apps/testapp', {
      status: 'published', playStoreUrl: 'https://play.google.com/store/apps/details?id=abc',
      likesCount: 0, ratingCount: 0, ratingAverage: 0, downloadsCount: 0
    }],
    ['apps/draft', { status: 'draft' }]
  ]);
  const db = {
    doc(path) {
      return {
        path,
        async get() {
          return { exists: docs.has(path), data: () => docs.get(path) };
        }
      };
    },
    async runTransaction(fn) {
      const changes = [];
      const tx = {
        async get(ref) { return ref.get(); },
        create(ref, data) {
          changes.push(() => {
            assert.equal(docs.has(ref.path), false);
            docs.set(ref.path, data);
          });
        },
        set(ref, data) { changes.push(() => docs.set(ref.path, data)); },
        update(ref, update) {
          changes.push(() => {
            const item = docs.get(ref.path);
            docs.set(ref.path, { ...item, ...Object.fromEntries(Object.entries(update).map(
              ([k, v]) => [k, v?.delta !== undefined ? Number(item[k] || 0) + v.delta : v]
            )) });
          });
        }
      };
      const output = await fn(tx);
      changes.forEach(f => f());
      return output;
    }
  };
  const FieldValue = {
    serverTimestamp() { return new Date('2026-10-14T00:00:00Z'); },
    increment(delta) { return { delta }; }
  };
  return { db, docs, FieldValue };
}

test('Validación estricta de acción, puntuación y solicitudes', () => {
  assert.deepEqual(validateInteraction(sample).action, 'like');
  for (const wrong of [
    { ...sample, appId: '../../secret' },
    { ...sample, action: 'delete' },
    { ...sample, turnstileToken: '' },
    { ...sample, injected: true },
    { ...sample, rating: 5 },
    { ...sample, visitorId: 'x' },
    { ...sample, action: 'rating', rating: 3.4 },
    { ...sample, action: 'rating', rating: 7 }
  ]) assert.throws(() => validateInteraction(wrong), PublicError);
});

test('HMAC ofusca el identificador, cambia con el secreto', () => {
  assert.match(keyedHash(secret, 'visitor', visitorId), /^[a-f0-9]{64}$/);
  assert.notEqual(keyedHash(secret, 'visitor', visitorId), visitorId);
  assert.notEqual(keyedHash(secret, 'visitor', visitorId), keyedHash(secret, 'ip', visitorId));
});

test('Solo descarga a URL oficial idéntica a la configurada', () => {
  const app = { playStoreUrl: 'https://play.google.com/store/apps/details?id=abc' };
  assert.equal(validateDownloadTarget(app, app.playStoreUrl), app.playStoreUrl);
  for (const url of ['javascript:alert(1)', 'http://play.google.com/', 'https://127.0.0.1/']) {
    assert.throws(() => validateDownloadTarget({ playStoreUrl: url }, url), PublicError);
  }
  assert.throws(() => validateDownloadTarget(app, 'https://play.google.com/store/apps/details?id=otra'), PublicError);
  const direct = { playStoreUrl: app.playStoreUrl, apkUrl: 'https://releases.example.com/apps/app.apk' };
  assert.equal(validateDownloadTarget(direct, direct.apkUrl), direct.apkUrl);
  assert.throws(() => validateDownloadTarget(direct, 'https://otro.example.com/app.apk'), PublicError);
});

test('Cálculo de ratings compatible con campos históricos', () => {
  assert.deepEqual(nextRating({ ratingCount: 2, ratingAverage: 4.5, ratingSum: 0 }, 5),
    { ratingCount: 3, ratingSum: 14, ratingAverage: 4.67 });
  assert.deepEqual(nextRating({ ratingCount: 0 }, 4),
    { ratingCount: 1, ratingSum: 4, ratingAverage: 4 });
  assert.throws(() => nextRating({ ratingCount: 2, ratingAverage: 0, ratingSum: 0 }, 4), PublicError);
});

test('Las valoraciones históricas con ratingCount=1, promedio=5 y ratingSum=0 se recuperan al votar', () => {
  const historic = { ratingCount: 1, ratingAverage: 5, ratingSum: 0 };
  // El backend toma el promedio histórico correcto como base y no lo pierde.
  assert.deepEqual(nextRating(historic, 4), {
    ratingCount: 2, ratingSum: 9, ratingAverage: 4.5
  });
  assert.deepEqual(nextRating(historic, 5), {
    ratingCount: 2, ratingSum: 10, ratingAverage: 5
  });
  // La comprobación de cálculo NO modifica el documento histórico.
  assert.deepEqual(historic, { ratingCount: 1, ratingAverage: 5, ratingSum: 0 });
});

test('Like: una sola operación por visitante, contador+evento+rate limit atómicos', async () => {
  const { db, docs, FieldValue } = mockDb();
  const params = { db, FieldValue, payload: sample, ip: '198.51.100.15', secret };
  assert.equal((await recordInteraction(params)).alreadyRecorded, false);
  assert.equal((await recordInteraction(params)).alreadyRecorded, true);
  assert.equal(docs.get('apps/testapp').likesCount, 1);
  assert.equal([...docs.keys()].filter(p => p.includes('/likes/')).length, 1);
});

test('Rating: anti-duplicados y promedio actualizado por servidor', async () => {
  const { db, docs, FieldValue } = mockDb();
  const params = { db, FieldValue,
    payload: { ...sample, action: 'rating', rating: 4 },
    ip: '198.51.100.16', secret };
  assert.equal((await recordInteraction(params)).ratingAverage, 4);
  assert.equal((await recordInteraction(params)).alreadyRecorded, true);
  assert.equal(docs.get('apps/testapp').ratingCount, 1);
});

test('Download: deduplicación temporal por usuario, contador y destino de catálogo', async () => {
  const { db, docs, FieldValue } = mockDb();
  const p = {
    db, FieldValue, payload: { ...sample, action: 'download', targetUrl: 'https://play.google.com/store/apps/details?id=abc' },
    ip: '198.51.100.17', secret, now: 1700000000000
  };
  assert.equal((await recordInteraction(p)).alreadyRecorded, false);
  assert.equal((await recordInteraction(p)).alreadyRecorded, true);
  assert.equal(docs.get('apps/testapp').downloadsCount, 1);
  assert.equal((await recordInteraction({ ...p, now: p.now + 16 * 60000 })).alreadyRecorded, false);
  assert.equal(docs.get('apps/testapp').downloadsCount, 2);
});

test('Draft: no escritura y ningún contador afectado', async () => {
  const { db, FieldValue } = mockDb();
  await assert.rejects(recordInteraction({
    db, FieldValue, payload: { ...sample, appId: 'draft' },
    ip: '198.51.100.19', secret
  }), PublicError);
});

test('Lectura de estado usa HMAC sin exponer información de borradores', async () => {
  const { db, FieldValue } = mockDb();
  await recordInteraction({ db, FieldValue, payload: sample, ip: '198.51.100.20', secret });
  const status = await getInteractionStatus({ db, appId: 'testapp', visitorId, secret });
  assert.deepEqual(status, { liked: true, rated: null });
  await assert.rejects(getInteractionStatus({ db, appId: 'draft', visitorId, secret }), PublicError);
});

test('Límite por IP/bucket bloquea envío de identidades arbitrarias adicionales', async () => {
  const { db, FieldValue } = mockDb();
  for (let i = 0; i < 12; i++) {
    await recordInteraction({ db, FieldValue, payload: { ...sample,
      visitorId: 'identity-' + String(i).padStart(12, '0') }, ip: '198.51.100.30', secret, now: 1700000000000 });
  }
  await assert.rejects(recordInteraction({ db, FieldValue,
    payload: { ...sample, visitorId: 'identity-xxxxxxxxxxxx' }, ip: '198.51.100.30', secret, now: 1700000000000
  }), err => err instanceof PublicError && err.status === 429);
});


test('Compatibilidad de eventos heredados: no se duplican likes/ratings antiguos', async () => {
  const { db, docs, FieldValue } = mockDb();
  docs.set('apps/testapp/likes/' + visitorId, { createdAt: new Date() });
  docs.set('apps/testapp/ratings/' + visitorId, { rating: 3, createdAt: new Date() });
  const baseline = new Date('2026-10-14T00:00:00Z').getTime();
  const like = await recordInteraction({
    db, FieldValue, payload: sample, ip: '198.51.100.98', secret, now: baseline
  });
  const rating = await recordInteraction({
    db, FieldValue, payload: { ...sample, action: 'rating', rating: 5 },
    ip: '198.51.100.98', secret, now: baseline
  });
  assert.equal(like.alreadyRecorded, true);
  assert.deepEqual({ alreadyRecorded: rating.alreadyRecorded, rating: rating.rating },
    { alreadyRecorded: true, rating: 3 });
  assert.equal(docs.get('apps/testapp').likesCount, 0);
  assert.equal(docs.get('apps/testapp').ratingCount, 0);
  assert.deepEqual(await getInteractionStatus({ db, appId: 'testapp', visitorId, secret }),
    { liked: true, rated: 3 });
});


test('Comentario: válido, enviado pendiente y no duplicable en la misma ventana', async () => {
  const { db, docs, FieldValue } = mockDb();
  const req = {
    db, FieldValue, secret, ip: '198.51.100.61',
    payload: { ...sample, action: 'comment', name: '  María  ',
      comment: '  Excelente aplicación, felicitaciones  ' }, now: 1700000000000
  };
  const first = await recordInteraction(req);
  const second = await recordInteraction(req);
  assert.deepEqual(first, { action: 'comment', alreadyRecorded: false, status: 'pending' });
  assert.deepEqual(second, { action: 'comment', alreadyRecorded: true, status: 'pending' });
  const entries = [...docs.entries()].filter(([path]) => path.includes('/comments/'));
  assert.equal(entries.length, 1);
  assert.equal(entries[0][1].approved, false);
  assert.equal(entries[0][1].name, 'María');
});
test('Comentario: valida contenido y rechaza campos extras en otras acciones', () => {
  for (const wrong of [
    { ...sample, action: 'comment', name: 'A', comment: 'Hola mundo' },
    { ...sample, action: 'comment', name: 'Ana', comment: 'Mal' },
    { ...sample, action: 'comment', name: 'Ana', comment: 'x'.repeat(801) },
    { ...sample, name: 'Campo inesperado' }
  ]) assert.throws(() => validateInteraction(wrong), PublicError);
});
test('Comentarios: 3 por IP/15 minutos, aunque se modifique el ID del visitante', async () => {
  const { db, FieldValue } = mockDb();
  for (let i = 0; i < 3; i++) {
    const req = { db, FieldValue, secret, ip: '198.51.100.62', now: 1700000000000,
      payload: { ...sample, action: 'comment',
        visitorId: 'visitor-comments-' + String(i).padStart(8,'0'),
        name: 'Ana', comment: 'Comentario distinto #' + i + ' de ensayo' } };
    assert.equal((await recordInteraction(req)).alreadyRecorded, false);
  }
  await assert.rejects(recordInteraction({ db, FieldValue, secret, ip: '198.51.100.62',
    now: 1700000000000,
    payload: { ...sample, action: 'comment', name: 'Ana',
      comment: 'Un cuarto comentario de prueba' }
  }), err => err instanceof PublicError && err.status === 429);
});

test('GET de app ausente o borrador no consulta 4 registros de interacción', async () => {
  for (const [appId, published] of [['missing-app', null], ['draft-app', false]]) {
    const queried = [];
    const db = {
      doc(path) {
        return {
          async get() {
            queried.push(path);
            if (published === null) return { exists: false };
            return { exists: true, data: () => ({ status: 'draft' }) };
          }
        };
      }
    };
    await assert.rejects(
      getInteractionStatus({ db, appId, visitorId, secret }),
      error => error instanceof PublicError && error.status === 404
    );
    assert.deepEqual(queried, ['apps/' + appId],
      'No consultar likes/ratings ni IDs heredadas cuando la app no es pública');
  }
});
