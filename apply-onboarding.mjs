// Run once from the project root:  node apply-onboarding.mjs
// Undo anytime with:  git restore js/main.js index.html scripts/seedCatalog.js   (then delete js/onboarding.js and css/onboarding.css)
import fs from 'node:fs';

const fail = (m) => { console.error('STOPPED: ' + m + '\nNothing was changed.'); process.exit(1); };
for (const f of ['js/main.js', 'index.html', 'scripts/seedCatalog.js', 'js/onboarding.js', 'css/onboarding.css']) {
  if (!fs.existsSync(f)) fail(`${f} not found. Run from C:\\Users\\hp\\Desktop\\Project and copy onboarding.js into js\\ and onboarding.css into css\\ first.`);
}
let js = fs.readFileSync('js/main.js', 'utf8');
let html = fs.readFileSync('index.html', 'utf8');
let seed = fs.readFileSync('scripts/seedCatalog.js', 'utf8');
if (js.includes("from './onboarding.js'")) fail('Already applied.');

// 1) main.js: import + replace the old pop-up onboarding with the new full-page one
const importLine = "import { createMessaging } from './messaging.js';";
if (!js.includes(importLine)) fail('Could not find the messaging import at the top of js/main.js.');
const s = js.indexOf('function startOnboarding() {');
const e = js.indexOf('/* Arcadia profile, edit-profile sheet');
if (s < 0 || e < 0 || e < s) fail('Could not find the old startOnboarding function in js/main.js.');
const old = js.slice(s, e);
if (!old.includes('onboarding-dialog') || old.split('\n').length < 200) fail('The old onboarding block looks different than expected. Not touching it.');
const replacement = `const onboarding = createOnboarding({
  api,
  getUser: () => currentUser,
  setUser: (user) => { currentUser = user; },
  onFinish: () => { updateSignedInUI(); selectView('feed'); toast('You’re all set.'); },
});

function startOnboarding() {
  onboarding.start();
}

`;
js = js.replace(importLine, importLine + "\nimport { createOnboarding } from './onboarding.js';");
js = js.slice(0, js.indexOf('function startOnboarding() {')) + replacement + js.slice(js.indexOf('/* Arcadia profile, edit-profile sheet'));

// 2) index.html: load the stylesheet
const link = '<link rel="stylesheet" href="/css/auth-page.css" />';
if (!html.includes(link)) fail('Could not find the auth-page.css link in index.html. Apply the sign-in page first.');
html = html.replace(link, link + '\n    <link rel="stylesheet" href="/css/onboarding.css" />');

// 3) seed: add the popular games you asked for (safe upserts, nothing is deleted)
const anchor = "['dota-2','Dota 2',['strategy','rpg'],'#e37b73']";
if (!seed.includes(anchor)) fail('Could not find the end of the games list in scripts/seedCatalog.js.');
seed = seed.replace(anchor, anchor + ",\n  ['efootball','eFootball',['sports','football'],'#5fb4f0'],['free-fire','Free Fire',['battle-royale','shooter'],'#f2994a'],\n  ['call-of-duty-mobile','Call of Duty: Mobile',['fps','tactical-shooter'],'#d5a66b'],['asphalt-legends-unite','Asphalt Legends Unite',['racing','arcade'],'#ef6a6a']");

fs.writeFileSync('js/main.js', js);
fs.writeFileSync('index.html', html);
fs.writeFileSync('scripts/seedCatalog.js', seed);
console.log('Done. Replaced ' + old.split('\n').length + ' lines of old onboarding, linked onboarding.css, added 4 games to the seed list.');
