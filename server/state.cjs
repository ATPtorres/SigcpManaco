// This is a read-only projection for the interface, never the persistence model.
function group(rows, key) {
  const map = new Map();
  for (const row of rows) { if (!map.has(row[key])) map.set(row[key], []); map.get(row[key]).push(row); }
  return id => map.get(id) || [];
}
async function state(conn, { compact = false } = {}) {
  const {imageFor,catalog}=require('./images.cjs');
  const all = async (sql) => (await conn.query(sql))[0];
  const imports = await all(
    "SELECT hash_origen,etiqueta,fecha_hora,actor,resumen,mapa FROM IMPORTACION_LEGACY ORDER BY fecha_hora DESC",
  );
  const incidentCodes = new Map();
  for (const item of imports)
    for (const [code, id] of Object.entries(item.mapa.incidents || {}))
      incidentCodes.set(id, code);
  const refs = {};
  for (const [name, table] of Object.entries({
    units: "UNIDAD_MEDIDA",
    lines: "LINEA_CALZADO",
    sizes: "TALLA",
    colors: "COLOR",
    models: "MODELO_CALZADO",
    stages: "ETAPA_FABRICACION",
    locations: "UBICACION",
  }))
    refs[name] = await all(`SELECT * FROM ${table}`);
  for(const model of refs.models)model.image_url=model.imagen_url||imageFor(model.nombre);
  const workers = await all(
    "SELECT * FROM TRABAJADOR_ZAPATERO ORDER BY trabajador_id",
  );
  const skills = await all("SELECT * FROM TRABAJADOR_ETAPA");
  const skillsFor = group(skills, 'trabajador_id');
  for (const w of workers)
    w.etapas = skillsFor(w.trabajador_id)
      .map((s) => s.etapa_id);
  const materialsRaw = await all(
    "SELECT m.*,u.simbolo FROM MATERIAL m JOIN UNIDAD_MEDIDA u USING(unidad_id)",
  );
  const lots =
    await all(`SELECT e.existencia_id,l.*,u.codigo ubicacion,u.ubicacion_id,
 COALESCE((SELECT SUM(CASE WHEN tipo_movimiento='Entrada' THEN cantidad ELSE -cantidad END) FROM MOVIMIENTO_MATERIAL WHERE existencia_id=e.existencia_id),0) saldo,
 COALESCE((SELECT SUM(cantidad_pendiente) FROM RESERVA_MATERIAL WHERE existencia_id=e.existencia_id AND estado='Activa'),0) reservado
 FROM EXISTENCIA_MATERIAL e JOIN LOTE_MATERIAL l USING(lote_id) JOIN UBICACION u USING(ubicacion_id) ORDER BY l.fecha_recepcion,e.existencia_id`);
  const lotsFor = group(lots, 'material_id');
  const materials = materialsRaw.map((m) => ({
    ...m,
    id: `MAT-${m.material_id}`,
    name: m.nombre,
    unit: m.simbolo,
    min: m.stock_minimo,
    stock: lotsFor(m.material_id)
      .reduce((s, l) => s + Number(l.saldo), 0),
    reserved: lotsFor(m.material_id)
      .reduce((s, l) => s + Number(l.reservado), 0),
  }));
  const fichas = await all(
    "SELECT * FROM FICHA_FABRICACION ORDER BY version DESC",
  );
  const steps = await all(
    "SELECT f.*,e.nombre FROM FICHA_ETAPA f JOIN ETAPA_FABRICACION e USING(etapa_id) ORDER BY secuencia",
  );
  const recipes = await all("SELECT * FROM RECETA_MATERIAL");
  const stepsForFicha = group(steps, 'ficha_id');
  const recipesFor = group(recipes, 'ficha_etapa_id');
  for (const f of fichas)
    f.etapas = stepsForFicha(f.ficha_id)
      .map((s) => ({
        ...s,
        materiales: recipesFor(s.ficha_etapa_id),
      }));
  const productsRaw = await all(
    `SELECT p.*,m.nombre,m.descripcion,m.codigo modelo_codigo,m.linea_id,t.valor,t.sistema,c.nombre color,c.tono,l.nombre category FROM PRODUCTO_CALZADO p JOIN MODELO_CALZADO m USING(modelo_id) JOIN TALLA t USING(talla_id) JOIN COLOR c USING(color_id) JOIN LINEA_CALZADO l USING(linea_id) ORDER BY p.producto_id`,
  );
  const activeFicha = new Map(fichas.filter(f=>f.estado==='Vigente').map(f=>[f.producto_id,f]));
  const productById = new Map(productsRaw.map(p=>[p.producto_id,p]));
  const products = productsRaw.map((p) => {
    const ficha = activeFicha.get(p.producto_id);
    const amounts = new Map();
    for (const e of ficha?.etapas || [])
      for (const r of e.materiales)
        amounts.set(
          r.material_id,
          (amounts.get(r.material_id) || 0) +
            r.cantidad_neta_por_par * (1 + r.porcentaje_merma / 100),
        );
    return {
      ...p,
      id: `PRD-${p.producto_id}`,
      name: `${p.nombre} · ${p.color} · T${p.valor}`,
      sizes: p.valor,
      description: p.descripcion || "",
      tone: p.tono,
      image_url: p.imagen_url || imageFor(p.nombre,p.color) || refs.models.find(m=>m.modelo_id===p.modelo_id)?.imagen_url || null,
      ficha,
      bom: [...amounts].map(([id, qty]) => ({ material: `MAT-${id}`, qty })),
    };
  });
  const history = await all(
    "SELECT * FROM HISTORIAL_ORDEN " + (compact ? "WHERE 1=0 " : "") + "ORDER BY historial_id",
  );
  const orderSteps = await all(
    "SELECT d.*,f.secuencia,f.minutos_estimados_por_par,e.nombre FROM DETALLE_ORDEN_ETAPA d JOIN FICHA_ETAPA f USING(ficha_etapa_id) JOIN ETAPA_FABRICACION e USING(etapa_id) ORDER BY f.secuencia",
  );
  const reqs = await all("SELECT * FROM REQUERIMIENTO_MATERIAL");
  const ordersRaw = await all(
    "SELECT o.*,f.producto_id,t.nombre_completo owner FROM ORDEN_FABRICACION o JOIN FICHA_FABRICACION f USING(ficha_id) JOIN TRABAJADOR_ZAPATERO t ON t.trabajador_id=o.responsable_id ORDER BY o.orden_id",
  );
  const historyFor = group(history, 'orden_id');
  const stepsFor = group(orderSteps, 'orden_id');
  const requirementsFor = group(reqs, 'orden_id');
  const states = [
    "Pendiente",
    "En producción",
    "Control de calidad",
    "Terminado",
    "Despachado",
  ];
  const orders = ordersRaw.map((o) => ({
    ...o,
    recommendation: require('./planning.cjs').recommend(o,stepsFor(o.orden_id)),
    id: `OP-${o.orden_id}`,
    product: `PRD-${o.producto_id}`,
    size: productById.get(o.producto_id)?.valor || "",
    quantity: o.cantidad_planificada,
    state: states.indexOf(o.estado),
    start: o.inicio_programado.slice(0, 10),
    due: o.fin_programado.slice(0, 10),
    created: o.fecha_creacion.slice(0, 10),
    closed: o.fin_real?.slice(0, 10) || o.fecha_cierre_heredada || "",
    priority: o.prioridad,
    evidence: o.evidencia_calidad || "",
    consumed: o.estado !== "Pendiente",
    history: historyFor(o.orden_id)
      .map((h) => ({
        at: h.fecha_hora.replace(" ", "T") + "Z",
        text: h.descripcion,
        actor: h.actor,
      })),
    acceptedKnown: !!stepsFor(o.orden_id).at(-1)
      ?.conteo_confirmado,
    acceptedPairs:
      stepsFor(o.orden_id).at(-1)
        ?.cantidad_aceptada || 0,
    etapas: stepsFor(o.orden_id),
    requirements: requirementsFor(o.orden_id),
  }));
  const incidentsRaw = await all(
    "SELECT i.*,d.orden_id,o.numero_orden,t.nombre_completo owner FROM INCIDENCIA_PRODUCCION i JOIN DETALLE_ORDEN_ETAPA d USING(detalle_etapa_id) JOIN ORDEN_FABRICACION o USING(orden_id) JOIN TRABAJADOR_ZAPATERO t ON t.trabajador_id=i.responsable_id",
  );
  const incidents = incidentsRaw.map((i) => ({
    ...i,
    id: `INC-${i.incidencia_id}`,
    codigo: incidentCodes.get(i.incidencia_id) || `INC-${i.incidencia_id}`,
    order: `OP-${i.orden_id}`,
    type: i.tipo,
    description: i.descripcion,
    severity: i.severidad,
    status: i.estado,
    created: i.fecha_hora.slice(0, 10),
    closed: i.fecha_cierre?.slice(0, 10) || "",
    action: i.resolucion || "",
  }));
  const movements = await all(
    `SELECT m.*,l.material_id,d.orden_id FROM MOVIMIENTO_MATERIAL m JOIN EXISTENCIA_MATERIAL e USING(existencia_id) JOIN LOTE_MATERIAL l USING(lote_id) LEFT JOIN DETALLE_ORDEN_ETAPA d USING(detalle_etapa_id) ORDER BY movimiento_id DESC ${compact ? 'LIMIT 50' : ''}`,
  );
  const audit = await all(
    "SELECT fecha_hora at,accion text,actor,entidad,registro_id,motivo FROM AUDITORIA ORDER BY auditoria_id DESC LIMIT " + (compact ? '50' : '500'),
  );
  const pilot = Object.fromEntries(
    (await all("SELECT * FROM CRITERIO_PILOTO")).map((p) => [
      p.criterio_id,
      {
        checked: !!p.validado,
        evidence: p.evidencia,
        at: p.fecha_hora.replace(" ", "T") + "Z",
      },
    ]),
  );
  const budgets = await all(
    `SELECT p.*,COALESCE(SUM(d.cantidad*d.costo_unitario_estimado),0) subtotal,ROUND(COALESCE(SUM(d.cantidad*d.costo_unitario_estimado),0)*(1+p.porcentaje_contingencia/100),4) total FROM PRESUPUESTO p LEFT JOIN DETALLE_PRESUPUESTO d USING(presupuesto_id) GROUP BY p.presupuesto_id ORDER BY p.presupuesto_id`,
  );
  const budgetLines = await all("SELECT * FROM DETALLE_PRESUPUESTO");
  const linesFor = group(budgetLines, 'presupuesto_id');
  for (const b of budgets)
    b.detalles = linesFor(b.presupuesto_id);
  const costs = await all(
    `SELECT o.orden_id,COALESCE((SELECT SUM(m.cantidad*m.costo_unitario_aplicado) FROM MOVIMIENTO_MATERIAL m JOIN DETALLE_ORDEN_ETAPA d USING(detalle_etapa_id) WHERE d.orden_id=o.orden_id AND m.tipo_movimiento='Consumo'),0) materiales,COALESCE((SELECT SUM(r.horas_trabajadas*r.tarifa_hora_aplicada) FROM REGISTRO_MANO_OBRA r JOIN DETALLE_ORDEN_ETAPA d USING(detalle_etapa_id) WHERE d.orden_id=o.orden_id),0) mano_obra, (o.origen_datos='Migrado' OR EXISTS(SELECT 1 FROM MOVIMIENTO_MATERIAL m JOIN DETALLE_ORDEN_ETAPA d USING(detalle_etapa_id) WHERE d.orden_id=o.orden_id AND m.costo_confirmado=0)) incompleto FROM ORDEN_FABRICACION o`,
  );
  return {
    imports: imports.map(({ mapa, ...summary }) => summary),
    version: 2,
    imageCatalog: catalog.map(({prompt,...entry})=>entry),
    compact,
    movementCount: compact ? (await all('SELECT COUNT(*) n FROM MOVIMIENTO_MATERIAL'))[0].n : movements.length,
    mode: "own",
    costs,
    refs,
    products,
    materials,
    orders,
    incidents,
    workers,
    lots,
    fichas,
    budgets,
    pilot,
    labor: await all(
      "SELECT r.*,ROUND(horas_trabajadas*tarifa_hora_aplicada,4) costo FROM REGISTRO_MANO_OBRA r",
    ),
    reservations: await all(
      "SELECT * FROM RESERVA_MATERIAL WHERE estado='Activa'",
    ),
    movements: movements.map((m) => ({
      ...m,
      id: `MOV-${m.movimiento_id}`,
      material: `MAT-${m.material_id}`,
      amount: m.tipo_movimiento === "Entrada" ? m.cantidad : -m.cantidad,
      reason: m.motivo || "",
      at: m.fecha_hora.replace(" ", "T") + "Z",
    })),
    audit: audit.map((a) => ({ ...a, at: a.at.replace(" ", "T") + "Z" })),
  };
}
module.exports = { state };
