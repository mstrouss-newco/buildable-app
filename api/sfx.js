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
};
// One-shot game SFX are short; ambience loops stay long.
const DURATIONS = {
  chess_select:0.4, chess_move:0.5, chess_check:0.7, chess_castle:0.7, chess_promote:1.0,
  chess_win:1.6, chess_lose:1.0, chess_yourturn:0.5, chess_capture:0.8,
  chess_capture_space:1.0, chess_capture_castle:0.8, chess_capture_jungle:0.9,
  chess_capture_ocean:0.9, chess_capture_candy:0.8, chess_capture_desert:0.9,
  tennis_hit:0.35, tennis_wall:0.3, tennis_point:0.6, tennis_win:1.6, tennis_lose:1.0,
  door:1.3, knock:1.0, thunder:1.8, firewhoosh:1.2, splash:0.8, magic:1.1, pop:0.5, whoosh:0.6, footsteps:1.2, bell:0.8, rustle:0.9, sparkle:1.0,
  spk_shoot:0.5, spk_coin:0.5, spk_coinbig:0.8, spk_levelup:1.0, spk_hurt:0.5, spk_pop:0.5, spk_boom:0.9, spk_boss:0.8, spk_win:1.6, spk_lose:1.0,
  fart:1.0, boom:1.2, boing:0.5, burp:0.8, honk:0.6, tada:1.2, laser:0.5, ding:0.5,
  giggle:0.9, roar:1.0, robot:0.8, splat:0.5, cash:0.7, drumroll:1.3, gong:1.4,
  frog:0.6, moo:1.0, rooster:1.2, vroom:1.0, sneeze:0.8, partypop:1.0,
  buzzer:0.7, sadtrombone:1.4, squeak:0.5, airhorn:0.9, bonk:0.5, slidewhistle:0.7,
  meow:0.7, woof:0.5, quack:0.5, cheer:1.4,
  art_crayon:0.4, art_marker:0.4, art_paint:0.5, art_pencil:0.4, art_chalk:0.4, art_spray:0.5,
  art_neon:0.5, art_glitter:0.6, art_stamp:0.4, art_fill:0.6, art_undo:0.4, art_save:1.2,
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
