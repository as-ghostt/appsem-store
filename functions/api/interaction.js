/** Cloudflare Pages Functions implementation of the verified metrics endpoint. */
import { PublicError, getInteractionStatus, recordInteraction, validateInteraction } from '../../server/metricsCore.js';
import { getMetricsFirestoreRest } from '../../server/firestoreRest.js';
import { verifyTurnstile } from '../../server/verifyTurnstile.js';

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status, headers: { 'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  });
}

export async function onRequest({ request, env }) {
  if (!['GET', 'POST'].includes(request.method)) return json(405, { error: 'Método no permitido.' });
  try {
    const mode = env.METRICS_BACKEND_ENABLED;
    if (mode !== 'true' && mode !== 'read-only') {
      throw new PublicError(503, 'Métricas del servidor todavía no habilitadas.');
    }
    if (mode === 'read-only' && request.method !== 'GET') {
      throw new PublicError(503, 'Registro de interacciones todavía no habilitado.');
    }
    const origin = env.PUBLIC_SITE_ORIGIN;
    const secret = env.METRICS_HMAC_SECRET;
    const turnstileSecret = env.TURNSTILE_SECRET_KEY;
    if (!origin || new URL(origin).protocol !== 'https:' ||
        origin !== new URL(request.url).origin || !secret || secret.length < 32 ||
        !turnstileSecret || !env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      throw new PublicError(503, 'Servicio no configurado.');
    }
    if (request.headers.get('Origin') && request.headers.get('Origin') !== origin) {
      throw new PublicError(403, 'Origen no autorizado.');
    }
    // Pages Functions receives this header from Cloudflare ingress.
    const ip = request.headers.get('CF-Connecting-IP') || '';
    if (!ip || ip.length > 64 || !/^[a-fA-F0-9.:]+$/.test(ip)) {
      throw new PublicError(400, 'IP de origen no disponible.');
    }
    const { db, FieldValue } = getMetricsFirestoreRest(env.FIREBASE_SERVICE_ACCOUNT_JSON);
    if (request.method === 'GET') {
      const params = new URL(request.url).searchParams;
      const output = await getInteractionStatus({
        db, appId: params.get('appId'), visitorId: params.get('visitorId'), secret
      });
      return json(200, output);
    }
    if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') {
      throw new PublicError(415, 'Se requiere JSON.');
    }
    const declared = request.headers.get('content-length');
    if (declared && (!Number.isSafeInteger(Number(declared)) || Number(declared) > 8192)) {
      throw new PublicError(413, 'Tamaño de solicitud no permitido.');
    }
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 8192) {
      throw new PublicError(413, 'Tamaño de solicitud no permitido.');
    }
    let payload;
    try { payload = JSON.parse(raw); } catch { throw new PublicError(400, 'JSON inválido.'); }
    const interaction = validateInteraction(payload);
    if (request.headers.get('Origin') !== origin) {
      throw new PublicError(403, 'Origen requerido para registrar interacciones.');
    }
    await verifyTurnstile({ token: interaction.turnstileToken, ip,
      secret: turnstileSecret, expectedHostname: new URL(origin).hostname });
    const output = await recordInteraction({ db, FieldValue, payload: interaction, ip, secret });
    return json(200, output);
  } catch (error) {
    const status = error instanceof PublicError ? error.status : 503;
    if (!(error instanceof PublicError)) console.error('metrics backend unavailable:', error?.message);
    return json(status, { error: error instanceof PublicError ? error.message : 'Interacción temporalmente no disponible.' });
  }
}
