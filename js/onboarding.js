/* Arcadia full-page onboarding: interests -> games -> profile.
   Uses the same API calls as before (PATCH /auth/profile) and the
   database-driven catalogue (GET /games). No profile photo here:
   photos belong in Edit profile. */

import { setAvatar, isPhotoAvatar, prepareAvatarFile, prepareBannerFile, applyBanner } from './avatar.js';

const GAME_IMG = (slug) => `/assets/arcadia/games/${slug}.jpg`;

const GENRES = [
  { id: 'sports', label: 'Sports & football', blurb: 'Football, basketball and every match worth bragging about.', games: ['fc-mobile', 'efootball', 'ea-sports-fc'] },
  { id: 'fps', label: 'FPS & tactical shooters', blurb: 'Fast aim, tight teamwork and clutch rounds.', games: ['call-of-duty-mobile', 'valorant', 'rainbow-six-siege'] },
  { id: 'rpg', label: 'RPG & action RPG', blurb: 'Deep worlds, big builds and stories that last.', games: ['genshin-impact', 'elden-ring', 'league-of-legends'] },
  { id: 'battle-royale', label: 'Battle royale', blurb: 'Drop in, loot up and be the last squad standing.', games: ['pubg-mobile', 'free-fire', 'fortnite'] },
  { id: 'racing', label: 'Racing', blurb: 'Tune it, drift it and take the podium.', games: ['asphalt-legends-unite', 'forza-horizon-5', 'rocket-league'] },
  { id: 'strategy', label: 'Strategy', blurb: 'Outthink, outplay and win the late game.', games: ['dota-2', 'league-of-legends'] },
  { id: 'fighting', label: 'Fighting', blurb: 'One-on-one duels, combos and rivalries.', games: ['tekken-8'] },
  { id: 'simulation', label: 'Simulation', blurb: 'Build, manage and live a different life.', games: ['minecraft', 'the-sims-4', 'stardew-valley'] },
  { id: 'adventure', label: 'Adventure', blurb: 'Explore open worlds and go where the map ends.', games: ['gta-v', 'roblox', 'minecraft'] },
  { id: 'party', label: 'Casual & party', blurb: 'Easy games to play with friends, any time.', games: ['among-us', 'roblox', 'minecraft'] },
];

const STEPS = ['Interests', 'Games', 'Profile'];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function cover(slug, className) {
  const img = el('img', className);
  img.src = GAME_IMG(slug);
  img.alt = '';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.addEventListener('error', () => img.classList.add('is-missing'));
  return img;
}

