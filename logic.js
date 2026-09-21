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
const seg = (label, parts, fn) => ({ label, parts, fn });

/* ---------- Normalización ---------- */
const SMALL = new Set(['de','del','la','el','y','e','o','con','para','en','por','sin','a','al','los','las','un','una']);
const hasVowel = w => /[aeiouyáéíóúü]/i.test(w);
function fixCaps(t, keep, mode) {
  if (!/\p{L}/u.test(t) || t !== t.toUpperCase()) return t;
  return t.replace(/\p{L}+/gu, (w, off) => {
    const l = w.toLowerCase();
    if (keep.has(l)) return w.toUpperCase();
    if (/^(ug|ui|iu|mg|mcg|g|gr|grs|ml|kg|l|lt|cm|mm)$/i.test(w) && /\d\s*$/.test(t.slice(0, off))) return w;
    if (w.length <= 3 && !hasVowel(w)) return w;
    if (SMALL.has(l) && off > 0) return l;
    return mode === 'sentence' ? l : w.charAt(0) + l.slice(1);
  });
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
  return cap(s.trim());
}
const COUNT_NOUN_RE = /(\d+)\s+(tabletas?|cápsulas?|capsulas?|piezas?|sobres?|comprimidos?|parches?|pastillas?|gomitas?|unidades|unidad|ampolletas?|plumas?|tiras|lancetas?|grageas?|sachets?|toallitas?|jeringas?)(?![\p{L}])/giu;
const capNouns = s => s.replace(COUNT_NOUN_RE, (m, n, w) => `${n} ${cap(w)}`);
function joinForm(forma, contenido) {
  if (!forma) return contenido || '';
  if (!contenido) return forma;
  const base = forma.toLowerCase().replace(/s$/, '');
  if (contenido.toLowerCase().includes(base)) return contenido;
  return `${forma}, ${contenido}`;
}
const saborTxt = s => s && (/^sabor\b/i.test(s) ? s : 'Sabor ' + s);

/* ---------- Plantillas de Magento ---------- */
const S = t => t ? `<strong>${escT(t)}</strong>` : '';
const liRows = pairs => pairs.filter(([, v]) => v).map(([l, v]) => `  <li><strong>${l}:</strong> ${escT(v)}</li>`).join('\n');
const assemble = (p, heading, pairs, extra = []) =>
  [`<p>${p.trim()}</p>`, `<h2>${heading}</h2>\n<ul>\n${liRows(pairs)}\n</ul>`, ...extra].join('\n<br />\n');

