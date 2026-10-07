'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const F = require('../js/logic.js');
const S = require('../js/seo.js');
const Rules = require('../js/rules.js');

const keep = new Set(['gnc', 'omron', 'gsk']);
const med = { marca: 'MOUNJARO', concentracion: '2.5MG', volumen: '0.6ML', principio: 'TIRZEPATIDA', forma: 'SOL INY', contenido: 'CAJ C/4 PLUMAS', laboratorio: 'ELI LILLY', via: 'Subcutánea', receta: 'si' };
const cos = { marca: 'CeraVe', producto: 'Crema Hidratante', tipo: 'Crema', atributo: 'Ceramidas', contenido: 'Frasco 454 g', fabricante: "L'Oréal" };
const IMG = '/m/o/mounjaro.jpg';

const metaWith = (cat, patch) => { const m = F.defMeta(); Object.assign(m.cats[cat], patch(m.cats[cat])); return m; };
const ev = (item, o) => S.evaluate(Object.assign({ sku: 'SKU1', img: IMG, ai: {} }, item), Object.assign({ keep, metaCfg: F.defMeta() }, o));
const finding = (e, id) => e.findings.find(f => f.id === id);
const rule = (e, id) => [e.title, e.metaTitle, e.metaDescription, e.alt, e.content, e.consistency, e.magento].flatMap(s => s.rules).find(r => r.id === id);

/* ---------- contrato ---------- */
test('contrato fichas.seo.v1: forma del resultado', () => {
  const e = ev({ cat: 'med', v: med });
  assert.equal(e.schema, 'fichas.seo.v1');
  for (const k of ['status', 'findings', 'title', 'metaTitle', 'metaDescription', 'alt', 'content', 'consistency', 'recommendations']) assert.ok(k in e, `falta ${k}`);
  assert.ok(Array.isArray(e.findings) && Array.isArray(e.recommendations));
  assert.ok(['listo', 'pendiente', 'revisar', 'critico', 'sin_evaluar'].includes(e.status));
  assert.equal(typeof e.score.total, 'number');
});

test('es determinista y no modifica el producto', () => {
  const item = { cat: 'med', v: { ...med }, sku: 'X', img: IMG, ai: {} };
  const copy = JSON.stringify(item);
  const a = S.evaluate(item, { keep, metaCfg: F.defMeta() }), b = S.evaluate(item, { keep, metaCfg: F.defMeta() });
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(item), copy);
});

test('producto vacío o categoría inválida: sin evaluar (no es cero)', () => {
  assert.equal(S.evaluate({ cat: 'med', v: {} }, { keep }).status, 'sin_evaluar');
  assert.equal(S.evaluate({ cat: 'med', v: {} }, { keep }).score.total, null);
  assert.equal(S.evaluate({ cat: 'zzz', v: { marca: 'a' } }, { keep }).status, 'sin_evaluar');
});

/* ---------- meta title ---------- */
test('meta title correcto: cumple longitud, estructura y formato', () => {
  const e = ev({ cat: 'med', v: med });
  assert.equal(e.metaTitle.texto, 'Comprar Mounjaro 2.5 mg | Tirzepatida | Eli Lilly');
  for (const id of ['MT-001', 'MT-003', 'MT-004', 'MT-010']) assert.equal(rule(e, id).estado, 'cumple', id);
  assert.equal(e.metaTitle.score, 100);
});

test('meta title largo: MT-003 avisa con la longitud y el límite configurados', () => {
  const e = ev({ cat: 'med', v: { ...med, marca: 'Marca con un nombre extraordinariamente largo para superar el límite' } });
  const f = finding(e, 'MT-003');
  assert.ok(f, 'debe haber hallazgo');
  assert.equal(f.estado, 'pendiente');
  assert.equal(f.severidad, 'warning');
  assert.match(f.resultado, /límite configurado es 60/);
  assert.ok(f.accion);
});

