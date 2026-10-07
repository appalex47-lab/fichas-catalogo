/*
 * Fase 11: motor de conocimiento y aprendizaje del catálogo (contrato fichas.knowledge.v1).
 *
 * La aplicación aprende de los productos que procesa (sustancias, marcas, laboratorios, fabricantes, formas,
 * concentraciones, unidades, presentaciones, categorías, alias y relaciones) y lo recuerda en IndexedDB,
 * siempre a través de este motor:  módulo → Knowledge → KnowledgeDB → IndexedDB.
 *
 * Principios:
 *  - Que un dato aparezca no lo vuelve verdad. La frecuencia aporta poco y se satura; solo la evidencia humana
 *    (confirmaciones, correcciones) lleva a CONFIRMED y TRUSTED. OBSERVED nunca salta a TRUSTED.
 *  - Los rechazos son evidencia negativa; nada se borra en silencio.
 *  - Los conflictos no se resuelven solos: se registran (CONFLICTED) y los resuelve una persona.
 *  - Autocorrección solo con regla determinista, sin conflicto, reversible, con el original conservado y auditable.
 *    Sustancias, concentraciones, relaciones marca/laboratorio, claims y datos regulatorios nunca se autocorrigen.
 *  - Cohere puede sugerir alias, pero no es fuente de verdad: lo que sugiere queda SUGGESTED y pasa por revisión.
 *  - La auditoría es la que ya existe: el motor solo llama a `onAudit(acción, detalles)`.
 * Funciona en navegador (window.FichasKnowledge y window.FP.Knowledge) y en Node (require).
 */
