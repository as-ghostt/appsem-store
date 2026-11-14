import test from 'node:test';
import assert from 'node:assert/strict';
import { fallbackIcon, showFallbackAppIcon } from '../src/utils/appIconFallback.js';

test('Si falla el servidor del icono, mostrar el icono alternativo', () => {
  const image = {
    value: 'https://example.invalid/incorrect-icon.png',
    getAttribute() { return this.value; },
    set src(next) { this.value = next; }
  };
  showFallbackAppIcon({ currentTarget: image });
  assert.equal(image.value, fallbackIcon);
});

test('Si falla el propio fallback, no volver a asignar ni provocar un bucle', () => {
  let attempted = 0;
  const image = {
    getAttribute() { return fallbackIcon; },
    set src(_) { attempted++; }
  };
  showFallbackAppIcon({ currentTarget: image });
  assert.equal(attempted, 0);
  assert.doesNotThrow(() => showFallbackAppIcon(null));
});
