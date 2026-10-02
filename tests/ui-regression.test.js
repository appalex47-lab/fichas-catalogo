const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

test('UI: controles de copia, descarga y respaldo del lote existen', () => {
  for (const id of ['lote-copy','lote-dl','lote-backup','lote-restore','exp-copy','exp-dl','doc-dl']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(app, /function manualCopyDialog/);
  assert.match(app, /function saveFile\(filename, data, mime\)/);
  assert.match(app, /function hydratePersistentState/);
});

test('UI: el lote conserva una fuente primaria local y un espejo IndexedDB', () => {
  assert.match(app, /fichas\.lote\.v1/);
  assert.match(app, /indexedDB/);
  assert.match(app, /persist\('fichas\.lote\.v1'/);
});
