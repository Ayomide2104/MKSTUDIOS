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
let selectedCommunity = null;

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
    const active = button.dataset.view === view;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
  document.querySelector('.workspace:not([hidden])')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (view === 'games') loadGames();
  if (view === 'groups') loadCommunities();
  if (view === 'updates') loadUpdates();
  if (view === 'profile') renderProfile();
}

$$('[data-view]').forEach((button) => button.addEventListener('click', () => selectView(button.dataset.view)));
$$('[data-view-link]').forEach((button) => button.addEventListener('click', () => selectView(button.dataset.viewLink)));

$$('.feed-tab').forEach((tab, index) => {
  tab.addEventListener('click', () => {
    if (tab.dataset.filter === 'friends') { toast('Friends feed will unlock with friend connections.'); return; }
    $$('.feed-tab').forEach((item) => {
      const active = item === tab;
      item.classList.toggle('is-selected', active);
      item.setAttribute('aria-selected', String(active));
    });
    $('.tab-indicator').style.transform = `translateX(${index * 102}px)`;
    loadFeed(tab.dataset.filter);
  });
});

$$('[data-action="signin"], #auth-avatar').forEach((button) => button.addEventListener('click', () => {
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
  currentUser = null; csrfToken = null; updateSignedInUI(); toast('You’re signed out.');
});
$$('[data-action="compose"]').forEach((button) => button.addEventListener('click', () => currentUser ? composePost() : openAuth('compose')));

$('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
$('.dialog-close', composerDialog).addEventListener('click', () => composerDialog.close());
composerDialog.addEventListener('click', (event) => { if (event.target === composerDialog) composerDialog.close(); });
$('#composer-body').addEventListener('input', (event) => { $('#composer-count').textContent = `${event.target.value.length} / 500`; });
$('#composer-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const body = $('#composer-body').value.trim();
  const choice = $('#composer-destination')?.value || 'general';
  const [type, target] = choice.split(':');
  const submit = $('button[type="submit"]', event.currentTarget);
  if (!body) { $('#composer-error').textContent = 'Write a little something first.'; return; }
  submit.disabled = true;
  const communitySlug=selectedCommunity?.slug;
  const pending=renderPost({_id:`pending-${Date.now()}`,author:currentUser,body,createdAt:new Date().toISOString(),likeCount:0,commentCount:0,repostCount:0});pending.classList.add('is-pending');pending.querySelectorAll('button').forEach((button)=>button.disabled=true);
  const host=communitySlug?$('#view-groups .post-list'):$('#post-list');host?.prepend(pending);
  try {
    if (communitySlug) await api(`/communities/${communitySlug}/posts`, { method: 'POST', body: JSON.stringify({ body }) });
    else await api('/posts', { method: 'POST', body: JSON.stringify({ body, destinations: [{ type, ...(target ? { target } : {}) }] }) });
    composerDialog.close(); event.currentTarget.reset(); $('#composer-count').textContent = '0 / 500';
    toast('Your post is live.'); if(communitySlug)await openCommunity(communitySlug);else await loadFeed();
  } catch (error) { pending.remove();$('#composer-error').textContent = error.message; }
  finally { submit.disabled = false; }
});
$$('[data-auth-mode]').forEach((button) => button.addEventListener('click', () => setAuthMode(button.dataset.authMode)));

function setAuthMode(mode) {
  authMode = mode;
  $$('[data-auth-mode]').forEach((button) => {
    const active = button.dataset.authMode === mode;
    button.classList.toggle('is-current', active);
    button.setAttribute('aria-selected', String(active));
  });
  $('#auth-title').textContent = mode === 'login' ? 'Get in the game.' : 'Join your people.';
  $('#auth-password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  $('#auth-password').placeholder = mode === 'login' ? 'Your password' : 'At least 10 characters';
  let confirm = $('#auth-confirm');
  if (mode === 'register' && !confirm) {
    const label = document.createElement('label'); label.htmlFor = 'auth-confirm'; label.textContent = 'Confirm password';
    confirm = document.createElement('input'); confirm.id = 'auth-confirm'; confirm.type = 'password'; confirm.autocomplete = 'new-password'; confirm.placeholder = 'Type it again'; confirm.required = true;
    $('#auth-error').before(label, confirm);
  }
  if (confirm) {
    confirm.previousElementSibling.hidden = mode !== 'register';
    confirm.hidden = mode !== 'register';
    confirm.required = mode === 'register';
  }
  $('#auth-error').textContent = '';
}

async function api(path, options = {}) {
  const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes((options.method || 'GET').toUpperCase());
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(mutating && csrfToken ? { 'X-CSRF-Token': csrfToken } : {}), ...options.headers }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Something went wrong. Please try again.');
  return body.data;
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
      } else if (pending.type === 'comment') toast('Open the post discussion to add your reply.');
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
    submit.innerHTML = 'Continue <span>↗</span>';
  }
});

