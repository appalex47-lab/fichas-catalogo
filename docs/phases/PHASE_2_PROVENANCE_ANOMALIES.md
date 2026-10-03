# FASE 2 — Procedencia, auditoría y anomalías

## Objetivo
Añadir trazabilidad determinista y detección de anomalías de lote sin modificar silenciosamente los datos ni introducir una segunda fuente de verdad.

## Entregado
- `js/anomalies.js`: módulo puro para procedencia, normalización de claves, anomalías y eventos de auditoría.
- Procedencia por campo derivada de los estados existentes de IA: manual, IA sugerida, visión, IA extraída y confirmada.
- Conservación de evidencia/origen previo al editar cuando el campo sigue existiendo.
- `fichas.audit.v1` en `localStorage`, limitado a los últimos 500 eventos.
- Eventos para alta, actualización, confirmación de IA, alta/actualización masiva y eliminación.
- Detección de SKU duplicado normalizado: severidad error.
- Detección de título duplicado normalizado: severidad warning.
- Detección de texto sin asignar y campos fuera del esquema.
- Filtro `Anomalías` en el lote.
- Columna de anomalías por producto.
- Panel de trazabilidad con los últimos eventos.

## Reglas de seguridad
- Los datos originales no se sobrescriben por el detector de anomalías.
- La normalización de claves se usa solo para comparar.
- Las anomalías no son una autorización automática para corregir o exportar.
- Cohere no participa en esta fase.
- No se crea un segundo motor de calidad ni una segunda persistencia de productos.

## Persistencia
- Productos: `fichas.lote.v1` existente.
- Auditoría: `fichas.audit.v1`, nueva colección acotada de eventos.
- La procedencia viaja dentro de cada producto del lote.

## Pruebas
- Suite completa: **75/75 PASS**.
- `node --check app.js`: PASS.
- `node --check quality.js`: PASS.
- `node --check anomalies.js`: PASS.

## Pendiente
La validación visual con Chromium debe hacerse en un entorno gráfico funcional. El entorno de ejecución utilizado durante esta implementación no permitió completar una sesión Chromium estable, por lo que no se declara PASS visual.
