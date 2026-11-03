/* Control de Personal B2/B2B — app estática (GitHub Pages) con datos en Supabase */
(function(){
"use strict";
const ST={A:"Asistencia",R:"Retardo",F:"Falta",P:"Permiso",V:"Vacaciones",I:"Incapacidad"};
const PRESENT=new Set(["A","R"]);
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pad=n=>String(n).padStart(2,"0");
const ymd=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const addDays=(s,n)=>{const d=new Date(s+"T12:00:00");d.setDate(d.getDate()+n);return ymd(d)};
const fmtD=s=>{if(!s)return"";const [y,m,d]=String(s).slice(0,10).split("-");return d+"/"+m+"/"+y};
const VIEWS=["cobertura","lista","personal","catalogos"];
const sitioCorto=x=>String(x||"").replace(/^MX Guadalajara North\s*/i,"")||String(x||"");

const S={sb:null,session:null,rol:"lector",perms:new Set(),isAdmin:false,canMark:false,canPersonal:false,canCatalog:false,canReq:false,roles:[],emps:new Map(),cfg:null,att:{},date:ymd(new Date()),
  tab:"cobertura",dim:"posicion",editReq:false,sel:null,loaded:false,channel:null,users:[],cat:"perfiles"};
try{const d=localStorage.getItem("cp_dim");if(d)S.dim=d;const c=localStorage.getItem("cp_cat");if(c)S.cat=c;}catch(e){}

const PERMS=[
  {id:"pasar_lista",label:"Pasar lista",desc:"Marcar asistencia, retardos, faltas, permisos, vacaciones e incapacidades."},
  {id:"editar_personal",label:"Editar personal",desc:"Altas, bajas y fichas: celular, turno, área, sitio, gerente y certificaciones de cada persona."},
  {id:"editar_catalogos",label:"Editar catálogos",desc:"Perfiles, áreas, sitios, gerentes, turnos y tipos de certificación."},
  {id:"editar_requeridos",label:"Editar requeridos",desc:"Cuántas personas requiere cada área o posición por turno en la cobertura."}
];
const DEFAULT_ROLES=[{nombre:"admin",permisos:PERMS.map(p=>p.id)},{nombre:"supervisor",permisos:["pasar_lista"]},{nombre:"lector",permisos:[]}];
const DEFAULT_CFG={areas:[],posiciones:[],turnos:["1 Gdl","2 Gdl","3 Gdl"],sitios:[],gerentes:[],perfiles:{},certs:[],certReq:{},req:{area:{},posicion:{}}};
const cfg=()=>S.cfg||DEFAULT_CFG;
const active=()=>[...S.emps.values()].filter(e=>e.activo!==false);
const markOf=e=>S.att[e.num]||null;
const certValid=(c,on)=>c&&(!c.vence||c.vence>=on);
const missingCerts=(e,on)=>{const req=(cfg().certReq||{})[e.posicion]||[];return req.filter(n=>!(e.certs||[]).some(c=>c.nombre===n&&certValid(c,on)))};

function toast(msg){const t=document.createElement("div");t.className="toast";t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),2600)}
function errMsg(e){
  const m=(e&&(e.message||e.error_description))||"";
  if(/row-level security|permission|42501/i.test(m+(e&&e.code)))return"Tu usuario no tiene permiso para este cambio. Pide al administrador que revise tu rol.";
  if(/Failed to fetch|NetworkError/i.test(m))return"Sin conexión. Revisa tu internet e intenta de nuevo.";
  return"No se pudo guardar: "+(m||"error desconocido");
}

/* ---------- selects ---------- */
function fillSelect(el,items,allLabel,lab){
  const cur=el.value;lab=lab||(x=>x);
  el.innerHTML=(allLabel?`<option value="">${esc(allLabel)}</option>`:"")+items.map(i=>`<option value="${esc(i)}">${esc(lab(i))}</option>`).join("");
  if([...el.options].some(o=>o.value===cur))el.value=cur;
}
function turnosUsed(){const c=cfg().turnos.slice();active().forEach(e=>{if(e.turno&&!c.includes(e.turno))c.push(e.turno)});return c}
function refreshSelects(){
  const C=cfg(),T=turnosUsed();
  fillSelect($("#cov-turno"),T,"Todos los turnos");
  const lt=$("#l-turno");const had=lt.value;
  fillSelect(lt,T,null);
  if(!had){const first=T.find(t=>active().some(e=>e.turno===t));if(first)lt.value=first;}
  fillSelect($("#l-pos"),C.posiciones,"Todas las posiciones");
  fillSelect($("#l-area"),C.areas,"Todas las áreas");
  fillSelect($("#p-turno"),T,"Todos los turnos");
  fillSelect($("#p-pos"),C.posiciones,"Todas las posiciones");
  fillSelect($("#p-area"),C.areas,"Todas las áreas");
  const sit=listUsed("sitios","sitio");
  ["#cov-sitio","#l-sitio","#p-sitio"].forEach(id=>fillSelect($(id),sit,"Todos los sitios",sitioCorto));
  fillSelect($("#p-ger"),listUsed("gerentes","gerente"),"Todos los gerentes");
}
function listUsed(k,f){const c=(cfg()[k]||[]).slice();active().forEach(e=>{if(e[f]&&!c.includes(e[f]))c.push(e[f])});return c}
const covBase=()=>{const st=$("#cov-sitio").value;return active().filter(e=>!st||e.sitio===st)};

/* ---------- coverage ---------- */
function coverage(){
  const C=cfg(),dim=S.dim,T=turnosUsed(),on=S.date;
  const keys=dim==="area"?C.areas.slice():C.posiciones.slice();
  const cells={};
  const get=(k,t)=>{const id=k+"__"+t;return cells[id]||(cells[id]={k,t,plant:[],pres:[],aus:[],pend:[],sinCert:[]})};
  covBase().forEach(e=>{
    let k=e[dim]||"";if(!keys.includes(k))k="";
    const c=get(k,e.turno);c.plant.push(e);
    const s=markOf(e);
    if(!s)c.pend.push(e);else if(PRESENT.has(s)){c.pres.push(e);if(missingCerts(e,on).length)c.sinCert.push(e)}else c.aus.push(e);
  });
  const reqMap=(C.req||{})[dim]||{};
  const rows=[];
  keys.concat([""]).forEach(k=>{
    const r={k,cells:[]};let any=false;
    T.forEach(t=>{
      const c=get(k,t);const rq=reqMap[k+"__"+t];
      c.custom=!(rq===undefined||rq===null||rq==="");
      c.req=c.custom?Number(rq):c.plant.length;
      c.falta=Math.max(0,c.req-c.pres.length);
      c.state=(c.req===0&&!c.plant.length)?"none":c.pres.length>=c.req?"ok":(c.pres.length+c.pend.length>=c.req?"pend":"bad");
      if(k==="")c.state=c.plant.length?"ok":"none";
      if(c.plant.length||c.req)any=true;r.cells.push(c);
    });
    if(any||S.editReq&&k!=="")rows.push(r);
  });
  return {rows,T,cells};
}

