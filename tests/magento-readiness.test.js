'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../js/logic');
const M = require('../js/magento-readiness');

const meta = F.defMeta();
const keep = new Set();
const med = { marca: 'Lamobrigan', principio: 'Lamotrigina', concentracion: '100 mg', forma: 'Tableta', contenido: 'Caja con 28 tabletas', laboratorio: 'Pisa', via: 'Oral', receta: 'si' };
const ev = (item, extra) => M.evaluate(item, Object.assign({ keep, metaCfg: meta }, extra || {}));
const check = (r, id) => r.checks.find(c => c.id === id);

test('readiness: contrato fichas.magento.readiness.v1 y estados válidos', () => {
  const r = ev({ sku: 'A1', cat: 'med', v: med, img: 'a.jpg' });
  assert.equal(r.schema, 'fichas.magento.readiness.v1');
  assert.ok(Object.keys(M.STATES).every(s => ['READY', 'READY_WITH_WARNINGS', 'BLOCKED'].includes(s)));
  assert.ok(Array.isArray(r.blockers) && Array.isArray(r.warnings) && Array.isArray(r.checks));
});

test('readiness: READY cuando se exporta sin nada que advertir', () => {
  const r = ev({ sku: 'A1', cat: 'med', v: med, img: 'a.jpg' });
  assert.equal(r.state, 'READY');
  assert.equal(r.ready, true);
  assert.equal(r.exportable, true);
  assert.equal(r.score, 100);
  assert.deepEqual(r.pendientes, []);
});

test('readiness: READY_WITH_WARNINGS cuando se exporta con datos pendientes', () => {
  const r = ev({ sku: 'A2', cat: 'med', v: med });
  assert.equal(r.state, 'READY_WITH_WARNINGS');
  assert.equal(r.exportable, true);
  assert.equal(check(r, 'MR-012').estado, 'advertencia');
  assert.ok(r.pendientes.includes('base_image'));
});

test('readiness: estructura de meta sin confirmar es advertencia y deja las columnas vacías', () => {
  const r = ev({ sku: 'D1', cat: 'dis', v: { marca: 'Omron', modelo: 'M3', tipo: 'Baumanómetro', tecnologia: 'Digital', fabricante: 'Omron' }, img: 'x.jpg' });
  assert.equal(r.state, 'READY_WITH_WARNINGS');
  assert.equal(check(r, 'MR-010').estado, 'advertencia');
  assert.ok(r.pendientes.includes('meta_title') && r.pendientes.includes('short_description'));
});

test('readiness: BLOCKED sin SKU', () => {
  const r = ev({ cat: 'med', v: med, img: 'a.jpg' });
  assert.equal(r.state, 'BLOCKED');
  assert.equal(r.exportable, false);
  assert.equal(check(r, 'MR-001').estado, 'bloqueo');
});

test('readiness: BLOCKED con datos regulatorios incompletos (receta o principio activo)', () => {
  const a = ev({ sku: 'B1', cat: 'med', v: { ...med, receta: '' }, img: 'a.jpg' });
  assert.equal(a.state, 'BLOCKED');
  assert.deepEqual(check(a, 'MR-002').datos.campos, ['receta']);
  const b = ev({ sku: 'B2', cat: 'med', v: { ...med, principio: '' }, img: 'a.jpg' });
  assert.equal(check(b, 'MR-002').estado, 'bloqueo');
});

test('readiness: datos faltantes del título bloquean salvo que la exportación los incluya', () => {
  const it = { sku: 'C1', cat: 'med', v: { ...med, marca: '' }, img: 'a.jpg' };
  assert.equal(ev(it).state, 'BLOCKED');
  assert.equal(ev(it, { exp: { incFaltantes: true } }).state, 'READY_WITH_WARNINGS');
});

test('readiness: datos de IA sin confirmar bloquean salvo que la exportación los incluya', () => {
  const it = { sku: 'C2', cat: 'med', v: med, img: 'a.jpg', ai: { marca: 'sugerido' } };
  assert.equal(ev(it).state, 'BLOCKED');
  assert.equal(ev(it, { exp: { incIA: true } }).state, 'READY_WITH_WARNINGS');
});

