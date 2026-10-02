/*
 * Fase 4: modelo canónico y derivaciones.
 * Proyección determinista del registro existente; no crea una segunda fuente de verdad.
 */
(function (root) {
'use strict';
const F = (typeof module !== 'undefined' && module.exports) ? require('./logic.js') : root.Fichas;
const N = (typeof module !== 'undefined' && module.exports) ? require('./normalization.js') : root.FichasNormalization;

const VERSION = '1.0';
const clean = value => N ? N.normalizeText(String(value ?? '')).normalized : String(value ?? '').replace(/\s+/g, ' ').trim();
const fold = value => N ? N.clean(String(value ?? '')) : clean(value).toLowerCase();
const first = (...values) => values.map(v => clean(v)).find(Boolean) || '';

function canonicalize(item, computed, quality, provenance, anomalies) {
  const source = item && typeof item === 'object' ? item : {};
  const v = source.v && typeof source.v === 'object' ? source.v : {};
  const cat = source.cat || computed?.c?.id || '';
  const c = F?.CATS?.[cat];
  const fields = {};
  (c?.fields || Object.keys(v).map(key => ({ key, label: key }))).forEach(fd => {
    fields[fd.key] = clean(v[fd.key]);
  });
  Object.keys(v).filter(k => !(k in fields)).forEach(k => { fields[k] = clean(v[k]); });

  const sku = clean(source.sku);
  const title = clean(computed?.title?.title || '');
  const identity = {
    sku,
    skuKey: fold(sku).replace(/\s+/g, ''),
    title,
    titleKey: fold(title),
    brand: first(fields.marca),
    model: first(fields.modelo),
    category: cat
  };

  const derived = {
    title,
    merchantCenter: clean(computed?.mc?.text || ''),
    magentoHtml: computed?.mg?.html || '',
    metaTitle: clean(computed?.meta?.mt?.text || ''),
    metaDescription: clean(computed?.meta?.md?.text || ''),
    imageAlt: clean(computed?.meta?.alt?.text || ''),
    magentoBlocked: Array.isArray(computed?.mg?.blocked) ? computed.mg.blocked.slice() : [],
    missingTitleFields: Array.isArray(computed?.title?.missing) ? computed.title.missing.slice() : []
  };

  const qualitySummary = quality ? {
    status: quality.status,
    errors: quality.counts?.error || 0,
    warnings: quality.counts?.warning || 0,
    info: quality.counts?.info || 0
  } : { status: 'desconocido', errors: 0, warnings: 0, info: 0 };

  return {
    schema: 'fichas.canonical.v1',
    version: VERSION,
    identity,
    fields,
    derived,
    quality: qualitySummary,
    provenance: provenance || {},
    anomalyTypes: Array.isArray(anomalies) ? anomalies.map(a => a.type).filter(Boolean) : [],
    sourceId: source.id || '',
    sourceCategory: source.cat || ''
  };
}

function normalizeForComparison(record) {
  const r = record || {};
  return {
    sku: fold(r.identity?.sku),
    title: fold(r.identity?.title),
    brand: fold(r.identity?.brand || r.fields?.marca),
    model: fold(r.identity?.model || r.fields?.modelo),
    fields: Object.fromEntries(Object.entries(r.fields || {}).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => [k, fold(v)]))
  };
}

function diff(a, b) {
  const x = normalizeForComparison(a), y = normalizeForComparison(b);
  const changes = [];
  ['sku','title','brand','model'].forEach(key => { if (x[key] !== y[key]) changes.push(key); });
  const keys = new Set([...Object.keys(x.fields), ...Object.keys(y.fields)]);
  keys.forEach(key => { if ((x.fields[key] || '') !== (y.fields[key] || '')) changes.push(`fields.${key}`); });
  return [...new Set(changes)];
}

const api = { VERSION, canonicalize, normalizeForComparison, diff };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.FichasCanonical = api;
})(typeof self !== 'undefined' ? self : this);