function renderCobertura(){
  const {rows,T}=coverage();const ft=$("#cov-turno").value;
  const TT=ft?[ft]:T;
  const all=covBase().filter(e=>!ft||e.turno===ft);
  let pres=0,aus=0,pend=0;all.forEach(e=>{const s=markOf(e);if(!s)pend++;else if(PRESENT.has(s))pres++;else aus++});
  const flat=rows.flatMap(r=>r.cells).filter(c=>c.k!==""&&TT.includes(c.t));
  const bad=flat.filter(c=>c.state==="bad"),pendC=flat.filter(c=>c.state==="pend"),certW=flat.filter(c=>c.sinCert.length);
  const noun=S.dim==="area"?"Áreas":"Posiciones";
  $("#cov-kpis").innerHTML=`
    <div class="kpi"><span class="lbl">Plantilla</span><span class="val">${all.length}</span><span class="hint">${ft?esc(ft):"todos los turnos"}</span></div>
    <div class="kpi ok"><span class="lbl">Presentes</span><span class="val">${pres}</span><span class="hint">asistencia + retardo</span></div>
    <div class="kpi ${aus?"bad":""}"><span class="lbl">Ausentes</span><span class="val">${aus}</span><span class="hint">falta, permiso, vacaciones, incapacidad</span></div>
    <div class="kpi ${pend?"warn":""}"><span class="lbl">Sin registrar</span><span class="val">${pend}</span><span class="hint">falta pasar lista</span></div>
    <div class="kpi ${bad.length?"bad":"ok"}"><span class="lbl">${noun} descubiertas</span><span class="val">${bad.length}</span><span class="hint">${pendC.length} por confirmar</span></div>`;

  let h="";
  if(bad.length||certW.length){
    h+=`<div class="alerts">`;
    bad.sort((a,b)=>b.falta-a.falta).forEach(c=>{
      h+=`<div class="alert"><h3>${esc(c.k)} <span class="chip bad">faltan ${c.falta}</span> <span class="muted" style="font-size:14px;font-family:var(--f-body)">${esc(c.t)} · ${c.pres.length}/${c.req}</span></h3>`;
      const out=c.aus.concat(c.pend);
      if(out.length){h+=`<ul>`+out.map(e=>{const s=markOf(e);return `<li><span>${esc(e.nombre)} <span class="chip ${s?"bad":"warn"}">${s?ST[s]:"Sin registrar"}</span></span><span class="tel">${esc(e.celular||"sin celular")}</span></li>`}).join("")+`</ul>`}
      else h+=`<span class="muted" style="font-size:13px">No hay personas asignadas suficientes para el requerido.</span>`;
      h+=`</div>`;
    });
    certW.forEach(c=>{
      h+=`<div class="alert cert"><h3>${esc(c.k)} <span class="chip warn">sin certificación</span> <span class="muted" style="font-size:14px;font-family:var(--f-body)">${esc(c.t)}</span></h3><ul>`+
        c.sinCert.map(e=>`<li><span>${esc(e.nombre)}</span><span class="muted">${esc(missingCerts(e,S.date).join(", "))}</span></li>`).join("")+`</ul></div>`;
    });
    h+=`</div>`;
  } else if(active().length){
    h=`<div class="banner info">${pend?`Ninguna ${S.dim==="area"?"área":"posición"} descubierta todavía. Quedan ${pend} personas sin registrar.`:`Todas las ${noun.toLowerCase()} están cubiertas.`}</div>`;
  }
  $("#cov-alerts").innerHTML=h;

  if(!active().length){$("#cov-matrix").innerHTML=`<div class="empty">${S.loaded?"Aún no hay personal. Agrégalo en la pestaña Personal.":"Cargando personal…"}</div>`;$("#cov-detail").innerHTML="";return}
  let m=`<table class="matrix"><thead><tr><th>${S.dim==="area"?"Área":"Posición"}</th>${TT.map(t=>`<th>${esc(t)}</th>`).join("")}</tr></thead><tbody>`;
  rows.forEach(r=>{
    const cs=r.cells.filter(c=>TT.includes(c.t));
    if(!S.editReq&&!cs.some(c=>c.plant.length||c.req))return;
    m+=`<tr><td><b>${r.k?esc(r.k):'<span class="muted">Sin asignar</span>'}</b></td>`;
    cs.forEach(c=>{
      const id=c.k+"__"+c.t;
      if(S.editReq&&r.k!==""){
        m+=`<td class="cell"><input type="number" min="0" class="reqin num" data-req="${esc(id)}" value="${c.custom?c.req:""}" placeholder="${c.plant.length}" aria-label="Requeridos ${esc(r.k)} ${esc(c.t)}"> <small class="muted">plantilla ${c.plant.length}</small></td>`;return;
      }
      if(c.state==="none"&&!c.plant.length){m+=`<td class="cell"><div class="cellbox none"><small>—</small></div></td>`;return}
      const lbl=r.k===""?`${c.pres.length}<span> pres.</span>`:`${c.pres.length}<span>/${c.req}</span>`;
      const notes=[];if(c.aus.length)notes.push(c.aus.length+" aus.");if(c.pend.length)notes.push(c.pend.length+" sin reg.");if(c.sinCert.length)notes.push(`<span style="color:var(--warn)">${c.sinCert.length} sin cert.</span>`);
      m+=`<td class="cell"><button class="cellbox ${r.k===""?"":c.state} ${S.sel===id?"sel":""}" data-cell="${esc(id)}"><span class="big">${lbl}</span><small>${notes.join(" · ")||"&nbsp;"}</small></button></td>`;
    });
    m+=`</tr>`;
  });
  m+=`</tbody></table>`;
  if(S.editReq)m+=`<p class="muted" style="margin:10px 0 0">Vacío = usa la plantilla asignada como requerido. Los cambios se guardan al salir de cada casilla.</p>`;
  $("#cov-matrix").innerHTML=m;
  renderCellDetail();
}
function renderCellDetail(){
  const el=$("#cov-detail");if(!S.sel){el.innerHTML="";return}
  const {cells}=coverage();const c=cells[S.sel];if(!c){el.innerHTML="";return}
  const ppl=c.plant.slice().sort((a,b)=>a.nombre.localeCompare(b.nombre));
  el.innerHTML=`<div class="panel"><h2>${c.k?esc(c.k):"Sin asignar"} · ${esc(c.t)} <span class="sub">${c.pres.length} presentes de ${c.req} requeridos</span></h2>
  <div class="scroll"><table><thead><tr><th>Nombre</th><th>${S.dim==="area"?"Posición":"Área"}</th><th>Estado</th><th>Celular</th><th>Certificaciones</th></tr></thead><tbody>${
    ppl.map(e=>{const s=markOf(e);const miss=missingCerts(e,S.date);return `<tr class="click" data-emp="${esc(e.num)}"><td>${esc(e.nombre)}<div class="mono muted">${esc(e.num)}</div></td><td>${esc((S.dim==="area"?e.posicion:e.area)||"—")}</td>
      <td>${s?`<span class="chip ${PRESENT.has(s)?"ok":"bad"}">${ST[s]}</span>`:`<span class="chip warn">Sin registrar</span>`}</td><td class="tel">${esc(e.celular||"—")}</td>
      <td>${(e.certs||[]).length?(e.certs||[]).map(x=>`<span class="chip ${certValid(x,S.date)?"ok":"bad"}">${esc(x.nombre)}</span>`).join(" "):'<span class="muted">—</span>'}${miss.length?` <span class="chip warn">falta ${esc(miss.join(", "))}</span>`:""}</td></tr>`}).join("")||`<tr><td colspan="5" class="muted">Nadie asignado aquí.</td></tr>`
  }</tbody></table></div></div>`;
}

