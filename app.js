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
const VIEWS=["cobertura","lista","personal","certificaciones","ajustes"];

const S={sb:null,session:null,rol:"lector",canMark:false,canAdmin:false,emps:new Map(),cfg:null,att:{},date:ymd(new Date()),
  tab:"cobertura",dim:"posicion",editReq:false,sel:null,loaded:false,channel:null,users:[]};
try{const d=localStorage.getItem("cp_dim");if(d)S.dim=d;}catch(e){}

const DEFAULT_CFG={areas:[],posiciones:[],turnos:["1 Gdl","2 Gdl","3 Gdl"],certs:[],certReq:{},req:{area:{},posicion:{}}};
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
function fillSelect(el,items,allLabel){
  const cur=el.value;
  el.innerHTML=(allLabel?`<option value="">${esc(allLabel)}</option>`:"")+items.map(i=>`<option value="${esc(i)}">${esc(i)}</option>`).join("");
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
}

/* ---------- coverage ---------- */
function coverage(){
  const C=cfg(),dim=S.dim,T=turnosUsed(),on=S.date;
  const keys=dim==="area"?C.areas.slice():C.posiciones.slice();
  const cells={};
  const get=(k,t)=>{const id=k+"__"+t;return cells[id]||(cells[id]={k,t,plant:[],pres:[],aus:[],pend:[],sinCert:[]})};
  active().forEach(e=>{
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
  const all=active().filter(e=>!ft||e.turno===ft);
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
  const t=$("#l-turno").value,p=$("#l-pos").value,a=$("#l-area").value,q=$("#l-q").value.trim().toLowerCase();
  return active().filter(e=>e.turno===t&&(!p||e.posicion===p)&&(!a||e.area===a)&&(!q||e.nombre.toLowerCase().includes(q)||String(e.num).includes(q)))
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
  $("#p-new").hidden=!S.canAdmin;
  const q=$("#p-q").value.trim().toLowerCase(),t=$("#p-turno").value,p=$("#p-pos").value,a=$("#p-area").value,b=$("#p-bajas").checked;
  const ppl=[...S.emps.values()].filter(e=>(b||e.activo!==false)&&(!t||e.turno===t)&&(!p||e.posicion===p)&&(!a||e.area===a)&&
    (!q||e.nombre.toLowerCase().includes(q)||String(e.num).includes(q)||(e.celular||"").includes(q))).sort((x,y)=>x.nombre.localeCompare(y.nombre));
  if(!ppl.length){$("#p-table").innerHTML=`<div class="empty">${S.loaded?"Sin resultados.":"Cargando personal…"}</div>`;return}
  const soon=addDays(S.date,30);
  $("#p-table").innerHTML=`<table><thead><tr><th>Nombre</th><th>Turno</th><th>Posición</th><th>Área</th><th>Celular</th><th>Certificaciones</th><th>Hoy</th></tr></thead><tbody>${
    ppl.map(e=>{const s=markOf(e);const miss=missingCerts(e,S.date);
      const certs=(e.certs||[]).map(c=>{const st=!certValid(c,S.date)?"bad":(c.vence&&c.vence<=soon?"warn":"ok");return `<span class="chip ${st}" title="${c.vence?"Vence "+fmtD(c.vence):"Sin vencimiento"}">${esc(c.nombre)}</span>`}).join(" ");
      return `<tr class="click" data-emp="${esc(e.num)}"><td><b style="font-weight:600">${esc(e.nombre)}</b>${e.activo===false?' <span class="chip">Baja</span>':""}<div class="mono muted">${esc(e.num)} · ${esc(e.puesto||"")}</div></td>
      <td>${esc(e.turno||"—")}</td><td>${esc(e.posicion||"—")}</td><td>${e.area?esc(e.area):'<span class="muted">Sin asignar</span>'}</td>
      <td class="tel">${e.celular?esc(e.celular):'<span class="muted" style="font-family:var(--f-body)">Falta</span>'}</td>
      <td>${certs||'<span class="muted">—</span>'}${miss.length?` <span class="chip warn">falta ${esc(miss.join(", "))}</span>`:""}</td>
      <td>${s?`<span class="chip ${PRESENT.has(s)?"ok":"bad"}">${ST[s]}</span>`:'<span class="muted">—</span>'}</td></tr>`}).join("")
  }</tbody></table>`;
}

/* ---------- drawer ---------- */
let D=null;
function openEmp(num){
  const e=num?S.emps.get(num):null;
  if(!e&&!S.canAdmin)return;
  D={isNew:!e,data:JSON.parse(JSON.stringify(e||{num:"",nombre:"",email:"",turno:$("#l-turno").value||cfg().turnos[0]||"",posicion:"",puesto:"",area:"",supervisor:"",celular:"",certs:[],activo:true,notas:""}))};
  renderDrawer();if(e)loadHistory(e);
}
function closeDrawer(){D=null;$("#drawer-root").innerHTML=""}
function opt(items,val,blank){const list=items.slice();if(val&&!list.includes(val))list.push(val);return (blank?`<option value="">${blank}</option>`:"")+list.map(i=>`<option ${i===val?"selected":""} value="${esc(i)}">${esc(i)}</option>`).join("")}
function renderDrawer(){
  const d=D.data,C=cfg(),ro=!S.canAdmin,dis=ro?"disabled":"";
  $("#drawer-root").innerHTML=`<div class="scrim" data-close></div><aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="dr-title">
  <header><h2 id="dr-title">${D.isNew?"Nueva persona":esc(d.nombre)}</h2><button class="btn" data-close aria-label="Cerrar">Cerrar</button></header>
  <div class="body">
    ${ro?'<div class="banner">Solo el administrador puede editar fichas.</div>':""}
    <div class="grid2">
      <div class="field"><label for="f-num">No. empleado</label><input id="f-num" type="text" value="${esc(d.num)}" ${D.isNew?"":"readonly"}></div>
      <div class="field"><label for="f-nombre">Nombre</label><input id="f-nombre" type="text" value="${esc(d.nombre)}" ${dis}></div>
      <div class="field"><label for="f-cel">Teléfono celular</label><input id="f-cel" type="tel" inputmode="tel" placeholder="33 1234 5678" value="${esc(d.celular)}" ${dis}></div>
      <div class="field"><label for="f-email">Correo</label><input id="f-email" type="email" value="${esc(d.email)}" ${dis}></div>
      <div class="field"><label for="f-turno">Turno</label><select id="f-turno" ${dis}>${opt(turnosUsed(),d.turno)}</select></div>
      <div class="field"><label for="f-pos">Posición</label><select id="f-pos" ${dis}>${opt(C.posiciones,d.posicion,"Sin posición")}</select></div>
      <div class="field"><label for="f-area">Área</label><select id="f-area" ${dis}>${opt(C.areas,d.area,"Sin asignar")}</select></div>
      <div class="field"><label for="f-puesto">Puesto (HR)</label><input id="f-puesto" type="text" value="${esc(d.puesto)}" ${dis}></div>
      <div class="field"><label for="f-sup">Supervisor</label><input id="f-sup" type="text" value="${esc(d.supervisor)}" ${dis}></div>
      <div class="field"><label for="f-activo">Estatus</label><select id="f-activo" ${dis}><option value="1" ${d.activo!==false?"selected":""}>Activo</option><option value="0" ${d.activo===false?"selected":""}>Baja</option></select></div>
    </div>
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
  d.supervisor=$("#f-sup").value.trim();d.activo=$("#f-activo").value==="1";d.notas=$("#f-notas").value;
  document.querySelectorAll("#f-certs .certrow").forEach(r=>{const c=d.certs[+r.dataset.ci];r.querySelectorAll("[data-cf]").forEach(i=>c[i.dataset.cf]=i.value)});
}
const EMP_COLS=["num","nombre","email","turno","posicion","area","puesto","supervisor","antiguedad","ingreso","tipo","clasif","celular","certs","activo","notas"];
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

/* ---------- certifications ---------- */
function renderCerts(){
  const C=cfg(),on=S.date,soon30=addDays(on,30),soon60=addDays(on,60),A=active(),dis=S.canAdmin?"":"disabled";
  $("#c-add").disabled=!S.canAdmin;$("#c-new").disabled=!S.canAdmin;
  $("#c-cat").innerHTML=C.certs.length?`<table><thead><tr><th>Certificación</th><th class="num">Vig.</th><th class="num">Por vencer</th><th class="num">Vencidas</th><th></th></tr></thead><tbody>${
    C.certs.map(n=>{let v=0,p=0,x=0;A.forEach(e=>(e.certs||[]).forEach(c=>{if(c.nombre!==n)return;if(!certValid(c,on))x++;else if(c.vence&&c.vence<=soon30)p++;else v++}));
      return `<tr><td>${esc(n)}</td><td class="num">${v}</td><td class="num" style="color:${p?"var(--warn)":"inherit"}">${p}</td><td class="num" style="color:${x?"var(--bad)":"inherit"}">${x}</td><td><button class="btn danger" data-certdel="${esc(n)}" ${dis}>Quitar</button></td></tr>`}).join("")}</tbody></table>`:`<div class="empty">Sin certificaciones en el catálogo.</div>`;
  const req=C.certReq||{};
  $("#c-req").innerHTML=C.posiciones.map(p=>`<div style="padding:8px 0;border-bottom:1px solid var(--line)"><b>${esc(p)}</b><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:4px">${
    C.certs.map(n=>`<label style="display:flex;gap:5px;align-items:center;font-size:13.5px"><input type="checkbox" data-creq="${esc(p)}" value="${esc(n)}" ${(req[p]||[]).includes(n)?"checked":""} ${dis}> ${esc(n)}</label>`).join("")}</div></div>`).join("");
  const exp=[];A.forEach(e=>(e.certs||[]).forEach(c=>{if(c.vence&&c.vence<=soon60)exp.push({e,c})}));
  exp.sort((a,b)=>a.c.vence.localeCompare(b.c.vence));
  $("#c-exp").innerHTML=exp.length?`<table><thead><tr><th>Persona</th><th>Certificación</th><th>Vence</th><th>Turno</th><th>Celular</th></tr></thead><tbody>${exp.map(({e,c})=>`<tr class="click" data-emp="${esc(e.num)}"><td>${esc(e.nombre)}</td><td>${esc(c.nombre)}${c.folio?` <span class="mono muted">${esc(c.folio)}</span>`:""}</td><td><span class="chip ${c.vence<on?"bad":"warn"}">${c.vence<on?"Vencida ":""}${fmtD(c.vence)}</span></td><td>${esc(e.turno)}</td><td class="tel">${esc(e.celular||"—")}</td></tr>`).join("")}</tbody></table>`:`<div class="empty">Nada vence en los próximos 60 días.</div>`;
  const miss=A.map(e=>({e,m:missingCerts(e,on)})).filter(x=>x.m.length);
  $("#c-miss").innerHTML=miss.length?`<table><thead><tr><th>Persona</th><th>Posición</th><th>Le falta</th><th>Turno</th></tr></thead><tbody>${miss.map(({e,m})=>`<tr class="click" data-emp="${esc(e.num)}"><td>${esc(e.nombre)}</td><td>${esc(e.posicion)}</td><td>${m.map(n=>`<span class="chip warn">${esc(n)}</span>`).join(" ")}</td><td>${esc(e.turno)}</td></tr>`).join("")}</tbody></table>`:`<div class="empty">Todos tienen las certificaciones que pide su posición.</div>`;
}

/* ---------- ajustes ---------- */
function renderAjustes(){
  const C=cfg(),dis=S.canAdmin?"":"disabled";
  const li=(k,arr)=>arr.map(n=>`<span class="chip">${esc(n)}<button data-ldel="${k}" data-v="${esc(n)}" aria-label="Quitar ${esc(n)}" ${dis}>×</button></span>`).join("")||'<span class="muted">Vacío</span>';
  $("#a-areas").innerHTML=li("areas",C.areas);$("#a-pos").innerHTML=li("posiciones",C.posiciones);$("#a-turnos").innerHTML=li("turnos",C.turnos);
  document.querySelectorAll("#v-ajustes [data-add], #v-ajustes input[type=text]").forEach(x=>x.disabled=!S.canAdmin);
  $("#a-users-panel").hidden=!S.canAdmin;
  if(S.canAdmin){
    $("#a-users").innerHTML=S.users.length?`<table><thead><tr><th>Correo</th><th>Rol</th></tr></thead><tbody>${S.users.map(u=>`<tr><td>${esc(u.email)}${u.id===S.session.user.id?' <span class="chip">tú</span>':""}</td><td><select data-urol="${esc(u.id)}" aria-label="Rol de ${esc(u.email)}" ${u.id===S.session.user.id?"disabled":""}>${["admin","supervisor","lector"].map(r=>`<option ${u.rol===r?"selected":""}>${r}</option>`).join("")}</select></td></tr>`).join("")}</tbody></table>`:`<div class="empty">Cargando usuarios…</div>`;
  }
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
  if(S.tab==="cobertura")renderCobertura();else if(S.tab==="lista")renderLista();else if(S.tab==="personal")renderPersonal();else if(S.tab==="certificaciones")renderCerts();else renderAjustes();
}
function setTab(t){
  if(!VIEWS.includes(t))t="cobertura";
  S.tab=t;
  document.querySelectorAll("section.view").forEach(s=>s.hidden=!S.session||s.id!=="v-"+t);
  document.querySelectorAll("nav.tabs a").forEach(a=>a.setAttribute("aria-current",a.dataset.tab===t?"page":"false"));
  renderActive();
}
function renderBanner(msg){
  let h=msg||"";
  if(!h&&S.session&&S.rol==="lector")h=`<div class="banner">Tu usuario es de solo consulta. Pide al administrador el rol de supervisor para pasar lista.</div>`;
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
$("#cov-edit").addEventListener("click",()=>{S.editReq=!S.editReq;$("#cov-edit").textContent=S.editReq?"Listo":"Editar requeridos";$("#cov-edit").classList.toggle("primary",S.editReq);renderCobertura()});
$("#cov-matrix").addEventListener("click",e=>{const b=e.target.closest("[data-cell]");if(!b)return;S.sel=S.sel===b.dataset.cell?null:b.dataset.cell;renderCobertura();if(S.sel)$("#cov-detail").scrollIntoView({block:"nearest",behavior:"smooth"})});
$("#cov-matrix").addEventListener("change",e=>{const i=e.target.closest("[data-req]");if(!i)return;
  const v=i.value===""?null:Math.max(0,parseInt(i.value,10)||0);cfgUpdate({req:{[S.dim]:{[i.dataset.req]:v}}})});
["#l-turno","#l-pos","#l-area"].forEach(s=>$(s).addEventListener("change",renderLista));
$("#l-q").addEventListener("input",renderLista);
$("#l-list").addEventListener("click",e=>{const b=e.target.closest("[data-mark]");if(b&&S.canMark)mark(b.dataset.emp,b.dataset.mark)});
$("#l-all").addEventListener("click",markAll);
$("#p-q").addEventListener("input",renderPersonal);
["#p-turno","#p-pos","#p-area","#p-bajas"].forEach(s=>$(s).addEventListener("change",renderPersonal));
$("#p-new").addEventListener("click",()=>openEmp(null));
document.addEventListener("click",e=>{const r=e.target.closest("tr[data-emp]");if(r&&!e.target.closest("button,select,input"))openEmp(r.dataset.emp)});
$("#drawer-root").addEventListener("click",e=>{
  if(e.target.closest("[data-close]")){closeDrawer();return}
  if(e.target.id==="f-addcert"){readForm();D.data.certs=D.data.certs||[];D.data.certs.push({nombre:cfg().certs[0],folio:"",vence:""});renderDrawer();return}
  const del=e.target.closest("[data-cdel]");if(del){readForm();D.data.certs.splice(+del.dataset.cdel,1);renderDrawer();return}
  if(e.target.id==="f-save")saveEmp();
});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&D)closeDrawer()});
$("#c-add").addEventListener("click",()=>{const v=$("#c-new").value.trim();if(!v)return;const C=cfg();if(C.certs.includes(v)){toast("Ya existe");return}cfgUpdate({certs:C.certs.concat([v])});$("#c-new").value=""});
$("#v-certificaciones").addEventListener("click",e=>{const b=e.target.closest("[data-certdel]");if(!b)return;
  if(b.dataset.confirm!=="1"){b.dataset.confirm="1";b.textContent="¿Seguro?";setTimeout(()=>{if(b.isConnected){b.dataset.confirm="";b.textContent="Quitar"}},3000);return}
  const n=b.dataset.certdel;const C=cfg();const req={};Object.keys(C.certReq||{}).forEach(p=>req[p]=(C.certReq[p]||[]).filter(x=>x!==n));
  cfgUpdate({certs:C.certs.filter(x=>x!==n),certReq:req})});
$("#v-certificaciones").addEventListener("change",e=>{const c=e.target.closest("[data-creq]");if(!c)return;const p=c.dataset.creq;
  const vals=[...document.querySelectorAll("[data-creq]")].filter(x=>x.dataset.creq===p&&x.checked).map(x=>x.value);cfgUpdate({certReq:{[p]:vals}})});
$("#v-ajustes").addEventListener("click",e=>{
  const a=e.target.closest("[data-add]");
  if(a){const k=a.dataset.add;const inp={areas:"#a-area-new",posiciones:"#a-pos-new",turnos:"#a-turno-new"}[k];const v=$(inp).value.trim();if(!v)return;
    const arr=cfg()[k]||[];if(arr.includes(v)){toast("Ya existe");return}cfgUpdate({[k]:arr.concat([v])});$(inp).value="";return}
  const d=e.target.closest("[data-ldel]");
  if(d){const k=d.dataset.ldel;cfgUpdate({[k]:(cfg()[k]||[]).filter(x=>x!==d.dataset.v)})}
});
$("#v-ajustes").addEventListener("change",async e=>{const s=e.target.closest("[data-urol]");if(!s)return;
  const {error}=await S.sb.from("perfiles").update({rol:s.value}).eq("id",s.dataset.urol);
  if(error)toast(errMsg(error));else{const u=S.users.find(x=>x.id===s.dataset.urol);if(u)u.rol=s.value;toast("Rol actualizado")}});

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
  S.rol=(perfil&&perfil.rol)||"lector";S.canAdmin=S.rol==="admin";S.canMark=S.canAdmin||S.rol==="supervisor";
  $("#who-rol").textContent=S.rol;
  $("#cov-edit").hidden=!S.canAdmin;
  renderBanner();setTab(location.hash.slice(1)||S.tab);
  const [c,e]=await Promise.all([S.sb.from("config").select("data").eq("id",1).maybeSingle(),S.sb.from("empleados").select("*")]);
  if(c.data)S.cfg=Object.assign({},DEFAULT_CFG,c.data.data);
  if(e.error){renderBanner(`<div class="banner">No se pudo cargar el personal: ${esc(e.error.message)}</div>`)}
  S.emps=new Map((e.data||[]).map(r=>[r.num,r]));
  S.loaded=true;refreshSelects();
  await loadAttendance();
  if(S.canAdmin){const {data}=await S.sb.from("perfiles").select("id,email,rol").order("email");S.users=data||[];renderActive()}
  subscribe();
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
