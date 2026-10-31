// Run once from the project root:  node apply-social-update.mjs
// Adds: friends feed + seen-post tracking, notifications, profile banner uploads,
// and the photo/banner step in onboarding. All edits are checked first; if any
// piece does not match, NOTHING is changed.
// Undo: git restore .   (then delete the new files listed in the instructions)
import fs from 'node:fs';

const fail = (m) => { console.error('STOPPED: ' + m + '\nNothing was changed.'); process.exit(1); };
const NEW_FILES = [
  'src/models/SeenPost.js', 'src/models/Notification.js', 'src/services/notifications.js', 'src/services/friends.js',
  'src/services/media.js', 'src/routes/notificationRoutes.js', 'js/notifications.js', 'js/seen.js', 'js/avatar.js',
  'js/onboarding.js', 'css/notifications.css', 'css/avatar.css', 'css/onboarding.css',
];
for (const f of NEW_FILES) if (!fs.existsSync(f)) fail(`${f} is missing. Copy all the downloaded files into their folders first.`);

const FILES = ['src/models/User.js', 'src/middleware/auth.js', 'src/services/socialContracts.js', 'src/app.js',
  'src/routes/authRoutes.js', 'src/routes/postRoutes.js', 'src/routes/friendRequestRoutes.js', 'js/main.js', 'index.html'];
const text = {};
for (const f of FILES) { if (!fs.existsSync(f)) fail(`${f} not found. Run from the project root.`); text[f] = fs.readFileSync(f, 'utf8'); }
if (text['src/app.js'].includes('notificationRoutes')) fail('Already applied.');
if (!text['js/main.js'].includes("from './avatar.js'")) fail('Apply the profile photo update (apply-avatars.mjs) first.');

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const eolOf = (t) => (t.includes('\r\n') ? '\r\n' : '\n');
function edit(file, oldStr, newStr, label, expected = 1) {
  const t = text[file];
  const rx = new RegExp(esc(oldStr).replace(/\n/g, '\\r?\\n'), 'g');
  const n = (t.match(rx) || []).length;
  if (n !== expected) fail(`${file} (${label}): expected ${expected} match, found ${n}.`);
  text[file] = t.replace(rx, () => newStr.replace(/\n/g, eolOf(t)));
}
function editRegex(file, rx, newStr, label, required = true) {
  const t = text[file];
  const n = (t.match(rx) || []).length;
  if (required && n !== 1) fail(`${file} (${label}): expected 1 match, found ${n}.`);
  if (n) text[file] = t.replace(rx, () => newStr.replace(/\n/g, eolOf(t)));
}

// ---------------- backend ----------------
edit('src/models/User.js', "avatar: { type: String, default: null },", "avatar: { type: String, default: null },\n  banner: { type: String, default: null },", 'user banner field');
edit('src/middleware/auth.js', ".select('username displayName bio avatar genres favoriteGames createdAt onboardingComplete')", ".select('username displayName bio avatar banner genres favoriteGames createdAt onboardingComplete')", 'auth select', 2);
edit('src/services/socialContracts.js', "avatar: user.avatar || null,\n    genres:", "avatar: user.avatar || null,\n    banner: user.banner || null,\n    genres:", 'serializer banner');
edit('src/app.js', "app.use('/api/messages', require('./routes/messageRoutes'));", "app.use('/api/messages', require('./routes/messageRoutes'));\napp.use('/api/notifications', require('./routes/notificationRoutes'));", 'mount notifications');

// auth routes: banner removal, old-image cleanup, banner upload
const A = 'src/routes/authRoutes.js';
edit(A, "const cloudinary = require('../config/cloudinary');", "const cloudinary = require('../config/cloudinary');\nconst { hasImageSignature, removeOwnedImage } = require('../services/media');", 'auth imports');
edit(A, "    if (Object.hasOwn(body, 'genres')) {", `    if (Object.hasOwn(body, 'banner')) {
      if (body.banner !== null) return res.status(400).json({ success: false, error: 'Upload a new banner or remove the current one.' });
      update.banner = null;
    }
    if (Object.hasOwn(body, 'genres')) {`, 'banner removal');
edit(A, "const user = await User.findByIdAndUpdate(req.user._id, { $set: update }, { new: true, runValidators: true }).lean();",
`const user = await User.findByIdAndUpdate(req.user._id, { $set: update }, { new: true, runValidators: true }).lean();
    if (Object.hasOwn(update, 'avatar') && req.user.avatar !== user.avatar) void removeOwnedImage(req.user.avatar, 'arcadia/avatars', req.user._id);
    if (update.banner === null && req.user.banner) void removeOwnedImage(req.user.banner, 'arcadia/banners', req.user._id);`, 'profile cleanup');
