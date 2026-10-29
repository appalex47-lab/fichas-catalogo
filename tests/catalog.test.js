'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../js/logic.js');
const C = require('../js/catalog.js');

const AT = '2026-10-29T10:00:00Z';
const item = (sku, cat, v) => ({ sku, cat, v });
const rx = (sku, marca) => item(sku, 'med', { marca, receta: 'si', especialidad: 'no' });
const otc = (sku, marca) => item(sku, 'med', { marca, receta: 'no', especialidad: 'no' });
const nutri = (sku, marca) => item(sku, 'beb', { marca });

test('elegibilidad: solo es complemento lo que no es medicamento o es OTC declarado sin alta especialidad', () => {
  assert.equal(F.complementEligible('beb', { marca: 'x' }), true);
  assert.equal(F.complementEligible('sup', {}), true);
  assert.equal(F.complementEligible('med', { receta: 'no', especialidad: 'no' }), true);
  assert.equal(F.complementEligible('med', { receta: 'si', especialidad: 'no' }), false);
  assert.equal(F.complementEligible('med', { receta: 'no', especialidad: 'si' }), false);
  assert.equal(F.complementEligible('med', { receta: 'no' }), false, 'alta especialidad sin declarar no es elegible');
  assert.equal(F.complementEligible('med', { especialidad: 'no' }), false, 'receta sin declarar no es elegible');
});

test('catálogo: guarda sin SKU no crea ficha y el estado inicial depende de la elegibilidad', () => {
  const c = C.empty();
  assert.equal(C.upsert(c, item('', 'beb', { marca: 'X' }), 'X', AT).entry, null);
  const a = C.upsert(c, nutri('FRE-1', 'Fresubin'), 'Fresubin 200 mL', AT).entry;
  const b = C.upsert(c, rx('MOU-1', 'Mounjaro'), 'Mounjaro 2.5 mg', AT).entry;
  assert.equal(C.status(c, a), 'sin_evaluar');
  assert.equal(C.status(c, b), 'no_aplica');
  assert.ok(C.isParent(b) && !C.isParent(a));
  C.setParent(c, 'FRE-1', true);
  assert.ok(C.isParent(a));
});

test('catálogo: candidatos a principal y complementos en espera', () => {
  const c = C.empty();
  const f = C.upsert(c, nutri('FRE-1', 'Fresubin'), 'Fresubin', AT).entry;
  assert.deepEqual(C.candidateParents(c, f), [], 'sin principal todavía');
  C.setComp(c, 'FRE-1', 'esperando');
  assert.equal(C.status(c, f), 'esperando');
  const m = C.upsert(c, rx('MOU-1', 'Mounjaro'), 'Mounjaro', AT).entry;
  assert.deepEqual(C.waitingChildren(c, m).map(x => x.sku), ['FRE-1']);
  assert.deepEqual(C.candidateParents(c, f).map(x => x.sku), ['MOU-1']);
});

test('catálogo: un medicamento con receta o de alta especialidad no se puede vincular como complemento', () => {
  const c = C.empty();
  C.upsert(c, rx('MOU-1', 'Mounjaro'), 'Mounjaro', AT);
  C.upsert(c, rx('WEG-1', 'Wegovy'), 'Wegovy', AT);
  C.upsert(c, item('HE-1', 'med', { marca: 'Especial', receta: 'no', especialidad: 'si' }), 'Especial', AT);
  assert.equal(C.link(c, 'MOU-1', 'WEG-1', { by: 'manual', at: AT }).ok, false);
  assert.equal(C.link(c, 'MOU-1', 'HE-1', { by: 'ia', at: AT }).ok, false);
  assert.equal(C.setComp(c, 'WEG-1', 'esperando'), false);
  assert.deepEqual([...C.crosssellMap(c)], []);
});

test('catálogo: vincular, no repetir, desvincular y cambiar de estado', () => {
  const c = C.empty();
  C.upsert(c, rx('MOU-1', 'Mounjaro'), 'Mounjaro', AT);
  const f = C.upsert(c, nutri('FRE-1', 'Fresubin'), 'Fresubin', AT).entry;
  C.setComp(c, 'FRE-1', 'esperando');
  assert.equal(C.link(c, 'MOU-1', 'FRE-1', { by: 'ia', at: AT, why: 'nutrición oral' }).ok, true);
  assert.equal(C.link(c, 'MOU-1', 'FRE-1', {}).already, true);
  assert.equal(c.links.length, 1);
  assert.equal(C.status(c, f), 'vinculado');
  assert.deepEqual(C.childrenOf(c, 'MOU-1').map(x => x.sku), ['FRE-1']);
  assert.deepEqual(C.parentsOf(c, 'FRE-1').map(x => x.sku), ['MOU-1']);
  assert.equal(C.link(c, 'FRE-1', 'FRE-1', {}).ok, false);
  assert.ok(C.unlink(c, 'MOU-1', 'FRE-1'));
  assert.equal(C.status(c, f), 'sin_evaluar');
});

