# FASE 2 — Métricas seguras (tienda pública)

**Fecha:** 14/10/2026. **Estado:** backend implementado y conectado por bandera de activación; **NO ACTIVO EN PRODUCCIÓN** hasta configurar Vercel y desplegar las reglas coordinadamente.

Comparte Firebase `webs-8b1bf` con `eler30mr-star/appsem-store-admin`. El fichero de reglas vigente fue facilitado por el propietario y se conserva en el repositorio Admin. No publicar unilateralmente ninguno de los archivos `firestore.rules` antiguos.

## Qué está implementado

- Endpoint Vercel `/api/interaction`: GET para estado del visitante y POST para `like`, `rating` y `download`.
- Vercel valida el token con Cloudflare Turnstile **Siteverify**: hostname y action exactos. Token obligatorio y de un solo uso.
- Los datos se escriben desde el servidor con Firebase Admin SDK. Nunca se entrega una credencial del servidor al navegador.
- Firestore transaction para comprobar app publicada, comprobar evento único, limitar operaciones por IP/ventana de 15 minutos, crear evento y actualizar contador juntos. Las escrituras directas desde navegador se bloquearán **únicamente al publicar** las nuevas reglas de Fase 2.
- IDs de visitante e IP se convierten en HMAC-SHA-256 con secreto del servidor; no se guardan IPs en claro. **Un ID de navegador puede borrarse o falsificarse**: esto no equivale a identidad inmutable ni elimina por completo fraude distribuido. Turnstile + cuota reducen abuso, no lo imposibilitan.
- Likes/ratings antiguos registrados con ID de localStorage se reconocen para evitar duplicación tras el cambio.
- Destino de descarga HTTPS debe coincidir exactamente con la URL configurada por el administrador.
- El cliente usa el backend solo si `VITE_METRICS_BACKEND=server`. **Por defecto se conserva la ruta antigua de Firestore** y no se interrumpen las interacciones públicas antes del lanzamiento coordinado.
- Ningún secreto está versionado en el repositorio.

## Variables de Vercel, únicamente cuando se decida activar

Configurar en el **proyecto Vercel de la tienda pública**, Settings -> Environment Variables:

| Variable | Ámbito | Valor |
|---|---|---|
| `METRICS_BACKEND_ENABLED` | Servidor | `true` |
| `PUBLIC_SITE_ORIGIN` | Servidor | `https://appsem-store.vercel.app` (ajustar si la URL canónica difiere) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | **Secreto de servidor** | JSON de cuenta de servicio de Firebase `webs-8b1bf`, solo Vercel Server (nunca `VITE_`) |
| `METRICS_HMAC_SECRET` | **Secreto de servidor** | Cadena aleatoria de al menos 32 caracteres, estable entre despliegues |
| `TURNSTILE_SECRET_KEY` | **Secreto de servidor** | Secreto Cloudflare Turnstile Siteverify |
| `VITE_TURNSTILE_SITE_KEY` | Build público | Sitekey pública Cloudflare Turnstile para el dominio de la tienda |
| `VITE_METRICS_BACKEND` | Build público | `server` **solo al activar conjuntamente backend + reglas** |

Usar claves restringidas y de mínimo privilegio. No insertar el JSON de la cuenta de servicio en GitHub, navegador, documentos públicos o chat. El SDK Admin necesita permiso para leer/escribir `apps` y subcolecciones y mantener `metricsLimits`; preferir identidad de servicio con permisos ajustados. Vercel/Cloudflare tienen cuotas y términos propios; no presuponer infraestructura gratuita ilimitada.

## Orden seguro de activación

