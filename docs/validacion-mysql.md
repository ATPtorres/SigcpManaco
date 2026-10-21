# Resultado de validación MySQL

Validación realizada en la rama `feat/mysql-production-model`, con MySQL 8.4.11 y Chromium del entorno cloud.

- `npm test`: **22 pruebas aprobadas**, sin fallos ni omitidas. Incluye migración de datos originales, validación, rollback, idempotencia concurrente, inventario, fichas versionadas, etapas, calidad, tarifas, permisos y restauración.
- `npm run test:interface`: **135 combinaciones** (15 vistas y nueve anchos, 320–1920 px), sin desbordamiento de página; auditoría axe en 30 vistas, sin infracciones detectadas. También se probaron teclado, cuatro formularios a 320 px, un circuito operativo completo, importación de un archivo real y gestión de cuentas con revocación de sesión.
- Respaldo de negocio de la base actual y restauración CLI en `sigcp_manaco_restore_test`: todas las tablas coincidieron con el origen. La base activa no se reemplazó.
- Reinicio del backend, inicio de sesión y lectura de datos en Chromium: correctos. No se registraron excepciones JavaScript.
- `npm audit --audit-level=moderate`: cero vulnerabilidades reportadas.

## Datos del entorno actual

La base activa conserva seis materiales, cuatro modelos (26 variantes), ocho órdenes y dos incidencias del prototipo. Los saldos y estados se compararon con el fixture original después del reinicio.

| Código | Saldo original y conservado |
|---|---:|
| MAT-001 | 420 |
| MAT-002 | 1800 |
| MAT-003 | 18 |
| MAT-004 | 320 |
| MAT-005 | 285 |
| MAT-006 | 510 |

Las ocho órdenes originales suman 1650 pares planificados y mantienen sus estados originales. No se volvieron a consumir sus materiales al migrarlas. Los datos fuente y sus fechas de referencia se explican en `database/legacy/README.md`.

Con la demostración previa conservada y el nuevo circuito ficticio separado, el entorno contiene **9 materiales, 28 variantes, 11 órdenes, 3 incidencias, 6 trabajadores, 1 presupuesto, 1 registro de horas y 1 reserva activa**. No son registros operativos reales de MANACO.

Los precios, tarifas, contratos, horas y conteos que no existían en la fuente no se inventaron. Los valores desconocidos permanecen señalados y los conteos nuevos se capturan al operar después de la migración.

La validación corresponde a este entorno. HTTPS público, aceptación con usuarios reales y publicación de una nueva imagen cloud son operaciones independientes; no se presentan como ejecutadas.
