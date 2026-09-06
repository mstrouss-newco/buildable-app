// Headless QA for the two share-link pages — public/song.html and
// public/story.html — card QA9.
//
// These are grouped in one harness on purpose: they are one system. A kid saves
// a song or a story, the share link goes to a grandparent, and THIS page is the
// only thing that person ever sees of the product. Neither page had a harness
// (QA-MAP.md §8a), and both are exactly the shape that broke Practice: a pretty
// route (/p/<id>, /s/<id>) in front of a static page that fetches an API.
//
// If either the route or the API name drifts, the visitor gets the marketing
// page or a permanent "loading", and nothing else in the repo would notice.
//
//   A  REACHABILITY — the page AND its pretty share route are routed ahead of
//      the catch-all, and every local file exists.
//   B  SHAPE — the ids each page's script addresses, including the loading and
//      missing states, and no emoji.
//   C  THE PAIR — the API each page fetches exists in api/.
import fs from 'fs';
import path from 'path';

const dir = process.argv[2] || '.';
let ok = true;
const fail = (m) => { console.log('FAIL: ' + m); ok = false; };
const pass = (m) => console.log('PASS: ' + m);

const routes = JSON.parse(fs.readFileSync(path.join(dir, 'vercel.json'), 'utf8')).routes || [];
const srcs = routes.map((r) => r.src);
const catchAllAt = srcs.indexOf('/(.*)');
const routedBefore = (p) => {
  const i = srcs.findIndex((s) => {
    if (s === p) return true;
    if (!s.includes('(')) return false;
    try { return new RegExp('^' + s + '$').test(p); } catch { return false; }
  });
  return i !== -1 && (catchAllAt === -1 || i < catchAllAt);
};

const PAGES = [
  {
    file: 'song.html',
    what: 'a shared song',
    pretty: '/p/abc123',
    ids: ['loading', 'missing', 'player', 'title', 'meta', 'cover', 'audio', 'cta'],
    api: 'shared-song',
  },
  {
    file: 'story.html',
    what: 'a shared story',
    pretty: '/s/abc123',
    ids: ['loading', 'missing', 'book', 'bookTitle', 'pageArt', 'pageText', 'pageNum', 'prev', 'next', 'read'],
    api: 'shared-story',
  },
];

for (const P of PAGES) {
  console.log('--- ' + P.file + ' (' + P.what + ') ---');
  const full = path.join(dir, 'public', P.file);
  if (!fs.existsSync(full)) { fail('public/' + P.file + ' is missing'); continue; }
  const html = fs.readFileSync(full, 'utf8');

  // A. reachability
  if (routedBefore('/' + P.file)) pass('/' + P.file + ' is routed ahead of the catch-all');
  else fail('/' + P.file + ' has no route ahead of the catch-all — every share link would open landing.html');
  if (routedBefore(P.pretty)) pass('the share link shape ' + P.pretty + ' resolves');
  else fail('the share link shape ' + P.pretty + ' does not resolve ahead of the catch-all — shared links are dead');
  // A share route may point straight at the page, or at a small API that fetches
  // the page and injects og: tags so a link preview shows the real cover art
  // (that is what api/story-share.js does). Both are fine; landing anywhere else
  // is not, and neither is pointing at an API file nobody deployed.
  const dest = routes.find((r) => { try { return r.src.includes('(') && new RegExp('^' + r.src + '$').test(P.pretty); } catch { return false; } });
  const to = (dest && dest.dest) || '';
  if (new RegExp(P.file).test(to)) {
    pass(P.pretty + ' lands straight on ' + P.file);
  } else if (/^\/api\//.test(to)) {
    const fn = to.replace(/^\/api\//, '').split('?')[0];
    const fnPath = path.join(dir, 'api', fn + '.js');
    if (!fs.existsSync(fnPath)) fail(P.pretty + ' goes to /api/' + fn + ', which does not exist — shared links are dead');
    else if (new RegExp(P.file).test(fs.readFileSync(fnPath, 'utf8'))) pass(P.pretty + ' goes through api/' + fn + '.js, which serves ' + P.file + ' (link-preview tags)');
    else fail(P.pretty + ' goes through api/' + fn + '.js, which never serves ' + P.file);
  } else if (dest) {
    fail(P.pretty + ' lands on ' + to + ', which is neither ' + P.file + ' nor an API that serves it');
  }

  const refs = [...new Set([...html.matchAll(/(?:src|href)="(\/[^"?#]+)"/g)].map((m) => m[1]))]
    .filter((r) => !/^\/api\//.test(r) && !r.startsWith('//'));
  let missing = 0;
  for (const r of refs) if (!fs.existsSync(path.join(dir, 'public', r.replace(/^\//, '')))) { fail(P.file + ' asks for ' + r + ', which is not in public/'); missing++; }
  if (!missing) pass('every local file it loads exists (' + refs.length + ' checked)');

  // B. shape
  for (const id of P.ids) {
    if (html.includes('id="' + id + '"')) pass('#' + id + ' is on the page');
    else fail('#' + id + ' is gone but the page script still addresses it');
  }
  const emoji = html.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu);
  if (emoji) fail(P.file + ': emoji found (' + emoji.slice(0, 5).join(' ') + ') — the house rule is drawn SVG only');
  else pass('no emoji anywhere on the page');

  // C. the pair. A share page that fetches a function nobody deployed shows a
  // spinner forever, which is indistinguishable from a slow network.
  if (new RegExp('/api/' + P.api).test(html)) pass('it fetches /api/' + P.api);
  else fail('it no longer fetches /api/' + P.api + ' — this harness cannot tell what it loads');
  if (fs.existsSync(path.join(dir, 'api', P.api + '.js'))) pass('api/' + P.api + '.js exists');
  else fail('api/' + P.api + '.js is missing — the page would spin forever');

  // The id comes out of the URL, so a page that never reads location is broken.
  if (/location\.(pathname|search|href)/.test(html)) pass('it reads the id out of the address');
  else fail('it never reads the address — it cannot know WHICH song or story to show');
}

console.log(ok ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
