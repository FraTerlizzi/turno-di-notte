/* Motore del gioco: scena, display, audio, glossario, Neuro, eventi fuori turno. */
import { SKIN, DEATH, CASES, CHAPTERS, GL, SKINS, GOWN, HAIR, EVENTS, ABC_L, ABC_ACT } from './data/index.js';
import { hudValue } from './content/compile.js';

let curSkin=null;
function pickSkin(){return prog.costume!==false?SKINS[Math.floor(Math.random()*SKINS.length)]:null}
function skinTarget(){const st=hex2rgb(SKIN[TGT.pat.skin||'normal']);if(!curSkin)return st;const n=hex2rgb(SKIN.normal),b=hex2rgb(curSkin.base);return b.map((v,i)=>Math.max(0,Math.min(255,v+(st[i]-n[i])*.8)))}
function renderCostumeBtn(){document.querySelectorAll('.au-c').forEach(b=>{const on=prog.costume!==false;b.textContent=on?'Pazienti in costume: sì':'Pazienti in costume: no';b.classList.toggle('off',!on)})}
document.addEventListener('click',e=>{if(e.target.closest('.au-c')){prog.costume=prog.costume===false;save();renderCostumeBtn()}});
let PAT_MODE='bed',NURSE_TGT=null;

/* ===== Progresso ===== */
// il motore comunica all'esterno (account, sincronizzazione) solo tramite questi eventi: 'progress' e 'attempt'
export const gameEvents=new EventTarget();
let prog={best:{},xp:0},progKey='turno-notte';
try{const s=localStorage.getItem(progKey);if(s)prog=JSON.parse(s)}catch(e){}
// anteprima dall'editor: si gioca il caso in prova senza salvare progressi né registrare partite
let PREVIEW=false;
function save(){if(PREVIEW)return;try{localStorage.setItem(progKey,JSON.stringify(prog))}catch(e){}gameEvents.dispatchEvent(new CustomEvent('progress',{detail:prog}))}
// cambia giocatore: progressi e chiave di salvataggio locale
export function useProgress(key,data){progKey=key;prog={best:{},xp:0,...data};prog.best=prog.best||{};renderHome();renderCostumeBtn()}
export function getProgress(){return prog}
const emitAttempt=d=>PREVIEW||gameEvents.dispatchEvent(new CustomEvent('attempt',{detail:{...d,at:new Date().toISOString()}}));

/* ===== Stato animato ===== */
const CUR={vit:{},pat:{},phys:{}}, TGT={vit:{},pat:{},phys:{}};
const PAT0={pose:1,skin:'normal',eyes:1,sweat:0,tremor:0,hives:0,droop:0,collapsed:0};
function setState(st,instant){
  if(!st)return;
  if(st.vit)Object.assign(TGT.vit,st.vit);
  if(st.pat)Object.assign(TGT.pat,st.pat);
  if(st.phys){
    if(st.phys.mode&&st.phys.mode!==TGT.phys.mode){TGT.phys={...st.phys};CUR.phys={...st.phys};physInit();lensPop=0;}
    else Object.assign(TGT.phys,st.phys);
  }
  if(instant){CUR.vit={...TGT.vit};CUR.pat={...TGT.pat};CUR.phys={...TGT.phys};}
}
function hex2rgb(h){h=h.replace('#','');return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]}
let skinRGB=hex2rgb(SKIN.normal);
function stepTowards(dt){
  const k=Math.min(1,dt*1.6);
  for(const o of ['vit','pat','phys']){
    for(const key in TGT[o]){const t=TGT[o][key];
      if(typeof t==='number'){const c=CUR[o][key];CUR[o][key]=(typeof c==='number')?c+(t-c)*k:t;}
      else CUR[o][key]=t;}
  }
  const s=skinTarget();skinRGB=skinRGB.map((v,i)=>v+(s[i]-v)*k);
}

/* ===== Helper di disegno ===== */
const C={ink:'#eef0ff',muted:'#9aa3d6',line:'#343e7a',accent:'#ffc24a',hr:'#6fe39a',spo2:'#5cc8ff',bp:'#ff8b8b',rr:'#ffd84d',temp:'#d2a8ff',bad:'#ff6f7d'};
function rr(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect?ctx.roundRect(x,y,w,h,r):ctx.rect(x,y,w,h)}
function gauss(x,m,s){return Math.exp(-((x-m)**2)/(2*s*s))}

