# Fase 8 — Motor SEO y SEO Score

Contrato: `fichas.seo.v1` · Módulo: `js/seo.js` · Versión del motor: 1.0

> Este documento se genera con `node scripts/build-seo-doc.js` a partir del mismo código que evalúa las fichas. El inventario, las fórmulas y los ejemplos no se escriben a mano.

## 1. Principios

- **Primero la regla, después la validación, después el diagnóstico, después el score.** El SEO Score no crea reglas: solo puntúa reglas que existen en el registro (`S.RULES`).
- **No hay un segundo motor SEO.** `seo.js` consume `logic.js` (`computeFor`, `lint`, `scanRed`, `COMERCIAL_RE`, `ALT_BAD_START_RE`, `TITLE_MAX`, `dupBrand`, `defMetaCat`, `CATS`) y `anomalies.js` (duplicados). No copia plantillas, límites ni listas de términos.
- **Las reglas existentes confirmadas se conservan exactamente.** Una prueba automática fija los límites (60 / 155 / 125 / 150), las plantillas de la agencia, `ALT_DEF`, la lista de claims y el comportamiento de las categorías sin confirmar.
- **Sin factores externos.** No se usa volumen de búsqueda, CTR, ranking, autoridad de dominio, competencia, probabilidad de posicionamiento ni puntajes de palabras clave, porque la herramienta no tiene esos datos.

## 2. Cambios en `logic.js` (sin alterar el comportamiento)

Para que `seo.js` consuma las reglas en lugar de copiarlas, se expusieron datos que ya existían:

- `TITLE_MAX` (150), `ALT_BAD_START_RE` y `dupBrand` pasaron a `logic.js` y se exportan. `app.js` usa las mismas.
- `renderMetaTpl` y `buildMeta` devuelven además `unknown`, `skipped` y `blocks` (propiedades nuevas; las existentes no cambian). Antes, los bloques omitidos y los tokens desconocidos solo se veían como texto de aviso.
- `rules.js` exporta `SRC` para que una prueba verifique que los orígenes de `seo.js` coinciden con los del documento de reglas.

## 3. Inventario de reglas (Fase 1)

Total: **60** reglas registradas, **55** evaluadas por producto y **5** documentales (se inventarían pero no se evalúan). **48** existentes y **12** técnicas nuevas.

Clasificación por clase:

- **Título**: TIT-001
- **Merchant Center**: MC-001, MC-002
- **Meta title**: MT-001
- **Meta description**: MD-001
- **Alt**: ALT-001, ALT-003
- **Claims**: MT-006, MT-007, MD-006, MD-007, ALT-004, CON-010, CON-011, CON-012, CON-013, CON-014
- **Longitud**: TIT-003, MT-003, MD-003, ALT-002
- **Estructura**: TIT-008, TIT-010, MT-004, MT-005, MT-010, MD-004, MD-005, MD-010, ALT-005, ALT-006, ALT-010, ALT-020, CON-020
- **Campos obligatorios**: TIT-002, CON-001
- **Duplicación**: TIT-004, TIT-005, TIT-006, TIT-007, MT-008, MD-008, ALT-011, COH-003, MAG-005
- **Coherencia**: COH-001, COH-002, COH-004, COH-006
- **Confirmación por categoría**: MT-002, MD-002, CAT-001
- **Imagen**: IMG-001
- **Contenido**: CON-002, CON-004
- **Magento relacionado con SEO**: MAG-001, MAG-002, MAG-003, MAG-004, MAG-006

Campos de cada regla: ID, descripción, fuente (archivo y símbolo), origen (mismo vocabulario que `rules.js`), categoría, campo, tipo, severidad, acción, confirmación, si bloquea, si solo avisa, si corrige solo, puntos y si se evalúa.

Una regla se asigna a **una clase principal**. «Confirmación» puede ser *Confirmada*, *Provisional* o *Según categoría* (confirmada solo si la estructura de meta de esa categoría está confirmada).

### 3.1 Reglas existentes

