import { createMessaging } from './messaging.js';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const dialog = $('#auth-dialog');
const composerDialog = $('#composer-dialog');
const authForm = $('#auth-form');
let authMode = 'login';
let currentUser = null;
let returnTo = null;
let destinationChoicesLoaded = false;
let csrfToken = null;
let messaging = null;

function syncMessagingSession() {
  if (!messaging) {
    messaging = createMessaging({
      api,
      getCurrentUser: () => currentUser,
      toast
    });
  }

  if (currentUser) {
  messaging.init();
  messaging.connect();
} else {
  messaging.disconnect();
}
}
let selectedCommunity = null;

function applyTheme(theme, persist = true) {
  const selected = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = selected;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.content = selected === 'dark' ? '#14171F' : '#5A3FD6';
  if (persist) {
    try { localStorage.setItem('mkstudios-theme', selected); } catch { /* Theme still applies for this page view. */ }
  }
}

try { applyTheme(localStorage.getItem('mkstudios-theme') || 'light', false); }
catch { applyTheme('light', false); }

function toast(message) {
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = message;
  $('.toast-region').append(node);
  window.setTimeout(() => node.remove(), 3500);
}

function openAuth(action = null) {
  returnTo = action;
  $('#auth-error').textContent = '';
  if (!dialog.open) dialog.showModal();
}

function selectView(view) {
  $$('[data-panel]').forEach((panel) => { panel.hidden = panel.dataset.panel !== view; });
  $$('[data-view]').forEach((button) => {
    const active = button.dataset.view === view || (view === 'groups' && button.dataset.view === 'games' && button.closest('.mobile-dock'));
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
  const mobileIndex = { feed: 0, games: 1, groups: 1, friends: 3, profile: 4 }[view];
  if (mobileIndex !== undefined) $('.mobile-dock')?.style.setProperty('--active-index', String(mobileIndex));
  $$('.games-switch button').forEach((button) => { const active = button.dataset.viewLink === view; button.classList.toggle('is-current', active); button.setAttribute('aria-selected', String(active)); });
  document.querySelector('.workspace:not([hidden])')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (view === 'games') loadGames();
  if (view === 'groups') loadCommunities();
  if (view === 'updates') loadUpdates();
  if (view === 'profile') renderProfile();
  if (view === 'friends') void renderFriends();
  if (view === 'inbox') messaging?.openInbox();
}

$$('[data-view]').forEach((button) => button.addEventListener('click', () => selectView(button.dataset.view)));
$$('[data-action="open-inbox"]').forEach((button) => {
  button.addEventListener('click', () => {
    if (!currentUser) {
      openAuth();
      toast('Sign in to view your messages.');
      return;
    }

    selectView('inbox');
  });
});
$$('[data-view-link]').forEach((button) => button.addEventListener('click', () => selectView(button.dataset.viewLink)));

const searchToggle = $('#mobile-search-toggle');
searchToggle.addEventListener('click', () => {
  const expanded = searchToggle.getAttribute('aria-expanded') === 'true';
  searchToggle.setAttribute('aria-expanded', String(!expanded)); searchToggle.setAttribute('aria-label', expanded ? 'Open search' : 'Close search');
  $('.topbar').classList.toggle('search-open', !expanded);
  if (!expanded) $('#global-search').focus();
});
$('#global-search').addEventListener('keydown', (event) => { if (event.key === 'Escape') { $('.topbar').classList.remove('search-open'); searchToggle.setAttribute('aria-expanded', 'false'); searchToggle.focus(); } });

let lastScrollY = window.scrollY;
let dockScrollScheduled = false;
window.addEventListener('scroll', () => {
  if (dockScrollScheduled) return;
  dockScrollScheduled = true;
  window.requestAnimationFrame(() => {
    const dock = $('.mobile-dock'); const current = window.scrollY; const atEnd = window.innerHeight + current >= document.documentElement.scrollHeight - 4;
    if (window.innerWidth < 900) dock.classList.toggle('is-hidden', !atEnd && current > lastScrollY && current > 80);
    else dock.classList.remove('is-hidden');
    lastScrollY = current; dockScrollScheduled = false;
  });
}, { passive: true });

$$('.feed-tab').forEach((tab, index) => {
  tab.addEventListener('click', () => {
    if (tab.dataset.filter === 'friends') { toast('Friends feed will unlock with friend connections.'); return; }
    if (tab.dataset.filter === 'groups') { toast('Group posts are not available in the feed API yet.'); return; }
    $$('.feed-tab').forEach((item) => {
      const active = item === tab;
      item.classList.toggle('is-selected', active);
      item.setAttribute('aria-selected', String(active));
    });
    const tabs = tab.parentElement;
    $('.tab-indicator', tabs).style.transform = `translateX(${tab.offsetLeft - tabs.offsetLeft}px)`;
    loadFeed(tab.dataset.filter);
  });
});

$$('[data-action="signin"], #auth-avatar').forEach((button) => button.addEventListener('click', () => {
  if (button.id === 'auth-avatar' && currentUser) { selectView('profile'); return; }
  if (button.hasAttribute('data-action') && currentUser) {
    const panel = button.closest('[data-panel]');
    const destination = panel?.dataset.panel || 'games';
    selectView(destination);
    return;
  }
  openAuth();
}));
$('#auth-open').addEventListener('click', async () => {
  if (!currentUser) return openAuth();
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* The local session is still cleared. */ }
  currentUser = null;
  csrfToken = null;
  syncMessagingSession();
  updateSignedInUI();
  toast('You’re signed out.');
});
$$('[data-action="compose"]').forEach((button) => button.addEventListener('click', () => { if (!currentUser) return openAuth('compose'); composePost(); if (button.textContent.trim() === 'Photo') photoInput.click(); }));

$('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
$('.dialog-close', composerDialog).addEventListener('click', () => composerDialog.close());
composerDialog.addEventListener('click', (event) => { if (event.target === composerDialog) composerDialog.close(); });
$('#composer-body').addEventListener('input', (event) => { $('#composer-count').textContent = `${event.target.value.length} / 500`; });
const photoInput = $('#composer-photo');
$('#photo-pick').addEventListener('click', () => photoInput.click());
let photoUrl = null;
photoInput.addEventListener('change', async () => {
  const file = photoInput.files?.[0];
  if (!file) return;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
    let quality = 0.86; let blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    while (blob && blob.size > 250 * 1024 && quality > 0.35) { quality -= 0.08; blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality)); }
    if (!blob || blob.size > 250 * 1024) throw new Error('This image could not be compressed below 250 KB.');
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = URL.createObjectURL(blob);
    const preview = $('#photo-preview'); preview.hidden = false; preview.replaceChildren();
    const img = document.createElement('img'); img.src = photoUrl; img.alt = 'Selected photo preview';
    const info = document.createElement('span'); info.textContent = `${Math.max(1, Math.round(blob.size / 1024))} KB of 300 KB limit`;
    const meter = document.createElement('progress'); meter.className = 'photo-meter'; meter.max = 300; meter.value = blob.size / 1024; meter.setAttribute('aria-label', 'Compressed photo size out of 300 KB');
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'icon-button'; remove.setAttribute('aria-label', 'Remove selected photo'); remove.textContent = '×';
    remove.addEventListener('click', () => { URL.revokeObjectURL(photoUrl); photoUrl = null; photoInput.value = ''; preview.hidden = true; preview.replaceChildren(); });
    preview.append(img, info, meter, remove);
  } catch (error) { toast(error.message || 'Could not read that image.'); photoInput.value = ''; }
});
$('#composer-game').addEventListener('click', () => { composePost(); $('#composer-destination')?.focus(); });
$('#composer-form').addEventListener('submit', async (event) => {
  event.preventDefault();

  const body = $('#composer-body').value.trim();
  const choice = $('#composer-destination')?.value || 'general';
  const [type, target] = choice.split(':');
  const submit = $('button[type="submit"]', event.currentTarget);

  // Get the selected image from the photo picker.
  const photoInput = $('#composer-photo');
  const photo = photoInput?.files?.[0] || null;

  // Allow text-only, photo-only, and combined posts.
  if (!body && !photo) {
    $('#composer-error').textContent = 'Write something or add a photo.';
    return;
  }

  if (body.length > 500) {
    $('#composer-error').textContent =
      'Post text cannot exceed 500 characters.';
    return;
  }

  submit.disabled = true;
  $('#composer-error').textContent = '';

  const communitySlug = selectedCommunity?.slug;

  const pending = renderPost({
    _id: `pending-${Date.now()}`,
    author: currentUser,
    body,
    media: [],
    createdAt: new Date().toISOString(),
    likeCount: 0,
    commentCount: 0,
    repostCount: 0,
  });

  pending.classList.add('is-pending');
  pending.querySelectorAll('button').forEach((button) => {
    button.disabled = true;
  });

  const host = communitySlug
    ? $('#view-groups .post-list')
    : $('#post-list');

  host?.prepend(pending);

  try {
    // Prepare the post payload.
    const formData = new FormData();

    formData.append('body', body);

    formData.append(
      'destinations',
      JSON.stringify([
        {
          type: communitySlug ? 'community' : type,
          ...(
            communitySlug
              ? { target: communitySlug }
              : target
                ? { target }
                : {}
          ),
        },
      ])
    );

    if (photo) {
      formData.append('photo', photo);
    }

    // Send the image and post details as multipart/form-data.
    // The browser automatically sets the multipart boundary.
    await api('/posts', {
      method: 'POST',
      body: formData,
    });

    composerDialog.close();

    event.currentTarget.reset();

    $('#composer-count').textContent = '0 / 500';

    // Clear any temporary photo preview if the existing UI uses one.
    if (typeof photoUrl !== 'undefined' && photoUrl) {
      URL.revokeObjectURL(photoUrl);
      photoUrl = null;
    }

    const photoPreview = $('#photo-preview');

    if (photoPreview) {
      photoPreview.replaceChildren();
      photoPreview.hidden = true;
    }

    toast('Your post is live.');

    if (communitySlug) {
      await openCommunity(communitySlug);
    } else {
      await loadFeed();
    }
  } catch (error) {
    pending.remove();

    $('#composer-error').textContent =
      error.message || 'Could not publish your post. Please try again.';
  } finally {
    submit.disabled = false;
  }
});

$$('[data-auth-mode]').forEach((button) =>
  button.addEventListener('click', () =>
    setAuthMode(button.dataset.authMode)
  )
);

async function api(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();

  const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

  const isFormData =
    typeof FormData !== 'undefined' &&
    options.body instanceof FormData;

  const headers = {
    // Let the browser set the multipart boundary for FormData.
    ...(
      options.body && !isFormData
        ? { 'Content-Type': 'application/json' }
        : {}
    ),

    ...(mutating && csrfToken
      ? { 'X-CSRF-Token': csrfToken }
      : {}),

    ...options.headers,
  };

  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...options,
    headers,
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      body.error || 'Something went wrong. Please try again.'
    );
  }

  return body.data ?? body;
}

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = $('button[type="submit"]', authForm);
  const username = $('#auth-username').value.trim();
  const password = $('#auth-password').value;
  if (authMode === 'register' && password !== $('#auth-confirm').value) {
    $('#auth-error').textContent = 'Those passwords do not match.';
    return;
  }
  $('#auth-error').textContent = '';
  submit.disabled = true;
  submit.textContent = authMode === 'login' ? 'Signing in…' : 'Creating account…';
  try {
    const result = await api(`/auth/${authMode}`, { method: 'POST', body: JSON.stringify({ username, password }) });
    currentUser = result.user;
    csrfToken = result.csrfToken;
    syncMessagingSession();
    updateSignedInUI();
    dialog.close();
    authForm.reset();
    toast(`Welcome${currentUser.displayName ? `, ${currentUser.displayName}` : ''}.`);
    await loadFeed();
    if (authMode === 'register' && !currentUser.onboardingComplete) startOnboarding();
    if (returnTo === 'compose') composePost();
    else if (returnTo?.id || returnTo?.slug) {
      const pending = returnTo;
      if (pending.type === 'like' || pending.type === 'repost') {
        try { await api(`/posts/${pending.id}/${pending.type}`, { method: 'POST' }); toast(pending.type === 'like' ? 'Post liked.' : 'Post reposted.'); await loadFeed(); }
        catch (error) { toast(error.message); }
      } else if (pending.type === 'comment') {
        try { const detail = await api(`/posts/${pending.id}`); openComments(detail.post, null); }
        catch (error) { toast(error.message); }
      }
      else if (pending.type === 'game-interest') {
        try { await api(`/games/${pending.slug}/interest`, { method:'PUT',body:JSON.stringify({ interested:true }) }); currentUser.favoriteGames=[...new Set([...(currentUser.favoriteGames||[]),pending.slug])]; toast('Game added to your interests.'); loadGames(); }
        catch(error) { toast(error.message); }
      } else if (pending.type === 'join-community') {
        try { await api(`/communities/${pending.slug}/join`,{method:'POST'}); toast('You joined the community.'); loadCommunities(); }
        catch(error) { toast(error.message); }
      }
    }
    returnTo = null;
  } catch (error) {
    $('#auth-error').textContent = error.message;
  } finally {
    submit.disabled = false;
    submit.innerHTML = 'Continue';
  }
});

