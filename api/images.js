// /api/images.js
// Reusable AI image library: generate once (OpenAI gpt-image-1), cache the PNG in
// Postgres keyed by a deterministic hash of its descriptor, and SERVE it as real
// image bytes by a short URL. Identical requests reuse the cached row, so each
// unique image is billed once and reuse is free + instant.
//
//   <img src="/api/images?kind=cover&vibe=happy&theme=space">      // song cover art
//   <img src="/api/images?kind=icon&cat=drums&id=big">            // transparent UI icon
//   GET /api/images?...&force=1        -> regenerate (replace a bad one)
//   GET /api/images?manifest=1[&kind=] -> JSON list of what's cached
//
// On any miss it can't fill (no key / over budget / provider error) it returns a
// non-200 so the frontend's <img onError> falls back to its emoji / color swatch.

import crypto from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const IMG_COST_USD = parseFloat(process.env.IMAGE_COST_USD || "0.011");   // gpt-image-1 low 1024
const DAILY_BUDGET_USD = parseFloat(process.env.DAILY_BUDGET_USD || "10");

export const config = { api: { bodyParser: false } };

/* ---------------- prompt builders (one per "kind") ---------------- */
const VIBE = { happy:"happy and sunny", epic:"epic and adventurous", spooky:"playful friendly-spooky",
  silly:"goofy and silly", chill:"calm and relaxed", dance:"energetic party" };
const WORLD = { space:"outer space with planets and stars", underwater:"a colorful underwater ocean reef",
  castle:"a magical fairytale castle", candy:"a sweet candy land", forest:"an enchanted forest",
  desert:"a sunny desert", volcano:"a glowing volcano" };

const COVER_STYLE = "vibrant playful square album-cover artwork, modern 3D glossy cartoon style, bright bold colors, fun and inviting, centered, no text, no words, no letters, child-friendly, ages 4-10";
const GAME_STYLE  = "Exciting dynamic action-packed key-art poster for a children's mobile game, vibrant bold saturated colors, soft painterly children's-book illustration with a glossy polished finish, a strong sense of motion and adventure, dramatic lighting, centered hero composition, no text, no words, no letters, no UI elements, child-friendly ages 4-8";
const ICON_STYLE  = "Photorealistic studio product photograph, realistic materials and reflections, soft even studio lighting, sharp focus, high detail, clean and glossy like an Apple GarageBand instrument icon. Single subject, centered, filling the frame. Not a cartoon, not an illustration, not 3D-rendered, not flat. No text, no labels, no watermark.";

// Instrument / mood / world icon subjects (mirrors the Music Maker pickers).
const ICONS = {
  drums:  { big:"a complete colorful children's drum kit with a bass drum, two toms, a snare, a hi-hat and cymbals",
            soft:"a snare drum with a pair of wire jazz brushes resting on the drumhead",
            marching:"a marching-band snare drum with a shoulder strap and two wooden drumsticks",
            bongos:"a pair of polished wooden bongo drums",
            electro:"a modern electronic drum machine pad with glowing buttons" },
  guitar: { electric:"a glossy electric guitar with a vibrant solid body and chrome hardware",
            acoustic:"a warm natural-wood acoustic guitar",
            twangy:"a shiny chrome resonator guitar",
            bass:"a glossy electric bass guitar" },
  strings:{ violin:"a polished wooden violin with its bow",
            cello:"a polished wooden cello with its bow",
            harp:"an elegant golden concert harp",
            orchestra:"a row of violins from a string orchestra" },
  singer: { boy:"a happy young boy singing into a handheld studio microphone",
            girl:"a happy young girl singing into a studio microphone on a stand",
            group:"three happy kids singing together at studio microphones",
            both:"a boy and a girl singing a duet together at studio microphones",
            robot:"a friendly cute silver toy robot singing into a microphone" },
  vibe:   { happy:"a bright shiny sun in a clear blue sky",
            epic:"a dramatic glowing bolt of lightning",
            spooky:"a glowing carved Halloween jack-o-lantern pumpkin",
            silly:"a pair of novelty clown glasses with a big red nose",
            chill:"a pair of cool reflective sunglasses",
            dance:"a sparkling mirror-ball disco ball" },
  style:  { pop:"a shiny chrome studio vocal microphone",
            country:"a brown cowboy hat resting on a wooden acoustic guitar",
            hiphop:"a pair of modern DJ headphones with a thick gold chain",
            rock:"a glossy electric guitar",
            disco:"a sparkling mirror-ball disco ball with colorful dance-floor lights",
            sleepy:"a glowing crescent moon with stars in a deep-blue night sky",
            marching:"a marching-band bass drum with a tall plumed marching hat beside it",
            reggae:"an acoustic guitar painted with red, gold and green stripes",
            kpop:"a glossy K-pop stage microphone with colorful glowing concert lightsticks and bright neon stage lights" },
  world:  { space:"a colorful outer-space scene with planets, stars and a rocket",
            underwater:"a vibrant underwater coral reef with tropical fish and sunbeams",
            castle:"a majestic fairytale castle on a green hill under a bright sky",
            candy:"a whimsical candy land of giant lollipops, gumdrops and candy canes",
            forest:"a lush sunlit forest with tall trees and dappled light",
            desert:"a sunny desert with golden sand dunes and a cactus",
            volcano:"an erupting volcano with glowing orange lava and rocky terrain" },
  speed:  { slow:"a cute slow tortoise", medium:"a person casually walking",
            fast:"a fast running rabbit", superfast:"a speeding cheetah mid-run",
            groovy:"a colorful shiny bouncing rubber ball" },
};

