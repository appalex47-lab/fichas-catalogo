# Fase 11 — Motor de conocimiento y aprendizaje del catálogo

La aplicación aprende de los productos que procesa y lo recuerda en **IndexedDB**. Esta fase pertenece solo a la app de Fichas de Producto / Fichas de Catálogo (nombres: Product, Catalog, Fichas, Knowledge, Learning).

Flujo obligatorio: **módulo → Knowledge (`js/knowledge.js`) → KnowledgeDB (`js/knowledge-db.js`) → IndexedDB**. Ningún otro módulo toca `indexedDB` (hay una prueba que lo verifica).

## 1. Diagnóstico previo (auditoría)

| Tema | Hallazgo |
|---|---|
| IndexedDB | **No había una implementación adecuada.** Solo existía un espejo mínimo en `app.js` (`fichas-state`, un store, sin versiones, sin migraciones, errores tragados) que copia el lote cuando localStorage falla. No sirve para conocimiento: sin índices, sin esquema. Se creó la capa nueva desde cero. |
| localStorage | Es la persistencia real del lote, auditoría, ajustes, meta, historiales. **No se migra ni se reemplaza.** |
| sessionStorage | Sin uso. |
| Sistema de aprendizaje | No existía. Solo había diccionarios del usuario (normalización) y reglas de presentación (`logic.js`), que se reutilizan. |
| Auditoría | `state.audit` (localStorage `fichas.audit.v1`) con `Anomalies.event`. **Se reutiliza**; no hay auditoría paralela. |
| Backup/restore | `exportLoteBackup` / `importLoteBackup` (JSON del lote y la auditoría). Se extienden. |
| Cohere | `AI.chat` + llave y modelo de la app. **Se reutilizan**: no hay otro cliente ni otra llave. |
| Quality / Canonical / Health / SEO / Magento | Sin cambios de contrato. El conocimiento solo agrega advertencias a las recomendaciones de Health y valores corregidos que ya fluyen por esos motores. |

## 2. Base de datos

`fichasProductoKnowledge`, versión `1` (`DB_VERSION`). Cambiar un almacén exige subir la versión y agregar su migración en `MIGRATIONS`. Si la base es de una versión más nueva, la capa lo informa y se degrada a memoria sin romper la app.

**Decisión de diseño: 8 almacenes genéricos, no 17.** Los once tipos de entidad (sustancia, laboratorio, marca, fabricante, forma farmacéutica, concentración, unidad, presentación, categoría, subcategoría, producto) viven en `entities` y se distinguen por el índice `type`. Un almacén por tipo duplicaría esquema, migraciones e índices sin ganar nada.

| Almacén | Contenido | Índices |
|---|---|---|
| `entities` | Los once tipos | `type`, `normalized`, `typeNormalized`, `typeStatus`, `tokens` (multiEntry), `status`, `confidence`, `sources` (multiEntry), `updatedAt` |
| `aliases` | Variantes, abreviaturas, sinónimos | `entityId`, `typeAlias`, `normalized`, `status`, `updatedAt` |
| `relationships` | sujeto → predicado → objeto | `subject`, `object`, `relationshipType`, `subjectPredicate`, `objectPredicate`, `status` |
| `evidence` | Cada observación, confirmación o rechazo | `targetId`, `productRef`, `source` |
| `corrections` | Correcciones automáticas y manuales | `knowledgeId`, `status`, `createdAt` |
| `conflicts` | Contradicciones abiertas y resueltas | `status`, `subject`, `updatedAt` |
| `rules` | Reglas aprendidas de correcciones | `status`, `kind`, `field`, `updatedAt` |
| `knowledgeMeta` | Ajustes, diccionarios importados, marca de arranque | — |

Se quitaron los índices que ninguna consulta usa (p. ej. `kind` y `createdAt` en evidencia) porque cada índice encarece cada escritura.

Dos backends con el mismo contrato asíncrono: `IDBBackend` (IndexedDB real) y `MemoryBackend` (pruebas y navegadores sin IndexedDB). La capa expone `get`, `getMany`, `put`, `putMany`, `delete`, `batch` (atómico), `byIndex`, `countByIndex`, `range`, `count`, `scan` (paginado, solo para exportar/restaurar/integridad), `clear`, `reset`, `exportAll`, `importAll`, `validateBackup` y `health`.

## 3. Modelo de conocimiento

Cada registro conserva `id`, `type`, `canonicalValue`, `normalizedValue`, `aliases`, `status`, `confidence`, `evidenceCount`, `positiveEvidence`, `negativeEvidence`, `sources`, `createdAt`, `updatedAt`, `lastValidatedAt` y `version` (más contadores por tipo de evidencia). Estados: `observed`, `normalized`, `suggested`, `confirmed`, `inferred`, `trusted`, `rejected`, `conflicted`.

