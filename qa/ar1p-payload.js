// ============================================================================
//  AR1P — POLISH PASS MOCK PAYLOAD.  Injected into a COPY of the engine only.
//  public/skyflyer-engine.html is never touched by this session.
//
//  ?ar1p=  a comma list of flags:
//    planeA | planeB | planeC   the three plane shapes
//    nopilot                    drop the pilot (to price him)
//    coinA | coinB              ring  |  brighter hand-turned coin + glow
//    pets | petsAnim            animals, merged-static  |  real GLB clips
//    life                       gulls, smoke, surf, sway, flags, boats
// ============================================================================

// ---------------------------------------------------------------- PART 1: PLANE
// A loft: a run of cross sections along X, skinned. This is what makes a real
// wing possible — a BoxGeometry cannot taper, sweep or thin out at the tip, and
// that flat slab is most of what reads as "boxy" from the chase camera.
function AR1P_loft(sections){
  var pos=[],idx=[],n=sections[0].pts.length,i,j;
  for(i=0;i<sections.length;i++){
    var s=sections[i];
    for(j=0;j<n;j++) pos.push(s.x, s.pts[j][1]+(s.dy||0), s.pts[j][0]+(s.dz||0));
  }
  for(i=0;i<sections.length-1;i++){
    for(j=0;j<n;j++){
      var a=i*n+j, b=i*n+(j+1)%n, c=(i+1)*n+j, d=(i+1)*n+(j+1)%n;
      idx.push(a,c,b, b,c,d);
    }
  }
  // caps: a fan off the first point of each end ring
  for(j=1;j<n-1;j++) idx.push(0, j+1, j);
  var base=(sections.length-1)*n;
  for(j=1;j<n-1;j++) idx.push(base, base+j, base+j+1);
  var g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// One aerofoil rib: chord c, thickness t, in the (z,y) plane. Nose at +z.
function AR1P_rib(c,t){
  return [[ 0.40*c, 0      ],[ 0.30*c, 0.46*t],[ 0.08*c, 0.50*t],
          [-0.22*c, 0.34*t ],[-0.60*c, 0.05*t],[-0.60*c,-0.04*t],
          [-0.22*c,-0.19*t ],[ 0.08*c,-0.30*t],[ 0.30*c,-0.26*t]];
}
// A wing: span, root chord, tip chord, sweep back at the tip, dihedral.
function AR1P_wing(span,cr,ct,tr,tt,sweep,dih,mat){
  var S=[],N=5,i;
  for(i=0;i<N;i++){
    var f=i/(N-1), x=(-0.5+f)*span, af=Math.abs(x)/(span/2);
    var c=cr+(ct-cr)*af, t=tr+(tt-tr)*af;
    S.push({x:x, pts:AR1P_rib(c,t), dz:-sweep*af, dy:dih*af});
  }
  return new THREE.Mesh(AR1P_loft(S),mat);
}
// A turned fuselage. profile = [[radius, z], ...] from tail to nose.
function AR1P_body(profile,segs,mat){
  var pts=profile.map(function(p){ return new THREE.Vector2(Math.max(0.001,p[0]),p[1]); });
  var g=new THREE.LatheGeometry(pts,segs||12);
  g.rotateX(Math.PI/2);                       // lathe +y becomes the nose, +z
  return new THREE.Mesh(g,mat);
}
// A kid in the seat. Four primitives and a face on the screen. The chase camera
// looks at the back of this thing for the whole game, so a head in the glass is
// the cheapest character the world will ever get.
function AR1P_pilot(y,z,scale){
  var g=new THREE.Group(); g.position.set(0,y,z); g.scale.setScalar(scale||1);
  var head=new THREE.Mesh(new THREE.SphereGeometry(0.46,10,8),M.rideSkin);
  head.position.y=0.42; g.add(head);
  var cap=new THREE.Mesh(new THREE.SphereGeometry(0.50,10,7),M.rideTrimShiny);
  cap.scale.set(1,0.62,1); cap.position.y=0.60; g.add(cap);
  var gog=new THREE.Mesh(new THREE.BoxGeometry(0.86,0.22,0.20),
    new THREE.MeshPhongMaterial({color:0x2C3E50,shininess:80}));
  gog.position.set(0,0.50,0.40); g.add(gog);
  var torso=new THREE.Mesh(new THREE.CylinderGeometry(0.34,0.42,0.72,8),M.rideTrim);
  torso.position.y=-0.24; g.add(torso);
  var scarf=new THREE.Mesh(new THREE.BoxGeometry(0.62,0.16,1.5),M.rideTrim);
  scarf.position.set(0,0.10,-0.85); g.add(scarf);
  g.userData.scarf=scarf;
  return g;
}
// The bits every option shares: prop, spinner, disc, and the animate function
// that spins it, deflects the ailerons with bank and kicks the rudder with turn.
function AR1P_common(propZ,propR,surf){
  var hub=new THREE.Mesh(new THREE.SphereGeometry(0.42,10,8),M.rideTrimShiny);
  hub.scale.set(1,1,1.9); hub.position.z=propZ+0.30; plane.add(hub);
  var prop=new THREE.Group(); prop.position.z=propZ+0.12; plane.add(prop);
  for(var b=0;b<2;b++){
    var bl=new THREE.Mesh(AR1P_loft([
      {x:-propR,pts:AR1P_rib(0.30,0.07)},{x:-propR*0.35,pts:AR1P_rib(0.62,0.13)},
      {x: propR*0.35,pts:AR1P_rib(0.62,0.13)},{x: propR,pts:AR1P_rib(0.30,0.07)}
    ]),M.gray);
    bl.rotation.z=b*Math.PI/2; prop.add(bl);
  }
  // the blur disc is a HINT that something is spinning, not a bubble stuck on
  // the nose. At 0.22 it read as a pale dome over the whole front of the plane.
  var disc=new THREE.Mesh(new THREE.RingGeometry(propR*0.34,propR*0.98,26),
    new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.13,side:THREE.DoubleSide}));
  disc.position.z=propZ+0.28; plane.add(disc);
  return function(dt,mode,t){
    prop.rotation.z+=dt*(mode==="landed"?2:34);
    disc.material.opacity=(mode==="landed"?0:0.13);
    disc.rotation.z=prop.rotation.z;
    // A model becomes a thing that is FLYING the moment a surface moves with the
    // stick. Ailerons go opposite ways with bank; the rudder follows the turn.
    var bank=(typeof S!=="undefined"&&S.bank)?S.bank:0;
    if(surf){
      if(surf.ailL) surf.ailL.rotation.x= bank*0.9;
      if(surf.ailR) surf.ailR.rotation.x=-bank*0.9;
      if(surf.rud)  surf.rud.rotation.y = -bank*0.55;
      if(surf.elev) surf.elev.rotation.x= ((typeof S!=="undefined"&&S.pitch)?S.pitch:0)*0.5;
      if(surf.pilot&&surf.pilot.userData.scarf)
        surf.pilot.userData.scarf.rotation.y=Math.sin(t*7)*0.22;
    }
  };
}

