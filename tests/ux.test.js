'use strict';
/* Fase 10: pruebas de la capa de UX (js/ux.js), sin DOM. Todo se deriva de los resultados de los motores existentes. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const F = require('../js/logic');
const Q = require('../js/quality');
const Cn = require('../js/canonical');
const H = require('../js/health');
const SEO = require('../js/seo');
const C = require('../js/content');
const M = require('../js/magento-readiness');
const S = require('../js/score360');
const U = require('../js/ux');

const root = path.join(__dirname, '..');
const meta = F.defMeta(), keep = new Set();
const med = { marca: 'Tempra', principio: 'Paracetamol', concentracion: '500 mg', forma: 'Tabletas', contenido: '30', laboratorio: 'Genomma', via: 'Oral', receta: 'no' };

/* Evaluación completa de un producto con los cinco motores (igual que la app). */
function assess(item, exp) {
  const res = F.computeFor(item.cat, item.v, keep, meta);
  const quality = Q.audit(item.cat, item.v, {});
  const canonical = Cn.canonicalize(item, res, quality, {}, []);
  const health = Object.assign({}, H.scoreReport(quality, canonical), { issues: quality.issues });
  const seo = SEO.evaluate(item, { keep, metaCfg: meta, res });
  const content = C.evaluate(item, { keep, metaCfg: meta, res });
  const magento = M.evaluate(item, { keep, metaCfg: meta, res, exp });
  const s360 = S.compute({ health, seo, content, magento }, { F, cat: item.cat });
  return { health, seo, content, magento, s360, res };
}
const ctxOf = it => ({ CATS: F.CATS, cat: it.cat, values: it.v });
const complete = { sku: 'A1', cat: 'med', v: med, img: 'a.jpg' };
const noSku = { cat: 'med', v: med, img: 'a.jpg' };
const contradiction = { sku: 'A1', cat: 'med', v: { ...med, via: 'Subcutánea' }, img: 'a.jpg' };
const fake = (recs, magentoState) => ({ s360: { recommendations: recs, global: { band: 'buena', score: 80 } }, magento: { state: magentoState || 'READY', blockers: [] } });
const rec = (clase, extra) => Object.assign({ clase, severidad: clase === 'mejora' ? 'info' : 'warning', texto: `texto ${clase}`, resultado: `resultado ${clase}`, reglaIds: [], fuentes: ['content'], campos: [] }, extra || {});

/* ---------- Estado visual derivado ---------- */
test('ux: estado BORRADOR sin datos, sin guardar o con cambios', () => {
  const a = assess(complete);
  assert.equal(U.deriveStatus(a, { hasData: false }).key, 'BORRADOR');
  const unsaved = U.deriveStatus(a, { hasData: true, saved: false });
  assert.equal(unsaved.key, 'BORRADOR');
  assert.match(unsaved.why, /Aún no está guardado/);
  assert.match(U.deriveStatus(a, { hasData: true, saved: false, editing: true }).why, /cambios sin guardar/);
  assert.equal(U.deriveStatus(a, { hasData: true, saved: false }).canApprove, false);
});

test('ux: producto completo guardado queda LISTO_PARA_APROBACION y se puede aprobar', () => {
  const st = U.deriveStatus(assess(complete), { hasData: true, saved: true });
  assert.equal(st.key, 'LISTO_PARA_APROBACION');
  assert.equal(st.canApprove, true);
  assert.equal(st.canRevoke, false);
});

test('ux: producto bloqueado en Magento queda BLOQUEADO y no se puede aprobar', () => {
  const st = U.deriveStatus(assess(noSku), { hasData: true, saved: true });
  assert.equal(st.key, 'BLOQUEADO');
  assert.equal(st.canApprove, false);
  assert.equal(st.tone, 'bad');
});

test('ux: BLOQUEADO tiene prioridad aunque estuviera aprobado', () => {
  assert.equal(U.deriveStatus(assess(noSku), { hasData: true, saved: true, approved: true }).key, 'BLOQUEADO');
});

test('ux: error de contenido deja EN_REVISION y IA sin confirmar también', () => {
  const bad = U.deriveStatus(assess(contradiction), { hasData: true, saved: true });
  assert.equal(bad.key, 'EN_REVISION');
  assert.match(bad.why, /error/);
  const ai = U.deriveStatus(assess(complete), { hasData: true, saved: true, humanReview: ['marca'] });
  assert.equal(ai.key, 'EN_REVISION');
  assert.match(ai.why, /IA/);
});

