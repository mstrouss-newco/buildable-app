import re, sys, io
SRC = sys.argv[1] if len(sys.argv)>1 else '/home/claude/base-main.html'
OUT = sys.argv[2] if len(sys.argv)>2 else '/home/claude/farm/skyflyer-farm.html'
s = io.open(SRC, encoding='utf-8').read()

def sub(tag, old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, "ANCHOR %s: found %d, expected %d" % (tag, n, count)
    s = s.replace(old, new)
    print("ok", tag)

# ---------------------------------------------------------------- 1. palette
sub("pal-sig",
"""function askBubble(rad){
  var g=new THREE.Group();""",
"""// FM17 — the same card in two voices. The shape, the corners, the shadow and
// the tail never change, because that is what makes the farm speak once. Only
// the frame colour changes: sand for a thing that is ASKING, gold for a thing
// waiting to be TAKEN. Mike could not tell those apart before FM10 and the
// fix then was an arrow; the fix now is that they are the same card in two
// colours, holding the same painted picture the order card holds.
var ASK_PAL={face:0xFFFEF7, frame:0xCBB887, fill:0xF6EFD6};
var GIVE_PAL={face:0xFFFEF7, frame:0xE59A2A, fill:0xFFEEC0};
function askBubble(rad, pal){
  pal = pal || ASK_PAL;
  var g=new THREE.Group();""")

sub("pal-face", "  var face=roundPanel(w, h, rr, 0xFFFEF7, 0.99, -0.70);",
                "  var face=roundPanel(w, h, rr, pal.face, 0.99, -0.70);")
sub("pal-frame", "  g.add(roundPanel(w*0.855, h*0.855, rr*0.86, 0xCBB887, 0.99, -0.688));",
                 "  g.add(roundPanel(w*0.855, h*0.855, rr*0.86, pal.frame, 0.99, -0.688));")
sub("pal-fill", "  g.add(roundPanel(w*0.795, h*0.795, rr*0.80, 0xF6EFD6, 0.99, -0.682));",
                "  g.add(roundPanel(w*0.795, h*0.795, rr*0.80, pal.fill, 0.99, -0.682));")

sub("pal-tail",
"""  ts.position.x=rad*0.05; ts.position.y=-rad*0.11; ts.material.opacity=0.22;
  g.add(ts);
  g.add(tail(1.0, 0xFFFEF7, -0.699, 0));""",
"""  ts.position.x=rad*0.05; ts.position.y=-rad*0.11; ts.material.opacity=0.22;
  ts.userData.tail=1; g.add(ts);
  var tf=tail(1.0, pal.face, -0.699, 0);
  tf.userData.tail=1; g.add(tf);""")

# ------------------------------------------------- 2. the shared card builder
sub("itemcard",
"""  var r=ITEM(kind);
  return askMesh(hbBake(r.parts(scale)));
}""",
"""  var r=ITEM(kind);
  return askMesh(hbBake(r.parts(scale)));
}

// FM17 — ONE PICTURE, EVERYWHERE. Mike: "these cards need to match the actual
// items floating." They did not. A hen asking for corn held a painted corn on
// a cream card. The corn standing ready in the soil was a small orange model.
// The corn riding over her head was a third thing again. Three pictures of one
// object, and a child has to join all three up before the farm makes sense.
// Now every floating item in this world is the card, holding the painted
// picture, at the size the game camera can actually read.
function itemCard(kind, rad, opt){
  opt = opt || {};
  var g=new THREE.Group();
  var bub=askBubble(rad, opt.give?GIVE_PAL:ASK_PAL);
  if(opt.noTail){
    for(var i=0;i<bub.children.length;i++)
      if(bub.children[i].userData.tail) bub.children[i].visible=false;
  }
  g.add(bub);
  // The painted pictures fill their own square corner to corner, so a picture
  // sized against the whole card hangs over its frame. It is sized against the
  // sand SLOT inside the card instead, which is where a picture actually goes.
  // Its z stays at zero: the card's own panels sit behind it along the view
  // axis once the card turns to face you, so any offset here would slide the
  // picture off the card on screen rather than in depth.
  var pic=wantItemMesh(kind, rad*1.42);
  g.add(pic);
  g.userData.bubble=bub; g.userData.pic=pic; g.userData.card=1;
  return g;
}
// A card goes edge-on and disappears unless it is turned to face you every
// frame. The picture inside turns with it; a fallback model still spins.
function faceCard(g){
  if(!g || !g.userData.card) return;
  g.userData.bubble.quaternion.copy(camera.quaternion);
  if(g.userData.pic.userData.flat) g.userData.pic.quaternion.copy(camera.quaternion);
  else g.userData.pic.rotation.y+=0.02;
}
// The picture on its own, with no card behind it. This is what rides the
// stack: a tower of framed cards would overlap into a smear, but a tower of
// pictures reads straight down the side, and it is the SAME picture.
function itemPicMesh(kind, size){
  var tex=itemTexture(kind); if(!tex) return null;
  var m=new THREE.Mesh(new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({map:tex, transparent:true, alphaTest:0.42,
      side:THREE.DoubleSide}));
  m.userData.flat=true;
  return m;
}""")

# ------------------------------------------------------- 3. the carried stack
sub("stackitem",
"""function buildStackItem(kind){
  var r=ITEM(kind); if(!r) return null;
  var s=0.72;
  var geo=hbBake(r.parts(s));
  var m=hbMesh(geo);
  var wrap=new THREE.Group(); wrap.add(m);""",
"""function buildStackItem(kind){
  var r=ITEM(kind); if(!r) return null;
  var s=0.72;
  var wrap=new THREE.Group();
  // FM17 — what she is carrying is the picture off the order card, not a
  // small model of it. A yellow shape over her head was the last place in the
  // farm where corn was drawn a different way from every other corn.
  var pic=itemPicMesh(kind, 0.98);
  if(pic){ wrap.add(pic); wrap.userData.flat=1; }
  else wrap.add(hbMesh(hbBake(r.parts(s))));""")

sub("stackface",
"""      it.rotation.y = kidState.facing + Math.sin(u*Math.PI*2)*0.4;
    } else {""",
"""      it.rotation.y = kidState.facing + Math.sin(u*Math.PI*2)*0.4;
      if(it.userData.flat) it.quaternion.copy(camera.quaternion);
    } else {""")

sub("stackface2",
"""      it.rotation.z = -sway * 0.35;   // lean opposite to the sway
      it.rotation.x = swayZ * 0.35;
    }""",
"""      it.rotation.z = -sway * 0.35;   // lean opposite to the sway
      it.rotation.x = swayZ * 0.35;
      // a picture faces you, always, or the tower turns into a row of lines
      if(it.userData.flat) it.quaternion.copy(camera.quaternion);
    }""")

# ------------------------------------------------------- 4. the ready crop
sub("cropcard",
"""      var bob = 0.04 + Math.max(0,wob)*0.15;
      P.crop.position.y = 0.06 + bob;""",
"""      var bob = 0.04 + Math.max(0,wob)*0.15;
      P.crop.position.y = 0.06 + bob;
      // FM17 — and over the bed, the card. In the GIVE colours, so a bed with
      // something to take never looks like a hen asking for something.
      if(!P.card){ P.card=itemCard(P.seed, 0.62, {give:1}); scene.add(P.card); }
      // And the model in the soil goes. Two pictures of one carrot, one
      // painted and one built out of boxes, is the whole reason a child could
      // not tell what was in the bed. The card IS the crop now.
      P.crop.visible=false;
      P.card.position.set(P.x, 1.02+bob*0.9, P.z);
      P.card.scale.setScalar(1 + Math.max(0,wob)*0.05);
      faceCard(P.card);""")

sub("croparrow",
"""      if(!P.arrow){ P.arrow=giveArrow(1.00); P.arrow.position.set(P.x,1.10,P.z); scene.add(P.arrow); }
      beatArrow(P.arrow, 1.10, now, i);""",
"""      // The card's tail already points at the bed, so the bouncing arrow is
      // one floating thing too many. It stays as the fallback when there is
      // no card to draw.
      if(!P.card){
        if(!P.arrow){ P.arrow=giveArrow(1.00); P.arrow.position.set(P.x,1.10,P.z); scene.add(P.arrow); }
        beatArrow(P.arrow, 1.10, now, i);
      }""")

sub("dropcard-def",
"""function makeReady(P){""",
"""// The card belongs to the crop. When the crop goes, it goes.
function dropCard(P){
  if(P.card){ scene.remove(P.card); P.card=null; }
  if(P.crop) P.crop.visible=true;
}
function makeReady(P){""")

n = s.count("P.crop=null;")
assert n >= 3, "P.crop=null; found %d" % n
s = s.replace("P.crop=null;", "P.crop=null; dropCard(P);")
print("ok dropcard-calls", n)

# --------------------------------------------------- 5. produce on the grass
sub("produce-card",
"""  var m=hbMesh(hbBake(r.parts(A.kind==="cow"?0.95:0.80)));
  var g=new THREE.Group(); g.add(m);""",
"""  var g=new THREE.Group();
  // FM17 — an egg sitting in the grass is the same picture as the egg on the
  // order card, on the same card, in the GIVE colours.
  var pc=itemCard(A.gives, 0.58, {give:1});
  pc.position.y=0.86; g.add(pc); g.userData.card=pc;""")

sub("produce-arrow",
"""  A.arrow=giveArrow(0.90); A.arrow.position.set(px,1.05,pz); scene.add(A.arrow);""",
"""  if(!g.userData.card){ A.arrow=giveArrow(0.90); A.arrow.position.set(px,1.05,pz); scene.add(A.arrow); }""")

sub("produce-face",
"""      A.produce.position.y=0.10+0.04+Math.max(0,Math.sin(now*4.2+i))*0.17;
      A.produce.rotation.y+=dt*1.1;""",
"""      A.produce.position.y=0.10+0.04+Math.max(0,Math.sin(now*4.2+i))*0.17;
      if(A.produce.userData.card){ A.produce.rotation.y=0; faceCard(A.produce.userData.card); }
      else A.produce.rotation.y+=dt*1.1;""")


# ------------------------------------------- 7. a frame you can actually see
sub("frame-band",
"""  g.add(roundPanel(w*0.855, h*0.855, rr*0.86, pal.frame, 0.99, -0.688));
  g.add(roundPanel(w*0.795, h*0.795, rr*0.80, pal.fill, 0.99, -0.682));""",
"""  // FM17 — the band between the frame and the slot was three per cent of the
  // card's width. On an order card eighty pixels wide that is two pixels, and
  // in the world, at the distance this camera stands back, it is nothing at
  // all: both cards came out plain cream and the sand-or-gold difference the
  // whole design rests on was invisible. The band is now wide enough to see.
  g.add(roundPanel(w*0.900, h*0.900, rr*0.90, pal.frame, 0.99, -0.688));
  g.add(roundPanel(w*0.770, h*0.770, rr*0.78, pal.fill, 0.99, -0.682));""")

# --------------------------------------- 8. the ring that tipped out the soil
# FM12 laid this ring flat and then spun the same mesh on Y. With the ring
# baked in the XY plane, a Y turn tips it up out of the ground before the X
# turn lays it down, so from this camera it draws a long orange splinter
# across the bed. A ring is a circle: spinning it shows nothing anyway.
sub("halo-spin",
"""      P.halo.rotation.y += dt*0.7;
      P.halo.material.opacity = 0.50 + 0.24*Math.abs(Math.sin(now*3+i));""",
"""      P.halo.material.opacity = 0.50 + 0.24*Math.abs(Math.sin(now*3+i));""")

# ----------------------------------------------- 9. room between the pictures
# A framed card is mostly frame; a picture is mostly picture, so the tower
# needs a little more air between items or the corn on top sits on the corn
# below and the whole stack reads as one smear.
sub("stack-gap", "var STACK_ITEM_H = 0.42;", "var STACK_ITEM_H = 0.52;")


# ------------------------------- 10. the crash that was eating the feeding
# askRing() returns a GROUP of two discs. The animal loop set .material.opacity
# on the group itself, which is undefined, so it threw on the first frame a
# hungry animal was near her — and everything after that line in the loop, the
# FEEDING above all, never ran at all. It has been throwing since FM14.
sub("askring-mats",
"""  pool.rotation.x=-Math.PI/2; pool.position.y=-0.002; g.add(pool);
  return g;
}""",
"""  pool.rotation.x=-Math.PI/2; pool.position.y=-0.002; g.add(pool);
  g.userData.band=band.material; g.userData.pool=pool.material;
  return g;
}""")

sub("askring-pulse",
"""        A.askRing.material.opacity=0.16+0.30*Math.abs(Math.sin(now*2.1));""",
"""        var ao=Math.abs(Math.sin(now*2.1));
        A.askRing.userData.band.opacity=0.55+0.30*ao;
        A.askRing.userData.pool.opacity=0.16+0.22*ao;""")

# ------------------------------------------------------------- 6. the version
sub("version", 'version: "fm16"', 'version: "fm17c"')

io.open(OUT,'w',encoding='utf-8').write(s)
print("wrote", OUT, len(s))