function updateSignedInUI() {
  $('#auth-open').setAttribute('aria-label', currentUser ? 'Sign out' : 'Sign in');
  $('#auth-open').title = currentUser ? 'Sign out' : 'Sign in';
  $('#auth-avatar').textContent = currentUser?.displayName?.[0]?.toUpperCase() || currentUser?.username?.[0]?.toUpperCase() || '?';
  $('#auth-avatar').setAttribute('aria-label', currentUser ? `Signed in as ${currentUser.username}` : 'Sign in to your profile');
  if ($('#comments-form')) { $('#comments-form').hidden = !currentUser; $('#comments-signin').hidden = Boolean(currentUser); }
  $('.avatar--composer').textContent = currentUser?.username?.[0]?.toUpperCase() || '?';
  $$('[data-action="signin"]').forEach((button) => {
    if (!button.dataset.originalLabel) button.dataset.originalLabel = button.textContent;
    if (currentUser) {
      const destination = button.closest('[data-panel]')?.dataset.panel || 'games';
      const labels = { games: 'Browse games', updates: 'View updates', groups: 'Explore groups', friends: 'Find players', profile: 'View profile' };
      button.textContent = labels[destination] || 'Explore games';
      button.removeAttribute('aria-disabled');
    }
    else { button.textContent = button.dataset.originalLabel; button.removeAttribute('aria-disabled'); }
  });
  if (currentUser) {
    $('#feed-state').hidden = true;
    $$('.sidebar, .welcome-card').forEach((el) => el.hidden = false);
  } else {
    $('#feed-state').hidden = false;
  }
  if (!$('#view-updates').hidden) loadUpdates();
}

async function restoreSession() {
  try {
    const result = await api('/auth/me');
    currentUser = result.user;
    csrfToken = result.csrfToken;
    syncMessagingSession();
    updateSignedInUI();
    if (currentUser && !currentUser.onboardingComplete) startOnboarding();
  } catch {
    // A guest can read public posts; an expired cookie simply leaves the guest view.
  }
  await loadFeed();
}


let feedCursor = null;
let activeFeed = 'for-you';
let feedLoading = false;
let feedObserver = null;
let feedGeneration = 0;

