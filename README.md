# Fichas de catálogo

Herramienta web para catálogo de farmacia. Convierte los datos de un producto en los textos que necesita la tienda y arma el archivo CSV para cargarlo en Magento. Está hecha con HTML, CSS y JavaScript, sin dependencias, y todo se calcula con reglas en código: la misma entrada da siempre la misma salida. No usa IA ni servicios externos.

## Guía rápida para quien nunca la ha usado

### Qué hace

Para cada producto genera:

- el título optimizado;
- la descripción para Merchant Center;
- el HTML de descripción para Magento;
- el meta title y la meta description;
- el alt de la imagen principal.

Luego arma el CSV que se carga en Magento. No inventa información y no cambia las plantillas aprobadas. Solo acomoda los datos dentro de ellas.

### Qué datos necesitas por producto

- **Medicamentos:**
  - marca, concentración, principio activo, forma farmacéutica, presentación (por ejemplo, "Caja con 28 tabletas"), laboratorio y vía de administración;
  - volumen, solo si es líquido o inyectable;
  - si requiere receta médica. Este dato es obligatorio: sin él no se genera el HTML de Magento.
- **Otras categorías:** cada una pide sus propios campos, que aparecen en el formulario al elegirla. Las categorías son dispositivos médicos, dermocosméticos, suplementos, bebidas, cuidado personal y accesorios.
- **Cosméticos y dermocosméticos:** captura al menos el nombre del producto o el tipo. Si el nombre ya dice el tipo (por ejemplo, «Crema Hidratante»), el título no lo repite.
- **Cosméticos y dermocosméticos (opcionales, tal cual del empaque):** lista de ingredientes (INCI), modo de uso, precauciones y, en protectores solares, FPS y nivel de protección. Cada dato aparece en una sección aparte del HTML de Magento y solo si lo capturas.
- **Para exportar a Magento:** el SKU exacto de Magento. Sin SKU, el producto no sale en el archivo.
- **Opcional:** el archivo de la imagen principal.
- **Si solo tienes el SKU sucio,** por ejemplo `LAMOBRIGAN 10MG TAB CAJ C/28 PISA`, pégalo en "Rellenar desde datos crudos". La herramienta extrae lo que aparece en el texto y muestra lo que no pudo asignar. Marca, laboratorio y principio activo solo los reconoce si los agregaste antes a los diccionarios de Ajustes.

### Cómo se usa, producto por producto

1. Elige la categoría.
2. Captura los campos, o extrae desde datos crudos y revisa lo que se llenó.
3. Revisa las pestañas Título, Merchant Center, Magento y Meta y alt. Los avisos te dicen qué falta o qué palabras revisar.
4. Pulsa "Agregar al lote".

### Cómo se usa, muchos productos a la vez

1. En "Carga masiva" descarga la plantilla de la categoría.
2. Llénala con una fila por producto y súbela.
3. La herramienta muestra qué filas están completas, cuáles tienen faltantes y cuáles no se pueden generar.
4. Agrega las filas al lote.

### Cómo obtener el archivo para Magento

1. En Ajustes (engrane arriba a la derecha), pestaña Magento, elige la codificación del archivo.
2. Descarga el CSV.
3. Pruébalo primero con 2 o 3 SKU en un ambiente de pruebas.

### IA con Cohere (opcional)

La herramienta funciona completa sin IA. Si agregas tu llave de Cohere en Ajustes (engrane), pestaña IA, suma cuatro cosas. Sin llave, los botones de IA avisan que falta agregarla:

