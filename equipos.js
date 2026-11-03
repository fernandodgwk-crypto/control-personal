/* Control de Personal — módulo Equipos: transpaletas eléctricas y estándar, montacargas y herramientas.
   Registro, checklist diario, reparaciones (lista y Gantt), revisión semanal, owners por turno, proveedores y escalación. */
(function(){
"use strict";
let C=null;
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pad=n=>String(n).padStart(2,"0");
const ymd=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const today=()=>ymd(new Date());
const addDays=(f,n)=>{const d=new Date(f+"T12:00:00");d.setDate(d.getDate()+n);return ymd(d)};
const fmtD=f=>{if(!f)return"";const [y,m,d]=String(f).slice(0,10).split("-");return d+"/"+m+"/"+y};
const fmtTs=t=>t?new Date(t).toLocaleString("es-MX",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"";
const fmtDia=f=>new Date(f+"T12:00:00").toLocaleDateString("es-MX",{weekday:"short",day:"numeric"});
function isoWeek(f){const d=new Date(f+"T12:00:00");d.setDate(d.getDate()+3-(d.getDay()+6)%7);const y=d.getFullYear(),w1=new Date(y,0,4);return y+"-W"+pad(1+Math.round(((d-w1)/864e5-3+(w1.getDay()+6)%7)/7))}
function weekDates(w){const m=/^(\d{4})-W(\d{2})$/.exec(w||"");if(!m)return null;const j4=new Date(+m[1],0,4,12),mon=new Date(j4);mon.setDate(j4.getDate()-(j4.getDay()+6)%7+(+m[2]-1)*7);const f=ymd(mon);return{desde:f,hasta:addDays(f,6)}}
const weekLbl=w=>{const r=weekDates(w);return r?`Sem ${+w.slice(6)} · ${fmtD(r.desde).slice(0,5)} – ${fmtD(r.hasta).slice(0,5)}`:w};
const hoursSince=t=>(Date.now()-new Date(t).getTime())/36e5;

const ESTADO={operativo:["Funcional","ok"],fuera_servicio:["Fuera de servicio","bad"],en_reparacion:["En reparación","warn"],baja:["Baja","" ]};
const ESTATUS={abierta:["Abierta","bad"],en_reparacion:["En reparación","warn"],espera_refaccion:["Espera de refacción","warn"],cerrada:["Cerrada","ok"]};
const SUBS=[["tablero","Tablero"],["equipos","Equipos"],["checklist","Checklist"],["reparaciones","Reparaciones"],["revision","Revisión semanal"],["owners","Owners por turno"],["proveedores","Proveedores"],["config","Escalación y ajustes"]];
const PALETA=["#b3261e","#d99a1e","#2f7fb5","#6f5fc7","#1d7a46","#c2569b","#5b6878","#0f8a8a","#8a5a1d","#3a4fb0"];

const E={loaded:false,loading:false,cfg:null,eq:[],prov:[],inc:[],chk:[],own:[],rev:[],sub:"tablero",fecha:today(),turno:"",week:isoWeek(today()),repView:"lista",repFil:"abiertas",eqFil:{q:"",tipo:"",estado:""},chan:null};
try{const s=localStorage.getItem("cp_eq_sub");if(s)E.sub=s}catch(e){}
const canAdm=()=>C.S.perms.has("equipos_admin");
const canOp=()=>canAdm()||C.S.perms.has("equipos_operar");
const cfgE=()=>E.cfg||{tipos:[],fallas:[],checklist:{},escalacion:[],notificar:[]};
const eqById=id=>E.eq.find(x=>x.id===id);
const ownerOf=(sem,t)=>(E.own.find(o=>o.semana===sem&&o.turno===t)||{}).supervisor||"";
function nivelEsc(inc){const h=hoursSince(inc.reporte);const L=(cfgE().escalacion||[]).slice().sort((a,b)=>a.horas-b.horas).filter(l=>h>=l.horas);return L.length?L[L.length-1]:null}
const abiertas=()=>E.inc.filter(i=>i.estatus!=="cerrada");
const vencida=i=>i.estatus!=="cerrada"&&i.compromiso&&i.compromiso<today();
const chip=(t,c)=>`<span class="chip ${c||""}">${esc(t)}</span>`;

async function load(){
  if(E.loading)return;E.loading=true;const sb=C.S.sb;
  const [cf,eq,pv,inc,chk,own,rev]=await Promise.all([
    sb.from("eq_config").select("data").eq("id",1).maybeSingle(),
    sb.from("equipos").select("*").order("id"),
    sb.from("eq_proveedores").select("*").order("nombre"),
    sb.from("eq_incidencias").select("*").order("reporte",{ascending:false}).limit(600),
    sb.from("eq_checklists").select("*").gte("fecha",addDays(today(),-62)).order("fecha"),
    sb.from("eq_owners").select("*"),
    sb.from("eq_revisiones").select("*")]);
  E.cfg=cf.data?cf.data.data:null;E.eq=eq.data||[];E.prov=pv.data||[];E.inc=inc.data||[];E.chk=chk.data||[];E.own=own.data||[];E.rev=rev.data||[];
  E.error=[cf,eq,pv,inc,chk,own,rev].map(x=>x.error).find(Boolean)||null;
  E.loaded=true;E.loading=false;
  if(!E.turno)E.turno=C.turnosUsed()[0]||"";
  if(!E.chan){E.chan=sb.channel("cp-eq");["equipos","eq_incidencias","eq_checklists","eq_owners","eq_revisiones","eq_proveedores","eq_config"].forEach(t=>E.chan.on("postgres_changes",{event:"*",schema:"public",table:t},()=>{clearTimeout(E.tm);E.tm=setTimeout(()=>{E.loading=false;load()},400)}));E.chan.subscribe()}
  if(C.S.tab==="equipos")C.renderActive();
}

/* ---------- gráfica apilada (usa la de Reportes) ---------- */
function chartMes(){
  const meses=[];const d=new Date();d.setDate(1);for(let i=5;i>=0;i--){const x=new Date(d.getFullYear(),d.getMonth()-i,1);meses.push(x.getFullYear()+"-"+pad(x.getMonth()+1))}
  const fallas=[...new Set([...(cfgE().fallas||[]),...E.inc.map(i=>i.tipo_falla)])];
  const cnt={};E.inc.forEach(i=>{const m=String(i.reporte).slice(0,7);if(!meses.includes(m))return;(cnt[m]=cnt[m]||{})[i.tipo_falla]=(cnt[m][i.tipo_falla]||0)+1});
  const usadas=fallas.filter(f=>meses.some(m=>cnt[m]&&cnt[m][f]));
  const series=usadas.map((f,i)=>({key:f,label:f,color:PALETA[i%PALETA.length]}));
  const lbl=m=>new Date(m+"-15T12:00:00").toLocaleDateString("es-MX",{month:"short",year:"2-digit"});
  const cats=meses.map(m=>Object.assign({label:lbl(m)},cnt[m]||{}));
  const tot=meses.map(m=>Object.values(cnt[m]||{}).reduce((a,b)=>a+b,0));
  const chart=series.length&&window.CPR&&window.CPR.barChart?window.CPR.barChart(cats,{titulo:"Incidencias por mes y tipo de falla",series,alto:200,sufijo:"incidencias"}):`<div class="empty">Sin incidencias en los últimos 6 meses.</div>`;
  return `<div class="panel"><div class="ph"><h3>Incidencias por mes y tipo de falla</h3><span class="small muted">Últimos 6 meses</span></div><div class="pb">${chart}</div>
    ${series.length?`<div class="scroll"><table><thead><tr><th>Tipo de falla</th>${meses.map(m=>`<th class="num">${esc(lbl(m))}</th>`).join("")}<th class="num">Total</th></tr></thead><tbody>${usadas.map(f=>`<tr><td>${esc(f)}</td>${meses.map(m=>`<td class="num">${(cnt[m]||{})[f]||""}</td>`).join("")}<td class="num"><b>${meses.reduce((a,m)=>a+((cnt[m]||{})[f]||0),0)}</b></td></tr>`).join("")}
      <tr><td><b>Total</b></td>${tot.map(t=>`<td class="num"><b>${t||""}</b></td>`).join("")}<td class="num"><b>${tot.reduce((a,b)=>a+b,0)}</b></td></tr></tbody></table></div>`:""}</div>`;
}

/* ---------- vistas ---------- */
function vTablero(){
  const act=E.eq.filter(x=>x.estado!=="baja"),fuera=act.filter(x=>x.estado!=="operativo"),crit=fuera.filter(x=>x.critico);
  const ab=abiertas(),venc=ab.filter(vencida),hoy=today();
  const chkHoy=new Set(E.chk.filter(c=>c.fecha===hoy).map(c=>c.equipo_id)).size;
  const cerr=E.inc.filter(i=>i.estatus==="cerrada"&&i.cierre&&hoursSince(i.cierre)<24*90);
  const mttr=cerr.length?cerr.reduce((a,i)=>a+(new Date(i.cierre)-new Date(i.reporte))/864e5,0)/cerr.length:null;
  const sem=isoWeek(hoy),T=C.turnosUsed();
  const critInc=ab.filter(i=>{const e=eqById(i.equipo_id);return i.critico||(e&&e.critico)}).sort((a,b)=>new Date(a.reporte)-new Date(b.reporte));
  return `<div class="kpis">
    <div class="panel kpi"><div class="lbl">Equipos funcionales</div><div class="val">${act.length-fuera.length}<span style="font-size:20px;color:var(--muted)"> / ${act.length}</span></div><div class="hint">${act.length?Math.round((act.length-fuera.length)/act.length*100):0}% de disponibilidad</div><div class="meter"><i style="width:${act.length?(act.length-fuera.length)/act.length*100:0}%;background:var(--ok)"></i></div></div>
    <div class="panel kpi"><div class="lbl">Fuera de servicio</div><div class="val" style="${fuera.length?"color:var(--bad)":""}">${fuera.length}</div><div class="hint">${crit.length} crítico${crit.length===1?"":"s"}</div></div>
    <div class="panel kpi"><div class="lbl">Reparaciones abiertas</div><div class="val">${ab.length}</div><div class="hint" style="${venc.length?"color:var(--bad)":""}">${venc.length} con fecha compromiso vencida</div></div>
    <div class="panel kpi"><div class="lbl">Checklist hoy</div><div class="val">${chkHoy}<span style="font-size:20px;color:var(--muted)"> / ${act.length}</span></div><div class="hint">${mttr!==null?`Reparación promedio: ${mttr.toFixed(1)} días (90 días)`:"Equipos revisados hoy"}</div></div>
  </div>
  <div class="grid-2">
    <div class="panel" style="padding:0"><div class="ph"><h3>Críticos fuera de servicio</h3><span class="small muted">Nivel de escalación según horas fuera</span></div><div class="scroll"><table><thead><tr><th>Equipo</th><th>Falla</th><th class="num">Horas</th><th>Escalación</th></tr></thead><tbody>${
      critInc.length?critInc.map(i=>{const e=eqById(i.equipo_id)||{};const n=nivelEsc(i);return `<tr class="click" data-inc="${i.id}"><td><b>${esc(i.equipo_id)}</b><div class="small muted">${esc(e.tipo||"")}</div></td><td>${esc(i.tipo_falla)}${vencida(i)?" "+chip("Compromiso vencido","bad"):""}</td><td class="num">${Math.round(hoursSince(i.reporte))}</td><td>${n?`${chip("Nivel "+n.nivel,n.nivel>=3?"bad":n.nivel===2?"warn":"acc")}<div class="small">${esc(n.quien)}</div>`:"—"}</td></tr>`}).join("")
      :`<tr><td colspan="4" class="empty">No hay equipos críticos fuera de servicio.</td></tr>`}</tbody></table></div></div>
    <div class="panel" style="padding:0"><div class="ph"><h3>Owners de esta semana</h3><span class="small muted">${esc(weekLbl(sem))}</span></div><div class="scroll"><table><tbody>${
      T.map(t=>`<tr><td><b>${esc(t)}</b></td><td>${ownerOf(sem,t)?esc(ownerOf(sem,t)):'<span class="chip warn">Sin owner</span>'}</td></tr>`).join("")}</tbody></table></div>
      <div class="pb small muted">El owner del turno registra fallas, etiqueta el equipo y reporta al proveedor. ${canAdm()?'Se asignan en "Owners por turno".':""}</div></div>
  </div>
  ${chartMes()}`;
}
function vEquipos(){
  const f=E.eqFil,C2=cfgE();
  const list=E.eq.filter(x=>(!f.tipo||x.tipo===f.tipo)&&(!f.estado||x.estado===f.estado)&&(!f.q||(x.id+" "+x.serial+" "+x.marca+" "+x.modelo+" "+x.area).toLowerCase().includes(f.q.toLowerCase())));
  const ult=id=>{const l=E.chk.filter(c=>c.equipo_id===id);return l.length?l[l.length-1]:null};
  return `<div class="filters">
    <div class="fld"><label for="eq-q">Buscar</label><input type="text" id="eq-q" value="${esc(f.q)}" placeholder="Código, serial, marca, área"></div>
    <div class="fld"><label for="eq-ft">Tipo</label><select id="eq-ft"><option value="">Todos</option>${C2.tipos.map(t=>`<option ${f.tipo===t?"selected":""}>${esc(t)}</option>`).join("")}</select></div>
    <div class="fld"><label for="eq-fe">Estado</label><select id="eq-fe"><option value="">Todos</option>${Object.entries(ESTADO).map(([k,v])=>`<option value="${k}" ${f.estado===k?"selected":""}>${v[0]}</option>`).join("")}</select></div>
    <span style="flex:1"></span>${canAdm()?'<button class="btn primary" data-eqnew>Agregar equipo</button>':""}${canOp()?'<button class="btn" data-incnew>Reportar falla</button>':""}</div>
  <div class="panel" style="padding:0"><div class="scroll"><table><thead><tr><th>Código</th><th>Tipo</th><th>Serial</th><th>Marca / modelo</th><th>Área</th><th>Funcionalidad</th><th>Último checklist</th><th class="num">Fallas abiertas</th><th></th></tr></thead><tbody>${
    list.length?list.map(x=>{const u=ult(x.id),n=abiertas().filter(i=>i.equipo_id===x.id).length;
      return `<tr><td><b>${esc(x.id)}</b>${x.critico?" "+chip("Crítico","bad"):""}</td><td>${esc(x.tipo)}</td><td class="mono">${esc(x.serial||"—")}</td><td>${esc(x.marca||"—")}${x.modelo?`<div class="small muted">${esc(x.modelo)}</div>`:""}</td><td class="small">${esc(x.area||"")}${x.sitio?`<div class="muted">${esc(C.sitioCorto(x.sitio))}</div>`:""}</td>
      <td>${chip(ESTADO[x.estado][0],ESTADO[x.estado][1])}</td><td class="small nw">${u?`${fmtD(u.fecha)} ${u.resultado==="falla"?chip("Falla","bad"):chip("OK","ok")}`:'<span class="muted">Nunca</span>'}</td><td class="num">${n||""}</td>
      <td class="nw">${canOp()&&x.estado!=="baja"?`<button class="btn" data-incnew="${esc(x.id)}" style="padding:4px 8px">Reportar falla</button> `:""}${canAdm()?`<button class="btn" data-eqedit="${esc(x.id)}" style="padding:4px 8px">Editar</button>`:""}</td></tr>`}).join("")
    :`<tr><td colspan="9" class="empty">${E.eq.length?"Sin resultados.":"Aún no hay equipos registrados."+(canAdm()?' Usa "Agregar equipo".':"")}</td></tr>`}</tbody></table></div></div>`;
}
function vChecklist(){
  const T=C.turnosUsed(),act=E.eq.filter(x=>x.estado!=="baja");
  const done=E.chk.filter(c=>c.fecha===E.fecha&&c.turno===E.turno);
  const tipos=[...new Set(act.map(x=>x.tipo))];
  return `<div class="filters">
    <div class="fld"><label for="ck-f">Fecha</label><input type="date" id="ck-f" value="${E.fecha}"></div>
    <div class="fld"><label for="ck-t">Turno</label><select id="ck-t">${T.map(t=>`<option ${E.turno===t?"selected":""}>${esc(t)}</option>`).join("")}</select></div>
    <div class="small muted" style="align-self:center">${done.length} de ${act.length} equipos revisados · owner: ${esc(ownerOf(isoWeek(E.fecha),E.turno)||"sin asignar")}</div></div>
  ${act.length?tipos.map(t=>`<div class="panel" style="padding:0"><div class="ph"><h3>${esc(t)}</h3><span class="small muted">${(cfgE().checklist[t]||[]).length} puntos de revisión</span></div><div class="scroll"><table><tbody>${
    act.filter(x=>x.tipo===t).map(x=>{const c=done.find(d=>d.equipo_id===x.id);const fails=c?(c.items||[]).filter(i=>!i.ok).map(i=>i.item):[];
      return `<tr><td style="width:30%"><b>${esc(x.id)}</b>${x.critico?" "+chip("Crítico","bad"):""}<div class="small muted">${esc(x.marca)} ${esc(x.serial)}</div></td><td>${chip(ESTADO[x.estado][0],ESTADO[x.estado][1])}</td>
      <td>${c?(c.resultado==="falla"?chip("Falla","bad")+`<div class="small">${esc(fails.join(", "))}</div>`:chip("OK","ok"))+`<div class="small muted">${esc(c.reviso_email||"")}</div>`:'<span class="chip warn">Pendiente</span>'}</td>
      <td style="text-align:right">${canOp()?`<button class="btn ${c?"":"primary"}" data-ckopen="${esc(x.id)}">${c?"Ver / corregir":"Hacer checklist"}</button>`:""}</td></tr>`}).join("")}</tbody></table></div></div>`).join("")
  :`<div class="panel empty">No hay equipos registrados.</div>`}`;
}
function vReparaciones(){
  const fil=E.repFil,list=E.inc.filter(i=>fil==="abiertas"?i.estatus!=="cerrada":fil==="vencidas"?vencida(i):fil==="cerradas"?i.estatus==="cerrada":true);
  const head=`<div class="filters">
    <div class="seg">${[["lista","Lista"],["gantt","Gantt"]].map(([k,l])=>`<button data-rv="${k}" aria-pressed="${E.repView===k}">${l}</button>`).join("")}</div>
    <div class="fld"><label for="rp-f">Mostrar</label><select id="rp-f">${[["abiertas","Abiertas"],["vencidas","Compromiso vencido"],["cerradas","Cerradas"],["todas","Todas"]].map(([k,l])=>`<option value="${k}" ${fil===k?"selected":""}>${l}</option>`).join("")}</select></div>
    <span style="flex:1"></span>${canOp()?'<button class="btn primary" data-incnew>Reportar falla</button>':""}</div>`;
  if(E.repView==="gantt")return head+gantt(list);
  return head+`<div class="panel" style="padding:0"><div class="scroll"><table><thead><tr><th>Equipo</th><th>Falla</th><th>Reporte</th><th class="num">Días</th><th>Owner</th><th>Proveedor / folio</th><th>Compromiso</th><th>Estatus</th><th>Escalación</th></tr></thead><tbody>${
    list.length?list.map(i=>{const e=eqById(i.equipo_id)||{};const dias=((i.cierre?new Date(i.cierre):new Date())-new Date(i.reporte))/864e5;const n=i.estatus!=="cerrada"?nivelEsc(i):null;
      return `<tr class="click" data-inc="${i.id}"><td><b>${esc(i.equipo_id)}</b>${(i.critico||e.critico)?" "+chip("Crítico","bad"):""}<div class="small muted">${esc(e.tipo||"")}</div></td><td>${esc(i.tipo_falla)}<div class="small muted">${esc(i.descripcion||"")}</div></td>
      <td class="small nw">${fmtTs(i.reporte)}<div class="muted">${esc(i.turno||"")}</div></td><td class="num">${dias.toFixed(1)}</td><td class="small">${esc(i.owner||"—")}</td><td class="small">${esc(i.proveedor||"—")}${i.folio_proveedor?`<div class="mono">${esc(i.folio_proveedor)}</div>`:""}</td>
      <td class="nw">${i.compromiso?(vencida(i)?chip(fmtD(i.compromiso),"bad"):fmtD(i.compromiso)):'<span class="muted">Sin fecha</span>'}</td><td>${chip(ESTATUS[i.estatus][0],ESTATUS[i.estatus][1])}${i.cierre?`<div class="small muted">${fmtD(String(i.cierre).slice(0,10))}</div>`:""}</td>
      <td>${n?chip("Nivel "+n.nivel,n.nivel>=3?"bad":n.nivel===2?"warn":"acc"):"—"}</td></tr>`}).join("")
    :`<tr><td colspan="9" class="empty">Sin reparaciones con este filtro.</td></tr>`}</tbody></table></div></div>`;
}
function gantt(list){
  if(!list.length)return `<div class="panel empty">Sin reparaciones con este filtro.</div>`;
  const hoy=today();let ini=addDays(hoy,-21),fin=addDays(hoy,14);
  list.forEach(i=>{const r=String(i.reporte).slice(0,10);if(r<ini)ini=r;if(i.compromiso&&i.compromiso>fin)fin=i.compromiso});
  const span=Math.min(90,Math.round((new Date(fin)-new Date(ini))/864e5)+1);if(span===90)ini=addDays(fin,-89);
  const pos=f=>Math.max(0,Math.min(100,(new Date(f+"T00:00:00")-new Date(ini+"T00:00:00"))/864e5/span*100));
  const dias=[];for(let k=0;k<span;k++)dias.push(addDays(ini,k));
  const marks=dias.filter((d,k)=>new Date(d+"T12:00:00").getDay()===1||k===0);
  const col={abierta:"var(--bad)",en_reparacion:"var(--warn)",espera_refaccion:"var(--c-p)",cerrada:"var(--ok)"};
  return `<div class="panel" style="padding:0"><div class="ph"><h3>Gantt de reparaciones</h3><div class="ch-legend">${Object.entries(ESTATUS).map(([k,v])=>`<span><i style="background:${col[k]}"></i>${v[0]}</span>`).join("")}<span><i style="background:transparent;border:2px dashed var(--muted)"></i>Hasta fecha compromiso</span></div></div>
    <div class="gantt"><div class="g-row g-head"><div class="g-lbl"></div><div class="g-track">${marks.map(d=>`<span class="g-tick" style="left:${pos(d)}%">${fmtD(d).slice(0,5)}</span>`).join("")}<span class="g-today" style="left:${pos(hoy)}%"></span></div></div>
    ${list.slice().sort((a,b)=>new Date(a.reporte)-new Date(b.reporte)).map(i=>{const r=String(i.reporte).slice(0,10),f=i.cierre?String(i.cierre).slice(0,10):hoy;
      const x1=pos(r),x2=Math.max(pos(f)+100/span,x1+100/span),cp=i.compromiso?pos(i.compromiso)+100/span:null;
      return `<div class="g-row click" data-inc="${i.id}"><div class="g-lbl"><b>${esc(i.equipo_id)}</b> <span class="small muted">${esc(i.tipo_falla)}</span></div><div class="g-track">
        ${marks.map(d=>`<span class="g-grid" style="left:${pos(d)}%"></span>`).join("")}<span class="g-today" style="left:${pos(hoy)}%"></span>
        ${cp!==null&&cp>x2?`<span class="g-plan" style="left:${x2}%;width:${cp-x2}%"></span>`:""}
        <span class="g-bar" style="left:${x1}%;width:${x2-x1}%;background:${col[i.estatus]}" title="${esc(ESTATUS[i.estatus][0])} · ${fmtD(r)} → ${i.cierre?fmtD(f):"hoy"}${i.compromiso?" · compromiso "+fmtD(i.compromiso):""}"></span>
        ${vencida(i)?`<span class="g-flag" style="left:${cp}%" title="Compromiso vencido">!</span>`:""}</div></div>`}).join("")}</div></div>`;
}
function vRevision(){
  const r=weekDates(E.week),dias=[];for(let k=0;k<7;k++)dias.push(addDays(r.desde,k));
  const inW=t=>{const d=String(t).slice(0,10);return d>=r.desde&&d<=r.hasta};
  const nuevas=E.inc.filter(i=>inW(i.reporte)),cerr=E.inc.filter(i=>i.cierre&&inW(i.cierre));
  const pend=E.inc.filter(i=>String(i.reporte).slice(0,10)<=r.hasta&&(!i.cierre||String(i.cierre).slice(0,10)>r.hasta));
  const lim=r.hasta<today()?r.hasta:today();const venc=pend.filter(i=>i.compromiso&&i.compromiso<lim&&i.estatus!=="cerrada");
  const act=E.eq.filter(x=>x.estado!=="baja"),hoy=today(),diasP=dias.filter(d=>d<=hoy);
  const chkSet=new Set(E.chk.filter(c=>c.fecha>=r.desde&&c.fecha<=r.hasta).map(c=>c.equipo_id+"|"+c.fecha));
  const posibles=act.length*diasP.length,hechos=act.reduce((a,x)=>a+diasP.filter(d=>chkSet.has(x.id+"|"+d)).length,0);
  const rv=E.rev.find(x=>x.semana===E.week)||{};
  const opts=[];for(let k=-8;k<=1;k++)opts.push(isoWeek(addDays(today(),7*k)));
  return `<div class="filters"><div class="fld"><label for="rv-w">Semana</label><select id="rv-w">${[...new Set(opts.concat([E.week]))].sort().reverse().map(w=>`<option value="${w}" ${w===E.week?"selected":""}>${esc(weekLbl(w))}</option>`).join("")}</select></div></div>
  <div class="kpis">
    <div class="panel kpi"><div class="lbl">Nuevas fallas</div><div class="val">${nuevas.length}</div><div class="hint">reportadas en la semana</div></div>
    <div class="panel kpi"><div class="lbl">Reparaciones cerradas</div><div class="val" style="color:var(--ok)">${cerr.length}</div><div class="hint">en la semana</div></div>
    <div class="panel kpi"><div class="lbl">Pendientes al cierre</div><div class="val" style="${pend.length?"color:var(--bad)":""}">${pend.length}</div><div class="hint">${venc.length} con compromiso vencido</div></div>
    <div class="panel kpi"><div class="lbl">Cumplimiento checklist</div><div class="val">${posibles?Math.round(hechos/posibles*100):0}%</div><div class="hint">${hechos} de ${posibles} equipo-día</div><div class="meter"><i style="width:${posibles?hechos/posibles*100:0}%;background:var(--c-a)"></i></div></div>
  </div>
  <div class="panel" style="padding:0"><div class="ph"><h3>Equipos pendientes</h3></div><div class="scroll"><table><thead><tr><th>Equipo</th><th>Falla</th><th>Reporte</th><th>Owner</th><th>Compromiso</th><th>Estatus</th></tr></thead><tbody>${
    pend.length?pend.map(i=>`<tr class="click" data-inc="${i.id}"><td><b>${esc(i.equipo_id)}</b></td><td>${esc(i.tipo_falla)}</td><td class="small">${fmtTs(i.reporte)}</td><td class="small">${esc(i.owner||"—")}</td><td>${i.compromiso?(i.compromiso<lim&&i.estatus!=="cerrada"?chip(fmtD(i.compromiso),"bad"):fmtD(i.compromiso)):'<span class="chip warn">Sin fecha</span>'}</td><td>${chip(ESTATUS[i.estatus][0],ESTATUS[i.estatus][1])}</td></tr>`).join("")
    :`<tr><td colspan="6" class="empty">Sin equipos pendientes al cierre de la semana.</td></tr>`}</tbody></table></div></div>
  <div class="panel" style="padding:0"><div class="ph"><h3>Checklist de la semana</h3><span class="small muted">✓ revisado · ✗ con falla</span></div><div class="scroll"><table><thead><tr><th>Equipo</th>${dias.map(d=>`<th style="text-align:center">${esc(fmtDia(d))}</th>`).join("")}</tr></thead><tbody>${
    act.length?act.map(x=>`<tr><td><b>${esc(x.id)}</b> <span class="small muted">${esc(x.tipo)}</span></td>${dias.map(d=>{const l=E.chk.filter(c=>c.equipo_id===x.id&&c.fecha===d);
      return `<td style="text-align:center">${l.length?(l.some(c=>c.resultado==="falla")?'<b style="color:var(--bad)">✗</b>':'<b style="color:var(--ok)">✓</b>'):(d<=hoy?'<span style="color:var(--warn)">·</span>':"")}</td>`}).join("")}</tr>`).join("")
    :`<tr><td colspan="8" class="empty">Sin equipos.</td></tr>`}</tbody></table></div></div>
  <div class="panel"><div class="ph"><h3>Acuerdos de la revisión</h3>${rv.registro_email?`<span class="small muted">Actualizó ${esc(rv.registro_email)} · ${fmtTs(rv.actualizado)}</span>`:""}</div><div class="pb" style="display:grid;gap:10px">
    <div class="grid2"><div class="field"><label for="rv-fe">Fecha de la junta</label><input type="date" id="rv-fe" value="${esc(rv.fecha||"")}" ${canAdm()?"":"disabled"}></div><div class="field"><label for="rv-as">Asistentes</label><input type="text" id="rv-as" value="${esc(rv.asistentes||"")}" placeholder="Supervisores y responsables" ${canAdm()?"":"disabled"}></div></div>
    <div class="field"><label for="rv-ac">Acuerdos y compromisos</label><textarea id="rv-ac" rows="5" ${canAdm()?"":"disabled"}>${esc(rv.acuerdos||"")}</textarea></div>
    ${canAdm()?'<div><button class="btn primary" id="rv-save">Guardar acuerdos</button></div>':""}</div></div>`;
}
function vOwners(){
  const T=C.turnosUsed(),sups=C.supsUsed(),weeks=[];for(let k=-1;k<=7;k++)weeks.push(isoWeek(addDays(today(),7*k)));
  const cur=isoWeek(today());
  return `<div class="rep-top"><div class="small muted">Un owner por turno y por semana, rotando entre los supervisores. ${canAdm()?"Elige al owner de cada semana o genera la rotación.":""}</div>${canAdm()?'<button class="btn primary" id="ow-gen">Generar rotación de 8 semanas</button>':""}</div>
  <div class="panel" style="padding:0"><div class="scroll"><table><thead><tr><th>Semana</th>${T.map(t=>`<th>${esc(t)}</th>`).join("")}</tr></thead><tbody>${weeks.map(w=>`<tr${w===cur?' style="background:var(--accent-soft)"':""}><td class="nw"><b>${esc(weekLbl(w))}</b>${w===cur?" "+chip("Actual","acc"):""}</td>${T.map(t=>{const v=ownerOf(w,t);
    return `<td>${canAdm()?`<select data-own="${w}|${esc(t)}" aria-label="Owner ${esc(t)} ${w}"><option value="">Sin owner</option>${sups.map(s=>`<option ${s===v?"selected":""}>${esc(s)}</option>`).join("")}</select>`:esc(v||"—")}</td>`}).join("")}</tr>`).join("")}</tbody></table></div></div>
  <p class="small muted" style="margin:0">La rotación usa, para cada turno, a los supervisores que tienen personal en ese turno, en orden alfabético y continuando desde el owner actual.</p>`;
}
function vProveedores(){
  const tipos=cfgE().tipos,ed=canAdm(),dis=ed?"":"disabled";
  return `${ed?`<div class="toolbar"><input type="text" id="pv-new" class="grow" placeholder="Nuevo proveedor" aria-label="Nuevo proveedor"><button class="btn primary" id="pv-add">Agregar</button></div>`:""}
  <div class="perfiles">${E.prov.map(p=>`<div class="panel perfil" data-pv="${esc(p.nombre)}"><h3>${esc(p.nombre)}</h3>
    <div class="grid2"><div class="field"><label>Contacto</label><input type="text" data-pf="contacto" value="${esc(p.contacto)}" placeholder="Nombre del contacto" ${dis}></div>
    <div class="field"><label>Teléfono</label><input type="tel" data-pf="telefono" value="${esc(p.telefono)}" placeholder="33 0000 0000" ${dis}></div></div>
    <div class="field"><label>Correo</label><input type="email" data-pf="email" value="${esc(p.email)}" placeholder="servicio@proveedor.com" ${dis}></div>
    <div class="field"><label>Proceso de atención</label><textarea data-pf="proceso" rows="5" placeholder="1. Cómo se levanta el reporte (teléfono, correo, portal)&#10;2. Datos que pide (serial, falla, foto)&#10;3. Tiempo de respuesta comprometido&#10;4. Quién autoriza cotizaciones" ${dis}>${esc(p.proceso)}</textarea></div>
    <div class="field"><label>Equipos que atiende</label><div style="display:flex;gap:6px 12px;flex-wrap:wrap">${tipos.map(t=>`<label class="ck"><input type="checkbox" data-pt="${esc(t)}" ${(p.tipos||[]).includes(t)?"checked":""} ${dis}> ${esc(t)}</label>`).join("")}</div></div>
    ${!p.contacto&&!p.telefono?'<div class="banner">Falta capturar el contacto y el proceso de atención.</div>':""}
    ${ed?`<div class="row"><button class="btn primary" data-pvsave="${esc(p.nombre)}">Guardar</button><button class="btn danger" data-pvdel="${esc(p.nombre)}">Quitar</button></div>`:""}</div>`).join("")||'<div class="empty">Sin proveedores.</div>'}</div>`;
}
function vConfig(){
  const c=cfgE(),ed=canAdm(),dis=ed?"":"disabled";
  return `<div class="panel" style="padding:0"><div class="ph"><h3>Escalación de equipos críticos fuera de servicio</h3><span class="small muted">El nivel sube según las horas desde el reporte</span></div><div class="scroll"><table><thead><tr><th>Nivel</th><th>Desde (horas)</th><th>Responsable</th><th>Acción</th></tr></thead><tbody>${(c.escalacion||[]).map((l,i)=>`<tr><td><b>${l.nivel}</b></td><td><input type="number" min="0" data-esc="${i}|horas" value="${l.horas}" style="width:80px" ${dis}></td><td><input type="text" data-esc="${i}|quien" value="${esc(l.quien)}" ${dis}></td><td><input type="text" data-esc="${i}|accion" value="${esc(l.accion)}" style="width:100%;min-width:260px" ${dis}></td></tr>`).join("")}</tbody></table></div></div>
  <div class="grid-2">
    <div class="panel"><div class="ph"><h3>Avisar al reportar una falla</h3></div><div class="pb" style="display:grid;gap:8px"><p class="small muted" style="margin:0">Además del administrador y los owners de la semana. Un correo por línea.</p><textarea id="cf-not" rows="4" ${dis}>${esc((c.notificar||[]).join("\n"))}</textarea></div></div>
    <div class="panel"><div class="ph"><h3>Tipos de equipo y de falla</h3></div><div class="pb grid2"><div class="field"><label for="cf-tip">Tipos (uno por línea)</label><textarea id="cf-tip" rows="6" ${dis}>${esc(c.tipos.join("\n"))}</textarea></div><div class="field"><label for="cf-fal">Fallas (una por línea)</label><textarea id="cf-fal" rows="6" ${dis}>${esc(c.fallas.join("\n"))}</textarea></div></div></div>
  </div>
  <div class="panel"><div class="ph"><h3>Puntos del checklist por tipo</h3><span class="small muted">Uno por línea</span></div><div class="pb perfiles">${c.tipos.map(t=>`<div class="field"><label>${esc(t)}</label><textarea data-cl="${esc(t)}" rows="8" ${dis}>${esc((c.checklist[t]||[]).join("\n"))}</textarea></div>`).join("")}</div></div>
  ${ed?'<div><button class="btn primary" id="cf-save">Guardar ajustes</button></div>':""}`;
}

/* ---------- modales ---------- */
function modal(title,body,wide){
  $("#modal-root").innerHTML=`<div class="modal-scrim"><div class="panel modal" role="dialog" aria-modal="true" aria-labelledby="em-t" style="width:min(${wide?640:520}px,100%)"><div class="ph"><h3 id="em-t">${title}</h3><button class="btn" data-emx>Cancelar</button></div><div class="pb" style="display:grid;gap:12px">${body}<div id="em-err" style="color:var(--bad);font-size:13px;min-height:1.2em"></div></div></div></div>`;
  $("#modal-root [data-emx]").onclick=close;
}
const close=()=>$("#modal-root").innerHTML="";
const err=m=>{const e=$("#em-err");if(e)e.textContent=m};
const sel=(id,items,val,blank)=>`<select id="${id}">${blank!==undefined?`<option value="">${blank}</option>`:""}${items.map(i=>`<option ${i===val?"selected":""}>${esc(i)}</option>`).join("")}</select>`;
function openEq(id){
  const x=id?eqById(id):{id:"",tipo:cfgE().tipos[0]||"",serial:"",marca:"",modelo:"",area:"",sitio:"",critico:false,estado:"operativo",proveedor:"",notas:""};
  modal(id?"Editar "+esc(id):"Agregar equipo",`<div class="grid2">
    <div class="field"><label for="e-id">Código interno</label><input id="e-id" value="${esc(x.id)}" placeholder="TPE-01" ${id?"readonly":""}></div>
    <div class="field"><label for="e-tipo">Tipo</label>${sel("e-tipo",cfgE().tipos,x.tipo)}</div>
    <div class="field"><label for="e-serial">Número serial</label><input id="e-serial" value="${esc(x.serial)}"></div>
    <div class="field"><label for="e-marca">Marca</label><input id="e-marca" value="${esc(x.marca)}"></div>
    <div class="field"><label for="e-modelo">Modelo</label><input id="e-modelo" value="${esc(x.modelo)}"></div>
    <div class="field"><label for="e-area">Área</label>${sel("e-area",C.cfg().areas||[],x.area,"Sin área")}</div>
    <div class="field"><label for="e-sitio">Sitio</label><select id="e-sitio"><option value="">Sin sitio</option>${(C.cfg().sitios||[]).map(s=>`<option value="${esc(s)}" ${s===x.sitio?"selected":""}>${esc(C.sitioCorto(s))}</option>`).join("")}</select></div>
    <div class="field"><label for="e-prov">Proveedor</label>${sel("e-prov",E.prov.map(p=>p.nombre),x.proveedor,"Sin proveedor")}</div>
    <div class="field"><label for="e-est">Funcionalidad</label><select id="e-est">${Object.entries(ESTADO).map(([k,v])=>`<option value="${k}" ${x.estado===k?"selected":""}>${v[0]}</option>`).join("")}</select></div>
    <div class="field"><label>&nbsp;</label><label class="ck"><input type="checkbox" id="e-crit" ${x.critico?"checked":""}> Equipo crítico (escalación)</label></div></div>
    <div class="field"><label for="e-notas">Notas</label><textarea id="e-notas">${esc(x.notas)}</textarea></div>
    <div class="row" style="justify-content:space-between">${id&&!abiertas().some(i=>i.equipo_id===id)?`<button class="btn danger" id="e-del">Eliminar equipo</button>`:"<span></span>"}<button class="btn primary" id="e-save">Guardar</button></div>`);
  $("#e-save").onclick=async()=>{const row={id:$("#e-id").value.trim().toUpperCase(),tipo:$("#e-tipo").value,serial:$("#e-serial").value.trim(),marca:$("#e-marca").value.trim(),modelo:$("#e-modelo").value.trim(),area:$("#e-area").value,sitio:$("#e-sitio").value,proveedor:$("#e-prov").value,estado:$("#e-est").value,critico:$("#e-crit").checked,notas:$("#e-notas").value};
    if(!row.id){err("Escribe el código del equipo.");return}if(!id&&eqById(row.id)){err("Ya existe un equipo con ese código.");return}
    const {error}=await C.S.sb.from("equipos").upsert(row);if(error){err(error.message);return}close();C.toast("Equipo guardado");load()};
  const d=$("#e-del");if(d)d.onclick=async()=>{if(d.dataset.c!=="1"){d.dataset.c="1";d.textContent="¿Seguro? Se borra su historial";return}const {error}=await C.S.sb.from("equipos").delete().eq("id",id);if(error){err(error.message);return}close();C.toast("Equipo eliminado");load()};
}
function openInc(idInc,eqId,pre){
  const i=idInc?E.inc.find(x=>x.id===idInc):null,nuevo=!i;
  const x=i||Object.assign({equipo_id:eqId||"",tipo_falla:cfgE().fallas[0]||"",descripcion:"",critico:false,estatus:"abierta",turno:E.turno||C.turnosUsed()[0]||"",owner:"",proveedor:"",folio_proveedor:"",compromiso:"",solucion:""},pre||{});
  if(nuevo&&!x.owner)x.owner=ownerOf(isoWeek(today()),x.turno);
  const eqs=E.eq.filter(e=>e.estado!=="baja"||e.id===x.equipo_id),ro=!canOp();
  const e0=eqById(x.equipo_id);if(nuevo&&e0&&!x.proveedor)x.proveedor=e0.proveedor||"";
  const n=i&&i.estatus!=="cerrada"?nivelEsc(i):null;
  modal(nuevo?"Reportar falla":"Reparación de "+esc(x.equipo_id),`
    ${n?`<div class="banner">Escalación <b>nivel ${n.nivel}</b> (${Math.round(hoursSince(i.reporte))} h fuera de servicio): ${esc(n.quien)} · ${esc(n.accion)}</div>`:""}
    <div class="grid2">
    <div class="field"><label for="i-eq">Equipo</label><select id="i-eq" ${nuevo?"":"disabled"}>${eqs.map(e=>`<option value="${esc(e.id)}" ${e.id===x.equipo_id?"selected":""}>${esc(e.id)} · ${esc(e.tipo)}</option>`).join("")}</select></div>
    <div class="field"><label for="i-falla">Tipo de falla</label>${sel("i-falla",cfgE().fallas,x.tipo_falla)}</div>
    <div class="field"><label for="i-turno">Turno</label>${sel("i-turno",C.turnosUsed(),x.turno)}</div>
    <div class="field"><label for="i-owner">Owner</label>${sel("i-owner",C.supsUsed(),x.owner,"Sin owner")}</div>
    <div class="field"><label for="i-prov">Proveedor</label>${sel("i-prov",E.prov.map(p=>p.nombre),x.proveedor,"Sin proveedor")}</div>
    <div class="field"><label for="i-folio">Folio del proveedor</label><input id="i-folio" value="${esc(x.folio_proveedor)}"></div>
    <div class="field"><label for="i-comp">Fecha compromiso</label><input type="date" id="i-comp" value="${esc(x.compromiso||"")}"></div>
    <div class="field"><label for="i-est">Estatus</label><select id="i-est">${Object.entries(ESTATUS).map(([k,v])=>`<option value="${k}" ${x.estatus===k?"selected":""}>${v[0]}</option>`).join("")}</select></div></div>
    <div class="field"><label for="i-desc">Descripción de la falla</label><textarea id="i-desc">${esc(x.descripcion)}</textarea></div>
    ${nuevo?"":`<div class="field"><label for="i-sol">Solución / comentarios de cierre</label><textarea id="i-sol">${esc(x.solucion)}</textarea></div>`}
    <label class="ck"><input type="checkbox" id="i-crit" ${x.critico||(e0&&e0.critico)?"checked":""}> Crítico: detiene la operación</label>
    ${i?`<div class="small muted">Reportó ${esc(i.reporto_email||"")} · ${fmtTs(i.reporte)}${i.cierre?" · cerrada "+fmtTs(i.cierre):""}</div>`:""}
    ${ro?"":`<div class="row" style="justify-content:flex-end"><button class="btn primary" id="i-save">${nuevo?"Reportar":"Guardar"}</button></div>`}`,true);
  const pv=()=>{const e=eqById($("#i-eq").value);if(e&&e.proveedor&&!$("#i-prov").value)$("#i-prov").value=e.proveedor;if(e&&e.critico)$("#i-crit").checked=true};
  $("#i-eq").onchange=pv;$("#i-turno").onchange=()=>{if(nuevo)$("#i-owner").value=ownerOf(isoWeek(today()),$("#i-turno").value)};
  const b=$("#i-save");if(b)b.onclick=async()=>{b.disabled=true;
    const row={equipo_id:$("#i-eq").value,tipo_falla:$("#i-falla").value,turno:$("#i-turno").value,owner:$("#i-owner").value,proveedor:$("#i-prov").value,folio_proveedor:$("#i-folio").value.trim(),compromiso:$("#i-comp").value||null,estatus:$("#i-est").value,descripcion:$("#i-desc").value.trim(),critico:$("#i-crit").checked};
    if(!row.equipo_id){err("Elige el equipo.");b.disabled=false;return}
    let r;if(nuevo){row.reporto_email=(C.S.session.user.email||"").toLowerCase();r=await C.S.sb.from("eq_incidencias").insert(row)}
    else{row.solucion=$("#i-sol").value.trim();if(row.estatus==="cerrada"&&!row.solucion){err("Escribe la solución para cerrar la reparación.");b.disabled=false;return}r=await C.S.sb.from("eq_incidencias").update(row).eq("id",i.id)}
    if(r.error){err(r.error.message);b.disabled=false;return}close();C.toast(nuevo?"Falla reportada · se avisó a los responsables":"Reparación actualizada");load()};
}
function openCk(eqId){
  const x=eqById(eqId),prev=E.chk.find(c=>c.equipo_id===eqId&&c.fecha===E.fecha&&c.turno===E.turno);
  const items=(cfgE().checklist[x.tipo]||["Estado general"]).map(it=>{const p=prev&&(prev.items||[]).find(z=>z.item===it);return{item:it,ok:p?p.ok:true,nota:p?p.nota||"":""}});
  modal(`Checklist ${esc(x.id)} · ${esc(x.tipo)}`,`<div class="small muted">${fmtD(E.fecha)} · ${esc(E.turno)} · ${esc(x.marca)} ${esc(x.serial)}</div>
    <div class="scroll"><table><thead><tr><th>Punto de revisión</th><th style="text-align:center">OK</th><th style="text-align:center">Falla</th><th>Nota</th></tr></thead><tbody>${items.map((it,k)=>`<tr><td>${esc(it.item)}</td>
      <td style="text-align:center"><input type="radio" name="ck${k}" value="1" ${it.ok?"checked":""} aria-label="${esc(it.item)} OK"></td><td style="text-align:center"><input type="radio" name="ck${k}" value="0" ${it.ok?"":"checked"} aria-label="${esc(it.item)} falla"></td>
      <td><input type="text" data-ckn="${k}" value="${esc(it.nota)}" style="width:100%;min-width:120px"></td></tr>`).join("")}</tbody></table></div>
    <div class="field"><label for="ck-obs">Observaciones</label><textarea id="ck-obs">${esc(prev?prev.observaciones:"")}</textarea></div>
    <div id="ck-inc" class="panel" style="padding:10px;display:none;gap:8px"><label class="ck"><input type="checkbox" id="ck-rep" checked> Reportar la falla como incidencia (pone el equipo fuera de servicio y avisa)</label>
      <div class="grid2"><div class="field"><label for="ck-falla">Tipo de falla</label>${sel("ck-falla",cfgE().fallas,cfgE().fallas[0])}</div><div class="field"><label>&nbsp;</label><label class="ck"><input type="checkbox" id="ck-crit" ${x.critico?"checked":""}> Crítico</label></div></div></div>
    <div class="row" style="justify-content:flex-end"><button class="btn primary" id="ck-save">Guardar checklist</button></div>`,true);
  const upd=()=>{const f=items.some((_,k)=>(document.querySelector(`input[name=ck${k}]:checked`)||{}).value==="0");$("#ck-inc").style.display=f&&!(abiertas().some(i=>i.equipo_id===eqId))?"grid":"none"};
  document.querySelectorAll('#modal-root input[type=radio]').forEach(r=>r.onchange=upd);upd();
  $("#ck-save").onclick=async()=>{const b=$("#ck-save");b.disabled=true;
    const it=items.map((z,k)=>({item:z.item,ok:(document.querySelector(`input[name=ck${k}]:checked`)||{}).value!=="0",nota:document.querySelector(`[data-ckn="${k}"]`).value.trim()}));
    const falla=it.some(z=>!z.ok);
    const row={equipo_id:eqId,fecha:E.fecha,turno:E.turno,items:it,resultado:falla?"falla":"ok",observaciones:$("#ck-obs").value.trim(),reviso_email:(C.S.session.user.email||"").toLowerCase()};
    const {error}=await C.S.sb.from("eq_checklists").upsert(row,{onConflict:"equipo_id,fecha,turno"});if(error){err(error.message);b.disabled=false;return}
    const rep=$("#ck-rep");
    if(falla&&$("#ck-inc").style.display!=="none"&&rep&&rep.checked){
      const r=await C.S.sb.from("eq_incidencias").insert({equipo_id:eqId,tipo_falla:$("#ck-falla").value,descripcion:"Checklist: "+it.filter(z=>!z.ok).map(z=>z.item+(z.nota?" ("+z.nota+")":"")).join(", "),critico:$("#ck-crit").checked,turno:E.turno,owner:ownerOf(isoWeek(E.fecha),E.turno),proveedor:x.proveedor||"",reporto_email:row.reviso_email});
      if(r.error){err("Checklist guardado, pero no se pudo reportar la falla: "+r.error.message);b.disabled=false;return}
    }
    close();C.toast(falla?"Checklist con falla guardado":"Checklist guardado");load()};
}

/* ---------- render y eventos ---------- */
function render(root){
  C=window.CP;
  if(!E.loaded){root.innerHTML='<div class="panel empty">Cargando equipos…</div>';load();return}
  if(E.error){root.innerHTML=`<div class="banner">No se pudo cargar el módulo de equipos: ${esc(E.error.message)}</div>`;return}
  const body={tablero:vTablero,equipos:vEquipos,checklist:vChecklist,reparaciones:vReparaciones,revision:vRevision,owners:vOwners,proveedores:vProveedores,config:vConfig}[E.sub]||vTablero;
  const pend=abiertas().length;
  root.innerHTML=`<div class="seg eq-subs" role="tablist" aria-label="Secciones de equipos">${SUBS.map(([k,l])=>`<button role="tab" data-esub="${k}" aria-selected="${E.sub===k}">${l}${k==="reparaciones"&&pend?` <span class="tab-n" style="margin-left:4px">${pend}</span>`:""}</button>`).join("")}</div>`+body();
  if(!root.dataset.bound){root.dataset.bound="1";bind(root)}
}
function bind(root){
  root.addEventListener("click",async e=>{
    const t=e.target;
    const sb=t.closest("[data-esub]");if(sb){E.sub=sb.dataset.esub;try{localStorage.setItem("cp_eq_sub",E.sub)}catch(_){}C.renderActive();return}
    if(t.closest("[data-eqnew]")){openEq(null);return}
    const ed=t.closest("[data-eqedit]");if(ed){openEq(ed.dataset.eqedit);return}
    const ni=t.closest("[data-incnew]");if(ni){openInc(null,ni.dataset.incnew||"");return}
    const ri=t.closest("[data-inc]");if(ri&&!t.closest("button,select,input")){openInc(ri.dataset.inc);return}
    const ck=t.closest("[data-ckopen]");if(ck){openCk(ck.dataset.ckopen);return}
    const rv=t.closest("[data-rv]");if(rv){E.repView=rv.dataset.rv;C.renderActive();return}
    if(t.id==="rv-save"){const row={semana:E.week,fecha:$("#rv-fe").value||null,asistentes:$("#rv-as").value.trim(),acuerdos:$("#rv-ac").value,registro_email:(C.S.session.user.email||"").toLowerCase(),actualizado:new Date().toISOString()};
      const {error}=await C.S.sb.from("eq_revisiones").upsert(row);if(error){C.toast(error.message);return}C.toast("Acuerdos guardados");load();return}
    if(t.id==="ow-gen"){await genRotacion();return}
    if(t.id==="pv-add"){const n=$("#pv-new").value.trim();if(!n)return;const {error}=await C.S.sb.from("eq_proveedores").insert({nombre:n});if(error){C.toast(error.message);return}C.toast("Proveedor agregado");load();return}
    const ps=t.closest("[data-pvsave]");if(ps){const card=ps.closest("[data-pv]"),row={nombre:ps.dataset.pvsave};card.querySelectorAll("[data-pf]").forEach(x=>row[x.dataset.pf]=x.value.trim());row.tipos=[...card.querySelectorAll("[data-pt]")].filter(x=>x.checked).map(x=>x.dataset.pt);
      const {error}=await C.S.sb.from("eq_proveedores").upsert(row);if(error){C.toast(error.message);return}C.toast("Proveedor guardado");load();return}
    const pd=t.closest("[data-pvdel]");if(pd){if(pd.dataset.c!=="1"){pd.dataset.c="1";pd.textContent="¿Seguro?";return}const {error}=await C.S.sb.from("eq_proveedores").delete().eq("nombre",pd.dataset.pvdel);if(error){C.toast(error.message);return}load();return}
    if(t.id==="cf-save"){const c=JSON.parse(JSON.stringify(cfgE()));const lines=v=>v.split("\n").map(s=>s.trim()).filter(Boolean);
      c.tipos=lines($("#cf-tip").value);c.fallas=lines($("#cf-fal").value);c.notificar=lines($("#cf-not").value).map(s=>s.toLowerCase());
      document.querySelectorAll("[data-esc]").forEach(x=>{const [i,k]=x.dataset.esc.split("|");c.escalacion[+i][k]=k==="horas"?Math.max(0,+x.value||0):x.value.trim()});
      const cl={};document.querySelectorAll("[data-cl]").forEach(x=>cl[x.dataset.cl]=lines(x.value));c.tipos.forEach(t2=>{if(!cl[t2])cl[t2]=c.checklist[t2]||[]});c.checklist=cl;
      const {error}=await C.S.sb.from("eq_config").upsert({id:1,data:c});if(error){C.toast(error.message);return}C.toast("Ajustes guardados");load();return}
  });
  root.addEventListener("change",async e=>{
    const t=e.target;
    if(t.id==="eq-ft"){E.eqFil.tipo=t.value;C.renderActive()}else if(t.id==="eq-fe"){E.eqFil.estado=t.value;C.renderActive()}
    else if(t.id==="ck-f"){if(t.value)E.fecha=t.value;C.renderActive()}else if(t.id==="ck-t"){E.turno=t.value;C.renderActive()}
    else if(t.id==="rp-f"){E.repFil=t.value;C.renderActive()}else if(t.id==="rv-w"){E.week=t.value;C.renderActive()}
    else if(t.dataset.own){const [sem,tu]=t.dataset.own.split("|");const {error}=await C.S.sb.from("eq_owners").upsert({semana:sem,turno:tu,supervisor:t.value});if(error){C.toast(error.message);return}C.toast("Owner actualizado");load()}
  });
  root.addEventListener("input",e=>{if(e.target.id==="eq-q"){E.eqFil.q=e.target.value;clearTimeout(E.qt);E.qt=setTimeout(()=>{C.renderActive();const q=$("#eq-q");if(q){q.focus();q.setSelectionRange(q.value.length,q.value.length)}},250)}});
}
async function genRotacion(){
  const T=C.turnosUsed(),cur=isoWeek(today()),rows=[];
  T.forEach(t=>{
    const cand=[...new Set(C.active().filter(e=>e.turno===t&&e.supervisor).map(e=>e.supervisor))].filter(s=>C.supsUsed().includes(s)).sort((a,b)=>a.localeCompare(b));
    if(!cand.length)return;let i=Math.max(0,cand.indexOf(ownerOf(cur,t)));if(!ownerOf(cur,t))i=0;
    for(let k=0;k<8;k++){const w=isoWeek(addDays(today(),7*k));rows.push({semana:w,turno:t,supervisor:cand[(i+k)%cand.length]})}
  });
  if(!rows.length){C.toast("No hay supervisores con personal en los turnos");return}
  const {error}=await C.S.sb.from("eq_owners").upsert(rows);if(error){C.toast(error.message);return}C.toast("Rotación generada para 8 semanas");load();
}
window.CPE={render,reload(){E.loading=false;load()}};
})();