| ID | Clase | Descripción | Fuente (código) | Origen | Categoría | Campo | Tipo | Severidad | Acción | Confirmación | Bloquea | Solo avisa | Corrige solo | Puntos | Evaluada |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| TIT-001 | Título | El título se puede armar con los datos capturados. | logic.js: CATS[cat].title, buildTitle | Prompt aprobado de títulos | Todas | title | Existente | Error | Captura la marca y los demás datos obligatorios de la categoría. | Confirmada | Sí | No | No | 4 | Sí |
| TIT-002 | Campos obligatorios | Todos los segmentos obligatorios del título están completos. | logic.js: buildTitle (title.missing); app.js: statusOf; magentoBatch (excluded.faltantes) | Prompt aprobado de títulos | Todas | title | Existente | Aviso | Completa los datos que faltan (ver «Datos que hicieron falta» en la pestaña Título). | Confirmada | Sí | No | No | 5 | Sí |
| TIT-003 | Longitud | El título no supera el límite de Merchant Center. | logic.js: TITLE_MAX; app.js: panelTitle | Criterio de la herramienta (límite de Google Merchant Center) | Todas | title | Existente | Aviso | Acorta el título o revisa los datos de entrada. | Confirmada | No | Sí | No | 3 | Sí |
| TIT-004 | Duplicación | La marca no se repite dentro del título. | logic.js: dupBrand | Prompt aprobado de títulos; Prompt aprobado de descripciones de Magento | Todas | title | Existente | Aviso | Quita la marca repetida del nombre del producto. | Confirmada | No | Sí | No | 3 | Sí |
| TIT-005 | Duplicación | El título es único dentro del lote. | anomalies.js: detectBatch (duplicate-title) | Criterio de la herramienta | Todas | title | Existente | Aviso | Diferencia los productos (presentación, concentración, variante) o elimina el duplicado. | Confirmada | No | Sí | No | 3 | Sí |
| TIT-006 | Duplicación | El título no es casi idéntico a otro del lote. | anomalies.js: detectBatch (near-duplicate-title) | Criterio de la herramienta | Todas | title | Existente | Informativo | Revisa si son productos distintos o variantes. | Confirmada | No | Sí | No | — | Sí |
| TIT-007 | Duplicación | No se repite el tipo que ya está en el nombre del producto (corrección automática). | logic.js: dedupeFields | Prompt aprobado de títulos; Prompt aprobado de descripciones de Magento | Todas | title | Existente | Informativo | Ninguna: es una corrección automática. | Confirmada | No | No | Sí | — | Sí |
| TIT-008 | Estructura | Unidades, mayúsculas y abreviaturas se normalizan (corrección automática). | logic.js: values, normUnits, fixCaps, expandPres | Prompt aprobado de títulos; Prompt aprobado de Merchant Center; Prompt aprobado de descripciones de Magento | Todas | title | Existente | Informativo | Ninguna: es una corrección automática. | Confirmada | No | No | Sí | — | Sí |
| MC-001 | Merchant Center | La descripción de Merchant Center está dentro del rango de palabras de la categoría. | logic.js: CATS[cat].range; app.js: panelMC | Prompt aprobado de Merchant Center | med, dis, cos, sup | mc | Existente | Informativo | Si falta contenido, completa los datos de la categoría; no se agrega relleno. | Confirmada | No | Sí | No | — | Sí |
| MC-002 | Merchant Center | Las leyendas de dosis y uso de Merchant Center son las aprobadas y no se reescriben. | logic.js: LEGEND, CATS[cat].mc | Prompt aprobado de Merchant Center | Todas | mc | Existente | Informativo | Ninguna. | Confirmada | No | No | No | — | Documental |
| MT-001 | Meta title | Se genera el meta title. | logic.js: buildMeta, renderMetaTpl | Estructura de la agencia de SEO | Todas | metaTitle | Existente | Error | Captura los datos que alimentan la estructura de meta title o revisa la estructura en Ajustes, pestaña Magento. | Según categoría | Sí | No | No | 4 | Sí |
| MT-002 | Confirmación por categoría | La estructura de meta title de la categoría está confirmada. | logic.js: defMetaCat (confirmed); magentoBatch (sinMeta) | Estructura de la agencia de SEO | Todas | metaTitle | Existente | Informativo | Confirma la estructura con la agencia de SEO (Ajustes, pestaña Magento) y marca la casilla. | Confirmada | Sí | No | No | — | Sí |
| MT-003 | Longitud | Meta title no supera el límite de caracteres de su estructura (60 por defecto). | logic.js: META_MED.mt.max, META_GEN.mt.max, buildMeta (over) | Estructura de la agencia de SEO | Todas | metaTitle | Existente | Aviso | Acorta el meta title o ajusta los datos de origen. | Según categoría | No | Sí | No | 4 | Sí |
| MT-004 | Estructura | Todos los bloques de la estructura de meta title se generaron. | logic.js: renderMetaTpl (skipped) | Estructura de la agencia de SEO | Todas | metaTitle | Existente | Aviso | Completa los datos de los bloques omitidos. | Según categoría | No | Sí | No | 4 | Sí |
| MT-005 | Estructura | La estructura de meta title no usa tokens desconocidos. | logic.js: buildMeta (unknown) | Estructura de la agencia de SEO | Todas | metaTitle | Existente | Aviso | Corrige la estructura en Ajustes, pestaña Magento. | Según categoría | No | Sí | No | 1 | Sí |
| MT-006 | Claims | Meta title no contiene claims ni lenguaje subjetivo (solo en categorías sin estructura confirmada). | logic.js: scanRed, RED, COS_CLAIM; buildMeta | Criterio de la herramienta | Todas | metaTitle | Existente | Aviso | Reescribe el texto sin el término señalado. | Según categoría | No | Sí | No | 2 | Sí |
| MT-007 | Claims | Meta title de medicamentos no usa lenguaje comercial (solo con estructura sin confirmar). | logic.js: COMERCIAL_RE; buildMeta | Por completar por Regulatorio | med | metaTitle | Existente | Aviso | Confirma con Regulatorio que el término sea aceptable o quítalo. | Según categoría | No | Sí | No | 1 | Sí |
| MD-001 | Meta description | Se genera la meta description. | logic.js: buildMeta, renderMetaTpl | Estructura de la agencia de SEO | Todas | metaDescription | Existente | Error | Captura los datos que alimentan la estructura de meta description o revisa la estructura en Ajustes, pestaña Magento. | Según categoría | Sí | No | No | 4 | Sí |
| MD-002 | Confirmación por categoría | La estructura de meta description de la categoría está confirmada. | logic.js: defMetaCat (confirmed); magentoBatch (sinMeta) | Estructura de la agencia de SEO | Todas | metaDescription | Existente | Informativo | Confirma la estructura con la agencia de SEO (Ajustes, pestaña Magento) y marca la casilla. | Confirmada | Sí | No | No | — | Sí |
| MD-003 | Longitud | Meta description no supera el límite de caracteres de su estructura (155 por defecto). | logic.js: META_MED.md.max, META_GEN.md.max, buildMeta (over) | Estructura de la agencia de SEO | Todas | metaDescription | Existente | Aviso | Acorta la meta description o ajusta los datos de origen. | Según categoría | No | Sí | No | 4 | Sí |
| MD-004 | Estructura | Todos los bloques de la estructura de meta description se generaron. | logic.js: renderMetaTpl (skipped) | Estructura de la agencia de SEO | Todas | metaDescription | Existente | Aviso | Completa los datos de los bloques omitidos. | Según categoría | No | Sí | No | 4 | Sí |
| MD-005 | Estructura | La estructura de meta description no usa tokens desconocidos. | logic.js: buildMeta (unknown) | Estructura de la agencia de SEO | Todas | metaDescription | Existente | Aviso | Corrige la estructura en Ajustes, pestaña Magento. | Según categoría | No | Sí | No | 1 | Sí |
| MD-006 | Claims | Meta description no contiene claims ni lenguaje subjetivo (solo en categorías sin estructura confirmada). | logic.js: scanRed, RED, COS_CLAIM; buildMeta | Criterio de la herramienta | Todas | metaDescription | Existente | Aviso | Reescribe el texto sin el término señalado. | Según categoría | No | Sí | No | 2 | Sí |
| MD-007 | Claims | Meta description de medicamentos no usa lenguaje comercial (solo con estructura sin confirmar). | logic.js: COMERCIAL_RE; buildMeta | Por completar por Regulatorio | med | metaDescription | Existente | Aviso | Confirma con Regulatorio que el término sea aceptable o quítalo. | Según categoría | No | Sí | No | 1 | Sí |
| IMG-001 | Imagen | Hay una ruta de imagen principal. | logic.js: magentoBatch (sinImagen) | Formato de carga de Magento (Batch) | Todas | img | Existente | Informativo | Si en la prueba de Magento no se aplica el alt, agrega la ruta de la imagen. | Confirmada | No | No | No | — | Sí |
| ALT-001 | Alt | Se genera el alt de la imagen. | logic.js: ALT_DEF, buildMeta | Estructura de la agencia de SEO | Todas | alt | Existente | Error | Captura los datos que alimentan el alt. | Confirmada | No | Sí | No | 4 | Sí |
| ALT-002 | Longitud | El alt no supera el límite de caracteres (125 por defecto). | logic.js: defMetaCat (alt.max), buildMeta (over); magentoBatch (altLargos) | Criterio de la herramienta | Todas | alt | Existente | Aviso | Acorta el alt. | Confirmada | No | Sí | No | 3 | Sí |
| ALT-003 | Alt | El alt no empieza con «imagen de» ni «foto de». | logic.js: ALT_BAD_START_RE, buildMeta | Criterio de la herramienta | Todas | alt | Existente | Aviso | Quita el prefijo y describe el producto. | Confirmada | No | Sí | No | 3 | Sí |
| ALT-004 | Claims | El alt no contiene claims ni lenguaje subjetivo. | logic.js: scanRed, RED, COS_CLAIM | Criterio de la herramienta | Todas | alt | Existente | Aviso | Reescribe el alt sin el término señalado. | Confirmada | No | Sí | No | 2 | Sí |
| ALT-005 | Estructura | Todos los bloques de la estructura de alt se generaron. | logic.js: renderMetaTpl (skipped) | Criterio de la herramienta | Todas | alt | Existente | Aviso | Completa los datos de los bloques omitidos. | Confirmada | No | Sí | No | 1 | Sí |
| ALT-006 | Estructura | La estructura de alt no usa tokens desconocidos. | logic.js: buildMeta (unknown) | Criterio de la herramienta | Todas | alt | Existente | Aviso | Corrige la estructura de alt en Ajustes, pestaña Magento. | Confirmada | No | Sí | No | — | Sí |
| ALT-020 | Estructura | La estructura del alt de cada categoría es la definida en ALT_DEF. | logic.js: ALT_DEF | Estructura de la agencia de SEO | Todas | alt | Existente | Informativo | Ninguna. | Confirmada | No | No | No | — | Documental |
| CON-001 | Campos obligatorios | La descripción de Magento se genera (datos regulatorios y vitales presentes). | logic.js: buildMg (blocked), CATS[cat].vital | Prompt aprobado de descripciones de Magento | Todas | magentoHtml | Existente | Error | Completa el dato que bloquea el HTML. | Confirmada | Sí | No | No | 4 | Sí |
| CON-002 | Contenido | Las descripciones usan todos los datos disponibles de la categoría. | logic.js: buildMC (omitted), buildMg (omitted) | Prompt aprobado de Merchant Center; Prompt aprobado de descripciones de Magento | Todas | mc | Existente | Aviso | Completa los datos omitidos. | Confirmada | No | Sí | No | 2 | Sí |
| CON-010 | Claims | Los datos de entrada no contienen claims prohibidos. | logic.js: lint (RED kind=claim, COS_CLAIM) | Criterio de la herramienta; NOM-141-SSA1/SCFI-2012 | Todas | v.* | Existente | Error | Corrige el dato de entrada que contiene el claim. | Confirmada | No | Sí | No | 3 | Sí |
| CON-011 | Claims | Los datos de entrada no contienen lenguaje subjetivo o superlativo. | logic.js: lint (RED kind=vacio) | Criterio de la herramienta | Todas | v.* | Existente | Aviso | Reescribe el dato de entrada con una descripción objetiva. | Confirmada | No | Sí | No | 2 | Sí |
| CON-012 | Claims | Las afirmaciones que requieren validación están respaldadas en la ficha de origen. | logic.js: lint (AMBER) | Criterio de la herramienta | Todas | v.* | Existente | Aviso | Valida la afirmación contra la ficha de origen. | Confirmada | No | Sí | No | 1 | Sí |
| CON-013 | Claims | Cosméticos: no se atribuyen acciones propias de medicamentos. | logic.js: lint (COS_MED) | NOM-141-SSA1/SCFI-2012; Por completar por Regulatorio | cos | v.* | Existente | Aviso | Quita el término de acción medicinal. | Provisional | No | Sí | No | 1 | Sí |
| CON-014 | Claims | Cosméticos: FPS, nivel, modo de uso y precauciones son coherentes con la norma. | logic.js: lint (check), nivelPorFps | NOM-141-SSA1/SCFI-2012; Por completar por Regulatorio | cos | v.fps | Existente | Aviso | Confirma el dato contra el empaque y captúralo. | Provisional | No | Sí | No | 1 | Sí |
| CON-020 | Estructura | La descripción de Magento sigue la plantilla aprobada de la categoría. | logic.js: CATS[cat].mg, assemble | Prompt aprobado de descripciones de Magento | Todas | magentoHtml | Existente | Informativo | Ninguna. | Confirmada | No | No | No | — | Documental |
| COH-006 | Coherencia | Medicamentos: la meta description es coherente con la declaración de receta. | logic.js: buildMeta (receta_txt); rules.js sección 5 | Estructura de la agencia de SEO | med | metaDescription | Existente | Error | Revisa el dato de receta o la estructura de la meta description. | Según categoría | No | Sí | No | 2 | Sí |
| MAG-001 | Magento relacionado con SEO | El producto tiene SKU. | logic.js: magentoBatch (sinSku) | Formato de carga de Magento (Batch) | Todas | sku | Existente | Informativo | Captura el SKU tal como está en Magento. | Confirmada | Sí | No | No | — | Sí |
| MAG-002 | Magento relacionado con SEO | Las comas internas de los textos se reemplazan por «;» al exportar (corrección automática). | logic.js: sanitizeMagentoCell, MAG_CONTRACT | Formato de carga de Magento (Batch) | Todas | metaDescription | Existente | Informativo | Ninguna: se aplica al exportar. Revisa el resultado en la prueba de carga. | Confirmada | No | No | Sí | — | Sí |
| MAG-003 | Magento relacionado con SEO | short_description lleva el mismo texto que la meta description. | logic.js: magentoBatch | Estructura de la agencia de SEO | Todas | metaDescription | Existente | Informativo | Ninguna. | Confirmada | No | No | No | — | Sí |
| MAG-004 | Magento relacionado con SEO | Los datos de IA sin confirmar están confirmados antes de exportar. | logic.js: magentoBatch (ia); app.js: unconfirmed | Criterio de la herramienta | Todas | ai | Existente | Informativo | Confirma o corrige los datos de IA en el lote. | Confirmada | Sí | No | No | — | Sí |
| MAG-005 | Duplicación | El SKU es único dentro del lote. | anomalies.js: detectBatch (duplicate-sku) | Criterio de la herramienta | Todas | sku | Existente | Error | Corrige el SKU repetido. | Confirmada | No | Sí | No | — | Sí |
| MAG-006 | Magento relacionado con SEO | El CSV mantiene las 104 columnas del formato Batch y el contrato de comas y saltos de línea. | logic.js: MAG_HEADER, MAG_CONTRACT, validateMagentoExport | Formato de carga de Magento (Batch) | Todas | csv | Existente | Informativo | Ninguna. | Confirmada | Sí | No | No | — | Documental |
| CAT-001 | Confirmación por categoría | Solo medicamentos viene con la estructura de meta confirmada; las demás categorías son provisionales hasta que se confirmen. | logic.js: defMetaCat (confirmed: id === "med") | Estructura de la agencia de SEO | Todas | metaTitle | Existente | Informativo | Confirma cada categoría con la agencia de SEO. | Confirmada | No | No | No | — | Documental |

