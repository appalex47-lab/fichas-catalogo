/*
 * Fichas de catálogo: interfaz.
 * Usa window.Fichas (logic.js). No depende de servicios externos.
 */
(() => {
'use strict';
const {
  CATS,
  TITLE_MAX,
  batchCsv,
  computeFor,
  defExp,
  defMeta,
  defMetaCat,
  dupBrand,
  encodeCp1252,
  extractRaw,
  extractRows,
  lc,
  lint,
  langCount,
  labelOf,
  magentoBatch,
  mgFull,
  parseBulk,
  parseDic,
  seg,
  templateRows,
  toSheet
} = window.Fichas;
const Anomalies = window.FichasAnomalies || { provenanceFor: () => ({}), detectBatch: () => [], summarize: () => ({ total:0,error:0,warning:0,info:0,byType:{} }), event: () => ({}) };
const Normalization = window.FichasNormalization || {};
const Canonical = window.FichasCanonical || { canonicalize: () => ({ schema: 'fichas.canonical.v1', version: '1.0', identity: {}, fields: {}, derived: {}, quality: {}, provenance: {}, anomalyTypes: [] }) };
const Quality = window.FichasQuality || { audit: () => ({ status: 'critico', issues: [], counts: { error: 0, warning: 0, info: 0 } }), summarize: () => ({ total: 0, listo: 0, revisar: 0, critico: 0, errors: 0, warnings: 0 }) };
const Health = window.FichasHealth || { scoreReport: () => ({ score: 0, band: 'critica' }), summarize: () => ({ total: 0, average: null, min: null, max: null, bands: { critica: 0, revisar: 0, buena: 0, excelente: 0 } }), snapshot: () => ({}) , appendHistory: (h) => h || [] };
const Assist = window.FichasAssist || { localAnswer: () => null, why: () => null, parseActions: () => [], parseAction: () => null };
const SEO = window.FichasSEO || {
  evaluate: () => null, evaluateBatch: () => ({ items: [], summary: { total: 0, evaluados: 0, byStatus: { critico: 0, revisar: 0, pendiente: 0, listo: 0, sin_evaluar: 0 }, average: null, min: null, max: null } }),
  explainScore: () => null, STATUS_LABEL: {}
};
const Content = window.FichasContent || {
  evaluate: () => null, evaluateBatch: () => ({ items: [], summary: { total: 0, evaluados: 0, byStatus: { critico: 0, revisar: 0, listo: 0, sin_evaluar: 0 }, average: null } }),
  explainScore: () => null, STATUS_LABEL: {}
};
const MagentoReadiness = window.FichasMagentoReadiness || {
  evaluate: () => null, evaluateBatch: () => ({ items: [], summary: { total: 0, ready: 0, readyWithWarnings: 0, blocked: 0, exportables: 0, average: null } }), STATE_LABEL: {}
};
const Score360 = window.FichasScore360 || {
  compute: () => null, summarize: () => ({ total: 0, average: null, health: null, seo: null, content: null, magento: null, blocked: 0, withWarnings: 0, ready: 0, bands: {} }),
  snapshot: () => ({}), appendHistory: h => h || [], isCritical360: () => false, KEYS: [], WEIGHTS: {}, BAND_LABEL: {}, FORMULA: ''
};
const UX = window.FichasUX || {
  safeText: (x, f) => (typeof x === 'string' && x) || f || '', friendlyError: (e, a) => ({ message: `No se pudo ${a || 'completar la acción'}. Intenta nuevamente.`, technical: '' }),
  makeMemo: (sig, fn) => ({ stats: { hits: 0, misses: 0 }, get: (...a) => fn(...a), reset() {} }),
  deriveStatus: () => ({ key: 'BORRADOR', label: 'BORRADOR', icon: '✎', tone: 'info', why: '' }), stepOf: () => [], summaryCounts: () => ({ blockers: 0, attention: 0, errors: 0, improvements: 0, total: 0 }),
  attentionText: () => '', nextBestAction: () => ({ kind: 'listo', texto: '', button: null }), fieldStates: () => ({}), usageOf: () => ({ items: [], used: [] }), usageText: () => '',
  originOf: () => ({ text: 'captura manual', source: 'manual', normalized: null }), titleKeysOf: () => [], metaKeysOf: () => [], effectiveSave: () => ({ key: 'sin_cambios', icon: '○', label: 'Sin cambios pendientes' }),
  itemSig: () => '', isApproved: () => false, recordChange: l => l, contextAlerts: () => [], isUxFilter: () => false, passUx: () => true, targetFor: () => null,
  PRIMARY_FILTERS: { todos: 'Todos' }, CLASS_LABEL: {}, STATUS: {}, hash: () => '0'
};
const Rules = window.FichasRules || { buildRulesDoc: () => ({ html: '<p>El módulo de reglas (rules.js) no se cargó.</p>', hash: '', version: '', generated: '' }) };
const Connector = window.FichasConnector || {
  readGoogleSheets: async () => { throw new Error('El módulo de conectores (connector.js) no se cargó.'); },
  readRest: async () => { throw new Error('El módulo de conectores (connector.js) no se cargó.'); },
  prepareRecords: () => [],
};
const AI = window.FichasAI || {
  KEY_STORAGE: 'cohere_api_key_local', DEFAULT_MODEL: '', DEFAULT_ASSISTANT_MODEL: '', DEFAULT_VISION_MODEL: '', MAX_IMAGES: 3, BATCH: 15,
  fitSize: (w, h) => ({ w, h }),
  visionExtract: async () => { throw new Error('El módulo de IA (ai.js) no se cargó.'); },
  aiExtract: async () => { throw new Error('El módulo de IA (ai.js) no se cargó.'); },
  assistantAnswer: async () => { throw new Error('El módulo de IA (ai.js) no se cargó.'); }
};

/* ---------- UI ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => {
  if (s == null) return '';
  if (typeof s === 'number' && !Number.isFinite(s)) return '';
  if (typeof s === 'object' && !Array.isArray(s)) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
};

const store = {
  get(k, d) { try { const x = localStorage.getItem(k); return x ? JSON.parse(x) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
};

/* Persistencia defensiva: localStorage sigue siendo la fuente primaria, pero
 * guardamos un espejo en IndexedDB cuando el navegador lo permite. Esto evita
 * perder el lote en navegadores móviles que restringen localStorage.
 */
const PERSIST_DB='fichas-catalogo-v1';
const PERSIST_STORE='state';
function idbAvailable(){ return typeof indexedDB !== 'undefined'; }
function idbOpen(){ return new Promise((resolve,reject)=>{ if(!idbAvailable()) return reject(new Error('indexeddb_unavailable')); const r=indexedDB.open(PERSIST_DB,1); r.onupgradeneeded=()=>r.result.createObjectStore(PERSIST_STORE); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error||new Error('indexeddb_open')); }); }
async function idbSet(k,v){ try { const db=await idbOpen(); await new Promise((res,rej)=>{ const tx=db.transaction(PERSIST_STORE,'readwrite'); tx.objectStore(PERSIST_STORE).put(v,k); tx.oncomplete=res; tx.onerror=()=>rej(tx.error); }); db.close(); } catch(_) {} }
async function idbGet(k){ try { const db=await idbOpen(); const v=await new Promise((res,rej)=>{ const tx=db.transaction(PERSIST_STORE,'readonly'); const q=tx.objectStore(PERSIST_STORE).get(k); q.onsuccess=()=>res(q.result); q.onerror=()=>rej(q.error); }); db.close(); return v; } catch(_) { return undefined; } }
/* Estado de guardado visible (Guardado / Guardando / Error al guardar). Un guardado correcto limpia un error anterior. */
let pendingSaves = 0;
const saveInfo = { raw: 'sin_cambios', at: null };
function persist(k, v) {
  const ok = store.set(k, v);
  if (!ok) { saveInfo.raw = 'error'; }
  else {
    pendingSaves++; saveInfo.raw = 'guardando';
    idbSet(k, v).then(() => {}, () => {}).then(() => { pendingSaves--; if (!pendingSaves && saveInfo.raw === 'guardando') { saveInfo.raw = 'guardado'; saveInfo.at = Date.now(); } renderSaveState(); });
  }
  renderSaveState();
  return ok;
}
async function hydratePersistentState(){
  const lot=await idbGet('fichas.lote.v1');
  if(Array.isArray(lot) && lot.length && (!Array.isArray(state.lote) || !state.lote.length)){ state.lote=lot; persist('fichas.lote.v1',lot); }
  const audit=await idbGet('fichas.audit.v1');
  if(Array.isArray(audit) && audit.length && (!Array.isArray(state.audit) || !state.audit.length)){ state.audit=audit; persist('fichas.audit.v1',audit); }
  renderLote();
  renderPersistenceStatus();
}
const state = {
  cat: 'med', v: {}, sku: '', img: '', tab: 'titulo', mgView: 'preview',
  lote: store.get('fichas.lote.v1', []),
  keepText: store.get('fichas.keep.v1', 'GNC, OMRON, GSK'),
  chgOpen: false, out: null,
  aiFlags: {}, aiSuggest: [], asst: [], aiModel: store.get('fichas.aimodel.v1', ''), aiAsstModel: store.get('fichas.aiasstmodel.v1', ''), aiLimit: store.get('fichas.ailimit.v1', 1000), aiVisionModel: store.get('fichas.aivisionmodel.v1', ''), photos: [], imgResult: null,
  loteFilter: 'todos', loteShown: 50, bulk: null, bulkText: '', bulkName: '', meta: null, exp: null, metaEditCat: 'med', seo: null, seoOpen: {}, eval: null, evalOpen: {}, s360History: store.get('fichas.score360.v1', []), anomalies: [], audit: store.get('fichas.audit.v1', [])
};
{
  const m = store.get('fichas.meta.v2', null), d = defMeta();
  state.meta = m ? { ...d, ...m, cats: Object.fromEntries(Object.keys(d.cats).map(id => [id, { ...d.cats[id], ...((m.cats || {})[id] || {}) }])) } : d;
  state.exp = { ...defExp(), ...(store.get('fichas.exp.v2', null) || {}) };
  state.dic = { marcas: '', principios: '', labs: '', pos: false, ...(store.get('fichas.dic.v1', null) || {}) };
}
Object.assign(state, { dirty: false, changes: [], fOpen: {}, histOpen: false, loteOpen: new Set(), gotos: [], metaRev: 0, _baseSig: '', _prevV: {}, _lastAssess: null, _assessKey: '' });
const keepSet = () => new Set(String(state.keepText).split(/[,\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean));
const hasAny = c => c.fields.some(fd => fd.type !== 'select' && (state.v[fd.key] || '').trim());

let toastTimer;
function toast(msg, kind) {
  const t = $('#toast');
  t.textContent = UX.safeText(msg, 'Listo.'); t.dataset.kind = kind || 'info';
  t.setAttribute('role', kind === 'error' ? 'alert' : 'status'); t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, kind === 'error' ? 6000 : 2400);
}
const notify = (msg, kind) => toast(msg, kind || 'ok');
function announce(msg) { const el = $('#ux-live'); if (el) { el.textContent = ''; setTimeout(() => { el.textContent = UX.safeText(msg, ''); }, 30); } }
/* Confirmación accesible para acciones destructivas: el foco inicia en «Cancelar» y Escape cancela. */
function confirmDialog(o) {
  return new Promise(resolve => {
    const prev = document.activeElement;
    const id = 'cdlg-' + Math.random().toString(36).slice(2, 7);
    const scrim = document.createElement('div'); scrim.className = 'cdlg-scrim'; scrim.id = 'confirm-dlg';
    scrim.innerHTML = `<div class="cdlg" role="alertdialog" aria-modal="true" aria-labelledby="${id}-t" aria-describedby="${id}-d"><h3 id="${id}-t">${esc(o.title)}</h3><p id="${id}-d">${esc(o.message)}</p><div class="actions"><button type="button" class="btn" data-cd="no">${esc(o.cancelLabel || 'Cancelar')}</button><button type="button" class="btn ${o.danger ? 'btn--danger' : 'btn--primary'}" data-cd="yes">${esc(o.confirmLabel || 'Confirmar')}</button></div></div>`;
    document.body.appendChild(scrim);
    const done = v => { document.removeEventListener('keydown', onKey, true); scrim.remove(); if (prev && prev.focus) { try { prev.focus(); } catch (_) {} } resolve(v); };
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); done(false); }
      else if (e.key === 'Tab') { const b = [...scrim.querySelectorAll('button')]; const i = b.indexOf(document.activeElement); e.preventDefault(); b[(i + (e.shiftKey ? -1 : 1) + b.length) % b.length].focus(); }
    }
    document.addEventListener('keydown', onKey, true);
    scrim.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-cd]'); if (b) done(b.dataset.cd === 'yes'); else if (e.target === scrim) done(false); });
    scrim.querySelector('[data-cd="no"]').focus();
  });
}
/* Un botón con trabajo asíncrono: evita el doble clic, marca aria-busy y convierte cualquier error en un mensaje comprensible. */
async function withBusy(btn, fn, failMsg) {
  if (btn && btn.dataset.busy === '1') return undefined;
  if (btn) { btn.dataset.busy = '1'; btn.setAttribute('aria-busy', 'true'); }
  try { return await fn(); }
  catch (e) { if (window.console) console.error(e); notify(UX.friendlyError(e, failMsg).message, 'error'); return undefined; }
  finally { if (btn) { delete btn.dataset.busy; btn.removeAttribute('aria-busy'); } }
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly',''); ta.style.cssText = 'position:fixed;opacity:.01;top:0;left:0;width:1px;height:1px';
  document.body.appendChild(ta); ta.focus(); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) {}
  ta.remove();
  return ok;
}
function manualCopyDialog(text, title='Texto para copiar') {
  const old=$('#copy-fallback'); if(old) old.remove();
  const box=document.createElement('div'); box.id='copy-fallback'; box.className='copy-fallback';
  box.innerHTML=`<div class="copy-fallback__box" role="dialog" aria-modal="true"><h3>${esc(title)}</h3><p class="hint">El navegador bloqueó la copia automática. Pulsa «Seleccionar todo» y luego Copiar.</p><textarea readonly></textarea><div class="actions"><button class="btn btn--primary" data-copy-select>Seleccionar todo</button><button class="btn btn--quiet" data-copy-close>Cerrar</button></div></div>`;
  document.body.appendChild(box); const ta=box.querySelector('textarea'); ta.value=text;
  box.addEventListener('click',e=>{ if(e.target.dataset.copyClose!==undefined) box.remove(); if(e.target.dataset.copySelect!==undefined){ ta.focus(); ta.select(); try{ ta.setSelectionRange(0,ta.value.length); }catch(_){} } });
  ta.focus(); ta.select();
}
async function copyText(text, msg) {
  let ok = false;
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await Promise.race([
        navigator.clipboard.writeText(String(text)),
        new Promise((_, reject) => setTimeout(() => reject(new Error('clipboard_timeout')), 1200))
      ]);
      ok = true;
    }
  } catch (e) {}
  if(!ok) ok = fallbackCopy(text);
  if(ok) notify(msg, 'ok'); else manualCopyDialog(text, msg);
  return ok;
}


/* Formulario */
function renderCats() {
  $('#cats').innerHTML = Object.entries(CATS).map(([id, c]) =>
    `<label class="pill"><input type="radio" name="cat" value="${id}" ${id === state.cat ? 'checked' : ''}><span>${c.emoji} ${esc(c.name)}</span></label>`).join('');
}
const unconfirmed = ai => Object.values(ai || {}).some(v => v === 'sugerido' || v === 'imagen');
const aiBadge = k => state.aiFlags[k] === 'imagen'
  ? '<span class="ai-badge ai-badge--sug" title="Leído de una foto por IA. Verifícalo con el empaque. Al editar el dato, la marca desaparece.">IA foto</span>'
  : state.aiFlags[k] === 'sugerido'
  ? '<span class="ai-badge ai-badge--sug" title="Sugerido por IA. Verifícalo con el empaque. Al editar el dato, la marca desaparece.">IA sugerido</span>'
  : state.aiFlags[k] === 'extraido' ? '<span class="ai-badge ai-badge--ext" title="Extraído del texto y verificado por la herramienta.">IA extraído</span>' : '';
