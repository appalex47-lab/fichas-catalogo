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
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

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
function persist(k,v){ store.set(k,v); void idbSet(k,v); }
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
const keepSet = () => new Set(String(state.keepText).split(/[,\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean));
const hasAny = c => c.fields.some(fd => fd.type !== 'select' && (state.v[fd.key] || '').trim());

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
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
  if(ok) toast(msg); else manualCopyDialog(text, msg);
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
  if (fd.type === 'select') {
    ctl = `<select id="f-${fd.key}" data-key="${fd.key}">${fd.opts.map(([v, l]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  } else if (fd.type === 'area') {
    ctl = `<textarea id="f-${fd.key}" data-key="${fd.key}" rows="2" placeholder="${esc(fd.ph || '')}">${esc(val)}</textarea>`;
  } else {
    ctl = `<input type="text" id="f-${fd.key}" data-key="${fd.key}" value="${esc(val)}" placeholder="${esc(fd.ph || '')}" autocomplete="off">`;
  }
  return `<div class="field">${label}${ctl}${fd.hint ? `<p class="hint">${esc(fd.hint)}</p>` : ''}</div>`;
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
  const r = computeFor(state.cat, state.v, keepSet(), state.meta);
  state.out = r;
  if (!hasAny(c)) {
    $('#alerts').innerHTML = '';
    const empty = `<p class="empty-state">Captura los datos del producto para ver el resultado. Empieza por la marca.</p>`;
    $('#panel-titulo').innerHTML = empty; $('#panel-mc').innerHTML = empty; $('#panel-mg').innerHTML = empty; $('#panel-meta').innerHTML = empty;
    if ($('#panel-eval')) $('#panel-eval').innerHTML = empty;
    return;
  }
  renderAlerts(r);
  $('#panel-titulo').innerHTML = panelTitle(r);
  $('#panel-mc').innerHTML = panelMC(r);
  $('#panel-mg').innerHTML = panelMg(r);
  state.seo = SEO.evaluate({ cat: state.cat, v: state.v, sku: state.sku, img: state.img, ai: state.aiFlags }, { keep: keepSet(), metaCfg: state.meta, res: r });
  $('#panel-meta').innerHTML = panelSeo(state.seo) + panelMeta(r);
  renderEvalPanel(r);
}
function renderEvalPanel(r) {
  const box = $('#panel-eval');
  if (!box) return;
  try {
    const item = { cat: state.cat, v: state.v, sku: state.sku, img: state.img, ai: state.aiFlags };
    const keep = keepSet();
    const e = evalItem(item, keep);
    const content = Content.evaluate(item, { keep, metaCfg: state.meta, res: r });
    const magento = MagentoReadiness.evaluate(item, { keep, metaCfg: state.meta, res: r, exp: expForReadiness() });
    const s360 = assessItem(item, e, r, state.seo, content, magento);
    state.eval = { health: e.health, quality: e.quality, seo: state.seo, content, magento, s360 };
    box.innerHTML = panelEval(state.eval);
  } catch (err) {
    state.eval = null;
    box.innerHTML = '<p class="hint">No se pudo calcular la evaluación de este producto.</p>';
    if (window.console) console.error(err);
  }
}
function setTab(t) {
  state.tab = t;
  $$('.tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
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
function evalItem(it, keep) {
  const res = computeFor(it.cat, it.v, keep, state.meta);
  const L = lint(res.c, it.v);
  const sourceMap = Anomalies.sourceMapFor(it);
  const quality = Quality.audit(it.cat, it.v, { sourceMap, provenanceMap: it.provenance || {}, leftover: it.note ? String(it.note).split(/\s+/) : [] });
  const canonical = Canonical.canonicalize(it, res, quality, it.provenance || {}, []);
  const health = Health.scoreReport(quality, canonical);
  return { res, tag: statusOf(res), lang: langCount(L), ia: unconfirmed(it.ai), quality, canonical, health };
}
const tagsHTML = e => `<span class="tag tag--${e.tag[0]}">${esc(e.tag[1])}</span>` + (e.quality.status !== 'listo' ? ` <span class="tag tag--${e.quality.status === 'critico' ? 'bad' : 'warn'}">Calidad: ${e.quality.counts.error} errores / ${e.quality.counts.warning} avisos</span>` : '') + (e.lang ? ` <span class="tag tag--warn">Revisar lenguaje</span>` : '') + (e.ia ? ` <span class="tag tag--ai">IA sin confirmar</span>` : '') + (e.canonical?.schema ? ` <span class="tag tag--quiet" title="Modelo canónico ${esc(e.canonical.version || '')}">Modelo canónico</span>` : '');
const passFilter = (e, f) => f === 'todos' || (f === 'faltantes' && e.res.title.missing.length) || (f === 'bloqueados' && e.res.mg.blocked) || (f === 'lenguaje' && e.lang) || (f === 'calidad' && e.quality.status !== 'listo') || (f === 'anomalías' && state.anomalies.some(a => a.indexes.includes(e.__index))) || (f === 'ia' && e.ia) || (f === 'seo_critico' && e.seo && e.seo.status === 'critico') || (f === 'seo_revisar' && e.seo && e.seo.status === 'revisar') || (f === 'seo_pendiente' && e.seo && e.seo.status === 'pendiente') || (f === 'seo_sin_evaluar' && (!e.seo || e.seo.status === 'sin_evaluar')) || (f === 'c360_critico' && Score360.isCritical360(e.s360)) || (f === 'contenido_critico' && e.content && e.content.status === 'critico') || (f === 'mag_bloqueado' && e.magento && e.magento.state === 'BLOCKED') || (f === 'mag_listo' && e.magento && e.magento.state === 'READY') || (f === 'mag_advertencias' && e.magento && e.magento.state === 'READY_WITH_WARNINGS');

/* Fase 9: Content, Magento Readiness y Score 360. Solo combinan resultados; no vuelven a validar los datos. */
const expForReadiness = () => (state.exp ? expOpts() : {});
function healthWithIssues(e) { return Object.assign({}, e.health, { issues: (e.quality && e.quality.issues) || [] }); }
function assessItem(item, e, res, seo, content, magento) {
  return Score360.compute({ health: healthWithIssues(e), seo, content, magento }, { F: window.Fichas, cat: item.cat });
}
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
function assessLote() {
  const keep = keepSet();
  const all = state.lote.map((it, index) => { const e = evalItem(it, keep); e.__index = index; return { it, e }; });
  const anomalies = Anomalies.detectBatch(state.lote, all.map(x => x.e));
  all.forEach(x => { x.e.health = Health.scoreReport(x.e.quality, x.e.canonical, anomalies.filter(a => a.indexes.includes(x.e.__index))); });
  const seoBatch = SEO.evaluateBatch(state.lote, { keep, metaCfg: state.meta, resList: all.map(x => x.e.res), anomalies });
  all.forEach((x, i) => { x.e.seo = seoBatch.items[i] || null; });
  return Object.assign({ all, anomalies, seoSum: seoBatch.summary }, attachAssessment(all, keep, anomalies));
}
function saveQualitySnapshot(context) {
  const reports = state.lote.map(it => evalItem(it, keepSet()));
  const anomalies = Anomalies.detectBatch(state.lote, reports);
  reports.forEach((e, i) => { e.__index = i; e.health = Health.scoreReport(e.quality, e.canonical, anomalies.filter(a => a.indexes.includes(i))); });
  const entry = Health.snapshot(reports, context);
  state.qualityHistory = Health.appendHistory(state.qualityHistory, entry, 100);
  store.set('fichas.quality.v1', state.qualityHistory);
  /* Score 360: solo snapshots (máximo 100). Los scores se recalculan siempre desde los datos actuales. */
  try {
    const a = assessLote();
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
function exportLoteBackup(){
  const payload={schema:'fichas.lote-backup.v1',createdAt:new Date().toISOString(),lote:state.lote,audit:state.audit};
  saveFile(`respaldo-lote-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(payload,null,2),'application/json;charset=utf-8');
}
function importLoteBackup(file){
  if(!file)return; const rd=new FileReader(); rd.onload=()=>{ try{ const p=JSON.parse(rd.result); if(!Array.isArray(p.lote))throw new Error('Formato de respaldo no válido.'); state.lote=p.lote; state.audit=Array.isArray(p.audit)?p.audit:state.audit; persist('fichas.lote.v1',state.lote); persist('fichas.audit.v1',state.audit); renderLote(); renderPersistenceStatus(); toast(`Respaldo restaurado: ${state.lote.length} producto(s).`); }catch(e){toast(e.message||'No se pudo restaurar el respaldo.');} }; rd.readAsText(file);
}
function renderLote() {
  $('#lote-count').textContent = state.lote.length;
  renderPersistenceStatus();
  const body = $('#lote-body');
  if (!state.lote.length) {
    renderExport();
    body.innerHTML = `<p class="empty-state">Aún no hay productos. Agrégalos desde el formulario o sube un CSV en la carga masiva.</p>`;
    return;
  }
  const assessed = assessLote();
  const all = assessed.all;
  state.anomalies = assessed.anomalies;
  renderExport(assessed);
  const anomalySummary = Anomalies.summarize(state.anomalies);
  const healthSummary = Health.summarize(all.map(x => x.e));
  const seoSum = assessed.seoSum;
  const { contentSum, magSum, s360Sum } = assessed;
  const cnt = {}; Object.keys(FILTERS).forEach(k => { cnt[k] = all.filter(x => passFilter(x.e, k)).length; });
  const rows = all.filter(x => passFilter(x.e, state.loteFilter));
  const shown = rows.slice(0, state.loteShown);
  const auditRows = state.audit.slice(-8).reverse().map(x => `<li><strong>${esc(x.action.replaceAll('_',' '))}</strong> · ${esc(x.sku || 'sin SKU')} · ${esc(new Date(x.at).toLocaleString())}</li>`).join('');
  body.innerHTML =
    `<details class="plain audit-box"><summary>Trazabilidad del lote (${state.audit.length} eventos guardados)</summary><p class="hint">La trazabilidad registra cambios relevantes sin almacenar valores sensibles adicionales.</p>${auditRows ? `<ul>${auditRows}</ul>` : '<p class="hint">Todavía no hay eventos.</p>'}</details>` +
    `<div class="quality-health" aria-label="Salud de calidad del lote"><div><strong>Health Score</strong> ${healthSummary.average == null ? '—' : healthSummary.average + '/100'}</div><div class="hint">${healthSummary.total ? `Rango ${healthSummary.min}–${healthSummary.max}. ${healthSummary.bands.critica} crítica(s), ${healthSummary.bands.revisar} para revisar, ${healthSummary.bands.buena + healthSummary.bands.excelente} en buen estado.` : 'Sin productos evaluados.'}</div></div>` +
    `<div class="quality-health seo-health" aria-label="SEO del lote"><div><strong>SEO</strong> ${seoSum.average == null ? '—' : `promedio ${seoSum.average}/100`}</div><div class="hint">${seoSum.evaluados ? `Mínimo ${seoSum.min}, máximo ${seoSum.max}. ` : 'Sin productos evaluados. '}${seoSum.byStatus.critico} crítico(s), ${seoSum.byStatus.revisar} por revisar, ${seoSum.byStatus.pendiente} pendiente(s), ${seoSum.byStatus.sin_evaluar} sin evaluar.</div></div>` +
    `<div class="quality-health seo-health" aria-label="Contenido, Magento y Score 360 del lote"><div><strong>Contenido</strong> ${contentSum.average == null ? '—' : `promedio ${contentSum.average}/100`} · <strong>Magento</strong> ${magSum.ready} listo(s), ${magSum.readyWithWarnings} con advertencias, ${magSum.blocked} bloqueado(s) · <strong>Score 360°</strong> ${s360Sum.average == null ? '—' : `promedio ${s360Sum.average}/100`}</div><div class="hint">Promedios por eje: Health ${s360Sum.health == null ? '—' : s360Sum.health}, SEO ${s360Sum.seo == null ? '—' : s360Sum.seo}, Contenido ${s360Sum.content == null ? '—' : s360Sum.content}, Magento (diagnóstico) ${s360Sum.magento == null ? '—' : s360Sum.magento}. ${contentSum.byStatus.critico} con contenido crítico, ${s360Sum.bands.critica || 0} con 360 crítico.</div></div>` +
    `<div class="filters" role="group" aria-label="Filtrar lote">${Object.entries(FILTERS).map(([k, l]) =>
      `<button class="chip" data-filter="${k}" aria-pressed="${state.loteFilter === k}">${l} (${k === 'anomalías' ? anomalySummary.total : cnt[k]})</button>`).join('')}</div>` +
    (rows.length ? `<div class="tablewrap"><table>
      <thead><tr><th>SKU</th><th>Categoría</th><th>Título</th><th>Estado</th><th></th></tr></thead>
      <tbody>${shown.map(({ it, e }) => `<tr><td>${esc(it.sku || '')}</td><td>${e.res.c.emoji} ${esc(e.res.c.name)}</td><td class="t">${esc(e.res.title.title)}</td>
        <td>${tagsHTML(e)} <span class="tag tag--${e.health.band === 'critica' ? 'bad' : e.health.band === 'revisar' ? 'warn' : 'ok'}">Health ${e.health.score}</span> ${seoTag(e.seo)} ${contentTag(e.content)} ${magentoTag(e.magento)} ${s360Tag(e.s360)}</td><td>${state.anomalies.filter(a => a.indexes.includes(e.__index)).map(a => `<span class="tag tag--${a.severity === 'error' ? 'bad' : 'warn'}">${esc(a.type === 'duplicate-sku' ? 'SKU duplicado' : a.type === 'duplicate-title' ? 'Título duplicado' : a.type === 'near-duplicate-sku' ? 'SKU similar' : a.type === 'near-duplicate-title' ? 'Título similar' : 'Dato pendiente')}</span>`).join(' ') || '<span class="hint">—</span>'}</td>
        <td class="ops">${e.ia ? `<button class="btn btn--ai" data-aiok="${it.id}">Confirmar IA</button>` : ''}<button class="btn btn--quiet" data-edit="${it.id}">Editar</button><button class="btn btn--quiet" data-del="${it.id}">Quitar</button></td></tr>`).join('')}</tbody></table></div>`
      : `<p class="empty-state">Ningún producto coincide con este filtro.</p>`) +
    (rows.length > shown.length ? `<div class="actions"><button class="btn" data-more="1">Mostrar ${Math.min(50, rows.length - shown.length)} más (${rows.length - shown.length} restantes)</button></div>` : '');
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
  state.v[k] = e.target.value;
  renderOutputs();
});
$('#sku').addEventListener('input', e => { state.sku = e.target.value; });
$('#img').addEventListener('input', e => { state.img = e.target.value; });
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
  if (t.dataset.filter) { state.loteFilter = t.dataset.filter; state.loteShown = 50; renderLote(); }
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
  if (t.dataset.del) { const removed = state.lote.find(x => x.id === t.dataset.del); state.lote = state.lote.filter(x => x.id !== t.dataset.del); if (removed) state.audit.push(Anomalies.event('producto_eliminado', removed)); state.audit = state.audit.slice(-500); persist('fichas.lote.v1', state.lote); persist('fichas.audit.v1', state.audit); renderLote(); }
  if (t.dataset.edit) {
    const it = state.lote.find(x => x.id === t.dataset.edit);
    if (!it) return;
    state.cat = it.cat; state.v = { ...it.v }; state.sku = it.sku || ''; state._editingProvenance = it.provenance || {}; state._editingId = it.id; state.img = it.img || ''; state.aiFlags = { ...(it.ai || {}) }; state.aiSuggest = [];
    // El producto permanece en el lote hasta que se guarden los cambios: si se cierra la página o se limpia el formulario no se pierde.
    renderCats(); renderForm(); renderOutputs(); renderLote(); syncAddButton();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast('Editando producto. Pulsa «Guardar cambios» al terminar; si limpias el formulario se conserva la versión anterior.');
  }
});

