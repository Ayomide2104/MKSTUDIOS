/* Arcadia presence: Messenger-style green dot + "Active now / Active 5m ago".
   One shared store; any avatar can be marked with presence.mark(node, username)
   and any text line bound with presence.bindLabel(node, username, fallback). */

const state = {
  api: null,
  getUser: () => null,
  onOpenFriends: () => {},
  onNeedSignIn: () => {},
  friends: new Map(), // username -> { online, lastActiveAt, displayName, avatar }
  loaded: false,
  panel: null,
  timer: null,
};

function ago(value) {
  if (!value) return '';
  const seconds = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 90) return 'Active just now';
  if (seconds < 3600) return `Active ${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `Active ${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 7 * 86400) return `Active ${Math.floor(seconds / 86400)}d ago`;
  return '';
}

function labelFor(username) {
  const entry = state.friends.get(username);
  if (!entry) return '';
  return entry.online ? 'Active now' : ago(entry.lastActiveAt);
}

function applyDot(node) {
  const entry = state.friends.get(node.dataset.presenceUser);
  node.dataset.online = entry?.online ? 'true' : 'false';
}

function applyLabel(node) {
  const text = labelFor(node.dataset.presenceLabel);
  node.textContent = text ? `${node.dataset.presencePrefix || ''}${text}` : (node.dataset.presenceFallback || '');
  node.classList.toggle('is-active-now', text === 'Active now');
}

function paint() {
  document.querySelectorAll('[data-presence-user]').forEach(applyDot);
  document.querySelectorAll('[data-presence-label]').forEach(applyLabel);
  renderPanel();
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* ---------- the "Online now" panel on the feed ---------- */

function onlineFriends() {
  return [...state.friends.entries()]
    .filter(([, entry]) => entry.online)
    .map(([username, entry]) => ({ username, ...entry }))
    .sort((a, b) => (a.displayName || a.username).localeCompare(b.displayName || b.username));
}

function renderPanel() {
  const host = state.panel;
  if (!host) return;
  host.replaceChildren();

  const head = el('div', 'mini-panel__head');
  const title = el('h2', '', 'Online now');
  head.append(title);

  const user = state.getUser();
  const online = user ? onlineFriends() : [];
  if (user && online.length) head.append(el('span', 'pr-count', `${online.length} online`));

  const body = el('button', 'pr-body');
  body.type = 'button';

  if (!user) {
    body.setAttribute('aria-label', 'Sign in to see which friends are online');
    body.append(el('p', 'pr-text', 'Sign in to see which friends are online.'));
    body.addEventListener('click', () => state.onNeedSignIn());
    host.append(head, body);
    return;
  }

  body.setAttribute('aria-label', 'Open your friends');
  const row = el('div', 'pr-row');
  // Up to 4 circles; if more are online, show 3 plus a "+N" so the "+" button always fits.
  const shown = online.slice(0, online.length > 4 ? 3 : 4);

  for (const friend of shown) {
    const person = el('span', 'pr-person');
    person.title = friend.displayName || friend.username;
    const avatar = el('span', 'pr-avatar', (friend.displayName || friend.username)[0].toUpperCase());
    if (state.setAvatar) state.setAvatar(avatar, friend.avatar, avatar.textContent);
    avatar.dataset.presenceUser = friend.username;
    avatar.classList.add('has-presence');
    avatar.dataset.online = 'true';
    person.append(avatar);
    row.append(person);
  }

  if (online.length > shown.length) row.append(el('span', 'pr-more', `+${online.length - shown.length}`));

  const add = el('span', 'pr-add', '+');
  add.setAttribute('aria-hidden', 'true');
  row.append(add);
  body.append(row);

  let text;
  if (!online.length) text = 'No friends are online right now. Tap to see your friends.';
  else {
    const names = shown.slice(0, 2).map((friend) => friend.displayName || friend.username);
    const others = online.length - names.length;
    text = others > 0
      ? `${names.join(', ')} and ${others} ${others === 1 ? 'other are' : 'others are'} online`
      : `${names.join(' and ')} ${names.length === 1 ? 'is' : 'are'} online`;
  }
  body.append(el('p', 'pr-text', text));
  body.addEventListener('click', () => state.onOpenFriends());
  host.append(head, body);
}

/* ---------- public API ---------- */

export const presence = {
  configure({ api, getUser, onOpenFriends, onNeedSignIn, setAvatar }) {
    state.api = api;
    state.getUser = getUser;
    state.onOpenFriends = onOpenFriends;
    state.onNeedSignIn = onNeedSignIn;
    state.setAvatar = setAvatar;
    if (!state.timer) state.timer = setInterval(() => { if (document.visibilityState === 'visible') paint(); }, 60000);
  },

  mountPanel(node) {
    state.panel = node;
    renderPanel();
  },

  async refresh() {
    if (!state.api || !state.getUser()) return;
    try {
      const data = await state.api('/presence/friends');
      state.friends = new Map(data.friends.map((friend) => [friend.username, friend]));
      state.loaded = true;
      paint();
    } catch {
      // keep the previous state if the request fails
    }
  },

  /** Called when a socket event arrives, or when the socket reconnects. */
  handle(payload) {
    if (!payload || payload.reconnect) { void presence.refresh(); return; }
    const entry = state.friends.get(payload.username);
    if (!entry) { void presence.refresh(); return; } // a friend we have not loaded yet
    entry.online = Boolean(payload.online);
    if (payload.lastActiveAt) entry.lastActiveAt = payload.lastActiveAt;
    paint();
  },

  /** Called after sign-in or sign-out. */
  sync() {
    if (state.getUser()) { if (!state.loaded) void presence.refresh(); }
    else presence.reset();
  },

  reset() {
    state.friends = new Map();
    state.loaded = false;
    paint();
  },

  /** Put a green dot on an avatar element. */
  mark(node, username) {
    if (!node || !username) return node;
    node.dataset.presenceUser = username;
    node.classList.add('has-presence');
    applyDot(node);
    return node;
  },

  /** Keep a text line in sync with "Active now / Active 5m ago". */
  bindLabel(node, username, fallback = '', prefix = '') {
    if (!node || !username) return node;
    node.dataset.presenceLabel = username;
    node.dataset.presenceFallback = fallback;
    node.dataset.presencePrefix = prefix;
    applyLabel(node);
    return node;
  },
};