edit(A, "      return res.json({\n        success: true,\n        data: {\n          user: {\n            id: String(user._id),",
`      // The new photo is saved: remove the user's previous uploaded photo.
      if (req.user.avatar && req.user.avatar !== user.avatar) void removeOwnedImage(req.user.avatar, 'arcadia/avatars', req.user._id);

      return res.json({
        success: true,
        data: {
          user: {
            id: String(user._id),`, 'avatar cleanup');
edit(A, "            avatar: user.avatar || null,\n            genres: user.genres || [],", "            avatar: user.avatar || null,\n            banner: user.banner || null,\n            genres: user.genres || [],", 'avatar response banner');
text[A] += `
// POST /api/auth/banner
router.post(
  '/banner',
  requireAuth,
  uploadImage.single('photo'),
  async (req, res, next) => {
    let uploadedImage = null;

    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'Choose a banner image to upload.' });
      }

      if (!hasImageSignature(req.file.buffer)) {
        return res.status(400).json({ success: false, error: 'The uploaded file is not a supported image.' });
      }

      cloudinary.ensureCloudinaryConfigured();

      uploadedImage = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'arcadia/banners',
            public_id: \`user_\${req.user._id}_\${Date.now()}\`,
            resource_type: 'image',
            allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
            transformation: [{ width: 1600, height: 600, crop: 'fill', gravity: 'auto' }],
          },
          (error, result) => (error ? reject(error) : resolve(result))
        );
        stream.end(req.file.buffer);
      });

      const user = await User.findByIdAndUpdate(
        req.user._id,
        { $set: { banner: uploadedImage.secure_url } },
        { new: true, runValidators: true }
      ).lean();

      if (!user) {
        await cloudinary.uploader.destroy(uploadedImage.public_id);
        uploadedImage = null;
        return res.status(404).json({ success: false, error: 'Your account could not be found.' });
      }

      if (req.user.banner && req.user.banner !== user.banner) {
        void removeOwnedImage(req.user.banner, 'arcadia/banners', req.user._id);
      }

      return res.json({ success: true, data: { user: serializePublicUser(user) } });
    } catch (error) {
      if (uploadedImage?.public_id) {
        try { await cloudinary.uploader.destroy(uploadedImage.public_id); }
        catch (cleanupError) { console.error('Could not clean up an unsuccessful banner upload.', cleanupError.message); }
      }
      return next(error);
    }
  }
);
`;

// post routes: friends feed, ranking, seen tracking, notifications
const P = 'src/routes/postRoutes.js';
edit(P, "const User = require('../models/User');", "const User = require('../models/User');\nconst SeenPost = require('../models/SeenPost');\nconst { getFriendIds } = require('../services/friends');\nconst { notify } = require('../services/notifications');", 'post imports');
edit(P, `    if (feed === 'friends') {
      return res.json({
        success: true,
        data: {
          items: [],
          nextCursor: null,
          unavailable: 'Friends feed will be available with friends.',
        },
      });
    }`, `    // People the viewer is friends with: used by the Friends feed and as a ranking boost.
    const friendIds = req.user ? await getFriendIds(req.user._id) : [];

    if (feed === 'friends') {
      if (!req.user) {
        return res.json({ success: true, data: { items: [], nextCursor: null, unavailable: 'signin' } });
      }

      if (!friendIds.length) {
        return res.json({ success: true, data: { items: [], nextCursor: null, unavailable: 'no-friends' } });
      }

      query.author = { $in: friendIds };

      if (!req.query.game) {
        query.destinations = { $elemMatch: { type: { $in: ['general', 'game'] } } };
      }
    }`, 'friends feed');
edit(P, "    const candidates = await Post.find(query)", `    // Posts seen before this moment are ranked lower. The time travels in the
    // pagination cursor so a page you just viewed cannot reappear on the next page.
    const seenBefore = new Date(
      typeof paginationCursor?.t === 'number' ? paginationCursor.t : Date.now()
    );

    const candidates = await Post.find(query)`, 'seen cutoff');
