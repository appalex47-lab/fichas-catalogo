'use strict';
/* Fase 11: capa de persistencia del conocimiento. El contrato se prueba con el backend de memoria (siempre) y con IndexedDB
 * real o simulado (fake-indexeddb en Node, IndexedDB nativo en el navegador). */
const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../js/knowledge-db');

let fakeOk = false;
try { require('fake-indexeddb/auto'); fakeOk = true; } catch (_) { /* sin fake-indexeddb */ }
const hasIDB = typeof indexedDB !== 'undefined' && !!indexedDB;
const skipIDB = hasIDB ? false : 'IndexedDB no está disponible (ejecuta npm install para instalar fake-indexeddb)';
let n = 0;
const uniqueName = () => `fichasProductoKnowledge-test-${Date.now()}-${n++}`;

const ent = (type, value, extra) => Object.assign({ id: `${type}:${value.toLowerCase().replace(/ /g, '-')}`, type, canonicalValue: value, normalizedValue: value.toLowerCase(), tokens: value.toLowerCase().split(' '), status: 'observed', confidence: 0.2, sources: ['manual'], updatedAt: '2026-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z' }, extra || {});

function contract(label, make, skip) {
  test(`${label}: abre, versiona y expone los 8 almacenes con sus índices`, { skip }, async () => {
    const db = make(); const st = await db.open();
    assert.equal(K.DB_NAME, 'fichasProductoKnowledge');
    assert.equal(K.DB_VERSION, 1);
    assert.equal(st.version, 1);
    assert.deepEqual(K.STORE_NAMES, ['entities', 'aliases', 'relationships', 'evidence', 'corrections', 'conflicts', 'rules', 'knowledgeMeta']);
    for (const name of ['normalized', 'type', 'status', 'confidence', 'sources', 'updatedAt', 'typeNormalized', 'tokens']) assert.ok(K.STORES.entities.indexes.some(i => i.name === name), `entities.${name}`);
    for (const name of ['entityId', 'normalized', 'status']) assert.ok(K.STORES.aliases.indexes.some(i => i.name === name), `aliases.${name}`);
    for (const name of ['targetId', 'productRef', 'source']) assert.ok(K.STORES.evidence.indexes.some(i => i.name === name), `evidence.${name}`);
    assert.equal(K.STORES.relationships.indexes.filter(i => i.keyPath === 'predicate').length, 1, 'sin índices duplicados');
    for (const ix of ['entityId']) assert.ok(K.STORES.aliases.indexes.some(i => i.name === ix));
    for (const ix of ['relationshipType', 'subject', 'object']) assert.ok(K.STORES.relationships.indexes.some(i => i.name === ix));
    assert.ok(K.STORES.evidence.indexes.some(i => i.name === 'targetId'));
    const h = await db.health(); assert.deepEqual(Object.keys(h.counts), K.STORE_NAMES);
  });
  test(`${label}: escribe, lee, actualiza y elimina`, { skip }, async () => {
    const db = make(); await db.open();
    await db.put('entities', ent('brand', 'Tempra'));
    assert.equal((await db.get('entities', 'brand:tempra')).canonicalValue, 'Tempra');
    await db.put('entities', ent('brand', 'Tempra', { confidence: 0.9 }));
    assert.equal((await db.get('entities', 'brand:tempra')).confidence, 0.9);
    assert.equal(await db.count('entities'), 1);
    await db.delete('entities', 'brand:tempra');
    assert.equal(await db.get('entities', 'brand:tempra'), undefined);
    assert.deepEqual(await db.getMany('entities', []), []);
  });
  test(`${label}: consultas por índice (tipo, texto normalizado, estado, token, rango)`, { skip }, async () => {
    const db = make(); await db.open();
    await db.putMany('entities', [ent('brand', 'Tempra'), ent('brand', 'Dolofin', { status: 'confirmed', confidence: 0.8 }), ent('substance', 'Paracetamol Extra'), ent('laboratory', 'Genomma')]);
    assert.equal((await db.byIndex('entities', 'type', 'brand')).length, 2);
    assert.equal(await db.countByIndex('entities', 'type', 'substance'), 1);
    assert.deepEqual((await db.byIndex('entities', 'typeNormalized', ['brand', 'tempra'])).map(r => r.id), ['brand:tempra']);
    assert.equal((await db.byIndex('entities', 'typeStatus', ['brand', 'confirmed'])).length, 1);
    assert.deepEqual((await db.byIndex('entities', 'tokens', 'extra')).map(r => r.id), ['substance:paracetamol-extra'], 'multiEntry');
    const pref = await db.range('entities', 'normalized', { lower: 'dol', upper: 'dol\uffff' });
    assert.deepEqual(pref.map(r => r.id), ['brand:dolofin']);
    const top = await db.range('entities', 'confidence', { direction: 'prev', limit: 1 });
    assert.equal(top[0].id, 'brand:dolofin');
    assert.equal((await db.byIndex('entities', 'type', 'brand', { limit: 1 })).length, 1);
    await assert.rejects(() => db.byIndex('entities', 'noExiste', 'x'), /Índice desconocido/);
    await assert.rejects(() => db.get('noExiste', 'x'), /Almacén desconocido/);
  });
  test(`${label}: el índice se actualiza al cambiar y borrar registros`, { skip }, async () => {
    const db = make(); await db.open();
    await db.put('entities', ent('brand', 'Tempra'));
    await db.put('entities', ent('brand', 'Tempra', { status: 'confirmed' }));
    assert.equal(await db.countByIndex('entities', 'typeStatus', ['brand', 'observed']), 0);
    assert.equal(await db.countByIndex('entities', 'typeStatus', ['brand', 'confirmed']), 1);
    await db.delete('entities', 'brand:tempra');
    assert.equal(await db.countByIndex('entities', 'typeStatus', ['brand', 'confirmed']), 0);
  });
  test(`${label}: el lote es atómico (si un registro es inválido no se aplica nada)`, { skip }, async () => {
    const db = make(); await db.open();
    await assert.rejects(() => db.batch([{ op: 'put', store: 'entities', rec: ent('brand', 'A') }, { op: 'put', store: 'entities', rec: { sinId: true } }]), /sin id/);
    assert.equal(await db.count('entities'), 0);
    await db.batch([{ op: 'put', store: 'entities', rec: ent('brand', 'A') }, { op: 'put', store: 'aliases', rec: { id: 'alias:x', entityId: 'brand:a', type: 'brand', normalizedAlias: 'x', status: 'observed', updatedAt: '1' } }]);
    assert.equal(await db.count('entities'), 1); assert.equal(await db.count('aliases'), 1);
    await db.batch([{ op: 'delete', store: 'entities', id: 'brand:a' }]);
    assert.equal(await db.count('entities'), 0);
  });
  test(`${label}: recorrido paginado, limpiar y reiniciar`, { skip }, async () => {
    const db = make(); await db.open();
    await db.putMany('entities', Array.from({ length: 25 }, (_, i) => ent('brand', 'Marca ' + String(i).padStart(2, '0'))));
    const p1 = await db.scan('entities', { limit: 10 }); assert.equal(p1.length, 10);
    const p2 = await db.scan('entities', { after: p1[9].id, limit: 10 }); assert.equal(p2.length, 10); assert.notEqual(p2[0].id, p1[0].id);
    const p3 = await db.scan('entities', { after: p2[9].id, limit: 10 }); assert.equal(p3.length, 5);
    await db.clear('entities'); assert.equal(await db.count('entities'), 0);
    await db.put('entities', ent('brand', 'X')); await db.reset(); assert.equal(await db.count('entities'), 0);
  });
  test(`${label}: respaldo y restauración (valida, evita duplicados, conserva evidencia)`, { skip }, async () => {
    const a = make(); await a.open();
    await a.putMany('entities', [ent('brand', 'Tempra'), ent('substance', 'Paracetamol')]);
    await a.put('evidence', { id: 'ev:1', targetId: 'brand:tempra', kind: 'observed', source: 'manual', productRef: 'sku:a1', createdAt: '2026-01-01' });
    const data = await a.exportAll();
    assert.equal(data.schema, K.SCHEMA); assert.equal(data.dbVersion, 1); assert.equal(data.counts.entities, 2);
    const b = make(); await b.open();
    const r1 = await b.importAll(data);
    assert.equal(r1.added, 3); assert.equal(await b.count('evidence'), 1);
    const r2 = await b.importAll(data);
    assert.equal(r2.added, 0, 'sin duplicados'); assert.equal(await b.count('entities'), 2);
    const newer = JSON.parse(JSON.stringify(data)); newer.stores.entities[0].canonicalValue = 'Tempra Nueva'; newer.stores.entities[0].updatedAt = '2027-01-01'; newer.stores.evidence[0].note = 'cambiada';
    await b.importAll(newer);
    assert.equal((await b.get('entities', newer.stores.entities[0].id)).canonicalValue, 'Tempra Nueva', 'gana el más reciente');
    assert.equal((await b.get('evidence', 'ev:1')).note, undefined, 'la evidencia es inmutable');
    const c = make(); await c.open(); await c.put('entities', ent('brand', 'Vieja'));
    await c.importAll(data, { mode: 'replace' });
    assert.equal(await c.get('entities', 'brand:vieja'), undefined, 'replace reconstruye la base');
    assert.equal(await c.count('entities'), 2);
  });
  test(`${label}: rechaza respaldos inválidos o de una versión más nueva`, { skip }, async () => {
    const db = make(); await db.open();
    assert.equal(db.validateBackup(null).ok, false);
    assert.equal(db.validateBackup({ schema: 'otra.cosa', dbVersion: 1, stores: {} }).ok, false);
    assert.match(db.validateBackup({ schema: K.SCHEMA, dbVersion: 99, stores: {} }).errors[0], /versión más nueva/);
    assert.match(db.validateBackup({ schema: K.SCHEMA, dbVersion: 1, stores: { entities: [{ canonicalValue: 'sin id' }] } }).errors[0], /sin identificador/);
    assert.match(db.validateBackup({ schema: K.SCHEMA, dbVersion: 1, stores: { entities: 'roto' } }).errors[0], /dañado/);
    assert.equal(db.validateBackup({ schema: K.SCHEMA, dbVersion: 1, stores: { extra: [] } }).warnings.length, 1);
    await assert.rejects(() => db.importAll({ schema: 'otra.cosa' }), /no es un respaldo/);
    assert.equal(await db.count('entities'), 0);
  });
}
contract('memoria', () => K.create({ backend: new K.MemoryBackend() }));
contract('IndexedDB', () => K.create({ backend: new K.IDBBackend({ name: uniqueName() }) }), skipIDB);