function fieldHTML(fd) {
  const val = state.v[fd.key] || '';
  const label = `<label for="f-${fd.key}">${esc(fd.label)}${fd.req ? '<span class="req" title="Requerido por la estructura">*</span>' : ''}${aiBadge(fd.key)}</label>`;
  let ctl;
  const desc = ` aria-describedby="fm-${fd.key}${fd.hint ? ' hint-' + fd.key : ''}"`;
  if (fd.type === 'select') {
    ctl = `<select id="f-${fd.key}" data-key="${fd.key}">${fd.opts.map(([v, l]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  } else if (fd.type === 'area') {
    ctl = `<textarea id="f-${fd.key}" data-key="${fd.key}"${desc} rows="2" placeholder="${esc(fd.ph || '')}">${esc(val)}</textarea>`;
  } else {
    ctl = `<input type="text" id="f-${fd.key}" data-key="${fd.key}"${desc} value="${esc(val)}" placeholder="${esc(fd.ph || '')}" autocomplete="off">`;
  }
  return `<div class="field">${label}${ctl}${fd.hint ? `<p class="hint" id="hint-${fd.key}">${esc(fd.hint)}</p>` : ''}<div class="fmeta" id="fm-${fd.key}"></div></div>`;
}
function renderForm() {
  const c = CATS[state.cat];
  const a = c.fields.filter(x => x.g !== 'd'), b = c.fields.filter(x => x.g === 'd');
  $('#form').innerHTML =
    `<p class="legend"><span class="req">*</span> Requerido por la estructura de la categoría.</p>` +
    a.map(fieldHTML).join('') +
    `<details class="more" open><summary>Datos para las descripciones</summary>${b.map(fieldHTML).join('')}</details>`;
  $('#sku').value = state.sku;
  $('#img').value = state.img;
}

/* Resultado */
function noteList(cls, head, items, why) {
  return `<div class="note ${cls}"><p><strong>${head}</strong>${why ? ` <button class="linkbtn why" data-why="${why}">¿Por qué?</button>` : ''}</p><ul>${items.map(i => `<li>${i}</li>`).join('')}</ul></div>`;
}
function renderQuality(r) {
  const report = Quality.audit(state.cat, state.v, { source: 'manual' });
  const c = report.counts;
  const cls = report.status === 'listo' ? 'note--ok' : report.status === 'critico' ? 'note--bad' : 'note--warn';
  const label = report.status === 'listo' ? 'Calidad lista' : report.status === 'critico' ? 'Calidad crítica' : 'Calidad: revisar';
  const details = report.issues.slice(0, 8).map(x => `<li><strong>${esc(x.field || 'Registro')}:</strong> ${esc(x.message)}</li>`).join('');
  return `<div class="note ${cls} quality-box"><p><strong>${label}</strong> · ${c.error} errores · ${c.warning} avisos · ${c.info} informativos</p>${details ? `<details><summary>Ver hallazgos (${report.issues.length})</summary><ul>${details}</ul>${report.issues.length > 8 ? `<p class="hint">Se muestran los primeros 8 hallazgos.</p>` : ''}</details>` : '<p class="hint">No hay hallazgos de calidad.</p>'}</div>`;
}
function renderAlerts(r) {
  const parts = [renderQuality(r)];
  const L = lint(r.c, state.v);
  if (L.claim.length) parts.push(noteList('note--bad', 'Claims prohibidos en los datos de entrada', L.claim.map(x => `«${esc(x.term)}» en ${esc(x.field)}`), 'claim'));
  if (L.vacio.length) parts.push(noteList('note--warn', 'Lenguaje subjetivo o superlativo', L.vacio.map(x => `«${esc(x.term)}» en ${esc(x.field)}`), 'vacio'));
  if (L.amber.length) parts.push(noteList('note--warn', 'Claims que requieren validación explícita en la ficha', L.amber.map(x => `«${esc(x.term)}» en ${esc(x.field)}`), 'amber'));
  if (L.med && L.med.length) parts.push(noteList('note--warn', 'Términos de acción medicinal. La norma de cosméticos prohíbe atribuir acciones de medicamentos', L.med.map(x => `«${esc(x.term)}» en ${esc(x.field)}`), 'med'));
  if (L.check && L.check.length) parts.push(noteList('note--warn', 'Revisar datos', L.check.map(x => esc(x)), 'check'));
  if (dupBrand(r)) parts.push(noteList('note--warn', 'Información duplicada', ['La marca aparece más de una vez en el título.'], 'dup'));
  if (r.vt.changes.length) {
    parts.push(`<details class="plain" id="chg" ${state.chgOpen ? 'open' : ''}><summary>Ajustes automáticos (${r.vt.changes.length})</summary><dl class="comp">${r.vt.changes.map(x => `<dt>${esc(x.label)}</dt><dd>${esc(x.from)} → ${esc(x.to)}</dd>`).join('')}</dl></details>`);
  }
  $('#alerts').innerHTML = parts.join('');
}
function panelTitle(r) {
  const t = r.title;
  const strip = t.segs.map(s => {
    if (s.state === 'missing') return `<div class="seg seg--missing"><div class="seg-text">Falta dato</div><div class="seg-label">${esc(s.label)}</div></div>`;
    return `<div class="seg ${s.state === 'partial' ? 'seg--partial' : ''}"><div class="seg-text">${esc(s.text)}</div><div class="seg-label">${esc(s.label)}</div>${s.omitted && s.omitted.length ? `<div class="seg-label">Omitido por repetirse: ${esc(s.omitted.join(', '))}</div>` : ''}${s.missing.length ? `<div class="seg-flag">Falta: ${esc(s.missing.join(', '))}</div>` : ''}</div>`;
  }).join('');
  const comps = t.segs.flatMap(s => s.parts).map(p =>
    `<dt>${esc(p.label)}</dt><dd class="${p.value ? '' : (p.req ? 'empty' : 'opt')}">${p.value ? esc(p.value) : (p.req ? '[Vacío]' : '[Vacío] opcional')}</dd>`).join('');
  const analysis = t.missing.length
    ? `<div class="note note--warn"><p><strong>Datos que hicieron falta para que la ficha esté al 100%:</strong> ${esc(t.missing.join(', '))}. <button class="linkbtn why" data-why="faltantes">¿Por qué?</button></p></div>`
    : `<div class="note note--ok"><p><strong>No hicieron falta datos.</strong></p></div>`;
  const len = t.title.length;
  return `
    <div class="strip">${strip}</div>
    <div class="final">
      ${t.title ? `<div class="final-text">${esc(t.title)}</div>` : `<div class="empty-final">El título aparece aquí cuando captures los datos.</div>`}
      <div class="final-meta"><span>${len} caracteres${len > TITLE_MAX ? `. Supera los ${TITLE_MAX} y Merchant Center puede truncarlo.` : ''}</span>
      <button class="btn btn--primary" data-copy="title" ${t.title ? '' : 'disabled'}>Copiar título</button></div>
    </div>
    <h3>Componentes de la estructura</h3><dl class="comp">${comps}</dl>
    <h3>Análisis de datos faltantes</h3>${analysis}`;
}
function panelMC(r) {
  const m = r.mc, rg = r.c.range;
  const inRange = rg ? (m.words >= rg[0] && m.words <= rg[1]) : null;
  return `
    ${m.omitted.length ? `<div class="note note--info"><p><strong>Omitido por falta de datos:</strong> ${esc(m.omitted.join(', '))}. No se agrega relleno.</p></div>` : ''}
    <div class="desc">${esc(m.text)}</div>
    <div class="meta-row">
      <span>${m.words} palabras${rg ? ` <span class="${inRange ? 'count-ok' : 'count-off'}">(rango ${rg[0]} a ${rg[1]})</span>` : ''}</span>
      <button class="btn btn--primary" data-copy="mc">Copiar descripción</button>
    </div>`;
}
function panelMg(r) {
  const g = r.mg;
  if (g.blocked) {
    return `<div class="note note--bad"><p><strong>No se generó el HTML.</strong> Falta información obligatoria: <button class="linkbtn why" data-why="mgblocked">¿Por qué?</button></p><ul>${g.blocked.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
      <p class="hint">Completa esos datos y el HTML se genera solo.</p>`;
  }
  return `
    ${g.omitted.length ? `<div class="note note--info"><p><strong>Líneas omitidas por falta de datos:</strong> ${esc(g.omitted.join(', '))}.</p></div>` : ''}
    ${r.c.id === 'med' && r.vm.v.receta === 'no' ? `<div class="note note--info"><p>Se omitió la frase de receta médica porque declaraste que el producto no la requiere.</p></div>` : ''}
    <div class="seg-toggle" role="group" aria-label="Vista">
      <button data-mgview="preview" aria-pressed="${state.mgView === 'preview'}">Vista previa</button>
      <button data-mgview="code" aria-pressed="${state.mgView === 'code'}">Código HTML</button>
    </div>
    ${state.mgView === 'preview' ? `<div class="preview">${g.html}</div>` : `<pre class="code"><code>${esc(g.html)}</code></pre>`}
    <div class="meta-lines">
      <p>Categoría detectada: <strong>${esc(g.meta.categoria)}</strong></p>
      <p>Requiere receta médica: <strong>${esc(g.meta.receta)}</strong></p>
    </div>
    <div class="meta-row"><span>${g.html.length} caracteres</span>
      <span class="btn-group"><button class="btn" data-copy="mgfull">Copiar con metadatos</button><button class="btn btn--primary" data-copy="mg">Copiar HTML</button></span></div>`;
}
function renderOutputs() {
  const c = CATS[state.cat];
  trackChanges();
  state.gotos = [];
  const r = computeFor(state.cat, state.v, keepSet(), state.meta);
  state.out = r;
  if (!hasAny(c)) {
    state.eval = null; state.seo = null;
    $('#alerts').innerHTML = '';
    const empty = `<p class="empty-state">Captura los datos del producto para ver el resultado. Empieza por la marca.</p>`;
    $('#panel-titulo').innerHTML = empty; $('#panel-mc').innerHTML = empty; $('#panel-mg').innerHTML = empty; $('#panel-meta').innerHTML = empty;
    if ($('#panel-eval')) $('#panel-eval').innerHTML = empty;
    renderUxChrome();
    return;
  }
  renderAlerts(r);
  $('#panel-titulo').innerHTML = panelTitle(r);
  $('#panel-mc').innerHTML = panelMC(r);
  $('#panel-mg').innerHTML = panelMg(r);
  state.seo = SEO.evaluate({ cat: state.cat, v: state.v, sku: state.sku, img: state.img, ai: state.aiFlags }, { keep: keepSet(), metaCfg: state.meta, res: r });
  $('#panel-meta').innerHTML = panelSeo(state.seo) + panelMeta(r);
  renderEvalPanel(r);
  renderUxChrome();
  scheduleKnowledgeAssess();
}
/* Una sola evaluación por cambio: el memo evita recalcular si los datos, la meta, la lista de marcas y las opciones no cambiaron. */
const currentMemo = UX.makeMemo(
  (r, it) => JSON.stringify([it.cat, it.v, it.sku, it.img, it.ai, state.keepText, state.metaRev, state.exp, state.kIssSig]),
  (r, it, seo) => {
    const keep = keepSet();
    const e = evalItem(it, keep, r);
    const content = Content.evaluate(it, { keep, metaCfg: state.meta, res: r });
    const magento = MagentoReadiness.evaluate(it, { keep, metaCfg: state.meta, res: r, exp: expForReadiness() });
    return { health: e.health, quality: e.quality, seo, content, magento, s360: assessItem(it, e, r, seo, content, magento) };
  });
function renderEvalPanel(r) {
  const box = $('#panel-eval');
  if (!box) return;
  try {
    const item = { cat: state.cat, v: state.v, sku: state.sku, img: state.img, ai: state.aiFlags };
    state.eval = currentMemo.get(r, item, state.seo);
    box.innerHTML = panelEval(state.eval);
  } catch (err) {
    state.eval = null;
    box.innerHTML = '<p class="hint">No se pudo calcular la evaluación de este producto. Revisa los datos e intenta de nuevo.</p>';
    if (window.console) console.error(err);
  }
}
function setTab(t) {
  state.tab = t;
  $$('.tab').forEach(b => { const on = b.dataset.tab === t; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
  const curNav = document.querySelector('#mainnav [aria-current="true"]');
  if (curNav && (curNav.dataset.nav === 'validacion' || curNav.dataset.nav === 'contenido')) setNav(t === 'eval' ? 'validacion' : 'contenido');
  $('#panel-titulo').hidden = t !== 'titulo';
  $('#panel-mc').hidden = t !== 'mc';
  $('#panel-mg').hidden = t !== 'mg';
  $('#panel-meta').hidden = t !== 'meta';
  if ($('#panel-eval')) $('#panel-eval').hidden = t !== 'eval';
}

/* Lote */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const FILTERS = { todos: 'Todos', faltantes: 'Con datos faltantes', bloqueados: 'Descripción Magento bloqueada', lenguaje: 'Revisar lenguaje', calidad: 'Calidad por revisar', anomalías: 'Anomalías', ia: 'IA sin confirmar', seo_critico: 'SEO crítico', seo_revisar: 'SEO por revisar', seo_pendiente: 'SEO pendiente', seo_sin_evaluar: 'SEO sin evaluar', c360_critico: '360 crítico', contenido_critico: 'Contenido crítico', mag_bloqueado: 'Magento bloqueado', mag_listo: 'Magento listo', mag_advertencias: 'Magento listo con advertencias' };
function statusOf(r) {
  if (r.mg.blocked) return ['bad', 'Magento bloqueado'];
  if (r.title.missing.length) return ['warn', `Faltan ${r.title.missing.length} datos`];
  return ['ok', 'Completo'];
}
function evalItem(it, keep, resIn) {
  const res = resIn || computeFor(it.cat, it.v, keep, state.meta);
  const L = lint(res.c, it.v);
  const sourceMap = Anomalies.sourceMapFor(it);
  const quality = Quality.audit(it.cat, it.v, { sourceMap, provenanceMap: it.provenance || {}, leftover: it.note ? String(it.note).split(/\s+/) : [] });
  const canonical = Canonical.canonicalize(it, res, quality, it.provenance || {}, []);
  const health = Health.scoreReport(quality, canonical);
  return { res, tag: statusOf(res), lang: langCount(L), ia: unconfirmed(it.ai), quality, canonical, health };
}
const tagsHTML = e => `<span class="tag tag--${e.tag[0]}">${esc(e.tag[1])}</span>` + (e.quality.status !== 'listo' ? ` <span class="tag tag--${e.quality.status === 'critico' ? 'bad' : 'warn'}">Calidad: ${e.quality.counts.error} errores / ${e.quality.counts.warning} avisos</span>` : '') + (e.lang ? ` <span class="tag tag--warn">Revisar lenguaje</span>` : '') + (e.ia ? ` <span class="tag tag--ai">IA sin confirmar</span>` : '') + (e.canonical?.schema ? ` <span class="tag tag--quiet" title="Modelo canónico ${esc(e.canonical.version || '')}">Modelo canónico</span>` : '');
const passFilter = (e, f) => f === 'todos' || (UX.isUxFilter(f) && UX.passUx(e, f)) || (f === 'faltantes' && e.res.title.missing.length) || (f === 'bloqueados' && e.res.mg.blocked) || (f === 'lenguaje' && e.lang) || (f === 'calidad' && e.quality.status !== 'listo') || (f === 'anomalías' && state.anomalies.some(a => a.indexes.includes(e.__index))) || (f === 'ia' && e.ia) || (f === 'seo_critico' && e.seo && e.seo.status === 'critico') || (f === 'seo_revisar' && e.seo && e.seo.status === 'revisar') || (f === 'seo_pendiente' && e.seo && e.seo.status === 'pendiente') || (f === 'seo_sin_evaluar' && (!e.seo || e.seo.status === 'sin_evaluar')) || (f === 'c360_critico' && Score360.isCritical360(e.s360)) || (f === 'contenido_critico' && e.content && e.content.status === 'critico') || (f === 'mag_bloqueado' && e.magento && e.magento.state === 'BLOCKED') || (f === 'mag_listo' && e.magento && e.magento.state === 'READY') || (f === 'mag_advertencias' && e.magento && e.magento.state === 'READY_WITH_WARNINGS');

/* Fase 9: Content, Magento Readiness y Score 360. Solo combinan resultados; no vuelven a validar los datos. */
const expForReadiness = () => (state.exp ? expOpts() : {});
function healthWithIssues(e) { return Object.assign({}, e.health, { issues: (e.quality && e.quality.issues) || [] }); }
function assessItem(item, e, res, seo, content, magento) {
  /* Conocimiento → Quality: las advertencias aprendidas se suman a las recomendaciones de Health; el Health Score no cambia. */
  const h = healthWithIssues(e); const extra = kIssuesFor(item); if (extra.length) h.issues = h.issues.concat(extra);
  return Score360.compute({ health: h, seo, content, magento }, { F: window.Fichas, cat: item.cat });
}
const kIssuesFor = item => (typeof kIssues === 'undefined') ? [] : (kIssues.get(item.id || '__form') || []);
/* Agrega e.content, e.magento y e.s360 a cada fila de `all` ({it, e}); e.res, e.health y e.seo ya existen. */
function attachAssessment(all, keep, anomalies) {
  const items = all.map(x => x.it), resList = all.map(x => x.e.res);
  const contentBatch = Content.evaluateBatch(items, { keep, metaCfg: state.meta, resList });
  const magBatch = MagentoReadiness.evaluateBatch(items, { keep, metaCfg: state.meta, exp: expForReadiness(), resList, anomalies });
  all.forEach((x, i) => {
    x.e.content = contentBatch.items[i] || null;
    x.e.magento = magBatch.items[i] || null;
    x.e.s360 = assessItem(x.it, x.e, x.e.res, x.e.seo, x.e.content, x.e.magento);
  });
  return { contentSum: contentBatch.summary, magSum: magBatch.summary, s360Sum: Score360.summarize(all.map(x => x.e.s360)) };
}
/* Caché: si el lote, la estructura de meta, las opciones y la lista de marcas no cambiaron, se reutiliza la evaluación completa.
 * Filtrar, mostrar más o expandir una fila no recalcula nada. */
const assessStats = { hits: 0, misses: 0 };
function assessLote() {
  const key = [state.lote.length, UX.hash(JSON.stringify(state.lote)), state.metaRev, state.keepText, JSON.stringify(state.exp), state.kRev].join('|');
  if (state._lastAssess && state._assessKey === key) { assessStats.hits++; attachUx(state._lastAssess.all); return state._lastAssess; }
  assessStats.misses++;
  const out = assessLoteFresh();
  state._lastAssess = out; state._assessKey = key;
  attachUx(out.all);
  return out;
}
const humanReviewOf = it => Object.keys(it.ai || {}).filter(k => (it.ai[k] === 'sugerido' || it.ai[k] === 'imagen') && String((it.v || {})[k] || '').trim());
function attachUx(all) {
  all.forEach(x => { x.e.ux = UX.deriveStatus(x.e, { hasData: true, saved: true, approved: UX.isApproved(state.audit, x.it), humanReview: humanReviewOf(x.it) }); });
}
function assessLoteFresh() {
  const keep = keepSet();
  const all = state.lote.map((it, index) => { const e = evalItem(it, keep); e.__index = index; return { it, e }; });
  const anomalies = Anomalies.detectBatch(state.lote, all.map(x => x.e));
  all.forEach(x => { x.e.health = Health.scoreReport(x.e.quality, x.e.canonical, anomalies.filter(a => a.indexes.includes(x.e.__index))); });
  const seoBatch = SEO.evaluateBatch(state.lote, { keep, metaCfg: state.meta, resList: all.map(x => x.e.res), anomalies });
  all.forEach((x, i) => { x.e.seo = seoBatch.items[i] || null; });
  return Object.assign({ all, anomalies, seoSum: seoBatch.summary }, attachAssessment(all, keep, anomalies));
}
function saveQualitySnapshot(context) {
  const reports = state.lote.length ? assessLote().all.map(x => x.e) : [];
  const entry = Health.snapshot(reports, context);
  state.qualityHistory = Health.appendHistory(state.qualityHistory, entry, 100);
  store.set('fichas.quality.v1', state.qualityHistory);
  /* Score 360: solo snapshots (máximo 100). Los scores se recalculan siempre desde los datos actuales. */
  try {
    const a = assessLote();
    if (!state.lote.length) return;
    state.s360History = Score360.appendHistory(state.s360History, Score360.snapshot(a.all.map(x => x.e.s360), context), 100);
    store.set('fichas.score360.v1', state.s360History);
  } catch (_) { /* un fallo del snapshot no debe interrumpir el guardado del lote */ }
}

function renderPersistenceStatus(){
  const el=$('#persistence-status'); if(!el)return;
  const localOk=(()=>{try{const k='fichas.__probe';localStorage.setItem(k,'1');localStorage.removeItem(k);return true;}catch(_){return false;}})();
  const isFile = location.protocol === 'file:';
  if (state.lote.length) {
    el.innerHTML = `Guardado local: <strong>${state.lote.length} producto(s)</strong>. ${localOk ? 'Persistencia del navegador activa.' : 'El navegador restringe el almacenamiento.'}` +
      (isFile ? ' <strong>Importante:</strong> al abrir otro ZIP o mover el HTML, el navegador puede usar otro almacenamiento. Usa «Respaldar lote» para trasladarlo entre versiones.' : '');
  } else {
    el.innerHTML = 'El lote está vacío en este almacenamiento.' +
      (isFile ? ' Si tenías productos en otra versión del ZIP, debes abrir aquella versión y trasladar el respaldo, porque los archivos locales no comparten un origen de almacenamiento garantizado.' : '');
  }
}
async function exportLoteBackup(){
  const payload={schema:'fichas.lote-backup.v1',createdAt:new Date().toISOString(),lote:state.lote,audit:state.audit};
  /* Fase 11: el conocimiento aprendido viaja en el mismo respaldo (entidades, alias, relaciones, evidencia, correcciones, conflictos y versión de la base). */
  if (Knowledge) { try { const kb = await Knowledge.exportBackup(); if (kb && kb.counts && kb.counts.entities) payload.knowledge = kb; } catch (e) { if (window.console) console.error(e); } }
  return saveFile(`respaldo-lote-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(payload,null,2),'application/json;charset=utf-8');
}
function importLoteBackup(file) {
  if (!file) return;
  const rd = new FileReader();
  rd.onload = async () => {
    try {
      const p = JSON.parse(rd.result);
      if (!p || !Array.isArray(p.lote)) throw new Error('Formato de respaldo no válido.');
      const valid = p.lote.filter(it => it && CATS[it.cat] && it.v && typeof it.v === 'object').map(it => (it.id ? it : { ...it, id: uid() }));
      const dropped = p.lote.length - valid.length;
      if (state.lote.length) {
        const ok = await confirmDialog({ title: '¿Restaurar este respaldo?', message: `Reemplazará los ${state.lote.length} producto(s) actuales por ${valid.length} del respaldo. Los actuales se perderán si no tienes otro respaldo.`, confirmLabel: 'Restaurar', danger: true });
        if (!ok) { notify('Restauración cancelada.', 'warn'); return; }
      }
      state.lote = valid; state.loteOpen.clear();
      state.audit = Array.isArray(p.audit) ? p.audit : state.audit;
      if (state._editingId && !state.lote.some(x => x.id === state._editingId)) { state._editingId = null; state._editingProvenance = null; syncAddButton(); }
      persist('fichas.lote.v1', state.lote); persist('fichas.audit.v1', state.audit);
      let kMsg = '', kWarn = false;
      if (Knowledge) {
        try {
          if (p.knowledge) { const kr = await Knowledge.importBackup(p.knowledge); kMsg = kr.ok ? ` Conocimiento: ${kr.report.added} nuevos, ${kr.report.updated} actualizados.` : ` El conocimiento del respaldo no se restauró: ${kr.error}`; kWarn = !kr.ok; }
          else { await learn(state.lote, { source: 'restore' }); }
          state.kRev++; kLoteSig.clear();
        } catch (ke) { if (window.console) console.error(ke); kMsg = ' El conocimiento no se pudo restaurar.'; kWarn = true; }
      }
      renderLote(); renderOutputs(); renderPersistenceStatus();
      notify(`Respaldo restaurado: ${state.lote.length} producto(s).${dropped ? ` Se omitieron ${dropped} registro(s) no válidos.` : ''}${kMsg}`, (dropped || kWarn) ? 'warn' : 'ok');
    } catch (e) { if (window.console) console.error(e); notify(UX.friendlyError(e, 'restaurar el respaldo').message, 'error'); }
  };
  rd.onerror = () => notify('No se pudo leer el archivo. Intenta nuevamente.', 'error');
  rd.readAsText(file);
}
function renderLote() {
  $('#lote-count').textContent = state.lote.length;
  renderPersistenceStatus();
  const body = $('#lote-body');
  if (!state.lote.length) {
    renderExport();
    syncLoteButtons();
    body.innerHTML = `<div class="empty-state"><p><strong>Todavía no hay productos en el lote.</strong></p><p class="hint">Agrega productos desde el formulario o sube un CSV en la carga masiva.</p><div class="actions"><button type="button" class="btn btn--primary" data-nav-go="captura">Agregar producto</button></div></div>`;
    return;
  }
  syncLoteButtons();
  scheduleLoteKnowledge();
  let assessed;
  try { assessed = assessLote(); }
  catch (err) {
    if (window.console) console.error(err);
    body.innerHTML = `<div class="note note--warn"><p><strong>No se pudo calcular la evaluación del lote.</strong> Tus ${state.lote.length} producto(s) siguen guardados; descarga un respaldo si quieres conservarlos.</p></div><ul>${state.lote.map(it => `<li>${esc(it.sku || 'sin SKU')} · ${esc((CATS[it.cat] || {}).name || '')}</li>`).join('')}</ul>`;
    return;
  }
  const all = assessed.all;
  state.anomalies = assessed.anomalies;
  renderExport(assessed);
  const anomalySummary = Anomalies.summarize(state.anomalies);
  const healthSummary = Health.summarize(all.map(x => x.e));
  const seoSum = assessed.seoSum;
  const { contentSum, magSum, s360Sum } = assessed;
  const cnt = {}; [...Object.keys(FILTERS), ...Object.keys(UX.PRIMARY_FILTERS)].forEach(k => { cnt[k] = all.filter(x => passFilter(x.e, k)).length; });
  const rows = all.filter(x => passFilter(x.e, state.loteFilter));
  const shown = rows.slice(0, state.loteShown);
  const auditRows = state.audit.slice(-8).reverse().map(x => `<li><strong>${esc(String(x.action || '').replaceAll('_', ' '))}</strong> · ${esc(x.sku || 'sin SKU')} · ${esc(new Date(x.at).toLocaleString())}</li>`).join('');
  const filterLabel = k => (UX.PRIMARY_FILTERS[k] || FILTERS[k] || '');
  const primary = Object.entries(UX.PRIMARY_FILTERS).map(([k, l]) => {
    const n = cnt[k], off = k !== 'todos' && !n && state.loteFilter !== k;
    return `<button type="button" class="chip" data-filter="${k}" aria-pressed="${state.loteFilter === k}"${off ? ' disabled' : ''}>${esc(l)} (${n})</button>`;
  }).join('');
  const legacy = Object.entries(FILTERS).filter(([k]) => k !== 'todos').map(([k, l]) =>
    `<button type="button" class="chip" data-filter="${k}" aria-pressed="${state.loteFilter === k}">${esc(l)} (${k === 'anomalías' ? anomalySummary.total : cnt[k]})</button>`).join('');
  const legacyActive = !UX.PRIMARY_FILTERS[state.loteFilter] && state.loteFilter !== 'todos';
  const anomTags = e => state.anomalies.filter(a => a.indexes.includes(e.__index)).map(a => `<span class="tag tag--${a.severity === 'error' ? 'bad' : 'warn'}">${esc(a.type === 'duplicate-sku' ? 'SKU duplicado' : a.type === 'duplicate-title' ? 'Título duplicado' : a.type === 'near-duplicate-sku' ? 'SKU similar' : a.type === 'near-duplicate-title' ? 'Título similar' : 'Dato pendiente')}</span>`).join(' ') || '<span class="hint">—</span>';
  const num = v => (v == null ? '—' : v);
  const metrics = e => `<div class="lmetrics"><span>Health <b>${num(e.health.score)}</b></span><span>SEO <b>${num(e.seo && e.seo.score && e.seo.score.total)}</b></span><span>Contenido <b>${num(e.content && e.content.score && e.content.score.total)}</b></span><span>Magento <b>${e.magento ? esc((MAG_SHORT[e.magento.state] || [])[1] || '—') : '—'}</b></span><span>360° <b>${num(e.s360 && e.s360.global && e.s360.global.score)}</b></span></div>`;
  const detail = ({ it, e }) => {
    const recs = (e.s360 && e.s360.recommendations) || [];
    const nba = UX.nextBestAction(e, { CATS, cat: it.cat, values: it.v, humanReview: humanReviewOf(it) });
    const fixBtn = (rec, label) => { const t = UX.targetFor(rec, { CATS, cat: it.cat, values: it.v }); return t && ['field', 'sku', 'img', 'output', 'settings'].includes(t.kind) ? `<button type="button" class="btn btn--quiet" data-fix="${esc(it.id)}" data-fixrec="${recs.indexOf(rec)}">${esc(label)}</button>` : ''; };
    const topRecs = recs.slice(0, 4).map(r => `<li><span class="tag tag--${r.prioridad <= 3 ? 'bad' : r.prioridad <= 5 ? 'warn' : 'info'}">${esc(r.claseLabel)}</span> ${esc(r.texto)} ${fixBtn(r, 'Corregir')}</li>`).join('');
    return `<tr class="lrow-detail"><td colspan="7"><p class="hint"><strong>${esc(e.ux.label)}.</strong> ${esc(e.ux.why)}</p><p><strong>${esc(UX.attentionText(UX.summaryCounts(e)))}</strong></p>`
      + `<p class="hint">${esc(e.s360.global.explain)}</p>`
      + (nba.kind === 'accion' ? `<div class="nba nba--${esc(nba.clase)}"><h3>Qué hacer ahora · ${esc(nba.claseLabel)}</h3><p class="nba-main">${esc(nba.texto)}</p>${nba.impacto ? `<p class="nba-sub">${esc(nba.impacto)}</p>` : ''}</div>` : '')
      + (topRecs ? `<ul class="seo-rules">${topRecs}</ul>${recs.length > 4 ? `<p class="hint">y ${recs.length - 4} más. Edita el producto para verlas todas.</p>` : ''}` : '<p class="hint">Sin recomendaciones pendientes.</p>')
      + (e.ux.canRevoke ? `<button type="button" class="btn" data-revoke="${esc(it.id)}">Retirar aprobación</button>` : '') + `</td></tr>`;
  };
  const rowHTML = x => {
    const { it, e } = x, open = state.loteOpen.has(it.id);
    return `<tr data-id="${esc(it.id)}"><td data-label="SKU">${esc(it.sku || 'sin SKU')}</td><td data-label="Categoría">${e.res.c.emoji} ${esc(e.res.c.name)}</td><td class="t" data-label="Título">${esc(e.res.title.title)}</td>`
      + `<td data-label="Estado"><span class="status status--${e.ux.tone}" title="${esc(e.ux.why)}"><span aria-hidden="true">${e.ux.icon}</span> ${esc(e.ux.label)}</span> ${tagsHTML(e)}</td>`
      + `<td data-label="Evaluación">${metrics(e)}</td><td data-label="Avisos">${anomTags(e)}</td>`
      + `<td class="ops">${e.ia ? `<button type="button" class="btn btn--ai" data-aiok="${it.id}">Confirmar IA</button>` : ''}`
      + `<button type="button" class="btn btn--quiet" data-toggle="${esc(it.id)}" aria-expanded="${open}">${open ? 'Ocultar' : 'Ver'}</button>`
      + `<button type="button" class="btn btn--quiet" data-edit="${it.id}">Editar</button>`
      + (e.ux.canApprove ? `<button type="button" class="btn btn--quiet" data-approve="${esc(it.id)}">Aprobar</button>` : '')
      + `<button type="button" class="btn btn--quiet" data-del="${it.id}">Eliminar</button></td></tr>` + (open ? detail(x) : '');
  };
  body.innerHTML =
    `<details class="plain audit-box"><summary>Trazabilidad del lote (${state.audit.length} eventos guardados)</summary><p class="hint">La trazabilidad registra cambios relevantes sin almacenar valores sensibles adicionales.</p>${auditRows ? `<ul>${auditRows}</ul>` : '<p class="hint">Todavía no hay eventos.</p>'}</details>` +
    `<div class="quality-health" aria-label="Salud de calidad del lote"><div><strong>Health Score</strong> ${healthSummary.average == null ? '—' : healthSummary.average + '/100'}</div><div class="hint">${healthSummary.total ? `Rango ${healthSummary.min}–${healthSummary.max}. ${healthSummary.bands.critica} crítica(s), ${healthSummary.bands.revisar} para revisar, ${healthSummary.bands.buena + healthSummary.bands.excelente} en buen estado.` : 'Sin productos evaluados.'}</div></div>` +
    `<div class="quality-health seo-health" aria-label="SEO del lote"><div><strong>SEO</strong> ${seoSum.average == null ? '—' : `promedio ${seoSum.average}/100`}</div><div class="hint">${seoSum.evaluados ? `Mínimo ${seoSum.min}, máximo ${seoSum.max}. ` : 'Sin productos evaluados. '}${seoSum.byStatus.critico} crítico(s), ${seoSum.byStatus.revisar} por revisar, ${seoSum.byStatus.pendiente} pendiente(s), ${seoSum.byStatus.sin_evaluar} sin evaluar.</div></div>` +
    `<div class="quality-health seo-health" aria-label="Contenido, Magento y Score 360 del lote"><div><strong>Contenido</strong> ${contentSum.average == null ? '—' : `promedio ${contentSum.average}/100`} · <strong>Magento</strong> ${magSum.ready} listo(s), ${magSum.readyWithWarnings} con advertencias, ${magSum.blocked} bloqueado(s) · <strong>Score 360°</strong> ${s360Sum.average == null ? '—' : `promedio ${s360Sum.average}/100`}</div><div class="hint">Promedios por eje: Health ${s360Sum.health == null ? '—' : s360Sum.health}, SEO ${s360Sum.seo == null ? '—' : s360Sum.seo}, Contenido ${s360Sum.content == null ? '—' : s360Sum.content}, Magento (diagnóstico) ${s360Sum.magento == null ? '—' : s360Sum.magento}. ${contentSum.byStatus.critico} con contenido crítico, ${s360Sum.bands.critica || 0} con 360 crítico.</div></div>` +
    `<div class="filters" role="group" aria-label="Filtrar lote">${primary}</div>` +
    `<details class="filters-more"${legacyActive ? ' open' : ''}><summary>Más filtros</summary><div class="filters" role="group" aria-label="Más filtros del lote">${legacy}</div></details>` +
    `<p class="sr-only" id="lote-live" role="status" aria-live="polite">Mostrando ${rows.length} de ${all.length} producto(s)${state.loteFilter !== 'todos' ? `. Filtro: ${esc(filterLabel(state.loteFilter))}` : ''}.</p>` +
    (rows.length ? `<div class="tablewrap"><table class="lote-table">
      <thead><tr><th scope="col">SKU</th><th scope="col">Categoría</th><th scope="col">Título</th><th scope="col">Estado</th><th scope="col">Evaluación</th><th scope="col">Avisos</th><th scope="col">Acciones</th></tr></thead>
      <tbody>${shown.map(rowHTML).join('')}</tbody></table></div>`
      : `<p class="empty-state">Ningún producto coincide con este filtro. <button type="button" class="linkbtn" data-filter="todos">Ver todos</button></p>`) +
    (rows.length > shown.length ? `<div class="actions"><button type="button" class="btn" data-more="1">Mostrar ${Math.min(50, rows.length - shown.length)} más (${rows.length - shown.length} restantes)</button></div>` : '');
}
function syncLoteButtons() {
  const empty = !state.lote.length;
  ['lote-copy', 'lote-dl', 'lote-backup', 'lote-clear'].forEach(id => { const b = document.getElementById(id); if (b) { b.disabled = empty; b.title = empty ? 'Agrega productos al lote para usar esta acción.' : ''; } });
}
function exportRows() {
  const keep = keepSet();
  const head = ['SKU', 'Categoría detectada', 'Título', 'Descripción Merchant Center', 'Descripción Magento (HTML)', 'Requiere receta médica', 'Estado', 'Datos faltantes', 'Meta title', 'Meta description', 'Alt imagen principal', 'Datos con IA'];
  const rows = state.lote.map(it => {
    const e = evalItem(it, keep), r = e.res;
    const blockedShort = r.mg.blocked ? r.mg.blocked.map(x => x.split('.')[0]) : [];
    const miss = [...new Set([...r.title.missing, ...blockedShort])].join('; ');
    return [it.sku || '', r.c.name, r.title.title, r.mc.text,
      r.mg.blocked ? 'BLOQUEADO: ' + blockedShort.join('; ') : r.mg.html.replace(/\n\s*/g, ''),
      r.mg.meta.receta || 'Sin declarar', e.tag[1] + (e.lang ? '; Revisar lenguaje' : ''), miss, r.meta.mt.text, r.meta.md.text, r.meta.alt.text, Object.entries(it.ai || {}).map(([k, v]) => `${v}: ${k}`).join('; ')];
  });
  return [head, ...rows];
}

/* ================= Fase 10: UX/UI avanzada =================
 * Todo se DERIVA de los resultados que ya calculan los motores (ux.js solo interpreta). Nada de esto
 * se guarda como fuente de verdad: el estado del producto, el siguiente paso y los indicadores de campo
 * se recalculan desde los datos actuales. Lo único que se persiste son eventos en la auditoría existente. */
const uxCtx = () => ({ CATS, cat: state.cat, values: state.v });
function formItem() {
  const c = CATS[state.cat], v = {};
  c.fields.forEach(fd => { const x = state.v[fd.key]; if (x != null && String(x).trim()) v[fd.key] = x; });
  return { id: state._editingId || undefined, cat: state.cat, v, sku: String(state.sku || '').trim(), img: String(state.img || '').trim(), ai: { ...state.aiFlags } };
}
const humanReviewKeys = () => Object.keys(state.aiFlags || {}).filter(k => (state.aiFlags[k] === 'sugerido' || state.aiFlags[k] === 'imagen') && String(state.v[k] || '').trim());
const isDirty = () => UX.itemSig(formItem()) !== state._baseSig;
/* Punto de partida del seguimiento de cambios: al cargar, limpiar, agregar o editar un producto. */
function resetTracking() { state._prevV = { ...state.v }; state.changes = []; state._baseSig = UX.itemSig(formItem()); }
/* Antes/Después/Origen/Fecha de cada dato (solo de esta sesión; la auditoría guardada no almacena valores). */
function trackChanges() {
  const c = CATS[state.cat], prev = state._prevV || {};
  c.fields.forEach(fd => {
    const a = String(prev[fd.key] == null ? '' : prev[fd.key]), b = String(state.v[fd.key] == null ? '' : state.v[fd.key]);
    if (a === b) return;
    const o = UX.originOf(fd.key, { aiFlags: state.aiFlags, provenance: state._editingProvenance, changes: [], label: fd.label });
    state.changes = UX.recordChange(state.changes, { field: fd.key, label: fd.label, before: a, after: b, origin: o.text, at: new Date().toISOString() }, 50);
  });
  state._prevV = { ...state.v };
}
const regGoto = t => { state.gotos.push(t); return state.gotos.length - 1; };
const scoreTone = n => n == null ? 'info' : n >= 75 ? 'ok' : n >= 50 ? 'warn' : 'bad';
const MAG_SHORT = { READY: ['✓', 'Listo', 'ok'], READY_WITH_WARNINGS: ['⚠', 'Advertencias', 'warn'], BLOCKED: ['⛔', 'Bloqueado', 'bad'] };

function explainBlock(x) {
  return (x.que ? `<p><strong>Qué pasa:</strong> ${esc(x.que)}</p>` : '')
    + (x.porque ? `<p><strong>¿Por qué?</strong> ${esc(x.porque)}</p>` : '')
    + ((x.reglaIds && x.reglaIds.length) || x.regla ? `<p><strong>Regla:</strong> ${esc((x.reglaIds || []).join(', '))}${x.regla ? ` — ${esc(x.regla)}` : ''}</p>` : '')
    + (x.accion ? `<p><strong>Qué hacer:</strong> ${esc(x.accion)}</p>` : '');
}
const explainOfRec = r => explainBlock({ que: r.resultado, porque: r.porque, reglaIds: r.reglaIds, regla: r.regla, accion: r.texto });

/* ---- Guardado ---- */
function renderSaveState() {
  const el = $('#save-state'); if (!el) return;
  const sv = UX.effectiveSave(saveInfo.raw, isDirty());
  el.className = `save-state save-state--${sv.key}`;
  el.innerHTML = `<span aria-hidden="true">${sv.icon}</span> ${esc(sv.label)}`;
}

/* ---- Barra persistente del producto ---- */
function productName(c) {
  for (const k of ['principio', 'producto', 'modelo', 'componente', 'tipo']) if (c.fields.some(f => f.key === k) && String(state.v[k] || '').trim()) return String(state.v[k]).trim();
  return '';
}
function renderProductBar() {
  const bar = $('#prod-bar'); if (!bar) return;
  const c = CATS[state.cat], a = state.eval, has = hasAny(c), item = formItem();
  const dirty = isDirty(), saved = !!state._editingId && !dirty;
  const approved = saved && UX.isApproved(state.audit, item);
  const ctx = { hasData: has, saved, editing: !!state._editingId && dirty, approved, humanReview: humanReviewKeys() };
  const st = UX.deriveStatus(a || {}, ctx);
  state.uxStatus = st; state.uxCtx = ctx;
  if (state._lastStatusKey && state._lastStatusKey !== st.key) announce(`Estado del producto: ${st.label}`);
  state._lastStatusKey = st.key;
  const g = a && a.s360 && a.s360.global;
  const mg = a && a.magento ? MAG_SHORT[a.magento.state] : null;
  const val = x => (x == null ? '—' : String(x));
  const metric = (key, label, v, tone) => `<button type="button" class="pm pm--${tone}" data-evalgo="${key}" aria-label="${esc(label)}: ${esc(v)}. Ver por qué"><span class="pm-l">${esc(label)}</span><span class="pm-v">${esc(v)}</span></button>`;
  const metrics = [
    metric('health', 'Health', val(a && a.health && a.health.score), scoreTone(a && a.health && a.health.score)),
    metric('seo', 'SEO', val(a && a.seo && a.seo.score && a.seo.score.total), scoreTone(a && a.seo && a.seo.score && a.seo.score.total)),
    metric('content', 'Contenido', val(a && a.content && a.content.score && a.content.score.total), scoreTone(a && a.content && a.content.score && a.content.score.total)),
    metric('magento', 'Magento', mg ? `${mg[0]} ${mg[1]}` : '—', mg ? mg[2] : 'info'),
    metric('s360', 'Global 360°', val(g && g.score), g && g.band === 'bloqueado' ? 'bad' : scoreTone(g && g.score))
  ].join('');
  bar.innerHTML = `<div class="pbar-row"><div class="pbar-id"><span class="pbar-k">PRODUCTO</span>`
    + `<span class="pbar-f"><span class="lbl">SKU</span><b>${esc(item.sku || 'sin SKU')}</b></span>`
    + `<span class="pbar-f"><span class="lbl">Marca</span><b>${esc(String(state.v.marca || '').trim() || '—')}</b></span>`
    + `<span class="pbar-f pbar-opt"><span class="lbl">Producto</span><b>${esc(productName(c) || '—')}</b></span>`
    + `<span class="pbar-f pbar-opt"><span class="lbl">Categoría</span><b>${c.emoji} ${esc(c.name)}</b></span></div>`
    + `<div class="pbar-id"><span class="status status--${st.tone}" title="${esc(st.why)}"><span aria-hidden="true">${st.icon}</span> ${esc(st.label)}</span>${g && g.score != null ? `<span class="pbar-360" title="Score 360°">360° <b>${esc(g.score)}</b></span>` : ''}<span id="save-state" class="save-state" role="status"></span></div></div>`
    + `<p class="hint pbar-why">${esc(st.why)}</p>`;
  const mbox = $('#prod-metrics');
  if (mbox) mbox.innerHTML = `<div class="pbar-metrics" role="group" aria-label="Evaluación del producto">${metrics}</div>`;
  renderSaveState();
}

/* ---- «Qué hacer ahora» ---- */
function historyHTML() {
  const ch = (state.changes || []).slice().reverse();
  const evs = state.audit.filter(e => e && ((e.details && e.details.itemId && e.details.itemId === state._editingId) || (!(e.details && e.details.itemId) && state.sku && e.sku === state.sku))).slice(-6).reverse();
  if (!ch.length && !evs.length) return '';
  return `<details class="plain hist" data-histopen="1"${state.histOpen ? ' open' : ''}><summary>Ver historial</summary>`
    + (ch.length ? `<p class="hint">Cambios de esta sesión (no se guardan):</p><ul>${ch.slice(0, 12).map(x => `<li><strong>${esc(x.label)}</strong>: «${esc(x.before || 'vacío')}» → «${esc(x.after || 'vacío')}» · ${esc(x.origin)} · ${esc(new Date(x.at).toLocaleTimeString())}</li>`).join('')}</ul>` : '')
    + (evs.length ? `<p class="hint">Eventos guardados de este producto:</p><ul>${evs.map(e => `<li>${esc(String(e.action || '').replaceAll('_', ' '))} · ${esc(new Date(e.at).toLocaleString())}</li>`).join('')}</ul>` : '')
    + '</details>';
}
function renderGuide() {
  const box = $('#prod-guide'); if (!box) return;
  const a = state.eval, c = CATS[state.cat], has = hasAny(c), ctx = state.uxCtx || {};
  const steps = UX.stepOf(state.uxStatus || { key: 'BORRADOR' }, a || {}, ctx);
  const stepsHTML = `<ol class="steps" aria-label="Flujo de trabajo">${steps.map(x => `<li data-state="${x.state}"${x.state === 'current' ? ' aria-current="step"' : ''}>${esc(x.label)}</li>`).join('')}</ol>`;
  if (!has) {
    box.innerHTML = stepsHTML + `<div class="nba nba--listo"><h3>Siguiente paso</h3><p class="nba-main">Empieza por capturar la marca y los datos del producto.</p><p class="nba-sub">Mientras escribes verás aquí qué está completo, qué está mal y qué hacer.</p></div>`;
    return;
  }
  const counts = UX.summaryCounts(a || {});
  const nba = UX.nextBestAction(a || {}, { ...uxCtx(), humanReview: ctx.humanReview });
  const btn = nba.button && nba.target ? `<button type="button" class="btn btn--primary" data-goto="${regGoto(nba.target)}">${esc(nba.button)}</button>` : '';
  const nbaHTML = nba.kind === 'listo'
    ? `<div class="nba nba--listo"><h3>Siguiente paso</h3><p class="nba-main">${esc(state.uxStatus && state.uxStatus.canApprove ? 'Todo en orden. Puedes aprobar el producto.' : nba.texto)}</p></div>`
    : `<div class="nba nba--${esc(nba.clase)}"><h3>Qué hacer ahora · ${esc(nba.claseLabel)}</h3><p class="nba-main">${esc(nba.texto)}</p>${nba.resultado && nba.resultado !== nba.texto ? `<p class="nba-sub">${esc(nba.resultado)}</p>` : ''}${nba.impacto ? `<p class="nba-sub"><strong>Qué cambia:</strong> ${esc(nba.impacto)}</p>` : ''}<div class="nba-row">${btn}${nba.more > 0 ? `<span class="hint">y ${nba.more} más</span>` : ''}</div></div>`;
  const alerts = UX.contextAlerts(a || {}, uxCtx()).map(x => `<div class="ctx-item ctx-item--${x.tone}"><span>${esc(x.text)}</span><button type="button" class="btn" data-goto="${regGoto(x.action)}">${esc(x.button)}</button></div>`).join('');
  const st = state.uxStatus || {};
  const approve = st.canApprove && state._editingId ? `<button type="button" class="btn btn--primary" data-approve="${esc(state._editingId)}">Aprobar producto</button>`
    : st.canRevoke && state._editingId ? `<button type="button" class="btn" data-revoke="${esc(state._editingId)}">Retirar aprobación</button>`
    : !state._editingId ? '<span class="hint">Para aprobar, primero agrégalo al lote.</span>' : '';
  box.innerHTML = stepsHTML + `<p class="guide-counts">${esc(UX.attentionText(counts))}</p>` + nbaHTML + (alerts ? `<div class="ctx">${alerts}</div>` : '') + (approve ? `<div class="nba-row">${approve}</div>` : '') + historyHTML();
}

/* ---- Indicadores por campo ---- */
function renderFieldMeta() {
  state.ksugs = [];
  const c = CATS[state.cat], has = hasAny(c), a = state.eval, res = state.out;
  const states = has && a ? UX.fieldStates(a, uxCtx()) : {};
  const usageCtx = { CATS, cat: state.cat, titleKeys: res ? UX.titleKeysOf(res) : [], metaKeys: UX.metaKeysOf(state.meta, state.cat) };
  c.fields.filter(fd => fd.type !== 'select').forEach(fd => {
    const box = document.getElementById('fm-' + fd.key); if (!box) return;
    const st = has ? states[fd.key] : null, val = String(state.v[fd.key] || '').trim();
    let html = '', meta = '';
    if (st) {
      html += `<span class="fchip fchip--${st.key}"><span aria-hidden="true">${st.icon}</span> ${esc(st.label)}</span>`;
      if (st.issues.length) html += `<details class="fwhy" data-fopen="${fd.key}"${state.fOpen[fd.key] ? ' open' : ''}><summary>¿Por qué?</summary>${st.issues.slice(0, 3).map(explainBlock).join('')}</details>`;
    }
    if (val) {
      const u = UX.usageOf(fd.key, usageCtx);
      const o = UX.originOf(fd.key, { aiFlags: state.aiFlags, provenance: state._editingProvenance, changes: res ? res.vt.changes : [], label: fd.label });
      const lines = [];
      if (o.normalized) lines.push(`Interpretación: ${esc(o.normalized.from)} → ${esc(o.normalized.to)}`);
      lines.push((u.used.length ? `Usado en: ${u.items.filter(x => x.on).map(x => '✓ ' + esc(x.label)).join(' ')}` : 'Aún no alimenta ningún texto') + ` · Origen: ${esc(o.text)}`);
      meta += lines.map(l => `<span class="fline">${l}</span>`).join('');
    }
    if (has) { const k = knowledgeHtml(fd.key, val); meta += k.info; html += k.action; }
    if (meta) html += `<details class="fwhy fdetail" data-fopen="${fd.key}__meta"${state.fOpen[fd.key + '__meta'] ? ' open' : ''}><summary>Detalles</summary>${meta}</details>`;
    box.innerHTML = html;
    const input = document.getElementById('f-' + fd.key);
    if (input) input.setAttribute('aria-invalid', st && st.key === 'bad' ? 'true' : 'false');
  });
  /* SKU e imagen principal */
  const recs = has && a ? a.s360.recommendations : [];
  const forKind = k => recs.filter(r => { const t = UX.targetFor(r, uxCtx()); return t && t.kind === k; });
  const chip = (key, icon, label) => `<span class="fchip fchip--${key}"><span aria-hidden="true">${icon}</span> ${esc(label)}</span>`;
  const sk = $('#fm-sku'), im = $('#fm-img');
  if (sk) {
    const iss = forKind('sku');
    let html = '';
    if (has) {
      if (iss.some(r => r.severidad === 'error' || r.clase === 'bloqueo')) html = chip('bad', '❌', 'Error');
      else if (state.sku.trim()) html = chip('ok', '✓', 'Correcto');
      else html = chip('pending', '○', 'Pendiente');
      if (iss.length) html += `<details class="fwhy" data-fopen="sku"${state.fOpen.sku ? ' open' : ''}><summary>¿Por qué?</summary>${iss.slice(0, 3).map(explainOfRec).join('')}</details>`;
      if (state.sku.trim() && !iss.length) html += `<span class="fline">Usado en: ✓ Magento (columna sku)</span>`;
    }
    sk.innerHTML = html;
    const inp = $('#sku'); if (inp) inp.setAttribute('aria-invalid', iss.some(r => r.clase === 'bloqueo') && has ? 'true' : 'false');
  }
  if (im) {
    const iss = forKind('img');
    let html = '';
    if (has) {
      if (state.img.trim()) html = chip('ok', '✓', 'Correcto') + `<span class="fline">Usado en: ✓ Magento (base_image)</span>`;
      else if (iss.length) html = chip('info', 'ℹ', 'Información') + `<details class="fwhy" data-fopen="img"${state.fOpen.img ? ' open' : ''}><summary>¿Por qué?</summary>${iss.slice(0, 2).map(explainOfRec).join('')}</details>`;
    }
    im.innerHTML = html;
  }
}

/* ---- Vista previa progresiva: «Este dato alimenta estos campos» ---- */
function renderLivePreview() {
  const box = $('#live'); if (!box) return;
  const r = state.out, c = CATS[state.cat];
  if (!r || !hasAny(c)) { box.innerHTML = '<p class="hint">Aquí aparecerán el título, las metas, la descripción y el HTML de Magento a medida que captures.</p>'; return; }
  const clip = (t, n = 110) => { t = String(t || '').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
  const item = (label, ok, text, pending) => `<li><span aria-hidden="true">${ok ? '✓' : '○'}</span> <strong>${esc(label)}:</strong> ${ok ? esc(clip(text)) : `<span class="hint">${esc(pending)}</span>`}</li>`;
  const m = r.meta;
  const rows = [
    item('Título generado', !!r.title.title, r.title.title, r.title.missing.length ? `falta ${r.title.missing.join(', ')}` : 'se genera con la marca y los datos'),
    item('Meta title', !!(m.confirmed && m.mt.text), m.mt.text, m.confirmed ? 'se genera con los datos' : 'estructura sin confirmar en Ajustes'),
    item('Meta description', !!(m.confirmed && m.md.text), m.md.text, m.confirmed ? 'se genera con los datos' : 'estructura sin confirmar en Ajustes'),
    item('Descripción (Merchant Center)', !!r.mc.text, r.mc.text, 'aún sin datos'),
    item('Ficha técnica y Magento', !r.mg.blocked && !!r.mg.html, `HTML de ${r.mg.html.length} caracteres`, r.mg.blocked ? 'bloqueado: ' + r.mg.blocked.map(x => String(x).split('.')[0]).join('; ') : 'aún sin datos')
  ];
  box.innerHTML = `<details class="plain live" data-fopen="__live"${state.fOpen.__live === false ? '' : ' open'}><summary>Se genera con lo que capturas</summary><ul class="live-list">${rows.join('')}</ul></details>`;
}
function renderUxChrome() {
  [renderProductBar, renderGuide, renderFieldMeta, renderLivePreview].forEach(fn => { try { fn(); } catch (err) { if (window.console) console.error(err); } });
}

/* ---- Navegación ---- */
const reducedMotion = () => { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (_) { return false; } };
function scrollToEl(el) {
  if (!el || !el.scrollIntoView) return;
  try { el.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' }); } catch (_) { el.scrollIntoView(); }
}
function highlight(el, cls, ms) { if (!el) return; el.classList.add(cls); setTimeout(() => el.classList.remove(cls), ms || 2400); }
function setNav(name) { $$('#mainnav [data-nav]').forEach(b => b.setAttribute('aria-current', String(b.dataset.nav === name))); }
function navTo(name) {
  setNav(name);
  if (name === 'config') { openSettings(); return; }
  if (name === 'validacion') setTab('eval');
  if (name === 'contenido' && state.tab === 'eval') setTab('titulo');
  const sel = { captura: '#h-prod', validacion: '#h-out', contenido: '#h-out', lote: '#lote', exportacion: '#exportar', conocimiento: '#conocimiento' }[name];
  if (name === 'conocimiento') renderKnowledge();
  scrollToEl(document.querySelector(sel));
}
function openEvalSection(key) {
  state.evalOpen[key] = true;
  const d = document.querySelector(`#panel-eval [data-evalopen="${key}"]`);
  if (d) d.open = true;
  return d;
}
/* Lleva al usuario al campo (o al detalle) de un hallazgo: cambia de sección, enfoca, resalta y abre la explicación. */
function goTo(t) {
  if (!t) return;
  try {
    if (t.kind === 'field' || t.kind === 'sku' || t.kind === 'img') {
      setNav('captura');
      const el = document.getElementById(t.kind === 'field' ? 'f-' + t.key : t.kind);
      if (!el) { notify('No encontré ese campo en el formulario.', 'warn'); return; }
      for (let p = el.closest('details'); p; p = p.parentElement && p.parentElement.closest('details')) p.open = true;
      scrollToEl(el);
      try { el.focus({ preventScroll: true }); } catch (_) { el.focus(); }
      highlight(el.closest('.field') || el, 'field--hl');
      const key = t.kind === 'field' ? t.key : t.kind;
      state.fOpen[key] = true;
      const d = document.querySelector(`#fm-${key} details`); if (d) d.open = true;
      announce(`Campo ${t.label || ''}. Revisa la explicación debajo del campo.`);
    } else if (t.kind === 'output') {
      setNav('contenido'); setTab(t.tab);
      const el = document.querySelector(t.anchor) || document.getElementById('panel-' + t.tab);
      if (el) { if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1'); scrollToEl(el); try { el.focus({ preventScroll: true }); } catch (_) {} highlight(el, 'hl-block'); }
      announce(`Mostrando ${t.label || 'el resultado'}.`);
    } else if (t.kind === 'settings') {
      openSettings(t.settings);
    } else if (t.kind === 'axis') {
      setNav('validacion'); setTab('eval');
      const key = t.axis === 'axis' ? 's360' : t.axis;
      const d = openEvalSection(key);
      if (d) { scrollToEl(d); const sm = d.querySelector('summary'); if (sm) { try { sm.focus({ preventScroll: true }); } catch (_) {} } highlight(d, 'hl-block'); }
    }
  } catch (err) { if (window.console) console.error(err); notify('No se pudo abrir esa sección. Intenta nuevamente.', 'error'); }
}

/* ---- Aprobación derivada (se registra en la auditoría existente; si los datos cambian deja de valer) ---- */
function setApproval(id, on) {
  const it = state.lote.find(x => x.id === id);
  if (!it) { notify('No encontré ese producto en el lote.', 'warn'); return; }
  if (on) {
    const e = (state._lastAssess ? state._lastAssess.all.find(x => x.it.id === id) : null) || null;
    if (e && !e.e.ux.canApprove) { notify('Este producto todavía no está listo para aprobarse.', 'warn'); return; }
  }
  state.audit.push(Anomalies.event(on ? 'producto_aprobado' : 'aprobacion_retirada', it, { itemId: it.id, sig: UX.itemSig(it) }));
  state.audit = state.audit.slice(-500);
  persist('fichas.audit.v1', state.audit);
  renderLote(); renderOutputs();
  notify(on ? 'Producto aprobado.' : 'Aprobación retirada.', on ? 'ok' : 'warn');
}

/* ---- Eliminar con confirmación ---- */
async function confirmDelete(id) {
  const it = state.lote.find(x => x.id === id); if (!it) return;
  const ok = await confirmDialog({ title: '¿Eliminar este producto?', message: `Se quitará ${it.sku ? 'el SKU ' + it.sku : 'el producto'} del lote. Esta acción no se puede deshacer; si quieres conservar una copia, usa «Respaldar lote».`, confirmLabel: 'Eliminar', danger: true });
  if (!ok) return;
  state.lote = state.lote.filter(x => x.id !== id);
  if (state._editingId === id) { state._editingId = null; state._editingProvenance = null; syncAddButton(); resetTracking(); }
  state.loteOpen.delete(id);
  state.audit.push(Anomalies.event('producto_eliminado', it, { itemId: id })); state.audit = state.audit.slice(-500);
  persist('fichas.lote.v1', state.lote); persist('fichas.audit.v1', state.audit);
  renderLote(); renderOutputs();
  notify('Producto eliminado del lote.');
}

/* Eventos */
$('#cats').addEventListener('change', e => {
  if (e.target.name !== 'cat') return;
  state.cat = e.target.value;
  renderForm(); renderOutputs();
});
function clearAiFlag(e, k) {
  if (!state.aiFlags[k]) return;
  delete state.aiFlags[k];
  const f = e.target.closest && e.target.closest('.field'), b = f && f.querySelector('.ai-badge');
  if (b) b.remove();
}
$('#form').addEventListener('input', e => {
  const k = e.target.dataset && e.target.dataset.key;
  if (!k) return;
  state.v[k] = e.target.value;
  clearAiFlag(e, k);
  renderOutputs();
});
$('#form').addEventListener('change', e => {
  const k = e.target.dataset && e.target.dataset.key;
  if (!k) return;
  /* «change» llega al salir de un campo, justo antes del clic en un botón: si el valor ya estaba registrado por «input» no se vuelve a pintar,
   * porque reemplazar los botones entre el mousedown y el mouseup hacía que el primer clic se perdiera. */
  if (state.v[k] === e.target.value) return;
  state.v[k] = e.target.value;
  renderOutputs();
});
$('#sku').addEventListener('input', e => { state.sku = e.target.value; renderOutputs(); });
$('#img').addEventListener('input', e => { state.img = e.target.value; renderOutputs(); });
$('#keep').value = state.keepText;
$('#keep').addEventListener('input', e => { state.keepText = e.target.value; store.set('fichas.keep.v1', state.keepText); renderOutputs(); renderLote(); });

$$('.tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
document.addEventListener('toggle', e => { if (e.target.id === 'chg') state.chgOpen = e.target.open; }, true);
document.addEventListener('click', e => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.copy && state.out) {
    const r = state.out;
    if (t.dataset.copy === 'title') copyText(r.title.title, 'Título copiado');
    if (t.dataset.copy === 'mc') copyText(r.mc.text, 'Descripción copiada');
    if (t.dataset.copy === 'mg' && r.mg.html) copyText(r.mg.html, 'HTML copiado');
    if (t.dataset.copy === 'mgfull' && r.mg.html) copyText(mgFull(r.mg), 'HTML con metadatos copiado');
    if (['mt', 'md', 'alt'].includes(t.dataset.copy)) copyText(r.meta[t.dataset.copy].text, 'Copiado');
  }
  if (t.dataset.photodel !== undefined) { state.photos.splice(+t.dataset.photodel, 1); renderPhotos(); }
  if (t.dataset.imgapply) applyImgReview();
  if (t.dataset.imgcancel) { state.imgResult = null; renderImgReview(); }
  if (t.dataset.why) askWhy(t.dataset.why);
  if (t.dataset.setopen) openSettings(t.dataset.setopen);
  if (t.dataset.settab) showSettingsTab(t.dataset.settab);
  if (t.dataset.mgview) { state.mgView = t.dataset.mgview; renderOutputs(); }
  if (t.dataset.meta) {
    if (t.dataset.meta === 'all') { const src = state.meta.cats[state.metaEditCat]; Object.keys(CATS).forEach(id => { state.meta.cats[id].mt = clone(src.mt); state.meta.cats[id].md = clone(src.md); }); toast('Título y descripción meta copiados a todas las categorías'); }
    if (t.dataset.meta === 'reset') { state.meta.cats[state.metaEditCat] = defMetaCat(state.metaEditCat); toast('Categoría restablecida'); }
    saveMeta(); renderMetaCfg(); renderOutputs(); renderExport();
  }
  if (t.dataset.filter) {
    state.loteFilter = t.dataset.filter; state.loteShown = 50; renderLote();
    const chip = document.querySelector(`#lote-body [data-filter="${state.loteFilter}"]`); if (chip && !chip.disabled) chip.focus();
    const lv = $('#lote-live'); if (lv) announce(lv.textContent);
  }
  if (t.dataset.more) { state.loteShown += 50; renderLote(); }
  if (t.dataset.aiapply !== undefined) {
    const s = (state.aiSuggest || [])[+t.dataset.aiapply];
    if (!s) return;
    if ((state.v[s.campo] || '').trim()) { toast('Ese campo ya tiene un dato.'); return; }
    state.v[s.campo] = s.valor; state.aiFlags[s.campo] = 'sugerido';
    state.aiSuggest.splice(+t.dataset.aiapply, 1);
    renderForm(); renderOutputs(); renderAiSuggest();
  }
  if (t.dataset.aiok) {
    const it = state.lote.find(x => x.id === t.dataset.aiok);
    if (it) { it.ai = Object.fromEntries(Object.entries(it.ai || {}).map(([k, v]) => [k, (v === 'sugerido' || v === 'imagen') ? 'confirmado' : v])); it.provenance = Anomalies.provenanceFor(it, it.provenance); state.audit.push(Anomalies.event('ia_confirmada', it, { fields: Object.keys(it.ai || {}) })); state.audit = state.audit.slice(-500); persist('fichas.lote.v1', state.lote); persist('fichas.audit.v1', state.audit); renderLote(); toast('Datos de IA confirmados'); }
  }
  if (t.dataset.bulk === 'ai') bulkAi();
  if (t.dataset.bulk === 'cancel' && state.bulk && state.bulk.ctl) state.bulk.ctl.abort();
  if (t.dataset.bulk === 'add') bulkAdd();
  if (t.dataset.bulk === 'discard') { state.bulk = null; state.bulkText = ''; $('#bulk-status').textContent = ''; renderBulk(); }
  if (t.dataset.del) confirmDelete(t.dataset.del);
  if (t.dataset.edit) startEdit(t.dataset.edit);
});
function startEdit(id, then) {
  const it = state.lote.find(x => x.id === id);
  if (!it) { notify('No encontré ese producto en el lote.', 'warn'); return false; }
  state.cat = it.cat; state.v = { ...it.v }; state.sku = it.sku || ''; state._editingProvenance = it.provenance || {}; state._editingId = it.id; state.img = it.img || ''; state.aiFlags = { ...(it.ai || {}) }; state.aiSuggest = [];
  resetTracking();
  // El producto permanece en el lote hasta que se guarden los cambios: si se cierra la página o se limpia el formulario no se pierde.
  renderCats(); renderForm(); renderOutputs(); renderLote(); syncAddButton();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  notify('Editando producto. Pulsa «Guardar cambios» al terminar; si limpias el formulario se conserva la versión anterior.', 'info');
  if (typeof then === 'function') then();
  return true;
}

$('#add').addEventListener('click', () => {
  const c = CATS[state.cat];
  if (!hasAny(c)) { notify('Captura al menos la marca para agregar el producto.', 'warn'); const f = $('#f-marca'); if (f) f.focus(); return; }
  const v = {};
  c.fields.forEach(fd => { if (state.v[fd.key]) v[fd.key] = state.v[fd.key]; });
  const newItem = { id: state._editingId || uid(), sku: state.sku.trim(), img: state.img.trim(), cat: state.cat, v, ai: { ...state.aiFlags } };
  const prevItem = state._editingId ? state.lote.find(x => x.id === state._editingId) : null;
  /* Autocorrección segura (nivel 3): solo reglas deterministas o equivalencias confirmadas, nunca datos críticos. El original queda guardado y se puede revertir. */
  const autoFix = Knowledge && Knowledge.settings().autoCorrect ? Knowledge.safeCorrections(newItem) : [];
  if (autoFix.length) newItem.v = Knowledge.applyCorrections(newItem.v, autoFix);
  newItem.provenance = Anomalies.provenanceFor(newItem, state._editingProvenance || null);
  const editIdx = state._editingId ? state.lote.findIndex(x => x.id === state._editingId) : -1;
  const action = state._editingId ? 'producto_actualizado' : 'producto_agregado';
  if (editIdx >= 0) state.lote[editIdx] = newItem; else state.lote.push(newItem);
  state.audit.push(Anomalies.event(action, newItem, { fields: Object.keys(v), itemId: newItem.id }));
  state.audit = state.audit.slice(-500);
  const saved = persist('fichas.lote.v1', state.lote); persist('fichas.audit.v1', state.audit);
  try { saveQualitySnapshot(state._editingId ? 'producto_actualizado' : 'producto_agregado'); } catch (err) { if (window.console) console.error(err); }
  const wasEditing = !!state._editingId;
  state.v = {}; state.sku = ''; state.img = ''; state.aiFlags = {}; state.aiSuggest = []; state._editingId = null; state._editingProvenance = null;
  resetTracking();
  renderForm(); renderOutputs(); renderLote(); renderAiSuggest(); resetPhotos(); syncAddButton();
  learnFromSave(newItem, prevItem, autoFix);
  const fixMsg = autoFix.length ? ` Corrección segura: ${autoFix.map(c => `«${c.original}» → «${c.corrected}»`).join(', ')} (reversible en Conocimiento).` : '';
  if (saved) notify((wasEditing ? 'Cambios guardados en el lote.' : 'Producto guardado en el lote.') + fixMsg, 'ok');
  else notify('El producto está en el lote, pero el navegador no pudo guardarlo. Descarga un respaldo para no perderlo.', 'error');
});
function syncAddButton() { const b = $('#add'); if (b) b.textContent = state._editingId ? 'Guardar cambios' : 'Agregar al lote'; }
$('#clear').addEventListener('click', async () => {
  if (isDirty() && hasAny(CATS[state.cat])) {
    const ok = await confirmDialog({ title: '¿Limpiar el formulario?', message: state._editingId ? 'Perderás los cambios sin guardar. El producto conserva su versión anterior en el lote.' : 'Perderás lo capturado, que todavía no está en el lote.', confirmLabel: 'Limpiar', danger: true });
    if (!ok) return;
  }
  state.v = {}; state.sku = ''; state.img = ''; state.aiFlags = {}; state.aiSuggest = []; state._editingId = null; state._editingProvenance = null;
  resetTracking();
  renderForm(); renderOutputs(); renderAiSuggest(); resetPhotos(); syncAddButton();
  notify('Formulario limpio.', 'ok');
});
$('#lote-clear').addEventListener('click', async () => {
  if (!state.lote.length) { notify('El lote ya está vacío.', 'warn'); return; }
  const n = state.lote.length;
  const ok = await confirmDialog({ title: '¿Vaciar todo el lote?', message: `Se eliminarán ${n} producto(s). Esta acción no se puede deshacer. Si quieres conservarlos, descarga antes un respaldo.`, confirmLabel: 'Vaciar lote', danger: true });
  if (!ok) return;
  state.lote = []; state.loteOpen.clear();
  state.audit.push(Anomalies.event('lote_vaciado', null, { count: n })); state.audit = state.audit.slice(-500);
  persist('fichas.lote.v1', state.lote); persist('fichas.audit.v1', state.audit);
  if (state._editingId) { state._editingId = null; state._editingProvenance = null; syncAddButton(); resetTracking(); }
  renderLote(); renderOutputs();
  notify('Lote vaciado.', 'ok');
});
$('#lote-copy').addEventListener('click', e => withBusy(e.currentTarget, async () => {
  if (!state.lote.length) { notify('El lote está vacío.', 'warn'); return; }
  await copyText(toSheet(exportRows(), '\t'), 'Lote copiado. Pégalo en tu hoja de cálculo.');
}, 'copiar el lote'));

/* Descarga de archivos (sin dependencias: Blob y un enlace temporal) */
async function saveFile(filename, data, mime) {
  const type=mime || 'application/octet-stream';
  const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
  const blob = new Blob([bytes], { type });
  // Android/iOS: ofrecer compartir/guardar el archivo cuando el navegador no respeta
  // el atributo download de enlaces blob (común en navegadores embebidos).
  try {
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    if (mobile && navigator.share && typeof File === 'function') {
      const file = new File([blob], filename, { type });
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        notify(`Archivo generado: ${filename}`, 'ok'); return true;
      }
    }
  } catch (e) {
    if (e && e.name === 'AbortError') { notify('Descarga cancelada.', 'warn'); return false; }
  }
  try {
    if (window.URL && URL.createObjectURL) {
      const url = URL.createObjectURL(blob), a=document.createElement('a');
      a.href=url; a.download=filename; a.rel='noopener'; a.target='_blank'; a.style.display='none';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),10000);
      notify(`Archivo generado: ${filename}`, 'ok'); return true;
    }
  } catch(_) {}
  try {
    let binary=''; const chunk=0x8000;
    for(let i=0;i<bytes.length;i+=chunk) binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));
    const url='data:'+type+';base64,'+btoa(binary), a=document.createElement('a');
    a.href=url; a.download=filename; a.target='_blank'; a.rel='noopener'; a.style.display='none';
    document.body.appendChild(a); a.click(); a.remove(); notify(`Archivo generado: ${filename}`, 'ok'); return true;
  } catch(_) {
    notify('No se pudo descargar. Intenta nuevamente.', 'error');
    if (typeof data === 'string') manualCopyDialog(data, `No se pudo descargar ${filename}`);
    return false;
  }
}
$('#lote-dl').addEventListener('click', e => withBusy(e.currentTarget, async () => {
  if (!state.lote.length) { notify('El lote está vacío.', 'warn'); return; }
  await saveFile('fichas-catalogo.csv', '\uFEFF' + toSheet(exportRows(), ','));
}, 'descargar el CSV'));
$('#lote-backup').addEventListener('click', e => withBusy(e.currentTarget, async () => {
  if (!state.lote.length) { notify('No hay productos que respaldar.', 'warn'); return; }
  await exportLoteBackup();
}, 'generar el respaldo'));
$('#lote-restore').addEventListener('change', e => { importLoteBackup(e.target.files && e.target.files[0]); e.target.value=''; });