test('meta title vacío: MT-001 es error y las reglas dependientes no aplican', () => {
  const m = metaWith('med', c => ({ mt: { ...c.mt, tpl: '' } }));
  const e = ev({ cat: 'med', v: med }, { metaCfg: m });
  assert.equal(rule(e, 'MT-001').estado, 'error');
  assert.equal(rule(e, 'MT-003').estado, 'no_aplica');
  assert.equal(rule(e, 'MT-010').estado, 'no_aplica');
  assert.equal(e.status, 'critico');
});

/* ---------- meta description ---------- */
test('meta description correcta', () => {
  const e = ev({ cat: 'med', v: med });
  assert.match(e.metaDescription.texto, /^El Mounjaro de 2\.5 mg contiene Tirzepatida/);
  for (const id of ['MD-001', 'MD-003', 'MD-004', 'MD-010']) assert.equal(rule(e, id).estado, 'cumple', id);
});

test('meta description larga: MD-003 con el límite de 155', () => {
  const e = ev({ cat: 'med', v: { ...med, laboratorio: 'Laboratorio ' + 'muy largo '.repeat(14) } });
  const f = finding(e, 'MD-003');
  assert.ok(f);
  assert.match(f.resultado, /155/);
});

/* ---------- alt ---------- */
test('alt correcto', () => {
  const e = ev({ cat: 'med', v: med });
  assert.equal(e.alt.texto, 'Mounjaro 2.5 mg, Tirzepatida, caja con 4 plumas');
  for (const id of ['ALT-001', 'ALT-002', 'ALT-003', 'ALT-004', 'ALT-005', 'ALT-010', 'ALT-011']) assert.equal(rule(e, id).estado, 'cumple', id);
});

test('alt ausente: con imagen y estructura de alt vacía es error', () => {
  const m = metaWith('med', c => ({ alt: { ...c.alt, tpl: '' } }));
  const e = ev({ cat: 'med', v: med }, { metaCfg: m });
  assert.equal(rule(e, 'ALT-001').estado, 'error');
  assert.equal(e.status, 'critico');
});

test('alt con «imagen de»: ALT-003 avisa', () => {
  const m = metaWith('med', c => ({ alt: { ...c.alt, tpl: 'Imagen de {marca} {concentracion}' } }));
  const e = ev({ cat: 'med', v: med }, { metaCfg: m });
  const f = finding(e, 'ALT-003');
  assert.ok(f);
  assert.equal(f.estado, 'pendiente');
  assert.match(f.resultado, /imagen|foto/i);
});

/* ---------- claims ---------- */
test('claims en los datos de entrada: error CON-010 y recomendación', () => {
  const e = ev({ cat: 'med', v: { ...med, laboratorio: 'Lab que cura todo' } });
  const f = finding(e, 'CON-010');
  assert.ok(f, 'CON-010');
  assert.equal(f.estado, 'error');
  assert.equal(e.status, 'critico');
  assert.ok(e.recommendations.some(r => r.reglaId === 'CON-010'));
});

test('lenguaje subjetivo: CON-011 avisa; sin claims no hay hallazgo', () => {
  const e = ev({ cat: 'med', v: { ...med, laboratorio: 'Laboratorio ideal' } });
  assert.equal(finding(e, 'CON-011').estado, 'pendiente');
  assert.equal(finding(ev({ cat: 'med', v: med }), 'CON-011'), undefined);
});

test('claims en meta: con estructura sin confirmar se escanea; confirmada no (comportamiento actual)', () => {
  const tpl = c => ({ mt: { ...c.mt, tpl: 'Comprar {marca}\n{principio}\nprotege y elimina' } });
  const conf = ev({ cat: 'med', v: med }, { metaCfg: metaWith('med', tpl) });
  assert.equal(rule(conf, 'MT-006').estado, 'no_aplica', 'confirmada: no se escanea');
  const prov = ev({ cat: 'med', v: med }, { metaCfg: metaWith('med', c => ({ ...tpl(c), confirmed: false })) });
  assert.equal(rule(prov, 'MT-006').estado, 'pendiente', 'provisional: se escanea');
  assert.match(rule(prov, 'MT-006').resultado, /elimina/);
});

