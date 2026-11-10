/** Firestore REST adapter for Cloudflare Pages Functions.
 * Keeps the atomic transaction contract of server/metricsCore.js.
 * Server-only service account. Never expose FIREBASE_SERVICE_ACCOUNT_JSON in VITE_*.
 */
const PROJECT = 'webs-8b1bf';
const API = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const DATABASE = `projects/${PROJECT}/databases/(default)`;
const SCOPE = 'https://www.googleapis.com/auth/datastore';
const OP = Symbol('firestore-field-transform');
let cachedToken;

export const FieldValue = Object.freeze({
  serverTimestamp: () => ({ [OP]: 'timestamp' }),
  increment: (amount) => ({ [OP]: 'increment', amount })
});

function toBase64Url(bytes) {
  const array = bytes instanceof Uint8Array ? bytes : new TextEncoder().encode(bytes);
  let binary = '';
  for (const b of array) binary += String.fromCharCode(b);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function googleAccessToken(json) {
  if (!json) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON no configurado.');
  let account;
  try { account = JSON.parse(json); } catch { throw new Error('Cuenta de servicio inválida.'); }
  if (account.project_id !== PROJECT || account.type !== 'service_account' ||
      typeof account.client_email !== 'string' || !account.client_email.endsWith('.gserviceaccount.com') ||
      typeof account.private_key !== 'string' || !account.private_key.startsWith('-----BEGIN PRIVATE KEY-----')) {
    throw new Error('Cuenta de servicio no autorizada para AppsEM.');
  }
  const identity = account.client_email;
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken?.identity === identity && cachedToken.exp > now + 120) return cachedToken.value;
  const pem = account.private_key.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const keyBytes = Uint8Array.from(atob(pem), ch => ch.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const header = toBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = toBase64Url(JSON.stringify({ iss: identity, scope: SCOPE,
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const unsigned = `${header}.${claims}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const assertion = `${unsigned}.${toBase64Url(new Uint8Array(signature))}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
  });
  if (!response.ok) throw new Error('OAuth de Firebase no autorizado.');
  const token = await response.json();
  if (typeof token.access_token !== 'string') throw new Error('Google no entregó token de servicio.');
  cachedToken = { identity, value: token.access_token,
    exp: now + Math.min(Number(token.expires_in) || 3600, 3600) };
  return cachedToken.value;
}

class FirestoreRequestError extends Error {
  constructor(status, code) { super(`Firestore REST ${status}`); this.status = status; this.code = code; }
}

function fromValue(value) {
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return new Date(value.timestampValue);
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromValue);
  if ('mapValue' in value) return fromFields(value.mapValue.fields || {});
  return null;
}
function fromFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fromValue(value)]));
}
function toValue(value) {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.isSafeInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toValue) } };
  if (typeof value === 'object') return { mapValue: { fields: toFields(value) } };
  throw new Error('Valor de Firestore no admitido.');
}
function toFields(data) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, toValue(value)]));
}
function splitFields(data) {
  const fields = {};
  const transforms = [];
  for (const [fieldPath, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && value[OP]) {
      if (value[OP] === 'timestamp') transforms.push({ fieldPath, setToServerValue: 'REQUEST_TIME' });
      else if (value[OP] === 'increment') {
        if (!Number.isSafeInteger(value.amount)) throw new Error('Incremento inválido.');
        transforms.push({ fieldPath, increment: { integerValue: String(value.amount) } });
      }
    } else fields[fieldPath] = toValue(value);
  }
  return { fields, transforms };
}
function writeFor(kind, name, data) {
  const { fields, transforms } = splitFields(data);
  if (kind === 'update' && !Object.keys(fields).length) {
    return { transform: { document: name, fieldTransforms: transforms }, currentDocument: { exists: true } };
  }
  const out = { update: { name, fields } };
  if (kind === 'create') out.currentDocument = { exists: false };
  if (kind === 'update') {
    out.currentDocument = { exists: true };
    out.updateMask = { fieldPaths: Object.keys(fields) };
  }
  if (transforms.length) out.updateTransforms = transforms;
  return out;
}

function snapshot(data) {
  return { exists: !!data, data: () => data ? fromFields(data.fields || {}) : undefined };
}
function pathName(path) {
  if (!/^[\w-]+(?:\/[\w-]+)+$/.test(path) || path.split('/').length % 2 !== 0) {
    throw new Error('Ruta de documento inválida.');
  }
  return `${DATABASE}/documents/${path}`;
}

export function getMetricsFirestoreRest(serviceAccountJson) {
  async function request(relative, { method = 'GET', body, notFoundAllowed = false } = {}) {
    const token = await googleAccessToken(serviceAccountJson);
    const response = await fetch(API + relative, {
      method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    if (notFoundAllowed && response.status === 404) return null;
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new FirestoreRequestError(response.status, data.error?.status || 'UNKNOWN');
    }
    return response.json();
  }
  async function get(name, transaction) {
    const path = name.slice((DATABASE + '/documents').length);
    const params = transaction ? `?transaction=${encodeURIComponent(transaction)}` : '';
    const doc = await request(path + params, { notFoundAllowed: true });
    return snapshot(doc);
  }
  const db = {
    doc(path) {
      const name = pathName(path);
      return { name, get: () => get(name) };
    },
    async runTransaction(run) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const started = await request(':beginTransaction', { method: 'POST', body: { options: { readWrite: {} } } });
        const transaction = started.transaction;
        if (!transaction) throw new Error('Firestore no inició la transacción.');
        const writes = [];
        let committed = false;
        try {
          const tx = {
            get: (ref) => get(ref.name, transaction),
            create: (ref, data) => writes.push(writeFor('create', ref.name, data)),
            update: (ref, data) => writes.push(writeFor('update', ref.name, data)),
            set: (ref, data) => writes.push(writeFor('set', ref.name, data))
          };
          const result = await run(tx);
          if (writes.length) await request(':commit', { method: 'POST', body: { writes, transaction } });
          else await request(':rollback', { method: 'POST', body: { transaction } });
          committed = true;
          return result;
        } catch (error) {
          if (!committed) {
            try { await request(':rollback', { method: 'POST', body: { transaction } }); } catch { /* best effort */ }
          }
          if (error instanceof FirestoreRequestError && error.code === 'ABORTED' && attempt < 2) continue;
          throw error;
        }
      }
      throw new Error('Transacción de Firestore agotó reintentos.');
    }
  };
  return { db, FieldValue };
}
