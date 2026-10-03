/*
 * Fase 9: motor de contenido y Content Score (contrato fichas.content.v1).
 *
 * Content evalúa la calidad EDITORIAL e INFORMATIVA de la ficha (¿informa bien al comprador?).
 * Quality/Health evalúan la calidad de los DATOS (¿el dato es válido?) y SEO evalúa los textos de
 * posicionamiento (título, meta, alt). Este módulo no es un segundo validador: consume lo que ya existe
 * (logic.js: computeFor, lint, CATS) y solo agrega reglas de contenido que ningún motor tenía.
 *
 * - Cada punto del score sale de una regla del inventario RULES (trazable: id, peso, severidad, resultado).
 * - No premia longitud ni cantidad de palabras: ninguna regla mide cuántas palabras hay.
 * - No inventa información: lo que falta se señala, no se rellena.
 * - No usa IA: el score es una función pura de los datos de la ficha.
 * Funciona en navegador (window.FichasContent) y en Node (require).
 */
(function (root) {
'use strict';
const isNode = typeof module !== 'undefined' && module.exports;
const F = isNode ? require('./logic.js') : root.Fichas;

const SCHEMA = 'fichas.content.v1';
const VERSION = '1.0';
const SEVERITY_LOSS = { error: 1, warning: 0.5, info: 0 };
const FORMULA = 'Content total = round(100 × Σ puntos obtenidos ÷ Σ puntos posibles). '
  + 'Posibles de una regla = su peso; las reglas «No aplica» no suman. '
  + 'Obtenidos = peso × (1 − pérdida): cumple 0%, aviso 50%, error 100%, informativo 0%. No se premia la longitud del texto.';

const DIMENSIONS = {
  completitud: { label: 'Completitud', max: 20 },
  fichaTecnica: { label: 'Ficha técnica', max: 15 },
  descripcion: { label: 'Descripción', max: 10 },
  presentacion: { label: 'Presentación y forma', max: 10 },
  coherencia: { label: 'Coherencia y contradicciones', max: 15 },
  seguridad: { label: 'Seguridad y conservación', max: 10 },
  claridad: { label: 'Claridad y repetición', max: 10 },
  claims: { label: 'Claims', max: 10 }
};
const STATUS_LABEL = { critico: 'Contenido crítico', revisar: 'Contenido por revisar', listo: 'Contenido listo', sin_evaluar: 'Contenido sin evaluar' };
const SIMBOLO = { cumple: '✓', pendiente: '⚠', error: '❌', no_aplica: 'ℹ' };
const ESTADO_LABEL = { cumple: 'Cumple', pendiente: 'Pendiente', error: 'Error', no_aplica: 'No aplica' };
/* clase: define la prioridad de la recomendación en Score 360 (faltante, contradiccion, contenido, mejora). */

/* ---------- utilidades ---------- */
const str = x => String(x == null ? '' : x);
const squash = s => str(s).replace(/\s+/g, ' ').trim();
const fold = s => F.fold(str(s)).toLowerCase();
const alnum = s => fold(s).replace(/[^a-z0-9]+/g, '');
const stripTags = h => str(h).replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
const contains = (text, part) => { const p = alnum(part); return !!p && alnum(text).includes(p); };
const uniq = a => [...new Set(a)];
const round2 = n => Math.round(n * 100) / 100;

/* Qué información necesita saber quien compra, por categoría. «a|b» = basta con uno de los dos. */
const INFO = {
  med: { identidad: ['marca', 'principio'], tecnica: ['concentracion', 'forma', 'via'], origen: ['laboratorio'] },
  dis: { identidad: ['marca', 'modelo', 'tipo'], tecnica: ['tecnologia', 'uso'], origen: ['fabricante'] },
  cos: { identidad: ['marca', 'producto|tipo'], tecnica: ['atributo'], origen: ['fabricante'] },
  sup: { identidad: ['marca', 'componente'], tecnica: ['forma'], origen: ['fabricante'] },
  beb: { identidad: ['marca', 'tipo'], tecnica: ['sabor|atributo'], origen: ['fabricante'] },
  hig: { identidad: ['marca', 'producto'], tecnica: ['variante|uso'], origen: ['fabricante'] },
  acc: { identidad: ['marca', 'producto'], tecnica: ['material'], origen: ['fabricante'] }
};
const PRES_KEYS = { dis: ['paquete', 'presentacion'] };
const labelOf = (c, k) => { try { return F.labelOf(c, k); } catch (_) { return k; } };

/* Formas farmacéuticas y cosméticas reconocidas (lista cerrada; lo que no está se señala, no se corrige). */
const FORMA_RE = /tablet|comprim|c[aá]psul|gragea|perla|gr[aá]nul|jarabe|soluci[oó]n|suspensi[oó]n|emulsi[oó]n|inyect|ampoll?eta|ampolla|vial|pluma|jeringa|cartucho|crema|gel\b|ung[uü]ento|pomada|loci[oó]n|parche|supositor|[oó]vulo|polvo|gotas|spray|aerosol|inhalad|shampoo|champ[uú]|colirio|enjuague|barra|sobre|pastilla|chicle|liofiliz|implante|aceite|espuma|toallita|mascarilla|s[eé]rum|serum|bruma|t[oó]nico|bals[aá]mico|elixir|tintura|pasta|film|pel[ií]cula|lengüeta|disco|anillo|dispositivo|kit/i;
const UNIT_RE = /\b(?:mg|mcg|µg|g|gr|grs|kg|ml|l|lt|oz|ui|iu|cm|mm|m)\b|pieza|pza|unidad|tableta|c[aá]psula|comprimido|gragea|perla|caja|sobre|frasco|pluma|ampoll?eta|ampolla|jeringa|vial|tubo|bolsa|botella|lata|par\b|kit|toallita|parche|supositorio|[oó]vulo|disco|lanceta|tira|dosis|pastilla|gomita|cartucho|bote|barra|paquete|rollo|spray|aplicador|sachet|dispositivo|set|juego|pack|blister|capa/i;
const PLACEHOLDER_RE = /\b(?:lorem|ipsum|n\/a|n\.a\.|s\/d|sin datos?|por definir|por completar|pendiente|xxx+|tbd|null|undefined)\b|\?\?\?/i;
const ABBR_RE = /\b(?:TABS?|CAJ|CJA|FCO|AMP|SUSP|SOL|COMP|CAPS|PZAS?|PZ|C\/U|SOB)\b|\bc\/\s?\d/;

/* Familias para detectar contradicciones forma ↔ vía (reglas objetivas, sin inferir nada). */
const formaFam = f => {
  const t = fold(f);
  if (/vaginal|rectal|oftalm|ocular|otic|nasal|oral\b.*topic|topic.*oral/.test(t)) return 'otra';
  if (/inyect|ampoll?eta|ampolla|vial|pluma|jeringa|cartucho|liofiliz/.test(t)) return 'inyectable';
  if (/tablet|comprim|capsul|gragea|perla|granul|pastilla|chicle|sobre/.test(t)) return 'oral';
  if (/crema|gel\b|unguento|pomada|locion|parche|espuma|shampoo|champu/.test(t)) return 'topica';
  return 'otra';
};
const viaFam = v => {
  const t = fold(v);
  if (/subcut|intraven|intramusc|intraderm|parenteral|inyect|intravit|epidural/.test(t)) return 'inyectable';
  if (/\boral\b|sublingual|bucal|via oral/.test(t)) return 'oral';
  if (/topic|cutane|dermic|transderm/.test(t)) return 'topica';
  return 'otra';
};

/* Tokens de dosis «10 mg» para comparar la concentración declarada con otros textos. */
function doseTokens(text) {
  const out = [], re = /(\d+(?:[.,]\d+)?)\s*(mg|mcg|µg|ug|g|ui|iu)\b/gi;
  let m;
  while ((m = re.exec(str(text)))) out.push({ n: parseFloat(m[1].replace(',', '.')), u: m[2].toLowerCase().replace('µg', 'mcg').replace('ug', 'mcg').replace('iu', 'ui') });
  return out;
}

/* Revisión de lenguaje de un texto GENERADO reutilizando F.lint (una sola lista de términos en toda la app). */
function lintText(text, catId) {
  return F.lint({ id: catId, fields: [{ key: 't', label: 'Texto generado' }] }, { t: str(text) });
}

/* ---------- resultados ---------- */
const OK = nota => ({ estado: 'cumple', nota: nota || '' });
const FAIL = (detalle, datos) => ({ estado: 'incumple', detalle, datos: datos || null });
const NA = motivo => ({ estado: 'no_aplica', motivo });
const NO_HTML = 'Sin HTML de Magento (se diagnostica en Magento Readiness).';

const RULES = [];
function R(id, dimension, o) {
  RULES.push(Object.assign({ id, dimension, categorias: 'todas', peso: 0, severidad: 'warning', clase: 'contenido', campo: '' }, o));
}

/* --- Completitud: ¿la ficha dice lo que quien compra necesita saber? --- */
const missingOf = (ctx, group) => (INFO[ctx.cat] && INFO[ctx.cat][group] || []).filter(spec => !spec.split('|').some(k => ctx.val(k)));
const labelsOf = (ctx, specs) => specs.map(spec => spec.split('|').map(k => labelOf(ctx.c, k)).join(' o '));
const keysOf = specs => specs.flatMap(spec => spec.split('|'));
function groupRule(group, quien) {
  return ctx => {
    if (!INFO[ctx.cat]) return NA('La categoría no define información mínima.');
    const miss = missingOf(ctx, group);
    return miss.length ? FAIL(`Falta ${labelsOf(ctx, miss).join(', ')}.`, { faltantes: labelsOf(ctx, miss), campos: keysOf(miss) }) : OK(quien);
  };
}
R('CMP-001', 'completitud', { peso: 6, severidad: 'error', clase: 'faltante', descripcion: 'La ficha identifica el producto (marca y su identificador principal).', explicacion: 'Sin identidad clara, quien compra no sabe qué producto es.', accion: 'Captura la marca y el dato que identifica al producto (principio activo, modelo, producto o tipo).', evaluar: groupRule('identidad') });
R('CMP-002', 'completitud', { peso: 8, severidad: 'warning', clase: 'faltante', descripcion: 'La ficha incluye la información técnica propia de su categoría.', explicacion: 'Concentración, forma y vía en medicamentos; tecnología, atributo o material en el resto: es lo que distingue un producto de otro.', accion: 'Captura los datos técnicos que faltan tal cual vienen en el empaque o la ficha de origen.', evaluar: groupRule('tecnica') });
R('CMP-003', 'completitud', { peso: 6, severidad: 'warning', clase: 'faltante', descripcion: 'La ficha indica quién fabrica el producto (laboratorio o fabricante).', explicacion: 'El origen es un dato que quien compra espera y que la ficha no debe omitir.', accion: 'Captura el laboratorio o fabricante exactamente como aparece en el empaque.', evaluar: groupRule('origen') });

/* --- Ficha técnica (sobre el HTML de Magento ya generado) --- */
R('FT-001', 'fichaTecnica', { peso: 5, severidad: 'error', clase: 'faltante', descripcion: 'La descripción de Magento incluye una ficha técnica en forma de lista.', explicacion: 'La ficha técnica ordena los datos del producto para consultarlos de un vistazo.', accion: 'Completa los datos obligatorios para que se genere el HTML de Magento con su ficha técnica.',
  evaluar: ctx => !ctx.html ? NA(NO_HTML) : /<ul[\s>][\s\S]*?<li[\s>]/i.test(ctx.html) ? OK() : FAIL('El HTML no contiene una lista de ficha técnica.') });
R('FT-002', 'fichaTecnica', { peso: 6, severidad: 'warning', clase: 'contenido', descripcion: 'Todo dato capturado que usa la descripción aparece en ella.', explicacion: 'Un dato capturado que no llega al texto final es información que quien compra no ve.', accion: 'Revisa por qué el dato no aparece en el HTML (plantilla o dato mal capturado).',
  evaluar: ctx => {
    if (!ctx.html) return NA(NO_HTML);
    const lost = (ctx.c.mgUses || []).filter(k => ctx.mgVal(k) && !contains(ctx.plain, ctx.mgVal(k))).map(k => labelOf(ctx.c, k));
    return lost.length ? FAIL(`No aparece en la descripción: ${lost.join(', ')}.`, { datos: lost }) : OK();
  } });
R('FT-003', 'fichaTecnica', { peso: 4, severidad: 'warning', clase: 'contenido', descripcion: 'La ficha técnica no tiene entradas vacías.', explicacion: 'Una etiqueta sin valor confunde y se ve como un error de carga.', accion: 'Completa el dato de la entrada vacía o quita esa línea de la plantilla.',
  evaluar: ctx => {
    if (!ctx.html) return NA(NO_HTML);
    const empty = [...ctx.html.matchAll(/<li[^>]*>\s*<strong>([^<]*)<\/strong>\s*<\/li>/gi)].map(m => squash(m[1]).replace(/:$/, ''));
    return empty.length ? FAIL(`Entradas sin valor: ${empty.join(', ')}.`, { entradas: empty }) : OK();
  } });

/* --- Descripción --- */
R('DES-001', 'descripcion', { peso: 3, severidad: 'error', clase: 'faltante', descripcion: 'Existe la descripción de Merchant Center.', explicacion: 'Sin descripción, la ficha no se puede publicar en Merchant Center.', accion: 'Captura al menos la marca y los datos principales para generar la descripción.',
  evaluar: ctx => ctx.res.mc.text ? OK() : FAIL('No se generó la descripción de Merchant Center.') });
R('DES-002', 'descripcion', { peso: 4, severidad: 'warning', clase: 'contenido', descripcion: 'Las descripciones nombran la marca y el identificador principal del producto.', explicacion: 'Una descripción que no nombra el producto no sirve por sí sola.', accion: 'Revisa la plantilla de la descripción o el dato de marca.',
  evaluar: ctx => {
    const brand = ctx.val('marca');
    if (!brand) return NA('El producto no tiene marca.');
    const idKey = ['principio', 'modelo', 'producto', 'componente', 'tipo'].find(k => ctx.val(k) && (ctx.c.fields || []).some(f => f.key === k));
    const miss = [];
    [['Merchant Center', ctx.res.mc.text], ['descripción de Magento', ctx.plain]].forEach(([n, t]) => {
      if (!t) return;
      if (!contains(t, brand)) miss.push(`${n}: no nombra la marca`);
      else if (idKey && !contains(t, ctx.val(idKey))) miss.push(`${n}: no nombra ${labelOf(ctx.c, idKey)}`);
    });
    return miss.length ? FAIL(miss.join('; ') + '.', { problemas: miss }) : OK();
  } });
R('DES-003', 'descripcion', { peso: 3, severidad: 'warning', clase: 'contenido', descripcion: 'Ni los datos ni los textos contienen relleno o marcadores («N/A», «pendiente», «por definir», «lorem»).', explicacion: 'El relleno no es información y no debe llegar a la tienda.', accion: 'Reemplaza el relleno por el dato real o deja el campo vacío.',
  evaluar: ctx => {
    const hits = [];
    Object.keys(ctx.v).forEach(k => { const m = str(ctx.v[k]).match(PLACEHOLDER_RE); if (m) hits.push(`${labelOf(ctx.c, k)}: «${m[0]}»`); });
    [['Merchant Center', ctx.res.mc.text], ['descripción de Magento', ctx.plain]].forEach(([n, t]) => { const m = str(t).match(PLACEHOLDER_RE); if (m) hits.push(`${n}: «${m[0]}»`); });
    return hits.length ? FAIL(`Relleno encontrado en ${uniq(hits).join('; ')}.`, { hallazgos: uniq(hits) }) : OK();
  } });

/* --- Presentación y forma --- */
R('PRE-001', 'presentacion', { peso: 5, severidad: 'warning', clase: 'faltante', descripcion: 'La presentación declara cantidad y unidad o envase (por ejemplo «Caja con 28 tabletas»).', explicacion: 'Quien compra necesita saber cuánto contiene el producto.', accion: 'Captura la presentación con su cantidad y unidad, tal cual del empaque.',
  evaluar: ctx => {
    const keys = PRES_KEYS[ctx.cat] || ['contenido'];
    const present = keys.map(k => ({ k, t: ctx.val(k) })).filter(x => x.t);
    if (!present.length) return FAIL(`Falta ${keys.map(k => labelOf(ctx.c, k)).join(' o ')}.`, { campos: keys });
    const bad = present.filter(x => !/\d/.test(x.t) || (!/^\s*\d+(?:[.,]\d+)?\s*$/.test(x.t) && !UNIT_RE.test(x.t)));
    return bad.length === present.length ? FAIL(`«${bad[0].t}» no declara cantidad y unidad reconocibles.`, { valor: bad[0].t }) : OK();
  } });
R('PRE-002', 'presentacion', { peso: 5, severidad: 'warning', clase: 'contenido', categorias: ['med', 'sup'], descripcion: 'La forma es una forma farmacéutica o de presentación reconocida.', explicacion: 'Una forma escrita en abreviatura o con un valor ajeno confunde en la ficha.', accion: 'Escribe la forma completa (por ejemplo «Tableta», «Cápsula», «Solución inyectable»).',
  evaluar: ctx => { const f = ctx.val('forma'); return !f ? NA('Sin forma: se evalúa en CMP-002.') : FORMA_RE.test(fold(f)) || FORMA_RE.test(f) ? OK() : FAIL(`«${f}» no es una forma reconocida.`, { valor: f }); } });

/* --- Coherencia y contradicciones --- */
R('COH-C01', 'coherencia', { peso: 5, severidad: 'error', clase: 'contradiccion', categorias: ['med'], descripcion: 'La forma farmacéutica y la vía de administración no se contradicen.', explicacion: 'Por ejemplo, una tableta no se administra por vía subcutánea ni una solución inyectable por vía oral.', accion: 'Revisa la forma y la vía contra el empaque; uno de los dos datos está mal.',
  evaluar: ctx => {
    const f = ctx.val('forma'), v = ctx.val('via');
    if (!f || !v) return NA('Falta forma o vía.');
    const ff = formaFam(f), vf = viaFam(v);
    return ff !== 'otra' && vf !== 'otra' && ff !== vf ? FAIL(`La forma «${f}» (${ff}) no es compatible con la vía «${v}» (${vf}).`, { forma: f, via: v }) : OK();
  } });
R('COH-C02', 'coherencia', { peso: 4, severidad: 'error', clase: 'contradiccion', categorias: ['med'], descripcion: 'La declaración de receta no se contradice con los textos de la ficha.', explicacion: 'Un producto sin receta no puede decir que la requiere, ni al revés.', accion: 'Corrige la leyenda o la declaración de receta según el empaque.',
  evaluar: ctx => {
    const rc = ctx.val('receta');
    if (!rc) return NA('Receta sin declarar: se evalúa en SEG-001.');
    const sources = [['leyenda', ctx.val('leyenda')], ['Merchant Center', ctx.res.mc.text], ['descripción de Magento', ctx.plain]];
    const bad = [];
    sources.forEach(([n, t]) => {
      if (!t) return;
      if (rc === 'si' && /\b(?:venta libre|sin receta|no requiere receta)\b/i.test(t)) bad.push(`${n} dice que no requiere receta`);
      if (rc === 'no' && /(?<!no )(?<!sin )\b(?:requiere receta|con receta|bajo receta)/i.test(t)) bad.push(`${n} dice que requiere receta`);
    });
    return bad.length ? FAIL(`Declaraste ${rc === 'si' ? 'que requiere' : 'que no requiere'} receta, pero ${bad.join('; ')}.`, { conflictos: bad }) : OK();
  } });
R('COH-C03', 'coherencia', { peso: 3, severidad: 'warning', clase: 'contradiccion', categorias: ['med'], descripcion: 'La concentración declarada coincide con las cifras de dosis de otros textos de la ficha.', explicacion: 'Si la leyenda o la presentación citan otra cantidad con la misma unidad, hay una posible contradicción.', accion: 'Verifica la concentración contra el empaque; si son varias presentaciones, sepáralas en fichas distintas.',
  evaluar: ctx => {
    const decl = doseTokens(ctx.val('concentracion'));
    if (!decl.length) return NA('Sin concentración con cifra y unidad.');
    const others = [['leyenda', ctx.val('leyenda')], ['presentación', ctx.val('contenido')]];
    const bad = [];
    others.forEach(([n, t]) => doseTokens(t).forEach(x => {
      const same = decl.filter(d => d.u === x.u);
      if (same.length && !same.some(d => d.n === x.n)) bad.push(`${n} cita ${x.n} ${x.u}`);
    }));
    return bad.length ? FAIL(`La concentración es «${ctx.val('concentracion')}», pero ${uniq(bad).join('; ')}.`, { conflictos: uniq(bad) }) : OK();
  } });
R('COH-C04', 'coherencia', { peso: 3, severidad: 'warning', clase: 'contradiccion', categorias: ['med'], descripcion: 'El volumen solo se declara en líquidos e inyectables.', explicacion: 'Un volumen en una tableta o cápsula es un dato que no corresponde a la forma.', accion: 'Quita el volumen o corrige la forma farmacéutica.',
  evaluar: ctx => { const vol = ctx.val('volumen'), f = ctx.val('forma'); if (!vol) return NA('Sin volumen.'); if (!f) return NA('Sin forma.'); return formaFam(f) === 'oral' ? FAIL(`Hay volumen «${vol}» en una forma sólida («${f}»).`, { volumen: vol, forma: f }) : OK(); } });

/* --- Seguridad y conservación --- */
const hasSunscreen = ctx => ctx.cat === 'cos' && !!ctx.val('fps');
R('SEG-001', 'seguridad', { peso: 5, severidad: 'error', clase: 'faltante', descripcion: 'Está declarado el dato de seguridad que la categoría exige (receta en medicamentos; modo de uso y precauciones en protectores solares).', explicacion: 'Son datos regulatorios: no se infieren ni se inventan.', accion: 'Captura el dato tal como viene en el empaque.',
  evaluar: ctx => {
    if (ctx.cat === 'med') return ctx.val('receta') ? OK() : FAIL('Falta declarar si requiere receta médica.', { campos: ['receta'] });
    if (hasSunscreen(ctx)) { const miss = ['modo', 'precauciones'].filter(k => !ctx.val(k)); return miss.length ? FAIL(`Protector solar sin ${miss.map(k => labelOf(ctx.c, k)).join(' ni ')}.`, { campos: miss }) : OK(); }
    return NA('La categoría no exige un dato de seguridad propio.');
  } });
R('SEG-002', 'seguridad', { peso: 5, severidad: 'warning', clase: 'contenido', descripcion: 'El aviso de seguridad aparece en el texto final.', explicacion: 'En medicamentos, «consulte a su médico» y «evite automedicarse»; en protectores solares, las precauciones capturadas.', accion: 'Revisa la plantilla o el dato: el aviso no llegó a la descripción.',
  evaluar: ctx => {
    if (ctx.cat === 'med') {
      if (!ctx.html) return NA(NO_HTML);
      const t = ctx.plain + ' ' + str(ctx.res.mc.text);
      const miss = [['consulte a su medico', 'consulte a su médico'], ['automedic', 'evite automedicarse']].filter(([k]) => !alnum(t).includes(alnum(k))).map(x => x[1]);
      return miss.length ? FAIL(`Falta en el texto: ${miss.join(', ')}.`, { faltan: miss }) : OK();
    }
    if (hasSunscreen(ctx)) {
      const p = ctx.val('precauciones');
      if (!p) return NA('Sin precauciones capturadas: se evalúa en SEG-001.');
      if (!ctx.html) return NA(NO_HTML);
      return contains(ctx.plain, p) ? OK() : FAIL('Las precauciones capturadas no aparecen en la descripción de Magento.');
    }
    return NA('La categoría no exige aviso de seguridad.');
  } });
R('SEG-003', 'seguridad', { peso: 0, severidad: 'info', clase: 'mejora', categorias: ['med'], descripcion: 'Existe la sección de conservación (informativo: es texto de plantilla; la herramienta no tiene un dato de conservación propio de cada producto).', explicacion: 'Si el producto exige una condición especial (por ejemplo refrigeración), debe indicarse en la leyenda adicional con el dato de la ficha de origen. La herramienta no lo infiere.', accion: 'Si el empaque indica una condición de conservación especial, agrégala en «Leyenda regulatoria adicional».',
  evaluar: ctx => !ctx.html ? NA(NO_HTML) : /condiciones de conservaci[oó]n/i.test(stripTags(ctx.html)) ? OK('Sección presente (texto de plantilla; sin dato de conservación propio del producto).') : FAIL('La descripción no incluye la sección de conservación.') });

/* --- Claridad y repetición --- */
R('CLA-001', 'claridad', { peso: 4, severidad: 'warning', clase: 'contenido', descripcion: 'Forma y presentación no usan abreviaturas sin expandir («TAB», «CAJ», «C/28», «FCO»).', explicacion: 'Las abreviaturas de catálogo interno no son claras para quien compra.', accion: 'Escribe el término completo («Tabletas», «Caja», «Frasco»).',
  evaluar: ctx => {
    const hits = ['forma', 'contenido', 'presentacion', 'paquete', 'tipo'].filter(k => ctx.val(k) && ABBR_RE.test(ctx.val(k))).map(k => `${labelOf(ctx.c, k)}: «${ctx.val(k).match(ABBR_RE)[0]}»`);
    return hits.length ? FAIL(`Abreviaturas sin expandir: ${hits.join('; ')}.`, { hallazgos: hits }) : OK();
  } });
R('CLA-002', 'claridad', { peso: 3, severidad: 'warning', clase: 'contenido', descripcion: 'Los datos no están escritos en mayúsculas sostenidas.', explicacion: 'Un dato en mayúsculas completas se lee como gritado y suele venir de un sistema interno.', accion: 'Escribe el dato con mayúsculas y minúsculas normales.',
  evaluar: ctx => {
    const hits = (ctx.c.fields || []).filter(fd => fd.type !== 'select' && !fd.raw && fd.key !== 'marca').filter(fd => {
      const t = ctx.val(fd.key), letters = t.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '');
      return letters.length >= 8 && letters.replace(/[^A-ZÁÉÍÓÚÜÑ]/g, '').length / letters.length >= 0.8;
    }).map(fd => fd.label);
    return hits.length ? FAIL(`En mayúsculas sostenidas: ${hits.join(', ')}.`, { campos: hits }) : OK();
  } });
R('CLA-003', 'claridad', { peso: 3, severidad: 'warning', clase: 'contenido', descripcion: 'Dos datos distintos no repiten el mismo valor.', explicacion: 'Repetir el mismo valor en campos distintos suele ser un error de captura y duplica información en la ficha.', accion: 'Deja cada dato en su campo y quita la repetición.',
  evaluar: ctx => {
    const seen = new Map(), dup = [];
    (ctx.c.fields || []).filter(fd => fd.type !== 'select').forEach(fd => {
      const t = ctx.val(fd.key), k = fold(t).replace(/\s+/g, ' ');
      if (!t || k.length < 3 || /^[\d\s.,]+$/.test(k)) return;
      const prev = seen.get(k);
      /* Marca = principio activo (genéricos) y marca = fabricante o laboratorio son legítimos: no se marcan. */
      const legit = (a, b) => (a === 'marca' && ['principio', 'fabricante', 'laboratorio'].includes(b)) || (b === 'marca' && ['principio', 'fabricante', 'laboratorio'].includes(a));
      if (prev && !legit(prev, fd.key)) dup.push(`${labelOf(ctx.c, prev)} y ${fd.label}`);
      else if (!prev) seen.set(k, fd.key);
    });
    return dup.length ? FAIL(`Mismo valor en: ${dup.join('; ')}.`, { pares: dup }) : OK();
  } });

/* --- Claims (sobre los textos GENERADOS; los datos de entrada los revisa Quality) --- */
R('CLM-001', 'claims', { peso: 6, severidad: 'error', clase: 'contenido', descripcion: 'Los textos generados no contienen claims prohibidos («cura», «elimina», «garantiza», «el mejor»).', explicacion: 'Un claim en el texto final es una promesa que la ficha no puede sostener.', accion: 'Quita el claim del dato de entrada que llega a la descripción.',
  evaluar: ctx => {
    const terms = uniq([...lintText(ctx.res.mc.text, ctx.cat).claim, ...lintText(ctx.plain, ctx.cat).claim].map(x => x.term));
    return terms.length ? FAIL(`Claims en el texto generado: «${terms.join('», «')}».`, { terminos: terms }) : OK();
  } });
R('CLM-002', 'claims', { peso: 4, severidad: 'warning', clase: 'contenido', descripcion: 'Los textos generados no usan lenguaje subjetivo, afirmaciones sin respaldo ni lenguaje comercial en medicamentos.', explicacion: 'Términos como «ideal», «perfecto», «piel sensible» o «oferta» no describen el producto.', accion: 'Reescribe el dato de entrada con una descripción objetiva o valida la afirmación con el empaque.',
  evaluar: ctx => {
    const L = [lintText(ctx.res.mc.text, ctx.cat), lintText(ctx.plain, ctx.cat)];
    const terms = uniq(L.flatMap(x => [...x.vacio, ...x.amber, ...(x.med || [])]).map(x => x.term));
    if (ctx.cat === 'med') [ctx.res.mc.text, ctx.plain].forEach(t => { const m = str(t).match(F.COMERCIAL_RE); if (m) terms.push(m[0]); });
    const all = uniq(terms);
    return all.length ? FAIL(`Lenguaje por revisar en el texto generado: «${all.join('», «')}».`, { terminos: all }) : OK();
  } });

const ruleById = id => RULES.find(r => r.id === id) || null;
const hasData = v => !!v && typeof v === 'object' && Object.values(v).some(x => str(x).trim());

/* ---------- evaluación ---------- */
function buildContext(item, o) {
  const cat = item.cat, c = F.CATS[cat];
  const v = item.v && typeof item.v === 'object' ? item.v : {};
  const res = o.res || F.computeFor(cat, v, o.keep || new Set(), o.metaCfg);
  const html = res.mg && res.mg.html ? res.mg.html : '';
  return { item, cat, c, v, res, html, plain: stripTags(html), val: k => squash(v[k]), mgVal: k => squash(res.vm && res.vm.v ? res.vm.v[k] : v[k]) };
}
function runRule(rule, ctx) {
  const applies = rule.categorias === 'todas' || rule.categorias.includes(ctx.cat);
  const r = !applies ? NA(`No aplica a la categoría ${ctx.c.name}.`) : rule.evaluar(ctx);
  const incumple = r.estado === 'incumple';
  const estado = r.estado === 'no_aplica' ? 'no_aplica' : !incumple ? 'cumple' : rule.severidad === 'error' ? 'error' : 'pendiente';
  const posibles = estado === 'no_aplica' ? 0 : round2(rule.peso);
  const perdidos = incumple ? round2(posibles * SEVERITY_LOSS[rule.severidad]) : 0;
  return {
    id: rule.id, dimension: rule.dimension, clase: rule.clase, regla: rule.descripcion, estado, simbolo: SIMBOLO[estado], severidad: rule.severidad,
    resultado: estado === 'no_aplica' ? `No aplica — ${r.motivo}` : incumple ? r.detalle : (r.nota || 'Cumple.'),
    explicacion: rule.explicacion, accion: incumple ? rule.accion : '', peso: rule.peso, posibles, obtenidos: round2(posibles - perdidos), perdidos, datos: r.datos || null
  };
}
const WORST = { error: 3, pendiente: 2, cumple: 1, no_aplica: 0 };
function dimension(key, results) {
  const rs = results.filter(x => x.dimension === key);
  const posibles = round2(rs.reduce((a, x) => a + x.posibles, 0)), obtenidos = round2(rs.reduce((a, x) => a + x.obtenidos, 0));
  const ev = rs.filter(x => x.estado !== 'no_aplica');
  const estado = !ev.length ? 'no_aplica' : ev.reduce((w, x) => WORST[x.estado] > WORST[w] ? x.estado : w, 'cumple');
  return { dimension: key, label: DIMENSIONS[key].label, maximo: DIMENSIONS[key].max, posibles, obtenidos, score: posibles > 0 ? Math.round(100 * obtenidos / posibles) : null, estado, simbolo: SIMBOLO[estado], evaluable: ev.length > 0, rules: rs };
}
function recommendationsFrom(findings) {
  return findings.map(f => ({
    reglaId: f.id, dimension: f.dimension, clase: f.clase, severidad: f.severidad, estado: f.estado,
    puntosRecuperables: f.perdidos, texto: f.accion, resultado: f.resultado, datos: f.datos
  })).sort((a, b) => (b.estado === 'error') - (a.estado === 'error') || b.puntosRecuperables - a.puntosRecuperables || a.reglaId.localeCompare(b.reglaId));
}
function explain(total, status, findings) {
  if (total == null) return 'Content sin evaluar: captura datos del producto.';
  const e = findings.filter(f => f.estado === 'error').length, w = findings.filter(f => f.estado === 'pendiente').length;
  if (e) return `Content ${total}/100: corrige ${e} error(es) de contenido${w ? ` y revisa ${w} aviso(s)` : ''}.`;
  if (w) return `Content ${total}/100: revisa ${w} aviso(s) de contenido.`;
  return `Content ${total}/100: sin hallazgos de contenido.`;
}

/* Evalúa un producto {cat, v}. Opciones: keep, metaCfg, res (computeFor ya calculado). */
function evaluate(item, o) {
  o = o || {};
  item = item || {};
  const empty = status => ({ schema: SCHEMA, version: VERSION, status, statusLabel: STATUS_LABEL[status], score: { total: null, puntos: { obtenidos: 0, posibles: 0 }, formula: FORMULA }, dimensions: {}, findings: [], recommendations: [], explain: explain(null), context: { categoria: item.cat || '' } });
  if (!F.CATS[item.cat] || !hasData(item.v)) return empty('sin_evaluar');
  const ctx = buildContext(item, o);
  const results = RULES.map(r => runRule(r, ctx));
  const posibles = round2(results.reduce((a, x) => a + x.posibles, 0)), obtenidos = round2(results.reduce((a, x) => a + x.obtenidos, 0));
  const total = posibles > 0 ? Math.round(100 * obtenidos / posibles) : null;
  const findings = results.filter(x => x.estado === 'error' || x.estado === 'pendiente').sort((a, b) => WORST[b.estado] - WORST[a.estado] || b.perdidos - a.perdidos || a.id.localeCompare(b.id));
  const status = total === null ? 'sin_evaluar' : findings.some(x => x.estado === 'error') ? 'critico' : findings.some(x => x.peso > 0 || x.severidad !== 'info') ? 'revisar' : 'listo';
  const dims = {};
  Object.keys(DIMENSIONS).forEach(k => { dims[k] = dimension(k, results); });
  return {
    schema: SCHEMA, version: VERSION, status, statusLabel: STATUS_LABEL[status],
    score: { total, puntos: { obtenidos, posibles }, formula: FORMULA },
    dimensions: dims, findings, recommendations: recommendationsFrom(findings), explain: explain(total, status, findings),
    context: { categoria: item.cat, lote: !!o.batch }
  };
}

function evaluateBatch(items, o) {
  o = o || {};
  const list = Array.isArray(items) ? items : [];
  const results = list.map((it, i) => evaluate(it, Object.assign({}, o, { batch: true, res: (o.resList && o.resList[i]) || undefined })));
  return { items: results, summary: summarizeBatch(results) };
}
function summarizeBatch(evals) {
  const byStatus = { critico: 0, revisar: 0, listo: 0, sin_evaluar: 0 }, scores = [];
  (evals || []).forEach(e => { byStatus[(e && e.status) || 'sin_evaluar']++; if (e && e.score && e.score.total != null) scores.push(e.score.total); });
  return { total: (evals || []).length, evaluados: scores.length, byStatus, average: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null, min: scores.length ? Math.min(...scores) : null, max: scores.length ? Math.max(...scores) : null };
}

/* «¿Por qué obtuve este score?»: todo sale de las mismas reglas evaluadas. */
function explainScore(ev) {
  if (!ev || !ev.score || ev.score.total == null) return { total: null, puntos: { obtenidos: 0, posibles: 0 }, formula: FORMULA, dimensiones: [], incumplidas: [] };
  return {
    total: ev.score.total, puntos: ev.score.puntos, formula: FORMULA,
    dimensiones: Object.values(ev.dimensions).map(d => ({ dimension: d.dimension, label: d.label, obtenidos: d.obtenidos, posibles: d.posibles, score: d.score, evaluable: d.evaluable,
      reglas: d.rules.map(x => ({ id: x.id, regla: x.regla, estado: x.estado, simbolo: x.simbolo, severidad: x.severidad, obtenidos: x.obtenidos, posibles: x.posibles, resultado: x.resultado, accion: x.accion })) })),
    incumplidas: ev.findings.map(x => ({ id: x.id, regla: x.regla, estado: x.estado, severidad: x.severidad, obtenidos: x.obtenidos, posibles: x.posibles, resultado: x.resultado, accion: x.accion }))
  };
}

const api = { SCHEMA, VERSION, FORMULA, SEVERITY_LOSS, DIMENSIONS, STATUS_LABEL, ESTADO_LABEL, SIMBOLO, INFO, RULES, ruleById, evaluate, evaluateBatch, summarizeBatch, explainScore };
if (isNode) module.exports = api; else root.FichasContent = api;
})(typeof self !== 'undefined' ? self : this);