const NOTA_SUP = '<h2>Condiciones de conservación:</h2>\n<p>Consérvese bien cerrado en un lugar fresco y seco. No se deje al alcance de los niños.</p>';

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
      F('contenido','Presentación o piezas',{req:1,pres:1,ph:'Caja con 4 plumas'}),
      F('laboratorio','Laboratorio',{req:1,ph:'Eli Lilly'}),
      F('via','Vía de administración',{req:1,g:'d',ph:'Subcutánea'}),
      F('receta','¿Requiere receta médica?',{req:1,g:'d',type:'select',opts:[['','Sin declarar'],['si','Sí requiere receta'],['no','No requiere receta']],hint:'Dato regulatorio obligatorio. Sin él no se genera el HTML de Magento.'}),
      F('leyenda','Leyenda regulatoria adicional',{g:'d',type:'area',hint:'Solo si viene en la ficha de origen.'})
    ],
    title: [
      seg('Marca + concentración / volumen', ['marca','concentracion','volumen'], v => join(' ', v.marca, join(' / ', v.concentracion, v.volumen))),
      seg('Principio activo', ['principio']),
      seg('Forma farmacéutica', ['forma']),
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
        'Uso y dosis conforme a la prescripción médica y al instructivo del producto. Consulte a su médico y evite automedicarse.',
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
      if (v.receta === 'si') p += ' Su venta y suministro requiere receta médica para garantizar su control sanitario.';
      return assemble(p, 'Ficha técnica del producto:', [
        ['Nombre Comercial', v.marca], ['Sustancia Activa', v.principio], ['Concentración', conc],
        ['Forma Farmacéutica', v.forma], ['Presentación', v.contenido], ['Vía de Administración', v.via], ['Laboratorio', v.laboratorio]
      ], [
        '<h2>Condiciones de conservación:</h2>\n<p>Consérvese en su empaque original protegido de la luz y la humedad. Manténgase a la temperatura indicada en el envase. Fuera del alcance de los niños.</p>',
        '<h2>Aviso legal y de seguridad:</h2>\n<ul>\n  <li>Dosis: La que el médico señale.</li>\n  <li>Léase instructivo anexo impreso en el empaque del medicamento.</li>\n  <li>Consulte a su médico.</li>\n  <li>Evite automedicarse.</li>\n</ul>'
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
      F('extra','Especificaciones adicionales',{g:'d',type:'area',hint:'Conectividad, memoria, muestra, etc.'})
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
      'Utilice el dispositivo conforme al instructivo del fabricante.'
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
        ['Tecnología / Zona de medición', v.tecnologia], ['Contenido del Paquete', v.paquete], ['Fabricante', v.fabricante]
      ]);
    }
  },

  cos: {
    emoji: '🧴', name: 'Dermacosméticos / Cosméticos', range: [80, 150],
    fields: [
      F('marca','Marca',{req:1,ph:'La Roche-Posay'}),
      F('producto','Nombre del producto',{req:1,ph:'Hyalu B5'}),
      F('tipo','Tipo de producto',{req:1,ph:'Sérum'}),
      F('atributo','Atributo o activo principal',{req:1,ph:'Ácido hialurónico'}),
      F('contenido','Contenido',{req:1,pres:1,ph:'Frasco 30 mL'}),
      F('fabricante','Fabricante',{req:1,ph:"L'Oréal"}),
      F('piel','Tipo de piel o necesidad declarada',{g:'d',hint:'Solo si está validado en el empaque.'}),
      F('ingredientes','Ingredientes o activos destacados',{g:'d',type:'area'}),
      F('textura','Textura u objetivo cosmético',{g:'d'}),
      F('comercial','Frase comercial objetiva',{g:'d',type:'area',hint:'Sin adjetivos vacíos. Va al final de la descripción.'})
    ],
    title: [
      seg('Marca + producto + tipo', ['marca','producto','tipo']),
      seg('Atributo o activo principal', ['atributo']),
      seg('Contenido', ['contenido']),
      seg('Fabricante', ['fabricante'])
    ],
    vital: ['atributo'],
    mcUses: ['marca','producto','tipo','atributo','contenido','fabricante','piel','ingredientes','textura'],
    mgUses: ['marca','producto','tipo','atributo','contenido','fabricante','piel','textura'],
    mc: v => [
      join(' - ', join(' ', v.marca, v.producto, v.tipo, v.atributo, v.contenido), v.fabricante),
      v.piel && `${v.tipo ? cap(v.tipo) : 'Producto'} formulado para ${lc(v.piel)}`,
      v.ingredientes && `Contiene ${lc(v.ingredientes)}`,
      v.textura,
      v.contenido && `Presentación de ${lc(v.contenido)}`,
      'Aplicar conforme a las indicaciones del fabricante.',
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
      return assemble(p, 'Detalles del producto:', [
        ['Marca', v.marca], ['Nombre del Producto', v.producto], ['Tipo de Producto', v.tipo],
        ['Atributo o Activo Principal', v.atributo], ['Contenido', v.contenido], ['Fabricante', v.fabricante]
      ]);
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
      F('caracteristicas','Características objetivas',{g:'d',type:'area',hint:'No conviertas ingredientes en beneficios si la ficha no lo dice.'})
    ],
    title: [
      seg('Marca + componente', ['marca','componente']),
      seg('Forma + contenido', ['forma','contenido'], v => joinForm(v.forma, v.contenido)),
      seg('Fabricante', ['fabricante'])
    ],
    vital: ['componente'],
    mcUses: ['marca','componente','forma','contenido','fabricante','composicion'],
    mgUses: ['marca','componente','forma','contenido','fabricante'],
    mc: v => [
      join(' - ', join(' ', v.marca, v.componente && `(${v.componente})`, v.contenido), v.fabricante),
      'Suplemento alimenticio' + (v.forma ? ' en forma de ' + lc(v.forma) : '') + ((v.composicion || v.componente) ? ' que contiene ' + lc(v.composicion || v.componente) : ''),
      v.contenido && `Presentación de ${lc(v.contenido)}`,
      v.caracteristicas,
      'El consumo de este producto es responsabilidad de quien lo recomienda y de quien lo usa. Este producto no es un medicamento.'
    ],
    mg: v => {
      let p = `${S(join(' ', v.marca, v.componente && `(${v.componente})`))} es un producto alimenticio` + (v.fabricante ? ` elaborado por el fabricante ${S(v.fabricante)}` : '') + '.';
      if (v.forma || v.componente || v.contenido) {
        p += ' Este suplemento' + (v.forma ? ` en forma de ${S(v.forma)}` : '')
          + (v.componente ? ` incorpora ${S(v.componente)}` : '')
          + (v.contenido ? ` estructurado en una presentación de ${S(v.contenido)}` : '') + '.';
      }
      p += ' El consumo de este producto es responsabilidad de quien lo recomienda y de quien lo usa. Este producto no es un medicamento.';
      return assemble(p, 'Ficha técnica del suplemento:', [
        ['Marca', v.marca], ['Componente o Tipo Principal', v.componente], ['Forma', v.forma],
        ['Contenido Neto/Piezas', v.contenido], ['Fabricante', v.fabricante]
      ], [NOTA_SUP]);
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
        ['Atributo Verificado', v.atributo], ['Contenido', v.contenido]
      ]);
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
      'Utilizar conforme a las indicaciones del fabricante.'
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
        ['Contenido', v.contenido], ['Fabricante', v.fabricante]
      ]);
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
      F('paquete','Incluye',{g:'d'})
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
        ['Contenido/Piezas', v.contenido], ['Fabricante', v.fabricante]
      ]);
    }
  }
};