1. Confirmar que el archivo de respaldo cifrado real de Firestore se puede **descifrar y recuperar** en un emulador aislado. El mero hecho de existir en GitHub no demuestra recuperación.
2. Probar un entorno separado mediante Firestore Emulator y credenciales *de prueba*, no contra los datos reales. Ejecutar `npm run test:security` (unidad) y `npm run lint`; usar la suite de reglas de Admin para los permisos.
3. Crear Turnstile con hostname **exacto** de la tienda y configurar en Vercel los secretos de servidor. **Nunca** publicar un frontend en modo `server` mientras el backend no esté respondiendo.
4. Probar en preview controlada GET/POST con un catálogo ficticio; revisar que URLs, likes, rating y clics funcionan y no se duplican. Las credenciales de servidor siempre deben referirse a un entorno de prueba en preview.
5. Planificar ventana de publicación **coordinada** para cambiar cliente a `server` y publicar la candidata de reglas en Firebase Console. El fichero candidato vive en `appsem-store-admin/docs/fase-02/firestore.hardened.rules`; su despliegue anticipado bloquearía las acciones actuales.
6. Comprobar errores de permisos, eventos y contadores reales tras el cambio, con un camino de reversión documentado. Si la verificación anti-bot falla, el servidor **rechaza la escritura**, sin caer silenciosamente al cliente inseguro.
7. Decidir retención de `metricsLimits` y política de limpieza de eventos, considerando cuota/costo de Firestore. Los documentos de cuota contienen `expiresAt` para limpieza/TTL programado; **TTL no está configurado automáticamente**.

## Límites conocidos

- El sistema NO prueba que una descarga sea una instalación real: cuenta clics.
- Las identidades anónimas reiniciables, proxies y retos anti-bot superados por granjas no son infalibles; el riesgo residual necesita monitoreo.
- Rating promedio histórico puede estar redondeado; este backend preserva compatibilidad y mantiene suma/cantidad en nuevas interacciones. Conciliación completa corresponde a Fase 3.
- Exigir Turnstile añade un paso al visitante. El widget se muestra solo cuando se activa la ruta nueva.
- Servicio Admin SDK y página pública requieren configuración real; CI trabaja con datos ficticios y **no confirma** despliegue productivo.
- El endpoint GET consulta varios documentos para comprobar el estado del visitante; se deben aplicar límites de tráfico/WAF en Vercel en producción para proteger cuotas y facturación.

## Pruebas

Workflow `Fase 2 - API y seguridad de métricas` ejecuta `node --test tests/*.test.mjs`, ESLint y compilación Vite aislada del prerender remoto. Los tests de reglas y acceso Admin se ejecutan por separado en la suite `appsem-store-admin` con Firebase Emulator. NO se conectan a Firebase real.

**No marcar Fase 2 como completada ni afirmar que se bloquean actualmente los incrementos directos públicos** hasta activar backend y publicar reglas compatibles de forma coordinada.


## Endurecimiento adicional — 14/10/2026

- API: POST exige `Origin` exacto, JSON y un `Content-Length` válido dentro del límite, antes de verificar Turnstile o escribir en Firestore. Estos encabezados no reemplazan Turnstile ni la limitación de cuota.
- Se agregó una ruta **solo para pruebas en Emulator** al módulo del SDK Admin. Requiere simultáneamente `METRICS_EMULATOR_TEST=true`, `FIRESTORE_EMULATOR_HOST` en loopback puerto 8080, `GCLOUD_PROJECT=demo-*` y ausencia de entorno Vercel; jamás permite apuntar al proyecto real.
- Validación de variables de compilación: JSON sintácticamente válido, `project_id=webs-8b1bf`, tipo y estructura de cuenta de servicio correctos, HTTPS. **El chequeo es estructural:** no verifica que la clave sea real, tenga permisos o que el backend de Vercel esté desplegado.
- Pruebas de API HTTP completa y del SDK Admin en Firebase Emulator se administran desde `appsem-store-admin` (CI integrada). Ningún dato real es consultado.


## Comentarios con protección antispam (14/10/2026)

