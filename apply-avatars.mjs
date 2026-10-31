// Run once from the project root:  node apply-avatars.mjs
// 1) Draws uploaded profile photos everywhere (header, posts, comments, friends, profile, chat)
// 2) Adds a photo section to Edit profile (upload, replace, remove)
// Undo: git restore js/main.js js/messaging.js index.html   (then delete js/avatar.js and css/avatar.css)
import fs from 'node:fs';

const fail = (m) => { console.error('STOPPED: ' + m + '\nNothing was changed.'); process.exit(1); };
for (const f of ['js/main.js', 'js/messaging.js', 'index.html', 'js/avatar.js', 'css/avatar.css']) {
  if (!fs.existsSync(f)) fail(`${f} not found. Copy avatar.js into js\\ and avatar.css into css\\ first, and run from the project root.`);
}
let main = fs.readFileSync('js/main.js', 'utf8');
let msg = fs.readFileSync('js/messaging.js', 'utf8');
let html = fs.readFileSync('index.html', 'utf8');
if (main.includes("from './avatar.js'")) fail('Already applied.');

const eolOf = (text) => (text.includes('\r\n') ? '\r\n' : '\n');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function once(text, oldStr, newStr, label) {
  const eol = eolOf(text);
  const rx = new RegExp(esc(oldStr).replace(/\n/g, '\\r?\\n'), 'g');
  const matches = text.match(rx) || [];
  if (matches.length !== 1) fail(`${label}: expected 1 match, found ${matches.length}.`);
  return text.replace(rx, () => newStr.replace(/\n/g, eol));
}

// ---- main.js ----
main = once(main, "import { createMessaging } from './messaging.js';", "import { createMessaging } from './messaging.js';\nimport { setAvatar, isPhotoAvatar, prepareAvatarFile } from './avatar.js';", 'main import');
main = once(main,
  "$('#auth-avatar').textContent = currentUser?.displayName?.[0]?.toUpperCase() || currentUser?.username?.[0]?.toUpperCase() || '?';",
  "setAvatar($('#auth-avatar'), currentUser?.avatar, currentUser?.displayName?.[0]?.toUpperCase() || currentUser?.username?.[0]?.toUpperCase() || '?');", 'header avatar');
main = once(main,
  "$('.avatar--composer').textContent = currentUser?.username?.[0]?.toUpperCase() || '?';",
  "setAvatar($('.avatar--composer'), currentUser?.avatar, currentUser?.username?.[0]?.toUpperCase() || '?');", 'composer avatar');
main = once(main,
  "  if (post.author?.avatar) {\n    avatar.classList.add(post.author.avatar);\n  }\n",
  "  setAvatar(avatar, post.author?.avatar, avatar.textContent);\n", 'post avatar');
main = once(main,
  "if (item.author?.avatar) avatar.classList.add(item.author.avatar);",
  "setAvatar(avatar, item.author?.avatar, avatar.textContent);", 'comment avatar');
main = once(main,
  "const node = uiEl('span', `fd-avatar ${person.avatar || ''}`.trim(), name[0].toUpperCase());",
  "const node = uiEl('span', 'fd-avatar', name[0].toUpperCase()); setAvatar(node, person.avatar, name[0].toUpperCase());", 'friend avatar');
main = once(main,
  "const avatar = uiEl('div', `pf-avatar ${user.avatar || 'gradient-violet'}`, display[0].toUpperCase()); avatar.setAttribute('aria-hidden', 'true');",
  "const avatar = uiEl('div', 'pf-avatar', display[0].toUpperCase()); setAvatar(avatar, user.avatar || 'gradient-violet', display[0].toUpperCase()); avatar.setAttribute('aria-hidden', 'true');", 'profile avatar');

