const crypto = require("node:crypto");
const { z } = require("zod");
const s = require("./service.cjs");
const { transaction } = require("./db.cjs");
const text = z.string().max(5000),
  name = z.string().trim().min(1).max(120);
const id = (prefix) => z.string().regex(new RegExp("^" + prefix + "-\\d+$"));
const number = z
  .number()
  .finite()
  .min(0)
  .max(999999999)
  .refine(
    (v) => Math.abs(v * 10000 - Math.round(v * 10000)) < 0.000001,
    "Usa como máximo cuatro decimales.",
  );
const day = z.iso.date(),
  time = z.iso.datetime({ offset: true });
const event = z.object({ at: time, text, actor: z.string().max(80) }).strict();
const schema = z
  .object({
    version: z.literal(1),
    mode: z.enum(["demo", "own"]),
    materials: z
      .array(
        z
          .object({
            id: id("MAT"),
            name,
            unit: z.enum(["m²", "pares", "litros", "kg", "unidades", "metros"]),
            stock: number,
            min: number,
          })
          .strict(),
      )
      .max(10000),
    products: z
      .array(
        z
          .object({
            id: id("PRD"),
            name,
            category: z.string().trim().min(1).max(80),
            sizes: z.string().max(100),
            color: z.string().trim().min(1).max(80),
            description: text,
            tone: z.string().regex(/^#[0-9a-f]{6}$/i),
            bom: z
              .array(
                z
                  .object({ material: id("MAT"), qty: number.positive() })
                  .strict(),
              )
              .min(1)
              .max(100),
          })
          .strict(),
      )
      .max(10000),
    orders: z
      .array(
        z
          .object({
            id: id("OP"),
            product: id("PRD"),
            quantity: z.number().int().positive().max(1000000),
            state: z.number().int().min(0).max(4),
            due: day,
            priority: z.enum(["Normal", "Alta"]),
            owner: name,
            size: z.string().max(16),
            start: day,
            created: day,
            closed: z.union([day, z.literal("")]),
            evidence: text,
            consumed: z.boolean(),
            history: z.array(event).max(10000),
          })
          .strict(),
      )
      .max(10000),
    incidents: z
      .array(
        z
          .object({
            id: id("INC"),
            order: id("OP"),
            type: z.string().min(1).max(80),
            severity: z.enum(["Baja", "Media", "Alta"]),
            description: text,
            owner: name,
            status: z.enum(["Abierta", "En atención", "Resuelta"]),
            created: day,
            closed: z.union([day, z.literal("")]),
            action: text,
          })
          .strict(),
      )
      .max(10000),
    audit: z.array(event).max(50000),
    movements: z
      .array(
        z
          .object({
            id: id("MOV"),
            material: id("MAT"),
            amount: z.number().finite().min(-999999999).max(999999999),
            reason: text,
            at: time,
          })
          .strict(),
      )
      .max(50000),
    pilot: z.record(
      z.string().regex(/^\d$/),
      z.object({ checked: z.boolean(), evidence: text, at: time }).strict(),
    ),
  })
  .strict();
const dateTime = (value) =>
  new Date(value).toISOString().slice(0, 19).replace("T", " ");
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, canonical(value[k])]),
        )
      : value;
