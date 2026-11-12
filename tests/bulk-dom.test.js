'use strict';
/* Cambios masivos del lote, ejecutando la interfaz en jsdom. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, skip, wait } = require('./helpers/boot');

const lote = a => JSON.parse(a.w.localStorage.getItem('fichas.lote.v1') || '[]');
const viaOf = (a, sku) => (lote(a).find(x => x.sku === sku) || { v: {} }).v.via;
const labOf = (a, sku) => (lote(a).find(x => x.sku === sku) || { v: {} }).v.laboratorio;
const setup = async () => {
  const a = boot();
  a.addMed('B1', 'Alfa', '30', { via: 'Oral' });
  a.addMed('B2', 'Beta', '30', { via: '' });
  a.addMed('B3', 'Gama', '30', { via: '' });
  await wait(700);
  return a;
};
const click = (a, sel) => a.d.querySelector(sel).click();

test('masivo: el resumen propone la vía con la evidencia del lote y exige confirmar el dato regulatorio', { skip }, async () => {
  const a = await setup();
  assert.ok(a.d.querySelector('#lote-body .bulk-box'), 'aparece el resumen');
  assert.match(a.text('#lote-body .bulk-box'), /2 producto\(s\) sin vía de administración/);
  assert.equal(a.d.querySelector('[data-bk="apply"]'), null, 'vía no tiene «aplicar a todos»');
  click(a, '[data-bk="list"]');
  const dlg = a.d.getElementById('bulk-dlg');
  assert.ok(dlg, 'se abre la lista');
  assert.equal(dlg.querySelectorAll('input[data-pid]:checked').length, 0, 'los datos regulatorios llegan sin marcar');
  dlg.querySelectorAll('input[data-pid]').forEach(c => c.click());
  dlg.querySelector('[data-id="yes"]').click(); await wait(30);
  assert.match(dlg.textContent, /Confirma que revisaste/);
  assert.equal(viaOf(a, 'B2'), undefined, 'sin confirmar no cambia nada');
  dlg.querySelector('input[id$="-c"]').click();
  dlg.querySelector('[data-id="yes"]').click(); await wait(80);
  assert.equal(a.d.getElementById('bulk-dlg'), null);
  assert.equal(viaOf(a, 'B2'), 'Oral'); assert.equal(viaOf(a, 'B3'), 'Oral');
  click(a, '[data-bk="undo"]'); await wait(30);
  assert.ok(!viaOf(a, 'B2') && !viaOf(a, 'B3'), 'deshacer devuelve los productos a como estaban');
  assert.deepEqual(a.errors, []);
});

test('masivo: marcar productos y cambiar el laboratorio muestra antes y después', { skip }, async () => {
  const a = await setup();
  a.d.querySelectorAll('input[data-bksel]').forEach((c, i) => { if (i < 2) { c.checked = true; c.dispatchEvent(new a.w.Event('change', { bubbles: true })); } });
  assert.match(a.text('#bk-count'), /2 marcado/);
  click(a, '[data-bk="change"]');
  const dlg = a.d.getElementById('bulk-dlg');
  assert.ok(dlg);
  const v = dlg.querySelector('input[id$="-v"]'); v.value = 'Pisa'; v.dispatchEvent(new a.w.Event('input', { bubbles: true }));
  assert.equal(dlg.querySelectorAll('tbody tr').length, 2);
  assert.match(dlg.querySelector('tbody').textContent, /Genomma/);
  assert.match(dlg.querySelector('tbody').textContent, /Pisa/);
  dlg.querySelector('[data-id="yes"]').click(); await wait(80);
  const labs = lote(a).map(x => x.v.laboratorio);
  assert.equal(labs.filter(x => x === 'Pisa').length, 2);
  assert.equal(labs.filter(x => x === 'Genomma').length, 1);
  assert.deepEqual(a.errors, []);
});

test('masivo: buscar y reemplazar encuentra los productos con el valor exacto', { skip }, async () => {
  const a = await setup();
  click(a, '[data-bk="replace"]');
  const dlg = a.d.getElementById('bulk-dlg');
  const f = dlg.querySelector('input[id$="-f"]'); f.value = 'genomma'; f.dispatchEvent(new a.w.Event('input', { bubbles: true }));
  const v = dlg.querySelector('input[id$="-v"]'); v.value = 'Genomma Lab'; v.dispatchEvent(new a.w.Event('input', { bubbles: true }));
  assert.equal(dlg.querySelectorAll('tbody tr').length, 3);
  dlg.querySelector('[data-id="yes"]').click(); await wait(80);
  assert.ok(lote(a).every(x => x.v.laboratorio === 'Genomma Lab'));
  assert.deepEqual(a.errors, []);
});

test('masivo: Conocimiento propone el laboratorio de una marca conocida y se aplica a todos con un clic', { skip }, async () => {
  const a = boot();
  a.addMed('K1', 'Tempra', '30', { laboratorio: 'Genomma' });
  await wait(500);
  a.addMed('K2', 'Tempra', '20', { laboratorio: '' });
  a.addMed('K3', 'Tempra', '10', { laboratorio: '' });
  await wait(1500);
  const btn = a.d.querySelector('[data-bk="apply"]');
  assert.ok(btn, 'aparece «Aplicar» para el laboratorio');
  assert.match(a.text('#lote-body .bulk-box'), /2 producto\(s\) sin laboratorio/);
  btn.click(); await wait(200);
  assert.equal(labOf(a, 'K2'), 'Genomma'); assert.equal(labOf(a, 'K3'), 'Genomma');
  assert.match(a.text('#lote-body .bulk-box'), /Último cambio masivo/);
  assert.deepEqual(a.errors, []);
});

test('masivo: el resumen muestra lo que se corrigió solo', { skip }, async () => {
  const a = boot();
  a.addMed('C1', 'Tempra', '30 pzas');
  await wait(1500);
  assert.match(a.text('#lote-body .bulk-box'), /Se corrigieron solas \(1\)/);
  assert.match(a.text('#lote-body .bulk-box'), /30 piezas/);
  assert.deepEqual(a.errors, []);
});
