(()=>{
'use strict';
const NS='http://www.w3.org/2000/svg', HEAD=32, KEY='nodenotes.v1';
const $=s=>document.querySelector(s);
const stage=$('#stage'),bg=$('#bg'),world=$('#world'),wires=$('#wires'),boxEl=$('#boxsel'),side=$('#side'),toggleBtn=$('#toggle');
const uid=()=>Math.random().toString(36).slice(2,9);
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const hexA=(h,a)=>{const n=parseInt(h.slice(1),16);return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`};
const SUPABASE_URL = 'https://gfsaneenutevnjidgjio.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_HStLYFdTUVyUOAb8Hi-eBg__gXq_6xG';

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const TYPES={
  note:{label:'Note',color:'#2f6c94',w:240,h:96},
  idea:{label:'Idea',color:'#b8772a',w:240,h:96},
  task:{label:'Task',color:'#2a8b6e',w:240,h:70},
  question:{label:'Question',color:'#8a4f9e',w:240,h:96},
  decision:{label:'Decision',color:'#b0403f',w:240,h:96},
  frame:{label:'Frame',color:'#7a7a7a',w:420,h:280}
};
const COLORS=['#2f6c94','#2a8b6e','#b8772a','#b0403f','#8a4f9e','#a8456f','#8c8a2a','#5a5a5a'];

/* ---------------- state ---------------- */
let S={nodes:[],links:[],view:{x:0,y:0,z:1}};
let sel=new Set(), activeId=null, selLink=null, tool='pan';
const els=new Map(), linkEls=new Map();
const byId=id=>S.nodes.find(n=>n.id===id);
const visW=()=>innerWidth-(side.classList.contains('closed')?0:side.offsetWidth);

/* ---------------- history + save ---------------- */
let hist=[],hi=-1,saveT=0;
const snap=()=>JSON.stringify({nodes:S.nodes,links:S.links});
async function saveCloud(){
  try{
    const {data:{user}}=await db.auth.getUser();
    if(!user)return;

    const {error}=await db.from('node_documents').upsert({
      user_id:user.id,
      data:S,
      updated_at:new Date().toISOString()
    });

    if(error)console.error('Cloud save error:',error);
  }catch(e){
    console.error('Cloud save error:',e);
  }
}

function save(){
  try{
    localStorage.setItem(KEY,JSON.stringify(S));
  }catch(e){}

  saveCloud();
}

function saveSoon(){
  clearTimeout(saveT);
  saveT=setTimeout(save,400);
}
function commit(){
  const s=snap(); if(hist[hi]===s){save();return}
  hist=hist.slice(0,hi+1); hist.push(s); if(hist.length>120)hist.shift();
  hi=hist.length-1; save(); refreshPanel();
}
function restore(s){
  const o=JSON.parse(s); S.nodes=o.nodes; S.links=o.links;
  sel=new Set([...sel].filter(id=>byId(id))); if(!byId(activeId))activeId=null; selLink=null;
  renderAll(); save();
}
function undo(){if(hi>0){hi--;restore(hist[hi])}}
function redo(){if(hi<hist.length-1){hi++;restore(hist[hi])}}

/* ---------------- toast ---------------- */
let toastT=0;
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('show'),1900)}

/* ---------------- view ---------------- */
let vq=0, animId=0, inertiaId=0;
function applyView(){
  const v=S.view;
  world.style.transform=`translate(${v.x}px,${v.y}px) scale(${v.z})`;
  const g=24*v.z, G=g*5;
  const minorA=g<9?0:1;
  bg.style.backgroundImage=
    `radial-gradient(circle,#464646 ${Math.max(1.1,1.5*v.z)}px,transparent ${Math.max(1.5,2*v.z)}px),`+
    `radial-gradient(circle,rgba(50,50,50,${minorA}) ${Math.max(.9,1.1*v.z)}px,transparent ${Math.max(1.3,1.5*v.z)}px)`;
  bg.style.backgroundSize=`${G}px ${G}px,${g}px ${g}px`;
  bg.style.backgroundPosition=`${v.x}px ${v.y}px,${v.x}px ${v.y}px`;
  const p=Math.round(v.z*100); $('#pct').textContent=p+'%'; $('#zoom').value=p;
  updateXBtn(); saveSoon();
}
function requestView(){if(!vq)vq=requestAnimationFrame(()=>{vq=0;applyView()})}
function toWorld(cx,cy){const v=S.view;return{x:(cx-v.x)/v.z,y:(cy-v.y)/v.z}}
function zoomAt(cx,cy,f){
  const v=S.view,nz=clamp(v.z*f,.15,3);
  v.x=cx-(cx-v.x)*(nz/v.z); v.y=cy-(cy-v.y)*(nz/v.z); v.z=nz; requestView();
}
function animateTo(t,dur=320){
  cancelAnimationFrame(animId); cancelAnimationFrame(inertiaId);
  const s={...S.view},t0=performance.now();
  const step=now=>{
    const k=Math.min(1,(now-t0)/dur),e=1-Math.pow(1-k,3);
    S.view.x=s.x+(t.x-s.x)*e; S.view.y=s.y+(t.y-s.y)*e; S.view.z=s.z+(t.z-s.z)*e;
    applyView(); if(k<1)animId=requestAnimationFrame(step);
  };
  animId=requestAnimationFrame(step);
}
function fitTarget(){
  const W=visW(),H=innerHeight;
  if(!S.nodes.length)return{x:W/2,y:H/2,z:1};
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for(const n of S.nodes){
    const h=n.type==='frame'?n.h:(els.get(n.id)?els.get(n.id).offsetHeight:n.h+HEAD+12);
    x0=Math.min(x0,n.x);y0=Math.min(y0,n.y);x1=Math.max(x1,n.x+n.w);y1=Math.max(y1,n.y+h);
  }
  const pad=50,bw=x1-x0,bh=y1-y0;
  const z=clamp(Math.min((W-pad*2)/bw,(H-pad*2)/bh),.15,1.4);
  return{x:(W-bw*z)/2-x0*z,y:(H-bh*z)/2-y0*z,z};
}
function frameAll(anim=true){const t=fitTarget();if(anim)animateTo(t);else{S.view=t;applyView()}}
function zoomTo(nz,anim){
  const v=S.view,cx=visW()/2,cy=innerHeight/2; nz=clamp(nz,.15,3);
  const t={x:cx-(cx-v.x)*(nz/v.z),y:cy-(cy-v.y)*(nz/v.z),z:nz};
  if(anim)animateTo(t,220);else{S.view=t;applyView()}
}
function ensureVisible(n){
  const v=S.view,el=els.get(n.id),h=el?el.offsetHeight:100;
  const sx=n.x*v.z+v.x,sy=n.y*v.z+v.y,ex=sx+n.w*v.z,ey=sy+h*v.z;
  if(sx>20&&sy>20&&ex<visW()-20&&ey<innerHeight-20)return;
  animateTo({x:visW()/2-(n.x+n.w/2)*v.z,y:innerHeight/2-(n.y+h/2)*v.z,z:v.z},300);
}

/* ---------------- links ---------------- */
const bez=(x1,y1,x2,y2)=>{const d=Math.max(40,Math.abs(x2-x1)*.5);return `M${x1} ${y1}C${x1+d} ${y1},${x2-d} ${y2},${x2} ${y2}`};
const sockPos=(n,out)=>({x:out?n.x+n.w:n.x,y:n.y+HEAD/2});
const tmp=document.createElementNS(NS,'path'); tmp.id='tmp'; tmp.style.display='none';
const xbtn=document.createElementNS(NS,'g'); xbtn.setAttribute('class','link-x'); xbtn.style.display='none';
xbtn.innerHTML='<circle r="11"/><path d="M-4 -4L4 4M4 -4L-4 4"/>';
wires.append(tmp,xbtn);
xbtn.addEventListener('click',()=>{if(selLink)removeLink(selLink)});

function updateXBtn(){
  const l=selLink&&S.links.find(k=>k.id===selLink);
  if(!l){xbtn.style.display='none';return}
  const a=byId(l.from),b=byId(l.to); if(!a||!b){xbtn.style.display='none';return}
  const p=sockPos(a,true),q=sockPos(b,false);
  const s=1/clamp(S.view.z,.6,1.6);
  xbtn.setAttribute('transform',`translate(${(p.x+q.x)/2} ${(p.y+q.y)/2}) scale(${s})`);
  xbtn.style.display='';
}
function updateLinks(){
  const ids=new Set(S.links.map(l=>l.id));
  for(const [id,g] of linkEls) if(!ids.has(id)){g.remove();linkEls.delete(id)}
  const hasIn=new Set(),hasOut=new Set();
  for(const l of S.links){
    const a=byId(l.from),b=byId(l.to); if(!a||!b)continue;
    hasOut.add(a.id);hasIn.add(b.id);
    let g=linkEls.get(l.id);
    if(!g){
      g=document.createElementNS(NS,'g'); g.dataset.id=l.id;
      g.innerHTML='<path class="link-hit"></path><path class="link"></path>';
      wires.insertBefore(g,tmp); linkEls.set(l.id,g);
    }
    const p=sockPos(a,true),q=sockPos(b,false),d=bez(p.x,p.y,q.x,q.y);
    g.children[0].setAttribute('d',d);
    const vis=g.children[1]; vis.setAttribute('d',d); vis.setAttribute('stroke',a.color);
    vis.classList.toggle('hl',sel.has(a.id)||sel.has(b.id));
    g.classList.toggle('sel',selLink===l.id);
  }
  els.forEach((el,id)=>{el.classList.toggle('hasIn',hasIn.has(id));el.classList.toggle('hasOut',hasOut.has(id))});
  updateXBtn();
}
function connect(a,b){
  if(a===b||S.links.some(l=>l.from===a&&l.to===b))return false;
  S.links.push({id:uid(),from:a,to:b}); return true;
}
function removeLink(id){
  S.links=S.links.filter(l=>l.id!==id); if(selLink===id)selLink=null;
  updateLinks(); commit();
}

/* ---------------- nodes ---------------- */
const arrowSvg='<span class="arrow"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 3l3 4 3-4z" fill="currentColor"/></svg></span>';
function buildEl(n){
  const isF=n.type==='frame';
  const el=document.createElement('div');
  el.className='node'+(isF?' frame':''); el.dataset.id=n.id;
  el.innerHTML=
    `<div class="head">${isF?'':arrowSvg}${n.type==='task'?'<span class="chk"></span>':''}<span class="title"></span></div>`+
    (isF?'':'<div class="body"><textarea spellcheck="false" placeholder="Isulat dito ang plano mo…"></textarea></div><div class="sock in"><i></i></div><div class="sock out"><i></i></div>')+
    '<div class="resize"></div>';
  el.querySelector('.title').textContent=n.title;
  if(!isF){
    const ta=el.querySelector('textarea'); ta.value=n.text||'';
    ta.addEventListener('input',()=>{n.text=ta.value;saveSoon()});
    ta.addEventListener('change',commit);
    el.querySelector('.arrow').addEventListener('click',()=>{n.collapsed=!n.collapsed;applyNode(n);commit()});
  }
  const chk=el.querySelector('.chk');
  if(chk)chk.addEventListener('click',()=>{n.done=!n.done;applyNode(n);commit()});
  world.appendChild(el); els.set(n.id,el); applyNode(n); return el;
}
function applyNode(n){
  const el=els.get(n.id); if(!el)return;
  el.style.left=n.x+'px'; el.style.top=n.y+'px'; el.style.width=n.w+'px';
  el.style.setProperty('--c',n.color);
  el.classList.toggle('collapsed',!!n.collapsed&&n.type!=='frame');
  el.classList.toggle('done',!!n.done);
  if(n.type==='frame'){
    el.style.height=n.h+'px'; el.style.setProperty('--ca',hexA(n.color,.32));
    el.style.background=hexA(n.color,.1); el.style.borderColor=hexA(n.color,.8);
  }else el.querySelector('textarea').style.height=n.h+'px';
}
function makeNode(type,x,y,extra={}){
  const T=TYPES[type];
  const n={id:uid(),type,x:Math.round(x),y:Math.round(y),w:T.w,h:T.h,title:T.label,text:'',color:T.color,collapsed:false,done:false,...extra};
  S.nodes.push(n); buildEl(n); return n;
}
function renderAll(){
  els.forEach(e=>e.remove()); els.clear();
  linkEls.forEach(g=>g.remove()); linkEls.clear();
  S.nodes.forEach(buildEl); refreshSel();
}
function selectOnly(id){sel=new Set(id?[id]:[]);activeId=id||null;selLink=null;refreshSel()}
function refreshSel(){
  els.forEach((el,id)=>{el.classList.toggle('sel',sel.has(id));el.classList.toggle('active',id===activeId&&sel.has(id))});
  updateLinks(); refreshPanel();
}
function deleteSelected(){
  if(selLink){removeLink(selLink);return}
  if(!sel.size)return;
  S.nodes=S.nodes.filter(n=>{if(sel.has(n.id)){els.get(n.id).remove();els.delete(n.id);return false}return true});
  S.links=S.links.filter(l=>!sel.has(l.from)&&!sel.has(l.to));
  sel.clear();activeId=null;refreshSel();commit();
}
function duplicateSelected(){
  if(!sel.size)return;
  const map=new Map(),ids=[...sel];
  for(const id of ids){
    const o=byId(id); const n={...JSON.parse(JSON.stringify(o)),id:uid(),x:o.x+32,y:o.y+32};
    S.nodes.push(n); buildEl(n); map.set(id,n.id);
  }
  for(const l of [...S.links]) if(map.has(l.from)&&map.has(l.to)) S.links.push({id:uid(),from:map.get(l.from),to:map.get(l.to)});
  sel=new Set(map.values()); activeId=map.get(ids[ids.length-1]); selLink=null; refreshSel(); commit();
}
function editTitle(id){
  const n=byId(id),el=els.get(id); if(!n||!el)return;
  const span=el.querySelector('.title'); if(!span)return;
  const inp=document.createElement('input'); inp.className='title-edit'; inp.value=n.title;
  span.replaceWith(inp); inp.focus(); inp.select();
  let done=false;
  const finish=()=>{
    if(done)return; done=true;
    n.title=inp.value.trim()||n.title;
    const s=document.createElement('span'); s.className='title'; s.textContent=n.title; inp.replaceWith(s);
    commit();
  };
  inp.addEventListener('blur',finish);
  inp.addEventListener('keydown',e=>{
    if(e.key==='Enter')inp.blur();
    if(e.key==='Escape'){inp.value=n.title;inp.blur()}
    e.stopPropagation();
  });
}

/* ---------------- sidebar wiring ---------------- */
const addGrid=$('#addGrid'),optConnect=$('#optConnect'),optSnap=$('#optSnap');
['note','idea','task','question','decision','frame'].forEach(t=>{
  const b=document.createElement('button'); b.className='btn';
  b.innerHTML=`<span class="chip" style="background:${TYPES[t].color}"></span>${TYPES[t].label}`;
  b.addEventListener('click',()=>addFromPanel(t)); addGrid.appendChild(b);
});
const swBox=$('#swatches');
COLORS.forEach(c=>{
  const b=document.createElement('button'); b.style.background=c; b.dataset.c=c;
  b.addEventListener('click',()=>{
    if(!sel.size)return;
    sel.forEach(id=>{const n=byId(id);n.color=c;applyNode(n)});
    updateLinks();refreshPanel();commit();
  });
  swBox.appendChild(b);
});
function refreshPanel(){
  const n=activeId&&sel.has(activeId)?byId(activeId):null;
  $('#nodeBody').classList.toggle('off',!n);
  $('#nodeHint').style.display=n?'none':'';
  if(n){
    if(document.activeElement!==$('#nameInput'))$('#nameInput').value=n.title;
    swBox.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.c===n.color));
    $('#btnCollapse').disabled=n.type==='frame';
    $('#btnCollapse').textContent=n.collapsed?'Expand':'Collapse';
  }
  $('#btnUndo').disabled=hi<=0; $('#btnRedo').disabled=hi>=hist.length-1;
  const c=sel.size>1?` · ${sel.size} selected`:'';
  $('#stats').textContent=`${S.nodes.length} nodes · ${S.links.length} wires${c}`;
}
$('#nameInput').addEventListener('input',e=>{
  const n=byId(activeId); if(!n)return; n.title=e.target.value;
  const t=els.get(n.id).querySelector('.title'); if(t)t.textContent=n.title||' ';
});
$('#nameInput').addEventListener('change',commit);
$('#nameInput').addEventListener('keydown',e=>{if(e.key==='Enter')e.target.blur();e.stopPropagation()});
$('#btnCollapse').addEventListener('click',()=>{const n=byId(activeId);if(n&&n.type!=='frame'){n.collapsed=!n.collapsed;applyNode(n);refreshPanel();commit()}});
$('#btnDup').addEventListener('click',duplicateSelected);
$('#btnDel').addEventListener('click',deleteSelected);
$('#btnUndo').addEventListener('click',undo);
$('#btnRedo').addEventListener('click',redo);
$('#btnFrame').addEventListener('click',()=>frameAll(true));
$('#btnReset').addEventListener('click',()=>zoomTo(1,true));
$('#zIn').addEventListener('click',()=>zoomTo(S.view.z*1.25,true));
$('#zOut').addEventListener('click',()=>zoomTo(S.view.z/1.25,true));
$('#zoom').addEventListener('input',e=>zoomTo(e.target.value/100,false));
function setTool(t){tool=t;$('#toolPan').classList.toggle('on',t==='pan');$('#toolBox').classList.toggle('on',t==='box');stage.classList.toggle('box',t==='box')}
$('#toolPan').addEventListener('click',()=>setTool('pan'));
$('#toolBox').addEventListener('click',()=>setTool('box'));
document.querySelectorAll('.ph').forEach(h=>h.addEventListener('click',()=>h.parentElement.classList.toggle('closed')));
function setSide(open){side.classList.toggle('closed',!open);document.body.classList.toggle('side-closed',!open)}
toggleBtn.addEventListener('click',()=>setSide(side.classList.contains('closed')));

$('#btnExport').addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify(S,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='node-notes.json';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),2000);
  toast('Na-export ang node-notes.json');
});
$('#btnImport').addEventListener('click',()=>$('#file').click());
$('#file').addEventListener('change',e=>{
  const f=e.target.files[0]; if(!f)return;
  const r=new FileReader();
  r.onload=()=>{
    try{
      const o=JSON.parse(r.result);
      if(!Array.isArray(o.nodes)||!Array.isArray(o.links))throw 0;
      S.nodes=o.nodes;S.links=o.links;sel.clear();activeId=null;selLink=null;renderAll();commit();frameAll(false);toast('Na-import na');
    }catch(err){toast('Hindi valid na node-notes file')}
  };
  r.readAsText(f); e.target.value='';
});
let clearArm=0;
$('#btnClear').addEventListener('click',e=>{
  const b=e.currentTarget;
  if(!clearArm){b.textContent='Sure ka ba? Tap ulit';b.classList.add('armed');clearArm=setTimeout(()=>{clearArm=0;b.textContent='Clear all';b.classList.remove('armed')},3000);return}
  clearTimeout(clearArm);clearArm=0;b.textContent='Clear all';b.classList.remove('armed');
  S.nodes=[];S.links=[];sel.clear();activeId=null;selLink=null;renderAll();commit();toast('Nabura lahat. May Undo pa.');
});

