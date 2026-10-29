/*
 * Diccionario de clasificación: principio activo → código ATC y área.
 * - Cada fila lleva su fuente y su estado. Solo las filas «verificadas» se aplican solas al formulario.
 * - Verificar exige una fuente, el nombre de quien verificó y un código ATC con formato válido. La fecha se registra sola.
 * - Si se cambia el código de una fila verificada, vuelve a «sin verificar».
 * - El área sale del código ATC con una tabla fija (grupos de la OMS → áreas internas). Una fila puede fijar su propia área.
 * Determinista y sin DOM: funciona en el navegador (window.FichasClasif) y en Node.
 */
(function (root) {
'use strict';
const F = (typeof module !== 'undefined' && module.exports) ? require('./logic.js') : root.Fichas;

/* Grupos ATC (nivel 1 o 2) → área interna. Gana el prefijo más largo. Los nombres de los grupos son los de la OMS; el área es una agrupación propia. */
const ATC_AREAS = [
  ['A02', 'Digestivo y gastrointestinal'], ['A03', 'Digestivo y gastrointestinal'], ['A04', 'Digestivo y gastrointestinal'], ['A05', 'Digestivo y gastrointestinal'],
  ['A06', 'Digestivo y gastrointestinal'], ['A07', 'Digestivo y gastrointestinal'], ['A09', 'Digestivo y gastrointestinal'],
  ['A08', 'Control de peso'], ['A10', 'Diabetes y metabolismo'], ['A11', 'Nutrición y vitaminas'], ['A12', 'Nutrición y vitaminas'],
  ['B01', 'Cardiovascular'], ['B02', 'Cardiovascular'], ['B03', 'Nutrición y vitaminas'], ['C', 'Cardiovascular'], ['D', 'Piel y dermatología'],
  ['G01', 'Hormonal y salud sexual'], ['G02', 'Hormonal y salud sexual'], ['G03', 'Hormonal y salud sexual'], ['H', 'Hormonal y salud sexual'],
  ['J', 'Infecciones'], ['P', 'Infecciones'], ['L', 'Oncología e inmunología'], ['M01', 'Dolor e inflamación'], ['M02', 'Dolor e inflamación'],
  ['N02', 'Dolor e inflamación'], ['N03', 'Salud mental y neurología'], ['N04', 'Salud mental y neurología'], ['N05', 'Salud mental y neurología'],
  ['N06', 'Salud mental y neurología'], ['N07', 'Salud mental y neurología'], ['R', 'Respiratorio y alergias'], ['S01', 'Ojos y oídos'], ['S02', 'Ojos y oídos']
];
const lk = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const cleanAtc = s => String(s ?? '').toUpperCase().replace(/\s+/g, '');
const areaFromAtc = atc => {
  const a = cleanAtc(atc);
  if (!F.ATC_RE.test(a)) return '';
  const hit = ATC_AREAS.filter(([p]) => a.startsWith(p)).sort((x, y) => y[0].length - x[0].length)[0];
  return hit ? hit[1] : '';
};
/* Clave de búsqueda de un principio activo: sin acentos, sin mayúsculas y con sus componentes en orden (paracetamol + cafeína = cafeína + paracetamol). */
const keyOf = p => String(p ?? '').split(/\s*(?:,|;|\+|\/|\by\b)\s*/i).map(lk).filter(Boolean).sort().join(' + ');

const empty = () => ({ v: 1, rows: [] });
function normalize(d) {
  const out = empty(), seen = new Set();
  (d && Array.isArray(d.rows) ? d.rows : []).forEach(r => {
    if (!r || !r.principio) return;
    const key = keyOf(r.principio);
    if (!key || seen.has(key)) return;
    seen.add(key);
    const verified = r.estado === 'verificado' && r.fuente && r.por && r.el && F.ATC_RE.test(cleanAtc(r.atc));
    out.rows.push({ key, principio: String(r.principio).trim(), atc: cleanAtc(r.atc), area: r.area || '', area2: r.area2 || '', fuente: String(r.fuente || ''), estado: verified ? 'verificado' : 'sin_verificar', por: verified ? String(r.por) : '', el: verified ? String(r.el) : '', nota: String(r.nota || '') });
  });
  return out;
}
const find = (d, principio) => d.rows.find(r => r.key === keyOf(principio)) || null;
/* Lo que el diccionario sabe de un principio activo. El área propia de la fila manda sobre la derivada del ATC. */
function lookup(d, principio) {
  const r = principio ? find(d, principio) : null;
  if (!r) return null;
  return { row: r, atc: r.atc, area: r.area || areaFromAtc(r.atc), area2: r.area2 || '', verified: r.estado === 'verificado' };
}
/* Crea o actualiza una fila. Cambiar el código o el área de una fila verificada la devuelve a «sin verificar». */
function upsert(d, o) {
  const key = keyOf(o.principio);
  if (!key) return { ok: false, reason: 'Escribe el principio activo.' };
  const atc = cleanAtc(o.atc);
  if (atc && !F.ATC_RE.test(atc)) return { ok: false, reason: 'El código ATC no tiene el formato esperado. Ejemplos: A10, A10BX, A10BX16.' };
  let r = d.rows.find(x => x.key === key);
  if (!r) { r = { key, principio: String(o.principio).trim(), atc: '', area: '', area2: '', fuente: '', estado: 'sin_verificar', por: '', el: '', nota: '' }; d.rows.push(r); }
  const changed = (o.atc !== undefined && atc !== r.atc) || (o.area !== undefined && (o.area || '') !== r.area) || (o.area2 !== undefined && (o.area2 || '') !== r.area2);
  if (o.atc !== undefined) r.atc = atc;
  if (o.area !== undefined) r.area = o.area || '';
  if (o.area2 !== undefined) r.area2 = o.area2 || '';
  if (o.fuente !== undefined) r.fuente = String(o.fuente || '');
  if (o.nota !== undefined) r.nota = String(o.nota || '');
  if (changed) { r.estado = 'sin_verificar'; r.por = ''; r.el = ''; }
  return { ok: true, row: r };
}
function verify(d, key, o) {
  const r = d.rows.find(x => x.key === key);
  if (!r) return { ok: false, reason: 'No está en el diccionario.' };
  const fuente = String((o && o.fuente) || '').trim(), por = String((o && o.por) || '').trim();
  if (!F.ATC_RE.test(cleanAtc(r.atc))) return { ok: false, reason: 'La fila necesita un código ATC con formato válido.' };
  if (!fuente) return { ok: false, reason: 'Anota la fuente donde lo verificaste, por ejemplo «Índice ATC OMS 2025».' };
  if (!por) return { ok: false, reason: 'Anota quién lo verificó.' };
  Object.assign(r, { fuente, estado: 'verificado', por, el: (o && o.at) || new Date().toISOString() });
  return { ok: true, row: r };
}
function unverify(d, key) { const r = d.rows.find(x => x.key === key); if (!r) return false; r.estado = 'sin_verificar'; r.por = ''; r.el = ''; return true; }
function remove(d, key) { const n = d.rows.length; d.rows = d.rows.filter(r => r.key !== key); return d.rows.length < n; }

const HEADERS = ['principio', 'atc', 'area', 'area2', 'fuente', 'estado', 'verificado_por', 'verificado_el', 'nota'];
const q = s => { s = String(s ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function toCsv(d) { return [HEADERS.join(','), ...d.rows.map(r => [r.principio, r.atc, r.area, r.area2, r.fuente, r.estado, r.por, r.el, r.nota].map(q).join(','))].join('\n'); }
/* Importa filas. Una fila marcada «verificado» sin fuente, nombre, fecha y ATC válido entra como «sin verificar». */
function fromCsv(d, text) {
  const { rows } = F.parseCSV(text);
  if (!rows.length) return { added: 0, updated: 0, skipped: 0, downgraded: 0 };
  const H = rows[0].map(h => lk(h).replace(/\s+/g, '_'));
  const col = n => H.indexOf(n);
  const res = { added: 0, updated: 0, skipped: 0, downgraded: 0 };
  if (col('principio') < 0) return { ...res, error: 'Falta la columna «principio».' };
  rows.slice(1).forEach(c => {
    const g = n => (col(n) >= 0 ? String(c[col(n)] ?? '').trim() : '');
    if (!g('principio')) { res.skipped++; return; }
    const existed = !!find(d, g('principio'));
    const area = F.AREAS.includes(g('area')) ? g('area') : '', area2 = F.AREAS.includes(g('area2')) ? g('area2') : '';
    const r = upsert(d, { principio: g('principio'), atc: g('atc'), area, area2, fuente: g('fuente'), nota: g('nota') });
    if (!r.ok) { res.skipped++; return; }
    existed ? res.updated++ : res.added++;
    if (g('estado') === 'verificado') {
      const v = g('verificado_por') && g('verificado_el') ? verify(d, r.row.key, { fuente: g('fuente'), por: g('verificado_por'), at: g('verificado_el') }) : { ok: false };
      if (!v.ok) res.downgraded++;
    }
  });
  return res;
}
/* Principios activos de los productos que todavía no están en el diccionario (para la plantilla). */
function missing(d, principios) {
  const seen = new Set(), out = [];
  principios.forEach(p => { const k = keyOf(p); if (k && !seen.has(k) && !d.rows.some(r => r.key === k)) { seen.add(k); out.push(String(p).trim()); } });
  return out;
}

const api = { ATC_AREAS, areaFromAtc, keyOf, cleanAtc, empty, normalize, find, lookup, upsert, verify, unverify, remove, toCsv, fromCsv, missing, HEADERS };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.FichasClasif = api;
})(typeof self !== 'undefined' ? self : this);