test('IndexedDB: los datos sobreviven a cerrar y volver a abrir la base', { skip: skipIDB }, async () => {
  const name = uniqueName();
  const a = K.create({ backend: new K.IDBBackend({ name }) }); await a.open();
  await a.put('entities', ent('brand', 'Tempra')); a.backend().close();
  const b = K.create({ backend: new K.IDBBackend({ name }) }); await b.open();
  assert.equal((await b.get('entities', 'brand:tempra')).canonicalValue, 'Tempra');
  assert.equal(b.status().persistent, true); assert.equal(b.status().mode, 'indexeddb');
});

test('IndexedDB: una base de una versión más nueva se informa y la capa se degrada a memoria sin romper', { skip: skipIDB }, async () => {
  const name = uniqueName();
  const newer = new K.IDBBackend({ name, version: 5 }); await newer.open(); newer.close();
  const db = K.create({ backend: new K.IDBBackend({ name }) });
  const st = await db.open();
  assert.equal(st.mode, 'memory'); assert.equal(st.degraded, true); assert.match(st.error, /versión más nueva/);
  await db.put('entities', ent('brand', 'A')); assert.equal(await db.count('entities'), 1, 'sigue funcionando');
});

test('migraciones: cada versión tiene su migración y la actual crea todos los almacenes', () => {
  for (let v = 1; v <= K.DB_VERSION; v++) assert.equal(typeof K.MIGRATIONS[v], 'function', `migración ${v}`);
  const created = []; const fake = { createObjectStore: (n) => { created.push(n); return { createIndex() {} }; } };
  K.MIGRATIONS[1](fake); assert.deepEqual(created, K.STORE_NAMES);
});

