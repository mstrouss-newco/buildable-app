// One-off: emit the five Dolch sight-word deck files.
// `heart` = the tricky letters that glow in the intro moment (heart-word method):
// the graphemes a kid cannot sound out and has to know by heart. Empty = fully
// decodable, nothing glows.
import fs from 'fs';
import path from 'path';

const OUT = 'public/practice/decks';

// word: heart-letter indices (0-based into the word)
const LISTS = [
  {
    id: 'sight-words-pre-primer', name: 'First Words', order: 1, grade: 'K',
    blurb: 'Where every reader starts',
    words: {
      'a': [0], 'and': [], 'away': [0], 'big': [], 'blue': [2, 3], 'can': [], 'come': [1, 3],
      'down': [], 'find': [1], 'for': [], 'funny': [], 'go': [], 'help': [], 'here': [1, 2, 3],
      'I': [0], 'in': [], 'is': [1], 'it': [], 'jump': [], 'little': [4, 5], 'look': [],
      'make': [], 'me': [], 'my': [], 'not': [], 'one': [0, 1, 2], 'play': [], 'red': [],
      'run': [], 'said': [1, 2], 'see': [], 'the': [2], 'three': [], 'to': [1], 'two': [1],
      'up': [], 'we': [], 'where': [2, 3, 4], 'yellow': [], 'you': [1, 2],
    },
  },
  {
    id: 'sight-words-primer', name: 'Next Words', order: 2, grade: 'K',
    blurb: 'For the end of kindergarten',
    words: {
      'all': [1, 2], 'am': [], 'are': [2], 'at': [], 'ate': [], 'be': [], 'black': [],
      'brown': [], 'but': [], 'came': [], 'did': [], 'do': [1], 'eat': [], 'four': [1, 2],
      'get': [], 'good': [1, 2], 'have': [3], 'he': [], 'into': [3], 'like': [], 'must': [],
      'new': [], 'no': [], 'now': [], 'on': [], 'our': [1, 2], 'out': [], 'please': [4, 5],
      'pretty': [2], 'ran': [], 'ride': [], 'saw': [], 'say': [], 'she': [], 'so': [],
      'soon': [], 'that': [], 'there': [2, 3, 4], 'they': [2, 3], 'this': [], 'too': [],
      'under': [], 'want': [1], 'was': [1, 2], 'well': [], 'went': [], 'what': [2],
      'white': [], 'who': [0, 1, 2], 'will': [], 'with': [], 'yes': [],
    },
  },
  {
    id: 'sight-words-first', name: 'First Grade', order: 3, grade: '1',
    blurb: 'For first grade',
    words: {
      'after': [], 'again': [2, 3], 'an': [], 'any': [0], 'as': [1], 'ask': [], 'by': [],
      'could': [1, 2, 3], 'every': [2], 'fly': [], 'from': [2], 'give': [3], 'going': [],
      'had': [], 'has': [2], 'her': [], 'him': [], 'his': [2], 'how': [], 'just': [],
      'know': [0], 'let': [], 'live': [3], 'may': [], 'of': [1], 'old': [], 'once': [0, 3],
      'open': [], 'over': [], 'put': [1], 'round': [], 'some': [1, 3], 'stop': [], 'take': [],
      'thank': [], 'them': [], 'then': [], 'think': [], 'walk': [1, 2], 'were': [1, 2, 3],
      'when': [],
    },
  },
  {
    id: 'sight-words-second', name: 'Second Grade', order: 4, grade: '2',
    blurb: 'For second grade',
    words: {
      'always': [0], 'around': [0], 'because': [3, 4, 6], 'been': [1, 2], 'before': [],
      'best': [], 'both': [1], 'buy': [1, 2], 'call': [1, 2], 'cold': [], 'does': [1, 2, 3],
      "don't": [], 'fast': [], 'first': [], 'five': [], 'found': [], 'gave': [], 'goes': [1, 2],
      'green': [], 'its': [], 'made': [], 'many': [1], 'off': [], 'or': [], 'pull': [1],
      'read': [], 'right': [1, 2, 3], 'sing': [], 'sit': [], 'sleep': [], 'tell': [],
      'their': [2, 3, 4], 'these': [], 'those': [], 'upon': [], 'us': [], 'use': [],
      'very': [], 'wash': [1], 'which': [], 'why': [], 'wish': [], 'work': [1, 2],
      'would': [1, 2, 3], 'write': [0], 'your': [1, 2, 3],
    },
  },
  {
    id: 'sight-words-third', name: 'Third Grade', order: 5, grade: '3',
    blurb: 'For third grade',
    words: {
      'about': [0], 'better': [], 'bring': [], 'carry': [], 'clean': [], 'cut': [],
      'done': [1, 3], 'draw': [], 'drink': [], 'eight': [1, 2, 3], 'fall': [1, 2], 'far': [],
      'full': [1], 'got': [], 'grow': [], 'hold': [], 'hot': [], 'hurt': [], 'if': [],
      'keep': [], 'kind': [1], 'laugh': [1, 2, 3, 4], 'light': [1, 2, 3], 'long': [],
      'much': [], 'myself': [], 'never': [], 'only': [0], 'own': [], 'pick': [], 'seven': [],
      'shall': [], 'show': [], 'six': [], 'small': [3, 4], 'start': [], 'ten': [],
      'today': [1], 'together': [1, 3], 'try': [], 'warm': [1, 2],
    },
  },
];

