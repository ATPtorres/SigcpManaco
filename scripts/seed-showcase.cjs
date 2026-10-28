const { createPool, transaction } = require('../server/db.cjs');
const s = require('../server/service.cjs');

// Atomic and repeatable: all demo records use their own codes.
async function showcase(pool) {
  return transaction(pool, async c => {
    await s.one(c, 'SELECT bloqueo_id FROM BLOQUEO_MIGRACION WHERE bloqueo_id=1 FOR UPDATE');
    const marker = 'Carga demostración completa SHOWCASE-v1';
    if ((await s.rows(c, 'SELECT 1 FROM AUDITORIA WHERE accion=?', [marker])).length)
      return 'La demostración ya existe; no se duplicaron datos.';
    if ((await s.rows(c, "SELECT 1 FROM MATERIAL WHERE codigo LIKE 'DEMO-S-%'")).length)
      throw Error('Hay datos DEMO-S sin marcador. Revisa la carga antes de continuar.');
    const units = Object.fromEntries((await s.rows(c, 'SELECT * FROM UNIDAD_MEDIDA')).map(r => [r.simbolo, r.unidad_id]));
    const stages = [];
    for (const name of ['Corte', 'Aparado', 'Montado', 'Acabado'])
      stages.push((await s.one(c, 'SELECT etapa_id FROM ETAPA_FABRICACION WHERE nombre=?', [name])).etapa_id);
    const loc = await s.insert(c, 'UBICACION', { codigo: 'DEMO-S-ALM', descripcion: 'Almacén de demostración' });
    const materials = [];
    for (const [i, [name, unit, stock, cost, min]] of [
      ['Cuero negro', 'm²', 900, 35, 50], ['Cuero café', 'm²', 650, 38, 50],
      ['Textil azul', 'm²', 800, 22, 50], ['Suelas', 'pares', 6000, 12, 300],
      ['Plantillas', 'pares', 6000, 4, 300], ['Adhesivo', 'litros', 240, 28, 20],
      ['Hilo', 'metros', 12000, 0.5, 500], ['Cordones', 'pares', 6000, 2, 300],
    ].entries()) {
      const id = await s.saveMaterial(c, null, { codigo: `DEMO-S-M${i+1}`, nombre: `${name} (DEMO)`,
        unidad_id: units[unit], costo_referencia: cost, stock_minimo: min, observacion: 'Stock y costos ficticios de demostración.',
        activo: true, stock_inicial: stock, codigo_lote: `DEMO-S-L${i+1}`, ubicacion_id: loc });
      materials.push({ id, unit: units[unit], cost, name });
    }
    const products = [];
    for (const [i, [name, line, color, outer]] of [
      ['Clásico ejecutivo', 'Formal', 'Negro', 0], ['Urban casual', 'Casual', 'Café', 1],
      ['Sport active', 'Deportivo', 'Azul', 2], ['Escolar clásico', 'Escolar', 'Negro', 0],
    ].entries()) {
      const model = await s.insert(c, 'MODELO_CALZADO', { codigo: `DEMO-S-MOD${i+1}`, nombre: `${name} (DEMO)`,
        linea_id: (await s.one(c, 'SELECT linea_id FROM LINEA_CALZADO WHERE nombre=?', [line])).linea_id,
        descripcion: 'Modelo ficticio para practicar el circuito completo.' });
      const colorId = (await s.one(c, 'SELECT color_id FROM COLOR WHERE nombre=?', [color])).color_id;
      const recipe = [[[outer, .22, 3]], [[6, .4, 2]], [[3, 1, 0], [4, 1, 0], [5, .04, 0]], [[7, 1, 0]]];
      for (const size of ['38', '40']) {
        const id = await s.saveProduct(c, null, { sku: `DEMO-S-P${i+1}-${size}`, modelo_id: model,
          talla_id: (await s.one(c, "SELECT talla_id FROM TALLA WHERE sistema='EU' AND valor=?", [size])).talla_id,
          color_id: colorId, activo: true, etapas: stages.map((stage, j) => ({ etapa_id: stage, secuencia: j+1,
            minutos_estimados_por_par: 2, costo_mano_obra_estimado_por_par: 1,
            materiales: recipe[j].map(([m, qty, loss]) => ({ material_id: materials[m].id, cantidad_neta_por_par: qty, porcentaje_merma: loss })) })) });
        products.push({ id, recipe });
      }
    }
    const workers = [];
    for (let i=0; i<4; i++) workers.push(await s.worker(c, null, { codigo: `DEMO-S-T${i+1}`,
      nombre_completo: `Operador ${i+1} (DEMO)`, tipo_contratacion: 'Demostración', tarifa_hora_actual: 30,
      estado: 'Activo', etapas: stages }));
    const actor = 'Carga demostración';
    const day = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/La_Paz'}).format(new Date());
    for (let i=0; i<10; i++) {
      const product = products[i % products.length], worker = workers[i % 4], qty = 40 + (i % 4)*10, status = i % 5;
      const due = new Date(`${day}T12:00:00Z`); due.setUTCDate(due.getUTCDate()+i+3);
      const until = due.toISOString().slice(0,10);
      const order = await s.createOrder(c, { producto_id: product.id, trabajador_id: worker, cantidad_planificada: qty,
        inicio_programado: day, fin_programado: until, prioridad: i%3===0 ? 'Alta' : 'Normal' }, actor);
      await s.update(c, 'ORDEN_FABRICACION', 'orden_id', order, {numero_orden: `DEMO-S-OP${String(i+1).padStart(3,'0')}`});
      const steps = await s.rows(c, 'SELECT d.detalle_etapa_id FROM DETALLE_ORDEN_ETAPA d JOIN FICHA_ETAPA f USING(ficha_etapa_id) WHERE orden_id=? ORDER BY secuencia', [order]);
      await s.budget(c, {orden_id: order, nombre: `Presupuesto DEMO ${i+1}`, fecha_emision: day, vigente_desde: day,
        vigente_hasta: until, porcentaje_contingencia: 10, estado_aprobacion: 'Borrador',
        detalles: [...product.recipe.flat().map(([m,q,loss]) => ({concepto: `${materials[m].name} DEMO`, tipo_costo: 'Material',
          unidad_id: materials[m].unit, cantidad: Number((q*(1+loss/100)*qty).toFixed(4)), costo_unitario_estimado: materials[m].cost})),
          {concepto: 'Mano de obra estimada DEMO', tipo_costo: 'Mano de obra', unidad_id: units.h, cantidad: Number((qty*8/60).toFixed(4)), costo_unitario_estimado: 30}] });
      if (!status) {
        const [m,q,loss] = product.recipe[0][0];
        const lot = await s.one(c, 'SELECT e.existencia_id FROM EXISTENCIA_MATERIAL e JOIN LOTE_MATERIAL l USING(lote_id) WHERE l.material_id=?', [materials[m].id]);
        await s.reserve(c, {detalle_etapa_id: steps[0].detalle_etapa_id, existencia_id: lot.existencia_id, cantidad_pendiente: Number((q*(1+loss/100)*qty).toFixed(4))});
        continue;
      }
      await s.advance(c, order, {estado_esperado: 'Pendiente'}, actor);
      for (let j=0; j<(status===1 ? 1 : steps.length); j++) {
        const detail = steps[j].detalle_etapa_id;
        if (j) await s.startStage(c, detail, actor);
        await s.labor(c, {detalle_etapa_id: detail, trabajador_id: worker, fecha: day, horas_trabajadas: Number((qty*2/60).toFixed(2))});
        if (status===2 && j===0) {
          const data = {detalle_etapa_id: detail, tipo: 'Ajuste de corte DEMO', descripcion: 'Caso ficticio: alineación del patrón.',
            responsable_id: worker, severidad: 'Baja', costo_estimado_impacto: null, estado: 'Abierta', resolucion: ''};
          const incident = await s.incident(c, null, data);
          await s.incident(c, incident, {...data, estado: 'Resuelta', resolucion: 'DEMO: patrón ajustado y verificado.'});
        }
        if (status!==1) await s.finishStage(c, detail, {cantidad_aceptada: qty, cantidad_rechazada: 0}, actor);
      }
      if (status>=2) await s.advance(c, order, {estado_esperado: 'En producción'}, actor);
      if (status>=3) await s.advance(c, order, {estado_esperado: 'Control de calidad', evidencia: 'DEMO: inspección ficticia de costuras, pegado, tallas y acabado conforme.'}, actor);
      if (status>=4) await s.advance(c, order, {estado_esperado: 'Terminado'}, actor);
    }
    await s.insert(c, 'AUDITORIA', {accion: marker, actor});
    return 'Creados: 4 modelos, 8 variantes, 8 materiales, 4 trabajadores, 10 órdenes, 10 presupuestos y 2 incidencias resueltas.';
  });
}
if (require.main === module) {
  const pool = createPool();
  showcase(pool).then(console.log).catch(e => {console.error(e.message); process.exitCode=1;}).finally(() => pool.end());
}
module.exports = { showcase };
