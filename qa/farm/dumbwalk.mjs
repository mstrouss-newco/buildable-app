// A player who only ever holds the arrow that points at the thing they want.
// No going round, no tapping. If the farm is playable with the keys, this works.
import { chromium } from 'playwright';
const b = await chromium.launch({ args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding'] });
const p = await b.newPage({ viewport:{width:1000,height:700} });
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const file = process.argv[2] || 'skyflyer-farm.html';
await p.goto('http://127.0.0.1:8099/'+file+'?nodraw=1',{waitUntil:'load'});
await p.waitForFunction(()=>!!window.FARM,null,{timeout:60000});
await p.waitForTimeout(2500);
const kid = ()=>p.evaluate(()=>{const k=window.FARM.kid(); return {x:+k.x.toFixed(2), z:+k.z.toFixed(2)};});
// A real player HOLDS the arrow down. Keys only change when the direction does.
async function hold(tx,tz,limitMs){
  const t0=Date.now(); let down=new Set();
  const set=async(want)=>{
    for(const k of [...down]) if(!want.has(k)){ await p.keyboard.up(k); down.delete(k); }
    for(const k of want) if(!down.has(k)){ await p.keyboard.down(k); down.add(k); }
  };
  try{
    while(Date.now()-t0<limitMs){
      const k=await kid();
      if(Math.hypot(tx-k.x,tz-k.z)<1.2) return {ok:true, at:k, secs:+((Date.now()-t0)/1000).toFixed(1)};
      const want=new Set();
      if(tz-k.z<-0.4) want.add('ArrowUp'); else if(tz-k.z>0.4) want.add('ArrowDown');
      if(tx-k.x>0.4) want.add('ArrowRight'); else if(tx-k.x<-0.4) want.add('ArrowLeft');
      await set(want);
      await p.waitForTimeout(120);
    }
    return {ok:false, at:await kid()};
  } finally { for(const k of [...down]) await p.keyboard.up(k); }
}
const out={};
// into the fenced garden from outside
await p.evaluate(()=>window.FARM.moveKidTo(-11.5,-1.6));
out.intoGarden = await hold(-3.6,-1.6, 20000);
// out of the garden and all the way to the chicken coop on the far side
out.toChickens = await hold(18, 0.6, 35000);
// back across to the crate
out.toCrate = await hold(-14.5, 3.2, 40000);
console.log(JSON.stringify(out,null,1)); console.log('ERR', errs.slice(0,3));
await b.close();
