// /api/_lessonmap.js
// -------------------------------------------------------------
// Reads the lesson map (public/lessons/index.json) from inside a serverless
// function (Session LS3).
//
// WHY THIS IS NOT JUST readFileSync: a Vercel serverless function only ships the
// files its code traces, and `public/` is served by the static layer, so it is
// not guaranteed to be on the function's disk. So: try disk first (fast, free,
// works locally and in QA), and if it is not there, fetch it over HTTP from the
// very same deployment using VERCEL_URL. Cached in module scope, so a warm
// function reads it once.
//
// Both api/generate-lessons.js and api/lesson-map.js use this, which means the
// factory and the live map can never disagree about what the map says.
// -------------------------------------------------------------
import fs from "fs";
import path from "path";

let CACHE = null;

function fromDisk() {
  const tries = [
    path.join(process.cwd(), "public", "lessons", "index.json"),
    path.join(process.cwd(), "lessons", "index.json"),
    // Vercel unbundles functions under /var/task; keep a relative try too.
    path.join(process.cwd(), "..", "public", "lessons", "index.json"),
  ];
  for (const p of tries) {
    try {
      const j = JSON.parse(fs.readFileSync(p, "utf8"));
      if (j && j.paths) return j;
    } catch {}
  }
  return null;
}

async function overHttp() {
  const host = process.env.VERCEL_URL || process.env.NEXT_PUBLIC_SITE_HOST || "";
  if (!host) return null;
  const base = host.startsWith("http") ? host : `https://${host}`;
  try {
    const r = await fetch(`${base}/lessons/index.json`, { headers: { "cache-control": "no-cache" } });
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.paths ? j : null;
  } catch { return null; }
}

// Returns the parsed map, or null if it truly cannot be read. Callers must
// handle null by failing soft - never by serving an empty map.
export async function readLessonMap() {
  if (CACHE) return JSON.parse(JSON.stringify(CACHE));
  const j = fromDisk() || (await overHttp());
  if (j) CACHE = j;
  return j ? JSON.parse(JSON.stringify(j)) : null;
}

// Session LS4: the same disk-then-HTTP dance for ONE lesson that ships as a
// FILE (LS1's g1-making-ten.json). api/placement.js needs a question out of it,
// and public/ has the same "not guaranteed on the function's disk" problem the
// map has. Returns null rather than throwing; callers skip that lesson.
const FILE_CACHE = {};
export async function readLessonFile(file) {
  // The map stores the file WITHOUT its extension ("g1-making-ten"), the same
  // way the player builds "/lessons/" + file + ".json". Accept either form.
  const clean = String(file || "").replace(/[^A-Za-z0-9_.-]/g, "");
  const name = !clean ? "" : (/\.json$/.test(clean) ? clean : clean + ".json");
  if (!name || name === ".json") return null;
  if (FILE_CACHE[name] !== undefined) return FILE_CACHE[name];

  const tries = [
    path.join(process.cwd(), "public", "lessons", name),
    path.join(process.cwd(), "lessons", name),
    path.join(process.cwd(), "..", "public", "lessons", name),
  ];
  for (const p of tries) {
    try {
      const j = JSON.parse(fs.readFileSync(p, "utf8"));
      if (j && j.check) { FILE_CACHE[name] = j; return j; }
    } catch {}
  }

  const host = process.env.VERCEL_URL || process.env.NEXT_PUBLIC_SITE_HOST || "";
  if (host) {
    const base = host.startsWith("http") ? host : `https://${host}`;
    try {
      const r = await fetch(`${base}/lessons/${name}`, { headers: { "cache-control": "no-cache" } });
      if (r.ok) {
        const j = await r.json();
        if (j && j.check) { FILE_CACHE[name] = j; return j; }
      }
    } catch {}
  }
  FILE_CACHE[name] = null;
  return null;
}

export default { readLessonMap, readLessonFile };