/* ---- FISIOLOGIA ---- */
let P=[];const R=Math.random;
const LABEL={glucose:'Fisiologia · glucosio e insulina',heart:'Fisiologia · ventricolo sinistro e valvola aortica',alveolus:'Fisiologia · alveolo e capillare',vessel:'Fisiologia · vaso sanguigno e tessuti',brain:'Anatomia · circolo cerebrale',myocyte:'Fisiologia · membrana della cellula cardiaca',brainstem:'Fisiologia · centri respiratori del bulbo'};
function physInit(){P=[];document.getElementById('physLabel').textContent=LABEL[TGT.phys.mode]||'Fisiologia';
  const m=TGT.phys.mode;
  if(m==='glucose')for(let i=0;i<70;i++)P.push({x:R()*420,y:50+R()*70,v:.4+R()*.8,inCell:false,kind:'g'});
  if(m==='alveolus')for(let i=0;i<40;i++)P.push({kind:R()<.6?'o':'c',t:R(),x:0,y:0});
  if(m==='vessel')for(let i=0;i<46;i++)P.push({x:R()*420,y:0,lane:R(),v:.6+R()*.6,kind:'rbc',burst:0});
  if(m==='heart')for(let i=0;i<40;i++)P.push({t:R(),kind:'flow'});
  if(m==='brain')for(let i=0;i<40;i++)P.push({t:R(),br:i%5});
  if(m==='myocyte')for(let i=0;i<90;i++)P.push({x:R()*420,y:0,side:R()<.5?'out':'in',vx:R()-.5,vy:R()-.5});
  if(m==='brainstem')for(let i=0;i<14;i++)P.push({slot:i,bound:R()});
}
function txt(ctx,s,x,y,col,size,w){ctx.fillStyle=col||C.muted;ctx.font=`${w||500} ${size||11}px "Atkinson Hyperlegible",sans-serif`;ctx.fillText(s,x,y)}
function drawPhys(t,dt){
  const ctx=phys.ctx,W=phys.W,H=phys.H,ph=CUR.phys;ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#081014';ctx.fillRect(0,0,W,H);
  const m=TGT.phys.mode;
  if(m==='glucose')physGlucose(ctx,t,dt,ph,W,H);
  else if(m==='heart')physHeart(ctx,t,dt,ph,W,H);
  else if(m==='alveolus')physAlv(ctx,t,dt,ph,W,H);
  else if(m==='vessel')physVessel(ctx,t,dt,ph,W,H);
  else if(m==='brain')physBrain(ctx,t,dt,ph,W,H);
  else if(m==='myocyte')physMyo(ctx,t,dt,ph,W,H);
  else if(m==='brainstem')physStem(ctx,t,dt,ph,W,H);
}
function physGlucose(ctx,t,dt,ph,W,H){
  // vaso
  ctx.fillStyle='#3a1418';rr(ctx,0,40,W,90,0);ctx.fill();
  ctx.strokeStyle='#6b2a30';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,40);ctx.lineTo(W,40);ctx.moveTo(0,130);ctx.lineTo(W,130);ctx.stroke();
  txt(ctx,'Sangue',10,56,'#f0a6a6',11,700);
  // cellule
  const cells=[[20,150,120,70,'Muscolo'],[150,150,120,70,'Fegato'],[280,150,124,70,'Neurone']];
  const glu=ph.glu||100,ins=ph.insulin||0,ket=ph.ketones||0;
  const energy=Math.max(0,Math.min(1,(glu-30)/70));
  cells.forEach(([x,y,w,h,n],i)=>{ctx.fillStyle=i===2?`rgba(120,160,255,${.12+.25*energy})`:'rgba(120,200,160,.12)';rr(ctx,x,y,w,h,14);ctx.fill();ctx.strokeStyle=i===2?`rgba(140,180,255,${.4+.5*energy})`:'#3c7a62';ctx.lineWidth=2;ctx.stroke();
    txt(ctx,n,x+8,y+h-8,C.muted,11,700);
    // canali
    for(let k=0;k<3;k++){const cx=x+20+k*38;ctx.fillStyle=ins>.3||i===2?'#5ad08a':'#3a4a4a';ctx.fillRect(cx,y-3,10,7);if(ins>.3&&i<2){ctx.fillStyle=C.accent;ctx.beginPath();ctx.arc(cx+5,y-9+Math.sin(t*3+k)*1.5,3.5,0,7);ctx.fill()}}
  });
  // particelle
  const target=Math.round(Math.min(70,glu/7));
  P.forEach((p,i)=>{if(i>=target)return;p.x+=p.v*dt*40;if(p.x>W)p.x=-6;
    const yy=p.y+Math.sin(t*2+i)*3;ctx.fillStyle='#ffd27a';ctx.beginPath();
    for(let k=0;k<6;k++){const an=k*Math.PI/3;ctx[k?'lineTo':'moveTo'](p.x+Math.cos(an)*3.4,yy+Math.sin(an)*3.4)}ctx.fill()});
  // flusso nelle cellule
  const n=Math.round((ins>.3?6:1)+2);
  for(let k=0;k<n;k++){const ph2=((t*.7+k/n)%1);const i=k%3;if(i<2&&ins<.3)continue;
    const x=[50,180,320][i]+((k*23)%60),y=128+ph2*40;ctx.fillStyle=`rgba(255,210,122,${1-ph2})`;ctx.beginPath();ctx.arc(x,y,3,0,7);ctx.fill()}
  // chetoni e potassio
  if(ket>.05){for(let k=0;k<Math.round(ket*16);k++){const x=(k*53+t*25)%W,y=70+((k*29)%50);ctx.fillStyle='#ff6b6b';ctx.font='700 9px "JetBrains Mono",monospace';ctx.fillText(k%2?'H⁺':'CC',x,y)}}
  if((ph.kshift||0)>.05){for(let k=0;k<Math.round(ph.kshift*8);k++){const ph2=(t*.5+k/8)%1;const x=40+k*12,y=150-ph2*30;ctx.fillStyle=`rgba(200,160,255,${1-ph2})`;ctx.font='700 9px "JetBrains Mono",monospace';ctx.fillText('K⁺',x,y)}}
  // indicatori
  txt(ctx,'Glicemia',W-150,14,C.muted,10);ctx.fillStyle=glu<70?C.bad:glu>250?C.accent:C.hr;ctx.font='700 18px "JetBrains Mono",monospace';ctx.fillText(Math.round(glu)+' mg/dL',W-150,34);
  ctx.font='700 18px "JetBrains Mono",monospace';
  txt(ctx,'Insulina '+(ins>.3?'presente':'assente'),12,34,ins>.3?C.accent:C.bad,11,700);
  txt(ctx,'Energia neurone',284,240,C.muted,10);ctx.fillStyle='#1b2a30';ctx.fillRect(284,244,120,6);ctx.fillStyle=energy<.4?C.bad:C.spo2;ctx.fillRect(284,244,120*energy,6);
  if(ket>.05)txt(ctx,'CC = corpi chetonici (acidi)',12,250,'#ff9a9a',10);
}
function physHeart(ctx,t,dt,ph,W,H){
  const hr=CUR.vit.hr||70,cyc=(t*hr/60)%1,sten=ph.stenosis||0,pre=ph.preload||.5,back=ph.backflow||0;
  const sys=cyc<.35?Math.sin(cyc/.35*Math.PI):0;
  const edv=60+100*pre, sv=Math.max(8,edv*(0.62-0.08*sten)*(0.55+0.45*pre)), esv=edv-sv;
  const vol=edv-sv*sys;
  const sc=(vol/160);
  // atrio e vene polmonari
  ctx.fillStyle='#3b2a52';ctx.beginPath();ctx.ellipse(70,70,34,26,0,0,7);ctx.fill();txt(ctx,'Atrio sx',44,40,C.muted,10);
  ctx.strokeStyle='#5d3f80';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(10,52);ctx.lineTo(40,62);ctx.moveTo(10,90);ctx.lineTo(40,80);ctx.stroke();
  if(back>.1){for(let k=0;k<Math.round(back*10);k++){const ph2=(t*.4+k/10)%1;ctx.fillStyle=`rgba(120,200,255,${.8*(1-ph2)})`;ctx.beginPath();ctx.arc(14-ph2*8,46+k*5,2.4,0,7);ctx.fill()}txt(ctx,'Congestione polmonare',4,128,'#8fd0ff',10,700)}
  // ventricolo
  const vx=120,vy=150,rx=40+34*sc,ry=50+34*sc;
  ctx.fillStyle='#4a1d2a';ctx.beginPath();ctx.ellipse(vx,vy,rx+9+(sten*6),ry+9+(sten*6),-.5,0,7);ctx.fill();
  ctx.fillStyle='#8a3248';ctx.beginPath();ctx.ellipse(vx,vy,rx,ry,-.5,0,7);ctx.fill();
  txt(ctx,'Ventricolo sx',vx-36,vy+ry+22,C.muted,10);
  // aorta + valvola
  ctx.strokeStyle='#8a3248';ctx.lineWidth=22;ctx.lineCap='butt';ctx.beginPath();ctx.moveTo(vx+22,vy-ry+18);ctx.quadraticCurveTo(vx+60,30,190,32);ctx.lineTo(250,32);ctx.stroke();
  const open=sys*(1-sten*.82);
  const valX=vx+30,valY=vy-ry+6;
  ctx.strokeStyle=sten>.4?'#e9e1c9':'#e9a8b8';ctx.lineWidth=sten>.4?5:3;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(valX-12,valY+6);ctx.lineTo(valX-12+10*(1-open)+2,valY-6-open*6);ctx.moveTo(valX+12,valY-6);ctx.lineTo(valX+12-10*(1-open)-2,valY-12-open*4);ctx.stroke();
  txt(ctx,sten>.4?'Valvola aortica stretta':'Valvola aortica',valX-6,valY+30+0,sten>.4?C.accent:C.muted,10,700);
  // flusso
  P.forEach((p,i)=>{if(sys>0)p.t+=dt*(1.2+sten*2.4);if(p.t>1)p.t=0;
    if(i>Math.round(sv/4))return; const u=p.t; const x=valX+u*(250-valX),y=valY-8-(Math.sin(u*Math.PI)*0)+ (1-u)*-0 + (u<.3?-u*60:-18) + Math.sin(i)*3*(1-sten);
    ctx.fillStyle=sten>.4&&u<.4?'#ffd0d8':'#ff8a9a';ctx.beginPath();ctx.arc(x,Math.max(26,y),2,0,7);ctx.fill()});
  // loop PV
  const ox=268,oy=200,gw=140,gh=150;
  ctx.strokeStyle=C.line;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(ox,oy-gh);ctx.lineTo(ox,oy);ctx.lineTo(ox+gw,oy);ctx.stroke();
  txt(ctx,'Loop pressione-volume',ox,oy-gh-6,C.muted,10,700);
  txt(ctx,'mmHg',ox+3,oy-gh+10,C.muted,9);txt(ctx,'mL',ox+gw-14,oy+12,C.muted,9);
  const X=v=>ox+(v/200)*gw,Y=p=>oy-(p/240)*gh;
  const peak=120+110*sten,dia=8+12*pre;
  ctx.strokeStyle=C.accent;ctx.lineWidth=2;ctx.beginPath();
  ctx.moveTo(X(esv),Y(6));ctx.lineTo(X(edv),Y(dia));ctx.lineTo(X(edv),Y(80));ctx.quadraticCurveTo(X((edv+esv)/2),Y(peak+20),X(esv),Y(95));ctx.closePath();ctx.stroke();
  // punto
  let px,py;const c=cyc;if(c<.35){const u=c/.35;px=X(edv-sv*u);py=Y(80+(peak-60)*Math.sin(u*Math.PI))}else{const u=(c-.35)/.65;px=X(esv+sv*u);py=Y(6+(dia-6)*u)}
  ctx.fillStyle=C.hr;ctx.beginPath();ctx.arc(px,py,4,0,7);ctx.fill();
  [50,100,150].forEach(v=>txt(ctx,String(v),X(v)-8,oy+12,C.muted,9));
  txt(ctx,'Gittata ≈ '+Math.round(sv)+' mL',ox,oy+30,C.hr,12,700);
  txt(ctx,'Precarico '+(pre<.3?'basso':pre>.8?'alto':'normale'),ox,oy+46,pre<.3?C.bad:C.muted,11);
}
function physAlv(ctx,t,dt,ph,W,H){
  const fluid=ph.fluid||0,perf=ph.perfusion??1,co2=ph.co2||0;
  const cx=160,cy=95,r=70;
  // bronchiolo
  ctx.strokeStyle='#4a6f7a';ctx.lineWidth=18;ctx.beginPath();ctx.moveTo(cx,0);ctx.lineTo(cx,cy-r+6);ctx.stroke();
  ctx.fillStyle='rgba(76,195,245,.12)';ctx.beginPath();ctx.arc(cx,cy,r,0,7);ctx.fill();ctx.strokeStyle='#6aa9bd';ctx.lineWidth=2.5;ctx.stroke();
  txt(ctx,'Alveolo',cx+r-10,cy-r+10,C.spo2,11,700);
  // liquido
  if(fluid>.02){ctx.save();ctx.beginPath();ctx.arc(cx,cy,r-2,0,7);ctx.clip();const lvl=cy+r-fluid*r*1.6;ctx.fillStyle='rgba(120,190,255,.45)';ctx.beginPath();ctx.moveTo(cx-r,cy+r);for(let x=cx-r;x<=cx+r;x+=6)ctx.lineTo(x,lvl+Math.sin(x*.1+t*2)*3);ctx.lineTo(cx+r,cy+r);ctx.fill();ctx.restore();txt(ctx,'Liquido nell\'alveolo',cx-r,cy+r+40,'#8fd0ff',11,700)}
  // capillare
  const capY=cy+r+12;ctx.fillStyle=perf<.4?'#2a1416':'#4a1a20';rr(ctx,10,capY-12,W-20,24,12);ctx.fill();
  txt(ctx,'Capillare polmonare',W-140,capY+30,C.bp,11,700);
  if(perf<.4){ctx.fillStyle='#7a2a2a';rr(ctx,40,capY-11,46,22,8);ctx.fill();txt(ctx,'Embolo',44,capY+30,C.bad,11,700)}
  for(let k=0;k<14;k++){const sp=perf<.4?.05:perf;const x=((k*32+t*60*sp)%(W-40))+20;if(perf<.4&&x<90)continue;ctx.fillStyle='#c4384a';ctx.beginPath();ctx.ellipse(x,capY,6,4,0,0,7);ctx.fill()}
  // scambi
  P.forEach((p,i)=>{p.t+=dt*(.35+.3*perf);if(p.t>1)p.t=0;const u=p.t;
    if(p.kind==='o'){const rate=perf*(1-fluid*.8);if(i%10>=Math.round(rate*10))return;const x=cx-40+(i%7)*12,y=cy-20+u*(capY-cy+20);ctx.fillStyle=`rgba(76,195,245,${1-u*.6})`;ctx.font='700 10px "JetBrains Mono",monospace';ctx.fillText('O₂',x,y)}
    else{const x=cx+10+(i%5)*12,y=capY-u*(capY-cy+10);ctx.fillStyle=`rgba(245,211,74,${1-u*.6})`;ctx.font='700 10px "JetBrains Mono",monospace';ctx.fillText('CO₂',x,y)}});
  // co2 accumulo
  const lvl=co2;txt(ctx,'CO₂ nel sangue',W-130,24,C.muted,10);ctx.fillStyle='#1b2a30';ctx.fillRect(W-130,30,110,8);ctx.fillStyle=lvl>.7?C.bad:C.rr;ctx.fillRect(W-130,30,110*lvl,8);
  txt(ctx,'Perfusione',W-130,58,C.muted,10);ctx.fillStyle='#1b2a30';ctx.fillRect(W-130,64,110,8);ctx.fillStyle=perf<.4?C.bad:C.bp;ctx.fillRect(W-130,64,110*perf,8);
  txt(ctx,'Ventilazione',W-130,92,C.muted,10);ctx.fillStyle='#1b2a30';ctx.fillRect(W-130,98,110,8);const ven=Math.min(1,(CUR.vit.rr||16)/20)*(1-fluid*.5);ctx.fillStyle=C.spo2;ctx.fillRect(W-130,98,110*ven,8);
}
function physVessel(ctx,t,dt,ph,W,H){
  const dil=ph.dilation||.3,leak=ph.leak||0,bac=ph.bacteria||0,hem=ph.hemolysis||0,his=ph.histamine||0;
  const mid=110,half=34+dil*36;
  ctx.fillStyle='#16262b';ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#3a1418';ctx.fillRect(0,mid-half,W,half*2);
  ctx.strokeStyle='#c07080';ctx.lineWidth=4;
  const gap=leak>.2;
  for(const s of[-1,1]){ctx.beginPath();for(let x=0;x<W;x+=30){ctx.moveTo(x,mid+s*half);ctx.lineTo(x+(gap?22:30),mid+s*half)}ctx.stroke()}
  txt(ctx,'Tessuto',10,18,C.muted,10,700);txt(ctx,'Vaso '+(dil>.7?'dilatato':'normale'),10,mid-half+16,'#f0a6a6',11,700);
  // RBC
  P.forEach((p,i)=>{p.x+=p.v*dt*60*(1-dil*.3);if(p.x>W+8){p.x=-8;p.burst=0}
    const y=mid+(p.lane-.5)*half*1.6;
    if(hem>.1&&i%10<hem*10){p.burst=Math.min(1,p.burst+dt*.8);}
    if(p.burst>.5){ctx.fillStyle=`rgba(196,56,74,${1-p.burst})`;for(let k=0;k<4;k++){ctx.beginPath();ctx.arc(p.x+Math.cos(k*1.6)*p.burst*8,y+Math.sin(k*1.6)*p.burst*8,1.6,0,7);ctx.fill()}
      ctx.strokeStyle='#e9e1c9';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(p.x-6,y-8);ctx.lineTo(p.x-6,y-3);ctx.moveTo(p.x-6,y-3);ctx.lineTo(p.x-9,y);ctx.moveTo(p.x-6,y-3);ctx.lineTo(p.x-3,y);ctx.stroke()}
    else{ctx.fillStyle='#c4384a';ctx.beginPath();ctx.ellipse(p.x,y,6,4,0,0,7);ctx.fill()}});
  if(hem>.1)txt(ctx,'Anticorpi (Y) rompono i globuli rossi',W-210,H-14,'#e9e1c9',10,700);
  // perdita
  if(leak>.05){for(let k=0;k<Math.round(leak*22);k++){const ph2=(t*.4+k/22)%1;const s=k%2?1:-1;const x=(k*41)%W;const y=mid+s*(half+ph2*50);ctx.fillStyle=`rgba(140,200,255,${.8*(1-ph2)})`;ctx.beginPath();ctx.arc(x,y,2.4,0,7);ctx.fill()}
    txt(ctx,'Liquido che esce nei tessuti (edema)',W-220,mid+half+44,'#8fd0ff',10,700)}
  if(bac>.05){for(let k=0;k<Math.round(bac*12);k++){const x=(k*57+t*40)%W,y=mid+Math.sin(k*2.3)*half*.6;ctx.save();ctx.translate(x,y);ctx.rotate(k);ctx.fillStyle='#7fd06a';rr(ctx,-5,-2,10,4,2);ctx.fill();ctx.restore()}txt(ctx,'Batteri',W-60,mid-half+16,'#7fd06a',11,700)}
  if(his>.05){ctx.fillStyle='rgba(120,80,160,.6)';ctx.beginPath();ctx.arc(60,26,14,0,7);ctx.fill();txt(ctx,'Mastocita',80,30,'#c9a3ff',10,700);
    for(let k=0;k<Math.round(his*14);k++){const ph2=(t*.6+k/14)%1;ctx.fillStyle=`rgba(201,163,255,${1-ph2})`;ctx.beginPath();ctx.arc(60+Math.cos(k)*ph2*90,26+Math.abs(Math.sin(k))*ph2*70,2,0,7);ctx.fill()}}
}
function physBrain(ctx,t,dt,ph,W,H){
  const occ=ph.occlusion||0,pen=ph.penumbra||0;
  ctx.save();ctx.translate(30,10);
  // cervello laterale
  ctx.fillStyle='#2b3a4a';ctx.beginPath();ctx.moveTo(40,150);ctx.bezierCurveTo(0,120,10,30,100,20);ctx.bezierCurveTo(190,5,260,40,262,110);ctx.bezierCurveTo(264,160,220,180,180,175);ctx.bezierCurveTo(150,200,90,200,40,150);ctx.fill();
  ctx.strokeStyle='#3e5266';ctx.lineWidth=2;for(let k=0;k<6;k++){ctx.beginPath();ctx.arc(60+k*34,80+Math.sin(k)*14,22,.4,2.6);ctx.stroke()}
  // territorio ACM
  if(pen>.05){ctx.fillStyle=`rgba(255,180,76,${.35*pen})`;ctx.beginPath();ctx.ellipse(145,100,70,46,-.2,0,7);ctx.fill()}
  if(occ>.05){ctx.fillStyle=`rgba(255,80,80,${.5*occ})`;ctx.beginPath();ctx.ellipse(140,104,38,26,-.2,0,7);ctx.fill()}
  // arteria
  const pts=[[120,190],[128,160],[132,135]];ctx.strokeStyle='#c4384a';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(...pts[0]);ctx.lineTo(...pts[1]);ctx.lineTo(...pts[2]);ctx.stroke();
  const br=[[90,70],[150,50],[210,80],[200,130],[100,120]];
  ctx.lineWidth=3;br.forEach(([x,y])=>{ctx.strokeStyle=occ>.5?'#5a2a30':'#c4384a';ctx.beginPath();ctx.moveTo(132,135);ctx.quadraticCurveTo((132+x)/2+8,(135+y)/2,x,y);ctx.stroke()});
  if(occ>.5){ctx.fillStyle='#e9e1c9';ctx.beginPath();ctx.arc(132,137,6,0,7);ctx.fill();txt(ctx,'Trombo',140,152,'#e9e1c9',10,700)}
  P.forEach(p=>{p.t+=dt*.6;if(p.t>1)p.t=0;const [x,y]=br[p.br];let u=p.t;if(occ>.5&&u>.1)return;ctx.fillStyle='#ff8a9a';ctx.beginPath();ctx.arc(132+(x-132)*u,135+(y-135)*u,2,0,7);ctx.fill()});
  ctx.restore();
  txt(ctx,'Emisfero sinistro, vista laterale',12,H-34,C.muted,10);
  txt(ctx,'Arteria cerebrale media',12,H-18,C.bp,10,700);
  if(occ>.05){txt(ctx,'Rosso: core (perso)',W-128,24,C.bad,10,700);txt(ctx,'Ambra: penombra (salvabile)',W-150,40,C.accent,10,700);
    txt(ctx,'→ emiparesi destra',W-128,H-34,C.ink,11,700);txt(ctx,'→ afasia',W-128,H-18,C.ink,11,700)}
}
function physMyo(ctx,t,dt,ph,W,H){
  const k=ph.k||4.5,ca=ph.calcium||0;
  const my=70;
  ctx.fillStyle='#16262b';ctx.fillRect(0,0,W,my);ctx.fillStyle='#21142a';ctx.fillRect(0,my+10,W,60);
  ctx.fillStyle='#c9a3ff';ctx.fillRect(0,my,W,10);
  for(let x=10;x<W;x+=60){ctx.fillStyle='#5ad08a';ctx.fillRect(x,my-3,14,16)}
  txt(ctx,'Fuori dalla cellula',10,16,C.muted,10,700);txt(ctx,'Dentro la cellula',10,my+26,C.muted,10,700);
  const outN=Math.round(k*5),inN=40;
  let oc=0,ic=0;P.forEach(p=>{p.x+=p.vx*dt*20;if(p.x<0)p.x=W;if(p.x>W)p.x=0;
    if(p.side==='out'){if(oc++>=outN)return;const y=24+((p.x*7)%40);ctx.fillStyle='#c9a3ff';ctx.font='700 9px "JetBrains Mono",monospace';ctx.fillText('K⁺',p.x,y)}
    else{if(ic++>=inN)return;const y=my+34+((p.x*5)%30);ctx.fillStyle='rgba(201,163,255,.6)';ctx.font='700 9px "JetBrains Mono",monospace';ctx.fillText('K⁺',p.x,y)}});
  if(ca>.1){for(let i=0;i<Math.round(ca*8);i++){ctx.fillStyle=C.accent;ctx.font='700 9px "JetBrains Mono",monospace';ctx.fillText('Ca²⁺',20+i*48,50)}}
  // grafico potenziale
  const gx=40,gy=150,gw=W-60,gh=90;
  ctx.strokeStyle=C.line;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(gx,gy);ctx.lineTo(gx,gy+gh);ctx.lineTo(gx+gw,gy+gh);ctx.stroke();
  const Y=mv=>gy+gh-((mv+100)/140)*gh;
  const rest=-90+(k-4)*7.5,thr=-70+ca*14;
  ctx.setLineDash([4,4]);ctx.strokeStyle=C.accent;ctx.beginPath();ctx.moveTo(gx,Y(thr));ctx.lineTo(gx+gw,Y(thr));ctx.stroke();ctx.setLineDash([]);
  txt(ctx,'soglia',gx+gw-34,Y(thr)-4,C.accent,9);
  const amp=Math.max(.25,1-(k-5)*.28);
  ctx.strokeStyle=C.hr;ctx.lineWidth=2;ctx.beginPath();
  for(let i=0;i<=gw;i++){const u=((i/gw)*2+t*.4)%1;let mv=rest;
    if(u>.1&&u<.12)mv=rest+(30-rest)*((u-.1)/.02)*amp;else if(u>=.12&&u<.45)mv=rest+(30-rest)*amp*(1-((u-.12)/.33)*.25);else if(u>=.45&&u<.55)mv=rest+(30-rest)*amp*.75*(1-(u-.45)/.1);
    const x=gx+i,y=Y(mv);i?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.stroke();
  [-90,-60,-30,0,30].forEach(v=>txt(ctx,String(v),8,Y(v)+3,C.muted,9));
  txt(ctx,'mV',8,gy-4,C.muted,9);
  txt(ctx,'K⁺ esterno '+k.toFixed(1)+' mmol/L',W-170,gy-6,k>6?C.bad:C.hr,12,700);
  txt(ctx,'Riposo '+Math.round(rest)+' mV',W-170,gy+12,C.muted,10);
}
function physStem(ctx,t,dt,ph,W,H){
  const op=ph.opioid||0,nal=ph.naloxone||0,rrv=CUR.vit.rr||16;
  ctx.fillStyle='#2b3a4a';ctx.beginPath();ctx.moveTo(60,20);ctx.bezierCurveTo(120,10,170,20,175,60);ctx.lineTo(160,200);ctx.bezierCurveTo(150,230,90,230,80,200);ctx.lineTo(55,60);ctx.fill();
  txt(ctx,'Ponte',90,50,C.muted,10,700);txt(ctx,'Bulbo',96,150,C.muted,10,700);
  ctx.fillStyle='rgba(76,195,245,.25)';ctx.beginPath();ctx.ellipse(116,120,30,18,0,0,7);ctx.fill();txt(ctx,'centro respiratorio',72,100,C.spo2,9,700);
  P.forEach((p,i)=>{const x=82+(i%7)*11,y=112+Math.floor(i/7)*16;ctx.fillStyle='#4a6070';ctx.beginPath();ctx.arc(x,y,4,0,7);ctx.fill();
    const boundOp=(i/14)<op*(1-nal*.7);const boundNal=!boundOp&&(i/14)<nal;
    if(boundOp){ctx.fillStyle=C.accent;ctx.beginPath();ctx.moveTo(x,y-8);ctx.lineTo(x+5,y-3);ctx.lineTo(x,y+2);ctx.lineTo(x-5,y-3);ctx.fill()}
    if(boundNal){ctx.fillStyle=C.hr;rr(ctx,x-4,y-9,8,8,2);ctx.fill()}});
  txt(ctx,'◆ oppioide sul recettore μ',196,30,C.accent,11,700);
  if(nal>.05)txt(ctx,'■ naloxone',196,48,C.hr,11,700);
  // traccia respiro
  const gx=196,gy=110,gw=W-206;
  ctx.strokeStyle=C.line;ctx.beginPath();ctx.moveTo(gx,gy);ctx.lineTo(gx+gw,gy);ctx.stroke();
  ctx.strokeStyle=C.rr;ctx.lineWidth=2;ctx.beginPath();
  for(let i=0;i<=gw;i++){const tt=t-(gw-i)/40;const y=gy-Math.max(0,Math.sin(tt*rrv/60*2*Math.PI))*26*(rrv<9?.6:1);i?ctx.lineTo(gx+i,y):ctx.moveTo(gx+i,y)}ctx.stroke();
  txt(ctx,'Atti respiratori: '+Math.round(rrv)+'/min',gx,gy+20,rrv<9?C.bad:C.rr,12,700);
  txt(ctx,'Risposta alla CO₂',gx,gy+50,C.muted,10);ctx.fillStyle='#1b2a30';ctx.fillRect(gx,gy+56,gw-10,8);ctx.fillStyle=C.spo2;ctx.fillRect(gx,gy+56,(gw-10)*(1-op*(1-nal*.7)*.85),8);
  txt(ctx,'Pupille',gx,gy+90,C.muted,10);const pr=6-op*(1-nal*.7)*4.5;ctx.fillStyle='#7a8a90';ctx.beginPath();ctx.arc(gx+60,gy+86,10,0,7);ctx.fill();ctx.fillStyle='#000';ctx.beginPath();ctx.arc(gx+60,gy+86,pr,0,7);ctx.fill();
}



/* ===== Canvas ===== */
function mkCanvas(el,W,H){const c={el,ctx:el.getContext('2d'),W,H};
  const fit=()=>{const w=el.clientWidth||W,dpr=window.devicePixelRatio||1;el.width=Math.round(w*dpr);el.height=Math.round(w*H/W*dpr);c.ctx.setTransform(el.width/W,0,0,el.height/H,0,0);c.ctx.imageSmoothingEnabled=false};
  fit();new ResizeObserver(fit).observe(el);return c}
// fisiologia disegnata fuori schermo, poi mostrata nella lente e nella vista dettagliata
const physOff=document.createElement('canvas');physOff.width=840;physOff.height=520;
const phys={ctx:physOff.getContext('2d'),W:420,H:260};phys.ctx.setTransform(2,0,0,2,0,0);
const tiny=document.createElement('canvas');tiny.width=96;tiny.height=96;const tctx=tiny.getContext('2d');
let scene,detail;
const CROP={glucose:[150,30,230],heart:[20,10,230],alveolus:[60,0,220],vessel:[110,10,230],brain:[50,0,250],myocyte:[0,0,260],brainstem:[30,0,230]};
const LENSNAME={glucose:'Nel sangue',heart:'Nel cuore',alveolus:'Nel polmone',vessel:'Nel vaso',brain:'Nel cervello',myocyte:'Nella cellula',brainstem:'Nel tronco encefalico'};
const LENSAT={glucose:'arm',vessel:'arm',heart:'chest',alveolus:'chest',myocyte:'chest',brain:'head',brainstem:'head'};

/* ===== Audio: sintetizzatore chiptune (musica originale) ed effetti ===== */
const AU={ctx:null,master:null,mus:null,sfx:null,musicOn:true,sfxOn:true,mood:'calm',step:0,next:0,timer:null,noise:null,lastBlip:0,lastAlarm:0};
try{const p=JSON.parse(localStorage.getItem('turno-audio')||'{}');if(p.m===false)AU.musicOn=false;if(p.s===false)AU.sfxOn=false}catch(e){}
function auSave(){try{localStorage.setItem('turno-audio',JSON.stringify({m:AU.musicOn,s:AU.sfxOn}))}catch(e){}}
function auInit(){
  if(AU.ctx)return;
  const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
  AU.ctx=new C();AU.master=AU.ctx.createGain();AU.master.gain.value=.9;AU.master.connect(AU.ctx.destination);
  AU.mus=AU.ctx.createGain();AU.mus.gain.value=AU.musicOn?.5:0;AU.mus.connect(AU.master);
  AU.sfx=AU.ctx.createGain();AU.sfx.gain.value=AU.sfxOn?.8:0;AU.sfx.connect(AU.master);
  const len=AU.ctx.sampleRate;const b=AU.ctx.createBuffer(1,len,AU.ctx.sampleRate);const d=b.getChannelData(0);for(let i=0;i<len;i++)d[i]=Math.random()*2-1;AU.noise=b;
  AU.next=AU.ctx.currentTime+.1;AU.timer=setInterval(auTick,25);
}
['pointerdown','keydown'].forEach(ev=>document.addEventListener(ev,()=>{auInit();if(AU.ctx&&AU.ctx.state==='suspended')AU.ctx.resume()},{capture:true}));
const hz=n=>440*Math.pow(2,(n-69)/12);
function tone(dest,{f=440,t=0,d=.1,type='square',v=.2,slide=0,a=.005,r=.05}){
  if(!AU.ctx)return;const c=AU.ctx,o=c.createOscillator(),g=c.createGain();const t0=c.currentTime+t;
  o.type=type;o.frequency.setValueAtTime(f,t0);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(20,f*slide),t0+d);
  g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(v,t0+a);g.gain.setValueAtTime(v,t0+Math.max(a,d-r));g.gain.linearRampToValueAtTime(0,t0+d);
  o.connect(g);g.connect(dest);o.start(t0);o.stop(t0+d+.02);
}
function noiseHit(dest,{t=0,d=.05,v=.15,hp=4000,lp=0}){
  if(!AU.ctx)return;const c=AU.ctx,s=c.createBufferSource(),g=c.createGain(),f=c.createBiquadFilter();const t0=c.currentTime+t;
  s.buffer=AU.noise;f.type=lp?'lowpass':'highpass';f.frequency.value=lp||hp;
  g.gain.setValueAtTime(v,t0);g.gain.exponentialRampToValueAtTime(.001,t0+d);
  s.connect(f);f.connect(g);g.connect(dest);s.start(t0,Math.random()*.5);s.stop(t0+d+.02);
}
/* --- musica: due tracce originali in la minore --- */
const TRK={
 calm:{bpm:92,bass:[45,41,48,43,45,41,48,43],
  lead:[69,0,72,76,74,72,71,0, 69,0,65,69,72,0,71,69, 72,0,76,79,77,76,74,0, 71,0,67,71,74,72,71,67,
        69,72,76,81,79,76,74,72, 69,0,65,0,72,71,69,0, 72,74,76,79,77,74,72,71, 69,0,0,0,64,0,68,0]},
 tense:{bpm:138,bass:[45,45,50,52],
  lead:[69,72,76,72,69,72,76,72, 69,72,76,72,81,76,72,76, 74,77,81,77,74,77,81,77, 76,80,83,80,76,80,83,88]}
};
function setMood(m){if(AU.mood!==m){AU.mood=m;AU.step=0}}
/* --- effetti --- */
const SFX={
 blip(){const n=performance.now();if(n-AU.lastBlip<45)return;AU.lastBlip=n;tone(AU.sfx,{f:1200+Math.random()*200,d:.025,v:.04})},
 click(){tone(AU.sfx,{f:660,d:.04,v:.08,slide:1.5})},
 open(){tone(AU.sfx,{f:520,d:.06,v:.07});tone(AU.sfx,{f:780,t:.05,d:.08,v:.07})},
 correct(){[72,76,79,84].forEach((n,i)=>tone(AU.sfx,{f:hz(n),t:i*.07,d:.12,v:.12}));tone(AU.sfx,{f:hz(88),t:.3,d:.25,v:.08,type:'triangle'})},
 wrong(){tone(AU.sfx,{f:330,d:.18,type:'sawtooth',v:.09,slide:.5});tone(AU.sfx,{f:220,t:.16,d:.3,type:'sawtooth',v:.08,slide:.5})},
 worse(){for(let i=0;i<3;i++)tone(AU.sfx,{f:880,t:i*.22,d:.14,v:.07,type:'square'})},
 death(){tone(AU.sfx,{f:960,d:3.2,type:'sine',v:.09,a:.02,r:.4});tone(AU.sfx,{f:110,d:2.2,type:'triangle',v:.12,slide:.5})},
 vf(){for(let i=0;i<10;i++)tone(AU.sfx,{f:600+Math.random()*500,t:i*.08,d:.07,v:.05})},
 alarm(){const n=performance.now();if(n-AU.lastAlarm<3200)return;AU.lastAlarm=n;[0,.18,.36].forEach(t=>tone(AU.sfx,{f:988,t,d:.12,v:.045}))},
 beat(spo2){/* il tono del bip scende con la saturazione, come nei monitor reali */const s=Math.max(70,Math.min(100,spo2||97));tone(AU.sfx,{f:500+(s-70)*14,d:.06,v:.035,type:'sine'})},
 jingle(){[64,69,72,76,74,76].forEach((n,i)=>tone(AU.sfx,{f:hz(n),t:i*.09,d:.11,v:.09}))},
 win(){[72,76,79,84,79,84,88].forEach((n,i)=>tone(AU.sfx,{f:hz(n),t:i*.1,d:.14,v:.1}))},
 rewind(){tone(AU.sfx,{f:300,d:.35,v:.08,slide:3});noiseHit(AU.sfx,{d:.3,v:.05,hp:2000})},
 // azioni
 syringe(){noiseHit(AU.sfx,{d:.35,v:.08,hp:3000});tone(AU.sfx,{f:1400,t:.3,d:.06,v:.05})},
 iv(){[0,.25,.5].forEach(t=>tone(AU.sfx,{f:1700,t,d:.05,v:.06,type:'sine',slide:.6}))},
 oxygen(){noiseHit(AU.sfx,{d:.9,v:.05,hp:5000})},
 phone(){for(let i=0;i<4;i++){tone(AU.sfx,{f:880,t:i*.12,d:.05,v:.05});tone(AU.sfx,{f:1100,t:i*.12+.06,d:.05,v:.05})}},
 steth(){tone(AU.sfx,{f:70,d:.12,type:'sine',v:.3,slide:.6});tone(AU.sfx,{f:60,t:.22,d:.12,type:'sine',v:.25,slide:.6})},
 pos(){noiseHit(AU.sfx,{d:.4,v:.06,lp:900});tone(AU.sfx,{f:200,d:.35,type:'triangle',v:.08,slide:2})},
 stop(){tone(AU.sfx,{f:180,d:.1,type:'square',v:.1});noiseHit(AU.sfx,{d:.06,v:.1,hp:800})},
 check(){tone(AU.sfx,{f:hz(84),d:.08,v:.07});tone(AU.sfx,{f:hz(91),t:.08,d:.12,v:.07})},
 lab(){[0,.1].forEach(t=>tone(AU.sfx,{f:2400,t,d:.06,v:.04,type:'triangle'}))},
 drink(){[0,.15,.3].forEach(t=>tone(AU.sfx,{f:400,t,d:.08,v:.06,type:'sine',slide:1.6}))},
 gluco(){tone(AU.sfx,{f:hz(88),d:.08,v:.06});tone(AU.sfx,{f:hz(88),t:.3,d:.15,v:.06})},
 ecg(){tone(AU.sfx,{f:hz(81),d:.08,v:.05});tone(AU.sfx,{f:hz(86),t:.1,d:.08,v:.05})},
 teach(){[76,79,83].forEach((n,i)=>tone(AU.sfx,{f:hz(n),t:i*.08,d:.1,v:.06,type:'triangle'}))},
 look(){SFX.check()},
 siren(){for(let i=0;i<4;i++){tone(AU.sfx,{f:740,t:i*.4,d:.2,v:.06,type:'triangle'});tone(AU.sfx,{f:988,t:i*.4+.2,d:.2,v:.06,type:'triangle'})}},
 crash(){noiseHit(AU.sfx,{d:.6,v:.25,lp:1200});noiseHit(AU.sfx,{t:.05,d:.3,v:.15,hp:3000});tone(AU.sfx,{f:900,d:.5,type:'sawtooth',v:.05,slide:.4})},
 thunder(){noiseHit(AU.sfx,{d:1.8,v:.3,lp:300});noiseHit(AU.sfx,{d:.25,v:.2,lp:2000})},
 shots(){[0,.18,.36,.9,1.05].forEach(t=>noiseHit(AU.sfx,{t,d:.12,v:.3,hp:600}))},
 thud(){tone(AU.sfx,{f:110,d:.2,type:'sine',v:.3,slide:.4});noiseHit(AU.sfx,{d:.1,v:.1,lp:500})},
 neuro(){[72,79,76,84].forEach((n,i)=>tone(AU.sfx,{f:hz(n),t:i*.06,d:.07,v:.07,type:'square'}));tone(AU.sfx,{f:300,t:.25,d:.2,v:.06,type:'triangle',slide:2.5})},
 temp(){SFX.gluco()},
 idea(){[79,84,91].forEach((n,i)=>tone(AU.sfx,{f:hz(n),t:i*.06,d:.09,v:.06,type:'triangle'}))}
};
function sfx(name,...a){if(AU.ctx&&AU.sfxOn&&SFX[name])SFX[name](...a)}
function setMusic(on){AU.musicOn=on;if(AU.mus)AU.mus.gain.setTargetAtTime(on?.5:0,AU.ctx.currentTime,.1);auSave();renderAudioBtns()}
function setSfx(on){AU.sfxOn=on;if(AU.sfx)AU.sfx.gain.setTargetAtTime(on?.8:0,AU.ctx.currentTime,.05);auSave();renderAudioBtns()}
function renderAudioBtns(){document.querySelectorAll('.au-m').forEach(b=>{b.textContent=AU.musicOn?'♪ Musica sì':'♪ Musica no';b.classList.toggle('off',!AU.musicOn)});
  document.querySelectorAll('.au-s').forEach(b=>{b.textContent=AU.sfxOn?'Effetti sì':'Effetti no';b.classList.toggle('off',!AU.sfxOn)})}
