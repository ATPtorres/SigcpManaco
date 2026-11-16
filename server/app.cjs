const express = require("express");
const crypto = require("node:crypto");
const path = require("node:path");
const { ZodError } = require("zod");
const { transaction } = require("./db.cjs");
const { schemas, catalogs, key } = require("./validation.cjs");
const s = require("./service.cjs");
const { state } = require("./state.cjs");
const auth = require("./auth.cjs");
const legacy = require("./legacy.cjs");
const { auditTarget, clean } = require('./audit.cjs');
function createApp(pool) {
  const app = express();
  if (process.env.TRUST_PROXY === 'loopback') app.set('trust proxy','loopback');
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const start = Date.now();
    const requestId = crypto.randomUUID();
    res.set('X-Request-ID', requestId);
    res.on('finish', () => {
      if (process.env.REQUEST_LOG === 'true') console.log(JSON.stringify({ time: new Date().toISOString(), requestId, method: req.method, path: req.path, status: res.statusCode, durationMs: Date.now()-start }));
    });
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
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
  app.use("/api/legacy", express.json({ limit: "10mb" }));
  app.use('/api/images',express.json({limit:'3mb'}));
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
  app.get('/api/public-info', (req,res) => {
    const email = String(process.env.SUPPORT_EMAIL || '').trim();
    res.json({supportEmail: require('zod').z.string().email().safeParse(email).success ? email : null});
  });
  app.use("/api", auth.authenticate(pool));
  app.use("/api", require("./users.cjs").authorize);
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
    res.json(
      await transaction(
        pool,
        async (c) => {
          const data = await state(c, { compact: req.query.compact === '1' });
          if (req.user.rol === "Administrador")
            data.users = await s.rows(
              c,
              "SELECT usuario_id,nombre,rol,activo FROM USUARIO ORDER BY usuario_id",
            );
          return data;
        },
        "REPEATABLE READ",
      ),
    ),
  );
  const mutation = (label, fn) => async (req, res) => {
    const result = await transaction(pool, async (c) => {
      const before = await auditTarget(c, req);
      const value = await fn(c, req);
      const after = await auditTarget(c, req, value);
      await s.insert(c, "AUDITORIA", { accion: label, actor: req.user.nombre,
        entidad: after.entidad, registro_id: after.registro_id,
        cambios: JSON.stringify({ antes: before.row, despues: after.row, solicitud: req.path==='/api/images'?{tipo:req.body.type}:clean(req.body) }),
        motivo: String(req.body?.motivo || req.get('X-Change-Reason') || label).slice(0,500) });
      return value;
    });
    res.status(200).json({ ok: true, id: result ?? null });
  };
  app.get('/api/records/:type', require('./records.cjs').records(pool));
  app.post('/api/images',mutation('Imagen de producto cargada',async(c,r)=>require('./images.cjs').saveUpload(r.body)));
  for(const [resource,table,keyColumn] of [['products','PRODUCTO_CALZADO','producto_id'],['models','MODELO_CALZADO','modelo_id']]) {
    app.put(`/api/${resource}/:id/image`,mutation('Imagen de catálogo actualizada',async(c,r)=>{
      if(r.user.rol!=='Administrador')s.fail('Se requiere administrador.',403);
      const d=schemas.picture.parse(r.body),id=key(r.params.id);
      require('./images.cjs').checkImage(d.imagen_url);
      await s.one(c,`SELECT ${keyColumn} FROM ${table} WHERE ${keyColumn}=? FOR UPDATE`,[id]);
      await s.update(c,table,keyColumn,id,{imagen_url:d.imagen_url});return id;
    }));
  }
  app.put('/api/orders/:id/plan',mutation('Código y plazo de orden actualizado',(c,r)=>s.planOrder(c,key(r.params.id),schemas.orderPlan.parse(r.body),r.user.nombre)));
  app.put('/api/order-stages/:id/plan',mutation('Fechas de etapa actualizadas',(c,r)=>s.planStage(c,key(r.params.id),schemas.stagePlan.parse(r.body),r.user.nombre)));
  app.post(
    "/api/users",
    mutation("Usuario creado", (c, r) =>
      require("./users.cjs").saveUser(c, null, r.body),
    ),
  );
  app.put(
    "/api/users/:id",
    mutation("Usuario actualizado", (c, r) =>
      require("./users.cjs").saveUser(c, key(r.params.id), r.body),
    ),
  );
  app.post(
    "/api/catalogs/:type",
    mutation("Catálogo registrado", async (c, req) => {
      const def = Object.hasOwn(catalogs, req.params.type)
        ? catalogs[req.params.type]
        : null;
      if (!def) s.fail("Catálogo desconocido.", 404);
      const data=def.schema.parse(req.body);
      if(req.params.type==='models')require('./images.cjs').checkImage(data.imagen_url);
      return s.insert(c, def.table, data);
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
  app.post("/api/legacy/preview", async (req, res) =>
    res.json(await legacy.preview(pool, req.body)),
  );
  app.post("/api/legacy/import", async (req, res) => {
    if (
      !req.body ||
      typeof req.body.expectedHash !== "string" ||
      !req.body.data
    )
      s.fail("Se requiere vista previa y archivo.", 400);
    res.json(
      await legacy.importLegacy(pool, req.body.data, {
        expectedHash: req.body.expectedHash,
        actor: req.user.nombre,
        label: "Respaldo importado desde la interfaz",
      }),
    );
  });
  app.get("/api/backup", async (req, res) => {
    const backup = await require("./backup.cjs").backup(pool);
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
  app.get('/assets/shoes/:file',(req,res,next)=>{
    if(!/^[a-z0-9-]+\.webp$/.test(req.params.file))return res.status(404).end();
    res.set('Cache-Control','public, max-age=86400').sendFile(path.join(root,'assets/shoes',req.params.file),error=>{if(error&&!res.headersSent)res.status(404).json({error:'Imagen no encontrada.'});});
  });
  app.get('/assets/uploads/:file',(req,res)=>{
    if(!/^[a-f0-9]{32}\.(png|jpg|webp)$/.test(req.params.file))return res.status(404).end();
    res.set('Cache-Control','public, max-age=86400').sendFile(path.join(root,'assets/uploads',req.params.file),error=>{if(error&&!res.headersSent)res.status(404).json({error:'Imagen no encontrada.'});});
  });
  for(const manual of ['usuario','tecnico'])app.get('/manuales/'+manual,(req,res)=>res.sendFile(path.join(root,'docs/manual-'+manual+'.html')));
  app.get('/evaluacion', (req,res) => res.sendFile(path.join(root,'evaluation.html')));
  for (const file of ["index.html", "app.js", "styles.css", "evaluation.js"])
    app.get("/" + file, (req, res) => res.sendFile(path.join(root, file)));
  app.get("/", (req, res) => res.sendFile(path.join(root, "index.html")));
  app.use((error, req, res, next) => {
    if (error instanceof ZodError)
      return res.status(400).json({
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
    res.status(500).json({
      error:
        "No se pudo confirmar la operación. Actualiza y vuelve a intentarlo.",
    });
  });
  return app;
}
module.exports = { createApp };
