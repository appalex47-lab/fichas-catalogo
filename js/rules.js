/*
 * Fichas de catálogo: documento de reglas de construcción para Asuntos Regulatorios.
 * Se genera con el mismo código que valida las fichas: las estructuras, listas de términos, leyendas y ejemplos
 * se leen de logic.js y ai.js, así que el documento no puede quedar desactualizado.
 * Devuelve un HTML independiente (sirve para verlo, imprimirlo como PDF o abrirlo en Word).
 * Funciona en el navegador (window.FichasRules) y en Node (require).
 */
(function (root) {
'use strict';
const isNode = typeof module !== 'undefined' && module.exports;
const F0 = isNode ? require('./logic.js') : root.Fichas;
const AI0 = isNode ? require('./ai.js') : root.FichasAI;

const RULES_VERSION = '1.0';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/* Origen de cada regla y qué hace la herramienta con ella */
const SRC = {
  pTit: 'Prompt aprobado de títulos',
  pMc: 'Prompt aprobado de Merchant Center',
  pMg: 'Prompt aprobado de descripciones de Magento',
  seo: 'Estructura de la agencia de SEO',
  batch: 'Formato de carga de Magento (Batch)',
  nom: 'NOM-141-SSA1/SCFI-2012',
  herr: 'Criterio de la herramienta',
  reg: 'Por completar por Regulatorio'
};
const ENF = {
  bloquea: ['Bloquea', 'b-bloquea'],
  avisa: ['Avisa', 'b-avisa'],
  corrige: ['Corrige', 'b-corrige'],
  doc: ['Documenta', 'b-doc']
};
const badge = k => `<span class="badge ${ENF[k][1]}">${ENF[k][0]}</span>`;
const src = (...k) => k.map(x => SRC[x]).join('; ');

const SEP_NAMES = { ' | ': 'barra vertical ( | )', ' - ': 'guion ( - )', '. ': 'punto ( . )', ', ': 'coma ( , )', ' ': 'espacio' };
const LEG = { med: ['medMc', 'medReceta', 'medConservacion', 'medAviso'], dis: ['disMc'], cos: ['cosMc'], sup: ['supResp', 'supConservacion'], hig: ['higMc'], beb: [], acc: [] };
const LEG_LABEL = {
  medMc: 'Merchant Center: leyenda de uso y dosis',
  medReceta: 'Magento: frase de venta con receta (solo si se declara receta)',
  medConservacion: 'Magento: condiciones de conservación',
  medAviso: 'Magento: aviso legal y de seguridad (lista)',
  disMc: 'Merchant Center: uso conforme al instructivo',
  cosMc: 'Merchant Center: uso conforme a las indicaciones',
  higMc: 'Merchant Center: uso conforme a las indicaciones',
  supResp: 'Merchant Center y Magento: responsabilidad y aclaración de que no es medicamento',
  supConservacion: 'Magento: condiciones de conservación'
};
/* Datos ficticios, solo para ilustrar. */
const EXAMPLES = {
  med: { marca: 'Marca Ejemplo', concentracion: '10 mg', principio: 'Principio Ejemplo', forma: 'Tableta', contenido: 'Caja con 28 tabletas', laboratorio: 'Laboratorio Ejemplo', via: 'Oral', receta: 'si' },
  dis: { marca: 'Marca Ejemplo', modelo: 'MOD-100', tipo: 'Baumanómetro digital', tecnologia: 'Automático de brazo', fabricante: 'Fabricante Ejemplo' },
  cos: { marca: 'Marca Ejemplo', producto: 'Crema Hidratante', tipo: 'Crema', atributo: 'Ceramidas', contenido: 'Frasco 454 g', fabricante: 'Fabricante Ejemplo' },
  sup: { marca: 'Marca Ejemplo', componente: 'Vitamina C', forma: 'Cápsulas', contenido: 'Frasco con 100 piezas', fabricante: 'Fabricante Ejemplo' },
  beb: { marca: 'Marca Ejemplo', tipo: 'Suero oral', sabor: 'Coco', atributo: 'Sin azúcar', contenido: '625 mL' },
  hig: { marca: 'Marca Ejemplo', producto: 'Pasta dental', variante: 'Salud bucal completa', contenido: 'Crema 150 mL', fabricante: 'Fabricante Ejemplo' },
  acc: { marca: 'Marca Ejemplo', producto: 'Parches térmicos', material: 'Alivio de dolores', contenido: 'Caja con 3 piezas', fabricante: 'Fabricante Ejemplo' }
};

function buildRulesDoc(opts) {
  opts = opts || {};
  const F = opts.F || F0, AI = opts.AI || AI0;
  const now = opts.now || new Date();
  const keep = new Set((opts.keep ? [...opts.keep] : ['gnc', 'omron', 'gsk']).map(x => String(x).toLowerCase()));
  const metaCfg = opts.metaCfg || F.defMeta();
  const cats = Object.keys(F.CATS);
  const labelOf = k => { for (const id of cats) { const f = F.CATS[id].fields.find(x => x.key === k); if (f) return f.label; } return k; };

  const table = (head, rows, cls) => `<table${cls ? ` class="${cls}"` : ''}><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const ul = items => `<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
  const pre = t => `<pre>${esc(t)}</pre>`;

  /* ---- 1. Principios ---- */
  const principios = [
    ['No se inventa ni se infiere ningún dato. Si un dato no viene en la entrada, se omite de la ficha y se reporta como faltante.', src('pTit', 'pMc', 'pMg'), 'avisa', 'Los datos vitales de cada categoría además bloquean la descripción de Magento (sección 4).'],
    ['Las descripciones son factuales: dicen qué es el producto y qué contiene, sin beneficios, promesas de resultado ni adjetivos vacíos.', src('pMc', 'pMg'), 'avisa', 'Semáforo de claims (sección 3).'],
    ['La herramienta no reescribe los textos aprobados. Solo coloca los datos del producto dentro de las plantillas de la sección 4.', src('herr'), 'doc', ''],
    ['Sin mayúsculas sostenidas, salvo siglas y marcas configuradas (' + [...keep].map(x => x.toUpperCase()).join(', ') + ').', src('pTit', 'pMg'), 'corrige', ''],
    ['Unidades con un espacio entre número y unidad y en formato estándar. Las unidades no se convierten: se respeta la que trae el dato.', src('pTit', 'pMc', 'pMg'), 'corrige', ''],
    ['Las abreviaturas de presentación se expanden.', src('pMg'), 'corrige', ''],
    ['No se duplica información: el tipo que ya está en el nombre del producto, o la marca al inicio del nombre, no se repite.', src('pTit', 'pMg'), 'corrige', 'En Magento se conservan las dos filas de la lista aprobada.'],
    ['No se prescriben dosis personalizadas ni se sugieren sustituciones de medicamentos. Las frases de dosis y uso son las leyendas fijas de la sección 4.', src('pMc'), 'doc', ''],
    ['En medicamentos es obligatorio declarar si el producto requiere receta médica. Sin ese dato no se genera el HTML de Magento.', src('pMg'), 'bloquea', 'La fila no se exporta.'],
    ['Todo dato generado por IA se verifica contra el texto original o queda marcado para confirmación humana. No se exporta a Magento hasta que una persona lo confirme.', src('herr'), 'bloquea', 'Ver sección 8.'],
    ['El título para Merchant Center no debe superar 150 caracteres.', src('herr') + ' (límite de Google Merchant Center)', 'avisa', ''],
    ['Las meta etiquetas siguen la estructura de la agencia de SEO. Las categorías cuya estructura no esté confirmada no exportan metas.', src('seo'), 'bloquea', 'Las columnas de meta salen vacías (sección 5).']
  ];
  const s1 = `<h2 id="s1">1. Principios generales</h2>` + table(['#', 'Regla', 'Origen', 'La herramienta', 'Detalle'], principios.map((r, i) => [String(i + 1), esc(r[0]), esc(r[1]), badge(r[2]), esc(r[3])]));

  /* ---- 2. Formato (ejemplos calculados con el código) ---- */
  const sample = { marca: 'CeraVe', producto: 'Crema Hidratante', tipo: 'Crema', atributo: 'Ceramidas', contenido: '454 g', fabricante: "L'Oréal" };
  const dedupTitle = F.computeFor('cos', sample, keep, F.defMeta()).title.title;
  const dedupIn = `Nombre: «${sample.producto}»; Tipo: «${sample.tipo}»`;
  const ejemplos = [
    ['Espacio entre número y unidad', '500mg, 10ML, 5GR', F.normUnits('500mg, 10ML, 5GR', 'mL')],
    ['mL en título y Merchant Center', '10ML', F.normUnits('10ML', 'mL')],
    ['ml en minúscula en Magento', '10ML', F.normUnits('10ML', 'ml')],
    ['Unidad que no se convierte', '150 UG', F.normUnits('150 UG', 'mL')],
    ['Abreviatura de presentación', 'CAJ C/30 TAB', F.expandPres('CAJ C/30 TAB')],
    ['Solo cantidad', 'C/30', F.expandPres('C/30')],
    ['Mayúsculas sostenidas', 'LABORATORIOS SANFER', F.fixCaps('LABORATORIOS SANFER', keep, 'title')],
    ['Tipo repetido en el nombre', dedupIn, dedupTitle.split(' | ')[0]]
  ];
  const s2 = `<h2 id="s2">2. Reglas de escritura y formato</h2><p class="muted">Los resultados se calculan con el código de la herramienta al generar este documento.</p>` + table(['Regla', 'Entrada', 'Resultado'], ejemplos.map(r => [esc(r[0]), esc(r[1]), `<code>${esc(r[2])}</code>`]));

  /* ---- 3. Semáforo de claims ---- */
  const nm = (arr, kind) => arr.filter(x => !kind || x[2] === kind).map(x => x[1]);
  const list = a => a.map(x => `<code>${esc(x)}</code>`).join(' ');
  const s3 = `<h2 id="s3">3. Semáforo de claims y lenguaje</h2>
    <p>La herramienta busca estos términos en los datos que se capturan. <strong>Avisa; no reescribe ni bloquea el texto.</strong> La exportación puede excluir las filas con avisos si se activa esa opción. La búsqueda es por coincidencia de palabra y puede dar falsos positivos, por eso cada aviso se revisa a mano. Los textos tomados del empaque (ingredientes, modo de uso y precauciones) no pasan por esta revisión.</p>`
    + table(['Nivel', 'Términos', 'Origen', 'La herramienta'], [
      ['<span class="dot d-rojo"></span> Rojo: claims prohibidos', list(nm(F.RED, 'claim')), esc(src('pMc', 'pMg')), badge('avisa')],
      ['<span class="dot d-amarillo"></span> Amarillo: lenguaje subjetivo o superlativo', list(nm(F.RED, 'vacio')), esc(src('pTit', 'pMg')), badge('avisa')],
      ['<span class="dot d-amarillo"></span> Amarillo: requiere validación explícita en la ficha', list(nm(F.AMBER)), esc(src('pMc')), badge('avisa')],
      ['<span class="dot d-rojo"></span> Cosméticos: promesas absolutas de protección', list(nm(F.COS_CLAIM)), esc(src('nom')), badge('avisa')],
      ['<span class="dot d-amarillo"></span> Cosméticos: acciones propias de medicamentos', list(nm(F.COS_MED)), esc(src('nom')), badge('avisa')]
    ]);

  /* ---- 4. Categorías ---- */
  const usage = catId => {
    const c = F.CATS[catId], full = {};
    c.fields.forEach(f => { full[f.key] = f.type === 'select' ? ((f.opts.find(o => o[0]) || [])[0] || '') : `[${f.label}]`; });
    const sig = r => ({ t: r.title.title, m: r.mc.text, g: r.mg.html, x: r.meta.mt.text + '|' + r.meta.md.text, a: r.meta.alt.text });
    const baseR = F.computeFor(catId, full, new Set(), metaCfg), b = sig(baseR), out = {};
    c.fields.forEach(f => {
      const v = { ...full }; v[f.key] = '';
      const r = sig(F.computeFor(catId, v, new Set(), metaCfg));
      out[f.key] = [r.t !== b.t && 'Título', r.m !== b.m && 'Merchant Center', r.g !== b.g && 'Magento', r.x !== b.x && 'Meta', r.a !== b.a && 'Alt'].filter(Boolean);
    });
    return { out, base: baseR };
  };
  const catSection = (catId, n) => {
    const c = F.CATS[catId], { out, base } = usage(catId), ex = F.computeFor(catId, EXAMPLES[catId], keep, metaCfg);
    const blocks = [];
    if (catId === 'med') blocks.push('Declarar si requiere receta médica');
    (c.vital || []).forEach(k => blocks.push(labelOf(k)));
    const fieldRows = c.fields.map(f => {
      const anyOf = c.title.some(s => s.anyOf && s.anyOf.includes(f.key));
      const req = f.req ? 'Sí' : anyOf ? 'Uno de los dos' : 'No';
      const bl = (catId === 'med' && f.key === 'receta') || (c.vital || []).includes(f.key);
      return [esc(f.label), req, esc(out[f.key].join(', ') || 'Sin uso'), bl ? badge('bloquea') : ''];
    });
    const legends = LEG[catId].map(k => {
      const t = F.LEGEND[k];
      return [esc(LEG_LABEL[k]), esc(Array.isArray(t) ? t.join(' | ') : t)];
    });
    const mt = (metaCfg.cats && metaCfg.cats[catId]) || F.defMetaCat(catId);
    const metaTxt = k => `${mt[k].tpl.split('\n').map(l => esc(l)).join('<br>')}<br><span class="muted">Separador: ${esc(SEP_NAMES[mt[k].sep] || JSON.stringify(mt[k].sep))}. Límite: ${mt[k].max || 'sin límite'}.</span>`;
    return `<section class="cat" id="cat-${catId}"><h3>4.${n} ${esc(c.name)}</h3>
      <p><strong>Fundamento normativo:</strong> ${catId === 'cos' ? esc(src('nom')) + ' (etiquetado de cosméticos). Numerales por confirmar por Regulatorio.' : `<span class="pend">${esc(SRC.reg)}</span>`}</p>
      <h4>Campos</h4>${table(['Campo', 'Requerido', 'Dónde se usa', 'Bloquea Magento si falta'], fieldRows)}
      ${blocks.length ? `<p><strong>Datos que bloquean la descripción de Magento:</strong> ${esc(blocks.join('; '))}.</p>` : '<p><strong>Datos que bloquean la descripción de Magento:</strong> ninguno.</p>'}
      ${c.range ? `<p><strong>Longitud de la descripción de Merchant Center:</strong> ${c.range[0]} a ${c.range[1]} palabras (informativo; no se rellena con texto de más).</p>` : ''}
      <h4>Plantilla del título</h4>${pre(base.title.title)}
      <h4>Plantilla de la descripción de Merchant Center</h4>${pre(base.mc.text)}
      <h4>Plantilla del HTML de Magento</h4>${catId === 'med' ? '<p class="muted">Se muestra con la receta declarada. Sin receta, la frase de venta con receta se omite.</p>' : ''}${pre(base.mg.html)}
      <h4>Frases y bloques fijos</h4>${legends.length ? table(['Dónde', 'Texto'], legends) : '<p class="muted">Sin leyendas fijas en esta categoría.</p>'}
      <h4>Meta etiquetas y alt</h4>${table(['Elemento', 'Estructura (un bloque por línea)'], [['Meta title', metaTxt('mt')], ['Meta description', metaTxt('md')], ['Alt de la imagen', metaTxt('alt')]])}
      <p>Estado de la estructura de meta: <strong>${mt.confirmed ? 'Confirmada' : 'Provisional, sin confirmar'}</strong>.</p>
      <h4>Ejemplo con datos ficticios</h4><p class="muted">Ejemplo ilustrativo. No es un producto real.</p>${table(['Elemento', 'Resultado'], [
        ['Título', `<code>${esc(ex.title.title)}</code>`], ['Meta title', esc(ex.meta.mt.text || '(vacío)')], ['Meta description', esc(ex.meta.md.text || '(vacío)')], ['Alt', esc(ex.meta.alt.text)]])}
    </section>`;
  };
  const s4 = `<h2 id="s4">4. Estructura por categoría</h2><p>Cada plantilla se genera con el código real, poniendo el nombre del campo entre corchetes donde va el dato del producto. Lo que no está entre corchetes es texto fijo de la plantilla aprobada.</p>` + cats.map((id, i) => catSection(id, i + 1)).join('');

  /* ---- 5. Metas y alt ---- */
  const s5 = `<h2 id="s5">5. Meta etiquetas y alt de la imagen</h2>
    ${ul([
      `Las metas de medicamentos siguen la estructura de la agencia de SEO, tomada del archivo de carga de referencia. Las demás categorías son <strong>provisionales</strong> hasta que se confirmen. ${badge('bloquea')} Sin confirmar, las columnas <code>meta_title</code>, <code>meta_description</code> y <code>short_description</code> salen vacías.`,
      `<code>short_description</code> lleva el mismo texto que la meta description, como en el archivo de referencia.`,
      `El alt se construye con marca, concentración o modelo, principio activo o tipo, y presentación. Máximo ${metaCfg.cats && metaCfg.cats.med ? metaCfg.cats.med.alt.max : 125} caracteres, sin empezar con «imagen de» o «foto de», y con la misma revisión de claims. ${badge('avisa')}`,
      `Las metas de medicamentos con receta declarada agregan «con receta médica». Los términos comerciales de la estructura de la agencia no se marcan cuando la estructura está confirmada.`
    ])}`;

  /* ---- 6. Cosméticos ---- */
  const nivelRows = ['6', '10', '15', '30', '50', '50+'].map(x => [esc(x), esc(F.nivelPorFps(x).nivel)]);
  const s6 = `<h2 id="s6">6. Requisitos adicionales de cosméticos y dermocosméticos</h2>
    <p>Fuente: ${esc(SRC.nom)}. Regulatorio debe confirmar los numerales aplicables.</p>
    ${ul([
      `Secciones opcionales del HTML de Magento, tomadas tal cual del empaque: <strong>Ingredientes</strong> (lista INCI), <strong>Modo de uso</strong>, <strong>Precauciones</strong> y <strong>Protección solar</strong> (FPS y nivel). Se agregan después del texto y la lista aprobados, sin modificarlos, y solo si tienen datos. ${badge('doc')}`,
      `Protectores solares: el nivel de protección debe coincidir con la tabla de abajo según el FPS; un FPS menor a 6 se señala; y se avisa si falta el modo de uso o las precauciones. ${badge('avisa')}`,
      `Se avisa de promesas absolutas de protección y de acciones propias de medicamentos (sección 3). ${badge('avisa')}`
    ])}
    <h4>Tabla de niveles usada</h4>${table(['FPS', 'Nivel'], nivelRows, 'narrow')}`;

  /* ---- 7. Exportación ---- */
  const s7 = `<h2 id="s7">7. Exportación a Magento</h2>
    <p>Se genera un CSV con las <strong>${F.MAG_HEADER.length}</strong> columnas del formato Batch, en el mismo orden del archivo de referencia. Llena: <code>sku</code>, <code>description</code>, <code>short_description</code>, <code>meta_title</code>, <code>meta_description</code>, <code>additional_attributes</code> (<code>categoria_prod=título</code>), <code>base_image_label</code> (alt) y, si se captura, <code>base_image</code>. Con valor 1: ${F.MAG_ONES.map(x => `<code>${x}</code>`).join(', ')}. El resto va vacío, incluida <code>name</code> y <code>meta_keywords</code>.</p>
    ${table(['No se exporta la fila si…', 'La herramienta'], [
      ['No tiene SKU', badge('bloquea')],
      ['La descripción de Magento está bloqueada (falta un dato vital o la receta)', badge('bloquea')],
      ['Tiene datos de IA sin confirmar (sugeridos o leídos de fotos), salvo que se active incluirlos', badge('bloquea')],
      ['Tiene datos faltantes en el título, salvo que se active incluirlas', badge('bloquea')],
      ['Tiene avisos de lenguaje, solo si se activa excluirlas', badge('avisa')],
      ['Su SKU está repetido: se exporta una sola vez, el último', badge('corrige')]
    ])}
    <p class="muted">Windows-1252 por defecto (como el archivo de referencia) o UTF-8. Conviene probar con 2 o 3 SKU antes de una carga grande.</p>`;

  /* ---- 8. IA ---- */
  const labs = arr => arr.map(k => esc(labelOf(k))).join(', ');
  const s8 = `<h2 id="s8">8. Uso de inteligencia artificial</h2>
    <p>La IA es opcional. Todo lo que propone se verifica o se marca para revisión. Los datos que se envían al proveedor son el texto crudo del producto, las fotos del empaque (reducidas en el navegador y sin guardarse) y, en el asistente, la pregunta y un resumen de la pantalla sin valores de productos. <span class="pend">La política de datos del proveedor debe revisarla TI o Legal.</span></p>
    ${AI ? table(['Función', 'Qué puede hacer', 'Qué no puede hacer', 'Verificación y estado'], [
      ['Completar datos crudos', `Extraer del texto: ${labs(AI.AI_EXTRACT)}.`, 'Concentración, volumen, forma, presentación, vía y receta: los procesan reglas de código.', 'Cada dato debe aparecer literalmente en el texto; si no, se descarta.'],
      ['Sugerencias', `Sugerir, aunque no estén en el texto: ${labs(AI.AI_SUGGEST)}.`, 'Nunca principio activo, receta ni concentración.', 'Se aplican solo si la persona las acepta. Quedan como «IA sin confirmar» y no se exportan hasta confirmarlas.'],
      ['Fotos del empaque', `Leer: ${labs(AI.IMG_FIELDS)}.`, 'Nunca indicar si requiere receta. No completar ni adivinar lo ilegible.', 'Se compara con la transcripción; ingredientes, modo de uso y precauciones deben ser copia literal. La persona revisa con la foto, y lo aplicado queda sin confirmar hasta confirmarlo en el lote.'],
      ['Asistente de uso', 'Explicar la herramienta y los avisos.', 'No da asesoría regulatoria ni cambia textos. Sus acciones son de una lista cerrada.', 'Lo que depende de la pantalla se responde con los datos de la herramienta, sin IA.']
    ]) : '<p class="muted">Módulo de IA no disponible al generar este documento.</p>'}`;

  /* ---- 9. Pendientes ---- */
  const s9 = `<h2 id="s9">9. Pendientes por completar por Regulatorio</h2>${ul([
    'Fundamento normativo de cada categoría, salvo cosméticos (NOM-141-SSA1/SCFI-2012, con numerales por confirmar).',
    'Confirmación de los textos y frases fijas de las plantillas de la sección 4.',
    'Confirmación de las listas de términos del semáforo de claims (sección 3).',
    'Estructura de meta etiquetas de las categorías que hoy son provisionales (sección 5).',
    'Política de datos del proveedor de IA (sección 8).'
  ])}`;

  const body = [s1, s2, s3, s4, s5, s6, s7, s8, s9].join('\n');
  const hash = hash32(body);
  const fecha = now.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  const toc = [['s1', 'Principios generales'], ['s2', 'Escritura y formato'], ['s3', 'Semáforo de claims'], ['s4', 'Estructura por categoría'], ['s5', 'Metas y alt'], ['s6', 'Cosméticos'], ['s7', 'Exportación a Magento'], ['s8', 'Uso de IA'], ['s9', 'Pendientes y firma']]
    .map(([id, t]) => `<a href="#${id}">${t}</a>`).join(' · ');

  const css = `
  @page{margin:16mm}
  *{box-sizing:border-box}
  body{margin:0;padding:24px;font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:13px;line-height:1.55;color:#14202B;background:#fff}
  main{max-width:920px;margin:0 auto}
  h1{font-size:22px;margin:0 0 4px}
  h2{font-size:17px;margin:28px 0 8px;padding-bottom:4px;border-bottom:2px solid #0E7A72}
  h3{font-size:15px;margin:22px 0 6px}
  h4{font-size:13px;margin:14px 0 4px;color:#0E7A72}
  p{margin:6px 0}
  .muted{color:#55636F}
  .pend{background:#F6EDDB;color:#7A5208;padding:1px 6px;border-radius:4px}
  .box{border:1px solid #B7C0C6;border-radius:8px;padding:10px 14px;margin:12px 0;background:#F2F4F5}
  .toc{font-size:12px;margin:10px 0}
  table{border-collapse:collapse;width:100%;margin:6px 0 10px;font-size:12px}
  th,td{border:1px solid #DCE1E4;padding:6px 8px;text-align:left;vertical-align:top}
  th{background:#F2F4F5;font-weight:600}
  table.narrow{width:auto;min-width:240px}
  code{font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:11.5px;background:#E1F1EF;border-radius:3px;padding:1px 4px;overflow-wrap:anywhere}
  pre{font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:11.5px;background:#F2F4F5;border:1px solid #DCE1E4;border-radius:6px;padding:8px 10px;white-space:pre-wrap;overflow-wrap:anywhere;margin:4px 0 8px}
  .badge{display:inline-block;padding:1px 7px;border-radius:4px;font-size:11px;font-weight:600;border:1px solid}
  .b-bloquea{background:#F8E7E5;color:#8F2A24;border-color:#8F2A24}
  .b-avisa{background:#F6EDDB;color:#7A5208;border-color:#7A5208}
  .b-corrige{background:#E1F1EF;color:#0B5E58;border-color:#0B5E58}
  .b-doc{background:#F2F4F5;color:#55636F;border-color:#55636F}
  .dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px}
  .d-rojo{background:#B0362E}.d-amarillo{background:#A8710E}
  .firma td{height:34px}
  section.cat{page-break-inside:auto}
  tr,pre{page-break-inside:avoid}
  a{color:#0E7A72}
  @media print{body{padding:0}.toc{display:none}}`;

  const head = `<h1>Reglas de construcción de fichas de producto</h1>
    <p class="muted">Documento para revisión de Asuntos Regulatorios. Generado automáticamente por la herramienta Fichas de catálogo.</p>
    ${table(['Fecha de generación', 'Versión de las reglas', 'Huella del contenido'], [[esc(fecha), esc(RULES_VERSION), `<code>${hash}</code>`]], 'narrow')}
    <div class="box"><strong>Alcance.</strong> Este documento describe cómo la herramienta construye y valida las fichas. No es asesoría legal y <strong>no está aprobado hasta que lo firme Regulatorio</strong>. Cada regla indica su origen y qué hace la herramienta con ella:
      <p>${badge('bloquea')} no genera el HTML de Magento o no exporta la fila. ${badge('avisa')} muestra un aviso; no cambia ni bloquea el texto. ${badge('corrige')} corrige el formato automáticamente. ${badge('doc')} está incorporada en las plantillas, pero la herramienta no la verifica.</p>
      <p>La huella cambia cuando cambia cualquier regla, plantilla, lista de términos o estructura de meta, así que permite comprobar que el documento firmado corresponde a la versión en uso.</p></div>
    <p class="toc">${toc}</p>`;
  const firma = `<h3>Revisión</h3>${table(['Nombre', 'Cargo', 'Fecha', 'Firma'], [['', '', '', ''], ['', '', '', '']], 'firma')}
    <p><strong>Comentarios de Regulatorio:</strong></p><div class="box" style="min-height:90px"></div>
    <p class="muted">Documento generado el ${esc(fecha)} · versión ${esc(RULES_VERSION)} · huella ${hash}.</p>`;

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Reglas de construcción de fichas de producto</title><style>${css}</style></head><body><main>${head}${body}${firma}</main></body></html>`;
  return { html, hash, version: RULES_VERSION, generated: fecha };
}

const api = { RULES_VERSION, buildRulesDoc, hash32 };
if (isNode) module.exports = api; else root.FichasRules = api;
})(typeof self !== 'undefined' ? self : this);
