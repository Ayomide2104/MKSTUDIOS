const express = require('express');
const mongoose = require('mongoose');
const Community = require('../models/Community');
const Membership = require('../models/Membership');
const Post = require('../models/Post');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const router = express.Router();
const discoveryLimit=rateLimit({ name:'community-search',max:120,windowMs:15*60*1000 });
const communityPostLimit=rateLimit({ name:'community-post',max:20,windowMs:15*60*1000 });

router.get('/', discoveryLimit, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 30, 1), 50);
    const query = { active:true,visibility:'public' };
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      const term = req.query.q.trim().slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [{ name:{ $regex:term,$options:'i' } },{ slug:{ $regex:term,$options:'i' } }];
    }
    if (typeof req.query.game === 'string' && /^[a-z0-9-]{2,60}$/.test(req.query.game)) query.game = req.query.game;
    if (req.query.cursor) {
      if (!mongoose.Types.ObjectId.isValid(req.query.cursor)) return res.status(400).json({ success:false,error:'Invalid pagination cursor.' });
      query._id = { $gt:req.query.cursor };
    }
    const items = await Community.find(query).select('-ownerUser').sort({ _id:1 }).limit(limit).lean();
    res.json({ success:true,data:{ items,nextCursor:items.length===limit?String(items.at(-1)._id):null } });
  } catch (error) { next(error); }
});

router.get('/mine', requireAuth, async (req,res,next) => {
  try {
    const memberships = await Membership.find({ user:req.user._id }).sort({ createdAt:-1 }).limit(50).populate({path:'community',select:'-ownerUser'}).lean();
    res.json({ success:true,data:{ items:memberships.filter((entry)=>entry.community).map((entry)=>({ ...entry.community,role:entry.role })) } });
  } catch (error) { next(error); }
});

router.post('/:slug/join', requireAuth, async (req,res,next) => {
  try {
    const community = await Community.findOne({ slug:req.params.slug,active:true,visibility:'public' });
    if (!community) return res.status(404).json({ success:false,error:'Community not found.' });
    const claimedOwner=community.memberCount===0?await Community.findOneAndUpdate({ _id:community._id,memberCount:0,ownerUser:null },{ $set:{ ownerUser:req.user._id } },{ new:true }).select('_id').lean():null;
    const role=claimedOwner?'owner':'member';
    let result;
    try { result = await Membership.updateOne({ community:community._id,user:req.user._id },{ $setOnInsert:{ community:community._id,user:req.user._id,role } },{ upsert:true }); }
    catch (error) { if (error.code !== 11000) throw error; result = { upsertedCount: 0 }; }
    if (result.upsertedCount) await Community.updateOne({ _id:community._id },{ $inc:{ memberCount:1 } });
    const count = await Membership.countDocuments({ community:community._id });
    res.json({ success:true,data:{ joined:true,memberCount:count } });
  } catch (error) { next(error); }
});

router.delete('/:slug/join', requireAuth, async (req,res,next) => {
  try {
    const community = await Community.findOne({ slug:req.params.slug,active:true });
    if (!community) return res.status(404).json({ success:false,error:'Community not found.' });
    const membership = await Membership.findOne({ community:community._id,user:req.user._id });
    if (membership?.role === 'owner') return res.status(409).json({ success:false,error:'Community owners cannot leave without transferring ownership.' });
    if (membership) {
      const removed=await Membership.deleteOne({ _id:membership._id });
      if (removed.deletedCount) await Community.updateOne({ _id:community._id,memberCount:{ $gt:0 } },{ $inc:{ memberCount:-1 } });
    }
    res.json({ success:true,data:{ joined:false,memberCount:await Membership.countDocuments({ community:community._id }) } });
  } catch (error) { next(error); }
});

router.patch('/:slug/members/:username/role',requireAuth,async(req,res,next)=>{
  try{
    if(!/^[a-z0-9_]{3,24}$/i.test(req.params.username)||!['member','moderator'].includes(req.body?.role))return res.status(400).json({success:false,error:'Choose a valid member and role.'});
    const community=await Community.findOne({slug:req.params.slug,active:true}).select('_id').lean();if(!community)return res.status(404).json({success:false,error:'Community not found.'});
    const actor=await Membership.findOne({community:community._id,user:req.user._id}).select('role').lean();if(actor?.role!=='owner')return res.status(403).json({success:false,error:'Only the owner can manage moderators.'});
    const targetUser=await require('../models/User').findOne({username:req.params.username.toLowerCase()}).select('_id').lean();if(!targetUser)return res.status(404).json({success:false,error:'Member not found.'});
    const target=await Membership.findOne({community:community._id,user:targetUser._id});if(!target)return res.status(404).json({success:false,error:'Member not found.'});if(target.role==='owner')return res.status(409).json({success:false,error:'The community owner role cannot be changed here.'});
    target.role=req.body.role;await target.save();res.json({success:true,data:{username:req.params.username.toLowerCase(),role:target.role}});
  }catch(error){next(error);}
});

