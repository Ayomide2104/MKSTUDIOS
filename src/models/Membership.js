const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  community: { type: mongoose.Schema.Types.ObjectId, ref: 'Community', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['owner', 'moderator', 'member'], default: 'member' }
}, { timestamps: true, versionKey: false });
schema.index({ community: 1, user: 1 }, { unique: true });
schema.index({ user: 1, createdAt: -1 });
module.exports = mongoose.model('Membership', schema);
