import fs from 'fs'; import vm from 'vm';
const dir=process.argv[2];
const html=fs.readFileSync(dir+'/public/breaker-engine.html','utf8');
const renders=fs.readFileSync(dir+'/public/buildable-renders.js','utf8');
const audio=fs.readFileSync(dir+'/public/buildable-audio.js','utf8');
const engine=[...html.matchAll(/<script\b(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
const noop=()=>{};
const ctxStub=new Proxy({},{get:(_,k)=>(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop:noop}):(k==='canvas'?{width:900,height:600}:(typeof k==='string'?noop:undefined))});
function makeEl(){return{style:{},classList:{add:noop,remove:noop},addEventListener:noop,getContext:()=>ctxStub,appendChild:noop,set innerHTML(v){},get innerHTML(){return''},width:900,height:600,naturalWidth:0,naturalHeight:0,complete:false,getBoundingClientRect:()=>({left:0,top:0,width:900,height:600})};}
class ImageStub{constructor(){this.complete=false;this.naturalWidth=0;}set src(v){this._src=v;}get src(){return this._src;}addEventListener(){}}
const documentStub={getElementById:()=>makeEl(),querySelector:()=>makeEl(),addEventListener:noop,createElement:()=>makeEl()};
const sandbox={document:documentStub,window:{},Image:ImageStub,requestAnimationFrame:noop,cancelAnimationFrame:noop,addEventListener:noop,removeEventListener:noop,setTimeout:()=>0,clearTimeout:noop,Date,Math,console};
sandbox.window=sandbox; sandbox.globalThis=sandbox;
vm.createContext(sandbox);
vm.runInContext(renders+'\n'+audio+'\n'+engine,sandbox,{filename:'breaker'});
const BK=sandbox.BREAKER_GAME; if(!BK){console.error('FAIL: BREAKER_GAME not exposed');process.exit(2);}
const cfg=BK._cfg(); const n=cfg.levels.length;
let allWin=true;
for(let i=0;i<n;i++){const r=BK.sim(i,30000);const ok=r.result==='win';allWin=allWin&&ok;console.log(`${ok?'PASS':'FAIL'}  L${i+1} ${cfg.levels[i].name.padEnd(15)} result=${r.result} frames=${r.frames} lives=${r.livesLeft} bricksLeft=${r.bricksLeft}`);}
// render smoke test
BK._begin(2); BK._step(120); const d=BK._draw(); console.log('render:',d);
// campaign carry-forward
console.log('campaign:',JSON.stringify(BK.campaign()));
console.log(allWin?'ALL LEVELS WIN':'SOME FAILED');
process.exit(allWin&&d==='ok'?0:1);