### 3.2 Reglas técnicas nuevas (Fase 4)

Solo reglas objetivas, verificables con los datos de la ficha.

| ID | Clase | Descripción | Fuente (código) | Origen | Categoría | Campo | Tipo | Severidad | Acción | Confirmación | Bloquea | Solo avisa | Corrige solo | Puntos | Evaluada |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| TIT-010 | Estructura | El título no tiene espacios, separadores ni caracteres problemáticos. | seo.js: hygiene | Regla técnica objetiva (Fase 8) | Todas | title | Técnica nueva | Aviso | Corrige el dato de origen que produce el defecto. | Confirmada | No | Sí | No | 2 | Sí |
| MT-008 | Duplicación | Meta title es único dentro del lote. | seo.js: evaluateBatch | Regla técnica objetiva (Fase 8) | Todas | metaTitle | Técnica nueva | Aviso | Diferencia los productos en los datos que alimentan la meta. | Según categoría | No | Sí | No | 2 | Sí |
| MT-010 | Estructura | Meta title no tiene espacios, separadores ni caracteres problemáticos. | seo.js: hygiene | Regla técnica objetiva (Fase 8) | Todas | metaTitle | Técnica nueva | Aviso | Corrige el dato de origen que produce el defecto. | Confirmada | No | Sí | No | 2 | Sí |
| MD-008 | Duplicación | Meta description es único dentro del lote. | seo.js: evaluateBatch | Regla técnica objetiva (Fase 8) | Todas | metaDescription | Técnica nueva | Aviso | Diferencia los productos en los datos que alimentan la meta. | Según categoría | No | Sí | No | 2 | Sí |
| MD-010 | Estructura | Meta description no tiene espacios, separadores ni caracteres problemáticos. | seo.js: hygiene | Regla técnica objetiva (Fase 8) | Todas | metaDescription | Técnica nueva | Aviso | Corrige el dato de origen que produce el defecto. | Confirmada | No | Sí | No | 2 | Sí |
| ALT-010 | Estructura | El alt no tiene espacios, separadores ni caracteres problemáticos. | seo.js: hygiene | Regla técnica objetiva (Fase 8) | Todas | alt | Técnica nueva | Aviso | Corrige el dato de origen que produce el defecto. | Confirmada | No | Sí | No | 1 | Sí |
| ALT-011 | Duplicación | El alt no repite palabras. | index.html/app.js: indicación del alt; seo.js: repeatedWords | Regla técnica objetiva (Fase 8) | Todas | alt | Técnica nueva | Aviso | Quita la palabra repetida. | Confirmada | No | Sí | No | 1 | Sí |
| CON-004 | Contenido | Merchant Center y el HTML de Magento no tienen defectos de formato (HTML bien formado, sin marcadores sin resolver). | seo.js: hygiene, htmlProblems | Regla técnica objetiva (Fase 8) | Todas | magentoHtml | Técnica nueva | Aviso | Corrige el dato de origen o reporta el defecto. | Confirmada | No | Sí | No | 1 | Sí |
| COH-001 | Coherencia | La marca aparece en el título, el meta title, la meta description y el alt. | seo.js: IDENTITY | Propuesta de la herramienta (Fase 8), sin validar | Todas | marca | Técnica nueva | Aviso | Revisa la estructura del campo donde falta la marca. | Provisional | No | Sí | No | 3 | Sí |
| COH-002 | Coherencia | Los datos clave del título (concentración, modelo, principio activo, producto) aparecen en el meta title. | seo.js: IDENTITY | Propuesta de la herramienta (Fase 8), sin validar | Todas | metaTitle | Técnica nueva | Aviso | Ajusta la estructura del meta title para incluir el dato. | Provisional | No | Sí | No | 2 | Sí |
| COH-003 | Duplicación | El meta title y la meta description no son idénticos. | seo.js | Regla técnica objetiva (Fase 8) | Todas | metaDescription | Técnica nueva | Aviso | Diferencia las estructuras de meta title y meta description. | Confirmada | No | Sí | No | 1 | Sí |
| COH-004 | Coherencia | Los datos clave de la meta description aparecen en el contenido de Magento. | seo.js: IDENTITY | Propuesta de la herramienta (Fase 8), sin validar | Todas | metaDescription | Técnica nueva | Aviso | Revisa la estructura de la meta description o los datos de origen. | Provisional | No | Sí | No | 2 | Sí |

