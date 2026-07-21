// /src/StoryReader.jsx  (v2 — LIBRARY model)
// The "living picture book". Each page = a reusable library WORLD background + the
// hero's matching EXPRESSION cutout (by the page's emotion), layered with motion via
// <LayeredPage>. No per-page art generation, so pages appear instantly and a story
// costs ~$0. Read-aloud highlights words in time (ElevenLabs if configured, else the
// browser's built-in speech).
import { useState, useEffect, useRef } from "react";
import { LayeredPage, SceneStage } from "./lib/storyEffects";
import { shareCreation } from "./lib/shareSheet";
import { logSkillEvent } from "./lib/gameLog";

// Small coin reward for finding all the hidden stars in a story (feature ST3).
const STAR_REWARD_COINS = 20;
function awardCoins(key, n) { try { return (typeof window !== "undefined" && window.BuildableWallet) ? window.BuildableWallet.awardOnce(key, n) : 0; } catch (e) { return 0; } }

const FRED = "'Fredoka', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const NUN = "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const PAGE_BG =
  "radial-gradient(circle at 12% -10%, rgba(155,126,221,0.28), transparent 42%)," +
  "radial-gradient(circle at 88% 112%, rgba(214,90,123,0.24), transparent 42%),#0a0a14";

const WORLD_PALETTE = {
  "snowy-village": ["#2b3a55", "#5d7a9e"], "coral-reef": ["#0d3b53", "#1f8aa6"],
  "enchanted-forest": ["#1f3d2f", "#4a7a55"], "dragon-mountain": ["#5a3a2a", "#a86a4a"],
  "dino-jungle": ["#22401f", "#5a8a3a"], "space-station": ["#1b1240", "#5b3a86"],
  "desert-oasis": ["#6b4a1f", "#caa05a"], "candy-land": ["#7a2f5f", "#d4789e"],
};

