/* Arcadia avatars: one safe helper used everywhere an avatar is drawn.
   An avatar is either a generated style ("gradient-violet") or an
   https image URL (uploaded profile photo). Never put a URL in a class. */

const PHOTO_URL = /^https:\/\/[^\s"'<>]+$/i;
const GRADIENT = /^gradient-[a-z]+$/;

export function isPhotoAvatar(value) {
  return typeof value === 'string' && PHOTO_URL.test(value);
}

export function setAvatar(node, avatar, initial = '?') {
  if (!node) return node;
  for (const name of [...node.classList]) if (name.startsWith('gradient-')) node.classList.remove(name);
  node.classList.remove('has-photo');
  node.textContent = initial;

  if (isPhotoAvatar(avatar)) {
    const img = document.createElement('img');
    img.className = 'avatar-img';
    img.alt = '';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => {
      img.remove();
      node.classList.remove('has-photo');
      node.textContent = initial;
    });
    img.addEventListener('load', () => { node.classList.add('has-photo'); node.textContent = ''; node.append(img); }, { once: true });
    img.src = avatar;
  } else if (typeof avatar === 'string' && GRADIENT.test(avatar)) {
    node.classList.add(avatar);
  }
  return node;
}

/* Square-crop and shrink a chosen photo before upload (phone photos are
   often bigger than the 5 MB limit). Returns a File ready to upload. */
export async function prepareAvatarFile(file, size = 512) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size, size);
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob) throw new Error('That image could not be read.');
  return new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
}

/* Crop and shrink a chosen picture to a wide banner (1600 x 600). */
export async function prepareBannerFile(file, width = 1600, height = 600) {
  const bitmap = await createImageBitmap(file);
  const targetRatio = width / height;
  let sw = bitmap.width;
  let sh = bitmap.height;
  if (sw / sh > targetRatio) sw = sh * targetRatio; else sh = sw / targetRatio;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, (bitmap.width - sw) / 2, (bitmap.height - sh) / 2, sw, sh, 0, 0, width, height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
  if (!blob) throw new Error('That image could not be read.');
  return new File([blob], 'banner.jpg', { type: 'image/jpeg' });
}

/* Banner priority: the user's own uploaded banner, then the banner of the
   first game they picked, then the generated cover. Nothing flashes: the
   generated cover shows first and is replaced when a better image loads. */
export function applyBanner(node, user, fallbackCover) {
  if (!node) return node;
  const token = Symbol('banner');
  node._bannerToken = token;
  node.style.backgroundImage = fallbackCover ? `url("${fallbackCover}")` : '';

  const show = (src, onFail) => {
    const probe = new Image();
    probe.onload = () => { if (node._bannerToken === token) node.style.backgroundImage = `url("${probe.src}")`; };
    probe.onerror = () => { if (onFail) onFail(); };
    probe.src = src;
  };

  const game = (user?.favoriteGames || [])[0];
  const gameSrc = typeof game === 'string' && /^[a-z0-9-]{2,60}$/.test(game)
    ? `/assets/arcadia/games/${game}-banner.jpg`
    : null;

  if (isPhotoAvatar(user?.banner)) show(user.banner, () => { if (gameSrc) show(gameSrc); });
  else if (gameSrc) show(gameSrc);
  return node;
}
