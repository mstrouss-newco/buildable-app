import { chromium } from 'playwright';
const b = await chromium.launch({ args:['--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{width:1200,height:850} });
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://127.0.0.1:8099/dev-farm.html',{waitUntil:'load'});
await p.waitForFunction(()=>!!window.FARM,null,{timeout:60000});
await p.waitForTimeout(6000);
const r=await p.evaluate(async ()=>{
  const F=window.FARM, sleep=ms=>new Promise(r=>setTimeout(r,ms)), out={};
  F.setCoins(400);
  // 1. plant, grow, harvest -> card appears then goes
  const ps=F.patches(); const open=[]; ps.forEach((x,i)=>{ if(!x.locked&&x.state==='empty') open.push(i); });
  F.plant(open[0],'corn'); F.closeSeedPicker(); await sleep(300);
  for(let k=0;k<8;k++){ F.advanceTime(120); await sleep(450); }
  out.readyOk = F.patches()[open[0]].state==='ready';
  const q=F.patches()[open[0]];
  const s0=F.stack().length;
  F.moveKidTo(q.x,q.z); await sleep(2600);
  out.harvested = F.stack().length>s0;
  out.patchCleared = F.patches()[open[0]].state==='empty';
  // 2. produce on the grass gets picked up
  window.__DEV.forceProduce(2); await sleep(900);
  const A=(F.animals()||[]).filter(a=>a.state==='ready');
  out.producedN = A.length;
  if(A[0]){ const s1=F.stack().length; F.moveKidTo(A[0].x, A[0].z); await sleep(3200);
            out.produceCollected = F.stack().length>s1; }
  // 3. crate takes what it asked for
  const c=F.crate?F.crate():null;
  const ord0=F.order()? F.order().items.filter(i=>i.filled).length : -1;
  if(c){ F.moveKidTo(c.x, c.z+1.4); await sleep(3400); }
  const ord1=F.order()? F.order().items.filter(i=>i.filled).length : -1;
  out.orderBefore=ord0; out.orderAfter=ord1;
  return out;
});
console.log(JSON.stringify(r,null,1)); console.log('ERR',errs.slice(0,4));
await b.close();
