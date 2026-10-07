/*
 * Fase 9: Score 360° (contrato fichas.score360.v1).
 *
 * Este módulo NO valida datos. Recibe los resultados ya calculados por los cuatro motores
 * (Health, SEO, Content y Magento Readiness), los combina con pesos explícitos y unifica sus
 * recomendaciones. Si un motor no tiene resultado, se indica; no se calcula por su cuenta.
 *
 * Pesos (fijos, auditables y no editables desde la UI): Health 30, SEO 25, Content 25, Magento 20.
 * Magento aporta su score DIAGNÓSTICO, pero su ESTADO tiene prioridad: BLOCKED marca el 360 como
 * bloqueado aunque el número sea alto.
 * Funciona en navegador (window.FichasScore360) y en Node (require).
 */
(function (root) {
'use strict';

const SCHEMA = 'fichas.score360.v1';
const VERSION = '1.0';
/* Los cuatro contratos devuelven un score entero 0–100, por eso se pueden combinar con pesos que suman 100. */
const WEIGHTS = Object.freeze({ health: 30, seo: 25, content: 25, magento: 20 });
const LABELS = Object.freeze({ health: 'Health', seo: 'SEO', content: 'Contenido', magento: 'Magento' });
const KEYS = Object.freeze(['health', 'seo', 'content', 'magento']);
const BAND_LABEL = Object.freeze({ excelente: 'Excelente', buena: 'Buena', revisar: 'Por revisar', critica: 'Crítica', bloqueado: 'Bloqueado por Magento', sin_evaluar: 'Sin evaluar' });
const FORMULA = 'Score 360 = round(Σ valor × peso ÷ Σ peso de los ejes con score). Pesos: Health 30 %, SEO 25 %, Contenido 25 %, '
  + 'Magento 20 % (score diagnóstico). Si un eje no tiene score (por ejemplo, SEO sin evaluar), se excluye y los pesos de los demás '
  + 'se reparten entre sí; el resultado se marca como parcial. Si Magento está BLOQUEADO, el 360 se muestra como bloqueado aunque el número sea alto.';
/* Orden de las recomendaciones: la clase manda sobre la severidad. */
const CLASS_ORDER = Object.freeze({ bloqueo: 1, error: 2, contradiccion: 3, faltante: 4, seo: 5, contenido: 6, mejora: 7 });
const CLASS_LABEL = Object.freeze({ bloqueo: 'Bloqueo', error: 'Error', contradiccion: 'Contradicción', faltante: 'Dato faltante', seo: 'SEO', contenido: 'Contenido', mejora: 'Mejora' });

const str = x => String(x == null ? '' : x);
const norm = s => str(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const num = x => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const bandOf = score => score == null ? 'sin_evaluar' : score >= 90 ? 'excelente' : score >= 75 ? 'buena' : score >= 50 ? 'revisar' : 'critica';

/* Verifica la coherencia de los pesos con los contratos (se ejecuta en las pruebas y en la documentación). */
function checkWeights(weights) {
  const w = weights || WEIGHTS;
  const sum = KEYS.reduce((a, k) => a + (w[k] || 0), 0);
  const problems = [];
  if (sum !== 100) problems.push(`Los pesos suman ${sum}, no 100.`);
  KEYS.forEach(k => { if (!(w[k] > 0)) problems.push(`Falta el peso de ${k}.`); });
  return { ok: problems.length === 0, sum, problems };
}

/* ---------- extracción de cada eje (solo lectura de los contratos existentes) ---------- */
function axisOf(key, r) {
  if (!r) return { disponible: false, score: null };
  if (key === 'health') return { disponible: num(r.score) != null, score: num(r.score), banda: r.band || bandOf(num(r.score)), estado: r.status || '' };
  if (key === 'seo') { const t = r.score && r.score.total; return { disponible: num(t) != null, score: num(t), banda: bandOf(num(t)), estado: r.status || 'sin_evaluar', estadoLabel: r.statusLabel || '' }; }
  if (key === 'content') { const t = r.score && r.score.total; return { disponible: num(t) != null, score: num(t), banda: bandOf(num(t)), estado: r.status || 'sin_evaluar', estadoLabel: r.statusLabel || '' }; }
  /* magento */
  return { disponible: num(r.score) != null && !!r.state, score: num(r.score), banda: bandOf(num(r.score)), estado: r.state || '', estadoLabel: r.stateLabel || '' };
}

/* ---------- recomendaciones unificadas ---------- */
const healthClass = code => /^knowledge-(mismatch|conflict|rejected)$/.test(code) ? 'contradiccion' : code === 'knowledge-unknown' ? 'contenido' : /^(required-missing|unassigned-text)$/.test(code) ? 'faltante' : code === 'language-claim' ? 'error' : /^language-/.test(code) || code === 'rule-check' ? 'contenido' : /^(invalid-option|negative-number|control-character|unknown-category)$/.test(code) ? 'error' : 'mejora';
const SOURCE_RANK = Object.freeze({ magento: 0, content: 1, seo: 2, health: 3 });
const asList = x => Array.isArray(x) ? x : [];
const HEALTH_WHY = Object.freeze({
  'required-missing': 'La estructura de la categoría exige este dato para generar los textos.',
  'language-claim': 'Un claim en los datos llega al texto final y la ficha no puede sostenerlo.',
  'invalid-option': 'El valor no es una de las opciones que acepta el campo.',
  'unassigned-text': 'Hay texto que no se pudo asignar a ningún campo.'
});

function fieldKeyOf(cat, labelOrKey, F) {
  const c = F && F.CATS && F.CATS[cat];
  if (!c) return norm(labelOrKey);
  const n = norm(labelOrKey);
  const fd = c.fields.find(f => norm(f.key) === n || norm(f.label) === n);
  return fd ? fd.key : n;
}
const missKeys = (cat, list, F) => (list || []).map(x => 'falta:' + fieldKeyOf(cat, x, F));

/* Cada recomendación lleva `keys`: dos motores que señalan lo mismo (un campo faltante, un claim, el bloqueo del HTML)
 * comparten al menos una clave y se fusionan en una sola recomendación. */
function collect(parts, o) {
  const F = o && o.F, cat = o && o.cat;
  const out = [];
  const add = (fuente, clase, severidad, texto, resultado, keys, extra) => {
    if (!texto && !resultado) return;
    if (severidad === 'error' && (clase === 'contenido' || clase === 'mejora' || clase === 'seo')) clase = 'error';
    out.push(Object.assign({ fuente, clase, severidad, texto: str(texto), resultado: str(resultado), keys, campos: [], terminos: [], regla: '', porque: '', puntos: 0 }, extra || {}));
  };
  const mg = parts.magento;
  if (mg) (mg.recommendations || []).forEach(r => {
    const d = r.datos || {};
    let keys = ['magento:' + r.reglaId];
    if (r.reglaId === 'MR-001') keys = ['falta:sku'];
    else if (r.reglaId === 'MR-002') keys = ['bloqueo-html'].concat(missKeys(cat, d.campos, F));
    else if (r.reglaId === 'MR-003') keys = missKeys(cat, d.faltantes, F);
    const chk = (mg.checks || []).find(x => x.id === r.reglaId) || {};
    add('magento', r.clase, r.severidad, r.texto, r.resultado, keys, { reglaId: r.reglaId, campos: [].concat(d.campos || [], d.faltantes || []), regla: chk.nombre || '', porque: chk.nombre ? `Regla de Magento Readiness: «${chk.nombre}».` : '' });
  });
  const h = parts.health;
  if (h && h.issues) h.issues.forEach(i => {
    if (i.severity === 'info') return;
    const keys = i.code === 'required-missing' ? ['falta:' + (i.field || '')] : i.term ? ['claim:' + norm(i.term)] : ['health:' + i.code + ':' + (i.field || '')];
    add('health', healthClass(i.code), i.severity, i.message, i.message, keys, { reglaId: i.code, campos: i.field ? [i.field] : [], terminos: i.term ? [i.term] : [], regla: `Calidad de datos (${i.code})`, porque: HEALTH_WHY[i.code] || 'La calidad de los datos se evalúa antes de generar los textos.' });
  });
  const s = parts.seo;
  if (s && Array.isArray(s.recommendations)) s.recommendations.forEach(r => {
    const f = (s.findings || []).find(x => x.id === r.reglaId) || {};
    /* Lo de Magento lo cubre Magento Readiness; lo informativo sin puntos queda solo en el panel de SEO. */
    if (f.componente === 'magento') return;
    if (r.severidad === 'info' && !(r.puntosRecuperables > 0)) return;
    const d = f.datos || {};
    let keys = ['seo:' + r.reglaId];
    if (d.faltantes && d.faltantes.length) keys = missKeys(cat, d.faltantes, F);
    else if (d.terminos && d.terminos.length) keys = d.terminos.map(t => 'claim:' + norm(t.term || t));
    else if (r.reglaId === 'CON-001') keys = ['bloqueo-html'];
    add('seo', f.clase === 'obligatorios' ? 'faltante' : f.estado === 'error' ? 'error' : 'seo', r.severidad, r.texto, f.resultado || r.texto, keys, { reglaId: r.reglaId, campos: asList(d.faltantes), terminos: asList(d.terminos).map(t => (t && t.term) || t), regla: f.regla || '', porque: f.explicacion || '', puntos: r.puntosRecuperables || 0 });
  });
  const c = parts.content;
  if (c && Array.isArray(c.recommendations)) c.recommendations.forEach(r => {
    const d = r.datos || {};
    let keys = ['content:' + r.reglaId];
    if (d.campos && d.campos.length && r.clase === 'faltante') keys = d.campos.map(k => 'falta:' + k);
    else if (r.reglaId === 'CLM-001' && d.terminos) keys = d.terminos.map(t => 'claim:' + norm(t));
    const cf = (c.findings || []).find(x => x.id === r.reglaId) || {};
    add('content', r.clase || 'contenido', r.severidad, r.texto, r.resultado, keys, { reglaId: r.reglaId, campos: asList(d.campos), terminos: asList(d.terminos), regla: cf.regla || '', porque: cf.explicacion || '', puntos: r.puntosRecuperables || 0 });
  });
  return out;
}

function unify(parts, o) {
  const raw = collect(parts, o);
  /* Unión de recomendaciones que comparten alguna clave. */
  const parent = raw.map((_, i) => i);
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const owner = new Map();
  raw.forEach((r, i) => r.keys.forEach(k => { if (owner.has(k)) parent[find(i)] = find(owner.get(k)); else owner.set(k, i); }));
  const groups = new Map();
  raw.forEach((r, i) => { const g = find(i); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); });
  const merged = [...groups.values()].map(list => {
    const best = list.slice().sort((a, b) => CLASS_ORDER[a.clase] - CLASS_ORDER[b.clase] || (a.severidad === 'error' ? 0 : 1) - (b.severidad === 'error' ? 0 : 1) || SOURCE_RANK[a.fuente] - SOURCE_RANK[b.fuente])[0];
    return { puntos: Math.max(0, ...list.map(x => x.puntos || 0)), campos: uniqList(list.flatMap(x => x.campos)), terminos: uniqList(list.flatMap(x => x.terminos)), regla: best.regla || (list.find(x => x.regla) || {}).regla || '', porque: best.porque || (list.find(x => x.porque) || {}).porque || '', clase: best.clase, severidad: best.severidad, texto: best.texto, resultado: best.resultado, fuentes: uniqList(list.map(x => x.fuente)).sort((a, b) => SOURCE_RANK[a] - SOURCE_RANK[b]), reglaIds: uniqList(list.map(x => x.reglaId).filter(Boolean)), detalles: uniqList(list.map(x => x.resultado).filter(Boolean)).slice(0, 5) };
  });
  /* Segunda pasada: misma acción escrita igual por motores distintos con claves distintas. */
  const byText = new Map();
  merged.forEach(r => {
    const k = norm(r.texto);
    const cur = k && byText.get(k);
    if (!cur) { byText.set(k || Symbol('t'), r); return; }
    cur.fuentes = uniqList(cur.fuentes.concat(r.fuentes)).sort((a, b) => SOURCE_RANK[a] - SOURCE_RANK[b]);
    cur.reglaIds = uniqList(cur.reglaIds.concat(r.reglaIds));
    cur.detalles = uniqList(cur.detalles.concat(r.detalles)).slice(0, 5);
    cur.campos = uniqList(cur.campos.concat(r.campos)); cur.terminos = uniqList(cur.terminos.concat(r.terminos));
    cur.regla = cur.regla || r.regla; cur.porque = cur.porque || r.porque; cur.puntos = Math.max(cur.puntos || 0, r.puntos || 0);
    if (CLASS_ORDER[r.clase] < CLASS_ORDER[cur.clase]) { cur.clase = r.clase; cur.severidad = r.severidad; cur.resultado = r.resultado || cur.resultado; }
  });
  return [...byText.values()]
    .sort((a, b) => CLASS_ORDER[a.clase] - CLASS_ORDER[b.clase] || (a.severidad === 'error' ? 0 : 1) - (b.severidad === 'error' ? 0 : 1) || a.texto.localeCompare(b.texto))
    .map((r, i) => ({ orden: i + 1, clase: r.clase, claseLabel: CLASS_LABEL[r.clase], prioridad: CLASS_ORDER[r.clase], severidad: r.severidad, fuentes: r.fuentes, reglaIds: r.reglaIds, texto: r.texto, resultado: r.resultado, detalles: r.detalles, campos: r.campos, terminos: r.terminos, regla: r.regla, porque: r.porque, puntos: Math.round((r.puntos || 0) * 10) / 10 }));
}
const uniqList = a => [...new Set(a)];

/* ---------- cálculo ---------- */
/* parts = { health, seo, content, magento }: los resultados ya calculados de cada motor.
 * o = { weights (solo para pruebas), F, cat } */
function compute(parts, o) {
  parts = parts || {};
  o = o || {};
  const weights = o.weights || WEIGHTS;
  const axes = {};
  KEYS.forEach(k => { axes[k] = axisOf(k, parts[k]); });
  const avail = KEYS.filter(k => axes[k].disponible);
  const wSum = avail.reduce((a, k) => a + weights[k], 0);
  const mg = parts.magento || null;
  const blocked = !!(mg && mg.state === 'BLOCKED');
  let global;
  if (!avail.length) global = { score: null, band: 'sin_evaluar', bandLabel: BAND_LABEL.sin_evaluar, blocked, parcial: false, ejesSinScore: KEYS.slice(), sumaPesos: 0 };
  else {
    const raw = avail.reduce((a, k) => a + axes[k].score * weights[k], 0) / wSum;
    const score = Math.round(raw);
    const band = blocked ? 'bloqueado' : bandOf(score);
    global = { score, band, bandLabel: BAND_LABEL[band], blocked, parcial: avail.length < KEYS.length, ejesSinScore: KEYS.filter(k => !axes[k].disponible), sumaPesos: wSum, bandaNumerica: bandOf(score) };
  }
  const out = {};
  KEYS.forEach(k => {
    const a = axes[k];
    const pesoNominal = weights[k];
    const pesoAplicado = a.disponible && wSum ? Math.round(1000 * weights[k] / wSum) / 10 : 0;
    const aporte = a.disponible && wSum ? Math.round(10 * a.score * weights[k] / wSum) / 10 : 0;
    out[k] = Object.assign({}, a, { label: LABELS[k], peso: pesoNominal, pesoAplicado, aporte, explain: a.disponible ? `${LABELS[k]} ${a.score}/100 × ${pesoAplicado} % = ${aporte} puntos.` : `${LABELS[k]} sin score: no suma al 360.` });
  });
  if (mg) out.magento.estado = mg.state;
  global.formula = FORMULA;
  global.explain = explainGlobal(out, global);
  global.desglose = KEYS.map(k => ({ eje: k, label: LABELS[k], valor: out[k].score, peso: out[k].peso, pesoAplicado: out[k].pesoAplicado, aporte: out[k].aporte, disponible: out[k].disponible }));
  return {
    schema: SCHEMA, version: VERSION,
    health: out.health, seo: out.seo, content: out.content, magento: out.magento,
    global, recommendations: unify(parts, o), weights: Object.assign({}, weights)
  };
}

function explainGlobal(axes, g) {
  if (g.score == null) return 'Score 360° sin evaluar: ningún eje tiene score.';
  const parts = KEYS.map(k => axes[k].disponible ? `${LABELS[k]} ${axes[k].score} × ${axes[k].pesoAplicado} % = ${axes[k].aporte}` : `${LABELS[k]} sin score`).join(' · ');
  const head = `Score 360°: ${g.score}/100 (${g.bandLabel}).`;
  return `${head} ${parts}.${g.parcial ? ' Resultado parcial: los pesos se repartieron entre los ejes con score.' : ''}${g.blocked ? ' Magento está BLOQUEADO: ese estado tiene prioridad sobre el número.' : ''}`;
}

/* ---------- lote ---------- */
function summarize(list) {
  const items = (Array.isArray(list) ? list : []).filter(Boolean);
  const avg = k => { const v = items.map(x => x[k] && x[k].score).filter(Number.isFinite); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
  const scores = items.map(x => x.global && x.global.score).filter(Number.isFinite);
  const bands = { excelente: 0, buena: 0, revisar: 0, critica: 0, bloqueado: 0, sin_evaluar: 0 };
  items.forEach(x => { bands[(x.global && x.global.band) || 'sin_evaluar']++; });
  const ms = { READY: 0, READY_WITH_WARNINGS: 0, BLOCKED: 0 };
  items.forEach(x => { const s = x.magento && x.magento.estado; if (s in ms) ms[s]++; });
  return {
    schema: SCHEMA, version: VERSION, total: items.length,
    average: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    min: scores.length ? Math.min(...scores) : null, max: scores.length ? Math.max(...scores) : null,
    health: avg('health'), seo: avg('seo'), content: avg('content'), magento: avg('magento'),
    bands, magentoStates: ms, blocked: ms.BLOCKED, withWarnings: ms.READY_WITH_WARNINGS, ready: ms.READY
  };
}

/* Filtros de lote que dependen del 360 (los de SEO/Content/Magento se resuelven con sus propios estados). */
const isCritical360 = r => !!r && !!r.global && r.global.band === 'critica';

/* ---------- persistencia (solo snapshots; los scores nunca son fuente de verdad) ---------- */
function snapshot(list, context) {
  return Object.assign({ at: new Date().toISOString(), context: String(context || 'manual') }, summarize(list));
}
function appendHistory(history, entry, max) {
  const list = Array.isArray(history) ? history.slice() : [];
  list.push(entry);
  return list.slice(-Math.max(1, Math.min(100, max == null ? 100 : max)));
}

const api = { SCHEMA, VERSION, WEIGHTS, LABELS, KEYS, BAND_LABEL, CLASS_ORDER, CLASS_LABEL, FORMULA, checkWeights, bandOf, compute, summarize, isCritical360, snapshot, appendHistory };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FichasScore360 = api;
})(typeof self !== 'undefined' ? self : this);
