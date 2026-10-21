const fs = require("node:fs");
const path = require("node:path");
const { createPool } = require("../server/db.cjs");
const { preview, importLegacy } = require("../server/legacy.cjs");
async function main() {
  const args = process.argv.slice(2);
  const original = args.includes("--original");
  const index = args.indexOf("--file");
  const file = original
    ? path.join(__dirname, "../database/legacy/original-demo-v1.json")
    : index >= 0
      ? args[index + 1]
      : null;
  if (!file)
    throw Error(
      "Usa --original o --file /ruta/respaldo.json; --apply confirma la importación.",
    );
  const stat = fs.statSync(file);
  if (stat.size > 10 * 1024 * 1024) throw Error("El archivo excede 10 MB.");
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const pool = createPool();
  try {
    const result = await preview(pool, data);
    console.log(JSON.stringify(result, null, 2));
    if (args.includes("--apply")) {
      if (!result.canImport)
        throw Error("Conflictos pendientes: no se cambió la base.");
      const applied = await importLegacy(pool, data, {
        expectedHash: result.hash,
        label: original
          ? "Datos originales del repositorio (base 2026-10-20)"
          : path.basename(file),
        actor: "Migración CLI",
      });
      console.log(
        applied.alreadyImported
          ? "El archivo ya estaba importado; no se duplicaron registros."
          : "Importación confirmada en MySQL.",
      );
    }
  } finally {
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
