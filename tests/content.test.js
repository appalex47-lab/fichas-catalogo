'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const F = require('../js/logic');
const C = require('../js/content');

const meta = F.defMeta();
const med = { marca: 'Lamobrigan', principio: 'Lamotrigina', concentracion: '100 mg', forma: 'Tableta', contenido: 'Caja con 28 tabletas', laboratorio: 'Pisa', via: 'Oral', receta: 'si' };
const ev = (cat, v) => C.evaluate({ cat, v }, { metaCfg: meta });
const ids = e => e.findings.map(f => f.id);
const find = (e, id) => e.findings.find(f => f.id === id);

test('content: contrato fichas.content.v1 con score, dimensiones, hallazgos, recomendaciones y explicación', () => {
  const e = ev('med', med);
  assert.equal(e.schema, 'fichas.content.v1');
  assert.equal(e.score.total, 100);
  assert.equal(e.status, 'listo');
  assert.deepEqual(Object.keys(e.dimensions).sort(), Object.keys(C.DIMENSIONS).sort());
  assert.ok(Array.isArray(e.findings) && Array.isArray(e.recommendations));
  assert.match(e.explain, /Content 100\/100/);
  assert.match(e.score.formula, /No se premia la longitud/);
});

test('content: las dimensiones suman 100 puntos y cada regla pertenece a una dimensión', () => {
  assert.equal(Object.values(C.DIMENSIONS).reduce((a, d) => a + d.max, 0), 100);
  for (const dim of Object.keys(C.DIMENSIONS)) {
    assert.equal(C.RULES.filter(r => r.dimension === dim).reduce((a, r) => a + r.peso, 0), C.DIMENSIONS[dim].max, dim);
  }
});

test('content: ficha completa de cada categoría no tiene hallazgos', () => {
  const samples = {
    dis: { marca: 'Omron', modelo: 'M3', tipo: 'Baumanómetro', tecnologia: 'Digital', fabricante: 'Omron Healthcare', uso: 'Medición de presión arterial', paquete: '1 pieza' },
    cos: { marca: 'Isdin', producto: 'Fusion Water', tipo: 'Protector solar', atributo: 'Facial', contenido: '50 mL', fabricante: 'Isdin', fps: '50', nivel: 'Alta', modo: 'Aplicar antes de la exposición', precauciones: 'Solo uso externo' },
    sup: { marca: 'Nature', componente: 'Vitamina C', forma: 'Cápsulas', contenido: 'Frasco con 60 cápsulas', fabricante: 'Nature Made' },
    beb: { marca: 'Electrolit', tipo: 'Suero oral', sabor: 'Uva', atributo: 'Hidratante', contenido: '625 mL', fabricante: 'Electrolit' },
    hig: { marca: 'Colgate', producto: 'Pasta dental', variante: 'Triple acción', contenido: '100 mL', fabricante: 'Colgate-Palmolive' },
    acc: { marca: 'BD', producto: 'Jeringa', material: 'Plástico', contenido: 'Caja con 100 piezas', fabricante: 'BD' }
  };
  for (const [cat, v] of Object.entries(samples)) assert.deepEqual(ids(ev(cat, v)), [], cat);
});

test('content: incompleto marca faltantes de identidad, técnica y origen', () => {
  const e = ev('med', { marca: 'Lamobrigan', concentracion: '100 mg', receta: 'si', contenido: 'Caja con 28 tabletas', forma: 'Tableta' });
  assert.ok(ids(e).includes('CMP-001'), 'falta principio activo');
  assert.ok(ids(e).includes('CMP-002'), 'falta vía');
  assert.ok(ids(e).includes('CMP-003'), 'falta laboratorio');
  assert.deepEqual(find(e, 'CMP-003').datos.campos, ['laboratorio']);
  assert.ok(e.score.total < 100);
  assert.equal(e.status, 'critico');
});

test('content: sin datos no se evalúa (no se califica con 0)', () => {
  const e = C.evaluate({ cat: 'med', v: {} }, { metaCfg: meta });
  assert.equal(e.status, 'sin_evaluar');
  assert.equal(e.score.total, null);
});

test('content: contradicción forma ↔ vía es un error', () => {
  const e = ev('med', { ...med, via: 'Subcutánea' });
  const f = find(e, 'COH-C01');
  assert.equal(f.estado, 'error');
  assert.equal(f.clase, 'contradiccion');
  assert.equal(e.status, 'critico');
});

test('content: una forma inyectable con vía subcutánea no es contradicción', () => {
  assert.equal(find(ev('med', { ...med, forma: 'Solución inyectable', via: 'Subcutánea', volumen: '0.6 mL', contenido: 'Caja con 4 plumas' }), 'COH-C01'), undefined);
});

test('content: contradicción de receta entre declaración y texto', () => {
  assert.equal(find(ev('med', { ...med, receta: 'si', leyenda: 'Producto de venta libre.' }), 'COH-C02').estado, 'error');
  assert.equal(find(ev('med', { ...med, receta: 'no', leyenda: 'Requiere receta médica.' }), 'COH-C02').estado, 'error');
  assert.equal(find(ev('med', { ...med, receta: 'no', leyenda: 'No requiere receta médica.' }), 'COH-C02'), undefined);
});

test('content: concentración declarada contra otra cifra con la misma unidad', () => {
  const f = find(ev('med', { ...med, leyenda: 'Cada tableta contiene 50 mg.' }), 'COH-C03');
  assert.equal(f.estado, 'pendiente');
  assert.match(f.resultado, /50 mg/);
  assert.equal(find(ev('med', { ...med, leyenda: 'Cada tableta contiene 100 mg.' }), 'COH-C03'), undefined);
  assert.equal(find(ev('med', { ...med, leyenda: 'Contiene 28 tabletas.' }), 'COH-C03'), undefined);
});

