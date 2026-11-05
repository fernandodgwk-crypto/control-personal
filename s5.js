/* Control de Personal — Limpieza y 5S de las áreas: checklist por área/fecha/turno, hallazgos, responsables y tablero. */
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
const lunes=f=>{const d=new Date(f+"T12:00:00");return addDays(f,-((d.getDay()+6)%7))};
const S5=[[1,"Clasificar","Seiri"],[2,"Ordenar","Seiton"],[3,"Limpiar","Seiso"],[4,"Estandarizar","Seiketsu"],[5,"Disciplina","Shitsuke"]];
const SUBS=[["tablero","Tablero"],["checklist","Checklist"],["hallazgos","Hallazgos"],["ajustes","Responsables y ajustes"]];
const X={loaded:false,loading:false,cfg:null,aud:[],hal:[],sub:"tablero",fecha:today(),turno:"",sitio:"",halFil:"abiertos",halArea:"",chan:null};
try{const s=localStorage.getItem("cp_s5_sub");if(s)X.sub=s}catch(e){}
const canAdm=()=>C.S.perms.has("s5_admin");
const canOp=()=>canAdm()||C.S.perms.has("s5_operar");
const cfgS=()=>X.cfg||{meta:85,items:{},responsables:{},areas:[],notificar:[]};
const meta=()=>Number(cfgS().meta)||85;
const areasProg=()=>{const a=cfgS().areas||[];return (a.length?a:(C.cfg().areas||[])).slice()};
const areaSitio=a=>(C.cfg().areaSitio||{})[a]||"";
const resp=a=>(cfgS().responsables||{})[a]||"";
const pctCls=p=>p===null||p===undefined?"":p>=meta()?"ok":p>=meta()-15?"warn":"bad";
const vencido=h=>h.estatus!=="cerrado"&&h.compromiso&&h.compromiso<today();

async function load(){
  if(X.loading)return;X.loading=true;const sb=C.S.sb;
  const [cf,au,ha]=await Promise.all([
    sb.from("s5_config").select("data").eq("id",1).maybeSingle(),
    sb.from("s5_auditorias").select("*").gte("fecha",addDays(today(),-70)).order("fecha"),
    sb.from("s5_hallazgos").select("*").order("creado",{ascending:false}).limit(600)]);
  X.cfg=cf.data?cf.data.data:null;X.aud=au.data||[];X.hal=ha.data||[];X.error=[cf,au,ha].map(r=>r.error).find(Boolean)||null;
  X.loaded=true;X.loading=false;if(!X.turno)X.turno=C.turnosUsed()[0]||"";
  if(!X.chan){X.chan=sb.channel("cp-s5");["s5_config","s5_auditorias","s5_hallazgos"].forEach(t=>X.chan.on("postgres_changes",{event:"*",schema:"public",table:t},()=>{clearTimeout(X.tm);X.tm=setTimeout(()=>{X.loading=false;load()},400)}));X.chan.subscribe()}
  if(C.S.tab==="s5")C.renderActive();
}
const avg=a=>a.length?Math.round(a.reduce((x,y)=>x+y,0)/a.length*10)/10:null;
const audsArea=(a,desde,hasta)=>X.aud.filter(r=>r.area===a&&r.fecha>=desde&&(!hasta||r.fecha<=hasta));
const pctBox=p=>p===null?'<span class="muted">—</span>':`<span class="chip ${pctCls(p)}">${p}%</span>`;

