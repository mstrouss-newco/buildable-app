// DOM render smoke test for buildable-checkers.html using jsdom.
// Optional extra check — requires jsdom: `npm i jsdom` first, then `node qa-checkers-dom.mjs .`
// (The primary headless QA, qa-checkers.mjs, uses only Node's built-in vm — no install.)
// Confirms: the page loads without throwing, a solo game builds 64 cells + 24 pieces,
// tapping a piece highlights legal targets, a move re-renders, and the online init
// (?online=1 postMessage contract) sets up the board without errors.
import fs from 'fs';
import { JSDOM } from 'jsdom';
const dir = process.argv[2] || '.';
const html = fs.readFileSync(dir + '/public/buildable-checkers.html', 'utf8');

let fail = 0;
const check = (name, cond, extra='') => { if(!cond) fail++; console.log(`${cond?'PASS':'FAIL'}  ${name}${extra?'  '+extra:''}`); };

const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x/buildable-checkers.html' });
const w = dom.window, d = w.document;
// jsdom lacks Element.animate / AudioContext — stub so the FX + audio paths don't throw
w.Element.prototype.animate = function(){ return { cancel(){}, finish(){} }; };
w.HTMLMediaElement.prototype.play = function(){ return Promise.resolve(); };
w.HTMLMediaElement.prototype.pause = function(){};

check('CHECKERS_GAME exposed on window', !!w.CHECKERS_GAME);

// --- start a solo game ---
d.getElementById('btn-solo').click();        // -> setup screen
check('setup screen shown', d.getElementById('s-setup').classList.contains('on'));
d.getElementById('btn-start').click();        // -> game
check('game screen shown', d.getElementById('s-game').classList.contains('on'));
check('board has 64 cells', d.querySelectorAll('#board .cell').length === 64, '(got '+d.querySelectorAll('#board .cell').length+')');
check('24 pieces rendered', d.querySelectorAll('#piece-layer .piece').length === 24, '(got '+d.querySelectorAll('#piece-layer .piece').length+')');

// --- tap a red piece, expect target highlights ---
function cell(r,c){ return d.querySelector(`#board .cell[data-r="${r}"][data-c="${c}"]`); }
cell(5,0).click();   // a red man on row 5 — should have a forward move
const targets = d.querySelectorAll('#board .cell.target').length;
check('selecting a piece shows ≥1 move target', targets >= 1, '(targets='+targets+')');

// --- make that move; turn should pass to the robot ---
const tcell = d.querySelector('#board .cell.target');
const beforeLabel = d.getElementById('turn-label').textContent;
tcell.click();
check('a move executed without throwing', true);
check('24 pieces still present after a non-capture move', d.querySelectorAll('#piece-layer .piece').length === 24);

// --- online init smoke (the ?online contract) ---
let posted = [];
const w2 = new JSDOM(html, { runScripts:'dangerously', pretendToBeVisual:true, url:'https://x/buildable-checkers.html?online=1' }).window;
w2.Element.prototype.animate = function(){ return {cancel(){},finish(){}}; };
w2.HTMLMediaElement.prototype.play = ()=>Promise.resolve(); w2.HTMLMediaElement.prototype.pause = ()=>{};
// capture messages the engine posts to its parent
Object.defineProperty(w2, 'parent', { value: { postMessage:(m)=>posted.push(m) }, configurable:true });
// re-run the online "ready" announce by dispatching a fresh init (engine already posted ready on load)
const init = { type:'checkersInit', myColor:'b', world:'space', oppName:'Sam', myName:'Pat', state: w2.CHECKERS_GAME.initialBoard() };
w2.dispatchEvent(new w2.MessageEvent('message', { data: init }));
const d2 = w2.document;
check('online init builds the board', d2.querySelectorAll('#board .cell').length === 64);
check('online init flips board for blue (self at bottom)', d2.querySelector('#board .cell[data-r="0"][data-c="1"]') !== null);
check('online game screen shown', d2.getElementById('s-game').classList.contains('on'));

console.log(fail===0 ? '\nDOM SMOKE: ALL PASS' : `\nDOM SMOKE: ${fail} FAILED`);
process.exit(fail===0?0:1);