// ---- A — TURNED AND TAPERED. Same silhouette as today, no boxes anywhere. ----
function AR1P_planeA(){
  var pilot=null;
  var body=AR1P_body([[0.02,-4.9],[0.30,-4.55],[0.62,-3.9],[0.98,-2.9],[1.28,-1.5],
                      [1.44,0.1],[1.46,1.4],[1.36,2.6],[1.14,3.5],[0.86,4.15],
                      [0.62,4.5],[0.34,4.72],[0.02,4.80]],14,M.rideBody);
  plane.add(body);
  // a cowling ring in the trim colour: where the engine ends and the body begins
  var cowl=AR1P_body([[0.60,3.35],[1.24,3.40],[1.30,4.02],[1.12,4.42],
                      [0.80,4.66],[0.40,4.80],[0.02,4.86]],14,M.rideTrim);
  plane.add(cowl);
  // the belly stripe, drawn as a turned band rather than a decal
  var band=AR1P_body([[1.30,-0.4],[1.47,-0.2],[1.47,0.9],[1.30,1.1]],14,M.rideTrim);
  plane.add(band);
  var span=ride.wingSpan;
  var wing=AR1P_wing(span,3.1,1.55,0.42,0.20,1.05,0.75,M.rideWing);
  wing.position.set(0,0.30,0.55); plane.add(wing);
  // WINGLETS. The first render had a fat sphere at each tip and it read as a
  // red lump floating off the end of the wing, not as part of it. A winglet is
  // the wing's own section stood on edge, in the wing's own colour.
  [-1,1].forEach(function(sx){
    var wl=new THREE.Mesh(AR1P_loft([
      {x:0,pts:AR1P_rib(1.5,0.20)},{x:0.5,pts:AR1P_rib(1.15,0.16),dz:-0.24},
      {x:0.9,pts:AR1P_rib(0.7,0.11),dz:-0.44}
    ]),M.rideWing);
    wl.geometry.rotateZ(Math.PI/2);
    wl.position.set(sx*span/2,0.30+0.75,0.55-1.05); plane.add(wl);
  });
  // ailerons: a thin strip hinged on the back of each wing, outboard
  var ailL=new THREE.Group(), ailR=new THREE.Group();
  [[-1,ailL],[1,ailR]].forEach(function(p){
    var g=p[1]; g.position.set(p[0]*span*0.31, 0.30+0.30, 0.55-1.05-0.62);
    var s=new THREE.Mesh(new THREE.BoxGeometry(span*0.20,0.11,0.62),M.rideWing);
    s.position.z=-0.31; g.add(s); plane.add(g);
  });
  var tail=AR1P_wing(5.0,1.55,0.95,0.26,0.16,0.42,0.25,M.rideWing);
  tail.position.set(0,0.16,-3.85); plane.add(tail);
  var elev=new THREE.Group(); elev.position.set(0,0.16,-4.45);
  var elevS=new THREE.Mesh(new THREE.BoxGeometry(5.0,0.10,0.5),M.rideWing);
  elevS.position.z=-0.25; elev.add(elevS); plane.add(elev);
  // the fin, built as a wing and stood on its edge so it has a real curved
  // leading edge and a fillet where it meets the body
  var finG=AR1P_loft([
    {x:0,   pts:AR1P_rib(2.5,0.34)},{x:0.55,pts:AR1P_rib(2.2,0.30),dz:-0.30},
    {x:1.3, pts:AR1P_rib(1.7,0.24),dz:-0.72},{x:1.95,pts:AR1P_rib(1.15,0.17),dz:-1.10},
    {x:2.30,pts:AR1P_rib(0.55,0.11),dz:-1.32}
  ]);
  finG.rotateZ(Math.PI/2);
  var fin=new THREE.Mesh(finG,M.rideBody); fin.position.set(0,0.55,-3.95); plane.add(fin);
  var rud=new THREE.Group(); rud.position.set(0,1.4,-4.55);
  var rudS=new THREE.Mesh(new THREE.BoxGeometry(0.12,1.7,0.55),M.rideBody);
  rudS.position.z=-0.27; rud.add(rudS); plane.add(rud);
  var sill=AR1P_body([[0.02,-1.3],[0.86,-1.0],[1.10,0.1],[1.12,1.1],[0.90,1.9],[0.40,2.4],[0.02,2.5]],
    12,M.rideTrim);
  sill.position.set(0,0.82,0.9); sill.scale.set(1,0.62,1); plane.add(sill);
  if(!AR1P_HAS("nopilot")){ pilot=AR1P_pilot(0.98,1.25,0.92); plane.add(pilot); }
  var canopy=AR1P_body([[0.02,-1.2],[0.80,-0.9],[1.02,0.1],[1.04,1.0],[0.84,1.8],[0.36,2.3],[0.02,2.4]],
    12,new THREE.MeshPhongMaterial({color:ride.glass,shininess:120,transparent:true,opacity:0.45}));
  canopy.position.set(0,1.06,0.9); canopy.scale.set(1,0.98,1); plane.add(canopy);
  // wheel SPATS: a fat teardrop over each wheel instead of a bare cylinder
  [[-1.55,-1.05,1.15],[1.55,-1.05,1.15]].forEach(function(p){
    var spat=AR1P_body([[0.02,-1.35],[0.36,-1.0],[0.52,-0.2],[0.50,0.6],[0.34,1.15],[0.02,1.45]],10,M.rideWing);
    spat.position.set(p[0],p[1]+0.12,p[2]); spat.scale.set(0.85,0.95,1.15); plane.add(spat);
    var leg=new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.20,1.15,7),M.gray);
    leg.position.set(p[0]*0.86,p[1]+0.85,p[2]); leg.rotation.z=p[0]>0?-0.20:0.20; plane.add(leg);
    var wg=new THREE.CylinderGeometry(0.50,0.50,0.34,12); wg.rotateZ(Math.PI/2);
    var w=new THREE.Mesh(wg,M.gray); w.position.set(p[0],p[1]-0.52,p[2]); plane.add(w);
  });
  var tw=new THREE.CylinderGeometry(0.30,0.30,0.22,10); tw.rotateZ(Math.PI/2);
  var tWheel=new THREE.Mesh(tw,M.gray); tWheel.position.set(0,-0.85,-3.55); plane.add(tWheel);
  return AR1P_common(4.80,2.55,{ailL:ailL,ailR:ailR,rud:rud,elev:elev,pilot:pilot});
}

// ---- B — THE SEAPLANE. Same turned body, on floats. Every landing here is
//      next to a dock, and the whole world is sea. ----
function AR1P_planeB(){
  var pilot=null;
  var body=AR1P_body([[0.02,-4.9],[0.32,-4.5],[0.66,-3.85],[1.02,-2.8],[1.30,-1.4],
                      [1.46,0.2],[1.46,1.5],[1.34,2.7],[1.12,3.6],[0.84,4.2],
                      [0.58,4.55],[0.32,4.74],[0.02,4.82]],14,M.rideBody);
  plane.add(body);
  var cowl=AR1P_body([[0.58,3.4],[1.22,3.45],[1.28,4.05],[1.10,4.45],
                      [0.78,4.68],[0.38,4.82],[0.02,4.88]],14,M.rideTrim);
  plane.add(cowl);
  var span=ride.wingSpan;
  // a HIGH wing, the way a real floatplane is built, which also clears the floats
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
  // THE FLOATS. A pontoon is a turned hull with a lifted nose and a step in the
  // middle, which is the shape that reads as "this lands on water".
  [-1,1].forEach(function(sx){
    var f=AR1P_body([[0.02,-3.3],[0.34,-3.0],[0.52,-2.2],[0.60,-0.6],[0.62,0.4],
                     [0.60,1.5],[0.52,2.5],[0.36,3.2],[0.02,3.5]],10,M.rideTrim);
    f.position.set(sx*2.05,-2.55,0.35); f.rotation.x=-0.06; plane.add(f);
    var keel=new THREE.Mesh(new THREE.BoxGeometry(0.14,0.34,5.4),M.gray);
    keel.position.set(sx*2.05,-3.05,0.35); plane.add(keel);
    [[1.6,0.55],[-1.5,0.55]].forEach(function(p){
      var st=new THREE.Mesh(new THREE.CylinderGeometry(0.13,0.15,2.1,7),M.gray);
      st.position.set(sx*1.72,-1.55,p[0]); st.rotation.z=sx*0.16; plane.add(st);
    });
    var cross=new THREE.Mesh(new THREE.CylinderGeometry(0.10,0.10,2.3,6),M.gray);
    cross.rotation.z=Math.PI/2; cross.position.set(0,-1.95,1.6); plane.add(cross);
  });
  return AR1P_common(4.82,2.55,{ailL:ailL,ailR:ailR,rud:rud,elev:elev,pilot:pilot});
}

