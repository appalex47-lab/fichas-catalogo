/*
 * Textos para las páginas de categoría de la tienda. Reglas fijas, sin IA, una categoría a la vez.
 * Cinco piezas: meta title, meta description, texto corto (va arriba, después del título), texto largo con subcategorías y preguntas
 * frecuentes (van hasta abajo). Usa solo lo que la persona escribe en «Qué incluye» y en las subcategorías.
 * Sin dependencia del DOM: navegador (window.FichasCategorias) y Node.
 */
(function (root) {
'use strict';
const F = (typeof module !== 'undefined' && module.exports) ? require('./logic.js') : root.Fichas;

const META_TITLE_MAX = 60, META_DESC_MAX = 155, SHORT_MIN_WORDS = 50;

const TIPOS = Object.freeze({
  otc: { label: 'Medicamentos de venta libre y generales', nota: 'Consulte a su médico y evite automedicarse.' },
  rx: { label: 'Medicamentos con receta', nota: 'Estos medicamentos se venden con receta médica. Consulte a su médico.' },
  sup: { label: 'Suplementos y vitaminas', nota: 'Los suplementos alimenticios no son medicamentos ni sustituyen una alimentación equilibrada.' },
  cos: { label: 'Dermocosméticos y cuidado de la piel', nota: 'Los productos de cuidado de la piel no sustituyen la valoración de un dermatólogo.' },
  dis: { label: 'Dispositivos y artículos de medición', nota: 'Los equipos de medición no sustituyen la valoración médica.' },
  hig: { label: 'Cuidado personal e higiene', nota: 'Lee la etiqueta antes de usar.' },
  otro: { label: 'Otra', nota: '' }
});

const fold = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const clean = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const lcFirst = s => s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
const stripDot = s => clean(s).replace(/[.\s]+$/, '');
const words = s => clean(String(s).replace(/<[^>]*>/g, ' ')).split(' ').filter(Boolean).length;
const list = a => a.length < 2 ? a.join('') : a.length === 2 ? `${a[0]} y ${a[1]}` : `${a.slice(0, -1).join(', ')} y ${a[a.length - 1]}`;

/* Sugerencia de tipo por el nombre; nunca propone «con receta» salvo que el nombre lo diga. */
function guessTipo(nombre) {
  const n = fold(nombre);
  if (/\breceta\b/.test(n)) return 'rx';
  if (/vitamin|suplement|probiot|nutri|mineral|colageno/.test(n)) return 'sup';
  if (/dermo|cosmet|facial|solar|\bpiel\b/.test(n)) return 'cos';
  if (/medicion|termometr|glucom|baumanom|dispositiv|equipo|nebuliz|oximetr/.test(n)) return 'dis';
  if (/medicament|analges|gastro|antigripal|antibiot|antiacid|alergia|digestiv/.test(n)) return 'otc';
  if (/cuidado personal|higiene|bucal|cabello|pañal|toalla|desodorante|bienestar/.test(n)) return 'hig';
  return 'otro';
}

/* Una subcategoría por línea: «Nombre» o «Nombre | https://…». */
function parseSubs(text) {
  return String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
    const [n, u] = l.split('|').map(x => x && x.trim());
    return { nombre: clean(n), url: u && /^(https?:\/\/|\/)/i.test(u) ? u : '' };
  }).filter(s => s.nombre);
}

