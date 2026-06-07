// /api/generate-game.js
// Generates a self-contained Phaser 3 runner game as HTML,
// using the Claude API, personalized with the child's character and world.

// Raise Vercel's default 4.5 MB body-parser limit so that requests
// containing base64 character/world images don't return HTTP 413.
export const config = {
    api: {
          bodyParser: {
                  sizeLimit: "10mb",
          },
    },
};

export default async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { gameData } = req.body || {};
    if (!gameData) return res.status(400).json({ error: "gameData required" });

  // Strip base64 image blobs before forwarding to Claude — we only need
  // text metadata (name, description, theme, etc.) to generate the game.
  // This keeps the outgoing Claude API payload small and fast.
  const safeGameData = {
        ...gameData,
        character: gameData.character
          ? {
                      ...gameData.character,
                      image: undefined,
          }
                : gameData.character,
        level: gameData.level
          ? {
                      ...gameData.level,
                      image: undefined,
                      previewImage: undefined,
                      layers: gameData.level.layers
                        ? gameData.level.layers.map((l) => ({ ...l, image: undefined }))
                                    : gameData.level.layers,
          }
                : gameData.level,
  };

  const claudeKey = process.env.ANTHROPIC_API_KEY;
    if (!claudeKey) {
          return res.status(200).json({ html: fallbackGame(safeGameData) });
    }

  const { character, level, playerName, gameType } = safeGameData;
    const charName = character?.name || "Hero";
    const charDesc = character?.description || "a brave hero";
    const levelName = level?.name || "Mystery World";
    const levelTheme = level?.theme || "forest";
    const levelDesc = level?.description || "a magical world";

  const prompt = [
        `Create a complete, self-contained HTML file with a Phaser 3 side-scrolling runner game for a child named ${playerName || "a kid"}.`,
        ``,
        `Game details:`,
        `- Character: ${charName} (${charDesc})`,
        `- World: ${levelName} (theme: ${levelTheme} — ${levelDesc})`,
        `- Player name to display: ${playerName || "Player"}`,
        ``,
        `Requirements:`,
        `1. Load Phaser 3 from CDN: https://cdn.jsdelivr.net/npm/phaser@3.60.0/dist/phaser.min.js`,
        `2. Side-scrolling runner — world scrolls right to left, player stays on left side`,
        `3. Platforms scroll in from right. Player runs and jumps over gaps/obstacles`,
        `4. Draw the player as a cute ${charName} character using Phaser graphics (no external images needed)`,
        `5. Use colors matching the ${levelTheme} theme for the background and platforms`,
        `6. Controls: SPACE or UP arrow to jump, double-jump allowed`,
        `7. Show score (distance run) at top left in a friendly font`,
        `8. Show "${charName}" as a label above the player sprite`,
        `9. Game Over screen when player falls off: show score and a Play Again button`,
        `10. Add collectible coins/stars for bonus points`,
        `11. Colorful and fun — for ages 5-12`,
        `12. Canvas 800x400, centered on the page, dark body background`,
        `13. Speed gradually increases over time`,
        `14. Auto-start — no splash screen needed`,
        `15. Return ONLY the HTML starting with <!DOCTYPE html>. No markdown.`
      ].join("\n");

  try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: {
                          "x-api-key": claudeKey,
                          "anthropic-version": "2023-06-01",
                          "content-type": "application/json",
                },
                body: JSON.stringify({
                          model: "claude-opus-4-5",
                          max_tokens: 8000,
                          messages: [{ role: "user", content: prompt }],
                }),
        });

      if (!response.ok) {
              console.error("Claude API error:", response.status, await response.text());
              return res.status(200).json({ html: fallbackGame(safeGameData) });
      }

      const data = await response.json();
        let html = data.content?.[0]?.text || "";

      // Strip markdown code fences if Claude wrapped the output
      html = html.replace(/^```html\n?/i, "").replace(/```\s*$/i, "").trim();

      if (!html.includes("<!DOCTYPE") && !html.includes("<html")) {
              return res.status(200).json({ html: fallbackGame(safeGameData) });
      }

      return res.status(200).json({ html });
  } catch (e) {
        console.error("generate-game error:", e);
        return res.status(200).json({ html: fallbackGame(safeGameData) });
  }
}

