const mongoose = require('mongoose');

const friendRequestSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending',
    required: true
  }
}, {
  timestamps: true,
  versionKey: false
});

friendRequestSchema.index(
  { sender: 1, recipient: 1 },
  { unique: true, name: 'friend_request_pair_unique' }
);

friendRequestSchema.index(
  { recipient: 1, status: 1, createdAt: -1 },
  { name: 'friend_request_inbox' }
);

friendRequestSchema.index(
  { sender: 1, status: 1, createdAt: -1 },
  { name: 'friend_request_outbox' }
);

friendRequestSchema.pre('validate', function validateDistinctUsers() {
  if (this.sender && this.recipient && this.sender.equals(this.recipient)) {
    this.invalidate('recipient', 'You cannot send a friend request to yourself.');
  }
});

module.exports = mongoose.model('FriendRequest', friendRequestSchema);