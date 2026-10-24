const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true, maxlength: 80 },
  game: { type: String, default: null },
  ownerUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  description: { type: String, maxlength: 300, default: '' },
  rules: { type: [String], default: [] },
  accent: { type: String, default: '#68d6bd', match: /^#[0-9a-fA-F]{6}$/ },
  visibility: { type: String, enum: ['public', 'private'], default: 'public' },
  memberCount: { type: Number, default: 0, min: 0 },
  active: { type: Boolean, default: true }
}, { timestamps: true, versionKey: false });
schema.index({ game: 1, active: 1, name: 1 });
module.exports = mongoose.model('Community', schema);
