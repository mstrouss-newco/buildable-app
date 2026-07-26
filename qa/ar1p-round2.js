// ============================================================================
//  AR1P round 2 — Mike's notes on the first look:
//    "airplane 2, but with no floats, people will think they can land with
//     those in the water"        -> planeB2
//    "the new shiny coins"       -> coinB stands, nothing to do
//    "the animals are block like and dont work. need more options"
//                                -> pets2, hand-built and ROUND
//    "world life also is kinda lame, but acceptable"
//                                -> life2, two stronger wins on top
// ============================================================================

// ---------------------------------------------------------- PART 1: PLANE B2
// The seaplane he picked, on WHEELS. Floats say "land me on the water", and
// nothing in this game lets you do that — a kid would try it once and be told
// no. Everything above the undercarriage is plane B untouched: the same turned
// body, the same high wing, the same cabin ahead of the leading edge.
function AR1P_planeB2(){
  var pilot=null;
  var body=AR1P_body([[0.02,-4.9],[0.32,-4.5],[0.66,-3.85],[1.02,-2.8],[1.30,-1.4],
                      [1.46,0.2],[1.46,1.5],[1.34,2.7],[1.12,3.6],[0.84,4.2],
                      [0.58,4.55],[0.32,4.74],[0.02,4.82]],14,M.rideBody);
  plane.add(body);
  var cowl=AR1P_body([[0.58,3.4],[1.22,3.45],[1.28,4.05],[1.10,4.45],
                      [0.78,4.68],[0.38,4.82],[0.02,4.88]],14,M.rideTrim);
  plane.add(cowl);
  var span=ride.wingSpan;
  var wing=AR1P_wing(span,3.0,1.9,0.44,0.26,0.55,0.35,M.rideWing);
  wing.position.set(0,1.72,0.45); plane.add(wing);
  [-1,1].forEach(function(sx){
    var strut=new THREE.Mesh(new THREE.BoxGeometry(0.16,1.5,0.7),M.rideTrim);
    strut.position.set(sx*1.55,1.05,0.45); strut.rotation.z=sx*0.18; plane.add(strut);
  });
  var ailL=new THREE.Group(), ailR=new THREE.Group();
  [[-1,ailL],[1,ailR]].forEach(function(p){
    var g=p[1]; g.position.set(p[0]*span*0.31,1.72+0.20,0.45-0.55-0.60);
    var s=new THREE.Mesh(new THREE.BoxGeometry(span*0.20,0.11,0.60),M.rideWing);
    s.position.z=-0.30; g.add(s); plane.add(g);
  });
  var tail=AR1P_wing(5.0,1.55,1.0,0.26,0.16,0.42,0.20,M.rideWing);
  tail.position.set(0,0.55,-3.85); plane.add(tail);
  var elev=new THREE.Group(); elev.position.set(0,0.55,-4.45);
  var eS=new THREE.Mesh(new THREE.BoxGeometry(5.0,0.10,0.5),M.rideWing);
  eS.position.z=-0.25; elev.add(eS); plane.add(elev);
  var finG=AR1P_loft([
    {x:0,   pts:AR1P_rib(2.6,0.34)},{x:0.6, pts:AR1P_rib(2.25,0.30),dz:-0.32},
    {x:1.4, pts:AR1P_rib(1.7,0.24),dz:-0.78},{x:2.05,pts:AR1P_rib(1.1,0.17),dz:-1.16},
    {x:2.45,pts:AR1P_rib(0.5,0.11),dz:-1.40}
  ]);
  finG.rotateZ(Math.PI/2);
  var fin=new THREE.Mesh(finG,M.rideBody); fin.position.set(0,0.70,-3.95); plane.add(fin);
  var rud=new THREE.Group(); rud.position.set(0,1.6,-4.6);
  var rS=new THREE.Mesh(new THREE.BoxGeometry(0.12,1.8,0.55),M.rideBody);
  rS.position.z=-0.27; rud.add(rS); plane.add(rud);
  var canopy=AR1P_body([[0.02,-1.0],[0.64,-0.7],[0.92,0.2],[0.94,1.0],[0.72,1.7],[0.30,2.1],[0.02,2.2]],
    12,new THREE.MeshPhongMaterial({color:ride.glass,shininess:120,transparent:true,opacity:0.55}));
  canopy.position.set(0,1.00,1.75); canopy.scale.set(1.12,1.05,1); plane.add(canopy);
  if(!AR1P_HAS("nopilot")){ pilot=AR1P_pilot(0.96,2.05,0.92); plane.add(pilot); }
  // THE UNDERCARRIAGE. Wheels, hanging off short faired legs from the belly, and
  // a little tail wheel. Spats in the WING colour, because a spat in the body
  // colour reads as a lump falling off the plane (that was the first render).
  [[-1.62,-1.75,1.20],[1.62,-1.75,1.20]].forEach(function(p){
    var leg=new THREE.Mesh(new THREE.CylinderGeometry(0.17,0.21,1.55,8),M.rideTrim);
    leg.position.set(p[0]*0.78,p[1]+1.05,p[2]); leg.rotation.z=p[0]>0?-0.30:0.30; plane.add(leg);
    var spat=AR1P_body([[0.02,-1.15],[0.34,-0.85],[0.50,-0.1],[0.48,0.65],[0.30,1.05],[0.02,1.25]],
      10,M.rideWing);
    spat.position.set(p[0],p[1]+0.16,p[2]); spat.scale.set(0.82,0.92,1.1); plane.add(spat);
    var wg=new THREE.CylinderGeometry(0.52,0.52,0.36,12); wg.rotateZ(Math.PI/2);
    var w=new THREE.Mesh(wg,M.gray); w.position.set(p[0],p[1]-0.34,p[2]); plane.add(w);
  });
  var tw=new THREE.CylinderGeometry(0.28,0.28,0.22,10); tw.rotateZ(Math.PI/2);
  var tWheel=new THREE.Mesh(tw,M.gray); tWheel.position.set(0,-0.72,-3.60); plane.add(tWheel);
  var tLeg=new THREE.Mesh(new THREE.CylinderGeometry(0.11,0.13,0.7,7),M.rideTrim);
  tLeg.position.set(0,-0.35,-3.60); plane.add(tLeg);
  return AR1P_common(4.82,2.55,{ailL:ailL,ailR:ailR,rud:rud,elev:elev,pilot:pilot});
}