test('ux: APROBADO solo si está guardado y aprobado', () => {
  const a = assess(complete);
  const st = U.deriveStatus(a, { hasData: true, saved: true, approved: true });
  assert.equal(st.key, 'APROBADO');
  assert.equal(st.canRevoke, true);
  assert.equal(U.deriveStatus(a, { hasData: true, saved: false, approved: true }).key, 'BORRADOR');
});

test('ux: los cinco estados existen con ícono y texto (no dependen del color)', () => {
  assert.deepEqual(Object.keys(U.STATUS), ['BORRADOR', 'EN_REVISION', 'LISTO_PARA_APROBACION', 'APROBADO', 'BLOQUEADO']);
  for (const s of Object.values(U.STATUS)) { assert.ok(s.icon && s.label && s.tone); }
});

/* ---------- Flujo ---------- */
test('ux: el flujo CAPTURAR → … → EXPORTAR marca un solo paso actual', () => {
  assert.deepEqual(U.STEPS.map(s => s.key), ['capturar', 'validar', 'corregir', 'comprender', 'aprobar', 'exportar']);
  const a = assess(complete);
  const steps = U.stepOf(U.deriveStatus(a, { hasData: true, saved: true }), a, { hasData: true });
  assert.equal(steps.filter(s => s.state === 'current').length, 1);
  assert.equal(steps.find(s => s.state === 'current').key, 'aprobar');
  assert.equal(U.stepOf({ key: 'BORRADOR' }, {}, { hasData: false })[0].state, 'current');
  const ap = U.stepOf(U.STATUS.APROBADO, a, { hasData: true });
  assert.equal(ap.find(s => s.state === 'current').key, 'exportar');
});

/* ---------- Resumen superior ---------- */
test('ux: resumen de «cosas que requieren atención» y bloqueos', () => {
  const c = U.summaryCounts(assess(noSku));
  assert.ok(c.blockers >= 1);
  assert.match(U.attentionText(c), /bloqueo/);
  assert.equal(U.attentionText({ blockers: 0, attention: 3, improvements: 0 }), '3 cosas requieren atención');
  assert.equal(U.attentionText({ blockers: 1, attention: 1, improvements: 0 }), '1 cosa requiere atención · 1 bloqueo');
  assert.equal(U.attentionText({ blockers: 0, attention: 0, improvements: 0 }), 'Nada requiere atención.');
  assert.match(U.attentionText({ blockers: 0, attention: 0, improvements: 2 }), /2 mejoras opcionales/);
});

/* ---------- Qué hacer ahora ---------- */
test('ux: qué hacer ahora respeta la prioridad bloqueo > error > inconsistencia > faltante > revisión humana > SEO > contenido > mejora', () => {
  const order = ['bloqueo', 'error', 'contradiccion', 'faltante', 'humana', 'seo', 'contenido', 'mejora'];
  assert.deepEqual(order.map(k => U.CLASS_RANK[k]), [1, 2, 3, 4, 5, 6, 7, 8]);
  const classes = order.filter(k => k !== 'humana');
  const mixed = classes.map(k => rec(k)).reverse();
  for (let i = 0; i < classes.length; i++) {
    const expected = classes[i];
    const sub = mixed.filter(r => U.CLASS_RANK[r.clase] >= U.CLASS_RANK[expected]);
    assert.equal(U.nextBestAction(fake(sub), { CATS: F.CATS, cat: 'med', values: med }).clase, expected);
  }
});

test('ux: la revisión humana (IA sin confirmar) va después de los faltantes y antes de SEO', () => {
  const ctx = { CATS: F.CATS, cat: 'med', values: med, humanReview: ['marca'] };
  assert.equal(U.nextBestAction(fake([rec('seo'), rec('contenido')]), ctx).clase, 'humana');
  assert.equal(U.nextBestAction(fake([rec('faltante'), rec('seo')]), ctx).clase, 'faltante');
  const n = U.nextBestAction(fake([rec('seo')]), ctx);
  assert.equal(n.target.kind, 'field');
  assert.equal(n.target.key, 'marca');
});

