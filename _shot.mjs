import { chromium } from 'playwright-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT=path.resolve('public');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.ico':'image/x-icon'};
const srv=http.createServer((q,r)=>{ let u=decodeURIComponent(q.url.split('?')[0]); if(u==='/')u='/play.html';
  const f=path.join(ROOT,u); if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end('no');}
  r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'}); fs.createReadStream(f).pipe(r); });
await new Promise(res=>srv.listen(0,res)); const port=srv.address().port;
const args=process.argv.slice(2);
const shots=JSON.parse(args[0]||'[]');           // [{name, frames, w, h}]
const outDir=args[1]||'/tmp/shots';
fs.mkdirSync(outDir,{recursive:true});
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const errs=[];
for(const sh of shots){
  const page=await browser.newPage({viewport:{width:sh.w,height:sh.h},deviceScaleFactor:2});
  page.on('pageerror',e=>errs.push(sh.name+': '+e.message));
  page.on('console',m=>{ const x=m.text(); if(m.type()==='error' && !/Failed to load resource|ERR_TUNNEL|404/.test(x)) errs.push(sh.name+' console: '+x.slice(0,200)); });
  await page.addInitScript(()=>{ window.requestAnimationFrame=()=>0; });
  await page.goto(`http://127.0.0.1:${port}/play.html`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction('window.BK_GAME');
  await page.locator('#howto').dispatchEvent('pointerdown');
  await page.evaluate(n=>{ window.BK_GAME.setBot(true); window.BK_GAME.frameStep(n); }, sh.frames);
  await page.screenshot({path:path.join(outDir,sh.name+'.png')});
  const dbg=await page.evaluate(()=>window.BK_GAME.dbg());
  console.log(sh.name, JSON.stringify(dbg));
  await page.close();
}
await browser.close(); srv.close();
if(errs.length){ console.log('ERRORS:'); errs.slice(0,20).forEach(e=>console.log(' ',e)); process.exit(1); }
console.log('no page errors');
