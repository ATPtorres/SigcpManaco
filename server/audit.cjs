const s = require('./service.cjs');
const entities = {
  materials: ['MATERIAL','material_id'], products: ['PRODUCTO_CALZADO','producto_id'],
  models: ['MODELO_CALZADO','modelo_id'],
  orders: ['ORDEN_FABRICACION','orden_id'], 'order-stages': ['DETALLE_ORDEN_ETAPA','detalle_etapa_id'],
  workers: ['TRABAJADOR_ZAPATERO','trabajador_id'], incidents: ['INCIDENCIA_PRODUCCION','incidencia_id'],
  budgets: ['PRESUPUESTO','presupuesto_id'], movements: ['MOVIMIENTO_MATERIAL','movimiento_id'],
  reservations: ['RESERVA_MATERIAL','reserva_id'], labor: ['REGISTRO_MANO_OBRA','registro_id'],
  users: ['USUARIO','usuario_id'], pilot: ['CRITERIO_PILOTO','criterio_id'],
};
function clean(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(clean);
  return Object.fromEntries(Object.entries(value).filter(([k]) => !/password|token|secret/i.test(k)).map(([k,v]) => [k,clean(v)]));
}
async function auditTarget(c, req, value) {
  const parts = req.path.split('/').filter(Boolean);
  const resource = parts[1];
  if(resource==='images')return{entidad:'IMAGEN_PRODUCTO',registro_id:typeof value==='string'?value:null,row:null};
  const definition = Object.hasOwn(entities,resource) ? entities[resource] : null;
  const id = parts[2] !== undefined ? Number(String(parts[2]).replace(/^(MAT|PRD|OP|INC|MOV)-/,'')) : value;
  if (!definition || !Number.isInteger(id) || id < 0) return { entidad: resource || 'api', registro_id: null, row: null };
  const [table,key] = definition;
  const rows = await s.rows(c, `SELECT * FROM ${table} WHERE ${key}=?`,[id]);
  return { entidad: table, registro_id: String(id), row: clean(rows[0] || null) };
}
module.exports = { auditTarget, clean };