/* ---------- roll call ---------- */
function rollPeople(){
  const t=$("#l-turno").value,p=$("#l-pos").value,a=$("#l-area").value,st=$("#l-sitio").value,q=$("#l-q").value.trim().toLowerCase();
  return active().filter(e=>e.turno===t&&(!p||e.posicion===p)&&(!a||e.area===a)&&(!st||e.sitio===st)&&(!q||e.nombre.toLowerCase().includes(q)||String(e.num).includes(q)))
    .sort((x,y)=>(x.posicion||"").localeCompare(y.posicion||"")||x.nombre.localeCompare(y.nombre));
}
function renderLista(){
  const ppl=rollPeople();const cnt={};let pend=0;
  ppl.forEach(e=>{const s=markOf(e);if(s)cnt[s]=(cnt[s]||0)+1;else pend++});
  $("#l-sum").innerHTML=`<span class="chip">${ppl.length} personas</span>`+Object.keys(ST).filter(k=>cnt[k]).map(k=>`<span class="chip ${PRESENT.has(k)?"ok":"bad"}">${ST[k]}: ${cnt[k]}</span>`).join("")+(pend?`<span class="chip warn">Sin registrar: ${pend}</span>`:`<span class="chip ok">Lista completa</span>`);
  $("#l-all").disabled=!pend||!S.canMark;
  if(!ppl.length){$("#l-list").innerHTML=`<div class="empty">${S.loaded?"No hay personas con estos filtros.":"Cargando personal…"}</div>`;return}
  $("#l-list").innerHTML=ppl.map(e=>{const s=markOf(e);
    return `<div class="rrow"><div class="who"><b>${esc(e.nombre)}</b><span><span class="mono">${esc(e.num)}</span> · ${esc(e.posicion||"sin posición")}${e.area?" · "+esc(e.area):""}${e.celular?` · <span class="tel">${esc(e.celular)}</span>`:""}</span></div>
    <div class="marks">${Object.keys(ST).map(k=>`<button class="mk s-${k} ${s===k?"on":""}" data-mark="${k}" data-emp="${esc(e.num)}" title="${ST[k]}" aria-label="${ST[k]}: ${esc(e.nombre)}" aria-pressed="${s===k}" ${S.canMark?"":"disabled"}>${k}</button>`).join("")}</div></div>`}).join("");
}
async function mark(num,s){
  const e=S.emps.get(num);if(!e)return;
  const cur=markOf(e);const fecha=S.date;
  const prev=S.att[num];
  if(cur===s){delete S.att[num]}else S.att[num]=s;
  renderActive();
  const q=cur===s
    ?S.sb.from("asistencia").delete().match({fecha,num})
    :S.sb.from("asistencia").upsert({fecha,num,estado:s,turno:e.turno,marcado_por:S.session.user.id,marcado_en:new Date().toISOString()});
  const {error}=await q;
  if(error){if(prev)S.att[num]=prev;else delete S.att[num];renderActive();toast(errMsg(error))}
}
async function markAll(){
  const ppl=rollPeople().filter(e=>!markOf(e));if(!ppl.length)return;
  const fecha=S.date,now=new Date().toISOString(),uid=S.session.user.id;
  ppl.forEach(e=>S.att[e.num]="A");renderActive();
  const {error}=await S.sb.from("asistencia").upsert(ppl.map(e=>({fecha,num:e.num,estado:"A",turno:e.turno,marcado_por:uid,marcado_en:now})));
  if(error){ppl.forEach(e=>delete S.att[e.num]);renderActive();toast(errMsg(error))}else toast(`${ppl.length} marcados como asistencia`);
}

/* ---------- personal ---------- */
function renderPersonal(){
  $("#p-new").hidden=!S.canPersonal;
  const q=$("#p-q").value.trim().toLowerCase(),t=$("#p-turno").value,p=$("#p-pos").value,a=$("#p-area").value,st=$("#p-sitio").value,g=$("#p-ger").value,b=$("#p-bajas").checked;
  const ppl=[...S.emps.values()].filter(e=>(b||e.activo!==false)&&(!t||e.turno===t)&&(!p||e.posicion===p)&&(!a||e.area===a)&&(!st||e.sitio===st)&&(!g||e.gerente===g)&&
    (!q||e.nombre.toLowerCase().includes(q)||String(e.num).includes(q)||(e.celular||"").includes(q))).sort((x,y)=>x.nombre.localeCompare(y.nombre));
  if(!ppl.length){$("#p-table").innerHTML=`<div class="empty">${S.loaded?"Sin resultados.":"Cargando personal…"}</div>`;return}
  const soon=addDays(S.date,30);
  $("#p-table").innerHTML=`<table><thead><tr><th>Nombre</th><th>Turno</th><th>Posición</th><th>Área</th><th>Sitio</th><th>Reporta a</th><th>Celular</th><th>Certificaciones</th><th>Hoy</th></tr></thead><tbody>${
    ppl.map(e=>{const s=markOf(e);const miss=missingCerts(e,S.date);
      const certs=(e.certs||[]).map(c=>{const st=!certValid(c,S.date)?"bad":(c.vence&&c.vence<=soon?"warn":"ok");return `<span class="chip ${st}" title="${c.vence?"Vence "+fmtD(c.vence):"Sin vencimiento"}">${esc(c.nombre)}</span>`}).join(" ");
      return `<tr class="click" data-emp="${esc(e.num)}"><td><b style="font-weight:600">${esc(e.nombre)}</b>${e.activo===false?' <span class="chip">Baja</span>':""}<div class="mono muted">${esc(e.num)} · ${esc(e.puesto||"")}</div></td>
      <td>${esc(e.turno||"—")}</td><td>${esc(e.posicion||"—")}</td><td>${e.area?esc(e.area):'<span class="muted">Sin asignar</span>'}</td>
      <td>${esc(sitioCorto(e.sitio)||"—")}</td>
      <td style="font-size:13.5px">${e.supervisor?esc(e.supervisor):'<span class="muted">—</span>'}${e.gerente?`<div class="muted" style="font-size:12px">Gerente: ${esc(e.gerente)}</div>`:""}</td>
      <td class="tel">${e.celular?esc(e.celular):'<span class="muted" style="font-family:var(--f-body)">Falta</span>'}</td>
      <td>${certs||'<span class="muted">—</span>'}${miss.length?` <span class="chip warn">falta ${esc(miss.join(", "))}</span>`:""}</td>
      <td>${s?`<span class="chip ${PRESENT.has(s)?"ok":"bad"}">${ST[s]}</span>`:'<span class="muted">—</span>'}</td></tr>`}).join("")
  }</tbody></table>`;
}

