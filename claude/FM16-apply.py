#!/usr/bin/env python3
"""FM16: the pictures come from the image library, and the crate stops lying.
Usage: python3 fm16.py <path-to-skyflyer-farm.html>
"""
import sys

p = sys.argv[1]
s = open(p, encoding='utf-8').read()
orig = s
done = []

def sub(tag, old, new, count=1):
    global s
    assert old in s, "NOT FOUND: " + tag
    n = s.count(old)
    assert n == count, "%s found %d times, expected %d" % (tag, n, count)
    s = s.replace(old, new)
    done.append(tag)

# =========================================================================
# 1. ONE DOOR FOR EVERY ITEM PICTURE, AND IT IS A PAINTED ONE.
# =========================================================================
sub("itempic-css", """  #orderCard .slot svg.pic{width:58px;height:58px;display:block}""",
"""  #orderCard .slot svg.pic{width:58px;height:58px;display:block}
  /* FM16 — THE PAINTED PICTURE, WITH THE DRAWN ONE UNDERNEATH IT. Mike, after
     three passes at the hand-drawn icons: "your art sucks really bad", and he
     was right, a convincing ear of corn in 58 pixels of vector by hand is a
     job for a painter. These are painted by the app's own image generator and
     kept in the shared asset library. The drawn SVG stays exactly where it is
     and shows the moment the painted one fails to load, which is the
     shared-library law: read on render, always with a local fallback. */
  .itempic{position:relative;display:block;line-height:0}
  .itempic > *{position:absolute;left:0;top:0;width:100%;height:100%}
  .itempic img.painted{object-fit:contain}
  .itempic.has svg.fallback{visibility:hidden}""")

sub("itempic-fn", """function ITEM(kind){ return CROP_RECIPES[kind] || PRODUCE_RECIPES[kind] || null; }""",
"""function ITEM(kind){ return CROP_RECIPES[kind] || PRODUCE_RECIPES[kind] || null; }

// FM16 — every item picture in the interface comes through here. The painted
// one loads over the drawn one and hides it; if it never arrives, the drawn one
// was never removed and the farm looks exactly as it did.
var ART_BASE="/api/asset-studio?asset=farm/items/painted/";
function itemPic(kind, size, cls){
  var r=ITEM(kind); if(!r) return "";
  var svg=r.svg ? r.svg(size).replace("<svg ","<svg class=\\""+(cls||"")+" fallback\\" ") : "";
  return '<span class="itempic" style="width:'+size+'px;height:'+size+'px">'+svg+
    '<img class="'+(cls||"")+' painted" alt="" src="'+ART_BASE+kind+'" '+
    'onload="this.parentNode.classList.add(\\'has\\')" onerror="this.remove()">'+
    '</span>';
}""")

sub("slot-pic", """    el.innerHTML=(r ? r.svg(58).replace("<svg ","<svg class=\\"pic\\" ") : "")+""",
"""    el.innerHTML=itemPic(k, 58, "pic")+""")

sub("sticker-pic", """    out.push({ id:"item:"+k, art:r.svg(44), got:!!COLLECTED[k] });""",
"""    out.push({ id:"item:"+k, art:itemPic(k,44,""), got:!!COLLECTED[k] });""")

sub("seedcard-pic", """      '<div class="art">'+r.svg(74)+'</div>'+""",
"""      '<div class="art">'+itemPic(k,74,"")+'</div>'+""")

# =========================================================================
# 2. THE WANT CARD HOLDS THE SAME PAINTED PICTURE THE ORDER CARD HOLDS.
# =========================================================================
sub("wantmesh", """// The want sign: the real 3D item, inside the ask bubble, over the animal's
// head. This is the entire instruction, and it needs no words.""",
"""// FM16 — THE THING IN THE CARD IS THE SAME PICTURE THE ORDER CARD SHOWS. A
// card floating over a hen holding a little 3D model, next to an order card at
// the bottom of the screen holding a painted picture of the same thing, is two
// pictures of one object and a child has to join them up. Now it is one
// picture. The 3D model is still built when the painted one cannot be had.
var ITEM_TEX={};
function itemTexture(kind){
  if(ITEM_TEX[kind]!==undefined) return ITEM_TEX[kind];
  var t=null;
  try{
    t=new THREE.TextureLoader().load(ART_BASE+kind,
        function(){}, function(){}, function(){ ITEM_TEX[kind]=null; });
    if(t) t.anisotropy=4;
  }catch(e){ t=null; }
  ITEM_TEX[kind]=t;
  return t;
}
// A flat painted card-picture if we have one, the turning model if we do not.
function wantItemMesh(kind, scale){
  var tex=itemTexture(kind);
  if(tex){
    var m=new THREE.Mesh(new THREE.PlaneGeometry(scale*1.30, scale*1.30),
      new THREE.MeshBasicMaterial({map:tex, transparent:true, depthWrite:false}));
    m.userData.flat=true;
    return m;
  }
  var r=ITEM(kind);
  return askMesh(hbBake(r.parts(scale)));
}

// The want sign: the painted item, inside the ask card, over the animal's
// head. This is the entire instruction, and it needs no words.""")

