# Auditoría técnica de SIGCP MANACO

Actualización: los hallazgos de esta revisión se atendieron posteriormente. Consulta los cambios y las pruebas finales en [Arreglos y mejoras aplicados](mejoras-2026-11-11.md). Este documento conserva el diagnóstico original.

Fecha: 11 de noviembre de 2026. Revisión local de código, dependencias, backend, MySQL e interfaz. Esta revisión identifica problemas; no modifica las reglas de negocio ni actualiza dependencias.

## Resultados ejecutados

| Comprobación | Resultado |
| --- | --- |
| `npm test` | 23 pruebas aprobadas, cero fallos |
| `npm run test:interface` | Aprobada con Chromium instalado para Playwright |
| Adaptabilidad | 135 combinaciones: 15 vistas, nueve anchos entre 320 y 1920 px, sin desbordamiento de página |
| Accesibilidad automática | Cero infracciones reportadas por axe en las 30 vistas revisadas |
| Navegación | Teclado, foco, Escape, menú móvil, cierre y cambio de tamaño aprobados |
| Operación desde interfaz | Trabajador, material/lote, modelo, ficha, orden, reserva, consumo, horas, incidencia, calidad, despacho y presupuesto aprobados |
| Seguridad funcional | Roles, revocación de sesiones, protección de rutas, texto HTML escapado y rechazo de operaciones no autorizadas aprobados |
| Sintaxis | 23 archivos JS/CJS verificados con `node --check` |
| `npm audit --json` | Dos dependencias con avisos de gravedad alta: body-parser y zod |
| Integridad operativa, solo lectura | Cero lotes con saldo negativo, cero reservas superiores al saldo y cero órdenes marcadas con costos incompletos |

Las suites se ejecutaron secuencialmente en `sigcp_manaco_test`. La base operativa conservó sus ocho productos, ocho materiales, diez órdenes y cuatro trabajadores. Las reproducciones adicionales se hicieron dentro de una transacción revertida en la base de pruebas. Se instaló el navegador de pruebas que faltaba en este equipo.

## Hallazgos prioritarios

### 1. Alta: dependencias con avisos de seguridad

La instalación auditada contiene `zod` 4.1.12 y una versión vulnerable de `body-parser`, dependencia transitiva de Express. Los avisos describen agotamiento de memoria y caída del proceso, respectivamente. La presencia se confirmó mediante `npm audit`; no se ejecutaron cargas maliciosas contra el servidor operativo.

Acción: actualizar Zod a una versión corregida (el aviso indica 4.6.6 o posterior) y resolver body-parser a 2.4.0 o posterior, verificando compatibilidad con Express y el archivo de bloqueo. Repetir ambas suites y la auditoría tras actualizar.

Fuentes: [aviso de body-parser](https://github.com/advisories/GHSA-27r3-jxmh-p828), [aviso de Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).

### 2. Alta: los rechazos no se concilian entre etapas

Ubicación: `server/service.cjs`, `startStageLocked` y `finishStage`, especialmente línea 355. El cierre exige que aceptados más rechazados sumen siempre el plan original. La etapa siguiente también consume materiales para el plan original.

Reproducción confirmada: crear una orden de diez pares, iniciar corte y terminar con ocho aceptados y dos rechazados. Iniciar aparado y terminar con diez aceptados y cero rechazados. El sistema permite ambas operaciones sin registrar recuperación o reproceso de los dos rechazados.

Impacto: el historial puede mostrar una recuperación de unidades sin justificación y los consumos posteriores pueden corresponder a unidades descartadas. La suite actual prueba el recorrido sin rechazos, pero no esta conciliación.

Acción: definir si un rechazo significa descarte o retrabajo. Para descarte, propagar la cantidad aceptada como entrada de la siguiente etapa y calcular sus consumos con esa cantidad. Para retrabajo, registrar explícitamente recuperación, materiales y horas antes de reintegrar unidades. Añadir pruebas de rechazos parciales y totales, calidad y costos.

### 3. Media: se admiten horas futuras

Ubicación: `server/service.cjs`, función `labor`, líneas 569–596. Se comprueban estado, habilitación, tarifa y máximo diario, pero no la relación de la fecha con el día operativo o el inicio real de la etapa.

Reproducción confirmada: registrar una hora con fecha `2099-01-01` sobre una etapa recién iniciada. Se acepta. La fecha pasa también la validación de formato de la API.

Impacto: las horas y costos pueden quedar asignados a períodos que todavía no han ocurrido.

Acción: rechazar fechas futuras usando la zona horaria operativa; definir las reglas de registros retrospectivos y su autorización. Probar también límites diarios al cambiar de día y fechas anteriores al inicio real.

## Mejoras profesionales recomendadas

1. **Escalabilidad:** dividir `/api/state` en consultas paginadas y filtradas. `server/state.cjs` carga históricos, movimientos, recetas y órdenes completos; después relaciona muchas colecciones mediante filtros en memoria. Con los datos actuales el JSON ocupa 108.807 bytes; cinco lecturas locales directas tardaron 77, 20, 19, 19 y 20 ms. Estas mediciones no equivalen a una prueba de carga ni permiten predecir tiempos con miles de órdenes.
2. **Automatización:** añadir integración continua con MySQL aislado, pruebas de backend, instalación de Chromium, pruebas de interfaz y auditoría de dependencias. Las suites deben mantenerse secuenciales porque comparten la base de pruebas.
3. **Operación:** preparar despliegue con HTTPS, supervisión y reinicio del proceso, registros estructurados, alertas y respaldos programados con restauración ensayada. La suite actual ya verifica exportación/restauración de negocio a una base vacía.
4. **Trazabilidad:** ampliar auditoría con entidad e identificador afectados, cambios relevantes y motivo de corrección; registrar los reprocesos y ajustes con responsables.

Orden recomendado: dependencias, conciliación de cantidades, fechas de mano de obra y después automatización, despliegue y escalabilidad.

## Límites de la revisión

No se realizó una prueba de penetración, carga concurrente prolongada, caída forzada de infraestructura ni una evaluación manual completa de accesibilidad. Que las pruebas actuales pasen no invalida los hallazgos adicionales reproducidos. Los datos operativos no se alteraron durante esta auditoría.