/* ---------- drawer ---------- */
let D=null;
function openEmp(num){
  const e=num?S.emps.get(num):null;
  if(!e&&!S.canPersonal)return;
  D={isNew:!e,data:JSON.parse(JSON.stringify(e||{num:"",nombre:"",email:"",turno:$("#l-turno").value||cfg().turnos[0]||"",posicion:"",puesto:"",area:"",sitio:"",gerente:"",supervisor:"",celular:"",certs:[],activo:true,notas:""}))};
  renderDrawer();if(e)loadHistory(e);
}
function closeDrawer(){D=null;$("#drawer-root").innerHTML=""}
function opt(items,val,blank){const list=items.slice();if(val&&!list.includes(val))list.push(val);return (blank?`<option value="">${blank}</option>`:"")+list.map(i=>`<option ${i===val?"selected":""} value="${esc(i)}">${esc(i)}</option>`).join("")}
function renderDrawer(){
  const d=D.data,C=cfg(),ro=!S.canPersonal,dis=ro?"disabled":"";
  $("#drawer-root").innerHTML=`<div class="scrim" data-close></div><aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="dr-title">
  <header><h2 id="dr-title">${D.isNew?"Nueva persona":esc(d.nombre)}</h2><button class="btn" data-close aria-label="Cerrar">Cerrar</button></header>
  <div class="body">
    ${ro?'<div class="banner">Tu rol no permite editar fichas.</div>':""}
    <div class="grid2">
      <div class="field"><label for="f-num">No. empleado</label><input id="f-num" type="text" value="${esc(d.num)}" ${D.isNew?"":"readonly"}></div>
      <div class="field"><label for="f-nombre">Nombre</label><input id="f-nombre" type="text" value="${esc(d.nombre)}" ${dis}></div>
      <div class="field"><label for="f-cel">Teléfono celular</label><input id="f-cel" type="tel" inputmode="tel" placeholder="33 1234 5678" value="${esc(d.celular)}" ${dis}></div>
      <div class="field"><label for="f-email">Correo</label><input id="f-email" type="email" value="${esc(d.email)}" ${dis}></div>
      <div class="field"><label for="f-turno">Turno</label><select id="f-turno" ${dis}>${opt(turnosUsed(),d.turno)}</select></div>
      <div class="field"><label for="f-pos">Posición</label><select id="f-pos" ${dis}>${opt(C.posiciones,d.posicion,"Sin posición")}</select></div>
      <div class="field"><label for="f-area">Área</label><select id="f-area" ${dis}>${opt(C.areas,d.area,"Sin asignar")}</select></div>
      <div class="field"><label for="f-puesto">Puesto (HR)</label><input id="f-puesto" type="text" value="${esc(d.puesto)}" ${dis}></div>
      <div class="field"><label for="f-sitio">Sitio</label><select id="f-sitio" ${dis}>${opt(C.sitios||[],d.sitio,"Sin sitio")}</select></div>
      <div class="field"><label for="f-sup">Supervisor directo</label><input id="f-sup" type="text" list="dl-sup" value="${esc(d.supervisor)}" ${dis}><datalist id="dl-sup">${[...new Set(active().map(x=>x.supervisor).filter(Boolean))].sort().map(x=>`<option value="${esc(x)}">`).join("")}</datalist></div>
      <div class="field"><label for="f-ger">Gerente</label><select id="f-ger" ${dis}>${opt(C.gerentes||[],d.gerente,"Sin gerente")}</select></div>
      <div class="field"><label for="f-activo">Estatus</label><select id="f-activo" ${dis}><option value="1" ${d.activo!==false?"selected":""}>Activo</option><option value="0" ${d.activo===false?"selected":""}>Baja</option></select></div>
    </div>
    ${d.posicion&&((C.perfiles||{})[d.posicion]||{}).descripcion?`<div class="banner info" style="font-weight:400"><b>${esc(d.posicion)}:</b> ${esc(C.perfiles[d.posicion].descripcion)}</div>`:""}
    ${d.antiguedad||d.ingreso?`<div class="muted" style="font-size:13px">Antigüedad: ${esc(d.antiguedad)}${d.ingreso?" · Ingreso "+fmtD(d.ingreso):""}${d.tipo?" · "+esc(d.tipo):""}${d.clasif?" · "+esc(d.clasif):""}</div>`:""}
    <div class="panel" style="padding:12px">
      <h2 style="font-size:18px">Certificaciones</h2>
      <div id="f-certs" style="display:flex;flex-direction:column;gap:8px">${(d.certs||[]).map((c,i)=>`
        <div class="certrow" data-ci="${i}">
          <select data-cf="nombre" aria-label="Certificación" ${dis}>${opt(C.certs,c.nombre)}</select>
          <input data-cf="folio" type="text" placeholder="Folio / DC-3" value="${esc(c.folio||"")}" aria-label="Folio" ${dis}>
          <input data-cf="vence" type="date" value="${esc(c.vence||"")}" aria-label="Vence" title="Fecha de vencimiento" ${dis}>
          <button class="btn danger" data-cdel="${i}" aria-label="Quitar" ${dis}>Quitar</button>
        </div>`).join("")||'<span class="muted">Sin certificaciones registradas.</span>'}</div>
      ${ro?"":`<div style="margin-top:10px"><button class="btn" id="f-addcert" ${C.certs.length?"":"disabled"}>Agregar certificación</button> <span class="muted" style="font-size:12.5px">Tipo, folio y fecha de vencimiento</span></div>`}
    </div>
    <div class="field"><label for="f-notas">Notas</label><textarea id="f-notas" ${dis}>${esc(d.notas)}</textarea></div>
    ${D.isNew?"":`<div class="panel" style="padding:12px"><h2 style="font-size:18px">Últimos 30 días</h2><div id="f-hist" class="muted">Cargando…</div></div>`}
  </div>
  <footer><button class="btn" data-close>${ro?"Cerrar":"Cancelar"}</button>${ro?"":'<button class="btn primary" id="f-save">Guardar</button>'}</footer></aside>`;
}
function readForm(){
  const d=D.data;
  d.num=$("#f-num").value.trim();d.nombre=$("#f-nombre").value.trim();d.celular=$("#f-cel").value.trim();d.email=$("#f-email").value.trim();
  d.turno=$("#f-turno").value;d.posicion=$("#f-pos").value;d.area=$("#f-area").value;d.puesto=$("#f-puesto").value.trim();
  d.supervisor=$("#f-sup").value.trim();d.sitio=$("#f-sitio").value;d.gerente=$("#f-ger").value;d.activo=$("#f-activo").value==="1";d.notas=$("#f-notas").value;
  document.querySelectorAll("#f-certs .certrow").forEach(r=>{const c=d.certs[+r.dataset.ci];r.querySelectorAll("[data-cf]").forEach(i=>c[i.dataset.cf]=i.value)});
}
const EMP_COLS=["num","nombre","email","turno","posicion","area","sitio","gerente","puesto","supervisor","antiguedad","ingreso","tipo","clasif","celular","certs","activo","notas"];
async function saveEmp(){
  readForm();const d=D.data;
  if(!d.num){toast("Escribe el número de empleado.");return}
  if(!d.nombre){toast("Escribe el nombre.");return}
  if(D.isNew&&S.emps.has(d.num)){toast("Ese número de empleado ya existe.");return}
  d.certs=(d.certs||[]).filter(c=>c.nombre).map(c=>({nombre:c.nombre,folio:c.folio||"",vence:c.vence||""}));
  const row={};EMP_COLS.forEach(k=>{if(d[k]!==undefined)row[k]=d[k]});if(!row.ingreso)row.ingreso=null;row.actualizado=new Date().toISOString();
  $("#f-save").disabled=true;
  const {data,error}=await S.sb.from("empleados").upsert(row).select().single();
  if(error){toast(errMsg(error));$("#f-save").disabled=false;return}
  S.emps.set(data.num,data);refreshSelects();renderActive();toast("Guardado");closeDrawer();
}
async function loadHistory(e){
  const from=addDays(S.date,-29);
  const {data,error}=await S.sb.from("asistencia").select("fecha,estado").eq("num",e.num).gte("fecha",from).lte("fecha",S.date);
  const el=$("#f-hist");if(!el)return;
  if(error){el.textContent="No se pudo cargar el historial.";return}
  const byDate={};data.forEach(r=>byDate[r.fecha]=r.estado);
  const cnt={};Object.values(byDate).forEach(s=>cnt[s]=(cnt[s]||0)+1);
  let strip="";for(let i=29;i>=0;i--){const dd=addDays(S.date,-i);const s=byDate[dd];strip+=`<i class="${s?"s-"+s:""}" title="${fmtD(dd)}: ${s?ST[s]:"sin registro"}"></i>`}
  el.innerHTML=`<div class="strip">${strip}</div><div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">${Object.keys(ST).filter(k=>cnt[k]).map(k=>`<span class="chip ${PRESENT.has(k)?"ok":"bad"}">${ST[k]}: ${cnt[k]}</span>`).join("")||"Sin registros en este periodo."}</div>`;
}

