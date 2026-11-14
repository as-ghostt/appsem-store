/** Fallback determinista para iconos externos inaccesibles o inexistentes. */
export const fallbackIcon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Crect width='120' height='120' rx='28' fill='%231e293b'/%3E%3Ctext x='50%25' y='54%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial' font-size='34' font-weight='700' fill='white'%3EAS%3C/text%3E%3C/svg%3E";
export function showFallbackAppIcon(event) {
  const image = event?.currentTarget;
  if (!image || image.getAttribute('src') === fallbackIcon) return;
  // Evita el cuadro roto y evita un bucle si el propio recurso fallback falla.
  image.src = fallbackIcon;
}
