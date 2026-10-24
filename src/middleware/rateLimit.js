const buckets = new Map();

function rateLimit({ name, max, windowMs }) {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${name}:${req.user?._id || req.ip}`;
    let entry = buckets.get(key);
    if (!entry || now >= entry.resetAt) entry = { count: 0, resetAt: now + windowMs };
    entry.count += 1;
    buckets.set(key, entry);
    if (buckets.size > 5000) {
      for (const [bucketKey, value] of buckets) if (now >= value.resetAt) buckets.delete(bucketKey);
    }
    if (entry.count > max) return res.status(429).json({ success: false, error: 'You’re doing that too quickly. Try again shortly.' });
    return next();
  };
}

module.exports = rateLimit;