async function loadFeed(filter = activeFeed, cursor = null) {
  if (feedLoading) return;
  if (cursor && !feedCursor) return;

  const state = $('#feed-state');
  const list = $('#post-list');

  activeFeed = filter;

  const isInitialLoad = !cursor;

  if (isInitialLoad) {
    feedGeneration++;
    feedCursor = null;

    if (feedObserver) {
      feedObserver.disconnect();
      feedObserver = null;
    }

    state.hidden = false;
    state.innerHTML = '<img class="feed-empty-art" src="/assets/arcadia/empty-states/empty-posts.svg" alt=""/><h2>Finding your people…</h2><p>Loading the latest conversations.</p>';
    list.replaceChildren();
  }

  const generation = feedGeneration;

  let sentinel = $('#feed-load-more');

  if (!sentinel) {
    sentinel = document.createElement('div');
    sentinel.id = 'feed-load-more';
    sentinel.setAttribute('aria-live', 'polite');
    sentinel.className = 'feed-loading-sentinel';
    sentinel.innerHTML = '<span class="feed-loading-sentinel__text">Loading more posts…</span>';
    list.after(sentinel);
  }

  sentinel.hidden = true;

  feedLoading = true;

  try {
    const result = await api(
      `/posts?feed=${encodeURIComponent(filter)}&limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
    );

    if (generation !== feedGeneration) return;

    const items = result.items || [];

    list.append(...items.map(renderPost));

    feedCursor = result.nextCursor || null;

    if (!items.length && !cursor && result.unavailable) {
      state.innerHTML = '<img class="feed-empty-art" src="/assets/arcadia/empty-states/empty-posts.svg" alt=""/><h2>Friends feed is coming later</h2><p>Friend connections are part of the next approved phase.</p>';
      return;
    }

    if (!items.length && !cursor) {
      state.innerHTML = '<img class="feed-empty-art" src="/assets/arcadia/empty-states/empty-posts.svg" alt=""/><h2>Your circle starts here</h2><p>There are no public posts yet. Start a conversation when you’re ready.</p>';

      if (currentUser) {
        const button = document.createElement('button');
        button.className = 'button button--primary';
        button.type = 'button';
        button.textContent = 'Write a post';
        button.addEventListener('click', composePost);
        state.append(button);
      } else {
        const button = document.createElement('button');
        button.className = 'button button--primary';
        button.type = 'button';
        button.textContent = 'Join the circle';
        button.addEventListener('click', () => openAuth());
        state.append(button);
      }
    } else {
      state.hidden = list.children.length > 0;
    }

    if (feedCursor) {
      sentinel.hidden = false;
      sentinel.innerHTML = '<span class="feed-loading-sentinel__text">Scroll for more</span>';

      if (!feedObserver) {
        feedObserver = new IntersectionObserver((entries) => {
          if (
            entries.some((entry) => entry.isIntersecting) &&
            !feedLoading &&
            feedCursor
          ) {
            const nextCursor = feedCursor;
            loadFeed(activeFeed, nextCursor);
          }
        }, {
          root: null,
          rootMargin: '500px 0px',
          threshold: 0
        });

        feedObserver.observe(sentinel);
      }
    } else {
      sentinel.hidden = true;
      sentinel.innerHTML = '<span class="feed-loading-sentinel__text">You’re all caught up ✨</span>';

      if (feedObserver) {
        feedObserver.disconnect();
        feedObserver = null;
      }
    }
  } catch {
    if (generation !== feedGeneration) return;

    if (cursor) {
      sentinel.hidden = false;
      sentinel.innerHTML = '<button class="button button--primary" type="button">Couldn’t load more. Try again</button>';

      sentinel.querySelector('button').addEventListener('click', () => {
        if (!feedLoading && feedCursor) {
          loadFeed(activeFeed, feedCursor);
        }
      });
    } else {
      state.hidden = false;
      state.innerHTML = '<img class="feed-empty-art" src="/assets/arcadia/empty-states/empty-posts.svg" alt=""/><h2>Couldn’t load the feed</h2><p>Check your connection and try again.</p>';

      const retry = document.createElement('button');
      retry.className = 'button button--primary';
      retry.type = 'button';
      retry.textContent = 'Try again';
      retry.addEventListener('click', () => loadFeed(filter));
      state.append(retry);
    }
  } finally {
    if (generation === feedGeneration) {
      feedLoading = false;
    }
  }
}

function iconSvg(name) {
  const paths = {
    heart: '<path d="M20.8 8.7c0 4.3-8.8 10-8.8 10s-8.8-5.7-8.8-10A4.7 4.7 0 0 1 12 6.2a4.7 4.7 0 0 1 8.8 2.5Z"/>',
    comment: '<path d="M20.5 11.7a8.2 8.2 0 0 1-8.5 7.8 9 9 0 0 1-3.4-.7L4 20l1.2-4a7.2 7.2 0 0 1-2.2-5.1A8.1 8.1 0 0 1 11.5 3h.5a8.2 8.2 0 0 1 8.5 8.2v.5Z"/>',
    repost: '<path d="m17 1 4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    share: '<path d="M12 16V3m-5 5 5-5 5 5"/><path d="M5 13v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/>'
  };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.innerHTML = paths[name];
  return svg;
}

function renderPost(post) {
  const article = document.createElement('article');
  article.className = 'post-card glass-panel';
  article.id = `post-${post._id}`;
  article.dataset.postId = post._id;

  // Post header
  const header = document.createElement('div');
  header.className = 'post-card__head';

  const avatar = document.createElement('span');
  avatar.className = 'avatar post-avatar';
  avatar.textContent = (
    post.author?.displayName ||
    post.author?.username ||
    '?'
  )[0].toUpperCase();

  if (post.author?.avatar) {
    avatar.classList.add(post.author.avatar);
  }

  const meta = document.createElement('div');
  meta.className = 'post-meta';

  const name = document.createElement('strong');
  name.textContent =
    post.author?.displayName ||
    post.author?.username ||
    'Player';

  name.tabIndex = 0;
  name.setAttribute('role', 'link');

  name.addEventListener('click', () => {
    selectView('profile');
    void renderProfile(post.author?.username);
  });

  name.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      name.click();
    }
  });

  const handle = document.createElement('span');

  handle.textContent =
    `@${post.author?.username || 'player'} · ` +
    new Date(post.createdAt).toLocaleDateString();

  meta.append(name, handle);
  header.append(avatar, meta);

  // Game and community destination tags
  for (const destination of post.destinations || []) {
    if (
      destination.type === 'game' ||
      destination.type === 'community'
    ) {
      const tag = document.createElement('span');

      tag.className =
        destination.type === 'game'
          ? 'game-pill'
          : 'community-pill';

      tag.textContent =
        `${destination.type === 'game' ? 'Game' : 'Group'} · ` +
        destination.target;

      header.append(tag);
    }
  }

  // Post text
  let body = null;

  if (typeof post.body === 'string' && post.body.trim()) {
    body = document.createElement('p');
    body.className = 'post-card__body';
    body.textContent = post.body;
  }

  // Uploaded images
  let mediaGallery = null;

  const images = Array.isArray(post.media)
    ? post.media.filter(
        (item) =>
          item &&
          item.type === 'image' &&
          typeof item.url === 'string' &&
          /^https:\/\//i.test(item.url)
      )
    : [];

  if (images.length) {
    mediaGallery = document.createElement('div');
    mediaGallery.className = 'post-media';

    if (images.length > 1) {
      mediaGallery.classList.add('post-media--multiple');
    }

    images.forEach((image, index) => {
      const imageLink = document.createElement('a');

      imageLink.className = 'post-media__item';
      imageLink.href = image.url;
      imageLink.target = '_blank';
      imageLink.rel = 'noopener noreferrer';
      imageLink.setAttribute(
        'aria-label',
        `Open post image ${index + 1} in a new tab`
      );

      const img = document.createElement('img');

      img.className = 'post-media__image';
      img.src = image.url;
      img.alt =
        post.body?.trim()
          ? `Image attached to post: ${post.body.trim().slice(0, 120)}`
          : `Image attached to post by ${post.author?.displayName || post.author?.username || 'Player'}`;

      img.loading = 'lazy';
      img.decoding = 'async';

      if (
        Number.isFinite(image.width) &&
        image.width > 0 &&
        Number.isFinite(image.height) &&
        image.height > 0
      ) {
        img.width = image.width;
        img.height = image.height;
      }

      img.addEventListener('error', () => {
        imageLink.classList.add('post-media__item--error');
        img.alt = 'Image unavailable';
      }, { once: true });

      imageLink.append(img);
      mediaGallery.append(imageLink);
    });
  }

  // Engagement summary
  const summary = document.createElement('div');
  summary.className = 'comments-summary';

  const heartSummary = document.createElement('span');
  heartSummary.className = 'summary-heart';
  heartSummary.append(iconSvg('heart'));

  const likeSummary = document.createElement('span');
  likeSummary.textContent = String(post.likeCount || 0);

  const divider = document.createElement('span');
  divider.textContent = '·';
  divider.setAttribute('aria-hidden', 'true');

  const commentSummary = document.createElement('button');
  commentSummary.type = 'button';

  commentSummary.textContent =
    `${post.commentCount || 0} ` +
    `${post.commentCount === 1 ? 'comment' : 'comments'}`;

  commentSummary.setAttribute(
    'aria-label',
    `View ${post.commentCount || 0} comments`
  );

  summary.append(
    heartSummary,
    likeSummary,
    divider,
    commentSummary
  );

  // Post action buttons
  const actions = document.createElement('div');
  actions.className = 'post-actions';

  const makeButton = (name, label, count = null) => {
    const button = document.createElement('button');

    button.type = 'button';
    button.dataset.actionName = name;
    button.setAttribute('aria-label', label);
    button.append(iconSvg(name));

    if (count !== null) {
      const number = document.createElement('span');

      number.className = 'action-count';
      number.textContent = String(count);

      button.append(number);
    }

    const text = document.createElement('span');

    text.className = 'action-label';
    text.textContent = label;

    button.append(text);

    return button;
  };

  const likeButton = makeButton(
    'heart',
    'Like',
    post.likeCount || 0
  );

  likeButton.setAttribute(
    'aria-pressed',
    String(post.liked === true)
  );

  const commentButton = makeButton(
    'comment',
    'Comments',
    post.commentCount || 0
  );

  const repostButton = makeButton(
    'repost',
    'Repost',
    post.repostCount || 0
  );

  repostButton.setAttribute(
    'aria-pressed',
    String(post.reposted === true)
  );

  const shareButton = makeButton('share', 'Share');

  const updateCount = (button, value) => {
    const counter = $('.action-count', button);

    if (counter) {
      counter.textContent = String(value);
    }
  };

  const updateComments = (value) => {
    post.commentCount = value;

    updateCount(commentButton, value);

    commentSummary.textContent =
      `${value} ${value === 1 ? 'comment' : 'comments'}`;

    commentSummary.setAttribute(
      'aria-label',
      `View ${value} comments`
    );
  };

  const updateLikes = (value) => {
    post.likeCount = value;

    updateCount(likeButton, value);
    likeSummary.textContent = String(value);
  };

  const showComments = () => {
    openComments(post, document.activeElement);
  };

  commentButton.addEventListener('click', showComments);
  commentSummary.addEventListener('click', showComments);

  // Like
  likeButton.addEventListener('click', async () => {
    if (!currentUser) {
      return openAuth({
        type: 'like',
        id: post._id,
      });
    }

    const was =
      likeButton.getAttribute('aria-pressed') === 'true';

    const previous = Number(post.likeCount || 0);

    const next = Math.max(
      0,
      previous + (was ? -1 : 1)
    );

    likeButton.setAttribute(
      'aria-pressed',
      String(!was)
    );

    updateLikes(next);

    likeButton.classList.toggle('is-pop', !was);

    window.setTimeout(() => {
      likeButton.classList.remove('is-pop');
    }, 320);

    likeButton.disabled = true;

    try {
      const result = await api(
        `/posts/${post._id}/like`,
        {
          method: was ? 'DELETE' : 'POST',
        }
      );

      likeButton.setAttribute(
        'aria-pressed',
        String(result.liked)
      );

      updateLikes(result.likeCount);
    } catch (error) {
      likeButton.setAttribute(
        'aria-pressed',
        String(was)
      );

      updateLikes(previous);
      toast(error.message);
    } finally {
      likeButton.disabled = false;
    }
  });

  // Repost
  repostButton.addEventListener('click', async () => {
    if (!currentUser) {
      return openAuth({
        type: 'repost',
        id: post._id,
      });
    }

    const was =
      repostButton.getAttribute('aria-pressed') === 'true';

    const previous = Number(post.repostCount || 0);

    updateCount(
      repostButton,
      Math.max(0, previous + (was ? -1 : 1))
    );

    repostButton.setAttribute(
      'aria-pressed',
      String(!was)
    );

    repostButton.disabled = true;

    try {
      const result = await api(
        `/posts/${post._id}/repost`,
        {
          method: was ? 'DELETE' : 'POST',
        }
      );

      post.repostCount = result.repostCount;

      updateCount(repostButton, result.repostCount);

      repostButton.setAttribute(
        'aria-pressed',
        String(result.reposted)
      );

      toast(
        result.reposted
          ? 'Reposted to your circle.'
          : 'Repost removed.'
      );
    } catch (error) {
      repostButton.setAttribute(
        'aria-pressed',
        String(was)
      );

      post.repostCount = previous;
      updateCount(repostButton, previous);

      toast(error.message);
    } finally {
      repostButton.disabled = false;
    }
  });

  // Share
  shareButton.addEventListener('click', async () => {
    const link = new URL(location.href);

    link.hash = `post/${post._id}`;

    try {
      await navigator.clipboard.writeText(link.toString());
      toast('Post link copied.');
    } catch {
      toast('Could not copy the post link.');
    }
  });

  actions.append(
    likeButton,
    commentButton,
    repostButton,
    shareButton
  );

  // Assemble the post in reading order.
  article.append(header);

  if (body) {
    article.append(body);
  }

  if (mediaGallery) {
    article.append(mediaGallery);
  }

  article.append(summary, actions);

  article._updateComments = updateComments;

  return article;
}

const commentsDialog = $('#comments-dialog');
let activeCommentsPost = null;
let commentsReturnFocus = null;
let commentsHashPushed = false;
let commentsLoadGeneration = 0;
let commentsTouchStart = null;

function commentTime(item) {
  const time = document.createElement('time');
  const date = new Date(item.createdAt || item.updatedAt || Date.now());
  time.dateTime = date.toISOString(); time.textContent = date.toLocaleDateString();
  return time;
}

function discussionComment(item, onReply) {
  const row = document.createElement('article'); row.className = 'discussion-comment'; row.dataset.commentId = String(item._id || '');
  if (item.parent) row.classList.add('is-reply');
  const avatar = document.createElement('span'); avatar.className = 'discussion-avatar';
  avatar.textContent = (item.author?.displayName || item.author?.username || '?')[0].toUpperCase();
  if (item.author?.avatar) avatar.classList.add(item.author.avatar);
  const content = document.createElement('div'); content.className = 'discussion-main';
  const meta = document.createElement('div'); meta.className = 'discussion-meta';
  const author = document.createElement('strong'); author.textContent = item.author?.displayName || item.author?.username || 'Player';
  meta.append(author, commentTime(item));
  const body = document.createElement('p'); body.className = 'discussion-text'; body.textContent = item.body;
  content.append(meta, body);
  if (!item.parent && currentUser && onReply) {
    const reply = document.createElement('button'); reply.className = 'text-button'; reply.type = 'button'; reply.textContent = 'Reply'; reply.addEventListener('click', () => onReply(item, row)); content.append(reply);
  }
  row.append(avatar, content);
  return row;
}

function setCommentSkeletons() {
  const list = $('#comments-list'); list.replaceChildren();
  for (let i = 0; i < 4; i++) { const skeleton = document.createElement('div'); skeleton.className = 'comment-skeleton'; skeleton.setAttribute('aria-hidden', 'true'); list.append(skeleton); }
}

function setCommentsError(error, retry) {
  const host = $('#comments-error'); host.hidden = false; host.replaceChildren(document.createTextNode(error.message || 'Could not load comments.'));
  const button = document.createElement('button'); button.className = 'button'; button.type = 'button'; button.textContent = 'Retry'; button.addEventListener('click', retry); host.append(button);
}

function renderDiscussion(items) {
  const list = $('#comments-list'); list.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('div'); empty.className = 'comments-empty';
    const image = document.createElement('img'); image.src = '/assets/arcadia/empty-states/empty-posts.svg'; image.alt = '';
    const copy = document.createElement('p'); copy.textContent = 'No comments yet. Start the conversation.'; empty.append(image, copy); list.append(empty); return;
  }
  const roots = new Map(); const replies = new Map();
  for (const item of items) {
    if (item.parent) { const parentId = String(item.parent?._id || item.parent); const bucket = replies.get(parentId) || []; bucket.push(item); replies.set(parentId, bucket); }
    else roots.set(String(item._id), item);
  }
  for (const item of roots.values()) {
    const root = discussionComment(item, (parent, anchor) => openReplyComposer(parent, anchor)); list.append(root);
    const children = replies.get(String(item._id)) || [];
    if (children.length) { const group = document.createElement('div'); group.className = 'discussion-replies'; for (const child of children) group.append(discussionComment(child)); list.append(group); }
  }
}

async function loadDiscussion(post, generation = commentsLoadGeneration) {
  $('#comments-error').hidden = true; setCommentSkeletons();
  try {
    const data = await api(`/posts/${post._id}/comments?limit=50`);
    if (generation !== commentsLoadGeneration || !commentsDialog.open) return;
    renderDiscussion(data.items || []);
  } catch (error) {
    if (generation !== commentsLoadGeneration) return;
    $('#comments-list').replaceChildren(); setCommentsError(error, () => loadDiscussion(post, generation));
  }
}

function openComments(post, trigger = document.activeElement, options = {}) {
  if (!post?._id) return;
  const id = String(post._id);
  if (commentsDialog.open && String(activeCommentsPost?._id) === id) return;
  activeCommentsPost = post; commentsReturnFocus = trigger instanceof HTMLElement ? trigger : null; commentsLoadGeneration++;
  const author = post.author?.displayName || post.author?.username || 'Player';
  $('.comments-title-desktop').textContent = `${author}’s post`;
  const postHost = $('#comments-post'); postHost.replaceChildren();
  const authorLine = document.createElement('strong'); authorLine.textContent = author;
  const text = document.createElement('p'); text.textContent = post.body || '';
  postHost.append(authorLine, text);
  $('#comments-form').hidden = !currentUser; $('#comments-signin').hidden = Boolean(currentUser);
  $('#comments-error').hidden = true;
  if (options.updateHash !== false && location.hash !== `#post/${id}`) {
    history.pushState({ ...(history.state || {}), arcadiaComments: id }, '', `#post/${id}`); commentsHashPushed = true;
  } else commentsHashPushed = false;
  if (!commentsDialog.open) commentsDialog.showModal();
  document.body.classList.add('comments-open');
  loadDiscussion(post);
  if (currentUser) window.setTimeout(() => $('#comments-input').focus(), 40);
}

function closeCommentsNow({ clearHash = true } = {}) {
  if (!commentsDialog.open) return;
  commentsDialog.close(); document.body.classList.remove('comments-open'); activeCommentsPost = null; commentsLoadGeneration++;
  if (clearHash && /^#post\/[a-f\d]{24}$/i.test(location.hash)) history.replaceState(history.state, '', `${location.pathname}${location.search}`);
  const target = commentsReturnFocus; commentsReturnFocus = null;
  if (target?.isConnected) window.setTimeout(() => target.focus(), 0);
}

function requestCommentsClose() {
  if (commentsHashPushed && /^#post\/[a-f\d]{24}$/i.test(location.hash)) { commentsHashPushed = false; history.back(); return; }
  closeCommentsNow();
}

async function syncCommentsRoute() {
  const match = location.hash.match(/^#post\/([a-f\d]{24})$/i);
  if (!match) { if (commentsDialog.open) closeCommentsNow({ clearHash: false }); return; }
  if (commentsDialog.open && String(activeCommentsPost?._id) === match[1]) return;
  try { const result = await api(`/posts/${match[1]}`); openComments(result.post, null, { updateHash: false }); }
  catch { history.replaceState(history.state, '', `${location.pathname}${location.search}`); toast('That post is unavailable.'); }
}

async function openReplyComposer(parent, anchor) {
  if ($('.comment-reply-form', $('#comments-list'))) return;
  const form = document.createElement('form'); form.className = 'comment-reply-form';
  const input = document.createElement('input'); input.required = true; input.maxLength = 1000; input.placeholder = 'Write a reply'; input.setAttribute('aria-label', 'Write a reply');
  const send = document.createElement('button'); send.type = 'submit'; send.className = 'button button--primary'; send.textContent = 'Reply'; form.append(input, send); anchor.after(form); input.focus();
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); if (!activeCommentsPost) return; send.disabled = true;
    const temp = { _id: `pending-${Date.now()}`, parent: parent._id, body: input.value, createdAt: new Date().toISOString(), author: currentUser };
    const row = discussionComment(temp); row.classList.add('is-pending'); form.after(row);
    try { const result = await api(`/posts/${activeCommentsPost._id}/comments`, { method: 'POST', body: JSON.stringify({ body: input.value, parent: parent._id }) }); row.replaceWith(discussionComment(result.comment)); activeCommentsPost.commentCount = (activeCommentsPost.commentCount || 0) + 1; document.querySelector(`#post-${activeCommentsPost._id}`)?._updateComments?.(activeCommentsPost.commentCount); form.remove(); }
    catch (error) { row.remove(); send.disabled = false; setCommentsError(error, () => form.requestSubmit()); }
  });
}

$('#comments-close').addEventListener('click', requestCommentsClose);
$('#comments-signin').addEventListener('click', () => openAuth({ type: 'comment', id: activeCommentsPost?._id }));
commentsDialog.addEventListener('click', (event) => { if (event.target === commentsDialog) requestCommentsClose(); });
commentsDialog.addEventListener('cancel', (event) => { event.preventDefault(); requestCommentsClose(); });
commentsDialog.addEventListener('close', () => { document.body.classList.remove('comments-open'); });
$('#comments-form').addEventListener('submit', async (event) => {
  event.preventDefault(); if (!activeCommentsPost) return;
  const commentsForm = event.currentTarget;
  const input = $('#comments-input'); const send = $('button[type="submit"]', commentsForm); const body = input.value.trim(); if (!body) return;
  send.disabled = true; const temp = { _id: `pending-${Date.now()}`, body, createdAt: new Date().toISOString(), author: currentUser };
  const pending = discussionComment(temp, (parent, anchor) => openReplyComposer(parent, anchor)); pending.classList.add('is-pending'); $('#comments-list').append(pending); $('#comments-list').scrollTop = $('#comments-list').scrollHeight;
  try { const result = await api(`/posts/${activeCommentsPost._id}/comments`, { method: 'POST', body: JSON.stringify({ body }) }); pending.replaceWith(discussionComment(result.comment, (parent, anchor) => openReplyComposer(parent, anchor))); activeCommentsPost.commentCount = (activeCommentsPost.commentCount || 0) + 1; document.querySelector(`#post-${activeCommentsPost._id}`)?._updateComments?.(activeCommentsPost.commentCount); input.value = ''; $('#comments-error').hidden = true; }
  catch (error) { pending.remove(); setCommentsError(error, () => commentsForm.requestSubmit()); }
  finally { send.disabled = false; }
});
const commentsHandle = $('.comments-drag-handle');
commentsHandle.addEventListener('touchstart', (event) => { commentsTouchStart = event.touches[0].clientY; }, { passive: true });
commentsHandle.addEventListener('touchend', (event) => { if (commentsTouchStart !== null && event.changedTouches[0].clientY - commentsTouchStart > 75) requestCommentsClose(); commentsTouchStart = null; }, { passive: true });
window.visualViewport?.addEventListener('resize', () => { document.documentElement.style.setProperty('--visual-vh', `${window.visualViewport.height}px`); document.documentElement.style.setProperty('--keyboard-inset', `${Math.max(0, window.innerHeight - window.visualViewport.height)}px`); });
window.addEventListener('popstate', syncCommentsRoute); window.addEventListener('hashchange', syncCommentsRoute);
if (/^#post\/[a-f\d]{24}$/i.test(location.hash)) window.setTimeout(syncCommentsRoute, 0);

function renderComment(item){const line=document.createElement('div');line.className='comment-line';const author=document.createElement('strong');author.textContent=`@${item.author?.username||'player'} `;const body=document.createElement('span');body.textContent=item.body;line.append(author,body);return line;}
function addReplyForm(postId,parentId,anchor){if($('.reply-form',anchor.parentElement))return;const form=document.createElement('form');form.className='comment-form reply-form';const input=document.createElement('input');input.maxLength=1000;input.required=true;input.placeholder='Write a reply';const submit=document.createElement('button');submit.type='submit';submit.textContent='Reply';form.append(input,submit);form.addEventListener('submit',async(event)=>{event.preventDefault();submit.disabled=true;try{const result=await api(`/posts/${postId}/comments`,{method:'POST',body:JSON.stringify({body:input.value,parent:parentId})});const line=renderComment(result.comment);line.classList.add('comment-reply');form.after(line);form.remove();toast('Reply added.');}catch(error){toast(error.message);submit.disabled=false;}});anchor.after(form);input.focus();}
function createOwnerTools(slug){const form=document.createElement('form');form.className='community-owner-tools glass-panel';const title=document.createElement('h3');title.textContent='Manage moderators';const username=document.createElement('input');username.placeholder='Member username';username.pattern='[A-Za-z0-9_]{3,24}';username.required=true;username.setAttribute('aria-label','Member username');const role=document.createElement('select');role.setAttribute('aria-label','Member role');for(const value of ['moderator','member']){const option=document.createElement('option');option.value=value;option.textContent=value==='moderator'?'Make moderator':'Make member';role.append(option);}const submit=document.createElement('button');submit.className='button';submit.type='submit';submit.textContent='Update role';form.append(title,username,role,submit);form.addEventListener('submit',async(event)=>{event.preventDefault();submit.disabled=true;try{await api(`/communities/${slug}/members/${encodeURIComponent(username.value)}/role`,{method:'PATCH',body:JSON.stringify({role:role.value})});toast('Member role updated.');}catch(error){toast(error.message);}finally{submit.disabled=false;}});return form;}
async function openPostDetail(postId){let modal=$('#post-detail-dialog');if(!modal){modal=document.createElement('dialog');modal.id='post-detail-dialog';modal.className='auth-dialog glass-panel';document.body.append(modal);}modal.replaceChildren();const title=document.createElement('h2');title.textContent='Post discussion';const loading=document.createElement('p');loading.textContent='Loading conversation…';modal.append(title,loading);if(!modal.open)modal.showModal();try{const data=await api(`/posts/${postId}`);modal.replaceChildren(title);const body=document.createElement('p');body.className='post-card__body';body.textContent=data.post.body;modal.append(body);const list=document.createElement('div');list.className='post-comments';for(const comment of data.comments){const line=renderComment(comment);if(comment.parent)line.classList.add('comment-reply');list.append(line);if(currentUser&&!comment.parent){const reply=document.createElement('button');reply.className='text-button';reply.type='button';reply.textContent='Reply';reply.addEventListener('click',()=>addReplyForm(postId,comment._id,line));line.append(reply);}}modal.append(list);if(currentUser){const form=document.createElement('form');form.className='comment-form';const input=document.createElement('input');input.required=true;input.maxLength=1000;input.placeholder='Add to the conversation';const send=document.createElement('button');send.type='submit';send.textContent='Comment';form.append(input,send);form.addEventListener('submit',async(event)=>{event.preventDefault();send.disabled=true;try{const result=await api(`/posts/${postId}/comments`,{method:'POST',body:JSON.stringify({body:input.value})});list.append(renderComment(result.comment));input.value='';toast('Comment added.');}catch(error){toast(error.message);}finally{send.disabled=false;}});modal.append(form);}else{const signIn=document.createElement('button');signIn.type='button';signIn.className='button button--primary';signIn.textContent='Sign in to comment';signIn.addEventListener('click',()=>{modal.close();openAuth({type:'comment',id:postId});});modal.append(signIn);}}catch(error){loading.textContent=error.message;}}

let gamesLoaded = false;
async function loadGames(search = '') {
  const host = $('#view-games .section-placeholder');
  if (!host) return;
  host.className = 'catalog-view';
  if (!gamesLoaded) host.innerHTML = '<div class="catalog-toolbar"><label class="sr-only" for="game-search">Search games</label><input id="game-search" type="search" placeholder="Search games…" /><span>CATALOG</span></div><div class="catalog-grid" id="game-grid"></div>';
  gamesLoaded = true;
  const grid = $('#game-grid', host);
  grid.innerHTML = '<p class="catalog-message">Loading games…</p>';
  try {
    const result = await api(`/games?limit=50${search ? `&q=${encodeURIComponent(search)}` : ''}`);
    grid.replaceChildren();
    if (!result.items.length) { grid.innerHTML = '<p class="catalog-message">No games found. Try another search.</p>'; return; }
    for (const game of result.items) {
      const card = document.createElement('article'); card.className = 'game-card glass-panel'; card.style.setProperty('--game-accent', game.accent || '#8b7df6');
      const monogram = document.createElement('span'); monogram.className = 'game-monogram'; monogram.textContent = game.name.split(/\s+/).map((word) => word[0]).slice(0,2).join('').toUpperCase();
      const name = document.createElement('h2'); name.textContent = game.name;
      const desc = document.createElement('p'); desc.textContent = game.genres.join(' · ');
      const follow = document.createElement('button'); follow.className = 'game-follow'; follow.type = 'button';
      let followed = currentUser?.favoriteGames?.includes(game.slug) || false;
      follow.textContent = followed ? 'Following' : '+ Follow';
      follow.setAttribute('aria-pressed', String(followed));
      follow.addEventListener('click', async () => {
        if (!currentUser) return openAuth({ type:'game-interest',slug:game.slug });
        follow.disabled = true;
        try { const data = await api(`/games/${game.slug}/interest`, { method:'PUT',body:JSON.stringify({ interested:!followed }) }); followed = data.interested; follow.textContent = followed ? 'Following' : '+ Follow'; follow.setAttribute('aria-pressed',String(followed)); currentUser.favoriteGames = currentUser.favoriteGames || []; currentUser.favoriteGames = followed ? [...new Set([...currentUser.favoriteGames,game.slug])] : currentUser.favoriteGames.filter((slug)=>slug!==game.slug); toast(followed ? `${game.name} added to your games.` : `${game.name} removed from your games.`); }
        catch(error) { toast(error.message); }
        finally { follow.disabled = false; }
      });
      card.append(monogram,name,desc,follow); grid.append(card);
    }
    $('#game-search',host).oninput = (event) => { window.clearTimeout(loadGames.timer); loadGames.timer = window.setTimeout(() => loadGames(event.target.value.trim()),250); };
  } catch(error) { grid.innerHTML = ''; const message=document.createElement('p'); message.className='catalog-message'; message.textContent=error.message; grid.append(message); }
}

let communitiesLoaded = false;
async function loadCommunities(search = '') {
  const host = $('#view-groups .section-placeholder');
  if (!host) return;
  host.className = 'catalog-view';
  if (!communitiesLoaded) host.innerHTML = '<div class="catalog-toolbar"><label class="sr-only" for="community-search">Search communities</label><input id="community-search" type="search" placeholder="Search communities…" /><span>DISCOVER</span></div><div class="catalog-grid" id="community-grid"></div>';
  communitiesLoaded = true;
  const grid=$('#community-grid',host); grid.innerHTML='<p class="catalog-message">Finding your communities…</p>';
  try {
    const result=await api(`/communities?limit=50${search?`&q=${encodeURIComponent(search)}`:''}`);
    grid.replaceChildren();
    if (!result.items.length) { grid.innerHTML='<p class="catalog-message">No communities found.</p>'; return; }
    for (const community of result.items) {
      const card=document.createElement('article');card.className='community-card glass-panel';card.style.setProperty('--game-accent',community.accent||'#68d6bd');
      const icon=document.createElement('span');icon.className='community-icon';icon.textContent=community.name.split(/\s+/).map((word)=>word[0]).slice(0,2).join('').toUpperCase();
      const name=document.createElement('h2');name.textContent=community.name;
      const desc=document.createElement('p');desc.textContent=community.description;
      const count=document.createElement('span');count.className='community-count';count.textContent=`${community.memberCount||0} members`;
      const join=document.createElement('button');join.className='game-follow';join.type='button';join.textContent='Join group';
      join.addEventListener('click',async()=>{if(!currentUser)return openAuth({type:'join-community',slug:community.slug});join.disabled=true;try{const data=await api(`/communities/${community.slug}/join`,{method:'POST'});join.textContent='Joined';count.textContent=`${data.memberCount} members`;toast(`You joined ${community.name}.`);}catch(error){toast(error.message);}finally{join.disabled=false;}});
      const view=document.createElement('button');view.className='text-button';view.type='button';view.textContent='Open community';view.addEventListener('click',()=>openCommunity(community.slug));
      card.append(icon,name,desc,count,join,view);grid.append(card);
    }
    $('#community-search',host).oninput=(event)=>{window.clearTimeout(loadCommunities.timer);loadCommunities.timer=window.setTimeout(()=>loadCommunities(event.target.value.trim()),250);};
  } catch(error) { grid.replaceChildren();const message=document.createElement('p');message.className='catalog-message';message.textContent=error.message;grid.append(message); }
}

async function openCommunity(slug){
  selectedCommunity=null;const host=$('#view-groups .section-placeholder');if(!host)return;host.className='community-detail';host.replaceChildren();const back=document.createElement('button');back.className='text-button';back.type='button';back.textContent='← All groups';back.addEventListener('click',()=>{communitiesLoaded=false;selectedCommunity=null;loadCommunities();});host.append(back);const heading=document.createElement('h2');heading.textContent='Loading community…';host.append(heading);const details=document.createElement('div');details.className='glass-panel community-rules';host.append(details);const feed=document.createElement('div');feed.className='post-list';host.append(feed);
  try{const data=await api(`/communities/${encodeURIComponent(slug)}/posts?limit=20`);const community=data.community;heading.textContent=community.name;details.replaceChildren();const description=document.createElement('p');description.textContent=community.description;const rulesTitle=document.createElement('h3');rulesTitle.textContent='Community rules';const rules=document.createElement('ul');for(const text of community.rules||[]){const item=document.createElement('li');item.textContent=text;rules.append(item);}details.append(description,rulesTitle,rules);if(data.role){const leave=document.createElement('button');leave.className='button';leave.type='button';leave.textContent=data.role==='owner'?'Owner':'Leave community';leave.disabled=data.role==='owner';leave.addEventListener('click',async()=>{leave.disabled=true;try{await api(`/communities/${slug}/join`,{method:'DELETE'});toast('You left the community.');await openCommunity(slug);}catch(error){toast(error.message);leave.disabled=false;}});host.insertBefore(leave,feed);}const compose=document.createElement('button');compose.className='button button--primary';compose.type='button';compose.textContent=data.role?'Post to this community':'Join to take part';compose.addEventListener('click',async()=>{if(!currentUser){openAuth({type:'community',slug});return;}if(!data.role){compose.disabled=true;try{await api(`/communities/${slug}/join`,{method:'POST'});toast('You joined the community.');await openCommunity(slug);}catch(error){toast(error.message);compose.disabled=false;}return;}selectedCommunity={slug,name:community.name};composePost();});host.insertBefore(compose,feed);if(data.role==='owner')host.insertBefore(createOwnerTools(slug),feed);for(const post of data.items){const card=renderPost(post);if(['owner','moderator'].includes(data.role)){const remove=document.createElement('button');remove.className='text-button';remove.type='button';remove.textContent='Remove post';remove.addEventListener('click',async()=>{remove.disabled=true;try{await api(`/communities/${slug}/posts/${post._id}`,{method:'DELETE'});card.remove();toast('Post removed from this community.');}catch(error){toast(error.message);remove.disabled=false;}});card.append(remove);}feed.append(card);}if(!data.items.length){const empty=document.createElement('p');empty.className='catalog-message';empty.textContent='No posts here yet. Start the conversation.';feed.append(empty);}}catch(error){details.textContent=error.message;}
}

async function loadUpdates() {
  const host=$('#view-updates .section-placeholder');
  if (!host) return;
  host.className='updates-view';host.replaceChildren();
  const heading=document.createElement('div');heading.className='updates-heading';
  const label=document.createElement('span');label.textContent='PLAYER DISCUSSIONS · NOT OFFICIAL ANNOUNCEMENTS';heading.append(label);host.append(heading);
  if (!currentUser) {
    const note=document.createElement('p');note.className='catalog-message';note.textContent='Sign in to follow games and see their community updates.';host.append(note);return;
  }
  const slugs=(currentUser.favoriteGames||[]).slice(0,20);
  if (!slugs.length) {
    const note=document.createElement('p');note.className='catalog-message';note.textContent='Follow a game to see player posts and update discussions here.';
    const explore=document.createElement('button');explore.className='button button--primary';explore.type='button';explore.textContent='Explore games';explore.addEventListener('click',()=>selectView('games'));host.append(note,explore);return;
  }
  const toolbar=document.createElement('div');toolbar.className='updates-toolbar';const filter=document.createElement('select');filter.setAttribute('aria-label','Filter game updates');const all=document.createElement('option');all.value='all';all.textContent='All followed games';filter.append(all);const list=document.createElement('div');list.className='updates-posts';list.textContent='Loading game conversations…';host.append(toolbar,list);
  try {
    const [pages,catalog]=await Promise.all([Promise.all(slugs.map((slug)=>api(`/posts?game=${encodeURIComponent(slug)}&limit=10`).catch(()=>({items:[]})))),api('/games?limit=50').catch(()=>({items:[]}))]);
    const gameNames=new Map(catalog.items.map((game)=>[game.slug,game.name]));for(const slug of slugs){const option=document.createElement('option');option.value=slug;option.textContent=gameNames.get(slug)||slug;filter.append(option);}toolbar.append(filter);
    const postsByGame=new Map();for(let index=0;index<slugs.length;index++)for(const post of pages[index].items||[]){if(![...postsByGame.values()].some((items)=>items.some((entry)=>entry._id===post._id))){const selected=post.destinations?.find((destination)=>destination.type==='game'&&slugs.includes(destination.target))?.target||slugs[index];if(!postsByGame.has(selected))postsByGame.set(selected,[]);postsByGame.get(selected).push(post);}}
    const renderGroups=()=>{list.replaceChildren();const chosen=filter.value;const groups=chosen==='all'?slugs.filter((slug)=>postsByGame.has(slug)):[chosen].filter((slug)=>postsByGame.has(slug));if(!groups.length){const note=document.createElement('p');note.className='catalog-message';note.textContent='No player conversations yet for this game.';list.append(note);return;}for(const slug of groups){const section=document.createElement('section');section.className='updates-game-group';const title=document.createElement('h2');title.textContent=gameNames.get(slug)||slug;section.append(title);for(const post of postsByGame.get(slug))section.append(renderPost(post));list.append(section);}};
    filter.addEventListener('change',renderGroups);renderGroups();
  } catch(error) { list.replaceChildren();const note=document.createElement('p');note.className='catalog-message';note.textContent=error.message;list.append(note); }
}

function startOnboarding() {
  let dialogNode = $('#onboarding-dialog');

  if (!dialogNode) {
    dialogNode = document.createElement('dialog');
    dialogNode.id = 'onboarding-dialog';
    dialogNode.className = 'auth-dialog glass-panel';
    dialogNode.setAttribute('aria-labelledby', 'onboarding-title');
    document.body.append(dialogNode);
  }

  const state = {
    step: 2,
    genres: [...(currentUser.genres || [])],
    games: [...(currentUser.favoriteGames || [])],
    displayName: currentUser.displayName || '',
    bio: currentUser.bio || '',
    avatar: currentUser.avatar || 'gradient-violet',
    photo: null,
    previewUrl: null,
  };

  const genreOptions = [
    ['sports', 'Sports & football'],
    ['fps', 'FPS & tactical shooters'],
    ['rpg', 'RPG & action RPG'],
    ['battle-royale', 'Battle royale'],
    ['racing', 'Racing'],
    ['strategy', 'Strategy'],
    ['fighting', 'Fighting'],
    ['simulation', 'Simulation'],
    ['adventure', 'Adventure'],
    ['party', 'Casual & party'],
  ];

  const gradientAvatars = [
    'gradient-violet',
    'gradient-cyan',
    'gradient-amber',
    'gradient-emerald',
    'gradient-pink',
  ];

  function clearPhotoPreview() {
    if (state.previewUrl) {
      URL.revokeObjectURL(state.previewUrl);
      state.previewUrl = null;
    }
  }

  function getInitial() {
    return (
      state.displayName.trim().charAt(0) ||
      currentUser.username?.charAt(0) ||
      '?'
    ).toUpperCase();
  }

  function createAvatarPreview() {
    const preview = document.createElement('div');
    preview.className = 'onboarding-avatar-preview';

    if (state.previewUrl) {
      const image = document.createElement('img');
      image.src = state.previewUrl;
      image.alt = 'Selected profile picture preview';
      preview.append(image);
    } else if (
      typeof state.avatar === 'string' &&
      /^https:\/\//i.test(state.avatar)
    ) {
      const image = document.createElement('img');
      image.src = state.avatar;
      image.alt = 'Current profile picture';
      preview.append(image);
    } else {
      const gradient = gradientAvatars.includes(state.avatar)
        ? state.avatar
        : 'gradient-violet';

      preview.classList.add(gradient);
      preview.textContent = getInitial();
    }

    return preview;
  }

  function cleanup() {
    clearPhotoPreview();
  }

  const render = () => {
    dialogNode.replaceChildren();

    const close = document.createElement('button');
    close.className = 'dialog-close';
    close.type = 'button';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Close onboarding');
    close.addEventListener('click', () => dialogNode.close());

    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = `PLAYER SETUP · STEP ${state.step - 1} OF 4`;

    const title = document.createElement('h2');
    title.id = 'onboarding-title';

    const content = document.createElement('div');
    content.className = 'onboarding-content';

    const next = document.createElement('button');
    next.className = 'button button--primary button--wide';
    next.type = 'button';
    next.textContent =
      state.step === 5 ? 'Enter your feed' : 'Continue';

    const error = document.createElement('p');
    error.className = 'auth-error';
    error.setAttribute('role', 'status');
    error.setAttribute('aria-live', 'polite');

    dialogNode.append(close, eyebrow, title, content, error, next);

    // STEP 2: Choose genres.
    if (state.step === 2) {
      title.textContent = 'What do you play?';

      const copy = document.createElement('p');
      copy.className = 'dialog-copy';
      copy.textContent =
        'Pick a few genres to tune your corner of Arcadia.';

      content.append(copy);

      for (const [value, label] of genreOptions) {
        const button = document.createElement('button');

        button.type = 'button';
        button.className =
          `interest-chip${state.genres.includes(value) ? ' is-selected' : ''}`;
        button.textContent = label;
        button.setAttribute(
          'aria-pressed',
          String(state.genres.includes(value))
        );

        button.addEventListener('click', () => {
          state.genres = state.genres.includes(value)
            ? state.genres.filter((item) => item !== value)
            : [...state.genres, value];

          render();
        });

        content.append(button);
      }
    }

    // STEP 3: Choose favorite games.
    else if (state.step === 3) {
      title.textContent = 'Choose your games';

      const search = document.createElement('input');
      search.type = 'search';
      search.placeholder = 'Search the catalog';
      search.setAttribute('aria-label', 'Search favorite games');

      content.append(search);

      const results = document.createElement('div');
      results.className = 'onboarding-games';
      content.append(results);

      const searchGames = async (term = '') => {
        results.textContent = 'Loading games…';

        try {
          const data = await api(
            `/games?limit=30${term ? `&q=${encodeURIComponent(term)}` : ''}`
          );

          results.replaceChildren();

          for (const game of data.items) {
            const button = document.createElement('button');

            button.type = 'button';
            button.className =
              `interest-chip${state.games.includes(game.slug) ? ' is-selected' : ''}`;

            button.textContent =
              `${state.games.includes(game.slug) ? '✓ ' : ''}${game.name}`;

            button.setAttribute(
              'aria-pressed',
              String(state.games.includes(game.slug))
            );

            button.addEventListener('click', () => {
              state.games = state.games.includes(game.slug)
                ? state.games.filter((slug) => slug !== game.slug)
                : [...state.games, game.slug].slice(0, 20);

              render();
            });

            results.append(button);
          }

          if (!data.items.length) {
            results.textContent = 'No games found.';
          }
        } catch (e) {
          results.textContent = e.message;
        }
      };

      search.addEventListener('input', () => {
        clearTimeout(searchGames.timer);

        searchGames.timer = setTimeout(() => {
          searchGames(search.value.trim());
        }, 250);
      });

      void searchGames();
    }

    // STEP 4: Configure the player card and profile picture.
    else if (state.step === 4) {
      title.textContent = 'Your player card';

      const name = document.createElement('input');
      name.type = 'text';
      name.maxLength = 40;
      name.placeholder = 'Display name';
      name.value = state.displayName;
      name.setAttribute('aria-label', 'Display name');

      name.addEventListener('input', () => {
        state.displayName = name.value;

        const preview = content.querySelector('.onboarding-avatar-preview');

        if (
          preview &&
          !state.previewUrl &&
          !(
            typeof state.avatar === 'string' &&
            /^https:\/\//i.test(state.avatar)
          )
        ) {
          preview.textContent = getInitial();
        }
      });

      const bio = document.createElement('textarea');
      bio.maxLength = 280;
      bio.placeholder = 'A short bio (optional)';
      bio.value = state.bio;
      bio.setAttribute('aria-label', 'Bio');

      bio.addEventListener('input', () => {
        state.bio = bio.value;
      });

      content.append(name, bio);

      const photoHeading = document.createElement('p');
      photoHeading.className = 'dialog-copy';
      photoHeading.textContent = 'Make it yours';

      const photoDescription = document.createElement('p');
      photoDescription.className = 'dialog-copy';
      photoDescription.textContent =
        'Choose a profile photo or keep your favorite gradient.';

      const avatarSection = document.createElement('div');
      avatarSection.className = 'onboarding-avatar-section';

      const preview = createAvatarPreview();

      const photoInput = document.createElement('input');
      photoInput.type = 'file';
      photoInput.accept = 'image/jpeg,image/png,image/webp,image/gif';
      photoInput.hidden = true;
      photoInput.setAttribute('aria-label', 'Choose profile picture');

      const photoButton = document.createElement('button');
      photoButton.type = 'button';
      photoButton.className = 'button button--secondary';
      photoButton.textContent = state.photo
        ? 'Change photo'
        : 'Choose photo';

      const photoHint = document.createElement('p');
      photoHint.className = 'dialog-copy';
      photoHint.textContent = 'JPEG, PNG, WebP or GIF · Maximum 5 MB';

      photoButton.addEventListener('click', () => {
        photoInput.click();
      });

      photoInput.addEventListener('change', () => {
        const file = photoInput.files?.[0];

        if (!file) return;

        const allowedTypes = [
          'image/jpeg',
          'image/png',
          'image/webp',
          'image/gif',
        ];

        if (!allowedTypes.includes(file.type)) {
          error.textContent =
            'Choose a JPEG, PNG, WebP or GIF image.';
          photoInput.value = '';
          return;
        }

        if (file.size > 5 * 1024 * 1024) {
          error.textContent =
            'Your profile picture must be 5 MB or smaller.';
          photoInput.value = '';
          return;
        }

        clearPhotoPreview();

        state.photo = file;
        state.previewUrl = URL.createObjectURL(file);

        // Remove the selected gradient when a photo is chosen.
        state.avatar = null;

        const image = document.createElement('img');
        image.src = state.previewUrl;
        image.alt = 'Selected profile picture preview';

        preview.replaceChildren(image);
        preview.className = 'onboarding-avatar-preview';

        photoButton.textContent = 'Change photo';
        error.textContent = '';
      });

      avatarSection.append(
        preview,
        photoButton,
        photoInput,
        photoHint
      );

      content.append(photoHeading, photoDescription, avatarSection);

      const gradientHeading = document.createElement('p');
      gradientHeading.className = 'dialog-copy';
      gradientHeading.textContent = 'Or choose a generated avatar';

      content.append(gradientHeading);

      for (const avatar of gradientAvatars) {
        const button = document.createElement('button');

        button.type = 'button';
        button.className =
          `interest-chip ${avatar}${
            !state.photo && state.avatar === avatar ? ' is-selected' : ''
          }`;

        button.textContent = avatar.replace('gradient-', '');

        button.setAttribute(
          'aria-pressed',
          String(!state.photo && state.avatar === avatar)
        );

        button.addEventListener('click', () => {
          state.photo = null;
          clearPhotoPreview();
          state.avatar = avatar;
          render();
        });

        content.append(button);
      }
    }

    // STEP 5: Welcome.
    else {
      title.textContent = 'Welcome to your circle';

      const copy = document.createElement('p');
      copy.className = 'dialog-copy';
      copy.textContent =
        'Your profile is ready. Find your games, share a highlight, and meet the players who make every match better.';

      content.append(copy);
    }

    next.addEventListener('click', async () => {
      next.disabled = true;
      error.textContent = '';

      try {
        if (state.step === 2) {
          const data = await api('/auth/profile', {
            method: 'PATCH',
            body: JSON.stringify({
              genres: state.genres,
            }),
          });

          currentUser = data.user;
          state.step = 3;
          render();
        } else if (state.step === 3) {
          const data = await api('/auth/profile', {
            method: 'PATCH',
            body: JSON.stringify({
              favoriteGames: state.games,
            }),
          });

          currentUser = data.user;
          state.step = 4;
          render();
        } else if (state.step === 4) {
          // Upload the selected photo first, if there is one.
          if (state.photo) {
            const formData = new FormData();
            formData.append('photo', state.photo);

            const uploadData = await api('/auth/avatar', {
              method: 'POST',
              body: formData,
            });

            currentUser = uploadData.user;
            state.avatar = currentUser.avatar;
            state.photo = null;
            clearPhotoPreview();
          }

          // Save the rest of the player card.
          const profileUpdate = {
            displayName: state.displayName,
            bio: state.bio,
            onboardingComplete: true,
          };

          // Only send a generated avatar choice here.
          // Uploaded photo URLs are saved by the avatar endpoint.
          if (
            !state.avatar ||
            !/^https:\/\//i.test(state.avatar)
          ) {
            profileUpdate.avatar = gradientAvatars.includes(state.avatar)
              ? state.avatar
              : 'gradient-violet';
          }

          const data = await api('/auth/profile', {
            method: 'PATCH',
            body: JSON.stringify(profileUpdate),
          });

          currentUser = data.user;
          state.step = 5;
          render();
        } else {
          dialogNode.close();
          cleanup();
          updateSignedInUI();
          selectView('feed');
          toast('You’re all set.');
        }
      } catch (e) {
        error.textContent = e.message || 'Something went wrong. Please try again.';
        next.disabled = false;
      }
    });
  };

  dialogNode.addEventListener('close', cleanup, { once: true });

  render();

  if (!dialogNode.open) {
    dialogNode.showModal();
  }
}

/* Arcadia profile, edit-profile sheet and settings.
   PASTE THIS OVER the old renderProfile, loadProfilePosts, editProfile and renderSettings
   in js/main.js (everything from "async function renderProfile" up to, but not including,
   "function composePost"). */

function uiEl(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const PF_COVERS = ['nebula', 'sunset', 'ocean', 'pitch', 'dusk'];
function pfHash(value) { let total = 0; for (const ch of String(value)) total = (total * 31 + ch.charCodeAt(0)) >>> 0; return total; }
function pfCover(seed) { return `/assets/arcadia/covers/cover-${PF_COVERS[pfHash(seed) % PF_COVERS.length]}.svg`; }
function pfGameName(game) { return typeof game === 'string' ? game : (game?.name || game?.title || game?.slug || String(game)); }
function pfTile(name) {
  const initials = String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase() || '?';
  const tile = uiEl('span', 'pf-tile', initials);
  tile.style.backgroundImage = `url(/assets/arcadia/game-tiles/tile-${(pfHash(name) % 6) + 1}.svg)`;
  tile.setAttribute('aria-hidden', 'true');
  return tile;
}
function pfDaysText(createdAt) {
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
  if (!Number.isFinite(days)) return '';
  const safe = Math.max(0, days);
  return safe < 30 ? `${safe} days` : safe < 365 ? `${Math.floor(safe / 30)} months` : `${(safe / 365).toFixed(1)} years`;
}
function pfEmpty(art, title, copy, actionLabel, action) {
  const box = uiEl('div', 'pf-empty');
  const img = document.createElement('img'); img.src = `/assets/arcadia/empty-states/${art}.svg`; img.alt = ''; img.width = 160; img.height = 120;
  box.append(img, uiEl('h3', 'pf-empty-title', title), uiEl('p', 'pf-empty-copy', copy));
  if (actionLabel) { const button = uiEl('button', 'button button--primary', actionLabel); button.type = 'button'; button.addEventListener('click', action); box.append(button); }
  return box;
}

/* Friend buttons for other people's profiles.
   PASTE THIS right above "async function renderProfile" in js/main.js. */

function pfConfirm(title, message, confirmLabel) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog'); dialog.className = 'sheet'; dialog.setAttribute('aria-labelledby', 'pf-confirm-title');
    const form = document.createElement('form'); form.method = 'dialog';
    const head = uiEl('div', 'sheet-head'); const heading = uiEl('h2', '', title); heading.id = 'pf-confirm-title'; head.append(heading);
    const body = uiEl('div', 'sheet-body'); body.append(uiEl('p', '', message));
    const foot = uiEl('div', 'sheet-foot');
    const cancel = uiEl('button', 'button', 'Cancel'); cancel.type = 'button';
    const confirm = uiEl('button', 'button button--danger', confirmLabel); confirm.type = 'submit'; foot.append(cancel, confirm);
    form.append(head, body, foot); dialog.append(form);
    let answer = false;
    cancel.addEventListener('click', () => dialog.close());
    form.addEventListener('submit', () => { answer = true; });
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => { dialog.remove(); resolve(answer); });
    document.body.append(dialog); dialog.showModal(); cancel.focus();
  });
}