// ---- C — THE CHUNKY TOY. Short, fat, big nose, big round wheels. Kenney's own
//      proportions. Still 10u long and 13u across: the ruler does not move. ----
function AR1P_planeC(){
  var pilot=null;
  var body=AR1P_body([[0.02,-4.85],[0.55,-4.4],[1.05,-3.6],[1.55,-2.3],[1.88,-0.7],
                      [1.98,0.8],[1.94,2.0],[1.80,3.0],[1.55,3.8],[1.15,4.4],
                      [0.70,4.72],[0.02,4.85]],12,M.rideBody);
  plane.add(body);
  // an oversized cowling: on a toy the engine is the biggest thing on the front
  var cowl=AR1P_body([[0.70,2.6],[1.90,2.65],[2.02,3.5],[1.92,4.2],
                      [1.55,4.62],[0.95,4.85],[0.02,4.95]],12,M.rideTrim);
  plane.add(cowl);
  var lip=new THREE.Mesh(new THREE.TorusGeometry(1.86,0.20,7,18),M.rideTrimShiny);
  lip.position.z=4.15; plane.add(lip);
  var span=ride.wingSpan;
  // thick stubby wings: a fat chord and a fat section, barely tapered
  var wing=AR1P_wing(span,4.0,3.1,0.72,0.52,0.35,0.55,M.rideWing);
  wing.position.set(0,0.05,0.30); plane.add(wing);
  [-1,1].forEach(function(sx){
    var tip=new THREE.Mesh(new THREE.SphereGeometry(0.40,9,7),M.rideWing);
    tip.scale.set(0.42,0.95,2.6); tip.position.set(sx*(span/2-0.10),0.05+0.55,0.30-0.30); plane.add(tip);
  });
  var ailL=new THREE.Group(), ailR=new THREE.Group();
  [[-1,ailL],[1,ailR]].forEach(function(p){
    var g=p[1]; g.position.set(p[0]*span*0.30,0.10,0.30-0.35-1.5);
    var s=new THREE.Mesh(new THREE.BoxGeometry(span*0.22,0.17,0.80),M.rideWing);
    s.position.z=-0.40; g.add(s); plane.add(g);
  });
  var tail=AR1P_wing(5.4,2.0,1.6,0.42,0.30,0.30,0.20,M.rideWing);
  tail.position.set(0,0.30,-3.7); plane.add(tail);
  var elev=new THREE.Group(); elev.position.set(0,0.30,-4.4);
  var eS=new THREE.Mesh(new THREE.BoxGeometry(5.4,0.16,0.6),M.rideWing);
  eS.position.z=-0.30; elev.add(eS); plane.add(elev);
  var finG=AR1P_loft([
    {x:0,   pts:AR1P_rib(2.9,0.52)},{x:0.7, pts:AR1P_rib(2.6,0.46),dz:-0.28},
    {x:1.5, pts:AR1P_rib(2.1,0.36),dz:-0.62},{x:2.05,pts:AR1P_rib(1.4,0.26),dz:-0.90}
  ]);
  finG.rotateZ(Math.PI/2);
  var fin=new THREE.Mesh(finG,M.rideBody); fin.position.set(0,0.9,-3.7); plane.add(fin);
  var rud=new THREE.Group(); rud.position.set(0,1.9,-4.45);
  var rS=new THREE.Mesh(new THREE.BoxGeometry(0.20,1.8,0.70),M.rideBody);
  rS.position.z=-0.35; rud.add(rS); plane.add(rud);
  // a big bubble canopy — on a toy the glass is a dome, not a windscreen
  var canopy=new THREE.Mesh(new THREE.SphereGeometry(1.28,12,10),
    new THREE.MeshPhongMaterial({color:ride.glass,shininess:120,transparent:true,opacity:0.55}));
  canopy.scale.set(0.92,0.88,1.30); canopy.position.set(0,1.42,0.85); plane.add(canopy);
  var ring=new THREE.Mesh(new THREE.TorusGeometry(1.22,0.17,7,18),M.rideTrim);
  ring.rotation.x=Math.PI/2; ring.position.set(0,0.92,0.85); ring.scale.set(1,1.28,1); plane.add(ring);
  if(!AR1P_HAS("nopilot")){ pilot=AR1P_pilot(1.10,1.00,1.05); plane.add(pilot); }
  // OVERSIZED round wheels: the single clearest "toy" signal there is
  [[-1.95,-1.55,1.35],[1.95,-1.55,1.35]].forEach(function(p){
    var wg=new THREE.TorusGeometry(0.78,0.34,8,16); wg.rotateY(Math.PI/2);
    var w=new THREE.Mesh(wg,M.gray); w.position.set(p[0],p[1],p[2]); plane.add(w);
    var hubg=new THREE.CylinderGeometry(0.46,0.46,0.44,10); hubg.rotateZ(Math.PI/2);
    var h=new THREE.Mesh(hubg,M.rideTrimShiny); h.position.set(p[0],p[1],p[2]); plane.add(h);
    var leg=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.26,1.3,7),M.rideBody);
    leg.position.set(p[0]*0.80,p[1]+0.85,p[2]); leg.rotation.z=p[0]>0?-0.28:0.28; plane.add(leg);
  });
  var twg=new THREE.TorusGeometry(0.40,0.20,7,12); twg.rotateY(Math.PI/2);
  var tw=new THREE.Mesh(twg,M.gray); tw.position.set(0,-1.0,-3.4); plane.add(tw);
  return AR1P_common(4.95,2.75,{ailL:ailL,ailR:ailR,rud:rud,elev:elev,pilot:pilot});
}

