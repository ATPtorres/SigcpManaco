const {spawn} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {createPool} = require('../server/db.cjs');
const {scheduledBackup} = require('./backup-scheduled.cjs');
const root=path.resolve(__dirname,'..');
process.chdir(root);
fs.mkdirSync('.runtime',{recursive:true});
const lockFile=path.join(root,'.runtime/supervisor.lock');
try {fs.writeFileSync(lockFile,String(process.pid),{flag:'wx'});}
catch(e) {
  if(e.code!=='EEXIST')throw e;
  const previous=Number(fs.readFileSync(lockFile,'utf8'));
  let alive=false;
  if(Number.isInteger(previous)&&previous>0)try{process.kill(previous,0);alive=true;}catch{}
  if(alive){console.error('Ya hay un supervisor activo.');process.exit(1);}
  fs.unlinkSync(lockFile);fs.writeFileSync(lockFile,String(process.pid),{flag:'wx'});
}
process.on('exit',()=>{try{if(fs.readFileSync(lockFile,'utf8')===String(process.pid))fs.unlinkSync(lockFile);}catch{}});
let child, stopping=false, failures=0, timer, checking=false, restarts=0, startedAt;
const log=(level,event,extra={})=>console.log(JSON.stringify({time:new Date().toISOString(),level,event,...extra}));
function status(extra={}) {
  fs.writeFileSync('.runtime/supervisor-status.json',JSON.stringify({supervisorPid:process.pid,serverPid:child?.pid,startedAt,restarts,checkedAt:new Date().toISOString(),...extra}));
}
function start() {
  if(stopping)return;
  startedAt=new Date().toISOString();
  child=spawn(process.execPath,['server/index.cjs'],{cwd:root,windowsHide:true,stdio:'inherit',env:{...process.env,REQUEST_LOG:'true'}});
  fs.writeFileSync('.runtime/backend-process.pid',String(child.pid));
  log('info','backend_started',{pid:child.pid,restarts});status({healthy:false});
  setTimeout(check,3000);
  child.on('error',e=>log('error','spawn_failed',{code:e.code}));
  child.on('exit',(code,signal)=>{
    if(stopping)return;
    restarts++; log('error','backend_exited',{code,signal,restarts});status({healthy:false});
    timer=setTimeout(start,Math.min(30000,1000*2**Math.min(restarts,5)));
  });
}
async function check() {
  if(checking||stopping)return; checking=true;
  try {
    const response=await fetch(`http://127.0.0.1:${process.env.PORT||3000}/api/health`,{signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw Error('health_'+response.status);
    failures=0;status({healthy:true});
    const pool=createPool();
    try {const result=await scheduledBackup(pool);if(!result.alreadyCreated)log('info','daily_backup_created',{file:result.file});}
    catch(e){log('error','daily_backup_failed',{message:e.message});}
    finally {await pool.end();}
  } catch(e) {
    failures++;log('error','health_failed',{failures,message:e.message});status({healthy:false,failures});
    // A live server with a database outage reports 503; restarting it cannot repair MySQL.
    if(failures>=3 && !e.message.startsWith('health_503') && child?.exitCode===null) child.kill();
  } finally {checking=false;}
}
function close(){stopping=true;clearTimeout(timer);clearInterval(interval);child?.kill();setTimeout(()=>process.exit(0),1000);}
process.on('SIGINT',close);process.on('SIGTERM',close);
const interval=setInterval(check,60000);
fs.writeFileSync('.runtime/supervisor-process.pid',String(process.pid));
start();
