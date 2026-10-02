'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../logic.js');
const Q = require('../quality.js');

const keep = new Set(['gnc', 'omron', 'gsk']);
const meta = F.defMeta();
const med = { marca: 'Mounjaro', concentracion: '2.5 mg', volumen: '0.6 mL', principio: 'Tirzepatida', forma: 'Solución inyectable', contenido: 'Caja con 4 plumas', laboratorio: 'Eli Lilly', via: 'Subcutánea', receta: 'si' };

test('calidad: registro válido queda listo y conserva procedencia', () => {
  const r = Q.audit('med', med, { source: 'rules', evidenceMap: { marca: 'texto SKU' } });
  assert.equal(r.status, 'listo');
  assert.equal(r.counts.error, 0);
  assert.equal(r.provenance.marca.source, 'rules');
  assert.equal(r.provenance.marca.evidence, 'texto SKU');
  assert.deepEqual(r.quarantined.fields, []);
});

test('calidad: faltantes, claims y texto sin asignar quedan separados por severidad', () => {
  const r = Q.audit('cos', { marca: 'CeraVe', producto: '', tipo: '', comercial: 'El mejor producto, cura todo' }, { leftover: ['XYZ'] });
  assert.equal(r.status, 'critico');
  assert.ok(r.issues.some(x => x.code === 'required-missing'));
  assert.ok(r.issues.some(x => x.code === 'language-claim'));
  assert.ok(r.issues.some(x => x.code === 'unassigned-text'));
});

test('calidad: valores peligrosos se ponen en cuarentena sin perder el original', () => {
  const r = Q.audit('cos', { marca: 'X', fps: '-50', nivel: 'Alta' });
  assert.ok(r.issues.some(x => x.code === 'negative-number'));
  assert.equal(r.quarantined.kept.fps, undefined);
  assert.equal(r.quarantined.original.fps, '-50');
  assert.deepEqual(r.quarantined.fields, ['fps']);
});

test('calidad: opción inválida se rechaza y se puede resumir un lote', () => {
  const a = Q.audit('med', { ...med, receta: 'quizá' });
  const b = Q.audit('med', { ...med, principio: '' });
  assert.ok(a.issues.some(x => x.code === 'invalid-option'));
  const s = Q.summarize([a, b]);
  assert.equal(s.total, 2);
  assert.equal(s.critico, 2);
  assert.ok(s.errors >= 2);
});
