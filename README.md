# Appsem Store Public

Página pública profesional para Appsem Store, hecha con React + Vite + Firebase Firestore.

## Funciones incluidas

- Página principal con catálogo de apps publicadas.
- Categorías tipo tienda de apps.
- Búsqueda por nombre, descripción o categoría.
- Tarjetas modernas de cada app.
- Página detallada por app: descripción, capturas, información técnica y política individual.
- Me gusta por app.
- Valoración por estrellas.
- Comentarios con moderación: se envían como `approved: false`.
- Conteo de clics de descarga antes de abrir Google Play.
- Páginas legales: privacidad, cookies y términos.
- Despliegue en Cloudflare Pages con rutas SEO prerenderizadas y Pages Functions.

## Comandos

```bash
npm install
npm run dev
```

Para producción:

```bash
npm run build
```

## Estructura Firestore esperada

Colección:

```txt
apps
```

Documento ejemplo:

```js
{
  title: "Biblia Universal",
  slug: "biblia-universal",
  category: "Libros y referencias",
  categoryKey: "libros-referencias",
  shortDescription: "Biblia completa con lectura, favoritos y temas bíblicos.",
  fullDescription: "Descripción completa de la app...",
  iconUrl: "https://raw.githubusercontent.com/...",
  bannerUrl: "https://raw.githubusercontent.com/...",
  screenshots: [
    "https://raw.githubusercontent.com/...",
    "https://raw.githubusercontent.com/..."
  ],
  playStoreUrl: "https://play.google.com/store/apps/details?id=com...",
  privacyPolicyUrl: "https://...",
  appSize: "25 MB",
  operatingSystem: "Android",
  minAndroidVersion: "Android 7.0",
  currentVersion: "1.0.0",
  developer: "AppsMart Technology",
  status: "published",
  likesCount: 0,
  downloadsCount: 0,
  ratingAverage: 0,
  ratingCount: 0,
  commentsCount: 0
}
```

Subcolecciones automáticas:

```txt
apps/{appId}/likes
apps/{appId}/ratings
apps/{appId}/comments
apps/{appId}/downloadClicks
```

## Reglas y seguridad

La tienda utiliza Cloudflare Pages Functions en `/api/interaction` para registrar me gusta, valoraciones, clics de descarga y comentarios mediante Turnstile y transacciones Firestore.

**No copies `firestore.rules` de este repositorio a producción:** es una versión heredada, distinta de la candidata reforzada que mantiene Appsem Admin en `docs/fase-02/firestore.hardened.rules`. La auditoría anónima confirmó que las reglas reales ya bloquean el acceso directo del público a likes y ratings, y conservan la lectura del catálogo publicado.

El navegador utiliza `VITE_METRICS_BACKEND=server` en el despliegue de Cloudflare y el backend `METRICS_BACKEND_ENABLED=true`. Las claves privadas se guardan cifradas solo en Cloudflare, nunca en `VITE_*`.

La compilación en Cloudflare ejecuta pruebas de seguridad, lint, auditoría de permisos reales de solo lectura y una prueba HTTP negativa con token Turnstile falso, antes de publicar. La prueba positiva completa de interacción con visitantes sigue pendiente de validación manual.