async function pfFriendActions(actions, user) {
  const make = (label, className, handler) => {
    const button = uiEl('button', className, label); button.type = 'button';
    button.addEventListener('click', () => handler(button)); return button;
  };
  const render = async () => {
    actions.replaceChildren();
    if (!currentUser) { actions.append(make('Add friend', 'button button--primary', () => openAuth())); return; }
    let info;
    try { info = await api(`/friends/status/${encodeURIComponent(user.username)}`); } catch { return; }
    if (info.status === 'self') return;
    const run = async (button, work, message) => {
      button.disabled = true;
      try { await work(); if (message) toast(message); await render(); }
      catch (e) { toast(e.message); button.disabled = false; }
    };
    const name = encodeURIComponent(user.username);
    if (info.status === 'none') {
      actions.append(make('Add friend', 'button button--primary', (b) => run(b, () => api(`/friends/${name}`, { method: 'POST' }), 'Friend request sent.')));
    } else if (info.status === 'sent') {
      actions.append(uiEl('span', 'pf-chip', 'Request sent'),
        make('Cancel request', 'button', (b) => run(b, () => api(`/friends/${info.requestId}`, { method: 'DELETE' }), 'Request cancelled.')));
    } else if (info.status === 'received') {
      actions.append(
        make('Accept', 'button button--primary', (b) => run(b, () => api(`/friends/${info.requestId}`, { method: 'PATCH', body: JSON.stringify({ action: 'accept' }) }), `You and ${user.displayName || user.username} are now friends.`)),
        make('Decline', 'button', (b) => run(b, () => api(`/friends/${info.requestId}`, { method: 'PATCH', body: JSON.stringify({ action: 'reject' }) }), 'Request declined.')));
    } 
else if (info.status === 'friends') {
  actions.append(make('Message', 'button button--primary', () => {
    selectView('inbox');
    messaging?.openChat(user);
  }));

  actions.append(make('Friends', 'button', async (b) => {
    const ok = await pfConfirm(
      'Remove friend?',
      `${user.displayName || user.username} will be removed from your friends. You can send a new request later.`,
      'Remove'
    );

    if (ok) {
      await run(
        b,
        () => api(`/friends/remove/${name}`, { method: 'DELETE' }),
        'Friend removed.'
      );
    }
  }));
}

  };
  await render();
}

