// /api/list-songs.js
// Returns the saved songs for one kid/parent profile (by device_id), newest first.
// Read-only. Used by the kid-facing "My Songs" library and by games that want to
// reuse a previously created track.
// NOTE: this used to hard-cap the list at 10, left over from before the save-side
// cap was lifted (see save-song.js). That meant anything past a kid's 10 most
// recent songs was saved fine but never showed up in their library. Raised to
// match so older songs aren't stranded.

import { songCover } from "./_thumbs.js";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function sb(path) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
  });
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(200).json({ configured: false, songs: [], count: 0, max: 100000 });
  }

  const deviceId = (req.query.deviceId || req.query.device_id || "").toString().trim();
  const kidProfileId = (req.query.kidProfileId || req.query.kid_profile_id || "").toString().trim();
  // When a kid is signed in under a parent, list by kid_profile_id so songs
  // follow the child across devices. Otherwise fall back to the device lane.
  if (!deviceId && !kidProfileId) {
    return res.status(400).json({ error: "deviceId or kidProfileId is required" });
  }

  try {
    const baseCols = "song_id,title,prompt,vibe,theme,audio_url,cover_color,duration_sec,provider,created_at,meta";
    const tail = "&order=created_at.desc&limit=200";
    const fetchLane = async (filter) => {
      let r = await sb("saved_songs?" + filter + "&select=" + baseCols + ",published,play_count,heart_count" + tail);
      // pre-migration fallback: publishing columns may not exist yet
      if (!r.ok) r = await sb("saved_songs?" + filter + "&select=" + baseCols + tail);
      return r;
    };
    const kidFilter = kidProfileId ? "kid_profile_id=eq." + encodeURIComponent(kidProfileId) : null;
    const deviceFilter = deviceId ? "device_id=eq." + encodeURIComponent(deviceId) : null;

    let lane = kidProfileId ? "kid" : "device";
    let r = await fetchLane(kidFilter || deviceFilter);
    if (!r.ok) {
      const detail = await r.text();
      return res.status(502).json({ error: "list failed", status: r.status, detail: detail.slice(0, 300) });
    }
    let songs = await r.json();

    // NOTHING A KID MADE MAY VANISH. A song written before this child had a real
    // profile row sits on the DEVICE lane with kid_profile_id null, so asking by
    // kid alone answered "you have no songs" for songs that were right there.
    // When the kid lane comes back empty, look on the device lane before giving
    // up. Only when it is empty, so a child with songs of their own never has a
    // sibling's list pushed in on top.
    if (kidFilter && deviceFilter && Array.isArray(songs) && songs.length === 0) {
      const rd = await fetchLane(deviceFilter);
      if (rd.ok) {
        const deviceSongs = await rd.json();
        if (Array.isArray(deviceSongs) && deviceSongs.length) { songs = deviceSongs; lane = "device"; }
      }
    }
    if (Array.isArray(songs)) songs = songs.map((row) => ({
      ...row,
      // MM2 — surface the saved album cover (meta.coverUrl, or a real cover_url
      // column once the optional migration is run) so shelves show real art.
      cover_url: row.cover_url || (row.meta && row.meta.coverUrl) || null,
      thumbnail: songCover(row.vibe, row.theme),
    }));
    return res.status(200).json({
      configured: true,
      songs: Array.isArray(songs) ? songs : [],
      count: Array.isArray(songs) ? songs.length : 0,
      max: 100000,
      lane, // "kid" or "device" -- which lane these rows actually came from
    });
  } catch (e) {
    return res.status(500).json({ error: "server error", detail: String(e && e.message || e).slice(0, 200) });
  }
}
