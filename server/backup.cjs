const { transaction } = require("./db.cjs");
const s = require("./service.cjs");
const businessTables = [
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
  "IMPORTACION_LEGACY",
];
async function backup(pool) {
  return transaction(
    pool,
    async (c) => {
      const tables = {};
      for (const table of businessTables)
        tables[table] = await s.rows(c, `SELECT * FROM ${table}`);
      return {
        format: "sigcp-mysql",
        version: 1,
        created: new Date().toISOString(),
        tables,
      };
    },
    "REPEATABLE READ",
  );
}
async function restore(pool, input) {
  if (
    input?.format !== "sigcp-mysql" ||
    input.version !== 1 ||
    !input.tables ||
    Array.isArray(input.tables)
  )
    s.fail("Formato de respaldo MySQL inválido.", 400);
  const unknown = Object.keys(input.tables).filter(
    (t) => !businessTables.includes(t),
  );
  if (unknown.length) s.fail("El respaldo contiene tablas no permitidas.", 400);
  for (const table of businessTables)
    if (table !== "IMPORTACION_LEGACY" && !Array.isArray(input.tables[table]))
      s.fail("Falta una tabla de negocio: " + table, 400);
  return transaction(pool, async (c) => {
    await s.one(
      c,
      "SELECT bloqueo_id FROM BLOQUEO_MIGRACION WHERE bloqueo_id=1 FOR UPDATE",
    );
    for (const table of businessTables) {
      const r = await s.one(c, `SELECT COUNT(*) n FROM ${table}`);
      if (r.n)
        s.fail(
          "La restauración requiere una base de destino vacía. No se reemplazaron registros.",
        );
    }
    const counts = {};
    for (const table of businessTables) {
      const [columns] = await c.execute(
        "SELECT COLUMN_NAME,DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?",
        [table],
      );
      const types = new Map(columns.map((r) => [r.COLUMN_NAME, r.DATA_TYPE]));
      const data = input.tables[table] || [];
      if (!Array.isArray(data) || data.length > 100000)
        s.fail("Tabla de respaldo inválida: " + table, 400);
      counts[table] = data.length;
      for (const row of data) {
        if (
          !row ||
          typeof row !== "object" ||
          Array.isArray(row) ||
          !Object.keys(row).length ||
          Object.keys(row).some((k) => !types.has(k))
        )
          s.fail("Columnas inválidas en " + table, 400);
        const values = Object.fromEntries(
          Object.entries(row).map(([k, v]) => [
            k,
            types.get(k) === "json" && v !== null ? JSON.stringify(v) : v,
          ]),
        );
        await s.insert(c, table, values);
      }
    }
    const invalid = await s.rows(
      c,
      `SELECT e.existencia_id FROM EXISTENCIA_MATERIAL e LEFT JOIN MOVIMIENTO_MATERIAL m USING(existencia_id) GROUP BY e.existencia_id HAVING COALESCE(SUM(CASE WHEN m.tipo_movimiento='Entrada' THEN m.cantidad ELSE -m.cantidad END),0)<0 OR COALESCE(SUM(CASE WHEN m.tipo_movimiento='Entrada' THEN m.cantidad ELSE -m.cantidad END),0)<(SELECT COALESCE(SUM(r.cantidad_pendiente),0) FROM RESERVA_MATERIAL r WHERE r.existencia_id=e.existencia_id AND r.estado='Activa')`,
    );
    if (invalid.length)
      s.fail("El respaldo contiene inventario negativo o sobreasignado.", 400);
    const inconsistent = await s.rows(
      c,
      `SELECT o.orden_id FROM ORDEN_FABRICACION o JOIN DETALLE_ORDEN_ETAPA d USING(orden_id) WHERE d.cantidad_aceptada+d.cantidad_rechazada>o.cantidad_planificada OR (o.estado IN ('Terminado','Despachado') AND (o.evidencia_calidad IS NULL OR CHAR_LENGTH(TRIM(o.evidencia_calidad))=0)) LIMIT 1`,
    );
    if (inconsistent.length)
      s.fail("El respaldo contiene órdenes inconsistentes.", 400);
    return counts;
  });
}
module.exports = { businessTables, backup, restore };
