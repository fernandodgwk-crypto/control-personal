/* Control de Personal — Herramental → Etiquetas.
   Listado de identificaciones (modelo, edificio, número de serie y QR) y generador de PDF para imprimir.
   La etiqueta se dibuja en un canvas (misma función para la vista previa y el PDF) y se coloca en hojas
   carta/A4 con varias por hoja, o una por página para impresora de etiquetas. */
(function(){
"use strict";
const LIB_PDF="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";
const LIB_QR="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js";
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const $=s=>document.querySelector(s);
const fmtTs=t=>t?new Date(t).toLocaleString("es-MX",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"";
const NAVY="#0d2b55",BLUE="#1f5fbf",GRAY="#a7a9ac";
const HOJAS={carta:["Carta (varias por hoja)",215.9,279.4],a4:["A4 (varias por hoja)",210,297],etiqueta:["Una por página (impresora de etiquetas)",0,0]};
const QRMODOS={sn:"Número de serie",todo:"Modelo, edificio y número de serie"};

let A=null; // contexto que da equipos.js: {S, sb, toast, eq, cfg, saveCfg, canOp, canAdm, sitioCorto}
const T={rows:[],loaded:false,loading:false,sel:new Set(),prev:null,chan:null,
  page:{ancho:90,alto:50,hoja:"carta",corte:true,margen:8,sep:4}};
try{Object.assign(T.page,JSON.parse(localStorage.getItem("cp_etq_page")||"{}"))}catch(e){}
const savePage=()=>{try{localStorage.setItem("cp_etq_page",JSON.stringify(T.page))}catch(e){}};
const ajustes=()=>Object.assign({titulo:"CONTROL DE PRODUCCIÓN",qr:"sn",logo:"",c1:"MODELO",c2:"EDIFICIO",c3:"SN"},(A.cfg()||{}).etiqueta||{});
const lbl=(aj,k)=>String(aj[k]||"").trim().toUpperCase();
const cap=x=>x.toLowerCase().replace(/^./,y=>y.toUpperCase());

/* ---------- carga de librerías ---------- */
const libs={};
function lib(url){return libs[url]||(libs[url]=new Promise((ok,ko)=>{const s=document.createElement("script");s.src=url;s.onload=ok;s.onerror=()=>{delete libs[url];ko(new Error("No se pudo cargar "+url.split("/npm/")[1]+". Revisa el internet."))};document.head.appendChild(s)}))}
const libsQR=()=>lib(LIB_QR).then(()=>{if(window.qrcode&&qrcode.stringToBytesFuncs&&qrcode.stringToBytesFuncs["UTF-8"])qrcode.stringToBytes=qrcode.stringToBytesFuncs["UTF-8"]});

/* ---------- datos ---------- */
async function load(){
  if(T.loading)return;T.loading=true;
  const {data,error}=await A.sb.from("eq_etiquetas").select("*").order("creado");
  T.rows=data||[];T.error=error||null;T.loaded=true;T.loading=false;
  if(!T.chan){T.chan=A.sb.channel("cp-etq").on("postgres_changes",{event:"*",schema:"public",table:"eq_etiquetas"},()=>{clearTimeout(T.tm);T.tm=setTimeout(()=>{T.loading=false;load()},400)}).subscribe()}
  A.rerender();
}
const qrText=(r,aj)=>(r.qr||"").trim()||(aj.qr==="todo"?`${lbl(aj,"c1")}: ${r.modelo}\n${lbl(aj,"c2")}: ${r.edificio}\n${lbl(aj,"c3")}: ${r.sn}`:String(r.sn||"").trim());

/* ---------- dibujo de la etiqueta (diseño base 1180 × 660) ---------- */
function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath()}
function fit(c,txt,font,max,size,min){let s=size;do{c.font=font.replace("{s}",s);if(c.measureText(txt).width<=max)break;s-=2}while(s>min);return s}
const COND="700 {s}px 'Barlow Condensed','Arial Narrow',Arial,sans-serif",BOLD="700 {s}px Arial,Helvetica,sans-serif";
// Valor: Arial negrita hasta cierto tamaño; si no cabe, letra condensada (se lee mejor que muy chica)
function fitValor(c,txt,max,size){const a=fit(c,txt,BOLD,max,size,size*.62);c.font=BOLD.replace("{s}",a);if(c.measureText(txt).width<=max)return;
  c.font=COND.replace("{s}",fit(c,txt,COND,max,size*1.08,16))}
function icono(c,x,y,s){ // engrane con fábrica y barras, en un cuadro de s × s
  c.save();c.translate(x+s/2,y+s/2);c.fillStyle=NAVY;
  const R=s*.47,r=s*.36,n=10;c.beginPath();
  for(let i=0;i<n;i++){const a0=(i/n)*Math.PI*2-Math.PI/2,a1=a0+Math.PI/n*.55,a2=a0+Math.PI/n,a3=a2+Math.PI/n*.45;
    c.lineTo(Math.cos(a0)*R,Math.sin(a0)*R);c.lineTo(Math.cos(a1)*R,Math.sin(a1)*R);c.lineTo(Math.cos(a2)*r*1.08,Math.sin(a2)*r*1.08);c.lineTo(Math.cos(a3)*r*1.08,Math.sin(a3)*r*1.08)}
  c.closePath();c.fill();
  c.globalCompositeOperation="destination-out";c.beginPath();c.arc(0,0,r*.82,0,Math.PI*2);c.fill();
  c.beginPath();c.moveTo(0,0);c.arc(0,0,R*1.1,Math.PI*.2,Math.PI*.8);c.closePath();c.fill();
  c.globalCompositeOperation="source-over";
  const u=s/100;c.fillStyle=NAVY; // fábrica
  c.beginPath();c.moveTo(-40*u,40*u);c.lineTo(-40*u,2*u);c.lineTo(-24*u,-8*u);c.lineTo(-24*u,2*u);c.lineTo(-8*u,-8*u);c.lineTo(-8*u,2*u);c.lineTo(4*u,-6*u);c.lineTo(4*u,40*u);c.closePath();c.fill();
  c.fillRect(-36*u,-22*u,7*u,20*u);
  c.fillStyle="#fff";for(const [a,b] of [[-34,14],[-22,14],[-10,14]])c.fillRect(a*u,b*u,7*u,7*u);
  c.fillStyle=NAVY;[[8,18,9,22],[20,6,9,34],[32,-8,9,48]].forEach(([a,b,w,h])=>c.fillRect(a*u,b*u,w*u,h*u)); // barras
  c.strokeStyle=NAVY;c.lineWidth=4*u;c.lineCap="round";c.beginPath();c.moveTo(-6*u,12*u);c.lineTo(10*u,4*u);c.lineTo(22*u,-8*u);c.lineTo(38*u,-26*u);c.stroke();
  c.restore();
}
function qrMatrix(txt){if(!txt)return null;let q;for(const ec of ["M","L"]){try{q=qrcode(0,ec);q.addData(txt);q.make();return q}catch(e){}}return null}
function dibujar(canvas,r,aj,logoImg){
  const W=1180,H=660,k=canvas.width/W,c=canvas.getContext("2d");
  c.setTransform(k,0,0,k,0,0);c.clearRect(0,0,W,H);
  c.fillStyle="#fff";rr(c,6,6,W-12,H-12,46);c.fill();
  c.lineWidth=9;c.strokeStyle=NAVY;rr(c,10,14,W-20,H-28,44);c.stroke();
  // franjas y barra inferior
  c.save();rr(c,10,14,W-20,H-28,44);c.clip();
  const par=(x,col)=>{c.fillStyle=col;c.beginPath();c.moveTo(x,622);c.lineTo(x+60,545);c.lineTo(x+120,545);c.lineTo(x+60,622);c.closePath();c.fill()};
  par(-10,BLUE);par(60,BLUE);par(130,GRAY);
  c.fillStyle=NAVY;c.beginPath();c.moveTo(232,606);c.lineTo(1150,606);c.lineTo(1150,622);c.lineTo(220,622);c.closePath();c.fill();
  c.restore();
  // logo y título
  if(logoImg){const s=Math.min(200/logoImg.width,175/logoImg.height);c.drawImage(logoImg,40+(200-logoImg.width*s)/2,48+(175-logoImg.height*s)/2,logoImg.width*s,logoImg.height*s)}
  else icono(c,40,40,200);
  c.fillStyle=NAVY;c.fillRect(272,55,5,168);
  const tit=String(aj.titulo||"").trim().toUpperCase(),pal=tit.split(/\s+/);let l1=tit,l2="";
  if(pal.length>1){let best=null;for(let i=1;i<pal.length;i++){const a=pal.slice(0,i).join(" "),b=pal.slice(i).join(" "),d=Math.abs(a.length-b.length);if(!best||d<best[0])best=[d,a,b]}l1=best[1];l2=best[2]}
  c.fillStyle=NAVY;c.textBaseline="alphabetic";
  const tf="700 {s}px 'Barlow Condensed','Arial Narrow',Arial,sans-serif",ts=Math.min(fit(c,l1,tf,380,84,30),l2?fit(c,l2,tf,380,84,30):84);
  c.font=tf.replace("{s}",ts);
  if(l2){c.fillText(l1,300,135);c.fillText(l2,300,135+ts*.92)}else c.fillText(l1,300,165);
  c.fillStyle=BLUE;c.fillRect(38,246,642,11);
  // campos
  const campo=(y,lbl,val)=>{
    c.fillStyle="#fff";rr(c,38,y,642,93,16);c.fill();c.lineWidth=4;c.strokeStyle=NAVY;c.stroke();
    c.save();rr(c,38,y,642,93,16);c.clip();c.fillStyle=NAVY;c.beginPath();c.moveTo(30,y-2);c.lineTo(322,y-2);c.lineTo(350,y+46.5);c.lineTo(322,y+95);c.lineTo(30,y+95);c.closePath();c.fill();c.restore();
    c.fillStyle="#fff";const lf="700 {s}px 'Barlow Condensed','Arial Narrow',Arial,sans-serif";c.font=lf.replace("{s}",fit(c,lbl,lf,262,62,30));c.fillText(lbl,62,y+68);
    const v=String(val||"");c.fillStyle="#111";fitValor(c,v,296,66);c.fillText(v,372,y+70)};
  campo(292,lbl(aj,"c1")+":",r.modelo);campo(412,lbl(aj,"c2")+":",r.edificio);
  // QR
  const q=qrMatrix(qrText(r,aj));const QX=722,QY=40,QS=420;
  if(q){const n=q.getModuleCount(),m=QS/n;c.fillStyle="#000";
    for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(q.isDark(y,x))c.fillRect(QX+x*m,QY+y*m,m+.6,m+.6)}
  else{c.strokeStyle="#bbb";c.lineWidth=3;c.setLineDash([12,10]);c.strokeRect(QX+20,QY+20,QS-40,QS-40);c.setLineDash([]);c.fillStyle="#999";c.font="600 34px Arial";c.textAlign="center";c.fillText("Sin datos para QR",QX+QS/2,QY+QS/2);c.textAlign="left"}
  // SN
  c.fillStyle=NAVY;rr(c,712,486,436,96,18);c.fill();
  const sn=lbl(aj,"c3")+": "+String(r.sn||"");c.fillStyle="#fff";c.textAlign="center";fitValor(c,sn,400,60);c.fillText(sn,930,555);c.textAlign="left";
}
let logoCache={src:null,img:null};
function logoImg(aj){if(!aj.logo)return Promise.resolve(null);if(logoCache.src===aj.logo)return Promise.resolve(logoCache.img);
  return new Promise(ok=>{const i=new Image();i.onload=()=>{logoCache={src:aj.logo,img:i};ok(i)};i.onerror=()=>ok(null);i.src=aj.logo})}
async function fuentes(){try{await Promise.all([document.fonts.load("700 60px 'Barlow Condensed'"),document.fonts.load("700 60px Arial")])}catch(e){}}

/* ---------- vista ---------- */
function vista(){
  const aj=ajustes(),op=A.canOp(),adm=A.canAdm(),P=T.page;
  const sel=T.rows.filter(r=>T.sel.has(r.id)),usar=sel.length?sel:T.rows,tot=usar.reduce((s,r)=>s+(r.copias||1),0);
  const edifs=[...new Set([...((A.S.cfg&&A.S.cfg.sitios)||[]).map(A.sitioCorto),...A.eq().map(e=>A.sitioCorto(e.sitio||"")),...T.rows.map(r=>r.edificio)].filter(Boolean))].sort();
  const lay=layout();
  return `<datalist id="etq-edifs">${edifs.map(x=>`<option value="${esc(x)}">`).join("")}</datalist>
  <div class="etq-grid">
    <div class="panel"><div class="ph"><div><h3>Listado de etiquetas</h3><p class="small muted" style="margin:2px 0 0">Captura, importa de Excel o toma los equipos registrados. Marca las que quieras imprimir; sin marcar se imprimen todas.</p></div><span class="chip">${T.rows.length}</span></div>
      ${op?`<div class="pb row" style="gap:8px;flex-wrap:wrap;padding-bottom:0">
        <button class="btn primary" id="etq-add">Agregar fila</button>
        <button class="btn" id="etq-eq">Desde equipos registrados</button>
        <label class="btn" style="cursor:pointer">Importar Excel / CSV<input type="file" id="etq-file" accept=".xlsx,.xls,.csv" hidden></label>
        <button class="btn" id="etq-tpl">Descargar plantilla</button>
        ${sel.length?`<button class="btn" id="etq-edsel">Cambiar ${esc(lbl(aj,"c2").toLowerCase())} de ${sel.length} marcadas</button>`:""}
        ${sel.length?`<button class="btn danger" id="etq-delsel">Quitar ${sel.length} marcadas</button>`:""}</div>`:""}
      <div class="scroll"><table class="etq-tab"><thead><tr><th style="width:28px"><input type="checkbox" id="etq-all" aria-label="Marcar todas" ${T.rows.length&&sel.length===T.rows.length?"checked":""}></th><th>${esc(cap(lbl(aj,"c1")))}</th><th>${esc(cap(lbl(aj,"c2")))}</th><th>${esc(lbl(aj,"c3"))}</th><th title="Vacío: según el ajuste general">QR <span class="muted">(opcional)</span></th><th style="width:70px">Copias</th><th>Impresa</th><th></th></tr></thead><tbody>
      ${T.rows.length?T.rows.map(r=>`<tr data-etq="${r.id}" class="${T.prev===r.id?"etq-on":""}">
        <td><input type="checkbox" data-etqsel="${r.id}" ${T.sel.has(r.id)?"checked":""} aria-label="Marcar"></td>
        ${["modelo","edificio","sn","qr"].map(k=>`<td><input type="text" data-etqf="${k}" value="${esc(r[k])}" ${op?"":"disabled"} ${k==="edificio"?'list="etq-edifs"':""} placeholder="${k==="qr"?esc(qrText({...r,qr:""},aj).split("\n")[0]||"—"):""}" aria-label="${k}"></td>`).join("")}
        <td><input type="number" min="1" max="99" data-etqf="copias" value="${r.copias||1}" ${op?"":"disabled"} style="width:60px" aria-label="Copias"></td>
        <td class="small muted nw">${r.impresiones?`${r.impresiones}× · ${fmtTs(r.ultima_impresion)}`:"—"}</td>
        <td>${op?`<button class="btn" data-etqdel="${r.id}" title="Quitar" aria-label="Quitar">✕</button>`:""}</td></tr>`).join("")
      :`<tr><td colspan="8" class="empty">Sin etiquetas. ${op?"Agrega una fila, importa un Excel o tómalas de los equipos registrados.":""}</td></tr>`}</tbody></table></div></div>
    <div class="etq-side">
      <div class="panel"><div class="ph"><h3>Vista previa</h3><span class="small muted">${P.ancho} × ${P.alto} mm</span></div>
        <div class="pb"><canvas id="etq-cv" width="1180" height="660" class="etq-cv" aria-label="Vista previa de la etiqueta"></canvas></div></div>
      <div class="panel"><div class="ph"><h3>Formato e impresión</h3></div><div class="pb" style="display:grid;gap:10px">
        <div class="field"><label for="etq-tit">Título</label><input type="text" id="etq-tit" value="${esc(aj.titulo)}" maxlength="40" ${adm?"":"disabled"}></div>
        <div class="row" style="gap:8px">${["c1","c2","c3"].map((k,i)=>`<div class="field" style="flex:1"><label for="etq-${k}">Campo ${i+1}</label><input type="text" id="etq-${k}" value="${esc(aj[k])}" maxlength="14" ${adm?"":"disabled"} data-etqaj="${k}"></div>`).join("")}</div>
        <div class="field"><label for="etq-qr">El QR contiene</label><select id="etq-qr" ${adm?"":"disabled"}>${Object.entries(QRMODOS).map(([k,l])=>`<option value="${k}" ${aj.qr===k?"selected":""}>${l}</option>`).join("")}</select></div>
        <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap"><span class="small muted">Logo:</span><span class="small">${aj.logo?"propio":"engrane (predeterminado)"}</span>
          ${adm?`<label class="btn" style="cursor:pointer">Subir logo<input type="file" id="etq-logo" accept="image/*" hidden></label>${aj.logo?'<button class="btn" id="etq-nologo">Quitar</button>':""}`:""}</div>
        ${adm?"":'<p class="small muted" style="margin:0">Título, QR y logo los ajusta el administrador de herramental.</p>'}
        <hr style="border:0;border-top:1px solid var(--line);margin:2px 0">
        <div class="row" style="gap:8px"><div class="field" style="flex:1"><label for="etq-w">Ancho (mm)</label><input type="number" id="etq-w" min="30" max="200" value="${P.ancho}"></div>
          <div class="field" style="flex:1"><label for="etq-h">Alto (mm)</label><input type="number" id="etq-h" min="17" max="120" value="${P.alto}" readonly title="Se ajusta al ancho para conservar la proporción del diseño"></div></div>
        <div class="field"><label for="etq-hoja">Hoja</label><select id="etq-hoja">${Object.entries(HOJAS).map(([k,v])=>`<option value="${k}" ${P.hoja===k?"selected":""}>${v[0]}</option>`).join("")}</select></div>
        ${P.hoja!=="etiqueta"?`<label class="row small" style="gap:6px"><input type="checkbox" id="etq-corte" ${P.corte?"checked":""}> Líneas de corte</label>
          <div class="small muted">${lay.cols} × ${lay.rows} = <b>${lay.cols*lay.rows}</b> etiquetas por hoja</div>`:""}
        <button class="btn primary" id="etq-pdf" ${tot?"":"disabled"}>Generar PDF · ${tot} etiqueta${tot===1?"":"s"}${sel.length?" marcadas":""}</button>
        <div class="err" id="etq-err"></div></div></div>
    </div></div>`;
}
function layout(){const P=T.page,h=HOJAS[P.hoja]||HOJAS.carta;if(P.hoja==="etiqueta")return{pw:P.ancho,ph:P.alto,cols:1,rows:1,x0:0,y0:0};
  const pw=h[1],ph=h[2],m=P.margen,g=P.sep,cols=Math.max(1,Math.floor((pw-2*m+g)/(P.ancho+g))),rows=Math.max(1,Math.floor((ph-2*m+g)/(P.alto+g)));
  return{pw,ph,cols,rows,x0:(pw-(cols*P.ancho+(cols-1)*g))/2,y0:(ph-(rows*P.alto+(rows-1)*g))/2,g}}

async function preview(){
  const cv=$("#etq-cv");if(!cv)return;const aj=ajustes();
  const r=T.rows.find(x=>x.id===T.prev)||T.rows.find(x=>T.sel.has(x.id))||T.rows[0]||{modelo:"XXXXXX",edificio:"B1",sn:"12345678",qr:""};
  try{await Promise.all([libsQR(),fuentes()])}catch(e){$("#etq-err").textContent=e.message}
  const img=await logoImg(aj);if(!document.body.contains(cv))return;dibujar(cv,r,aj,img);
}

/* ---------- PDF ---------- */
async function generarPDF(){
  const err=$("#etq-err"),btn=$("#etq-pdf");err.textContent="";btn.disabled=true;const txt=btn.textContent;btn.textContent="Generando…";
  try{
    await Promise.all([lib(LIB_PDF),libsQR(),fuentes()]);
    const aj=ajustes(),img=await logoImg(aj),P=T.page,L=layout();
    const usar=T.rows.filter(r=>T.sel.has(r.id));const lista=(usar.length?usar:T.rows).flatMap(r=>Array(Math.max(1,r.copias||1)).fill(r));
    const {jsPDF}=window.jspdf;const doc=new jsPDF({unit:"mm",format:[L.pw,L.ph],orientation:L.pw>L.ph?"landscape":"portrait"});
    const px=Math.round(P.ancho/25.4*400),cv=document.createElement("canvas");cv.width=px;cv.height=Math.round(px*660/1180);
    const porHoja=L.cols*L.rows,cache={};
    lista.forEach((r,i)=>{
      const k=i%porHoja;if(i&&k===0)doc.addPage([L.pw,L.ph],L.pw>L.ph?"landscape":"portrait");
      if(k===0&&P.hoja!=="etiqueta"&&P.corte){doc.setDrawColor(170);doc.setLineWidth(.1);doc.setLineDashPattern([1,1],0);
        const n=Math.min(porHoja,lista.length-i),rowsUsed=Math.ceil(n/L.cols);
        for(let rr2=0;rr2<rowsUsed;rr2++)for(let cc=0;cc<L.cols&&rr2*L.cols+cc<n;cc++){const x=L.x0+cc*(P.ancho+L.g),y=L.y0+rr2*(P.alto+L.g);doc.rect(x-L.g/2,y-L.g/2,P.ancho+L.g,P.alto+L.g)}
        doc.setLineDashPattern([],0)}
      const x=L.x0+(k%L.cols)*(P.ancho+(L.g||0)),y=L.y0+Math.floor(k/L.cols)*(P.alto+(L.g||0));
      if(!cache[r.id]){dibujar(cv,r,aj,img);cache[r.id]=cv.toDataURL("image/png")}
      doc.addImage(cache[r.id],"PNG",x,y,P.ancho,P.alto,"etq-"+r.id,"FAST");
    });
    const nombre="Etiquetas_herramental_"+new Date().toISOString().slice(0,10)+".pdf";
    doc.save(nombre);
    const ids=[...new Set(lista.map(r=>r.id))],ahora=new Date().toISOString();
    await Promise.all(ids.map(id=>{const r=T.rows.find(x=>x.id===id);return A.sb.from("eq_etiquetas").update({impresiones:(r.impresiones||0)+1,ultima_impresion:ahora}).eq("id",id)}));
    A.toast(`PDF listo: ${lista.length} etiqueta${lista.length===1?"":"s"}`);load();
  }catch(e){err.textContent=e.message||String(e)}
  btn.disabled=false;btn.textContent=txt;
}

/* ---------- importación ---------- */
const norm=s=>String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").trim().toLowerCase();
async function importar(file){
  if(!window.XLSX){A.toast("No se cargó el lector de Excel. Recarga la página.");return}
  const wb=XLSX.read(await file.arrayBuffer(),{type:"array"});const filas=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:""});
  const col=(o,names)=>{const k=Object.keys(o).find(k=>names.includes(norm(k)));return k?String(o[k]).trim():""};
  const aj=ajustes(),al=k=>norm(lbl(aj,k));
  const rows=filas.map(o=>({modelo:col(o,["modelo","model",al("c1")]),edificio:col(o,["edificio","building","bldg","edif",al("c2")]),sn:col(o,["sn","serie","serial","numero de serie","no. serie","n/s","s/n","numero serie",al("c3")]),
    qr:col(o,["qr","contenido qr"]),copias:Math.min(99,Math.max(1,parseInt(col(o,["copias","cantidad","qty"]))||1)),creado_email:(A.S.session.user.email||"").toLowerCase()})).filter(r=>r.modelo||r.sn);
  if(!rows.length){A.toast("No encontré filas. Usa las columnas Modelo, Edificio y SN (descarga la plantilla).");return}
  const {error}=await A.sb.from("eq_etiquetas").insert(rows);if(error){A.toast(error.message);return}
  A.toast(`${rows.length} etiqueta${rows.length===1?"":"s"} importada${rows.length===1?"":"s"}`);load();
}
function plantilla(){
  if(!window.XLSX){A.toast("No se cargó el generador de Excel. Recarga la página.");return}
  const aj=ajustes();const ws=XLSX.utils.aoa_to_sheet([[cap(lbl(aj,"c1")),cap(lbl(aj,"c2")),lbl(aj,"c3"),"QR (opcional)","Copias"],["XXXXXX","B1","12345678","",1]]);ws["!cols"]=[{wch:22},{wch:12},{wch:18},{wch:30},{wch:8}];
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Etiquetas");XLSX.writeFile(wb,"Plantilla_etiquetas.xlsx");
}
function desdeEquipos(){
  const root=$("#modal-root"),eqs=A.eq().filter(e=>e.estado!=="baja"),ya=new Set(T.rows.map(r=>r.equipo_id).filter(Boolean));
  root.innerHTML=`<div class="modal-scrim"><div class="panel modal" role="dialog" aria-modal="true" aria-labelledby="eqx-t" style="width:min(640px,100%)">
    <div class="ph"><h3 id="eqx-t">Etiquetas desde equipos registrados</h3><button class="btn" id="eqx-x">Cancelar</button></div>
    <div class="pb" style="display:grid;gap:10px"><p class="small muted" style="margin:0">Modelo = modelo del equipo (o su tipo), Edificio = su sitio, SN = número de serie (o código).</p>
    <div class="scroll" style="max-height:50vh"><table><thead><tr><th><input type="checkbox" id="eqx-all" aria-label="Todos"></th><th>Código</th><th>Modelo</th><th>Edificio</th><th>SN</th></tr></thead><tbody>
    ${eqs.map(e=>`<tr><td><input type="checkbox" data-eqx="${esc(e.id)}" ${ya.has(e.id)?"":"checked"}></td><td><b>${esc(e.id)}</b>${ya.has(e.id)?' <span class="chip">ya en la lista</span>':""}</td><td>${esc(e.modelo||e.tipo||"")}</td><td>${esc(A.sitioCorto(e.sitio||"")||"")}</td><td class="mono">${esc(e.serial||e.id)}</td></tr>`).join("")||'<tr><td colspan="5" class="empty">No hay equipos registrados.</td></tr>'}</tbody></table></div>
    <div class="row" style="justify-content:flex-end"><button class="btn primary" id="eqx-ok">Agregar al listado</button></div></div></div></div>`;
  $("#eqx-x").onclick=()=>root.innerHTML="";
  $("#eqx-all").onchange=e=>root.querySelectorAll("[data-eqx]").forEach(c=>c.checked=e.target.checked);
  $("#eqx-ok").onclick=async()=>{const ids=[...root.querySelectorAll("[data-eqx]:checked")].map(c=>c.dataset.eqx);if(!ids.length){root.innerHTML="";return}
    const rows=ids.map(id=>{const e=A.eq().find(x=>x.id===id);return{modelo:e.modelo||e.tipo||"",edificio:A.sitioCorto(e.sitio||"")||"",sn:e.serial||e.id,equipo_id:e.id,creado_email:(A.S.session.user.email||"").toLowerCase()}});
    const {error}=await A.sb.from("eq_etiquetas").insert(rows);if(error){A.toast(error.message);return}root.innerHTML="";A.toast(`${rows.length} agregadas`);load()};
}
function cambiarEdificio(){
  const aj=ajustes(),n=lbl(aj,"c2").toLowerCase(),ids=[...T.sel],root=$("#modal-root");
  root.innerHTML=`<div class="modal-scrim"><div class="panel modal" role="dialog" aria-modal="true" aria-labelledby="ce-t" style="width:min(420px,100%)">
    <div class="ph"><h3 id="ce-t">Cambiar ${esc(n)}</h3><button class="btn" id="ce-x">Cancelar</button></div>
    <form class="pb" id="f-ce" style="display:grid;gap:12px"><p class="small muted" style="margin:0">Se aplica a las ${ids.length} etiquetas marcadas.</p>
      <div class="field"><label for="ce-v">Nuevo valor</label><input type="text" id="ce-v" list="etq-edifs" required maxlength="40"></div>
      <div class="row" style="justify-content:flex-end"><button class="btn primary">Aplicar</button></div></form></div></div>`;
  $("#ce-x").onclick=()=>root.innerHTML="";$("#ce-v").focus();
  $("#f-ce").onsubmit=async e=>{e.preventDefault();const v=$("#ce-v").value.trim();const {error}=await A.sb.from("eq_etiquetas").update({edificio:v}).in("id",ids);
    if(error){A.toast(error.message);return}T.rows.forEach(r=>{if(T.sel.has(r.id))r.edificio=v});root.innerHTML="";A.toast(`${ids.length} actualizadas`);A.rerender()};
}
async function subirLogo(file){
  const url=await new Promise(ok=>{const fr=new FileReader();fr.onload=()=>ok(fr.result);fr.readAsDataURL(file)});
  const img=await new Promise((ok,ko)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=ko;i.src=url});
  const s=Math.min(1,400/Math.max(img.width,img.height)),cv=document.createElement("canvas");cv.width=Math.round(img.width*s);cv.height=Math.round(img.height*s);
  cv.getContext("2d").drawImage(img,0,0,cv.width,cv.height);return cv.toDataURL("image/png");
}

