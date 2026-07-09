// buildable-wallet.js (BW) — the shared, platform-wide coin wallet.
// ONE coin balance per kid, saved in the browser. It is shared across every game
// because they all run on the same origin: a game in an iframe writes the SAME
// localStorage the main app reads, so the balance is one number everywhere.
// Manifests declare how many coins a level awards; games call BW.awardOnce()/add();
// the loadout spends. Never rebuilt per game. Safe to load anywhere; no-ops
// cleanly when there is no storage (headless QA).
//   BW.balance()          -> current coins (number)
//   BW.add(n)             -> add n coins, returns new balance
//   BW.awardOnce(key,n)   -> add n only the FIRST time this key is seen
//                            (so replaying a level can't farm coins); returns amount added
//   BW.spend(n)           -> true + deduct if enough, else false
(function (root) {
  "use strict";
  var KEY = "bk_wallet_v1";
  function ls(){ try{ return root.localStorage || null; }catch(e){ return null; } }
  function kidId(){ var s=ls(); if(!s) return "_"; try{ var k=JSON.parse(s.getItem("bk_active_kid_v1")||"null"); return (k&&k.id)?k.id:"_"; }catch(e){ return "_"; } }
  function storeKey(){ return KEY+":"+kidId(); }
  function load(){ var s=ls(); if(!s) return {balance:0,credited:{}}; try{ var o=JSON.parse(s.getItem(storeKey())||"null"); if(!o||typeof o!=="object") o={}; if(typeof o.balance!=="number"||o.balance<0) o.balance=0; if(!o.credited||typeof o.credited!=="object") o.credited={}; return o; }catch(e){ return {balance:0,credited:{}}; } }
  function save(o){ var s=ls(); if(!s) return; try{ s.setItem(storeKey(), JSON.stringify(o)); }catch(e){} }
  function announce(bal){
    try{ if(root.dispatchEvent && typeof CustomEvent==="function") root.dispatchEvent(new CustomEvent("bk-wallet",{detail:{balance:bal}})); }catch(e){}
    try{ if(root.parent && root.parent!==root) root.parent.postMessage({source:"buildable",kind:"coins",balance:bal},"*"); }catch(e){}
  }
  function balance(){ return load().balance; }
  function add(n){ n=Math.round(+n||0); if(n<=0) return balance(); var o=load(); o.balance+=n; save(o); announce(o.balance); return o.balance; }
  function awardOnce(key,n){ n=Math.round(+n||0); if(!key||n<=0) return 0; var o=load(); if(o.credited[key]) return 0; o.credited[key]=1; o.balance+=n; save(o); announce(o.balance); return n; }
  function spend(n){ n=Math.round(+n||0); if(n<=0) return true; var o=load(); if(o.balance<n) return false; o.balance-=n; save(o); announce(o.balance); return true; }
  function reset(){ save({balance:0,credited:{}}); announce(0); }
  var API={ balance:balance, add:add, awardOnce:awardOnce, spend:spend, reset:reset };
  root.BuildableWallet = API;
  if(typeof module!=="undefined" && module.exports) module.exports = API;
})(typeof window!=="undefined" ? window : (typeof globalThis!=="undefined" ? globalThis : this));
