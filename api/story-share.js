// /api/story-share.js
// Serves a short /s/:id share link with a RICH link preview: it injects
// og:title (the story's title) and og:image (the cover art) into the public
// viewer (public/story.html) so iMessage / WhatsApp / social show a real card
// (title + picture) instead of a generic grey box. The page then renders the
// exact same read-only book, so there is one source of truth for the viewer.
// Read-only, service key, no auth — same shape as api/shared-story.js
// (the story_id is unguessable).
import { thumbForWorld } from "./_thumbs.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export default async function handler(req, res) {
  const id = (req.query && req.query.id ? String(req.query.id) : "").trim();
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0];
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  const origin = host ? proto + "://" + host : "";

  // Sensible defaults so even a bad/expired id still yields a valid, friendly page
  // (story.html shows its own "make your own" screen when the story is missing).
  let title = "A story made on Buildable Kids";
  let coverAbs = origin + "/apple-touch-icon.png?v=4";

  try {
    if (id && SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      const url = SUPABASE_URL + "/rest/v1/saved_stories?story_id=eq." +
        encodeURIComponent(id) + "&select=title,world,story&limit=1";
      const r = await fetch(url, { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: "Bearer " + SUPABASE_SERVICE_KEY } });
      if (r.ok) {
        const rows = await r.json();
        const row = Array.isArray(rows) ? rows[0] : null;
        if (row) {
          if (row.title) title = String(row.title);
          const pages = row.story && Array.isArray(row.story.pages) ? row.story.pages : [];
          const art = pages[0] && pages[0].art_url;
          if (art && /^https?:\/\//.test(art)) {
            coverAbs = art; // the painted cover, if it's a hosted image
          } else {
            const t = thumbForWorld(row.world || (row.story && row.story.start_world));
            if (t) coverAbs = /^https?:\/\//.test(t) ? t : origin + t;
          }
        }
      }
    }
  } catch {}

  // Pull the real viewer and inject fresh preview tags into it.
  let html = "";
  try {
    const vr = await fetch(origin + "/story.html", { headers: { "user-agent": "buildable-share" } });
    html = await vr.text();
  } catch {}

  // If the viewer can't be fetched, fall back to the plain querystring viewer so
  // the link still opens the book (just without the rich preview).
  if (!html || html.indexOf("</head>") === -1) {
    res.statusCode = 302;
    res.setHeader("Location", "/story.html?id=" + encodeURIComponent(id));
    return res.end();
  }

  const desc = "Read this picture book a kid made — then make your own, free.";
  const tags = [
    "<title>" + esc(title) + "</title>",
    '<meta property="og:type" content="website" />',
    '<meta property="og:title" content="' + esc(title) + '" />',
    '<meta property="og:description" content="' + esc(desc) + '" />',
    '<meta property="og:image" content="' + esc(coverAbs) + '" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    '<meta name="twitter:title" content="' + esc(title) + '" />',
    '<meta name="twitter:image" content="' + esc(coverAbs) + '" />',
  ].join("\n");

  // Drop the viewer's generic <title> + og:* tags, then inject ours before </head>.
  html = html
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta\s+property="og:[^>]*>\s*/gi, "")
    .replace(/<\/head>/i, tags + "\n</head>");

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600");
  return res.status(200).send(html);
}
