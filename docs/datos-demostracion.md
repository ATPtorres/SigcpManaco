# Carga de datos de demostración

Se ejecutó `npm run db:populate` en la base del sistema y se repitió para comprobar que no duplica registros. Se guardó un respaldo previo fuera del repositorio. Los ejemplos nuevos se identifican por el prefijo `DEMO-POB-`, nombres «(demo)», observaciones o evidencias que indican su carácter ficticio.

## Cantidades después de la carga

| Información | Total |
|---|---:|
| Materiales | 21 |
| Modelos | 14 |
| Variantes de producto por talla/color | 76 |
| Trabajadores | 18 |
| Órdenes | 31 |
| Lotes | 29 |
| Incidencias | 13 |
| Presupuestos, incluidas versiones | 23 |
| Registros de mano de obra | 59 |
| Reservas activas | 8 |
| Criterios del piloto | 10 |

Distribución de órdenes: 8 pendientes, 6 en producción, 6 en control de calidad, 5 terminadas y 6 despachadas.

## Qué se añadió

- 12 materiales con costos, unidades, mínimos, lotes y ubicaciones propios. Dos materiales tienen deliberadamente saldo bajo el mínimo para mostrar alertas.
- 8 modelos ficticios distribuidos en las cinco líneas de calzado.
- 48 variantes: tres tallas y dos colores por modelo, con fichas de cuatro etapas.
- 12 trabajadores ficticios con tarifas y habilidades para las etapas del ejemplo.
- 20 órdenes nuevas: cuatro por estado general, con diferentes cantidades y fechas programadas.
- Incidencias resueltas en ejemplos completados y casos abiertos o en atención para practicar su gestión. Los cierres respetan las reglas reales del servidor.
- Horas registradas, consumos, reservas para etapas pendientes y presupuestos de ejemplo con partidas, contingencia y revisiones.
- Criterios del piloto pendientes con evidencia de demostración, sin afirmar una aprobación real.

## Conservación e integridad

Se comparó cada fila de las 29 tablas de negocio del respaldo anterior con la base posterior: todas las filas previas permanecieron sin cambios. Los seis materiales originales mantienen sus saldos de 420, 1800, 18, 320, 285 y 510, respectivamente. No se cambiaron las cuentas, contraseñas ni datos históricos de las órdenes originales.

La carga usa los servicios existentes del backend para crear fichas, órdenes, movimientos, horas, incidencias y presupuestos; no escribe estados finales incompatibles para simular un proceso. El inventario se verificó sin saldos negativos ni reservas superiores al saldo. Una transacción y un marcador de auditoría hacen que la carga sea aditiva y repetible.

La prueba de integración comprueba conservación de filas previas, cantidades añadidas, órdenes en los cinco estados, integridad de cierres e idempotencia. Ejecutar `npm test` utiliza exclusivamente la base `_test` independiente y nunca vuelve a poblar ni borra la base operativa.

Para consultar los nuevos registros en una página ya abierta, pulsa **Actualizar**.
