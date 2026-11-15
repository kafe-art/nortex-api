import {api, post, evaluar, olvidar, API} from './api.js';
import {$, $$, esc, iso, masDias, errorHtml} from './util.js';
import {montarResultados, opciones, leerOpciones, cultivoSVG} from './evaluaciones.js';
import {iniciarMapa, mostrarParcela, cargarClima, cargarChequeo, cargarFuentes} from './territorio.js';
import {iniciarDemo} from './demo.js';
export const estado={parcela:localStorage.getItem('nortexParcela')||'',parcelas:[],cultivos:[],escenario:'deficit_medio',cultivo:'caupi',tab:'mapa',version:0};
const tickets={f1:0,f2:0,sec:0};
export function invalidar(){estado.version++;Object.keys(tickets).forEach(k=>{tickets[k]++;const el=$(`#${k}-res`);el.innerHTML='';el.removeAttribute('aria-busy');});}
export function navegar(tab){estado.tab=tab;$$('.tab').forEach(e=>e.classList.toggle('activo',e.id===`tab-${tab}`));$$('[role=tab]').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===tab));if(tab==='f2'&&estado.cultivos.length)fichas();if(tab==='f1'&&$('#f1-cultivo').value!==estado.cultivo){$('#f1-cultivo').value=estado.cultivo;tickets.f1++;$('#f1-res').innerHTML='<p>El cultivo cambió. Compara las fechas para actualizar la evaluación.</p>';}if(tab==='mapa')mostrarParcela(estado);if(tab==='chequeo')cargarChequeo(estado);}
$$('[data-tab]').forEach(b=>b.onclick=()=>navegar(b.dataset.tab));
$('.pestanas').onkeydown=e=>{if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key))return;e.preventDefault();const bs=$$('[role=tab]'),i=bs.indexOf(document.activeElement),n=e.key==='Home'?0:e.key==='End'?bs.length-1:(i+(e.key==='ArrowRight'?1:-1)+bs.length)%bs.length;bs[n].focus();bs[n].click();};
export async function elegirParcela(id){invalidar();estado.parcela=id;localStorage.setItem('nortexParcela',id);$('#sel-parcela').value=id;mostrarParcela(estado);await Promise.allSettled([cargarFuentes(estado),cargarClima(estado),cargarChequeo(estado)]);}
async function cargarParcelas(id){estado.parcelas=await api('/parcelas');$('#sel-parcela').innerHTML='<option value="">Elige tu chacra</option>'+estado.parcelas.map(p=>`<option value="${esc(p.aoi_id)}">${esc(p.nombre)}</option>`).join('');await elegirParcela(id??(estado.parcelas.some(p=>p.aoi_id===estado.parcela)?estado.parcela:estado.parcelas[0]?.aoi_id||''));}
$('#sel-parcela').onchange=e=>elegirParcela(e.target.value);
$('#btn-descargar').onclick=async()=>{
 if(!estado.parcela)return $('#progreso').textContent='Elige una chacra primero.';
 const id=estado.parcela,btn=$('#btn-descargar');btn.disabled=true;$('#senales').classList.add('descargando');
 try{let t=await post(`/parcelas/${id}/actualizar?segundo_plano=true`,null);
 while(t.estado==='en curso'){$('#progreso').textContent=`Descargando fuentes para ${id}… Actividad sin porcentaje estimado.`;await new Promise(r=>setTimeout(r,2500));t=await api(`/tareas/${t.id}`);}
 if(t.estado==='error')throw Error(t.error);olvidar();invalidar();$('#progreso').textContent=`Descarga de ${id} terminada. Revisa cada fuente.`;
 await Promise.allSettled([cargarFuentes(estado,t.fuentes),cargarClima(estado),cargarChequeo(estado)]);
 }catch(e){$('#progreso').textContent=e.message;}finally{btn.disabled=false;$('#senales').classList.remove('descargando');}
};
function fichas(){
 $('#f2-fichas').innerHTML=estado.cultivos.map(c=>`<button class="ficha" draggable="true" data-cultivo="${esc(c.id)}" aria-pressed="${c.id===estado.cultivo}">${cultivoSVG(c.id)}<span>${esc(c.nombre)}</span></button>`).join('');
 $$('.ficha').forEach(b=>{b.onclick=()=>{estado.cultivo=b.dataset.cultivo;$('#f1-cultivo').value=estado.cultivo;fichas();consultar('f2');};b.ondragstart=e=>e.dataTransfer.setData('text/plain',b.dataset.cultivo);});
 $('#f2-chacra').textContent=`${estado.cultivos.find(c=>c.id===estado.cultivo)?.nombre||'Cultivo'} en la escena · se comparan los cinco cultivos`;
}
$('#f2-chacra').ondragover=e=>e.preventDefault();$('#f2-chacra').ondrop=e=>{e.preventDefault();const c=e.dataTransfer.getData('text/plain');if(estado.cultivos.some(x=>x.id===c)){estado.cultivo=c;fichas();consultar('f2');}};
export async function consultar(tipo){
 const el=$(`#${tipo}-res`),ticket=++tickets[tipo],v=estado.version;
 if(!estado.parcela){el.innerHTML=errorHtml('Elige una chacra primero.');return;}
 const cuerpo={aoi_id:estado.parcela,...leerOpciones(tipo)};
 if(tipo==='f2')Object.assign(cuerpo,{inicio:$('#f2-inicio').value,cultivos:estado.cultivos.map(c=>c.id),historial:$('#f2-historial').value.split(',').map(x=>x.trim()).filter(Boolean),renovacion_confirmada:$('#f2-renovacion').checked});
 else Object.assign(cuerpo,{cultivo:$('#f1-cultivo').value,desde:$('#f1-desde').value,hasta:$('#f1-hasta').value,paso_dias:15});
 el.setAttribute('aria-busy','true');let aviso=$('.estado-consulta',el);if(!aviso){aviso=document.createElement('p');aviso.className='estado-consulta';el.prepend(aviso);}aviso.textContent='Actualizando… La escena anterior conserva los controles de su última consulta.';
 try{const r=await evaluar(tipo,cuerpo);if(ticket!==tickets[tipo]||v!==estado.version)return;montarResultados(el,r,estado,cuerpo,tipo);}
 catch(e){if(ticket===tickets[tipo]&&v===estado.version)aviso.innerHTML=errorHtml(e);}
 finally{if(ticket===tickets[tipo]&&v===estado.version)el.removeAttribute('aria-busy');}
}
$('#f1-ir').onclick=()=>consultar('f1');let debounce;
['f2-inicio','f2-opciones'].forEach(id=>$('#'+id).addEventListener('change',()=>{tickets.f2++;clearTimeout(debounce);debounce=setTimeout(()=>consultar('f2'),350);}));
['f1-desde','f1-hasta','f1-cultivo','f1-opciones'].forEach(id=>$('#'+id).addEventListener('change',()=>{tickets.f1++;estado.cultivo=$('#f1-cultivo').value;$('#f1-res').innerHTML='<p class="aviso">Controles modificados. Pulsa Comparar fechas.</p>';}));
$('#sec-ir').onclick=async()=>{
 const el=$('#sec-res'),ticket=++tickets.sec,v=estado.version;
 if(!estado.parcela){el.innerHTML=errorHtml('Elige una chacra primero.');return;}
 const pasos=$$('.sec-paso').map(p=>({cultivo:$('select',p).value,inicio:$('input',p).value}));
 if(pasos.some((p,i)=>!p.inicio||(i&&p.inicio<=pasos[i-1].inicio))){el.innerHTML=errorHtml('Las fechas deben estar completas y en orden creciente.');return;}
 const historial=[$('#sec-previo').value].filter(Boolean),opts=leerOpciones('sec'),renovar=$('#sec-renovacion').checked;
 el.innerHTML='<p class="estado-consulta">Evaluando campañas con historial acumulado…</p>';
 try{const salidas=[];for(const p of pasos){const cuerpo={aoi_id:estado.parcela,inicio:p.inicio,cultivos:[p.cultivo],historial:[...historial],renovacion_confirmada:renovar,...opts};const r=await evaluar('f2',cuerpo);if(ticket!==tickets.sec||v!==estado.version)return;salidas.push({r,cuerpo});historial.push(p.cultivo);}
 el.innerHTML='<h2 class="secuencia-lista">Secuencia evaluada ✧</h2><p>Evaluaciones encadenadas con historial. No simulan acumulación de nutrientes, rendimientos ni salud del suelo entre campañas.</p>';
 salidas.forEach(({r,cuerpo},i)=>{const div=document.createElement('div');el.append(div);montarResultados(div,r,estado,cuerpo,`Campaña ${i+1}`);});
 }catch(e){if(ticket===tickets.sec&&v===estado.version)el.innerHTML=errorHtml(e);}
};
['sec-pasos','sec-opciones','sec-previo','sec-renovacion'].forEach(id=>$('#'+id).onchange=()=>{tickets.sec++;$('#sec-res').innerHTML='<p>Secuencia modificada. Vuelve a revisarla.</p>';});
$('#form-csv').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),body=new FormData();body.append('archivo',f.get('archivo'));try{const r=await api(`/importar/${f.get('modelo')}`,{method:'POST',body});$('#msg-csv').textContent=`${r.filas_guardadas} filas guardadas.`;olvidar();invalidar();await cargarChequeo(estado);}catch(err){$('#msg-csv').textContent=err.message;}};
function parametro(){const c=estado.cultivos.find(c=>c.id===$('#val-cultivo').value),p=c?.parametros[$('#val-parametro').value];$('#val-actual').textContent=p?`${JSON.stringify(p.valor)} · ${p.fuente} · ${p.estado}`:'';}
function parametros(){const c=estado.cultivos.find(c=>c.id===$('#val-cultivo').value);$('#val-parametro').innerHTML=Object.keys(c?.parametros||{}).map(k=>`<option>${esc(k)}</option>`).join('');parametro();}
$('#val-cultivo').onchange=parametros;$('#val-parametro').onchange=parametro;
$('#form-validacion').onsubmit=async e=>{e.preventDefault();try{await post('/datos/validacion_parametro',Object.fromEntries(new FormData(e.target)));olvidar();invalidar();estado.cultivos=await api('/catalogo/cultivos');parametro();await cargarChequeo(estado);$('#msg-validacion').textContent='Validación guardada. Vuelve a evaluar para aplicar el cambio.';}catch(err){$('#msg-validacion').textContent=err.message;}};
async function iniciar(){
 iniciarMapa(estado,cargarParcelas);const hoy=iso(new Date());$('#f2-inicio').value=masDias(hoy,30);$('#f1-desde').value=masDias(hoy,15);$('#f1-hasta').value=masDias(hoy,195);$('#form-validacion [name=fecha]').value=hoy;
 ['f1','f2','sec'].forEach(k=>$(`#${k}-opciones`).innerHTML=opciones(k));
 try{const [salud,cultivos,modelos]=await Promise.all([api('/salud'),api('/catalogo/cultivos'),api('/modelos')]);estado.cultivos=cultivos;$('#estado-api').textContent=salud.estado==='ok'?'API disponible':salud.estado;$('#estado-api').title=API;
 const opts=cultivos.map(c=>`<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('');['f1-cultivo','val-cultivo'].forEach(id=>$('#'+id).innerHTML=opts);$('#f1-cultivo').value=estado.cultivo;$('#sec-previo').insertAdjacentHTML('beforeend',opts);
 $('#sec-pasos').innerHTML=[0,1,2].map(i=>`<div class="sec-paso"><span class="eyebrow">CAMPAÑA 0${i+1}</span><label>Cultivo<select>${opts}</select></label><label>Siembra<input type="date" value="${masDias(hoy,30+i*180)}" required></label></div>`).join('');$$('.sec-paso select').forEach((s,i)=>s.value=['arroz','caupi','maiz'][i]);
 $('#sel-modelo').innerHTML=modelos.map(m=>`<option value="${esc(m.modelo)}">${esc(m.modelo)} — ${esc(m.descripcion)}</option>`).join('');fichas();parametros();await cargarParcelas();
 }catch(e){$('#estado-api').textContent='API no disponible';$('#progreso').innerHTML=errorHtml(e);}
 iniciarDemo({estado,navegar,elegirParcela,consultar,invalidar});$('#btn-demo').disabled=false;
}
iniciar();