/* ---------- catálogos (menú lateral) ---------- */
const CATS=[
  {id:"perfiles",label:"Perfiles",key:"posiciones",field:"posicion",group:"Puestos"},
  {id:"certificaciones",label:"Certificaciones",key:"certs",group:"Puestos"},
  {id:"areas",label:"Áreas",key:"areas",field:"area",group:"Organización",one:"área",help:"Procesos o zonas donde trabaja cada persona. Se usan en la cobertura por área."},
  {id:"sitios",label:"Sitios",key:"sitios",field:"sitio",group:"Organización",one:"sitio",help:"Edificio o planta a la que pertenece cada persona."},
  {id:"gerentes",label:"Gerentes",key:"gerentes",field:"gerente",group:"Organización",one:"gerente",help:"Gerente al que reporta cada persona. Debajo de cada uno se ven los supervisores de su equipo."},
  {id:"turnos",label:"Turnos",key:"turnos",field:"turno",group:"Organización",one:"turno",help:"Turnos de trabajo. Cada turno es una columna de la matriz de cobertura."},
  {id:"usuarios",label:"Usuarios",group:"Acceso",admin:true},
  {id:"roles",label:"Roles y permisos",group:"Acceso",admin:true}
];
const countBy=(f,v)=>active().filter(e=>e[f]===v).length;
function renderCatalogos(){
  const C=cfg();
  const cats=CATS.filter(c=>!c.admin||S.isAdmin);
  if(!cats.some(c=>c.id===S.cat))S.cat="perfiles";
  let nav="",g="";
  cats.forEach(c=>{if(c.group!==g){g=c.group;nav+=`<div class="cat-h">${esc(g)}</div>`}
    const n=c.key?(C[c.key]||[]).length:c.id==="roles"?S.roles.length:(S.users.length||"");
    nav+=`<button data-cat="${c.id}" aria-current="${S.cat===c.id}">${esc(c.label)}<span class="n">${n}</span></button>`});
  $("#cat-nav").innerHTML=nav;
  const c=cats.find(x=>x.id===S.cat);
  const body=$("#cat-body");
  if(c.id==="perfiles")body.innerHTML=catPerfiles();
  else if(c.id==="certificaciones")body.innerHTML=catCerts();
  else if(c.id==="usuarios")body.innerHTML=catUsuarios();
  else if(c.id==="roles")body.innerHTML=catRoles();
  else body.innerHTML=catLista(c);
}
function addRow(key,ph){return S.canCatalog?`<div class="toolbar"><input type="text" id="cat-new" class="grow" placeholder="${esc(ph)}" aria-label="${esc(ph)}"><button class="btn primary" data-add="${key}">Agregar</button></div>`:""}
function delBtn(key,v){return S.canCatalog?`<button class="btn danger" data-ldel="${key}" data-v="${esc(v)}">Quitar</button>`:""}
function catPerfiles(){
  const C=cfg(),P=C.perfiles||{},T=turnosUsed(),dis=S.canCatalog?"":"disabled";
  return `<div class="cathead"><h2>Perfiles</h2><p>Qué hace cada posición, a qué puesto de HR corresponde y qué certificaciones necesita. La descripción aparece en la ficha de cada persona.</p></div>
  ${addRow("posiciones","Nueva posición")}
  <div class="perfiles">${C.posiciones.map(p=>{const d=P[p]||{};const ppl=active().filter(e=>e.posicion===p);
    const porT=T.map(t=>[t,ppl.filter(e=>e.turno===t).length]).filter(x=>x[1]);
    return `<div class="panel perfil"><h3>${esc(p)} <span class="chip">${ppl.length} personas</span>${porT.map(([t,n])=>`<span class="chip acc">${esc(t)}: ${n}</span>`).join("")}</h3>
      ${S.canCatalog?`<div class="field"><label for="pf-hr-${esc(p)}">Puesto en HR</label><input id="pf-hr-${esc(p)}" type="text" data-perf="${esc(p)}" data-pf="puestoHR" value="${esc(d.puestoHR||"")}" placeholder="Ej. Material Handler"></div>
      <div class="field"><label for="pf-ds-${esc(p)}">Qué hace</label><textarea id="pf-ds-${esc(p)}" data-perf="${esc(p)}" data-pf="descripcion" rows="3" placeholder="Responsabilidades principales">${esc(d.descripcion||"")}</textarea></div>`
      :`${d.puestoHR?`<div class="muted" style="font-size:13px">Puesto en HR: ${esc(d.puestoHR)}</div>`:""}<p class="desc">${d.descripcion?esc(d.descripcion):'<span class="muted">Sin descripción.</span>'}</p>`}
      <div class="field"><label>Certificaciones requeridas</label><div style="display:flex;gap:6px 12px;flex-wrap:wrap">${C.certs.map(n=>`<label class="ck"><input type="checkbox" data-creq="${esc(p)}" value="${esc(n)}" ${((C.certReq||{})[p]||[]).includes(n)?"checked":""} ${dis}> ${esc(n)}</label>`).join("")||'<span class="muted">Agrega certificaciones en su catálogo.</span>'}</div></div>
      ${S.canCatalog?`<div>${delBtn("posiciones",p)}</div>`:""}
    </div>`}).join("")||'<div class="empty">Sin posiciones.</div>'}</div>`;
}
function catLista(c){
  const C=cfg(),arr=C[c.key]||[];
  const extra=c.id==="gerentes";
  const orphan=[...new Set(active().map(e=>e[c.field]).filter(v=>v&&!arr.includes(v)))];
  return `<div class="cathead"><h2>${esc(c.label)}</h2><p>${esc(c.help)}</p></div>
  ${addRow(c.key,"Nuevo "+c.one)}
  <div class="panel" style="padding:0"><div class="scroll"><table><thead><tr><th>${esc(c.label.slice(0,-1)==="Área"?"Área":c.one[0].toUpperCase()+c.one.slice(1))}</th><th class="num">Personas</th>${extra?"<th>Supervisores en su equipo</th>":""}<th></th></tr></thead><tbody>${
    arr.map(v=>{const n=countBy(c.field,v);
      const sups=extra?[...new Set(active().filter(e=>e.gerente===v).map(e=>e.supervisor).filter(Boolean))].sort():[];
      return `<tr><td>${esc(c.id==="sitios"?sitioCorto(v):v)}${c.id==="sitios"&&sitioCorto(v)!==v?`<div class="muted" style="font-size:12px">${esc(v)}</div>`:""}</td><td class="num">${n||'<span class="muted">0</span>'}</td>${extra?`<td style="font-size:13.5px">${sups.map(esc).join(", ")||'<span class="muted">—</span>'}</td>`:""}<td style="text-align:right">${delBtn(c.key,v)}</td></tr>`}).join("")||`<tr><td colspan="4" class="empty">Vacío.</td></tr>`
  }</tbody></table></div></div>
  ${orphan.length?`<div class="banner">Hay personas con ${esc(c.one)} que no está en el catálogo: ${orphan.map(esc).join(", ")}. ${S.canCatalog?"Agrégalo arriba o corrige sus fichas.":""}</div>`:""}`;
}
function catCerts(){
  const C=cfg(),on=S.date,soon30=addDays(on,30),soon60=addDays(on,60),A=active(),dis=S.canCatalog?"":"disabled";
  const exp=[];A.forEach(e=>(e.certs||[]).forEach(c=>{if(c.vence&&c.vence<=soon60)exp.push({e,c})}));
  exp.sort((a,b)=>a.c.vence.localeCompare(b.c.vence));
  const miss=A.map(e=>({e,m:missingCerts(e,on)})).filter(x=>x.m.length);
  const reqBy=n=>Object.keys(C.certReq||{}).filter(p=>(C.certReq[p]||[]).includes(n));
  return `<div class="cathead"><h2>Certificaciones</h2><p>Tipos de certificación, cuántas hay vigentes y qué vence pronto. Las requeridas por posición se marcan en Perfiles.</p></div>
  ${addRow("certs","Nueva certificación")}
  <div class="panel" style="padding:0"><div class="scroll"><table><thead><tr><th>Certificación</th><th>Requerida para</th><th class="num">Vigentes</th><th class="num">Por vencer</th><th class="num">Vencidas</th><th></th></tr></thead><tbody>${
    C.certs.map(n=>{let v=0,p=0,x=0;A.forEach(e=>(e.certs||[]).forEach(c=>{if(c.nombre!==n)return;if(!certValid(c,on))x++;else if(c.vence&&c.vence<=soon30)p++;else v++}));
      return `<tr><td>${esc(n)}</td><td>${reqBy(n).map(p=>`<span class="chip">${esc(p)}</span>`).join(" ")||'<span class="muted">—</span>'}</td><td class="num">${v}</td><td class="num" style="color:${p?"var(--warn)":"inherit"}">${p}</td><td class="num" style="color:${x?"var(--bad)":"inherit"}">${x}</td><td style="text-align:right">${S.canCatalog?`<button class="btn danger" data-certdel="${esc(n)}">Quitar</button>`:""}</td></tr>`}).join("")||'<tr><td colspan="6" class="empty">Sin certificaciones.</td></tr>'
  }</tbody></table></div></div>
  <div class="panel"><h2>Vencimientos <span class="sub">vencidas y próximos 60 días</span></h2><div class="scroll">${exp.length?`<table><thead><tr><th>Persona</th><th>Certificación</th><th>Vence</th><th>Turno</th><th>Celular</th></tr></thead><tbody>${exp.map(({e,c})=>`<tr class="click" data-emp="${esc(e.num)}"><td>${esc(e.nombre)}</td><td>${esc(c.nombre)}${c.folio?` <span class="mono muted">${esc(c.folio)}</span>`:""}</td><td><span class="chip ${c.vence<on?"bad":"warn"}">${c.vence<on?"Vencida ":""}${fmtD(c.vence)}</span></td><td>${esc(e.turno)}</td><td class="tel">${esc(e.celular||"—")}</td></tr>`).join("")}</tbody></table>`:`<div class="empty">Nada vence en los próximos 60 días.</div>`}</div></div>
  <div class="panel"><h2>Sin la certificación que pide su posición</h2><div class="scroll">${miss.length?`<table><thead><tr><th>Persona</th><th>Posición</th><th>Le falta</th><th>Turno</th></tr></thead><tbody>${miss.map(({e,m})=>`<tr class="click" data-emp="${esc(e.num)}"><td>${esc(e.nombre)}</td><td>${esc(e.posicion)}</td><td>${m.map(n=>`<span class="chip warn">${esc(n)}</span>`).join(" ")}</td><td>${esc(e.turno)}</td></tr>`).join("")}</tbody></table>`:`<div class="empty">Todos tienen las certificaciones que pide su posición.</div>`}</div></div>`;
}
function catRoles(){
  const users=S.users;
  const head=`<div class="cathead"><h2>Roles y permisos</h2><p>Marca qué puede hacer cada rol. Todos los roles pueden consultar la información. Los cambios se aplican al momento y la base de datos los hace cumplir.</p></div>`;
  if(!S.rolesDb)return head+`<div class="banner">Falta activar los roles en la base de datos. Ejecuta el archivo supabase/roles.sql en el SQL Editor de Supabase y recarga la página.</div>`;
  return head+`<div class="toolbar"><input type="text" id="role-new" class="grow" placeholder="Nuevo rol (ej. rh, lider)" aria-label="Nuevo rol"><button class="btn primary" data-radd>Agregar rol</button></div>
  <div class="panel" style="padding:0"><div class="scroll"><table class="roles"><thead><tr><th>Rol</th>${PERMS.map(p=>`<th title="${esc(p.desc)}" style="text-align:center">${esc(p.label)}</th>`).join("")}<th class="num">Usuarios</th><th></th></tr></thead><tbody>${
    S.roles.map(r=>{const adm=r.nombre==="admin";const n=users.filter(u=>u.rol===r.nombre).length;
      return `<tr><td><b>${esc(r.nombre)}</b><div><input type="text" data-rdesc="${esc(r.nombre)}" value="${esc(r.descripcion||"")}" placeholder="Descripción" aria-label="Descripción de ${esc(r.nombre)}" style="width:100%;margin-top:4px;font-size:13px" ${adm?"disabled":""}></div></td>
      ${PERMS.map(p=>`<td style="text-align:center"><input type="checkbox" data-rperm="${esc(r.nombre)}" value="${p.id}" aria-label="${esc(p.label)} para ${esc(r.nombre)}" ${adm||(r.permisos||[]).includes(p.id)?"checked":""} ${adm?"disabled":""}></td>`).join("")}
      <td class="num">${n}</td><td style="text-align:right">${adm?'<span class="muted" style="font-size:12px">Siempre todo</span>':`<button class="btn danger" data-rdel="${esc(r.nombre)}" ${n?'disabled title="Tiene usuarios asignados"':""}>Quitar</button>`}</td></tr>`}).join("")
  }</tbody></table></div></div>
  <div class="panel"><h2>Qué permite cada permiso</h2><dl style="margin:0;display:grid;grid-template-columns:max-content 1fr;gap:6px 14px">${PERMS.map(p=>`<dt style="font-weight:600">${esc(p.label)}</dt><dd style="margin:0" class="muted">${esc(p.desc)}</dd>`).join("")}
    <dt style="font-weight:600">Solo admin</dt><dd style="margin:0" class="muted">Administrar usuarios y roles. El rol admin siempre tiene todos los permisos y no se puede quitar.</dd></dl></div>`;
}
function catUsuarios(){
  return `<div class="cathead"><h2>Usuarios</h2><p>Asigna a cada usuario un rol. Lo que puede hacer cada rol se define en Roles y permisos.</p></div>
  <div class="panel" style="padding:0"><div class="scroll">${S.users.length?`<table><thead><tr><th>Correo</th><th>Rol</th></tr></thead><tbody>${S.users.map(u=>`<tr><td>${esc(u.email)}${u.id===S.session.user.id?' <span class="chip">tú</span>':""}</td><td><select data-urol="${esc(u.id)}" aria-label="Rol de ${esc(u.email)}" ${u.id===S.session.user.id?"disabled":""}>${S.roles.map(r=>`<option value="${esc(r.nombre)}" ${u.rol===r.nombre?"selected":""}>${esc(r.nombre)}</option>`).join("")}</select></td></tr>`).join("")}</tbody></table>`:`<div class="empty">Cargando usuarios…</div>`}</div></div>`;
}
function deepMerge(a,b){const o=Array.isArray(a)?a.slice():Object.assign({},a);Object.keys(b).forEach(k=>{const v=b[k];if(v&&typeof v==="object"&&!Array.isArray(v)&&o[k]&&typeof o[k]==="object"&&!Array.isArray(o[k]))o[k]=deepMerge(o[k],v);else if(v===null)delete o[k];else o[k]=v});return o}
let cfgChain=Promise.resolve();
function cfgUpdate(patch){
  const prev=S.cfg;S.cfg=deepMerge(cfg(),patch);refreshSelects();renderActive();
  cfgChain=cfgChain.then(async()=>{
    const {error}=await S.sb.from("config").upsert({id:1,data:S.cfg});
    if(error){S.cfg=prev;refreshSelects();renderActive();toast(errMsg(error))}
  });
}

