# SIGCP–MANACO

Sistema de gestión de fabricación de calzado con interfaz adaptable, API Node.js y **MySQL 8.4**. Las operaciones se guardan en tablas relacionales; `localStorage` ya no es la fuente de datos. No hay compilación de frontend.

## Requisitos e instalación

- Node.js 22 o superior y npm.
- MySQL 8.4. Docker Compose es una alternativa para iniciarlo.
- Un usuario MySQL con permisos sobre una base exclusiva para esta aplicación.

```sh
npm ci
cp .env.example .env
```

Edita `.env`: establece contraseñas distintas y propias en `DB_PASSWORD`, `MYSQL_ROOT_PASSWORD` y `APP_PASSWORD` (mínimo 12 caracteres). Define `DB_PORT` si 3306 está ocupado. El archivo está excluido de Git; no compartas sus valores.

Para MySQL con Docker:

```sh
docker compose -p sigcp-dev up -d mysql
```

Espera a que el contenedor esté saludable (`docker compose -p sigcp-dev ps`). El volumen `mysql_data` conserva los datos entre reinicios. **No uses `down -v` si necesitas conservarlos.** No se requiere Docker si ya dispones de MySQL: crea una base con `utf8mb4` y configura los mismos parámetros en `.env`.

```sh
npm run db:migrate
npm run db:seed
npm start
```

La aplicación usa el puerto `PORT` (3000 por defecto), limitada a `HOST=127.0.0.1`. Inicia sesión con `APP_USER` y la contraseña configurada. Apache/XAMPP por sí solo ya no ejecuta el sistema: debe iniciarse el backend. En XAMPP se puede servir mediante un proxy hacia Node; el motor de base de datos verificado es MySQL 8.4, no se presupone compatibilidad con MariaDB.

`db:seed` prepara catálogos y crea el usuario inicial si no existe; no cambia contraseñas existentes ni carga órdenes ficticias. Para cambiar la contraseña de ese usuario, edita `APP_PASSWORD` y ejecuta `npm run user:password`; se revocan sus sesiones anteriores.

En una base de desarrollo sin materiales, puedes cargar explícitamente un ejemplo ficticio con un producto, dos materiales, un trabajador y una orden:

```sh
npm run db:seed -- --demo
```

La carga demo rechaza una base que ya tenga materiales. Nunca se ejecuta automáticamente al abrir la aplicación ni al iniciar el servidor.

## Flujo de trabajo

1. **Catálogos:** unidades, líneas, tallas con sistema, colores, modelos, etapas y ubicaciones.
2. **Materiales:** códigos, unidades, costos y mínimos. Cada entrada se registra por lote y ubicación, incluido el saldo inicial.
3. **Trabajadores:** contratación, tarifas y etapas habilitadas.
4. **Productos:** SKU por combinación modelo–talla–color; ficha con etapas secuenciadas, tiempos, costos estimados, materiales y merma. Las filas con la misma secuencia agrupan materiales de una etapa. Cada edición genera una ficha nueva; se pueden consultar sus versiones. Un producto con órdenes conserva su identidad: para otra talla, color o modelo se crea una variante nueva.
5. **Órdenes:** selecciona producto, trabajador, cantidad y fechas. La orden conserva la ficha elegida y copia sus requerimientos.
6. **Lotes y reservas:** reserva el material para una etapa pendiente. Las reservas reducen el saldo disponible para otras órdenes y salidas.
7. **Producción:** iniciar la orden inicia su primera etapa. Cada etapa consume sus propios requerimientos, incluida merma, dentro de una transacción. Termina la etapa indicando cantidades aceptadas y rechazadas e inicia la siguiente desde el detalle de la orden.
8. **Mano de obra e incidencias:** registra horas de trabajadores habilitados; la tarifa aplicada se conserva. Las incidencias se vinculan a la etapa y requieren resolución documentada.
9. **Calidad y despacho:** todas las etapas deben estar terminadas. Aprobar calidad exige evidencia y ausencia de incidencias pendientes.
10. **Presupuestos:** versiones por orden, partidas, unidades, contingencia y aprobación. La pantalla también muestra costos directos registrados de consumo y mano de obra; no inventa costos indirectos.

