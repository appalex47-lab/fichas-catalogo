'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../logic.js');

const keep = new Set(['gnc', 'omron', 'gsk']);
const med = { marca: 'MOUNJARO', concentracion: '2.5MG', volumen: '0.6ML', principio: 'TIRZEPATIDA', forma: 'SOL INY', contenido: 'CAJ C/4 PLUMAS', laboratorio: 'ELI LILLY', via: 'Subcutánea', receta: 'si' };
const meta = F.defMeta();

test('normaliza unidades, mayúsculas y presentación', () => {
  assert.equal(F.normUnits('500mg 10ML 5GR', 'mL'), '500 mg 10 mL 5 g');
  assert.equal(F.normUnits('10ML', 'ml'), '10 ml');
  assert.equal(F.expandPres('CAJ C/30 TAB'), 'Caja con 30 tabletas');
  assert.equal(F.expandPres('C/30'), 'Caja con 30 piezas');
  assert.equal(F.expandPres('X 30'), 'Caja con 30 piezas');
  assert.equal(F.fixCaps('ELI LILLY', keep, 'title'), 'ELI Lilly'.replace('ELI', 'Eli'));
  assert.equal(F.normUnits('150 UG', 'mL'), '150 UG', 'no convierte UG a mcg');
});

test('título de medicamentos: sin piezas en la forma', () => {
  const r = F.computeFor('med', med, keep, meta);
  assert.equal(r.title.title, 'Mounjaro 2.5 mg / 0.6 mL | Tirzepatida | Solución inyectable | Laboratorio Eli Lilly');
  assert.deepEqual(r.title.missing, []);
});

test('meta title y description con la estructura de medicamentos', () => {
  const r = F.computeFor('med', med, keep, meta);
  assert.equal(r.meta.mt.text, 'Comprar Mounjaro 2.5 mg | Tirzepatida | Eli Lilly');
  assert.equal(r.meta.md.text, 'El Mounjaro de 2.5 mg contiene Tirzepatida por Eli Lilly | Venta en línea con receta médica de forma segura');
  const sinReceta = F.computeFor('med', { ...med, receta: 'no' }, keep, meta);
  assert.equal(sinReceta.meta.md.text, 'El Mounjaro de 2.5 mg contiene Tirzepatida por Eli Lilly | Venta en línea de forma segura');
});

test('alt de imagen: natural, sin "imagen de" y con límite', () => {
  const r = F.computeFor('med', med, keep, meta);
  assert.equal(r.meta.alt.text, 'Mounjaro 2.5 mg, Tirzepatida, caja con 4 plumas');
  assert.ok(!r.meta.alt.over);
});

test('Magento se bloquea sin receta declarada o sin principio activo', () => {
  const sin = F.computeFor('med', { ...med, receta: '' }, keep, meta);
  assert.ok(sin.mg.blocked && sin.mg.blocked.length === 1);
  const ok = F.computeFor('med', med, keep, meta);
  assert.equal(ok.mg.blocked, null);
  assert.match(ok.mg.html, /<h2>Ficha técnica del producto:<\/h2>/);
  assert.equal(ok.mg.meta.receta, 'Sí');
});

test('exportación en formato Batch: 104 columnas y valores por defecto', () => {
  const ex = F.magentoBatch([{ sku: 'SKU-1', img: '', cat: 'med', v: med }, { sku: '', cat: 'med', v: med }], keep, meta, F.defExp());
  assert.equal(ex.header.length, 104);
  assert.equal(ex.header[0], 'sku');
  assert.equal(ex.rows.length, 1);
  assert.equal(ex.excluded.sinSku, 1);
  const g = k => ex.rows[0][ex.header.indexOf(k)];
  for (const k of ['product_online', 'use_config_min_qty', 'use_config_min_sale_qty', 'use_config_max_sale_qty', 'use_config_notify_stock_qty', 'use_config_manage_stock']) assert.equal(g(k), '1', k);
  assert.equal(g('additional_attributes'), 'categoria_prod=Mounjaro 2.5 mg / 0.6 mL | Tirzepatida | Solución inyectable | Laboratorio Eli Lilly');
  assert.equal(g('short_description'), g('meta_description'));
  assert.equal(g('name'), '');
  assert.equal(g('meta_keywords'), '');
  assert.ok(g('base_image_label').length > 0);
  assert.ok(F.batchCsv(ex).endsWith('\r\n'));
});

