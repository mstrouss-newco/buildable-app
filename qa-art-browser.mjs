// Real-browser smoke test for public/art-studio.html.
// The node-vm QA (qa-art.mjs) proves the drawing logic; this proves the actual page
// loads, wires up and reacts to real taps. Skips cleanly if playwright is absent.
import http from 'http'; import fs from 'fs'; import path from 'path';
let chromium; try{ ({chromium}=await import('playwright')); }catch(e){ console.log('SKIP — playwright not installed'); process.exit(0); }
const root=path.resolve('public');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.json':'application/json','.svg':'image/svg+xml'};
const srv=http.createServer((req,res)=>{ const u=decodeURIComponent(req.url.split('?')[0]);
  if(u.startsWith('/api/')){ res.writeHead(200,{'Content-Type':'application/json'}); return res.end('{"ok":true}'); }
  const p=path.join(root,u==='/'?'/index.html':u);
  fs.readFile(p,(e,d)=>{ if(e){ res.writeHead(404); return res.end('404'); } res.writeHead(200,{'Content-Type':types[path.extname(p)]||'application/octet-stream'}); res.end(d); }); });
await new Promise(r=>srv.listen(0,r)); const port=srv.address().port;
const browser=await chromium.launch({executablePath:process.env.PW_CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'}).catch(()=>chromium.launch());
const page=await browser.newPage({viewport:{width:1024,height:768}});
const errs=[]; page.on('pageerror',e=>errs.push('pageerror: '+e.message));
page.on('console',m=>{ if(m.type()==='error'&&!/favicon|404|save-art|net::|Failed to load resource/i.test(m.text())) errs.push('console: '+m.text()); });
await page.goto('http://localhost:'+port+'/art-studio.html',{waitUntil:'networkidle'});
let fail=0; const ok=(c,m)=>{console.log((c?'  PASS':'  FAIL')+' — '+m); if(!c)fail++;};
console.log('ART STUDIO — real browser');
ok(errs.length===0,'page loads with no javascript errors'+(errs.length?': '+errs[0]:''));
ok((await page.textContent('#clearBtn')).trim()==='New Page','top bar button says New Page');
// draw three real strokes with the mouse
const box=await page.locator('#paper').boundingBox();
for(let i=0;i<3;i++){ await page.mouse.move(box.x+80+i*40,box.y+80); await page.mouse.down();
  await page.mouse.move(box.x+180+i*40,box.y+180,{steps:6}); await page.mouse.up(); }
const drawn=await page.evaluate(()=>window.ART_GAME.state.ops.length);
ok(drawn>=3,'mouse drawing still adds strokes ('+drawn+')');
await page.click('#clearBtn');
const anyOverlay=await page.evaluate(()=>!!document.querySelector('.ov.show'));
ok(!anyOverlay,'New Page opens no popup at all');
ok(await page.evaluate(()=>window.ART_GAME.state.ops.length===0),'paper is blank after New Page');
await page.click('#undoBtn');
ok(await page.evaluate(()=>window.ART_GAME.state.ops.length)===drawn,'Undo brings the drawing straight back');
await page.click('#clearBtn'); await page.reload({waitUntil:'networkidle'});
ok(await page.evaluate(()=>window.ART_GAME.state.ops.length)===0,'blank page survives a reload');
await page.click('#undoBtn');
ok(await page.evaluate(()=>window.ART_GAME.state.ops.length)===drawn,'Undo still rescues it after a reload');
// the other overlays still open and close
for(const [btn,ov] of [['#galleryBtn','#galleryOv']]){ await page.click(btn);
  ok(await page.locator(ov).evaluate(e=>e.classList.contains('show')),'overlay '+ov+' still opens'); await page.click(ov+' .iconbtn'); }
ok(errs.length===0,'still no javascript errors after tapping around'+(errs.length?': '+errs[0]:''));
await browser.close(); srv.close();
console.log(fail?('\nBROWSER QA FAILED ('+fail+')'):'\nBROWSER QA PASSED');
process.exit(fail?1:0);
