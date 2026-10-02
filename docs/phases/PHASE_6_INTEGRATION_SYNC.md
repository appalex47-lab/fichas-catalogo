# Fase 6 — Contrato de integración y sincronización

## Objetivo
Preparar la aplicación para recibir datos externos sin permitir que un conector sobrescriba directamente la fuente de verdad local.

## Flujo protegido
`fuente externa → adaptador → registro normalizado → deduplicación/cache → comparación → sugerencia/revisión → decisión humana → registro local/canónico`

## Fuentes preparadas
CSV, XLSX, Google Sheets, REST API, GA4, BigQuery, Microsoft Graph, PIM y ERP.

La Fase 6 no contiene credenciales ni conexiones externas activas. Los adaptadores tienen un contrato común para que las conexiones reales puedan incorporarse de forma incremental.

## Seguridad funcional
- dry-run por defecto.
- ningún conector escribe directamente sobre un producto.
- cambios externos se clasifican como `noop`, `suggest` o `review`.
- sincronización incremental por `checksum`/`etag`.
- caché con caducidad.
- deduplicación por fuente + ID externo.
- estados de job: pending/running/success/partial/error/cancelled.
- cancelación y backoff determinista.
- preservación de trazabilidad: `sourceId`, `sourceRecordId`, `fetchedAt`, `etag`, `checksum`.

## Compatibilidad
No se crea una segunda base de datos ni un segundo cliente de IA. Se preservan las capas de calidad, procedencia, anomalías, normalización, modelo canónico y Health Score de las fases anteriores.
