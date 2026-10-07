/*
 * Fase 10: capa de UX pura (contrato fichas.ux.v1).
 *
 * Este módulo NO valida datos ni calcula scores: recibe los resultados ya calculados por Health, SEO,
 * Content, Magento Readiness y Score 360, y los traduce a lo que la interfaz necesita responder:
 * estado visual del producto, «qué hacer ahora», a qué campo llevar cada hallazgo, qué estado mostrar en
 * cada campo, dónde se usa cada dato, de dónde viene, aprobación derivada, estado de guardado y filtros.
 *
 * No persiste nada y no es una máquina de estados: todo se DERIVA de los datos actuales. Funciona en el
 * navegador (window.FichasUX) y en Node (require), por eso es completamente probable sin DOM.
 */
(function (root) {
'use strict';
const isNode = typeof module !== 'undefined' && module.exports;

const SCHEMA = 'fichas.ux.v1';
const VERSION = '1.0';

/* ---------- utilidades ---------- */
const str = x => String(x == null ? '' : x);
const norm = s => str(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const uniq = a => [...new Set(a)];
const asArr = x => Array.isArray(x) ? x : [];

/* ---------- 1. Estado visual DERIVADO del producto ---------- */
const STATUS = Object.freeze({
  BORRADOR: { key: 'BORRADOR', label: 'BORRADOR', icon: '✎', tone: 'info' },
  EN_REVISION: { key: 'EN_REVISION', label: 'EN REVISIÓN', icon: '⚠', tone: 'warn' },
  LISTO_PARA_APROBACION: { key: 'LISTO_PARA_APROBACION', label: 'LISTO PARA APROBACIÓN', icon: '✓', tone: 'ok' },
  APROBADO: { key: 'APROBADO', label: 'APROBADO', icon: '✔', tone: 'ok' },
  BLOQUEADO: { key: 'BLOQUEADO', label: 'BLOQUEADO', icon: '⛔', tone: 'bad' }
});

/* Clases de recomendación (las mismas de Score 360) y su orden para «qué hacer ahora». */
const CLASS_RANK = Object.freeze({ bloqueo: 1, error: 2, contradiccion: 3, faltante: 4, humana: 5, seo: 6, contenido: 7, mejora: 8 });
const CLASS_LABEL = Object.freeze({ bloqueo: 'Bloqueo', error: 'Error', contradiccion: 'Inconsistencia', faltante: 'Dato faltante', humana: 'Revisión humana', seo: 'SEO', contenido: 'Contenido', mejora: 'Mejora' });

const recsOf = a => asArr(a && a.s360 && a.s360.recommendations);

/* Cuántas cosas hay que atender y cuántos bloqueos. Las mejoras opcionales no cuentan como «atención». */
function summaryCounts(a) {
  const recs = recsOf(a);
  const blockers = recs.filter(r => r.clase === 'bloqueo').length;
  const attention = recs.filter(r => r.clase !== 'bloqueo' && r.clase !== 'mejora').length;
  const errors = recs.filter(r => r.severidad === 'error').length;
  const improvements = recs.filter(r => r.clase === 'mejora').length;
  return { blockers, attention, errors, improvements, total: recs.length };
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
function attentionText(c) {
  if (!c.attention && !c.blockers) return c.improvements ? `Sin pendientes. ${plural(c.improvements, 'mejora opcional', 'mejoras opcionales')}.` : 'Nada requiere atención.';
  const parts = [];
  if (c.attention) parts.push(`${plural(c.attention, 'cosa requiere', 'cosas requieren')} atención`);
  if (c.blockers) parts.push(plural(c.blockers, 'bloqueo', 'bloqueos'));
  return parts.join(' · ');
}

/* ctx: { hasData, saved, approved, humanReview:[campo] }. a = resultado de los cinco motores ya calculados. */
function deriveStatus(a, ctx) {
  ctx = ctx || {};
  const c = summaryCounts(a);
  const mag = a && a.magento && a.magento.state;
  const band = a && a.s360 && a.s360.global && a.s360.global.band;
  const pendingAI = asArr(ctx.humanReview).length > 0;
  let key, why;
  if (!ctx.hasData) { key = 'BORRADOR'; why = 'Todavía no hay datos del producto.'; }
  else if (!ctx.saved) {
    key = 'BORRADOR';
    why = ctx.editing ? 'Tiene cambios sin guardar.' : 'Aún no está guardado en el lote.';
    if (c.blockers) why += ` Hoy tendría ${plural(c.blockers, 'bloqueo', 'bloqueos')}.`;
  } else if (mag === 'BLOCKED') { key = 'BLOQUEADO'; why = 'Magento no exportaría este producto hasta resolver los bloqueos.'; }
  else if (ctx.approved) { key = 'APROBADO'; why = 'Aprobado con los datos actuales. Si cambias algo, la aprobación se retira.'; }
  else if (c.errors > 0 || band === 'critica' || pendingAI) {
    key = 'EN_REVISION';
    why = pendingAI ? 'Hay datos sugeridos por IA que debes confirmar.' : c.errors ? `Hay ${plural(c.errors, 'error', 'errores')} por corregir.` : 'El Score 360° es crítico.';
  } else {
    key = 'LISTO_PARA_APROBACION';
    why = c.attention ? `Se puede aprobar; quedan ${plural(c.attention, 'advertencia', 'advertencias')}.` : 'Sin errores ni bloqueos.';
  }
  return Object.assign({}, STATUS[key], { why, canApprove: key === 'LISTO_PARA_APROBACION', canRevoke: key === 'APROBADO' });
}

/* ---------- 2. Flujo CAPTURAR → VALIDAR → CORREGIR → COMPRENDER → APROBAR → EXPORTAR ---------- */
const STEPS = Object.freeze([
  { key: 'capturar', label: 'Capturar' }, { key: 'validar', label: 'Validar' }, { key: 'corregir', label: 'Corregir' },
  { key: 'comprender', label: 'Comprender' }, { key: 'aprobar', label: 'Aprobar' }, { key: 'exportar', label: 'Exportar' }
]);
function stepOf(status, a, ctx) {
  const c = summaryCounts(a);
  let cur;
  if (!ctx || !ctx.hasData) cur = 'capturar';
  else if (status.key === 'BORRADOR') cur = c.blockers + c.attention > 0 ? 'corregir' : 'validar';
  else if (status.key === 'BLOQUEADO') cur = 'corregir';
  else if (status.key === 'EN_REVISION') cur = 'comprender';
  else if (status.key === 'LISTO_PARA_APROBACION') cur = 'aprobar';
  else cur = 'exportar';
  const idx = STEPS.findIndex(s => s.key === cur);
  return STEPS.map((s, i) => Object.assign({}, s, { state: i < idx ? 'done' : i === idx ? 'current' : 'todo' }));
}

/* ---------- 3. Navegación al campo ---------- */
const labelOf = (CATS, cat, key) => { const f = CATS && CATS[cat] && CATS[cat].fields.find(x => x.key === key); return f ? f.label : key; };
function resolveKey(CATS, cat, x) {
  const c = CATS && CATS[cat];
  if (!c || x == null) return null;
  const n = norm(x);
  const f = c.fields.find(fd => norm(fd.key) === n || norm(fd.label) === n);
  return f ? f.key : null;
}
/* Reglas que apuntan a campos fijos cuando el hallazgo no trae `campos`. */
const RULE_FIELDS = {
  'COH-C01': ['forma', 'via'], 'COH-C02': ['receta', 'leyenda'], 'COH-C03': ['concentracion', 'leyenda'], 'COH-C04': ['volumen', 'forma'],
  'PRE-002': ['forma'], 'DES-002': ['marca'], 'CLA-003': ['marca'], 'COH-001': ['marca'],
  'SEG-001': ['receta']
};
const PRESENTATION_KEYS = { dis: ['paquete', 'presentacion'] };
const OUTPUT_ANCHORS = [
  [/^TIT-/, { tab: 'titulo', anchor: '#panel-titulo .final', label: 'el título' }],
  [/^MC-/, { tab: 'mc', anchor: '#panel-mc .desc', label: 'la descripción de Merchant Center' }],
  [/^(MT-|COH-002)/, { tab: 'meta', anchor: '#meta-mt', label: 'el meta title' }],
  [/^(MD-|COH-003|COH-004|COH-006|MAG-002|MAG-003)/, { tab: 'meta', anchor: '#meta-md', label: 'la meta description' }],
  [/^ALT-/, { tab: 'meta', anchor: '#meta-alt', label: 'el alt de la imagen' }],
  [/^(CON-001|CON-004|CON-020)/, { tab: 'mg', anchor: '#panel-mg', label: 'el HTML de Magento' }],
  [/^CON-002/, { tab: 'mc', anchor: '#panel-mc .desc', label: 'la descripción de Merchant Center' }],
  [/^(FT-|DES-001|SEG-002|SEG-003)/, { tab: 'mg', anchor: '#panel-mg', label: 'el HTML de Magento' }],
  [/^(MR-009)/, { tab: 'mg', anchor: '#panel-mg', label: 'el HTML de Magento' }],
  [/^(MR-010|CAT-001|MT-002|MD-002)/, { settings: 'magento', label: 'la estructura de meta en Ajustes' }]
];
const SKU_RULES = /^(MR-001|MR-013|MR-014|MAG-001|MAG-005)$/;
const IMG_RULES = /^(IMG-001|MR-012)$/;
const AXIS_OF_SOURCE = { health: 'health', seo: 'seo', content: 'content', magento: 'magento' };

/* Campos del formulario a los que apunta un hallazgo unificado. */
function targetKeys(rec, ctx) {
  const { CATS, cat, values } = ctx;
  const out = [];
  asArr(rec.campos).forEach(x => { const k = resolveKey(CATS, cat, x); if (k) out.push(k); });
  asArr(rec.reglaIds).forEach(id => {
    asArr(RULE_FIELDS[id]).forEach(k => { if (resolveKey(CATS, cat, k)) out.push(k); });
    if (id === 'PRE-001') asArr(PRESENTATION_KEYS[cat] || ['contenido']).forEach(k => { if (resolveKey(CATS, cat, k)) out.push(k); });
  });
  /* Claims y lenguaje: los campos cuyo texto contiene el término señalado. */
  asArr(rec.terminos).forEach(t => {
    const term = norm(typeof t === 'object' ? t.term : t);
    if (!term) return;
    CATS[cat].fields.forEach(fd => { if (norm(values && values[fd.key]).includes(term)) out.push(fd.key); });
  });
  return uniq(out);
}
function targetFor(rec, ctx) {
  if (!rec) return null;
  const ids = asArr(rec.reglaIds);
  const keys = targetKeys(rec, ctx);
  if (ids.some(id => SKU_RULES.test(id)) && !keys.length) return { kind: 'sku', key: 'sku', label: 'el SKU', button: 'Ver campo' };
  if (ids.some(id => IMG_RULES.test(id)) && !keys.length) return { kind: 'img', key: 'img', label: 'la imagen principal', button: 'Ver campo' };
  if (keys.length) return { kind: 'field', key: keys[0], keys, label: labelOf(ctx.CATS, ctx.cat, keys[0]), button: 'Ver campo' };
  for (const id of ids) {
    const hit = OUTPUT_ANCHORS.find(([re]) => re.test(id));
    if (hit) return Object.assign({ kind: hit[1].settings ? 'settings' : 'output', button: hit[1].settings ? 'Ir a Ajustes' : 'Ver campo' }, hit[1]);
  }
  const axis = AXIS_OF_SOURCE[asArr(rec.fuentes)[0]] || 'health';
  return { kind: 'axis', axis, label: 'el detalle', button: 'Ver detalle' };
}

/* ---------- 4. «Qué hacer ahora» ---------- */
function nextBestAction(a, ctx) {
  ctx = ctx || {};
  const cands = recsOf(a).map(r => ({ rank: CLASS_RANK[r.clase] || 8, clase: r.clase, rec: r }));
  const hasAIRec = recsOf(a).some(r => asArr(r.reglaIds).includes('MR-004'));
  if (!hasAIRec) asArr(ctx.humanReview).forEach(k => cands.push({
    rank: CLASS_RANK.humana, clase: 'humana',
    rec: { clase: 'humana', severidad: 'warning', texto: `Verifica con el empaque el dato «${labelOf(ctx.CATS, ctx.cat, k)}» sugerido por IA.`, resultado: 'Un dato sugerido por IA debe confirmarse antes de aprobar.', reglaIds: ['HUMAN-AI'], campos: [k], fuentes: ['content'] }
  }));
  if (!cands.length) return { kind: 'listo', clase: 'listo', rank: 9, texto: 'No hay nada pendiente. Puedes continuar.', resultado: '', button: null, target: null, rec: null };
  cands.sort((x, y) => x.rank - y.rank || (x.rec.severidad === 'error' ? 0 : 1) - (y.rec.severidad === 'error' ? 0 : 1));
  const top = cands[0];
  const target = targetFor(top.rec, ctx);
  const pts = Number(top.rec.puntos) || 0;
  const impacto = top.clase === 'bloqueo' ? 'Al resolverlo, Magento podrá exportar este producto.'
    : top.clase === 'humana' ? 'Al confirmarlo, el producto puede aprobarse.'
    : pts > 0 ? `Al corregirlo recuperas hasta ${pts} punto${pts === 1 ? '' : 's'}.` : '';
  return {
    kind: 'accion', clase: top.clase, claseLabel: CLASS_LABEL[top.clase] || '', rank: top.rank,
    texto: str(top.rec.texto), resultado: str(top.rec.resultado), impacto, more: cands.length - 1,
    button: target ? (target.kind === 'field' || target.kind === 'sku' || target.kind === 'img' ? 'Corregir' : target.button) : null,
    target, rec: top.rec
  };
}

/* ---------- 5. Indicadores en campos ---------- */
const FIELD_STATE = Object.freeze({
  ok: { key: 'ok', icon: '✓', label: 'Correcto' },
  warn: { key: 'warn', icon: '⚠', label: 'Revisar' },
  bad: { key: 'bad', icon: '❌', label: 'Error' },
  info: { key: 'info', icon: 'ℹ', label: 'Información' },
  pending: { key: 'pending', icon: '○', label: 'Pendiente' }
});
function fieldStates(a, ctx) {
  const { CATS, cat, values } = ctx;
  const c = CATS[cat];
  const byKey = {};
  recsOf(a).forEach(r => targetKeys(r, ctx).forEach(k => { (byKey[k] = byKey[k] || []).push(r); }));
  const out = {};
  c.fields.filter(fd => fd.type !== 'select').forEach(fd => {
    const val = str(values && values[fd.key]).trim();
    const issues = byKey[fd.key] || [];
    let st;
    if (issues.some(r => r.severidad === 'error' || r.clase === 'bloqueo' || r.clase === 'error')) st = 'bad';
    else if (issues.some(r => r.clase !== 'mejora' && r.severidad !== 'info')) st = 'warn';
    else if (issues.length) st = 'info';
    else if (val) st = 'ok';
    else if (fd.req) st = 'pending';
    else st = null;
    if (!st) return;
    out[fd.key] = Object.assign({}, FIELD_STATE[st], { issues: issues.map(r => ({ clase: r.clase, claseLabel: CLASS_LABEL[r.clase], severidad: r.severidad, que: str(r.resultado || r.texto), porque: str(r.porque), regla: str(r.regla), reglaIds: asArr(r.reglaIds), accion: str(r.texto), fuentes: asArr(r.fuentes) })) });
  });
  return out;
}

/* ---------- 6. «Este dato alimenta estos campos» ---------- */
function titleKeysOf(res) { return uniq(asArr(res && res.title && res.title.segs).flatMap(s => asArr(s.parts).filter(p => p.value).map(p => p.key))); }
function metaKeysOf(metaCfg, cat) {
  const m = metaCfg && metaCfg.cats && metaCfg.cats[cat];
  if (!m) return [];
  return uniq(['mt', 'md', 'alt'].flatMap(k => [...str(m[k] && m[k].tpl).matchAll(/\{(\w+)\}/g)].map(x => x[1])));
}
function usageOf(key, ctx) {
  const c = ctx.CATS[ctx.cat];
  const inTitle = asArr(ctx.titleKeys).includes(key);
  const inMc = asArr(c.mcUses).includes(key);
  const inMg = asArr(c.mgUses).includes(key);
  const inMeta = asArr(ctx.metaKeys).includes(key);
  const list = [
    { id: 'titulo', label: 'Título', on: inTitle },
    { id: 'descripcion', label: 'Descripción', on: inMc },
    { id: 'magento', label: 'Magento', on: inMg },
    { id: 'meta', label: 'Meta', on: inMeta },
    { id: 'seo', label: 'SEO', on: inTitle || inMeta }
  ];
  return { items: list, used: list.filter(x => x.on).map(x => x.label) };
}
const usageText = u => u.used.length ? `Alimenta: ${u.used.join(' · ')}` : 'Aún no alimenta ningún texto';

/* ---------- 7. Origen del dato ---------- */
const ORIGIN_LABEL = Object.freeze({
  manual: 'captura manual', ai: 'IA sugerida', 'ai-confirmed': 'IA confirmada', vision: 'IA leída de foto',
  ocr: 'OCR', csv: 'importación CSV', import: 'importación', connector: 'conector', conector: 'conector', normalization: 'normalización'
});
function originOf(key, ctx) {
  const flag = ctx && ctx.aiFlags && ctx.aiFlags[key];
  let src = 'manual';
  if (flag === 'sugerido') src = 'ai'; else if (flag === 'extraido') src = 'ai'; else if (flag === 'imagen') src = 'vision'; else if (flag === 'confirmado') src = 'ai-confirmed';
  else if (ctx && ctx.provenance && ctx.provenance[key] && ctx.provenance[key].source) src = ctx.provenance[key].source;
  let text = ORIGIN_LABEL[src] || 'captura manual';
  if (flag === 'extraido') text = 'IA extraída (verificada)';
  const norms = asArr(ctx && ctx.changes);
  const changed = norms.find(x => norm(x.label) === norm(ctx.label));
  return { source: src, text, normalized: changed ? { from: str(changed.from), to: str(changed.to) } : null };
}

/* ---------- 8. Guardado ---------- */
const SAVE = Object.freeze({
  guardado: { key: 'guardado', icon: '✓', label: 'Guardado' },
  guardando: { key: 'guardando', icon: '…', label: 'Guardando…' },
  error: { key: 'error', icon: '❌', label: 'Error al guardar' },
  sin_guardar: { key: 'sin_guardar', icon: '●', label: 'Cambios sin guardar' },
  sin_cambios: { key: 'sin_cambios', icon: '○', label: 'Sin cambios pendientes' }
});
function effectiveSave(raw, dirty) {
  if (raw === 'error') return SAVE.error;
  if (raw === 'guardando') return SAVE.guardando;
  if (dirty) return SAVE.sin_guardar;
  return raw === 'guardado' ? SAVE.guardado : SAVE.sin_cambios;
}

/* ---------- 9. Aprobación DERIVADA (no es una máquina de estados persistente) ---------- */
/* Se registra como evento en la auditoría que ya existe (producto_aprobado / aprobacion_retirada) con la
 * firma de los datos. Si los datos cambian, la firma ya no coincide y el producto deja de estar aprobado. */
function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
function itemSig(item) {
  const v = (item && item.v) || {};
  const sorted = Object.keys(v).sort().filter(k => str(v[k]).trim()).map(k => [k, str(v[k]).trim()]);
  return hash(JSON.stringify([item && item.cat, str(item && item.sku).trim(), str(item && item.img).trim(), sorted]));
}
function isApproved(audit, item) {
  if (!item || !item.id) return false;
  const evs = asArr(audit).filter(e => e && e.details && e.details.itemId === item.id && (e.action === 'producto_aprobado' || e.action === 'aprobacion_retirada'));
  const last = evs[evs.length - 1];
  return !!last && last.action === 'producto_aprobado' && last.details.sig === itemSig(item);
}

/* ---------- 10. Historial de cambios (solo sesión; la auditoría persistida no guarda valores) ---------- */
function recordChange(log, ch, max) {
  const list = asArr(log).slice();
  if (!ch || str(ch.before) === str(ch.after)) return list;
  const last = list[list.length - 1];
  if (last && last.field === ch.field && !ch.force) {
    const merged = Object.assign({}, last, { after: ch.after, at: ch.at, origin: ch.origin || last.origin });
    if (str(merged.before) === str(merged.after)) list.pop(); else list[list.length - 1] = merged;
  } else list.push({ field: ch.field, label: ch.label || ch.field, before: str(ch.before), after: str(ch.after), origin: ch.origin || 'captura manual', at: ch.at });
  return list.slice(-Math.max(1, max || 50));
}

/* ---------- 11. Alertas contextuales ---------- */
function contextAlerts(a, ctx) {
  const recs = recsOf(a);
  const out = [];
  const mag = a && a.magento;
  if (mag && mag.state === 'BLOCKED') {
    const n = asArr(mag.blockers).length;
    out.push({ axis: 'magento', tone: 'bad', text: n > 1 ? `Magento bloqueado: ${n} bloqueos.` : 'Magento bloqueado.', button: 'Ver bloqueos', action: { kind: 'axis', axis: 'magento' } });
  }
  [['seo', 'SEO', 'Revisar SEO'], ['content', 'contenido', 'Revisar contenido'], ['health', 'datos', 'Revisar datos']].forEach(([axis, label, button]) => {
    const list = recs.filter(r => asArr(r.fuentes).includes(axis) && r.clase !== 'mejora' && r.clase !== 'bloqueo');
    if (!list.length) return;
    const first = list.slice().sort((x, y) => (CLASS_RANK[x.clase] || 8) - (CLASS_RANK[y.clase] || 8))[0];
    const t = targetFor(first, ctx);
    const seoTab = axis === 'seo' && t && t.kind !== 'output' && t.kind !== 'field' ? { kind: 'output', tab: 'meta', anchor: '#panel-meta' } : t;
    out.push({ axis, tone: list.some(r => r.severidad === 'error') ? 'bad' : 'warn', count: list.length, text: `Hay ${plural(list.length, 'problema', 'problemas')} en ${label}.`, button, action: seoTab || { kind: 'axis', axis } });
  });
  return out;
}

/* ---------- 12. Filtros del lote ---------- */
const PRIMARY_FILTERS = Object.freeze({
  todos: 'Todos', ux_errores: 'Errores', ux_revisar: 'Revisar', ux_listos: 'Listos',
  ux_seo: 'SEO', ux_contenido: 'Contenido', ux_magento: 'Magento', ux_health: 'Health', ux_critico: 'Score crítico'
});
const bandIn = (b, list) => list.includes(b);
const FILTER_TESTS = {
  todos: () => true,
  ux_errores: e => !!e.ux && (e.ux.key === 'BLOQUEADO' || recsOf(e).some(r => r.severidad === 'error')),
  ux_revisar: e => !!e.ux && e.ux.key === 'EN_REVISION',
  ux_listos: e => !!e.ux && (e.ux.key === 'LISTO_PARA_APROBACION' || e.ux.key === 'APROBADO'),
  ux_seo: e => !!e.seo && bandIn(e.seo.status, ['critico', 'revisar']),
  ux_contenido: e => !!e.content && bandIn(e.content.status, ['critico', 'revisar']),
  ux_magento: e => !!e.magento && e.magento.state !== 'READY',
  ux_health: e => !!e.health && bandIn(e.health.band, ['critica', 'revisar']),
  ux_critico: e => !!e.s360 && !!e.s360.global && e.s360.global.band === 'critica'
};
const isUxFilter = k => Object.prototype.hasOwnProperty.call(FILTER_TESTS, k);
const passUx = (e, k) => isUxFilter(k) ? !!FILTER_TESTS[k](e) : true;

/* ---------- 13. Errores legibles y texto seguro ---------- */
const BAD_TOKENS = /\[object Object\]|\bundefined\b|\bNaN\b|\bnull\b/g;
function safeText(x, fallback) {
  const fb = fallback == null ? '' : fallback;
  if (x == null) return fb;
  let s;
  if (typeof x === 'string') s = x;
  else if (typeof x === 'number') s = Number.isFinite(x) ? String(x) : fb;
  else if (x instanceof Error || (typeof x === 'object' && typeof x.message === 'string')) s = x.message;
  else s = '';
  s = s.replace(BAD_TOKENS, '').replace(/\s{2,}/g, ' ').trim();
  return s || fb;
}
function friendlyError(e, action) {
  const raw = e instanceof Error ? e : { name: '', message: safeText(e) };
  const name = str(raw.name), msg = str(raw.message);
  const what = action || 'completar la acción';
  let message;
  if (name === 'AbortError') message = 'Acción cancelada.';
  else if (name === 'QuotaExceededError' || /quota/i.test(msg)) message = 'No hay espacio de almacenamiento en el navegador. Descarga un respaldo y libera espacio.';
  else if (name === 'SyntaxError' || /JSON/i.test(msg)) message = 'El archivo no tiene un formato válido.';
  else if (/failed to fetch|network|load failed|timeout/i.test(msg)) message = 'No hay conexión con el servicio. Revisa tu internet e intenta de nuevo.';
  else if (/denied|permission|NotAllowed/i.test(name + msg)) message = 'El navegador bloqueó la acción. Revisa los permisos e intenta de nuevo.';
  else {
    /* Los mensajes escritos por la propia app ya son legibles: se conservan si no suenan técnicos. */
    const clean = safeText(msg);
    message = clean && clean.length <= 160 && !/^\w*Error\b|\bat \w+|\.js:\d+|TypeError|ReferenceError|Cannot read/i.test(clean) ? clean : `No se pudo ${what}. Intenta nuevamente.`;
  }
  return { message: safeText(message, `No se pudo ${what}. Intenta nuevamente.`), technical: msg || name || 'error' };
}

/* ---------- 14. Memo y accesibilidad (utilidades puras) ---------- */
function makeMemo(sigFn, computeFn) {
  const stats = { hits: 0, misses: 0 };
  let sig = null, value;
  return {
    stats,
    get(...args) {
      const s = sigFn(...args);
      if (s === sig && value !== undefined) { stats.hits++; return value; }
      stats.misses++; value = computeFn(...args); sig = s; return value;
    },
    reset() { sig = null; value = undefined; }
  };
}
const lum = hex => {
  const h = str(hex).replace('#', '');
  const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const c = [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
function contrast(a, b) { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100; }

const api = {
  SCHEMA, VERSION, STATUS, STEPS, CLASS_RANK, CLASS_LABEL, FIELD_STATE, SAVE, PRIMARY_FILTERS, ORIGIN_LABEL, RULE_FIELDS,
  summaryCounts, attentionText, deriveStatus, stepOf, targetKeys, targetFor, nextBestAction, fieldStates,
  titleKeysOf, metaKeysOf, usageOf, usageText, originOf, effectiveSave, itemSig, isApproved, recordChange,
  contextAlerts, isUxFilter, passUx, safeText, friendlyError, makeMemo, contrast, hash
};
if (isNode) module.exports = api; else root.FichasUX = api;
})(typeof self !== 'undefined' ? self : this);
