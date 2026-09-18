import { chromium } from 'playwright';
const b = await chromium.launch({ args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding'] });
const p = await b.newPage({ viewport:{width:1100,height:760} });
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://127.0.0.1:8099/skyflyer-farm.html?nodraw=1',{waitUntil:'load'});
await p.waitForFunction(()=>!!window.FARM,null,{timeout:60000});
await p.waitForTimeout(2500);

const log=[];
const say=(s)=>{ log.push(s); };
const kid = ()=>p.evaluate(()=>{const k=window.FARM.kid(); return {x:+k.x.toFixed(2), z:+k.z.toFixed(2)};});
const hint = ()=>p.evaluate(()=>{const h=document.getElementById('hint'); return h && getComputedStyle(h).opacity>0.1 ? h.innerText.replace(/\s+/g,' ').trim() : null;});

// ---------- 1. can I move with the keys, and does she go the right way?
const a=await kid();
await p.keyboard.down('ArrowUp'); await p.waitForTimeout(700); await p.keyboard.up('ArrowUp');
const upP=await kid();
await p.keyboard.down('ArrowRight'); await p.waitForTimeout(700); await p.keyboard.up('ArrowRight');
const rP=await kid();
await p.keyboard.down('ArrowDown'); await p.waitForTimeout(700); await p.keyboard.up('ArrowDown');
const dP=await kid();
await p.keyboard.down('ArrowLeft'); await p.waitForTimeout(700); await p.keyboard.up('ArrowLeft');
const lP=await kid();
say(`keys: up moved z ${(upP.z-a.z).toFixed(2)} (want negative), right moved x ${(rP.x-upP.x).toFixed(2)} (want positive), down moved z ${(dP.z-rP.z).toFixed(2)} (want positive), left moved x ${(lP.x-dP.x).toFixed(2)} (want negative)`);
say(`first hint on screen: ${await hint()}`);

// ---------- 2. walk to a dirt patch using the keys only
const target = await p.evaluate(()=>{ const ps=window.FARM.patches(); const q=ps.find(x=>!x.locked&&x.state==='empty'); return q?{x:q.x,z:q.z}:null; });
// A player with arrow keys and no map: walk at it, and when a fence stops you,
// head for that pen's gate first, the way a person would.
async function walkTo(tx,tz,limitMs){
  const t0=Date.now();
  let stuck=0, last=null, aim=null, bumps=0;
  while(Date.now()-t0 < (limitMs||12000)){
    const k=await kid();
    if(Math.hypot(tx-k.x,tz-k.z)<1.0) return {ok:true, bumps};
    if(last && Math.hypot(k.x-last.x,k.z-last.z)<0.12){ stuck++; } else { stuck=0; }
    last=k;
    if(stuck>4 && !aim){
      bumps++;
      aim = await p.evaluate(([x,z])=>{
        const F=window.FARM, A=(F.areas?F.areas():[]).find(a=>
          x>a.cx-a.halfX && x<a.cx+a.halfX && z>a.cz-a.halfZ && z<a.cz+a.halfZ);
        return A && A.gate ? {x:A.gate.x, z:A.gate.z} : null;
      },[tx,tz]);
      stuck=0;
    }
    const goal = aim || {x:tx,z:tz};
    if(aim && Math.hypot(aim.x-k.x, aim.z-k.z)<1.2) aim=null;
    const dx=goal.x-k.x, dz=goal.z-k.z;
    const keys=[];
    if(dz<-0.4) keys.push('ArrowUp'); else if(dz>0.4) keys.push('ArrowDown');
    if(dx>0.4) keys.push('ArrowRight'); else if(dx<-0.4) keys.push('ArrowLeft');
    for(const kk of keys) await p.keyboard.down(kk);
    await p.waitForTimeout(140);
    for(const kk of keys) await p.keyboard.up(kk);
  }
  return {ok:false, bumps};
}
const arrived = await walkTo(target.x, target.z, 20000);
say(`walked to a dirt patch with the arrow keys only: ${arrived.ok?'yes':'NO, gave up'} after ${arrived.bumps} fence bump(s) (now ${JSON.stringify(await kid())}, patch at ${target.x},${target.z})`);
say(`hint when standing on the patch: ${await hint()}`);

// ---------- 3. plant: does the seed picker open and can I buy a seed?
const before = await p.evaluate(()=>({coins:window.FARM.coins()}));
await p.evaluate(()=>{ const ps=window.FARM.patches(); const i=ps.findIndex(x=>!x.locked&&x.state==='empty'); window.FARM.openSeedPicker(i); });
await p.waitForTimeout(500);
const picker = await p.evaluate(()=>{
  const btns=window.FARM.seedButtons?window.FARM.seedButtons():[];
  return {n:btns.length, first:btns[0]||null};
});
say(`seed picker: ${picker.n} seeds offered, first = ${JSON.stringify(picker.first)}`);
await p.evaluate(()=>{ const ps=window.FARM.patches(); const i=ps.findIndex(x=>!x.locked&&x.state==='empty'); window.FARM.plant(i,'corn'); window.FARM.closeSeedPicker(); });
await p.waitForTimeout(400);
const after = await p.evaluate(()=>({coins:window.FARM.coins(), planted:window.FARM.patches().filter(x=>x.state!=='empty'&&!x.locked).length}));
say(`planted corn: coins ${before.coins} -> ${after.coins}, patches with something in them: ${after.planted}`);

// ---------- 4. wait for it, then harvest by walking over it
await p.evaluate(async ()=>{ const F=window.FARM; for(let i=0;i<8;i++){ F.advanceTime(120); await new Promise(r=>setTimeout(r,200)); } });
const ready = await p.evaluate(()=>window.FARM.patches().filter(x=>x.state==='ready').length);
say(`after waiting, beds ready: ${ready}`);
const rb = await p.evaluate(()=>{ const q=window.FARM.patches().find(x=>x.state==='ready'); return q?{x:q.x,z:q.z}:null; });
const s0 = await p.evaluate(()=>window.FARM.stack().length);
if(rb){ await walkTo(rb.x, rb.z, 20000); }
await p.waitForTimeout(900);
const s1 = await p.evaluate(()=>window.FARM.stack().length);
say(`walked onto a ready bed: carrying ${s0} -> ${s1}`);
say(`hint while carrying: ${await hint()}`);

// ---------- 5. take it to the crate
const crate = await p.evaluate(()=>{ const c=window.FARM.crate(); return {x:c.x,z:c.z}; });
const o0 = await p.evaluate(()=>{ const o=window.FARM.order(); return o? o.items.map(i=>i.kind+(i.filled?'*':'')) : null; });
say(`the crate wants: ${JSON.stringify(o0)} and it is at ${crate.x},${crate.z}`);
const gotThere = (await walkTo(crate.x, crate.z+1.2, 25000)).ok;
await p.waitForTimeout(1200);
const o1 = await p.evaluate(()=>{ const o=window.FARM.order(); return {items:o?o.items.map(i=>i.kind+(i.filled?'*':'')):null, coins:window.FARM.coins(), carrying:window.FARM.stack().length}; });
say(`reached the crate: ${gotThere?'yes':'NO'} -> ${JSON.stringify(o1)}`);

// ---------- 6. an animal that wants something
const an = await p.evaluate(()=>{ const A=(window.FARM.animals()||[]); const h=A.find(x=>x.state==='hungry'); return h?{kind:h.kind,x:h.x,z:h.z,wants:h.wants}:null; });
say(`nearest hungry animal: ${JSON.stringify(an)}`);
if(an){
  await p.evaluate(k=>{ if(k) window.FARM.giveItem(k); }, an.wants||null);
  await p.waitForTimeout(400);
  const st0 = await p.evaluate(()=>window.FARM.stack().length);
  const reach = await walkTo(an.x, an.z, 30000);
  await p.waitForTimeout(1500);
  const res = await p.evaluate(()=>{ const A=(window.FARM.animals()||[]); const st={}; A.forEach(a=>st[a.state]=(st[a.state]||0)+1); return {states:st, carrying:window.FARM.stack().length}; });
  say(`reached it: ${reach.ok} after ${reach.bumps} bump(s), ended at ${JSON.stringify(await kid())} vs animal ${an.x},${an.z}. carried what it wanted and walked to it: carrying ${st0} -> ${res.carrying}, animal states now ${JSON.stringify(res.states)}`);
}

console.log(log.join('\n'));
console.log('JS ERRORS:', errs.length? errs.slice(0,5) : 'none');
await b.close();
