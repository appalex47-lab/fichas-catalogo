'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../js/logic.js');
const B = require('../js/bulk.js');

const med = (id, v, over) => ({ id, sku: id.toUpperCase(), cat: 'med', v: { marca: 'X', principio: 'Omeprazol', concentracion: '20 mg', forma: 'Cápsulas', contenido: '14', laboratorio: 'Pisa', receta: 'no', ...v }, ...over });
const sup = (id, v) => ({ id, sku: id.toUpperCase(), cat: 'sup', v: { marca: 'Y', componente: 'Whey', forma: 'Polvo', contenido: '900 g', fabricante: 'GNC', ...v } });
const C = F.CATS;

test('masivo: el laboratorio se cambia en medicamentos (laboratorio) y suplementos (fabricante)', () => {
  const items = [med('a', {}), sup('b', {})];
  const p = B.preview(items, ['a', 'b'], 'laboratorio', 'Pisa', C);
  assert.deepEqual(p.map(r => [r.field, r.same]), [['laboratorio', true], ['fabricante', false]]);
  const u = B.apply(items, ['a', 'b'], 'laboratorio', 'Pisa', C);
  assert.equal(u.length, 1, 'el que ya tenía el valor no cambia');
  assert.equal(items[1].v.fabricante, 'Pisa');
  assert.equal(B.undo(items, u), 1);
  assert.equal(items[1].v.fabricante, 'GNC');
});

test('masivo: lo que la categoría no tiene se omite, y vía/receta solo existen en medicamentos', () => {
  const items = [med('a', { via: '' }), sup('b', {})];
  const p = B.preview(items, ['a', 'b'], 'via', 'Oral', C);
  assert.equal(p.find(r => r.id === 'b').na, true);
  B.apply(items, ['a', 'b'], 'via', 'Oral', C);
  assert.equal(items[0].v.via, 'Oral');
  assert.ok(!('via' in items[1].v));
  assert.ok(B.byKey('via').reg && B.byKey('receta').reg && !B.byKey('laboratorio').reg);
});

test('masivo: deshacer devuelve un campo que no existía a como estaba', () => {
  const items = [med('a', {})]; delete items[0].v.via;
  const u = B.apply(items, ['a'], 'via', 'Oral', C);
  assert.equal(items[0].v.via, 'Oral');
  B.undo(items, u);
  assert.ok(!('via' in items[0].v));
});

test('masivo: la sustancia activa y la concentración no admiten cambios en bloque', () => {
  assert.equal(B.byKey('principio'), null);
  assert.equal(B.byKey('concentracion'), null);
  assert.deepEqual(B.preview([med('a', {})], ['a'], 'principio', 'Otra', C), []);
});

test('masivo: las sugerencias de Conocimiento se agrupan por cambio y no incluyen sustancia', () => {
  const items = [med('a', { laboratorio: 'Laboratorios Pisa' }), med('b', { laboratorio: 'Laboratorios Pisa' }), med('c', { laboratorio: 'Genfar' })];
  const sug = new Map([
    ['a', [{ field: 'laboratorio', from: 'Laboratorios Pisa', to: 'Pisa', level: 2, status: 'confirmed', confidence: 0.9 }, { field: 'principio', from: '', to: 'Otro' }]],
    ['b', [{ field: 'laboratorio', from: 'Laboratorios Pisa', to: 'Pisa', level: 2 }]],
    ['c', [{ field: 'laboratorio', from: 'Genfar', to: 'Genfar' }]]
  ]);
  const g = B.groupSuggestions(items, sug, C);
  assert.equal(g.length, 1);
  assert.deepEqual([g[0].key, g[0].to, g[0].ids], ['laboratorio', 'Pisa', ['a', 'b']]);
});

test('masivo: vía y receta se proponen con la evidencia del lote solo si todos coinciden', () => {
  const items = [med('a', { via: 'Oral' }), med('b', { via: 'oral' }), med('c', { via: '' }), med('d', { via: '', principio: 'Loratadina' })];
  const g = B.inferFromLote(items);
  const via = g.find(x => x.field === 'via');
  assert.deepEqual([via.to, via.ids, via.reg], ['Oral', ['c'], true]);
  assert.match(via.evidence[0], /2 producto\(s\) con Omeprazol Cápsulas dicen «Oral»/);
  const dis = B.inferFromLote([med('a', { via: 'Oral' }), med('b', { via: 'Subcutánea' }), med('c', { via: '' })]);
  assert.ok(!dis.some(x => x.field === 'via'), 'si el lote no coincide, no se propone');
});

test('masivo: la receta se propone igual que la vía y un cambio que contradice al lote se marca', () => {
  const items = [med('a', { receta: 'no' }), med('b', { receta: 'no' }), med('c', { receta: '' })];
  const g = B.inferFromLote(items).find(x => x.field === 'receta');
  assert.deepEqual([g.to, g.ids], ['no', ['c']]);
  const c = B.conflicts(items, ['c'], 'receta', 'si');
  assert.match(c.get('c'), /dicen «No requiere receta»/);
  assert.equal(B.conflicts(items, ['c'], 'receta', 'no').size, 0);
  assert.equal(B.conflicts(items, ['c'], 'laboratorio', 'X').size, 0);
});

test('masivo: la misma propuesta desde Conocimiento y desde el lote se junta en un solo grupo', () => {
  const items = [med('a', { via: 'Oral' }), med('b', { via: 'Oral' }), med('c', { via: '' }), med('d', { via: '' })];
  const sug = new Map([['c', [{ field: 'via', from: '', to: 'Oral', level: 4, kind: 'fill', why: 'La aplicación ha visto 3 veces Omeprazol con «Oral».' }]], ['d', [{ field: 'via', from: '', to: 'oral', level: 4, kind: 'fill' }]]]);
  const g = B.mergeGroups([...B.groupSuggestions(items, sug, C), ...B.inferFromLote(items)]);
  const via = g.filter(x => x.field === 'via');
  assert.equal(via.length, 1, 'un solo grupo');
  assert.deepEqual([...via[0].ids].sort(), ['c', 'd']);
  assert.ok(via[0].reg);
  assert.ok(via[0].evidence.length >= 2, 'junta la evidencia de las dos fuentes');
});
