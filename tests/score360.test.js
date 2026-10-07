'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const F = require('../js/logic');
const Q = require('../js/quality');
const Cn = require('../js/canonical');
const H = require('../js/health');
const SEO = require('../js/seo');
const C = require('../js/content');
const M = require('../js/magento-readiness');
const S = require('../js/score360');

const meta = F.defMeta(), keep = new Set();
const med = { marca: 'Lamobrigan', principio: 'Lamotrigina', concentracion: '100 mg', forma: 'Tableta', contenido: 'Caja con 28 tabletas', laboratorio: 'Pisa', via: 'Oral', receta: 'si' };

function full(item, exp) {
  const res = F.computeFor(item.cat, item.v, keep, meta);
  const quality = Q.audit(item.cat, item.v, {});
  const canonical = Cn.canonicalize(item, res, quality, {}, []);
  const health = Object.assign({}, H.scoreReport(quality, canonical), { issues: quality.issues });
  const seo = SEO.evaluate(item, { keep, metaCfg: meta, res });
  const content = C.evaluate(item, { keep, metaCfg: meta, res });
  const magento = M.evaluate(item, { keep, metaCfg: meta, res, exp });
  return { parts: { health, seo, content, magento }, r: S.compute({ health, seo, content, magento }, { F, cat: item.cat }) };
}
const fake = (h, s, c, m, state) => ({
  health: { score: h, band: S.bandOf(h) }, seo: { score: { total: s }, status: 'listo' },
  content: { score: { total: c }, status: 'listo' }, magento: { score: m, state: state || 'READY', stateLabel: 'x', recommendations: [] }
});

test('360: contrato fichas.score360.v1 con health, seo, content, magento, global y recommendations', () => {
  const { r } = full({ sku: 'A1', cat: 'med', v: med, img: 'a.jpg' });
  assert.equal(r.schema, 'fichas.score360.v1');
  for (const k of ['health', 'seo', 'content', 'magento', 'global', 'recommendations']) assert.ok(k in r, k);
  assert.equal(r.global.score, 100);
  assert.equal(r.global.band, 'excelente');
});

test('360: pesos explícitos 30/25/25/20, suman 100 y son inmutables', () => {
  assert.deepEqual({ ...S.WEIGHTS }, { health: 30, seo: 25, content: 25, magento: 20 });
  assert.equal(S.checkWeights().ok, true);
  assert.equal(Object.isFrozen(S.WEIGHTS), true);
  assert.equal(S.checkWeights({ health: 30, seo: 25, content: 25, magento: 25 }).ok, false);
  assert.throws(() => { 'use strict'; S.WEIGHTS.health = 99; });
});

test('360: los pesos son coherentes con los contratos: cada motor entrega un entero 0–100', () => {
  const { parts } = full({ sku: 'A1', cat: 'med', v: { ...med, via: 'Subcutánea' }, img: 'a.jpg' });
  for (const v of [parts.health.score, parts.seo.score.total, parts.content.score.total, parts.magento.score]) {
    assert.ok(Number.isInteger(v) && v >= 0 && v <= 100);
  }
});

test('360: cálculo = round(Σ valor × peso ÷ 100)', () => {
  const r = S.compute(fake(80, 60, 40, 90));
  assert.equal(r.global.score, Math.round((80 * 30 + 60 * 25 + 40 * 25 + 90 * 20) / 100));
  assert.equal(r.global.score, 67);
  assert.equal(r.global.parcial, false);
});

test('360: desglose con valor, peso y aporte que suman el global', () => {
  const r = S.compute(fake(80, 60, 40, 90));
  assert.deepEqual(r.global.desglose.map(d => [d.eje, d.valor, d.peso, d.aporte]), [['health', 80, 30, 24], ['seo', 60, 25, 15], ['content', 40, 25, 10], ['magento', 90, 20, 18]]);
  assert.equal(r.global.desglose.reduce((a, d) => a + d.aporte, 0), 67);
});

test('360: explicación menciona los cuatro ejes con valor, peso y aporte', () => {
  const r = S.compute(fake(80, 60, 40, 90));
  assert.match(r.global.explain, /Score 360°: 67\/100/);
  for (const t of ['Health 80 × 30 % = 24', 'SEO 60 × 25 % = 15', 'Contenido 40 × 25 % = 10', 'Magento 90 × 20 % = 18']) assert.ok(r.global.explain.includes(t), t);
  assert.match(r.global.formula, /Σ valor × peso/);
});

test('360: Magento BLOCKED tiene prioridad aunque el score diagnóstico sea alto', () => {
  const r = S.compute(fake(100, 100, 100, 82, 'BLOCKED'));
  assert.equal(r.magento.estado, 'BLOCKED');
  assert.equal(r.magento.score, 82);
  assert.equal(r.global.blocked, true);
  assert.equal(r.global.band, 'bloqueado');
  assert.match(r.global.explain, /BLOQUEADO/);
  assert.equal(S.isCritical360(r), false, 'bloqueado no es lo mismo que crítico');
});

test('360: un score 360 alto nunca desbloquea a Magento (el estado viene del motor)', () => {
  const { parts, r } = full({ cat: 'med', v: med, img: 'a.jpg' });
  assert.equal(parts.magento.state, 'BLOCKED');
  assert.equal(r.magento.estado, 'BLOCKED');
  assert.ok(r.global.score >= 70);
  assert.equal(r.global.band, 'bloqueado');
});

