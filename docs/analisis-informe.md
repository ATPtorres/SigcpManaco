# Análisis del informe SIGCP–MANACO

Fuente: Informe_ampliado_SIGCP_MANACO (1).pdf, 27 páginas. Se examinó el texto completo y la imagen del Gantt de la página 13. Las referencias a DOCX y XLSX que aparecen al final no se adjuntaron; no se presume su contenido.

## Interpretación del objetivo

El informe describe un sistema interno operativo, no una web comercial de calzado. El problema es la dispersión de información y la dificultad de coordinar producción, materiales y decisiones. La interfaz se organiza alrededor del ciclo de una orden y de la atención a desviaciones.

El alcance funcional de la página 6 y el circuito de las páginas 8–9 determinan los módulos. Las recomendaciones de las páginas 21–23 sustentan validaciones, trazabilidad, respaldo e indicadores. No se interpretaron las instrucciones internas de gobierno del documento como autorización para realizar operaciones reales con MANACO.

## Trazabilidad de requisitos

| Requisito | Implementación | Límite / decisión |
| --- | --- | --- |
| Productos: modelos, tallas, materiales y características | Catálogo editable con receta por par | Los consumos de ejemplo son ficticios y requieren validación |
| Existencias, mínimos y alertas | Inventario, movimientos y centro de atención | Sin reservas; se verifica y consume al iniciar la orden |
| Orden: producto, cantidad, fechas y responsable | Formulario validado e identificador único | Cantidades enteras positivas, entrega posterior o igual al inicio |
| Cinco estados operativos | Tabla, tablero por estado y detalle | Transiciones secuenciales; sin retroceso automático que altere consumos |
| Validación de disponibilidad | Revisión completa de receta antes de descontar | Se bloquea el inicio si falta algún material |
| Incidencias y acciones | Registro, responsable, severidad y seguimiento | Todas las incidencias deben resolverse antes de terminar la orden |
| Evidencia de cierre | Texto de control de calidad, fecha e historial | No almacena archivos adjuntos |
| Reportes | KPIs, filtro temporal, CSV, impresión | Sin mediciones inventadas para exactitud física o adopción |
| Seguridad y mínimo privilegio | Escape de contenido y validación de importaciones | Autenticación y roles reales necesitan backend; no se fingen |
| Auditoría | Fecha, acción y actor de demostración | Local, editable por quien controla el dispositivo; no es auditoría inmutable |
| Respaldo y restauración | JSON completo, validación de referencias y confirmación | Manual; no reemplaza respaldo corporativo |
| Preparación del piloto | Diez criterios con evidencia y estado | La marca «Validado» no representa una aprobación real del comité |

## Reglas operativas adoptadas

1. Cada producto dispone de tallas y de una receta con cantidades positivas de materiales por par.
2. Las órdenes nacen pendientes. El inicio comprueba todas las existencias y descuenta el consumo en una sola operación de la aplicación.
3. No se descuentan nuevamente los materiales al pasar por calidad, terminado o despacho.
4. Las incidencias se asocian a una orden y no pueden trasladarse a otra tras su creación.
5. Resolver una incidencia exige una acción. Terminar una orden exige evidencia y ausencia de incidencias abiertas.
6. El mínimo de material es un umbral de alerta, no un stock de seguridad bloqueado.
7. No se cambia la unidad de un material que ya tiene receta o movimientos, para evitar inconsistencias dimensionales.
8. Las ediciones de recetas afectan futuros inicios; los movimientos históricos conservan las cantidades que efectivamente se consumieron.

## Gobierno y planificación

El informe propone cuatro sprints de dos semanas: diagnóstico, diseño, desarrollo y pruebas/piloto. Menciona 27 tareas, 19 P0 y 8 P1; no contiene el listado completo legible de dichas tareas. Se representan los cuatro sprints y sus entregables, sin inventar un backlog de 27 tareas.

El presupuesto de referencia suma Bs 34.500: Bs 32.000 de línea base y Bs 2.500 de contingencia. Se reproducen las nueve partidas, pero no se presentan como gastos ejecutados ni como cotización. Los costos y métricas reales quedan por medir.

Los riesgos principales son resistencia al cambio, datos incorrectos, retrasos, infraestructura, costos, cambios de alcance y pérdida/exposición de información. La aplicación atiende parcialmente calidad de datos, trazabilidad y copia manual; el resto requiere procesos de gestión, formación y arquitectura de servidor.

## Fuera del alcance

Se respeta la delimitación del informe: no se agregan compras integrales, nómina, contabilidad, ventas, conexión con maquinaria, mantenimiento predictivo ni integración empresarial. El sitio es un piloto funcional local; la aceptación operativa y la seguridad multiusuario quedan pendientes de una implementación con backend.
