/**
 * Content Moderation for Buildable Kids Community Library
 * 
 * Checks names and descriptions against blocklists before storing
 * Uses the existing blocklist approach from the app
 */

// Safe words and acceptable extras (from app's existing lists)
const SAFE_WORDS = new Set([
  'sky', 'cloud', 'bird', 'fly', 'jump', 'run', 'sun', 'moon', 'star',
  'tree', 'forest', 'grass', 'flower', 'mountain', 'water', 'river', 'lake',
  'castle', 'house', 'door', 'window', 'wall', 'rock', 'path', 'bridge',
  'character', 'player', 'game', 'level', 'world', 'adventure', 'quest',
  'friend', 'team', 'group', 'creature', 'animal', 'monster', 'dragon',
  'robot', 'alien', 'pirate', 'knight', 'wizard', 'fairy', 'superhero',
  'fast', 'slow', 'big', 'small', 'happy', 'sad', 'brave', 'funny',
  'red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'white',
  'black', 'gold', 'silver', 'magic', 'sparkle', 'shine', 'glow',
]);

const ACCEPTED_EXTRAS = new Set([
  'goblin', 'troll', 'orc', 'skeleton', 'zombie', // fantasy creatures
  'danger', 'challenge', 'battle', 'fight', // game words
  'poison', 'spiky', 'scary', // allowed descriptors
]);

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'is', 'are', 'was', 'be', 'that', 'this', 'it', 'by',
]);

// Explicitly blocked words (age-inappropriate, offensive, etc.)
const BLOCKED_WORDS = new Set([
  'bad', 'evil', 'kill', 'dead', 'hate', 'stupid', 'ugly', 'gross',
  'poop', 'pee', 'butt', 'fart', // bathroom humor (age-appropriate but discouraged in shared space)
  // Add more as needed; this is a starting template
]);

/**
 * Normalize text for filtering
 * - Convert to lowercase
 * - Replace leet speak (1337 speak)
 * - Remove punctuation
 */
function normalizeText(text) {
  let normalized = text.toLowerCase();
  
  // Leet speak normalization
  const leetMap = {
    '4': 'a', '@': 'a',
    '8': 'b',
    '3': 'e',
    '1': 'i', '!': 'i',
    '0': 'o',
    '5': 's', '$': 's',
    '7': 't',
    '2': 'z',
  };
  
  for (const [leet, letter] of Object.entries(leetMap)) {
    normalized = normalized.replace(new RegExp(leet, 'g'), letter);
  }
  
  // Remove punctuation
  normalized = normalized.replace(/[^a-z0-9\s]/g, '');
  
  return normalized;
}

/**
 * Check if text contains blocked words
 * Returns { isClean: boolean, flaggedWords: string[] }
 */
export function checkText(text) {
  const normalized = normalizeText(text);
  const words = normalized.split(/\s+/).filter(w => w.length > 0);
  
  const flaggedWords = [];
  
  for (const word of words) {
    // Skip stop words
    if (STOP_WORDS.has(word)) continue;
    
    // Check if it's explicitly blocked
    if (BLOCKED_WORDS.has(word)) {
      flaggedWords.push(word);
    }
    
    // Check if it's safe (whitelisted)
    // If a word is not in SAFE_WORDS or ACCEPTED_EXTRAS, flag it as suspicious
    if (!SAFE_WORDS.has(word) && !ACCEPTED_EXTRAS.has(word) && word.length > 2) {
      // Word is not explicitly blocked, but not in our safe list
      // For MVP, we can flag it for review but not auto-block
      // (This prevents overly restrictive filtering)
    }
  }
  
  return {
    isClean: flaggedWords.length === 0,
    flaggedWords,
  };
}

/**
 * Check a character name and description
 * Returns moderation status and whether it should be auto-approved
 */
export function moderateCharacter(name, description) {
  const nameCheck = checkText(name);
  const descCheck = checkText(description);
  
  const isSafe = nameCheck.isClean && descCheck.isClean;
  
  return {
    approved: isSafe,
    status: isSafe ? 'approved' : 'pending',
    nameCheck,
    descCheck,
    flaggedWords: [...nameCheck.flaggedWords, ...descCheck.flaggedWords],
  };
}

/**
 * Check a level name and description
 */
export function moderateLevel(name, description) {
  const nameCheck = checkText(name);
  const descCheck = checkText(description || '');
  
  const isSafe = nameCheck.isClean && descCheck.isClean;
  
  return {
    approved: isSafe,
    status: isSafe ? 'approved' : 'pending',
    nameCheck,
    descCheck,
    flaggedWords: [...nameCheck.flaggedWords, ...descCheck.flaggedWords],
  };
}

/**
 * Log a blocked word for review
 * (Can be called from API to track what kids are trying to submit)
 */
export async function logBlockedWord(supabase, word, context, deviceId) {
  try {
    await supabase
      .from('blocked_word_log')
      .insert([
        {
          word,
          context, // 'character_name', 'character_description', etc.
          device_id: deviceId,
        },
      ]);
  } catch (err) {
    console.error('Failed to log blocked word:', err);
  }
}

export default {
  checkText,
  moderateCharacter,
  moderateLevel,
  logBlockedWord,
  normalizeText,
};
