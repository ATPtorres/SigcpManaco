const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createPool } = require('../server/db.cjs');
const { businessDate } = require('../server/time.cjs');
const { backup } = require('../server/backup.cjs');
async function scheduledBackup(pool, directory = path.resolve('.runtime/backups')) {
  await fs.mkdir(directory,{recursive:true});
  const name=`diario-${businessDate()}.json`, file=path.join(directory,name);
  try {
    const saved=await fs.readFile(file);
    const checksum=(await fs.readFile(file+'.sha256','utf8')).trim();
    if(crypto.createHash('sha256').update(saved).digest('hex')!==checksum) throw Error('La copia diaria no supera la verificación SHA-256.');
    return {file,alreadyCreated:true};
  } catch(e) { if(e.code!=='ENOENT') throw e; }
  const data=JSON.stringify(await backup(pool),null,2)+'\n';
  const temporary=file+'.'+crypto.randomUUID()+'.tmp';
  await fs.writeFile(temporary,data,{flag:'wx',mode:0o600});
  await fs.rename(temporary,file);
  await fs.writeFile(file+'.sha256',crypto.createHash('sha256').update(data).digest('hex')+'\n',{mode:0o600});
  return {file,alreadyCreated:false};
}
if(require.main===module) {
  const pool=createPool();
  scheduledBackup(pool).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>pool.end());
}
module.exports={scheduledBackup};
