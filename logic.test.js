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

/* ---------- Cosméticos y dermocosméticos ---------- */
const cos = { marca: 'La Roche-Posay', producto: 'Hyalu B5', tipo: 'Sérum', atributo: 'Ácido hialurónico', contenido: 'FCO 30ML', fabricante: "L'Oréal", piel: 'Piel sensible' };

test('cosméticos: las secciones nuevas son opcionales y no alteran el texto aprobado', () => {
  const base = F.computeFor('cos', cos, keep, meta).mg.html;
  assert.ok(!/Ingredientes:|Modo de uso:|Precauciones:|Protección solar:/.test(base));
  const conExtras = F.computeFor('cos', { ...cos, inci: 'AQUA, GLYCERIN, PEG-100 STEARATE, CI 77891', modo: 'APLICAR SOBRE LA PIEL LIMPIA. USAR DOS VECES AL DÍA.', precauciones: 'Evitar el contacto con los ojos.', fps: '50+', nivel: 'Muy alta' }, keep, meta).mg.html;
  assert.ok(conExtras.startsWith(base), 'el párrafo y la lista aprobados quedan igual');
  assert.match(conExtras, /<h2>Ingredientes:<\/h2>\n<p>AQUA, GLYCERIN, PEG-100 STEARATE, CI 77891<\/p>/);
  assert.match(conExtras, /<h2>Modo de uso:<\/h2>\n<p>Aplicar sobre la piel limpia\. Usar dos veces al día\.<\/p>/);
  assert.match(conExtras, /<li><strong>Nivel de protección:<\/strong> Muy alta<\/li>/);
});

test('cosméticos: la lista INCI se conserva y las siglas no se rompen', () => {
  assert.equal(F.sentenceCase('USAR FPS 50 Y PROTEGER DE UVA. NO APLICAR EN CEJAS.', keep), 'Usar FPS 50 y proteger de UVA. No aplicar en cejas.');
  assert.equal(F.fixCaps('CI 77891', keep, 'title'), 'CI 77891');
});

test('cosméticos: la revisión de lenguaje aplica la norma de etiquetado', () => {
  const L = F.lint(F.CATS.cos, { comercial: 'El mejor bloqueador solar con protección total todo el día', textura: 'Efecto terapéutico y cicatrizante' });
  const claims = L.claim.map(x => x.term);
  assert.ok(claims.includes('bloqueador solar') && claims.includes('protección total o al 100%') && claims.includes('todo el día'));
  assert.deepEqual(L.med.map(x => x.term).sort(), ['cicatrizante', 'terapéutico']);
  assert.ok(F.langCount(L) >= 5);
  const otra = F.lint(F.CATS.hig, { caracteristicas: 'bloqueador de olores' });
  assert.equal(otra.claim.length, 0, 'los términos de cosméticos no aplican a otras categorías');
});

test('cosméticos: las leyendas del empaque no disparan avisos de lenguaje', () => {
  const L = F.lint(F.CATS.cos, { precauciones: 'No constituye una protección al 100%. Puede causar irritación.', modo: 'Aplicar antes de la exposición al sol.' });
  assert.equal(F.langCount(L), 0);
});

test('protectores solares: FPS, nivel según la tabla y datos que faltan', () => {
  assert.equal(F.nivelPorFps('50+').nivel, 'Muy alta');
  assert.equal(F.nivelPorFps('50').nivel, 'Alta');
  assert.equal(F.nivelPorFps('30').nivel, 'Alta');
  assert.equal(F.nivelPorFps('15').nivel, 'Media');
  assert.equal(F.nivelPorFps('10').nivel, 'Baja');
  assert.equal(F.nivelPorFps('4').nivel, '');
  const desajuste = F.lint(F.CATS.cos, { fps: '50+', nivel: 'Alta', modo: 'x', precauciones: 'y' });
  assert.equal(desajuste.check.length, 1);
  assert.match(desajuste.check[0], /no coincide con la tabla/);
  const faltantes = F.lint(F.CATS.cos, { fps: '30' });
  assert.equal(faltantes.check.length, 3, 'nivel sin capturar, sin modo de uso y sin precauciones');
  assert.equal(F.lint(F.CATS.cos, { nivel: 'Alta' }).check.length, 1);
  assert.equal(F.lint(F.CATS.cos, {}).check.length, 0, 'sin FPS no se piden datos de protector solar');
});

test('extracción de cosméticos: FPS como campo propio', () => {
  const r = F.extractRaw('PROTECTOR SOLAR FACIAL SPF 50+ FCO 50ML', {});
  assert.equal(r.cat, 'cos');
  assert.equal(r.fields.fps, '50+');
  assert.equal(r.fields.atributo, 'FPS 50+');
  assert.equal(r.fields.tipo, 'Protector solar');
});

