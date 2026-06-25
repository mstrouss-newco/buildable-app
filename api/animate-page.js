// /api/animate-page.js
// PROTOTYPE: turn a still story-page image into a short looping video ("living
// page") via fal.ai image-to-video. Submit -> poll -> return the clip URL, cached.
//   POST { imageUrl, prompt? }  -> { ok, videoUrl } (or { configured:false })
//   GET                         -> { hasFal } (safe diagnostic)
//   GET ?probe=submit           -> submits a tiny test job, returns acceptance/error
//   GET ?probe=check&id=<id>    -> polls that job, returns video url when ready
// Env (owner, by name only): FAL_KEY  (required), FAL_VIDEO_MODEL (optional).
import crypto from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const MODEL = process.env.FAL_VIDEO_MODEL || "fal-ai/ltx-video/image-to-video";
const MOTION = "very gentle, subtle ambient motion only — soft breathing, slight sway, drifting particles, shimmering light; keep the character and scene stable and on-model; smooth seamless loop; no big movements, no warping";

async function cacheGet(key) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  try { const r = await fetch(`${SUPABASE_URL}/rest/v1/narration_cache?cache_key=eq.${key}&select=audio_b64&limit=1`, { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }); if (!r.ok) return null; const rows = await r.json(); return Array.isArray(rows) && rows[0] ? rows[0].audio_b64 : null; } catch { return null; }
}
async function cachePut(key, val) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try { await fetch(`${SUPABASE_URL}/rest/v1/narration_cache`, { method: "POST", headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ cache_key: key, audio_b64: val, word_timings: null }) }); } catch {}
}
function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((resolve) => { let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch { resolve({}); } }); });
}
async function falSubmit(model, input) {
  const r = await fetch("https://queue.fal.run/" + model, { method: "POST", headers: { Authorization: "Key " + process.env.FAL_KEY, "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const t = await r.text();
  let j = {}; try { j = JSON.parse(t); } catch {}
  return { ok: r.ok, status: r.status, body: j, raw: t };
}
async function falPoll(statusUrl, responseUrl) {
  // Use the exact URLs fal returns on submit (correct for nested model paths).
  for (let i = 0; i < 100; i++) {
    const sr = await fetch(statusUrl, { headers: { Authorization: "Key " + process.env.FAL_KEY } });
    const sj = await sr.json().catch(() => ({}));
    if (sj.status === "COMPLETED") {
      const rr = await fetch(responseUrl, { headers: { Authorization: "Key " + process.env.FAL_KEY } });
      return await rr.json().catch(() => ({}));
    }
    if (sj.status && sj.status !== "IN_QUEUE" && sj.status !== "IN_PROGRESS") return { error: "bad_status", status: sj.status, detail: sj.error };
    await new Promise((res) => setTimeout(res, 2500));
  }
  return { error: "timeout" };
}
function videoUrlFrom(result) {
  if (!result) return null;
  if (result.video && result.video.url) return result.video.url;
  if (result.video_url) return result.video_url;
  if (Array.isArray(result.videos) && result.videos[0] && result.videos[0].url) return result.videos[0].url;
  if (typeof result.url === "string") return result.url;
  return null;
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    if (!process.env.FAL_KEY) return res.status(200).json({ ok: true, hasFal: false });
    if (req.query.probe === "submit") {
      const m = (req.query.model || MODEL).toString();
      const img = (req.query.image || "https://picsum.photos/seed/bk/768/512").toString();
      const sub = await falSubmit(m, { image_url: img, prompt: MOTION });
      return res.status(200).json({ ok: true, model: m, accepted: sub.ok, status: sub.status, request_id: sub.body && sub.body.request_id, error: sub.ok ? undefined : sub.raw.slice(0, 220) });
    }
    if (req.query.probe === "check" && req.query.id) {
      const base = "https://queue.fal.run/" + (req.query.model || MODEL).toString().split("/").slice(0, 2).join("/") + "/requests/" + req.query.id.toString();
      const sr = await fetch(base + "/status", { headers: { Authorization: "Key " + process.env.FAL_KEY } });
      const sj = await sr.json().catch(() => ({}));
      if (sj.status !== "COMPLETED") return res.status(200).json({ ok: true, status: sj.status || "unknown", queue_position: sj.queue_position });
      const rr = await fetch(base, { headers: { Authorization: "Key " + process.env.FAL_KEY } });
      const result = await rr.json().catch(() => ({}));
      return res.status(200).json({ ok: true, status: "COMPLETED", videoUrl: videoUrlFrom(result), result_keys: Object.keys(result || {}) });
    }
    if (req.query.probe === "poll" && req.query.s) {
      const sr = await fetch(req.query.s.toString(), { headers: { Authorization: "Key " + process.env.FAL_KEY } });
      const sj = await sr.json().catch(() => ({}));
      if (sj.status !== "COMPLETED") return res.status(200).json({ ok: true, status: sj.status || "unknown", queue_position: sj.queue_position });
      const rr = await fetch((req.query.r || "").toString(), { headers: { Authorization: "Key " + process.env.FAL_KEY } });
      const result = await rr.json().catch(() => ({}));
      return res.status(200).json({ ok: true, status: "COMPLETED", videoUrl: videoUrlFrom(result), result_keys: Object.keys(result || {}) });
    }
    return res.status(200).json({ ok: true, hasFal: true, model: MODEL });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.FAL_KEY) return res.status(200).json({ ok: true, configured: false });

  const body = await readBody(req);
  const imageUrl = (body.imageUrl || "").toString();
  if (!imageUrl) return res.status(400).json({ error: "imageUrl required" });
  const prompt = (body.prompt || MOTION).toString();
  const model = (body.model || MODEL).toString();
  const key = "vid:" + crypto.createHash("sha1").update((body.cacheKey || imageUrl) + "|" + model).digest("hex");
  const hit = await cacheGet(key);
  if (hit) return res.status(200).json({ ok: true, videoUrl: hit, cached: true });

  try {
    const sub = await falSubmit(model, { image_url: imageUrl, prompt });
    if (!sub.ok || !(sub.body && sub.body.status_url)) return res.status(200).json({ ok: true, configured: true, failed: true, status: sub.status, detail: sub.raw.slice(0, 200) });
    if (body.submitOnly) return res.status(200).json({ ok: true, submitted: true, model, request_id: sub.body.request_id });
    const result = await falPoll(sub.body.status_url, sub.body.response_url);
    const url = videoUrlFrom(result);
    if (!url) return res.status(200).json({ ok: true, configured: true, failed: true, detail: (result && (result.error || JSON.stringify(result).slice(0, 200))) });
    await cachePut(key, url);
    return res.status(200).json({ ok: true, videoUrl: url });
  } catch (e) {
    return res.status(200).json({ ok: true, configured: true, failed: true, detail: String((e && e.message) || e).slice(0, 160) });
  }
}
