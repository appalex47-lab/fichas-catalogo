# Fase 10 — UX/UI avanzada, flujo de trabajo y explicabilidad

La Fase 10 no agrega motores ni cambia contratos: el contrato Magento, la persistencia, los scores y las reglas siguen igual. Todo lo nuevo **interpreta** lo que ya calculan Health, SEO, Content, Magento Readiness y Score 360° y lo presenta como una experiencia guiada:

`CAPTURAR → VALIDAR → CORREGIR → COMPRENDER → APROBAR → EXPORTAR`

## Auditoría UX previa (hallazgos y qué se hizo)

| Hallazgo | Corrección |
|---|---|
| Eliminar un producto lo borraba al primer clic | Confirmación accesible (`confirmDialog`) |
| «Vaciar lote» usaba un doble clic oculto | Confirmación explícita con la cantidad |
| Restaurar un respaldo sobrescribía el lote sin avisar | Confirmación si hay productos; archivo inválido no toca el lote |
| «Limpiar» descartaba lo capturado sin avisar | Confirmación solo si hay cambios sin guardar |
| El primer clic en un botón dinámico se perdía tras escribir | El evento `change` ya no repinta si el valor ya estaba registrado por `input` (el botón se reemplazaba entre mousedown y mouseup) |
| Errores técnicos al usuario (`e.message` crudo) | `friendlyError`: lenguaje comprensible; el detalle técnico va a consola |
| Errores silenciosos | `error` y `unhandledrejection` globales muestran un mensaje |
| Copiar/descargar sin protección de doble clic | `withBusy`: un solo trabajo a la vez, `aria-busy` |
| Sin estado de guardado | Guardado / Guardando… / Error al guardar / Cambios sin guardar |
| Botones del lote activos con el lote vacío | Deshabilitados con explicación |
| Contraste `--ink-muted` 2.99:1 | Ajustado a 5.26:1 (AA) |
| Tabla del lote inutilizable en móvil | Tarjetas responsivas |
| Información crítica (scores, qué hacer) lejos del campo | Barra del producto + «Qué hacer ahora» arriba |
| Enlaces duplicados Exportar/Lote en el encabezado | Pasan a la navegación principal |

Botones auditados: todos los `<button>` del HTML y los `data-*` generados tienen manejador (hay una prueba que lo verifica).

## Arquitectura

```
js/ux.js (nuevo, puro, sin DOM)   → estado derivado, qué hacer ahora, destino de cada hallazgo,
                                    estado por campo, uso/origen, aprobación, guardado, filtros, errores, memo
js/app.js                          → pinta (barra, guía, indicadores, vista previa), navega y confirma
js/score360.js                     → las recomendaciones ahora traen campos, términos, regla, «¿por qué?» y puntos
js/content.js                      → los hallazgos traen las claves de campo (para marcar el campo exacto)
```

`ux.js` es un módulo IIFE con namespace `window.FichasUX` (contrato `fichas.ux.v1`) y se prueba en Node sin navegador.

## Navegación

Navegación principal: **Captura · Validación · Contenido · Lote · Exportación · Configuración** (barra superior en escritorio; barra inferior fija en móvil). Se adapta a las secciones existentes sin renombrarlas: Validación = pestaña *Evaluación*; Contenido = pestañas Título / Merchant Center / Magento / Meta y alt. La sección actual se marca con `aria-current` (también al desplazarse, si el navegador soporta `IntersectionObserver`). Hay un enlace «Saltar al contenido».

## Estado visual del producto (derivado, no persistente)

| Estado | Condición |
|---|---|
| BORRADOR | Sin datos, sin guardar en el lote o con cambios sin guardar |
| EN REVISIÓN | Guardado, con errores, Score 360 crítico o datos de IA sin confirmar |
| LISTO PARA APROBACIÓN | Guardado, sin errores ni bloqueos |
| APROBADO | Aprobado con los datos actuales |
| BLOQUEADO | Magento Readiness = `BLOCKED` (tiene prioridad sobre aprobado) |

Cada estado lleva ícono y texto, y una línea que explica el motivo. **No hay una segunda máquina de estados**: el estado se recalcula siempre. La aprobación se registra como un evento más en la auditoría existente (`producto_aprobado` / `aprobacion_retirada`) con una firma de los datos; si cambia cualquier dato, la firma ya no coincide y el producto deja de estar aprobado solo.

## Barra del producto y resumen superior

Barra persistente (sticky): SKU, marca, producto, categoría, estado, Score 360° y estado de guardado. Debajo, cinco métricas pulsables (Health, SEO, Contenido, Magento, Global 360°) que abren su «¿Por qué?». En móvil la barra se compacta a SKU + marca + estado y las métricas se desplazan horizontalmente.

## Qué hacer ahora (Next Best Action)

Prioridad: **bloqueo → error → inconsistencia → dato faltante → revisión humana (IA sin confirmar) → SEO → contenido → mejora**. Muestra la acción, el resultado de la regla, **qué cambia al corregirlo** («Magento podrá exportar este producto» o «recuperas hasta N puntos») y cuántas más hay. El botón **Corregir** nunca modifica datos: solo navega.