test('ux: sin pendientes no inventa acciones', () => {
  const n = U.nextBestAction(assess(complete), { CATS: F.CATS, cat: 'med', values: med });
  assert.equal(n.kind, 'listo');
  assert.equal(n.button, null);
});

test('ux: la acción dice qué cambiará al corregir', () => {
  const blocked = U.nextBestAction(assess(noSku), ctxOf(noSku));
  assert.equal(blocked.clase, 'bloqueo');
  assert.match(blocked.impacto, /Magento podrá exportar/);
  assert.equal(blocked.button, 'Corregir');
  const pts = U.nextBestAction(fake([rec('seo', { puntos: 4 })]), { CATS: F.CATS, cat: 'med', values: med });
  assert.match(pts.impacto, /recuperas hasta 4 puntos/);
});

test('ux: con un producto real, la acción apunta a un campo que existe en el formulario', () => {
  const n = U.nextBestAction(assess(contradiction), ctxOf(contradiction));
  assert.equal(n.clase, 'contradiccion');
  assert.equal(n.target.kind, 'field');
  assert.ok(F.CATS.med.fields.some(f => f.key === n.target.key));
  assert.ok(['forma', 'via'].includes(n.target.key));
});

/* ---------- Navegación al campo ---------- */
test('ux: cada hallazgo de un producto con problemas tiene un destino', () => {
  for (const it of [noSku, contradiction, { sku: 'Z', cat: 'med', v: { marca: 'X', concentracion: '10 mg', forma: 'Tableta', contenido: 'TAB', laboratorio: 'N/A', via: 'Oral', receta: 'si', leyenda: 'Cura todo' } }]) {
    const a = assess(it);
    assert.ok(a.s360.recommendations.length > 0);
    for (const r of a.s360.recommendations) {
      const t = U.targetFor(r, ctxOf(it));
      assert.ok(t && t.kind, JSON.stringify(r.reglaIds));
      if (t.kind === 'field') assert.ok(F.CATS[it.cat].fields.some(f => f.key === t.key), t.key);
    }
  }
});

test('ux: SKU, imagen, campos, salidas y ajustes tienen destino distinto', () => {
  const ctx = { CATS: F.CATS, cat: 'med', values: med };
  assert.equal(U.targetFor({ reglaIds: ['MR-001'], fuentes: ['magento'] }, ctx).kind, 'sku');
  assert.equal(U.targetFor({ reglaIds: ['MR-012'], fuentes: ['magento'] }, ctx).kind, 'img');
  assert.equal(U.targetFor({ reglaIds: ['COH-C01'], fuentes: ['content'] }, ctx).key, 'forma');
  const md = U.targetFor({ reglaIds: ['MD-003'], fuentes: ['seo'] }, ctx);
  assert.equal(md.kind, 'output'); assert.equal(md.tab, 'meta'); assert.equal(md.anchor, '#meta-md');
  assert.equal(U.targetFor({ reglaIds: ['MR-010'], fuentes: ['magento'] }, ctx).kind, 'settings');
  assert.equal(U.targetFor({ reglaIds: ['XYZ-1'], fuentes: ['health'] }, ctx).kind, 'axis');
  assert.equal(U.targetFor(null, ctx), null);
});

test('ux: los claims llevan al campo que contiene el término', () => {
  const v = { ...med, leyenda: 'Cura todo' };
  const t = U.targetFor({ reglaIds: ['CLM-001'], terminos: ['cura'], fuentes: ['content'] }, { CATS: F.CATS, cat: 'med', values: v });
  assert.equal(t.kind, 'field'); assert.equal(t.key, 'leyenda');
});

/* ---------- Indicadores por campo ---------- */
test('ux: los indicadores usan ícono + texto, no solo color', () => {
  assert.deepEqual(Object.values(U.FIELD_STATE).map(x => x.icon), ['✓', '⚠', '❌', 'ℹ', '○']);
  assert.deepEqual(Object.values(U.FIELD_STATE).map(x => x.label), ['Correcto', 'Revisar', 'Error', 'Información', 'Pendiente']);
});

