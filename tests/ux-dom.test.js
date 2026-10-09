'use strict';
/* Fase 10: pruebas que EJECUTAN la interfaz en jsdom. Se omiten si jsdom no está instalado (npm install). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, skip, wait } = require('./helpers/boot');

const BAD = /\bundefined\b|\bNaN\b|\[object Object\]|\bnull\b/;

test('UX: al abrir la app se ve dónde estoy, qué producto y qué hacer', { skip }, () => {
  const a = boot();
  const nav = [...a.d.querySelectorAll('#mainnav [data-nav]')].map(b => b.querySelector('.mnav-t').textContent);
  assert.deepEqual(nav, ['Captura', 'Validación', 'Contenido', 'Lote', 'Exportación', 'Conocimiento', 'Configuración']);
  assert.equal(a.d.querySelector('#mainnav [aria-current="true"]').dataset.nav, 'captura');
  assert.match(a.text('#prod-bar'), /PRODUCTO/);
  assert.match(a.text('#prod-bar .status'), /BORRADOR/);
  assert.match(a.text('#prod-guide'), /Empieza por capturar la marca/);
  assert.match(a.text('#live'), /Aquí aparecerán el título/);
  assert.deepEqual(a.errors, []);
});

test('UX: producto incompleto muestra estado, scores y «Qué hacer ahora» con botón Corregir', { skip }, () => {
  const a = boot();
  a.fill('f-marca', 'Tempra'); a.fill('f-principio', 'Paracetamol');
  assert.match(a.text('#prod-bar'), /Tempra/);
  assert.match(a.text('#prod-bar'), /Paracetamol/);
  assert.equal(a.d.querySelectorAll('#prod-metrics .pm').length, 5);
  assert.deepEqual([...a.d.querySelectorAll('#prod-metrics .pm-l')].map(x => x.textContent), ['Health', 'SEO', 'Contenido', 'Magento', 'Global 360°']);
  assert.match(a.text('#prod-guide .guide-counts'), /requiere|requieren|bloqueo|Nada/);
  const nba = a.d.querySelector('#prod-guide .nba h3');
  assert.match(nba.textContent, /Qué hacer ahora/);
  assert.ok(a.d.querySelector('#prod-guide .nba [data-goto]'), 'hay botón de acción');
  assert.deepEqual(a.errors, []);
});

test('UX: «Corregir» lleva al campo, lo enfoca, lo resalta y abre la explicación', { skip }, () => {
  const a = boot();
  a.fillMed('Tempra', '30', null);                 // completo pero sin SKU → bloqueo de Magento
  assert.match(a.text('#prod-bar .status'), /BORRADOR/);
  assert.match(a.text('#prod-guide .nba'), /SKU/);
  a.d.querySelector('#prod-guide .nba [data-goto]').click();
  assert.equal(a.d.activeElement.id, 'sku');
  assert.ok(a.d.getElementById('sku').closest('.field').classList.contains('field--hl'));
  assert.equal(a.d.querySelector('#fm-sku details').open, true, 'la explicación queda abierta');
  assert.match(a.text('#fm-sku'), /Error/);
  assert.match(a.text('#fm-sku'), /¿Por qué\?/);
  assert.match(a.text('#fm-sku'), /Qué hacer/);
  assert.deepEqual(a.errors, []);
});

test('UX: una contradicción forma↔vía marca los dos campos con ❌ y aria-invalid, y el botón lleva a ellos', { skip }, () => {
  const a = boot();
  a.fillMed('Tempra', '30', 'A1', { via: 'Subcutánea' });
  assert.match(a.text('#fm-forma'), /❌ Error/);
  assert.equal(a.d.getElementById('f-forma').getAttribute('aria-invalid'), 'true');
  assert.equal(a.d.getElementById('f-marca').getAttribute('aria-invalid'), 'false');
  assert.match(a.text('#fm-marca'), /✓ Correcto/);
  assert.match(a.d.getElementById('f-forma').getAttribute('aria-describedby'), /fm-forma/);
  assert.match(a.text('#prod-guide .nba'), /Inconsistencia/);
  a.d.querySelector('#prod-guide .nba [data-goto]').click();
  assert.ok(['f-forma', 'f-via'].includes(a.d.activeElement.id));
});

test('UX: cada dato dice dónde se usa y de dónde viene', { skip }, () => {
  const a = boot();
  a.fillMed('Tempra', '30', 'A1');
  const t = a.text('#fm-contenido');
  assert.match(t, /Interpretación: 30 → 30 piezas/);
  assert.match(t, /Usado en: ✓ Título ✓ Descripción ✓ Magento ✓ SEO/);
  assert.match(t, /Origen: captura manual/);
  assert.doesNotMatch(a.text('#live'), BAD);
  assert.match(a.text('#live'), /Título generado/);
  assert.match(a.text('#live'), /Ficha técnica y Magento/);
});

test('UX: el estado de guardado cambia de «sin guardar» a «Guardado» y el producto pasa a LISTO PARA APROBACIÓN', { skip }, async () => {
  const a = boot();
  a.fillMed('Tempra', '30', 'A1');
  assert.match(a.text('#save-state'), /Cambios sin guardar/);
  a.d.getElementById('add').click();
  assert.match(a.toast(), /Producto guardado en el lote/);
  await wait(30);
  assert.match(a.text('#save-state'), /Guardado/);
  assert.match(a.text('#lote-body tbody tr .status'), /LISTO PARA APROBACIÓN/);
  assert.match(a.text('#lote-body tbody tr .lmetrics'), /Health\s*\d+\s*SEO\s*\d+\s*Contenido\s*\d+\s*Magento.+360°\s*\d+/);
  assert.deepEqual(a.errors, []);
});

test('UX: producto bloqueado en el lote queda BLOQUEADO, cuenta como error y no se puede aprobar', { skip }, () => {
  const a = boot();
  a.addMed('', 'Tempra', '30');                     // sin SKU
  a.d.querySelector('[data-edit]').click();
  assert.match(a.text('#lote-body tbody tr .status'), /BLOQUEADO/);
  assert.equal(a.d.querySelectorAll('#lote-body [data-approve]').length, 0);
  a.d.querySelector('#lote-body [data-filter="ux_errores"]').click();
  assert.equal(a.rows().length, 1);
});

test('UX: aprobar, retirar al editar y volver a aprobar', { skip }, async () => {
  const a = boot();
  a.addMed('A1', 'Tempra', '30');
  a.d.querySelector('#lote-body [data-approve]').click();
  assert.match(a.toast(), /Producto aprobado/);
  assert.match(a.text('#lote-body tbody tr .status'), /APROBADO/);
  a.d.querySelector('[data-edit]').click();
  assert.match(a.text('#prod-bar .status'), /APROBADO/);
  a.fill('f-contenido', '31');
  assert.match(a.text('#prod-bar .status'), /BORRADOR/, 'al cambiar un dato la aprobación deja de valer');
  assert.match(a.text('#prod-guide'), /Ver historial/);
  a.d.getElementById('add').click();
  assert.match(a.text('#lote-body tbody tr .status'), /LISTO PARA APROBACIÓN/);
});

test('UX: eliminar pide confirmación y se puede cancelar', { skip }, async () => {
  const a = boot();
  a.addMed('A1', 'Tempra', '30'); a.addMed('A2', 'Dolofin', '20');
  a.d.querySelector('[data-del]').click();
  const dlg = a.d.getElementById('confirm-dlg');
  assert.ok(dlg);
  assert.equal(dlg.querySelector('[role="alertdialog"]').getAttribute('aria-modal'), 'true');
  assert.equal(a.d.activeElement.dataset.cd, 'no', 'el foco empieza en Cancelar');
  await a.confirm(false);
  assert.equal(a.rows().length, 2);
  a.d.querySelector('[data-del]').click();
  await a.confirm(true);
  assert.equal(a.rows().length, 1);
  assert.match(a.toast(), /Producto eliminado/);
  assert.equal(a.d.getElementById('confirm-dlg'), null);
});

test('UX: Escape cancela la confirmación', { skip }, async () => {
  const a = boot();
  a.addMed('A1', 'Tempra', '30');
  a.d.querySelector('[data-del]').click();
  a.d.dispatchEvent(new a.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(10);
  assert.equal(a.d.getElementById('confirm-dlg'), null);
  assert.equal(a.rows().length, 1);
});

test('UX: vaciar lote pide confirmación', { skip }, async () => {
  const a = boot();
  a.addMed('A1', 'Tempra', '30'); a.addMed('A2', 'Dolofin', '20');
  a.d.getElementById('lote-clear').click();
  assert.match(a.text('#confirm-dlg h3'), /Vaciar todo el lote/);
  await a.confirm(false);
  assert.equal(a.count(), '2');
  a.d.getElementById('lote-clear').click();
  await a.confirm(true);
  assert.equal(a.count(), '0');
  assert.match(a.text('#lote-body'), /Todavía no hay productos en el lote/);
  assert.match(a.toast(), /Lote vaciado/);
});

test('UX: limpiar el formulario con cambios sin guardar pide confirmación', { skip }, async () => {
  const a = boot();
  a.fillMed('Tempra', '30', 'A1');
  a.d.getElementById('clear').click();
  assert.match(a.text('#confirm-dlg h3'), /Limpiar el formulario/);
  await a.confirm(false);
  assert.equal(a.d.getElementById('f-marca').value, 'Tempra');
  a.d.getElementById('clear').click();
  await a.confirm(true);
  assert.equal(a.d.getElementById('f-marca').value, '');
  assert.match(a.toast(), /Formulario limpio/);
});

test('UX: estados vacíos útiles y botones del lote deshabilitados', { skip }, () => {
  const a = boot();
  assert.match(a.text('#lote-body'), /Todavía no hay productos en el lote/);
  assert.ok(a.d.querySelector('#lote-body [data-nav-go="captura"]'), 'CTA Agregar producto');
  assert.match(a.text('#exp-summary'), /No hay productos listos para exportar/);
  for (const id of ['lote-copy', 'lote-dl', 'lote-backup', 'lote-clear']) assert.equal(a.d.getElementById(id).disabled, true, id);
  a.addMed('A1', 'Tempra', '30');
  for (const id of ['lote-copy', 'lote-dl', 'lote-backup', 'lote-clear']) assert.equal(a.d.getElementById(id).disabled, false, id);
});

test('UX: nunca se muestra estado vacío si hay productos (tampoco tras recargar)', { skip }, () => {
  const a = boot();
  a.addMed('A1', 'Tempra', '30'); a.addMed('A2', 'Dolofin', '20');
  assert.doesNotMatch(a.text('#lote-body'), /Todavía no hay productos/);
  const b = boot(a.ls());
  assert.equal(b.rows().length, 2);
  assert.doesNotMatch(b.text('#lote-body'), /Todavía no hay productos/);
});

test('UX: filtros principales con conteos reales y anuncio accesible', { skip }, () => {
  const a = boot();
  a.addMed('A1', 'Tempra', '30'); a.addMed('', 'Dolofin', '20');
  const chips = [...a.d.querySelectorAll('#lote-body > .filters .chip')].map(c => c.textContent);
  assert.deepEqual(chips.map(c => c.replace(/ \(\d+\)/, '')), ['Todos', 'Errores', 'Revisar', 'Listos', 'SEO', 'Contenido', 'Magento', 'Health', 'Score crítico']);
  const n = k => Number(a.d.querySelector(`[data-filter="${k}"]`).textContent.match(/\((\d+)\)/)[1]);
  assert.equal(n('todos'), 2); assert.equal(n('ux_errores'), 1); assert.equal(n('ux_listos'), 1);
  assert.equal(a.d.querySelector('[data-filter="ux_critico"]').disabled, true, 'sin datos detrás, el filtro no se ofrece');
  a.d.querySelector('[data-filter="ux_listos"]').click();
  assert.equal(a.rows().length, 1);
  assert.match(a.text('#lote-live'), /Mostrando 1 de 2/);
  assert.equal(a.d.querySelector('[data-filter="ux_listos"]').getAttribute('aria-pressed'), 'true');
  a.d.querySelector('[data-filter="todos"]').click();
  assert.equal(a.rows().length, 2);
});

test('UX: filtrar y expandir no recalculan el lote (caché)', { skip }, () => {
  const a = boot();
  a.addMed('A1', 'Tempra', '30'); a.addMed('A2', 'Dolofin', '20');
  const before = a.w.__fichasStats().assess.misses;
  a.d.querySelector('[data-filter="ux_listos"]').click();
  a.d.querySelector('[data-filter="todos"]').click();
  a.d.querySelector('[data-toggle]').click();
  assert.equal(a.w.__fichasStats().assess.misses, before);
  assert.ok(a.w.__fichasStats().assess.hits > 0);
});

test('UX: «Ver» expande el detalle del producto con qué hacer y Corregir lo lleva al campo', { skip }, () => {
  const a = boot();
  a.addMed('', 'Tempra', '30');
  a.d.querySelector('#lote-body [data-toggle]').click();
  assert.equal(a.d.querySelectorAll('#lote-body .lrow-detail').length, 1);
  assert.match(a.text('#lote-body .lrow-detail'), /BLOQUEADO/);
  assert.match(a.text('#lote-body .lrow-detail'), /Qué hacer ahora/);
  a.d.querySelector('#lote-body [data-fix]').click();
  assert.equal(a.d.activeElement.id, 'sku');
  assert.equal(a.d.getElementById('add').textContent, 'Guardar cambios');
});

test('UX: el lote muestra cada eje y es una tabla accesible que se vuelve tarjetas en móvil', { skip }, () => {
  const a = boot();
  a.addMed('A1', 'Tempra', '30');
  assert.deepEqual([...a.d.querySelectorAll('#lote-body thead th')].map(t => t.getAttribute('scope')), Array(7).fill('col'));
  const labels = [...a.d.querySelectorAll('#lote-body tbody tr td[data-label]')].map(t => t.dataset.label);
  assert.deepEqual(labels, ['SKU', 'Categoría', 'Título', 'Estado', 'Evaluación', 'Avisos']);
  for (const b of a.d.querySelectorAll('#lote-body tbody button')) assert.equal(b.getAttribute('type'), 'button');
  assert.match(a.text('.exp-compact'), /Mismas métricas de Health, SEO, Contenido, Magento y Score 360° que en Lote/);
  assert.equal(a.d.querySelector('.exp-compact a').getAttribute('href'), '#h-lote');
});

test('UX: copiar muestra feedback y evita el doble clic', { skip }, async () => {
  const a = boot();
  a.addMed('A1', 'Tempra', '30');
  const btn = a.d.getElementById('lote-copy');
  btn.click(); btn.click();
  assert.equal(btn.getAttribute('aria-busy'), 'true');
  await wait(60);
  assert.equal(a.copied.length, 1, 'solo una copia a pesar del doble clic');
  assert.match(a.toast(), /Lote copiado/);
  assert.equal(btn.getAttribute('aria-busy'), null);
});

test('UX: descargar muestra «Archivo generado» y una sola descarga por doble clic', { skip }, async () => {
  const a = boot();
  a.addMed('A1', 'Tempra', '30');
  const btn = a.d.getElementById('exp-dl');
  btn.click(); btn.click();
  await wait(120);
  assert.equal(a.downloads.length, 1);
  assert.match(a.toast(), /Archivo generado: Carga_SKU_Magento\.csv/);
  a.d.getElementById('lote-dl').click();
  await wait(120);
  assert.equal(a.downloads.length, 2);
});

test('UX: un error al descargar se explica en lenguaje comprensible', { skip }, async () => {
  const a = boot();
  a.addMed('A1', 'Tempra', '30');
  a.w.URL.createObjectURL = () => { throw new Error("Cannot read properties of undefined (reading 'x')"); };
  a.w.HTMLAnchorElement.prototype.click = () => { throw new Error('boom'); };
  a.d.getElementById('lote-dl').click();
  await wait(150);
  const t = a.toast();
  assert.match(t, /No se pudo descargar|Intenta nuevamente/);
  assert.doesNotMatch(t, BAD);
  assert.doesNotMatch(t, /Cannot read/);
});

test('UX: restaurar un respaldo sobre un lote con productos pide confirmación y avisa si el archivo es inválido', { skip }, async () => {
  const a = boot();
  a.addMed('B1', 'Tempra', '30'); a.addMed('B2', 'Dolofin', '20');
  a.d.getElementById('lote-backup').click();
  await wait(100);
  const text = Buffer.from(await a.downloads.at(-1).arrayBuffer()).toString('utf8');
  const restore = (x, txt) => { const file = new x.w.File([txt], 'respaldo.json', { type: 'application/json' }); const input = x.d.getElementById('lote-restore'); Object.defineProperty(input, 'files', { value: [file], configurable: true }); input.dispatchEvent(new x.w.Event('change', { bubbles: true })); };
  a.addMed('B3', 'Dolo', '10');
  restore(a, text); await wait(150);
  assert.match(a.text('#confirm-dlg h3'), /Restaurar este respaldo/);
  await a.confirm(false);
  assert.equal(a.count(), '3');
  assert.match(a.toast(), /Restauración cancelada/);
  restore(a, text); await wait(150); await a.confirm(true);
  assert.equal(a.count(), '2');
  assert.match(a.toast(), /Respaldo restaurado: 2/);
  restore(a, '{no es json'); await wait(150);
  assert.equal(a.d.getElementById('toast').dataset.kind, 'error');
  assert.match(a.toast(), /formato válido/);
  assert.doesNotMatch(a.toast(), BAD);
  assert.equal(a.count(), '2', 'un respaldo inválido no toca el lote');
});

test('UX: la navegación principal lleva a Validación (tab de evaluación) y Configuración', { skip }, () => {
  const a = boot();
  a.fillMed('Tempra', '30', 'A1');
  a.d.querySelector('[data-nav="validacion"]').click();
  assert.equal(a.d.querySelector('.tab[aria-selected="true"]').dataset.tab, 'eval');
  assert.equal(a.d.querySelector('#mainnav [aria-current="true"]').dataset.nav, 'validacion');
  a.d.querySelector('[data-nav="contenido"]').click();
  assert.equal(a.d.querySelector('.tab[aria-selected="true"]').dataset.tab, 'titulo');
  a.d.querySelector('[data-nav="config"]').click();
  assert.equal(a.d.getElementById('settings').hidden, false);
});

test('UX: las métricas de la barra llevan a su «¿Por qué?» y el score se explica', { skip }, () => {
  const a = boot();
  a.fillMed('Tempra', '30', 'A1');
  a.d.querySelector('[data-evalgo="s360"]').click();
  assert.equal(a.d.querySelector('.tab[aria-selected="true"]').dataset.tab, 'eval');
  const sec = a.d.querySelector('#panel-eval [data-evalopen="s360"]');
  assert.equal(sec.open, true);
  assert.match(sec.textContent, /¿Por qué\?/);
  assert.match(sec.textContent, /Valor Peso Aporte|Eje.*Valor.*Peso.*Aporte/);
  for (const k of ['health', 'seo', 'content', 'magento']) { a.d.querySelector(`[data-evalgo="${k}"]`).click(); assert.equal(a.d.querySelector(`#panel-eval [data-evalopen="${k}"]`).open, true, k); }
});

test('UX: SEO y evaluación ofrecen «Ver campo» hacia el resultado correspondiente', { skip }, () => {
  const a = boot();
  a.fillMed('Tempra', '30', 'A1', { via: 'Subcutánea' });
  const btn = a.d.querySelector('#panel-eval [data-goto]');
  assert.ok(btn, 'la evaluación ofrece botones de navegación');
  btn.click();
  assert.deepEqual(a.errors, []);
  assert.ok(a.d.querySelectorAll('#panel-eval .fwhy').length > 0, 'cada hallazgo trae su «¿Por qué?»');
});

test('UX: teclado en las pestañas (flechas, Inicio, Fin)', { skip }, () => {
  const a = boot();
  const press = key => a.d.querySelector('.output .tabs').dispatchEvent(new a.w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  const cur = () => a.d.querySelector('.tab[aria-selected="true"]').dataset.tab;
  const first = cur();
  press('ArrowRight'); assert.notEqual(cur(), first);
  assert.equal(a.d.querySelector('.tab[aria-selected="true"]').tabIndex, 0);
  assert.equal(a.d.querySelector('.tab[aria-selected="false"]').tabIndex, -1);
  press('End'); assert.equal(cur(), 'eval');
  press('Home'); assert.equal(cur(), first);
});

test('UX: ningún texto visible contiene undefined, null, NaN ni [object Object] en ninguna categoría', { skip }, () => {
  const a = boot();
  for (const cat of ['med', 'dis', 'cos', 'sup', 'beb', 'hig', 'acc']) {
    const r = a.d.querySelector(`#cats input[value="${cat}"]`);
    r.checked = true; r.dispatchEvent(new a.w.Event('change', { bubbles: true }));
    assert.equal(a.d.querySelector('#cats input:checked').value, cat, 'la categoría quedó seleccionada');
    for (const fd of a.w.Fichas.CATS[cat].fields.filter(f => f.type !== 'select').slice(0, 3)) { assert.ok(a.d.getElementById('f-' + fd.key), `${cat}: falta el campo f-${fd.key}`); a.fill('f-' + fd.key, 'Dato ' + fd.key); }
    const txt = a.d.querySelector('.layout').textContent;
    assert.doesNotMatch(txt, BAD, cat);
  }
  const med = a.d.querySelector('#cats input[value="med"]'); med.checked = true; med.dispatchEvent(new a.w.Event('change', { bubbles: true }));
  a.addMed('A1', 'Tempra', '30');
  assert.doesNotMatch(a.d.body.textContent, BAD);
  assert.deepEqual(a.errors, []);
});

test('UX: cargar. El lote, la edición y la aprobación sobreviven a una recarga', { skip }, () => {
  const a = boot();
  a.addMed('A1', 'Tempra', '30');
  a.d.querySelector('#lote-body [data-approve]').click();
  const b = boot(a.ls());
  assert.equal(b.count(), '1');
  assert.match(b.text('#lote-body tbody tr .status'), /APROBADO/);
  assert.deepEqual(b.errors, []);
});

test('UX: campos con nombre accesible, botones con tipo y región en vivo', { skip }, () => {
  const a = boot();
  a.fillMed('Tempra', '30', 'A1');
  const unnamed = [...a.d.querySelectorAll('input:not([type=hidden]):not([type=file]), select, textarea')].filter(e => !(e.labels && e.labels.length) && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby'));
  assert.deepEqual(unnamed.map(e => e.id), []);
  assert.equal(a.d.querySelectorAll('form').length, 0, 'sin <form>: ningún botón puede enviar nada por accidente');
  assert.deepEqual([...a.d.querySelectorAll('#lote-body button, #prod-guide button, #prod-metrics button, #mainnav button')].filter(b => !b.getAttribute('type')).map(b => b.textContent), [], 'los botones nuevos declaran type');
  assert.equal(a.d.getElementById('ux-live').getAttribute('aria-live'), 'polite');
  assert.equal(a.d.querySelector('.skip').getAttribute('href'), '#h-prod');
});