/* ---------- título ---------- */
test('título incompleto: TIT-002 avisa y nombra lo que falta', () => {
  const e = ev({ cat: 'med', v: { marca: 'Tempra', principio: 'Paracetamol' } });
  const f = finding(e, 'TIT-002');
  assert.ok(f);
  assert.match(f.resultado, /Concentración/);
  assert.equal(f.bloquea, true);
});

test('título duplicado dentro del lote: TIT-005', () => {
  const a = { cat: 'med', v: med, sku: 'A', img: IMG }, b = { cat: 'med', v: { ...med }, sku: 'B', img: IMG }, c = { cat: 'cos', v: cos, sku: 'C', img: IMG };
  const out = S.evaluateBatch([a, b, c], { keep, metaCfg: F.defMeta() });
  assert.equal(rule(out.items[0], 'TIT-005').estado, 'pendiente');
  assert.equal(rule(out.items[1], 'TIT-005').estado, 'pendiente');
  assert.equal(rule(out.items[2], 'TIT-005').estado, 'cumple');
  assert.equal(rule(out.items[0], 'MT-008').estado, 'pendiente', 'meta title repetido');
  // fuera de un lote no se evalúa
  assert.equal(rule(ev({ cat: 'med', v: med }), 'TIT-005').estado, 'no_aplica');
});

test('marca repetida en el título: TIT-004', () => {
  const e = ev({ cat: 'cos', v: { ...cos, producto: 'CeraVe Crema', tipo: '' } });
  // dedupeFields quita la marca al inicio del nombre; se fuerza la repetición con otro texto
  const r = ev({ cat: 'cos', v: { ...cos, producto: 'Crema CeraVe Hidratante', tipo: '' } });
  assert.ok(['cumple', 'pendiente'].includes(rule(e, 'TIT-004').estado));
  assert.equal(rule(r, 'TIT-004').estado, 'pendiente');
});

test('título largo: TIT-003 con el límite de Merchant Center', () => {
  const e = ev({ cat: 'med', v: { ...med, laboratorio: 'Laboratorio ' + 'Farmacéutico '.repeat(12) } });
  assert.ok(finding(e, 'TIT-003'));
  assert.equal(F.TITLE_MAX, 150);
});

/* ---------- coherencia ---------- */
test('coherencia correcta en medicamentos', () => {
  const e = ev({ cat: 'med', v: med });
  for (const id of ['COH-001', 'COH-002', 'COH-003', 'COH-004', 'COH-006']) assert.equal(rule(e, id).estado, 'cumple', id);
});

test('coherencia: el meta title que omite un dato clave del título se marca (COH-002)', () => {
  const m = metaWith('med', c => ({ mt: { ...c.mt, tpl: 'Comprar {marca}\n{laboratorio}' } }));
  const e = ev({ cat: 'med', v: med }, { metaCfg: m });
  const f = finding(e, 'COH-002');
  assert.ok(f);
  assert.match(f.resultado, /Concentración|Principio activo/);
});

test('coherencia: la marca que no aparece en un campo se marca (COH-001)', () => {
  const m = metaWith('med', c => ({ md: { ...c.md, tpl: 'Venta en línea de {principio}' } }));
  const e = ev({ cat: 'med', v: med }, { metaCfg: m });
  const f = finding(e, 'COH-001');
  assert.ok(f);
  assert.match(f.resultado, /meta description/);
});

