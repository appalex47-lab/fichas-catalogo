# Fase 1 — Motor determinista de calidad de datos

## Objetivo

Introducir una capa transversal que pueda decir, para cada registro, qué está bien, qué requiere revisión y qué es crítico, sin cambiar por sí sola los datos ni la lógica aprobada de generación.

## Entregado

- Nuevo `js/quality.js`, compatible con navegador y Node.
- Auditoría por categoría con:
  - campos desconocidos;
  - campos requeridos ausentes;
  - opciones inválidas;
  - caracteres de control;
  - espacios que requieren normalización;
  - formatos numéricos sospechosos;
  - números negativos en campos sensibles;
  - claims y lenguaje que ya detecta el motor existente;
  - texto sin asignar proveniente de extracción.
- Clasificación determinista: `listo`, `revisar`, `critico`.
- Conteo separado de errores, avisos e informativos.
- Procedencia por campo (`manual`, `rules`, `ai`, `vision`, `unknown`) y evidencia opcional.
- Cuarentena explícita para valores peligrosos: conserva el original y retira el campo únicamente en la estructura de salida de cuarentena; nunca modifica el registro original.
- Resumen de calidad para lotes.
- Integración visual en el resultado individual y en las filas del lote.
- Nuevo filtro de lote `Calidad por revisar`.
- Estadística de calidad en la carga masiva.
- 4 pruebas nuevas; total actual: 71.

## No se hizo

- No se bloqueó automáticamente la exportación por cualquier aviso de calidad.
- No se modificaron las plantillas Magento.
- No se sustituyó `lint`.
- No se introdujo IA para decidir calidad.
- No se creó una segunda persistencia.

## Siguiente evolución

La siguiente fase puede usar este contrato para persistir procedencia/auditoría, detectar duplicados/anomalías a nivel lote y construir un panel de calidad más completo.