test('carga masiva: nivel de protección se normaliza', () => {
  const b = F.parseBulk('SKU,Categoría,Marca,Factor de protección solar (FPS),Nivel de protección\nC1,Cosméticos,Isdin,50+,muy alta\nC2,Cosméticos,Isdin,30,inventado\n', '');
  assert.equal(b.rows[0].v.nivel, 'Muy alta');
  assert.equal(b.rows[0].v.fps, '50+');
  assert.equal(b.rows[1].v.nivel, undefined);
});

/* ---------- Nombre y tipo de producto que coinciden ---------- */
const cerave = { marca: 'CeraVe', producto: 'Crema Hidratante', tipo: 'Crema', atributo: 'Ceramidas', contenido: '454 g', fabricante: "L'Oréal" };

test('nombre y tipo iguales: el título no repite el tipo', () => {
  const r = F.computeFor('cos', cerave, keep, meta);
  assert.equal(r.title.title, "CeraVe Crema Hidratante | Ceramidas | 454 g | L'Oréal");
  assert.deepEqual(r.title.missing, []);
  assert.deepEqual(r.title.segs[0].omitted, ['Tipo de producto']);
});

test('nombre y tipo: basta con capturar uno de los dos', () => {
  const soloNombre = F.computeFor('cos', { ...cerave, tipo: '' }, keep, meta);
  const soloTipo = F.computeFor('cos', { ...cerave, producto: '', tipo: 'Crema hidratante' }, keep, meta);
  assert.equal(soloNombre.title.title, "CeraVe Crema Hidratante | Ceramidas | 454 g | L'Oréal");
  assert.equal(soloTipo.title.title, "CeraVe Crema hidratante | Ceramidas | 454 g | L'Oréal");
  assert.deepEqual(soloNombre.title.missing, []);
  assert.deepEqual(soloTipo.title.missing, []);
  const ninguno = F.computeFor('cos', { ...cerave, producto: '', tipo: '' }, keep, meta);
  assert.deepEqual(ninguno.title.missing, ['Nombre del producto o tipo de producto']);
});

test('nombre y tipo distintos se conservan, y la marca al inicio del nombre no se duplica', () => {
  assert.equal(F.computeFor('cos', { ...cos, marca: 'La Roche-Posay' }, keep, meta).title.segs[0].text, 'La Roche-Posay Hyalu B5 Sérum');
  assert.equal(F.computeFor('cos', { ...cerave, producto: 'CeraVe Crema Hidratante', tipo: '' }, keep, meta).title.segs[0].text, 'CeraVe Crema Hidratante');
});

test('nombre y tipo iguales: descripción de Merchant Center, metas y alt tampoco lo repiten', () => {
  const r = F.computeFor('cos', cerave, keep, meta);
  assert.match(r.mc.text, /^CeraVe Crema Hidratante Ceramidas 454 g - L'Oréal\./);
  assert.equal(r.meta.mt.text, 'CeraVe Crema Hidratante | Ceramidas');
  assert.equal(r.meta.alt.text, 'CeraVe Crema Hidratante, 454 g');
  assert.match(r.mg.html, /Nombre del Producto:<\/strong> Crema Hidratante/, 'Magento conserva ambas filas aprobadas');
  assert.match(r.mg.html, /Tipo de Producto:<\/strong> Crema</);
});

test('extracción de cosméticos: tipos compuestos', () => {
  const r = F.extractRaw('CERAVE CREMA HIDRATANTE 454G', {});
  assert.equal(r.cat, 'cos');
  assert.equal(r.fields.tipo, 'Crema hidratante');
  assert.equal(r.fields.contenido, '454 g');
});

test('exportación: los datos sugeridos por IA sin confirmar no llegan a Magento salvo que se active', () => {
  const items = [
    { sku: 'A1', cat: 'med', v: med, ai: { laboratorio: 'sugerido' } },
    { sku: 'A2', cat: 'med', v: med, ai: { marca: 'extraido' } },
    { sku: 'A3', cat: 'med', v: med },
    { sku: 'A4', cat: 'med', v: med, ai: { inci: 'imagen' } }
  ];
  const sin = F.magentoBatch(items, keep, meta, F.defExp());
  assert.deepEqual(sin.rows.map(r => r[0]), ['A2', 'A3']);
  assert.equal(sin.excluded.ia, 2, 'lo sugerido por IA y lo leído de fotos quedan sin exportar hasta confirmarlo');
  const con = F.magentoBatch(items, keep, meta, { ...F.defExp(), incIA: true });
  assert.equal(con.rows.length, 4);
});