test('coherencia: receta declarada contra la meta description (COH-006)', () => {
  const m = metaWith('med', c => ({ md: { ...c.md, tpl: 'El {marca} {receta_txt}' } }));
  assert.equal(rule(ev({ cat: 'med', v: med }, { metaCfg: m }), 'COH-006').estado, 'cumple');
  const sinToken = metaWith('med', c => ({ md: { ...c.md, tpl: 'El {marca} de {concentracion}' } }));
  assert.equal(rule(ev({ cat: 'med', v: med }, { metaCfg: sinToken }), 'COH-006').estado, 'no_aplica');
});

test('coherencia: meta title idéntico a la meta description (COH-003)', () => {
  const m = metaWith('med', c => ({ md: { ...c.md, tpl: c.mt.tpl, sep: c.mt.sep } }));
  const e = ev({ cat: 'med', v: med }, { metaCfg: m });
  assert.equal(rule(e, 'COH-003').estado, 'pendiente');
});

/* ---------- NO APLICA / sin imagen ---------- */
test('producto sin imagen: el alt es «No evaluable» y el score NO baja a 0', () => {
  const con = ev({ cat: 'med', v: med });
  const sin = ev({ cat: 'med', v: med, img: '' });
  assert.equal(sin.alt.estado, 'no_aplica');
  assert.equal(sin.alt.evaluable, false);
  assert.equal(sin.alt.score, null);
  assert.match(sin.alt.motivo, /No evaluable — no hay imagen\./);
  assert.match(rule(sin, 'ALT-001').resultado, /No evaluable — no hay imagen\./);
  assert.equal(rule(sin, 'ALT-001').posibles, 0);
  assert.ok(sin.score.total > 0);
  assert.equal(sin.score.total, con.score.total, 'sin imagen no se penaliza');
  assert.ok(sin.score.puntos.posibles < con.score.puntos.posibles, 'los puntos del alt no cuentan como posibles');
});

test('NO APLICA: reglas de otra categoría y de lote se excluyen de los puntos posibles', () => {
  const e = ev({ cat: 'med', v: med });
  assert.equal(rule(e, 'CON-013').estado, 'no_aplica');
  assert.match(rule(e, 'CON-013').resultado, /^No aplica — /);
  assert.equal(rule(e, 'CON-013').posibles, 0);
  const c = ev({ cat: 'cos', v: cos });
  assert.equal(rule(c, 'MT-007').estado, 'no_aplica', 'lenguaje comercial solo en medicamentos');
});

test('los cuatro estados existen: cumple, pendiente, error y no aplica', () => {
  const m = metaWith('med', c => ({ mt: { ...c.mt, tpl: '' } }));
  const e = ev({ cat: 'med', v: { ...med, laboratorio: '' }, img: '' }, { metaCfg: m });
  const estados = new Set([e.title, e.metaTitle, e.metaDescription, e.alt, e.content, e.consistency].flatMap(s => s.rules).map(r => r.estado));
  for (const s of ['cumple', 'pendiente', 'error', 'no_aplica']) assert.ok(estados.has(s), s);
  assert.deepEqual(S.SIMBOLO, { cumple: '✓', pendiente: '⚠', error: '❌', no_aplica: 'ℹ' });
});

/* ---------- confirmada vs provisional ---------- */
test('categoría confirmada (med) vs provisional (cos): la estructura pendiente deja el estado en «pendiente»', () => {
  const m = ev({ cat: 'med', v: med }), c = ev({ cat: 'cos', v: cos, sku: 'C' });
  assert.equal(m.context.confirmada, true);
  assert.equal(c.context.confirmada, false);
  assert.equal(rule(m, 'MT-002').estado, 'cumple');
  assert.equal(rule(c, 'MT-002').estado, 'pendiente');
  assert.equal(rule(c, 'MD-002').estado, 'pendiente');
  assert.ok(['pendiente', 'revisar'].includes(c.status));
  assert.equal(m.status, 'listo');
});

