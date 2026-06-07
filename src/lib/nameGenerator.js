/**
 * Name Generator for Buildable Kids
 * 
 * Generates unique, playful, kid-friendly names for:
 * - Characters (e.g., "Sir Wobblefang", "Zappy McSparkle")
 * - Levels (e.g., "Enchanted Forest Escape", "Moonlight Castle Adventure")
 * 
 * Uses deterministic seeding to avoid repeats while staying fun and varied.
 */

const CHARACTER_ADJECTIVES = [
  'Zappy', 'Wobbly', 'Sparkly', 'Bouncy', 'Zippy', 'Giggly', 'Fuzzy', 'Speedy',
  'Silly', 'Twirly', 'Snappy', 'Chirpy', 'Wiggly', 'Jolly', 'Tickly', 'Mighty',
  'Brave', 'Swift', 'Clever', 'Wild', 'Nutty', 'Sleepy', 'Grumpy', 'Shy',
  'Charming', 'Dashing', 'Energetic', 'Fancy', 'Grand', 'Graceful', 'Happy',
  'Icy', 'Jazzy', 'Kindhearted', 'Lively', 'Merry', 'Nice', 'Optimal', 'Playful',
  'Quick', 'Radiant', 'Strong', 'Twinkly', 'Unique', 'Vivid', 'Wonderful',
  'Zippy', 'Adorable', 'Bold', 'Curious', 'Daring', 'Exciting', 'Fearless',
  'Goofy', 'Helpful', 'Incredible', 'Joyful', 'Keen', 'Loving', 'Mischievous',
];

const CHARACTER_NOUNS = [
  'McSparkle', 'Fang', 'Wings', 'Zoom', 'Bounce', 'Whirl', 'Dash', 'Splash',
  'Thunder', 'Whisker', 'Fluff', 'Spark', 'Bolt', 'Claw', 'Stripe', 'Spot',
  'Flame', 'Frost', 'Storm', 'Breeze', 'Wave', 'Tail', 'Paw', 'Snout',
  'Horn', 'Spike', 'Scale', 'Feather', 'Ripple', 'Shimmer', 'Glow', 'Echo',
  'Roar', 'Chirp', 'Buzz', 'Hoot', 'Ping', 'Boing', 'Zing', 'Pow',
  'Star', 'Moon', 'Sun', 'Cloud', 'Rainbow', 'Crystal', 'Jewel', 'Gem',
];

const LEVEL_ADJECTIVES = [
  'Enchanted', 'Magical', 'Secret', 'Hidden', 'Mysterious', 'Ancient', 'Floating',
  'Crystal', 'Golden', 'Silver', 'Emerald', 'Ruby', 'Moonlit', 'Sunny', 'Starry',
  'Tropical', 'Frozen', 'Fiery', 'Misty', 'Shimmering', 'Glowing', 'Sparkling',
  'Whimsical', 'Grand', 'Royal', 'Mighty', 'Brave', 'Dark', 'Bright', 'Wild',
  'Lost', 'Forgotten', 'Legendary', 'Mythical', 'Cosmic', 'Ethereal', 'Phantom',
];

const LEVEL_NOUNS = [
  'Forest', 'Castle', 'Mountain', 'Valley', 'Kingdom', 'Island', 'Garden',
  'Temple', 'Palace', 'Cavern', 'Tower', 'Realm', 'Land', 'Sea', 'Sky',
  'City', 'Village', 'Fortress', 'Sanctuary', 'Haven', 'Paradise', 'Adventure',
  'Quest', 'Journey', 'Escape', 'Challenge', 'Expedition', 'Mission', 'World',
];

const LEVEL_ACTIONS = [
  'Escape', 'Adventure', 'Quest', 'Challenge', 'Run', 'Explore', 'Discover',
  'Journey', 'Rescue', 'Search', 'Climb', 'Sail', 'Flight', 'Expedition',
];

/**
 * Simple hash function to generate a number from a string
 * Used for deterministic name generation
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Generate a unique character name
 * @param {string} description - The character description (used for deterministic variation)
 * @param {number} existingCount - How many characters already exist (for uniqueness)
 * @returns {string} A fun character name like "Sir Wobblefang"
 */
export function generateCharacterName(description = '', existingCount = 0) {
  const hash = hashString(description + existingCount.toString());
  const adjIdx = hash % CHARACTER_ADJECTIVES.length;
  const nounIdx = (hash >> 8) % CHARACTER_NOUNS.length;
  
  const adjective = CHARACTER_ADJECTIVES[adjIdx];
  const noun = CHARACTER_NOUNS[nounIdx];
  
  return `${adjective} ${noun}`;
}

/**
 * Generate a unique level name
 * @param {string} description - The level description
 * @param {string} theme - The theme (forest, castle, space, etc.)
 * @param {number} existingCount - How many levels already exist
 * @returns {string} A fun level name like "Enchanted Forest Escape"
 */
export function generateLevelName(description = '', theme = '', existingCount = 0) {
  const hash = hashString(description + theme + existingCount.toString());
  
  const adjIdx = hash % LEVEL_ADJECTIVES.length;
  const nounIdx = (hash >> 8) % LEVEL_NOUNS.length;
  const actionIdx = (hash >> 16) % LEVEL_ACTIONS.length;
  
  const adjective = LEVEL_ADJECTIVES[adjIdx];
  const noun = LEVEL_NOUNS[nounIdx];
  const action = LEVEL_ACTIONS[actionIdx];
  
  // Compose: "Adjective Noun Action" e.g., "Enchanted Forest Escape"
  return `${adjective} ${noun} ${action}`;
}

/**
 * Generate a unique asset ID for layers
 * @param {string} layerType - Type of layer: 'sky', 'midground', 'platforms', 'foreground'
 * @param {string} theme - The theme
 * @param {number} index - Which variant this is (for uniqueness)
 * @returns {string} An ID like "sky_clouds_001"
 */
export function generateAssetId(layerType = '', theme = '', index = 1) {
  const themeSlug = (theme || 'generic').toLowerCase().replace(/\s+/g, '_');
  const paddedIndex = String(index).padStart(3, '0');
  return `${layerType}_${themeSlug}_${paddedIndex}`;
}

export default {
  generateCharacterName,
  generateLevelName,
  generateAssetId,
};