// ---------------------------------------------------------------- PART 2: COINS
// A: the literal answer. A real RING, seen face on, spinning about its vertical
//    axis so it flashes thin then wide. Bigger than the coin, and hot.
function AR1P_coinRing(){
  coinGeo=new THREE.TorusGeometry(1.62,0.42,6,18);
  M_COIN=new THREE.MeshPhongMaterial({color:0xFFD54A,emissive:0x9A6A00,
    specular:0xFFFFFF,shininess:260});
}
// B: keep the hand-turned coin (LOOK RULE 13) and make it SHINE. Bigger, hotter
//    emissive, and an additive halo behind every coin.
//    THE HALO IS A POINT CLOUD, not a sprite each. One THREE.Points per chunk is
//    ONE draw call for every coin in it; a glow sprite per coin would have
//    DOUBLED the coin count, and the coins already are the draw calls out there.
function AR1P_coinBright(){
  var R=1.62,T=0.25,V=THREE.Vector2;
  var g=new THREE.LatheGeometry([
    new V(0.001,T*1.35), new V(R*0.52,T*1.35), new V(R*0.60,T),
    new V(R,T*0.34),     new V(R,-T*0.34),     new V(R*0.60,-T),
    new V(R*0.52,-T*1.35), new V(0.001,-T*1.35)
  ],18);
  g.rotateX(Math.PI/2);
  var pa=g.attributes.position, col=[];
  for(var i=0;i<pa.count;i++){
    var rr=Math.hypot(pa.getX(i),pa.getY(i))/R;
    var t=Math.min(1,Math.max(0,(rr-0.5)/0.5));
    col.push(1-0.14*t, 1-0.20*t, 1-0.42*t);
  }
  g.setAttribute("color",new THREE.Float32BufferAttribute(col,3));
  coinGeo=g;
  M_COIN=new THREE.MeshPhongMaterial({color:0xFFE066,emissive:0x6A4600,
    specular:0xFFFFFF,shininess:300,vertexColors:true});
}
function AR1P_glowTex(){
  var c=document.createElement("canvas"); c.width=c.height=64;
  var x=c.getContext("2d"), gr=x.createRadialGradient(32,32,0,32,32,32);
  gr.addColorStop(0,"rgba(255,255,240,1)"); gr.addColorStop(0.32,"rgba(255,224,120,0.55)");
  gr.addColorStop(0.62,"rgba(255,190,60,0.16)"); gr.addColorStop(1,"rgba(255,180,40,0)");
  x.fillStyle=gr; x.fillRect(0,0,64,64);
  return new THREE.CanvasTexture(c);
}
var AR1P_GLOWS=[];
function AR1P_addGlow(group,coins){
  if(!coins||!coins.length) return;
  var pos=[],col=[],i;
  for(i=0;i<coins.length;i++){ pos.push(coins[i].x,coins[i].y,coins[i].z); col.push(1,1,1); }
  var g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute("color",new THREE.Float32BufferAttribute(col,3));
  var p=new THREE.Points(g,new THREE.PointsMaterial({size:9.0,map:AR1P_GLOWTEX,
    blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,
    vertexColors:true,sizeAttenuation:true}));
  p.frustumCulled=false; group.add(p);
  AR1P_GLOWS.push({pts:p,coins:coins});
}
function AR1P_stepGlow(t){
  for(var i=0;i<AR1P_GLOWS.length;i++){
    var G=AR1P_GLOWS[i], pa=G.pts.geometry.attributes.position,
        ca=G.pts.geometry.attributes.color, c;
    for(var j=0;j<G.coins.length;j++){
      c=G.coins[j];
      if(c.taken){ if(pa.getY(j)>-9000){ pa.setY(j,-9999); pa.needsUpdate=true; } continue; }
      // the halo rides the coin's own bob and flashes on its own phase, so a
      // trail sparkles ALONG its length instead of pulsing in lockstep
      pa.setY(j, c.mesh.position.y); pa.needsUpdate=true;
      var f=0.62+0.38*Math.abs(Math.sin(t*3+c.ph));
      ca.setXYZ(j,f,f*0.94,f*0.7); ca.needsUpdate=true;
    }
  }
}

// ---------------------------------------------------------------- PART 3: PETS
// Cube Pets DO carry animation: 8 clips each (static/idle/walk/run/eat/dance/
// gesture x2), node transforms with NO skinning. That is the whole decision:
//   - merged flat  -> 1 draw call per animal, motion written in code
//   - clips        -> 5 to 7 draw calls per animal (the merge is what kills the
//                     hierarchy), plus an AnimationMixer
var PET_BASE="/models/skyflyer/pets/";
var PET_FILES={crab:"animal-crab.glb",parrot:"animal-parrot.glb",monkey:"animal-monkey.glb",
  fish:"animal-fish.glb",bee:"animal-bee.glb",pig:"animal-pig.glb",chick:"animal-chick.glb"};
var PETS={}, PET_ON=false, PET_LIVE=[], PET_MIX=[], PET_MAT=null, PET_PENDING=[];
// Cube Pets are TEXTURED (one shared colormap), so the mint trap does not apply
// to them — but they must still land on one shared material or seven animals is
// seven materials for one atlas.
function AR1P_petPrep(root,clips,animated){
  root.traverse(function(o){
    if(!o.isMesh||!o.material) return;
    if(!PET_MAT&&o.material.map) PET_MAT=new THREE.MeshLambertMaterial({map:o.material.map});
    if(PET_MAT) o.material=PET_MAT;
    o.castShadow=o.receiveShadow=false;
  });
  var out=animated?root:(function(){ try{ return mergeByMaterial(root); }catch(e){ return root; } })();
  var box=new THREE.Box3().setFromObject(out);
  var h=Math.max(0.001,box.max.y-box.min.y);
  out.position.y-=box.min.y;
  var wrap=new THREE.Group(); wrap.add(out);
  wrap.userData.h=h; wrap.userData.clips=clips; wrap.userData.inner=out;
  return wrap;
}
function AR1P_loadPets(animated,done){
  var loader; try{ loader=new THREE.GLTFLoader(); }catch(e){ return done&&done(); }
  var names=[],k; for(k in PET_FILES) names.push(k);
  var left=names.length;
  names.forEach(function(n){
    loader.load(PET_BASE+PET_FILES[n],function(g){
      try{ PETS[n]=AR1P_petPrep(g.scene,g.animations||[],animated); }catch(e){}
      if(--left<=0){ PET_ON=true; done&&done(); }
    },null,function(){ if(--left<=0){ PET_ON=true; done&&done(); } });
  });
}
// SCALE RULER. A crab is not the size of a hut. These are heights in units, run
// about 1.4x life size against the 1u ~ 0.9m ruler so they still read from the
// air; a true-to-life crab at this camera is four pixels of nothing.
var PET_SIZE={crab:1.6,parrot:1.9,monkey:2.9,fish:1.9,bee:1.3,pig:2.6,chick:1.5};
function AR1P_ANYPETS(){ return AR1P_HAS("pets")||AR1P_HAS("petsAnim")||AR1P_HAS("pets2"); }
// ROUND 2: the hand-built set has different species to the cube set — a
// butterfly instead of a bee, a turtle instead of the farmyard. The MOTION
// kinds do not change, so the placement code below never learns which set is on.
function AR1P_mk(name,an){
  if(!AR1P_HAS("pets2")) return AR1P_pet(name,an);
  var map={bee:"butterfly",pig:"turtle",chick:"turtle"};
  return AR1P_pet2(map[name]||name);
}
function AR1P_pet(name,animated){
  var proto=PETS[name]; if(!proto) return null;
  var c=proto.clone(true);
  var s=PET_SIZE[name]/proto.userData.h; c.scale.setScalar(s);
  if(animated&&proto.userData.clips&&proto.userData.clips.length){
    var mix=new THREE.AnimationMixer(c);
    var want=(name==="fish"||name==="bee"||name==="parrot")?"idle":"walk";
    var clip=proto.userData.clips.filter(function(a){return a.name===want;})[0]||proto.userData.clips[1];
    if(clip){ var act=mix.clipAction(clip); act.play(); act.time=Math.random()*2; }
    PET_MIX.push(mix);
  }
  return c;
}

