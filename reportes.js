/* Control de Personal — Reportes (Resumen con gráficas + reportes descargables en Excel/CSV).
   Usa el estado que expone app.js en window.CP. Periodo por día, semana (lunes a domingo) o rango (hasta 62 días). */
(function(){
"use strict";
const MAX_DIAS=62;
const SERIES=[
  {key:"A",label:"Asistencia",color:"var(--c-a)"},{key:"R",label:"Retardo",color:"var(--c-r)"},
  {key:"F",label:"Falta",color:"var(--c-f)"},{key:"P",label:"Permiso",color:"var(--c-p)"},
  {key:"V",label:"Vacaciones",color:"var(--c-v)"},{key:"I",label:"Incapacidad",color:"var(--c-i)"}];
const REPORTES={
  diario:"Resumen por día y turno",
  detalle:"Asistencia detallada",
  persona:"Ausentismo por persona",
  cobertura:"Cobertura por día, turno y posición",
  plantilla:"Plantilla actual",
  certs:"Certificaciones"
};
const SIN_PERIODO=new Set(["plantilla","certs"]);
const GRUPOS={posicion:"Posición",area:"Área",sitio:"Sitio",gerente:"Gerente",supervisor:"Supervisor"};

let C=null; // window.CP
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pad=n=>String(n).padStart(2,"0");
const ymd=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const today=()=>ymd(new Date());
const addDays=(f,n)=>{const d=new Date(f+"T12:00:00");d.setDate(d.getDate()+n);return ymd(d)};
const fmtN=(n,dp=0)=>Number(n).toLocaleString("es-MX",{maximumFractionDigits:dp});
const fmtDia=f=>new Date(f+"T12:00:00").toLocaleDateString("es-MX",{weekday:"short",day:"numeric",month:"short"});
const pct=(a,b)=>b?Math.round(a/b*1000)/10:0;
function datesBetween(a,b){const o=[];for(let f=a;f<=b&&o.length<=MAX_DIAS;f=addDays(f,1))o.push(f);return o}
function isoWeek(f){const d=new Date(f+"T12:00:00");d.setDate(d.getDate()+3-(d.getDay()+6)%7);const y=d.getFullYear(),w1=new Date(y,0,4);
  return y+"-W"+pad(1+Math.round(((d-w1)/864e5-3+(w1.getDay()+6)%7)/7))}
function weekDates(w){const m=/^(\d{4})-W(\d{2})$/.exec(w||"");if(!m)return null;const j4=new Date(+m[1],0,4,12),mon=new Date(j4);
  mon.setDate(j4.getDate()-(j4.getDay()+6)%7+(+m[2]-1)*7);const f=ymd(mon);return{desde:f,hasta:addDays(f,6)}}
function weekOptions(sel){const ws=[];for(let i=0;i<26;i++)ws.push(isoWeek(addDays(today(),-7*i)));if(sel&&!ws.includes(sel))ws.push(sel);
  return ws.map(w=>{const r=weekDates(w);return `<option value="${w}" ${w===sel?"selected":""}>Sem ${+w.slice(6)} · ${fmtDia(r.desde)} – ${fmtDia(r.hasta)}</option>`}).join("")}

const R={modo:"semana",fecha:today(),semana:isoWeek(today()),desde:addDays(today(),-6),hasta:today(),turno:"",sitio:"",gerente:"",grupo:"posicion",sub:"resumen",rep:"diario"};
try{const s=JSON.parse(localStorage.getItem("cp_rep")||"{}");["modo","grupo","sub","rep"].forEach(k=>{if(s[k])R[k]=s[k]})}catch(e){}
const save=()=>{try{localStorage.setItem("cp_rep",JSON.stringify({modo:R.modo,grupo:R.grupo,sub:R.sub,rep:R.rep}))}catch(e){}};

/* ---------- datos del periodo (paginados: Supabase entrega hasta 1000 filas por consulta) ---------- */
const CACHE={key:null,rows:null,loading:false,error:"",at:0};
async function fetchRange(desde,hasta){
  const out=[];const step=1000;
  for(let from=0;;from+=step){
    const {data,error}=await C.S.sb.from("asistencia").select("fecha,num,estado,turno").gte("fecha",desde).lte("fecha",hasta).order("fecha").order("num").range(from,from+step-1);
    if(error)throw error;out.push(...data);if(data.length<step)break;
  }
  return out;
}
function rangeData(desde,hasta){
  const key=desde+"|"+hasta,stale=CACHE.key!==key||(hasta>=today()&&Date.now()-CACHE.at>30000);
  if(stale&&!CACHE.loading){
    CACHE.loading=true;
    fetchRange(desde,hasta).then(rows=>{CACHE.rows=rows;CACHE.error=""}).catch(e=>{CACHE.rows=null;CACHE.error="No se pudieron leer los datos ("+(e.message||e.code)+")."})
      .finally(()=>{CACHE.key=key;CACHE.at=Date.now();CACHE.loading=false;if(C.S.tab==="reportes")C.renderActive()});
  }
  return CACHE.key===key?CACHE:{rows:null,loading:true,error:""};
}

/* ---------- gráfica de barras apiladas ---------- */
function niceMax(m){if(m<=4)return Math.max(1,m);const p=Math.pow(10,Math.floor(Math.log10(m/4))),st=[1,2,5,10].map(x=>x*p).find(s=>m/s<=5);return Math.ceil(m/st)*st}
function barChart(cats,{titulo="",alto=210,series=SERIES}={}){
  if(!cats.length)return `<div class="empty">Sin registros en este periodo.</div>`;
  const tot=c=>series.reduce((a,s)=>a+(c[s.key]||0),0);
  const max=niceMax(Math.max(...cats.map(tot))),ticks=[0,1,2,3,4].map(i=>max*i/4).filter((v,i,a)=>Number.isInteger(v)&&a.indexOf(v)===i);
  const pocos=cats.length<=14,used=series.filter(s=>cats.some(c=>c[s.key]));
  return `<div class="chart" role="img" aria-label="${esc(titulo)}: ${cats.map(c=>`${c.label}: ${used.map(s=>`${c[s.key]||0} ${s.label.toLowerCase()}`).join(", ")}`).join("; ")}">
    <div class="ch-legend">${used.map(s=>`<span><i style="background:${s.color}"></i>${s.label}</span>`).join("")}</div>
    <div class="ch-plot" style="height:${alto}px">
      ${ticks.map(v=>`<div class="ch-grid" style="bottom:${v/max*100}%"><span class="ch-y">${fmtN(v)}</span></div>`).join("")}
      <div class="ch-cols">${cats.map((c,ci)=>{const t=tot(c),segs=used.filter(s=>c[s.key]>0);
        const pres=(c.A||0)+(c.R||0);
        const tip=`<b>${esc(c.label)}</b>${used.map(s=>`<div><i style="background:${s.color}"></i>${s.label}: <b>${fmtN(c[s.key]||0)}</b></div>`).join("")}<div class="ch-tip-f">${pct(pres,t)}% asistencia · ${fmtN(t)} registros</div>`;
        return `<div class="ch-col" tabindex="0" data-tip="${esc(tip)}">${pocos&&t?`<span class="ch-tot">${fmtN(t)}</span>`:""}
          <div class="ch-stack">${segs.map((s,i)=>`<i class="${i===segs.length-1?"top":""}" style="height:${c[s.key]/max*alto}px;background:${s.color}"></i>`).join("")}</div></div>`}).join("")}</div>
    </div>
    <div class="ch-xs">${cats.map((c,i)=>`<span title="${esc(c.label)}">${pocos||i%Math.ceil(cats.length/10)===0?esc(c.label):""}</span>`).join("")}</div></div>`;
}
(function(){let tip=null;
  const show=el=>{if(!tip){tip=document.createElement("div");tip.className="ch-tip panel";document.body.appendChild(tip)}
    tip.innerHTML=el.dataset.tip;tip.hidden=false;const r=el.getBoundingClientRect(),w=tip.offsetWidth;
    tip.style.left=Math.max(8,Math.min(innerWidth-w-8,r.left+r.width/2-w/2))+"px";tip.style.top=Math.max(8,r.top-tip.offsetHeight-6)+"px"};
  const hide=()=>{if(tip)tip.hidden=true};
  document.addEventListener("mouseover",e=>{const c=e.target.closest(".ch-col");c?show(c):hide()});
  document.addEventListener("focusin",e=>{const c=e.target.closest(".ch-col");c?show(c):hide()});
  document.addEventListener("scroll",hide,true);
})();

/* ---------- cálculo ---------- */
const empty=()=>({A:0,R:0,F:0,P:0,V:0,I:0});
function tally(list,keyFn){const m=new Map();list.forEach(x=>{const k=keyFn(x);if(k==null)return;const o=m.get(k)||Object.assign({key:k},empty());o[x.estado]++;m.set(k,o)});return m}
const presentes=o=>o.A+o.R, registrados=o=>o.A+o.R+o.F+o.P+o.V+o.I, ausentismo=o=>o.F+o.P+o.I;
function filtroEmp(e){return (!R.sitio||e.sitio===R.sitio)&&(!R.gerente||e.gerente===R.gerente)}
function grupoVal(e,g){return (g==="sitio"?C.sitioCorto(e.sitio):e[g])||"Sin asignar"}
function rowsFiltradas(rows){
  return rows.map(r=>{const e=C.S.emps.get(r.num)||{num:r.num,nombre:"(no está en el personal)",turno:r.turno};return Object.assign({},r,{turno:r.turno||e.turno,emp:e})})
    .filter(r=>(!R.turno||r.turno===R.turno)&&filtroEmp(r.emp));
}
function plantillaFiltrada(){return C.active().filter(e=>(!R.turno||e.turno===R.turno)&&filtroEmp(e))}

/* ---------- reportes ---------- */
function buildReport(rows,dias){
  const tipo=R.rep, cfg=C.cfg();
  if(tipo==="diario"){
    const m=tally(rows,r=>r.fecha+"|"+r.turno),plant=plantillaFiltrada(),hoy=today();
    const keys=[];dias.forEach(f=>C.turnosUsed().filter(t=>!R.turno||t===R.turno).forEach(t=>{if(m.has(f+"|"+t)||plant.some(e=>e.turno===t))keys.push(f+"|"+t)}));
    return{cols:[{h:"Fecha",mono:1},{h:"Turno"},{h:"Plantilla",num:1},{h:"Registrados",num:1},{h:"Sin registrar",num:1},...SERIES.map(s=>({h:s.label,num:1})),{h:"% asistencia",num:1},{h:"% ausentismo",num:1}],
      rows:keys.map(k=>{const [f,t]=k.split("|"),o=m.get(k)||empty(),pl=plant.filter(e=>e.turno===t).length,rg=registrados(o);
        return [f,t,pl,rg,f<=hoy?Math.max(0,pl-rg):"",...SERIES.map(s=>o[s.key]),pct(presentes(o),rg),pct(ausentismo(o),rg)]})};
  }
  if(tipo==="detalle"){
    return{cols:[{h:"Fecha",mono:1},{h:"No. empleado",mono:1},{h:"Nombre"},{h:"Turno"},{h:"Posición"},{h:"Área"},{h:"Sitio"},{h:"Supervisor"},{h:"Gerente"},{h:"Estado",fmt:v=>pill(v)}],
      rows:rows.slice().sort((a,b)=>a.fecha.localeCompare(b.fecha)||a.emp.nombre.localeCompare(b.emp.nombre)).map(r=>[r.fecha,r.num,r.emp.nombre,r.turno,r.emp.posicion||"",r.emp.area||"",C.sitioCorto(r.emp.sitio),r.emp.supervisor||"",r.emp.gerente||"",C.ST[r.estado]||r.estado])};
  }
  if(tipo==="persona"){
    const m=tally(rows,r=>r.num);
    const list=[...m.values()].map(o=>({o,e:C.S.emps.get(o.key)||{num:o.key,nombre:"(no está en el personal)"}})).sort((a,b)=>ausentismo(b.o)-ausentismo(a.o)||b.o.R-a.o.R||a.e.nombre.localeCompare(b.e.nombre));
    return{cols:[{h:"No. empleado",mono:1},{h:"Nombre"},{h:"Turno"},{h:"Posición"},{h:"Supervisor"},{h:"Celular",mono:1},...SERIES.map(s=>({h:s.label,num:1})),{h:"Días registrados",num:1},{h:"% asistencia",num:1},{h:"% ausentismo",num:1}],
      rows:list.map(({o,e})=>[e.num,e.nombre,e.turno||"",e.posicion||"",e.supervisor||"",e.celular||"",...SERIES.map(s=>o[s.key]),registrados(o),pct(presentes(o),registrados(o)),pct(ausentismo(o),registrados(o))])};
  }
  if(tipo==="cobertura"){
    const out=[],plant=plantillaFiltrada(),req=(cfg.req||{}).posicion||{};
    const pres=tally(rows.filter(r=>r.estado==="A"||r.estado==="R"),r=>r.fecha+"|"+r.turno+"|"+(r.emp.posicion||""));
    dias.forEach(f=>C.turnosUsed().filter(t=>!R.turno||t===R.turno).forEach(t=>cfg.posiciones.forEach(p=>{
      const pl=plant.filter(e=>e.turno===t&&e.posicion===p).length,rq=req[p+"__"+t],q=(rq===undefined||rq===null||rq==="")?pl:+rq;
      if(!q&&!pl)return;const o=pres.get(f+"|"+t+"|"+p),n=o?presentes(o):0;
      out.push([f,t,p,q,n,Math.max(0,q-n),n>=q?"Cubierta":"Descubierta"])})));
    return{cols:[{h:"Fecha",mono:1},{h:"Turno"},{h:"Posición"},{h:"Requeridos",num:1},{h:"Presentes",num:1},{h:"Faltan",num:1},{h:"Estado",fmt:v=>`<span class="chip ${v==="Cubierta"?"ok":"bad"}">${esc(v)}</span>`}],rows:out};
  }
  if(tipo==="plantilla"){
    const list=plantillaFiltrada().sort((a,b)=>a.nombre.localeCompare(b.nombre));
    return{cols:[{h:"No. empleado",mono:1},{h:"Nombre"},{h:"Turno"},{h:"Posición"},{h:"Área"},{h:"Sitio"},{h:"Supervisor"},{h:"Gerente"},{h:"Puesto HR"},{h:"Celular",mono:1},{h:"Correo"},{h:"Ingreso",mono:1},{h:"Antigüedad"}],
      rows:list.map(e=>[e.num,e.nombre,e.turno||"",e.posicion||"",e.area||"",C.sitioCorto(e.sitio),e.supervisor||"",e.gerente||"",e.puesto||"",e.celular||"",e.email||"",e.ingreso||"",e.antiguedad||""])};
  }
  // certs
  const hoy=today(),soon=addDays(hoy,30),out=[];
  plantillaFiltrada().forEach(e=>{
    (e.certs||[]).forEach(c=>out.push([e.num,e.nombre,e.turno||"",e.posicion||"",c.nombre,c.folio||"",c.vence||"",!c.vence?"Sin vencimiento":c.vence<hoy?"Vencida":c.vence<=soon?"Por vencer":"Vigente"]));
    C.missingCerts(e,hoy).forEach(n=>out.push([e.num,e.nombre,e.turno||"",e.posicion||"",n,"","","Falta (requerida)"]));
  });
  out.sort((a,b)=>a[1].localeCompare(b[1]));
  const cls={Vigente:"ok","Sin vencimiento":"ok","Por vencer":"warn",Vencida:"bad","Falta (requerida)":"bad"};
  return{cols:[{h:"No. empleado",mono:1},{h:"Nombre"},{h:"Turno"},{h:"Posición"},{h:"Certificación"},{h:"Folio",mono:1},{h:"Vence",mono:1},{h:"Estado",fmt:v=>`<span class="chip ${cls[v]||""}">${esc(v)}</span>`}],rows:out};
}
function pill(v){const k=Object.keys(C.ST).find(x=>C.ST[x]===v);return k?`<span class="chip ${C.PRESENT.has(k)?"ok":"bad"}">${esc(v)}</span>`:esc(v)}
function reportTable(rep){
  return `<div class="panel" style="padding:0"><div class="ph"><h3>${esc(REPORTES[R.rep])}</h3><span class="muted small">${fmtN(rep.rows.length)} registro${rep.rows.length===1?"":"s"}${rep.rows.length>300?" · se muestran 300; la descarga trae todos":""}</span></div>
    <div class="scroll"><table><thead><tr>${rep.cols.map(c=>`<th class="${c.num?"num":""}">${esc(c.h)}</th>`).join("")}</tr></thead>
    <tbody>${rep.rows.length?rep.rows.slice(0,300).map(r=>`<tr>${r.map((v,i)=>`<td class="${rep.cols[i].num?"num":rep.cols[i].mono?"mono":""}">${rep.cols[i].fmt?rep.cols[i].fmt(v):esc(v)}</td>`).join("")}</tr>`).join("")
      :`<tr><td colspan="${rep.cols.length}" class="empty">Sin registros con los filtros elegidos.</td></tr>`}</tbody></table></div></div>`;
}

/* ---------- descargas ---------- */
function saveBlob(name,data,type){
  const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
}
function downloadXlsx(name,aoa){
  if(!window.XLSX){C.toast("No se pudo cargar el generador de Excel. Usa CSV.");return}
  const wb=XLSX.utils.book_new(),ws=XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"]=aoa[0].map((h,i)=>({wch:Math.min(40,Math.max(String(h).length,...aoa.slice(1,200).map(r=>String(r[i]??"").length))+2)}));
  XLSX.utils.book_append_sheet(wb,ws,"Datos");
  saveBlob(name,XLSX.write(wb,{bookType:"xlsx",type:"array"}),"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
function downloadCsv(name,aoa){
  const cell=v=>{const s=v==null?"":String(v);return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
  saveBlob(name,"﻿"+aoa.map(r=>r.map(cell).join(",")).join("\r\n"),"text/csv;charset=utf-8");
}

/* ---------- vista ---------- */
function filtrosHtml(conPeriodo){
  const T=C.turnosUsed(),sit=C.listUsed("sitios","sitio"),ger=C.listUsed("gerentes","gerente");
  return `<div class="filters">
    ${R.sub==="reportes"?`<div class="fld"><label for="r-tipo">Reporte</label><select id="r-tipo">${Object.entries(REPORTES).map(([k,v])=>`<option value="${k}" ${R.rep===k?"selected":""}>${v}</option>`).join("")}</select></div>`:""}
    ${conPeriodo?`<div class="fld"><label for="r-modo">Periodo</label><select id="r-modo">${[["dia","Día"],["semana","Semana"],["rango","Rango de fechas"]].map(([k,v])=>`<option value="${k}" ${R.modo===k?"selected":""}>${v}</option>`).join("")}</select></div>
    ${R.modo==="dia"?`<div class="fld"><label for="r-fecha">Fecha</label><input type="date" id="r-fecha" value="${R.fecha}"></div>`
      :R.modo==="semana"?`<div class="fld"><label for="r-semana">Semana</label><select id="r-semana">${weekOptions(R.semana)}</select></div>`
      :`<div class="fld"><label for="r-desde">Desde</label><input type="date" id="r-desde" value="${R.desde}"></div><div class="fld"><label for="r-hasta">Hasta</label><input type="date" id="r-hasta" value="${R.hasta}"></div>`}`:""}
    <div class="fld"><label for="r-turno">Turno</label><select id="r-turno"><option value="">Todos</option>${T.map(t=>`<option ${R.turno===t?"selected":""}>${esc(t)}</option>`).join("")}</select></div>
    <div class="fld"><label for="r-sitio">Sitio</label><select id="r-sitio"><option value="">Todos</option>${sit.map(s=>`<option value="${esc(s)}" ${R.sitio===s?"selected":""}>${esc(C.sitioCorto(s))}</option>`).join("")}</select></div>
    <div class="fld"><label for="r-gerente">Gerente</label><select id="r-gerente"><option value="">Todos</option>${ger.map(g=>`<option ${R.gerente===g?"selected":""}>${esc(g)}</option>`).join("")}</select></div>
  </div>`;
}
function periodo(){
  const p=R.modo==="dia"?{desde:R.fecha,hasta:R.fecha}:R.modo==="semana"?weekDates(R.semana):{desde:R.desde,hasta:R.hasta};
  const dias=p&&p.desde<=p.hasta?datesBetween(p.desde,p.hasta):[];
  return{p,dias,ok:dias.length>0&&dias.length<=MAX_DIAS};
}
function render(root){
  C=window.CP;
  const esRep=R.sub==="reportes",sinPer=esRep&&SIN_PERIODO.has(R.rep);
  const {p,dias,ok}=periodo();
  let rows=null,msg="";
  if(!sinPer){
    if(!ok)msg=p&&p.desde>p.hasta?"La fecha inicial debe ser anterior o igual a la final.":`Elige un periodo de hasta ${MAX_DIAS} días.`;
    else{const d=rangeData(p.desde,p.hasta);if(d.error)msg=d.error;else if(d.rows)rows=rowsFiltradas(d.rows);else msg="Cargando datos del periodo…"}
  }
  const rep=esRep&&(sinPer||rows)?buildReport(rows||[],dias):null;
  const head=`<div class="seg" role="tablist" aria-label="Sección">${[["resumen","Resumen"],["reportes","Reportes"]].map(([k,l])=>`<button role="tab" data-rsub="${k}" aria-selected="${R.sub===k}">${l}</button>`).join("")}</div>
    ${esRep?`<div class="row"><button class="btn" id="r-xlsx" ${rep&&rep.rows.length?"":"disabled"}>Descargar Excel</button><button class="btn" id="r-csv" ${rep&&rep.rows.length?"":"disabled"}>Descargar CSV</button></div>`:""}`;
  const top=`<div class="rep-top">${head}</div>${filtrosHtml(!sinPer)}`;
  if(!sinPer&&!rows){root.innerHTML=top+`<div class="panel empty">${esc(msg)}</div>`;bind(root,null,p);return}
  if(esRep){
    let extra="";
    if(R.rep==="diario"&&dias.length>1){const m=tally(rows,r=>r.fecha);extra=`<div class="panel"><div class="ph"><h3>Asistencia por día</h3></div><div class="pb">${barChart(dias.filter(f=>m.has(f)).map(f=>Object.assign({label:fmtDia(f)},m.get(f))),{titulo:"Asistencia por día"})}</div></div>`}
    root.innerHTML=top+extra+reportTable(rep);bind(root,rep,p);return;
  }
  root.innerHTML=top+resumen(rows,dias,p);bind(root,null,p);
}
function resumen(rows,dias,p){
  const tot=Object.assign(empty(),[...tally(rows,()=>"t").values()][0]||{}),rg=registrados(tot),hoy=today();
  const plant=plantillaFiltrada(),diasPasados=dias.filter(f=>f<=hoy).length,esperados=plant.length*diasPasados;
  const regPasados=rows.filter(r=>r.fecha<=hoy).length,sinReg=Math.max(0,esperados-regPasados);
  const varios=dias.length>1;
  const byDia=tally(rows,r=>r.fecha),byTurno=tally(rows,r=>r.turno),byGrupo=tally(rows,r=>grupoVal(r.emp,R.grupo));
  const turnoCats=C.turnosUsed().filter(t=>byTurno.has(t)).map(t=>Object.assign({label:t},byTurno.get(t)));
  const grupoCats=[...byGrupo.values()].sort((a,b)=>registrados(b)-registrados(a)).map(o=>Object.assign({label:o.key},o));
  const tabla=(cats,etq)=>`<div class="scroll"><table><thead><tr><th>${etq}</th>${SERIES.map(s=>`<th class="num">${s.label}</th>`).join("")}<th class="num">% asist.</th><th class="num">% ausent.</th></tr></thead><tbody>${
    cats.length?cats.map(c=>`<tr><td><b>${esc(c.label)}</b></td>${SERIES.map(s=>`<td class="num">${c[s.key]||0}</td>`).join("")}<td class="num">${pct(presentes(c),registrados(c))}%</td><td class="num" style="${ausentismo(c)?"color:var(--bad)":""}">${pct(ausentismo(c),registrados(c))}%</td></tr>`).join("")
    :`<tr><td colspan="${SERIES.length+3}" class="empty">Sin registros.</td></tr>`}</tbody></table></div>`;
  // personas con más ausencias
  const byPer=[...tally(rows,r=>r.num).values()].filter(o=>ausentismo(o)||o.R).sort((a,b)=>ausentismo(b)-ausentismo(a)||b.R-a.R).slice(0,15);
  // cobertura por día (posición × turno contra requerido)
  const cfg=C.cfg(),req=(cfg.req||{}).posicion||{},presM=tally(rows.filter(r=>r.estado==="A"||r.estado==="R"),r=>r.fecha+"|"+r.turno+"|"+(r.emp.posicion||""));
  const cob=dias.filter(f=>f<=hoy).map(f=>{let desc=0,falt=0;const det=[];
    C.turnosUsed().filter(t=>!R.turno||t===R.turno).forEach(t=>cfg.posiciones.forEach(pz=>{
      const pl=plant.filter(e=>e.turno===t&&e.posicion===pz).length,rq=req[pz+"__"+t],q=(rq===undefined||rq===null||rq==="")?pl:+rq;if(!q)return;
      const o=presM.get(f+"|"+t+"|"+pz),n=o?presentes(o):0;if(n<q){desc++;falt+=q-n;det.push(`${pz} ${t} (−${q-n})`)}}));
    return{f,desc,falt,det,reg:byDia.has(f)}});
  const cobDias=cob.filter(c=>c.reg);
  return `
  <div class="kpis">
    <div class="panel kpi"><div class="lbl">Asistencia</div><div class="val">${pct(presentes(tot),rg)}%</div><div class="hint">${fmtN(presentes(tot))} de ${fmtN(rg)} registros (incluye retardos)</div><div class="meter"><i style="width:${pct(presentes(tot),rg)}%;background:var(--c-a)"></i></div></div>
    <div class="panel kpi"><div class="lbl">Ausentismo</div><div class="val" style="${ausentismo(tot)?"color:var(--bad)":""}">${pct(ausentismo(tot),rg)}%</div><div class="hint">Faltas, permisos e incapacidades: ${fmtN(ausentismo(tot))}. No incluye vacaciones.</div><div class="meter"><i style="width:${pct(ausentismo(tot),rg)}%;background:var(--c-f)"></i></div></div>
    <div class="panel kpi"><div class="lbl">Faltas · Retardos</div><div class="val">${fmtN(tot.F)} <span style="font-size:20px;color:var(--muted)">· ${fmtN(tot.R)}</span></div><div class="hint">${fmtN(tot.V)} vacaciones · ${fmtN(tot.I)} incapacidades · ${fmtN(tot.P)} permisos</div></div>
    <div class="panel kpi"><div class="lbl">Sin registrar</div><div class="val" style="${sinReg?"color:var(--warn)":""}">${fmtN(sinReg)}</div><div class="hint">Estimado con la plantilla actual (${plant.length} personas × ${diasPasados} día${diasPasados===1?"":"s"})</div></div>
  </div>
  ${varios?`<div class="panel"><div class="ph"><h3>Asistencia por día</h3><span class="small muted">${fmtDia(p.desde)} – ${fmtDia(p.hasta)}</span></div><div class="pb">${barChart(dias.filter(f=>byDia.has(f)).map(f=>Object.assign({label:fmtDia(f)},byDia.get(f))),{titulo:"Asistencia por día"})}</div></div>`:""}
  <div class="grid-2">
    <div class="panel"><div class="ph"><h3>Por turno</h3></div><div class="pb">${barChart(turnoCats,{titulo:"Asistencia por turno",alto:180})}</div></div>
    <div class="panel" style="padding:0"><div class="ph"><h3>Resumen por turno</h3></div>${tabla(turnoCats,"Turno")}</div>
  </div>
  <div class="panel"><div class="ph"><h3>Por ${GRUPOS[R.grupo].toLowerCase()}</h3>
      <div class="fld" style="flex-direction:row;align-items:center;gap:8px"><label for="r-grupo">Agrupar por</label><select id="r-grupo">${Object.entries(GRUPOS).map(([k,v])=>`<option value="${k}" ${R.grupo===k?"selected":""}>${v}</option>`).join("")}</select></div></div>
    <div class="pb">${barChart(grupoCats,{titulo:"Asistencia por "+GRUPOS[R.grupo].toLowerCase(),alto:200})}</div>${tabla(grupoCats,GRUPOS[R.grupo])}</div>
  <div class="grid-2">
    <div class="panel" style="padding:0"><div class="ph"><h3>Cobertura de posiciones</h3><span class="small muted">Posiciones por turno con menos presentes que el requerido</span></div><div class="scroll"><table><thead><tr><th>Día</th><th class="num">Descubiertas</th><th class="num">Personas faltantes</th><th>Detalle</th></tr></thead><tbody>${
      cobDias.length?cobDias.map(c=>`<tr><td class="nw">${esc(fmtDia(c.f))}</td><td class="num" style="${c.desc?"color:var(--bad);font-weight:600":""}">${c.desc}</td><td class="num">${c.falt}</td><td class="small">${c.det.length?esc(c.det.join(", ")):'<span class="chip ok">Todo cubierto</span>'}</td></tr>`).join("")
      :`<tr><td colspan="4" class="empty">Sin pase de lista en el periodo.</td></tr>`}</tbody></table></div></div>
    <div class="panel" style="padding:0"><div class="ph"><h3>Más ausencias en el periodo</h3><span class="small muted">Top 15 · faltas, permisos e incapacidades</span></div><div class="scroll"><table><thead><tr><th>Persona</th><th class="num">F</th><th class="num">P</th><th class="num">I</th><th class="num">R</th><th>Celular</th></tr></thead><tbody>${
      byPer.length?byPer.map(o=>{const e=C.S.emps.get(o.key)||{nombre:o.key};return `<tr class="click" data-emp="${esc(o.key)}"><td>${esc(e.nombre)}<div class="small muted">${esc(e.posicion||"")} · ${esc(e.turno||"")}</div></td><td class="num" style="${o.F?"color:var(--bad);font-weight:600":""}">${o.F}</td><td class="num">${o.P}</td><td class="num">${o.I}</td><td class="num">${o.R}</td><td class="tel">${esc(e.celular||"—")}</td></tr>`}).join("")
      :`<tr><td colspan="6" class="empty">Sin ausencias ni retardos en el periodo.</td></tr>`}</tbody></table></div></div>
  </div>`;
}
function bind(root,rep,p){
  const on=(id,fn)=>{const el=root.querySelector("#"+id);if(el)el.onchange=e=>{fn(e.target.value);save();C.renderActive()}};
  on("r-modo",v=>R.modo=v);on("r-fecha",v=>{if(v)R.fecha=v});on("r-semana",v=>{if(v)R.semana=v});
  on("r-desde",v=>{if(v)R.desde=v});on("r-hasta",v=>{if(v)R.hasta=v});on("r-turno",v=>R.turno=v);
  on("r-sitio",v=>R.sitio=v);on("r-gerente",v=>R.gerente=v);on("r-tipo",v=>R.rep=v);on("r-grupo",v=>R.grupo=v);
  root.querySelectorAll("[data-rsub]").forEach(b=>b.onclick=()=>{R.sub=b.dataset.rsub;save();C.renderActive()});
  if(rep){
    const name=`reporte_${R.rep}${SIN_PERIODO.has(R.rep)?"_"+today():`_${p.desde}_a_${p.hasta}`}`,aoa=()=>[rep.cols.map(c=>c.h),...rep.rows];
    root.querySelector("#r-xlsx").onclick=()=>downloadXlsx(name+".xlsx",aoa());
    root.querySelector("#r-csv").onclick=()=>downloadCsv(name+".csv",aoa());
  }
}
window.CPR={render,invalidate(){CACHE.at=0}};
})();
