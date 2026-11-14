export const categories = [
  { key: "all", label: "Todas" },
  { key: "books-reference", label: "Libros y referencias" },
  { key: "tools", label: "Herramientas" },
  { key: "education", label: "Educación" },
  { key: "entertainment", label: "Entretenimiento" },
  { key: "productivity", label: "Productividad" },
  { key: "lifestyle", label: "Estilo de vida" },
  { key: "games", label: "Juegos" },
  { key: "other", label: "Otros" }
];

export const categoryMap = categories.reduce((map, category) => {
  map[category.key] = category.label;
  return map;
}, {});

categoryMap.bible = "Libros y referencias";
categoryMap.christian = "Libros y referencias";
categoryMap.cristianas = "Libros y referencias";
categoryMap["libros-referencias"] = "Libros y referencias";
