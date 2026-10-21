# Implementación del modelo preliminar

El sistema utiliza MySQL 8.4/InnoDB como fuente de verdad. La respuesta `/api/state` es una proyección de lectura para la interfaz; no se almacena un JSON de la aplicación ni se reemplazan tablas con instantáneas enviadas por el navegador.

## Tablas originales

Se conservan las 24 entidades propuestas y sus relaciones:

| Área | Tablas |
|---|---|
| Catálogos | UNIDAD_MEDIDA, LINEA_CALZADO, TALLA, COLOR, ETAPA_FABRICACION, UBICACION |
| Productos y recetas | MODELO_CALZADO, PRODUCTO_CALZADO, FICHA_FABRICACION, FICHA_ETAPA |
| Planificación y ejecución | ORDEN_FABRICACION, DETALLE_ORDEN_ETAPA, REQUERIMIENTO_MATERIAL |
| Inventario | MATERIAL, LOTE_MATERIAL, EXISTENCIA_MATERIAL, RESERVA_MATERIAL, MOVIMIENTO_MATERIAL |
| Personal | TRABAJADOR_ZAPATERO, TRABAJADOR_ETAPA, REGISTRO_MANO_OBRA |
| Incidencias | INCIDENCIA_PRODUCCION |
| Presupuestos | PRESUPUESTO, DETALLE_PRESUPUESTO |

## Ampliaciones y correcciones

- **RECETA_MATERIAL:** materiales estándar de una etapa de ficha, disponibles antes de que exista una orden. Al crear la orden se copian a REQUERIMIENTO_MATERIAL. La merma se aplica como `neto × (1 + merma/100) × pares` y se redondea a cuatro decimales.
- **HISTORIAL_ORDEN y AUDITORIA:** eventos de la orden y acciones confirmadas del servidor con usuario autenticado.
- **CRITERIO_PILOTO:** conserva las evidencias del piloto del prototipo.
- **USUARIO y SESION:** acceso real; no son trabajadores ficticios ni nombres libres usados como autenticación. Un trabajador puede ser responsable de producción sin tener una cuenta de acceso.
- **ORDEN_FABRICACION.responsable_id y evidencia_calidad:** responsable normalizado y evidencia de cierre.
- **INCIDENCIA_PRODUCCION.responsable_id y severidad:** conserva las capacidades útiles del prototipo y vincula el responsable con personal real.
- **DETALLE_ORDEN_ETAPA.ficha_id:** permite FK compuestas que garantizan que la etapa pertenezca a la ficha de la orden. REQUERIMIENTO_MATERIAL referencia la pareja orden/etapa existente.
- **COLOR.tono y MODELO_CALZADO.descripcion:** representación y descripción de catálogo.
- **Movimiento sin etapa:** entradas y salidas generales admiten detalle_etapa_id nulo; los consumos de producción siempre identifican una etapa.
- **Saldo:** suma de entradas menos salidas y consumos por existencia. Disponible = saldo − reservas activas. Los saldos iniciales también son movimientos explícitos.

## Integridad y transacciones

PK, FK, claves únicas y CHECK garantizan referencias, variantes únicas, versiones por producto/orden y valores básicos válidos. El servidor comprueba además secuencia, habilidades del trabajador, horas diarias, resolución de incidencias y disponibilidad real. No se confía en el contenido del navegador.

Las fichas se archivan y se crea otra versión al editar. No se modifican sus etapas históricas. Cambiar la receta actual no cambia requerimientos ni consumos de órdenes ya creadas. Si el producto tiene órdenes, no se permite cambiar su SKU, modelo, talla o color.

Para iniciar una etapa se bloquea la orden y se bloquean los materiales en orden de ID. Los cálculos de saldo se hacen después del bloqueo bajo READ COMMITTED, de modo que ven el último movimiento confirmado por otra sesión. Si falta cualquier material, toda la transacción se revierte. Una segunda solicitud de inicio encuentra la etapa o estado actualizado y no vuelve a consumir. Reservar, liberar y retirar materiales usan el mismo protocolo de bloqueo. La lectura de pantallas y exportaciones usa REPEATABLE READ para mantener coherencia entre sus consultas.

## Alcance operativo

La API y las pantallas permiten mantener los catálogos, altas/ediciones de materiales y productos, versionar fichas, crear órdenes y ejecutar etapas, registrar recepciones/salidas por lote, reservar/liberar materiales, mantener trabajadores y habilidades, registrar horas, resolver incidencias y crear versiones de presupuestos con partidas y contingencia.

No se borran maestros con historial. El estado inactivo se utiliza para materiales, variantes y trabajadores. Las entidades referenciadas por registros históricos permanecen conservadas. Los presupuestos nuevos generan versiones; no sobrescriben versiones previas.

Las cantidades aceptadas y rechazadas de cada etapa suman el plan de la orden. El sistema registra rechazo sin crear automáticamente reprocesos ni transferencias de inventario. Los costos directos son consumos valorizados más horas registradas; no representan una contabilidad industrial completa.

Los registros locales del antiguo prototipo requieren una migración de datos separada: faltan lotes, ubicaciones, variantes y etapas históricas. La aplicación preserva el almacenamiento anterior y permite exportarlo desde su origen; no inventa esos antecedentes.