// ---------------------------------------------------------- PART 4: WORLD LIFE
// Every one of these was chosen for LIFE PER DRAW CALL, because the iPad is the
// budget. The flock is one mesh. All the smoke in the world is one mesh. The
// surf, the sway, the flags and the travelling boats are free — they move things
// that are already on the screen.
var GULLS=null, GULL_N=14, GULL_ST=[], SMOKE=null, SMOKE_P=[], SURF=[], SWAY=[], WAVERS=[], TRAVEL=[];
function AR1P_buildGulls(){
  var pos=[],idx=[],i;
  for(i=0;i<GULL_N;i++){
    pos.push(0,0,0, 0,0,0, 0,0,0, 0,0,0);              // filled every frame
    var b=i*4; idx.push(b,b+1,b+2, b+3,b+2,b+1);
    var a=Math.random()*6.283;
    GULL_ST.push({cx:(Math.random()-0.5)*150,cz:(Math.random()-0.5)*150,
      r:18+Math.random()*40, y:16+Math.random()*30, a:a, sp:0.32+Math.random()*0.30,
      fl:Math.random()*6.283, sc:0.9+Math.random()*0.7});
  }
  var g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
  g.setIndex(idx); g.computeVertexNormals();
  GULLS=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:0xFFFFFF,side:THREE.DoubleSide}));
  GULLS.frustumCulled=false; scene.add(GULLS);
}
function AR1P_stepGulls(dt,t){
  if(!GULLS) return;
  // station-keeping is on the CAMERA, not the plane: the camera is what decides
  // what is on screen, and in the game it sits right behind the plane anyway
  var pa=GULLS.geometry.attributes.position, i,
      px=camera.position.x, pz=camera.position.z;
  for(i=0;i<GULL_N;i++){
    var G=GULL_ST[i];
    // the flock keeps station on the plane so there are always birds in the sky
    if(G.cx-px> 150) G.cx-=300; if(px-G.cx> 150) G.cx+=300;
    if(G.cz-pz> 150) G.cz-=300; if(pz-G.cz> 150) G.cz+=300;
    G.a+=dt*G.sp;
    var x=G.cx+Math.cos(G.a)*G.r, z=G.cz+Math.sin(G.a)*G.r, y=G.y+Math.sin(t*0.7+G.fl)*2.2;
    // ...and WHEELS AWAY when you fly through it, which is the bit that makes a
    // bird feel alive rather than painted on
    var dx=x-S.pos.x, dz=z-S.pos.z, d=Math.hypot(dx,dz);
    if(d<70){ var push=(70-d)*0.55; x+=dx/(d||1)*push; z+=dz/(d||1)*push; y+=(70-d)*0.24; }
    var head=G.a+Math.PI/2, cs=Math.cos(head), sn=Math.sin(head), s=G.sc;
    var flap=0.62+Math.sin(t*7.5+G.fl)*0.42;      // always a V, flapping about it
    var bk=(G.sp>0?-0.42:0.42), cb=Math.cos(bk), sb=Math.sin(bk);
    // 4 verts: left tip, nose, tail, right tip — banked, then turned onto heading
    function set(k,lx,ly,lz){
      var rx=lx*cb-ly*sb, ry=lx*sb+ly*cb;
      pa.setXYZ(i*4+k, x+(rx*cs-lz*sn)*s, y+ry*s, z+(rx*sn+lz*cs)*s);
    }
    set(0,-1.75,flap,-0.30); set(1,0,0,0.80); set(2,0,-0.06,-0.90); set(3,1.75,flap,-0.30);
  }
  pa.needsUpdate=true;
}
function AR1P_buildSmoke(){
  var N=520,pos=[],col=[],i;
  for(i=0;i<N;i++){ pos.push(0,-9999,0); col.push(1,1,1);
    SMOKE_P.push({src:-1,life:Math.random(),sp:1.6+Math.random()*1.4,
      dx:(Math.random()-0.5)*0.9,dz:(Math.random()-0.5)*0.9,sw:Math.random()*6.283}); }
  var g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute("color",new THREE.Float32BufferAttribute(col,3));
  SMOKE=new THREE.Points(g,new THREE.PointsMaterial({size:3.4,map:AR1P_SMOKETEX,
    blending:THREE.NormalBlending,depthWrite:false,transparent:true,opacity:0.72,
    vertexColors:true,sizeAttenuation:true}));
  SMOKE.frustumCulled=false; scene.add(SMOKE);
}
var FIRES=[];
function AR1P_stepSmoke(dt){
  if(!SMOKE||!FIRES.length) return;
  var pa=SMOKE.geometry.attributes.position, ca=SMOKE.geometry.attributes.color, i;
  for(i=0;i<SMOKE_P.length;i++){
    var P=SMOKE_P[i];
    if(P.src<0){ P.src=(Math.random()*FIRES.length)|0; P.life=Math.random(); }
    P.life+=dt*0.20;
    if(P.life>=1){ P.life=0; P.src=(Math.random()*FIRES.length)|0;
      P.dx=(Math.random()-0.5)*0.9; P.dz=(Math.random()-0.5)*0.9; }
    var F=FIRES[P.src], h=P.life*14*P.sp;
    pa.setXYZ(i, F.x+P.dx*h*0.5+Math.sin(P.sw+P.life*5)*1.1, F.y+0.6+h, F.z+P.dz*h*0.5);
    // white at the fire, washing out into the sky colour as it climbs. Fading
    // the vertex colour to BLACK under normal blending made a soot smudge.
    var f=P.life;
    ca.setXYZ(i, 1-f*0.42, 1-f*0.30, 1-f*0.08);
  }
  pa.needsUpdate=true; ca.needsUpdate=true;
}

// ---------------------------------------------------- the AR1P wiring itself
var AR1P_GLOWTEX=null, AR1P_SMOKETEX=null, AR1P_SHADTEX=null, AR1P_WAKETEX=null;
function AR1P_wakeTex(){
  var c=document.createElement("canvas"); c.width=c.height=64;
  var x=c.getContext("2d");
  // v runs from the transom (bottom) to the far end of the wake (top): bright
  // and narrow at the boat, wide and gone behind it.
  var g=x.createLinearGradient(0,64,0,0);
  g.addColorStop(0,"rgba(255,255,255,0.95)");
  g.addColorStop(0.35,"rgba(255,255,255,0.5)");
  g.addColorStop(1,"rgba(255,255,255,0)");
  x.fillStyle=g; x.fillRect(0,0,64,64);
  // soften the two long edges so it is a spreading V, not a ruled triangle
  var e=x.createLinearGradient(0,0,64,0);
  e.addColorStop(0,"rgba(0,0,0,1)"); e.addColorStop(0.22,"rgba(0,0,0,0)");
  e.addColorStop(0.78,"rgba(0,0,0,0)"); e.addColorStop(1,"rgba(0,0,0,1)");
  x.globalCompositeOperation="destination-out"; x.fillStyle=e; x.fillRect(0,0,64,64);
  x.globalCompositeOperation="source-over";
  return new THREE.CanvasTexture(c);
}
function AR1P_softTex(a){
  var c=document.createElement("canvas"); c.width=c.height=64;
  var x=c.getContext("2d"), gr=x.createRadialGradient(32,32,0,32,32,32);
  gr.addColorStop(0,"rgba(255,255,255,"+a+")"); gr.addColorStop(0.55,"rgba(255,255,255,"+(a*0.35)+")");
  gr.addColorStop(1,"rgba(255,255,255,0)");
  x.fillStyle=gr; x.fillRect(0,0,64,64);
  return new THREE.CanvasTexture(c);
}

// Every prop the island places comes back through inst(). Tagging it there is
// how the sway, the flag wave and the smoke find their own objects later
// without dressIsle having to be edited at all.
(function(){
  var _inst=inst;
  inst=function(name,h,w){ var o=_inst(name,h,w); if(o) o.userData.kitName=name; return o; };
})();

