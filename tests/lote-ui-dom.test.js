'use strict';
/* Lote con muchos productos: páginas, densidad y panel de detalle, ejecutando la interfaz en jsdom. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, skip, wait } = require('./helpers/boot');

const many = n => JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: 'i' + i, sku: 'S' + String(i).padStart(3, '0'), cat: 'beb', img: '', ai: {}, v: { marca: 'Marca' + i, tipo: 'Suero oral', sabor: 'Coco', atributo: 'Sin azúcar', contenido: '600 mL' } })));
const rows = a => a.d.querySelectorAll('#lote-body .lote-table tbody tr[data-id]');

test('lote: pagina de 25 en 25 y cambia el tamaño de página', { skip }, async () => {
  const a = boot({ 'fichas.lote.v1': many(60) });
  await wait(400);
  assert.equal(rows(a).length, 25);
  assert.match(a.text('#lote-body .pager'), /Mostrando 1–25 de 60/);
  assert.equal(a.d.querySelector('#lote-body [data-page="-1"]').disabled, true);
  a.d.querySelector('#lote-body [data-page="1"]').click();
  assert.match(a.text('#lote-body .pager'), /Mostrando 26–50 de 60/);
  a.d.querySelector('#lote-body [data-page="1"]').click();
  assert.equal(rows(a).length, 10);
  assert.equal(a.d.querySelector('#lote-body [data-page="1"]').disabled, true);
  const sel = a.d.getElementById('lote-size'); sel.value = '100'; sel.dispatchEvent(new a.w.Event('change', { bubbles: true }));
  assert.equal(rows(a).length, 60);
  assert.equal(a.d.querySelector('#lote-body .pager'), null, 'con todo en una página no hace falta el paginador');
  assert.deepEqual(a.errors, []);
});

test('lote: «Marcar los filtrados» alcanza a todas las páginas', { skip }, async () => {
  const a = boot({ 'fichas.lote.v1': many(60) });
  await wait(400);
  a.d.querySelector('#lote-body [data-bk="selfilt"]').click();
  assert.match(a.text('#bk-count'), /60 marcado/);
});

test('lote: la densidad compacta es la de inicio y se puede cambiar', { skip }, async () => {
  const a = boot({ 'fichas.lote.v1': many(3) });
  await wait(300);
  assert.ok(a.d.querySelector('#lote-body .lote-table--compact'));
  a.d.querySelector('#lote-body [data-dens]').click();
  assert.equal(a.d.querySelector('#lote-body .lote-table--compact'), null);
  assert.match(a.text('#lote-body .bk-bar'), /Densidad: cómoda/);
  assert.equal(a.w.localStorage.getItem('fichas.dens'), 'comfy');
});

test('lote: en pantallas anchas «Ver» abre el detalle en un panel lateral sin empujar la lista', { skip }, async () => {
  const a = boot({ 'fichas.lote.v1': many(3) });
  a.w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  a.d.querySelector('#lote-body [data-bk="clearsel"]') && 0;
  a.w.dispatchEvent(new a.w.Event('resize'));
  await wait(300);
  a.d.querySelector('#lote-body [data-filter="todos"]').click();
  a.d.querySelector('#lote-body [data-toggle]').click();
  const box = a.d.getElementById('lote-drawer');
  assert.ok(box && !box.hidden, 'el panel está visible');
  assert.match(box.textContent, /S000/);
  assert.equal(a.d.querySelectorAll('#lote-body .lrow-detail').length, 0, 'la lista no se empuja');
  box.querySelector('[data-ldclose]').click();
  assert.equal(a.d.getElementById('lote-drawer').hidden, true);
  assert.deepEqual(a.errors, []);
});

test('lote: «Agrupar por estado» arma un grupo por estado y abre solo los que requieren acción', { skip }, async () => {
  const items = JSON.parse(many(4));
  items[0].v.marca = ''; // sin marca: queda bloqueado
  const a = boot({ 'fichas.lote.v1': JSON.stringify(items) });
  await wait(400);
  a.d.querySelector('#lote-body [data-group]').click();
  const g = [...a.d.querySelectorAll('#lote-body details.lgroup')];
  assert.ok(g.length >= 2, 'hay al menos dos grupos');
  assert.deepEqual(g.map(x => x.dataset.lgroup).slice(0, 1), ['bloqueado']);
  assert.equal(g.find(x => x.dataset.lgroup === 'bloqueado').open, true, 'lo bloqueado se abre solo');
  assert.equal(g.find(x => x.dataset.lgroup === 'listo').open, false, 'lo listo queda plegado');
  assert.match(a.text('#lote-body details[data-lgroup="bloqueado"] summary'), /Bloqueados 1/);
  assert.equal(a.d.querySelector('#lote-body .pager'), null);
  a.d.querySelector('#lote-body [data-group]').click();
  assert.equal(a.d.querySelectorAll('#lote-body details.lgroup').length, 0, 'se vuelve a la tabla');
  assert.deepEqual(a.errors, []);
});
