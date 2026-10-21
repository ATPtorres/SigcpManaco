const fs = require("node:fs");
const path = require("node:path");
const { createPool } = require("../server/db.cjs");
async function statements(pool, file) {
  for (const sql of fs
    .readFileSync(file, "utf8")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean))
    await pool.query(sql);
}
async function migrate(pool) {
  const root = path.join(__dirname, "../database");
  await statements(pool, path.join(root, "001_schema.sql"));
  // Version tracking permits additive upgrades of databases already in use.
  await pool.query(
    `CREATE TABLE IF NOT EXISTS SCHEMA_MIGRATION (version VARCHAR(80) PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB`,
  );
  const conn = await pool.getConnection();
  try {
    const [[lock]] = await conn.query(
      "SELECT GET_LOCK('sigcp_schema_migration',30) acquired",
    );
    if (lock.acquired !== 1)
      throw Error("Otra migración del esquema está en curso.");
    for (const file of fs
      .readdirSync(root)
      .filter((f) => /^\d{3}_.+\.sql$/.test(f) && !f.startsWith("001_"))
      .sort()) {
      const [existing] = await conn.execute(
        "SELECT version FROM SCHEMA_MIGRATION WHERE version=?",
        [file],
      );
      if (existing.length) continue;
      // MySQL commits DDL implicitly. Inspect additions before retrying an interrupted upgrade.
      for (const sql of fs
        .readFileSync(path.join(root, file), "utf8")
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)) {
        if (/^ALTER TABLE/.test(sql)) {
          const table = sql.match(/^ALTER TABLE (\w+)/)[1];
          const columns = [
            ...sql.matchAll(/ADD COLUMN (\w+) ([\s\S]+?)(?=, ADD COLUMN|$)/g),
          ];
          if (!columns.length) {
            const constraint = sql.match(/ADD CONSTRAINT (\w+)/);
            if (constraint) {
              const [exists] = await conn.execute(
                "SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND CONSTRAINT_NAME=?",
                [table, constraint[1]],
              );
              if (!exists.length) await conn.query(sql);
            } else await conn.query(sql);
          }
          for (const [, name, type] of columns) {
            const [exists] = await conn.execute(
              "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?",
              [table, name],
            );
            if (!exists.length)
              await conn.query(
                `ALTER TABLE ${table} ADD COLUMN ${name} ${type}`,
              );
          }
        } else await conn.query(sql);
      }
      if (file === "002_legacy.sql") {
        // A migrated record may have an unknown historical start, without inventing one.
        for (const table of ["DETALLE_ORDEN_ETAPA", "ORDEN_FABRICACION"]) {
          const [checks] = await conn.execute(
            `SELECT tc.CONSTRAINT_NAME,cc.CHECK_CLAUSE FROM information_schema.TABLE_CONSTRAINTS tc JOIN information_schema.CHECK_CONSTRAINTS cc ON tc.CONSTRAINT_SCHEMA=cc.CONSTRAINT_SCHEMA AND tc.CONSTRAINT_NAME=cc.CONSTRAINT_NAME WHERE tc.TABLE_SCHEMA=DATABASE() AND tc.TABLE_NAME=? AND tc.CONSTRAINT_TYPE='CHECK'`,
            [table],
          );
          for (const check of checks)
            if (
              check.CHECK_CLAUSE.includes("fin_real") &&
              check.CHECK_CLAUSE.includes("inicio_real") &&
              !check.CHECK_CLAUSE.includes("origen_datos")
            )
              await conn.query(
                `ALTER TABLE ${table} DROP CHECK \`${check.CONSTRAINT_NAME}\``,
              );
          const name =
            table === "ORDEN_FABRICACION"
              ? "chk_orden_fechas_origen"
              : "chk_etapa_fechas_origen";
          if (!checks.some((c) => c.CONSTRAINT_NAME === name))
            await conn.query(
              `ALTER TABLE ${table} ADD CONSTRAINT ${name} CHECK(fin_real IS NULL OR (inicio_real IS NOT NULL AND fin_real>=inicio_real) OR (origen_datos='Migrado' AND inicio_real IS NULL))`,
            );
        }
      }
      await conn.execute("INSERT INTO SCHEMA_MIGRATION(version) VALUES(?)", [
        file,
      ]);
    }
  } finally {
    await conn.query("SELECT RELEASE_LOCK('sigcp_schema_migration')");
    conn.release();
  }
}
if (require.main === module) {
  const pool = createPool();
  migrate(pool)
    .then(() => console.log("Esquema MySQL actualizado."))
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
module.exports = { migrate };