function libImg(kind, slug, style, emo) {
  return "/api/story-library?img=" + kind + ":" + slug + "&style=" + (style || "watercolor") + (emo ? "&emo=" + emo : "");
}
function wordsOf(text) { return (text || "").trim().split(/\s+/).filter(Boolean); }
// Voice palette (ElevenLabs pre-made voices). Speaker -> voice is assigned per
// story (not bound to a character forever).
const NARRATOR_VOICE = "21m00Tcm4TlvDq8ikWAM"; // Rachel — warm narrator
const VOICE_POOL = ["EXAVITQu4vr4xnSDxMaL", "MF3mGyEYCl7XYWbV9V6O", "ErXwobaYiN019PkySvjV", "TxGEqnHWrfWFTfGW9XjX"]; // Bella, Elli, Antoni, Josh
function hashStr(t){ let h=0; t=String(t||""); for(let i=0;i<t.length;i++){ h=(h*31+t.charCodeAt(i))|0; } return Math.abs(h); }
// Split a page's prose into spoken parts: narration + quoted dialogue, attributing
// each quote to the hero/friend by the name nearest it. No LLM call — instant.
function parseLines(text, heroName, friendName) {
  if (!text) return [];
  const hero = String(heroName || "").split(" ")[0].toLowerCase();
  const friend = String(friendName || "").split(" ")[0].toLowerCase();
  const matches = [...text.matchAll(/[\u201c\u201d"]([^\u201c\u201d"]+)[\u201c\u201d"]/g)];
  if (!matches.length) return [{ who: "narrator", say: text }];
  const out = []; let cursor = 0;
  for (const mm of matches) {
    const start = mm.index, end = start + mm[0].length;
    const before = text.slice(cursor, start).trim();
    if (before) out.push({ who: "narrator", say: before });
    const say = (mm[1] || "").trim();
    const ctx = (text.slice(Math.max(0, start - 55), start) + " " + text.slice(end, end + 55)).toLowerCase();
    const hi = hero ? ctx.indexOf(hero) : -1, fi = friend ? ctx.indexOf(friend) : -1;
    let who = "other";
    if (hi >= 0 && (fi < 0 || hi <= fi)) who = "hero"; else if (fi >= 0) who = "friend";
    if (say) out.push({ who, say });
    cursor = end;
  }
  const tail = text.slice(cursor).trim(); if (tail) out.push({ who: "narrator", say: tail });
  return out;
}
const WATER_WORLDS = new Set(["coral-reef", "desert-oasis"]);
const WATER_FX = new Set(["water_shimmer", "gentle_waves"]);
function wantsWater(pg){ return !!pg && (WATER_WORLDS.has(pg.world_slug) || WATER_FX.has(pg.effect)); }
const AMBIENT_BY_WORLD = { "enchanted-forest": "forest", "dino-jungle": "jungle", "space-station": "space", "candy-land": "candy", "snowy-village": "wind", "dragon-mountain": "wind", "coral-reef": "waves", "desert-oasis": "wind" };
function ambientFor(pg){ if(!pg) return null; const fx = pg.effect; if(fx==="fireplace_flicker"||fx==="candle_glow") return "fire"; if(fx==="gentle_rain") return "rain"; if(fx==="water_shimmer"||fx==="gentle_waves") return "waves"; if(fx==="twinkling_stars"||fx==="shooting_stars") return "crickets"; return AMBIENT_BY_WORLD[pg.world_slug] || null; }

function ShareIcon(){return(<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></svg>);}
function SoundIcon({on}){return(<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="4 9 8 9 13 4 13 20 8 15 4 15"/>{on?<path d="M16 8a4 4 0 0 1 0 8"/>:<g><line x1="17" y1="9" x2="22" y2="14"/><line x1="22" y1="9" x2="17" y2="14"/></g>}</svg>);}
function Chevron({dir}){const pts=dir==="left"?"15 6 9 12 15 18":"9 6 15 12 9 18";return(<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points={pts}/></svg>);}
function StarIcon({filled}){return(<svg width="26" height="26" viewBox="0 0 24 24" fill={filled?"#ffe08a":"rgba(255,255,255,0.32)"} stroke={filled?"#ffb703":"rgba(255,255,255,0.55)"} strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true"><polygon points="12 2.5 14.9 8.6 21.5 9.5 16.7 14.1 17.9 20.7 12 17.5 6.1 20.7 7.3 14.1 2.5 9.5 9.1 8.6"/></svg>);}
function StarPip({filled}){return(<svg width="14" height="14" viewBox="0 0 24 24" fill={filled?"#ffe08a":"none"} stroke={filled?"#ffb703":"rgba(255,255,255,0.5)"} strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><polygon points="12 2.5 14.9 8.6 21.5 9.5 16.7 14.1 17.9 20.7 12 17.5 6.1 20.7 7.3 14.1 2.5 9.5 9.1 8.6"/></svg>);}

export default function StoryReader({ story, storyId, deviceId, kidProfileId, grade, onExit, onSave, saving, savedMsg, onContinue }) {
  const pages = (story && story.pages) || [];
  const style = (story && (story.style || story.art_style)) || "watercolor";
  const charSlug = (story && story.character_slug) || "bunny";
  const _va = hashStr((story && story.character_slug) || "h") % VOICE_POOL.length;
  const VOICE = { narrator: NARRATOR_VOICE, hero: VOICE_POOL[_va], friend: VOICE_POOL[(_va + 1) % VOICE_POOL.length], other: VOICE_POOL[(_va + 2) % VOICE_POOL.length] };
  const voiceFor = (who) => VOICE[who] || NARRATOR_VOICE;
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState(1);   // page-turn direction (1=forward, -1=back)
  const [cover, setCover] = useState(true);   // show the book cover first
  const [ended, setEnded] = useState(false);  // show 'The End'
  const [spoken, setSpoken] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(null);
  const narrCacheRef = useRef({});
  const hlTimerRef = useRef(null);
  const ambienceRef = useRef(null);
  const waterAudioRef = useRef(null);
  const sfxRef = useRef(null);
  const lineCacheRef = useRef({});
  const seqRef = useRef(0);
  const [spokenLine, setSpokenLine] = useState(-1);
  const [spokenWord, setSpokenWord] = useState(-1);
  const [soundOn, setSoundOn] = useState(true);
  const [sceneUrl, setSceneUrl] = useState({});   // pageIndex -> generated scene url
  const tokenRef = useRef((story && (story.scene_token || story.story_id)) || (Math.random().toString(36).slice(2,10) + Date.now().toString(36)));
  const startedScenesRef = useRef(false);

  // ---- ST3 state ----
  const [storytime, setStorytime] = useState(false);   // hands-free auto-read + auto-turn
  const [branch, setBranch] = useState(null);          // chosen path: null | "a" | "b"
  const [giggle, setGiggle] = useState(false);         // hero bounce animation flag
  const [foundStars, setFoundStars] = useState(() => ({}));  // pageIndex -> true when its star is tapped
  const [starToast, setStarToast] = useState(false);   // "you found them all" reward toast
  const stAdvRef = useRef(false);                       // storytime: has this page started reading?
  const loggedRef = useRef(false);                      // learning ledger: log the finish once
  const rewardedRef = useRef(false);                    // star coin reward: award once
  // Repaint is a grown-up tool (a kid re-rolling art burns image gens), so it sits
  // behind the same quick math check the rest of the app's grown-up controls use.
  const [repaintGate, setRepaintGate] = useState(null); // null | {a,b,val,err}
  function openRepaintGate() { setRepaintGate({ a: 3 + Math.floor(Math.random() * 7), b: 3 + Math.floor(Math.random() * 7), val: "", err: false }); }
  function submitRepaintGate(e) { e.preventDefault(); if (repaintGate && parseInt(repaintGate.val, 10) === repaintGate.a * repaintGate.b) { setRepaintGate(null); repaint(); } else { setRepaintGate((g) => g ? { ...g, err: true } : g); } }

  // Defensive clamp: the index can never point past the last page, so paging can
  // never fall into an empty "Page 7 of 6" — the last page routes to The End.
  const safeIdx = pages.length ? Math.min(Math.max(idx, 0), pages.length - 1) : 0;
  const page = pages[safeIdx] || {};
  // Choose-your-path: pages 5 & 6 (index 4,5) show the branch the kid picked on page 4.
  function branchTextOf(pg, i) {
    if (branch && (i === 4 || i === 5) && pg && (pg.text_a || pg.text_b)) return (branch === "a" ? pg.text_a : pg.text_b) || pg.text;
    return pg && pg.text;
  }
  const isBranchPage = branch && (safeIdx === 4 || safeIdx === 5) && (page.text_a || page.text_b);
  const curText = branchTextOf(page, safeIdx);
  const words = wordsOf(curText);
  // Branch pages have no pre-split dialogue lines, so parse the chosen text fresh.
  const pageLines = (!isBranchPage && Array.isArray(page.lines) && page.lines.length)
    ? page.lines
    : parseLines(curText, story.character_name, story.companion_name);
  // The page-4 choice is "pending" until the kid taps a button (only if the story has one).
  const choicePending = !!(page && page.choice && !branch && safeIdx === 3);
  const starTotal = Math.min(pages.length, 6);
  const starCount = Object.keys(foundStars).filter((k) => foundStars[k]).length;
  const palette = WORLD_PALETTE[page.world_slug] || ["#3a2c63", "#7a4a86"];
  const bgUrl = page.world_slug ? libImg("world", page.world_slug, "watercolor") : null;   // placeholder
  const charUrl = libImg("character", charSlug, "watercolor", page.emotion || "happy");      // placeholder

  // RICH PAGES: generate an integrated illustration of each page's moment (the hero
  // drawn INTO the scene, by emotion) in the background. Flat layered page shows
  // instantly; each page upgrades to its painted scene when ready. Cached per story.
  useEffect(() => {
    if (startedScenesRef.current || !pages.length) return;
    startedScenesRef.current = true;
    let cancelled = false;
    const token = tokenRef.current;
    const queue = pages.map((_p, i) => i);
    let active = 0, qi = 0;
    const pump = () => {
      while (!cancelled && active < 2 && qi < queue.length) {
        const i = queue[qi++]; const pg = pages[i];
        if (!pg || !pg.text) continue;
        active++;
        const ck = token + "|" + i + "|" + (pg.emotion || "happy");
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 120000);
        fetch("/api/story-library", { method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
          body: JSON.stringify({ pageScene: true, slug: charSlug, style, emo: pg.emotion || "happy", world: pg.world_slug, action: pg.text, pageIndex: i, cacheKey: ck, companion: (story && story.companion_slug) || "" }) })
          .then((r) => r.json())
          .then((j) => { clearTimeout(to); if (!cancelled && j && (j.generated || j.cached)) setSceneUrl((m) => ({ ...m, [i]: "/api/story-library?pimg=1&k=" + encodeURIComponent(ck) })); })
          .catch(() => { clearTimeout(to); })
          .finally(() => { active--; if (!cancelled) pump(); });
      }
    };
    pump();
    return () => { cancelled = true; };
  }, []);

  // World ambience: optional (returns configured:false if not set up). Loops quietly.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/story-ambience?world=" + encodeURIComponent((story && story.start_world) || ""))
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j || !j.configured || !j.audioUrl) return;
        const el = ambienceRef.current; if (!el) return;
        el.src = j.audioUrl; el.loop = true; el.volume = 0.2;
        if (soundOn) el.play().catch(() => {});
      })
      .catch(() => {});
    return () => { cancelled = true; try { ambienceRef.current && ambienceRef.current.pause(); } catch {} };
  }, []);

  useEffect(() => { seqRef.current++; stopAll(); setSpoken(-1); setSpokenLine(-1); setSpokenWord(-1); setPlaying(false); return () => stopAll(); }, [idx]);

  // ---- STORYTIME (ST3 feature 1): hands-free bedtime movie ----
  // On each page, read it aloud; when the narration finishes, auto-turn to the next
  // page. Pauses at the page-4 choice so the kid still picks the path, and stops at
  // The End. Reuses playSequence/narratePage; advance is driven by the `playing` flag.
  useEffect(() => {
    if (!storytime || cover || ended || !pages.length) return;
    stAdvRef.current = false;                       // this page hasn't been read yet
    const t = setTimeout(() => { narratePage(); }, 650);
    return () => clearTimeout(t);
  }, [safeIdx, cover, ended, storytime, branch]);
  useEffect(() => {
    if (!storytime || cover || ended) return;
    if (playing) { stAdvRef.current = true; return; }   // narration in progress
    if (!stAdvRef.current) return;                       // hasn't started reading yet
    if (choicePending) return;                           // wait for the kid to choose
    stAdvRef.current = false;
    const t = setTimeout(() => {
      if (idx >= pages.length - 1) setEnded(true);
      else { setDir(1); setIdx((i) => i + 1); }
    }, 1200);
    return () => clearTimeout(t);
  }, [playing, storytime, cover, ended, choicePending]);

  // ---- Learning ledger (ST3 feature 5): log a reading skill event on finish ----
  useEffect(() => {
    if (!ended || loggedRef.current) return;
    loggedRef.current = true;
    try { logSkillEvent({ subject: "reading", skill: storytime ? "storytime" : "story-reading", correct: true, grade: grade || null, quizType: "reading", game: "stories" }); } catch (e) {}
  }, [ended]);

  // ---- Tap surprises (ST3 feature 2) ----
  function tapHero() {
    setGiggle(true); playSfx("giggle");
    setTimeout(() => setGiggle(false), 640);
  }
  function starPos(i) {
    const h = hashStr((storyId || tokenRef.current) + ":star:" + i);
    // On the page-4 choice screen the bottom holds the choice buttons, so keep that
    // page's star up top where it can't hide behind the overlay.
    const yRange = (i === 3 && page && page.choice) ? 40 : 60;
    return { left: (8 + (h % 78)) + "%", top: (12 + ((h >> 5) % yRange)) + "%" };
  }
  function tapStar(i) {
    if (foundStars[i]) return;
    playSfx("sparkle");
    setFoundStars((m) => {
      const next = { ...m, [i]: true };
      const count = Object.keys(next).filter((k) => next[k]).length;
      if (count >= starTotal && !rewardedRef.current) {
        rewardedRef.current = true;
        awardCoins("story-stars:" + (storyId || tokenRef.current), STAR_REWARD_COINS);
        setStarToast(true);
        setTimeout(() => setStarToast(false), 3400);
      }
      return next;
    });
  }
  // ---- Choose-your-path (ST3 feature 4): pick a branch, then turn to page 5 ----
  function pickBranch(b) {
    setBranch(b); playSfx("pop");
    setDir(1); setIdx((i) => i + 1);
  }

  // Ambient soundscape matched to the page's world/effect — forest birds, night
  // crickets, snowy wind, reef waves, fire crackle, jungle, space, candy, rain.
  // Generated once via ElevenLabs, cached, looped quietly.
  useEffect(() => {
    const el = waterAudioRef.current; if (!el) return;
    const snd = ambientFor(page);
    if (snd && soundOn) {
      if (!el.src || el.src.indexOf("s=" + snd) < 0) el.src = "/api/sfx?s=" + snd;
      el.loop = true; el.volume = 0.26; el.play().catch(() => {});
    } else { try { el.pause(); } catch {} }
  }, [idx, soundOn]);

  function stopAll() {
    try { if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel(); } catch {}
    try { if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; } } catch {}
    if (hlTimerRef.current) { clearInterval(hlTimerRef.current); hlTimerRef.current = null; }
    try { if (waterAudioRef.current) waterAudioRef.current.pause(); } catch {}
  }

  function toggleSound() {
    setSoundOn((v) => { const next = !v; const el = ambienceRef.current; if (el) { if (next) el.play().catch(() => {}); else el.pause(); } return next; });
  }

  function readAloudBrowser() {
    if (typeof window === "undefined" || !window.speechSynthesis) { setPlaying(false); return; }
    const u = new SpeechSynthesisUtterance(curText || "");
    u.rate = 0.82; u.pitch = 1.05;
    const starts = []; let acc = 0;
    words.forEach((w) => { const at = (curText || "").indexOf(w, acc); starts.push(at); acc = at + w.length; });
    u.onboundary = (e) => { if (e.name && e.name !== "word") return; let wi = 0; for (let i = 0; i < starts.length; i++) { if (e.charIndex >= starts[i]) wi = i; } setSpoken(wi); };
    u.onend = () => { setSpoken(-1); setPlaying(false); };
    u.onerror = () => { setSpoken(-1); setPlaying(false); };
    window.speechSynthesis.speak(u);
  }

  function playWithAudio(audioUrl, wordTimings) {
    const el = audioRef.current; if (!el) { readAloudBrowser(); return; }
    el.src = audioUrl;
    try { el.preservesPitch = true; el.mozPreservesPitch = true; el.webkitPreservesPitch = true; } catch {}
    el.playbackRate = 0.9;
    if (Array.isArray(wordTimings) && wordTimings.length) {
      hlTimerRef.current = setInterval(() => { const t = el.currentTime || 0; let wi = -1; for (let i = 0; i < wordTimings.length; i++) { if (t >= (wordTimings[i].start || 0)) wi = i; } setSpoken(wi); }, 80);
    }
    el.onended = () => { setSpoken(-1); setPlaying(false); if (hlTimerRef.current) { clearInterval(hlTimerRef.current); hlTimerRef.current = null; } };
    el.play().catch(() => { setPlaying(false); });
  }

  // ---- single-voice fallback (no dialog lines) ----
  async function narratePageSingle() {
    setPlaying(true); setSpoken(-1);
    (page.sfx || []).forEach((nm, i) => setTimeout(() => playSfx(nm), 250 + i * 800));
    if (soundOn && ambienceRef.current && ambienceRef.current.src && ambienceRef.current.paused) ambienceRef.current.play().catch(() => {});
    const nkey = idx + "|" + (isBranchPage ? (branch || "") : "");
    let cached = narrCacheRef.current[nkey];
    if (cached === undefined) {
      try {
        const r = await fetch("/api/narrate-story-page", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: curText }) });
        const j = await r.json();
        cached = (j && j.configured && j.audioUrl) ? { audioUrl: j.audioUrl, wordTimings: j.wordTimings } : "none";
      } catch { cached = "none"; }
      narrCacheRef.current[nkey] = cached;
    }
    if (cached && cached !== "none") playWithAudio(cached.audioUrl, cached.wordTimings);
    else readAloudBrowser();
  }

  // ---- one-shot sound effect ----
  function playSfx(name) {
    const el = sfxRef.current; if (!el || !soundOn) return;
    try { el.src = "/api/sfx?s=" + encodeURIComponent(name); el.volume = 0.55; el.currentTime = 0; el.play().catch(() => {}); } catch {}
  }

  // ---- per-line voice clip (cached by voice+text) ----
  async function fetchLineAudio(text, voiceId) {
    const key = voiceId + "|" + text;
    if (lineCacheRef.current[key] !== undefined) return lineCacheRef.current[key];
    let res = "none";
    try {
      const r = await fetch("/api/narrate-story-page", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, voiceId }) });
      const j = await r.json();
      if (j && j.configured && j.audioUrl) res = { audioUrl: j.audioUrl, wordTimings: j.wordTimings };
    } catch {}
    lineCacheRef.current[key] = res; return res;
  }
  function playClip(audioUrl, wordTimings) {
    return new Promise((resolve) => {
      const el = audioRef.current; if (!el) { resolve(); return; }
      el.src = audioUrl; try { el.preservesPitch = true; } catch {} el.playbackRate = 0.96;
      let tmr = null; setSpokenWord(-1);
      if (Array.isArray(wordTimings) && wordTimings.length) {
        tmr = setInterval(() => {
          const t = el.currentTime || 0; let wi = -1;
          for (let i = 0; i < wordTimings.length; i++) { if (t >= (wordTimings[i].start || 0)) wi = i; }
          setSpokenWord(wi);
        }, 70);
      }
      const done = () => { if (tmr) clearInterval(tmr); setSpokenWord(-1); resolve(); };
      el.onended = done; el.onerror = done;
      el.play().catch(done);
    });
  }
  function speakLine(text) {
    return new Promise((resolve) => {
      if (typeof window === "undefined" || !window.speechSynthesis) { resolve(); return; }
      const u = new SpeechSynthesisUtterance(text); u.rate = 0.9; u.pitch = 1.05;
      const w = wordsOf(text); const starts = []; let acc = 0;
      w.forEach((x) => { const at = text.indexOf(x, acc); starts.push(at); acc = at + x.length; });
      u.onboundary = (e) => { if (e.name && e.name !== "word") return; let wi = 0; for (let i = 0; i < starts.length; i++) { if (e.charIndex >= starts[i]) wi = i; } setSpokenWord(wi); };
      u.onend = () => { setSpokenWord(-1); resolve(); }; u.onerror = () => { setSpokenWord(-1); resolve(); };
      window.speechSynthesis.speak(u);
    });
  }

  // ---- multi-voice sequencer: play each line in its speaker's voice + sfx ----
  async function playSequence(lns, sfx) {
    const my = ++seqRef.current; setPlaying(true); setSpoken(-1);
    if (soundOn && ambienceRef.current && ambienceRef.current.src && ambienceRef.current.paused) ambienceRef.current.play().catch(() => {});
    (sfx || []).forEach((nm, i) => setTimeout(() => { if (seqRef.current === my) playSfx(nm); }, 250 + i * 800));
    let nextP = fetchLineAudio(lns[0].say, voiceFor(lns[0].who));
    for (let i = 0; i < lns.length; i++) {
      if (seqRef.current !== my) return;
      setSpokenLine(i);
      const a = await nextP;
      if (lns[i + 1]) nextP = fetchLineAudio(lns[i + 1].say, voiceFor(lns[i + 1].who));
      if (seqRef.current !== my) return;
      setSpokenWord(-1);
      if (a && a !== "none" && a.audioUrl) await playClip(a.audioUrl, a.wordTimings);
      else await speakLine(lns[i].say);
    }
    if (seqRef.current === my) { setSpokenLine(-1); setPlaying(false); }
  }

  function narratePage() {
    if (pageLines.length > 1) playSequence(pageLines, page.sfx); else narratePageSingle();
  }
  function toggleRead() { if (playing) { seqRef.current++; stopAll(); setPlaying(false); setSpoken(-1); setSpokenLine(-1); setSpokenWord(-1); } else { narratePage(); } }

  function repaint() {
    const pg = pages[idx]; if (!pg || !pg.text) return;
    const ck = tokenRef.current + "|" + idx + "|" + (pg.emotion || "happy");
    setSceneUrl((m) => { const n = { ...m }; delete n[idx]; return n; });   // back to placeholder while it paints
    fetch("/api/story-library", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageScene: true, force: true, slug: charSlug, style, emo: pg.emotion || "happy", world: pg.world_slug, action: pg.text, pageIndex: idx, cacheKey: ck, companion: (story && story.companion_slug) || "" }) })
      .then((r) => r.json())
      .then((j) => { if (j && (j.generated || j.cached)) setSceneUrl((m) => ({ ...m, [idx]: "/api/story-library?pimg=1&k=" + encodeURIComponent(ck) + "&cb=" + Date.now() })); })
      .catch(() => {});
  }

  const isLast = idx === pages.length - 1;
  const friend = story.companion_name;
  const topBar = (
    <div style={s.topBar}>
      <button style={s.navBtn} onClick={onExit}>Back</button>
      <span style={s.counter}>{story.title}</span>
      <span style={{ width: 64 }} />
    </div>
  );

  // ---------- COVER ----------
  if (cover) {
    const p0 = pages[0] || {};
    const overlay = (
      <div style={s.coverOverlay}>
        <div style={s.coverInner}>
          <p style={s.coverKicker}>A storybook</p>
          <h1 style={s.coverTitle}>{story.title}</h1>
          <p style={s.coverBy}>starring {story.character_name}{friend ? ` & ${friend}` : ""}</p>
          <button style={s.coverBtn} onClick={() => { setDir(1); setCover(false); }}>Open the book</button>
          <button style={{ ...s.storytimeToggle, ...(storytime ? s.storytimeToggleOn : {}) }} onClick={() => setStorytime((v) => !v)} aria-pressed={storytime}>
            <SoundIcon on={storytime}/> <span>Storytime mode: {storytime ? "On" : "Off"}</span>
          </button>
          <p style={s.storytimeHint}>{storytime ? "I'll read every page and turn them for you." : "Tap for a hands-free read that turns its own pages."}</p>
        </div>
      </div>
    );
    return (
      <div style={s.container}>
        {topBar}
        {sceneUrl[0]
          ? <SceneStage url={sceneUrl[0]} effects={["magic_sparkles"]} world={p0.world_slug} pageIndex={0} style={s.page}>{overlay}</SceneStage>
          : <LayeredPage bgUrl={p0.world_slug ? libImg("world", p0.world_slug, "watercolor") : null} charUrl={libImg("character", charSlug, "watercolor", p0.emotion || "happy")} charSlug={charSlug} effects={["magic_sparkles"]} palette={palette} world={p0.world_slug} pageIndex={0} style={s.page}>{overlay}</LayeredPage>}
      </div>
    );
  }

  // ---------- THE END ----------
  if (ended) {
    const li2 = pages.length - 1; const pl = pages[li2] || {};
    const overlay = (
      <div style={s.coverOverlay}>
        <div style={s.coverInner}>
          <h1 style={s.endTitle}>The End</h1>
          <p style={s.coverBy}>{story.character_name}{friend ? ` and ${friend}` : ""} lived happily ever after.</p>
        </div>
      </div>
    );
    return (
      <div style={s.container}>
        {topBar}
        {sceneUrl[li2]
          ? <SceneStage url={sceneUrl[li2]} effects={["magic_sparkles", "twinkling_stars"]} world={pl.world_slug} pageIndex={li2} style={s.page}>{overlay}</SceneStage>
          : <LayeredPage bgUrl={pl.world_slug ? libImg("world", pl.world_slug, "watercolor") : null} charUrl={libImg("character", charSlug, "watercolor", pl.emotion || "happy")} charSlug={charSlug} effects={["magic_sparkles"]} palette={palette} world={pl.world_slug} pageIndex={li2} style={s.page}>{overlay}</LayeredPage>}
        <div style={s.endRow}>
          <button style={s.saveBtn} disabled={saving} onClick={() => onSave(story)}>{saving ? "Saving…" : "Save to my library"}</button>
          <button style={s.againBtn} onClick={() => { setEnded(false); setDir(-1); setIdx(0); }}>Read it again</button>
          {onContinue && (<button style={s.nextChapterBtn} onClick={() => onContinue(story)}>What happens next?</button>)}
          {savedMsg && <p style={s.savedMsg}>{savedMsg}</p>}
        </div>
      </div>
    );
  }

  return (
    <div style={s.container}>
      <style>{"@keyframes bk-turn-next{0%{opacity:0;transform:perspective(1200px) rotateY(14deg) translateX(7%)}100%{opacity:1;transform:perspective(1200px) rotateY(0) translateX(0)}}@keyframes bk-turn-prev{0%{opacity:0;transform:perspective(1200px) rotateY(-14deg) translateX(-7%)}100%{opacity:1;transform:perspective(1200px) rotateY(0) translateX(0)}}@keyframes bk-giggle{0%{transform:scale(1) rotate(0)}20%{transform:scale(1.05) rotate(-1.5deg)}45%{transform:scale(0.97) rotate(1.5deg)}70%{transform:scale(1.03) rotate(-1deg)}100%{transform:scale(1) rotate(0)}}@keyframes bk-starpop{0%{transform:scale(0.6);opacity:0}60%{transform:scale(1.25)}100%{transform:scale(1);opacity:1}}@keyframes bk-toast{0%{opacity:0;transform:translateY(10px)}12%{opacity:1;transform:translateY(0)}88%{opacity:1}100%{opacity:0}}"}</style>
      <div style={s.topBar}>
        <button style={s.navBtn} onClick={onExit}>Back</button>
        <span style={s.counter}>{story.title}</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={s.soundBtn} onClick={() => shareCreation({ kind: "story", id: storyId, title: story.title })} title="Share this story" aria-label="Share this story"><ShareIcon/></button>
          <button style={s.soundBtn} onClick={toggleSound} title="Background sounds" aria-label="Toggle background sounds"><SoundIcon on={soundOn}/></button>
        </div>
      </div>
      <audio ref={ambienceRef} style={{ display: "none" }} />
      <audio ref={waterAudioRef} style={{ display: "none" }} />
      <audio ref={sfxRef} style={{ display: "none" }} />

      <div style={{ position: "relative", width: "100%", maxWidth: 760 }}>
        <div key={safeIdx} style={{ width: "100%", animation: (dir >= 0 ? "bk-turn-next" : "bk-turn-prev") + " 0.5s cubic-bezier(.2,.7,.3,1) both", transformOrigin: dir >= 0 ? "left center" : "right center" }}>
          <div onClick={tapHero} style={{ cursor: "pointer", borderRadius: 24, animation: giggle ? "bk-giggle 0.64s ease" : "none" }} title="Tap me!">
            {sceneUrl[safeIdx]
              ? <SceneStage url={sceneUrl[safeIdx]} effects={page.effects || [page.effect]} world={page.world_slug} pageIndex={safeIdx} style={s.page} />
              : <LayeredPage bgUrl={bgUrl} charUrl={charUrl} charSlug={charSlug} effects={page.effects || [page.effect]} palette={palette} world={page.world_slug} pageIndex={safeIdx} style={s.page} />}
          </div>
        </div>

        {/* Hidden star to find on every page (feature ST3). */}
        {(
          <button onClick={(e) => { e.stopPropagation(); tapStar(safeIdx); }} aria-label={foundStars[safeIdx] ? "Star found" : "Find the hidden star"}
            style={{ position: "absolute", ...starPos(safeIdx), transform: "translate(-50%,-50%)", background: "transparent", border: "none", padding: 6, cursor: "pointer", animation: foundStars[safeIdx] ? "bk-starpop 0.5s ease" : "none", filter: foundStars[safeIdx] ? "drop-shadow(0 0 8px rgba(255,224,138,0.9))" : "none", opacity: foundStars[safeIdx] ? 1 : 0.4 }}>
            <StarIcon filled={!!foundStars[safeIdx]} />
          </button>
        )}

        {/* Page-4 choose-your-path (feature ST3). */}
        {choicePending && (
          <div style={s.choiceOverlay}>
            <p style={s.choicePrompt}>{page.choice.prompt}</p>
            <div style={s.choiceRow}>
              <button style={s.choiceBtn} onClick={() => pickBranch("a")}>{page.choice.a}</button>
              <button style={s.choiceBtn} onClick={() => pickBranch("b")}>{page.choice.b}</button>
            </div>
          </div>
        )}

        {starToast && (<div style={s.starToast}><StarIcon filled={true}/> All {starTotal} stars found! +{STAR_REWARD_COINS} coins</div>)}
      </div>

      <button style={s.repaintBtn} onClick={openRepaintGate} title="Grown-ups: paint this page again">Grown-ups: repaint</button>
      {repaintGate && (
        <div style={s.gateOverlay} onClick={(e) => { if (e.target === e.currentTarget) setRepaintGate(null); }}>
          <form style={s.gateCard} onSubmit={submitRepaintGate}>
            <p style={s.gateTitle}>Grown-ups only</p>
            <p style={s.gateSub}>Quick check — what is {repaintGate.a} × {repaintGate.b}?</p>
            <input autoFocus type="number" inputMode="numeric" value={repaintGate.val} onChange={(e) => setRepaintGate((g) => ({ ...g, val: e.target.value }))} placeholder="Type the answer" style={s.gateInput} />
            {repaintGate.err && <p style={s.gateErr}>Not quite — ask a grown-up.</p>}
            <button type="submit" style={s.gateGo}>Repaint this page</button>
            <button type="button" onClick={() => setRepaintGate(null)} style={s.gateCancel}>Cancel</button>
          </form>
        </div>
      )}

      <div style={s.textPanel}>
        {pageLines.length > 1
          ? pageLines.map((l, i) => (
              <p key={i} style={{ ...s.line, ...(l.who !== "narrator" ? s.lineDialog : {}), ...(i === spokenLine ? s.lineOn : {}) }}>
                {l.who === "hero" ? <b style={s.speaker}>{(story.character_name || "Hero") + ": "}</b> : l.who === "friend" ? <b style={s.speaker}>{(story.companion_name || "Friend") + ": "}</b> : null}
                {i === spokenLine
                  ? wordsOf(l.say).map((w, wi) => (<span key={wi} style={wi === spokenWord ? s.wordOn : s.word}>{w} </span>))
                  : l.say}
              </p>))
          : <p style={s.text}>{words.map((w, i) => (<span key={i} style={{ ...(i === spoken ? s.wordOn : s.word) }}>{w} </span>))}</p>}
      </div>

      {storytime && (
        <div style={s.stBanner}>
          <span style={s.stDot} /> <span>Storytime is playing</span>
          <button style={s.stStop} onClick={() => { setStorytime(false); seqRef.current++; stopAll(); setPlaying(false); }}>Stop</button>
        </div>
      )}

      <div style={s.controls}>
        <button style={s.circleBtn} disabled={idx === 0} onClick={() => { setDir(-1); setIdx((i) => Math.max(0, i - 1)); }}><Chevron dir="left"/></button>
        <button style={s.readBtn} onClick={toggleRead}>{playing ? "Pause" : "Read to me"}</button>
        <button style={{ ...s.circleBtn, ...(choicePending ? { opacity: 0.35 } : {}) }} disabled={choicePending} title={choicePending ? "Pick what happens next first" : ""} onClick={() => { if (isLast) { setEnded(true); } else { setDir(1); setIdx((i) => i + 1); } }}><Chevron dir="right"/></button>
      </div>

      <div style={s.pageNumRow}>
        <span style={s.pageNum}>Page {safeIdx + 1} of {pages.length}</span>
        <span style={s.starCount} title="Hidden stars found">
          <StarPip filled={starCount > 0} /> {starCount}/{starTotal}
        </span>
      </div>

      <audio ref={audioRef} style={{ display: "none" }} />

    </div>
  );
}

