import { useRef, useState, useEffect } from "react";

// A big, kid-friendly audio player: one large round play/pause button + a
// progress bar that fills as the song plays. Replaces the tiny native <audio>
// controls so a pre-reader can tell what to tap.
export default function SongPlayer({ src, color = "#5B6CFF", autoPlay = false, size = 64 }) {
  const ref = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => { setPlaying(false); setPct(0); };
    const onTime = () => { if (a.duration) setPct((a.currentTime / a.duration) * 100); };
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnd);
    a.addEventListener("timeupdate", onTime);
    return () => {
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("timeupdate", onTime);
    };
  }, []);

  function toggle() {
    const a = ref.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  }

  const ic = Math.round(size * 0.44);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%" }}>
      <button
        onClick={toggle}
        aria-label={playing ? "Pause" : "Play"}
        style={{ width: size, height: size, flexShrink: 0, borderRadius: "50%", border: "none",
          cursor: "pointer", background: color, display: "flex", alignItems: "center",
          justifyContent: "center", boxShadow: "0 4px 14px rgba(0,0,0,.35)" }}
      >
        {playing ? (
          <svg width={ic} height={ic} viewBox="0 0 24 24" fill="#15131f" aria-hidden="true">
            <rect x="5" y="4" width="5.2" height="16" rx="1.6" /><rect x="13.8" y="4" width="5.2" height="16" rx="1.6" />
          </svg>
        ) : (
          <svg width={ic} height={ic} viewBox="0 0 24 24" fill="#15131f" aria-hidden="true" style={{ marginLeft: Math.round(size * 0.04) }}>
            <path d="M7 4.6v14.8a1 1 0 0 0 1.52.86l12-7.4a1 1 0 0 0 0-1.72l-12-7.4A1 1 0 0 0 7 4.6z" />
          </svg>
        )}
      </button>
      <div style={{ flex: 1, height: 9, borderRadius: 999, background: "rgba(255,255,255,.16)", overflow: "hidden", minWidth: 36 }}>
        <div style={{ width: pct + "%", height: "100%", background: color, transition: "width .2s linear" }} />
      </div>
      <audio ref={ref} src={src} autoPlay={autoPlay} preload="metadata" />
    </div>
  );
}