// Typing-game characters (heroes, baddies, bosses). Transparent cut-outs.
const TYPE_STYLE = "cute friendly cartoon game-character mascot for a kids' typing game, " +
  "bold clean thick outlines, bright vibrant colors, big expressive eyes, full body, centered, " +
  "simple flat-shaded sprite, not scary, child-friendly ages 4-8, transparent background";
const TYPE_SUBJECTS = {
  hero: {
    rocket:"a heroic friendly rocket-ship mascot with a brave smile and little arms",
    fox:   "a brave heroic cartoon fox wearing a tiny superhero cape",
    dragon:"a cute brave baby dragon with small wings and a tiny friendly flame",
    wizard:"a young cartoon wizard kid in a purple robe and pointy hat holding a glowing wand",
    robot: "a friendly heroic cartoon robot with a glowing blue visor and little rocket boosters",
    knight:"a brave cartoon kid knight in shiny golden armor holding a small shield",
  },
  foe: {
    space_1:"a goofy purple alien space-invader blob with big silly eyes",
    space_2:"a goofy little cartoon UFO saucer with a cheeky face",
    space_3:"a goofy green three-eyed alien creature",
    space_4:"a goofy grinning cartoon comet with a sparkly tail",
    jungle_1:"a goofy friendly cartoon green snake with a silly grin",
    jungle_2:"a playful goofy cartoon monkey sticking out its tongue",
    jungle_3:"a small goofy cartoon crocodile with a toothy grin",
    jungle_4:"a chubby goofy cartoon rhino with a big horn",
    sea_1:"a goofy cartoon pufferfish with big eyes",
    sea_2:"a goofy cartoon crab waving its claws",
    sea_3:"a goofy cartoon octopus with a silly grin",
    sea_4:"a goofy friendly cartoon baby shark with a big grin, not scary",
    candy_1:"a goofy gummy-bear candy monster with a silly face",
    candy_2:"a goofy walking slice of pie with eyes and little legs",
    candy_3:"a goofy donut creature with sprinkles and a face",
    candy_4:"a goofy cupcake monster with frosting and googly eyes",
    ice_1:"a goofy cartoon penguin wearing a tiny scarf",
    ice_2:"a goofy fluffy snowy cartoon owl",
    ice_3:"a goofy cute cartoon seal pup",
    ice_4:"a goofy fluffy white snow-monster cub, cute not scary",
    volcano_1:"a goofy little cartoon lava lizard",
    volcano_2:"a goofy cartoon bat with big ears",
    volcano_3:"a goofy rolling cartoon rock creature with a face",
    volcano_4:"a goofy cute cartoon stone golem",
  },
  boss: {
    space:"a big goofy UFO mothership boss with glowing lights, a silly face and a tiny gold crown",
    jungle:"a big friendly cartoon gorilla king with a tiny gold crown, goofy not scary",
    sea:"a big friendly cartoon blue whale boss with a tiny gold crown, happy and goofy",
    candy:"a big goofy lollipop-king candy boss with a tiny gold crown",
    ice:"a big friendly cartoon snowman king boss with a tiny gold crown",
    volcano:"a big goofy friendly cartoon lava dragon boss with a tiny gold crown, not scary",
  },
};

