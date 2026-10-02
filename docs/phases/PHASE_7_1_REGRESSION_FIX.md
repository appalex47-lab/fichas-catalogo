# Fase 7.1 — Corrección de regresiones de UI y persistencia

## Problemas corregidos

1. **Copiar**: `navigator.clipboard` puede estar bloqueado cuando la aplicación se abre desde un ZIP/local `file://`, especialmente en navegadores móviles. Ahora se intenta Clipboard API, después `execCommand` y, si ambos son bloqueados, se abre un cuadro visible con el contenido seleccionado para copiar manualmente.
2. **Descargas**: se conserva la descarga mediante `Blob` y se añade un fallback con `data:` cuando el navegador no permite `URL.createObjectURL`.
3. **Lote**: el lote sigue usando `fichas.lote.v1` como contrato principal y ahora mantiene un espejo en IndexedDB cuando el navegador lo permite.
4. **Restauración**: se incorporan respaldo/restauración explícitos del lote en JSON para poder trasladar el lote entre versiones del ZIP, navegadores u orígenes.
5. **Visibilidad**: la sección Lote muestra cuántos productos están cargados y el estado general de persistencia.

## Importante sobre el producto que ya estaba guardado

El ZIP no puede transportar automáticamente el `localStorage` del navegador donde se utilizó una versión anterior. Ese almacenamiento pertenece al navegador/origen y no forma parte de los archivos del proyecto.

Por eso esta corrección incorpora un mecanismo explícito de **Respaldar lote / Restaurar lote**. El producto existente se conserva si el navegador/origen anterior todavía permite leer su almacenamiento; si no, debe recuperarse mediante un respaldo generado desde esa instalación anterior.

## Compatibilidad

- No cambia `fichas.lote.v1`.
- No cambia el contrato Magento.
- No duplica el motor de IA.
- No cambia la fuente de verdad del producto.
- IndexedDB funciona como espejo defensivo, no como segunda fuente de verdad.
- El respaldo JSON usa `fichas.lote-backup.v1`.

## Verificación

- 108/108 pruebas automatizadas PASS.
- Sintaxis JS verificada con Node.
- Rutas HTML/JS/CSS verificadas.
- ZIP verificado después de empaquetar.
