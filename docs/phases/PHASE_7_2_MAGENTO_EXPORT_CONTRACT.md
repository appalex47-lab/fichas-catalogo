# Contrato de exportación Magento

## Objetivo
El CSV de Magento usa `,` como separador estructural de columnas. La aplicación no debe depender de comillas CSV para los textos normales generados por la ficha.

## Reglas
1. Una fila de producto tiene exactamente 104 columnas.
2. `,` es el separador de columnas.
3. Los campos de texto generados por la ficha no contienen comas internas. Una coma se normaliza a `;` para conservar la separación semántica sin crear un separador de columna adicional.
4. Los saltos de línea y tabs internos se normalizan a espacios.
5. Los campos multivalor reservan `|` como separador interno de la aplicación. Si se usa alguno de estos campos con valores múltiples, la importación de Magento debe configurarse con `|` como Multiple Value Separator: `categories`, `product_websites`, `related_skus`, `related_position`, `crosssell_skus`, `crosssell_position`, `upsell_skus`, `upsell_position`, `additional_images`, `additional_image_labels`.
6. Antes de descargar se valida el número de columnas y la ausencia de comas/saltos internos donde el contrato los prohíbe.
7. El modelo canónico y la ficha original no se modifican por esta sanitización: solo se transforma la representación de exportación.

## Por qué no se elimina toda coma indiscriminadamente
Adobe Commerce admite valores múltiples dentro de ciertos campos y documenta que el separador de múltiples valores puede configurarse por separado del separador de campos. Por eso un `replace(/,/g, '')` global sería destructivo para datos estructurados.

## Flujo
`ficha → modelo canónico → buildMagentoRow → sanitización por campo → validación contractual → serialización CSV → descarga`

## Validación
El exportador rechaza la descarga si una fila no tiene 104 columnas o si encuentra saltos de línea/comas internas incompatibles con este contrato.