(function (root) {
'use strict';
const isNode = typeof module !== 'undefined' && module.exports;
const F = isNode ? (() => { try { return require('./logic.js'); } catch (_) { return null; } })() : root.Fichas;
const KDB = isNode ? require('./knowledge-db.js') : root.FichasKnowledgeDB;

const SCHEMA = 'fichas.knowledge.v1';
const VERSION = '1.0';

/* ---------- vocabulario ---------- */
const TYPES = Object.freeze(['substance', 'laboratory', 'brand', 'manufacturer', 'pharmaceuticalForm', 'concentration', 'unit', 'presentation', 'category', 'subcategory', 'product']);
const TYPE_LABEL = Object.freeze({ substance: 'Sustancia activa', laboratory: 'Laboratorio', brand: 'Marca', manufacturer: 'Fabricante', pharmaceuticalForm: 'Forma farmacéutica', concentration: 'Concentración', unit: 'Unidad', presentation: 'Presentación', category: 'Categoría', subcategory: 'Subcategoría', product: 'Producto' });
const STATUS = Object.freeze({ OBSERVED: 'observed', NORMALIZED: 'normalized', SUGGESTED: 'suggested', CONFIRMED: 'confirmed', INFERRED: 'inferred', TRUSTED: 'trusted', REJECTED: 'rejected', CONFLICTED: 'conflicted' });
const STATUS_LABEL = Object.freeze({ observed: 'Observado', normalized: 'Normalizado', suggested: 'Sugerido', confirmed: 'Confirmado', inferred: 'Inferido', trusted: 'De confianza', rejected: 'Rechazado', conflicted: 'En conflicto' });
const AUDIT = Object.freeze({ CREATED: 'KNOWLEDGE_CREATED', UPDATED: 'KNOWLEDGE_UPDATED', CONFIRMED: 'KNOWLEDGE_CONFIRMED', REJECTED: 'KNOWLEDGE_REJECTED', CONFLICT: 'KNOWLEDGE_CONFLICT', SUGGESTION: 'KNOWLEDGE_SUGGESTION', AUTO: 'AUTO_CORRECTION', MANUAL: 'MANUAL_CORRECTION' });
const LEVELS = Object.freeze({ SUGGEST: 1, ASSISTED: 2, AUTO_SAFE: 3, REVIEW: 4 });
const LEVEL_LABEL = Object.freeze({ 1: 'Sugerir', 2: 'Corrección asistida', 3: 'Autocorrección segura', 4: 'Revisión obligatoria' });

/* Qué campo del formulario alimenta qué tipo de entidad (independiente de la categoría). */
const FIELD_TYPE = Object.freeze({ marca: 'brand', principio: 'substance', componente: 'substance', laboratorio: 'laboratory', fabricante: 'manufacturer', forma: 'pharmaceuticalForm', concentracion: 'concentration', contenido: 'presentation', paquete: 'presentation', presentacion: 'presentation', tipo: 'subcategory' });
const PRESENTATION_FIELDS = Object.freeze(['contenido', 'paquete', 'presentacion']);
/* Tipos y campos críticos: nunca se autocorrigen (sustancias, concentraciones, relación marca/laboratorio, claims, datos regulatorios). */
const CRITICAL_TYPES = Object.freeze(['substance', 'concentration', 'laboratory', 'brand', 'manufacturer']);
const CRITICAL_FIELDS = Object.freeze(['principio', 'componente', 'concentracion', 'laboratorio', 'marca', 'fabricante', 'receta', 'leyenda', 'precauciones', 'modo', 'inci', 'fps', 'nivel', 'via']);
const AUTO_TYPES = Object.freeze(['pharmaceuticalForm', 'unit', 'presentation', 'category', 'subcategory']);
/* Predicados cuyo objeto debe ser único para un sujeto: dos objetos distintos son un conflicto, no una elección. */
const FUNCTIONAL = Object.freeze(['brand→laboratory', 'product→brand', 'product→laboratory', 'product→manufacturer', 'product→pharmaceuticalForm', 'product→presentation', 'product→concentration', 'product→category', 'product→subcategory']);

/* ---------- confianza (documentada en PHASE_11_KNOWLEDGE.md) ---------- */
const CONF = Object.freeze({
  K: 2,                 // peso a priori: sin evidencia la confianza es 0
  OBS_STEP: 0.25, OBS_CAP: 2,       // la frecuencia aporta poco y se satura: observar 8 veces o 800 da lo mismo
  IMP_STEP: 0.5, IMP_CAP: 1.5,      // fuentes externas (CSV, conectores)
  AI_STEP: 0.25, AI_CAP: 0.5,       // la IA nunca cuenta como verdad
  CONFIRM: 3, CORRECTION: 2,        // evidencia humana
  REJECT: 3,                        // un rechazo humano pesa como una confirmación
  RULE_BONUS: 4,                    // regla determinista (alias semilla)
  NO_HUMAN_CAP: 0.7,                // sin ninguna evidencia humana la confianza no pasa de 0.70
  CONFLICT_FACTOR: 0.6,             // un conflicto abierto reduce la confianza
  RECENCY_MAX_LOSS: 0.15, RECENCY_PER_MONTH: 0.01,
  TRUSTED_MIN: 0.85, TRUSTED_CONFIRMS: 2, AUTO_MIN: 0.85, ASSIST_MIN: 0.6, MATURE: 20
});
const MONTH_MS = 30 * 24 * 3600 * 1000;

/* ---------- utilidades ---------- */
const str = x => String(x == null ? '' : x);
const now = () => new Date().toISOString();
const fold = s => str(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
/* Valor normalizado de identidad: sin acentos, minúsculas, sin puntuación (salvo % . / +). */
const normalize = s => fold(s).replace(/[µ]/g, 'u').replace(/[^a-z0-9%./+]+/g, ' ').replace(/\s+/g, ' ').trim();
const slug = n => n.replace(/ /g, '-');
const idFor = (type, value) => `${type}:${slug(normalize(value))}`;
const aliasIdFor = (type, alias) => `alias:${type}:${slug(normalize(alias))}`;
const relIdFor = (s, p, o) => `rel:${s}>${p}>${o}`;
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const uniq = a => [...new Set(a)];
const round2 = n => Math.round(n * 100) / 100;
const clip = (s, n) => { s = str(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const isCriticalType = t => CRITICAL_TYPES.includes(t);
const isCriticalField = f => CRITICAL_FIELDS.includes(f);

/* Unidades: forma canónica. «pzas» y similares se normalizan a «piezas». */
const UNIT_CANON = Object.freeze({ mg: 'mg', g: 'g', gr: 'g', grs: 'g', gm: 'g', kg: 'kg', mcg: 'mcg', ug: 'mcg', µg: 'mcg', ml: 'mL', l: 'L', lt: 'L', lts: 'L', '%': '%', ui: 'UI', iu: 'UI', cm: 'cm', mm: 'mm', pieza: 'piezas', piezas: 'piezas', pza: 'piezas', pzas: 'piezas', pzs: 'piezas', pz: 'piezas' });
function normalizeUnit(u) {
  const k = fold(u).replace(/\./g, '').trim(); const c = UNIT_CANON[k];
  return c ? { original: str(u), canonical: c, changed: c !== str(u).trim(), rule: 'seed.unit' } : null;
}
/* Concentración: valor + unidad (y opcionalmente «por» unidad: 5 mg/mL). No se mezcla con presentación ni piezas. */
const CONC_RE = /^\s*(\d+(?:[.,]\d+)?)\s*(mg|mcg|µg|ug|gr|grs|gm|g|kg|ml|l|lt|ui|iu|%)\s*(?:\/\s*(\d+(?:[.,]\d+)?)?\s*(mg|mcg|µg|ug|gr|grs|gm|g|kg|ml|l|lt|ui|iu))?\s*$/i;
function parseConcentration(text) {
  const m = CONC_RE.exec(str(text)); if (!m) return null;
  const u1 = normalizeUnit(m[2]), u2 = m[4] ? normalizeUnit(m[4]) : null;
  const val = m[1].replace(',', '.');
  const canonical = `${val} ${u1.canonical}` + (u2 ? `/${m[3] ? m[3].replace(',', '.') + ' ' : ''}${u2.canonical}` : '');
  return { original: str(text), value: Number(val), unit: u1.canonical, perValue: m[3] ? Number(m[3].replace(',', '.')) : null, perUnit: u2 ? u2.canonical : null, canonical };
}
/* Presentación: reutiliza las reglas existentes (logic.js: expandPres). Nunca destruye el valor original. */
function normalizePresentation(text) {
  const original = str(text); const trimmed = original.replace(/\s+/g, ' ').trim();
  let canonical = trimmed, rule = 'none';
  if (trimmed) {
    const viaExisting = F && typeof F.expandPres === 'function' ? F.expandPres(trimmed) : null;
    if (/^\d+(?:[.,]\d+)?$/.test(trimmed)) { canonical = `${trimmed} piezas`; rule = 'existing.bare-number→piezas'; }
    else if (/^\d+(?:[.,]\d+)?\s*(?:pzas?|pzs|pz)\.?$/i.test(trimmed)) { canonical = trimmed.replace(/\s*(?:pzas?|pzs|pz)\.?$/i, ' piezas').replace(/\s+/g, ' '); rule = 'seed.presentation.pzas→piezas'; }
    else if (/^c\/\s*\d+$/i.test(trimmed)) { canonical = viaExisting || `Caja con ${trimmed.replace(/\D/g, '')} piezas`; rule = 'existing.c/N→Caja con N piezas'; }
    else if (viaExisting && viaExisting !== trimmed && fold(viaExisting) !== fold(trimmed)) { canonical = viaExisting; rule = 'existing.expand'; }
  }
  return { original, normalized: trimmed, canonical, rule, confidence: 1 };
}

/* ---------- confianza, estado y explicación (funciones puras) ---------- */
const emptyBy = () => ({ observed: 0, imported: 0, ai: 0, confirmed: 0, correction: 0, rejected: 0 });
function points(rec) {
  const by = Object.assign(emptyBy(), rec.evidenceBy || {});
  const obs = Math.min(CONF.OBS_CAP, CONF.OBS_STEP * by.observed), imp = Math.min(CONF.IMP_CAP, CONF.IMP_STEP * by.imported), ai = Math.min(CONF.AI_CAP, CONF.AI_STEP * by.ai);
  const conf = CONF.CONFIRM * by.confirmed, cor = CONF.CORRECTION * by.correction, rule = rec.ruleType === 'deterministic' ? CONF.RULE_BONUS : 0;
  return { by, obs, imp, ai, conf, cor, rule, P: obs + imp + ai + conf + cor + rule, N: CONF.REJECT * by.rejected };
}
function confidenceOf(rec, at) {
  if (rec.ruleType === 'deterministic' && !(rec.evidenceBy && rec.evidenceBy.rejected)) return 1;
  const p = points(rec);
  let c = p.P / (p.P + p.N + CONF.K);
  const human = p.by.confirmed + p.by.correction > 0;
  if (!human && rec.ruleType !== 'deterministic') c = Math.min(c, CONF.NO_HUMAN_CAP);
  const last = Date.parse(rec.lastValidatedAt || rec.updatedAt || ''); const t = at ? Date.parse(at) : Date.now();
  if (Number.isFinite(last) && Number.isFinite(t) && t > last) c *= 1 - Math.min(CONF.RECENCY_MAX_LOSS, ((t - last) / MONTH_MS) * CONF.RECENCY_PER_MONTH);
  if (rec.flags && rec.flags.conflict) c *= CONF.CONFLICT_FACTOR;
  return round2(Math.max(0, Math.min(0.99, c)));
}
function statusOf(rec) {
  const p = points(rec), f = rec.flags || {};
  if (p.by.rejected > 0 && p.N >= p.P) return STATUS.REJECTED;
  if (f.conflict) return STATUS.CONFLICTED;
  const distinct = (rec.confirmRefs || []).length;
  if (p.by.confirmed >= CONF.TRUSTED_CONFIRMS && distinct >= CONF.TRUSTED_CONFIRMS && p.by.rejected === 0 && confidenceOf(rec) >= CONF.TRUSTED_MIN) return STATUS.TRUSTED;
  if (p.by.confirmed + p.by.correction > 0) return STATUS.CONFIRMED;
  if (f.suggested || p.by.ai > 0) return STATUS.SUGGESTED;
  if (f.normalized || rec.ruleType === 'deterministic') return STATUS.NORMALIZED;
  if (f.inferred) return STATUS.INFERRED;
  return STATUS.OBSERVED;
}
function finalize(rec, at) {
  const by = Object.assign(emptyBy(), rec.evidenceBy || {}); rec.evidenceBy = by;
  rec.positiveEvidence = by.observed + by.imported + by.ai + by.confirmed + by.correction;
  rec.negativeEvidence = by.rejected;
  rec.evidenceCount = rec.positiveEvidence + rec.negativeEvidence;
  rec.confidence = confidenceOf(rec, at); rec.status = statusOf(rec);
  rec.updatedAt = at || rec.updatedAt || now(); rec.version = (rec.version || 0) + 1;
  return rec;
}
/* Líneas que explican por qué la app sabe algo (nunca solo «Confianza: 94 %»). */
function explain(rec, ctx) {
  ctx = ctx || {};
  const p = points(rec), by = p.by, lines = [], breakdown = [];
  const pct = Math.round((rec.confidence || 0) * 100);
  const name = ctx.name || rec.canonicalValue || rec.id;
  if (by.confirmed) lines.push(`fue confirmado ${by.confirmed} ${by.confirmed === 1 ? 'vez' : 'veces'}${(rec.confirmRefs || []).length > 1 ? ` en ${(rec.confirmRefs || []).length} ocasiones distintas` : ''}`);
  if (by.correction) lines.push(`${by.correction === 1 ? 'una corrección manual lo apunta' : by.correction + ' correcciones manuales lo apuntan'} como el valor correcto`);
  if (by.observed) lines.push(`apareció en ${by.observed} ${by.observed === 1 ? 'producto' : 'productos'}${by.observed > 1 ? ' (la repetición por sí sola no lo vuelve verdad)' : ''}`);
  if (by.imported) lines.push(`vino de ${by.imported} ${by.imported === 1 ? 'importación' : 'importaciones'} externas`);
  if (by.ai) lines.push(`la IA lo sugirió ${by.ai} ${by.ai === 1 ? 'vez' : 'veces'} (una sugerencia de IA no es evidencia suficiente)`);
  if (by.rejected) lines.push(`fue rechazado ${by.rejected} ${by.rejected === 1 ? 'vez' : 'veces'}`);
  const srcs = rec.sources || [];
  if (srcs.length) lines.push(`aparece en ${srcs.length} ${srcs.length === 1 ? 'fuente' : 'fuentes'}: ${srcs.join(', ')}`);
  if (rec.flags && rec.flags.conflict) lines.push('tiene un conflicto abierto que debe resolver una persona');
  else lines.push('no existen conflictos abiertos');
  if (rec.lastValidatedAt) lines.push(`fue validado manualmente (última vez ${String(rec.lastValidatedAt).slice(0, 10)})`);
  else lines.push('nadie lo ha validado manualmente todavía');
  if (rec.ruleType === 'deterministic') lines.push('proviene de una regla determinista incluida en la aplicación');
  const add = (label, pts) => { if (pts) breakdown.push({ label, points: round2(pts) }); };
  add(`Observaciones (${by.observed}, máximo ${CONF.OBS_CAP} puntos)`, p.obs); add(`Importaciones (${by.imported})`, p.imp); add(`Sugerencias de IA (${by.ai}, máximo ${CONF.AI_CAP})`, p.ai);
  add(`Confirmaciones humanas (${by.confirmed} × ${CONF.CONFIRM})`, p.conf); add(`Correcciones humanas (${by.correction} × ${CONF.CORRECTION})`, p.cor); add('Regla determinista', p.rule); add(`Rechazos (${by.rejected} × ${CONF.REJECT})`, -p.N);
  const notes = [];
  if (!(by.confirmed + by.correction) && rec.ruleType !== 'deterministic') notes.push(`sin evidencia humana la confianza no pasa de ${Math.round(CONF.NO_HUMAN_CAP * 100)} %`);
  if (rec.flags && rec.flags.conflict) notes.push(`el conflicto abierto multiplica la confianza por ${CONF.CONFLICT_FACTOR}`);
  return {
    id: rec.id, name, status: rec.status, statusLabel: STATUS_LABEL[rec.status] || rec.status, confidence: rec.confidence, percent: pct,
    summary: `${pct} %. ${name}: ${lines.length ? lines.join('; ') : 'sin evidencia registrada'}.`,
    because: lines, breakdown, notes,
    formula: `confianza = puntos a favor ÷ (puntos a favor + puntos en contra + ${CONF.K}); sin evidencia humana máximo ${CONF.NO_HUMAN_CAP}; recencia −${CONF.RECENCY_PER_MONTH * 100} % por mes (máx. ${CONF.RECENCY_MAX_LOSS * 100} %); conflicto × ${CONF.CONFLICT_FACTOR}`,
    points: { favor: round2(p.P), contra: round2(p.N) }
  };
}

/* ---------- decisiones: nivel de corrección ---------- */
/* c: { field, type, kind:'seed'|'alias'|'relation'|'ai'|'mismatch', rec (conocimiento usado), conflict, reversible, keepsOriginal, auditable } */
function decideCorrection(c, settings) {
  const s = Object.assign({ autoCorrect: true, autoLearned: true }, settings || {});
  const reasons = [];
  const critical = isCriticalField(c.field) || isCriticalType(c.type) || c.kind === 'relation' || c.kind === 'mismatch';
  const rec = c.rec || {};
  const conflicted = !!c.conflict || (rec.flags && rec.flags.conflict) || rec.status === STATUS.CONFLICTED;
  if (conflicted) { reasons.push('existe un conflicto sin resolver'); return out(LEVELS.REVIEW); }
  if (rec.status === STATUS.REJECTED) { reasons.push('el conocimiento fue rechazado por una persona'); return out(LEVELS.SUGGEST, false); }
  if (c.kind === 'mismatch') { reasons.push('el dato contradice conocimiento ya confirmado'); return out((rec.status === STATUS.CONFIRMED || rec.status === STATUS.TRUSTED) ? LEVELS.REVIEW : LEVELS.SUGGEST); }
  if (critical) {
    reasons.push('es un dato sensible o ambiguo: nunca se autocorrige');
    const known = rec.status === STATUS.CONFIRMED || rec.status === STATUS.TRUSTED;
    return out(known && (rec.confidence || 0) >= CONF.ASSIST_MIN ? LEVELS.ASSISTED : LEVELS.SUGGEST);
  }
  if (c.kind === 'ai') { reasons.push('la IA no es fuente de verdad'); return out(LEVELS.SUGGEST); }
  const safe = c.reversible !== false && c.keepsOriginal !== false && c.auditable !== false;
  if (c.kind === 'seed') {
    if (!safe) { reasons.push('no es reversible o no conserva el original'); return out(LEVELS.ASSISTED); }
    reasons.push('regla determinista, reversible, conserva el original y queda auditada');
    return out(s.autoCorrect ? LEVELS.AUTO_SAFE : LEVELS.ASSISTED);
  }
  if (c.kind === 'alias') {
    const ok = (rec.status === STATUS.CONFIRMED || rec.status === STATUS.TRUSTED) && (rec.confidence || 0) >= CONF.AUTO_MIN && AUTO_TYPES.includes(c.type);
    if (ok && safe) { reasons.push(`equivalencia confirmada por una persona con confianza ${Math.round(rec.confidence * 100)} %, sin conflicto`); return out(s.autoLearned ? LEVELS.AUTO_SAFE : LEVELS.ASSISTED); }
    if ((rec.confidence || 0) >= CONF.ASSIST_MIN) { reasons.push('hay evidencia, pero aún no basta para corregir sola'); return out(LEVELS.ASSISTED); }
    reasons.push('poca evidencia todavía'); return out(LEVELS.SUGGEST);
  }
  reasons.push('sin regla determinista'); return out(LEVELS.SUGGEST);
  function out(level, allowed) { return { level, name: LEVEL_LABEL[level], auto: level === LEVELS.AUTO_SAFE, critical, reasons }; }
}

/* ================= Motor ================= */
function create(opts) {
  opts = opts || {};
  const db = opts.db || KDB.create(opts.dbOptions);
  const onAudit = typeof opts.onAudit === 'function' ? opts.onAudit : () => {};
  const clock = opts.now || now;
  const session = opts.session || ('ses-' + Math.random().toString(36).slice(2, 8));
  const aliasCache = new Map();           // `${type}|${normAlias}` → alias confirmado/de confianza (autocorrección síncrona)
  const state = { ready: false, settings: { autoCorrect: true, autoLearned: true, matureThreshold: CONF.MATURE }, lastError: '', hits: new Map() };
  let readyP = null;

  const audit = (action, details) => { try { onAudit(action, details || {}); } catch (_) { /* la auditoría no debe romper el aprendizaje */ } };
  function failure(e) { state.lastError = (e && e.message) || 'Error de conocimiento.'; return { ok: false, error: state.lastError }; }

  async function init() {
    if (readyP) return readyP;
    readyP = (async () => {
      const st = await db.open();
      const saved = await db.meta.get('settings'); if (saved && typeof saved === 'object') Object.assign(state.settings, saved);
      await loadAliasCache();
      state.ready = true;
      return Object.assign({}, st);
    })().catch(e => { readyP = null; throw e; });
    return readyP;
  }
  async function loadAliasCache() {
    aliasCache.clear();
    for (const st of [STATUS.CONFIRMED, STATUS.TRUSTED]) {
      const rows = await db.byIndex('aliases', 'status', st, { limit: 5000 });
      rows.forEach(a => cacheAlias(a));
    }
  }
  function cacheAlias(a) {
    const key = `${a.type}|${a.normalizedAlias}`;
    if (a.status === STATUS.CONFIRMED || a.status === STATUS.TRUSTED) aliasCache.set(key, { type: a.type, alias: a.alias, canonical: a.canonicalValue, entityId: a.entityId, status: a.status, confidence: a.confidence, id: a.id });
    else aliasCache.delete(key);
  }

  /* ----- fábricas de registros ----- */
  function newEntity(type, value, at, extra) {
    const canonicalValue = type === 'concentration' && parseConcentration(value) ? parseConcentration(value).canonical : str(value).replace(/\s+/g, ' ').trim();
    const normalizedValue = normalize(canonicalValue);
    return finalize(Object.assign({
      id: `${type}:${slug(normalizedValue)}`, type, canonicalValue, normalizedValue, tokens: uniq(normalizedValue.split(' ').filter(Boolean)), aliases: [],
      status: STATUS.OBSERVED, confidence: 0, evidenceCount: 0, positiveEvidence: 0, negativeEvidence: 0, evidenceBy: emptyBy(), confirmRefs: [], sources: [],
      createdAt: at, updatedAt: at, lastValidatedAt: null, version: 0, flags: {}
    }, extra || {}), at);
  }
  const newRel = (subject, predicate, object, at) => finalize({
    id: relIdFor(subject, predicate, object), subject, predicate, object, status: STATUS.OBSERVED, confidence: 0, evidenceCount: 0, positiveEvidence: 0, negativeEvidence: 0,
    evidenceBy: emptyBy(), confirmRefs: [], sources: [], createdAt: at, updatedAt: at, lastValidatedAt: null, version: 0, flags: {}
  }, at);
  const newAlias = (type, alias, entity, at, extra) => finalize(Object.assign({
    id: aliasIdFor(type, alias), type, alias: str(alias).trim(), normalizedAlias: normalize(alias), entityId: entity.id, canonicalValue: entity.canonicalValue,
    status: STATUS.OBSERVED, confidence: 0, evidenceCount: 0, positiveEvidence: 0, negativeEvidence: 0, evidenceBy: emptyBy(), confirmRefs: [], sources: [], createdAt: at, updatedAt: at, lastValidatedAt: null, version: 0, flags: {}
  }, extra || {}), at);

  /* Aplica una evidencia a un registro (suma o resta) y recalcula confianza y estado. */
  const KIND_BY = { observed: 'observed', imported: 'imported', ai: 'ai', confirmed: 'confirmed', dictionary: 'confirmed', correction: 'correction', rejected: 'rejected' };
  function applyEvidence(rec, ev, sign, at) {
    const key = KIND_BY[ev.kind]; if (!key) return;
    rec.evidenceBy[key] = Math.max(0, (rec.evidenceBy[key] || 0) + sign);
    if (sign > 0) {
      if (ev.source && !rec.sources.includes(ev.source)) rec.sources.push(ev.source);
      if (key === 'confirmed' || key === 'rejected' || key === 'correction') rec.lastValidatedAt = at;
      if (key === 'confirmed') { const ref = ev.productRef || ev.session || 'ui'; if (!rec.confirmRefs.includes(ref)) rec.confirmRefs = rec.confirmRefs.concat(ref).slice(-20); }
      if (key === 'ai') rec.flags.suggested = true;
    }
    finalize(rec, at);
  }
  const evidenceId = (targetId, kind, ref, note) => `ev:${hash(`${targetId}|${kind}|${ref}|${note || ''}`)}${hash(`${note || ''}${targetId}`)}`;

  /* Plan de escritura: se cargan los registros que se van a tocar, se modifican en memoria y se guardan en un solo lote. */
  async function loadPlan(ids) {
    const plan = { entities: new Map(), rels: new Map(), aliases: new Map(), evidence: new Map(), conflicts: new Map(), rules: new Map(), corrections: new Map(), dirty: new Set(), events: { created: [], conflicts: [] } };
    const need = { entities: [], relationships: [], aliases: [], evidence: [], conflicts: [] };
    (ids.entities || []).forEach(i => need.entities.push(i)); (ids.rels || []).forEach(i => need.relationships.push(i)); (ids.aliases || []).forEach(i => need.aliases.push(i)); (ids.evidence || []).forEach(i => need.evidence.push(i));
    const load = async (store, list, map) => { const u = uniq(list); const rows = await db.getMany(store, u); rows.forEach((r, i) => { if (r) map.set(u[i], r); }); };
    await Promise.all([load('entities', need.entities, plan.entities), load('relationships', need.relationships, plan.rels), load('aliases', need.aliases, plan.aliases), load('evidence', need.evidence, plan.evidence)]);
    return plan;
  }
  async function commit(plan) {
    const ops = [];
    for (const [, r] of plan.entities) if (plan.dirty.has(r.id)) ops.push({ op: 'put', store: 'entities', rec: r });
    for (const [, r] of plan.rels) if (plan.dirty.has(r.id)) ops.push({ op: 'put', store: 'relationships', rec: r });
    for (const [, r] of plan.aliases) if (plan.dirty.has(r.id)) ops.push({ op: 'put', store: 'aliases', rec: r });
    for (const [, r] of plan.evidence) if (plan.dirty.has(r.id)) ops.push({ op: 'put', store: 'evidence', rec: r });
    for (const [, r] of plan.conflicts) if (plan.dirty.has(r.id)) ops.push({ op: 'put', store: 'conflicts', rec: r });
    for (const [, r] of plan.rules) if (plan.dirty.has(r.id)) ops.push({ op: 'put', store: 'rules', rec: r });
    for (const [, r] of plan.corrections) if (plan.dirty.has(r.id)) ops.push({ op: 'put', store: 'corrections', rec: r });
    if (ops.length) await db.batch(ops);
    ops.filter(o => o.store === 'aliases').forEach(o => cacheAlias(o.rec));
    return ops.length;
  }
  function ensureEntity(plan, type, value, at) {
    const e = newEntity(type, value, at); const cur = plan.entities.get(e.id);
    if (cur) return { rec: cur, created: false };
    plan.entities.set(e.id, e); plan.dirty.add(e.id); plan.events.created.push(e.id);
    return { rec: e, created: true };
  }
  function ensureRel(plan, s, p, o, at) {
    const id = relIdFor(s, p, o); const cur = plan.rels.get(id);
    if (cur) return cur;
    const r = newRel(s, p, o, at); plan.rels.set(id, r); plan.dirty.add(id); plan.events.created.push(id); return r;
  }
  /* Registra una evidencia de forma idempotente: la misma (destino, tipo, producto, nota) no se cuenta dos veces. */
  function addEvidence(plan, target, targetKind, ev, at) {
    const id = evidenceId(target.id, ev.kind, ev.productRef || ev.session || 'ui', ev.note);
    const cur = plan.evidence.get(id);
    if (cur && !cur.superseded) return false;
    const rec = cur ? Object.assign(cur, { superseded: false, supersededAt: null }) : { id, targetId: target.id, targetKind, kind: ev.kind, polarity: ev.kind === 'rejected' ? -1 : 1, source: ev.source || 'manual', productRef: ev.productRef || '', session, ruleId: ev.ruleId || '', note: ev.note || '', value: ev.value || '', createdAt: at, superseded: false };
    plan.evidence.set(id, rec); plan.dirty.add(id); plan.dirty.add(target.id);
    applyEvidence(target, rec, +1, at);
    return true;
  }

  /* ----- hechos de un producto ----- */
  function titleOf(item) {
    if (item.title) return str(item.title);
    const v = item.v || {};
    return [v.marca, v.principio || v.producto || v.modelo || v.componente, v.concentracion].map(x => str(x).trim()).filter(Boolean).join(' ');
  }
  function productKey(item) { return item.sku ? `sku:${normalize(item.sku)}` : item.id ? `item:${item.id}` : `title:${normalize(titleOf(item))}`; }
  const catName = cat => (F && F.CATS && F.CATS[cat] && F.CATS[cat].name) || cat || '';
  function factsOf(item) {
    const v = item.v || {}; const facts = { entities: [], rels: [], product: null };
    const E = (type, value) => { const t = str(value).replace(/\s+/g, ' ').trim(); if (!t) return null; const f = { type, value: t }; facts.entities.push(f); return f; };
    const by = {};
    Object.keys(FIELD_TYPE).forEach(field => {
      const type = FIELD_TYPE[field]; if (!(field in v)) return;
      if (type === 'concentration' && !parseConcentration(v[field])) return;      // «lo que no es valor + unidad» no es una concentración
      const f = E(type, type === 'presentation' ? normalizePresentation(v[field]).canonical : v[field]); if (f) { f.field = field; f.original = str(v[field]).trim(); (by[type] = by[type] || []).push(f); }
    });
    if (v.volumen && /\d/.test(str(v.volumen))) { const c = parseConcentration(v.volumen); if (c) facts.entities.push({ type: 'unit', value: c.unit, field: 'volumen' }); }
    const cn = item.cat ? E('category', catName(item.cat)) : null;
    const conc = by.concentration && by.concentration[0];
    if (conc) { const c = parseConcentration(conc.value); if (c) facts.entities.push({ type: 'unit', value: c.unit, field: 'concentracion' }); }
    const title = titleOf(item);
    if (title) { facts.product = { type: 'product', value: title, key: productKey(item) }; }
    const first = t => (by[t] || [])[0];
    const rel = (s, p, o) => { if (s && o) facts.rels.push({ s, p, o }); };
    ['brand', 'substance', 'laboratory', 'manufacturer', 'pharmaceuticalForm', 'presentation', 'concentration', 'subcategory'].forEach(t => (by[t] || []).forEach(o => rel(facts.product && { type: 'product' }, `product→${t}`, o)));
    if (cn) rel(facts.product && { type: 'product' }, 'product→category', cn);
    ['laboratory', 'manufacturer'].forEach(t => { if (first('brand') && first(t) && t === 'laboratory') rel(first('brand'), 'brand→laboratory', first(t)); });
    (by.substance || []).forEach(s => rel(first('brand'), 'brand→substance', s));
    if (cn) rel(first('brand'), 'brand→category', cn);
    (by.concentration || []).forEach(c => (by.substance || []).forEach(s => rel(s, 'substance→concentration', c)));
    return facts;
  }

  /* ----- aprender de un producto ----- */
  async function observeMany(items, o) {
    o = o || {}; await init();
    const list = (Array.isArray(items) ? items : []).filter(it => it && it.v && typeof it.v === 'object');
    const total = { ok: true, products: 0, created: 0, relationships: 0, conflicts: 0, superseded: 0 };
    const CH = 150;
    try {
      for (let i = 0; i < list.length; i += CH) {
        const r = await observeChunk(list.slice(i, i + CH), o);
        total.products += r.products; total.created += r.created; total.relationships += r.relationships; total.conflicts += r.conflicts; total.superseded += r.superseded;
      }
    } catch (e) { return Object.assign(total, failure(e)); }
    if (total.created) audit(AUDIT.CREATED, { count: total.created, products: total.products, source: o.source || 'manual' });
    return total;
  }
  const observe = (item, o) => observeMany([item], o);

  async function observeChunk(items, o) {
    const at = clock(), source = o.source || 'manual', kind = o.kind || (source === 'csv' || source === 'connector' || source === 'import' ? 'imported' : 'observed');
    const factsList = items.map(it => ({ it, f: factsOf(it) }));
    const ids = { entities: [], rels: [], evidence: [], aliases: [] };
    factsList.forEach(({ it, f }) => {
      const pk = productKey(it);
      const ent = f.entities.map(x => ({ x, id: idFor(x.type, x.type === 'concentration' && parseConcentration(x.value) ? parseConcentration(x.value).canonical : x.value) }));
      ent.forEach(e => { ids.entities.push(e.id); });
      const pid = f.product ? idFor('product', f.product.key) : null; if (pid) ids.entities.push(pid);
      const idOf = ref => idFor(ref.type === 'product' ? 'product' : ref.type, ref.type === 'product' ? f.product.key : ref.type === 'concentration' && parseConcentration(ref.value) ? parseConcentration(ref.value).canonical : ref.value);
      f.rels.forEach(r => { const s = idOf(r.s), ob = idOf(r.o); ids.entities.push(s, ob); const rid = relIdFor(s, r.p, ob); ids.rels.push(rid); ids.evidence.push(evidenceId(rid, kind, pk, '')); r._s = s; r._o = ob; r._id = rid; });
      ent.forEach(e => ids.evidence.push(evidenceId(e.id, kind, pk, '')));
    });
    const plan = await loadPlan(ids);
    const out = { products: 0, created: 0, relationships: 0, conflicts: 0, superseded: 0 };
    /* Los productos reemplazados (edición) retiran sus observaciones anteriores: no se borran, se marcan. */
    if (o.replace) { for (const { it } of factsList) out.superseded += await supersedeInPlan(plan, productKey(it), at); }
    for (const { it, f } of factsList) {
      const pk = productKey(it); out.products++;
      f.entities.forEach(x => {
        const value = x.type === 'concentration' && parseConcentration(x.value) ? parseConcentration(x.value).canonical : x.value;
        const { rec } = ensureEntity(plan, x.type, value, at);
        if (!rec.aliases.includes(x.original || x.value) && (x.original || x.value) !== rec.canonicalValue && rec.aliases.length < 20) { rec.aliases.push(x.original || x.value); plan.dirty.add(rec.id); }
        addEvidence(plan, rec, 'entity', { kind, source, productRef: pk, value: x.original || x.value }, at);
        if (x.original && x.type === 'presentation' && normalizePresentation(x.original).rule !== 'none') { rec.flags.normalized = true; finalize(rec, at); }
      });
      if (f.product) { const { rec } = ensureEntity(plan, 'product', f.product.key, at); rec.canonicalValue = f.product.value; plan.dirty.add(rec.id); addEvidence(plan, rec, 'entity', { kind, source, productRef: pk }, at); }
      for (const r of f.rels) {
        const rel = ensureRel(plan, r._s, r.p, r._o, at);
        if (addEvidence(plan, rel, 'relationship', { kind, source, productRef: pk }, at)) out.relationships++;
      }
    }
    /* Conflictos: un predicado funcional con dos objetos distintos. */
    const checks = new Map();
    plan.rels.forEach(r => { if (FUNCTIONAL.includes(r.predicate) && plan.dirty.has(r.id)) checks.set(`${r.subject}|${r.predicate}`, [r.subject, r.predicate]); });
    /* Un sujeto creado en este mismo lote no puede tener relaciones guardadas ni conflictos previos: se evita consultar la base. */
    const newIds = new Set(plan.events.created);
    for (const [, [s, p]] of checks) out.conflicts += await detectRelConflict(plan, s, p, at, newIds.has(s));
    out.created = plan.events.created.length;
    await commit(plan);
    return out;
  }
  async function supersedeInPlan(plan, pk, at) {
    const evs = await db.byIndex('evidence', 'productRef', pk);
    let n = 0;
    const targets = { entities: [], rels: [] };
    evs.filter(e => e.kind === 'observed' || e.kind === 'imported').forEach(e => (e.targetKind === 'relationship' ? targets.rels : targets.entities).push(e.targetId));
    const more = await loadPlan({ entities: targets.entities, rels: targets.rels });
    more.entities.forEach((v, k) => { if (!plan.entities.has(k)) plan.entities.set(k, v); }); more.rels.forEach((v, k) => { if (!plan.rels.has(k)) plan.rels.set(k, v); });
    evs.forEach(e => {
      if (e.superseded || (e.kind !== 'observed' && e.kind !== 'imported')) return;
      const t = e.targetKind === 'relationship' ? plan.rels.get(e.targetId) : plan.entities.get(e.targetId);
      const mine = plan.evidence.get(e.id) || e;
      mine.superseded = true; mine.supersededAt = at; plan.evidence.set(mine.id, mine); plan.dirty.add(mine.id);
      if (t) { applyEvidence(t, mine, -1, at); plan.dirty.add(t.id); }
      n++;
    });
    return n;
  }
  async function detectRelConflict(plan, subject, predicate, at, isNewSubject) {
    const stored = isNewSubject ? [] : await db.byIndex('relationships', 'subjectPredicate', [subject, predicate]);
    const all = new Map(); stored.forEach(r => all.set(r.id, plan.rels.get(r.id) || r)); plan.rels.forEach(r => { if (r.subject === subject && r.predicate === predicate) all.set(r.id, r); });
    const live = [...all.values()].filter(r => r.status !== STATUS.REJECTED && r.evidenceCount > 0 && ((r.evidenceBy.observed + r.evidenceBy.imported + r.evidenceBy.ai + r.evidenceBy.confirmed + r.evidenceBy.correction) > 0));
    const cid = `conflict:rel:${subject}>${predicate}`;
    const existing = plan.conflicts.get(cid) || (isNewSubject ? null : await db.get('conflicts', cid));
    if (live.length < 2) {
      if (existing && existing.status === 'open') { existing.status = 'resolved'; existing.resolution = { by: 'system', reason: 'ya no hay dos relaciones distintas', at }; existing.updatedAt = at; plan.conflicts.set(cid, existing); plan.dirty.add(cid); live.forEach(r => { r.flags.conflict = false; finalize(r, at); plan.dirty.add(r.id); plan.rels.set(r.id, r); }); }
      return 0;
    }
    /* Si ya fue resuelto por una persona y la elegida sigue vigente, no se reabre. */
    if (existing && existing.status === 'resolved' && existing.resolution && existing.resolution.by === 'user') {
      const chosen = existing.resolution.chosen; const others = live.filter(r => r.id !== chosen && r.status !== STATUS.REJECTED);
      if (!others.length) return 0;
    }
    const fresh = !existing || existing.status !== 'open';
    const rec = Object.assign(existing || { id: cid, kind: 'relationship', createdAt: at, openedAt: at }, { subject, predicate, status: 'open', candidates: live.map(r => r.id), updatedAt: at, resolution: null });
    plan.conflicts.set(cid, rec); plan.dirty.add(cid);
    live.forEach(r => { r.flags.conflict = true; finalize(r, at); plan.dirty.add(r.id); plan.rels.set(r.id, r); });
    if (fresh) { plan.events.conflicts.push(cid); audit(AUDIT.CONFLICT, { conflictId: cid, subject, predicate, candidates: rec.candidates.slice(0, 6) }); return 1; }
    return 0;
  }

  /* ----- consultas ----- */
  async function findEntity(type, value) {
    await init(); const norm = normalize(type === 'concentration' && parseConcentration(value) ? parseConcentration(value).canonical : value); if (!norm) return null;
    const al = await db.get('aliases', aliasIdFor(type, value));
    /* Una equivalencia confirmada por una persona manda sobre una variante que solo fue observada. */
    if (al && (al.status === STATUS.CONFIRMED || al.status === STATUS.TRUSTED)) { const ent = await db.get('entities', al.entityId); if (ent) return { entity: ent, via: 'alias', alias: al }; }
    const hit = await db.get('entities', `${type}:${slug(norm)}`);
    if (hit) return { entity: hit, via: 'exact', alias: null };
    if (al && al.status !== STATUS.REJECTED) { const ent = await db.get('entities', al.entityId); if (ent) return { entity: ent, via: 'alias', alias: al }; }
    return null;
  }
  const summarize = r => r && ({ id: r.id, type: r.type, canonicalValue: r.canonicalValue, status: r.status, confidence: r.confidence, evidenceCount: r.evidenceCount, positive: r.positiveEvidence, negative: r.negativeEvidence });

  async function relationsOf(subjectId, predicate) {
    const rels = await db.byIndex('relationships', 'subjectPredicate', [subjectId, predicate]);
    const live = rels.filter(r => r.status !== STATUS.REJECTED);
    const ents = await db.getMany('entities', live.map(r => r.object));
    return live.map((r, i) => ({ rel: r, object: ents[i] })).filter(x => x.object).sort((a, b) => b.rel.confidence - a.rel.confidence);
  }

  async function matureFor(type) { return (await db.countByIndex('entities', 'type', type)) >= (state.settings.matureThreshold || CONF.MATURE); }

  /* Evalúa un producto contra el conocimiento. Devuelve estado por campo, verificaciones de relaciones y sugerencias con su nivel. */
  async function assess(item) {
    await init();
    const v = (item && item.v) || {}; const fields = {}, checks = [], suggestions = [];
    const resolved = {};
    for (const field of Object.keys(FIELD_TYPE)) {
      const type = FIELD_TYPE[field]; const raw = str(v[field]).trim(); if (!raw) continue;
      if (type === 'concentration' && !parseConcentration(raw)) { fields[field] = { field, type, state: 'unknown', typed: raw, note: 'No tiene el formato valor + unidad.' }; continue; }
      const typedValue = type === 'presentation' ? normalizePresentation(raw).canonical : raw;
      const f = await findEntity(type, typedValue);
      const mature = await matureFor(type);
      if (!f) { fields[field] = { field, type, state: mature ? 'unknown' : 'new', typed: raw, mature }; continue; }
      const e = f.entity; resolved[field] = e;
      const st = e.status === STATUS.TRUSTED ? 'trusted' : e.status === STATUS.CONFIRMED ? 'confirmed' : e.status === STATUS.CONFLICTED ? 'conflict' : e.status === STATUS.REJECTED ? 'rejected' : 'known';
      fields[field] = { field, type, state: st, typed: raw, entity: summarize(e), via: f.via, alias: f.alias ? { alias: f.alias.alias, status: f.alias.status } : null };
      const differs = str(e.canonicalValue).trim() !== raw && !(type === 'presentation' && str(e.canonicalValue).trim() === typedValue && typedValue === raw);
      if (differs && type !== 'presentation' && e.status !== STATUS.REJECTED) {
        const kind = f.via === 'alias' ? 'alias' : 'alias';
        const rec = f.alias || e;
        const d = decideCorrection({ field, type, kind, rec: Object.assign({}, rec, { confidence: rec.confidence, status: rec.status }) }, state.settings);
        suggestions.push({ kind: 'canonical', field, type, from: raw, to: e.canonicalValue, entityId: e.id, confidence: rec.confidence, status: rec.status, level: d.level, levelName: d.name, critical: d.critical, reasons: d.reasons, why: `La aplicación conoce «${e.canonicalValue}» (${STATUS_LABEL[rec.status] || rec.status}, ${Math.round(rec.confidence * 100)} %).` });
      }
    }
    /* Presentaciones: sugerir la forma canónica cuando una regla la cambia. */
    PRESENTATION_FIELDS.forEach(field => {
      const raw = str(v[field]).trim(); if (!raw) return; const p = normalizePresentation(raw);
      if (p.canonical !== raw && p.rule !== 'existing.bare-number→piezas' && !suggestions.some(s => s.field === field)) {
        const seed = p.rule.startsWith('seed.');
        const d = decideCorrection({ field, type: 'presentation', kind: seed ? 'seed' : 'alias', rec: seed ? {} : { confidence: 0.6, status: STATUS.OBSERVED } }, state.settings);
        suggestions.push({ kind: 'presentation', field, type: 'presentation', from: raw, to: p.canonical, rule: p.rule, confidence: 1, level: d.level, levelName: d.name, critical: false, reasons: d.reasons, why: `Regla ${p.rule}: «${raw}» se escribe «${p.canonical}».` });
      }
    });
    /* Relaciones: marca → laboratorio, marca → sustancia. */
    const brand = resolved.marca, lab = resolved.laboratorio;
    if (brand) {
      const labs = await relationsOf(brand.id, 'brand→laboratory');
      const typedLab = str(v.laboratorio).trim();
      if (labs.length) {
        const top = labs[0];
        const conflicted = labs.length > 1 && labs.some(x => x.rel.status === STATUS.CONFLICTED);
        if (!typedLab) {
          const d = decideCorrection({ field: 'laboratorio', type: 'laboratory', kind: 'relation', rec: top.rel, conflict: conflicted }, state.settings);
          checks.push({ predicate: 'brand→laboratory', verdict: 'unknown', subject: brand.canonicalValue });
          suggestions.push({ kind: 'fill', field: 'laboratorio', type: 'laboratory', from: '', to: top.object.canonicalValue, relationId: top.rel.id, confidence: top.rel.confidence, status: top.rel.status, level: conflicted ? LEVELS.REVIEW : Math.min(d.level, LEVELS.ASSISTED), levelName: LEVEL_LABEL[conflicted ? 4 : Math.min(d.level, 2)], critical: true, reasons: d.reasons, why: `${brand.canonicalValue} se relaciona con ${top.object.canonicalValue} (${Math.round(top.rel.confidence * 100)} %).` });
        } else {
          const match = lab ? labs.find(x => x.object.id === lab.id) : null;
          if (match) checks.push({ predicate: 'brand→laboratory', verdict: conflicted ? 'conflict' : 'match', subject: brand.canonicalValue, object: lab.canonicalValue, confidence: match.rel.confidence });
          else {
            const strong = top.rel.status === STATUS.CONFIRMED || top.rel.status === STATUS.TRUSTED;
            const d = decideCorrection({ field: 'laboratorio', type: 'laboratory', kind: 'mismatch', rec: top.rel }, state.settings);
            checks.push({ predicate: 'brand→laboratory', verdict: 'mismatch', subject: brand.canonicalValue, expected: top.object.canonicalValue, typed: typedLab, confidence: top.rel.confidence, strong });
            suggestions.push({ kind: 'mismatch', field: 'laboratorio', type: 'laboratory', from: typedLab, to: top.object.canonicalValue, relationId: top.rel.id, confidence: top.rel.confidence, status: top.rel.status, level: d.level, levelName: d.name, critical: true, reasons: d.reasons, why: `${brand.canonicalValue} figura con ${top.object.canonicalValue}, pero se capturó ${typedLab}.` });
          }
        }
      } else if (typedLab) checks.push({ predicate: 'brand→laboratory', verdict: 'unknown', subject: brand.canonicalValue });
    }
    if (brand && !str(v.principio).trim() && !str(v.componente).trim()) {
      const subs = await relationsOf(brand.id, 'brand→substance');
      const strong = subs.filter(x => x.rel.confidence >= CONF.ASSIST_MIN);
      if (strong.length === 1) suggestions.push({ kind: 'fill', field: 'principio', type: 'substance', from: '', to: strong[0].object.canonicalValue, relationId: strong[0].rel.id, confidence: strong[0].rel.confidence, status: strong[0].rel.status, level: LEVELS.SUGGEST, levelName: LEVEL_LABEL[1], critical: true, reasons: ['las sustancias son datos críticos: se sugiere, nunca se completa sola'], why: `${brand.canonicalValue} se relaciona con ${strong[0].object.canonicalValue}.` });
    }
    return { schema: SCHEMA, fields, checks, suggestions };
  }

  /* Correcciones seguras y SÍNCRONAS (sin consultar la base): reglas semilla + alias confirmados en caché. */
  function safeCorrections(item) {
    const v = (item && item.v) || {}; const out = [];
    const settings = state.settings;
    PRESENTATION_FIELDS.forEach(field => {
      const raw = str(v[field]).trim(); if (!raw) return;
      if (/^\d+(?:[.,]\d+)?\s*(?:pzas?|pzs|pz)\.?$/i.test(raw)) {
        const to = raw.replace(/\s*(?:pzas?|pzs|pz)\.?$/i, ' piezas').replace(/\s+/g, ' ');
        const d = decideCorrection({ field, type: 'presentation', kind: 'seed' }, settings);
        if (d.auto) out.push({ field, original: raw, corrected: to, rule: 'seed.presentation.pzas→piezas', reason: 'Regla determinista: «pzas» significa «piezas».', knowledgeId: 'rule:seed.presentation.pzas', confidence: 1, level: d.level, kind: 'auto' });
      }
    });
    if (v.volumen) {
      const m = /^\s*(\d+(?:[.,]\d+)?)\s*(ml|ML|Ml|mL)\s*$/.exec(str(v.volumen));
      if (m && m[2] !== 'mL') {
        const d = decideCorrection({ field: 'volumen', type: 'unit', kind: 'seed' }, settings);
        if (d.auto) out.push({ field: 'volumen', original: str(v.volumen).trim(), corrected: `${m[1]} mL`, rule: 'seed.volume.unit', reason: 'Regla determinista: la unidad de volumen se escribe «mL».', knowledgeId: 'rule:seed.volume.unit', confidence: 1, level: d.level, kind: 'auto' });
      }
    }
    /* Equivalencias aprendidas, confirmadas por una persona, solo en tipos no sensibles. */
    Object.keys(FIELD_TYPE).forEach(field => {
      const type = FIELD_TYPE[field]; if (!AUTO_TYPES.includes(type) || isCriticalField(field)) return;
      const raw = str(v[field]).trim(); if (!raw || out.some(o => o.field === field)) return;
      const hit = aliasCache.get(`${type}|${normalize(raw)}`); if (!hit || hit.canonical === raw) return;
      const d = decideCorrection({ field, type, kind: 'alias', rec: { status: hit.status, confidence: hit.confidence } }, settings);
      if (d.auto) out.push({ field, original: raw, corrected: hit.canonical, rule: 'learned.alias', reason: `Equivalencia confirmada: «${raw}» se escribe «${hit.canonical}».`, knowledgeId: hit.id, confidence: hit.confidence, level: d.level, kind: 'auto' });
    });
    return out;
  }
  /* Aplica correcciones a una copia de v, conservando el original (se registra en `corrections` con commitCorrections). */
  function applyCorrections(v, list) { const copy = Object.assign({}, v); list.forEach(c => { copy[c.field] = c.corrected; }); return copy; }
  async function commitCorrections(list, item, o) {
    o = o || {}; await init(); if (!list.length) return [];
    const at = clock(); const recs = list.map(c => ({
      id: `corr:${hash(`${c.field}|${c.original}|${c.corrected}|${item.id || item.sku || ''}|${at}`)}${Math.random().toString(36).slice(2, 5)}`,
      field: c.field, original: c.original, corrected: c.corrected, reason: c.reason, rule: c.rule, knowledgeId: c.knowledgeId, confidence: c.confidence, level: c.level,
      kind: o.manual ? 'manual' : 'auto', status: 'applied', sku: str(item.sku), itemId: str(item.id), session, createdAt: at
    }));
    await db.putMany('corrections', recs);
    audit(o.manual ? AUDIT.MANUAL : AUDIT.AUTO, { count: recs.length, fields: recs.map(r => r.field), rules: uniq(recs.map(r => r.rule)), itemId: str(item.id) });
    return recs;
  }
  async function revertCorrection(id) {
    await init(); const c = await db.get('corrections', id);
    if (!c) return { ok: false, error: 'No encontré esa corrección.' };
    if (c.status === 'reverted') return { ok: false, error: 'Esa corrección ya se revirtió.' };
    const at = clock(); c.status = 'reverted'; c.revertedAt = at; await db.put('corrections', c);
    audit(AUDIT.UPDATED, { action: 'revert', correctionId: id, field: c.field, rule: c.rule });
    return { ok: true, correction: c };
  }
  async function listCorrections(o) { await init(); o = o || {}; const rows = await db.range('corrections', 'createdAt', { direction: 'prev', limit: o.limit || 50 }); return o.status ? rows.filter(r => r.status === o.status) : rows; }

  /* ----- confirmar, rechazar, editar ----- */
  async function recOf(plan, id) {
    const kind = id.startsWith('rel:') ? 'rels' : id.startsWith('alias:') ? 'aliases' : 'entities';
    if (!plan[kind].has(id)) { const store = kind === 'rels' ? 'relationships' : kind; const r = await db.get(store, id); if (r) plan[kind].set(id, r); }
    return { rec: plan[kind].get(id), kind: kind === 'rels' ? 'relationship' : kind === 'aliases' ? 'alias' : 'entity' };
  }
  async function decide(id, positive, o) {
    o = o || {}; await init();
    const plan = await loadPlan({}); const { rec, kind } = await recOf(plan, id);
    if (!rec) return { ok: false, error: 'No encontré ese conocimiento.' };
    const at = clock();
    const before = rec.status;
    addEvidence(plan, rec, kind, { kind: positive ? 'confirmed' : 'rejected', source: 'user', productRef: o.productRef || '', note: o.note || '', ruleId: o.ruleId || '' }, at);
    if (!positive && kind !== 'relationship') rec.flags.suggested = false;
    finalize(rec, at); plan.dirty.add(rec.id);
    if (kind === 'relationship' && FUNCTIONAL.includes(rec.predicate)) await detectRelConflict(plan, rec.subject, rec.predicate, at);
    await commit(plan);
    audit(positive ? AUDIT.CONFIRMED : AUDIT.REJECTED, { id, type: kind, from: before, to: rec.status, confidence: rec.confidence });
    return { ok: true, record: rec };
  }
  const confirm = (id, o) => decide(id, true, o);
  const reject = (id, o) => decide(id, false, o);
  async function edit(entityId, patch) {
    await init(); const e = await db.get('entities', entityId); if (!e) return { ok: false, error: 'No encontré ese conocimiento.' };
    const canonical = str(patch && patch.canonicalValue).replace(/\s+/g, ' ').trim();
    if (!canonical) return { ok: false, error: 'El valor no puede quedar vacío.' };
    const norm = normalize(e.type === 'concentration' && parseConcentration(canonical) ? parseConcentration(canonical).canonical : canonical);
    /* La identidad (id) depende del valor normalizado: editar solo corrige mayúsculas, acentos o espacios. Otro nombre distinto es un alias. */
    if (norm !== e.normalizedValue) return { ok: false, error: `Solo puedes ajustar mayúsculas, acentos o espacios. Para otro nombre usa un alias («variante=${canonical}») o rechaza este valor.` };
    const at = clock(); const old = e.canonicalValue;
    const plan = await loadPlan({});
    plan.entities.set(e.id, e);
    e.canonicalValue = canonical; e.aliases = e.aliases.filter(a => a !== canonical);
    addEvidence(plan, e, 'entity', { kind: 'confirmed', source: 'user', note: 'edit:' + at }, at);
    finalize(e, at); plan.dirty.add(e.id);
    await commit(plan);
    audit(AUDIT.UPDATED, { id: e.id, from: old, to: canonical });
    return { ok: true, record: e };
  }

  /* ----- alias y diccionarios del usuario ----- */
  async function addAlias(type, alias, canonicalValue, o) {
    o = o || {}; await init();
    const at = clock(); const a = str(alias).trim(), c = str(canonicalValue).trim();
    if (!a || !c) return { ok: false, error: 'Falta el alias o el valor canónico.' };
    if (normalize(a) === normalize(c) && a === c) return { ok: false, error: 'El alias es igual al valor canónico.' };
    const plan = await loadPlan({ entities: [idFor(type, c)], aliases: [aliasIdFor(type, a)] });
    const { rec: ent } = ensureEntity(plan, type, c, at);
    const aid = aliasIdFor(type, a); let al = plan.aliases.get(aid);
    if (al && al.entityId !== ent.id) {
      /* Ya apunta a otro valor: es un conflicto, no una elección. */
      const cid = `conflict:alias:${type}:${slug(normalize(a))}`;
      const prev = await db.get('conflicts', cid);
      const rec = Object.assign(prev || { id: cid, kind: 'alias', createdAt: at, openedAt: at }, { subject: aid, predicate: 'alias', status: 'open', candidates: uniq([al.entityId, ent.id]), updatedAt: at, resolution: null });
      plan.conflicts.set(cid, rec); plan.dirty.add(cid); al.flags.conflict = true; finalize(al, at); plan.dirty.add(al.id);
      await commit(plan); audit(AUDIT.CONFLICT, { conflictId: cid, alias: a, candidates: rec.candidates });
      return { ok: true, conflict: true, conflictId: cid };
    }
    if (!al) { al = newAlias(type, a, ent, at, { ruleType: o.deterministic ? 'deterministic' : 'learned' }); plan.aliases.set(aid, al); plan.dirty.add(aid); plan.events.created.push(aid); }
    if (!ent.aliases.includes(a) && a !== ent.canonicalValue && ent.aliases.length < 20) { ent.aliases.push(a); plan.dirty.add(ent.id); }
    const kind = o.kind || 'observed';
    addEvidence(plan, al, 'alias', { kind, source: o.source || 'manual', productRef: o.productRef || '', note: o.note || '' }, at);
    if (kind === 'confirmed' || kind === 'dictionary') addEvidence(plan, ent, 'entity', { kind: 'confirmed', source: o.source || 'user', productRef: o.productRef || '', note: o.note || 'alias' }, at);
    if (kind === 'ai') al.flags.suggested = true;
    finalize(al, at); plan.dirty.add(al.id);
    await commit(plan);
    if (plan.events.created.length) audit(AUDIT.CREATED, { count: plan.events.created.length, kind: 'alias', type });
    return { ok: true, alias: al, entity: ent };
  }
  /* Diccionarios del usuario («Alias=Nombre» por línea): curados a mano, cuentan como una confirmación humana. */
  async function importDictionary(text, type, o) {
    await init(); o = o || {}; const lines = str(text).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const sig = `${type}:${hash(lines.join('\n'))}`; const done = (await db.meta.get('dictionaries')) || {};
    if (done[sig] && !o.force) return { ok: true, skipped: true, count: 0 };
    let count = 0;
    for (const line of lines) {
      const [a, c] = line.includes('=') ? line.split('=').map(s => s.trim()) : [line, line];
      if (!c) continue;
      if (a === c) { const at = clock(); const plan = await loadPlan({ entities: [idFor(type, c)] }); const { rec } = ensureEntity(plan, type, c, at); addEvidence(plan, rec, 'entity', { kind: 'confirmed', source: 'dictionary', productRef: `dict:${sig}`, note: 'dictionary' }, at); await commit(plan); count++; }
      else { const r = await addAlias(type, a, c, { kind: 'confirmed', source: 'dictionary', productRef: `dict:${sig}`, note: 'dictionary' }); if (r.ok) count++; }
    }
    done[sig] = clock(); await db.meta.set('dictionaries', done);
    return { ok: true, count };
  }

  /* ----- correcciones del usuario → reglas aprendidas ----- */
  async function recordManualCorrection(c) {
    await init(); const at = clock(); const { field, original, corrected, item } = c;
    if (str(original).trim() === str(corrected).trim() || !str(corrected).trim()) return { ok: false, error: 'No hay un cambio que registrar.' };
    const type = FIELD_TYPE[field] || null; const critical = isCriticalField(field) || (type ? isCriticalType(type) : false);
    const recs = await commitCorrections([{ field, original: str(original), corrected: str(corrected), reason: 'Corrección manual', rule: 'manual', knowledgeId: type ? idFor(type, corrected) : '', confidence: 1, level: LEVELS.SUGGEST }], item || {}, { manual: true });
    let ruleId = null;
    if (type && str(original).trim()) {
      const plan = await loadPlan({ entities: [idFor(type, corrected), idFor(type, original)] });
      const { rec: ent } = ensureEntity(plan, type, corrected, at);
      addEvidence(plan, ent, 'entity', { kind: 'correction', source: 'user', productRef: item ? productKey(item) : '', note: `from:${normalize(original)}` }, at);
      const rid = `rule:${field}:${hash(normalize(original))}>${hash(normalize(corrected))}`;
      let rule = await db.get('rules', rid);
      if (!rule) rule = { id: rid, kind: 'replace', field, type, original: str(original).trim(), corrected: str(corrected).trim(), critical, status: 'suggested', scope: 'similar', evidenceCount: 0, createdAt: at, updatedAt: at, knowledgeId: ent.id };
      rule.evidenceCount += 1; rule.updatedAt = at; plan.rules.set(rid, rule); plan.dirty.add(rid);
      await commit(plan); ruleId = rid;
    }
    return { ok: true, correction: recs[0], ruleId, critical, askSimilar: !!ruleId && !critical };
  }
  async function resolveRule(ruleId, accept) {
    await init(); const rule = await db.get('rules', ruleId); if (!rule) return { ok: false, error: 'No encontré esa regla.' };
    const at = clock(); rule.status = accept ? 'confirmed' : 'rejected'; rule.updatedAt = at; rule.resolvedAt = at; await db.put('rules', rule);
    if (accept) { const r = await addAlias(rule.type, rule.original, rule.corrected, { kind: 'confirmed', source: 'user', note: 'rule:' + ruleId }); audit(AUDIT.CONFIRMED, { id: ruleId, type: 'rule', field: rule.field }); return { ok: true, rule, alias: r.alias || null, conflict: !!r.conflict }; }
    const al = await db.get('aliases', aliasIdFor(rule.type, rule.original));
    if (al) await reject(al.id, { note: 'rule:' + ruleId });
    audit(AUDIT.REJECTED, { id: ruleId, type: 'rule', field: rule.field });
    return { ok: true, rule };
  }
  const listAliases = async o => { await init(); return db.byIndex('aliases', 'status', (o && o.status) || 'suggested', { limit: (o && o.limit) || 50 }); };
  const listRules = async o => { await init(); return db.byIndex('rules', 'status', (o && o.status) || 'suggested', { limit: (o && o.limit) || 50 }); };

  /* ----- relaciones explícitas, conflictos ----- */
  async function confirmRelationship(subject, predicate, object, o) {
    await init(); const at = clock();
    const sub = await findEntity(subject.type, subject.value), ob = await findEntity(object.type, object.value);
    const plan = await loadPlan({});
    const se = sub ? sub.entity : ensureEntity(plan, subject.type, subject.value, at).rec, oe = ob ? ob.entity : ensureEntity(plan, object.type, object.value, at).rec;
    plan.entities.set(se.id, se); plan.entities.set(oe.id, oe);
    const rid = relIdFor(se.id, predicate, oe.id); const cur = await db.get('relationships', rid); if (cur) plan.rels.set(rid, cur);
    const rel = ensureRel(plan, se.id, predicate, oe.id, at);
    addEvidence(plan, rel, 'relationship', { kind: 'confirmed', source: 'user', productRef: (o && o.productRef) || '', note: (o && o.note) || '' }, at);
    if (FUNCTIONAL.includes(predicate)) await detectRelConflict(plan, se.id, predicate, at);
    await commit(plan); audit(AUDIT.CONFIRMED, { id: rel.id, type: 'relationship', predicate });
    return { ok: true, relationship: rel };
  }
  const listConflicts = async o => { await init(); const rows = await db.byIndex('conflicts', 'status', (o && o.status) || 'open', { limit: (o && o.limit) || 50 }); return rows; };
  async function conflictDetail(id) {
    await init(); const c = await db.get('conflicts', id); if (!c) return null;
    if (c.kind === 'relationship') {
      const rels = (await db.getMany('relationships', c.candidates)).filter(Boolean);
      const objs = await db.getMany('entities', rels.map(r => r.object)); const subj = await db.get('entities', c.subject);
      const options = [];
      for (let i = 0; i < rels.length; i++) { const ev = await db.byIndex('evidence', 'targetId', rels[i].id, { limit: 50 }); options.push({ id: rels[i].id, label: objs[i] ? objs[i].canonicalValue : rels[i].object, confidence: rels[i].confidence, status: rels[i].status, evidenceBy: rels[i].evidenceBy, sources: rels[i].sources, lastAt: ev.map(e => e.createdAt).sort().pop() || rels[i].updatedAt, why: explain(rels[i], { name: `${subj ? subj.canonicalValue : ''} → ${objs[i] ? objs[i].canonicalValue : ''}` }) }); }
      return { conflict: c, subject: subj ? subj.canonicalValue : c.subject, predicate: c.predicate, options };
    }
    const ents = (await db.getMany('entities', c.candidates)).filter(Boolean);
    return { conflict: c, subject: c.subject, predicate: 'alias', options: ents.map(e => ({ id: e.id, label: e.canonicalValue, confidence: e.confidence, status: e.status, evidenceBy: e.evidenceBy, sources: e.sources, lastAt: e.updatedAt, why: explain(e) })) };
  }
  /* Resolución humana: la opción elegida se confirma; las demás reciben evidencia negativa (no se borran). */
  async function resolveConflict(id, chosenId) {
    await init(); const c = await db.get('conflicts', id);
    if (!c) return { ok: false, error: 'No encontré ese conflicto.' }; if (!c.candidates.includes(chosenId)) return { ok: false, error: 'La opción elegida no pertenece al conflicto.' };
    const at = clock(); const plan = await loadPlan({});
    if (c.kind === 'relationship') {
      for (const cid of c.candidates) { const r = await db.get('relationships', cid); if (r) plan.rels.set(cid, r); }
      plan.rels.forEach(r => { r.flags.conflict = false; });
      plan.rels.forEach(r => addEvidence(plan, r, 'relationship', { kind: r.id === chosenId ? 'confirmed' : 'rejected', source: 'user', note: 'conflict:' + id }, at));
      plan.rels.forEach(r => { finalize(r, at); plan.dirty.add(r.id); });
    } else {
      const al = await db.get('aliases', c.subject);
      if (al) { al.flags.conflict = false; const ent = await db.get('entities', chosenId); if (ent) { al.entityId = ent.id; al.canonicalValue = ent.canonicalValue; } plan.aliases.set(al.id, al); addEvidence(plan, al, 'alias', { kind: 'confirmed', source: 'user', note: 'conflict:' + id }, at); finalize(al, at); plan.dirty.add(al.id); }
    }
    c.status = 'resolved'; c.resolution = { by: 'user', chosen: chosenId, at }; c.updatedAt = at; plan.conflicts.set(id, c); plan.dirty.add(id);
    await commit(plan); audit(AUDIT.UPDATED, { action: 'resolve-conflict', conflictId: id, chosen: chosenId });
    return { ok: true, conflict: c };
  }

  /* ----- búsqueda y explicación ----- */
  async function search(o) {
    await init(); o = o || {}; const limit = o.limit || 30; const text = normalize(o.text || '');
    let rows = [];
    if (!text) rows = await db.range('entities', 'updatedAt', { direction: 'prev', limit: limit * 3 });
    else {
      const toks = text.split(' ').filter(Boolean); const first = toks[0];
      const cand = new Map();
      const add = r => { if (r && !cand.has(r.id)) cand.set(r.id, r); };
      (await db.range('entities', 'tokens', { lower: first, upper: first + '\uffff', limit: 400 })).forEach(add);
      (await db.range('entities', 'normalized', { lower: text, upper: text + '\uffff', limit: 200 })).forEach(add);
      const als = await db.range('aliases', 'normalized', { lower: text, upper: text + '\uffff', limit: 100 });
      const viaAlias = new Set(); const ents = await db.getMany('entities', uniq(als.filter(a => a.status !== STATUS.REJECTED).map(a => a.entityId))); ents.forEach(r => { if (r) viaAlias.add(r.id); add(r); });
      rows = [...cand.values()].filter(r => viaAlias.has(r.id) || toks.every(t => r.tokens.some(x => x.startsWith(t)) || r.normalizedValue.includes(t)));
    }
    if (o.type) rows = rows.filter(r => r.type === o.type);
    if (o.status) rows = rows.filter(r => r.status === o.status);
    rows.sort((a, b) => (b.confidence - a.confidence) || a.canonicalValue.localeCompare(b.canonicalValue));
    return rows.slice(0, limit);
  }
  async function why(id) {
    await init();
    const kind = id.startsWith('rel:') ? 'relationships' : id.startsWith('alias:') ? 'aliases' : 'entities';
    const rec = await db.get(kind, id); if (!rec) return null;
    let name = rec.canonicalValue;
    if (kind === 'relationships') { const [s, o2] = await db.getMany('entities', [rec.subject, rec.object]); name = `${s ? s.canonicalValue : rec.subject} → ${o2 ? o2.canonicalValue : rec.object}`; }
    if (kind === 'aliases') name = `«${rec.alias}» → ${rec.canonicalValue}`;
    const ev = (await db.byIndex('evidence', 'targetId', id, { limit: 200 })).sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
    const out = explain(rec, { name });
    const conflicts = rec.flags && rec.flags.conflict ? (await db.byIndex('conflicts', 'status', 'open', { limit: 200 })).filter(c => c.subject === rec.subject || c.subject === rec.id || (c.candidates || []).includes(rec.id)) : [];
    return Object.assign(out, { kind, record: rec, evidence: ev.slice(0, 50), evidenceTotal: ev.length, conflicts });
  }
  async function relationsFor(entityId) {
    await init();
    const out = await db.byIndex('relationships', 'subject', entityId, { limit: 100 }); const inn = await db.byIndex('relationships', 'object', entityId, { limit: 100 });
    const ids = uniq(out.map(r => r.object).concat(inn.map(r => r.subject))); const ents = await db.getMany('entities', ids); const map = new Map(ents.filter(Boolean).map(e => [e.id, e]));
    const fmt = (r, other) => ({ id: r.id, predicate: r.predicate, other: other ? other.canonicalValue : '', otherType: other ? other.type : '', status: r.status, confidence: r.confidence });
    return { outgoing: out.filter(r => !r.predicate.startsWith('product→') || true).map(r => fmt(r, map.get(r.object))), incoming: inn.map(r => fmt(r, map.get(r.subject))) };
  }

  /* ----- Cohere: sugerencias de alias, nunca verdad ----- */
  function buildAliasMessages(unknowns, known) {
    return [{ role: 'system', content: 'Eres un asistente de catálogo farmacéutico. Propones posibles alias (variantes ortográficas, abreviaturas o sinónimos) entre un valor desconocido y valores ya conocidos. Responde solo con JSON. No inventes valores nuevos: «canonical» debe ser exactamente uno de los valores conocidos. Si no hay una equivalencia clara, devuelve una lista vacía.' },
      { role: 'user', content: JSON.stringify({ desconocidos: unknowns.map(u => ({ tipo: u.type, valor: u.value })), conocidos: known.map(k => ({ tipo: k.type, valor: k.canonicalValue })) }) }];
  }
  const aliasSchema = () => ({ type: 'object', properties: { suggestions: { type: 'array', items: { type: 'object', properties: { type: { type: 'string' }, alias: { type: 'string' }, canonical: { type: 'string' }, reason: { type: 'string' } }, required: ['type', 'alias', 'canonical'] } } }, required: ['suggestions'] });
  /* chat: función (opciones) → objeto JSON; se reutiliza AI.chat de la app (misma llave y cliente). */
  async function aiSuggestAliases(o) {
    await init(); const items = (o.items || []).filter(x => x && x.value && TYPES.includes(x.type)).slice(0, 15);
    if (!items.length) return { ok: true, created: 0, skipped: 0, suggestions: [] };
    const known = []; const askedNorm = new Set(items.map(it => `${it.type}|${normalize(it.value)}`));
    for (const type of uniq(items.map(it => it.type))) {
      const rows = (await db.byIndex('entities', 'type', type, { limit: 120 })).filter(r => !askedNorm.has(`${r.type}|${r.normalizedValue}`) && r.status !== STATUS.REJECTED).sort((a, b) => b.confidence - a.confidence).slice(0, 40);
      known.push(...rows);
    }
    const knownUniq = [...new Map(known.map(k => [k.id, k])).values()];
    if (!knownUniq.length) return { ok: true, created: 0, skipped: items.length, suggestions: [], note: 'No hay conocimiento previo con el que comparar.' };
    let data;
    try { data = await o.chat({ apiKey: o.apiKey, model: o.model, messages: buildAliasMessages(items, knownUniq), schema: aliasSchema(), temperature: 0, signal: o.signal, onCall: o.onCall, fetchImpl: o.fetchImpl }); }
    catch (e) { return { ok: false, error: (e && e.message) || 'La IA no respondió.' }; }
    const out = []; let skipped = 0;
    for (const s of (data && data.suggestions) || []) {
      const type = TYPES.includes(s && s.type) ? s.type : null;
      const canon = type && knownUniq.find(k => k.type === type && normalize(k.canonicalValue) === normalize(s.canonical));
      const asked = type && items.find(it => it.type === type && normalize(it.value) === normalize(s.alias));
      if (!canon || !asked || normalize(s.alias) === normalize(s.canonical)) { skipped++; continue; }
      const r = await addAlias(type, s.alias, canon.canonicalValue, { kind: 'ai', source: 'ai', note: 'cohere' });
      if (r.ok && !r.conflict) out.push({ id: r.alias.id, alias: s.alias, canonical: canon.canonicalValue, type, critical: isCriticalType(type), reason: str(s.reason).slice(0, 200), status: r.alias.status });
      else skipped++;
    }
    if (out.length) audit(AUDIT.SUGGESTION, { count: out.length, source: 'ai', ids: out.slice(0, 6).map(x => x.id) });
    return { ok: true, created: out.length, skipped, suggestions: out };
  }

  /* ----- ajustes, estadísticas, integridad, respaldo ----- */
  async function setSettings(patch) { await init(); Object.assign(state.settings, patch || {}); await db.meta.set('settings', state.settings); return Object.assign({}, state.settings); }
  async function stats() {
    await init(); const byType = {}, byStatus = {};
    for (const t of TYPES) byType[t] = await db.countByIndex('entities', 'type', t);
    for (const s of Object.values(STATUS)) byStatus[s] = await db.countByIndex('entities', 'status', s);
    const h = await db.health();
    return { schema: SCHEMA, byType, byStatus, entities: h.counts.entities, aliases: h.counts.aliases, relationships: h.counts.relationships, evidence: h.counts.evidence, corrections: h.counts.corrections,
      conflictsOpen: await db.countByIndex('conflicts', 'status', 'open'), rulesPending: await db.countByIndex('rules', 'status', 'suggested'), db: { mode: h.mode, persistent: h.persistent, degraded: h.degraded, error: h.error, version: h.version }, settings: Object.assign({}, state.settings) };
  }
  /* Integridad: relaciones, alias y evidencia deben apuntar a algo que exista. */
  async function integrity() {
    await init(); const problems = []; const ents = new Set();
    for (let after = null; ;) { const page = await db.scan('entities', { after, limit: 500 }); page.forEach(e => ents.add(e.id)); if (page.length < 500) break; after = page[page.length - 1].id; }
    for (let after = null; ;) { const page = await db.scan('relationships', { after, limit: 500 }); page.forEach(r => { if (!ents.has(r.subject) || !ents.has(r.object)) problems.push({ store: 'relationships', id: r.id, issue: 'apunta a una entidad que no existe' }); }); if (page.length < 500) break; after = page[page.length - 1].id; }
    for (let after = null; ;) { const page = await db.scan('aliases', { after, limit: 500 }); page.forEach(a => { if (!ents.has(a.entityId)) problems.push({ store: 'aliases', id: a.id, issue: 'apunta a una entidad que no existe' }); }); if (page.length < 500) break; after = page[page.length - 1].id; }
    return { ok: problems.length === 0, problems: problems.slice(0, 50), total: problems.length, entities: ents.size };
  }
  async function exportBackup() { await init(); const data = await db.exportAll(); data.settings = Object.assign({}, state.settings); data.engine = { version: VERSION, session }; return data; }
  async function importBackup(data, o) {
    await init(); const v = db.validateBackup(data); if (!v.ok) return { ok: false, error: v.errors[0], errors: v.errors };
    try {
      const rep = await db.importAll(data, o);
      if (data.settings && typeof data.settings === 'object' && !(o && o.keepSettings)) await setSettings(data.settings);
      await loadAliasCache();
      const integ = await integrity();
      audit(AUDIT.UPDATED, { action: 'restore', mode: rep.mode, added: rep.added, updated: rep.updated });
      return { ok: true, report: rep, integrity: integ, warnings: rep.warnings };
    } catch (e) { return failure(e); }
  }
  async function reset() { await init(); await db.reset(); await db.meta.set('settings', state.settings); aliasCache.clear(); audit(AUDIT.UPDATED, { action: 'reset' }); return { ok: true }; }

  /* Hints para la interfaz y para Quality (conocimiento → advertencias). */
  function qualityIssues(a, labelOf) {
    const out = []; if (!a) return out;
    Object.values(a.fields || {}).forEach(f => {
      const label = labelOf ? labelOf(f.field) : f.field;
      if (f.state === 'unknown' && isCriticalType(f.type)) out.push({ severity: 'warning', code: 'knowledge-unknown', field: f.field, message: `«${label}» no aparece en el conocimiento aprendido: ${f.typed}. Verifica el dato.` });
      if (f.state === 'conflict') out.push({ severity: 'warning', code: 'knowledge-conflict', field: f.field, message: `«${label}» tiene conocimiento en conflicto. Resuélvelo en Conocimiento.` });
      if (f.state === 'rejected') out.push({ severity: 'warning', code: 'knowledge-rejected', field: f.field, message: `«${label}» coincide con un valor que una persona rechazó.` });
    });
    (a.checks || []).filter(c => c.verdict === 'mismatch').forEach(c => out.push({ severity: c.strong ? 'error' : 'warning', code: 'knowledge-mismatch', field: 'laboratorio', message: `${c.subject} figura con ${c.expected}, pero se capturó ${c.typed}. Revisa el dato.` }));
    return out;
  }
  function knownMap(a) {
    const m = {}; if (!a) return m;
    Object.values(a.fields || {}).forEach(f => { if (f.entity) m[f.field] = { state: f.state, canonical: f.entity.canonicalValue, status: f.entity.status, confidence: f.entity.confidence, entityId: f.entity.id }; });
    return m;
  }

  return {
    SCHEMA, VERSION, db, session, init, settings: () => Object.assign({}, state.settings), setSettings, status: () => ({ ready: state.ready, lastError: state.lastError, db: db.status() }),
    observe, observeMany, assess, safeCorrections, applyCorrections, commitCorrections, revertCorrection, listCorrections, recordManualCorrection, resolveRule, listRules,
    confirm, reject, edit, addAlias, listAliases, importDictionary, confirmRelationship, listConflicts, conflictDetail, resolveConflict, search, why, relationsFor, findEntity,
    aiSuggestAliases, stats, integrity, exportBackup, importBackup, reset, qualityIssues, knownMap, logSuggestions: (item, list) => { if (list && list.length) audit(AUDIT.SUGGESTION, { count: list.length, fields: uniq(list.map(s => s.field)), itemId: str(item && item.id) }); },
    aliasCacheSize: () => aliasCache.size
  };
}

const api = { SCHEMA, VERSION, TYPES, TYPE_LABEL, STATUS, STATUS_LABEL, AUDIT, LEVELS, LEVEL_LABEL, CONF, FIELD_TYPE, CRITICAL_TYPES, CRITICAL_FIELDS, AUTO_TYPES, FUNCTIONAL,
  normalize, idFor, aliasIdFor, relIdFor, normalizeUnit, parseConcentration, normalizePresentation, points, confidenceOf, statusOf, finalize, explain, decideCorrection, isCriticalType, isCriticalField, create };
if (isNode) module.exports = api;
else { root.FichasKnowledge = api; root.FP = root.FP || {}; root.FP.Knowledge = api; }
})(typeof self !== 'undefined' ? self : this);