test('ux: estados por campo para un producto con contradicción', () => {
  const a = assess(contradiction);
  const st = U.fieldStates(a, ctxOf(contradiction));
  assert.equal(st.forma.key, 'bad');
  assert.equal(st.via.key, 'bad');
  assert.equal(st.marca.key, 'ok');
  assert.ok(st.forma.issues.length > 0);
  assert.ok(st.forma.issues[0].que && st.forma.issues[0].accion, 'cada problema explica qué pasa y qué hacer');
  assert.equal(st.receta, undefined, 'los select no llevan indicador');
});

test('ux: campo requerido vacío queda Pendiente y opcional vacío no muestra nada', () => {
  const it = { sku: 'A', cat: 'med', v: { marca: 'X' } };
  const st = U.fieldStates(assess(it), ctxOf(it));
  assert.ok(Object.values(st).some(s => s.key === 'pending' || s.key === 'bad'));
  assert.equal(st.volumen, undefined);
});

/* ---------- Dónde se usa cada dato ---------- */
test('ux: «este dato alimenta estos campos» sale de la plantilla real', () => {
  const res = F.computeFor('med', med, keep, meta);
  const ctx = { CATS: F.CATS, cat: 'med', titleKeys: U.titleKeysOf(res), metaKeys: U.metaKeysOf(meta, 'med') };
  const u = U.usageOf('contenido', ctx);
  assert.deepEqual(u.used, ['Título', 'Descripción', 'Magento', 'SEO']);
  assert.match(U.usageText(u), /Título · Descripción/);
  assert.ok(U.usageOf('marca', ctx).used.includes('Meta'));
  assert.deepEqual(U.usageOf('inexistente', ctx).used, []);
  assert.equal(U.usageText(U.usageOf('inexistente', ctx)), 'Aún no alimenta ningún texto');
});

/* ---------- Origen ---------- */
test('ux: origen del dato (manual, IA, imagen, importación, normalización)', () => {
  assert.equal(U.originOf('marca', {}).text, 'captura manual');
  assert.equal(U.originOf('marca', { aiFlags: { marca: 'sugerido' } }).text, 'IA sugerida');
  assert.equal(U.originOf('marca', { aiFlags: { marca: 'imagen' } }).text, 'IA leída de foto');
  assert.equal(U.originOf('marca', { aiFlags: { marca: 'confirmado' } }).text, 'IA confirmada');
  assert.equal(U.originOf('marca', { provenance: { marca: { source: 'csv' } } }).text, 'importación CSV');
  assert.equal(U.originOf('marca', { provenance: { marca: { source: 'connector' } } }).text, 'conector');
  const res = F.computeFor('med', med, keep, meta);
  const label = F.CATS.med.fields.find(f => f.key === 'contenido').label;
  const o = U.originOf('contenido', { changes: res.vt.changes, label });
  assert.ok(o.normalized, 'la presentación «30» se interpreta');
  assert.match(o.normalized.to, /30 piezas/);
});

/* ---------- Guardado ---------- */
test('ux: estado de guardado (guardado, guardando, error, sin guardar)', () => {
  assert.equal(U.effectiveSave('guardado', false).label, 'Guardado');
  assert.equal(U.effectiveSave('guardando', false).label, 'Guardando…');
  assert.equal(U.effectiveSave('error', false).label, 'Error al guardar');
  assert.equal(U.effectiveSave('guardado', true).label, 'Cambios sin guardar');
  assert.equal(U.effectiveSave('error', true).label, 'Error al guardar', 'el error no se oculta');
  assert.equal(U.effectiveSave('sin_cambios', false).key, 'sin_cambios');
});

/* ---------- Aprobación derivada ---------- */
test('ux: la aprobación vale solo para los datos aprobados', () => {
  const it = { id: 'p1', sku: 'A1', cat: 'med', v: { ...med }, img: '' };
  const ev = (action, item) => ({ action, details: { itemId: item.id, sig: U.itemSig(item) } });
  assert.equal(U.isApproved([], it), false);
  const audit = [ev('producto_aprobado', it)];
  assert.equal(U.isApproved(audit, it), true);
  assert.equal(U.isApproved(audit, { ...it, v: { ...med, contenido: '31' } }), false, 'al cambiar un dato se retira sola');
  assert.equal(U.isApproved(audit, { ...it, sku: 'A2' }), false);
  assert.equal(U.isApproved(audit.concat(ev('aprobacion_retirada', it)), it), false);
  assert.equal(U.isApproved(audit.concat(ev('aprobacion_retirada', it), ev('producto_aprobado', it)), it), true);
  assert.equal(U.isApproved(audit, { ...it, id: 'otro' }), false);
  assert.equal(U.isApproved(audit, { ...it, v: { ...med, laboratorio: '  Genomma ' } }), true, 'espacios no cuentan como cambio');
});