sub("showwant-item", """    var m=askMesh(hbBake(r.parts(n>1?0.88:0.95)));
    m.position.x=(n>1)?(i-(n-1)/2)*0.48:0;""",
"""    var m=wantItemMesh(A.wants, n>1?0.88:0.95);
    m.position.x=(n>1)?(i-(n-1)/2)*0.48:0;""")

sub("showwant-spin", """        var its=A.want.userData.items||[];
        for(wi=0;wi<its.length;wi++) its[wi].rotation.y+=dt*1.2;""",
"""        var its=A.want.userData.items||[];
        // a painted picture FACES you; only a model is worth turning
        for(wi=0;wi<its.length;wi++){
          if(its[wi].userData.flat) its[wi].quaternion.copy(camera.quaternion);
          else its[wi].rotation.y+=dt*1.2;
        }""")

sub("cratewant-item", """  var m=askMesh(hbBake(r.parts(0.88))); g.add(m);""",
"""  var m=wantItemMesh(live[crateWantI%live.length], 0.88); g.add(m);""")

sub("cratewant-spin", """  crateWant.userData.items[0].rotation.y += dt*1.4;""",
"""  var ci=crateWant.userData.items[0];
  if(ci.userData.flat) ci.quaternion.copy(camera.quaternion);
  else ci.rotation.y += dt*1.4;""")

sub("truckwant-item", """  var r=ITEM(live[TRUCK.wantI%live.length]); if(!r) return;
  var g=new THREE.Group();
  g.add(hbMesh(hbBake(r.parts(1.05))));""",
"""  var r=ITEM(live[TRUCK.wantI%live.length]); if(!r) return;
  var g=new THREE.Group();
  g.add(wantItemMesh(live[TRUCK.wantI%live.length], 1.05));""")

# =========================================================================
# 3. THE CRATE ONLY CALLS HER FOR SOMETHING IT ACTUALLY WANTS.
# =========================================================================
sub("call-logic", """function updateCrateCall(dt, now){
  if(!CALL.grp) buildCrateCall();
  var i, n=CALL.marks.length;
  var carrying = stack.length>0;""",
"""// FM16 — Mike, playing it: "it says to plant but points at the place to drop
// items I dont have". Two faults in one sentence, and both are this function's.
//
// FIRST, it lit up for ANYTHING in her hands. She was carrying a wheat, the
// crate wanted corn, and the farm laid a line of arrows to a box that would
// shake its head at her when she got there. The game already knows the right
// question, `orderNeeds(kind)`, and already has a whole "you brought the wrong
// thing" animation for arriving without it. It should never have been able to
// send her into that.
//
// SECOND, the "tap a dirt patch to plant a seed" hint was still on screen
// while the arrows pulled the other way. One voice at a time is this farm's
// own rule and the trail was breaking it.
function carryingSomethingTheCrateWants(){
  for(var i=0;i<stack.length;i++)
    if(orderNeeds(stack[i].userData.kind)) return true;
  return false;
}
function updateCrateCall(dt, now){
  if(!CALL.grp) buildCrateCall();
  var i, n=CALL.marks.length;
  var carrying = stack.length>0 && carryingSomethingTheCrateWants();
  // the hint has done its job the moment the crate has something to say
  if(carrying) hideHint();""")

# =========================================================================
# 4. NO BUZZ AT THE MOMENT SHE FINISHES THE ORDER.
# =========================================================================
sub("stillwants", """function flashNope(){""",
"""// FM16 — is there anything left the crate has not already been promised?
function crateStillWantsSomething(){
  if(!order || order.sent) return false;
  for(var i=0;i<order.items.length;i++){
    var it=order.items[i];
    if(!it.filled && !it.claimed) return true;
  }
  return false;
}
function flashNope(){""")

sub("nope", """  if(!pullOneIntoCrate()){
    unload.running=false;
    if(stack.length) flashNope();
  }""",
"""  if(!pullOneIntoCrate()){
    unload.running=false;
    // FM16 — she fills the last slot and is still holding spares, and the card
    // shook its head at her: the reward and the rejection in the same second.
    // orderFull() is not the test, because a slot that has been CLAIMED by an
    // item still in the air is not filled yet, and that gap is exactly when the
    // buzz was landing. The test is whether the crate still wants anything at
    // all, claimed or not.
    if(stack.length && crateStillWantsSomething()) flashNope();
  }""")

