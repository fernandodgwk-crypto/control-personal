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
const VIEWS=["cobertura","lista","personal","movimientos","vacaciones","te","reportes","equipos","s5","catalogos","usuarios"];
const sitioCorto=x=>String(x||"").replace(/^MX Guadalajara North\s*/i,"")||String(x||"");

const S={sb:null,session:null,rol:"lector",perms:new Set(),sups:[],movs:[],movsLoaded:false,prog:[],progLoaded:false,te:[],teLoaded:false,teFecha:null,recent:{},avisos:[],covScope:null,isAdmin:false,canMark:false,canPersonal:false,canCatalog:false,canReq:false,roles:[],emps:new Map(),cfg:null,att:{},date:ymd(new Date()),
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
  vacaciones:{label:"Vacaciones y descansos",nav:"Vacaciones",sub:"Vacaciones, descansos laborados con su descanso compensatorio y control RBA (máximo 6 días seguidos sin descanso).",icon:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4M8 14h3M8 17h6"/>'},
  te:{label:"Tiempo extra",sub:"Horas extra por persona con límites por turno y tope semanal RBA, y el recurso sugerido para cubrir con tiempo extra.",icon:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6M12 2v3"/>'},
  reportes:{label:"Reportes",sub:"Asistencia, ausentismo y cobertura por periodo, con gráficas y descarga a Excel o CSV.",icon:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'},
  catalogos:{label:"Catálogos",sub:"Perfiles, certificaciones, supervisores, áreas, sitios, gerentes y turnos.",icon:'<path d="M4 4h6v6H4zM4 14h6v6H4z"/><path d="M14 6h7M14 9h5M14 16h7M14 19h5"/>'},
  s5:{label:"Limpieza y 5S",sub:"Checklist 5S por área y turno: Clasificar, Ordenar, Limpiar, Estandarizar y Disciplina, con hallazgos y responsables.",icon:'<path d="M12 3l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 8.3l5-.7z"/><path d="M5 21h14"/>'},
  equipos:{label:"Herramental",sub:"Transpaletas, montacargas y herramientas: registro, checklist diario, reparaciones con Gantt, escalación, owners por turno y revisión semanal.",icon:'<path d="M3 17h11V7H3zM14 11h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>'},
  usuarios:{label:"Usuarios",sub:"Quién entra a la app y qué puede hacer cada rol.",icon:'<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M8 17c1-2 2.5-3 4-3s3 1 4 3"/>'}
};
const TAB_ORDER=["cobertura","lista","personal","movimientos","vacaciones","te","reportes","equipos","s5","catalogos"];
const NAV_G={cobertura:"Personal",lista:"Personal",personal:"Personal",movimientos:"Personal",vacaciones:"Personal",te:"Personal",reportes:"Personal",equipos:"Herramental",s5:"Limpieza y 5S",catalogos:"Administración",usuarios:"Administración"};
const PRIVS=[
  ...TAB_ORDER.map(t=>({k:"tab:"+t,g:"Pestañas que ve",l:TABS[t].label})),
  {k:"pasar_lista",g:"Acciones",l:"Pasar lista (asistencia, retardos, faltas, permisos, vacaciones, incapacidades)",tab:"lista"},
  {k:"editar_personal",g:"Acciones",l:"Editar personal (altas, bajas, fichas, celular, certificaciones)",tab:"personal"},
  {k:"editar_requeridos",g:"Acciones",l:"Editar requeridos de la cobertura",tab:"cobertura"},
  {k:"editar_catalogos",g:"Acciones",l:"Editar catálogos (perfiles, supervisores, áreas, sitios, gerentes, turnos, certificaciones)",tab:"catalogos"},
  {k:"equipos_operar",g:"Acciones",l:"Equipos: checklist diario y reportar o dar seguimiento a fallas",tab:"equipos"},
  {k:"equipos_admin",g:"Acciones",l:"Equipos: registro, proveedores, owners por turno, escalación y revisión semanal",tab:"equipos"},
  {k:"s5_operar",g:"Acciones",l:"5S: hacer el checklist de las áreas y registrar o cerrar hallazgos",tab:"s5"},
  {k:"s5_admin",g:"Acciones",l:"5S: áreas del programa, responsables, meta y puntos del checklist",tab:"s5"},
  {k:"gestionar_movimientos",g:"Acciones",l:"Pedir y aprobar cambios de supervisor y programar vacaciones de cualquier equipo (gerencia)",tab:"movimientos"}
];
const ROLE_DEFAULTS={
  supervisor:["tab:cobertura","tab:lista","tab:personal","tab:movimientos","tab:vacaciones","tab:te","tab:reportes","tab:equipos","tab:s5","pasar_lista","equipos_operar","s5_operar"],
  lector:["tab:cobertura","tab:personal","tab:reportes","tab:equipos","tab:s5"],
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
  const sups=supsUsed();fillSelect($("#p-sup"),sups,"Todos los supervisores");fillSelect($("#cov-sup"),sups,"Todos los supervisores");
  const ls=verTodos()?sups:mySups();fillSelect($("#l-sup"),ls,ls.length>1||verTodos()?"Todos mis equipos":null);$("#l-sup").hidden=!verTodos()&&ls.length<2;
  if(verTodos())$("#l-sup").options[0].text="Todos los supervisores";
  fillSelect($("#p-cargo"),["Supervisores","Gerentes","Operativos"],"Todos los cargos");
  fillSelect($("#l-area"),cfg().areas,"Todas las áreas",areaLbl);fillSelect($("#p-area"),cfg().areas,"Todas las áreas",areaLbl);
}
function supsUsed(){const c=S.sups.filter(x=>x.activo!==false).map(x=>x.nombre);active().forEach(e=>{if(e.supervisor&&!c.includes(e.supervisor))c.push(e.supervisor)});return c.sort((a,b)=>a.localeCompare(b))}
const backupOf=()=>S.sups.filter(x=>x.activo!==false&&x.backup_email&&x.backup_email.toLowerCase()===myEmail()).map(x=>x.nombre);
const myTeams=()=>[...new Set([...mySups(),...backupOf()])];
const canMarkFor=e=>S.canMark||backupOf().includes(e.supervisor);
const canProgram=()=>verTodos()||myTeams().length>0;
const isSupName=n=>S.sups.some(x=>x.nombre===n&&x.activo!==false);
const isGerName=n=>(cfg().gerentes||[]).includes(n);
const verTodos=()=>S.isAdmin||S.perms.has("gestionar_movimientos");
const areaLbl=a=>{const s=(cfg().areaSitio||{})[a];return s?`${a} · ${sitioCorto(s)}`:a};
const myEmail=()=>((S.session&&S.session.user.email)||"").toLowerCase();
const mySups=()=>S.sups.filter(x=>x.activo!==false&&x.email&&x.email.toLowerCase()===myEmail()).map(x=>x.nombre);
function listUsed(k,f){const c=(cfg()[k]||[]).slice();active().forEach(e=>{if(e[f]&&!c.includes(e[f]))c.push(e[f])});return c}
const covMine=()=>{if(S.covScope===null)S.covScope=myTeams().length?"mi":"todos";return S.covScope==="mi"};
const covBase=()=>{const st=$("#cov-sitio").value,sp=$("#cov-sup").value,mi=covMine()&&!sp,t=myTeams();return active().filter(e=>(!st||e.sitio===st)&&(!sp||e.supervisor===sp)&&(!mi||t.includes(e.supervisor)))};

/* ---------- coverage ---------- */
function coverage(){
  const C=cfg(),dim=S.dim,T=turnosUsed(),on=S.date;
  const stF=$("#cov-sitio").value,AS=C.areaSitio||{};
  const keys=dim==="area"?C.areas.filter(a=>!stF||!AS[a]||AS[a]===stF):C.posiciones.slice();
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
      if(out.length){h+=`<ul>`+out.map(e=>{const s=markOf(e);return `<li><span>${esc(e.nombre)} <span class="chip ${s?"bad":"warn"}">${s?ST[s]:"Sin registrar"}</span></span><span class="small muted">${esc(e.posicion||"")}</span></li>`}).join("")+`</ul>`}
      else h+=`<span class="muted" style="font-size:13px">No hay personas asignadas suficientes para el requerido.</span>`;
      const sg=sugeridosTE(e=>(S.dim==="area"?e.area:e.posicion)===c.k&&e.turno!==c.t,S.date).slice(0,3);
      h+=`<div class="small" style="border-top:1px dashed var(--line);padding-top:6px"><b>Recurso a considerar para T.E.:</b> ${sg.length?sg.map(x=>`${esc(x.e.nombre)} <span class="muted">(${esc(turnoCorto(x.e.turno))} · ${x.disp} h disp.)</span>`).join(", "):'<span class="muted">nadie disponible sin rebasar límites</span>'}</div>`;
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
  const rb=rbaList(covBase()).filter(x=>x.n>=6);
  if(rb.length)h=`<div class="banner" style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><span><b>RBA:</b> ${rb.length} persona${rb.length>1?"s":""} con 6 días seguidos o más trabajando (${rb.slice(0,4).map(x=>esc(x.e.nombre)).join(", ")}${rb.length>4?"…":""}).</span><a href="#vacaciones" style="color:inherit;font-weight:600">Ver en Vacaciones y descansos</a></div>`+h;
  $("#cov-alerts").innerHTML=h;
  document.querySelectorAll("#cov-scope button").forEach(b=>b.setAttribute("aria-pressed",String((b.dataset.v==="mi")===covMine())));
  $("#cov-scope").hidden=!myTeams().length;

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
  <div class="scroll"><table><thead><tr><th>Nombre</th><th>${S.dim==="area"?"Posición":"Área"}</th><th>Estado</th><th>Supervisor</th><th>Certificaciones</th></tr></thead><tbody>${
    ppl.map(e=>{const s=markOf(e);const miss=missingCerts(e,S.date);return `<tr class="click" data-emp="${esc(e.num)}"><td>${esc(e.nombre)}<div class="mono muted">${esc(e.num)}</div></td><td>${esc((S.dim==="area"?e.posicion:e.area)||"—")}</td>
      <td>${s?`<span class="chip ${PRESENT.has(s)?"ok":"bad"}">${ST[s]}</span>`:`<span class="chip warn">Sin registrar</span>`}</td><td class="small">${esc(e.supervisor||"—")}</td>
      <td>${(e.certs||[]).length?(e.certs||[]).map(x=>`<span class="chip ${certValid(x,S.date)?"ok":"bad"}">${esc(x.nombre)}</span>`).join(" "):'<span class="muted">—</span>'}${miss.length?` <span class="chip warn">falta ${esc(miss.join(", "))}</span>`:""}</td></tr>`}).join("")||`<tr><td colspan="5" class="muted">Nadie asignado aquí.</td></tr>`
  }</tbody></table></div></div>`;
}

/* ---------- roll call ---------- */
function rollPeople(){
  const t=$("#l-turno").value,p=$("#l-pos").value,a=$("#l-area").value,st=$("#l-sitio").value,sp=$("#l-sup").value,q=$("#l-q").value.trim().toLowerCase();
  const my=myTeams(),todos=verTodos();
  return active().filter(e=>(todos||my.includes(e.supervisor))&&e.turno===t&&(!p||e.posicion===p)&&(!a||e.area===a)&&(!st||e.sitio===st)&&(!sp||e.supervisor===sp)&&(!q||e.nombre.toLowerCase().includes(q)||String(e.num).includes(q)))
    .sort((x,y)=>(x.posicion||"").localeCompare(y.posicion||"")||x.nombre.localeCompare(y.nombre));
}
function renderLista(){
  renderBackupBox();
  if(S.session&&!verTodos()&&!myTeams().length){$("#l-sum").innerHTML="";$("#l-all").disabled=true;
    $("#l-list").innerHTML=`<div class="empty">Tu cuenta no está ligada a ningún supervisor, así que no tienes personal en tu pase de lista.<br>Pide al administrador que ponga tu correo en Catálogos → Supervisores.</div>`;return}
  const ppl=rollPeople();const cnt={};let pend=0;
  ppl.forEach(e=>{const s=markOf(e);if(s)cnt[s]=(cnt[s]||0)+1;else pend++});
  $("#l-sum").innerHTML=`<span class="chip">${ppl.length} personas</span>`+Object.keys(ST).filter(k=>cnt[k]).map(k=>`<span class="chip ${PRESENT.has(k)?"ok":"bad"}">${ST[k]}: ${cnt[k]}</span>`).join("")+(pend?`<span class="chip warn">Sin registrar: ${pend}</span>`:`<span class="chip ok">Lista completa</span>`);
  $("#l-all").disabled=!pend||!ppl.some(canMarkFor);
  if(!ppl.length){$("#l-list").innerHTML=`<div class="empty">${S.loaded?"No hay personas con estos filtros.":"Cargando personal…"}</div>`;return}
  $("#l-list").innerHTML=ppl.map(e=>{const s=markOf(e);
    const pg=progOn(e.num,S.date),stk=streakBefore(e.num,S.date);
    return `<div class="rrow"><div class="who"><b>${esc(e.nombre)}</b><span><span class="mono">${esc(e.num)}</span> · ${esc(e.posicion||"sin posición")}${e.area?" · "+esc(e.area):""}${e.celular?` · <span class="tel">${esc(e.celular)}</span>`:""}</span>
      ${pg.vac?'<span class="chip info" style="margin-top:4px">Vacaciones programadas</span> ':""}${pg.comp?'<span class="chip acc" style="margin-top:4px">Descanso compensatorio</span> ':""}${pg.dl?'<span class="chip warn" style="margin-top:4px">Trabaja su descanso</span> ':""}${stk>=6&&!s?`<span class="chip bad" style="margin-top:4px">RBA: ${stk} días seguidos, debe descansar</span>`:""}</div>
    <div class="marks">${Object.keys(ST).map(k=>`<button class="mk s-${k} ${s===k?"on":""}" data-mark="${k}" data-emp="${esc(e.num)}" title="${ST[k]}" aria-label="${ST[k]}: ${esc(e.nombre)}" aria-pressed="${s===k}" ${canMarkFor(e)?"":"disabled"}>${k}</button>`).join("")}</div></div>`}).join("");
}
async function mark(num,s){
  const e=S.emps.get(num);if(!e)return;
  const cur=markOf(e);const fecha=S.date;
  const prev=S.att[num];
  if(cur===s){delete S.att[num];addRecent(num,fecha,null)}else{S.att[num]=s;addRecent(num,fecha,s)}
  renderActive();
  const q=cur===s
    ?S.sb.from("asistencia").delete().match({fecha,num})
    :S.sb.from("asistencia").upsert({fecha,num,estado:s,turno:e.turno,marcado_por:S.session.user.id,marcado_en:new Date().toISOString()});
  const {error}=await q;
  if(error){if(prev)S.att[num]=prev;else delete S.att[num];renderActive();toast(errMsg(error))}
}
async function markAll(){
  const fecha=S.date;
  const ppl=rollPeople().filter(e=>!markOf(e)&&canMarkFor(e)&&!progOn(e.num,fecha).comp);if(!ppl.length)return;
  const now=new Date().toISOString(),uid=S.session.user.id,est=e=>progOn(e.num,fecha).vac?"V":"A";
  ppl.forEach(e=>{S.att[e.num]=est(e);addRecent(e.num,fecha,est(e))});renderActive();
  const {error}=await S.sb.from("asistencia").upsert(ppl.map(e=>({fecha,num:e.num,estado:est(e),turno:e.turno,marcado_por:uid,marcado_en:now})));
  if(error){ppl.forEach(e=>delete S.att[e.num]);renderActive();toast(errMsg(error))}else toast(`${ppl.length} marcados como asistencia`);
}

/* ---------- personal ---------- */
function renderPersonal(){
  $("#p-new").hidden=!S.canPersonal;
  const q=$("#p-q").value.trim().toLowerCase(),t=$("#p-turno").value,p=$("#p-pos").value,a=$("#p-area").value,st=$("#p-sitio").value,g=$("#p-ger").value,sp=$("#p-sup").value,cg=$("#p-cargo").value,b=$("#p-bajas").checked;
  const cargoOk=e=>!cg||(cg==="Supervisores"?isSupName(e.nombre):cg==="Gerentes"?isGerName(e.nombre):(!isSupName(e.nombre)&&!isGerName(e.nombre)));
  const ppl=[...S.emps.values()].filter(e=>(b||e.activo!==false)&&(!t||e.turno===t)&&(!p||e.posicion===p)&&(!a||e.area===a)&&(!st||e.sitio===st)&&(!g||e.gerente===g)&&(!sp||e.supervisor===sp)&&cargoOk(e)&&
    (!q||e.nombre.toLowerCase().includes(q)||String(e.num).includes(q)||(e.celular||"").includes(q))).sort((x,y)=>x.nombre.localeCompare(y.nombre));
  if(!ppl.length){$("#p-table").innerHTML=`<div class="empty">${S.loaded?"Sin resultados.":"Cargando personal…"}</div>`;return}
  const soon=addDays(S.date,30);
  $("#p-table").innerHTML=`<table><thead><tr><th>Nombre</th><th>Turno</th><th>Posición</th><th>Área</th><th>Sitio</th><th>Reporta a</th><th>Celular</th><th>Certificaciones</th><th>Hoy</th></tr></thead><tbody>${
    ppl.map(e=>{const s=markOf(e);const miss=missingCerts(e,S.date);
      const certs=(e.certs||[]).map(c=>{const st=!certValid(c,S.date)?"bad":(c.vence&&c.vence<=soon?"warn":"ok");return `<span class="chip ${st}" title="${c.vence?"Vence "+fmtD(c.vence):"Sin vencimiento"}">${esc(c.nombre)}</span>`}).join(" ");
      return `<tr class="click" data-emp="${esc(e.num)}"><td><b style="font-weight:600">${esc(e.nombre)}</b>${e.activo===false?' <span class="chip">Baja</span>':""}${isGerName(e.nombre)?' <span class="chip info">Gerente</span>':""}${isSupName(e.nombre)?` <span class="chip acc">Supervisor · ${countBy("supervisor",e.nombre)}</span>`:""}<div class="mono muted">${esc(e.num)} · ${esc(e.puesto||"")}</div></td>
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
  D={isNew:!e,orig:e?e.nombre:"",data:JSON.parse(JSON.stringify(e||{num:"",nombre:"",email:"",turno:$("#l-turno").value||cfg().turnos[0]||"",posicion:"",puesto:"",area:"",sitio:"",gerente:"",supervisor:"",celular:"",certs:[],activo:true,notas:""}))};
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
      <div class="field"><label for="f-area">Área</label><select id="f-area" ${dis}>${(()=>{const l=C.areas.slice();if(d.area&&!l.includes(d.area))l.push(d.area);return '<option value="">Sin asignar</option>'+l.map(a=>`<option value="${esc(a)}" ${a===d.area?"selected":""}>${esc(areaLbl(a))}</option>`).join("")})()}</select></div>
      <div class="field"><label for="f-puesto">Puesto (HR)</label><input id="f-puesto" type="text" value="${esc(d.puesto)}" ${dis}></div>
      <div class="field"><label for="f-sitio">Sitio</label><select id="f-sitio" ${dis}>${opt(C.sitios||[],d.sitio,"Sin sitio")}</select></div>
      <div class="field"><label for="f-sup">Supervisor directo</label><select id="f-sup" ${D.isNew||S.isAdmin?dis:"disabled"} title="${D.isNew||S.isAdmin?"":"El supervisor se cambia con un movimiento aprobado"}">${opt(supsUsed(),d.supervisor,"Sin supervisor")}</select>${!D.isNew&&canRequestFor(d)?`<button type="button" class="btn" id="f-mov" style="margin-top:6px">Solicitar cambio de supervisor</button>`:""}${pendingFor(d.num)?`<span class="chip warn" style="margin-top:6px;align-self:flex-start">Movimiento pendiente</span>`:""}</div>
      <div class="field"><label for="f-ger">Gerente</label><select id="f-ger" ${dis}>${opt(C.gerentes||[],d.gerente,"Sin gerente")}</select></div>
      <div class="field"><label for="f-activo">Estatus</label><select id="f-activo" ${dis}><option value="1" ${d.activo!==false?"selected":""}>Activo</option><option value="0" ${d.activo===false?"selected":""}>Baja</option></select></div>
    </div>
    ${cargoBlock(d)}
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
function cargoBlock(d){
  const ed=S.canCatalog,dis=ed?"":"disabled",sup=isSupName(D.orig||d.nombre),ger=isGerName(D.orig||d.nombre);
  const acc=S.isAdmin&&d.email?S.users.find(u=>(u.email||"").toLowerCase()===d.email.trim().toLowerCase()):null;
  return `<div class="panel" style="padding:12px;display:grid;gap:10px"><h2 style="font-size:18px;margin:0">Cargo y acceso</h2>
    <div class="row" style="gap:18px">
      <label class="ck" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="f-essup" ${sup?"checked":""} ${dis} style="width:auto"> Es supervisor${sup?` <span class="muted small">(${countBy("supervisor",D.orig||d.nombre)} personas)</span>`:""}</label>
      <label class="ck" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="f-esger" ${ger?"checked":""} ${dis} style="width:auto"> Es gerente</label>
    </div>
    ${ed?`<div class="small muted">Como supervisor, su correo es el de la cuenta con la que aprueba movimientos. Su gerente será la persona a la que reporta.</div>`:""}
    ${S.isAdmin?(acc?`<div class="field"><label for="f-rol">Rol en la app (${esc(acc.email)})</label><select id="f-rol" ${acc.id===S.session.user.id?"disabled":""}>${S.roles.map(r=>`<option value="${esc(r.nombre)}" ${acc.rol===r.nombre?"selected":""}>${esc(ROLE_LABEL(r.nombre))}</option>`).join("")}</select></div>`
      :`<div class="small muted">${d.email?"Ese correo no tiene cuenta en la app. Créala en Supabase → Authentication → Users y aquí podrás asignarle rol.":"Sin correo: no se puede ligar a una cuenta de la app."}</div>`):""}
  </div>`;
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
  S.emps.set(data.num,data);
  const essup=$("#f-essup"),esger=$("#f-esger"),frol=$("#f-rol");
  try{await syncCargo(D.orig,data,essup&&!essup.disabled?essup.checked:null,esger&&!esger.disabled?esger.checked:null,frol&&!frol.disabled?frol.value:null)}catch(err){toast(err.message||String(err))}
  refreshSelects();renderActive();toast("Guardado");closeDrawer();
}
async function syncCargo(orig,e,sup,ger,rol){
  const nombre=e.nombre,email=(e.email||"").trim().toLowerCase();
  // cambio de nombre de alguien que es supervisor o gerente: llevarlo a sus referencias
  if(orig&&orig!==nombre&&S.canCatalog){
    if(S.sups.some(x=>x.nombre===orig)){const {error}=await S.sb.rpc("renombrar_catalogo",{p_campo:"supervisor",p_viejo:orig,p_nuevo:nombre});if(error)throw error;await loadSups()}
    if(isGerName(orig)){const {error}=await S.sb.rpc("renombrar_catalogo",{p_campo:"gerente",p_viejo:orig,p_nuevo:nombre});if(error)throw error;cfgUpdate({gerentes:cfg().gerentes.map(x=>x===orig?nombre:x)})}
  }
  if(sup!==null&&S.canCatalog){
    const x=S.sups.find(y=>y.nombre===nombre);
    if(sup&&!x){const {error}=await S.sb.from("supervisores").insert({nombre,email,gerente:e.supervisor||""});if(error)throw error}
    else if(sup&&x){const p={activo:true};if(!x.email&&email)p.email=email;const {error}=await S.sb.from("supervisores").update(p).eq("nombre",nombre);if(error)throw error}
    else if(!sup&&x&&x.activo!==false){const {error}=await S.sb.from("supervisores").update({activo:false}).eq("nombre",nombre);if(error)throw error}
    await loadSups();
  }
  if(ger!==null&&S.canCatalog){const g=cfg().gerentes||[];
    if(ger&&!g.includes(nombre))cfgUpdate({gerentes:g.concat([nombre])});else if(!ger&&g.includes(nombre))cfgUpdate({gerentes:g.filter(y=>y!==nombre)})}
  if(rol!==null&&S.isAdmin){const u=S.users.find(y=>(y.email||"").toLowerCase()===email);
    if(u&&u.rol!==rol){const {error}=await S.sb.from("perfiles").update({rol}).eq("id",u.id);if(error)throw error;u.rol=rol;renderNav()}}
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
const CAMPO={areas:"area",sitios:"sitio",gerentes:"gerente",turnos:"turno",posiciones:"posicion",certs:"cert",supervisores:"supervisor"};
function editCell(key,v,label){
  if(S.editing===key+"|"+v)return `<div class="row" style="gap:6px"><input type="text" id="ren-in" value="${esc(v)}" aria-label="Nuevo nombre" style="min-width:180px"><button class="btn primary" data-rensave="${esc(key)}|${esc(v)}">Guardar</button><button class="btn" data-rencancel>Cancelar</button></div>`;
  return `${label!==undefined?label:esc(v)}${S.canCatalog?` <button class="btn" data-ren="${esc(key)}|${esc(v)}" style="padding:2px 8px;font-size:12px;margin-left:6px">Editar</button>`:""}`;
}
function renKeys(obj,old,nu,byPrefix){if(!obj)return obj;const o={};Object.keys(obj).forEach(k=>{let nk=k;if(byPrefix){if(k.startsWith(old+"__"))nk=nu+k.slice(old.length)}else if(k===old)nk=nu;o[nk]=obj[k]});return o}
async function renameCatalog(key,old,nu){
  nu=nu.trim();if(!nu||nu===old){S.editing=null;renderCatalogos();return}
  const C=cfg();
  if(key!=="supervisores"&&(C[key]||[]).includes(nu)){toast("Ya existe "+nu);return}
  const {data:n,error}=await S.sb.rpc("renombrar_catalogo",{p_campo:CAMPO[key],p_viejo:old,p_nuevo:nu});
  if(error){toast(error.message);return}
  if(key!=="supervisores"){
    const patch={[key]:(C[key]||[]).map(x=>x===old?nu:x)};
    const nc=JSON.parse(JSON.stringify(C));Object.assign(nc,patch);
    if(key==="areas"){nc.areaSitio=renKeys(C.areaSitio,old,nu);nc.req=Object.assign({},C.req,{area:renKeys((C.req||{}).area,old,nu,true)})}
    if(key==="posiciones"){nc.perfiles=renKeys(C.perfiles,old,nu);nc.certReq=renKeys(C.certReq,old,nu);nc.req=Object.assign({},C.req,{posicion:renKeys((C.req||{}).posicion,old,nu,true)})}
    if(key==="turnos"&&C.te&&C.te.turnos){nc.te=Object.assign({},C.te,{turnos:renKeys(C.te.turnos,old,nu)})}
    if(key==="turnos"){["area","posicion"].forEach(dm=>{const r=(C.req||{})[dm]||{},o={};Object.keys(r).forEach(k=>{o[k.endsWith("__"+old)?k.slice(0,-old.length)+nu:k]=r[k]});nc.req=Object.assign({},nc.req||C.req,{[dm]:o})})}
    if(key==="certs"){const cr={};Object.keys(C.certReq||{}).forEach(p=>cr[p]=(C.certReq[p]||[]).map(x=>x===old?nu:x));nc.certReq=cr}
    S.cfg=nc;const {error:e2}=await S.sb.from("config").upsert({id:1,data:nc});if(e2){toast(errMsg(e2));return}
  }
  S.editing=null;
  const {data}=await S.sb.from("empleados").select("*");if(data)S.emps=new Map(data.map(r=>[r.num,r]));
  if(key==="supervisores")await loadSups();
  refreshSelects();renderActive();toast(`Cambiado a "${nu}"${n?` · ${n} registro(s) actualizados`:""}`);
}
function addRow(key,ph){return S.canCatalog?`<div class="toolbar"><input type="text" id="cat-new" class="grow" placeholder="${esc(ph)}" aria-label="${esc(ph)}"><button class="btn primary" data-add="${key}">Agregar</button></div>`:""}
function delBtn(key,v){return S.canCatalog?`<button class="btn danger" data-ldel="${key}" data-v="${esc(v)}">Quitar</button>`:""}
function catPerfiles(){
  const C=cfg(),P=C.perfiles||{},T=turnosUsed(),dis=S.canCatalog?"":"disabled";
  return `<div class="cathead"><h2>Perfiles</h2><p>Qué hace cada posición, a qué puesto de HR corresponde y qué certificaciones necesita. La descripción aparece en la ficha de cada persona.</p></div>
  ${addRow("posiciones","Nueva posición")}
  <div class="perfiles">${C.posiciones.map(p=>{const d=P[p]||{};const ppl=active().filter(e=>e.posicion===p);
    const porT=T.map(t=>[t,ppl.filter(e=>e.turno===t).length]).filter(x=>x[1]);
    return `<div class="panel perfil"><h3>${editCell("posiciones",p,esc(p))} <span class="chip">${ppl.length} personas</span>${porT.map(([t,n])=>`<span class="chip acc">${esc(t)}: ${n}</span>`).join("")}</h3>
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
      return `<tr><td>${editCell("supervisores",x.nombre,`<b style="font-weight:600">${esc(x.nombre)}</b>`)}</td>
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
  const isA=c.id==="areas",sit=cfg().sitios||[],AS=cfg().areaSitio||{};
  const lista=isA?arr.slice().sort((a,b)=>(sitioCorto(AS[a]||"~")).localeCompare(sitioCorto(AS[b]||"~"))||a.localeCompare(b)):arr;
  return `<div class="cathead"><h2>${esc(c.label)}</h2><p>${esc(c.help)}${isA?" Cada área pertenece a un edificio; al filtrar la cobertura por sitio solo aparecen sus áreas.":""}</p></div>
  ${isA&&S.canCatalog?`<div class="toolbar"><input type="text" id="cat-new" class="grow" placeholder="Nueva área" aria-label="Nueva área"><select id="cat-new-sitio" aria-label="Edificio"><option value="">Edificio</option>${sit.map(x=>`<option value="${esc(x)}">${esc(sitioCorto(x))}</option>`).join("")}</select><button class="btn primary" data-add="areas">Agregar</button></div>`:addRow(c.key,"Nuevo "+c.one)}
  <div class="panel" style="padding:0"><div class="scroll"><table><thead><tr><th>${esc(c.label.slice(0,-1)==="Área"?"Área":c.one[0].toUpperCase()+c.one.slice(1))}</th>${isA?"<th>Edificio</th>":""}<th class="num">Personas</th>${extra?"<th>Supervisores en su equipo</th>":""}<th></th></tr></thead><tbody>${
    lista.map(v=>{const n=countBy(c.field,v);
      const sups=extra?[...new Set(active().filter(e=>e.gerente===v).map(e=>e.supervisor).filter(Boolean))].sort():[];
      return `<tr><td>${editCell(c.key,v,esc(c.id==="sitios"?sitioCorto(v):v))}${c.id==="sitios"&&sitioCorto(v)!==v?`<div class="muted" style="font-size:12px">${esc(v)}</div>`:""}</td>${isA?`<td><select data-asitio="${esc(v)}" aria-label="Edificio de ${esc(v)}" ${S.canCatalog?"":"disabled"}><option value="">Sin edificio</option>${sit.map(x=>`<option value="${esc(x)}" ${AS[v]===x?"selected":""}>${esc(sitioCorto(x))}</option>`).join("")}</select></td>`:""}<td class="num">${n||'<span class="muted">0</span>'}</td>${extra?`<td style="font-size:13.5px">${sups.map(esc).join(", ")||'<span class="muted">—</span>'}</td>`:""}<td style="text-align:right">${delBtn(c.key,v)}</td></tr>`}).join("")||`<tr><td colspan="4" class="empty">Vacío.</td></tr>`
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
      return `<tr><td>${editCell("certs",n)}</td><td>${reqBy(n).map(p=>`<span class="chip">${esc(p)}</span>`).join(" ")||'<span class="muted">—</span>'}</td><td class="num">${v}</td><td class="num" style="color:${p?"var(--warn)":"inherit"}">${p}</td><td class="num" style="color:${x?"var(--bad)":"inherit"}">${x}</td><td style="text-align:right">${S.canCatalog?`<button class="btn danger" data-certdel="${esc(n)}">Quitar</button>`:""}</td></tr>`}).join("")||'<tr><td colspan="6" class="empty">Sin certificaciones.</td></tr>'
  }</tbody></table></div></div>
  <div class="panel"><h2>Vencimientos <span class="sub">vencidas y próximos 60 días</span></h2><div class="scroll">${exp.length?`<table><thead><tr><th>Persona</th><th>Certificación</th><th>Vence</th><th>Turno</th><th>Celular</th></tr></thead><tbody>${exp.map(({e,c})=>`<tr class="click" data-emp="${esc(e.num)}"><td>${esc(e.nombre)}</td><td>${esc(c.nombre)}${c.folio?` <span class="mono muted">${esc(c.folio)}</span>`:""}</td><td><span class="chip ${c.vence<on?"bad":"warn"}">${c.vence<on?"Vencida ":""}${fmtD(c.vence)}</span></td><td>${esc(e.turno)}</td><td class="tel">${esc(e.celular||"—")}</td></tr>`).join("")}</tbody></table>`:`<div class="empty">Nada vence en los próximos 60 días.</div>`}</div></div>
  <div class="panel"><h2>Sin la certificación que pide su posición</h2><div class="scroll">${miss.length?`<table><thead><tr><th>Persona</th><th>Posición</th><th>Le falta</th><th>Turno</th></tr></thead><tbody>${miss.map(({e,m})=>`<tr class="click" data-emp="${esc(e.num)}"><td>${esc(e.nombre)}</td><td>${esc(e.posicion)}</td><td>${m.map(n=>`<span class="chip warn">${esc(n)}</span>`).join(" ")}</td><td>${esc(e.turno)}</td></tr>`).join("")}</tbody></table>`:`<div class="empty">Todos tienen las certificaciones que pide su posición.</div>`}</div></div>`;
}
/* ---------- Movimientos (cambio de supervisor) ---------- */
const pendingFor=num=>S.movs.find(m=>m.num===num&&m.estado==="pendiente");
const gestiona=()=>S.perms.has("gestionar_movimientos");
function canRequestFor(e){return gestiona()||mySups().length>0}
const norm=x=>String(x||"").trim().toLowerCase();
function soyGerenteDe(nombre){if(!nombre)return false;const me=myEmail();for(const e of S.emps.values())if(norm(e.nombre)===norm(nombre)&&norm(e.email)===me&&me)return true;return false}
// Aprueban: admin, el supervisor involucrado que no lo pidió y el gerente (de la persona o de los supervisores). Nunca quien lo pidió.
function iApprove(m){if(m.estado!=="pendiente")return false;if(S.isAdmin)return true;
  if(m.solicitado_por===S.session.user.id||norm(m.solicitado_email)===myEmail())return false;
  const my=mySups();if(my.includes(m.de_supervisor)||my.includes(m.a_supervisor))return true;
  const e=S.emps.get(m.num),gs=[e&&e.gerente,...S.sups.filter(x=>x.nombre===m.de_supervisor||x.nombre===m.a_supervisor).map(x=>x.gerente)];
  return gs.some(soyGerenteDe)}
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
      <p class="small muted" style="margin:0">${S.isAdmin?"Como administrador, el cambio se aplica al momento y queda en el historial.":(tipo==="pase"?"Lo aprueba el supervisor que la recibe, el gerente o el administrador.":"Lo aprueba el supervisor actual de la persona, el gerente o el administrador.")+" Tú no puedes aprobar tu propia solicitud; solo cancelarla."+" Hasta que se apruebe, la persona sigue con su supervisor actual."}</p>
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
    root.innerHTML="";toast(S.isAdmin?"Cambio aplicado (administrador, sin aprobación)":"Solicitud enviada");await loadMovs();
    if(S.isAdmin){const {data}=await S.sb.from("empleados").select("*");if(data){S.emps=new Map(data.map(r=>[r.num,r]));refreshSelects();renderActive()}}
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

/* ---------- Vacaciones, descanso laborado y RBA ---------- */
function addRecent(num,f,s){const m=S.recent[num]||(S.recent[num]={});if(s)m[f]=s;else delete m[f]}
function streakBefore(num,f){let n=0,d=addDays(f,-1);const m=S.recent[num]||{};while(n<31&&(m[d]==="A"||m[d]==="R")){n++;d=addDays(d,-1)}return n}
function streakAt(num,f){const m=S.recent[num]||{};return (m[f]==="A"||m[f]==="R")?streakBefore(num,f)+1:0}
function progOn(num,f){const o={vac:false,comp:false,dl:false};S.prog.forEach(p=>{if(p.num!==num||p.estado!=="activo")return;
  if(p.tipo==="vacaciones"&&p.desde<=f&&p.hasta>=f)o.vac=true;if(p.tipo==="descanso_laborado"){if(p.desde===f)o.dl=true;if(p.compensa===f)o.comp=true}});return o}
function rbaList(ppl){const hoy=ymd(new Date());return ppl.map(e=>{const m=S.recent[e.num]||{};const worked=m[hoy]==="A"||m[hoy]==="R";const n=worked?streakAt(e.num,hoy):streakBefore(e.num,hoy);return{e,n,worked}}).filter(x=>x.n>=5).sort((a,b)=>b.n-a.n)}
function scopePeople(){const t=myTeams();return active().filter(e=>verTodos()||t.includes(e.supervisor))}
async function loadRecent(){
  const desde=addDays(ymd(new Date()),-40),out=[];
  for(let from=0;;from+=1000){const {data,error}=await S.sb.from("asistencia").select("num,fecha,estado").gte("fecha",desde).order("fecha").range(from,from+999);if(error||!data)break;out.push(...data);if(data.length<1000)break}
  S.recent={};out.forEach(r=>addRecent(r.num,r.fecha,r.estado));
}
async function loadProg(){const {data,error}=await S.sb.from("programacion").select("*").gte("hasta",addDays(ymd(new Date()),-90)).order("desde");S.prog=error?[]:(data||[]);S.progLoaded=true;renderActive()}
async function loadAvisos(){const {data,error}=await S.sb.from("avisos").select("*").order("creado",{ascending:false}).limit(150);S.avisos=error?[]:(data||[]);renderNav()}
const fmtF=f=>f?fmtD(f):"";
function renderVacaciones(){
  const root=$("#vac-root");
  if(!S.progLoaded){root.innerHTML='<div class="panel empty">Cargando…</div>';return}
  const hoy=ymd(new Date()),scope=scopePeople(),nums=new Set(scope.map(e=>e.num));
  const rb=rbaList(scope);
  const act=S.prog.filter(p=>p.estado==="activo"&&nums.has(p.num));
  const prox=act.filter(p=>p.hasta>=hoy||(p.compensa&&p.compensa>=hoy)).sort((a,b)=>a.desde.localeCompare(b.desde));
  const pas=S.prog.filter(p=>nums.has(p.num)&&!prox.includes(p)).sort((a,b)=>b.desde.localeCompare(a.desde)).slice(0,60);
  const row=(p,cancel)=>{const e=S.emps.get(p.num)||{nombre:p.num};const vac=p.tipo==="vacaciones";const dias=vac?Math.round((new Date(p.hasta)-new Date(p.desde))/864e5)+1:0;
    return `<tr><td>${esc(e.nombre)}<div class="small muted">${esc(e.supervisor||"")} · ${esc(e.turno||"")}</div></td>
      <td><span class="chip ${vac?"info":"warn"}">${vac?"Vacaciones":"Descanso laborado"}</span></td>
      <td class="nw">${vac?`${fmtF(p.desde)}${p.hasta>p.desde?" al "+fmtF(p.hasta):""} <span class="muted small">(${dias} día${dias>1?"s":""})</span>`:`Trabaja ${fmtF(p.desde)}`}</td>
      <td class="nw">${vac?"—":p.compensa?`Descansa ${fmtF(p.compensa)}`:'<span class="chip bad">Sin descanso compensatorio</span>'}</td>
      <td class="small">${esc(p.nota||"")}<div class="muted">${esc(p.creado_email||"")}</div></td>
      <td>${p.estado==="cancelado"?'<span class="chip">Cancelado</span>':cancel?`<button class="btn danger" data-pcan="${p.id}">Cancelar</button>`:""}</td></tr>`};
  const tabla=(list,cancel,vacio)=>`<div class="scroll"><table><thead><tr><th>Persona</th><th>Tipo</th><th>Fechas</th><th>Descanso compensatorio</th><th>Nota</th><th></th></tr></thead><tbody>${list.length?list.map(p=>row(p,cancel)).join(""):`<tr><td colspan="6" class="empty">${vacio}</td></tr>`}</tbody></table></div>`;
  root.innerHTML=`
  <div class="rep-top"><div class="small muted">${verTodos()?"Ves a todo el personal.":myTeams().length?`Tu personal: <b>${myTeams().map(esc).join(", ")}</b>`:"Tu cuenta no está ligada a ningún supervisor."} Los avisos llegan al administrador, al gerente y al supervisor a cargo.</div>
    ${canProgram()?`<div class="row"><button class="btn primary" data-pnew="vacaciones">Asignar vacaciones</button><button class="btn" data-pnew="descanso_laborado">Registrar descanso laborado</button></div>`:""}</div>
  <div class="panel" style="padding:0"><div class="ph"><h3>Control RBA</h3><span class="small muted">Días seguidos trabajando al día de hoy (asistencia o retardo). Máximo 6 sin descanso.</span></div><div class="scroll"><table><thead><tr><th>Persona</th><th>Supervisor</th><th class="num">Días seguidos</th><th>Estado</th><th></th></tr></thead><tbody>${
    rb.length?rb.map(x=>`<tr><td>${esc(x.e.nombre)}<div class="small muted">${esc(x.e.posicion||"")} · ${esc(x.e.turno||"")}</div></td><td class="small">${esc(x.e.supervisor||"")}</td><td class="num" style="font-weight:600;${x.n>=6?"color:var(--bad)":""}">${x.n}</td>
      <td>${x.n>=7?'<span class="chip bad">Incumple RBA</span>':x.n===6?`<span class="chip bad">Debe descansar ${x.worked?"mañana":"hoy"}</span>`:'<span class="chip warn">Atención: 5 días</span>'}</td>
      <td>${canProgram()?`<button class="btn" data-pnew="descanso_laborado" data-pnum="${esc(x.e.num)}">Programar descanso</button>`:""}</td></tr>`).join("")
    :`<tr><td colspan="5" class="empty">Nadie lleva 5 días seguidos o más trabajando.</td></tr>`}</tbody></table></div></div>
  <div class="panel" style="padding:0"><div class="ph"><h3>Programado</h3><span class="chip">${prox.length}</span></div>${tabla(prox,true,"No hay vacaciones ni descansos programados.")}</div>
  <div class="panel" style="padding:0"><div class="ph"><h3>Anteriores y cancelados</h3><span class="small muted">Últimos 90 días</span></div>${tabla(pas,false,"Sin registros anteriores.")}</div>`;
}
function openProgModal(tipo,num){
  const ppl=scopePeople().sort((a,b)=>a.nombre.localeCompare(b.nombre)),hoy=ymd(new Date()),vac=tipo==="vacaciones";
  const root=$("#modal-root");
  root.innerHTML=`<div class="modal-scrim"><div class="panel modal" role="dialog" aria-modal="true" aria-labelledby="pg-t" style="width:min(520px,100%)">
    <div class="ph"><h3 id="pg-t">${vac?"Asignar vacaciones":"Registrar descanso laborado"}</h3><button class="btn" id="pg-x">Cancelar</button></div>
    <form class="pb" id="f-pg" style="display:grid;gap:12px">
      <p class="small muted" style="margin:0">${vac?"Los días quedan marcados en el pase de lista y se avisa al administrador, al gerente y al supervisor a cargo.":"La persona trabaja su día de descanso. Asigna su descanso compensatorio para no pasar de 6 días seguidos (RBA)."}</p>
      <div class="field"><label for="pg-num">Persona</label><select id="pg-num" required>${ppl.map(e=>`<option value="${esc(e.num)}" ${e.num===num?"selected":""}>${esc(e.nombre)} · ${esc(e.supervisor||"")}</option>`).join("")}</select></div>
      ${vac?`<div class="grid2"><div class="field"><label for="pg-d">Desde</label><input type="date" id="pg-d" value="${hoy}" required></div><div class="field"><label for="pg-h">Hasta</label><input type="date" id="pg-h" value="${hoy}" required></div></div>`
        :`<div class="grid2"><div class="field"><label for="pg-d">Día de descanso que trabaja</label><input type="date" id="pg-d" value="${hoy}" required></div><div class="field"><label for="pg-c">Descanso compensatorio</label><input type="date" id="pg-c"></div></div>`}
      <div id="pg-info" class="small"></div>
      <div class="field"><label for="pg-n">Nota</label><textarea id="pg-n" placeholder="${vac?"Ej. vacaciones de fin de año":"Ej. inventario, arranque de línea"}"></textarea></div>
      <div id="pg-err" style="color:var(--bad);font-size:13px;min-height:1.2em"></div>
      <div class="row" style="justify-content:flex-end"><button class="btn primary" id="pg-ok">Guardar</button></div></form></div></div>`;
  const info=()=>{const n=$("#pg-num").value,d=$("#pg-d").value,el=$("#pg-info");if(!n||!d){el.innerHTML="";return}
    if(vac){const h=$("#pg-h").value;const dias=h&&h>=d?Math.round((new Date(h)-new Date(d))/864e5)+1:0;el.innerHTML=dias?`<span class="chip info">${dias} día${dias>1?"s":""} de vacaciones</span>`:'<span style="color:var(--bad)">La fecha final debe ser igual o posterior a la inicial.</span>';return}
    const prev=streakBefore(n,d),tot=prev+1,c=$("#pg-c").value;
    let h=`Con este día lleva <b>${tot}</b> día${tot>1?"s":""} seguido${tot>1?"s":""} trabajando (según el pase de lista). `;
    if(tot>=7)h+='<span class="chip bad">Excede el máximo RBA de 6 días</span> ';
    else if(tot===6)h+='<span class="chip warn">Llega al máximo RBA: debe descansar el día siguiente</span> ';
    if(!c)h+='<span class="chip bad">Sin descanso compensatorio</span>';
    else{const gap=Math.round((new Date(c)-new Date(d))/864e5);h+=gap<1?'<span style="color:var(--bad)">El descanso debe ser después del día trabajado.</span>':gap>6?'<span class="chip warn">El descanso queda a más de 6 días: riesgo RBA</span>':'<span class="chip ok">Descanso dentro de los 6 días</span>'}
    el.innerHTML=h};
  ["pg-num","pg-d","pg-h","pg-c"].forEach(id=>{const x=$("#"+id);if(x)x.addEventListener("change",info)});info();
  $("#pg-x").onclick=()=>root.innerHTML="";
  $("#f-pg").onsubmit=async ev=>{ev.preventDefault();const b=$("#pg-ok");b.disabled=true;
    const d=$("#pg-d").value,args={p_num:$("#pg-num").value,p_tipo:tipo,p_desde:d,p_hasta:vac?$("#pg-h").value:d,p_compensa:vac?null:($("#pg-c").value||null),p_nota:$("#pg-n").value.trim()};
    const {error}=await S.sb.rpc("programar_ausencia",args);
    if(error){$("#pg-err").textContent=error.message;b.disabled=false;return}
    root.innerHTML="";toast(vac?"Vacaciones asignadas · se envió aviso":"Descanso laborado registrado · se envió aviso");loadProg();loadAvisos();
    if(S.tab!=="vacaciones")location.hash="vacaciones"};
}
$("#v-vacaciones").addEventListener("click",async e=>{
  const n=e.target.closest("[data-pnew]");if(n){openProgModal(n.dataset.pnew,n.dataset.pnum);return}
  const c=e.target.closest("[data-pcan]");
  if(c){if(c.dataset.confirm!=="1"){c.dataset.confirm="1";c.textContent="¿Seguro?";return}
    const {error}=await S.sb.rpc("cancelar_programacion",{p_id:c.dataset.pcan});if(error){toast(error.message);return}toast("Cancelado");loadProg()}
});
/* back (suplente) del supervisor para pasar lista */
function renderBackupBox(){
  const el=$("#l-back");if(!el)return;const my=mySups(),bo=backupOf();
  if(!my.length&&!bo.length){el.innerHTML="";el.hidden=true;return}
  el.hidden=false;
  el.innerHTML=`<div class="panel" style="padding:10px 14px;display:grid;gap:8px">${my.map(n=>{const x=S.sups.find(y=>y.nombre===n)||{};return `<div class="row"><span class="small"><b>Back de ${esc(n)}</b> · pasa lista cuando no estés:</span><input type="email" id="bk-${esc(n).replace(/\W/g,"")}" data-bkin="${esc(n)}" value="${esc(x.backup_email||"")}" placeholder="correo@flex.com" aria-label="Correo del back" style="min-width:220px"><button class="btn" data-bk="${esc(n)}">Guardar</button>${x.backup_email?`<button class="btn danger" data-bkdel="${esc(n)}">Quitar</button>`:""}</div>`}).join("")}
    ${bo.length?`<div class="small"><span class="chip acc">Eres back de ${bo.map(esc).join(", ")}</span> Puedes pasar lista a su personal.</div>`:""}</div>`;
}
$("#v-lista").addEventListener("click",async e=>{
  const b=e.target.closest("[data-bk],[data-bkdel]");if(!b)return;
  const sup=b.dataset.bk||b.dataset.bkdel,inp=[...document.querySelectorAll("[data-bkin]")].find(x=>x.dataset.bkin===sup);
  const email=b.dataset.bkdel?"":(inp?inp.value.trim().toLowerCase():"");
  if(b.dataset.bk&&email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){toast("Escribe un correo válido");return}
  const {error}=await S.sb.rpc("asignar_backup",{p_sup:sup,p_email:email});if(error){toast(error.message);return}
  toast(email?"Back asignado: "+email:"Back quitado");await loadSups();renderLista();
});
/* avisos */
function openAvisos(){
  const root=$("#modal-root"),list=S.avisos;
  root.innerHTML=`<div class="modal-scrim"><div class="panel modal" role="dialog" aria-modal="true" aria-labelledby="av-t" style="width:min(560px,100%)">
    <div class="ph"><h3 id="av-t">Avisos</h3><div class="row">${list.some(a=>!a.leido)?'<button class="btn" id="av-all">Marcar todo como leído</button>':""}<button class="btn" id="av-x">Cerrar</button></div></div>
    <div style="max-height:70vh;overflow:auto">${list.length?list.map(a=>`<div style="padding:12px 16px;border-bottom:1px solid var(--line);${a.leido?"opacity:.65":""}">
      <div class="row" style="justify-content:space-between"><b style="font-weight:600">${a.leido?"":'<span style="color:var(--accent)">● </span>'}${esc(a.titulo)}</b><span class="chip ${a.tipo==="rba"||a.tipo==="equipo"?"bad":a.tipo==="vacaciones"?"info":"warn"}">${({rba:"RBA",vacaciones:"Vacaciones",equipo:"Equipo",descanso_laborado:"Descanso laborado",te:"Tiempo extra","5s":"5S"})[a.tipo]||a.tipo}</span></div>
      <div class="small" style="margin-top:4px">${esc(a.detalle)}</div><div class="small muted" style="margin-top:2px">${fmtTs(a.creado)}</div></div>`).join(""):'<div class="empty">No tienes avisos.</div>'}</div></div></div>`;
  $("#av-x").onclick=()=>root.innerHTML="";
  const all=$("#av-all");if(all)all.onclick=async()=>{const ids=S.avisos.filter(a=>!a.leido).map(a=>a.id);const {error}=await S.sb.from("avisos").update({leido:true}).in("id",ids);if(error){toast(errMsg(error));return}S.avisos.forEach(a=>a.leido=true);renderNav();openAvisos()};
}

/* ---------- Tiempo extra ---------- */
const turnoCorto=t=>String(t||"").replace(/\s*\(.*\)\s*$/,"")||t;
const teCfg=()=>Object.assign({rbaSemana:60,turnos:{}},cfg().te||{});
const teLim=t=>Object.assign({jornada:8,maxDia:3,maxSemana:9},(teCfg().turnos||{})[t]||{});
function semanaDe(f){const d=new Date(f+"T12:00:00");const lun=addDays(f,-((d.getDay()+6)%7));return{ini:lun,fin:addDays(lun,6)}}
const teRow=(num,f)=>S.te.find(r=>r.num===num&&r.fecha===f);
function teSem(num,f){const w=semanaDe(f);return S.te.filter(r=>r.num===num&&r.fecha>=w.ini&&r.fecha<=w.fin).reduce((a,r)=>a+Number(r.horas),0)}
function trabajo(num,f){const m=S.recent[num]||{};const s=m[f]||(f===S.date?S.att[num]:null);return s==="A"||s==="R"}
function diasSem(num,f){const w=semanaDe(f);let n=0;for(let d=w.ini;d<=w.fin;d=addDays(d,1))if(trabajo(num,d))n++;return n}
function teInfo(e,f){const L=teLim(e.turno),rba=Number(teCfg().rbaSemana)||60;const hoy=Number((teRow(e.num,f)||{}).horas||0),sem=teSem(e.num,f);
  const dias=diasSem(e.num,f)+(trabajo(e.num,f)?0:1);const total=dias*L.jornada+sem;
  const disp=Math.max(0,Math.min(L.maxDia-hoy,L.maxSemana-sem,rba-total));
  return{L,rba,hoy,sem,dias,total,disp:Math.round(disp*2)/2}}
function sugeridosTE(fil,f){
  return active().filter(e=>e.turno&&fil(e)&&trabajo(e.num,f)&&!progOn(e.num,f).vac&&streakAt(e.num,f)<6)
    .map(e=>Object.assign({e},teInfo(e,f))).filter(x=>x.disp>0).sort((a,b)=>a.sem-b.sem||b.disp-a.disp);
}
const canTE=e=>canMarkFor(e)||S.perms.has("gestionar_movimientos");
async function loadTE(){const {data,error}=await S.sb.from("tiempo_extra").select("*").gte("fecha",addDays(ymd(new Date()),-63)).order("fecha");S.te=error?[]:(data||[]);S.teLoaded=true;renderActive()}
function renderTE(){
  const root=$("#te-root");if(!S.teLoaded){root.innerHTML='<div class="panel empty">Cargando…</div>';return}
  if(!S.teFecha)S.teFecha=S.date;
  const f=S.teFecha,w=semanaDe(f),T=turnosUsed(),tc=teCfg(),ed=S.canCatalog;
  const ft=S.teTurno||"",fs=S.teSup||"";
  const base=active().filter(e=>e.turno&&(verTodos()||myTeams().includes(e.supervisor))&&(!ft||e.turno===ft)&&(!fs||e.supervisor===fs));
  const dias=[];for(let d=w.ini;d<=w.fin;d=addDays(d,1))dias.push(d);
  const sg=sugeridosTE(e=>base.includes(e),f).slice(0,15);
  const rows=base.map(e=>Object.assign({e},teInfo(e,f))).sort((a,b)=>b.sem-a.sem||a.e.nombre.localeCompare(b.e.nombre));
  const totTE=rows.reduce((a,x)=>a+x.sem,0),cerca=rows.filter(x=>x.sem>=x.L.maxSemana*0.8||x.total>=x.rba*0.9);
  root.innerHTML=`
  <div class="filters">
    <div class="fld"><label for="te-f">Fecha</label><input type="date" id="te-f" value="${f}"></div>
    <div class="fld"><label for="te-t">Turno</label><select id="te-t"><option value="">Todos</option>${T.map(t=>`<option ${ft===t?"selected":""}>${esc(t)}</option>`).join("")}</select></div>
    <div class="fld"><label for="te-s">Supervisor</label><select id="te-s"><option value="">Todos</option>${(verTodos()?supsUsed():myTeams()).map(x=>`<option ${fs===x?"selected":""}>${esc(x)}</option>`).join("")}</select></div>
    <span style="flex:1"></span>${base.some(canTE)?'<button class="btn primary" data-tenew>Registrar tiempo extra</button>':""}</div>
  <div class="kpis">
    <div class="panel kpi"><div class="lbl">Tiempo extra en la semana</div><div class="val">${fmtH(totTE)} h</div><div class="hint">${fmtD(w.ini)} – ${fmtD(w.fin)} · ${rows.filter(x=>x.sem>0).length} personas</div></div>
    <div class="panel kpi"><div class="lbl">Cerca del límite</div><div class="val" style="${cerca.length?"color:var(--warn)":""}">${cerca.length}</div><div class="hint">≥80% del máximo de T.E. o ≥90% del tope RBA</div></div>
    <div class="panel kpi"><div class="lbl">Disponibles hoy para T.E.</div><div class="val">${sugeridosTE(e=>base.includes(e),f).length}</div><div class="hint">Asistieron, sin vacaciones ni riesgo RBA</div></div>
    <div class="panel kpi"><div class="lbl">Tope RBA</div><div class="val">${tc.rbaSemana} h</div><div class="hint">por semana: jornada + tiempo extra</div></div>
  </div>
  <div class="panel" style="padding:0"><div class="ph"><h3>Recurso a considerar para T.E.</h3><span class="small muted">${fmtD(f)} · asistieron, sin vacaciones, menos de 6 días seguidos y con horas disponibles. Primero quien lleva menos T.E.</span></div><div class="scroll"><table><thead><tr><th>Persona</th><th>Turno</th><th>Posición</th><th class="num">T.E. semana</th><th class="num">Horas semana</th><th class="num">Disponible hoy</th><th></th></tr></thead><tbody>${
    sg.length?sg.map(x=>`<tr><td>${esc(x.e.nombre)}<div class="small muted">${esc(x.e.supervisor||"")}</div></td><td class="small">${esc(turnoCorto(x.e.turno))}</td><td class="small">${esc(x.e.posicion||"")}</td><td class="num">${fmtH(x.sem)} / ${x.L.maxSemana}</td><td class="num">${fmtH(x.total)} / ${x.rba}</td><td class="num"><b style="color:var(--ok)">${fmtH(x.disp)} h</b></td><td>${canTE(x.e)?`<button class="btn" data-tenew="${esc(x.e.num)}">Asignar</button>`:""}</td></tr>`).join("")
    :`<tr><td colspan="7" class="empty">Nadie disponible con los filtros elegidos: falta pasar lista o todos están en su límite.</td></tr>`}</tbody></table></div></div>
  <div class="panel" style="padding:0"><div class="ph"><h3>Registro de la semana</h3><span class="small muted">Horas extra por día · clic en una persona para registrar</span></div><div class="scroll"><table><thead><tr><th>Persona</th>${dias.map(d=>`<th class="num">${esc(new Date(d+"T12:00:00").toLocaleDateString("es-MX",{weekday:"short",day:"numeric"}))}</th>`).join("")}<th class="num">Total T.E.</th><th class="num">Horas semana</th><th>Estado</th></tr></thead><tbody>${
    rows.length?rows.map(x=>{const st=x.sem>x.L.maxSemana||x.total>x.rba?["Excede","bad"]:x.sem>=x.L.maxSemana||x.total>=x.rba?["Al límite","bad"]:x.sem>=x.L.maxSemana*0.8||x.total>=x.rba*0.9?["Cerca del límite","warn"]:x.sem>0?["OK","ok"]:["Sin T.E.",""];
      return `<tr class="${canTE(x.e)?"click":""}" data-teper="${esc(x.e.num)}"><td>${esc(x.e.nombre)}<div class="small muted">${esc(turnoCorto(x.e.turno))} · ${esc(x.e.posicion||"")}</div></td>${dias.map(d=>{const r=teRow(x.e.num,d);return `<td class="num">${r?`<b>${fmtH(r.horas)}</b>`:'<span class="muted">·</span>'}</td>`}).join("")}
      <td class="num"><b>${fmtH(x.sem)}</b> / ${x.L.maxSemana}</td><td class="num">${fmtH(x.total)} / ${x.rba}</td><td><span class="chip ${st[1]}">${st[0]}</span></td></tr>`}).join("")
    :`<tr><td colspan="${dias.length+4}" class="empty">Sin personal con estos filtros.</td></tr>`}</tbody></table></div>
    <div class="pb small muted">Horas semana = días trabajados (asistencia o retardo) × jornada del turno + tiempo extra. Para hoy, si aún no tiene asistencia, se cuenta como día trabajado.</div></div>
  <div class="panel" style="padding:0"><div class="ph"><h3>Límites de tiempo extra por turno</h3><span class="small muted">${ed?"Los aplica la base de datos al registrar":"Solo el administrador los cambia"}</span></div><div class="scroll"><table><thead><tr><th>Turno</th><th class="num">Jornada (h/día)</th><th class="num">Máx. T.E. por día</th><th class="num">Máx. T.E. por semana</th></tr></thead><tbody>${
    T.map(t=>{const L=teLim(t);return `<tr><td><b>${esc(t)}</b></td>${["jornada","maxDia","maxSemana"].map(k=>`<td class="num">${ed?`<input type="number" min="0" max="24" step="0.5" data-tel="${esc(t)}|${k}" value="${L[k]}" style="width:80px;text-align:right" aria-label="${k} ${esc(t)}">`:L[k]}</td>`).join("")}</tr>`}).join("")}
    <tr><td><b>Tope RBA semanal</b> <span class="small muted">(jornada + T.E.)</span></td><td colspan="3" class="num">${ed?`<input type="number" min="1" max="84" step="1" id="te-rba" value="${tc.rbaSemana}" style="width:80px;text-align:right" aria-label="Tope RBA"> h`:tc.rbaSemana+" h"}</td></tr></tbody></table></div>
    <div class="pb small muted">Valores iniciales según la Ley Federal del Trabajo: hasta 3 h diarias y 9 h semanales de tiempo extra. El tope de 60 h por semana es el del código RBA.</div></div>`;
}
const fmtH=n=>{n=Number(n)||0;return Number.isInteger(n)?String(n):n.toFixed(1)};
function openTEModal(num){
  const ppl=active().filter(e=>e.turno&&canTE(e)&&(verTodos()||myTeams().includes(e.supervisor))).sort((a,b)=>a.nombre.localeCompare(b.nombre));
  const root=$("#modal-root");
  root.innerHTML=`<div class="modal-scrim"><div class="panel modal" role="dialog" aria-modal="true" aria-labelledby="te-mt" style="width:min(500px,100%)">
    <div class="ph"><h3 id="te-mt">Registrar tiempo extra</h3><button class="btn" id="te-x">Cancelar</button></div>
    <form class="pb" id="f-te" style="display:grid;gap:12px">
      <div class="field"><label for="te-num">Persona</label><select id="te-num">${ppl.map(e=>`<option value="${esc(e.num)}" ${e.num===num?"selected":""}>${esc(e.nombre)} · ${esc(turnoCorto(e.turno))}</option>`).join("")}</select></div>
      <div class="grid2"><div class="field"><label for="te-fe">Fecha</label><input type="date" id="te-fe" value="${S.teFecha||S.date}"></div><div class="field"><label for="te-h">Horas extra</label><input type="number" id="te-h" min="0.5" step="0.5" value="1"></div></div>
      <div class="field"><label for="te-m">Motivo</label><input type="text" id="te-m" placeholder="Ej. cubrir ausencia en Materialista T2, inventario"></div>
      <div id="te-info" class="small"></div>
      <div id="te-err" style="color:var(--bad);font-size:13px;min-height:1.2em"></div>
      <div class="row" style="justify-content:space-between"><button type="button" class="btn danger" id="te-del" hidden>Quitar registro de ese día</button><button class="btn primary" id="te-ok">Guardar</button></div></form></div></div>`;
  const info=()=>{const e=S.emps.get($("#te-num").value),f=$("#te-fe").value;if(!e||!f){$("#te-info").innerHTML="";return}
    const r=teRow(e.num,f),I=teInfo(e,f),h=Number($("#te-h").value)||0;
    if(r&&document.activeElement!==$("#te-h"))$("#te-h").value=r.horas;
    const nh=Number($("#te-h").value)||0,semN=I.sem-I.hoy+nh,totN=I.total-I.hoy+nh;
    $("#te-del").hidden=!r;$("#te-h").max=I.L.maxDia;
    $("#te-info").innerHTML=`${r?`<div>Ya tiene <b>${fmtH(r.horas)} h</b> ese día; al guardar se reemplaza.</div>`:""}
      <div>Semana: <b>${fmtH(semN)}</b> de ${I.L.maxSemana} h de T.E. · <b>${fmtH(totN)}</b> de ${I.rba} h totales (RBA) · máximo ${I.L.maxDia} h por día.</div>
      ${nh>I.L.maxDia?'<span class="chip bad">Excede el máximo diario</span> ':""}${semN>I.L.maxSemana?'<span class="chip bad">Excede el máximo semanal</span> ':""}${totN>I.rba?'<span class="chip bad">Excede el tope RBA</span> ':""}${streakAt(e.num,f)>=6?'<span class="chip bad">Lleva 6+ días seguidos: debe descansar</span> ':""}${progOn(e.num,f).vac?'<span class="chip warn">Tiene vacaciones ese día</span>':""}`};
  ["te-num","te-fe","te-h"].forEach(id=>$("#"+id).addEventListener("input",info));info();
  $("#te-x").onclick=()=>root.innerHTML="";
  $("#te-del").onclick=async()=>{const r=teRow($("#te-num").value,$("#te-fe").value);if(!r)return;const {error}=await S.sb.from("tiempo_extra").delete().eq("id",r.id);if(error){$("#te-err").textContent=errMsg(error);return}root.innerHTML="";toast("Registro quitado");loadTE()};
  $("#f-te").onsubmit=async ev=>{ev.preventDefault();const b=$("#te-ok");b.disabled=true;const e=S.emps.get($("#te-num").value);
    const row={num:e.num,fecha:$("#te-fe").value,horas:Number($("#te-h").value),turno:e.turno,motivo:$("#te-m").value.trim(),registro_email:myEmail()};
    const {error}=await S.sb.from("tiempo_extra").upsert(row,{onConflict:"num,fecha"});
    if(error){$("#te-err").textContent=error.message;b.disabled=false;return}
    root.innerHTML="";toast("Tiempo extra registrado");loadTE()};
}
$("#v-te").addEventListener("click",e=>{
  const n=e.target.closest("[data-tenew]");if(n){openTEModal(n.dataset.tenew);return}
  const r=e.target.closest("[data-teper]");if(r&&r.classList.contains("click")){openTEModal(r.dataset.teper)}
});
$("#v-te").addEventListener("change",e=>{
  const t=e.target;
  if(t.id==="te-f"){if(t.value)S.teFecha=t.value;renderTE()}else if(t.id==="te-t"){S.teTurno=t.value;renderTE()}else if(t.id==="te-s"){S.teSup=t.value;renderTE()}
  else if(t.dataset.tel){const [tu,k]=t.dataset.tel.split("|");const v=Math.max(0,Number(t.value)||0);const tc=teCfg();const tur=Object.assign({},tc.turnos||{});tur[tu]=Object.assign(teLim(tu),{[k]:v});cfgUpdate({te:{rbaSemana:tc.rbaSemana,turnos:tur}});toast("Límite actualizado")}
  else if(t.id==="te-rba"){const tc=teCfg();cfgUpdate({te:{rbaSemana:Math.max(1,Number(t.value)||60),turnos:tc.turnos||{}}});toast("Tope RBA actualizado")}
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
    <div class="pb"><div class="row"><input type="text" id="role-new" placeholder="Nuevo rol (ej. lider, planeador)" aria-label="Nuevo rol" style="flex:1 1 200px"><button class="btn" data-radd>Agregar rol</button></div>
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
  else if(S.tab==="usuarios")renderUsuarios();else if(S.tab==="movimientos")renderMovimientos();else if(S.tab==="vacaciones")renderVacaciones();else if(S.tab==="te")renderTE();else if(S.tab==="equipos"){if(window.CPE)window.CPE.render($("#eq-root"))}else if(S.tab==="s5"){if(window.CP5)window.CP5.render($("#s5-root"))}else renderCatalogos();
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
  let lastG="";
  $("#tabs").innerHTML=(S.tabs||[]).map(t=>{const g=NAV_G[t]||"";const hd=g!==lastG?`<div class="nav-g">${esc(g)}</div>`:"";lastG=g;return hd+`<button data-tab="${t}" aria-current="${S.tab===t?"page":"false"}" title="${esc(TABS[t].label)}" aria-label="${esc(TABS[t].label)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TABS[t].icon}</svg><span class="t">${esc(TABS[t].nav||TABS[t].label)}</span>${t==="usuarios"&&pend?`<span class="tab-n" title="${pend} cuenta(s) sin acceso">${pend}</span>`:""}${t==="movimientos"&&pendingToApprove()?`<span class="tab-n" title="Por aprobar">${pendingToApprove()}</span>`:""}</button>`}).join("");
  $("#who").innerHTML=`<span class="nm" title="${esc(S.session?S.session.user.email:"")}">${esc(S.session?S.session.user.email:"")}</span><span class="role">${esc(ROLE_LABEL(S.rol))}</span>
    <div class="acts"><button id="avisos" title="Avisos" aria-label="Avisos${S.avisos.filter(a=>!a.leido).length?": "+S.avisos.filter(a=>!a.leido).length+" sin leer":""}" style="position:relative"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 003.4 0"/></svg><span class="t">Avisos</span>${S.avisos.filter(a=>!a.leido).length?`<span class="tab-n" style="margin-left:4px">${S.avisos.filter(a=>!a.leido).length}</span>`:""}</button>
    <button id="chpass" title="Cambiar contraseña" aria-label="Cambiar contraseña"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/></svg><span class="t">Contraseña</span></button>
    <button id="theme" title="Cambiar tema" aria-label="Cambiar a tema ${curTheme()==="dark"?"claro":"oscuro"}">${curTheme()==="dark"?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg><span class="t">Claro</span>':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/></svg><span class="t">Oscuro</span>'}</button>
    <button id="logout" title="Salir" aria-label="Salir"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/></svg><span class="t">Salir</span></button></div>`;
}
document.addEventListener("click",e=>{
  const t=e.target.closest("#tabs [data-tab]");if(t){if(location.hash.slice(1)===t.dataset.tab)setTab(t.dataset.tab);else location.hash=t.dataset.tab;return}
  if(e.target.closest("#logout"))S.sb.auth.signOut();
  if(e.target.closest("#chpass"))openChangePassword();
  if(e.target.closest("#avisos"))openAvisos();
  if(e.target.closest("#theme")){setTheme(curTheme()==="dark"?"light":"dark");renderNav()}
});
const curTheme=()=>document.documentElement.getAttribute("data-theme")==="dark"?"dark":"light";
function setTheme(t){document.documentElement.setAttribute("data-theme",t);try{localStorage.setItem("cp_tema",t)}catch(e){}}
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
$("#cov-scope").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;S.covScope=b.dataset.v;S.sel=null;renderCobertura()});
$("#cov-sitio").addEventListener("change",()=>{S.sel=null;renderCobertura()});
$("#cov-sup").addEventListener("change",()=>{S.sel=null;renderCobertura()});
$("#cov-edit").addEventListener("click",()=>{S.editReq=!S.editReq;$("#cov-edit").textContent=S.editReq?"Listo":"Editar requeridos";$("#cov-edit").classList.toggle("primary",S.editReq);renderCobertura()});
$("#cov-matrix").addEventListener("click",e=>{const b=e.target.closest("[data-cell]");if(!b)return;S.sel=S.sel===b.dataset.cell?null:b.dataset.cell;renderCobertura();if(S.sel)$("#cov-detail").scrollIntoView({block:"nearest",behavior:"smooth"})});
$("#cov-matrix").addEventListener("change",e=>{const i=e.target.closest("[data-req]");if(!i)return;
  const v=i.value===""?null:Math.max(0,parseInt(i.value,10)||0);cfgUpdate({req:{[S.dim]:{[i.dataset.req]:v}}})});
["#l-turno","#l-pos","#l-area","#l-sitio","#l-sup"].forEach(s=>$(s).addEventListener("change",renderLista));
$("#l-q").addEventListener("input",renderLista);
$("#l-list").addEventListener("click",e=>{const b=e.target.closest("[data-mark]");if(b&&canMarkFor(S.emps.get(b.dataset.emp)||{}))mark(b.dataset.emp,b.dataset.mark)});
$("#l-all").addEventListener("click",markAll);
$("#p-q").addEventListener("input",renderPersonal);
["#p-turno","#p-pos","#p-area","#p-sitio","#p-ger","#p-sup","#p-cargo","#p-bajas"].forEach(s=>$(s).addEventListener("change",renderPersonal));
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
    const arr=cfg()[k]||[];if(arr.includes(v)){toast("Ya existe");return}
    const p={[k]:arr.concat([v])};const ns=$("#cat-new-sitio");if(k==="areas"&&ns&&ns.value)p.areaSitio={[v]:ns.value};cfgUpdate(p);return}
  if(e.target.id==="sup-add"){addSup();return}
  const rn=e.target.closest("[data-ren]");if(rn){const i=rn.dataset.ren.indexOf("|");S.editing=rn.dataset.ren;renderCatalogos();const inp=$("#ren-in");if(inp){inp.focus();inp.select()}return}
  if(e.target.closest("[data-rencancel]")){S.editing=null;renderCatalogos();return}
  const rs=e.target.closest("[data-rensave]");if(rs){const i=rs.dataset.rensave.indexOf("|");renameCatalog(rs.dataset.rensave.slice(0,i),rs.dataset.rensave.slice(i+1),$("#ren-in").value);return}
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
CV.addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.id==="cat-new"){const b=CV.querySelector("[data-add]");if(b)b.click()}
  if(e.target.id==="ren-in"){if(e.key==="Enter"){const b=CV.querySelector("[data-rensave]");if(b)b.click()}if(e.key==="Escape"){S.editing=null;renderCatalogos()}}});
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
  const as=e.target.closest("[data-asitio]");if(as){cfgUpdate({areaSitio:{[as.dataset.asitio]:as.value||null}});toast("Edificio actualizado");return}
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
  S.loaded=true;await loadSups();applyPerms();refreshSelects();loadMovs();loadRecent().then(renderActive);loadProg();loadAvisos();loadTE();
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
  S.perms=new Set(S.isAdmin?PRIVS.filter(p=>!p.k.startsWith("tab:")).map(p=>p.k):((r&&r.permisos)||[]).filter(x=>!x.startsWith("tab:")));
  S.tabs=tabsOfRole(S.rol,r&&r.permisos);
  if(S.rol!=="sin_acceso"&&S.tabs.length&&backupOf().length)["lista","vacaciones"].forEach(t=>{if(!S.tabs.includes(t))S.tabs.splice(TAB_ORDER.indexOf(t),0,t)});
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
      if(p.eventType==="DELETE"){ if(!p.old.fecha||p.old.fecha===S.date)delete S.att[p.old.num]; if(p.old.fecha)addRecent(p.old.num,p.old.fecha,null) }
      else{ addRecent(r.num,r.fecha,r.estado); if(r.fecha===S.date)S.att[r.num]=r.estado }
      if(window.CPR)window.CPR.invalidate();
      renderActive();
    })
    .on("postgres_changes",{event:"*",schema:"public",table:"empleados"},p=>{
      if(p.eventType==="DELETE")S.emps.delete(p.old.num);else S.emps.set(p.new.num,p.new);refreshSelects();renderActive();
    })
    .on("postgres_changes",{event:"*",schema:"public",table:"roles"},()=>{loadRoles().then(renderActive)})
    .on("postgres_changes",{event:"*",schema:"public",table:"movimientos"},()=>{loadMovs()})
    .on("postgres_changes",{event:"*",schema:"public",table:"programacion"},()=>{loadProg()})
    .on("postgres_changes",{event:"*",schema:"public",table:"tiempo_extra"},()=>{loadTE()})
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"avisos"},p=>{loadAvisos();if(p.new&&p.new.titulo)toast("Aviso: "+p.new.titulo)})
    .on("postgres_changes",{event:"*",schema:"public",table:"supervisores"},()=>{loadSups().then(()=>{applyPerms();renderActive()})})
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
