const mongoose = require('mongoose');

const friendshipSchema = new mongoose.Schema({
  user1: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  user2: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true
  }
}, {
  versionKey: false,
  autoIndex: false
});

friendshipSchema.index(
  { user1: 1, user2: 1 },
  { unique: true, name: 'friendship_pair_unique' }
);

friendshipSchema.pre('validate', function validateDistinctUsers() {
  if (this.user1 && this.user2 && this.user1.equals(this.user2)) {
    this.invalidate('user2', 'A user cannot be friends with themselves.');
  }

  if (this.user1 && this.user2 && this.user1.toString() > this.user2.toString()) {
    const first = this.user1;
    this.user1 = this.user2;
    this.user2 = first;
  }
});

module.exports = mongoose.model('Friendship', friendshipSchema);