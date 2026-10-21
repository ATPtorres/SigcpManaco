const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createPool } = require("../server/db.cjs");
const { migrate } = require("../scripts/migrate.cjs");
const { seed, demo } = require("../scripts/seed.cjs");
const { createApp } = require("../server/app.cjs");
const testName = process.env.DB_TEST_NAME || "sigcp_manaco_test";
if (
  !/^[a-zA-Z0-9_]+_test$/.test(testName) ||
  testName === (process.env.DB_NAME || "sigcp_manaco")
)
  throw Error(
    "Las pruebas requieren una base separada cuyo nombre termine en _test.",
  );
const pool = createPool(testName);
let server, origin, cookie, initial;
async function request(path, body, method, auth = true) {
  const response = await fetch(origin + path, {
    method: method || (body ? "POST" : "GET"),
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(auth ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data = null;
  if (response.status !== 204) data = await response.json();
  return { status: response.status, data, response };
}
async function ok(path, body, method) {
  const r = await request(path, body, method);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
}
async function snapshot() {
  return ok("/api/state");
}
async function order(quantity = 10, product = initial.products[0].producto_id) {
  const d = await ok("/api/orders", {
    producto_id: product,
    trabajador_id: initial.workers[0].trabajador_id,
    cantidad_planificada: quantity,
    inicio_programado: "2026-10-21",
    fin_programado: "2026-10-28",
    prioridad: "Normal",
  });
  return d.id;
}
async function start(id) {
  return ok(`/api/orders/${id}/advance`, { estado_esperado: "Pendiente" });
}
before(async () => {
  const tables = [
    ...fs
      .readFileSync(
        require("node:path").join(__dirname, "../database/001_schema.sql"),
        "utf8",
      )
      .matchAll(/CREATE TABLE IF NOT EXISTS ([A-Z_]+)/g),
  ].map((x) => x[1]);
  for (const table of tables.reverse())
    await pool.query(`DROP TABLE IF EXISTS ${table}`);
  await migrate(pool);
  await migrate(pool);
  await seed(pool);
  await demo(pool);
  server = createApp(pool).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  origin = "http://127.0.0.1:" + server.address().port;
  const login = await request(
    "/api/login",
    {
      username: process.env.APP_USER || "admin",
      password: process.env.APP_PASSWORD,
    },
    "POST",
    false,
  );
  assert.equal(login.status, 200);
  cookie = login.response.headers.get("set-cookie").split(";")[0];
  initial = await snapshot();
});
after(async () => {
  if (server) await new Promise((r) => server.close(r));
  await pool.end();
});

test("MySQL schema, session and backup protect data and credentials", async () => {
  assert.equal((await request("/api/state", null, "GET", false)).status, 401);
  assert.equal((await request("/api/orders", {}, "POST", false)).status, 401);
  const r = await request("/api/orders", {}, "POST");
  assert.equal(r.status, 400);
  const response = await fetch(origin + "/api/orders", {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: "https://untrusted.example",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(response.status, 403);
  const secret = await fetch(origin + "/.env");
  assert.equal(secret.status, 404);
  const data = await ok("/api/backup");
  assert.equal(Object.keys(data.tables).length, 28);
  assert.equal(data.tables.USUARIO, undefined);
  assert.equal(data.tables.SESION, undefined);
  const [tables] = await pool.query("SHOW TABLES");
  assert.equal(tables.length, 30);
});
test("Invalid references, dates, quantities and duplicate SKUs fail without partial writes", async () => {
  const before = (await snapshot()).orders.length;
  for (const extra of [
    { cantidad_planificada: -1 },
    { producto_id: 999999 },
    { fin_programado: "2026-10-20" },
    { inicio_programado: "2026-02-30" },
  ]) {
    const r = await request("/api/orders", {
      producto_id: initial.products[0].producto_id,
      trabajador_id: initial.workers[0].trabajador_id,
      cantidad_planificada: 10,
      inicio_programado: "2026-10-21",
      fin_programado: "2026-10-28",
      prioridad: "Normal",
      ...extra,
    });
    assert.ok(r.status >= 400 && r.status < 500);
  }
  assert.equal((await snapshot()).orders.length, before);
  const p = initial.products[0];
  const d = {
    sku: p.sku,
    modelo_id: p.modelo_id,
    talla_id: p.talla_id,
    color_id: p.color_id,
    activo: true,
    etapas: p.ficha.etapas.map((e) => ({
      etapa_id: e.etapa_id,
      secuencia: e.secuencia,
      minutos_estimados_por_par: 1,
      costo_mano_obra_estimado_por_par: 1,
      materiales: e.materiales.map((m) => ({
        material_id: m.material_id,
        cantidad_neta_por_par: m.cantidad_neta_por_par,
        porcentaje_merma: m.porcentaje_merma,
      })),
    })),
  };
  assert.equal((await request("/api/products", d)).status, 409);
});
test("Versioned recipes keep existing orders and requirements unchanged", async () => {
  const id = await order();
  const old = (await snapshot()).orders.find((o) => o.orden_id === id);
  const p = (await snapshot()).products[0];
  await ok(
    "/api/products/" + p.producto_id,
    {
      sku: p.sku,
      modelo_id: p.modelo_id,
      talla_id: p.talla_id,
      color_id: p.color_id,
      activo: true,
      etapas: p.ficha.etapas.map((e) => ({
        etapa_id: e.etapa_id,
        secuencia: e.secuencia,
        minutos_estimados_por_par: 3,
        costo_mano_obra_estimado_por_par: 2,
        materiales: e.materiales.map((m) => ({
          material_id: m.material_id,
          cantidad_neta_por_par: m.cantidad_neta_por_par * 2,
          porcentaje_merma: m.porcentaje_merma,
        })),
      })),
    },
    "PUT",
  );
  const state = await snapshot();
  const preserved = state.orders.find((o) => o.orden_id === id);
  assert.equal(preserved.ficha_id, old.ficha_id);
  assert.deepEqual(preserved.requirements, old.requirements);
  assert.equal(state.products[0].ficha.version, p.ficha.version + 1);
  const next = await order();
  assert.notEqual(
    (await snapshot()).orders.find((o) => o.orden_id === next).ficha_id,
    old.ficha_id,
  );
  // Database rejects an order stage belonging to a different ficha.
  await assert.rejects(
    pool.execute(
      "INSERT INTO DETALLE_ORDEN_ETAPA(orden_id,ficha_etapa_id,ficha_id) VALUES(?,?,?)",
      [id, state.products[0].ficha.etapas[0].ficha_etapa_id, old.ficha_id],
    ),
    (e) => e.code === "ER_NO_REFERENCED_ROW_2",
  );
});
test("Insufficient stock rolls back all stage consumption and leaves the order pending", async () => {
  const id = await order(1000000);
  const before = await snapshot();
  const r = await request(`/api/orders/${id}/advance`, {
    estado_esperado: "Pendiente",
  });
  assert.equal(r.status, 409);
  const after = await snapshot();
  assert.deepEqual(
    after.materials.map((m) => m.stock),
    before.materials.map((m) => m.stock),
  );
  assert.equal(after.movements.length, before.movements.length);
  assert.equal(after.orders.find((o) => o.orden_id === id).state, 0);
});
test("Concurrent starts cannot consume the same order twice", async () => {
  const id = await order();
  const before = (await snapshot()).movements.length;
  const results = await Promise.all([
    request(`/api/orders/${id}/advance`, { estado_esperado: "Pendiente" }),
    request(`/api/orders/${id}/advance`, { estado_esperado: "Pendiente" }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const state = await snapshot();
  assert.equal(state.movements.length, before + 1);
  assert.equal(state.orders.find((o) => o.orden_id === id).state, 1);
});
test("Concurrent orders cannot spend the same remaining stock", async () => {
  const s = await snapshot();
  const leather = s.materials[0];
  const available = leather.stock;
  const product = s.products[0];
  const first = product.bom.find((b) => b.material === leather.id);
  const quantity = Math.floor((available / first.qty) * 0.75);
  const ids = await Promise.all([order(quantity), order(quantity)]);
  const results = await Promise.all(
    ids.map((id) =>
      request(`/api/orders/${id}/advance`, { estado_esperado: "Pendiente" }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.ok((await snapshot()).materials.every((m) => m.stock >= 0));
  // Replenish only this test's consumed material through the public API for subsequent cases.
  const after = await snapshot();
  const used =
    available - after.materials.find((m) => m.id === leather.id).stock;
  await ok("/api/movements", {
    material_id: leather.material_id,
    tipo_movimiento: "Entrada",
    cantidad: used,
    costo_unitario_aplicado: 35,
    codigo_lote: "TEST-REPOSICION",
    ubicacion_id: s.refs.locations[0].ubicacion_id,
    motivo: "Reposición de prueba",
  });
});
test("Reservations protect balances, require matching material and release cleanly", async () => {
  const id = await order(10);
  let state = await snapshot();
  const o = state.orders.find((o) => o.orden_id === id);
  const step = o.etapas[0];
  const lot = state.lots.find(
    (l) => l.material_id === state.materials[0].material_id && l.saldo > 5,
  );
  const req = {
    detalle_etapa_id: step.detalle_etapa_id,
    existencia_id: lot.existencia_id,
    cantidad_pendiente: 1,
  };
  await ok("/api/reservations", req);
  state = await snapshot();
  assert.ok(
    state.reservations.some(
      (r) => r.detalle_etapa_id === step.detalle_etapa_id,
    ),
  );
  const wrong = state.lots.find((l) => l.material_id !== lot.material_id);
  assert.equal(
    (
      await request("/api/reservations", {
        ...req,
        existencia_id: wrong.existencia_id,
      })
    ).status,
    404,
  );
  const excessive = await request("/api/movements", {
    material_id: lot.material_id,
    tipo_movimiento: "Salida",
    cantidad: lot.saldo,
    costo_unitario_aplicado: 35,
    codigo_lote: lot.codigo_lote,
    ubicacion_id: lot.ubicacion_id,
    motivo: "Intento sobre saldo reservado",
  });
  assert.equal(excessive.status, 409);
  const reserve = state.reservations.find(
    (r) => r.detalle_etapa_id === step.detalle_etapa_id,
  );
  await ok(`/api/reservations/${reserve.reserva_id}/release`, {});
  assert.equal(
    (await snapshot()).reservations.some(
      (r) => r.reserva_id === reserve.reserva_id,
    ),
    false,
  );
});
test("Stages are sequential and consume only their own material requirements", async () => {
  const id = await order();
  await start(id);
  let state = await snapshot();
  const o = state.orders.find((o) => o.orden_id === id);
  assert.equal(
    (
      await request(
        `/api/order-stages/${o.etapas[2].detalle_etapa_id}/start`,
        {},
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`/api/orders/${id}/advance`, {
        estado_esperado: "En producción",
      })
    ).status,
    409,
  );
  await ok(`/api/order-stages/${o.etapas[0].detalle_etapa_id}/finish`, {
    cantidad_aceptada: 10,
    cantidad_rechazada: 0,
  });
  await ok(`/api/order-stages/${o.etapas[1].detalle_etapa_id}/start`, {});
  const before = (await snapshot()).movements.length;
  await ok(`/api/order-stages/${o.etapas[1].detalle_etapa_id}/finish`, {
    cantidad_aceptada: 10,
    cantidad_rechazada: 0,
  });
  await ok(`/api/order-stages/${o.etapas[2].detalle_etapa_id}/start`, {});
  assert.equal((await snapshot()).movements.length, before + 1);
});
test("Incidents block stage completion; resolution requires evidence", async () => {
  const id = await order();
  await start(id);
  const o = (await snapshot()).orders.find((o) => o.orden_id === id);
  const stage = o.etapas[0];
  const data = {
    detalle_etapa_id: stage.detalle_etapa_id,
    tipo: "Calidad",
    descripcion: "Caso de prueba",
    responsable_id: initial.workers[0].trabajador_id,
    severidad: "Alta",
    estado: "Abierta",
    resolucion: "",
  };
  const inc = await ok("/api/incidents", data);
  assert.equal(
    (
      await request(`/api/order-stages/${stage.detalle_etapa_id}/finish`, {
        cantidad_aceptada: 10,
        cantidad_rechazada: 0,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(
        `/api/incidents/${inc.id}`,
        { ...data, estado: "Resuelta" },
        "PUT",
      )
    ).status,
    400,
  );
  await ok(
    `/api/incidents/${inc.id}`,
    { ...data, estado: "Resuelta", resolucion: "Causa corregida y verificada" },
    "PUT",
  );
  await ok(`/api/order-stages/${stage.detalle_etapa_id}/finish`, {
    cantidad_aceptada: 10,
    cantidad_rechazada: 0,
  });
});
test("Labor keeps the applied rate, checks skills and enforces daily hours", async () => {
  const id = await order();
  await start(id);
  const o = (await snapshot()).orders.find((o) => o.orden_id === id);
  const w = initial.workers[0];
  const data = {
    detalle_etapa_id: o.etapas[0].detalle_etapa_id,
    trabajador_id: w.trabajador_id,
    fecha: "2026-10-21",
    horas_trabajadas: 2,
  };
  const record = await ok("/api/labor", data);
  await ok(
    "/api/workers/" + w.trabajador_id,
    {
      codigo: w.codigo,
      nombre_completo: w.nombre_completo,
      tipo_contratacion: w.tipo_contratacion,
      tarifa_hora_actual: 99,
      estado: "Activo",
      etapas: w.etapas,
    },
    "PUT",
  );
  assert.equal(
    (await snapshot()).labor.find((l) => l.registro_id === record.id)
      .tarifa_hora_aplicada,
    w.tarifa_hora_actual,
  );
  assert.equal(
    (await request("/api/labor", { ...data, horas_trabajadas: 24 })).status,
    409,
  );
});
test("Budget versions and SQL totals include contingency", async () => {
  const id = await order();
  const d = {
    orden_id: id,
    nombre: "Presupuesto prueba",
    fecha_emision: "2026-10-21",
    vigente_desde: "2026-10-21",
    vigente_hasta: "2026-11-21",
    porcentaje_contingencia: 10,
    estado_aprobacion: "Aprobado",
    detalles: [
      {
        concepto: "Cuero",
        tipo_costo: "Material",
        unidad_id: initial.refs.units[0].unidad_id,
        cantidad: 2,
        costo_unitario_estimado: 50,
      },
    ],
  };
  await ok("/api/budgets", d);
  await ok("/api/budgets", d);
  const versions = (await snapshot()).budgets.filter((b) => b.orden_id === id);
  assert.deepEqual(
    versions.map((b) => b.version),
    [1, 2],
  );
  assert.equal(versions[0].total, 110);
});
test("Complete production, quality evidence, dispatch and database persistence", async () => {
  const id = await order();
  await start(id);
  const o = (await snapshot()).orders.find((o) => o.orden_id === id);
  for (const [index, e] of o.etapas.entries()) {
    if (index) await ok(`/api/order-stages/${e.detalle_etapa_id}/start`, {});
    await ok(`/api/order-stages/${e.detalle_etapa_id}/finish`, {
      cantidad_aceptada: 10,
      cantidad_rechazada: 0,
    });
  }
  await ok(`/api/orders/${id}/advance`, { estado_esperado: "En producción" });
  assert.equal(
    (
      await request(`/api/orders/${id}/advance`, {
        estado_esperado: "Control de calidad",
        evidencia: " ",
      })
    ).status,
    400,
  );
  await ok(`/api/orders/${id}/advance`, {
    estado_esperado: "Control de calidad",
    evidencia: "Lote revisado: 10 pares conformes.",
  });
  await ok(`/api/orders/${id}/advance`, { estado_esperado: "Terminado" });
  const [rows] = await pool.execute(
    "SELECT estado,evidencia_calidad,inicio_real,fin_real FROM ORDEN_FABRICACION WHERE orden_id=?",
    [id],
  );
  assert.equal(rows[0].estado, "Despachado");
  assert.ok(rows[0].inicio_real && rows[0].fin_real);
  assert.match(rows[0].evidencia_calidad, /conformes/);
  // A second connection reads committed data, independent of any browser storage.
  const second = createPool(testName);
  try {
    const [r] = await second.execute(
      "SELECT COUNT(*) n FROM HISTORIAL_ORDEN WHERE orden_id=?",
      [id],
    );
    assert.ok(r[0].n >= 10);
  } finally {
    await second.end();
  }
});
test("Pilot and audit are persisted with the authenticated actor; logout revokes the session", async () => {
  await ok(
    "/api/pilot/0",
    { checked: true, evidence: "Prueba de integración validada" },
    "PUT",
  );
  const s = await snapshot();
  assert.equal(s.pilot[0].checked, true);
  assert.equal(s.audit[0].actor, process.env.APP_USER || "admin");
  assert.equal((await request("/api/logout", {})).status, 204);
  assert.equal((await request("/api/state")).status, 401);
});
