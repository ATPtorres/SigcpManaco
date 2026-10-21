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
  tables.push("IMPORTACION_LEGACY", "BLOQUEO_MIGRACION", "SCHEMA_MIGRATION");
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
  assert.equal(Object.keys(data.tables).length, 29);
  assert.equal(data.tables.USUARIO, undefined);
  assert.equal(data.tables.SESION, undefined);
  const [tables] = await pool.query("SHOW TABLES");
  assert.equal(tables.length, 33);
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
const original = require("../database/legacy/original-demo-v1.json");
let migrated;
test("Legacy preview is read-only and invalid backups are rejected", async () => {
  const before = await snapshot();
  const p = await ok("/api/legacy/preview", original);
  assert.deepEqual(p.counts, {
    materials: 6,
    models: 4,
    variants: 26,
    orders: 8,
    incidents: 2,
    movements: 0,
    workers: 4,
  });
  assert.equal(p.canImport, true);
  assert.equal((await snapshot()).materials.length, before.materials.length);
  const invalid = structuredClone(original);
  invalid.orders[0].product = "PRD-999";
  assert.equal((await request("/api/legacy/preview", invalid)).status, 400);
  const dup = structuredClone(original);
  dup.materials.push(dup.materials[0]);
  assert.equal((await request("/api/legacy/preview", dup)).status, 400);
  assert.equal(
    (
      await request("/api/legacy/import", {
        data: original,
        expectedHash: "changed",
      })
    ).status,
    409,
  );
});
test("A late import conflict rolls back every inserted row", async () => {
  await ok(
    "/api/pilot/0",
    { checked: true, evidence: "Dato existente que debe conservarse" },
    "PUT",
  );
  const bad = structuredClone(original);
  bad.pilot["0"] = {
    checked: true,
    evidence: "No sobrescribir",
    at: "2026-10-20T12:00:00Z",
  };
  const p = await ok("/api/legacy/preview", bad);
  const before = await snapshot();
  assert.equal(
    (await request("/api/legacy/import", { data: bad, expectedHash: p.hash }))
      .status,
    409,
  );
  const after = await snapshot();
  assert.equal(after.materials.length, before.materials.length);
  assert.equal(after.workers.length, before.workers.length);
  assert.equal(after.orders.length, before.orders.length);
  assert.equal(after.imports.length, 0);
  assert.equal(after.pilot[0].evidence, before.pilot[0].evidence);
});
test("The original dataset migrates atomically without replaying consumption", async () => {
  const before = await snapshot(),
    preview = await ok("/api/legacy/preview", original);
  migrated = await ok("/api/legacy/import", {
    data: original,
    expectedHash: preview.hash,
  });
  const data = await snapshot();
  assert.equal(data.materials.length, before.materials.length + 6);
  assert.equal(data.products.length, before.products.length + 26);
  assert.equal(data.orders.length, before.orders.length + 8);
  assert.equal(data.incidents.length, before.incidents.length + 2);
  for (const m of original.materials) {
    const actual = data.materials.find(
      (x) => x.material_id === migrated.map.materials[m.id],
    );
    assert.equal(actual.codigo, m.id);
    assert.equal(actual.stock, m.stock);
    assert.equal(actual.min, m.min);
    assert.equal(actual.costo_confirmado, 0);
  }
  for (const o of original.orders) {
    const actual = data.orders.find(
      (x) => x.orden_id === migrated.map.orders[o.id],
    );
    assert.equal(actual.numero_orden, o.id);
    assert.equal(actual.state, o.state);
    assert.equal(actual.quantity, o.quantity);
    assert.equal(actual.owner, o.owner);
    assert.equal(actual.size, o.size);
    assert.equal(actual.closed, o.closed);
    assert.equal(actual.evidence, o.evidence);
    assert.equal(actual.inicio_real, null);
    assert.equal(actual.fin_real, null);
    assert.equal(actual.etapas.length, 1);
    assert.equal(actual.acceptedKnown, false);
    assert.ok(actual.history.some((h) => h.text.includes("[Legado]")));
  }
  assert.equal(
    data.movements.filter(
      (m) =>
        m.detalle_etapa_id &&
        Object.values(migrated.map.orders).includes(m.orden_id),
    ).length,
    0,
  );
  assert.deepEqual(
    data.orders
      .filter((o) => Object.values(migrated.map.orders).includes(o.orden_id))
      .reduce((s, o) => s + o.quantity, 0),
    1650,
  );
  const [raw] = await pool.execute(
    "SELECT datos_originales FROM IMPORTACION_LEGACY WHERE hash_origen=?",
    [preview.hash],
  );
  assert.deepEqual(raw[0].datos_originales, original);
});
test("Concurrent replay of the same backup is idempotent and changed copies conflict", async () => {
  const before = await snapshot();
  const results = await Promise.all([
    ok("/api/legacy/import", { data: original, expectedHash: migrated.hash }),
    ok("/api/legacy/import", { data: original, expectedHash: migrated.hash }),
  ]);
  assert.ok(results.every((r) => r.alreadyImported));
  assert.equal((await snapshot()).orders.length, before.orders.length);
  const changed = structuredClone(original);
  changed.materials[0].name = "Otro nombre";
  const p = await ok("/api/legacy/preview", changed);
  assert.equal(p.canImport, false);
  assert.equal(
    (
      await request("/api/legacy/import", {
        data: changed,
        expectedHash: p.hash,
      })
    ).status,
    409,
  );
});
test("Imported pending orders consume once; active and quality orders continue without reconsumption", async () => {
  const pending = migrated.map.orders["OP-1047"];
  await start(pending);
  let data = await snapshot();
  assert.equal(
    data.materials.find(
      (m) => m.material_id === migrated.map.materials["MAT-004"],
    ).stock,
    200,
  );
  assert.equal(
    data.materials.find(
      (m) => m.material_id === migrated.map.materials["MAT-006"],
    ).stock,
    480,
  );
  assert.equal(
    (
      await request(`/api/orders/${pending}/advance`, {
        estado_esperado: "Pendiente",
      })
    ).status,
    409,
  );
  const active = data.orders.find(
    (o) => o.orden_id === migrated.map.orders["OP-1044"],
  );
  const movements = data.movements.length;
  await ok(`/api/order-stages/${active.etapas[0].detalle_etapa_id}/finish`, {
    cantidad_aceptada: 150,
    cantidad_rechazada: 0,
  });
  await ok(`/api/orders/${active.orden_id}/advance`, {
    estado_esperado: "En producción",
  });
  await ok(`/api/orders/${active.orden_id}/advance`, {
    estado_esperado: "Control de calidad",
    evidencia: "Control realizado después de migración",
  });
  data = await snapshot();
  assert.equal(data.movements.length, movements);
  assert.equal(
    data.orders.find((o) => o.orden_id === active.orden_id).acceptedKnown,
    true,
  );
  assert.equal(
    data.orders.find((o) => o.orden_id === active.orden_id).inicio_real,
    null,
  );
  const worker = data.workers.find(
    (w) => w.trabajador_id === migrated.map.workers["Ana Mendoza"],
  );
  const o = data.orders.find((o) => o.orden_id === pending);
  assert.equal(
    (
      await request("/api/labor", {
        detalle_etapa_id: o.etapas[0].detalle_etapa_id,
        trabajador_id: worker.trabajador_id,
        fecha: "2026-10-21",
        horas_trabajadas: 1,
      })
    ).status,
    409,
  );
});

