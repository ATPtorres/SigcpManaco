const { createPool, transaction } = require("../server/db.cjs");
const { hashPassword } = require("../server/auth.cjs");
const s = require("../server/service.cjs");
async function seed(pool) {
  if (!process.env.APP_PASSWORD || process.env.APP_PASSWORD.length < 12)
    throw Error(
      "Configura APP_PASSWORD de al menos 12 caracteres antes de inicializar.",
    );
  const hash = await hashPassword(process.env.APP_PASSWORD);
  await transaction(pool, async (c) => {
    const user = process.env.APP_USER || "admin";
    const existing = await s.rows(
      c,
      "SELECT usuario_id FROM USUARIO WHERE nombre=?",
      [user],
    );
    if (!existing.length)
      await s.insert(c, "USUARIO", {
        nombre: user,
        password_hash: hash,
        rol: "Administrador",
      });
    for (const [nombre, simbolo] of [
      ["Metro cuadrado", "m²"],
      ["Par", "pares"],
      ["Litro", "litros"],
      ["Kilogramo", "kg"],
      ["Unidad", "unidades"],
      ["Metro", "metros"],
      ["Hora", "h"],
    ])
      await c.execute(
        "INSERT IGNORE INTO UNIDAD_MEDIDA(nombre,simbolo) VALUES(?,?)",
        [nombre, simbolo],
      );
    for (const nombre of [
      "Formal",
      "Casual",
      "Deportivo",
      "Escolar",
      "Industrial",
    ])
      await c.execute("INSERT IGNORE INTO LINEA_CALZADO(nombre) VALUES(?)", [
        nombre,
      ]);
    for (let valor = 30; valor <= 45; valor++)
      await c.execute(
        "INSERT IGNORE INTO TALLA(sistema,valor) VALUES('EU',?)",
        [String(valor)],
      );
    for (const [nombre, tono] of [
      ["Negro", "#263344"],
      ["Café", "#98745a"],
      ["Azul", "#365b83"],
    ])
      await c.execute("INSERT IGNORE INTO COLOR(nombre,tono) VALUES(?,?)", [
        nombre,
        tono,
      ]);
    for (const nombre of ["Corte", "Aparado", "Montado", "Acabado"])
      await c.execute(
        "INSERT IGNORE INTO ETAPA_FABRICACION(nombre,descripcion) VALUES(?,?)",
        [nombre, "Etapa de fabricación de calzado"],
      );
    await c.execute(
      "INSERT IGNORE INTO UBICACION(codigo,descripcion) VALUES('ALM-01','Almacén principal')",
    );
  });
  console.log(
    "Catálogos y usuario inicial disponibles. La contraseña existente no se modifica.",
  );
}
async function demo(pool) {
  await transaction(pool, async (c) => {
    const count = await s.one(c, "SELECT COUNT(*) n FROM MATERIAL");
    if (count.n)
      throw Error(
        "La carga demo requiere una base sin materiales. No se modificaron datos.",
      );
    const unit = await s.one(
      c,
      "SELECT unidad_id FROM UNIDAD_MEDIDA WHERE simbolo='m²'",
    );
    const pair = await s.one(
      c,
      "SELECT unidad_id FROM UNIDAD_MEDIDA WHERE simbolo='pares'",
    );
    const loc = await s.one(
      c,
      "SELECT ubicacion_id FROM UBICACION WHERE codigo='ALM-01'",
    );
    const leather = await s.saveMaterial(c, null, {
      codigo: "MAT-DEMO-01",
      nombre: "Cuero de demostración",
      unidad_id: unit.unidad_id,
      costo_referencia: 35,
      stock_minimo: 10,
      observacion: "Dato ficticio",
      activo: true,
      stock_inicial: 500,
      codigo_lote: "LOTE-DEMO",
      ubicacion_id: loc.ubicacion_id,
    });
    const sole = await s.saveMaterial(c, null, {
      codigo: "MAT-DEMO-02",
      nombre: "Suelas de demostración",
      unidad_id: pair.unidad_id,
      costo_referencia: 12,
      stock_minimo: 50,
      observacion: "Dato ficticio",
      activo: true,
      stock_inicial: 1000,
      codigo_lote: "LOTE-DEMO",
      ubicacion_id: loc.ubicacion_id,
    });
    const stages = await s.rows(
      c,
      "SELECT etapa_id FROM ETAPA_FABRICACION ORDER BY etapa_id",
    );
    const line = await s.one(
      c,
      "SELECT linea_id FROM LINEA_CALZADO WHERE nombre='Formal'",
    );
    const size = await s.one(
      c,
      "SELECT talla_id FROM TALLA WHERE sistema='EU' AND valor='40'",
    );
    const color = await s.one(
      c,
      "SELECT color_id FROM COLOR WHERE nombre='Negro'",
    );
    const model = await s.insert(c, "MODELO_CALZADO", {
      codigo: "MOD-DEMO",
      nombre: "Clásico de demostración",
      linea_id: line.linea_id,
      descripcion: "Producto ficticio para validar el circuito.",
    });
    const product = await s.saveProduct(c, null, {
      sku: "SKU-DEMO-40-N",
      modelo_id: model,
      talla_id: size.talla_id,
      color_id: color.color_id,
      activo: true,
      etapas: stages.map((e, i) => ({
        etapa_id: e.etapa_id,
        secuencia: i + 1,
        minutos_estimados_por_par: 3,
        costo_mano_obra_estimado_por_par: 2,
        materiales:
          i === 0
            ? [
                {
                  material_id: leather,
                  cantidad_neta_por_par: 0.2,
                  porcentaje_merma: 5,
                },
              ]
            : i === 2
              ? [
                  {
                    material_id: sole,
                    cantidad_neta_por_par: 1,
                    porcentaje_merma: 0,
                  },
                ]
              : [],
      })),
    });
    const worker = await s.worker(c, null, {
      codigo: "TRA-DEMO",
      nombre_completo: "Operador de demostración",
      tipo_contratacion: "Demostración",
      tarifa_hora_actual: 25,
      estado: "Activo",
      etapas: stages.map((e) => e.etapa_id),
    });
    const day = new Date().toISOString().slice(0, 10);
    const due = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    await s.createOrder(
      c,
      {
        producto_id: product,
        trabajador_id: worker,
        cantidad_planificada: 100,
        inicio_programado: day,
        fin_programado: due,
        prioridad: "Normal",
      },
      "Carga demo",
    );
  });
  console.log("Datos ficticios de demostración cargados.");
}
if (require.main === module) {
  const pool = createPool();
  seed(pool)
    .then(() => (process.argv.includes("--demo") ? demo(pool) : null))
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
module.exports = { seed, demo };
