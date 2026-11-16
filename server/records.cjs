const { z } = require('zod');
const { transaction } = require('./db.cjs');
const s = require('./service.cjs');
const query = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(120).default(''),
  order: z.coerce.number().int().positive().optional(),
  state: z.enum(['Pendiente','En producción','Control de calidad','Terminado','Despachado']).optional(),
}).strict();
const definitions = {
  orders: {from:'ORDEN_FABRICACION', key:'orden_id', text:'numero_orden'},
  movements: {from:'MOVIMIENTO_MATERIAL', key:'movimiento_id', text:'motivo'},
  history: {from:'HISTORIAL_ORDEN', key:'historial_id', text:'descripcion'},
  audit: {from:'AUDITORIA', key:'auditoria_id', text:'accion'},
};
function records(pool) {
  return async (req,res) => {
    const def = Object.hasOwn(definitions,req.params.type) ? definitions[req.params.type] : null;
    if (!def) s.fail('Registro desconocido.',404);
    if (req.params.type === 'audit' && req.user.rol !== 'Administrador') s.fail('Se requiere administrador.',403);
    const d = query.parse(req.query), filters=[], args=[];
    if (d.q) { filters.push(`${def.text} LIKE ?`); args.push('%'+d.q.replace(/[!%_]/g, '!$&')+'%'); }
    if (d.q) filters[filters.length-1] += " ESCAPE '!'";
    if (d.order) {
      if (req.params.type !== 'history') s.fail('Filtro de orden no permitido.',400);
      filters.push('orden_id=?'); args.push(d.order);
    }
    if (d.state) {
      if (req.params.type !== 'orders') s.fail('Filtro de estado no permitido.',400);
      filters.push('estado=?'); args.push(d.state);
    }
    const where=filters.length ? ' WHERE '+filters.join(' AND ') : '';
    const result=await transaction(pool,async c=>{
      const {total}=await s.one(c,`SELECT COUNT(*) total FROM ${def.from}${where}`,args);
      const items=await s.rows(c,`SELECT * FROM ${def.from}${where} ORDER BY ${def.key} DESC LIMIT ${d.limit} OFFSET ${(d.page-1)*d.limit}`,args);
      return {items,total,page:d.page,limit:d.limit,pages:Math.ceil(total/d.limit)};
    },'REPEATABLE READ');
    res.json(result);
  };
}
module.exports = { records };
