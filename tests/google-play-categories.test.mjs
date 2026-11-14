import test from 'node:test';
import assert from 'node:assert/strict';
import { categories, categoryMap, appMatchesCategory } from '../src/data/categories.js';

const expected = [
  'Arte y diseño', 'Automóviles y vehículos', 'Belleza',
  'Bibliotecas y demostración', 'Comida y bebida', 'Compras',
  'Comunicación', 'Conocer personas', 'Cómics', 'Deportes',
  'Editores y reproductores de video', 'Educación', 'Entretenimiento',
  'Estilo de vida', 'Eventos', 'Finanzas', 'Fotografía', 'Herramientas',
  'Libros y referencias', 'Mapas y navegación', 'Medicina',
  'Música y audio', 'Negocios', 'Noticias y revistas',
  'Personalización', 'Productividad', 'Salud y deportes', 'Ser padres',
  'Social', 'Tiempo', 'Viajes y lugares', 'Vivienda y hogar'
];

test('Catálogo público reconoce las 32 categorías oficiales proporcionadas', () => {
  const options = categories.filter(x => x.key !== 'all' && !x.legacy);
  assert.deepEqual(options.map(x => x.label), expected);
  assert.equal(new Set(options.map(x => x.key)).size, 32);
  for (const category of options) {
    assert.ok(appMatchesCategory({ categoryKey: category.key }, category));
    assert.equal(categoryMap[category.key], category.label);
  }
});

test('La tienda mantiene acceso a fichas históricas sin alterar Firestore', () => {
  const find = key => categories.find(x => x.key === key);
  assert.ok(appMatchesCategory({ categoryKey: 'books-reference' }, find('libros-referencias')));
  assert.ok(appMatchesCategory({ categoryKey: 'libros-referencias' }, find('libros-referencias')));
  assert.ok(appMatchesCategory({ categoryKey: 'noticias' }, find('noticias-revistas')));
  assert.ok(appMatchesCategory({ categoryKey: 'salud-bienestar' }, find('salud-deportes')));
  assert.ok(appMatchesCategory({ categoryKey: 'games' }, find('juegos')));
  assert.ok(appMatchesCategory({ categoryKey: 'otros' }, find('otros')));
  assert.equal(categoryMap['salud-bienestar'], 'Salud y bienestar');
  assert.equal(categoryMap.games, 'Juegos');
  assert.ok(!appMatchesCategory({ categoryKey: 'finanzas' }, find('educacion')));
});

test('Las categorías antiguas se mantienen como filtros solo si hay apps de ese tipo', () => {
  const apps = [{ categoryKey: 'educacion' }, { categoryKey: 'games' }];
  const visible = categories.filter(x => x.key === 'all' || apps.some(app => appMatchesCategory(app, x)));
  assert.deepEqual(visible.map(x => x.key), ['all', 'educacion', 'juegos']);
});
