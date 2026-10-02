# Fase 3 — Duplicados avanzados, diccionario inteligente y normalización segura

## Objetivo
Ampliar la detección de problemas de catálogo sin modificar silenciosamente datos existentes.

## Implementado
- `js/normalization.js`: utilidades deterministas de limpieza, similitud, distancia Levenshtein, sugerencias de diccionario y detección de casi duplicados.
- Duplicados exactos existentes se mantienen como anomalías independientes.
- Nuevas anomalías de advertencia:
  - `near-duplicate-title`: títulos muy similares pero no idénticos.
  - `near-duplicate-sku`: SKUs muy similares; se requiere revisión humana.
- Sugerencias aproximadas de diccionario para coincidencias cercanas.
- Normalización de espacios, saltos de línea y espacios Unicode como operación explícita y no destructiva.
- Las sugerencias no escriben valores ni cambian el lote automáticamente.
- Se mantienen los diccionarios persistentes existentes `fichas.dic.v1`.

## Seguridad de datos
No se reemplazan originales. No se elimina información. No se promueve una sugerencia aproximada a dato confirmado.

## Integración
`js/normalization.js` se carga antes de `js/anomalies.js`. La interfaz muestra nuevas etiquetas de anomalías y mensajes de sugerencia sin alterar el flujo existente.

## Pruebas
- Suite completa: 80/80 PASS.
- `node --check` para todos los JS: PASS.
- Se añadieron 5 pruebas específicas de normalización/diccionario/similitud.

## Pendiente
La validación visual con Chromium sigue pendiente por la limitación del entorno gráfico que ya se documentó en fases anteriores.