/* ---------- Historial ---------- */
test('ux: historial de cambios con antes, después y origen; edita el mismo campo sin llenar la lista', () => {
  let log = [];
  log = U.recordChange(log, { field: 'marca', label: 'Marca', before: '', after: 'T', origin: 'captura manual', at: '1' });
  log = U.recordChange(log, { field: 'marca', label: 'Marca', before: 'T', after: 'Te', origin: 'captura manual', at: '2' });
  log = U.recordChange(log, { field: 'marca', label: 'Marca', before: 'Te', after: 'Tempra', origin: 'captura manual', at: '3' });
  assert.equal(log.length, 1);
  assert.deepEqual([log[0].before, log[0].after, log[0].origin], ['', 'Tempra', 'captura manual']);
  log = U.recordChange(log, { field: 'contenido', label: 'Presentación', before: '30', after: '31', origin: 'IA sugerida', at: '4' });
  assert.equal(log.length, 2);
  assert.equal(U.recordChange(log, { field: 'x', before: 'a', after: 'a' }).length, 2, 'sin cambio real no se agrega');
  const back = U.recordChange([{ field: 'marca', label: 'Marca', before: 'A', after: 'B', origin: 'm', at: '1' }], { field: 'marca', before: 'B', after: 'A', at: '2' });
  assert.equal(back.length, 0, 'volver al valor original elimina el cambio');
  let many = []; for (let i = 0; i < 80; i++) many = U.recordChange(many, { field: 'f' + i, before: '', after: 'x', at: String(i) }, 50);
  assert.equal(many.length, 50);
});

/* ---------- Navegación contextual ---------- */
test('ux: alertas contextuales «Hay N problemas en SEO» y «Magento bloqueado»', () => {
  const a = assess(noSku);
  const alerts = U.contextAlerts(a, ctxOf(noSku));
  const mg = alerts.find(x => x.axis === 'magento');
  assert.ok(mg);
  assert.equal(mg.button, 'Ver bloqueos');
  assert.equal(mg.action.kind, 'axis');
  const b = assess({ sku: 'A', cat: 'med', v: { marca: 'X', concentracion: '10 mg', forma: 'Tableta', contenido: 'TAB', laboratorio: 'L', via: 'Oral', receta: 'si', leyenda: 'Cura todo' }, img: 'a.jpg' });
  const seo = U.contextAlerts(b, { CATS: F.CATS, cat: 'med', values: {} }).find(x => x.axis === 'seo');
  if (seo) { assert.match(seo.text, /problema/); assert.equal(seo.button, 'Revisar SEO'); }
  assert.deepEqual(U.contextAlerts(assess(complete), ctxOf(complete)).filter(x => x.axis === 'magento'), []);
});

/* ---------- Filtros del lote ---------- */
test('ux: filtros principales con datos reales detrás', () => {
  assert.deepEqual(Object.values(U.PRIMARY_FILTERS), ['Todos', 'Errores', 'Revisar', 'Listos', 'SEO', 'Contenido', 'Magento', 'Health', 'Score crítico']);
  const mk = it => { const a = assess(it); a.ux = U.deriveStatus(a, { hasData: true, saved: true }); return a; };
  const ok = mk(complete), blocked = mk(noSku), bad = mk(contradiction);
  assert.equal(U.passUx(ok, 'ux_listos'), true);
  assert.equal(U.passUx(blocked, 'ux_listos'), false);
  assert.equal(U.passUx(blocked, 'ux_errores'), true, 'bloqueado cuenta como error');
  assert.equal(U.passUx(bad, 'ux_errores'), true);
  assert.equal(U.passUx(bad, 'ux_revisar'), true);
  assert.equal(U.passUx(ok, 'ux_magento'), false, 'Magento READY no necesita revisión');
  assert.equal(U.passUx(mk({ ...complete, img: '' }), 'ux_magento'), true, 'Magento con advertencias sí');
  assert.equal(U.passUx(blocked, 'ux_magento'), true);
  assert.equal(U.passUx(ok, 'ux_critico'), false);
  assert.equal(U.passUx(ok, 'todos'), true);
  assert.equal(U.isUxFilter('seo_critico'), false, 'los filtros anteriores siguen en la app');
  assert.equal(U.passUx(ok, 'seo_critico'), true, 'un filtro ajeno no filtra aquí');
});

