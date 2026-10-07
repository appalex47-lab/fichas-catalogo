'use strict';
/* Fase 11: motor de conocimiento (sin DOM, backend de memoria). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const KDB = require('../js/knowledge-db');
const K = require('../js/knowledge');

const make = (o) => { const events = []; const db = KDB.create({ backend: new KDB.MemoryBackend() }); const kb = K.create(Object.assign({ db, onAudit: (a, d) => events.push({ action: a, details: d }) }, o || {})); return { kb, db, events }; };
const med = (marca, lab, sku, over) => ({ id: 'id-' + sku, sku, cat: 'med', v: Object.assign({ marca, principio: 'Paracetamol', concentracion: '500 mg', forma: 'Tabletas', contenido: '30', laboratorio: lab, via: 'Oral', receta: 'no' }, over || {}) });
const ent = async (kb, type, value) => (await kb.findEntity(type, value) || {}).entity;
const actions = ev => ev.map(e => e.action);

/* ---------- identidad y modelo ---------- */
test('conocimiento: identidad, tipos y estados', () => {
  assert.equal(K.SCHEMA, 'fichas.knowledge.v1');
  assert.deepEqual(K.TYPES, ['substance', 'laboratory', 'brand', 'manufacturer', 'pharmaceuticalForm', 'concentration', 'unit', 'presentation', 'category', 'subcategory', 'product']);
  assert.deepEqual(Object.values(K.STATUS), ['observed', 'normalized', 'suggested', 'confirmed', 'inferred', 'trusted', 'rejected', 'conflicted']);
  assert.equal(K.idFor('brand', 'Marca X'), 'brand:marca-x');
  assert.equal(K.idFor('substance', 'Acetaminofén'), K.idFor('substance', 'acetaminofen'), 'acentos y mayúsculas no cambian la identidad');
  assert.equal(K.FIELD_TYPE.marca, 'brand');
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'knowledge.js'), 'utf8') + fs.readFileSync(path.join(__dirname, '..', 'js', 'knowledge-db.js'), 'utf8');
  assert.doesNotMatch(src, /Sentia/i, 'sin nombres de otros proyectos');
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'js', 'knowledge-db.js'), 'utf8'), /FP\.KnowledgeDB|root\.FP\.KnowledgeDB/);
});

test('conocimiento: cada registro conserva los campos del modelo', async () => {
  const { kb } = make(); await kb.observe(med('Marca X', 'Lab Y', 'A1'));
  const e = await ent(kb, 'brand', 'marca x');
  for (const k of ['id', 'type', 'canonicalValue', 'normalizedValue', 'aliases', 'status', 'confidence', 'evidenceCount', 'positiveEvidence', 'negativeEvidence', 'sources', 'createdAt', 'updatedAt', 'lastValidatedAt', 'version']) assert.ok(k in e, k);
  assert.equal(e.id, 'brand:marca-x'); assert.equal(e.canonicalValue, 'Marca X'); assert.equal(e.normalizedValue, 'marca x');
  assert.equal(e.status, 'observed'); assert.equal(e.evidenceCount, 1); assert.deepEqual(e.sources, ['manual']);
});

/* ---------- aprender de un producto ---------- */
test('aprender: un producto crea entidades de los once tipos aplicables y sus relaciones', async () => {
  const { kb } = make(); const r = await kb.observe(med('Tempra', 'Genomma', 'A1'));
  assert.equal(r.products, 1); assert.ok(r.created > 8);
  const s = await kb.stats();
  for (const t of ['brand', 'substance', 'laboratory', 'pharmaceuticalForm', 'concentration', 'presentation', 'category', 'product', 'unit']) assert.ok(s.byType[t] >= 1, t);
  assert.ok(s.relationships >= 8);
  const brand = await ent(kb, 'brand', 'Tempra');
  const labs = await kb.relationsFor(brand.id);
  assert.ok(labs.outgoing.some(r => r.predicate === 'brand→laboratory' && r.other === 'Genomma'));
});

test('aprender: lo observado nunca es verdad (OBSERVED ≠ TRUSTED) aunque aparezca muchas veces', async () => {
  const { kb } = make();
  for (let i = 0; i < 40; i++) await kb.observe(med('Tempra', 'Genomma', 'S' + i));
  const b = await ent(kb, 'brand', 'Tempra');
  assert.equal(b.status, 'observed'); assert.notEqual(b.status, 'trusted');
  assert.ok(b.confidence <= 0.7, `sin evidencia humana el tope es 0.70 (${b.confidence})`);
  assert.equal(b.evidenceBy.confirmed, 0);
  const few = make(); await few.kb.observe(med('Tempra', 'Genomma', 'S0'));
  const f = await ent(few.kb, 'brand', 'Tempra');
  assert.ok(b.confidence - f.confidence < 0.45, 'la frecuencia aporta poco y se satura');
});

test('aprender: es idempotente. El mismo producto no suma evidencia dos veces', async () => {
  const { kb } = make(); const it = med('Tempra', 'Genomma', 'A1');
  await kb.observe(it); const a = await ent(kb, 'brand', 'Tempra');
  await kb.observe(it); await kb.observe(it); const b = await ent(kb, 'brand', 'Tempra');
  assert.equal(b.evidenceBy.observed, 1); assert.equal(b.evidenceCount, a.evidenceCount);
});

