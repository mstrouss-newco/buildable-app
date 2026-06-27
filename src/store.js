// /src/store.js
// -------------------------------------------------------------
// "My Stuff" save layer for Buildable Kids.
//
// Saves a child's characters, levels (with their layers), and sounds
// on THIS device — no login needed — so anything they make is kept
// and can be reused.
//
// Storage uses IndexedDB, which holds hundreds of MB. (The old version
// used localStorage, which caps at ~5 MB — and since each AI character
// image is ~2 MB of base64, two characters filled it up and levels
// silently failed to save. IndexedDB fixes that.)
//
// An in-memory cache keeps reads instant/synchronous for the UI, while
// writes are persisted to IndexedDB in the background. Components can
// subscribe with onLibraryChange() to refresh once data has loaded.
//
// Later, when a parent login is connected, persist() is the single spot
// to also push these to Supabase so creations follow the account.
// -------------------------------------------------------------

const DB_NAME = "buildable_kids";
const STORE = "library";
const KINDS = ["characters", "levels", "sounds", "games"];
const LEGACY_KEYS = { characters: "bk_characters", levels: "bk_levels", sounds: "bk_sounds", games: "bk_games" };

// Learning Mode caches are scoped per kid profile so two kids on one device
// don't share badges/streak, and (when signed in) progress can follow a kid.
import { getActiveKid, isSignedIn } from "./lib/accounts";

// The current scope id: the active kid's id, or "guest" when none is selected.
// Recomputed on demand so a kid switch picks up the new id immediately.
function scopeId() {
  try { return getActiveKid()?.id || "guest"; } catch { return "guest"; }
}
// Per-kid IndexedDB keys, e.g. "progress:guest" / "learning:<kidId>".
function scopedKey(base) { return `${base}:${scopeId()}`; }

// In-memory cache — the source of truth for synchronous reads.
const cache = { characters: [], levels: [], sounds: [], games: [] };
let ready = false;
const listeners = new Set();

function emit() {
  listeners.forEach((cb) => { try { cb(); } catch {} });
}

// Subscribe to changes (data loaded, saved, or deleted). Returns an unsubscribe fn.
export function onLibraryChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function isLibraryReady() {
  return ready;
}

// ---------------- IndexedDB plumbing ----------------
function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no-indexeddb"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const r = tx.objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}

async function idbSet(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Persist one kind's array to IndexedDB (background; never throws to caller).
function persist(kind) {
  return idbSet(kind, cache[kind]).catch(() => {});
}

// One-time rescue of anything saved under the old localStorage layout.
function migrateFromLocalStorage() {
  let migrated = false;
  for (const kind of KINDS) {
    try {
      const raw = localStorage.getItem(LEGACY_KEYS[kind]);
      if (raw && cache[kind].length === 0) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length) { cache[kind] = arr; migrated = true; }
      }
    } catch {}
  }
  if (migrated) {
    KINDS.forEach((k) => persist(k));
    // Free the old localStorage space the base64 images were hogging.
    try { Object.values(LEGACY_KEYS).forEach((k) => localStorage.removeItem(k)); } catch {}
  }
}

// Load everything from IndexedDB into the cache at startup.
async function hydrate() {
  try {
    for (const kind of KINDS) {
      const arr = await idbGet(kind);
      cache[kind] = Array.isArray(arr) ? arr : [];
    }
    const empty = !cache.characters.length && !cache.levels.length && !cache.sounds.length;
    if (empty) migrateFromLocalStorage();
  } catch {
    // IndexedDB unavailable (rare) — pull whatever localStorage had.
    migrateFromLocalStorage();
  }
  ready = true;
  emit();
}
hydrate();

