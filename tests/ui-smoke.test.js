/*
 * Pruebas de humo que EJECUTAN la app en un DOM simulado (jsdom).
 * Las pruebas de ui-regression.test.js solo buscan texto en el código; estas cargan index.html + js/*.js
 * y ejercen los flujos reales. Si jsdom no está instalado (npm install), se omiten.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (_) { /* sin jsdom: se omiten */ }
const skip = !JSDOM && 'jsdom no está instalado (ejecuta npm install)';

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1].split('?')[0]);

function boot(storage = {}) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { if (!/Not implemented: (Window's )?scrollTo/.test(e.message)) errors.push(e.detail && e.detail.message || e.message); });
  const dom = new JSDOM(html, { url: 'http://localhost:8000/index.html', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window, d = w.document;
  Object.entries(storage).forEach(([k, v]) => w.localStorage.setItem(k, v));
  w.addEventListener('error', e => errors.push(e.message));
  const downloads = [];
  w.URL.createObjectURL = b => { downloads.push(b); return 'blob:test'; };
  w.URL.revokeObjectURL = () => {};
  w.scrollTo = () => {};
  // jsdom no trae estas APIs de navegador que la app usa al descargar/leer archivos.
  if (!w.TextEncoder) w.TextEncoder = TextEncoder;
  if (!w.TextDecoder) w.TextDecoder = TextDecoder;
  if (!w.Blob.prototype.arrayBuffer) w.Blob.prototype.arrayBuffer = function () {
    return new Promise((res, rej) => { const r = new w.FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsArrayBuffer(this); });
  };
  for (const s of scripts) w.eval(fs.readFileSync(path.join(root, s), 'utf8'));
  const fill = (id, val) => { const el = d.getElementById(id); el.value = val; el.dispatchEvent(new w.Event('input', { bubbles: true })); el.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const addMed = (sku, marca, contenido) => {
    fill('f-marca', marca); fill('f-concentracion', '500 mg'); fill('f-principio', 'Paracetamol');
    fill('f-forma', 'Tabletas'); fill('f-contenido', contenido); fill('f-laboratorio', 'Genomma'); fill('f-via', 'Oral'); fill('f-receta', 'no'); fill('sku', sku);
    d.getElementById('add').click();
  };
  const rows = () => [...d.querySelectorAll('#lote-body tbody tr')];
  const titles = () => [...d.querySelectorAll('#lote-body tbody tr td.t')].map(x => x.textContent);
  const count = () => d.getElementById('lote-count').textContent;
  const status = () => d.getElementById('persistence-status').textContent;
  const ls = () => Object.fromEntries(Array.from({ length: w.localStorage.length }, (_, i) => { const k = w.localStorage.key(i); return [k, w.localStorage.getItem(k)]; }));
  return { w, d, errors, downloads, fill, addMed, rows, titles, count, status, ls };
}

test('lote: al agregar un producto la tabla se pinta y no hay errores de ejecución', { skip }, () => {
  const a = boot();
  a.addMed('A1', 'Tempra', '30');
  assert.equal(a.count(), '1');
  assert.equal(a.rows().length, 1, 'la tabla del lote debe mostrar la fila');
  assert.match(a.titles()[0], /Tempra 500 mg/);
  assert.deepEqual(a.errors, []);
});

test('lote: el estado de persistencia se actualiza al agregar y al vaciar', { skip }, () => {
  const a = boot();
  assert.match(a.status(), /vacío/);
  a.addMed('A1', 'Tempra', '30');
  assert.match(a.status(), /1 producto\(s\)/);
  assert.doesNotMatch(a.status(), /vacío/);
  const del = a.d.querySelector('[data-del]'); del.click();
  assert.match(a.status(), /vacío/);
});

test('lote: sobrevive a una recarga (localStorage)', { skip }, () => {
  const a = boot();
  a.addMed('A1', 'Tempra', '30'); a.addMed('A2', 'Dolofin', '20');
  const b = boot(a.ls());
  assert.equal(b.count(), '2');
  assert.equal(b.rows().length, 2);
  assert.deepEqual(b.errors, []);
});

test('presentación: 1 va en singular y 30 en plural en título y lote', { skip }, () => {
  const a = boot();
  a.addMed('P1', 'Tempra', '1'); a.addMed('P2', 'Dolofin', '30');
  const t = a.titles();
  assert.match(t[0], /Tabletas, 1 pieza(?!s)/);
  assert.match(t[1], /Tabletas, 30 piezas/);
});

test('editar: el producto no sale del lote hasta guardar y no se pierde al recargar o limpiar', { skip }, () => {
  const a = boot();
  a.addMed('E1', 'Tempra', '30'); a.addMed('E2', 'Dolofin', '20');
  a.d.querySelector('[data-edit]').click();
  assert.equal(a.count(), '2', 'durante la edición el lote conserva ambos productos');
  assert.equal(JSON.parse(a.ls()['fichas.lote.v1']).length, 2, 'y el almacenamiento también');
  assert.equal(a.d.getElementById('add').textContent, 'Guardar cambios');
  // recargar a mitad de la edición no pierde nada
  assert.equal(boot(a.ls()).count(), '2');
  // limpiar el formulario cancela la edición y conserva la versión anterior
  a.d.getElementById('clear').click();
  assert.equal(a.count(), '2');
  assert.equal(a.d.getElementById('add').textContent, 'Agregar al lote');
});

test('editar: guardar cambios reemplaza el producto en su misma posición, sin duplicarlo', { skip }, () => {
  const a = boot();
  a.addMed('E1', 'Tempra', '30'); a.addMed('E2', 'Dolofin', '20');
  a.d.querySelector('[data-edit]').click();
  a.fill('f-marca', 'Tempra Forte');
  a.d.getElementById('add').click();
  assert.equal(a.count(), '2');
  assert.match(a.titles()[0], /Tempra Forte/);
  assert.match(a.titles()[1], /Dolofin/);
  assert.equal(a.d.getElementById('add').textContent, 'Agregar al lote');
  assert.deepEqual(a.errors, []);
});

test('respaldo: exportar y restaurar en otra instancia conserva los productos', { skip }, async () => {
  const a = boot();
  a.addMed('B1', 'Tempra', '30'); a.addMed('B2', 'Dolofin', '20');
  a.d.getElementById('lote-backup').click();
  await new Promise(r => setTimeout(r, 100));
  const text = Buffer.from(await a.downloads.at(-1).arrayBuffer()).toString('utf8');
  assert.equal(JSON.parse(text).schema, 'fichas.lote-backup.v1');
  const b = boot();
  const file = new b.w.File([text], 'respaldo.json', { type: 'application/json' });
  const input = b.d.getElementById('lote-restore');
  Object.defineProperty(input, 'files', { value: [file] });
  input.dispatchEvent(new b.w.Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 200));
  assert.equal(b.count(), '2');
  assert.equal(b.rows().length, 2);
});

test('exportación Magento: descarga un CSV con la cabecera de 104 columnas', { skip }, async () => {
  const a = boot();
  a.addMed('M1', 'Tempra', '30');
  assert.match(a.d.getElementById('exp-summary').textContent, /104 columnas/);
  a.d.getElementById('exp-dl').click();
  await new Promise(r => setTimeout(r, 100));
  assert.equal(a.downloads.length, 1);
  const txt = Buffer.from(await a.downloads[0].arrayBuffer()).toString('latin1');
  assert.equal(txt.split('\r\n')[0].split(',').length, 104);
});

test('carga masiva: agregar desde CSV pinta la tabla del lote', { skip }, async () => {
  const a = boot();
  const hdr = a.w.Fichas.templateRows('med')[0];
  const base = { 'Categoría': 'Medicamentos', 'Concentración': '500 mg', 'Principio activo': 'Paracetamol', 'Forma farmacéutica': 'Tabletas', 'Laboratorio': 'Genomma', 'Vía de administración': 'Oral', '¿Requiere receta médica?': 'No' };
  const row = o => hdr.map(h => ({ ...base, ...o })[h] ?? '').join(',');
  const csv = [hdr.join(','), row({ SKU: 'C1', Marca: 'Tempra', 'Presentación o piezas': '20' }), row({ SKU: 'C2', Marca: 'Dolofin', 'Presentación o piezas': 'Caja con 4 plumas' })].join('\n');
  const file = new a.w.File([csv], 'lote.csv', { type: 'text/csv' });
  const input = a.d.getElementById('bulk-file');
  Object.defineProperty(input, 'files', { value: [file] });
  input.dispatchEvent(new a.w.Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 300));
  a.d.querySelector('[data-bulk="add"]').click();
  await new Promise(r => setTimeout(r, 200));
  assert.equal(a.count(), '2');
  assert.equal(a.rows().length, 2);
  assert.deepEqual(a.errors, []);
});
