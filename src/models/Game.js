const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  genres: { type: [String], default: [] },
  platforms: { type: [String], default: [] },
  description: { type: String, maxlength: 300, default: '' },
  accent: { type: String, default: '#8b7df6', match: /^#[0-9a-fA-F]{6}$/ },
  artwork: { type: String, default: null },
  aliases: { type: [String], default: [] },
  active: { type: Boolean, default: true },
  popularity: { type: Number, default: 0, min: 0 }
}, { timestamps: true, versionKey: false });
schema.index({ active: 1, name: 1 });
schema.index({ genres: 1, active: 1 });
module.exports = mongoose.model('Game', schema);
