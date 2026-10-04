# Fase 9 — Content Score, Magento Readiness y Score 360°

La Fase 8 (motor SEO) no se tocó. La Fase 9 agrega tres módulos que **consumen** los motores existentes y no duplican ninguno.

## Arquitectura

```
logic.js (computeFor, lint, contrato Magento) ─┬─> quality.js ─> health.js   (Health)
                                               ├─> seo.js                    (SEO)
                                               ├─> content.js                (Content)   NUEVO
                                               └─> magento-readiness.js      (Magento)   NUEVO
                              Health + SEO + Content + Magento ─> score360.js (360°)     NUEVO
```

| Módulo | Contrato | Qué evalúa | Qué NO hace |
|---|---|---|---|
| `js/content.js` | `fichas.content.v1` | Calidad editorial e informativa de la ficha | No valida datos (eso es Quality), no evalúa título/meta/alt (eso es SEO) |
| `js/magento-readiness.js` | `fichas.magento.readiness.v1` | Si el producto sale en el CSV de Magento y con qué advertencias | No reemplaza ni modifica el contrato Magento de `logic.js` |
| `js/score360.js` | `fichas.score360.v1` | Combina los cuatro ejes y unifica recomendaciones | No vuelve a validar datos; solo lee resultados ya calculados |

Resultados de cada motor (auditados antes de construir): Health devuelve `score`, `band`, `dimensions`; SEO devuelve `score.total`, `status`, `findings`, `recommendations`; Quality devuelve `issues` y `counts` (Score 360 lee `issues` para unificar recomendaciones); el contrato Magento devuelve `{header, rows, excluded, contract:{ok, errors}}`.

## Content Score

Reglas en el inventario `RULES` de `content.js`. Cada punto sale de una regla con id, peso, severidad y resultado. No hay IA, no hay red, y ninguna regla mide la cantidad de palabras.

`Content = round(100 × Σ obtenidos ÷ Σ posibles)`. Cumple = 0 % de pérdida; aviso = 50 %; error = 100 %; informativo = 0 %. Las reglas «No aplica» no suman.

| Dimensión (máx.) | Reglas |
|---|---|
| Completitud (20) | CMP-001 identidad, CMP-002 información técnica, CMP-003 laboratorio/fabricante |
| Ficha técnica (15) | FT-001 lista presente, FT-002 los datos capturados llegan al texto, FT-003 sin entradas vacías |
| Descripción (10) | DES-001 existe, DES-002 nombra marca e identificador, DES-003 sin relleno («N/A», «pendiente», «lorem») |
| Presentación y forma (10) | PRE-001 cantidad y unidad, PRE-002 forma reconocida |
| Coherencia (15) | COH-C01 forma↔vía, COH-C02 receta vs. textos, COH-C03 concentración vs. otras cifras, COH-C04 volumen en forma sólida |
| Seguridad y conservación (10) | SEG-001 dato regulatorio, SEG-002 aviso en el texto final, SEG-003 conservación (informativo, 0 pts) |
| Claridad y repetición (10) | CLA-001 abreviaturas, CLA-002 mayúsculas sostenidas, CLA-003 valores repetidos |
| Claims (10) | CLM-001 claims en el texto generado, CLM-002 lenguaje subjetivo/comercial |

Estados: `listo`, `revisar`, `critico` (algún error), `sin_evaluar`.

## Magento Readiness

Ejecuta el exportador real (`magentoBatch`, `validateMagentoExport`, `batchCsv`, `parseCSV`) con las mismas opciones de exportación de la app.

| Estado | Condición |
|---|---|
| `BLOCKED` | Hay al menos un bloqueo: sin SKU, descripción bloqueada, título incompleto, IA sin confirmar, SKU repetido que no es el último, contrato o CSV inválido, o el exportador falla |
| `READY_WITH_WARNINGS` | Se exporta, pero hay advertencias (sin imagen, meta sin confirmar, alt, HTML, lenguaje, etc.) |
| `READY` | Se exporta sin nada que advertir |