// ---------------------------------------------- PART 2: ROUND, HAND-BUILT PETS
// Cube Pets are cubes on purpose and Mike is right that they do not belong in
// this world — everything else here is turned and rounded. Kenney ships no other
// animal set in his bundle (checked all 52 kits), so these are built the same
// way the plane is: lathes and lofts.
//
// THE TRICK THAT KEEPS THEM CHEAP: every animal is BAKED into one geometry with
// its colours painted into the vertices, and every animal shares ONE material.
// So a whole zoo is one draw call each, exactly like the merged Cube Pets, and
// there is not a texture or a download anywhere in it.
var PET_MAT2=null;
function AR1P_paint(geo,hex,tf){
  if(tf){
    if(tf.s) geo.scale(tf.s[0],tf.s[1],tf.s[2]);
    if(tf.r){ if(tf.r[0])geo.rotateX(tf.r[0]); if(tf.r[1])geo.rotateY(tf.r[1]); if(tf.r[2])geo.rotateZ(tf.r[2]); }
    if(tf.p) geo.translate(tf.p[0],tf.p[1],tf.p[2]);
  }
  var c=new THREE.Color(hex), n=geo.attributes.position.count, col=new Float32Array(n*3);
  for(var i=0;i<n;i++){ col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b; }
  geo.setAttribute("color",new THREE.Float32BufferAttribute(col,3));
  return geo;
}
function AR1P_bake(parts){
  var pos=[],nor=[],col=[],idx=[],base=0,i,k;
  for(k=0;k<parts.length;k++){
    var g=parts[k]; if(!g||!g.attributes.position) continue;
    if(!g.attributes.normal) g.computeVertexNormals();
    var pa=g.attributes.position, na=g.attributes.normal, ca=g.attributes.color;
    for(i=0;i<pa.count;i++){
      pos.push(pa.getX(i),pa.getY(i),pa.getZ(i));
      nor.push(na.getX(i),na.getY(i),na.getZ(i));
      col.push(ca.getX(i),ca.getY(i),ca.getZ(i));
    }
    if(g.index){ for(i=0;i<g.index.count;i++) idx.push(g.index.getX(i)+base); }
    else { for(i=0;i<pa.count;i++) idx.push(i+base); }
    base+=pa.count; g.dispose&&g.dispose();
  }
  var out=new THREE.BufferGeometry();
  out.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
  out.setAttribute("normal",new THREE.Float32BufferAttribute(nor,3));
  out.setAttribute("color",new THREE.Float32BufferAttribute(col,3));
  out.setIndex(idx);
  return out;
}
// shorthands: a ball, a tube, a cone, and a lathed body of revolution
function AR1P_ball(r,c,tf,sg){ return AR1P_paint(new THREE.SphereGeometry(r,sg||10,(sg||10)-2),c,tf); }
function AR1P_tube(r1,r2,h,c,tf,sg){ return AR1P_paint(new THREE.CylinderGeometry(r1,r2,h,sg||8),c,tf); }
function AR1P_cone(r,h,c,tf,sg){ return AR1P_paint(new THREE.ConeGeometry(r,h,sg||8),c,tf); }
function AR1P_turn(profile,c,tf,sg){
  var pts=profile.map(function(p){ return new THREE.Vector2(Math.max(0.001,p[0]),p[1]); });
  return AR1P_paint(new THREE.LatheGeometry(pts,sg||12),c,tf);
}
// a flat blade — a fin, a wing, a leaf, a flipper. Lofted so it tapers.
function AR1P_blade(len,w1,w2,th,c,tf){
  return AR1P_paint(AR1P_loft([
    {x:0,      pts:AR1P_rib(w1,th)},
    {x:len*0.5,pts:AR1P_rib((w1+w2)/2,th*0.8)},
    {x:len,    pts:AR1P_rib(w2,th*0.5)}
  ]),c,tf);
}
var EYE=0x1E1E24, WHITE=0xFFF8EC;

