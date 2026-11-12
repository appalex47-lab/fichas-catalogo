'use strict';
/* Exportar a otras plataformas: Magento y Merchant Center, ejecutando la interfaz en jsdom. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, skip, wait } = require('./helpers/boot');

const lastText = async a => Buffer.from(await a.downloads[a.downloads.length - 1].arrayBuffer()).toString('utf8');

test('exportar: la sección se llama «Exportar a otras plataformas» y Magento sigue igual', { skip }, async () => {
  const a = boot();
  a.addMed('M1', 'Tempra', '30');
  assert.match(a.text('#h-exp'), /Exportar a otras plataformas/);
  assert.equal(a.text('[data-nav="exportacion"] .mnav-t'), 'Exportar');
  assert.equal(a.d.getElementById('exp-magento').hidden, false);
  assert.equal(a.d.getElementById('exp-mc').hidden, true);
  assert.match(a.text('#exp-summary'), /104 columnas/);
  a.d.getElementById('exp-dl').click(); await wait(150);
  assert.match((await lastText(a)).split('\r\n')[0], /^sku,/);
});

test('exportar: Merchant Center descarga id, título y descripción en .txt con tabuladores', { skip }, async () => {
  const a = boot();
  a.addMed('M1', 'Tempra', '30'); a.addMed('M2', 'Dolofin', '20');
  a.d.querySelector('#exp-plat [data-plat="mc"]').click();
  assert.equal(a.d.getElementById('exp-magento').hidden, true);
  assert.equal(a.d.getElementById('exp-mc').hidden, false);
  assert.match(a.text('#mc-summary'), /2 de 2 productos se exportan/);
  assert.match(a.text('#mc-summary'), /Vista previa/);
  a.d.getElementById('mc-dl').click(); await wait(150);
  const lines = (await lastText(a)).trim().split('\n');
  assert.equal(lines[0], 'id\ttitle\tdescription');
  assert.equal(lines.length, 3);
  assert.deepEqual(lines[1].split('\t').slice(0, 1), ['M1']);
  assert.deepEqual(a.errors, []);
});

test('exportar: Merchant Center en CSV, con avisos de lo que no sale y la opción guardada', { skip }, async () => {
  const a = boot();
  a.addMed('M1', 'Tempra', '30'); a.addMed('', 'SinSku', '20');
  a.d.querySelector('#exp-plat [data-plat="mc"]').click();
  assert.match(a.text('#mc-summary'), /1 de 2 productos se exportan/);
  assert.match(a.text('#mc-summary'), /1 sin SKU/);
  const f = a.d.getElementById('mc-fmt'); f.value = 'csv'; f.dispatchEvent(new a.w.Event('change', { bubbles: true }));
  a.d.getElementById('mc-dl').click(); await wait(150);
  assert.match(await lastText(a), /^id,title,description\r\n/);
  assert.equal(JSON.parse(a.w.localStorage.getItem('fichas.mc.v1')).fmt, 'csv');
});

test('exportar: sin productos, Merchant Center lo dice y no deja descargar', { skip }, async () => {
  const a = boot();
  a.d.querySelector('#exp-plat [data-plat="mc"]').click();
  assert.match(a.text('#mc-summary'), /No hay productos listos para exportar/);
  assert.equal(a.d.getElementById('mc-dl').disabled, true);
});