/* ---------- eventos ---------- */
function bind(root){
  root.addEventListener("click",async e=>{
    const t=e.target;
    if(t.id==="etq-add"){const {error}=await A.sb.from("eq_etiquetas").insert({modelo:"",edificio:"",sn:"",creado_email:(A.S.session.user.email||"").toLowerCase()});if(error)A.toast(error.message);else load();return}
    if(t.id==="etq-eq"){desdeEquipos();return}
    if(t.id==="etq-tpl"){plantilla();return}
    if(t.id==="etq-pdf"){generarPDF();return}
    if(t.id==="etq-nologo"){await A.saveCfg({titulo:ajustes().titulo,qr:ajustes().qr,logo:""});return}
    if(t.id==="etq-edsel"){cambiarEdificio();return}
    if(t.id==="etq-delsel"){if(t.dataset.c!=="1"){t.dataset.c="1";t.textContent="¿Seguro? Clic de nuevo";return}
      const ids=[...T.sel];const {error}=await A.sb.from("eq_etiquetas").delete().in("id",ids);if(error){A.toast(error.message);return}T.sel.clear();load();return}
    const d=t.closest("[data-etqdel]");if(d){if(d.dataset.c!=="1"){d.dataset.c="1";d.textContent="¿?";return}const {error}=await A.sb.from("eq_etiquetas").delete().eq("id",d.dataset.etqdel);if(error)A.toast(error.message);else{T.sel.delete(d.dataset.etqdel);load()}return}
    const tr=t.closest("tr[data-etq]");if(tr&&T.prev!==tr.dataset.etq){T.prev=tr.dataset.etq;root.querySelectorAll("tr.etq-on").forEach(x=>x.classList.remove("etq-on"));tr.classList.add("etq-on");preview()}
  });
  root.addEventListener("change",async e=>{
    const t=e.target;
    if(t.id==="etq-all"){T.sel=t.checked?new Set(T.rows.map(r=>r.id)):new Set();A.rerender();return}
    if(t.dataset.etqsel){t.checked?T.sel.add(t.dataset.etqsel):T.sel.delete(t.dataset.etqsel);A.rerender();return}
    if(t.dataset.etqf){const id=t.closest("tr").dataset.etq,k=t.dataset.etqf;let v=t.value.trim();if(k==="copias")v=Math.min(99,Math.max(1,parseInt(v)||1));
      const r=T.rows.find(x=>x.id===id);if(r)r[k]=v;const {error}=await A.sb.from("eq_etiquetas").update({[k]:v}).eq("id",id);if(error)A.toast(error.message);
      if(k==="copias")A.rerender();else{T.prev=id;preview()}return}
    if(t.id==="etq-file"&&t.files[0]){await importar(t.files[0]);t.value="";return}
    if(t.id==="etq-logo"&&t.files[0]){try{const logo=await subirLogo(t.files[0]);await A.saveCfg({...ajustes(),logo})}catch(_){A.toast("No se pudo leer la imagen")}return}
    if(t.id==="etq-tit"||t.id==="etq-qr"||t.dataset.etqaj){const def={c1:"MODELO",c2:"EDIFICIO",c3:"SN"};
      await A.saveCfg({...ajustes(),titulo:$("#etq-tit").value.trim()||"CONTROL DE PRODUCCIÓN",qr:$("#etq-qr").value,...Object.fromEntries(Object.keys(def).map(k=>[k,$("#etq-"+k).value.trim()||def[k]]))});return}
    if(t.id==="etq-w"){const w=Math.min(200,Math.max(30,+t.value||90));T.page.ancho=w;T.page.alto=Math.round(w*660/1180*10)/10;savePage();A.rerender();return}
    if(t.id==="etq-hoja"){T.page.hoja=t.value;savePage();A.rerender();return}
    if(t.id==="etq-corte"){T.page.corte=t.checked;savePage();return}
  });
  root.addEventListener("input",e=>{const t=e.target;if(t.dataset&&t.dataset.etqf&&t.dataset.etqf!=="copias"){const id=t.closest("tr").dataset.etq,r=T.rows.find(x=>x.id===id);if(r){r[t.dataset.etqf]=t.value;T.prev=id;clearTimeout(T.pt);T.pt=setTimeout(preview,120)}}});
}

window.CPET={
  render(root,api){A=api;
    if(!T.loaded){root.innerHTML='<div class="panel empty">Cargando etiquetas…</div>';load();return}
    if(T.error){root.innerHTML=`<div class="banner">No se pudo cargar el listado de etiquetas: ${esc(T.error.message)}. Ejecuta supabase/etiquetas.sql.</div>`;return}
    T.page.alto=Math.round(T.page.ancho*660/1180*10)/10;
    if(T.prev&&!T.rows.some(r=>r.id===T.prev))T.prev=null;
    root.innerHTML=vista();if(!root.dataset.etqBound){root.dataset.etqBound="1";bind(root)}
    preview();
  },
  dibujar // para pruebas
};
})();
