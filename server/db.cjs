const mysql = require("mysql2/promise");
const fs = require("node:fs");
if (fs.existsSync(".env")) process.loadEnvFile(".env");
function createPool(database = process.env.DB_NAME || "sigcp_manaco") {
  return mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "sigcp",
    password: process.env.DB_PASSWORD,
    database,
    connectionLimit: 10,
    decimalNumbers: true,
    dateStrings: true,
    timezone: "Z",
    ...(process.env.DB_SSL_CA
      ? {
          ssl: {
            ca: fs.readFileSync(process.env.DB_SSL_CA),
            rejectUnauthorized: true,
          },
        }
      : {}),
  });
}
async function transaction(pool, fn, isolation = "READ COMMITTED") {
  if (!["READ COMMITTED", "REPEATABLE READ"].includes(isolation))
    throw Error("Invalid isolation level");
  const conn = await pool.getConnection();
  try {
    await conn.query("SET time_zone = '+00:00'");
    await conn.query(`SET TRANSACTION ISOLATION LEVEL ${isolation}`);
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
module.exports = { createPool, transaction };