test('catálogo: si un complemento pasa a requerir receta pierde sus vínculos', () => {
  const c = C.empty();
  C.upsert(c, rx('MOU-1', 'Mounjaro'), 'Mounjaro', AT);
  C.upsert(c, otc('OTC-1', 'Suero'), 'Suero', AT);
  C.link(c, 'MOU-1', 'OTC-1', { by: 'manual', at: AT });
  const r = C.upsert(c, rx('OTC-1', 'Suero'), 'Suero', AT);
  assert.equal(r.removed.length, 1);
  assert.equal(c.links.length, 0);
  assert.equal(C.status(c, r.entry), 'no_aplica');
});

test('catálogo: el mapa del CSV y los SKU ya exportados', () => {
  const c = C.empty();
  C.upsert(c, rx('MOU-1', 'Mounjaro'), 'Mounjaro', AT);
  C.upsert(c, nutri('FRE-1', 'Fresubin'), 'Fresubin', AT);
  C.link(c, 'MOU-1', 'FRE-1', { by: 'manual', at: AT });
  assert.deepEqual([...C.crosssellMap(c)], [['mou-1', ['FRE-1']]]);
  assert.equal(C.knownSkus(c).size, 0);
  assert.equal(C.markExported(c, ['fre-1'], AT), 1);
  assert.deepEqual([...C.knownSkus(c)], ['fre-1']);
});

test('catálogo: borrar una ficha quita sus vínculos y normalize repara datos dañados', () => {
  const c = C.empty();
  C.upsert(c, rx('MOU-1', 'Mounjaro'), 'Mounjaro', AT);
  C.upsert(c, nutri('FRE-1', 'Fresubin'), 'Fresubin', AT);
  C.link(c, 'MOU-1', 'FRE-1', {});
  assert.ok(C.remove(c, 'FRE-1'));
  assert.equal(c.links.length, 0);
  assert.deepEqual(C.normalize(null), C.empty());
  const bad = C.normalize({ entries: [{ sku: 'A' }, { sku: 'a' }, null, {}], links: [{ p: 'A', c: 'Z' }, { p: 'A', c: 'A' }] });
  assert.equal(bad.entries.length, 1);
  assert.equal(bad.links.length, 0);
});

test('CSV: los complementos del catálogo solo salen si el SKU va en el archivo o ya se exportó, y los no elegibles nunca', () => {
  const meta = F.defMeta();
  const med = (sku, marca, over) => ({ sku, cat: 'med', v: { marca, concentracion: '2.5 mg', principio: 'Tirzepatida', forma: 'Solución inyectable', contenido: 'Caja con 4 plumas', laboratorio: 'Eli Lilly', via: 'Subcutánea', receta: 'si', especialidad: 'no', ...over } });
  const beb = (sku, marca) => ({ sku, cat: 'beb', v: { marca, tipo: 'Suero oral', sabor: 'Coco', atributo: 'Sin azúcar', contenido: '625 mL' } });
  const col = (ex, sku) => ex.rows.find(r => r[0] === sku)[ex.header.indexOf('crosssell_skus')];
  const cross = new Map([['mou-1', ['SUE-1', 'FRE-1', 'WEG-1']]]);
  const solo = F.magentoBatch([med('MOU-1', 'Mounjaro'), beb('SUE-1', 'Electrolit')], new Set(), meta, { relations: true, catalogCross: cross, knownSkus: new Set(['fre-1']) });
  assert.equal(col(solo, 'MOU-1'), 'SUE-1|FRE-1', 'SUE-1 va en el archivo, FRE-1 ya se exportó, WEG-1 no está');
  const sin = F.magentoBatch([med('MOU-1', 'Mounjaro')], new Set(), meta, { relations: true, catalogCross: cross });
  assert.equal(col(sin, 'MOU-1'), '');
  const compat = F.relations([{ sku: 'DIS-1', cat: 'dis', v: { marca: 'A', compat: 'MOU-1, SUE-1' } }, { sku: 'MOU-1', cat: 'med', v: { marca: 'M', receta: 'si', especialidad: 'no' } }, { sku: 'SUE-1', cat: 'beb', v: { marca: 'E' } }]);
  assert.deepEqual(compat.get('dis-1').crosssell, ['SUE-1'], 'el medicamento con receta no puede ir como compatible');
});

