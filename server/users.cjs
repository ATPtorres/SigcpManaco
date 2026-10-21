const { z } = require("zod");
const s = require("./service.cjs");
const { hashPassword } = require("./auth.cjs");
const userSchema = z
  .object({
    nombre: z.string().trim().min(1).max(80),
    rol: z.enum(["Administrador", "Operador", "Consulta"]),
    activo: z.boolean(),
    password: z.string().min(12).max(200).optional(),
  })
  .strict();
async function saveUser(c, id, input) {
  const d = userSchema.parse(input);
  const admins = await s.rows(
    c,
    "SELECT usuario_id FROM USUARIO WHERE rol='Administrador' AND activo=1 ORDER BY usuario_id FOR UPDATE",
  );
  if (id) {
    const previous = await s.one(
      c,
      "SELECT * FROM USUARIO WHERE usuario_id=? FOR UPDATE",
      [id],
    );
    if (
      previous.rol === "Administrador" &&
      previous.activo &&
      (!d.activo || d.rol !== "Administrador") &&
      admins.length <= 1
    )
      s.fail("Debe permanecer al menos un administrador activo.");
    const fields = { nombre: d.nombre, rol: d.rol, activo: d.activo };
    if (d.password) fields.password_hash = await hashPassword(d.password);
    await s.update(c, "USUARIO", "usuario_id", id, fields);
    if (
      d.password ||
      previous.nombre !== d.nombre ||
      previous.rol !== d.rol ||
      !!previous.activo !== d.activo
    )
      await c.execute("DELETE FROM SESION WHERE usuario_id=?", [id]);
  } else {
    if (!d.password) s.fail("Define la contraseña del nuevo usuario.", 400);
    id = await s.insert(c, "USUARIO", {
      nombre: d.nombre,
      rol: d.rol,
      activo: d.activo,
      password_hash: await hashPassword(d.password),
    });
  }
  return id;
}
function authorize(req, res, next) {
  if (req.path === "/login" || req.path === "/health") return next();
  if (req.user.rol === "Administrador") return next();
  if (
    req.path.startsWith("/users") ||
    req.path.startsWith("/legacy") ||
    req.path === "/backup"
  )
    return res
      .status(403)
      .json({ error: "Esta operación requiere un administrador." });
  if (["GET", "HEAD"].includes(req.method) || req.path === "/logout")
    return next();
  if (
    req.user.rol === "Operador" &&
    /^\/(orders|order-stages|movements|reservations|incidents|labor)(\/|$)/.test(
      req.path,
    )
  )
    return next();
  return res
    .status(403)
    .json({ error: "Tu perfil no permite modificar estos datos." });
}
module.exports = { saveUser, authorize };
