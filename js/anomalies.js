/*
 * Fase 2: procedencia, auditoría y anomalías de lote.
 * Determinista, sin modificar datos y sin depender de IA.
 */
(function (root) {
'use strict';
const N = (typeof module !== 'undefined' && module.exports) ? require('./normalization.js') : root.FichasNormalization;
const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
const skuKey = s => norm(s).replace(/\s+/g, '');
const titleKey = s => norm(s);
const now = () => new Date().toISOString();

function sourceMapFor(item) {
  const ai = item?.ai || {};
  const out = {};
  Object.keys(item?.v || {}).forEach(k => {
    const flag = ai[k];
    if (flag === 'sugerido') out[k] = 'ai';
    else if (flag === 'imagen') out[k] = 'vision';
    else if (flag === 'extraido') out[k] = 'ai';
    else if (flag === 'confirmado') out[k] = 'ai-confirmed';
    else out[k] = 'manual';
  });
  return out;
}

function provenanceFor(item, previous) {
  const ts = now();
  const sources = sourceMapFor(item);
  const old = previous || item?.provenance || {};
  const out = {};
  Object.keys(item?.v || {}).forEach(field => {
    const value = String(item.v[field] ?? '');
    const src = sources[field] || old[field]?.source || 'manual';
    const prev = old[field];
    out[field] = {
      source: src,
      evidence: prev?.evidence || '',
      original: prev?.original ?? value,
      normalized: value.replace(/\s+/g, ' ').trim(),
      updatedAt: prev?.source === src && prev?.normalized === value ? (prev.updatedAt || ts) : ts
    };
  });
  return out;
}

function detectBatch(items, evaluations) {
  const list = Array.isArray(items) ? items : [];
  const evals = Array.isArray(evaluations) ? evaluations : [];
  const anomalies = [];
  const groups = new Map();
  const addGroup = (type, key, indexes, message, severity='warning') => {
    if (!key || indexes.length < 2) return;
    anomalies.push({ type, severity, key, indexes, message });
  };
  list.forEach((it, i) => {
    const k = skuKey(it?.sku);
    if (k) {
      const arr = groups.get('sku:'+k) || []; arr.push(i); groups.set('sku:'+k, arr);
    }
    const title = evals[i]?.res?.title?.title || '';
    const tk = titleKey(title);
    if (tk) { const arr = groups.get('title:'+tk) || []; arr.push(i); groups.set('title:'+tk, arr); }
  });
  for (const [key, indexes] of groups) {
    if (key.startsWith('sku:')) addGroup('duplicate-sku', key.slice(4), indexes, 'SKU repetido dentro del lote.', 'error');
    else addGroup('duplicate-title', key.slice(6), indexes, 'Título normalizado repetido dentro del lote.', 'warning');
  }
  if (N) {
    const nearTitles = N.detectNearDuplicates(list, (it, i) => evals[i]?.res?.title?.title || '', { threshold: 0.92, minLength: 8 });
    nearTitles.forEach(x => anomalies.push({ type:'near-duplicate-title', severity:'warning', key:x.key, indexes:x.indexes, score:x.score, message:`Títulos muy similares (${Math.round(x.score*100)}%). Revisa si son productos distintos o variantes.` }));
    const nearSkus = N.detectNearDuplicates(list, it => it?.sku || '', { threshold: 0.90, minLength: 5 });
    nearSkus.forEach(x => anomalies.push({ type:'near-duplicate-sku', severity:'warning', key:x.key, indexes:x.indexes, score:x.score, message:`SKUs muy similares (${Math.round(x.score*100)}%). Verifica posibles errores de captura.` }));
  }
  list.forEach((it, i) => {
    const q = evals[i]?.quality;
    if (q?.issues?.some(x => x.code === 'unassigned-text')) anomalies.push({ type:'unassigned-data', severity:'warning', key:String(it.sku || i), indexes:[i], message:'Hay datos crudos que no pudieron asignarse a campos.' });
    if (q?.issues?.some(x => x.code === 'unknown-field')) anomalies.push({ type:'unknown-fields', severity:'warning', key:String(it.sku || i), indexes:[i], message:'Hay campos fuera del esquema de la categoría.' });
  });
  return anomalies;
}

function summarize(anomalies) {
  return (anomalies || []).reduce((a, x) => {
    a.total++; a[x.severity] = (a[x.severity] || 0) + 1; a.byType[x.type] = (a.byType[x.type] || 0) + 1;
    return a;
  }, { total:0, error:0, warning:0, info:0, byType:{} });
}

function event(action, item, details) {
  return { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`, at: now(), action, sku: item?.sku || '', category: item?.cat || '', details: details || {} };
}

const api = { norm, skuKey, titleKey, sourceMapFor, provenanceFor, detectBatch, summarize, event };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.FichasAnomalies = api;
})(typeof self !== 'undefined' ? self : this);