1. **Completar datos crudos.** Primero corren las reglas. Luego la IA completa marca, principio activo (solo si aparece en el texto), laboratorio, producto, tipo y similares. La herramienta verifica cada dato contra el texto original y descarta el que no pueda comprobar. Concentración, volumen, forma, presentación, vía y receta los procesan siempre las reglas.
2. **Sugerencias.** Si la marca, el laboratorio o el tipo no aparecen en el texto, la IA puede sugerirlos. Se muestran aparte, los aplicas tú y quedan marcados como «IA sugerido». En el lote aparecen como «IA sin confirmar» y no se exportan a Magento hasta que pulses «Confirmar IA» (o actives la opción en Exportar). La IA nunca sugiere principio activo, receta ni concentración.
3. **Fotos del empaque.** En «Rellenar desde datos crudos» puedes agregar hasta 3 fotos del producto. Un modelo de Cohere con visión lee marca, producto, tipo, contenido, fabricante y, en cosméticos, ingredientes, modo de uso, precauciones y FPS.
   - **Revisión:** ves lo leído junto a la transcripción exacta que hizo la IA, corriges lo que haga falta y aplicas solo lo que coincide con la foto. Los datos con números se señalan para revisarlos con más cuidado.
   - **Comprobaciones:** cada valor debe ser coherente con la transcripción, y ingredientes, modo de uso y precauciones deben ser una copia literal de ella. Lo ilegible se descarta y nunca se completa. La IA no puede indicar si un producto requiere receta.
   - **Sin confirmar:** lo aplicado queda marcado como «IA foto» y «IA sin confirmar», y no se exporta a Magento hasta que lo confirmes en el lote.
   - **Privacidad:** las fotos se reducen en el navegador (máximo 1600 px), se envían solo a Cohere y no se guardan.
4. **Asistente de uso.** Un chat que resuelve dudas de dos maneras:
   - **Sin IA:** lo que depende de tu pantalla (por qué se bloquea Magento, qué falta para el título o para exportar, por qué no se exportan algunas filas, qué significa cada aviso, cuánta cuota llevas) se calcula con los datos de la herramienta. Es instantáneo, siempre coincide con lo que ves y no gasta llamadas. Junto a cada aviso, bloqueo o motivo de exclusión hay un botón **¿Por qué?** que abre el asistente con esa explicación.
   - **Con IA:** las preguntas abiertas se consultan al manual con Cohere, con un modelo más ligero que el de extracción (configurable). Recibe tu pregunta y un resumen del estado de la pantalla (categoría, claves de campos, faltantes, avisos y conteos del lote), sin los valores de los productos.
   - **Botones de acción:** las respuestas pueden traer botones para ir a un campo, abrir una pestaña de Ajustes, filtrar el lote o ir a una sección. Solo existen las acciones de una lista cerrada, y solo se ejecutan cuando las pulsas. Si la IA propone una acción fuera de la lista o un campo que no existe, se descarta.
   - **Conteo de llamadas:** en Ajustes, pestaña IA, se muestran las llamadas a Cohere de este mes desde este navegador, cuántas respuestas se resolvieron sin IA y el porcentaje de tu límite mensual, con aviso al llegar al 80%. El conteo es solo de este navegador: la cuota real depende de tu llave.

**Llave de Cohere.** Cada persona pega su propia llave en Ajustes, pestaña IA. Se guarda solo en su navegador (`localStorage`, con el nombre `cohere_api_key_local`, el mismo de la herramienta de diagnóstico) y nunca va en el código ni en el repositorio. Si las dos herramientas se publican en el mismo dominio de github.io, comparten la llave. No compartas tu llave. Las llaves de prueba de Cohere son para evaluación y tienen límites de uso (20 solicitudes por minuto y 1,000 llamadas al mes, según su documentación). Si la herramienta pasa a ser de uso diario del equipo, conviene una llave de producción. Cada lectura de fotos cuenta como una llamada. por eso la carga masiva envía 15 filas por llamada y solo las filas que las reglas no pudieron resolver.

**Datos que se envían a Cohere:** al leer fotos, las imágenes del empaque; al completar datos crudos, el texto crudo de los productos y los datos que ya extrajeron las reglas; en el asistente, tu pregunta y el resumen de la pantalla. Revisa con TI o Legal la política de datos de Cohere antes de usarla con información del negocio.

### Ajustes

El engrane de la esquina superior derecha abre los ajustes, separados por tipo:

- **Formato:** siglas y marcas que se mantienen en mayúsculas.
- **Diccionarios:** marcas, principios activos y laboratorios para la extracción de datos crudos, sugerencia de marca por posición y aprendizaje desde el lote.
- **IA:** llave y modelo de Cohere.
- **Magento:** código del atributo del título, codificación del archivo y estructura de metas y alt por categoría.

### Qué debes saber

- Las plantillas y textos no se modifican. Si un dato falta, la línea correspondiente se omite y la herramienta te lo avisa.
- El lote y los diccionarios se guardan solo en tu navegador. Otras personas o computadoras no los ven, así que descarga el CSV para conservar tu trabajo.
- La herramienta no se conecta a Magento. Solo genera el archivo que tú cargas.
- La IA puede equivocarse. Por eso todo lo que propone se verifica contra el texto o queda marcado para tu revisión.
- La estructura de meta de las categorías distintas de medicamentos está sin confirmar, y sus metas salen vacías en el CSV hasta que la confirmes en la herramienta.

## Publicación

Abre `index.html` en el navegador, o publícala con GitHub Pages (Settings, Pages, rama `main`, carpeta raíz). Para que funcione, `index.html`, `styles.css`, `logic.js`, `assist.js`, `ai.js` y `app.js` deben estar en la misma carpeta.

## Archivos

| Archivo | Contenido |
| --- | --- |
| `index.html` | Estructura de la página |
| `styles.css` | Estilos |
| `logic.js` | Lógica pura: categorías, normalización, plantillas, metas, CSV y extracción. Funciona en navegador y en Node |
| `assist.js` | Respuestas del asistente que no necesitan IA (se calculan con el estado de la pantalla) y lista cerrada de acciones. Funciona en navegador y en Node |
| `ai.js` | IA opcional con Cohere: extracción con verificación, y asistente de uso. Funciona en navegador y en Node |
| `app.js` | Interfaz: formulario, pestañas, lote, carga masiva y exportación |
| `tests/*.test.js` | Pruebas automáticas de `logic.js`, `assist.js` y `ai.js`. No las usa la página |
| `package.json` | Ficha del proyecto de Node. Define el comando `npm test`. No lo usa la página |
| `.gitignore` | Evita subir archivos `.csv` por accidente |
| `README.md` | Esta documentación |

La página solo necesita `index.html`, `styles.css`, `logic.js`, `assist.js`, `ai.js` y `app.js`. Los demás archivos sirven para documentar, proteger y mantener el código.

## Reglas principales

- Unidades con espacio y en formato estándar (`500 mg`, `10 mL`). En Magento, `ml` en minúscula. Las unidades como `UG` se respetan.
- Abreviaturas de presentación: `CAJ C/30 TAB` pasa a `Caja con 30 tabletas`; `C/30` pasa a `Caja con 30 piezas`.
- Título de medicamentos: `Marca concentración / volumen | Principio activo | Forma | Laboratorio X`, sin piezas en la forma.
- La descripción de Magento se bloquea si en medicamentos no se declara si requiere receta, o si falta el dato vital de la categoría (principio activo, activo, componente o tecnología).
- Meta de medicamentos: `Comprar {marca} {concentración} | {principio} | {laboratorio}` y `El {marca} de {concentración} contiene {principio} por {laboratorio} | Venta en línea de forma segura`. Agrega "con receta médica" solo si se declaró receta. La estructura de las demás categorías es provisional y sus metas salen vacías hasta confirmarlas en la interfaz.
- Sin repetir información: si el tipo ya está dentro del nombre del producto, o la marca al inicio del nombre, el título, la descripción de Merchant Center, las metas y el alt no lo repiten. Las plantillas de Magento conservan ambas filas.
- Alt: se arma con marca, concentración, principio activo y presentación, con límite de 125 caracteres y sin "imagen de".
- Revisión de lenguaje: avisa de claims prohibidos, adjetivos vacíos y claims que requieren validación.
- Cosméticos (NOM-141-SSA1/SCFI-2012): las secciones Ingredientes, Modo de uso, Precauciones y Protección solar se agregan después del texto y la lista aprobados, sin modificarlos, y solo si tienen datos. Avisa de "bloqueador", "protección total" o "100%", de términos de acción medicinal, y verifica que el nivel de protección coincida con la tabla de la norma según el FPS. Los textos tomados del empaque no pasan por la revisión de lenguaje.