document.addEventListener('click',e=>{const m=e.target.closest('.au-m'),s=e.target.closest('.au-s');if(m){auInit();setMusic(!AU.musicOn)}if(s){auInit();setSfx(!AU.sfxOn)}
  if(e.target.closest('.btn,.back,.lvl,.glitem,.chip'))sfx('click')});
/* ===== Colonna sonora: 20 brani originali divisi per emozione, scelti in base al momento del gioco ===== */
const MOODS={
 felice:   {lab:'Felice',     scale:[0,2,4,5,7,9,11],bpm:[122,134],prog:[[0,3,4,0],[0,5,3,4],[0,4,5,3]],lead:'chip', dens:.85,len:[1,1,2],bass:'bounce',drum:'pieno', harm:'arp', oct:1,root:[60,62,65]},
 giocoso:  {lab:'Giocoso',    scale:[0,2,4,5,7,9,10],bpm:[108,118],prog:[[0,6,3,0],[0,3,0,4]],lead:'chip', dens:.7, len:[1,1,1,2],bass:'octave',drum:'swing', harm:'stab',oct:1,root:[62,64,57]},
 speranza: {lab:'Speranza',   scale:[0,2,4,6,7,9,11],bpm:[88,96],  prog:[[0,1,4,0],[0,4,5,1]],lead:'bell', dens:.55,len:[2,2,1,4],bass:'long',  drum:'leggero',harm:'pad', oct:1,root:[60,65,67]},
 sereno:   {lab:'Sereno',     scale:[0,2,4,7,9],     bpm:[70,78],  prog:[[0,3,0,4],[0,4,3,0]],lead:'pluck',dens:.45,len:[2,2,4],bass:'long',    drum:'nessuno',harm:'arp', oct:1,root:[60,62,65]},
 nostalgico:{lab:'Nostalgico',scale:[0,2,3,5,7,9,10],bpm:[80,88],  prog:[[0,3,6,3],[0,6,3,4]],lead:'pluck',dens:.55,len:[1,2,2,3],bass:'pulse',  drum:'leggero',harm:'arp', oct:1,root:[57,62,64]},
 notturno: {lab:'Notturno',   scale:[0,3,5,7,10],    bpm:[72,80],  prog:[[0,5,3,4],[0,3,5,4]],lead:'bell', dens:.4, len:[2,4,2],bass:'long',    drum:'leggero',harm:'pad', oct:1,root:[57,59,62]},
 misterioso:{lab:'Misterioso',scale:[0,1,3,5,7,8,10],bpm:[76,84],  prog:[[0,1,0,6],[0,5,1,0]],lead:'chip', dens:.45,len:[1,2,3],bass:'drone',   drum:'battito',harm:'pad', oct:0,root:[57,52,55]},
 malinconico:{lab:'Malinconico',scale:[0,2,3,5,7,8,10],bpm:[64,72],prog:[[0,5,2,6],[0,3,5,4],[5,3,0,4]],lead:'pluck',dens:.45,len:[2,2,4,3],bass:'long',drum:'nessuno',harm:'arp',oct:1,root:[57,52,55]},
 triste:   {lab:'Triste',     scale:[0,2,3,5,7,8,11],bpm:[56,62],  prog:[[0,3,4,0],[0,5,3,4]],lead:'bell', dens:.35,len:[4,4,2,6],bass:'long',  drum:'nessuno',harm:'pad', oct:1,root:[57,53,50]},
 energico: {lab:'Energico',   scale:[0,2,3,5,7,8,10],bpm:[132,142],prog:[[0,5,6,4],[0,6,5,4]],lead:'chip', dens:.85,len:[1,1,1,2],bass:'octave',drum:'pieno', harm:'arp', oct:1,root:[57,62,64]}
};
const SONGDEF=[
 ['felice','Mattino in reparto'],['sereno','Tisana delle due'],['nostalgico','Foto in guardiola'],['notturno','Turno di notte'],['giocoso','Carrello che cigola'],
 ['malinconico','Letto vuoto'],['speranza','Prima alzata'],['misterioso','Corridoio B'],['triste','Ultimo saluto'],['energico','Codice rosso'],
 ['felice','Dimissione'],['sereno','Pioggia sulla finestra'],['nostalgico','Primo tirocinio'],['notturno','Monitor verde'],['giocoso','Pausa caffè'],
 ['malinconico','Consegne lunghe'],['speranza','Alba in reparto'],['misterioso','Ascensore di servizio'],['triste','Stanza 12'],['energico','Scala di emergenza']
];
const CONTEXT={home:['felice','sereno','nostalgico','speranza','giocoso'],case:['notturno','misterioso','malinconico','sereno','nostalgico'],win:['felice','giocoso','speranza'],loss:['triste','malinconico'],tense:['energico']};
function rng(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296}}
function compose(i){
  const [mk,name]=SONGDEF[i];const M=MOODS[mk];const r=rng(4241+i*104729);const pick=a=>a[Math.floor(r()*a.length)];
  const sc=M.scale,root=pick(M.root),bpm=Math.round(M.bpm[0]+r()*(M.bpm[1]-M.bpm[0]));
  const deg=(d,o)=>{const n=sc.length,k=((d%n)+n)%n,oc=Math.floor(d/n);return root+sc[k]+12*(oc+o)};
  const pA=pick(M.prog),pB=pick(M.prog);
  // motivo di 2 battute (16 passi): eventi {s,d,g}
  const motif=()=>{const ev=[];let s=0,g=pick([0,2,4]);while(s<16){const d=Math.min(pick(M.len),16-s);if(r()<M.dens||s===0){ev.push({s,d,g});g+=pick([-2,-1,-1,1,1,2,0,3,-3]);g=Math.max(-3,Math.min(sc.length+4,g))}s+=d}return ev};
  const mA=motif(),mB=motif(),mC=motif();
  const form=[['A',pA,mA],['B',pB,mB],['A',pA,mA],['C',pB,mC]];
  const bars=[];
  form.forEach(([nm,prog,mot],fi)=>{for(let b=0;b<8;b++){const ch=prog[b%4];const half=(b%2)*8;
    const lead=new Array(8).fill(null),bass=new Array(8).fill(null),harm=new Array(8).fill(null);
    mot.forEach(e=>{if(e.s>=half&&e.s<half+8){let g=e.g;if(nm==='C'&&b>=4)g+=2;if(b%4===3&&e.s-half>=6&&nm!=='A')return;lead[e.s-half]={n:deg(g+ch,M.oct)+(fi===2&&b>=6?12:0),d:e.d}}});
    const B=M.bass;
    for(let k=0;k<8;k++){
      if(B==='bounce')bass[k]={n:deg(ch+(k%2?4:0),-1),d:1};
      else if(B==='octave')bass[k]={n:deg(ch,-1)+(k%2?12:0),d:1};
      else if(B==='pulse'&&k%2===0)bass[k]={n:deg(ch,-1),d:2};
      else if(B==='long'&&k===0)bass[k]={n:deg(ch,-1),d:8};
      else if(B==='drone'&&k===0&&b%2===0)bass[k]={n:deg(0,-1),d:16};
      if(M.harm==='arp')harm[k]={n:deg(ch+[0,2,4,7,4,2,0,2][k],0),d:1};
      else if(M.harm==='stab'&&(k===2||k===6))harm[k]={n:deg(ch+2,0),d:1,ch:[0,2,4]};
      else if(M.harm==='pad'&&k===0)harm[k]={n:deg(ch,0),d:8,ch:[0,2,4]};
    }
    bars.push({lead,bass,harm,fill:b===7&&M.drum!=='nessuno'});}});
  return{name,mood:mk,lab:M.lab,bpm,bars,lead:M.lead,drum:M.drum,deg};
}
const SONGS=SONGDEF.map((_,i)=>compose(i));
const DPAT={pieno:{k:[1,0,0,0,1,0,0,0],s:[0,0,1,0,0,0,1,0],h:[1,1,1,1,1,1,1,1]},swing:{k:[1,0,0,1,0,0,1,0],s:[0,0,1,0,0,0,1,0],h:[0,1,0,1,0,1,0,1]},
 leggero:{k:[1,0,0,0,0,0,0,0],s:[0,0,0,0,1,0,0,0],h:[0,0,1,0,0,0,1,0]},battito:{k:[1,0,0,1,0,0,0,0],s:[0,0,0,0,0,0,0,0],h:[0,0,0,0,1,0,0,0]},nessuno:null};
/* strumenti */
function inst(kind,f,at,dur,v){
  if(!AU.ctx)return;const c=AU.ctx,t0=c.currentTime+at;
  if(kind==='chip'){tone(AU.mus,{f,t:at,d:dur*.92,type:'square',v:v*.9});return}
  const g=c.createGain();g.connect(AU.mus);if(AU.rev){const sg=c.createGain();sg.gain.value=kind==='chip'?.15:.45;g.connect(sg);sg.connect(AU.rev)}
  if(kind==='pluck'){[['triangle',1,v],['sine',2,v*.35]].forEach(([ty,m,vv])=>{const o=c.createOscillator();o.type=ty;o.frequency.value=f*m;const gg=c.createGain();gg.gain.setValueAtTime(0,t0);gg.gain.linearRampToValueAtTime(vv,t0+.006);gg.gain.exponentialRampToValueAtTime(.0008,t0+Math.max(.5,dur*1.6));o.connect(gg);gg.connect(g);o.start(t0);o.stop(t0+dur*1.6+.05)})}
  else if(kind==='bell'){[['sine',1,v],['sine',3,v*.18],['triangle',2,v*.2]].forEach(([ty,m,vv])=>{const o=c.createOscillator();o.type=ty;o.frequency.value=f*m;const gg=c.createGain();gg.gain.setValueAtTime(0,t0);gg.gain.linearRampToValueAtTime(vv,t0+.01);gg.gain.exponentialRampToValueAtTime(.0008,t0+Math.max(1,dur*2));o.connect(gg);gg.connect(g);o.start(t0);o.stop(t0+dur*2+.05)})}
  else if(kind==='pad'){const lp=c.createBiquadFilter();lp.type='lowpass';lp.frequency.value=900;lp.connect(g);[-6,6].forEach(dt=>{const o=c.createOscillator();o.type='sawtooth';o.frequency.value=f;o.detune.value=dt;const gg=c.createGain();gg.gain.setValueAtTime(0,t0);gg.gain.linearRampToValueAtTime(v,t0+dur*.35);gg.gain.linearRampToValueAtTime(0,t0+dur);o.connect(gg);gg.connect(lp);o.start(t0);o.stop(t0+dur+.05)})}
}
function auReverb(){if(!AU.ctx||AU.rev)return;const c=AU.ctx,len=c.sampleRate*2.6,b=c.createBuffer(2,len,c.sampleRate);
  for(let ch=0;ch<2;ch++){const d=b.getChannelData(ch);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.6)}
  AU.rev=c.createConvolver();AU.rev.buffer=b;const rg=c.createGain();rg.gain.value=.55;AU.rev.connect(rg);rg.connect(AU.mus)}
AU.ctxName='home';AU.song=0;AU.bar=0;AU.st8=0;AU.adaptive=true;
try{const a=localStorage.getItem('turno-adapt');if(a==='0')AU.adaptive=false;const v=+localStorage.getItem('turno-song');if(v>=0&&v<20)AU.song=v}catch(e){}
function songFor(ctxName,avoid){const pool=CONTEXT[ctxName]||CONTEXT.home;const idx=SONGS.map((s,i)=>i).filter(i=>pool.includes(SONGS[i].mood)&&i!==avoid);return idx[Math.floor(Math.random()*idx.length)]}
function setMusicContext(name){
  if(name==='tense'){setMood('tense');return}
  if(name==='silence'){setMood('none');return}
  const was=AU.ctxName;AU.ctxName=name;setMood('calm');
  if(AU.adaptive&&(was!==name||!(CONTEXT[name]||[]).includes(SONGS[AU.song].mood))){startSong(songFor(name,AU.song))}
}
function startSong(i){AU.song=i;AU.bar=0;AU.st8=0;try{localStorage.setItem('turno-song',i)}catch(e){}renderNowPlaying()}
function nextSong(){startSong(AU.adaptive?songFor(AU.ctxName,AU.song):(AU.song+1)%20)}
function auTick(){
  if(!AU.ctx)return;const c=AU.ctx;if(!AU.rev)auReverb();
  while(AU.next<c.currentTime+.12){
    const at=AU.next-c.currentTime;
    if(AU.mood==='tense'){const tr=TRK.tense,e=60/tr.bpm/2,i=AU.step%tr.lead.length,bar=Math.floor(i/8)%tr.bass.length,beat=i%8;
      const n=tr.lead[i];if(n)tone(AU.mus,{f:hz(n),t:at,d:e*.9,v:.05});
      tone(AU.mus,{f:hz(beat%2?tr.bass[bar]+12:tr.bass[bar]),t:at,d:e*.85,type:'triangle',v:.16});
      if(beat%2)noiseHit(AU.mus,{t:at,d:.03,v:.05});if(beat===0||beat===4)tone(AU.mus,{f:150,t:at,d:.12,type:'sine',v:.22,slide:.3});
      if(beat===2||beat===6)noiseHit(AU.mus,{t:at,d:.09,v:.09,hp:1200});
      AU.next+=e;AU.step++;continue}
    if(AU.mood!=='calm'){AU.next+=.1;continue}
    const sg=SONGS[AU.song],e=60/sg.bpm/2,bar=sg.bars[AU.bar],k=AU.st8;
    const L=bar.lead[k];if(L)inst(sg.lead,hz(L.n),at,e*L.d,sg.lead==='chip'?.05:sg.lead==='bell'?.09:.11);
    const Hm=bar.harm[k];if(Hm){if(Hm.ch){const base=Hm.n;[0,4,7].forEach((iv,j)=>inst(sg.drum==='nessuno'||sg.lead!=='chip'?'pad':'chip',hz(base+iv),at,e*Hm.d,sg.lead==='chip'?.012:.025))}else inst(sg.lead==='chip'?'chip':'pluck',hz(Hm.n),at,e*Hm.d,sg.lead==='chip'?.016:.03)}
    const Bs=bar.bass[k];if(Bs)tone(AU.mus,{f:hz(Bs.n),t:at,d:e*Bs.d*.95,type:'triangle',v:sg.drum==='nessuno'?.12:.16,a:.01,r:Math.min(.3,e*Bs.d*.4)});
    const dr=DPAT[sg.drum];
    if(dr){if(dr.k[k])tone(AU.mus,{f:150,t:at,d:.12,type:'sine',v:sg.drum==='pieno'?.24:.16,slide:.3});
      if(dr.s[k]||(bar.fill&&k>=5))noiseHit(AU.mus,{t:at,d:.09,v:sg.drum==='pieno'?.08:.05,hp:1400});
      if(dr.h[k])noiseHit(AU.mus,{t:at,d:.025,v:.035})}
    AU.next+=e;AU.st8++;
    if(AU.st8>=8){AU.st8=0;AU.bar++;if(AU.bar>=sg.bars.length)nextSong()}
  }
}
function renderNowPlaying(){const s=SONGS[AU.song];document.querySelectorAll('.np').forEach(el=>{el.textContent=`${s.lab} · ${s.name}`});
  document.querySelectorAll('.au-a').forEach(b=>{b.textContent=AU.adaptive?'Musica: segue il gioco':'Musica: playlist intera'})}
document.addEventListener('click',e=>{if(e.target.closest('.au-next')){auInit();nextSong()}
  if(e.target.closest('.au-a')){AU.adaptive=!AU.adaptive;try{localStorage.setItem('turno-adapt',AU.adaptive?'1':'0')}catch(x){}renderNowPlaying()}});



