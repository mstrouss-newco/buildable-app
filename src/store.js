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
const KINDS = ["characters", "levels", "sounds"];
const LEGACY_KEYS = { characters: "bk_characters", levels: "bk_levels", sounds: "bk_sounds" };

// In-memory cache — the source of truth for synchronous reads.
const cache = { characters: [], levels: [], sounds: [] };
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
// Shape: { enabled: boolean, goal: "math" | "reading" | "mix" }
const LEARNING_KEY = "learning";
const LEARNING_DEFAULTS = { enabled: false, goal: "math" };
const GOAL_OPTIONS = ["math", "reading", "mix"];
let learningCache = { ...LEARNING_DEFAULTS };

function normalizeLearning(raw) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const enabled = src.enabled === true;
  const goal = GOAL_OPTIONS.includes(src.goal) ? src.goal : LEARNING_DEFAULTS.goal;
  return { enabled, goal };
}

// Load persisted learning settings into the cache at startup (background).
(async function hydrateLearning() {
  try {
    const db = await openDB();
    const stored = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const r = tx.objectStore(STORE).get(LEARNING_KEY);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    if (stored && typeof stored === "object") learningCache = normalizeLearning(stored);
  } catch {
    // IndexedDB unavailable — keep safe defaults (OFF).
  }
  emit();
})();

// Synchronous read for the UI. Always returns a safe, normalized object.
export function getLearningSettings() {
  return { ...learningCache };
}

// Merge a patch into the learning settings, persist, and notify listeners.
export function setLearningSettings(patch) {
  learningCache = normalizeLearning({ ...learningCache, ...(patch || {}) });
  idbSet(LEARNING_KEY, learningCache).catch(() => {});
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

// Load persisted progress into the cache at startup (background).
(async function hydrateProgress() {
  try {
    const db = await openDB();
    const stored = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const r = tx.objectStore(STORE).get(PROGRESS_KEY);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    if (stored && typeof stored === "object") progressCache = normalizeProgress(stored);
  } catch {
    // IndexedDB unavailable — keep defaults.
  }
  emit();
})();

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
  idbSet(PROGRESS_KEY, progressCache).catch(() => {});
  emit();
  return newly;
}

export function progressSubjects() {
  return [...SUBJECTS];
}