function build(q) {
  const kind = (q.kind || "").toString();
  if (kind === "type") {
    const cat = (q.cat || "").toString();
    const id = (q.id || "").toString();
    const subject = TYPE_SUBJECTS[cat] && TYPE_SUBJECTS[cat][id];
    if (!subject) return null;
    return {
      descriptor: `type|${cat}|${id}`,
      prompt: `${subject}. ${TYPE_STYLE}`,
      transparent: true, quality: "medium",
    };
  }
  if (kind === "cover") {
    const vibe = (q.vibe || "happy").toString();
    const theme = (q.theme || "").toString();
    const mood = VIBE[vibe] || vibe;
    const setting = WORLD[theme] || (theme ? theme : "a fun imaginative world");
    const seed = (q.seed || "").toString().slice(0, 60);
    const label = (q.label || "").toString().slice(0, 60).replace(/[^\w \-']/g, "");
    return {
      descriptor: `cover|${vibe}|${theme}` + (seed ? `|${seed}` : ""),
      prompt: `Square album cover artwork for a children's song${label ? ` called "${label}"` : ""}. Mood: ${mood}. Setting: ${setting}. ${COVER_STYLE}`,
      transparent: false, quality: "low",
    };
  }
  if (kind === "icon") {
    const cat = (q.cat || "").toString();
    const id = (q.id || "").toString();
    const subject = ICONS[cat] && ICONS[cat][id];
    if (!subject) return null;
    const transparent = !(cat === "world"); // worlds are full scenes; everything else is a cut-out
    return {
      descriptor: `icon|${cat}|${id}`,
      prompt: `${subject}. ${ICON_STYLE}`,
      transparent, quality: "medium",
    };
  }
  if (kind === "tennis") {
    const id = (q.id || "").toString();
    const COURT_STYLE = "Vibrant dynamic background art for a children's tennis/pong arcade game, viewed straight on, with a WIDE OPEN clear empty central play area and all the exciting scenery framing the top, sides and edges, bold saturated colors, soft glossy painterly children's-book style, energetic sense of motion, dramatic lighting, no people, no characters, no text, no words, no letters, no UI, no net, no ball, child-friendly ages 4-8";
    const COURTS = {
      beach:   "A sunny tropical beach arena at golden hour, palm trees and colorful beach umbrellas along the sides, sparkling turquoise sea and soft golden sand, fluffy clouds",
      space:   "A glowing futuristic space-station arena floating among planets and twinkling stars, neon energy lines along the edges, a big ringed planet glowing in the sky",
      jungle:  "A lush jungle clearing arena, giant leafy trees and hanging vines framing the sides, glowing tropical flowers and fireflies, warm dappled sunlight",
      ocean:   "A magical underwater arena, colorful coral reefs and swaying seaweed along the sides, schools of tiny tropical fish, bright sun rays from above, gentle rising bubbles",
      candy:   "A whimsical candy-land arena, giant lollipops, gumdrops and candy canes framing the sides, a flowing chocolate river, rainbow sprinkles, soft pastel sky",
      snow:    "A sparkling snowy mountain-top arena, frosty pine trees and glittering snowdrifts along the sides, gentle falling snow, a soft blue winter sky with faint northern lights",
      volcano: "A dramatic but friendly volcano arena, glowing orange lava rivers and rocky cliffs along the sides, floating embers, a warm red-orange sky, exciting but not scary",
      city:    "A colorful city rooftop arena at sunset, glowing skyscrapers and twinkling string lights along the sides, a pink-and-orange sky, a few distant balloons",
    };
    const subject = COURTS[id];
    if (!subject) return null;
    return { descriptor: `tennis|${id}`, prompt: `${subject}. ${COURT_STYLE}`, transparent: false, quality: "medium" };
  }
  if (kind === "soundfx") {
    const id = (q.id || "").toString();
    const FX_STYLE = "bright bold glossy 3D cartoon icon, a single centered subject filling the frame, vibrant candy colors, soft studio lighting, thick clean rounded shapes, cute friendly and child-friendly ages 4-8, no text, no words, no letters, no UI, transparent background";
    const SUBJECTS = {"fart": "a bright red rubber whoopee cushion","burp": "a cute cartoon kid with puffed cheeks burping","boing": "a bouncy coiled metal spring","honk": "a red clown bicycle horn with a rubber bulb","tada": "colorful party confetti and streamers bursting","buzzer": "a big shiny red game-show buzzer button","sadtrombone": "a shiny brass trombone","squeak": "a cute yellow squeaky rubber toy","bonk": "a cartoon wooden mallet hammer","slidewhistle": "a colorful slide whistle toy","giggle": "a happy laughing cartoon face","sneeze": "a cartoon face sneezing into a tissue","splat": "a colorful splat of paint","partypop": "a party popper shooting confetti","airhorn": "a hand-held air horn","boom": "a cartoon comic-book explosion cloud","meow": "a cute friendly cartoon cat","woof": "a cute friendly cartoon dog","quack": "a cute cartoon yellow duck","frog": "a cute cartoon green frog","moo": "a cute cartoon cow","rooster": "a colorful cartoon rooster","roar": "a cute friendly cartoon green dinosaur","lion": "a cute friendly cartoon lion","elephant": "a cute cartoon elephant","monkey": "a cute cartoon monkey","horse": "a cute cartoon horse","owl": "a cute cartoon owl","wolf": "a cute friendly cartoon wolf","sheep": "a fluffy cute cartoon sheep","pig": "a cute pink cartoon pig","bird": "a cute little cartoon bird","snake": "a cute friendly cartoon green snake","bee": "a cute cartoon bumblebee","catpurr": "a happy cute cartoon kitten curled up","dolphin": "a cute cartoon dolphin","piano": "a shiny black grand piano","guitar": "a glossy electric guitar","trumpet": "a shiny brass trumpet","violin": "a polished wooden violin with a bow","flute": "a shiny silver flute","xylophone": "a colorful rainbow xylophone with mallets","tambourine": "a tambourine with jingles","cymbal": "a shiny golden crash cymbal","harp": "an elegant golden harp","sax": "a shiny golden saxophone","chime": "a set of hanging wind chimes","accordion": "a colorful accordion","drumroll": "a drum with two wooden drumsticks","gong": "a large golden gong on a stand","bell": "a shiny golden hand bell","laser": "a glowing green laser beam bolt","robot": "a cute friendly silver cartoon robot","space": "a colorful planet with a ring and stars","spaceship": "a sleek cartoon spaceship","teleport": "a glowing blue teleporter beam pad","rocket": "a cartoon rocket ship blasting off","ufo": "a shiny cartoon flying saucer UFO","blaster": "a sci-fi toy ray-gun blaster","powerup": "a glowing golden star power-up","forcefield": "a glowing blue energy force-field bubble","alien": "a cute friendly green cartoon alien","warp": "a swirl of stars in a glowing tunnel","scan": "a glowing green radar scanner screen","beepboop": "a cute little robot head with antennae","ghost": "a cute friendly cartoon ghost","spookywind": "a swirling gray ghostly wind cloud","witch": "a friendly cartoon witch with a pointy hat","heartbeat": "a glowing red cartoon heart","monster": "a cute friendly googly-eyed monster","chains": "a set of old metal chains","creak": "a creaky old wooden door opening","bat": "a cute cartoon bat","cauldron": "a bubbling green witch cauldron","thunder": "a storm cloud with a yellow lightning bolt","vroom": "a shiny cartoon race car","carhorn": "a cute cartoon car beeping its horn","train": "a colorful cartoon steam train","airplane": "a cartoon airplane","helicopter": "a cartoon helicopter","motorcycle": "a shiny cartoon motorcycle","truck": "a big cartoon delivery truck","boat": "a cartoon boat on blue water","siren": "a police car with flashing lights","bikebell": "a bicycle handlebar bell","skid": "a car tire with skid marks","magic": "a sparkling magic wand with a star tip","sparkle": "bright glittering golden magic sparkles","fairy": "a cute cartoon fairy with sparkly wings","spell": "an open glowing magic spellbook","potion": "a glowing purple magic potion bottle","wandzap": "a magic wand shooting sparkles","dragon": "a cute friendly cartoon dragon","shield": "a shiny magical glowing shield","levelup": "a glowing golden star burst badge","treasure": "an open treasure chest full of gold coins","portal": "a glowing swirling purple portal ring","fireball": "a glowing orange cartoon fireball","rain": "a blue rain cloud with falling raindrops","wind": "a swirling gust of blue wind","waves": "a curling blue ocean wave","water": "a sparkling blue water droplet","fire": "a cozy glowing campfire with logs","forest": "a tall green pine tree","crickets": "a green cricket bug under a moon","jungle": "a green jungle palm tree with a vine","splash": "a blue water splash","rustle": "a pile of green leaves","birds": "a little bird singing on a branch","waterfall": "a waterfall splashing over rocks","bubbles": "shiny floating soap bubbles","sunrise": "a bright smiling sun rising","pop": "a colorful balloon mid-pop","crunch": "a crunchy potato chip","slurp": "a cup of drink with a straw","sizzle": "a frying pan with sizzling food","gulp": "a tall glass of water","chomp": "a juicy red apple with a bite taken out","fizz": "a fizzy soda can with bubbles","blender": "a kitchen blender with a smoothie","microwave": "a kitchen microwave oven","popcorn": "a red-striped bucket of popcorn","cheersclink": "two glasses clinking in a toast","cheer": "a group of happy cheering kids","refwhistle": "a silver referee whistle","bounce": "an orange basketball","swish": "a basketball going through a hoop net","kick": "a black and white soccer ball","batcrack": "a baseball next to a wooden baseball bat","crowd": "a crowd of cheering cartoon fans","goal": "a soccer ball in a goal net"};
    const subject = SUBJECTS[id];
    if (!subject) return null;
    return { descriptor: `soundfx|webp|${id}`, prompt: `${subject}. ${FX_STYLE}`, transparent: true, quality: "low", format: "webp" };
  }
  if (kind === "soundpack") {
    const id = (q.id || "").toString();
    const PACK_STYLE = "Bright bold glossy 3D cartoon app-icon style, a single centered group of objects filling the frame, vibrant saturated candy colors, soft studio lighting, thick clean rounded shapes, playful and inviting, child-friendly ages 4-8, no text, no words, no letters, no UI, transparent background";
    const PACKS = {
      silly:       "a bright red whoopee cushion with a goofy cartoon smiling face sticking its tongue out",
      animals:     "three cute friendly cartoon animal faces grouped together — a happy puppy, a kitten and a little lion cub",
      instruments: "a colorful cartoon electric guitar, a drum and a shiny trumpet grouped together with a couple of music notes",
      space:       "a friendly cartoon rocket ship blasting off past a ringed planet and twinkling stars",
      spooky:      "a cute friendly smiling cartoon ghost next to a glowing jack-o-lantern pumpkin, playful and not scary",
      vehicles:    "a cute shiny cartoon red race car with a little blue train and a yellow airplane grouped behind it",
      magic:       "a sparkling magic wand with a glowing star tip, swirling magic sparkles and a little potion bottle",
      nature:      "a cheerful nature scene icon with a round green tree, a bright smiling sun and a fluffy white cloud",
      food:        "a yummy cartoon cheeseburger, a slice of pizza and a soda cup with a straw grouped together",
      sports:      "a shiny golden trophy with a soccer ball, a basketball and a referee whistle grouped around it",
    };
    const subject = PACKS[id];
    if (!subject) return null;
    return { descriptor: `soundpack|webp|${id}`, prompt: `${subject}. ${PACK_STYLE}`, transparent: true, quality: "low", format: "webp" };
  }
  if (kind === "game") {
    const id = (q.id || "").toString();
    const GAMES = {
      platformer: "A brave little bunny hero wearing a red scarf leaping high over a gap between grassy cliffs, golden coins and one big sparkling star flying through the air around it, a colorful checkered flag on a hill in the distance, set in a lush enchanted forest with big soft trees, glowing mushrooms and floating fireflies",
      breaker: "A glowing energetic ball blasting through a colorful wall of candy-colored bricks, bricks shattering into bright sparks and confetti, a friendly glowing paddle at the bottom catching the ball, dynamic motion trails, exciting arcade energy",
      castleguard: "A cheerful storybook castle on a sunny green hill defended by friendly little blue archer towers firing soft glowing arrows, a winding dirt path with a parade of silly round goblins poofing into puffs of smoke, gold coins sparkling, bright and playful, not scary",
      croctot: "A cheerful cartoon crocodile hero flying on the left side blasting at a swarm of goofy grinning flying snacks (burgers, fries, hot dogs) zooming in from the right, ketchup and mustard power-up bottles sparkling, a big silly boss snack looming, bright sunny side-scrolling arcade energy, playful and not scary",
      tetris: "Colorful glossy gem-like tetromino blocks gently tumbling down and stacking to fill a row, the completed row bursting into sparkles as it clears, a soft dreamy world backdrop, rounded friendly shapes, calm and joyful puzzle energy",
      survival: "A brave little hero in the middle of a swarm of cute round googly-eyed creatures closing in from every side, the hero glowing with a star power-up and shooting sparkles outward, a big friendly crowned boss monster looming in the background, energetic and thrilling but not scary",
      chess: "An epic friendly chess battle on a giant glowing chessboard, two armies of cute characterful chess pieces (a brave king and queen, knights on horseback, castle rooks) facing off mid-charge, sparks and magic dust flying, a fantasy kingdom backdrop",
      typing: "A heroic kid defending a magical castle, glowing letter and word runes flying through the air like shooting stars as the hero zaps them, friendly cartoon creatures approaching, bright magical sparks, exciting and triumphant",
      runner: "A cheerful kid driving a chunky colorful toy car down a sunny town street, dodging traffic cones and scooping up ice-cream cones, balloons and gold coins, bright houses and shops whizzing past, big blue sky, strong sense of speed and fun",
      maze: "A cute hungry round hero gobbling a glowing trail of treats through a friendly neon maze, three goofy colorful ghost chasers bobbing around the corners, dark playful arcade maze with glowing walls, exciting chase energy",
      tennis: "Two cute cartoon kids on opposite sides of a bright tennis court mid-rally, a glowing ball bouncing between their paddles with a motion trail, confetti and sparks flying, sunny stadium, energetic and playful",
      town: "A happy family of cute characters rolling a giant die and racing colorful tokens around a sunny board-game town full of little houses, shops and gold coins, collecting coins, cheerful and bright",
      checkers: "A friendly checkers battle on a big glossy red-and-black board, cute round crown-topped checker pieces hopping and jumping over each other, a golden king piece glowing, sparks of fun",
      tictactoe: "A playful giant tic-tac-toe grid drawn in glowing chalk, big cute smiling X and O characters leaping into the squares, three matching pieces glowing in a winning row, confetti, bright and cheerful",
      connectfour: "A colorful vertical connect-four grid with big glossy red and yellow discs dropping in, four matching discs glowing in a diagonal winning line, cute cartoon hands dropping a disc, confetti, fun and bright",
      dotsboxes: "A friendly dots-and-boxes game on bright paper, a grid of dots joined by colorful crayon lines, several little squares filled in with happy colors, a crayon closing the final box, playful and cheerful",
      sounds: "A fun burst of cartoon sound effects, a big colorful soundboard of glowing buttons exploding with musical notes, stars and silly cartoon noise symbols flying out, vibrant energetic and playful",
      stringmatch: "Two rows of cute smiling round buddy characters on a bright playful board, a glowing colorful string being drawn to connect two matching happy buddies, sparkles bursting along the connected line, cheerful and satisfying match-up puzzle energy",
      memory: "A cheerful tabletop of big colorful face-down memory cards, two cards flipped up revealing matching glowing star and heart symbols with a burst of sparkles between them, a few kids' hands reaching in, warm playful game-night vibe",
      mahjong: "A neat pyramid of stacked wooden mahjong tiles on a warm table, each tile face showing a big friendly kid-picture like a panda, a cherry and a playing card, two matching tiles glowing and lifting away with a soft sparkle, cozy inviting puzzle vibe",
      bubble: "A cheerful bubble-shooter arcade scene, a friendly cannon at the bottom firing a glowing colored bubble up into a hanging cluster of cute smiling round buddy characters, three matching buddies popping free in a burst of sparkles and confetti as they float away happily, bright playful colors, exciting match-and-pop energy",
      bingo: "A fun kids' bingo game scene, big colorful bingo cards covered in cheerful picture squares with bright stamp daubers marking them, a glowing called picture floating above, confetti and a happy BINGO sparkle, game-night energy",
      snakes: "A whimsical snakes-and-ladders board game viewed at a tilt, a winding numbered path climbing a colorful hill with friendly rope ladders going up and silly smiling cartoon snakes sliding down, cute colorful player tokens racing to a golden star at the top",

      tank: "Two friendly cartoon tanks on top of separate grassy green mountains under a bright sunny blue sky with fluffy clouds, a cheerful green tank on the left hill lobbing a glowing cannon shell in a high arc across a valley toward a grey tank on the right hill, a dotted aiming arc, small puffs of smoke, colorful and playful storybook style, not scary",
      sling: "Cute round cartoon animals — a happy blue bird, a chubby brown bear and a little yellow chick — launching joyfully out of a big wooden slingshot and soaring through the air toward a wobbly tower of stacked wooden and stone blocks topped with goofy smiling castle creatures, blocks tumbling and toppling over with bursts of sparkles and a puff of POOF smoke, sunny grassy castle field with blue sky, strong sense of launch and motion",
    };
    const subject = GAMES[id];
    if (!subject) return null;
    return {
      descriptor: `game|${id}`,
      prompt: `${subject}. ${GAME_STYLE}`,
      transparent: false, quality: "medium",
    };
  }
  if (kind === "town") {
    // Family Town (original board game): a board scene, a start-screen hero, 4 cute
    // animal tokens, and a charming icon per shop / corner. id picks which.
    const id = (q.id || "").toString();
    const TOWN_ICON_STYLE = "Bright bold glossy 3D cartoon app-icon style, a single cute subject centered and filling the frame, vibrant saturated candy colors, soft studio lighting, thick clean rounded shapes, playful and inviting, child-friendly ages 4-8, no text, no words, no letters, no UI, transparent background";
    const TOKEN_STYLE = "Cute glossy 3D cartoon board-game token mascot, a single adorable character centered and filling the frame, big sparkly friendly eyes, sitting pose, vibrant colors, soft studio lighting, child-friendly ages 4-8, no text, no words, no letters, transparent background";
    if (id === "board") {
      const BOARD_STYLE = "A charming whimsical storybook aerial bird's-eye view of a cozy little town, soft painterly children's-book illustration with a glossy polished finish, warm sunny lighting, lots of soft inviting detail, no text, no words, no letters, no UI, child-friendly ages 4-8";
      return { descriptor: "town|board", prompt: `A cozy colorful little town called Family Town seen from above, with tiny shops, an ice-cream cart, a park with a picnic blanket, a sparkling wishing fountain, a little train and winding paths between them. ${BOARD_STYLE}`, transparent: false, quality: "medium" };
    }
    if (id === "hero") {
      return { descriptor: "town|hero", prompt: `Four cute animal friends — a purple kitten, an orange fox, a green frog and a blue bunny — cheering happily together around a colorful board game with big dice and shiny gold coins. ${GAME_STYLE}`, transparent: false, quality: "medium" };
    }
    const TOKENS = {
      token_purple: "an adorable purple kitten",
      token_coral:  "an adorable coral-orange fox",
      token_mint:   "an adorable mint-green frog",
      token_sky:    "an adorable sky-blue bunny",
    };
    if (TOKENS[id]) return { descriptor: `town|${id}`, prompt: `${TOKENS[id]}. ${TOKEN_STYLE}`, transparent: true, quality: "medium" };
    const SPOTS = {
      spot_lemonade:  "a cute lemonade stand with a pitcher of lemonade and a striped awning",
      spot_toycart:   "a little wooden toy cart full of colorful toys and balloons",
      spot_petparade: "a happy puppy and kitten holding a little parade flag",
      spot_icecream:  "a colorful ice-cream cart with swirly ice-cream cones",
      spot_bakery:    "a cozy bakery shopfront with cupcakes and a pretzel",
      spot_bookshop:  "a neat stack of colorful books with a little shop sign",
      spot_musichall: "a cheerful little concert hall with music notes and a star",
      spot_artstudio: "an artist's easel with a colorful painting and a paint palette",
      spot_garden:    "a sunny garden patch with bright flowers and a watering can",
      spot_pool:      "a sparkling blue swimming pool with a beach ball and a float ring",
      spot_cinema:    "a movie-theater marquee with a popcorn box and a film reel",
      spot_arcade:    "a colorful arcade machine with a joystick and a glowing screen",
      spot_firestation:"a cute little red fire station with a tiny fire truck",
      spot_library:   "a grand little library building with books and columns",
      spot_sweetshop: "a candy sweet-shop with lollipops and gumdrops in glass jars",
      spot_trainstop: "a charming little train station with a colorful steam train",
      spot_start:     "a bright cheerful START banner with an arrow and confetti",
      spot_park:      "a sunny picnic park with a checkered blanket, a basket and a tree",
      spot_treat:     "a happy treat shop with a wrapped gift box and balloons",
      spot_fountain:  "a pretty wishing fountain with sparkling water and gold coins",
    };
    if (SPOTS[id]) return { descriptor: `town|${id}`, prompt: `${SPOTS[id]}. ${TOWN_ICON_STYLE}`, transparent: true, quality: "medium" };
    return null;
  }
  if (kind === "chesspiece") {
    const PIECE = {
      p:"a chess PAWN: a small simple rounded ball head on a short rounded pedestal base",
      n:"a chess KNIGHT shaped like a horse's head and arched neck rising from a round pedestal base",
      b:"a tall slender chess BISHOP with a smooth domed mitre hat with a small vertical slit, on a round pedestal base",
      r:"a chess ROOK shaped like a sturdy castle tower with square battlements (crenellations) on top, on a round pedestal base",
      q:"a tall elegant chess QUEEN wearing a pointed multi-point crown, on a round pedestal base",
      k:"a tall chess KING wearing a crown topped with a small cross, on a round pedestal base",
    };
    const NAME = {p:"pawn",n:"knight",b:"bishop",r:"rook",q:"queen",k:"king"};
    const THEME = {
      ocean:"made of coral, pearl and seashells, gentle underwater sea theme, aqua and teal accents",
      jungle:"covered in leaves, vines and little flowers, lush green jungle theme",
      space:"glowing cosmic theme with a metallic sheen, tiny stars and nebula colors, purples and blues",
      candy:"made of candy, frosting and sprinkles, sweet pastel theme",
      castle:"classic medieval theme of carved stone with gold trim",
      desert:"warm desert theme of carved sandstone with little cactus and sun motifs",
    };
    const piece=(q.piece||"").toString(); const world=(q.world||"").toString();
    if(!PIECE[piece]||!THEME[world]) return null;
    return {
      descriptor:`chesspiece|${world}|${piece}`,
      prompt:`${PIECE[piece]}, ${THEME[world]}. The overall silhouette must clearly read as a chess ${NAME[piece]}. Cute kawaii character with two big friendly eyes and a little smile, thick clean outlines, bold soft 3D cartoon style, a single piece standing upright and centered, full body, soft studio lighting, child-friendly ages 4-8, no text, no words, no letters, transparent background`,
      transparent:true, quality:"medium",
    };
  }
  if (kind === "runnerobj") {
    // Shared (theme-neutral) foreground art for the 3D runner: the cars, obstacles
    // and treats. Transparent modern-3D cut-outs rendered as billboards in-scene.
    const OBJ = {
      hero_car:"a cute friendly bright PINK toy car viewed from directly BEHIND and slightly above, as if you are driving right behind it: you can see its rounded roof, rear windshield, two round red tail lights and a bumper. Clean symmetrical rear view",
      ob_car:"a stalled broken-down car seen from directly BEHIND with its red-and-orange hazard warning lights blinking and a little grey smoke puff rising, clearly a dangerous obstacle blocking the lane",
      cone:"a tall bright ORANGE traffic safety cone with bold white reflective hazard stripes, sitting upright, clearly a warning marker",
      barrier:"a red-and-white striped road construction barrier sawhorse roadblock on legs with a small warning sign, clearly a hazard blocking the way",
      oildrum:"a chunky industrial metal oil drum barrel painted with bold YELLOW and BLACK diagonal hazard warning stripes, slightly rusty and dented, clearly dangerous",
      coin:"a single shiny GLOWING gold coin with a star on its face radiating a soft warm golden sparkle glow, obviously a happy treasure reward, plump and round",
      gift:"a cute glossy wrapped present gift box with a big sparkly bow glowing with a soft cheerful aura, obviously a reward",
      star:"a single plump glossy GLOWING gold five-pointed star sparkling with a warm aura, obviously a happy reward",
      icecream:"a cute glossy ice cream cone treat with a pink strawberry scoop, a cherry on top and a little sparkle, obviously a yummy reward",
    };
    const piece=(q.piece||"").toString(); const subj=OBJ[piece];
    if(!subj) return null;
    return {
      descriptor:`runnerobj|${piece}`,
      prompt:`${subj}. Modern 3D animated-movie style (Pixar/DreamWorks feel), soft cinematic lighting, cute rounded glossy shapes, vibrant cheerful colors, thick clean forms. A SINGLE isolated element, centered, full and complete, on a FULLY TRANSPARENT background. No ground, no floor line, no cast shadow, no other objects, no people, no text, no words. Child-friendly ages 4-8.`,
      transparent:true, quality:"low",
    };
  }
  if (kind === "runnerprop") {
    // Distinct roadside pieces per town for the 3D runner "Sunny Town Drive".
    // Transparent modern-3D cut-outs (buildings + a tree), rendered as billboards.
    const P = {
      maple: { bld_c:"a tall narrow suburban townhouse with a gabled roof and a round attic window", tree_b:"a slender white-bark birch tree with airy green leaves", prop:"a small red mailbox beside a little round flower bush", bld_a:"a cozy two-story suburban house with a pitched red roof and a small front porch",
               bld_b:"a cute single-story cottage with a brick chimney and flower window boxes",
               tree:"a big lush leafy green maple tree with a full rounded canopy and a sturdy trunk" },
      market: { bld_c:"a corner bakery shop with a bread-and-cupcake sign and a striped awning", tree_b:"a tall leafy shade tree on a small grassy mound", prop:"a wooden market fruit cart with crates of colorful fruit", bld_a:"a charming small-town shop with a striped red-and-white awning and a hanging sign",
                bld_b:"a quaint market-square building with a little clock tower on top",
                tree:"a neat rounded topiary tree planted in a square wooden planter" },
      beach: { bld_c:"a tall striped lighthouse with a red roof and a round lamp room", tree_b:"a short leaning palm tree with a little hammock between trunks", prop:"a colorful beach umbrella with a towel and a small sandcastle", bld_a:"a cute wooden beach hut on short stilts with a palm-leaf thatched roof",
               bld_b:"a colorful seaside ice-cream and surf stand with a striped beach umbrella",
               tree:"a tall curved palm tree with big green fronds and a couple of coconuts" },
      petal: { bld_c:"a charming flower shop with big blooms in the front window", tree_b:"a soft weeping willow tree with gently drooping pink-tinged branches", prop:"a wooden flower cart full of colorful bouquets", bld_a:"a pretty pastel-pink cottage with a flower-covered trellis and a heart on the door",
               bld_b:"a small white park gazebo with a pink domed roof and flower boxes",
               tree:"a blossoming cherry-blossom tree absolutely full of soft pink flowers" },
      downtown: { bld_c:"a tall rounded glass office tower, cute cartoon style", tree_b:"a tidy ornamental tree in a round concrete planter", prop:"a small city bus-stop shelter with a bench", bld_a:"a tall modern glass skyscraper in a cute rounded cartoon style, lots of windows",
                  bld_b:"a mid-rise city office building with rows of windows and a flat roof",
                  tree:"a slim city sidewalk tree with a tidy round canopy in a square concrete planter" },
      rainbow: { bld_c:"a tall spiral candy-cane tower building with peppermint stripes", tree_b:"a fluffy cotton-candy puff tree on a swirly striped trunk", prop:"a gumdrop bush dotted with colorful lollipops", bld_a:"a whimsical candy-colored tall house with a swirly twisted roof",
                 bld_b:"a cute building painted in bright rainbow stripes with a curved roof",
                 tree:"a magical lollipop-shaped tree with a swirly trunk and rainbow-colored leaves" },
    };
    const town=(q.town||"").toString(); const piece=(q.piece||"").toString();
    const set=P[town]; if(!set||!set[piece]) return null;
    return {
      descriptor:`runnerprop|${town}|${piece}`,
      prompt:`${set[piece]}. Modern 3D animated-movie style (Pixar/DreamWorks feel), soft cinematic lighting, cute rounded glossy shapes, vibrant cheerful colors, thick clean forms. A SINGLE isolated element, centered, full and complete from base to top, on a FULLY TRANSPARENT background. No ground, no floor line, no cast shadow, no road, no other objects, no people, no text, no words. Child-friendly ages 4-8.`,
      transparent:true, quality:"low",
    };
  }
  if (kind === "runnersky") {
    // Full-bleed sky + distant skyline backdrops for the 3D car runner "Sunny Town Drive".
    // Used as the Three.js scene background (the 3D road is drawn in front), so: NO road,
    // NO cars, horizon line low, lots of sky. One per town.
    const TOWNS = {
      maple:    "a bright cheerful spring morning sky, big soft fluffy white clouds in a clear blue sky, a faraway cozy small-town skyline of cute rounded rooftops and leafy maple trees along the low horizon",
      market:   "a warm sunny mid-morning sky with gentle golden light and a few soft clouds, a faraway cute town-square skyline with little market awnings, a clock tower and rounded rooftops on the low horizon",
      beach:    "a breezy sunny seaside sky, soft clouds, a faraway sparkling ocean horizon with tiny sailboats and a couple of palm trees and beach huts along the low horizon",
      petal:    "a dreamy soft-pink springtime sky with gentle clouds, a faraway skyline of blooming cherry-blossom treetops and a cute park gazebo on the low horizon",
      downtown: "a bright friendly city daytime sky with soft clouds, a faraway cute rounded city skyline of small skyscrapers and buildings on the low horizon, cheerful not gloomy",
      rainbow:  "a magical happy sky with a big soft rainbow arcing across fluffy clouds, a faraway whimsical skyline of candy-colored rooftops and a distant bridge on the low horizon",
    };
    const town=(q.town||"").toString(); const subj=TOWNS[town];
    if(!subj) return null;
    return {
      descriptor:`runnersky|${town}`,
      prompt:`${subj}. Wide scenic background, modern 3D animated-movie style (Pixar/DreamWorks feel), soft cinematic lighting, vibrant cheerful colors, the sky filling most of the frame with the horizon low in the bottom third. NO road, NO street, NO cars, NO people, NO text, NO words, NO letters, NO UI. Child-friendly ages 4-8.`,
      transparent:false, quality:"medium",
    };
  }
  return null;
}

/* ---------------- cache (image_cache table) ---------------- */
const sb = (path, init) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
  ...init,
  headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json", ...(init && init.headers ? init.headers : {}) },
});
async function cacheGet(key) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  try {
    const r = await sb(`image_cache?cache_key=eq.${encodeURIComponent(key)}&select=b64&limit=1`);
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) && rows[0] ? rows[0].b64 : null;
  } catch { return null; }
}
async function cachePut(key, descriptor, kind, b64) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try {
    await sb("image_cache", { method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify({ cache_key: key, descriptor, kind, b64 }) });
  } catch {}
}
async function cacheDel(key) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try { await sb(`image_cache?cache_key=eq.${encodeURIComponent(key)}`, { method: "DELETE" }); } catch {}
}
async function underBudget() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return true;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const r = await sb(`usage_log?select=cost_usd&date=eq.${today}`);
    if (!r.ok) return true;
    const rows = await r.json();
    return (Array.isArray(rows) ? rows : []).reduce((s, x) => s + (x.cost_usd || 0), 0) < DAILY_BUDGET_USD;
  } catch { return true; }
}
async function logCost(cost) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    await sb("usage_log", { method: "POST", body: JSON.stringify({ date: today, cost_usd: cost, kind: "image-lib", model: "gpt-image-1" }) });
  } catch {}
}