// ---- the six. Every one is sized in its OWN units and normalised on the way
//      out, so the numbers below are shape, not scale.
var PETS2_BUILD={
  // A CRAB: a wide flat dome, two claws held up, six legs, two stalk eyes.
  // This one read right first time; it is the shape the others are measured against.
  crab:function(){
    var p=[], i, C=0xE8543A, D=0xC03A25;
    p.push(AR1P_turn([[1.0,0.02],[0.95,0.26],[0.78,0.48],[0.42,0.60],[0,0.62]],C,null,16));
    p.push(AR1P_turn([[0.98,0.0],[0,0.02]],D,null,16));
    for(i=0;i<3;i++){
      var a=0.45+i*0.42;
      [-1,1].forEach(function(sx){
        p.push(AR1P_tube(0.09,0.07,0.62,D,{r:[0,0,sx*0.9],p:[sx*Math.sin(a)*1.02,0.20,Math.cos(a)*0.55]}));
        p.push(AR1P_tube(0.07,0.05,0.42,D,{r:[0,0,sx*0.2],p:[sx*(Math.sin(a)*1.02+0.24),-0.05,Math.cos(a)*0.55]}));
      });
    }
    [-1,1].forEach(function(sx){
      p.push(AR1P_tube(0.11,0.09,0.55,D,{r:[0.5,0,sx*0.7],p:[sx*0.86,0.42,0.62]}));
      p.push(AR1P_ball(0.30,C,{s:[1,0.72,1.5],p:[sx*1.16,0.62,0.98]}));
      p.push(AR1P_cone(0.16,0.34,C,{r:[1.2,0,0],p:[sx*1.16,0.70,1.34]}));
      p.push(AR1P_tube(0.05,0.05,0.42,D,{p:[sx*0.34,0.86,0.30]}));
      p.push(AR1P_ball(0.14,WHITE,{p:[sx*0.34,1.10,0.30]},8));
      p.push(AR1P_ball(0.08,EYE,{p:[sx*0.34,1.12,0.42]},6));
    });
    return AR1P_bake(p);
  },
  // A PARROT. The first build was a red egg with eyes: the wings were slivers and
  // the tail was a thread. A parrot is mostly WING and TAIL, so both are now
  // bigger than the body, and the crest and hooked beak carry the rest.
  parrot:function(){
    var p=[], C=0xE23B36, W=0x2E7FD0, G=0x2FA46B, Y=0xF5C542, DK=0xB02A26;
    p.push(AR1P_turn([[0,-0.80],[0.26,-0.66],[0.44,-0.24],[0.50,0.18],[0.44,0.54],[0.26,0.76],[0,0.84]],C,null,14));
    p.push(AR1P_ball(0.32,C,{p:[0,0.90,0.02]},12));
    p.push(AR1P_ball(0.20,WHITE,{s:[1,1,0.55],p:[0.21,0.98,0.15]},8));
    p.push(AR1P_ball(0.20,WHITE,{s:[1,1,0.55],p:[-0.21,0.98,0.15]},8));
    p.push(AR1P_ball(0.10,EYE,{p:[0.23,0.99,0.24]},6));
    p.push(AR1P_ball(0.10,EYE,{p:[-0.23,0.99,0.24]},6));
    // a HOOKED beak, which is the one silhouette that says parrot and not budgie
    p.push(AR1P_turn([[0,-0.30],[0.19,-0.10],[0.20,0.06],[0,0.14]],Y,{r:[1.57,0,0],p:[0,0.86,0.34]},10));
    p.push(AR1P_cone(0.13,0.30,Y,{r:[2.5,0,0],p:[0,0.70,0.36]},8));
    // a crest: three little blades off the back of the head
    [-0.26,0,0.26].forEach(function(a){
      p.push(AR1P_blade(0.42,0.20,0.09,0.06,Y,{r:[0,0,1.57],p:[Math.sin(a)*0.16,1.12,-0.10-Math.cos(a)*0.04]}));
    });
    // WINGS, folded along the flank and reaching most of the way down the body
    [-1,1].forEach(function(sx){
      p.push(AR1P_blade(1.02,0.70,0.26,0.16,W,{r:[0,sx>0?0:3.1416,sx*-0.95],p:[sx*0.34,0.50,-0.04]}));
      p.push(AR1P_blade(0.50,0.36,0.16,0.10,G,{r:[0,sx>0?0:3.1416,sx*-0.95],p:[sx*0.38,0.54,0.10]}));
    });
    // a long forked tail, the counterweight that makes the whole bird read
    p.push(AR1P_blade(1.55,0.46,0.30,0.10,Y,{r:[0,1.57,0.34],p:[0.10,-0.60,-0.26]}));
    p.push(AR1P_blade(1.40,0.40,0.24,0.09,DK,{r:[0,1.57,0.24],p:[-0.10,-0.66,-0.22]}));
    p.push(AR1P_tube(0.07,0.05,0.28,Y,{p:[0.15,-0.90,0.06]}));
    p.push(AR1P_tube(0.07,0.05,0.28,Y,{p:[-0.15,-0.90,0.06]}));
    return AR1P_bake(p);
  },
  // A MONKEY. The first build came out a TEDDY BEAR — round ears too small and
  // no tail. Three things make it a monkey instead: a big pale face ring, ears
  // stuck out flat on the SIDES of the head, and a long curled tail.
  monkey:function(){
    var p=[], B=0x8A5A34, L=0xDBAA70, DK=0x6B4326;
    p.push(AR1P_turn([[0,-0.62],[0.34,-0.50],[0.46,-0.12],[0.44,0.26],[0.30,0.50],[0,0.58]],B,null,12));
    p.push(AR1P_ball(0.30,L,{s:[1,1.05,0.5],p:[0,-0.10,0.34]},10));
    p.push(AR1P_ball(0.46,B,{p:[0,0.94,0.02]},12));
    p.push(AR1P_ball(0.36,L,{s:[1,0.92,0.42],p:[0,0.90,0.30]},12));   // the pale face
    p.push(AR1P_ball(0.19,L,{s:[1,0.72,0.6],p:[0,0.74,0.40]},10));    // muzzle
    p.push(AR1P_ball(0.06,EYE,{s:[1,1.3,1],p:[0.07,0.74,0.52]},6));
    p.push(AR1P_ball(0.06,EYE,{s:[1,1.3,1],p:[-0.07,0.74,0.52]},6));
    p.push(AR1P_ball(0.085,EYE,{p:[0.155,0.99,0.44]},6));
    p.push(AR1P_ball(0.085,EYE,{p:[-0.155,0.99,0.44]},6));
    [-1,1].forEach(function(sx){
      // EARS: flat discs on the sides, sticking out. This is the whole difference.
      p.push(AR1P_ball(0.26,L,{s:[0.26,1,1],p:[sx*0.50,0.96,0.02]},10));
      p.push(AR1P_ball(0.17,B,{s:[0.22,1,1],p:[sx*0.545,0.96,0.02]},10));
      // long arms hanging forward, the way a monkey stands
      p.push(AR1P_tube(0.125,0.105,0.82,B,{r:[0.25,0,sx*0.30],p:[sx*0.46,0.02,0.10]}));
      p.push(AR1P_ball(0.145,L,{s:[1,1.25,0.8],p:[sx*0.60,-0.44,0.22]},8));
      p.push(AR1P_tube(0.155,0.125,0.52,B,{r:[0,0,sx*0.20],p:[sx*0.24,-0.68,0.02]}));
      p.push(AR1P_ball(0.17,L,{s:[1,0.62,1.5],p:[sx*0.28,-0.90,0.14]},8));
    });
    // THE TAIL, up and curled over. A monkey without one is a small bear.
    p.push(AR1P_paint(new THREE.TorusGeometry(0.46,0.075,6,18,4.8),B,{r:[0,1.5708,-0.5],p:[0,-0.10,-0.62]}));
    p.push(AR1P_ball(0.085,DK,{p:[0,0.34,-0.92]},8));
    return AR1P_bake(p);
  },
  // A FISH. The first build had brown slabs for fins. Fins are now a lighter tint
  // of the body, tucked against it, with a proper forked tail.
  fish:function(){
    var p=[], C=0xF2922E, S=0xFFDCA8, F=0xFFB65E;
    p.push(AR1P_turn([[0,-1.00],[0.15,-0.84],[0.33,-0.42],[0.40,0.04],[0.33,0.48],[0.19,0.78],[0,0.92]],C,{r:[1.57,0,0]},14));
    p.push(AR1P_turn([[0,-0.90],[0.20,-0.45],[0.24,0.05],[0.17,0.55],[0,0.84]],S,{r:[1.57,0,0],s:[0.55,1,1],p:[0,-0.15,0]},12));
    p.push(AR1P_ball(0.14,WHITE,{s:[1,1,0.65],p:[0.20,0.16,0.56]},8));
    p.push(AR1P_ball(0.14,WHITE,{s:[1,1,0.65],p:[-0.20,0.16,0.56]},8));
    p.push(AR1P_ball(0.075,EYE,{p:[0.22,0.16,0.64]},6));
    p.push(AR1P_ball(0.075,EYE,{p:[-0.22,0.16,0.64]},6));
    // a FORKED tail: two blades splaying off the tail root, not one paddle
    [1,-1].forEach(function(sy){
      p.push(AR1P_blade(0.62,0.34,0.56,0.07,F,{r:[0,0,1.5708+sy*0.42],p:[0,sy*0.10,-1.02]}));
    });
    p.push(AR1P_blade(0.40,0.60,0.26,0.07,F,{r:[0,0,1.5708],p:[0,0.36,-0.16]}));   // dorsal
    p.push(AR1P_blade(0.30,0.34,0.16,0.06,F,{r:[0,0,1.5708],p:[0,-0.34,-0.24]}));  // belly fin
    [-1,1].forEach(function(sx){
      p.push(AR1P_blade(0.34,0.34,0.16,0.06,F,{r:[0.9,0,0],p:[sx*0.30,-0.04,0.14],s:[sx,1,1]}));
    });
    return AR1P_bake(p);
  },
  // A TURTLE. The first build was a green RING: a torus rim round a dome so
  // shallow it disappeared. The rim is gone and the shell is properly domed.
  turtle:function(){
    var p=[], SH=0x4C9A57, DK=0x35713F, SK=0xCBBA80, i, a;
    p.push(AR1P_turn([[1.02,0.06],[0.99,0.30],[0.88,0.58],[0.66,0.84],[0.36,1.00],[0,1.06]],SH,null,18));
    p.push(AR1P_turn([[1.00,0.02],[0,0.06]],SK,null,18));
    // plates pressed INTO the dome, following its curve, so they read as pattern
    for(i=0;i<7;i++){ a=i/7*6.283;
      p.push(AR1P_ball(0.24,DK,{s:[1,0.30,1],r:[0,0,0],p:[Math.cos(a)*0.58,0.80,Math.sin(a)*0.58]},8)); }
    p.push(AR1P_ball(0.28,DK,{s:[1,0.28,1],p:[0,1.06,0]},10));
    p.push(AR1P_ball(0.30,SK,{s:[1,0.90,1.20],p:[0,0.30,1.02]},10));
    p.push(AR1P_ball(0.16,SK,{s:[1,0.75,1],p:[0,0.34,1.28]},8));
    p.push(AR1P_ball(0.065,EYE,{p:[0.15,0.42,1.24]},6));
    p.push(AR1P_ball(0.065,EYE,{p:[-0.15,0.42,1.24]},6));
    [[0.80,0.66,0.75],[-0.80,0.66,-0.75],[0.80,-0.66,0.55],[-0.80,-0.66,-0.55]].forEach(function(f){
      p.push(AR1P_ball(0.34,SK,{s:[1.45,0.30,0.72],r:[0,f[3],0],p:[f[0],0.16,f[1]]},8));
    });
    p.push(AR1P_ball(0.13,SK,{s:[1,0.5,1.7],p:[0,0.20,-1.02]},8));
    return AR1P_bake(p);
  },
  // A BUTTERFLY. The first build lay flat and read as a fallen leaf. Wings held
  // up in a V is the pose that says butterfly even as a speck.
  butterfly:function(){
    var p=[], A=0xF2A73B, B2=0xE2571F, SP=0xFFF0C4, BD=0x3A2A22;
    [-1,1].forEach(function(sx){
      p.push(AR1P_ball(0.46,A,{s:[1.30,0.075,0.95],r:[0,0,sx*0.72],p:[sx*0.40,0.34,0.16]},10));
      p.push(AR1P_ball(0.30,B2,{s:[1.05,0.075,0.78],r:[0,0,sx*0.62],p:[sx*0.30,0.10,-0.30]},10));
      p.push(AR1P_ball(0.11,SP,{s:[1,0.30,1],r:[0,0,sx*0.72],p:[sx*0.54,0.48,0.24]},8));
      p.push(AR1P_ball(0.08,SP,{s:[1,0.30,1],r:[0,0,sx*0.72],p:[sx*0.34,0.32,0.02]},8));
    });
    p.push(AR1P_turn([[0,-0.42],[0.085,-0.20],[0.10,0.16],[0.07,0.36],[0,0.44]],BD,{r:[1.57,0,0],p:[0,0.06,0]},8));
    p.push(AR1P_ball(0.115,BD,{p:[0,0.06,0.42]},8));
    p.push(AR1P_tube(0.02,0.014,0.30,BD,{r:[0.6,0,0.35],p:[0.09,0.20,0.54]},5));
    p.push(AR1P_tube(0.02,0.014,0.30,BD,{r:[0.6,0,-0.35],p:[-0.09,0.20,0.54]},5));
    return AR1P_bake(p);
  }
};
var PETS2={};
function AR1P_buildPets2(){
  if(!PET_MAT2) PET_MAT2=new THREE.MeshPhongMaterial({vertexColors:true,shininess:22,specular:0x222222});
  for(var k in PETS2_BUILD){
    var geo=PETS2_BUILD[k]();
    geo.computeBoundingBox();
    var bb=geo.boundingBox, h=Math.max(0.001,bb.max.y-bb.min.y);
    geo.translate(-(bb.min.x+bb.max.x)/2, -bb.min.y, -(bb.min.z+bb.max.z)/2);
    var m=new THREE.Mesh(geo,PET_MAT2);
    var wrap=new THREE.Group(); wrap.add(m); wrap.userData.h=h;
    PETS2[k]=wrap;
  }
  PET_ON=true;
}
function AR1P_pet2(name){
  var proto=PETS2[name]; if(!proto) return null;
  var c=proto.clone(true);
  c.scale.setScalar(PET_SIZE2[name]/proto.userData.h);
  return c;
}
var PET_SIZE2={crab:1.5,parrot:1.9,monkey:2.9,fish:1.9,turtle:1.7,butterfly:1.0};

