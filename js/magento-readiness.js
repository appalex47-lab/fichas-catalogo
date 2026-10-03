/*
 * Fase 9: Magento Readiness (contrato fichas.magento.readiness.v1).
 *
 * Este módulo NO reemplaza ni duplica el contrato de exportación de logic.js. Lo CONSUME: ejecuta
 * magentoBatch, validateMagentoExport, batchCsv y parseCSV sobre el producto con las mismas opciones de
 * exportación que usa la app, y traduce el resultado a un estado:
 *
 *   READY                 se exporta y no hay nada que advertir
 *   READY_WITH_WARNINGS   se exporta, pero hay datos pendientes o inconsistencias
 *   BLOCKED               NO se exporta (o el contrato Magento falla)
 *
 * El ESTADO depende solo de las comprobaciones de abajo: ningún score, promedio o IA puede cambiarlo.
 * El score (0–100) es diagnóstico y solo describe cuántas comprobaciones se cumplen; un producto
 * BLOCKED puede tener un score alto y sigue BLOCKED.
 * Funciona en navegador (window.FichasMagentoReadiness) y en Node (require).
 */
(function (root) {
'use strict';
const isNode = typeof module !== 'undefined' && module.exports;
const F = isNode ? require('./logic.js') : root.Fichas;
const S = isNode ? (() => { try { return require('./seo.js'); } catch (_) { return null; } })() : (root.FichasSEO || null);

const SCHEMA = 'fichas.magento.readiness.v1';
const VERSION = '1.0';
const STATES = Object.freeze({ READY: 'READY', READY_WITH_WARNINGS: 'READY_WITH_WARNINGS', BLOCKED: 'BLOCKED' });
const STATE_LABEL = { READY: 'Listo', READY_WITH_WARNINGS: 'Listo con advertencias', BLOCKED: 'Bloqueado' };
/* Puntos que resta cada comprobación al score diagnóstico. No intervienen en el estado. */
const PENALTY = Object.freeze({ bloqueo: 25, advertencia: 8 });
const FORMULA = 'Score diagnóstico = 100 − 25 × bloqueos − 8 × advertencias (mínimo 0). Es solo descriptivo: el estado '
  + '(Listo, Listo con advertencias, Bloqueado) lo decide únicamente la presencia de bloqueos y nunca el score.';
const PENDING_COLS = ['base_image', 'base_image_label', 'meta_title', 'meta_description', 'short_description'];

const str = x => String(x == null ? '' : x);
const uniq = a => [...new Set(a)];
const hasData = v => !!v && typeof v === 'object' && Object.values(v).some(x => str(x).trim());
const unconfirmedAI = ai => Object.values(ai || {}).some(v => v === 'sugerido' || v === 'imagen');
const clamp = n => Math.max(0, Math.min(100, n));
const shortReason = x => str(x).split('.')[0];

/* Inventario de comprobaciones (documentado en PHASE_9). */
const CHECKS = {
  'MR-001': { grupo: 'identidad', nombre: 'El producto tiene SKU', accion: 'Captura el SKU exacto de Magento: sin SKU el producto no sale en el archivo.', clase: 'faltante' },
  'MR-002': { grupo: 'requeridos', nombre: 'Datos regulatorios requeridos completos', accion: 'Captura los datos que bloquean la descripción (en medicamentos, la receta y el principio activo).', clase: 'faltante' },
  'MR-003': { grupo: 'requeridos', nombre: 'Datos del título completos', accion: 'Completa los datos del título o activa «Incluir filas con datos faltantes» al exportar.', clase: 'faltante' },
  'MR-004': { grupo: 'requeridos', nombre: 'Datos de IA confirmados', accion: 'Confirma los datos de IA en el lote o activa su inclusión al exportar.', clase: 'faltante' },
  'MR-005': { grupo: 'requeridos', nombre: 'Lenguaje revisado', accion: 'Corrige el lenguaje señalado en la ficha o desactiva la exclusión por lenguaje al exportar.', clase: 'contenido' },
  'MR-006': { grupo: 'contrato', nombre: 'Formato Batch de 104 columnas', accion: 'No se corrige desde la ficha: revisa la definición de columnas del contrato Magento.', clase: 'bloqueo' },
  'MR-007': { grupo: 'serializacion', nombre: 'El CSV se serializa y se vuelve a leer con 104 columnas', accion: 'Corrige el texto que rompe el CSV (comillas, saltos de línea) o revisa el contrato.', clase: 'bloqueo' },
  'MR-008': { grupo: 'serializacion', nombre: 'Separadores válidos (sin comas ni saltos de línea internos)', accion: 'Quita las comas o saltos de línea internos del dato que los trae.', clase: 'bloqueo' },
  'MR-009': { grupo: 'contenido', nombre: 'La descripción de Magento existe y su HTML está bien formado', accion: 'Completa los datos para generar la descripción o corrige el HTML señalado.', clase: 'contenido' },
  'MR-010': { grupo: 'contenido', nombre: 'Meta title, meta description y short_description se generan', accion: 'Confirma la estructura de meta de la categoría en Ajustes, pestaña Magento.', clase: 'faltante' },
  'MR-011': { grupo: 'contenido', nombre: 'El alt de la imagen existe y no excede el límite', accion: 'Captura los datos que alimentan el alt o acórtalo.', clase: 'faltante' },
  'MR-012': { grupo: 'contenido', nombre: 'Hay ruta de imagen principal', accion: 'Agrega la ruta de la imagen principal (base_image).', clase: 'faltante' },
  'MR-013': { grupo: 'lote', nombre: 'El SKU es único dentro del lote', accion: 'Corrige el SKU repetido: Magento conserva solo el último del lote.', clase: 'error' },
  'MR-014': { grupo: 'lote', nombre: 'No hay SKU casi idénticos en el lote', accion: 'Verifica si es un error de captura del SKU.', clase: 'mejora' }
};
const ruleIds = Object.keys(CHECKS);

/* Campos que bloquean la descripción, con las mismas reglas de buildMg (logic.js): receta en medicamentos y datos vitales. */
function blockedKeys(res, v) {
  const val = k => str(v && v[k]).trim();
  return (res.c.id === 'med' && !val('receta') ? ['receta'] : []).concat((res.c.vital || []).filter(k => !val(k)));
}
function mkCheck(id, estado, mensaje, datos) {
  const d = CHECKS[id];
  return { id, grupo: d.grupo, nombre: d.nombre, estado, mensaje: mensaje || '', accion: estado === 'cumple' || estado === 'no_aplica' ? '' : d.accion, clase: d.clase, datos: datos || null };
}
const ok = (id, m) => mkCheck(id, 'cumple', m);
const na = (id, m) => mkCheck(id, 'no_aplica', m);
const warn = (id, m, datos) => mkCheck(id, 'advertencia', m, datos);
const block = (id, m, datos) => mkCheck(id, 'bloqueo', m, datos);

function emptyResult(motivo, id) {
  const b = [Object.assign(block('MR-001', motivo), { id: id || 'MR-001' })];
  return { schema: SCHEMA, version: VERSION, state: STATES.BLOCKED, stateLabel: STATE_LABEL.BLOCKED, ready: false, exportable: false, score: 0, blockers: b, warnings: [], checks: b.slice(), pendientes: [], contract: { ok: false, errors: [motivo], columnas: F.MAG_HEADER.length, columnasFila: 0 }, recommendations: [], explain: `Magento: Bloqueado. ${motivo}`, formula: FORMULA, context: { lote: false } };
}

/* Evalúa un producto {cat, v, sku, img, ai}.
 * Opciones: keep, metaCfg, exp ({attr, incFaltantes, excLenguaje, incIA}: las mismas de la exportación),
 * res (computeFor ya calculado), dup ({count, isLast}) y anomalyTypes (Set) para lotes. */
function evaluate(item, o) {
  o = o || {};
  item = item || {};
  if (!F.CATS[item.cat] || !hasData(item.v)) return emptyResult('El producto no tiene categoría válida o datos que exportar.', 'MR-001');
  const exp = Object.assign({ attr: '', incFaltantes: false, excLenguaje: false, incIA: false }, o.exp || {});
  const keep = o.keep || new Set();
  const res = o.res || F.computeFor(item.cat, item.v, keep, o.metaCfg);
  const sku = str(item.sku).trim();
  const checks = [];

  /* 1) Se ejecuta el exportador real. Si falla, el estado es BLOCKED. */
  let ex = null, exportError = '';
  try { ex = F.magentoBatch([item], keep, o.metaCfg, exp); } catch (e) { exportError = e && e.message ? e.message : String(e); }
  const row = ex && ex.rows && ex.rows[0] ? ex.rows[0] : null;
  const contract = ex && ex.contract ? ex.contract : { ok: false, errors: [exportError || 'El exportador Magento no devolvió resultado.'] };
  const cerr = contract.errors || [];

  /* 2) Exclusiones del exportador (mismas reglas que magentoBatch). */
  checks.push(!sku ? block('MR-001', 'Sin SKU: Magento no puede ubicar el producto y la fila no se exporta.') : ok('MR-001'));
  checks.push(res.mg.blocked ? block('MR-002', 'Descripción de Magento bloqueada: ' + res.mg.blocked.map(shortReason).join('; ') + '.', { motivos: res.mg.blocked, campos: blockedKeys(res, item.v) }) : ok('MR-002'));
  checks.push(res.title.missing.length
    ? (exp.incFaltantes ? warn('MR-003', `Faltan datos del título (${res.title.missing.join(', ')}); se exporta porque incluir faltantes está activo.`, { faltantes: res.title.missing })
      : block('MR-003', `Faltan datos del título: ${res.title.missing.join(', ')}. La fila no se exporta.`, { faltantes: res.title.missing }))
    : ok('MR-003'));
  checks.push(unconfirmedAI(item.ai)
    ? (exp.incIA ? warn('MR-004', 'Hay datos de IA sin confirmar; se exportan porque su inclusión está activa.') : block('MR-004', 'Hay datos de IA sin confirmar. La fila no se exporta hasta confirmarlos.'))
    : ok('MR-004'));
  const L = F.lint(res.c, item.v), nLang = F.langCount(L);
  checks.push(nLang
    ? (exp.excLenguaje ? block('MR-005', `${nLang} aviso(s) de lenguaje y la exclusión por lenguaje está activa. La fila no se exporta.`) : warn('MR-005', `${nLang} aviso(s) de lenguaje por revisar.`))
    : ok('MR-005'));

  /* 3) Contrato: 104 columnas, serialización y separadores (resultado del contrato real). */
  const colErrors = cerr.filter(e => /columnas/i.test(e));
  const sepErrors = cerr.filter(e => /coma|salto de l/i.test(e));
  const otherErrors = cerr.filter(e => !colErrors.includes(e) && !sepErrors.includes(e));
  if (exportError) {
    checks.push(block('MR-006', `El exportador Magento falló: ${exportError}`));
  } else if (F.MAG_HEADER.length !== 104 || colErrors.length || (row && row.length !== F.MAG_HEADER.length)) {
    checks.push(block('MR-006', colErrors[0] || `El formato Batch debe tener 104 columnas y tiene ${F.MAG_HEADER.length}.`, { errores: colErrors }));
  } else checks.push(ok('MR-006', `${F.MAG_HEADER.length} columnas por fila.`));

  if (!row) checks.push(na('MR-007', 'La fila no se exporta: no hay CSV que serializar.'));
  else {
    let msg = '';
    try {
      const csv = F.batchCsv(ex);
      const parsed = F.parseCSV(csv);
      const back = parsed.rows[1];
      if (parsed.rows.length !== 2) msg = `El CSV se leyó con ${parsed.rows.length - 1} fila(s) de datos; se esperaba 1.`;
      else if (parsed.rows[0].length !== 104 || back.length !== 104) msg = `Al volver a leer el CSV hay ${back.length} columnas; se esperaban 104.`;
      else if (back[F.MAG_IDX.sku] !== row[F.MAG_IDX.sku]) msg = 'El SKU cambió al serializar el CSV.';
    } catch (e) { msg = e && e.message ? e.message : String(e); }
    checks.push(msg ? block('MR-007', msg) : ok('MR-007', 'El CSV se vuelve a leer con 104 columnas y el mismo SKU.'));
  }
  const sepAll = sepErrors.concat(otherErrors);
  checks.push(!row && !sepAll.length ? na('MR-008', 'La fila no se exporta.') : sepAll.length ? block('MR-008', sepAll.slice(0, 3).join(' | '), { errores: sepAll }) : ok('MR-008'));

  /* 4) Contenido que llega a Magento. */
  if (res.mg.blocked) checks.push(na('MR-009', 'La descripción está bloqueada (ver MR-002).'));
  else {
    const desc = row ? str(row[F.MAG_IDX.description]) : str(res.mg.html);
    const probs = S && S.htmlProblems ? S.htmlProblems(str(res.mg.html)) : [];
    if (!desc.trim()) checks.push(block('MR-009', 'La columna description va vacía.'));
    else if (probs.length) checks.push(warn('MR-009', `HTML con problemas: ${probs.join('; ')}.`, { problemas: probs }));
    else checks.push(ok('MR-009'));
  }
  checks.push(!res.meta.confirmed ? warn('MR-010', 'La estructura de meta de la categoría no está confirmada: meta_title, meta_description y short_description salen vacías.') : ok('MR-010'));
  checks.push(!res.meta.alt.text ? warn('MR-011', 'No se generó el alt de la imagen principal.') : res.meta.alt.over ? warn('MR-011', `El alt tiene ${res.meta.alt.len} caracteres y el límite es ${res.meta.alt.max}.`) : ok('MR-011'));
  checks.push(!str(item.img).trim() ? warn('MR-012', 'base_image va vacío: el alt viaja solo en base_image_label.') : ok('MR-012'));

  /* 5) Lote. */
  const dup = o.dup;
  checks.push(!dup ? na('MR-013', 'Solo se evalúa dentro de un lote.') : !sku ? na('MR-013', 'Sin SKU.') : dup.count > 1
    ? (dup.isLast ? warn('MR-013', `El SKU está repetido ${dup.count} veces en el lote; este es el último y es el que se exporta.`) : block('MR-013', `El SKU está repetido ${dup.count} veces en el lote; Magento conserva solo el último, así que este no se exporta.`))
    : ok('MR-013'));
  checks.push(!o.anomalyTypes ? na('MR-014', 'Solo se evalúa dentro de un lote.') : o.anomalyTypes.has('near-duplicate-sku') ? warn('MR-014', 'Hay otro SKU muy parecido en el lote.') : ok('MR-014'));

  const blockers = checks.filter(c => c.estado === 'bloqueo');
  const warnings = checks.filter(c => c.estado === 'advertencia');
  const state = blockers.length ? STATES.BLOCKED : warnings.length ? STATES.READY_WITH_WARNINGS : STATES.READY;
  const score = clamp(100 - PENALTY.bloqueo * blockers.length - PENALTY.advertencia * warnings.length);
  const pendientes = row ? PENDING_COLS.filter(k => !str(row[F.MAG_IDX[k]]).trim()) : PENDING_COLS.slice();
  const recommendations = blockers.concat(warnings).map(c => ({
    reglaId: c.id, grupo: c.grupo, clase: c.estado === 'bloqueo' ? 'bloqueo' : c.clase === 'bloqueo' ? 'mejora' : c.clase,
    severidad: c.estado === 'bloqueo' ? 'error' : 'warning', texto: c.accion, resultado: c.mensaje, datos: c.datos
  }));
  return {
    schema: SCHEMA, version: VERSION, state, stateLabel: STATE_LABEL[state], ready: state === STATES.READY, exportable: state !== STATES.BLOCKED,
    score, blockers, warnings, checks, pendientes,
    contract: { ok: !!contract.ok, errors: cerr.slice(), columnas: F.MAG_HEADER.length, columnasFila: row ? row.length : 0 },
    recommendations, formula: FORMULA, explain: explain(state, score, blockers, warnings),
    context: { categoria: item.cat, sku, lote: !!o.dup || !!o.anomalyTypes, exp }
  };
}

function explain(state, score, blockers, warnings) {
  if (state === STATES.BLOCKED) return `Magento: Bloqueado (${blockers.length} bloqueo${blockers.length === 1 ? '' : 's'}). El estado manda sobre el score diagnóstico (${score}/100): ${blockers.map(b => b.mensaje).slice(0, 2).join(' ')}`.trim();
  if (state === STATES.READY_WITH_WARNINGS) return `Magento: Listo con advertencias (${warnings.length}). Se exporta; score diagnóstico ${score}/100.`;
  return `Magento: Listo. Se exporta sin advertencias; score diagnóstico ${score}/100.`;
}

/* Evalúa un lote. Detecta SKU repetidos igual que el exportador: se exporta el último de cada SKU. */
function evaluateBatch(items, o) {
  o = o || {};
  const list = Array.isArray(items) ? items : [];
  const key = it => str(it && it.sku).trim().toLowerCase();
  const count = new Map(), last = new Map();
  list.forEach((it, i) => { const k = key(it); if (!k) return; count.set(k, (count.get(k) || 0) + 1); last.set(k, i); });
  const typesByIndex = new Map();
  (o.anomalies || []).forEach(a => (a.indexes || []).forEach(i => { if (!typesByIndex.has(i)) typesByIndex.set(i, new Set()); typesByIndex.get(i).add(a.type); }));
  const results = list.map((it, i) => {
    const k = key(it);
    return evaluate(it, Object.assign({}, o, { res: (o.resList && o.resList[i]) || undefined, dup: { count: k ? count.get(k) : 0, isLast: k ? last.get(k) === i : true }, anomalyTypes: typesByIndex.get(i) || new Set() }));
  });
  return { items: results, summary: summarizeBatch(results) };
}

function summarizeBatch(results) {
  const list = Array.isArray(results) ? results.filter(Boolean) : [];
  const s = { schema: SCHEMA, version: VERSION, total: list.length, ready: 0, readyWithWarnings: 0, blocked: 0, exportables: 0, average: null, min: null, max: null };
  list.forEach(r => { if (r.state === STATES.READY) s.ready++; else if (r.state === STATES.READY_WITH_WARNINGS) s.readyWithWarnings++; else s.blocked++; });
  s.exportables = s.ready + s.readyWithWarnings;
  const scores = list.map(r => r.score).filter(Number.isFinite);
  if (scores.length) { s.average = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length); s.min = Math.min(...scores); s.max = Math.max(...scores); }
  return s;
}

const api = { SCHEMA, VERSION, STATES, STATE_LABEL, PENALTY, FORMULA, CHECKS, ruleIds, evaluate, evaluateBatch, summarizeBatch };
if (isNode) module.exports = api; else root.FichasMagentoReadiness = api;
})(typeof self !== 'undefined' ? self : this);