También: «N cosas requieren atención · N bloqueos» y alertas contextuales («Hay 2 problemas en SEO» → Revisar SEO; «Magento bloqueado» → Ver bloqueos).

## Navegación al campo

`goTo(destino)`: cambia de sección, enfoca el campo, lo resalta unos segundos y abre su «¿Por qué?». Destinos: campo del formulario, SKU, imagen, resultado generado (título, meta title, meta description, alt, HTML de Magento, Merchant Center), Ajustes (estructura de meta) o el detalle de un eje. Disponible desde la guía, la pestaña Evaluación, la pestaña Meta y alt y el detalle del lote («Corregir» abre el producto y va al campo).

## Indicadores en campos

`✓ Correcto · ⚠ Revisar · ❌ Error · ℹ Información · ○ Pendiente`, siempre con ícono **y** texto (no dependen del color), `aria-invalid` y `aria-describedby`. Cada campo con problema trae «¿Por qué?»: **qué pasa, por qué, qué regla lo detectó (id + nombre) y qué hacer**.

## Formulario inteligente, uso y origen

- «Se genera con lo que capturas»: título, meta title, meta description, descripción de Merchant Center y ficha técnica/Magento aparecen progresivamente (o dicen qué falta).
- Por dato: **Interpretación** (ej. `30 → 30 piezas`), **Usado en** (Título, Descripción, Magento, Meta, SEO; sale de las plantillas reales) y **Origen** (captura manual, IA sugerida, IA leída de foto, IA confirmada, importación, conector).

## Historial

«Ver historial»: cambios de la sesión con antes, después, origen y hora (en memoria, no se guardan valores) y los eventos guardados del producto. Editar el mismo campo varias veces se fusiona en un cambio; volver al valor original lo elimina.

## Botones, feedback y errores

- `withBusy`: evita el doble clic y marca `aria-busy`. Aplicado a copiar, descargar, respaldar y exportar.
- Feedback tipado (`ok`/`warn`/`error`) con ícono: «Producto guardado en el lote.», «Lote copiado.», «Archivo generado: …», «No se pudo descargar. Intenta nuevamente.», «Descarga cancelada.».
- Confirmaciones: eliminar producto, vaciar lote, restaurar respaldo (si sobrescribe) y limpiar con cambios sin guardar. El foco inicia en «Cancelar»; Escape cancela.
- `esc()` nunca imprime `undefined`, `null`, `NaN` ni `[object Object]`; `safeText`/`friendlyError` traducen errores técnicos.
- Guardado: `persist` ahora devuelve si se guardó y actualiza el estado visible; no hay autosave nuevo.

## Lote

Cantidad, estado, Health, SEO, Contenido, Magento y 360° por producto. Acciones: Ver (detalle expandible con qué hacer y Corregir), Editar, Aprobar, Eliminar, Confirmar IA. No existía «Duplicar», por eso no se agregó. **Filtros principales** con conteos: Todos, Errores, Revisar, Listos, SEO, Contenido, Magento, Health, Score crítico (se deshabilitan si no hay datos detrás). Los filtros anteriores siguen en «Más filtros». Los filtros **no se combinan** (la arquitectura actual guarda un solo filtro). Estado vacío con botón «Agregar producto»; nunca aparece con productos presentes. En móvil la tabla pasa a tarjetas (`data-label`).

## Exportación

Antes de exportar se muestra: Productos, Listos, Con advertencias, Bloqueados, Health, SEO, Content y Score 360° promedios. El contrato de exportación Magento no cambió.

## Accesibilidad

Etiquetas en todos los campos, `aria-describedby`/`aria-invalid`, foco visible, navegación por teclado (flechas/Inicio/Fin en pestañas), regiones `aria-live` (toast y anuncios), diálogos con `role="alertdialog"` y trampa de foco, `prefers-reduced-motion`, enlace de salto y contraste AA verificado por prueba.

## Móvil

Barra de navegación inferior, tarjetas para el lote, objetivos táctiles de 44 px, campos de 16 px (sin zoom automático), barra del producto compacta, sin desbordamiento horizontal (verificado a 390 px).

## Rendimiento

- `assessLote` se cachea por firma (lote + meta + marcas + opciones): filtrar, mostrar más o expandir una fila **no recalcula nada** (hay una prueba con contadores).
- La evaluación del producto en edición usa un memo y reutiliza el `computeFor` ya calculado (antes se calculaba dos veces por tecla).
- `saveQualitySnapshot` reutiliza la evaluación del lote.

## Decisiones de diseño y limitaciones

- Las cinco pestañas de resultado se siguen pintando todas en cada cambio (hay pruebas que leen paneles ocultos); lo costoso, los motores, se calcula una sola vez.
- Los filtros no son combinables.
- La aprobación vive en la auditoría (últimos 500 eventos): si se desplaza fuera de esa ventana, el producto vuelve a «Listo para aprobación» (la dirección segura).
- El historial de cambios no se persiste (la auditoría guardada no almacena valores, por privacidad).
- Se corrigió `--ink-muted` para cumplir AA; el tono gris de textos secundarios es algo más oscuro.
