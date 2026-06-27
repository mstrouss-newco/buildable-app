// /api/sfx.js — short ambient sound effects (e.g. a trickling stream) generated
// once via ElevenLabs sound-generation, cached, and served as a loopable clip.
//   GET ?s=water   -> audio/mpeg (generates+caches on first call)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const SOUNDS = {
  water: "Gentle continuous trickling forest stream, soft babbling water over pebbles, calm and steady, seamless ambient loop, no music, no voices",
  fire:  "Soft crackling cozy campfire, gentle pops, warm ambient loop, no music, no voices",
  waves: "Gentle calm ocean waves lapping softly, peaceful seaside ambient loop, no music, no voices",
  forest:  "Peaceful daytime forest ambience, gentle birdsong and soft rustling leaves, calm and airy, seamless ambient loop, no music, no voices",
  crickets:"Calm nighttime crickets chirping softly with a gentle breeze, peaceful evening ambient loop, no music, no voices",
  wind:    "Soft gentle wind blowing across a wide snowy mountain landscape, calm airy whoosh, seamless ambient loop, no music, no voices",
  jungle:  "Lush tropical jungle ambience, distant exotic birds and soft chirping insects, gentle and warm, seamless ambient loop, no music, no voices",
  space:   "Soft calm cosmic outer-space ambience, gentle airy hum with faint twinkles, dreamy, seamless ambient loop, no music, no voices",
  candy:   "Light whimsical magical sparkle chimes and soft twinkles, cheerful and gentle, seamless ambient loop, no music, no voices",
  rain:    "Gentle soft steady rainfall, soothing calm raindrops, seamless ambient loop, no music, no voices",

  // ---- Chess game one-shot SFX (short, punchy, kid-friendly cartoon sounds) ----
  chess_select:  "Short soft UI pluck pop, friendly cartoon select blip, single hit, no music",
  chess_move:    "Short soft wooden tap whoosh, a game piece sliding and tapping down, single hit, no music",
  chess_check:   "Short playful alert chime, two quick rising warning notes, cartoon, single hit, no music",
  chess_castle:  "Two quick soft stone thuds with a light shuffle, cartoon, single hit, no music",
  chess_promote: "Cheerful rising magical sparkle chime, power-up level-up, short, no music",
  chess_win:     "Happy short victory fanfare with a sparkle, cheerful kids game win, no voices",
  chess_lose:    "Gentle soft descending wah-wah, friendly cartoon lose, short, no music",
  chess_capture:         "Short cartoon pop and crunch impact, a game piece knocked out, single hit, no music",
  chess_capture_space:   "Short sci-fi laser pew then a small explosion, cartoon space zap, single hit, no music",
  chess_capture_castle:  "Short metallic sword swipe slash with a bright clang, cartoon, single hit, no music",
  chess_capture_jungle:  "Short whoosh then a hollow wooden coconut bonk with a comic boing, cartoon, single hit, no music",
  chess_capture_ocean:   "Short watery bubble gulp and splash, cartoon underwater, single hit, no music",
  chess_capture_candy:   "Short crisp sugar-glass shatter and candy crunch, cartoon, single hit, no music",
  chess_capture_desert:  "Short soft sandy poof puff with a light whoosh, cartoon desert, single hit, no music",

  // ---- Tennis game one-shot SFX (short, punchy, kid-friendly) ----
  tennis_hit:   "Short bright bouncy paddle bonk, a soft ball thwack off a paddle, cheerful cartoon, single hit, no music, no voices",
  tennis_wall:  "Short soft low wall thud bounce, a ball tapping a side wall, gentle cartoon, single hit, no music, no voices",
  tennis_point: "Short cheerful little ding plus a soft whoosh, a point scored, friendly cartoon, single hit, no music, no voices",
  tennis_win:   "Happy short victory fanfare with a sparkle, cheerful kids game win, no voices",
  tennis_lose:  "Gentle soft descending wah-wah, friendly cartoon lose, short, no music",
  tennis_boom:  "Short punchy cartoon explosion boom with a bright sparkly pop, fun and friendly, single hit, no music, no voices",
  tennis_cheer: "Short happy little crowd cheer and clap, cheerful kids celebration, single hit, no music",

  // Breaker (brick-breaker) one-shots
  breaker_smash: "Short crisp cartoon brick crunch and pop, a block breaking apart, single hit, no music, no voices",
  breaker_break: "Short bright satisfying glassy block shatter with a sparkly twinkle, single hit, no music, no voices",
  breaker_power: "Short cheerful rising magical sparkle power-up chime, friendly cartoon, no music, no voices",
  breaker_miss:  "Short soft descending cartoon womp, a ball slipping past, gentle and not harsh, single hit, no music, no voices",

  // Board games (Tic-Tac-Toe, Connect Four, Dots and Boxes) one-shots
  board_place: "Short soft friendly cartoon click tap, placing a game piece down, single hit, no music, no voices",
  board_drop:  "Short cheerful plastic disc plonk dropping and settling into a slot, single hit, no music, no voices",
  board_line:  "Short soft crayon line stroke drawn on paper with a gentle tap, single hit, no music, no voices",
  board_claim: "Short happy sparkly pop chime, a box being won and claimed, cheerful cartoon, single hit, no music, no voices",
  board_win:   "Happy short victory fanfare with a bright sparkle, cheerful kids board game win, no voices",
  board_draw:  "Short gentle friendly two-note chime, a tied game, not sad, single hit, no music, no voices",

  // ---- Story narrative one-shots (door opens, thunder, etc.) ----
  door:      "Short wooden door creaking slowly open with a soft latch click, single hit, no music, no voices",
  knock:     "Three soft friendly knocks on a wooden door, single hit, no music, no voices",
  thunder:   "Short gentle rolling thunder rumble with a soft crackle, not scary, single hit, no music, no voices",
  firewhoosh:"Short soft whoosh of a cozy fire catching and crackling to life, single hit, no music, no voices",
  splash:    "Short playful water splash and plop, single hit, no music, no voices",
  magic:     "Short twinkly magical sparkle chime rising up, whimsical, single hit, no music, no voices",
  pop:       "Short soft cartoon pop, single hit, no music, no voices",
  whoosh:    "Short quick gentle whoosh swipe, single hit, no music, no voices",
  footsteps: "A few soft padding footsteps walking on a path, single hit, no music, no voices",
  bell:      "Short gentle bright bell ding, single hit, no music, no voices",
  rustle:    "Short soft rustle of leaves and bushes moving, single hit, no music, no voices",
  sparkle:   "Short delicate fairy sparkle shimmer, twinkling, single hit, no music, no voices",

  // ---- Space Sparkles (survival game type) — bespoke SFX ----
  spk_shoot:   "Short soft sci-fi laser pew zap, cute friendly cartoon star blaster, single quick hit, no music, no voices",
  spk_coin:    "Short bright cheerful star-coin pickup ding with a tiny sparkle, single hit, no music, no voices",
  spk_coinbig: "Short rich rewarding jackpot star-coin chime with a sparkle cascade, cheerful, single hit, no music, no voices",
  spk_levelup: "Cheerful rising magical power-up sparkle chime, bright and triumphant, short, no music, no voices",
  spk_hurt:    "Short soft cartoon ouch bonk thud, gentle and not scary, single hit, no music, no voices",
  spk_pop:     "Short cute squishy cartoon splat pop, a space slime bursting, single hit, no music, no voices",
  spk_boom:    "Short punchy cartoon space explosion boom with sparkly debris, big but friendly, single hit, no music, no voices",
  spk_boss:    "Short playful but ominous boss-appear sci-fi horn sting, cartoon, single hit, no music, no voices",
  spk_win:     "Happy short victory fanfare with a bright cosmic sparkle, cheerful kids game win, no voices",
  spk_lose:    "Gentle soft descending wah-wah with a little twinkle, friendly cartoon lose, short, no music, no voices",

  // ---- Sound Machine: silly kid-fun one-shots (public/soundboard.html) ----
  fart:        "Short funny wet squelchy fart, silly whoopee cushion raspberry toot, comedic cartoon, single hit, no music, no voices",
  giggle:      "Short cute happy kid giggle laugh, playful and silly, single hit, no music",
  roar:        "Short friendly cartoon dinosaur roar, playful not scary, single hit, no music, no voices",
  robot:       "Short playful robot beep-boop blip voice, retro cartoon, single hit, no music",
  splat:       "Short comedic wet splat squish, silly cartoon, single hit, no music, no voices",
  cash:        "Short bright cash register cha-ching ka-ching, cheerful, single hit, no music, no voices",
  drumroll:    "Short snappy drum roll ending in a cymbal crash, single hit, no music, no voices",
  gong:        "Short deep comedic gong bong, single hit, no music, no voices",
  frog:        "Short funny cartoon frog ribbit croak, silly, single hit, no music, no voices",
  moo:         "Short friendly cartoon cow moo, single hit, no music, no voices",
  rooster:     "Short cheerful rooster cock-a-doodle-doo crow, single hit, no music, no voices",
  vroom:       "Short playful toy race car engine vroom zoom, single hit, no music, no voices",
  sneeze:      "Short silly cartoon achoo sneeze, goofy, single hit, no music",
  partypop:    "Short fun party popper pop with confetti and a little cheer, celebratory, single hit, no music",
  boom:        "Short cartoon comic kaboom explosion, big silly boom, playful not scary, single hit, no music, no voices",
  boing:       "Short bouncy cartoon spring boing, comedic sproing, single hit, no music, no voices",
  burp:        "Short funny little cartoon burp, silly and goofy, single hit, not gross, no music, no voices",
  honk:        "Short silly clown bicycle horn honk honk, comedic, single hit, no music, no voices",
  tada:        "Short cheerful ta-da success fanfare sting, happy reveal, single hit, no voices",
  laser:       "Short zippy sci-fi laser pew zap, playful cartoon, single hit, no music, no voices",
  ding:        "Short bright cheerful correct-answer ding ting, happy, single hit, no music, no voices",
  buzzer:      "Short funny wrong-answer game-show buzzer buzz, comedic, single hit, no music, no voices",
  sadtrombone: "Short funny sad trombone womp womp waaah, comedic gentle fail, single hit, no music, no voices",
  squeak:      "Short cute rubber duck toy squeak, single hit, no music, no voices",
  airhorn:     "Short fun party air horn blast, celebratory, single hit, no music, no voices",
  bonk:        "Short comedic cartoon bonk thwack, silly soft impact, single hit, no music, no voices",
  slidewhistle:"Short comedic slide whistle swooping up, silly, single hit, no music, no voices",
  meow:        "Short cute kitten meow, friendly, single hit, no music, no voices",
  woof:        "Short friendly small happy dog woof, single hit, no music, no voices",
  quack:       "Short silly cartoon duck quack, single hit, no music, no voices",
  cheer:       "Short happy little group of kids cheering yay and clapping, celebratory, single hit, no music",
  // ---- Art Studio — bespoke brush + UI SFX (one-shots, short) ----
  art_crayon:  "Short soft waxy crayon scribble scratch on paper, gentle, single hit, no music, no voices",
  art_marker:  "Short soft squeaky felt-tip marker stroke gliding on paper, single hit, no music, no voices",
  art_paint:   "Short soft wet paintbrush swish stroke with a tiny splatter, single hit, no music, no voices",
  art_pencil:  "Short light pencil sketching scratch on paper, fine and soft, single hit, no music, no voices",
  art_chalk:   "Short soft dusty chalk drag on a board, gentle grain, single hit, no music, no voices",
  art_spray:   "Short soft spray-can hiss puff of paint, single hit, no music, no voices",
  art_neon:    "Short soft electric neon hum zap with a bright shimmer, single hit, no music, no voices",
  art_glitter: "Short delicate sparkly glitter twinkle shimmer dropping, magical, single hit, no music, no voices",
  art_stamp:   "Short cute soft cartoon stamp thunk with a tiny boing, single hit, no music, no voices",
  art_fill:    "Short happy watery paint-bucket splash fill, single hit, no music, no voices",
  art_undo:    "Short soft reverse whoosh swipe, gentle, single hit, no music, no voices",
  art_save:    "Cheerful short sparkle save chime, bright and proud, single hit, no music, no voices",
  // ---- Themed sound packs (public/soundboard.html) ----
  lion: "Short mighty lion roar, friendly cartoon, not scary, single hit, no music, no voices",
  elephant: "Short cartoon elephant trumpet call, single hit, no music, no voices",
  monkey: "Short playful cartoon monkey ooh ooh ah chatter, single hit, no music, no voices",
  horse: "Short friendly horse neigh whinny, single hit, no music, no voices",
  owl: "Short gentle owl hoot hoot, single hit, no music, no voices",
  wolf: "Short cartoon wolf howl, playful not scary, single hit, no music, no voices",
  sheep: "Short cute sheep baa bleat, single hit, no music, no voices",
  pig: "Short funny pig oink snort, single hit, no music, no voices",
  bird: "Short cheerful little bird tweet chirp, single hit, no music, no voices",
  snake: "Short soft snake hiss, cartoon, single hit, no music, no voices",
  bee: "Short buzzing bumblebee bzzz, single hit, no music, no voices",
  catpurr: "Short cute kitten purr, single hit, no music, no voices",
  dolphin: "Short cheerful dolphin click squeak, single hit, no music, no voices",
  piano: "Short bright cheerful piano riff flourish, single hit, no voices",
  guitar: "Short fun acoustic guitar strum, single hit, no voices",
  trumpet: "Short triumphant trumpet fanfare toot, single hit, no voices",
  violin: "Short playful violin pizzicato pluck phrase, single hit, no voices",
  flute: "Short whimsical flute trill, single hit, no voices",
  xylophone: "Short cheerful xylophone glissando run up, single hit, no voices",
  tambourine: "Short lively tambourine shake jingle, single hit, no voices",
  cymbal: "Short bright cymbal crash, single hit, no voices",
  harp: "Short magical harp glissando sweep, single hit, no voices",
  sax: "Short smooth playful saxophone riff, single hit, no voices",
  chime: "Short shimmering wind chime ting, single hit, no voices",
  accordion: "Short jolly accordion squeeze chord, single hit, no voices",
  spaceship: "Short sci-fi spaceship fly-by whoosh, single hit, no music, no voices",
  teleport: "Short sci-fi teleport beam shimmer, single hit, no music, no voices",
  rocket: "Short rocket launch whoosh rumble, single hit, no music, no voices",
  ufo: "Short wobbly UFO hover warble, single hit, no music, no voices",
  blaster: "Short sci-fi blaster zap shot, cartoon, single hit, no music, no voices",
  powerup: "Short bright video game power-up rising chime, single hit, no music, no voices",
  forcefield: "Short sci-fi force field shield hum zap, single hit, no music, no voices",
  alien: "Short funny friendly alien blip warble, single hit, no music, no voices",
  warp: "Short sci-fi warp speed zoom whoosh, single hit, no music, no voices",
  scan: "Short sci-fi scanner ping sweep, single hit, no music, no voices",
  beepboop: "Short cute robot beep boop melody, single hit, no music, no voices",
  ghost: "Short playful ghost wooo whooo, spooky but not scary, single hit, no music",
  spookywind: "Short eerie spooky wind whoosh, gentle not scary, single hit, no music, no voices",
  witch: "Short playful witch cackle laugh, spooky fun not scary, single hit, no music",
  heartbeat: "Short steady spooky heartbeat thump thump, single hit, no music, no voices",
  monster: "Short silly friendly monster growl, not scary, single hit, no music, no voices",
  chains: "Short rattling spooky chains, single hit, no music, no voices",
  creak: "Short slow spooky wooden creak, single hit, no music, no voices",
  bat: "Short fluttering bat wings screech, gentle, single hit, no music, no voices",
  cauldron: "Short bubbling witch cauldron potion gloop, single hit, no music, no voices",
  carhorn: "Short friendly car horn beep beep, single hit, no music, no voices",
  train: "Short cheerful train choo choo whistle, single hit, no music, no voices",
  airplane: "Short airplane jet fly-by whoosh, single hit, no music, no voices",
  helicopter: "Short helicopter rotor whirl chop, single hit, no music, no voices",
  motorcycle: "Short motorcycle engine rev vroom, single hit, no music, no voices",
  truck: "Short big truck air horn honk, single hit, no music, no voices",
  boat: "Short boat ship foghorn toot, single hit, no music, no voices",
  siren: "Short playful police siren wee woo, single hit, no music, no voices",
  bikebell: "Short bright bicycle bell ring ring, single hit, no music, no voices",
  skid: "Short cartoon tire screech skid, single hit, no music, no voices",
  fairy: "Short delicate fairy sparkle shimmer giggle, single hit, no music",
  spell: "Short magical spell cast whoosh sparkle, single hit, no music, no voices",
  potion: "Short bubbly magic potion fizz pour, single hit, no music, no voices",
  wandzap: "Short magic wand twinkle zap, single hit, no music, no voices",
  dragon: "Short friendly cartoon dragon roar with a little fire whoosh, not scary, single hit, no music, no voices",
  shield: "Short magic shield shimmer ding, single hit, no music, no voices",
  levelup: "Short cheerful level up victory jingle, single hit, no music",
  treasure: "Short sparkling treasure chest open reveal chime, single hit, no music, no voices",
  portal: "Short swirling magic portal whoosh, single hit, no music, no voices",
  fireball: "Short whooshing cartoon fireball cast, single hit, no music, no voices",
  birds: "Short cheerful morning birdsong chirping, single hit, no music, no voices",
  waterfall: "Short gentle waterfall splash, single hit, no music, no voices",
  bubbles: "Short playful underwater bubbles blub, single hit, no music, no voices",
  sunrise: "Short gentle magical morning shimmer chime, single hit, no music, no voices",
  crunch: "Short crispy chip crunch bite, single hit, no music, no voices",
  slurp: "Short funny slurp drink, single hit, no music, no voices",
  sizzle: "Short food sizzling on a hot pan, single hit, no music, no voices",
  gulp: "Short comedic gulp swallow, single hit, no music, no voices",
  chomp: "Short cartoon chomp munch bite, single hit, no music, no voices",
  fizz: "Short fizzy soda can open fizz, single hit, no music, no voices",
  blender: "Short kitchen blender whirr, single hit, no music, no voices",
  microwave: "Short microwave oven done ding, single hit, no music, no voices",
  popcorn: "Short popcorn popping pops, single hit, no music, no voices",
  cheersclink: "Short glass clink cheers toast, single hit, no music, no voices",
  refwhistle: "Short sharp referee whistle tweet, single hit, no music, no voices",
  bounce: "Short basketball bounce dribble, single hit, no music, no voices",
  swish: "Short basketball net swish, single hit, no music, no voices",
  kick: "Short soccer ball kick thump, single hit, no music, no voices",
  batcrack: "Short baseball bat crack hit, single hit, no music, no voices",
  crowd: "Short stadium crowd cheer roar, single hit, no music",
  goal: "Short triumphant goal scored fanfare with crowd, single hit, no music",

  // ---- Batch 2 simple games: Memory, Bingo, Snakes & Ladders (bespoke one-shots) ----
  mem_flip:     "Short soft satisfying card flip whoosh with a tiny tap, a memory card turning over, single hit, no music, no voices",
  mem_match:    "Short cheerful sparkly ding-ding match-found chime with a happy little pop, a matching pair, single hit, no music, no voices",
  mem_flipback: "Short soft gentle low whoosh, two cards flipping back face-down, not harsh, single hit, no music, no voices",
  party_win:    "Short joyful celebration fanfare with a party-popper pop, confetti sparkle and a tiny kid cheer, cheerful kids game win, no voices",
  bingo_call:   "Short bright cheerful announce ding with a soft attention bell, a bingo number being called, single hit, no music, no voices",
  bingo_daub:   "Short soft chunky ink-stamp daub thunk with a tiny squish, marking a bingo square, single hit, no music, no voices",
  dice_roll:    "Short playful wooden dice shake and tumble roll landing with a tap, single hit, no music, no voices",
  snl_ladder:   "Short cheerful rising sparkle slide-whistle climb up, going up a ladder, bright and happy, single hit, no music, no voices",
  snl_snake:    "Short playful descending wobble slide-whistle whoosh, sliding down a snake, silly not scary, single hit, no music, no voices",
};
// One-shot game SFX are short; ambience loops stay long.
const DURATIONS = {
  chess_select:0.4, chess_move:0.5, chess_check:0.7, chess_castle:0.7, chess_promote:1.0,
  chess_win:1.6, chess_lose:1.0, chess_yourturn:0.5, chess_capture:0.8,
  chess_capture_space:1.0, chess_capture_castle:0.8, chess_capture_jungle:0.9,
  chess_capture_ocean:0.9, chess_capture_candy:0.8, chess_capture_desert:0.9,
  tennis_hit:0.35, tennis_wall:0.3, tennis_point:0.6, tennis_win:1.6, tennis_lose:1.0,
  tennis_boom:0.6, tennis_cheer:1.4,
  breaker_smash:0.5, breaker_break:0.6, breaker_power:0.8, breaker_miss:0.6,
  board_place:0.5, board_drop:0.5, board_line:0.5, board_claim:0.6, board_win:1.6, board_draw:0.7,
  door:1.3, knock:1.0, thunder:1.8, firewhoosh:1.2, splash:0.8, magic:1.1, pop:0.5, whoosh:0.6, footsteps:1.2, bell:0.8, rustle:0.9, sparkle:1.0,
  spk_shoot:0.5, spk_coin:0.5, spk_coinbig:0.8, spk_levelup:1.0, spk_hurt:0.5, spk_pop:0.5, spk_boom:0.9, spk_boss:0.8, spk_win:1.6, spk_lose:1.0,
  fart:1.0, boom:1.2, boing:0.5, burp:0.8, honk:0.6, tada:1.2, laser:0.5, ding:0.5,
  giggle:0.9, roar:1.0, robot:0.8, splat:0.5, cash:0.7, drumroll:1.3, gong:1.4,
  frog:0.6, moo:1.0, rooster:1.2, vroom:1.0, sneeze:0.8, partypop:1.0,
  buzzer:0.7, sadtrombone:1.4, squeak:0.5, airhorn:0.9, bonk:0.5, slidewhistle:0.7,
  meow:0.7, woof:0.5, quack:0.5, cheer:1.4,
  art_crayon:0.4, art_marker:0.4, art_paint:0.5, art_pencil:0.4, art_chalk:0.4, art_spray:0.5,
  art_neon:0.5, art_glitter:0.6, art_stamp:0.4, art_fill:0.6, art_undo:0.4, art_save:1.2,
  lion:1.2, elephant:1.0, monkey:0.9, horse:1.0, owl:0.9, wolf:1.2, sheep:0.7, pig:0.7, bird:0.6, snake:0.7, bee:0.7, catpurr:0.9, dolphin:0.8, piano:1.0, guitar:0.8, trumpet:1.0, violin:0.9, flute:0.9, xylophone:0.9, tambourine:0.6, cymbal:0.8, harp:1.1, sax:1.0, chime:0.9, accordion:0.9, spaceship:0.9, teleport:0.9, rocket:1.2, ufo:1.0, blaster:0.5, powerup:0.9, forcefield:0.8, alien:0.8, warp:1.0, scan:0.8, beepboop:0.7, ghost:1.0, spookywind:1.2, witch:1.0, heartbeat:1.0, monster:0.9, chains:0.9, creak:1.0, bat:0.7, cauldron:1.0, carhorn:0.6, train:1.2, airplane:1.0, helicopter:1.0, motorcycle:0.9, truck:0.8, boat:1.0, siren:1.2, bikebell:0.6, skid:0.7, fairy:0.9, spell:0.9, potion:0.9, wandzap:0.7, dragon:1.1, shield:0.7, levelup:1.0, treasure:1.0, portal:1.0, fireball:0.8, birds:1.0, waterfall:1.0, bubbles:0.7, sunrise:1.0, crunch:0.6, slurp:0.7, sizzle:0.9, gulp:0.5, chomp:0.5, fizz:0.8, blender:0.8, microwave:0.6, popcorn:0.9, cheersclink:0.6, refwhistle:0.6, bounce:0.6, swish:0.6, kick:0.5, batcrack:0.5, crowd:1.2, goal:1.2,
};

