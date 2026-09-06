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
  ocean:   "Calm deep underwater ocean ambience, soft muffled water movement and gentle low swells with faint distant whale song, peaceful and immersive, seamless ambient loop, no music, no voices",
  candy:   "Light whimsical magical sparkle chimes and soft twinkles, cheerful and gentle, seamless ambient loop, no music, no voices",
  rain:    "Gentle soft steady rainfall, soothing calm raindrops, seamless ambient loop, no music, no voices",

  // ---- Kidspedia Weather Lab (live weather mix) ----
  hailplink: "Short light icy plink, a small hailstone tapping and bouncing off grass, crisp cute tick, single hit, no music, no voices",
  snowhush:  "Very soft hushed winter snowfall ambience, gentle muffled quiet air with the faintest icy shimmer, extremely calm and peaceful, seamless ambient loop, no music, no voices",
  city:    "Gentle friendly daytime town-square ambience, soft distant footsteps, a faint fountain, a far-off bicycle bell and a few birds, calm and warm, seamless ambient loop, no music, no voices",

  // ---- Sunny Town Drive (car runner) ----
  runner_coin:   "Short bright cheerful treat pickup ding with a tiny happy sparkle, collecting a coin or goody, single hit, no music, no voices",
  runner_crash:  "Short soft friendly cartoon bump thud, a cute toy car gently bonking something, bouncy and not harsh or scary, single hit, no music, no voices",
  runner_engine: "Soft gentle cute toy car engine idle hum, smooth low continuous putter, calm and quiet, seamless ambient loop, no music, no voices",
  runner_jump:   "Short bouncy cartoon boing hop, a cute car springing up to jump, playful and light, single hit, no music, no voices",

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

  // ---- Family Town (board game) one-shots — bespoke, kid-friendly ----
  town_roll:  "Short friendly wooden dice shake and roll, two dice tumbling and settling on a table, single hit, no music, no voices",
  town_move:  "Short soft cute hop boop, a little game token hopping one space on a board, single quick hit, no music, no voices",
  town_coin:  "Short bright cheerful coin pickup ding with a tiny sparkle, collecting play coins, single hit, no music, no voices",
  town_buy:   "Short happy little cash-register cha-ching ding, buying a shop, cheerful cartoon, single hit, no music, no voices",
  town_card:  "Short soft playful card flip whoosh with a light twinkle, drawing a surprise card, single hit, no music, no voices",
  town_cheer: "Short happy little kids cheer and clap with a sparkle, cheerful board-game win celebration, single hit, no music",
  // Board games (Tic-Tac-Toe, Connect Four, Dots and Boxes) one-shots
  board_place: "Short soft friendly cartoon click tap, placing a game piece down, single hit, no music, no voices",
  board_drop:  "Short cheerful plastic disc plonk dropping and settling into a slot, single hit, no music, no voices",
  board_line:  "Short soft crayon line stroke drawn on paper with a gentle tap, single hit, no music, no voices",
  board_claim: "Short happy sparkly pop chime, a box being won and claimed, cheerful cartoon, single hit, no music, no voices",
  board_win:   "Happy short victory fanfare with a bright sparkle, cheerful kids board game win, no voices",
  board_draw:  "Short gentle friendly two-note chime, a tied game, not sad, single hit, no music, no voices",
  // ---- Checkers game one-shot SFX (short, punchy, kid-friendly) ----
  checkers_select:  "Short soft UI pluck pop, friendly cartoon piece pick-up blip, single hit, no music, no voices",
  checkers_move:    "Short soft wooden tap, a round checkers piece sliding and tapping down on a board, single hit, no music, no voices",
  checkers_capture: "Short bouncy cartoon hop and pop, a checkers piece jumping over another and knocking it out, single hit, no music, no voices",
  checkers_king:    "Short cheerful rising magical sparkle chime, a piece being crowned king, triumphant and short, no music, no voices",
  checkers_win:     "Happy short victory fanfare with a sparkle, cheerful kids game win, no voices",
  checkers_lose:    "Gentle soft descending wah-wah, friendly cartoon lose, short, no music, no voices",
  // ---- Maze Munchers one-shots (arcade-friendly, kid-cute; per BUILDING-A-GAME "create new sounds") ----
  maze_chomp:  "Short bright bouncy arcade chomp munch, a friendly gulp eating a treat, cheerful cartoon, single hit, no music, no voices",
  maze_power:  "Short cheerful rising magical power-up sparkle chime, exciting arcade glow-up, friendly cartoon, no music, no voices",
  maze_eat:    "Short funny gulp and pop with a springy boing, gobbling up a wobbly chaser, playful arcade cartoon, single hit, no music, no voices",
  maze_win:    "Happy short victory fanfare with a sparkly arcade jingle, cheerful kids maze cleared, no voices",
  maze_caught: "Short soft gentle descending uh-oh wobble, friendly and not scary, a tag in a chase, single hit, no music, no voices",
  maze_start:  "Short cheerful arcade start blip, a friendly ready-go ding, single hit, no music, no voices",
  // ---- Castle Guard (tower defense) one-shots — bespoke, gentle, kid-friendly ----
  cg_place: "Short soft friendly wooden thunk with a tiny cheerful chime, placing a little tower down, single hit, no music, no voices",
  cg_twang: "Short soft gentle bow twang, a toy arrow with a soft tip being shot, light and not sharp, single hit, no music, no voices",
  cg_poof:  "Short soft puffy poof of smoke with a tiny comical boing, a silly goblin giving up and popping away, friendly and not scary, single hit, no music, no voices",
  cg_coin:  "Short bright cheerful coin pickup ding with a tiny sparkle, collecting a gold coin, single hit, no music, no voices",
  cg_oops:  "Short soft gentle descending uh-oh wobble, friendly and not scary, a goblin sneaking past, single hit, no music, no voices",
  cg_cheer: "Short happy little kids cheer and clap with a sparkle, cheerful wave-cleared celebration, single hit, no music, no voices",
  cg_bonk:  "Short soft friendly cartoon bonk thunk, a knight gently bopping a goblin with a blunt sword, bouncy and not harsh, single hit, no music, no voices",

  // ---- Sky Flyer one-shots (3D flight game type, Session FL4; per BUILDING-A-GAME
  //      "a new engine type must CREATE fresh sounds"). Warm and rounded, never
  //      shrill: a kid flies with this in their ears for a long time. ----
  sky_coin:    "Short bright cheerful gold coin scoop chime with a soft airy whoosh, catching a coin in mid-air, warm and rounded, single hit, no music, no voices",
  sky_coinrun: "Short happy rising sparkle run of three quick coin chimes, scooping a whole string of coins in one swoop, cheerful and warm, single hit, no music, no voices",
  sky_bump:    "Short soft puffy cartoon bounce boof, a toy plane gently bumping a cloud and springing away, bouncy and completely un-scary, single hit, no music, no voices",
  sky_splash:  "Short light playful water skim splash, a toy plane's wheels touching the sea and skipping off, gentle and cute, single hit, no music, no voices",
  sky_land:    "Short soft satisfying landing touchdown, a gentle wheel chirp and a warm cushioned thud settling down, friendly cartoon, single hit, no music, no voices",
  sky_takeoff: "Short warm rising engine swell and gentle whoosh as a little toy plane lifts off a pad, hopeful and upbeat, single hit, no music, no voices",
  sky_bank:    "Short happy cash-in sparkle cascade, coins tumbling warmly into a piggy bank, cheerful and rewarding, single hit, no music, no voices",
  sky_win:     "Happy short victory fanfare with a soaring warm sparkle, cheerful kids flying game world cleared, warm rounded tones, no voices",
  // Session FL5 (missions + aircraft jobs). A job has three new moments a free
  // flight never had — loading up, dropping something off, and finishing the
  // whole job — so the library grows three new one-shots rather than reusing the
  // coin chime for all of them. They are generic on purpose (pickup / deliver /
  // job done), so any future delivery game can trigger the same three.
  sky_pickup:  "Short soft friendly parcel scoop with a light paper rustle and a small warm chime, picking up a letter or a bundle to carry, gentle cartoon, single hit, no music, no voices",
  sky_deliver: "Short happy two-note drop-off chime with a soft cushioned thud, a parcel landing safely where it belongs, warm and satisfying, single hit, no music, no voices",
  sky_mission: "Short warm cheerful job-well-done fanfare, a gentle rising three-note flourish with a soft sparkle tail, finishing a delivery round, kind and encouraging, no voices",

  // Card PB1 (Paper Route). The delivery moments themselves are the shared FL5
  // clips above — a bag refill is sky_pickup, a paper in the mailbox is
  // sky_deliver, the finished street is sky_mission. These three are the ones
  // only this engine makes, so the company library grows by exactly what is new.
  pr_throw:  "Short light paper whoosh, a rolled newspaper thrown through the air with a soft flutter of pages, quick and satisfying, single hit, no music, no voices",
  pr_clunk:  "Short soft cartoon bump against a plastic bin, a gentle hollow clunk with a small wobble, harmless and friendly, never harsh, single hit, no music, no voices",
  pr_streak: "Short bright rising three-note chime with a sparkle tail, a run of perfect deliveries in a row, proud and encouraging, single hit, no music, no voices",

  // ---- Sling Squad one-shots (slingshot launcher; per BUILDING-A-GAME "new engine = create new sounds") ----
  sling_stretch: "Short soft stretchy elastic rubber-band pull and creak, a slingshot being drawn back, single hit, no music, no voices",
  sling_release: "Short bouncy cartoon slingshot twang and boing as an elastic snaps forward and launches, playful, single hit, no music, no voices",
  sling_thud:    "Short soft wooden thud and clatter, friendly cartoon blocks getting bonked and tumbling, single hit, no music, no voices",
  sling_poof:    "Short cute puffy pop and poof, a goofy character popping into a little puff of air, playful cartoon, single hit, no music, no voices",
  sling_win:     "Happy short victory fanfare with a sparkly cheer, cheerful kids slingshot level cleared, no voices",
  sling_crack:   "Short dry woody crack and splinter, a toy building block starting to split under a bonk, friendly cartoon, not harsh or scary, single hit, no music, no voices",
  sling_shatter: "Short bright cartoon shatter and tinkle, a little glass pane breaking into sparkly pieces that scatter, playful and light, not harsh or scary, single hit, no music, no voices",

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
  spk_hit:     "Short soft sci-fi sparkle impact zap, a little star bullet tapping a slime, gentle and light, single hit, no music, no voices",
  spk_coin:    "Short bright cheerful star-coin pickup ding with a tiny sparkle, single hit, no music, no voices",
  spk_coinbig: "Short rich rewarding jackpot star-coin chime with a sparkle cascade, cheerful, single hit, no music, no voices",
  spk_levelup: "Cheerful rising magical power-up sparkle chime, bright and triumphant, short, no music, no voices",
  spk_hurt:    "Short soft cartoon ouch bonk thud, gentle and not scary, single hit, no music, no voices",
  spk_pop:     "Short cute squishy cartoon splat pop, a space slime bursting, single hit, no music, no voices",
  spk_boom:    "Short punchy cartoon space explosion boom with sparkly debris, big but friendly, single hit, no music, no voices",
  spk_boss:    "Short playful but ominous boss-appear sci-fi horn sting, cartoon, single hit, no music, no voices",
  spk_win:     "Happy short victory fanfare with a bright cosmic sparkle, cheerful kids game win, no voices",
  spk_lose:    "Gentle soft descending wah-wah with a little twinkle, friendly cartoon lose, short, no music, no voices",

  // ---- Octo (myocto.co) — calm, zen one-shot UI sounds ----
  zen_bowl:    "A single small Tibetan singing bowl struck softly, warm bloom with a long calm shimmering fade, meditative and minimal, no music, no voices",
  zen_chime:   "One soft wind chime tube touched gently, warm airy resonance fading slowly, calm and spacious, no music, no voices",
  zen_marimba: "Two soft warm wooden marimba notes rising gently, mellow and rounded, calm, no music, no voices",
  zen_drop:    "A single soft water droplet falling into a still pool, round warm plink with gentle resonance, calm, no music, no voices",
  zen_tap:     "A soft muted wooden tap on a hollow wood block, warm and low, single gentle hit, calm, no music, no voices",
  zen_pluck:   "A single soft koto string plucked gently, warm mellow tone fading out, calm and minimal, no music, no voices",
  zen_bell:    "One small brass meditation bell tapped lightly, clear soft ding with a smooth long decay, calm, no music, no voices",
  zen_pebble:  "A small smooth pebble dropped into shallow still water, soft plip with a gentle ripple, calm, no music, no voices",
  zen_swish:   "A soft brush sweeping once across paper, quiet airy swish fading away, calm and gentle, no music, no voices",
  zen_breath:  "A soft low airy exhale of wind passing by and settling, very quiet and calm, no music, no voices",

  // ---- Octo, round 2: more long/resonant and plucked options ----
  zen_bowl_low: "A large deep Tibetan singing bowl struck very softly, low warm hum blooming and fading very slowly, deeply meditative, no music, no voices",
  zen_glass:    "A finger circling the rim of a crystal wine glass, pure soft sustained shimmer swelling and fading, delicate and calm, no music, no voices",
  zen_handpan:  "A single soft handpan note struck gently with the fingertips, warm metallic bloom with long rich resonance, calm and grounded, no music, no voices",
  zen_gong:     "A small soft gong tapped very lightly, warm shimmering swell with a long calm decay, meditative, no music, no voices",
  zen_harp:     "A single harp string plucked softly, warm resonant tone ringing out and fading gently, calm and clean, no music, no voices",
  zen_kalimba:  "A single soft kalimba thumb piano note plucked gently, warm round metallic tone with a sweet natural fade, calm, no music, no voices",
  zen_guzheng:  "A single guzheng string plucked softly with a gentle bend, warm resonant Asian string tone fading slowly, calm and spacious, no music, no voices",
  zen_nylon:    "A single nylon classical guitar string plucked softly, low warm round tone with a gentle natural decay, calm, no music, no voices",
  zen_koto2:    "Two soft koto strings plucked gently one after the other, warm mellow tone with airy resonance, calm and minimal, no music, no voices",
  zen_rhodes:   "A single soft electric piano note played gently, warm bell like tone with a long smooth decay, calm and dreamy, no music, no voices",

  // ---- Croc Tot (food side-shooter game type) — bespoke SFX ----
  croc_hit:    "Short soft squishy splat tick, a food pellet bonking a flying snack, gentle cartoon, single hit, no music, no voices",
  croc_pop:    "Short cute cartoon food splat pop, a flying snack bursting into crumbs, single hit, no music, no voices",
  croc_coin:   "Short cheerful squelchy ketchup squirt with a happy ding, grabbing a saucy power item, single hit, no music, no voices",
  croc_power:  "Cheerful rising sizzling power-up chime, a tasty food boost, short, no music, no voices",
  croc_hurt:   "Short soft cartoon ouch splat, gentle and not scary, single hit, no music, no voices",
  croc_boom:   "Short big silly cartoon food explosion splat boom with splattering bits, friendly, single hit, no music, no voices",
  croc_win:    "Happy short victory fanfare with a silly food jingle, cheerful kids game win, no voices",
  croc_lose:   "Gentle soft descending wah-wah splat, friendly cartoon lose, short, no music, no voices",

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
  art_crayon:  "One quick blunt waxy crayon stroke dragging thickly across rough paper, soft rounded low scrape, clear and chunky, single short hit, no music, no voices",
  art_marker:  "One smooth wet felt-tip marker stroke squeaking and gliding quickly across glossy paper, rubbery high squeak, juicy and bright, single short hit, no music, no voices",
  art_paint:   "One soft wet paintbrush swish sweeping through thick watery paint, sloppy liquid brushy swoosh with a tiny wet splat, single short hit, no music, no voices",
  art_pencil:  "One thin sharp graphite pencil sketching a quick fine scratchy line on paper, dry papery high scritch, crisp and light, single short hit, no music, no voices",
  art_chalk:   "One dry gritty chalk stick dragging and scraping across a rough chalkboard, dusty grainy rasp, matte and crumbly, single short hit, no music, no voices",
  art_spray:   "One quick aerosol spray-can puff, sharp airy pressurized hiss of atomizing paint mist, breathy and fizzy, single short hit, no music, no voices",
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
  mahjong_pick:    "Short soft satisfying wooden tile tap with a gentle click, picking up a smooth mahjong tile, single hit, no music, no voices",
  mahjong_match:   "Short bright cheerful sparkly reward chime with a satisfying happy ding, a nice tile match, single hit, no music, no voices",
  mahjong_match2:  "Short brighter more exciting rising sparkly reward chime with a happy double ding, a great tile match, single hit, no music, no voices",
  mahjong_match3:  "Short very exciting triumphant rising sparkly chime burst with a bright shimmer and a joyful ding, an amazing tile-match streak, single hit, no music, no voices",
  mahjong_combo:   "Short exciting lottery coin cascade: quick tumbling gold coins with a bright rising sparkle and a cheerful ching, a rewarding combo streak, single hit, no music, no voices",
  mahjong_jackpot: "Exciting lottery jackpot win: a bright rising slot-machine jingle with a big cascade of tumbling gold coins and cheerful celebratory payout bells, huge rewarding payout, single hit, no music, no voices",
  mahjong_nope:    "Short soft gentle low wooden thunk, a friendly not-quite bump, not harsh, single hit, no music, no voices",
  mahjong_shuffle: "Short cozy wooden tiles gently tumbling and reshuffling on a table, soft clattering, single hit, no music, no voices",
  mahjong_win:     "Big rewarding lottery jackpot victory: a rising celebratory slot-machine fanfare with a cascade of tumbling gold coins, sparkly payout bells and a soft happy children yay cheer, jackpot payout celebration, no words",
  party_win:    "Short joyful celebration fanfare with a party-popper pop, confetti sparkle and a tiny kid cheer, cheerful kids game win, no voices",
  bingo_call:   "Short bright cheerful announce ding with a soft attention bell, a bingo number being called, single hit, no music, no voices",
  bingo_daub:   "Short soft chunky ink-stamp daub thunk with a tiny squish, marking a bingo square, single hit, no music, no voices",
  dice_roll:    "Short playful wooden dice shake and tumble roll landing with a tap, single hit, no music, no voices",
  snl_ladder:   "Short cheerful rising sparkle slide-whistle climb up, going up a ladder, bright and happy, single hit, no music, no voices",
  snl_snake:    "Short playful descending wobble slide-whistle whoosh, sliding down a snake, silly not scary, single hit, no music, no voices",

  // ---- Tumble Blocks (gentle kid Tetris, public/tumble-engine.html) — bespoke one-shots ----
  tumble_move:   "Very short soft gentle wooden tick, a friendly block nudging sideways, tiny and quiet, single hit, no music, no voices",
  tumble_rotate: "Very short soft springy cartoon twist whoosh, a block turning, light and cute, single hit, no music, no voices",
  tumble_lock:   "Short soft rounded cartoon block settling and clicking gently into place, cozy and satisfying, not harsh, single hit, no music, no voices",
  tumble_clear:  "Short bright cheerful sparkly chime sweep, a row of blocks twinkling away, happy and magical, single hit, no music, no voices",
  tumble_combo:  "Short rich joyful cascade of sparkly chimes rising up, lots of rows clearing at once, triumphant and delightful, single hit, no music, no voices",
  tumble_levelup:"Cheerful rising magical power-up sparkle fanfare, moving to a new world, bright and proud, short, no music, no voices",
  tumble_win:    "Happy short gentle victory jingle with a warm sparkle, a cheerful kids puzzle win, no voices",
  tumble_reset:  "Short soft friendly swoosh and gentle plink, blocks tidying themselves away calmly, soothing not sad, single hit, no music, no voices",

  // ---- SHARED CORE one-shots (canonical bare names) — punchy & satisfying, warm
  // not shrill. These replace the tiny synth fallbacks in buildable-audio.js so NO
  // game ever plays a beep. Any game can use them by their bare event name.
  select:    "A single short soft wooden click, like a smooth marble tapping a wooden block one time, dry and clean, no reverb, no music, no voices",
  win:       "A short cheerful triumphant fanfare on warm brass and glockenspiel, three quick rising notes ending on a bright happy chord, celebratory, no voices",
  lose:      "A short funny cartoon fail sound, a comic descending slide-whistle sliding down to a soft tuba blat, playful and goofy, no voices",
  coin:      "A classic bright arcade coin pickup, a crisp quick two-note metallic bling rising up, retro video-game coin, no voices",
  collect:   "A single soft round water-drop bloop, one cute bubbly plop pop, clean and dry, no music, no voices",
  hit:       "A single soft deep drum thud, a padded mallet striking a low tom one time, round and punchy, dry, no music, no voices",
  shoot:     "A single soft cartoon laser pew, one quick descending sci-fi zap, playful toy blaster, no voices",
  explode:   "A short soft cartoon explosion, a low muffled poof boom with a puff of air, bouncy and not scary, no voices",
  hurt:      "A single funny cartoon boing bonk, a springy doing as something bumps its head, comic and light, no voices",
  boss:      "A short dramatic low brass and gong stinger, a deep ominous bwaaam as a boss appears, playful-spooky, no voices",
  error:     "A short gentle wrong-answer buzzer, two soft low bzzt bzzt honks, comedic and not harsh, no voices",
  celebrate: "A short festive party celebration, a popping party-popper with a quick shower of confetti and a tiny kazoo toot, joyful, no voices",

  // ---- String Match (clay buddies smooshing together) one-shots ----
  clay_smoosh: "A short satisfying playdough smoosh, two lumps of soft clay squishing and mushing together with a wet squelchy stretch, tactile and gooey, single hit, no music, no voices",
  clay_splat:  "A short fun soft clay splat, a wet lump of playdough slapping and squashing flat with a bouncy squelch, playful and cute, single hit, no music, no voices",
  clay_pop:    "A short cute soft squishy pop, a little wobbly playdough boop settling with a gentle rubbery bounce, cheerful and light, single hit, no music, no voices",

  // ---- Music Maker (Session MM1) tap-to-hear previews ----
  // Style cards (~2s musical riffs, keyed by genre so the picker can reuse them).
  mm_style_pop:      "Short cheerful upbeat pop music riff, bright catchy melody over a bouncy beat, happy kids pop, about 2 seconds, no voices",
  mm_style_disco:    "Short funky disco dance riff, four-on-the-floor beat with a groovy bass and sparkly synth, fun and danceable, about 2 seconds, no voices",
  mm_style_rock:     "Short energetic rock riff, punchy electric guitar power chords and drums, bold and fun, about 2 seconds, no voices",
  mm_style_country:  "Short playful country riff, twangy acoustic guitar over a bouncy shuffle, warm and silly, about 2 seconds, no voices",
  mm_style_sleepy:   "Short gentle lullaby, soft twinkly music-box melody, slow and dreamy, about 2 seconds, no voices",
  mm_style_marching: "Short epic cinematic march, bold brass and marching drums, heroic movie feel, about 2 seconds, no voices",
  mm_style_kpop:     "Short high-energy K-pop riff, bright synths and a punchy dance beat, sparkly and exciting, about 2 seconds, no voices",
  mm_style_reggae:   "Short chill reggae riff, laid-back offbeat guitar skank and a mellow bassline, sunny and relaxed, about 2 seconds, no voices",
  // Instrument previews for the optional "Tweak my band" panel (~1s).
  mm_drums_big:       "Short punchy full drum-kit fill, big bass drum and a crashing cymbal, about 1 second, no music, no voices",
  mm_drums_soft:      "Short soft brushed-snare drum groove, gentle and light, about 1 second, no music, no voices",
  mm_drums_marching:  "Short crisp marching snare-drum cadence, about 1 second, no music, no voices",
  mm_drums_bongos:    "Short lively hand bongo drum pattern, warm wooden tone, about 1 second, no music, no voices",
  mm_drums_electro:   "Short punchy electronic drum-machine beat, tight and modern, about 1 second, no music, no voices",
  mm_guitar_electric: "Short bright clean electric guitar riff, catchy, about 1 second, no voices",
  mm_guitar_acoustic: "Short warm acoustic guitar strum, gentle and pretty, about 1 second, no voices",
  mm_guitar_twangy:   "Short twangy resonator guitar lick, bright and playful, about 1 second, no voices",
  mm_guitar_bass:     "Short groovy electric bass guitar riff, deep and bouncy, about 1 second, no voices",
  mm_strings_violin:    "Short lively violin melody, bright and sweet, about 1 second, no voices",
  mm_strings_cello:     "Short warm cello melody, deep and smooth, about 1 second, no voices",
  mm_strings_harp:      "Short sparkling harp glissando, magical and gentle, about 1 second, no voices",
  mm_strings_orchestra: "Short lush orchestral string swell, rich and grand, about 1 second, no voices",
  // Singer voice previews (~1s "la la la").
  mm_sing_boy:   "A young boy happily singing a short cheerful la-la-la melody, about 1 second, no music",
  mm_sing_girl:  "A young girl happily singing a short cheerful la-la-la melody, about 1 second, no music",
  mm_sing_group: "A group of happy kids singing a short cheerful la-la-la melody together, about 1 second, no music",
  mm_sing_both:  "A boy and a girl singing a short cheerful la-la-la melody together, about 1 second, no music",
  mm_sing_robot: "A friendly cute robot voice singing a short cheerful la-la-la melody in a bouncy synthetic tone, about 1 second",

  // ---- Practice (Session PT2/PT3) ----
  // Nothing here is allowed to sound like a buzzer. A wrong answer in practice
  // is not a failure, so practice_oops is warm and neutral — the sound of "here,
  // look" rather than the sound of "no".
  practice_right:   "Short soft warm confirming ding with a tiny sparkle, gentle and encouraging, single hit, no music, no voices",
  practice_oops:    "Very soft low friendly wooden tap, neutral and warm, not a buzzer and not sad, single hit, no music, no voices",
  practice_new:     "Short gentle rising two-note chime introducing something new, curious and warm, single hit, no music, no voices",
  practice_bird:    "Short soft flutter of small wings landing, with one tiny cheerful chirp, gentle and close, single hit, no music, no voices",
  practice_flock:   "A whole flock of small birds bursting into happy song together on a summer morning, joyful and warm, short celebration, no music, no voices",
  practice_place:   "Short soft friendly upward whoosh with a light sparkle, settling into place, single hit, no music, no voices",
  practice_go:      "Short bright cheerful ready-steady-go start beep, friendly and light, single hit, no music, no voices",
  practice_time:    "Short soft gentle chime marking the end of a round, calm and friendly, never alarming, single hit, no music, no voices",
  practice_best:    "Happy short celebratory sparkle fanfare for a new personal best, warm and proud, no voices",

  // ---- Ant City (card AC4). A calm colony under a sunny meadow: every sound is
  // small, warm and close, the size of an ant. Nothing here may sound alarming —
  // the rain cue included, because rain in this game is a pause, not a danger.
  antcity_dig:   "Short soft crumbly dig into dry sandy soil, a tiny scoop of loose earth with a light grainy patter, close and warm, single hit, no music, no voices",
  antcity_march: "A few quick tiny ant footsteps pattering along a tunnel, soft skittery taps on packed earth, light and busy, short, no music, no voices",
  antcity_hatch: "Short gentle warm chime with a soft papery crackle, a tiny egg opening and something new arriving, cosy and happy, single hit, no music, no voices",
  antcity_munch: "Short soft tiny nibble crunch, a very small creature eating a crumb, light and cute, single hit, no music, no voices",
  antcity_rain:  "Short soft patter of raindrops arriving on soil with a gentle low rumble far away, calm and cosy, never alarming, no music, no voices",
};
// One-shot game SFX are short; ambience loops stay long.
const DURATIONS = {
  ocean:15,
  hailplink:0.5, snowhush:12,
  mm_style_pop:2.0, mm_style_disco:2.0, mm_style_rock:2.0, mm_style_country:2.0, mm_style_sleepy:2.2, mm_style_marching:2.0, mm_style_kpop:2.0, mm_style_reggae:2.0,
  mm_drums_big:1.0, mm_drums_soft:1.0, mm_drums_marching:1.1, mm_drums_bongos:1.0, mm_drums_electro:1.0,
  mm_guitar_electric:1.1, mm_guitar_acoustic:1.1, mm_guitar_twangy:1.1, mm_guitar_bass:1.1,
  mm_strings_violin:1.2, mm_strings_cello:1.2, mm_strings_harp:1.2, mm_strings_orchestra:1.3,
  mm_sing_boy:1.2, mm_sing_girl:1.2, mm_sing_group:1.3, mm_sing_both:1.3, mm_sing_robot:1.2,
  practice_right:0.5, practice_oops:0.5, practice_new:0.7, practice_bird:0.6, practice_flock:1.8,
  practice_place:0.6, practice_go:0.5, practice_time:0.8, practice_best:1.4,
  chess_select:0.4, chess_move:0.5, chess_check:0.7, chess_castle:0.7, chess_promote:1.0,
  chess_win:1.6, chess_lose:1.0, chess_yourturn:0.5, chess_capture:0.8,
  chess_capture_space:1.0, chess_capture_castle:0.8, chess_capture_jungle:0.9,
  chess_capture_ocean:0.9, chess_capture_candy:0.8, chess_capture_desert:0.9,
  tennis_hit:0.5, tennis_wall:0.5, tennis_point:0.6, tennis_win:1.6, tennis_lose:1.0,
  tennis_boom:0.6, tennis_cheer:1.4,
  breaker_smash:0.5, breaker_break:0.6, breaker_power:0.8, breaker_miss:0.6,
  tumble_move:0.5, tumble_rotate:0.5, tumble_lock:0.5, tumble_clear:0.8, tumble_combo:1.2, tumble_levelup:1.1, tumble_win:1.6, tumble_reset:0.8,
  mahjong_pick:0.5, mahjong_match:0.6, mahjong_match2:0.7, mahjong_match3:0.8, mahjong_combo:0.9, mahjong_jackpot:1.6, mahjong_nope:0.5, mahjong_shuffle:0.7, mahjong_win:2.2,
  select:0.5, win:1.6, lose:1.0, coin:0.5, collect:0.5, hit:0.5, shoot:0.5, explode:0.7, hurt:0.5, boss:0.8, error:0.6, celebrate:1.0,
  board_place:0.5, board_drop:0.5, board_line:0.5, board_claim:0.6, board_win:1.6, board_draw:0.7,
  checkers_select:0.4, checkers_move:0.5, checkers_capture:0.6, checkers_king:1.0, checkers_win:1.6, checkers_lose:1.0,
  maze_chomp:0.5, maze_power:0.8, maze_eat:0.6, maze_win:1.6, maze_caught:0.7, maze_start:0.6,
  clay_smoosh:0.6, clay_splat:0.6, clay_pop:0.5,
  cg_place:0.45, cg_twang:0.4, cg_poof:0.55, cg_coin:0.5, cg_oops:0.6, cg_cheer:1.3,
  cg_bonk:0.4,
  sling_stretch:0.5, sling_release:0.5, sling_thud:0.6, sling_poof:0.5, sling_win:1.6,
  sling_crack:0.5, sling_shatter:0.7,
  door:1.3, knock:1.0, thunder:1.8, firewhoosh:1.2, splash:0.8, magic:1.1, pop:0.5, whoosh:0.6, footsteps:1.2, bell:0.8, rustle:0.9, sparkle:1.0,
  spk_hit:0.5, spk_shoot:0.5, spk_coin:0.5, spk_coinbig:0.8, spk_levelup:1.0, spk_hurt:0.5, spk_pop:0.5, spk_boom:0.9, spk_boss:0.8, spk_win:1.6, spk_lose:1.0,
  zen_bowl:2.2, zen_chime:1.8, zen_marimba:1.2, zen_drop:0.9, zen_tap:0.6, zen_pluck:1.1, zen_bell:1.6, zen_pebble:0.9, zen_swish:0.7, zen_breath:1.0,
  zen_bowl_low:2.8, zen_glass:2.2, zen_handpan:2.0, zen_gong:2.4, zen_harp:1.6, zen_kalimba:1.4, zen_guzheng:1.8, zen_nylon:1.4, zen_koto2:1.6, zen_rhodes:1.8,
  croc_hit:0.5, croc_pop:0.5, croc_coin:0.5, croc_power:1.0, croc_hurt:0.5, croc_boom:0.9, croc_win:1.6, croc_lose:1.0,
  fart:1.0, boom:1.2, boing:0.5, burp:0.8, honk:0.6, tada:1.2, laser:0.5, ding:0.5,
  giggle:0.9, roar:1.0, robot:0.8, splat:0.5, cash:0.7, drumroll:1.3, gong:1.4,
  frog:0.6, moo:1.0, rooster:1.2, vroom:1.0, sneeze:0.8, partypop:1.0,
  // Paper Route (PB1) — its own three one-shots, all clear of the 0.5s floor.
  pr_throw:0.6, pr_clunk:0.5, pr_streak:1.0,
  // Ant City (AC4) — one-shots, every one comfortably over the 0.5s floor that
  // /api/sfx enforces (under it the generator refuses and the sound is silently gone).
  antcity_dig:0.6, antcity_march:1.2, antcity_hatch:1.0, antcity_munch:0.6, antcity_rain:1.6,
  buzzer:0.7, sadtrombone:1.4, squeak:0.5, airhorn:0.9, bonk:0.5, slidewhistle:0.7,
  meow:0.7, woof:0.5, quack:0.5, cheer:1.4,
  art_crayon:0.5, art_marker:0.5, art_paint:0.5, art_pencil:0.5, art_chalk:0.5, art_spray:0.5,
  art_neon:0.5, art_glitter:0.6, art_stamp:0.5, art_fill:0.6, art_undo:0.5, art_save:1.2,
  lion:1.2, elephant:1.0, monkey:0.9, horse:1.0, owl:0.9, wolf:1.2, sheep:0.7, pig:0.7, bird:0.6, snake:0.7, bee:0.7, catpurr:0.9, dolphin:0.8, piano:1.0, guitar:0.8, trumpet:1.0, violin:0.9, flute:0.9, xylophone:0.9, tambourine:0.6, cymbal:0.8, harp:1.1, sax:1.0, chime:0.9, accordion:0.9, spaceship:0.9, teleport:0.9, rocket:1.2, ufo:1.0, blaster:0.5, powerup:0.9, forcefield:0.8, alien:0.8, warp:1.0, scan:0.8, beepboop:0.7, ghost:1.0, spookywind:1.2, witch:1.0, heartbeat:1.0, monster:0.9, chains:0.9, creak:1.0, bat:0.7, cauldron:1.0, carhorn:0.6, train:1.2, airplane:1.0, helicopter:1.0, motorcycle:0.9, truck:0.8, boat:1.0, siren:1.2, bikebell:0.6, skid:0.7, fairy:0.9, spell:0.9, potion:0.9, wandzap:0.7, dragon:1.1, shield:0.7, levelup:1.0, treasure:1.0, portal:1.0, fireball:0.8, birds:1.0, waterfall:1.0, bubbles:0.7, sunrise:1.0, crunch:0.6, slurp:0.7, sizzle:0.9, gulp:0.5, chomp:0.5, fizz:0.8, blender:0.8, microwave:0.6, popcorn:0.9, cheersclink:0.6, refwhistle:0.6, bounce:0.6, swish:0.6, kick:0.5, batcrack:0.5, crowd:1.2, goal:1.2,
};