$('#add').addEventListener('click', () => {
  const c = CATS[state.cat];
  if (!hasAny(c)) { toast('Captura al menos la marca para agregar el producto.'); return; }
  const v = {};
  c.fields.forEach(fd => { if (state.v[fd.key]) v[fd.key] = state.v[fd.key]; });
  const newItem = { id: state._editingId || uid(), sku: state.sku.trim(), img: state.img.trim(), cat: state.cat, v, ai: { ...state.aiFlags } };
  newItem.provenance = Anomalies.provenanceFor(newItem, state._editingProvenance || null);
  const editIdx = state._editingId ? state.lote.findIndex(x => x.id === state._editingId) : -1;
  const action = state._editingId ? 'producto_actualizado' : 'producto_agregado';
  if (editIdx >= 0) state.lote[editIdx] = newItem; else state.lote.push(newItem);
  state.audit.push(Anomalies.event(action, newItem, { fields: Object.keys(v) }));
  state.audit = state.audit.slice(-500);
  persist('fichas.lote.v1', state.lote); persist('fichas.audit.v1', state.audit); saveQualitySnapshot(state._editingId ? 'producto_actualizado' : 'producto_agregado');
  const wasEditing = !!state._editingId;
  state.v = {}; state.sku = ''; state.img = ''; state.aiFlags = {}; state.aiSuggest = []; state._editingId = null; state._editingProvenance = null;
  renderForm(); renderOutputs(); renderLote(); renderAiSuggest(); resetPhotos(); syncAddButton();
  toast(wasEditing ? 'Cambios guardados en el lote' : 'Producto agregado al lote');
});
function syncAddButton() { const b = $('#add'); if (b) b.textContent = state._editingId ? 'Guardar cambios' : 'Agregar al lote'; }
$('#clear').addEventListener('click', () => { state.v = {}; state.sku = ''; state.img = ''; state.aiFlags = {}; state.aiSuggest = []; state._editingId = null; state._editingProvenance = null; renderForm(); renderOutputs(); renderAiSuggest(); resetPhotos(); syncAddButton(); });
let clearArmed = false, clearTimer;
$('#lote-clear').addEventListener('click', e => {
  if (!state.lote.length) return;
  const b = e.currentTarget;
  if (!clearArmed) {
    clearArmed = true; b.textContent = 'Confirmar: vaciar lote';
    clearTimer = setTimeout(() => { clearArmed = false; b.textContent = 'Vaciar lote'; }, 3500);
    return;
  }
  clearTimeout(clearTimer); clearArmed = false; b.textContent = 'Vaciar lote';
  state.lote = []; persist('fichas.lote.v1', state.lote); renderLote();
  toast('Lote vaciado');
});
$('#lote-copy').addEventListener('click', () => {
  if (!state.lote.length) { toast('El lote está vacío.'); return; }
  copyText(toSheet(exportRows(), '\t'), 'Lote copiado. Pégalo en tu hoja de cálculo.');
});

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
        toast(`Archivo listo: ${filename}`); return true;
      }
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return false;
  }
  try {
    if (window.URL && URL.createObjectURL) {
      const url = URL.createObjectURL(blob), a=document.createElement('a');
      a.href=url; a.download=filename; a.rel='noopener'; a.target='_blank'; a.style.display='none';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),10000);
      toast(`Descarga preparada: ${filename}`); return true;
    }
  } catch(_) {}
  try {
    let binary=''; const chunk=0x8000;
    for(let i=0;i<bytes.length;i+=chunk) binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));
    const url='data:'+type+';base64,'+btoa(binary), a=document.createElement('a');
    a.href=url; a.download=filename; a.target='_blank'; a.rel='noopener'; a.style.display='none';
    document.body.appendChild(a); a.click(); a.remove(); toast(`Archivo preparado: ${filename}`); return true;
  } catch(_) {
    if (typeof data === 'string') manualCopyDialog(data, `No se pudo descargar ${filename}`);
    return false;
  }
}
$('#lote-dl').addEventListener('click', () => {
  if (!state.lote.length) { toast('El lote está vacío.'); return; }
  saveFile('fichas-catalogo.csv', '\uFEFF' + toSheet(exportRows(), ','));
});
$('#lote-backup').addEventListener('click', exportLoteBackup);
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
  let added = 0, updated = 0;
  ok.forEach(r => {
    const v = { ...r.v }, ai = { ...(r.ai || {}) };
    if (b.applySugg) (r.sugg || []).forEach(s => { if (!v[s.campo]) { v[s.campo] = s.valor; ai[s.campo] = 'sugerido'; } });
    const item = { id: uid(), sku: r.sku, img: r.img || '', cat: r.cat, v, ai };
    item.provenance = Anomalies.provenanceFor(item);
    const idx = r.sku ? state.lote.findIndex(x => x.sku && x.sku.toLowerCase() === r.sku.toLowerCase()) : -1;
    if (idx >= 0) { item.id = state.lote[idx].id; state.lote[idx] = item; state.audit.push(Anomalies.event('producto_actualizado_masivo', item)); updated++; } else { state.lote.push(item); state.audit.push(Anomalies.event('producto_agregado_masivo', item)); added++; }
  });
  state.audit = state.audit.slice(-500); persist('fichas.lote.v1', state.lote); persist('fichas.audit.v1', state.audit); saveQualitySnapshot('carga_masiva');
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
const saveMeta = () => store.set('fichas.meta.v2', state.meta);
const clone = o => JSON.parse(JSON.stringify(o));

