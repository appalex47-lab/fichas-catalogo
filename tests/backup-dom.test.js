'use strict';
/* Respaldo y compartir: un solo lugar, con partes elegibles y unir o reemplazar al cargar. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, skip, wait } = require('./helpers/boot');

const lote = a => JSON.parse(a.w.localStorage.getItem('fichas.lote.v1') || '[]');

test('respaldo: hay una sola sección para respaldar y ya no hay botones sueltos', { skip }, async () => {
  const a = boot();
  for (const id of ['lote-backup', 'lote-restore', 'k-backup', 'k-restore', 'cat-export', 'cat-import', 'cat-import-btn']) assert.equal(a.d.getElementById(id), null, id);
  assert.ok(a.d.getElementById('respaldo'));
  assert.equal(a.text('[data-nav="respaldo"] .mnav-t'), 'Respaldo');
  assert.ok(a.d.getElementById('lote-clear'), '«Vaciar lote» se queda en el lote');
  a.d.querySelector('[data-nav="respaldo"]').click(); await wait(200);
  assert.deepEqual([...a.d.querySelectorAll('#bk-parts input')].map(c => c.dataset.bkpart), ['lote', 'catalogo', 'conocimiento', 'clasif', 'categorias', 'ajustes']);
});

test('respaldo: descarga solo las partes marcadas y nunca incluye llaves de IA', { skip }, async () => {
  const a = boot();
  a.addMed('B1', 'Tempra', '30');
  a.w.localStorage.setItem('fichas.aikey.v1', 'sk-secreta');
  const solo = await a.backup(['catalogo']);
  assert.deepEqual(Object.keys(solo.parts), ['catalogo']);
  const todo = await a.backup(['lote', 'catalogo', 'clasif', 'ajustes']);
  assert.deepEqual(Object.keys(todo.parts).sort(), ['ajustes', 'catalogo', 'clasif', 'lote']);
  assert.ok(!JSON.stringify(todo).includes('sk-secreta'));
  assert.ok(todo.parts.ajustes.meta && 'keepText' in todo.parts.ajustes && todo.parts.ajustes.exp && todo.parts.ajustes.mc);
  const vacio = a.d.querySelectorAll('#bk-parts input'); vacio.forEach(c => { c.checked = false; c.dispatchEvent(new a.w.Event('change', { bubbles: true })); });
  assert.equal(a.d.getElementById('bk-dl').disabled, true, 'sin partes no se puede descargar');
});

test('respaldo: unir suma sin borrar y reemplazar descarga antes un respaldo automático', { skip }, async () => {
  const a = boot();
  a.addMed('B1', 'Tempra', '30'); a.addMed('B2', 'Dolofin', '20');
  const file = await a.backup(['lote']);
  const b = boot();
  b.addMed('B1', 'Otra', '10'); b.addMed('B3', 'Mía', '5');
  await b.restore(file);
  assert.deepEqual(lote(b).map(x => x.sku).sort(), ['B1', 'B2', 'B3']);
  assert.equal(lote(b).find(x => x.sku === 'B1').v.marca, 'Otra', 'unir no pisa mi producto');
  const n = b.downloads.length;
  await b.restore(file, { lote: 'reemplazar' });
  assert.deepEqual(lote(b).map(x => x.sku).sort(), ['B1', 'B2']);
  assert.equal(b.downloads.length, n + 1, 'se descargó el respaldo automático');
  const auto = JSON.parse(Buffer.from(await b.downloads[b.downloads.length - 1].arrayBuffer()).toString('utf8'));
  assert.deepEqual(auto.parts.lote.items.map(x => x.sku).sort(), ['B1', 'B2', 'B3'], 'el automático guarda lo que había antes');
  assert.deepEqual(b.errors, []);
});

test('respaldo: los ajustes llegan como «No cargar» y solo cambian si se elige reemplazar', { skip }, async () => {
  const a = boot();
  a.d.getElementById('keep').value = 'MARCAX, MARCAY'; a.d.getElementById('keep').dispatchEvent(new a.w.Event('input', { bubbles: true }));
  const file = await a.backup(['ajustes']);
  assert.match(file.parts.ajustes.keepText, /MARCAX/);
  const b = boot();
  assert.doesNotMatch(b.d.getElementById('keep').value, /MARCAX/);
  const dlg = await b.restore(file, {}, { cancel: true });
  assert.equal(dlg.querySelector('select[data-bkdo="ajustes"]').value, 'no', 'por defecto no se carga');
  await b.restore(file);
  assert.doesNotMatch(b.d.getElementById('keep').value, /MARCAX/, 'sin elegir reemplazar, nada cambia');
  await b.restore(file, { ajustes: 'reemplazar' });
  assert.match(b.d.getElementById('keep').value, /MARCAX/);
  assert.deepEqual(b.errors, []);
});

test('respaldo: el diccionario ATC se une sin bajar filas verificadas y los archivos viejos se reconocen', { skip }, async () => {
  const a = boot();
  const clas = { v: 1, rows: [{ principio: 'Omeprazol', atc: 'A02BC01', estado: 'sin_verificar' }] };
  await a.restore(B_(clas), {}, { wait: 300 });
  assert.match(a.text('#bk-status'), /diccionario ATC: 1 nuevas/);
  const viejo = { kind: 'fichas.catalog.share', v: 1, at: 'x', catalog: { v: 1, entries: [{ sku: 'ELE-1', nombre: 'Electrolit', cat: 'beb', elegible: true, comp: 'esperando', updatedAt: '2026-03-01T00:00:00Z' }], links: [] } };
  await a.restore(viejo);
  assert.match(a.text('#bk-status'), /catálogo: 1 nuevos/);
  await a.restore({ schema: 'fichas.lote-backup.v1', createdAt: 'x', lote: [], audit: [] });
  assert.match(a.text('#bk-status'), /lote: 0 agregados/);
});
function B_(clasif) { return { schema: 'fichas.backup.v2', createdAt: new Date().toISOString(), parts: { clasif } }; }