/* Datos crudos: extracción por reglas y diccionarios */
const catOptions = Object.entries(CATS).map(([id, c]) => `<option value="${id}">${c.emoji} ${esc(c.name)}</option>`).join('');
$('#raw-cat').innerHTML = `<option value="">Detectar automáticamente</option>` + catOptions;
const saveDic = () => store.set('fichas.dic.v1', state.dic);
function extractOpts(cat) {
  return {
    cat: cat || null, suggestBrand: !!state.dic.pos,
    dic: { marcas: parseDic(state.dic.marcas), principios: parseDic(state.dic.principios), labs: parseDic(state.dic.labs) }
  };
}
$('#extract').addEventListener('click', () => {
  const raw = $('#raw').value.trim(), st = $('#extract-status');
  if (!raw) { st.className = 'status bad'; st.textContent = 'Pega primero el SKU o las notas del producto.'; return; }
  const res = extractRaw(raw, extractOpts($('#raw-cat').value));
  if (!res.cat) { st.className = 'status bad'; st.textContent = 'No se pudo detectar la categoría. Elígela en la lista y vuelve a extraer.'; return; }
  const c = CATS[res.cat];
  state.cat = res.cat; state.v = { ...res.fields }; state.aiFlags = {}; state.aiSuggest = [];
  const dictNear = [];
  if (Normalization.dictionarySuggestions) {
    const d = extractOpts(res.cat).dic;
    [['marca',d.marcas],['principio',d.principios],['laboratorio',d.labs]].forEach(([field, entries]) => {
      const rawVal = res.fields[field];
      if (!rawVal) return;
      const suggestions = Normalization.dictionarySuggestions(rawVal, entries, { threshold: 0.88, max: 1 });
      if (suggestions[0] && !suggestions[0].exact) dictNear.push(`${field}: ¿quizá ${suggestions[0].canon}?`);
    });
  }
  renderCats(); renderForm(); renderOutputs(); renderAiSuggest();
  const found = c.fields.filter(f => res.fields[f.key]).map(f => f.label);
  st.className = 'status';
  st.textContent = `Categoría: ${c.name}${res.ambiguous ? ` (también podría ser ${CATS[res.ambiguous].name})` : ''}. Campos encontrados: ${found.join(', ') || 'ninguno'}.`
    + (res.leftover.length ? ` Sin asignar: ${res.leftover.join(' ')}.` : '') + (res.notes.length ? ' ' + res.notes.join(' ') : '') + (dictNear.length ? ' Sugerencias del diccionario: ' + dictNear.join(' · ') + ' Verifica antes de aplicar.' : '') + ' Revisa antes de usar.';
});
['marcas', 'principios', 'labs'].forEach(k => {
  $('#dic-' + k).value = state.dic[k];
  $('#dic-' + k).addEventListener('input', e => { state.dic[k] = e.target.value; saveDic(); });
});
$('#dic-pos').checked = !!state.dic.pos;
$('#dic-pos').addEventListener('change', e => { state.dic.pos = e.target.checked; saveDic(); });
$('#dic-learn').addEventListener('click', () => {
  if (!state.lote.length) { toast('El lote está vacío.'); return; }
  const keep = keepSet(), add = { marcas: new Set(), principios: new Set(), labs: new Set() };
  state.lote.forEach(it => {
    const v = computeFor(it.cat, it.v, keep).vt.v;
    if (v.marca) add.marcas.add(v.marca);
    if (v.principio) v.principio.split(/\s*,\s*/).forEach(x => { if (x) add.principios.add(x); });
    const lab = v.laboratorio || v.fabricante; if (lab) add.labs.add(lab);
  });
  let n = 0;
  Object.entries(add).forEach(([k, set]) => {
    const have = new Set(parseDic(state.dic[k]).flatMap(e => [e.alias.toLowerCase(), e.canon.toLowerCase()]));
    const lines = [...set].filter(x => !have.has(x.toLowerCase()));
    if (!lines.length) return;
    state.dic[k] = (state.dic[k].trim() ? state.dic[k].trim() + '\n' : '') + lines.join('\n');
    $('#dic-' + k).value = state.dic[k]; n += lines.length;
  });
  saveDic(); toast(n ? `${n} entradas nuevas en el diccionario` : 'No hay entradas nuevas');
});

