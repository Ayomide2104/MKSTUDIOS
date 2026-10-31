const Friendship = require('../models/Friendship');

async function getFriendIds(userId) {
  const rows = await Friendship.find({ $or: [{ user1: userId }, { user2: userId }] })
    .select('user1 user2')
    .lean();
  return rows.map((row) => (String(row.user1) === String(userId) ? row.user2 : row.user1));
}

module.exports = { getFriendIds };