test('aprender: editar un producto retira sus observaciones anteriores sin borrar evidencia', async () => {
  const { kb, db } = make(); await kb.observe(med('Tempra', 'Genomma', 'A1'));
  await kb.observe(med('Tempra', 'Otro Lab', 'A1'), { replace: true });
  const gen = await ent(kb, 'laboratory', 'Genomma'); const otro = await ent(kb, 'laboratory', 'Otro Lab');
  assert.equal(gen.evidenceBy.observed, 0); assert.equal(otro.evidenceBy.observed, 1);
  const ev = await db.byIndex('evidence', 'productRef', 'sku:a1');
  assert.ok(ev.some(e => e.superseded), 'la evidencia reemplazada se conserva marcada'); assert.ok(ev.length > 0);
});

/* ---------- evidencia, confianza y estados ---------- */
test('confianza: la confirmación humana pesa más que observar y lleva a CONFIRMED y TRUSTED con evidencia distinta', async () => {
  const { kb, events } = make(); await kb.observe(med('Tempra', 'Genomma', 'A1'));
  const id = 'brand:tempra'; const obs = (await ent(kb, 'brand', 'Tempra')).confidence;
  const c1 = (await kb.confirm(id, { productRef: 'p1' })).record;
  assert.equal(c1.status, 'confirmed'); assert.ok(c1.confidence > obs); assert.ok(c1.lastValidatedAt);
  const again = (await kb.confirm(id, { productRef: 'p1' })).record;
  assert.equal(again.status, 'confirmed', 'la misma confirmación repetida no basta para TRUSTED');
  const c2 = (await kb.confirm(id, { productRef: 'p2' })).record;
  assert.equal(c2.status, 'confirmed', 'dos confirmaciones aún no bastan para TRUSTED');
  await kb.confirm(id, { productRef: 'p3' }); const c4 = (await kb.confirm(id, { productRef: 'p4' })).record;
  assert.equal(c4.status, 'trusted'); assert.ok(c4.confidence >= 0.85);
  assert.ok(actions(events).includes('KNOWLEDGE_CONFIRMED'));
});

test('confianza: un rechazo es evidencia negativa, no borra y baja el estado', async () => {
  const { kb, events, db } = make(); await kb.observe(med('Tempra', 'Genomma', 'A1'));
  const before = await ent(kb, 'brand', 'Tempra');
  const r = (await kb.reject('brand:tempra', { note: 'no es' })).record;
  assert.equal(r.status, 'rejected'); assert.equal(r.negativeEvidence, 1); assert.ok(r.confidence < before.confidence);
  assert.ok(await db.get('entities', 'brand:tempra'), 'el registro sigue existiendo');
  assert.ok(actions(events).includes('KNOWLEDGE_REJECTED'));
  const ev = (await db.byIndex('evidence', 'targetId', 'brand:tempra')).filter(e => e.polarity === -1);
  assert.equal(ev.length, 1);
});

test('confianza: función documentada (puntos a favor ÷ (a favor + en contra + K), tope sin humano, conflicto y recencia)', () => {
  const base = { evidenceBy: { observed: 4, imported: 0, ai: 0, confirmed: 0, correction: 0, rejected: 0 }, confirmRefs: [], flags: {}, updatedAt: new Date().toISOString() };
  const c0 = K.confidenceOf(base); assert.ok(c0 <= K.CONF.NO_HUMAN_CAP);
  const humano = K.confidenceOf(Object.assign({}, base, { evidenceBy: Object.assign({}, base.evidenceBy, { confirmed: 2 }) })); assert.ok(humano > c0);
  const conflicto = K.confidenceOf(Object.assign({}, base, { evidenceBy: Object.assign({}, base.evidenceBy, { confirmed: 2 }), flags: { conflict: true } })); assert.ok(conflicto < humano);
  const rech = K.confidenceOf(Object.assign({}, base, { evidenceBy: Object.assign({}, base.evidenceBy, { confirmed: 2, rejected: 2 }) })); assert.ok(rech < humano);
  const viejo = K.confidenceOf(Object.assign({}, base, { evidenceBy: Object.assign({}, base.evidenceBy, { confirmed: 2 }), lastValidatedAt: '2020-01-01T00:00:00.000Z' })); assert.ok(viejo < humano, 'la recencia influye');
  const ia = K.confidenceOf({ evidenceBy: { observed: 0, imported: 0, ai: 50, confirmed: 0, correction: 0, rejected: 0 }, confirmRefs: [], flags: {}, updatedAt: new Date().toISOString() }); assert.ok(ia <= 0.2, 'la IA no vuelve verdad nada');
  assert.equal(K.confidenceOf({ ruleType: 'deterministic', evidenceBy: {}, flags: {} }), 1);
  assert.equal(K.confidenceOf({ evidenceBy: {}, confirmRefs: [], flags: {} }), 0, 'sin evidencia, confianza 0');
});

test('confianza: explicación («¿por qué la app sabe esto?») con motivos, desglose y fórmula; nunca solo un porcentaje', async () => {
  const { kb } = make();
  for (const sku of ['A1', 'A2', 'A3']) await kb.observe(med('Tempra', 'Genomma', sku));
  await kb.confirm('brand:tempra', { productRef: 'x1' }); await kb.confirm('brand:tempra', { productRef: 'x2' });
  const w = await kb.why('brand:tempra');
  assert.match(w.summary, /^\d+ %\. Tempra:/);
  assert.ok(w.because.some(l => /fue confirmado 2 veces/.test(l)));
  assert.ok(w.because.some(l => /apareció en 3 productos/.test(l)));
  assert.ok(w.because.some(l => /no existen conflictos/.test(l)));
  assert.ok(w.because.some(l => /validado manualmente/.test(l)));
  assert.ok(w.breakdown.length >= 2); assert.match(w.formula, /confianza = puntos a favor/);
  assert.ok(w.evidence.length > 0); assert.ok(w.evidenceTotal >= 5);
  const rel = await kb.why(K.relIdFor('brand:tempra', 'brand→laboratory', 'laboratory:genomma'));
  assert.match(rel.summary, /Tempra → Genomma/);
});