/* ===== Animazioni delle azioni: ricavate dal testo della risposta scelta ===== */
const ACTRULES=[
 ['gluco',/glicemia capillare|glucometro/i,'GLICEMIA'],
 ['stop',/\b(fermo|sospend[oe]|interromp|rimuovo|tolgo|stop)\b/i,'STOP'],
 ['oxygen',/ossigeno|maschera|occhialini|venturi|reservoir/i,'O₂'],
 ['syringe',/\b(IM|intramuscolo|sottocute|glucagone|adrenalina|enoxaparina|glargine)\b/i,null],
 ['iv',/\b(EV|bolo|boli|infusione|fisiologica|cristalloidi|naloxone|calcio gluconato|insulina|furosemide|glucosio|potassio EV|reintegra)\b/i,null],
 ['drink',/succo|zuccher|cioccolato|cracker|yogurt|sorso|bere|acqua|per bocca|compressa|cetirizina|salbutamolo spray/i,null],
 ['pos',/seduta|seduto|supin|gambe|schienale|trendelenburg|in piedi|posizione|distend|fianco|semiseduta/i,'POSIZIONE'],
 ['steth',/ausculto|auscultazione|crepitii|soffio|sibili|murmure/i,'AUSCULTO'],
 ['ecg',/\bECG\b|elettrocardiogramma|monitoraggio|monitor\b/i,'ECG'],
 ['check',/braccialetto|identit|etichetta|nome, cognome|data di nascita|scadenza/i,'CONTROLLO'],
 ['lab',/emocolture|urinocoltura|lattati|prelievo|emogasanalisi|esame|potassiemia|sodiemia|troponina|emocromo/i,'ESAMI'],
 ['phone',/chiamo|segnal[oa]|avvis[oa]|comunico|telefono|aiuto|team|medico/i,'CHIAMATA'],
 ['teach',/insegno|educazione|spieg|registrazione dell'allergia|non sospendere mai/i,'EDUCAZIONE']
];
const DRUGRE=/(adrenalina|glucagone|naloxone|furosemide|calcio gluconato|insulina[a-z ]{0,8}|glucosio[^,.]{0,4}|fisiologica|cristalloidi|enoxaparina|glargine|nitroglicerina|clorfenamina|idrocortisone|paracetamolo|salbutamolo|bicarbonato|glucosata|succo[^,.]{0,10})/i;
function actsFor(text,kn){
  const found=[];
  ACTRULES.forEach(([k,re,lab])=>{const m=text.match(re);if(m)found.push({k,pos:m.index,lab})});
  found.sort((a,b)=>a.pos-b.pos);
  const st=found.find(f=>f.k==='stop');if(st){const i=found.findIndex(f=>f.k==='iv'&&f.pos-st.pos<22&&f.pos>st.pos);if(i>-1){const m=text.slice(found[i].pos+10).match(ACTRULES.find(r=>r[0]==='iv')[1]);if(m)found[i].pos+=10+m.index;else found.splice(i,1)}found.sort((a,b)=>a.pos-b.pos)}
  const seen=new Set(),out=[];
  for(const f of found){if(seen.has(f.k))continue;seen.add(f.k);
    let lab=f.lab;if(!lab){const d=text.slice(Math.max(0,f.pos-30),f.pos+60).match(DRUGRE);lab=(d?d[0]:(f.k==='iv'?'INFUSIONE':f.k==='drink'?'PER BOCCA':'FARMACO')).trim().toUpperCase().slice(0,18)}
    out.push({k:f.k,lab});if(out.length>=4)break}
  if(!out.length)out.push(kn?{k:'idea',lab:'RAGIONAMENTO'}:{k:'check',lab:'VALUTAZIONE'});
  return out;
}
let ACTQ=[];
function playActs(list,ok){
  let t=performance.now()/1000;ACTQ=[];
  list.forEach((a,i)=>{ACTQ.push({...a,t0:t+i*1.25,dur:1.5,ok});setTimeout(()=>sfx(a.k==='gluco'?'gluco':a.k),i*1250)});
}
const ACTAT={look:'head',temp:'hand',gluco:'hand',stop:'pole',oxygen:'head',syringe:'arm',iv:'arm',drink:'head',pos:'bedhead',steth:'chest',ecg:'chest',check:'hand',lab:'arm',phone:'nurse',teach:'nurse',idea:'nurse'};
function actPoint(w){
  if(w==='hand')return[A.arm[0]+8,A.arm[1]+30];
  if(w==='pole')return[276,214];
  if(w==='bedhead')return[180,170];
  if(w==='nurse')return[nurse.x,nurse.y-30];
  return A[w]||A.chest;
}
function drawActs(ctx,t){
  const now=performance.now()/1000;
  ACTQ=ACTQ.filter(a=>now<a.t0+a.dur+.2);
  for(const a of ACTQ){
    const u=(now-a.t0)/a.dur;if(u<0||u>1)continue;
    const [x,y]=actPoint(ACTAT[a.k]);const e=Math.min(1,u*4),fade=u>.8?(1-u)/.2:1;
    ctx.save();ctx.globalAlpha=fade;
    const col=a.ok===false?'#ff6f7d':'#ffc24a';
    // anello d'impulso
    ctx.strokeStyle=col;ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,10+u*30,0,7);ctx.globalAlpha=fade*(1-u);ctx.stroke();ctx.globalAlpha=fade;
    ACTDRAW[a.k](ctx,x,y,u,e,t);
    // etichetta
    ctx.font='700 10px Silkscreen,monospace';const tw=ctx.measureText(a.lab).width+10;
    let lx=Math.max(4,Math.min(W-tw-4,x-tw/2)),ly=y-52-e*6;if(ly<160)ly=y+40;
    ctx.fillStyle='#0b1030';ctx.fillRect(lx,ly,tw,16);ctx.strokeStyle=col;ctx.lineWidth=2;ctx.strokeRect(lx,ly,tw,16);ctx.fillStyle=col;ctx.fillText(a.lab,lx+5,ly+12);
    ctx.restore();
  }
}
const px=(ctx,c,x,y,w,h)=>{ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),w,h)};
const ACTDRAW={
 look(ctx,x,y,u,e,t){ACTDRAW.check(ctx,x-18,y+4,u,e,t)},
 temp(ctx,x,y,u){px(ctx,'#eef0ff',x+8,y-30,6,30);px(ctx,'#ff6f7d',x+9,y-6-u*20,4,6+u*20);ctx.fillStyle='#ff6f7d';ctx.beginPath();ctx.arc(x+11,y+2,5,0,7);ctx.fill()},
 syringe(ctx,x,y,u,e){const sx=x+26-e*14,sy=y-26+e*14;ctx.save();ctx.translate(sx,sy);ctx.rotate(-.8);
   px(ctx,'#dfe8ff',-22,-5,34,10);px(ctx,'#7fd6ff',-20+u*20,-3,30-u*20,6);px(ctx,'#8a93c6',-30+u*16,-2,10,4);px(ctx,'#8a93c6',-32+u*16,-6,3,12);px(ctx,'#c8d0f5',12,-1,12,2);ctx.restore();
   if(u>.5){ctx.fillStyle='#7fd6ff';for(let i=0;i<5;i++){const a=i*1.26+u*4;ctx.fillRect(x+Math.cos(a)*(u-.5)*30,y+Math.sin(a)*(u-.5)*30,3,3)}}},
 iv(ctx,x,y,u){const bx=276,by=180;px(ctx,'rgba(127,214,255,.8)',bx-7,by,14,18);
   for(let k=0;k<3;k++){const p=(u*3+k/3)%1;px(ctx,'#7fd6ff',bx-1,by+22+p*14,3,4)}
   const steps=14;for(let i=0;i<steps;i++){const p=i/steps;if(p>u*1.2)break;const qx=bx+(x-bx)*p,qy=by+40+(y-by-40)*p+Math.sin(p*3)*10;px(ctx,'#7fd6ff',qx-2,qy-2,4,4)}},
 oxygen(ctx,x,y,u){ctx.fillStyle='rgba(200,240,255,.55)';ctx.beginPath();ctx.ellipse(x,y+6,15,12,0,0,7);ctx.fill();ctx.strokeStyle='#dfe8ff';ctx.lineWidth=2;ctx.stroke();
   ctx.strokeStyle='#7fd6ff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+14,y+8);ctx.quadraticCurveTo(x+60,y+40,276,200);ctx.stroke();
   for(let k=0;k<4;k++){const p=(u*2+k/4)%1;px(ctx,'rgba(127,214,255,.9)',x-10+k*6,y-6-p*18,3,3)}},
 drink(ctx,x,y,u,e){const cx=x+30-e*16,cy=y+18;px(ctx,'#ffc24a',cx-8,cy-14,16,22);px(ctx,'#ff9f43',cx-8,cy-14,16,6);px(ctx,'#eef0ff',cx+2,cy-26,3,14);
   if(u>.4)for(let k=0;k<3;k++)px(ctx,'#ffd77a',cx-2-k*4,cy-22-((u*30+k*7)%12),3,3)},
 pos(ctx,x,y,u){ctx.strokeStyle='#ffc24a';ctx.lineWidth=3;for(let k=0;k<2;k++){const yy=y+20-k*14-u*10;ctx.beginPath();ctx.moveTo(x-30,yy);ctx.lineTo(x-38,yy+8);ctx.moveTo(x-30,yy);ctx.lineTo(x-22,yy+8);ctx.stroke();ctx.beginPath();ctx.moveTo(x+30,yy);ctx.lineTo(x+22,yy+8);ctx.moveTo(x+30,yy);ctx.lineTo(x+38,yy+8);ctx.stroke()}
   ctx.fillStyle='rgba(255,194,74,.25)';ctx.fillRect(x-60,y-14,120,8)},
 steth(ctx,x,y,u){ctx.strokeStyle='#c8d0f5';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x-40,y-30,nurse.x+10,nurse.y-6);ctx.stroke();
   ctx.fillStyle='#dfe8ff';ctx.beginPath();ctx.arc(x,y,7,0,7);ctx.fill();ctx.fillStyle='#8a93c6';ctx.beginPath();ctx.arc(x,y,4,0,7);ctx.fill();
   ctx.strokeStyle='#5ee0d0';ctx.lineWidth=2;for(let k=0;k<3;k++){const r=10+((u*40+k*10)%30);ctx.globalAlpha*=.8;ctx.beginPath();ctx.arc(x,y,r,-.6,.6);ctx.stroke()}},
 ecg(ctx,x,y,u){[[-16,-10],[16,-10],[0,16]].forEach(([dx,dy])=>{px(ctx,'#eef0ff',x+dx-4,y+dy-4,8,8);px(ctx,'#ff6f7d',x+dx-1,y+dy-1,3,3)});
   const w=70;px(ctx,'#eef0ff',x-w/2,y+30,w,18);ctx.strokeStyle='#ff6f7d';ctx.lineWidth=1.5;ctx.beginPath();for(let i=0;i<w*u;i++){const p=(i/18)%1;const v=gauss(p,.3,.03)*10-gauss(p,.33,.02)*3+gauss(p,.55,.05)*3;i?ctx.lineTo(x-w/2+i,y+42-v):ctx.moveTo(x-w/2,y+42)}ctx.stroke()},
 check(ctx,x,y,u){ctx.strokeStyle='#eef0ff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x+6,y-6,12,0,7);ctx.stroke();ctx.beginPath();ctx.moveTo(x+14,y+2);ctx.lineTo(x+24,y+12);ctx.stroke();
   if(u>.5){ctx.strokeStyle='#6fe39a';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(x-2,y-6);ctx.lineTo(x+4,y);ctx.lineTo(x+14,y-14);ctx.stroke()}},
 lab(ctx,x,y,u){[0,12,24].forEach((d,i)=>{px(ctx,'#dfe8ff',x+20+d,y-24,8,24);px(ctx,['#ff6f7d','#ffd84d','#9b7bff'][i],x+20+d,y-24,8,5);px(ctx,'#b0303f',x+21+d,y-10+Math.max(0,1-u*2-i*.2)*10,6,10)})},
 phone(ctx,x,y,u,e,t){const s=Math.sin(t*30)*2;px(ctx,'#eef0ff',x+18+s,y-10,12,22);px(ctx,'#0b1030',x+20+s,y-7,8,12);
   ctx.strokeStyle='#ffc24a';ctx.lineWidth=2;for(let k=1;k<=3;k++){ctx.beginPath();ctx.arc(x+24,y,8+k*7,-.7,.7);ctx.stroke()}},
 teach(ctx,x,y,u){ctx.fillStyle='#eef0ff';rr(ctx,x+14,y-40,58,30,6);ctx.fill();ctx.fillStyle='#0b1030';for(let k=0;k<3;k++)ctx.fillRect(x+22,y-33+k*7,Math.min(42,u*120-k*14),3)},
 stop(ctx,x,y,u){ctx.fillStyle='#ff6f7d';ctx.beginPath();for(let k=0;k<8;k++){const a=k*Math.PI/4+Math.PI/8;ctx[k?'lineTo':'moveTo'](x+Math.cos(a)*14,y+Math.sin(a)*14)}ctx.fill();
   ctx.strokeStyle='#eef0ff';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x-6,y);ctx.lineTo(x+6,y);ctx.stroke()},
 gluco(ctx,x,y,u){px(ctx,'#4b58a8',x+16,y-22,18,28);px(ctx,'#5ee0d0',x+19,y-18,12,9);ctx.fillStyle='#0b1030';ctx.font='9px VT323,monospace';if(u>.5)ctx.fillText(String(Math.round(CUR.phys.glu||0)),x+19,y-11);
   px(ctx,'#ff3b52',x-2,y-4+Math.min(0,(u-.3)*-10),5,6)},
 idea(ctx,x,y,u){ctx.fillStyle='#ffd84d';ctx.beginPath();ctx.arc(x+22,y-26,10,0,7);ctx.fill();px(ctx,'#c8d0f5',x+17,y-17,10,6);
   ctx.strokeStyle='#ffd84d';ctx.lineWidth=2;for(let k=0;k<6;k++){const a=k*1.05+u*2;ctx.beginPath();ctx.moveTo(x+22+Math.cos(a)*14,y-26+Math.sin(a)*14);ctx.lineTo(x+22+Math.cos(a)*20,y-26+Math.sin(a)*20);ctx.stroke()}}
};

/* ===== Scena vista dall'alto ===== */
const W=360,H=560;
let A={head:[180,190],chest:[180,260],arm:[230,300]};
let nurse={x:-60,y:300,tx:66,ty:268,reach:0,treach:0,q:0,cheer:0};
let lensPop=0;
const ECG_N=60;let ecgBuf=new Array(ECG_N).fill(0),ecgI=0,ecgPh=0,ecgAcc=0,respPh=0;
function ecgWave(p,type){
  if(type==='asystole')return (Math.random()-.5)*.03;
  if(type==='vf')return Math.sin(p*37)*.35+Math.sin(p*23+1.3)*.28+Math.sin(p*11)*.15;
  if(type==='af')return gauss(p,.3,.02)*1-gauss(p,.34,.02)*.3+Math.sin(p*80)*.06;
  let y=gauss(p,.14,.03)*.12+gauss(p,.3,.018)*1-gauss(p,.33,.015)*.3;
  y+=type==='peakedT'?gauss(p,.5,.035)*.8:gauss(p,.52,.06)*.25;return y}
const BED={x:112,y:150,w:136,h:396};