async function cacheGet(key){if(!SUPABASE_URL||!SUPABASE_SERVICE_KEY)return null;try{const r=await fetch(`${SUPABASE_URL}/rest/v1/narration_cache?cache_key=eq.${key}&select=audio_b64&limit=1`,{headers:{apikey:SUPABASE_SERVICE_KEY,Authorization:`Bearer ${SUPABASE_SERVICE_KEY}`}});if(!r.ok)return null;const rows=await r.json();return Array.isArray(rows)&&rows[0]?rows[0].audio_b64:null;}catch{return null;}}
async function cacheDel(key){if(!SUPABASE_URL||!SUPABASE_SERVICE_KEY)return;try{await fetch(`${SUPABASE_URL}/rest/v1/narration_cache?cache_key=eq.${key}`,{method:"DELETE",headers:{apikey:SUPABASE_SERVICE_KEY,Authorization:`Bearer ${SUPABASE_SERVICE_KEY}`}});}catch{}}
async function cachePut(key,b64){if(!SUPABASE_URL||!SUPABASE_SERVICE_KEY)return;try{await fetch(`${SUPABASE_URL}/rest/v1/narration_cache`,{method:"POST",headers:{apikey:SUPABASE_SERVICE_KEY,Authorization:`Bearer ${SUPABASE_SERVICE_KEY}`,"Content-Type":"application/json",Prefer:"resolution=ignore-duplicates"},body:JSON.stringify({cache_key:key,audio_b64:b64,word_timings:null})});}catch{}}

