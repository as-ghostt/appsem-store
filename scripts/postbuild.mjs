import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

// En Cloudflare el dominio canónico debe configurarse explícitamente antes de publicar.
const SITE_URL = (process.env.PUBLIC_SITE_ORIGIN || "https://appsem-store.pages.dev").replace(/[/]$/, "");
if (process.env.CF_PAGES === "1" && !process.env.PUBLIC_SITE_ORIGIN) {
  throw new Error("PUBLIC_SITE_ORIGIN es obligatorio para Cloudflare Pages.");
}
const PROJECT_ID = "webs-8b1bf";
const DIST = "dist";
const DEFAULT_IMAGE = `${SITE_URL}/images/web/appsem-store-icon-512.png`;

const STATIC_ROUTES = {
  "/": {
    title: "Appsem Store | Tienda de apps",
    description: "Descubre aplicaciones oficiales desarrolladas por AppsMart Technology en Appsem Store.",
    priority: "1.0"
  },
  "/about": {
    title: "Sobre Appsem Store | Appsem Store",
    description: "Conoce Appsem Store, la tienda oficial de aplicaciones desarrolladas por AppsMart Technology.",
    priority: "0.6"
  },
  "/contact": {
    title: "Contacto y soporte | Appsem Store",
    description: "Canales oficiales de contacto, soporte y reporte de seguridad de Appsem Store.",
    priority: "0.6"
  },
  "/privacy": {
    title: "Política de privacidad | Appsem Store",
    description: "Consulta cómo Appsem Store trata la información y protege la privacidad de sus usuarios.",
    priority: "0.5"
  },
  "/cookies": {
    title: "Política de cookies | Appsem Store",
    description: "Información sobre el uso de cookies y almacenamiento local en Appsem Store.",
    priority: "0.5"
  },
  "/terms": {
    title: "Términos y condiciones | Appsem Store",
    description: "Consulta los términos y condiciones de uso de Appsem Store.",
    priority: "0.5"
  }
};

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function fieldValue(field) {
  if (!field) return undefined;
  if ("stringValue" in field) return field.stringValue;
  if ("booleanValue" in field) return field.booleanValue;
  if ("integerValue" in field) return Number(field.integerValue);
  if ("doubleValue" in field) return Number(field.doubleValue);
  if ("timestampValue" in field) return field.timestampValue;
  if ("arrayValue" in field) return (field.arrayValue.values || []).map(fieldValue);
  return undefined;
}

function parseDocument(document) {
  const app = {};
  for (const [key, value] of Object.entries(document.fields || {})) app[key] = fieldValue(value);
  app.id = document.name?.split("/").pop();
  return app;
}

