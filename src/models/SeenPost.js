const mongoose = require('mongoose');

// One small record per (user, post). Old records expire automatically after
// 30 days, so this collection cannot grow without limit.
const seenPostSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
  seenAt: { type: Date, default: Date.now }
}, { versionKey: false });

seenPostSchema.index({ user: 1, post: 1 }, { unique: true });
seenPostSchema.index({ seenAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

module.exports = mongoose.model('SeenPost', seenPostSchema);