function addFromPanel(type){
  const T=TYPES[type],vw=visW(),c=toWorld(vw/2,innerHeight/2),k=S.nodes.length%4;
  let x=c.x-T.w/2+k*18,y=c.y-T.h/2+k*18,parent=null;
  const a=activeId&&sel.has(activeId)?byId(activeId):null;
  if(optConnect.checked&&a&&a.type!=='frame'&&type!=='frame'){
    parent=a; const outs=S.links.filter(l=>l.from===a.id).length;
    x=a.x+a.w+90; y=a.y+outs*(T.h+HEAD+44);
  }
  const n=makeNode(type,x,y);
  if(parent)connect(parent.id,n.id);
  selectOnly(n.id); commit(); ensureVisible(n);
  if(matchMedia('(pointer:fine)').matches){const ta=els.get(n.id).querySelector('textarea');if(ta)setTimeout(()=>ta.focus(),0)}
}

/* ---------------- pointer interaction ---------------- */
let drag=null,pinch=null,lastTap=null,lastHead=null;
const touches=new Map();
const blurField=()=>{const a=document.activeElement;if(a&&(a.tagName==='TEXTAREA'||a.tagName==='INPUT'))a.blur()};

stage.addEventListener('pointerdown',e=>{
  if(e.pointerType==='mouse'&&e.button!==0)return;
  cancelAnimationFrame(inertiaId); cancelAnimationFrame(animId);
  const t=e.target;
  if(t.closest('.link-x'))return;
  if(e.pointerType==='touch'){
    touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(touches.size===2){startPinch();return}
    if(touches.size>2)return;
  }
  const sock=t.closest('.sock');
  if(sock){
    e.preventDefault(); blurField();
    const id=sock.closest('.node').dataset.id;
    drag={type:'wire',id,out:sock.classList.contains('out'),sx:e.clientX,sy:e.clientY,moved:false,over:null};
    tmp.style.display=''; drawTmp(e.clientX,e.clientY); return;
  }
  const rz=t.closest('.resize');
  if(rz){
    e.preventDefault(); blurField();
    const n=byId(rz.closest('.node').dataset.id);
    if(!sel.has(n.id))selectOnly(n.id);
    drag={type:'resize',n,sx:e.clientX,sy:e.clientY,w:n.w,h:n.h,moved:false}; return;
  }
  const nodeEl=t.closest('.node');
  if(nodeEl){
    const id=nodeEl.dataset.id, field=t.closest('textarea,input');
    if(e.shiftKey&&!field){
      if(sel.has(id)){sel.delete(id);if(activeId===id)activeId=null;refreshSel();return}
      sel.add(id);
    }else if(!sel.has(id))sel=new Set([id]);
    activeId=id; selLink=null; refreshSel();
    if(field||t.closest('.arrow')||t.closest('.chk'))return;
    e.preventDefault(); blurField();
    startNodeDrag(e,id); return;
  }
  const lh=t.closest('.link-hit');
  if(lh){e.preventDefault();sel.clear();activeId=null;selLink=lh.parentNode.dataset.id;refreshSel();return}
  /* background */
  blurField();
  if(tool==='box'||(e.shiftKey&&e.pointerType==='mouse')){
    drag={type:'box',sx:e.clientX,sy:e.clientY,add:e.shiftKey,moved:false};
    boxEl.style.display='block';updateBox(e.clientX,e.clientY);
  }else{
    const now=performance.now();
    drag={type:'pan',sx:e.clientX,sy:e.clientY,vx:S.view.x,vy:S.view.y,moved:false,
      last:{x:e.clientX,y:e.clientY,t:now},vel:{x:0,y:0}};
    stage.classList.add('panning');
  }
});

