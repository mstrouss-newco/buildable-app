// /api/forge.js — SERVING A FORGED CARTRIDGE (Session CB5).
//
//   /forge/<id>  ->  the one HTML file layer three wrote, inside a sandbox.
//
// This is the only route that ever hands a browser something a model wrote, so
// it is the narrowest thing in the repo:
//
//   * a strict Content-Security-Policy with `default-src 'none'` — the page may
//     run its own inline code and load OUR scripts and images, and it may do
//     nothing else. `connect-src 'none'` means fetch, XHR and WebSocket are dead
//     at the browser level, not merely refused by the static check;
//   * the manifest is INJECTED as window.GAME_CONFIG before the cartridge runs,
//     so the game never asks for one and cannot be pointed at another;
//   * only a row with status 'ready' or 'promoted' is served: a cartridge that
//     failed its gate is a roadmap note, never a page;
//   * the shell embeds it with sandbox="allow-scripts", so even a bug in our own
//     CSP leaves it in a unique origin with no storage and no same-origin reach.
//
// It is served from the database rather than from disk on purpose (see
// db/create-forge-cartridges.sql): a game a child made at bedtime cannot wait
// for a deploy, and nothing a model wrote belongs in the repo until a person has
// read it.
import { manifestLib } from "./_manifestLib.js";

const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const enc = encodeURIComponent;
const validSlug = (s) => /^[a-z0-9][a-z0-9-]{1,63}$/.test(String(s || ""));

const CSP = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "frame-ancestors 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function page(title, line) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${title}</title><style>
html,body{margin:0;height:100%;background:radial-gradient(circle at 50% 18%,#2b2456,#14122b 70%);color:#fff;
 font-family:'Nunito',system-ui,-apple-system,sans-serif;display:grid;place-items:center;text-align:center;padding:24px}
h1{font-size:clamp(20px,6vw,30px);font-weight:900;margin:0 0 8px} p{color:#B9AEEA;font-size:15px;margin:0;max-width:30ch;line-height:1.5}
</style></head><body><div><h1>${title}</h1><p>${line}</p></div></body></html>`;
}

// The bootstrap the cartridge wakes up inside. Everything it is allowed to know
// about the world arrives here, and nothing it posts upward is trusted by the
// shell beyond the contract messages.
function boot(cfg, row) {
  const j = (v) => JSON.stringify(v).replace(/</g, "\\u003c");
  return `<script>
window.GAME_CONFIG = ${j(cfg)};
window.BK_FORGE = ${j({ id: row.id, name: row.name || "My game", kid: row.kid_name || null, grownup: row.grownup_name || null, learning: true })};
// CB5 — a forged game is BUDDY IS STILL LEARNING THIS ONE. The label is drawn by
// the shell, not by the cartridge, so a game cannot hide that it is an early one.
try { window.parent.postMessage({ source: "buildable", kind: "forge:hello", id: ${j(row.id)} }, "*"); } catch (e) {}
</script>`;
}

export default async function handler(req, res) {
  const qs = new URLSearchParams(String(req.url || "").split("?")[1] || "");
  const id = String(qs.get("id") || "").trim();
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=(), usb=()");

  if (!validSlug(id)) return res.status(404).send(page("That game is not here", "Check the link and try again."));
  if (!URL_ || !KEY) return res.status(503).send(page("One moment", "The workshop is not answering just now."));

  let row = null;
  try {
    const r = await fetch(`${URL_}/rest/v1/forge_cartridges?id=eq.${enc(id)}&select=*&limit=1`, { headers: H });
    const j = r.ok ? await r.json() : null;
    row = (Array.isArray(j) && j[0]) || null;
  } catch { row = null; }

  if (!row || !row.html || (row.status !== "ready" && row.status !== "promoted")) {
    // A game still being written and a game that never passed look the same from
    // outside, the same way an unshared game and a missing one do in /g/.
    return res.status(404).send(page("That game is not ready", "Buddy is still learning this one. Try again in a little while."));
  }

  // The manifest becomes engine config HERE, with the shared loader, so a forged
  // game gets exactly what a shipped engine gets and never parses a manifest.
  let cfg = { levels: [] };
  try {
    const lib = await manifestLib();
    if (lib && row.manifest) cfg = lib.toEngineConfig(row.manifest);
  } catch { cfg = { levels: (row.manifest && row.manifest.levels) || [] }; }

  // Opening it is a play. Same rule as a kid game: the /studio preview passes
  // play=0 so watching it build is not counted as playing it.
  if (qs.get("play") !== "0") {
    try {
      await fetch(`${URL_}/rest/v1/forge_cartridges?id=eq.${enc(id)}`, { method: "PATCH",
        headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ plays: (row.plays || 0) + 1 }) });
    } catch {}
  }

  const html = String(row.html);
  // The bootstrap goes in before anything the cartridge runs: straight after
  // <head> when there is one, otherwise at the very top.
  const out = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + boot(cfg, row)) : boot(cfg, row) + html;
  return res.status(200).send(out);
}
