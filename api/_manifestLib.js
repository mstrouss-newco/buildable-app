// /api/_manifestLib.js
// -------------------------------------------------------------
// Runs the SHARED manifest loader (public/buildable-manifest.js) inside a
// serverless function, so the server validates a kid's game with EXACTLY the
// same code the browser and the QA robots use — universal fields plus the
// engine's own level profile (breaker layouts, sling layouts, croc stages...).
//
// WHY NOT `import`: buildable-manifest.js is a browser IIFE served from public/,
// and a Vercel function only ships the files its code traces. So it follows the
// api/_lessonmap.js pattern: read it off disk if it is there, otherwise fetch it
// over HTTP from this very deployment, then run it in a vm sandbox. Cached in
// module scope, so a warm function compiles it once.
//
// There is deliberately NO fallback validator here. If the shared file cannot be
// read, a save is REFUSED rather than stored unchecked — storing junk is the one
// thing api/kid-game.js exists to prevent.
// -------------------------------------------------------------
import fs from "fs";
import path from "path";
import vm from "vm";

let CACHE = null;

function fromDisk() {
  const tries = [
    path.join(process.cwd(), "public", "buildable-manifest.js"),
    path.join(process.cwd(), "buildable-manifest.js"),
    path.join(process.cwd(), "..", "public", "buildable-manifest.js"),
  ];
  for (const p of tries) {
    try { const src = fs.readFileSync(p, "utf8"); if (src && src.includes("BuildableManifest")) return src; } catch {}
  }
  return null;
}

async function overHttp() {
  const host = process.env.VERCEL_URL || process.env.NEXT_PUBLIC_SITE_HOST || "";
  if (!host) return null;
  const base = host.startsWith("http") ? host : `https://${host}`;
  try {
    const r = await fetch(`${base}/buildable-manifest.js`, { headers: { "cache-control": "no-cache" } });
    if (!r.ok) return null;
    const src = await r.text();
    return src && src.includes("BuildableManifest") ? src : null;
  } catch { return null; }
}

// Returns { validate, toEngineConfig, landingKind, ... } or null if the shared
// file truly cannot be read. Callers MUST treat null as "refuse", never as "ok".
export async function manifestLib() {
  if (CACHE) return CACHE;
  const src = fromDisk() || (await overHttp());
  if (!src) return null;
  try {
    // No fetch, no document: the loader's browser-only `load()` bails out on its
    // own when fetch is missing, and everything we use here is pure.
    const sandbox = { window: {}, console };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox, { filename: "buildable-manifest.js" });
    const api = sandbox.window && sandbox.window.BuildableManifest;
    if (!api || typeof api.validate !== "function") return null;
    CACHE = api;
    return api;
  } catch { return null; }
}
