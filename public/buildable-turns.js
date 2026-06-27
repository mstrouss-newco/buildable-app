// buildable-turns.js — BT (window.BuildableTurns): the shared SAME-DEVICE turn-taking
// shell for 2-4 player (and solo) games. No backend, no accounts — pass-and-play.
// Headless-safe (no DOM): the QA sims drive matches with no rendering.
//
// Reusable mechanic `same-device-turns` (see MECHANICS.md §14). One match object owns
// the player list (names + colors), whose turn it is, scores, and the winner — so Memory,
// Bingo, and Snakes & Ladders all share one turn brain instead of re-rolling their own.
//
//   const m = BT.create({ count: 3, onTurn:(p,i)=>{}, onWin:(p)=>{} });
//   m.cur()         -> current player {idx,name,color,score,won}
//   m.add(2)        -> add to current player's score
//   m.next()        -> advance to next player (m.next(true) keeps the turn, e.g. on a match)
//   m.leader()      -> player with the highest score
//   m.finish(i)     -> end the match (winner = i, or the leader if omitted)
//   m.reset()
(function (g) {
  const BT = g.BuildableTurns || {};

  // 4 distinct, kid-friendly player colors (no emoji anywhere — brand rule).
  BT.PALETTE = ["#7C5CFC", "#FF6B6B", "#34D399", "#F5B83D"];
  BT.NAMES   = ["Player 1", "Player 2", "Player 3", "Player 4"];
  // A token shape per seat, so a player is shown as a colored pawn (drawn, not text).
  BT.TOKENS  = ["pawn", "star", "heart", "diamond"];

  BT.create = function (opts) {
    opts = opts || {};
    const count = Math.max(1, Math.min(4, opts.count || (opts.players ? opts.players.length : 2)));
    const solo = count === 1 || !!opts.solo;
    const players = [];
    for (let i = 0; i < count; i++) {
      const src = (opts.players && opts.players[i]) || {};
      players.push({
        idx: i,
        name: src.name || (solo ? "You" : BT.NAMES[i]),
        color: src.color || BT.PALETTE[i],
        token: src.token || BT.TOKENS[i],
        score: 0, won: false,
      });
    }
    const M = {
      players, solo, count, turn: 0, winnerIdx: -1, over: false,
      cur() { return players[this.turn]; },
      curIndex() { return this.turn; },
      add(delta) { players[this.turn].score += (delta == null ? 1 : delta); return players[this.turn].score; },
      addTo(i, delta) { players[i].score += (delta == null ? 1 : delta); return players[i].score; },
      // advance to next seat; pass true to KEEP the turn (e.g. you matched a pair / rolled again)
      next(keepTurn) {
        if (this.over) return this.cur();
        if (!keepTurn) this.turn = (this.turn + 1) % count;
        if (opts.onTurn) opts.onTurn(this.cur(), this.turn);
        return this.cur();
      },
      leader() { let b = players[0]; for (const p of players) if (p.score > b.score) b = p; return b; },
      tiedLeaders() { const top = this.leader().score; return players.filter(p => p.score === top); },
      finish(i) {
        const w = (i == null) ? this.leader().idx : i;
        this.winnerIdx = w; this.over = true; players[w].won = true;
        if (opts.onWin) opts.onWin(players[w]);
        return players[w];
      },
      reset() { this.turn = 0; this.winnerIdx = -1; this.over = false; for (const p of players) { p.score = 0; p.won = false; } },
    };
    return M;
  };

  g.BuildableTurns = BT;
})(typeof window !== "undefined" ? window : globalThis);