test('360: bandas y filtro 360 crítico', () => {
  assert.equal(S.compute(fake(40, 40, 40, 40)).global.band, 'critica');
  assert.equal(S.isCritical360(S.compute(fake(40, 40, 40, 40))), true);
  assert.equal(S.compute(fake(95, 95, 95, 95)).global.band, 'excelente');
  assert.equal(S.compute(fake(80, 80, 80, 80)).global.band, 'buena');
  assert.equal(S.compute(fake(60, 60, 60, 60)).global.band, 'revisar');
});

test('360: un eje sin score se excluye, se reparten los pesos y el resultado es parcial', () => {
  const r = S.compute({ health: { score: 80, band: 'buena' }, seo: { score: { total: null }, status: 'sin_evaluar' }, content: { score: { total: 60 } }, magento: { score: 100, state: 'READY' } });
  assert.equal(r.seo.disponible, false);
  assert.equal(r.global.parcial, true);
  assert.deepEqual(r.global.ejesSinScore, ['seo']);
  assert.equal(r.global.score, Math.round((80 * 30 + 60 * 25 + 100 * 20) / 75));
  assert.equal(S.compute({}).global.score, null);
});

test('360: no vuelve a validar. Usa solo los resultados que recibe', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'score360.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/require\(|computeFor|magentoBatch|\.lint\(|\.audit\(/.test(src), false);
  const r = S.compute(fake(10, 20, 30, 40));
  assert.equal(r.health.score, 10);
  assert.equal(r.seo.score, 20);
});

test('360: recomendaciones ordenadas bloqueos > errores > contradicciones > faltantes > SEO > contenido > mejoras', () => {
  const { r } = full({ sku: 'Z', cat: 'med', v: { marca: 'X', principio: '', concentracion: '10 mg', forma: 'Tableta', contenido: 'TAB', laboratorio: 'N/A', via: 'Subcutánea', receta: 'no', leyenda: 'Cura todo y es el mejor. Requiere receta' } });
  assert.ok(r.recommendations.length > 3);
  const pr = r.recommendations.map(x => x.prioridad);
  assert.deepEqual(pr, pr.slice().sort((a, b) => a - b));
  assert.equal(r.recommendations[0].clase, 'bloqueo');
  r.recommendations.forEach((x, i) => assert.equal(x.orden, i + 1));
  const clases = r.recommendations.map(x => x.clase);
  assert.ok(clases.indexOf('contradiccion') > clases.indexOf('error'));
  assert.ok(clases.indexOf('faltante') > clases.indexOf('contradiccion'));
});

test('360: las recomendaciones no se duplican entre motores', () => {
  const { r } = full({ cat: 'med', v: { ...med, receta: '' } });
  const textos = r.recommendations.map(x => x.texto.toLowerCase());
  assert.equal(new Set(textos).size, textos.length);
  const bloqueoHtml = r.recommendations.filter(x => x.fuentes.includes('magento') && x.reglaIds.includes('MR-002'));
  assert.equal(bloqueoHtml.length, 1);
  assert.ok(bloqueoHtml[0].fuentes.length > 1, 'la misma causa señalada por varios motores se fusiona');
});

test('360: sin hallazgos no hay recomendaciones', () => {
  assert.deepEqual(full({ sku: 'A1', cat: 'med', v: med, img: 'a.jpg' }).r.recommendations, []);
});

test('360: lote con promedios por eje, estados Magento y bandas', () => {
  const list = [S.compute(fake(100, 100, 100, 100)), S.compute(fake(40, 40, 40, 40)), S.compute(fake(100, 100, 100, 82, 'BLOCKED')), null];
  const s = S.summarize(list);
  assert.equal(s.total, 3);
  assert.equal(s.health, 80);
  assert.equal(s.blocked, 1);
  assert.equal(s.ready, 2);
  assert.equal(s.bands.critica, 1);
  assert.equal(s.bands.bloqueado, 1);
  assert.equal(s.average, Math.round((100 + 40 + Math.round((100 * 30 + 100 * 25 + 100 * 25 + 82 * 20) / 100)) / 3));
});

test('360: persistencia. Snapshot con contrato y máximo 100 entradas, sin mutar el original', () => {
  const snap = S.snapshot([S.compute(fake(80, 80, 80, 80))], 'prueba');
  assert.equal(snap.schema, 'fichas.score360.v1');
  assert.equal(snap.context, 'prueba');
  let hist = [];
  const base = Array.from({ length: 100 }, (_, i) => ({ i }));
  const out = S.appendHistory(base, { i: 100 }, 500);
  assert.equal(out.length, 100);
  assert.equal(out[99].i, 100);
  assert.equal(base.length, 100);
  for (let i = 0; i < 150; i++) hist = S.appendHistory(hist, { i });
  assert.equal(hist.length, 100);
  assert.equal(JSON.stringify(snap).includes('"v"'), false, 'el snapshot no guarda datos del producto');
});

test('360: recalcular desde los mismos datos da el mismo resultado', () => {
  const it = { sku: 'A1', cat: 'med', v: { ...med, via: 'Subcutánea' }, img: 'a.jpg' };
  assert.deepEqual(full(it).r, full(it).r);
});

test('360: no cambia los contratos existentes (SEO, Health y Magento siguen igual)', () => {
  assert.equal(SEO.SCHEMA, 'fichas.seo.v1');
  assert.equal(H.SCHEMA, 'fichas.quality.v1');
  assert.equal(F.MAG_HEADER.length, 104);
  assert.equal(M.SCHEMA, 'fichas.magento.readiness.v1');
});