function vTablero(){
  const hoy=today(),A=areasProg(),d7=addDays(hoy,-6),d28=addDays(hoy,-27);
  const ult7=X.aud.filter(r=>r.fecha>=d7),revHoy=new Set(X.aud.filter(r=>r.fecha===hoy).map(r=>r.area));
  const ab=X.hal.filter(h=>h.estatus!=="cerrado"),venc=ab.filter(vencido);
  const last=a=>{const l=X.aud.filter(r=>r.area===a);return l.length?l[l.length-1]:null};
  const bajo=A.filter(a=>{const l=last(a);return l&&Number(l.puntaje)<meta()});
  const porS=S5.map(([n,nom])=>({n,nom,p:avg(ult7.map(r=>(r.por_s||{})[n]).filter(v=>v!==undefined&&v!==null).map(Number))}));
  const weeks=[];for(let k=7;k>=0;k--){const ini=lunes(addDays(hoy,-7*k));weeks.push({ini,fin:addDays(ini,6)})}
  const wcats=weeks.map(w=>{const p=avg(X.aud.filter(r=>r.fecha>=w.ini&&r.fecha<=w.fin).map(r=>Number(r.puntaje)));return{label:fmtD(w.ini).slice(0,5),p:p||0}});
  const chart=window.CPR&&window.CPR.barChart&&wcats.some(c=>c.p)?window.CPR.barChart(wcats,{titulo:"Cumplimiento 5S por semana",series:[{key:"p",label:"Cumplimiento promedio (%)",color:"var(--c-a)"}],alto:170,sufijo:"%"}):'<div class="empty">Aún no hay checklists.</div>';
  const dias=[];for(let k=6;k>=0;k--)dias.push(addDays(hoy,-k));
  return `<div class="kpis">
    <div class="panel kpi"><div class="lbl">Cumplimiento 7 días</div><div class="val" style="color:var(--${pctCls(avg(ult7.map(r=>Number(r.puntaje))))||"ink"})">${avg(ult7.map(r=>Number(r.puntaje)))??"—"}${ult7.length?"%":""}</div><div class="hint">Meta ${meta()}% · ${ult7.length} checklists</div></div>
    <div class="panel kpi"><div class="lbl">Áreas revisadas hoy</div><div class="val">${A.filter(a=>revHoy.has(a)).length}<span style="font-size:20px;color:var(--muted)"> / ${A.length}</span></div><div class="hint">en cualquier turno</div></div>
    <div class="panel kpi"><div class="lbl">Hallazgos abiertos</div><div class="val" style="${ab.length?"color:var(--warn)":""}">${ab.length}</div><div class="hint" style="${venc.length?"color:var(--bad)":""}">${venc.length} con compromiso vencido</div></div>
    <div class="panel kpi"><div class="lbl">Debajo de la meta</div><div class="val" style="${bajo.length?"color:var(--bad)":""}">${bajo.length}</div><div class="hint">${bajo.slice(0,3).map(esc).join(", ")||"según su último checklist"}</div></div>
  </div>
  <div class="grid-2">
    <div class="panel"><div class="ph"><h3>Cumplimiento por S</h3><span class="small muted">Últimos 7 días · meta ${meta()}%</span></div><div class="pb" style="display:grid;gap:10px">${porS.map(x=>`<div style="display:grid;grid-template-columns:110px minmax(0,1fr) 54px;gap:10px;align-items:center;font-size:13px"><span><b>${x.n}S</b> ${esc(x.nom)}</span>
      <span style="position:relative;height:16px;background:var(--surface2);border:1px solid var(--line);border-radius:3px;overflow:hidden"><i style="position:absolute;inset:0 auto 0 0;width:${x.p||0}%;background:var(--${pctCls(x.p)||"line"})"></i><i style="position:absolute;top:-2px;bottom:-2px;left:${meta()}%;border-left:2px dashed var(--ink);opacity:.5"></i></span>
      <span class="num" style="text-align:right">${x.p===null?"—":x.p+"%"}</span></div>`).join("")}</div></div>
    <div class="panel"><div class="ph"><h3>Tendencia semanal</h3><span class="small muted">Promedio de todos los checklists</span></div><div class="pb">${chart}</div></div>
  </div>
  <div class="panel" style="padding:0"><div class="ph"><h3>Áreas</h3><span class="small muted">Último checklist, promedio de 4 semanas y últimos 7 días</span></div><div class="scroll"><table><thead><tr><th>Área</th><th>Responsable</th><th>Último</th><th class="num">Prom. 4 sem.</th>${dias.map(d=>`<th style="text-align:center">${esc(new Date(d+"T12:00:00").toLocaleDateString("es-MX",{weekday:"narrow",day:"numeric"}))}</th>`).join("")}<th class="num">Hallazgos</th></tr></thead><tbody>${
    A.length?A.map(a=>{const l=last(a),p4=avg(audsArea(a,d28).map(r=>Number(r.puntaje))),h=ab.filter(x=>x.area===a).length;
      return `<tr><td><b>${esc(a)}</b>${areaSitio(a)?`<div class="small muted">${esc(C.sitioCorto(areaSitio(a)))}</div>`:""}</td><td class="small">${esc(resp(a)||"—")}</td><td class="nw">${l?pctBox(Number(l.puntaje))+` <span class="small muted">${fmtD(l.fecha).slice(0,5)}</span>`:'<span class="muted">Nunca</span>'}</td><td class="num">${p4===null?"—":p4+"%"}</td>
      ${dias.map(d=>{const r=audsArea(a,d,d);const p=r.length?avg(r.map(z=>Number(z.puntaje))):null;return `<td style="text-align:center">${p===null?'<span class="muted">·</span>':`<span title="${p}%" style="display:inline-block;width:14px;height:14px;border-radius:3px;background:var(--${pctCls(p)})"></span>`}</td>`}).join("")}
      <td class="num">${h?`<b style="color:var(--warn)">${h}</b>`:""}</td></tr>`}).join("")
    :'<tr><td colspan="12" class="empty">No hay áreas en el programa 5S.</td></tr>'}</tbody></table></div></div>`;
}
function vChecklist(){
  const T=C.turnosUsed(),sit=C.listUsed("sitios","sitio");
  const A=areasProg().filter(a=>!X.sitio||areaSitio(a)===X.sitio);
  const done=X.aud.filter(r=>r.fecha===X.fecha&&r.turno===X.turno);
  return `<div class="filters">
    <div class="fld"><label for="s5-f">Fecha</label><input type="date" id="s5-f" value="${X.fecha}"></div>
    <div class="fld"><label for="s5-t">Turno</label><select id="s5-t">${T.map(t=>`<option ${X.turno===t?"selected":""}>${esc(t)}</option>`).join("")}</select></div>
    <div class="fld"><label for="s5-s">Edificio</label><select id="s5-s"><option value="">Todos</option>${sit.map(s=>`<option value="${esc(s)}" ${X.sitio===s?"selected":""}>${esc(C.sitioCorto(s))}</option>`).join("")}</select></div>
    <div class="small muted" style="align-self:center">${A.filter(a=>done.some(d=>d.area===a)).length} de ${A.length} áreas revisadas · meta ${meta()}%</div></div>
  <div class="panel" style="padding:0"><div class="scroll"><table><thead><tr><th>Área</th><th>Responsable</th><th>Resultado</th>${S5.map(([n])=>`<th class="num">${n}S</th>`).join("")}<th></th></tr></thead><tbody>${
    A.length?A.map(a=>{const r=done.find(d=>d.area===a);
      return `<tr><td><b>${esc(a)}</b>${areaSitio(a)?` <span class="small muted">${esc(C.sitioCorto(areaSitio(a)))}</span>`:""}</td><td class="small">${esc(resp(a)||"—")}</td>
      <td>${r?pctBox(Number(r.puntaje))+`<div class="small muted">${esc(r.auditor_email||"")}</div>`:'<span class="chip warn">Pendiente</span>'}</td>
      ${S5.map(([n])=>`<td class="num">${r&&r.por_s&&r.por_s[n]!==undefined&&r.por_s[n]!==null?`<span style="color:var(--${pctCls(Number(r.por_s[n]))})">${r.por_s[n]}%</span>`:""}</td>`).join("")}
      <td style="text-align:right">${canOp()?`<button class="btn ${r?"":"primary"}" data-s5open="${esc(a)}">${r?"Ver / corregir":"Hacer checklist"}</button>`:""}</td></tr>`}).join("")
    :'<tr><td colspan="9" class="empty">No hay áreas en el programa 5S para este edificio.</td></tr>'}</tbody></table></div></div>`;
}
function vHallazgos(){
  const f=X.halFil,list=X.hal.filter(h=>(f==="abiertos"?h.estatus!=="cerrado":f==="vencidos"?vencido(h):f==="cerrados"?h.estatus==="cerrado":true)&&(!X.halArea||h.area===X.halArea));
  return `<div class="filters">
    <div class="fld"><label for="hl-f">Mostrar</label><select id="hl-f">${[["abiertos","Abiertos"],["vencidos","Compromiso vencido"],["cerrados","Cerrados"],["todos","Todos"]].map(([k,l])=>`<option value="${k}" ${f===k?"selected":""}>${l}</option>`).join("")}</select></div>
    <div class="fld"><label for="hl-a">Área</label><select id="hl-a"><option value="">Todas</option>${areasProg().map(a=>`<option ${X.halArea===a?"selected":""}>${esc(a)}</option>`).join("")}</select></div>
    <span style="flex:1"></span>${canOp()?'<button class="btn primary" data-halnew>Registrar hallazgo</button>':""}</div>
  <div class="panel" style="padding:0"><div class="scroll"><table><thead><tr><th>Área</th><th>S</th><th>Hallazgo</th><th>Responsable</th><th>Compromiso</th><th>Estatus</th><th>Registró</th></tr></thead><tbody>${
    list.length?list.map(h=>`<tr class="click" data-hal="${h.id}"><td><b>${esc(h.area)}</b></td><td class="nw">${h.s}S ${esc(S5[h.s-1][1])}</td><td>${esc(h.descripcion)}${h.cierre_nota?`<div class="small muted">Cierre: ${esc(h.cierre_nota)}</div>`:""}</td><td class="small">${esc(h.responsable||"—")}</td>
      <td class="nw">${h.compromiso?(vencido(h)?`<span class="chip bad">${fmtD(h.compromiso)}</span>`:fmtD(h.compromiso)):'<span class="muted">Sin fecha</span>'}</td><td>${h.estatus==="cerrado"?`<span class="chip ok">Cerrado</span><div class="small muted">${fmtD(String(h.cierre||"").slice(0,10))}</div>`:'<span class="chip warn">Abierto</span>'}</td><td class="small">${esc(h.creado_email||"")}<div class="muted">${fmtTs(h.creado)}</div></td></tr>`).join("")
    :'<tr><td colspan="7" class="empty">Sin hallazgos con este filtro.</td></tr>'}</tbody></table></div></div>`;
}
function vAjustes(){
  const c=cfgS(),ed=canAdm(),dis=ed?"":"disabled",todas=C.cfg().areas||[],prog=new Set(c.areas&&c.areas.length?c.areas:todas),sups=C.supsUsed();
  const porSit={};todas.forEach(a=>{const k=areaSitio(a)||"";(porSit[k]=porSit[k]||[]).push(a)});
  return `<div class="panel" style="padding:0"><div class="ph"><h3>Áreas del programa y responsables</h3><span class="small muted">El responsable recibe los avisos de hallazgos y de checklists debajo de la meta</span></div><div class="scroll"><table><thead><tr><th style="width:40px">En 5S</th><th>Área</th><th>Edificio</th><th>Responsable</th></tr></thead><tbody>${
    Object.keys(porSit).sort((a,b)=>(a||"~").localeCompare(b||"~")).map(k=>porSit[k].map(a=>`<tr><td style="text-align:center"><input type="checkbox" data-s5a="${esc(a)}" ${prog.has(a)?"checked":""} ${dis} aria-label="Incluir ${esc(a)}"></td><td>${esc(a)}</td><td class="small">${esc(C.sitioCorto(k)||"Sin edificio")}</td>
      <td><select data-s5r="${esc(a)}" ${dis} aria-label="Responsable de ${esc(a)}"><option value="">Sin responsable</option>${sups.map(x=>`<option ${resp(a)===x?"selected":""}>${esc(x)}</option>`).join("")}</select></td></tr>`).join("")).join("")}</tbody></table></div></div>
  <div class="grid-2">
    <div class="panel"><div class="ph"><h3>Meta de cumplimiento</h3></div><div class="pb row"><input type="number" id="s5-meta" min="0" max="100" value="${meta()}" style="width:90px" ${dis}> <span>%</span><span class="small muted">Debajo de la meta, el checklist genera un aviso.</span></div></div>
    <div class="panel"><div class="ph"><h3>Avisar también a</h3></div><div class="pb"><textarea id="s5-not" rows="3" placeholder="Un correo por línea" ${dis}>${esc((c.notificar||[]).join("\n"))}</textarea></div></div>
  </div>
  <div class="panel"><div class="ph"><h3>Puntos del checklist por S</h3><span class="small muted">Uno por línea</span></div><div class="pb perfiles">${S5.map(([n,nom,jp])=>`<div class="field"><label>${n}S · ${esc(nom)} (${esc(jp)})</label><textarea data-s5i="${n}" rows="6" ${dis}>${esc(((c.items||{})[n]||[]).join("\n"))}</textarea></div>`).join("")}</div></div>
  ${ed?'<div><button class="btn primary" id="s5-save">Guardar ajustes</button></div>':""}`;
}