/* Carga masiva */
const MAX_ROWS = 2000;
$('#bulk-tpl-cat').innerHTML = catOptions;
$('#bulk-def').innerHTML = `<option value="">Detectar automáticamente (solo datos crudos)</option>` + catOptions;

function applyBulkText(text, name) {
  const st = $('#bulk-status');
  const res = parseBulk(text, $('#bulk-def').value);
  if (!res.rows.length) {
    state.bulk = null; renderBulk();
    st.className = 'status bad';
    st.textContent = 'No se encontraron productos. Revisa que el archivo tenga una fila de encabezados y al menos un producto.';
    return;
  }
  let rows = res.rows, extra = '';
  if (rows.length > MAX_ROWS) { rows = rows.slice(0, MAX_ROWS); extra = ` Se leyeron solo las primeras ${MAX_ROWS} filas.`; }
  const pend = rows.filter(r => r.pending).length;
  const done = extractRows(rows, $('#bulk-def').value, extractOpts(null));
  state.bulk = { file: name, rows, ignored: res.ignored, skippedExample: res.skippedExample };
  st.className = 'status';
  st.textContent = `Archivo leído: ${name}.${extra}` + (pend ? ` De ${pend} filas con datos crudos, ${done} se procesaron con reglas. Revisa la columna "Sin asignar".` : '');
  renderBulk();
}
async function loadBulk(file) {
  const st = $('#bulk-status');
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { st.className = 'status bad'; st.textContent = 'El archivo pesa más de 5 MB. Divídelo en partes.'; return; }
  try {
    const buf = await file.arrayBuffer();
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { text = new TextDecoder('windows-1252').decode(buf); }
    state.bulkText = text; state.bulkName = file.name;
    applyBulkText(text, file.name);
  } catch (e) {
    st.className = 'status bad'; st.textContent = 'No se pudo leer el archivo.';
  }
}
function renderBulk() {
  const box = $('#bulk-preview'), b = state.bulk;
  if (!b) { box.innerHTML = ''; return; }
  const keep = keepSet();
  const ev = b.rows.map(row => row.error ? { row, kind: 'error' } : { row, kind: 'ready', ...evalItem(row, keep) });
  const ready = ev.filter(x => x.kind === 'ready'), errs = ev.filter(x => x.kind === 'error');
  const complete = ready.filter(x => x.tag[0] === 'ok').length;
  const missing = ready.filter(x => !x.res.mg.blocked && x.res.title.missing.length).length;
  const blocked = ready.filter(x => x.res.mg.blocked).length;
  const qualityReview = ready.filter(x => x.quality.status !== 'listo').length;
  const stat = (n, l) => `<span class="stat"><b>${n}</b> ${l}</span>`;
  const notes = [];
  if (b.ignored.length) notes.push(`Columnas ignoradas: ${esc(b.ignored.join(', '))}.`);
  if (b.skippedExample) notes.push('Se omitió la fila de ejemplo de la plantilla.');
  const aiCand = bulkAiCandidates();
  const shown = ev.slice(0, 100);
  const rowHTML = x => {
    const row = x.row, cat = row.cat ? CATS[row.cat] : null;
    if (x.kind === 'error') return `<tr><td>${row.n}</td><td>${esc(row.sku)}</td><td>${cat ? cat.emoji + ' ' + esc(cat.name) : ''}</td><td class="raw">${esc(row.raw)}</td><td><span class="tag tag--bad">${esc(row.error)}</span></td></tr>`;
    return `<tr><td>${row.n}</td><td>${esc(row.sku)}</td><td>${x.res.c.emoji} ${esc(x.res.c.name)}</td><td class="t">${esc(x.res.title.title)}${row.note ? `<div class="hint">Sin asignar: ${esc(row.note)}</div>` : ''}${row.sugg && row.sugg.length ? `<div class="hint">Sugerencias de IA: ${esc(row.sugg.map(s => s.campo + ': ' + s.valor).join('; '))}</div>` : ''}</td><td>${tagsHTML(x)}</td></tr>`;
  };
  box.innerHTML = `
    <div class="summary">${stat(b.rows.length, 'filas')}${stat(complete, 'completas')}${stat(missing, 'con datos faltantes')}${stat(blocked, 'con Magento bloqueado')}${stat(qualityReview, 'por revisar en calidad')}${stat(errs.length, 'con error')}</div>
    ${notes.map(n => `<div class="note note--info"><p>${n}</p></div>`).join('')}
    <div class="tablewrap"><table>
      <thead><tr><th>Fila</th><th>SKU</th><th>Categoría</th><th>Título o datos crudos</th><th>Estado</th></tr></thead>
      <tbody>${shown.map(rowHTML).join('')}</tbody></table></div>
    ${ev.length > shown.length ? `<p class="hint">Se muestran las primeras 100 filas de ${ev.length}. Todas se procesan al agregar.</p>` : ''}
    ${b.running ? `<p class="status" role="status">${esc(b.progress)}</p>` : ''}
    ${(b.rows.some(r => r.sugg && r.sugg.length)) ? `<label class="check" style="margin-top:10px"><input type="checkbox" id="bulk-apply-sugg" ${b.applySugg ? 'checked' : ''}><span>Aplicar las sugerencias de IA (marca, laboratorio y tipo) al agregar. Quedan marcadas como «IA sin confirmar».</span></label>` : ''}
    <div class="actions">
      ${aiCand.length && !b.running ? `<button class="btn btn--ai" data-bulk="ai">🤖 Completar ${aiCand.length} filas con IA (≈${Math.ceil(aiCand.length / AI.BATCH)} llamadas)</button>` : ''}
      ${b.running ? `<button class="btn" data-bulk="cancel">Detener</button>` : ''}
      <button class="btn btn--primary" data-bulk="add" ${ready.length && !b.running ? '' : 'disabled'}>Agregar ${ready.length} al lote</button>
      <button class="btn btn--quiet" data-bulk="discard" ${b.running ? 'disabled' : ''}>Descartar archivo</button>
    </div>`;
}
function bulkAdd() {
  const b = state.bulk; if (!b) return;
  const ok = b.rows.filter(r => r.cat && !r.error);
  if (!ok.length) { toast('No hay filas listas para agregar.'); return; }
  let added = 0, updated = 0; const learned = [], bulkFixes = [];
  ok.forEach(r => {
    const v = { ...r.v }, ai = { ...(r.ai || {}) };
    if (b.applySugg) (r.sugg || []).forEach(s => { if (!v[s.campo]) { v[s.campo] = s.valor; ai[s.campo] = 'sugerido'; } });
    const item = { id: uid(), sku: r.sku, img: r.img || '', cat: r.cat, v, ai };
    const fixes = Knowledge && Knowledge.settings().autoCorrect ? Knowledge.safeCorrections(item) : [];
    if (fixes.length) { item.v = Knowledge.applyCorrections(item.v, fixes); bulkFixes.push({ fixes, item }); }
    learned.push(item);
    item.provenance = Anomalies.provenanceFor(item);
    const idx = r.sku ? state.lote.findIndex(x => x.sku && x.sku.toLowerCase() === r.sku.toLowerCase()) : -1;
    if (idx >= 0) { item.id = state.lote[idx].id; state.lote[idx] = item; state.audit.push(Anomalies.event('producto_actualizado_masivo', item)); updated++; } else { state.lote.push(item); state.audit.push(Anomalies.event('producto_agregado_masivo', item)); added++; }
  });
  state.audit = state.audit.slice(-500); persist('fichas.lote.v1', state.lote); persist('fichas.audit.v1', state.audit); saveQualitySnapshot('carga_masiva');
  if (Knowledge) (async () => { for (const x of bulkFixes) await Knowledge.commitCorrections(x.fixes, x.item); await learn(learned, { source: 'csv' }); })().catch(err => { if (window.console) console.error(err); });
  b.rows = b.rows.filter(r => !(r.cat && !r.error));
  const left = b.rows.length;
  if (!left) { state.bulk = null; $('#bulk-status').textContent = ''; }
  state.loteFilter = 'todos'; state.loteShown = 50;
  renderBulk(); renderLote();
  toast(`${added} agregados${updated ? `, ${updated} actualizados por SKU` : ''}${left ? `. ${left} filas siguen pendientes de revisión.` : ''}`);
}
$('#bulk-pick').addEventListener('click', () => $('#bulk-file').click());
$('#bulk-file').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f) loadBulk(f); e.target.value = ''; });
$('#bulk-def').addEventListener('change', () => { if (state.bulkText) applyBulkText(state.bulkText, state.bulkName); });
$('#bulk-tpl').addEventListener('click', () => {
  const id = $('#bulk-tpl-cat').value;
  saveFile(`plantilla-${id}.csv`, '\uFEFF' + toSheet(templateRows(id), ','));
});
const bulkSec = $('#masiva');
['dragenter', 'dragover'].forEach(ev => bulkSec.addEventListener(ev, e => { e.preventDefault(); bulkSec.classList.add('drag'); }));
['dragleave', 'drop'].forEach(ev => bulkSec.addEventListener(ev, e => { e.preventDefault(); bulkSec.classList.remove('drag'); }));
bulkSec.addEventListener('drop', e => { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) loadBulk(f); });