function drawScene(t,dt){
  const ctx=scene.ctx,v=CUR.vit,cid=curCase?curCase.id-1:0;
  // pavimento a piastrelle
  ctx.fillStyle='#161c48';ctx.fillRect(0,0,W,H);
  for(let y=0;y<H;y+=40)for(let x=0;x<W;x+=40){if(((x+y)/40)%2===0){ctx.fillStyle='#1a2152';ctx.fillRect(x,y,40,40)}}
  ctx.fillStyle='#10153a';for(let x=0;x<W;x+=40)ctx.fillRect(x,0,1,H);for(let y=0;y<H;y+=40)ctx.fillRect(0,y,W,1);
  // luce di luna dalla finestra, proiettata sul pavimento
  ctx.save();ctx.globalAlpha=.11+.02*Math.sin(t*.5);ctx.fillStyle='#cfe0ff';
  ctx.beginPath();ctx.moveTo(0,380);ctx.lineTo(70,360);ctx.lineTo(104,500);ctx.lineTo(0,540);ctx.closePath();ctx.fill();
  ctx.globalAlpha=1;ctx.restore();
  ctx.fillStyle='#161c48';ctx.fillRect(0,446,92,4);ctx.fillRect(42,368,4,160);
  // comodino
  ctx.fillStyle='#2d3678';ctx.fillRect(258,470,56,56);ctx.fillStyle='#3a4590';ctx.fillRect(262,474,48,48);
  ctx.fillStyle='#eef0ff';ctx.fillRect(270,484,14,14);ctx.fillStyle='#ffc24a';ctx.fillRect(272,486,10,10);// bicchiere
  ctx.fillStyle='#c8d0f5';ctx.fillRect(290,480,14,22);
  // carrello monitor (in alto a sinistra)
  const mx=10,my=164;
  ctx.fillStyle='#2a3374';ctx.fillRect(mx-2,my-2,92,62);
  ctx.fillStyle='#070b22';ctx.fillRect(mx+2,my+2,84,54);
  ecgPh+=dt*Math.max(v.hr||0,30)/60;if(ecgPh>=1){ecgPh-=1;if(!$('game').hidden&&(v.hr||0)>20&&v.ecg!=='asystole'&&v.ecg!=='vf')sfx('beat',v.spo2)}respPh+=dt*(v.rr||16)/60;
  ecgAcc+=dt*30;while(ecgAcc>=1){ecgAcc-=1;ecgI=(ecgI+1)%ECG_N;ecgBuf[ecgI]=ecgWave(ecgPh,v.ecg)}
  if(!$('game').hidden&&(v.hr||0)>20&&(v.spo2<90||v.sys<90||v.hr>130||v.rr<9))sfx('alarm');
  ctx.fillStyle=C.hr;for(let i=0;i<ECG_N;i++){const gp=(i-ecgI+ECG_N)%ECG_N;if(gp>0&&gp<4)continue;ctx.fillRect(mx+8+i*1.2,my+44-Math.round(ecgBuf[i]*16),2,2)}
  ctx.font='17px VT323,monospace';ctx.fillText(String(Math.round(v.hr||0)),mx+6,my+16);ctx.fillStyle=C.spo2;ctx.fillText(String(Math.round(v.spo2||0))+'%',mx+44,my+16);
  if((v.spo2<90||v.sys<90||v.hr>130||v.rr<9)&&Math.floor(t*2)%2){ctx.fillStyle=C.bad;ctx.fillRect(mx+76,my+6,6,6)}
  // asta flebo (vista dall'alto: base a stella e sacca)
  const px=276,py=200;
  ctx.fillStyle='#4a5596';for(let k=0;k<5;k++){const a=k*1.2566;ctx.fillRect(px+Math.cos(a)*14-2,py+Math.sin(a)*14-2,4,4)}
  ctx.fillStyle='#5a66aa';ctx.beginPath();ctx.arc(px,py,5,0,7);ctx.fill();
  ctx.fillStyle='rgba(170,220,255,.55)';ctx.fillRect(px-8,py-22,16,20);
  // letto
  drawBed(ctx);
  drawPatient(ctx,t,cid);
  // linea della flebo verso il braccio sinistro del paziente
  ctx.strokeStyle='rgba(190,225,255,.55)';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(px,py);ctx.quadraticCurveTo(px-10,py+80,A.arm[0]+4,A.arm[1]+14);ctx.stroke();
  // infermiere
  nurse.x+=(nurse.tx-nurse.x)*Math.min(1,dt*2);nurse.y+=(nurse.ty-nurse.y)*Math.min(1,dt*2);
  nurse.reach+=(nurse.treach-nurse.reach)*Math.min(1,dt*4);
  drawNurse(ctx,t);
  drawActs(ctx,t);
  drawLens(ctx,t,dt);
}
function drawBed(ctx){
  const b=BED;
  ctx.fillStyle='rgba(5,8,28,.45)';ctx.fillRect(b.x+6,b.y+8,b.w,b.h);// ombra
  ctx.fillStyle='#3b4690';ctx.fillRect(b.x-6,b.y-6,b.w+12,b.h+10);// telaio
  ctx.fillStyle='#4b58a8';ctx.fillRect(b.x-6,b.y-10,b.w+12,10);// testiera
  ctx.fillStyle='#4b58a8';ctx.fillRect(b.x-6,b.y+b.h,b.w+12,8);// pediera
  ctx.fillStyle='#dfe4fa';ctx.fillRect(b.x,b.y,b.w,b.h);// materasso
  ctx.fillStyle='#5a66b0';ctx.fillRect(b.x-10,b.y+90,4,120);ctx.fillRect(b.x+b.w+6,b.y+90,4,120);// spondine
  // schienale sollevato: tratto della testa più scuro, con piega
  const pose=CUR.pat.pose??1,f=Math.min(1,pose/2);
  if(f>.02){ctx.fillStyle=`rgba(80,92,170,${.18+.3*f})`;ctx.fillRect(b.x,b.y,b.w,112);ctx.fillStyle=`rgba(60,70,140,${.4*f})`;ctx.fillRect(b.x,b.y+112,b.w,4)}
  // cuscino
  ctx.fillStyle='#ffffff';rr(ctx,b.x+16,b.y+10,b.w-32,40,10);ctx.fill();
  ctx.fillStyle='#e3e7fb';ctx.fillRect(b.x+22,b.y+40,b.w-44,6);
}
function drawPatient(ctx,t,cid){
  /* proporzioni a 8 teste: testa = H, mento a 1H, capezzoli 2H, ombelico 3H, inguine 4H, ginocchio 6H, pianta 8H */
  const p=CUR.pat,v=CUR.vit;
  const pose=p.pose??1,coll=p.collapsed||0;
  const ang=(pose<=1?pose*32:32+(pose-1)*50)*Math.PI/180;
  const f=Math.cos(ang);
  const H=36,cx=180,hipY=322;
  const L=H*2.75*(.32+.68*f);// spalle → inguine, accorciato quando il tronco è sollevato
  const sc=1+.2*(1-f);
  const shY=hipY-L;
  const breath=Math.sin(respPh*2*Math.PI)*((v.rr||16)>24?1.6:1);
  const skin=`rgb(${skinRGB.map(Math.round).join(',')})`;
  const look=curCase&&curCase.look;
  const gown=(curSkin&&curSkin.gown)||(look&&look.gown)||GOWN[cid%GOWN.length];const hairC=curSkin?curSkin.hair:(look&&look.hair)||HAIR[cid%HAIR.length];
  // gambe: lunghe 4H dall'inguine alla pianta
  const legEnd=hipY+H*4;
  if(PAT_MODE==='street'){const lg=(curSkin&&curSkin.legs)||'#2c3566';ctx.fillStyle=lg;rr(ctx,cx-25,hipY-4,22,H*4-10,7);ctx.fill();rr(ctx,cx+3,hipY-4,22,H*4-10,7);ctx.fill();ctx.fillStyle='rgba(0,0,0,.18)';ctx.fillRect(cx-2,hipY,4,H*1.2);ctx.fillStyle='#1b1b22';rr(ctx,cx-26,legEnd-16,22,16,6);ctx.fill();rr(ctx,cx+4,legEnd-16,22,16,6);ctx.fill()}
  else{
  ctx.fillStyle='#8592de';ctx.fillRect(BED.x+6,hipY-6,BED.w-12,legEnd-hipY+18);// coperta
  ctx.fillStyle='#97a3e6';ctx.fillRect(BED.x+6,hipY-6,BED.w-12,10);// risvolto
  ctx.fillStyle='#7480d2';
  rr(ctx,cx-27,hipY,24,H*4-8,9);ctx.fill();rr(ctx,cx+3,hipY,24,H*4-8,9);ctx.fill();// rilievo delle gambe
  ctx.fillStyle='#6b77c8';ctx.fillRect(cx-24,hipY+H*2-4,18,6);ctx.fillRect(cx+6,hipY+H*2-4,18,6);// ginocchia
  rr(ctx,cx-26,legEnd-14,20,20,7);ctx.fill();rr(ctx,cx+6,legEnd-14,20,20,7);ctx.fill();// piedi
  }
  // tronco: spalle larghe circa 2H, bacino circa 1,5H
  const sw=(H*1.95+breath*2.5)*sc,hw=H*1.45;
  ctx.fillStyle=gown;ctx.beginPath();
  ctx.moveTo(cx-sw/2,shY+4);ctx.quadraticCurveTo(cx-sw/2,shY-2,cx-sw/2+10,shY-2);ctx.lineTo(cx+sw/2-10,shY-2);ctx.quadraticCurveTo(cx+sw/2,shY-2,cx+sw/2,shY+4);
  ctx.lineTo(cx+hw/2,hipY+2);ctx.lineTo(cx-hw/2,hipY+2);ctx.closePath();ctx.fill();
  ctx.fillStyle='rgba(255,255,255,.16)';for(let k=0;k<3;k++)ctx.fillRect(cx-14+k*12,shY+6,4,L-10);
  ctx.fillStyle=skin;ctx.beginPath();ctx.moveTo(cx-9*sc,shY-2);ctx.lineTo(cx+9*sc,shY-2);ctx.lineTo(cx,shY+8*sc);ctx.closePath();ctx.fill();// scollo
  A.chest=[cx,shY+L*.3];
  if(p.hives>.1){ctx.fillStyle=`rgba(230,70,80,${.85*p.hives})`;[[-16,10],[10,18],[-4,30],[18,6]].forEach(([x,y])=>ctx.fillRect(cx+x*sc,shY+y*sc,5,5))}
  // braccia lungo i fianchi, la mano arriva a metà coscia (5H)
  const tremor=(p.tremor||0)*Math.sin(t*40)*1.8;
  const armL=Math.max(54,(hipY+H*1-shY)*(.55+.45*f)+H*.4);
  for(const s of[-1,1]){
    const ax=cx+s*(sw/2+5*sc),hxx=cx+s*(hw/2+9);
    ctx.strokeStyle=gown;ctx.lineWidth=12*sc;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(ax,shY+6);ctx.lineTo(ax+(hxx-ax)*.3,shY+H*.8);ctx.stroke();// manica
    ctx.strokeStyle=skin;ctx.lineWidth=9*sc;ctx.beginPath();ctx.moveTo(ax+(hxx-ax)*.3,shY+H*.8);ctx.lineTo(hxx,shY+armL);ctx.stroke();
    ctx.fillStyle=skin;ctx.beginPath();ctx.ellipse(hxx+(s>0?tremor:-tremor),shY+armL+6,5.5*sc,8*sc,0,0,7);ctx.fill();// mano
    if(p.hives>.1){ctx.fillStyle=`rgba(230,70,80,${.85*p.hives})`;for(let k=1;k<4;k++)ctx.fillRect(ax+(hxx-ax)*k/4-2,shY+H*.8+(armL-H*.8)*k/4,4,4)}
  }
  ctx.lineCap='butt';
  A.arm=[cx+(hw/2+9),shY+armL*.72];
  if(p.tremor>.1){ctx.fillStyle='#ffc24a';const hx=cx+hw/2+9,hy=shY+armL+8;ctx.fillRect(hx+9,hy-6,3,8);ctx.fillRect(hx+15,hy-3,3,6);ctx.fillRect(cx-hw/2-21,hy-6,3,8)}
  // collo e testa: la testa è lunga H (dal vertice al mento)
  const off=coll*12,tilt=coll*.35;
  const hcx=cx+off,hcy=shY-6*sc-H*.5*sc;
  ctx.fillStyle=skin;ctx.fillRect(cx-6*sc+off*.4,shY-9*sc,12*sc,10*sc);
  ctx.save();ctx.translate(hcx,hcy);ctx.rotate(tilt);ctx.scale(sc,sc);
  const hh=H/2,hwid=H*.4;
  if(hairC){ctx.fillStyle=hairC;ctx.beginPath();ctx.ellipse(0,-3,hwid+3,hh+2,0,0,7);ctx.fill()}
  ctx.fillStyle=skin;ctx.beginPath();ctx.ellipse(0,2,hwid,hh-1,0,0,7);ctx.fill();
  if(hairC){ctx.fillStyle=hairC;ctx.fillRect(-hwid+2,-hh+3,hwid*2-4,6)}// frangia
  ctx.fillStyle=skin;ctx.fillRect(-hwid-3,-1,4,8);ctx.fillRect(hwid-1,-1,4,8);// orecchie
  const eyes=(p.eyes??1)>.5;ctx.fillStyle='#10131f';
  if(eyes){ctx.fillRect(-7,-2,3,3);ctx.fillRect(4,-2,3,3);ctx.fillStyle='#2b2030';ctx.fillRect(-9,-6,6,2);ctx.fillRect(3,-6,6,2)}
  else{ctx.fillRect(-9,0,6,2);ctx.fillRect(3,0,6,2)}
  ctx.fillStyle='rgba(0,0,0,.18)';ctx.fillRect(-1,2,3,5);
  const dr=(p.droop||0)*3.5;const lip=(TGT.pat.skin==='cyan'||TGT.pat.skin==='grey')?'#5a6fa8':'#9a4444';
  ctx.fillStyle=lip;ctx.beginPath();ctx.moveTo(-5,10+dr);ctx.lineTo(5,10);ctx.lineTo(5,12);ctx.lineTo(-5,12+dr);ctx.closePath();ctx.fill();
  if(p.sweat>.1){ctx.fillStyle=`rgba(150,215,255,${.9*p.sweat})`;for(let k=0;k<3;k++){const ph=(t*.7+k*.33)%1;ctx.fillRect(-9+k*8,-9+ph*10,2,4)}}
  if(p.hives>.1){ctx.fillStyle=`rgba(230,70,80,${.8*p.hives})`;[[-10,6],[7,7]].forEach(([x,y])=>ctx.fillRect(x,y,3,3))}
  if(curSkin&&curSkin.extra)curSkin.extra(ctx,hwid,hh,(p.eyes??1)>.5,t);
  ctx.restore();
  A.head=[hcx,hcy];
  if(coll>.5&&Math.floor(t*3)%2){ctx.fillStyle=C.bad;ctx.font='700 22px Silkscreen,monospace';ctx.fillText('!',hcx+22,hcy-12)}
}
function drawNurse(ctx,t){
  const x=nurse.x,y=nurse.y,walking=Math.hypot(nurse.tx-nurse.x,nurse.ty-nurse.y)>2;
  const sw=walking?Math.sin(t*10)*6:0;
  ctx.fillStyle='rgba(5,8,28,.35)';ctx.beginPath();ctx.ellipse(x+4,y+6,34,22,0,0,7);ctx.fill();
  // braccio esterno con cartella
  ctx.fillStyle='#1f7f86';ctx.fillRect(x-36,y-6+sw,12,26);ctx.fillStyle='#b8805a';ctx.fillRect(x-35,y+18+sw,10,9);
  ctx.fillStyle='#c9cfee';ctx.fillRect(x-48,y+10+sw,18,24);ctx.fillStyle='#8a93c6';ctx.fillRect(x-45,y+15+sw,12,2);ctx.fillRect(x-45,y+20+sw,10,2);ctx.fillRect(x-45,y+25+sw,12,2);
  // spalle
  ctx.fillStyle='#1f7f86';rr(ctx,x-28,y-16,56,32,14);ctx.fill();
  ctx.fillStyle='#176a70';ctx.fillRect(x-28,y-2,56,4);
  // braccio verso il letto
  const target=NURSE_TGT||A[LENSAT[TGT.phys.mode]||'chest'];
  const sx=x+24,sy=y-4,idle=[x+34,y+18];
  const hx=idle[0]+(target[0]-idle[0])*nurse.reach,hy=idle[1]+(target[1]-idle[1])*nurse.reach;
  ctx.strokeStyle='#1f7f86';ctx.lineWidth=12;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo((sx+hx)/2,(sy+hy)/2);ctx.stroke();
  ctx.strokeStyle='#b8805a';ctx.lineWidth=9;ctx.beginPath();ctx.moveTo((sx+hx)/2,(sy+hy)/2);ctx.lineTo(hx,hy);ctx.stroke();
  ctx.fillStyle='#b8805a';ctx.beginPath();ctx.arc(hx,hy,6,0,7);ctx.fill();
  // testa vista dall'alto: capelli e chignon
  ctx.fillStyle='#24160f';ctx.beginPath();ctx.arc(x+2,y,16,0,7);ctx.fill();
  ctx.fillStyle='#31201a';ctx.beginPath();ctx.arc(x-10,y-2,7,0,7);ctx.fill();
  ctx.fillStyle='#b8805a';ctx.fillRect(x+14,y-4,4,8);// naso che sporge verso il letto
  ctx.fillStyle='#ffc24a';ctx.fillRect(x+6,y+14,8,5);
  if(nurse.q>0){nurse.q-=1/60;ctx.fillStyle='#eef0ff';rr(ctx,x-10,y-52,26,24,4);ctx.fill();ctx.fillStyle='#ff6f7d';ctx.font='700 20px Silkscreen,monospace';ctx.fillText('?',x-4,y-33)}
  if(nurse.cheer>0){nurse.cheer-=1/60;ctx.fillStyle='#6fe39a';for(let k=0;k<5;k++){const a=t*3+k*1.26;ctx.fillRect(x+Math.cos(a)*34,y+Math.sin(a)*26,4,4)}}
}
function drawLens(ctx,t,dt){
  const m=TGT.phys.mode;if(!m)return;
  lensPop=Math.min(1,lensPop+dt*2.2);const e=1-Math.pow(1-lensPop,3);
  const anc=A[LENSAT[m]||'chest'];
  const R=62*e;if(R<2)return;
  const cx=W-66,cy=Math.max(218,Math.min(440,anc[1]+20));
  const dx=anc[0]-cx,dy=anc[1]-cy,dd=Math.hypot(dx,dy)||1;
  ctx.strokeStyle='rgba(238,240,255,.8)';ctx.lineWidth=2;ctx.setLineDash([4,5]);ctx.beginPath();ctx.moveTo(anc[0],anc[1]);ctx.lineTo(cx+dx/dd*R,cy+dy/dd*R);ctx.stroke();ctx.setLineDash([]);
  ctx.strokeStyle='#ffc24a';ctx.lineWidth=2;ctx.strokeRect(anc[0]-5,anc[1]-5,10,10);
  const [x0,y0,s]=CROP[m]||[0,0,260];
  tctx.imageSmoothingEnabled=true;tctx.clearRect(0,0,96,96);tctx.drawImage(physOff,x0*2,y0*2,s*2,s*2,0,0,96,96);
  ctx.save();ctx.beginPath();ctx.arc(cx,cy,R,0,7);ctx.clip();
  ctx.fillStyle='#070b22';ctx.fillRect(cx-R,cy-R,R*2,R*2);
  ctx.imageSmoothingEnabled=false;ctx.drawImage(tiny,cx-R,cy-R,R*2,R*2);
  ctx.fillStyle='rgba(5,8,28,.22)';for(let y=cy-R;y<cy+R;y+=4)ctx.fillRect(cx-R,y,R*2,2);
  ctx.restore();
  ctx.strokeStyle='#eef0ff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(cx,cy,R,0,7);ctx.stroke();
  ctx.strokeStyle='rgba(238,240,255,.25)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(cx,cy,R+6,0,7);ctx.stroke();
  const lab=(LENSNAME[m]||'').toUpperCase();ctx.font='700 10px Silkscreen,monospace';const tw=ctx.measureText(lab).width+12;
  const lx=Math.min(W-tw-4,cx-tw/2);
  ctx.fillStyle='#0b1030';ctx.fillRect(lx,cy+R+6,tw,17);ctx.strokeStyle='#5ee0d0';ctx.lineWidth=2;ctx.strokeRect(lx,cy+R+6,tw,17);
  ctx.fillStyle='#5ee0d0';ctx.fillText(lab,lx+6,cy+R+18);
  LENS={cx,cy,R};
}
let LENS={cx:0,cy:0,R:0};


/* ===== Display LCD ===== */
let hist=[],histT=0,trendRef=[null,null],trendT=0;
const $=id=>document.getElementById(id);
const sparkCtx=$('spark').getContext('2d');
function fmt(v,d){return v==null||isNaN(v)?'--':v.toFixed(d||0)}
function updateHud(dt){
  if(!curCase||!curCase.hud)return;
  const [a,b]=curCase.hud,va=hudValue(a,CUR),vb=hudValue(b,CUR);
  $('h1v').textContent=fmt(va,a.d);$('h1u').textContent=a.u;
  $('h2v').textContent=b.bar?barTxt(vb):fmt(vb,b.d)+(b.u?' '+b.u:'');
  trendT+=dt;if(trendT>1.2){trendT=0;trendRef=[va,vb]}
  const st=$('h2s');let s,c;
  const out=x=>x!=null&&(x<b.lo||x>b.hi);
  const outA=va!=null&&(va<a.lo||va>a.hi);
  if(out(vb)){s=vb<b.lo?'basso':'alto';c='bad'}
  else if(outA){s='attenzione';c='warn'}
  else{const d=trendRef[0]!=null&&va!=null?va-trendRef[0]:0;s=Math.abs(d)<.02*Math.max(1,Math.abs(va||1))?'stabile':d<0?'in calo':'in salita';c='ok'}
  st.textContent=s;st.className='st '+c;
  $('h1v').parentElement.style.color=outA?'var(--bad)':'var(--amber)';
  histT+=dt;if(histT>.12){histT=0;hist.push(va);if(hist.length>120)hist.shift();drawSpark(a)}
  // parametri vitali
  const v=CUR.vit;
  const setV=(id,val,alarm)=>{const el=$(id);el.querySelector('b').textContent=val;el.classList.toggle('alarm',!!alarm)};
  setV('vHr',fmt(v.hr),v.hr>130||v.hr<45);
  setV('vBp',v.sys!=null?Math.round(v.sys)+'/'+Math.round(v.dia):'--',v.sys<90||v.sys>180);
  setV('vSp',fmt(v.spo2),v.spo2<90);
  setV('vRr',fmt(v.rr),v.rr<9||v.rr>25);
  setV('vT',fmt(v.temp,1),v.temp>=38.5);
}
function barTxt(v){if(v==null)return'--';const n=Math.round(Math.max(0,Math.min(100,v))/10);return '▮'.repeat(n)+'▯'.repeat(10-n)}
function drawSpark(a){const c=sparkCtx,w=400,h=44;c.clearRect(0,0,w,h);
  c.fillStyle='#1b2560';for(let x=0;x<w;x+=20)c.fillRect(x,h-2,1,2);
  const vals=hist.filter(x=>x!=null);if(vals.length<2)return;
  let mn=Math.min(...vals,a.lo),mx=Math.max(...vals,a.hi===101?100:a.hi);if(mx-mn<1)mx=mn+1;
  const Y=v=>h-4-(v-mn)/(mx-mn)*(h-10);
  c.strokeStyle='rgba(255,111,125,.35)';c.setLineDash([3,4]);c.beginPath();c.moveTo(0,Y(a.lo));c.lineTo(w,Y(a.lo));c.stroke();c.setLineDash([]);
  c.strokeStyle='#ffc24a';c.lineWidth=2;c.beginPath();
  hist.forEach((v,i)=>{if(v==null)return;const x=w-(hist.length-1-i)*(w/119);i?c.lineTo(x,Y(v)):c.moveTo(x,Y(v))});c.stroke();
  const lv=hist[hist.length-1];if(lv!=null){c.fillStyle='#ffc24a';c.fillRect(w-5,Y(lv)-3,5,5)}}

/* ===== Didascalie a macchina da scrivere ===== */
let capTimer=null;
function caption(text,kind){const el=$('cap');clearInterval(capTimer);if(!text){el.hidden=true;return}
  el.hidden=false;el.className=kind||'';el.textContent='';let i=0;
  capTimer=setInterval(()=>{i++;if(text[i-1]&&text[i-1]!==' ')sfx('blip');el.textContent=text.slice(0,i)+(i<text.length?'▌':'');if(i>=text.length)clearInterval(capTimer)},28)}

/* ===== Loop ===== */
let last=performance.now(),T0=performance.now(),running=false;
function loop(now){const dt=Math.min(.05,(now-last)/1000);last=now;const t=(now-T0)/1000;
  stepTowards(dt);if(!$('street').hidden&&EV){drawStreet(t,dt);updateStreetHud();drawNeuro(t,dt)}else{drawPhys(t,dt);drawScene(t,dt);updateHud(dt);drawNeuro(t,dt)}
  if(!$('detail').hidden){const c=detail.ctx;c.imageSmoothingEnabled=true;c.clearRect(0,0,420,260);c.drawImage(physOff,0,0,420,260)}
  if(running)requestAnimationFrame(loop)}

/* ===== UI ===== */
let curCase=null,stepI=0,hearts=3,errors=0,answered=false,busy=false,preSeq=null,wrongs=[];
const SECTIONS=['home','game','result','glossary','street','auth','account','tutor','privacy'];
function show(id){SECTIONS.forEach(s=>{const el=$(s);if(el)el.hidden=s!==id});window.scrollTo(0,0)}
const pad=n=>String(n).padStart(2,'0');
/* capitoli: in home e nel gioco ci sono solo i casi dei capitoli aperti, nell'ordine dei capitoli;
   il numero dell'episodio è la posizione in quell'ordine (l'id del caso resta fisso per i progressi) */