/* ---------- modales ---------- */
function modal(title,body,w){
  $("#modal-root").innerHTML=`<div class="modal-scrim"><div class="panel modal" role="dialog" aria-modal="true" aria-labelledby="s5m-t" style="width:min(${w||560}px,100%)"><div class="ph"><h3 id="s5m-t">${title}</h3><button class="btn" data-s5x>Cancelar</button></div><div class="pb" style="display:grid;gap:12px">${body}<div id="s5m-err" style="color:var(--bad);font-size:13px;min-height:1.2em"></div></div></div></div>`;
  $("#modal-root [data-s5x]").onclick=close;
}
const close=()=>$("#modal-root").innerHTML="";
const err=m=>{const e=$("#s5m-err");if(e)e.textContent=m};
function openChecklist(area){
  const prev=X.aud.find(r=>r.area===area&&r.fecha===X.fecha&&r.turno===X.turno),items=[];
  S5.forEach(([n])=>((cfgS().items||{})[n]||[]).forEach(it=>{const p=prev&&(prev.items||[]).find(z=>z.s===n&&z.item===it);items.push({s:n,item:it,res:p?p.res:"si",nota:p?p.nota||"":""})}));
  const sups=C.supsUsed();
  modal(`Checklist 5S · ${esc(area)}`,`<div class="small muted">${fmtD(X.fecha)} · ${esc(X.turno)} · responsable: ${esc(resp(area)||"sin asignar")} · meta ${meta()}%</div>
    <div class="scroll"><table><thead><tr><th>Punto</th><th style="text-align:center">Sí</th><th style="text-align:center">No</th><th style="text-align:center">N/A</th><th>Nota</th></tr></thead><tbody>${
      S5.map(([n,nom])=>{const its=items.map((x,k)=>[x,k]).filter(([x])=>x.s===n);if(!its.length)return"";
        return `<tr class="perm-g"><td colspan="5" class="lbl">${n}S · ${esc(nom)}</td></tr>`+its.map(([x,k])=>`<tr><td>${esc(x.item)}</td>${["si","no","na"].map(v=>`<td style="text-align:center"><input type="radio" name="s5i${k}" value="${v}" ${x.res===v?"checked":""} aria-label="${esc(x.item)} ${v}"></td>`).join("")}<td><input type="text" data-s5n="${k}" value="${esc(x.nota)}" style="width:100%;min-width:110px"></td></tr>`).join("")}).join("")}</tbody></table></div>
    <div id="s5-score" class="row"></div>
    <div class="field"><label for="s5-obs">Observaciones</label><textarea id="s5-obs">${esc(prev?prev.observaciones:"")}</textarea></div>
    <div id="s5-hl" class="panel" style="padding:10px;display:none;gap:8px"><b style="font-size:14px">Registrar hallazgos de los puntos en "No"</b>
      <div class="grid2"><div class="field"><label for="s5-hr">Responsable</label><select id="s5-hr"><option value="">Sin responsable</option>${sups.map(x=>`<option ${resp(area)===x?"selected":""}>${esc(x)}</option>`).join("")}</select></div>
      <div class="field"><label for="s5-hc">Fecha compromiso</label><input type="date" id="s5-hc" value="${addDays(today(),3)}"></div></div>
      <div id="s5-hlist" style="display:grid;gap:4px"></div></div>
    <div class="row" style="justify-content:flex-end"><button class="btn primary" id="s5-ok">Guardar checklist</button></div>`,720);
  const read=()=>items.map((x,k)=>({s:x.s,item:x.item,res:(document.querySelector(`input[name=s5i${k}]:checked`)||{}).value||"si",nota:document.querySelector(`[data-s5n="${k}"]`).value.trim()}));
  const score=its=>{const ps={};let si=0,no=0;S5.forEach(([n])=>{const l=its.filter(z=>z.s===n&&z.res!=="na");const a=l.filter(z=>z.res==="si").length;ps[n]=l.length?Math.round(a/l.length*1000)/10:null;si+=a;no+=l.length-a});return{p:si+no?Math.round(si/(si+no)*1000)/10:100,ps}};
  const ya=new Set(X.hal.filter(h=>h.auditoria_id&&prev&&h.auditoria_id===prev.id).map(h=>h.descripcion));
  const upd=()=>{const its=read(),sc=score(its);
    $("#s5-score").innerHTML=`<b>Cumplimiento: <span style="color:var(--${pctCls(sc.p)})">${sc.p}%</span></b>`+S5.map(([n])=>sc.ps[n]===null?"":` <span class="chip ${pctCls(sc.ps[n])}">${n}S ${sc.ps[n]}%</span>`).join("");
    const nos=its.map((z,k)=>[z,k]).filter(([z])=>z.res==="no");
    $("#s5-hl").style.display=nos.length?"grid":"none";
    $("#s5-hlist").innerHTML=nos.map(([z,k])=>{const d=z.item+(z.nota?": "+z.nota:"");return `<label class="ck"><input type="checkbox" data-s5h="${k}" ${ya.has(d)?"disabled":"checked"}> ${z.s}S · ${esc(d)}${ya.has(d)?' <span class="small muted">(ya registrado)</span>':""}</label>`}).join("")};
  document.querySelectorAll("#modal-root input[type=radio]").forEach(r=>r.onchange=upd);document.querySelectorAll("[data-s5n]").forEach(r=>r.oninput=upd);upd();
  $("#s5-ok").onclick=async()=>{const b=$("#s5-ok");b.disabled=true;const its=read(),sc=score(its);
    const row={area,fecha:X.fecha,turno:X.turno,items:its,puntaje:sc.p,por_s:sc.ps,observaciones:$("#s5-obs").value.trim(),auditor_email:(C.S.session.user.email||"").toLowerCase()};
    const {data,error}=await C.S.sb.from("s5_auditorias").upsert(row,{onConflict:"area,fecha,turno"}).select().single();
    if(error){err(error.message);b.disabled=false;return}
    const hs=[...document.querySelectorAll("[data-s5h]")].filter(x=>x.checked&&!x.disabled).map(x=>{const z=its[+x.dataset.s5h];return{auditoria_id:data.id,area,s:z.s,descripcion:z.item+(z.nota?": "+z.nota:""),responsable:$("#s5-hr").value,compromiso:$("#s5-hc").value||null,creado_email:row.auditor_email}});
    if(hs.length){const r=await C.S.sb.from("s5_hallazgos").insert(hs);if(r.error){err("Checklist guardado, pero no se registraron los hallazgos: "+r.error.message);b.disabled=false;return}}
    close();C.toast(`Checklist guardado · ${sc.p}%${hs.length?` · ${hs.length} hallazgo${hs.length>1?"s":""}`:""}`);load()};
}
function openHallazgo(id){
  const h=id?X.hal.find(x=>x.id===id):{area:X.halArea||areasProg()[0]||"",s:3,descripcion:"",responsable:"",compromiso:addDays(today(),3),estatus:"abierto",cierre_nota:""},nuevo=!id,ro=!canOp();
  if(nuevo&&!h.responsable)h.responsable=resp(h.area);
  modal(nuevo?"Registrar hallazgo":"Hallazgo en "+esc(h.area),`<div class="grid2">
    <div class="field"><label for="h-a">Área</label><select id="h-a" ${nuevo?"":"disabled"}>${areasProg().map(a=>`<option ${a===h.area?"selected":""}>${esc(a)}</option>`).join("")}</select></div>
    <div class="field"><label for="h-s">S</label><select id="h-s">${S5.map(([n,nom])=>`<option value="${n}" ${+h.s===n?"selected":""}>${n}S · ${esc(nom)}</option>`).join("")}</select></div>
    <div class="field"><label for="h-r">Responsable</label><select id="h-r"><option value="">Sin responsable</option>${C.supsUsed().map(x=>`<option ${h.responsable===x?"selected":""}>${esc(x)}</option>`).join("")}</select></div>
    <div class="field"><label for="h-c">Fecha compromiso</label><input type="date" id="h-c" value="${esc(h.compromiso||"")}"></div></div>
    <div class="field"><label for="h-d">Descripción</label><textarea id="h-d">${esc(h.descripcion)}</textarea></div>
    ${nuevo?"":`<div class="grid2"><div class="field"><label for="h-e">Estatus</label><select id="h-e"><option value="abierto" ${h.estatus!=="cerrado"?"selected":""}>Abierto</option><option value="cerrado" ${h.estatus==="cerrado"?"selected":""}>Cerrado</option></select></div><div class="field"><label for="h-n">Cómo se cerró</label><input id="h-n" value="${esc(h.cierre_nota||"")}"></div></div>
    <div class="small muted">Registró ${esc(h.creado_email||"")} · ${fmtTs(h.creado)}${h.cierre?" · cerrado "+fmtTs(h.cierre):""}</div>`}
    ${ro?"":`<div class="row" style="justify-content:flex-end"><button class="btn primary" id="h-ok">${nuevo?"Registrar":"Guardar"}</button></div>`}`);
  const a=$("#h-a");if(nuevo)a.onchange=()=>{$("#h-r").value=resp(a.value)};
  const b=$("#h-ok");if(b)b.onclick=async()=>{b.disabled=true;
    const row={s:+$("#h-s").value,responsable:$("#h-r").value,compromiso:$("#h-c").value||null,descripcion:$("#h-d").value.trim()};
    if(!row.descripcion){err("Describe el hallazgo.");b.disabled=false;return}
    let r;if(nuevo){row.area=a.value;row.creado_email=(C.S.session.user.email||"").toLowerCase();r=await C.S.sb.from("s5_hallazgos").insert(row)}
    else{row.estatus=$("#h-e").value;row.cierre_nota=$("#h-n").value.trim();if(row.estatus==="cerrado"&&!row.cierre_nota){err("Escribe cómo se cerró.");b.disabled=false;return}r=await C.S.sb.from("s5_hallazgos").update(row).eq("id",id)}
    if(r.error){err(r.error.message);b.disabled=false;return}close();C.toast(nuevo?"Hallazgo registrado · se avisó al responsable":"Hallazgo actualizado");load()};
}