test('content: volumen en forma sólida es contradicción', () => {
  assert.equal(find(ev('med', { ...med, volumen: '5 mL' }), 'COH-C04').clase, 'contradiccion');
});

test('content: claims del texto generado se señalan y las contradicciones ordenan primero', () => {
  const e = ev('med', { ...med, leyenda: 'Cura la enfermedad y es el mejor.' });
  const f = find(e, 'CLM-001');
  assert.equal(f.estado, 'error');
  assert.ok(f.datos.terminos.includes('cura'));
  assert.ok(e.recommendations.length > 0);
});

test('content: lenguaje subjetivo y comercial en medicamentos es aviso', () => {
  const e = ev('med', { ...med, leyenda: 'Presentación ideal y perfecta.' });
  assert.equal(find(e, 'CLM-002').estado, 'pendiente');
});

test('content: presentación sin cantidad ni unidad', () => {
  assert.equal(find(ev('med', { ...med, contenido: 'Caja' }), 'PRE-001').estado, 'pendiente');
  assert.equal(find(ev('med', { ...med, contenido: '30' }), 'PRE-001'), undefined, 'un número solo se interpreta como piezas');
  assert.equal(find(ev('med', { ...med, contenido: 'Caja con 28 tabletas' }), 'PRE-001'), undefined);
});

test('content: forma no reconocida', () => {
  assert.equal(find(ev('med', { ...med, forma: 'Xyzzy' }), 'PRE-002').estado, 'pendiente');
  assert.equal(find(ev('med', { ...med, forma: 'Solución inyectable', via: 'Subcutánea', contenido: 'Caja con 4 plumas' }), 'PRE-002'), undefined);
});

test('content: descripción presente, con identidad y sin relleno', () => {
  const e = ev('med', { ...med, laboratorio: 'N/A' });
  assert.equal(find(e, 'DES-003').estado, 'pendiente');
  assert.equal(find(ev('med', med), 'DES-001'), undefined);
  assert.equal(ev('med', med).dimensions.descripcion.score, 100);
});

test('content: abreviaturas, mayúsculas sostenidas y valores repetidos', () => {
  assert.equal(find(ev('med', { ...med, contenido: 'CAJ C/28 TAB' }), 'CLA-001').estado, 'pendiente');
  assert.equal(find(ev('med', { ...med, principio: 'LAMOTRIGINA ANHIDRA' }), 'CLA-002').estado, 'pendiente');
  assert.equal(find(ev('med', { ...med, forma: 'Tableta', via: 'Oral', laboratorio: 'Oral' }), 'CLA-003').estado, 'pendiente');
  assert.equal(find(ev('med', { ...med, principio: 'Lamobrigan' }), 'CLA-003'), undefined, 'marca igual al principio activo es legítimo en genéricos');
});

test('content: seguridad exige la receta y conserva el aviso legal de la plantilla', () => {
  const e = ev('med', { ...med, receta: '' });
  assert.equal(find(e, 'SEG-001').clase, 'faltante');
  assert.equal(ev('med', med).dimensions.seguridad.score, 100);
});

test('content: no premia longitud: agregar texto de relleno nunca sube el score', () => {
  const base = ev('med', med).score.total;
  const long = ev('med', { ...med, leyenda: Array(300).fill('texto neutro descriptivo').join(' ') }).score.total;
  assert.ok(long <= base);
  const poorBase = ev('med', { marca: 'X', concentracion: '10 mg', receta: 'si' }).score.total;
  const poorLong = ev('med', { marca: 'X', concentracion: '10 mg', receta: 'si', leyenda: Array(300).fill('palabra').join(' ') }).score.total;
  assert.ok(poorLong <= poorBase);
});

test('content: el score es trazable a reglas y se recalcula igual', () => {
  const e = ev('med', { ...med, via: 'Subcutánea', contenido: 'Caja', leyenda: 'Es el mejor.' });
  const results = Object.values(e.dimensions).flatMap(d => d.rules);
  const pos = results.reduce((a, x) => a + x.posibles, 0), obt = results.reduce((a, x) => a + x.obtenidos, 0);
  assert.equal(e.score.total, Math.round(100 * obt / pos));
  e.findings.forEach(f => assert.ok(C.ruleById(f.id), f.id));
  assert.deepEqual(ev('med', { ...med, via: 'Subcutánea', contenido: 'Caja', leyenda: 'Es el mejor.' }), e);
  const ex = C.explainScore(e);
  assert.equal(ex.total, e.score.total);
  assert.ok(ex.incumplidas.length > 0);
});

test('content: no usa IA ni red y no modifica los datos', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'content.js'), 'utf8');
  assert.equal(/fetch\(|XMLHttpRequest|\bcohere\b|localStorage/i.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), false);
  const item = { cat: 'med', v: { ...med } };
  const before = JSON.stringify(item);
  C.evaluate(item, { metaCfg: meta });
  assert.equal(JSON.stringify(item), before);
});

test('content: lote con promedio y estados', () => {
  const b = C.evaluateBatch([{ cat: 'med', v: med }, { cat: 'med', v: { ...med, via: 'Subcutánea' } }, { cat: 'med', v: {} }], { metaCfg: meta });
  assert.equal(b.summary.total, 3);
  assert.equal(b.summary.byStatus.listo, 1);
  assert.equal(b.summary.byStatus.critico, 1);
  assert.equal(b.summary.byStatus.sin_evaluar, 1);
  assert.equal(b.summary.evaluados, 2);
});
