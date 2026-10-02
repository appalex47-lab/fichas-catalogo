/*
 * Fichas de catálogo: motor determinista de calidad de datos.
 * No modifica registros. Audita, clasifica y prepara una cuarentena explícita.
 * Funciona en navegador (window.FichasQuality) y Node (require).
 */
(function (root) {
'use strict';
const F = (typeof module !== 'undefined' && module.exports) ? require('./logic.js') : root.Fichas;

const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const NUMERIC_KEYS = new Set(['concentracion', 'volumen', 'contenido', 'fps']);
const SOURCE_LABELS = {
  manual: 'captura manual',
  rules: 'reglas',
  ai: 'IA',
  vision: 'foto/IA',
  unknown: 'origen no declarado'
};

function issue(severity, code, field, message, extra) {
  return { severity, code, field: field || '', message, ...(extra || {}) };
}
function fieldLabel(c, key) { return F.labelOf(c, key); }
function sourceOf(opts, key) {
  return (opts.sourceMap && opts.sourceMap[key]) || opts.source || 'unknown';
}
function evidenceOf(opts, key) {
  return (opts.evidenceMap && opts.evidenceMap[key]) || (opts.provenanceMap && opts.provenanceMap[key] && opts.provenanceMap[key].evidence) || '';
}
function isNumericLike(s) { return /^-?\s*\d+(?:[.,]\d+)?(?:\s*(?:mg|mcg|µg|ug|g|gr|grs|gm|kg|ml|mL|l|L|ui|UI|iu|cm|mm|%))?(?:\s*\/\s*.*)?$/i.test(String(s || '').trim()); }
function hasNegativeNumber(s) { return /(^|[^\p{L}\d])-\s*\d/u.test(String(s || '')); }
function hasNumber(s) { return /\d/.test(String(s || '')); }

function audit(catId, raw, opts) {
  opts = opts || {};
  const c = F.CATS[catId];
  if (!c) return { cat: null, status: 'critico', issues: [issue('error', 'unknown-category', '', 'La categoría no existe.')], counts: { error: 1, warning: 0, info: 0 }, provenance: {}, normalized: {}, quarantined: {} };
  const v = raw && typeof raw === 'object' ? raw : {};
  const issues = [], normalized = {}, provenance = {};
  const allowed = new Set(c.fields.map(fd => fd.key));

  Object.keys(v).forEach(key => {
    if (!allowed.has(key)) issues.push(issue('warning', 'unknown-field', key, `El campo «${key}» no pertenece a ${c.name}.`, { original: v[key] }));
  });

  c.fields.forEach(fd => {
    const original = v[fd.key] == null ? '' : String(v[fd.key]);
    const trimmed = original.replace(/\s+/g, ' ').trim();
    normalized[fd.key] = trimmed;
    const src = sourceOf(opts, fd.key);
    const prior = opts.provenanceMap && opts.provenanceMap[fd.key];
    provenance[fd.key] = { source: src, sourceLabel: SOURCE_LABELS[src] || src, evidence: evidenceOf(opts, fd.key), original: prior?.original ?? original, normalized: trimmed, updatedAt: prior?.updatedAt || null };
    if (original && CONTROL_RE.test(original)) issues.push(issue('error', 'control-character', fd.key, `El campo «${fd.label}» contiene caracteres de control no permitidos.`, { original }));
    if (original && original !== trimmed) issues.push(issue('info', 'whitespace-normalization', fd.key, `El campo «${fd.label}» contiene espacios o saltos que se normalizarán.`, { original, normalized: trimmed }));
    if (fd.req && !trimmed) issues.push(issue('error', 'required-missing', fd.key, `Falta el campo requerido «${fd.label}».`));
    if (fd.type === 'select' && trimmed && !fd.opts.some(([value]) => value === trimmed)) issues.push(issue('error', 'invalid-option', fd.key, `El valor de «${fd.label}» no corresponde a una opción válida.`, { original }));
    if (NUMERIC_KEYS.has(fd.key) && trimmed) {
      if (hasNegativeNumber(trimmed)) issues.push(issue('error', 'negative-number', fd.key, `«${fd.label}» contiene un número negativo; no se puede aceptar automáticamente.`, { original }));
      else if ((fd.key === 'fps' && !hasNumber(trimmed)) || (fd.key !== 'fps' && !isNumericLike(trimmed) && /\d/.test(trimmed) === false)) {
        issues.push(issue('warning', 'numeric-format', fd.key, `Revisa el formato numérico de «${fd.label}».`, { original }));
      }
    }
  });

  const L = F.lint(c, v);
  L.claim.forEach(x => issues.push(issue('error', 'language-claim', x.field, `Claim que requiere corrección: «${x.term}».`, { term: x.term })));
  L.med.forEach(x => issues.push(issue('warning', 'language-medical', x.field, `Término que requiere revisión: «${x.term}».`, { term: x.term })));
  L.amber.forEach(x => issues.push(issue('warning', 'language-review', x.field, `Afirmación que requiere validación: «${x.term}».`, { term: x.term })));
  L.vacio.forEach(x => issues.push(issue('warning', 'language-subjective', x.field, `Lenguaje subjetivo o superlativo: «${x.term}».`, { term: x.term })));
  L.check.forEach(x => issues.push(issue('warning', 'rule-check', '', x)));

  const leftover = Array.isArray(opts.leftover) ? opts.leftover.filter(Boolean) : [];
  if (leftover.length) issues.push(issue('warning', 'unassigned-text', '', `Hay texto sin asignar: ${leftover.join(' ')}.`, { tokens: leftover }));

  const counts = issues.reduce((a, x) => { a[x.severity]++; return a; }, { error: 0, warning: 0, info: 0 });
  const status = counts.error ? 'critico' : counts.warning ? 'revisar' : 'listo';
  const quarantined = quarantine(v, issues);
  return { cat: catId, status, issues, counts, normalized, provenance, quarantined, lint: L };
}

function quarantine(raw, issues) {
  const blocked = new Set(issues.filter(x => x.severity === 'error' && ['control-character', 'invalid-option', 'negative-number'].includes(x.code)).map(x => x.field).filter(Boolean));
  const kept = { ...(raw || {}) }, original = {};
  blocked.forEach(k => { original[k] = kept[k]; delete kept[k]; });
  return { kept, original, fields: [...blocked], reasonCodes: issues.filter(x => blocked.has(x.field)).map(x => x.code) };
}

function summarize(reports) {
  const list = Array.isArray(reports) ? reports : [];
  return list.reduce((a, r) => {
    a.total++;
    a[r.status] = (a[r.status] || 0) + 1;
    a.errors += r.counts?.error || 0;
    a.warnings += r.counts?.warning || 0;
    return a;
  }, { total: 0, listo: 0, revisar: 0, critico: 0, errors: 0, warnings: 0 });
}

const api = { audit, quarantine, summarize, SOURCE_LABELS };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.FichasQuality = api;
})(typeof self !== 'undefined' ? self : this);
