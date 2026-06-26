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
