'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../js/logic.js');

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

test('título de medicamentos: incluye forma y presentación/piezas', () => {
  const r = F.computeFor('med', med, keep, meta);
  assert.equal(r.title.title, 'Mounjaro 2.5 mg / 0.6 mL | Tirzepatida | Solución inyectable, Caja con 4 plumas | Laboratorio Eli Lilly');
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
  assert.equal(g('additional_attributes'), 'categoria_prod=Mounjaro 2.5 mg / 0.6 mL | Tirzepatida | Solución inyectable; Caja con 4 plumas | Laboratorio Eli Lilly');
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
  const sinFaq = h => h.split('\n<br />\n<h2>Preguntas frecuentes:</h2>')[0];
  const base = sinFaq(F.computeFor('cos', cos, keep, meta).mg.html);
  assert.ok(!/Ingredientes:|Modo de uso:|Precauciones:|Protección solar:/.test(base));
  const conExtras = F.computeFor('cos', { ...cos, inci: 'AQUA, GLYCERIN, PEG-100 STEARATE, CI 77891', modo: 'APLICAR SOBRE LA PIEL LIMPIA. USAR DOS VECES AL DÍA.', precauciones: 'Evitar el contacto con los ojos.', fps: '50+', nivel: 'Muy alta' }, keep, meta).mg.html;
  assert.ok(sinFaq(conExtras).startsWith(base), 'el párrafo y la lista aprobados quedan igual');
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

/* ---------- Bloque de indicaciones y preguntas frecuentes ---------- */
const medFaq = { marca: 'Mounjaro', concentracion: '2.5 mg', volumen: '0.6 mL', principio: 'Tirzepatida', forma: 'Solución inyectable', contenido: 'Caja con 4 plumas', laboratorio: 'Eli Lilly', via: 'Subcutánea', receta: 'si' };

test('medicamentos: indicaciones, posología, población y contraindicaciones son opcionales y van antes de la conservación', () => {
  const sinFaq = h => h.split('\n<br />\n<h2>Preguntas frecuentes:</h2>')[0];
  const base = F.computeFor('med', medFaq, keep, meta).mg.html;
  assert.ok(!/Indicaciones:|Cómo se usa:|Contraindicaciones/.test(sinFaq(base)));
  const html = F.computeFor('med', { ...medFaq, indicaciones: 'Control glucémico en adultos con diabetes tipo 2', posologia: 'Una vez por semana', contraindicaciones: 'No usar en caso de hipersensibilidad' }, keep, meta).mg.html;
  assert.match(html, /<h2>Indicaciones:<\/h2>\n<p>Control glucémico en adultos con diabetes tipo 2<\/p>/);
  assert.match(html, /<h2>Cómo se usa:<\/h2>\n<p>Una vez por semana<\/p>/);
  assert.ok(html.indexOf('Contraindicaciones y advertencias:') < html.indexOf('Condiciones de conservación:'));
});

test('FAQ: cada pregunta existe solo si el dato que la responde fue capturado', () => {
  const q = r => [...new Set([...Array(12).keys()].flatMap(sd => F.buildFaq(F.CATS.med, r, sd).items.map(x => x[0])))];
  const base = q(medFaq);
  assert.ok(base.some(x => /Qué contiene Mounjaro/.test(x)) && base.some(x => /Cómo se conserva/.test(x)));
  assert.ok(!base.some(x => /Para qué se usa|Cómo se usa|Quién no debe/.test(x)));
  assert.ok(q({ ...medFaq, indicaciones: 'Control glucémico' }).some(x => /Para qué se usa/.test(x)));
  assert.ok(!q({ ...medFaq, laboratorio: '' }).some(x => /Quién fabrica/.test(x)));
});

test('FAQ: texto literal escapado, sin JSON-LD y sin contradecir la receta declarada', () => {
  const html = F.computeFor('med', { ...medFaq, receta: 'no', posologia: 'Tomar <1> tableta' }, keep, meta).mg.html;
  assert.match(html, /<h2>Preguntas frecuentes:<\/h2>\n<h3>/);
  assert.match(html, /<p>Tomar &lt;1&gt; tableta\.<\/p>/);
  assert.ok(!/ld\+json|FAQPage/.test(html));
  assert.match(html, /<h3>¿Es necesaria la receta médica para Mounjaro\?<\/h3>\n<p>No requiere receta médica\./);
});

test('FAQ: sin suficientes datos no se genera y un producto bloqueado no la tiene', () => {
  assert.equal(F.buildFaq(F.CATS.med, {}).html, '');
  const r = F.computeFor('med', { ...medFaq, receta: '' }, keep, meta).mg;
  assert.ok(r.blocked && r.html === '' && !r.faq);
});

test('FAQ: la variante es estable para un mismo producto y cambia entre productos', () => {
  const a1 = F.computeFor('med', medFaq, keep, meta).mg.html, a2 = F.computeFor('med', medFaq, keep, meta).mg.html;
  assert.equal(a1, a2);
  const marcas = ['Mounjaro', 'Ozempic', 'Victoza', 'Trulicity', 'Wegovy', 'Saxenda', 'Byetta', 'Bydureon'];
  const firmas = new Set(marcas.map(m => F.computeFor('med', { ...medFaq, marca: m }, keep, meta).mg.faq.map(x => x[0].replace(m, 'X')).join('|')));
  assert.ok(firmas.size > 1, 'productos distintos no usan todos la misma redacción');
});

test('FAQ: todas las variantes cumplen las reglas de lenguaje y no tocan textos literales ni regulatorios', () => {
  const lleno = { ...medFaq, categoria: 'Endocrinología', indicaciones: 'Control glucémico', posologia: 'Una vez por semana', poblacion: 'Adultos', contraindicaciones: 'Hipersensibilidad' };
  const cosF = { marca: 'La Roche-Posay', producto: 'Hyalu B5', atributo: 'Ácido hialurónico', contenido: 'Frasco 30 mL', fabricante: "L'Oréal", piel: 'Piel sensible', modo: 'Aplicar sobre la piel limpia', precauciones: 'Evitar contacto con ojos', fps: '50+', nivel: 'Muy alta', inci: 'AQUA, GLYCERIN' };
  const supF = { marca: 'GNC', componente: 'Vitamina C', forma: 'Cápsulas', contenido: 'Frasco con 100 piezas', fabricante: 'GNC' };
  const disF = { marca: 'Omron', modelo: 'HEM-7121', tipo: 'Baumanómetro', tecnologia: 'Automático de brazo', fabricante: 'Omron', uso: 'medición de presión arterial', paquete: 'Brazalete y estuche' };
  for (const [id, v] of [['med', lleno], ['med', { ...lleno, receta: 'no' }], ['cos', cosF], ['sup', supF], ['dis', disF]]) {
    for (let sd = 0; sd < 12; sd++) {
      const { items } = F.buildFaq(F.CATS[id], v, sd);
      const txt = items.map(x => x.join(' ')).join(' ');
      assert.ok(!F.COMERCIAL_RE.test(txt), `${id} seed ${sd}: lenguaje comercial`);
      assert.deepEqual(F.scanRed(txt, id), [], `${id} seed ${sd}: claims`);
      if (id === 'med' && v.receta === 'no') assert.ok(!/(?<!no )(?<!sin )\b(?:requiere receta|con receta|bajo receta)/i.test(txt), 'contradice receta');
      if (id === 'med') {
        for (const lit of [lleno.indicaciones, lleno.posologia, lleno.poblacion, lleno.contraindicaciones]) assert.ok(items.some(x => x[1] === lit + '.'), `texto literal intacto: ${lit}`);
        assert.ok(items.some(x => x[1] === F.LEGEND.medConservacion), 'conservación intacta');
      }
    }
  }
});

/* ---------- Relacionados, alternativas y compatibles ---------- */
const mk = (sku, marca, over = {}) => ({ sku, cat: 'med', v: { marca, concentracion: '500 mg', principio: 'Paracetamol', forma: 'Tabletas', contenido: 'Caja con 20 tabletas', laboratorio: 'Lab Uno', via: 'Oral', receta: 'no', ...over } });

test('relaciones: alternativas = mismo principio, concentración, presentación y receta, de otra marca', () => {
  const r = F.relations([
    mk('A1', 'Tempra'), mk('A2', 'Tylenol'), mk('A3', 'Genérico', { laboratorio: 'Lab Dos' }),
    mk('B1', 'Tempra', { concentracion: '650 mg' }),
    mk('C1', 'Otra', { contenido: 'Caja con 10 tabletas' }),
    mk('D1', 'Rx', { receta: 'si' }),
    mk('E1', 'Pomada', { principio: 'Ibuprofeno' })
  ]);
  assert.deepEqual(r.get('a1').upsell, ['A2', 'A3']);
  assert.ok(!r.get('a1').upsell.includes('B1') && !r.get('a1').upsell.includes('C1') && !r.get('a1').upsell.includes('D1') && !r.get('a1').upsell.includes('E1'));
});

test('relaciones: relacionados = misma marca o laboratorio, sin repetir alternativas ni a sí mismo', () => {
  const r = F.relations([mk('A1', 'Tempra'), mk('A2', 'Tylenol'), mk('B1', 'Tempra', { concentracion: '650 mg' }), mk('F1', 'Zeta', { principio: 'Otro', laboratorio: 'Lab Tres' })]);
  assert.deepEqual(r.get('a1').related, ['B1', 'A2'].filter(x => x !== 'A2'));
  assert.ok(!r.get('a1').related.includes('A1'));
  assert.ok(!r.get('a1').related.includes('F1'));
});

test('relaciones: los compatibles solo salen de lo capturado y apuntan a SKU existentes', () => {
  const dis = { sku: 'GLU1', cat: 'dis', v: { marca: 'Accu', compat: 'TIRA1, tira2; NOEXISTE, GLU1' } };
  const acc = (sku) => ({ sku, cat: 'acc', v: { marca: 'Accu' } });
  const r = F.relations([dis, acc('TIRA1'), acc('TIRA2')]);
  assert.deepEqual(r.get('glu1').crosssell, ['TIRA1', 'TIRA2']);
  assert.deepEqual(F.relations([dis]).get('glu1').crosssell, []);
});

test('relaciones: el CSV las llena solo con opts.relations y solo con SKU del mismo archivo', () => {
  const items = [mk('A1', 'Tempra'), mk('A2', 'Tylenol'), mk('A3', 'Sin receta declarada', { receta: '' })];
  const col = (ex, sku, c) => ex.rows.find(r => r[0] === sku)[ex.header.indexOf(c)];
  const off = F.magentoBatch(items, keep, meta, {});
  assert.equal(col(off, 'A1', 'upsell_skus'), '');
  const on = F.magentoBatch(items, keep, meta, { relations: true });
  assert.equal(col(on, 'A1', 'upsell_skus'), 'A2');
  assert.equal(col(on, 'A2', 'upsell_skus'), 'A1');
  assert.ok(on.contract.ok);
  assert.deepEqual(on.relations, { upsell: 2, related: 0, crosssell: 0 });
});

test('área terapéutica y ATC: campos de medicamentos y área en las demás categorías, sin tocar los textos', () => {
  assert.ok(['area', 'area2', 'atc'].every(k => F.CATS.med.fields.some(f => f.key === k)));
  assert.ok(Object.keys(F.CATS).filter(id => id !== 'med').every(id => F.CATS[id].fields.some(f => f.key === 'area')));
  const base = F.computeFor('med', medFaq, keep, meta);
  const con = F.computeFor('med', { ...medFaq, area: 'Diabetes y metabolismo', area2: 'Control de peso', atc: 'a10bx 16' }, keep, meta);
  assert.equal(con.mg.html, base.mg.html);
  assert.equal(con.title.title, base.title.title);
  assert.equal(con.vt.v.atc, 'A10BX16');
  assert.deepEqual(F.lint(F.CATS.med, { atc: 'A10BX16' }).check, []);
  assert.match(F.lint(F.CATS.med, { atc: 'ZZZ' }).check.join(' '), /formato esperado/);
  ['A', 'A10', 'A10B', 'A10BX', 'A10BX16'].forEach(c => assert.ok(F.ATC_RE.test(c), c));
  ['a10', 'A1', 'A10BX1', '10A', ''].forEach(c => assert.ok(!F.ATC_RE.test(c), c));
});

test('categoría del medicamento: se captura con los datos principales y sale en la ficha técnica y en la FAQ', () => {
  const f = F.CATS.med.fields;
  assert.ok(!f.find(x => x.key === 'categoria').g && !f.find(x => x.key === 'categoria').req, 'va con los datos principales y es opcional');
  const sin = F.computeFor('med', medFaq, keep, meta);
  assert.ok(!/Categoría:/.test(sin.mg.html));
  const con = F.computeFor('med', { ...medFaq, categoria: 'ENDOCRINOLOGÍA' }, keep, meta);
  assert.match(con.mg.html, /<li><strong>Categoría:<\/strong> Endocrinología<\/li>\n<\/ul>/);
  assert.ok(con.mg.faq.some(x => /categoría/i.test(x[0]) && /Endocrinología/.test(x[1])));
  assert.equal(con.title.title, sin.title.title, 'no cambia el título');
  assert.equal(con.mc.text, sin.mc.text, 'no cambia Merchant Center');
  assert.deepEqual(con.meta.mt.text, sin.meta.mt.text, 'no cambia el meta title');
});

test('categoría: todas las categorías la tienen con los datos principales y la muestran en su ficha técnica', () => {
  const muestras = {
    dis: { marca: 'Omron', modelo: 'HEM-7121', tipo: 'Baumanómetro', tecnologia: 'Automático de brazo', fabricante: 'Omron' },
    cos: { marca: 'La Roche-Posay', producto: 'Hyalu B5', atributo: 'Ácido hialurónico', contenido: 'Frasco 30 mL', fabricante: "L'Oréal" },
    sup: { marca: 'GNC', componente: 'Vitamina C', forma: 'Cápsulas', contenido: 'Frasco con 100 piezas', fabricante: 'GNC' },
    beb: { marca: 'Electrolit', tipo: 'Suero oral', sabor: 'Coco', atributo: 'Sin azúcar', contenido: '625 mL' },
    hig: { marca: 'Colgate', producto: 'Pasta dental', variante: 'Total', contenido: '75 mL', fabricante: 'Colgate' },
    acc: { marca: 'Saba', producto: 'Parches térmicos', material: 'Alivio de dolores', contenido: 'Caja con 3 piezas', fabricante: 'Essity' }
  };
  for (const [id, v] of Object.entries(muestras)) {
    const fd = F.CATS[id].fields.find(x => x.key === 'categoria');
    assert.ok(fd && !fd.g && !fd.req, `${id}: campo principal y opcional`);
    const sin = F.computeFor(id, v, keep, meta), con = F.computeFor(id, { ...v, categoria: 'NUTRICIÓN CLÍNICA' }, keep, meta);
    assert.ok(!/Categoría:/.test(sin.mg.html), `${id}: sin captura no aparece`);
    assert.match(con.mg.html, /<li><strong>Categoría:<\/strong> Nutrición Clínica<\/li>/, `${id}: aparece en la ficha técnica`);
    assert.equal(con.title.title, sin.title.title, `${id}: no cambia el título`);
    assert.equal(con.mc.text, sin.mc.text, `${id}: no cambia Merchant Center`);
    assert.equal(con.meta.mt.text, sin.meta.mt.text, `${id}: no cambia el meta title`);
  }
});

test('categoría: la pregunta frecuente existe en las categorías con FAQ y solo si se capturó', () => {
  for (const id of ['cos', 'sup', 'dis', 'beb']) {
    const v = { marca: 'X', producto: 'Y', componente: 'Z', modelo: 'M', tipo: 'T', fabricante: 'Fab', contenido: '10 mL', tecnologia: 'Tec', atributo: 'A', sabor: 'S', categoria: 'Nutrición clínica' };
    const q = [...Array(6).keys()].flatMap(sd => F.buildFaq(F.CATS[id], v, sd).items.map(x => x[0]));
    assert.ok(q.some(x => /categoría/.test(x)), `${id}: tiene la pregunta`);
    const q2 = [...Array(6).keys()].flatMap(sd => F.buildFaq(F.CATS[id], { ...v, categoria: '' }, sd).items.map(x => x[0]));
    assert.ok(!q2.some(x => /categoría/.test(x)), `${id}: sin dato no hay pregunta`);
  }
});

/* ---------- Más formas, más tipos y campos opcionales de suplementos ---------- */
const ext = (t, cat) => F.extractRaw(t, { cat }).fields;

test('formas: se reconocen formas de suplementos y de medicamentos además de tableta, cápsula e inyectable', () => {
  assert.equal(ext('GNC Vitamina C 1000 mg gomitas frasco 60', 'sup').forma, 'Gomita');
  assert.equal(ext('Vitamina D3 softgel frasco c/90', 'sup').forma, 'Cápsula blanda');
  assert.equal(ext('Magnesio tabletas masticables frasco c/60', 'sup').forma, 'Tableta masticable');
  assert.equal(ext('Vitamina C efervescente tubo c/20', 'sup').forma, 'Tableta efervescente');
  assert.equal(ext('Proteína whey polvo bote 900 g sabor chocolate', 'sup').forma, 'Polvo');
  assert.equal(ext('Colágeno liquido botella 500 mL', 'sup').forma, 'Líquido');
  assert.equal(ext('Creatina shot caja c/12', 'sup').forma, 'Shot');
  assert.equal(ext('Omega 3 caps veg frasco c/60', 'sup').forma, 'Cápsula vegetal');
  assert.equal(ext('Ketorolaco tab sublingual 30 mg caja c/10', 'med').forma, 'Tableta sublingual');
  assert.equal(ext('Paracetamol 500 mg tab caja c/20', 'med').forma, 'Tableta', 'lo anterior no cambia');
});

test('presentación: se reconocen piezas de envases y unidades de suplementos', () => {
  assert.match(ext('Omega 3 softgels bote 120 perlas', 'sup').contenido, /120 perlas/i);
  assert.match(ext('Proteína barras caja c/12 barras', 'sup').contenido, /12 barras/i);
});

test('sabor: los suplementos también lo reconocen y entra en el título solo si se capturó', () => {
  const f = ext('Proteína whey polvo bote 900 g sabor chocolate', 'sup');
  assert.equal(f.sabor, 'Chocolate');
  assert.equal(f.componente, 'Proteína whey');
  const base = { marca: 'GNC', componente: 'Proteína whey', forma: 'Polvo', contenido: 'Bote 900 g', fabricante: 'GNC' };
  const sin = F.computeFor('sup', base, keep, meta), con = F.computeFor('sup', { ...base, sabor: 'Chocolate' }, keep, meta);
  assert.ok(!/Sabor/.test(sin.title.title));
  assert.match(con.title.title, /GNC Proteína whey \| Polvo, Bote 900 g \| Sabor Chocolate \| GNC/);
  assert.equal(F.computeFor('sup', base, keep, meta).mg.html, sin.mg.html);
});

test('suplementos: campos opcionales (sabor, porción, porciones y modo de consumo) salen en la ficha, el MC y la FAQ', () => {
  const base = { marca: 'GNC', componente: 'Vitamina C', forma: 'Gomitas', contenido: 'Frasco con 60 gomitas', fabricante: 'GNC' };
  const sin = F.computeFor('sup', base, keep, meta);
  ['sabor', 'porcion', 'porciones', 'modo'].forEach(k => assert.ok(F.CATS.sup.fields.some(f => f.key === k && f.g === 'd' && !f.req), k));
  assert.ok(!/Porción|Modo de consumo|Sabor/.test(sin.mg.html), 'sin captura no aparece nada nuevo');
  const con = F.computeFor('sup', { ...base, sabor: 'Naranja', porcion: '2 gomitas', porciones: '30', modo: 'TOMAR DOS GOMITAS AL DÍA.' }, keep, meta);
  assert.match(con.mg.html, /<li><strong>Sabor:<\/strong> Naranja<\/li>/);
  assert.match(con.mg.html, /<li><strong>Tamaño de Porción:<\/strong> 2 gomitas<\/li>/);
  assert.match(con.mg.html, /<li><strong>Porciones por Envase:<\/strong> 30<\/li>/);
  assert.match(con.mg.html, /<h2>Modo de consumo:<\/h2>\n<p>Tomar dos gomitas al día\.<\/p>/);
  assert.ok(con.mg.html.indexOf('Modo de consumo') < con.mg.html.indexOf('Condiciones de conservación'));
  assert.match(con.mc.text, /Sabor Naranja\. .*Tamaño de porción: 2 gomitas\. Porciones por envase: 30\./);
  const q = [...Array(6).keys()].flatMap(sd => F.buildFaq(F.CATS.sup, { ...base, sabor: 'Naranja', porciones: '30', porcion: '2 gomitas', modo: 'Tomar dos gomitas al día' }, sd).items);
  assert.ok(q.some(([a]) => /consume|tomar/.test(a)) && q.some(([a]) => /sabor/.test(a)) && q.some(([a, b]) => /porciones/.test(a) && /30 porciones/.test(b)));
});

test('tipos: más productos por categoría se reconocen y no hay alternancias rotas en las expresiones', () => {
  assert.equal(ext('Accu-Chek lancetas caja c/100', 'dis').tipo, 'Lancetas');
  assert.equal(ext('Omron esfigmomanometro digital', 'dis').tipo, 'Esfigmomanómetro digital');
  assert.equal(ext('Eucerin exfoliante facial 100 mL', 'cos').tipo, 'Exfoliante');
  assert.equal(ext('Colgate acondicionador 400 mL', 'hig').producto, 'Acondicionador');
  assert.equal(ext('Saba toallas sanitarias c/10', 'hig').producto, 'Toallas sanitarias');
  assert.equal(ext('Rodillera ortopedica talla M', 'acc').producto, 'Rodillera');
  assert.equal(ext('Fresubin nutricion oral 200 mL', 'beb').tipo, 'Nutrición oral');
  assert.equal(ext('Nature Made calcio tabletas c/100', 'sup').componente, 'Calcio');
  assert.equal(ext('Colageno hidrolizado polvo 300 g', 'sup').componente, 'Colágeno hidrolizado');
  assert.equal(F.extractRaw('Intensive cream 50 mL', { cat: 'dis' }).fields.tipo, undefined, '«intens…» no se confunde con TENS');
  assert.equal(F.detectCat ? true : true, true);
});

test('sugerencias: los campos de forma y tipo traen listas de ayuda que no limitan lo que se escribe', () => {
  const sug = (c, k) => F.CATS[c].fields.find(f => f.key === k).sug;
  assert.ok(sug('sup', 'forma').includes('Gomitas') && sug('sup', 'forma').includes('Polvo') && sug('sup', 'forma').length >= 15);
  assert.ok(sug('med', 'forma').includes('Solución inyectable') && sug('med', 'forma').includes('Parche'));
  assert.ok(sug('dis', 'tipo').includes('Baumanómetro') && sug('cos', 'tipo').includes('Sérum') && sug('beb', 'tipo').includes('Suero oral'));
  assert.ok(sug('hig', 'producto').includes('Shampoo') && sug('acc', 'producto').includes('Venda'));
  const r = F.computeFor('sup', { marca: 'X', componente: 'Z', forma: 'Pastillas de goma', contenido: 'Frasco con 30', fabricante: 'X' }, keep, meta);
  assert.match(r.title.title, /Pastillas de goma/, 'una forma que no está en la lista funciona igual');
});

/* ---------- Meta title largo: versión corta ---------- */
test('meta title largo: sugiere una versión corta quitando primero la tienda y no la aplica sola', () => {
  const m = F.defMeta(); m.tienda = 'Farmacias Especializadas';
  const v = { marca: 'Supportan DKN', componente: 'Capuchino Proteína', forma: 'Solución', contenido: '200 mL', fabricante: 'Fresenius Kabi' };
  const r = F.computeFor('sup', v, keep, m).meta;
  assert.equal(r.mt.text, 'Supportan DKN Capuchino Proteína | Solución, 200 mL | Farmacias Especializadas');
  assert.ok(r.mt.over && r.mt.len === 78);
  assert.deepEqual(r.mt.short, { text: 'Supportan DKN Capuchino Proteína | Solución, 200 mL', len: 51, dropped: ['Farmacias Especializadas'] });
  assert.ok(!r.mt.shortened, 'no se aplica sin que la persona lo pida');
  assert.ok(r.warns.some(w => /supera el límite de 60/.test(w)));
  assert.deepEqual(r.notes, []);
});

test('meta title largo: con la opción de la persona o la de la categoría usa la versión corta y deja de avisar', () => {
  const m = F.defMeta(); m.tienda = 'Farmacias Especializadas';
  const v = { marca: 'Supportan DKN', componente: 'Capuchino Proteína', forma: 'Solución', contenido: '200 mL', fabricante: 'Fresenius Kabi' };
  const porProducto = F.computeFor('sup', v, keep, m, { mtShort: true }).meta;
  assert.equal(porProducto.mt.text, 'Supportan DKN Capuchino Proteína | Solución, 200 mL');
  assert.deepEqual([porProducto.mt.shortened, porProducto.mt.over, porProducto.mt.autoShort], [true, false, false]);
  assert.equal(porProducto.mt.original.length, 78);
  assert.ok(!porProducto.warns.some(w => /supera el límite/.test(w)));
  assert.match(porProducto.notes[0], /se omitió «Farmacias Especializadas»/);
  m.cats.sup.mt.auto = true;
  const auto = F.computeFor('sup', v, keep, m).meta;
  assert.equal(auto.mt.text, 'Supportan DKN Capuchino Proteína | Solución, 200 mL');
  assert.equal(auto.mt.autoShort, true);
});

test('meta title largo: quita bloques de atrás hacia adelante, nunca el primero ni corta palabras, y no ofrece nada que no sirva', () => {
  const t = { a: 'Marca Producto Muy Largo Con Muchas Palabras', b: 'Bloque B', c: 'Bloque C', tienda: 'Tienda' };
  assert.deepEqual(F.shortenMeta('{a}\n{b}\n{c}\n{tienda}', ' | ', t, 60), { text: 'Marca Producto Muy Largo Con Muchas Palabras | Bloque B', len: 55, dropped: ['Tienda', 'Bloque C'] });
  assert.equal(F.shortenMeta('{a}\n{b}\n{c}\n{tienda}', ' | ', t, 30), null, 'el primer bloque solo ya no cabe');
  assert.equal(F.shortenMeta('{a}', ' | ', t, 10), null, 'un solo bloque no se acorta');
  assert.equal(F.shortenMeta('{b}\n{c}', ' | ', t, 60), null, 'si ya cabe no hay nada que acortar');
  assert.equal(F.shortenMeta('{b}\n{c}', ' | ', t, 0), null, 'sin límite no se acorta');
});

test('meta title largo: el CSV usa la versión corta de los productos que la eligieron y avisa de los que siguen largos', () => {
  const m = F.defMeta(); m.tienda = 'Farmacias Especializadas'; m.cats.sup.confirmed = true;
  const mk = (sku, over) => ({ sku, cat: 'sup', v: { marca: 'Supportan DKN', componente: 'Capuchino Proteína', forma: 'Solución', contenido: '200 mL', fabricante: 'Fresenius Kabi' }, ...over });
  const ex = F.magentoBatch([mk('LARGO'), mk('CORTO', { mtShort: true })], keep, m, {});
  const col = sku => ex.rows.find(r => r[0] === sku)[ex.header.indexOf('meta_title')];
  assert.equal(col('LARGO').length, 78);
  assert.ok(col('CORTO').length <= 60 && !/Farmacias/.test(col('CORTO')));
  assert.deepEqual([ex.excluded.mtLargos, ex.excluded.mtCortos], [1, 1]);
});

test('meta: un segmento opcional vacío del título no deja hueco en {seg2} y el sabor no desplaza la presentación', () => {
  const m = F.defMeta(); m.tienda = 'Tienda';
  const base = { marca: 'GNC', componente: 'Vitamina C', forma: 'Cápsulas', contenido: 'Frasco con 100 piezas', fabricante: 'GNC' };
  assert.equal(F.computeFor('sup', base, keep, m).meta.mt.text, 'GNC Vitamina C | Cápsulas, Frasco con 100 piezas | Tienda');
  assert.equal(F.computeFor('sup', { ...base, sabor: 'Naranja' }, keep, m).meta.mt.text, 'GNC Vitamina C | Cápsulas, Frasco con 100 piezas | Tienda', 'el sabor no desplaza la presentación del meta title');
});

/* ---------- Todo dato capturado llega a donde dice llegar ---------- */
test('Magento: todos los datos de texto capturados aparecen en la ficha (no solo en la descripción de Merchant Center)', () => {
  const strip = h => h.split('\n<br />\n<h2>Preguntas frecuentes:</h2>')[0];
  const base = {
    med: { marca: 'M', concentracion: '5 mg', principio: 'P', forma: 'Tableta', contenido: 'Caja con 10 tabletas', laboratorio: 'L', via: 'Oral', receta: 'no' },
    dis: { marca: 'M', modelo: 'X1', tipo: 'Tensiómetro', tecnologia: 'Automático', fabricante: 'F' },
    cos: { marca: 'M', producto: 'P', tipo: 'Sérum', atributo: 'A', contenido: '30 mL', fabricante: 'F' },
    sup: { marca: 'M', componente: 'C', forma: 'Cápsulas', contenido: 'Frasco con 30', fabricante: 'F' },
    beb: { marca: 'M', tipo: 'Suero', sabor: 'Coco', atributo: 'A', contenido: '600 mL' },
    hig: { marca: 'M', producto: 'P', variante: 'V', contenido: '100 mL', fabricante: 'F' },
    acc: { marca: 'M', producto: 'P', material: 'Mat', contenido: '3 piezas', fabricante: 'F' }
  };
  const NO_TEXT = new Set(['compat']);
  for (const [id, c] of Object.entries(F.CATS)) {
    const sinDato = F.computeFor(id, base[id], keep, meta);
    for (const fd of c.fields) {
      if (fd.type === 'select' || fd.g === 'i' || NO_TEXT.has(fd.key) || fd.key === 'atc') continue;
      const r = F.computeFor(id, { ...base[id], [fd.key]: fd.key === 'nutrimental' ? 'zzdatoprueba | 5 g' : 'zzdatoprueba' }, keep, meta);
      const enFicha = /zzdatoprueba/i.test(strip(r.mg.html)), enTitulo = /zzdatoprueba/i.test(r.title.title);
      assert.ok(enFicha || enTitulo, `${id}.${fd.key} no llega a la ficha de Magento ni al título`);
      const usos = [...(c.mgUses || []), ...(c.mgOpt || [])];
      if (enFicha) assert.ok(usos.includes(fd.key), `${id}.${fd.key} llega a Magento pero no está en mgUses/mgOpt (la etiqueta «Usado en» sería falsa)`);
      if (r.mc.text !== sinDato.mc.text) assert.ok([...(c.mcUses || []), ...(c.mcOpt || [])].includes(fd.key), `${id}.${fd.key} llega a Merchant Center pero no está en mcUses/mcOpt`);
    }
  }
});

test('Magento: los datos opcionales literales salen como secciones, escapados y antes del aviso final', () => {
  const sup = { marca: 'M', componente: 'C', forma: 'Cápsulas', contenido: 'Frasco con 30', fabricante: 'F', composicion: '20 g de Proteína & TCM <b>', caracteristicas: 'Dieta polimérica especializada' };
  const h = F.computeFor('sup', sup, keep, meta).mg.html;
  assert.match(h, /<h2>Composición:<\/h2>\n<p>20 g de Proteína &amp; TCM &lt;b&gt;<\/p>/);
  assert.match(h, /<h2>Características:<\/h2>\n<p>Dieta polimérica especializada<\/p>/);
  assert.ok(h.indexOf('Características:') < h.indexOf('Condiciones de conservación'));
  const acc = F.computeFor('acc', { marca: 'M', producto: 'P', material: 'Mat', contenido: '3 piezas', fabricante: 'F', queEs: 'Parche térmico', paquete: 'Tres parches' }, keep, meta).mg.html;
  assert.match(acc, /<h2>Descripción:<\/h2>\n<p>Parche térmico<\/p>/);
  assert.match(acc, /<h2>Incluye:<\/h2>\n<p>Tres parches<\/p>/);
  const cos = F.computeFor('cos', { marca: 'M', producto: 'P', tipo: 'Sérum', atributo: 'A', contenido: '30 mL', fabricante: 'F', comercial: 'Fórmula ligera de rápida absorción' }, keep, meta).mg.html;
  assert.match(cos, /<p>Fórmula ligera de rápida absorción<\/p>$/m);
  assert.ok(!/Descripción:|Características:|Composición:/.test(F.computeFor('sup', { marca: 'M', componente: 'C', forma: 'Cápsulas', contenido: 'Frasco con 30', fabricante: 'F' }, keep, meta).mg.html), 'sin captura no cambia nada');
});

/* ---------- Tabla nutrimental ---------- */
const supBase = { marca: 'GNC', componente: 'Proteína whey', forma: 'Polvo', contenido: 'Bote 900 g', fabricante: 'GNC' };
const TABLA = '# Nutriente | Por porción (30 g) | Por 100 g | % VD\nEnergía | 120 kcal | 400 kcal | 6 %\nProteína | 24 g | 80 g | 48 %\nCarbohidratos | 3 g | 10 g | 1 %\n- Azúcares | 1.5 g | 5 g\nGrasa total | 1.5 g | 5 g | 2 %\nSodio | 90 mg | 300 mg | 4 %';

test('tabla nutrimental: se arma una tabla HTML con id, encabezados y subfilas a partir de líneas', () => {
  const h = F.computeFor('sup', { ...supBase, porcion: '1 scoop (30 g)', porciones: '30', nutrimental: TABLA }, keep, meta).mg.html;
  assert.match(h, /<h2>Información nutrimental:<\/h2>\n<table id="tabla-nutrimental" class="tabla-nutrimental">/);
  assert.match(h, /<caption>Información nutrimental \(porción: 1 scoop \(30 g\); porciones por envase: 30\)<\/caption>/);
  assert.match(h, /<thead><tr><th scope="col">Nutriente<\/th><th scope="col">Por porción \(30 g\)<\/th><th scope="col">Por 100 g<\/th><th scope="col">% VD<\/th><\/tr><\/thead>/);
  assert.match(h, /<tr><th scope="row">Proteína<\/th><td>24 g<\/td><td>80 g<\/td><td>48 %<\/td><\/tr>/);
  assert.match(h, /<tr class="sub"><th scope="row">Azúcares<\/th><td>1.5 g<\/td><td>5 g<\/td><td>—<\/td><\/tr>/);
  assert.ok(h.indexOf('Información nutrimental:') > h.indexOf('Ficha técnica') && h.indexOf('Información nutrimental:') < h.indexOf('Condiciones de conservación'));
  assert.equal((h.match(/id="tabla-nutrimental"/g) || []).length, 1);
});

test('tabla nutrimental: limpia unidades y mayúsculas, acepta tabulaciones y filas pegadas sin barras, y escapa el HTML', () => {
  const p = F.parseNutrition('PROTEÍNA\t20G\t40%\nCalorías 120KCAL\nSodio | <1 mg\nVitamina C | 90 MG\nHierro | No significativo & otros');
  assert.deepEqual(p.rows.map(r => [r.name, ...r.cells]), [['Proteína', '20 g', '40 %'], ['Calorías', '120 kcal'], ['Sodio', '<1 mg'], ['Vitamina C', '90 mg'], ['Hierro', 'No significativo & otros']]);
  assert.deepEqual(p.head, ['Nutriente', 'Valor 1', 'Valor 2'], 'sin encabezados con varias columnas usa nombres genéricos');
  assert.ok(p.problems.some(x => /encabezados/.test(x)), 'y lo avisa');
  const h = F.computeFor('sup', { ...supBase, nutrimental: 'Hierro | No significativo & <b>' }, keep, meta).mg.html;
  assert.match(h, /<td>No significativo &amp; &lt;b&gt;<\/td>/);
  assert.match(h, /<th scope="col">Cantidad<\/th>/, 'una sola columna se llama Cantidad');
  assert.equal(F.parseNutrition('Proteína | 20,5 g').rows[0].cells[0], '20.5 g', 'la coma decimal pasa a punto');
});

test('tabla nutrimental: avisa de filas sin cantidad o sin nombre y de columnas que no cuadran, sin tocar los datos', () => {
  const p = F.parseNutrition('# Nutriente | Por porción\nProteína | 20 g | 40 %\nGrasa\n | 5 g');
  assert.ok(p.problems.some(x => /Grasa/.test(x) && /no tiene cantidad/.test(x)));
  assert.ok(p.problems.some(x => /sin nombre/.test(x)));
  assert.ok(p.problems.some(x => /columna\(s\) de valores/.test(x)));
  const c = F.lint(F.CATS.sup, { nutrimental: '# Nutriente | Por porción\nGrasa' }).check;
  assert.match(c.join(' '), /Grasa/);
  assert.deepEqual(F.lint(F.CATS.sup, { nutrimental: TABLA }).check, [], 'una tabla coherente no avisa');
});

test('tabla nutrimental: avisa si las calorías no cuadran con 4-4-9, por columna, y nunca corrige el número', () => {
  const mal = '# Nutriente | Por porción | Por 100 g\nEnergía | 300 kcal | 400 kcal\nProteína | 24 g | 80 g\nCarbohidratos | 3 g | 10 g\nGrasa total | 1.5 g | 5 g';
  const avisos = F.lint(F.CATS.sup, { nutrimental: mal }).check;
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /columna «Por porción»: declara 300 kcal, pero .* cerca de 122 kcal/);
  const h = F.computeFor('sup', { ...supBase, nutrimental: mal }, keep, meta).mg.html;
  assert.match(h, /<td>300 kcal<\/td>/, 'se muestra lo capturado');
  const sinDatos = '# Nutriente | Por porción\nEnergía | 300 kcal\nProteína | 24 g';
  assert.deepEqual(F.lint(F.CATS.sup, { nutrimental: sinDatos }).check, [], 'sin carbohidratos y grasa no puede comparar');
  assert.deepEqual(F.lint(F.CATS.sup, { nutrimental: '# Nutriente | % VD\nEnergía | 6 %\nProteína | 48 %\nCarbohidratos | 1 %\nGrasa total | 2 %' }).check, [], 'las columnas de porcentaje no se comparan');
});

test('tabla nutrimental: sin captura no cambia nada y las preguntas frecuentes salen de la tabla', () => {
  assert.equal(F.computeFor('sup', supBase, keep, meta).mg.html, F.computeFor('sup', { ...supBase, nutrimental: '   \n  ' }, keep, meta).mg.html);
  assert.ok(!/tabla-nutrimental/.test(F.computeFor('sup', { ...supBase, nutrimental: 'solo texto sin cantidades' }, keep, meta).mg.html), 'sin filas válidas no hay tabla');
  const q = [...Array(6).keys()].flatMap(sd => F.buildFaq(F.CATS.sup, { ...supBase, nutrimental: TABLA }, sd).items);
  const resp = re => q.filter(([a]) => re.test(a)).map(([, b]) => b);
  assert.ok(resp(/calorías/).every(b => /aporta 120 kcal \(por porción \(30 g\)\)\./.test(b)) && resp(/calorías/).length);
  assert.ok(resp(/proteína/).every(b => /aporta 24 g de proteína/.test(b)) && resp(/proteína/).length);
  assert.ok(resp(/azúcar/).every(b => /tiene 1.5 g de azúcares/.test(b)) && resp(/azúcar/).length);
});