function metaBlock(label, o, key, copy, hint) {
  return `<h3>${label}</h3>
    <div class="desc">${o.text ? esc(o.text) : '<span class="empty-final">Sin contenido</span>'}</div>
    ${hint ? `<p class="hint">${hint}</p>` : ''}
    <div class="meta-row"><span class="${o.max ? (o.over ? 'count-off' : 'count-ok') : ''}">${o.len} caracteres${o.max ? ` de ${o.max}` : ''}</span>
    ${copy ? `<button class="btn" data-copy="${key}" ${o.text ? '' : 'disabled'}>Copiar</button>` : ''}</div>`;
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
  return `<li class="seo-rule seo-rule--${x.estado}"><div class="seo-rule-head"><span class="seo-sym" aria-label="${esc((SEO.ESTADO_LABEL || {})[x.estado] || x.estado)}">${x.simbolo}</span> <code>${esc(x.id)}</code> ${esc(x.regla)}</div>${lines}</li>`;
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
function evalRecsHTML(list, axis) {
  if (!list.length) return '<p class="hint">Nada que corregir en este eje.</p>';
  return `<ul class="seo-rules">${list.map(r => `<li class="seo-rule seo-rule--${r.severidad === 'error' ? 'error' : 'pendiente'}"><div class="seo-rule-head"><span class="tag tag--${r.prioridad <= 3 ? 'bad' : r.prioridad <= 5 ? 'warn' : 'info'}">${esc(r.claseLabel)}</span> ${esc(r.texto)}</div>`
    + (r.detalles && r.detalles.length ? `<div><span class="seo-k">Detalle:</span> ${esc(r.detalles.join(' · '))}</div>` : '')
    + (axis && r.fuentes.length > 1 ? `<div><span class="seo-k">También lo señalan:</span> ${r.fuentes.filter(f => f !== axis).map(f => esc(AXIS_LABEL[f])).join(', ')}</div>` : '') + '</li>').join('')}</ul>`;
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
    recs.length ? `<ol class="seo-rules">${recs.map(r => `<li class="seo-rule seo-rule--${r.severidad === 'error' ? 'error' : 'pendiente'}"><div class="seo-rule-head"><span class="tag tag--${r.prioridad <= 3 ? 'bad' : r.prioridad <= 5 ? 'warn' : 'info'}">${esc(r.claseLabel)}</span> ${esc(r.texto)}</div><div><span class="seo-k">Lo señala:</span> ${r.fuentes.map(f => esc(AXIS_LABEL[f])).join(', ')}</div></li>`).join('')}</ol>` : '<p class="hint">Sin recomendaciones: la ficha cumple todo lo evaluado.</p>');
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
  if (!state.lote.length) { box.innerHTML = `<p class="empty-state">El lote está vacío. Agrega productos para exportarlos.</p>`; dl.disabled = true; cp.disabled = true; return; }
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
  const readiness = `<div class="exp-readiness" aria-label="Preparación para Magento"><div><span>Productos</span><strong>${ass.magSum.total}</strong></div><div><span>Bloqueados</span><strong>${ass.magSum.blocked}</strong></div><div><span>Con advertencias</span><strong>${ass.magSum.readyWithWarnings}</strong></div><div><span>Listos</span><strong>${ass.magSum.ready}</strong></div><div><span>Score 360° promedio</span><strong>${ass.s360Sum.average == null ? '—' : ass.s360Sum.average}</strong></div></div>`;
  box.innerHTML = readiness + `<p><strong>${ex.rows.length} de ${ex.total}</strong> productos se exportan.</p>`
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
    <p class="hint">Cada línea es un bloque. Si falta un dato, la línea se omite. {seg1} a {seg4} son los segmentos del título optimizado. Agrega <code>:lc</code> para minúscula inicial, por ejemplo <code>{contenido:lc}</code>. Agrega <code>:o</code> para que un dato opcional no elimine la línea si falta. {receta_txt} da «con receta médica» si declaraste que sí requiere receta. Tokens de esta categoría: ${tokens.map(t => `<code>${esc(t)}</code>`).join(' ')}</p>
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
$('#exp-copy').addEventListener('click', () => {
  const ex = currentBatch();
  if (!ex.rows.length) { toast('No hay filas para exportar.'); return; }
  copyText(batchCsv(ex), 'CSV copiado. Pégalo en un archivo .csv.');
});
$('#exp-dl').addEventListener('click', () => {
  const ex = currentBatch();
  if (!ex.rows.length) { toast('No hay filas para exportar.'); return; }
  const csv = batchCsv(ex);
  saveQualitySnapshot('exportacion_csv');
  saveFile('Carga_SKU_Magento.csv', state.exp.enc === 'utf8' ? csv : encodeCp1252(csv).bytes);
});

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
    let added=0;
    for(const rec of records){
      const d=rec.data||{}; const sku=String(d.SKU??d.sku??rec.sourceRecordId??'').trim();
      const v={}; Object.entries(d).forEach(([k,val])=>{ if(k==='SKU'||k==='sku'||k==='cat'||k==='category')return; const fd=CATS[cat]?.fields?.find(f=>f.key===k); if(fd)v[k]=String(val??''); });
      if(!sku && !Object.keys(v).length) continue;
      state.lote.push({cat,sku,v,ai:{},provenance:{},external:{sourceId:rec.sourceId,sourceRecordId:rec.sourceRecordId,fetchedAt:rec.fetchedAt,checksum:rec.checksum}}); added++;
    }
    persist('fichas.lote.v1',state.lote); state.audit.push({action:'integration_import',sku:'',at:new Date().toISOString(),meta:{source:cfg.sourceId,count:added}}); state.audit=state.audit.slice(-500); persist('fichas.audit.v1',state.audit); renderLote();
    toast(`${added} registro(s) agregados al lote para revisión.`);
    return records;
  } catch(e) { connectorStatus(e.message||'No se pudo conectar.','note--bad'); return []; }
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
    st.className = 'status bad'; st.textContent = e.message || 'No se pudo completar con IA. Usa "Extraer campos" o captura los datos a mano.';
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
      failed = e.message; break;
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
    try { state.photos.push(await fileToDataUrl(f)); } catch (e) { toast(e.message); }
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
    st.className = 'status bad'; st.textContent = e.message || 'No se pudo leer las fotos.';
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
    state.asst[state.asst.length - 1] = { role: 'error', content: e.message || 'No se pudo obtener respuesta.' };
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

/* Inicio */
// Todos los botones de esta SPA son acciones explícitas; evita comportamientos de submit
// inesperados al abrir el HTML en navegadores móviles o WebViews.
document.querySelectorAll('button:not([type])').forEach(b => { b.type = 'button'; });
renderConnectorCategories(); renderConnectorSource();
$('#exp-ia').checked = !!state.exp.incIA; $('#exp-attr').value = state.exp.attr; $('#exp-enc').value = state.exp.enc; $('#exp-incf').checked = state.exp.incF; $('#exp-excl').checked = state.exp.excL;
renderMetaCfg();
renderCats(); renderForm(); renderOutputs(); renderLote(); renderBulk(); renderAiSuggest(); renderAsst(); renderCalls(); renderPhotos(); renderImgReview(); setTab('titulo'); renderPersistenceStatus(); void hydratePersistentState();
})();
