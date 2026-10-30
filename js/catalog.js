/*
 * Catálogo interno: los productos que ya se optimizaron y guardaron, con sus complementos.
 * - Vive aparte del lote: vaciar el lote no borra el catálogo.
 * - Un producto principal puede tener complementos; un complemento puede esperar a que exista su principal.
 * - Un medicamento con receta, de alta especialidad o sin declarar nunca puede ser complemento (F.complementEligible).
 * - Todo vínculo lo confirma una persona. La IA solo propone (ver ai.js: aiComplements).
 * Determinista y sin DOM: funciona en el navegador (window.FichasCatalog) y en Node.
 */
(function (root) {
'use strict';
const F = (typeof module !== 'undefined' && module.exports) ? require('./logic.js') : root.Fichas;

const lk = s => String(s ?? '').trim().toLowerCase();
const empty = () => ({ v: 1, entries: [], links: [] });
/* Acepta lo que venga del almacenamiento y devuelve siempre una forma válida. */
function normalize(c) {
  const out = empty();
  if (!c || typeof c !== 'object') return out;
  const seen = new Set();
  (Array.isArray(c.entries) ? c.entries : []).forEach(e => {
    if (!e || !e.sku || seen.has(lk(e.sku))) return;
    seen.add(lk(e.sku));
    out.entries.push(e);
  });
  (Array.isArray(c.links) ? c.links : []).forEach(l => {
    if (l && seen.has(lk(l.p)) && seen.has(lk(l.c)) && lk(l.p) !== lk(l.c) && !out.links.some(x => lk(x.p) === lk(l.p) && lk(x.c) === lk(l.c))) out.links.push(l);
  });
  return out;
}

const find = (cat, sku) => cat.entries.find(e => lk(e.sku) === lk(sku)) || null;
const eligibleOf = (catId, v) => F.complementEligible(catId, v);
/* Principal: lo que no puede ser complemento (receta, alta especialidad) o lo que la persona marcó como principal. */
const isParent = e => !e.elegible || !!e.padre;
const parentsOf = (cat, sku) => cat.links.filter(l => lk(l.c) === lk(sku)).map(l => find(cat, l.p)).filter(Boolean);
const childrenOf = (cat, sku) => cat.links.filter(l => lk(l.p) === lk(sku)).map(l => find(cat, l.c)).filter(Boolean);
const linked = (cat, p, c) => cat.links.some(l => lk(l.p) === lk(p) && lk(l.c) === lk(c));

/* Estado visible de un producto como complemento. */
function status(cat, e) {
  if (!e.elegible) return 'no_aplica';
  if (cat.links.some(l => lk(l.c) === lk(e.sku))) return 'vinculado';
  return e.comp === 'esperando' || e.comp === 'independiente' ? e.comp : 'sin_evaluar';
}
const STATUS_LABEL = { no_aplica: 'No puede ser complemento', vinculado: 'Complemento vinculado', esperando: 'Esperando producto principal', independiente: 'No es complemento', sin_evaluar: 'Sin evaluar' };

/* Crea o actualiza la ficha del catálogo a partir de un producto del lote. `title` es el título generado. */
/* Nombre corto para mostrar: marca, producto o tipo y concentración o contenido. El título completo se conserva aparte. */
const shortName = (catId, v) => {
  v = v || {};
  const id = catId === 'med' ? '' : (v.producto || v.modelo || v.componente || v.tipo || '');
  const size = catId === 'med' ? [v.concentracion, v.volumen].filter(Boolean).join(' / ') : (v.concentracion || v.contenido || '');
  return [v.marca, id, size].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
};
/* Datos que usan las reglas de relacionados y alternativas, para calcularlas sin el lote. */
const REL_FIELDS = ['marca', 'principio', 'concentracion', 'volumen', 'forma', 'contenido', 'laboratorio', 'fabricante', 'receta', 'especialidad', 'compat'];
const relData = v => Object.fromEntries(REL_FIELDS.filter(k => v && v[k]).map(k => [k, String(v[k])]));
function upsert(cat, item, title, at) {
  const sku = String(item.sku || '').trim();
  if (!sku) return { entry: null, isNew: false, removed: [] };
  const v = item.v || {};
  const elegible = eligibleOf(item.cat, v);
  let e = find(cat, sku), isNew = !e, removed = [];
  if (!e) { e = { sku, addedAt: at, comp: 'sin_evaluar' }; cat.entries.push(e); }
  Object.assign(e, { cat: item.cat, nombre: shortName(item.cat, v) || String(title || sku), titulo: String(title || ''), marca: v.marca || '', receta: v.receta || '', especialidad: v.especialidad || '', area: v.area || '', area2: v.area2 || '', atc: v.atc || '', elegible, updatedAt: at, rv: relData(v), rutina: item.cat === 'cos' ? (v.rutina || F.rutinaDe(v)) : '', zona: v.zona || '' });
  if (!elegible) {
    /* Si dejó de ser elegible (por ejemplo, se declaró que requiere receta), pierde sus vínculos como complemento. */
    removed = cat.links.filter(l => lk(l.c) === lk(sku));
    cat.links = cat.links.filter(l => lk(l.c) !== lk(sku));
    e.comp = 'no_aplica';
  } else if (e.comp === 'no_aplica') e.comp = 'sin_evaluar';
  return { entry: e, isNew, removed };
}

/* Cosméticos que completan la rutina de este: otro paso de la rutina y, si los dos dicen la zona, que comparta alguna palabra (rostro, cuerpo…). */
const zonaWords = z => String(z || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z]+/).filter(w => w.length > 3);
function routineMates(cat, e) {
  if (!e || !e.rutina) return [];
  return cat.entries.filter(o => lk(o.sku) !== lk(e.sku) && o.cat === 'cos' && o.rutina && o.rutina !== e.rutina
    && (!e.zona || !o.zona || zonaWords(e.zona).some(w => zonaWords(o.zona).includes(w))));
}
/* Productos principales a los que este producto podría complementar. */
const candidateParents = (cat, child) => cat.entries.filter(p => lk(p.sku) !== lk(child.sku) && isParent(p) && !linked(cat, p.sku, child.sku));
/* Complementos que esperan a un principal y todavía no están vinculados a este. */
const waitingChildren = (cat, parent) => cat.entries.filter(c => lk(c.sku) !== lk(parent.sku) && c.elegible && status(cat, c) === 'esperando' && !linked(cat, parent.sku, c.sku));
/* Sin vínculo, pero que ya tienen principal: se pueden sumar a otro principal nuevo. */
const otherChildren = (cat, parent) => cat.entries.filter(c => lk(c.sku) !== lk(parent.sku) && c.elegible && status(cat, c) !== 'esperando' && status(cat, c) !== 'independiente' && !linked(cat, parent.sku, c.sku));

function link(cat, parentSku, childSku, meta) {
  const p = find(cat, parentSku), c = find(cat, childSku);
  if (!p || !c) return { ok: false, reason: 'No está en el catálogo.' };
  if (lk(p.sku) === lk(c.sku)) return { ok: false, reason: 'Un producto no puede ser complemento de sí mismo.' };
  if (!c.elegible) return { ok: false, reason: 'Un medicamento con receta, de alta especialidad o sin declarar no puede ser complemento.' };
  if (linked(cat, p.sku, c.sku)) return { ok: true, already: true };
  cat.links.push({ p: p.sku, c: c.sku, by: (meta && meta.by) || 'manual', at: (meta && meta.at) || null, why: (meta && meta.why) || '' });
  c.comp = 'sin_evaluar';
  return { ok: true };
}
function unlink(cat, parentSku, childSku) {
  const n = cat.links.length;
  cat.links = cat.links.filter(l => !(lk(l.p) === lk(parentSku) && lk(l.c) === lk(childSku)));
  return cat.links.length < n;
}
function setComp(cat, sku, comp) {
  const e = find(cat, sku);
  if (!e || !e.elegible || !['sin_evaluar', 'esperando', 'independiente'].includes(comp)) return false;
  e.comp = comp; return true;
}
function setParent(cat, sku, on) { const e = find(cat, sku); if (!e) return false; e.padre = !!on; return true; }
function remove(cat, sku) {
  const n = cat.entries.length;
  cat.entries = cat.entries.filter(e => lk(e.sku) !== lk(sku));
  cat.links = cat.links.filter(l => lk(l.p) !== lk(sku) && lk(l.c) !== lk(sku));
  return cat.entries.length < n;
}

/* Para el CSV: principal (minúsculas) → SKU de sus complementos. Vuelve a comprobar que el complemento siga siendo elegible. */
function crosssellMap(cat) {
  const out = new Map();
  cat.links.forEach(l => {
    const c = find(cat, l.c), p = find(cat, l.p);
    if (!c || !p || !c.elegible) return;
    const k = lk(p.sku);
    if (!out.has(k)) out.set(k, []);
    if (!out.get(k).includes(c.sku)) out.get(k).push(c.sku);
  });
  return out;
}
const knownSkus = cat => new Set(cat.entries.filter(e => e.exportedAt).map(e => lk(e.sku)));

/* ---------- Campana: lo que cambió en los vínculos de un producto ya cargado en Magento ----------
 * Se compara lo que hoy dicen las reglas contra lo que tenía el producto cuando se exportó (relSnap). Solo cuentan los SKU que ya están
 * en Magento. Los complementos (cross sell) avisan al producto principal; relacionados y alternativas, a los dos lados. */
const REL_KINDS = ['crosssell', 'upsell', 'related'];
const REL_LABEL = { crosssell: 'cross sell', upsell: 'alternativas', related: 'relacionados' };
function currentRels(cat) {
  const map = F.relations(cat.entries.map(e => ({ sku: e.sku, cat: e.cat, v: e.rv || { marca: e.marca } })));
  const cm = crosssellMap(cat), known = knownSkus(cat), out = new Map();
  const ok = a => [...new Set(a)].filter(x => known.has(lk(x))).sort();
  cat.entries.forEach(e => {
    const k = lk(e.sku), r = map.get(k) || { upsell: [], related: [], crosssell: [] };
    out.set(k, { upsell: ok(r.upsell), related: ok(r.related), crosssell: ok([...r.crosssell, ...(cm.get(k) || [])]) });
  });
  return out;
}
const emptyRels = () => ({ crosssell: [], upsell: [], related: [] });
function relDiff(snap, cur) {
  const add = {}, rem = {};
  REL_KINDS.forEach(k => {
    const a = (snap && snap[k]) || [], b = (cur && cur[k]) || [];
    add[k] = b.filter(x => !a.some(y => lk(y) === lk(x)));
    rem[k] = a.filter(x => !b.some(y => lk(y) === lk(x)));
  });
  return { add, rem, empty: REL_KINDS.every(k => !add[k].length && !rem[k].length) };
}
/* Los productos ya exportados antes de existir la campana toman su estado actual como punto de partida, sin avisar. */
function baseline(cat) {
  const cur = currentRels(cat); let n = 0;
  cat.entries.forEach(e => { if (e.exportedAt && !e.relSnap) { e.relSnap = cur.get(lk(e.sku)) || emptyRels(); n++; } });
  return n;
}
function alerts(cat) {
  const cur = currentRels(cat), out = [];
  cat.entries.forEach(e => {
    if (!e.exportedAt) { if (e.bellSeen !== 'nuevo') out.push({ type: 'nuevo', sku: e.sku, name: e.nombre, sig: 'nuevo' }); return; }
    if (!e.relSnap) return;
    const d = relDiff(e.relSnap, cur.get(lk(e.sku)));
    if (d.empty) return;
    const sig = JSON.stringify([d.add, d.rem]);
    if (e.bellSeen !== sig) out.push({ type: 'rel', sku: e.sku, name: e.nombre, add: d.add, rem: d.rem, sig });
  });
  return out;
}
function dismiss(cat, sku) {
  const a = alerts(cat).find(x => lk(x.sku) === lk(sku)), e = find(cat, sku);
  if (!a || !e) return false;
  e.bellSeen = a.sig; return true;
}
/* Marca como cargados a Magento y guarda cómo quedaron sus vínculos en ese archivo. */
function markExported(cat, skus, at) {
  const set = new Set([...skus].map(lk));
  let n = 0;
  cat.entries.forEach(e => { if (set.has(lk(e.sku))) { e.exportedAt = at; n++; } });
  const cur = currentRels(cat);
  cat.entries.forEach(e => { if (set.has(lk(e.sku))) { e.relSnap = cur.get(lk(e.sku)) || emptyRels(); delete e.bellSeen; } });
  return n;
}
/* Archivo solo con SKU y vínculos al día, para los productos que pidieron actualizar. Una columna vacía no quita vínculos en Magento. */
function relUpdateCsv(cat, skus) {
  const cur = currentRels(cat), H = F.MAG_HEADER, I = F.MAG_IDX;
  const rows = [...skus].map(sku => {
    const e = find(cat, sku); if (!e || !e.exportedAt) return null;
    const r = cur.get(lk(e.sku)) || emptyRels(), row = new Array(H.length).fill('');
    row[I.sku] = e.sku;
    [['upsell_skus', 'upsell'], ['related_skus', 'related'], ['crosssell_skus', 'crosssell']].forEach(([col, k]) => { if (r[k].length) row[I[col]] = r[k].join(','); });
    return row;
  }).filter(Boolean);
  return { header: H, rows };
}

const api = { routineMates, REL_KINDS, REL_LABEL, currentRels, relDiff, baseline, alerts, dismiss, relUpdateCsv, shortName, empty, normalize, find, isParent, parentsOf, childrenOf, linked, status, STATUS_LABEL, upsert, candidateParents, waitingChildren, otherChildren, link, unlink, setComp, setParent, remove, crosssellMap, knownSkus, markExported, lk };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.FichasCatalog = api;
})(typeof self !== 'undefined' ? self : this);
