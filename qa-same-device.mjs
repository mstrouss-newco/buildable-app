// Headless QA for the "Same device" row (QA56).
//
// Log item 71 said the Solo / Same device / Play a friend row was only ever
// wired on some games. It was worse than that: on all four board games the
// button opened the ENGINE'S OWN MENU, which is the robot difficulty picker,
// so tapping "Same device" quietly started a match against the computer. Only
// Tennis deep-linked a real 2P match.
//
// This harness holds the contract for every same-device game:
//   1. the shell hands the engine a 2P deep link, never a bare engine URL;
//   2. the engine honours that deep link without flashing its own menu;
//   3. the engine really has a 2-player mode behind it.
// No browser needed -- it reads the shipped source, the way the serving check
// in qa-all.mjs does.
import fs from 'fs';
const dir = process.argv[2] || '.';
const read = (f) => fs.readFileSync(dir + '/' + f, 'utf8');

let fail = 0;
const check = (name, cond, extra = '') => {
  if (!cond) fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ::  ' + extra : ''}`);
};

const shell = read('src/BuildableKids.jsx');
const board = read('public/buildable-boardgame.js');

console.log('--- the shell sends a 2P deep link ---');
check('board landing flags 2P on Same device',
  /onSameDevice=\{\(\) => \{[^}]*setBoardTwoP\(true\)/.test(shell));
check('Solo never leaves the 2P flag set',
  /onSolo=\{\(\) => \{[^}]*setBoardTwoP\(false\)/.test(shell));
const twoParam = (shell.match(/boardTwoP \? "&mode=two"/g) || []).length;
check('all 3 shared-harness board engines carry mode=two', twoParam === 3, `found ${twoParam}, want 3`);
check('checkers carries mode=two',
  /buildable-checkers\.html\?v=[a-z0-9]+" \+ \(twoP \? "&mode=two"/.test(shell));
check('tennis carries mode=two',
  /"&mode=" \+ \(start === "local" \? "two" : "solo"\)/.test(shell));

console.log('--- the engines honour it ---');
check('shared board harness reads ?mode=two', /bgQ\.get\("mode"\) === "two"/.test(board));
check('shared board harness starts a 2P game', /bgQ\.get\("mode"\) === "two"[\s\S]{0,900}startGame\("two"\)/.test(board));
check('shared board harness hides its own menu on the deep link',
  /bgQ\.get\("mode"\) === "two"[\s\S]{0,400}D\.start\.style\.display = "none"/.test(board));
const chk = read('public/buildable-checkers.html');
check('checkers reads ?mode=two', /_chkQ\.get\("mode"\)==="two"/.test(chk));
check('checkers starts a 2P game on the deep link',
  /_chkQ\.get\("mode"\)==="two"[\s\S]{0,400}mode="two"[\s\S]{0,300}startGame\(\)/.test(chk));
const tn = read('public/tennis.html');
check('tennis reads ?mode= and launches straight into it',
  /shellMode[\s\S]{0,200}mode = shellMode[\s\S]{0,200}newGame\(\)/.test(tn));

console.log('--- the engines really have a 2-player mode ---');
for (const [g, f] of [['tictactoe', 'public/tictactoe-engine.html'],
                      ['connectfour', 'public/connectfour-engine.html'],
                      ['dotsboxes', 'public/dotsboxes-engine.html']]) {
  const src = read(f);
  check(`${g}: declares a "two" mode`, /modes:\s*\[[^\]]*"two"/.test(src));
}
check('checkers: has a same-screen 2P mode', /btn-two-local[\s\S]{0,200}mode="two"/.test(chk));
check('tennis: has a same-screen 2P mode', /modes: \["solo", "two", "family"\]/.test(tn));

console.log('--- tennis same-device input ownership (the QA56 defect) ---');
check('a pointer claims a half on press', /if \(phase === "down"\) padOwner\[key\] = \(p\.ny < 0\.5\) \? "top" : "bottom"/.test(tn));
check('a move with no press steers nothing', /else if \(!padOwner\[key\]\) return;/.test(tn));
check('presses are released on lift', /canvas\.addEventListener\("pointerup"[\s\S]{0,120}releasePress/.test(tn));
check('touches claim their own half', /canvas\.addEventListener\("touchstart"[\s\S]{0,400}"down", "t"/.test(tn));
check('presses are cleared on a new game', /clearPresses\(\);/.test(tn));
check('the 2P end banner names the winner, not "you"',
  /mode === "two" \? \(G\.winner === "bottom" \? "Player 1 wins!" : "Player 2 wins!"\)/.test(tn));

console.log(fail ? `SOME FAILED (${fail})` : 'SAME-DEVICE ROW OK ON ALL 5 GAMES');
process.exit(fail ? 1 : 0);
