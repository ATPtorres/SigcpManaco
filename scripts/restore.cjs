const fs = require("node:fs");
const { createPool } = require("../server/db.cjs");
const { migrate } = require("./migrate.cjs");
const { restore } = require("../server/backup.cjs");
(async () => {
  const args = process.argv.slice(2),
    file = args[args.indexOf("--file") + 1],
    database = args[args.indexOf("--database") + 1];
  if (
    !args.includes("--apply") ||
    !args.includes("--file") ||
    !args.includes("--database")
  )
    throw Error("Usa --database base_nueva --file respaldo.json --apply.");
  if (
    !/^[a-zA-Z0-9_]+$/.test(database) ||
    database === (process.env.DB_NAME || "sigcp_manaco")
  )
    throw Error("El destino debe ser otra base, nunca la base activa de .env.");
  if (fs.statSync(file).size > 128 * 1024 * 1024)
    throw Error("El respaldo supera 128 MB.");
  const input = JSON.parse(fs.readFileSync(file, "utf8"));
  const pool = createPool(database);
  try {
    await migrate(pool);
    const counts = await restore(pool, input);
    console.log("Restauración confirmada en la base alternativa:", database);
    console.log(JSON.stringify(counts));
  } finally {
    await pool.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
