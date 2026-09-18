import sys, io
SRC = sys.argv[1]; OUT = sys.argv[2]
s = io.open(SRC, encoding='utf-8').read()
def sub(tag, old, new, count=1):
    global s
    n=s.count(old); assert n==count, "ANCHOR %s: %d != %d" % (tag,n,count)
    s=s.replace(old,new); print("ok",tag)

# ------------------------------------------------- the keys take the keyboard
sub("key-focus",
"""function onKey(e, down){
  var k=KEY_MAP[e.key]; if(!k) return;
  KEY_DOWN[k]=down;""",
"""function onKey(e, down){
  var k=KEY_MAP[e.key]; if(!k) return;
  KEY_DOWN[k]=down;
  // FM18 — a key counts as playing. The opening card says TAP A DIRT PATCH,
  // which is true on a phone and a lie on a computer, and it used to sit there
  // all game because only a thumb on the stick or a tap on the ground ever
  // took it down.
  if(down) hideHint();""")

sub("grab-keyboard",
"""window.addEventListener("pointerdown", function(){ try{ window.focus(); }catch(e){} });""",
"""window.addEventListener("pointerdown", function(){ try{ window.focus(); }catch(e){} });
// FM18 — AND TAKE THE KEYBOARD WITHOUT BEING ASKED. The farm runs in a frame
// inside the app. Until something inside that frame has the keyboard, every
// arrow key goes to the page around it and the farm never hears one, so on a
// computer the arrows looked broken. Every other keyboard game in the app is
// handed the keyboard by the shell the moment it loads; the farm was the one
// that was not. It now takes it for itself as well, on load and the moment
// the mouse crosses it, so it does not depend on being handed anything.
try{ window.focus(); }catch(e){}
window.addEventListener("load", function(){ try{ window.focus(); }catch(e){} });
window.addEventListener("mouseover", function(){ try{ window.focus(); }catch(e){} });""")


# --------------------------------------------------------- the gate nudge
# Holding an arrow at a fence pins her against it and nothing happens, because
# a key pressed straight at a wall has no sideways part for the push-out to
# slide along. A tap already routes through gates; keys did not. Now, when a
# held key gets her nowhere for a quarter of a second, she walks the fence to
# its gate on her own and carries on. Nothing changes for a tap or a thumb.
sub("gate-nudge",
"""function keyVec(){""",
"""var JAM={t:0, age:0, idle:0, cool:0, lastX:1e9, lastZ:1e9, gx:0, gz:0, on:false};
function gateNudge(mx, mz, dt){
  // Already walking the fence: keep going, at full speed, until the doorway.
  // (Re-deciding this every frame is what made her creep: the moment she moved
  // she looked unstuck, and the moment she stopped she was pinned again.)
  if(JAM.on){
    var dx=JAM.gx-kid.position.x, dz=JAM.gz-kid.position.z, d=Math.hypot(dx,dz);
    JAM.lastX=kid.position.x; JAM.lastZ=kid.position.z;
    JAM.age+=dt;
    // While she is walking to the door the player's steering is left alone:
    // it is a second or two at most, and a four year old pressing the other
    // arrow to correct would otherwise cancel the very thing helping them and
    // be pinned on the fence again. Let go of the keys and it stops at once.
    JAM.idle=0;
    if(d<0.7 || JAM.age>5){ JAM.on=false; JAM.t=0; JAM.cool=3; return null; }
    return {x:dx/d, z:dz/d};
  }
  var moved=Math.hypot(kid.position.x-JAM.lastX, kid.position.z-JAM.lastZ);
  JAM.lastX=kid.position.x; JAM.lastZ=kid.position.z;
  // A short rest after each trip to a doorway, so a fence with one gate on the
  // far side cannot put her in a loop: press on and she keeps her own heading.
  if(JAM.cool>0){ JAM.cool-=dt; JAM.t=0; return null; }
  if(moved > speed*dt*0.45){ JAM.t=0; return null; }
  JAM.t+=dt;
  if(JAM.t<0.22) return null;
  // The fence she is pinned on belongs either to the pen she is standing in or
  // to the pen she is trying to walk into.
  var A=areaContaining(kid.position.x, kid.position.z);
  if(!A) A=areaContaining(kid.position.x+mx*1.6, kid.position.z+mz*1.6);
  if(!A || !A.gate){ JAM.t=0; return null; }
  // Aim THROUGH the doorway, not at it. Stopping on the gate leaves her still
  // outside the fence line, pressed on the post, which is where she started.
  var ix=A.cx-A.gate.x, iz=A.cz-A.gate.z, im=Math.hypot(ix,iz)||1;
  var thr=inArea(A, kid.position.x, kid.position.z, 0) ? -1.8 : 1.8;
  JAM.gx=A.gate.x + (ix/im)*thr; JAM.gz=A.gate.z + (iz/im)*thr;
  JAM.on=true; JAM.t=0; JAM.age=0; JAM.idle=0;
  return null;
}
function keyVec(){""")

sub("gate-nudge-use",
"""  var mx=0, mz=0;
  if(mag>0.08){ mx=mv.x; mz=mv.y; clearWalkTo(); }""",
"""  var mx=0, mz=0;
  if(mag>0.08){ mx=mv.x; mz=mv.y; clearWalkTo(); }
  // FM18 — a held key that is getting nowhere is aimed at the gate instead
  if(kv.mag>0 && mag>0.08){
    var gn=gateNudge(mx, mz, dt);
    if(gn){ mx=gn.x; mz=gn.z; }
  } else if(JAM.on){
    // hands off the keys for a moment and she stops walking to the door
    JAM.idle+=dt; if(JAM.idle>0.25){ JAM.on=false; JAM.t=0; }
  }""")

sub("version", 'version: "fm17d"', 'version: "fm18"')
io.open(OUT,'w',encoding='utf-8').write(s)
print("wrote", OUT, len(s))
