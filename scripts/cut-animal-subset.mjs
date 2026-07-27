#!/usr/bin/env node
// ============================================================================
//  Cut a few named animals out of the big EverythingLibrary glb.
//
//  The library is 178 animals and 12.8MB. A game must never ship that, so this
//  copies out ONLY the nodes it is asked for, with their children, their meshes,
//  their accessors and their buffer slices, and writes a fresh little glb.
//
//  THE ONE THING THAT MATTERS: these models carry no textures at all. Every
//  scrap of their colour lives in the COLOR_0 vertex attribute, so any tool that
//  drops unknown attributes turns all 178 of them BLACK. This copies attributes
//  verbatim and never re-interleaves anything, so COLOR_0 comes through
//  untouched.
//
//  Usage:
//    node scripts/cut-animal-subset.mjs <in.glb> <out.glb> Name1 Name2 ...
// ============================================================================
import fs from "node:fs";

const [, , IN, OUT, ...WANT] = process.argv;
if (!IN || !OUT || !WANT.length) {
  console.error("usage: cut-animal-subset.mjs <in.glb> <out.glb> Name1 [Name2 ...]");
  process.exit(1);
}

function readGlb(path) {
  const d = fs.readFileSync(path);
  if (d.readUInt32LE(0) !== 0x46546c67) throw new Error("not a glb: " + path);
  let off = 12, json = null, bin = null;
  while (off < d.length) {
    const len = d.readUInt32LE(off), type = d.readUInt32LE(off + 4);
    const body = d.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(body.toString("utf8"));
    else if (type === 0x004e4942) bin = Buffer.from(body);
    off += 8 + len + ((4 - (len % 4)) % 4);
  }
  return { json, bin };
}

const { json: J, bin: BIN } = readGlb(IN);

// ---- the new document, grown as we copy ----
const out = {
  asset: { version: "2.0", generator: "cut-animal-subset" },
  scene: 0, scenes: [{ nodes: [] }],
  nodes: [], meshes: [], accessors: [], bufferViews: [], materials: [], buffers: []
};
const chunks = [];       // the new BIN, one slice at a time
let binLen = 0;
const mapBV = new Map(), mapAcc = new Map(), mapMat = new Map(), mapMesh = new Map();

function copyBufferView(i) {
  if (mapBV.has(i)) return mapBV.get(i);
  const bv = J.bufferViews[i];
  const start = bv.byteOffset || 0;
  const slice = BIN.subarray(start, start + bv.byteLength);
  // every view starts on a 4-byte boundary, which some loaders insist on
  const pad = (4 - (binLen % 4)) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); binLen += pad; }
  const nbv = { buffer: 0, byteOffset: binLen, byteLength: bv.byteLength };
  if (bv.byteStride != null) nbv.byteStride = bv.byteStride;
  if (bv.target != null) nbv.target = bv.target;
  chunks.push(Buffer.from(slice)); binLen += bv.byteLength;
  const id = out.bufferViews.push(nbv) - 1;
  mapBV.set(i, id);
  return id;
}
function copyAccessor(i) {
  if (mapAcc.has(i)) return mapAcc.get(i);
  const a = J.accessors[i], na = JSON.parse(JSON.stringify(a));
  if (a.bufferView != null) na.bufferView = copyBufferView(a.bufferView);
  const id = out.accessors.push(na) - 1;
  mapAcc.set(i, id);
  return id;
}
function copyMaterial(i) {
  if (i == null) return undefined;
  if (mapMat.has(i)) return mapMat.get(i);
  // materials here are placeholders with no maps; strip anything that would
  // point at an image we are deliberately not carrying over
  const m = JSON.parse(JSON.stringify(J.materials[i]));
  delete m.normalTexture; delete m.occlusionTexture; delete m.emissiveTexture;
  if (m.pbrMetallicRoughness) {
    delete m.pbrMetallicRoughness.baseColorTexture;
    delete m.pbrMetallicRoughness.metallicRoughnessTexture;
  }
  const id = out.materials.push(m) - 1;
  mapMat.set(i, id);
  return id;
}
function copyMesh(i) {
  if (mapMesh.has(i)) return mapMesh.get(i);
  const m = J.meshes[i];
  const nm = { name: m.name, primitives: [] };
  m.primitives.forEach(p => {
    const np = { attributes: {} };
    // VERBATIM. COLOR_0 is the entire colour of these models.
    for (const k of Object.keys(p.attributes)) np.attributes[k] = copyAccessor(p.attributes[k]);
    if (p.indices != null) np.indices = copyAccessor(p.indices);
    const mat = copyMaterial(p.material);
    if (mat != null) np.material = mat;
    if (p.mode != null) np.mode = p.mode;
    nm.primitives.push(np);
  });
  const id = out.meshes.push(nm) - 1;
  mapMesh.set(i, id);
  return id;
}
function copyNode(i) {
  const n = J.nodes[i];
  const nn = { name: n.name };
  ["translation", "rotation", "scale", "matrix"].forEach(k => { if (n[k]) nn[k] = n[k].slice(); });
  if (n.mesh != null) nn.mesh = copyMesh(n.mesh);
  const id = out.nodes.push(nn) - 1;
  if (n.children && n.children.length) nn.children = n.children.map(copyNode);
  return id;
}

// find each wanted name anywhere in the tree, and take that node with its kids
const byName = new Map();
J.nodes.forEach((n, i) => { if (n.name && !byName.has(n.name)) byName.set(n.name, i); });
const missing = [];
WANT.forEach(name => {
  if (!byName.has(name)) { missing.push(name); return; }
  out.scenes[0].nodes.push(copyNode(byName.get(name)));
});
if (missing.length) { console.error("NOT IN THE LIBRARY: " + missing.join(", ")); process.exit(2); }

// ---- write it back out ----
const bin = Buffer.concat(chunks);
out.buffers.push({ byteLength: bin.length });
if (!out.materials.length) delete out.materials;
const jsonBuf = Buffer.from(JSON.stringify(out), "utf8");
const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
const binPad = (4 - (bin.length % 4)) % 4;
const total = 12 + 8 + jsonBuf.length + jsonPad + 8 + bin.length + binPad;
const head = Buffer.alloc(12);
head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
const jh = Buffer.alloc(8);
jh.writeUInt32LE(jsonBuf.length + jsonPad, 0); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8);
bh.writeUInt32LE(bin.length + binPad, 0); bh.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(OUT, Buffer.concat([
  head, jh, jsonBuf, Buffer.alloc(jsonPad, 0x20), bh, bin, Buffer.alloc(binPad)
]));

const tris = out.accessors.reduce((n, a, i) =>
  n + (out.meshes.some(m => m.primitives.some(p => p.indices === i)) ? a.count / 3 : 0), 0);
console.log("wrote " + OUT + "  " + WANT.length + " animals, " +
  Math.round(tris) + " tris, " + (bin.length / 1024).toFixed(1) + "KB binary");