Object.keys(CATS).forEach(id => { CATS[id].id = id; });
const labelOf = (c, k) => (c.fields.find(x => x.key === k) || {}).label || k;

/* ---------- Cálculo ---------- */
function values(c, raw, style, keep) {
  const v = {}, changes = [];
  for (const fd of c.fields) {
    const r = raw[fd.key] ?? '';
    if (fd.type === 'select') { v[fd.key] = r; continue; }
    const orig = String(r).replace(/\s+/g, ' ').trim();
    let t = orig;
    if (t) {
      t = fixCaps(t, keep, fd.pres ? 'sentence' : 'title');
      if (fd.pres) t = expandPres(t);
      t = normUnits(t, style);
    }
    v[fd.key] = t;
    if (style === 'mL' && orig && t !== orig) changes.push({ label: fd.label, from: orig, to: t });
  }
  return { v, changes };
}

function buildTitle(c, v) {
  const segs = c.title.map(s => {
    const raw = ((s.fn ? s.fn(v) : join(' ', ...s.parts.map(k => v[k]))) || '').trim();
    const text = capNouns(cap(raw));
    const parts = s.parts.map(k => { const fd = c.fields.find(x => x.key === k); return { key: k, label: fd.label, value: v[k], req: !!fd.req }; });
    const missing = parts.filter(p => p.req && !p.value).map(p => p.label);
    return { label: s.label, text, parts, missing, state: !text ? 'missing' : (missing.length ? 'partial' : 'ok') };
  });
  const title = segs.map(s => s.text).filter(Boolean).join(' | ');
  return { segs, title, missing: segs.flatMap(s => s.missing) };
}

function buildMC(c, v) {
  const text = c.mc(v).filter(Boolean).map(sentence).filter(Boolean).join(' ');
  const omitted = c.mcUses.filter(k => !v[k]).map(k => labelOf(c, k));
  const words = text ? text.trim().split(/\s+/).length : 0;
  return { text, omitted, words };
}

