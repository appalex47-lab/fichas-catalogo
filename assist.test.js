'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../assist.js');

const base = {
  cat: { id: 'med', name: 'Medicamentos' }, hasData: true,
  fields: [{ key: 'marca', label: 'Marca' }, { key: 'receta', label: '¿Requiere receta médica?' }, { key: 'principio', label: 'Principio activo' }, { key: 'textura', label: 'Textura' }],
  titleMissing: [], titleMissingKeys: [], mgBlocked: null, mgBlockedKeys: [],
  lint: { claim: [], vacio: [], amber: [], med: [], check: [] }, dup: false, metaConfirmed: true, keyPresent: false,
  calls: { extract: 3, asst: 2, local: 7 }, limit: 1000, lote: { n: 0, exp: null, aiUnconfirmed: 0 }
};
const withLote = (rows, total, excluded) => ({ ...base, lote: { n: total, aiUnconfirmed: 0, exp: { rows, total, excluded } } });

test('acciones: solo la lista cerrada y campos de la categoría actual', () => {
  assert.equal(S.parseAction('ir:lote', 'med').label, 'Ir al Lote');
  assert.equal(S.parseAction('campo:receta', 'med').label, 'Ir al campo: ¿Requiere receta médica?');
  assert.equal(S.parseAction('campo:receta', 'cos'), null, 'la receta no existe en cosméticos');
  assert.equal(S.parseAction('borrar:lote', 'med'), null);
  assert.equal(S.parseAction('javascript:alert(1)', 'med'), null);
  const list = S.parseActions(['ir:lote', 'ir:lote', 'nope', 'campo:marca', 'ajustes:ia', 'pestana:mg', 'ir:masiva'], 'med', 3);
  assert.deepEqual(list.map(a => a.id), ['ir:lote', 'campo:marca', 'ajustes:ia']);
});

test('«por qué se bloquea Magento»: se calcula con los datos y lleva al campo que falta', () => {
  const r = S.localAnswer('¿Por qué se bloquea Magento?', { ...base, mgBlocked: ['Indica si el producto requiere receta médica.'], mgBlockedKeys: ['receta'] });
  assert.match(r.text, /requiere receta médica/);
  assert.deepEqual(r.actions, ['campo:receta', 'pestana:mg']);
  assert.match(S.localAnswer('por que no se bloquea magento html', base).text, /no está bloqueada/);
  assert.equal(S.localAnswer('  ', base), null);
});

test('«qué falta para exportar» y «por qué no se exportan»', () => {
  const snap = withLote(6, 10, { sinSku: 0, bloqueadas: 2, faltantes: 2, lenguaje: 0, duplicadas: 0, ia: 0, sinMeta: 1, sinImagen: 6, altLargos: 0 });
  const r = S.localAnswer('¿Qué falta para exportar?', snap);
  assert.match(r.text, /Se exportan 6 de 10/);
  assert.match(r.text, /2 con la descripción de Magento bloqueada/);
  assert.match(r.text, /2 con datos faltantes/);
  assert.match(r.text, /1 van sin meta title/);
  assert.ok(r.actions.includes('filtro:bloqueados') && r.actions.includes('filtro:faltantes') && r.actions.includes('ajustes:magento'));
  const r2 = S.localAnswer('¿Por qué no se exportan algunas filas?', snap);
  assert.match(r2.text, /Quedan fuera/);
  assert.match(S.localAnswer('¿Ya puedo exportar?', withLote(4, 4, {})).text, /Todo listo: los 4 productos/);
  assert.match(S.localAnswer('qué falta para exportar', base).text, /Aún no hay productos en el lote/);
  assert.match(S.localAnswer('qué falta para exportar', withLote(0, 3, { sinSku: 3 })).text, /Todavía no se puede exportar ninguno/);
});

test('avisos: explica cada tipo con los términos y campos del producto', () => {
  const snap = { ...base, lint: { claim: [{ term: 'cura', field: 'Textura' }], vacio: [], amber: [], med: [], check: ['El nivel no coincide con la tabla.'] }, dup: true };
  const r = S.localAnswer('Explícame los avisos', snap);
  assert.match(r.text, /Claims prohibidos: «cura» en Textura/);
  assert.match(r.text, /Revisar datos/);
  assert.match(r.text, /Información duplicada/);
  assert.deepEqual(r.actions, ['campo:textura']);
  assert.match(S.localAnswer('explícame los avisos', base).text, /no tiene avisos/);
});

test('datos faltantes del título, metas, IA sin confirmar y cuota', () => {
  const m = S.localAnswer('¿Qué me falta?', { ...base, titleMissing: ['Marca'], titleMissingKeys: ['marca'] });
  assert.match(m.text, /faltan: Marca/);
  assert.deepEqual(m.actions, ['campo:marca', 'pestana:titulo']);
  assert.match(S.localAnswer('¿Por qué las metas salen vacías?', { ...base, metaConfirmed: false }).text, /no está confirmada/);
  assert.match(S.localAnswer('¿Qué es IA sin confirmar?', { ...base, lote: { n: 5, exp: null, aiUnconfirmed: 3 } }).text, /3 productos/);
  const q = S.localAnswer('¿Cuánta cuota llevo?', base);
  assert.match(q.text, /5 llamadas a Cohere/);
  assert.match(q.text, /7 respuestas se resolvieron sin IA/);
  assert.match(q.text, /llevas 1%|llevas 0%|llevas 1 %/);
});

test('las preguntas abiertas no se responden aquí (van a la IA)', () => {
  assert.equal(S.localAnswer('¿Qué es un dermocosmético y en qué se diferencia?', base), null);
  assert.equal(S.localAnswer('¿Cómo se arma el título de un suplemento?', base), null);
});

test('«¿Por qué?» de cada aviso: pregunta, explicación y acciones', () => {
  const snap = { ...base, lint: { ...base.lint, claim: [{ term: 'cura', field: 'Textura' }] } };
  const w = S.why('claim', snap);
  assert.match(w.question, /Claims prohibidos/);
  assert.match(w.text, /«cura» en Textura/);
  assert.deepEqual(w.actions, ['campo:textura']);
  ['vacio', 'amber', 'med', 'check', 'dup', 'mgblocked', 'faltantes', 'metaunconf', 'exportreasons', 'aiunconf'].forEach(k => {
    const x = S.why(k, base);
    assert.ok(x && x.question && x.text, k);
  });
  assert.equal(S.why('inexistente', base), null);
});
