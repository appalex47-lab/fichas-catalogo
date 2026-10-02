/*
 * Fase 8: motor SEO y SEO Score (contrato fichas.seo.v1).
 *
 * Este módulo NO es un segundo motor de reglas. Consume lo que ya existe en logic.js
 * (computeFor, lint, scanRed, COMERCIAL_RE, ALT_BAD_START_RE, TITLE_MAX, dupBrand, defMetaCat, CATS)
 * y en anomalies.js (duplicados del lote). Las reglas confirmadas se leen de esas fuentes; aquí solo se
 * REGISTRAN (inventario), se VALIDAN contra los datos del producto y se PUNTÚAN.
 * Orden de la fase: primero existe la regla, después la validación, después el diagnóstico, después el score.
 *
 * No usa factores de posicionamiento externos (volumen de búsqueda, CTR, ranking, autoridad, competencia,
 * probabilidad de posicionamiento ni puntajes de keywords) porque la herramienta no tiene esos datos.
 * Funciona en navegador (window.FichasSEO) y en Node (require).
 */
(function (root) {
'use strict';
const isNode = typeof module !== 'undefined' && module.exports;
const F = isNode ? require('./logic.js') : root.Fichas;
const A = isNode ? (() => { try { return require('./anomalies.js'); } catch (_) { return null; } })() : (root.FichasAnomalies || null);

const SCHEMA = 'fichas.seo.v1';
const VERSION = '1.0';
/* Una regla provisional pesa la mitad que una confirmada (decisión de diseño documentada en PHASE_8). */
const PROVISIONAL_FACTOR = 0.5;
/* Fracción de los puntos de una regla que se pierde cuando no se cumple, según su severidad. */
const SEVERITY_LOSS = { error: 1, warning: 0.5, info: 0 };
const FORMULA = 'SEO total = round(100 × Σ puntos obtenidos ÷ Σ puntos posibles). '
  + 'Posibles de una regla = peso × (1 si es confirmada, 0.5 si es provisional); las reglas «No aplica» no suman. '
  + 'Obtenidos = posibles × (1 − pérdida): cumple 0%, aviso 50%, error 100%, informativo 0%.';

/* Origen de las reglas: los mismos textos que usa el documento de reglas (rules.js, SRC). */
const ORIGEN = {
  pTit: 'Prompt aprobado de títulos',
  pMc: 'Prompt aprobado de Merchant Center',
  pMg: 'Prompt aprobado de descripciones de Magento',
  seo: 'Estructura de la agencia de SEO',
  batch: 'Formato de carga de Magento (Batch)',
  nom: 'NOM-141-SSA1/SCFI-2012',
  herr: 'Criterio de la herramienta',
  reg: 'Por completar por Regulatorio',
  tec: 'Regla técnica objetiva (Fase 8)',
  prop: 'Propuesta de la herramienta (Fase 8), sin validar'
};

const COMPONENTS = {
  title: { label: 'Título SEO', max: 20 },
  metaTitle: { label: 'Meta title', max: 20 },
  metaDescription: { label: 'Meta description', max: 20 },
  alt: { label: 'Alt', max: 15 },
  content: { label: 'Contenido', max: 15 },
  consistency: { label: 'Coherencia', max: 10 },
  magento: { label: 'Magento (relacionado con SEO)', max: 0 }
};
const CLASES = {
  titulo: 'Título', merchant_center: 'Merchant Center', meta_title: 'Meta title', meta_description: 'Meta description', alt: 'Alt',
  claims: 'Claims', longitud: 'Longitud', estructura: 'Estructura', obligatorios: 'Campos obligatorios', duplicacion: 'Duplicación',
  coherencia: 'Coherencia', confirmacion: 'Confirmación por categoría', imagen: 'Imagen', contenido: 'Contenido', magento: 'Magento relacionado con SEO'
};
const STATUS_LABEL = { critico: 'SEO crítico', revisar: 'SEO por revisar', pendiente: 'SEO pendiente', listo: 'SEO listo', sin_evaluar: 'SEO sin evaluar' };
const SIMBOLO = { cumple: '✓', pendiente: '⚠', error: '❌', no_aplica: 'ℹ' };
const ESTADO_LABEL = { cumple: 'Cumple', pendiente: 'Pendiente', error: 'Error', no_aplica: 'No aplica' };

/* Datos de identidad por categoría usados por las reglas de coherencia (propuesta de la herramienta). */
const IDENTITY = {
  med: ['marca', 'concentracion', 'principio'], dis: ['marca', 'modelo'], cos: ['marca', 'producto'], sup: ['marca', 'componente'],
  beb: ['marca', 'tipo'], hig: ['marca', 'producto'], acc: ['marca', 'producto']
};

/* ---------- utilidades puras ---------- */
const str = x => String(x == null ? '' : x);
const norm = s => F.fold(str(s)).toLowerCase().replace(/\s+/g, ' ').trim();
const stripTags = h => str(h).replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
const includesNorm = (text, part) => { const p = norm(part); return !!p && norm(text).includes(p); };
const uniq = a => [...new Set(a)];
const round2 = n => Math.round(n * 100) / 100;

/* Caracteres y formatos problemáticos: reglas objetivas, sin criterio editorial. */
function hygiene(text, o) {
  o = o || {};
  const t = str(text), p = [];
  if (!t) return p;
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(t)) p.push('caracteres de control');
  if (/[\u00A0\u200B-\u200D\uFEFF]/.test(t)) p.push('caracteres invisibles (espacio duro o de ancho cero)');
  if (/\uFFFD|[ÃÂ][\u0080-\u00BF]/.test(t)) p.push('caracteres mal codificados');
  if (/\{\w+(?::\w+)?\}/.test(t)) p.push('marcador sin resolver');
  if (/\b(undefined|null|NaN)\b/.test(t)) p.push('valor técnico («undefined», «null» o «NaN»)');
  if (!o.html && /[<>"]/.test(t)) p.push('caracteres que pueden romper HTML (<, > o comillas dobles)');
  if (!o.multiline) {
    if (/\s{2,}/.test(t)) p.push('espacios dobles');
    if (/^\s|\s$/.test(t)) p.push('espacios al inicio o al final');
    if (/\s[,;]/.test(t)) p.push('espacio antes de coma o punto y coma');
    if (/[,;]\s*[,;]|\|\s*\|/.test(t)) p.push('separadores repetidos');
    if (/^[\s|,;:\-–]/.test(t) || /[|,;:\-–]\s*$/.test(t)) p.push('separador al inicio o al final');
    if (/(?<![\p{L}\p{N}])(\p{L}{2,})\s+\1(?![\p{L}\p{N}])/iu.test(t)) p.push('palabra repetida consecutivamente');
  }
  return p;
}
const VOID_TAGS = new Set(['br', 'hr', 'img', 'meta', 'input', 'link']);
function htmlProblems(html) {
  const p = [], stack = [], re = /<\/?([a-zA-Z][\w-]*)\b[^>]*>/g;
  let m;
  while ((m = re.exec(html))) {
    const name = m[1].toLowerCase(), closing = m[0][1] === '/';
    if (VOID_TAGS.has(name) || /\/>$/.test(m[0])) continue;
    if (!closing) stack.push(name);
    else if (stack[stack.length - 1] === name) stack.pop();
    else p.push(`etiqueta </${name}> sin apertura o mal anidada`);
  }
  stack.forEach(n => p.push(`etiqueta <${n}> sin cerrar`));
  if (/<(p|li|h[1-6]|td|th|strong)>\s*<\/\1>/i.test(html)) p.push('etiqueta vacía');
  return uniq(p);
}
function repeatedWords(text) {
  const seen = new Map();
  norm(text).split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !/^\d+$/.test(w)).forEach(w => seen.set(w, (seen.get(w) || 0) + 1));
  return [...seen].filter(([, n]) => n > 1).map(([w]) => w);
}

/* ---------- resultados de evaluación de una regla ---------- */
const OK = nota => ({ estado: 'cumple', nota: nota || '' });
const FAIL = (detalle, datos) => ({ estado: 'incumple', detalle, datos: datos || null });
const NA = motivo => ({ estado: 'no_aplica', motivo });
const NO_TEXT = 'No hay texto que evaluar.';
const NO_IMAGE = 'No evaluable — no hay imagen.';
const NO_BATCH = 'Solo se evalúa dentro de un lote.';
const imageGate = c => (c.hasImage ? null : NA(NO_IMAGE));

/* Evaluadores reutilizados por los tres bloques de meta/alt (misma regla, distinto campo). */
const lenCheck = (o, label) => !o.text ? NA(NO_TEXT) : !o.max ? NA('No hay límite configurado.') : o.over ? FAIL(`${o.len} caracteres; el límite configurado es ${o.max}.`, { len: o.len, max: o.max }) : OK(`${o.len} de ${o.max} caracteres.`);
const blocksCheck = o => !o.text ? NA(NO_TEXT) : (o.skipped && o.skipped.length) ? FAIL(`${o.skipped.length} de ${o.blocks} bloques de la estructura se omitieron por datos faltantes: ${o.skipped.join(' · ')}.${o.skipped.some(x => /\{tienda\}/.test(x)) ? ' {tienda} se llena con el nombre de la tienda: configúralo en Ajustes, pestaña Magento.' : ''}`, { omitidos: o.skipped }) : OK();
const unknownCheck = o => (o.unknown && o.unknown.length) ? FAIL(`Token desconocido en la estructura: ${o.unknown.map(x => '{' + x + '}').join(', ')}.`, { tokens: o.unknown }) : OK();
const hygieneCheck = o => { if (!o.text) return NA(NO_TEXT); const p = hygiene(o.text); return p.length ? FAIL(`Se encontró: ${p.join('; ')}.`, { problemas: p }) : OK(); };
const redCheck = (c, o, onlyUnconfirmed) => {
  if (!o.text) return NA(NO_TEXT);
  if (onlyUnconfirmed && c.confirmed) return NA('Estructura confirmada por la agencia: hoy no se escanea el lenguaje de la meta.');
  const red = F.scanRed(o.text, c.cat);
  return red.length ? FAIL(`Contiene «${red.join('», «')}».`, { terminos: red }) : OK();
};
const commercialCheck = (c, o) => {
  if (!o.text) return NA(NO_TEXT);
  if (c.cat !== 'med' || c.confirmed) return NA('Solo se revisa en medicamentos con estructura sin confirmar.');
  const m = o.text.match(F.COMERCIAL_RE);
  return m ? FAIL(`Lenguaje comercial en un medicamento: «${m[0]}».`, { termino: m[0] }) : OK();
};
const emptyCheck = (o, what) => o.text ? OK() : FAIL(`No se generó ${what}.`);
const confirmCheck = c => c.confirmed ? OK('Estructura confirmada.') : FAIL('Estructura sin confirmar: meta_title, meta_description y short_description salen vacías en el CSV de Magento.');

/* ---------- registro de reglas (inventario) ---------- */
/* confirmacion: 'confirmada' | 'provisional' | 'por-categoria' (confirmada solo si la estructura de meta de la categoría lo está).
 * efecto: bloquea | avisa | corrige | documenta (mismo vocabulario que rules.js).
 * Una regla sin `evaluar` es documental: se inventaría, pero no se evalúa por producto. */
const RULES = [];
function R(id, componente, clase, o) {
  RULES.push(Object.assign({ id, componente, clase, categorias: 'todas', tipo: 'existente', confirmacion: 'confirmada', efecto: 'avisa', peso: 0, severidad: 'warning', campo: '' }, o));
}

/* --- Título --- */
R('TIT-001', 'title', 'titulo', { descripcion: 'El título se puede armar con los datos capturados.', explicacion: 'El título sigue la plantilla aprobada por categoría; sin datos no hay título.', accion: 'Captura la marca y los demás datos obligatorios de la categoría.', fuente: 'logic.js: CATS[cat].title, buildTitle', origen: ORIGEN.pTit, campo: 'title', severidad: 'error', efecto: 'bloquea', peso: 4,
  evaluar: c => c.title.title ? OK() : FAIL('No se pudo armar el título: faltan los datos de todos los segmentos.') });
R('TIT-002', 'title', 'obligatorios', { descripcion: 'Todos los segmentos obligatorios del título están completos.', explicacion: 'Un título incompleto no sigue la estructura aprobada; en Magento la fila no se exporta salvo que se active incluir faltantes.', accion: 'Completa los datos que faltan (ver «Datos que hicieron falta» en la pestaña Título).', fuente: 'logic.js: buildTitle (title.missing); app.js: statusOf; magentoBatch (excluded.faltantes)', origen: ORIGEN.pTit, campo: 'title', efecto: 'bloquea', peso: 5,
  evaluar: c => !c.title.title ? NA('Sin título: se evalúa en TIT-001.') : c.res.title.missing.length ? FAIL(`Faltan: ${c.res.title.missing.join(', ')}.`, { faltantes: c.res.title.missing }) : OK() });
R('TIT-003', 'title', 'longitud', { descripcion: 'El título no supera el límite de Merchant Center.', explicacion: 'Merchant Center puede truncar títulos más largos que el límite.', accion: 'Acorta el título o revisa los datos de entrada.', fuente: 'logic.js: TITLE_MAX; app.js: panelTitle', origen: ORIGEN.herr + ' (límite de Google Merchant Center)', campo: 'title', peso: 3,
  evaluar: c => !c.title.title ? NA(NO_TEXT) : c.title.title.length > F.TITLE_MAX ? FAIL(`${c.title.title.length} caracteres; el límite es ${F.TITLE_MAX}.`, { len: c.title.title.length, max: F.TITLE_MAX }) : OK(`${c.title.title.length} de ${F.TITLE_MAX} caracteres.`) });
R('TIT-004', 'title', 'duplicacion', { descripcion: 'La marca no se repite dentro del título.', explicacion: 'No se duplica información en el título (se ignoran los segmentos de fabricante o laboratorio).', accion: 'Quita la marca repetida del nombre del producto.', fuente: 'logic.js: dupBrand', origen: ORIGEN.pTit + '; ' + ORIGEN.pMg, campo: 'title', peso: 3,
  evaluar: c => !c.title.title ? NA(NO_TEXT) : F.dupBrand(c.res) ? FAIL('La marca aparece más de una vez en el título.') : OK() });
R('TIT-005', 'title', 'duplicacion', { descripcion: 'El título es único dentro del lote.', explicacion: 'Dos fichas con el mismo título normalizado son difíciles de distinguir.', accion: 'Diferencia los productos (presentación, concentración, variante) o elimina el duplicado.', fuente: 'anomalies.js: detectBatch (duplicate-title)', origen: ORIGEN.herr, campo: 'title', peso: 3,
  evaluar: c => !c.batch ? NA(NO_BATCH) : !c.title.title ? NA(NO_TEXT) : c.anomalyTypes.has('duplicate-title') ? FAIL('Título normalizado repetido dentro del lote.') : OK() });
R('TIT-006', 'title', 'duplicacion', { descripcion: 'El título no es casi idéntico a otro del lote.', explicacion: 'Informativo: títulos muy parecidos pueden ser variantes o un error de captura.', accion: 'Revisa si son productos distintos o variantes.', fuente: 'anomalies.js: detectBatch (near-duplicate-title)', origen: ORIGEN.herr, campo: 'title', severidad: 'info', peso: 0,
  evaluar: c => !c.batch ? NA(NO_BATCH) : !c.title.title ? NA(NO_TEXT) : c.anomalyTypes.has('near-duplicate-title') ? FAIL('Hay un título muy similar en el lote.') : OK() });
R('TIT-007', 'title', 'duplicacion', { descripcion: 'No se repite el tipo que ya está en el nombre del producto (corrección automática).', explicacion: 'La herramienta omite el dato repetido; el valor original no se modifica.', accion: 'Ninguna: es una corrección automática.', fuente: 'logic.js: dedupeFields', origen: ORIGEN.pTit + '; ' + ORIGEN.pMg, campo: 'title', efecto: 'corrige', severidad: 'info',
  evaluar: c => { const om = c.res.title.segs.flatMap(s => s.omitted || []); return OK(om.length ? `Se omitió por repetirse: ${om.join(', ')}.` : ''); } });
R('TIT-008', 'title', 'estructura', { descripcion: 'Unidades, mayúsculas y abreviaturas se normalizan (corrección automática).', explicacion: 'Las unidades no se convierten: se respeta la que trae el dato.', accion: 'Ninguna: es una corrección automática.', fuente: 'logic.js: values, normUnits, fixCaps, expandPres', origen: ORIGEN.pTit + '; ' + ORIGEN.pMc + '; ' + ORIGEN.pMg, campo: 'title', efecto: 'corrige', severidad: 'info',
  evaluar: c => OK(c.res.vt.changes.length ? `${c.res.vt.changes.length} ajuste(s) automático(s).` : '') });
R('TIT-010', 'title', 'estructura', { descripcion: 'El título no tiene espacios, separadores ni caracteres problemáticos.', explicacion: 'Defectos de formato objetivos que se arrastran a Merchant Center y a Magento.', accion: 'Corrige el dato de origen que produce el defecto.', fuente: 'seo.js: hygiene', origen: ORIGEN.tec, tipo: 'tecnica', campo: 'title', peso: 2,
  evaluar: c => hygieneCheck({ text: c.title.title }) });

/* --- Merchant Center --- */
R('MC-001', 'content', 'merchant_center', { descripcion: 'La descripción de Merchant Center está dentro del rango de palabras de la categoría.', explicacion: 'Informativo: el rango no obliga a rellenar con texto de más.', accion: 'Si falta contenido, completa los datos de la categoría; no se agrega relleno.', fuente: 'logic.js: CATS[cat].range; app.js: panelMC', origen: ORIGEN.pMc, campo: 'mc', severidad: 'info', categorias: ['med', 'dis', 'cos', 'sup'],
  evaluar: c => { const rg = c.c.range; if (!c.res.mc.text) return NA(NO_TEXT); if (!rg) return NA('La categoría no define rango.'); const w = c.res.mc.words; return (w >= rg[0] && w <= rg[1]) ? OK(`${w} palabras (rango ${rg[0]} a ${rg[1]}).`) : FAIL(`${w} palabras; rango ${rg[0]} a ${rg[1]} (informativo).`, { words: w }); } });
R('MC-002', 'content', 'merchant_center', { descripcion: 'Las leyendas de dosis y uso de Merchant Center son las aprobadas y no se reescriben.', explicacion: 'La herramienta solo coloca los datos dentro de las plantillas aprobadas.', accion: 'Ninguna.', fuente: 'logic.js: LEGEND, CATS[cat].mc', origen: ORIGEN.pMc, campo: 'mc', efecto: 'documenta', severidad: 'info' });

/* --- Meta title / Meta description --- */
for (const [comp, k, clase, P, label, what] of [['metaTitle', 'mt', 'meta_title', 'MT', 'meta title', 'el meta title'], ['metaDescription', 'md', 'meta_description', 'MD', 'meta description', 'la meta description']]) {
  const o = c => c.meta[k];
  const lim = k === 'mt' ? 60 : 155;
  R(`${P}-001`, comp, clase, { descripcion: `Se genera ${what}.`, explicacion: 'La estructura de la categoría produce texto con los datos capturados.', accion: `Captura los datos que alimentan la estructura de ${label} o revisa la estructura en Ajustes, pestaña Magento.`, fuente: 'logic.js: buildMeta, renderMetaTpl', origen: ORIGEN.seo, campo: comp, severidad: 'error', efecto: 'bloquea', confirmacion: 'por-categoria', peso: 4, evaluar: c => emptyCheck(o(c), what) });
  R(`${P}-002`, comp, 'confirmacion', { descripcion: `La estructura de ${label} de la categoría está confirmada.`, explicacion: 'Sin confirmar, meta_title, meta_description y short_description salen vacías en el CSV de Magento.', accion: 'Confirma la estructura con la agencia de SEO (Ajustes, pestaña Magento) y marca la casilla.', fuente: 'logic.js: defMetaCat (confirmed); magentoBatch (sinMeta)', origen: ORIGEN.seo, campo: comp, severidad: 'info', efecto: 'bloquea', evaluar: c => confirmCheck(c) });
  R(`${P}-003`, comp, 'longitud', { descripcion: `${label[0].toUpperCase() + label.slice(1)} no supera el límite de caracteres de su estructura (${lim} por defecto).`, explicacion: 'El límite se toma de la configuración de la categoría (estructura de la agencia).', accion: `Acorta ${what} o ajusta los datos de origen.`, fuente: `logic.js: META_MED.${k}.max, META_GEN.${k}.max, buildMeta (over)`, origen: ORIGEN.seo, campo: comp, confirmacion: 'por-categoria', peso: 4, evaluar: c => lenCheck(o(c)) });
  R(`${P}-004`, comp, 'estructura', { descripcion: `Todos los bloques de la estructura de ${label} se generaron.`, explicacion: 'Si falta un dato, la línea de la estructura se omite; este diagnóstico lo hace visible.', accion: 'Completa los datos de los bloques omitidos.', fuente: 'logic.js: renderMetaTpl (skipped)', origen: ORIGEN.seo, campo: comp, confirmacion: 'por-categoria', peso: 4, evaluar: c => blocksCheck(o(c)) });
  R(`${P}-005`, comp, 'estructura', { descripcion: `La estructura de ${label} no usa tokens desconocidos.`, explicacion: 'Un token desconocido se imprime vacío.', accion: 'Corrige la estructura en Ajustes, pestaña Magento.', fuente: 'logic.js: buildMeta (unknown)', origen: ORIGEN.seo, campo: comp, confirmacion: 'por-categoria', peso: 1, evaluar: c => !o(c).text && !(o(c).unknown || []).length ? NA(NO_TEXT) : unknownCheck(o(c)) });
  R(`${P}-006`, comp, 'claims', { descripcion: `${label[0].toUpperCase() + label.slice(1)} no contiene claims ni lenguaje subjetivo (solo en categorías sin estructura confirmada).`, explicacion: 'Se conserva el comportamiento actual: con estructura confirmada no se escanea la meta.', accion: 'Reescribe el texto sin el término señalado.', fuente: 'logic.js: scanRed, RED, COS_CLAIM; buildMeta', origen: ORIGEN.herr, campo: comp, confirmacion: 'por-categoria', peso: 2, evaluar: c => redCheck(c, o(c), true) });
  R(`${P}-007`, comp, 'claims', { descripcion: `${label[0].toUpperCase() + label.slice(1)} de medicamentos no usa lenguaje comercial (solo con estructura sin confirmar).`, explicacion: 'Los términos comerciales de la estructura de la agencia no se marcan cuando está confirmada.', accion: 'Confirma con Regulatorio que el término sea aceptable o quítalo.', fuente: 'logic.js: COMERCIAL_RE; buildMeta', origen: ORIGEN.reg, campo: comp, categorias: ['med'], confirmacion: 'por-categoria', peso: 1, evaluar: c => commercialCheck(c, o(c)) });
  R(`${P}-008`, comp, 'duplicacion', { descripcion: `${label[0].toUpperCase() + label.slice(1)} es único dentro del lote.`, explicacion: 'Textos de meta idénticos en productos distintos no los diferencian.', accion: 'Diferencia los productos en los datos que alimentan la meta.', fuente: 'seo.js: evaluateBatch', origen: ORIGEN.tec, tipo: 'tecnica', campo: comp, confirmacion: 'por-categoria', peso: 2,
    evaluar: c => !c.batch ? NA(NO_BATCH) : !o(c).text ? NA(NO_TEXT) : c.dupMeta[k] ? FAIL(`El mismo texto aparece en ${c.dupMeta[k]} producto(s) más del lote.`, { otros: c.dupMeta[k] }) : OK() });
  R(`${P}-010`, comp, 'estructura', { descripcion: `${label[0].toUpperCase() + label.slice(1)} no tiene espacios, separadores ni caracteres problemáticos.`, explicacion: 'Defectos de formato objetivos.', accion: 'Corrige el dato de origen que produce el defecto.', fuente: 'seo.js: hygiene', origen: ORIGEN.tec, tipo: 'tecnica', campo: comp, peso: 2, evaluar: c => hygieneCheck(o(c)) });
}

/* --- Alt e imagen --- */
R('IMG-001', 'alt', 'imagen', { descripcion: 'Hay una ruta de imagen principal.', explicacion: 'La imagen es opcional. Sin imagen, el alt no es evaluable (no se califica con 0).', accion: 'Si en la prueba de Magento no se aplica el alt, agrega la ruta de la imagen.', fuente: 'logic.js: magentoBatch (sinImagen)', origen: ORIGEN.batch, campo: 'img', severidad: 'info', efecto: 'documenta',
  evaluar: c => c.hasImage ? OK() : NA(NO_IMAGE) });
R('ALT-001', 'alt', 'alt', { descripcion: 'Se genera el alt de la imagen.', explicacion: 'El alt se arma con marca, producto y presentación según la estructura de la categoría.', accion: 'Captura los datos que alimentan el alt.', fuente: 'logic.js: ALT_DEF, buildMeta', origen: ORIGEN.seo, campo: 'alt', severidad: 'error', peso: 4, evaluar: c => imageGate(c) || emptyCheck(c.meta.alt, 'el alt') });
R('ALT-002', 'alt', 'longitud', { descripcion: 'El alt no supera el límite de caracteres (125 por defecto).', explicacion: 'Límite configurado en la estructura de alt.', accion: 'Acorta el alt.', fuente: 'logic.js: defMetaCat (alt.max), buildMeta (over); magentoBatch (altLargos)', origen: ORIGEN.herr, campo: 'alt', peso: 3, evaluar: c => imageGate(c) || lenCheck(c.meta.alt) });
R('ALT-003', 'alt', 'alt', { descripcion: 'El alt no empieza con «imagen de» ni «foto de».', explicacion: 'El lector de pantalla ya anuncia que es una imagen.', accion: 'Quita el prefijo y describe el producto.', fuente: 'logic.js: ALT_BAD_START_RE, buildMeta', origen: ORIGEN.herr, campo: 'alt', peso: 3,
  evaluar: c => imageGate(c) || (!c.meta.alt.text ? NA(NO_TEXT) : F.ALT_BAD_START_RE.test(c.meta.alt.text) ? FAIL('El alt empieza con «imagen» o «foto».') : OK()) });
R('ALT-004', 'alt', 'claims', { descripcion: 'El alt no contiene claims ni lenguaje subjetivo.', explicacion: 'El alt se revisa siempre con la misma lista de términos que los claims.', accion: 'Reescribe el alt sin el término señalado.', fuente: 'logic.js: scanRed, RED, COS_CLAIM', origen: ORIGEN.herr, campo: 'alt', peso: 2, evaluar: c => imageGate(c) || redCheck(c, c.meta.alt, false) });
R('ALT-005', 'alt', 'estructura', { descripcion: 'Todos los bloques de la estructura de alt se generaron.', explicacion: 'Si falta un dato, la línea se omite.', accion: 'Completa los datos de los bloques omitidos.', fuente: 'logic.js: renderMetaTpl (skipped)', origen: ORIGEN.herr, campo: 'alt', peso: 1, evaluar: c => imageGate(c) || blocksCheck(c.meta.alt) });
R('ALT-006', 'alt', 'estructura', { descripcion: 'La estructura de alt no usa tokens desconocidos.', explicacion: 'Un token desconocido se imprime vacío.', accion: 'Corrige la estructura de alt en Ajustes, pestaña Magento.', fuente: 'logic.js: buildMeta (unknown)', origen: ORIGEN.herr, campo: 'alt', peso: 0, evaluar: c => imageGate(c) || (!c.meta.alt.text && !(c.meta.alt.unknown || []).length ? NA(NO_TEXT) : unknownCheck(c.meta.alt)) });
R('ALT-010', 'alt', 'estructura', { descripcion: 'El alt no tiene espacios, separadores ni caracteres problemáticos.', explicacion: 'Defectos de formato objetivos.', accion: 'Corrige el dato de origen que produce el defecto.', fuente: 'seo.js: hygiene', origen: ORIGEN.tec, tipo: 'tecnica', campo: 'alt', peso: 1, evaluar: c => imageGate(c) || hygieneCheck(c.meta.alt) });
R('ALT-011', 'alt', 'duplicacion', { descripcion: 'El alt no repite palabras.', explicacion: 'La guía del alt en la herramienta pide «sin repetir palabras».', accion: 'Quita la palabra repetida.', fuente: 'index.html/app.js: indicación del alt; seo.js: repeatedWords', origen: ORIGEN.tec, tipo: 'tecnica', campo: 'alt', peso: 1,
  evaluar: c => imageGate(c) || (!c.meta.alt.text ? NA(NO_TEXT) : (() => { const w = repeatedWords(c.meta.alt.text); return w.length ? FAIL(`Palabras repetidas: ${w.join(', ')}.`, { palabras: w }) : OK(); })()) });
R('ALT-020', 'alt', 'estructura', { descripcion: 'La estructura del alt de cada categoría es la definida en ALT_DEF.', explicacion: 'Marca, concentración o modelo, principio activo o tipo, y presentación.', accion: 'Ninguna.', fuente: 'logic.js: ALT_DEF', origen: ORIGEN.seo, campo: 'alt', efecto: 'documenta', severidad: 'info' });

/* --- Contenido (claims, Magento, Merchant Center) --- */
R('CON-001', 'content', 'obligatorios', { descripcion: 'La descripción de Magento se genera (datos regulatorios y vitales presentes).', explicacion: 'En medicamentos la receta médica es obligatoria; el principio activo no se infiere ni se inventa.', accion: 'Completa el dato que bloquea el HTML.', fuente: 'logic.js: buildMg (blocked), CATS[cat].vital', origen: ORIGEN.pMg, campo: 'magentoHtml', severidad: 'error', efecto: 'bloquea', peso: 4,
  evaluar: c => c.res.mg.blocked ? FAIL(`No se generó el HTML: ${c.res.mg.blocked.map(x => x.split('.')[0]).join('; ')}.`, { motivos: c.res.mg.blocked }) : OK() });
R('CON-002', 'content', 'contenido', { descripcion: 'Las descripciones usan todos los datos disponibles de la categoría.', explicacion: 'Lo que falta se omite sin relleno; este diagnóstico lo hace visible.', accion: 'Completa los datos omitidos.', fuente: 'logic.js: buildMC (omitted), buildMg (omitted)', origen: ORIGEN.pMc + '; ' + ORIGEN.pMg, campo: 'mc', peso: 2,
  evaluar: c => { const om = uniq([...(c.res.mc.omitted || []), ...(c.res.mg.omitted || [])]); return om.length ? FAIL(`Omitido por falta de datos: ${om.join(', ')}.`, { omitidos: om }) : OK(); } });
R('CON-004', 'content', 'contenido', { descripcion: 'Merchant Center y el HTML de Magento no tienen defectos de formato (HTML bien formado, sin marcadores sin resolver).', explicacion: 'Verificación objetiva de etiquetas y caracteres.', accion: 'Corrige el dato de origen o reporta el defecto.', fuente: 'seo.js: hygiene, htmlProblems', origen: ORIGEN.tec, tipo: 'tecnica', campo: 'magentoHtml', peso: 1,
  evaluar: c => { const p = []; if (c.res.mc.text) hygiene(c.res.mc.text).forEach(x => p.push('Merchant Center: ' + x)); if (c.res.mg.html) { hygiene(stripTags(c.res.mg.html), { html: true, multiline: true }).forEach(x => p.push('Magento: ' + x)); htmlProblems(c.res.mg.html).forEach(x => p.push('Magento: ' + x)); } if (!c.res.mc.text && !c.res.mg.html) return NA(NO_TEXT); return p.length ? FAIL(`Se encontró: ${p.join('; ')}.`, { problemas: p }) : OK(); } });
R('CON-010', 'content', 'claims', { descripcion: 'Los datos de entrada no contienen claims prohibidos.', explicacion: 'Términos como «cura», «elimina», «garantiza» no se aceptan en las fichas.', accion: 'Corrige el dato de entrada que contiene el claim.', fuente: 'logic.js: lint (RED kind=claim, COS_CLAIM)', origen: ORIGEN.herr + '; ' + ORIGEN.nom, campo: 'v.*', severidad: 'error', efecto: 'avisa', peso: 3,
  evaluar: c => c.lint.claim.length ? FAIL(c.lint.claim.map(x => `«${x.term}» en ${x.field}`).join('; ') + '.', { terminos: c.lint.claim }) : OK() });
R('CON-011', 'content', 'claims', { descripcion: 'Los datos de entrada no contienen lenguaje subjetivo o superlativo.', explicacion: 'Términos como «ideal», «perfecto», «excelente» no describen el producto.', accion: 'Reescribe el dato de entrada con una descripción objetiva.', fuente: 'logic.js: lint (RED kind=vacio)', origen: ORIGEN.herr, campo: 'v.*', peso: 2,
  evaluar: c => c.lint.vacio.length ? FAIL(c.lint.vacio.map(x => `«${x.term}» en ${x.field}`).join('; ') + '.', { terminos: c.lint.vacio }) : OK() });
R('CON-012', 'content', 'claims', { descripcion: 'Las afirmaciones que requieren validación están respaldadas en la ficha de origen.', explicacion: 'Términos como «piel sensible» o «no comedogénico» requieren respaldo explícito.', accion: 'Valida la afirmación contra la ficha de origen.', fuente: 'logic.js: lint (AMBER)', origen: ORIGEN.herr, campo: 'v.*', peso: 1,
  evaluar: c => c.lint.amber.length ? FAIL(c.lint.amber.map(x => `«${x.term}» en ${x.field}`).join('; ') + '.', { terminos: c.lint.amber }) : OK() });
R('CON-013', 'content', 'claims', { descripcion: 'Cosméticos: no se atribuyen acciones propias de medicamentos.', explicacion: 'La norma de cosméticos prohíbe atribuir acciones de medicamentos (numerales por confirmar por Regulatorio).', accion: 'Quita el término de acción medicinal.', fuente: 'logic.js: lint (COS_MED)', origen: ORIGEN.nom + '; ' + ORIGEN.reg, campo: 'v.*', categorias: ['cos'], confirmacion: 'provisional', peso: 1,
  evaluar: c => c.lint.med.length ? FAIL(c.lint.med.map(x => `«${x.term}» en ${x.field}`).join('; ') + '.', { terminos: c.lint.med }) : OK() });
R('CON-014', 'content', 'claims', { descripcion: 'Cosméticos: FPS, nivel, modo de uso y precauciones son coherentes con la norma.', explicacion: 'Tabla de FPS de la norma y datos exigidos a los protectores solares (numerales por confirmar por Regulatorio).', accion: 'Confirma el dato contra el empaque y captúralo.', fuente: 'logic.js: lint (check), nivelPorFps', origen: ORIGEN.nom + '; ' + ORIGEN.reg, campo: 'v.fps', categorias: ['cos'], confirmacion: 'provisional', peso: 1,
  evaluar: c => c.lint.check.length ? FAIL(c.lint.check.join(' '), { revisiones: c.lint.check }) : OK() });
R('CON-020', 'content', 'estructura', { descripcion: 'La descripción de Magento sigue la plantilla aprobada de la categoría.', explicacion: 'La herramienta no reescribe los textos aprobados; solo coloca los datos.', accion: 'Ninguna.', fuente: 'logic.js: CATS[cat].mg, assemble', origen: ORIGEN.pMg, campo: 'magentoHtml', efecto: 'documenta', severidad: 'info' });

/* --- Coherencia (propuestas objetivas, salvo COH-006 que ya existía) --- */
const idKeys = c => (IDENTITY[c.cat] || []).filter(k => c.res.vt.v[k]);
R('COH-001', 'consistency', 'coherencia', { descripcion: 'La marca aparece en el título, el meta title, la meta description y el alt.', explicacion: 'Los textos de un mismo producto deben nombrar la misma marca.', accion: 'Revisa la estructura del campo donde falta la marca.', fuente: 'seo.js: IDENTITY', origen: ORIGEN.prop, tipo: 'tecnica', campo: 'marca', confirmacion: 'provisional', peso: 3,
  evaluar: c => { const m = c.res.vt.v.marca; if (!m) return NA('El producto no tiene marca.'); const t = [['título', c.title.title], ['meta title', c.meta.mt.text], ['meta description', c.meta.md.text]]; if (c.hasImage) t.push(['alt', c.meta.alt.text]); const ev = t.filter(x => x[1]); if (!ev.length) return NA(NO_TEXT); const miss = ev.filter(x => !includesNorm(x[1], m)).map(x => x[0]); return miss.length ? FAIL(`La marca «${m}» no aparece en: ${miss.join(', ')}.`, { faltaEn: miss }) : OK(); } });
R('COH-002', 'consistency', 'coherencia', { descripcion: 'Los datos clave del título (concentración, modelo, principio activo, producto) aparecen en el meta title.', explicacion: 'El meta title no debe omitir datos que identifican al producto y sí están en el título.', accion: 'Ajusta la estructura del meta title para incluir el dato.', fuente: 'seo.js: IDENTITY', origen: ORIGEN.prop, tipo: 'tecnica', campo: 'metaTitle', confirmacion: 'provisional', peso: 2,
  evaluar: c => { if (!c.title.title || !c.meta.mt.text) return NA(NO_TEXT); const keys = idKeys(c).filter(k => k !== 'marca' && includesNorm(c.title.title, c.res.vt.v[k])); if (!keys.length) return NA('No hay datos clave que comparar.'); const miss = keys.filter(k => !includesNorm(c.meta.mt.text, c.res.vt.v[k])).map(k => F.labelOf(c.c, k)); return miss.length ? FAIL(`El meta title omite: ${miss.join(', ')}.`, { omite: miss }) : OK(); } });
R('COH-003', 'consistency', 'duplicacion', { descripcion: 'El meta title y la meta description no son idénticos.', explicacion: 'Dos campos con el mismo texto no aportan información distinta.', accion: 'Diferencia las estructuras de meta title y meta description.', fuente: 'seo.js', origen: ORIGEN.tec, tipo: 'tecnica', campo: 'metaDescription', peso: 1,
  evaluar: c => !c.meta.mt.text || !c.meta.md.text ? NA(NO_TEXT) : norm(c.meta.mt.text) === norm(c.meta.md.text) ? FAIL('El meta title y la meta description son idénticos.') : OK() });
R('COH-004', 'consistency', 'coherencia', { descripcion: 'Los datos clave de la meta description aparecen en el contenido de Magento.', explicacion: 'La meta y la descripción del mismo producto deben hablar de lo mismo.', accion: 'Revisa la estructura de la meta description o los datos de origen.', fuente: 'seo.js: IDENTITY', origen: ORIGEN.prop, tipo: 'tecnica', campo: 'metaDescription', confirmacion: 'provisional', peso: 2,
  evaluar: c => { if (!c.meta.md.text) return NA(NO_TEXT); if (!c.res.mg.html) return NA('No hay contenido de Magento que comparar.'); const body = stripTags(c.res.mg.html); const keys = idKeys(c).filter(k => includesNorm(c.meta.md.text, c.res.vt.v[k])); if (!keys.length) return NA('No hay datos clave en la meta description.'); const miss = keys.filter(k => !includesNorm(body, c.res.vm.v[k] || c.res.vt.v[k])).map(k => F.labelOf(c.c, k)); return miss.length ? FAIL(`La meta menciona datos que el contenido no incluye: ${miss.join(', ')}.`, { omite: miss }) : OK(); } });
R('COH-006', 'consistency', 'coherencia', { descripcion: 'Medicamentos: la meta description es coherente con la declaración de receta.', explicacion: 'Con receta declarada se agrega «con receta médica»; sin receta no debe aparecer.', accion: 'Revisa el dato de receta o la estructura de la meta description.', fuente: 'logic.js: buildMeta (receta_txt); rules.js sección 5', origen: ORIGEN.seo, campo: 'metaDescription', categorias: ['med'], confirmacion: 'por-categoria', severidad: 'error', peso: 2,
  evaluar: c => { const rc = c.res.vt.v.receta; if (!c.cfg.md || !/\{receta_txt/.test(c.cfg.md.tpl || '')) return NA('La estructura no usa {receta_txt}.'); if (!rc) return NA('Receta sin declarar.'); if (!c.meta.md.text) return NA(NO_TEXT); const has = /con receta m[eé]dica/i.test(c.meta.md.text); if (rc === 'no' && has) return FAIL('La meta dice «con receta médica» pero el producto se declaró sin receta.'); if (rc === 'si' && !has) return FAIL('El producto requiere receta pero la meta no lo indica.'); return OK(); } });

/* --- Magento relacionado con SEO (no puntúan) --- */
R('MAG-001', 'magento', 'magento', { descripcion: 'El producto tiene SKU.', explicacion: 'Magento ubica el producto por SKU; sin SKU la fila no se exporta.', accion: 'Captura el SKU tal como está en Magento.', fuente: 'logic.js: magentoBatch (sinSku)', origen: ORIGEN.batch, campo: 'sku', severidad: 'info', efecto: 'bloquea', evaluar: c => c.sku ? OK() : FAIL('Sin SKU: la fila no se exporta a Magento.') });
R('MAG-002', 'magento', 'magento', { descripcion: 'Las comas internas de los textos se reemplazan por «;» al exportar (corrección automática).', explicacion: 'El contrato CSV de Magento no admite comas internas en los campos de texto.', accion: 'Ninguna: se aplica al exportar. Revisa el resultado en la prueba de carga.', fuente: 'logic.js: sanitizeMagentoCell, MAG_CONTRACT', origen: ORIGEN.batch, campo: 'metaDescription', efecto: 'corrige', severidad: 'info',
  evaluar: c => { const f = [['título (additional_attributes)', c.title.title], ['meta title', c.confirmed ? c.meta.mt.text : ''], ['meta description', c.confirmed ? c.meta.md.text : ''], ['alt', c.meta.alt.text]].filter(x => /,/.test(x[1])).map(x => x[0]); return OK(f.length ? `Se reemplazarán comas por «;» en: ${f.join(', ')}.` : ''); } });
R('MAG-003', 'magento', 'magento', { descripcion: 'short_description lleva el mismo texto que la meta description.', explicacion: 'Igual que en el archivo de referencia; solo si la estructura de la categoría está confirmada.', accion: 'Ninguna.', fuente: 'logic.js: magentoBatch', origen: ORIGEN.seo, campo: 'metaDescription', efecto: 'documenta', severidad: 'info', evaluar: c => OK(c.confirmed ? '' : 'Sin estructura confirmada, short_description sale vacía.') });
R('MAG-004', 'magento', 'magento', { descripcion: 'Los datos de IA sin confirmar están confirmados antes de exportar.', explicacion: 'Todo dato generado por IA queda marcado para confirmación humana y no se exporta hasta confirmarlo.', accion: 'Confirma o corrige los datos de IA en el lote.', fuente: 'logic.js: magentoBatch (ia); app.js: unconfirmed', origen: ORIGEN.herr, campo: 'ai', severidad: 'info', efecto: 'bloquea',
  evaluar: c => Object.values(c.item.ai || {}).some(v => v === 'sugerido' || v === 'imagen') ? FAIL('Hay datos de IA sin confirmar: no se exporta hasta confirmarlos.') : OK() });
R('MAG-005', 'magento', 'duplicacion', { descripcion: 'El SKU es único dentro del lote.', explicacion: 'Con SKU repetido, Magento conserva solo el último.', accion: 'Corrige el SKU repetido.', fuente: 'anomalies.js: detectBatch (duplicate-sku)', origen: ORIGEN.herr, campo: 'sku', severidad: 'error',
  evaluar: c => !c.batch ? NA(NO_BATCH) : !c.sku ? NA('Sin SKU.') : c.anomalyTypes.has('duplicate-sku') ? FAIL('SKU repetido dentro del lote.') : OK() });
R('MAG-006', 'magento', 'magento', { descripcion: 'El CSV mantiene las 104 columnas del formato Batch y el contrato de comas y saltos de línea.', explicacion: 'Se valida antes de descargar.', accion: 'Ninguna.', fuente: 'logic.js: MAG_HEADER, MAG_CONTRACT, validateMagentoExport', origen: ORIGEN.batch, campo: 'csv', efecto: 'bloquea', severidad: 'info' });
R('CAT-001', 'metaTitle', 'confirmacion', { descripcion: 'Solo medicamentos viene con la estructura de meta confirmada; las demás categorías son provisionales hasta que se confirmen.', explicacion: 'Estado inicial documentado; se cambia con la casilla de confirmación por categoría.', accion: 'Confirma cada categoría con la agencia de SEO.', fuente: 'logic.js: defMetaCat (confirmed: id === "med")', origen: ORIGEN.seo, campo: 'metaTitle', efecto: 'documenta', severidad: 'info' });

const ruleById = id => RULES.find(r => r.id === id) || null;

/* ---------- evaluación ---------- */
function hasData(v) { return !!v && typeof v === 'object' && Object.values(v).some(x => str(x).trim()); }

function buildContext(item, o) {
  const cat = item && item.cat;
  const c = F.CATS[cat];
  const v = item && item.v && typeof item.v === 'object' ? item.v : {};
  const res = o.res || F.computeFor(cat, v, o.keep || new Set(), o.metaCfg);
  const cfg = (o.metaCfg && o.metaCfg.cats && o.metaCfg.cats[cat]) || F.defMetaCat(cat);
  const anomalyTypes = o.anomalyTypes || new Set((o.anomalies || []).filter(a => Array.isArray(a.indexes) && a.indexes.includes(o.index)).map(a => a.type));
  return {
    item, cat, c, v, res, cfg, title: res.title, meta: res.meta, confirmed: !!res.meta.confirmed,
    sku: str(item.sku).trim(), hasImage: o.hasImage != null ? !!o.hasImage : !!str(item.img).trim(),
    lint: F.lint(c, v), batch: !!o.batch, anomalyTypes, dupMeta: o.dupMeta || {}
  };
}

function runRule(rule, ctx) {
  const applies = rule.categorias === 'todas' || rule.categorias.includes(ctx.cat);
  const r = !applies ? NA(`No aplica a la categoría ${ctx.c.name}.`) : rule.evaluar(ctx);
  const confirmada = rule.confirmacion === 'confirmada' ? true : rule.confirmacion === 'provisional' ? false : !!ctx.confirmed;
  const incumple = r.estado === 'incumple';
  /* Una regla provisional nunca produce un error duro: se degrada a aviso. */
  const sevEf = incumple && !confirmada && rule.severidad === 'error' ? 'warning' : rule.severidad;
  const estado = r.estado === 'no_aplica' ? 'no_aplica' : !incumple ? 'cumple' : sevEf === 'error' ? 'error' : 'pendiente';
  const posibles = estado === 'no_aplica' ? 0 : round2(rule.peso * (confirmada ? 1 : PROVISIONAL_FACTOR));
  const perdidos = incumple ? round2(posibles * SEVERITY_LOSS[sevEf]) : 0;
  const resultado = estado === 'no_aplica' ? (/^No evaluable/.test(r.motivo) ? r.motivo : `No aplica — ${r.motivo}`) : incumple ? r.detalle : (r.nota || 'Cumple.');
  return {
    id: rule.id, componente: rule.componente, clase: rule.clase, regla: rule.descripcion, estado, simbolo: SIMBOLO[estado],
    severidad: rule.severidad, severidadEfectiva: sevEf, resultado, explicacion: rule.explicacion, accion: incumple ? rule.accion : '',
    confirmada, confirmacion: confirmada ? 'Confirmada' : 'Provisional', efecto: rule.efecto, bloquea: rule.efecto === 'bloquea',
    peso: rule.peso, posibles, obtenidos: round2(posibles - perdidos), perdidos, motivo: r.motivo || '', datos: r.datos || null
  };
}

const WORST = { error: 3, pendiente: 2, cumple: 1, no_aplica: 0 };
function section(key, results, extra) {
  const rs = results.filter(x => x.componente === key);
  const posibles = round2(rs.reduce((a, x) => a + x.posibles, 0)), obtenidos = round2(rs.reduce((a, x) => a + x.obtenidos, 0));
  const evaluables = rs.filter(x => x.estado !== 'no_aplica');
  const estado = !evaluables.length ? 'no_aplica' : evaluables.reduce((w, x) => WORST[x.estado] > WORST[w] ? x.estado : w, 'cumple');
  return Object.assign({
    componente: key, label: COMPONENTS[key].label, maximo: COMPONENTS[key].max, posibles, obtenidos,
    score: posibles > 0 ? Math.round(100 * obtenidos / posibles) : null, estado, simbolo: SIMBOLO[estado],
    evaluable: posibles > 0 || evaluables.length > 0, rules: rs
  }, extra || {});
}

function magentoReadiness(ctx, o) {
  const r = [];
  if (!ctx.sku) r.push('Sin SKU');
  if (ctx.res.mg.blocked) r.push('Descripción de Magento bloqueada: ' + ctx.res.mg.blocked.map(x => x.split('.')[0]).join('; '));
  if (ctx.title.missing.length && !(o.incFaltantes)) r.push('Datos faltantes en el título');
  if (Object.values(ctx.item.ai || {}).some(v => v === 'sugerido' || v === 'imagen') && !o.incIA) r.push('Datos de IA sin confirmar');
  return { exportable: r.length === 0, razones: r };
}

function recommendationsFrom(findings) {
  return findings.map(f => ({
    reglaId: f.id, componente: f.componente, severidad: f.severidadEfectiva, confirmacion: f.confirmacion,
    prioridad: f.estado === 'error' ? 1 : f.severidadEfectiva === 'warning' ? 2 : 3,
    puntosRecuperables: f.perdidos,
    texto: `${f.accion}${f.confirmada ? '' : ' (regla provisional)'}`.trim()
  })).sort((a, b) => a.prioridad - b.prioridad || b.puntosRecuperables - a.puntosRecuperables || a.reglaId.localeCompare(b.reglaId));
}

/* Evalúa un producto {cat, v, sku, img, ai}. Opciones: keep, metaCfg, res (computeFor ya calculado), hasImage,
 * y para lotes: batch, index, anomalies, dupMeta. */
function evaluate(item, o) {
  o = o || {};
  item = item || {};
  const empty = status => ({
    schema: SCHEMA, version: VERSION, status, statusLabel: STATUS_LABEL[status], score: { total: null, puntos: { obtenidos: 0, posibles: 0 }, formula: FORMULA, componentes: {} },
    findings: [], title: null, metaTitle: null, metaDescription: null, alt: null, content: null, consistency: null, magento: null, recommendations: [], context: { categoria: item.cat || '', confirmada: false, tieneImagen: false }
  });
  if (!F.CATS[item.cat] || !hasData(item.v)) return empty('sin_evaluar');
  const ctx = buildContext(item, o);
  const results = RULES.filter(r => r.evaluar).map(r => runRule(r, ctx));
  const scored = results.filter(x => x.componente !== 'magento');
  const posibles = round2(scored.reduce((a, x) => a + x.posibles, 0)), obtenidos = round2(scored.reduce((a, x) => a + x.obtenidos, 0));
  const findings = results.filter(x => x.estado === 'error' || x.estado === 'pendiente')
    .sort((a, b) => WORST[b.estado] - WORST[a.estado] || b.perdidos - a.perdidos || a.id.localeCompare(b.id));
  const total = posibles > 0 ? Math.round(100 * obtenidos / posibles) : null;
  /* El estado se calcula solo con los componentes que puntúan, para que sea coherente con el score.
   * Los hallazgos de Magento se muestran aparte (no puntúan) y no cambian el estado.
   * Las notas informativas sin puntos (p. ej. rango de palabras de Merchant Center) tampoco lo cambian;
   * la falta de confirmación de la estructura de la categoría sí lo deja en «pendiente». */
  const sf = findings.filter(x => x.componente !== 'magento' && (x.peso > 0 || x.clase === 'confirmacion' || x.severidad !== 'info'));
  const status = total === null ? 'sin_evaluar'
    : sf.some(x => x.estado === 'error') ? 'critico'
      : sf.some(x => x.severidadEfectiva === 'warning') ? 'revisar'
        : sf.length ? 'pendiente' : 'listo';
  const t = ctx.title, mt = ctx.meta.mt, md = ctx.meta.md, al = ctx.meta.alt;
  const secs = {
    title: section('title', results, { texto: t.title, longitud: t.title.length, limite: F.TITLE_MAX }),
    metaTitle: section('metaTitle', results, { texto: mt.text, longitud: mt.len, limite: mt.max }),
    metaDescription: section('metaDescription', results, { texto: md.text, longitud: md.len, limite: md.max }),
    alt: section('alt', results, { texto: al.text, longitud: al.len, limite: al.max, motivo: ctx.hasImage ? '' : NO_IMAGE }),
    content: section('content', results, { palabrasMC: ctx.res.mc.words, htmlGenerado: !ctx.res.mg.blocked }),
    consistency: section('consistency', results),
    magento: section('magento', results)
  };
  if (!ctx.hasImage) secs.alt.evaluable = false;
  const componentes = {};
  Object.keys(COMPONENTS).filter(k => k !== 'magento').forEach(k => { const s = secs[k]; componentes[k] = { label: s.label, obtenidos: s.obtenidos, posibles: s.posibles, maximo: s.maximo, score: s.score, evaluable: s.evaluable, estado: s.estado }; });
  return {
    schema: SCHEMA, version: VERSION, status, statusLabel: STATUS_LABEL[status],
    score: { total, puntos: { obtenidos, posibles }, componentes, formula: FORMULA },
    findings, title: secs.title, metaTitle: secs.metaTitle, metaDescription: secs.metaDescription, alt: secs.alt, content: secs.content, consistency: secs.consistency,
    magento: Object.assign(secs.magento, magentoReadiness(ctx, o)), recommendations: recommendationsFrom(findings),
    context: { categoria: item.cat, confirmada: ctx.confirmed, tieneImagen: ctx.hasImage, lote: ctx.batch }
  };
}

/* Evalúa un lote. Opciones: keep, metaCfg, resList (computeFor por producto, opcional), anomalies (opcional). */
function evaluateBatch(items, o) {
  o = o || {};
  const list = Array.isArray(items) ? items : [];
  const resList = list.map((it, i) => (o.resList && o.resList[i]) || (F.CATS[it && it.cat] && hasData(it.v) ? F.computeFor(it.cat, it.v, o.keep || new Set(), o.metaCfg) : null));
  const anomalies = o.anomalies || (A ? A.detectBatch(list, resList.map(r => ({ res: r }))) : []);
  const key = s => (A && A.norm ? A.norm(s) : norm(s));
  const count = { mt: new Map(), md: new Map() };
  resList.forEach(r => { if (!r) return; ['mt', 'md'].forEach(k => { const t = key(r.meta[k].text); if (t) count[k].set(t, (count[k].get(t) || 0) + 1); }); });
  /* Índice producto → tipos de anomalía, calculado una sola vez (evita recorrer todas las anomalías por producto). */
  const typesByIndex = new Map();
  anomalies.forEach(a => (a.indexes || []).forEach(i => { if (!typesByIndex.has(i)) typesByIndex.set(i, new Set()); typesByIndex.get(i).add(a.type); }));
  const results = list.map((it, i) => {
    const r = resList[i];
    const dupMeta = r ? { mt: Math.max(0, (count.mt.get(key(r.meta.mt.text)) || 1) - 1), md: Math.max(0, (count.md.get(key(r.meta.md.text)) || 1) - 1) } : {};
    return evaluate(it, Object.assign({}, o, { batch: true, index: i, anomalies, anomalyTypes: typesByIndex.get(i) || new Set(), dupMeta, res: r || undefined }));
  });
  return { items: results, summary: summarizeBatch(results) };
}

const filterKey = ev => (ev && ev.status) || 'sin_evaluar';
function summarizeBatch(evals) {
  const byStatus = { critico: 0, revisar: 0, pendiente: 0, listo: 0, sin_evaluar: 0 };
  const scores = [];
  (evals || []).forEach(e => { byStatus[filterKey(e)]++; if (e && e.score && e.score.total != null) scores.push(e.score.total); });
  return {
    total: (evals || []).length, evaluados: scores.length, byStatus,
    average: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    min: scores.length ? Math.min(...scores) : null, max: scores.length ? Math.max(...scores) : null
  };
}

/* «¿Por qué obtuve este score?»: todo sale de las mismas reglas evaluadas. */
function explainScore(ev) {
  if (!ev || ev.score.total == null) return { total: null, puntos: { obtenidos: 0, posibles: 0 }, formula: FORMULA, componentes: [], incumplidas: [] };
  const comps = Object.keys(COMPONENTS).filter(k => k !== 'magento').map(k => {
    const s = ev[k], c = ev.score.componentes[k];
    return { componente: k, label: c.label, obtenidos: c.obtenidos, posibles: c.posibles, score: c.score, evaluable: c.evaluable,
      reglas: s.rules.map(x => ({ id: x.id, regla: x.regla, estado: x.estado, simbolo: x.simbolo, severidad: x.severidadEfectiva, confirmacion: x.confirmacion, obtenidos: x.obtenidos, posibles: x.posibles, resultado: x.resultado, accion: x.accion })) };
  });
  return {
    total: ev.score.total, puntos: ev.score.puntos, formula: FORMULA, componentes: comps,
    incumplidas: ev.findings.filter(x => x.componente !== 'magento').map(x => ({ id: x.id, regla: x.regla, estado: x.estado, severidad: x.severidadEfectiva, confirmacion: x.confirmacion, obtenidos: x.obtenidos, posibles: x.posibles, resultado: x.resultado, accion: x.accion }))
  };
}

/* Fase 10 (solo contrato): expone las señales de cada eje sin calcular un Global Score. */
function score360(ev, extras) {
  extras = extras || {};
  return {
    schema: 'fichas.score360.v0',
    seo: ev && ev.score ? { score: ev.score.total, status: ev.status } : null,
    health: extras.health || null,
    content: ev && ev.content ? { score: ev.content.score, fuente: 'seo.content' } : null,
    magento: ev && ev.magento ? { exportable: ev.magento.exportable, razones: ev.magento.razones } : null,
    global: null,
    nota: 'El Global Score no se calcula hasta confirmar que el SEO Score es estable.'
  };
}

const api = {
  SCHEMA, VERSION, PROVISIONAL_FACTOR, SEVERITY_LOSS, FORMULA, ORIGEN, COMPONENTS, CLASES, STATUS_LABEL, ESTADO_LABEL, SIMBOLO, IDENTITY,
  RULES, ruleById, evaluate, evaluateBatch, summarizeBatch, filterKey, explainScore, score360, hygiene, htmlProblems, repeatedWords
};
if (isNode) module.exports = api; else root.FichasSEO = api;
})(typeof self !== 'undefined' ? self : this);