function startNodeDrag(e,id){
  const set=new Set(sel);
  for(const fid of sel){
    const f=byId(fid); if(!f||f.type!=='frame')continue;
    for(const n of S.nodes){
      if(n.type==='frame')continue;
      const el=els.get(n.id),h=el?el.offsetHeight:n.h;
      const cx=n.x+n.w/2,cy=n.y+h/2;
      if(cx>f.x&&cx<f.x+f.w&&cy>f.y&&cy<f.y+f.h)set.add(n.id);
    }
  }
  drag={type:'node',id,sx:e.clientX,sy:e.clientY,moved:false,
    items:[...set].map(i=>{const n=byId(i);return{n,x:n.x,y:n.y}})};
}
function drawTmp(cx,cy){
  const n=byId(drag.id),p=sockPos(n,drag.out),w=toWorld(cx,cy);
  tmp.setAttribute('d',drag.out?bez(p.x,p.y,w.x,w.y):bez(w.x,w.y,p.x,p.y));
}
function updateBox(cx,cy){
  const x=Math.min(cx,drag.sx),y=Math.min(cy,drag.sy);
  Object.assign(boxEl.style,{left:x+'px',top:y+'px',width:Math.abs(cx-drag.sx)+'px',height:Math.abs(cy-drag.sy)+'px'});
}
function startPinch(){
  const p=[...touches.values()];
  pinch={d:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)||1,cx:(p[0].x+p[1].x)/2,cy:(p[0].y+p[1].y)/2,v:{...S.view}};
  if(drag&&drag.type==='wire')tmp.style.display='none';
  boxEl.style.display='none'; stage.classList.remove('panning'); drag=null;
}
function doPinch(){
  const p=[...touches.values()]; if(p.length<2)return;
  const d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)||1,cx=(p[0].x+p[1].x)/2,cy=(p[0].y+p[1].y)/2;
  const nz=clamp(pinch.v.z*d/pinch.d,.15,3);
  const wx=(pinch.cx-pinch.v.x)/pinch.v.z,wy=(pinch.cy-pinch.v.y)/pinch.v.z;
  S.view.z=nz;S.view.x=cx-wx*nz;S.view.y=cy-wy*nz;requestView();
}