// ---------------- Helpers ----------------
function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function autoName(desc) {
  if (!desc) return "Untitled";
  const words = desc.trim().split(/\s+/).slice(0, 4).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// ---------------- Characters ----------------
export function listCharacters() {
  return cache.characters;
}

export function saveCharacter(character) {
  const name = character.name || autoName(character.description);
  const description = character.description || "";
  const image = character.image || null;

  // Dedup: if a character with the same (case/space-insensitive) name+description
  // already exists, UPDATE it in place and move it to the front instead of adding
  // a duplicate. This stops e.g. "kid with jetpack" creating a new entry every time.
  const key = (n, d) => (String(n || "").trim().toLowerCase() + "|" + String(d || "").trim().toLowerCase());
  const wantKey = key(name, description);
  const existingIdx = cache.characters.findIndex((c) => key(c.name, c.description) === wantKey);

  if (existingIdx !== -1) {
    const existing = cache.characters[existingIdx];
    const updated = {
      ...existing,
      name,
      description,
      image: image || existing.image || null,
      updatedAt: Date.now(),
    };
    cache.characters = [updated, ...cache.characters.filter((_, i) => i !== existingIdx)];
    persist("characters");
    return cache.characters[0];
  }

  const item = {
    id: makeId(),
    createdAt: Date.now(),
    name,
    description,
    image,
  };
  cache.characters = [item, ...cache.characters];
  persist("characters");
  return cache.characters[0];
}

export function deleteCharacter(id) {
  cache.characters = cache.characters.filter((c) => c.id !== id);
  persist("characters");
  emit();
}

// ---------------- Levels (with their layers) ----------------
export function listLevels() {
  return cache.levels;
}

export function saveLevel(level) {
  if (cache.levels[0] && level.previewImage && cache.levels[0].previewImage === level.previewImage) {
    return cache.levels[0];
  }
  const item = {
    id: makeId(),
    createdAt: Date.now(),
    name: level.name || autoName(level.description || level.theme),
    theme: level.theme || "",
    difficulty: level.difficulty || "",
    description: level.description || "",
    previewImage: level.previewImage || level.image || null,
    layers: level.layers || [], // reusable layers saved with the level
  };
  cache.levels = [item, ...cache.levels];
  persist("levels");
  emit();
  return item;
}

export function deleteLevel(id) {
  cache.levels = cache.levels.filter((l) => l.id !== id);
  persist("levels");
  emit();
}

// ---------------- Sounds (for later) ----------------
export function listSounds() {
  return cache.sounds;
}

export function saveSound(sound) {
  const item = {
    id: makeId(),
    createdAt: Date.now(),
    name: sound.name || "Sound",
    kind: sound.kind || "sound-effect",
    url: sound.url || null,
  };
  cache.sounds = [item, ...cache.sounds];
  persist("sounds");
  emit();
  return item;
}

// ---------------- Games (built in the Game Maker) ----------------
// A saved game is just its name + the engine recipe (GAME_CONFIG). Replaying it
// re-opens the same fixed engine with the same recipe, so it always plays back.
export function listGames() {
  return cache.games;
}

export function saveGame(game) {
  const item = {
    id: makeId(),
    createdAt: Date.now(),
    engine: game.engine || "platformer",
    name: game.name || "My Game",
    world: game.world || "",
    difficulty: game.difficulty || "",
    image: game.image || null,
    config: game.config || null,
  };
  cache.games = [item, ...cache.games];
  persist("games");
  emit();
  return item;
}

export function deleteGame(id) {
  cache.games = cache.games.filter((g) => g.id !== id);
  persist("games");
  emit();
}

export function deleteSound(id) {
  cache.sounds = cache.sounds.filter((s) => s.id !== id);
  persist("sounds");
  emit();
}

// ---------------- Helpers ----------------
export function libraryCounts() {
  return {
    characters: cache.characters.length,
    levels: cache.levels.length,
    sounds: cache.sounds.length,
  };
}

// ---------------- Learning Mode settings ----------------
// Opt-in "Learning Mode" that turns the existing render-wait mini-games and
// (optionally) between-moment gates into ONE real quick question. Defaults to
// OFF so the app behaves exactly as before unless a grown-up turns it on.
//
// Shape: { enabled: boolean, goal: "math" | "reading" | "mix", age: number }
// `age` is the child's age, used to size quiz difficulty. It lives inside the
// per-kid learning settings (already scoped + cloud-synced), so it follows the
// kid with NO database schema change.
const LEARNING_KEY = "learning";
const AGE_MIN = 3;
const AGE_MAX = 13;
const AGE_DEFAULT = 7;
const LEARNING_DEFAULTS = { enabled: false, goal: "math", age: AGE_DEFAULT };
const GOAL_OPTIONS = ["math", "reading", "mix"];
let learningCache = { ...LEARNING_DEFAULTS };
let learningChangedAt = 0; // ms of last local settings change (for cloud merge tie-break)

// Clamp any value to a sane child age, falling back to the default.
function clampAge(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return AGE_DEFAULT;
  return Math.min(AGE_MAX, Math.max(AGE_MIN, n));
}

export function learningAgeRange() {
  return { min: AGE_MIN, max: AGE_MAX, default: AGE_DEFAULT };
}

function normalizeLearning(raw) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const enabled = src.enabled === true;
  const goal = GOAL_OPTIONS.includes(src.goal) ? src.goal : LEARNING_DEFAULTS.goal;
  const age = clampAge(src.age == null ? AGE_DEFAULT : src.age);
  return { enabled, goal, age };
}