function validateLegacy(input) {
  const data = schema.parse(input);
  for (const list of [
    "materials",
    "products",
    "orders",
    "incidents",
    "movements",
  ])
    if (new Set(data[list].map((x) => x.id)).size !== data[list].length)
      s.fail("Identificadores duplicados en " + list + ".", 400);
  const mats = new Set(data.materials.map((m) => m.id)),
    products = new Map(data.products.map((p) => [p.id, p])),
    orders = new Map(data.orders.map((o) => [o.id, o]));
  let variants = 0;
  for (const p of data.products) {
    const sizes = p.sizes.split(",").map((x) => x.trim());
    if (
      !sizes.length ||
      sizes.some((x) => !/^\d{1,2}(\.5)?$/.test(x)) ||
      new Set(sizes).size !== sizes.length
    )
      s.fail("Tallas inválidas en " + p.id + ".", 400);
    variants += sizes.length;
    if (variants > 50000) s.fail("Demasiadas variantes.", 400);
    if (
      new Set(p.bom.map((b) => b.material)).size !== p.bom.length ||
      p.bom.some((b) => !mats.has(b.material))
    )
      s.fail("Receta inconsistente en " + p.id + ".", 400);
  }
  for (const o of data.orders) {
    if (
      !products
        .get(o.product)
        ?.sizes.split(",")
        .map((s) => s.trim())
        .includes(o.size) ||
      o.due < o.start ||
      o.consumed !== o.state > 0 ||
      (o.state >= 3 && (!o.closed || !o.evidence.trim()))
    )
      s.fail("Orden inconsistente: " + o.id + ".", 400);
  }
  for (const i of data.incidents) {
    const o = orders.get(i.order);
    if (
      !o ||
      (i.status === "Resuelta" && (!i.closed || !i.action.trim())) ||
      (o.state >= 3 && i.status !== "Resuelta")
    )
      s.fail("Incidencia inconsistente: " + i.id + ".", 400);
  }
  for (const m of data.movements)
    if (!mats.has(m.material)) s.fail("Movimiento sin material válido.", 400);
  for (const m of data.materials) {
    const movements = data.movements.filter((x) => x.material === m.id);
    let balance =
      Math.round(
        (m.stock - movements.reduce((s, x) => s + x.amount, 0)) * 10000,
      ) / 10000;
    if (balance < 0)
      s.fail(
        "El historial no permite reconstruir un saldo inicial no negativo: " +
          m.id +
          ".",
        400,
      );
    for (const move of [...movements].sort((a, b) =>
      a.at.localeCompare(b.at),
    )) {
      balance = Math.round((balance + move.amount) * 10000) / 10000;
      if (balance < 0)
        s.fail("El historial contiene saldo negativo: " + m.id + ".", 400);
    }
  }
  return {
    data,
    hash: crypto
      .createHash("sha256")
      .update(JSON.stringify(canonical(data)))
      .digest("hex"),
    counts: {
      materials: data.materials.length,
      models: data.products.length,
      variants,
      orders: data.orders.length,
      incidents: data.incidents.length,
      movements: data.movements.length,
      workers: new Set([...data.orders, ...data.incidents].map((r) => r.owner))
        .size,
    },
  };
}
const warnings = [
  "Se conservan códigos, tallas, recetas, saldos, estados, responsables y documentos originales.",
  "Se usa una ubicación y lote de apertura de migración: no representan lotes físicos históricos.",
  "Las recetas se asignan a una etapa global heredada, sin inventar corte, aparado o montado anteriores. Merma cero conserva la fórmula original.",
  "Las órdenes ya iniciadas no vuelven a consumir. No se reconstruyen consumos que el origen no registró.",
  "Precios, tarifas y conteos de calidad ausentes quedan pendientes de confirmar. Las fechas sin hora se conservan con precisión de día.",
  "El sistema de tallaje EU es una correspondencia de migración para las tallas numéricas del prototipo y debe confirmarse.",
  "Los responsables se crean sin tarifa confirmada; no se inventan contratos ni horas trabajadas.",
];
async function preview(c, input) {
  const v = validateLegacy(input);
  const done = await s.rows(
    c,
    "SELECT resumen,mapa FROM IMPORTACION_LEGACY WHERE hash_origen=?",
    [v.hash],
  );
  const conflicts = [];
  if (!done.length) {
    for (const m of v.data.materials)
      if (
        (
          await s.rows(c, "SELECT material_id FROM MATERIAL WHERE codigo=?", [
            m.id,
          ])
        ).length
      )
        conflicts.push("Material " + m.id);
    for (const p of v.data.products)
      if (
        (
          await s.rows(
            c,
            "SELECT modelo_id FROM MODELO_CALZADO WHERE codigo=?",
            [p.id],
          )
        ).length
      )
        conflicts.push("Modelo " + p.id);
    for (const o of v.data.orders)
      if (
        (
          await s.rows(
            c,
            "SELECT orden_id FROM ORDEN_FABRICACION WHERE numero_orden=?",
            [o.id],
          )
        ).length
      )
        conflicts.push("Orden " + o.id);
  }
  return {
    hash: v.hash,
    counts: v.counts,
    warnings,
    conflicts,
    alreadyImported: !!done.length,
    canImport: !conflicts.length,
  };
}
async function importLegacy(
  pool,
  input,
  {
    expectedHash,
    label = "Respaldo del prototipo",
    actor = "Migración CLI",
  } = {},
) {
  const v = validateLegacy(input);
  if (expectedHash && expectedHash !== v.hash)
    s.fail("El archivo cambió después de la vista previa.", 409);
  return transaction(pool, async (c) => {
    await s.one(
      c,
      "SELECT bloqueo_id FROM BLOQUEO_MIGRACION WHERE bloqueo_id=1 FOR UPDATE",
    );
    const previous = await s.rows(
      c,
      "SELECT resumen,mapa FROM IMPORTACION_LEGACY WHERE hash_origen=?",
      [v.hash],
    );
    if (previous.length)
      return {
        hash: v.hash,
        alreadyImported: true,
        counts: previous[0].resumen,
        map: previous[0].mapa,
        warnings,
      };
    const check = await preview(c, v.data);
    if (check.conflicts.length)
      s.fail(
        "La importación entra en conflicto con registros existentes: " +
          check.conflicts.join(", "),
      );
    const data = v.data,
      map = {
        materials: {},
        variants: {},
        orders: {},
        incidents: {},
        workers: {},
      };
    async function catalog(table, column, value, extra = {}) {
      const found = await s.rows(
        c,
        `SELECT * FROM ${table} WHERE ${column}=?`,
        [value],
      );
      if (found.length) return found[0];
      await s.insert(c, table, { [column]: value, ...extra });
      return s.one(c, `SELECT * FROM ${table} WHERE ${column}=?`, [value]);
    }
    const loc = await catalog("UBICACION", "codigo", "MIGRACION-V1", {
      descripcion:
        "Saldo de apertura del prototipo; ubicación física por confirmar",
    });
    const stage = await catalog(
      "ETAPA_FABRICACION",
      "nombre",
      "Producción heredada",
      {
        descripcion:
          "Etapa global importada del prototipo, sin detalle histórico por operación",
      },
    );
    for (const name of new Set(
      [...data.orders, ...data.incidents].map((r) => r.owner),
    )) {
      const id = await s.insert(c, "TRABAJADOR_ZAPATERO", {
        codigo:
          "LEG-" +
          crypto
            .createHash("sha256")
            .update(v.hash + name)
            .digest("hex")
            .slice(0, 20),
        nombre_completo: name,
        tipo_contratacion: "Por confirmar (migración)",
        tarifa_hora_actual: 0,
        tarifa_confirmada: false,
        estado: "Activo",
      });
      map.workers[name] = id;
      await s.insert(c, "TRABAJADOR_ETAPA", {
        trabajador_id: id,
        etapa_id: stage.etapa_id,
      });
    }
    const existence = {};
    for (const m of data.materials) {
      const unit = await s.one(
        c,
        "SELECT unidad_id FROM UNIDAD_MEDIDA WHERE simbolo=?",
        [m.unit],
      );
      const id = await s.insert(c, "MATERIAL", {
        codigo: m.id,
        nombre: m.name,
        unidad_id: unit.unidad_id,
        costo_referencia: 0,
        costo_confirmado: false,
        stock_minimo: m.min,
        activo: true,
        observacion: "Migrado; costo histórico no registrado.",
      });
      map.materials[m.id] = id;
      const lot = await s.insert(c, "LOTE_MATERIAL", {
        material_id: id,
        codigo_lote: "APERTURA-" + v.hash.slice(0, 12),
        fecha_recepcion: new Date().toISOString().slice(0, 10),
      });
      existence[m.id] = await s.insert(c, "EXISTENCIA_MATERIAL", {
        lote_id: lot,
        ubicacion_id: loc.ubicacion_id,
      });
      const opening =
        Math.round(
          (m.stock -
            data.movements
              .filter((x) => x.material === m.id)
              .reduce((sum, x) => sum + x.amount, 0)) *
            10000,
        ) / 10000;
      if (opening > 0)
        await s.insert(c, "MOVIMIENTO_MATERIAL", {
          existencia_id: existence[m.id],
          tipo_movimiento: "Entrada",
          cantidad: opening,
          costo_unitario_aplicado: 0,
          costo_confirmado: false,
          motivo:
            "Saldo de apertura migrado; no es recepción física ni reconstrucción de consumos.",
        });
    }
    const variantInfo = {};
    for (const p of data.products) {
      const line = await catalog("LINEA_CALZADO", "nombre", p.category);
      const color = await catalog("COLOR", "nombre", p.color, { tono: p.tone });
      const model = await s.insert(c, "MODELO_CALZADO", {
        codigo: p.id,
        nombre: p.name,
        linea_id: line.linea_id,
        descripcion: p.description,
      });
      for (const size of p.sizes.split(",").map((s) => s.trim())) {
        await c.execute(
          "INSERT INTO TALLA(sistema,valor) VALUES('EU',?) ON DUPLICATE KEY UPDATE talla_id=LAST_INSERT_ID(talla_id)",
          [size],
        );
        const talla = await s.one(
          c,
          "SELECT talla_id FROM TALLA WHERE sistema='EU' AND valor=?",
          [size],
        );
        const id = await s.saveProduct(c, null, {
          sku: p.id + "-EU-" + size + "-" + color.color_id,
          modelo_id: model,
          talla_id: talla.talla_id,
          color_id: color.color_id,
          activo: true,
          etapas: [
            {
              etapa_id: stage.etapa_id,
              secuencia: 1,
              minutos_estimados_por_par: 0,
              costo_mano_obra_estimado_por_par: 0,
              materiales: p.bom.map((b) => ({
                material_id: map.materials[b.material],
                cantidad_neta_por_par: b.qty,
                porcentaje_merma: 0,
              })),
            },
          ],
        });
        map.variants[p.id + "|" + size] = id;
        variantInfo[p.id + "|" + size] = await s.one(
          c,
          "SELECT f.ficha_id,e.ficha_etapa_id FROM FICHA_FABRICACION f JOIN FICHA_ETAPA e USING(ficha_id) WHERE f.producto_id=? AND f.version=1",
          [id],
        );
      }
    }
    const stages = {},
      states = [
        "Pendiente",
        "En producción",
        "Control de calidad",
        "Terminado",
        "Despachado",
      ];
    for (const o of data.orders) {
      const info = variantInfo[o.product + "|" + o.size];
      const id = await s.insert(c, "ORDEN_FABRICACION", {
        numero_orden: o.id,
        ficha_id: info.ficha_id,
        responsable_id: map.workers[o.owner],
        cantidad_planificada: o.quantity,
        fecha_creacion: o.created + " 00:00:00",
        inicio_programado: o.start + " 00:00:00",
        fin_programado: o.due + " 00:00:00",
        estado: states[o.state],
        prioridad: o.priority,
        evidencia_calidad: o.evidence || null,
        origen_datos: "Migrado",
        fecha_cierre_heredada: o.closed || null,
        origen_importacion: v.hash,
      });
      map.orders[o.id] = id;
      stages[o.id] = await s.insert(c, "DETALLE_ORDEN_ETAPA", {
        orden_id: id,
        ficha_id: info.ficha_id,
        ficha_etapa_id: info.ficha_etapa_id,
        estado:
          o.state === 0
            ? "Pendiente"
            : o.state === 1
              ? "En producción"
              : "Terminado",
        origen_datos: "Migrado",
        conteo_confirmado: false,
      });
      for (const b of data.products.find((p) => p.id === o.product).bom)
        await s.insert(c, "REQUERIMIENTO_MATERIAL", {
          orden_id: id,
          ficha_etapa_id: info.ficha_etapa_id,
          material_id: map.materials[b.material],
          cantidad_neta_por_par: b.qty,
          porcentaje_merma: 0,
        });
      for (const h of o.history)
        await s.insert(c, "HISTORIAL_ORDEN", {
          orden_id: id,
          fecha_hora: dateTime(h.at),
          descripcion: "[Legado] " + h.text,
          actor: ("Legado: " + h.actor).slice(0, 80),
        });
      await s.insert(c, "HISTORIAL_ORDEN", {
        orden_id: id,
        descripcion:
          "Migrada sin reconsumo. Etapa global y conteos históricos no medidos.",
        actor,
      });
    }
    for (const i of data.incidents)
      map.incidents[i.id] = await s.insert(c, "INCIDENCIA_PRODUCCION", {
        detalle_etapa_id: stages[i.order],
        tipo: i.type,
        descripcion: i.description,
        fecha_hora: i.created + " 00:00:00",
        estado: i.status,
        fecha_cierre: i.closed ? i.closed + " 00:00:00" : null,
        resolucion: i.action,
        severidad: i.severity,
        responsable_id: map.workers[i.owner],
      });
    for (const m of [...data.movements].sort((a, b) =>
      a.at.localeCompare(b.at),
    ))
      if (m.amount !== 0)
        await s.insert(c, "MOVIMIENTO_MATERIAL", {
          existencia_id: existence[m.material],
          tipo_movimiento: m.amount > 0 ? "Entrada" : "Salida",
          cantidad: Math.abs(m.amount),
          costo_unitario_aplicado: 0,
          costo_confirmado: false,
          fecha_hora: dateTime(m.at),
          motivo: "[Legado " + m.id + "] " + m.reason,
        });
    for (const a of data.audit)
      await s.insert(c, "AUDITORIA", {
        fecha_hora: dateTime(a.at),
        accion: ("[Legado] " + a.text).slice(0, 200),
        actor: ("Legado: " + a.actor).slice(0, 80),
      });
    for (const [key, p] of Object.entries(data.pilot)) {
      const existing = await s.rows(
        c,
        "SELECT criterio_id FROM CRITERIO_PILOTO WHERE criterio_id=?",
        [Number(key)],
      );
      if (existing.length)
        s.fail("Ya existe evidencia del piloto para el criterio " + key + ".");
      await s.insert(c, "CRITERIO_PILOTO", {
        criterio_id: Number(key),
        validado: p.checked,
        evidencia: p.evidence,
        fecha_hora: dateTime(p.at),
      });
    }
    await s.insert(c, "IMPORTACION_LEGACY", {
      hash_origen: v.hash,
      etiqueta: label.slice(0, 120),
      actor,
      resumen: JSON.stringify(v.counts),
      mapa: JSON.stringify(map),
      datos_originales: JSON.stringify(data),
    });
    await s.insert(c, "AUDITORIA", {
      accion: "Importación v1 confirmada: " + v.hash.slice(0, 12),
      actor,
    });
    return {
      hash: v.hash,
      counts: v.counts,
      map,
      warnings,
      alreadyImported: false,
    };
  });
}
module.exports = { validateLegacy, preview, importLegacy, warnings };