/* ---------- relaciones y conflictos ---------- */
test('relaciones: marca → laboratorio con evidencia positiva y negativa del usuario', async () => {
  const { kb } = make(); await kb.observe(med('Tempra', 'Genomma', 'A1'));
  const rid = K.relIdFor('brand:tempra', 'brand→laboratory', 'laboratory:genomma');
  const r1 = (await kb.confirm(rid, { productRef: 'u1' })).record;
  assert.equal(r1.status, 'confirmed'); assert.equal(r1.evidenceBy.confirmed, 1);
  const r2 = (await kb.reject(rid, { productRef: 'u2' })).record;
  assert.equal(r2.evidenceBy.rejected, 1); assert.equal(r2.negativeEvidence, 1);
  assert.ok(r2.confidence < r1.confidence);
});

test('conflictos: dos laboratorios para la misma marca NO se resuelven solos y se muestran con evidencia', async () => {
  const { kb, events } = make();
  await kb.observe(med('Marca X', 'Laboratorio Y', 'A1')); await kb.observe(med('Marca X', 'Laboratorio Y', 'A2'));
  const r = await kb.observe(med('Marca X', 'Laboratorio Z', 'A3'));
  assert.equal(r.conflicts, 1);
  const list = await kb.listConflicts(); assert.equal(list.length, 1);
  const d = await kb.conflictDetail(list[0].id);
  assert.equal(d.options.length, 2); assert.deepEqual(d.options.map(o => o.label).sort(), ['Laboratorio Y', 'Laboratorio Z']);
  for (const o of d.options) { assert.equal(o.status, 'conflicted'); assert.ok(o.why.because.length); assert.ok(o.lastAt); assert.ok('confidence' in o); }
  assert.ok(actions(events).includes('KNOWLEDGE_CONFLICT'));
  const a = await kb.assess(med('Marca X', 'Laboratorio Z', 'A9'));
  const mis = a.suggestions.find(s => s.field === 'laboratorio');
  assert.ok(!mis || mis.level === K.LEVELS.REVIEW, 'con conflicto, revisión obligatoria');
});

test('conflictos: lo resuelve una persona; la opción elegida se confirma y las demás reciben evidencia negativa', async () => {
  const { kb, events } = make();
  await kb.observe(med('Marca X', 'Laboratorio Y', 'A1')); await kb.observe(med('Marca X', 'Laboratorio Z', 'A2'));
  const [c] = await kb.listConflicts(); const d = await kb.conflictDetail(c.id);
  const chosen = d.options.find(o => o.label === 'Laboratorio Y');
  assert.equal((await kb.resolveConflict(c.id, 'no-existe')).ok, false);
  const r = await kb.resolveConflict(c.id, chosen.id); assert.equal(r.ok, true);
  assert.equal((await kb.listConflicts()).length, 0);
  const after = await kb.conflictDetail(c.id);
  const y = after.options.find(o => o.label === 'Laboratorio Y'), z = after.options.find(o => o.label === 'Laboratorio Z');
  assert.equal(y.status, 'confirmed'); assert.ok(z.evidenceBy.rejected >= 1); assert.ok(y.confidence > z.confidence);
  assert.ok(actions(events).includes('KNOWLEDGE_UPDATED'));
  await kb.observe(med('Marca X', 'Laboratorio Y', 'A3'));
  assert.equal((await kb.listConflicts()).length, 0, 'no se reabre mientras la elegida siga vigente');
});

test('conflictos: un alias que apunta a dos valores distintos también es un conflicto', async () => {
  const { kb } = make();
  await kb.addAlias('substance', 'acetaminofen', 'Paracetamol', { kind: 'confirmed' });
  const r = await kb.addAlias('substance', 'acetaminofen', 'Otra Sustancia', { kind: 'confirmed' });
  assert.equal(r.conflict, true); assert.equal((await kb.listConflicts()).length, 1);
});

/* ---------- sustancias, alias y equivalencias críticas ---------- */
test('alias: «pzas» → «piezas» y «acetaminofen» → «acetaminofén» con origen, evidencia, confianza y estado', async () => {
  const { kb } = make();
  const r = await kb.addAlias('substance', 'acetaminofen', 'Acetaminofén', { kind: 'observed', source: 'manual' });
  assert.equal(r.ok, true); assert.equal(r.alias.status, 'observed');
  for (const k of ['entityId', 'canonicalValue', 'sources', 'confidence', 'status', 'evidenceCount']) assert.ok(k in r.alias, k);
  assert.deepEqual(r.alias.sources, ['manual']);
  const f = await kb.findEntity('substance', 'acetaminofen'); assert.ok(f);
  assert.equal(f.entity.canonicalValue, 'Acetaminofén');
});

