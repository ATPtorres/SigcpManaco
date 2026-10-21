const crypto = require("node:crypto");
const { promisify } = require("node:util");
const scrypt = promisify(crypto.scrypt);
async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64);
  return salt + ":" + key.toString("hex");
}
async function verifyPassword(password, hash) {
  const [salt, hex] = hash.split(":");
  if (!salt || !hex) return false;
  const actual = await scrypt(password, salt, 64);
  const expected = Buffer.from(hex, "hex");
  return (
    actual.length === expected.length &&
    crypto.timingSafeEqual(actual, expected)
  );
}
const tokenHash = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");
function token(req) {
  return (
    (req.headers.cookie || "")
      .split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("manaco_session="))
      ?.slice(15) || ""
  );
}
function cookie(value, maxAge) {
  return `manaco_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${process.env.COOKIE_SECURE === "true" ? "; Secure" : ""}`;
}
function authenticate(pool) {
  return async (req, res, next) => {
    try {
      const t = token(req);
      if (!/^[a-f0-9]{64}$/.test(t))
        return res.status(401).json({ error: "Inicia sesión para continuar." });
      const [users] = await pool.execute(
        "SELECT u.usuario_id,u.nombre,u.rol FROM SESION s JOIN USUARIO u USING(usuario_id) WHERE s.token_hash=? AND s.vence>UTC_TIMESTAMP() AND u.activo=1",
        [tokenHash(t)],
      );
      if (!users.length)
        return res
          .status(401)
          .json({ error: "La sesión expiró. Inicia sesión." });
      req.user = users[0];
      next();
    } catch (e) {
      next(e);
    }
  };
}
module.exports = {
  hashPassword,
  verifyPassword,
  tokenHash,
  token,
  cookie,
  authenticate,
};