async function cacheGet(key){if(!SUPABASE_URL||!SUPABASE_SERVICE_KEY)return null;try{const r=await fetch(`${SUPABASE_URL}/rest/v1/narration_cache?cache_key=eq.${key}&select=audio_b64&limit=1`,{headers:{apikey:SUPABASE_SERVICE_KEY,Authorization:`Bearer ${SUPABASE_SERVICE_KEY}`}});if(!r.ok)return null;const rows=await r.json();return Array.isArray(rows)&&rows[0]?rows[0].audio_b64:null;}catch{return null;}}
async function cachePut(key,b64){if(!SUPABASE_URL||!SUPABASE_SERVICE_KEY)return;try{await fetch(`${SUPABASE_URL}/rest/v1/narration_cache`,{method:"POST",headers:{apikey:SUPABASE_SERVICE_KEY,Authorization:`Bearer ${SUPABASE_SERVICE_KEY}`,"Content-Type":"application/json",Prefer:"resolution=ignore-duplicates"},body:JSON.stringify({cache_key:key,audio_b64:b64,word_timings:null})});}catch{}}

export default async function handler(req,res){
  const sName=(req.query.s||"water").toString();
  if(!SOUNDS[sName]){ res.setHeader("Cache-Control","no-store"); return res.status(400).json({ok:false,error:"unknown sound"}); }
  const key="sfx:"+sName;
  let b64=await cacheGet(key);
  if(!b64){
    const elKey=process.env.ELEVENLABS_API_KEY;
    if(!elKey){ res.setHeader("Cache-Control","no-store"); return res.status(200).json({ok:true,configured:false}); }
    try{
      const r=await fetch("https://api.elevenlabs.io/v1/sound-generation",{method:"POST",headers:{"xi-api-key":elKey,"Content-Type":"application/json"},body:JSON.stringify({text:SOUNDS[sName],duration_seconds:(DURATIONS[sName]||12),prompt_influence:0.5})});
      if(!r.ok){ res.setHeader("Cache-Control","no-store"); return res.status(200).json({ok:false,failed:true,status:r.status,detail:(await r.text()).slice(0,200)}); }
      const buf=Buffer.from(await r.arrayBuffer());
      b64=buf.toString("base64");
      await cachePut(key,b64);
    }catch(e){ res.setHeader("Cache-Control","no-store"); return res.status(200).json({ok:false,error:String(e&&e.message).slice(0,120)}); }
  }
  res.setHeader("Content-Type","audio/mpeg");
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Cache-Control","public, max-age=31536000, immutable");
  res.status(200).send(Buffer.from(b64,"base64"));
}

// Named export so the shared audio catalog (/api/list-audio) can list these without duplicating.
export { SOUNDS };
