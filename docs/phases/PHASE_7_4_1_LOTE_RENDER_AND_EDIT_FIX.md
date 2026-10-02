# Fase 7.4.1 — Render del lote, edición segura, concordancia y pruebas ejecutables

## Incidencias corregidas

1. **Tabla del lote vacía con contador > 0.** `renderLote()` actualiza el contador y luego llama a `renderExport()`, que usaba `MAG_HEADER` sin importarla desde `logic.js` (`ReferenceError`). La excepción cortaba `renderLote()` antes de pintar la tabla. Ahora usa `ex.header.length`.
2. **Estado de persistencia desactualizado.** Decía «El lote está vacío en este almacenamiento» tras agregar, quitar o vaciar, hasta recargar. `renderLote()` ahora llama a `renderPersistenceStatus()`.
3. **Edición que podía perder el producto.** «Editar» sacaba el producto del lote y lo persistía de inmediato; si se cerraba la página o se pulsaba «Limpiar formulario» antes de volver a agregarlo, se perdía. Ahora el producto permanece en el lote durante la edición, el botón pasa a «Guardar cambios», y al guardar se reemplaza en su misma posición. «Limpiar formulario» cancela la edición y conserva la versión anterior.
4. **Concordancia.** Exactamente `1` va en singular: `1 pieza`, `1 tableta`, `1 cápsula`, etc. (`30` sigue siendo `30 piezas`).
5. **Pruebas que ejecutan la app.** `tests/ui-smoke.test.js` carga `index.html` + `js/*.js` en jsdom (dependencia de desarrollo) y ejerce alta manual, recarga, edición, respaldo/restauración, exportación Magento y carga masiva. Sin jsdom instalado se omiten (`npm install` la instala). Las 9 fallan contra la 7.4 y pasan con esta versión.

## Decisión que NO se cambió
La llave de Cohere sigue en `localStorage` con el nombre `cohere_api_key_local` porque así está documentado en el README (compartida con la herramienta de diagnóstico). Solo se amplió la nota en Ajustes → IA para advertir que no está cifrada ni debe usarse en equipos compartidos.

## Compatibilidad
No cambia `fichas.lote.v1`, `fichas.lote-backup.v1` ni el contrato Magento. El valor fuente de la presentación no se sobrescribe; la concordancia se aplica en la salida.