**Observado nunca salta a de confianza.** Una aparición no es una verdad.

## 4. Confianza (documentada y probada)

```
puntos a favor = observaciones (0.25 c/u, máx. 2) + importaciones (0.5 c/u, máx. 1.5) + IA (0.25 c/u, máx. 0.5)
               + confirmaciones humanas (3 c/u) + correcciones humanas (2 c/u) + regla determinista (4)
puntos en contra = rechazos humanos (3 c/u)
confianza = a favor ÷ (a favor + en contra + 2)
```

- **La frecuencia se satura:** observar 8 veces o 800 da lo mismo.
- **Sin evidencia humana el máximo es 0.70.**
- La IA nunca cuenta como verdad (máx. 0.5 puntos).
- Recencia: −1 % por mes sin validar (máx. −15 %). Conflicto abierto: × 0.6.
- `CONFIRMED` requiere al menos una confirmación o corrección humana. `TRUSTED` requiere 2 confirmaciones en ocasiones distintas, ningún rechazo y confianza ≥ 0.85 (en la práctica, cuatro confirmaciones).
- Una misma confirmación repetida en la misma sesión no se cuenta dos veces: no se puede inflar la confianza pulsando un botón.

`why(id)` explica cada conocimiento: motivos en lenguaje natural, desglose de puntos, fórmula y evidencia. La interfaz nunca muestra solo un porcentaje.

## 5. Qué aprende

Sustancias, marcas, laboratorios, fabricantes, formas, concentraciones (valor + unidad; lo que no tiene ese formato no se acepta como concentración), unidades (`pzas` → `piezas`, `ML` → `mL`, `µg` → `mcg`…), presentaciones (reutiliza `expandPres` de `logic.js`: `30` → `30 piezas`, `30 pzas` → `30 piezas`, `C/30` → `Caja con 30 piezas`; guarda siempre `original`, `normalized`, `canonical`, `rule` y `confidence`), categorías y subcategorías, alias y relaciones: `brand→laboratory`, `brand→substance`, `brand→category`, `substance→concentration` y `product→{brand, substance, laboratory, manufacturer, pharmaceuticalForm, presentation, concentration, category, subcategory}`.

**Cuándo aprende:** al guardar un producto, al importar CSV, al traer registros de un conector, al restaurar un respaldo antiguo y al pulsar «Aprender del lote actual». Editar un producto retira sus observaciones anteriores (se marcan como reemplazadas; no se borran) y registra las nuevas. Es idempotente.

## 6. Evidencia positiva y negativa, conflictos

- **Confirmar** (panel, o «Usar» una sugerencia) = evidencia positiva con origen, producto, fecha, regla y sesión.
- **Rechazar** (panel, o «No» a una sugerencia) = evidencia negativa. No se borra nada.
- **Conflicto:** una marca con dos laboratorios distintos (o cualquier predicado de objeto único, o un alias que apunta a dos valores) pasa a `conflicted`, se registra `KNOWLEDGE_CONFLICT` y **no se elige sola**. El panel muestra ambas relaciones con confianza, evidencia, fuentes y fecha; una persona elige: la elegida se confirma y las demás reciben evidencia negativa.

## 7. Niveles de corrección

| Nivel | Cuándo |
|---|---|
| 1 Sugerir | Poca evidencia, IA, o dato crítico sin conocimiento confirmado |
| 2 Corrección asistida | Hay evidencia, la persona decide con un botón |
| 3 Autocorrección segura | Regla determinista (o equivalencia confirmada ≥ 0.85, sin conflicto) **y** reversible **y** conserva el original **y** queda auditada **y** el dato no es crítico |
| 4 Revisión obligatoria | Conflicto, o contradice conocimiento confirmado |

**Datos críticos que nunca se autocorrigen:** sustancias activas, concentraciones, marca/laboratorio/fabricante, vía, receta, leyenda, precauciones, claims y datos regulatorios. Hoy la autocorrección actúa solo sobre `pzas → piezas`, `ml → mL` y equivalencias confirmadas de forma, presentación, categoría o subcategoría. Se puede desactivar («Aplicar correcciones seguras al guardar»).

Cada corrección guarda `original`, `corrected`, `reason`, `rule`, `knowledgeId`, `confidence` y `timestamp`, y se puede **revertir** desde el panel (restaura el valor original en el lote).

**Aprender de las correcciones:** si cambias un dato guardado, se registra la corrección puntual y se pregunta «¿Usar esta corrección en productos similares?». Si aceptas, se crea un alias confirmado. Los datos críticos no hacen esa pregunta: la regla queda visible como «solo se sugerirá, nunca se aplicará sola».

## 8. Integraciones

