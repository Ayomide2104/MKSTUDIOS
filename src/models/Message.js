const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    immutable: true
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    immutable: true
  },
  content: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 2000
  },
  readAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  versionKey: false,
  autoIndex: false
});

messageSchema.pre('validate', function validateParticipants() {
  if (
    this.sender &&
    this.recipient &&
    this.sender.equals(this.recipient)
  ) {
    this.invalidate('recipient', 'You cannot message yourself.');
  }
});

messageSchema.index(
  { sender: 1, recipient: 1, createdAt: -1 },
  { name: 'message_sender_recipient_created' }
);

messageSchema.index(
  { recipient: 1, readAt: 1, createdAt: -1 },
  { name: 'message_recipient_unread' }
);

module.exports = mongoose.model('Message', messageSchema);