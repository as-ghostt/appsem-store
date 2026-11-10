/**
 * Smoke de solo lectura contra la API pública de Cloudflare.
 * Backend apagado: HTTP 503, JSON. Backend de ensayo read-only: 404,
 * JSON desde Firestore real para un ID artificial no publicado.
 * Jamás realiza POST ni modifica métricas; no envía tokens ni PII.
 */
const dummyId = 'phase2-readiness-nonexistent-20261014';
const visitor = 'ab36d7b0-9a53-4e7a-a5fe-a8d54f2074ab';
const url = 'https://appsem-store.pages.dev/api/interaction?' +
  new URLSearchParams({ appId: dummyId, visitorId: visitor });

try {
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'manual',
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(20000)
  });
  const type = response.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) {
    throw new Error('Endpoint no devolvió JSON; puede ser un error de enrutamiento.');
  }
  let body;
  try { body = await response.json(); }
  catch { throw new Error('El endpoint respondió JSON inválido.'); }

  const disabled = response.status === 503 &&
    body?.error === 'Métricas del servidor todavía no habilitadas.';
  const readOnly = response.status === 404 &&
    body?.error === 'Aplicación no publicada.';
  if (!disabled && !readOnly) {
    throw new Error('Estado de la API inesperado: HTTP ' + response.status);
  }
  console.info(disabled ?
    'PASS: API real disponible, interacciones todavía deshabilitadas.' :
    'PASS: API real conectada a Firestore, ID ficticio no publicado rechazado sin escrituras.');
  console.info('Smoke de solo lectura: sin pruebas POST ni cambios de Firestore.');
} catch (error) {
  console.error('FAIL: comprobación HTTP externa de API: ' + error.message);
  process.exitCode = 1;
}
