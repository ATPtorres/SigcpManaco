const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {z}=require('zod');
const root=path.resolve(__dirname,'..');
const catalog=require('../assets/shoes/catalog.json');
const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s*\(demo\)/gi,'').trim().toLowerCase();
function imageFor(model,color) {return catalog.find(e=>normalize(e.model)===normalize(model) && (!color || normalize(e.color)===normalize(color)))?.src || null;}
function checkImage(url) {
  if(url==null)return;
  if(!/^\/assets\/(?:shoes\/[a-z0-9-]+\.webp|uploads\/[a-f0-9]{32}\.(?:png|jpg|webp))$/.test(url)||!fs.existsSync(path.join(root,url)))
    throw Object.assign(Error('Selecciona una imagen existente de la galería o sube una imagen válida.'),{status:400});
}
const upload=z.object({data:z.string().max(2800000),type:z.enum(['image/png','image/jpeg','image/webp'])}).strict();
function saveUpload(input) {
  const d=upload.parse(input);
  if(!/^[A-Za-z0-9+/]+={0,2}$/.test(d.data))throw Object.assign(Error('Imagen inválida.'),{status:400});
  const bytes=Buffer.from(d.data,'base64');
  const ext=d.type==='image/png'?'png':d.type==='image/jpeg'?'jpg':'webp';
  const valid=ext==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):ext==='jpg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
  if(bytes.length<32||bytes.length>2*1024*1024||!valid)throw Object.assign(Error('Usa PNG, JPG o WebP de hasta 2 MB.'),{status:400});
  fs.mkdirSync(path.join(root,'assets/uploads'),{recursive:true});
  const src=`/assets/uploads/${crypto.randomBytes(16).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(root,src),bytes,{flag:'wx'});
  return src;
}
module.exports={catalog,imageFor,checkImage,saveUpload};
