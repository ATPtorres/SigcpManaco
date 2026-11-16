const {businessDate}=require('./time.cjs');
function plusDays(day,n){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function recommend(order,stages) {
  let quantity=order.cantidad_planificada, minutes=0;
  for(const stage of stages){
    if(stage.estado==='Terminado'){if(stage.conteo_confirmado)quantity=stage.cantidad_aceptada;continue;}
    minutes+=Number(stage.minutos_estimados_por_par||0)*quantity;
  }
  const base=[businessDate(),String(order.inicio_programado).slice(0,10)].sort().at(-1);
  const days=Math.max(1,Math.ceil(minutes/480))+1;
  return {fecha:plusDays(base,days),dias:days,minutos:Math.round(minutes),supuesto:'Estimación de planificación: 8 h/día y 1 día de margen; no incluye colas ni disponibilidad real de personal.'};
}
module.exports={recommend,plusDays};
