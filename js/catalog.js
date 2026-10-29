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
function upsert(cat, item, title, at) {
  const sku = String(item.sku || '').trim();
  if (!sku) return { entry: null, isNew: false, removed: [] };
  const v = item.v || {};
  const elegible = eligibleOf(item.cat, v);
  let e = find(cat, sku), isNew = !e, removed = [];
  if (!e) { e = { sku, addedAt: at, comp: 'sin_evaluar' }; cat.entries.push(e); }
  Object.assign(e, { cat: item.cat, nombre: String(title || v.marca || sku), marca: v.marca || '', receta: v.receta || '', especialidad: v.especialidad || '', elegible, updatedAt: at });
  if (!elegible) {
    /* Si dejó de ser elegible (por ejemplo, se declaró que requiere receta), pierde sus vínculos como complemento. */
    removed = cat.links.filter(l => lk(l.c) === lk(sku));
    cat.links = cat.links.filter(l => lk(l.c) !== lk(sku));
    e.comp = 'no_aplica';
  } else if (e.comp === 'no_aplica') e.comp = 'sin_evaluar';
  return { entry: e, isNew, removed };
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
function markExported(cat, skus, at) {
  const set = new Set([...skus].map(lk));
  let n = 0;
  cat.entries.forEach(e => { if (set.has(lk(e.sku))) { e.exportedAt = at; n++; } });
  return n;
}

const api = { empty, normalize, find, isParent, parentsOf, childrenOf, linked, status, STATUS_LABEL, upsert, candidateParents, waitingChildren, otherChildren, link, unlink, setComp, setParent, remove, crosssellMap, knownSkus, markExported, lk };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.FichasCatalog = api;
})(typeof self !== 'undefined' ? self : this);