# =========================================================================
# 5. THE WANT CARD IS THE ORDER CARD. (Mike: "the thought bubbles are bad
#    and not looking good.")
# =========================================================================
sub("bubble", """function askBubble(rad){
  var g=new THREE.Group();
  var w=rad*2.25, h=rad*2.25, rr=rad*0.42;
  // The card is pushed back along the bubble's own -Z. The bubble is turned to
  // face the camera every frame, so -Z is always straight away from the eye,
  // which puts the card behind the item without any sorting to get wrong.
  // The edge has to be THICK. The first cut made it a twentieth of the card
  // wide and from the game camera the cards read as plain white rectangles
  // stuck on the sky.
  var edge=roundPanel(w+rad*0.44, h+rad*0.44, rr+rad*0.22, 0x2E4258, 0.95, -0.66);
  var face=roundPanel(w, h, rr, 0xFFF7E8, 0.99, -0.62);
  g.add(edge); g.add(face);
  // the two dots trailing down towards the animal, each with the same dark edge
  function dot(r2,x,y){
    var e=new THREE.Mesh(new THREE.CircleGeometry(r2*1.30,14),
      new THREE.MeshBasicMaterial({color:0x2E4258,transparent:true,opacity:0.92,depthWrite:false}));
    var f=new THREE.Mesh(new THREE.CircleGeometry(r2,14),
      new THREE.MeshBasicMaterial({color:0xFFF7E8,transparent:true,opacity:0.98,depthWrite:false}));
    e.position.set(x,y,-0.64); f.position.set(x,y,-0.62);
    g.add(e); g.add(f);
  }
  dot(rad*0.20, -w*0.34, -h*0.66);
  dot(rad*0.12, -w*0.46, -h*0.86);
  g.userData.mat=face.material;
  return g;
}""",
"""// FM15 — IT IS THE SAME CARD THAT IS ALREADY ON THE SCREEN. FM14 made this a
// white box with a heavy navy border, which is solid, which was the point, and
// which looks like a sticker somebody dropped on the farm. The order card at
// the bottom of the screen is the nicest thing in this game and it was already
// the answer: cream #fffef7, a sand slot #f6efd6 inside a tan frame #cbb887,
// generous corners, a soft shadow under it. The thing floating over a hen is
// now one of those slots, with a tail, so the whole farm speaks once.
function askBubble(rad){
  var g=new THREE.Group();
  var w=rad*2.30, h=rad*2.40, rr=w*0.245;      // the order card slot's own corner
  // the shadow, offset down, which is what puts the card IN the world instead
  // of on the glass
  var sh=roundPanel(w*1.03, h*1.03, rr*1.03, 0x1E3C5A, 0.22, -0.72);
  sh.position.x=rad*0.05; sh.position.y=-rad*0.11;
  g.add(sh);
  // the card
  var face=roundPanel(w, h, rr, 0xFFFEF7, 0.99, -0.70);
  g.add(face);
  // the slot inside it: a tan frame with a sand fill, drawn as two panels
  g.add(roundPanel(w*0.855, h*0.855, rr*0.86, 0xCBB887, 0.99, -0.688));
  g.add(roundPanel(w*0.795, h*0.795, rr*0.80, 0xF6EFD6, 0.99, -0.682));
  // the tail, so it is plainly THIS animal asking and not the one behind it
  function tail(scl, hex, z, dy){
    var t=new THREE.Shape();
    t.moveTo(-rad*0.30*scl, -h/2+rad*0.06);
    t.lineTo(0,             -h/2-rad*0.56*scl+dy);
    t.lineTo( rad*0.30*scl, -h/2+rad*0.06);
    var m=new THREE.Mesh(new THREE.ShapeGeometry(t),
      new THREE.MeshBasicMaterial({color:hex, transparent:true, opacity:0.99,
        depthWrite:false, side:THREE.DoubleSide}));
    m.position.z=z; return m;
  }
  var ts=tail(1.28, 0x1E3C5A, -0.715, -rad*0.06);
  ts.position.x=rad*0.05; ts.position.y=-rad*0.11; ts.material.opacity=0.22;
  g.add(ts);
  g.add(tail(1.0, 0xFFFEF7, -0.699, 0));
  g.userData.mat=face.material;
  return g;
}""")

open(p, 'w', encoding='utf-8').write(s)
print("applied:", ", ".join(done))
print("bytes %d -> %d" % (len(orig), len(s)))
