function publicFeedFilter() {
  return { destinations: { $elemMatch: { type: 'general' } } };
}

function isVisibleInGeneralFeed(post) {
  return Array.isArray(post?.destinations) && post.destinations.some((destination) => destination?.type === 'general');
}

module.exports = { publicFeedFilter, isVisibleInGeneralFeed };
