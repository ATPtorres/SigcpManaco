const express = require("express");
const crypto = require("node:crypto");
const path = require("node:path");
const { ZodError } = require("zod");
const { transaction } = require("./db.cjs");
const { schemas, catalogs, key } = require("./validation.cjs");
const s = require("./service.cjs");
const { state } = require("./state.cjs");
const auth = require("./auth.cjs");
function createApp(pool) {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
    });
    if (req.path.startsWith("/api")) res.set("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.get("origin") &&
      req.get("origin") !==
        (process.env.APP_ORIGIN || `${req.protocol}://${req.get("host")}`)
    )
      return res.status(403).json({ error: "Origen no permitido." });
    next();
  });
  app.use(express.json({ limit: "1mb" }));
  app.get("/api/health", async (req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ status: "ok", database: "mysql" });
    } catch {
      res.status(503).json({ error: "MySQL no está disponible." });
    }
  });
  const attempts = new Map();
  app.post("/api/login", async (req, res) => {
    const d = schemas.login.parse(req.body);
    const ip = req.ip;
    const now = Date.now();
    const a = attempts.get(ip);
    if (a && a.until > now && a.count >= 10)
      return res
        .status(429)
        .json({ error: "Demasiados intentos. Espera 15 minutos." });
    if (attempts.size > 10000)
      for (const [k, v] of attempts) if (v.until <= now) attempts.delete(k);
    const entry = a && a.until > now ? a : { count: 0, until: now + 900000 };
    entry.count++;
    attempts.set(ip, entry);
    const [users] = await pool.execute(
      "SELECT * FROM USUARIO WHERE nombre=? AND activo=1",
      [d.username],
    );
    const valid = await auth.verifyPassword(
      d.password,
      users[0]?.password_hash ||
        "00000000000000000000000000000000:" + "0".repeat(128),
    );
    if (!users.length || !valid)
      return res
        .status(401)
        .json({ error: "Usuario o contraseña incorrectos." });
    attempts.delete(ip);
    const token = crypto.randomBytes(32).toString("hex");
    await pool.execute("DELETE FROM SESION WHERE vence<=UTC_TIMESTAMP()");
    await pool.execute(
      "INSERT INTO SESION(token_hash,usuario_id,vence) VALUES(?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 8 HOUR))",
      [auth.tokenHash(token), users[0].usuario_id],
    );
    res.set("Set-Cookie", auth.cookie(token, 28800));
    res.json({ user: { name: users[0].nombre, role: users[0].rol } });
  });
  app.use("/api", auth.authenticate(pool));
  app.get("/api/session", (req, res) =>
    res.json({ user: { name: req.user.nombre, role: req.user.rol } }),
  );
  app.post("/api/logout", async (req, res) => {
    await pool.execute("DELETE FROM SESION WHERE token_hash=?", [
      auth.tokenHash(auth.token(req)),
    ]);
    res.set("Set-Cookie", auth.cookie("", 0)).status(204).end();
  });
  app.get("/api/state", async (req, res) =>
    res.json(await transaction(pool, state, "REPEATABLE READ")),
  );
  const mutation = (label, fn) => async (req, res) => {
    const result = await transaction(pool, async (c) => {
      const value = await fn(c, req);
      await s.insert(c, "AUDITORIA", { accion: label, actor: req.user.nombre });
      return value;
    });
    res.status(200).json({ ok: true, id: result ?? null });
  };
  app.post(
    "/api/catalogs/:type",
    mutation("Catálogo registrado", async (c, req) => {
      const def = catalogs[req.params.type];
      if (!def) s.fail("Catálogo desconocido.", 404);
      return s.insert(c, def.table, def.schema.parse(req.body));
    }),
  );
  app.post(
    "/api/materials",
    mutation("Material registrado", (c, r) =>
      s.saveMaterial(c, null, schemas.material.parse(r.body)),
    ),
  );
  app.put(
    "/api/materials/:id",
    mutation("Material actualizado", (c, r) =>
      s.saveMaterial(c, key(r.params.id), schemas.material.parse(r.body)),
    ),
  );
  app.post(
    "/api/products",
    mutation("Producto y ficha registrados", (c, r) =>
      s.saveProduct(c, null, schemas.product.parse(r.body)),
    ),
  );
  app.put(
    "/api/products/:id",
    mutation("Nueva versión de ficha registrada", (c, r) =>
      s.saveProduct(c, key(r.params.id), schemas.product.parse(r.body)),
    ),
  );
  app.post(
    "/api/orders",
    mutation("Orden creada", (c, r) =>
      s.createOrder(c, schemas.order.parse(r.body), r.user.nombre),
    ),
  );
  app.post(
    "/api/orders/:id/advance",
    mutation("Orden actualizada", (c, r) =>
      s.advance(
        c,
        key(r.params.id),
        schemas.advance.parse(r.body),
        r.user.nombre,
      ),
    ),
  );
  app.post(
    "/api/order-stages/:id/start",
    mutation("Etapa iniciada", (c, r) =>
      s.startStage(c, key(r.params.id), r.user.nombre),
    ),
  );
  app.post(
    "/api/order-stages/:id/finish",
    mutation("Etapa terminada", (c, r) =>
      s.finishStage(
        c,
        key(r.params.id),
        schemas.stage.parse(r.body),
        r.user.nombre,
      ),
    ),
  );
  app.post(
    "/api/movements",
    mutation("Movimiento registrado", (c, r) =>
      s.movement(c, schemas.movement.parse(r.body)),
    ),
  );
  app.post(
    "/api/reservations",
    mutation("Material reservado", (c, r) =>
      s.reserve(c, schemas.reserve.parse(r.body)),
    ),
  );
  app.post(
    "/api/reservations/:id/release",
    mutation("Reserva liberada", (c, r) => s.release(c, key(r.params.id))),
  );
  app.post(
    "/api/incidents",
    mutation("Incidencia registrada", (c, r) =>
      s.incident(c, null, schemas.incident.parse(r.body)),
    ),
  );
  app.put(
    "/api/incidents/:id",
    mutation("Incidencia actualizada", (c, r) =>
      s.incident(c, key(r.params.id), schemas.incident.parse(r.body)),
    ),
  );
  app.post(
    "/api/workers",
    mutation("Trabajador registrado", (c, r) =>
      s.worker(c, null, schemas.worker.parse(r.body)),
    ),
  );
  app.put(
    "/api/workers/:id",
    mutation("Trabajador actualizado", (c, r) =>
      s.worker(c, key(r.params.id), schemas.worker.parse(r.body)),
    ),
  );
  app.post(
    "/api/labor",
    mutation("Mano de obra registrada", (c, r) =>
      s.labor(c, schemas.labor.parse(r.body)),
    ),
  );
  app.post(
    "/api/budgets",
    mutation("Presupuesto versionado", (c, r) =>
      s.budget(c, schemas.budget.parse(r.body)),
    ),
  );
  app.put(
    "/api/pilot/:id",
    mutation("Evidencia de piloto registrada", async (c, r) => {
      const id = Number(r.params.id);
      if (!Number.isInteger(id) || id < 0 || id > 9)
        s.fail("Criterio inválido.", 400);
      const d = schemas.pilot.parse(r.body);
      await c.execute(
        "INSERT INTO CRITERIO_PILOTO(criterio_id,validado,evidencia) VALUES(?,?,?) ON DUPLICATE KEY UPDATE validado=VALUES(validado),evidencia=VALUES(evidencia),fecha_hora=UTC_TIMESTAMP()",
        [id, d.checked, d.evidence],
      );
    }),
  );
  app.get("/api/backup", async (req, res) => {
    const tables = [
      "UNIDAD_MEDIDA",
      "LINEA_CALZADO",
      "TALLA",
      "COLOR",
      "MATERIAL",
      "MODELO_CALZADO",
      "PRODUCTO_CALZADO",
      "ETAPA_FABRICACION",
      "FICHA_FABRICACION",
      "FICHA_ETAPA",
      "RECETA_MATERIAL",
      "TRABAJADOR_ZAPATERO",
      "TRABAJADOR_ETAPA",
      "ORDEN_FABRICACION",
      "DETALLE_ORDEN_ETAPA",
      "REQUERIMIENTO_MATERIAL",
      "PRESUPUESTO",
      "DETALLE_PRESUPUESTO",
      "LOTE_MATERIAL",
      "UBICACION",
      "EXISTENCIA_MATERIAL",
      "RESERVA_MATERIAL",
      "MOVIMIENTO_MATERIAL",
      "INCIDENCIA_PRODUCCION",
      "REGISTRO_MANO_OBRA",
      "HISTORIAL_ORDEN",
      "AUDITORIA",
      "CRITERIO_PILOTO",
    ];
    const backup = await transaction(
      pool,
      async (c) => {
        const data = {};
        for (const table of tables)
          data[table] = await s.rows(c, `SELECT * FROM ${table}`);
        return {
          format: "sigcp-mysql",
          version: 1,
          created: new Date().toISOString(),
          tables: data,
        };
      },
      "REPEATABLE READ",
    );
    res
      .set(
        "Content-Disposition",
        'attachment; filename="respaldo-manaco-mysql.json"',
      )
      .json(backup);
  });
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "Operación no encontrada." }),
  );
  const root = path.join(__dirname, "..");
  for (const file of ["index.html", "app.js", "styles.css"])
    app.get("/" + file, (req, res) => res.sendFile(path.join(root, file)));
  app.get("/", (req, res) => res.sendFile(path.join(root, "index.html")));
  app.use((error, req, res, next) => {
    if (error instanceof ZodError)
      return res
        .status(400)
        .json({
          error: error.issues
            .map(
              (i) =>
                (i.path.join(".") ? i.path.join(".") + ": " : "") + i.message,
            )
            .join("; "),
        });
    if (error.type === "entity.parse.failed")
      return res.status(400).json({ error: "JSON inválido." });
    if (error.type === "entity.too.large")
      return res.status(413).json({ error: "Solicitud demasiado grande." });
    if (error.code === "ER_DUP_ENTRY")
      return res
        .status(409)
        .json({ error: "Código, variante o secuencia ya existente." });
    if (
      [
        "ER_NO_REFERENCED_ROW_2",
        "ER_CHECK_CONSTRAINT_VIOLATED",
        "ER_DATA_TOO_LONG",
        "ER_TRUNCATED_WRONG_VALUE",
      ].includes(error.code)
    )
      return res
        .status(400)
        .json({ error: "Datos inválidos o referencia inexistente." });
    if (error.status)
      return res.status(error.status).json({ error: error.message });
    console.error("Error de servidor:", error.code || error.name);
    res
      .status(500)
      .json({
        error:
          "No se pudo confirmar la operación. Actualiza y vuelve a intentarlo.",
      });
  });
  return app;
}
module.exports = { createApp };
