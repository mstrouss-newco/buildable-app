import fs from 'fs';
const src=fs.readFileSync('public/skyflyer-engine.html','utf8');
const pay=fs.readFileSync('qa/ar1p-payload.js','utf8');
let s=src, n=0;
function rep(a,b){ if(!s.includes(a)) throw new Error('ANCHOR MISSING: '+a.slice(0,70)); s=s.replace(a,b); n++; }

// 1) flags, early enough for the plane builders
rep('var plane=new THREE.Group();',
`var AR1P_FLAGS=((new URLSearchParams(location.search)).get("ar1p")||"").split(",");
function AR1P_HAS(f){ return AR1P_FLAGS.indexOf(f)>=0; }
var plane=new THREE.Group();`);

// 2) the plane selector
rep(`rideAnim = (ride.build==="copter") ? buildCopter()
         : (ride.build==="jetpack") ? buildJetpack()
         : buildPlane();`,
`rideAnim = AR1P_HAS("planeA") ? AR1P_planeA()
         : AR1P_HAS("planeB") ? AR1P_planeB()
         : AR1P_HAS("planeC") ? AR1P_planeC()
         : (ride.build==="copter") ? buildCopter()
         : (ride.build==="jetpack") ? buildJetpack()
         : buildPlane();`);

// 3) the coin swap, before a single coin exists
rep(`var M_COIN=new THREE.MeshPhongMaterial({color:0xFFD54A,emissive:0x3A2700,
  specular:0xFFFFF0,shininess:220,vertexColors:true});`,
`var M_COIN=new THREE.MeshPhongMaterial({color:0xFFD54A,emissive:0x3A2700,
  specular:0xFFFFF0,shininess:220,vertexColors:true});
if(AR1P_HAS("coinA")) AR1P_coinRing();
if(AR1P_HAS("coinB")) AR1P_coinBright();`);

// 4) the payload itself, and its per-frame step
rep('function drawScene(dt){', pay+'\nfunction drawScene(dt){');
rep(`  updateCamera(dt);
  updateArrow();`,
`  try{ AR1P_step(dt,time); }catch(e){}
  updateCamera(dt);
  updateArrow();`);

fs.writeFileSync('public/ar1p-mock.html',s);
console.log('ar1p-mock.html built,',n,'injections,',s.length,'bytes');
