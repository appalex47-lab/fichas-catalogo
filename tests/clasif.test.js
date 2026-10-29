'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../js/logic.js');
const K = require('../js/clasif.js');

const AT = '2026-10-29T10:00:00Z';

test('clasificación: el área sale del código ATC con el prefijo más largo y solo si el formato es válido', () => {
  assert.equal(K.areaFromAtc('A10BX16'), 'Diabetes y metabolismo');
  assert.equal(K.areaFromAtc('a08aa'), 'Control de peso');
  assert.equal(K.areaFromAtc('N02BE01'), 'Dolor e inflamación');
  assert.equal(K.areaFromAtc('C10AA05'), 'Cardiovascular');
  assert.equal(K.areaFromAtc('J01CA04'), 'Infecciones');
  assert.equal(K.areaFromAtc('V06'), '', 'sin área para grupos que no se agrupan');
  assert.equal(K.areaFromAtc('ZZZ'), '');
  assert.ok(K.ATC_AREAS.every(([, a]) => F.AREAS.includes(a)), 'todas las áreas existen en la lista cerrada');
});

test('clasificación: la clave ignora acentos, mayúsculas y el orden de los componentes', () => {
  assert.equal(K.keyOf('Paracetamol'), 'paracetamol');
  assert.equal(K.keyOf('PARACETAMOL, Cafeína'), K.keyOf('cafeina + paracetamol'));
  assert.equal(K.keyOf('Cafeína y Paracetamol'), 'cafeina + paracetamol');
  assert.equal(K.keyOf('  '), '');
});

test('clasificación: una fila nueva nace sin verificar y verificar exige fuente, persona y ATC válido', () => {
  const d = K.empty();
  assert.equal(K.upsert(d, { principio: '' }).ok, false);
  assert.equal(K.upsert(d, { principio: 'Tirzepatida', atc: 'XYZ' }).ok, false, 'ATC con formato inválido');
  const r = K.upsert(d, { principio: 'Tirzepatida', atc: 'a10bx16', fuente: 'Memoria del asistente' }).row;
  assert.equal(r.estado, 'sin_verificar');
  assert.equal(r.atc, 'A10BX16');
  assert.equal(K.verify(d, r.key, { fuente: '', por: 'Ana' }).ok, false);
  assert.equal(K.verify(d, r.key, { fuente: 'Índice ATC OMS 2025', por: '' }).ok, false);
  assert.equal(K.verify(d, 'no-existe', { fuente: 'x', por: 'y' }).ok, false);
  const sinAtc = K.upsert(d, { principio: 'Otro' }).row;
  assert.equal(K.verify(d, sinAtc.key, { fuente: 'x', por: 'y' }).ok, false, 'sin ATC no se verifica');
  assert.equal(K.verify(d, r.key, { fuente: 'Índice ATC OMS 2025', por: 'Ana', at: AT }).ok, true);
  assert.deepEqual([r.estado, r.por, r.el, r.fuente], ['verificado', 'Ana', AT, 'Índice ATC OMS 2025']);
});

test('clasificación: cambiar el código de una fila verificada la devuelve a sin verificar', () => {
  const d = K.empty();
  const r = K.upsert(d, { principio: 'Tirzepatida', atc: 'A10BX16' }).row;
  K.verify(d, r.key, { fuente: 'OMS', por: 'Ana', at: AT });
  K.upsert(d, { principio: 'Tirzepatida', nota: 'solo una nota' });
  assert.equal(r.estado, 'verificado', 'una nota no cambia el estado');
  K.upsert(d, { principio: 'Tirzepatida', atc: 'A10BJ06' });
  assert.deepEqual([r.estado, r.por, r.el], ['sin_verificar', '', '']);
});