const s = {
  container: { minHeight: "100vh", background: PAGE_BG, color: "#fff", fontFamily: NUN, padding: "20px 16px 50px", display: "flex", flexDirection: "column", alignItems: "center" },
  topBar: { width: "100%", maxWidth: 760, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  soundBtn: { width: 44, height: 44, borderRadius: 12, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(255,255,255,0.08)", color: "#fff", fontSize: 18, cursor: "pointer" },
  navBtn: { padding: "10px 18px", background: "rgba(255,255,255,0.08)", color: "#fff", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 14, fontWeight: 700, fontFamily: NUN, cursor: "pointer" },
  counter: { fontFamily: FRED, fontSize: 18, fontWeight: 700, textAlign: "center", flex: 1, padding: "0 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  page: { width: "100%", maxWidth: 760, aspectRatio: "3 / 2", borderRadius: 24, border: "1px solid rgba(155,126,221,0.3)", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" },
  textPanel: { width: "100%", maxWidth: 760, marginTop: 14, padding: "16px 22px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(155,126,221,0.22)", borderRadius: 18, boxSizing: "border-box" },
  text: { fontFamily: FRED, fontSize: "clamp(17px, 2.6vw, 22px)", lineHeight: 1.55, margin: 0, color: "#fff", textAlign: "center" },
  line: { fontFamily: FRED, fontSize: "clamp(16px, 2.5vw, 21px)", lineHeight: 1.5, margin: "4px 0", color: "#efeaff", padding: "3px 8px", borderRadius: 10, transition: "background .15s" },
  lineDialog: { fontStyle: "italic", paddingLeft: 14 },
  lineOn: { background: "rgba(255,224,138,0.16)", color: "#fff" },
  speaker: { fontStyle: "normal", color: "#ffd98a" },
  word: { color: "#efeaff", transition: "color 0.1s, background 0.1s", borderRadius: 6, padding: "0 1px" },
  wordOn: { color: "#1a1330", background: "#ffe08a", borderRadius: 6, padding: "0 3px", boxShadow: "0 0 0 2px #ffe08a" },
  controls: { display: "flex", alignItems: "center", gap: 14, marginTop: 18 },
  circleBtn: { width: 52, height: 52, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.12)", color: "#fff", fontSize: 26, cursor: "pointer", fontFamily: FRED, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, lineHeight: 0 },
  readBtn: { padding: "13px 26px", borderRadius: 16, border: "none", background: "linear-gradient(135deg,#9b7edd,#c06b99,#d65a7b)", color: "#fff", fontSize: 17, fontWeight: 800, fontFamily: FRED, cursor: "pointer", boxShadow: "0 6px 20px rgba(155,126,221,0.45)" },
  repaintBtn: { marginTop: 10, padding: "7px 14px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(255,255,255,0.05)", color: "rgba(205,211,255,0.75)", fontFamily: NUN, fontSize: 12, fontWeight: 700, cursor: "pointer" },
  gateOverlay: { position: "fixed", inset: 0, zIndex: 10000, background: "rgba(8,5,18,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
  gateCard: { background: "#1E1733", borderRadius: 20, padding: 24, width: "100%", maxWidth: 320, textAlign: "center", fontFamily: NUN },
  gateTitle: { color: "#fff", fontFamily: FRED, fontSize: 20, fontWeight: 700, margin: "0 0 4px" },
  gateSub: { color: "#B6AED0", fontSize: 14, margin: "0 0 14px" },
  gateInput: { width: "100%", boxSizing: "border-box", borderRadius: 12, border: "none", padding: "12px 14px", fontSize: 16, fontFamily: NUN, color: "#333" },
  gateErr: { color: "#ffd7d7", fontSize: 13, margin: "8px 0 0" },
  gateGo: { width: "100%", marginTop: 12, border: "none", borderRadius: 999, padding: 13, fontFamily: FRED, fontWeight: 700, fontSize: 15, color: "#fff", cursor: "pointer", background: "linear-gradient(90deg,#8A6BFF,#E0578F)" },
  gateCancel: { width: "100%", marginTop: 8, background: "transparent", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 999, padding: 10, color: "#C9C2E0", fontFamily: NUN, fontSize: 13, cursor: "pointer" },
  pageNum: { fontSize: 14, opacity: 0.65 },
  endRow: { marginTop: 14, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
  saveBtn: { padding: "13px 26px", borderRadius: 16, border: "none", background: "#fff", color: "#b3477a", fontSize: 16, fontWeight: 800, fontFamily: FRED, cursor: "pointer" },
  savedMsg: { fontSize: 14, color: "#bdf5cf", fontWeight: 700 },
  againBtn: { padding: "12px 24px", borderRadius: 16, border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 15, fontWeight: 800, fontFamily: FRED, cursor: "pointer" },
  nextChapterBtn: { padding: "13px 28px", borderRadius: 16, border: "none", background: "linear-gradient(135deg,#9b7edd,#c06b99,#d65a7b)", color: "#fff", fontSize: 16, fontWeight: 800, fontFamily: FRED, cursor: "pointer", boxShadow: "0 8px 24px rgba(155,126,221,0.5)" },
  coverOverlay: { position: "absolute", inset: 0, borderRadius: "inherit", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(to top, rgba(10,8,24,0.80), rgba(10,8,24,0.15) 55%, rgba(10,8,24,0.50))", padding: 20, boxSizing: "border-box" },
  coverInner: { textAlign: "center", maxWidth: "88%" },
  coverKicker: { fontFamily: NUN, fontSize: 12, letterSpacing: 3, textTransform: "uppercase", color: "#e9c6ff", margin: "0 0 10px", opacity: 0.9 },
  coverTitle: { fontFamily: FRED, fontSize: "clamp(28px,5.5vw,46px)", fontWeight: 800, margin: "0 0 10px", color: "#fff", textShadow: "0 3px 18px rgba(0,0,0,0.65)", lineHeight: 1.12 },
  coverBy: { fontFamily: FRED, fontSize: "clamp(15px,2.5vw,19px)", color: "#f3ecff", margin: "0 0 20px", textShadow: "0 2px 10px rgba(0,0,0,0.6)" },
  coverBtn: { padding: "14px 32px", borderRadius: 18, border: "none", background: "linear-gradient(135deg,#9b7edd,#c06b99,#d65a7b)", color: "#fff", fontSize: 18, fontWeight: 800, fontFamily: FRED, cursor: "pointer", boxShadow: "0 10px 30px rgba(155,126,221,0.6)", animation: "bk-cbob 2.6s ease-in-out infinite" },
  endTitle: { fontFamily: FRED, fontSize: "clamp(40px,9vw,76px)", fontWeight: 800, margin: "0 0 8px", color: "#fff", textShadow: "0 4px 22px rgba(0,0,0,0.7)" },
  // ---- ST3 ----
  storytimeToggle: { marginTop: 14, display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 15, fontWeight: 800, fontFamily: FRED, cursor: "pointer" },
  storytimeToggleOn: { background: "linear-gradient(135deg,#9b7edd,#c06b99)", border: "1px solid rgba(255,255,255,0.5)", boxShadow: "0 6px 18px rgba(155,126,221,0.5)" },
  storytimeHint: { fontFamily: NUN, fontSize: 12.5, color: "#efeaff", opacity: 0.9, margin: "8px 0 0", textShadow: "0 2px 8px rgba(0,0,0,0.6)" },
  choiceOverlay: { position: "absolute", left: "50%", bottom: 16, transform: "translateX(-50%)", width: "min(94%,560px)", boxSizing: "border-box", background: "linear-gradient(to top, rgba(10,8,24,0.92), rgba(10,8,24,0.72))", border: "1px solid rgba(255,224,138,0.4)", borderRadius: 20, padding: "16px 16px 18px", textAlign: "center", backdropFilter: "blur(2px)" },
  choicePrompt: { fontFamily: FRED, fontSize: "clamp(17px,2.6vw,22px)", fontWeight: 800, color: "#fff", margin: "0 0 12px" },
  choiceRow: { display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" },
  choiceBtn: { flex: "1 1 44%", minWidth: 130, padding: "14px 18px", borderRadius: 16, border: "none", background: "linear-gradient(135deg,#9b7edd,#c06b99,#d65a7b)", color: "#fff", fontSize: 16, fontWeight: 800, fontFamily: FRED, cursor: "pointer", boxShadow: "0 6px 18px rgba(155,126,221,0.5)" },
  starToast: { position: "absolute", left: "50%", top: 14, transform: "translateX(-50%)", display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 999, background: "rgba(26,19,48,0.92)", border: "1px solid #ffe08a", color: "#ffe08a", fontFamily: FRED, fontWeight: 800, fontSize: 15, whiteSpace: "nowrap", boxShadow: "0 8px 24px rgba(0,0,0,0.5)", animation: "bk-toast 3.4s ease both" },
  stBanner: { display: "inline-flex", alignItems: "center", gap: 8, marginTop: 14, padding: "8px 16px", borderRadius: 999, background: "rgba(155,126,221,0.18)", border: "1px solid rgba(155,126,221,0.5)", color: "#efeaff", fontFamily: NUN, fontWeight: 700, fontSize: 13 },
  stDot: { width: 9, height: 9, borderRadius: "50%", background: "#8affc1", boxShadow: "0 0 8px #8affc1", display: "inline-block" },
  stStop: { marginLeft: 6, padding: "5px 14px", borderRadius: 999, border: "none", background: "rgba(255,255,255,0.16)", color: "#fff", fontWeight: 800, fontFamily: FRED, fontSize: 13, cursor: "pointer" },
  pageNumRow: { display: "flex", alignItems: "center", gap: 14, marginTop: 12 },
  starCount: { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 700, color: "#ffe08a", opacity: 0.9 },
};