## 4. Fuentes

| Origen | Reglas que lo citan |
|---|---|
| Prompt aprobado de títulos | 5 |
| Prompt aprobado de Merchant Center | 4 |
| Prompt aprobado de descripciones de Magento | 6 |
| Estructura de la agencia de SEO | 15 |
| Formato de carga de Magento (Batch) | 4 |
| NOM-141-SSA1/SCFI-2012 | 3 |
| Criterio de la herramienta | 15 |
| Por completar por Regulatorio | 4 |
| Regla técnica objetiva (Fase 8) | 9 |
| Propuesta de la herramienta (Fase 8), sin validar | 3 |

- *Regla técnica objetiva (Fase 8)*: hecho verificable en el texto (espacios, separadores, marcadores sin resolver, HTML mal formado, duplicados dentro del lote).
- *Propuesta de la herramienta (Fase 8), sin validar*: criterio propuesto por la herramienta (coherencia entre campos). **No** está confirmado por la agencia ni por Regulatorio.

## 5. Contrato `fichas.seo.v1`

```
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
```

Cada resultado de regla incluye: `id`, `regla`, `estado`, `simbolo`, `severidad`, `severidadEfectiva`, `resultado`, `explicacion`, `accion`, `confirmada`, `bloquea`, `peso`, `posibles`, `obtenidos`, `perdidos`.

