#!/usr/bin/env node
/*
 * Genera docs/phases/PHASE_8_SEO_ENGINE.md.
 * El inventario y los ejemplos salen del mismo código que evalúa las fichas (js/seo.js + js/logic.js),
 * así que el documento no puede quedar desactualizado. Ejecuta: node scripts/build-seo-doc.js
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const F = require('../js/logic.js');
const S = require('../js/seo.js');

const keep = new Set(['gnc', 'omron', 'gsk']);
const med = { marca: 'MOUNJARO', concentracion: '2.5MG', volumen: '0.6ML', principio: 'TIRZEPATIDA', forma: 'SOL INY', contenido: 'CAJ C/4 PLUMAS', laboratorio: 'ELI LILLY', via: 'Subcutánea', receta: 'si' };
const cos = { marca: 'CeraVe', producto: 'Crema Hidratante', tipo: 'Crema', atributo: 'Ceramidas', contenido: 'Frasco 454 g', fabricante: "L'Oréal" };
const ev = (item, cfg) => S.evaluate(Object.assign({ sku: 'SKU1', img: '/m/o/mounjaro.jpg', ai: {} }, item), { keep, metaCfg: cfg || F.defMeta() });
const pts = n => String(Math.round(n * 100) / 100);
const cell = s => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const yn = b => (b ? 'Sí' : 'No');
const CAT = r => (r.categorias === 'todas' ? 'Todas' : r.categorias.join(', '));
const CONF = r => ({ confirmada: 'Confirmada', provisional: 'Provisional', 'por-categoria': 'Según categoría' }[r.confirmacion]);
const EFECTO = { bloquea: 'Bloquea', avisa: 'Avisa', corrige: 'Corrige', documenta: 'Documenta' };
const SEV = { error: 'Error', warning: 'Aviso', info: 'Informativo' };

const HEAD = '| ID | Clase | Descripción | Fuente (código) | Origen | Categoría | Campo | Tipo | Severidad | Acción | Confirmación | Bloquea | Solo avisa | Corrige solo | Puntos | Evaluada |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|';
const row = r => `| ${r.id} | ${cell(S.CLASES[r.clase])} | ${cell(r.descripcion)} | ${cell(r.fuente)} | ${cell(r.origen)} | ${CAT(r)} | ${cell(r.campo)} | ${r.tipo === 'existente' ? 'Existente' : 'Técnica nueva'} | ${SEV[r.severidad]} | ${cell(r.accion)} | ${CONF(r)} | ${yn(r.efecto === 'bloquea')} | ${yn(r.efecto === 'avisa')} | ${yn(r.efecto === 'corrige')} | ${r.peso || '—'} | ${r.evaluar ? 'Sí' : 'Documental'} |`;
const table = rules => `${HEAD}\n${rules.map(row).join('\n')}`;

const existentes = S.RULES.filter(r => r.tipo === 'existente');
const nuevas = S.RULES.filter(r => r.tipo === 'tecnica');
const porClase = Object.keys(S.CLASES).map(k => `- **${S.CLASES[k]}**: ${S.RULES.filter(r => r.clase === k).map(r => r.id).join(', ')}`).join('\n');
const compRows = Object.entries(S.COMPONENTS).filter(([k]) => k !== 'magento').map(([k, c]) => `| ${c.label} | ${c.max} | ${S.RULES.filter(r => r.componente === k && r.evaluar && r.peso > 0).map(r => `${r.id} (${r.peso})`).join(', ')} |`).join('\n');
const origenRows = Object.entries(S.ORIGEN).map(([k, v]) => `| ${v} | ${S.RULES.filter(r => r.origen.includes(v.split(' (')[0])).length} |`).join('\n');

/* Ejemplos calculados con el código */
const ex1 = ev({ cat: 'med', v: med }), ex2 = ev({ cat: 'med', v: med, img: '' }), ex3 = ev({ cat: 'cos', v: cos }), ex4 = ev({ cat: 'med', v: Object.assign({}, med, { laboratorio: 'Lab que cura todo' }) });
const comp = e => Object.values(e.score.componentes).map(c => `${c.label}: ${c.evaluable ? `${pts(c.obtenidos)}/${pts(c.posibles)}` : 'No evaluable'}`).join(' · ');
const f4 = ex4.findings.find(f => f.id === 'CON-010');
const f3 = ex3.findings.find(f => f.id === 'MT-002');
const rA = ex2.alt.rules.find(r => r.id === 'ALT-001');
const mt3 = ex3.metaTitle.rules.find(r => r.id === 'MT-003'), mt1 = ex1.metaTitle.rules.find(r => r.id === 'MT-003');

