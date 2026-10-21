const { z } = require("zod");
const id = z.coerce.number().int().positive().max(2147483647);
const text = (max = 120) => z.string().trim().min(1).max(max);
const money = z.coerce.number().finite().min(0).max(999999999);
const qty = z.coerce.number().finite().positive().max(1000000);
const date = z.iso.date();
const percent = z.coerce.number().min(0).max(100);
const materialLine = z
  .object({
    material_id: id,
    cantidad_neta_por_par: qty,
    porcentaje_merma: percent.default(0),
  })
  .strict();
const step = z
  .object({
    etapa_id: id,
    secuencia: id,
    minutos_estimados_por_par: money,
    costo_mano_obra_estimado_por_par: money,
    materiales: z.array(materialLine).max(100),
  })
  .strict();
const schemas = {
  login: z
    .object({ username: text(80), password: z.string().min(1).max(200) })
    .strict(),
  material: z
    .object({
      codigo: text(40),
      nombre: text(),
      unidad_id: id,
      costo_referencia: money,
      stock_minimo: money,
      observacion: z.string().max(2000).default(""),
      activo: z.boolean().default(true),
      stock_inicial: money.default(0),
      codigo_lote: text(80).optional(),
      ubicacion_id: id.optional(),
    })
    .strict(),
  product: z
    .object({
      sku: text(80),
      modelo_id: id,
      talla_id: id,
      color_id: id,
      activo: z.boolean().default(true),
      etapas: z.array(step).min(1).max(30),
    })
    .strict(),
  order: z
    .object({
      producto_id: id,
      trabajador_id: id,
      cantidad_planificada: qty.int(),
      inicio_programado: date,
      fin_programado: date,
      prioridad: z.enum(["Normal", "Alta"]),
    })
    .strict()
    .refine((d) => d.fin_programado >= d.inicio_programado, {
      message: "La entrega no puede ser anterior al inicio.",
    }),
  advance: z
    .object({
      estado_esperado: z.enum([
        "Pendiente",
        "En producción",
        "Control de calidad",
        "Terminado",
        "Despachado",
      ]),
      evidencia: z.string().trim().max(5000).default(""),
    })
    .strict(),
  stage: z
    .object({ cantidad_aceptada: money.int(), cantidad_rechazada: money.int() })
    .strict(),
  movement: z
    .object({
      material_id: id,
      tipo_movimiento: z.enum(["Entrada", "Salida"]),
      cantidad: qty,
      costo_unitario_aplicado: money,
      codigo_lote: text(80),
      ubicacion_id: id,
      motivo: text(2000),
    })
    .strict(),
  reserve: z
    .object({
      detalle_etapa_id: id,
      existencia_id: id,
      cantidad_pendiente: qty,
    })
    .strict(),
  incident: z
    .object({
      detalle_etapa_id: id,
      tipo: text(80),
      descripcion: text(5000),
      responsable_id: id,
      severidad: z.enum(["Baja", "Media", "Alta"]),
      costo_estimado_impacto: money.nullable().default(null),
      estado: z.enum(["Abierta", "En atención", "Resuelta"]).default("Abierta"),
      resolucion: z.string().trim().max(5000).default(""),
    })
    .strict()
    .refine((d) => d.estado !== "Resuelta" || d.resolucion.length > 0, {
      message: "Resolver requiere una acción documentada.",
    }),
  worker: z
    .object({
      codigo: text(40),
      nombre_completo: text(),
      tipo_contratacion: text(40),
      tarifa_hora_actual: money,
      estado: z.enum(["Activo", "Inactivo"]).default("Activo"),
      etapas: z.array(id).max(100),
    })
    .strict(),
  labor: z
    .object({
      detalle_etapa_id: id,
      trabajador_id: id,
      fecha: date,
      horas_trabajadas: qty.max(24),
    })
    .strict(),
  budget: z
    .object({
      orden_id: id,
      nombre: text(),
      fecha_emision: date,
      vigente_desde: date,
      vigente_hasta: date,
      porcentaje_contingencia: percent,
      estado_aprobacion: z.enum(["Borrador", "Aprobado", "Rechazado"]),
      detalles: z
        .array(
          z
            .object({
              concepto: text(160),
              tipo_costo: text(40),
              unidad_id: id,
              cantidad: qty,
              costo_unitario_estimado: money,
            })
            .strict(),
        )
        .min(1)
        .max(100),
    })
    .strict()
    .refine((d) => d.vigente_hasta >= d.vigente_desde, {
      message: "Vigencia inválida.",
    }),
  pilot: z.object({ checked: z.boolean(), evidence: text(5000) }).strict(),
};
const catalogs = {
  units: {
    table: "UNIDAD_MEDIDA",
    schema: z.object({ nombre: text(80), simbolo: text(16) }).strict(),
  },
  lines: {
    table: "LINEA_CALZADO",
    schema: z.object({ nombre: text(80) }).strict(),
  },
  sizes: {
    table: "TALLA",
    schema: z.object({ sistema: text(20), valor: text(16) }).strict(),
  },
  colors: {
    table: "COLOR",
    schema: z
      .object({ nombre: text(80), tono: z.string().regex(/^#[0-9a-f]{6}$/i) })
      .strict(),
  },
  stages: {
    table: "ETAPA_FABRICACION",
    schema: z
      .object({ nombre: text(80), descripcion: z.string().max(2000) })
      .strict(),
  },
  locations: {
    table: "UBICACION",
    schema: z.object({ codigo: text(40), descripcion: text(160) }).strict(),
  },
  models: {
    table: "MODELO_CALZADO",
    schema: z
      .object({
        codigo: text(40),
        nombre: text(),
        linea_id: id,
        descripcion: z.string().max(2000),
      })
      .strict(),
  },
};
function key(value) {
  const n = Number(String(value).replace(/^(MAT|PRD|OP|INC|MOV)-/, ""));
  return id.parse(n);
}
module.exports = { schemas, catalogs, key };