test('recuperación: si IndexedDB no abre, la capa usa memoria y lo informa', async () => {
  const bad = new K.IDBBackend({ indexedDB: { open() { throw new Error('bloqueado por el navegador'); } } });
  const db = K.create({ backend: bad }); const st = await db.open();
  assert.equal(st.mode, 'memory'); assert.equal(st.degraded, true); assert.equal(st.persistent, false); assert.match(st.error, /No se pudo abrir/);
  await db.put('entities', ent('brand', 'A')); assert.equal((await db.get('entities', 'brand:a')).canonicalValue, 'A');
});

test('las consultas usan índices: ninguna búsqueda recorre la tabla completa (memoria)', async () => {
  const be = new K.MemoryBackend(); const db = K.create({ backend: be }); await db.open();
  await db.putMany('entities', Array.from({ length: 3000 }, (_, i) => ent(i % 2 ? 'brand' : 'substance', 'Nombre ' + i)));
  const t0 = Date.now();
  for (let i = 0; i < 300; i++) { await db.byIndex('entities', 'typeNormalized', ['brand', 'nombre ' + (i * 2 + 1)]); await db.range('entities', 'normalized', { lower: 'nombre 1', upper: 'nombre 1\uffff', limit: 10 }); }
  assert.equal(be.stats.fullScans, 0, 'cero recorridos completos');
  assert.ok(be.stats.indexQueries >= 600);
  assert.ok(Date.now() - t0 < 4000, 'consultas rápidas con miles de registros');
});

