const express = require('express');
const mongoose = require('mongoose');
const Game = require('../models/Game');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const router = express.Router();
const catalogLimit=rateLimit({ name:'game-search',max:120,windowMs:15*60*1000 });

router.get('/', catalogLimit, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 30, 1), 50);
    const query = { active: true };
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      const term = req.query.q.trim().slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [{ name: { $regex: `^${term}`, $options: 'i' } }, { aliases: { $regex: `^${term}`, $options: 'i' } }];
    }
    if (typeof req.query.genre === 'string' && /^[a-z-]{2,32}$/.test(req.query.genre)) query.genres = req.query.genre;
    if (req.query.cursor) {
      if (!mongoose.Types.ObjectId.isValid(req.query.cursor)) return res.status(400).json({ success:false,error:'Invalid pagination cursor.' });
      query._id = { $gt: req.query.cursor };
    }
    const items = await Game.find(query).sort({ _id: 1 }).limit(limit).select('-__v').lean();
    res.json({ success: true, data: { items, nextCursor: items.length === limit ? String(items.at(-1)._id) : null } });
  } catch (error) { next(error); }
});

router.put('/:slug/interest', requireAuth, async (req, res, next) => {
  try {
    if (!/^[a-z0-9-]{2,60}$/.test(req.params.slug)) return res.status(400).json({ success:false,error:'Invalid game.' });
    const game = await Game.findOne({ slug:req.params.slug,active:true }).select('slug name').lean();
    if (!game) return res.status(404).json({ success:false,error:'Game not found.' });
    const interested = req.body?.interested;
    if (typeof interested !== 'boolean') return res.status(400).json({ success:false,error:'Interest must be true or false.' });
    await User.updateOne({ _id:req.user._id }, interested ? { $addToSet:{ favoriteGames:game.slug } } : { $pull:{ favoriteGames:game.slug } });
    res.json({ success:true,data:{ game,interested } });
  } catch (error) { next(error); }
});

module.exports = router;
