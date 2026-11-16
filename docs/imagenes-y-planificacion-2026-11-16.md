# Imágenes y programación: entrega verificada

## Cambios de la captura

- Manual de usuario y manual técnico imprimibles, accesibles desde Guía de uso y mediante `/manuales/usuario` y `/manuales/tecnico`.
- Edición del código visible y fin programado de una orden abierta, con motivo, control de cambios de plazo entre sesiones y confirmación explícita para plazos menores al recomendado.
- Recomendación calculada con tiempos de las etapas pendientes, jornada supuesta de ocho horas y un día de margen. La pantalla indica que no incluye colas ni disponibilidad real de personal.
- Fechas programadas editables por etapa, dentro del período de la orden y respetando la secuencia. Fechas reales visibles, registradas al ejecutar las etapas; los datos históricos desconocidos permanecen sin inventar.
- Tarjetas de etapas: actual en rojo, terminadas en azul y pendientes en tono neutro, con texto de estado además del color.
- Selección de fotografía al crear productos/modelos; subida de PNG, JPG o WebP de hasta 2 MB. Cambiar imagen permite actualizar fotos sin versionar la ficha de fabricación.
- Contraseña nueva visible al crear un usuario, con botón para ocultar/mostrar. La edición de usuarios no recupera contraseñas existentes. Al cerrar el formulario, el valor nuevo se elimina de su campo.

## Imágenes generadas

Se utilizó la herramienta integrada de generación de imágenes. Hay 20 fotografías de producto generadas a 1536 × 1024, con fondo blanco y vista lateral hacia la derecha, específicas para 12 modelos y sus colores. Las tallas comparten imagen; las 56 variantes operativas tienen fotografía existente asignada.

| Modelo | Colores representados |
| --- | --- |
| Clásico ejecutivo | Negro |
| Urban casual | Café |
| Sport active | Azul |
| Escolar clásico | Negro |
| Oxford Andino | Negro, Café |
| Mocasín Urbano | Café, Azul |
| Botín Caminante | Azul, Blanco |
| Zapatilla Activa | Blanco, Gris |
| Escolar Resistente | Gris, Negro |
| Bota de Trabajo | Café, Negro |
| Casual Ligero | Café, Azul |
| Deportivo Flexible | Azul, Blanco |

Originales: `assets/shoes/source/`. Versiones WebP de calidad 92: `assets/shoes/` (aproximadamente 3,2 MB en total). Prompts exactos, nombres y correspondencias: `assets/shoes/catalog.json`. Las imágenes fueron revisadas en una hoja de contacto y en el catálogo real del navegador; son representaciones de demostración, no fotografías verificadas de mercancía comercial.

La primera fila de productos tiene prioridad de carga; las demás imágenes usan carga diferida. Se mantiene el zapato completo mediante `object-fit: contain`, con proporciones uniformes y fondo blanco. Las imágenes propias están en `assets/uploads/`, excluido de Git: deben copiarse junto con los datos al trasladar o respaldar la instalación.

## Pruebas terminadas

- 32 pruebas de backend/MySQL aprobadas: imágenes, rutas permitidas, firmas y tamaño de subidas, fechas, secuencia de programación, recomendaciones, conflictos de plazo, inventario, fabricación, calidad, permisos y respaldos.
- 135 combinaciones de pantalla sin desbordamiento; 30 vistas con revisión automática de accesibilidad sin infracciones detectadas.
- Flujo completo de interfaz aprobado, incluyendo selección de imagen, creación de usuario con visibilidad de contraseña, alertas de plazo y fechas de etapa; sin errores de JavaScript detectados.
- Comprobación adicional del selector de imágenes en móvil con axe: sin infracciones detectadas.
- Subida desde navegador móvil, vista previa y guardado de foto comprobados en la base de pruebas; la versión de ficha se conservó.
- Guardado de un modelo con selección automática de foto comprobado. Se corrigió la validación HTML que exigía elegir una imagen manual.
- Contraseña nueva eliminada del formulario cerrado mediante Escape, comprobado en navegador.
- 56 imágenes de variantes y 12 imágenes de modelos verificadas; cero archivos ausentes en el catálogo operativo.
- `npm audit`: cero vulnerabilidades conocidas reportadas en esta comprobación.

Las pruebas de escritura se ejecutaron en la base independiente `sigcp_manaco_test`. El servidor operativo quedó disponible en `http://127.0.0.1:3000`. Las pruebas no sustituyen una evaluación completa de accesibilidad manual, carga o seguridad.
