import { chromium } from 'playwright-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT=path.resolve('public');
const MIME={'.html':'text/html','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.ico':'image/x-icon','.css':'text/css'};
const srv=http.createServer((q,r)=>{ let u=decodeURIComponent(q.url.split('?')[0]); if(u==='/')u='/play.html';
  const f=path.join(ROOT,u); if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end('no');}
  r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'}); fs.createReadStream(f).pipe(r); });
await new Promise(res=>srv.listen(0,res)); const port=srv.address().port;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const page=await b.newPage({viewport:{width:1280,height:800}});
await page.goto(`http://127.0.0.1:${port}/play.html`); await page.waitForFunction('window.BK_GAME');
// keyboard
await page.locator('#howto').dispatchEvent('pointerdown');
const x0=(await page.evaluate(()=>BK_GAME.dbg())).px;
await page.keyboard.down('ArrowRight'); await page.waitForTimeout(700); await page.keyboard.up('ArrowRight');
const d1=await page.evaluate(()=>BK_GAME.dbg());
await page.keyboard.down('ArrowRight'); await page.keyboard.press('Space'); await page.waitForTimeout(120);
const d2=await page.evaluate(()=>BK_GAME.dbg()); await page.keyboard.up('ArrowRight');
await page.waitForTimeout(900);
// on-screen pad
const x1=(await page.evaluate(()=>BK_GAME.dbg())).px;
const R=await page.locator('#dright').boundingBox(), J=await page.locator('#djump').boundingBox();
await page.mouse.move(R.x+R.width/2,R.y+R.height/2); await page.mouse.down(); await page.waitForTimeout(600);
await page.mouse.up();
const d3=await page.evaluate(()=>BK_GAME.dbg());
await page.mouse.move(J.x+J.width/2,J.y+J.height/2); await page.mouse.down(); await page.waitForTimeout(100);
const d4=await page.evaluate(()=>BK_GAME.dbg()); await page.mouse.up();
console.log('start px',x0);
console.log('keyboard right ->',d1.px,'(moved',d1.px-x0,')');
console.log('keyboard jump  -> onGround',d2.onG,'vy',d2.vy);
console.log('pad right      ->',d3.px,'(moved',d3.px-x1,')');
console.log('pad jump       -> onGround',d4.onG,'vy',d4.vy);
await b.close(); srv.close();
