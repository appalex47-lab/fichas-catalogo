'use strict';
/* Catálogo interno y complementos, ejecutando la interfaz en jsdom. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, skip, wait } = require('./helpers/boot');

const setCat = (a, id) => { const r = a.d.querySelector(`#cats input[value="${id}"]`); r.checked = true; r.dispatchEvent(new a.w.Event('change', { bubbles: true })); };
const addBeb = async (a, sku, marca) => {
  setCat(a, 'beb');
  Object.entries({ marca, tipo: 'Nutrición oral', sabor: 'Vainilla', atributo: 'Alta en proteína', contenido: '200 mL' }).forEach(([k, v]) => a.fill('f-' + k, v));
  a.fill('sku', sku); a.d.getElementById('add').click(); await wait(40);
};
const addMed = async (a, sku, marca, over) => { setCat(a, 'med'); a.fillMed(marca, 'Caja con 4 plumas', sku, { principio: 'Tirzepatida', ...over }); a.d.getElementById('add').click(); await wait(40); };
const catalog = a => JSON.parse(a.w.localStorage.getItem('fichas.catalog.v1') || '{"entries":[],"links":[]}');
const dlg = a => a.d.getElementById('link-dlg');

test('catálogo: un complemento sin producto principal queda esperando y no abre ventana', { skip }, async () => {
  const a = boot();
  await addBeb(a, 'FRE-200', 'Fresubin');
  assert.equal(dlg(a), null);
  assert.match(a.text('#cat-body'), /Fresubin/);
  assert.match(a.text('#cat-body'), /Esperando producto principal/);
  assert.equal(catalog(a).entries.length, 1);
  assert.deepEqual(a.errors, []);
});

test('catálogo: al guardar el principal, ofrece los complementos en espera y los vincula al confirmar', { skip }, async () => {
  const a = boot();
  await addBeb(a, 'FRE-200', 'Fresubin');
  await addMed(a, 'MOU-1', 'Mounjaro', { receta: 'si', especialidad: 'si' });
  assert.ok(dlg(a), 'aparece la ventana de asignación');
  assert.match(dlg(a).textContent, /Fresubin/);
  assert.equal(dlg(a).querySelector('input[data-sku="FRE-200"]').checked, false, 'sin IA nada viene marcado');
  dlg(a).querySelector('input[data-sku="FRE-200"]').click();
  dlg(a).querySelector('[data-ld="link"]').click();
  await wait(40);
  assert.equal(dlg(a), null);
  const c = catalog(a);
  assert.deepEqual(c.links.map(l => [l.p, l.c, l.by]), [['MOU-1', 'FRE-200', 'manual']]);
  assert.match(a.text('#cat-body'), /Complemento vinculado/);
  assert.deepEqual(a.errors, []);
});

test('catálogo: un medicamento con receta no se ofrece como complemento y vaciar el lote no borra el catálogo', { skip }, async () => {
  const a = boot();
  await addMed(a, 'MOU-1', 'Mounjaro', { receta: 'si', especialidad: 'si' });
  await addMed(a, 'WEG-1', 'Wegovy', { receta: 'si', especialidad: 'si' });
  assert.equal(dlg(a), null, 'ninguno es complemento de otro');
  assert.match(a.text('#cat-body'), /No puede ser complemento/);
  a.d.getElementById('lote-clear').click(); await wait(20); await a.confirm(true);
  assert.equal(a.rows().length, 0);
  assert.equal(catalog(a).entries.length, 2);
  assert.deepEqual(a.errors, []);
});

test('catálogo: con llave la IA propone, viene marcado y queda registrado como IA', { skip }, async () => {
  const a = boot({ cohere_api_key_local: 'k' });
  a.w.fetch = async (url, init) => {
    const body = JSON.parse(init.body), user = JSON.parse(body.messages[1].content);
    const id = (user.candidatos.find(x => /Mounjaro/.test(x.nombre)) || {}).id;
    return { ok: true, status: 200, json: async () => ({ message: { content: [{ type: 'text', text: JSON.stringify({ coincidencias: id ? [{ id, motivo: 'nutrición oral durante el tratamiento' }, { id: 99, motivo: 'inventado' }] : [] }) }] } }) };
  };
  await addMed(a, 'MOU-1', 'Mounjaro', { receta: 'si', especialidad: 'si' });
  await addBeb(a, 'FRE-200', 'Fresubin');
  await wait(40);
  assert.ok(dlg(a), 'la IA encontró un principal');
  const box = dlg(a).querySelector('input[data-sku="MOU-1"]');
  assert.equal(box.checked, true);
  assert.match(dlg(a).textContent, /Propuesto por IA: nutrición oral/);
  assert.equal(dlg(a).querySelectorAll('input[data-sku]').length, 1, 'el id inventado se descarta');
  dlg(a).querySelector('[data-ld="link"]').click(); await wait(40);
  assert.deepEqual(catalog(a).links.map(l => l.by), ['ia']);
  assert.deepEqual(a.errors, []);
});

test('catálogo: «No es complemento» lo saca de la lista y «Quitar vínculo» lo deshace', { skip }, async () => {
  const a = boot();
  await addMed(a, 'MOU-1', 'Mounjaro', { receta: 'si', especialidad: 'si' });
  await addBeb(a, 'CREMA-1', 'Crema');
  assert.ok(dlg(a));
  dlg(a).querySelector('[data-ld="indep"]').click(); await wait(40);
  assert.match(a.text('#cat-body'), /No es complemento/);
  await addBeb(a, 'FRE-200', 'Fresubin');
  dlg(a).querySelector('input[data-sku="MOU-1"]').click();
  dlg(a).querySelector('[data-ld="link"]').click(); await wait(40);
  assert.equal(catalog(a).links.length, 1);
  a.d.querySelector('[data-cat-unlink]').click(); await wait(20);
  assert.equal(catalog(a).links.length, 0);
});
