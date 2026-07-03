// ============================================================================
//  Buildable Audio (BA) — shared game audio library.
//  Plays REAL crafted audio: ElevenLabs sound effects (via /api/sfx) decoded into
//  Web Audio buffers so they overlap + fire instantly, and ElevenLabs music (via
//  /api/chess-music) looped. The built-in synth is a DEV/OFFLINE FALLBACK ONLY —
//  never the product (see the "ElevenLabs music only" / sound rule).
//
//  Handles the iPad/browser gesture rule: auto-installs one-time unlock listeners
//  on the first tap/click/key anywhere (works inside the games-hub iframe too).
//
//  Setup (engine):
//    BA.configure({ sfxBase:"https://www.buildablekids.com/api/sfx?s=",
//                   map:{ shoot:"spk_shoot", coin:"spk_coin", boom:"spk_boom", ... } });
//    BA.setMusic("https://www.buildablekids.com/api/chess-music?world=space");
//  Use: BA.sfx("coin",{tier:2});  BA.sfx("boom");  BA.toggleMute();
//
//  Backward compatible: an engine that never calls configure() (no map) just gets
//  the synth fallback for the same names it always used — no behavior change.
// ============================================================================
(function (g) {
  const BA = { ctx:null, master:null, music:null, muted:false, _unlocked:false,
               sfxBase:"", map:{}, buffers:{}, _loading:{}, _last:{} };

  try { BA.muted = localStorage.getItem("bk_muted") === "1"; } catch (e) {}

  function ctx() {
    if (!BA.ctx) {
      const AC = g.AudioContext || g.webkitAudioContext; if (!AC) return null;
      BA.ctx = new AC();
      BA.master = BA.ctx.createGain(); BA.master.gain.value = 0.9; BA.master.connect(BA.ctx.destination);
    }
    return BA.ctx;
  }

  BA.configure = function (o) { o = o || {}; if (o.sfxBase != null) BA.sfxBase = o.sfxBase; if (o.map) BA.map = o.map; if (BA._unlocked) BA.preload(); };

  // Canonical shared one-shots (real ElevenLabs sounds in /api/sfx). Any game that
  // triggers one of these bare event names resolves to the created sound even if it
  // has no explicit map entry -> the synth beep below is never the shipped product.
  const DEFAULTS = { select:"select", win:"win", lose:"lose", coin:"coin", collect:"collect",
    hit:"hit", shoot:"shoot", explode:"explode", hurt:"hurt", boss:"boss", boom:"boom",
    levelup:"levelup", pop:"pop", whoosh:"whoosh", sparkle:"sparkle", powerup:"powerup",
    error:"error", celebrate:"celebrate" };

  // ---- real crafted sounds: fetch -> decode -> cache as AudioBuffer ----
  function load(key) {
    if (!key || BA.buffers[key] || BA._loading[key] || !BA.sfxBase) return;
    const ac = ctx(); if (!ac || typeof fetch === "undefined") return;
    BA._loading[key] = true;
    fetch(BA.sfxBase + encodeURIComponent(key))
      .then(r => r.arrayBuffer())
      .then(buf => ac.decodeAudioData(buf))
      .then(b => { BA.buffers[key] = b; })
      .catch(() => {})                  // leave undefined -> synth fallback
      .finally(() => { BA._loading[key] = false; });
  }
  BA.preload = function () { const seen = {}; const eat = (key) => { if (key && !seen[key]) { seen[key] = 1; load(key); } }; for (const k in BA.map) eat(BA.map[k]); for (const k in DEFAULTS) eat(DEFAULTS[k]); };

  function playBuf(b, rate, vol) {
    const ac = ctx(); if (!ac) return;
    const src = ac.createBufferSource(); src.buffer = b; src.playbackRate.value = rate || 1;
    const gn = ac.createGain(); gn.gain.value = vol == null ? 1 : vol;
    src.connect(gn); gn.connect(BA.master); src.start();
  }

  // ---- synth fallback (only when a real sound isn't available yet) ----
  function voice(type, f0, f1, t0, dur, vol) {
    const ac = ctx(); if (!ac) return;
    const o = ac.createOscillator(), gn = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(vol, t0 + 0.012); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(gn); gn.connect(BA.master); o.start(t0); o.stop(t0 + dur + 0.03);
  }
  function noise(t0, dur, vol, f0, f1) {
    const ac = ctx(); if (!ac) return;
    const n = Math.max(1,(ac.sampleRate*dur)|0), buf = ac.createBuffer(1,n,ac.sampleRate), d = buf.getChannelData(0);
    for (let i=0;i<n;i++) d[i]=(Math.random()*2-1)*(1-i/n);
    const s=ac.createBufferSource(); s.buffer=buf; const f=ac.createBiquadFilter(); f.type="lowpass";
    f.frequency.setValueAtTime(f0||1400,t0); f.frequency.exponentialRampToValueAtTime(Math.max(80,f1||250),t0+dur);
    const gn=ac.createGain(); gn.gain.setValueAtTime(vol,t0); gn.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
    s.connect(f); f.connect(gn); gn.connect(BA.master); s.start(t0); s.stop(t0+dur);
  }
  function synth(name, opt) {
    const ac = ctx(); if (!ac) return; const t = ac.currentTime; opt = opt || {};
    switch (name) {
      case "shoot": voice("triangle",820,1280,t,0.06,0.05); break;
      case "coin": { const b = (opt.tier||1)>=3?1175:(opt.tier||1)>=2?880:620; voice("sine",b,b*1.6,t,0.12,0.14); break; }
      case "levelup": [523,659,784,1047].forEach((f,i)=>voice("triangle",f,f,t+i*0.06,0.2,0.14)); break;
      case "hurt": voice("square",220,80,t,0.2,0.16); break;
      case "explode": noise(t,0.16,0.2,1500,220); voice("sine",180,60,t,0.16,0.12); break;
      case "boom": noise(t,0.5,0.32,1900,120); voice("sine",130,42,t,0.5,0.2); break;
      case "boss": voice("sawtooth",110,88,t,0.7,0.18); voice("sawtooth",165,150,t,0.7,0.09); break;
      case "win": [523,659,784,1047,1319].forEach((f,i)=>voice("triangle",f,f,t+i*0.1,0.3,0.15)); break;
      case "lose": voice("sawtooth",392,196,t,0.5,0.14); voice("sawtooth",294,147,t+0.12,0.5,0.12); break;
      case "select": voice("sine",740,988,t,0.09,0.11); break;
      default: break;
    }
  }

  BA.setMusic = function (url) { if (typeof Audio !== "undefined" && url) { try { BA.music = new Audio(url); BA.music.loop = true; BA.music.crossOrigin = "anonymous"; BA.music.volume = 0; BA.music.preload = "auto"; } catch (e) {} } };

  BA.unlock = function () {
    const ac = ctx(); if (ac && ac.state === "suspended") { try { ac.resume(); } catch (e) {} }
    if (!BA._unlocked) { BA._unlocked = true; BA.preload(); }
    BA.playMusic();
  };
  BA.playMusic = function () { if (!BA.music || BA.muted || !BA._unlocked) return; try { BA.music.volume = 0.4; const p = BA.music.play(); if (p && p.catch) p.catch(()=>{}); } catch (e) {} };
  BA.stopMusic = function () { if (BA.music) { try { BA.music.pause(); } catch (e) {} } };
  BA.toggleMute = function () { BA.muted = !BA.muted; try { localStorage.setItem("bk_muted", BA.muted?"1":"0"); } catch(e){} if (BA.master) BA.master.gain.value = BA.muted?0:0.9; if (BA.muted) BA.stopMusic(); else BA.unlock(); return BA.muted; };

  // throttle rapid repeats; "hit" is throttled hard + played soft so a stream of
  // impacts becomes an occasional gentle tick, never a beep-per-bullet.
  const THROTTLE = { shoot:0.07, explode:0.04, coin:0.03, boom:0.12, hit:0.16 };
  const VOL = { hit:0.5 };
  BA.sfx = function (name, opt) {
    if (BA.muted) return; const ac = ctx(); if (!ac) return; if (!BA._unlocked) BA.unlock();
    const now = ac.currentTime, th = THROTTLE[name]; if (th && now - (BA._last[name]||0) < th) return; BA._last[name] = now;
    const key = BA.map[name] || DEFAULTS[name], b = key && BA.buffers[key];
    if (b) { const tier = (opt && opt.tier) || 1; const rate = name === "coin" ? (tier>=3?1.16:tier>=2?1.08:1.0) : 1.0; playBuf(b, rate, VOL[name]||1); }
    else { synth(name, opt); if (key) load(key); }   // real sound not ready -> synth now, fetch for next time
  };

  if (g.addEventListener) { const u=()=>BA.unlock(); ["pointerdown","touchend","mousedown","keydown","click"].forEach(ev=>{ try{ g.addEventListener(ev,u,{passive:true}); }catch(e){} }); }

  g.BuildableAudio = BA;
})(typeof window !== "undefined" ? window : globalThis);
