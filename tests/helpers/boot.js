'use strict';
/* Arranca la app completa (index.html + js/*.js) en jsdom. Si jsdom no está instalado, `skip` explica por qué. */
const fs = require('node:fs');
const path = require('node:path');
let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (_) { /* sin jsdom: las pruebas de DOM se omiten */ }
const skip = !JSDOM && 'jsdom no está instalado (ejecuta npm install)';
const root = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1].split('?')[0]);
const wait = ms => new Promise(r => setTimeout(r, ms));

function boot(storage = {}, opts = {}) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { if (!/Not implemented: (Window's )?(scrollTo|scrollIntoView)/.test(e.message)) errors.push(e.detail && e.detail.message || e.message); });
  const dom = new JSDOM(html, { url: 'http://localhost:8000/index.html', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window, d = w.document;
  Object.entries(storage).forEach(([k, v]) => w.localStorage.setItem(k, v));
  w.addEventListener('error', e => errors.push(e.message));
  const downloads = [];
  w.URL.createObjectURL = b => { downloads.push(b); return 'blob:test'; };
  w.URL.revokeObjectURL = () => {};
  w.scrollTo = () => {};
  if (!w.TextEncoder) w.TextEncoder = TextEncoder;
  if (!w.TextDecoder) w.TextDecoder = TextDecoder;
  if (!w.Blob.prototype.arrayBuffer) w.Blob.prototype.arrayBuffer = function () { return new Promise((res, rej) => { const r = new w.FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsArrayBuffer(this); }); };
  const copied = [];
  if (opts.clipboard !== false) Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async t => { copied.push(t); } }, configurable: true });
  for (const s of scripts) w.eval(fs.readFileSync(path.join(root, s), 'utf8'));
  const fill = (id, val) => { const el = d.getElementById(id); el.value = val; el.dispatchEvent(new w.Event('input', { bubbles: true })); el.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const med = { marca: 'Tempra', concentracion: '500 mg', principio: 'Paracetamol', forma: 'Tabletas', contenido: '30', laboratorio: 'Genomma', via: 'Oral', receta: 'no' };
  const fillMed = (marca, contenido, sku, over = {}) => {
    const v = { ...med, marca, contenido, ...over };
    for (const [k, val] of Object.entries(v)) fill('f-' + k, val);
    if (sku != null) fill('sku', sku);
  };
  const addMed = (sku, marca, contenido, over) => { fillMed(marca, contenido, sku, over); d.getElementById('add').click(); };
  const rows = () => [...d.querySelectorAll('#lote-body tbody tr[data-id]')];
  const text = sel => (d.querySelector(sel) || { textContent: '' }).textContent.replace(/\s+/g, ' ').trim();
  const toast = () => d.getElementById('toast').textContent;
  const confirm = async yes => { const b = d.querySelector(`#confirm-dlg [data-cd="${yes ? 'yes' : 'no'}"]`); if (b) b.click(); await wait(20); };
  const ls = () => Object.fromEntries(Array.from({ length: w.localStorage.length }, (_, i) => { const k = w.localStorage.key(i); return [k, w.localStorage.getItem(k)]; }));
  return { w, d, errors, downloads, copied, fill, fillMed, addMed, rows, text, toast, confirm, ls, wait, count: () => d.getElementById('lote-count').textContent };
}
module.exports = { boot, skip, wait };
