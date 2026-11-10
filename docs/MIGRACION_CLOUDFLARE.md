# Migración a Cloudflare — AppsEM Store

Estado: **preparación parcial; despliegue NO realizado**.

## GitHub y cuenta
- Repositorio: `as-ghostt/appsem-store`; rama `main`.
- La cuenta Cloudflare CEO `ceo.developer.appsem@gmail.com` no tenía proyectos Pages ni Workers en la revisión.
- Cloudflare rechazó conectar el primer proyecto Admin a GitHub por error de instalación Git (HTTP 401, código `8000011`). No se han publicado proyectos.
- Vercel conserva la producción.

## Cloudflare Pages: configuración prevista
- Nombre: `appsem-store`.
- Build: `npm run build`; salida `dist`; repositorio GitHub en `main`.
- Variables: `PUBLIC_SITE_ORIGIN=https://<dominio-publico-final>` y `VITE_PUBLIC_SITE_ORIGIN=https://<dominio-publico-final>` (iguales, sin barra final).
- El postbuild genera páginas SEO, sitemap y service worker; ahora admite catálogo vacío sin bloquear el despliegue.
- Antes del corte comprobar el prerender `/app/<slug>`, páginas legales, PWA, sitemap, metadatos y encabezados de seguridad.

## Bloqueo de API de métricas
`api/interaction.js` es una función **Vercel** con API de Node (`req, res`) y depende de `firebase-admin`. **No funciona automáticamente en Cloudflare Pages/Workers**. Antes de migrar producción:
- Reimplementar y probar la ruta `/api/interaction` en Cloudflare o verificar que las métricas seguras siguen expresamente deshabilitadas, sin perder funcionalidad.
- Migrar los secretos de servidor mediante bindings/secrets, nunca como variables públicas `VITE_*`.
- Revalidar Cloudflare Turnstile para el dominio definitivo.
- No activar `VITE_METRICS_BACKEND=server` sin backend verificado y pruebas de permisos. Mantener la coordinación con la fase 2 existente.

## Otros requisitos
- Validar Firestore Rules actuales y acceso público de catálogo/valoraciones.
- Revisar `public/_headers` o configurar los mismos headers de seguridad que `vercel.json` antes del corte.
- APK: GitHub Releases es independiente del proveedor de hosting.
- No borrar Vercel hasta que el nuevo dominio y funciones estén confirmados.

No se modificaron reglas Firestore ni se ejecutaron migraciones de datos.

## Verificación de cuenta CEO (10/11/2026)
- GitHub conectado: `as-ghostt`, acceso administrador a ambos repositorios.
- Cloudflare conectado: `ceo.developer.appsem@gmail.com`, cuenta `0bdec89d523124e6346040488c71276a`.
- Intento de crear `appsem-store-admin` con GitHub en esta **cuenta CEO**: Cloudflare devolvió HTTP 401, código `8000011` (problema interno de instalación Git). La creación no se completó.
- La migración no debe utilizar cuentas diferentes de CEO. No mover tráfico ni retirar Vercel hasta validar un despliegue operativo.

## Reintento de conexión CEO — 10/11/2026
- GitHub y Cloudflare conectados a las cuentas autorizadas por CEO.
- Cloudflare Pages creó correctamente el proyecto `appsem-store`.
- Proyecto enlazado al repositorio `as-ghostt/appsem-store`, rama `main` con despliegue automático habilitado.
- URL asignada: `https://appsem-store.pages.dev`.
- Este commit inicia una compilación de prueba mediante integración GitHub; la creación del proyecto no prueba aún funcionamiento de la web.
- Vercel continúa intacto hasta confirmar un despliegue funcional y las verificaciones de seguridad.


## Actualización comprobada — 10/11/2026
- Cuenta exclusiva: Cloudflare `ceo.developer.appsem@gmail.com` y GitHub `as-ghostt`. Proyecto Cloudflare Pages `appsem-store`, rama `main` y despliegue automático activo.
- URL de la tienda: `https://appsem-store.pages.dev`; despliegues confirmados con estado `success`.
- Metadatos, canónicas, sitemap y enlaces legales locales se han orientado al nuevo dominio.
- Backend `functions/api/interaction.js` ya está desplegado como Pages Function, con acceso a Firestore mediante `server/firestoreRest.js`, sin depender de la función Node de Vercel.
- **Métricas seguras todavía NO activadas en producción:** faltan los secrets de Cloudflare `FIREBASE_SERVICE_ACCOUNT_JSON`, `METRICS_HMAC_SECRET` y `TURNSTILE_SECRET_KEY`, además de la site key de Turnstile con hostname nuevo. `METRICS_BACKEND_ENABLED=true`, `VITE_METRICS_BACKEND=server` y `VITE_TURNSTILE_SITE_KEY` deben configurarse únicamente después de validar la ruta de lectura, permisos y POST con un entorno de prueba.
- La ruta Cloudflare retorna rechazo controlado cuando no está configurada. No se han ejecutado escrituras contra Firebase real.
- Reglas Firestore, identidad de Firebase y colecciones preservadas; fases de auditoría aún abiertas. Vercel sigue disponible como respaldo mientras no se verifiquen las funciones dependientes de credenciales.