Usa **Actualizar** para consultar los cambios de otras sesiones. No se simula una escritura local cuando el servidor falla. Los estados generales de la orden son Pendiente → En producción → Control de calidad → Terminado → Despachado. El porcentaje de estado es una posición en ese flujo; los pares finalizados del panel usan los aceptados en la última etapa de órdenes cerradas.

## Modelo de datos y decisiones

[database/001_schema.sql](database/001_schema.sql) implementa las 24 tablas del modelo preliminar y seis ampliaciones iniciales: `RECETA_MATERIAL`, `USUARIO`, `SESION`, `HISTORIAL_ORDEN`, `AUDITORIA` y `CRITERIO_PILOTO`. Las migraciones posteriores añaden procedencia, costos/conteos confirmados, registro de importaciones, bloqueo de migración y control de versiones del esquema. La correspondencia y las restricciones se explican en [docs/modelo-mysql.md](docs/modelo-mysql.md).

Los saldos se derivan de movimientos; no se almacena una segunda cantidad mutable en `EXISTENCIA_MATERIAL`. Los consumos priorizan lotes reservados por la etapa y después recepción más antigua. El costo aplicado al consumo es el promedio ponderado de entradas de ese lote y ubicación. Una etapa registra cantidades sobre el total planificado; no hay generación automática de órdenes de reproceso por rechazo.

El servidor bloquea la orden y los materiales implicados para impedir consumos duplicados y sobreasignación concurrente. Las escrituras usan transacciones `READ COMMITTED`; lecturas y exportaciones usan una instantánea `REPEATABLE READ`. Las restricciones de MySQL complementan las validaciones del servidor.

## Datos anteriores y respaldos

La migración ya está implementada. Consulta [docs/migracion-v1.md](docs/migracion-v1.md) para las correspondencias, datos no medidos y verificaciones.

Los datos anteriores no se borran ni se importan al iniciar el servidor. Para recuperar los ejemplos originales del repositorio o un respaldo del navegador:

```sh
npm run db:import-legacy -- --original
npm run db:import-legacy -- --original --apply
# Para un respaldo propio, reemplaza --original por --file /ruta/respaldo.json
```

La primera ejecución muestra la vista previa; `--apply` confirma la importación aditiva. El mismo archivo no se importa dos veces. Los conflictos cancelan toda la operación. También puedes seleccionar el JSON en **Datos y respaldo → Migrar respaldo anterior**, revisar la vista previa y confirmar. No se inventan lotes físicos, tarifas, costos, contratos ni etapas históricas: se utiliza un origen heredado explícito y se conservan los documentos originales.

Al cambiar de Apache a otro host/puerto cambia el origen del navegador: exporta el JSON desde la aplicación antigua. El botón de exportación anterior solo puede recuperar datos del mismo origen. El archivo incluido en el repositorio es una reproducción de sus datos ficticios iniciales, no una copia de datos privados de otro navegador.

Para añadir un circuito ficticio completo, separado de los datos originales:

```sh
npm run db:sample-workflow
```

En **Datos y respaldo** se exportan las 29 tablas de negocio, incluido el registro de importaciones, sin contraseñas ni sesiones. También existe un respaldo/restauración por CLI:

```sh
npm run db:backup -- /ruta/segura/respaldo.json
npm run db:restore -- --database sigcp_recuperacion --file /ruta/segura/respaldo.json --apply
```

El destino de restauración debe existir, ser distinto de la base activa de `.env` y estar vacío de datos de negocio. El script aplica el esquema y restaura en una transacción, valida saldos y referencias y rechaza reemplazar registros existentes. No restaura usuarios ni sesiones: después de verificar la copia, configura sus cuentas mediante la inicialización o un administrador. Los respaldos SQL completos siguen siendo recomendables para operación.

