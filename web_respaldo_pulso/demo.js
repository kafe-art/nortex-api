import {$,$$,esc,num,etq,errorHtml} from './util.js';
import {evaluar} from './api.js';
import {montarResultados} from './evaluaciones.js';
import {animarLluvia} from './visuales/lluvia.js';
export function iniciarDemo({estado,navegar,elegirParcela,invalidar}){
 let anterior=null,paso=0,timer=null,pausado=false,token=0;
 const panel=$('#demo');
 const detener=()=>{clearTimeout(timer);timer=null;};
 async function salir(){token++;detener();panel.hidden=true;$('#contenido').inert=false;$('.pestanas').inert=false;$('#sel-parcela').disabled=false;if(!anterior)return;
  await elegirParcela(anterior.parcela);Object.assign(estado,{cultivo:anterior.cultivo,escenario:anterior.escenario});
  anterior.controls.forEach(([el,value,checked])=>{el.value=value;el.checked=checked;});
  anterior.results.forEach(([el,nodes])=>{el.replaceChildren(...nodes);animarLluvia(el);});navegar(anterior.tab);anterior=null;$('#btn-demo').focus();
 }
 function barra(texto,cargando=false){panel.innerHTML=`<span class="eyebrow">RECORRIDO GUIADO · ${paso+1}/4 · CONSULTA REAL</span><h3>${['De la órbita a tu chacra','Una siembra, cuatro dimensiones','¿Y si cambia la fecha o el riego?','La honestidad también es un resultado'][paso]}</h3><div>${texto}</div><div class="fila-botones"><button data-demo="pausa">${pausado?'Continuar':'Pausar'}</button><button data-demo="next" ${cargando?'disabled':''}>${paso===3?'Finalizar':'Siguiente →'}</button><button data-demo="salir">Salir y restaurar</button></div>`;$('[data-demo=pausa]').onclick=()=>{pausado=!pausado;detener();$('[data-demo=pausa]').textContent=pausado?'Continuar':'Pausar';if(!pausado&&!cargando)timer=setTimeout(avanzar,30000);};$('[data-demo=next]').onclick=avanzar;$('[data-demo=salir]').onclick=salir;}
 async function avanzar(){detener();if(paso===3)return salir();paso++;await mostrar();}
 async function mostrar(){const actual=++token;barra('<p>Consultando la API. Las cifras se muestran cuando termine la evaluación.</p>',true);
  try{const year=new Date().getFullYear()+1,base={aoi_id:'ejemplo_sl',cultivos:['caupi'],inicio:`${year}-01-15`};let texto='';
   if(paso===0){navegar('mapa');texto='<p>Parcela ejemplo_sl. El visor recorre únicamente los años que devuelve POWER; las marcas ICEN muestran su criterio. Consulta viva de datos archivados, no validación de campo.</p>';}
   if(paso===1){const r=await evaluar('f2',{...base,eficiencia:.5});if(actual!==token)return;navegar('f2');montarResultados($('#f2-res'),r,estado,{...base,eficiencia:.5},'demo');const d=r.decisiones[0];texto=`<p>Caupí · ${base.inicio}. ${etq(d.viabilidad.estado)} ${d.viabilidad.definitiva===false?etq('provisional','ambar'):''}</p><p>${esc(d.riesgo.find(x=>/Calor en floraci/i.test(x.factor))?.evidencia||'Calor por determinar.')}</p>`;}
   if(paso===2){const q={aoi_id:'ejemplo_sl',cultivo:'caupi',desde:`${year}-05-01`,hasta:`${year}-06-15`,paso_dias:15};const [goteo,gravedad]=await Promise.all([evaluar('f1',{...q,eficiencia:.9}),evaluar('f1',{...q,eficiencia:.5})]);if(actual!==token)return;navegar('f1');montarResultados($('#f1-res'),goteo,estado,{...q,eficiencia:.9},'f1');const mejor=goteo.tabla[0],dg=goteo.decisiones.find(x=>x.inicio===mejor.inicio),dr=gravedad.decisiones.find(x=>x.inicio===mejor.inicio);const cov=d=>d.resultados?.deficit_medio?.cobertura_hidrica?.valor;texto=`<p>Primera fecha según el orden de la API con goteo: ${esc(mejor.inicio)}. Comparamos esa misma fecha con gravedad.</p><p>Cobertura en déficit medio: gravedad ${cov(dr)==null?'por determinar':num(cov(dr)*100,1)+' %'} · goteo ${cov(dg)==null?'por determinar':num(cov(dg)*100,1)+' %'}.</p><p>Fuente: resultados.deficit_medio.cobertura_hidrica. Cambiar eficiencia no prueba una mejora física de la finca; revisa también viabilidad y riesgos.</p>`;}
   if(paso===3){navegar('chequeo');texto='<p>Revisa los datos de ejemplo, las fuentes antiguas y los parámetros por validar con INIA. Sin precio, costo y rendimiento, el margen queda por determinar.</p><p><b>NORTEX no da un puntaje: muestra por qué, con qué datos y qué falta.</b></p>';}
   if(actual!==token)return;document.querySelector(paso===1?'#f2-res .resultado-elegido':paso===2?'#f1-res .resultado-elegido':paso===3?'#tab-chequeo':'#tab-mapa')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});barra(texto);if(!pausado)timer=setTimeout(avanzar,30000);
  }catch(e){if(actual===token){pausado=true;barra(errorHtml(e)+'<p>No se sustituyen datos ausentes por cifras de demostración.</p>');}}
 }
 $('#btn-demo').onclick=async()=>{if(anterior)return;const found=estado.parcelas.find(p=>p.aoi_id==='ejemplo_sl');if(!found){panel.hidden=false;panel.innerHTML='<p>La parcela ejemplo_sl no está disponible en esta API. El recorrido requiere datos reales.</p><button id="demo-cerrar">Cerrar</button>';$('#demo-cerrar').onclick=()=>panel.hidden=true;return;}
 anterior={parcela:estado.parcela,cultivo:estado.cultivo,escenario:estado.escenario,tab:estado.tab,controls:$$('input,select,textarea').map(e=>[e,e.value,e.checked]),results:['f1','f2','sec'].map(k=>{const el=$(`#${k}-res`),nodes=[...el.childNodes];nodes.forEach(n=>n.remove());return [el,nodes];})};
 invalidar();paso=0;pausado=false;panel.hidden=false;$('#contenido').inert=true;$('.pestanas').inert=true;$('#sel-parcela').disabled=true;await elegirParcela('ejemplo_sl');await mostrar();$('[data-demo=pausa]')?.focus();
 };
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&anterior)salir();});
}