// Edit profile: photo section
const photoUi = `
  // Profile photo: upload, replace or remove. Saved straight away.
  const photoField = uiEl('div', 'field avatar-edit');
  const initial = (user.displayName || user.username || '?')[0].toUpperCase();
  const photoPreview = uiEl('div', 'pf-avatar avatar-edit__preview', initial);
  setAvatar(photoPreview, user.avatar || 'gradient-violet', initial);
  photoPreview.setAttribute('aria-hidden', 'true');
  const photoText = uiEl('div', 'avatar-edit__text');
  const photoButtons = uiEl('div', 'avatar-edit__buttons');
  const photoFile = document.createElement('input'); photoFile.type = 'file'; photoFile.accept = 'image/jpeg,image/png,image/webp,image/gif'; photoFile.hidden = true;
  const choosePhoto = uiEl('button', 'button', isPhotoAvatar(user.avatar) ? 'Change photo' : 'Upload photo'); choosePhoto.type = 'button';
  const removePhoto = uiEl('button', 'button', 'Remove photo'); removePhoto.type = 'button'; removePhoto.hidden = !isPhotoAvatar(user.avatar);
  const photoStatus = uiEl('p', 'avatar-edit__status', 'JPEG, PNG, WebP or GIF. We crop it to a square.'); photoStatus.setAttribute('role', 'status');
  photoButtons.append(choosePhoto, removePhoto);
  photoText.append(uiEl('label', 'st-label', 'Profile photo'), photoButtons, photoStatus);
  photoField.append(photoPreview, photoText, photoFile);
  let photoChanged = false;
  const setPhotoState = (avatarValue) => {
    currentUser = { ...currentUser, avatar: avatarValue };
    setAvatar(photoPreview, avatarValue || 'gradient-violet', initial);
    choosePhoto.textContent = isPhotoAvatar(avatarValue) ? 'Change photo' : 'Upload photo';
    removePhoto.hidden = !isPhotoAvatar(avatarValue);
    updateSignedInUI();
    photoChanged = true;
  };
  const photoMessage = (text, isError = false) => { photoStatus.textContent = text; photoStatus.classList.toggle('is-error', isError); };
  choosePhoto.addEventListener('click', () => photoFile.click());
  photoFile.addEventListener('change', async () => {
    const file = photoFile.files?.[0];
    photoFile.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) { photoMessage('Choose a JPEG, PNG, WebP or GIF image.', true); return; }
    choosePhoto.disabled = removePhoto.disabled = true;
    photoMessage('Uploading…');
    try {
      const prepared = await prepareAvatarFile(file);
      const formData = new FormData(); formData.append('photo', prepared);
      const result = await api('/auth/avatar', { method: 'POST', body: formData });
      setPhotoState(result.user.avatar);
      photoMessage('Photo updated.');
    } catch (e) { photoMessage(e.message || 'Could not upload that photo.', true); }
    finally { choosePhoto.disabled = removePhoto.disabled = false; }
  });
  removePhoto.addEventListener('click', async () => {
    choosePhoto.disabled = removePhoto.disabled = true;
    photoMessage('Removing…');
    try {
      const result = await api('/auth/profile', { method: 'PATCH', body: JSON.stringify({ avatar: 'gradient-violet' }) });
      setPhotoState(result.user.avatar || 'gradient-violet');
      photoMessage('Photo removed.');
    } catch (e) { photoMessage(e.message || 'Could not remove the photo.', true); }
    finally { choosePhoto.disabled = removePhoto.disabled = false; }
  });
`;
main = once(main, "  body.append(nameField, bioField, gamesRow);", photoUi + "  body.append(photoField, nameField, bioField, gamesRow);", 'edit profile body');
main = once(main, "  dialog.addEventListener('close', () => dialog.remove());\n  document.body.append(dialog); dialog.showModal(); name.focus();",
  "  dialog.addEventListener('close', () => { dialog.remove(); if (photoChanged) void renderProfile(); });\n  document.body.append(dialog); dialog.showModal(); name.focus();", 'edit profile close');

// ---- messaging.js ----
const eolM = eolOf(msg);
msg = "import { setAvatar } from './avatar.js';" + eolM + msg;
msg = once(msg, "const details = element('span', 'arc-chat-list-details');", "setAvatar(avatar, person.avatar, avatar.textContent);\n      const details = element('span', 'arc-chat-list-details');", 'chat list avatar');
const r1 = /(chatAvatar\.textContent = \(friend\.displayName \|\| friend\.username\)\s*\.slice\(0, 1\)\s*\.toUpperCase\(\);)/g;
if ((msg.match(r1) || []).length !== 1) fail('chat header avatar (1): anchor not found.');
msg = msg.replace(r1, (m) => m + eolM + '  setAvatar(chatAvatar, friend.avatar, chatAvatar.textContent);');
const r2 = /(chatAvatar\.textContent = \(\s*activeFriend\.displayName \|\| activeFriend\.username\s*\)\.slice\(0, 1\)\.toUpperCase\(\);)/g;
if ((msg.match(r2) || []).length !== 1) fail('chat header avatar (2): anchor not found.');
msg = msg.replace(r2, (m) => m + eolM + '      setAvatar(chatAvatar, activeFriend.avatar, chatAvatar.textContent);');

// ---- index.html ----
const link = '<link rel="stylesheet" href="/css/onboarding.css" />';
if (!html.includes(link)) fail('Could not find the onboarding.css link in index.html. Apply the onboarding step first.');
html = html.replace(link, link + '\n    <link rel="stylesheet" href="/css/avatar.css" />');

fs.writeFileSync('js/main.js', main);
fs.writeFileSync('js/messaging.js', msg);
fs.writeFileSync('index.html', html);
console.log('Done. Profile photos now show in the header, posts, comments, friends, profile and chat, and Edit profile has a photo section.');
