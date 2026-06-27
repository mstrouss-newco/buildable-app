// /src/lib/realtimeChannel.js
// Dependency-free Supabase Realtime "Broadcast" client over a raw WebSocket.
// Matches this repo's no-SDK pattern (accounts.js / chessMatches.js use raw fetch).
// Protocol: Realtime v1.0.0 (JSON text frames). Verified against
// https://supabase.com/docs/guides/realtime/protocol (2026-05).
//
// This is the REAL-TIME transport for two-player games (tennis, pong, ...). It is
// game-agnostic: it just carries small JSON messages between two devices fast.
// All the game/role logic lives in FamilyRealtime.jsx, not here.
//
//   const ch = openChannel("match:<uuid>", {
//     accessToken,                       // parent JWT (optional; enables private later)
//     onMessage: (event, data) => {},    // a broadcast arrived from the other device
//     onStatus:  (s) => {},              // "open" | "closed" | "reconnecting"
//   });
//   ch.send("paddle", { y: 0.62 });      // broadcast to everyone else on the topic
//   ch.close();
//
// Design notes:
//  - Broadcast trades reliability for speed: an occasional message is dropped. Senders
//    should send STATE (positions), not commands, so the next message self-corrects.
//  - self:false  -> we never receive our own broadcasts.
//  - Heartbeat every 20s (server times out at ~25s). Auto-reconnect with backoff.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

function wsUrl() {
  const base = SUPABASE_URL.replace(/^http/, "ws"); // https -> wss
  return `${base}/realtime/v1/websocket?apikey=${encodeURIComponent(ANON_KEY)}&vsn=1.0.0`;
}

// topic: a short room name you choose (e.g. "match:<uuid>"). We prefix "realtime:".
export function openChannel(topic, opts) {
  opts = opts || {};
  const fullTopic = "realtime:" + topic;
  const JOIN_REF = "1";
  let ws = null;
  let refN = 1;
  let hb = null;
  let closedByUs = false;
  let backoff = 800;
  const nextRef = () => String(++refN);

  function status(s) { try { opts.onStatus && opts.onStatus(s); } catch (e) {} }

  function raw(obj) {
    if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(obj)); } catch (e) {} }
  }

  function join() {
    raw({
      topic: fullTopic,
      event: "phx_join",
      ref: JOIN_REF,
      join_ref: JOIN_REF,
      payload: {
        config: {
          broadcast: { ack: false, self: false },
          presence: { enabled: false },
          private: false, // v1: public topic on an unguessable UUID. See security note.
        },
        access_token: opts.accessToken || undefined,
      },
    });
  }

  function startHeartbeat() {
    stopHeartbeat();
    hb = setInterval(() => raw({ topic: "phoenix", event: "heartbeat", ref: nextRef(), payload: {} }), 20000);
  }
  function stopHeartbeat() { if (hb) { clearInterval(hb); hb = null; } }

  function connect() {
    try { ws = new WebSocket(wsUrl()); } catch (e) { return scheduleReconnect(); }
    ws.onopen = () => { backoff = 800; join(); startHeartbeat(); status("open"); };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.event === "broadcast" && m.payload) {
        // payload: { type:"broadcast", event:<userEvent>, payload:<data> }
        try { opts.onMessage && opts.onMessage(m.payload.event, m.payload.payload); } catch (e) {}
      }
      // phx_reply / system / phx_error are ignored; reconnect handles errors via onclose.
    };
    ws.onclose = () => { stopHeartbeat(); if (!closedByUs) { status("reconnecting"); scheduleReconnect(); } else status("closed"); };
    ws.onerror = () => { try { ws.close(); } catch (e) {} };
  }

  function scheduleReconnect() {
    if (closedByUs) return;
    setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, 8000);
  }

  connect();

  return {
    // Broadcast a user event to the other device(s) on this topic.
    send(event, data) {
      raw({
        topic: fullTopic,
        event: "broadcast",
        ref: nextRef(),
        join_ref: JOIN_REF,
        payload: { type: "broadcast", event, payload: data },
      });
    },
    // Refresh the auth token on a live channel (for private channels later).
    setToken(token) { raw({ topic: fullTopic, event: "access_token", ref: nextRef(), join_ref: JOIN_REF, payload: { access_token: token } }); },
    close() {
      closedByUs = true; stopHeartbeat();
      try { raw({ topic: fullTopic, event: "phx_leave", ref: nextRef(), join_ref: JOIN_REF, payload: {} }); } catch (e) {}
      try { ws && ws.close(); } catch (e) {}
    },
  };
}
