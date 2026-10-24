const mongoose = require('mongoose');
const sessionSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  csrfToken: { type: String, required: true, select: false },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  expiresAt: { type: Date, required: true }
}, { timestamps: true, versionKey: false });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model('Session', sessionSchema);