/* Friends page: Friends list, Requests and Find players.
   PASTE this right above "async function renderProfile" in js/main.js.
   It uses helpers you already have: uiEl, pfEmpty, pfConfirm, api, toast, currentUser, openAuth, selectView, renderProfile. */

function fdAvatar(person) {
  const name = person.displayName || person.username;
  const node = uiEl('span', `fd-avatar ${person.avatar || ''}`.trim(), name[0].toUpperCase());
  node.setAttribute('aria-hidden', 'true');
  return node;
}

function fdRow(person, fill) {
  const row = uiEl('div', 'fd-item');
  const main = uiEl('button', 'fd-main'); main.type = 'button';
  main.setAttribute('aria-label', `Open ${person.displayName || person.username}'s profile`);
  main.append(uiEl('span', 'fd-name', person.displayName || person.username), uiEl('span', 'fd-handle', `@${person.username}`));
  if (person.bio) main.append(uiEl('span', 'fd-bio', person.bio));
  main.addEventListener('click', () => { selectView('profile'); void renderProfile(person.username); });
  const actions = uiEl('div', 'fd-actions');
  row.append(fdAvatar(person), main, actions);
  fill?.(actions);
  return row;
}

async function renderFriends() {
  const host = $('#view-friends'); if (!host) return;
  host.replaceChildren(); host.append(uiEl('h1', 'sr-only', 'Friends'));
  const page = uiEl('div', 'pf-page'); host.append(page);
  const card = uiEl('section', 'pf-card'); page.append(card);
  if (!currentUser) {
    card.append(pfEmpty('empty-friends', 'Your squad is waiting', 'Sign in to add friends, share game nights and keep the conversation going.', 'Sign in', () => openAuth()));
    return;
  }
  card.append(uiEl('h2', 'fd-title', 'Friends'), uiEl('p', 'fd-sub', 'Find players, answer requests and keep your squad close.'));
  const tabsBar = uiEl('div', 'pf-tabs'); tabsBar.setAttribute('role', 'tablist'); tabsBar.setAttribute('aria-label', 'Friends sections');
  const body = uiEl('div', 'fd-body'); card.append(tabsBar, body);
  const state = { tab: 'friends', friends: [], incoming: [], outgoing: [] };
  let searchToken = 0; let resultsBox = null; let searchInput = null;

  const load = async () => {
    const [friends, incoming, outgoing] = await Promise.all([api('/friends/list'), api('/friends/incoming'), api('/friends/outgoing')]);
    state.friends = friends.items || []; state.incoming = incoming.items || []; state.outgoing = outgoing.items || [];
  };
  const act = (label, className, work, message) => {
    const button = uiEl('button', className, label); button.type = 'button';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try { await work(); if (message) toast(message); await refresh(); } catch (e) { toast(e.message); button.disabled = false; }
    });
    return button;
  };
  const drawTabs = () => {
    tabsBar.replaceChildren();
    for (const [key, label] of [['friends', 'Friends'], ['requests', 'Requests'], ['find', 'Find players']]) {
      const tab = uiEl('button', 'pf-tab', label); tab.type = 'button'; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(state.tab === key));
      if (key === 'requests' && state.incoming.length) tab.append(uiEl('span', 'fd-badge', String(state.incoming.length)));
      tab.addEventListener('click', () => { state.tab = key; draw(); });
      tabsBar.append(tab);
    }
  };
  const resultActions = (item) => (actions) => {
    const name = encodeURIComponent(item.username);
    if (item.status === 'none') {
      if (item.canRequest) actions.append(act('Add friend', 'button button--primary', () => api(`/friends/${name}`, { method: 'POST' }), 'Friend request sent.'));
      else actions.append(uiEl('span', 'pf-chip', 'Not accepting requests'));
    } else if (item.status === 'sent') {
      actions.append(uiEl('span', 'pf-chip', 'Request sent'), act('Cancel', 'button', () => api(`/friends/${item.requestId}`, { method: 'DELETE' }), 'Request cancelled.'));
    } else if (item.status === 'received') {
      actions.append(
        act('Accept', 'button button--primary', () => api(`/friends/${item.requestId}`, { method: 'PATCH', body: JSON.stringify({ action: 'accept' }) }), 'Friend added.'),
        act('Decline', 'button', () => api(`/friends/${item.requestId}`, { method: 'PATCH', body: JSON.stringify({ action: 'reject' }) }), 'Request declined.'));
    } else if (item.status === 'friends') actions.append(uiEl('span', 'pf-chip', 'Friends'));
  };
  const runSearch = async () => {
    if (!resultsBox) return;
    const q = searchInput.value.trim(); const token = ++searchToken;
    if (q.length < 2) { resultsBox.replaceChildren(uiEl('p', 'fd-hint', 'Type at least 2 characters of a username.')); return; }
    try {
      const data = await api(`/friends/search?q=${encodeURIComponent(q)}`);
      if (token !== searchToken) return;
      resultsBox.replaceChildren();
      if (!data.items.length) { resultsBox.append(pfEmpty('empty-friends', 'No players found', `Nobody matches "${q}". Check the spelling of the username.`)); return; }
      const list = uiEl('div', 'fd-list'); for (const item of data.items) list.append(fdRow(item, resultActions(item))); resultsBox.append(list);
    } catch (e) { if (token === searchToken) resultsBox.replaceChildren(uiEl('p', 'fd-hint', e.message)); }
  };
  const draw = () => {
    drawTabs(); body.replaceChildren(); resultsBox = null; searchInput = null;
    if (state.tab === 'friends') {
      if (!state.friends.length) { body.append(pfEmpty('empty-friends', 'No friends yet', 'Search for a username to send your first request.', 'Find players', () => { state.tab = 'find'; draw(); })); return; }
      const list = uiEl('div', 'fd-list');
      for (const friend of state.friends) list.append(fdRow(friend, (actions) => {
        

if (messaging) {
  const message = uiEl('button', 'button button--primary', 'Message');
  message.type = 'button';
  message.addEventListener('click', () => {
    selectView('inbox');
    messaging?.openChat(friend);
  });
  actions.append(message);
}

        actions.append(act('Remove', 'button', async () => {
          if (!(await pfConfirm('Remove friend?', `${friend.displayName} will be removed from your friends. You can send a new request later.`, 'Remove'))) throw new Error('Cancelled.');
          await api(`/friends/remove/${encodeURIComponent(friend.username)}`, { method: 'DELETE' });
        }, 'Friend removed.'));
      }));
      body.append(list);
    } else if (state.tab === 'requests') {
      if (!state.incoming.length && !state.outgoing.length) { body.append(pfEmpty('empty-notifications', 'No pending requests', 'New friend requests will show up here.')); return; }
      if (state.incoming.length) {
        body.append(uiEl('h3', 'fd-subhead', `Received (${state.incoming.length})`));
        const list = uiEl('div', 'fd-list');
        for (const item of state.incoming) list.append(fdRow(item.user, (actions) => actions.append(
          act('Accept', 'button button--primary', () => api(`/friends/${item.id}`, { method: 'PATCH', body: JSON.stringify({ action: 'accept' }) }), 'Friend added.'),
          act('Decline', 'button', () => api(`/friends/${item.id}`, { method: 'PATCH', body: JSON.stringify({ action: 'reject' }) }), 'Request declined.'))));
        body.append(list);
      }
      if (state.outgoing.length) {
        body.append(uiEl('h3', 'fd-subhead', `Sent (${state.outgoing.length})`));
        const list = uiEl('div', 'fd-list');
        for (const item of state.outgoing) list.append(fdRow(item.user, (actions) => actions.append(act('Cancel', 'button', () => api(`/friends/${item.id}`, { method: 'DELETE' }), 'Request cancelled.'))));
        body.append(list);
      }
    } else {
      const form = uiEl('div', 'fd-search'); searchInput = document.createElement('input');
      searchInput.type = 'search'; searchInput.placeholder = 'Search by username'; searchInput.autocomplete = 'off'; searchInput.maxLength = 24; searchInput.setAttribute('aria-label', 'Search players by username');
      let timer; searchInput.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(runSearch, 300); });
      form.append(searchInput); resultsBox = uiEl('div', 'fd-results'); body.append(form, resultsBox); void runSearch(); searchInput.focus();
    }
  };
  async function refresh() { await load(); if (state.tab === 'find') { drawTabs(); await runSearch(); } else draw(); }

  body.append(uiEl('p', 'pf-loading', 'Loading…'));
  try {
    await load();
    if (!state.friends.length) state.tab = state.incoming.length ? 'requests' : 'find';
    draw();
  } catch (e) { body.replaceChildren(pfEmpty('empty-posts', 'Friends unavailable', e.message || 'Could not load your friends.')); }
}