## 6. Estados (Fase 6)

| Símbolo | Estado | Significado |
|---|---|---|
| ✓ | Cumple | La regla se evaluó y se cumple. |
| ⚠ | Pendiente | Se incumple como aviso, o falta confirmar algo. |
| ❌ | Error | Se incumple una regla confirmada de severidad error. |
| ℹ | No aplica | La regla no se puede evaluar para este producto. No suma ni resta puntos. |

### NO APLICA

Una regla «No aplica» queda fuera de los puntos posibles y siempre explica el motivo. Casos: otra categoría; regla de lote fuera de un lote; no hay texto que evaluar; no hay límite configurado; estructura confirmada (no se escanea el lenguaje de la meta); y **no hay imagen**.

Ejemplo — producto sin imagen (Mounjaro, sin ruta de imagen): `ALT-001` → «No evaluable — no hay imagen.». Score 100/100 (con imagen: 100/100). Puntos posibles: 66.5 sin imagen vs 81.5 con imagen. El alt no se califica con 0.

Decisión de diseño a validar: la herramienta exporta el alt a `base_image_label` aunque `base_image` esté vacío. El motor lo trata como **no evaluable** si no hay ruta de imagen, y muestra igualmente el texto del alt.

## 7. Confirmada vs provisional (Fase 7)

