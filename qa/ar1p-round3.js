// ============================================================================
//  AR1P round 3 — the EverythingLibrary animal kit Mike downloaded.
//  ONE FBX with 178 named animals, no textures, no animation clips, and the
//  colour BAKED INTO THE VERTICES (COLOR_0) — the same trick the hand-built set
//  uses, which means one shared material for all 178 and one draw call each.
//  Converted to glb with FBX2glTF and served whole for the mock; a real build
//  would export only the chosen animals (about 1,000 verts each).
// ============================================================================
var E3_URL="/models/skyflyer/everything/all.glb", E3={}, E3_ON=false, E3_MAT=null, E3_ROOT=null;

// Which of the 178 belong on a tropical island. The kit has NO crab, NO parrot
// and NO fish — it is a land-animal library — so those three stay hand-built.
var E3_WANT=["Gull","GreenIguana","RockIguana","Gecko","Tortoise","RedEyedTreeFrog",
  "GreenFrog","Toad","Chimpanzee","Mandrill","Orangutan","Otter","Pig","Goat",
  "Chicken","PekinDuck","Snail","BlueMorphoButterfly","MonarchButterfly","Dragonfly",
  "Bee","Firefly","Hummingbird","Dove","Swallow","Crow","Rabbit","Hedgehog","Raccoon"];

// THE ENGINE'S mergeByMaterial() COPIES position, normal and uv ONLY. These
// models carry no texture at all — every scrap of their colour is in COLOR_0 —
// so merging them the normal way produced 178 perfectly-shaped BLACK animals.
// This merge carries the colour through, and folds it to one mesh so an animal
// is still one draw call.
function E3_merge(root){
  root.updateMatrixWorld(true);
  var pos=[],nor=[],col=[],idx=[],base=0;
  var v=new THREE.Vector3(), nm=new THREE.Matrix3();
  root.traverse(function(o){
    var g=o.isMesh&&o.geometry; if(!g||!g.attributes.position) return;
    var pa=g.attributes.position, na=g.attributes.normal, ca=g.attributes.color;
    nm.getNormalMatrix(o.matrixWorld);
    for(var i=0;i<pa.count;i++){
      v.fromBufferAttribute(pa,i).applyMatrix4(o.matrixWorld); pos.push(v.x,v.y,v.z);
      if(na){ v.fromBufferAttribute(na,i).applyMatrix3(nm).normalize(); nor.push(v.x,v.y,v.z); }
      else nor.push(0,1,0);
      // COLOR_0 may be vec3 or vec4, and may arrive as normalised bytes
      if(ca) col.push(ca.getX(i),ca.getY(i),ca.getZ(i)); else col.push(1,1,1);
    }
    if(g.index){ for(var k=0;k<g.index.count;k++) idx.push(g.index.getX(k)+base); }
    else { for(var k2=0;k2<pa.count;k2++) idx.push(k2+base); }
    base+=pa.count;
  });
  var out=new THREE.BufferGeometry();
  out.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
  out.setAttribute("normal",new THREE.Float32BufferAttribute(nor,3));
  out.setAttribute("color",new THREE.Float32BufferAttribute(col,3));
  out.setIndex(idx);
  return new THREE.Mesh(out,E3_MAT);
}
function E3_prep(node){
  // strip assimp's pivot wrappers out of the name so "Hummingbird" is findable
  var g=new THREE.Group(); g.add(node);
  g.updateMatrixWorld(true);
  g.traverse(function(o){
    if(!o.isMesh) return;
    if(!E3_MAT) E3_MAT=new THREE.MeshLambertMaterial({vertexColors:true});
    o.material=E3_MAT; o.castShadow=o.receiveShadow=false;
  });
  var flat; try{ flat=E3_merge(g); }catch(e){ flat=g; }
  var box=new THREE.Box3().setFromObject(flat);
  // SIZE BY THE BIGGEST DIMENSION, not by height. A gull with its wings out is
  // barely any taller than a snail, so sizing on height made the birds and the
  // butterflies enormous and the iguanas the size of the plane.
  var h=Math.max(0.001,box.max.y-box.min.y);
  var span=Math.max(h, box.max.x-box.min.x, box.max.z-box.min.z);
  flat.position.x-=(box.min.x+box.max.x)/2;
  flat.position.z-=(box.min.z+box.max.z)/2;
  flat.position.y-=box.min.y;
  var wrap=new THREE.Group(); wrap.add(flat);
  wrap.userData.h=h; wrap.userData.span=span;
  return wrap;
}
function E3_load(done){
  var loader; try{ loader=new THREE.GLTFLoader(); }catch(e){ return done&&done(); }
  loader.load(E3_URL,function(gl){
    E3_ROOT=gl.scene;
    var byName={};
    gl.scene.traverse(function(o){
      var n=(o.name||"").split("_$Assimp")[0];
      if(n&&!byName[n]) byName[n]=o;
    });
    for(var i=0;i<E3_WANT.length;i++){
      var w=E3_WANT[i], src=byName[w];
      if(!src) continue;
      try{ E3[w]=E3_prep(src.clone(true)); }catch(e){}
    }
    E3_ON=true; PET_ON=true; done&&done();
  },null,function(){ done&&done(); });
}
// LONGEST DIMENSION in world units, on the AR1M ruler (hut 4.5u, palm 8-12u,
// plane 10u long), run about 1.4x life so they still read from the air.
var E3_SIZE={Gull:2.6,GreenIguana:2.6,RockIguana:2.6,Gecko:1.2,Tortoise:1.8,
  RedEyedTreeFrog:1.0,GreenFrog:1.1,Toad:1.2,Chimpanzee:2.6,Mandrill:2.4,
  Orangutan:2.8,Otter:2.0,Pig:2.6,Goat:2.6,Chicken:1.6,PekinDuck:1.8,Snail:1.0,
  BlueMorphoButterfly:1.2,MonarchButterfly:1.2,Dragonfly:1.1,Bee:0.8,Firefly:0.6,
  Hummingbird:0.9,Dove:1.5,Swallow:1.5,Crow:1.9,Rabbit:1.5,Hedgehog:1.0,Raccoon:1.8};
function E3_get(name){
  var p=E3[name]; if(!p) return null;
  var c=p.clone(true);
  c.scale.setScalar((E3_SIZE[name]||1.8)/p.userData.span);
  return c;
}
// what one of these actually costs, for the write-up
function E3_cost(name){
  var p=E3[name]; if(!p) return null;
  var t=0,m=0;
  p.traverse(function(o){ if(!o.isMesh||!o.geometry) return; m++;
    var g=o.geometry; t+=g.index?g.index.count/3:g.attributes.position.count/3; });
  return {meshes:m,tris:Math.round(t)};
}