function build(c) {
  const nombre = clean(c.nombre), padre = clean(c.padre), tienda = clean(c.tienda);
  const tipo = TIPOS[c.tipo] ? c.tipo : 'otro';
  const incluye = stripDot(c.incluye), subs = parseSubs(c.subs);
  const lname = lcFirst(nombre);
  const out = { metaTitle: '', metaDescription: '', textoCorto: '', textoLargo: '', preguntas: '', warnings: [], words: 0 };
  if (!nombre) { out.warnings.push({ level: 'error', code: 'sin-nombre', msg: 'Escribe el nombre de la categoría.' }); return out; }

  /* Meta title: nombre primero; se omite la categoría padre y luego la tienda si no cabe. */
  const tit = [[nombre, padre, tienda], [nombre, tienda], [nombre]].map(a => a.filter(Boolean).join(' | '));
  out.metaTitle = tit.find(t => t.length <= META_TITLE_MAX) || tit[tit.length - 1];
  if (out.metaTitle.length > META_TITLE_MAX) out.warnings.push({ level: 'warning', code: 'meta-title', msg: `El meta title tiene ${out.metaTitle.length} caracteres; el límite que se usa es ${META_TITLE_MAX}.` });

  /* Meta description: lo principal va siempre; lo opcional se omite de derecha a izquierda si no cabe. */
  const main = tipo === 'rx' ? `Consulta ${lname}: ${lcFirst(incluye) || 'medicamentos con receta'}.` : `Encuentra ${lcFirst(incluye) || 'productos de ' + lname}.`;
  const optional = [subs.length ? `Incluye ${list(subs.slice(0, 3).map(s => s.nombre))}.` : '', tienda ? `Compra en ${tienda}.` : ''].filter(Boolean);
  let md = main;
  optional.forEach(o => { if ((md + ' ' + o).length <= META_DESC_MAX) md += ' ' + o; });
  out.metaDescription = md;
  if (md.length > META_DESC_MAX) out.warnings.push({ level: 'warning', code: 'meta-desc', msg: `La meta description tiene ${md.length} caracteres; el límite que se usa es ${META_DESC_MAX}. Acorta «Qué incluye».` });

  /* Texto corto (arriba, después del título). */
  const intro = (tipo === 'rx' ? `${nombre} reúne medicamentos que se venden con receta médica${incluye ? ': ' + lcFirst(incluye) : ''}.` : `${nombre} reúne ${lcFirst(incluye) || 'productos de la categoría'}.`)
    + (subs.length ? ` Explora por ${list(subs.map(s => lcFirst(s.nombre)))} para ubicar lo que buscas.` : ' Usa los filtros para ubicar lo que buscas.')
    + (TIPOS[tipo].nota ? ' ' + TIPOS[tipo].nota : '');
  out.textoCorto = `<p>${esc(intro)}</p>`;
  out.words = words(intro);

  /* Texto largo (hasta abajo): qué incluye, subcategorías con enlace si hay URL, y la nota del tipo. */
  const li = s => `  <li>${s.url ? `<a href="${esc(s.url)}">${esc(s.nombre)}</a>` : esc(s.nombre)}</li>`;
  out.textoLargo = [`<h2>Qué encontrarás en ${esc(nombre)}</h2>`, `<p>${esc(cap(incluye || 'productos de ' + lname))}.</p>`]
    .concat(subs.length ? ['<h3>Subcategorías</h3>', `<ul>\n${subs.map(li).join('\n')}\n</ul>`] : [])
    .concat(TIPOS[tipo].nota ? [`<p>${esc(TIPOS[tipo].nota)}</p>`] : []).join('\n');

  /* Preguntas frecuentes (hasta abajo, después del texto largo): solo las que el dato permite responder. Sin JSON-LD. */
  const qa = [[`¿Qué productos incluye ${nombre}?`, `${cap(incluye || 'productos de ' + lname)}.`]];
  if (tipo === 'rx') qa.push([`¿Necesito receta para comprar en ${nombre}?`, 'Sí. Los medicamentos de esta categoría se venden con receta médica. Consulte a su médico.']);
  if (tipo === 'otc') qa.push([`¿Necesito receta para comprar en ${nombre}?`, 'Depende del producto: cada ficha indica si requiere receta médica. Consulte a su médico.']);
  if (subs.length) qa.push([`¿Cómo encuentro un producto en ${nombre}?`, `Elige una subcategoría (${subs.map(s => s.nombre).join(', ')}) o usa los filtros de la página.`]);
  qa.push(['¿Dónde veo los datos de cada producto?', 'En su ficha: presentación, laboratorio y las advertencias del empaque.']);
  out.preguntas = '<h2>Preguntas frecuentes:</h2>\n' + qa.slice(0, 5).map(([q, a]) => `<h3>${esc(q)}</h3>\n<p>${esc(a)}</p>`).join('\n');

  /* Avisos */
  if (!incluye) out.warnings.push({ level: 'info', code: 'sin-incluye', msg: 'Falta «Qué incluye»: los textos salen genéricos.' });
  if (out.words < SHORT_MIN_WORDS) out.warnings.push({ level: 'info', code: 'texto-corto', msg: `El texto corto tiene ${out.words} palabras. Las guías de SEO para categorías piden más texto; amplía «Qué incluye».` });
  const text = [nombre, padre, incluye, subs.map(s => s.nombre).join(' ')].join(' . ');
  const hit = [];
  (F.RED || []).forEach(([re, term, kind]) => { if (re.test(text)) hit.push({ term, kind }); });
  hit.forEach(h => out.warnings.push({ level: h.kind === 'claim' ? 'error' : 'warning', code: 'lenguaje', msg: `«${h.term}» no se acepta en las descripciones: ${h.kind === 'claim' ? 'es una promesa' : 'es lenguaje subjetivo'}.` }));
  (F.AMBER || []).forEach(([re, term]) => { if (re.test(text)) out.warnings.push({ level: 'warning', code: 'respaldo', msg: `«${term}» necesita respaldo en la ficha de origen.` }); });
  if (tipo === 'rx') out.warnings.push({ level: 'warning', code: 'receta', msg: 'Categoría de medicamentos con receta: texto neutro y provisional. Pide revisión de Regulatorio antes de publicarlo.' });
  return out;
}

/* Parecido entre dos textos (0 a 1), para avisar de categorías con textos casi iguales. */
function similarity(a, b) {
  const set = t => new Set(fold(String(t).replace(/<[^>]*>/g, ' ')).split(/[^a-z0-9ñ]+/).filter(w => w.length > 3));
  const A = set(a), B = set(b);
  if (!A.size || !B.size) return 0;
  let n = 0; A.forEach(w => { if (B.has(w)) n++; });
  return n / (A.size + B.size - n);
}

const key = c => fold(clean(c.padre) + '>' + clean(c.nombre));

const api = { TIPOS, META_TITLE_MAX, META_DESC_MAX, SHORT_MIN_WORDS, guessTipo, parseSubs, build, similarity, key };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FichasCategorias = api;
})(typeof self !== 'undefined' ? self : this);
