// ============================================================================
//  Buildable Audio — shared, reusable game sound library.
//  Tiny Web Audio synth SFX (no files) + a looping music track, with the iPad
//  rule handled: audio only starts after a real tap, so call BA.unlock() on the
//  first user gesture. Mirrors the playbook (public/play.html SFX + audioUnlock).
//
//  Usage:  <script src="buildable-audio.js"></script>  then  BA = window.BuildableAudio
//    BA.setMusic("game-music/music_space.mp3");
//    onFirstTap: BA.unlock();
//    BA.sfx("shoot"); BA.sfx("coin",{tier:2}); BA.sfx("win"); ...
//    BA.toggleMute();  // returns new muted state, remembered in localStorage
// ============================================================================
(function (g) {
  const BA = { ctx: null, music: null, muted: false, _unlocked: false, _musicUrl: null, _lastShoot: 0 };

  try { BA.muted = localStorage.getItem("bk_muted") === "1"; } catch (e) {}

  function ctx() { if (!BA.ctx) { const AC = g.AudioContext || g.webkitAudioContext; if (AC) BA.ctx = new AC(); } return BA.ctx; }

  // one synth voice
  function voice(type, f0, f1, t0, dur, vol) {
    const ac = ctx(); if (!ac) return;
    const o = ac.createOscillator(), gn = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    gn.gain.setValueAtTime(0.0001, t0);
    gn.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(gn); gn.connect(ac.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }

  BA.setMusic = function (url) {
    BA._musicUrl = url;
    if (typeof Audio !== "undefined") { try { BA.music = new Audio(url); BA.music.loop = true; BA.music.volume = 0.0; } catch (e) {} }
  };

  // call on the FIRST real tap/keypress (iOS requirement)
  BA.unlock = function () {
    const ac = ctx(); if (ac && ac.state === "suspended") ac.resume();
    BA._unlocked = true;
    BA.playMusic();
  };

  BA.playMusic = function () {
    if (!BA.music || BA.muted || !BA._unlocked) return;
    try { BA.music.volume = 0.32; const p = BA.music.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
  };
  BA.stopMusic = function () { if (BA.music) { try { BA.music.pause(); } catch (e) {} } };

  BA.toggleMute = function () {
    BA.muted = !BA.muted;
    try { localStorage.setItem("bk_muted", BA.muted ? "1" : "0"); } catch (e) {}
    if (BA.muted) BA.stopMusic(); else BA.playMusic();
    return BA.muted;
  };

  // synth sound effects
  BA.sfx = function (name, opt) {
    if (BA.muted) return; const ac = ctx(); if (!ac || !BA._unlocked) return; const t = ac.currentTime; opt = opt || {};
    switch (name) {
      case "shoot": { if (t - BA._lastShoot < 0.09) return; BA._lastShoot = t; voice("triangle", 820, 1300, t, 0.06, 0.035); break; }
      case "coin": { const tier = opt.tier || 1; const base = tier >= 3 ? 1175 : tier >= 2 ? 880 : 620; voice("sine", base, base * 1.6, t, 0.12, 0.12); if (tier >= 2) voice("sine", base * 1.5, base * 2.2, t + 0.06, 0.12, 0.10); break; }
      case "levelup": { [523, 659, 784, 1047].forEach((f, i) => voice("triangle", f, f, t + i * 0.06, 0.18, 0.12)); break; }
      case "hurt": { voice("square", 200, 90, t, 0.18, 0.14); break; }
      case "boss": { voice("sawtooth", 110, 90, t, 0.7, 0.16); voice("sawtooth", 165, 150, t, 0.7, 0.08); break; }
      case "win": { [523, 659, 784, 1047, 1319].forEach((f, i) => voice("triangle", f, f, t + i * 0.1, 0.3, 0.13)); break; }
      case "lose": { voice("sawtooth", 392, 196, t, 0.5, 0.13); voice("sawtooth", 294, 147, t + 0.12, 0.5, 0.11); break; }
      case "select": { voice("sine", 740, 988, t, 0.09, 0.10); break; }
      default: break;
    }
  };

  g.BuildableAudio = BA;
})(typeof window !== "undefined" ? window : globalThis);