- Una regla **confirmada** viene de una fuente autoritativa (prompt aprobado, agencia de SEO, norma) o es un hecho objetivo.
- Una regla **provisional** es una propuesta sin validar, o depende de una estructura de meta no confirmada para la categoría.
- **Peso:** una regla provisional suma `peso × 0.5` a los puntos posibles (y a los obtenidos).
- **Severidad:** una regla provisional nunca produce un *Error* duro; un incumplimiento de severidad error se degrada a *Aviso*.
- **Confirmación por categoría:** solo medicamentos viene confirmada (`defMetaCat`). Las demás son provisionales hasta marcar la casilla en Ajustes, pestaña Magento. Mientras no se confirme, se conserva el comportamiento actual: `meta_title`, `meta_description` y `short_description` salen vacías en el CSV de Magento, y la meta se escanea con la lista de claims.

Ejemplo — `MT-003` (longitud del meta title): en medicamentos (confirmada) vale 4 puntos posibles; en cosméticos (provisional) vale 2. En cosméticos `MT-002` queda «pendiente»: Estructura sin confirmar: meta_title, meta_description y short_description salen vacías en el CSV de Magento.

## 8. SEO Score (Fase 5)

Componentes y reglas que puntúan:

| Componente | Máximo nominal | Reglas (peso) |
|---|---|---|
| Título SEO | 20 | TIT-001 (4), TIT-002 (5), TIT-003 (3), TIT-004 (3), TIT-005 (3), TIT-010 (2) |
| Meta title | 20 | MT-001 (4), MT-003 (4), MT-004 (4), MT-005 (1), MT-006 (2), MT-007 (1), MT-008 (2), MT-010 (2) |
| Meta description | 20 | MD-001 (4), MD-003 (4), MD-004 (4), MD-005 (1), MD-006 (2), MD-007 (1), MD-008 (2), MD-010 (2) |
| Alt | 15 | ALT-001 (4), ALT-002 (3), ALT-003 (3), ALT-004 (2), ALT-005 (1), ALT-010 (1), ALT-011 (1) |
| Contenido | 15 | CON-001 (4), CON-002 (2), CON-004 (1), CON-010 (3), CON-011 (2), CON-012 (1), CON-013 (1), CON-014 (1) |
| Coherencia | 10 | COH-001 (3), COH-002 (2), COH-003 (1), COH-004 (2), COH-006 (2) |