edit(P, "    const now = Date.now();\n\n    const ranked = candidates", `    const friendSet = new Set(friendIds.map(String));
    let seenSet = new Set();

    if (req.user && candidates.length) {
      const seenRows = await SeenPost.find({
        user: req.user._id,
        post: { $in: candidates.map((post) => post._id) },
        seenAt: { $lt: seenBefore },
      })
        .select('post')
        .lean();

      seenSet = new Set(seenRows.map((row) => String(row.post)));
    }

    // Use the first request's time for every page, so ranks cannot drift between pages.
    const now = seenBefore.getTime();

    const ranked = candidates`, 'seen set');
edit(P, "        const recency = 4 * Math.exp(-hours / 72);", `        const recency = 4 * Math.exp(-hours / 72);

        // Friends' posts get a boost; posts already seen sink (but stay available).
        const friendBoost = friendSet.has(String(post.author?._id)) ? 1.5 : 0;
        const seenPenalty = seenSet.has(String(post._id)) ? 6 : 0;`, 'rank terms');
edit(P, "_rank: recency + interests + engagement,", "_rank: recency + interests + engagement + friendBoost - seenPenalty,", 'rank sum');
edit(P, "              score: last._rank,\n              id: String(last._id),", "              score: last._rank,\n              id: String(last._id),\n              t: seenBefore.getTime(),", 'cursor time');
edit(P, "// GET /api/posts\nrouter.get('/', optionalAuth, async (req, res, next) => {", `// POST /api/posts/seen  { ids: [postId, ...] }
const limitSeen = rateLimit({ name: 'post-seen', max: 60, windowMs: 15 * 60 * 1000 });

router.post('/seen', requireAuth, limitSeen, async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const clean = [...new Set(ids.filter((id) => typeof id === 'string' && validId(id)))].slice(0, 50);

    if (!clean.length) {
      return res.json({ success: true, data: { recorded: 0 } });
    }

    // Only record posts that really exist.
    const existing = await Post.find({ _id: { $in: clean }, removedAt: null }).distinct('_id');
    const now = new Date();

    if (existing.length) {
      await SeenPost.bulkWrite(
        existing.map((id) => ({
          updateOne: {
            filter: { user: req.user._id, post: id },
            update: { $set: { seenAt: now }, $setOnInsert: { user: req.user._id, post: id } },
            upsert: true,
          },
        })),
        { ordered: false }
      );
    }

    return res.json({ success: true, data: { recorded: existing.length } });
  } catch (error) {
    return next(error);
  }
});

// GET /api/posts
router.get('/', optionalAuth, async (req, res, next) => {`, 'seen route');
edit(P, "        { $inc: { likeCount: 1 } }\n      );\n    }", `        { $inc: { likeCount: 1 } }
      );

      await notify({
        recipient: post.author,
        actor: req.user._id,
        type: 'like',
        post: post._id,
        key: \`like:\${post._id}:\${req.user._id}\`,
      });
    }`, 'like notification');
edit(P, "        { $inc: { repostCount: 1 } }\n      );\n    }", `        { $inc: { repostCount: 1 } }
      );

      await notify({
        recipient: post.author,
        actor: req.user._id,
        type: 'repost',
        post: post._id,
        key: \`repost:\${post._id}:\${req.user._id}\`,
      });
    }`, 'repost notification');
edit(P, "      let parent = null;\n\n      if (req.body.parent != null) {", "      let parent = null;\n      let parentAuthor = null;\n\n      if (req.body.parent != null) {", 'comment parent author var');
edit(P, "          .select('_id')\n          .lean();\n\n        if (!parentComment) {", "          .select('_id author')\n          .lean();\n\n        if (!parentComment) {", 'comment parent select');
edit(P, "        parent = parentComment._id;", "        parent = parentComment._id;\n        parentAuthor = parentComment.author;", 'comment parent author');
edit(P, "        { $inc: { commentCount: 1 } }\n      );", `        { $inc: { commentCount: 1 } }
      );

      if (parentAuthor) {
        await notify({
          recipient: parentAuthor,
          actor: req.user._id,
          type: 'reply',
          post: post._id,
          comment: comment._id,
          key: \`reply:\${comment._id}\`,
        });
      }

      if (!parentAuthor || String(parentAuthor) !== String(post.author)) {
        await notify({
          recipient: post.author,
          actor: req.user._id,
          type: 'comment',
          post: post._id,
          comment: comment._id,
          key: \`comment:\${comment._id}\`,
        });
      }`, 'comment notification');

