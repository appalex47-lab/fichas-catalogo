/*
 * Fase 3: duplicados avanzados, diccionario inteligente y normalización segura.
 * Determinista. Nunca sustituye valores por sí sola.
 */
(function (root) {
'use strict';
const fold = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const clean = s => fold(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
const compact = s => clean(s).replace(/\s+/g, '');
function levenshtein(a, b) {
  a = String(a); b = String(b);
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  if (a.length > b.length) [a,b] = [b,a];
  let prev = Array.from({length:b.length + 1}, (_,i)=>i);
  for (let i=1;i<=a.length;i++) {
    const cur = [i];
    for (let j=1;j<=b.length;j++) cur[j] = Math.min(cur[j-1]+1, prev[j]+1, prev[j-1]+(a[i-1]===b[j-1]?0:1));
    prev = cur;
  }
  return prev[b.length];
}
function similarity(a,b) {
  const x=compact(a), y=compact(b); if (!x || !y) return 0;
  return 1 - levenshtein(x,y) / Math.max(x.length,y.length);
}
function normalizeText(value) {
  const original = String(value ?? '');
  const normalized = original.replace(/[\u00A0\u2007\u202F]/g,' ').replace(/[\t\r\n]+/g,' ').replace(/\s+/g,' ').trim();
  return { original, normalized, changed: original !== normalized };
}
function dictionarySuggestions(text, entries, opts={}) {
  const threshold = opts.threshold ?? 0.88;
  const max = opts.max ?? 3;
  const source = Array.isArray(entries) ? entries : [];
  const target = clean(text);
  if (!target) return [];
  return source.map(e => {
    const alias = e?.alias ?? '';
    const canon = e?.canon ?? alias;
    const a = clean(alias);
    if (!a) return null;
    const exact = target === a || target.includes(a);
    const score = exact ? 1 : similarity(target, a);
    return { alias, canon, score: Number(score.toFixed(3)), exact };
  }).filter(Boolean).filter(x => x.exact || x.score >= threshold)
    .sort((a,b) => Number(b.exact)-Number(a.exact) || b.score-a.score || a.alias.length-b.alias.length)
    .slice(0,max);
}
function detectNearDuplicates(items, keyFn, opts={}) {
  const threshold = opts.threshold ?? 0.92;
  const minLength = opts.minLength ?? 5;
  const out=[]; const seen=[];
  (items||[]).forEach((item,index)=>{
    const raw = keyFn(item,index); const key=clean(raw); const compare=fold(raw).replace(/\s+/g,' ').trim();
    if (!key || key.length < minLength) { seen.push({index,key,compare,raw}); return; }
    seen.forEach(prev=>{
      if (!prev.key || prev.key.length < minLength) return;
      const score=similarity(compare,prev.compare);
      if (score>=threshold && key!==prev.key) out.push({indexes:[prev.index,index],score:Number(score.toFixed(3)),key,otherKey:prev.key,raw,otherRaw:prev.raw});
    });
    seen.push({index,key,compare,raw});
  });
  return out;
}
function normalizeSuggestion(value) {
  const n=normalizeText(value);
  return n.changed ? { ...n, reason:'espacios o saltos de línea normalizables' } : null;
}
const api={fold,clean,compact,levenshtein,similarity,normalizeText,dictionarySuggestions,detectNearDuplicates,normalizeSuggestion};
if (typeof module !== 'undefined' && module.exports) module.exports=api; else root.FichasNormalization=api;
})(typeof self !== 'undefined' ? self : this);
