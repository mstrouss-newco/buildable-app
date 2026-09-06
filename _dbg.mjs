import { chromium } from 'playwright-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT=path.resolve('public');
const MIME={'.html':'text/html','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.ico':'image/x-icon','.css':'text/css'};
const srv=http.createServer((q,r)=>{ let u=decodeURIComponent(q.url.split('?')[0]); if(u==='/')u='/play.html';
  const f=path.join(ROOT,u); if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end('no');}
  r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'}); fs.createReadStream(f).pipe(r); });
await new Promise(res=>srv.listen(0,res)); const port=srv.address().port;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const page=await b.newPage({viewport:{width:1440,height:900}});
await page.addInitScript(()=>{ window.requestAnimationFrame=()=>0; });
await page.goto(`http://127.0.0.1:${port}/play.html`); await page.waitForFunction('window.BK_GAME');
await page.locator('#howto').dispatchEvent('pointerdown');
await page.evaluate(()=>{ BK_GAME.setBot(true); BK_GAME.frameStep(230); });
console.log(await page.evaluate(()=>{
  return JSON.stringify({W,VH,skyPad:skyPad(),camX:Math.round(camX),camY:Math.round(camY),
    py:Math.round(player.y), px:Math.round(player.x),
    groundVisible: L.ground.filter(g=>g.x1-camX>-40 && g.x0-camX<W+40).map(g=>[Math.round(g.x0-camX),Math.round(g.x1-camX),g.y]),
    pits: pitsOf(L).slice(0,6).map(p=>[Math.round(p.x0),Math.round(p.x1)]),
    nPits: pitsOf(L).length, dirt:GAME_CONFIG.palette.dirt});
}));
await b.close(); srv.close();
