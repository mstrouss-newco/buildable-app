// /api/list-stories.js — saved stories for one profile (by kid_profile_id when
// signed in, else device_id), newest first. Read-only, service key. Mirrors
// list-songs.js. Omits the big story JSON unless ?storyId=ID asks for one full story.
import { thumbForWorld } from "./_thumbs.js";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
function sb(path) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json" },
  });
}
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(200).json({ configured: false, stories: [], count: 0, max: 20 });

  const deviceId = (req.query.deviceId || "").toString().trim();
  const kidProfileId = (req.query.kidProfileId || "").toString().trim();
  const storyId = (req.query.storyId || "").toString().trim();
  if (!deviceId && !kidProfileId && !storyId) return res.status(400).json({ error: "deviceId or kidProfileId is required" });

  try {
    if (storyId) {
      const r = await sb("saved_stories?story_id=eq." + encodeURIComponent(storyId) + "&select=story_id,title,world,cover_color,story,created_at&limit=1");
      const rows = await r.json();
      return res.status(200).json({ ok: true, story: Array.isArray(rows) ? rows[0] || null : null });
    }
    const safeCols = "story_id,title,world,cover_color,created_at";
    // first-page art as cover, plus series info so My stories can show a "Chapter N" ribbon
    const baseCols = safeCols + ",cover_art:story->pages->0->>art_url,chapter:story->>chapter,series_id:story->>series_id";
    const fetchLane = async (filter) => {
      let r = await sb("saved_stories?" + filter + "&select=" + baseCols + ",published,play_count,heart_count&order=created_at.desc&limit=20");
      if (!r.ok) r = await sb("saved_stories?" + filter + "&select=" + baseCols + "&order=created_at.desc&limit=20");
      if (!r.ok) r = await sb("saved_stories?" + filter + "&select=" + safeCols + "&order=created_at.desc&limit=20"); // last resort: no cover_art
      return r;
    };
    const kidFilter = kidProfileId ? "kid_profile_id=eq." + encodeURIComponent(kidProfileId) : null;
    const deviceFilter = deviceId ? "device_id=eq." + encodeURIComponent(deviceId) : null;

    let lane = kidProfileId ? "kid" : "device";
    let r = await fetchLane(kidFilter || deviceFilter);
    if (!r.ok) { const detail = await r.text(); return res.status(502).json({ error: "list failed", status: r.status, detail: detail.slice(0, 300) }); }
    let stories = await r.json();

    // NOTHING A KID MADE MAY VANISH. A story saved before this child had a real
    // profile row sits on the DEVICE lane with kid_profile_id null. When the kid
    // lane is empty, look on the device lane before giving up -- only when it is
    // empty, so a child with stories of their own never has a sibling's list
    // pushed in on top.
    if (kidFilter && deviceFilter && Array.isArray(stories) && stories.length === 0) {
      const rd = await fetchLane(deviceFilter);
      if (rd.ok) {
        const deviceStories = await rd.json();
        if (Array.isArray(deviceStories) && deviceStories.length) { stories = deviceStories; lane = "device"; }
      }
    }
    if (Array.isArray(stories)) stories = stories.map((row) => ({
      ...row,
      // prefer the story's own first-page art, but never ship a heavy embedded
      // (data:) image into a list — fall back to lightweight world art for those.
      thumbnail: (row.cover_art && !String(row.cover_art).startsWith("data:")) ? row.cover_art : (thumbForWorld(row.world) || null),
      cover_art: undefined,
    }));
    return res.status(200).json({ ok: true, configured: true, stories: Array.isArray(stories) ? stories : [], count: Array.isArray(stories) ? stories.length : 0, max: 20, lane });
  } catch (e) {
    return res.status(500).json({ error: "server error", detail: String((e && e.message) || e).slice(0, 200) });
  }
}