test('readiness: el lenguaje solo bloquea si la exportación lo excluye', () => {
  const it = { sku: 'C3', cat: 'med', v: { ...med, leyenda: 'Es el mejor y cura todo.' }, img: 'a.jpg' };
  assert.equal(ev(it).state, 'READY_WITH_WARNINGS');
  assert.equal(ev(it, { exp: { excLenguaje: true } }).state, 'BLOCKED');
});

test('readiness: valida las 104 columnas del contrato real', () => {
  const r = ev({ sku: 'A1', cat: 'med', v: med, img: 'a.jpg' });
  assert.equal(F.MAG_HEADER.length, 104);
  assert.equal(r.contract.columnas, 104);
  assert.equal(r.contract.columnasFila, 104);
  assert.equal(check(r, 'MR-006').estado, 'cumple');
});

test('readiness: si el contrato Magento falla, BLOCKED aunque el score diagnóstico sea alto', () => {
  const orig = F.magentoBatch;
  F.magentoBatch = (items, k, m, o) => { const ex = orig(items, k, m, o); return Object.assign({}, ex, { rows: [ex.rows[0].slice(1)], contract: { ok: false, errors: ['Fila 2: tiene 103 columnas; se esperaban 104.'] } }); };
  try {
    const r = ev({ sku: 'A1', cat: 'med', v: med, img: 'a.jpg' });
    assert.equal(r.state, 'BLOCKED');
    assert.equal(check(r, 'MR-006').estado, 'bloqueo');
    assert.equal(r.contract.ok, false);
    assert.ok(r.blockers.length >= 1);
  } finally { F.magentoBatch = orig; }
});

test('readiness: si el exportador lanza una excepción, BLOCKED', () => {
  const orig = F.magentoBatch;
  F.magentoBatch = () => { throw new Error('fallo simulado'); };
  try {
    const r = ev({ sku: 'A1', cat: 'med', v: med, img: 'a.jpg' });
    assert.equal(r.state, 'BLOCKED');
    assert.match(check(r, 'MR-006').mensaje, /fallo simulado/);
  } finally { F.magentoBatch = orig; }
});

test('readiness: CSV que no se puede serializar o volver a leer bloquea', () => {
  const orig = F.batchCsv;
  F.batchCsv = () => { throw new Error('CSV inválido simulado'); };
  try {
    const r = ev({ sku: 'A1', cat: 'med', v: med, img: 'a.jpg' });
    assert.equal(r.state, 'BLOCKED');
    assert.equal(check(r, 'MR-007').estado, 'bloqueo');
  } finally { F.batchCsv = orig; }
  assert.equal(check(ev({ sku: 'A1', cat: 'med', v: med, img: 'a.jpg' }), 'MR-007').estado, 'cumple');
});

test('readiness: separadores. Comas y saltos de línea internos se normalizan y el CSV sigue válido', () => {
  const r = ev({ sku: 'A,7', cat: 'med', v: { ...med, marca: 'Mar,ca\nX' }, img: 'a.jpg' });
  assert.notEqual(r.state, 'BLOCKED');
  assert.equal(check(r, 'MR-008').estado, 'cumple');
  assert.equal(r.contract.ok, true);
});

test('readiness: errores de separadores del contrato bloquean', () => {
  const orig = F.magentoBatch;
  F.magentoBatch = (items, k, m, o) => Object.assign({}, orig(items, k, m, o), { contract: { ok: false, errors: ['Fila 2, name: contiene coma interna.'] } });
  try {
    const r = ev({ sku: 'A1', cat: 'med', v: med, img: 'a.jpg' });
    assert.equal(r.state, 'BLOCKED');
    assert.equal(check(r, 'MR-008').estado, 'bloqueo');
  } finally { F.magentoBatch = orig; }
});