/* ---------------- OpenAI generation (same chain as generate-story-art) -------- */
async function generateImage(prompt, openaiKey, opts = {}, timeoutMs = 42000) {
  const once = async (b) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(b), signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        const b64 = data.data?.[0]?.b64_json;
        return b64 || null;
      }
      return { status: res.status };
    } catch { clearTimeout(timer); return { status: 0 }; }
  };
  const attempt = async (b) => {
    for (let t = 0; t < 3; t++) {
      const r = await once(b);
      if (typeof r === "string") return r;
      if (!r || r.status !== 429) return null;
      await new Promise((res) => setTimeout(res, 4000 + t * 3000));
    }
    return null;
  };
  const q = opts.quality || "low";
  const fmt = opts.format === "webp" ? "webp" : "png";
  const tx = opts.transparent
    ? (fmt === "webp"
        ? { background: "transparent", output_format: "webp", output_compression: 75 }
        : { background: "transparent", output_format: "png" })
    : (fmt === "webp" ? { output_format: "webp", output_compression: 75 } : {});
  return (
    (await attempt({ model: "gpt-image-1", prompt, n: 1, size: "1024x1024", quality: q, ...tx })) ||
    (await attempt({ model: "gpt-image-1", prompt, n: 1, size: "1024x1024", ...tx })) ||
    null
  );
}

