const cloudinary = require('../config/cloudinary');

function hasImageSignature(buffer) {
  if (!Buffer.isBuffer(buffer)) return false;
  const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isGif = buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'));
  const isWebp = buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  return isJpeg || isPng || isGif || isWebp;
}

/**
 * Delete an old Cloudinary image, but only if it is one of this user's own
 * uploads in the expected folder. Best effort: never throws.
 */
async function removeOwnedImage(url, folder, userId) {
  try {
    if (typeof url !== 'string') return;
    const pattern = new RegExp(`/(${folder}/user_${String(userId)}_\\d+)(?:\\.[a-z0-9]+)?$`, 'i');
    const match = url.match(pattern);
    if (!match) return;
    cloudinary.ensureCloudinaryConfigured();
    await cloudinary.uploader.destroy(match[1]);
  } catch (error) {
    console.warn('Could not remove an old image:', error.message);
  }
}

module.exports = { hasImageSignature, removeOwnedImage };
