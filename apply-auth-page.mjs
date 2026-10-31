// Run once from the project root:  node apply-auth-page.mjs
// Makes 4 edits for the full-page sign-in. Undo anytime with:  git restore css/arcadia.css index.html js/main.js
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const fail = (m) => { console.error('STOPPED: ' + m + '\nNothing was changed after this point.'); process.exit(1); };

for (const f of ['css/arcadia.css', 'index.html', 'js/main.js', 'css/auth-page.css']) {
  if (!fs.existsSync(f)) fail(`${f} not found. Run this from C:\\Users\\hp\\Desktop\\Project and put auth-page.css in the css folder first.`);
}

let css = read('css/arcadia.css');
let html = read('index.html');
let js = read('js/main.js');

if (html.includes('class="auth-page"')) fail('index.html already has the new sign-in page. Already applied?');
if (!js.includes('function setAuthMode')) fail('js/main.js has no setAuthMode. Add the earlier Create Account fix first.');

// 1) Remove the old neon auth-dialog block from arcadia.css
const startMarker = 'ARCADIA AUTHENTICATION DIALOG FIX';
const endMarker = 'ARCADIA · CINEMATIC POST PHOTO GALLERIES';
const s = css.indexOf(startMarker), e = css.indexOf(endMarker);
if (s < 0 || e < 0 || e < s) fail('Could not find the old auth block in css/arcadia.css.');
const blockStart = css.lastIndexOf('/* =', s);
const blockEnd = css.lastIndexOf('/* =', e);
const removed = css.slice(blockStart, blockEnd);
if (!/#auth-dialog/.test(removed) || /\.post-media|\.composer-card|\.feed-tabs/.test(removed)) fail('The block to remove contains unexpected rules. Not touching it.');
css = css.slice(0, blockStart) + css.slice(blockEnd);

// 2) Replace the auth dialog markup in index.html
const dStart = html.indexOf('<dialog class="auth-dialog glass-panel" id="auth-dialog"');
if (dStart < 0) fail('Could not find the auth dialog in index.html.');
const dEnd = html.indexOf('</dialog>', dStart) + '</dialog>'.length;
const newDialog = `<dialog class="auth-page" id="auth-dialog" aria-labelledby="auth-title">
      <div class="ap-shell">
        <aside class="ap-showcase" aria-hidden="true">
          <a class="ap-brand" href="/" tabindex="-1"><img src="/assets/arcadia/brand/logo-mark.svg" alt="" />Arcadia</a>
          <div class="ap-showcase__copy">
            <h2>Play together.</h2>
            <p>Your friends, your games and your communities in one place.</p>
          </div>
          <div class="ap-covers">
            <div class="ap-cover" style="background-image:url('/assets/arcadia/games/fc-mobile.jpg')"></div>
            <div class="ap-cover" style="background-image:url('/assets/arcadia/games/pubg-mobile.jpg')"></div>
            <div class="ap-cover" style="background-image:url('/assets/arcadia/games/genshin-impact.jpg')"></div>
          </div>
          <ul class="ap-points"><li>See what friends play</li><li>Join game communities</li><li>Chat privately</li></ul>
        </aside>
        <main class="ap-main">
          <div class="ap-card">
            <h2 id="auth-title">Get in the game.</h2>
            <p class="ap-sub">Sign in or create your gaming profile.</p>
            <div class="ap-tabs" role="tablist" aria-label="Account action">
              <button type="button" class="ap-tab is-current" data-auth-mode="login" role="tab" aria-selected="true">Sign in</button>
              <button type="button" class="ap-tab" data-auth-mode="register" role="tab" aria-selected="false">Create account</button>
            </div>
            <form id="auth-form" class="ap-form">
              <label for="auth-username">Username</label>
              <input id="auth-username" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required minlength="3" maxlength="24" pattern="[A-Za-z0-9_]+" placeholder="your_gamertag" />
              <label for="auth-password">Password</label>
              <input id="auth-password" name="password" type="password" autocomplete="current-password" required minlength="10" placeholder="At least 10 characters" />
              <div class="ap-error" id="auth-error" role="status"></div>
              <button class="ap-submit" type="submit">Continue</button>
            </form>
          </div>
          <p class="ap-note">Private by design. No email required.</p>
          <div class="ap-topline"><button class="ap-close" id="auth-close" type="button">Keep browsing as a guest</button></div>
        </main>
      </div>
    </dialog>`;
html = html.slice(0, dStart) + newDialog + html.slice(dEnd);

// 3) Load the new stylesheet last
const link = '<link rel="stylesheet" href="/css/messaging.css">';
if (!html.includes(link)) fail('Could not find the messaging.css link in index.html.');
html = html.replace(link, link + '\n    <link rel="stylesheet" href="/css/auth-page.css" />');

// 4) Wire the close button
const anchor = "$('.dialog-close').addEventListener('click', () => dialog.close());";
if (js.split(anchor).length !== 2) fail('Could not find the dialog close line in js/main.js (expected exactly one).');
js = js.replace(anchor, anchor + "\n$('#auth-close')?.addEventListener('click', () => dialog.close());");

fs.writeFileSync('css/arcadia.css', css);
fs.writeFileSync('index.html', html);
fs.writeFileSync('js/main.js', js);
console.log('Done. Removed ' + removed.split('\n').length + ' lines of old auth CSS, replaced the dialog markup, linked auth-page.css, wired the close button.');