test('regla confirmada vs provisional: la provisional pesa la mitad', () => {
  const m = ev({ cat: 'med', v: med }), c = ev({ cat: 'cos', v: cos });
  const conf = rule(m, 'MT-003'), prov = rule(c, 'MT-003');
  assert.equal(conf.confirmacion, 'Confirmada');
  assert.equal(prov.confirmacion, 'Provisional');
  assert.equal(conf.posibles, 4);
  assert.equal(prov.posibles, 4 * S.PROVISIONAL_FACTOR);
  assert.equal(S.PROVISIONAL_FACTOR, 0.5);
  // reglas siempre provisionales (propuestas de coherencia) pesan la mitad aunque la categoría esté confirmada
  assert.equal(rule(m, 'COH-001').confirmacion, 'Provisional');
  assert.equal(rule(m, 'COH-001').posibles, 1.5);
  assert.equal(rule(m, 'COH-003').confirmacion, 'Confirmada');
});

test('una regla provisional nunca produce un error duro (se degrada a aviso)', () => {
  const r = S.RULES.find(x => x.id === 'COH-006');
  assert.equal(r.severidad, 'error');
  const m = metaWith('med', c => ({ confirmed: false, md: { ...c.md, tpl: 'El {marca} {receta_txt}' } }));
  const e = ev({ cat: 'med', v: { ...med, receta: 'no' } }, { metaCfg: m });
  assert.equal(rule(e, 'COH-006').estado, 'cumple');
  const sev = S.evaluate({ cat: 'med', v: med, sku: 'S' }, { keep, metaCfg: metaWith('med', c => ({ confirmed: false })) });
  assert.ok(sev.findings.every(f => f.confirmada || f.severidadEfectiva !== 'error'));
});

test('estructuras no confirmadas conservan el comportamiento actual de la aplicación', () => {
  const cfg = F.defMeta();
  assert.equal(cfg.cats.med.confirmed, true);
  for (const id of Object.keys(F.CATS).filter(x => x !== 'med')) assert.equal(cfg.cats[id].confirmed, false, id);
  const r = F.computeFor('cos', cos, keep, cfg);
  const batch = F.magentoBatch([{ cat: 'cos', v: cos, sku: 'C1', img: '', ai: {} }], keep, cfg, { attr: 'categoria_prod', incFaltantes: true });
  assert.equal(batch.excluded.sinMeta, 1, 'sin confirmar, las metas no se exportan');
  const idx = F.MAG_IDX;
  assert.equal(batch.rows[0][idx.meta_title], '');
  assert.equal(batch.rows[0][idx.meta_description], '');
  assert.ok(r.meta.mt.text, 'la meta se sigue calculando para la vista previa');
});

/* ---------- score ---------- */
test('score: cada punto se rastrea a una regla y la fórmula cuadra', () => {
  const e = ev({ cat: 'med', v: { ...med, laboratorio: 'Laboratorio ideal' }, img: '' });
  const rules = [e.title, e.metaTitle, e.metaDescription, e.alt, e.content, e.consistency].flatMap(s => s.rules);
  const posibles = rules.reduce((a, r) => a + r.posibles, 0), obtenidos = rules.reduce((a, r) => a + r.obtenidos, 0);
  assert.ok(Math.abs(posibles - e.score.puntos.posibles) < 0.011);
  assert.ok(Math.abs(obtenidos - e.score.puntos.obtenidos) < 0.011);
  assert.equal(e.score.total, Math.round(100 * e.score.puntos.obtenidos / e.score.puntos.posibles));
  // por componente
  for (const k of ['title', 'metaTitle', 'metaDescription', 'alt', 'content', 'consistency']) {
    const s = e[k];
    assert.ok(Math.abs(s.rules.reduce((a, r) => a + r.posibles, 0) - s.posibles) < 0.011, k);
    assert.equal(e.score.componentes[k].posibles, s.posibles);
  }
  // pérdidas por severidad: aviso 50%, error 100%
  const aviso = rule(e, 'CON-011');
  assert.equal(aviso.perdidos, aviso.posibles * 0.5);
  assert.deepEqual(S.SEVERITY_LOSS, { error: 1, warning: 0.5, info: 0 });
});

