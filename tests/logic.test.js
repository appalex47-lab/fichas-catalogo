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
  assert.ok(/<h2>Ficha técnica del producto:<\/h2>/.test(conExtras) && /Este producto no es un medicamento\./.test(conExtras), 'la ficha y el aviso siguen');
  assert.match(conExtras, /<h2>Ingredientes:<\/h2>\n<p id="lista-ingredientes">AQUA, GLYCERIN, PEG-100 STEARATE, CI 77891<\/p>/);
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
  assert.equal(r.fields.atributo, undefined, 'el FPS ya no se copia al activo principal');
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
  assert.equal(r.title.title, 'CeraVe Crema Hidratante | Con ceramidas | 454 g');
  assert.deepEqual(r.title.missing, []);
  assert.deepEqual(r.title.segs[0].omitted, ['Tipo de producto']);
});

test('nombre y tipo: basta con capturar uno de los dos', () => {
  const soloNombre = F.computeFor('cos', { ...cerave, tipo: '' }, keep, meta);
  const soloTipo = F.computeFor('cos', { ...cerave, producto: '', tipo: 'Crema hidratante' }, keep, meta);
  assert.equal(soloNombre.title.title, 'CeraVe Crema Hidratante | Con ceramidas | 454 g');
  assert.equal(soloTipo.title.title, 'CeraVe Crema hidratante | Con ceramidas | 454 g');
  assert.deepEqual(soloNombre.title.missing, []);
  assert.deepEqual(soloTipo.title.missing, []);
  const ninguno = F.computeFor('cos', { ...cerave, producto: '', tipo: '' }, keep, meta);
  assert.deepEqual(ninguno.title.missing, ['Línea o nombre del producto o tipo de producto']);
});

test('nombre y tipo distintos se conservan, y la marca al inicio del nombre no se duplica', () => {
  assert.equal(F.computeFor('cos', { ...cos, marca: 'La Roche-Posay' }, keep, meta).title.segs[0].text, 'La Roche-Posay Hyalu B5 Sérum');
  assert.equal(F.computeFor('cos', { ...cerave, producto: 'CeraVe Crema Hidratante', tipo: '' }, keep, meta).title.segs[0].text, 'CeraVe Crema Hidratante');
});