async function renderProfile(username = currentUser?.username) {
  const host = $('#view-profile'); if (!host) return;
  host.replaceChildren();
  host.append(uiEl('h1', 'sr-only', username ? 'Player profile' : 'Profile'));
  const page = uiEl('div', 'pf-page'); host.append(page);
  const card = uiEl('section', 'pf-card'); page.append(card);
  if (!username) {
    card.append(pfEmpty('empty-friends', 'Make it yours', 'Sign in to set up your profile, pick your games and join the circle.', 'Sign in', () => openAuth()));
    return;
  }
  card.append(uiEl('p', 'pf-loading', 'Loading profile…'));
  try {
    const data = await api(`/auth/profiles/${encodeURIComponent(username)}`);
    const user = data.user;
    card.replaceChildren();
    const display = user.displayName || user.username;
    const isSelf = currentUser?.username === user.username;
    const games = (user.favoriteGames || []).map(pfGameName);

    const cover = uiEl('div', 'pf-cover'); cover.style.backgroundImage = `url(${pfCover(user.username)})`; cover.setAttribute('aria-hidden', 'true');
    const head = uiEl('div', 'pf-head');
    const avatar = uiEl('div', `pf-avatar ${user.avatar || 'gradient-violet'}`, display[0].toUpperCase()); avatar.setAttribute('aria-hidden', 'true');
    const ident = uiEl('div', 'pf-id'); ident.append(uiEl('h2', 'pf-name', display), uiEl('p', 'pf-handle', `@${user.username}`));
    const actions = uiEl('div', 'pf-actions');
    if (isSelf) {
      const edit = uiEl('button', 'button button--primary', 'Edit profile'); edit.type = 'button'; edit.addEventListener('click', () => openEditProfile(user));
      const settings = uiEl('button', 'button', 'Settings'); settings.type = 'button'; settings.addEventListener('click', () => renderSettings(host));
      actions.append(edit, settings);
      const chat = uiEl('button', 'button', 'Chat');
      chat.type = 'button';
      chat.addEventListener('click', () => selectView('inbox'));
      actions.append(chat);
    } else {
         void pfFriendActions(actions, user);
    }
    head.append(avatar, ident, actions);

    const bio = uiEl('p', 'pf-bio', user.bio || (isSelf ? 'Add a short bio so people know who you are.' : 'No bio yet.'));
    if (!user.bio) bio.classList.add('is-empty');
    const chips = uiEl('div', 'pf-chips');
    const joined = new Date(user.createdAt);
    if (!Number.isNaN(joined.getTime())) chips.append(uiEl('span', 'pf-chip', `Joined ${joined.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`));
    if (games.length) chips.append(uiEl('span', 'pf-chip', `${games.length} favorite ${games.length === 1 ? 'game' : 'games'}`));

    const tabs = uiEl('div', 'pf-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Profile sections');
    const panels = uiEl('div', 'pf-panels');
    const defs = [['posts', 'Posts'], ['games', 'Games'], ['about', 'About']];
    const tabButtons = []; const panelNodes = {};
    const select = (key) => {
      for (const button of tabButtons) { const on = button.dataset.key === key; button.setAttribute('aria-selected', String(on)); button.tabIndex = on ? 0 : -1; }
      for (const [name, panel] of Object.entries(panelNodes)) panel.hidden = name !== key;
    };
    defs.forEach(([key, label]) => {
      const tab = uiEl('button', 'pf-tab', label); tab.type = 'button'; tab.id = `pf-tab-${key}`; tab.dataset.key = key;
      tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', `pf-panel-${key}`);
      tab.addEventListener('click', () => select(key));
      tab.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
        const next = tabButtons[(tabButtons.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : tabButtons.length - 1)) % tabButtons.length];
        select(next.dataset.key); next.focus();
      });
      tabButtons.push(tab); tabs.append(tab);
      const panel = uiEl('div', 'pf-panel'); panel.id = `pf-panel-${key}`; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', tab.id);
      panelNodes[key] = panel; panels.append(panel);
    });

    const list = uiEl('div', 'post-list pf-posts'); panelNodes.posts.append(list);
    if (games.length) {
      const grid = uiEl('div', 'pf-games');
      for (const name of games) { const item = uiEl('div', 'pf-game'); item.append(pfTile(name), uiEl('span', '', name)); grid.append(item); }
      panelNodes.games.append(grid);
    } else {
      panelNodes.games.append(isSelf
        ? pfEmpty('empty-games', 'No games picked yet', 'Choose the games you play and Arcadia will tune your feed to them.', 'Choose games', (event) => startOnboarding(event))
        : pfEmpty('empty-games', 'No games yet', `${display} hasn't picked favorite games yet.`));
    }
    const about = uiEl('dl', 'pf-about');
    const addRow = (label, value) => { if (!value) return; const row = document.createElement('div'); row.append(uiEl('dt', '', label), uiEl('dd', '', value)); about.append(row); };
    addRow('Display name', display); addRow('Username', `@${user.username}`); addRow('Bio', user.bio);
    addRow('Member for', pfDaysText(user.createdAt)); addRow('Favorite games', games.join(', '));
    panelNodes.about.append(about);

    card.append(cover, head, bio, chips, tabs, panels);
    select('posts');
    void loadProfilePosts(user.username, list);
  } catch (e) {
    card.replaceChildren(pfEmpty('empty-posts', 'Profile unavailable', e.message || 'Could not load this profile.'));
  }
}