const BYID=new Map(CASES.map(c=>[c.id,c]));
const OPEN=CHAPTERS.filter(ch=>ch.status==='aperto').map(ch=>({...ch,list:ch.cases.map(id=>BYID.get(id)).filter(Boolean)}));
const PLAY=OPEN.flatMap(ch=>ch.list);
const TOTAL=Math.max(PLAY.length,...CHAPTERS.map(ch=>ch.planned?ch.planned[1]:0));
const epNum=c=>PLAY.indexOf(c)+1||c.id;
function renderHome(){if(typeof setMusicContext==='function'&&AU.ctx)setMusicContext('home');
  const box=$('chapters');box.innerHTML='';let done=0,st=0;
  OPEN.forEach(ch=>{
    const sec=document.createElement('div');sec.className='chapter';sec.style.marginTop='22px';
    const first=epNum(ch.list[0]),last=epNum(ch.list[ch.list.length-1]);
    sec.innerHTML=`<div class="chapter-head"><h2>Stagione ${ch.season} · ${ch.title}</h2><span class="eyebrow">Episodi ${first}–${last} · tutti aperti</span></div><div class="levels"></div>`;
    const lv=sec.querySelector('.levels');
    ch.list.forEach(c=>{const b=prog.best[c.id]||0;if(b)done++;st+=b;
      const el=document.createElement('button');el.className='lvl'+(b?' done':' next');
      el.innerHTML=`<span class="num">${pad(epNum(c))}</span><span><span class="t">${c.title}</span><span class="a">${c.area} · <span class="d d-${c.diff}">${c.diff}</span></span><span class="a">${c.hook}</span><span class="stars">${b?'★'.repeat(b)+'☆'.repeat(3-b):'▶ Da giocare'}</span></span>`;
      el.onclick=()=>startCase(CASES.indexOf(c));lv.appendChild(el)});
    box.appendChild(sec)});
  prog.ev=prog.ev||{};$('evList').innerHTML=EVENTS.map((e,i)=>{const b=prog.ev[e.id]||0;return `<button class="lvl evl${b?' done':' next'}" data-ev="${i}"><span class="num">!</span><span><span class="t">${e.title}</span><span class="a">${e.place} · <span class="d d-${e.diff}">${e.diff}</span></span><span class="stars">${b?'★'.repeat(b)+'☆'.repeat(3-b):'▶ Da giocare'}</span></span></button>`}).join('');
  document.querySelectorAll('#evList .evl').forEach(b=>b.onclick=()=>startEvent(+b.dataset.ev));
  const road=CHAPTERS.filter(ch=>ch.status==='in-arrivo');
  $('roadBlock').hidden=!road.length;
  $('road').innerHTML=road.map(ch=>`<div><span>${ch.planned?`EP. ${ch.planned[0]}–${ch.planned[1]}`:`Stagione ${ch.season}`}</span><b>${ch.title}</b>In preparazione</div>`).join('');
  const pl=road.filter(ch=>ch.planned);$('roadRange').textContent=pl.length?`Episodi ${Math.min(...pl.map(ch=>ch.planned[0]))}–${Math.max(...pl.map(ch=>ch.planned[1]))}`:'';
  $('stXp').textContent=prog.xp;$('stDone').textContent=done+'/'+TOTAL;$('stStars').textContent=st+'/'+PLAY.length*3;
}
function renderHearts(){$('hearts').innerHTML=[0,1,2].map(i=>`<span class="${i<hearts?'':'off'}">♥</span>`).join('')}
function startCase(i,drawn){
  seqTok++;busy=false;clearOut();deaths=0;curCase=CASES[i];stepI=0;hearts=3;errors=0;wrongs=[];hist=[];
  TGT.vit={};TGT.pat={...PAT0};TGT.phys={};
  PAT_MODE='bed';NURSE_TGT=null;curSkin=pickSkin();
  setState(curCase.base,true);skinRGB=skinTarget();physInit();lensPop=0;
  nurse.x=-70;nurse.y=520;nurse.tx=66;nurse.ty=268;nurse.treach=0;nurse.reach=0;
  $('gLevel').textContent='Episodio '+pad(epNum(curCase))+' · '+curCase.area+' · '+curCase.diff;$('gTitle').textContent=curCase.title;
  $('hBrand').textContent='TURNO DI NOTTE · EP. '+pad(epNum(curCase));
  $('h1l').textContent=curCase.hud[0].l;$('h2l').textContent=curCase.hud[1].l;
  $('introArea').textContent=curCase.area;$('introPt').textContent=curCase.pt;$('skinLine').textContent=curSkin?'Aspetto del paziente: '+curSkin.name+' · è solo un costume, il caso clinico è reale':'';$('skinLine').hidden=!curSkin;$('introText').innerHTML=linkify(curCase.intro);$('introScheda').innerHTML=(curCase.scheda||[]).map(([k,v])=>`<dt>${esc(k)}</dt><dd>${linkify(v)}</dd>`).join('');
  $('introCard').hidden=false;$('stepCard').hidden=true;$('introDraw').hidden=!drawn;$('btnReroll').hidden=!drawn;renderHearts();$('progBar').style.width='0%';
  helps=3;renderHelps();$('nBubble').hidden=true;
  show('game');caption(curCase.hook,'q');sfx('jingle');setMusicContext('case');ACTQ=[];
  if(!running){running=true;last=performance.now();requestAnimationFrame(loop)}
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let seqTok=0,snap=null,deaths=0,outTimers=[];
const clone=o=>JSON.parse(JSON.stringify(o));
function takeSnap(){snap=clone({vit:TGT.vit,pat:TGT.pat,phys:TGT.phys})}
function clearOut(){outTimers.forEach(clearTimeout);outTimers=[];$('death').hidden=true;$('stage').classList.remove('crit')}
function setLock(b,on){b.classList.toggle('locked',on)}
async function playSeq(seq){const tok=++seqTok;busy=true;setMood('tense');$('sOpts').querySelectorAll('button').forEach(b=>setLock(b,true));
  for(const s of seq){if(tok!==seqTok)return;caption(s.cap||'');setState(s.s);await sleep(s.d*1000+400)}
  await sleep(300);if(tok!==seqTok)return;busy=false;takeSnap();setMood('calm');
  const cs=curCase.steps[stepI];caption(cs&&cs.fis?'Perché?':'Tocca a te','q');
  if(!answered)$('sOpts').querySelectorAll('button:not(.wrong):not(.elim)').forEach(b=>setLock(b,false))}
const TAGCAP={ABCDE:'Valuta: ABCDE',Rivalutazione:'Rivaluta',Valutazione:'Valuta',Decisione:'Decidi',Fisiologia:'Perché?',Anatomia:'Anatomia'};
function renderStep(){
  clearOut();$('nBubble').hidden=true;
  const s=curCase.steps[stepI];answered=false;nurse.treach=0;
  $('introCard').hidden=true;$('stepCard').hidden=false;
  $('sTag').textContent=s.tag==='ABCDE'?'Valutazione ABCDE':s.tag;$('sTag').className='tag'+(s.fis?' fis':s.ana?' ana':s.abcde?' abc':'');
  $('sText').innerHTML=linkify(s.text);$('sQ').innerHTML=linkify(s.q);$('sFb').hidden=true;$('sLearn').hidden=true;$('sPhy').hidden=true;$('btnNext').hidden=true;$('rewRow').hidden=true;
  $('progBar').style.width=(stepI/curCase.steps.length*100)+'%';
  if(s.physMode)setState({phys:s.physMode});
  if(s.state)setState(s.state);
  const opts=s.opts.map((o,i)=>({...o,i}));if(!s.abcde)opts.sort(()=>Math.random()-.5);
  $('sOpts').innerHTML='';opts.forEach((o,j)=>{const b=document.createElement('button');b.className='opt';b.innerHTML=`<span class="k">${'ABCDE'[j]}</span><span>${linkify(o.t)}</span>`;b._o=o;b.onclick=()=>{if(b.classList.contains('locked'))return;answer(o,b)};$('sOpts').appendChild(b)});
  $('replayRow').hidden=!s.seq;
  if(s.abcde)buildAbc(s);else{$('abcPanel').hidden=true;$('sQ').hidden=false;$('sOpts').hidden=false}
  if(s.seq){preSeq=clone({vit:TGT.vit,pat:TGT.pat,phys:TGT.phys});playSeq(s.seq)}
  else{takeSnap();caption(TAGCAP[s.tag]||s.tag,'q')}
}
let abcI=0;
function buildAbc(s){const P=$('abcPanel');P.hidden=false;$('sQ').hidden=true;$('sOpts').hidden=true;abcI=0;
  P.innerHTML=['A','B','C','D','E'].map(L=>`<div class="abcrow" data-l="${L}"><button class="abcbtn" data-l="${L}">${L}</button><div class="abct"><b>${ABC_L[L][0]} <span>${ABC_L[L][1]}</span></b><span class="abcf">${L==='A'?'Tocca la lettera per valutare':'In attesa'}</span></div></div>`).join('');
  markAbc()}
function markAbc(){document.querySelectorAll('#abcPanel .abcrow').forEach((r,i)=>{r.classList.toggle('done',i<abcI);r.classList.toggle('now',i===abcI)})}
document.addEventListener('click',e=>{const b=e.target.closest('.abcbtn');if(!b||e.target.closest('.gl'))return;const s=curCase&&curCase.steps[stepI];if(!s||!s.abcde)return;
  const L=b.dataset.l,order=['A','B','C','D','E'];
  if(busy){caption('Aspetta la fine della scena','q');return}
  if(order.indexOf(L)!==abcI){if(order.indexOf(L)>abcI){sfx('wrong');caption('Prima '+order[abcI]+': l\'ordine conta','bad')}return}
  const row=b.closest('.abcrow');const isBad=(s.abcde.bad||'').includes(L);row.classList.add(isBad?'bad':'good');row.querySelector('.abcf').innerHTML=`<span class="abcflag">${isBad?'Alterato':'Nella norma'}</span>`+linkify(s.abcde[L]);if(isBad)sfx('worse');playActs([ABC_ACT[L]],true);nurse.treach=1;setTimeout(()=>{nurse.treach=0},1300);caption(ABC_ACT[L].lab,'q');
  abcI++;markAbc();const nx=row.nextElementSibling;if(nx)nx.querySelector('.abcf').textContent='Tocca la lettera per valutare';
  if(abcI>=5){setTimeout(()=>{$('sQ').hidden=false;$('sOpts').hidden=false;caption('Qual è la priorità?','q');sfx('open');$('sQ').scrollIntoView({block:'nearest',behavior:'smooth'})},700)}});
function lockOpts(){$('sOpts').querySelectorAll('button').forEach(x=>setLock(x,true))}
function answer(o,b){if(busy||answered)return;const s=curCase.steps[stepI];
  const fb=$('sFb');fb.hidden=false;
  if(o.ok){answered=true;b.classList.add('right');lockOpts();
    fb.className='fb ok';fb.innerHTML=`<b>Corretto</b>${linkify(o.fb)}`;
    if(s.phy){$('sPhy').hidden=false;$('sPhyS').innerHTML=linkify(s.phy[0]);$('sPhyE').innerHTML=linkify(s.phy[1])}
    if(s.learn){$('sLearn').hidden=false;$('sLearnT').innerHTML=linkify(s.learn)}
    nurse.treach=1;nurse.cheer=1.6;outTimers.push(setTimeout(()=>{nurse.treach=0},2400));
    if(s.out)outTimers.push(setTimeout(()=>setState(s.out),600));
    caption(s.win||'Giusto','ok');sfx('correct');playActs(actsFor(o.t,s.kn),true);
    $('btnNext').hidden=false;$('btnNext').textContent=stepI===curCase.steps.length-1?'Concludi →':'Avanti →';$('replayRow').hidden=true;
    return}
  const x=o.x!=null?o.x:(s.kn?0:1);
  sfx('wrong');playActs(actsFor(o.t,s.kn),false);
  b.classList.add('wrong');setLock(b,true);errors++;hearts--;renderHearts();nurse.q=1.8;
  wrongs.push({step:stepI,tag:s.tag,opt:o.i,text:o.t,x});
  const head=x===0?'Sbagliato':x===2&&o.dead?'Il paziente è morto':x===2?'Evento critico':'Il paziente peggiora';
  fb.className='fb no';fb.innerHTML=`<b>${head}</b>${linkify(o.fb)}`;
  if(x===0){caption('Sbagliato','bad');if(hearts<=0)outTimers.push(setTimeout(()=>finish(false),1400));return}
  // esito animato
  lockOpts();busy=true;nurse.treach=.6;
  caption(o.end||head,'bad');
  if(o.s)setState(o.s);
  if(x===2){$('stage').classList.add('crit');setMood('tense')}
  if(!o.dead)outTimers.push(setTimeout(()=>sfx('worse'),900));
  if(o.dead){deaths++;
    outTimers.push(setTimeout(()=>{const ecg=(o.s&&o.s.vit&&o.s.vit.ecg==='vf')?'vf':'asystole';setMood('none');sfx(ecg==='vf'?'vf':'death');if(ecg==='vf')outTimers.push(setTimeout(()=>sfx('death'),900));setState({vit:{...DEATH.vit,ecg},pat:DEATH.pat});caption('Decesso','bad')},1800));
    outTimers.push(setTimeout(()=>{setState({vit:{ecg:'asystole'}});$('deathSub').textContent=o.end||'';$('death').hidden=false},3600));
  }
  outTimers.push(setTimeout(()=>{busy=false;nurse.treach=0;
    if(hearts<=0){finish(false);return}
    $('rewRow').hidden=false;$('btnRewind').focus({preventScroll:true})},o.dead?4200:2400));
}
function rewind(){if(!snap)return;clearOut();sfx('rewind');setMood('calm');ACTQ=[];setState(clone(snap));$('rewRow').hidden=true;$('sFb').hidden=true;
  caption('Riavvolto: scegli di nuovo','q');
  $('sOpts').querySelectorAll('button:not(.wrong):not(.elim)').forEach(b=>setLock(b,false))}
$('btnStart').onclick=()=>renderStep();
$('btnNext').onclick=()=>{stepI++;if(stepI>=curCase.steps.length)finish(true);else renderStep()};
$('btnReplay').onclick=()=>{if(busy||!preSeq)return;setState(preSeq);setTimeout(()=>playSeq(curCase.steps[stepI].seq),700)};
$('btnRewind').onclick=rewind;
function finish(win){
  clearOut();$('progBar').style.width='100%';caption('');
  const c=curCase;$('rLevel').textContent='Episodio '+pad(epNum(c))+' · '+c.area;
  emitAttempt({kind:'case',item:c.id,win,stars:win?(errors===0?3:errors===1?2:1):0,errors,deaths,wrongs});
  if(win){sfx('win');setMusicContext('win');const st=errors===0?3:errors===1?2:1;const xp=c.steps.length*100-errors*40+st*50;
    const prev=prog.best[c.id]||0;if(st>prev)prog.best[c.id]=st;prog.xp+=Math.max(0,xp);save();
    $('rTitle').textContent=c.hook;$('rStars').innerHTML=[0,1,2].map(i=>`<span class="${i<st?'':'off'}">★</span>`).join('');
    $('rMsg').textContent=`Caso risolto · +${xp} punti esperienza · ${errors} ${errors===1?'errore':'errori'}${deaths?' · '+deaths+(deaths===1?' decesso':' decessi')+' evitati riavvolgendo':''}`;
  }else{setMusicContext('loss');$('rTitle').textContent=deaths?'Il paziente non ce l\'ha fatta':'Il paziente è peggiorato';$('rStars').innerHTML='<span class="off">★★★</span>';$('rMsg').textContent='Hai finito i tre cuori. Rileggi le spiegazioni e riprova l\'episodio.';}
  $('rRecap').innerHTML=c.steps.map(s=>`<li>${linkify(s.learn)}</li>`).join('');
  $('rSrc').innerHTML=c.src.map(s=>`<li>${s}</li>`).join('');
  $('btnNextLvl').hidden=!win||PLAY.indexOf(c)<0||PLAY.indexOf(c)===PLAY.length-1;
  if(Math.random()<.45){const ei=pickEvent(-1);$('evTeaseT').textContent='> '+EVENTS[ei].tease;$('evTeaseBtn').onclick=()=>{$('evTeaser').hidden=true;startEvent(ei)};$('evTeaser').hidden=false}else $('evTeaser').hidden=true;
  show('result');
}
$('btnBack').onclick=()=>{renderHome();show('home')};
$('btnMap').onclick=()=>{renderHome();show('home')};
$('btnRetry').onclick=()=>startCase(CASES.indexOf(curCase));
$('btnNextLvl').onclick=()=>startCase(CASES.indexOf(PLAY[PLAY.indexOf(curCase)+1]));
function toggleLens(){const d=$('detail');d.hidden=!d.hidden;$('btnLens').textContent=d.hidden?'Ingrandisci la lente':'Chiudi la lente';if(!d.hidden)d.scrollIntoView({block:'nearest',behavior:'smooth'})}
$('btnLens').onclick=toggleLens;
$('cvScene').addEventListener('click',e=>{const r=e.target.getBoundingClientRect();const x=(e.clientX-r.left)/r.width*W,y=(e.clientY-r.top)/r.height*H;if(Math.hypot(x-LENS.cx,y-LENS.cy)<LENS.R)toggleLens()});

/* ===== Glossario: collegamento automatico e scheda ===== */
const GLK={};GL.forEach(e=>GLK[e[0]]={k:e[0],n:e[1],t:e[2],p:e[3],c:e[4],r:e[5]});
const GLPAT=[];GL.forEach(e=>e[3].forEach(p=>{const cs=p[0]==='!';const src=cs?p.slice(1):p;GLPAT.push({k:e[0],cs,src,len:src.replace(/\\|\[[^\]]*\]/g,'x').length})}));
GLPAT.sort((a,b)=>b.len-a.len);
const GLRE=new RegExp('(?<![\\p{L}\\p{N}])(?:'+GLPAT.map((p,i)=>`(?<g${i}>${p.src})`).join('|')+')(?![\\p{L}\\p{N}])','giu');
GLPAT.forEach(p=>{if(p.cs)p.re=new RegExp('^(?:'+p.src+')$','u')});
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function linkify(text,self){
  const s=esc(text);let out='',last=0;
  GLRE.lastIndex=0;let m;
  while((m=GLRE.exec(s))){
    let idx=-1;for(const g in m.groups){if(m.groups[g]!==undefined){idx=+g.slice(1);break}}
    const p=GLPAT[idx];
    if(!p||(p.cs&&!p.re.test(m[0]))||p.k===self)continue;
    out+=s.slice(last,m.index)+`<span class="gl" data-k="${p.k}" tabindex="0">${m[0]}</span>`;last=m.index+m[0].length;
  }
  return out+s.slice(last);
}
const FIELDS=[['pa','Principio attivo'],['cl','Classe'],['d','Definizione'],['mec','Meccanismo d\'azione'],['ind','Indicazioni'],['vie','Vie e dosi indicative'],['val','Valori di riferimento'],['av','Effetti avversi'],['int','Interazioni con altri farmaci'],['inf','Note infermieristiche'],['ap','Approfondimento']];
let glStack=[];
function openGloss(k,push){
  const e=GLK[k];if(!e)return;
  if(push!==false){if(glStack[glStack.length-1]!==k)glStack.push(k)}sfx('open');
  $('glType').textContent=e.t;$('glName').textContent=e.n;
  let h='';FIELDS.forEach(([f,lab])=>{if(e.c[f])h+=`<div class="glf"><span class="eyebrow">${lab}</span><p>${linkify(e.c[f],k)}</p></div>`});
  if(e.t.indexOf('Farmaco')>-1&&e.c.vie)h+=`<p class="glnote">Dosi indicative per l'adulto, a scopo didattico. In reparto valgono la prescrizione medica, la scheda tecnica e i protocolli locali.</p>`;
  if(e.r.length)h+=`<div class="glf"><span class="eyebrow">Voci collegate</span><div class="chips">${e.r.filter(r=>GLK[r]).map(r=>`<button class="chip" data-k="${r}">${GLK[r].n}</button>`).join('')}</div></div>`;
  $('glBody').innerHTML=h;$('glBody').scrollTop=0;
  $('glBack').hidden=glStack.length<2;
  $('glSheet').hidden=false;$('glShade').hidden=false;
  $('glClose').focus({preventScroll:true});
}
function closeGloss(){$('glSheet').hidden=true;$('glShade').hidden=true;glStack=[]}
document.addEventListener('click',ev=>{
  const g=ev.target.closest('.gl,.chip,.glitem');if(!g)return;
  ev.preventDefault();ev.stopPropagation();openGloss(g.dataset.k);
},true);
document.addEventListener('keydown',ev=>{
  if(ev.key==='Escape'&&!$('glSheet').hidden){closeGloss();return}
  const g=ev.target.closest&&ev.target.closest('.gl');
  if(g&&(ev.key==='Enter'||ev.key===' ')){ev.preventDefault();ev.stopPropagation();openGloss(g.dataset.k)}
},true);
$('glClose').onclick=closeGloss;$('glShade').onclick=closeGloss;
$('glBack').onclick=()=>{glStack.pop();openGloss(glStack[glStack.length-1],false)};
// pagina glossario
function renderGlossList(q){
  q=(q||'').trim().toLowerCase();
  const list=Object.values(GLK).filter(e=>!q||e.n.toLowerCase().includes(q)||e.t.toLowerCase().includes(q)||(e.c.d||e.c.mec||'').toLowerCase().includes(q)).sort((a,b)=>a.n.localeCompare(b.n,'it'));
  let h='',cur='';
  list.forEach(e=>{const L=e.n[0].toUpperCase();if(L!==cur){cur=L;h+=`<div class="glletter">${L}</div>`}
    h+=`<button class="glitem" data-k="${e.k}"><b>${esc(e.n)}</b><span>${esc(e.t)}</span></button>`});
  $('glList').innerHTML=h||'<p class="note">Nessuna voce trovata. Prova con un altro termine.</p>';
  $('glCount').textContent=list.length+' voci';
}
$('glSearch').addEventListener('input',e=>renderGlossList(e.target.value));
$('btnGloss').onclick=()=>{renderGlossList($('glSearch').value);show('glossary')};
$('btnGlossBack').onclick=()=>{renderHome();show('home')};

/* ===== Neuro: il cervellino che aiuta (3 aiuti per caso) ===== */
let helps=3,neuroJump=0,neuroSad=0,neuroBlink=0;
const nCan=$('cvNeuro'),nCtx=nCan.getContext('2d');nCtx.imageSmoothingEnabled=false;
function drawNeuro(t,dt){
  const c=nCtx;c.clearRect(0,0,40,40);
  neuroJump=Math.max(0,neuroJump-dt);neuroSad=Math.max(0,neuroSad-dt);
  const jy=neuroJump>0?-Math.round(Math.sin((1-neuroJump/1.2)*Math.PI)*8):Math.round(Math.sin(t*2.2));
  const spin=neuroJump>0?Math.sin((1-neuroJump/1.2)*Math.PI*2)*2:0;
  const P=(x,y,w,h,col)=>{c.fillStyle=col;c.fillRect(x+Math.round(spin),y+jy,w,h)};
  // ombra
  c.fillStyle='rgba(0,0,0,.25)';c.fillRect(10,36,20,2);
  // corpo del cervello: due emisferi a lobi
  const body='#ff9ec4',dark='#c8558d',lite='#ffc7de';
  [[8,8,12,10],[20,8,12,10],[6,12,28,14],[8,24,24,6],[12,6,16,4]].forEach(([x,y,w,h])=>P(x,y,w,h,body));
  P(6,12,2,12,dark);P(32,12,2,12,dark);P(8,8,2,4,dark);P(30,8,2,4,dark);P(12,6,16,2,dark);P(8,30,24,2,dark);P(6,24,2,6,dark);P(32,24,2,6,dark);
  P(19,8,2,22,dark);// solco tra gli emisferi
  P(10,10,4,2,lite);P(24,10,4,2,lite);// riflessi
  P(10,22,6,2,dark);P(24,20,6,2,dark);P(12,16,2,4,dark);P(27,14,2,4,dark);// circonvoluzioni
  // occhi grandi
  const blink=(Math.floor(t*10)%42===0)||neuroBlink>0;neuroBlink=Math.max(0,neuroBlink-dt);
  const look=Math.round(Math.sin(t*.9)*1.4);
  if(blink){P(11,16,7,2,'#2b1030');P(22,16,7,2,'#2b1030')}
  else{P(11,13,7,8,'#ffffff');P(22,13,7,8,'#ffffff');
    const py=neuroSad>0?17:15;P(13+look,py,3,4,'#1a1030');P(24+look,py,3,4,'#1a1030');P(13+look,py,1,1,'#ffffff');P(24+look,py,1,1,'#ffffff')}
  // niente bocca né guance: solo gli occhi
  // lampadina e scintille durante il salto
  if(neuroJump>0){const a=Math.min(1,(1.2-neuroJump)*3);c.globalAlpha=a;
    P(18,-2+jy*0-jy,4,4,'#ffd84d');
    c.fillStyle='#ffd84d';for(let k=0;k<6;k++){const an=k*1.05+t*4,r=16+(1.2-neuroJump)*6;c.fillRect(20+Math.cos(an)*r,20+Math.sin(an)*r,2,2)}
    c.globalAlpha=1}
  if(neuroSad>0){c.fillStyle='#7fd6ff';c.fillRect(9,20+((t*20)%8),2,3)}
}
function renderHelps(){$('nCount').textContent=helps;$('btnNeuro').classList.toggle('empty',helps<=0)}
function neuroSay(text,mood){const b=$('nBubble');b.hidden=false;b.className='nbubble'+(mood?' '+mood:'');
  const el=$('nText');el.innerHTML='';let i=0;const plain=text;clearInterval(neuroSay.tm);
  neuroSay.tm=setInterval(()=>{i+=2;el.textContent=plain.slice(0,i);if(i%6===0)sfx('blip');if(i>=plain.length){clearInterval(neuroSay.tm);el.innerHTML=linkify(plain)}},18);
  b.scrollIntoView({block:'nearest',behavior:'smooth'})}
