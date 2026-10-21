const { createPool, transaction } = require("../server/db.cjs");
const { hashPassword } = require("../server/auth.cjs");
(async () => {
  if (!process.env.APP_PASSWORD || process.env.APP_PASSWORD.length < 12)
    throw Error("APP_PASSWORD debe tener al menos 12 caracteres.");
  const pool = createPool();
  try {
    const hash = await hashPassword(process.env.APP_PASSWORD);
    await transaction(pool, async (c) => {
      const [users] = await c.execute(
        "SELECT usuario_id FROM USUARIO WHERE nombre=? FOR UPDATE",
        [process.env.APP_USER || "admin"],
      );
      if (!users.length)
        throw Error("Usuario no encontrado. Ejecuta primero db:seed.");
      await c.execute("UPDATE USUARIO SET password_hash=? WHERE usuario_id=?", [
        hash,
        users[0].usuario_id,
      ]);
      await c.execute("DELETE FROM SESION WHERE usuario_id=?", [
        users[0].usuario_id,
      ]);
    });
    console.log("Contraseña actualizada; sesiones anteriores revocadas.");
  } finally {
    await pool.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
