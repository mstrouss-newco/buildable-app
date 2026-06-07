// /src/store.js
// -------------------------------------------------------------
// "My Stuff" save layer for Buildable Kids.
//
// Right now this saves a child's characters, levels, and sounds
// on THIS device (no login needed), so anything they make is kept
// and can be reused.
//
// Later, once the parent login is connected, the marked spots
// below are where we'll also push/pull these to Supabase so the
// creations follow the account across devices.
// -------------------------------------------------------------

const KEYS = {
  characters: "bk_characters",
  levels: "bk_levels",
  sounds: "bk_sounds",
};

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || [];
  } catch {
    return [];
  }
}

function write(key, items) {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // device storage full or unavailable — fail quietly
  }
  // ---- CLOUD SYNC (later) ----
  // When logged in: also upsert `items` to the matching Supabase
  // table (characters / levels / sounds) for this account here.
}

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
  return read(KEYS.characters);
}

export function saveCharacter(character) {
  const items = read(KEYS.characters);
  // skip if it's an exact repeat of the most recent save
  if (items[0] && character.image && items[0].image === character.image) {
    return items[0];
  }
  const item = {
    id: makeId(),
    createdAt: Date.now(),
    name: character.name || autoName(character.description),
    description: character.description || "",
    image: character.image || null,
  };
  const next = [item, ...items];
  write(KEYS.characters, next);
  return item;
}

export function deleteCharacter(id) {
  write(KEYS.characters, read(KEYS.characters).filter((c) => c.id !== id));
}

// ---------------- Levels ----------------
export function listLevels() {
  return read(KEYS.levels);
}

export function saveLevel(level) {
  const items = read(KEYS.levels);
  if (items[0] && level.image && items[0].image === level.image) {
    return items[0];
  }
  const item = {
    id: makeId(),
    createdAt: Date.now(),
    name: level.name || autoName(level.description || level.theme),
    theme: level.theme || "",
    difficulty: level.difficulty || "",
    description: level.description || "",
    image: level.image || null,
  };
  const next = [item, ...items];
  write(KEYS.levels, next);
  return item;
}

export function deleteLevel(id) {
  write(KEYS.levels, read(KEYS.levels).filter((l) => l.id !== id));
}

// ---------------- Sounds (for later) ----------------
export function listSounds() {
  return read(KEYS.sounds);
}

export function saveSound(sound) {
  const items = read(KEYS.sounds);
  const item = {
    id: makeId(),
    createdAt: Date.now(),
    name: sound.name || "Sound",
    kind: sound.kind || "sound-effect",
    url: sound.url || null,
  };
  const next = [item, ...items];
  write(KEYS.sounds, next);
  return item;
}

export function deleteSound(id) {
  write(KEYS.sounds, read(KEYS.sounds).filter((s) => s.id !== id));
}

// ---------------- Helpers ----------------
export function libraryCounts() {
  return {
    characters: read(KEYS.characters).length,
    levels: read(KEYS.levels).length,
    sounds: read(KEYS.sounds).length,
  };
}