/* Meta etiquetas, alt y exportación a Magento */
const SEPS = [[' | ', 'Barra vertical ( | )'], [' - ', 'Guion ( - )'], ['. ', 'Punto ( . )'], [', ', 'Coma ( , )'], [' ', 'Espacio']];
const saveExp = () => store.set('fichas.exp.v2', state.exp);
const saveMeta = () => { state.metaRev++; return store.set('fichas.meta.v2', state.meta); };
const clone = o => JSON.parse(JSON.stringify(o));

function metaBlock(label, o, key, copy, hint) {
  return `<div id="meta-${key}"><h3>${label}</h3>
    <div class="desc">${o.text ? esc(o.text) : '<span class="empty-final">Sin contenido</span>'}</div>
    ${hint ? `<p class="hint">${hint}</p>` : ''}
    <div class="meta-row"><span class="${o.max ? (o.over ? 'count-off' : 'count-ok') : ''}">${o.len} caracteres${o.max ? ` de ${o.max}` : ''}</span>
    ${copy ? `<button class="btn" data-copy="${key}" ${o.text ? '' : 'disabled'}>Copiar</button>` : ''}</div></div>`;
}
const metaWarns = m => m.warns.length ? `<div class="note note--warn"><p><strong>Revisar</strong></p><ul>${m.warns.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>` : '';
const SEV_LABEL = { error: 'Error', warning: 'Aviso', info: 'Informativo' };
const seoStatusCls = st => ({ critico: 'bad', revisar: 'warn', pendiente: 'info', listo: 'ok', sin_evaluar: 'info' }[st] || 'info');
const seoTag = ev => ev ? `<span class="tag tag--${seoStatusCls(ev.status)}" title="${esc(ev.statusLabel)}">SEO ${ev.score.total == null ? '—' : ev.score.total}</span>` : '';
const contentStatusCls = st => ({ critico: 'bad', revisar: 'warn', listo: 'ok', sin_evaluar: 'info' }[st] || 'info');
const contentTag = ev => ev ? `<span class="tag tag--${contentStatusCls(ev.status)}" title="${esc(ev.statusLabel)}">Contenido ${ev.score.total == null ? '—' : ev.score.total}</span>` : '';
const MAG_CLS = { READY: 'ok', READY_WITH_WARNINGS: 'warn', BLOCKED: 'bad' };
const magentoTag = m => m ? `<span class="tag tag--${MAG_CLS[m.state] || 'info'}" title="Score diagnóstico ${m.score}/100. El estado manda sobre el score.">Magento: ${esc(m.stateLabel)}</span>` : '';
const s360Cls = b => ({ excelente: 'ok', buena: 'ok', revisar: 'warn', critica: 'bad', bloqueado: 'bad' }[b] || 'info');
const s360Tag = r => r && r.global ? `<span class="tag tag--${s360Cls(r.global.band)}" title="${esc(r.global.explain)}">360° ${r.global.score == null ? '—' : r.global.score}</span>` : '';
const pts = n => String(Math.round(n * 10) / 10);
function seoRuleHTML(x) {
  const lines = [
    `<div><span class="seo-k">Resultado:</span> ${esc(x.resultado)}</div>`,
    `<div><span class="seo-k">Severidad:</span> ${SEV_LABEL[x.severidadEfectiva] || x.severidadEfectiva} · ${esc(x.confirmacion)}${x.bloquea ? ' · bloquea' : ''}${x.peso ? ` · ${pts(x.obtenidos)}/${pts(x.posibles)} pts` : ' · no puntúa'}</div>`,
    x.explicacion ? `<div><span class="seo-k">Explicación:</span> ${esc(x.explicacion)}</div>` : '',
    x.accion ? `<div><span class="seo-k">Acción:</span> ${esc(x.accion)}</div>` : ''
  ].join('');
  const tgt = (x.estado === 'error' || x.estado === 'pendiente') ? UX.targetFor({ reglaIds: [x.id], fuentes: ['seo'], campos: (x.datos && x.datos.faltantes) || [] }, uxCtx()) : null;
  const go = tgt && tgt.kind !== 'axis' ? ` <button type="button" class="btn btn--quiet" data-goto="${regGoto(tgt)}">${esc(tgt.button)}</button>` : '';
  return `<li class="seo-rule seo-rule--${x.estado}"><div class="seo-rule-head"><span class="seo-sym" aria-label="${esc((SEO.ESTADO_LABEL || {})[x.estado] || x.estado)}">${x.simbolo}</span> <code>${esc(x.id)}</code> ${esc(x.regla)}${go}</div>${lines}</li>`;
}
function seoSectionHTML(sec) {
  const open = state.seoOpen[sec.componente] ? ' open' : '';
  const head = sec.componente === 'magento' ? `${sec.simbolo} ${esc(sec.label)}`
    : sec.evaluable
    ? `${sec.simbolo} ${esc(sec.label)} · ${pts(sec.obtenidos)}/${pts(sec.posibles)} pts`
    : `${sec.simbolo} ${esc(sec.label)} · ${esc(sec.motivo || 'No evaluable')}`;
  return `<details class="plain seo-sec" data-seoopen="${sec.componente}"${open}><summary>${head}</summary>`
    + (sec.texto != null && sec.componente !== 'content' && sec.componente !== 'consistency' ? `<p class="hint">${sec.texto ? esc(sec.texto) : 'Sin texto'}${sec.limite ? ` (${sec.longitud} de ${sec.limite} caracteres)` : ''}</p>` : '')
    + `<ul class="seo-rules">${sec.rules.map(seoRuleHTML).join('')}</ul></details>`;
}
function panelSeo(ev) {
  if (!ev) return '';
  if (ev.score.total == null) return `<div class="seo-box"><div class="seo-head"><strong>SEO Score</strong> <span class="tag tag--info">${esc(ev.statusLabel)}</span></div><p class="hint">Captura datos del producto para evaluarlo.</p></div>`;
  const ex = SEO.explainScore(ev);
  const keys = ['title', 'metaTitle', 'metaDescription', 'alt', 'content', 'consistency'];
  const why = `<details class="plain seo-sec" data-seoopen="why"${state.seoOpen.why ? ' open' : ''}><summary>¿Por qué obtuve este score?</summary>
    <p class="hint">${esc(ex.formula)}</p>
    <p><strong>${ex.total}/100</strong> = ${pts(ex.puntos.obtenidos)} puntos obtenidos de ${pts(ex.puntos.posibles)} posibles.</p>
    <ul class="seo-rules">${ex.componentes.map(c => `<li><strong>${esc(c.label)}:</strong> ${c.evaluable ? `${pts(c.obtenidos)} de ${pts(c.posibles)} pts` : 'No evaluable'}</li>`).join('')}</ul>
    ${ex.incumplidas.length ? `<p><strong>Reglas incumplidas</strong></p><ul class="seo-rules">${ex.incumplidas.map(x => `<li><code>${esc(x.id)}</code> ${esc(x.regla)}<div><span class="seo-k">Severidad:</span> ${SEV_LABEL[x.severidad] || x.severidad} · ${esc(x.confirmacion)} · ${pts(x.obtenidos)}/${pts(x.posibles)} pts</div><div><span class="seo-k">Acción:</span> ${esc(x.accion)}</div></li>`).join('')}</ul>` : '<p class="hint">No hay reglas incumplidas.</p>'}
  </details>`;
  const mag = ev.magento && ev.magento.rules.some(x => x.estado === 'error' || x.estado === 'pendiente') ? seoSectionHTML(Object.assign({}, ev.magento, { evaluable: true, obtenidos: 0, posibles: 0, label: 'Magento (no puntúa)' })) : '';
  return `<div class="seo-box">
    <div class="seo-head"><strong>SEO Score</strong> <span class="seo-total">${ev.score.total}/100</span> <span class="tag tag--${seoStatusCls(ev.status)}">${esc(ev.statusLabel)}</span></div>
    <p class="hint">Solo con reglas existentes y verificables. No usa volumen de búsqueda, CTR, ranking ni datos de competencia.${ev.context.confirmada ? '' : ' La estructura de meta de esta categoría es provisional: sus reglas pesan la mitad.'}</p>
    ${keys.map(k => seoSectionHTML(ev[k])).join('')}${mag}${why}
  </div>`;
}
/* ---- Fase 9: EVALUACIÓN DEL PRODUCTO (Health, SEO, Contenido, Magento y Score 360°) ---- */
const AXIS_LABEL = { health: 'Health', seo: 'SEO', content: 'Contenido', magento: 'Magento' };
const evalRecs = (a, axis) => ((a.s360 && a.s360.recommendations) || []).filter(r => r.fuentes.includes(axis));
function recItemHTML(r, axis) {
  const t = UX.targetFor(r, uxCtx());
  const btn = t ? ` <button type="button" class="btn btn--quiet" data-goto="${regGoto(t)}">${esc(t.button)}</button>` : '';
  return `<li class="seo-rule seo-rule--${r.severidad === 'error' ? 'error' : 'pendiente'}"><div class="seo-rule-head"><span class="tag tag--${r.prioridad <= 3 ? 'bad' : r.prioridad <= 5 ? 'warn' : 'info'}">${esc(r.claseLabel)}</span> ${esc(r.texto)}${btn}</div>`
    + (r.detalles && r.detalles.length ? `<div><span class="seo-k">Detalle:</span> ${esc(r.detalles.join(' · '))}</div>` : '')
    + (axis && r.fuentes.length > 1 ? `<div><span class="seo-k">También lo señalan:</span> ${r.fuentes.filter(f => f !== axis).map(f => esc(AXIS_LABEL[f])).join(', ')}</div>` : '')
    + `<details class="fwhy"><summary>¿Por qué?</summary>${explainOfRec(r)}</details></li>`;
}
function evalRecsHTML(list, axis) {
  if (!list.length) return '<p class="hint">Nada que corregir en este eje.</p>';
  return `<ul class="seo-rules">${list.map(r => recItemHTML(r, axis)).join('')}</ul>`;
}
function evalSection(key, head, body) {
  return `<details class="plain seo-sec" data-evalopen="${key}"${state.evalOpen[key] ? ' open' : ''}><summary>${head}</summary>${body}</details>`;
}
const whyFix = (why, fix) => `<p><strong>¿Por qué?</strong></p>${why}<p><strong>¿Qué debo corregir?</strong></p>${fix}`;
function panelEval(a) {
  if (!a) return '';
  const h = a.health, s = a.seo, c = a.content, m = a.magento, g = a.s360;
  const dimNames = Health.DIMENSIONS || {};
  const healthBody = whyFix(
    `<p>${esc(h.explain || '')}</p><ul class="seo-rules">${Object.entries(h.dimensions || {}).map(([k, v]) => `<li><strong>${esc(dimNames[k] || k)}:</strong> ${Math.round(v)}/100</li>`).join('')}</ul><p class="hint">Health mide la calidad de los datos: errores pesan 20 puntos, avisos 6 e informativos 1.</p>`,
    evalRecsHTML(evalRecs(a, 'health'), 'health'));
  let seoBody;
  if (!s || s.score.total == null) seoBody = '<p class="hint">Captura datos del producto para evaluar el SEO.</p>';
  else {
    const ex = SEO.explainScore(s);
    seoBody = whyFix(`<p>${esc(ex.formula)}</p><ul class="seo-rules">${ex.componentes.map(x => `<li><strong>${esc(x.label)}:</strong> ${x.evaluable ? `${pts(x.obtenidos)} de ${pts(x.posibles)} pts` : 'No evaluable'}</li>`).join('')}</ul><p><button class="linkbtn" data-gotab="meta">Ver el detalle completo del SEO en «Meta y alt»</button></p>`,
      evalRecsHTML(evalRecs(a, 'seo'), 'seo'));
  }
  let contentBody;
  if (!c || c.score.total == null) contentBody = '<p class="hint">Captura datos del producto para evaluar el contenido.</p>';
  else {
    const ex = Content.explainScore(c);
    contentBody = whyFix(`<p>${esc(ex.formula)}</p><ul class="seo-rules">${ex.dimensiones.map(x => `<li><strong>${esc(x.label)}:</strong> ${x.evaluable ? `${pts(x.obtenidos)} de ${pts(x.posibles)} pts` : 'No aplica'}</li>`).join('')}</ul>`
      + (ex.incumplidas.length ? `<ul class="seo-rules">${ex.incumplidas.map(x => `<li><code>${esc(x.id)}</code> ${esc(x.regla)}<div><span class="seo-k">Resultado:</span> ${esc(x.resultado)}</div></li>`).join('')}</ul>` : '<p class="hint">Todas las reglas de contenido aplicables se cumplen.</p>'),
      evalRecsHTML(evalRecs(a, 'content'), 'content'));
  }
  const checksHTML = list => list.length ? `<ul class="seo-rules">${list.map(x => `<li class="seo-rule seo-rule--${x.estado === 'bloqueo' ? 'error' : 'pendiente'}"><div class="seo-rule-head"><code>${esc(x.id)}</code> ${esc(x.nombre)}</div><div><span class="seo-k">Resultado:</span> ${esc(x.mensaje)}</div></li>`).join('')}</ul>` : '';
  const magBody = whyFix(
    `<p>${esc(m.explain)}</p>${checksHTML(m.blockers)}${checksHTML(m.warnings)}<p class="hint">${esc(m.formula)} Contrato: ${m.contract.columnas} columnas${m.contract.ok ? ', válido' : ', con errores'}.${m.pendientes.length ? ` Columnas pendientes (vacías): ${esc(m.pendientes.join(', '))}.` : ''}</p>`,
    evalRecsHTML(evalRecs(a, 'magento'), 'magento'));
  const rows = g.global.desglose.map(x => `<tr><td>${esc(x.label)}</td><td>${x.disponible ? x.valor : '—'}</td><td>${x.peso} %${x.disponible && x.pesoAplicado !== x.peso ? ` (aplica ${x.pesoAplicado} %)` : ''}</td><td>${x.disponible ? x.aporte : '—'}</td></tr>`).join('');
  const recs = g.recommendations;
  const globalBody = whyFix(
    `<p>${esc(g.global.explain)}</p><div class="tablewrap"><table class="eval-table"><thead><tr><th>Eje</th><th>Valor</th><th>Peso</th><th>Aporte</th></tr></thead><tbody>${rows}</tbody></table></div><p class="hint">${esc(g.global.formula)}</p>`,
    recs.length ? `<ol class="seo-rules">${recs.map(r => recItemHTML(r, null)).join('')}</ol>` : '<p class="hint">Sin recomendaciones: la ficha cumple todo lo evaluado.</p>');
  const num = v => v == null ? '—' : `${v}/100`;
  return `<div class="seo-box eval-box"><div class="seo-head"><strong>EVALUACIÓN DEL PRODUCTO</strong> ${s360Tag(g)}</div>
    <p class="hint">Cada eje se calcula con reglas verificables, sin IA. Abre uno para ver por qué y qué corregir.</p>
    ${evalSection('health', `Health ${num(h.score)} · ${esc(h.band || '')}`, healthBody)}
    ${evalSection('seo', `SEO ${num(s && s.score.total)} · ${esc(s ? s.statusLabel : 'sin evaluar')}`, seoBody)}
    ${evalSection('content', `Contenido ${num(c && c.score.total)} · ${esc(c ? c.statusLabel : 'sin evaluar')}`, contentBody)}
    ${evalSection('magento', `Magento: ${esc(m.stateLabel)} · diagnóstico ${m.score}/100`, magBody)}
    ${evalSection('s360', `Score 360°: ${g.global.score == null ? '—' : g.global.score + '/100'} · ${esc(g.global.bandLabel)}`, globalBody)}
  </div>`;
}
function panelMeta(r) {
  const m = r.meta;
  return (m.confirmed ? '' : `<div class="note note--info"><p>La estructura de meta de esta categoría no está confirmada. En el CSV de Magento, meta_title, meta_description y short_description van vacías. Configúrala en <button class="linkbtn" data-setopen="magento">Ajustes, pestaña Magento</button>. <button class="linkbtn why" data-why="metaunconf">¿Por qué?</button></p></div>`)
    + metaWarns(m)
    + metaBlock('Meta title', m.mt, 'mt', true)
    + metaBlock('Meta description', m.md, 'md', true, 'En el CSV de Magento, short_description lleva este mismo texto.')
    + metaBlock('Alt de la imagen principal', m.alt, 'alt', true, 'Va en base_image_label.');
}

