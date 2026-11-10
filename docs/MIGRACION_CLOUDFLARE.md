# Migración a Cloudflare — AppsEM Store

Estado: **preparación parcial; despliegue NO realizado**.

## GitHub y cuenta
- Repositorio: `eler30mr-star/appsem-store`; rama `main`.
- La cuenta Cloudflare vinculada al propietario está vacía de Pages y Workers en la comprobación realizada.
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
