import { useEffect } from "react";

const SITE_NAME = "Appsem Store";
const SITE_URL = (import.meta.env.VITE_PUBLIC_SITE_ORIGIN || "https://appsem-store.pages.dev").replace(/[/]$/, "");
const DEFAULT_DESCRIPTION = "Descubre aplicaciones oficiales desarrolladas por AppsMart Technology en Appsem Store.";
const DEFAULT_IMAGE = `${SITE_URL}/images/web/appsem-store-icon-512.png`;

function upsertMeta(selector, attributes) {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement("meta");
    document.head.appendChild(element);
  }
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
}

function upsertLink(rel, href) {
  let element = document.head.querySelector(`link[rel="${rel}"]`);
  if (!element) {
    element = document.createElement("link");
    element.setAttribute("rel", rel);
    document.head.appendChild(element);
  }
  element.setAttribute("href", href);
}

export default function Seo({
  title,
  description = DEFAULT_DESCRIPTION,
  path = "/",
  image = DEFAULT_IMAGE,
  type = "website",
  schema
}) {
  useEffect(() => {
    const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} | Tienda de apps`;
    const canonical = `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;

    document.title = fullTitle;
    upsertMeta('meta[name="description"]', { name: "description", content: description });
    upsertMeta('meta[name="robots"]', { name: "robots", content: "index, follow, max-image-preview:large" });
    upsertMeta('meta[property="og:title"]', { property: "og:title", content: fullTitle });
    upsertMeta('meta[property="og:description"]', { property: "og:description", content: description });
    upsertMeta('meta[property="og:type"]', { property: "og:type", content: type });
    upsertMeta('meta[property="og:url"]', { property: "og:url", content: canonical });
    upsertMeta('meta[property="og:image"]', { property: "og:image", content: image });
    upsertMeta('meta[property="og:site_name"]', { property: "og:site_name", content: SITE_NAME });
    upsertMeta('meta[name="twitter:card"]', { name: "twitter:card", content: "summary_large_image" });
    upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: fullTitle });
    upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: description });
    upsertMeta('meta[name="twitter:image"]', { name: "twitter:image", content: image });
    upsertLink("canonical", canonical);

    const previousSchema = document.head.querySelector('script[data-appsem-schema="true"]');
    if (previousSchema) previousSchema.remove();

    if (schema) {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.dataset.appsemSchema = "true";
      script.textContent = JSON.stringify(schema);
      document.head.appendChild(script);
    }

    return () => {
      const currentSchema = document.head.querySelector('script[data-appsem-schema="true"]');
      if (currentSchema) currentSchema.remove();
    };
  }, [title, description, path, image, type, schema]);

  return null;
}