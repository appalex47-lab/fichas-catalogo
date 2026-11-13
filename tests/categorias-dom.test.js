'use strict';
/* Categorías de la tienda: una a la vez, con piezas para copiar, ejecutando la interfaz en jsdom. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, skip, wait } = require('./helpers/boot');

const type = (a, id, v) => { const el = a.d.getElementById(id); el.value = v; el.dispatchEvent(new a.w.Event('input', { bubbles: true })); };
const saved = a => JSON.parse(a.w.localStorage.getItem('fichas.categorias.v1') || '[]');

test('categorías: sin nombre pide escribirlo; con nombre salen las cinco piezas', { skip }, async () => {
  const a = boot();
  assert.ok(a.d.getElementById('categorias'));
  assert.equal(a.text('[data-nav="categorias"] .mnav-t'), 'Categorías');
  assert.match(a.text('#cg-out'), /Escribe el nombre de la categoría/);
  type(a, 'cg-nombre', 'Gastroenterología');
  type(a, 'cg-incluye', 'medicamentos para el aparato digestivo');
  type(a, 'cg-subs', 'Antiácidos\nLaxantes | https://tienda.mx/laxantes');
  const heads = [...a.d.querySelectorAll('#cg-out .cg-head h3')].map(h => h.textContent);
  assert.deepEqual(heads, ['Meta title', 'Meta description', 'Texto corto', 'Texto largo con subcategorías', 'Preguntas frecuentes']);
  assert.match(a.text('#cg-out'), /Va arriba, después del título de la categoría/);
  assert.match(a.text('#cg-out'), /Va hasta abajo, bajo los productos/);
  assert.match(a.d.querySelector('#cg-out [data-cgcopy="textoLargo"]').closest('.cg-piece').textContent, /Laxantes/);
  assert.deepEqual(a.errors, []);
});

test('categorías: el tipo se sugiere por el nombre hasta que lo eliges tú', { skip }, async () => {
  const a = boot();
  type(a, 'cg-nombre', 'Vitaminas y Suplementos');
  assert.equal(a.d.getElementById('cg-tipo').value, 'sup');
  type(a, 'cg-tipo', 'dis');
  type(a, 'cg-nombre', 'Dermocosméticos');
  assert.equal(a.d.getElementById('cg-tipo').value, 'dis', 'lo que elegiste no se pisa');
});

test('categorías: cada pieza se copia por separado', { skip }, async () => {
  const a = boot();
  type(a, 'cg-nombre', 'Analgésicos'); type(a, 'cg-incluye', 'medicamentos para el dolor');
  a.d.querySelector('#cg-out [data-cgcopy="metaTitle"]').click(); await wait(60);
  assert.match(a.copied.at(-1), /^Analgésicos/);
  a.d.querySelector('#cg-out [data-cgcopy="textoCorto"]').click(); await wait(60);
  assert.match(a.copied.at(-1), /^<p>Analgésicos reúne medicamentos para el dolor\./);
});

test('categorías: guardar crea «Mis categorías», reabrir y quitar con confirmación', { skip }, async () => {
  const a = boot();
  a.d.getElementById('cg-save').click();
  assert.equal(saved(a).length, 0, 'sin nombre no guarda');
  type(a, 'cg-nombre', 'Gastroenterología'); type(a, 'cg-padre', 'Medicamentos Generales');
  a.d.getElementById('cg-save').click();
  assert.equal(saved(a).length, 1);
  assert.match(a.text('#cg-list'), /Medicamentos Generales › Gastroenterología/);
  type(a, 'cg-incluye', 'medicamentos del aparato digestivo');
  a.d.getElementById('cg-save').click();
  assert.equal(saved(a).length, 1, 'guardar la misma categoría la actualiza');
  assert.equal(saved(a)[0].incluye, 'medicamentos del aparato digestivo');
  a.d.getElementById('cg-new').click();
  assert.equal(a.d.getElementById('cg-nombre').value, '');
  a.d.querySelector('#cg-list [data-cgopen]').click();
  assert.equal(a.d.getElementById('cg-nombre').value, 'Gastroenterología');
  a.d.querySelector('#cg-list [data-cgdel]').click(); await wait(30);
  assert.match(a.text('#confirm-dlg h3'), /Quitar esta categoría/);
  await a.confirm(true);
  assert.equal(saved(a).length, 0);
  assert.deepEqual(a.errors, []);
});

test('categorías: avisa si se parece mucho a otra guardada y viaja en el respaldo', { skip }, async () => {
  const a = boot();
  type(a, 'cg-nombre', 'Analgésicos'); type(a, 'cg-incluye', 'medicamentos para el dolor y la fiebre');
  a.d.getElementById('cg-save').click();
  a.d.getElementById('cg-new').click();
  type(a, 'cg-nombre', 'Analgésicos infantiles'); type(a, 'cg-incluye', 'medicamentos para el dolor y la fiebre');
  assert.match(a.text('#cg-out .note'), /Se parece mucho a «Analgésicos»/);
  a.d.getElementById('cg-save').click();
  const file = await a.backup(['categorias']);
  assert.equal(file.parts.categorias.items.length, 2);
  const b = boot();
  await b.restore(file);
  assert.equal(saved(b).length, 2);
  assert.match(b.text('#bk-status'), /categorías: 2 agregadas/);
  await b.restore(file);
  assert.match(b.text('#bk-status'), /categorías: 0 agregadas, 2 ya estaban/);
});
