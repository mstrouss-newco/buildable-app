// Draws Sling Squad's 20 round Journey badges (public/sling/journey/<level id>.webp)
// from each level's REAL blocks and targets, using the LP1 'towers' painter in
// buildable-levelthumb.js. Re-run after changing a level layout:
//   node scripts/sling-journey-badges.cjs [outDir] [contactSheet.png]
// Needs @napi-rs/canvas (npm i --no-save @napi-rs/canvas).
const fs=require('fs'),vm=require('vm');const {createCanvas}=require('@napi-rs/canvas');
const path=require('path');const W=path.join(__dirname,'..','public')+'/';
const SC=2;
const doc={createElement:()=>{const c=createCanvas(300*SC,140*SC);const g0=c.getContext('2d');g0.scale(SC,SC);const gc=c.getContext.bind(c);c.getContext=()=>g0;c.toDataURL=()=>{last=c;return 'data:x';};return c;}};
let last=null;
const win={};const ctx={window:win,document:doc,console,navigator:{},location:{search:''},setTimeout,Math,JSON};ctx.self=win;ctx.globalThis=ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(W+'buildable-levelthumb.js','utf8'),ctx);
vm.runInContext(fs.readFileSync(W+'buildable-manifest.js','utf8'),ctx);
const BLT=win.BuildableLevelThumb, BM=win.BuildableManifest;
const man=JSON.parse(fs.readFileSync(W+'sling/manifest.json','utf8'));
const cfg=BM.toEngineConfig(man);
const lv=cfg.levels;
const PAL={grass:{sky:["#8fd0ff","#eaf8ff"],g0:"#73c364",g1:"#4e9a45",top:"#86d172"},desert:{sky:["#ffe6ad","#fff6e2"],g0:"#e6c277",g1:"#c89646",top:"#f0d58f"},forest:{sky:["#bfe6c8","#effaf1"],g0:"#5aa86a",g1:"#3c7d4a",top:"#77c586"},fall:{sky:["#ffd7a3","#fff0dd"],g0:"#c98a4b",g1:"#9c6532",top:"#e0a662"},castles:{sky:["#c9bce6","#efeaf9"],g0:"#8fae7a",g1:"#5f7d4e",top:"#a7c48f"}};
PAL.desert2=PAL.desert;PAL.forest2=PAL.forest;PAL.empty=PAL.grass;
const out=process.argv[2]||(W+'sling/journey');fs.mkdirSync(out,{recursive:true});
const S=300/830; const tx=x=>(x-110)*S;
const sheet=createCanvas(6*150,Math.ceil(lv.length/6)*170);const sg=sheet.getContext('2d');sg.fillStyle='#222';sg.fillRect(0,0,sheet.width,sheet.height);
lv.forEach((l,i)=>{
  const p=PAL[l.bg]||PAL.grass;
  const terr=(l.terrain||[]).map(t=>({k:t.k,x:t.x,w:t.w,d:t.d,poly:BM.slingTerrainPoly(t)}));
  let xs=[];(l.blocks||[]).forEach(b=>{xs.push(b.x-b.w/2,b.x+b.w/2)});(l.targets||[]).forEach(t=>xs.push(t.x-10,t.x+10));
  const bx0=tx(Math.min(...xs)),bx1=tx(Math.max(...xs)),cx=(bx0+bx1)/2;
  const side=Math.max(140,Math.min(230,bx1-bx0+26)); const E=side-140;
  const src=createCanvas(300*SC,(140+E)*SC);const sgx=src.getContext('2d');sgx.scale(SC,SC);
  sgx.fillStyle=p.sky[0];sgx.fillRect(0,0,300,E+1);sgx.translate(0,E);
  BLT._painters.towers(sgx,{blocks:l.blocks,targets:l.targets,terrain:terr,sky:p.sky,g0:p.g0,g1:p.g1,top:p.top,n:i+1});
  let x0=Math.max(0,Math.min(300-side,cx-side/2));
  const B=280;const c=createCanvas(B,B);const g=c.getContext('2d');
  g.drawImage(src,x0*SC,0,side*SC,side*SC,0,0,B,B);
  fs.writeFileSync(`${out}/${man.levels[i].id}.webp`,c.toBuffer('image/webp',82));
  const col=i%6,row=Math.floor(i/6);
  sg.save();sg.beginPath();sg.arc(col*150+75,row*170+70,60,0,6.2832);sg.clip();sg.drawImage(c,col*150+15,row*170+10,120,120);sg.restore();
  sg.fillStyle='#fff';sg.font='12px sans-serif';sg.textAlign='center';sg.fillText((i+1)+' '+l.name,col*150+75,row*170+150);
  console.log(i+1,man.levels[i].id,'side',side.toFixed(0));
});
if(process.argv[3])fs.writeFileSync(process.argv[3],sheet.toBuffer('image/png'));