- **Normalización:** antes se consulta el conocimiento (`assess`, asíncrono con debounce al editar); después se registra evidencia al guardar (`observe`).
- **Quality / Health:** `qualityIssues` agrega advertencias a las **recomendaciones** de Health (desconocido solo cuando el tipo ya es maduro —≥ 20 entidades—; conflicto/rechazado/inconsistencia siempre). **El Health Score no cambia.** Las inconsistencias son del tipo «Inconsistencia» en «Qué hacer ahora».
- **Canonical / SEO / Magento:** el conocimiento no reescribe esos motores ni inventa claims. Influye solo a través de valores corregidos de forma segura o aceptados por la persona, que ya fluyen por títulos, meta, alt y exportación. **El contrato Magento no cambió.**
- **Cohere:** `aiSuggestAliases` reutiliza `AI.chat`, la llave y el modelo de la app. Las propuestas solo se aceptan si el valor canónico ya existe en el conocimiento; quedan `suggested` (confianza ≤ 0.2) y nunca corrigen solas. **Cohere no es fuente de verdad.**
- **Auditoría:** `KNOWLEDGE_CREATED`, `KNOWLEDGE_UPDATED`, `KNOWLEDGE_CONFIRMED`, `KNOWLEDGE_REJECTED`, `KNOWLEDGE_CONFLICT`, `KNOWLEDGE_SUGGESTION`, `AUTO_CORRECTION`, `MANUAL_CORRECTION`, en la misma auditoría. Al recortar la auditoría (500 eventos) se conservan siempre las aprobaciones de la Fase 10.
- **Aprendizaje del usuario:** separado. El conocimiento de la aplicación vive en esta base; lo que el usuario aprende (por ejemplo el curso) es otra cosa y no se mezcla.

## 9. Interfaz «Conocimiento»

Sección propia (navegación «Conocimiento»): estado de la base, totales, búsqueda por texto/tipo/estado, tarjetas con estado, confianza y conteos de evidencia, **«Ver evidencia»** («¿Por qué la aplicación sabe esto?»), Confirmar, Rechazar, Editar (solo mayúsculas, acentos y espacios: otro nombre se pide como alias porque la identidad depende del valor normalizado), conflictos por resolver, correcciones tuyas por decidir, alias sugeridos por revisar, correcciones aplicadas con «Revertir», importación de diccionario, verificación de integridad, respaldo/restauración y reinicio (con confirmación). En el formulario, cada campo muestra «Conocido / Visto antes / Nuevo» y las sugerencias con «Usar» y «No».

## 10. Backup y restore

- El respaldo del lote incluye `knowledge` (entidades, alias, relaciones, evidencia, correcciones, conflictos, reglas, ajustes y versión de la base). Puede hacer el archivo más grande.
- Restaurar: valida estructura y versión (rechaza una versión más nueva), **combina** sin duplicar (gana el registro más reciente; la evidencia es inmutable y no se sobrescribe), reconstruye la base y verifica integridad. Un respaldo antiguo sin conocimiento reconstruye lo aprendido desde el lote. Si el conocimiento falla, el lote se restaura igual y se avisa.
- También hay respaldo/restauración solo del conocimiento.

## 11. Rendimiento

Todas las consultas usan índices; ninguna validación recorre una tabla completa (`scan` solo se usa para exportar, restaurar e integridad, y una prueba comprueba que `observe`, `assess` y `search` hacen **0** recorridos completos). Medido en Chromium headless con IndexedDB real: evaluar un producto ≈ 12 ms, buscar ≈ 25 ms, aprender un producto ≈ 60 ms; aprender un lote de 1 000 productos (≈ 20 000 evidencias) toma ≈ 40 s en segundo plano, por tandas de 150, sin bloquear la interfaz. En memoria, 20 000 entidades se guardan y consultan en pocos segundos.

## 12. Pruebas

`tests/knowledge-db.test.js` (capa de persistencia; el contrato corre en memoria y en IndexedDB —nativo o `fake-indexeddb`—), `tests/knowledge.test.js` (motor) y `tests/knowledge-dom.test.js` (interfaz en jsdom). Los de IndexedDB se omiten si no hay IndexedDB (`npm install` instala `fake-indexeddb`).

## 13. Limitaciones

- La confianza usa pesos de diseño documentados, no una calibración empírica.
- Editar un valor no cambia su identidad; renombrar de verdad es crear un alias.
- Los filtros de la Fase 10 no se combinan y el conocimiento no cambia eso.
- La advertencia de «dato desconocido» solo aparece cuando el tipo ya tiene ≥ 20 entidades, para no alarmar con una base casi vacía.
- Escribir es más lento que leer (cada registro mantiene varios índices): un lote grande se aprende en segundo plano.
- El conocimiento vive en este navegador; cambiar de navegador o de carpeta del HTML usa otra base. Usa el respaldo.