function updateSignedInUI() {
  $('#auth-open').setAttribute('aria-label', currentUser ? 'Sign out' : 'Sign in');
  $('#auth-open').title = currentUser ? 'Sign out' : 'Sign in';
  $('#auth-avatar').textContent = currentUser?.displayName?.[0]?.toUpperCase() || currentUser?.username?.[0]?.toUpperCase() || '?';
  $('#auth-avatar').setAttribute('aria-label', currentUser ? `Signed in as ${currentUser.username}` : 'Sign in to your profile');
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
    updateSignedInUI();
    if (!currentUser.onboardingComplete) startOnboarding();
  } catch {
    // A guest can read public posts; an expired cookie simply leaves the guest view.
  }
  await loadFeed();
}

let feedCursor = null;
let activeFeed = 'for-you';
async function loadFeed(filter = activeFeed, cursor = null) {
  const state = $('#feed-state');
  const list = $('#post-list');
  activeFeed = filter;
  if (!cursor) { feedCursor = null; state.hidden = false; state.innerHTML = '<span class="state-icon" aria-hidden="true">◌</span><h2>Finding your people…</h2><p>Loading the latest conversations.</p>'; list.replaceChildren(); }
  let more = $('#feed-load-more');
  if (!more) { more = document.createElement('button'); more.id = 'feed-load-more'; more.className = 'button'; more.type = 'button'; more.textContent = 'Load more'; more.addEventListener('click', () => loadFeed(activeFeed, feedCursor)); list.after(more); }
  more.hidden = true;
  try {
    const result = await api(`/posts?feed=${encodeURIComponent(filter)}&limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    list.append(...(result.items || []).map(renderPost));
    feedCursor = result.nextCursor;
    more.hidden = !feedCursor; more.disabled = false;
    if (!result.items?.length && !cursor && result.unavailable) {
      state.innerHTML = '<span class="state-icon" aria-hidden="true">♧</span><h2>Friends feed is coming later</h2><p>Friend connections are part of the next approved phase.</p>';
      return;
    }
    if (!result.items?.length && !cursor) {
      state.innerHTML = '<span class="state-icon" aria-hidden="true">✳</span><h2>Your circle starts here</h2><p>There are no public posts yet. Start a conversation when you’re ready.</p>';
      if (currentUser) {
        const button = document.createElement('button');
        button.className = 'button button--primary'; button.type = 'button'; button.textContent = 'Write a post'; button.addEventListener('click', composePost);
        state.append(button);
      } else {
        const button = document.createElement('button'); button.className = 'button button--primary'; button.type = 'button'; button.textContent = 'Join the circle ↗'; button.addEventListener('click', () => openAuth()); state.append(button);
      }
    } else state.hidden = list.children.length > 0;
  } catch {
    state.innerHTML = '<span class="state-icon" aria-hidden="true">↻</span><h2>Couldn’t load the feed</h2><p>Check your connection and try again.</p>';
    const retry = document.createElement('button'); retry.className = 'button button--primary'; retry.type = 'button'; retry.textContent = 'Try again'; retry.addEventListener('click', () => loadFeed(filter, cursor)); state.append(retry);
  }
}

function renderPost(post) {
  const article = document.createElement('article'); article.className = 'post-card glass-panel';
  const header = document.createElement('div'); header.className = 'post-card__head';
  const avatar = document.createElement('span'); avatar.className = 'avatar post-avatar'; avatar.textContent = (post.author?.displayName || post.author?.username || '?')[0].toUpperCase();
  if(post.author?.avatar)avatar.classList.add(post.author.avatar);
  const meta = document.createElement('div'); meta.className = 'post-meta';
  const name = document.createElement('strong'); name.textContent = post.author?.displayName || post.author?.username || 'Player';
  name.tabIndex=0;name.role='link';name.addEventListener('click',()=>{selectView('profile');void renderProfile(post.author?.username);});name.addEventListener('keydown',(event)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();name.click();}});
  const handle = document.createElement('span'); handle.textContent = `@${post.author?.username || 'player'} · ${new Date(post.createdAt).toLocaleDateString()}`;
  meta.append(name, handle); header.append(avatar, meta);
  for(const destination of post.destinations||[]){if(destination.type==='game'||destination.type==='community'){const tag=document.createElement('span');tag.className=destination.type==='game'?'game-pill':'community-pill';tag.textContent=destination.type==='game'?`Game · ${destination.target}`:`Group · ${destination.target}`;header.append(tag);}}
  const body = document.createElement('p'); body.className = 'post-card__body'; body.textContent = post.body;
  const actions = document.createElement('div'); actions.className = 'post-actions';
  const likeButton = document.createElement('button'); likeButton.type = 'button';likeButton.dataset.liked=String(post.liked===true); likeButton.textContent = `${post.liked?'♥':'♡'} ${post.likeCount || 0}`; likeButton.setAttribute('aria-label', 'Like');
  likeButton.addEventListener('click', async () => {
    if (!currentUser) return openAuth({ type: 'like', id: post._id });
    likeButton.disabled = true;const wasLiked=likeButton.dataset.liked==='true';const count=Number((likeButton.textContent.match(/\d+/)||[0])[0]);likeButton.dataset.liked=String(!wasLiked);likeButton.textContent=`${!wasLiked?'♥':'♡'} ${Math.max(0,count+(wasLiked?-1:1))}`;
    try { const method = wasLiked ? 'DELETE' : 'POST'; const result = await api(`/posts/${post._id}/like`, { method }); likeButton.dataset.liked = String(result.liked); likeButton.textContent = `${result.liked ? '♥' : '♡'} ${result.likeCount}`; }
    catch (error) { likeButton.dataset.liked=String(wasLiked);likeButton.textContent=`${wasLiked?'♥':'♡'} ${count}`;toast(error.message); }
    finally { likeButton.disabled = false; }
  });
  const commentButton = document.createElement('button'); commentButton.type = 'button'; commentButton.textContent = `◯ ${post.commentCount || 0}`; commentButton.setAttribute('aria-label', 'Comments');
  const commentBox = document.createElement('div'); commentBox.className = 'post-comments'; commentBox.hidden = true;
  commentButton.addEventListener('click', async () => {
    if (!commentBox.hidden) { commentBox.hidden = true; return; }
    commentBox.hidden = false;
    if (!commentBox.dataset.loaded) {
      try {
        const comments = await api(`/posts/${post._id}/comments`);
        for (const item of comments.items || []) { const line = renderComment(item); if(item.parent)line.classList.add('comment-reply');commentBox.append(line);if(currentUser&&!item.parent){const reply=document.createElement('button');reply.type='button';reply.className='text-button';reply.textContent='Reply';reply.addEventListener('click',()=>addReplyForm(post._id,item._id,line));line.append(reply);} }
        commentBox.dataset.loaded = 'true';
      } catch (error) { toast(error.message); }
    }
    if (currentUser && !$('.comment-form', commentBox)) {
      const form = document.createElement('form'); form.className = 'comment-form';
      const input = document.createElement('input'); input.maxLength = 1000; input.required = true; input.placeholder = 'Add to the conversation…'; input.setAttribute('aria-label', 'Write a comment');
      const send = document.createElement('button'); send.type = 'submit'; send.textContent = 'Send'; form.append(input, send);
      form.addEventListener('submit', async (event) => { event.preventDefault(); send.disabled = true; try { const result = await api(`/posts/${post._id}/comments`, { method: 'POST', body: JSON.stringify({ body: input.value }) }); const line = document.createElement('p'); const author = document.createElement('strong'); author.textContent = `@${result.comment.author.username} `; line.append(author, document.createTextNode(result.comment.body)); form.before(line); commentButton.textContent = `◯ ${Number((commentButton.textContent.match(/\d+/) || [0])[0]) + 1}`; input.value = ''; } catch (error) { toast(error.message); } finally { send.disabled = false; } });
      commentBox.append(form);
    }
    if (!currentUser) { const signIn = document.createElement('button'); signIn.className = 'text-button'; signIn.type = 'button'; signIn.textContent = 'Sign in to comment'; signIn.addEventListener('click', () => openAuth({ type: 'comment', id: post._id })); commentBox.append(signIn); }
  });
  const repostButton = document.createElement('button'); repostButton.type = 'button';repostButton.dataset.reposted=String(post.reposted===true); repostButton.textContent = `↗ ${post.repostCount || 0}`; repostButton.setAttribute('aria-label', 'Repost');
  repostButton.addEventListener('click', async () => { if (!currentUser) return openAuth({ type: 'repost', id: post._id }); repostButton.disabled = true;const was= repostButton.dataset.reposted==='true';const count=Number((repostButton.textContent.match(/\d+/)||[0])[0]);repostButton.dataset.reposted=String(!was);repostButton.textContent=`↗ ${Math.max(0,count+(was?-1:1))}`;try { const method = was ? 'DELETE' : 'POST'; const result = await api(`/posts/${post._id}/repost`, { method }); repostButton.dataset.reposted = String(result.reposted); repostButton.textContent = `↗ ${result.repostCount}`; toast(result.reposted ? 'Reposted to your circle.' : 'Repost removed.'); } catch (error) { repostButton.dataset.reposted=String(was);repostButton.textContent=`↗ ${count}`;toast(error.message); } finally { repostButton.disabled = false; } });
  const detailButton=document.createElement('button');detailButton.type='button';detailButton.textContent='Open discussion';detailButton.addEventListener('click',()=>openPostDetail(post._id));
  actions.append(likeButton, commentButton, repostButton,detailButton);
  article.append(header, body, actions, commentBox); return article;
}

function renderComment(item){const line=document.createElement('div');line.className='comment-line';const author=document.createElement('strong');author.textContent=`@${item.author?.username||'player'} `;const body=document.createElement('span');body.textContent=item.body;line.append(author,body);return line;}
function addReplyForm(postId,parentId,anchor){if($('.reply-form',anchor.parentElement))return;const form=document.createElement('form');form.className='comment-form reply-form';const input=document.createElement('input');input.maxLength=1000;input.required=true;input.placeholder='Write a reply';const submit=document.createElement('button');submit.type='submit';submit.textContent='Reply';form.append(input,submit);form.addEventListener('submit',async(event)=>{event.preventDefault();submit.disabled=true;try{const result=await api(`/posts/${postId}/comments`,{method:'POST',body:JSON.stringify({body:input.value,parent:parentId})});const line=renderComment(result.comment);line.classList.add('comment-reply');anchor.after(line,form);toast('Reply added.');}catch(error){toast(error.message);submit.disabled=false;}});anchor.after(form);input.focus();}
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
    dialogNode = document.createElement('dialog'); dialogNode.id = 'onboarding-dialog'; dialogNode.className = 'auth-dialog glass-panel';
    dialogNode.setAttribute('aria-labelledby', 'onboarding-title'); document.body.append(dialogNode);
  }
  const state = { step: 2, genres: [...(currentUser.genres || [])], games: [...(currentUser.favoriteGames || [])], displayName: currentUser.displayName || '', bio: currentUser.bio || '', avatar: currentUser.avatar || 'gradient-violet' };
  const genreOptions = [['sports','Sports & football'],['fps','FPS & tactical shooters'],['rpg','RPG & action RPG'],['battle-royale','Battle royale'],['racing','Racing'],['strategy','Strategy'],['fighting','Fighting'],['simulation','Simulation'],['adventure','Adventure'],['party','Casual & party']];
  const render = () => {
    dialogNode.replaceChildren();
    const close = document.createElement('button'); close.className = 'dialog-close'; close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label','Close onboarding'); close.addEventListener('click',()=>dialogNode.close());
    const eyebrow = document.createElement('p'); eyebrow.className='eyebrow'; eyebrow.textContent=`PLAYER SETUP · STEP ${state.step - 1} OF 4`;
    const title = document.createElement('h2'); title.id='onboarding-title';
    const content=document.createElement('div'); content.className='onboarding-content';
    const next=document.createElement('button'); next.className='button button--primary button--wide';next.type='button';next.textContent=state.step===5?'Enter your feed':'Continue →';
    const error=document.createElement('p');error.className='auth-error';error.setAttribute('role','status');
    dialogNode.append(close,eyebrow,title,content,error,next);
    if(state.step===2){
      title.textContent='What do you play?';const copy=document.createElement('p');copy.className='dialog-copy';copy.textContent='Pick a few genres to tune your corner of MKSTUDIOS.';content.append(copy);
      for(const [value,label] of genreOptions){const button=document.createElement('button');button.type='button';button.className=`interest-chip${state.genres.includes(value)?' is-selected':''}`;button.textContent=label;button.setAttribute('aria-pressed',String(state.genres.includes(value)));button.addEventListener('click',()=>{state.genres=state.genres.includes(value)?state.genres.filter((item)=>item!==value):[...state.genres,value];render();});content.append(button);}
    } else if(state.step===3){
      title.textContent='Choose your games';const search=document.createElement('input');search.type='search';search.placeholder='Search the catalog';search.setAttribute('aria-label','Search favorite games');content.append(search);const results=document.createElement('div');results.className='onboarding-games';content.append(results);
      const searchGames=async(term='')=>{results.textContent='Loading games…';try{const data=await api(`/games?limit=30${term?`&q=${encodeURIComponent(term)}`:''}`);results.replaceChildren();for(const game of data.items){const button=document.createElement('button');button.type='button';button.className=`interest-chip${state.games.includes(game.slug)?' is-selected':''}`;button.textContent=`${state.games.includes(game.slug)?'✓ ':''}${game.name}`;button.setAttribute('aria-pressed',String(state.games.includes(game.slug)));button.addEventListener('click',()=>{state.games=state.games.includes(game.slug)?state.games.filter((slug)=>slug!==game.slug):[...state.games,game.slug].slice(0,20);render();});results.append(button);}if(!data.items.length)results.textContent='No games found.';}catch(e){results.textContent=e.message;}};
      search.addEventListener('input',()=>{clearTimeout(searchGames.timer);searchGames.timer=setTimeout(()=>searchGames(search.value.trim()),250);});void searchGames();
    } else if(state.step===4){
      title.textContent='Your player card';const name=document.createElement('input');name.maxLength=40;name.placeholder='Display name';name.value=state.displayName;name.setAttribute('aria-label','Display name');name.addEventListener('input',()=>state.displayName=name.value);const bio=document.createElement('textarea');bio.maxLength=280;bio.placeholder='A short bio (optional)';bio.value=state.bio;bio.setAttribute('aria-label','Bio');bio.addEventListener('input',()=>state.bio=bio.value);content.append(name,bio);const label=document.createElement('p');label.className='dialog-copy';label.textContent='Choose a generated avatar color';content.append(label);for(const avatar of ['gradient-violet','gradient-cyan','gradient-amber','gradient-emerald','gradient-pink']){const button=document.createElement('button');button.className=`interest-chip ${avatar}${state.avatar===avatar?' is-selected':''}`;button.type='button';button.textContent=avatar.replace('gradient-','');button.setAttribute('aria-pressed',String(state.avatar===avatar));button.addEventListener('click',()=>{state.avatar=avatar;render();});content.append(button);}
    } else { title.textContent='Welcome to your circle';const copy=document.createElement('p');copy.className='dialog-copy';copy.textContent='Your profile is ready. Find your games, share a highlight, and meet the players who make every match better.';content.append(copy); }
    next.addEventListener('click',async()=>{next.disabled=true;error.textContent='';try{if(state.step===2){const data=await api('/auth/profile',{method:'PATCH',body:JSON.stringify({genres:state.genres})});currentUser=data.user;state.step=3;render();}else if(state.step===3){const data=await api('/auth/profile',{method:'PATCH',body:JSON.stringify({favoriteGames:state.games})});currentUser=data.user;state.step=4;render();}else if(state.step===4){const data=await api('/auth/profile',{method:'PATCH',body:JSON.stringify({displayName:state.displayName,bio:state.bio,avatar:state.avatar,onboardingComplete:true})});currentUser=data.user;state.step=5;render();}else{dialogNode.close();updateSignedInUI();selectView('feed');toast('You’re all set.');}}catch(e){error.textContent=e.message;next.disabled=false;}});
  };
  render(); if(!dialogNode.open)dialogNode.showModal();
}

async function renderProfile(username = currentUser?.username) {
  const host=$('#view-profile');if(!host)return;
  host.replaceChildren();const heading=document.createElement('div');heading.className='page-heading';const title=document.createElement('h1');title.textContent=username?'Player profile.':'Profile.';heading.append(title);host.append(heading);
  if(!username){const button=document.createElement('button');button.className='button button--primary';button.textContent='Sign in';button.addEventListener('click',()=>openAuth());host.append(button);return;}
  const card=document.createElement('section');card.className='profile-card glass-panel';card.textContent='Loading profile…';host.append(card);
  try{const data=await api(`/auth/profiles/${encodeURIComponent(username)}`);const user=data.user;card.replaceChildren();const avatar=document.createElement('div');avatar.className=`profile-avatar ${user.avatar||'gradient-violet'}`;avatar.textContent=(user.displayName||user.username)[0].toUpperCase();const name=document.createElement('h2');name.textContent=user.displayName||user.username;const handle=document.createElement('p');handle.textContent=`@${user.username}`;const bio=document.createElement('p');bio.textContent=user.bio||'No bio yet.';const age=document.createElement('p');const days=Math.max(0,Math.floor((Date.now()-new Date(user.createdAt).getTime())/86400000));age.textContent=`Playing here for ${days<30?`${days} days`:days<365?`${Math.floor(days/30)} months`:`${(days/365).toFixed(1)} years`}`;const games=document.createElement('p');games.textContent=`Favorite games: ${(user.favoriteGames||[]).join(', ')||'Not picked yet'}`;card.append(avatar,name,handle,bio,age,games);
    const recent=document.createElement('section');recent.className='profile-posts';const recentTitle=document.createElement('h3');recentTitle.textContent='Recent public posts';const recentList=document.createElement('div');recentList.className='post-list';recent.append(recentTitle,recentList);card.append(recent);loadProfilePosts(user.username,recentList);
    if(currentUser?.username===user.username){const edit=document.createElement('button');edit.className='button';edit.textContent='Edit profile';edit.addEventListener('click',()=>editProfile(card,user));const settings=document.createElement('button');settings.className='button button--primary';settings.textContent='Settings';settings.addEventListener('click',()=>renderSettings(host));card.append(edit,settings);}
  }catch(e){card.textContent=e.message;}
}

async function loadProfilePosts(username,host,cursor=null){try{const data=await api(`/auth/profiles/${encodeURIComponent(username)}/posts?limit=10${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`);host.append(...data.items.map(renderPost));if(!data.items.length&&!cursor){const note=document.createElement('p');note.className='catalog-message';note.textContent='No public posts yet.';host.append(note);}if(data.nextCursor){let more=$('.profile-load-more',host);if(!more){more=document.createElement('button');more.className='button profile-load-more';more.type='button';more.textContent='Load more posts';host.append(more);}more.onclick=()=>{more.disabled=true;more.remove();void loadProfilePosts(username,host,data.nextCursor);};}}catch(error){const note=document.createElement('p');note.textContent=error.message;host.append(note);}}

function editProfile(card,user){
  const form=document.createElement('form');form.className='profile-edit';const name=document.createElement('input');name.maxLength=40;name.value=user.displayName||'';name.placeholder='Display name';const bio=document.createElement('textarea');bio.maxLength=280;bio.value=user.bio||'';bio.placeholder='Bio';const save=document.createElement('button');save.className='button button--primary';save.textContent='Save profile';form.append(name,bio,save);form.addEventListener('submit',async(event)=>{event.preventDefault();save.disabled=true;try{await api('/auth/profile',{method:'PATCH',body:JSON.stringify({displayName:name.value,bio:bio.value})});await renderProfile();toast('Profile saved.');}catch(e){toast(e.message);save.disabled=false;}});card.append(form);
}

async function renderSettings(host){
  let panel=$('#settings-panel',host);if(!panel){panel=document.createElement('section');panel.id='settings-panel';panel.className='settings-panel glass-panel';host.append(panel);}panel.replaceChildren();const title=document.createElement('h2');title.textContent='Settings';panel.append(title);const account=document.createElement('p');account.textContent=`Account · @${currentUser.username}`;panel.append(account);
  const interests=document.createElement('button');interests.className='button';interests.type='button';interests.textContent='Update gaming interests';interests.addEventListener('click',startOnboarding);panel.append(interests);
  const password=document.createElement('form');password.innerHTML='<h3>Password</h3><input name="currentPassword" type="password" autocomplete="current-password" placeholder="Current password" required><input name="newPassword" type="password" autocomplete="new-password" placeholder="New password, at least 10 characters" minlength="10" maxlength="128" required><button class="button" type="submit">Change password</button>';password.addEventListener('submit',async(event)=>{event.preventDefault();const values=Object.fromEntries(new FormData(password));const button=$('button',password);button.disabled=true;try{await api('/auth/password',{method:'POST',body:JSON.stringify(values)});password.reset();toast('Password changed. Other sessions were signed out.');}catch(e){toast(e.message);}finally{button.disabled=false;}});panel.append(password);
  const settings=await api('/auth/settings').catch(()=>({settings:{notificationPreferences:{},privacy:{}}}));const form=document.createElement('form');form.innerHTML='<h3>Notifications</h3><label><input type="checkbox" name="comments"> Comments & replies</label><label><input type="checkbox" name="reactions"> Reactions & reposts</label><label><input type="checkbox" name="communities"> Community activity</label><h3>Privacy</h3><label>Profile visibility <select name="profileVisibility"><option value="public">Public</option><option value="private">Private</option></select></label><label>Friend requests <select name="friendRequests"><option value="everyone">Everyone</option><option value="nobody">Nobody</option></select></label><button class="button button--primary" type="submit">Save preferences</button>';for(const key of ['comments','reactions','communities'])$(`[name="${key}"]`,form).checked=settings.settings.notificationPreferences?.[key]!==false;for(const key of ['profileVisibility','friendRequests'])$(`[name="${key}"]`,form).value=settings.settings.privacy?.[key]||'everyone';form.addEventListener('submit',async(event)=>{event.preventDefault();const values=new FormData(form);try{await api('/auth/settings',{method:'PATCH',body:JSON.stringify({notificationPreferences:{comments:values.has('comments'),reactions:values.has('reactions'),communities:values.has('communities')},privacy:{profileVisibility:values.get('profileVisibility'),friendRequests:values.get('friendRequests')}})});toast('Settings saved.');}catch(e){toast(e.message);}});panel.append(form);
  const signout=document.createElement('button');signout.className='button';signout.type='button';signout.textContent='Sign out';signout.addEventListener('click',()=>$('#auth-open').click());panel.append(signout);
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