test('sustancias: Paracetamol y acetaminofén NO se asumen equivalentes por similitud textual', async () => {
  const { kb } = make();
  await kb.observe(med('Tempra', 'Genomma', 'A1'));
  assert.equal(await kb.findEntity('substance', 'acetaminofen'), null, 'sin equivalencia registrada no hay coincidencia');
  assert.equal(await kb.findEntity('substance', 'Paracetamol 500'), null);
  const a = await kb.assess(med('Tempra', 'Genomma', 'A2', { principio: 'Acetaminofén' }));
  assert.ok(!a.suggestions.some(s => s.field === 'principio' && s.to === 'Paracetamol'), 'no sugiere una equivalencia crítica sin evidencia');
  const sug = make(); await sug.kb.addAlias('substance', 'acetaminofen', 'Paracetamol', { kind: 'ai', source: 'ai' });
  const al = (await sug.kb.listAliases())[0]; assert.equal(al.status, 'suggested');
  const a2 = await sug.kb.assess(med('Tempra', 'Genomma', 'A3', { principio: 'acetaminofen' }));
  const s = a2.suggestions.find(x => x.field === 'principio'); if (s) assert.ok(s.level <= K.LEVELS.ASSISTED && s.critical);
});

test('alias: un diccionario del usuario cuenta como confirmado y es idempotente', async () => {
  const { kb } = make();
  const r = await kb.importDictionary('acetaminofen=Paracetamol\nTabs=Tabletas', 'substance');
  assert.equal(r.count, 2);
  const al = await kb.listAliases({ status: 'confirmed' }); assert.equal(al.length, 2);
  assert.equal((await kb.importDictionary('acetaminofen=Paracetamol\nTabs=Tabletas', 'substance')).skipped, true);
});

/* ---------- normalización: unidades, concentraciones y presentaciones ---------- */
test('unidades: valor y unidad se separan y normalizan', () => {
  assert.equal(K.normalizeUnit('pzas').canonical, 'piezas');
  assert.equal(K.normalizeUnit('ML').canonical, 'mL'); assert.equal(K.normalizeUnit('µg').canonical, 'mcg'); assert.equal(K.normalizeUnit('lt').canonical, 'L');
  assert.equal(K.normalizeUnit('xyz'), null);
  const c = K.parseConcentration('500 MG'); assert.deepEqual([c.value, c.unit, c.canonical], [500, 'mg', '500 mg']);
  assert.equal(K.parseConcentration('5 mg/mL').canonical, '5 mg/mL'); assert.equal(K.parseConcentration('5 %').canonical, '5 %'); assert.equal(K.parseConcentration('10,5 ml').value, 10.5);
});

test('concentraciones: no se mezclan con presentación, piezas ni contenido', async () => {
  assert.equal(K.parseConcentration('30 piezas'), null); assert.equal(K.parseConcentration('Caja con 30 tabletas'), null); assert.equal(K.parseConcentration('Tabletas'), null);
  const { kb } = make(); await kb.observe(med('Tempra', 'Genomma', 'A1', { concentracion: '30 piezas' }));
  assert.equal((await kb.stats()).byType.concentration, 0, 'lo que no es valor + unidad no es una concentración');
  const a = await kb.assess(med('Tempra', 'Genomma', 'A2', { concentracion: '30 piezas' }));
  assert.equal(a.fields.concentracion.state, 'unknown'); assert.match(a.fields.concentracion.note, /valor \+ unidad/);
});

test('presentaciones: «30» → «30 piezas», «30 pzas» → «30 piezas», «C/30» → «Caja con 30 piezas»; nunca se destruye el original', () => {
  const a = K.normalizePresentation('30'); assert.deepEqual([a.original, a.canonical], ['30', '30 piezas']);
  const b = K.normalizePresentation('30 pzas'); assert.deepEqual([b.original, b.normalized, b.canonical, b.rule, b.confidence], ['30 pzas', '30 pzas', '30 piezas', 'seed.presentation.pzas→piezas', 1]);
  assert.equal(K.normalizePresentation('C/30').canonical, 'Caja con 30 piezas');
  assert.equal(K.normalizePresentation('Caja con 4 plumas').canonical, 'Caja con 4 plumas');
  assert.equal(K.normalizePresentation('Frasco 30 mL').canonical, 'Frasco 30 mL');
  for (const t of ['30', '30 pzas', 'C/30', 'Caja con 4 plumas', 'Frasco 30 mL']) { const p = K.normalizePresentation(t); for (const k of ['original', 'normalized', 'canonical', 'rule', 'confidence']) assert.ok(k in p, k); assert.equal(p.original, t); }
});

/* ---------- niveles de corrección ---------- */
test('niveles: sugerir, asistida, autocorrección segura y revisión obligatoria', () => {
  assert.deepEqual(Object.values(K.LEVELS), [1, 2, 3, 4]);
  const seed = K.decideCorrection({ field: 'contenido', type: 'presentation', kind: 'seed' });
  assert.equal(seed.level, 3); assert.equal(seed.auto, true);
  assert.equal(K.decideCorrection({ field: 'contenido', type: 'presentation', kind: 'seed' }, { autoCorrect: false }).level, 2);
  assert.equal(K.decideCorrection({ field: 'contenido', type: 'presentation', kind: 'seed', reversible: false }).level, 2, 'si no es reversible no es automática');
  assert.equal(K.decideCorrection({ field: 'contenido', type: 'presentation', kind: 'seed', keepsOriginal: false }).level, 2);
  assert.equal(K.decideCorrection({ field: 'contenido', type: 'presentation', kind: 'seed', conflict: true }).level, 4, 'con conflicto, revisión');
  assert.equal(K.decideCorrection({ field: 'forma', type: 'pharmaceuticalForm', kind: 'ai', rec: { status: 'suggested', confidence: 0.5 } }).level, 1);
  const learned = K.decideCorrection({ field: 'forma', type: 'pharmaceuticalForm', kind: 'alias', rec: { status: 'confirmed', confidence: 0.93 } });
  assert.equal(learned.level, 3);
  assert.equal(K.decideCorrection({ field: 'forma', type: 'pharmaceuticalForm', kind: 'alias', rec: { status: 'observed', confidence: 0.5 } }).level, 1);
  assert.equal(K.decideCorrection({ field: 'forma', type: 'pharmaceuticalForm', kind: 'alias', rec: { status: 'confirmed', confidence: 0.7 } }).level, 2);
});

