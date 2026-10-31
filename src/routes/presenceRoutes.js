const express = require('express');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { getFriendIds } = require('../services/friends');
const presence = require('../services/presence');

const router = express.Router();

// GET /api/presence/friends
// Online status of the signed-in user's friends. Friends who hide their
// status always appear offline, with no last-active time.
router.get('/friends', requireAuth, async (req, res, next) => {
  try {
    const friendIds = await getFriendIds(req.user._id);

    if (!friendIds.length) {
      return res.json({ success: true, data: { friends: [] } });
    }

    const friends = await User.find({ _id: { $in: friendIds } })
      .select('username displayName avatar privacy lastActiveAt')
      .limit(500)
      .lean();

    return res.json({
      success: true,
      data: {
        friends: friends.map((friend) => {
          const visible = friend.privacy?.showOnlineStatus !== false;
          return {
            username: friend.username,
            displayName: friend.displayName || '',
            avatar: friend.avatar || null,
            online: visible && presence.isOnline(friend._id),
            lastActiveAt: visible ? friend.lastActiveAt || null : null
          };
        })
      }
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