function firstSentences(s,n){const parts=s.match(/[^.!?]+[.!?]+/g)||[s];return parts.slice(0,n).join(' ').trim()}
function neuroHint(){
  if($('game').hidden||!curCase)return null;
  if(!$('introCard').hidden)return{t:"Leggi bene la scheda d'ingresso: molti dettagli che sembrano secondari (terapia, cosa è successo ieri, esami) ti serviranno nelle domande. Quando sei pronto, inizia l'episodio.",free:true};
  const s=curCase.steps[stepI];if(!s)return null;
  if(answered)return{t:"Hai già trovato la risposta giusta! Leggi la fisiologia al volo e poi tocca Avanti.",free:true};
  if(busy)return{t:"Guarda prima la scena fino in fondo: i parametri che cambiano sono già un indizio.",free:true};
  if(s.abcde&&abcI<5)return{t:"Tocca le lettere nell'ordine, dalla A alla E, e leggi i valori. Per ogni lettera chiediti: c'è qualcosa che devo fare adesso, o posso passare alla prossima?",free:true};
  let t;
  if(s.abcde)t="Scorri le lettere dalla A in giù e fermati alla prima con un problema che richiede un'azione subito. Un valore alterato che è solo un compenso, con il resto stabile, può aspettare.";
  else if(s.phy)t="Pensa al meccanismo: "+firstSentences(s.phy[0],2);
  else t="Rileggi la scheda d'ingresso: c'è un dettaglio che cambia la scelta.";
  return{t,free:false};
}
function eliminateOne(){
  const cand=[...document.querySelectorAll('#sOpts .opt')].filter(b=>b._o&&!b._o.ok&&!b.classList.contains('wrong')&&!b.classList.contains('elim'));
  if(!cand.length)return false;const b=cand[Math.floor(Math.random()*cand.length)];
  b.classList.add('elim');setLock(b,true);b.insertAdjacentHTML('beforeend','<span class="elimtag">Neuro: questa no</span>');return true;
}
$('btnNeuro').onclick=()=>{
  auInit();
  const h=neuroHint();if(!h)return;
  if(h.free){neuroJump=.8;sfx('neuro');neuroSay(h.t);return}
  if(helps<=0){neuroSad=2.5;sfx('wrong');neuroSay("Ho finito gli aiuti per questo caso! Ce la puoi fare: torna all'ABCDE e alla scheda d'ingresso.",'sad');return}
  helps--;renderHelps();neuroJump=1.2;neuroBlink=.15;sfx('neuro');setTimeout(()=>sfx('idea'),300);
  const el=eliminateOne();
  neuroSay(h.t+(el?" Ho anche scartato una risposta che non va bene.":"")+` (Aiuti rimasti: ${helps})`);
  caption('Neuro ti aiuta','q');
};