Comprobaciones: MR-001 SKU, MR-002 requeridos regulatorios, MR-003 título, MR-004 IA, MR-005 lenguaje, MR-006 104 columnas, MR-007 serialización CSV (ida y vuelta), MR-008 separadores, MR-009 descripción/HTML, MR-010 meta, MR-011 alt, MR-012 imagen, MR-013 SKU único, MR-014 SKU similares. Las opciones «incluir faltantes», «incluir IA» y «excluir por lenguaje» cambian bloqueo↔advertencia igual que en la exportación.

**El estado nunca depende del score.** El score diagnóstico es `100 − 25 × bloqueos − 8 × advertencias` y solo describe. Un producto BLOCKED con 82/100 sigue BLOCKED. Si el contrato falla, BLOCKED. Ningún score, promedio o IA puede cambiarlo.

## Score 360°

Pesos fijos (congelados con `Object.freeze`, sin edición desde la UI):

| Eje | Peso | Valor que aporta |
|---|---|---|
| Health | 30 % | `score` |
| SEO | 25 % | `score.total` |
| Content | 25 % | `score.total` |
| Magento | 20 % | score diagnóstico |

Verificación de coherencia: los cuatro contratos entregan un entero 0–100, suman 100 y se prueban en `tests/score360.test.js`.

`360 = round(Σ valor × peso ÷ Σ peso de los ejes con score)`. Si un eje no tiene score (por ejemplo SEO «sin evaluar»), se excluye, los pesos se reparten entre los demás y el resultado se marca como **parcial**. Si Magento está BLOQUEADO, la banda es «Bloqueado por Magento» aunque el número sea alto. Bandas: ≥90 excelente, ≥75 buena, ≥50 por revisar, <50 crítica.

Ejemplo: Health 80, SEO 60, Content 40, Magento 90 → 80×0.30 + 60×0.25 + 40×0.25 + 90×0.20 = 24 + 15 + 10 + 18 = **67**.

### Recomendaciones unificadas

Orden: 1 bloqueos, 2 errores, 3 contradicciones, 4 faltantes, 5 SEO, 6 contenido, 7 mejoras. Las recomendaciones que comparten causa (el mismo campo faltante, el mismo claim, el bloqueo del HTML) se fusionan en una y muestran qué ejes la señalan. Los hallazgos de SEO relativos a Magento se omiten porque ya los cubre Magento Readiness.

## Interfaz

- **Ficha:** pestaña «Evaluación» con «EVALUACIÓN DEL PRODUCTO»: Health, SEO, Contenido, Magento y Score 360°. Cada uno se expande con «¿Por qué?» y «¿Qué debo corregir?»; el 360 muestra valor, peso y aporte.
- **Lote:** promedios de Health, SEO, Contenido, Magento y 360; etiquetas por fila; filtros 360 crítico, SEO crítico, Contenido crítico, Magento bloqueado, Magento listo, Magento listo con advertencias. El filtro anterior «Magento bloqueado» (descripción bloqueada) se renombró «Descripción Magento bloqueada» para no confundirlos.
- **Exportación:** antes de descargar se muestran Productos, Bloqueados, Con advertencias, Listos y Score 360° promedio. La exportación sigue dependiendo solo del contrato Magento real.

## Persistencia

Los scores no son fuente de verdad: se recalculan desde los datos actuales. Solo se guardan snapshots de resumen (`fichas.score360.v1`, máximo 100, sin datos de producto).

## Pruebas

`tests/content.test.js`, `tests/magento-readiness.test.js`, `tests/score360.test.js` y dos pruebas nuevas en `tests/ui-regression.test.js`. Se comprueba, entre otras cosas, que los productos que Readiness considera no bloqueados son exactamente los que el exportador real escribe en el CSV.

## Limitaciones

- Content no juzga verdad médica: detecta contradicciones objetivas (forma↔vía, receta, cifras de dosis) con listas cerradas; una forma no reconocida se señala, no se corrige.
- La conservación es texto de plantilla; la herramienta no tiene un dato de conservación por producto (SEG-003 es informativo).
- El score diagnóstico de Magento es descriptivo; los pesos 30/25/25/20 son una decisión de diseño documentada, no una calibración empírica.
- En lotes grandes la evaluación se recalcula al renderizar (más motores por producto).
- Las pruebas de humo con jsdom se omiten si jsdom no está instalado (`npm install`).