Los hallazgos de Magento (`MAG-*`) se muestran aparte y **no puntúan**.

### Fórmula

```
SEO total = round(100 × Σ puntos obtenidos ÷ Σ puntos posibles). Posibles de una regla = peso × (1 si es confirmada, 0.5 si es provisional); las reglas «No aplica» no suman. Obtenidos = posibles × (1 − pérdida): cumple 0%, aviso 50%, error 100%, informativo 0%.
```

Pérdida por severidad al incumplir: error 100%, aviso 50%, informativo 0%.

Cada componente muestra `obtenidos/posibles` con las mismas reglas; la suma de los componentes es el total. Un producto sin datos es **sin evaluar**, no 0.

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
| Mounjaro, con imagen | 100 | SEO listo | 81.5/81.5 |
| Mounjaro, sin imagen | 100 | SEO listo | 66.5/66.5 |
| CeraVe (cosméticos, provisional) | 96 | SEO por revisar | 66.5/69.5 |
| Mounjaro con claim «cura» en el laboratorio | 96 | SEO crítico | 78.5/81.5 |

Desglose del caso 1: Título SEO: 17/17 · Meta title: 15/15 · Meta description: 15/15 · Alt: 15/15 · Contenido: 13/13 · Coherencia: 6.5/6.5.
Desglose del caso 4: Título SEO: 17/17 · Meta title: 15/15 · Meta description: 15/15 · Alt: 15/15 · Contenido: 10/13 · Coherencia: 6.5/6.5. Regla incumplida `CON-010` (Error): «cura» en Laboratorio.

