function normalizeUsername(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function validateRegistration(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.username !== 'string' || typeof body.password !== 'string') {
    return { valid: false, error: 'Enter a valid username and password.' };
  }
  const username = normalizeUsername(body.username);
  if (!/^[a-z0-9_]{3,24}$/.test(username)) return { valid: false, error: 'Username must be 3–24 characters: letters, numbers, and underscores.' };
  if (body.password.length < 10 || body.password.length > 128) return { valid: false, error: 'Password must be between 10 and 128 characters.' };
  let email;
  if (body.email !== undefined) {
    if (typeof body.email !== 'string' || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) return { valid: false, error: 'Enter a valid email address.' };
    email = body.email.trim().toLowerCase();
  }
  return { valid: true, username, ...(email ? { email } : {}) };
}

function serializePublicUser(user) {
  return {
    id: String(user._id),
    username: user.username,
    displayName: user.displayName || '',
    bio: user.bio || '',
    avatar: user.avatar || null,
    banner: user.banner || null,
    genres: user.genres || [],
    favoriteGames: user.favoriteGames || [],
    createdAt: user.createdAt,
    onboardingComplete: user.onboardingComplete === true
  };
}

module.exports = { normalizeUsername, validateRegistration, serializePublicUser };