test('datos críticos: sustancias, concentraciones, marca/laboratorio y datos regulatorios jamás se autocorrigen', () => {
  for (const field of ['principio', 'concentracion', 'laboratorio', 'marca', 'receta', 'leyenda', 'precauciones', 'fps']) {
    const d = K.decideCorrection({ field, type: K.FIELD_TYPE[field] || 'brand', kind: 'alias', rec: { status: 'trusted', confidence: 0.99 } });
    assert.ok(d.level < 3, `${field} nivel ${d.level}`); assert.equal(d.critical, true); assert.equal(d.auto, false);
  }
  assert.equal(K.decideCorrection({ field: 'laboratorio', type: 'laboratory', kind: 'relation', rec: { status: 'trusted', confidence: 0.99 } }).auto, false);
  assert.equal(K.decideCorrection({ field: 'laboratorio', type: 'laboratory', kind: 'mismatch', rec: { status: 'trusted', confidence: 0.99 } }).level, 4);
  const { kb } = make(); kb.setSettings({ autoCorrect: true });
  const fixes = kb.safeCorrections({ cat: 'med', v: { principio: 'acetaminofen', concentracion: '500 MG', laboratorio: 'genomma', marca: 'TEMPRA', leyenda: 'cura', contenido: '30 pzas' } });
  assert.deepEqual(fixes.map(f => f.field), ['contenido'], 'solo la presentación (regla determinista) se corrige sola');
});

test('autocorrección segura: «30 pzas» → «30 piezas» conserva original, regla, motivo, confianza, conocimiento y es reversible', async () => {
  const { kb, events, db } = make(); const item = med('Tempra', 'Genomma', 'A1', { contenido: '30 pzas' });
  const fixes = kb.safeCorrections(item); assert.equal(fixes.length, 1);
  const f = fixes[0]; assert.deepEqual([f.original, f.corrected, f.rule, f.confidence, f.level], ['30 pzas', '30 piezas', 'seed.presentation.pzas→piezas', 1, 3]);
  assert.ok(f.reason && f.knowledgeId);
  const fixed = kb.applyCorrections(item.v, fixes); assert.equal(fixed.contenido, '30 piezas'); assert.equal(item.v.contenido, '30 pzas', 'applyCorrections no muta el original');
  const [c] = await kb.commitCorrections(fixes, item);
  for (const k of ['original', 'corrected', 'reason', 'rule', 'knowledgeId', 'confidence', 'createdAt']) assert.ok(k in c, k);
  assert.equal(c.status, 'applied'); assert.ok(actions(events).includes('AUTO_CORRECTION'));
  const rv = await kb.revertCorrection(c.id); assert.equal(rv.ok, true); assert.equal((await db.get('corrections', c.id)).status, 'reverted');
  assert.equal((await kb.revertCorrection(c.id)).ok, false, 'no se revierte dos veces');
  assert.equal((await kb.revertCorrection('nope')).ok, false);
});

test('autocorrección segura: volumen «ml» → «mL» y se puede desactivar', async () => {
  const { kb } = make();
  assert.equal(kb.safeCorrections({ cat: 'med', v: { volumen: '5 ml' } })[0].corrected, '5 mL');
  assert.equal(kb.safeCorrections({ cat: 'med', v: { volumen: '5 mL' } }).length, 0);
  await kb.setSettings({ autoCorrect: false }); const st = kb.settings(); assert.equal(st.autoCorrect, false);
});

test('autocorrección aprendida: un alias confirmado por una persona corrige formas no sensibles', async () => {
  const { kb } = make();
  assert.equal(kb.safeCorrections({ cat: 'med', v: { forma: 'Tabs' } }).length, 0, 'sin conocimiento no corrige');
  await kb.addAlias('pharmaceuticalForm', 'Tabs', 'Tabletas', { kind: 'confirmed', source: 'user', productRef: 'a' });
  assert.equal(kb.safeCorrections({ cat: 'med', v: { forma: 'Tabs' } }).length, 0, 'con una sola confirmación aún no corrige sola');
  for (const ref of ['b', 'c', 'd']) await kb.confirm('alias:pharmaceuticalForm:tabs', { productRef: ref });
  const fixes = kb.safeCorrections({ cat: 'med', v: { forma: 'Tabs' } });
  assert.equal(fixes.length, 1); assert.deepEqual([fixes[0].corrected, fixes[0].rule], ['Tabletas', 'learned.alias']);
  assert.equal(kb.safeCorrections({ cat: 'med', v: { forma: 'Tabletas' } }).length, 0);
  await kb.addAlias('substance', 'acetaminofen', 'Paracetamol', { kind: 'confirmed', source: 'user' });
  assert.equal(kb.safeCorrections({ cat: 'med', v: { principio: 'acetaminofen' } }).length, 0, 'una sustancia nunca se corrige sola');
});

