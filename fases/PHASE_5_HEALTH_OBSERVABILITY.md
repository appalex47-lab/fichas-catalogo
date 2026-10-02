# Fase 5 — Health Score y observabilidad

## Objetivo
Añadir una métrica diagnóstica y explicable del estado de calidad sin reemplazar los estados deterministas, la procedencia ni los datos originales.

## Implementación
- `health.js`: contrato `fichas.quality.v1`, score 0–100, bandas, dimensiones y explicación.
- Pesos: error 20, warning 6, info 1.
- Resumen de lote con promedio, mínimo, máximo y distribución.
- Historial limitado a 100 snapshots mediante `appendHistory()`.
- UI del lote: Health Score global y score por registro.
- El score es informativo; no autoriza por sí mismo una exportación.

## Validación
La suite debe mantener todos los tests previos y sumar `tests/health.test.js`.
