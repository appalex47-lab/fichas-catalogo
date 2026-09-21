'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../logic.js');
const R = require('../rules.js');

const build = o => R.buildRulesDoc({ now: new Date('2026-09-22T12:00:00'), ...o });
const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

test('documento: trae todas las secciones, las 7 categorías, versión y huella', () => {
  const d = build();
  for (const id of ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9']) assert.match(d.html, new RegExp(`id="${id}"`), id);
  for (const id of Object.keys(F.CATS)) assert.match(d.html, new RegExp(`id="cat-${id}"`), id);
  assert.match(d.hash, /^[0-9a-f]{8}$/);
  assert.equal(d.version, R.RULES_VERSION);
  assert.match(d.html, new RegExp(d.hash));
  assert.match(d.html, /^<!DOCTYPE html>/);
});

test('documento: aclara que no es asesoría legal ni está aprobado, y trae bloque de firma', () => {
  const d = build().html;
  assert.match(d, /No es asesoría legal/);
  assert.match(d, /no está aprobado hasta que lo firme Regulatorio/);
  assert.match(d, /Comentarios de Regulatorio/);
  assert.match(d, /Firma/);
});

test('documento: la huella no depende de la fecha y cambia cuando cambia una regla', () => {
  const a = build(), b = R.buildRulesDoc({ now: new Date('2027-01-05T09:00:00') });
  assert.equal(a.hash, b.hash);
  assert.notEqual(a.generated, b.generated);
  const otraLeyenda = build({ F: { ...F, LEGEND: { ...F.LEGEND, medMc: 'Otra leyenda.' } } });
  assert.notEqual(otraLeyenda.hash, a.hash);
  const meta = F.defMeta(); meta.cats.med.mt.tpl = 'Distinto {marca}';
  assert.notEqual(build({ metaCfg: meta }).hash, a.hash);
  const meta2 = F.defMeta(); meta2.cats.cos.confirmed = true;
  assert.notEqual(build({ metaCfg: meta2 }).hash, a.hash);
});

test('documento: las leyendas fijas vienen de la misma fuente que las plantillas', () => {
  const d = build().html;
  Object.values(F.LEGEND).flat().forEach(t => assert.ok(d.includes(escHtml(t)), t.slice(0, 40)));
  const r = F.computeFor('med', { marca: 'A', concentracion: '5 mg', principio: 'P', forma: 'Tableta', contenido: 'Caja', laboratorio: 'L', via: 'Oral', receta: 'si' }, new Set(), F.defMeta());
  assert.ok(r.mg.html.includes(F.LEGEND.medConservacion), 'la plantilla real usa la misma leyenda');
});

test('documento: incluye todos los términos del semáforo', () => {
  const d = build().html;
  [...F.RED, ...F.AMBER, ...F.COS_CLAIM, ...F.COS_MED].forEach(x => assert.ok(d.includes(escHtml(x[1])), x[1]));
});

test('documento: las plantillas se generan con marcadores y el HTML sale escapado', () => {
  const d = build().html;
  assert.ok(d.includes('&lt;strong&gt;[Marca] ([Principio activo]) [Concentración] / [Volumen]&lt;/strong&gt;'));
  assert.ok(!d.includes('<strong>[Marca]'), 'no debe haber HTML sin escapar dentro de las plantillas');
  assert.ok(d.includes('[Marca] [Concentración] / [Volumen] | [Principio activo] | [Forma farmacéutica] | Laboratorio [Laboratorio]'));
});

test('documento: qué campos bloquean Magento y dónde se usa cada dato', () => {
  const d = build().html;
  const med = d.slice(d.indexOf('id="cat-med"'), d.indexOf('id="cat-dis"'));
  assert.match(med, /Declarar si requiere receta médica; Principio activo/);
  assert.match(med, /<td>Principio activo<\/td><td>Sí<\/td><td>[^<]*Título[^<]*<\/td><td><span class="badge b-bloquea">/);
  const cos = d.slice(d.indexOf('id="cat-cos"'), d.indexOf('id="cat-sup"'));
  assert.match(cos, /Uno de los dos/);
  assert.match(cos, /Ingredientes:/);
});

test('documento: fundamento normativo solo donde se verificó, y el resto por completar', () => {
  const d = build().html;
  const cos = d.slice(d.indexOf('id="cat-cos"'), d.indexOf('id="cat-sup"'));
  assert.match(cos, /NOM-141-SSA1\/SCFI-2012/);
  assert.match(cos, /Numerales por confirmar por Regulatorio/);
  const otras = Object.keys(F.CATS).filter(id => id !== 'cos');
  otras.forEach((id, i) => {
    const start = d.indexOf(`id="cat-${id}"`), rest = d.indexOf('id="cat-', start + 10), end = rest === -1 ? d.indexOf('id="s5"') : rest;
    assert.match(d.slice(start, end), /Por completar por Regulatorio/, id);
  });
});

test('documento: los ejemplos se calculan con el código y están marcados como ficticios', () => {
  const d = build().html;
  assert.match(d, /Caja con 30 tabletas/);
  assert.match(d, /<code>500 mg, 10 mL, 5 g<\/code>/);
  assert.match(d, /<code>150 UG<\/code>/);
  assert.match(d, /CeraVe Crema Hidratante/);
  assert.match(d, /Ejemplo ilustrativo\. No es un producto real\./);
  assert.match(d, /<td>50\+<\/td><td>Muy alta<\/td>/);
});

test('documento: refleja la configuración vigente (siglas y estructura de metas)', () => {
  const meta = F.defMeta(); meta.cats.beb.confirmed = true;
  const d = build({ keep: new Set(['acme']), metaCfg: meta }).html;
  assert.match(d, /ACME/);
  const beb = d.slice(d.indexOf('id="cat-beb"'), d.indexOf('id="cat-hig"'));
  assert.match(beb, /Confirmada/);
  const med = d.slice(d.indexOf('id="cat-med"'), d.indexOf('id="cat-dis"'));
  assert.match(med, /Confirmada/);
});

test('documento: exportación e IA describen los límites reales', () => {
  const d = build().html;
  assert.match(d, /<strong>104<\/strong> columnas/);
  assert.match(d, /product_online/);
  assert.match(d, /Nunca principio activo, receta ni concentración/);
  assert.match(d, /Nunca indicar si requiere receta/);
  assert.match(d, /sin confirmar/);
});