const doc = `# Fase 8 — Motor SEO y SEO Score

Contrato: \`fichas.seo.v1\` · Módulo: \`js/seo.js\` · Versión del motor: ${S.VERSION}

> Este documento se genera con \`node scripts/build-seo-doc.js\` a partir del mismo código que evalúa las fichas. El inventario, las fórmulas y los ejemplos no se escriben a mano.

## 1. Principios

- **Primero la regla, después la validación, después el diagnóstico, después el score.** El SEO Score no crea reglas: solo puntúa reglas que existen en el registro (\`S.RULES\`).
- **No hay un segundo motor SEO.** \`seo.js\` consume \`logic.js\` (\`computeFor\`, \`lint\`, \`scanRed\`, \`COMERCIAL_RE\`, \`ALT_BAD_START_RE\`, \`TITLE_MAX\`, \`dupBrand\`, \`defMetaCat\`, \`CATS\`) y \`anomalies.js\` (duplicados). No copia plantillas, límites ni listas de términos.
- **Las reglas existentes confirmadas se conservan exactamente.** Una prueba automática fija los límites (60 / 155 / 125 / 150), las plantillas de la agencia, \`ALT_DEF\`, la lista de claims y el comportamiento de las categorías sin confirmar.
- **Sin factores externos.** No se usa volumen de búsqueda, CTR, ranking, autoridad de dominio, competencia, probabilidad de posicionamiento ni puntajes de palabras clave, porque la herramienta no tiene esos datos.

## 2. Cambios en \`logic.js\` (sin alterar el comportamiento)

Para que \`seo.js\` consuma las reglas en lugar de copiarlas, se expusieron datos que ya existían:

- \`TITLE_MAX\` (150), \`ALT_BAD_START_RE\` y \`dupBrand\` pasaron a \`logic.js\` y se exportan. \`app.js\` usa las mismas.
- \`renderMetaTpl\` y \`buildMeta\` devuelven además \`unknown\`, \`skipped\` y \`blocks\` (propiedades nuevas; las existentes no cambian). Antes, los bloques omitidos y los tokens desconocidos solo se veían como texto de aviso.
- \`rules.js\` exporta \`SRC\` para que una prueba verifique que los orígenes de \`seo.js\` coinciden con los del documento de reglas.

## 3. Inventario de reglas (Fase 1)

Total: **${S.RULES.length}** reglas registradas, **${S.RULES.filter(r => r.evaluar).length}** evaluadas por producto y **${S.RULES.filter(r => !r.evaluar).length}** documentales (se inventarían pero no se evalúan). **${existentes.length}** existentes y **${nuevas.length}** técnicas nuevas.

Clasificación por clase:

${porClase}

Campos de cada regla: ID, descripción, fuente (archivo y símbolo), origen (mismo vocabulario que \`rules.js\`), categoría, campo, tipo, severidad, acción, confirmación, si bloquea, si solo avisa, si corrige solo, puntos y si se evalúa.

Una regla se asigna a **una clase principal**. «Confirmación» puede ser *Confirmada*, *Provisional* o *Según categoría* (confirmada solo si la estructura de meta de esa categoría está confirmada).

### 3.1 Reglas existentes

${table(existentes)}

### 3.2 Reglas técnicas nuevas (Fase 4)

Solo reglas objetivas, verificables con los datos de la ficha.

${table(nuevas)}

## 4. Fuentes

| Origen | Reglas que lo citan |
|---|---|
${origenRows}

- *Regla técnica objetiva (Fase 8)*: hecho verificable en el texto (espacios, separadores, marcadores sin resolver, HTML mal formado, duplicados dentro del lote).
- *Propuesta de la herramienta (Fase 8), sin validar*: criterio propuesto por la herramienta (coherencia entre campos). **No** está confirmado por la agencia ni por Regulatorio.

## 5. Contrato \`fichas.seo.v1\`

\`\`\`
{
  schema: 'fichas.seo.v1', version,
  status,                // listo | pendiente | revisar | critico | sin_evaluar
  score: { total, puntos: { obtenidos, posibles }, componentes: {...}, formula },
  findings: [ ... ],     // reglas con estado Error o Pendiente
  title, metaTitle, metaDescription, alt, content, consistency,   // cada uno con texto, límite, puntos y rules[]
  magento,               // hallazgos de Magento relacionados con SEO (no puntúan) + exportable/razones
  recommendations: [ ... ],
  context: { categoria, confirmada, tieneImagen }
}
\`\`\`

Cada resultado de regla incluye: \`id\`, \`regla\`, \`estado\`, \`simbolo\`, \`severidad\`, \`severidadEfectiva\`, \`resultado\`, \`explicacion\`, \`accion\`, \`confirmada\`, \`bloquea\`, \`peso\`, \`posibles\`, \`obtenidos\`, \`perdidos\`.

## 6. Estados (Fase 6)

| Símbolo | Estado | Significado |
|---|---|---|
| ✓ | Cumple | La regla se evaluó y se cumple. |
| ⚠ | Pendiente | Se incumple como aviso, o falta confirmar algo. |
| ❌ | Error | Se incumple una regla confirmada de severidad error. |
| ℹ | No aplica | La regla no se puede evaluar para este producto. No suma ni resta puntos. |

### NO APLICA

Una regla «No aplica» queda fuera de los puntos posibles y siempre explica el motivo. Casos: otra categoría; regla de lote fuera de un lote; no hay texto que evaluar; no hay límite configurado; estructura confirmada (no se escanea el lenguaje de la meta); y **no hay imagen**.

Ejemplo — producto sin imagen (Mounjaro, sin ruta de imagen): \`ALT-001\` → «${rA.resultado}». Score ${ex2.score.total}/100 (con imagen: ${ex1.score.total}/100). Puntos posibles: ${pts(ex2.score.puntos.posibles)} sin imagen vs ${pts(ex1.score.puntos.posibles)} con imagen. El alt no se califica con 0.

Decisión de diseño a validar: la herramienta exporta el alt a \`base_image_label\` aunque \`base_image\` esté vacío. El motor lo trata como **no evaluable** si no hay ruta de imagen, y muestra igualmente el texto del alt.

## 7. Confirmada vs provisional (Fase 7)

- Una regla **confirmada** viene de una fuente autoritativa (prompt aprobado, agencia de SEO, norma) o es un hecho objetivo.
- Una regla **provisional** es una propuesta sin validar, o depende de una estructura de meta no confirmada para la categoría.
- **Peso:** una regla provisional suma \`peso × ${S.PROVISIONAL_FACTOR}\` a los puntos posibles (y a los obtenidos).
- **Severidad:** una regla provisional nunca produce un *Error* duro; un incumplimiento de severidad error se degrada a *Aviso*.
- **Confirmación por categoría:** solo medicamentos viene confirmada (\`defMetaCat\`). Las demás son provisionales hasta marcar la casilla en Ajustes, pestaña Magento. Mientras no se confirme, se conserva el comportamiento actual: \`meta_title\`, \`meta_description\` y \`short_description\` salen vacías en el CSV de Magento, y la meta se escanea con la lista de claims.

Ejemplo — \`MT-003\` (longitud del meta title): en medicamentos (confirmada) vale ${pts(mt1.posibles)} puntos posibles; en cosméticos (provisional) vale ${pts(mt3.posibles)}. En cosméticos \`MT-002\` queda «${f3 ? f3.estado : '—'}»: ${f3 ? f3.resultado : ''}

## 8. SEO Score (Fase 5)

Componentes y reglas que puntúan:

| Componente | Máximo nominal | Reglas (peso) |
|---|---|---|
${compRows}

Los hallazgos de Magento (\`MAG-*\`) se muestran aparte y **no puntúan**.

### Fórmula

\`\`\`
${S.FORMULA}
\`\`\`

Pérdida por severidad al incumplir: error ${S.SEVERITY_LOSS.error * 100}%, aviso ${S.SEVERITY_LOSS.warning * 100}%, informativo ${S.SEVERITY_LOSS.info * 100}%.

Cada componente muestra \`obtenidos/posibles\` con las mismas reglas; la suma de los componentes es el total. Un producto sin datos es **sin evaluar**, no 0.

### Estado

- **Crítico**: al menos una regla que puntúa en estado Error.
- **Por revisar**: sin errores, al menos un aviso.
- **Pendiente**: solo quedan pendientes informativos (p. ej. estructura de meta sin confirmar).
- **Listo**: todo cumple o no aplica.
- **Sin evaluar**: no hay puntos posibles.

Las notas informativas sin puntos (p. ej. rango de palabras de Merchant Center) y los hallazgos de Magento no cambian el estado.

### Ejemplos

| Caso | Score | Estado | Puntos |
|---|---|---|---|
| Mounjaro, con imagen | ${ex1.score.total} | ${ex1.statusLabel} | ${pts(ex1.score.puntos.obtenidos)}/${pts(ex1.score.puntos.posibles)} |
| Mounjaro, sin imagen | ${ex2.score.total} | ${ex2.statusLabel} | ${pts(ex2.score.puntos.obtenidos)}/${pts(ex2.score.puntos.posibles)} |
| CeraVe (cosméticos, provisional) | ${ex3.score.total} | ${ex3.statusLabel} | ${pts(ex3.score.puntos.obtenidos)}/${pts(ex3.score.puntos.posibles)} |
| Mounjaro con claim «cura» en el laboratorio | ${ex4.score.total} | ${ex4.statusLabel} | ${pts(ex4.score.puntos.obtenidos)}/${pts(ex4.score.puntos.posibles)} |

Desglose del caso 1: ${comp(ex1)}.
Desglose del caso 4: ${comp(ex4)}. Regla incumplida \`CON-010\` (${f4 ? SEV[f4.severidadEfectiva] : ''}): ${f4 ? f4.resultado : ''}

### «¿Por qué obtuve este score?»

La UI muestra, a partir de \`explainScore\`: puntos obtenidos y posibles por componente, la lista de reglas incumplidas con severidad, confirmación, puntos y acción, y la fórmula.

## 9. Regla vs recomendación

| | Regla | Recomendación |
|---|---|---|
| Qué es | Condición verificable con ID, fuente, severidad y peso. | Acción sugerida derivada de una regla incumplida. |
| Puntúa | Sí (si tiene peso). | **No.** |
| Se crea | En el registro \`S.RULES\`. | Se calcula al evaluar. |
| Orden | — | Por prioridad (error, aviso, informativo) y puntos recuperables. |

Una recomendación siempre apunta a una regla (\`reglaId\`). Si la regla es provisional, la recomendación lo indica.

## 10. UI (Fase 8) y lote (Fase 9)

- **Meta y alt**: bloque «SEO Score» con el total y el estado, y un desplegable por componente (Título SEO, Meta title, Meta description, Alt, Contenido, Coherencia). Cada regla muestra Regla, Resultado, Severidad, Explicación y Acción. Incluye «¿Por qué obtuve este score?».
- **Lote**: SEO promedio, mínimo y máximo; una etiqueta «SEO n» por fila; filtros *SEO crítico*, *SEO por revisar*, *SEO pendiente* y *SEO sin evaluar*.

## 11. Score 360 (Fase 10) — solo contrato

\`score360(evaluación, extras)\` expone SEO, Health, Contenido (el componente de contenido del SEO) y Magento (exportable y razones) **sin** calcular un Global Score (\`global: null\`). No hay Global Score ni pantalla 360. Solo existe el contrato de datos para construirlo después.

## 12. Compatibilidad

No cambia \`fichas.lote.v1\`, \`fichas.lote-backup.v1\`, el contrato Magento ni el motor de IA. El CSV de Magento no cambia. \`seo.js\` solo lee.

## 13. Limitaciones

- No mide posicionamiento: el SEO Score mide el **cumplimiento de reglas de la ficha**, no cuánto posicionará. No usa datos externos.
- Los pesos por regla, el factor 0.5 de las reglas provisionales y la pérdida por severidad son **decisiones de diseño**, no calibradas con datos reales.
- Las reglas de coherencia (\`COH-001\`, \`COH-002\`, \`COH-004\`) y el mapa de datos de identidad por categoría (\`IDENTITY\`) son propuestas de la herramienta, sin validar por la agencia.
- Las reglas técnicas nuevas se marcan como confirmadas por ser hechos objetivos; esa clasificación está pendiente de validar.
- Los duplicados (título, meta, SKU) se detectan solo **dentro del lote cargado**.
- \`{tienda}\` se omite si no se configura el nombre de la tienda, y eso baja \`MT-004\` y \`MD-004\` en las categorías con esa estructura.
- Las comparaciones de coherencia son por inclusión de texto (sin acentos ni mayúsculas); pueden fallar con formatos de unidades distintos.
- \`ALT-011\` (palabras repetidas) y la regla de palabra repetida consecutiva pueden dar falsos positivos con nombres de marca legítimos.
- La regla de lenguaje de la meta sigue el comportamiento actual: no se escanea cuando la estructura está confirmada.
- Rendimiento: el motor SEO cuesta alrededor de 0.5 ms por producto (medido: ~0.6 s para 1,000 productos). El cuello de botella del lote es la detección de casi-duplicados que ya existía (\`Anomalies.detectBatch\`, comparación de todos contra todos con Levenshtein): en una prueba sintética tardó segundos con cientos de productos. No se modificó en esta fase.
- Verificado en pruebas automáticas y en un DOM simulado (jsdom); no en un navegador real.
`;

fs.writeFileSync(path.join(__dirname, '..', 'docs', 'phases', 'PHASE_8_SEO_ENGINE.md'), doc);
console.log(`PHASE_8_SEO_ENGINE.md generado: ${S.RULES.length} reglas, ${doc.length} caracteres.`);
