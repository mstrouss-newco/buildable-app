// voiceBus — ONE shared audio element for ALL spoken helper lines (home greeting,
// win/lose reactions, Helper Lab voice preview). Routing every voice clip through
// a single element means starting a new line always stops the previous one, so
// helper voices can never overlap each other.
import { registerAudio } from "./audioUnlock";

let el = null;
function get() {
  if (!el && typeof window !== "undefined") {
    el = new Audio();
    try { registerAudio(el); } catch (e) {}
  }
  return el;
}
export function playVoiceUrl(url) {
  const a = get();
  if (!a || !url) return;
  try {
    a.pause();
    a.src = url;
    a.currentTime = 0;
    a.volume = 1;
    a.muted = false;
    const p = a.play();
    if (p && p.catch) p.catch(() => {});
  } catch (e) {}
}
export function stopVoice() {
  const a = get();
  if (a) { try { a.pause(); } catch (e) {} }
}
