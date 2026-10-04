# Fase 7.4 — Corrección de lote y presentación/piezas

## Incidencias corregidas

1. **Lote visible**: `app.js` utilizaba `Health` sin declarar la referencia a `window.FichasHealth`. Esto provocaba una excepción durante `renderLote()`: el contador se actualizaba, pero la tabla no se pintaba.
2. **Presentación/piezas**: en medicamentos, el campo `Presentación o piezas` ahora normaliza una cantidad aislada. `30` se convierte en `30 piezas`. Una presentación explícita como `Caja con 4 plumas` se conserva.
3. **Título**: el título de medicamentos incorpora forma farmacéutica + presentación/piezas. Ejemplo: `... | Cápsulas, 30 piezas | ...`.
4. **Descripción Magento**: la ficha técnica recibe el valor normalizado, por lo que muestra `Presentación: 30 piezas` y no `Presentación: 30`.

## Compatibilidad

No se cambia el esquema persistido: el valor fuente puede seguir siendo `30`; la normalización ocurre en el cálculo de salida. Los datos originales no se sobrescriben.

## Regla

- `30` → `30 piezas`
- `30 piezas` → `30 piezas`
- `30 pzas` → `30 piezas`
- `Caja con 4 plumas` → `Caja con 4 plumas`
- `Frasco 30 mL` → `Frasco 30 mL`
