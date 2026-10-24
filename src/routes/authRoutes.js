const express = require('express');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const Session = require('../models/Session');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const { normalizeUsername, validateRegistration, serializePublicUser } = require('../services/socialContracts');

const router = express.Router();
const WINDOW = 15 * 60 * 1000;
const registerLimit = rateLimit({ name: 'auth-register', max: 12, windowMs: WINDOW });
const loginLimit = rateLimit({ name: 'auth-login', max: 12, windowMs: WINDOW });
const authRateLimit = rateLimit({ name: 'auth-password', max: 8, windowMs: WINDOW });
function setSessionCookie(res, token) {
  res.cookie('mk_session', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' || process.env.RENDER === 'true', sameSite: 'strict', path: '/', maxAge: 1000 * 60 * 60 * 24 * 14 });
}
async function issueSession(userId, res) {
  const token = crypto.randomBytes(32).toString('base64url');
  const csrfToken = crypto.randomBytes(32).toString('base64url');
  await Session.create({ tokenHash: crypto.createHash('sha256').update(token).digest('hex'), csrfToken, user: userId, expiresAt: new Date(Date.now() + 14 * 86400000) });
  setSessionCookie(res, token);
  return csrfToken;
}
router.post('/register', registerLimit, async (req, res, next) => {
  try {
    const validation = validateRegistration(req.body);
    if (!validation.valid) return res.status(400).json({ success: false, error: validation.error });
    const username = validation.username;
    const password = req.body.password;
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ username, passwordHash });
    const csrfToken = await issueSession(user._id, res);
    res.status(201).json({ success: true, data: { user: serializePublicUser(user), csrfToken } });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, error: 'That username is unavailable.' });
    next(error);
  }
});

router.post('/login', loginLimit, async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || typeof req.body.username !== 'string' || typeof req.body.password !== 'string' || req.body.username.length > 64 || req.body.password.length > 128) return res.status(400).json({ success: false, error: 'Enter a valid username and password.' });
    const user = await User.findOne({ username: normalizeUsername(req.body.username) }).select('+passwordHash');
    const valid = user && await bcrypt.compare(req.body.password, user.passwordHash);
    if (!valid) return res.status(401).json({ success: false, error: 'Username or password is incorrect.' });
    const csrfToken = await issueSession(user._id, res);
    res.json({ success: true, data: { user: serializePublicUser(user), csrfToken } });
  } catch (error) { next(error); }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    let session = await Session.findById(req.sessionId).select('+csrfToken').lean();
    if (session && !session.csrfToken) {
      session.csrfToken = crypto.randomBytes(32).toString('base64url');
      await Session.updateOne({ _id: req.sessionId }, { $set: { csrfToken: session.csrfToken } });
    }
    res.json({ success: true, data: { user: serializePublicUser(req.user), csrfToken: session?.csrfToken || null } });
  } catch (error) { next(error); }
});
router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await Session.deleteOne({ _id: req.sessionId });
    res.clearCookie('mk_session', { httpOnly: true, secure: process.env.NODE_ENV === 'production' || process.env.RENDER === 'true', sameSite: 'strict', path: '/' });
    res.json({ success: true, data: { signedOut: true } });
  } catch (error) { next(error); }
});

const GENRES = ['sports', 'fps', 'rpg', 'battle-royale', 'racing', 'strategy', 'fighting', 'simulation', 'adventure', 'party'];
router.patch('/profile', requireAuth, async (req, res, next) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ success: false, error: 'Enter valid profile details.' });
    const update = {};
    if (Object.hasOwn(body, 'displayName')) {
      if (typeof body.displayName !== 'string' || body.displayName.trim().length > 40) return res.status(400).json({ success: false, error: 'Display name must be 40 characters or fewer.' });
      update.displayName = body.displayName.trim();
    }
    if (Object.hasOwn(body, 'bio')) {
      if (typeof body.bio !== 'string' || body.bio.trim().length > 280) return res.status(400).json({ success: false, error: 'Bio must be 280 characters or fewer.' });
      update.bio = body.bio.trim();
    }
    if (Object.hasOwn(body, 'avatar')) {
      if (!['gradient-violet', 'gradient-cyan', 'gradient-amber', 'gradient-emerald', 'gradient-pink'].includes(body.avatar)) return res.status(400).json({ success: false, error: 'Choose a generated avatar style.' });
      update.avatar = body.avatar;
    }
    if (Object.hasOwn(body, 'genres')) {
      if (!Array.isArray(body.genres) || body.genres.length > GENRES.length || body.genres.some((item) => typeof item !== 'string' || !GENRES.includes(item))) return res.status(400).json({ success: false, error: 'Choose valid gaming interests.' });
      update.genres = [...new Set(body.genres)];
    }
    if (Object.hasOwn(body, 'favoriteGames')) {
      if (!Array.isArray(body.favoriteGames) || body.favoriteGames.length > 20 || body.favoriteGames.some((item) => typeof item !== 'string' || !/^[a-z0-9-]{2,60}$/.test(item))) return res.status(400).json({ success: false, error: 'Choose up to 20 catalog games.' });
      const slugs = [...new Set(body.favoriteGames)];
      const Game = require('../models/Game');
      if (slugs.length && await Game.countDocuments({ slug: { $in: slugs }, active: true }) !== slugs.length) return res.status(400).json({ success: false, error: 'One or more selected games are unavailable.' });
      update.favoriteGames = slugs;
    }
    if (Object.hasOwn(body, 'onboardingComplete')) {
      if (body.onboardingComplete !== true) return res.status(400).json({ success: false, error: 'Invalid onboarding state.' });
      update.onboardingComplete = true;
    }
    const user = await User.findByIdAndUpdate(req.user._id, { $set: update }, { new: true, runValidators: true }).lean();
    res.json({ success: true, data: { user: serializePublicUser(user) } });
  } catch (error) { next(error); }
});

