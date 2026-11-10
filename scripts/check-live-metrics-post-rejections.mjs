/**
 * Smoke negativo de la API real. NO emplea tokens legítimos ni escribe datos.
 * Ejecutar en CI después de configurar servidor 'read-only' o 'true'.
 * Verifica que Cloudflare y el control Origin impiden solicitudes no autorizadas.
 */
const endpoint = 'https://appsem-store.pages.dev/api/interaction';
const fake = {
  action: 'like',
  appId: 'phase2-synthetic-no-real-app',
  visitorId: '672ee19a-b0dc-4957-873e-fa7f9b5dc4de',
  turnstileToken: 'not-a-valid-cloudflare-token'
};

async function post(headers) {
  const response = await fetch(endpoint, {
    method: 'POST',
    redirect: 'manual',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(fake),
    signal: AbortSignal.timeout(25000)
  });
  const type = response.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) {
    throw Error('Respuesta no JSON de la API de métricas.');
  }
  const body = await response.json();
  if (typeof body?.error !== 'string') {
    throw Error('Respuesta inválida; se esperaba un rechazo JSON.');
  }
  return { code: response.status, message: body.error };
}

try {
  const external = await post({ Origin: 'https://origin-not-allowed.example' });
  if (external.code === 503 &&
      (external.message === 'Registro de interacciones todavía no habilitado.' ||
       external.message === 'Métricas del servidor todavía no habilitadas.')) {
    if (process.env.METRICS_EXPECT_ACTIVE === 'true') {
      throw Error('Backend sigue en read-only cuando se esperaba escritura protegida activa.');
    }
    console.info('PASS: backend apagado/read-only; POST bloqueado antes de Firebase y Turnstile.');
  } else if (external.code === 403 && external.message === 'Origen no autorizado.') {
    const forged = await post({ Origin: 'https://appsem-store.pages.dev' });
    if (forged.code !== 403 ||
        forged.message !== 'No se pudo validar la interacción.') {
      throw Error('La API no rechazó correctamente el token Cloudflare falso: HTTP ' + forged.code);
    }
    console.info('PASS: backend live; Origin externo bloqueado y Turnstile rechazó token falso.');
    console.info('Ninguna solicitud enviada portaba un token válido; no se solicitaron escrituras.');
  } else {
    throw Error('Estado de API inesperado en prueba de origen: HTTP ' + external.code);
  }
} catch (error) {
  console.error('FAIL: smoke de seguridad de POST: ' + error.message);
  process.exitCode = 1;
}