// Load persisted learning settings for the current scope into the cache.
// One-time migration: if a legacy un-suffixed "learning" exists and the scoped
// key doesn't yet, copy it into the current scope so existing data isn't lost.
async function loadLearningForScope() {
  try {
    let stored = await idbGet(scopedKey(LEARNING_KEY));
    if ((!stored || typeof stored !== "object" || Array.isArray(stored))) {
      const legacy = await idbGet(LEARNING_KEY);
      if (legacy && typeof legacy === "object" && !Array.isArray(legacy)) {
        stored = legacy;
        await idbSet(scopedKey(LEARNING_KEY), normalizeLearning(legacy));
      }
    }
    learningCache = (stored && typeof stored === "object" && !Array.isArray(stored))
      ? normalizeLearning(stored) : { ...LEARNING_DEFAULTS };
  } catch {
    // IndexedDB unavailable — keep safe defaults (OFF).
    learningCache = { ...LEARNING_DEFAULTS };
  }
}

// Synchronous read for the UI. Always returns a safe, normalized object.
export function getLearningSettings() {
  return { ...learningCache };
}

// Merge a patch into the learning settings, persist, and notify listeners.
export function setLearningSettings(patch) {
  learningCache = normalizeLearning({ ...learningCache, ...(patch || {}) });
  learningChangedAt = Date.now();
  idbSet(scopedKey(LEARNING_KEY), learningCache).catch(() => {});
  scheduleCloudPush();
  emit();
  return { ...learningCache };
}

export function learningGoalOptions() {
  return [...GOAL_OPTIONS];
}

// ---------------- Progress + badges ----------------
// On-device learning progress, only ever updated when Learning Mode is ON
// (callers gate this; recordAnswer also no-ops if Learning Mode is off). Kept
// next to the library data in the same IndexedDB store, mirroring the learning
// settings cache so reads stay synchronous for the UI. No accounts, no network.
//
// Shape:
//   {
//     totalCorrect, totalWrong,
//     bySubject: { math:{right,wrong}, geometry:{...}, spelling:{...}, reading:{...} },
//     lastActiveDate: "YYYY-MM-DD" | null,
//     streakDays, badges: [ids], created: <ms>
//   }
const PROGRESS_KEY = "progress";
const SUBJECTS = ["math", "geometry", "spelling", "reading"];

function emptySubjects() {
  const out = {};
  for (const s of SUBJECTS) out[s] = { right: 0, wrong: 0 };
  return out;
}

function progressDefaults() {
  return {
    totalCorrect: 0,
    totalWrong: 0,
    bySubject: emptySubjects(),
    lastActiveDate: null,
    streakDays: 0,
    badges: [],
    created: Date.now(),
  };
}

function normalizeProgress(raw) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const out = progressDefaults();
  out.totalCorrect = Number.isFinite(src.totalCorrect) ? src.totalCorrect : 0;
  out.totalWrong = Number.isFinite(src.totalWrong) ? src.totalWrong : 0;
  const bs = src.bySubject && typeof src.bySubject === "object" ? src.bySubject : {};
  for (const s of SUBJECTS) {
    const e = bs[s] && typeof bs[s] === "object" ? bs[s] : {};
    out.bySubject[s] = {
      right: Number.isFinite(e.right) ? e.right : 0,
      wrong: Number.isFinite(e.wrong) ? e.wrong : 0,
    };
  }
  out.lastActiveDate = typeof src.lastActiveDate === "string" ? src.lastActiveDate : null;
  out.streakDays = Number.isFinite(src.streakDays) ? src.streakDays : 0;
  out.badges = Array.isArray(src.badges) ? src.badges.filter((b) => typeof b === "string") : [];
  out.created = Number.isFinite(src.created) ? src.created : Date.now();
  return out;
}

let progressCache = progressDefaults();

