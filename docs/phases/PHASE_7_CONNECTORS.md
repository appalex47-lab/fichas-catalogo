# Fase 7 — Conectores operativos: Google Sheets y REST API

## Objetivo
Convertir el contrato de integración de la Fase 6 en conectores utilizables desde la interfaz, manteniendo la regla de seguridad: **una fuente externa nunca sobrescribe automáticamente una ficha**.

## Incluye
- Conector de Google Sheets API v4.
- Conector REST API genérico para GET y POST.
- Lectura de rangos A1 en Google Sheets.
- Normalización de respuestas REST comunes (`array`, `data`, `items`, `results`, `rows`, `records`).
- Mapeo explícito de campos mediante JSON.
- Identidad externa estable por `sourceId + sourceRecordId`.
- `checksum`, `etag` y `fetchedAt` para trazabilidad e incrementalidad.
- Importación controlada al lote, no a la fuente original.
- Credenciales fuera de la configuración persistente; los tokens introducidos en la UI no se guardan como parte del conector.
- Registro de auditoría de la importación.

## Flujo

`fuente externa → connector.js → integration.js → sync.js → mapeo → lote → calidad/anomalías/canónico → revisión humana → exportación`

El conector no llama directamente a las funciones que modifican una ficha individual.

## Google Sheets

La API de Google Sheets v4 expone `spreadsheets.values.get`, `batchGet`, `update`, `batchUpdate` y `append` para trabajar con valores. En esta fase se implementa lectura mediante `values.get`; la escritura queda deliberadamente separada para una fase posterior con aprobación explícita. Google documenta el uso de ID de spreadsheet y rangos A1. 

Para hojas privadas se admite un token OAuth proporcionado por el usuario. Google indica que para aplicaciones web en producción se debe usar un flujo moderno de OAuth y recomienda PKCE frente al flujo implícito.

## REST

El conector admite GET y POST. La respuesta se convierte a filas cuando tiene una de las estructuras habituales. El usuario define el mapeo; el sistema no adivina campos externos.

## Ejemplo de mapeo

```json
{
  "SKU": "sku",
  "marca": "brand",
  "modelo": "model"
}
```

Los nombres de destino deben corresponder a campos reales de la categoría seleccionada.

## Limitaciones deliberadas

- El navegador está sujeto a CORS del servidor REST.
- No se guarda un client secret de Google en el frontend.
- No se realiza auto-aceptación de cambios externos.
- La escritura de vuelta a Google Sheets/REST no forma parte de esta fase.
- Los secretos no se incluyen en exportaciones ni en la documentación de configuración.

## Validación

La suite debe permanecer en verde y las pruebas específicas del conector deben cubrir extracción de ID, conversión de filas, normalización de payloads, mapeo, metadatos y eliminación de secretos de la configuración persistente.