// friend requests
const F = 'src/routes/friendRequestRoutes.js';
edit(F, "const rateLimit = require('../middleware/rateLimit');", "const rateLimit = require('../middleware/rateLimit');\nconst { notify } = require('../services/notifications');", 'friend imports');
edit(F, "    res.status(201).json({\n      success: true,\n      data: {\n        sent: true,", `    await notify({
      recipient: recipient._id,
      actor: req.user._id,
      type: 'friend_request',
      key: \`friend_request:\${request._id}:\${Date.now()}\`
    });

    res.status(201).json({
      success: true,
      data: {
        sent: true,`, 'friend request notification');
edit(F, "    return res.json({\n      success: true,\n      data: { updated: true, status: 'accepted' }\n    });", `    await notify({
      recipient: request.sender,
      actor: req.user._id,
      type: 'friend_accept',
      key: \`friend_accept:\${request._id}\`
    });

    return res.json({
      success: true,
      data: { updated: true, status: 'accepted' }
    });`, 'friend accept notification');

// ---------------- frontend ----------------
const M = 'js/main.js';
edit(M, "import { setAvatar, isPhotoAvatar, prepareAvatarFile } from './avatar.js';",
`import { setAvatar, isPhotoAvatar, prepareAvatarFile, prepareBannerFile, applyBanner } from './avatar.js';
import { createNotifications } from './notifications.js';
import { createSeenTracker } from './seen.js';

const seenTracker = createSeenTracker({ api: (path, options) => api(path, options), isSignedIn: () => Boolean(currentUser) });`, 'main imports');
edit(M, "let currentUser = null;", "let currentUser = null;\nlet notifications = null;", 'notifications var');
edit(M, "    if (tab.dataset.filter === 'friends') { toast('Friends feed will unlock with friend connections.'); return; }\n", '', 'friends tab stub');
edit(M, "list.append(...items.map(renderPost));", "list.append(...items.map((item) => { const node = renderPost(item); seenTracker.observe(node); return node; }));", 'observe posts');
editRegex(M, /    if \(!items\.length && !cursor && result\.unavailable\) \{\n\s*state\.innerHTML = '(?:[^'\\\n]|\\.)*';\n\s*return;\n\s*\}/,
`    if (!items.length && !cursor && (result.unavailable || filter === 'friends')) {
      const signedOut = result.unavailable === 'signin';
      state.innerHTML = '<img class="feed-empty-art" src="/assets/arcadia/empty-states/empty-posts.svg" alt=""/>';
      const heading = document.createElement('h2');
      const note = document.createElement('p');
      heading.textContent = signedOut ? 'Sign in to see your friends' : result.unavailable ? 'Your friends feed is waiting' : 'Your friends haven’t posted yet';
      note.textContent = signedOut ? 'Posts from the people you add will show up here.' : result.unavailable ? 'Add friends and their posts will show up here.' : 'When they post, you’ll see it here first.';
      state.append(heading, note);
      if (signedOut || result.unavailable) {
        const action = document.createElement('button');
        action.className = 'button button--primary';
        action.type = 'button';
        action.textContent = signedOut ? 'Sign in' : 'Find friends';
        action.addEventListener('click', () => (signedOut ? openAuth() : selectView('friends')));
        state.append(action);
      }
      return;
    }`, 'friends empty state');