Se agrega la acción `comment` en la misma API segura y la tienda la utilizará **solo cuando** `VITE_METRICS_BACKEND=server`. Se comprueban tamaño/nombre, app publicada, verificación Turnstile, idempotencia por contenido dentro de una ventana de 15 minutos y máximo tres comentarios por IP y ventana (límite compartido entre apps). El backend crea registros con `approved: false`, que después modera Admin como antes.

**Condición de despliegue:** las reglas candidatas ahora negarán las creaciones públicas directas de comentarios; no publicarlas mientras algún cliente de tienda todavía use la ruta anterior. Los comentarios anteriores permanecen intactos. Es protección contra spam básico, no garantía contra abuso distribuido.

## Ensayo productivo de solo lectura — sin activar interacciones (octubre de 2026)

El build de la tienda ejecuta `scripts/check-phase2-live-readiness.mjs`, pero únicamente hace solicitudes externas cuando `PHASE2_READINESS_CHECK=true` **y** `VERCEL_ENV=production` y las dos banderas funcionales del backend/client siguen apagadas. Este chequeo consulta Firestore con la cuenta de servicio **leyendo como máximo un documento**, nunca escribe y nunca imprime contenidos. Además realiza un Siteverify **negativo** con un token deliberadamente inválido y exige el error esperado `invalid-input-response`, rechazando `invalid-input-secret`. Si algo falla el nuevo build no se publica; el despliegue anterior continúa activo.

Precisión: un rechazo correcto de token falso demuestra conexión con Cloudflare y procesamiento de esa solicitud, **no equivale a demostrar que un token legítimo de usuario pasa**. Ese ensayo positivo, el comportamiento real de la interfaz y la coordinación con reglas nuevas siguen pendientes.

Configurar temporalmente `PHASE2_READINESS_CHECK=true` solo en Production de Vercel para disparar una compilación controlada; al terminar, cambiar su valor a `false`. La prueba de GitHub Actions no utiliza claves reales. Prohibido publicar claves o copiar JSON privado en los logs.

## Prueba positiva del desafío Turnstile — completada, herramienta temporal en retirada

- Función Vercel temporal: GET y POST en `/api/turnstile-probe`.
- Por defecto devuelve 404; solo se abre con `PHASE2_TURNSTILE_PROBE_ENABLED=true` en Production y en el dominio canónico `appsem-store.vercel.app`.
- GET sirve una página con la sitekey pública, los encabezados CSP existentes y un JavaScript externo en `public/turnstile-probe.js`; nunca entrega la Secret Key.
- El visitante inicia el widget con `action: appsem-metrics`. POST exige Origin exacto, JSON pequeño, IP de Vercel, límite temporal por IP y llama a `server/verifyTurnstile.js`.
- Solo muestra aprobación cuando Cloudflare confirma `success`, `hostname` y `action`. El endpoint no importa Firebase ni modifica métricas, comentarios o documentos.
- El límite IP es por instancia, disuasorio y no sirve como defensa global permanente. El probe está previsto solo para una ventana breve.
- Prueba realizada el 14/10/2026 en el dominio canónico: el navegador mostró **«Verificación real aprobada. Firebase no se modificó.»**; este mensaje únicamente se muestra después de un HTTP 200 del servidor tras Siteverify positivo.
- Después del éxito, la variable `PHASE2_TURNSTILE_PROBE_ENABLED` se fijó en `false` para nuevos despliegues y se retiraron los archivos `api/turnstile-probe.js`, `public/turnstile-probe.js` y la suite de prueba temporal. El cierre efectivo de la ruta requiere comprobar el despliegue limpio.
- Ninguna regla Firestore se publicó y `METRICS_BACKEND_ENABLED` / `VITE_METRICS_BACKEND` permanecieron sin activar. Aún falta coordinar la migración cliente-reglas y el plan de reversión.

## Preparación cliente para cambio controlado (14/10/2026)

