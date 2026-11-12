/*
 * Respaldo y compartir: un solo archivo con las partes que elijas.
 * Funciones puras (sin DOM): armar el archivo, reconocer lo que trae un archivo (nuevo o de versiones anteriores) y unir el lote.
 * Las llaves de IA nunca forman parte de un respaldo.
 */
(function (root) {
'use strict';

const SCHEMA = 'fichas.backup.v2';
const PARTS = Object.freeze(['lote', 'catalogo', 'conocimiento', 'clasif', 'ajustes']);
const LABEL = Object.freeze({ lote: 'Lote', catalogo: 'Catálogo interno', conocimiento: 'Conocimiento aprendido', clasif: 'Diccionario ATC', ajustes: 'Ajustes' });
const HINT = Object.freeze({
  lote: 'Productos, trazabilidad y aprobaciones',
  catalogo: 'Productos, vínculos y alternativas a mano',
  conocimiento: 'Marcas, laboratorios, alias, relaciones y correcciones',
  clasif: 'Principios activos con su código y verificación',
  ajustes: 'Estructuras de meta, marcas protegidas y opciones de exportación. Sin llaves de IA.'
});

const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);

/* parts: { lote: {items, audit}, catalogo, conocimiento, clasif, ajustes }; solo viajan las que vienen. */
function build(parts, info) {
  const out = { schema: SCHEMA, createdAt: (info && info.createdAt) || new Date().toISOString(), parts: {} };
  PARTS.forEach(k => { if (parts && parts[k] != null) out.parts[k] = parts[k]; });
  return out;
}

/* Reconoce el archivo. Acepta el formato nuevo y los tres anteriores: respaldo del lote, catálogo para compartir y respaldo de conocimiento. */
function detect(data) {
  if (!isObj(data)) return null;
  const parts = {};
  if (data.schema === SCHEMA && isObj(data.parts)) {
    const p = data.parts;
    if (isObj(p.lote) && Array.isArray(p.lote.items)) parts.lote = { items: p.lote.items, audit: Array.isArray(p.lote.audit) ? p.lote.audit : [] };
    if (isObj(p.catalogo) && Array.isArray(p.catalogo.entries)) parts.catalogo = p.catalogo;
    if (isObj(p.conocimiento) && isObj(p.conocimiento.stores)) parts.conocimiento = p.conocimiento;
    if (isObj(p.clasif) && Array.isArray(p.clasif.rows)) parts.clasif = p.clasif;
    if (isObj(p.ajustes)) parts.ajustes = p.ajustes;
    return Object.keys(parts).length ? { kind: 'v2', createdAt: data.createdAt || '', parts } : null;
  }
  if (data.schema === 'fichas.lote-backup.v1' && Array.isArray(data.lote)) {
    parts.lote = { items: data.lote, audit: Array.isArray(data.audit) ? data.audit : [] };
    if (isObj(data.catalog) && Array.isArray(data.catalog.entries)) parts.catalogo = data.catalog;
    if (isObj(data.knowledge) && isObj(data.knowledge.stores)) parts.conocimiento = data.knowledge;
    return { kind: 'lote-v1', createdAt: data.createdAt || '', parts };
  }
  if (data.kind === 'fichas.catalog.share' && isObj(data.catalog) && Array.isArray(data.catalog.entries)) return { kind: 'catalogo', createdAt: data.at || '', parts: { catalogo: data.catalog } };
  if (data.schema === 'fichas.knowledge.v1' && isObj(data.stores)) return { kind: 'conocimiento', createdAt: data.createdAt || data.exportedAt || '', parts: { conocimiento: data } };
  return null;
}

/* Cuántos elementos trae una parte, para mostrarlo antes de cargar. */
function count(part, data) {
  if (!data) return 0;
  if (part === 'lote') return (data.items || []).length;
  if (part === 'catalogo') return (data.entries || []).length;
  if (part === 'clasif') return (data.rows || []).length;
  if (part === 'conocimiento') return ((data.stores || {}).entities || []).length;
  if (part === 'ajustes') return 1;
  return 0;
}

/* Unir el lote: se agregan los productos cuyo SKU no tengo (o sin SKU, cuyo id no tengo). Nunca se pisa un producto existente. */
function mergeLote(mine, incoming) {
  const lk = s => String(s == null ? '' : s).trim().toLowerCase();
  const skus = new Set(mine.map(x => lk(x.sku)).filter(Boolean)), ids = new Set(mine.map(x => x.id));
  const items = [...mine];
  let added = 0, skipped = 0;
  incoming.forEach(it => {
    const k = lk(it.sku);
    if ((k && skus.has(k)) || ids.has(it.id)) { skipped++; return; }
    items.push(it); added++;
    if (k) skus.add(k);
    ids.add(it.id);
  });
  return { items, added, skipped };
}

const api = { SCHEMA, PARTS, LABEL, HINT, build, detect, count, mergeLote };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FichasBackup = api;
})(typeof self !== 'undefined' ? self : this);
