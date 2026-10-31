// Run once from the project root:  node apply-redesign.mjs
//
// Redesigns (flat, no glass / neon):
//   - Profile > About tab, Game Collection page, single game page
//   - Chat page (messaging-app layout)
//
// Before running, copy these files into the project (same paths):
//   css/arcadia-clean.css   (new)
//   css/messaging.css       (replaces the old one)
//   js/messaging.js         (replaces the old one)
//   redesign/main-about.part, redesign/main-games.part  (read by this script)
//
// This script then edits js/main.js and index.html. Backups of both go in
// .redesign-backup/. Undo: git restore js/main.js js/messaging.js css/messaging.css index.html
import fs from 'node:fs';
import path from 'node:path';

const fail = (m) => { console.error('STOPPED: ' + m + '\nNothing was changed.'); process.exit(1); };
const need = (p) => { if (!fs.existsSync(p)) fail(`Missing ${p}. Copy the redesign files into the project first.`); };

['js/main.js', 'index.html', 'css/arcadia-clean.css', 'css/messaging.css', 'js/messaging.js',
  'redesign/main-about.part', 'redesign/main-games.part'].forEach(need);

const readParts = (file) => {
  const raw = fs.readFileSync(file, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  return { text: raw.replace(/\r\n/g, '\n'), eol };
};

// ---------- js/main.js ----------
const main = readParts('js/main.js');
let js = main.text;
if (js.includes('function arcDetailPage(')) fail('Already applied (main.js has arcDetailPage).');

const aboutPart = fs.readFileSync('redesign/main-about.part', 'utf8').replace(/\r\n/g, '\n');
const gamesPart = fs.readFileSync('redesign/main-games.part', 'utf8').replace(/\r\n/g, '\n');

function swap(source, startMarker, endMarker, replacement, label) {
  if (source.split(startMarker).length !== 2) fail(`Could not find exactly one "${label}" start in js/main.js.`);
  if (source.split(endMarker).length !== 2) fail(`Could not find exactly one "${label}" end in js/main.js.`);
  const startAt = source.indexOf(startMarker);
  const endAt = source.indexOf(endMarker);
  if (endAt < startAt) fail(`"${label}" markers are in an unexpected order.`);
  const startLine = source.lastIndexOf('\n', startAt) + 1;
  const endLine = source.lastIndexOf('\n', endAt) + 1;
  return source.slice(0, startLine) + replacement + source.slice(endLine);
}

js = swap(js, "const about = uiEl('div', 'pf-about');", 'card.append(cover, head, bio, chips, tabs, panels);', aboutPart, 'About tab');
js = swap(js, 'async function openGameLibrary(', 'async function loadProfilePosts(', gamesPart, 'Game collection');

// ---------- index.html ----------
const html = readParts('index.html');
let page = html.text;
const linkOld = '<link rel="stylesheet" href="/css/avatar.css" />';
const inboxOld = '<div id="inbox-app" class="inbox-app glass-panel"></div>';
if (page.includes('/css/arcadia-clean.css')) fail('Already applied (index.html links arcadia-clean.css).');
if (page.split(linkOld).length !== 2) fail('Could not find the avatar.css link in index.html.');
if (page.split(inboxOld).length !== 2) fail('Could not find the #inbox-app element in index.html.');
page = page.replace(linkOld, linkOld + '\n    <link rel="stylesheet" href="/css/arcadia-clean.css" />');
page = page.replace(inboxOld, '<div id="inbox-app" class="inbox-app"></div>');

// ---------- write ----------
fs.mkdirSync('.redesign-backup', { recursive: true });
fs.copyFileSync('js/main.js', path.join('.redesign-backup', 'main.js'));
fs.copyFileSync('index.html', path.join('.redesign-backup', 'index.html'));
fs.writeFileSync('js/main.js', js.replace(/\n/g, main.eol));
fs.writeFileSync('index.html', page.replace(/\n/g, html.eol));

console.log('Done.');
console.log(' - js/main.js: new About tab, Game Collection and game page');
console.log(' - index.html: arcadia-clean.css linked, Chat page no longer uses glass-panel');
console.log('Backups: .redesign-backup/main.js, .redesign-backup/index.html');