test('score: los pesos de las reglas suman el máximo de cada componente (100 en total)', () => {
  const sums = {};
  S.RULES.filter(r => r.evaluar).forEach(r => { sums[r.componente] = (sums[r.componente] || 0) + r.peso; });
  for (const [k, c] of Object.entries(S.COMPONENTS)) assert.equal(sums[k] || 0, c.max, k);
  assert.equal(Object.entries(S.COMPONENTS).reduce((a, [, c]) => a + c.max, 0), 100);
});

test('score: un error baja el score y un producto sin fallas llega a 100', () => {
  const bueno = ev({ cat: 'med', v: med }), malo = ev({ cat: 'med', v: { ...med, laboratorio: 'Lab que cura todo' } });
  assert.equal(bueno.score.total, 100);
  assert.ok(malo.score.total < bueno.score.total);
});

test('«¿Por qué obtuve este score?»: puntos obtenidos y posibles, reglas incumplidas, severidad y acción', () => {
  const e = ev({ cat: 'med', v: { ...med, laboratorio: 'Laboratorio ideal' } });
  const x = S.explainScore(e);
  assert.equal(x.total, e.score.total);
  assert.deepEqual(x.puntos, e.score.puntos);
  assert.equal(x.componentes.length, 6);
  assert.ok(x.formula.includes('Σ'));
  const inc = x.incumplidas.find(i => i.id === 'CON-011');
  assert.ok(inc);
  for (const k of ['id', 'regla', 'severidad', 'obtenidos', 'posibles', 'accion', 'confirmacion']) assert.ok(k in inc, k);
  assert.ok(inc.accion.length > 0);
});

/* ---------- recomendaciones ---------- */
test('recomendaciones: derivadas de reglas incumplidas, ordenadas por prioridad y sin puntuar', () => {
  const e = ev({ cat: 'med', v: { ...med, laboratorio: 'Lab que cura todo y es ideal' } });
  assert.ok(e.recommendations.length >= 2);
  assert.equal(e.recommendations[0].prioridad, 1, 'primero los errores');
  const prios = e.recommendations.map(r => r.prioridad);
  assert.deepEqual(prios, [...prios].sort((a, b) => a - b));
  e.recommendations.forEach(r => { assert.ok(S.ruleById(r.reglaId)); assert.ok(r.texto); });
  assert.equal(ev({ cat: 'med', v: med }).recommendations.length, 0);
  const prov = ev({ cat: 'cos', v: cos });
  assert.ok(prov.recommendations.some(r => /provisional/.test(r.texto)) || prov.recommendations.length > 0);
});

/* ---------- lote ---------- */
test('lote: promedio, mínimo, máximo y filtros por estado', () => {
  const items = [
    { cat: 'med', v: med, sku: 'A', img: IMG }, { cat: 'med', v: { ...med, marca: 'OTRO', laboratorio: 'Lab que cura' }, sku: 'B', img: IMG },
    { cat: 'cos', v: cos, sku: 'C', img: IMG }, { cat: 'med', v: {}, sku: 'D' }
  ];
  const out = S.evaluateBatch(items, { keep, metaCfg: F.defMeta() });
  const s = out.summary;
  assert.equal(s.total, 4);
  assert.equal(s.evaluados, 3);
  assert.equal(s.byStatus.sin_evaluar, 1);
  assert.equal(s.byStatus.critico, 1);
  assert.ok(s.min <= s.average && s.average <= s.max);
  assert.equal(S.filterKey(out.items[3]), 'sin_evaluar');
  assert.equal(S.filterKey(out.items[1]), 'critico');
  assert.equal(Object.values(s.byStatus).reduce((a, b) => a + b, 0), 4);
});