/* ---------- Errores y texto seguro ---------- */
test('ux: ningún mensaje al usuario contiene undefined, null, NaN ni [object Object]', () => {
  const BAD = /undefined|null|NaN|\[object Object\]/;
  for (const x of [undefined, null, NaN, {}, [], { a: 1 }, new Error('undefined'), 'null', 'valor NaN', new TypeError("Cannot read properties of undefined (reading 'x')"), { message: '[object Object]' }]) {
    assert.doesNotMatch(U.safeText(x, 'Listo.'), BAD, String(x));
    assert.doesNotMatch(U.friendlyError(x, 'guardar').message, BAD, String(x));
  }
  assert.equal(U.safeText(undefined, 'x'), 'x');
  assert.equal(U.safeText('Hola'), 'Hola');
  assert.equal(U.safeText(5), '5');
});

test('ux: errores técnicos se traducen a lenguaje comprensible y se conserva el detalle técnico aparte', () => {
  const abort = U.friendlyError(Object.assign(new Error('x'), { name: 'AbortError' }));
  assert.equal(abort.message, 'Acción cancelada.');
  assert.match(U.friendlyError(Object.assign(new Error('x'), { name: 'QuotaExceededError' })).message, /espacio de almacenamiento/);
  assert.match(U.friendlyError(new SyntaxError('Unexpected token')).message, /formato válido/);
  assert.match(U.friendlyError(new TypeError('Failed to fetch')).message, /conexión/);
  const tech = U.friendlyError(new TypeError("Cannot read properties of undefined (reading 'a')"), 'descargar');
  assert.equal(tech.message, 'No se pudo descargar. Intenta nuevamente.');
  assert.match(tech.technical, /Cannot read/);
  assert.equal(U.friendlyError(new Error('El respaldo no es válido.')).message, 'El respaldo no es válido.', 'los mensajes propios ya son legibles');
});

/* ---------- Rendimiento ---------- */
test('ux: el memo recalcula solo si cambia la firma', () => {
  let calls = 0;
  const m = U.makeMemo(x => String(x), x => { calls++; return { x }; });
  const a = m.get(1), b = m.get(1), c = m.get(2);
  assert.equal(a, b); assert.notEqual(a, c);
  assert.equal(calls, 2);
  assert.deepEqual(m.stats, { hits: 1, misses: 2 });
  m.reset(); m.get(2); assert.equal(calls, 3);
});

/* ---------- Accesibilidad (contraste real de la paleta) ---------- */
test('accesibilidad: el texto de la paleta cumple contraste AA (4.5:1)', () => {
  const css = fs.readFileSync(path.join(root, 'styles', 'styles.css'), 'utf8');
  const v = {}; for (const m of css.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{3,6})/g)) if (!(m[1] in v)) v[m[1]] = m[2];
  const pairs = [['ink', 'surface'], ['muted', 'surface'], ['muted', 'bg'], ['ink-muted', 'surface'], ['ink-muted', 'bg'], ['accent', 'surface'], ['ok-ink', 'ok-soft'], ['warn-ink', 'warn-soft'], ['bad-ink', 'bad-soft'], ['muted', 'warn-soft']];
  for (const [fg, bg] of pairs) assert.ok(U.contrast(v[fg], v[bg]) >= 4.5, `${fg} sobre ${bg}: ${U.contrast(v[fg], v[bg])}`);
  assert.ok(U.contrast('#FFFFFF', v['btn-dark']) >= 4.5);
});

