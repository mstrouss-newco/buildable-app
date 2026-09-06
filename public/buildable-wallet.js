// buildable-wallet.js (BW) — the platform-wide coin wallet.
//
// Session 3C: the SHELL now owns the wallet. There is ONE balance per kid, saved
// by the shell (the top window). Games no longer read or write that storage from
// inside their iframe — they only ANNOUNCE coins earned, as messages, and the
// shell credits them. This is the "messages only" rule from CARTRIDGE-CONTRACT.md.
//
// The same file plays two roles automatically, decided by where it is loaded:
//
//   OWNER  (top window: window.parent === window)
//     - the real wallet: reads/writes localStorage, keyed per kid
//     - listens for `coins` delta messages posted up by child game iframes and
//       credits them (awardOnce when a key is given, so replays can't farm)
//     - after any change, broadcasts the new balance DOWN to child iframes and
//       fires a `bk-wallet` event so shell UI (the loadout, coin pills) updates
//     - the loadout spends here (spend), because the shell owns the number
//     Used by: the app shell (index.html) AND a game opened standalone (no shell),
//     where that game page is itself the top window and owns its own balance.
//
//   ANNOUNCER  (inside a shell iframe: window.parent !== window)
//     - NEVER touches localStorage
//     - add(n) / awardOnce(key,n) post a coins delta up to the shell and return 0
//     - balance() returns the last balance the shell broadcast down (cached)
//     - spend() is a no-op returning false — games don't spend, the loadout does
//
// Public API is identical in both roles, so callers don't branch:
//   BW.balance()          -> current coins (number; cached when announcing)
//   BW.add(n)             -> owner: add n; announcer: announce +n. returns balance
//   BW.awardOnce(key,n)   -> owner: add n only the FIRST time this key is seen;
//                            announcer: announce {key,n} (shell de-dupes by key)
//   BW.spend(n)           -> true + deduct if enough, else false. The owner deducts
//                            from storage; an announcer checks its cached balance and
//                            announces the deduction up as a NEGATIVE coins delta (FM3).
(function (root) {
  "use strict";
  var KEY = "bk_wallet_v1";
  var IN_SHELL = false;
  try { IN_SHELL = !!(root.parent && root.parent !== root); } catch (e) { IN_SHELL = false; }

  function ls(){ try{ return root.localStorage || null; }catch(e){ return null; } }
  function kidId(){ var s=ls(); if(!s) return "_"; try{ var k=JSON.parse(s.getItem("bk_active_kid_v1")||"null"); return (k&&k.id)?k.id:"_"; }catch(e){ return "_"; } }
  function storeKey(){ return KEY+":"+kidId(); }
  function fireLocal(bal){ try{ if(root.dispatchEvent && typeof CustomEvent==="function") root.dispatchEvent(new CustomEvent("bk-wallet",{detail:{balance:bal}})); }catch(e){} }

  // ---------------------------------------------------------------- OWNER role
  function ownerLoad(){ var s=ls(); if(!s) return {balance:0,credited:{}}; try{ var o=JSON.parse(s.getItem(storeKey())||"null"); if(!o||typeof o!=="object") o={}; if(typeof o.balance!=="number"||o.balance<0) o.balance=0; if(!o.credited||typeof o.credited!=="object") o.credited={}; return o; }catch(e){ return {balance:0,credited:{}}; } }
  function ownerSave(o){ var s=ls(); if(!s) return; try{ s.setItem(storeKey(), JSON.stringify(o)); }catch(e){} }
  function broadcastDown(bal){
    // tell every child game iframe the new balance so their announcer caches match
    try{ var fr=root.document?root.document.getElementsByTagName("iframe"):[]; for(var i=0;i<fr.length;i++){ try{ fr[i].contentWindow.postMessage({source:"buildable",kind:"walletBalance",balance:bal},"*"); }catch(e){} } }catch(e){}
  }
  function ownerAnnounce(bal){ fireLocal(bal); broadcastDown(bal); }
  function ownerBalance(){ return ownerLoad().balance; }
  // FM3: n may be NEGATIVE. A game that spends inside its own iframe (the farm
  // buys seeds) has nowhere else to put the deduction — the shell owns the
  // number, so the shell has to be able to take some away too. Clamped at zero
  // so a stale announcer can never push a kid's wallet below nothing.
  function ownerAdd(n){ n=Math.round(+n||0); if(n===0) return ownerBalance(); var o=ownerLoad(); o.balance=Math.max(0,o.balance+n); ownerSave(o); ownerAnnounce(o.balance); return o.balance; }
  function ownerAwardOnce(key,n){ n=Math.round(+n||0); if(!key||n<=0) return 0; var o=ownerLoad(); if(o.credited[key]) return 0; o.credited[key]=1; o.balance+=n; ownerSave(o); ownerAnnounce(o.balance); return n; }
  function ownerSpend(n){ n=Math.round(+n||0); if(n<=0) return true; var o=ownerLoad(); if(o.balance<n) return false; o.balance-=n; ownerSave(o); ownerAnnounce(o.balance); return true; }
  function ownerReset(){ ownerSave({balance:0,credited:{}}); ownerAnnounce(0); }

  // shell listens for coins announced UP from game iframes and credits them; also
  // replies to a child's walletHello so a freshly-loaded game learns the balance
  function ownerListen(){
    try{ root.addEventListener("message", function(ev){
      var d=ev&&ev.data; if(!d||d.source!=="buildable") return;
      if(d.kind==="coins"){ var n=Math.round(+d.delta||0); if(n===0) return; if(n>0 && d.key) ownerAwardOnce(String(d.key), n); else ownerAdd(n); }
      else if(d.kind==="walletHello"){ broadcastDown(ownerBalance()); }
    }); }catch(e){}
  }

  // ------------------------------------------------------------ ANNOUNCER role
  var cachedBal = 0;
  function post(msg){ try{ root.parent.postMessage(msg,"*"); }catch(e){} }
  function annBalance(){ return cachedBal; }
  function annAdd(n){ n=Math.round(+n||0); if(n>0) post({source:"buildable",kind:"coins",delta:n}); return cachedBal; }
  function annAwardOnce(key,n){ n=Math.round(+n||0); if(key&&n>0) post({source:"buildable",kind:"coins",delta:n,key:String(key)}); return 0; }
  // FM3: a game MAY now spend, but only against the balance the shell last told
  // it about, and only by announcing the deduction upward like any other coin
  // message — it still never touches storage. The local cache moves first so
  // the pill answers on the same frame the finger lands; the shell's broadcast
  // then overwrites it with the truth a moment later.
  function annSpend(n){ n=Math.round(+n||0); if(n<=0) return true;
    if(cachedBal<n) return false;
    cachedBal-=n; fireLocal(cachedBal);
    post({source:"buildable",kind:"coins",delta:-n});
    return true; }
  function annReset(){ /* only the owner can reset */ }
  function annListen(){
    try{ root.addEventListener("message", function(ev){
      var d=ev&&ev.data; if(!d||d.source!=="buildable"||d.kind!=="walletBalance") return;
      if(typeof d.balance==="number"){ cachedBal=d.balance; fireLocal(cachedBal); }
    }); }catch(e){}
    post({source:"buildable",kind:"walletHello"});   // ask the shell for the balance
  }

  var API = IN_SHELL
    ? { balance:annBalance, add:annAdd, awardOnce:annAwardOnce, spend:annSpend, reset:annReset, role:"announcer" }
    : { balance:ownerBalance, add:ownerAdd, awardOnce:ownerAwardOnce, spend:ownerSpend, reset:ownerReset, role:"owner" };

  if(IN_SHELL) annListen(); else ownerListen();

  root.BuildableWallet = API;
  if(typeof module!=="undefined" && module.exports) module.exports = API;
})(typeof window!=="undefined" ? window : (typeof globalThis!=="undefined" ? globalThis : this));
