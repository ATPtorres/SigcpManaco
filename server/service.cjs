const crypto = require("node:crypto");
function fail(message, status = 409) {
  throw Object.assign(new Error(message), { status });
}
async function rows(c, sql, args = []) {
  return (await c.execute(sql, args))[0];
}
async function one(c, sql, args = []) {
  const r = await rows(c, sql, args);
  if (!r.length) fail("Registro no encontrado.", 404);
  return r[0];
}
async function insert(c, table, data) {
  const keys = Object.keys(data);
  const [r] = await c.execute(
    `INSERT INTO ${table} (${keys.map((k) => "`" + k + "`").join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
    Object.values(data),
  );
  return r.insertId;
}
async function update(c, table, column, id, data) {
  const keys = Object.keys(data);
  await c.execute(
    `UPDATE ${table} SET ${keys.map((k) => "`" + k + "`=?").join(",")} WHERE ${column}=?`,
    [...Object.values(data), id],
  );
}
const code = (prefix) => prefix + "-" + crypto.randomUUID().slice(0, 18);
const round = (n) => Math.round((n + Number.EPSILON) * 10000) / 10000;
async function history(c, id, text, actor) {
  await insert(c, "HISTORIAL_ORDEN", {
    orden_id: id,
    descripcion: text,
    actor,
  });
}
async function materialLock(c, ids) {
  for (const id of [...new Set(ids)].sort((a, b) => a - b))
    await one(
      c,
      "SELECT material_id FROM MATERIAL WHERE material_id=? FOR UPDATE",
      [id],
    );
}
async function balance(c, id) {
  return one(
    c,
    `SELECT COALESCE((SELECT SUM(CASE WHEN tipo_movimiento='Entrada' THEN cantidad ELSE -cantidad END) FROM MOVIMIENTO_MATERIAL WHERE existencia_id=?),0) saldo,COALESCE((SELECT SUM(cantidad_pendiente) FROM RESERVA_MATERIAL WHERE existencia_id=? AND estado='Activa'),0) reservado`,
    [id, id],
  );
}
async function existence(c, materialId, lot, location) {
  await one(c, "SELECT ubicacion_id FROM UBICACION WHERE ubicacion_id=?", [
    location,
  ]);
  await c.execute(
    "INSERT INTO LOTE_MATERIAL(material_id,codigo_lote,fecha_recepcion) VALUES(?,?,UTC_DATE()) ON DUPLICATE KEY UPDATE lote_id=LAST_INSERT_ID(lote_id)",
    [materialId, lot],
  );
  const l = await one(
    c,
    "SELECT lote_id FROM LOTE_MATERIAL WHERE material_id=? AND codigo_lote=?",
    [materialId, lot],
  );
  await c.execute(
    "INSERT INTO EXISTENCIA_MATERIAL(lote_id,ubicacion_id) VALUES(?,?) ON DUPLICATE KEY UPDATE existencia_id=LAST_INSERT_ID(existencia_id)",
    [l.lote_id, location],
  );
  return (
    await one(
      c,
      "SELECT existencia_id FROM EXISTENCIA_MATERIAL WHERE lote_id=? AND ubicacion_id=?",
      [l.lote_id, location],
    )
  ).existencia_id;
}
async function saveMaterial(c, id, d) {
  const { stock_inicial, codigo_lote, ubicacion_id, ...fields } = d;
  fields.costo_confirmado = true;
  if (id) {
    await materialLock(c, [id]);
    const current = await one(c, "SELECT * FROM MATERIAL WHERE material_id=?", [
      id,
    ]);
    if (current.unidad_id !== fields.unidad_id) {
      const used = await one(
        c,
        "SELECT (SELECT COUNT(*) FROM RECETA_MATERIAL WHERE material_id=?)+(SELECT COUNT(*) FROM LOTE_MATERIAL WHERE material_id=?) count",
        [id, id],
      );
      if (used.count)
        fail("No se puede cambiar la unidad de un material utilizado.");
    }
    if (stock_inicial) fail("Utiliza movimientos para modificar existencias.");
    await update(c, "MATERIAL", "material_id", id, fields);
  } else {
    id = await insert(c, "MATERIAL", fields);
    if (stock_inicial) {
      if (!codigo_lote || !ubicacion_id)
        fail("El saldo inicial requiere lote y ubicación.", 400);
      const e = await existence(c, id, codigo_lote, ubicacion_id);
      await insert(c, "MOVIMIENTO_MATERIAL", {
        existencia_id: e,
        tipo_movimiento: "Entrada",
        cantidad: stock_inicial,
        costo_unitario_aplicado: fields.costo_referencia,
        motivo: "Saldo inicial",
      });
    }
  }
  return id;
}
async function saveProduct(c, id, d) {
  const { etapas, ...fields } = d;
  const sequences = etapas.map((e) => e.secuencia);
  if (new Set(sequences).size !== sequences.length)
    fail("La secuencia de cada etapa debe ser única.", 400);
  if (!etapas.some((e) => e.materiales.length))
    fail("La ficha requiere al menos un material.", 400);
  for (const e of etapas) {
    if (
      new Set(e.materiales.map((m) => m.material_id)).size !==
      e.materiales.length
    )
      fail("Material repetido en una etapa.", 400);
    for (const m of e.materiales) {
      const material = await one(
        c,
        "SELECT activo FROM MATERIAL WHERE material_id=?",
        [m.material_id],
      );
      if (!material.activo) fail("La receta contiene materiales inactivos.");
    }
  }
  if (id) {
    const current = await one(
      c,
      "SELECT * FROM PRODUCTO_CALZADO WHERE producto_id=? FOR UPDATE",
      [id],
    );
    const used = await one(
      c,
      "SELECT COUNT(*) n FROM ORDEN_FABRICACION o JOIN FICHA_FABRICACION f USING(ficha_id) WHERE f.producto_id=?",
      [id],
    );
    if (
      used.n &&
      ["sku", "modelo_id", "talla_id", "color_id"].some(
        (k) => current[k] !== fields[k],
      )
    )
      fail(
        "El producto tiene órdenes. Conserva su identidad y crea otra variante para cambiar modelo, talla, color o SKU.",
      );
    await update(c, "PRODUCTO_CALZADO", "producto_id", id, fields);
  } else id = await insert(c, "PRODUCTO_CALZADO", fields);
  const last = await one(
    c,
    "SELECT COALESCE(MAX(version),0) version FROM FICHA_FABRICACION WHERE producto_id=?",
    [id],
  );
  await c.execute(
    "UPDATE FICHA_FABRICACION SET estado='Archivada' WHERE producto_id=? AND estado='Vigente'",
    [id],
  );
  const ficha = await insert(c, "FICHA_FABRICACION", {
    producto_id: id,
    version: last.version + 1,
    estado: "Vigente",
  });
  for (const e of etapas.sort((a, b) => a.secuencia - b.secuencia)) {
    const { materiales, ...step } = e;
    const etapa = await insert(c, "FICHA_ETAPA", { ficha_id: ficha, ...step });
    for (const m of materiales)
      await insert(c, "RECETA_MATERIAL", { ficha_etapa_id: etapa, ...m });
  }
  return id;
}
async function createOrder(c, d, actor) {
  await one(
    c,
    "SELECT producto_id FROM PRODUCTO_CALZADO WHERE producto_id=? AND activo=1 FOR UPDATE",
    [d.producto_id],
  );
  await one(
    c,
    "SELECT trabajador_id FROM TRABAJADOR_ZAPATERO WHERE trabajador_id=? AND estado='Activo'",
    [d.trabajador_id],
  );
  const ficha = await one(
    c,
    "SELECT ficha_id FROM FICHA_FABRICACION WHERE producto_id=? AND estado='Vigente' ORDER BY version DESC LIMIT 1",
    [d.producto_id],
  );
  const id = await insert(c, "ORDEN_FABRICACION", {
    numero_orden: code("OF"),
    ficha_id: ficha.ficha_id,
    responsable_id: d.trabajador_id,
    cantidad_planificada: d.cantidad_planificada,
    inicio_programado: d.inicio_programado,
    fin_programado: d.fin_programado,
    prioridad: d.prioridad,
  });
  const steps = await rows(
    c,
    "SELECT * FROM FICHA_ETAPA WHERE ficha_id=? ORDER BY secuencia",
    [ficha.ficha_id],
  );
  for (const s of steps) {
    await insert(c, "DETALLE_ORDEN_ETAPA", {
      orden_id: id,
      ficha_etapa_id: s.ficha_etapa_id,
      ficha_id: ficha.ficha_id,
    });
    const recipe = await rows(
      c,
      "SELECT * FROM RECETA_MATERIAL WHERE ficha_etapa_id=?",
      [s.ficha_etapa_id],
    );
    for (const r of recipe) {
      if (
        r.cantidad_neta_por_par *
          (1 + r.porcentaje_merma / 100) *
          d.cantidad_planificada >
        999999999
      )
        fail("El requerimiento supera la capacidad de cantidad admitida.", 400);
      await insert(c, "REQUERIMIENTO_MATERIAL", {
        orden_id: id,
        ficha_etapa_id: s.ficha_etapa_id,
        material_id: r.material_id,
        cantidad_neta_por_par: r.cantidad_neta_por_par,
        porcentaje_merma: r.porcentaje_merma,
      });
    }
  }
  await history(c, id, "Orden creada con ficha versión congelada", actor);
  return id;
}
async function lockOrder(c, id) {
  return one(c, "SELECT * FROM ORDEN_FABRICACION WHERE orden_id=? FOR UPDATE", [
    id,
  ]);
}
async function stageOrder(c, id) {
  const s = await one(
    c,
    "SELECT * FROM DETALLE_ORDEN_ETAPA WHERE detalle_etapa_id=?",
    [id],
  );
  const order = await lockOrder(c, s.orden_id);
  return {
    stage: await one(
      c,
      "SELECT d.*,f.secuencia,f.etapa_id,f.ficha_id FROM DETALLE_ORDEN_ETAPA d JOIN FICHA_ETAPA f USING(ficha_etapa_id) WHERE detalle_etapa_id=?",
      [id],
    ),
    order,
  };
}
async function startStageLocked(c, stage, order, actor) {
  if (stage.estado !== "Pendiente") fail("La etapa ya fue iniciada.");
  if (stage.ficha_id !== order.ficha_id)
    fail("La etapa no pertenece a la ficha de esta orden.");
  const previous = await rows(
    c,
    "SELECT d.detalle_etapa_id FROM DETALLE_ORDEN_ETAPA d JOIN FICHA_ETAPA f USING(ficha_etapa_id) WHERE d.orden_id=? AND f.secuencia<? AND d.estado<>'Terminado'",
    [order.orden_id, stage.secuencia],
  );
  if (previous.length) fail("Termina las etapas anteriores.");
  const requirements = await rows(
    c,
    "SELECT * FROM REQUERIMIENTO_MATERIAL WHERE orden_id=? AND ficha_etapa_id=? ORDER BY material_id",
    [order.orden_id, stage.ficha_etapa_id],
  );
  await materialLock(
    c,
    requirements.map((r) => r.material_id),
  );
  for (const r of requirements) {
    let remaining = round(
      r.cantidad_neta_por_par *
        (1 + r.porcentaje_merma / 100) *
        order.cantidad_planificada,
    );
    const lots = await rows(
      c,
      `SELECT e.existencia_id FROM EXISTENCIA_MATERIAL e JOIN LOTE_MATERIAL l USING(lote_id) WHERE l.material_id=? ORDER BY EXISTS(SELECT 1 FROM RESERVA_MATERIAL r WHERE r.existencia_id=e.existencia_id AND r.detalle_etapa_id=? AND r.estado='Activa') DESC,l.fecha_recepcion,e.existencia_id`,
      [r.material_id, stage.detalle_etapa_id],
    );
    const material = await one(
      c,
      "SELECT * FROM MATERIAL WHERE material_id=?",
      [r.material_id],
    );
    if (!material.activo) fail("Un material de la ficha está inactivo.");
    for (const lot of lots) {
      const b = await balance(c, lot.existencia_id);
      const own = await rows(
        c,
        "SELECT * FROM RESERVA_MATERIAL WHERE existencia_id=? AND detalle_etapa_id=? AND estado='Activa'",
        [lot.existencia_id, stage.detalle_etapa_id],
      );
      const reserved = own[0]?.cantidad_pendiente || 0;
      const take = round(
        Math.min(remaining, Math.max(0, b.saldo - b.reservado + reserved)),
      );
      if (take <= 0) continue;
      const costs = await one(
        c,
        "SELECT COALESCE(SUM(cantidad*costo_unitario_aplicado)/NULLIF(SUM(cantidad),0),?) costo,COALESCE(MIN(costo_confirmado),0) confirmado FROM MOVIMIENTO_MATERIAL WHERE existencia_id=? AND tipo_movimiento='Entrada'",
        [material.costo_referencia, lot.existencia_id],
      );
      await insert(c, "MOVIMIENTO_MATERIAL", {
        existencia_id: lot.existencia_id,
        detalle_etapa_id: stage.detalle_etapa_id,
        tipo_movimiento: "Consumo",
        cantidad: take,
        costo_unitario_aplicado: costs.costo,
        costo_confirmado: !!costs.confirmado,
        motivo: `Consumo de ${order.numero_orden}`,
      });
      remaining = round(remaining - take);
    }
    if (remaining > 0)
      fail(
        `Material insuficiente: ${material.nombre}. Se revirtió todo el consumo de la etapa.`,
      );
  }
  await c.execute(
    "UPDATE RESERVA_MATERIAL SET estado='Consumida',cantidad_pendiente=0 WHERE detalle_etapa_id=? AND estado='Activa'",
    [stage.detalle_etapa_id],
  );
  await c.execute(
    "UPDATE DETALLE_ORDEN_ETAPA SET estado='En producción',inicio_real=UTC_TIMESTAMP() WHERE detalle_etapa_id=?",
    [stage.detalle_etapa_id],
  );
  await history(
    c,
    order.orden_id,
    `Etapa ${stage.secuencia} iniciada; materiales consumidos`,
    actor,
  );
}
async function startStage(c, id, actor) {
  const { stage, order } = await stageOrder(c, id);
  if (order.estado !== "En producción")
    fail("La orden debe estar en producción.");
  await startStageLocked(c, stage, order, actor);
}
async function finishStage(c, id, d, actor) {
  const { stage, order } = await stageOrder(c, id);
  if (order.estado !== "En producción" || stage.estado !== "En producción")
    fail("La etapa debe estar en producción.");
  if (d.cantidad_aceptada + d.cantidad_rechazada !== order.cantidad_planificada)
    fail("Aceptadas y rechazadas deben sumar la cantidad planificada.", 400);
  const issues = await one(
    c,
    "SELECT COUNT(*) n FROM INCIDENCIA_PRODUCCION WHERE detalle_etapa_id=? AND estado<>'Resuelta'",
    [id],
  );
  if (issues.n) fail("Resuelve las incidencias de la etapa.");
  await c.execute(
    "UPDATE DETALLE_ORDEN_ETAPA SET cantidad_aceptada=?,cantidad_rechazada=?,conteo_confirmado=1,estado='Terminado',fin_real=UTC_TIMESTAMP() WHERE detalle_etapa_id=?",
    [d.cantidad_aceptada, d.cantidad_rechazada, id],
  );
  await history(
    c,
    order.orden_id,
    `Etapa ${stage.secuencia} terminada: ${d.cantidad_aceptada} aceptados, ${d.cantidad_rechazada} rechazados`,
    actor,
  );
}
async function advance(c, id, d, actor) {
  const order = await lockOrder(c, id);
  if (order.estado !== d.estado_esperado)
    fail("La orden cambió en otra sesión. Actualiza los datos.");
  const next = {
    Pendiente: "En producción",
    "En producción": "Control de calidad",
    "Control de calidad": "Terminado",
    Terminado: "Despachado",
  }[order.estado];
  if (!next) fail("La orden ya fue despachada.");
  if (order.estado === "Pendiente") {
    const first = await one(
      c,
      "SELECT d.*,f.secuencia,f.etapa_id,f.ficha_id FROM DETALLE_ORDEN_ETAPA d JOIN FICHA_ETAPA f USING(ficha_etapa_id) WHERE orden_id=? ORDER BY secuencia LIMIT 1",
      [id],
    );
    await startStageLocked(c, first, order, actor);
    await c.execute(
      "UPDATE ORDEN_FABRICACION SET inicio_real=UTC_TIMESTAMP() WHERE orden_id=?",
      [id],
    );
  }
  if (order.estado === "En producción") {
    const pending = await one(
      c,
      "SELECT COUNT(*) n FROM DETALLE_ORDEN_ETAPA WHERE orden_id=? AND estado<>'Terminado'",
      [id],
    );
    if (pending.n) fail("Completa todas las etapas antes de enviar a calidad.");
  }
  if (order.estado === "Control de calidad") {
    const issues = await one(
      c,
      "SELECT COUNT(*) n FROM INCIDENCIA_PRODUCCION i JOIN DETALLE_ORDEN_ETAPA d USING(detalle_etapa_id) WHERE d.orden_id=? AND i.estado<>'Resuelta'",
      [id],
    );
    if (issues.n) fail("Resuelve las incidencias antes de terminar.");
    if (!d.evidencia) fail("Registra la evidencia de calidad.", 400);
    const last = await one(
      c,
      "SELECT d.* FROM DETALLE_ORDEN_ETAPA d JOIN FICHA_ETAPA f USING(ficha_etapa_id) WHERE orden_id=? ORDER BY f.secuencia DESC LIMIT 1",
      [id],
    );
    if (!last.conteo_confirmado) {
      if (
        d.cantidad_aceptada === undefined ||
        d.cantidad_rechazada === undefined ||
        d.cantidad_aceptada + d.cantidad_rechazada !==
          order.cantidad_planificada
      )
        fail(
          "Registra los pares aceptados y rechazados observados en calidad; deben sumar el plan.",
          400,
        );
      await c.execute(
        "UPDATE DETALLE_ORDEN_ETAPA SET cantidad_aceptada=?,cantidad_rechazada=?,conteo_confirmado=1 WHERE detalle_etapa_id=?",
        [d.cantidad_aceptada, d.cantidad_rechazada, last.detalle_etapa_id],
      );
      await history(
        c,
        id,
        "Conteo de calidad registrado después de migración: " +
          d.cantidad_aceptada +
          " aceptados, " +
          d.cantidad_rechazada +
          " rechazados",
        actor,
      );
    }

    await c.execute(
      "UPDATE ORDEN_FABRICACION SET evidencia_calidad=?,fin_real=UTC_TIMESTAMP() WHERE orden_id=?",
      [d.evidencia, id],
    );
  }
  await c.execute("UPDATE ORDEN_FABRICACION SET estado=? WHERE orden_id=?", [
    next,
    id,
  ]);
  await history(c, id, "Estado actualizado: " + next, actor);
}
async function movement(c, d) {
  await materialLock(c, [d.material_id]);
  const material = await one(
    c,
    "SELECT activo FROM MATERIAL WHERE material_id=?",
    [d.material_id],
  );
  if (!material.activo) fail("Material inactivo.");
  const e = await existence(c, d.material_id, d.codigo_lote, d.ubicacion_id);
  if (d.tipo_movimiento === "Salida") {
    const b = await balance(c, e);
    if (round(b.saldo - b.reservado) < d.cantidad)
      fail("La salida supera el saldo disponible descontando reservas.");
  }
  const { material_id, codigo_lote, ubicacion_id, ...fields } = d;
  return insert(c, "MOVIMIENTO_MATERIAL", { existencia_id: e, ...fields });
}
async function reserve(c, d) {
  const { stage, order } = await stageOrder(c, d.detalle_etapa_id);
  if (
    stage.estado !== "Pendiente" ||
    !["Pendiente", "En producción"].includes(order.estado)
  )
    fail("Solo se reservan materiales para etapas pendientes.");
  const e = await one(
    c,
    "SELECT l.material_id FROM EXISTENCIA_MATERIAL e JOIN LOTE_MATERIAL l USING(lote_id) WHERE existencia_id=?",
    [d.existencia_id],
  );
  await materialLock(c, [e.material_id]);
  const req = await one(
    c,
    "SELECT * FROM REQUERIMIENTO_MATERIAL WHERE orden_id=? AND ficha_etapa_id=? AND material_id=?",
    [order.orden_id, stage.ficha_etapa_id, e.material_id],
  );
  const total = round(
    req.cantidad_neta_por_par *
      (1 + req.porcentaje_merma / 100) *
      order.cantidad_planificada,
  );
  const reserved = await one(
    c,
    "SELECT COALESCE(SUM(r.cantidad_pendiente),0) n FROM RESERVA_MATERIAL r JOIN EXISTENCIA_MATERIAL e USING(existencia_id) JOIN LOTE_MATERIAL l USING(lote_id) WHERE r.detalle_etapa_id=? AND l.material_id=? AND r.estado='Activa'",
    [d.detalle_etapa_id, e.material_id],
  );
  if (round(reserved.n + d.cantidad_pendiente) > total)
    fail("La reserva excede el requerimiento.");
  const b = await balance(c, d.existencia_id);
  if (round(b.saldo - b.reservado) < d.cantidad_pendiente)
    fail("Saldo disponible insuficiente.");
  await c.execute(
    "INSERT INTO RESERVA_MATERIAL(detalle_etapa_id,existencia_id,cantidad_pendiente,estado) VALUES(?,?,?,'Activa') ON DUPLICATE KEY UPDATE cantidad_pendiente=IF(estado='Activa',cantidad_pendiente+VALUES(cantidad_pendiente),VALUES(cantidad_pendiente)),estado='Activa'",
    [d.detalle_etapa_id, d.existencia_id, d.cantidad_pendiente],
  );
}
async function release(c, id) {
  const r = await one(c, "SELECT * FROM RESERVA_MATERIAL WHERE reserva_id=?", [
    id,
  ]);
  await stageOrder(c, r.detalle_etapa_id);
  const e = await one(
    c,
    "SELECT l.material_id FROM EXISTENCIA_MATERIAL e JOIN LOTE_MATERIAL l USING(lote_id) WHERE existencia_id=?",
    [r.existencia_id],
  );
  await materialLock(c, [e.material_id]);
  await c.execute(
    "UPDATE RESERVA_MATERIAL SET cantidad_pendiente=0,estado='Liberada' WHERE reserva_id=? AND estado='Activa'",
    [id],
  );
}
async function incident(c, id, d) {
  const { order } = await stageOrder(c, d.detalle_etapa_id);
  if (["Terminado", "Despachado"].includes(order.estado))
    fail("La orden está cerrada.");
  await one(
    c,
    "SELECT trabajador_id FROM TRABAJADOR_ZAPATERO WHERE trabajador_id=? AND estado='Activo'",
    [d.responsable_id],
  );
  if (id) {
    const prev = await one(
      c,
      "SELECT detalle_etapa_id FROM INCIDENCIA_PRODUCCION WHERE incidencia_id=?",
      [id],
    );
    if (prev.detalle_etapa_id !== d.detalle_etapa_id)
      fail("No se puede trasladar una incidencia de etapa.");
  }
  const fields = {
    ...d,
    fecha_cierre: d.estado === "Resuelta" ? new Date() : null,
  };
  if (id) await update(c, "INCIDENCIA_PRODUCCION", "incidencia_id", id, fields);
  else id = await insert(c, "INCIDENCIA_PRODUCCION", fields);
  return id;
}
async function worker(c, id, d) {
  const { etapas, ...fields } = d;
  fields.tarifa_confirmada = true;
  if (id) {
    await one(
      c,
      "SELECT trabajador_id FROM TRABAJADOR_ZAPATERO WHERE trabajador_id=? FOR UPDATE",
      [id],
    );
    await update(c, "TRABAJADOR_ZAPATERO", "trabajador_id", id, fields);
    await c.execute("DELETE FROM TRABAJADOR_ETAPA WHERE trabajador_id=?", [id]);
  } else id = await insert(c, "TRABAJADOR_ZAPATERO", fields);
  for (const e of new Set(etapas))
    await insert(c, "TRABAJADOR_ETAPA", { trabajador_id: id, etapa_id: e });
  return id;
}
async function labor(c, d) {
  const { stage, order } = await stageOrder(c, d.detalle_etapa_id);
  if (stage.estado !== "En producción" || order.estado !== "En producción")
    fail("La etapa debe estar en producción.");
  const w = await one(
    c,
    "SELECT * FROM TRABAJADOR_ZAPATERO WHERE trabajador_id=? AND estado='Activo' FOR UPDATE",
    [d.trabajador_id],
  );
  if (!w.tarifa_confirmada)
    fail("Confirma primero la tarifa del trabajador migrado.");
  await one(
    c,
    "SELECT * FROM TRABAJADOR_ETAPA WHERE trabajador_id=? AND etapa_id=?",
    [d.trabajador_id, stage.etapa_id],
  );
  const daily = await one(
    c,
    "SELECT COALESCE(SUM(horas_trabajadas),0) horas FROM REGISTRO_MANO_OBRA WHERE trabajador_id=? AND fecha=?",
    [d.trabajador_id, d.fecha],
  );
  if (daily.horas + d.horas_trabajadas > 24)
    fail("El total diario del trabajador no puede superar 24 horas.");
  return insert(c, "REGISTRO_MANO_OBRA", {
    ...d,
    tarifa_hora_aplicada: w.tarifa_hora_actual,
  });
}
async function budget(c, d) {
  await lockOrder(c, d.orden_id);
  const previous = await one(
    c,
    "SELECT COALESCE(MAX(version),0) version FROM PRESUPUESTO WHERE orden_id=?",
    [d.orden_id],
  );
  const { detalles, ...fields } = d;
  const id = await insert(c, "PRESUPUESTO", {
    ...fields,
    version: previous.version + 1,
  });
  for (const [i, line] of detalles.entries())
    await insert(c, "DETALLE_PRESUPUESTO", {
      presupuesto_id: id,
      numero_linea: i + 1,
      ...line,
    });
  return id;
}
module.exports = {
  fail,
  rows,
  one,
  insert,
  update,
  saveMaterial,
  saveProduct,
  createOrder,
  startStage,
  finishStage,
  advance,
  movement,
  reserve,
  release,
  incident,
  worker,
  labor,
  budget,
};
