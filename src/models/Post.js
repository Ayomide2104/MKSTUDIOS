const mongoose = require('mongoose');
const destinationSchema = new mongoose.Schema({
  type: { type: String, enum: ['general', 'game', 'community'], required: true },
  target: { type: String, maxlength: 80, default: null }
}, { _id: false });
const postSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  body: { type: String, required: true, trim: true, maxlength: 500 },
  destinations: { type: [destinationSchema], required: true, validate: (list) => list.length > 0 },
  type: { type: String, enum: ['original', 'repost'], default: 'original' },
  repostOf: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', default: null },
  removedAt: { type: Date, default: null },
  removedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  media: { type: [mongoose.Schema.Types.Mixed], default: [] },
  likeCount: { type: Number, default: 0, min: 0 },
  commentCount: { type: Number, default: 0, min: 0 },
  repostCount: { type: Number, default: 0, min: 0 }
}, { timestamps: true, versionKey: false });
postSchema.index({ 'destinations.type': 1, createdAt: -1, _id: -1 });
postSchema.index({ author: 1, createdAt: -1, _id: -1 });
module.exports = mongoose.model('Post', postSchema);