/* ---------- routing / render ---------- */
function renderActive(){
  if(!S.session)return;
  if(S.tab==="cobertura")renderCobertura();else if(S.tab==="lista")renderLista();else if(S.tab==="personal")renderPersonal();else renderCatalogos();
}
function setTab(t){
  if(t==="certificaciones"){S.cat="certificaciones";t="catalogos"}else if(t==="ajustes")t="catalogos";
  if(!VIEWS.includes(t))t="cobertura";
  S.tab=t;
  document.querySelectorAll("section.view").forEach(s=>s.hidden=!S.session||s.id!=="v-"+t);
  document.querySelectorAll("nav.tabs a").forEach(a=>a.setAttribute("aria-current",a.dataset.tab===t?"page":"false"));
  renderActive();
}
function renderBanner(msg){
  let h=msg||"";
  if(!h&&S.session&&S.perms&&!S.perms.size)h=`<div class="banner">Tu rol solo permite consultar. Si necesitas pasar lista o editar, pídelo al administrador.</div>`;
  $("#banner").innerHTML=h;
}
window.addEventListener("hashchange",()=>setTab(location.hash.slice(1)));

/* ---------- events ---------- */
$("#fecha").value=S.date;
$("#fecha").addEventListener("change",e=>{if(!e.target.value)return;S.date=e.target.value;loadAttendance()});
$("#cov-dim").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;S.dim=b.dataset.v;S.sel=null;try{localStorage.setItem("cp_dim",S.dim)}catch(_){}
  [...$("#cov-dim").children].forEach(x=>x.setAttribute("aria-pressed",x===b));renderCobertura()});