test('escala: 20 000 entidades se guardan y se consultan por índice en tiempo razonable (memoria)', async () => {
  const be = new K.MemoryBackend(); const db = K.create({ backend: be }); await db.open();
  const rows = Array.from({ length: 20000 }, (_, i) => ent('brand', 'Marca ' + i));
  const t0 = Date.now(); for (let i = 0; i < rows.length; i += 500) await db.putMany('entities', rows.slice(i, i + 500));
  const tw = Date.now() - t0; assert.equal(await db.count('entities'), 20000);
  const t1 = Date.now(); for (let i = 0; i < 500; i++) await db.byIndex('entities', 'typeNormalized', ['brand', 'marca ' + (i * 37)]);
  const tr = Date.now() - t1;
  assert.ok(tw < 15000, `escritura ${tw} ms`); assert.ok(tr < 1500, `500 lecturas por índice ${tr} ms`); assert.equal(be.stats.fullScans, 0);
});

test('escala: 5 000 entidades en IndexedDB y consultas por índice', { skip: skipIDB }, async () => {
  const db = K.create({ backend: new K.IDBBackend({ name: uniqueName() }) }); await db.open();
  const rows = Array.from({ length: 5000 }, (_, i) => ent('brand', 'Marca ' + i));
  const t0 = Date.now(); for (let i = 0; i < rows.length; i += 500) await db.putMany('entities', rows.slice(i, i + 500));
  const tw = Date.now() - t0; assert.equal(await db.count('entities'), 5000);
  const t1 = Date.now(); for (let i = 0; i < 200; i++) await db.byIndex('entities', 'typeNormalized', ['brand', 'marca ' + (i * 11)]);
  const tr = Date.now() - t1;
  assert.ok(tw < 20000, `escritura ${tw} ms`); assert.ok(tr < 5000, `200 lecturas ${tr} ms`);
  assert.equal(db.backend().stats.fullScans, 0);
});

test('solo knowledge-db.js toca indexedDB: ningún otro módulo lo usa directamente', () => {
  const fs = require('node:fs'), path = require('node:path'); const dir = path.join(__dirname, '..', 'js');
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.js') && x !== 'knowledge-db.js')) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    if (f === 'app.js') { assert.doesNotMatch(src.replace(/fichas-state/g, ''), /indexedDB\.open\(['"]fichasProductoKnowledge/); continue; }
    assert.doesNotMatch(src, /\bindexedDB\b/, `${f} no debe usar indexedDB directamente`);
  }
});