test('catálogo: el nombre para mostrar es corto y el título completo se conserva para la IA', () => {
  assert.equal(C.shortName('med', { marca: 'Mounjaro', concentracion: '2.5 mg', volumen: '0.6 mL', principio: 'Tirzepatida' }), 'Mounjaro 2.5 mg / 0.6 mL');
  assert.equal(C.shortName('beb', { marca: 'Fresubin', tipo: 'Nutrición oral', sabor: 'Vainilla', contenido: '200 mL' }), 'Fresubin Nutrición oral 200 mL');
  const c = C.empty();
  const e = C.upsert(c, item('FRE-1', 'beb', { marca: 'Fresubin', tipo: 'Nutrición oral', contenido: '200 mL' }), 'Fresubin Nutrición oral | Sabor Vainilla | 200 mL', AT).entry;
  assert.equal(e.nombre, 'Fresubin Nutrición oral 200 mL');
  assert.equal(e.titulo, 'Fresubin Nutrición oral | Sabor Vainilla | 200 mL');
});

/* ---------- Campana de notificaciones ---------- */
test('campana: un producto nuevo sin exportar avisa aparte y descartar lo oculta', () => {
  const c = C.empty();
  C.upsert(c, nutri('FRE-1', 'Fresubin'), 'Fresubin', AT);
  assert.deepEqual(C.alerts(c).map(a => [a.type, a.sku]), [['nuevo', 'FRE-1']]);
  assert.ok(C.dismiss(c, 'FRE-1'));
  assert.deepEqual(C.alerts(c), []);
});

test('campana: un cross sell nuevo avisa solo al principal y solo con SKU ya cargados', () => {
  const c = C.empty();
  C.upsert(c, otc('OTC-1', 'Marca A'), 'Principal OTC', AT);
  C.upsert(c, nutri('FRE-1', 'Fresubin'), 'Fresubin', AT);
  C.markExported(c, ['OTC-1', 'FRE-1'], AT);
  assert.deepEqual(C.alerts(c), [], 'recién exportados no avisan');
  C.upsert(c, rx('MOU-1', 'Mounjaro'), 'Mounjaro', AT);
  C.markExported(c, ['MOU-1'], AT);
  assert.deepEqual(C.alerts(c).map(a => a.sku), [], 'al exportarse queda al día');
  assert.ok(C.link(c, 'MOU-1', 'FRE-1', { by: 'manual', at: AT }).ok);
  const a = C.alerts(c);
  assert.deepEqual(a.map(x => [x.type, x.sku]), [['rel', 'MOU-1']], 'Fresubin no recibe aviso');
  assert.deepEqual(a[0].add.crosssell, ['FRE-1']);
  const csv = C.relUpdateCsv(c, ['MOU-1']);
  assert.equal(csv.rows.length, 1);
  assert.equal(csv.rows[0][csv.header.indexOf('sku')], 'MOU-1');
  assert.equal(csv.rows[0][csv.header.indexOf('crosssell_skus')], 'FRE-1');
  assert.equal(csv.rows[0].filter(Boolean).length, 2, 'solo SKU y vínculos');
  C.markExported(c, ['MOU-1'], AT);
  assert.deepEqual(C.alerts(c), []);
});

test('campana: relacionados y alternativas avisan a ambos lados y un vínculo a un producto sin cargar no avisa', () => {
  const c = C.empty();
  const med = (sku, marca) => item(sku, 'med', { marca, principio: 'Paracetamol', concentracion: '500 mg', forma: 'Tableta', contenido: 'Caja con 10', receta: 'no', especialidad: 'no' });
  C.upsert(c, med('A', 'Tempra'), 'Tempra', AT);
  C.markExported(c, ['A'], AT);
  C.upsert(c, med('B', 'Dolex'), 'Dolex', AT);
  assert.deepEqual(C.alerts(c).filter(x => x.type === 'rel'), [], 'B aún no está en Magento');
  C.markExported(c, ['B'], AT);
  const rel = C.alerts(c).filter(x => x.type === 'rel');
  assert.deepEqual(rel.map(x => x.sku), ['A'], 'A ya estaba cargado y gana una alternativa; B se exportó con ella');
  assert.deepEqual(rel[0].add.upsell, ['B']);
});

test('campana: lo exportado antes de existir la campana toma su estado como punto de partida', () => {
  const c = C.empty();
  C.upsert(c, nutri('FRE-1', 'Fresubin'), 'Fresubin', AT);
  c.entries[0].exportedAt = AT;
  assert.equal(C.baseline(c), 1);
  assert.deepEqual(C.alerts(c), []);
  assert.equal(C.baseline(c), 0);
});
