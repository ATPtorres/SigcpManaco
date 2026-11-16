const {createPool,transaction}=require('../server/db.cjs');
const {imageFor}=require('../server/images.cjs');
const s=require('../server/service.cjs');
async function assignImages(pool) {
  return transaction(pool,async c=>{
    const models=await s.rows(c,'SELECT * FROM MODELO_CALZADO FOR UPDATE');
    const products=await s.rows(c,'SELECT p.producto_id,p.imagen_url,m.nombre,c.nombre color FROM PRODUCTO_CALZADO p JOIN MODELO_CALZADO m USING(modelo_id) JOIN COLOR c USING(color_id)');
    let modelCount=0,productCount=0;
    for(const m of models){const src=imageFor(m.nombre);if(!m.imagen_url&&src){await s.update(c,'MODELO_CALZADO','modelo_id',m.modelo_id,{imagen_url:src});modelCount++;}}
    for(const p of products){const src=imageFor(p.nombre,p.color);if(!p.imagen_url&&src){await s.update(c,'PRODUCTO_CALZADO','producto_id',p.producto_id,{imagen_url:src});productCount++;}}
    if(modelCount||productCount)await s.insert(c,'AUDITORIA',{accion:`Imágenes generadas asignadas: ${modelCount} modelos, ${productCount} variantes`,actor:'Configuración del catálogo',entidad:'PRODUCTO_CALZADO',motivo:'Asignación por nombre de modelo y color, sin modificar imágenes propias.'});
    return {models:modelCount,products:productCount};
  });
}
if(require.main===module){const pool=createPool();assignImages(pool).then(console.log).catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>pool.end());}
module.exports={assignImages};
