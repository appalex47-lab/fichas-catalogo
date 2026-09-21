/*
 * Fichas de catálogo: respuestas del asistente que no necesitan IA.
 * Todo lo que se puede calcular con el estado de la pantalla (por qué se bloquea Magento, qué falta para exportar,
 * qué significa cada aviso) se responde aquí: es instantáneo, siempre coincide con los datos y no gasta cuota.
 * También define la lista cerrada de acciones que pueden aparecer como botones en las respuestas.
 * Funciona en el navegador (window.FichasAssist) y en Node (require).
 */
(function (root) {
'use strict';
const F = (typeof module !== 'undefined' && module.exports) ? require('./logic.js') : root.Fichas;
const { CATS, fold } = F;

const norm = s => fold(String(s || '')).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const N = n => Number(n) || 0;

/* ---------- Acciones permitidas (lista cerrada) ---------- */
const STATIC_ACTIONS = {
  'ajustes:formato': 'Abrir Ajustes, pestaña Formato',
  'ajustes:dic': 'Abrir Ajustes, pestaña Diccionarios',
  'ajustes:ia': 'Abrir Ajustes, pestaña IA',
  'ajustes:magento': 'Abrir Ajustes, pestaña Magento',
  'ir:masiva': 'Ir a Carga masiva',
  'ir:lote': 'Ir al Lote',
  'ir:exportar': 'Ir a Exportar',
  'filtro:faltantes': 'Ver en el lote: con datos faltantes',
  'filtro:bloqueados': 'Ver en el lote: Magento bloqueado',
  'filtro:lenguaje': 'Ver en el lote: revisar lenguaje',
  'filtro:ia': 'Ver en el lote: IA sin confirmar',
  'pestana:titulo': 'Ver la pestaña Título',
  'pestana:mc': 'Ver la pestaña Merchant Center',
  'pestana:mg': 'Ver la pestaña Magento',
  'pestana:meta': 'Ver la pestaña Meta y alt'
};
const fieldKeys = () => [...new Set(Object.values(CATS).flatMap(c => c.fields.map(f => f.key)))];
const ACTION_IDS = [...Object.keys(STATIC_ACTIONS), ...fieldKeys().map(k => 'campo:' + k)];

function parseAction(id, catId) {
  id = String(id || '').trim();
  if (STATIC_ACTIONS[id]) return { id, label: STATIC_ACTIONS[id] };
  if (id.startsWith('campo:')) {
    const c = CATS[catId], fd = c && c.fields.find(f => f.key === id.slice(6));
    if (fd) return { id, label: 'Ir al campo: ' + fd.label };
  }
  return null;
}
function parseActions(list, catId, max) {
  const out = [], seen = new Set();
  (Array.isArray(list) ? list : []).forEach(x => {
    const a = parseAction(typeof x === 'string' ? x : x && x.id, catId);
    if (a && !seen.has(a.id)) { seen.add(a.id); out.push(a); }
  });
  return out.slice(0, max || 4);
}

/* ---------- Motivos de exportación ---------- */
function exportParts(snap) {
  const exp = snap.lote && snap.lote.exp, lines = [], acts = [], notes = [];
  if (!exp) return { lines, acts, notes };
  const e = exp.excluded || {};
  if (N(e.sinSku)) { lines.push(`${e.sinSku} sin SKU. Magento necesita el SKU para ubicar el producto.`); acts.push('ir:lote'); }
  if (N(e.bloqueadas)) { lines.push(`${e.bloqueadas} con la descripción de Magento bloqueada, por ejemplo por no declarar la receta.`); acts.push('filtro:bloqueados'); }
  if (N(e.faltantes)) { lines.push(`${e.faltantes} con datos faltantes. Puedes activar «Incluir filas con datos faltantes» en Exportar.`); acts.push('filtro:faltantes'); }
  if (N(e.lenguaje)) { lines.push(`${e.lenguaje} con avisos de lenguaje, porque activaste «Excluir filas con avisos de lenguaje».`); acts.push('filtro:lenguaje'); }
  if (N(e.ia)) { lines.push(`${e.ia} con datos de IA sin confirmar (sugeridos o leídos de fotos). Confírmalos en el lote o activa la opción en Exportar.`); acts.push('filtro:ia'); }
  if (N(e.duplicadas)) lines.push(`${e.duplicadas} con SKU repetido. Se exporta el último de cada uno.`);
  if (N(e.sinMeta)) { notes.push(`${e.sinMeta} van sin meta title, meta description ni short_description, porque la estructura de meta de su categoría no está confirmada.`); acts.push('ajustes:magento'); }
  if (N(e.sinImagen)) notes.push(`${e.sinImagen} van sin archivo de imagen (base_image). El alt viaja solo en base_image_label.`);
  if (N(e.altLargos)) notes.push(`${e.altLargos} tienen un alt que supera el límite de caracteres.`);
  return { lines, acts, notes };
}

function exportAnswer(snap, mode) {
  const lote = snap.lote || { n: 0 };
  if (!N(lote.n)) return { text: 'Aún no hay productos en el lote. Agrégalos desde el formulario o con la carga masiva.', actions: ['ir:masiva'] };
  const exp = lote.exp, p = exportParts(snap);
  const head = exp.rows === exp.total ? `Todo listo: los ${exp.total} productos del lote se exportan.` : exp.rows === 0 ? 'Todavía no se puede exportar ninguno.' : `Se exportan ${exp.rows} de ${exp.total} productos.`;
  const body = [head];
  if (p.lines.length) body.push(mode === 'status' ? 'Lo que falta resolver:' : 'Quedan fuera:', ...p.lines.map(x => '• ' + x));
  if (p.notes.length) body.push('Ten en cuenta:', ...p.notes.map(x => '• ' + x));
  if (exp.rows > 0) body.push('Antes de una carga grande, prueba con 2 o 3 SKU.');
  return { text: body.join('\n'), actions: [...new Set([...p.acts, 'ir:exportar'])] };
}

/* ---------- Respuestas ---------- */
function mgBlockedAnswer(snap) {
  if (!snap.hasData) return { text: 'Captura primero un producto y te digo si su descripción de Magento está bloqueada.', actions: [] };
  if (!snap.mgBlocked) return { text: 'La descripción de Magento de este producto no está bloqueada. Puedes verla en la pestaña Magento.', actions: ['pestana:mg'] };
  return {
    text: ['La descripción de Magento se bloquea cuando falta un dato regulatorio que la herramienta no puede inferir ni inventar. En este producto falta:', ...snap.mgBlocked.map(x => '• ' + x), 'Sin ese dato no se genera el HTML y la fila no se exporta.'].join('\n'),
    actions: [...(snap.mgBlockedKeys || []).map(k => 'campo:' + k), 'pestana:mg']
  };
}
function titleMissingAnswer(snap) {
  if (!snap.hasData) return { text: 'Captura los datos del producto y te digo qué falta para el título.', actions: [] };
  if (!snap.titleMissing.length) return { text: 'No faltan datos para el título de este producto.', actions: ['pestana:titulo'] };
  return { text: `Para el título faltan: ${snap.titleMissing.join(', ')}. Sin ellos el título sale incompleto y el producto se marca con datos faltantes.`, actions: [...(snap.titleMissingKeys || []).map(k => 'campo:' + k), 'pestana:titulo'] };
}
const fieldKeyByLabel = (snap, label) => { const f = (snap.fields || []).find(x => x.label === label); return f ? f.key : null; };
const terms = (arr) => arr.map(x => `«${x.term}» en ${x.field}`).join('; ');

const WHY = {
  claim: 'Estas palabras están en tu lista de claims prohibidos: cura, elimina, previene, garantiza, 100% efectivo, el mejor, sin efectos secundarios, entre otras. En cosméticos también «bloqueador», «protección total» y «todo el día». Los textos aprobados no se modifican, así que la herramienta solo avisa. Corrige el dato de origen o confírmalo con Regulatorio.',
  vacio: 'Son adjetivos vacíos o superlativos, como práctico, cómodo, ideal, perfecto, excelente o seguro. Tus reglas piden describir solo lo que se puede medir o comprobar en la ficha.',
  amber: 'Son claims que solo se pueden usar si el empaque o la ficha los declara de forma explícita: piel sensible, hidratación intensa, no comedogénico, alta precisión, absorción rápida. Si no están documentados, quítalos.',
  med: 'La NOM-141-SSA1/SCFI-2012 prohíbe atribuir a un cosmético acciones propias de un medicamento. Términos como terapéutico, cicatrizante o antiinflamatorio pueden leerse así. Es un aviso de revisión, no un bloqueo.',
  check: 'Estos avisos comparan el FPS, el nivel de protección, el modo de uso y las precauciones con lo que pide la NOM-141-SSA1/SCFI-2012 para los protectores solares. La herramienta no cambia nada: solo te dice qué revisar contra el empaque.',
  dup: 'La marca aparece más de una vez en el título, sin contar el segmento del fabricante. Revisa que no esté repetida dentro del nombre o del tipo de producto.'
};

function warningsAnswer(snap) {
  const L = snap.lint || {}, out = [], acts = [];
  const add = (key, title, arr, fmt) => {
    if (!arr || !arr.length) return;
    out.push(`${title}: ${fmt(arr)}\n${WHY[key]}`);
    arr.forEach(x => { const k = x.field && fieldKeyByLabel(snap, x.field); if (k) acts.push('campo:' + k); });
  };
  if (!snap.hasData) return { text: 'Captura un producto y te explico sus avisos.', actions: [] };
  add('claim', 'Claims prohibidos', L.claim, terms);
  add('vacio', 'Lenguaje subjetivo', L.vacio, terms);
  add('amber', 'Claims que requieren validación', L.amber, terms);
  add('med', 'Términos de acción medicinal', L.med, terms);
  if (L.check && L.check.length) out.push(`Revisar datos:\n${L.check.map(x => '• ' + x).join('\n')}\n${WHY.check}`);
  if (snap.dup) out.push(`Información duplicada: la marca aparece más de una vez en el título.\n${WHY.dup}`);
  if (!out.length) return { text: 'Este producto no tiene avisos de lenguaje ni de datos.', actions: [] };
  return { text: out.join('\n\n'), actions: [...new Set(acts)].slice(0, 3) };
}
const metaAnswer = snap => ({
  text: snap.metaConfirmed
    ? 'La estructura de meta de esta categoría ya está confirmada, así que las metas salen en el CSV. Si aun así ves una meta vacía, revisa que los datos que usa la plantilla estén capturados.'
    : 'Las metas salen vacías en el CSV porque la estructura de meta de esta categoría no está confirmada. En medicamentos viene de tu agencia de SEO y ya está confirmada; en las demás es provisional. Cuando coincida con la de la agencia, márcala como confirmada en Ajustes, pestaña Magento.',
  actions: ['ajustes:magento', 'pestana:meta']
});
const aiUnconfAnswer = snap => {
  const n = N(snap.lote && snap.lote.aiUnconfirmed);
  return { text: n ? `Hay ${n} productos con datos de IA sin confirmar (sugeridos o leídos de fotos). No se exportan a Magento hasta que los revises y pulses «Confirmar IA» en el lote, o actives la opción de incluirlos en Exportar.` : 'No hay productos con datos de IA sin confirmar. Lo que la IA sugiere o lee de una foto queda marcado y no se exporta hasta que lo confirmes en el lote.', actions: n ? ['filtro:ia', 'ir:exportar'] : [] };
};
function quotaAnswer(snap) {
  const c = snap.calls || {}, used = N(c.extract) + N(c.vision) + N(c.asst), lim = N(snap.limit);
  const pct = lim ? Math.round(used * 100 / lim) : null;
  return {
    text: `Este navegador ha hecho ${used} llamadas a Cohere este mes (${N(c.extract)} de extracción, ${N(c.vision)} de fotos y ${N(c.asst)} del asistente), y ${N(c.local)} respuestas se resolvieron sin IA.${lim ? ` Tu límite configurado es ${lim}, así que llevas ${pct}%.` : ''} El conteo es solo de este navegador: la cuota real depende de tu llave.`,
    actions: ['ajustes:ia']
  };
}

const INTENTS = [
  ['exportReasons', q => /(por que|porque|pq).*(no se export|no export|excluid|fuera)|no se exportan|filas (excluidas|fuera)/.test(q), s => exportAnswer(s, 'reasons')],
  ['exportStatus', q => /export/.test(q) && /(falta|listo|lista|puedo|ya se|pendiente|estado)/.test(q), s => exportAnswer(s, 'status')],
  ['mgBlocked', q => (/bloque/.test(q) && /(magento|html|descripcion)/.test(q)) || /(no|sin) (se )?(genera|sale|aparece).*(html|descripcion)/.test(q), mgBlockedAnswer],
  ['metaUnconf', q => /meta/.test(q) && /(vac|sin confirm|no sale|no aparece|no se exporta|confirm)/.test(q), metaAnswer],
  ['aiUnconf', q => /(confirmar ia|ia sin confirmar|sugerid)/.test(q), aiUnconfAnswer],
  ['warnings', q => /(aviso|alerta|advertencia|claims|lenguaje|revisar datos)/.test(q), warningsAnswer],
  ['titleMissing', q => /(que|cuales|cuantos).*(falta|faltan)|datos faltantes|campos (faltantes|requeridos|obligatorios)|falta para el titulo/.test(q), titleMissingAnswer],
  ['quota', q => /(cuota|llamadas|limite|consumo|cuanto (llevo|he usado|gaste))/.test(q), quotaAnswer],
  ['apiKey', q => /(llave|api key|apikey|token|cohere)/.test(q), s => ({ text: s.keyPresent ? 'Ya hay una llave de Cohere guardada en este navegador. Solo la ve quien use este navegador y nunca va en el código. La puedes cambiar o borrar en Ajustes, pestaña IA.' : 'Falta la llave de Cohere. Pégala en Ajustes, pestaña IA. Se guarda solo en tu navegador y nunca va en el código.', actions: ['ajustes:ia'] })],
  ['dictionary', q => /diccionario/.test(q), () => ({ text: 'Los diccionarios enseñan a las reglas a reconocer marcas, principios activos y laboratorios en los datos crudos. Se escriben uno por línea, con «Alias=Nombre» si el texto crudo usa otra forma. El botón «Agregar al diccionario los valores del lote» aprende de lo que ya capturaste.', actions: ['ajustes:dic'] })],
  ['bulk', q => /(carga masiva|masiva|plantilla)|((cargar|cargo|subir|subo|importar|importo).*(muchos|varios|csv|archivo|productos))/.test(q), () => ({ text: ['Para cargar muchos productos:', '1. En Carga masiva descarga la plantilla de la categoría.', '2. Llénala con una fila por producto. Si solo tienes el SKU sucio, ponlo en «Datos crudos».', '3. Súbela: la herramienta muestra qué filas están completas, cuáles tienen faltantes y cuáles no se pueden generar.', '4. Pulsa «Agregar al lote» y luego exporta.'].join('\n'), actions: ['ir:masiva'] })],
  ['capabilities', q => /(que puedes|que haces|para que sirves|ayuda|hola|buenas|buenos dias)/.test(q), () => ({ text: 'Puedo explicarte cómo usar la herramienta, por qué se bloquea Magento, qué falta para el título o para exportar, qué significa cada aviso y dónde está cada ajuste. Lo que depende de tu pantalla lo respondo directo, sin usar la IA. Lo demás lo consulto al manual con IA.', actions: [] })]
];

function localAnswer(question, snap) {
  const q = norm(question);
  if (!q) return null;
  snap = snap || {};
  for (const [, test, build] of INTENTS) {
    if (test(q)) { const r = build(snap); if (r) return r; }
  }
  return null;
}

/* Explicación de un aviso concreto (botón «¿Por qué?») */
function why(kind, snap) {
  snap = snap || {};
  const L = snap.lint || {};
  const withTerms = (k, arr) => (arr && arr.length ? `En este producto: ${terms(arr)}.\n` : '') + WHY[k];
  const fieldActs = arr => [...new Set((arr || []).map(x => fieldKeyByLabel(snap, x.field)).filter(Boolean))].slice(0, 3).map(k => 'campo:' + k);
  switch (kind) {
    case 'claim': return { question: '¿Por qué aparece «Claims prohibidos»?', text: withTerms('claim', L.claim), actions: fieldActs(L.claim) };
    case 'vacio': return { question: '¿Por qué aparece «Lenguaje subjetivo»?', text: withTerms('vacio', L.vacio), actions: fieldActs(L.vacio) };
    case 'amber': return { question: '¿Por qué piden validación de estos claims?', text: withTerms('amber', L.amber), actions: fieldActs(L.amber) };
    case 'med': return { question: '¿Por qué avisa de términos de acción medicinal?', text: withTerms('med', L.med), actions: fieldActs(L.med) };
    case 'check': return { question: '¿Por qué aparece «Revisar datos»?', text: ((L.check || []).length ? (L.check.map(x => '• ' + x).join('\n') + '\n') : '') + WHY.check, actions: ['campo:fps', 'campo:modo', 'campo:precauciones'].filter(a => (snap.fields || []).some(f => 'campo:' + f.key === a)) };
    case 'dup': return { question: '¿Por qué avisa de información duplicada?', text: WHY.dup, actions: ['pestana:titulo'] };
    case 'mgblocked': { const r = mgBlockedAnswer(snap); return { question: '¿Por qué se bloquea Magento?', text: r.text, actions: r.actions }; }
    case 'faltantes': { const r = titleMissingAnswer(snap); return { question: '¿Qué datos faltan y por qué importan?', text: r.text, actions: r.actions }; }
    case 'metaunconf': { const r = metaAnswer(snap); return { question: '¿Por qué las metas salen vacías?', text: r.text, actions: r.actions }; }
    case 'exportreasons': { const r = exportAnswer(snap, 'reasons'); return { question: '¿Por qué no se exportan algunas filas?', text: r.text, actions: r.actions }; }
    case 'aiunconf': { const r = aiUnconfAnswer(snap); return { question: '¿Qué es «IA sin confirmar»?', text: r.text, actions: r.actions }; }
    default: return null;
  }
}

const api = { STATIC_ACTIONS, ACTION_IDS, parseAction, parseActions, localAnswer, why, exportAnswer, norm };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.FichasAssist = api;
})(typeof self !== 'undefined' ? self : this);