/* ---------------- handler ---------------- */
function sendPng(res, b64, contentType) {
  const buf = Buffer.from(b64, "base64");
  res.setHeader("Content-Type", contentType || "image/png");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.status(200).send(buf);
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  const q = req.query || {};

  // Manifest: list what's cached (optionally by kind).
  if (q.manifest) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(200).json({ images: [] });
    try {
      let url = "image_cache?select=cache_key,descriptor,kind,created_at&order=created_at.desc&limit=500";
      if (q.kind) url += `&kind=eq.${encodeURIComponent(q.kind)}`;
      const r = await sb(url);
      const rows = r.ok ? await r.json() : [];
      return res.status(200).json({ images: Array.isArray(rows) ? rows : [] });
    } catch { return res.status(200).json({ images: [] }); }
  }

  const spec = build(q);
  if (!spec) return res.status(400).json({ error: "unknown kind/params" });
  const key = "img:" + crypto.createHash("sha1").update(spec.descriptor + (spec.transparent ? "|t" : "")).digest("hex");

  // Force-regenerate: drop the cached row first.
  if (q.force) await cacheDel(key);
  else {
    const cached = await cacheGet(key);
    if (cached) return sendPng(res, cached, spec.format === "webp" ? "image/webp" : "image/png");
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return res.status(503).json({ error: "no_openai_key" });      // <img onError> -> fallback
  if (!(await underBudget())) return res.status(503).json({ error: "over_budget" });

  const b64 = await generateImage(spec.prompt, openaiKey, { transparent: spec.transparent, quality: spec.quality, format: spec.format });
  if (!b64) return res.status(502).json({ error: "image_provider_failed" });
  await cachePut(key, spec.descriptor, (q.kind || "").toString(), b64);
  const COST = { low: 0.011, medium: 0.042, high: 0.167 };
  await logCost(COST[spec.quality] || IMG_COST_USD);
  return sendPng(res, b64, spec.format === "webp" ? "image/webp" : "image/png");
}