edit(M, "setAvatar($('.avatar--composer'), currentUser?.avatar, currentUser?.username?.[0]?.toUpperCase() || '?');",
"setAvatar($('.avatar--composer'), currentUser?.avatar, currentUser?.username?.[0]?.toUpperCase() || '?');\n  if (currentUser) notifications?.refresh(); else notifications?.reset();", 'notification refresh');
edit(M, "function startOnboarding() {\n  onboarding.start();\n}", `function startOnboarding() {
  onboarding.start();
}

notifications = createNotifications({
  api,
  getUser: () => currentUser,
  button: $('#notifications-button'),
  onNeedSignIn: () => openAuth(),
  onOpenPost: async (postId) => {
    try { const detail = await api(\`/posts/\${postId}\`); openComments(detail.post, null); }
    catch { toast('That post is no longer available.'); }
  },
  onOpenProfile: (username) => { if (!username) return; selectView('profile'); void renderProfile(username); },
  onOpenFriends: () => selectView('friends'),
});
if (currentUser) notifications.refresh();`, 'notifications init');
edit(M, "const cover = uiEl('div', 'pf-cover'); cover.style.backgroundImage = `url(${pfCover(user.username)})`; cover.setAttribute('aria-hidden', 'true');",
"const cover = uiEl('div', 'pf-cover'); applyBanner(cover, user, pfCover(user.username)); cover.setAttribute('aria-hidden', 'true');", 'profile banner');
editRegex(M, /\n    const bannerGame = \(user\.favoriteGames \|\| \[\]\)\[0\];[\s\S]*?probe\.src = `\/assets\/arcadia\/games\/\$\{bannerGame\}-banner\.jpg`;\n    \}/, '', 'old banner probe', false);
edit(M, "  body.append(photoField, nameField, bioField, gamesRow);", `
  // Profile banner: upload, replace or remove. Saved straight away.
  const bannerField = uiEl('div', 'field banner-edit');
  let bannerValue = user.banner || null;
  const bannerPreview = uiEl('div', 'banner-edit__preview'); bannerPreview.setAttribute('aria-hidden', 'true');
  const paintBanner = () => applyBanner(bannerPreview, { ...user, banner: bannerValue }, pfCover(user.username));
  paintBanner();
  const bannerRow = uiEl('div', 'banner-edit__row');
  const bannerFile = document.createElement('input'); bannerFile.type = 'file'; bannerFile.accept = 'image/jpeg,image/png,image/webp,image/gif'; bannerFile.hidden = true;
  const chooseBanner = uiEl('button', 'button', isPhotoAvatar(bannerValue) ? 'Change banner' : 'Add banner'); chooseBanner.type = 'button';
  const removeBanner = uiEl('button', 'button', 'Remove banner'); removeBanner.type = 'button'; removeBanner.hidden = !isPhotoAvatar(bannerValue);
  const bannerStatus = uiEl('p', 'avatar-edit__status', 'Wide pictures work best. We crop to 1600 × 600. Without one, your first game’s banner is used.'); bannerStatus.setAttribute('role', 'status');
  bannerRow.append(chooseBanner, removeBanner);
  bannerField.append(uiEl('label', 'st-label', 'Profile banner'), bannerPreview, bannerRow, bannerStatus, bannerFile);
  const bannerMessage = (text, isError = false) => { bannerStatus.textContent = text; bannerStatus.classList.toggle('is-error', isError); };
  const setBannerState = (value) => {
    bannerValue = value || null;
    currentUser = { ...currentUser, banner: bannerValue };
    paintBanner();
    chooseBanner.textContent = isPhotoAvatar(bannerValue) ? 'Change banner' : 'Add banner';
    removeBanner.hidden = !isPhotoAvatar(bannerValue);
    photoChanged = true;
  };
  chooseBanner.addEventListener('click', () => bannerFile.click());
  bannerFile.addEventListener('change', async () => {
    const file = bannerFile.files?.[0];
    bannerFile.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) { bannerMessage('Choose a JPEG, PNG, WebP or GIF image.', true); return; }
    chooseBanner.disabled = removeBanner.disabled = true;
    bannerMessage('Uploading…');
    try {
      const prepared = await prepareBannerFile(file);
      const formData = new FormData(); formData.append('photo', prepared);
      const result = await api('/auth/banner', { method: 'POST', body: formData });
      setBannerState(result.user.banner);
      bannerMessage('Banner updated.');
    } catch (e) { bannerMessage(e.message || 'Could not upload that banner.', true); }
    finally { chooseBanner.disabled = removeBanner.disabled = false; }
  });
  removeBanner.addEventListener('click', async () => {
    chooseBanner.disabled = removeBanner.disabled = true;
    bannerMessage('Removing…');
    try {
      await api('/auth/profile', { method: 'PATCH', body: JSON.stringify({ banner: null }) });
      setBannerState(null);
      bannerMessage('Banner removed.');
    } catch (e) { bannerMessage(e.message || 'Could not remove the banner.', true); }
    finally { chooseBanner.disabled = removeBanner.disabled = false; }
  });
  body.append(photoField, bannerField, nameField, bioField, gamesRow);`, 'edit profile banner');

// index.html
const H = 'index.html';
edit(H, 'data-view-link="updates" aria-label="Notifications" title="Notifications"', 'id="notifications-button" aria-label="Notifications" title="Notifications"', 'bell button');
edit(H, '<link rel="stylesheet" href="/css/avatar.css" />', '<link rel="stylesheet" href="/css/avatar.css" />\n    <link rel="stylesheet" href="/css/notifications.css" />', 'notifications css');

for (const f of FILES) fs.writeFileSync(f, text[f]);
console.log('Done. Friends feed, seen-post tracking, notifications and banner uploads are in. Restart the dev server (Ctrl+C, then npm.cmd run dev:all).');
