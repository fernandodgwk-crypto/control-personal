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
const VIEWS=["cobertura","lista","personal","movimientos","reportes","catalogos","usuarios"];
const sitioCorto=x=>String(x||"").replace(/^MX Guadalajara North\s*/i,"")||String(x||"");

const S={sb:null,session:null,rol:"lector",perms:new Set(),sups:[],movs:[],movsLoaded:false,isAdmin:false,canMark:false,canPersonal:false,canCatalog:false,canReq:false,roles:[],emps:new Map(),cfg:null,att:{},date:ymd(new Date()),
  tab:"cobertura",dim:"posicion",editReq:false,sel:null,loaded:false,channel:null,users:[],cat:"perfiles"};
try{const d=localStorage.getItem("cp_dim");if(d)S.dim=d;const c=localStorage.getItem("cp_cat");if(c)S.cat=c;}catch(e){}

const PERMS=[
  {id:"pasar_lista",label:"Pasar lista",desc:"Marcar asistencia, retardos, faltas, permisos, vacaciones e incapacidades."},
  {id:"editar_personal",label:"Editar personal",desc:"Altas, bajas y fichas: celular, turno, área, sitio, gerente y certificaciones de cada persona."},
  {id:"editar_catalogos",label:"Editar catálogos",desc:"Perfiles, áreas, sitios, gerentes, turnos y tipos de certificación."},
  {id:"editar_requeridos",label:"Editar requeridos",desc:"Cuántas personas requiere cada área o posición por turno en la cobertura."}
];
const TABS={
  cobertura:{label:"Cobertura",sub:"Presentes contra requeridos por área o posición y turno. En rojo, lo que está descubierto.",icon:'<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3z"/><path d="M14 17.5l2.2 2.2 4.3-4.4"/>'},
  lista:{label:"Pase de lista",sub:"Marca la asistencia de cada persona del turno.",icon:'<path d="M9 6h12M9 12h12M9 18h12"/><path d="M3.5 6l1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17"/>'},
  personal:{label:"Personal",sub:"Fichas con celular, sitio, a quién reporta y certificaciones.",icon:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 010 7M18 14.8c1.9.8 3.1 2.6 3.5 5.2"/>'},
  movimientos:{label:"Movimientos",sub:"Cambios de supervisor: pases y solicitudes de personal con aprobación.",icon:'<path d="M4 8h13l-3-3M20 16H7l3 3"/>'},
  reportes:{label:"Reportes",sub:"Asistencia, ausentismo y cobertura por periodo, con gráficas y descarga a Excel o CSV.",icon:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'},
  catalogos:{label:"Catálogos",sub:"Perfiles, certificaciones, supervisores, áreas, sitios, gerentes y turnos.",icon:'<path d="M4 4h6v6H4zM4 14h6v6H4z"/><path d="M14 6h7M14 9h5M14 16h7M14 19h5"/>'},
  usuarios:{label:"Usuarios",sub:"Quién entra a la app y qué puede hacer cada rol.",icon:'<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M8 17c1-2 2.5-3 4-3s3 1 4 3"/>'}
};
const TAB_ORDER=["cobertura","lista","personal","movimientos","reportes","catalogos"];
const PRIVS=[
  ...TAB_ORDER.map(t=>({k:"tab:"+t,g:"Pestañas que ve",l:TABS[t].label})),
  {k:"pasar_lista",g:"Acciones",l:"Pasar lista (asistencia, retardos, faltas, permisos, vacaciones, incapacidades)",tab:"lista"},
  {k:"editar_personal",g:"Acciones",l:"Editar personal (altas, bajas, fichas, celular, certificaciones)",tab:"personal"},
  {k:"editar_requeridos",g:"Acciones",l:"Editar requeridos de la cobertura",tab:"cobertura"},
  {k:"editar_catalogos",g:"Acciones",l:"Editar catálogos (perfiles, supervisores, áreas, sitios, gerentes, turnos, certificaciones)",tab:"catalogos"},
  {k:"gestionar_movimientos",g:"Acciones",l:"Pedir y aprobar cambios de supervisor de cualquier equipo (gerencia o RH)",tab:"movimientos"}
];
const ROLE_DEFAULTS={
  supervisor:["tab:cobertura","tab:lista","tab:personal","tab:movimientos","tab:reportes","pasar_lista"],
  lector:["tab:cobertura","tab:personal","tab:reportes"],
  sin_acceso:[]
};
const ROLE_LABEL=r=>({admin:"Administrador",supervisor:"Supervisor",lector:"Lector",sin_acceso:"Sin acceso"})[r]||r;
const DEFAULT_ROLES=[{nombre:"admin",permisos:PERMS.map(p=>p.id)},{nombre:"supervisor",permisos:ROLE_DEFAULTS.supervisor},{nombre:"lector",permisos:ROLE_DEFAULTS.lector}];
// Pestañas de un rol. Roles creados antes de que existieran permisos de pestaña ven todo menos Usuarios.
function tabsOfRole(nombre,permisos){
  if(nombre==="admin")return [...TAB_ORDER,"usuarios"];
  if(nombre==="sin_acceso")return [];
  const p=permisos||[];
  if(!p.some(x=>x.startsWith("tab:")))return TAB_ORDER.slice();
  return TAB_ORDER.filter(t=>p.includes("tab:"+t)||PRIVS.some(x=>x.tab===t&&p.includes(x.k)));
}
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
  const sups=supsUsed();["#l-sup","#p-sup"].forEach(id=>fillSelect($(id),sups,"Todos los supervisores"));
}
function supsUsed(){const c=S.sups.filter(x=>x.activo!==false).map(x=>x.nombre);active().forEach(e=>{if(e.supervisor&&!c.includes(e.supervisor))c.push(e.supervisor)});return c.sort((a,b)=>a.localeCompare(b))}
const myEmail=()=>((S.session&&S.session.user.email)||"").toLowerCase();
const mySups=()=>S.sups.filter(x=>x.activo!==false&&x.email&&x.email.toLowerCase()===myEmail()).map(x=>x.nombre);
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
  const t=$("#l-turno").value,p=$("#l-pos").value,a=$("#l-area").value,st=$("#l-sitio").value,sp=$("#l-sup").value,q=$("#l-q").value.trim().toLowerCase();
  return active().filter(e=>e.turno===t&&(!p||e.posicion===p)&&(!a||e.area===a)&&(!st||e.sitio===st)&&(!sp||e.supervisor===sp)&&(!q||e.nombre.toLowerCase().includes(q)||String(e.num).includes(q)))
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
  const q=$("#p-q").value.trim().toLowerCase(),t=$("#p-turno").value,p=$("#p-pos").value,a=$("#p-area").value,st=$("#p-sitio").value,g=$("#p-ger").value,sp=$("#p-sup").value,b=$("#p-bajas").checked;
  const ppl=[...S.emps.values()].filter(e=>(b||e.activo!==false)&&(!t||e.turno===t)&&(!p||e.posicion===p)&&(!a||e.area===a)&&(!st||e.sitio===st)&&(!g||e.gerente===g)&&(!sp||e.supervisor===sp)&&
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
      <div class="field"><label for="f-sup">Supervisor directo</label><select id="f-sup" ${D.isNew||gestiona()?dis:"disabled"} title="${D.isNew||gestiona()?"":"El supervisor se cambia con un movimiento aprobado"}">${opt(supsUsed(),d.supervisor,"Sin supervisor")}</select>${!D.isNew&&canRequestFor(d)?`<button type="button" class="btn" id="f-mov" style="margin-top:6px">Solicitar cambio de supervisor</button>`:""}${pendingFor(d.num)?`<span class="chip warn" style="margin-top:6px;align-self:flex-start">Movimiento pendiente</span>`:""}</div>
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
  {id:"supervisores",label:"Supervisores",group:"Organización",count:()=>S.sups.length},
  {id:"areas",label:"Áreas",key:"areas",field:"area",group:"Organización",one:"área",help:"Procesos o zonas donde trabaja cada persona. Se usan en la cobertura por área."},
  {id:"sitios",label:"Sitios",key:"sitios",field:"sitio",group:"Organización",one:"sitio",help:"Edificio o planta a la que pertenece cada persona."},
  {id:"gerentes",label:"Gerentes",key:"gerentes",field:"gerente",group:"Organización",one:"gerente",help:"Gerente al que reporta cada persona. Debajo de cada uno se ven los supervisores de su equipo."},
  {id:"turnos",label:"Turnos",key:"turnos",field:"turno",group:"Organización",one:"turno",help:"Turnos de trabajo. Cada turno es una columna de la matriz de cobertura."}
];
const countBy=(f,v)=>active().filter(e=>e[f]===v).length;
function renderCatalogos(){
  const C=cfg();
  const cats=CATS.filter(c=>!c.admin||S.isAdmin);
  if(!cats.some(c=>c.id===S.cat))S.cat="perfiles";
  let nav="",g="";
  cats.forEach(c=>{if(c.group!==g){g=c.group;nav+=`<div class="cat-h">${esc(g)}</div>`}
    const n=c.count?c.count():(C[c.key]||[]).length;
    nav+=`<button data-cat="${c.id}" aria-current="${S.cat===c.id}">${esc(c.label)}<span class="n">${n}</span></button>`});
  $("#cat-nav").innerHTML=nav;
  const c=cats.find(x=>x.id===S.cat);
  const body=$("#cat-body");
  if(c.id==="perfiles")body.innerHTML=catPerfiles();
  else if(c.id==="certificaciones")body.innerHTML=catCerts();
  else if(c.id==="supervisores")body.innerHTML=catSupervisores();
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
function catSupervisores(){
  const C=cfg(),ed=S.canCatalog,dis=ed?"":"disabled",ger=listUsed("gerentes","gerente");
  const cuentas=new Set(S.users.map(u=>(u.email||"").toLowerCase()));
  const orphan=[...new Set(active().map(e=>e.supervisor).filter(v=>v&&!S.sups.some(x=>x.nombre===v)))];
  return `<div class="cathead"><h2>Supervisores</h2><p>Cada supervisor se liga por correo a su cuenta de la app. Con esa cuenta aprueba los pases que recibe y las solicitudes de su personal. Al aprobar un cambio, la persona toma el gerente de su nuevo supervisor.</p></div>
  ${ed?`<div class="toolbar"><input type="text" id="sup-nombre" class="grow" placeholder="Nombre del supervisor" aria-label="Nombre del supervisor"><input type="email" id="sup-email" placeholder="correo@flex.com" aria-label="Correo"><select id="sup-ger" aria-label="Gerente"><option value="">Gerente</option>${ger.map(g=>`<option>${esc(g)}</option>`).join("")}</select><button class="btn primary" id="sup-add">Agregar</button></div>`:""}
  <div class="panel" style="padding:0"><div class="scroll"><table><thead><tr><th>Supervisor</th><th>Correo de su cuenta</th><th>Gerente</th><th class="num">Personas</th><th>Activo</th><th></th></tr></thead><tbody>${
    S.sups.map(x=>{const n=countBy("supervisor",x.nombre),em=(x.email||"").toLowerCase();
      return `<tr><td><b style="font-weight:600">${esc(x.nombre)}</b></td>
      <td><input type="email" data-sup="${esc(x.nombre)}" data-sf="email" value="${esc(x.email||"")}" placeholder="Sin cuenta" aria-label="Correo de ${esc(x.nombre)}" style="width:100%;min-width:200px" ${dis}>
        ${S.isAdmin&&em?(cuentas.has(em)?'<div class="small" style="color:var(--ok)">Tiene cuenta</div>':'<div class="small" style="color:var(--warn)">Aún no tiene cuenta en la app</div>'):""}${!em?'<div class="small" style="color:var(--warn)">Sin correo: nadie puede aprobar por él</div>':""}</td>
      <td><select data-sup="${esc(x.nombre)}" data-sf="gerente" aria-label="Gerente de ${esc(x.nombre)}" ${dis}>${opt(ger,x.gerente,"Sin gerente")}</select></td>
      <td class="num">${n||'<span class="muted">0</span>'}</td>
      <td><input type="checkbox" data-sup="${esc(x.nombre)}" data-sf="activo" ${x.activo!==false?"checked":""} aria-label="Activo" ${dis}></td>
      <td style="text-align:right">${ed?`<button class="btn danger" data-supdel="${esc(x.nombre)}" ${n?'disabled title="Tiene personas asignadas"':""}>Quitar</button>`:""}</td></tr>`}).join("")||`<tr><td colspan="6" class="empty">Sin supervisores.</td></tr>`
  }</tbody></table></div></div>
  ${orphan.length?`<div class="banner">Hay personas con supervisor que no está en el catálogo: ${orphan.map(esc).join(", ")}.</div>`:""}`;
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
/* ---------- Movimientos (cambio de supervisor) ---------- */
const pendingFor=num=>S.movs.find(m=>m.num===num&&m.estado==="pendiente");
const gestiona=()=>S.perms.has("gestionar_movimientos");
function canRequestFor(e){return gestiona()||mySups().length>0}
function iApprove(m){if(m.estado!=="pendiente")return false;if(gestiona())return true;const my=mySups();return m.tipo==="pase"?my.includes(m.a_supervisor):my.includes(m.de_supervisor)}
const pendingToApprove=()=>S.movs.filter(iApprove).length;
const fmtTs=t=>t?new Date(t).toLocaleString("es-MX",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"";
const TIPO_LBL={pase:"Pase",solicitud:"Solicitud"},EST_CLS={pendiente:"warn",aprobado:"ok",rechazado:"bad",cancelado:""};
function movCard(m,acciones){
  const e=S.emps.get(m.num)||{nombre:m.num};
  const quien=m.tipo==="pase"?`Lo pasa ${esc(m.de_supervisor||"sin supervisor")} · aprueba ${esc(m.a_supervisor)}`:`Lo pide ${esc(m.a_supervisor)} · aprueba ${esc(m.de_supervisor||"—")}`;
  return `<div class="mov tipo-${m.tipo}"><div class="row" style="justify-content:space-between"><h4>${esc(e.nombre)}</h4><span class="chip ${m.tipo==="pase"?"warn":"acc"}">${TIPO_LBL[m.tipo]}</span></div>
    <div class="small muted">${esc(e.num||"")} · ${esc(e.posicion||"")} · ${esc(e.turno||"")}</div>
    <div class="ruta"><b>${esc(m.de_supervisor||"Sin supervisor")}</b><span aria-hidden="true">→</span><b>${esc(m.a_supervisor)}</b></div>
    ${m.motivo?`<div style="font-size:13px">“${esc(m.motivo)}”</div>`:""}
    <div class="meta">${quien}<br>Solicitó ${esc(m.solicitado_email||"")} · ${fmtTs(m.creado)}</div>
    ${acciones||""}</div>`;
}
function renderMovimientos(){
  const root=$("#mov-root");const my=mySups(),gest=gestiona();
  if(!S.movsLoaded){root.innerHTML=`<div class="panel empty">Cargando movimientos…</div>`;return}
  const pend=S.movs.filter(m=>m.estado==="pendiente");
  const toMe=pend.filter(iApprove),mine=pend.filter(m=>m.solicitado_por===S.session.user.id&&!iApprove(m)),others=pend.filter(m=>!iApprove(m)&&m.solicitado_por!==S.session.user.id);
  const hist=S.movs.filter(m=>m.estado!=="pendiente").slice(0,100);
  const puede=gest||my.length>0;
  root.innerHTML=`
  <div class="rep-top"><div class="small muted">${my.length?`Eres supervisor de: <b>${my.map(esc).join(", ")}</b>`:gest?"Puedes pedir y aprobar movimientos de cualquier equipo.":"Tu cuenta no está ligada a ningún supervisor. Pide al administrador que ponga tu correo en Catálogos → Supervisores."}</div>
    ${puede?`<div class="row"><button class="btn primary" data-movnew="pase">Pasar persona a otro supervisor</button><button class="btn" data-movnew="solicitud">Solicitar persona</button></div>`:""}</div>
  <div class="panel"><div class="ph"><h3>Por aprobar</h3><span class="chip ${toMe.length?"warn":""}">${toMe.length}</span></div><div class="pb">${toMe.length?`<div class="movs">${toMe.map(m=>movCard(m,`<textarea data-movcom="${m.id}" placeholder="Comentario (opcional)" aria-label="Comentario"></textarea><div class="row"><button class="btn primary" data-movok="${m.id}">Aprobar</button><button class="btn danger" data-movno="${m.id}">Rechazar</button></div>`)).join("")}</div>`:`<div class="empty" style="padding:12px">No tienes movimientos por aprobar.</div>`}</div></div>
  <div class="panel"><div class="ph"><h3>Mis solicitudes pendientes</h3><span class="chip">${mine.length}</span></div><div class="pb">${mine.length?`<div class="movs">${mine.map(m=>movCard(m,`<div><button class="btn danger" data-movcan="${m.id}">Cancelar solicitud</button></div>`)).join("")}</div>`:`<div class="empty" style="padding:12px">No tienes solicitudes pendientes.</div>`}</div></div>
  ${others.length?`<div class="panel"><div class="ph"><h3>Otros pendientes</h3><span class="chip">${others.length}</span></div><div class="pb"><div class="movs">${others.map(m=>movCard(m)).join("")}</div></div></div>`:""}
  <div class="panel" style="padding:0"><div class="ph"><h3>Historial</h3><span class="small muted">Últimos ${hist.length} movimientos resueltos</span></div><div class="scroll"><table><thead><tr><th>Fecha</th><th>Persona</th><th>Tipo</th><th>De</th><th>A</th><th>Estado</th><th>Resolvió</th><th>Comentario</th></tr></thead><tbody>${
    hist.length?hist.map(m=>{const e=S.emps.get(m.num)||{nombre:m.num};return `<tr><td class="nw small">${fmtTs(m.resuelto_en||m.creado)}</td><td>${esc(e.nombre)}</td><td>${TIPO_LBL[m.tipo]}</td><td class="small">${esc(m.de_supervisor)}</td><td class="small">${esc(m.a_supervisor)}</td><td><span class="chip ${EST_CLS[m.estado]}">${esc(m.estado)}</span></td><td class="small">${esc(m.resuelto_email||"")}</td><td class="small">${esc(m.comentario||m.motivo||"")}</td></tr>`}).join("")
    :`<tr><td colspan="8" class="empty">Sin movimientos resueltos todavía.</td></tr>`}</tbody></table></div></div>`;
}
function openMovModal(tipo,num){
  const my=mySups(),gest=gestiona(),sups=S.sups.filter(x=>x.activo!==false).map(x=>x.nombre);
  const busy=new Set(S.movs.filter(m=>m.estado==="pendiente").map(m=>m.num));
  const ppl=active().filter(e=>!busy.has(e.num)&&(tipo==="pase"?(gest||my.includes(e.supervisor)):(gest||!my.includes(e.supervisor)))).sort((a,b)=>a.nombre.localeCompare(b.nombre));
  const destinos=tipo==="pase"?sups:(gest?sups:my);
  const root=$("#modal-root");
  root.innerHTML=`<div class="modal-scrim"><div class="panel modal" role="dialog" aria-modal="true" aria-labelledby="mv-t" style="width:min(520px,100%)">
    <div class="ph"><h3 id="mv-t">${tipo==="pase"?"Pasar persona a otro supervisor":"Solicitar persona de otro supervisor"}</h3><button class="btn" id="mv-x">Cancelar</button></div>
    <form class="pb" id="f-mv" style="display:grid;gap:12px">
      <p class="small muted" style="margin:0">${tipo==="pase"?"El supervisor que la recibe debe aprobar el pase.":"El supervisor actual de la persona debe aprobar soltarla."} Hasta que se apruebe, la persona sigue con su supervisor actual.</p>
      <div class="field"><label for="mv-num">Persona</label><select id="mv-num" required>${ppl.length?"":'<option value="">No hay personas disponibles</option>'}${ppl.map(e=>`<option value="${esc(e.num)}" ${e.num===num?"selected":""}>${esc(e.nombre)} · ${esc(e.supervisor||"sin supervisor")}</option>`).join("")}</select></div>
      <div class="field"><label for="mv-dest">${tipo==="pase"?"Pasar a":"Para el equipo de"}</label><select id="mv-dest" required></select></div>
      <div class="field"><label for="mv-mot">Motivo</label><textarea id="mv-mot" placeholder="Ej. apoyo en otra línea, cambio de turno, balanceo de equipo"></textarea></div>
      <div id="mv-err" style="color:var(--bad);font-size:13px;min-height:1.2em"></div>
      <div class="row" style="justify-content:flex-end"><button class="btn primary" ${ppl.length&&destinos.length?"":"disabled"}>Enviar solicitud</button></div></form></div></div>`;
  const fillDest=()=>{const e=S.emps.get($("#mv-num").value);const cur=e?e.supervisor:"";$("#mv-dest").innerHTML=destinos.filter(x=>x!==cur).map(x=>`<option>${esc(x)}</option>`).join("")||'<option value="">Sin opciones</option>'};
  fillDest();$("#mv-num").onchange=fillDest;
  $("#mv-x").onclick=()=>root.innerHTML="";
  $("#f-mv").onsubmit=async ev=>{ev.preventDefault();const btn=ev.target.querySelector("button.primary");btn.disabled=true;
    const {error}=await S.sb.rpc("solicitar_movimiento",{p_num:$("#mv-num").value,p_tipo:tipo,p_destino:$("#mv-dest").value,p_motivo:$("#mv-mot").value.trim()});
    if(error){$("#mv-err").textContent=error.message;btn.disabled=false;return}
    root.innerHTML="";toast("Solicitud enviada");await loadMovs();
    if(S.tab!=="movimientos")location.hash="movimientos";};
}
async function loadMovs(){
  const {data,error}=await S.sb.from("movimientos").select("*").order("creado",{ascending:false}).limit(500);
  if(!error){S.movs=data||[];S.movsLoaded=true}else{S.movsLoaded=true;S.movs=[]}
  renderNav();renderActive();
}
async function loadSups(){const {data,error}=await S.sb.from("supervisores").select("*").order("nombre");S.sups=error?[]:(data||[]);S.supsDb=!error;refreshSelects()}
$("#v-movimientos").addEventListener("click",async e=>{
  const n=e.target.closest("[data-movnew]");if(n){openMovModal(n.dataset.movnew);return}
  const ok=e.target.closest("[data-movok],[data-movno]");
  if(ok){const id=ok.dataset.movok||ok.dataset.movno,ap=!!ok.dataset.movok,com=($(`[data-movcom="${id}"]`)||{}).value||"";
    if(!ap&&!com.trim()){toast("Escribe el motivo del rechazo en el comentario");return}
    ok.disabled=true;const {error}=await S.sb.rpc("resolver_movimiento",{p_id:id,p_aprobar:ap,p_comentario:com.trim()});
    if(error){toast(error.message);ok.disabled=false;return}
    toast(ap?"Movimiento aprobado":"Movimiento rechazado");await loadMovs();
    if(ap){const {data}=await S.sb.from("empleados").select("*");if(data){S.emps=new Map(data.map(r=>[r.num,r]));refreshSelects();renderActive()}}return}
  const c=e.target.closest("[data-movcan]");
  if(c){if(c.dataset.confirm!=="1"){c.dataset.confirm="1";c.textContent="¿Seguro? Clic de nuevo";return}
    const {error}=await S.sb.rpc("cancelar_movimiento",{p_id:c.dataset.movcan});if(error){toast(error.message);return}toast("Solicitud cancelada");loadMovs()}
});

/* ---------- Usuarios y permisos por rol (solo admin) ---------- */
let PD=null; // borrador de permisos {rol:Set}
function permDraft(){if(!PD)PD=Object.fromEntries(S.roles.filter(r=>r.nombre!=="admin").map(r=>[r.nombre,new Set(r.permisos||[])]));return PD}
function renderUsuarios(){
  const root=$("#usr-root");
  if(!S.isAdmin){root.innerHTML=`<div class="panel empty">Solo el administrador ve esta sección.</div>`;return}
  const roles=S.roles,others=roles.filter(r=>r.nombre!=="admin"),d=permDraft();
  const saved=Object.fromEntries(others.map(r=>[r.nombre,[...(r.permisos||[])].sort().join(",")]));
  const dirty=others.some(r=>[...(d[r.nombre]||[])].sort().join(",")!==saved[r.nombre]);
  const pend=S.users.filter(u=>u.rol==="sin_acceso").length;
  const grupos=[...new Set(PRIVS.map(p=>p.g))];
  const usersHtml=`<div class="panel"><div class="ph"><div><h3>Usuarios</h3><p class="small muted" style="margin:2px 0 0">Todas las cuentas del proyecto de Supabase (también las de Surtido). Una cuenta con rol <b>Sin acceso</b> no ve ningún dato de esta app.</p></div>${pend?`<span class="chip warn">${pend} sin acceso</span>`:""}</div>
    <div class="scroll"><table><thead><tr><th>Correo</th><th>Rol</th><th>Pestañas</th></tr></thead><tbody>${S.users.length?S.users.map(u=>{const r=roles.find(x=>x.nombre===u.rol);const t=tabsOfRole(u.rol,r&&r.permisos);
      return `<tr><td>${esc(u.email)}${u.id===S.session.user.id?' <span class="chip">tú</span>':""}</td><td><select data-urol="${esc(u.id)}" aria-label="Rol de ${esc(u.email)}" ${u.id===S.session.user.id?"disabled":""}>${roles.map(x=>`<option value="${esc(x.nombre)}" ${u.rol===x.nombre?"selected":""}>${esc(ROLE_LABEL(x.nombre))}</option>`).join("")}</select></td>
      <td class="small">${t.length?t.map(x=>esc(TABS[x].label)).join(" · "):'<span class="chip bad">Sin acceso</span>'}</td></tr>`}).join(""):`<tr><td colspan="3" class="empty">Cargando usuarios…</td></tr>`}</tbody></table></div>
    <div class="pb small muted" style="padding-top:10px">Para dar de alta a alguien, créalo o invítalo en Supabase → Authentication → Users. Aparece aquí con rol Sin acceso y tú le asignas uno.</div></div>`;
  const permHtml=!S.rolesDb?`<div class="banner">Para configurar permisos por rol, ejecuta supabase/roles.sql en el SQL Editor de Supabase y recarga la página.</div>`:`<div class="panel"><div class="ph"><div><h3>Permisos por rol</h3>
      <p class="small muted" style="margin:2px 0 0">El administrador tiene todo y es el único con Usuarios. Las acciones las valida la base de datos, no solo la app.</p></div>
      <div class="row">${dirty?'<span class="chip warn">Cambios sin guardar</span>':""}<button class="btn" id="pm-def">Valores por defecto</button><button class="btn primary" id="pm-save" ${dirty?"":"disabled"}>Guardar permisos</button></div></div>
    <div class="scroll"><table><thead><tr><th>Privilegio</th><th style="text-align:center">${esc(ROLE_LABEL("admin"))}</th>${others.map(r=>`<th style="text-align:center">${esc(ROLE_LABEL(r.nombre))}${r.nombre==="sin_acceso"?"":`<div><button class="btn danger" data-rdel="${esc(r.nombre)}" style="padding:2px 6px;font-size:11px" ${S.users.some(u=>u.rol===r.nombre)?'disabled title="Tiene usuarios asignados"':""}>Quitar</button></div>`}</th>`).join("")}</tr></thead>
    <tbody>${grupos.map(g=>`<tr class="perm-g"><td colspan="${others.length+2}" class="lbl">${esc(g)}</td></tr>`+PRIVS.filter(p=>p.g===g).map(p=>`<tr><td>${esc(p.l)}</td><td style="text-align:center"><input type="checkbox" checked disabled aria-label="${esc(p.l)}: administrador"></td>${others.map(r=>
      `<td style="text-align:center"><input type="checkbox" data-perm="${esc(r.nombre)}|${p.k}" ${(d[r.nombre]||new Set()).has(p.k)?"checked":""} ${r.nombre==="sin_acceso"?"disabled":""} aria-label="${esc(p.l)}: ${esc(ROLE_LABEL(r.nombre))}"></td>`).join("")}</tr>`).join("")).join("")}
      <tr><td class="small muted">Acceso</td><td style="text-align:center" class="small">Todo</td>${others.map(r=>{const n=tabsOfRole(r.nombre,[...(d[r.nombre]||[])]).length;return `<td style="text-align:center" class="small">${n?`${n} pestaña${n>1?"s":""}`:'<span style="color:var(--bad);font-weight:600">Sin acceso</span>'}</td>`}).join("")}</tr>
    </tbody></table></div>
    <div class="pb"><div class="row"><input type="text" id="role-new" placeholder="Nuevo rol (ej. rh, lider)" aria-label="Nuevo rol" style="flex:1 1 200px"><button class="btn" data-radd>Agregar rol</button></div>
    <p class="small muted" style="margin:10px 0 0">Dar una acción también da su pestaña; quitar una pestaña quita las acciones que dependen de ella. Un rol sin pestañas no puede entrar a la app.</p></div></div>`;
  root.innerHTML=usersHtml+permHtml;
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
  if(!S.tabs||!S.tabs.length)return;
  if(S.tab==="cobertura")renderCobertura();else if(S.tab==="lista")renderLista();else if(S.tab==="personal")renderPersonal();
  else if(S.tab==="reportes"){if(window.CPR)window.CPR.render($("#rep-root"))}
  else if(S.tab==="usuarios")renderUsuarios();else if(S.tab==="movimientos")renderMovimientos();else renderCatalogos();
}
function setTab(t){
  if(t==="certificaciones"){S.cat="certificaciones";t="catalogos"}else if(t==="ajustes")t="catalogos";
  const allowed=S.tabs||[];
  if(!allowed.includes(t))t=allowed[0]||"cobertura";
  S.tab=t;
  const show=!!S.session&&allowed.length>0;
  document.querySelectorAll("section.view").forEach(s=>s.hidden=!show||s.id!=="v-"+t);
  $("#pagehead").hidden=!show;
  if(show){$("#pg-title").textContent=TABS[t].label;$("#pg-sub").textContent=TABS[t].sub;$("#datebox").hidden=!["cobertura","lista","personal"].includes(t)}
  document.querySelectorAll("#tabs [data-tab]").forEach(a=>a.setAttribute("aria-current",a.dataset.tab===t?"page":"false"));
  renderActive();
}
function renderBanner(msg){
  let h=msg||"";
  
  $("#banner").innerHTML=h;
}
window.addEventListener("hashchange",()=>setTab(location.hash.slice(1)));
function renderNav(){
  const pend=S.isAdmin?S.users.filter(u=>u.rol==="sin_acceso").length:0;
  $("#tabs").innerHTML=(S.tabs||[]).map(t=>`<button data-tab="${t}" aria-current="${S.tab===t?"page":"false"}" title="${esc(TABS[t].label)}" aria-label="${esc(TABS[t].label)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TABS[t].icon}</svg><span class="t">${esc(TABS[t].label)}</span>${t==="usuarios"&&pend?`<span class="tab-n" title="${pend} cuenta(s) sin acceso">${pend}</span>`:""}${t==="movimientos"&&pendingToApprove()?`<span class="tab-n" title="Por aprobar">${pendingToApprove()}</span>`:""}</button>`).join("");
  $("#who").innerHTML=`<span class="nm" title="${esc(S.session?S.session.user.email:"")}">${esc(S.session?S.session.user.email:"")}</span><span class="role">${esc(ROLE_LABEL(S.rol))}</span>
    <div class="acts"><button id="chpass" title="Cambiar contraseña" aria-label="Cambiar contraseña"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/></svg><span class="t">Contraseña</span></button>
    <button id="logout" title="Salir" aria-label="Salir"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/></svg><span class="t">Salir</span></button></div>`;
}
document.addEventListener("click",e=>{
  const t=e.target.closest("#tabs [data-tab]");if(t){if(location.hash.slice(1)===t.dataset.tab)setTab(t.dataset.tab);else location.hash=t.dataset.tab;return}
  if(e.target.closest("#logout"))S.sb.auth.signOut();
  if(e.target.closest("#chpass"))openChangePassword();
  if(e.target.closest("#side-toggle"))setMenuCollapsed(!$("#shell").classList.contains("collapsed"));
});
function setMenuCollapsed(c){
  $("#shell").classList.toggle("collapsed",c);const b=$("#side-toggle"),l=c?"Expandir menú":"Contraer menú";
  b.setAttribute("aria-expanded",String(!c));b.setAttribute("aria-label",l);b.title=l;
  try{localStorage.setItem("cp_menu_contraido",c?"1":"0")}catch(e){}
}
try{if(localStorage.getItem("cp_menu_contraido")==="1")setMenuCollapsed(true)}catch(e){}
function openChangePassword(){
  const root=$("#modal-root");
  root.innerHTML=`<div class="modal-scrim"><div class="panel modal" role="dialog" aria-modal="true" aria-labelledby="cp-t">
    <div class="ph"><h3 id="cp-t">Cambiar contraseña</h3><button class="btn" id="cp-x">Cancelar</button></div>
    <form class="pb" id="f-cp" style="display:grid;gap:12px">
      <div class="field"><label for="cp-1">Nueva contraseña</label><input id="cp-1" type="password" autocomplete="new-password" minlength="8" required></div>
      <div class="field"><label for="cp-2">Repítela</label><input id="cp-2" type="password" autocomplete="new-password" minlength="8" required></div>
      <div id="cp-err" style="color:var(--bad);font-size:13px;min-height:1.2em"></div>
      <div class="row" style="justify-content:flex-end"><button class="btn primary">Guardar</button></div></form></div></div>`;
  const close=()=>root.innerHTML="";
  $("#cp-x").onclick=close;$("#cp-1").focus();
  $("#f-cp").onsubmit=async e=>{e.preventDefault();const err=$("#cp-err"),p=$("#cp-1").value;
    if(p!==$("#cp-2").value){err.textContent="Las contraseñas no coinciden.";return}
    const {error}=await S.sb.auth.updateUser({password:p});
    if(error){err.textContent=/least|weak/i.test(error.message)?"Usa al menos 8 caracteres.":/different|same/i.test(error.message)?"Debe ser distinta de la anterior.":error.message;return}
    close();toast("Contraseña actualizada")};
}
function renderNoAccess(){
  const el=$("#noaccess");el.hidden=false;
  el.innerHTML=`<div class="noaccess"><div class="panel"><div class="lbl">Sin acceso</div><h2 style="font-family:var(--f-display);font-size:30px;margin:0">Tu cuenta no tiene acceso</h2>
    <p class="muted" style="margin:0">La cuenta <b>${esc(S.session.user.email)}</b> existe, pero todavía no tiene un rol en Control de Personal. Pide al administrador que te asigne uno en Usuarios.</p>
    <div class="row"><button class="btn primary" id="na-retry">Revisar de nuevo</button><button class="btn" id="na-out">Cerrar sesión</button></div></div></div>`;
  $("#na-retry").onclick=()=>location.reload();$("#na-out").onclick=()=>S.sb.auth.signOut();
}

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
["#l-turno","#l-pos","#l-area","#l-sitio","#l-sup"].forEach(s=>$(s).addEventListener("change",renderLista));
$("#l-q").addEventListener("input",renderLista);
$("#l-list").addEventListener("click",e=>{const b=e.target.closest("[data-mark]");if(b&&S.canMark)mark(b.dataset.emp,b.dataset.mark)});
$("#l-all").addEventListener("click",markAll);
$("#p-q").addEventListener("input",renderPersonal);
["#p-turno","#p-pos","#p-area","#p-sitio","#p-ger","#p-sup","#p-bajas"].forEach(s=>$(s).addEventListener("change",renderPersonal));
$("#p-new").addEventListener("click",()=>openEmp(null));
document.addEventListener("click",e=>{const r=e.target.closest("tr[data-emp]");if(r&&!e.target.closest("button,select,input"))openEmp(r.dataset.emp)});
$("#drawer-root").addEventListener("click",e=>{
  if(e.target.closest("[data-close]")){closeDrawer();return}
  if(e.target.id==="f-addcert"){readForm();D.data.certs=D.data.certs||[];D.data.certs.push({nombre:cfg().certs[0],folio:"",vence:""});renderDrawer();return}
  const del=e.target.closest("[data-cdel]");if(del){readForm();D.data.certs.splice(+del.dataset.cdel,1);renderDrawer();return}
  if(e.target.id==="f-save")saveEmp();
  if(e.target.id==="f-mov"){const n=D.data.num;closeDrawer();openMovModal(mySups().includes(S.emps.get(n).supervisor)||S.perms.has("gestionar_movimientos")?"pase":"solicitud",n)}
});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&D)closeDrawer()});
const CV=$("#v-catalogos");
CV.addEventListener("click",e=>{
  const n=e.target.closest("[data-cat]");
  if(n){S.cat=n.dataset.cat;try{localStorage.setItem("cp_cat",S.cat)}catch(_){}renderCatalogos();return}
  const a=e.target.closest("[data-add]");
  if(a){const k=a.dataset.add;const v=$("#cat-new").value.trim();if(!v)return;
    const arr=cfg()[k]||[];if(arr.includes(v)){toast("Ya existe");return}cfgUpdate({[k]:arr.concat([v])});return}
  if(e.target.id==="sup-add"){addSup();return}
  const sd=e.target.closest("[data-supdel]");
  if(sd){if(sd.dataset.confirm!=="1"){sd.dataset.confirm="1";sd.textContent="¿Seguro?";setTimeout(()=>{if(sd.isConnected){sd.dataset.confirm="";sd.textContent="Quitar"}},3000);return}
    S.sb.from("supervisores").delete().eq("nombre",sd.dataset.supdel).then(({error})=>{if(error)toast(errMsg(error));else{S.sups=S.sups.filter(x=>x.nombre!==sd.dataset.supdel);refreshSelects();renderActive();toast("Supervisor quitado")}});return}
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
CV.addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.id==="cat-new"){const b=CV.querySelector("[data-add]");if(b)b.click()}});
const UV=$("#v-usuarios");
UV.addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.id==="role-new")addRole()});
UV.addEventListener("click",async e=>{
  if(e.target.closest("[data-radd]")){addRole();return}
  const rd=e.target.closest("[data-rdel]");
  if(rd){if(rd.dataset.confirm!=="1"){rd.dataset.confirm="1";rd.textContent="¿Seguro?";setTimeout(()=>{if(rd.isConnected){rd.dataset.confirm="";rd.textContent="Quitar"}},3000);return}
    delRole(rd.dataset.rdel);return}
  if(e.target.id==="pm-def"){PD=Object.fromEntries(S.roles.filter(r=>r.nombre!=="admin").map(r=>[r.nombre,new Set(ROLE_DEFAULTS[r.nombre]||[])]));renderUsuarios();return}
  if(e.target.id==="pm-save"){
    const d=permDraft(),sin=Object.keys(d).filter(r=>r!=="sin_acceso"&&!tabsOfRole(r,[...d[r]]).length);
    if(sin.length&&e.target.dataset.confirm!=="1"){e.target.dataset.confirm="1";e.target.textContent=`${sin.map(ROLE_LABEL).join(", ")} quedará sin acceso. Clic para confirmar`;return}
    e.target.disabled=true;
    for(const r of S.roles.filter(x=>x.nombre!=="admin")){
      const v=[...(d[r.nombre]||[])];if(v.slice().sort().join(",")===[...(r.permisos||[])].sort().join(","))continue;
      const {error}=await S.sb.from("roles").update({permisos:v}).eq("nombre",r.nombre);
      if(error){toast(errMsg(error));e.target.disabled=false;return}
    }
    PD=null;await loadRoles();toast("Permisos guardados");renderUsuarios();return}
});
UV.addEventListener("change",async e=>{
  const c=e.target.closest("[data-perm]");
  if(c){const [r,k]=c.dataset.perm.split("|"),d=permDraft(),set=d[r],p=PRIVS.find(x=>x.k===k);
    if(c.checked){set.add(k);if(p.tab)set.add("tab:"+p.tab)}else{set.delete(k);if(k.startsWith("tab:"))PRIVS.filter(x=>x.tab===k.slice(4)).forEach(x=>set.delete(x.k))}
    renderUsuarios();return}
  const s=e.target.closest("[data-urol]");
  if(s){const {error}=await S.sb.from("perfiles").update({rol:s.value}).eq("id",s.dataset.urol);
    if(error)toast(errMsg(error));else{const u=S.users.find(x=>x.id===s.dataset.urol);if(u)u.rol=s.value;toast("Rol actualizado");renderUsuarios();renderNav()}}
});
async function addSup(){
  const nombre=$("#sup-nombre").value.trim(),email=$("#sup-email").value.trim().toLowerCase(),gerente=$("#sup-ger").value;
  if(!nombre){toast("Escribe el nombre");return}if(S.sups.some(x=>x.nombre.toLowerCase()===nombre.toLowerCase())){toast("Ese supervisor ya existe");return}
  const {data,error}=await S.sb.from("supervisores").insert({nombre,email,gerente}).select().single();
  if(error){toast(errMsg(error));return}S.sups.push(data);S.sups.sort((a,b)=>a.nombre.localeCompare(b.nombre));refreshSelects();renderActive();toast("Supervisor agregado");
}
async function addRole(){
  const v=($("#role-new").value||"").trim().toLowerCase();if(!v)return;
  if(S.roles.some(r=>r.nombre===v)){toast("Ese rol ya existe");return}
  const {error}=await S.sb.from("roles").insert({nombre:v,permisos:[]});
  if(error){toast(errMsg(error));return}
  toast("Rol agregado");PD=null;await loadRoles();renderActive();
}
async function delRole(n){
  const {error}=await S.sb.from("roles").delete().eq("nombre",n);
  if(error){toast(/foreign key|23503/i.test(error.message+error.code)?"No se puede quitar: hay usuarios con ese rol.":errMsg(error));return}
  toast("Rol quitado");PD=null;await loadRoles();renderActive();
}
CV.addEventListener("change",async e=>{
  const c=e.target.closest("[data-creq]");
  if(c){const p=c.dataset.creq;const vals=[...CV.querySelectorAll("[data-creq]")].filter(x=>x.dataset.creq===p&&x.checked).map(x=>x.value);cfgUpdate({certReq:{[p]:vals}});return}
  const sf=e.target.closest("[data-sup]");
  if(sf){const k=sf.dataset.sf,v=k==="activo"?sf.checked:sf.value.trim().toLowerCase&&k==="email"?sf.value.trim().toLowerCase():sf.value;
    const {error}=await S.sb.from("supervisores").update({[k]:v}).eq("nombre",sf.dataset.sup);
    if(error){toast(errMsg(error));return}const x=S.sups.find(y=>y.nombre===sf.dataset.sup);if(x)x[k]=v;toast("Supervisor actualizado");refreshSelects();renderActive();return}
  const f=e.target.closest("[data-perf]");
  if(f){cfgUpdate({perfiles:{[f.dataset.perf]:{[f.dataset.pf]:f.value.trim()}}});toast("Perfil guardado");return}
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

function showLogin(){
  S.session=null;S.emps=new Map();S.att={};S.loaded=false;
  if(S.channel){S.sb.removeChannel(S.channel);S.channel=null}
  $("#login").hidden=false;$("#side").hidden=true;$("#noaccess").hidden=true;S.tabs=[];
  renderBanner();setTab(S.tab);
}
async function startApp(session){
  if(S.session&&S.session.user.id===session.user.id){S.session=session;return}
  S.session=session;
  $("#login").hidden=true;
  const {data:perfil}=await S.sb.from("perfiles").select("rol").eq("id",session.user.id).maybeSingle();
  S.rol=(perfil&&perfil.rol)||"sin_acceso";await loadRoles();
  if(!S.tabs.length){$("#side").hidden=true;renderNoAccess();return}
  $("#side").hidden=false;renderNav();
  renderBanner();setTab(location.hash.slice(1)||S.tab);
  const [c,e]=await Promise.all([S.sb.from("config").select("data").eq("id",1).maybeSingle(),S.sb.from("empleados").select("*")]);
  if(c.data)S.cfg=Object.assign({},DEFAULT_CFG,c.data.data);
  if(e.error){renderBanner(`<div class="banner">No se pudo cargar el personal: ${esc(e.error.message)}</div>`)}
  S.emps=new Map((e.data||[]).map(r=>[r.num,r]));
  S.loaded=true;await loadSups();refreshSelects();loadMovs();
  await loadAttendance();
  if(S.isAdmin){const {data}=await S.sb.from("perfiles").select("id,email,rol").order("email");S.users=data||[];renderNav();renderActive()}
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
  S.perms=new Set(S.isAdmin?PERMS.map(p=>p.id):((r&&r.permisos)||[]).filter(x=>!x.startsWith("tab:")));
  S.tabs=tabsOfRole(S.rol,r&&r.permisos);
  S.canMark=S.perms.has("pasar_lista");S.canPersonal=S.perms.has("editar_personal");
  S.canCatalog=S.perms.has("editar_catalogos");S.canReq=S.perms.has("editar_requeridos");
  $("#cov-edit").hidden=!S.canReq;
  if(S.session&&!$("#side").hidden){
    if(!S.tabs.length){$("#side").hidden=true;document.querySelectorAll("section.view").forEach(x=>x.hidden=true);$("#pagehead").hidden=true;renderNoAccess();return}
    renderNav();if(!S.tabs.includes(S.tab))setTab(S.tabs[0])}
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
      if(window.CPR)window.CPR.invalidate();
      renderActive();
    })
    .on("postgres_changes",{event:"*",schema:"public",table:"empleados"},p=>{
      if(p.eventType==="DELETE")S.emps.delete(p.old.num);else S.emps.set(p.new.num,p.new);refreshSelects();renderActive();
    })
    .on("postgres_changes",{event:"*",schema:"public",table:"roles"},()=>{loadRoles().then(renderActive)})
    .on("postgres_changes",{event:"*",schema:"public",table:"movimientos"},()=>{loadMovs()})
    .on("postgres_changes",{event:"*",schema:"public",table:"supervisores"},()=>{loadSups().then(renderActive)})
    .on("postgres_changes",{event:"*",schema:"public",table:"config"},p=>{
      if(p.new&&p.new.data){S.cfg=Object.assign({},DEFAULT_CFG,p.new.data);refreshSelects();renderActive()}
    })
    .subscribe();
}

window.CP={S,cfg,active,ST,PRESENT,sitioCorto,turnosUsed,listUsed,supsUsed,missingCerts,toast,renderActive:()=>renderActive()};
/* ---------- boot ---------- */
(function boot(){
  const C=window.CP_CONFIG||{};
  if(!window.supabase||!C.supabaseUrl||!C.supabaseAnonKey||/TU-PROYECTO|PEGA/.test(C.supabaseUrl+C.supabaseAnonKey)){
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