function expOpts() { return { attr: state.exp.attr, incFaltantes: state.exp.incF, excLenguaje: state.exp.excL, incIA: state.exp.incIA }; }
function currentBatch() { return magentoBatch(state.lote, keepSet(), state.meta, expOpts()); }
function renderExport(assessed) {
  const box = $('#exp-summary'), dl = $('#exp-dl'), cp = $('#exp-copy');
  if (!state.lote.length) { box.innerHTML = `<div class="empty-state"><p><strong>No hay productos listos para exportar.</strong></p><p class="hint">Agrega productos al lote y aquí verás cuántos están listos, con advertencias o bloqueados.</p><div class="actions"><button type="button" class="btn" data-nav-go="captura">Agregar producto</button></div></div>`; dl.disabled = true; cp.disabled = true; return; }
  const ex = currentBatch(), e = ex.excluded, reasons = [], notes = [];
  if (ex.contract && !ex.contract.ok) reasons.push(`El contrato CSV de Magento no es válido: ${ex.contract.errors.slice(0, 3).join(' | ')}`);
  else notes.push(`Contrato Magento: ${ex.header.length} columnas por fila; coma solo como separador de columnas en los campos de texto generados.`);
  if (e.sinSku) reasons.push(`${e.sinSku} sin SKU. Magento necesita el SKU para ubicar el producto.`);
  if (e.bloqueadas) reasons.push(`${e.bloqueadas} con la descripción de Magento bloqueada, por ejemplo sin declarar receta.`);
  if (e.faltantes) reasons.push(`${e.faltantes} con datos faltantes. Activa "Incluir filas con datos faltantes" si quieres exportarlas.`);
  if (e.lenguaje) reasons.push(`${e.lenguaje} con avisos de lenguaje.`);
  if (e.ia) reasons.push(`${e.ia} con datos de IA sin confirmar (sugeridos o leídos de fotos). Confírmalos en el lote o activa la opción para incluirlos.`);
  if (e.duplicadas) reasons.push(`${e.duplicadas} SKU repetidos. Se exporta el último de cada uno.`);
  if (e.sinMeta) notes.push(`${e.sinMeta} van sin meta title, meta description ni short_description porque la estructura de su categoría no está confirmada.`);
  if (e.sinImagen) notes.push(`${e.sinImagen} van con base_image vacío. El alt viaja solo en base_image_label. Si en la prueba no se aplica, agrega la ruta de la imagen.`);
  if (e.altLargos) notes.push(`${e.altLargos} alt superan el límite de caracteres.`);
  if (state.exp.enc === 'cp1252' && ex.rows.length) {
    const lost = encodeCp1252(batchCsv(ex)).lost;
    if (lost) notes.push(`${lost} caracteres no existen en Windows-1252 y saldrían como "?". Usa UTF-8 o corrige esos textos.`);
  }
  const ass = assessed || assessLote();
  /* Las métricas (Health/SEO/Contenido/Magento/Score 360°) ya se muestran completas en Lote (#h-lote),
     con los mismos números (ass.magSum / ass.s360Sum). Aquí solo se referencian, no se repiten. */
  const readiness = `<div class="exp-compact">`
    + `<p>${ass.magSum.blocked ? `<strong>${esc(ass.magSum.blocked)}</strong> bloqueado(s) para Magento. ` : ''}Mismas métricas de Health, SEO, Contenido, Magento y Score 360° que en Lote.</p>`
    + `<a href="#h-lote">Ver resumen completo en Lote ↑</a>`
    + `</div>`;
  box.innerHTML = readiness + `<p><strong>${ex.rows.length} de ${ex.total}</strong> productos se exportan.${ex.rows.length ? '' : ' No hay productos listos para exportar.'}</p>`
    + (reasons.length ? `<div class="note note--warn"><p><strong>No se exportan</strong> <button class="linkbtn why" data-why="exportreasons">¿Por qué?</button></p><ul>${reasons.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '')
    + (notes.length ? `<div class="note note--info"><p><strong>Ten en cuenta</strong></p><ul>${notes.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '');
  dl.disabled = cp.disabled = !ex.rows.length;
}

function renderMetaPreview() {
  const id = state.metaEditCat, box = $('#meta-prev');
  const smp = (state.cat === id && hasAny(CATS[id])) ? state.v : (state.lote.find(x => x.cat === id) || {}).v;
  if (!smp) { box.innerHTML = `<p class="hint">Para ver la vista previa, captura un producto de esta categoría en el formulario o agrégalo al lote.</p>`; return; }
  const r = computeFor(id, smp, keepSet(), state.meta);
  box.innerHTML = `<h3>Vista previa con un producto de ${esc(CATS[id].name)}</h3>` + metaWarns(r.meta)
    + metaBlock('Meta title', r.meta.mt, 'mt', false) + metaBlock('Meta description', r.meta.md, 'md', false) + metaBlock('Alt de la imagen principal', r.meta.alt, 'alt', false);
}
function renderMetaCfg() {
  const id = state.metaEditCat, c = CATS[id], cfg = state.meta.cats[id];
  const block = (k, label, hint) => `<div class="metablock"><h3 style="margin-top:0">${label}</h3>
    <div class="field"><label for="mtpl-${k}">Estructura, un bloque por línea</label>
      <textarea id="mtpl-${k}" data-mtpl="${k}" rows="4" spellcheck="false">${esc(cfg[k].tpl)}</textarea><p class="hint">${hint}</p></div>
    <div class="row2">
      <div class="field"><label for="msep-${k}">Separador entre bloques</label>
        <select id="msep-${k}" data-msep="${k}">${SEPS.map(([v, l]) => `<option value="${esc(v)}" ${v === cfg[k].sep ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label for="mmax-${k}">Límite de caracteres</label>
        <input type="number" min="0" id="mmax-${k}" data-mmax="${k}" value="${Number(cfg[k].max) || 0}"></div>
    </div></div>`;
  const tokens = ['{seg1}', '{seg2}', '{seg3}', '{seg4}', '{titulo}', '{categoria}', '{tienda}', '{receta_txt}', ...c.fields.map(f => `{${f.key}}`)];
  $('#meta-body').innerHTML = `
    <div class="row2">
      <div class="field"><label for="meta-tienda">Nombre de la tienda ({tienda})</label><input type="text" id="meta-tienda" value="${esc(state.meta.tienda)}" autocomplete="off"></div>
      <div class="field"><label for="meta-cat">Configurar la categoría</label><select id="meta-cat">${Object.entries(CATS).map(([k, x]) => `<option value="${k}" ${k === id ? 'selected' : ''}>${x.emoji} ${esc(x.name)}${state.meta.cats[k].confirmed ? '' : ' (sin confirmar)'}</option>`).join('')}</select></div>
    </div>
    <p class="hint meta-tokens-hint">Cada línea es un bloque. Si falta un dato, la línea se omite. {seg1} a {seg4} son los segmentos del título optimizado. Agrega <code>:lc</code> para minúscula inicial, por ejemplo <code>{contenido:lc}</code>. Agrega <code>:o</code> para que un dato opcional no elimine la línea si falta. {receta_txt} da «con receta médica» si declaraste que sí requiere receta. Tokens de esta categoría: ${tokens.map(t => `<code>${esc(t)}</code>`).join(' ')}</p>
    ${block('mt', 'Meta title', 'Sin líneas, no se genera.')}
    ${block('md', 'Meta description', 'Se copia también a short_description.')}
    ${block('alt', 'Alt de la imagen principal', 'Describe lo que se ve en la imagen con marca, producto y presentación. Sin "imagen de", sin promesas y sin repetir palabras. Máximo 125 caracteres.')}
    <div class="actions">
      <button class="btn" data-meta="all">Copiar título y descripción meta a todas las categorías</button>
      <button class="btn btn--quiet" data-meta="reset">Restablecer esta categoría</button>
    </div>
    <label class="check" style="margin-top:14px"><input type="checkbox" id="meta-ok" ${cfg.confirmed ? 'checked' : ''}><span>Confirmo que la estructura de meta de esta categoría es la que usa la agencia de SEO.</span></label>
    <div id="meta-prev"></div>`;
  renderMetaPreview();
}
function metaInput(e) {
  const t = e.target, cfg = state.meta.cats[state.metaEditCat];
  if (t.dataset.mtpl) cfg[t.dataset.mtpl].tpl = t.value;
  else if (t.dataset.msep) cfg[t.dataset.msep].sep = t.value;
  else if (t.dataset.mmax) cfg[t.dataset.mmax].max = Math.max(0, parseInt(t.value, 10) || 0);
  else if (t.id === 'meta-tienda') state.meta.tienda = t.value;
  else if (t.id === 'meta-ok') { cfg.confirmed = t.checked; }
  else if (t.id === 'meta-cat') { state.metaEditCat = t.value; renderMetaCfg(); return; }
  else return;
  saveMeta(); renderMetaPreview(); renderOutputs(); renderExport();
}
document.addEventListener('toggle', e => { const d = e.target; if (d && d.dataset && d.dataset.seoopen) state.seoOpen[d.dataset.seoopen] = d.open; if (d && d.dataset && d.dataset.evalopen) state.evalOpen[d.dataset.evalopen] = d.open; }, true);
document.addEventListener('click', e => { const t = e.target.closest && e.target.closest('[data-gotab]'); if (t) setTab(t.dataset.gotab); });
$('#meta-body').addEventListener('input', metaInput);
$('#meta-body').addEventListener('change', metaInput);
$('#exp-attr').addEventListener('input', e => { state.exp.attr = e.target.value.trim(); saveExp(); renderExport(); });
$('#exp-enc').addEventListener('change', e => { state.exp.enc = e.target.value; saveExp(); renderExport(); });
$('#exp-incf').addEventListener('change', e => { state.exp.incF = e.target.checked; saveExp(); renderExport(); });
$('#exp-excl').addEventListener('change', e => { state.exp.excL = e.target.checked; saveExp(); renderExport(); });
$('#exp-ia').addEventListener('change', e => { state.exp.incIA = e.target.checked; saveExp(); renderExport(); });
$('#exp-copy').addEventListener('click', e => withBusy(e.currentTarget, async () => {
  const ex = currentBatch();
  if (!ex.rows.length) { notify('No hay productos listos para exportar.', 'warn'); return; }
  await copyText(batchCsv(ex), 'CSV copiado. Pégalo en un archivo .csv.');
}, 'copiar el CSV'));
$('#exp-dl').addEventListener('click', e => withBusy(e.currentTarget, async () => {
  const ex = currentBatch();
  if (!ex.rows.length) { notify('No hay productos listos para exportar.', 'warn'); return; }
  const csv = batchCsv(ex);
  try { saveQualitySnapshot('exportacion_csv'); } catch (err) { if (window.console) console.error(err); }
  await saveFile('Carga_SKU_Magento.csv', state.exp.enc === 'utf8' ? csv : encodeCp1252(csv).bytes);
}, 'descargar el CSV para Magento'));

document.addEventListener('change', e => { if (e.target && e.target.id === 'bulk-apply-sugg' && state.bulk) state.bulk.applySugg = e.target.checked; });

/* ---------- Conectores externos: Google Sheets y REST ---------- */
function renderConnectorCategories() {
  const el = $('#conn-cat');
  if (!el) return;
  el.innerHTML = Object.entries(CATS).map(([id,c]) => `<option value="${esc(id)}">${esc(c.name)}</option>`).join('');
}
function renderConnectorSource() {
  const source = $('#conn-source'); if (!source) return;
  const google = source.value === 'google-sheets';
  $('#conn-google').hidden = !google;
  $('#conn-rest').hidden = google;
}
function connectorStatus(msg, cls='note--info') {
  const box=$('#conn-status'); if(!box)return;
  box.className=`note ${cls}`; box.textContent=msg; box.hidden=false;
}
function connectorMap() {
  try { const x=JSON.parse($('#conn-map').value||'{}'); if(!x||typeof x!=='object'||Array.isArray(x)) throw new Error(); return x; }
  catch(_) { throw new Error('El mapeo JSON no es válido.'); }
}
function connectorConfig() {
  const source=$('#conn-source').value;
  const fieldMap=connectorMap();
  if(source==='google-sheets') return { sourceId:source, spreadsheetId:$('#conn-sheet-id').value.trim(), range:$('#conn-range').value.trim(), token:$('#conn-google-token').value.trim(), apiKey:$('#conn-google-key').value.trim(), fieldMap };
  let body={}; try { body=JSON.parse($('#conn-rest-body').value||'{}'); } catch(_) { throw new Error('El body JSON no es válido.'); }
  return { sourceId:source, url:$('#conn-rest-url').value.trim(), method:$('#conn-rest-method').value, token:$('#conn-rest-token').value.trim(), body, fieldMap };
}
async function runConnector(importToBatch=false) {
  try {
    const cfg=connectorConfig();
    if(!cfg.fieldMap || !Object.keys(cfg.fieldMap).length) throw new Error('Define al menos un campo en el mapeo JSON.');
    const result=cfg.sourceId==='google-sheets' ? await Connector.readGoogleSheets(cfg) : await Connector.readRest(cfg);
    const records=Connector.prepareRecords(result,cfg);
    connectorStatus(`${records.length} registro(s) leídos correctamente. Fuente: ${cfg.sourceId}.`,'note--ok');
    if(!importToBatch) return records;
    const cat=$('#conn-cat').value;
    let added=0; const fromConnector=[];
    for(const rec of records){
      const d=rec.data||{}; const sku=String(d.SKU??d.sku??rec.sourceRecordId??'').trim();
      const v={}; Object.entries(d).forEach(([k,val])=>{ if(k==='SKU'||k==='sku'||k==='cat'||k==='category')return; const fd=CATS[cat]?.fields?.find(f=>f.key===k); if(fd)v[k]=String(val??''); });
      if(!sku && !Object.keys(v).length) continue;
      const ci={id:uid(),cat,sku,v,ai:{},provenance:{},external:{sourceId:rec.sourceId,sourceRecordId:rec.sourceRecordId,fetchedAt:rec.fetchedAt,checksum:rec.checksum}}; state.lote.push(ci); fromConnector.push(ci); added++;
    }
    persist('fichas.lote.v1',state.lote); state.audit.push({action:'integration_import',sku:'',at:new Date().toISOString(),meta:{source:cfg.sourceId,count:added}}); state.audit=state.audit.slice(-500); persist('fichas.audit.v1',state.audit); renderLote();
    learn(fromConnector,{source:'connector'});
    toast(`${added} registro(s) agregados al lote para revisión.`);
    return records;
  } catch(e) { connectorStatus(UX.friendlyError(e, 'conectar con la fuente').message,'note--bad'); return []; }
}
$('#conn-source')?.addEventListener('change',renderConnectorSource);
$('#conn-test')?.addEventListener('click',()=>runConnector(false));
$('#conn-import')?.addEventListener('click',()=>runConnector(true));

/* ---------- IA (Cohere): completar datos crudos y asistente de uso ---------- */
const getKey = () => { try { return localStorage.getItem(AI.KEY_STORAGE) || ''; } catch (e) { return ''; } };
const setKey = v => { try { if (v) localStorage.setItem(AI.KEY_STORAGE, v); else localStorage.removeItem(AI.KEY_STORAGE); } catch (e) { /* sin almacenamiento */ } };
const aiModel = () => (state.aiModel || '').trim() || AI.DEFAULT_MODEL;

$('#ai-key').value = getKey();
$('#ai-key').addEventListener('input', e => setKey(e.target.value.trim()));
$('#ai-model').value = state.aiModel || AI.DEFAULT_MODEL;
$('#ai-model').addEventListener('input', e => { state.aiModel = e.target.value.trim(); store.set('fichas.aimodel.v1', state.aiModel); });
$('#ai-key-clear').addEventListener('click', () => { setKey(''); $('#ai-key').value = ''; toast('Llave borrada de este navegador'); });

function renderAiSuggest() {
  const box = $('#ai-suggest'), list = state.aiSuggest || [];
  if (!list.length) { box.innerHTML = ''; return; }
  const c = CATS[state.cat];
  box.innerHTML = `<div class="note note--warn"><p><strong>Sugerencias de IA.</strong> No están en el texto. Verifícalas con el empaque antes de aplicarlas.</p></div>
    <ul>${list.map((s, i) => `<li><span><b>${esc(labelOf(c, s.campo))}:</b> ${esc(s.valor)}<span class="ai-why">${esc(s.motivo)}</span></span><button class="btn" data-aiapply="${i}">Aplicar</button></li>`).join('')}</ul>`;
}
async function aiExtractSingle() {
  const raw = $('#raw').value.trim(), st = $('#extract-status'), btn = $('#ai-extract');
  if (!raw) { st.className = 'status bad'; st.textContent = 'Pega primero el SKU o las notas del producto.'; return; }
  const key = getKey();
  if (!key) { st.className = 'status bad'; st.textContent = 'Falta la llave de Cohere. Agrégala en Ajustes (engrane), pestaña IA.'; return; }
  btn.disabled = true; st.className = 'status'; st.textContent = 'Extrayendo con reglas e IA...';
  try {
    const rules = extractRaw(raw, extractOpts($('#raw-cat').value));
    const [res] = await AI.aiExtract({ apiKey: key, model: aiModel(), onCall: () => bumpCalls('extract'), items: [{ i: 0, cat: rules.cat, raw, existing: rules.fields, leftover: rules.leftover }] });
    const catId = rules.cat || res.cat;
    if (!catId) { st.className = 'status bad'; st.textContent = 'No se pudo detectar la categoría. Elígela en la lista y vuelve a intentar.'; return; }
    const fields = { ...rules.fields }, flags = {};
    res.extraidos.forEach(x => { if (!fields[x.campo]) { fields[x.campo] = x.valor; flags[x.campo] = 'extraido'; } });
    state.cat = catId; state.v = fields; state.aiFlags = flags; state.aiSuggest = res.sugeridos;
    renderCats(); renderForm(); renderOutputs(); renderAiSuggest();
    const c = CATS[catId], names = c.fields.filter(f => fields[f.key]).map(f => f.label);
    const pendientes = rules.leftover.filter(t => !res.extraidos.some(x => x.evidencia.toLowerCase().includes(t.toLowerCase())));
    st.textContent = `Categoría: ${c.name}. Campos encontrados: ${names.join(', ') || 'ninguno'}.`
      + (res.extraidos.length ? ` La IA completó ${res.extraidos.length} y la herramienta los verificó en el texto.` : '')
      + (res.sugeridos.length ? ` Hay ${res.sugeridos.length} sugerencias por revisar.` : '')
      + (res.rechazados.length ? ` Se descartaron ${res.rechazados.length} datos que no se pudieron comprobar en el texto.` : '')
      + (pendientes.length ? ` Sin asignar: ${pendientes.join(' ')}.` : '') + ' Revisa antes de usar.';
  } catch (e) {
    st.className = 'status bad'; st.textContent = UX.friendlyError(e, 'completar con IA').message + ' Puedes usar «Extraer campos» o capturar los datos a mano.';
  } finally { btn.disabled = false; }
}
$('#ai-extract').addEventListener('click', aiExtractSingle);

/* Carga masiva: completar filas con IA en bloques */
function bulkAiCandidates() {
  const b = state.bulk;
  if (!b) return [];
  const keep = keepSet();
  return b.rows.filter(r => {
    if (!r.raw || r.aiDone) return false;
    if (r.error) return true;
    return !!r.note || evalItem(r, keep).res.title.missing.length > 0;
  });
}
async function bulkAi() {
  const b = state.bulk;
  if (!b || b.running) return;
  const key = getKey();
  if (!key) { toast('Falta la llave de Cohere. Agrégala en Ajustes (engrane), pestaña IA.'); return; }
  const cand = bulkAiCandidates();
  if (!cand.length) return;
  const ctl = new AbortController(), st = $('#bulk-status'), def = $('#bulk-def').value;
  b.ctl = ctl; b.running = true;
  let done = 0, failed = '';
  for (let i = 0; i < cand.length; i += AI.BATCH) {
    if (ctl.signal.aborted) break;
    const chunk = cand.slice(i, i + AI.BATCH);
    b.progress = `Completando filas ${i + 1} a ${i + chunk.length} de ${cand.length}...`;
    renderBulk();
    const items = chunk.map((r, k) => ({ i: k, cat: r.cat || def || null, raw: r.raw, existing: r.v || {}, leftover: r.note ? r.note.split(' ') : [] }));
    try {
      const res = await AI.aiExtract({ apiKey: key, model: aiModel(), items, signal: ctl.signal, onCall: () => bumpCalls('extract') });
      res.forEach((x, k) => {
        const r = chunk[k];
        r.aiDone = true;
        const catId = r.cat || x.cat;
        if (!catId) return;
        r.cat = catId; r.v = { ...(r.v || {}) }; r.ai = { ...(r.ai || {}) };
        x.extraidos.forEach(e => { if (!r.v[e.campo]) { r.v[e.campo] = e.valor; r.ai[e.campo] = 'extraido'; } });
        r.sugg = x.sugeridos;
        if (Object.keys(r.v).length) { r.error = ''; done++; }
      });
    } catch (e) {
      if (e.code === 'cancelled') break;
      failed = UX.friendlyError(e, 'completar con IA').message; break;
    }
  }
  b.running = false; b.ctl = null; b.progress = '';
  st.className = failed ? 'status bad' : 'status';
  st.textContent = `IA: ${done} filas completadas. Las filas que no se pudieron procesar quedan como estaban.` + (failed ? ' ' + failed : '') + ' Revisa antes de agregar.';
  renderBulk();
}


/* ---------- Fotos del empaque ---------- */
function fileToDataUrl(file, max = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const { w, h } = AI.fitSize(img.naturalWidth, img.naturalHeight, max);
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve({ name: file.name, dataUrl: cv.toDataURL('image/jpeg', quality), w, h });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`No se pudo leer la imagen «${file.name}». Usa JPG, PNG o WebP.`)); };
    img.src = url;
  });
}
function renderPhotos() {
  $('#photo-thumbs').innerHTML = state.photos.map((p, i) => `<div class="thumb"><img src="${p.dataUrl}" alt="Foto ${i + 1} del empaque"><button class="btn btn--quiet" data-photodel="${i}" aria-label="Quitar la foto ${i + 1}">✕</button></div>`).join('');
  $('#ai-photo').disabled = !state.photos.length;
}
function resetPhotos() { state.photos = []; state.imgResult = null; renderPhotos(); renderImgReview(); }
async function addPhotos(files) {
  const room = AI.MAX_IMAGES - state.photos.length;
  if (room <= 0) { toast(`Máximo ${AI.MAX_IMAGES} fotos por producto.`); return; }
  for (const f of [...files].slice(0, room)) {
    try { state.photos.push(await fileToDataUrl(f)); } catch (e) { notify(UX.friendlyError(e, 'cargar la foto').message, 'error'); }
  }
  renderPhotos();
}
$('#photo-in').addEventListener('change', async e => { await addPhotos(e.target.files || []); e.target.value = ''; });

const VERBATIM_KEYS = ['inci', 'modo', 'precauciones'];
function renderImgReview() {
  const box = $('#img-review'), r = state.imgResult;
  if (!r) { box.innerHTML = ''; return; }
  if (!r.campos.length) { box.innerHTML = '<div class="note note--info"><p>La IA no encontró datos legibles en las fotos. Prueba con una foto más nítida y de frente.</p></div>'; return; }
  const c = CATS[r.cat];
  box.innerHTML = `<div class="note note--warn"><p><strong>Datos leídos de la foto.</strong> Compáralos con la imagen y corrige lo necesario. Al aplicarlos quedan como «IA sin confirmar» y no se exportan a Magento hasta confirmarlos en el lote.</p></div>
    <div class="review">${r.campos.map((x, i) => `<div class="review-row">
      <label class="check"><input type="checkbox" data-imgon="${i}" ${x.existente ? '' : 'checked'}><span><b>${esc(labelOf(c, x.campo))}</b>${x.numeros ? ' <span class="ai-badge ai-badge--sug">Revisa los números</span>' : ''}${x.existente ? `<span class="ai-why">Ya tiene un dato: ${esc(x.existente)}</span>` : ''}</span></label>
      ${VERBATIM_KEYS.includes(x.campo) ? `<textarea data-imgval="${i}" rows="3">${esc(x.valor)}</textarea>` : `<input type="text" data-imgval="${i}" value="${esc(x.valor)}" autocomplete="off">`}
      <span class="ai-why">Leído en la foto: ${esc(x.leido)}</span></div>`).join('')}</div>
    <div class="actions"><button class="btn btn--primary" data-imgapply="1">Aplicar los seleccionados</button><button class="btn btn--quiet" data-imgcancel="1">Descartar</button></div>`;
}
function applyImgReview() {
  const r = state.imgResult;
  if (!r) return;
  const on = [...document.querySelectorAll('#img-review [data-imgon]')], vals = [...document.querySelectorAll('#img-review [data-imgval]')];
  let n = 0;
  state.cat = r.cat;
  on.forEach((el, i) => {
    const x = r.campos[i], v = String((vals[i] && vals[i].value) || '').trim();
    if (!el.checked || !x || !v) return;
    state.v[x.campo] = v; state.aiFlags[x.campo] = 'imagen'; n++;
  });
  state.imgResult = null;
  renderCats(); renderForm(); renderOutputs(); renderImgReview();
  toast(n ? `${n} datos aplicados. Quedan marcados como IA sin confirmar.` : 'No se aplicó ningún dato.');
}
async function aiPhoto() {
  const st = $('#extract-status'), btn = $('#ai-photo'), key = getKey();
  if (!state.photos.length) { st.className = 'status bad'; st.textContent = 'Agrega primero una foto del empaque.'; return; }
  if (!key) { st.className = 'status bad'; st.textContent = 'Falta la llave de Cohere. Agrégala en Ajustes (engrane), pestaña IA.'; return; }
  btn.disabled = true; st.className = 'status'; st.textContent = 'Leyendo las fotos...';
  try {
    const forced = $('#raw-cat').value, cat = forced || (hasAny(CATS[state.cat]) ? state.cat : null);
    const res = await AI.visionExtract({
      apiKey: key, model: (state.aiVisionModel || '').trim() || AI.DEFAULT_VISION_MODEL, cat, text: $('#raw').value,
      images: state.photos.map(p => p.dataUrl), existing: cat === state.cat ? state.v : {}, onCall: () => bumpCalls('vision')
    });
    if (!res.cat) { st.className = 'status bad'; st.textContent = 'No se pudo detectar la categoría. Elígela en la lista y vuelve a intentar.'; return; }
    state.imgResult = res; renderImgReview();
    st.textContent = `Categoría: ${CATS[res.cat].name}. La IA leyó ${res.campos.length} datos${res.rechazados.length ? ` y se descartaron ${res.rechazados.length} que no coincidían con lo leído` : ''}. Revísalos con la foto antes de aplicarlos.`;
  } catch (e) {
    st.className = 'status bad'; st.textContent = UX.friendlyError(e, 'leer las fotos').message;
  } finally { btn.disabled = !state.photos.length; }
}
$('#ai-photo').addEventListener('click', aiPhoto);
$('#ai-model-vision').value = state.aiVisionModel || AI.DEFAULT_VISION_MODEL;
$('#ai-model-vision').addEventListener('input', e => { state.aiVisionModel = e.target.value.trim(); store.set('fichas.aivisionmodel.v1', state.aiVisionModel); });

/* Contador de llamadas a Cohere (solo de este navegador) */
const CALLS_KEY = 'fichas.aicalls.v1';
function callsState() {
  const month = new Date().toISOString().slice(0, 7), c = store.get(CALLS_KEY, null);
  return (c && c.month === month) ? c : { month, extract: 0, vision: 0, asst: 0, local: 0 };
}
function renderCalls() {
  const c = callsState(), used = (c.extract || 0) + (c.vision || 0) + (c.asst || 0), lim = Number(state.aiLimit) || 0, pct = lim ? Math.round(used * 100 / lim) : 0;
  const el = $('#ai-calls');
  el.className = 'note ' + (lim && pct >= 80 ? 'note--warn' : 'note--info');
  el.innerHTML = `<p><strong>${used}</strong> llamadas a Cohere este mes desde este navegador (extracción ${c.extract || 0}, fotos ${c.vision || 0}, asistente ${c.asst || 0}).${lim ? ` Llevas <strong>${pct}%</strong> de tu límite de ${lim}.` : ''}</p><p>${c.local || 0} respuestas se resolvieron sin IA.</p>`;
  $('#asst-count').textContent = `IA este mes: ${used}${lim ? ' de ' + lim : ''}`;
}
function bumpCalls(kind) {
  const c = callsState(), before = (c.extract || 0) + (c.vision || 0) + (c.asst || 0), lim = Number(state.aiLimit) || 0;
  c[kind] = (c[kind] || 0) + 1;
  store.set(CALLS_KEY, c);
  const after = (c.extract || 0) + (c.vision || 0) + (c.asst || 0);
  if (lim && before < lim * 0.8 && after >= lim * 0.8) toast('Llevas más del 80% de tu límite mensual de llamadas a Cohere.');
  renderCalls();
}
$('#ai-model-asst').value = state.aiAsstModel || AI.DEFAULT_ASSISTANT_MODEL;
$('#ai-model-asst').addEventListener('input', e => { state.aiAsstModel = e.target.value.trim(); store.set('fichas.aiasstmodel.v1', state.aiAsstModel); });
$('#ai-limit').value = state.aiLimit;
$('#ai-limit').addEventListener('input', e => { state.aiLimit = Math.max(0, parseInt(e.target.value, 10) || 0); store.set('fichas.ailimit.v1', state.aiLimit); renderCalls(); });
$('#ai-calls-reset').addEventListener('click', () => { store.set(CALLS_KEY, { month: new Date().toISOString().slice(0, 7), extract: 0, vision: 0, asst: 0, local: 0 }); renderCalls(); toast('Conteo reiniciado'); });

/* Asistente de uso */
const ASST_CHIPS = ['¿Por qué se bloquea Magento?', '¿Qué falta para exportar?', 'Explícame los avisos', '¿Cómo cargo muchos productos?'];
const asst = { pending: false };
function renderAsst() {
  const box = $('#asst-msgs');
  box.innerHTML = state.asst.length
    ? state.asst.map((m, mi) => {
      const cls = m.role === 'user' ? 'user' : m.role === 'error' ? 'err' : 'bot';
      const acts = (m.actions && m.actions.length) ? `<div class="msg-actions">${m.actions.map((a, ai) => `<button class="btn" data-asstact="${mi}:${ai}">${esc(a.label)}</button>`).join('')}</div>` : '';
      return `<div class="msg msg--${cls}">${m.via === 'local' ? '<span class="msg-via">Respuesta de la herramienta, sin IA</span>' : ''}${esc(m.content)}${acts}</div>`;
    }).join('')
    : `<div class="msg msg--bot">Hola. Puedo explicarte cómo usar la herramienta y qué significa cada aviso. Lo que depende de tu pantalla lo respondo directo, sin usar la IA. ¿Qué necesitas?</div>`;
  box.scrollTop = box.scrollHeight;
  $('#asst-chips').innerHTML = state.asst.length ? '' : ASST_CHIPS.map(q => `<button class="btn" data-asstq="${esc(q)}">${esc(q)}</button>`).join('');
}
function assistSnapshot() {
  const c = CATS[state.cat], r = state.out, has = hasAny(c) && !!r;
  const lt = has ? lint(c, state.v) : { claim: [], vacio: [], amber: [], med: [], check: [] };
  const v = r ? r.vm.v : {}, mgKeys = [], tmk = [];
  if (has && r.mg.blocked) { if (c.id === 'med' && !v.receta) mgKeys.push('receta'); (c.vital || []).forEach(k => { if (!v[k]) mgKeys.push(k); }); }
  if (has) {
    r.title.segs.forEach(s => s.parts.forEach(p => { if (p.req && !p.value) tmk.push(p.key); }));
    c.title.forEach(s => { if (s.anyOf && !s.anyOf.some(k => state.v[k])) tmk.push(s.anyOf[0]); });
  }
  let exp = null;
  if (state.lote.length) { const ex = currentBatch(); exp = { rows: ex.rows.length, total: ex.total, excluded: ex.excluded }; }
  return {
    cat: { id: c.id, name: c.name }, hasData: has, fields: c.fields.map(f => ({ key: f.key, label: f.label })),
    titleMissing: has ? r.title.missing : [], titleMissingKeys: tmk, mgBlocked: has ? r.mg.blocked : null, mgBlockedKeys: mgKeys,
    lint: lt, dup: has ? dupBrand(r) : false, metaConfirmed: r ? r.meta.confirmed : false, keyPresent: !!getKey(),
    calls: callsState(), limit: Number(state.aiLimit) || 0,
    lote: { n: state.lote.length, exp, aiUnconfirmed: state.lote.filter(it => unconfirmed(it.ai)).length }
  };
}
function assistantContext() {
  const s = assistSnapshot(), L = [];
  L.push(`Categoría actual: ${s.cat.name}`);
  L.push(`Campos de la categoría (clave = etiqueta): ${s.fields.map(f => `${f.key} = ${f.label}`).join('; ')}`);
  if (s.hasData) {
    if (s.titleMissing.length) L.push(`Datos que faltan para el título: ${s.titleMissing.join(', ')}`);
    L.push(s.mgBlocked ? `Magento bloqueado: ${s.mgBlocked.join(' ')}` : 'Magento: descripción lista');
    const n = langCount(s.lint);
    if (n) L.push(`Avisos de lenguaje: ${n}`);
    if (s.lint.check.length) L.push(`Avisos de datos: ${s.lint.check.join(' ')}`);
    L.push(`Estructura de meta de esta categoría confirmada: ${s.metaConfirmed ? 'sí' : 'no'}`);
  }
  L.push(`Productos en el lote: ${s.lote.n}`);
  if (s.lote.exp) { const e = s.lote.exp.excluded; L.push(`Exportables ahora: ${s.lote.exp.rows} de ${s.lote.exp.total}. Excluidos: sin SKU ${e.sinSku}, descripción bloqueada ${e.bloqueadas}, datos faltantes ${e.faltantes}, avisos de lenguaje ${e.lenguaje}, IA sin confirmar ${e.ia}`); }
  if (state.bulk) L.push(`Carga masiva abierta con ${state.bulk.rows.length} filas`);
  return L.join('\n');
}
function openAsst() { $('#asst').hidden = false; $('#asst-open').hidden = true; renderAsst(); }
function closeAsst() { $('#asst').hidden = true; $('#asst-open').hidden = false; }
function runAction(id) {
  const [kind, arg] = String(id).split(':');
  const scrollTo = elId => { const el = document.getElementById(elId); if (el) el.scrollIntoView({ behavior: 'smooth' }); };
  if (kind === 'ajustes') { openSettings(arg); return; }
  if (kind === 'abrir' && arg === 'reglas') { closeAsst(); openRules(); return; }
  closeAsst();
  if (kind === 'ir') scrollTo(arg);
  else if (kind === 'filtro') { state.loteFilter = arg; state.loteShown = 50; renderLote(); scrollTo('lote'); }
  else if (kind === 'pestana') { setTab(arg); scrollTo('h-out'); }
  else if (kind === 'campo') { const el = document.getElementById('f-' + arg); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); } }
}
function askWhy(kind) {
  const snap = assistSnapshot(), w = Assist.why(kind, snap);
  if (!w) return;
  state.asst.push({ role: 'user', content: w.question });
  state.asst.push({ role: 'assistant', content: w.text, actions: Assist.parseActions(w.actions, snap.cat.id), via: 'local' });
  bumpCalls('local');
  openAsst();
}
async function callAssistant(args) {
  const model = (state.aiAsstModel || '').trim() || AI.DEFAULT_ASSISTANT_MODEL;
  try {
    return await AI.assistantAnswer({ ...args, model, onCall: () => bumpCalls('asst') });
  } catch (e) {
    const noModel = e.status === 404 || (e.status === 400 && /model/i.test(e.message));
    if (noModel && model !== aiModel()) {
      toast('El modelo del asistente no está disponible. Se usó el modelo principal.');
      return AI.assistantAnswer({ ...args, model: aiModel(), onCall: () => bumpCalls('asst') });
    }
    throw e;
  }
}
async function asstSend(question) {
  const q = String(question || '').trim();
  if (!q || asst.pending) return;
  const snap = assistSnapshot();
  const history = state.asst.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({ role: m.role, content: m.content }));
  state.asst.push({ role: 'user', content: q });
  $('#asst-in').value = '';
  const local = Assist.localAnswer(q, snap);
  if (local) {
    state.asst.push({ role: 'assistant', content: local.text, actions: Assist.parseActions(local.actions, snap.cat.id), via: 'local' });
    bumpCalls('local'); renderAsst(); return;
  }
  if (!getKey()) {
    state.asst.push({ role: 'error', content: 'Esta pregunta necesita la IA y falta la llave de Cohere. Agrégala en Ajustes (engrane), pestaña IA.', actions: Assist.parseActions(['ajustes:ia'], snap.cat.id) });
    renderAsst(); return;
  }
  asst.pending = true; $('#asst-send').disabled = true;
  state.asst.push({ role: 'assistant', content: 'Pensando...' }); renderAsst();
  try {
    const out = await callAssistant({ apiKey: getKey(), history, question: q, context: assistantContext() });
    state.asst[state.asst.length - 1] = { role: 'assistant', content: out.respuesta, actions: Assist.parseActions(out.acciones, snap.cat.id, 3), via: 'ia' };
  } catch (e) {
    state.asst[state.asst.length - 1] = { role: 'error', content: UX.friendlyError(e, 'obtener la respuesta').message };
  } finally { asst.pending = false; $('#asst-send').disabled = false; renderAsst(); }
}
$('#asst-open').addEventListener('click', openAsst);
$('#asst-close').addEventListener('click', closeAsst);
$('#asst-send').addEventListener('click', () => asstSend($('#asst-in').value));
$('#asst-in').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); asstSend($('#asst-in').value); } });
$('#asst-chips').addEventListener('click', e => { const b = e.target.closest('button'); if (b && b.dataset.asstq) asstSend(b.dataset.asstq); });
$('#asst-msgs').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || !b.dataset.asstact) return;
  const [mi, ai] = b.dataset.asstact.split(':').map(Number), a = state.asst[mi] && state.asst[mi].actions && state.asst[mi].actions[ai];
  if (a) runAction(a.id);
});

/* Documento de reglas */
let lastDoc = null, docReturn = null;
function openRules() {
  docReturn = document.activeElement;
  lastDoc = Rules.buildRulesDoc({ now: new Date(), metaCfg: state.meta, keep: keepSet() });
  $('#doc-frame').srcdoc = lastDoc.html;
  $('#doc-meta').textContent = `Versión ${lastDoc.version} · Huella ${lastDoc.hash} · ${lastDoc.generated}`;
  $('#doc-scrim').hidden = false; $('#doc').hidden = false;
  $('#doc-close').focus();
}
function closeRules() {
  $('#doc-scrim').hidden = true; $('#doc').hidden = true;
  if (docReturn && docReturn.focus) docReturn.focus();
}
$('#rules-open').addEventListener('click', openRules);
$('#doc-close').addEventListener('click', closeRules);
$('#doc-scrim').addEventListener('click', closeRules);
$('#doc-dl').addEventListener('click', () => {
  if (!lastDoc) return;
  saveFile(`Reglas-fichas-catalogo-${new Date().toISOString().slice(0, 10)}.html`, lastDoc.html, 'text/html;charset=utf-8');
});
$('#doc-print').addEventListener('click', () => { const w = $('#doc-frame').contentWindow; if (w) { w.focus(); w.print(); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#doc').hidden) closeRules(); });

/* Ajustes (engrane) */
let settingsReturn = null;
function showSettingsTab(name) {
  $$('#settings [data-settab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.settab === name)));
  $$('#settings [data-setpanel]').forEach(p => { p.hidden = p.dataset.setpanel !== name; });
}
function openSettings(tab) {
  settingsReturn = document.activeElement;
  $('#set-scrim').hidden = false; $('#settings').hidden = false;
  showSettingsTab(tab || 'formato');
  $('#set-close').focus();
}
function closeSettings() {
  $('#set-scrim').hidden = true; $('#settings').hidden = true;
  if (settingsReturn && settingsReturn.focus) settingsReturn.focus();
}
$('#set-open').addEventListener('click', () => openSettings());
$('#set-close').addEventListener('click', closeSettings);
$('#set-scrim').addEventListener('click', closeSettings);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#settings').hidden) closeSettings(); });


/* ---------- Fase 10: eventos de navegación, aprobación y accesibilidad ---------- */
function fixFromLote(id, idx) {
  const x = state._lastAssess && state._lastAssess.all.find(y => y.it.id === id);
  const rec = x && x.e.s360 && x.e.s360.recommendations[idx];
  startEdit(id, () => { const t = rec ? UX.targetFor(rec, uxCtx()) : null; if (t) goTo(t); });
}
document.addEventListener('click', e => {
  const t = e.target.closest && e.target.closest('button');
  if (!t) return;
  if (t.dataset.goto !== undefined) goTo(state.gotos[+t.dataset.goto]);
  if (t.dataset.evalgo) goTo({ kind: 'axis', axis: t.dataset.evalgo });
  if (t.dataset.approve) setApproval(t.dataset.approve, true);
  if (t.dataset.revoke) setApproval(t.dataset.revoke, false);
  if (t.dataset.toggle) {
    const id = t.dataset.toggle;
    if (state.loteOpen.has(id)) state.loteOpen.delete(id); else state.loteOpen.add(id);
    renderLote();
    const b = document.querySelector(`#lote-body [data-toggle="${id}"]`); if (b) b.focus();
  }
  if (t.dataset.fix !== undefined) fixFromLote(t.dataset.fix, +t.dataset.fixrec);
  if (t.dataset.navGo) { navTo(t.dataset.navGo); const f = $('#f-marca'); if (f) f.focus(); }
});
document.addEventListener('toggle', e => {
  const d = e.target; if (!d || !d.dataset) return;
  if (d.dataset.fopen) state.fOpen[d.dataset.fopen] = d.open;
  if (d.dataset.histopen) state.histOpen = d.open;
}, true);
$('#mainnav').addEventListener('click', e => { const b = e.target.closest('[data-nav]'); if (b) navTo(b.dataset.nav); });
/* Teclado en las pestañas del resultado: flechas, Inicio y Fin. */
$('.output .tabs').addEventListener('keydown', e => {
  if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
  const tabs = $$('.output .tab'); let i = tabs.findIndex(b => b.getAttribute('aria-selected') === 'true'); if (i < 0) i = 0;
  if (e.key === 'ArrowRight') i = (i + 1) % tabs.length; else if (e.key === 'ArrowLeft') i = (i - 1 + tabs.length) % tabs.length; else if (e.key === 'Home') i = 0; else i = tabs.length - 1;
  e.preventDefault(); setTab(tabs[i].dataset.tab); tabs[i].focus();
});
/* La sección actual se marca en la navegación al desplazarse (solo si el navegador lo soporta). */
if (typeof IntersectionObserver !== 'undefined') {
  try {
    const ratios = {};   // visibilidad acumulada de cada sección: gana la más visible, no la última que cambió
    const spy = new IntersectionObserver(entries => {
      entries.forEach(x => { ratios[x.target.dataset.spy] = x.isIntersecting ? x.intersectionRatio : 0; });
      const top = Object.entries(ratios).sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] > 0) setNav(top[0] === 'contenido' && state.tab === 'eval' ? 'validacion' : top[0]);
    }, { threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] });
    [['#h-prod', 'captura'], ['#h-out', 'contenido'], ['#lote', 'lote'], ['#exportar', 'exportacion'], ['#conocimiento', 'conocimiento']].forEach(([sel, name]) => { const el = document.querySelector(sel); const host = el && (el.closest('section') || el); if (host) { host.dataset.spy = name; spy.observe(host); } });
  } catch (_) { /* sin scroll-spy */ }
}
/* Ningún error se queda en silencio: se registra en consola y el usuario recibe un mensaje comprensible. */
window.addEventListener('error', e => { if (window.console) console.error(e.error || e.message); notify('Algo salió mal. Intenta nuevamente; lo que ya guardaste no se perdió.', 'error'); });
window.addEventListener('unhandledrejection', e => { if (window.console) console.error(e.reason); notify(UX.friendlyError(e.reason).message, 'error'); });