// Animals and life get added AFTER the island has dressed itself, using the same
// plan and the same law: ask landTop where the ground is, and if the answer is
// "that is the sea", do not place it.
(function(){
  var _dress=dressIsle;
  dressIsle=function(isle){
    var was=isle&&isle.userData&&isle.userData.dressed;
    _dress(isle);
    if(was||!isle.userData.dressed) return;
    try{ AR1P_dress(isle); }catch(e){ if(window.console) console.log("AR1P dress",e); }
    // THE ORDERING TRAP. The island dresses itself the moment the Kenney kit is
    // ready, which can be BEFORE the pets have landed — and the second pass is
    // refused because the island is already marked dressed. So an island that
    // dressed early is remembered, and gets its animals when they arrive.
    if(AR1P_ANYPETS()&&!PET_ON) PET_PENDING.push(isle);
  };
})();
function AR1P_dress(isle){
  var d=isle.userData.dress; if(!d) return;
  var plan=d.plan; if(!plan) return;
  var r=rng(d.seed+911), i;
  var coast=plan.coast, top=plan.length-1;
  function ringAt(ti,frac,ang){
    var outer=outlineR(ang,plan[ti].r,plan[ti].ph);
    var inner=(ti+1<plan.length)?outlineR(ang,plan[ti+1].r,plan[ti+1].ph):0;
    return inner+(outer-inner)*(0.2+frac*0.58);
  }
  // THE PLACEMENT LAW, unchanged: y always comes from landTop, and a thing that
  // lands in the water is simply not placed.
  function put(o,dist,ang,sink){
    if(!o) return null;
    var x=Math.cos(ang)*dist, z=Math.sin(ang)*dist, y=landTop(plan,x,z);
    if(y==null) return null;
    o.position.set(x,y-(sink||0.02),z); o.rotation.y=r()*6.283; isle.add(o); return o;
  }
  // ---- the palms this island actually built, found by position, so a parrot
  //      can sit in one and the whole lot can sway ----
  var palms=[];
  isle.traverse(function(o){
    if(o.userData&&o.userData.kitName&&/^palm|^qFern/.test(o.userData.kitName)&&o.parent===isle){
      var b=new THREE.Box3().setFromObject(o);
      palms.push({o:o,top:b.max.y,x:o.position.x,z:o.position.z,ph:r()*6.283});
    }
    if(o.userData&&o.userData.kitName&&/^flag/.test(o.userData.kitName)&&o.parent===isle)
      WAVERS.push({o:o,ph:r()*6.283,y0:o.rotation.y});
  });
  if(AR1P_HAS("life")) for(i=0;i<palms.length;i++) SWAY.push(palms[i]);

  if(AR1P_ANYPETS()&&PET_ON) AR1P_dressPets(isle,plan,r,d,coast,top,ringAt,put);
  if(AR1P_HAS("life")) AR1P_dressLife(isle,plan,r,d,ringAt,put);
}
// An island that dressed itself BEFORE the animals existed is remembered and
// dressed here when they turn up. Both pet sets go through this one door.
function AR1P_drainPet(isle){
  var d=isle.userData.dress; if(!d||!d.plan) return;
  var plan=d.plan, r=rng(d.seed+911), coast=plan.coast, top=plan.length-1;
  function ringAt(ti,frac,ang){
    var outer=outlineR(ang,plan[ti].r,plan[ti].ph);
    var inner=(ti+1<plan.length)?outlineR(ang,plan[ti+1].r,plan[ti+1].ph):0;
    return inner+(outer-inner)*(0.2+frac*0.58);
  }
  function put(o,dist,ang,sink){
    if(!o) return null;
    var x=Math.cos(ang)*dist, z=Math.sin(ang)*dist, y=landTop(plan,x,z);
    if(y==null) return null;
    o.position.set(x,y-(sink||0.02),z); o.rotation.y=r()*6.283; isle.add(o); return o;
  }
  try{ AR1P_dressPets(isle,plan,r,d,coast,top,ringAt,put); }catch(e){}
}
function AR1P_dressPets(isle,plan,r,d,coast,top,ringAt,put){
  var i, palms=[];
  isle.traverse(function(o){
    if(o.userData&&o.userData.kitName&&/^palm/.test(o.userData.kitName)&&o.parent===isle){
      var b=new THREE.Box3().setFromObject(o);
      palms.push({o:o,top:b.max.y,x:o.position.x,z:o.position.z});
    }
  });
  {
    var an=AR1P_HAS("petsAnim");
    // crabs down on the SAND (tier 0 is the beach), sidling along a short arc
    var nc=d.big?3:2;
    for(i=0;i<nc;i++){
      var a=r()*6.283, c=AR1P_mk("crab",an);
      if(put(c,ringAt(0,0.15+r()*0.5,a),a,0)) PET_LIVE.push({o:c,kind:"crab",isle:isle,plan:plan,
        a:a,r0:c.position.x,ph:r()*6.283,base:c.position.y,ang:a,arc:0.16+r()*0.16,d0:Math.hypot(c.position.x,c.position.z)});
    }
    // parrots UP IN THE PALMS — perched on the real crown of a real palm
    for(i=0;i<Math.min(palms.length,d.big?3:1);i++){
      var P=palms[(r()*palms.length)|0]; if(!P) break;
      var pr=AR1P_mk("parrot",an); if(!pr) break;
      // down INTO the crown, not perched on top of the leaves like an ornament
      pr.position.set(P.x,P.top-1.35,P.z); pr.rotation.y=r()*6.283; isle.add(pr);
      PET_LIVE.push({o:pr,kind:"parrot",base:P.top-1.35,ph:r()*6.283});
    }
    // a monkey on the top ledge
    if(d.big){
      var ma=r()*6.283, mk=AR1P_mk("monkey",an);
      if(put(mk,ringAt(top,0.12,ma),ma,0)) PET_LIVE.push({o:mk,kind:"monkey",
        base:mk.position.y,ph:r()*6.283,ang:ma});
    }
    // fish JUMPING in the lagoon: outside the coast, so it is over water, and
    // it arcs through y=0 rather than sitting on it
    var nf=d.big?3:2;
    for(i=0;i<nf;i++){
      var fa=r()*6.283, fd=coast*(1.10+r()*0.22), fs=AR1P_mk("fish",an);
      if(!fs) break;
      fs.position.set(Math.cos(fa)*fd,-3,Math.sin(fa)*fd); isle.add(fs);
      PET_LIVE.push({o:fs,kind:"fish",ph:r()*6.283,t:r()*4,x:fs.position.x,z:fs.position.z,head:fa});
    }
    // bees over the flowers, on a slow figure of eight
    for(i=0;i<(d.big?3:1);i++){
      var ba=r()*6.283, bd=ringAt(Math.min(1,top),0.4+r()*0.3,ba), by=landTop(plan,Math.cos(ba)*bd,Math.sin(ba)*bd);
      if(by==null) continue;
      var be=AR1P_mk("bee",an); if(!be) break;
      be.position.set(Math.cos(ba)*bd,by+1.6,Math.sin(ba)*bd); isle.add(be);
      PET_LIVE.push({o:be,kind:"bee",cx:Math.cos(ba)*bd,cz:Math.sin(ba)*bd,base:by+1.6,ph:r()*6.283});
    }
    // a pig and a chick in the camp
    if(d.big){
      var ct=AR1P_HAS("pets2")?0:(plan.length>1?1:0);
      [["pig",0.35],["chick",0.55],["chick",0.62]].forEach(function(p){
        var pa2=r()*6.283, o=AR1P_mk(p[0],an);
        if(put(o,ringAt(ct,p[1],pa2),pa2,0))
          PET_LIVE.push({o:o,kind:p[0],base:o.position.y,ph:r()*6.283,ang:pa2,
            d0:Math.hypot(o.position.x,o.position.z),plan:plan,arc:0.10+r()*0.10});
      });
    }
  }
}
function AR1P_dressLife(isle,plan,r,d,ringAt,put){
  {
    // a campfire with real SMOKE. Every camp gets one; all the smoke in the
    // world is a single point cloud, so this is ONE draw call for the lot.
    if(d.big){
      var fa2=r()*6.283, ft=plan.length>1?1:0;
      var fire=inst(r()>0.5?"fire":"fireC",1.3);
      var fp=put(fire,ringAt(ft,0.30,fa2),fa2,0);
      if(fp){ isle.updateMatrixWorld(true);
        var wp=new THREE.Vector3(); fp.getWorldPosition(wp);
        FIRES.push({x:wp.x,y:wp.y,z:wp.z}); }
    }
    // THE SURF. The halo already paints a foam band; breathing it in and out is
    // a moving shoreline for exactly zero extra draw calls.
    isle.traverse(function(o){
      if(o.isMesh&&o.material===M_HALO) SURF.push({o:o,s0:o.scale.x,ph:r()*6.283});
    });
  }
}
// Boats that TRAVEL. A floater already bobs on the spot; giving it a slow orbit
// at the radius it was moored at keeps it in water by construction and turns a
// sticker into traffic. Zero extra draw calls.
function AR1P_travel(){
  for(var i=0;i<floaters.length;i++){
    var f=floaters[i], d=Math.hypot(f.position.x,f.position.z);
    if(d<8) continue;
    // it has to be OVER WATER. A boat moored inside the beach ring would orbit
    // across the sand and drag a wake over it.
    var pp=f.parent&&f.parent.userData&&f.parent.userData.dress;
    if(pp&&pp.plan&&landTop(pp.plan,f.position.x,f.position.z)!=null) continue;
    if(pp&&pp.plan&&d<pp.plan.coast*1.25) continue;
    TRAVEL.push({o:f,r:d,a:Math.atan2(f.position.z,f.position.x),
      sp:(0.035+Math.random()*0.05)*(Math.random()<0.5?-1:1)});
  }
}

