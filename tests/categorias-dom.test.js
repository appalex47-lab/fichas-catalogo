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

test('categorías: la lista muestra el estado de cada una y los filtros cuentan', { skip }, async () => {
  const a = boot();
  type(a, 'cg-nombre', 'Analgésicos'); a.d.getElementById('cg-save').click();
  a.d.getElementById('cg-new').click();
  type(a, 'cg-nombre', 'Gastroenterología'); type(a, 'cg-incluye', 'medicamentos para el aparato digestivo y la digestión de adultos en distintas presentaciones de uso común en farmacia');
  a.d.getElementById('cg-save').click();
  const estado = nombre => a.text(`#cg-list tr:has(b)`) && [...a.d.querySelectorAll('#cg-list tbody tr')].find(r => r.textContent.includes(nombre)).querySelector('.status').textContent;
  assert.equal(estado('Analgésicos'), 'Con avisos', 'sin «Qué incluye» hay avisos');
  assert.match(a.text('#cg-filters'), /Todas \(2\)/);
  assert.match(a.text('#cg-filters'), /Con avisos \(1\)/, 'un texto corto solo informa y no deja la categoría con avisos');
  assert.match(a.text('#cg-filters'), /Listas \(1\)/);
  a.d.querySelector('#cg-filters [data-cgfilter="c"]').click();
  assert.match(a.text('#cg-list'), /Ninguna categoría coincide/);
  a.d.querySelector('#cg-filters [data-cgfilter="todas"]').click();
  assert.equal(a.d.querySelectorAll('#cg-list tbody tr').length, 2);
});

test('categorías: «Ya la cargué a Magento» marca la categoría y avisa si cambia después', { skip }, async () => {
  const a = boot();
  type(a, 'cg-nombre', 'Gastroenterología'); type(a, 'cg-incluye', 'medicamentos para el aparato digestivo');
  const done = a.d.getElementById('cg-done');
  done.checked = true; done.dispatchEvent(new a.w.Event('change', { bubbles: true }));
  assert.equal(saved(a).length, 1, 'marcar guarda la categoría');
  assert.equal(a.d.querySelector('#cg-list .status').textContent, 'Cargada a Magento');
  assert.ok(saved(a)[0].cargada);
  type(a, 'cg-incluye', 'medicamentos del aparato digestivo y la digestión');
  a.d.getElementById('cg-save').click();
  assert.equal(a.d.querySelector('#cg-list .status').textContent, 'Cambió después de cargar');
  assert.equal(a.d.getElementById('cg-done').checked, false);
  done.checked = true; done.dispatchEvent(new a.w.Event('change', { bubbles: true }));
  assert.equal(a.d.querySelector('#cg-list .status').textContent, 'Cargada a Magento');
  done.checked = false; done.dispatchEvent(new a.w.Event('change', { bubbles: true }));
  assert.notEqual(a.d.querySelector('#cg-list .status').textContent, 'Cargada a Magento');
  assert.deepEqual(a.errors, []);
});

test('categorías: el editor se abre con «Nueva categoría» o al abrir una, y se cierra', { skip }, async () => {
  const a = boot();
  assert.equal(a.d.getElementById('cg-editor').hidden, false, 'sin categorías guardadas el editor está abierto');
  type(a, 'cg-nombre', 'Analgésicos'); a.d.getElementById('cg-save').click();
  a.d.getElementById('cg-close').click();
  assert.equal(a.d.getElementById('cg-editor').hidden, true);
  a.d.getElementById('cg-new').click();
  assert.equal(a.d.getElementById('cg-editor').hidden, false);
  assert.equal(a.d.getElementById('cg-nombre').value, '');
  a.d.getElementById('cg-close').click();
  a.d.querySelector('#cg-list [data-cgopen]').click();
  assert.equal(a.d.getElementById('cg-nombre').value, 'Analgésicos');
  assert.match(a.text('#cg-title'), /Analgésicos/);
});

test('categorías: en pantallas anchas el editor es un panel a la derecha', { skip }, async () => {
  const a = boot();
  a.w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  type(a, 'cg-nombre', 'Analgésicos'); a.d.getElementById('cg-save').click();
  assert.equal(a.d.getElementById('cg-editor').classList.contains('lote-drawer'), true);
});
