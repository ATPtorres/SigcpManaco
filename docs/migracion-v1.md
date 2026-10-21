# Migración del prototipo y validación operativa

## Qué datos se recuperaron

Se recuperaron los datos ficticios originales desde `seed()` del commit `88eae434faeaf4c284007646cc67c5577bd8f5f2`: seis materiales, cuatro modelos, ocho órdenes y dos incidencias. Las tallas se separan en 26 variantes de producto, sin duplicar órdenes. Se crean cuatro responsables a partir de sus nombres.

La fuente se conserva en `database/legacy/original-demo-v1.json`. Como el código original calculaba fechas relativas cada vez que se abría, el fixture fija la base 2026-10-20 para reproducibilidad. No sustituye un respaldo privado que el usuario haya guardado posteriormente en otro navegador. Los datos privados se pueden importar mediante un JSON exportado desde su origen.

## Procedimiento y protección

1. Aplicar el esquema actualizado y conservar un respaldo de la base actual.
2. Revisar el archivo con `npm run db:import-legacy -- --original` o `--file /ruta/respaldo.json`.
3. Revisar cantidades, advertencias, conflictos y hash de la vista previa.
4. Añadir `--apply` para confirmar, o cargar el JSON en Datos y respaldo y confirmar desde la interfaz.

La importación es **aditiva y transaccional**. No borra ni sustituye materiales existentes. Si ya hay códigos incompatibles, se rechaza; si el archivo ya fue importado, no se vuelve a aplicar. El hash no depende del orden de las propiedades JSON. Una fila de bloqueo serializa importaciones concurrentes. Un conflicto detectado después de comenzar revierte todas las inserciones.

`IMPORTACION_LEGACY` conserva el documento completo, hash, cantidades, mapa de IDs, usuario y fecha. Las cuentas y contraseñas de la aplicación no forman parte de un respaldo v1 ni se importan desde él.

## Correspondencias y datos ausentes

| Origen | Destino y regla |
|---|---|
| Material | Conserva código, nombre, unidad, mínimo y saldo. Los precios ausentes quedan sin confirmar. |
| Modelo con varias tallas | Modelo y variantes SKU independientes por talla/color. Las tallas numéricas se corresponden provisionalmente con sistema EU y deben confirmarse. |
| Receta por par | Una ficha por variante, con una etapa global «Producción heredada». Merma cero conserva la fórmula original. No se inventan etapas de corte o aparado históricas. |
| Responsables como texto | Trabajadores con nombres conservados, contratación por confirmar y tarifa sin confirmar. Solo se habilita la etapa global heredada; el administrador confirma tarifa y habilidades antes de registrar horas nuevas. |
| Saldo agregado | Lote y ubicación técnica de apertura, expresamente identificados como migración y no como recepción física. Con historial de movimientos, el saldo de apertura se calcula para que el saldo final coincida exactamente. |
| Órdenes | Conservan número original, talla, cantidad, responsable, prioridad, fechas conocidas, estado, evidencia e historial. La fecha original de cierre se guarda como DATE; no se inventan horas reales de inicio o fin. |
| Órdenes ya iniciadas | La etapa global se importa iniciada o terminada según el estado. No se vuelve a consumir material que ya estaba descontado. |
| Incidencias | Se conservan y se vinculan a la etapa global de la orden; severidad, responsable, estado y resolución permanecen. |
| Movimientos y bitácora | Se conservan los registros disponibles con indicación de legado. No se reconstruyen consumos ausentes a partir de recetas actuales. |
| Calidad | Los conteos históricos ausentes se muestran como no medidos. Al finalizar una etapa o aprobar una orden migrada que sigue en calidad se capturan cantidades observadas; no se atribuyen retroactivamente a etapas anteriores. |

Los costos desconocidos se marcan expresamente. Un cero técnico de almacenamiento no se presenta como costo real confirmado. Los materiales heredados deben valorarse y las tarifas deben confirmarse con información real. Los costos directos de órdenes heredadas se muestran como parciales porque no incluyen consumos u horas que el prototipo nunca registró.

## Datos nuevos de ejemplo

`npm run db:sample-workflow` crea explícitamente datos ficticios separados: un producto con dos etapas, un material y lote propios, un trabajador con tarifa de ejemplo, una orden completada con horas, incidencia resuelta y calidad, un presupuesto y otra orden con reserva pendiente. El comando es repetible y no modifica los seis saldos originales.

Las órdenes se identifican como `EJEMPLO-COMPLETO` y `EJEMPLO-RESERVA`. No se cargan al iniciar el servidor ni se mezclan con los antecedentes de las órdenes OP-1041 a OP-1048.

## Pruebas

Las suites usan exclusivamente una base `_test` independiente. Verifican:

- Conservación de saldos, recetas, estados, códigos, responsables, cantidades e historial al importar.
- Rechazo de archivos malformados, relaciones rotas, duplicados y cambios entre vista previa y confirmación.
- Reversión completa ante un conflicto tardío y repetición concurrente sin duplicar datos.
- Continuación de órdenes pendientes, en producción y en calidad sin consumos repetidos.
- Bloqueo de horas para tarifas sin confirmar y captura posterior de conteos reales.
- Permisos de administrador, operador y consulta, protección del último administrador y revocación de sesiones.
- Respaldo y restauración en destino vacío, rechazo de reemplazos y rollback de respaldos inválidos.
- Circuito ficticio completo sin cambiar materiales originales.
- Importación real de archivos desde el navegador, cuentas de usuario y permisos en la interfaz y la API.
- 15 vistas × 9 anchos de 320 a 1920 px, accesibilidad automática, teclado y formularios.

Estas pruebas validan la implementación en MySQL 8.4 y Chromium del entorno; no sustituyen la aceptación con procesos y datos reales de MANACO.