window.addEventListener('pointermove',e=>{
  if(touches.has(e.pointerId))touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pinch){doPinch();return}
  if(!drag)return;
  const dx=e.clientX-drag.sx,dy=e.clientY-drag.sy;
  if(!drag.moved&&Math.hypot(dx,dy)>4)drag.moved=true;
  const z=S.view.z;
  switch(drag.type){
    case 'pan':{
      if(!drag.moved)break;
      S.view.x=drag.vx+dx;S.view.y=drag.vy+dy;
      const now=performance.now(),dt=Math.max(1,now-drag.last.t);
      drag.vel={x:(e.clientX-drag.last.x)/dt,y:(e.clientY-drag.last.y)/dt};
      drag.last={x:e.clientX,y:e.clientY,t:now};
      requestView();break;
    }
    case 'node':{
      if(!drag.moved)break;
      const snapOn=optSnap.checked,g=24;
      for(const it of drag.items){
        let x=it.x+dx/z,y=it.y+dy/z;
        if(snapOn){x=Math.round(x/g)*g;y=Math.round(y/g)*g}
        it.n.x=Math.round(x);it.n.y=Math.round(y);applyNode(it.n);
      }
      updateLinks();break;
    }
    case 'resize':{
      const n=drag.n,isF=n.type==='frame';
      n.w=Math.max(isF?160:150,Math.round(drag.w+dx/z));
      n.h=Math.max(isF?100:44,Math.round(drag.h+dy/z));
      applyNode(n);updateLinks();break;
    }
    case 'wire':{
      drawTmp(e.clientX,e.clientY);
      const el=document.elementFromPoint(e.clientX,e.clientY),ne=el&&el.closest('.node');
      const over=ne&&!ne.classList.contains('frame')&&ne.dataset.id!==drag.id?ne:null;
      if(drag.over!==over){if(drag.over)drag.over.classList.remove('drop');if(over)over.classList.add('drop');drag.over=over}
      break;
    }
    case 'box':updateBox(e.clientX,e.clientY);break;
  }
});