[...$("#cov-dim").children].forEach(x=>x.setAttribute("aria-pressed",x.dataset.v===S.dim));
$("#cov-turno").addEventListener("change",renderCobertura);
$("#cov-sitio").addEventListener("change",()=>{S.sel=null;renderCobertura()});
$("#cov-edit").addEventListener("click",()=>{S.editReq=!S.editReq;$("#cov-edit").textContent=S.editReq?"Listo":"Editar requeridos";$("#cov-edit").classList.toggle("primary",S.editReq);renderCobertura()});
$("#cov-matrix").addEventListener("click",e=>{const b=e.target.closest("[data-cell]");if(!b)return;S.sel=S.sel===b.dataset.cell?null:b.dataset.cell;renderCobertura();if(S.sel)$("#cov-detail").scrollIntoView({block:"nearest",behavior:"smooth"})});
$("#cov-matrix").addEventListener("change",e=>{const i=e.target.closest("[data-req]");if(!i)return;
  const v=i.value===""?null:Math.max(0,parseInt(i.value,10)||0);cfgUpdate({req:{[S.dim]:{[i.dataset.req]:v}}})});
["#l-turno","#l-pos","#l-area","#l-sitio"].forEach(s=>$(s).addEventListener("change",renderLista));
$("#l-q").addEventListener("input",renderLista);
$("#l-list").addEventListener("click",e=>{const b=e.target.closest("[data-mark]");if(b&&S.canMark)mark(b.dataset.emp,b.dataset.mark)});
$("#l-all").addEventListener("click",markAll);
$("#p-q").addEventListener("input",renderPersonal);
["#p-turno","#p-pos","#p-area","#p-sitio","#p-ger","#p-bajas"].forEach(s=>$(s).addEventListener("change",renderPersonal));
$("#p-new").addEventListener("click",()=>openEmp(null));
document.addEventListener("click",e=>{const r=e.target.closest("tr[data-emp]");if(r&&!e.target.closest("button,select,input"))openEmp(r.dataset.emp)});
$("#drawer-root").addEventListener("click",e=>{
  if(e.target.closest("[data-close]")){closeDrawer();return}
  if(e.target.id==="f-addcert"){readForm();D.data.certs=D.data.certs||[];D.data.certs.push({nombre:cfg().certs[0],folio:"",vence:""});renderDrawer();return}
  const del=e.target.closest("[data-cdel]");if(del){readForm();D.data.certs.splice(+del.dataset.cdel,1);renderDrawer();return}
  if(e.target.id==="f-save")saveEmp();
});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&D)closeDrawer()});
const CV=$("#v-catalogos");
CV.addEventListener("click",e=>{
  const n=e.target.closest("[data-cat]");
  if(n){S.cat=n.dataset.cat;try{localStorage.setItem("cp_cat",S.cat)}catch(_){}renderCatalogos();return}
  const a=e.target.closest("[data-add]");
  if(a){const k=a.dataset.add;const v=$("#cat-new").value.trim();if(!v)return;
    const arr=cfg()[k]||[];if(arr.includes(v)){toast("Ya existe");return}cfgUpdate({[k]:arr.concat([v])});return}
  if(e.target.closest("[data-radd]")){addRole();return}
  const rd=e.target.closest("[data-rdel]");
  if(rd){
    if(rd.dataset.confirm!=="1"){rd.dataset.confirm="1";rd.textContent="¿Seguro?";setTimeout(()=>{if(rd.isConnected){rd.dataset.confirm="";rd.textContent="Quitar"}},3000);return}
    delRole(rd.dataset.rdel);return}
  const d=e.target.closest("[data-ldel],[data-certdel]");
  if(d){
    if(d.dataset.confirm!=="1"){d.dataset.confirm="1";d.textContent="¿Seguro?";setTimeout(()=>{if(d.isConnected){d.dataset.confirm="";d.textContent="Quitar"}},3000);return}
    const C=cfg();
    if(d.dataset.certdel!==undefined){const n=d.dataset.certdel;const req={};Object.keys(C.certReq||{}).forEach(p=>req[p]=(C.certReq[p]||[]).filter(x=>x!==n));cfgUpdate({certs:C.certs.filter(x=>x!==n),certReq:req});return}
    const k=d.dataset.ldel,v=d.dataset.v;const patch={[k]:(C[k]||[]).filter(x=>x!==v)};
    if(k==="posiciones"){patch.perfiles={[v]:null};patch.certReq={[v]:null}}
    cfgUpdate(patch);
  }
});
CV.addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.id==="cat-new"){const b=CV.querySelector("[data-add]");if(b)b.click()}if(e.key==="Enter"&&e.target.id==="role-new")addRole()});
async function addRole(){
  const v=($("#role-new").value||"").trim().toLowerCase();if(!v)return;
  if(S.roles.some(r=>r.nombre===v)){toast("Ese rol ya existe");return}
  const {error}=await S.sb.from("roles").insert({nombre:v,permisos:[]});
  if(error){toast(errMsg(error));return}
  toast("Rol agregado");await loadRoles();renderActive();
}
async function delRole(n){
  const {error}=await S.sb.from("roles").delete().eq("nombre",n);
  if(error){toast(/foreign key|23503/i.test(error.message+error.code)?"No se puede quitar: hay usuarios con ese rol.":errMsg(error));return}
  toast("Rol quitado");await loadRoles();renderActive();
}
CV.addEventListener("change",async e=>{
  const c=e.target.closest("[data-creq]");
  if(c){const p=c.dataset.creq;const vals=[...CV.querySelectorAll("[data-creq]")].filter(x=>x.dataset.creq===p&&x.checked).map(x=>x.value);cfgUpdate({certReq:{[p]:vals}});return}
  const f=e.target.closest("[data-perf]");
  if(f){cfgUpdate({perfiles:{[f.dataset.perf]:{[f.dataset.pf]:f.value.trim()}}});toast("Perfil guardado");return}
  const rp=e.target.closest("[data-rperm]");
  if(rp){const n=rp.dataset.rperm;const vals=[...CV.querySelectorAll("[data-rperm]")].filter(x=>x.dataset.rperm===n&&x.checked).map(x=>x.value);
    const {error}=await S.sb.from("roles").update({permisos:vals}).eq("nombre",n);
    if(error){toast(errMsg(error));rp.checked=!rp.checked;return}
    const r=S.roles.find(x=>x.nombre===n);if(r)r.permisos=vals;toast("Permisos de "+n+" actualizados");return}
  const rds=e.target.closest("[data-rdesc]");
  if(rds){const {error}=await S.sb.from("roles").update({descripcion:rds.value.trim()}).eq("nombre",rds.dataset.rdesc);if(error)toast(errMsg(error));else toast("Descripción guardada");return}
  const s=e.target.closest("[data-urol]");
  if(s){const {error}=await S.sb.from("perfiles").update({rol:s.value}).eq("id",s.dataset.urol);
    if(error)toast(errMsg(error));else{const u=S.users.find(x=>x.id===s.dataset.urol);if(u)u.rol=s.value;toast("Rol actualizado")}}
});