function AR1P_step(dt,t){
  if(AR1P_HAS("move")) AR1P_stepPuppets(t);
  if(AR1P_HAS("coinB")) AR1P_stepGlow(t);
  var i;
  for(i=0;i<PET_MIX.length;i++) PET_MIX[i].update(dt);
  for(i=0;i<PET_LIVE.length;i++){
    var P=PET_LIVE[i], o=P.o;
    if(P.kind==="crab"||P.kind==="pig"||P.kind==="chick"){
      // a slow wander along a short arc at a FIXED distance from the middle, so
      // it can never walk off its own terrace
      var sw=Math.sin(t*(P.kind==="crab"?0.6:0.35)+P.ph)*P.arc;
      var na=P.ang+sw, x=Math.cos(na)*P.d0, z=Math.sin(na)*P.d0;
      var y=P.plan?landTop(P.plan,x,z):null;
      if(y!=null){ o.position.set(x,y,z); }
      o.rotation.y=-na+(P.kind==="crab"?Math.PI/2:0)+Math.cos(t*0.6+P.ph)*0.3;
      o.position.y+=Math.abs(Math.sin(t*(P.kind==="chick"?7:4)+P.ph))*(P.kind==="chick"?0.22:0.10);
    } else if(P.kind==="parrot"){
      o.position.y=P.base+Math.sin(t*1.6+P.ph)*0.16;
      o.rotation.y+=dt*(Math.sin(t*0.5+P.ph)>0.86?2.2:0);
    } else if(P.kind==="monkey"){
      var hop=Math.max(0,Math.sin(t*1.1+P.ph)); o.position.y=P.base+hop*hop*1.1;
      o.rotation.y=P.ang+Math.sin(t*0.6+P.ph)*0.8;
    } else if(P.kind==="fish"){
      P.t+=dt; var cyc=4.2, u=(P.t%cyc)/cyc;
      if(u<0.55){ var j=u/0.55; o.visible=true;
        o.position.set(P.x,-1.2+Math.sin(j*Math.PI)*3.4,P.z);
        o.rotation.z=Math.cos(j*Math.PI)*1.1; o.rotation.y=P.head+1.57;
        // a SPLASH where it breaks the surface, both ways: a fish that leaves no
        // mark on the water reads as a sticker sliding up and down
        if(!P.spl&&j>0.06&&j<0.14){ P.spl=1; burst(new THREE.Vector3(P.x,0.4,P.z),7,splashMat); }
        if(P.spl===1&&j>0.86){ P.spl=2; burst(new THREE.Vector3(P.x,0.4,P.z),7,splashMat); }
      } else { o.visible=false; P.spl=0; }
    } else if(P.kind==="bee"){
      var a1=t*1.5+P.ph;
      o.position.set(P.cx+Math.sin(a1)*2.4, P.base+Math.sin(a1*2)*0.7, P.cz+Math.sin(a1*2)*1.6);
      o.rotation.y=-a1;
    }
  }
  if(AR1P_HAS("life2")){ AR1P_stepShadows(dt,t); AR1P_stepWakes(); }
  if(!AR1P_HAS("life")) return;
  AR1P_stepGulls(dt,t); AR1P_stepSmoke(dt);
  // palms sway, and bend HARDER when the plane comes in low over them
  for(i=0;i<SWAY.length;i++){
    var W=SWAY[i], o2=W.o;
    var gust=0;
    if(S.pos.y<48){
      o2.getWorldPosition(AR1P_V); var dd=Math.hypot(AR1P_V.x-S.pos.x,AR1P_V.z-S.pos.z);
      if(dd<44) gust=(1-dd/44)*(1-Math.min(1,S.pos.y/48))*0.34;
    }
    var s2=Math.sin(t*1.25+W.ph)*0.045+gust;
    o2.rotation.z=s2; o2.rotation.x=Math.cos(t*0.9+W.ph)*0.03;
  }
  for(i=0;i<WAVERS.length;i++){
    var F=WAVERS[i];
    F.o.rotation.y=F.y0+Math.sin(t*2.6+F.ph)*0.30;
    F.o.rotation.z=Math.sin(t*3.4+F.ph)*0.07;
  }
  for(i=0;i<SURF.length;i++){
    var U=SURF[i]; var k=1+Math.sin(t*0.55+U.ph)*0.012;
    U.o.scale.set(U.s0*k,U.o.scale.y,U.s0*k);
  }
  for(i=0;i<TRAVEL.length;i++){
    var T=TRAVEL[i]; T.a+=dt*T.sp*0.25;
    T.o.position.x=Math.cos(T.a)*T.r; T.o.position.z=Math.sin(T.a)*T.r;
    T.o.rotation.y=(T.sp>0)?-T.a:(-T.a+Math.PI);
  }
}
var AR1P_V=new THREE.Vector3();

