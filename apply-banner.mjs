// Run once from the project root:  node apply-banner.mjs
// Makes the profile banner use the first game the user picked: /assets/arcadia/games/<slug>-banner.jpg
// If that file does not exist yet, the normal generated banner stays. Undo: git restore js/main.js
import fs from 'node:fs';
const fail = (m) => { console.error('STOPPED: ' + m + '\nNothing was changed.'); process.exit(1); };
let js = fs.readFileSync('js/main.js', 'utf8');
const old = "cover.style.backgroundImage = `url(${pfCover(user.username)})`; cover.setAttribute('aria-hidden', 'true');";
if (js.includes('-banner.jpg')) fail('Already applied.');
if (js.split(old).length !== 2) fail('Could not find the profile banner line in js/main.js (expected exactly one).');
const add = old + `
    const bannerGame = (user.favoriteGames || [])[0];
    if (typeof bannerGame === 'string' && /^[a-z0-9-]{2,60}$/.test(bannerGame)) {
      const probe = new Image();
      probe.onload = () => { cover.style.backgroundImage = \`url(\${probe.src})\`; };
      probe.src = \`/assets/arcadia/games/\${bannerGame}-banner.jpg\`;
    }`;
js = js.replace(old, add);
fs.writeFileSync('js/main.js', js);
console.log('Done. Profile banners now use the first picked game when its -banner.jpg exists.');