function endPointer(e){
  if(touches.has(e.pointerId)){
    touches.delete(e.pointerId);
    if(pinch){if(touches.size<2){pinch=null;drag=null;applyView();save()}return}
  }
  if(!drag)return;
  const d=drag; drag=null;
  stage.classList.remove('panning');
  switch(d.type){
    case 'pan':{
      if(d.moved){
        const age=performance.now()-d.last.t,sp=Math.hypot(d.vel.x,d.vel.y);
        if(e.pointerType==='touch'&&age<90&&sp>.25)inertia(d.vel.x*16,d.vel.y*16);
        else save();
      }else{
        if(!e.shiftKey){sel.clear();activeId=null;selLink=null;refreshSel()}
        const now=performance.now();
        if(lastTap&&now-lastTap.t<360&&Math.hypot(e.clientX-lastTap.x,e.clientY-lastTap.y)<24){
          const w=toWorld(e.clientX,e.clientY),T=TYPES.note;
          const n=makeNode('note',w.x-T.w/2,w.y-HEAD/2);
          selectOnly(n.id);commit();lastTap=null;
          if(matchMedia('(pointer:fine)').matches)setTimeout(()=>els.get(n.id).querySelector('textarea').focus(),0);
        }else lastTap={t:now,x:e.clientX,y:e.clientY};
      }
      break;
    }
    case 'node':{
      if(d.moved){commit();break}
      if(lastHead&&lastHead.id===d.id&&performance.now()-lastHead.t<380){
        lastHead=null;
        if(e.target&&(e.target.closest&&e.target.closest('.head')||true)){
          const el=els.get(d.id);
          if(el&&el.querySelector('.title'))editTitle(d.id);
        }
      }else lastHead={id:d.id,t:performance.now()};
      break;
    }
    case 'resize':if(d.moved)commit();break;
    case 'wire':{
      tmp.style.display='none';
      if(d.over)d.over.classList.remove('drop');
      const el=document.elementFromPoint(e.clientX,e.clientY),ne=el&&el.closest('.node');
      if(ne&&ne.dataset.id!==d.id&&!ne.classList.contains('frame')){
        const ok=d.out?connect(d.id,ne.dataset.id):connect(ne.dataset.id,d.id);
        if(ok){updateLinks();commit()}else toast('Konektado na sila');
      }else if(!ne&&d.moved&&Math.hypot(e.clientX-d.sx,e.clientY-d.sy)>28&&el&&!el.closest('#side,#toggle')){
        const w=toWorld(e.clientX,e.clientY),T=TYPES.note;
        const n=makeNode('note',d.out?w.x+10:w.x-T.w-10,w.y-HEAD/2);
        if(d.out)connect(d.id,n.id);else connect(n.id,d.id);
        selectOnly(n.id);commit();
      }
      break;
    }
    case 'box':{
      boxEl.style.display='none';
      if(!d.moved)break;
      const a=toWorld(Math.min(e.clientX,d.sx),Math.min(e.clientY,d.sy)),b=toWorld(Math.max(e.clientX,d.sx),Math.max(e.clientY,d.sy));
      const next=d.add?new Set(sel):new Set();
      for(const n of S.nodes){
        const el=els.get(n.id),h=n.type==='frame'?n.h:(el?el.offsetHeight:n.h);
        const inter=n.x<b.x&&n.x+n.w>a.x&&n.y<b.y&&n.y+h>a.y;
        const inside=n.x>=a.x&&n.x+n.w<=b.x&&n.y>=a.y&&n.y+h<=b.y;
        if(n.type==='frame'?inside:inter)next.add(n.id);
      }
      sel=next;activeId=[...sel].pop()||null;selLink=null;refreshSel();
      break;
    }
  }
}
window.addEventListener('pointerup',endPointer);
window.addEventListener('pointercancel',e=>{
  if(touches.has(e.pointerId)){touches.delete(e.pointerId);if(pinch&&touches.size<2){pinch=null}}
  if(drag){if(drag.type==='wire'){tmp.style.display='none';if(drag.over)drag.over.classList.remove('drop')}
    boxEl.style.display='none';stage.classList.remove('panning');drag=null}
});