/* ---------- render y eventos ---------- */
function render(root){
  C=window.CP;
  if(!X.loaded){root.innerHTML='<div class="panel empty">Cargando 5S…</div>';load();return}
  if(X.error){root.innerHTML=`<div class="banner">No se pudo cargar 5S: ${esc(X.error.message)}</div>`;return}
  const ab=X.hal.filter(h=>h.estatus!=="cerrado").length;
  const body={tablero:vTablero,checklist:vChecklist,hallazgos:vHallazgos,ajustes:vAjustes}[X.sub]||vTablero;
  root.innerHTML=`<div class="seg eq-subs" role="tablist" aria-label="Secciones de 5S">${SUBS.map(([k,l])=>`<button role="tab" data-s5sub="${k}" aria-selected="${X.sub===k}">${l}${k==="hallazgos"&&ab?` <span class="tab-n" style="margin-left:4px">${ab}</span>`:""}</button>`).join("")}</div>`+body();
  if(!root.dataset.bound){root.dataset.bound="1";bind(root)}
}
function bind(root){
  root.addEventListener("click",async e=>{
    const t=e.target;
    const sb=t.closest("[data-s5sub]");if(sb){X.sub=sb.dataset.s5sub;try{localStorage.setItem("cp_s5_sub",X.sub)}catch(_){}C.renderActive();return}
    const o=t.closest("[data-s5open]");if(o){openChecklist(o.dataset.s5open);return}
    if(t.closest("[data-halnew]")){openHallazgo(null);return}
    const h=t.closest("[data-hal]");if(h){openHallazgo(h.dataset.hal);return}
    if(t.id==="s5-save"){const c=JSON.parse(JSON.stringify(cfgS()));const lines=v=>v.split("\n").map(s=>s.trim()).filter(Boolean);
      c.meta=Math.max(0,Math.min(100,Number($("#s5-meta").value)||85));c.notificar=lines($("#s5-not").value).map(s=>s.toLowerCase());
      c.items={};document.querySelectorAll("[data-s5i]").forEach(x=>c.items[x.dataset.s5i]=lines(x.value));
      c.areas=[...document.querySelectorAll("[data-s5a]")].filter(x=>x.checked).map(x=>x.dataset.s5a);
      c.responsables={};document.querySelectorAll("[data-s5r]").forEach(x=>{if(x.value)c.responsables[x.dataset.s5r]=x.value});
      const {error}=await C.S.sb.from("s5_config").upsert({id:1,data:c});if(error){C.toast(error.message);return}C.toast("Ajustes de 5S guardados");load()}
  });
  root.addEventListener("change",e=>{const t=e.target;
    if(t.id==="s5-f"){if(t.value)X.fecha=t.value;C.renderActive()}else if(t.id==="s5-t"){X.turno=t.value;C.renderActive()}else if(t.id==="s5-s"){X.sitio=t.value;C.renderActive()}
    else if(t.id==="hl-f"){X.halFil=t.value;C.renderActive()}else if(t.id==="hl-a"){X.halArea=t.value;C.renderActive()}});
}
window.CP5={render};
})();
