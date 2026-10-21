const { createPool, transaction } = require("../server/db.cjs");
const s = require("../server/service.cjs");
async function sampleWorkflow(pool) {
  return transaction(pool, async (c) => {
    await s.one(
      c,
      "SELECT bloqueo_id FROM BLOQUEO_MIGRACION WHERE bloqueo_id=1 FOR UPDATE",
    );
    const existing = await s.rows(
      c,
      "SELECT numero_orden FROM ORDEN_FABRICACION WHERE numero_orden IN ('EJEMPLO-COMPLETO','EJEMPLO-RESERVA')",
    );
    if (existing.length === 2) return { alreadyCreated: true };
    if (existing.length)
      s.fail(
        "Los ejemplos están incompletos. Revisa los datos sin sobrescribirlos.",
      );
    const loc = await s.insert(c, "UBICACION", {
      codigo: "EJ-V2-ALM",
      descripcion: "Ubicación ficticia del circuito de ejemplo",
    });
    const stage1 = await s.insert(c, "ETAPA_FABRICACION", {
      nombre: "Corte (ejemplo)",
      descripcion: "Datos ficticios para probar el circuito",
    });
    const stage2 = await s.insert(c, "ETAPA_FABRICACION", {
      nombre: "Montado (ejemplo)",
      descripcion: "Datos ficticios para probar el circuito",
    });
    const unit = await s.one(
      c,
      "SELECT unidad_id FROM UNIDAD_MEDIDA WHERE simbolo='m²'",
    );
    const line = await s.one(
      c,
      "SELECT linea_id FROM LINEA_CALZADO WHERE nombre='Formal'",
    );
    const talla = await s.one(
      c,
      "SELECT talla_id FROM TALLA WHERE sistema='EU' AND valor='40'",
    );
    const color = await s.one(
      c,
      "SELECT color_id FROM COLOR WHERE nombre='Café'",
    );
    const material = await s.saveMaterial(c, null, {
      codigo: "EJ-V2-MAT",
      nombre: "Cuero de ejemplo (ficticio)",
      unidad_id: unit.unidad_id,
      costo_referencia: 20,
      stock_minimo: 10,
      observacion:
        "Datos ficticios, independientes de los materiales migrados.",
      activo: true,
      stock_inicial: 100,
      codigo_lote: "EJ-V2-LOTE",
      ubicacion_id: loc,
    });
    const model = await s.insert(c, "MODELO_CALZADO", {
      codigo: "EJ-V2-MOD",
      nombre: "Botín de ejemplo",
      linea_id: line.linea_id,
      descripcion: "Ejemplo ficticio independiente del legado.",
    });
    const product = await s.saveProduct(c, null, {
      sku: "EJ-V2-SKU-40",
      modelo_id: model,
      talla_id: talla.talla_id,
      color_id: color.color_id,
      activo: true,
      etapas: [
        {
          etapa_id: stage1,
          secuencia: 1,
          minutos_estimados_por_par: 2,
          costo_mano_obra_estimado_por_par: 1,
          materiales: [
            {
              material_id: material,
              cantidad_neta_por_par: 0.2,
              porcentaje_merma: 5,
            },
          ],
        },
        {
          etapa_id: stage2,
          secuencia: 2,
          minutos_estimados_por_par: 3,
          costo_mano_obra_estimado_por_par: 1.5,
          materiales: [
            {
              material_id: material,
              cantidad_neta_por_par: 0.1,
              porcentaje_merma: 0,
            },
          ],
        },
      ],
    });
    const worker = await s.worker(c, null, {
      codigo: "EJ-V2-TRA",
      nombre_completo: "Operador de ejemplo (ficticio)",
      tipo_contratacion: "Demostración",
      tarifa_hora_actual: 25,
      estado: "Activo",
      etapas: [stage1, stage2],
    });
    const actor = "Carga de ejemplo",
      day = new Date().toISOString().slice(0, 10),
      due = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const order = await s.createOrder(
      c,
      {
        producto_id: product,
        trabajador_id: worker,
        cantidad_planificada: 12,
        inicio_programado: day,
        fin_programado: due,
        prioridad: "Normal",
      },
      actor,
    );
    await s.update(c, "ORDEN_FABRICACION", "orden_id", order, {
      numero_orden: "EJEMPLO-COMPLETO",
    });
    await s.advance(c, order, { estado_esperado: "Pendiente" }, actor);
    const stages = await s.rows(
      c,
      "SELECT d.detalle_etapa_id FROM DETALLE_ORDEN_ETAPA d JOIN FICHA_ETAPA f USING(ficha_etapa_id) WHERE orden_id=? ORDER BY secuencia",
      [order],
    );
    await s.labor(c, {
      detalle_etapa_id: stages[0].detalle_etapa_id,
      trabajador_id: worker,
      fecha: day,
      horas_trabajadas: 0.5,
    });
    const incident = await s.incident(c, null, {
      detalle_etapa_id: stages[0].detalle_etapa_id,
      tipo: "Verificación de ejemplo",
      descripcion: "Caso ficticio de ajuste de corte",
      responsable_id: worker,
      severidad: "Baja",
      costo_estimado_impacto: null,
      estado: "Abierta",
      resolucion: "",
    });
    await s.incident(c, incident, {
      detalle_etapa_id: stages[0].detalle_etapa_id,
      tipo: "Verificación de ejemplo",
      descripcion: "Caso ficticio de ajuste de corte",
      responsable_id: worker,
      severidad: "Baja",
      costo_estimado_impacto: null,
      estado: "Resuelta",
      resolucion: "EJEMPLO: ajuste comprobado.",
    });
    await s.finishStage(
      c,
      stages[0].detalle_etapa_id,
      { cantidad_aceptada: 12, cantidad_rechazada: 0 },
      actor,
    );
    await s.startStage(c, stages[1].detalle_etapa_id, actor);
    await s.finishStage(
      c,
      stages[1].detalle_etapa_id,
      { cantidad_aceptada: 12, cantidad_rechazada: 0 },
      actor,
    );
    await s.advance(c, order, { estado_esperado: "En producción" }, actor);
    await s.advance(
      c,
      order,
      {
        estado_esperado: "Control de calidad",
        evidencia: "EJEMPLO FICTICIO: doce pares de prueba conformes.",
      },
      actor,
    );
    await s.advance(c, order, { estado_esperado: "Terminado" }, actor);
    const hours = await s.one(
      c,
      "SELECT unidad_id FROM UNIDAD_MEDIDA WHERE simbolo='h'",
    );
    await s.budget(c, {
      orden_id: order,
      nombre: "Presupuesto ficticio de ejemplo",
      fecha_emision: day,
      vigente_desde: day,
      vigente_hasta: due,
      porcentaje_contingencia: 10,
      estado_aprobacion: "Borrador",
      detalles: [
        {
          concepto: "Cuero de ejemplo con merma",
          tipo_costo: "Material",
          unidad_id: unit.unidad_id,
          cantidad: 3.72,
          costo_unitario_estimado: 20,
        },
        {
          concepto: "Tiempo registrado de ejemplo",
          tipo_costo: "Mano de obra",
          unidad_id: hours.unidad_id,
          cantidad: 0.5,
          costo_unitario_estimado: 25,
        },
      ],
    });
    const pending = await s.createOrder(
      c,
      {
        producto_id: product,
        trabajador_id: worker,
        cantidad_planificada: 5,
        inicio_programado: day,
        fin_programado: due,
        prioridad: "Normal",
      },
      actor,
    );
    await s.update(c, "ORDEN_FABRICACION", "orden_id", pending, {
      numero_orden: "EJEMPLO-RESERVA",
    });
    const step = await s.one(
      c,
      "SELECT d.detalle_etapa_id FROM DETALLE_ORDEN_ETAPA d JOIN FICHA_ETAPA f USING(ficha_etapa_id) WHERE orden_id=? ORDER BY secuencia LIMIT 1",
      [pending],
    );
    const lot = await s.one(
      c,
      "SELECT e.existencia_id FROM EXISTENCIA_MATERIAL e JOIN LOTE_MATERIAL l USING(lote_id) WHERE l.material_id=?",
      [material],
    );
    await s.reserve(c, {
      detalle_etapa_id: step.detalle_etapa_id,
      existencia_id: lot.existencia_id,
      cantidad_pendiente: 1.05,
    });
    await s.insert(c, "AUDITORIA", {
      accion:
        "Circuito ficticio de ejemplo creado; materiales originales sin modificar",
      actor,
    });
    return { alreadyCreated: false, order, pending };
  });
}
if (require.main === module) {
  const pool = createPool();
  sampleWorkflow(pool)
    .then((r) =>
      console.log(
        r.alreadyCreated
          ? "Los ejemplos ya existen; no se duplicaron."
          : "Circuito ficticio completo y reserva de ejemplo creados.",
      ),
    )
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
module.exports = { sampleWorkflow };