/* ---------- auth ---------- */
$("#login-form").addEventListener("submit",async e=>{
  e.preventDefault();$("#lg-btn").disabled=true;$("#lg-msg").textContent="";
  const {error}=await S.sb.auth.signInWithPassword({email:$("#lg-email").value.trim(),password:$("#lg-pass").value});
  $("#lg-btn").disabled=false;
  if(error)$("#lg-msg").textContent=/invalid/i.test(error.message)?"Correo o contraseña incorrectos.":error.message;
});
$("#lg-reset").addEventListener("click",async()=>{
  const email=$("#lg-email").value.trim();if(!email){$("#lg-msg").textContent="Escribe tu correo primero.";return}
  const {error}=await S.sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
  $("#lg-msg").textContent=error?error.message:"Te enviamos un correo para cambiar tu contraseña.";
});
$("#logout").addEventListener("click",()=>S.sb.auth.signOut());

function showLogin(){
  S.session=null;S.emps=new Map();S.att={};S.loaded=false;
  if(S.channel){S.sb.removeChannel(S.channel);S.channel=null}
  $("#login").hidden=false;$("#who").hidden=true;document.querySelector("nav.tabs").hidden=true;$(".datebox").hidden=true;
  renderBanner();setTab(S.tab);
}
async function startApp(session){
  if(S.session&&S.session.user.id===session.user.id){S.session=session;return}
  S.session=session;
  $("#login").hidden=true;$("#who").hidden=false;document.querySelector("nav.tabs").hidden=false;$(".datebox").hidden=false;
  $("#who-email").textContent=session.user.email;
  const {data:perfil}=await S.sb.from("perfiles").select("rol").eq("id",session.user.id).maybeSingle();
  S.rol=(perfil&&perfil.rol)||"lector";await loadRoles();
  $("#who-rol").textContent=S.rol;
  
  renderBanner();setTab(location.hash.slice(1)||S.tab);
  const [c,e]=await Promise.all([S.sb.from("config").select("data").eq("id",1).maybeSingle(),S.sb.from("empleados").select("*")]);
  if(c.data)S.cfg=Object.assign({},DEFAULT_CFG,c.data.data);
  if(e.error){renderBanner(`<div class="banner">No se pudo cargar el personal: ${esc(e.error.message)}</div>`)}
  S.emps=new Map((e.data||[]).map(r=>[r.num,r]));
  S.loaded=true;refreshSelects();
  await loadAttendance();
  if(S.isAdmin){const {data}=await S.sb.from("perfiles").select("id,email,rol").order("email");S.users=data||[];renderActive()}
  subscribe();
}
async function loadRoles(){
  const {data,error}=await S.sb.from("roles").select("nombre,descripcion,permisos").order("nombre");
  S.roles=(!error&&data&&data.length)?data:DEFAULT_ROLES;S.rolesDb=!error;
  applyPerms();
}
function applyPerms(){
  const r=S.roles.find(x=>x.nombre===S.rol);
  S.isAdmin=S.rol==="admin";
  S.perms=new Set(S.isAdmin?PERMS.map(p=>p.id):((r&&r.permisos)||[]));
  S.canMark=S.perms.has("pasar_lista");S.canPersonal=S.perms.has("editar_personal");
  S.canCatalog=S.perms.has("editar_catalogos");S.canReq=S.perms.has("editar_requeridos");
  $("#who-rol").textContent=S.rol;
  $("#cov-edit").hidden=!S.canReq;
  if(!S.canReq&&S.editReq){S.editReq=false;$("#cov-edit").textContent="Editar requeridos";$("#cov-edit").classList.remove("primary")}
  renderBanner();
}
async function loadAttendance(){
  const fecha=S.date;
  const {data,error}=await S.sb.from("asistencia").select("num,estado").eq("fecha",fecha);
  if(fecha!==S.date)return;
  S.att={};if(!error)(data||[]).forEach(r=>S.att[r.num]=r.estado);else toast("No se pudo cargar la asistencia.");
  renderActive();
}
function subscribe(){
  if(S.channel)S.sb.removeChannel(S.channel);
  S.channel=S.sb.channel("cp-live")
    .on("postgres_changes",{event:"*",schema:"public",table:"asistencia"},p=>{
      const r=p.new&&p.new.num?p.new:p.old;if(!r)return;
      if(p.eventType==="DELETE"){ if(!p.old.fecha||p.old.fecha===S.date)delete S.att[p.old.num]; }
      else if(r.fecha===S.date)S.att[r.num]=r.estado;
      renderActive();
    })
    .on("postgres_changes",{event:"*",schema:"public",table:"empleados"},p=>{
      if(p.eventType==="DELETE")S.emps.delete(p.old.num);else S.emps.set(p.new.num,p.new);refreshSelects();renderActive();
    })
    .on("postgres_changes",{event:"*",schema:"public",table:"roles"},()=>{loadRoles().then(renderActive)})
    .on("postgres_changes",{event:"*",schema:"public",table:"config"},p=>{
      if(p.new&&p.new.data){S.cfg=Object.assign({},DEFAULT_CFG,p.new.data);refreshSelects();renderActive()}
    })
    .subscribe();
}

/* ---------- boot ---------- */
(function boot(){
  const C=window.CP_CONFIG||{};
  if(!window.supabase||!C.supabaseUrl||!C.supabaseAnonKey||/TU-PROYECTO|PEGA/.test(C.supabaseUrl+C.supabaseAnonKey)){
    document.querySelector("nav.tabs").hidden=true;
    renderBanner(`<div class="banner">Falta configurar la conexión. Edita <b>config.js</b> con la URL y la clave pública (anon key) de tu proyecto de Supabase.</div>`);
    document.querySelectorAll("section.view").forEach(s=>s.hidden=true);
    return;
  }
  S.sb=window.supabase.createClient(C.supabaseUrl,C.supabaseAnonKey);
  S.sb.auth.onAuthStateChange((ev,session)=>{
    if(ev==="PASSWORD_RECOVERY"){showReset();return}
    if(session)startApp(session);else showLogin();
  });
})();
function showReset(){
  $("#login").hidden=false;
  $("#login-form").innerHTML=`<h2>Nueva contraseña</h2><div class="field"><label for="np">Contraseña nueva (mín. 8)</label><input id="np" type="password" minlength="8" autocomplete="new-password" required></div><button class="btn primary" id="np-btn" type="button">Guardar contraseña</button><div id="np-msg" class="muted"></div>`;
  $("#np-btn").addEventListener("click",async()=>{const v=$("#np").value;if(v.length<8){$("#np-msg").textContent="Mínimo 8 caracteres.";return}
    const {error}=await S.sb.auth.updateUser({password:v});$("#np-msg").textContent=error?error.message:"Listo. Recarga la página.";});
}
})();