### «¿Por qué obtuve este score?»

La UI muestra, a partir de `explainScore`: puntos obtenidos y posibles por componente, la lista de reglas incumplidas con severidad, confirmación, puntos y acción, y la fórmula.

## 9. Regla vs recomendación

| | Regla | Recomendación |
|---|---|---|
| Qué es | Condición verificable con ID, fuente, severidad y peso. | Acción sugerida derivada de una regla incumplida. |
| Puntúa | Sí (si tiene peso). | **No.** |
| Se crea | En el registro `S.RULES`. | Se calcula al evaluar. |
| Orden | — | Por prioridad (error, aviso, informativo) y puntos recuperables. |

Una recomendación siempre apunta a una regla (`reglaId`). Si la regla es provisional, la recomendación lo indica.

## 10. UI (Fase 8) y lote (Fase 9)

- **Meta y alt**: bloque «SEO Score» con el total y el estado, y un desplegable por componente (Título SEO, Meta title, Meta description, Alt, Contenido, Coherencia). Cada regla muestra Regla, Resultado, Severidad, Explicación y Acción. Incluye «¿Por qué obtuve este score?».
- **Lote**: SEO promedio, mínimo y máximo; una etiqueta «SEO n» por fila; filtros *SEO crítico*, *SEO por revisar*, *SEO pendiente* y *SEO sin evaluar*.

## 11. Score 360 (Fase 10) — solo contrato

`score360(evaluación, extras)` expone SEO, Health, Contenido (el componente de contenido del SEO) y Magento (exportable y razones) **sin** calcular un Global Score (`global: null`). No hay Global Score ni pantalla 360. Solo existe el contrato de datos para construirlo después.

## 12. Compatibilidad

No cambia `fichas.lote.v1`, `fichas.lote-backup.v1`, el contrato Magento ni el motor de IA. El CSV de Magento no cambia. `seo.js` solo lee.

## 13. Limitaciones

- No mide posicionamiento: el SEO Score mide el **cumplimiento de reglas de la ficha**, no cuánto posicionará. No usa datos externos.
- Los pesos por regla, el factor 0.5 de las reglas provisionales y la pérdida por severidad son **decisiones de diseño**, no calibradas con datos reales.
- Las reglas de coherencia (`COH-001`, `COH-002`, `COH-004`) y el mapa de datos de identidad por categoría (`IDENTITY`) son propuestas de la herramienta, sin validar por la agencia.
- Las reglas técnicas nuevas se marcan como confirmadas por ser hechos objetivos; esa clasificación está pendiente de validar.
- Los duplicados (título, meta, SKU) se detectan solo **dentro del lote cargado**.
- `{tienda}` se omite si no se configura el nombre de la tienda, y eso baja `MT-004` y `MD-004` en las categorías con esa estructura.
- Las comparaciones de coherencia son por inclusión de texto (sin acentos ni mayúsculas); pueden fallar con formatos de unidades distintos.
- `ALT-011` (palabras repetidas) y la regla de palabra repetida consecutiva pueden dar falsos positivos con nombres de marca legítimos.
- La regla de lenguaje de la meta sigue el comportamiento actual: no se escanea cuando la estructura está confirmada.
- Rendimiento: el motor SEO cuesta alrededor de 0.5 ms por producto (medido: ~0.6 s para 1,000 productos). El cuello de botella del lote es la detección de casi-duplicados que ya existía (`Anomalies.detectBatch`, comparación de todos contra todos con Levenshtein): en una prueba sintética tardó segundos con cientos de productos. No se modificó en esta fase.
- Verificado en pruebas automáticas y en un DOM simulado (jsdom); no en un navegador real.