// The audio filename for a word. Lowercase, apostrophes dropped, so "don't"
// becomes dont.mp3 — a filename that survives every filesystem and URL.
const slug = (w) => w.toLowerCase().replace(/[^a-z]/g, '');

fs.mkdirSync(OUT, { recursive: true });
const index = [];
let grand = 0;

for (const list of LISTS) {
  const words = Object.keys(list.words);
  const items = words.map((w) => {
    const h = list.words[w];
    const it = { id: slug(w), prompt: w, answer: w, audio: slug(w) + '.mp3' };
    if (h && h.length) it.heart = h;
    return it;
  });
  // Guard against a typo silently pointing a glow at a letter that is not there.
  for (const it of items) {
    for (const i of (it.heart || [])) {
      if (i < 0 || i >= it.answer.length) throw new Error(`heart index ${i} out of range for "${it.answer}"`);
    }
  }
  const seen = new Set();
  for (const it of items) {
    if (seen.has(it.id)) throw new Error(`duplicate item id ${it.id} in ${list.id}`);
    seen.add(it.id);
  }
  const deck = {
    id: list.id,
    name: list.name,
    group: 'Sight Words',
    blurb: list.blurb,
    subject: 'reading',
    skill: list.id,
    grade: list.grade,
    order: list.order,
    // The kid picks the word off one of four big cards. The maths decks (PT3)
    // say 'keypad' instead. The engine reads neither — the page does.
    answerUI: 'choice',
    audioBase: '/practice/audio/words/',
    items,
  };
  fs.writeFileSync(path.join(OUT, list.id + '.json'), JSON.stringify(deck, null, 2) + '\n');
  index.push({
    id: deck.id, name: deck.name, group: deck.group, blurb: deck.blurb,
    subject: deck.subject, grade: deck.grade, order: deck.order,
    answerUI: deck.answerUI, count: items.length,
    file: '/practice/decks/' + list.id + '.json',
  });
  grand += items.length;
  console.log(`${list.id.padEnd(24)} ${String(items.length).padStart(3)} words`);
}

// Keep any deck this generator does not own (the maths decks from
// gen-practice-math-decks.mjs), so the two can be run in either order.
let keep = [];
try {
  keep = JSON.parse(fs.readFileSync(path.join(OUT, 'index.json'), 'utf8')).decks
    .filter((d) => d.subject !== 'reading');
} catch (e) { /* first run */ }
const all = index.concat(keep).sort((a, b) => (a.order || 0) - (b.order || 0));
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ decks: all }, null, 2) + '\n');
console.log('TOTAL'.padEnd(24) + String(grand).padStart(4) + ' words across ' + index.length + ' decks');
console.log('index.json now lists ' + all.length + ' decks');