router.get('/settings', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('notificationPreferences privacy').lean();
    res.json({ success: true, data: { settings: { notificationPreferences: user.notificationPreferences || {}, privacy: user.privacy || {} } } });
  } catch (error) { next(error); }
});
router.patch('/settings', requireAuth, async (req, res, next) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ success: false, error: 'Enter valid settings.' });
    const update = {};
    if (Object.hasOwn(body, 'notificationPreferences')) {
      const value = body.notificationPreferences;
      if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !['comments', 'reactions', 'communities'].includes(key)) || Object.values(value).some((item) => typeof item !== 'boolean')) return res.status(400).json({ success: false, error: 'Invalid notification preferences.' });
      update.notificationPreferences = value;
    }
    if (Object.hasOwn(body, 'privacy')) {
      const value = body.privacy;
      if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !['profileVisibility', 'friendRequests'].includes(key)) || !['public', 'private'].includes(value.profileVisibility) || !['everyone', 'nobody'].includes(value.friendRequests)) return res.status(400).json({ success: false, error: 'Invalid privacy settings.' });
      update.privacy = value;
    }
    await User.updateOne({ _id: req.user._id }, { $set: update });
    res.json({ success: true, data: { saved: true } });
  } catch (error) { next(error); }
});
router.post('/password', requireAuth, authRateLimit, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || newPassword.length < 10 || newPassword.length > 128) return res.status(400).json({ success: false, error: 'Enter your current password and a new password of 10 to 128 characters.' });
    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!user || !await bcrypt.compare(currentPassword, user.passwordHash)) return res.status(400).json({ success: false, error: 'Current password is incorrect.' });
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();
    await Session.deleteMany({ user: user._id, _id: { $ne: req.sessionId } });
    res.json({ success: true, data: { changed: true, otherSessionsSignedOut: true } });
  } catch (error) { next(error); }
});

router.get('/profiles/:username', optionalAuth, async (req, res, next) => {
  try {
    if (typeof req.params.username !== 'string' || !/^[a-z0-9_]{3,24}$/i.test(req.params.username)) return res.status(400).json({ success: false, error: 'Invalid profile.' });
    const user = await User.findOne({ username: req.params.username.toLowerCase() }).lean();
    if (!user) return res.status(404).json({ success: false, error: 'Profile not found.' });
    if (user.privacy?.profileVisibility === 'private' && req.user?._id?.toString() !== user._id.toString()) return res.status(404).json({ success: false, error: 'Profile not found.' });
    res.json({ success: true, data: { user: serializePublicUser(user) } });
  } catch (error) { next(error); }
});

router.get('/profiles/:username/posts', optionalAuth, async (req,res,next)=>{
  try{
    if(typeof req.params.username!=='string'||!/^[a-z0-9_]{3,24}$/i.test(req.params.username))return res.status(400).json({success:false,error:'Invalid profile.'});
    const user=await User.findOne({username:req.params.username.toLowerCase()}).select('_id privacy').lean();if(!user)return res.status(404).json({success:false,error:'Profile not found.'});
    if(user.privacy?.profileVisibility==='private'&&req.user?._id?.toString()!==user._id.toString())return res.status(404).json({success:false,error:'Profile not found.'});
    const limit=Math.min(Math.max(Number.parseInt(req.query.limit,10)||10,1),20);const query={author:user._id,removedAt:null,destinations:{$elemMatch:{type:'general'}}};
    if(req.query.cursor){if(!mongoose.Types.ObjectId.isValid(req.query.cursor))return res.status(400).json({success:false,error:'Invalid pagination cursor.'});query._id={$lt:req.query.cursor};}
    const Post=require('../models/Post');const items=await Post.find(query).sort({_id:-1}).limit(limit).populate('author','username displayName avatar').lean();
    res.json({success:true,data:{items,nextCursor:items.length===limit?String(items.at(-1)._id):null}});
  }catch(error){next(error);}
});

module.exports = router;
