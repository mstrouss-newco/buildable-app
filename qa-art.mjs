// Headless QA for public/art-studio.html — drives window.ART_GAME in node.
// Asserts: sim() lays strokes with all brushes across mirror settings + undo/redo work,
// and roundtrip() proves the save->JSON->clear->restore contract is lossless.
import fs from 'fs'; import path from 'path'; import vm from 'vm';
const file = path.resolve('public/art-studio.html');
const html = fs.readFileSync(file,'utf8');
const scripts=[...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');

const noop=()=>{};
const ctxStub=new Proxy({},{get:(_,k)=>(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop:noop}):(k==='toDataURL'?()=>'data:,':(typeof k==='string'?noop:undefined))});
function makeEl(){return {style:{},dataset:{},classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},
  addEventListener:noop,appendChild:noop,removeChild:noop,remove:noop,click:noop,setAttribute:noop,
  getContext:()=>ctxStub,toDataURL:()=>'data:,',width:900,height:540,naturalWidth:1,naturalHeight:1,complete:true,
  getBoundingClientRect:()=>({left:0,top:0,width:900,height:540}),querySelectorAll:()=>[],set innerHTML(v){},set textContent(v){},set onclick(v){},value:'',checked:false};}
class ImageStub{constructor(){this.complete=true;this.naturalWidth=1;this.naturalHeight=1;}set src(v){this._s=v;if(this.onload)this.onload();}get src(){return this._s;}addEventListener(){}}
const store={};
const documentStub={getElementById:()=>makeEl(),querySelector:()=>makeEl(),querySelectorAll:()=>[],
  addEventListener:(e,f)=>{if(e==='DOMContentLoaded')f();},createElement:()=>makeEl(),body:makeEl(),readyState:'complete'};
const sandbox={document:documentStub,window:{},Image:ImageStub,
  requestAnimationFrame:noop,cancelAnimationFrame:noop,addEventListener:noop,removeEventListener:noop,
  setTimeout:()=>0,clearTimeout:noop,setInterval:()=>0,clearInterval:noop,
  localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}},
  fetch:()=>Promise.resolve({ok:false,json:()=>Promise.resolve([])}),
  Audio:class{constructor(){}play(){return Promise.resolve();}},
  Date,Math,console,JSON,Promise,encodeURIComponent,history:{back:noop}};
sandbox.window=sandbox;

// load the shared BR lib first (the engine calls BR.stroke/BR.mirror)
const brSrc=fs.readFileSync(path.resolve('public/buildable-renders.js'),'utf8');
vm.createContext(sandbox);
vm.runInContext(brSrc,sandbox);
vm.runInContext(scripts,sandbox);

const G=sandbox.window.ART_GAME;
let fail=0; const ok=(c,m)=>{console.log((c?'  PASS':'  FAIL')+' — '+m); if(!c)fail++;};
console.log('ART STUDIO QA');
ok(!!G,'ART_GAME hook exported');
ok(typeof sandbox.window.BuildableRenders.stroke==='function','BR.stroke present');
ok(typeof sandbox.window.BuildableRenders.mirror==='function','BR.mirror present');
G.reset();
const r=G.sim(1);
ok(r.added>=9,'sim added all ops ('+r.added+')');
ok(r.allBrushesDrawable,'>=7 drawing brushes laid strokes ('+r.brushesUsed.length+')');
ok(r.mirrorsUsed.length>=3,'multiple mirror settings exercised ('+r.mirrorsUsed.join(',')+')');
ok(r.undoOk,'undo removes last op');
ok(r.redoOk,'redo restores it');
const rt=G.roundtrip();
ok(rt.ok,'save->JSON->clear->restore is lossless ('+rt.count+'/'+rt.expected+')');
console.log(fail? ('\nQA FAILED ('+fail+')') : '\nALL QA PASSED');
process.exit(fail?1:0);
