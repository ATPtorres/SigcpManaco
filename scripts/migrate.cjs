const fs = require("node:fs");
const path = require("node:path");
const { createPool } = require("../server/db.cjs");
async function migrate(pool) {
  const sql = fs.readFileSync(
    path.join(__dirname, "../database/001_schema.sql"),
    "utf8",
  );
  for (const statement of sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean))
    await pool.query(statement);
}
if (require.main === module) {
  const pool = createPool();
  migrate(pool)
    .then(() => console.log("Esquema MySQL aplicado."))
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
module.exports = { migrate };