/* ================= Fase 11: conocimiento y aprendizaje del catálogo =================
 * Flujo único: módulo → Knowledge (knowledge.js) → KnowledgeDB (knowledge-db.js) → IndexedDB `fichasProductoKnowledge`.
 * Convive con la persistencia existente (localStorage y el espejo `fichas-state`); no la reemplaza. La auditoría es la misma (state.audit). */
const Knowledge = (window.FichasKnowledge && window.FichasKnowledgeDB) ? window.FichasKnowledge.create({ onAudit: knowledgeAudit }) : null;
const kIssues = new Map();            // id (o '__form') → advertencias de conocimiento que alimentan a Quality/Health (no cambian su score)
const kLoteSig = new Map();
const kWhyCache = new Map();
Object.assign(state, { kRev: 0, kA: null, kASig: '', kIssSig: '', kOpen: new Set(), ksugs: [], kDismissed: new Set(), kReady: false, kFilter: { text: '', type: '', status: '' } });
let kTimer = null, kLoteTimer = null, kRenderSeq = 0;
const fieldLabel = key => { const f = CATS[state.cat].fields.find(x => x.key === key); return f ? f.label : key; };

/* La auditoría guarda siempre los eventos de aprobación (si no, tantos eventos de conocimiento podrían desplazarlos). */
function trimAudit(list) {
  const keep = [], lastApproval = new Map();
  list.forEach((e, i) => { if (e && (e.action === 'producto_aprobado' || e.action === 'aprobacion_retirada') && e.details && e.details.itemId) lastApproval.set(e.details.itemId, i); });
  const idx = new Set(lastApproval.values());
  list.forEach((e, i) => { if (idx.has(i)) keep.push(i); });
  const rest = list.map((e, i) => i).filter(i => !idx.has(i)).slice(-500);
  return [...new Set([...keep, ...rest])].sort((a, b) => a - b).map(i => list[i]);
}
function knowledgeAudit(action, details) {
  state.audit.push(Anomalies.event(action, null, details || {}));
  state.audit = trimAudit(state.audit);
  persist('fichas.audit.v1', state.audit);
}

/* ---- Estado de la base ---- */
function renderKnowledgeStatus(st) {
  const box = $('#k-status'); if (!box) return;
  const d = st && st.db;
  if (!d) { box.className = 'note note--info'; box.textContent = 'Iniciando el conocimiento…'; return; }
  if (d.degraded) { box.className = 'note note--warn'; box.textContent = `No se pudo abrir IndexedDB (${UX.safeText(d.error, 'motivo desconocido')}). El conocimiento solo vivirá en esta sesión; descarga un respaldo para no perderlo.`; }
  else if (d.persistent) { box.className = 'note note--ok'; box.textContent = `Conocimiento guardado en este navegador (IndexedDB, versión ${d.version}).`; }
  else { box.className = 'note note--warn'; box.textContent = 'Este navegador no ofrece IndexedDB: el conocimiento solo vivirá en esta sesión.'; }
}

/* ---- Cuadro de texto accesible (reemplaza prompt()) ---- */
function promptDialog(o) {
  return new Promise(resolve => {
    const prev = document.activeElement; const id = 'pdlg-' + Math.random().toString(36).slice(2, 7);
    const scrim = document.createElement('div'); scrim.className = 'cdlg-scrim'; scrim.id = 'prompt-dlg';
    scrim.innerHTML = `<div class="cdlg" role="dialog" aria-modal="true" aria-labelledby="${id}-t"><h3 id="${id}-t">${esc(o.title)}</h3><p>${esc(o.message || '')}</p><label class="sr-only" for="${id}-i">${esc(o.title)}</label><input type="text" id="${id}-i" value="${esc(o.value || '')}" autocomplete="off"><div class="actions"><button type="button" class="btn" data-pd="no">Cancelar</button><button type="button" class="btn btn--primary" data-pd="yes">${esc(o.confirmLabel || 'Guardar')}</button></div></div>`;
    document.body.appendChild(scrim);
    const input = scrim.querySelector('input');
    const done = v => { document.removeEventListener('keydown', onKey, true); scrim.remove(); if (prev && prev.focus) { try { prev.focus(); } catch (_) {} } resolve(v); };
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); done(null); } else if (e.key === 'Enter' && document.activeElement === input) { e.preventDefault(); done(input.value); } }
    document.addEventListener('keydown', onKey, true);
    scrim.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-pd]'); if (b) done(b.dataset.pd === 'yes' ? input.value : null); else if (e.target === scrim) done(null); });
    input.focus(); input.select();
  });
}

/* ---- Aprender ---- */
async function learn(items, o) {
  if (!Knowledge) return { ok: false, error: 'El motor de conocimiento no está disponible.' };
  try {
    await Knowledge.init();
    const r = await Knowledge.observeMany(items, o);
    state.kRev++;
    afterLearning();
    return r;
  } catch (e) { if (window.console) console.error(e); return { ok: false, error: UX.friendlyError(e, 'aprender del producto').message }; }
}
function afterLearning() {
  if (!$('#conocimiento').hidden && state.kPanelOpen) renderKnowledge();
  scheduleKnowledgeAssess(); scheduleLoteKnowledge();
}
/* Guardar un producto: correcciones seguras → evidencia → correcciones manuales (con pregunta si procede). */
async function learnFromSave(item, prev, fixes) {
  if (!Knowledge) return;
  try {
    await Knowledge.init();
    if (fixes.length) await Knowledge.commitCorrections(fixes, item);
    await Knowledge.observe(item, { replace: !!prev, source: 'manual' });
    if (prev) await manualCorrectionsFrom(prev, item, fixes);
    state.kRev++; afterLearning();
  } catch (e) { if (window.console) console.error(e); }
}
async function manualCorrectionsFrom(prev, item, fixes) {
  const asks = [];
  for (const field of Object.keys(window.FichasKnowledge.FIELD_TYPE)) {
    const a = String((prev.v || {})[field] || '').trim(), b = String((item.v || {})[field] || '').trim();
    if (!a || !b || a === b || fixes.some(f => f.field === field)) continue;
    const r = await Knowledge.recordManualCorrection({ field, original: a, corrected: b, item });
    if (r.ok && r.askSimilar) asks.push({ ruleId: r.ruleId, a, b, field });
  }
  for (const ask of asks.slice(0, 3)) {
    const yes = await confirmDialog({ title: '¿Usar esta corrección en productos similares?', message: `Cambiaste «${ask.a}» por «${ask.b}» en «${fieldLabel(ask.field)}». Si aceptas, la aplicación lo recordará y lo sugerirá la próxima vez. Tú decides: no se corrige nada sola.`, confirmLabel: 'Sí, recordarlo', cancelLabel: 'No' });
    await Knowledge.resolveRule(ask.ruleId, yes);
  }
}
async function bootstrapKnowledge() {
  const done = await Knowledge.db.meta.get('bootstrapped');
  if (!done && state.lote.length) { await Knowledge.observeMany(state.lote, { source: 'lote' }); state.kRev++; }
  if (!done) await Knowledge.db.meta.set('bootstrapped', new Date().toISOString());
}

