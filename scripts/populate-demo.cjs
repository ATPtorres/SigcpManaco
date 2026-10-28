const { createPool, transaction } = require("../server/db.cjs");
const s = require("../server/service.cjs");
const MARKER = "Carga DEMO-POB-V1 completada";
const PREFIX = "DEMO-POB-";
const round = (n) => Math.round(n * 10000) / 10000;
async function populateDemo(pool) {
  return transaction(pool, async (c) => {
    await s.one(
      c,
      "SELECT bloqueo_id FROM BLOQUEO_MIGRACION WHERE bloqueo_id=1 FOR UPDATE",
    );
    if (
      (
        await s.rows(c, "SELECT auditoria_id FROM AUDITORIA WHERE accion=?", [
          MARKER,
        ])
      ).length
    )
      return { alreadyCreated: true };
    for (const [table, column] of [
      ["MATERIAL", "codigo"],
      ["MODELO_CALZADO", "codigo"],
      ["PRODUCTO_CALZADO", "sku"],
      ["ORDEN_FABRICACION", "numero_orden"],
      ["TRABAJADOR_ZAPATERO", "codigo"],
      ["UBICACION", "codigo"],
    ]) {
      if (
        (
          await s.rows(
            c,
            `SELECT ${column} FROM ${table} WHERE ${column} LIKE ? LIMIT 1`,
            [PREFIX + "%"],
          )
        ).length
      )
        s.fail(
          "Ya existen códigos DEMO-POB sin una carga confirmada. No se sobrescribieron datos.",
        );
    }
    const actor = "Carga ficticia de demostración";
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/La_Paz",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const date = (offset) => {
      const d = new Date(day + "T12:00:00Z");
      d.setUTCDate(d.getUTCDate() + offset);
      return d.toISOString().slice(0, 10);
    };
    async function ref(table, key, value, extra = {}) {
      const found = await s.rows(c, `SELECT * FROM ${table} WHERE ${key}=?`, [
        value,
      ]);
      if (found.length) return found[0];
      await s.insert(c, table, { [key]: value, ...extra });
      return s.one(c, `SELECT * FROM ${table} WHERE ${key}=?`, [value]);
    }
    const units = {};
    for (const [nombre, simbolo] of [
      ["Metro cuadrado", "m²"],
      ["Par", "pares"],
      ["Litro", "litros"],
      ["Metro", "metros"],
      ["Unidad", "unidades"],
      ["Hora", "h"],
    ])
      units[simbolo] = (
        await ref("UNIDAD_MEDIDA", "simbolo", simbolo, { nombre })
      ).unidad_id;
    const stages = [];
    for (const nombre of ["Corte", "Aparado", "Montado", "Acabado"])
      stages.push(
        (
          await ref("ETAPA_FABRICACION", "nombre", nombre, {
            descripcion: "Etapa de fabricación de calzado",
          })
        ).etapa_id,
      );
    const lines = {};
    for (const nombre of [
      "Formal",
      "Casual",
      "Deportivo",
      "Escolar",
      "Industrial",
    ])
      lines[nombre] = (await ref("LINEA_CALZADO", "nombre", nombre)).linea_id;
    const colors = [];
    for (const [nombre, tono] of [
      ["Negro", "#263344"],
      ["Café", "#98745a"],
      ["Azul", "#365b83"],
      ["Blanco", "#e4e8ed"],
      ["Gris", "#687383"],
    ])
      colors.push((await ref("COLOR", "nombre", nombre, { tono })).color_id);
    const sizes = [];
    for (const valor of ["36", "39", "42"]) {
      await c.execute(
        "INSERT INTO TALLA(sistema,valor) VALUES('EU',?) ON DUPLICATE KEY UPDATE talla_id=LAST_INSERT_ID(talla_id)",
        [valor],
      );
      sizes.push(
        (
          await s.one(
            c,
            "SELECT talla_id FROM TALLA WHERE sistema='EU' AND valor=?",
            [valor],
          )
        ).talla_id,
      );
    }
    const locations = [];
    for (const [i, descripcion] of [
      "Materia prima",
      "Componentes",
      "Recepción",
    ].entries())
      locations.push(
        await s.insert(c, "UBICACION", {
          codigo: PREFIX + "ALM-" + (i + 1),
          descripcion: descripcion + " · ubicación ficticia de demostración",
        }),
      );
    const specs = [
      ["Cuero negro", "m²", 35, 2000, 100],
      ["Cuero café", "m²", 38, 2000, 100],
      ["Textil azul", "m²", 22, 2000, 100],
      ["Suelas de caucho", "pares", 12, 5000, 200],
      ["Plantillas acolchadas", "pares", 5, 5000, 200],
      ["Adhesivo de montaje", "litros", 28, 500, 30],
      ["Hilo de poliéster", "metros", 0.35, 15000, 1000],
      ["Cordones", "pares", 2.5, 5000, 200],
      ["Hebillas", "unidades", 1.8, 3000, 100],
      ["Cajas de empaque", "unidades", 3, 5000, 300],
      ["Refuerzo termoplástico", "m²", 18, 30, 50],
      ["Pigmento de acabado", "litros", 45, 5, 20],
    ];
    const materials = [];
    for (const [i, [name, unit, cost, stock, min]] of specs.entries()) {
      const codigo = PREFIX + "MAT-" + String(i + 1).padStart(2, "0");
      const material = await s.saveMaterial(c, null, {
        codigo,
        nombre: name + " (demo)",
        unidad_id: units[unit],
        costo_referencia: cost,
        stock_minimo: min,
        observacion:
          "Registro ficticio para demostración; no pertenece a los materiales originales migrados.",
        activo: true,
        stock_inicial: stock,
        codigo_lote: PREFIX + "LOTE-" + String(i + 1).padStart(2, "0") + "-A",
        ubicacion_id: locations[i % 2],
      });
      materials.push(material);
      if (i < 8)
        await s.movement(c, {
          material_id: material,
          tipo_movimiento: "Entrada",
          cantidad: stock * 0.1,
          costo_unitario_aplicado: round(cost * 1.05),
          codigo_lote: PREFIX + "LOTE-" + String(i + 1).padStart(2, "0") + "-B",
          ubicacion_id: locations[2],
          motivo: "Recepción ficticia del segundo lote de demostración",
        });
    }
    for (const i of [10, 11])
      await s.movement(c, {
        material_id: materials[i],
        tipo_movimiento: "Salida",
        cantidad: i === 10 ? 1 : 0.5,
        costo_unitario_aplicado: specs[i][2],
        codigo_lote: PREFIX + "LOTE-" + String(i + 1).padStart(2, "0") + "-A",
        ubicacion_id: locations[i % 2],
        motivo:
          "Salida de muestra ficticia; saldo bajo mínimo intencional para mostrar alertas",
      });
    const workerNames = [
      "Camila Ríos",
      "Diego Salazar",
      "Elena Quispe",
      "Fabio Molina",
      "Gabriela Condori",
      "Hugo Álvarez",
      "Irene Paredes",
      "Javier Mamani",
      "Karina Flores",
      "Leo Vargas",
      "Mónica Torres",
      "Nicolás Arce",
    ];
    const workers = [];
    for (const [i, name] of workerNames.entries())
      workers.push(
        await s.worker(c, null, {
          codigo: PREFIX + "TRA-" + String(i + 1).padStart(2, "0"),
          nombre_completo: name + " (demo)",
          tipo_contratacion: "Demostración ficticia",
          tarifa_hora_actual: 18 + i * 1.5,
          estado: "Activo",
          etapas: stages,
        }),
      );
    const modelSpecs = [
      ["Oxford Andino", "Formal"],
      ["Mocasín Urbano", "Formal"],
      ["Botín Caminante", "Casual"],
      ["Zapatilla Activa", "Deportivo"],
      ["Escolar Resistente", "Escolar"],
      ["Bota de Trabajo", "Industrial"],
      ["Casual Ligero", "Casual"],
      ["Deportivo Flexible", "Deportivo"],
    ];
    const products = [];
    const recipes = new Map();
    for (const [i, [name, line]] of modelSpecs.entries()) {
      const model = await s.insert(c, "MODELO_CALZADO", {
        codigo: PREFIX + "MOD-" + String(i + 1).padStart(2, "0"),
        nombre: name + " (demo)",
        linea_id: lines[line],
        descripcion:
          "Modelo ficticio con receta de demostración en cuatro etapas.",
      });
      const recipe = [
        [
          {
            material_id: materials[i % 3],
            cantidad_neta_por_par: 0.2 + i * 0.005,
            porcentaje_merma: 5,
          },
        ],
        [
          {
            material_id: materials[6],
            cantidad_neta_por_par: 0.8,
            porcentaje_merma: 2,
          },
          ...(i === 1
            ? []
            : [
                {
                  material_id: materials[7],
                  cantidad_neta_por_par: 1,
                  porcentaje_merma: 0,
                },
              ]),
        ],
        [
          {
            material_id: materials[3],
            cantidad_neta_por_par: 1,
            porcentaje_merma: 0,
          },
          {
            material_id: materials[4],
            cantidad_neta_por_par: 1,
            porcentaje_merma: 0,
          },
          {
            material_id: materials[5],
            cantidad_neta_por_par: 0.035,
            porcentaje_merma: 3,
          },
        ],
        [
          {
            material_id: materials[9],
            cantidad_neta_por_par: 1,
            porcentaje_merma: 0,
          },
          ...(i % 3 === 0
            ? [
                {
                  material_id: materials[8],
                  cantidad_neta_por_par: 2,
                  porcentaje_merma: 0,
                },
              ]
            : []),
        ],
      ];
      for (const [sizeIndex, talla_id] of sizes.entries())
        for (let colorIndex = 0; colorIndex < 2; colorIndex++) {
          const product = await s.saveProduct(c, null, {
            sku:
              PREFIX +
              "SKU-" +
              String(i + 1).padStart(2, "0") +
              "-" +
              ["36", "39", "42"][sizeIndex] +
              "-" +
              colorIndex,
            modelo_id: model,
            talla_id,
            color_id: colors[(i + colorIndex) % colors.length],
            activo: true,
            etapas: stages.map((etapa_id, j) => ({
              etapa_id,
              secuencia: j + 1,
              minutos_estimados_por_par: 2 + j * 0.75,
              costo_mano_obra_estimado_por_par: round(
                ((2 + j * 0.75) * 25) / 60,
              ),
              materiales: recipe[j],
            })),
          });
          products.push(product);
          recipes.set(product, recipe);
        }
    }
    for (let i = 0; i < 20; i++) {
      const product = products[(i * 7) % products.length],
        quantity = 24 + i * 4,
        target = i % 5,
        worker = workers[i % workers.length];
      const order = await s.createOrder(
        c,
        {
          producto_id: product,
          trabajador_id: worker,
          cantidad_planificada: quantity,
          inicio_programado: date((i % 7) - 3),
          fin_programado: date(5 + (i % 7)),
          prioridad: i % 3 === 0 ? "Alta" : "Normal",
        },
        actor,
      );
      await s.update(c, "ORDEN_FABRICACION", "orden_id", order, {
        numero_orden: PREFIX + "OF-" + String(i + 1).padStart(2, "0"),
      });
      const steps = await s.rows(
        c,
        "SELECT d.*,f.secuencia FROM DETALLE_ORDEN_ETAPA d JOIN FICHA_ETAPA f USING(ficha_etapa_id) WHERE orden_id=? ORDER BY secuencia",
        [order],
      );
      const recipe = recipes.get(product);
      if (target > 0) {
        await s.advance(c, order, { estado_esperado: "Pendiente" }, actor);
        const pauseAt = Math.floor(i / 5) % 4;
        for (const [j, step] of steps.entries()) {
          if (j > 0) await s.startStage(c, step.detalle_etapa_id, actor);
          await s.labor(c, {
            detalle_etapa_id: step.detalle_etapa_id,
            trabajador_id: worker,
            fecha: day,
            horas_trabajadas: 0.5 + (j % 2) * 0.25,
          });
          if (target === 1 && j === pauseAt) {
            await s.incident(c, null, {
              detalle_etapa_id: step.detalle_etapa_id,
              tipo: i % 2 ? "Ajuste de máquina" : "Verificación de material",
              descripcion:
                "Incidencia ficticia pendiente para practicar la atención y resolución.",
              responsable_id: worker,
              severidad: i % 2 ? "Media" : "Alta",
              costo_estimado_impacto: 15 + i,
              estado: i % 2 ? "En atención" : "Abierta",
              resolucion:
                i % 2 ? "Ejemplo: revisión iniciada; solución pendiente." : "",
            });
            break;
          }
          if (j === 1 && i % 3 === 0) {
            const issue = {
              detalle_etapa_id: step.detalle_etapa_id,
              tipo: "Calidad de costura",
              descripcion:
                "Caso ficticio de costura que requiere ajuste antes del cierre.",
              responsable_id: worker,
              severidad: "Baja",
              costo_estimado_impacto: 5,
              estado: "Abierta",
              resolucion: "",
            };
            const id = await s.incident(c, null, issue);
            await s.incident(c, id, {
              ...issue,
              estado: "Resuelta",
              resolucion:
                "Ejemplo ficticio: tensión ajustada y muestra revisada.",
            });
          }
          const rejected = j === 3 && i % 3 === 0 ? 2 : 0;
          await s.finishStage(
            c,
            step.detalle_etapa_id,
            {
              cantidad_aceptada: quantity - rejected,
              cantidad_rechazada: rejected,
            },
            actor,
          );
        }
        if (target >= 2) {
          await s.advance(
            c,
            order,
            { estado_esperado: "En producción" },
            actor,
          );
          if (target === 2 && Math.floor(i / 5) % 2 === 0)
            await s.incident(c, null, {
              detalle_etapa_id: steps[3].detalle_etapa_id,
              tipo: "Inspección final",
              descripcion:
                "Ejemplo ficticio de inspección pendiente que bloquea el cierre de calidad.",
              responsable_id: worker,
              severidad: "Media",
              costo_estimado_impacto: null,
              estado: "Abierta",
              resolucion: "",
            });
          if (target >= 3)
            await s.advance(
              c,
              order,
              {
                estado_esperado: "Control de calidad",
                evidencia:
                  "DATOS FICTICIOS: lote de demostración revisado; cantidades por etapa registradas.",
              },
              actor,
            );
          if (target === 4)
            await s.advance(c, order, { estado_esperado: "Terminado" }, actor);
        }
      }
      if (target === 0 || target === 1) {
        const pending = (
          await s.rows(
            c,
            "SELECT d.* FROM DETALLE_ORDEN_ETAPA d JOIN FICHA_ETAPA f USING(ficha_etapa_id) WHERE orden_id=? AND d.estado='Pendiente' ORDER BY secuencia LIMIT 1",
            [order],
          )
        )[0];
        if (pending) {
          const requirement = await s.one(
            c,
            "SELECT * FROM REQUERIMIENTO_MATERIAL WHERE orden_id=? AND ficha_etapa_id=? ORDER BY material_id LIMIT 1",
            [order, pending.ficha_etapa_id],
          );
          const lot = await s.one(
            c,
            "SELECT e.existencia_id FROM EXISTENCIA_MATERIAL e JOIN LOTE_MATERIAL l USING(lote_id) WHERE material_id=? ORDER BY e.existencia_id LIMIT 1",
            [requirement.material_id],
          );
          await s.reserve(c, {
            detalle_etapa_id: pending.detalle_etapa_id,
            existencia_id: lot.existencia_id,
            cantidad_pendiente: round(
              requirement.cantidad_neta_por_par *
                (1 + requirement.porcentaje_merma / 100) *
                quantity *
                0.5,
            ),
          });
        }
      }
      const totals = new Map();
      for (const stage of recipe)
        for (const r of stage)
          totals.set(
            r.material_id,
            round(
              (totals.get(r.material_id) || 0) +
                r.cantidad_neta_por_par *
                  (1 + r.porcentaje_merma / 100) *
                  quantity,
            ),
          );
      const details = [...totals].map(([id, cantidad]) => {
        const index = materials.indexOf(id);
        return {
          concepto: specs[index][0] + " (demo)",
          tipo_costo: "Material",
          unidad_id: units[specs[index][1]],
          cantidad,
          costo_unitario_estimado: specs[index][2],
        };
      });
      details.push({
        concepto: "Mano de obra estimada (demo)",
        tipo_costo: "Mano de obra",
        unidad_id: units.h,
        cantidad: round((quantity * 12.5) / 60),
        costo_unitario_estimado: 18 + (i % workers.length) * 1.5,
      });
      const budget = {
        orden_id: order,
        nombre:
          "Presupuesto ficticio " +
          PREFIX +
          "OF-" +
          String(i + 1).padStart(2, "0"),
        fecha_emision: day,
        vigente_desde: day,
        vigente_hasta: date(30),
        porcentaje_contingencia: 10,
        estado_aprobacion: ["Borrador", "Aprobado", "Rechazado"][i % 3],
        detalles: details,
      };
      await s.budget(c, budget);
      if (i < 2)
        await s.budget(c, {
          ...budget,
          nombre: budget.nombre + " · revisión",
          porcentaje_contingencia: 12,
          estado_aprobacion: "Borrador",
        });
    }
    for (let i = 0; i < 10; i++)
      if (
        !(
          await s.rows(
            c,
            "SELECT criterio_id FROM CRITERIO_PILOTO WHERE criterio_id=?",
            [i],
          )
        ).length
      )
        await s.insert(c, "CRITERIO_PILOTO", {
          criterio_id: i,
          validado: false,
          evidencia:
            "Evidencia ficticia de demostración para el criterio " +
            (i + 1) +
            ". Pendiente de validación real; no constituye aprobación.",
        });
    await s.insert(c, "AUDITORIA", { accion: MARKER, actor });
    return {
      alreadyCreated: false,
      materials: materials.length,
      models: modelSpecs.length,
      variants: products.length,
      workers: workers.length,
      orders: 20,
      budgets: 22,
    };
  });
}
if (require.main === module) {
  const pool = createPool();
  populateDemo(pool)
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
module.exports = { populateDemo, MARKER, PREFIX };
