# Fase 7.3 — Corrección real de lote, copiar y descargar

## Problemas corregidos
- Copia automática con timeout y fallback seleccionable.
- Descargas con fallback de Blob/data y, en móviles compatibles, Web Share para guardar/compartir archivos.
- Todos los botones se declaran como `type=button` para evitar submits implícitos.
- Se carga `connector.js` en `index.html`, que faltaba en la entrega 7.2.
- El estado del lote informa cuando la app se abre como `file:` y advierte que cada ZIP/ruta puede tener almacenamiento diferente.

## Persistencia y límite técnico
`localStorage` e IndexedDB son persistencia por origen. En documentos `file:` el comportamiento de `localStorage` no está garantizado y puede variar por archivo/ruta. Por ello un ZIP nuevo no puede leer de forma fiable el lote guardado por otro ZIP. La vía portable es `Respaldar lote` → JSON → `Restaurar lote`.

## Recuperación del producto existente
La aplicación nueva no puede leer automáticamente el almacenamiento privado de otra URL `file:`. Si el producto está en la versión anterior, debe abrirse esa versión y generar un respaldo, o ejecutar la aplicación bajo un mismo origen HTTP/localhost estable. No se inventan datos ni se considera recuperado un producto que no sea accesible desde el almacenamiento actual.