/* ---- Consultar antes de normalizar: evaluación asíncrona del producto en edición ---- */
function scheduleKnowledgeAssess() { if (!Knowledge || !state.kReady) return; clearTimeout(kTimer); kTimer = setTimeout(runKnowledgeAssess, 300); }
async function runKnowledgeAssess() {
  try {
    if (!hasAny(CATS[state.cat])) { state.kA = null; state.kASig = ''; if (kIssues.delete('__form')) { state.kIssSig = ''; state.kRev++; renderOutputs(); } else renderFieldMeta(); return; }
    const item = formItem(), sig = UX.itemSig(item);
    const a = await Knowledge.assess(item);
    if (sig !== UX.itemSig(formItem())) return;                  // el usuario siguió escribiendo
    state.kA = a; state.kASig = sig;
    const issues = Knowledge.qualityIssues(a, fieldLabel), isg = JSON.stringify(issues);
    if (isg !== state.kIssSig) { state.kIssSig = isg; kIssues.set('__form', issues); state.kRev++; renderOutputs(); } else renderFieldMeta();
    Knowledge.logSuggestions(item, a.suggestions.filter(s => s.level >= 2));
  } catch (e) { if (window.console) console.error(e); }
}
/* Lote: se evalúa en segundo plano y por tandas; solo se repinta si cambió algo. */
function scheduleLoteKnowledge() { if (!Knowledge || !state.kReady) return; clearTimeout(kLoteTimer); kLoteTimer = setTimeout(runLoteKnowledge, 500); }
async function runLoteKnowledge() {
  try {
    const snapshot = state.lote.slice(0, 300); let changed = false, n = 0;
    for (const it of snapshot) {
      if (!it.id) continue;
      const sig = UX.itemSig(it) + '|' + state.kRev;
      if (kLoteSig.get(it.id) === sig) continue;
      const a = await Knowledge.assess(it);
      const issues = Knowledge.qualityIssues(a, f => ((CATS[it.cat].fields.find(x => x.key === f)) || { label: f }).label);
      if (JSON.stringify(kIssues.get(it.id) || []) !== JSON.stringify(issues)) { kIssues.set(it.id, issues); changed = true; }
      kLoteSig.set(it.id, sig);
      if (++n % 20 === 0) await new Promise(r => setTimeout(r, 0));
    }
    if (changed) { state.kRev++; kLoteSig.clear(); renderLote(); }
  } catch (e) { if (window.console) console.error(e); }
}

/* ---- Sugerencias en el formulario ---- */
function knowledgeHtml(key, val) {
  const a = state.kA; if (!a || state.kASig !== UX.itemSig(formItem()) && !(a.fields[key] && a.fields[key].typed === val)) return { info: '', action: '' };
  let info = '', action = '';
  const f = a.fields[key];
  if (f && f.typed === val) {
    if (f.state === 'trusted' || f.state === 'confirmed') info += `<span class="fknow"><b>Conocido:</b> ${esc(f.entity.canonicalValue)} · ${esc(window.FichasKnowledge.STATUS_LABEL[f.entity.status])} ${Math.round(f.entity.confidence * 100)} %</span>`;
    else if (f.state === 'known') info += `<span class="fknow"><b>Visto antes:</b> ${esc(f.entity.canonicalValue)} · observado ${Math.round(f.entity.confidence * 100)} % (aún sin confirmar)</span>`;
    else if (f.state === 'new') info += `<span class="fknow">Nuevo para la aplicación: lo aprenderá al guardar.</span>`;
    else if (f.state === 'unknown') action += `<span class="fknow fknow--warn">No aparece en lo aprendido. ${esc(f.note || 'Verifica el dato.')}</span>`;
    else if (f.state === 'conflict') action += `<span class="fknow fknow--warn">Hay conocimiento en conflicto para este dato.</span>`;
    else if (f.state === 'rejected') action += `<span class="fknow fknow--bad">Una persona rechazó este valor antes.</span>`;
  }
  a.suggestions.filter(s => s.field === key && (s.from || '') === (val || '') && !state.kDismissed.has(`${s.field}|${s.from}|${s.to}`)).forEach(s => {
    const idx = state.ksugs.push(s) - 1;
    action += `<span class="fknow fknow--${s.level >= 4 ? 'bad' : 'warn'}"><b>${esc(s.levelName)}:</b> «${esc(s.to)}». ${esc(s.why)} <button type="button" class="btn btn--quiet" data-ksug="${idx}">${s.level >= 4 ? 'Revisar y usar' : 'Usar'}</button><button type="button" class="btn btn--quiet" data-kno="${idx}">No</button></span>`;
  });
  return { info, action };
}
async function applySuggestion(s) {
  try {
    const before = state.v[s.field] || '';
    state.v[s.field] = s.to; const el = document.getElementById('f-' + s.field); if (el) el.value = s.to;
    if (state.aiFlags[s.field]) delete state.aiFlags[s.field];
    if (s.relationId) await Knowledge.confirm(s.relationId, { productRef: state.sku });
    else if (s.entityId) await Knowledge.confirm(s.entityId, { productRef: state.sku });
    if (before.trim() && s.kind !== 'fill') await Knowledge.recordManualCorrection({ field: s.field, original: before, corrected: s.to, item: formItem() });
    state.kRev++; renderOutputs();
    notify(`Se usó «${s.to}». Quedó registrado como confirmación tuya.`, 'ok');
  } catch (e) { if (window.console) console.error(e); notify(UX.friendlyError(e, 'aplicar la sugerencia').message, 'error'); }
}
async function dismissSuggestion(s) {
  try {
    state.kDismissed.add(`${s.field}|${s.from}|${s.to}`);
    if (s.relationId) await Knowledge.reject(s.relationId, { productRef: state.sku, note: 'sugerencia rechazada' });
    state.kRev++; renderFieldMeta();
    notify(s.relationId ? 'Entendido: no volveré a sugerir esa relación con tanta confianza.' : 'Sugerencia descartada.', 'ok');
  } catch (e) { if (window.console) console.error(e); notify(UX.friendlyError(e, 'registrar tu respuesta').message, 'error'); }
}

/* ---- Interfaz de conocimiento ---- */
const KSTAT_ICON = { trusted: '★', confirmed: '✓', observed: '○', normalized: '≈', suggested: '?', inferred: '~', rejected: '✕', conflicted: '⚠' };
const pct = n => Math.round((n || 0) * 100);
function kCard(r, why) {
  const K = window.FichasKnowledge, open = state.kOpen.has(r.id), ev = r.evidenceBy || {};
  const label = r.type && K.TYPE_LABEL[r.type] ? K.TYPE_LABEL[r.type] : (r.predicate ? 'Relación' : 'Alias');
  const title = r.canonicalValue || (r.alias ? `«${r.alias}» → ${r.canonicalValue}` : r.id);
  return `<article class="kcard${r.status === 'conflicted' ? ' kcard--conflict' : ''}" data-kid="${esc(r.id)}"><h3>${esc(label)}: ${esc(title)}</h3>`
    + `<div class="kmeta"><span class="kchip kchip--${esc(r.status)}"><span aria-hidden="true">${KSTAT_ICON[r.status] || ''}</span> ${esc(K.STATUS_LABEL[r.status] || r.status)}</span> · Confianza ${pct(r.confidence)} % · ${ev.confirmed || 0} confirmación(es), ${ev.rejected || 0} rechazo(s), ${ev.observed || 0} observación(es)</div>`
    + `<div class="kbar" role="img" aria-label="Confianza ${pct(r.confidence)} por ciento"><i style="width:${pct(r.confidence)}%"></i></div>`
    + (open && why ? `<div class="kwhy"><p><strong>¿Por qué la aplicación sabe esto?</strong></p><p>${esc(why.summary)}</p>`
      + (why.breakdown.length ? `<ul>${why.breakdown.map(b => `<li>${esc(b.label)}: ${b.points > 0 ? '+' : ''}${b.points}</li>`).join('')}</ul>` : '')
      + (why.notes.length ? `<p class="hint">${esc(why.notes.join('; '))}.</p>` : '') + `<p class="hint">${esc(why.formula)}</p>`
      + (why.evidence.length ? `<p><strong>Evidencia (${why.evidenceTotal}):</strong></p><ul>${why.evidence.slice(0, 8).map(e => `<li>${esc(String(e.createdAt).slice(0, 10))} · ${esc(e.kind)} · ${esc(e.source)}${e.productRef ? ` · ${esc(e.productRef)}` : ''}${e.superseded ? ' · reemplazada' : ''}</li>`).join('')}</ul>` : '')
      + `</div>` : '')
    + `<div class="actions"><button type="button" class="btn btn--quiet" data-kwhy="${esc(r.id)}" aria-expanded="${open}">${open ? 'Ocultar evidencia' : 'Ver evidencia'}</button>`
    + `<button type="button" class="btn" data-kconfirm="${esc(r.id)}">Confirmar</button><button type="button" class="btn" data-kreject="${esc(r.id)}">Rechazar</button>`
    + (r.type ? `<button type="button" class="btn btn--quiet" data-kedit="${esc(r.id)}">Editar</button>` : '') + `</div></article>`;
}
async function renderKnowledge() {
  if (!Knowledge) return;
  const seq = ++kRenderSeq;
  try {
    await Knowledge.init();
    const K = window.FichasKnowledge, st = await Knowledge.stats();
    if (seq !== kRenderSeq) return;
    renderKnowledgeStatus(Knowledge.status());
    const sel = (id, opts, labelAll) => { const el = $(id); if (el && el.options.length <= 1) opts.forEach(([v, l]) => el.add(new Option(l, v))); };
    sel('#k-type', K.TYPES.map(t => [t, K.TYPE_LABEL[t]])); sel('#k-status-f', Object.values(K.STATUS).map(s => [s, K.STATUS_LABEL[s]]));
    const dt = $('#k-dict-type'); if (dt && !dt.options.length) K.TYPES.filter(t => !['product', 'concentration'].includes(t)).forEach(t => dt.add(new Option(K.TYPE_LABEL[t], t)));
    $('#k-auto').checked = !!st.settings.autoCorrect;
    $('#k-stats').innerHTML = [['Entidades', st.entities], ['Relaciones', st.relationships], ['Alias', st.aliases], ['Evidencias', st.evidence], ['Confirmados', (st.byStatus.confirmed || 0) + (st.byStatus.trusted || 0)], ['Conflictos abiertos', st.conflictsOpen]].map(([l, v]) => `<div><span>${esc(l)}</span><strong>${esc(v)}</strong></div>`).join('');
    /* conflictos */
    const conflicts = await Knowledge.listConflicts(); const details = [];
    for (const c of conflicts.slice(0, 10)) { const d = await Knowledge.conflictDetail(c.id); if (d) details.push(d); }
    $('#k-conflicts').innerHTML = details.length ? `<h3>Conflictos por resolver (${conflicts.length})</h3>` + details.map(d => `<article class="kcard kcard--conflict"><h3>${esc(d.subject)} → ¿cuál es correcto?</h3><p class="hint">La aplicación no elige sola cuando dos relaciones se contradicen.</p>${d.options.map(o => `<div class="kopt"><strong>${esc(o.label)}</strong> · ${pct(o.confidence)} % · ${esc(window.FichasKnowledge.STATUS_LABEL[o.status] || o.status)}<br><span class="hint">${esc(o.why.because.join('; '))}. Última evidencia: ${esc(String(o.lastAt).slice(0, 10))}.</span><div class="actions"><button type="button" class="btn btn--primary" data-kresolve="${esc(d.conflict.id)}" data-kopt="${esc(o.id)}">Este es el correcto</button></div></div>`).join('')}</article>`).join('') : '';
    /* reglas y alias por revisar */
    const rules = await Knowledge.listRules();
    $('#k-rules').innerHTML = rules.length ? `<h3>Correcciones tuyas por decidir (${rules.length})</h3>` + rules.map(r => `<article class="kcard"><p>Cambiaste «${esc(r.original)}» por «${esc(r.corrected)}» (${esc(fieldLabel(r.field))}).${r.critical ? ' <strong>Es un dato crítico: solo se sugerirá, nunca se aplicará sola.</strong>' : ''}</p><div class="actions"><button type="button" class="btn btn--primary" data-krule="${esc(r.id)}" data-kyes="1">Recordarlo para productos similares</button><button type="button" class="btn" data-krule="${esc(r.id)}" data-kyes="0">No</button></div></article>`).join('') : '';
    const aliases = await Knowledge.listAliases();
    $('#k-aliases').innerHTML = aliases.length ? `<h3>Alias sugeridos por revisar (${aliases.length})</h3>` + aliases.map(a => kCard(a, state.kOpen.has(a.id) ? kWhyCache.get(a.id) : null)).join('') : '';
    /* resultados */
    const f = state.kFilter; const rows = await Knowledge.search({ text: f.text, type: f.type, status: f.status, limit: 30 });
    const whys = {}; for (const r of rows) if (state.kOpen.has(r.id)) whys[r.id] = await Knowledge.why(r.id);
    for (const a of aliases) if (state.kOpen.has(a.id)) kWhyCache.set(a.id, await Knowledge.why(a.id));
    if (seq !== kRenderSeq) return;
    $('#k-results').innerHTML = rows.length ? `<h3>${f.text || f.type || f.status ? 'Resultados' : 'Aprendido recientemente'} (${rows.length})</h3>` + rows.map(r => kCard(r, whys[r.id])).join('')
      : `<p class="empty-state">${st.entities ? 'Ningún conocimiento coincide con tu búsqueda.' : 'Todavía no hay conocimiento. Se genera solo al guardar productos en el lote, o pulsa «Aprender del lote actual».'}</p>`;
    /* correcciones */
    const corr = await Knowledge.listCorrections({ limit: 30 });
    $('#k-corrections').innerHTML = corr.length ? `<ul>${corr.map(c => `<li>${esc(String(c.createdAt).slice(0, 16).replace('T', ' '))} · ${esc(fieldLabel(c.field))}: «${esc(c.original)}» → «${esc(c.corrected)}» · ${c.kind === 'auto' ? 'automática' : 'manual'} (${esc(c.rule)}) · ${c.status === 'reverted' ? 'revertida' : `<button type="button" class="btn btn--quiet" data-krevert="${esc(c.id)}">Revertir</button>`}</li>`).join('')}</ul>` : '<p class="hint">Todavía no hay correcciones.</p>';
    state.kPanelOpen = true;
  } catch (e) { if (window.console) console.error(e); $('#k-results').innerHTML = `<p class="note note--bad">${esc(UX.friendlyError(e, 'cargar el conocimiento').message)}</p>`; }
}
let kSearchTimer = null;
const kSearchInput = () => { clearTimeout(kSearchTimer); kSearchTimer = setTimeout(() => { state.kFilter = { text: $('#k-q').value, type: $('#k-type').value, status: $('#k-status-f').value }; renderKnowledge(); }, 200); };
$('#k-q').addEventListener('input', kSearchInput); $('#k-type').addEventListener('change', kSearchInput); $('#k-status-f').addEventListener('change', kSearchInput);
$('#conocimiento').addEventListener('click', async e => {
  const t = e.target.closest && e.target.closest('button'); if (!t || !Knowledge) return;
  const d = t.dataset;
  const act = async (fn, okMsg) => { try { const r = await fn(); if (r && r.ok === false) { notify(r.error || 'No se pudo completar la acción.', 'error'); return; } if (okMsg) notify(typeof okMsg === 'function' ? okMsg(r) : okMsg, 'ok'); state.kRev++; await renderKnowledge(); scheduleKnowledgeAssess(); scheduleLoteKnowledge(); } catch (err) { if (window.console) console.error(err); notify(UX.friendlyError(err, 'completar la acción').message, 'error'); } };
  if (d.kwhy) { if (state.kOpen.has(d.kwhy)) state.kOpen.delete(d.kwhy); else state.kOpen.add(d.kwhy); await renderKnowledge(); const b = document.querySelector(`#conocimiento [data-kwhy="${(typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(d.kwhy) : d.kwhy}"]`); if (b) b.focus(); }
  else if (d.kconfirm) act(() => Knowledge.confirm(d.kconfirm, { note: 'panel' }), 'Confirmado. La confianza se actualizó con tu evidencia.');
  else if (d.kreject) act(() => Knowledge.reject(d.kreject, { note: 'panel' }), 'Rechazado. Queda como evidencia negativa; no se borró nada.');
  else if (d.kedit) { const rec = (await Knowledge.search({ text: '', limit: 1 }), await Knowledge.db.get('entities', d.kedit)); if (!rec) return; const v = await promptDialog({ title: 'Editar valor canónico', message: 'Solo puedes ajustar mayúsculas, acentos o espacios. Para otro nombre usa un alias.', value: rec.canonicalValue }); if (v != null) act(() => Knowledge.edit(d.kedit, { canonicalValue: v }), 'Valor actualizado.'); }
  else if (d.kresolve) act(() => Knowledge.resolveConflict(d.kresolve, d.kopt), 'Conflicto resuelto. Las demás opciones quedaron como evidencia negativa.');
  else if (d.krule) act(() => Knowledge.resolveRule(d.krule, d.kyes === '1'), d.kyes === '1' ? 'Listo: la aplicación lo recordará.' : 'Entendido: no se usará.');
  else if (d.krevert) act(async () => { const r = await Knowledge.revertCorrection(d.krevert); if (r.ok) { const c = r.correction; state.lote.forEach(it => { if ((c.itemId && it.id === c.itemId) && it.v && it.v[c.field] === c.corrected) { it.v[c.field] = c.original; } }); persist('fichas.lote.v1', state.lote); renderLote(); renderOutputs(); } return r; }, 'Corrección revertida: se restauró el valor original.');
});
$('#k-auto').addEventListener('change', async e => { try { await Knowledge.setSettings({ autoCorrect: e.target.checked }); notify(e.target.checked ? 'Se aplicarán correcciones seguras al guardar (siempre con el original conservado).' : 'Solo se sugerirá; nada se corregirá solo.', 'ok'); } catch (err) { notify(UX.friendlyError(err, 'guardar el ajuste').message, 'error'); } });
$('#k-learn').addEventListener('click', ev => withBusy(ev.currentTarget, async () => {
  if (!state.lote.length) { notify('El lote está vacío: no hay de qué aprender.', 'warn'); return; }
  const r = await learn(state.lote, { source: 'lote' });
  if (r.ok === false) { notify(r.error, 'error'); return; }
  notify(`Se aprendió de ${r.products} producto(s). Lo que ya se conocía no se duplica.`, 'ok'); await renderKnowledge();
}, 'aprender del lote'));
$('#k-integrity').addEventListener('click', ev => withBusy(ev.currentTarget, async () => {
  const r = await Knowledge.integrity();
  notify(r.ok ? `Integridad correcta: ${r.entities} entidades, sin referencias rotas.` : `Se encontraron ${r.total} problema(s) de integridad.`, r.ok ? 'ok' : 'warn');
}, 'verificar la integridad'));
$('#k-backup').addEventListener('click', ev => withBusy(ev.currentTarget, async () => {
  const data = await Knowledge.exportBackup();
  await saveFile(`conocimiento-fichas-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data), 'application/json;charset=utf-8');
}, 'generar el respaldo de conocimiento'));
$('#k-restore-pick').addEventListener('click', () => $('#k-restore').click());
$('#k-restore').addEventListener('change', e => {
  const file = e.target.files && e.target.files[0]; e.target.value = ''; if (!file) return;
  const rd = new FileReader();
  rd.onload = async () => {
    try {
      const data = JSON.parse(rd.result); const v = Knowledge.db.validateBackup(data);
      if (!v.ok) { notify(v.errors[0], 'error'); return; }
      const ok = await confirmDialog({ title: '¿Restaurar el conocimiento?', message: `Se combinará con lo que ya sabe la aplicación: no se borra nada, no se duplica y la evidencia se conserva.${v.warnings.length ? ' ' + v.warnings[0] : ''}`, confirmLabel: 'Restaurar' });
      if (!ok) { notify('Restauración cancelada.', 'warn'); return; }
      const r = await Knowledge.importBackup(data);
      if (!r.ok) { notify(r.error, 'error'); return; }
      state.kRev++; kLoteSig.clear(); await renderKnowledge(); scheduleLoteKnowledge();
      notify(`Conocimiento restaurado: ${r.report.added} nuevos, ${r.report.updated} actualizados.${r.integrity.ok ? '' : ` Atención: ${r.integrity.total} referencia(s) rotas.`}`, r.integrity.ok ? 'ok' : 'warn');
    } catch (err) { if (window.console) console.error(err); notify(UX.friendlyError(err, 'restaurar el conocimiento').message, 'error'); }
  };
  rd.onerror = () => notify('No se pudo leer el archivo. Intenta nuevamente.', 'error');
  rd.readAsText(file);
});
$('#k-dict-add').addEventListener('click', ev => withBusy(ev.currentTarget, async () => {
  const text = $('#k-dict-text').value; if (!text.trim()) { notify('Escribe al menos una equivalencia.', 'warn'); return; }
  const r = await Knowledge.importDictionary(text, $('#k-dict-type').value, {});
  if (r.skipped) notify('Ese diccionario ya se había importado.', 'warn'); else { notify(`${r.count} equivalencia(s) importadas como confirmadas.`, 'ok'); $('#k-dict-text').value = ''; state.kRev++; await renderKnowledge(); }
}, 'importar el diccionario'));
$('#k-reset').addEventListener('click', async () => {
  const ok = await confirmDialog({ title: '¿Reiniciar el conocimiento?', message: 'Se borrará todo lo que la aplicación aprendió (entidades, alias, relaciones, evidencia y correcciones). Tu lote y tus productos no se tocan. Descarga antes un respaldo si quieres conservarlo.', confirmLabel: 'Reiniciar', danger: true });
  if (!ok) return;
  try { await Knowledge.reset(); kIssues.clear(); kLoteSig.clear(); state.kA = null; state.kRev++; await renderKnowledge(); renderOutputs(); renderLote(); notify('Conocimiento reiniciado.', 'ok'); }
  catch (e) { if (window.console) console.error(e); notify(UX.friendlyError(e, 'reiniciar el conocimiento').message, 'error'); }
});
/* Cohere: sugiere alias; lo que propone queda SUGGESTED y pasa por tu revisión. Reutiliza la llave y el cliente de la app. */
$('#k-ai').addEventListener('click', ev => withBusy(ev.currentTarget, async () => {
  if (!getKey()) { notify('Primero guarda tu llave de Cohere en el asistente de IA.', 'warn'); return; }
  const rare = await Knowledge.search({ status: 'observed', limit: 60 });
  const items = rare.filter(r => ['substance', 'laboratory', 'brand', 'manufacturer', 'pharmaceuticalForm'].includes(r.type)).slice(0, 15).map(r => ({ type: r.type, value: r.canonicalValue }));
  if (!items.length) { notify('No hay valores observados que comparar todavía.', 'warn'); return; }
  const r = await Knowledge.aiSuggestAliases({ items, chat: AI.chat, apiKey: getKey(), model: aiModel(), onCall: () => bumpCalls('extract') });
  if (!r.ok) { notify(UX.friendlyError(new Error(r.error), 'pedir sugerencias a la IA').message, 'error'); return; }
  notify(r.created ? `La IA sugirió ${r.created} alias. Revísalos: no cuentan como verdad hasta que los confirmes.` : 'La IA no encontró equivalencias claras.', r.created ? 'ok' : 'warn');
  state.kRev++; await renderKnowledge();
}, 'pedir sugerencias a la IA'));
document.addEventListener('click', e => {
  const t = e.target.closest && e.target.closest('button'); if (!t || !Knowledge) return;
  if (t.dataset.ksug !== undefined) applySuggestion(state.ksugs[+t.dataset.ksug]);
  if (t.dataset.kno !== undefined) dismissSuggestion(state.ksugs[+t.dataset.kno]);
});
if (Knowledge) {
  Knowledge.init().then(async st => {
    state.kReady = true; renderKnowledgeStatus(Knowledge.status());
    await bootstrapKnowledge(); renderKnowledgeStatus(Knowledge.status());
    scheduleKnowledgeAssess(); scheduleLoteKnowledge();
  }).catch(e => { if (window.console) console.error(e); const b = $('#k-status'); if (b) { b.className = 'note note--bad'; b.textContent = UX.friendlyError(e, 'abrir el conocimiento').message; } });
}
window.__fichasKnowledge = () => ({ engine: Knowledge, issues: kIssues, rev: () => state.kRev });

/* Contadores de caché (solo lectura): permiten comprobar que filtrar o expandir no recalcula el lote. */
window.__fichasStats = () => ({ assess: { ...assessStats }, current: { ...currentMemo.stats } });
/* Inicio */
// Todos los botones de esta SPA son acciones explícitas; evita comportamientos de submit
// inesperados al abrir el HTML en navegadores móviles o WebViews.
document.querySelectorAll('button:not([type])').forEach(b => { b.type = 'button'; });
renderConnectorCategories(); renderConnectorSource();
$('#exp-ia').checked = !!state.exp.incIA; $('#exp-attr').value = state.exp.attr; $('#exp-enc').value = state.exp.enc; $('#exp-incf').checked = state.exp.incF; $('#exp-excl').checked = state.exp.excL;
renderMetaCfg();
resetTracking(); connectorStatus('No hay conexiones configuradas. Elige una fuente, completa los datos y pulsa «Probar» para empezar.'); renderCats(); renderForm(); renderOutputs(); renderLote(); renderBulk(); renderAiSuggest(); renderAsst(); renderCalls(); renderPhotos(); renderImgReview(); setTab('titulo'); renderPersistenceStatus(); void hydratePersistentState();
})();