Para un respaldo SQL completo, ejecuta el cliente MySQL con un usuario autorizado y contraseña solicitada de manera interactiva:

```sh
mysqldump --host=127.0.0.1 --port=3306 --user=sigcp --password \
  --single-transaction --no-tablespaces --set-gtid-purged=OFF sigcp_manaco > respaldo.sql
```

Ajusta host, puerto, usuario y base a `.env`. Protege el archivo: incluye hashes de usuarios. Prueba su restauración **en otra base** con el cliente `mysql`, revisa los datos y planifica el cambio de conexión antes de sustituir una base operativa. La restauración SQL debe ejecutarla el administrador, no un formulario web.

## Pruebas

Las pruebas necesitan una base separada `sigcp_manaco_test` y los mismos permisos para el usuario de desarrollo. Un administrador de MySQL puede prepararla (adapta el usuario):

```sql
CREATE DATABASE sigcp_manaco_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
GRANT ALL PRIVILEGES ON sigcp_manaco_test.* TO 'sigcp'@'%';
```

```sh
npm test
npm run test:interface
```

`npm test` **recrea las tablas de la base de pruebas**, aplica el esquema dos veces, carga datos ficticios y prueba autenticación, referencias, fichas versionadas, rollback, concurrencia, reservas, etapas, incidencias, horas, costos, calidad y despacho. Rechaza una base que no termine en `_test` o que coincida con `DB_NAME`.

La prueba de interfaz usa el backend real y la misma base de pruebas preparada por `npm test`. Requiere Chromium: usa `/usr/bin/chromium`, el ejecutable indicado en `CHROMIUM_PATH`, o un Chromium instalado por Playwright (`npx playwright install chromium`). Verifica 15 vistas en nueve anchos (320–1920 px), accesibilidad automática, teclado, formularios y un circuito completo persistido desde otra sesión. Incluye importación de archivos, usuarios y cambios de perfil. Ambas suites deben ejecutarse en secuencia.

Las antiguas pruebas con almacenamiento simulado fueron reemplazadas por pruebas de integración MySQL; no se conserva un modo local alternativo que pueda ocultar fallos de conexión.

## Acceso y despliegue

Las credenciales de aplicación se almacenan con scrypt; las sesiones, con un hash del token y caducidad de ocho horas. Las cookies son HttpOnly y SameSite Strict. Las operaciones requieren sesión y rechazan orígenes cruzados. Solo se sirven los archivos públicos indicados por el servidor, nunca `.env` ni archivos SQL.

El alta inicial proporciona un administrador. **Usuarios y permisos** permite crear cuentas, cambiar su perfil, activar/desactivar y restablecer contraseñas. Siempre debe quedar un administrador activo. Cambiar acceso, contraseña o perfil revoca sesiones anteriores.

- Administrador: catálogos, maestros, presupuesto, usuarios, respaldos, migraciones y operación.
- Operador: órdenes, etapas, movimientos, reservas, incidencias y horas; no puede cambiar configuración, tarifas, cuentas ni presupuestos.
- Consulta: lectura y reportes; ninguna escritura.

Los permisos se validan en el servidor además de ocultar controles no permitidos en la interfaz. Para un despliegue compartido configura HTTPS, `COOKIE_SECURE=true`, `APP_ORIGIN` con el origen público exacto, un proxy fiable y un usuario MySQL de ejecución con privilegios mínimos. La creación del esquema debe usar credenciales de instalación; las tareas operativas no necesitan permisos DDL. Para MySQL remoto configura TLS con `DB_SSL_CA`; la verificación del certificado permanece activada.

La bitácora es del servidor y registra al usuario autenticado; no se presenta como auditoría inmutable frente a un administrador de MySQL. La publicación del entorno cloud y el despliegue de producción son pasos distintos de ejecutar estas pruebas.