function inertia(px,py){
  cancelAnimationFrame(inertiaId);
  const step=()=>{
    px*=.94;py*=.94;
    if(Math.hypot(px,py)<.3){save();return}
    S.view.x+=px;S.view.y+=py;applyView();inertiaId=requestAnimationFrame(step);
  };
  inertiaId=requestAnimationFrame(step);
}

stage.addEventListener('wheel',e=>{
  const ta=e.target.closest&&e.target.closest('textarea');
  if(ta&&document.activeElement===ta&&ta.scrollHeight>ta.clientHeight+1)return;
  e.preventDefault(); cancelAnimationFrame(animId); cancelAnimationFrame(inertiaId);
  let dy=e.deltaY; if(e.deltaMode===1)dy*=16;
  zoomAt(e.clientX,e.clientY,Math.exp(-dy*(e.ctrlKey?.01:.0016)));
},{passive:false});
stage.addEventListener('contextmenu',e=>{if(!e.target.closest('textarea,input'))e.preventDefault()});
document.addEventListener('gesturestart',e=>e.preventDefault());

/* ---------------- keyboard ---------------- */
window.addEventListener('keydown',e=>{
  const tag=document.activeElement&&document.activeElement.tagName;
  if(tag==='TEXTAREA'||tag==='INPUT'){if(e.key==='Escape')document.activeElement.blur();return}
  const mod=e.ctrlKey||e.metaKey,k=e.key.toLowerCase();
  if(mod&&k==='z'){e.preventDefault();e.shiftKey?redo():undo();return}
  if(mod&&k==='y'){e.preventDefault();redo();return}
  if(mod&&k==='a'){e.preventDefault();sel=new Set(S.nodes.map(n=>n.id));activeId=S.nodes.length?S.nodes[S.nodes.length-1].id:null;refreshSel();return}
  if(k==='delete'||k==='backspace'||(k==='x'&&!mod)){e.preventDefault();deleteSelected();return}
  if(e.shiftKey&&k==='d'){e.preventDefault();duplicateSelected();return}
  if(k==='home'){e.preventDefault();frameAll(true);return}
  if(k==='n'&&!mod){setSide(side.classList.contains('closed'));return}
  if(k==='escape'){sel.clear();activeId=null;selLink=null;refreshSel()}
});

