'use strict';
/* Diccionario de clasificación en la interfaz (jsdom). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, skip, wait } = require('./helpers/boot');

const setCat = (a, id) => { const r = a.d.querySelector(`#cats input[value="${id}"]`); r.checked = true; r.dispatchEvent(new a.w.Event('change', { bubbles: true })); };
const addRow = (a, principio, atc, fuente) => { a.fill('cl-principio', principio); a.fill('cl-atc', atc); a.fill('cl-fuente', fuente || ''); a.d.getElementById('cl-add').click(); };
const verify = async (a, fuente, por) => {
  a.d.querySelector('#cl-body [data-cl="verify"]').click(); await wait(20);
  const dlg = a.d.getElementById('input-dlg');
  dlg.querySelector('input[data-k="fuente"]').value = fuente; dlg.querySelector('input[data-k="por"]').value = por;
  dlg.querySelector('[data-id="yes"]').click(); await wait(20);
};
const dicc = a => JSON.parse(a.w.localStorage.getItem('fichas.clasif.v1') || '{"rows":[]}');

test('clasificación: una fila sin verificar no se aplica sola y avisa', { skip }, async () => {
  const a = boot();
  addRow(a, 'Tirzepatida', 'a10bx16', 'Mi memoria');
  assert.match(a.text('#cl-body'), /Sin verificar/);
  assert.equal(dicc(a).rows[0].atc, 'A10BX16');
  setCat(a, 'med');
  a.fill('f-principio', 'Tirzepatida');
  assert.equal(a.d.getElementById('f-atc').value, '', 'no se aplica sola');
  assert.match(a.text('#clasif-note'), /sin verificar/);
  assert.deepEqual(a.errors, []);
});

test('clasificación: verificar exige fuente y persona; una fila verificada llena ATC y área solo en campos vacíos', { skip }, async () => {
  const a = boot();
  addRow(a, 'Tirzepatida', 'A10BX16');
  a.d.querySelector('#cl-body [data-cl="verify"]').click(); await wait(20);
  let dlg = a.d.getElementById('input-dlg');
  dlg.querySelector('[data-id="yes"]').click(); await wait(10);
  assert.match(dlg.querySelector('[role="alert"]').textContent, /fuente/i, 'sin fuente no deja verificar');
  dlg.querySelector('input[data-k="fuente"]').value = 'Índice ATC OMS 2025';
  dlg.querySelector('[data-id="yes"]').click(); await wait(10);
  assert.match(dlg.querySelector('[role="alert"]').textContent, /quién/i, 'sin persona no deja verificar');
  dlg.querySelector('input[data-k="por"]').value = 'Ana';
  dlg.querySelector('[data-id="yes"]').click(); await wait(20);
  assert.equal(a.d.getElementById('input-dlg'), null);
  assert.match(a.text('#cl-body'), /Verificado/);
  assert.equal(dicc(a).rows[0].por, 'Ana');
  setCat(a, 'med');
  a.fill('f-principio', 'tirzepatida');
  assert.equal(a.d.getElementById('f-atc').value, 'A10BX16');
  assert.equal(a.d.getElementById('f-area').value, 'Diabetes y metabolismo');
  assert.match(a.text('#clasif-note'), /Completado desde el diccionario verificado/);
  a.fill('f-principio', 'Otra cosa'); a.fill('f-atc', 'N02BE01'); a.fill('f-area', 'Cardiovascular');
  a.fill('f-principio', 'Tirzepatida');
  assert.equal(a.d.getElementById('f-atc').value, 'N02BE01', 'no pisa lo ya capturado');
  assert.equal(a.d.getElementById('f-area').value, 'Cardiovascular');
  assert.deepEqual(a.errors, []);
});

test('clasificación: «Sugerir con IA» usa el diccionario y no gasta llamadas', { skip }, async () => {
  const a = boot({ cohere_api_key_local: 'k' });
  let llamadas = 0; a.w.fetch = async () => { llamadas++; throw new Error('no debía llamar'); };
  addRow(a, 'Tirzepatida', 'A10BX16', 'Memoria');
  setCat(a, 'med');
  a.fillMed('Mounjaro', 'Caja con 4 plumas', 'MOU-1', { principio: 'Tirzepatida' });
  a.d.getElementById('area-ai').click(); await wait(30);
  assert.equal(llamadas, 0);
  assert.match(a.text('#area-ai-out'), /Diccionario, sin verificar/);
  assert.match(a.text('#area-ai-out'), /A10BX16/);
  assert.deepEqual(a.errors, []);
});

test('clasificación: un ATC que viene de la IA se guarda en el diccionario como sin verificar', { skip }, async () => {
  const a = boot({ cohere_api_key_local: 'k' });
  a.w.fetch = async () => ({ ok: true, status: 200, json: async () => ({ message: { content: [{ type: 'text', text: JSON.stringify({ areas: [{ area: 'Dolor e inflamación', motivo: 'analgésico' }], atc: 'N02BE01' }) }] } }) });
  setCat(a, 'med');
  a.fillMed('Tempra', 'Caja con 20 tabletas', 'TEM-1', { principio: 'Paracetamol' });
  a.d.getElementById('area-ai').click(); await wait(40);
  assert.match(a.text('#area-ai-out'), /Sugerencia de IA, sin verificar/);
  a.d.querySelector('[data-areaapply="atc"]').click(); await wait(20);
  const r = dicc(a).rows;
  assert.equal(r.length, 1);
  assert.deepEqual([r[0].atc, r[0].estado], ['N02BE01', 'sin verificar'.replace(' ', '_')]);
  assert.match(r[0].fuente, /IA/);
  assert.deepEqual(a.errors, []);
});

test('clasificación: cambiar el ATC de una fila verificada la devuelve a sin verificar', { skip }, async () => {
  const a = boot();
  addRow(a, 'Paracetamol', 'N02BE01');
  await verify(a, 'OMS', 'Ana');
  assert.equal(dicc(a).rows[0].estado, 'verificado');
  a.d.querySelector('#cl-body [data-cl="edit"]').click(); await wait(20);
  const dlg = a.d.getElementById('input-dlg');
  dlg.querySelector('input[data-k="atc"]').value = 'N02BA01';
  dlg.querySelector('[data-id="yes"]').click(); await wait(20);
  assert.equal(dicc(a).rows[0].estado, 'sin_verificar');
  assert.equal(dicc(a).rows[0].atc, 'N02BA01');
});

test('clasificación: la plantilla toma los principios activos del lote que faltan', { skip }, async () => {
  const a = boot();
  a.addMed('TEM-1', 'Tempra', '20');
  await wait(30);
  const antes = a.downloads.length;
  a.d.getElementById('cl-tpl').click(); await wait(60);
  assert.match(a.text('#cl-status'), /Plantilla con 1 principio/);
  assert.ok(a.downloads.length > antes);
});