async function loadProfilePosts(username,host,cursor=null){try{const data=await api(`/auth/profiles/${encodeURIComponent(username)}/posts?limit=10${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`);host.append(...data.items.map(renderPost));if(!data.items.length&&!cursor){const note=document.createElement('p');note.className='catalog-message';note.textContent='No public posts yet.';host.append(note);}if(data.nextCursor){let more=$('.profile-load-more',host);if(!more){more=document.createElement('button');more.className='button profile-load-more';more.type='button';more.textContent='Load more posts';host.append(more);}more.onclick=()=>{more.disabled=true;more.remove();void loadProfilePosts(username,host,data.nextCursor);};}}catch(error){const note=document.createElement('p');note.textContent=error.message;host.append(note);}}

function openEditProfile(user) {
  const dialog = document.createElement('dialog'); dialog.className = 'sheet'; dialog.setAttribute('aria-labelledby', 'edit-profile-title');
  const form = document.createElement('form'); form.noValidate = false;
  const head = uiEl('div', 'sheet-head'); head.append(uiEl('h2', '', 'Edit profile')); head.firstChild.id = 'edit-profile-title';
  const close = uiEl('button', 'icon-button', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Close'); close.addEventListener('click', () => dialog.close()); head.append(close);

  const body = uiEl('div', 'sheet-body');
  const nameField = uiEl('div', 'field'); const nameLabel = uiEl('label', '', 'Display name'); nameLabel.htmlFor = 'edit-display-name';
  const name = document.createElement('input'); name.id = 'edit-display-name'; name.maxLength = 40; name.value = user.displayName || ''; name.placeholder = user.username; name.autocomplete = 'nickname';
  const nameCount = uiEl('div', 'field-count'); nameField.append(nameLabel, name, nameCount);
  const bioField = uiEl('div', 'field'); const bioLabel = uiEl('label', '', 'Bio'); bioLabel.htmlFor = 'edit-bio';
  const bio = document.createElement('textarea'); bio.id = 'edit-bio'; bio.maxLength = 280; bio.value = user.bio || ''; bio.placeholder = 'What do you play, and who do you play with?';
  const bioCount = uiEl('div', 'field-count'); bioField.append(bioLabel, bio, bioCount);
  const count = () => { nameCount.textContent = `${name.value.length} / 40`; bioCount.textContent = `${bio.value.length} / 280`; };
  name.addEventListener('input', count); bio.addEventListener('input', count); count();

  const gamesRow = uiEl('div', 'st-row'); gamesRow.style.borderTop = '0'; gamesRow.style.padding = '0';
  const gamesText = uiEl('div', 'st-text'); gamesText.append(uiEl('div', 'st-label', 'Favorite games'), uiEl('p', 'st-desc', (user.favoriteGames || []).map(pfGameName).join(', ') || 'Not picked yet'));
  const change = uiEl('button', 'button', 'Change'); change.type = 'button'; change.addEventListener('click', (event) => { dialog.close(); startOnboarding(event); });
  gamesRow.append(gamesText, change);
  body.append(nameField, bioField, gamesRow);

  const foot = uiEl('div', 'sheet-foot');
  const cancel = uiEl('button', 'button', 'Cancel'); cancel.type = 'button'; cancel.addEventListener('click', () => dialog.close());
  const save = uiEl('button', 'button button--primary', 'Save profile'); save.type = 'submit'; foot.append(cancel, save);
  form.append(head, body, foot); dialog.append(form);

  form.addEventListener('submit', async (event) => {
    event.preventDefault(); save.disabled = true;
    try {
      await api('/auth/profile', { method: 'PATCH', body: JSON.stringify({ displayName: name.value.trim(), bio: bio.value.trim() }) });
      dialog.close(); await renderProfile(); toast('Profile saved.');
    } catch (e) { toast(e.message); save.disabled = false; }
  });
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog); dialog.showModal(); name.focus();
}