test('accesibilidad: foco visible, salto al contenido, reducción de movimiento y regiones en vivo', () => {
  const css = fs.readFileSync(path.join(root, 'styles', 'styles.css'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(css, /:focus-visible\{outline:2px/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(html, /class="skip" href="#h-prod"/);
  assert.match(html, /id="ux-live"[^>]*aria-live="polite"/);
  assert.match(html, /id="toast" role="status" aria-live="polite"/);
  assert.match(html, /<nav class="mainnav"[^>]*aria-label="Secciones principales"/);
});

/* ---------- Navegación principal y botones ---------- */
test('navegación: las seis secciones principales existen y apuntan a una sección real', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const nav = [...html.matchAll(/data-nav="(\w+)"[^>]*>[\s\S]*?<span class="mnav-t">([^<]+)</g)].map(m => [m[1], m[2]]);
  assert.deepEqual(nav, [['captura', 'Captura'], ['validacion', 'Validación'], ['contenido', 'Contenido'], ['lote', 'Lote'], ['exportacion', 'Exportación'], ['config', 'Configuración']]);
  for (const id of ['h-prod', 'h-out', 'lote', 'exportar', 'prod-bar', 'prod-metrics', 'prod-guide', 'live', 'panel-eval']) assert.match(html, new RegExp(`id="${id}"`), id);
});

test('botones: todo botón del HTML tiene un handler y todo data-* generado tiene su manejador', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  const others = ['connector.js', 'ai.js', 'assist.js'].map(f => { try { return fs.readFileSync(path.join(root, 'js', f), 'utf8'); } catch (_) { return ''; } }).join('');
  const src = app + others;
  const camel = k => k.replace(/-(\w)/g, (_, c) => c.toUpperCase());
  const dead = [];
  for (const m of html.matchAll(/<button\b([^>]*)>/g)) {
    const id = (m[1].match(/\bid="([^"]+)"/) || [])[1], data = (m[1].match(/\bdata-([\w-]+)/) || [])[1];
    if (id && !id.startsWith('tab-') && !new RegExp(`['"#]${id}['"\\b]|getElementById\\('${id}'\\)`).test(src)) dead.push('id:' + id);
    else if (!id && data && !['tab', 'nav'].includes(data) && !new RegExp(`dataset\\.${camel(data)}\\b|data-${data}`).test(src)) dead.push('data:' + data);
  }
  assert.deepEqual(dead, []);
  for (const k of ['goto', 'evalgo', 'approve', 'revoke', 'toggle', 'fix', 'navGo', 'del', 'edit', 'filter', 'more']) assert.match(app, new RegExp(`dataset\\.${k}\\b`), k);
});

test('botones: copiar y descargar usan protección de doble clic y confirmación en acciones destructivas', () => {
  const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  for (const id of ['lote-copy', 'lote-dl', 'lote-backup', 'exp-copy', 'exp-dl']) assert.match(app, new RegExp(`\\$\\('#${id}'\\)\\.addEventListener\\('click', e => withBusy`), id);
  assert.match(app, /function confirmDialog/);
  for (const t of ['¿Eliminar este producto?', '¿Vaciar todo el lote?', '¿Restaurar este respaldo?', '¿Limpiar el formulario?']) assert.ok(app.includes(t), t);
  assert.doesNotMatch(app, /toast\(e\.message\)/, 'no se muestran mensajes técnicos crudos');
});

test('botones: el lote deshabilita las acciones cuando está vacío y muestra estados vacíos útiles', () => {
  const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  assert.match(app, /function syncLoteButtons/);
  for (const t of ['Todavía no hay productos en el lote.', 'No hay productos listos para exportar.', 'No hay conexiones configuradas.']) assert.ok(app.includes(t), t);
});

/* ---------- Móvil ---------- */
test('móvil: el lote se convierte en tarjetas, la navegación va abajo y los objetivos táctiles miden 44 px', () => {
  const css = fs.readFileSync(path.join(root, 'styles', 'styles.css'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(css, /@media \(max-width:720px\)/);
  assert.match(css, /table\.lote-table td\[data-label\]::before/);
  assert.match(css, /\.mainnav\{position:fixed;left:0;right:0;bottom:0/);
  assert.match(css, /\.btn,\.chip,\.tab,\.mnav\{min-height:44px\}/);
  assert.match(css, /font-size:16px/, 'evita el zoom automático de iOS/Android al enfocar un campo');
  assert.match(html, /name="viewport"/);
  const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  for (const label of ['SKU', 'Categoría', 'Título', 'Estado', 'Evaluación', 'Avisos']) assert.ok(app.includes(`data-label="${label}"`), label);
});
