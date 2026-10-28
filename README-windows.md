# Inicio local en Windows

Esta instalación usa **MySQL 8.4.13** en `127.0.0.1:3307` y el backend Node.js en `http://127.0.0.1:3000`. La instancia MariaDB de XAMPP permanece separada.

## Encender

Ejecutar `iniciar.cmd` con doble clic, o desde CMD:

```cmd
cd /d "C:\xampp\htdocs\SIGCP manaco"
iniciar.cmd
```

El archivo inicia MySQL y el backend en segundo plano, comprueba `/api/health` y abre la página. Los procesos siguen ejecutándose al cerrar CMD. No hace falta Apache para usar la dirección del puerto 3000.

Si Apache está encendido, la dirección anterior `http://localhost/SIGCP%20manaco/` redirige al backend. `.htaccess` impide servir por Apache los archivos privados, los datos MySQL y `.env`.

## Acceso

- Usuario inicial: `admin`.
- Contraseña inicial: valor de `APP_PASSWORD` en `.env`. Abrir el archivo localmente con Bloc de notas; no compartirlo ni subirlo a GitHub.
- `.env` y `.runtime/` están excluidos de Git.

El servicio MySQL tiene claves propias aleatorias. La contraseña del administrador de la aplicación es distinta a las claves de MySQL. Cambiar una clave de `.env` no cambia automáticamente las cuentas existentes: seguir los procedimientos del README principal.

## Archivos y datos

- `.runtime/mysql-8.4.13-winx64/`: distribución oficial de MySQL verificada contra la suma publicada por Oracle.
- `.runtime/mysql-data/`: datos persistentes de la base. No borrar para reiniciar el sistema.
- `.runtime/my.ini`: configuración exclusiva de la instancia local.
- `.runtime/mysql-error.log`, `backend.log` y `backend-error.log`: diagnósticos locales.
- Base operativa: `sigcp_manaco`. Base de pruebas: `sigcp_manaco_test`.

Se inicializan el esquema, los catálogos y la cuenta de acceso. Las órdenes de otro navegador o de la versión anterior no se importan automáticamente. Para conservarlas, exportar el respaldo anterior y usar la migración con vista previa que describe el README principal.

## Comprobación

Abrir `http://127.0.0.1:3000/api/health`. Debe responder:

```json
{"status":"ok","database":"mysql"}
```

Las pruebas de integración se ejecutan con `npm test`; recrean únicamente la base separada de pruebas.