/* ---------------- sample + init ---------------- */
async function loadCloud(){
  try{
    const {data:{user},error:userError}=await db.auth.getUser();

    if(userError||!user){
      console.error('Cloud user error:',userError);
      return {ok:false,state:null};
    }

    const {data,error}=await db
      .from('node_documents')
      .select('data')
      .eq('user_id',user.id)
      .maybeSingle();

    if(error){
      console.error('Cloud load error:',error);
      return {ok:false,state:null};
    }

    if(data?.data && Array.isArray(data.data.nodes) && Array.isArray(data.data.links)){
      return {ok:true,state:data.data};
    }

    return {ok:true,state:null};
  }catch(e){
    console.error('Cloud load error:',e);
    return {ok:false,state:null};
  }
}

async function init(){
  let localLoaded=null;

  try{
    const raw=localStorage.getItem(KEY);
    if(raw){
      const o=JSON.parse(raw);
      if(Array.isArray(o.nodes)&&Array.isArray(o.links)) localLoaded=o;
    }
  }catch(e){}

  setSide(innerWidth>=640);

  const cloud=await loadCloud();

  S=cloud.state||localLoaded||sample();

  if(!S.view)S.view={x:0,y:0,z:1};

  renderAll();
  hist=[snap()];
  hi=0;

  if(cloud.state||localLoaded) applyView();
  else frameAll(false);

  refreshPanel();

  if(cloud.ok && !cloud.state && localLoaded){
    await saveCloud();
  }
}

