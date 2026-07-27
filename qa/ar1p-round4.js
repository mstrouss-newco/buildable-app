// ============================================================================
//  AR1P round 4 — MAKING THEM MOVE.
//  Mike: "these mostly work, but they cant move right?"
//  Correct. The EverythingLibrary models carry no skeleton and no clips — the
//  FBX exports 0 bones, 0 animations — so nothing in the file can bend a leg.
//
//  So the legs get bent HERE. Each animal is one merged mesh; every vertex is
//  sorted ONCE into a band (leg / body / head / tail) by where it sits in the
//  model's own bounding box, and each frame the bands are pushed around. That is
//  a real walk cycle, on a model with no bones, still ONE DRAW CALL.
//
//  The cost is CPU, not draw calls, so only the animals NEAREST THE CAMERA are
//  puppeted; the rest keep the free whole-body motion (glide, hop, bob, turn).
// ============================================================================
var PUP=[], PUP_BUDGET=10;          // how many animals may be puppeted at once

// Sort every vertex of a merged animal into a band, once, at build time.
//  band 0 body   1 front-left leg   2 front-right leg
//  band 3 back-left leg  4 back-right leg   5 head   6 tail
function AR1P_rig(mesh){
  var g=mesh.geometry, pa=g.attributes.position;
  g.computeBoundingBox();
  var bb=g.boundingBox;
  var hipY = bb.min.y + (bb.max.y-bb.min.y)*0.42;
  var midZ = (bb.min.z+bb.max.z)/2;
  var headZ= bb.min.z + (bb.max.z-bb.min.z)*0.74;
  var tailZ= bb.min.z + (bb.max.z-bb.min.z)*0.18;
  var band=new Uint8Array(pa.count), base=new Float32Array(pa.count*3), i;
  for(i=0;i<pa.count;i++){
    var x=pa.getX(i), y=pa.getY(i), z=pa.getZ(i);
    base[i*3]=x; base[i*3+1]=y; base[i*3+2]=z;
    if(y<hipY)      band[i] = (z>midZ) ? (x<0?1:2) : (x<0?3:4);
    else if(z>headZ) band[i]=5;
    else if(z<tailZ) band[i]=6;
    else             band[i]=0;
  }
  return {mesh:mesh,pos:pa,band:band,base:base,hipY:hipY,
          h:bb.max.y-bb.min.y, len:bb.max.z-bb.min.z};
}
// The gait. Diagonal legs move together, the body bobs twice per stride, the
// head nods and the tail sways — which is most of what reads as "walking" from
// any distance a kid actually sees an animal in this game.
var GAITS={
  walk:function(R,t,pa,i,b,x,y,z){
    var sw=0, lift=0, ph=0;
    if(b>=1&&b<=4){
      ph = (b===1||b===4) ? t : t+Math.PI;        // diagonal pairs
      sw = Math.sin(ph)*0.40*R.len*0.25;
      lift = Math.max(0,Math.sin(ph))*R.h*0.10;
      pa.setXYZ(i, x, y+lift, z+sw);
      return true;
    }
    if(b===5){ pa.setXYZ(i, x, y+Math.sin(t*2)*R.h*0.028, z+Math.sin(t)*R.len*0.02); return true; }
    if(b===6){ pa.setXYZ(i, x+Math.sin(t*1.6)*R.len*0.06, y+Math.sin(t*2)*R.h*0.02, z); return true; }
    pa.setXYZ(i, x, y+Math.sin(t*2)*R.h*0.022, z); return true;
  },
  // A HOP is the right motion for anything with short legs — a frog, a bird on
  // the ground, a rabbit — and it hides the fact that the legs never really bend.
  hop:function(R,t,pa,i,b,x,y,z){
    var c=(t%(Math.PI*2))/(Math.PI*2);
    var air=Math.max(0,Math.sin(c*Math.PI*2)), up=air*R.h*0.55;
    var squash=1-(1-air)*0.16;                     // crouch on the ground
    var tuck=(b>=1&&b<=4)? air*R.h*0.16 : 0;
    pa.setXYZ(i, x, (y-R.hipY)*squash+R.hipY+up+tuck, z+air*R.len*0.10);
    return true;
  },
  // Legs out sideways, body swinging: a lizard's crawl, and a crab's sidle.
  crawl:function(R,t,pa,i,b,x,y,z){
    var wave=Math.sin(t + z*(2.2/Math.max(0.01,R.len)));
    if(b>=1&&b<=4){
      var ph=(b===1||b===4)?t:t+Math.PI;
      pa.setXYZ(i, x+Math.sin(ph)*R.len*0.05, y+Math.max(0,Math.sin(ph))*R.h*0.08,
                   z+Math.cos(ph)*R.len*0.05);
      return true;
    }
    pa.setXYZ(i, x+wave*R.len*0.045, y, z); return true;
  },
  // Wings up and down about the body's centre line; the body dips as they rise.
  flap:function(R,t,pa,i,b,x,y,z){
    var s=Math.sin(t*2.4), a=s*0.85, w=Math.abs(x);
    if(w>R.len*0.06){
      var f=(w/(R.len*0.5));
      pa.setXYZ(i, x*Math.cos(a*f*0.5), y+Math.sin(a)*f*R.h*0.55, z);
      return true;
    }
    pa.setXYZ(i, x, y-s*R.h*0.10, z); return true;
  },
  // A tortoise does not bounce. Slow plod, tiny sway, head easing in and out.
  plod:function(R,t,pa,i,b,x,y,z){
    if(b>=1&&b<=4){
      var ph=(b===1||b===4)?t*0.6:t*0.6+Math.PI;
      pa.setXYZ(i, x, y, z+Math.sin(ph)*R.len*0.07); return true;
    }
    if(b===5){ pa.setXYZ(i, x, y, z+Math.sin(t*0.6)*R.len*0.05); return true; }
    pa.setXYZ(i, x+Math.sin(t*0.6)*R.len*0.012, y, z); return true;
  }
};
function AR1P_puppet(obj,gait,speed){
  var mesh=null;
  obj.traverse(function(o){ if(!mesh&&o.isMesh) mesh=o; });
  if(!mesh) return null;
  // ITS OWN GEOMETRY. A clone shares the buffer with every other copy, so
  // puppeting one would puppet the whole species in lockstep.
  mesh.geometry=mesh.geometry.clone();
  var R=AR1P_rig(mesh);
  R.gait=GAITS[gait]||GAITS.walk; R.sp=speed||3.2; R.ph=Math.random()*6.283;
  R.obj=obj;
  PUP.push(R);
  return R;
}
function AR1P_stepPuppets(t){
  if(!PUP.length) return;
  // only the nearest few are worth the vertex work; the rest still glide, hop
  // and turn as whole bodies, which is what you see from the air anyway
  var cam=camera.position, i, v=new THREE.Vector3();
  for(i=0;i<PUP.length;i++){
    PUP[i].obj.getWorldPosition(v);
    PUP[i].d = v.distanceToSquared(cam);
  }
  var live=PUP.slice().sort(function(a,b){ return a.d-b.d; }).slice(0,PUP_BUDGET);
  for(i=0;i<live.length;i++){
    var R=live[i], pa=R.pos, base=R.base, band=R.band, tt=t*R.sp+R.ph, j;
    for(j=0;j<pa.count;j++)
      R.gait(R,tt,pa,j,band[j],base[j*3],base[j*3+1],base[j*3+2]);
    pa.needsUpdate=true;
  }
}
// which gait suits which animal — chosen so nothing is asked to do a thing its
// shape cannot sell
var GAIT_OF={Chimpanzee:"walk",Mandrill:"walk",Orangutan:"walk",Otter:"walk",
  Pig:"walk",Goat:"walk",Raccoon:"walk",Rabbit:"hop",Hedgehog:"walk",
  Chicken:"hop",PekinDuck:"walk",Dove:"hop",Crow:"hop",
  GreenIguana:"crawl",RockIguana:"crawl",Gecko:"crawl",
  Tortoise:"plod",Snail:"plod",
  RedEyedTreeFrog:"hop",GreenFrog:"hop",Toad:"hop",
  Gull:"flap",Swallow:"flap",Hummingbird:"flap",
  BlueMorphoButterfly:"flap",MonarchButterfly:"flap",Dragonfly:"flap",Bee:"flap"};