/* ---------- Fase 10: contrato 360 sin Global Score ---------- */
test('Score 360: expone SEO, Health, Contenido y Magento y NO calcula Global Score', () => {
  const e = ev({ cat: 'med', v: med });
  const s = S.score360(e, { health: { score: 88, band: 'buena' } });
  assert.equal(s.seo.score, e.score.total);
  assert.equal(s.health.score, 88);
  assert.equal(s.content.score, e.content.score);
  assert.equal(s.magento.exportable, true);
  assert.equal(s.global, null);
  assert.ok(!('globalScore' in s));
  const bloq = S.score360(ev({ cat: 'med', v: { ...med, receta: '' } }));
  assert.equal(bloq.magento.exportable, false);
});

/* ---------- integridad del registro e inventario ---------- */
test('registro: IDs únicos, campos completos y las 15 clases del inventario', () => {
  const ids = S.RULES.map(r => r.id);
  assert.equal(new Set(ids).size, ids.length);
  const need = ['id', 'descripcion', 'fuente', 'origen', 'categorias', 'campo', 'tipo', 'severidad', 'accion', 'confirmacion', 'efecto', 'clase', 'componente'];
  S.RULES.forEach(r => need.forEach(k => assert.ok(r[k] !== undefined && r[k] !== '' , `${r.id}.${k}`)));
  S.RULES.forEach(r => {
    assert.ok(['error', 'warning', 'info'].includes(r.severidad), r.id);
    assert.ok(['bloquea', 'avisa', 'corrige', 'documenta'].includes(r.efecto), r.id);
    assert.ok(['confirmada', 'provisional', 'por-categoria'].includes(r.confirmacion), r.id);
    assert.ok(['existente', 'tecnica'].includes(r.tipo), r.id);
    assert.ok(S.CLASES[r.clase], `${r.id} clase ${r.clase}`);
  });
  const clases = new Set(S.RULES.map(r => r.clase));
  assert.equal(Object.keys(S.CLASES).length, 15);
  Object.keys(S.CLASES).forEach(k => assert.ok(clases.has(k), `ninguna regla en la clase ${k}`));
});

test('registro: los orígenes coinciden con los del documento de reglas (rules.js)', () => {
  for (const k of ['pTit', 'pMc', 'pMg', 'seo', 'batch', 'nom', 'herr', 'reg']) assert.equal(S.ORIGEN[k], Rules.SRC[k], k);
});

test('reglas existentes confirmadas se conservan exactamente (límites, plantillas, listas)', () => {
  assert.equal(F.META_MED.mt.max, 60);
  assert.equal(F.META_MED.md.max, 155);
  assert.equal(F.defMetaCat('med').alt.max, 125);
  assert.equal(F.META_MED.mt.tpl, 'Comprar {marca} {concentracion}\n{principio}\n{laboratorio}');
  assert.equal(F.META_MED.mt.sep, ' | ');
  assert.equal(F.META_GEN.mt.tpl, '{seg1}\n{seg2}\n{tienda}');
  assert.equal(F.ALT_DEF.med, '{marca} {concentracion}\n{principio}\n{contenido:lc}');
  assert.equal(F.TITLE_MAX, 150);
  assert.ok(F.ALT_BAD_START_RE.test('Imagen de algo') && F.ALT_BAD_START_RE.test('foto de algo') && !F.ALT_BAD_START_RE.test('Caja de algo'));
  assert.equal(F.RED.length, 22);
  assert.equal(F.COS_CLAIM.length, 4);
  assert.deepEqual(F.scanRed('Este producto cura y es ideal', 'med'), ['cura', 'ideal']);
});

test('seo.js consume las reglas existentes: no duplica plantillas ni listas de términos', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'seo.js'), 'utf8');
  assert.match(src, /F\.computeFor/);
  assert.match(src, /F\.scanRed/);
  assert.match(src, /F\.lint/);
  assert.match(src, /F\.COMERCIAL_RE/);
  assert.match(src, /F\.ALT_BAD_START_RE/);
  assert.doesNotMatch(src, /Comprar \{marca\}/, 'no copia las plantillas de la agencia');
  assert.doesNotMatch(src, /const (RED|AMBER|COS_CLAIM|COS_MED|COMERCIAL_RE)\s*=/, 'no copia las listas de términos');
  assert.doesNotMatch(src, /'(claim|vacio)'\]/, 'no copia las entradas de la lista de claims');
});

