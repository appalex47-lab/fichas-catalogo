/*
 * Fichas de catálogo: lógica pura (sin DOM).
 * Normalización, títulos, descripciones, metas, alt, CSV de Magento y extracción de datos crudos.
 * Funciona en el navegador (window.Fichas) y en Node (require).
 */
(function (root) {
'use strict';
const escT = s => String(s ?? '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
const lc  = s => (s && !/^[A-ZÁÉÍÓÚÑ]{2}/.test(s)) ? s.charAt(0).toLowerCase() + s.slice(1) : (s || '');
const join = (sep, ...a) => a.filter(Boolean).join(sep);
const sentence = s => { s = (s || '').trim(); if (!s) return ''; s = cap(s); return /[.!?]$/.test(s) ? s : s + '.'; };
const F = (key, label, o = {}) => ({ key, label, ...o });
const seg = (label, parts, fn, anyOf) => ({ label, parts, fn, anyOf });

/* ---------- Normalización ---------- */
const SMALL = new Set(['de','del','la','el','y','e','o','con','para','en','por','sin','a','al','los','las','un','una']);
const hasVowel = w => /[aeiouyáéíóúü]/i.test(w);
function fixCaps(t, keep, mode) {
  if (!/\p{L}/u.test(t) || t !== t.toUpperCase()) return t;
  return t.replace(/\p{L}+/gu, (w, off) => {
    const l = w.toLowerCase();
    if (keep.has(l)) return w.toUpperCase();
    if (/^(fps|spf|uva|uvb|uv|pao|inci)$/i.test(w)) return w.toUpperCase();
    if (/^ci$/i.test(w) && /^\s*\d/.test(t.slice(off + w.length))) return w.toUpperCase();
    if (/^(ug|ui|iu|mg|mcg|g|gr|grs|ml|kg|l|lt|cm|mm)$/i.test(w) && /\d\s*$/.test(t.slice(0, off))) return w;
    if (w.length <= 3 && !hasVowel(w)) return w;
    if (SMALL.has(l) && off > 0) return l;
    return mode === 'sentence' ? l : w.charAt(0) + l.slice(1);
  });
}
function sentenceCase(t, keep) {
  if (!/\p{L}/u.test(t) || t !== t.toUpperCase()) return t;
  return fixCaps(t, keep, 'sentence').replace(/(^|[.!?]\s+)(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
}
const UNIT_MAP = { mg:'mg', mcg:'mcg', 'µg':'mcg', ug:'mcg', g:'g', gr:'g', grs:'g', gm:'g', kg:'kg', ml:'ML', l:'L', lt:'L', lts:'L', ui:'UI', iu:'UI', cm:'cm', mm:'mm' };
function normUnits(t, style) {
  let s = t.replace(/(\d+(?:[.,]\d+)?)\s*(mg|mcg|µg|ug|kg|grs?|gm|g|ml|lts?|l|ui|iu|cm|mm)(?![\p{L}\d])/giu, (m, n, u) => {
    let c = /^(ug|µg)$/i.test(u) ? u : UNIT_MAP[u.toLowerCase()];
    if (c === 'ML') c = style === 'ml' ? 'ml' : 'mL';
    if (c === 'L')  c = style === 'ml' ? 'l' : 'L';
    if (/^\d+,\d{1,2}$/.test(n)) n = n.replace(',', '.');
    return n + ' ' + c;
  });
  return s.replace(/\b(mg|mcg|g|kg|mL|ml|L|l|UI)\s*\/\s*(\d)/g, '$1 / $2');
}
const SINGULAR_NOUN = { piezas: 'pieza', tabletas: 'tableta', 'cápsulas': 'cápsula', comprimidos: 'comprimido', ampolletas: 'ampolleta', grageas: 'gragea' };
const SINGULAR_ONE_RE = /(?<![\d.,])1\s+(piezas|tabletas|cápsulas|comprimidos|ampolletas|grageas)(?![\p{L}])/giu;
function expandPres(t) {
  let s = t;
  const rules = [
    [/\bCAJ(?:A)?\.?(?![\p{L}])/giu, 'Caja'],
    [/\bFCO\.?(?![\p{L}])/giu, 'Frasco'],
    [/\bTABS?\.?(?![\p{L}])/giu, 'tabletas'],
    [/\bCAPS?\.?(?![\p{L}])/giu, 'cápsulas'],
    [/\bCOMP\.?(?![\p{L}])/giu, 'comprimidos'],
    [/\bAMP\.?(?![\p{L}])/giu, 'ampolletas'],
    [/\bPZAS?\.?(?![\p{L}])/giu, 'piezas'],
    [/\bPZ\.?(?![\p{L}])/giu, 'piezas'],
    [/\bGRAG\.?(?![\p{L}])/giu, 'grageas'],
    [/\bSOL\.?(?![\p{L}])/giu, 'Solución'],
    [/\bINY\.?(?![\p{L}])/giu, 'inyectable'],
    [/\bSUSP\.?(?![\p{L}])/giu, 'Suspensión'],
    [/\bJBE\.?(?![\p{L}])/giu, 'Jarabe'],
    [/\bC\/\s*(\d+)/gi, 'con $1'],
    [/\bX\s*(\d+)/gi, 'con $1']
  ];
  rules.forEach(([re, to]) => { s = s.replace(re, to); });
  s = s.replace(/\bcon (\d+)\s*$/i, 'con $1 piezas');
  if (/^con\b/i.test(s)) s = 'Caja ' + s;
  // Regla de negocio: cuando el campo «Presentación o piezas» contiene
  // únicamente una cantidad, se interpreta como piezas. No se modifica
  // una presentación explícita como «Caja con 4 plumas» o «Frasco 30 mL».
  if (/^\d+(?:[.,]\d+)?$/.test(s.trim())) s = `${s.trim()} piezas`;
  // Concordancia: exactamente 1 va en singular («1 pieza», «1 tableta»).
  s = s.replace(SINGULAR_ONE_RE, (m, noun) => SINGULAR_NOUN[noun.toLowerCase()] ? `1 ${SINGULAR_NOUN[noun.toLowerCase()]}` : m);
  return cap(s.trim());
}
const COUNT_NOUN_RE = /(\d+)\s+(tabletas?|cápsulas?|capsulas?|piezas?|sobres?|comprimidos?|parches?|pastillas?|gomitas?|unidades|unidad|ampolletas?|plumas?|tiras|lancetas?|grageas?|sachets?|toallitas?|jeringas?|perlas?|softgels?|barras?|shots?|chicles?|porciones|viales?)(?![\p{L}])/giu;
const capNouns = s => s.replace(COUNT_NOUN_RE, (m, n, w) => `${n} ${w.toLowerCase()}`);
function joinForm(forma, contenido) {
  if (!forma) return contenido || '';
  if (!contenido) return forma;
  const base = forma.toLowerCase().replace(/s$/, '');
  if (contenido.toLowerCase().includes(base)) return contenido;
  return `${forma}, ${contenido}`;
}
const saborTxt = s => s && (/^sabor\b/i.test(s) ? s : 'Sabor ' + s);

/* ---------- Tabla nutrimental (suplementos) ----------
 * Se captura tal cual la etiqueta, una fila por línea: «Proteína | 20 g | 40 %». Si hay más de una columna se agrega una línea de
 * encabezados que empieza con #: «# Nutriente | Por porción | Por 100 g | % VD». Una fila que empieza con guion es una subfila
 * («- Azúcares | 2 g»). También se entiende una fila pegada sin barras («Proteína 20 g 40 %»). La herramienta solo ordena y limpia:
 * no calcula ni corrige cantidades. Solo avisa si las calorías no cuadran con proteína, carbohidratos y grasas. */
const NUTRI_UNIT = { g: 'g', mg: 'mg', mcg: 'mcg', 'µg': 'mcg', ug: 'mcg', kcal: 'kcal', cal: 'kcal', kj: 'kJ', ui: 'UI', iu: 'UI', ml: 'mL', l: 'L', '%': '%' };
const NUTRI_VAL_RE = /(?<![\p{L}\d.,])([<≤~]?\s*\d+(?:[.,]\d+)?)\s*(kcal|kj|mcg|µg|ug|mg|ui|iu|ml|cal|g|l|%)(?![\p{L}])/giu;
function nutriCell(x) {
  const m = String(x ?? '').trim().match(/^([<≤~]?)\s*(\d+(?:[.,]\d+)?)\s*([A-Za-zµ%]+)$/);
  const u = m && NUTRI_UNIT[m[3].toLowerCase()];
  return u ? `${m[1]}${m[2].replace(',', '.')} ${u}` : String(x ?? '').trim();
}
const nutriName = s => { s = s.trim(); return s && s === s.toUpperCase() && /\p{L}/u.test(s) ? cap(s.toLowerCase()) : s; };
function parseNutrition(text) {
  const out = { head: null, rows: [], problems: [], explicit: false };
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const body = [];
  lines.forEach(l => {
    if (l.startsWith('#') && !out.explicit && !body.length) { out.head = l.replace(/^#+\s*/, '').split(/\s*[|\t]\s*/).map(x => x.trim()); out.explicit = true; }
    else body.push(l);
  });
  body.forEach(l => {
    let sub = false;
    if (/^[-•–]\s*/.test(l)) { sub = true; l = l.replace(/^[-•–]\s*/, ''); }
    let name, cells;
    if (/[|\t]/.test(l)) { const p = l.split(/\s*[|\t]\s*/); name = p[0]; cells = p.slice(1).filter(x => x !== ''); }
    else {
      const hits = [...l.matchAll(NUTRI_VAL_RE)];
      name = hits.length ? l.slice(0, hits[0].index) : l;
      cells = hits.map(h => h[0]);
    }
    name = nutriName(name.replace(/[:\s]+$/, ''));
    if (!name) { out.problems.push(`Hay una fila sin nombre de nutriente: «${l}».`); return; }
    if (!cells.length) { out.problems.push(`La fila «${name}» no tiene cantidad.`); return; }
    out.rows.push({ name, sub, cells: cells.map(nutriCell) });
  });
  const cols = Math.max(0, ...out.rows.map(r => r.cells.length));
  if (!out.head) out.head = ['Nutriente', ...(cols <= 1 ? ['Cantidad'] : Array.from({ length: cols }, (_, i) => `Valor ${i + 1}`))];
  if (out.rows.length && cols > 1 && !out.explicit) out.problems.push('La tabla tiene más de una columna. Agrega una primera línea con los encabezados, por ejemplo «# Nutriente | Por porción | % VD».');
  if (out.explicit && out.head.length - 1 < cols) out.problems.push(`Los encabezados tienen ${out.head.length - 1} columna(s) de valores, pero hay filas con ${cols}.`);
  if (out.explicit && !out.rows.length) out.problems.push('Hay encabezados pero ninguna fila.');
  out.cols = Math.max(cols, out.head.length - 1);
  return out;
}
const NUTRI_FIND = {
  energia: /^(energ[ií]a|calor[ií]as|valor energ[eé]tico)/i,
  proteina: /^prote[ií]nas?\b/i,
  carbo: /^(carbohidratos?|hidratos de carbono)( total(?:es)?)?$/i,
  grasa: /^(grasas?|l[ií]pidos)( total(?:es)?)?$/i,
  azucar: /^az[uú]cares?( total(?:es)?)?$/i
};
const nutriNum = (cell, unit) => { const m = String(cell || '').match(/^(\d+(?:\.\d+)?) (\S+)$/); return m && m[2] === unit ? Number(m[1]) : null; };
/* Aviso (no corrección) si las calorías declaradas no se parecen a 4·proteína + 4·carbohidratos + 9·grasa. */
function nutriConsistency(p) {
  const find = re => p.rows.find(r => !r.sub && re.test(r.name));
  const e = find(NUTRI_FIND.energia), pr = find(NUTRI_FIND.proteina), ch = find(NUTRI_FIND.carbo), gr = find(NUTRI_FIND.grasa);
  if (!e || !pr || !ch || !gr) return [];
  const msgs = [];
  for (let j = 0; j < p.cols; j++) {
    const kcal = nutriNum(e.cells[j], 'kcal'), P = nutriNum(pr.cells[j], 'g'), C = nutriNum(ch.cells[j], 'g'), G = nutriNum(gr.cells[j], 'g');
    if ([kcal, P, C, G].some(x => x === null)) continue;
    const exp = 4 * P + 4 * C + 9 * G;
    if (Math.abs(kcal - exp) > Math.max(10, exp * 0.2)) msgs.push(`Tabla nutrimental, columna «${p.head[j + 1] || 'Valor ' + (j + 1)}»: declara ${kcal} kcal, pero proteína, carbohidratos y grasas suman cerca de ${Math.round(exp)} kcal (4-4-9). Verifica la etiqueta.`);
  }
  return msgs;
}
function nutriTableHtml(v) {
  const text = v.nutrimental;
  if (!text) return '';
  const p = parseNutrition(text);
  if (!p.rows.length) return '';
  const cap2 = ['Información nutrimental', [v.porcion && `porción: ${v.porcion}`, v.porciones && `porciones por envase: ${v.porciones}`].filter(Boolean).join('; ')].filter(Boolean);
  const caption = cap2.length > 1 ? `${cap2[0]} (${cap2[1]})` : cap2[0];
  const th = p.head.slice(0, p.cols + 1).map(h => `<th scope="col">${escT(h)}</th>`).join('');
  const rows = p.rows.map(r => `    <tr${r.sub ? ' class="sub"' : ''}><th scope="row">${escT(r.name)}</th>${Array.from({ length: p.cols }, (_, j) => `<td>${escT(r.cells[j] || '—')}</td>`).join('')}</tr>`).join('\n');
  return `<h2>Información nutrimental:</h2>\n<table id="tabla-nutrimental" class="tabla-nutrimental">\n  <caption>${escT(caption)}</caption>\n  <thead><tr>${th}</tr></thead>\n  <tbody>\n${rows}\n  </tbody>\n</table>`;
}
/* Dato de la primera columna de valores, para las preguntas frecuentes. */
function nutriFact(v, re) {
  if (!v.nutrimental) return null;
  const p = parseNutrition(v.nutrimental), r = p.rows.find(x => re.test(x.name));
  if (!r || !r.cells[0]) return null;
  const head = p.explicit && p.head[1] && !/^(cantidad|valor 1)$/i.test(p.head[1]) ? ` (${lc(p.head[1])})` : '';
  return { name: r.name, value: r.cells[0], head };
}

/* ---------- Plantillas de Magento ---------- */
const S = t => t ? `<strong>${escT(t)}</strong>` : '';
const liRows = pairs => pairs.filter(([, v]) => v).map(([l, v]) => `  <li><strong>${l}:</strong> ${escT(v)}</li>`).join('\n');
const assemble = (p, heading, pairs, extra = []) =>
  [`<p>${p.trim()}</p>`, `<h2>${heading}</h2>\n<ul>\n${liRows(pairs)}\n</ul>`, ...extra].join('\n<br />\n');

/* Frases y bloques fijos de las plantillas aprobadas. Una sola fuente: las plantillas y el documento de reglas los leen de aquí. */
const LEGEND = {
  medMc: 'Uso y dosis conforme a la prescripción médica y al instructivo del producto. Consulte a su médico y evite automedicarse.',
  medReceta: 'Su venta y suministro requiere receta médica para garantizar su control sanitario.',
  medConservacion: 'Consérvese en su empaque original protegido de la luz y la humedad. Manténgase a la temperatura indicada en el envase. Fuera del alcance de los niños.',
  medAviso: ['Dosis: La que el médico señale.', 'Léase instructivo anexo impreso en el empaque del medicamento.', 'Consulte a su médico.', 'Evite automedicarse.'],
  disMc: 'Utilice el dispositivo conforme al instructivo del fabricante.',
  cosMc: 'Aplicar conforme a las indicaciones del fabricante.',
  higMc: 'Utilizar conforme a las indicaciones del fabricante.',
  supResp: 'El consumo de este producto es responsabilidad de quien lo recomienda y de quien lo usa. Este producto no es un medicamento.',
  supConservacion: 'Consérvese bien cerrado en un lugar fresco y seco. No se deje al alcance de los niños.'
};
/* Secciones de texto literal que se agregan al HTML de Magento solo si el dato fue capturado: [encabezado, texto]. */
const secs = pairs => pairs.filter(([, t]) => t).map(([h, t]) => `<h2>${h}</h2>\n<p>${escT(t)}</p>`);
const NOTA_SUP = `<h2>Condiciones de conservación:</h2>\n<p>${LEGEND.supConservacion}</p>`;

/* Áreas terapéuticas o de uso. Lista cerrada: sirve para clasificar y para que la IA proponga complementos; no sale en ningún texto. */
const AREAS = ['Diabetes y metabolismo', 'Control de peso', 'Cardiovascular', 'Digestivo y gastrointestinal', 'Respiratorio y alergias', 'Dolor e inflamación', 'Infecciones', 'Salud mental y neurología', 'Hormonal y salud sexual', 'Piel y dermatología', 'Ojos y oídos', 'Oncología e inmunología', 'Nutrición y vitaminas', 'Hidratación', 'Higiene y cuidado personal', 'Otra'];
const areaOpts = () => [['', 'Sin declarar'], ...AREAS.map(x => [x, x])];
/* Código ATC de la OMS, de 1 a 5 niveles: A, A10, A10B, A10BX, A10BX16. */
const ATC_RE = /^[A-Z](?:\d{2}(?:[A-Z](?:[A-Z](?:\d{2})?)?)?)?$/;
/* ---------- Categorías ---------- */
const CATS = {
  med: {
    emoji: '💊', name: 'Medicamentos', range: [50, 100],
    fields: [
      F('marca','Marca',{req:1,ph:'Mounjaro'}),
      F('concentracion','Concentración',{req:1,ph:'2.5 mg'}),
      F('volumen','Volumen',{ph:'0.6 mL',hint:'Solo aplica a líquidos e inyectables.'}),
      F('principio','Principio activo',{req:1,ph:'Tirzepatida'}),
      F('forma','Forma farmacéutica',{req:1,pres:1,ph:'Solución inyectable'}),
      F('contenido','Presentación o piezas',{req:1,pres:1,ph:'30 o Caja con 4 plumas',hint:'Si capturas solo un número, se interpreta como piezas. Ejemplo: 30 → 30 piezas.'}),
      F('laboratorio','Laboratorio',{req:1,ph:'Eli Lilly'}),
      F('categoria','Categoría',{ph:'Endocrinología',hint:'Categoría del árbol de la tienda, por ejemplo Endocrinología. Opcional. Aparece en la ficha técnica de Magento.'}),
      F('via','Vía de administración',{req:1,g:'d',ph:'Subcutánea'}),
      F('receta','¿Requiere receta médica?',{req:1,g:'d',type:'select',opts:[['','Sin declarar'],['si','Sí requiere receta'],['no','No requiere receta']],hint:'Dato regulatorio obligatorio. Sin él no se genera el HTML de Magento.'}),
      F('leyenda','Leyenda regulatoria adicional',{g:'d',type:'area',hint:'Solo si viene en la ficha de origen.'}),
      F('area','Área terapéutica',{g:'i',type:'select',opts:areaOpts(),hint:'Dato interno. No sale en la ficha, en el CSV ni en Magento.'}),
      F('area2','Segunda área terapéutica',{g:'i',type:'select',opts:areaOpts(),hint:'Solo si el producto tiene dos usos, por ejemplo diabetes y control de peso.'}),
      F('atc','Código ATC',{g:'i',raw:1,upper:1,ph:'A10BX16',hint:'Clasificación Anatómica, Terapéutica y Química de la OMS. Opcional. Verifícalo en el índice ATC oficial.'}),
      F('especialidad','¿Es de alta especialidad?',{g:'i',type:'select',opts:[['','Sin declarar'],['si','Sí es de alta especialidad'],['no','No es de alta especialidad']],hint:'Dato interno. No sale en la ficha, en el CSV ni en Magento. Un medicamento con receta, de alta especialidad o sin declarar nunca se recomienda como complemento de otro producto.'}),
      F('indicaciones','Indicaciones',{g:'d',type:'area',sentence:1,hint:'Cópialas tal cual del inserto o del registro sanitario. Aparece en una sección aparte y en las preguntas frecuentes.'}),
      F('posologia','Posología o cómo se usa',{g:'d',type:'area',sentence:1,hint:'Dosis y frecuencia tal como están en el inserto. Aparece en una sección aparte.'}),
      F('poblacion','Población a la que va dirigido',{g:'d',type:'area',sentence:1,hint:'Por ejemplo, adultos o uso pediátrico, tal como indica el inserto.'}),
      F('contraindicaciones','Contraindicaciones y advertencias',{g:'d',type:'area',sentence:1,hint:'Tal como están en el inserto. Aparece en una sección aparte.'})
    ],
    title: [
      seg('Marca + concentración / volumen', ['marca','concentracion','volumen'], v => join(' ', v.marca, join(' / ', v.concentracion, v.volumen))),
      seg('Principio activo', ['principio']),
      seg('Forma farmacéutica + presentación', ['forma','contenido'], v => joinForm(v.forma, v.contenido)),
      seg('Laboratorio', ['laboratorio'], v => v.laboratorio && (/^laboratorios?\b/i.test(v.laboratorio) ? v.laboratorio : 'Laboratorio ' + v.laboratorio))
    ],
    vital: ['principio'],
    mcUses: ['marca','principio','concentracion','forma','via','contenido','laboratorio'],
    mgUses: ['marca','principio','concentracion','forma','via','contenido','laboratorio'],
    mc: v => {
      const conc = join(' / ', v.concentracion, v.volumen);
      const head = join(' ', v.marca, v.principio && `(${v.principio})`, conc);
      return [
        join(' - ', join(', ', head, v.forma, v.contenido), v.laboratorio),
        v.principio && `Contiene ${join(' ', v.principio, conc)}`,
        v.forma && `Forma farmacéutica: ${v.forma}`,
        v.via && `Vía de administración: ${v.via}`,
        v.contenido && `Presentación: ${v.contenido}`,
        LEGEND.medMc,
        v.leyenda
      ];
    },
    mg: v => {
      const conc = join(' / ', v.concentracion, v.volumen);
      let p = `${S(join(' ', v.marca, v.principio && `(${v.principio})`, conc))} es un medicamento`
        + (v.laboratorio ? ` desarrollado por el laboratorio ${S(v.laboratorio)}` : '') + '.';
      if (v.forma || v.via) {
        p += ' Esta presentación' + (v.forma ? ` en ${S(v.forma)}` : '')
          + (v.via ? ` está indicada para su administración por vía ${S(v.via)}, proporcionando` : ' proporciona')
          + ' la dosificación prescrita según las indicaciones de los profesionales de la salud.';
      }
      if (v.receta === 'si') p += ' ' + LEGEND.medReceta;
      return assemble(p, 'Ficha técnica del producto:', [
        ['Nombre Comercial', v.marca], ['Sustancia Activa', v.principio], ['Concentración', conc],
        ['Forma Farmacéutica', v.forma], ['Presentación', v.contenido], ['Vía de Administración', v.via], ['Laboratorio', v.laboratorio], ['Categoría', v.categoria]
      ], [
        ...[['Indicaciones:', v.indicaciones], ['Cómo se usa:', v.posologia], ['Población a la que va dirigido:', v.poblacion], ['Contraindicaciones y advertencias:', v.contraindicaciones], ['Leyenda adicional:', v.leyenda]]
          .filter(([, t]) => t).map(([h, t]) => `<h2>${h}</h2>\n<p>${escT(t)}</p>`),
        `<h2>Condiciones de conservación:</h2>\n<p>${LEGEND.medConservacion}</p>`,
        `<h2>Aviso legal y de seguridad:</h2>\n<ul>\n${LEGEND.medAviso.map(x => `  <li>${x}</li>`).join('\n')}\n</ul>`
      ]);
    }
  },

  dis: {
    emoji: '🩺', name: 'Dispositivos médicos', range: [80, 150],
    fields: [
      F('marca','Marca',{req:1,ph:'Omron'}),
      F('modelo','Modelo',{req:1,ph:'HEM-7121'}),
      F('tipo','Tipo de dispositivo',{req:1,ph:'Baumanómetro digital'}),
      F('tecnologia','Tecnología o zona de medición',{req:1,ph:'Automático de brazo'}),
      F('fabricante','Fabricante',{req:1,ph:'Omron'}),
      F('uso','Uso previsto',{g:'d',hint:'Solo si está validado en la ficha.'}),
      F('caracteristicas','Características técnicas verificables',{g:'d',type:'area'}),
      F('paquete','Contenido del paquete',{g:'d'}),
      F('presentacion','Presentación',{g:'d',pres:1}),
      F('extra','Especificaciones adicionales',{g:'d',type:'area',hint:'Conectividad, memoria, muestra, etc.'}),
      F('compat','Insumos compatibles (SKU)',{g:'d',raw:1,hint:'SKU de los insumos o accesorios que van con este producto, separados por coma. Salen en crosssell_skus. No cambian ningún texto.'})
    ],
    title: [
      seg('Marca + modelo + tipo', ['marca','modelo','tipo']),
      seg('Tecnología o zona de medición', ['tecnologia']),
      seg('Fabricante', ['fabricante'])
    ],
    vital: ['tecnologia'],
    mcUses: ['marca','modelo','tipo','tecnologia','fabricante','uso','caracteristicas','paquete'],
    mgUses: ['marca','modelo','tipo','tecnologia','fabricante','uso','caracteristicas','paquete','presentacion'],
    mc: v => [
      join(' - ', join(' ', v.marca, v.modelo, v.tipo, v.tecnologia), v.fabricante),
      v.tipo && `Dispositivo médico ${lc(v.tipo)}${v.uso ? ' para ' + lc(v.uso) : ''}`,
      v.caracteristicas && `Cuenta con ${lc(v.caracteristicas)}`,
      v.paquete && `Incluye ${lc(v.paquete)}`,
      v.extra,
      LEGEND.disMc
    ],
    mg: v => {
      let p = `${S(join(' ', v.marca, v.modelo, v.tipo))} es un equipo de medición técnica` + (v.fabricante ? ` fabricado por ${S(v.fabricante)}` : '') + '.';
      if (v.tecnologia || v.uso || v.caracteristicas) {
        p += ' Este dispositivo médico' + (v.tecnologia ? ` de tecnología ${S(v.tecnologia)}` : '')
          + (v.uso ? ` está diseñado para el uso previsto de ${S(v.uso)}` : '')
          + (v.caracteristicas ? (v.uso ? ', integrando' : ' integra') + ` componentes de ${S(v.caracteristicas)}` : '') + '.';
      }
      if (v.paquete) p += ` Su empaque original incluye ${S(v.paquete)}` + (v.presentacion ? ` en su presentación de ${S(v.presentacion)}` : '') + ' para ser utilizado conforme al instructivo del fabricante.';
      else p += (v.presentacion ? ` Se presenta en ${S(v.presentacion)}.` : '') + ' Debe utilizarse conforme al instructivo del fabricante.';
      return assemble(p, 'Especificaciones técnicas:', [
        ['Marca', v.marca], ['Modelo', v.modelo], ['Tipo de Dispositivo', v.tipo],
        ['Tecnología / Zona de medición', v.tecnologia], ['Contenido del Paquete', v.paquete], ['Fabricante', v.fabricante], ['Categoría', v.categoria]
      ], secs([['Especificaciones adicionales:', v.extra]]));
    }
  },

  cos: {
    emoji: '🧴', name: 'Dermacosméticos / Cosméticos', range: [80, 150],
    fields: [
      F('marca','Marca',{req:1,ph:'La Roche-Posay'}),
      F('producto','Nombre del producto',{ph:'Hyalu B5',hint:'Nombre comercial o línea. Captura al menos el nombre o el tipo.'}),
      F('tipo','Tipo de producto',{ph:'Sérum',hint:'Forma o denominación. Si el nombre ya lo dice, por ejemplo «Crema Hidratante», no se repite en el título.'}),
      F('atributo','Atributo o activo principal',{req:1,ph:'Ácido hialurónico'}),
      F('contenido','Contenido',{req:1,pres:1,ph:'Frasco 30 mL'}),
      F('fabricante','Fabricante',{req:1,ph:"L'Oréal"}),
      F('piel','Tipo de piel o necesidad declarada',{g:'d',hint:'Solo si está validado en el empaque.'}),
      F('ingredientes','Ingredientes o activos destacados',{g:'d',type:'area'}),
      F('textura','Textura u objetivo cosmético',{g:'d'}),
      F('comercial','Frase comercial objetiva',{g:'d',type:'area',hint:'Sin adjetivos vacíos. Va al final de la descripción.'}),
      F('inci','Lista de ingredientes (INCI)',{g:'d',type:'area',raw:1,hint:'Cópiala tal cual del empaque, en el mismo orden. Aparece en una sección aparte.'}),
      F('modo','Modo de uso',{g:'d',type:'area',sentence:1,hint:'Tal como aparece en el empaque. Aparece en una sección aparte.'}),
      F('precauciones','Precauciones',{g:'d',type:'area',sentence:1,hint:'Leyendas del empaque, tal cual. Aparece en una sección aparte.'}),
      F('fps','Factor de protección solar (FPS)',{g:'d',hint:'Solo protectores solares. Ejemplo: 50+'}),
      F('nivel','Nivel de protección',{g:'d',type:'select',opts:[['','Sin declarar'],['Baja','Baja'],['Media','Media'],['Alta','Alta'],['Muy alta','Muy alta']],hint:'Solo protectores solares. Debe coincidir con el empaque.'})
    ],
    title: [
      seg('Marca + producto + tipo', ['marca','producto','tipo'], null, ['producto','tipo']),
      seg('Atributo o activo principal', ['atributo']),
      seg('Contenido', ['contenido']),
      seg('Fabricante', ['fabricante'])
    ],
    vital: ['atributo'],
    mcUses: ['marca','producto','tipo','atributo','contenido','fabricante','piel','ingredientes','textura'],
    mgUses: ['marca','producto','tipo','atributo','contenido','fabricante','piel','textura'],
    mc: v => [
      join(' - ', join(' ', v.marca, dedupeFields(v).producto, dedupeFields(v).tipo, v.atributo, v.contenido), v.fabricante),
      v.piel && `${v.tipo ? cap(v.tipo) : 'Producto'} formulado para ${lc(v.piel)}`,
      v.ingredientes && `Contiene ${lc(v.ingredientes)}`,
      v.textura,
      v.contenido && `Presentación de ${lc(v.contenido)}`,
      LEGEND.cosMc,
      v.comercial
    ],
    mg: v => {
      let p = `${S(join(' ', v.marca, v.producto))} es un producto de cuidado dermatológico` + (v.fabricante ? ` desarrollado por ${S(v.fabricante)}` : '') + '.';
      if (v.tipo || v.piel || v.atributo) {
        p += ' Esta fórmula' + (v.tipo ? ` en tipo de producto ${S(v.tipo)}` : '')
          + (v.piel ? ` está desarrollada específicamente para las necesidades de ${S(v.piel)}` : '')
          + (v.atributo ? (v.piel ? ', incorporando ' : ' incorpora ') + `${S(v.atributo)} como activo destacado` : '') + '.';
      }
      if (v.textura) p += ` Su aplicación proporciona una textura de ${S(v.textura)}` + (v.contenido ? ` en una presentación de ${S(v.contenido)}` : '') + ' conforme a las indicaciones de uso del fabricante.';
      else p += (v.contenido ? ` Se presenta en ${S(v.contenido)}, para aplicarse` : ' Debe aplicarse') + ' conforme a las indicaciones de uso del fabricante.';
      const extras = [];
      if (v.inci) extras.push(`<h2>Ingredientes:</h2>\n<p>${escT(v.inci)}</p>`);
      if (v.modo) extras.push(`<h2>Modo de uso:</h2>\n<p>${escT(v.modo)}</p>`);
      if (v.precauciones) extras.push(`<h2>Precauciones:</h2>\n<p>${escT(v.precauciones)}</p>`);
      if (v.ingredientes) extras.push(...secs([['Ingredientes o activos destacados:', v.ingredientes]]));
      if (v.fps || v.nivel) extras.push(`<h2>Protección solar:</h2>\n<ul>\n${liRows([['Factor de protección solar (FPS)', v.fps], ['Nivel de protección', v.nivel]])}\n</ul>`);
      return assemble(p, 'Detalles del producto:', [
        ['Marca', v.marca], ['Nombre del Producto', v.producto], ['Tipo de Producto', v.tipo],
        ['Atributo o Activo Principal', v.atributo], ['Contenido', v.contenido], ['Fabricante', v.fabricante], ['Categoría', v.categoria]
      ], [...extras, ...(v.comercial ? [`<p>${escT(v.comercial)}</p>`] : [])]);
    }
  },

  sup: {
    emoji: '🌿', name: 'Suplementos alimenticios', range: [50, 100],
    fields: [
      F('marca','Marca',{req:1,ph:'GNC'}),
      F('componente','Componente o tipo principal',{req:1,ph:'Vitamina C'}),
      F('forma','Forma',{req:1,pres:1,ph:'Cápsulas'}),
      F('contenido','Contenido neto o piezas',{req:1,pres:1,ph:'Frasco con 100 piezas'}),
      F('fabricante','Fabricante',{req:1,ph:'GNC'}),
      F('composicion','Composición o ingredientes',{g:'d',type:'area'}),
      F('caracteristicas','Características objetivas',{g:'d',type:'area',hint:'No conviertas ingredientes en beneficios si la ficha no lo dice.'}),
      F('sabor','Sabor',{g:'d',ph:'Naranja',hint:'Opcional. Si lo capturas, entra en el título.'}),
      F('porcion','Tamaño de porción',{g:'d',ph:'1 cápsula',hint:'Opcional. Tal como aparece en la etiqueta.'}),
      F('porciones','Porciones por envase',{g:'d',ph:'100',hint:'Opcional. Tal como aparece en la etiqueta.'}),
      F('nutrimental','Información nutrimental',{g:'d',type:'area',raw:1,lines:1,rows:7,ph:'# Nutriente | Por porción | % VD',hint:'Opcional. Cópiala tal cual de la etiqueta, una fila por línea: Proteína | 20 g | 40 %. Si hay más de una columna (por porción, por 100 g, % VD), empieza con una línea de encabezados: # Nutriente | Por porción | Por 100 g | % VD. Un renglón dentro de otro empieza con guion: - Azúcares | 2 g. No se calcula nada: se muestra lo que captures.'}),
      F('modo','Modo de consumo',{g:'d',type:'area',sentence:1,hint:'Opcional. Tal como aparece en el empaque. Aparece en una sección aparte.'})
    ],
    title: [
      seg('Marca + componente', ['marca','componente']),
      seg('Forma + contenido', ['forma','contenido'], v => joinForm(v.forma, v.contenido)),
      seg('Sabor', ['sabor'], v => saborTxt(v.sabor)),
      seg('Fabricante', ['fabricante'])
    ],
    vital: ['componente'],
    mcUses: ['marca','componente','forma','contenido','fabricante','composicion'],
    mgUses: ['marca','componente','forma','contenido','fabricante'],
    mc: v => [
      join(' - ', join(' ', v.marca, v.componente && `(${v.componente})`, v.contenido), v.fabricante),
      'Suplemento alimenticio' + (v.forma ? ' en forma de ' + lc(v.forma) : '') + ((v.composicion || v.componente) ? ' que contiene ' + lc(v.composicion || v.componente) : ''),
      v.sabor && saborTxt(v.sabor),
      v.contenido && `Presentación de ${lc(v.contenido)}`,
      v.porcion && `Tamaño de porción: ${lc(v.porcion)}`,
      v.porciones && `Porciones por envase: ${v.porciones}`,
      v.modo,
      v.caracteristicas,
      LEGEND.supResp
    ],
    mg: v => {
      let p = `${S(join(' ', v.marca, v.componente && `(${v.componente})`))} es un producto alimenticio` + (v.fabricante ? ` elaborado por el fabricante ${S(v.fabricante)}` : '') + '.';
      if (v.forma || v.componente || v.contenido) {
        p += ' Este suplemento' + (v.forma ? ` en forma de ${S(v.forma)}` : '')
          + (v.componente ? ` incorpora ${S(v.componente)}` : '')
          + (v.contenido ? ` estructurado en una presentación de ${S(v.contenido)}` : '') + '.';
      }
      p += ' ' + LEGEND.supResp;
      return assemble(p, 'Ficha técnica del suplemento:', [
        ['Marca', v.marca], ['Componente o Tipo Principal', v.componente], ['Forma', v.forma], ['Sabor', v.sabor],
        ['Contenido Neto/Piezas', v.contenido], ['Tamaño de Porción', v.porcion], ['Porciones por Envase', v.porciones], ['Fabricante', v.fabricante], ['Categoría', v.categoria]
      ], [...(v.nutrimental ? [nutriTableHtml(v)].filter(Boolean) : []), ...secs([['Composición:', v.composicion], ['Características:', v.caracteristicas], ['Modo de consumo:', v.modo]]), NOTA_SUP]);
    }
  },

  beb: {
    emoji: '🥤', name: 'Bebidas e hidratación',
    fields: [
      F('marca','Marca',{req:1,ph:'Electrolit'}),
      F('tipo','Tipo de bebida',{req:1,ph:'Suero oral'}),
      F('sabor','Sabor',{req:1,ph:'Coco'}),
      F('atributo','Atributo verificado',{req:1,ph:'Sin azúcar'}),
      F('contenido','Contenido',{req:1,pres:1,ph:'625 mL'}),
      F('fabricante','Fabricante',{g:'d'}),
      F('descripcion','Descripción objetiva',{g:'d',type:'area'}),
      F('caracteristicas','Características verificables',{g:'d',type:'area'}),
      F('leyenda','Leyenda correspondiente',{g:'d',type:'area',hint:'Solo si aplica y viene en la ficha.'})
    ],
    title: [
      seg('Marca + tipo de bebida', ['marca','tipo']),
      seg('Sabor', ['sabor'], v => saborTxt(v.sabor)),
      seg('Atributo verificado', ['atributo']),
      seg('Contenido', ['contenido'])
    ],
    vital: [],
    mcUses: ['marca','tipo','sabor','atributo','contenido','fabricante','descripcion'],
    mgUses: ['marca','tipo','sabor','atributo','contenido','fabricante'],
    mc: v => [
      join(' - ', join(' ', v.marca, v.tipo, saborTxt(v.sabor), v.atributo, v.contenido), v.fabricante),
      v.descripcion, v.caracteristicas,
      v.contenido && `Presentación de ${lc(v.contenido)}`,
      v.leyenda
    ],
    mg: v => {
      const sabor = v.sabor && v.sabor.replace(/^sabor\s+/i, '');
      let p = `${S(join(' ', v.marca, v.tipo))} es una solución líquida de hidratación` + (v.fabricante ? ` distribuida por ${S(v.fabricante)}` : '') + '.';
      if (sabor || v.atributo || v.contenido) {
        const verbs = [];
        if (v.atributo) verbs.push(`cuenta con los atributos verificados de ${S(v.atributo)}`);
        if (v.contenido) verbs.push(`${v.atributo ? 'presentándose' : 'se presenta'} en un envase de ${S(v.contenido)}`);
        if (!verbs.length) verbs.push('se presenta');
        p += ' Esta fórmula' + (sabor ? ` sabor ${S(sabor)}` : '') + ' ' + verbs.join(', ') + ' para consumirse de forma directa según las necesidades de hidratación del usuario.';
      }
      return assemble(p, 'Características de la bebida:', [
        ['Marca', v.marca], ['Tipo de Bebida', v.tipo], ['Sabor', sabor],
        ['Atributo Verificado', v.atributo], ['Contenido', v.contenido], ['Categoría', v.categoria]
      ], secs([['Descripción:', v.descripcion], ['Características:', v.caracteristicas], ['Leyenda:', v.leyenda]]));
    }
  },

  hig: {
    emoji: '🪥', name: 'Cuidado personal e higiene',
    fields: [
      F('marca','Marca',{req:1,ph:'Colgate'}),
      F('producto','Producto',{req:1,ph:'Total 12 pasta dental'}),
      F('variante','Variante o característica principal',{req:1,ph:'Salud bucal completa'}),
      F('contenido','Contenido',{req:1,pres:1,ph:'Crema 150 mL'}),
      F('fabricante','Fabricante',{req:1,ph:'Colgate-Palmolive'}),
      F('uso','Uso objetivo',{g:'d'}),
      F('ingredientes','Ingredientes destacados',{g:'d',type:'area'}),
      F('caracteristicas','Características',{g:'d',type:'area'})
    ],
    title: [
      seg('Marca + producto', ['marca','producto']),
      seg('Variante o característica principal', ['variante']),
      seg('Contenido', ['contenido']),
      seg('Fabricante', ['fabricante'])
    ],
    vital: [],
    mcUses: ['marca','producto','variante','contenido','fabricante','uso','ingredientes'],
    mgUses: ['marca','producto','variante','contenido','fabricante','uso'],
    mc: v => [
      join(' - ', join(' ', v.marca, v.producto, v.variante, v.contenido), v.fabricante),
      v.uso && `${cap(v.producto || 'Producto')} para ${lc(v.uso)}`,
      v.ingredientes && `Contiene ${lc(v.ingredientes)}`,
      v.caracteristicas,
      v.contenido && `Presentación de ${lc(v.contenido)}`,
      LEGEND.higMc
    ],
    mg: v => {
      let p = `${S(join(' ', v.marca, v.producto))} es un artículo de higiene y cuidado diario` + (v.fabricante ? ` producido por ${S(v.fabricante)}` : '') + '.';
      if (v.variante || v.uso || v.contenido) {
        let c = v.variante ? ` Esta variante con características de ${S(v.variante)}` : ' Este producto';
        if (v.uso) c += ` está diseñad${v.variante ? 'a' : 'o'} para cumplir con el uso objetivo de ${S(v.uso)}`;
        if (v.contenido) c += (v.uso ? ', entregándose' : ' se entrega') + ` en una presentación de ${S(v.contenido)}`;
        if (!v.uso && !v.contenido) c += ' se presenta';
        p += c + ' para ser utilizado conforme a las instrucciones del empaque.';
      }
      return assemble(p, 'Información de cuidado personal:', [
        ['Marca', v.marca], ['Producto', v.producto], ['Variante o Característica Principal', v.variante],
        ['Contenido', v.contenido], ['Fabricante', v.fabricante], ['Categoría', v.categoria]
      ], secs([['Ingredientes:', v.ingredientes], ['Características:', v.caracteristicas]]));
    }
  },

  acc: {
    emoji: '📦', name: 'Accesorios y generales',
    fields: [
      F('marca','Marca',{req:1,ph:'Saba'}),
      F('producto','Producto o modelo',{req:1,ph:'Parches térmicos'}),
      F('material','Material o compatibilidad',{req:1,ph:'Alivio de dolores'}),
      F('contenido','Contenido o piezas',{req:1,pres:1,ph:'Caja con 3 piezas'}),
      F('fabricante','Fabricante',{req:1,ph:'Essity'}),
      F('queEs','¿Qué es? Descripción objetiva',{g:'d',type:'area'}),
      F('caracteristicas','Características principales',{g:'d',type:'area'}),
      F('paquete','Incluye',{g:'d'}),
      F('compat','Productos compatibles (SKU)',{g:'d',raw:1,hint:'SKU de los productos que van con este accesorio, separados por coma. Salen en crosssell_skus. No cambian ningún texto.'})
    ],
    title: [
      seg('Marca + producto o modelo', ['marca','producto']),
      seg('Material o compatibilidad', ['material']),
      seg('Contenido o piezas', ['contenido']),
      seg('Fabricante', ['fabricante'])
    ],
    vital: [],
    mcUses: ['marca','producto','material','contenido','fabricante','queEs','paquete'],
    mgUses: ['marca','producto','material','contenido','fabricante'],
    mc: v => [
      join(' - ', join(' ', v.marca, v.producto, v.material), v.fabricante),
      v.queEs, v.caracteristicas,
      v.material && `Material o compatibilidad: ${v.material}`,
      v.paquete && `Incluye ${lc(v.paquete)}`,
      v.contenido && `Presentación de ${lc(v.contenido)}`
    ],
    mg: v => {
      let p = `${S(join(' ', v.marca, v.producto))} es un accesorio para el bienestar y cuidado general` + (v.fabricante ? ` desarrollado por ${S(v.fabricante)}` : '') + '.';
      if (v.material || v.contenido) {
        p += ' Este producto' + (v.material ? ` está fabricado con materiales y especificaciones de compatibilidad de ${S(v.material)}` : '')
          + (v.contenido ? (v.material ? ', suministrándose' : ' se suministra') + ` en una presentación final de ${S(v.contenido)}` : '') + '.';
      }
      return assemble(p, 'Especificaciones del accesorio:', [
        ['Marca', v.marca], ['Producto/Modelo', v.producto], ['Material o Compatibilidad', v.material],
        ['Contenido/Piezas', v.contenido], ['Fabricante', v.fabricante], ['Categoría', v.categoria]
      ], secs([['Descripción:', v.queEs], ['Características:', v.caracteristicas], ['Incluye:', v.paquete]]));
    }
  }
};

Object.keys(CATS).forEach(id => { CATS[id].id = id; });
/* Campos opcionales que alimentan la descripción de Merchant Center (mcOpt) o el HTML de Magento (mgOpt) cuando se capturan.
   Solo sirven para decir dónde se usa cada dato; no cambian los avisos de datos faltantes. */
{
  const opt = {
    med: [['leyenda', 'volumen'], ['volumen', 'indicaciones', 'posologia', 'poblacion', 'contraindicaciones', 'categoria', 'leyenda']],
    dis: [['extra'], ['extra', 'categoria']],
    cos: [['comercial'], ['ingredientes', 'comercial', 'inci', 'modo', 'precauciones', 'fps', 'nivel', 'categoria']],
    sup: [['caracteristicas', 'sabor', 'porcion', 'porciones', 'modo'], ['composicion', 'caracteristicas', 'sabor', 'porcion', 'porciones', 'modo', 'nutrimental', 'categoria']],
    beb: [['descripcion', 'caracteristicas', 'leyenda'], ['descripcion', 'caracteristicas', 'leyenda', 'categoria']],
    hig: [['ingredientes', 'caracteristicas'], ['ingredientes', 'caracteristicas', 'categoria']],
    acc: [['queEs', 'caracteristicas', 'paquete'], ['queEs', 'caracteristicas', 'paquete', 'categoria']]
  };
  Object.entries(opt).forEach(([id, [mc, mg]]) => { CATS[id].mcOpt = mc; CATS[id].mgOpt = mg; });
}
Object.keys(CATS).forEach(id => {
  if (id === 'med') return;
  const f = CATS[id].fields, last = f.map(x => !x.g).lastIndexOf(true);
  f.splice(last + 1, 0, F('categoria', 'Categoría', { ph: 'Nutrición clínica', hint: 'Categoría del árbol de la tienda, por ejemplo Nutrición clínica. Opcional. Aparece en la ficha técnica de Magento.' }));
});
Object.keys(CATS).forEach(id => { if (id !== 'med') CATS[id].fields.push(F('area', 'Área de uso o necesidad', { g: 'i', type: 'select', opts: areaOpts(), hint: 'Dato interno, por ejemplo Hidratación o Nutrición y vitaminas. No sale en la ficha, en el CSV ni en Magento.' })); });
const labelOf = (c, k) => (c.fields.find(x => x.key === k) || {}).label || k;

/* ---------- Cálculo ---------- */
function values(c, raw, style, keep) {
  const v = {}, changes = [];
  for (const fd of c.fields) {
    const r = raw[fd.key] ?? '';
    if (fd.type === 'select') { v[fd.key] = r; continue; }
    if (fd.lines) { v[fd.key] = String(r).split(/\r?\n/).map(l => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n'); continue; }
    const orig = String(r).replace(/\s+/g, ' ').trim();
    let t = orig;
    if (t) {
      if (fd.upper) t = t.toUpperCase().replace(/\s+/g, '');
      else if (fd.raw) { /* lista de ingredientes: se conserva tal cual */ }
      else if (fd.sentence) t = normUnits(sentenceCase(t, keep), style);
      else {
        t = fixCaps(t, keep, fd.pres ? 'sentence' : 'title');
        if (fd.pres) t = expandPres(t);
        t = normUnits(t, style);
      }
    }
    v[fd.key] = t;
    if (style === 'mL' && orig && t !== orig) changes.push({ label: fd.label, from: orig, to: t });
  }
  return { v, changes };
}

/* Evita repetir información: el tipo ya incluido en el nombre, o la marca al inicio del nombre */
function dedupeFields(v) {
  const d = { ...v };
  const tok = s => fold(String(s || '')).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const inside = (big, small) => { const B = new Set(tok(big)), S = tok(small); return S.length > 0 && S.every(t => B.has(t)); };
  const mf = d.marca ? fold(d.marca).toLowerCase() : '';
  ['producto', 'modelo', 'tipo', 'componente'].forEach(k => {
    if (mf && d[k] && fold(d[k]).toLowerCase().startsWith(mf + ' ')) d[k] = d[k].slice(d.marca.length).trim();
  });
  if (d.producto && d.tipo) {
    if (inside(d.producto, d.tipo)) d.tipo = '';
    else if (inside(d.tipo, d.producto)) d.producto = '';
  }
  return d;
}

function buildTitle(c, v) {
  const d = dedupeFields(v);
  const segs = c.title.map(s => {
    const raw = ((s.fn ? s.fn(d) : join(' ', ...s.parts.map(k => d[k]))) || '').trim();
    const text = capNouns(cap(raw));
    const parts = s.parts.map(k => { const fd = c.fields.find(x => x.key === k); return { key: k, label: fd.label, value: v[k], req: !!fd.req }; });
    const missing = parts.filter(p => p.req && !p.value).map(p => p.label);
    if (s.anyOf && !s.anyOf.some(k => v[k])) missing.push(s.anyOf.map((k, i) => i ? lc(labelOf(c, k)) : labelOf(c, k)).join(' o '));
    const omitted = s.parts.filter(k => v[k] && !d[k]).map(k => labelOf(c, k));
    return { label: s.label, text, parts, missing, omitted, state: !text ? 'missing' : (missing.length ? 'partial' : 'ok') };
  });
  const title = segs.map(s => s.text).filter(Boolean).join(' | ');
  return { segs, title, missing: segs.flatMap(s => s.missing) };
}

/* La marca no debe repetirse en el título (se ignoran los segmentos del fabricante o laboratorio). */
function dupBrand(r) {
  const m = (r.vt.v.marca || '').toLowerCase();
  const t = r.title.segs.filter(s => !s.parts.some(p => p.key === 'fabricante' || p.key === 'laboratorio')).map(s => s.text).join(' | ').toLowerCase();
  return !!m && t.split(m).length - 1 > 1;
}

function buildMC(c, v) {
  const text = c.mc(v).filter(Boolean).map(sentence).filter(Boolean).join(' ');
  const omitted = c.mcUses.filter(k => !v[k]).map(k => labelOf(c, k));
  const words = text ? text.trim().split(/\s+/).length : 0;
  return { text, omitted, words };
}

const recetaMeta = (c, v) => c.id === 'med' ? (v.receta === 'si' ? 'Sí' : v.receta === 'no' ? 'No' : '') : 'No aplica para esta categoría';
const mgFull = g => '```html\n' + g.html + '\n```\n\n- Categoría detectada: ' + g.meta.categoria + '\n- Requiere receta médica: ' + g.meta.receta;

/* Preguntas frecuentes. Cada pregunta existe solo si el dato que la responde fue capturado. Las respuestas son frases fijas
   o copia literal de lo capturado; no se inventa texto y no se emite JSON-LD.
   Para que el catálogo no se vea repetitivo, la pregunta y los conectores de las respuestas de plantilla tienen variantes
   escritas aquí. La variante se elige con un hash de los datos del producto: el mismo producto sale siempre igual y productos
   distintos varían. Las leyendas regulatorias y los textos literales nunca se parafrasean. */
const faqName = (c, v) => c.id === 'med' ? v.marca : join(' ', v.marca, v.producto || v.modelo || v.componente || v.tipo);
const FAQ_MIN = 2;
const faqSeed = (c, v) => {
  let h = 2166136261;
  for (const ch of [c.id, v.marca, v.principio, v.producto, v.modelo, v.componente, v.tipo, v.concentracion, v.contenido].map(x => x || '').join('|')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h;
};
const faqPres = (v, ...pre) => (v.forma || v.contenido) && pre.map(t => `${t} ${join(', ', v.forma && 'en ' + lc(v.forma), v.contenido && lc(v.contenido))}.`);
/* Cada entrada: [variantes de la pregunta, respuesta]. La respuesta es un texto fijo o una lista de variantes de plantilla. */
const FAQ_RULES = {
  med: (v, n) => [
    v.principio && [[`¿Qué contiene ${n}?`, `¿Cuál es el principio activo de ${n}?`, `¿Qué sustancia activa tiene ${n}?`],
      [`${n} contiene ${join(' ', v.principio, join(' / ', v.concentracion, v.volumen))}.`, `Su sustancia activa es ${join(' ', v.principio, join(' / ', v.concentracion, v.volumen))}.`]],
    v.indicaciones && [[`¿Para qué se usa ${n}?`, `¿En qué casos se usa ${n}?`, `¿Cuál es la indicación de ${n}?`], v.indicaciones],
    v.posologia && [[`¿Cómo se usa ${n}?`, `¿Cuál es la dosis de ${n}?`, `¿Cómo se debe utilizar ${n}?`], v.posologia],
    v.via && [[`¿Cómo se administra ${n}?`, `¿Por qué vía se administra ${n}?`], [`Se administra por vía ${lc(v.via)}.`, `Su vía de administración es ${lc(v.via)}.`]],
    v.poblacion && [[`¿A quién va dirigido ${n}?`, `¿Quién puede usar ${n}?`, `¿Para qué población es ${n}?`], v.poblacion],
    v.contraindicaciones && [[`¿Quién no debe usar ${n}?`, `¿Cuándo no se debe usar ${n}?`, `¿Qué contraindicaciones tiene ${n}?`], v.contraindicaciones],
    v.receta === 'si' && [[`¿Es necesaria la receta médica para ${n}?`, `¿Se necesita receta médica para ${n}?`], `Sí. ${LEGEND.medReceta}`],
    v.receta === 'no' && [[`¿Es necesaria la receta médica para ${n}?`, `¿Se necesita receta médica para ${n}?`], 'No requiere receta médica. Consulte a su médico y evite automedicarse.'],
    faqPres(v, 'Se presenta', 'Su presentación es') && [[`¿En qué presentación se vende ${n}?`, `¿Cómo se presenta ${n}?`, `¿Qué presentación tiene ${n}?`], faqPres(v, 'Se presenta', 'Su presentación es')],
    v.laboratorio && [[`¿Quién fabrica ${n}?`, `¿Qué laboratorio produce ${n}?`, `¿De qué laboratorio es ${n}?`], [`Es desarrollado por el laboratorio ${v.laboratorio}.`, `Lo desarrolla el laboratorio ${v.laboratorio}.`]],
    v.categoria && [[`¿A qué categoría pertenece ${n}?`, `¿En qué categoría se encuentra ${n}?`], [`Pertenece a la categoría ${v.categoria}.`, `Se encuentra en la categoría ${v.categoria}.`]],
    [[`¿Cómo se conserva ${n}?`, `¿Cómo se debe almacenar ${n}?`], LEGEND.medConservacion]
  ],
  cos: (v, n) => [
    (v.ingredientes || v.atributo) && [[`¿Qué contiene ${n}?`, `¿Qué activos tiene ${n}?`], [`Contiene ${lc(v.ingredientes || v.atributo)}.`, `Su fórmula incluye ${lc(v.ingredientes || v.atributo)}.`]],
    v.inci && [[`¿Cuál es la lista completa de ingredientes de ${n}?`, `¿Qué ingredientes (INCI) tiene ${n}?`], v.inci],
    v.piel && [[`¿Para qué tipo de piel o necesidad es ${n}?`, `¿Quién puede usar ${n}?`], [`Está formulado para ${lc(v.piel)}.`, `Está desarrollado para ${lc(v.piel)}.`]],
    v.modo && [[`¿Cómo se usa ${n}?`, `¿Cómo se aplica ${n}?`], v.modo],
    v.precauciones && [[`¿Qué precauciones tiene ${n}?`, `¿Qué debo tener en cuenta al usar ${n}?`], v.precauciones],
    (v.fps || v.nivel) && [[`¿Qué protección solar ofrece ${n}?`, `¿Qué FPS tiene ${n}?`], join('. ', v.fps && `Factor de protección solar (FPS) ${v.fps}`, v.nivel && `Nivel de protección: ${lc(v.nivel)}`)],
    v.contenido && [[`¿Qué contenido tiene ${n}?`, `¿Cuánto producto trae ${n}?`], [`Se presenta en ${lc(v.contenido)}.`, `Su contenido es ${lc(v.contenido)}.`]],
    v.fabricante && [[`¿Quién fabrica ${n}?`, `¿Qué empresa produce ${n}?`], [`Es desarrollado por ${v.fabricante}.`, `Lo desarrolla ${v.fabricante}.`]],
    v.categoria && [[`¿A qué categoría pertenece ${n}?`, `¿En qué categoría se encuentra ${n}?`], [`Pertenece a la categoría ${v.categoria}.`, `Se encuentra en la categoría ${v.categoria}.`]]
  ],
  sup: (v, n) => [
    (v.composicion || v.componente) && [[`¿Qué contiene ${n}?`, `¿Cuál es la composición de ${n}?`], [`Contiene ${lc(v.composicion || v.componente)}.`, `Su composición incluye ${lc(v.composicion || v.componente)}.`]],
    v.modo && [[`¿Cómo se consume ${n}?`, `¿Cómo se debe tomar ${n}?`], v.modo],
    v.sabor && [[`¿Qué sabor tiene ${n}?`, `¿Cuál es el sabor de ${n}?`], [`Su sabor es ${lc(String(v.sabor).replace(/^sabor\s+/i, ''))}.`, `Es sabor ${lc(String(v.sabor).replace(/^sabor\s+/i, ''))}.`]],
    nutriFact(v, NUTRI_FIND.energia) && [[`¿Cuántas calorías tiene ${n}?`, `¿Cuántas calorías aporta ${n}?`], `Según su tabla nutrimental, aporta ${nutriFact(v, NUTRI_FIND.energia).value}${nutriFact(v, NUTRI_FIND.energia).head}.`],
    nutriFact(v, NUTRI_FIND.proteina) && [[`¿Cuánta proteína tiene ${n}?`, `¿Cuánta proteína aporta ${n}?`], `Según su tabla nutrimental, aporta ${nutriFact(v, NUTRI_FIND.proteina).value} de proteína${nutriFact(v, NUTRI_FIND.proteina).head}.`],
    nutriFact(v, NUTRI_FIND.azucar) && [[`¿Cuánta azúcar tiene ${n}?`, `¿Cuántos azúcares aporta ${n}?`], `Según su tabla nutrimental, tiene ${nutriFact(v, NUTRI_FIND.azucar).value} de azúcares${nutriFact(v, NUTRI_FIND.azucar).head}.`],
    v.porciones && [[`¿Cuántas porciones trae ${n}?`, `¿Cuántas porciones tiene cada envase de ${n}?`], [`Trae ${v.porciones} porciones por envase${v.porcion ? `, con un tamaño de porción de ${lc(v.porcion)}` : ''}.`]],
    faqPres(v, 'Se presenta', 'Su presentación es') && [[`¿En qué presentación se vende ${n}?`, `¿Cómo se presenta ${n}?`], faqPres(v, 'Se presenta', 'Su presentación es')],
    v.fabricante && [[`¿Quién fabrica ${n}?`, `¿Qué empresa elabora ${n}?`], [`Es elaborado por ${v.fabricante}.`, `Lo elabora ${v.fabricante}.`]],
    v.categoria && [[`¿A qué categoría pertenece ${n}?`, `¿En qué categoría se encuentra ${n}?`], [`Pertenece a la categoría ${v.categoria}.`, `Se encuentra en la categoría ${v.categoria}.`]],
    [[`¿${n} es un medicamento?`, `¿${n} reemplaza a un medicamento?`], LEGEND.supResp],
    [[`¿Cómo se conserva ${n}?`, `¿Cómo se debe almacenar ${n}?`], LEGEND.supConservacion]
  ],
  dis: (v, n) => [
    v.uso && [[`¿Para qué se usa ${n}?`, `¿Cuál es el uso previsto de ${n}?`], [`Está diseñado para el uso previsto de ${lc(v.uso)}.`, `Su uso previsto es ${lc(v.uso)}.`]],
    v.tecnologia && [[`¿Qué tecnología tiene ${n}?`, `¿Cómo mide ${n}?`], [`Es de tecnología ${lc(v.tecnologia)}.`, `Su tecnología es ${lc(v.tecnologia)}.`]],
    v.paquete && [[`¿Qué incluye el empaque de ${n}?`, `¿Qué trae ${n} en la caja?`], [`Incluye ${lc(v.paquete)}.`, `El empaque contiene ${lc(v.paquete)}.`]],
    v.fabricante && [[`¿Quién fabrica ${n}?`, `¿Qué empresa produce ${n}?`], [`Es fabricado por ${v.fabricante}.`, `Lo fabrica ${v.fabricante}.`]],
    v.categoria && [[`¿A qué categoría pertenece ${n}?`, `¿En qué categoría se encuentra ${n}?`], [`Pertenece a la categoría ${v.categoria}.`, `Se encuentra en la categoría ${v.categoria}.`]],
    [[`¿Cómo se debe utilizar ${n}?`, `¿Cómo se usa ${n}?`], LEGEND.disMc]
  ]
};
const faqGeneric = (v, n) => [
  v.contenido && [[`¿Qué contenido tiene ${n}?`, `¿Cuánto trae ${n}?`], [`Se presenta en ${lc(v.contenido)}.`, `Su contenido es ${lc(v.contenido)}.`]],
  v.fabricante && [[`¿Quién fabrica ${n}?`, `¿Qué empresa produce ${n}?`], [`Es fabricado por ${v.fabricante}.`, `Lo fabrica ${v.fabricante}.`]],
  v.categoria && [[`¿A qué categoría pertenece ${n}?`, `¿En qué categoría se encuentra ${n}?`], [`Pertenece a la categoría ${v.categoria}.`, `Se encuentra en la categoría ${v.categoria}.`]]
];
/* `seed` solo se pasa en pruebas para recorrer todas las variantes. */
function buildFaq(c, v, seed) {
  const n = faqName(c, v);
  if (!n) return { items: [], html: '' };
  const h = seed == null ? faqSeed(c, v) : seed;
  const pick = (arr, i) => Array.isArray(arr) ? arr[(h + i) % arr.length] : arr;
  const items = (FAQ_RULES[c.id] || faqGeneric)(v, n).filter(Boolean).map(([q, a], i) => [pick(q, i), sentence(pick(a, i))]);
  if (items.length < FAQ_MIN) return { items: [], html: '' };
  return { items, html: '<h2>Preguntas frecuentes:</h2>\n' + items.map(([q, a]) => `<h3>${escT(q)}</h3>\n<p>${escT(a)}</p>`).join('\n') };
}

function buildMg(c, v) {
  const blocked = [];
  if (c.id === 'med' && !v.receta) blocked.push('Indica si el producto requiere receta médica. Es un dato regulatorio obligatorio.');
  (c.vital || []).forEach(k => { if (!v[k]) blocked.push(`${labelOf(c, k)}. No se infiere ni se inventa.`); });
  const omitted = c.mgUses.filter(k => !v[k]).map(k => labelOf(c, k));
  const meta = { categoria: c.name, receta: recetaMeta(c, v) };
  if (blocked.length) return { blocked, omitted, html: '', meta };
  const faq = buildFaq(c, v);
  return { blocked: null, omitted, html: faq.html ? c.mg(v) + '\n<br />\n' + faq.html : c.mg(v), faq: faq.items, meta };
}

function computeFor(catId, raw, keep, metaCfg, flags) {
  const c = CATS[catId];
  const vt = values(c, raw, 'mL', keep);
  const vm = values(c, raw, 'ml', keep);
  const title = buildTitle(c, vt.v);
  const meta = buildMeta(c, vt.v, title, metaCfg && metaCfg.cats && metaCfg.cats[catId], metaCfg && metaCfg.tienda, flags);
  return { c, vt, vm, title, mc: buildMC(c, vt.v), mg: buildMg(c, vm.v), meta };
}

/* ---------- Revisión de lenguaje ---------- */
const RED = [
  [/\bcur(?:a|ar|an|as)\b/i, 'cura', 'claim'], [/\belimin(?:a|an|ar)\b/i, 'elimina', 'claim'],
  [/\bprevien(?:e|en)\b|\bprevenir\b/i, 'previene', 'claim'], [/\bgarantiz(?:a|an|ado|ada|ados|adas)\b/i, 'garantiza', 'claim'],
  [/100\s?%\s*efectiv[oa]/i, '100% efectivo', 'claim'], [/\b(?:el|la|los|las)\s+mejor(?:es)?\b|\bmejor opción\b/i, 'el mejor', 'claim'],
  [/sin efectos secundarios/i, 'sin efectos secundarios', 'claim'], [/\bsustituy(?:e|en)\b|\bsustituir\b/i, 'sustituye', 'claim'],
  [/\bincreíbles?\b/i, 'increíble', 'vacio'], [/\bpráctic[oa]s?\b/i, 'práctico', 'vacio'], [/\bcómod[oa]s?\b/i, 'cómodo', 'vacio'],
  [/\bideal(?:es)?\b/i, 'ideal', 'vacio'], [/\bperfect[oa]s?\b/i, 'perfecto', 'vacio'], [/\bexcelentes?\b/i, 'excelente', 'vacio'],
  [/\bmodern[oa]s?\b/i, 'moderno', 'vacio'], [/\bsencill[oa]s?\b/i, 'sencillo', 'vacio'], [/\bsegur[oa]s?\b/i, 'seguro', 'vacio'],
  [/\bexact[oa]s?\b/i, 'exacto', 'vacio'], [/\bresponsable\b/i, 'responsable', 'vacio'], [/\boptimizad[oa]s?\b/i, 'optimizado', 'vacio'],
  [/\bdelicado\b/i, 'delicado', 'vacio'], [/\bmáxim[oa]s?\b/i, 'máximo', 'vacio']
];
const AMBER = [
  [/piel sensible/i, 'para piel sensible'], [/hidratación intensa/i, 'hidratación intensa'], [/comedog/i, 'no comedogénico'],
  [/alta precisión/i, 'alta precisión'], [/absorción rápida/i, 'absorción rápida']
];
/* Cosméticos (NOM-141-SSA1/SCFI-2012): sin promesas absolutas de protección ni acciones propias de medicamentos */
const COS_CLAIM = [
  [/\bbloqueador(?:es)?\b|\bbloqueante(?:s)?\b/i, 'bloqueador solar'],
  [/\bprotecci[oó]n total\b|\bprotecci[oó]n al 100\s?%|\b100\s?% de protecci[oó]n\b/i, 'protección total o al 100%'],
  [/\btodo el d[ií]a\b/i, 'todo el día'],
  [/\bsin (?:necesidad de )?reaplicar\b|\bno (?:necesitas|requiere) reaplicar\b/i, 'sin reaplicar']
];
const COS_MED = [
  [/\bmedicinal(?:es)?\b/i, 'medicinal'], [/\bterap[eé]utic[oa]s?\b/i, 'terapéutico'],
  [/\bantiinflamatori[oa]s?\b|\bdesinflam\w+/i, 'antiinflamatorio'], [/\bcicatriz\w*/i, 'cicatrizante'],
  [/\bantibi[oó]tic[oa]s?\b|\bantimic[oó]tic[oa]s?\b/i, 'antibiótico o antimicótico'],
  [/\b(?:dermatitis|psoriasis|rosacea|rosácea|eczema|eccema)\b/i, 'enfermedad de la piel']
];
/* Tabla de la norma: 6 a 14 baja, 15 a 29 media, 30 a 50 alta, 50+ muy alta */
function nivelPorFps(fps) {
  const m = String(fps || '').match(/(\d+)\s*(\+)?/);
  if (!m) return { n: null, nivel: '' };
  const n = +m[1];
  if (n < 6) return { n, nivel: '' };
  if (n < 15) return { n, nivel: 'Baja' };
  if (n < 30) return { n, nivel: 'Media' };
  if (n < 50 || (n === 50 && !m[2])) return { n, nivel: 'Alta' };
  return { n, nivel: 'Muy alta' };
}
const langCount = L => L.claim.length + L.vacio.length + L.amber.length + (L.med ? L.med.length : 0);
function lint(c, raw) {
  const out = { claim: [], vacio: [], amber: [], med: [], check: [] };
  for (const fd of c.fields) {
    if (fd.type === 'select' || fd.raw || fd.sentence) continue;
    const t = raw[fd.key] || '';
    if (!t) continue;
    RED.forEach(([re, name, kind]) => { if (re.test(t)) out[kind].push({ term: name, field: fd.label }); });
    AMBER.forEach(([re, name]) => { if (re.test(t)) out.amber.push({ term: name, field: fd.label }); });
    if (c.id === 'cos') {
      COS_CLAIM.forEach(([re, name]) => { if (re.test(t)) out.claim.push({ term: name, field: fd.label }); });
      COS_MED.forEach(([re, name]) => { if (re.test(t)) out.med.push({ term: name, field: fd.label }); });
    }
  }
  if (c.id === 'cos') {
    const fps = String(raw.fps || '').trim(), nivel = raw.nivel || '';
    if (fps) {
      const { n, nivel: esperado } = nivelPorFps(fps);
      if (n === null) out.check.push(`No se entiende el FPS "${fps}". Usa un número, por ejemplo 50 o 50+.`);
      else if (n < 6) out.check.push('El FPS es menor a 6. La norma fija un factor mínimo de 6 para los protectores solares.');
      else if (nivel && nivel !== esperado) out.check.push(`El nivel "${nivel}" no coincide con la tabla de la norma para FPS ${fps} (${esperado}). Confírmalo con el empaque.`);
      else if (!nivel) out.check.push(`Según la tabla de la norma, FPS ${fps} corresponde a nivel ${esperado}. Confírmalo con el empaque y captúralo.`);
      if (!raw.modo) out.check.push('Protector solar sin modo de uso. La norma pide instrucciones de uso en los protectores solares.');
      if (!raw.precauciones) out.check.push('Protector solar sin precauciones. Captura las leyendas del empaque.');
    } else if (nivel) out.check.push('Capturaste un nivel de protección sin FPS.');
  }
  if (c.id === 'sup' && raw.nutrimental) { const np = parseNutrition(raw.nutrimental); out.check.push(...np.problems, ...nutriConsistency(np)); }
  if (raw.atc && !ATC_RE.test(String(raw.atc).toUpperCase().replace(/\s+/g, ''))) out.check.push(`El código ATC "${raw.atc}" no tiene el formato esperado. Ejemplos: A10, A10BX, A10BX16.`);
  return out;
}

/* ---------- CSV ---------- */
const quote = (s, sep) => { s = String(s ?? ''); const re = sep === '\t' ? /[\t\n\r"]/ : /[,\n\r"]/; return re.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const toSheet = (rows, sep, eol) => rows.map(r => r.map(x => quote(x, sep)).join(sep)).join(eol || '\n');
const normHeader = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function parseCSV(text) {
  text = String(text).replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/, 1)[0] || '';
  const cnt = d => first.split(d).length - 1;
  let delim = ',';
  if (cnt(';') > cnt(',') && cnt(';') >= cnt('\t')) delim = ';';
  else if (cnt('\t') > cnt(',')) delim = '\t';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"' && cell === '') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch === '\r') { /* se ignora */ }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return { rows: rows.filter(r => r.some(c => String(c).trim() !== '')), delim };
}

function resolveCat(txt) {
  const n = normHeader(txt);
  if (!n) return null;
  if (CATS[n]) return n;
  if (/dispositiv/.test(n)) return 'dis';
  if (/medic/.test(n)) return 'med';
  if (/dermo|derma|cosmet/.test(n)) return 'cos';
  if (/suplement/.test(n)) return 'sup';
  if (/bebida|hidrata/.test(n)) return 'beb';
  if (/higiene|personal/.test(n)) return 'hig';
  if (/accesorio|general/.test(n)) return 'acc';
  return null;
}
function parseReceta(t) {
  const n = normHeader(t);
  if (!n) return '';
  if (/^(no|n|0|false|sin)\b/.test(n)) return 'no';
  if (/^(si|s|yes|y|1|true|requiere|con)\b/.test(n)) return 'si';
  return '';
}

const ALIAS = {
  contenido: ['presentacion', 'contenido neto', 'piezas', 'contenido piezas', 'contenido o piezas'],
  principio: ['principio activo', 'sustancia activa'],
  laboratorio: ['fabricante'],
  via: ['via de administracion', 'via administracion'],
  tecnologia: ['zona de medicion', 'tecnologia zona de medicion'],
  receta: ['receta', 'receta medica', 'requiere receta']
};
const LOOKUP = {};
function lookupFor(catId) {
  if (LOOKUP[catId]) return LOOKUP[catId];
  const m = new Map();
  CATS[catId].fields.forEach(fd => { m.set(normHeader(fd.label), fd.key); m.set(fd.key.toLowerCase(), fd.key); m.set(normHeader(fd.key), fd.key); });
  CATS[catId].fields.forEach(fd => (ALIAS[fd.key] || []).forEach(a => { if (!m.has(a)) m.set(a, fd.key); }));
  return (LOOKUP[catId] = m);
}

function templateRows(catId) {
  const c = CATS[catId];
  return [
    ['SKU', 'Categoría', ...c.fields.map(f => f.label), 'Imagen principal (opcional)', 'Datos crudos (opcional)'],
    ['EJEMPLO', c.name, ...c.fields.map(f => f.key === 'receta' ? 'Sí' : (f.type === 'select' ? '' : (f.ph || ''))), '', '']
  ];
}

function parseBulk(text, defaultCat) {
  const { rows: cells, delim } = parseCSV(text);
  if (cells.length < 2) return { rows: [], ignored: [], delim, skippedExample: 0 };
  const headers = cells[0].map(h => String(h).trim());
  const H = headers.map(normHeader);
  const skuI = H.findIndex(h => ['sku', 'referencia', 'referencia interna', 'sku o referencia interna', 'codigo', 'codigo sku'].includes(h));
  const catI = H.findIndex(h => h === 'categoria');
  const rawI = H.findIndex(h => /crud|sucio/.test(h));
  const imgI = H.findIndex(h => /^(imagen|archivo de imagen|archivo imagen|base image)/.test(h));
  const used = new Set();
  const out = []; let skippedExample = 0;
  cells.slice(1).forEach((r, idx) => {
    const get = j => (j >= 0 && r[j] != null) ? String(r[j]).trim() : '';
    const sku = get(skuI);
    if (/^ejemplo\b/i.test(sku)) { skippedExample++; return; }
    const catText = get(catI), raw = get(rawI);
    let cat = catText ? resolveCat(catText) : null;
    let error = '', pending = false, v = {};
    if (catText && !cat) error = `Categoría no reconocida: ${catText}`;
    if (!error) {
      const mapCat = cat || defaultCat || null;
      if (mapCat) {
        const lk = lookupFor(mapCat);
        H.forEach((h, j) => {
          if (j === skuI || j === catI || j === rawI || j === imgI) return;
          const k = lk.get(h);
          if (!k) return;
          used.add(j);
          const x = get(j);
          if (x && !v[k]) v[k] = x;
        });
        if (v.receta) { const rc = parseReceta(v.receta); if (rc) v.receta = rc; else delete v.receta; }
        if (v.especialidad) { const ae = parseReceta(v.especialidad); if (ae) v.especialidad = ae; else delete v.especialidad; }
        if (v.nivel) { const nv = { baja: 'Baja', media: 'Media', alta: 'Alta', 'muy alta': 'Muy alta' }[normHeader(v.nivel)]; if (nv) v.nivel = nv; else delete v.nivel; }
      }
      if (Object.keys(v).length) cat = mapCat;
      else if (raw) { pending = true; cat = mapCat; v = {}; }
      else if (!mapCat) error = 'Sin categoría. Agrega la columna Categoría o elige una por defecto.';
      else error = 'Fila sin datos del producto.';
    }
    out.push({ n: idx + 2, sku, img: get(imgI), cat, v, raw, pending, error, err: '' });
  });
  const ignored = headers.filter((h, j) => h && j !== skuI && j !== catI && j !== rawI && j !== imgI && !used.has(j));
  return { rows: out, ignored, delim, skippedExample };
}

/* ---------- Meta etiquetas, alt y exportación a Magento ---------- */
const META_MED = {
  mt: { tpl: 'Comprar {marca} {concentracion}\n{principio}\n{laboratorio}', sep: ' | ', max: 60 },
  md: { tpl: 'El {marca} de {concentracion} contiene {principio} por {laboratorio}\nVenta en línea {receta_txt:o} de forma segura', sep: ' | ', max: 155 }
};
const META_GEN = {
  mt: { tpl: '{seg1}\n{seg2}\n{tienda}', sep: ' | ', max: 60 },
  md: { tpl: '{seg1}\n{seg2}\n{seg3}\n{seg4}\n{tienda}', sep: '. ', max: 155 }
};
const ALT_DEF = {
  med: '{marca} {concentracion}\n{principio}\n{contenido:lc}',
  dis: '{marca} {modelo} {tipo:lc}\n{tecnologia:lc}',
  cos: '{marca} {producto} {tipo:lc}\n{contenido:lc}',
  sup: '{marca} {componente}\n{contenido:lc}',
  beb: '{marca} {tipo:lc}\nsabor {sabor:lc}\n{contenido}',
  hig: '{marca} {producto}\n{contenido:lc}',
  acc: '{marca} {producto}\n{contenido:lc}'
};
const defMetaCat = id => ({
  confirmed: id === 'med',
  mt: { ...(id === 'med' ? META_MED.mt : META_GEN.mt) },
  md: { ...(id === 'med' ? META_MED.md : META_GEN.md) },
  alt: { tpl: ALT_DEF[id] || '{marca} {producto}', sep: ', ', max: 125 }
});
const defMeta = () => ({ tienda: '', cats: Object.fromEntries(Object.keys(CATS).map(id => [id, defMetaCat(id)])) });
const defExp = () => ({ attr: 'categoria_prod', enc: 'cp1252', incF: false, excL: false, incIA: false, incRel: true });
const TITLE_MAX = 150; // Límite del título para Google Merchant Center (criterio de la herramienta)
const ALT_BAD_START_RE = /^(imagen|foto|fotograf[ií]a)\b/i; // El alt no debe empezar con «imagen de» o «foto de»
const COMERCIAL_RE = /\b(compra|comprar|compre|oferta|ofertas|descuento|descuentos|promoci[oó]n|env[ií]o gratis|mejor precio|barato|econ[oó]mic[oa])\b/i;
function scanRed(text, catId) {
  const f = [];
  RED.forEach(([re, name]) => { if (re.test(text)) f.push(name); });
  if (catId === 'cos') COS_CLAIM.forEach(([re, name]) => { if (re.test(text)) f.push(name); });
  return f;
}

function renderMetaTpl(tpl, sep, tokens) {
  const lines = String(tpl || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const out = [], unknown = new Set(), skipped = [];
  const dotSep = /^\s*\./.test(sep || '');
  for (const line of lines) {
    let anyReq = false, allEmpty = true;
    let txt = line.replace(/\{(\w+)(?::(lc|o))?\}/g, (m, k, mod) => {
      if (!(k in tokens)) { unknown.add(k); return ''; }
      let val = tokens[k] || '';
      if (val && mod === 'lc') val = lc(val);
      if (mod !== 'o') { anyReq = true; if (val) allEmpty = false; }
      return val;
    });
    if (anyReq && allEmpty) { skipped.push(line); continue; }
    txt = txt.replace(/\(\s*\)/g, '').replace(/\s+/g, ' ')
      .replace(/(\s*[\/,\-–]\s*)+$/, '').replace(/^(\s*[\/,\-–]\s*)+/, '')
      .replace(/\s+(por|de|con|en)$/i, '').trim();
    if (dotSep) txt = txt.replace(/\.+$/, '');
    if (txt) out.push(txt); else skipped.push(line);
  }
  let text = out.join(sep == null ? ' ' : sep);
  if (dotSep && text && !/[.!?]$/.test(text)) text += '.';
  return { text: text.trim(), unknown: [...unknown], skipped, blocks: lines.length };
}

/* Versión corta de un meta title que supera el límite: se omite primero el bloque de la tienda y luego los últimos bloques,
 * de atrás hacia adelante. Nunca se corta una palabra ni se quita el primer bloque. Solo devuelve algo si así llega al límite. */
function shortenMeta(tpl, sep, tokens, max) {
  const lines = String(tpl || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!max || lines.length < 2) return null;
  const render = idx => renderMetaTpl(idx.map(i => lines[i]).join('\n'), sep, tokens);
  const isStore = i => /\{tienda(?::\w+)?\}/.test(lines[i]);
  const rest = lines.map((_, i) => i).slice(1);
  const order = [...rest.filter(isStore), ...rest.filter(i => !isStore(i)).reverse()];
  let keep = lines.map((_, i) => i);
  const dropped = [];
  for (const i of order) {
    if (render(keep).text.length <= max) break;
    keep = keep.filter(x => x !== i);
    const shown = render([i]).text;
    if (shown) dropped.push(shown);
  }
  const r = render(keep);
  if (!dropped.length || !r.text || r.text.length > max) return null;
  return { text: r.text, len: r.text.length, dropped };
}

function buildMeta(c, v, title, cfg, tienda, flags) {
  const conf = cfg || defMetaCat(c.id);
  const tokens = { titulo: title.title, categoria: c.name, tienda: (tienda || '').trim(), receta_txt: v.receta === 'si' ? 'con receta médica' : '' };
  const dv = dedupeFields(v);
  c.fields.forEach(fd => { tokens[fd.key] = dv[fd.key] || ''; });
  /* {seg1} a {seg4} son los segmentos del título que sí tienen texto, en orden: un segmento opcional vacío (por ejemplo el sabor) no deja un hueco. */
  const segTexts = title.segs.map(x => x && x.text).filter(Boolean);
  for (let i = 1; i <= 4; i++) tokens['seg' + i] = segTexts[i - 1] || '';
  const out = {}, warns = [];
  [['mt', 'Meta title'], ['md', 'Meta description'], ['alt', 'Alt de imagen']].forEach(([k, label]) => {
    const t = conf[k] || { tpl: '', sep: ' ', max: 0 };
    const r = renderMetaTpl(t.tpl, t.sep, tokens);
    const max = Number(t.max) || 0;
    let text = r.text, shortInfo = null, shortened = false;
    if (k === 'mt' && max && text.length > max) {
      shortInfo = shortenMeta(t.tpl, t.sep, tokens, max);
      if (shortInfo && ((flags && flags.mtShort) || t.auto)) { text = shortInfo.text; shortened = true; }
    }
    out[k] = { text, len: text.length, max, over: !!(max && text.length > max), unknown: r.unknown, skipped: r.skipped, blocks: r.blocks };
    if (shortInfo) out[k].short = shortInfo;
    if (shortened) { out[k].shortened = true; out[k].original = r.text; out[k].autoShort = !!t.auto && !(flags && flags.mtShort); }
    if (r.unknown.length) warns.push(`${label}: token desconocido ${r.unknown.map(x => '{' + x + '}').join(', ')}.`);
    if (out[k].over) warns.push(`${label}: ${r.text.length} caracteres, supera el límite de ${max}.`);
    const red = (k === 'alt' || !conf.confirmed) ? scanRed(r.text, c.id) : [];
    if (red.length) warns.push(`${label}: contiene «${red.join('», «')}».`);
    if (k === 'alt' && ALT_BAD_START_RE.test(r.text)) warns.push('Alt de imagen: no empieces con "imagen de" o "foto de". El lector de pantalla ya lo anuncia.');
    if (k !== 'alt' && c.id === 'med' && !conf.confirmed && COMERCIAL_RE.test(r.text)) warns.push(`${label}: lenguaje comercial en un medicamento. Confirma con Regulatorio que sea aceptable.`);
  });
  out.warns = warns;
  out.notes = out.mt.shortened ? [`Meta title acortado: se omitió ${out.mt.short.dropped.map(x => '«' + x + '»').join(', ')}.`] : [];
  out.confirmed = !!conf.confirmed;
  return out;
}

/* ---------- Formato Batch de Magento (104 columnas, mismo orden que el archivo de carga) ---------- */
const MAG_HEADER = [
  'sku', 'store_view_code', 'attribute_set_code', 'product_type', 'categories', 'product_websites', 'name', 'description',
  'short_description', 'weight', 'product_online', 'tax_class_name', 'visibility', 'price', 'special_price', 'special_price_from_date',
  'special_price_to_date', 'url_key', 'meta_title', 'meta_keywords', 'meta_description', 'base_image', 'base_image_label', 'small_image',
  'small_image_label', 'thumbnail_image', 'thumbnail_image_label', 'swatch_image', 'swatch_image_label', 'created_at', 'updated_at', 'new_from_date',
  'new_to_date', 'display_product_options_in', 'map_price', 'msrp_price', 'map_enabled', 'gift_message_available', 'custom_design', 'custom_design_from',
  'custom_design_to', 'custom_layout_update', 'page_layout', 'product_options_container', 'msrp_display_actual_price_type', 'country_of_manufacture', 'additional_attributes', 'qty',
  'out_of_stock_qty', 'use_config_min_qty', 'is_qty_decimal', 'allow_backorders', 'use_config_backorders', 'min_cart_qty', 'use_config_min_sale_qty', 'max_cart_qty',
  'use_config_max_sale_qty', 'is_in_stock', 'notify_on_stock_below', 'use_config_notify_stock_qty', 'manage_stock', 'use_config_manage_stock', 'use_config_qty_increments', 'qty_increments',
  'use_config_enable_qty_inc', 'enable_qty_increments', 'is_decimal_divided', 'website_id', 'deferred_stock_update', 'use_config_deferred_stock_update', 'related_skus', 'related_position',
  'crosssell_skus', 'crosssell_position', 'upsell_skus', 'upsell_position', 'additional_images', 'additional_image_labels', 'hide_from_product_page', 'custom_options',
  'giftcard_type', 'giftcard_allow_open_amount', 'giftcard_open_amount_min', 'giftcard_open_amount_max', 'giftcard_amount', 'use_config_is_redeemable', 'giftcard_is_redeemable', 'use_config_lifetime',
  'giftcard_lifetime', 'use_config_allow_message', 'giftcard_allow_message', 'use_config_email_template', 'giftcard_email_template', 'bundle_price_type', 'bundle_sku_type', 'bundle_price_view',
  'bundle_weight_type', 'bundle_values', 'bundle_shipment_type', 'configurable_variations', 'configurable_variation_labels', 'downloadable_links', 'downloadable_samples', 'associated_skus'
];
const MAG_ONES = ['product_online', 'use_config_min_qty', 'use_config_min_sale_qty', 'use_config_max_sale_qty', 'use_config_notify_stock_qty', 'use_config_manage_stock'];
const MAG_IDX = Object.fromEntries(MAG_HEADER.map((h, i) => [h, i]));

/* Contrato de exportación Magento:
 * - La coma separa columnas.
 * - Los campos de texto generados por la ficha no contienen comas internas.
 * - Los campos multivalor reservan '|' como separador interno explícito.
 * - Los saltos de línea internos se eliminan de las celdas.
 * - Antes de descargar se valida que cada fila conserve exactamente el mismo número de columnas.
 * Esto evita depender del escape CSV para textos normales y deja el CSV más predecible para el flujo de carga.
 */
const MAG_CONTRACT = { fieldSeparator: ',', multiValueSeparator: '|', requireFixedColumns: true, forbidInternalComma: true, forbidInternalNewline: true };
const MAG_MULTI_FIELDS = new Set(['categories', 'product_websites', 'related_skus', 'related_position', 'crosssell_skus', 'crosssell_position', 'upsell_skus', 'upsell_position', 'additional_images', 'additional_image_labels']);
const sanitizeMagentoCell = (value, key) => {
  let s = String(value ?? '');
  s = s.replace(/[\r\n]+/g, ' ').replace(/[\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (MAG_MULTI_FIELDS.has(key)) s = s.replace(/\s*,\s*/g, MAG_CONTRACT.multiValueSeparator);
  else s = s.replace(/,/g, ';');
  return s;
};
const sanitizeMagentoRow = row => row.map((v, i) => sanitizeMagentoCell(v, MAG_HEADER[i]));
function validateMagentoExport(ex) {
  const errors = [];
  if (!ex || !Array.isArray(ex.header) || ex.header.length !== MAG_HEADER.length) errors.push(`Cabecera Magento: se esperaban ${MAG_HEADER.length} columnas.`);
  (ex?.rows || []).forEach((row, ri) => {
    if (!Array.isArray(row) || row.length !== MAG_HEADER.length) errors.push(`Fila ${ri + 2}: tiene ${row?.length || 0} columnas; se esperaban ${MAG_HEADER.length}.`);
    (row || []).forEach((v, ci) => {
      const s = String(v ?? '');
      if (MAG_CONTRACT.forbidInternalNewline && /[\r\n]/.test(s)) errors.push(`Fila ${ri + 2}, ${MAG_HEADER[ci] || ci + 1}: contiene salto de línea.`);
      if (MAG_CONTRACT.forbidInternalComma && !MAG_MULTI_FIELDS.has(MAG_HEADER[ci]) && s.includes(',')) errors.push(`Fila ${ri + 2}, ${MAG_HEADER[ci] || ci + 1}: contiene coma interna.`);
    });
  });
  return { ok: errors.length === 0, errors };
}

/* Quién puede recomendarse como complemento. Fuera de medicamentos cualquier producto. Un medicamento solo si declaró
   que no requiere receta y que no es de alta especialidad; sin declarar cuenta como no elegible. */
const complementEligible = (cat, v) => cat !== 'med' || (!!v && v.receta === 'no' && v.especialidad === 'no');

/* ---------- Productos relacionados, alternativas e insumos compatibles ----------
 * Solo con productos del mismo lote y con reglas fijas:
 * - Alternativas (upsell_skus): medicamento con el mismo principio activo, concentración, forma y presentación, y la misma
 *   condición de receta, de otra marca. Una concentración o presentación distinta nunca es alternativa.
 * - Relacionados (related_skus): misma categoría y la misma marca, o el mismo laboratorio o fabricante, que no sean alternativas.
 * - Compatibles (crosssell_skus): los SKU que la persona capturó en «compat». Nunca se deducen, y solo los productos elegibles
 *   como complemento (ver complementEligible) pueden aparecer. */
const REL_MAX = 4;
const relKey = x => String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const relSet = x => relKey(x).split(' ').filter(Boolean).sort().join(' ');
function relations(entries) {
  const list = entries.filter(e => e && e.sku).map(e => {
    const v = e.v || {};
    return { sku: e.sku, cat: e.cat, elig: complementEligible(e.cat, v), marca: relKey(v.marca), org: relKey(v.laboratorio || v.fabricante), compat: String(v.compat || ''),
      alt: e.cat === 'med' && v.principio && v.concentracion && v.forma && v.contenido && v.receta
        ? [relSet(v.principio), relKey(join(' / ', v.concentracion, v.volumen)), relKey(v.forma), relKey(v.contenido), v.receta].join('|') : '' };
  });
  const bySku = new Map(list.map(e => [e.sku.toLowerCase(), e]));
  const out = new Map();
  for (const e of list) {
    const others = list.filter(o => o.sku.toLowerCase() !== e.sku.toLowerCase());
    const upsell = e.alt ? others.filter(o => o.alt === e.alt && o.marca !== e.marca) : [];
    const used = new Set(upsell.map(o => o.sku.toLowerCase()));
    const related = others.filter(o => o.cat === e.cat && !used.has(o.sku.toLowerCase()) && ((e.marca && o.marca === e.marca) || (e.org && o.org === e.org)))
      .sort((a, b) => (b.marca === e.marca) - (a.marca === e.marca));
    const cross = [...new Set(e.compat.split(/[\s,;|]+/).filter(Boolean).map(x => x.toLowerCase()))]
      .filter(k => k !== e.sku.toLowerCase() && bySku.has(k) && bySku.get(k).elig).map(k => bySku.get(k));
    const by = (a, b) => a.sku.localeCompare(b.sku);
    out.set(e.sku.toLowerCase(), {
      upsell: upsell.sort(by).slice(0, REL_MAX).map(o => o.sku),
      related: related.slice(0, REL_MAX).map(o => o.sku),
      crosssell: cross.map(o => o.sku)
    });
  }
  return out;
}

function magentoBatch(items, keep, metaCfg, opts) {
  const ex = { sinSku: 0, bloqueadas: 0, faltantes: 0, lenguaje: 0, duplicadas: 0, sinMeta: 0, sinImagen: 0, altLargos: 0, mtLargos: 0, mtCortos: 0, ia: 0 };
  const bySku = new Map(), entries = new Map();
  const attr = String(opts.attr || '').trim() || 'categoria_prod';
  for (const it of items) {
    const sku = String(it.sku || '').trim();
    if (!sku) { ex.sinSku++; continue; }
    if (!opts.incIA && Object.values(it.ai || {}).some(v => v === 'sugerido' || v === 'imagen')) { ex.ia++; continue; }
    const res = computeFor(it.cat, it.v, keep, metaCfg, { mtShort: !!it.mtShort });
    if (res.mg.blocked) { ex.bloqueadas++; continue; }
    if (res.title.missing.length && !opts.incFaltantes) { ex.faltantes++; continue; }
    if (opts.excLenguaje) { const L = lint(res.c, it.v); if (langCount(L)) { ex.lenguaje++; continue; } }
    const row = new Array(MAG_HEADER.length).fill('');
    const set = (k, val) => { row[MAG_IDX[k]] = sanitizeMagentoCell(val, k); };
    set('sku', sku);
    set('description', res.mg.html.replace(/\n\s*/g, ''));
    if (res.meta.confirmed) {
      set('short_description', res.meta.md.text);
      set('meta_title', res.meta.mt.text);
      if (res.meta.mt.over) ex.mtLargos++;
      if (res.meta.mt.shortened) ex.mtCortos++;
      set('meta_description', res.meta.md.text);
    } else ex.sinMeta++;
    MAG_ONES.forEach(k => set(k, '1'));
    set('additional_attributes', `${attr}=${res.title.title}`);
    if (res.meta.alt.text) { set('base_image_label', res.meta.alt.text); if (res.meta.alt.over) ex.altLargos++; }
    const img = String(it.img || '').trim();
    if (img) set('base_image', img); else ex.sinImagen++;
    const key = sku.toLowerCase();
    if (bySku.has(key)) ex.duplicadas++;
    bySku.set(key, row);
    entries.set(key, { sku, cat: it.cat, v: { ...res.vt.v, compat: it.v && it.v.compat } });
  }
  const rel = { upsell: 0, related: 0, crosssell: 0 };
  if (opts.relations) {
    const map = relations([...entries.values()]);
    for (const [key, row] of bySku) {
      const r = map.get(key);
      if (!r) continue;
      /* Complementos confirmados en el catálogo interno: solo si el SKU va en este archivo o ya se exportó antes. */
      const extra = ((opts.catalogCross && opts.catalogCross.get(key)) || []).filter(c => bySku.has(c.toLowerCase()) || (opts.knownSkus && opts.knownSkus.has(c.toLowerCase())));
      const cross = [...new Set([...r.crosssell, ...extra])];
      const vals = { upsell: r.upsell, related: r.related, crosssell: cross };
      [['upsell_skus', 'upsell'], ['related_skus', 'related'], ['crosssell_skus', 'crosssell']].forEach(([col, k]) => {
        if (vals[k].length) { row[MAG_IDX[col]] = sanitizeMagentoCell(vals[k].join(','), col); rel[k]++; }
      });
    }
  }
  const rows = [...bySku.values()].map(sanitizeMagentoRow);
  return { header: MAG_HEADER, rows, excluded: ex, relations: rel, total: items.length, contract: validateMagentoExport({ header: MAG_HEADER, rows }) };
}
const batchCsv = ex => {
  const check = ex.contract || validateMagentoExport(ex);
  if (!check.ok) throw new Error('Exportación Magento inválida: ' + check.errors.join(' | '));
  return toSheet([MAG_HEADER, ...ex.rows], MAG_CONTRACT.fieldSeparator, '\r\n') + '\r\n';
};

const CP1252_EXTRA = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8A, '‹': 0x8B, 'Œ': 0x8C, 'Ž': 0x8E, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9A, '›': 0x9B, 'œ': 0x9C, 'ž': 0x9E, 'Ÿ': 0x9F };
function encodeCp1252(str) {
  const bytes = []; let lost = 0;
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    if (cp < 0x80 || (cp >= 0xA0 && cp <= 0xFF)) bytes.push(cp);
    else if (CP1252_EXTRA[ch] != null) bytes.push(CP1252_EXTRA[ch]);
    else { bytes.push(0x3F); lost++; }
  }
  return { bytes: new Uint8Array(bytes), lost };
}

/* ---------- Extracción de datos crudos por reglas (sin IA) ---------- */
/* Copia solo lo que aparece en el texto. Marca, laboratorio y principio activo salen de los diccionarios del usuario. */
const FOLD_FROM = 'áàäâéèëêíìïîóòöôúùüûñÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑ';
const FOLD_TO = 'aaaaeeeeiiiioooouuuunAAAAEEEEIIIIOOOOUUUUN';
const fold = s => String(s ?? '').replace(/[áàäâéèëêíìïîóòöôúùüûñÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑ]/g, c => FOLD_TO[FOLD_FROM.indexOf(c)]);
const escRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function parseDic(text) {
  const out = [];
  String(text || '').split(/[\r\n;]+/).map(l => l.trim()).filter(Boolean).forEach(l => {
    const i = l.indexOf('=');
    const alias = (i >= 0 ? l.slice(0, i) : l).trim(), canon = (i >= 0 ? l.slice(i + 1) : l).trim();
    if (alias) out.push({ alias, canon: canon || alias });
  });
  return out.sort((a, b) => b.alias.length - a.alias.length);
}

function makeScanner(text) {
  const f = fold(text), used = new Array(text.length).fill(false);
  const find = (re, mark = true) => {
    if (!re.global) throw new Error('La expresión debe ser global');
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(f))) {
      if (m[0] === '') { re.lastIndex++; continue; }
      const s = m.index, e = s + m[0].length;
      let clash = false;
      for (let i = s; i < e; i++) if (used[i]) { clash = true; break; }
      if (!clash) { if (mark) for (let i = s; i < e; i++) used[i] = true; return { s, e, text: text.slice(s, e), f: f.slice(s, e), m }; }
    }
    return null;
  };
  return { f, text, used, find };
}

const NUM = '\\d+(?:[.,]\\d+)?';
const UNIT = '(?:mg|mcg|ug|gr|grs|g|ui|iu|ml|l|%)';
const mkDoseRe = () => new RegExp(`${NUM}\\s*${UNIT}(?![a-z0-9])(?:\\s*\\/\\s*(?:${NUM}\\s*)?${UNIT}(?![a-z0-9]))*`, 'gi');
const CONT = '(?:caj(?:a)?|fco|frasco|blister|blis|sobres?|estuche|tubo|bolsa|botella|bote|tarro|lata|pouch|display|vial)';
const NOUN = '(?:tab(?:s|letas?)?|caps?(?:ulas?)?|comp(?:rimidos?)?|pzas?|pz|piezas?|amp(?:olletas?)?|plumas?|sobres?|grag(?:eas?)?|parches?|tiras?|lancetas?|gomitas?|ovulos?|supositorios?|unidades|unidad|pastillas?|perlas?|softgels?|sachets?|barras?|shots?|chicles?|porciones|viales?)';
const LIBS = '(?:\\s+(?:de\\s+)?(?:lib(?:eracion)?\\.?\\s*)?(?:prolongada|retardada|modificada))?';
const mkPiecesRe = () => new RegExp(`(?:\\b${CONT}\\.?\\s*)?(?:\\bc\\/\\s*|\\bx\\s*|\\bcon\\s+)\\d+(?:\\s*${NOUN}\\b\\.?${LIBS})?|\\b\\d+\\s*${NOUN}\\b\\.?${LIBS}`, 'gi');
const MASS_UNITS = new Set(['mg', 'mcg', 'ug', 'g', 'gr', 'grs', 'ui', 'iu', '%']);
const VOL_UNITS = new Set(['ml', 'l']);

const FORMS = [
  [/\b(?:tab(?:s|letas?)?|comp(?:rimidos?)?)\.?\s*mast(?:icables?)?\b\.?/gi, 'Tableta masticable', 0],
  [/\b(?:tab(?:s|letas?)?|comp(?:rimidos?)?)\.?\s*efervesc(?:entes?)?\b\.?|\befervescentes?\b/gi, 'Tableta efervescente', 0],
  [/\b(?:tab(?:s|letas?)?|comp(?:rimidos?)?)\.?\s*sublingual(?:es)?\b/gi, 'Tableta sublingual', 1],
  [/\bcaps?(?:ulas?)?\.?\s*blandas?\b|\bsoftgels?\b|\bperlas?\b/gi, 'Cápsula blanda', 0],
  [/\bcaps?(?:ulas?)?\.?\s*(?:vegetales?|veg)\b/gi, 'Cápsula vegetal', 0],
  [/\bsol(?:ucion)?\.?\s*iny(?:ectable)?\b\.?/gi, 'Solución inyectable', 1],
  [/\bsusp(?:ension)?\.?\s*iny(?:ectable)?\b\.?/gi, 'Suspensión inyectable', 1],
  [/\bsol(?:ucion)?\.?\s*oral\b/gi, 'Solución oral', 1],
  [/\bsusp(?:ension)?\.?\s*oral\b/gi, 'Suspensión oral', 1],
  [/\bsol(?:ucion)?\.?\s*(?:oft|oftalmica)\b\.?/gi, 'Solución oftálmica', 1],
  [/\bsusp(?:ension)?\b\.?/gi, 'Suspensión', 1],
  [/\bsol(?:ucion)?\b\.?/gi, 'Solución', 1],
  [/\btab(?:s|letas?)?\b\.?/gi, 'Tableta', 1],
  [/\bcomp(?:rimidos?)?\b\.?/gi, 'Comprimido', 1],
  [/\bcaps?(?:ulas?)?\b\.?/gi, 'Cápsula', 1],
  [/\bgrag(?:eas?)?\b\.?/gi, 'Gragea', 1],
  [/\b(?:jbe|jarabe)\b\.?/gi, 'Jarabe', 1],
  [/\bamp(?:olletas?)?\b\.?/gi, 'Ampolleta', 1],
  [/\bgotas\b/gi, 'Gotas', 1],
  [/\bsupositorios?\b/gi, 'Supositorio', 1],
  [/\bovulos?\b/gi, 'Óvulo', 1],
  [/\bung(?:uento)?\b\.?/gi, 'Ungüento', 1],
  [/\bgomitas?\b/gi, 'Gomita', 0],
  [/\bpolvo\b/gi, 'Polvo', 0],
  [/\bliquido\b/gi, 'Líquido', 0],
  [/\bshots?\b/gi, 'Shot', 0],
  [/\bbarras?\b/gi, 'Barra', 0],
  [/\bchicles?\b/gi, 'Chicle', 0],
  [/\bpastillas?\b/gi, 'Pastilla', 0],
  [/\bgranulado\b/gi, 'Granulado', 0],
  [/\b(?:spray|aerosol)\b/gi, 'Spray', 0],
  [/\baceite\b/gi, 'Aceite', 0],
  [/\bemulsion\b/gi, 'Emulsión', 0],
  [/\bcrema\b/gi, 'Crema', 0],
  [/\bgel\b/gi, 'Gel', 0]
];
const FORM_PLURAL = { 'Tableta': 'tabletas', 'Comprimido': 'comprimidos', 'Cápsula': 'cápsulas', 'Gragea': 'grageas', 'Ampolleta': 'ampolletas', 'Supositorio': 'supositorios', 'Óvulo': 'óvulos', 'Gomita': 'gomitas', 'Tableta masticable': 'tabletas masticables', 'Tableta efervescente': 'tabletas efervescentes', 'Tableta sublingual': 'tabletas sublinguales', 'Cápsula blanda': 'cápsulas blandas', 'Cápsula vegetal': 'cápsulas vegetales', 'Pastilla': 'pastillas', 'Chicle': 'chicles', 'Barra': 'barras', 'Shot': 'shots' };
const VIAS = [
  [/\boral\b/gi, 'Oral'], [/\bsubcut(?:anea)?\b|\bs\.?c\.?(?![a-z0-9])/gi, 'Subcutánea'], [/\bintramuscular\b/gi, 'Intramuscular'],
  [/\bintravenosa\b|\bendovenosa\b/gi, 'Intravenosa'], [/\btopic[oa]\b/gi, 'Tópica'], [/\boftalmica\b/gi, 'Oftálmica'],
  [/\bnasal\b/gi, 'Nasal'], [/\bsublingual\b/gi, 'Sublingual'], [/\brectal\b/gi, 'Rectal'], [/\bvaginal\b/gi, 'Vaginal'], [/\binhalada\b/gi, 'Inhalada']
];
const TYPE_DICT = {
  dis: { key: 'tipo', list: [[/\bpulsioximetro\b/gi, 'Pulsioxímetro'], [/\besfigmomanometro\b/gi, 'Esfigmomanómetro'], [/\bestetoscopio\b/gi, 'Estetoscopio'], [/\btiras reactivas\b/gi, 'Tiras reactivas'], [/\blancetas\b/gi, 'Lancetas'], [/\blancetero\b/gi, 'Lancetero'], [/\bbascula(?: digital)?\b/gi, 'Báscula'], [/\bhumidificador\b/gi, 'Humidificador'], [/\bvaporizador\b/gi, 'Vaporizador'], [/\baspirador nasal\b/gi, 'Aspirador nasal'], [/\b(?:electroestimulador|tens)\b/gi, 'Electroestimulador'], [/\bmasajeador\b/gi, 'Masajeador'], [/\bbaumanometro\b/gi, 'Baumanómetro'], [/\btensiometro\b/gi, 'Tensiómetro'], [/\bglucometro\b/gi, 'Glucómetro'], [/\btermometro\b/gi, 'Termómetro'], [/\boximetro\b/gi, 'Oxímetro'], [/\bnebulizador\b/gi, 'Nebulizador'], [/\binhalocamara\b/gi, 'Inhalocámara']] },
  cos: { key: 'tipo', list: [[/\bbalsamo labial\b/gi, 'Bálsamo labial'], [/\bprotector labial\b/gi, 'Protector labial'], [/\bleche limpiadora\b/gi, 'Leche limpiadora'], [/\bdesmaquillante\b/gi, 'Desmaquillante'], [/\bexfoliante\b/gi, 'Exfoliante'], [/\baceite\b/gi, 'Aceite'], [/\bbruma\b/gi, 'Bruma'], [/\bfluido\b/gi, 'Fluido'], [/\bcrema para ojos\b/gi, 'Contorno de ojos'], [/\b(?:gel de ducha|gel de bano)\b/gi, 'Gel de baño'], [/\bcrema hidratante\b/gi, 'Crema hidratante'], [/\bcrema facial\b/gi, 'Crema facial'], [/\bcrema corporal\b/gi, 'Crema corporal'], [/\bcrema de manos\b/gi, 'Crema de manos'], [/\bgel limpiador\b/gi, 'Gel limpiador'], [/\bgel facial\b/gi, 'Gel facial'], [/\bespuma limpiadora\b/gi, 'Espuma limpiadora'], [/\bagua micelar\b/gi, 'Agua micelar'], [/\blocion hidratante\b/gi, 'Loción hidratante'], [/\blocion corporal\b/gi, 'Loción corporal'], [/\bemulsion hidratante\b/gi, 'Emulsión hidratante'], [/\bserum\b/gi, 'Sérum'], [/\bprotector solar\b/gi, 'Protector solar'], [/\bcontorno de ojos\b/gi, 'Contorno de ojos'], [/\bcrema\b/gi, 'Crema'], [/\bgel\b/gi, 'Gel'], [/\blocion\b/gi, 'Loción'], [/\bemulsion\b/gi, 'Emulsión'], [/\bbalsamo\b/gi, 'Bálsamo'], [/\bmascarilla\b/gi, 'Mascarilla'], [/\btonico\b/gi, 'Tónico'], [/\blimpiador\b/gi, 'Limpiador']] },
  hig: { key: 'producto', list: [[/\bjabon liquido\b/gi, 'Jabón líquido'], [/\bgel antibacterial\b/gi, 'Gel antibacterial'], [/\bacondicionador\b/gi, 'Acondicionador'], [/\btoallas sanitarias\b/gi, 'Toallas sanitarias'], [/\btampones\b/gi, 'Tampones'], [/\bprotectores? diarios?\b/gi, 'Protectores diarios'], [/\bpanales\b/gi, 'Pañales'], [/\balgodon\b/gi, 'Algodón'], [/\bcotonetes\b/gi, 'Cotonetes'], [/\brastrillo\b/gi, 'Rastrillo'], [/\brepelente\b/gi, 'Repelente'], [/\btalco\b/gi, 'Talco'], [/\bpreservativos?\b/gi, 'Preservativos'], [/\bpasta dental\b|\bcrema dental\b/gi, 'Pasta dental'], [/\b(?:shampoo|champu)\b/gi, 'Shampoo'], [/\bdesodorante\b/gi, 'Desodorante'], [/\bjabon\b/gi, 'Jabón'], [/\benjuague bucal\b/gi, 'Enjuague bucal'], [/\bcepillo dental\b/gi, 'Cepillo dental'], [/\bhilo dental\b/gi, 'Hilo dental'], [/\btoallas humedas\b/gi, 'Toallas húmedas']] },
  acc: { key: 'producto', list: [[/\brodillera\b/gi, 'Rodillera'], [/\btobillera\b/gi, 'Tobillera'], [/\bcollarin\b/gi, 'Collarín'], [/\bcabestrillo\b/gi, 'Cabestrillo'], [/\bmuletas?\b/gi, 'Muletas'], [/\bbaston\b/gi, 'Bastón'], [/\bplantillas?\b/gi, 'Plantillas'], [/\bmedias de compresion\b/gi, 'Medias de compresión'], [/\bpastillero\b/gi, 'Pastillero'], [/\bguantes\b/gi, 'Guantes'], [/\bbolsa para hielo\b/gi, 'Bolsa para hielo'], [/\bparches? termicos?\b/gi, 'Parches térmicos'], [/\bvenda\b/gi, 'Venda'], [/\bfaja\b/gi, 'Faja'], [/\bmunequera\b/gi, 'Muñequera'], [/\bbolsa termica\b/gi, 'Bolsa térmica'], [/\b(?:cubrebocas|tapabocas)\b/gi, 'Cubrebocas']] },
  beb: { key: 'tipo', list: [[/\bnutricion oral\b/gi, 'Nutrición oral'], [/\bbebida (?:de )?proteina\b/gi, 'Bebida de proteína'], [/\bbebida deportiva\b/gi, 'Bebida deportiva'], [/\bbebida con electrolitos\b/gi, 'Bebida con electrolitos'], [/\bagua alcalina\b/gi, 'Agua alcalina'], [/\bagua\b/gi, 'Agua'], [/\bjugo\b/gi, 'Jugo'], [/\bleche\b/gi, 'Leche'], [/\bformula infantil\b/gi, 'Fórmula infantil'], [/\bsuero oral\b/gi, 'Suero oral'], [/\bbebida (?:hidratante|isotonica)\b/gi, 'Bebida hidratante'], [/\bisotonica\b/gi, 'Bebida isotónica'], [/\brehidratante\b/gi, 'Bebida rehidratante']] },
  sup: { key: 'componente', list: [[/\bcolageno hidrolizado\b/gi, 'Colágeno hidrolizado'], [/\bacido folico\b/gi, 'Ácido fólico'], [/\bcoenzima q ?10\b/gi, 'Coenzima Q10'], [/\bcalcio\b/gi, 'Calcio'], [/\bhierro\b/gi, 'Hierro'], [/\bbiotina\b/gi, 'Biotina'], [/\bashwagandha\b/gi, 'Ashwagandha'], [/\bcurcuma\b/gi, 'Cúrcuma'], [/\bfibra\b/gi, 'Fibra'], [/\bglutamina\b/gi, 'Glutamina'], [/\bprebioticos?\b/gi, 'Prebiótico'], [/\blecitina\b/gi, 'Lecitina'], [/\bluteina\b/gi, 'Luteína'], [/\b(?:espirulina|spirulina)\b/gi, 'Espirulina'], [/\bjengibre\b/gi, 'Jengibre'], [/\bginkgo(?: biloba)?\b/gi, 'Ginkgo biloba'], [/\bvaleriana\b/gi, 'Valeriana'], [/\bpotasio\b/gi, 'Potasio'], [/\bselenio\b/gi, 'Selenio'], [/\bl-?carnitina\b/gi, 'L-carnitina'], [/\bbcaa\b/gi, 'BCAA'], [/\baminoacidos\b/gi, 'Aminoácidos'], [/\b(?:proteina whey|whey)\b/gi, 'Proteína whey'], [/\belectrolitos\b/gi, 'Electrolitos'], [/\bvitamina [a-z]\d*\b/gi, null], [/\bomega ?-?3\b/gi, 'Omega 3'], [/\bcolageno\b/gi, 'Colágeno'], [/\bprobioticos?\b/gi, 'Probiótico'], [/\bmultivitaminico\b/gi, 'Multivitamínico'], [/\bmagnesio\b/gi, 'Magnesio'], [/\bzinc\b/gi, 'Zinc'], [/\bmelatonina\b/gi, 'Melatonina'], [/\bcreatina\b/gi, 'Creatina'], [/\bproteina\b/gi, 'Proteína']] }
};
/* Sugerencias para los campos de texto (lista de ayuda: se puede escribir cualquier valor). */
const FORM_SUG = {
  med: ['Tableta', 'Tableta de liberación prolongada', 'Tableta masticable', 'Tableta efervescente', 'Tableta sublingual', 'Comprimido', 'Cápsula', 'Cápsula blanda', 'Gragea', 'Solución inyectable', 'Suspensión inyectable', 'Solución oral', 'Suspensión oral', 'Jarabe', 'Gotas', 'Solución oftálmica', 'Ungüento', 'Crema', 'Gel', 'Supositorio', 'Óvulo', 'Polvo', 'Parche', 'Spray', 'Ampolleta'],
  sup: ['Cápsulas', 'Cápsulas blandas', 'Cápsulas vegetales', 'Tabletas', 'Tabletas masticables', 'Tabletas efervescentes', 'Gomitas', 'Polvo', 'Polvo para preparar bebida', 'Líquido', 'Gotas', 'Shot', 'Barra', 'Chicle', 'Pastillas', 'Sobres', 'Spray', 'Aceite', 'Jarabe', 'Granulado', 'Perlas']
};
const FLAVORS = [['coco', 'Coco'], ['fresa', 'Fresa'], ['limon', 'Limón'], ['naranja', 'Naranja'], ['uva', 'Uva'], ['manzana', 'Manzana'], ['mora azul', 'Mora azul'], ['mora', 'Mora'], ['menta', 'Menta'], ['vainilla', 'Vainilla'], ['chocolate', 'Chocolate'], ['mango', 'Mango'], ['pina', 'Piña'], ['durazno', 'Durazno'], ['sandia', 'Sandía'], ['maracuya', 'Maracuyá'], ['cereza', 'Cereza'], ['toronja', 'Toronja'], ['mandarina', 'Mandarina'], ['jamaica', 'Jamaica'], ['tamarindo', 'Tamarindo'], ['frutos rojos', 'Frutos rojos'], ['frutos del bosque', 'Frutos del bosque'], ['platano', 'Plátano'], ['cafe', 'Café'], ['caramelo', 'Caramelo'], ['galleta', 'Galleta'], ['cookies', 'Cookies'], ['moka', 'Moka'], ['citricos', 'Cítricos'], ['guayaba', 'Guayaba'], ['frambuesa', 'Frambuesa'], ['arandano', 'Arándano'], ['lima', 'Lima']];
const BEB_ATTR = [[/\bsin azucar(?:es)?\b/gi, 'Sin azúcar'], [/\bsin lactosa\b/gi, 'Sin lactosa'], [/\bsin gluten\b|\blibre de gluten\b/gi, 'Sin gluten'], [/\bsin calorias\b/gi, 'Sin calorías'], [/\bbajo en sodio\b/gi, 'Bajo en sodio'], [/\bzero\b/gi, 'Zero'], [/\blight\b/gi, 'Light']];
const COS_ACT = [[/\bacido hialuronico\b/gi, 'Ácido hialurónico'], [/\bniacinamida\b/gi, 'Niacinamida'], [/\bretinol\b/gi, 'Retinol'], [/\bceramidas\b/gi, 'Ceramidas'], [/\bpeptidos\b/gi, 'Péptidos'], [/\bacido salicilico\b/gi, 'Ácido salicílico'], [/\bacido glicolico\b/gi, 'Ácido glicólico'], [/\bcentella asiatica\b/gi, 'Centella asiática'], [/\bvitamina c\b/gi, 'Vitamina C']];
const DIS_TECH = [[/\bautomatico de brazo\b/gi, 'Automático de brazo'], [/\bautomatico de muneca\b/gi, 'Automático de muñeca'], [/\bde brazo\b/gi, 'De brazo'], [/\bde muneca\b/gi, 'De muñeca'], [/\binfrarrojo\b/gi, 'Infrarrojo'], [/\bautomatico\b/gi, 'Automático']];
const typeSug = cat => [...new Set(TYPE_DICT[cat].list.map(([, name]) => name).filter(Boolean))];
{
  const put = (cat, key, list) => { const fd = CATS[cat].fields.find(x => x.key === key); if (fd) fd.sug = list; };
  put('med', 'forma', FORM_SUG.med); put('sup', 'forma', FORM_SUG.sup);
  put('sup', 'componente', [...typeSug('sup'), 'Vitamina C', 'Vitamina D3', 'Vitamina B12', 'Vitamina E', 'Omega 3']);
  ['dis', 'cos', 'beb'].forEach(c => put(c, 'tipo', typeSug(c)));
  ['hig', 'acc'].forEach(c => put(c, 'producto', typeSug(c)));
}
const CAT_KW = {
  dis: /\b(baumanometro|tensiometro|glucometro|termometro|oximetro|nebulizador|inhalocamara|estetoscopio|tiras reactivas|lancetas?|lancetero|esfigmomanometro|pulsioximetro|bascula|humidificador|vaporizador|aspirador nasal)\b/i,
  cos: /\b(crema (?:hidratante|facial|corporal|de manos)|gel (?:limpiador|facial)|agua micelar|espuma limpiadora|serum|protector solar|fps|spf|contorno de ojos|mascarilla|limpiador|tonico|acido hialuronico|niacinamida|retinol|ceramidas|locion|emulsion|exfoliante|desmaquillante|balsamo labial|protector labial|bruma)\b/i,
  sup: /\b(vitamina [a-z]|multivitaminico|omega ?-?3|colageno|probioticos?|magnesio|zinc|melatonina|creatina|proteina|gomitas?|calcio|hierro|biotina|ashwagandha|curcuma|colageno hidrolizado|espirulina|glutamina|bcaa|aminoacidos|coenzima q ?10|acido folico|electrolitos|whey)\b/i,
  beb: /\b(suero oral|electrolit|electrolitos|bebida|sabor|isotonica|rehidratante|nutricion oral|agua alcalina|formula infantil|bebida (?:de )?proteina)\b/i,
  hig: /\b(pasta dental|crema dental|shampoo|champu|desodorante|jabon|enjuague bucal|cepillo dental|hilo dental|toallas humedas|acondicionador|gel antibacterial|toallas sanitarias|tampones|panales|cotonetes|rastrillo|repelente|preservativos?|jabon liquido)\b/i,
  acc: /\b(parches? termicos?|venda|faja|munequera|bolsa termica|cubrebocas|tapabocas|rodillera|tobillera|collarin|cabestrillo|muletas?|baston|medias de compresion|pastillero)\b/i
};
const CAT_ORDER = ['dis', 'cos', 'hig', 'beb', 'acc', 'sup', 'med'];
const CAP_TITLE = s => s.toLowerCase().replace(/\b\p{L}/gu, c => c.toUpperCase());

function detectCat(sc) {
  const has = re => !!sc.find(re, false);
  const score = Object.fromEntries(CAT_ORDER.map(c => [c, 0])), why = Object.fromEntries(CAT_ORDER.map(c => [c, []]));
  const add = (c, n, w) => { score[c] += n; why[c].push(w); };
  if (has(mkDoseRe()) && /\d+(?:[.,]\d+)?\s*(?:mg|mcg|ug|ui|iu)\b/i.test(sc.f)) add('med', 2, 'dosis en mg, mcg o UI');
  if (FORMS.some(([re, , med]) => med && has(new RegExp(re.source, 'gi')))) add('med', 2, 'forma farmacéutica');
  if (has(/\b(?:con receta|sin receta|requiere receta|c\/receta|rx|otc)\b/gi)) add('med', 2, 'receta');
  if (VIAS.some(([re]) => has(new RegExp(re.source, 'gi')))) add('med', 1, 'vía de administración');
  Object.entries(CAT_KW).forEach(([c, re]) => { if (re.test(sc.f)) add(c, 3, 'palabras clave'); });
  if (/\bsuplemento\b/i.test(sc.f)) add('sup', 4, 'dice "suplemento"');
  const ranked = CAT_ORDER.map(c => [c, score[c]]).sort((a, b) => b[1] - a[1] || CAT_ORDER.indexOf(a[0]) - CAT_ORDER.indexOf(b[0]));
  if (!ranked[0][1]) return { cat: null, why: [], ambiguous: null };
  const second = ranked[1];
  return { cat: ranked[0][0], why: why[ranked[0][0]], ambiguous: second[1] > 0 && ranked[0][1] - second[1] <= 1 ? second[0] : null };
}

function parseDose(hit) {
  const parts = hit.text.split(/\s*\/\s*/).map(p => {
    const m = p.match(/^(\d+(?:[.,]\d+)?)?\s*([a-zA-Z%]+)$/);
    if (!m) return null;
    const u = m[2].toLowerCase();
    const canon = u === 'ml' ? 'mL' : u === 'l' ? 'L' : (u === 'ui' || u === 'iu') ? 'UI' : (u === 'gr' || u === 'grs') ? 'g' : (u === 'ug') ? m[2] : u;
    return { num: m[1] || '', unit: u, text: `${m[1] ? m[1] + ' ' : ''}${canon}` };
  }).filter(Boolean);
  return { hit, parts, hasMass: parts.some(p => MASS_UNITS.has(p.unit)), lastVol: parts.length > 0 && VOL_UNITS.has(parts[parts.length - 1].unit) };
}

function extractRaw(text, opts) {
  opts = opts || {};
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  const dic = opts.dic || {};
  const sc = makeScanner(raw);
  const notes = [];
  let cat = opts.cat && CATS[opts.cat] ? opts.cat : null, why = [], ambiguous = null;
  if (!raw) return { cat: null, fields: {}, leftover: [], notes, ambiguous: null, why: [] };
  if (!cat) { const d = detectCat(sc); cat = d.cat; why = d.why; ambiguous = d.ambiguous; }
  if (!cat) return { cat: null, fields: {}, leftover: raw.split(' '), notes, ambiguous: null, why: [] };

  const F = {}, labKey = cat === 'med' ? 'laboratorio' : 'fabricante';
  const dicFind = (entries, all) => {
    const hits = [];
    for (const e of entries || []) {
      const re = new RegExp('\\b' + escRe(fold(e.alias)).replace(/\s+/g, '\\s+') + '\\b', 'gi');
      let h;
      while ((h = sc.find(re))) { hits.push(e.canon); if (!all) return hits; }
    }
    return hits;
  };
  // 1) diccionarios del usuario
  const marcas = dicFind(dic.marcas, false); if (marcas.length) F.marca = marcas[0];
  const labs = dicFind(dic.labs, false); if (labs.length) F[labKey] = labs[0];
  if (cat === 'med') { const pa = dicFind(dic.principios, true); if (pa.length) F.principio = [...new Set(pa)].join(', '); }

  // 2) receta (solo si el texto la declara)
  if (sc.find(/\b(?:sin receta|venta libre|otc)\b/gi)) { if (cat === 'med') F.receta = 'no'; }
  else if (sc.find(/\b(?:con receta|requiere receta|c\/receta|c\/rx|rx)\b/gi)) { if (cat === 'med') F.receta = 'si'; }

  // 3) dosis y volúmenes
  const doses = []; let dh; const doseRe = mkDoseRe();
  while ((dh = sc.find(doseRe))) doses.push(parseDose(dh));
  let volContent = null;
  if (cat === 'med') {
    const mi = doses.findIndex(x => x.hasMass);
    if (mi >= 0) {
      const x = doses[mi];
      if (x.parts.length >= 2 && x.lastVol && x.parts[x.parts.length - 1].num) { F.volumen = x.parts[x.parts.length - 1].text; F.concentracion = x.parts.slice(0, -1).map(p => p.text).join(' / '); }
      else F.concentracion = x.parts.map(p => p.text).join(' / ');
    }
    volContent = doses.find((x, i) => i !== mi && !x.hasMass) || null;
    doses.forEach((x, i) => { if (i !== mi && x !== volContent) notes.push(`Dosis sin asignar: ${x.parts.map(p => p.text).join(' / ')}.`); });
  } else {
    volContent = doses[0] || null;
    doses.slice(1).forEach(x => notes.push(`Dosis sin asignar: ${x.parts.map(p => p.text).join(' / ')}.`));
  }
  const withContainer = x => {
    const before = sc.f.slice(0, x.hit.s), m = before.match(/\b(caj(?:a)?|fco|frasco|botella|tubo|bolsa)\.?\s*$/i);
    if (m && !sc.used.slice(before.length - m[0].length, before.length).some(Boolean)) {
      for (let i = before.length - m[0].length; i < before.length; i++) sc.used[i] = true;
      return `${sc.text.slice(before.length - m[0].length, before.length).trim()} ${x.parts.map(p => p.text).join(' / ')}`;
    }
    return x.parts.map(p => p.text).join(' / ');
  };

  // 4) forma farmacéutica (medicamentos y suplementos)
  if (cat === 'med' || cat === 'sup') {
    for (const [re, canon] of FORMS) { if (sc.find(new RegExp(re.source, 'gi'))) { F.forma = canon; break; } }
    if (F.forma && /oral$/i.test(F.forma) && cat === 'med') F.via = 'Oral';
  }
  // 5) vía de administración explícita
  if (cat === 'med' && !F.via) for (const [re, canon] of VIAS) { if (sc.find(new RegExp(re.source, 'gi'))) { F.via = canon; break; } }
  // 6) liberación prolongada
  let lib = '';
  if (F.forma) {
    const l = sc.find(/\b(?:de\s+)?(?:lib(?:eracion)?\.?\s*)?(prolongada|retardada|modificada)\b|\b(?:lp|xr|er|sr)\b/gi);
    if (l) lib = ' de liberación ' + (/retard/i.test(l.f) ? 'retardada' : /modific/i.test(l.f) ? 'modificada' : 'prolongada');
  }
  // 7) presentación
  const pcs = sc.find(mkPiecesRe());
  let cont = pcs ? pcs.text : (volContent ? withContainer(volContent) : '');
  if (pcs && volContent) notes.push(`Volumen sin asignar: ${volContent.parts.map(p => p.text).join(' / ')}.`);
  if (cont && pcs && !new RegExp(NOUN, 'i').test(fold(cont)) && F.forma && FORM_PLURAL[F.forma]) cont += ' ' + FORM_PLURAL[F.forma];
  if (cont && lib) cont += lib; else if (lib) notes.push('Liberación prolongada detectada, pero no hay presentación a la cual agregarla.');
  if (cont) F.contenido = cont;

  // 8) reglas propias de cada categoría
  const td = TYPE_DICT[cat];
  if (td) for (const [re, canon] of td.list) {
    const h = sc.find(new RegExp(re.source, 'gi'));
    if (h) { F[td.key] = canon || h.f.replace(/^vitamina ([a-z])(\d*)$/i, (m, a, d) => 'Vitamina ' + a.toUpperCase() + d); break; }
  }
  if (cat === 'dis') {
    if (F.tipo && sc.find(/\bdigital\b/gi)) F.tipo += ' digital';
    for (const [re, canon] of DIS_TECH) { if (sc.find(new RegExp(re.source, 'gi'))) { F.tecnologia = canon; break; } }
    const mod = sc.find(/\b[a-z]{1,6}-?\d{2,6}[a-z0-9-]*\b/gi); if (mod) F.modelo = mod.text;
  }
  if (cat === 'cos') {
    for (const [re, canon] of COS_ACT) { if (sc.find(new RegExp(re.source, 'gi'))) { F.atributo = canon; break; } }
    const sp = sc.find(/\b(?:fps|spf) ?\d+\+?/gi);
    if (sp) { const n = sp.text.replace(/^\D+/, '').replace(/\s+/g, ''); F.fps = n; if (!F.atributo) F.atributo = 'FPS ' + n; }
  }
  if (cat === 'sup') {
    sc.find(/\bsabor(?: a)?\b/gi);
    for (const [k, canon] of FLAVORS) { if (sc.find(new RegExp('\\b' + k + '\\b', 'gi'))) { F.sabor = canon; break; } }
  }
  if (cat === 'beb') {
    for (const [re, canon] of BEB_ATTR) { if (sc.find(new RegExp(re.source, 'gi'))) { F.atributo = canon; break; } }
    sc.find(/\bsabor(?: a)?\b/gi);
    for (const [k, canon] of FLAVORS) { if (sc.find(new RegExp('\\b' + k + '\\b', 'gi'))) { F.sabor = canon; break; } }
  }

  // 9) marca por posición (opcional, siempre con aviso)
  if (!F.marca && opts.suggestBrand) {
    let i = 0; while (i < raw.length && !sc.used[i]) i++;
    const lead = raw.slice(0, i).trim();
    if (lead && lead.split(' ').length <= 3 && /\p{L}/u.test(lead)) { F.marca = lead; for (let k = 0; k < i; k++) sc.used[k] = true; notes.push('La marca es una sugerencia por posición. Verifícala.'); }
  }

  // 10) texto sin asignar
  const junk = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'con', 'en', 'y', 'e', 'o', 'a', 'al', 'c', 'x', 'para', 'por', 'un', 'una', 'caj', 'caja', 'fco', 'frasco']);
  const tokens = []; let cur = '';
  for (let i = 0; i < raw.length; i++) { if (!sc.used[i] && !/[\s,;|/.()]/.test(raw[i])) cur += raw[i]; else { if (cur) tokens.push(cur); cur = ''; } }
  if (cur) tokens.push(cur);
  const leftover = tokens.filter(t => !junk.has(fold(t).toLowerCase()) && /[\p{L}\d]/u.test(t));

  const allowed = new Set(CATS[cat].fields.map(f => f.key)), fields = {};
  Object.entries(F).forEach(([k, v]) => { if (v && allowed.has(k)) fields[k] = v; });
  return { cat, fields, leftover, notes, ambiguous, why };
}

function extractRows(rows, defaultCat, opts) {
  let n = 0;
  rows.forEach(r => {
    if (!r.pending) return;
    const res = extractRaw(r.raw, { ...(opts || {}), cat: r.cat || defaultCat || null });
    r.pending = false;
    if (!res.cat) { r.error = 'No se detectó la categoría. Agrega la columna Categoría o elige una por defecto.'; return; }
    if (!Object.keys(res.fields).length) { r.cat = res.cat; r.error = 'No se encontraron datos en el texto crudo.'; return; }
    r.cat = res.cat; r.v = res.fields; r.note = res.leftover.join(' '); r.extracted = true; n++;
  });
  return n;
}

const api = {
  ALIAS,
  ALT_BAD_START_RE,
  ALT_DEF,
  AMBER,
  BEB_ATTR,
  CAP_TITLE,
  CATS,
  CAT_KW,
  CAT_ORDER,
  COMERCIAL_RE,
  CONT,
  COS_ACT,
  COUNT_NOUN_RE,
  TITLE_MAX,
  dupBrand,
  CP1252_EXTRA,
  DIS_TECH,
  F,
  FLAVORS,
  FOLD_FROM,
  FOLD_TO,
  FORMS,
  FORM_PLURAL,
  LIBS,
  LOOKUP,
  MAG_HEADER,
  MAG_IDX,
  MAG_CONTRACT,
  MAG_MULTI_FIELDS,
  MAG_ONES,
  MASS_UNITS,
  META_GEN,
  META_MED,
  NOTA_SUP,
  NOUN,
  NUM,
  RED,
  S,
  SMALL,
  TYPE_DICT,
  FORM_SUG,
  UNIT,
  UNIT_MAP,
  VIAS,
  VOL_UNITS,
  assemble,
  batchCsv,
  buildMC,
  buildMeta,
  buildMg,
  buildFaq,
  shortenMeta,
  parseNutrition,
  nutriConsistency,
  relations,
  complementEligible,
  AREAS,
  ATC_RE,
  buildTitle,
  cap,
  capNouns,
  computeFor,
  defExp,
  defMeta,
  defMetaCat,
  detectCat,
  encodeCp1252,
  escRe,
  escT,
  expandPres,
  extractRaw,
  extractRows,
  fixCaps,
  fold,
  hasVowel,
  join,
  joinForm,
  labelOf,
  lc,
  liRows,
  lint,
  lookupFor,
  magentoBatch,
  sanitizeMagentoCell,
  sanitizeMagentoRow,
  validateMagentoExport,
  makeScanner,
  mgFull,
  mkDoseRe,
  mkPiecesRe,
  normHeader,
  normUnits,
  parseBulk,
  parseCSV,
  parseDic,
  parseDose,
  parseReceta,
  quote,
  recetaMeta,
  renderMetaTpl,
  resolveCat,
  saborTxt,
  scanRed,
  LEGEND,
  dedupeFields,
  sentenceCase,
  langCount,
  nivelPorFps,
  COS_CLAIM,
  COS_MED,
  seg,
  sentence,
  templateRows,
  toSheet,
  values
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.Fichas = api;
})(typeof self !== 'undefined' ? self : this);