router.get('/:slug/posts', optionalAuth, async (req,res,next) => {
  try {
    const community = await Community.findOne({ slug:req.params.slug,active:true }).select('_id visibility').lean();
    if (!community) return res.status(404).json({ success:false,error:'Community not found.' });
    let role = null;
    if (req.user) role = (await Membership.findOne({ community:community._id,user:req.user._id }).select('role').lean())?.role || null;
    if (community.visibility === 'private') {
      if (!req.user) return res.status(401).json({ success:false,error:'Sign in to view this community.' });
      if (!role) return res.status(403).json({ success:false,error:'Join this community to view its posts.' });
    }
    const limit=Math.min(Math.max(Number.parseInt(req.query.limit,10)||20,1),30);
    const query={ destinations:{ $elemMatch:{ type:'community',target:req.params.slug } } };
    if (req.query.cursor) {
      if (!mongoose.Types.ObjectId.isValid(req.query.cursor)) return res.status(400).json({ success:false,error:'Invalid pagination cursor.' });
      query._id={ $lt:req.query.cursor };
    }
    const communityDetails=await Community.findById(community._id).select('name slug rules accent game memberCount').lean();
    query.removedAt=null;
    const items=await Post.find(query).sort({ _id:-1 }).limit(limit).populate('author','username displayName avatar').lean();
    res.json({ success:true,data:{ community:communityDetails,role,items,nextCursor:items.length===limit?String(items.at(-1)._id):null } });
  } catch(error) { next(error); }
});

router.delete('/:slug/posts/:postId', requireAuth, async (req,res,next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.postId)) return res.status(400).json({ success:false,error:'Invalid post.' });
    const community=await Community.findOne({ slug:req.params.slug,active:true }).select('_id').lean();
    if (!community) return res.status(404).json({ success:false,error:'Community not found.' });
    const membership=await Membership.findOne({ community:community._id,user:req.user._id }).select('role').lean();
    if (!membership || !['owner','moderator'].includes(membership.role)) return res.status(403).json({ success:false,error:'Only community moderators can remove posts.' });
    const post=await Post.findOne({ _id:req.params.postId,removedAt:null,destinations:{ $elemMatch:{ type:'community',target:req.params.slug } } }).select('destinations').lean();
    if (!post) return res.status(404).json({ success:false,error:'Community post not found.' });
    const otherDestinations=post.destinations.filter((destination)=>destination.type!=='community'||destination.target!==req.params.slug);
    if(otherDestinations.length)await Post.updateOne({_id:post._id,removedAt:null},{$pull:{destinations:{type:'community',target:req.params.slug}}});
    else await Post.updateOne({_id:post._id,removedAt:null},{$set:{removedAt:new Date(),removedBy:req.user._id}});
    res.json({ success:true,data:{ removed:true } });
  } catch(error) { next(error); }
});

router.post('/:slug/posts', requireAuth, communityPostLimit, async (req,res,next) => {
  try {
    const community=await Community.findOne({ slug:req.params.slug,active:true }).select('_id slug visibility').lean();
    if (!community) return res.status(404).json({ success:false,error:'Community not found.' });
    const member=await Membership.exists({ community:community._id,user:req.user._id });
    if (!member) return res.status(403).json({ success:false,error:'Join this community before posting.' });
    const body=req.body?.body;
    if (typeof body!=='string'||!body.trim()||body.trim().length>500) return res.status(400).json({ success:false,error:'Post text must be between 1 and 500 characters.' });
    const post=await Post.create({ author:req.user._id,body:body.trim(),destinations:[{ type:'community',target:community.slug }] });
    await post.populate('author','username displayName avatar');
    res.status(201).json({ success:true,data:{ post } });
  } catch(error) { next(error); }
});

module.exports=router;
