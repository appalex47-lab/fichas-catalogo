'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../js/backup.js');
const Clasif = require('../js/clasif.js');

test('respaldo: arma un archivo solo con las partes que vienen', () => {
  const f = B.build({ lote: { items: [{ id: 'a' }], audit: [] }, catalogo: null, clasif: { rows: [] } }, { createdAt: 'T' });
  assert.equal(f.schema, 'fichas.backup.v2');
  assert.deepEqual(Object.keys(f.parts), ['lote', 'clasif']);
  assert.equal(f.createdAt, 'T');
  assert.ok(!JSON.stringify(f).includes('apiKey'));
});

test('respaldo: reconoce el formato nuevo y los tres anteriores', () => {
  const v2 = B.detect(B.build({ lote: { items: [{ id: 'a', sku: 'S1' }] }, catalogo: { entries: [{ sku: 'S1' }], links: [] }, ajustes: { exp: {} } }));
  assert.equal(v2.kind, 'v2');
  assert.deepEqual(Object.keys(v2.parts).sort(), ['ajustes', 'catalogo', 'lote']);
  const v1 = B.detect({ schema: 'fichas.lote-backup.v1', createdAt: 'T', lote: [{ id: 'a' }], audit: [], catalog: { entries: [], links: [] }, knowledge: { schema: 'fichas.knowledge.v1', stores: { entities: [{ id: 'x' }] } } });
  assert.equal(v1.kind, 'lote-v1');
  assert.deepEqual(Object.keys(v1.parts).sort(), ['catalogo', 'conocimiento', 'lote']);
  const cat = B.detect({ kind: 'fichas.catalog.share', v: 1, at: 'T', catalog: { entries: [{ sku: 'A' }], links: [] } });
  assert.deepEqual([cat.kind, Object.keys(cat.parts)], ['catalogo', ['catalogo']]);
  const kn = B.detect({ schema: 'fichas.knowledge.v1', stores: { entities: [] } });
  assert.deepEqual([kn.kind, Object.keys(kn.parts)], ['conocimiento', ['conocimiento']]);
});

test('respaldo: lo que no es un respaldo se rechaza', () => {
  for (const x of [null, 5, [], {}, { schema: 'otro' }, { schema: 'fichas.backup.v2', parts: {} }, { hola: 1 }]) assert.equal(B.detect(x), null);
});

test('respaldo: cuenta lo que trae cada parte', () => {
  assert.equal(B.count('lote', { items: [1, 2, 3] }), 3);
  assert.equal(B.count('catalogo', { entries: [1, 2] }), 2);
  assert.equal(B.count('clasif', { rows: [1] }), 1);
  assert.equal(B.count('conocimiento', { stores: { entities: [1, 2, 3, 4] } }), 4);
  assert.equal(B.count('ajustes', {}), 1);
  assert.equal(B.count('lote', null), 0);
});

test('respaldo: unir el lote agrega los que no tengo y no pisa los míos', () => {
  const mine = [{ id: '1', sku: 'A-1', v: { marca: 'mía' } }];
  const r = B.mergeLote(mine, [{ id: '9', sku: 'a-1', v: { marca: 'otra' } }, { id: '2', sku: 'B-2' }, { id: '3', sku: '' }, { id: '3', sku: '' }]);
  assert.equal(r.added, 2);
  assert.equal(r.skipped, 2);
  assert.equal(r.items.length, 3);
  assert.equal(r.items.find(x => x.sku === 'A-1').v.marca, 'mía');
  assert.equal(mine.length, 1, 'no modifica la lista original');
});

test('diccionario ATC: unir nunca baja una fila verificada y toma la verificada del otro', () => {
  const ver = (principio, atc) => ({ principio, atc, estado: 'verificado', fuente: 'OMS 2025', por: 'Ana', el: '2026-01-01' });
  const mine = Clasif.empty();
  Clasif.upsert(mine, { principio: 'Omeprazol', atc: 'A02BC01' }); Clasif.verify(mine, Clasif.keyOf('Omeprazol'), { fuente: 'OMS', por: 'Luis' });
  Clasif.upsert(mine, { principio: 'Loratadina', atc: '' });
  const theirs = { rows: [{ ...ver('Omeprazol', 'A02BC01'), area: 'Gastro' }, { ...ver('Loratadina', 'R06AX13') }, { principio: 'Metformina', atc: 'A10BA02', estado: 'sin_verificar' }] };
  const s = Clasif.merge(mine, theirs);
  assert.deepEqual(s, { added: 1, updated: 1, kept: 1 });
  assert.equal(Clasif.find(mine, 'Omeprazol').por, 'Luis', 'la fila verificada mía no cambia');
  assert.equal(Clasif.find(mine, 'Loratadina').estado, 'verificado');
  assert.equal(Clasif.find(mine, 'Metformina').estado, 'sin_verificar');
});