## Formato del CSV para Magento

- 104 columnas en el mismo orden del archivo de carga.
- Llenas: `sku`, `description`, `short_description` (igual que `meta_description`), `meta_title`, `meta_description`, `additional_attributes` (`categoria_prod=<título>`), `base_image_label` (alt) y, si se captura, `base_image`.
- Con valor `1`: `product_online`, `use_config_min_qty`, `use_config_min_sale_qty`, `use_config_max_sale_qty`, `use_config_notify_stock_qty` y `use_config_manage_stock`.
- El resto va vacío, incluidas `name` y `meta_keywords`.
- Windows-1252 por defecto (como el archivo original) o UTF-8, saltos CRLF y comillas solo donde hay comas.
- No exporta filas sin SKU, con descripción bloqueada ni con datos faltantes (se puede activar). Los SKU repetidos se exportan una sola vez.
- Prueba siempre con 2 o 3 SKU en un ambiente de pruebas antes de una carga grande.

## Datos crudos (extracción por reglas)

Toma un SKU sucio y llena el formulario, o las filas de una carga masiva con una columna de datos crudos. Solo copia lo que aparece en el texto:

- Concentración, volumen, forma farmacéutica, presentación, vía y receta, cuando aparecen de forma explícita.
- Tipo de producto, sabor, atributo, modelo y activo cosmético en las categorías que los tienen.
- Marca, laboratorio y principio activo solo si están en tus diccionarios (Ajustes, pestaña Diccionarios). El botón "Agregar al diccionario los valores del lote" los aprende del trabajo ya hecho.
- Lo que no se pudo asignar se muestra como "Sin asignar". Opcionalmente puede sugerir la marca por posición, siempre con aviso.

La categoría se detecta por palabras clave y dosis. Es más confiable en medicamentos. Si es ambigua, la herramienta lo indica.

## Carga masiva

CSV con una fila por producto. Columnas: `SKU`, `Categoría`, los campos de la categoría, `Imagen principal` y `Datos crudos`. Descarga la plantilla de cada categoría desde la herramienta. Acepta coma, punto y coma o tabulador, y UTF-8 o Windows-1252.

## Pruebas

Las pruebas revisan con ejemplos que las reglas siguen dando el resultado esperado: normalización de unidades, título y metas de medicamentos, formato de 104 columnas del CSV, valores por defecto, codificación, lectura de CSV y extracción de datos crudos. Sirven para detectar de inmediato si un cambio en `logic.js` rompió algo que ya funcionaba.

Solo se ejecutan en una computadora con Node 18 o superior, desde la carpeta del proyecto:

```
npm test
```

No hay dependencias que instalar. Quien solo usa la herramienta en el navegador no necesita correrlas.

## Datos y privacidad

- `.gitignore` excluye los `.csv` para no subir archivos de carga ni exportaciones por accidente.
- Las plantillas reflejan textos aprobados por Regulatorio y la estructura de meta de la agencia de SEO. Se recomienda un repositorio privado.

## Pendientes por confirmar

- Qué formato lleva `description` en la carga: la plantilla de este repositorio o la que trae el archivo Batch anterior.
- Si Magento aplica `base_image_label` sin `base_image` en la misma fila. Si no, captura la ruta de la imagen que Magento ya tiene.
- Estructura de meta de las categorías distintas de medicamentos.

## Cómo extender

Las categorías, campos y plantillas están en `CATS`, dentro de `logic.js`. Las estructuras de meta y de alt se editan desde la interfaz (Ajustes, pestaña Magento).
