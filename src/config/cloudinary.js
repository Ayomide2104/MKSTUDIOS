const cloudinary = require('cloudinary').v2;

const isConfigured =
  Boolean(process.env.CLOUDINARY_CLOUD_NAME) &&
  Boolean(process.env.CLOUDINARY_API_KEY) &&
  Boolean(process.env.CLOUDINARY_API_SECRET);

if (isConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

function ensureCloudinaryConfigured() {
  if (!isConfigured) {
    const error = new Error('Image uploads are unavailable because Cloudinary is not configured.');
    error.status = 503;
    throw error;
  }
}

module.exports = cloudinary;
module.exports.ensureCloudinaryConfigured = ensureCloudinaryConfigured;