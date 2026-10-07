const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../js/logic.js');
const Q = require('../js/quality.js');
const A = require('../js/anomalies.js');

test('procedencia: deriva origen determinista de los indicadores de IA', () => {
  const item = { v: { marca:'Acme', producto:'X', tipo:'Crema' }, ai: { marca:'sugerido', producto:'imagen', tipo:'extraido' } };
  assert.deepEqual(A.sourceMapFor(item), { marca:'ai', producto:'vision', tipo:'ai' });
  const p = A.provenanceFor(item);
  assert.equal(p.marca.source, 'ai');
  assert.equal(p.producto.source, 'vision');
});

test('procedencia: conserva evidencia y actualiza timestamp cuando cambia el valor', () => {
  const old = { marca:{ source:'manual', evidence:'CSV fila 4', original:' ACME ', normalized:'ACME', updatedAt:'2026-01-01T00:00:00.000Z' } };
  const item = { v:{ marca:'Acme' }, ai:{} };
  const p = A.provenanceFor(item, old);
  assert.equal(p.marca.evidence, 'CSV fila 4');
  assert.equal(p.marca.original, ' ACME ');
  assert.notEqual(p.marca.updatedAt, old.marca.updatedAt);
});

test('anomalías: detecta SKU y título duplicados sin modificar el lote', () => {
  const items = [
    { sku:'ABC-01', cat:'med', v:{ marca:'Acme', producto:'Producto', principio:'X', receta:'no' }, ai:{} },
    { sku:' abc01 ', cat:'med', v:{ marca:'Acme', producto:'Producto', principio:'X', receta:'no' }, ai:{} }
  ];
  const evals = items.map(x => ({ res:F.computeFor(x.cat,x.v,new Set(),F.defMeta()), quality:Q.audit(x.cat,x.v) }));
  const a = A.detectBatch(items, evals);
  assert.ok(a.some(x => x.type === 'duplicate-sku' && x.severity === 'error'));
  assert.ok(a.some(x => x.type === 'duplicate-title'));
  assert.equal(items[0].sku, 'ABC-01');
});

test('anomalías: identifica texto sin asignar y campos desconocidos', () => {
  const items = [{ sku:'X', cat:'med', v:{ marca:'Acme', campo_inventado:'x' }, note:'texto no asignado', ai:{} }];
  const evals = items.map(x => ({ res:F.computeFor(x.cat,x.v,new Set(),F.defMeta()), quality:Q.audit(x.cat,x.v,{leftover:x.note.split(' ')}) }));
  const a = A.detectBatch(items, evals);
  assert.ok(a.some(x => x.type === 'unknown-fields'));
  assert.ok(a.some(x => x.type === 'unassigned-data'));
});