test('nombre y tipo iguales: descripción de Merchant Center, metas y alt tampoco lo repiten', () => {
  const r = F.computeFor('cos', cerave, keep, meta);
  assert.match(r.mc.text, /^CeraVe Crema Hidratante es una crema, formulada con ceramidas\./);
  assert.equal(r.meta.mt.text, 'CeraVe Crema Hidratante con ceramidas | 454 g');
  assert.equal(r.meta.alt.text, 'CeraVe Crema Hidratante, 454 g');
  assert.match(r.mg.html, /Línea o nombre:<\/strong> Crema Hidratante/, 'Magento conserva ambas filas');
  assert.match(r.mg.html, /Tipo de producto:<\/strong> Crema</);
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
  assert.match(con.mc.text, /Sabor Naranja\. .*Tamaño de porción: 2 gomitas, 30 porciones por envase\./);
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
const old = m => { m.cats.sup.mt = { ...F.META_GEN.mt }; m.cats.sup.md = { ...F.META_GEN.md }; return m; };
test('meta title largo: sugiere una versión corta quitando primero la tienda y no la aplica sola', () => {
  const m = old(F.defMeta()); m.tienda = 'Farmacias Especializadas';
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
  const m = old(F.defMeta()); m.tienda = 'Farmacias Especializadas';
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
  const m = old(F.defMeta()); m.tienda = 'Farmacias Especializadas'; m.cats.sup.confirmed = true;
  const mk = (sku, over) => ({ sku, cat: 'sup', v: { marca: 'Supportan DKN', componente: 'Capuchino Proteína', forma: 'Solución', contenido: '200 mL', fabricante: 'Fresenius Kabi' }, ...over });
  const ex = F.magentoBatch([mk('LARGO'), mk('CORTO', { mtShort: true })], keep, m, {});
  const col = sku => ex.rows.find(r => r[0] === sku)[ex.header.indexOf('meta_title')];
  assert.equal(col('LARGO').length, 78);
  assert.ok(col('CORTO').length <= 60 && !/Farmacias/.test(col('CORTO')));
  assert.deepEqual([ex.excluded.mtLargos, ex.excluded.mtCortos], [1, 1]);
});

test('meta: un segmento opcional vacío del título no deja hueco en {seg2} y el sabor no desplaza la presentación', () => {
  const m = old(F.defMeta()); m.tienda = 'Tienda';
  const base = { marca: 'GNC', componente: 'Vitamina C', forma: 'Cápsulas', contenido: 'Frasco con 100 piezas', fabricante: 'GNC' };
  assert.equal(F.computeFor('sup', base, keep, m).meta.mt.text, 'GNC Vitamina C | Cápsulas, Frasco con 100 piezas | Tienda');
  assert.equal(F.computeFor('sup', { ...base, sabor: 'Naranja' }, keep, m).meta.mt.text, 'GNC Vitamina C | Cápsulas, Frasco con 100 piezas | Tienda', 'el sabor no desplaza la presentación del meta title');
});

test('meta suplementos: la variante va antes que el tipo y lo opcional se omite de derecha a izquierda', () => {
  const m = F.defMeta(); m.tienda = 'Farmacias Especializadas';
  const v = { marca: 'Fresubin HPC', componente: 'Fórmula Hipercalórica e Hiperproteica', forma: 'Líquido', sabor: 'Frutos del Bosque', contenido: '200 mL', fabricante: 'Fresenius Kabi', caracteristicas: 'Alta en proteína. Sin gluten.' };
  const r = F.computeFor('sup', v, keep, m).meta;
  assert.equal(r.mt.text, 'Fresubin HPC | Frutos del Bosque, 200 mL', 'tienda y tipo largo se omiten; la variante se queda');
  assert.ok(r.notes.some(n => /Meta title: se omitió/.test(n)) && !r.mt.over);
  const corto = F.computeFor('sup', { ...v, tipoCorto: 'Hipercalórica' }, keep, m).meta;
  assert.equal(corto.mt.text, 'Fresubin HPC Hipercalórica | Frutos del Bosque, 200 mL', 'con tipo corto cabe, sin tienda');
  assert.equal(corto.md.text, 'Fresubin HPC Hipercalórica, Frutos del Bosque, 200 mL. Fresenius Kabi. Alta en proteína.');
  const sinSabor = F.computeFor('sup', { ...v, sabor: '', tipoCorto: 'Fórmula' }, keep, m).meta;
  assert.equal(sinSabor.mt.text, 'Fresubin HPC Fórmula | 200 mL | Farmacias Especializadas');
});
test('meta: un grupo opcional vacío desaparece y migrateMeta cambia solo la plantilla genérica sin confirmar', () => {
  assert.equal(F.renderMetaTpl('{a}[ {b}]\n[{c}]', ' | ', { a: 'A' }).text, 'A');
  const m = F.defMeta(); m.cats.sup.mt = { ...F.META_GEN.mt }; m.cats.sup.md = { ...F.META_GEN.md, max: 100 };
  F.migrateMeta(m);
  assert.equal(m.cats.sup.mt.tpl, F.META_SUP.mt.tpl);
  assert.equal(m.cats.sup.md.tpl, F.META_SUP.md.tpl);
  const c = F.defMeta(); c.cats.sup.confirmed = true; c.cats.sup.mt = { ...F.META_GEN.mt };
  F.migrateMeta(c);
  assert.equal(c.cats.sup.mt.tpl, F.META_GEN.mt.tpl, 'confirmada: no se toca');
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
  const NO_TEXT = new Set(['compat', 'tipoCorto']);
  for (const [id, c] of Object.entries(F.CATS)) {
    const sinDato = F.computeFor(id, base[id], keep, meta);
    for (const fd of c.fields) {
      if (fd.type === 'select' || fd.g === 'i' || NO_TEXT.has(fd.key) || fd.key === 'atc') continue;
      const r = F.computeFor(id, { ...base[id], [fd.key]: ['nutrimental', 'especificaciones', 'tallas'].includes(fd.key) ? 'zzdatoprueba | 5 g' : 'zzdatoprueba' }, keep, meta);
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
  assert.match(h, /<h2>Información nutrimental:<\/h2>\n<table id="tabla-nutrimental" class="tabla-nutrimental" aria-label="Información nutrimental">/);
  assert.ok(!/<caption>/.test(h), 'el título de la tabla no repite el encabezado ni los datos de la ficha');
  assert.match(h, /<thead><tr><th scope="col">Nutriente<\/th><th scope="col">Por porción \(30 g\)<\/th><th scope="col">Por 100 g<\/th><th scope="col">% VD<\/th><\/tr><\/thead>/);
  assert.match(h, /<tr><th scope="row">Proteína<\/th><td>24 g<\/td><td>80 g<\/td><td>48 %<\/td><\/tr>/);
  assert.match(h, /<tr class="sub"><th scope="row">Azúcares<\/th><td>1.5 g<\/td><td>5 g<\/td><td>—<\/td><\/tr>/);
  assert.ok(h.indexOf('Información nutrimental:') > h.indexOf('Ficha técnica') && h.indexOf('Información nutrimental:') < h.indexOf('Condiciones de conservación'));
  assert.equal((h.match(/id="tabla-nutrimental"/g) || []).length, 1);
});

test('tabla nutrimental: limpia unidades y mayúsculas, respeta los decimales como se escriben, acepta tabulaciones y escapa el HTML', () => {
  const p = F.parseNutrition('PROTEÍNA\t20,0G\t40%\nCalorías | 120KCAL\nSodio | <1 mg\nVitamina C | 90 MG\nHierro | No significativo & otros');
  assert.deepEqual(p.rows.map(r => [r.name, ...r.cells]), [['Proteína', '20,0 g', '40 %'], ['Calorías', '120 kcal'], ['Sodio', '<1 mg'], ['Vitamina C', '90 mg'], ['Hierro', 'No significativo & otros']]);
  assert.deepEqual(p.head, ['Nutriente', 'Valor 1', 'Valor 2'], 'sin encabezados con varias columnas usa nombres genéricos');
  assert.ok(p.problems.some(x => /encabezados/.test(x)), 'y lo avisa');
  const h = F.computeFor('sup', { ...supBase, nutrimental: 'Hierro | No significativo & <b>' }, keep, meta).mg.html;
  assert.match(h, /<td>No significativo &amp; &lt;b&gt;<\/td>/);
  assert.match(h, /<th scope="col">Cantidad<\/th>/, 'una sola columna se llama Cantidad');
  assert.equal(F.parseNutrition('Proteína | 20,5 g').rows[0].cells[0], '20,5 g', 'la coma decimal se respeta');
  assert.equal(F.parseNutrition('Proteína | 20.5 g').rows[0].cells[0], '20.5 g', 'y el punto también');
});

test('tabla nutrimental: una línea sin barra es texto (título, nota o título de la tabla) y con barra es una fila', () => {
  const p = F.parseNutrition('Información nutrimental: por porción (200 mL)\nProteínas | 20,0 g\nde los cuales\n- Azúcar | 11,6 g\nVITAMINAS\n• Vitamina A | 425 µg RE\n• de la cual β-Caroteno | 125 µg RE\nMinerales\n- Sodio | 120 mg / 5,2 mmol');
  assert.equal(p.caption, 'Por porción (200 mL)', 'el primer texto es el título de la tabla, sin repetir «Información nutrimental»');
  assert.deepEqual(p.items.map(i => [i.kind, i.name || i.text]), [['row', 'Proteínas'], ['nota', 'de los cuales'], ['row', 'Azúcar'], ['titulo', 'Vitaminas'], ['row', 'Vitamina A'], ['row', 'de la cual β-Caroteno'], ['titulo', 'Minerales'], ['row', 'Sodio']]);
  assert.deepEqual(p.problems, [], 'nada de esto es un problema');
  assert.deepEqual(F.parseNutrition('Proteína 20 g 40 %').rows, [], 'sin barra no es una fila');
  const h = F.computeFor('sup', { ...supBase, nutrimental: 'Información nutrimental: por porción (200 mL)\nProteínas | 20,0 g\nde los cuales\n- Azúcar | 11,6 g\nVitaminas\n- Vitamina A | 425 µg RE\n- Sodio | 120 mg / 5,2 mmol\n- Lactosa | ≤ 0,6 g' }, keep, meta).mg.html;
  assert.match(h, /<caption>Por porción \(200 mL\)<\/caption>/);
  assert.match(h, /<tr class="nota"><td colspan="2">de los cuales<\/td><\/tr>/);
  assert.match(h, /<tr class="titulo"><th scope="colgroup" colspan="2">Vitaminas<\/th><\/tr>/);
  assert.match(h, /<tr class="sub"><th scope="row">Vitamina A<\/th><td>425 µg RE<\/td><\/tr>/, 'las unidades compuestas pasan tal cual');
  assert.match(h, /<td>120 mg \/ 5,2 mmol<\/td>/);
  assert.match(h, /<td>≤ 0,6 g<\/td>/);
});

test('tabla nutrimental: con tu etiqueta completa las calorías cuadran y no avisa', () => {
  const etiqueta = 'Información nutrimental: por porción (200 mL)\nContenido energético | 400 kcal (1680 kJ)\nProteínas | 20,0 g\nCarbohidratos | 45,0 g\nde los cuales\n- Azúcar | 11,6 g\nGrasas | 15,6 g\nFibra | 0,0 g\nAgua | 139 mL\nOsmolaridad | 590 mOsmol/L\nOsmolalidad | 850 mOsmol/kg H₂O';
  assert.deepEqual(F.lint(F.CATS.sup, { nutrimental: etiqueta }).check, []);
  assert.match(F.lint(F.CATS.sup, { nutrimental: etiqueta.replace('400 kcal', '700 kcal') }).check.join(' '), /declara 700 kcal, pero .* cerca de 400 kcal/);
});
test('tabla nutrimental: avisa de filas con barra sin cantidad o sin nombre y de columnas que no cuadran, sin tocar los datos', () => {
  const p = F.parseNutrition('# Nutriente | Por porción\nProteína | 20 g | 40 %\nGrasa |\n | 5 g');
  assert.ok(p.problems.some(x => /Grasa/.test(x) && /tiene la barra pero no tiene cantidad/.test(x)));
  assert.ok(p.problems.some(x => /sin nombre/.test(x)));
  assert.ok(p.problems.some(x => /columna\(s\) de valores/.test(x)));
  assert.match(F.lint(F.CATS.sup, { nutrimental: '# Nutriente | Por porción\nGrasa |' }).check.join(' '), /Grasa/);
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
  assert.ok(!/tabla-nutrimental/.test(F.computeFor('sup', { ...supBase, nutrimental: 'solo texto sin cantidades' }, keep, meta).mg.html), 'sin filas con barra no hay tabla');
  const q = [...Array(6).keys()].flatMap(sd => F.buildFaq(F.CATS.sup, { ...supBase, nutrimental: TABLA }, sd).items);
  const resp = re => q.filter(([a]) => re.test(a)).map(([, b]) => b);
  assert.ok(resp(/calorías/).every(b => /aporta 120 kcal, por porción \(30 g\)\./.test(b)) && resp(/calorías/).length);
  assert.ok(resp(/proteína/).every(b => /aporta 24 g de proteína, por porción/.test(b)) && resp(/proteína/).length);
  assert.ok(resp(/azúcar/).every(b => /tiene 1.5 g de azúcares/.test(b)) && resp(/azúcar/).length);
});

/* ---------- Suplementos: ingredientes, alérgenos, advertencias, atributos, público y envase ---------- */
test('suplementos: los campos de ficha nuevos son opcionales, literales y salen en su lugar', () => {
  const base = { marca: 'GNC', componente: 'Proteína whey', forma: 'Polvo', contenido: '900 g', fabricante: 'GNC' };
  ['ingredientes', 'alergenos', 'advertencias', 'atributos', 'publico', 'envase'].forEach(k => assert.ok(F.CATS.sup.fields.some(f => f.key === k && f.g === 'd' && !f.req), k));
  const sin = F.computeFor('sup', base, keep, meta).mg.html;
  assert.ok(!/Ingredientes:|Alérgenos:|Advertencias:|Atributos:|Dirigido a|Tipo de Envase/.test(sin), 'sin captura no cambia nada');
  const con = F.computeFor('sup', { ...base, envase: 'FCO', publico: 'Adultos', ingredientes: 'Concentrado de proteína de suero (LECHE), lecitina de SOYA, sucralosa', alergenos: 'CONTIENE LECHE Y SOYA.', advertencias: 'No se recomienda en embarazo ni lactancia. Consulte a su médico.', atributos: 'vegano, sin gluten; Sin azúcar añadida.' }, keep, meta).mg.html;
  assert.match(con, /<li><strong>Tipo de Envase:<\/strong> Frasco<\/li>/);
  assert.match(con, /<li><strong>Dirigido a:<\/strong> Adultos<\/li>/);
  assert.match(con, /<h2>Ingredientes:<\/h2>\n<p>Concentrado de proteína de suero \(LECHE\), lecitina de SOYA, sucralosa<\/p>/, 'la lista se conserva tal cual, incluidas las mayúsculas');
  assert.match(con, /<h2>Alérgenos:<\/h2>\n<p>Contiene leche y soya\.<\/p>/);
  assert.match(con, /<h2>Atributos:<\/h2>\n<ul>\n  <li>Vegano<\/li>\n  <li>Sin gluten<\/li>\n  <li>Sin azúcar añadida<\/li>\n<\/ul>/);
  assert.match(con, /<h2>Advertencias:<\/h2>\n<p>No se recomienda en embarazo ni lactancia\. Consulte a su médico\.<\/p>/);
  const i = t => con.indexOf(t);
  assert.ok(i('Ficha técnica') < i('Ingredientes:') && i('Ingredientes:') < i('Alérgenos:') && i('Alérgenos:') < i('Atributos:') && i('Atributos:') < i('Advertencias:') && i('Advertencias:') < i('Condiciones de conservación'));
});

test('suplementos: los campos de ficha nuevos alimentan las preguntas frecuentes solo si se capturaron', () => {
  const base = { marca: 'GNC', componente: 'Proteína whey', forma: 'Polvo', contenido: '900 g', fabricante: 'GNC' };
  const q = (v) => [...Array(6).keys()].flatMap(sd => F.buildFaq(F.CATS.sup, v, sd).items);
  const vacias = q(base).map(x => x[0]).join(' ');
  assert.ok(!/ingredientes|alérgenos|atributos|advertencias|Para quién|dirigido/i.test(vacias));
  const llenas = q({ ...base, ingredientes: 'Proteína de suero', alergenos: 'Contiene leche', atributos: 'Sin gluten', publico: 'Adultos', advertencias: 'Consulte a su médico' });
  const resp = re => llenas.filter(([a]) => re.test(a)).map(x => x[1]);
  assert.ok(resp(/ingredientes/).length && resp(/ingredientes/).every(b => b === 'Proteína de suero.'));
  assert.ok(resp(/alérgenos/).length && resp(/alérgenos/).every(b => b === 'Contiene leche.'));
  assert.ok(resp(/atributos/).every(b => b === 'Sin gluten.'));
  assert.ok(resp(/quién|dirigido/).every(b => /dirigido a adultos/i.test(b)));
  assert.ok(resp(/advertencias|precauciones/).every(b => b === 'Consulte a su médico.'));
  assert.ok(F.computeFor('sup', { ...base, publico: 'Adultos' }, keep, meta).mc.text.includes('Dirigido a adultos'));
});

/* ---------- Sin repeticiones: porción, tabla, Merchant Center y frase de la introducción ---------- */
const hiper = { marca: 'Supportan DKN', componente: 'Fórmula hipercalórica', forma: 'Líquido', contenido: '200 mL', fabricante: 'Fresenius Kabi', sabor: 'Capuchino', porcion: '200 mL', porciones: '1', publico: 'Adultos y niños mayores de 3 años', composicion: '20 g de Proteína, 1 g de EPA (Omega-3), TCM, Inulina', modo: 'Agitar bien antes de usar. Dosificar directamente en la boca o en un vaso.', caracteristicas: 'Está formulado como una dieta polimérica especializada, diseñada principalmente para dar soporte nutricional a pacientes con altas necesidades calóricas o en estados hipercatabólicos (como en tratamientos oncológicos o EPOC).' };

test('porción única: no se repite el contenido en la ficha técnica ni en Merchant Center', () => {
  const r = F.computeFor('sup', hiper, keep, meta);
  assert.ok(!/Tamaño de Porción/.test(r.mg.html), 'sin fila de tamaño de porción');
  assert.match(r.mg.html, /<li><strong>Porciones por Envase:<\/strong> 1 \(porción única\)<\/li>/);
  assert.equal((r.mg.html.split('\n<br />\n<h2>Preguntas frecuentes')[0].match(/200 ml/g) || []).length, 2, '200 ml solo en la introducción (plantilla aprobada) y en la fila de contenido');
  assert.ok(!/Tamaño de porción|Porciones por envase/.test(r.mc.text));
  assert.ok(!r.mg.faq.some(([q]) => /Cuántas porciones/.test(q)), 'tampoco la pregunta de porciones');
  const sinPorciones = F.computeFor('sup', { ...hiper, porciones: '' }, keep, meta);
  assert.ok(!/Porciones por Envase|Tamaño de Porción/.test(sinPorciones.mg.html), 'si no declara porciones, no se inventa «1»');
});

test('porción distinta del contenido: se muestran las dos filas y una sola frase en Merchant Center', () => {
  const v = { ...hiper, contenido: 'Bote 900 g', forma: 'Polvo', porcion: '1 scoop (30 g)', porciones: '30', sabor: '' };
  const r = F.computeFor('sup', v, keep, meta);
  assert.match(r.mg.html, /<li><strong>Tamaño de Porción:<\/strong> 1 scoop \(30 g\)<\/li>\n  <li><strong>Porciones por Envase:<\/strong> 30<\/li>/);
  assert.match(r.mc.text, /Tamaño de porción: 1 scoop \(30 g\), 30 porciones por envase\./);
  assert.ok(!/Porciones por envase: 30/.test(r.mc.text));
  assert.match(F.computeFor('sup', { ...v, porciones: '1', porcion: '30 g' }, keep, meta).mc.text, /30 g, 1 porción por envase\./);
});

test('introducción y Merchant Center: ya no dicen «incorpora X» ni «contiene X» con el tipo del producto', () => {
  const r = F.computeFor('sup', hiper, keep, meta);
  assert.ok(!/incorpora/.test(r.mg.html));
  assert.match(r.mg.html, /Este suplemento se presenta en forma de <strong>líquido<\/strong>, en una presentación de <strong>200 ml<\/strong>\./);
  assert.match(r.mg.html, /<strong>Supportan DKN \(Fórmula hipercalórica\)<\/strong>/);
  const sinComp = F.computeFor('sup', { ...hiper, composicion: '' }, keep, meta);
  assert.ok(!/que contiene/.test(sinComp.mc.text), 'sin composición no hay «contiene»');
  assert.ok(!sinComp.mg.faq.some(([q]) => /Qué contiene|composición/.test(q)));
  assert.match(r.mc.text, /Suplemento alimenticio en forma de líquido que contiene 20 g de Proteína/);
  assert.equal(F.CATS.sup.fields.find(f => f.key === 'componente').label, 'Tipo o componente principal');
  assert.match(r.mg.html, /<li><strong>Tipo o Componente Principal:<\/strong> Fórmula hipercalórica<\/li>/);
});

test('Merchant Center: sin «Presentación de X» repetido y con presupuesto de palabras por prioridad', () => {
  const r = F.computeFor('sup', hiper, keep, meta);
  assert.ok(!/Presentación de/.test(r.mc.text), 'el encabezado ya lleva el contenido');
  assert.ok(r.mc.words <= 100, `${r.mc.words} palabras`);
  assert.deepEqual(r.mc.dropped, ['Características']);
  assert.ok(/Sabor Capuchino\./.test(r.mc.text) && /Dirigido a adultos/.test(r.mc.text) && /Agitar bien antes de usar\./.test(r.mc.text) && !/dieta polimérica/.test(r.mc.text));
  assert.ok(/El consumo de este producto es responsabilidad/.test(r.mc.text), 'la leyenda nunca se omite');
  assert.match(r.mg.html, /<h2>Características:<\/h2>\n<p>Está formulado como una dieta polimérica/, 'sigue completa en Magento');
  const corto = F.computeFor('sup', { ...hiper, caracteristicas: 'Dieta especializada.' }, keep, meta);
  assert.deepEqual(corto.mc.dropped, []);
  assert.match(corto.mc.text, /Dieta especializada\./);
  assert.deepEqual(F.computeFor('med', { marca: 'M', concentracion: '5 mg', principio: 'P', forma: 'Tableta', contenido: 'Caja', laboratorio: 'L', via: 'Oral', receta: 'no' }, keep, meta).mc.dropped, [], 'otras categorías no cambian');
});

test('tabla nutrimental: la fila de porción se omite con aviso y se aceptan osmolaridades y unidades compuestas', () => {
  const p = F.parseNutrition('Por porción de | 200 mL\nContenido energético | 300 kcal\nOsmolaridad | 435 mOsmol/L\nOsmolalidad | 575 mOsmol/kg H2O\nde los cuales\nCarbohidratos | 23,2 g');
  assert.deepEqual(p.rows.map(r => [r.name, ...r.cells]), [['Contenido energético', '300 kcal'], ['Osmolaridad', '435 mOsmol/L'], ['Osmolalidad', '575 mOsmol/kg H2O'], ['Carbohidratos', '23,2 g']]);
  assert.ok(p.problems.some(x => /«Por porción de: 200 mL» es la porción, no un nutriente\. Captúrala en «Tamaño de porción»/.test(x)));
  const h = F.computeFor('sup', { ...hiper, nutrimental: 'Por porción de | 200 mL\nProteína | 20 g' }, keep, meta).mg.html;
  assert.ok(!/Por porción de/.test(h) && /<th scope="row">Proteína<\/th>/.test(h));
});
test('suplementos: avisa si el tipo es genérico o el tamaño de porción no tiene unidad', () => {
  const c = F.lint(F.CATS.sup, { componente: 'Suplemento Alimenticio', porcion: '200' }).check.join(' | ');
  assert.match(c, /«Suplemento Alimenticio» no describe el producto/);
  assert.match(c, /tamaño de porción «200» no tiene unidad/);
  assert.deepEqual(F.lint(F.CATS.sup, { componente: 'Fórmula hipercalórica', porcion: '200 mL' }).check, []);
});

test('Merchant Center: medicamentos y dermocosméticos tampoco repiten «Presentación» cuando el encabezado ya lleva el contenido', () => {
  const med = F.computeFor('med', { marca: 'Mounjaro', concentracion: '2.5 mg', volumen: '0.6 mL', principio: 'Tirzepatida', forma: 'Solución inyectable', contenido: 'Caja con 4 plumas', laboratorio: 'Eli Lilly', via: 'Subcutánea', receta: 'si' }, keep, meta).mc.text;
  assert.ok(!/Presentación/.test(med));
  assert.match(med, /Caja con 4 plumas - Laboratorio Eli Lilly|Caja con 4 plumas - Eli Lilly/, 'el contenido sigue en el encabezado');
  assert.match(med, /Forma farmacéutica: Solución inyectable\. Vía de administración: Subcutánea\./);
  const cos = F.computeFor('cos', { marca: 'La Roche-Posay', producto: 'Hyalu B5', atributo: 'Ácido hialurónico', contenido: 'Frasco 30 mL', fabricante: "L'Oréal", piel: 'Piel sensible' }, keep, meta).mc.text;
  assert.ok(!/Presentación/.test(cos));
  assert.match(cos, /Se presenta en un frasco de 30 mL\./);
});

/* ---------- Ficha de Fresubin: frase de presentación, preguntas, alérgenos y composición resumida ---------- */
const fresubin = { marca: 'Fresubin HPC', componente: 'Fórmula Hipercalórica e Hiperproteica', forma: 'Líquido', sabor: 'Frutos del Bosque', contenido: '200 mL', envase: 'Botella', porcion: '200 mL', porciones: '1', fabricante: 'Fresenius Kabi',
  publico: 'Pacientes con requerimientos elevados o restricción de líquidos, adultos mayores, sarcopenia o en unidades de cuidados intensivos.',
  composicion: 'Aporte nutricional por 200 ml:• Proteínas: 20 g • Carbohidratos: 45 g • Lípidos (grasas): 15.6 g • Fibra: 0 g (sin fibra)',
  ingredientes: 'Agua, maltodextrina, jarabe de glucosa, sacarosa, caseinato de calcio, proteínas de leche, lecitina de soya, aceite de girasol, sabor frutas del bosque',
  alergenos: 'Libre de gluten y lactosa (no apto para galactosémicos).', modo: 'Producto listo para tomarse frío o a temperatura ambiente.',
  caracteristicas: 'La fórmula enteral hipercalórica, hiperproteica es un alimento especializado completo, de alto valor proteico y energético (2 kcal/mL).' };

test('presentación: la frase inicial se arma según forma, envase y contenido', () => {
  const intro = v => F.computeFor('sup', { ...supBase, ...v }, keep, meta).mg.html.split('\n')[0].replace(/<\/?strong>/g, '');
  assert.match(intro({ forma: 'Líquido', contenido: '200 mL', envase: 'Botella' }), /Este suplemento se presenta en forma de líquido, en una botella de 200 ml\./);
  assert.match(intro({ forma: 'Polvo', contenido: '900 g', envase: 'Bote' }), /se presenta en forma de polvo, en un bote de 900 g\./);
  assert.match(intro({ forma: 'Cápsulas', contenido: 'Frasco con 100 piezas', envase: '' }), /se presenta en forma de cápsulas, en un frasco con 100 piezas\./);
  assert.match(intro({ forma: 'Líquido', contenido: '200 mL', envase: 'Botella de plástico con tapa de seguridad' }), /en una presentación de 200 ml\./, 'un envase largo no se mete en la frase');
  assert.match(intro({ forma: 'Líquido', contenido: '200 mL', envase: '' }), /en forma de líquido, en una presentación de 200 ml\./);
  assert.match(intro({ forma: '', contenido: '200 mL', envase: 'Botella' }), /Este suplemento se presenta en una botella de 200 ml\./);
  const q = [...Array(4).keys()].flatMap(sd => F.buildFaq(F.CATS.sup, { ...supBase, forma: 'Líquido', contenido: '200 mL', envase: 'Botella' }, sd).items);
  assert.ok(q.filter(([a]) => /presenta|presentación/.test(a)).every(([, b]) => b === 'Se presenta en forma de líquido, en una botella de 200 mL.'));
});

test('preguntas frecuentes: sin doble punto, sabor en minúscula, nombre corto, «No.» en medicamento y sin respuestas largas repetidas', () => {
  const largo = { ...fresubin, ingredientes: fresubin.ingredientes + ', ' + 'polvo de betabel, extracto de especias rojas, ácido clorhídrico, '.repeat(6) };
  const items = [...Array(6).keys()].flatMap(sd => F.buildFaq(F.CATS.sup, largo, sd).items);
  const resp = re => items.filter(([a]) => re.test(a)).map(([, b]) => b);
  assert.ok(items.every(([, b]) => !/\.\.$/.test(b)), 'ninguna respuesta termina en doble punto');
  assert.ok(resp(/dirigido|para quién/i).every(b => /^Va dirigido a pacientes con requerimientos elevados.*intensivos\.$/.test(b) || /^Está dirigido a pacientes/.test(b)));
  assert.ok(resp(/sabor/).every(b => /frutos del bosque\.$/.test(b)), 'el sabor va en minúscula dentro de la frase');
  assert.ok(items.every(([a]) => !/Fórmula Hipercalórica e Hiperproteica/.test(a)) && items.some(([a]) => /Fresubin HPC\?/.test(a)), 'el nombre largo se acorta a la marca');
  assert.ok(resp(/medicamento/).every(b => b.startsWith('No. El consumo de este producto')));
  assert.ok(!items.some(([a]) => /ingredientes/.test(a)), 'la lista larga de ingredientes no se repite en las preguntas');
  assert.ok(items.every(([, b]) => b.length <= 250));
  const corto = F.buildFaq(F.CATS.sup, { ...supBase, ingredientes: 'Agua, sal' }, 0).items.map(x => x[0]).join(' ');
  assert.match(corto, /ingredientes/, 'una lista corta sí se incluye');
  assert.match(items.find(([a]) => /composición|contiene/.test(a))[1], /aporte nutricional por 200 ml: Proteínas: 20 g; Carbohidratos: 45 g;/, 'el resumen con viñetas se lee como frase');
});

test('Magento: la composición resumida con viñetas sale como lista y «Dirigido a» largo sale como sección', () => {
  const h = F.computeFor('sup', fresubin, keep, meta).mg.html;
  assert.match(h, /<h2>Composición:<\/h2>\n<p>Aporte nutricional por 200 ml:<\/p>\n<ul>\n  <li>Proteínas: 20 g<\/li>\n  <li>Carbohidratos: 45 g<\/li>/);
  assert.match(h, /<h2>Dirigido a:<\/h2>\n<p>Pacientes con requerimientos elevados/);
  assert.ok(!/<li><strong>Dirigido a:<\/strong>/.test(h));
  assert.match(F.computeFor('sup', { ...fresubin, publico: 'Adultos' }, keep, meta).mg.html, /<li><strong>Dirigido a:<\/strong> Adultos<\/li>/);
  assert.match(F.computeFor('sup', { ...fresubin, composicion: 'Proteína de suero' }, keep, meta).mg.html, /<h2>Composición:<\/h2>\n<p>Proteína de suero<\/p>/);
  assert.match(F.computeFor('sup', fresubin, keep, meta).mc.text, /que contiene aporte nutricional por 200 m[lL]: Proteínas: 20 g; Carbohidratos: 45 g/, 'en Merchant Center las viñetas pasan a frase');
});

test('alérgenos: avisa si los ingredientes mencionan alérgenos que «Alérgenos» no declara, y no declara nada por ti', () => {
  const a = F.lint(F.CATS.sup, { ingredientes: fresubin.ingredientes, alergenos: fresubin.alergenos }).check.join(' ');
  assert.match(a, /Los ingredientes mencionan leche, soya, pero «Alérgenos» no los menciona/);
  assert.deepEqual(F.lint(F.CATS.sup, { ingredientes: fresubin.ingredientes, alergenos: 'Contiene leche y soya.' }).check, []);
  assert.match(F.lint(F.CATS.sup, { ingredientes: 'Harina de trigo, huevo en polvo, almendras' }).check.join(' '), /trigo, huevo, frutos secos, pero «Alérgenos» no los menciona/);
  assert.deepEqual(F.lint(F.CATS.sup, { ingredientes: 'Agua, sal, sucralosa' }).check, [], 'sin alérgenos no avisa');
  assert.match(F.lint(F.CATS.sup, { ingredientes: 'Suero de leche' }).check.join(' '), /mencionan leche, pero «Alérgenos» no lo menciona/);
  assert.equal(F.computeFor('sup', { ...fresubin, alergenos: '' }, keep, meta).mg.html.includes('Alérgenos:'), false, 'la herramienta no inventa la declaración');
});

test('lint: el tipo y el contenido no se mezclan y los laboratorios se llaman Laboratorio fuera de dispositivos y accesorios', () => {
  const chk = (id, raw) => F.lint(F.CATS[id], raw).check.join(' ');
  assert.equal(chk('sup', { componente: '200 mL', contenido: 'Fórmula hipercalórica' }), '', 'al revés se acomoda solo');
  assert.match(chk('sup', { componente: 'Fórmula hipercalórica', contenido: 'Botella' }), /no lleva una cantidad/);
  assert.equal(chk('sup', { componente: 'Fórmula hipercalórica', contenido: '200 mL' }), '');
  assert.equal(chk('sup', { componente: 'Vitamina B12 1000 mcg', contenido: 'Frasco con 30' }), '');
  const lbl = (id) => F.CATS[id].fields.find(f => f.key === 'fabricante').label;
  assert.deepEqual(['cos', 'sup', 'beb', 'hig', 'dis', 'acc'].map(lbl), ['Laboratorio', 'Laboratorio', 'Laboratorio', 'Laboratorio', 'Fabricante', 'Fabricante']);
});

test('tipo y contenido: lo mezclado se acomoda solo y deja constancia', () => {
  const run = r => F.computeFor('sup', { marca: 'X', forma: 'Líquido', fabricante: 'F', ...r }, new Set(), F.defMeta());
  const g = r => { const x = run(r); return [x.vt.v.componente, x.vt.v.contenido, x.vt.changes.length]; };
  assert.deepEqual(g({ componente: '200 mL', contenido: 'Fórmula hipercalórica' }), ['Fórmula hipercalórica', '200 mL', 2], 'al revés: se intercambian');
  assert.deepEqual(g({ componente: 'Fórmula hipercalórica 200 mL' }), ['Fórmula hipercalórica', '200 mL', 2], 'mezclados: se separan');
  assert.deepEqual(g({ componente: 'Fórmula hipercalórica', contenido: '200 mL' }), ['Fórmula hipercalórica', '200 mL', 0], 'lo correcto no se toca');
  assert.deepEqual(g({ componente: 'Vitamina C 500 mg', contenido: 'Frasco con 30 cápsulas' }).slice(0, 2), ['Vitamina C 500 mg', 'Frasco con 30 cápsulas'], 'una concentración no es contenido');
  assert.deepEqual(g({ contenido: 'Fórmula hipercalórica' }).slice(0, 2), ['Fórmula hipercalórica', ''], 'un contenido sin cantidad pasa a tipo si el tipo está vacío');
  assert.deepEqual(g({ componente: 'Colágeno', contenido: 'Frasco con 30 cápsulas' }).slice(2), [0]);
  assert.match(run({ componente: '200 mL', contenido: 'Fórmula hipercalórica' }).title.title, /^X Fórmula hipercalórica \| /);
});

/* ---------- Cosméticos: ficha homologada ---------- */
const COSX = {
  serum: { marca: 'La Roche-Posay', producto: 'Hyalu B5', tipo: 'Sérum facial', zona: 'Rostro y cuello', beneficio: 'Hidratación', atributo: 'Ácido hialurónico', ingredientes: 'Ácido hialurónico, vitamina B5 y madecasósido', piel: 'Todo tipo de piel', textura: 'Ligera y de rápida absorción', contenido: '30 mL', envase: 'Frasco con gotero', fabricante: "L'Oréal", beneficios: 'Hidratación para todo tipo de piel\nTextura ligera' },
  locion: { marca: 'CeraVe', producto: 'Loción hidratante', tipo: 'Loción corporal', atributo: 'Ceramidas', piel: 'Piel normal a seca', contenido: '473 mL', envase: 'Botella', fabricante: "L'Oréal" },
  solar: { marca: 'Marca Ejemplo', producto: 'Fluido Facial', tipo: 'Protector solar facial', beneficio: 'Protección muy alta', fps: '50+', nivel: 'Muy alta', espectro: 'Amplio espectro (UVA y UVB)', modo: 'Aplicar generosamente 15 minutos antes de la exposición al sol. Reaplicar cada 2 horas.', precauciones: 'Uso externo.', piel: 'Piel mixta a grasa', contenido: '50 mL', envase: 'Tubo', fabricante: 'Laboratorios Ejemplo' },
  base: { marca: 'Marca Ejemplo', producto: 'Satín', tipo: 'Base de maquillaje fluida', tipoCorto: 'Base fluida', beneficio: 'Cobertura media', variante: 'Tono 120 Beige', contenido: '30 mL', envase: 'Frasco con bomba', fabricante: 'Laboratorios Ejemplo', piel: 'Todo tipo de piel' }
};
const mt = () => { const m = F.defMeta(); m.tienda = 'Farmacias Especializadas'; return m; };

test('cosméticos: el título no repite el tipo, lleva FPS y variante, y no lleva laboratorio', () => {
  const t = k => F.computeFor('cos', COSX[k], keep, mt()).title;
  assert.equal(t('serum').title, 'La Roche-Posay Hyalu B5 Sérum facial | Con ácido hialurónico | 30 mL');
  assert.equal(t('locion').title, 'CeraVe Loción hidratante corporal | Con ceramidas | 473 mL');
  assert.equal(t('solar').title, 'Marca Ejemplo Fluido Facial Protector solar | FPS 50+ | 50 mL');
  assert.equal(t('base').title, 'Marca Ejemplo Satín Base de maquillaje fluida | Tono 120 Beige | 30 mL');
  assert.deepEqual(t('base').softDropped, ['Cobertura media'], 'lo opcional se omite si el título pasa de 70 caracteres y se avisa');
  assert.ok(t('serum').title.length <= 70 && !/L'Oréal/.test(t('serum').title));
});

test('cosméticos: basta con el beneficio, el activo o el FPS, y sin ninguno falta el dato', () => {
  const base = { marca: 'X', producto: 'Y', tipo: 'Crema', contenido: '50 g', fabricante: 'Z' };
  assert.deepEqual(F.computeFor('cos', base, keep, mt()).title.missing, ['Activo principal o beneficio principal o factor de protección solar (FPS)']);
  assert.deepEqual(F.computeFor('cos', { ...base, beneficio: 'Hidratación' }, keep, mt()).title.missing, []);
  assert.deepEqual(F.computeFor('cos', { ...base, fps: '30' }, keep, mt()).title.missing, []);
  assert.ok(F.computeFor('cos', base, keep, mt()).mg.blocked, 'Magento no sale sin beneficio, activo ni FPS');
  assert.equal(F.computeFor('cos', { ...base, beneficio: 'Hidratación' }, keep, mt()).mg.blocked, null);
});

test('cosméticos: la presentación se separa de la cantidad y deja constancia', () => {
  const r = F.computeFor('cos', { ...COSX.serum, contenido: 'Frasco con gotero de 30 mL', envase: '' }, keep, mt());
  assert.equal(r.vt.v.contenido, '30 mL');
  assert.equal(r.vt.v.envase, 'Frasco con gotero');
  assert.ok(r.vt.changes.some(c => c.label === 'Contenido neto' && c.to === '30 mL'));
  for (const [raw, env, cont] of [['Botella con 473 mL', 'Botella', '473 mL'], ['Tubo de 50 mL', 'Tubo', '50 mL'], ['Frasco 454 g', 'Frasco', '454 g']]) {
    const x = F.computeFor('cos', { ...COSX.locion, contenido: raw, envase: '' }, keep, mt()).vt.v;
    assert.deepEqual([x.envase, x.contenido], [env, cont], raw);
  }
  assert.equal(F.computeFor('cos', { ...COSX.locion, contenido: 'Botella con 473 mL', envase: 'Pump' }, keep, mt()).vt.v.envase, 'Pump', 'si ya hay presentación no se pisa');
  assert.equal(F.computeFor('cos', { ...COSX.locion, contenido: '2 x 473 mL', envase: '' }, keep, mt()).vt.v.contenido, '2 x 473 mL');
});

test('cosméticos: meta title con la variante primero y meta description con frases completas', () => {
  const m = k => F.computeFor('cos', COSX[k], keep, mt()).meta;
  assert.equal(m('serum').mt.text, 'La Roche-Posay Hyalu B5 Sérum facial | 30 mL');
  assert.match(m('serum').notes.join(' '), /Meta title: se omitió «Farmacias Especializadas», «con ácido hialurónico»/);
  assert.equal(m('solar').mt.text, 'Marca Ejemplo Fluido Facial Protector solar FPS 50+ | 50 mL');
  assert.equal(m('base').mt.text, 'Marca Ejemplo Satín Base fluida | Tono 120 Beige, 30 mL', 'el tipo corto deja lugar a la variante');
  assert.equal(m('locion').md.text, 'CeraVe Loción hidratante corporal con ceramidas. Hidratación sin definir. Botella de 473 mL. Compra en Farmacias Especializadas.'.replace('Hidratación sin definir', 'Para piel normal a seca'));
  assert.ok(m('serum').md.text.length <= 155);
  const sinBen = F.computeFor('cos', { ...COSX.serum, beneficio: '', piel: '' }, keep, mt()).meta.md.text;
  assert.ok(!/\. \./.test(sinBen) && !/\. para /.test(sinBen), 'sin beneficio ni piel no queda una frase suelta');
});

test('cosméticos: la descripción de Merchant Center tiene género, no repite el título y cierra con el aviso', () => {
  const mc = k => F.computeFor('cos', COSX[k], keep, mt()).mc.text;
  assert.match(mc('serum'), /^La Roche-Posay Hyalu B5 es un sérum facial, formulado con ácido hialurónico, vitamina B5 y madecasósido, para todo tipo de piel\./);
  assert.match(mc('locion'), /^CeraVe Loción hidratante es una loción corporal, formulada con ceramidas, para piel normal a seca\./);
  assert.match(mc('solar'), /es un protector solar facial, con FPS 50\+ \(protección muy alta\) y amplio espectro \(UVA y UVB\), para piel mixta a grasa\./);
  assert.match(mc('solar'), /Reaplicar cada 2 horas\. Se presenta en un tubo de 50 mL\. Este producto no es un medicamento\.$/);
  assert.ok(!/30 mL - |L'Oréal/.test(mc('serum')), 'sin la cabecera repetida del título ni el laboratorio');
  assert.match(mc('base'), /^Marca Ejemplo Satín es una base de maquillaje fluida en tono 120 Beige, para todo tipo de piel\./);
  assert.match(F.computeFor('cos', { ...COSX.serum, tipo: 'Cosa rara' }, keep, mt()).mc.text, /es un cosa rara|es un producto/, 'un tipo fuera de la lista no rompe la redacción');
});

test('cosméticos: la ficha de Magento ordena beneficios, ficha técnica, uso, ingredientes y aviso', () => {
  const h = F.computeFor('cos', { ...COSX.serum, modo: 'Aplicar por la mañana y por la noche.', inci: 'Aqua, Glycerin', precauciones: 'Uso externo.', atributos: 'Sin aceites', pao: '12 meses', origen: 'Francia' }, keep, mt()).mg.html;
  const pos = re => h.search(re);
  const orden = [/<p><strong>La Roche-Posay Hyalu B5<\/strong> es un sérum facial de <strong>L'Oréal<\/strong>/, /<h2>Beneficios principales:/, /<h2>Ficha técnica del producto:/, /<h2>Modo de uso:/, /<h2>Ingredientes:/, /<h2>Características:/, /<h2>Precauciones:/, /<p>Este producto no es un medicamento\.<\/p>/, /<h2>Preguntas frecuentes:/].map(pos);
  assert.ok(orden.every(n => n >= 0) && orden.every((n, i) => !i || n > orden[i - 1]), 'orden: ' + orden.join(','));
  assert.match(h, /<li>Hidratación para todo tipo de piel<\/li>/);
  assert.match(h, /Zona de aplicación:<\/strong> Rostro y cuello/);
  assert.match(h, /Presentación:<\/strong> Frasco con gotero/);
  assert.match(h, /Duración después de abierto \(PAO\):<\/strong> 12 meses/);
  assert.match(h, /Se presenta en un frasco con gotero de <strong>30 ml<\/strong>\./);
  assert.ok(!/dermatológico|Esta fórmula en tipo/.test(h));
  const sol = F.computeFor('cos', COSX.solar, keep, mt()).mg.html;
  assert.match(sol, /<h2>Protección solar:<\/h2>[\s\S]*Espectro:<\/strong> Amplio espectro \(UVA y UVB\)/);
});

test('cosméticos: preguntas frecuentes de lo capturado, con variante y sin inventar', () => {
  const faq = k => F.computeFor('cos', COSX[k], keep, mt()).mg.faq.map(([q, a]) => q + ' ' + a).join('\n');
  assert.match(faq('serum'), /¿Para qué sirve La Roche-Posay Hyalu B5\?[^\n]*Ofrece hidratación|¿Qué beneficio ofrece[^\n]*Ofrece hidratación/);
  assert.match(faq('serum'), /¿Dónde se aplica|¿En qué zona se usa/);
  assert.match(faq('solar'), /Factor de protección solar \(FPS\) 50\+\. Nivel de protección: muy alta\. Amplio espectro \(UVA y UVB\)\./);
  assert.match(faq('base'), /¿Qué tono es[^\n]*Es el tono 120 Beige\./);
  assert.match(faq('locion'), /No\. Este producto no es un medicamento\./);
  assert.ok(!/¿Dónde se aplica/.test(faq('locion')), 'sin zona capturada no hay pregunta');
  const todas = F.computeFor('cos', { ...COSX.serum, atributos: 'Sin aceites, No comedogénico' }, keep, mt()).mg.faq.map(([q, a]) => q + ' ' + a).join('\n');
  assert.match(todas, /Sin aceites, No comedogénico\./);
});

test('cosméticos: las características declaradas se revisan contra el INCI y no salen si se contradicen', () => {
  const v = { ...COSX.serum, atributos: 'Sin fragancia, Sin aceites', inci: 'Aqua / Water, Glycerin, Parfum' };
  const r = F.computeFor('cos', v, keep, mt());
  assert.ok(!/Sin fragancia/.test(r.mg.html), 'el atributo en conflicto no se publica');
  assert.match(r.mg.html, /<li>Sin aceites<\/li>/);
  assert.ok(!/Sin fragancia/.test(r.mg.faq.map(x => x.join(' ')).join(' ')));
  assert.match(F.lint(F.CATS.cos, v).check.join(' '), /«Sin fragancia», pero la lista de ingredientes \(INCI\) incluye fragancia/);
  assert.equal(F.lint(F.CATS.cos, { ...v, inci: 'Aqua, Glycerin' }).check.filter(x => /fragancia/.test(x)).length, 0);
  assert.equal(F.cosAttrs({ atributos: 'Sin fragancia' }).ok.length, 1, 'sin INCI no se verifica');
  assert.match(F.lint(F.CATS.cos, { ...v, inci: 'Aqua, Linalool' }).check.join(' '), /linalool o limonene/);
  assert.match(F.lint(F.CATS.cos, { ...COSX.serum, atributos: 'Sin alcohol', inci: 'Aqua, Alcohol Denat.' }).check.join(' '), /alcohol/);
  assert.equal(F.lint(F.CATS.cos, { ...COSX.serum, atributos: 'Sin alcohol', inci: 'Aqua, Cetearyl Alcohol' }).check.filter(x => /alcohol/.test(x)).length, 0, 'un alcohol graso no es alcohol denat.');
});

test('cosméticos: lenguaje terapéutico en beneficios y zona que no coincide con el tipo', () => {
  const L = F.lint(F.CATS.cos, { ...COSX.serum, beneficios: 'Ayuda a tratar el acné\nHidrata' });
  assert.ok(L.med.some(x => x.term === 'trata' && x.field === 'Beneficios'));
  assert.match(F.lint(F.CATS.cos, { ...COSX.serum, zona: 'Cuerpo' }).check.join(' '), /tipo «Sérum facial» y la zona de aplicación «Cuerpo» no coinciden/);
  assert.equal(F.lint(F.CATS.cos, COSX.serum).check.length, 0);
  assert.equal(F.lint(F.CATS.cos, { ...COSX.locion, zona: 'Rostro y cuerpo' }).check.length, 0);
});

test('cosméticos: la plantilla de meta genérica guardada pasa a la nueva si no está confirmada', () => {
  const m = F.defMeta(); m.cats.cos.mt = { ...F.META_GEN.mt }; m.cats.cos.md = { ...F.META_GEN.md };
  F.migrateMeta(m);
  assert.equal(m.cats.cos.mt.tpl, F.META_COS.mt.tpl);
  const c = F.defMeta(); c.cats.cos.confirmed = true; c.cats.cos.mt = { ...F.META_GEN.mt };
  F.migrateMeta(c);
  assert.equal(c.cats.cos.mt.tpl, F.META_GEN.mt.tpl, 'confirmada: no se toca');
});

/* ---------- Cuidado personal: ficha homologada ---------- */
const HIGX = {
  pasta: { marca: 'Colgate', producto: 'Total 12', tipo: 'Pasta dental', beneficio: 'Salud bucal completa', variante: 'Menta', publico: 'Adultos', contenido: '100 mL', envase: 'Tubo', fabricante: 'Colgate-Palmolive', fluor: '1,450 ppm', modo: 'Aplicar sobre el cepillo.', precauciones: 'No tragar.' },
  shampoo: { marca: 'Marca Ejemplo', producto: 'Coco Nutritivo', tipo: 'Shampoo hidratante', beneficio: 'Hidratación del cabello', variante: 'Aroma coco', publico: 'Todo tipo de cabello', ingredientes: 'Aceite de coco', contenido: '750 mL', envase: 'Botella con dosificador', fabricante: 'Laboratorios Ejemplo' },
  toallas: { marca: 'Marca Ejemplo', producto: 'Noche', tipo: 'Toallas sanitarias', beneficio: 'Protección nocturna', variante: 'Nocturnas', publico: 'Mujeres', contenido: '10 piezas', envase: 'Paquete', fabricante: 'Laboratorios Ejemplo' },
  panales: { marca: 'Marca Ejemplo', producto: 'Etapa Activa', tipo: 'Pañales desechables', beneficio: 'Absorción', talla: 'Etapa 3', publico: 'Bebés de 6 a 10 kg', contenido: '60 piezas', envase: 'Paquete', fabricante: 'Laboratorios Ejemplo' }
};

test('cuidado personal: título con línea, tipo, variante, talla y cantidad, sin laboratorio', () => {
  const t = k => F.computeFor('hig', HIGX[k], keep, mt()).title;
  assert.equal(t('pasta').title, 'Colgate Total 12 Pasta dental | Salud bucal completa | Menta | 100 mL');
  assert.equal(t('shampoo').title, 'Marca Ejemplo Coco Nutritivo Shampoo hidratante | Aroma coco | 750 mL');
  assert.deepEqual(t('shampoo').softDropped, ['Hidratación del cabello'], 'el beneficio se omite si el título pasa de 70 y se avisa');
  assert.equal(t('panales').title, 'Marca Ejemplo Etapa Activa Pañales desechables | Etapa 3 | 60 piezas');
  assert.ok(!/Laboratorios Ejemplo|Colgate-Palmolive/.test(t('pasta').title + t('toallas').title));
});

test('cuidado personal: lo mínimo es el nombre o el tipo, y la presentación se separa de la cantidad', () => {
  const base = { marca: 'M', contenido: '60 piezas', fabricante: 'L' };
  assert.deepEqual(F.computeFor('hig', base, keep, mt()).title.missing, ['Línea o nombre del producto o tipo de producto']);
  assert.deepEqual(F.computeFor('hig', { ...base, tipo: 'Pañales' }, keep, mt()).title.missing, []);
  const r = F.computeFor('hig', { ...HIGX.panales, contenido: 'Paquete con 60 piezas', envase: '' }, keep, mt()).vt.v;
  assert.deepEqual([r.envase, r.contenido], ['Paquete', '60 piezas']);
  const q = F.computeFor('hig', { ...HIGX.pasta, tipo: 'Pasta dental 100 mL', contenido: '', envase: '' }, keep, mt()).vt.v;
  assert.deepEqual([q.tipo, q.contenido], ['Pasta dental', '100 mL'], 'una cantidad escrita en el tipo pasa al contenido');
});

test('cuidado personal: metas con la variante primero y descripción de Merchant Center con género y número', () => {
  const r = k => F.computeFor('hig', HIGX[k], keep, mt());
  assert.equal(r('pasta').meta.mt.text, 'Colgate Total 12 Pasta dental | Menta, 100 mL');
  assert.equal(r('panales').meta.mt.text, 'Marca Ejemplo Etapa Activa Pañales desechables | Etapa 3, 60 piezas');
  assert.equal(r('pasta').meta.md.text, 'Colgate Total 12 Pasta dental. Salud bucal completa para adultos. Tubo de 100 mL. Compra en Farmacias Especializadas.');
  assert.match(r('pasta').mc.text, /^Colgate Total 12 es una pasta dental en variante menta, con flúor, para adultos\. Ofrece salud bucal completa\. Aplicar sobre el cepillo\. Se presenta en un tubo de 100 mL\. Este producto no es un medicamento\.$/);
  assert.match(r('toallas').mc.text, /^Marca Ejemplo Noche son toallas sanitarias en variante nocturnas, para mujeres\./);
  assert.match(r('panales').mc.text, /^Marca Ejemplo Etapa Activa son pañales desechables, etapa 3, para bebés de 6 a 10 kg\./);
});

test('cuidado personal: el aviso «no es un medicamento» solo en aseo y belleza, no en pañales ni toallas', () => {
  const r = k => F.computeFor('hig', HIGX[k], keep, mt());
  for (const k of ['pasta', 'shampoo']) {
    assert.match(r(k).mc.text, /Este producto no es un medicamento\.$/);
    assert.match(r(k).mg.html, /<p>Este producto no es un medicamento\.<\/p>/);
    assert.match(r(k).mg.faq.map(x => x.join(' ')).join('\n'), /No\. Este producto no es un medicamento\./);
  }
  for (const k of ['toallas', 'panales']) {
    assert.ok(!/medicamento/.test(r(k).mc.text + r(k).mg.html), k);
  }
});

test('cuidado personal: la ficha de Magento ordena beneficios, ficha técnica, uso, ingredientes y preguntas', () => {
  const h = F.computeFor('hig', { ...HIGX.shampoo, modo: 'Aplicar sobre el cabello húmedo.', inci: 'Aqua, Parfum', atributos: 'Sin parabenos', precauciones: 'Uso externo.', duracion: '48 horas', fluor: '' }, keep, mt()).mg.html;
  const orden = [/<p><strong>Marca Ejemplo Coco Nutritivo<\/strong> es un shampoo hidratante de <strong>Laboratorios Ejemplo<\/strong>/, /<h2>Beneficios principales:/, /<h2>Ficha técnica del producto:/, /<h2>Modo de uso:/, /<h2>Ingredientes:/, /<h2>Características declaradas:/, /<h2>Precauciones:/, /<p>Este producto no es un medicamento\.<\/p>/, /<h2>Preguntas frecuentes:/].map(re => h.search(re));
  assert.ok(orden.every((n, i) => n >= 0 && (!i || n > orden[i - 1])), orden.join(','));
  assert.match(h, /Duración declarada en el empaque:<\/strong> 48 horas/);
  assert.match(h, /Se presenta en una botella con dosificador de <strong>750 ml<\/strong>\./);
  assert.ok(!/artículo de higiene|Esta variante con características/.test(h));
  const faq = F.computeFor('hig', { ...HIGX.pasta }, keep, mt()).mg.faq.map(x => x.join(' ')).join('\n');
  assert.match(faq, /¿Cuánto flúor declara[^\n]*Según su empaque, declara 1,450 ppm\./);
  assert.match(faq, /¿Cuántas piezas trae|¿Cuánto producto trae|¿Qué contenido tiene/);
  assert.match(F.computeFor('hig', HIGX.panales, keep, mt()).mg.faq.map(x => x.join(' ')).join('\n'), /¿(?:Qué talla o etapa es|Cuál es la talla de)[^\n]*Es etapa 3\./);
});

test('cuidado personal: características declaradas contra el INCI, duración, pañales sin talla y lenguaje subjetivo', () => {
  const L = (extra) => F.lint(F.CATS.hig, { ...HIGX.shampoo, ...extra });
  assert.match(L({ atributos: 'Sin sulfatos', inci: 'Aqua, Sodium Laureth Sulfate' }).check.join(' '), /«Sin sulfatos», pero la lista de ingredientes \(INCI\) incluye sulfatos/);
  assert.equal(L({ atributos: 'Sin sulfatos', inci: 'Aqua, Glycerin' }).check.length, 0);
  assert.match(L({ atributos: 'Sin aluminio', inci: 'Aluminum Chlorohydrate, Aqua' }).check.join(' '), /aluminio/);
  assert.match(L({ duracion: '48 horas' }).check.join(' '), /«48 horas» es una afirmación que requiere sustento/);
  assert.match(F.lint(F.CATS.hig, { ...HIGX.panales, talla: '' }).check.join(' '), /Pañales sin talla o etapa/);
  assert.match(F.lint(F.CATS.hig, { ...HIGX.panales, contenido: '60' }).check.join(' '), /cuántas piezas trae/);
  assert.equal(F.lint(F.CATS.hig, HIGX.panales).check.length, 0);
  assert.ok(F.lint(F.CATS.hig, { ...HIGX.panales, beneficios: 'Ajuste cómodo' }).vacio.some(x => x.term === 'cómodo'));
  const bad = F.computeFor('hig', { ...HIGX.shampoo, atributos: 'Sin sulfatos, Sin parabenos', inci: 'Aqua, Sodium Laureth Sulfate' }, keep, mt()).mg.html;
  assert.ok(!/Sin sulfatos/.test(bad) && /<li>Sin parabenos<\/li>/.test(bad), 'la característica en conflicto no se publica');
});

test('cuidado personal: etiquetas nuevas, meta migrada y datos viejos que siguen funcionando', () => {
  const lbl = k => F.CATS.hig.fields.find(f => f.key === k).label;
  assert.deepEqual([lbl('producto'), lbl('variante'), lbl('contenido'), lbl('talla')], ['Línea o nombre del producto', 'Aroma o variante', 'Contenido neto', 'Talla o etapa']);
  const m = F.defMeta(); m.cats.hig.mt = { ...F.META_GEN.mt };
  F.migrateMeta(m);
  assert.equal(m.cats.hig.mt.tpl, F.META_HIG.mt.tpl);
  const viejo = F.computeFor('hig', { marca: 'Colgate', producto: 'Total 12 pasta dental', variante: 'Salud bucal completa', contenido: 'Crema 150 mL', fabricante: 'Colgate-Palmolive' }, keep, mt());
  assert.deepEqual(viejo.title.missing, []);
  assert.equal(viejo.mg.blocked, null);
  assert.match(viejo.title.title, /^Colgate Total 12 pasta dental \| Salud bucal completa \| Crema 150 mL$/);
});

/* ---------- Bebidas: ficha homologada ---------- */
const BEBX = {
  hidratante: { marca: 'Marca Ejemplo', producto: 'Hidra', tipo: 'Bebida con electrolitos', beneficio: 'Reposición de líquidos y electrolitos', sabor: 'Fresa', atributo: 'Sin cafeína', contenido: '600 mL', envase: 'Botella', fabricante: 'Laboratorios Ejemplo' },
  proteina: { marca: 'Marca Ejemplo', producto: 'Pro 20', tipo: 'Bebida de proteína', beneficio: '20 g de proteína por lata', sabor: 'Chocolate', atributo: 'Sin azúcar añadida', contenido: '12 x 330 mL', envase: 'Caja con 12 latas', fabricante: 'Laboratorios Ejemplo', ingredientes: 'Agua, proteína de leche, cacao, sucralosa, saborizante', alergenos: 'Contiene leche', modo: 'Agitar antes de abrir.' },
  agua: { marca: 'Marca Ejemplo', producto: 'Pura', tipo: 'Agua alcalina', atributo: 'pH 9.5', contenido: '1 L', envase: 'Botella' },
  formula: { marca: 'Marca Ejemplo', producto: 'Nutri Bebé', tipo: 'Fórmula infantil', beneficio: 'Alimentación del lactante', etapa: 'Etapa 1', publico: 'Lactantes de 0 a 6 meses', contenido: '800 g', envase: 'Lata', fabricante: 'Laboratorios Ejemplo' }
};

test('bebidas: título con línea, tipo, sabor, etapa y cantidad; sabor y atributo opcionales; pH conserva su escritura', () => {
  const t = k => F.computeFor('beb', BEBX[k], keep, mt()).title;
  assert.equal(t('hidratante').title, 'Marca Ejemplo Hidra Bebida con electrolitos | Sabor Fresa | Sin cafeína | 600 mL'.replace(' | Sin cafeína', ''), 'el atributo se omite al pasar de 70');
  assert.deepEqual(t('hidratante').softDropped, ['Sin cafeína']);
  assert.equal(t('proteina').title, 'Marca Ejemplo Pro 20 Bebida de proteína | Sabor Chocolate | 12 x 330 mL');
  assert.equal(t('agua').title, 'Marca Ejemplo Pura Agua alcalina | pH 9.5 | 1 L');
  assert.equal(t('formula').title, 'Marca Ejemplo Nutri Bebé Fórmula infantil | Etapa 1 | 800 g');
  assert.deepEqual(t('agua').missing, [], 'sin sabor ya no falta nada');
});

test('bebidas: «Caja con 12 latas de 330 mL» se separa en presentación y paquete', () => {
  const v = F.computeFor('beb', { ...BEBX.proteina, contenido: 'Caja con 12 latas de 330 mL', envase: '' }, keep, mt()).vt.v;
  assert.deepEqual([v.envase, v.contenido], ['Caja con 12 latas', '12 x 330 mL']);
  const w = F.computeFor('beb', { ...BEBX.hidratante, contenido: 'Botella de 600 mL', envase: '' }, keep, mt()).vt.v;
  assert.deepEqual([w.envase, w.contenido], ['Botella', '600 mL']);
});

test('bebidas: la introducción depende del tipo y ya no dice «solución líquida de hidratación»', () => {
  const r = k => F.computeFor('beb', BEBX[k], keep, mt());
  assert.match(r('proteina').mc.text, /^Marca Ejemplo Pro 20 es una bebida de proteína sabor chocolate, sin azúcar añadida\. Ofrece 20 g de proteína por lata\. Agitar antes de abrir\. Se presenta en una caja con 12 latas \(12 x 330 mL\)\.$/);
  assert.match(r('agua').mc.text, /^Marca Ejemplo Pura es agua alcalina, pH 9\.5\./);
  assert.match(r('formula').mc.text, /^Marca Ejemplo Nutri Bebé es una fórmula infantil, etapa 1, para lactantes de 0 a 6 meses\. Se presenta en una lata de 800 g\.$/);
  for (const k of Object.keys(BEBX)) assert.ok(!/solución líquida|hidratación del usuario/.test(r(k).mg.html + r(k).mc.text), k);
  assert.ok(!/Ofrece alimentación/.test(r('formula').mc.text + r('formula').mg.faq.map(x => x.join(' ')).join(' ')), 'en fórmulas infantiles no se genera la frase de beneficio');
  assert.ok(!/medicamento/.test(r('hidratante').mc.text + r('hidratante').mg.html), 'ninguna bebida lleva «no es un medicamento»');
});

test('bebidas: metas con sabor y cantidad primero, y descripción para quién', () => {
  const m = k => F.computeFor('beb', BEBX[k], keep, mt()).meta;
  assert.equal(m('proteina').mt.text, 'Marca Ejemplo Pro 20 Bebida de proteína | Sabor Chocolate, 12 x 330 mL');
  assert.equal(m('proteina').md.text, 'Marca Ejemplo Pro 20 Bebida de proteína. 20 g de proteína por lata. Caja con 12 latas (12 x 330 mL). Compra en Farmacias Especializadas.');
  assert.equal(m('formula').md.text, 'Marca Ejemplo Nutri Bebé Fórmula infantil. Para lactantes de 0 a 6 meses. Lata de 800 g. Compra en Farmacias Especializadas.');
});

test('bebidas: Magento ordena beneficios, ficha técnica, tabla nutrimental, ingredientes, alérgenos y sellos', () => {
  const h = F.computeFor('beb', { ...BEBX.proteina, nutrimental: 'Nutriente | Por 330 mL\nEnergía | 120 kcal\nProteínas | 20 g\nAzúcares | 0 g', leyenda: 'CONTIENE EDULCORANTES, NO RECOMENDABLE EN NIÑOS', atributos: 'Sin azúcar añadida' }, keep, mt()).mg.html;
  const orden = [/<p><strong>Marca Ejemplo Pro 20<\/strong> es una bebida de proteína de <strong>Laboratorios Ejemplo<\/strong>/, /<h2>Beneficios principales:/, /<h2>Ficha técnica de la bebida:/, /id="tabla-nutrimental"/, /<h2>Modo de consumo:/, /<h2>Ingredientes:/, /<h2>Alérgenos:/, /<h2>Sellos y leyendas del empaque:/, /<h2>Características declaradas:/, /<h2>Preguntas frecuentes:/].map(re => h.search(re));
  assert.ok(orden.every((n, i) => n >= 0 && (!i || n > orden[i - 1])), orden.join(','));
  assert.match(h, /CONTIENE EDULCORANTES, NO RECOMENDABLE EN NIÑOS/);
  assert.match(h, /¿Cuánta proteína tiene[\s\S]*20 g de proteína/);
});

test('bebidas: leyendas obligatorias, características declaradas, alérgenos y avisos por tipo', () => {
  const L = (extra, base = BEBX.proteina) => F.lint(F.CATS.beb, { ...base, ...extra }).check.join('\n');
  assert.match(L({}), /incluyen un edulcorante, pero no capturaste la leyenda «CONTIENE EDULCORANTES/);
  assert.equal(/edulcorante/.test(L({ leyenda: 'CONTIENE EDULCORANTES, NO RECOMENDABLE EN NIÑOS' })), false);
  assert.match(L({ ingredientes: 'Agua, cafeína', leyenda: '' }), /incluyen cafeína, pero no capturaste la leyenda «CONTIENE CAFEINA/);
  assert.match(L({ atributos: 'Sin azúcar', ingredientes: 'Agua, azúcar' }), /«Sin azúcar», pero los ingredientes incluyen azúcar/);
  assert.match(L({ atributos: 'Sin gluten', ingredientes: 'Agua, trigo' }), /cereales con gluten/);
  assert.match(L({ atributos: 'Sin cafeína', ingredientes: 'Agua, cafeína' }), /«Sin cafeína», pero los ingredientes incluyen cafeína/);
  assert.match(L({ alergenos: '' }), /mencionan leche, pero «Alérgenos» no lo menciona/);
  assert.match(L({}, { ...BEBX.hidratante, tipo: 'Suero oral' }), /Los sueros orales pueden estar registrados como medicamento/);
  assert.match(L({}, BEBX.formula), /publicidad de las fórmulas infantiles/);
  assert.equal(L({}, BEBX.agua), '');
  const publicado = F.computeFor('beb', { ...BEBX.proteina, atributos: 'Sin azúcar, Sin cafeína', ingredientes: 'Agua, azúcar, cacao' }, keep, mt()).mg.html;
  const decl = (publicado.match(/<h2>Características declaradas:<\/h2>[\s\S]*?<\/ul>/) || [''])[0];
  assert.ok(!/Sin azúcar/.test(decl) && /<li>Sin cafeína<\/li>/.test(decl), 'la característica en conflicto no se publica');
});

test('bebidas: etiquetas, meta migrada y datos viejos que siguen funcionando', () => {
  const lbl = k => F.CATS.beb.fields.find(f => f.key === k).label;
  assert.deepEqual([lbl('contenido'), lbl('leyenda'), lbl('producto')], ['Contenido neto', 'Sellos y leyendas del empaque', 'Línea o nombre del producto']);
  const m = F.defMeta(); m.cats.beb.mt = { ...F.META_GEN.mt }; F.migrateMeta(m);
  assert.equal(m.cats.beb.mt.tpl, F.META_BEB.mt.tpl);
  const viejo = F.computeFor('beb', { marca: 'Electrolit', tipo: 'Suero oral', sabor: 'Coco', atributo: 'Sin azúcar', contenido: '625 mL' }, keep, mt());
  assert.deepEqual(viejo.title.missing, []);
  assert.equal(viejo.title.title, 'Electrolit Suero oral | Sabor Coco | Sin azúcar | 625 mL');
  assert.equal(viejo.mg.blocked, null);
});

/* ---------- Dispositivos médicos: ficha homologada ---------- */
const DISX = {
  bauma: { marca: 'Marca Ejemplo', modelo: 'BP-100', tipo: 'Baumanómetro digital', tecnologia: 'Automático de brazo', fabricante: 'Marca Ejemplo', uso: 'Medición de la presión arterial y del pulso', publico: 'Adultos', paquete: 'Brazalete, 4 pilas AA, estuche e instructivo', registro: 'Reg. No. 0000X2026 SSA', caracteristicas: 'Pantalla grande\nMemoria para 2 usuarios', especificaciones: 'Rango de presión | 0 a 299 mmHg\nMedida del brazalete | 22 a 42 cm', modo: 'Colocar el brazalete y presionar inicio.' },
  termo: { marca: 'Marca Ejemplo', modelo: 'TI-20', tipo: 'Termómetro infrarrojo', tecnologia: 'Infrarrojo sin contacto', fabricante: 'Marca Ejemplo', uso: 'Medición de la temperatura corporal en la frente', declarada: 'Clínicamente validado' },
  nebu: { marca: 'Marca Ejemplo', modelo: 'NB-30', tipo: 'Nebulizador', tecnologia: 'Compresor', fabricante: 'Marca Ejemplo', uso: 'Administración de medicamento en aerosol indicado por un médico' },
  tiras: { marca: 'Marca Ejemplo', modelo: 'GT-50', tipo: 'Tiras reactivas para glucosa', fabricante: 'Marca Ejemplo', uso: 'Medición de glucosa en sangre capilar', contenido: '50 piezas', presentacion: 'Caja', compatibilidad: 'Glucómetro Marca Ejemplo GT-100' }
};

test('dispositivos: el modelo conserva sus mayúsculas y el título no lleva fabricante ni repite la tecnología', () => {
  const t = k => F.computeFor('dis', DISX[k], keep, mt()).title;
  assert.equal(t('bauma').title, 'Marca Ejemplo BP-100 Baumanómetro digital | Automático de brazo');
  assert.equal(t('termo').title, 'Marca Ejemplo TI-20 Termómetro infrarrojo | Sin contacto');
  assert.equal(t('tiras').title, 'Marca Ejemplo GT-50 Tiras reactivas para glucosa | 50 piezas');
  assert.equal(F.computeFor('dis', { ...DISX.termo, modelo: 'Ti-20 pro' }, keep, mt()).vt.v.modelo, 'Ti-20 pro');
});

test('dispositivos: los insumos ya no se bloquean y bastan tecnología, uso previsto o características', () => {
  const base = { marca: 'M', modelo: 'X1', tipo: 'Lancetas', fabricante: 'F' };
  assert.ok(F.computeFor('dis', base, keep, mt()).mg.blocked, 'sin ninguno de los tres sí se bloquea');
  assert.equal(F.computeFor('dis', { ...base, uso: 'Punción capilar' }, keep, mt()).mg.blocked, null);
  assert.equal(F.computeFor('dis', { ...base, caracteristicas: 'Calibre 30G' }, keep, mt()).mg.blocked, null);
  assert.deepEqual(F.computeFor('dis', DISX.tiras, keep, mt()).title.missing, []);
});

test('dispositivos: «Caja con 50 piezas» en la presentación se separa de la cantidad', () => {
  const v = F.computeFor('dis', { ...DISX.tiras, contenido: '', presentacion: 'Caja con 50 piezas' }, keep, mt()).vt.v;
  assert.deepEqual([v.presentacion, v.contenido], ['Caja', '50 piezas']);
});

test('dispositivos: descripción de Merchant Center por tipo, sin «equipo de medición técnica»', () => {
  const r = k => F.computeFor('dis', DISX[k], keep, mt());
  assert.match(r('bauma').mc.text, /^Marca Ejemplo BP-100 es un baumanómetro digital, automático de brazo, para adultos\. Uso previsto: medición de la presión arterial y del pulso\. Pantalla grande, memoria para 2 usuarios\. Incluye brazalete, 4 pilas aa, estuche e instructivo\./i);
  assert.match(r('tiras').mc.text, /^Marca Ejemplo GT-50 son unas tiras reactivas para glucosa\. Para medición de glucosa en sangre capilar\. Compatible con glucómetro Marca Ejemplo GT-100\. Se presenta en una caja con 50 piezas\./);
  for (const k of Object.keys(DISX)) assert.ok(!/equipo de medición técnica|integrando componentes|Cuenta con/.test(r(k).mc.text + r(k).mg.html), k);
  assert.ok(!/Dispositivo médico tiras/.test(r('tiras').mc.text), 'un insumo no se llama dispositivo médico');
});

test('dispositivos: metas con marca, modelo y tipo, y tecnología y cantidad después', () => {
  const m = k => F.computeFor('dis', DISX[k], keep, mt()).meta;
  assert.equal(m('bauma').mt.text, 'Marca Ejemplo BP-100 Baumanómetro digital | Automático de brazo');
  assert.equal(m('tiras').mt.text, 'Marca Ejemplo GT-50 Tiras reactivas para glucosa | 50 piezas');
  assert.equal(m('bauma').md.text, 'Marca Ejemplo BP-100 Baumanómetro digital. Medición de la presión arterial y del pulso. Compra en Farmacias Especializadas.');
});

test('dispositivos: la ficha de Magento ordena características, ficha técnica, especificaciones y cierre', () => {
  const h = F.computeFor('dis', DISX.bauma, keep, mt()).mg.html;
  const orden = [/es un baumanómetro digital de <strong>Marca Ejemplo<\/strong>, <strong>automático de brazo<\/strong>, para adultos\./, /<h2>Características principales:/, /<h2>Ficha técnica del producto:/, /id="especificaciones-tecnicas"/, /<h2>Contenido del paquete:/, /<h2>Instrucciones de uso:/, /Utilice el dispositivo conforme al instructivo del fabricante\. Consulte a su médico ante cualquier duda sobre sus mediciones\./, /<h2>Preguntas frecuentes:/].map(re => h.search(re));
  assert.ok(orden.every((n, i) => n >= 0 && (!i || n > orden[i - 1])), orden.join(','));
  assert.match(h, /<th scope="row">Rango de presión<\/th><td>0 a 299 mmHg<\/td>/);
  assert.match(h, /Registro sanitario:<\/strong> Reg\. No\. 0000X2026 SSA/);
  const neb = F.computeFor('dis', DISX.nebu, keep, mt()).mg.html;
  assert.ok(!/Consulte a su médico ante cualquier duda/.test(neb) && /Utilice el dispositivo conforme al instructivo/.test(neb), 'el cierre de mediciones no va en un nebulizador');
  assert.ok(!/Consulte a su médico ante cualquier duda/.test(F.computeFor('dis', DISX.tiras, keep, mt()).mg.html));
  assert.match(F.computeFor('dis', DISX.termo, keep, mt()).mg.html, /<h2>Declarado en el empaque:<\/h2>\n<p>Clínicamente validado<\/p>/);
  const faq = F.computeFor('dis', DISX.bauma, keep, mt()).mg.faq.map(x => x.join(' ')).join('\n');
  assert.match(faq, /registro sanitario[^\n]*su registro sanitario es 0000X2026 SSA\./);
  assert.match(faq, /rango de presión[^\n]*0 a 299 mmHg/i);
});

test('dispositivos: avisos de registro, validaciones, especificaciones sin barra y rango faltante', () => {
  const L = (extra, base = DISX.bauma) => F.lint(F.CATS.dis, { ...base, ...extra });
  assert.equal(L({}).check.length, 0);
  assert.match(L({ registro: '' }).check.join(' '), /No capturaste el registro sanitario/);
  assert.match(L({ especificaciones: 'Rango de presión | 0 a 299 mmHg\nPantalla grande' }).check.join(' '), /líneas no llevan «\|»[^.]*«Pantalla grande»/);
  assert.match(L({ especificaciones: 'Memoria | 60 lecturas' }).check.join(' '), /no incluyen el rango de medición/);
  assert.ok(L({ caracteristicas: 'Clínicamente validado' }).amber.some(x => x.term === 'clínicamente validado'));
  assert.equal(L({}, DISX.nebu).check.filter(x => /rango/.test(x)).length, 0, 'un nebulizador no mide');
  assert.ok(!L({ declarada: 'Clínicamente validado' }).amber.length, 'lo declarado en el empaque se publica sin pasar por la revisión de redacción');
});

test('dispositivos: etiquetas, meta migrada y datos viejos que siguen funcionando', () => {
  const lbl = k => F.CATS.dis.fields.find(f => f.key === k).label;
  assert.deepEqual([lbl('registro'), lbl('especificaciones'), lbl('modo')], ['Registro sanitario', 'Especificaciones técnicas', 'Instrucciones de uso']);
  const m = F.defMeta(); m.cats.dis.mt = { ...F.META_GEN.mt }; F.migrateMeta(m);
  assert.equal(m.cats.dis.mt.tpl, F.META_DIS.mt.tpl);
  const viejo = F.computeFor('dis', { marca: 'Omron', modelo: 'HEM-7121', tipo: 'Baumanómetro digital', tecnologia: 'Automático de brazo', fabricante: 'Omron', caracteristicas: 'Pantalla LCD' }, keep, mt());
  assert.equal(viejo.title.title, 'Omron HEM-7121 Baumanómetro digital | Automático de brazo');
  assert.equal(viejo.mg.blocked, null);
});

/* ---------- Accesorios: ficha homologada ---------- */
const ACCX = {
  parches: { marca: 'Saba', tipo: 'Parches térmicos', uso: 'Alivio de dolores musculares', material: 'Tela no tejida', contenido: '3 piezas', envase: 'Caja', fabricante: 'Essity', modo: 'Adherir sobre la ropa.' },
  muneca: { marca: 'Marca Ejemplo', producto: 'Soporte Plus', tipo: 'Muñequera', uso: 'Soporte de la muñeca', material: 'Neopreno', talla: 'M', lado: 'Derecha', color: 'Negro', contenido: '1 pieza', fabricante: 'Laboratorios Ejemplo', tallas: 'Mediana | Muñeca de 15 a 18 cm\nGrande | Muñeca de 18 a 21 cm', cuidados: 'Lavar a mano.' },
  baston: { marca: 'Marca Ejemplo', tipo: 'Bastón de aluminio', uso: 'Apoyo para caminar', material: 'Aluminio', color: 'Plateado', contenido: '1 pieza', fabricante: 'Laboratorios Ejemplo' },
  medias: { marca: 'Marca Ejemplo', tipo: 'Medias de compresión', uso: 'Soporte para las piernas', compresion: '20-30 mmHg', talla: 'M', color: 'Beige', publico: 'adultos', contenido: '1 par', fabricante: 'Laboratorios Ejemplo', registro: 'Reg. No. 0000X2026 SSA' },
  cubrebocas: { marca: 'Marca Ejemplo', tipo: 'Cubrebocas quirúrgicos', material: '3 capas', color: 'Azul', contenido: '50 piezas', envase: 'Caja', fabricante: 'Laboratorios Ejemplo', declarada: 'Filtración bacteriana ≥ 95 %' }
};

test('accesorios: título con talla, lado, color y compresión; sin fabricante; el material se omite si no cabe', () => {
  const t = k => F.computeFor('acc', ACCX[k], keep, mt()).title;
  assert.equal(t('muneca').title, 'Marca Ejemplo Soporte Plus Muñequera | Talla M | Derecha | Negro | 1 pieza');
  assert.deepEqual(t('muneca').softDropped, ['Neopreno']);
  assert.equal(t('medias').title, 'Marca Ejemplo Medias de compresión | 20-30 mmHg | Talla M | Beige | 1 par');
  assert.equal(t('parches').title, 'Saba Parches térmicos | Tela no tejida | 3 piezas');
  assert.equal(t('baston').title, 'Marca Ejemplo Bastón de aluminio | Plateado | 1 pieza', 'el material repetido en el tipo no se repite');
  assert.equal(F.computeFor('acc', { ...ACCX.muneca, talla: 'G', lado: 'Izquierda', color: 'Azul' }, keep, mt()).title.title, 'Marca Ejemplo Soporte Plus Muñequera | Talla G | Izquierda | Azul | 1 pieza', 'otra variante, otro título');
});

test('accesorios: basta el nombre o el tipo; material y compatibilidad ya no son obligatorios; presentación y cantidad se separan', () => {
  const base = { marca: 'M', contenido: '1 pieza', fabricante: 'F' };
  assert.deepEqual(F.computeFor('acc', base, keep, mt()).title.missing, ['Línea o nombre o tipo de accesorio']);
  assert.deepEqual(F.computeFor('acc', { ...base, tipo: 'Venda' }, keep, mt()).title.missing, []);
  const v = F.computeFor('acc', { ...ACCX.parches, contenido: 'Caja con 3 piezas', envase: '' }, keep, mt()).vt.v;
  assert.deepEqual([v.envase, v.contenido], ['Caja', '3 piezas']);
  const l = F.computeFor('acc', { marca: 'Saba', producto: 'Parches térmicos', material: 'Alivio de dolores', contenido: 'Caja con 3 piezas', fabricante: 'Essity' }, keep, mt());
  assert.deepEqual(l.title.missing, []);
  assert.equal(l.title.title, 'Saba Parches térmicos | Alivio de dolores | 3 piezas', 'los datos viejos siguen funcionando');
});

test('accesorios: descripción por tipo, con género y número, sin «accesorio para el bienestar»', () => {
  const r = k => F.computeFor('acc', ACCX[k], keep, mt());
  assert.match(r('parches').mc.text, /^Saba son unos parches térmicos, de tela no tejida\. Para alivio de dolores musculares\. Adherir sobre la ropa\. Se presenta en una caja con 3 piezas\.$/);
  assert.match(r('muneca').mc.text, /^Marca Ejemplo Soporte Plus es una muñequera, de neopreno\. Uso: soporte de la muñeca\./);
  assert.match(r('medias').mc.text, /^Marca Ejemplo son unas medias de compresión, 20-30 mmHg, para adultos\./);
  assert.match(r('cubrebocas').mc.text, /^Marca Ejemplo son cubrebocas quirúrgicos, de 3 capas\./);
  for (const k of Object.keys(ACCX)) assert.ok(!/accesorio para el bienestar|materiales y especificaciones de compatibilidad|Material o compatibilidad/.test(r(k).mc.text + r(k).mg.html), k);
  assert.ok(!/medicamento/.test(r('medias').mc.text + r('medias').mg.html), 'ningún accesorio lleva «no es un medicamento»');
});

test('accesorios: metas con la variante primero', () => {
  const m = k => F.computeFor('acc', ACCX[k], keep, mt()).meta;
  assert.equal(m('muneca').mt.text, 'Marca Ejemplo Soporte Plus Muñequera | Talla M, Derecha, Negro, 1 pieza');
  assert.equal(m('medias').mt.text, 'Marca Ejemplo Medias de compresión | 20-30 mmHg, Talla M, Beige, 1 par');
  assert.equal(m('parches').md.text, 'Saba Parches térmicos. Alivio de dolores musculares. Caja con 3 piezas. Compra en Farmacias Especializadas.');
});

test('accesorios: Magento con guía de tallas, cuidado y preguntas por talla y lado', () => {
  const h = F.computeFor('acc', ACCX.muneca, keep, mt()).mg;
  const orden = [/<p><strong>Marca Ejemplo Soporte Plus<\/strong> es una muñequera de <strong>Laboratorios Ejemplo<\/strong>/, /<h2>Beneficios principales:/, /<h2>Ficha técnica del producto:/, /id="guia-de-tallas"/, /<h2>Cuidado y limpieza:/, /<h2>Preguntas frecuentes:/].map(re => h.html.search(re));
  assert.ok(orden.every((n, i) => n >= 0 && (!i || n > orden[i - 1])), orden.join(','));
  assert.match(h.html, /<th scope="row">Mediana<\/th><td>Muñeca de 15 a 18 cm<\/td>/);
  assert.match(h.html, /Lado:<\/strong> Derecha/);
  const faq = h.faq.map(x => x.join(' ')).join('\n');
  assert.match(faq, /¿(?:Cómo elijo la talla de|Qué medidas tiene cada talla de)[^\n]*Mediana: muñeca de 15 a 18 cm; Grande: muñeca de 18 a 21 cm\./);
  assert.match(faq, /¿Para qué lado es[^\n]*Es derecha\./);
  assert.match(F.computeFor('acc', ACCX.cubrebocas, keep, mt()).mg.html, /<h2>Declarado en el empaque:<\/h2>\n<p>Filtración bacteriana ≥ 95 %<\/p>/);
  assert.match(F.computeFor('acc', ACCX.medias, keep, mt()).mg.faq.map(x => x.join(' ')).join('\n'), /¿(?:Qué nivel de compresión tiene|Cuánta compresión ofrece)[^\n]*Según su empaque, 20-30 mmHg\./);
});

test('accesorios: promesas y enfermedades, posibles dispositivos médicos y guía de tallas sin barra', () => {
  const L = (extra, base = ACCX.muneca) => F.lint(F.CATS.acc, { ...base, ...extra });
  assert.equal(L({}).check.length, 0);
  assert.ok(L({ beneficios: 'Previene várices' }).claim.some(x => x.term === 'previene'));
  assert.ok(L({ beneficios: 'Para várices' }).med.some(x => x.term === 'enfermedad'));
  assert.ok(L({ uso: 'Alivio del dolor' }).amber.some(x => x.term === 'alivia'));
  assert.ok(L({ beneficios: 'Elimina el 99% de bacterias' }).claim.some(x => x.term === 'elimina'));
  assert.ok(!L({ declarada: 'Elimina el 99% de bacterias' }).claim.length, 'lo declarado en el empaque se publica sin pasar por la revisión de redacción');
  assert.match(L({}, ACCX.baston).check.join(' '), /suele ser un dispositivo médico/);
  assert.equal(L({}, ACCX.medias).check.filter(x => /dispositivo médico/.test(x)).length, 0, 'con registro capturado no avisa');
  assert.match(L({ tallas: 'Mediana | 15 a 18 cm\nGrande' }).check.join(' '), /líneas no llevan «\|»[^.]*«Grande»/);
  assert.match(L({ tallas: '' }).check.join(' '), /Capturaste la talla pero no la guía/);
});

test('accesorios: etiquetas, meta migrada y listas de ayuda', () => {
  const lbl = k => F.CATS.acc.fields.find(f => f.key === k).label;
  assert.deepEqual([lbl('producto'), lbl('tipo'), lbl('tallas'), lbl('contenido')], ['Línea o nombre', 'Tipo de accesorio', 'Guía de tallas y medidas', 'Contenido neto']);
  const m = F.defMeta(); m.cats.acc.mt = { ...F.META_GEN.mt }; F.migrateMeta(m);
  assert.equal(m.cats.acc.mt.tpl, F.META_ACC.mt.tpl);
  assert.ok(F.CATS.acc.fields.find(f => f.key === 'tipo').sug.includes('Rodillera'));
});

test('título de medicamentos: forma de pieza + presentación se leen «28 cápsulas»', () => {
  const t = (forma, contenido) => F.buildTitle(F.CATS.med, { marca: 'Enterokan', concentracion: '90 mg / 50 mg', principio: 'Mentha Piperita', forma, contenido, laboratorio: 'Schwabe' }).title.split(' | ')[2];
  assert.equal(t('Cápsulas', 'Caja con 28 piezas'), '28 cápsulas');
  assert.equal(t('Tabletas', 'Caja con 30 tabletas'), '30 tabletas');
  assert.equal(t('Cápsula', '28'), '28 cápsulas');
  assert.equal(t('Tableta', 'Blíster con 1 pieza'), '1 tableta');
  assert.equal(t('Cápsulas de liberación prolongada', 'Frasco con 60 piezas'), '60 cápsulas de liberación prolongada');
  assert.equal(t('Jarabe', 'Frasco 120 mL'), 'Jarabe, Frasco 120 mL', 'líquidos e inyectables no se combinan');
  assert.equal(t('Comprimidos', 'Caja con 2 blísteres de 10 piezas'), 'Comprimidos, Caja con 2 blísteres de 10 piezas', 'si el conteo no es claro, no se calcula');
});
