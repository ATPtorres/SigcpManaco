"use strict";
const $ = selector => document.querySelector(selector);
const storageKey = 'manaco-observaciones-v1';
const tasks = {
  order: ['Encontrar una orden y explicar su siguiente paso', 'Éxito: identifica la orden solicitada, su estado y la siguiente acción sin ejecutarla.'],
  material: ['Consultar material disponible y reconocer un faltante', 'Éxito: encuentra el material indicado y distingue existencias, reservas y disponibilidad.'],
  create: ['Crear una orden con datos de prueba', 'Éxito: guarda una orden válida con el producto, responsable y fechas preparados por el observador.'],
  incident: ['Resolver una incidencia con evidencia de prueba', 'Éxito: encuentra la incidencia de prueba y registra una solución válida.'],
  report: ['Filtrar un reporte y exportar sus resultados', 'Éxito: aplica el período solicitado y descarga el reporte correspondiente.'],
};
let records = [], active = null, timer = null;
const authorized = () => $('#test-environment').checked && $('#observation-consent').checked;
const announce = message => { $('#evaluation-status').textContent = message; };
function metric(label, value) { const div = document.createElement('div'); const strong = document.createElement('strong'); strong.textContent = value; div.append(strong, document.createTextNode(label)); return div; }
function render() {
  const completed = records.filter(r => r.outcome !== 'incomplete').length;
  const helps = records.reduce((sum,r) => sum + r.helps,0);
  $('#evaluation-metrics').replaceChildren(metric('tareas observadas', records.length), metric('finalizadas', records.length ? Math.round(completed/records.length*100) + '%' : 'Sin medir'), metric('ayudas registradas', records.length ? helps : 'Sin medir'));
  const content = $('#evaluation-results'); content.replaceChildren();
  if (!records.length) { const p = document.createElement('p'); p.textContent = 'Todavía no hay observaciones autorizadas en esta sesión.'; content.append(p); }
  for (const [task, [name]] of Object.entries(tasks)) {
    const rows = records.filter(r => r.task === task); if (!rows.length) continue;
    const article = document.createElement('article'); article.className = 'observation';
    const h = document.createElement('h3'); h.textContent = name;
    const p = document.createElement('p'); const successful = rows.filter(r => r.outcome !== 'incomplete');
    p.textContent = `${successful.length} de ${rows.length} finalizadas · ${rows.filter(r=>r.outcome==='independent').length} sin ayuda · ${rows.reduce((n,r)=>n+r.helps,0)} ayudas. Tiempo medio en tareas finalizadas: ${successful.length ? Math.round(successful.reduce((n,r)=>n+r.seconds,0)/successful.length)+' s' : 'Sin medir'}.`;
    article.append(h,p);
    for (const record of rows) { const note = document.createElement('p'); note.textContent = `${record.participant} · ${record.device} · ${{independent:'Sin ayuda',assisted:'Con ayuda',incomplete:'No completada'}[record.outcome]} · ${record.seconds} s${record.note ? ' · '+record.note : ''}`; article.append(note); }
    content.append(article);
  }
  $('#start-task').disabled = !authorized() || !!active;
  $('#export-observations').disabled = !authorized() || !records.length;
  $('#active-task').hidden = !active;
  for (const control of $('#observation-form').elements) control.disabled = !authorized();
  $('#record-help').disabled = !authorized();
}
function persist(next) {
  try { localStorage.setItem(storageKey, JSON.stringify(next)); records = next; return true; }
  catch { announce('No se pudo guardar en este navegador. Conserva la tarea abierta e intenta de nuevo; no se confirmó el registro.'); return false; }
}
function stop() { clearInterval(timer); active = null; render(); }
function consentChanged() {
  if (active && !authorized()) { stop(); announce('Evaluación pausada; la tarea en curso se descartó sin guardar. Los registros anteriores siguen almacenados hasta que los borres.'); }
  if (authorized()) {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (!Array.isArray(saved) || saved.length > 1000 || saved.some(r => !tasks[r.task] || !['independent','assisted','incomplete'].includes(r.outcome) || !Number.isFinite(r.seconds) || r.seconds < 0 || !Number.isInteger(r.helps) || r.helps < 0 || typeof r.participant !== 'string' || typeof r.device !== 'string' || typeof r.note !== 'string')) throw Error();
      records = saved;
    } catch { records = []; announce('No se pudieron leer los registros. Puedes borrarlos para comenzar de nuevo.'); }
  } else records = [];
  render();
}
$('#test-environment').addEventListener('change',consentChanged);
$('#observation-consent').addEventListener('change',consentChanged);
$('#test-task').onchange = () => { $('#task-criterion').textContent = tasks[$('#test-task').value][1]; };
$('#test-task').onchange();
$('#start-task').onclick = () => {
  if (!authorized() || active) return;
  if (records.length >= 1000) return announce('Exporta y borra los registros antes de iniciar más tareas. Límite: 1.000 observaciones por navegador.');
  active = {task:$('#test-task').value,participant:$('#participant').value.trim() || 'P-'+crypto.randomUUID().slice(0,8),device:$('#test-device').value,started:performance.now(),helps:0};
  $('#active-description').textContent = tasks[active.task][0]; $('#observation-note').value = ''; $('#task-outcome').value = 'independent'; $('#help-count').textContent = '0 ayudas registradas';
  const tick = () => { $('#task-timer').textContent = 'Tiempo transcurrido: '+Math.floor((performance.now()-active.started)/1000)+' s'; }; tick(); timer = setInterval(tick,1000);
  render(); $('#active-title').tabIndex = -1; $('#active-title').focus();
};
$('#record-help').onclick = () => { if (!active || !authorized()) return; active.helps++; $('#help-count').textContent = active.helps+' ayudas registradas'; if ($('#task-outcome').value === 'independent') $('#task-outcome').value = 'assisted'; };
$('#observation-form').onsubmit = event => {
  event.preventDefault(); if (!active || !authorized()) return;
  const {started,...data} = active;
  const outcome = $('#task-outcome').value === 'independent' && active.helps ? 'assisted' : $('#task-outcome').value;
  const record = {...data,helps:outcome==='assisted'?Math.max(1,data.helps):data.helps,at:new Date().toISOString(),seconds:Math.round((performance.now()-started)/1000),outcome,note:$('#observation-note').value.trim()};
  if (!persist([...records,record])) return;
  stop(); announce('Observación guardada solo en este navegador.'); $('#start-task').focus();
};
$('#cancel-task').onclick = () => { stop(); announce('Tarea descartada, sin guardar.'); $('#start-task').focus(); };
$('#export-observations').onclick = () => {
  if (!authorized() || !records.length) return;
  const blob = new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),scope:'Observaciones manuales; no equivalen a validación con toda la población.',observations:records},null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'evaluacion-manaco.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
};
$('#clear-observations').onclick = () => { $('#clear-confirmation').hidden = false; $('#confirm-clear').focus(); };
$('#cancel-clear').onclick = () => { $('#clear-confirmation').hidden = true; $('#clear-observations').focus(); };
$('#confirm-clear').onclick = () => {
  try { localStorage.removeItem(storageKey); records = []; stop(); $('#clear-confirmation').hidden = true; announce('Registros eliminados de este navegador.'); $('#clear-observations').focus(); }
  catch { announce('No se pudo borrar el almacenamiento del navegador.'); }
};
window.addEventListener('beforeunload', event => { if(active){event.preventDefault();event.returnValue='';} });
render();