export function createOnboarding({ api, getUser, setUser, onFinish }) {
  function start() {
    const user = getUser();
    if (!user) return;

    let page = document.querySelector('#onboarding-dialog');
    if (page) page.remove();
    page = el('dialog', 'ob-page');
    page.id = 'onboarding-dialog';
    page.setAttribute('aria-labelledby', 'ob-title');
    page.addEventListener('cancel', (event) => event.preventDefault());
    document.body.append(page);

    const state = {
      step: 1,
      genres: [...(user.genres || [])],
      games: [...(user.favoriteGames || [])],
      displayName: user.displayName || '',
      bio: user.bio || '',
      catalogue: null,
      busy: false,
    };

    const header = el('header', 'ob-header');
    const brand = el('div', 'ob-brand');
    const logo = el('img');
    logo.src = '/assets/arcadia/brand/logo-mark.svg';
    logo.alt = '';
    brand.append(logo, el('span', '', 'Arcadia'));
    const progress = el('ol', 'ob-progress');
    progress.setAttribute('aria-label', 'Setup progress');
    header.append(brand, progress);

    const main = el('main', 'ob-main');
    const footer = el('footer', 'ob-footer');
    const shell = el('div', 'ob-shell');
    shell.append(header, main, footer);
    page.append(shell);

    function renderProgress() {
      progress.replaceChildren();
      STEPS.forEach((name, index) => {
        const item = el('li', 'ob-progress__item');
        if (index + 1 === state.step) { item.classList.add('is-current'); item.setAttribute('aria-current', 'step'); }
        if (index + 1 < state.step) item.classList.add('is-done');
        item.append(el('span', 'ob-progress__dot', String(index + 1)), el('span', 'ob-progress__label', name));
        progress.append(item);
      });
    }

    /* ---------- Step 1: interests ---------- */
    function renderInterests() {
      main.replaceChildren();
      main.append(el('h1', '', 'What do you play?'), el('p', 'ob-sub', 'Pick the types of games you enjoy. We use this to shape your feed.'));
      const grid = el('div', 'ob-genres');
      for (const genre of GENRES) {
        const card = el('button', 'ob-genre');
        card.type = 'button';
        const selected = state.genres.includes(genre.id);
        card.classList.toggle('is-selected', selected);
        card.setAttribute('aria-pressed', String(selected));

        const deck = el('div', 'ob-deck');
        deck.setAttribute('aria-hidden', 'true');
        genre.games.forEach((slug, index) => {
          const mid = (genre.games.length - 1) / 2;
          const piece = cover(slug, 'ob-deck__card');
          piece.style.setProperty('--i', String(index - mid));
          deck.append(piece);
        });
        const check = el('span', 'ob-check', '✓');
        check.setAttribute('aria-hidden', 'true');
        const body = el('div', 'ob-genre__body');
        body.append(el('h3', '', genre.label), el('p', '', genre.blurb));
        card.append(check, deck, body);

        card.addEventListener('click', () => {
          const on = !state.genres.includes(genre.id);
          state.genres = on ? [...state.genres, genre.id] : state.genres.filter((id) => id !== genre.id);
          card.classList.toggle('is-selected', on);
          card.setAttribute('aria-pressed', String(on));
          renderFooter();
        });
        grid.append(card);
      }
      main.append(grid);
    }

    /* ---------- Step 2: games ---------- */
    async function loadCatalogue() {
      if (state.catalogue) return state.catalogue;
      const data = await api('/games?limit=50');
      state.catalogue = data.items || [];
      return state.catalogue;
    }

    function renderGames() {
      main.replaceChildren();
      main.append(el('h1', '', 'Choose your games'), el('p', 'ob-sub', 'Tap the games you play. The first one you pick becomes your profile banner. You can pick up to 20 and change them later.'));

      const search = el('input', 'ob-search');
      search.type = 'search';
      search.placeholder = 'Search for a game';
      search.setAttribute('aria-label', 'Search for a game');
      search.autocomplete = 'off';
      const results = el('div', 'ob-games-wrap');
      results.append(el('p', 'ob-empty', 'Loading games…'));
      main.append(search, results);

      const buttons = new Map();

      function gameCard(game) {
        const card = el('button', 'ob-game');
        card.type = 'button';
        const selected = state.games.includes(game.slug);
        card.classList.toggle('is-selected', selected);
        card.setAttribute('aria-pressed', String(selected));
        card.dataset.slug = game.slug;

        // A small deck: this game on top, two games from the same category behind it.
        const entry = GENRES.find((genre) => genre.games.includes(game.slug))
          || GENRES.find((genre) => (game.genres || []).includes(genre.id));
        const related = entry ? entry.games.filter((slug) => slug !== game.slug).slice(0, 2) : [];
        const deck = el('div', 'ob-deck ob-deck--game');
        deck.setAttribute('aria-hidden', 'true');
        related.forEach((slug, index) => {
          const piece = cover(slug, 'ob-deck__card ob-deck__card--back');
          piece.style.setProperty('--i', String(index === 0 ? -1 : 1));
          deck.append(piece);
        });
        const main = cover(game.slug, 'ob-deck__card ob-deck__card--main');
        main.style.setProperty('--i', '0');
        deck.append(main);

        const check = el('span', 'ob-check', '✓');
        check.setAttribute('aria-hidden', 'true');
        const labels = (game.genres || [])
          .map((id) => GENRES.find((genre) => genre.id === id)?.label)
          .filter(Boolean)
          .slice(0, 2);
        const body = el('div', 'ob-game__body');
        body.append(el('h3', '', game.name));
        if (labels.length) body.append(el('p', '', labels.join(' · ')));
        card.append(check, deck, body);

        card.addEventListener('click', () => {
          const on = !state.games.includes(game.slug);
          if (on && state.games.length >= 20) { footerNote('You can pick up to 20 games.'); return; }
          state.games = on ? [...state.games, game.slug] : state.games.filter((slug) => slug !== game.slug);
          for (const node of buttons.get(game.slug) || []) {
            node.classList.toggle('is-selected', on);
            node.setAttribute('aria-pressed', String(on));
          }
          footerNote('');
          renderFooter();
        });
        if (!buttons.has(game.slug)) buttons.set(game.slug, []);
        buttons.get(game.slug).push(card);
        return card;
      }

      function section(title, games) {
        const wrap = el('section', 'ob-section');
        wrap.append(el('h2', '', title));
        const grid = el('div', 'ob-games');
        for (const game of games) grid.append(gameCard(game));
        wrap.append(grid);
        return wrap;
      }

      function draw() {
        buttons.clear();
        results.replaceChildren();
        const all = state.catalogue || [];
        const term = search.value.trim().toLowerCase();
        if (!all.length) {
          results.append(el('p', 'ob-empty', 'No games are available yet. You can skip this step and add games later.'));
          return;
        }
        if (term) {
          const hits = all.filter((game) => game.name.toLowerCase().includes(term) || (game.aliases || []).some((alias) => alias.toLowerCase().includes(term)));
          if (!hits.length) { results.append(el('p', 'ob-empty', `No games match “${search.value.trim()}”.`)); return; }
          results.append(section(`Results for “${search.value.trim()}”`, hits));
          return;
        }
        const matches = all.filter((game) => (game.genres || []).some((id) => state.genres.includes(id)));
        const rest = all.filter((game) => !matches.includes(game));
        if (matches.length) results.append(section('Suggested for you', matches));
        if (rest.length) results.append(section(matches.length ? 'More popular games' : 'Popular games', rest));
      }

      let timer = null;
      search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(draw, 120); });

      loadCatalogue().then(draw).catch((error) => {
        results.replaceChildren(el('p', 'ob-empty', error.message || 'Could not load games.'));
      });
    }

    /* ---------- Step 3: player card (photo, banner, name, bio) ---------- */
    function renderProfile() {
      main.replaceChildren();
      main.append(
        el('h1', '', 'Your player card'),
        el('p', 'ob-sub', 'Add a photo and a banner so friends recognise you. Both are optional and you can change them any time in Edit profile.')
      );

      const card = el('div', 'ob-card');
      const coverNode = el('div', 'ob-card__cover');
      coverNode.setAttribute('aria-hidden', 'true');
      const row = el('div', 'ob-card__row');
      const avatarNode = el('div', 'ob-card__avatar');
      avatarNode.setAttribute('aria-hidden', 'true');
      const id = el('div', 'ob-card__id');
      const nameNode = el('div', 'ob-card__name');
      id.append(nameNode, el('div', 'ob-card__handle', `@${getUser().username}`));
      row.append(avatarNode, id);

      const actions = el('div', 'ob-card__actions');
      const photoButton = el('button', 'ob-pill');
      photoButton.type = 'button';
      const bannerButton = el('button', 'ob-pill');
      bannerButton.type = 'button';
      const photoFile = el('input');
      photoFile.type = 'file';
      photoFile.accept = 'image/jpeg,image/png,image/webp,image/gif';
      photoFile.hidden = true;
      const bannerFile = el('input');
      bannerFile.type = 'file';
      bannerFile.accept = 'image/jpeg,image/png,image/webp,image/gif';
      bannerFile.hidden = true;
      actions.append(photoButton, bannerButton, photoFile, bannerFile);
      const status = el('p', 'ob-card__status');
      status.setAttribute('role', 'status');
      card.append(coverNode, row, actions, status);

      function say(text, isError = false) {
        status.textContent = text;
        status.classList.toggle('is-error', isError);
      }

      function paint() {
        const current = getUser();
        const display = state.displayName.trim() || current.displayName || current.username;
        nameNode.textContent = display;
        setAvatar(avatarNode, current.avatar || 'gradient-violet', display[0].toUpperCase());
        applyBanner(coverNode, current, '/assets/arcadia/covers/cover-nebula.svg');
        photoButton.textContent = isPhotoAvatar(current.avatar) ? 'Change photo' : 'Add photo';
        bannerButton.textContent = isPhotoAvatar(current.banner) ? 'Change banner' : 'Add banner';
      }

      async function upload(file, prepare, endpoint, key, label) {
        if (!file) return;
        if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
          say('Choose a JPEG, PNG, WebP or GIF image.', true);
          return;
        }
        photoButton.disabled = bannerButton.disabled = true;
        say('Uploading…');
        try {
          const prepared = await prepare(file);
          const form = new FormData();
          form.append('photo', prepared);
          const result = await api(endpoint, { method: 'POST', body: form });
          setUser({ ...getUser(), [key]: result.user[key] });
          paint();
          say(`${label} added.`);
        } catch (error) {
          say(error.message || 'Could not upload that image.', true);
        } finally {
          photoButton.disabled = bannerButton.disabled = false;
        }
      }

      photoButton.addEventListener('click', () => photoFile.click());
      bannerButton.addEventListener('click', () => bannerFile.click());
      photoFile.addEventListener('change', () => { const file = photoFile.files?.[0]; photoFile.value = ''; upload(file, prepareAvatarFile, '/auth/avatar', 'avatar', 'Photo'); });
      bannerFile.addEventListener('change', () => { const file = bannerFile.files?.[0]; bannerFile.value = ''; upload(file, prepareBannerFile, '/auth/banner', 'banner', 'Banner'); });

      const form = el('div', 'ob-form');
      const nameLabel = el('label', '', 'Display name');
      nameLabel.htmlFor = 'ob-name';
      const name = el('input');
      name.id = 'ob-name';
      name.maxLength = 40;
      name.autocomplete = 'nickname';
      name.placeholder = 'What should people call you?';
      name.value = state.displayName;
      name.addEventListener('input', () => { state.displayName = name.value; paint(); });
      const bioLabel = el('label', '', 'Short bio (optional)');
      bioLabel.htmlFor = 'ob-bio';
      const bio = el('textarea');
      bio.id = 'ob-bio';
      bio.maxLength = 280;
      bio.rows = 4;
      bio.placeholder = 'What do you play, and when?';
      bio.value = state.bio;
      bio.addEventListener('input', () => { state.bio = bio.value; });
      form.append(nameLabel, name, bioLabel, bio);

      main.append(card, form);
      paint();
    }

    /* ---------- Footer / navigation ---------- */
    const note = el('p', 'ob-note');
    note.setAttribute('role', 'status');
    function footerNote(text) { note.textContent = text || ''; }

    function renderFooter() {
      footer.replaceChildren();
      const left = el('div', 'ob-footer__left');
      if (state.step > 1) {
        const back = el('button', 'ob-btn ob-btn--ghost', 'Back');
        back.type = 'button';
        back.addEventListener('click', () => go(state.step - 1));
        left.append(back);
      }
      const count = state.step === 1 ? state.genres.length : state.step === 2 ? state.games.length : 0;
      if (state.step < 3) left.append(el('span', 'ob-count', count ? `${count} selected` : 'Nothing selected yet'));

      const right = el('div', 'ob-footer__right');
      const skip = el('button', 'ob-btn ob-btn--ghost', state.step === 3 ? 'Skip' : 'Skip for now');
      skip.type = 'button';
      skip.addEventListener('click', () => (state.step === 3 ? finish(true) : go(state.step + 1)));
      const next = el('button', 'ob-btn ob-btn--primary', state.step === 3 ? 'Finish' : 'Continue');
      next.type = 'button';
      next.disabled = state.busy || (state.step < 3 && count === 0);
      next.addEventListener('click', () => advance());
      right.append(skip, next);
      footer.append(left, note, right);
    }

    function go(step) {
      state.step = step;
      footerNote('');
      renderProgress();
      if (step === 1) renderInterests();
      else if (step === 2) renderGames();
      else renderProfile();
      renderFooter();
      page.scrollTo({ top: 0 });
    }

    async function save(body) {
      state.busy = true;
      renderFooter();
      try {
        const data = await api('/auth/profile', { method: 'PATCH', body: JSON.stringify(body) });
        setUser(data.user);
        return true;
      } catch (error) {
        footerNote(error.message || 'Something went wrong. Please try again.');
        return false;
      } finally {
        state.busy = false;
        renderFooter();
      }
    }

    async function advance() {
      if (state.step === 1) { if (await save({ genres: state.genres })) go(2); }
      else if (state.step === 2) { if (await save({ favoriteGames: state.games })) go(3); }
      else finish(false);
    }

    async function finish(skipped) {
      const body = { onboardingComplete: true };
      if (!skipped) { body.displayName = state.displayName.trim(); body.bio = state.bio.trim(); }
      if (await save(body)) {
        page.close();
        page.remove();
        onFinish();
      }
    }

    go(1);
    page.showModal();
  }

  return { start };
}
