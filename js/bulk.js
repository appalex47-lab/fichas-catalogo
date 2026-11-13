/*
 * Cambios masivos de Productos: correcciones sugeridas por Conocimiento y cambios que elige la persona.
 * - Solo campos de una lista corta (laboratorio, marca, categoría de la tienda, forma, vía y receta). Sustancia activa,
 *   concentración y los textos de indicaciones nunca entran: se capturan producto por producto.
 * - Vía y receta son datos regulatorios: se proponen con la evidencia del propio lote, pero la interfaz exige confirmarlos.
 * - Todo cambio devuelve su lista para deshacer. Funciona sin DOM: navegador (window.FichasBulk) y Node.
 */
(function (root) {
'use strict';

const str = x => String(x == null ? '' : x).trim();
const fold = s => str(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/* key: nombre del cambio; fields: campo real en cada categoría (el primero que exista); type: tipo de Conocimiento; reg: dato regulatorio. */
const FIELDS = Object.freeze([
  { key: 'laboratorio', label: 'Laboratorio', fields: ['laboratorio', 'fabricante'], type: 'laboratory' },
  { key: 'marca', label: 'Marca', fields: ['marca'], type: 'brand' },
  { key: 'categoria', label: 'Categoría de la tienda', fields: ['categoria'], type: 'storeCategory' },
  { key: 'forma', label: 'Forma', fields: ['forma'], type: 'pharmaceuticalForm' },
  { key: 'via', label: 'Vía de administración', fields: ['via'], type: '', reg: true },
  { key: 'receta', label: 'Receta médica', fields: ['receta'], type: '', reg: true, options: [['si', 'Sí requiere receta'], ['no', 'No requiere receta']] }
]);
const byKey = key => FIELDS.find(f => f.key === key) || null;
const OPTION_LABEL = Object.freeze({ si: 'Sí requiere receta', no: 'No requiere receta' });
const show = (def, v) => (def && def.options && OPTION_LABEL[v]) || (str(v) || '—');

/* Campo real de este producto para un cambio, o '' si su categoría no lo tiene. */
function targetField(def, item, CATS) {
  const c = CATS && CATS[item.cat];
  if (!c) return '';
  return def.fields.find(k => c.fields.some(f => f.key === k)) || '';
}

/* Qué cambiaría en cada producto marcado. Los que no tienen ese campo en su categoría quedan fuera con motivo. */
function preview(items, ids, key, value, CATS) {
  const def = byKey(key), set = new Set(ids), v = str(value);
  if (!def || !v) return [];
  return items.filter(it => set.has(it.id)).map(it => {
    const field = targetField(def, it, CATS);
    const from = field ? str((it.v || {})[field]) : '';
    return { id: it.id, sku: it.sku || '', cat: it.cat, field, from, to: v, same: !!field && from === v, na: !field };
  });
}

/* Aplica el cambio a los productos que sí lo admiten y devuelve lo necesario para deshacerlo. */
function apply(items, ids, key, value, CATS) {
  const undo = [];
  preview(items, ids, key, value, CATS).forEach(r => {
    if (r.na || r.same) return;
    const it = items.find(x => x.id === r.id);
    undo.push({ id: r.id, field: r.field, from: (it.v || {})[r.field], had: Object.prototype.hasOwnProperty.call(it.v || {}, r.field) });
    it.v = { ...(it.v || {}), [r.field]: r.to };
    if (it.ai && it.ai[r.field]) { it.ai = { ...it.ai }; delete it.ai[r.field]; }
  });
  return undo;
}
function undo(items, list) {
  let n = 0;
  (list || []).forEach(u => {
    const it = items.find(x => x.id === u.id); if (!it) return;
    const v = { ...(it.v || {}) };
    if (u.had) v[u.field] = u.from; else delete v[u.field];
    it.v = v; n++;
  });
  return n;
}

/* ---------- Sugerencias de Conocimiento agrupadas ----------
 * sugById: id del producto → sugerencias de Knowledge.assess. Se agrupan por campo y cambio para aplicar a todos de una vez.
 * Nunca entran la sustancia activa ni la concentración. */
const SUG_FIELDS = Object.freeze({ laboratorio: 'laboratorio', fabricante: 'laboratorio', marca: 'marca', categoria: 'categoria', forma: 'forma', via: 'via', receta: 'receta' });
function groupSuggestions(items, sugById, CATS) {
  const groups = new Map();
  items.forEach(it => {
    ((sugById && sugById.get(it.id)) || []).forEach(s => {
      const key = SUG_FIELDS[s.field]; if (!key || !str(s.to) || str(s.to) === str(s.from)) return;
      if (!targetField(byKey(key), it, CATS)) return;
      const gk = `${s.field}|${str(s.from)}|${str(s.to)}`;
      if (!groups.has(gk)) groups.set(gk, { id: gk, key, field: s.field, label: byKey(key).label, from: str(s.from), to: str(s.to), ids: [], confidence: s.confidence, status: s.status, level: s.level, why: s.why || '', kind: s.kind, reg: !!byKey(key).reg, evidence: [] });
      const g = groups.get(gk); if (!g.ids.includes(it.id)) g.ids.push(it.id);
    });
  });
  return [...groups.values()].sort((a, b) => b.ids.length - a.ids.length || a.label.localeCompare(b.label));
}

/* Une los grupos que proponen lo mismo (por ejemplo, la misma vía desde Conocimiento y desde el lote). */
function mergeGroups(list) {
  const out = new Map();
  list.forEach(g => {
    const k = `${g.key}|${fold(g.from)}|${fold(g.to)}`;
    if (!out.has(k)) { out.set(k, { ...g, ids: [...g.ids], evidence: [...(g.evidence || []), ...(g.why ? [g.why.replace(/\.$/, '')] : [])] }); return; }
    const m = out.get(k);
    g.ids.forEach(id => { if (!m.ids.includes(id)) m.ids.push(id); });
    (g.evidence || []).concat(g.why ? [g.why.replace(/\.$/, '')] : []).forEach(x => { if (!m.evidence.includes(x)) m.evidence.push(x); });
    m.reg = m.reg || g.reg;
  });
  return [...out.values()].sort((a, b) => b.ids.length - a.ids.length || a.label.localeCompare(b.label));
}

/* ---------- Vía y receta con evidencia del propio lote ----------
 * Mismo principio activo, concentración y forma: si los demás productos con el dato coinciden todos, se propone a los que no lo traen.
 * Si no coinciden, no se propone nada. */
const medKey = v => [fold(v.principio), fold([v.concentracion, v.volumen].filter(Boolean).join(' ')), fold(v.forma)].join('|');
function consensus(items, field) {
  const seen = new Map();
  items.filter(it => it.cat === 'med' && it.v && fold(it.v.principio)).forEach(it => {
    const k = medKey(it.v), val = str(it.v[field]);
    if (!seen.has(k)) seen.set(k, { with: new Map(), without: [] });
    const e = seen.get(k);
    if (val) { const nk = field === 'via' ? fold(val) : val; if (!e.with.has(nk)) e.with.set(nk, { value: val, n: 0 }); e.with.get(nk).n++; }
    else e.without.push(it);
  });
  return seen;
}
function inferFromLote(items) {
  const out = [];
  ['via', 'receta'].forEach(field => {
    const groups = new Map();
    consensus(items, field).forEach((e, k) => {
      if (e.with.size !== 1 || !e.without.length) return;
      const only = [...e.with.values()][0];
      const sample = items.find(it => it.cat === 'med' && medKey(it.v || {}) === k);
      const gk = `${field}|${fold(only.value)}`;
      if (!groups.has(gk)) groups.set(gk, { id: `lote|${gk}`, key: field, field, label: byKey(field).label, from: '', to: only.value, ids: [], reg: true, evidence: [] });
      const g = groups.get(gk);
      e.without.forEach(it => { if (!g.ids.includes(it.id)) g.ids.push(it.id); });
      g.evidence.push(`${only.n} producto(s) con ${str(sample.v.principio)} ${str(sample.v.forma)} dicen «${show(byKey(field), only.value)}»`);
    });
    groups.forEach(g => out.push(g));
  });
  return out;
}

/* Al cambiar vía o receta a mano: los productos marcados que contradicen lo que dicen los demás de Productos con el mismo principio, concentración y forma. */
function conflicts(items, ids, key, value) {
  if (key !== 'via' && key !== 'receta') return new Map();
  const set = new Set(ids), out = new Map();
  consensus(items, key).forEach((e, k) => {
    if (e.with.size !== 1) return;
    const only = [...e.with.values()][0];
    if ((key === 'via' ? fold(only.value) === fold(value) : only.value === str(value))) return;
    items.filter(it => set.has(it.id) && it.cat === 'med' && medKey(it.v || {}) === k).forEach(it => {
      out.set(it.id, `Otros ${only.n} producto(s) con el mismo principio, concentración y forma dicen «${show(byKey(key), only.value)}».`);
    });
  });
  return out;
}

const api = { FIELDS, byKey, show, targetField, preview, apply, undo, groupSuggestions, mergeGroups, inferFromLote, conflicts };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FichasBulk = api;
})(typeof self !== 'undefined' ? self : this);