export default async function handler(req,res){
  const sName=(req.query.s||"water").toString();
  if(!SOUNDS[sName]){ res.setHeader("Cache-Control","no-store"); return res.status(400).json({ok:false,error:"unknown sound"}); }
  const key="sfx:"+sName;
  if(req.query.force) await cacheDel(key);
  let b64=req.query.force?null:await cacheGet(key);
  if(!b64){
    const elKey=process.env.ELEVENLABS_API_KEY;
    if(!elKey){ res.setHeader("Cache-Control","no-store"); return res.status(200).json({ok:true,configured:false}); }
    try{
      const r=await fetch("https://api.elevenlabs.io/v1/sound-generation",{method:"POST",headers:{"xi-api-key":elKey,"Content-Type":"application/json"},body:JSON.stringify({text:SOUNDS[sName],duration_seconds:Math.max(0.5,(DURATIONS[sName]||12)),prompt_influence:0.7})});
      if(!r.ok){ res.setHeader("Cache-Control","no-store"); return res.status(503).json({ok:false,failed:true,status:r.status,detail:(await r.text()).slice(0,200)}); }
      const buf=Buffer.from(await r.arrayBuffer());
      b64=buf.toString("base64");
      await cachePut(key,b64);
    }catch(e){ res.setHeader("Cache-Control","no-store"); return res.status(503).json({ok:false,error:String(e&&e.message).slice(0,120)}); }
  }
  res.setHeader("Content-Type","audio/mpeg");
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Cache-Control","public, max-age=31536000, immutable");
  res.status(200).send(Buffer.from(b64,"base64"));
}

// Named export so the shared audio catalog (/api/list-audio) can list these without duplicating.
export { SOUNDS };