// Badge catalog. Each `earned(progress)` is a pure predicate over progress.
// Labels/descriptions are plain text (no emoji); the UI draws SVG marks.
export const BADGES = [
  {
    id: "first-answer",
    label: "First Answer",
    description: "Answered your very first question.",
    earned: (p) => p.totalCorrect >= 1,
  },
  {
    id: "math-whiz",
    label: "Math Whiz",
    description: "Got 25 questions right.",
    earned: (p) => p.totalCorrect >= 25,
  },
  {
    id: "word-builder",
    label: "Word Builder",
    description: "Got 15 spelling questions right.",
    earned: (p) => (p.bySubject.spelling?.right || 0) >= 15,
  },
  {
    id: "bookworm",
    label: "Bookworm",
    description: "Got 10 reading questions right.",
    earned: (p) => (p.bySubject.reading?.right || 0) >= 10,
  },
  {
    id: "on-a-roll",
    label: "On a Roll",
    description: "Practiced 7 days in a row.",
    earned: (p) => p.streakDays >= 7,
  },
];

function recomputeBadges(progress) {
  const earned = BADGES.filter((b) => {
    try { return !!b.earned(progress); } catch { return false; }
  }).map((b) => b.id);
  const had = new Set(progress.badges || []);
  const newly = earned.filter((id) => !had.has(id));
  progress.badges = earned;
  return newly;
}

// Local calendar day as YYYY-MM-DD (device-local; streaks are about the kid's day).
function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayDiff(fromKey, toKey) {
  // Whole-day difference between two YYYY-MM-DD keys (toKey - fromKey).
  const a = new Date(fromKey + "T00:00:00");
  const b = new Date(toKey + "T00:00:00");
  return Math.round((b - a) / 86400000);
}

// Load persisted progress for the current scope into the cache.
// One-time migration from the legacy un-suffixed "progress" key (see loadLearningForScope).
async function loadProgressForScope() {
  try {
    let stored = await idbGet(scopedKey(PROGRESS_KEY));
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
      const legacy = await idbGet(PROGRESS_KEY);
      if (legacy && typeof legacy === "object" && !Array.isArray(legacy)) {
        stored = legacy;
        await idbSet(scopedKey(PROGRESS_KEY), normalizeProgress(legacy));
      }
    }
    progressCache = (stored && typeof stored === "object" && !Array.isArray(stored))
      ? normalizeProgress(stored) : progressDefaults();
  } catch {
    // IndexedDB unavailable — keep defaults.
    progressCache = progressDefaults();
  }
}

// Synchronous read for the UI. Returns a normalized copy.
export function getProgress() {
  return normalizeProgress(progressCache);
}

// Record a single answer. Returns the array of NEWLY earned badge ids (possibly
// empty). subject must be one of SUBJECTS; unknown subjects still bump totals.
// Safe to call always — does nothing unless Learning Mode is enabled.
export function recordAnswer({ subject, correct } = {}) {
  if (!learningCache.enabled) return [];

  const p = normalizeProgress(progressCache);

  // Streak update keyed on the calendar day, before counting the answer.
  const today = todayKey();
  if (p.lastActiveDate !== today) {
    if (p.lastActiveDate) {
      const diff = dayDiff(p.lastActiveDate, today);
      p.streakDays = diff === 1 ? (p.streakDays || 0) + 1 : 1;
    } else {
      p.streakDays = 1;
    }
    p.lastActiveDate = today;
  } else if (!p.streakDays) {
    p.streakDays = 1;
  }

  // Counts.
  if (correct) p.totalCorrect += 1; else p.totalWrong += 1;
  if (SUBJECTS.includes(subject)) {
    if (correct) p.bySubject[subject].right += 1;
    else p.bySubject[subject].wrong += 1;
  }

  const newly = recomputeBadges(p);

  progressCache = p;
  idbSet(scopedKey(PROGRESS_KEY), progressCache).catch(() => {});
  scheduleCloudPush();
  emit();
  return newly;
}

export function progressSubjects() {
  return [...SUBJECTS];
}

// ---------------- Practice what you missed ----------------
// On-device review queue: when a question is answered wrong (Learning Mode on),
// we store the FULL question object so it can be replayed EXACTLY later. When it
// is later answered right, it leaves the queue. We also expose weakestSubject()
// so callers can bias fresh questions toward where the kid struggles. No network.
const REVIEW_KEY = "review";
const REVIEW_MAX = 12;
let reviewCache = [];
let lastServedSig = null;

// Stable signature for de-duping / matching a question, independent of UI text.
function questionSig(q) {
  if (!q || typeof q !== "object") return "";
  const body = q.question || q.word_template || q.story || q.prompt || "";
  const choices = Array.isArray(q.choices) ? q.choices.join("") : "";
  return `${q.type || "?"}${body}${choices}`;
}