- Identificado y corregido un bloqueo de navegación: Turnstile introduce una operación asíncrona, así que abrir la pestaña de descarga tras `await` puede ser bloqueado por el navegador. En **modo seguro solamente**, una vez registrado el clic se presenta un enlace HTTPS explícito `Abrir descarga` para un segundo gesto de usuario. Si la métrica falla, el catálogo mantiene el enlace válido disponible sin falsificar contadores. El flujo heredado no se modifica hasta el corte.
- Likes y rating bloquean clics simultáneos mientras se resuelve la verificación; los errores vuelven a habilitar los controles.
- Si la consulta de comentarios o de estado de visitante falla, se mantiene la ficha publicada y su enlace de descarga en lugar de marcar toda la aplicación como fallida. No se concede una valoración ficticia ni un like en caso de error.
- El enlace externo se valida con HTTPS y sin usuario, clave, destinos de loopback ni puertos especiales.
- **Este cambio NO activa `VITE_METRICS_BACKEND=server`**, no aplica reglas productivas y no introduce escritura nueva. Antes de abrir la Fase 2 a visitantes: E2E con Firestore Emulator, pruebas en navegador de flujo de descarga y preparación del corte de reglas con reversión y clientes antiguos.

## Activación por etapas: servidor en solo lectura (14/10/2026)

- El backend admite ahora tres estados: ausencia o `false` => **503 para GET/POST**; `read-only` => **GET con Firebase Admin** y **POST 503 antes de conectar a Firestore o verificar Turnstile**; `true` => GET/POST seguros con Cloudflare y límites.
- Este estado intermedio permite verificar respuesta real de `/api/interaction` sin activar los likes, ratings, descargas ni comentarios del nuevo sistema. La tienda sigue usando Firestore directo mientras `VITE_METRICS_BACKEND` no sea `server`.
- Prueba segura: GET con `appId=phase2-readiness-nonexistent-20261014` y un UUID sintético. Resultado esperado en `read-only`: **404 JSON `Aplicación no publicada.`**, que indica que se consultó Firestore sin escribir. En backend apagado: 503 JSON.
- `scripts/check-live-metrics-route.mjs` acepta únicamente estos dos resultados exactos. NO realiza POST. Las pruebas unitarias aseguran que POST en `read-only` se bloquea ANTES de invocar Firebase Admin o Turnstile.
- Esta es una comprobación de conexión, no una garantía de cuota de lecturas contra solicitudes públicas repetidas. Mantener el ensayo breve y monitorear errores/uso en Vercel y Firestore; después hacer corte coordinado a `true` + `VITE_METRICS_BACKEND=server` y reglas reforzadas solamente con plan de reversión.
- No se modifica Firebase ni su configuración de reglas desde este cambio.


## Estado real de Cloudflare — 12/11/2026
La información histórica anterior sobre Vercel describe las pruebas originales y **no es la configuración de producción actual**.
- Backend: Cloudflare Pages Function `/api/interaction`, `METRICS_BACKEND_ENABLED=true`.
- Frontend: Vite compilado con `VITE_METRICS_BACKEND=server`; likes, valoraciones, comentarios y clics pasan por Turnstile y la API. Ya no se usa el camino Firestore público en esta compilación.
- Reglas productivas: verificación anónima no destructiva confirmó bloqueo de likes, ratings, descargas privadas y comentarios sin filtro, y acceso al catálogo y comentarios aprobados. Se conservaron las reglas vigentes, sin nuevas publicaciones.
- Compilación: pruebas unitarias, ESLint, auditoría real anónima y prueba HTTP de rechazos de Origin y token inválido ejecutadas antes del despliegue.
- **Límite de verificación:** estas pruebas no equivalen todavía a completar una interacción real con token válido y comprobar escritura, respuesta y contador. Queda pendiente la prueba positiva y supervisión, así como reconciliación histórica de Fase 3. No retirar Vercel sin el corte operativo completo.
