// Categorías de aplicación de Google Play, según la lista proporcionada.
// Mantener las claves en español para evitar cambios de IDs y en Firestore.
export const categories = [
  { key: "all", label: "Todas" },
  { key: "arte-diseno", label: "Arte y diseño" },
  { key: "automoviles-vehiculos", label: "Automóviles y vehículos" },
  { key: "belleza", label: "Belleza" },
  { key: "bibliotecas-demostracion", label: "Bibliotecas y demostración" },
  { key: "comida-bebida", label: "Comida y bebida" },
  { key: "compras", label: "Compras" },
  { key: "comunicacion", label: "Comunicación" },
  { key: "conocer-personas", label: "Conocer personas" },
  { key: "comics", label: "Cómics" },
  { key: "deportes", label: "Deportes" },
  { key: "editores-reproductores-video", label: "Editores y reproductores de video" },
  { key: "educacion", label: "Educación" },
  { key: "entretenimiento", label: "Entretenimiento" },
  { key: "estilo-vida", label: "Estilo de vida" },
  { key: "eventos", label: "Eventos" },
  { key: "finanzas", label: "Finanzas" },
  { key: "fotografia", label: "Fotografía" },
  { key: "herramientas", label: "Herramientas" },
  { key: "libros-referencias", label: "Libros y referencias" },
  { key: "mapas-navegacion", label: "Mapas y navegación" },
  { key: "medicina", label: "Medicina" },
  { key: "musica-audio", label: "Música y audio" },
  { key: "negocios", label: "Negocios" },
  { key: "noticias-revistas", label: "Noticias y revistas" },
  { key: "personalizacion", label: "Personalización" },
  { key: "productividad", label: "Productividad" },
  { key: "salud-deportes", label: "Salud y deportes" },
  { key: "ser-padres", label: "Ser padres" },
  { key: "social", label: "Social" },
  { key: "tiempo", label: "Tiempo" },
  { key: "viajes-lugares", label: "Viajes y lugares" },
  { key: "vivienda-hogar", label: "Vivienda y hogar" },
  // Mostrar las categorías antiguas únicamente cuando existan fichas que las utilicen.
  { key: "juegos", label: "Juegos", legacy: true },
  { key: "otros", label: "Otros", legacy: true }
];

// Equivalencias heredadas de ambos clientes. No migrar documentos reales.
const aliases = {
  "libros-referencias": ["books-reference", "bible", "biblia", "biblias", "christian", "cristianas", "cristiana", "cristiano"],
  herramientas: ["tools", "herramienta"],
  educacion: ["education"],
  entretenimiento: ["entertainment"],
  productividad: ["productivity"],
  "estilo-vida": ["lifestyle"],
  "noticias-revistas": ["noticias", "news"],
  "salud-deportes": ["salud-bienestar", "health-fitness"],
  juegos: ["games", "game", "juego"],
  otros: ["other", "otro"]
};

function normalized(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function appMatchesCategory(app, category) {
  if (!app || !category) return false;
  if (category.key === "all") return true;
  const accepted = new Set([category.key, category.label, ...(aliases[category.key] || [])].map(normalized));
  return accepted.has(normalized(app.categoryKey)) || accepted.has(normalized(app.category));
}

export const categoryMap = categories.reduce((map, category) => {
  map[category.key] = category.label;
  return map;
}, {});

Object.assign(categoryMap, {
  "books-reference": "Libros y referencias",
  bible: "Libros y referencias",
  christian: "Libros y referencias",
  cristianas: "Libros y referencias",
  tools: "Herramientas",
  education: "Educación",
  entertainment: "Entretenimiento",
  productivity: "Productividad",
  lifestyle: "Estilo de vida",
  games: "Juegos",
  other: "Otros",
  noticias: "Noticias",
  "salud-bienestar": "Salud y bienestar"
});