// ---- boot ----
(function(){
  if(AR1P_HAS("coinB")){ AR1P_GLOWTEX=AR1P_glowTex(); }
  if(AR1P_HAS("life")){ AR1P_SMOKETEX=AR1P_softTex(0.85); }
  var _buildChunk=buildChunk;
  buildChunk=function(cx,cz){
    var key=cx+","+cz, had=!!chunks[key];
    _buildChunk(cx,cz);
    if(!had&&chunks[key]&&AR1P_HAS("coinB")) AR1P_addGlow(chunks[key].group,chunks[key].coins);
  };
  var _loadKit=loadKit;
  loadKit=function(){
    _loadKit();
    if(AR1P_HAS("pets3")) E3_load(function(){ try{ redressWorld(); }catch(e){} });
    if(AR1P_HAS("pets2")){
      // nothing to download: build them, then dress the islands that were
      // already standing before we got here
      AR1P_buildPets2();
      for(var z=0;z<PET_PENDING.length;z++) AR1P_drainPet(PET_PENDING[z]);
      PET_PENDING.length=0;
      try{ redressWorld(); }catch(e){}
    }
    if(AR1P_HAS("pets")||AR1P_HAS("petsAnim"))
      AR1P_loadPets(AR1P_HAS("petsAnim"),function(){
        for(var q=0;q<PET_PENDING.length;q++) AR1P_drainPet(PET_PENDING[q]);
        PET_PENDING.length=0;
        try{ redressWorld(); }catch(e){}
      });
    if(AR1P_HAS("coinB")) AR1P_addGlow(starter.group,starter.coins);
    if(AR1P_HAS("life2")){ AR1P_SHADTEX=AR1P_softTex(1.0); AR1P_WAKETEX=AR1P_wakeTex();
      AR1P_buildShadows(); AR1P_buildWakes(); }
    if(AR1P_HAS("life")){ AR1P_buildGulls(); AR1P_buildSmoke();
      setTimeout(AR1P_travel,1200); setTimeout(AR1P_travel,4000); }
    if(AR1P_HAS("life2")&&!AR1P_HAS("life")){
      setTimeout(AR1P_travel,1200); setTimeout(AR1P_travel,4000); }
  };
})();
window.AR1P={
  flags:function(){ return AR1P_FLAGS; },
  // the mock's own look gate: put the plane somewhere, on a heading, at a bank,
  // so a still picture can show a control surface actually deflected
  pose:function(x,y,z,yaw,bank,pitch){
    S.pos.set(x,y,z); S.yaw=yaw||0; S.bank=bank||0; S.pitch=pitch||0;
    plane.position.copy(S.pos); plane.rotation.set(S.pitch,S.yaw,S.bank);
    try{ rideAnim(0.016,S.mode,time); }catch(e){}
    return {x:S.pos.x,y:S.pos.y,z:S.pos.z,yaw:S.yaw};
  },
  at:function(){ return {x:S.pos.x,y:S.pos.y,z:S.pos.z,yaw:S.yaw,mode:S.mode}; },
  // what the PLANE alone costs: meshes and triangles under the ride group
  planeCost:function(){ var m=0,t=0; plane.traverse(function(o){ if(!o.isMesh)return; m++;
      var g=o.geometry; if(g) t+=g.index?g.index.count/3:(g.attributes.position?g.attributes.position.count/3:0); });
    return {meshes:m,tris:Math.round(t)}; },
  // every coin in the world, in WORLD space, grouped by the chunk it lives in.
  // The shot script uses this to stand a camera behind a real trail instead of
  // guessing where one might be.
  coinRuns:function(){ var out=[],key;
    for(key in chunks){ var c=chunks[key], a=[];
      for(var i=0;i<c.coins.length;i++) a.push([c.group.position.x+c.coins[i].x,
        c.coins[i].y, c.group.position.z+c.coins[i].z]);
      if(a.length) out.push(a); }
    return out; },
  // set off the collect sparkle exactly where the picture is being taken, so the
  // pickup can be judged as an EVENT and not described in words
  pop:function(x,y,z,n){ burst(new THREE.Vector3(x,y,z),n||18); return sparks.length; },
  // pose the plane AND draw one frame in a single call. Two calls let the sim
  // run in between and the bank was gone by the time the shutter opened.
  shot:function(pose,pos,at){
    if(pose) window.AR1P.pose(pose[0],pose[1],pose[2],pose[3],pose[4],pose[5]);
    return SKY.look(pos,at); },
  coinsOnScreen:function(){ var n=0,k; for(k in chunks) n+=chunks[k].coins.length; return n+starter.coins.length; },
  pets:function(){ return {loaded:Object.keys(PETS).length,live:PET_LIVE.length,mixers:PET_MIX.length}; },
  life:function(){ return {gulls:GULL_N,fires:FIRES.length,sway:SWAY.length,
    flags:WAVERS.length,surf:SURF.length,travel:TRAVEL.length}; },
  glows:function(){ return AR1P_GLOWS.length; },
  // THE STAND. Six animals in a row on a flat patch in front of the camera, all
  // at their real in-game size, so a shape can be judged instead of hunted for.
  zoo:function(x,y,z,list,gap){
    var names=list||["crab","parrot","monkey","fish","turtle","butterfly"], out=[];
    gap=gap||3.2;
    for(var i=0;i<names.length;i++){
      var o=AR1P_HAS("pets3")?E3_get(names[i])
           :AR1P_HAS("pets2")?AR1P_pet2(names[i]):AR1P_pet(names[i],false);
      if(!o) continue;
      o.position.set(x+(i-(names.length-1)/2)*gap, y, z);
      o.rotation.y=0.55; scene.add(o); out.push(names[i]);
      if(AR1P_HAS("move")) AR1P_puppet(o, GAIT_OF[names[i]]||"walk",
        (GAIT_OF[names[i]]==="plod")?1.7:(GAIT_OF[names[i]]==="flap")?6.8:3.4);
    }
    return out; },
  life2:function(){ return {shadows:!!SHADOWS, wakes:!!WAKES, travel:TRAVEL.length,
    shadTex:!!AR1P_SHADTEX, wakeTex:!!AR1P_WAKETEX,
    s0:SHADOWS?[SHADOWS.geometry.attributes.position.getX(1),SHADOWS.geometry.attributes.position.getY(1),SHADOWS.geometry.attributes.position.getZ(1)]:null,
    w0:WAKES?[WAKES.geometry.attributes.position.getX(0),WAKES.geometry.attributes.position.getY(0),WAKES.geometry.attributes.position.getZ(0)]:null,
    cam:[camera.position.x|0,camera.position.y|0,camera.position.z|0] }; },
  pets2:function(){ var n=[],k; for(k in PETS2) n.push(k); return {built:n,live:PET_LIVE.length}; },
  // step the world forward by dt and draw ONE frame from a parked camera, over
  // and over: that is how the motion gets filmed instead of described.
  film:function(pos,at,dt){
    AR1P_step(dt||0.05,(window.__ft=(window.__ft||0)+(dt||0.05)));
    return SKY.look(pos,at);
  },
  pets3:function(){ var n=[],k; for(k in E3) n.push(k); return {on:E3_ON,got:n,want:E3_WANT.length}; },
  pets3cost:function(list){ var o={},i; for(i=0;i<list.length;i++) o[list[i]]=E3_cost(list[i]); return o; },
  // park the camera FIRST, then run the world's motion, then draw. The gulls
  // keep station on the camera, so settling before the camera moved left the
  // whole flock behind — and an empty sky in every picture.
  lookSettle:function(pos,at,n,dt){
    SKY.look(pos,at);
    for(var i=0;i<(n||60);i++) AR1P_step(dt||0.033,(i+1)*(dt||0.033));
    return SKY.look(pos,at);
  },
  settle:function(n,dt){ for(var i=0;i<(n||30);i++) AR1P_step(dt||0.033,(i+1)*(dt||0.033)); return true; },
  gullsAt:function(){ var pa=GULLS?GULLS.geometry.attributes.position:null,out=[];
    if(!pa) return out;
    for(var i=0;i<GULL_N;i++) out.push({x:pa.getX(i*4+1),y:pa.getY(i*4+1),z:pa.getZ(i*4+1)});
    return out; },
  boatsAt:function(){ var out=[],v=new THREE.Vector3();
    for(var i=0;i<TRAVEL.length;i++){ TRAVEL[i].o.getWorldPosition(v);
      out.push({x:v.x,y:v.y,z:v.z}); } return out; },
  flagsAt:function(){ var out=[],v=new THREE.Vector3();
    for(var i=0;i<WAVERS.length;i++){ WAVERS[i].o.getWorldPosition(v);
      out.push({x:v.x,y:v.y,z:v.z}); } return out; },
  // where the animals actually ARE, in world space, so a camera can be aimed at
  // one instead of at where one might be
  firesAt:function(){ return FIRES.slice(); },
  petsAt:function(){ var out=[],v=new THREE.Vector3();
    for(var i=0;i<PET_LIVE.length;i++){ var P=PET_LIVE[i];
      if(!P.o.visible) continue; P.o.getWorldPosition(v);
      out.push({kind:P.kind,x:v.x,y:v.y,z:v.z}); }
    return out; }
};