test("Imported quality orders record observed counts without fabricating prior dates or consumption", async () => {
  const id = migrated.map.orders["OP-1042"];
  const before = await snapshot();
  assert.equal(
    (
      await request("/api/orders/" + id + "/advance", {
        estado_esperado: "Control de calidad",
        evidencia: "Revisión actual",
      })
    ).status,
    400,
  );
  await ok("/api/orders/" + id + "/advance", {
    estado_esperado: "Control de calidad",
    evidencia: "Revisión actual: 175 pares conformes y 5 rechazados",
    cantidad_aceptada: 175,
    cantidad_rechazada: 5,
  });
  const after = await snapshot();
  const order = after.orders.find((o) => o.orden_id === id);
  assert.equal(order.acceptedPairs, 175);
  assert.equal(order.acceptedKnown, true);
  assert.equal(order.inicio_real, null);
  assert.equal(after.movements.length, before.movements.length);
});
test("Role permissions, account management and session revocation are enforced server-side", async () => {
  const password = require("node:crypto").randomBytes(24).toString("base64url");
  const op = await ok("/api/users", {
    nombre: "operador-prueba",
    rol: "Operador",
    activo: true,
    password,
  });
  const view = await ok("/api/users", {
    nombre: "consulta-prueba",
    rol: "Consulta",
    activo: true,
    password,
  });
  async function login(name) {
    const r = await request(
      "/api/login",
      { username: name, password },
      "POST",
      false,
    );
    assert.equal(r.status, 200);
    return r.response.headers.get("set-cookie").split(";")[0];
  }
  async function as(cookie, path, data) {
    const r = await fetch(origin + path, {
      method: data ? "POST" : "GET",
      headers: {
        Cookie: cookie,
        ...(data ? { "Content-Type": "application/json" } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    return { status: r.status, data: await r.json() };
  }
  const oc = await login("operador-prueba"),
    vc = await login("consulta-prueba");
  assert.equal((await as(vc, "/api/state")).status, 200);
  assert.equal((await as(vc, "/api/state")).data.users, undefined);
  for (const path of [
    "/api/products",
    "/api/users",
    "/api/budgets",
    "/api/legacy/preview",
  ])
    assert.equal((await as(oc, path, {})).status, 403);
  assert.equal((await as(vc, "/api/orders", {})).status, 403);
  assert.equal((await as(oc, "/api/backup")).status, 403);
  assert.equal(
    (
      await as(oc, "/api/orders", {
        producto_id: initial.products[0].producto_id,
        trabajador_id: initial.workers[0].trabajador_id,
        cantidad_planificada: 1,
        inicio_programado: "2026-10-21",
        fin_programado: "2026-10-28",
        prioridad: "Normal",
      })
    ).status,
    200,
  );
  const state = await snapshot();
  assert.ok(state.users.every((u) => !("password_hash" in u)));
  const admin = state.users.find(
    (u) => u.nombre === (process.env.APP_USER || "admin"),
  );
  assert.equal(
    (
      await request(
        "/api/users/" + admin.usuario_id,
        { nombre: admin.nombre, rol: "Consulta", activo: true },
        "PUT",
      )
    ).status,
    409,
  );
  await ok(
    "/api/users/" + view.id,
    { nombre: "consulta-prueba", rol: "Consulta", activo: false },
    "PUT",
  );
  assert.equal((await as(vc, "/api/state")).status, 401);
  await assert.rejects(
    pool.execute(
      "INSERT INTO USUARIO(nombre,password_hash,rol) VALUES('rol-invalido','unused','Desconocido')",
    ),
    (e) => e.code === "ER_CHECK_CONSTRAINT_VIOLATED",
  );
});
test("A complete fictional example is repeatable and leaves original materials untouched", async () => {
  const { sampleWorkflow } = require("../scripts/sample-workflow.cjs");
  const before = await snapshot();
  const imported = before.materials
    .filter((m) =>
      Object.values(migrated.map.materials).includes(m.material_id),
    )
    .map((m) => [m.material_id, m.stock]);
  const example = await sampleWorkflow(pool);
  assert.equal(example.alreadyCreated, false);
  assert.equal((await sampleWorkflow(pool)).alreadyCreated, true);
  const after = await snapshot();
  assert.equal(after.orders.length, before.orders.length + 2);
  assert.deepEqual(
    after.materials
      .filter((m) =>
        Object.values(migrated.map.materials).includes(m.material_id),
      )
      .map((m) => [m.material_id, m.stock]),
    imported,
  );
  const order = after.orders.find((o) => o.numero_orden === "EJEMPLO-COMPLETO");
  assert.equal(order.estado, "Despachado");
  assert.equal(order.acceptedPairs, 12);
  assert.equal(
    after.budgets.find((b) => b.orden_id === order.orden_id).total,
    95.59,
  );
  assert.equal(
    after.materials.find((m) => m.codigo === "EJ-V2-MAT").stock,
    96.28,
  );
});
test("Business backup restores to an empty database and rejects destructive replacement", async () => {
  const { backup, restore, businessTables } = require("../server/backup.cjs");
  const data = await backup(pool);
  await assert.rejects(restore(pool, data), /vacía/);
  const invalid = structuredClone(data);
  invalid.tables.USUARIO = [];
  await assert.rejects(restore(pool, invalid), /no permitidas/);
  for (const table of [...businessTables].reverse())
    await pool.query(`DELETE FROM ${table}`);
  const corrupt = structuredClone(data);
  corrupt.tables.MATERIAL[0].stock_minimo = -10;
  await assert.rejects(restore(pool, corrupt));
  const [[empty]] = await pool.query("SELECT COUNT(*) n FROM MATERIAL");
  assert.equal(empty.n, 0);
  await restore(pool, data);
  const after = await backup(pool);
  assert.deepEqual(after.tables, data.tables);
  assert.equal((await snapshot()).imports.length, 1);
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