/* ===== Fuori turno: scena dall'alto + terminale 8-bit ===== */
const SW=360,SH=220;let stc=null;
let EV=null,evStep=0,evHearts=3,evErr=0,evDeaths=0,evWrongs=[],evBusy=false,evAnswered=false,evSnap=null,evHelps=3,evT0=0,evTok=0;
let EST={},EVIS={};const STACT=[];let ambX=420;
const BLEEDP={thigh:[168,372],flank:[212,285],chest:[162,252]};
function M(p){const S=.68;return[180+(p[1]-323)*S,112-(p[0]-180)*S]}
function srand(seed){let s=seed;return()=>{s=(s*16807)%2147483647;return s/2147483647}}
/* --- sfondi visti dall'alto --- */
function speck(c,col,n,seed,a){const r=srand(seed);c.fillStyle=col;for(let i=0;i<n;i++)c.fillRect(Math.floor(r()*SW),Math.floor(r()*SH),a||2,a||2)}
const BG={
 strada(c,t){c.fillStyle='#262a36';c.fillRect(0,0,SW,SH);speck(c,'#30354a',260,7);c.fillStyle='#d9d9d9';for(let x=40;x<SW-40;x+=26)c.fillRect(x,8,14,46);c.fillStyle='#c9a227';for(let x=0;x<SW;x+=40)c.fillRect(x,SH-34,22,3);
   c.fillStyle='#3a3f52';c.fillRect(0,SH-12,SW,12);c.fillStyle='rgba(255,220,140,.12)';c.beginPath();c.arc(40,30,70,0,7);c.fill();
   c.fillStyle='#5f7fb0';rr(c,300,150,52,26,5);c.fill();c.fillStyle='#1c2638';c.fillRect(308,153,10,20);c.fillRect(336,153,10,20);
   if(Math.floor(t*2)%2){c.fillStyle='#ffb02e';c.fillRect(300,150,4,4);c.fillRect(348,150,4,4);c.fillRect(300,172,4,4);c.fillRect(348,172,4,4)}
   c.fillStyle='rgba(120,150,200,.15)';c.beginPath();c.ellipse(250,60,30,8,0,0,7);c.fill()},
 vicolo(c,t){c.fillStyle='#2f2a33';c.fillRect(0,0,SW,SH);for(let y=0;y<SH;y+=10)for(let x=(y/10)%2*8;x<SW;x+=16){c.fillStyle='#38323d';c.fillRect(x,y,14,8)}
   c.fillStyle='#1a171d';c.fillRect(0,0,SW,22);c.fillStyle='rgba(255,200,120,.18)';c.fillRect(220,22,50,60);c.fillStyle='#3a5a3a';c.fillRect(20,150,60,40);c.fillStyle='#2c4a2c';c.fillRect(20,150,60,6);
   c.fillStyle='#25b7c9';c.fillRect(300,30,30,26);c.fillStyle='#1a8a99';c.fillRect(300,30,30,5)},
 parco(c,t){c.fillStyle='#3f7a3c';c.fillRect(0,0,SW,SH);speck(c,'#4c8c47',300,3);speck(c,'#356a33',200,9);
   c.fillStyle='#c9b48a';c.beginPath();c.moveTo(0,40);c.bezierCurveTo(120,70,240,10,SW,50);c.lineTo(SW,80);c.bezierCurveTo(240,40,120,100,0,70);c.fill();
   [[40,170,24],[320,30,30],[300,180,20]].forEach(([x,y,r])=>{c.fillStyle='#24502a';c.beginPath();c.arc(x,y,r,0,7);c.fill();c.fillStyle='#2f6a34';c.beginPath();c.arc(x-5,y-5,r*.6,0,7);c.fill()});
   c.fillStyle='#1fa35a';c.fillRect(330,110,16,20);c.fillStyle='#ffffff';c.fillRect(336,114,4,12);c.fillRect(332,118,12,4)},
 centro(c,t){c.fillStyle='#4a4a55';c.fillRect(0,0,SW,SH);speck(c,'#55555f',200,5);c.fillStyle='#2e2e38';c.fillRect(0,0,SW,40);
   for(let x=6;x<SW;x+=34){c.fillStyle=['#c96a4a','#d8b24a','#4a8ad8','#e2e2e2'][(x/34|0)%4];c.fillRect(x,8,26,12);c.fillRect(x,22,26,12)}
   c.fillStyle='#2e2e38';c.fillRect(0,SH-20,SW,20);c.fillStyle='rgba(0,0,0,.25)';c.fillRect(0,0,SW,SH)},
 ristorante(c,t){c.fillStyle='#6b4a33';c.fillRect(0,0,SW,SH);for(let y=0;y<SH;y+=12){c.fillStyle=y%24?'#634430':'#71503a';c.fillRect(0,y,SW,11)}
   [[50,40],[310,170],[320,40]].forEach(([x,y])=>{c.fillStyle='#f4f1ea';c.beginPath();c.arc(x,y,30,0,7);c.fill();c.fillStyle='#dcd6c8';for(let k=0;k<5;k++){const a=k*1.26;c.beginPath();c.arc(x+Math.cos(a)*18,y+Math.sin(a)*18,5,0,7);c.fill()}});
   const r=srand(11);for(let i=0;i<40;i++){c.fillStyle=['#ffffff','#ffd1e6','#c8f0ff'][i%3];c.fillRect(r()*SW,r()*SH,2,2)}},
 metro(c,t){c.fillStyle='#4f5560';c.fillRect(0,0,SW,SH);for(let y=0;y<SH;y+=6){c.fillStyle='#565c68';c.fillRect(0,y,SW,2)}
   c.fillStyle='#2d5fa8';c.fillRect(0,0,SW,26);c.fillRect(0,SH-26,SW,26);c.fillStyle='#24508f';for(let x=0;x<SW;x+=30){c.fillRect(x,0,2,26);c.fillRect(x,SH-26,2,26)}
   c.fillStyle='#c8ccd4';[60,180,300].forEach(x=>{c.beginPath();c.arc(x,60,4,0,7);c.fill();c.beginPath();c.arc(x,170,4,0,7);c.fill()});
   c.fillStyle='rgba(255,255,255,'+(.04+.03*Math.sin(t*20))+')';c.fillRect(0,0,SW,SH)},
 festival(c,t){c.fillStyle='#2a3a24';c.fillRect(0,0,SW,SH);speck(c,'#35482d',240,4);speck(c,'#4a3a2a',120,8,3);
   const r=srand(21);for(let i=0;i<30;i++){c.fillStyle=['#e83a3a','#f2f2f2','#3a8ae8'][i%3];c.fillRect(r()*SW,r()*SH,4,5)}
   ['#ff3fa4','#3fd8ff','#ffd23f'].forEach((col,i)=>{const a=t*.7+i*2.1;c.fillStyle=col.replace(')','')+'';c.globalAlpha=.12;c.beginPath();c.moveTo(180,-20);c.lineTo(180+Math.cos(a)*300-30,SH);c.lineTo(180+Math.cos(a)*300+30,SH);c.fill();c.globalAlpha=1});
   c.fillStyle='#e8e8e8';c.fillRect(290,140,64,60);c.fillStyle='#d23a3a';c.fillRect(316,152,12,36);c.fillRect(304,164,36,12)},
 spiaggia(c,t){c.fillStyle='#a8996c';c.fillRect(0,0,SW,SH);speck(c,'#b5a678',300,2);c.fillStyle='#2b4250';c.fillRect(0,0,SW,30);c.fillStyle='rgba(220,230,240,.6)';for(let x=0;x<SW;x+=18)c.fillRect(x+Math.sin(t*2+x)*3,28,10,3);
   [[50,170],[320,60]].forEach(([x,y],i)=>{for(let k=0;k<8;k++){c.fillStyle=k%2?'#e8e2d0':(i?'#3a7ad8':'#e85a3a');c.beginPath();c.moveTo(x,y);c.arc(x,y,26,k*Math.PI/4,(k+1)*Math.PI/4);c.fill()}});
   c.fillStyle='#d84a8a';c.fillRect(250,160,40,22);c.fillStyle='#e8c33a';c.fillRect(70,40,36,20)},
 stazione(c,t){c.fillStyle='#dfe6ec';c.fillRect(0,0,SW,SH);for(let y=0;y<SH;y+=14)for(let x=0;x<SW;x+=14){c.fillStyle=((x+y)/14)%2?'#cfd8df':'#e8eef2';c.fillRect(x,y,13,13)}
   c.fillStyle='#8a96a3';c.fillRect(0,0,6,SH);c.fillRect(SW-80,0,4,SH);c.fillRect(SW-80,0,80,4);c.fillStyle='#f4f6f8';rr(c,SW-60,40,40,30,10);c.fill();c.fillStyle='rgba(0,0,0,.35)';c.fillRect(0,0,SW,SH)},
 condominio(c,t){c.fillStyle='#3a3d48';c.fillRect(0,0,SW,SH);for(let y=0;y<SH;y+=20)for(let x=(y/20)%2*20;x<SW;x+=40){c.fillStyle='#424654';c.fillRect(x,y,38,18)}
   c.fillStyle='rgba(255,210,140,.22)';c.beginPath();c.moveTo(150,0);c.lineTo(210,0);c.lineTo(260,90);c.lineTo(100,90);c.fill();c.fillStyle='#5a3a2a';c.fillRect(150,0,60,8);
   c.fillStyle='rgba(180,210,255,.08)';c.fillRect(0,0,SW,SH);const r=srand(5);c.fillStyle='#ffffff';for(let i=0;i<30;i++)c.fillRect((r()*SW+t*10)%SW,(r()*SH+t*25)%SH,2,2)}
};
const NIGHT={strada:.25,vicolo:.35,parco:0,centro:.1,ristorante:0,metro:0,festival:.3,spiaggia:.15,stazione:0,condominio:.25};
const RAIN={strada:1,spiaggia:2};
/* --- disegno della scena --- */
function drawStreet(t,dt){
  const c=stc.ctx,v=EVIS;c.clearRect(0,0,SW,SH);
  BG[EV.setting](c,t);
  // pozza di sangue (sotto al paziente)
  if(v.bleedAt){v.pool=Math.min(48,(v.pool||0)+(v.rate||0)*dt*3);const [bx,by]=M(BLEEDP[v.bleedAt]);
    c.fillStyle='#5a0a14';c.beginPath();c.ellipse(bx,by,v.pool*1.1,v.pool*.75,0,0,7);c.fill();c.fillStyle='#7a121e';c.beginPath();c.ellipse(bx-2,by-1,v.pool*.8,v.pool*.5,0,0,7);c.fill()}
  if(v.cool){c.fillStyle='rgba(90,170,230,.35)';rr(c,70,74,210,92,14);c.fill();c.strokeStyle='#dfe8ff';c.lineWidth=3;c.stroke()}
  // paziente e infermiere nel sistema di riferimento del corpo
  respPh+=dt*(CUR.vit.rr||0)/60;
  c.save();c.translate(180,112);if(v.seize)c.translate((Math.random()-.5)*3,(Math.random()-.5)*3);c.rotate(-Math.PI/2);c.scale(.68,.68);c.translate(-180,-323);
  drawPatient(c,t,EV.n||0);
  // dettagli sul corpo
  if(v.knife){const [x,y]=BLEEDP.flank;c.fillStyle='#bfc6d0';c.fillRect(x-1,y-3,3,6);c.fillStyle='#2a1a12';rr(c,x-4,y-18,9,16,3);c.fill();c.fillStyle='#555';c.fillRect(x-6,y-4,13,3)}
  if(v.tq){c.fillStyle='#151515';c.fillRect(150,344,30,7);c.fillStyle='#d83a3a';c.fillRect(176,342,8,11)}
  if(v.pads){c.fillStyle='#f4f4f4';c.fillRect(150,232,16,12);c.fillRect(204,268,16,12);c.strokeStyle='#888';c.lineWidth=1.5;c.beginPath();c.moveTo(158,232);c.lineTo(120,200);c.moveTo(212,280);c.lineTo(120,200);c.stroke()}
  if(v.fern){const r=srand(77);c.strokeStyle='rgba(200,60,70,.75)';c.lineWidth=1.2;const br=(x,y,a,l,d)=>{if(d>5||l<3)return;const x2=x+Math.cos(a)*l,y2=y+Math.sin(a)*l;c.beginPath();c.moveTo(x,y);c.lineTo(x2,y2);c.stroke();br(x2,y2,a-.5-r()*.4,l*.7,d+1);br(x2,y2,a+.5+r()*.4,l*.7,d+1)};br(180,236,Math.PI/2,14,0)}
  if(v.needle){c.strokeStyle='#d8dde2';c.lineWidth=2;c.beginPath();c.moveTo(232,320);c.lineTo(252,330);c.stroke();c.fillStyle='#ff9a3a';c.fillRect(230,318,5,5)}
  if(v.cover){c.fillStyle='rgba(214,180,70,.55)';rr(c,128,236,104,220,10);c.fill();c.fillStyle='rgba(255,240,180,.35)';for(let k=0;k<6;k++)c.fillRect(132,244+k*34+Math.sin(t*3+k)*2,96,3)}
  // RCP: braccia dell'infermiere che pompano sul torace
  if(v.cpr){NURSE_TGT=A.chest;nurse.treach=.78+.22*Math.abs(Math.sin(t*Math.PI*1.8))}else if(!STACT.length){NURSE_TGT=null}
  nurse.x+=(nurse.tx-nurse.x)*Math.min(1,dt*2);nurse.y+=(nurse.ty-nurse.y)*Math.min(1,dt*2);nurse.reach+=(nurse.treach-nurse.reach)*Math.min(1,dt*(v.cpr?14:4));
  drawNurse(c,t);
  c.restore();
  if(v.cpr){c.fillStyle='#ffd84d';c.font='700 10px Silkscreen,monospace';const n=Math.floor(t*1.8)%30+1;c.fillText('RCP '+n+'/30',M(A.chest)[0]-22,M(A.chest)[1]+40)}
  // azioni animate
  drawStreetActs(c,t);
  // ambulanza
  if(v.amb){ambX+=(250-ambX)*Math.min(1,dt*1.2);const x=ambX,y=150;c.fillStyle=Math.floor(t*6)%2?'rgba(60,120,255,.3)':'rgba(60,120,255,.12)';c.beginPath();c.arc(x+20,y+16,50,0,7);c.fill();
    c.fillStyle='#f4f4f4';rr(c,x,y,84,34,5);c.fill();c.fillStyle='#e8642c';c.fillRect(x,y+14,84,6);c.fillStyle='#2a3a52';c.fillRect(x+4,y+4,14,26);
    c.fillStyle=Math.floor(t*6)%2?'#3c78ff':'#1c2a52';c.fillRect(x+22,y+2,8,5);c.fillStyle=Math.floor(t*6)%2?'#1c2a52':'#3c78ff';c.fillRect(x+22,y+27,8,5)}
  // pioggia, lampi, notte
  const rn=RAIN[EV.setting]||0;if(rn){c.strokeStyle='rgba(180,200,240,.45)';c.lineWidth=1;c.beginPath();for(let i=0;i<40*rn;i++){const x=(i*53+t*260)%SW,y=(i*97+t*520)%SH;c.moveTo(x,y);c.lineTo(x-4,y+9)}c.stroke()}
  if(v.storm){v.flash=Math.max(0,(v.flash||0)-dt*2.5);if(Math.random()<dt*.12){v.flash=1;setTimeout(()=>sfx('thunder'),400+Math.random()*900)}if(v.flash>0){c.fillStyle=`rgba(230,235,255,${v.flash*.55})`;c.fillRect(0,0,SW,SH)}}
  const nt=NIGHT[EV.setting]||0;if(nt){c.fillStyle=`rgba(8,10,40,${nt})`;c.fillRect(0,0,SW,SH)}
  if(v.crit&&!v.dead){c.strokeStyle=Math.floor(t*3)%2?'#ff6f7d':'rgba(255,111,125,.3)';c.lineWidth=6;c.strokeRect(3,3,SW-6,SH-6)}
  if(v.dead){c.fillStyle='rgba(60,0,10,.55)';c.fillRect(0,0,SW,SH);c.fillStyle='rgba(40,4,12,.9)';c.fillRect(0,86,SW,48);c.fillStyle='#ff6f7d';c.font='700 26px Silkscreen,monospace';const w=c.measureText('DECESSO').width;c.fillText('DECESSO',(SW-w)/2,120)}
}
/* --- azioni animate in strada --- */
const STLAB={press:'COMPRESSIONE',compress:'RCP 30:2',aed:'DAE',tq:'LACCIO',cover:'COPERTA',cool:'RAFFREDDAMENTO',backblow:'COLPI TRA LE SCAPOLE',thrust:'COMPRESSIONI ADDOMINALI',time:'CRONOMETRO',window:'ARIA FRESCA',breath:'INSUFFLAZIONI',spray:'NALOXONE SPRAY',phone:'112',pos:'POSIZIONE',look:'VALUTAZIONE',idea:'RAGIONAMENTO',teach:'SPIEGAZIONE',stop:'STOP',check:'CONTROLLO',drink:'PER BOCCA',syringe:'INIEZIONE',oxygen:'O₂',gluco:'GLICEMIA',safe:'SICUREZZA',run:'VIA!'};
const STAT={press:'bleed',compress:'chest',aed:'chest',tq:'tq',cover:'chest',cool:'chest',backblow:'chest',thrust:'chest',time:'nurse',window:'nurse',breath:'head',spray:'head',phone:'nurse',pos:'chest',look:'head',idea:'nurse',teach:'nurse',stop:'nurse',check:'nurse',drink:'head',syringe:'thigh',oxygen:'head',gluco:'nurse',safe:'nurse',run:'nurse'};
function stPoint(w){if(w==='bleed')return BLEEDP[EVIS.bleedAt||'chest'];if(w==='tq')return[166,350];if(w==='thigh')return BLEEDP.thigh;if(w==='nurse')return[nurse.x,nurse.y];return A[w]||A.chest}
const SDRAW={
 press(c,x,y,u,e,t){const p=Math.sin(t*10)*1.5;c.fillStyle='#d9a27a';c.fillRect(x-8,y-8+p,16,10);c.fillRect(x-6,y-3+p,14,9);c.strokeStyle='#ffc24a';c.lineWidth=2;c.beginPath();c.arc(x,y,12+u*12,0,7);c.stroke()},
 compress(c,x,y,u,e,t){const d=Math.abs(Math.sin(t*Math.PI*1.8))*5;c.fillStyle='#d9a27a';c.fillRect(x-7,y-12+d,14,8);c.fillRect(x-5,y-6+d,10,6);c.strokeStyle='#ffd84d';c.lineWidth=2;c.beginPath();c.moveTo(x-12,y+6);c.lineTo(x-12,y+12);c.moveTo(x+12,y+6);c.lineTo(x+12,y+12);c.stroke()},
 aed(c,x,y,u,e,t){c.fillStyle='#1fa35a';c.fillRect(x-60,y-34,22,18);c.fillStyle='#ffffff';c.fillRect(x-52,y-31,6,12);c.fillRect(x-55,y-28,12,6);
   if(u>.45&&u<.75){c.fillStyle='#ffe14d';c.beginPath();c.moveTo(x-2,y-20);c.lineTo(x+8,y-4);c.lineTo(x+1,y-4);c.lineTo(x+6,y+12);c.lineTo(x-8,y-6);c.lineTo(x-1,y-6);c.fill();c.fillStyle='rgba(255,240,150,.35)';c.fillRect(0,0,SW,SH)}},
 tq(c,x,y,u,e,t){c.fillStyle='#151515';c.fillRect(x-4,y-12,8,24);c.fillStyle='#d83a3a';c.fillRect(x+4,y-6,10,6);c.fillStyle='#eef0ff';c.font='9px VT323,monospace';const d=new Date();c.fillText(('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2),x+6,y+16)},
 cover(c,x,y,u){c.fillStyle='rgba(255,230,150,.5)';for(let k=0;k<5;k++)c.fillRect(x-30+k*12,y-14+Math.sin(u*10+k)*3,8,2)},
 cool(c,x,y,u,e,t){c.fillStyle='#bfe6ff';for(let k=0;k<8;k++){const p=(u*2+k/8)%1;c.fillRect(x-24+k*7,y-26+p*30,3,5)}c.fillStyle='#e8f6ff';c.fillRect(x+20,y-20,7,7);c.fillRect(x+28,y-12,6,6)},
 backblow(c,x,y,u,e,t){const s=Math.abs(Math.sin(t*9));c.fillStyle='#d9a27a';c.fillRect(x+16-s*6,y-8,10,14);if(s>.8){c.fillStyle='#ffd84d';for(let k=0;k<6;k++){const a=k*1.05;c.fillRect(x+8+Math.cos(a)*9,y+Math.sin(a)*9,2,2)}}},
 thrust(c,x,y,u,e,t){c.strokeStyle='#ffd84d';c.lineWidth=3;const s=Math.abs(Math.sin(t*7))*6;c.beginPath();c.moveTo(x-22+s,y+10);c.lineTo(x-10+s,y+2);c.moveTo(x+22-s,y+10);c.lineTo(x+10-s,y+2);c.stroke()},
 time(c,x,y,u,e,t){c.fillStyle='#eef0ff';c.beginPath();c.arc(x+20,y-24,9,0,7);c.fill();c.strokeStyle='#0b1030';c.lineWidth=2;c.beginPath();c.moveTo(x+20,y-24);c.lineTo(x+20+Math.cos(t*4)*6,y-24+Math.sin(t*4)*6);c.stroke()},
 window(c,x,y,u){c.strokeStyle='#eef0ff';c.lineWidth=2;c.strokeRect(x+10,y-40,24,20);c.beginPath();c.moveTo(x+22,y-40);c.lineTo(x+22,y-20);c.stroke();c.strokeStyle='#9fe6ff';for(let k=0;k<3;k++){c.beginPath();c.moveTo(x+38+u*20,y-36+k*7);c.lineTo(x+52+u*20,y-36+k*7);c.stroke()}},
 breath(c,x,y,u){c.fillStyle='rgba(200,240,255,.8)';for(let k=0;k<3;k++){const p=(u*2+k/3)%1;c.beginPath();c.arc(x+20-p*18,y-10+p*4,3+p*2,0,7);c.fill()}},
 spray(c,x,y,u){c.fillStyle='#e8e8f4';c.fillRect(x+10,y-18,7,14);c.fillStyle='#7a5cff';c.fillRect(x+10,y-22,7,4);c.fillStyle='rgba(200,220,255,.8)';for(let k=0;k<6;k++)c.fillRect(x+6-k*2-u*6,y-24+k%3*2,2,2)},
 safe(c,x,y,u){c.fillStyle='#ffc24a';c.beginPath();c.moveTo(x+20,y-44);c.lineTo(x+34,y-20);c.lineTo(x+6,y-20);c.fill();c.fillStyle='#0b1030';c.fillRect(x+19,y-38,3,10);c.fillRect(x+19,y-26,3,3)},
 run(c,x,y,u){c.strokeStyle='#6fe39a';c.lineWidth=3;for(let k=0;k<3;k++){const xx=x+10+k*12+u*20;c.beginPath();c.moveTo(xx,y-30);c.lineTo(xx+8,y-24);c.lineTo(xx,y-18);c.stroke()}}
};
function evActs(o,ok){
  let keys=o.a?o.a.split('+'):actsFor(o.t,0).map(a=>a.k);
  keys=keys.map(k=>(SDRAW[k]||ACTDRAW[k])&&!['iv','steth','ecg','lab'].includes(k)?k:'idea');
  const now=performance.now()/1000;STACT.length=0;
  keys.slice(0,3).forEach((k,i)=>{STACT.push({k,t0:now+i*1.3,dur:1.6,ok});setTimeout(()=>{const map={press:'pos',compress:'steth',aed:'vf',tq:'stop',cover:'pos',cool:'drink',backblow:'stop',thrust:'stop',time:'gluco',window:'oxygen',breath:'oxygen',spray:'syringe',safe:'check',run:'jingle'};sfx(SFX[k]?k:(map[k]||'check'))},i*1300)});
}
function drawStreetActs(c,t){
  const now=performance.now()/1000;for(let i=STACT.length-1;i>=0;i--)if(now>STACT[i].t0+STACT[i].dur+.2)STACT.splice(i,1);
  for(const a of STACT){const u=(now-a.t0)/a.dur;if(u<0||u>1)continue;
    const p=stPoint(STAT[a.k]||'chest');if(STAT[a.k]==='bleed'||STAT[a.k]==='chest')NURSE_TGT=p;
    const [x,y]=M(p);c.save();c.globalAlpha=u>.8?(1-u)/.2:1;
    const col=a.ok===false?'#ff6f7d':'#ffc24a';c.strokeStyle=col;c.lineWidth=2;c.globalAlpha*=1-u*.5;c.beginPath();c.arc(x,y,8+u*26,0,7);c.stroke();c.globalAlpha=u>.8?(1-u)/.2:1;
    (SDRAW[a.k]||ACTDRAW[a.k])(c,x,y,u,Math.min(1,u*4),t);
    const lab=STLAB[a.k]||'AZIONE';c.font='700 10px Silkscreen,monospace';const tw=c.measureText(lab).width+10;let lx=Math.max(4,Math.min(SW-tw-4,x-tw/2)),ly=y-58;if(ly<4)ly=y+30;
    c.fillStyle='#0b1030';c.fillRect(lx,ly,tw,16);c.strokeStyle=col;c.strokeRect(lx,ly,tw,16);c.fillStyle=col;c.fillText(lab,lx+5,ly+12);c.restore()}
}
/* --- terminale --- */
let termQ=Promise.resolve(),termSkip=false;
function tprint(text,cls,pause){const tok=evTok;termQ=termQ.then(()=>tok!==evTok?null:typeLine(text,cls||'',pause||120,tok));return termQ}
function typeLine(text,cls,pause,tok){return new Promise(res=>{const line=document.createElement('div');line.className='tl '+cls;$('termLog').appendChild(line);let i=0;
  const step=()=>{if(tok!==evTok){line.remove();return res()}i=termSkip?text.length:i+2;line.textContent=text.slice(0,i)+(i<text.length?'█':'');if(i%6===0)sfx('blip');scrollTerm();
    if(i>=text.length){termSkip=false;line.innerHTML=linkify(text);scrollTerm();setTimeout(res,pause);return}setTimeout(step,13)};step()})}
function scrollTerm(){const b=$('termBox');b.scrollTop=b.scrollHeight}
$('termBox').addEventListener('click',e=>{if(!e.target.closest('button,.gl'))termSkip=true});
function lvl(s){return /non |assente|fiotti|abbondante|debol|agonico|blu|quasi|gorgo|sibilo|irregolare|conficcato|affann/i.test(s)?'bad':/normale|presente|ferma|contenut|rallenta|regolare|stabile|nessuna|orientat|sveglio\b|libero/i.test(s)?'ok':'warn'}
function renderEvStatus(){const f=[['COSCIENZA',EST.c],['RESPIRO',EST.r],['CIRCOLO',EST.p],['EMORRAGIA',EST.b]];
  $('evStat').innerHTML=f.map(([k,v])=>`<div class="sv ${lvl(v||'')}"><small>${k}</small><b>${esc(v||'—')}</b></div>`).join('')+`<div class="sv ${EST.call?'ok':'bad'}"><small>112</small><b>${EST.call?'Chiamato':'Non chiamato'}</b></div>`}
function updateStreetHud(){const s=Math.floor((performance.now()-evT0)/1000);$('evClock').textContent='T+ '+String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')}
function renderEvHearts(){$('evHearts').innerHTML=[0,1,2].map(i=>`<span class="${i<evHearts?'':'off'}">♥</span>`).join('')}
function evApply(st){if(!st)return;if(st.pat)Object.assign(TGT.pat,st.pat);if(st.vit)Object.assign(TGT.vit,st.vit);if(st.st)Object.assign(EST,st.st);if(st.vis)Object.assign(EVIS,st.vis);renderEvStatus()}
function evLock(on){document.querySelectorAll('#termOpts .topt').forEach(b=>{if(!on&&(b.classList.contains('wrong')||b.classList.contains('elim')))return;b.classList.toggle('locked',on)})}
function evCtl(mode){$('evNext').hidden=mode!=='next';$('evRewind').hidden=mode!=='rewind';$('evHelp').hidden=mode!=='q'}
function startEvent(i){
  evTok++;termQ=Promise.resolve();EV=EVENTS[i];EV.n=i;evStep=0;evHearts=3;evErr=0;evDeaths=0;evWrongs=[];evHelps=3;evBusy=true;evAnswered=false;STACT.length=0;ambX=420;NURSE_TGT=null;
  PAT_MODE='street';curSkin=pickSkin();
  TGT.vit={hr:90,sys:120,dia:70,spo2:96,rr:16,temp:36.8,ecg:'sinus'};TGT.pat={...PAT0};TGT.phys={};
  TGT.pat=Object.assign({...PAT0},EV.base.pat);Object.assign(TGT.vit,EV.base.vit);CUR.vit={...TGT.vit};CUR.pat={...TGT.pat};skinRGB=skinTarget();
  EST={...EV.base.st};EVIS={...EV.base.vis};
  nurse.x=-80;nurse.y=300;nurse.tx=100;nurse.ty=262;nurse.treach=0;nurse.reach=0;
  $('evTitle').textContent=EV.title;$('evPlace').textContent='Fuori turno · '+EV.place+' · '+EV.diff;
  $('termLog').innerHTML='';$('termOpts').innerHTML='';evCtl('');$('evEnd').hidden=true;renderEvStatus();renderEvHearts();renderEvHelp();
  show('street');evT0=performance.now();
  if(!running){running=true;last=performance.now();requestAnimationFrame(loop)}
  setMusicContext('case');sfx('jingle');
  tprint('TURNO DI NOTTE // FUORI TURNO · EVENTO RARO','sys',60);
  tprint('Paziente: '+EV.who+(curSkin?' · aspetto: '+curSkin.name+' (è solo un costume, il caso è reale)':''),'sys',200);
  (async()=>{const tok=evTok;for(const l of EV.intro){if(tok!==evTok)return;if(l.tense)setMood('tense');if(l.snd)sfx(l.snd);if(l.s)evApply(l.s);await tprint(l.t,'',350)}if(tok!==evTok)return;setMusicContext('case');renderEvStep()})();
}
async function renderEvStep(){
  const tok=evTok,s=EV.steps[evStep];evAnswered=false;evBusy=true;$('termOpts').innerHTML='';evCtl('');
  await tprint('── '+s.tag.toUpperCase()+' '+'─'.repeat(Math.max(4,28-s.tag.length)),'sys',80);
  if(s.seq)for(const l of s.seq){if(tok!==evTok)return;if(l.tense)setMood('tense');if(l.snd)sfx(l.snd);if(l.s)evApply(l.s);await tprint(l.t,'warn',300)}
  if(tok!==evTok)return;setMusicContext('case');
  await tprint(s.text,'',150);if(tok!==evTok)return;
  await tprint('? '+s.q,'q',60);if(tok!==evTok)return;
  evSnap=JSON.parse(JSON.stringify({pat:TGT.pat,vit:TGT.vit,st:EST,vis:EVIS}));
  const box=$('termOpts');const opts=s.opts.map((o,i)=>({...o,i})).sort(()=>Math.random()-.5);
  opts.forEach((o,j)=>{const b=document.createElement('button');b.className='topt';b._o=o;b.innerHTML=`<span class="k">[${j+1}]</span><span>${linkify(o.t)}</span>`;b.onclick=()=>{if(b.classList.contains('locked')||evBusy)return;evAnswer(o,b)};box.appendChild(b)});
  evBusy=false;evCtl('q');scrollTerm();
}
async function evAnswer(o,b){
  const tok=evTok,s=EV.steps[evStep];evBusy=true;evLock(true);evCtl('');sfx('click');
  await tprint('> '+o.t,'me',100);
  if(o.ok){b.classList.add('right');sfx('correct');evActs(o,true);await tprint('✔ CORRETTO. '+o.fb,'ok',200);if(tok!==evTok)return;
    if(s.out)evApply(s.out);if(o.s)evApply(o.s);
    if(s.phy){await tprint('◆ FISIOLOGIA AL VOLO · '+s.phy[0],'phy',60);await tprint('  Per esempio: '+s.phy[1],'phy2',100)}
    evAnswered=true;evBusy=false;evCtl('next');$('evNext').textContent=evStep===EV.steps.length-1?'Concludi ▶':'Avanti ▶';return}
  const x=o.x!=null?o.x:(s.kn?0:1);b.classList.add('wrong');evErr++;evHearts--;renderEvHearts();sfx('wrong');
  evWrongs.push({step:evStep,tag:s.tag,opt:o.i,text:o.t,x});
  if(x>0)evActs(o,false);
  await tprint('✖ '+(x===0?'SBAGLIATO':o.dead?'ERRORE FATALE':x===2?'EVENTO CRITICO':'IL PAZIENTE PEGGIORA')+'. '+o.fb,'bad',150);if(tok!==evTok)return;
  if(x>0){if(o.s)evApply(o.s);if(x===2){EVIS.crit=1;setMood('tense')}
    if(o.dead){evDeaths++;setMood('none');sfx('death');evApply({pat:{eyes:0,skin:'grey',tremor:0,sweat:0},vit:{rr:0},st:{c:'Non risponde',r:'Assente',p:'Assente'},vis:{dead:1,cpr:0,seize:0}});
      await tprint('████████████████████████████','bad',60);await tprint('IL PAZIENTE È MORTO · '+(o.end||''),'bad',60);await tprint('████████████████████████████','bad',200)}
    else{sfx('worse');await tprint('!! '+(o.end||'La situazione peggiora'),'bad',150)}}
  if(tok!==evTok)return;evBusy=false;
  if(evHearts<=0){evFinish(false);return}
  if(x===0){evLock(false);evCtl('q');return}
  evCtl('rewind');
}
function evRewind(){if(!evSnap)return;const sn=JSON.parse(JSON.stringify(evSnap));TGT.pat=sn.pat;TGT.vit=sn.vit;EST=sn.st;EVIS=sn.vis;EVIS.dead=0;EVIS.crit=0;renderEvStatus();
  sfx('rewind');setMusicContext('case');STACT.length=0;tprint('<<< RIAVVOLGIMENTO · scegli di nuovo >>>','sys',60);evLock(false);evCtl('q')}
function renderEvHelp(){$('evHelp').textContent='[?] Chiedi a Neuro ('+evHelps+')'}
function evNeuro(){const s=EV&&EV.steps[evStep];if(!s||evBusy||evAnswered)return;neuroJump=1;
  if(evHelps<=0){sfx('wrong');tprint('NEURO › Ho finito gli aiuti per questo evento. Ripensa all\'ordine: sicurezza, allarme, poi c-A-B-C-D-E.','neuro',60);return}
  evHelps--;renderEvHelp();sfx('neuro');
  const cand=[...document.querySelectorAll('#termOpts .topt')].filter(b=>!b._o.ok&&!b.classList.contains('wrong')&&!b.classList.contains('elim'));
  if(cand.length){const b=cand[Math.floor(Math.random()*cand.length)];b.classList.add('elim','locked')}
  const hint=s.phy?firstSentences(s.phy[0],2):'Parti sempre dalla sicurezza della scena e dal problema che uccide più in fretta.';
  tprint('NEURO › '+hint+(cand.length?' Ho scartato una risposta che non va bene.':'')+' (Aiuti rimasti: '+evHelps+')','neuro',60);
}
async function evFinish(win){
  const tok=evTok;evCtl('');$('termOpts').innerHTML='';
  emitAttempt({kind:'event',item:EV.id,win,stars:win?(evErr===0?3:evErr===1?2:1):0,errors:evErr,deaths:evDeaths,wrongs:evWrongs});
  if(win){EVIS.amb=1;sfx('siren');setTimeout(()=>sfx('siren'),1600);
    const st=evErr===0?3:evErr===1?2:1;const xp=EV.steps.length*120-evErr*40+st*60;prog.ev=prog.ev||{};if(st>(prog.ev[EV.id]||0))prog.ev[EV.id]=st;prog.xp+=Math.max(0,xp);save();
    setMusicContext('win');sfx('win');
    await tprint('Sirene in fondo alla strada: l\'ambulanza è arrivata.','ok',200);
    await tprint('Consegni ai sanitari: cosa è successo, a che ora, cosa hai visto e cosa hai fatto.','',200);
    await tprint('EVENTO RISOLTO · '+'★'.repeat(st)+'☆'.repeat(3-st)+' · +'+xp+' XP · '+evErr+(evErr===1?' errore':' errori')+(evDeaths?' · '+evDeaths+' decess'+(evDeaths===1?'o evitato':'i evitati')+' riavvolgendo':''),'ok',200)}
  else{setMusicContext('loss');await tprint('Hai finito i tre cuori. Il paziente non ce l\'ha fatta.','bad',200);await tprint('Rileggi le spiegazioni e riprova l\'evento.','',200)}
  if(tok!==evTok)return;
  await tprint('Fonti: '+EV.src.join(' · '),'sys',100);
  $('evEnd').hidden=false;
}
$('evNext').onclick=()=>{evStep++;if(evStep>=EV.steps.length)evFinish(true);else renderEvStep()};
$('evRewind').onclick=evRewind;$('evHelp').onclick=evNeuro;
$('evBack').onclick=()=>{evTok++;PAT_MODE='bed';renderHome();show('home')};
$('evMap').onclick=()=>{evTok++;PAT_MODE='bed';$('evEnd').hidden=true;renderHome();show('home')};
$('evRetry').onclick=()=>{$('evEnd').hidden=true;startEvent(EV.n)};
$('evOther').onclick=()=>{$('evEnd').hidden=true;startEvent(pickEvent(EV.n))};
document.addEventListener('keydown',e=>{if($('street').hidden||evBusy)return;const n=+e.key;if(n>=1&&n<=5){const b=document.querySelectorAll('#termOpts .topt')[n-1];if(b)b.click()}});
function pickEvent(avoid){const all=EVENTS.map((e,i)=>i).filter(i=>i!==avoid);const fresh=all.filter(i=>!(prog.ev&&prog.ev[EVENTS[i].id]));const pool=fresh.length?fresh:all;return pool[Math.floor(Math.random()*pool.length)]}

stc=mkCanvas($('cvStreet'),SW,SH);
scene=mkCanvas($('cvScene'),W,H);detail=mkCanvas($('cvPhys'),420,260);
let lastDraw=-1;
function drawRandom(){const pool=CASES.map((c,i)=>i).filter(i=>CASES[i].diff!=='Base'&&PLAY.includes(CASES[i]));
  const fresh=pool.filter(i=>!prog.best[CASES[i].id]&&i!==lastDraw);const src=fresh.length?fresh:pool.filter(i=>i!==lastDraw);
  const i=src[Math.floor(Math.random()*src.length)];lastDraw=i;startCase(i,true)}
$('btnRandom').onclick=drawRandom;$('btnReroll').onclick=drawRandom;
renderAudioBtns();renderNowPlaying();renderCostumeBtn();renderHome();
/* anteprima: gioca un caso già compilato (src/content/compile.js) dall'inizio o da una tappa;
   il caso resta fuori dai capitoli e dalla home */
function playPreview(c,fromStep){
  PREVIEW=true;
  const old=CASES.findIndex(x=>x.__preview);if(old>=0)CASES.splice(old,1);
  CASES.push({...c,__preview:true});startCase(CASES.length-1);
  $('gLevel').textContent='Anteprima · '+(c.area||'')+' · '+(c.diff||'');$('hBrand').textContent='TURNO DI NOTTE · ANTEPRIMA';
  if(fromStep>0&&fromStep<curCase.steps.length){stepI=fromStep;renderStep()}
}
// l'avvio (caso a sorpresa, oppure prima la schermata di accesso) lo decide main.js
export { show, renderHome, drawRandom, startCase, startEvent, playPreview };