// -------------------------------------------------- PART 3: TWO STRONGER WINS
// He said the world life is acceptable but lame. These are the two biggest
// things still missing from the SEA, which is most of what is on screen, and
// they are one mesh each.

// CLOUD SHADOWS. The water is one flat colour from above and that is what makes
// it read as a bedsheet. Soft dark patches drifting across it give the sea a sky
// above it. One merged mesh, one draw call for every shadow in the world.
var SHADOWS=null, SHAD_ST=[], SHAD_N=16;
function AR1P_buildShadows(){
  var pos=[],uv=[],idx=[],i,j,SEG=10;
  for(i=0;i<SHAD_N;i++){
    var b=i*(SEG+1);
    pos.push(0,0,0); uv.push(0.5,0.5);
    for(j=0;j<SEG;j++){ pos.push(0,0,0); uv.push(0,0); }
    for(j=0;j<SEG;j++) idx.push(b, b+1+j, b+1+(j+1)%SEG);
    SHAD_ST.push({x:(Math.random()-0.5)*420,z:(Math.random()-0.5)*420,
      r:26+Math.random()*40, sq:0.55+Math.random()*0.5, ph:Math.random()*6.283});
  }
  var g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx);
  SHADOWS=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:0x0C3A63,map:AR1P_SHADTEX,
    transparent:true,opacity:0.42,depthWrite:false,side:THREE.DoubleSide,
    blending:THREE.NormalBlending}));
  SHADOWS.renderOrder=2; SHADOWS.frustumCulled=false; scene.add(SHADOWS);
}
function AR1P_stepShadows(dt,t){
  if(!SHADOWS) return;
  var pa=SHADOWS.geometry.attributes.position, ua=SHADOWS.geometry.attributes.uv;
  var SEG=10, i, j, px=camera.position.x, pz=camera.position.z;
  for(i=0;i<SHAD_N;i++){
    var S2=SHAD_ST[i];
    S2.x+=dt*3.2; S2.z+=dt*1.1;                     // drift with the clouds
    if(S2.x-px> 260) S2.x-=520; if(px-S2.x> 260) S2.x+=520;
    if(S2.z-pz> 260) S2.z-=520; if(pz-S2.z> 260) S2.z+=520;
    var b=i*(SEG+1);
    // the patch sits just above the sea; the island shelves start at -7 so it
    // never fights with land, and depthWrite is off so it never fights itself
    pa.setXYZ(b,S2.x,0.74,S2.z); ua.setXY(b,0.5,0.5);
    for(j=0;j<SEG;j++){
      var a=j/SEG*6.283, rr=S2.r*(0.82+Math.sin(a*3+S2.ph)*0.18);
      pa.setXYZ(b+1+j, S2.x+Math.cos(a)*rr, 0.74, S2.z+Math.sin(a)*rr*S2.sq);
      ua.setXY(b+1+j, 0.5+Math.cos(a)*0.5, 0.5+Math.sin(a)*0.5);
    }
  }
  pa.needsUpdate=true; ua.needsUpdate=true;
}
// WAKES. A boat that travels and leaves no mark on the water is still a sticker,
// just a moving one. A white V that fades out behind it is the thing that says
// the hull is IN the water. One mesh for every boat in the world.
var WAKES=null;
function AR1P_buildWakes(){
  var pos=[],uv=[],idx=[],i;
  for(i=0;i<64;i++){
    var b=i*4;
    pos.push(0,0,0, 0,0,0, 0,0,0, 0,0,0);
    uv.push(0,0, 1,0, 0,1, 1,1);
    idx.push(b,b+2,b+1, b+1,b+2,b+3);
  }
  var g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx);
  WAKES=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:0xFFFFFF,map:AR1P_WAKETEX,
    transparent:true,opacity:0.85,depthWrite:false,side:THREE.DoubleSide}));
  WAKES.renderOrder=4; WAKES.frustumCulled=false; scene.add(WAKES);
}
function AR1P_stepWakes(){
  if(!WAKES) return;
  var pa=WAKES.geometry.attributes.position, v=new THREE.Vector3(), i, n=Math.min(64,TRAVEL.length);
  for(i=0;i<64;i++){
    var b=i*4;
    if(i>=n){ pa.setXYZ(b,0,-9999,0);pa.setXYZ(b+1,0,-9999,0);pa.setXYZ(b+2,0,-9999,0);pa.setXYZ(b+3,0,-9999,0); continue; }
    var T=TRAVEL[i]; T.o.getWorldPosition(v);
    // the direction it is actually travelling, from its own orbit
    var hx=-Math.sin(T.a)*(T.sp>0?1:-1), hz=Math.cos(T.a)*(T.sp>0?1:-1);
    var L=Math.hypot(hx,hz)||1; hx/=L; hz/=L;
    var sx=-hz, sz=hx, LEN=26, W0=1.2, W1=9.0, y=0.72;
    pa.setXYZ(b,   v.x+sx*W0,        y, v.z+sz*W0);
    pa.setXYZ(b+1, v.x-sx*W0,        y, v.z-sz*W0);
    pa.setXYZ(b+2, v.x-hx*LEN+sx*W1, y, v.z-hz*LEN+sz*W1);
    pa.setXYZ(b+3, v.x-hx*LEN-sx*W1, y, v.z-hz*LEN-sz*W1);
  }
  pa.needsUpdate=true;
}