/* ---------- aprender de las correcciones ---------- */
test('correcciones del usuario: registran la corrección puntual y una regla por decidir; las críticas no se aprenden solas', async () => {
  const { kb, events } = make();
  const r = await kb.recordManualCorrection({ field: 'forma', original: 'Tabs', corrected: 'Tabletas', item: med('X', 'Y', 'A1') });
  assert.equal(r.ok, true); assert.equal(r.critical, false); assert.equal(r.askSimilar, true); assert.ok(r.ruleId);
  assert.equal((await kb.listRules()).length, 1); assert.ok(actions(events).includes('MANUAL_CORRECTION'));
  assert.equal((await kb.findEntity('pharmaceuticalForm', 'Tabletas')).entity.evidenceBy.correction, 1);
  assert.equal(await kb.findEntity('pharmaceuticalForm', 'Tabs'), null, 'una corrección aislada no crea equivalencia por sí sola');
  const ok = await kb.resolveRule(r.ruleId, true); assert.equal(ok.ok, true);
  assert.equal((await kb.findEntity('pharmaceuticalForm', 'Tabs')).entity.canonicalValue, 'Tabletas');
  const crit = await kb.recordManualCorrection({ field: 'laboratorio', original: 'Laboratorio A', corrected: 'Laboratorio B', item: med('X', 'Y', 'A2') });
  assert.equal(crit.critical, true); assert.equal(crit.askSimilar, false);
  assert.equal((await kb.recordManualCorrection({ field: 'forma', original: 'a', corrected: 'a' })).ok, false);
  const no = await kb.recordManualCorrection({ field: 'forma', original: 'Caps', corrected: 'Cápsulas', item: med('X', 'Y', 'A3') });
  await kb.resolveRule(no.ruleId, false); assert.equal((await kb.listRules()).length, 1, 'solo queda por decidir la corrección crítica');
});

/* ---------- aprendizaje continuo ---------- */
test('aprendizaje continuo: de reconocer una marca a sugerir y a corregir de forma segura', async () => {
  const { kb } = make();
  await kb.observe(med('Marca X', 'Laboratorio Y', 'P1'));                       // producto 1: aprende Marca X
  assert.equal((await kb.assess(med('Marca X', '', 'P2'))).fields.marca.state, 'known');   // producto 2: reconoce Marca X
  await kb.observe(med('Marca X', 'Laboratorio Y', 'P2'));                       // producto 3: reconoce Marca X + Laboratorio Y
  const a3 = await kb.assess(med('Marca X', '', 'P3'));
  assert.equal(a3.suggestions.find(s => s.field === 'laboratorio').to, 'Laboratorio Y');
  const a4 = await kb.assess(med('Marca X', 'Laboratorio W', 'P4'));             // producto 4: detecta inconsistencia
  assert.equal(a4.checks.find(c => c.verdict === 'mismatch').expected, 'Laboratorio Y');
  assert.ok(a4.suggestions.some(s => s.kind === 'mismatch' && s.to === 'Laboratorio Y'));       // producto 5: sugiere corrección
  assert.ok(a4.suggestions.find(s => s.kind === 'mismatch').level >= 1);
  await kb.addAlias('pharmaceuticalForm', 'Tabs', 'Tabletas', { kind: 'confirmed', source: 'user', productRef: 'a' });
  for (const ref of ['b', 'c', 'd']) await kb.confirm('alias:pharmaceuticalForm:tabs', { productRef: ref });
  assert.equal(kb.safeCorrections(med('Marca X', 'Laboratorio Y', 'P6', { forma: 'Tabs' }))[0].corrected, 'Tabletas'); // producto 6: autocorrección segura
});

test('relaciones: la relación marca → laboratorio detecta cuando falta el laboratorio y cuando es otro', async () => {
  const { kb } = make(); await kb.observe(med('Tempra', 'Genomma', 'A1'));
  const miss = await kb.assess(med('Tempra', '', 'A2'));
  assert.equal(miss.suggestions.find(s => s.kind === 'fill').field, 'laboratorio');
  assert.ok(miss.suggestions.find(s => s.kind === 'fill').level <= 2, 'el laboratorio nunca se completa solo');
  const same = await kb.assess(med('Tempra', 'genomma', 'A3')); assert.equal(same.checks.find(c => c.predicate === 'brand→laboratory').verdict, 'match');
  const other = await kb.assess(med('Tempra', 'Laboratorio Nuevo', 'A4')); assert.equal(other.checks.find(c => c.predicate === 'brand→laboratory').verdict, 'mismatch', 'un laboratorio nunca visto para una marca conocida es una inconsistencia');
});

/* ---------- integración con Quality / Canonical ---------- */
test('Quality: desconocido → advertencia, contradictorio → revisión, solo cuando hay madurez', async () => {
  const { kb } = make(); await kb.observe(med('Tempra', 'Genomma', 'A1'));
  const a = await kb.assess(med('Tempra', 'Otro', 'A2'));
  const issues = kb.qualityIssues(a, f => f);
  assert.ok(issues.some(i => i.code === 'knowledge-mismatch' && i.field === 'laboratorio'));
  const none = await kb.assess(med('Marca Nueva', 'Lab Nuevo', 'A3'));
  assert.deepEqual(kb.qualityIssues(none, f => f), [], 'con poco conocimiento, lo nuevo no es una advertencia');
  const mature = make({}); await mature.kb.setSettings({ matureThreshold: 1 }); await mature.kb.observe(med('Tempra', 'Genomma', 'M1'));
  const un = await mature.kb.assess(med('Marca Rara', 'Lab Raro', 'M2'));
  assert.ok(kb.qualityIssues(un, f => f).some(i => i.code === 'knowledge-unknown'), 'con madurez, un dato desconocido es una advertencia');
  const strong = make(); await strong.kb.observe(med('Tempra', 'Genomma', 'S1')); await strong.kb.confirm(K.relIdFor('brand:tempra', 'brand→laboratory', 'laboratory:genomma'), { productRef: 'u1' }); await strong.kb.confirm(K.relIdFor('brand:tempra', 'brand→laboratory', 'laboratory:genomma'), { productRef: 'u2' });
  const st = await strong.kb.assess(med('Tempra', 'Otro', 'S2')); assert.equal(strong.kb.qualityIssues(st, f => f).find(i => i.code === 'knowledge-mismatch').severity, 'error');
});