const recetaMeta = (c, v) => c.id === 'med' ? (v.receta === 'si' ? 'Sí' : v.receta === 'no' ? 'No' : '') : 'No aplica para esta categoría';
const mgFull = g => '```html\n' + g.html + '\n```\n\n- Categoría detectada: ' + g.meta.categoria + '\n- Requiere receta médica: ' + g.meta.receta;

function buildMg(c, v) {
  const blocked = [];
  if (c.id === 'med' && !v.receta) blocked.push('Indica si el producto requiere receta médica. Es un dato regulatorio obligatorio.');
  (c.vital || []).forEach(k => { if (!v[k]) blocked.push(`${labelOf(c, k)}. No se infiere ni se inventa.`); });
  const omitted = c.mgUses.filter(k => !v[k]).map(k => labelOf(c, k));
  const meta = { categoria: c.name, receta: recetaMeta(c, v) };
  if (blocked.length) return { blocked, omitted, html: '', meta };
  return { blocked: null, omitted, html: c.mg(v), meta };
}

function computeFor(catId, raw, keep, metaCfg) {
  const c = CATS[catId];
  const vt = values(c, raw, 'mL', keep);
  const vm = values(c, raw, 'ml', keep);
  const title = buildTitle(c, vt.v);
  const meta = buildMeta(c, vt.v, title, metaCfg && metaCfg.cats && metaCfg.cats[catId], metaCfg && metaCfg.tienda);
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
function lint(c, raw) {
  const out = { claim: [], vacio: [], amber: [] };
  for (const fd of c.fields) {
    if (fd.type === 'select') continue;
    const t = raw[fd.key] || '';
    if (!t) continue;
    RED.forEach(([re, name, kind]) => { if (re.test(t)) out[kind].push({ term: name, field: fd.label }); });
    AMBER.forEach(([re, name]) => { if (re.test(t)) out.amber.push({ term: name, field: fd.label }); });
  }
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
const defExp = () => ({ attr: 'categoria_prod', enc: 'cp1252', incF: false, excL: false });
const COMERCIAL_RE = /\b(compra|comprar|compre|oferta|ofertas|descuento|descuentos|promoci[oó]n|env[ií]o gratis|mejor precio|barato|econ[oó]mic[oa])\b/i;
function scanRed(text) { const f = []; RED.forEach(([re, name]) => { if (re.test(text)) f.push(name); }); return f; }

function renderMetaTpl(tpl, sep, tokens) {
  const lines = String(tpl || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const out = [], unknown = new Set();
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
    if (anyReq && allEmpty) continue;
    txt = txt.replace(/\(\s*\)/g, '').replace(/\s+/g, ' ')
      .replace(/(\s*[\/,\-–]\s*)+$/, '').replace(/^(\s*[\/,\-–]\s*)+/, '')
      .replace(/\s+(por|de|con|en)$/i, '').trim();
    if (dotSep) txt = txt.replace(/\.+$/, '');
    if (txt) out.push(txt);
  }
  let text = out.join(sep == null ? ' ' : sep);
  if (dotSep && text && !/[.!?]$/.test(text)) text += '.';
  return { text: text.trim(), unknown: [...unknown] };
}

function buildMeta(c, v, title, cfg, tienda) {
  const conf = cfg || defMetaCat(c.id);
  const tokens = { titulo: title.title, categoria: c.name, tienda: (tienda || '').trim(), receta_txt: v.receta === 'si' ? 'con receta médica' : '' };
  c.fields.forEach(fd => { tokens[fd.key] = v[fd.key] || ''; });
  for (let i = 1; i <= 4; i++) tokens['seg' + i] = (title.segs[i - 1] && title.segs[i - 1].text) || '';
  const out = {}, warns = [];
  [['mt', 'Meta title'], ['md', 'Meta description'], ['alt', 'Alt de imagen']].forEach(([k, label]) => {
    const t = conf[k] || { tpl: '', sep: ' ', max: 0 };
    const r = renderMetaTpl(t.tpl, t.sep, tokens);
    const max = Number(t.max) || 0;
    out[k] = { text: r.text, len: r.text.length, max, over: !!(max && r.text.length > max) };
    if (r.unknown.length) warns.push(`${label}: token desconocido ${r.unknown.map(x => '{' + x + '}').join(', ')}.`);
    if (out[k].over) warns.push(`${label}: ${r.text.length} caracteres, supera el límite de ${max}.`);
    const red = (k === 'alt' || !conf.confirmed) ? scanRed(r.text) : [];
    if (red.length) warns.push(`${label}: contiene «${red.join('», «')}».`);
    if (k === 'alt' && /^(imagen|foto|fotograf[ií]a)\b/i.test(r.text)) warns.push('Alt de imagen: no empieces con "imagen de" o "foto de". El lector de pantalla ya lo anuncia.');
    if (k !== 'alt' && c.id === 'med' && !conf.confirmed && COMERCIAL_RE.test(r.text)) warns.push(`${label}: lenguaje comercial en un medicamento. Confirma con Regulatorio que sea aceptable.`);
  });
  out.warns = warns;
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

function magentoBatch(items, keep, metaCfg, opts) {
  const ex = { sinSku: 0, bloqueadas: 0, faltantes: 0, lenguaje: 0, duplicadas: 0, sinMeta: 0, sinImagen: 0, altLargos: 0 };
  const bySku = new Map();
  const attr = String(opts.attr || '').trim() || 'categoria_prod';
  for (const it of items) {
    const sku = String(it.sku || '').trim();
    if (!sku) { ex.sinSku++; continue; }
    const res = computeFor(it.cat, it.v, keep, metaCfg);
    if (res.mg.blocked) { ex.bloqueadas++; continue; }
    if (res.title.missing.length && !opts.incFaltantes) { ex.faltantes++; continue; }
    if (opts.excLenguaje) { const L = lint(res.c, it.v); if (L.claim.length + L.vacio.length + L.amber.length) { ex.lenguaje++; continue; } }
    const row = new Array(MAG_HEADER.length).fill('');
    const set = (k, val) => { row[MAG_IDX[k]] = val; };
    set('sku', sku);
    set('description', res.mg.html.replace(/\n\s*/g, ''));
    if (res.meta.confirmed) {
      set('short_description', res.meta.md.text);
      set('meta_title', res.meta.mt.text);
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
  }
  return { header: MAG_HEADER, rows: [...bySku.values()], excluded: ex, total: items.length };
}
const batchCsv = ex => toSheet([ex.header, ...ex.rows], ',', '\r\n') + '\r\n';

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
const CONT = '(?:caj(?:a)?|fco|frasco|blister|blis|sobres?|estuche|tubo|bolsa|botella)';
const NOUN = '(?:tab(?:s|letas?)?|caps?(?:ulas?)?|comp(?:rimidos?)?|pzas?|pz|piezas?|amp(?:olletas?)?|plumas?|sobres?|grag(?:eas?)?|parches?|tiras?|lancetas?|gomitas?|ovulos?|supositorios?|unidades|unidad)';
const LIBS = '(?:\\s+(?:de\\s+)?(?:lib(?:eracion)?\\.?\\s*)?(?:prolongada|retardada|modificada))?';
const mkPiecesRe = () => new RegExp(`(?:\\b${CONT}\\.?\\s*)?(?:\\bc\\/\\s*|\\bx\\s*|\\bcon\\s+)\\d+(?:\\s*${NOUN}\\b\\.?${LIBS})?|\\b\\d+\\s*${NOUN}\\b\\.?${LIBS}`, 'gi');
const MASS_UNITS = new Set(['mg', 'mcg', 'ug', 'g', 'gr', 'grs', 'ui', 'iu', '%']);
const VOL_UNITS = new Set(['ml', 'l']);

const FORMS = [
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
  [/\bcrema\b/gi, 'Crema', 0],
  [/\bgel\b/gi, 'Gel', 0]
];
const FORM_PLURAL = { 'Tableta': 'tabletas', 'Comprimido': 'comprimidos', 'Cápsula': 'cápsulas', 'Gragea': 'grageas', 'Ampolleta': 'ampolletas', 'Supositorio': 'supositorios', 'Óvulo': 'óvulos', 'Gomita': 'gomitas' };
const VIAS = [
  [/\boral\b/gi, 'Oral'], [/\bsubcut(?:anea)?\b|\bs\.?c\.?(?![a-z0-9])/gi, 'Subcutánea'], [/\bintramuscular\b/gi, 'Intramuscular'],
  [/\bintravenosa\b|\bendovenosa\b/gi, 'Intravenosa'], [/\btopic[oa]\b/gi, 'Tópica'], [/\boftalmica\b/gi, 'Oftálmica'],
  [/\bnasal\b/gi, 'Nasal'], [/\bsublingual\b/gi, 'Sublingual'], [/\brectal\b/gi, 'Rectal'], [/\bvaginal\b/gi, 'Vaginal'], [/\binhalada\b/gi, 'Inhalada']
];
const TYPE_DICT = {
  dis: { key: 'tipo', list: [[/\bbaumanometro\b/gi, 'Baumanómetro'], [/\btensiometro\b/gi, 'Tensiómetro'], [/\bglucometro\b/gi, 'Glucómetro'], [/\btermometro\b/gi, 'Termómetro'], [/\boximetro\b/gi, 'Oxímetro'], [/\bnebulizador\b/gi, 'Nebulizador'], [/\binhalocamara\b/gi, 'Inhalocámara']] },
  cos: { key: 'tipo', list: [[/\bserum\b/gi, 'Sérum'], [/\bprotector solar\b/gi, 'Protector solar'], [/\bcontorno de ojos\b/gi, 'Contorno de ojos'], [/\bcrema\b/gi, 'Crema'], [/\bgel\b/gi, 'Gel'], [/\blocion\b/gi, 'Loción'], [/\bemulsion\b/gi, 'Emulsión'], [/\bbalsamo\b/gi, 'Bálsamo'], [/\bmascarilla\b/gi, 'Mascarilla'], [/\btonico\b/gi, 'Tónico'], [/\blimpiador\b/gi, 'Limpiador']] },
  hig: { key: 'producto', list: [[/\bpasta dental\b|\bcrema dental\b/gi, 'Pasta dental'], [/\b(?:shampoo|champu)\b/gi, 'Shampoo'], [/\bdesodorante\b/gi, 'Desodorante'], [/\bjabon\b/gi, 'Jabón'], [/\benjuague bucal\b/gi, 'Enjuague bucal'], [/\bcepillo dental\b/gi, 'Cepillo dental'], [/\bhilo dental\b/gi, 'Hilo dental'], [/\btoallas humedas\b/gi, 'Toallas húmedas']] },
  acc: { key: 'producto', list: [[/\bparches? termicos?\b/gi, 'Parches térmicos'], [/\bvenda\b/gi, 'Venda'], [/\bfaja\b/gi, 'Faja'], [/\bmunequera\b/gi, 'Muñequera'], [/\bbolsa termica\b/gi, 'Bolsa térmica'], [/\b(?:cubrebocas|tapabocas)\b/gi, 'Cubrebocas']] },
  beb: { key: 'tipo', list: [[/\bsuero oral\b/gi, 'Suero oral'], [/\bbebida (?:hidratante|isotonica)\b/gi, 'Bebida hidratante'], [/\bisotonica\b/gi, 'Bebida isotónica'], [/\brehidratante\b/gi, 'Bebida rehidratante']] },
  sup: { key: 'componente', list: [[/\bvitamina [a-z]\d*\b/gi, null], [/\bomega ?-?3\b/gi, 'Omega 3'], [/\bcolageno\b/gi, 'Colágeno'], [/\bprobioticos?\b/gi, 'Probiótico'], [/\bmultivitaminico\b/gi, 'Multivitamínico'], [/\bmagnesio\b/gi, 'Magnesio'], [/\bzinc\b/gi, 'Zinc'], [/\bmelatonina\b/gi, 'Melatonina'], [/\bcreatina\b/gi, 'Creatina'], [/\bproteina\b/gi, 'Proteína']] }
};
const FLAVORS = [['coco', 'Coco'], ['fresa', 'Fresa'], ['limon', 'Limón'], ['naranja', 'Naranja'], ['uva', 'Uva'], ['manzana', 'Manzana'], ['mora azul', 'Mora azul'], ['mora', 'Mora'], ['menta', 'Menta'], ['vainilla', 'Vainilla'], ['chocolate', 'Chocolate'], ['mango', 'Mango'], ['pina', 'Piña'], ['durazno', 'Durazno'], ['sandia', 'Sandía'], ['maracuya', 'Maracuyá'], ['cereza', 'Cereza'], ['toronja', 'Toronja'], ['mandarina', 'Mandarina'], ['jamaica', 'Jamaica'], ['tamarindo', 'Tamarindo'], ['frutos rojos', 'Frutos rojos']];
const BEB_ATTR = [[/\bsin azucar(?:es)?\b/gi, 'Sin azúcar'], [/\bsin lactosa\b/gi, 'Sin lactosa'], [/\bsin gluten\b|\blibre de gluten\b/gi, 'Sin gluten'], [/\bsin calorias\b/gi, 'Sin calorías'], [/\bbajo en sodio\b/gi, 'Bajo en sodio'], [/\bzero\b/gi, 'Zero'], [/\blight\b/gi, 'Light']];
const COS_ACT = [[/\bacido hialuronico\b/gi, 'Ácido hialurónico'], [/\bniacinamida\b/gi, 'Niacinamida'], [/\bretinol\b/gi, 'Retinol'], [/\bceramidas\b/gi, 'Ceramidas'], [/\bpeptidos\b/gi, 'Péptidos'], [/\bacido salicilico\b/gi, 'Ácido salicílico'], [/\bacido glicolico\b/gi, 'Ácido glicólico'], [/\bcentella asiatica\b/gi, 'Centella asiática'], [/\bvitamina c\b/gi, 'Vitamina C']];
const DIS_TECH = [[/\bautomatico de brazo\b/gi, 'Automático de brazo'], [/\bautomatico de muneca\b/gi, 'Automático de muñeca'], [/\bde brazo\b/gi, 'De brazo'], [/\bde muneca\b/gi, 'De muñeca'], [/\binfrarrojo\b/gi, 'Infrarrojo'], [/\bautomatico\b/gi, 'Automático']];
const CAT_KW = {
  dis: /\b(baumanometro|tensiometro|glucometro|termometro|oximetro|nebulizador|inhalocamara|estetoscopio|tiras reactivas|lancetero)\b/i,
  cos: /\b(serum|protector solar|fps|spf|contorno de ojos|mascarilla|limpiador|tonico|acido hialuronico|niacinamida|retinol|ceramidas|locion|emulsion)\b/i,
  sup: /\b(vitamina [a-z]|multivitaminico|omega ?-?3|colageno|probioticos?|magnesio|zinc|melatonina|creatina|proteina|gomitas?)\b/i,
  beb: /\b(suero oral|electrolit|electrolitos|bebida|sabor|isotonica|rehidratante)\b/i,
  hig: /\b(pasta dental|crema dental|shampoo|champu|desodorante|jabon|enjuague bucal|cepillo dental|hilo dental|toallas humedas)\b/i,
  acc: /\b(parches? termicos?|venda|faja|munequera|bolsa termica|cubrebocas|tapabocas)\b/i
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
    if (!F.atributo) { const sp = sc.find(/\b(?:fps|spf) ?\d+\+?/gi); if (sp) F.atributo = sp.text.toUpperCase(); }
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
  UNIT,
  UNIT_MAP,
  VIAS,
  VOL_UNITS,
  assemble,
  batchCsv,
  buildMC,
  buildMeta,
  buildMg,
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
  seg,
  sentence,
  templateRows,
  toSheet,
  values
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.Fichas = api;
})(typeof self !== 'undefined' ? self : this);
