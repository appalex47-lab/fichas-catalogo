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


test('UI: descarga tiene fallback móvil y los botones no dependen de submit', () => {
  const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(app, /navigator\.share/);
  assert.match(app, /new TextEncoder/);
  assert.match(app, /querySelectorAll\('button:not\(\[type\]\)'\)/);
  assert.match(html, /js\/connector\.js/);
});

test('UI: documenta la limitación de almacenamiento al abrir ZIP como file', () => {
  const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  const doc = fs.readFileSync(path.join(root, 'docs/phases/PHASE_7_3_LOTE_UI_PERSISTENCE_FIX.md'), 'utf8');
  assert.match(app, /location\.protocol === 'file:'/);
  assert.match(doc, /no puede leer de forma fiable el lote guardado por otro ZIP/);
});


test('UI: render del lote tiene disponible el Health Score y la presentación entra al título', () => {
  assert.match(app, /const Health = window\.FichasHealth/);
  assert.match(app, /Health\.scoreReport/);
  const logic = fs.readFileSync(path.join(root, 'js', 'logic.js'), 'utf8');
  assert.match(logic, /Forma farmacéutica \+ presentación/);
  assert.match(logic, /interpreta como piezas/);
});

test('UI: app.js no usa constantes de logic.js sin importarlas (regresión MAG_HEADER)', () => {
  // renderExport() se ejecuta dentro de renderLote(); una referencia no definida impedía pintar la tabla del lote.
  assert.doesNotMatch(app, /(?<![.\w])MAG_HEADER\b/);
  assert.match(app, /ex\.header\.length/);
});

test('Fase 9: index.html carga content, magento-readiness y score360 antes de app.js', () => {
  const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
  const order = ['js/seo.js', 'js/content.js', 'js/magento-readiness.js', 'js/score360.js', 'js/app.js'].map(s => html.indexOf(`<script src="${s}`));
  order.forEach(i => assert.ok(i > 0));
  assert.deepEqual(order, order.slice().sort((a, b) => a - b));
  assert.match(html, /id="panel-eval"/);
});

test('Fase 9: app.js expone filtros 360, contenido y Magento, y el resumen de exportación', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'js', 'app.js'), 'utf8');
  for (const k of ['c360_critico', 'contenido_critico', 'mag_bloqueado', 'mag_listo', 'mag_advertencias', 'EVALUACIÓN DEL PRODUCTO', 'exp-compact', 'fichas.score360.v1']) assert.ok(src.includes(k), k);
});