test('categorías sin estructura de meta confirmada exportan las metas vacías', () => {
  const ex = F.magentoBatch([{ sku: 'B1', cat: 'beb', v: { marca: 'Electrolit', tipo: 'Suero oral', sabor: 'Coco', atributo: 'Sin azúcar', contenido: '625ML' } }], keep, meta, F.defExp());
  assert.equal(ex.rows.length, 1);
  assert.equal(ex.excluded.sinMeta, 1);
  assert.equal(ex.rows[0][ex.header.indexOf('meta_title')], '');
});

test('codificación Windows-1252', () => {
  const a = F.encodeCp1252('áé€');
  assert.deepEqual([...a.bytes], [0xE1, 0xE9, 0x80]);
  assert.equal(F.encodeCp1252('漢').lost, 1);
});

test('CSV: comillas, delimitadores y carga masiva', () => {
  const p = F.parseCSV('a;b;c\r\n1;"x;y";"di ""hola"""\r\n');
  assert.equal(p.delim, ';');
  assert.deepEqual(p.rows[1], ['1', 'x;y', 'di "hola"']);
  const b = F.parseBulk('SKU,Categoría,Marca,Principio activo,Forma farmacéutica,¿Requiere receta médica?\nA1,Medicamentos,Ozempic,Semaglutida,SOL INY,Sí\nEJEMPLO,Medicamentos,x,,,\n', '');
  assert.equal(b.rows.length, 1);
  assert.equal(b.skippedExample, 1);
  assert.equal(b.rows[0].cat, 'med');
  assert.equal(b.rows[0].v.receta, 'si');
});

test('extracción por reglas: solo copia lo que aparece en el texto', () => {
  const dic = { marcas: F.parseDic('Lamobrigan'), labs: F.parseDic('PISA=Pisa'), principios: F.parseDic('Escitalopram') };
  const r = F.extractRaw('LAMOBRIGAN ESCITALOPRAM 10MG TAB CAJ C/28 PISA', { dic });
  assert.equal(r.cat, 'med');
  assert.deepEqual(r.fields, { marca: 'Lamobrigan', laboratorio: 'Pisa', principio: 'Escitalopram', concentracion: '10 mg', forma: 'Tableta', contenido: 'CAJ C/28 tabletas' });
  assert.deepEqual(r.leftover, []);
});

test('extracción: sin diccionario no inventa marca, laboratorio ni activo', () => {
  const r = F.extractRaw('MOUNJARO 2.5MG/0.6ML SOL INY CAJ C/4 LILLY', {});
  assert.equal(r.cat, 'med');
  assert.equal(r.fields.marca, undefined);
  assert.equal(r.fields.laboratorio, undefined);
  assert.equal(r.fields.principio, undefined);
  assert.equal(r.fields.concentracion, '2.5 mg');
  assert.equal(r.fields.volumen, '0.6 mL');
  assert.equal(r.fields.forma, 'Solución inyectable');
  assert.deepEqual(r.leftover, ['MOUNJARO', 'LILLY']);
});

test('extracción: receta solo si el texto la declara y categoría por palabras clave', () => {
  assert.equal(F.extractRaw('ATORVASTATINA 20 MG TAB C/30', {}).fields.receta, undefined);
  assert.equal(F.extractRaw('ATORVASTATINA 20 MG TAB C/30 RX', {}).fields.receta, 'si');
  assert.equal(F.extractRaw('ELECTROLIT SUERO ORAL COCO 625ML SIN AZUCAR', {}).cat, 'beb');
  assert.equal(F.extractRaw('OMRON HEM-7121 BAUMANOMETRO DIGITAL', {}).cat, 'dis');
  assert.equal(F.extractRaw('ZZZ QWERTY 123', {}).cat, null);
});

test('revisión de lenguaje marca claims prohibidos', () => {
  const L = F.lint(F.CATS.cos, { textura: 'Es el mejor, cura y previene', atributo: 'Hidratación intensa' });
  assert.ok(L.claim.length >= 2);
  assert.equal(L.amber.length, 1);
});
