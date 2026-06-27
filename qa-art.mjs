// Headless QA for public/art-studio.html — drives window.ART_GAME in node.
// Covers v2: all brushes lay strokes across mirror+style settings, fill + shape stamp
// ops added, undo/redo work, and save->JSON->clear->restore is lossless.
import fs from 'fs'; import path from 'path'; import vm from 'vm';
const file = path.resolve('public/art-studio.html');
const html = fs.readFileSync(file,'utf8');
const scripts=[...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
const noop=()=>{};
const ctxStub=new Proxy({},{get:(_,k)=>(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop:noop}):(k==='toDataURL'?()=>'data:,':(k==='getImageData'?()=>({data:new Uint8ClampedArray(4)}):(typeof k==='string'?noop:undefined)))});
function makeEl(){return {style:{},dataset:{},classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},childElementCount:0,
  addEventListener:noop,appendChild:noop,removeChild:noop,remove:noop,click:noop,setAttribute:noop,
  getContext:()=>ctxStub,toDataURL:()=>'data:,',width:900,height:540,naturalWidth:1,naturalHeight:1,complete:true,
  getBoundingClientRect:()=>({left:0,top:0,width:900,height:540}),querySelectorAll:()=>[],set innerHTML(v){},set textContent(v){},set onclick(v){},set oninput(v){},value:'',checked:false};}
class ImageStub{constructor(){this.complete=true;this.naturalWidth=1;this.naturalHeight=1;}set src(v){this._s=v;if(this.onload)this.onload();}get src(){return this._s;}addEventListener(){}}
const store={};
const documentStub={getElementById:()=>makeEl(),querySelector:()=>makeEl(),querySelectorAll:()=>[],addEventListener:(e,f)=>{if(e==='DOMContentLoaded')f();},createElement:()=>makeEl(),body:makeEl(),readyState:'complete'};
const sandbox={document:documentStub,window:{},Image:ImageStub,requestAnimationFrame:noop,cancelAnimationFrame:noop,addEventListener:noop,removeEventListener:noop,
  setTimeout:()=>0,clearTimeout:noop,setInterval:()=>0,clearInterval:noop,
  localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}},
  fetch:()=>Promise.resolve({ok:false,json:()=>Promise.resolve([])}),Audio:class{play(){return Promise.resolve();}},
  Date,Math,console,JSON,Promise,encodeURIComponent,history:{back:noop}};
sandbox.window=sandbox;
const brSrc=fs.readFileSync(path.resolve('public/buildable-renders.js'),'utf8');
vm.createContext(sandbox); vm.runInContext(brSrc,sandbox); vm.runInContext(scripts,sandbox);
const G=sandbox.window.ART_GAME, BR=sandbox.window.BuildableRenders;
let fail=0; const ok=(c,m)=>{console.log((c?'  PASS':'  FAIL')+' — '+m); if(!c)fail++;};
console.log('ART STUDIO v2 QA');
ok(!!G,'ART_GAME hook exported');
['stroke','mirror','shape'].forEach(fn=>ok(typeof BR[fn]==='function','BR.'+fn+' present'));
G.reset(); const r=G.sim();
ok(r.allBrushesDrawable,'>=9 drawing brushes laid strokes ('+r.brushesUsed.length+')');
ok(r.mirrorsUsed.length>=4,'>=4 mirror modes exercised ('+r.mirrorsUsed.join(',')+')');
ok(r.stylesUsed.length>=4,'>=4 art styles exercised ('+r.stylesUsed.join(',')+')');
ok(r.hadFill,'fill-bucket op added');
ok(r.hadShape,'shape stamp op added');
ok(r.undoOk,'undo works'); ok(r.redoOk,'redo works');
const rt=G.roundtrip();
ok(rt.ok,'save->JSON->clear->restore lossless incl style+bg ('+rt.count+'/'+rt.expected+')');
// BR.shape + new textures don't throw with a real-ish ctx stub
try{ ['ribbon','fur','dots','glow','grain','spray','waxy'].forEach(t=>BR.stroke(ctxStub,{texture:t,points:[{x:1,y:1,w:5},{x:9,y:9,w:8}],color:'#f00',width:8,alpha:1}));
  ['star','heart','flower','diamond','dot'].forEach(s=>BR.shape(ctxStub,s,10,10,20,'#0f0'));
  BR.mirror(ctxStub,'V',100,100,()=>{}); BR.mirror(ctxStub,'H',100,100,()=>{}); BR.mirror(ctxStub,8,100,100,()=>{});
  ok(true,'all textures/shapes/mirror modes run without throwing');
}catch(e){ ok(false,'textures/shapes threw: '+e.message); }
console.log(fail?('\nQA FAILED ('+fail+')'):'\nALL QA PASSED');
process.exit(fail?1:0);
