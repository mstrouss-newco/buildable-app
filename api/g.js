// /api/g.js — Session CB1: SERVES the share viewer for a kid-made game.
//
// /g/<slug> routes here (vercel.json) rather than straight to public/g.html for
// one reason: OPEN GRAPH TAGS HAVE TO BE IN THE HTML THE SERVER SENDS. A group
// chat, iMessage or WhatsApp never runs the page's JavaScript — it reads the
// bytes, finds og:title / og:image, and draws the card. A client-rendered viewer
// previews as a blank Buildable link, which is the whole point of sharing a
// kid's game missed.
//
// So this function:
//   1. reads the row (and counts the play — this IS the open),
//   2. reads public/g.html (disk first, then over HTTP from this same
//      deployment — the api/_lessonmap.js pattern, because public/ is not
//      guaranteed to be on a function's disk),
//   3. injects the tags plus window.BK_KID_GAME so the page paints instantly,
//   4. sends it.
//
// If anything goes wrong it still sends the page — unfurled or not, the guest
// gets a working viewer that fetches the row itself.
import fs from "fs";
import path from "path";

const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const ENGINE_ART = { breaker: "breaker", sling: "sling", castleguard: "castleguard", skyflyer: "skyflyer" };
const SITE = "https://buildablekids.com";

function esc(s) { return String(s == null ? "" : s).replace(/[<>&"]/g, (m) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[m])); }

let PAGE = null;
async function readPage() {
  if (PAGE) return PAGE;
  const tries = [
    path.join(process.cwd(), "public", "g.html"),
    path.join(process.cwd(), "g.html"),
    path.join(process.cwd(), "..", "public", "g.html"),
  ];
  for (const p of tries) { try { const s = fs.readFileSync(p, "utf8"); if (s.includes("BK_HEAD")) { PAGE = s; return s; } } catch {} }
  const host = process.env.VERCEL_URL || process.env.NEXT_PUBLIC_SITE_HOST || "";
  if (!host) return null;
  const base = host.startsWith("http") ? host : `https://${host}`;
  try {
    const r = await fetch(`${base}/g.html`, { headers: { "cache-control": "no-cache" } });
    if (!r.ok) return null;
    const s = await r.text();
    if (s.includes("BK_HEAD")) { PAGE = s; return s; }
  } catch {}
  return null;
}

// Same rule as g.html's coverUrl: a URL, a shared-studio asset, or the engine's
// own key art so a link is never a blank card.
function coverUrl(game) {
  const c = (game && game.cover) || "";
  if (/^https?:/.test(c)) return c;
  if (/^\//.test(c)) return SITE + c;
  if (c.startsWith("studio:")) return SITE + "/api/asset-studio?asset=" + encodeURIComponent(c.slice(7));
  if (c) return SITE + "/api/asset-studio?asset=" + encodeURIComponent(c);
  return SITE + "/api/images?kind=game&id=" + encodeURIComponent(ENGINE_ART[game && game.engine] || "breaker");
}

async function loadGame(id) {
  if (!URL_ || !KEY) return null;
  try {
    const cols = "id,engine,name,kid_name,grownup_name,cover,manifest,source_game,layer,plays,cleared,shared,public,created_at";
    const r = await fetch(`${URL_}/rest/v1/kid_games?id=eq.${encodeURIComponent(id)}&deleted_at=is.null&select=${cols}&limit=1`, { headers: H });
    if (!r.ok) return null;
    const rows = await r.json();
    const g = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!g) return null;
    // Counting the open here (not in the page) keeps one visit to one play: the
    // engine's loader is told kgplay=0 by g.html.
    fetch(`${URL_}/rest/v1/kid_games?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: H, body: JSON.stringify({ plays: (g.plays || 0) + 1 }) }).catch(() => {});
    g.plays = (g.plays || 0) + 1;
    return g;
  } catch { return null; }
}

export default async function handler(req, res) {
  const qs = String(req.url || "").split("?")[1] || "";
  const id = (new URLSearchParams(qs).get("id") || "").trim();
  const page = await readPage();
  if (!page) { res.status(500).setHeader("Content-Type", "text/plain; charset=utf-8"); return res.end("The viewer page could not be read."); }

  const game = /^[A-Za-z0-9][A-Za-z0-9-]{1,63}$/.test(id) ? await loadGame(id) : null;

  let head;
  if (game) {
    const title = `${game.name || "A kid-made game"} by ${game.kid_name || "a kid"}`;
    const by = [game.kid_name, game.grownup_name].filter(Boolean).join(" and ");
    const desc = by ? `Made by ${by} on Buildable Kids. Free to play, no account needed.`
                    : "Made on Buildable Kids. Free to play, no account needed.";
    const img = coverUrl(game);
    head = [
      `<title>${esc(title)} — Buildable Kids</title>`,
      `<meta name="description" content="${esc(desc)}">`,
      `<meta property="og:type" content="website">`,
      `<meta property="og:title" content="${esc(title)}">`,
      `<meta property="og:description" content="${esc(desc)}">`,
      `<meta property="og:image" content="${esc(img)}">`,
      `<meta property="og:url" content="${SITE}/g/${esc(game.id)}">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="twitter:title" content="${esc(title)}">`,
      `<meta name="twitter:description" content="${esc(desc)}">`,
      `<meta name="twitter:image" content="${esc(img)}">`,
      `<script>window.BK_KID_GAME=${JSON.stringify(game).replace(/</g, "\\u003c")}</script>`,
    ].join("\n");
  } else {
    head = [
      `<title>A kid-made game — Buildable Kids</title>`,
      `<meta name="description" content="Games kids build with a grown-up, in an afternoon. No coding, no ads, ever.">`,
      `<meta property="og:title" content="A kid-made game on Buildable Kids">`,
      `<meta property="og:description" content="Games kids build with a grown-up, in an afternoon. No coding, no ads, ever.">`,
      `<meta property="og:image" content="${SITE}/api/images?kind=game&id=skyflyer">`,
    ].join("\n");
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // Short public cache so an unfurl bot and the tap that follows are cheap, but a
  // renamed game shows its new title within the minute.
  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=600");
  return res.status(200).end(page.replace("<!--BK_HEAD-->", head));
}
