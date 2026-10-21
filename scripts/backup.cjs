const fs = require("node:fs");
const { createPool } = require("../server/db.cjs");
const { backup } = require("../server/backup.cjs");
(async () => {
  const file = process.argv[2];
  if (!file) throw Error("Indica una ruta de archivo de destino.");
  const pool = createPool();
  try {
    const data = await backup(pool);
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    console.log(
      "Respaldo de negocio guardado; no incluye contraseñas ni sesiones.",
    );
  } finally {
    await pool.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
