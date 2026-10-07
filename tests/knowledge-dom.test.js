'use strict';
/* Fase 11: la interfaz de conocimiento ejecutada en jsdom (se omite si jsdom no está instalado). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, skip, wait } = require('./helpers/boot');
const BAD = /\bundefined\b|\bNaN\b|\[object Object\]|\bnull\b/;

const eng = a => a.w.__fichasKnowledge().engine;
async function until(fn, ms = 3000) { const t0 = Date.now(); for (;;) { let v; try { v = await fn(); } catch (_) { v = false; } if (v) return v; if (Date.now() - t0 > ms) throw new Error('until: tiempo agotado'); await wait(25); } }
const learned = async (a, n) => until(async () => (await eng(a).stats()).products === undefined && (await eng(a).stats()).byType.product >= n);
const nav = async (a) => { a.d.querySelector('[data-nav="conocimiento"]').click(); await until(() => a.d.querySelector('#k-results .kcard, #k-results .empty-state')); };
const lastToast = a => a.d.getElementById('toast').textContent;

test('conocimiento UI: la sección existe, tiene su navegación y avisa dónde se guarda', { skip }, async () => {
  const a = boot();
  assert.ok(a.d.getElementById('conocimiento'));
  assert.equal(a.d.querySelector('[data-nav="conocimiento"] .mnav-t').textContent, 'Conocimiento');
  await until(() => /solo vivirá en esta sesión/.test(a.text('#k-status')));
  assert.match(a.text('#k-status'), /IndexedDB/);
  assert.equal(a.d.querySelector('#k-status').className.includes('note--warn'), true);
  assert.deepEqual(a.errors, []);
});

test('conocimiento UI: al guardar un producto la aplicación aprende', { skip }, async () => {
  const a = boot();
  a.addMed('A1', 'Tempra', '30');
  await learned(a, 1);
  const s = await eng(a).stats();
  assert.ok(s.byType.brand >= 1 && s.byType.laboratory >= 1 && s.byType.substance >= 1);
  assert.ok(s.relationships > 5); assert.ok(s.evidence > 5);
  await nav(a);
  assert.match(a.text('#k-stats'), /Entidades\s*\d+/);
  assert.ok(a.d.querySelectorAll('#k-results .kcard').length > 3);
  assert.match(a.text('#k-results'), /Marca: Tempra/);
  assert.match(a.text('#k-results'), /Observado/);
  assert.doesNotMatch(a.d.getElementById('conocimiento').textContent, BAD);
});

test('conocimiento UI: confirmar, ver evidencia («¿por qué lo sabe?») y rechazar', { skip }, async () => {
  const a = boot();
  a.addMed('A1', 'Tempra', '30'); await learned(a, 1); await nav(a);
  a.fill('k-type', 'brand'); a.fill('k-q', 'tempra'); await until(() => a.d.querySelectorAll('#k-results .kcard').length === 1);
  const card = () => a.d.querySelector('#k-results .kcard');
  assert.match(card().textContent, /Observado/);
  card().querySelector('[data-kconfirm]').click();
  await until(() => /Confirmado/.test(card().textContent));
  assert.match(lastToast(a), /Confirmado/);
  assert.match(card().textContent, /1 confirmación\(es\)/);
  card().querySelector('[data-kwhy]').click();
  await until(() => card().querySelector('.kwhy'));
  const why = card().querySelector('.kwhy').textContent;
  assert.match(why, /¿Por qué la aplicación sabe esto\?/); assert.match(why, /fue confirmado 1 vez/); assert.match(why, /no existen conflictos/); assert.match(why, /confianza = puntos a favor/); assert.match(why, /Evidencia \(\d+\)/);
  assert.equal(card().querySelector('[data-kwhy]').getAttribute('aria-expanded'), 'true');
  card().querySelector('[data-kreject]').click();
  await until(() => /1 rechazo\(s\)/.test(card().textContent));
  assert.match(lastToast(a), /evidencia negativa/);
  assert.match(card().textContent, /Confianza (\d+) %/);
  assert.ok(Number(card().textContent.match(/Confianza (\d+) %/)[1]) < 62, 'el rechazo baja la confianza y no borra nada');
  assert.ok(card(), 'el registro sigue visible');
  assert.doesNotMatch(a.d.getElementById('conocimiento').textContent, BAD);
});

test('conocimiento UI: la relación marca → laboratorio se sugiere en el formulario y «Usar» la confirma', { skip }, async () => {
  const a = boot();
  a.addMed('A1', 'Tempra', '30'); await learned(a, 1);
  a.fillMed('Tempra', '30', 'A2', { laboratorio: '' });
  await until(() => a.d.querySelector('#fm-laboratorio [data-ksug]'));
  const hint = a.text('#fm-laboratorio');
  assert.match(hint, /Sugerir|Corrección asistida/); assert.match(hint, /Genomma/); assert.match(hint, /Tempra se relaciona con Genomma/);
  assert.match(a.text('#fm-marca'), /Visto antes: Tempra/);
  a.d.querySelector('#fm-laboratorio [data-ksug]').click();
  await until(() => a.d.getElementById('f-laboratorio').value === 'Genomma');
  await until(() => /confirmación tuya/.test(lastToast(a)));
  const rid = a.w.eval("window.FichasKnowledge.relIdFor('brand:tempra','brand→laboratory','laboratory:genomma')");
  const rel = await eng(a).why(rid); assert.equal(rel.record.evidenceBy.confirmed, 1);
});

test('conocimiento UI: una inconsistencia aparece como recomendación de Health y «No» registra evidencia negativa', { skip }, async () => {
  const a = boot();
  a.addMed('A1', 'Tempra', '30'); await learned(a, 1);
  a.fillMed('Tempra', '30', 'A2', { laboratorio: 'Otro Lab' });
  await until(() => a.d.querySelector('#fm-laboratorio [data-kno]'));
  assert.match(a.text('#fm-laboratorio'), /Tempra figura con Genomma, pero se capturó Otro Lab/);
  await until(() => /figura con Genomma/.test(a.text('#prod-guide')));
  assert.match(a.text('#prod-guide .nba'), /figura con Genomma|Revisa el dato/);
  a.d.querySelector('#fm-laboratorio [data-kno]').click();
  await until(() => /no volveré a sugerir/.test(lastToast(a)));
  const rid = a.w.eval("window.FichasKnowledge.relIdFor('brand:tempra','brand→laboratory','laboratory:genomma')");
  await until(async () => (await eng(a).why(rid)).record.evidenceBy.rejected === 1);
  assert.doesNotMatch(a.text('#fm-laboratorio'), /\[data-kno\]/);
});

test('conocimiento UI: un conflicto lo resuelve una persona', { skip }, async () => {
  const a = boot();
  a.addMed('A1', 'Marca X', '30', { laboratorio: 'Laboratorio Y' }); a.addMed('A2', 'Marca X', '30', { laboratorio: 'Laboratorio Z' });
  await until(async () => (await eng(a).listConflicts()).length === 1);
  await nav(a);
  await until(() => a.d.querySelectorAll('#k-conflicts .kcard').length === 1);
  const t = a.text('#k-conflicts'); assert.match(t, /Marca X → ¿cuál es correcto\?/); assert.match(t, /Laboratorio Y/); assert.match(t, /Laboratorio Z/); assert.match(t, /no elige sola/);
  assert.equal(a.d.querySelectorAll('#k-conflicts [data-kresolve]').length, 2);
  a.d.querySelector('#k-conflicts [data-kresolve]').click();
  await until(() => a.d.querySelectorAll('#k-conflicts .kcard').length === 0);
  assert.match(lastToast(a), /Conflicto resuelto/);
  assert.equal((await eng(a).listConflicts()).length, 0);
});

test('conocimiento UI: «30 pzas» se corrige con seguridad, queda registrado y se puede revertir', { skip }, async () => {
  const a = boot();
  a.addMed('A1', 'Tempra', '30 pzas');
  assert.match(lastToast(a), /Corrección segura: «30 pzas» → «30 piezas»/);
  assert.equal(JSON.parse(a.w.localStorage.getItem('fichas.lote.v1'))[0].v.contenido, '30 piezas');
  await until(async () => (await eng(a).listCorrections()).length === 1);
  const [c] = await eng(a).listCorrections(); assert.deepEqual([c.original, c.corrected, c.rule, c.kind], ['30 pzas', '30 piezas', 'seed.presentation.pzas→piezas', 'auto']);
  assert.ok(a.w.eval("JSON.stringify(window.__fichasKnowledge().engine.settings())").includes('"autoCorrect":true'));
  assert.ok(JSON.parse(a.w.localStorage.getItem('fichas.audit.v1')).some(e => e.action === 'AUTO_CORRECTION'), 'usa la auditoría existente');
  await nav(a); a.d.querySelector('#k-corr-box summary').click();
  await until(() => a.d.querySelector('[data-krevert]'));
  a.d.querySelector('[data-krevert]').click();
  await until(() => /revertida/.test(a.text('#k-corrections')));
  assert.match(lastToast(a), /valor original/);
  assert.equal(JSON.parse(a.w.localStorage.getItem('fichas.lote.v1'))[0].v.contenido, '30 pzas');
});

test('conocimiento UI: se puede desactivar la corrección segura', { skip }, async () => {
  const a = boot(); await nav(a);
  const box = a.d.getElementById('k-auto'); assert.equal(box.checked, true);
  box.checked = false; box.dispatchEvent(new a.w.Event('change', { bubbles: true }));
  await until(() => /Solo se sugerirá/.test(lastToast(a)));
  a.addMed('A1', 'Tempra', '30 pzas');
  assert.equal(JSON.parse(a.w.localStorage.getItem('fichas.lote.v1'))[0].v.contenido, '30 pzas', 'sin corrección automática el dato se guarda tal cual');
});

test('conocimiento UI: al corregir un dato guardado ofrece usarlo en productos similares', { skip }, async () => {
  const a = boot();
  a.addMed('A1', 'Tempra', '30', { forma: 'Tabs' }); await learned(a, 1);
  a.d.querySelector('[data-edit]').click();
  a.fill('f-forma', 'Tabletas'); a.d.getElementById('add').click();
  await until(() => a.d.getElementById('confirm-dlg'));
  assert.match(a.text('#confirm-dlg h3'), /productos similares/); assert.match(a.text('#confirm-dlg p'), /Tabs.*Tabletas/);
  await a.confirm(true);
  await until(async () => (await eng(a).findEntity('pharmaceuticalForm', 'Tabs')));
  assert.equal((await eng(a).findEntity('pharmaceuticalForm', 'Tabs')).entity.canonicalValue, 'Tabletas');
});

test('conocimiento UI: los datos críticos corregidos no se ofrecen para aprendizaje automático', { skip }, async () => {
  const a = boot();
  a.addMed('A1', 'Tempra', '30', { laboratorio: 'Lab A' }); await learned(a, 1);
  a.d.querySelector('[data-edit]').click();
  a.fill('f-laboratorio', 'Lab B'); a.d.getElementById('add').click();
  await wait(400);
  assert.equal(a.d.getElementById('confirm-dlg'), null, 'no pregunta por datos críticos');
  await nav(a); await until(() => /Es un dato crítico/.test(a.text('#k-rules')));
  assert.match(a.text('#k-rules'), /solo se sugerirá, nunca se aplicará sola/);
});

test('conocimiento UI: el respaldo del lote incluye el conocimiento y se restaura', { skip }, async () => {
  const a = boot();
  a.addMed('B1', 'Tempra', '30'); a.addMed('B2', 'Dolofin', '20', { principio: 'Ibuprofeno' }); await until(async () => (await eng(a).stats()).byType.brand >= 2);
  a.d.getElementById('lote-backup').click(); await wait(200);
  const data = JSON.parse(Buffer.from(await a.downloads.at(-1).arrayBuffer()).toString('utf8'));
  assert.equal(data.schema, 'fichas.lote-backup.v1'); assert.ok(data.knowledge); assert.equal(data.knowledge.schema, 'fichas.knowledge.v1'); assert.equal(data.knowledge.dbVersion, 1);
  for (const s of ['entities', 'aliases', 'relationships', 'evidence', 'corrections', 'conflicts']) assert.ok(s in data.knowledge.stores, s);
  const b = boot();
  const file = new b.w.File([JSON.stringify(data)], 'respaldo.json', { type: 'application/json' }); const input = b.d.getElementById('lote-restore');
  Object.defineProperty(input, 'files', { value: [file], configurable: true }); input.dispatchEvent(new b.w.Event('change', { bubbles: true }));
  await wait(200); assert.equal(b.count(), '2');
  await until(() => /Conocimiento: \d+ nuevos/.test(lastToast(b)));
  const s = await eng(b).stats(); assert.ok(s.byType.brand >= 2); assert.ok(s.evidence > 5);
  assert.equal((await eng(b).integrity()).ok, true);
});

test('conocimiento UI: un respaldo antiguo sin conocimiento reconstruye lo aprendido desde el lote', { skip }, async () => {
  const a = boot(); a.addMed('B1', 'Tempra', '30'); await wait(100);
  a.d.getElementById('lote-backup').click(); await wait(200);
  const data = JSON.parse(Buffer.from(await a.downloads.at(-1).arrayBuffer()).toString('utf8')); delete data.knowledge;
  const b = boot(); const file = new b.w.File([JSON.stringify(data)], 'r.json'); const input = b.d.getElementById('lote-restore');
  Object.defineProperty(input, 'files', { value: [file], configurable: true }); input.dispatchEvent(new b.w.Event('change', { bubbles: true }));
  await wait(200); await until(async () => (await eng(b).stats()).byType.brand >= 1);
  assert.equal(b.count(), '1');
});

test('conocimiento UI: respaldo y restauración del conocimiento por separado', { skip }, async () => {
  const a = boot(); a.addMed('B1', 'Tempra', '30'); await learned(a, 1); await nav(a);
  a.d.getElementById('k-backup').click(); await wait(200);
  const text = Buffer.from(await a.downloads.at(-1).arrayBuffer()).toString('utf8'); const data = JSON.parse(text);
  assert.equal(data.schema, 'fichas.knowledge.v1'); assert.ok(data.counts.entities > 3);
  const b = boot(); await nav(b);
  const restore = txt => { const f = new b.w.File([txt], 'k.json'); const i = b.d.getElementById('k-restore'); Object.defineProperty(i, 'files', { value: [f], configurable: true }); i.dispatchEvent(new b.w.Event('change', { bubbles: true })); };
  restore('{no es json'); await wait(100); assert.match(lastToast(b), /formato válido/);
  restore(JSON.stringify({ schema: 'otra.cosa' })); await wait(100); assert.match(lastToast(b), /no es un respaldo de conocimiento/);
  restore(text); await until(() => b.d.getElementById('confirm-dlg')); await b.confirm(true);
  await until(() => /Conocimiento restaurado/.test(lastToast(b)));
  assert.equal((await eng(b).stats()).entities, data.counts.entities);
  restore(text); await until(() => b.d.getElementById('confirm-dlg')); await b.confirm(true);
  await until(() => /0 nuevos/.test(lastToast(b)));
  assert.equal((await eng(b).stats()).entities, data.counts.entities, 'restaurar dos veces no duplica');
});

test('conocimiento UI: reiniciar y diccionario del usuario piden confirmación o validan', { skip }, async () => {
  const a = boot(); a.addMed('B1', 'Tempra', '30'); await learned(a, 1); await nav(a);
  a.d.getElementById('k-reset').click();
  assert.match(a.text('#confirm-dlg h3'), /Reiniciar el conocimiento/); await a.confirm(false);
  assert.ok((await eng(a).stats()).entities > 0);
  a.d.getElementById('k-reset').click(); await a.confirm(true);
  await until(async () => (await eng(a).stats()).entities === 0);
  assert.equal(a.count(), '1', 'el lote no se toca');
  a.d.getElementById('k-dict-add').click(); await wait(50); assert.match(lastToast(a), /al menos una equivalencia/);
  a.d.getElementById('k-dict-type').value = 'pharmaceuticalForm'; a.d.getElementById('k-dict-text').value = 'Tabs=Tabletas';
  a.d.getElementById('k-dict-add').click(); await until(() => /1 equivalencia/.test(lastToast(a)));
  assert.equal((await eng(a).findEntity('pharmaceuticalForm', 'Tabs')).entity.canonicalValue, 'Tabletas');
});

test('conocimiento UI: Cohere sin llave explica qué hacer y la integridad se puede verificar', { skip }, async () => {
  const a = boot(); a.addMed('B1', 'Tempra', '30'); await learned(a, 1); await nav(a);
  a.d.getElementById('k-ai').click(); await until(() => /llave de Cohere/.test(lastToast(a)));
  a.d.getElementById('k-integrity').click(); await until(() => /Integridad correcta/.test(lastToast(a)));
});

test('conocimiento UI: «Aprender del lote actual» no duplica y vacío muestra un estado útil', { skip }, async () => {
  const a = boot(); await nav(a);
  assert.match(a.text('#k-results'), /Todavía no hay conocimiento/);
  a.d.getElementById('k-learn').click(); await until(() => /El lote está vacío/.test(lastToast(a)));
  a.addMed('B1', 'Tempra', '30'); await learned(a, 1);
  const before = (await eng(a).stats()).evidence;
  a.d.getElementById('k-learn').click(); await until(() => /Se aprendió de 1 producto/.test(lastToast(a)));
  assert.equal((await eng(a).stats()).evidence, before);
});

test('conocimiento UI: eliminar un producto no borra lo aprendido; mantiene la auditoría de aprobación', { skip }, async () => {
  const a = boot(); a.addMed('B1', 'Tempra', '30'); await learned(a, 1);
  a.d.querySelector('#lote-body [data-approve]').click();
  a.d.querySelector('[data-del]').click(); await a.confirm(true);
  assert.equal(a.rows().length, 0); assert.ok((await eng(a).stats()).byType.brand >= 1);
  assert.ok(JSON.parse(a.w.localStorage.getItem('fichas.audit.v1')).some(e => e.action === 'KNOWLEDGE_CREATED'));
});

test('conocimiento UI: sin errores, texto limpio y controles accesibles', { skip }, async () => {
  const a = boot(); a.addMed('B1', 'Tempra', '30'); await learned(a, 1); await nav(a);
  assert.doesNotMatch(a.d.getElementById('conocimiento').textContent, BAD);
  for (const id of ['k-q', 'k-type', 'k-status-f', 'k-dict-type', 'k-dict-text']) assert.ok(a.d.querySelector(`label[for="${id}"]`), `label de ${id}`);
  assert.equal(a.d.querySelector('#k-results').getAttribute('aria-live'), 'polite');
  assert.equal(a.d.querySelector('#k-status').getAttribute('role'), 'status');
  for (const b of a.d.querySelectorAll('#conocimiento button')) assert.equal(b.getAttribute('type'), 'button', b.textContent);
  assert.deepEqual(a.errors, []);
});
