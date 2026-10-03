# Fase 0 — Auditoría técnica y línea base

Fecha de ejecución: 2026-10-02

## Alcance

Se inspeccionó el proyecto real antes de modificarlo. La fuente de verdad fue el código entregado, no una reconstrucción hipotética.

## Arquitectura encontrada

- Aplicación web estática, HTML/CSS/JavaScript, sin framework ni dependencias de ejecución.
- `js/logic.js`: reglas puras, categorías, normalización, extracción, generación de contenido y exportación.
- `js/app.js`: estado, persistencia local, DOM, carga masiva, lote, exportación y configuración.
- `js/ai.js`: cliente Cohere, extracción, visión y asistente.
- `js/assist.js`: respuestas locales y acciones cerradas.
- `js/rules.js`: documento de reglas generado desde la misma lógica.
- `tests/`: pruebas Node nativas.
- Persistencia principal del lote/configuración mediante `localStorage`.

## Línea base

- 67 pruebas originales: **67/67 PASS**.
- `node --check` para los módulos JavaScript: **PASS**.
- No se detectó necesidad de migrar de arquitectura ni de introducir framework.
- La integración de Cohere ya está centralizada en `js/ai.js`; la llave se obtiene de `cohere_api_key_local` y no se incrusta en código.
- La aplicación ya cuenta con extracción determinista, revisión de lenguaje, bloqueo de Magento, exportación Batch y asistente local/IA.

## Decisiones para las siguientes fases

1. Mantener la arquitectura actual y añadir módulos pequeños.
2. No modificar silenciosamente los datos de entrada.
3. Separar diagnóstico de calidad de la generación de contenido.
4. Mantener IA como sugerencia y no como autoridad.
5. Cualquier cuarentena debe conservar el valor original y el motivo.
6. Toda nueva regla debe tener prueba automatizada.
7. No convertir el estado de calidad en un sustituto de `completado`, `practicado`, `evidencia` o `mastery` del sistema de aprendizaje previo.

## Riesgos observados

- El estado persistente está repartido en varias claves `localStorage`; futuras fases deberán formalizar un inventario sin crear una segunda fuente de verdad.
- El lote puede crecer y recalcula reglas en render; futuras fases de performance deberán medir antes de optimizar.
- El origen/procedencia de cada campo todavía no estaba modelado como dato estructurado.
- La calidad estaba implícita en `lint`, campos requeridos y bloqueos, pero no existía un informe transversal único.

## Criterio de salida de Fase 0

La arquitectura quedó comprendida y documentada, existe una línea base reproducible y se definió una estrategia incremental para introducir Data Quality sin romper el motor existente.