test('no usa factores de posicionamiento externos', () => {
  const texto = JSON.stringify(S.RULES.map(r => [r.descripcion, r.explicacion, r.accion])).toLowerCase();
  // el aviso de la UI los menciona para decir que NO se usan; las reglas no deben apoyarse en ellos
  for (const t of ['volumen de búsqueda', 'ctr', 'ranking', 'autoridad de dominio', 'competencia', 'probabilidad de posicion', 'keyword score']) assert.ok(!texto.includes(t), t);
});

test('regla técnica de higiene: espacios, separadores y marcadores', () => {
  assert.deepEqual(S.hygiene('Texto limpio | otro'), []);
  assert.ok(S.hygiene('Doble  espacio').includes('espacios dobles'));
  assert.ok(S.hygiene('Marca {marca}').includes('marcador sin resolver'));
  assert.ok(S.hygiene('Texto | | otro').includes('separadores repetidos'));
  assert.ok(S.hygiene('Palabra palabra').includes('palabra repetida consecutivamente'));
  assert.ok(S.hygiene('Valor undefined').some(x => /undefined/.test(x)));
  assert.deepEqual(S.htmlProblems('<h2>A</h2>\n<ul>\n  <li>x</li>\n</ul>'), []);
  assert.ok(S.htmlProblems('<ul><li>x</ul>').length > 0);
  assert.ok(S.htmlProblems('<p></p>').includes('etiqueta vacía'));
});

test('las 7 categorías con datos completos se evalúan sin excepciones y con score', () => {
  const EX = {
    med: med, cos: cos,
    dis: { marca: 'Marca Ejemplo', modelo: 'MOD-100', tipo: 'Baumanómetro digital', tecnologia: 'Automático de brazo', fabricante: 'Fabricante Ejemplo' },
    sup: { marca: 'Marca Ejemplo', componente: 'Vitamina C', forma: 'Cápsulas', contenido: 'Frasco con 100 piezas', fabricante: 'Fabricante Ejemplo' },
    beb: { marca: 'Marca Ejemplo', tipo: 'Suero oral', sabor: 'Coco', atributo: 'Sin azúcar', contenido: '625 mL' },
    hig: { marca: 'Marca Ejemplo', producto: 'Pasta dental', variante: 'Salud bucal completa', contenido: 'Crema 150 mL', fabricante: 'Fabricante Ejemplo' },
    acc: { marca: 'Marca Ejemplo', producto: 'Parches térmicos', material: 'Alivio de dolores', contenido: 'Caja con 3 piezas', fabricante: 'Fabricante Ejemplo' }
  };
  for (const [cat, v] of Object.entries(EX)) {
    const e = ev({ cat, v });
    assert.equal(typeof e.score.total, 'number', cat);
    assert.ok(e.score.total >= 0 && e.score.total <= 100, cat);
    assert.equal(rule(e, 'CON-004').estado, 'cumple', `${cat}: HTML y MC sin defectos de formato`);
    assert.equal(rule(e, 'COH-001').estado, 'cumple', `${cat}: marca en todos los textos`);
  }
});

test('documentación: PHASE_8_SEO_ENGINE.md contiene todas las reglas del registro', () => {
  const doc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'phases', 'PHASE_8_SEO_ENGINE.md'), 'utf8');
  S.RULES.forEach(r => assert.ok(doc.includes(`| ${r.id} |`), `falta ${r.id} en el documento`));
  for (const t of ['Confirmada', 'Provisional', 'No aplica', 'SEO Score', 'Limitaciones', 'Recomendación']) assert.ok(doc.includes(t), t);
});