test('clasificación: lookup entrega ATC y área, y el área propia manda sobre la derivada', () => {
  const d = K.empty();
  K.upsert(d, { principio: 'Tirzepatida', atc: 'A10BX16', area2: 'Control de peso' });
  const l = K.lookup(d, 'TIRZEPATIDA');
  assert.deepEqual([l.atc, l.area, l.area2, l.verified], ['A10BX16', 'Diabetes y metabolismo', 'Control de peso', false]);
  K.upsert(d, { principio: 'Tirzepatida', area: 'Cardiovascular' });
  assert.equal(K.lookup(d, 'tirzepatida').area, 'Cardiovascular');
  assert.equal(K.lookup(d, 'Desconocido'), null);
  assert.equal(K.lookup(d, ''), null);
});

test('clasificación: el CSV viaja completo, pero un «verificado» sin datos entra como sin verificar', () => {
  const d = K.empty();
  K.upsert(d, { principio: 'Tirzepatida', atc: 'A10BX16', fuente: 'OMS' });
  K.verify(d, K.keyOf('Tirzepatida'), { fuente: 'Índice ATC OMS 2025', por: 'Ana, QF', at: AT });
  K.upsert(d, { principio: 'Paracetamol', atc: 'N02BE01', nota: 'con "comillas", y comas' });
  const csv = K.toCsv(d);
  const d2 = K.empty();
  const r = K.fromCsv(d2, csv);
  assert.deepEqual([r.added, r.updated, r.skipped, r.downgraded], [2, 0, 0, 0]);
  assert.equal(K.find(d2, 'tirzepatida').estado, 'verificado');
  assert.equal(K.find(d2, 'paracetamol').nota, 'con "comillas", y comas');
  const falso = 'principio,atc,fuente,estado\nIbuprofeno,M01AE01,Mi fuente,verificado\nOmeprazol,ZZZ,x,verificado\n,A10,x,verificado';
  const d3 = K.empty();
  const r3 = K.fromCsv(d3, falso);
  assert.equal(r3.downgraded, 1, 'el verificado sin nombre ni fecha baja a sin verificar');
  assert.equal(K.find(d3, 'ibuprofeno').estado, 'sin_verificar');
  assert.equal(K.find(d3, 'omeprazol'), null, 'ATC inválido no entra');
  assert.equal(r3.skipped, 2);
  assert.match(K.fromCsv(K.empty(), 'a,b\n1,2').error, /principio/);
});

test('clasificación: normalize repara datos dañados y nunca deja una fila verificada sin respaldo', () => {
  const d = K.normalize({ rows: [{ principio: 'A', atc: 'N02BE01', estado: 'verificado' }, { principio: 'a', atc: 'N02BE01' }, null, { principio: '' }, { principio: 'B', atc: 'ZZZ', estado: 'verificado', fuente: 'x', por: 'y', el: AT }] });
  assert.equal(d.rows.length, 2);
  assert.ok(d.rows.every(r => r.estado === 'sin_verificar'));
  assert.deepEqual(K.normalize(null), K.empty());
});

test('clasificación: la plantilla lista solo los principios activos que faltan, sin repetir', () => {
  const d = K.empty();
  K.upsert(d, { principio: 'Paracetamol', atc: 'N02BE01' });
  assert.deepEqual(K.missing(d, ['paracetamol', 'Tirzepatida', 'TIRZEPATIDA', '', 'Cafeína, Paracetamol']), ['Tirzepatida', 'Cafeína, Paracetamol']);
});

test('clasificación: los candidatos de docs/ entran todos sin verificar y con ATC válido', () => {
  const fs = require('node:fs'), path = require('node:path');
  const csv = fs.readFileSync(path.join(__dirname, '..', 'docs', 'clasificacion-candidatos.csv'), 'utf8');
  const d = K.empty(), r = K.fromCsv(d, csv);
  assert.equal(r.skipped, 0);
  assert.equal(r.downgraded, 0);
  assert.ok(d.rows.length >= 10);
  assert.ok(d.rows.every(x => x.estado === 'sin_verificar' && F.ATC_RE.test(x.atc) && /verificar/i.test(x.fuente)), 'ninguno viene verificado');
  assert.equal(K.lookup(d, 'tirzepatida').area, 'Diabetes y metabolismo');
  assert.equal(K.lookup(d, 'Tirzepatida').area2, 'Control de peso');
});