test('Canonical: knownMap entrega el valor canónico conocido sin tocar el dato original', async () => {
  const { kb } = make(); await kb.addAlias('pharmaceuticalForm', 'Tabs', 'Tabletas', { kind: 'confirmed', source: 'user' });
  const item = med('Tempra', 'Genomma', 'A1', { forma: 'Tabs' }); const before = JSON.stringify(item);
  const map = kb.knownMap(await kb.assess(item));
  assert.equal(map.forma.canonical, 'Tabletas'); assert.equal(JSON.stringify(item), before);
});

/* ---------- Cohere ---------- */
test('Cohere: sugiere, pero no es la fuente de verdad (queda SUGGESTED y pide revisión)', async () => {
  const { kb, events } = make(); await kb.addAlias('substance', 'Paracetamol', 'Paracetamol', { kind: 'confirmed', source: 'user' }).catch(() => {});
  await kb.observe(med('Tempra', 'Genomma', 'A1')); await kb.observe(med('Tempra', 'Genomma', 'A2', { principio: 'Acetaminofen' }));
  let seen = null;
  const chat = async o => { seen = o; return { suggestions: [{ type: 'substance', alias: 'Acetaminofen', canonical: 'Paracetamol', reason: 'mismo fármaco' }, { type: 'substance', alias: 'Acetaminofen', canonical: 'Invento Total', reason: 'x' }, { type: 'brand', alias: 'Nada', canonical: 'Tempra' }] }; };
  const r = await kb.aiSuggestAliases({ items: [{ type: 'substance', value: 'Acetaminofen' }], chat, apiKey: 'k', model: 'm' });
  assert.equal(r.ok, true); assert.equal(r.created, 1); assert.ok(r.skipped >= 1, 'se descartan valores que no existen en el conocimiento');
  assert.equal(r.suggestions[0].status, 'suggested'); assert.equal(r.suggestions[0].critical, true);
  assert.equal(seen.temperature, 0); assert.ok(Array.isArray(seen.messages)); assert.equal(seen.apiKey, 'k', 'reutiliza la llave que recibe de la app');
  const al = (await kb.listAliases())[0]; assert.equal(al.status, 'suggested'); assert.ok(al.confidence <= 0.2, 'la IA no genera confianza');
  assert.ok(actions(events).includes('KNOWLEDGE_SUGGESTION'));
  const fixes = kb.safeCorrections(med('Tempra', 'Genomma', 'A3', { principio: 'Acetaminofen' })); assert.equal(fixes.length, 0, 'una sugerencia de IA nunca corrige sola');
  const bad = await kb.aiSuggestAliases({ items: [{ type: 'substance', value: 'Acetaminofen' }], chat: async () => { throw new Error('sin red'); }, apiKey: 'k' });
  assert.equal(bad.ok, false); assert.match(bad.error, /sin red/);
});

/* ---------- auditoría ---------- */
test('auditoría: usa la existente (onAudit) con las acciones del contrato y nunca rompe el aprendizaje', async () => {
  const { kb, events } = make(); await kb.observe(med('Tempra', 'Genomma', 'A1'));
  await kb.confirm('brand:tempra'); await kb.reject('substance:paracetamol');
  await kb.recordManualCorrection({ field: 'forma', original: 'Tabs', corrected: 'Tabletas', item: med('X', 'Y', 'A1') });
  const [c] = await kb.commitCorrections(kb.safeCorrections(med('T', 'G', 'A5', { contenido: '3 pzas' })), med('T', 'G', 'A5'));
  assert.ok(c);
  const set = new Set(actions(events));
  for (const a of ['KNOWLEDGE_CREATED', 'KNOWLEDGE_CONFIRMED', 'KNOWLEDGE_REJECTED', 'AUTO_CORRECTION', 'MANUAL_CORRECTION']) assert.ok(set.has(a), a);
  assert.deepEqual(Object.values(K.AUDIT).sort(), ['AUTO_CORRECTION', 'KNOWLEDGE_CONFIRMED', 'KNOWLEDGE_CONFLICT', 'KNOWLEDGE_CREATED', 'KNOWLEDGE_REJECTED', 'KNOWLEDGE_SUGGESTION', 'KNOWLEDGE_UPDATED', 'MANUAL_CORRECTION']);
  const boom = make({ onAudit: () => { throw new Error('auditoría caída'); } }); const r = await boom.kb.observe(med('Tempra', 'Genomma', 'A1')); assert.equal(r.ok, true);
});

/* ---------- edición, búsqueda, respaldo ---------- */
test('edición: ajusta mayúsculas y acentos; un nombre distinto se pide como alias (la identidad no cambia)', async () => {
  const { kb } = make(); await kb.observe(med('tempra', 'Genomma', 'A1', { principio: 'Acetaminofen' }));
  const r = await kb.edit('substance:acetaminofen', { canonicalValue: 'Acetaminofén' }); assert.equal(r.ok, true);
  assert.equal(r.record.canonicalValue, 'Acetaminofén'); assert.equal((await kb.findEntity('substance', 'acetaminofen')).entity.canonicalValue, 'Acetaminofén');
  assert.equal((await kb.edit('brand:tempra', { canonicalValue: 'Tempra' })).record.canonicalValue, 'Tempra');
  const other = await kb.edit('brand:tempra', { canonicalValue: 'Tempra Forte' }); assert.equal(other.ok, false); assert.match(other.error, /alias/);
  assert.equal((await kb.edit('brand:dolofin', { canonicalValue: '  ' })).ok, false);
  assert.equal((await kb.edit('brand:no-existe', { canonicalValue: 'X' })).ok, false);
});

