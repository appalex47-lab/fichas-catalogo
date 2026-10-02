/*
 * Fase 5: Health Score y observabilidad de calidad.
 * El score es explicable y diagnóstico; no sustituye status, evidencia ni mastery.
 * No modifica registros fuente.
 */
(function (root) {
'use strict';

const VERSION = '1.0';
const SCHEMA = 'fichas.quality.v1';
const WEIGHTS = Object.freeze({ error: 20, warning: 6, info: 1 });
const DIMENSIONS = Object.freeze({
  completeness: 'Completitud',
  validity: 'Validez',
  language: 'Lenguaje',
  consistency: 'Consistencia',
  provenance: 'Procedencia'
});

function clamp(n, min = 0, max = 100) { return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min)); }
function countBy(reports, predicate) { return reports.reduce((n, r) => n + (predicate(r) ? 1 : 0), 0); }

function dimensionPenalty(issues, codes) {
  return (issues || []).reduce((sum, issue) => {
    if (!codes.has(issue.code)) return sum;
    return sum + (WEIGHTS[issue.severity] || 0);
  }, 0);
}

function scoreReport(report, canonical, anomalies) {
  const r = report || { issues: [], counts: {} };
  const issues = Array.isArray(r.issues) ? r.issues : [];
  const dims = {
    completeness: clamp(100 - dimensionPenalty(issues, new Set(['required-missing', 'unassigned-text']))),
    validity: clamp(100 - dimensionPenalty(issues, new Set(['invalid-option', 'numeric-format', 'negative-number', 'control-character', 'unknown-category']))),
    language: clamp(100 - dimensionPenalty(issues, new Set(['language-claim', 'language-medical', 'language-review', 'language-subjective', 'rule-check']))),
    consistency: clamp(100 - dimensionPenalty(issues, new Set(['unknown-field']))),
    provenance: 100
  };
  const anomalyPenalty = (Array.isArray(anomalies) ? anomalies : []).reduce((sum, a) => sum + (a?.severity === 'error' ? 20 : 6), 0);
  dims.consistency = clamp(dims.consistency - anomalyPenalty);

  const p = canonical?.provenance && typeof canonical.provenance === 'object' ? canonical.provenance : null;
  if (p) {
    const vals = Object.values(p);
    if (vals.length) dims.provenance = clamp(100 * vals.filter(x => x && x.source && x.source !== 'unknown').length / vals.length);
  } else dims.provenance = 0;

  const rawPenalty = Object.values(r.counts || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
  const penalty = (Number(r.counts?.error) || 0) * WEIGHTS.error + (Number(r.counts?.warning) || 0) * WEIGHTS.warning + (Number(r.counts?.info) || 0) * WEIGHTS.info;
  const score = clamp(100 - penalty - anomalyPenalty);
  const band = score >= 90 ? 'excelente' : score >= 75 ? 'buena' : score >= 50 ? 'revisar' : 'critica';
  return {
    schema: SCHEMA,
    version: VERSION,
    score,
    band,
    status: r.status || 'desconocido',
    counts: { error: Number(r.counts?.error) || 0, warning: Number(r.counts?.warning) || 0, info: Number(r.counts?.info) || 0 },
    dimensions: dims,
    penalty,
    issueCount: rawPenalty,
    explain: explain(r, score, band)
  };
}

function explain(report, score, band) {
  const c = report?.counts || {};
  if ((c.error || 0) > 0) return `Health ${score}/100 (${band}): corrige ${c.error} error(es) antes de dar por válida la ficha.`;
  if ((c.warning || 0) > 0) return `Health ${score}/100 (${band}): revisa ${c.warning} aviso(s) antes de exportar.`;
  if ((c.info || 0) > 0) return `Health ${score}/100 (${band}): hay ${c.info} observación(es) informativas.`;
  return `Health ${score}/100 (${band}): sin hallazgos de calidad.`;
}

function summarize(reports) {
  const list = Array.isArray(reports) ? reports.filter(Boolean) : [];
  const scores = list.map(r => r.health?.score).filter(Number.isFinite);
  const average = scores.length ? Math.round(scores.reduce((a,b) => a+b, 0) / scores.length) : null;
  const min = scores.length ? Math.min(...scores) : null;
  const max = scores.length ? Math.max(...scores) : null;
  const bands = scores.reduce((a, score) => {
    const b = score >= 90 ? 'excelente' : score >= 75 ? 'buena' : score >= 50 ? 'revisar' : 'critica';
    a[b]++;
    return a;
  }, { excelente: 0, buena: 0, revisar: 0, critica: 0 });
  return { schema: SCHEMA, version: VERSION, total: list.length, average, min, max, bands };
}

function snapshot(reports, context) {
  const summary = summarize(reports);
  return {
    schema: SCHEMA,
    version: VERSION,
    at: new Date().toISOString(),
    context: String(context || 'manual'),
    ...summary
  };
}

function appendHistory(history, entry, max = 100) {
  const list = Array.isArray(history) ? history.slice() : [];
  list.push(entry);
  return list.slice(-Math.max(1, max));
}

const api = { VERSION, SCHEMA, WEIGHTS, DIMENSIONS, scoreReport, summarize, snapshot, appendHistory };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.FichasHealth = api;
})(typeof self !== 'undefined' ? self : this);
