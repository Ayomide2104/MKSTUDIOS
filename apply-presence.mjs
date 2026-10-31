// Run once from the project root:  node apply-presence.mjs
// Adds online presence: green dots, "Active now / Active 5m ago", the "Online now"
// panel on the feed, and a privacy switch. All edits are checked first; if any
// piece does not match, NOTHING is changed.  Undo: git restore .  (then delete the new files)
import fs from 'node:fs';

const fail = (m) => { console.error('STOPPED: ' + m + '\nNothing was changed.'); process.exit(1); };
for (const f of ['src/services/presence.js', 'src/routes/presenceRoutes.js', 'js/presence.js', 'css/presence.css', 'css/avatar.css']) {
  if (!fs.existsSync(f)) fail(`${f} is missing. Unzip the download into the project root first.`);
}
const FILES = ['src/models/User.js', 'src/socket.js', 'src/app.js', 'src/routes/authRoutes.js', 'js/messaging.js', 'js/main.js', 'index.html'];
const text = {};
for (const f of FILES) { if (!fs.existsSync(f)) fail(`${f} not found. Run from the project root.`); text[f] = fs.readFileSync(f, 'utf8'); }
if (text['src/app.js'].includes('presenceRoutes')) fail('Already applied.');
if (!text['src/app.js'].includes('notificationRoutes') || !text['js/messaging.js'].includes("from './avatar.js'")) fail('Apply the earlier updates first (avatars, then the social update).');

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const eolOf = (t) => (t.includes('\r\n') ? '\r\n' : '\n');
function edit(file, oldStr, newStr, label, expected = 1) {
  const t = text[file];
  const rx = new RegExp(esc(oldStr).replace(/\n/g, '\\r?\\n'), 'g');
  const n = (t.match(rx) || []).length;
  if (n !== expected) fail(`${file} (${label}): expected ${expected} match, found ${n}.`);
  text[file] = t.replace(rx, () => newStr.replace(/\n/g, eolOf(t)));
}
function editRegex(file, rx, newStr, label) {
  const t = text[file];
  const n = (t.match(rx) || []).length;
  if (n !== 1) fail(`${file} (${label}): expected 1 match, found ${n}.`);
  text[file] = t.replace(rx, () => newStr.replace(/\n/g, eolOf(t)));
}

// ---- backend ----
edit('src/models/User.js', "banner: { type: String, default: null },", "banner: { type: String, default: null },\n  lastActiveAt: { type: Date, default: null },", 'lastActiveAt');
edit('src/socket.js', "    socket.on('disconnect', () => {\n      // Socket.IO automatically removes the socket from its rooms.\n    });",
`    void presence.connected(io, socket);

    socket.on('disconnect', () => {
      // Socket.IO removes the socket from its rooms; presence tracks the rest.
      presence.disconnected(io, socket);
    });`, 'socket presence');
edit('src/socket.js', "const User = require('./models/User');", "const User = require('./models/User');\nconst presence = require('./services/presence');", 'socket import');
edit('src/app.js', "app.use('/api/notifications', require('./routes/notificationRoutes'));", "app.use('/api/notifications', require('./routes/notificationRoutes'));\napp.use('/api/presence', require('./routes/presenceRoutes'));", 'mount presence');
const A = 'src/routes/authRoutes.js';
edit(A, "const { hasImageSignature, removeOwnedImage } = require('../services/media');", "const { hasImageSignature, removeOwnedImage } = require('../services/media');\nconst presence = require('../services/presence');", 'auth import');
edit(A, "!['profileVisibility', 'friendRequests'].includes(key)", "!['profileVisibility', 'friendRequests', 'showOnlineStatus'].includes(key)", 'allow showOnlineStatus');
edit(A, "      update.privacy = value;", "      if (Object.hasOwn(value, 'showOnlineStatus') && typeof value.showOnlineStatus !== 'boolean') return res.status(400).json({ success: false, error: 'Invalid privacy settings.' });\n      update.privacy = value;", 'validate showOnlineStatus');
edit(A, "    await User.updateOne({ _id: req.user._id }, { $set: update });\n    res.json({ success: true, data: { saved: true } });", "    await User.updateOne({ _id: req.user._id }, { $set: update });\n    if (update.privacy) void presence.refreshVisibility(req.app.get('io'), req.user._id);\n    res.json({ success: true, data: { saved: true } });", 'refresh visibility');