function stCard(title) { const card = uiEl('section', 'st-card'); if (title) card.append(uiEl('h2', '', title)); return card; }
function stRow(label, description, control) {
  const row = uiEl('div', 'st-row'); const text = uiEl('div', 'st-text');
  text.append(uiEl('div', 'st-label', label)); if (description) text.append(uiEl('p', 'st-desc', description));
  row.append(text); if (control) row.append(control); return row;
}
function stSwitch(name, checked, label) {
  const wrap = uiEl('label', 'switch'); const input = document.createElement('input');
  input.type = 'checkbox'; input.name = name; input.checked = checked; input.setAttribute('role', 'switch'); input.setAttribute('aria-label', label);
  wrap.append(input); return wrap;
}
function stSelect(name, options, value, label) {
  const select = uiEl('select', 'st-select'); select.name = name; select.setAttribute('aria-label', label);
  for (const [optionValue, optionLabel] of options) { const option = document.createElement('option'); option.value = optionValue; option.textContent = optionLabel; select.append(option); }
  select.value = value; return select;
}

async function renderSettings(host) {
  if (!currentUser) { void renderProfile(); return; }
  host.replaceChildren();
  const page = uiEl('div', 'pf-page st-page'); host.append(page);
  const top = uiEl('div', 'st-top');
  const back = uiEl('button', 'st-back'); back.type = 'button';
  back.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>'; back.append('Profile');
  back.addEventListener('click', () => renderProfile());
  top.append(back, uiEl('h1', 'st-heading', 'Settings')); page.append(top);

  const account = stCard('Account');
  const signout = uiEl('button', 'button', 'Sign out'); signout.type = 'button'; signout.addEventListener('click', () => $('#auth-open').click());
  account.append(stRow('Username', `@${currentUser.username}`), stRow('Display name', currentUser.displayName || 'Not set'), stRow('Session', 'Sign out of Arcadia on this device.', signout));
  page.append(account);

  const appearance = stCard('Appearance');
  const seg = uiEl('div', 'st-seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Color theme');
  for (const [value, label] of [['light', 'Light'], ['dark', 'Dark']]) {
    const button = uiEl('button', '', label); button.type = 'button'; button.dataset.mode = value;
    button.setAttribute('aria-pressed', String((document.documentElement.dataset.theme || 'light') === value));
    button.addEventListener('click', () => {
      applyTheme(value);
      for (const other of seg.children) other.setAttribute('aria-pressed', String(other.dataset.mode === value));
      toast(`${value === 'dark' ? 'Dark' : 'Light'} mode enabled.`);
    });
    seg.append(button);
  }
  const interests = uiEl('button', 'button', 'Update'); interests.type = 'button'; interests.addEventListener('click', startOnboarding);
  appearance.append(stRow('Theme', 'Choose the look that feels right on your screen.', seg), stRow('Gaming interests', 'Pick the games and genres that shape your feed.', interests));
  page.append(appearance);

  const loaded = await api('/auth/settings').catch(() => ({ settings: { notificationPreferences: {}, privacy: {} } }));
  const prefs = loaded.settings?.notificationPreferences || {}; const privacy = loaded.settings?.privacy || {};
  const form = document.createElement('form');
  const notifications = stCard('Notifications');
  notifications.append(
    stRow('Comments and replies', 'When someone responds to your posts.', stSwitch('comments', prefs.comments !== false, 'Comments and replies')),
    stRow('Reactions and reposts', 'When someone likes or reposts what you share.', stSwitch('reactions', prefs.reactions !== false, 'Reactions and reposts')),
    stRow('Community activity', 'News from the groups you have joined.', stSwitch('communities', prefs.communities !== false, 'Community activity'))
  );
  const privacyCard = stCard('Privacy');
  privacyCard.append(
    stRow('Profile visibility', 'Who can see your profile and posts.', stSelect('profileVisibility', [['public', 'Public'], ['private', 'Private']], privacy.profileVisibility || 'public', 'Profile visibility')),
    stRow('Friend requests', 'Who can send you friend requests.', stSelect('friendRequests', [['everyone', 'Everyone'], ['nobody', 'Nobody']], privacy.friendRequests || 'everyone', 'Friend requests'))
  );
  const saveBar = uiEl('div', 'st-save'); const savePrefs = uiEl('button', 'button button--primary', 'Save preferences'); savePrefs.type = 'submit'; saveBar.append(savePrefs);
  form.append(notifications, privacyCard, saveBar);
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); const values = new FormData(form); savePrefs.disabled = true;
    try {
      await api('/auth/settings', { method: 'PATCH', body: JSON.stringify({ notificationPreferences: { comments: values.has('comments'), reactions: values.has('reactions'), communities: values.has('communities') }, privacy: { profileVisibility: values.get('profileVisibility'), friendRequests: values.get('friendRequests') } }) });
      toast('Settings saved.');
    } catch (e) { toast(e.message); } finally { savePrefs.disabled = false; }
  });
  page.append(form);

    const security = stCard('Password');

  const passwordToggle = uiEl('button', 'button', 'Change Password');
  passwordToggle.type = 'button';
  passwordToggle.setAttribute('aria-expanded', 'false');

  const passwordForm = document.createElement('form');
  passwordForm.hidden = true;

  const fields = uiEl('div', 'st-fields');

  const makeField = (id, labelText, name, autocomplete, extra = {}) => {
    const field = uiEl('div', 'field');
    const label = uiEl('label', '', labelText);
    label.htmlFor = id;

    const input = document.createElement('input');
    input.id = id;
    input.name = name;
    input.type = 'password';
    input.autocomplete = autocomplete;
    input.required = true;
    Object.assign(input, extra);

    field.append(label, input);
    return field;
  };

  fields.append(
    makeField('pw-current', 'Current password', 'currentPassword', 'current-password'),
    makeField('pw-new', 'New password', 'newPassword', 'new-password', {
      minLength: 10,
      maxLength: 128,
      placeholder: 'At least 10 characters'
    })
  );

  const actions = uiEl('div', 'st-actions');

  const change = uiEl('button', 'button button--primary', 'Update Password');
  change.type = 'submit';

  const cancel = uiEl('button', 'button', 'Cancel');
  cancel.type = 'button';

  actions.append(change, cancel);
  fields.append(actions);
  passwordForm.append(fields);

  passwordToggle.addEventListener('click', () => {
    passwordForm.hidden = false;
    passwordToggle.hidden = true;
    passwordToggle.setAttribute('aria-expanded', 'true');
    passwordForm.querySelector('#pw-current').focus();
  });

  cancel.addEventListener('click', () => {
    passwordForm.reset();
    passwordForm.hidden = true;
    passwordToggle.hidden = false;
    passwordToggle.setAttribute('aria-expanded', 'false');
    passwordToggle.focus();
  });

  passwordForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!passwordForm.reportValidity()) return;

    const values = Object.fromEntries(new FormData(passwordForm));

    if (values.currentPassword === values.newPassword) {
      toast('Your new password must be different from your current password.');
      return;
    }

    change.disabled = true;
    cancel.disabled = true;

    try {
      await api('/auth/password', {
        method: 'POST',
        body: JSON.stringify(values)
      });

      passwordForm.reset();
      passwordForm.hidden = true;
      passwordToggle.hidden = false;
      passwordToggle.setAttribute('aria-expanded', 'false');

      toast('Password changed. Other sessions were signed out.');
      passwordToggle.focus();
    } catch (e) {
      toast(e.message);
    } finally {
      change.disabled = false;
      cancel.disabled = false;
    }
  });

  security.append(passwordToggle, passwordForm);
  page.append(security);
}

function composePost() {
  if (!currentUser) return openAuth('compose');
  $('#composer-error').textContent = '';
  if (!destinationChoicesLoaded) {
    const form=$('#composer-form');
    const label=document.createElement('label');label.htmlFor='composer-destination';label.textContent='Share to';
    const select=document.createElement('select');select.id='composer-destination';select.setAttribute('aria-label','Post destination');
    const addOption=(value,text)=>{const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);};
    addOption('general','Public feed');
    form.insertBefore(label,$('#composer-body'));form.insertBefore(select,$('#composer-body'));
    destinationChoicesLoaded=true;
    Promise.allSettled([api('/games?limit=50'),api('/communities/mine')]).then(([games,mine])=>{
      for(const item of (games.status==='fulfilled'?games.value.items:[]))addOption(`game:${item.slug}`,`Game · ${item.name}`);
      for(const item of (mine.status==='fulfilled'?mine.value.items:[]))addOption(`community:${item.slug}`,`Group · ${item.name}`);
    });
  }
  const destination=$('#composer-destination');if(destination){destination.hidden=Boolean(selectedCommunity);destination.previousElementSibling.hidden=Boolean(selectedCommunity);if(selectedCommunity)destination.value=`community:${selectedCommunity.slug}`;}
  $('#composer-title').textContent=selectedCommunity?`Post in ${selectedCommunity.name}`:'What’s the play?';
  composerDialog.showModal();
  $('#composer-body').focus();
}

$$('[data-action="compose"]').forEach((button) => button.setAttribute('aria-label', 'Write a post'));
restoreSession();