// Load the review queue for the current scope, migrating the legacy key once.
async function loadReviewForScope() {
  try {
    let stored = await idbGet(scopedKey(REVIEW_KEY));
    if (!Array.isArray(stored) || stored.length === 0) {
      const legacy = await idbGet(REVIEW_KEY);
      if (Array.isArray(legacy) && legacy.length) {
        stored = legacy;
        await idbSet(scopedKey(REVIEW_KEY), legacy.filter((x) => x && typeof x === "object"));
      }
    }
    reviewCache = Array.isArray(stored) ? stored.filter((x) => x && typeof x === "object") : [];
  } catch {
    // IndexedDB unavailable — keep empty.
    reviewCache = [];
  }
}

// Add a missed question to the review queue (newest last). No-op unless Learning
// Mode is on. De-duped by signature; capped at REVIEW_MAX (drops oldest).
export function recordMiss(question) {
  if (!learningCache.enabled || !question || typeof question !== "object") return;
  if (!Array.isArray(question.choices) || typeof question.correctIndex !== "number") return;
  const sig = questionSig(question);
  if (!sig) return;
  reviewCache = reviewCache.filter((x) => questionSig(x) !== sig);
  reviewCache.push({ ...question, _sig: sig, _missedAt: Date.now() });
  if (reviewCache.length > REVIEW_MAX) reviewCache = reviewCache.slice(reviewCache.length - REVIEW_MAX);
  idbSet(scopedKey(REVIEW_KEY), reviewCache).catch(() => {});
  scheduleCloudPush();
  emit();
}

// Remove a question from the review queue (call when answered right).
export function clearMiss(question) {
  if (!question || typeof question !== "object") return;
  const sig = questionSig(question);
  const before = reviewCache.length;
  reviewCache = reviewCache.filter((x) => questionSig(x) !== sig);
  if (reviewCache.length !== before) {
    idbSet(scopedKey(REVIEW_KEY), reviewCache).catch(() => {});
    scheduleCloudPush();
    emit();
  }
}

// Return one due review question (oldest first), avoiding the one just served
// when possible. Returns null if the queue is empty. Does not mutate the queue.
export function getReviewItem() {
  if (!learningCache.enabled || reviewCache.length === 0) return null;
  let pick = reviewCache.find((x) => questionSig(x) !== lastServedSig) || reviewCache[0];
  lastServedSig = questionSig(pick);
  // Strip internal fields before handing to the renderer.
  const { _sig, _missedAt, ...clean } = pick;
  return clean;
}

export function reviewCount() {
  return reviewCache.length;
}

// Subject with the lowest right/attempts ratio among subjects with enough
// attempts (>= 3). Returns null if none qualifies (so callers fall back to the
// normal goal-based pick).
export function weakestSubject(minAttempts = 3) {
  const p = normalizeProgress(progressCache);
  let worst = null;
  let worstRatio = 1.01;
  for (const s of SUBJECTS) {
    const e = p.bySubject[s] || { right: 0, wrong: 0 };
    const attempts = (e.right || 0) + (e.wrong || 0);
    if (attempts < minAttempts) continue;
    const ratio = (e.right || 0) / attempts;
    if (ratio < worstRatio) { worstRatio = ratio; worst = s; }
  }
  return worst;
}


// ---------------- Per-kid reload + cloud sync ----------------
// Learning Mode data is scoped per kid (keys like "progress:<kidId>"). When the
// active kid changes we must re-hydrate all three caches from that kid's scope.
// For SIGNED-IN accounts we additionally sync the blob to Supabase so a kid's
// progress follows them across devices. Guest mode stays 100% local (no network).

const CLOUD_DEBOUNCE_MS = 1500;
let cloudPushTimer = null;
let cloudPushScope = null; // scope id the pending push belongs to

// Snapshot the current scope's Learning Mode blob from the in-memory caches.
function currentBlob() {
  return {
    settings: { ...learningCache },
    progress: normalizeProgress(progressCache),
    review: Array.isArray(reviewCache) ? reviewCache.slice() : [],
    _settingsChangedAt: learningChangedAt,
  };
}

// Persist the merged blob back into the current scope's IndexedDB keys.
function persistBlobLocal() {
  idbSet(scopedKey(LEARNING_KEY), learningCache).catch(() => {});
  idbSet(scopedKey(PROGRESS_KEY), progressCache).catch(() => {});
  idbSet(scopedKey(REVIEW_KEY), reviewCache).catch(() => {});
}