test('búsqueda: por texto, tipo y estado, usando índices', async () => {
  const { kb, db } = make(); await kb.observe(med('Tempra', 'Genomma', 'A1')); await kb.observe(med('Dolofin', 'Pisa', 'A2', { principio: 'Ibuprofeno' }));
  assert.deepEqual((await kb.search({ text: 'temp' })).map(r => r.id), ['brand:tempra']);
  assert.ok((await kb.search({ text: 'ibup', type: 'substance' })).length === 1);
  assert.equal((await kb.search({ text: 'ibup', type: 'brand' })).length, 0);
  assert.ok((await kb.search({ status: 'observed' })).length > 3);
  assert.ok((await kb.search({})).length > 3);
  await kb.addAlias('brand', 'Tempra Max', 'Tempra', { kind: 'confirmed' }); assert.ok((await kb.search({ text: 'tempra max' })).some(r => r.id === 'brand:tempra'), 'también por alias');
  assert.equal(db.backend().stats.fullScans, 0, 'las búsquedas no recorren la base completa');
});

test('respaldo: exporta e importa entidades, relaciones, alias, evidencia, correcciones, conflictos, reglas y ajustes; sin duplicados', async () => {
  const a = make(); await a.kb.observe(med('Marca X', 'Lab Y', 'A1')); await a.kb.observe(med('Marca X', 'Lab Z', 'A2'));
  await a.kb.addAlias('pharmaceuticalForm', 'Tabs', 'Tabletas', { kind: 'confirmed' });
  await a.kb.recordManualCorrection({ field: 'forma', original: 'Caps', corrected: 'Cápsulas', item: med('X', 'Y', 'A3') });
  await a.kb.setSettings({ autoCorrect: false });
  const data = await a.kb.exportBackup();
  assert.equal(data.schema, K.SCHEMA); assert.equal(data.dbVersion, 1); assert.equal(data.settings.autoCorrect, false);
  for (const s of ['entities', 'aliases', 'relationships', 'evidence', 'corrections', 'conflicts', 'rules']) assert.ok(data.counts[s] > 0, s);
  const b = make(); const r = await b.kb.importBackup(JSON.parse(JSON.stringify(data)));
  assert.equal(r.ok, true); assert.equal(r.integrity.ok, true); assert.equal(b.kb.settings().autoCorrect, false);
  const sa = await a.kb.stats(), sb = await b.kb.stats();
  for (const k of ['entities', 'aliases', 'relationships', 'evidence', 'corrections', 'conflictsOpen']) assert.equal(sb[k], sa[k], k);
  const again = await b.kb.importBackup(JSON.parse(JSON.stringify(data))); assert.equal(again.report.added, 0);
  assert.equal((await b.kb.stats()).entities, sa.entities);
  const w1 = await a.kb.why('brand:marca-x'), w2 = await b.kb.why('brand:marca-x'); assert.equal(w2.evidenceTotal, w1.evidenceTotal, 'la evidencia se conserva');
  assert.equal((await b.kb.importBackup({ schema: 'x' })).ok, false);
  assert.equal((await b.kb.importBackup({ schema: K.SCHEMA, dbVersion: 9, stores: {} })).ok, false);
});

test('restauración: detecta referencias rotas y puede reiniciar', async () => {
  const { kb, db } = make(); await kb.observe(med('Tempra', 'Genomma', 'A1'));
  assert.equal((await kb.integrity()).ok, true);
  await db.delete('entities', 'laboratory:genomma');
  const integ = await kb.integrity(); assert.equal(integ.ok, false); assert.ok(integ.total >= 1);
  await kb.reset(); assert.equal((await kb.stats()).entities, 0);
});

/* ---------- rendimiento ---------- */
test('rendimiento: observar, evaluar y buscar con miles de registros no recorre la base completa', async () => {
  const { kb, db } = make();
  const items = Array.from({ length: 600 }, (_, i) => med('Marca ' + (i % 150), 'Lab ' + ((i % 150) % 40), 'SKU' + i, { principio: 'Sustancia ' + (i % 90), concentracion: (100 + (i % 20)) + ' mg' }));
  const t0 = Date.now(); const r = await kb.observeMany(items, { source: 'csv' }); const t1 = Date.now() - t0;
  assert.equal(r.ok, true); assert.equal(r.products, 600);
  const scansAfterWrite = db.backend().stats.fullScans;
  const t2 = Date.now(); for (let i = 0; i < 60; i++) await kb.assess(items[i * 7]); const ta = Date.now() - t2;
  await kb.search({ text: 'marca 1' });
  assert.equal(db.backend().stats.fullScans, scansAfterWrite, 'evaluar y buscar no recorren tablas completas');
  assert.ok(t1 < 20000, `600 productos en ${t1} ms`); assert.ok(ta < 5000, `60 evaluaciones en ${ta} ms`);
  const s = await kb.stats(); assert.equal(s.byType.brand, 150); assert.equal(s.byType.laboratory, 40);
  assert.equal((await kb.listConflicts()).length, 0, 'mismas marcas con el mismo laboratorio no generan conflictos');
});
