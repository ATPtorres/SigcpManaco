// Configuración privada para una instancia NUEVA y exclusiva de MySQL local.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
const runtime = path.join(root, '.runtime');
fs.mkdirSync(runtime, {recursive:true});
if (fs.existsSync(path.join(root,'.env'))) throw Error('Ya existe .env; no se reemplazó.');
const secret = () => crypto.randomBytes(24).toString('base64url');
const appPassword = secret(), dbPassword = secret(), rootPassword = secret();
const content = [
 'DB_HOST=127.0.0.1','DB_PORT=3307','DB_NAME=sigcp_manaco','DB_USER=sigcp',
 'DB_PASSWORD='+dbPassword,'MYSQL_ROOT_PASSWORD='+rootPassword,
 'APP_USER=admin','APP_PASSWORD='+appPassword,'HOST=127.0.0.1','PORT=3000',
 'COOKIE_SECURE=false','DB_TEST_NAME=sigcp_manaco_test',''
].join('\n');
fs.writeFileSync(path.join(root,'.env'),content,{flag:'wx',mode:0o600});
fs.writeFileSync(path.join(runtime,'bootstrap.sql'),[
 `ALTER USER 'root'@'localhost' IDENTIFIED BY '${rootPassword}';`,
 'CREATE DATABASE IF NOT EXISTS sigcp_manaco CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;',
 'CREATE DATABASE IF NOT EXISTS sigcp_manaco_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;',
 ...['localhost','127.0.0.1'].flatMap(host=>[
  `CREATE USER IF NOT EXISTS 'sigcp'@'${host}' IDENTIFIED BY '${dbPassword}';`,
  `GRANT ALL PRIVILEGES ON sigcp_manaco.* TO 'sigcp'@'${host}';`,
  `GRANT ALL PRIVILEGES ON sigcp_manaco_test.* TO 'sigcp'@'${host}';`
 ]),''
].join('\n'),{flag:'wx',mode:0o600});
const normalized = root.replaceAll('\\','/');
fs.writeFileSync(path.join(runtime,'my.ini'),[
 '[mysqld]',`basedir="${normalized}/.runtime/mysql-8.4.13-winx64"`,
 `datadir="${normalized}/.runtime/mysql-data"`,'port=3307','bind-address=127.0.0.1',
 'mysqlx=OFF','skip-name-resolve','character-set-server=utf8mb4',
 'collation-server=utf8mb4_0900_ai_ci','local-infile=OFF',
 `log-error="${normalized}/.runtime/mysql-error.log"`,
 `pid-file="${normalized}/.runtime/mysql.pid"`,''
].join('\n'),{flag:'wx'});
console.log('Configuración local creada. Las contraseñas se guardan únicamente en .env.');