// Conservative field-wise merge of a cloud blob into the live caches. Never
// loses local data: takes the MAX of counts/streak, UNION of badges/review.
function mergeCloudIntoLocal(cloud) {
  if (!cloud || typeof cloud !== "object") return;

  // Progress: MAX of every count, UNION of badges.
  const lp = normalizeProgress(progressCache);
  const cp = normalizeProgress(cloud.progress);
  const merged = progressDefaults();
  merged.totalCorrect = Math.max(lp.totalCorrect, cp.totalCorrect);
  merged.totalWrong = Math.max(lp.totalWrong, cp.totalWrong);
  for (const sub of SUBJECTS) {
    merged.bySubject[sub] = {
      right: Math.max(lp.bySubject[sub].right, cp.bySubject[sub].right),
      wrong: Math.max(lp.bySubject[sub].wrong, cp.bySubject[sub].wrong),
    };
  }
  merged.streakDays = Math.max(lp.streakDays, cp.streakDays);
  // Keep the most recent activity date (lexical compare works for YYYY-MM-DD).
  merged.lastActiveDate = [lp.lastActiveDate, cp.lastActiveDate]
    .filter(Boolean).sort().pop() || null;
  merged.created = Math.min(lp.created || Date.now(), cp.created || Date.now());
  merged.badges = Array.from(new Set([...(lp.badges || []), ...(cp.badges || [])]));
  // Recompute earned badges from merged counts so the set stays consistent,
  // then union with any historically earned ids.
  const recomputed = BADGES.filter((b) => { try { return !!b.earned(merged); } catch { return false; } }).map((b) => b.id);
  merged.badges = Array.from(new Set([...merged.badges, ...recomputed]));
  progressCache = merged;

  // Review: UNION by signature, cap at REVIEW_MAX (keep newest).
  const cloudReview = Array.isArray(cloud.review) ? cloud.review : [];
  const seen = new Set(reviewCache.map((x) => questionSig(x)));
  for (const item of cloudReview) {
    if (!item || typeof item !== "object") continue;
    const sig = item._sig || questionSig(item);
    if (sig && !seen.has(sig)) { seen.add(sig); reviewCache.push({ ...item, _sig: sig }); }
  }
  if (reviewCache.length > REVIEW_MAX) reviewCache = reviewCache.slice(reviewCache.length - REVIEW_MAX);

  // Settings: prefer whichever side changed most recently; default to local.
  const cloudAt = Number.isFinite(cloud._settingsChangedAt) ? cloud._settingsChangedAt : 0;
  if (cloudAt > learningChangedAt && cloud.settings) {
    learningCache = normalizeLearning(cloud.settings);
    learningChangedAt = cloudAt;
  }
}

// Debounced push of the current scope blob to the cloud (signed-in only).
function scheduleCloudPush() {
  if (!isSignedIn()) return;
  const id = scopeId();
  if (id === "guest") return;
  cloudPushScope = id;
  if (cloudPushTimer) clearTimeout(cloudPushTimer);
  cloudPushTimer = setTimeout(() => {
    cloudPushTimer = null;
    const blob = currentBlob();
    // Fire-and-forget; never throw or block on a failed network call.
    try {
      fetch("/api/save-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kidProfileId: cloudPushScope, data: blob }),
      }).catch(() => {});
    } catch {}
  }, CLOUD_DEBOUNCE_MS);
}

// Re-hydrate the three Learning Mode caches for the active kid, then (signed-in
// only) merge any cloud copy and push the merged result back. Safe to call any
// time; resolves after local load so the UI can refresh immediately.
export async function reloadLearningForActiveKid() {
  await Promise.all([loadLearningForScope(), loadProgressForScope(), loadReviewForScope()]);
  emit();

  // Cloud sync only for signed-in accounts with a real kid id. Guests stay local.
  const id = scopeId();
  if (isSignedIn() && id !== "guest") {
    try {
      const r = await fetch("/api/get-progress?kidProfileId=" + encodeURIComponent(id));
      const json = await r.json().catch(() => null);
      if (json && json.ok && json.data && typeof json.data === "object") {
        mergeCloudIntoLocal(json.data);
        persistBlobLocal();
        emit();
        // Push the merged blob so the cloud has the union too.
        try {
          fetch("/api/save-progress", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kidProfileId: id, data: currentBlob() }),
          }).catch(() => {});
        } catch {}
      }
    } catch {
      // Offline / not configured — local data already loaded, nothing to do.
    }
  }
}

// Kick off the first load for whatever kid is active at startup.
reloadLearningForActiveKid();