test('readiness: HTML mal formado es advertencia', () => {
  const res = F.computeFor('med', med, keep, meta);
  res.mg.html += '<div>';
  const r = ev({ sku: 'A1', cat: 'med', v: med, img: 'a.jpg' }, { res });
  assert.equal(check(r, 'MR-009').estado, 'advertencia');
  assert.equal(r.state, 'READY_WITH_WARNINGS');
});

test('readiness: alt, imagen y alt largo', () => {
  const r = ev({ sku: 'A1', cat: 'med', v: med });
  assert.equal(check(r, 'MR-011').estado, 'cumple');
  assert.equal(check(r, 'MR-012').estado, 'advertencia');
});

test('readiness: score diagnóstico alto con BLOCKED sigue BLOCKED y un score inyectado se ignora', () => {
  const it = { sku: 'A1', cat: 'med', v: med, img: 'a.jpg', score: 100, state: 'READY' };
  const r = ev(it, { dup: { count: 2, isLast: false } });
  assert.equal(r.state, 'BLOCKED');
  assert.ok(r.score >= 70);
  const ok = ev({ sku: 'A9', cat: 'med', v: med, img: 'a.jpg', score: 0, state: 'BLOCKED' });
  assert.equal(ok.state, 'READY');
});

test('readiness: producto sin datos queda BLOCKED', () => {
  assert.equal(ev({ sku: 'X', cat: 'med', v: {} }).state, 'BLOCKED');
  assert.equal(ev({ sku: 'X', cat: 'no-existe', v: { a: '1' } }).state, 'BLOCKED');
});

test('readiness: lote. SKU repetido bloquea al anterior y advierte al último, igual que el exportador', () => {
  const items = [
    { sku: 'A1', cat: 'med', v: med, img: 'a.jpg' },
    { sku: 'a1', cat: 'med', v: med, img: 'b.jpg' },
    { sku: 'A2', cat: 'med', v: med }
  ];
  const b = M.evaluateBatch(items, { keep, metaCfg: meta });
  assert.equal(b.items[0].state, 'BLOCKED');
  assert.equal(check(b.items[0], 'MR-013').estado, 'bloqueo');
  assert.equal(b.items[1].state, 'READY_WITH_WARNINGS');
  assert.equal(b.items[2].state, 'READY_WITH_WARNINGS');
  assert.equal(b.summary.blocked, 1);
  assert.equal(b.summary.total, 3);
});

test('readiness: consistente con el exportador real. Se exportan exactamente los productos no bloqueados', () => {
  const items = [
    { sku: 'A1', cat: 'med', v: med, img: 'a.jpg' },
    { sku: 'A2', cat: 'med', v: med },
    { sku: '', cat: 'med', v: med },
    { sku: 'A4', cat: 'med', v: { ...med, receta: '' } },
    { sku: 'A5', cat: 'med', v: med, ai: { marca: 'sugerido' } },
    { sku: 'A6', cat: 'med', v: { ...med, marca: '' } },
    { sku: 'D1', cat: 'dis', v: { marca: 'Omron', modelo: 'M3', tipo: 'Baumanómetro', tecnologia: 'Digital', fabricante: 'Omron' } },
    { sku: 'a1', cat: 'med', v: med, img: 'b.jpg' }
  ];
  for (const exp of [{}, { incFaltantes: true, incIA: true }, { excLenguaje: true }]) {
    const real = F.magentoBatch(items, keep, meta, exp);
    const b = M.evaluateBatch(items, { keep, metaCfg: meta, exp });
    assert.equal(b.summary.exportables, real.rows.length, JSON.stringify(exp));
    assert.equal(b.summary.ready + b.summary.readyWithWarnings + b.summary.blocked, items.length);
  }
});

test('readiness: no modifica el producto ni depende de IA', () => {
  const it = { sku: 'A1', cat: 'med', v: { ...med }, img: 'a.jpg' };
  const before = JSON.stringify(it);
  ev(it);
  assert.equal(JSON.stringify(it), before);
  assert.match(M.FORMULA, /nunca el score/);
});
