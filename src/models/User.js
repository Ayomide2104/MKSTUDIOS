const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true, lowercase: true, minlength: 3, maxlength: 24, match: /^[a-z0-9_]+$/ },
  displayName: { type: String, trim: true, maxlength: 40, default: '' },
  bio: { type: String, trim: true, maxlength: 280, default: '' },
  avatar: { type: String, default: null },
  email: { type: String, trim: true, lowercase: true, maxlength: 254, default: undefined },
  passwordHash: { type: String, required: true, select: false },
  genres: { type: [String], default: [] },
  favoriteGames: { type: [String], default: [] },
  onboardingComplete: { type: Boolean, default: false },
  notificationPreferences: { type: mongoose.Schema.Types.Mixed, default: () => ({ comments: true, reactions: true, communities: true }) },
  privacy: { type: mongoose.Schema.Types.Mixed, default: () => ({ profileVisibility: 'public', friendRequests: 'everyone' }) },
  settings: { type: mongoose.Schema.Types.Mixed, default: () => ({}) }
}, { timestamps: true, versionKey: false, autoIndex: false });

// User indexes are intentionally managed by scripts/migrateUserIndexes.js so
// Atlas indexes are reviewed and migrated deliberately instead of at startup.
userSchema.index({ username: 1 }, { unique: true, partialFilterExpression: { username: { $type: 'string' } }, name: 'username_string_unique' });
userSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } }, name: 'email_string_unique' });
userSchema.index({ createdAt: -1 });

module.exports = mongoose.model('User', userSchema);
