# Fase 4 — Modelo canónico y derivaciones

## Objetivo
Introducir una representación canónica estable para preparar el sistema para futuras integraciones (CSV/XLSX, Sheets, APIs, GA4, BigQuery, PIM/ERP) sin crear una segunda fuente de verdad.

## Implementado
- `canonical.js`: proyección determinista `fichas.canonical.v1`.
- Normalización de identidad y campos para comparación.
- Identidad canónica: SKU, claves de comparación, título, marca, modelo y categoría.
- Campos canónicos derivados de la categoría vigente.
- Derivaciones: título, Merchant Center, Magento HTML, meta title, meta description y alt.
- Estado de calidad resumido dentro de la proyección.
- Procedencia incluida como referencia, sin duplicar ni reemplazar la persistencia existente.
- Tipos de anomalía incluidos como referencias de diagnóstico.
- `diff()` para comparar dos proyecciones sin modificar registros.
- Integración del módulo en la aplicación; no cambia el formato Magento ni la persistencia del lote.

## Principios
1. El registro de `fichas.lote.v1` continúa siendo la fuente de verdad.
2. El modelo canónico es una vista calculada, no una copia editable.
3. La normalización es conservadora y no sustituye automáticamente valores.
4. Las derivaciones no inventan datos: parten de los datos y motores existentes.
5. Las integraciones futuras deberán consumir este contrato en vez de acoplarse directamente al DOM.

## Validación
- Suite completa: **84/84 PASS**.
- El módulo conserva compatibilidad Node/navegador mediante IIFE.
- No se introdujeron dependencias externas.