// ---- messaging.js ----
const MS = 'js/messaging.js';
edit(MS, "import { setAvatar } from './avatar.js';", "import { setAvatar } from './avatar.js';\nimport { presence } from './presence.js';", 'msg import');
edit(MS, "setAvatar(avatar, person.avatar, avatar.textContent);", "setAvatar(avatar, person.avatar, avatar.textContent);\n      presence.mark(avatar, person.username);", 'list dot');
edit(MS, "  setAvatar(chatAvatar, friend.avatar, chatAvatar.textContent);", "  setAvatar(chatAvatar, friend.avatar, chatAvatar.textContent);\n  presence.mark(chatAvatar, friend.username);", 'header dot');
edit(MS, "      setAvatar(chatAvatar, activeFriend.avatar, chatAvatar.textContent);", "      setAvatar(chatAvatar, activeFriend.avatar, chatAvatar.textContent);\n      presence.mark(chatAvatar, activeFriend.username);", 'header dot 2');
edit(MS, "  chatStatus.textContent = `@${friend.username}`;", "  presence.bindLabel(chatStatus, friend.username, `@${friend.username}`);", 'header status');
edit(MS, "      socket.on('connect', () => {\n        void refreshConversations();\n      });", "      socket.on('connect', () => {\n        void refreshConversations();\n        presence.handle({ reconnect: true });\n      });\n\n      socket.on('presence:update', (payload) => presence.handle(payload));", 'socket events');
edit(MS, "    activeUsername = null;\n    activeFriend = null;\n    conversations = [];\n    closeChat();", "    presence.reset();\n    activeUsername = null;\n    activeFriend = null;\n    conversations = [];\n    closeChat();", 'reset on disconnect');

// ---- main.js ----
const M = 'js/main.js';
edit(M, "import { createSeenTracker } from './seen.js';", "import { createSeenTracker } from './seen.js';\nimport { presence } from './presence.js';", 'main import');
edit(M, "const node = uiEl('span', 'fd-avatar', name[0].toUpperCase()); setAvatar(node, person.avatar, name[0].toUpperCase());", "const node = uiEl('span', 'fd-avatar', name[0].toUpperCase()); setAvatar(node, person.avatar, name[0].toUpperCase()); presence.mark(node, person.username);", 'friend dot');
edit(M, "uiEl('span', 'fd-handle', `@${person.username}`));", "presence.bindLabel(uiEl('span', 'fd-handle', `@${person.username}`), person.username, `@${person.username}`, `@${person.username} · `));", 'friend label');
edit(M, "setAvatar(avatar, user.avatar || 'gradient-violet', display[0].toUpperCase()); avatar.setAttribute('aria-hidden', 'true');", "setAvatar(avatar, user.avatar || 'gradient-violet', display[0].toUpperCase()); presence.mark(avatar, user.username); avatar.setAttribute('aria-hidden', 'true');", 'profile dot');
edit(M, "if (currentUser) notifications?.refresh(); else notifications?.reset();", "if (currentUser) notifications?.refresh(); else notifications?.reset();\n  presence.sync();", 'sync on sign-in');
edit(M, "if (currentUser) notifications.refresh();", `if (currentUser) notifications.refresh();

presence.configure({
  api,
  getUser: () => currentUser,
  onOpenFriends: () => selectView('friends'),
  onNeedSignIn: () => openAuth(),
  setAvatar,
});
presence.mountPanel($('#online-panel'));
presence.sync();`, 'presence init');
edit(M, "stSelect('friendRequests', [['everyone', 'Everyone'], ['nobody', 'Nobody']], privacy.friendRequests || 'everyone', 'Friend requests'))\n  );",
"stSelect('friendRequests', [['everyone', 'Everyone'], ['nobody', 'Nobody']], privacy.friendRequests || 'everyone', 'Friend requests')),\n    stRow('Show when you’re active', 'Friends see a green dot and “Active now” when you’re online. Turn this off and you appear offline.', stSwitch('showOnlineStatus', privacy.showOnlineStatus !== false, 'Show when you’re active'))\n  );", 'settings row');
edit(M, "friendRequests: values.get('friendRequests') }", "friendRequests: values.get('friendRequests'), showOnlineStatus: values.has('showOnlineStatus') }", 'settings save');

// ---- index.html ----
editRegex('index.html', /<section class="mini-panel glass-panel"><div class="mini-panel__head"><h2>Playing now<\/h2><\/div>[\s\S]*?<\/section>/, '<section class="mini-panel glass-panel" id="online-panel"></section>', 'online panel');
edit('index.html', '<link rel="stylesheet" href="/css/notifications.css" />', '<link rel="stylesheet" href="/css/notifications.css" />\n    <link rel="stylesheet" href="/css/presence.css" />', 'presence css');

for (const f of FILES) fs.writeFileSync(f, text[f]);
console.log('Done. Online presence is in. Restart the dev server (Ctrl+C, then npm.cmd run dev:all).');