async function fetchPublishedApps() {
  const endpoint = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "apps" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "status" },
            op: "EQUAL",
            value: { stringValue: "published" }
          }
        },
        limit: 1000
      }
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Firestore respondió ${response.status}: ${detail.slice(0, 300)}`);
  }

  const payload = await response.json();
  return payload
    .map((item) => item.document)
    .filter(Boolean)
    .map(parseDocument)
    .filter((app) => app.slug && app.title);
}

function replaceMeta(html, { title, description, url, image, type = "website", schema }) {
  let output = html
    .replace(/<title>.*?<\/title>/s, `<title>${escapeHtml(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${escapeHtml(description)}" />`)
    .replace(/<meta property="og:type" content="[^"]*"\s*\/>/, `<meta property="og:type" content="${escapeHtml(type)}" />`)
    .replace(/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${escapeHtml(title)}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${escapeHtml(description)}" />`)
    .replace(/<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${escapeHtml(url)}" />`)
    .replace(/<meta property="og:image" content="[^"]*"\s*\/>/, `<meta property="og:image" content="${escapeHtml(image)}" />`)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${escapeHtml(url)}" />`);

  if (schema) {
    output = output.replace(
      "</head>",
      `    <script type="application/ld+json">${JSON.stringify(schema).replaceAll("<", "\\u003c")}</script>\n  </head>`
    );
  }
  return output;
}

function appHtml(template, app) {
  const title = `${app.title} | Appsem Store`;
  const description = app.seoDescription || app.shortDescription || app.fullDescription || `Descubre ${app.title} en Appsem Store.`;
  const url = `${SITE_URL}/app/${app.slug}`;
  const image = app.bannerUrl || app.iconUrl || DEFAULT_IMAGE;
  const schema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: app.title,
    description,
    url,
    image,
    operatingSystem: app.operatingSystem || "Android",
    applicationCategory: app.category || "Application",
    softwareVersion: app.currentVersion || undefined,
    fileSize: app.appSize || undefined,
    author: { "@type": "Organization", name: app.developer || "AppsMart Technology" },
    offers: {
      "@type": "Offer",
      price: String(app.price || "Gratis").toLowerCase().includes("gratis") ? "0" : undefined,
      priceCurrency: "USD"
    },
    aggregateRating: Number(app.ratingCount || 0) > 0 ? {
      "@type": "AggregateRating",
      ratingValue: Number(app.ratingAverage || 0).toFixed(1),
      ratingCount: Number(app.ratingCount || 0)
    } : undefined
  };
  return replaceMeta(template, { title, description, url, image, type: "product", schema });
}

function staticHtml(template, path, meta) {
  return replaceMeta(template, {
    title: meta.title,
    description: meta.description,
    url: `${SITE_URL}${path}`,
    image: DEFAULT_IMAGE
  });
}

function sitemap(apps) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    ...Object.entries(STATIC_ROUTES).map(([path, meta]) => ({ loc: `${SITE_URL}${path}`, priority: meta.priority, lastmod: today })),
    ...apps.map((app) => ({
      loc: `${SITE_URL}/app/${app.slug}`,
      priority: "0.8",
      lastmod: String(app.lastVersionDate || app.contentUpdatedAt || app.updatedAt || today).slice(0, 10)
    }))
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(({ loc, priority, lastmod }) => `  <url>\n    <loc>${escapeHtml(loc)}</loc>\n    <lastmod>${escapeHtml(lastmod)}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${priority}</priority>\n  </url>`).join("\n")}\n</urlset>\n`;
}

async function writeRoute(path, html) {
  const target = path === "/" ? join(DIST, "index.html") : join(DIST, path, "index.html");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, html, "utf8");
}

async function versionServiceWorker() {
  const file = join(DIST, "service-worker.js");
  const source = await readFile(file, "utf8");
  const assets = await readdir(join(DIST, "assets"));
  const buildId = assets.sort().join("-").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || Date.now().toString();
  await writeFile(file, source.replaceAll("__BUILD_ID__", buildId), "utf8");
}

async function main() {
  const template = await readFile(join(DIST, "index.html"), "utf8");
  const apps = await fetchPublishedApps();

  for (const [path, meta] of Object.entries(STATIC_ROUTES)) {
    await writeRoute(path, staticHtml(template, path, meta));
  }
  for (const app of apps) await writeRoute(`/app/${app.slug}`, appHtml(template, app));

  const notFound = replaceMeta(template, {
    title: "Página no encontrada | Appsem Store",
    description: "La página o aplicación solicitada no está disponible en Appsem Store.",
    url: `${SITE_URL}/404`,
    image: DEFAULT_IMAGE
  }).replace("<meta name=\"robots\" content=\"index, follow, max-image-preview:large\" />", "<meta name=\"robots\" content=\"noindex, follow\" />");
  await writeFile(join(DIST, "404.html"), notFound, "utf8");
  await writeFile(join(DIST, "sitemap.xml"), sitemap(apps), "utf8");
  await versionServiceWorker();

  if (apps.length === 0) process.stdout.write("Catálogo vacío: se publica la tienda sin fichas de aplicaciones.\n");
  process.stdout.write(`Prerender completado: ${apps.length} fichas, rutas institucionales, 404 y sitemap.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});