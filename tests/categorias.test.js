'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/categorias.js');

const base = { nombre: 'Gastroenterología', padre: 'Medicamentos Generales', tipo: 'otc', incluye: 'Medicamentos para el aparato digestivo.', subs: 'Antiácidos\nLaxantes | https://tienda.mx/laxantes\nProbióticos', tienda: 'Farmacias Especializadas' };

test('categorías: meta title con el nombre primero y sin pasar de 60', () => {
  const o = C.build(base);
  assert.equal(o.metaTitle, 'Gastroenterología | Farmacias Especializadas', 'con el padre pasaría de 60, así que se omite');
  assert.equal(C.build({ ...base, tienda: 'Mi Farma' }).metaTitle, 'Gastroenterología | Medicamentos Generales | Mi Farma');
  assert.ok(o.metaTitle.length <= 60);
  assert.equal(C.build({ ...base, nombre: 'Artículos de medición y control' }).metaTitle.startsWith('Artículos de medición y control'), true);
  const largo = C.build({ ...base, nombre: 'Medicamentos para el control de enfermedades crónicas', padre: 'Especialidades', tienda: 'Farmacias Especializadas' });
  assert.equal(largo.metaTitle, 'Medicamentos para el control de enfermedades crónicas', 'si no cabe, se omiten el padre y la tienda');
});

test('categorías: la meta description lleva lo principal y omite lo opcional de derecha a izquierda', () => {
  const o = C.build(base);
  assert.equal(o.metaDescription, 'Encuentra medicamentos para el aparato digestivo. Incluye Antiácidos, Laxantes y Probióticos. Compra en Farmacias Especializadas.');
  assert.ok(o.metaDescription.length <= 155);
  const larga = C.build({ ...base, incluye: 'medicamentos para el aparato digestivo y la regularidad intestinal de adultos y niños en distintas presentaciones' });
  assert.ok(!/Compra en/.test(larga.metaDescription) || larga.metaDescription.length <= 155);
  assert.ok(larga.metaDescription.length <= 155);
});

test('categorías: texto corto, texto largo con enlaces y preguntas frecuentes', () => {
  const o = C.build(base);
  assert.match(o.textoCorto, /^<p>Gastroenterología reúne medicamentos para el aparato digestivo\. Explora por antiácidos, laxantes y probióticos/);
  assert.match(o.textoCorto, /Consulte a su médico y evite automedicarse\.<\/p>$/);
  assert.match(o.textoLargo, /<h2>Qué encontrarás en Gastroenterología<\/h2>/);
  assert.match(o.textoLargo, /<li><a href="https:\/\/tienda\.mx\/laxantes">Laxantes<\/a><\/li>/);
  assert.match(o.textoLargo, /<li>Antiácidos<\/li>/, 'sin URL, sin enlace');
  assert.match(o.preguntas, /^<h2>Preguntas frecuentes:<\/h2>/);
  assert.match(o.preguntas, /¿Necesito receta para comprar en Gastroenterología\?/);
  assert.match(o.preguntas, /Depende del producto/);
  assert.ok(!/ld\+json|application\/ld/i.test(o.preguntas), 'sin JSON-LD');
});

test('categorías: sin subcategorías no hay lista ni pregunta de cómo encontrar', () => {
  const o = C.build({ ...base, subs: '' });
  assert.ok(!/<ul>/.test(o.textoLargo));
  assert.ok(!/¿Cómo encuentro/.test(o.preguntas));
  assert.match(o.textoCorto, /Usa los filtros/);
});

test('categorías: el tipo cambia la nota y las preguntas; con receta el texto es neutro y avisa', () => {
  const rx = C.build({ ...base, tipo: 'rx', incluye: '' });
  assert.match(rx.textoCorto, /reúne medicamentos que se venden con receta médica\./);
  assert.match(rx.preguntas, /Sí\. Los medicamentos de esta categoría se venden con receta médica/);
  assert.match(rx.metaDescription, /^Consulta gastroenterología: medicamentos con receta\./);
  assert.ok(rx.warnings.some(w => w.code === 'receta'));
  const sup = C.build({ ...base, tipo: 'sup' });
  assert.match(sup.textoCorto, /suplementos alimenticios no son medicamentos/);
  assert.ok(!/receta/.test(sup.preguntas));
  assert.equal(C.build({ ...base, tipo: 'otro' }).textoCorto.includes('Consulte'), false, 'sin tipo no hay nota');
});

test('categorías: avisos de datos faltantes, lenguaje y texto breve', () => {
  const o = C.build({ ...base, incluye: 'los mejores medicamentos que curan' });
  assert.ok(o.warnings.some(w => w.code === 'lenguaje' && w.level === 'error' && /cura/.test(w.msg)));
  const vacio = C.build({ ...base, incluye: '', subs: '' });
  assert.ok(vacio.warnings.some(w => w.code === 'sin-incluye'));
  assert.ok(vacio.warnings.some(w => w.code === 'texto-corto'));
  assert.equal(C.build({ nombre: '' }).warnings[0].code, 'sin-nombre');
});

test('categorías: escapa el HTML y limpia espacios', () => {
  const o = C.build({ ...base, nombre: '  Tés <b>y</b>  hierbas ', incluye: 'a & b' });
  assert.ok(!/<b>/.test(o.textoLargo) && /&lt;b&gt;/.test(o.textoLargo));
  assert.match(o.textoLargo, /A &amp; b\./);
});

test('categorías: sugiere el tipo por el nombre sin inventar «con receta»', () => {
  const g = C.guessTipo;
  assert.equal(g('Vitaminas y Suplementos'), 'sup');
  assert.equal(g('Dermocosméticos'), 'cos');
  assert.equal(g('Artículos de Medición'), 'dis');
  assert.equal(g('Medicamentos Generales'), 'otc');
  assert.equal(g('Especialidades'), 'otro', 'Especialidades no se declara con receta');
  assert.equal(g('Medicamentos con receta'), 'rx');
  assert.equal(g('Cuidado Personal'), 'hig');
});

test('categorías: detecta textos casi iguales entre categorías', () => {
  const a = C.build(base), b = C.build({ ...base, nombre: 'Analgésicos', subs: '' });
  const c = C.build({ nombre: 'Termómetros', tipo: 'dis', incluye: 'termómetros digitales y de infrarrojos', tienda: 'X' });
  assert.ok(C.similarity(a.textoLargo, b.textoLargo) > C.similarity(a.textoLargo, c.textoLargo));
  assert.equal(C.similarity('', 'algo'), 0);
  assert.ok(C.similarity(a.textoCorto, a.textoCorto) === 1);
});

test('categorías: sin nombre de tienda no se escribe «la tienda»', () => {
  const o = C.build({ ...base, tienda: '' });
  assert.equal(o.metaTitle, 'Gastroenterología | Medicamentos Generales');
  assert.ok(!/Compra en/.test(o.metaDescription));
});
