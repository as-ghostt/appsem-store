/** Enlace de descarga presentado solo desde el catálogo, sin ejecutar esquemas activos. */
export function validatedDownloadUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password ||
        url.port || url.hostname === "localhost" ||
        url.hostname.endsWith(".local") || url.hostname.endsWith(".localhost") ||
        /^(\d{1,3}\.){3}\d{1,3}$/.test(url.hostname) ||
        url.hostname.includes(":")) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Destinos que pueden ofrecerse como descarga; nunca enlaces al panel. */
export function validatedPlayStoreDownloadUrl(value) {
  const safe = validatedDownloadUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  return url.hostname === "play.google.com" &&
    url.pathname === "/store/apps/details" &&
    /^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(url.searchParams.get("id") || "")
      ? value : null;
}

export function validatedGithubApkDownloadUrl(value) {
  const safe = validatedDownloadUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  return url.hostname === "github.com" &&
    /^\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\/releases\/download\/[^/]+\/[^/]+\.apk$/i.test(url.pathname)
      ? value : null;
}