// Built-in fallback game when Claude is unavailable
function fallbackGame(gameData) {
    const charName = gameData?.character?.name || "Hero";
    const levelName = gameData?.level?.name || "Mystery World";
    const playerName = gameData?.playerName || "Player";
    const theme = gameData?.level?.theme || "forest";

  const bgColors = {
        forest: "#1a4a1a",
        castle: "#2a2a4a",
        underwater: "#0a3a5a",
        space: "#050510",
        desert: "#8a6020",
        volcano: "#5a1a05",
        "candy kingdom": "#8a2060",
  };
    const platformColors = {
          forest: 0x228b22,
          castle: 0x888888,
          underwater: 0x006994,
          space: 0x4b0082,
          desert: 0xc2955d,
          volcano: 0x8b0000,
          "candy kingdom": 0xff69b4,
    };
    const bg = bgColors[theme] || "#1a4a1a";
    const platColor = platformColors[theme] || 0x228b22;
    const platHex = platColor.toString(16).padStart(6, "0");

  return `<!DOCTYPE html>
  <html>
  <head>
  <meta charset="UTF-8">
  <title>${levelName} - ${charName} Runner</title>
  <style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#111; display:flex; flex-direction:column; align-items:center;
  justify-content:center; height:100vh; font-family:system-ui,sans-serif; gap:10px; }
  #info { color:rgba(255,255,255,0.7); font-size:13px; letter-spacing:1px; }
  </style>
  </head>
  <body>
  <div id="info">${playerName} · ${levelName}</div>
  <script src="https://cdn.jsdelivr.net/npm/phaser@3.60.0/dist/phaser.min.js"><\/script>
  <script>
  const W=800,H=400;
  let totalScore=0;

  class Main extends Phaser.Scene {
  constructor(){super("Main");}
  create(){
  this.alive=true;
  this.jumpCount=0;
  this.scrollSpeed=3;
  this.dist=0;
  this.add.rectangle(W/2,H/2,W,H,0x${bg.slice(1)});
  for(let i=0;i<30;i++){
  const x=Phaser.Math.Between(0,W);
  const y=Phaser.Math.Between(0,H*0.6);
  this.add.circle(x,y,Phaser.Math.Between(1,4),0xffffff,Phaser.Math.FloatBetween(0.2,0.8));
  }
  this.plats=this.physics.add.staticGroup();
  this.addPlat(W/2+50,H-20,W+100);
  this.floats=this.physics.add.staticGroup();
  for(let i=0;i<3;i++) this.addFloat(250+i*200,H-130+Phaser.Math.Between(-30,30));
  const g=this.make.graphics({x:0,y:0,add:false});
  g.fillStyle(0xff6b6b); g.fillRoundedRect(5,20,30,30,6);
  g.fillStyle(0xffd93d); g.fillCircle(20,12,12);
  g.fillStyle(0x333333); g.fillCircle(16,10,2.5); g.fillCircle(24,10,2.5);
  g.fillStyle(0xff9999); g.fillCircle(20,15,3);
  g.generateTexture("hero",40,52); g.destroy();
  this.hero=this.physics.add.sprite(100,H-100,"hero");
  this.hero.setCollideWorldBounds(false);
  this.physics.add.collider(this.hero,this.plats);
  this.physics.add.collider(this.hero,this.floats);
  this.nameTag=this.add.text(0,0,"${charName}",{
  fontSize:"13px",fill:"#fff",stroke:"#000",strokeThickness:3
  }).setOrigin(0.5,1);
  this.coins=this.physics.add.staticGroup();
  for(let i=0;i<6;i++) this.spawnCoin(300+i*90);
  this.physics.add.overlap(this.hero,this.coins,(_h,c)=>{
  c.destroy(); this.dist+=10; this.hud.setText("Score: "+Math.floor(this.dist));
  },null,this);
  this.obs=this.add.group();
  this.time.addEvent({delay:1400,callback:this.spawnObs,callbackScope:this,loop:true});
  this.hud=this.add.text(16,16,"Score: 0",{fontSize:"20px",fill:"#fff",stroke:"#000",strokeThickness:3}).setDepth(5);
  this.keys=this.input.keyboard.addKeys({up:Phaser.Input.Keyboard.KeyCodes.UP,space:Phaser.Input.Keyboard.KeyCodes.SPACE});
  this.cursors=this.input.keyboard.createCursorKeys();
  this.time.addEvent({delay:4000,callback:()=>{this.scrollSpeed=Math.min(9,this.scrollSpeed+0.4);},loop:true});
  }
  addPlat(x,y,w){
  const g=this.make.graphics({x:0,y:0,add:false});
  g.fillStyle(0x${platHex}); g.fillRect(0,0,w,40);
  g.fillStyle(0x${platHex}+0x222222); g.fillRect(0,0,w,10);
  const key="plat"+Math.random().toString(36).slice(2);
  g.generateTexture(key,w,40); g.destroy();
  const p=this.plats.create(x,y,key); p.refreshBody(); return p;
  }
  addFloat(x,y){
  const g=this.make.graphics({x:0,y:0,add:false});
  g.fillStyle(0x${platHex}); g.fillRect(0,0,100,16);
  const key="fp"+Math.random().toString(36).slice(2);
  g.generateTexture(key,100,16); g.destroy();
  const p=this.floats.create(x,y,key); p.refreshBody(); return p;
  }
  spawnCoin(x){
  const g=this.make.graphics({x:0,y:0,add:false});
  g.fillStyle(0xffd700); g.fillCircle(8,8,8);
  g.fillStyle(0xffaa00); g.fillCircle(8,8,5);
  g.generateTexture("coin",16,16); g.destroy();
  const c=this.coins.create(x,Phaser.Math.Between(H-200,H-70),"coin");
  c.refreshBody();
  }
  spawnObs(){
  if(!this.alive)return;
  const g=this.make.graphics({x:0,y:0,add:false});
  g.fillStyle(0xe74c3c); g.fillRect(0,10,28,40);
  g.fillStyle(0xc0392b); g.fillTriangle(14,0,0,14,28,14);
  g.generateTexture("obs",28,50); g.destroy();
  const o=this.physics.add.image(W+30,H-60,"obs");
  o.body.allowGravity=false; o.setImmovable(true);
  this.obs.add(o);
  this.physics.add.overlap(this.hero,o,()=>this.die(),null,this);
  this.tweens.add({targets:o,x:-60,duration:Math.max(1200,2800-Math.floor(this.dist)*1.5),onComplete:()=>o.destroy()});
  }
  die(){
  if(!this.alive)return;
  this.alive=false;
  this.physics.pause();
  this.add.rectangle(W/2,H/2,420,210,0x000000,0.8).setDepth(10);
  this.add.text(W/2,H/2-65,"Game Over!",{fontSize:"38px",fill:"#fff",stroke:"#000",strokeThickness:4}).setOrigin(0.5).setDepth(11);
  this.add.text(W/2,H/2-15,"Score: "+Math.floor(this.dist),{fontSize:"26px",fill:"#ffd700",stroke:"#000",strokeThickness:3}).setOrigin(0.5).setDepth(11);
  const btn=this.add.text(W/2,H/2+50,"Play Again",{
  fontSize:"22px",fill:"#fff",backgroundColor:"#27ae60",
  padding:{x:24,y:12},stroke:"#145a32",strokeThickness:2
  }).setOrigin(0.5).setDepth(11).setInteractive({useHandCursor:true});
  btn.on("pointerover",()=>btn.setStyle({backgroundColor:"#2ecc71"}));
  btn.on("pointerout",()=>btn.setStyle({backgroundColor:"#27ae60"}));
  btn.on("pointerdown",()=>{totalScore=0;this.scene.restart();});
  }
  update(){
  if(!this.alive)return;
  this.dist+=this.scrollSpeed*0.02;
  this.hud.setText("Score: "+Math.floor(this.dist));
  this.floats.children.iterate(p=>{
  if(!p)return;
  p.x-=this.scrollSpeed;
  if(p.x<-60){p.x=W+60;p.y=H-130+Phaser.Math.Between(-30,30);}
  p.refreshBody();
  });
  this.coins.children.iterate(c=>{
  if(!c)return;
  c.x-=this.scrollSpeed;
  if(c.x<-20){c.x=W+50;c.y=Phaser.Math.Between(H-200,H-70);c.refreshBody();}
  });
  const onGround=this.hero.body.blocked.down;
  if(onGround)this.jumpCount=0;
  const justJumped=Phaser.Input.Keyboard.JustDown(this.cursors.up)||
  Phaser.Input.Keyboard.JustDown(this.keys.space)||
  Phaser.Input.Keyboard.JustDown(this.keys.up);
  if(justJumped&&this.jumpCount<2){this.hero.setVelocityY(-570);this.jumpCount++;}
  this.nameTag.setPosition(this.hero.x,this.hero.y-26);
  if(this.hero.y>H+60)this.die();
  }
  }

  new Phaser.Game({
  type:Phaser.AUTO,width:W,height:H,
  backgroundColor:"${bg}",
  physics:{default:"arcade",arcade:{gravity:{y:820},debug:false}},
  scene:Main,
  parent:document.body
  });
  <\/script>
  </body>
  </html>`;
}