addEventListener('resize',()=>requestView());

async function setupLogin(){
  const loginScreen=document.getElementById('loginScreen');
  const loginEmail=document.getElementById('loginEmail');
  const loginPassword=document.getElementById('loginPassword');
  const confirmPassword=document.getElementById('confirmPassword');
  const loginBtn=document.getElementById('loginBtn');
  const signupBtn=document.getElementById('signupBtn');
  const loginError=document.getElementById('loginError');
  const authTitle=document.getElementById('authTitle');

  let signupMode=false;

  const {data:{session}}=await db.auth.getSession();

  if(session){
    loginScreen.style.display='none';
    await init();
  }

  signupBtn.addEventListener('click',async()=>{
    loginError.textContent='';

    if(!signupMode){
      signupMode=true;
      authTitle.textContent='Create Account';
      confirmPassword.style.display='block';
      loginBtn.textContent='Create Account';
      signupBtn.textContent='Back to Login';
      return;
    }

    const email=loginEmail.value.trim();
    const password=loginPassword.value;
    const confirm=confirmPassword.value;

    if(!email||!password){
      loginError.textContent='Please enter your email and password.';
      return;
    }

    if(password!==confirm){
      loginError.textContent='Passwords do not match.';
      return;
    }

    signupBtn.disabled=true;
    loginBtn.disabled=true;
    loginBtn.textContent='Creating account...';

    const {data,error}=await db.auth.signUp({
      email,
      password
    });

    if(error){
      loginError.textContent=error.message;
      signupBtn.disabled=false;
      loginBtn.disabled=false;
      loginBtn.textContent='Create Account';
      return;
    }

    if(data.session){
      loginScreen.style.display='none';
      await init();
      return;
    }

    loginError.style.color='#7ee787';
    loginError.textContent='Account created! Check your email to confirm your account.';

    signupBtn.disabled=false;
    loginBtn.disabled=false;
    loginBtn.textContent='Create Account';
  });

  loginBtn.addEventListener('click',async()=>{
    if(signupMode)return;

    loginError.style.color='#ff6b6b';
    loginError.textContent='';
    loginBtn.disabled=true;
    loginBtn.textContent='Logging in...';

    const {error}=await db.auth.signInWithPassword({
      email:loginEmail.value.trim(),
      password:loginPassword.value
    });

    if(error){
      loginError.textContent=error.message;
      loginBtn.disabled=false;
      loginBtn.textContent='Login';
      return;
    }

    loginScreen.style.display='none';
    loginBtn.disabled=false;
    loginBtn.textContent='Login';

    await init();
  });
}

setupLogin();
})();
