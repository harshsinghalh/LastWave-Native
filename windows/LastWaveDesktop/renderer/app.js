(() => {
  'use strict';

  const api = window.lastwave;
  const q = s => document.querySelector(s);
  const qa = (s, root = document) => [...root.querySelectorAll(s)];
  const page = q('#page');
  const audio = q('#audio');

  const S = {
    bootstrap: null,
    local: null,
    profile: null,
    streamBase: '',
    route: 'feed',
    routeParams: {},
    history: [{ route: 'feed', params: {} }],
    historyIndex: 0,
    home: null,
    explore: null,
    current: null,
    queue: [],
    queueIndex: -1,
    shuffle: false,
    repeat: false,
    volume: .85,
    playerReady: false,
    audioCtx: null,
    sourceNode: null,
    analyser: null,
    delayNode: null,
    djGain: null,
    compressor: null,
    djTimer: null,
    djDb: 0,
    avgDb: -60,
    impactAt: 0,
    impactUntil: 0,
    cooldownUntil: 0,
    lyrics: null,
    parsedLyrics: [],
    playedHistoryFor: null,
    scrobbledFor: null,
    activeSearchType: 'all',
    trackCache: new Map()
  };

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmtTime = sec => {
    if (!Number.isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };
  const placeholder = (text='LW') => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#242b31"/><stop offset="1" stop-color="#13171b"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="50%" y="53%" dominant-baseline="middle" text-anchor="middle" fill="#8d9aa4" font-family="Segoe UI" font-size="62" font-weight="700">${escapeHtml(text).slice(0,2)}</text></svg>`)}`;

  function toast(message, timeout = 3200) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    q('#toastHost').appendChild(el);
    setTimeout(() => el.remove(), timeout);
  }

  function loading(label='Loading') {
    return `<div class="loading"><span class="spinner"></span><span>${escapeHtml(label)}…</span></div>`;
  }

  function empty(title, copy='') {
    return `<div class="empty"><b>${escapeHtml(title)}</b>${copy ? `<span>${escapeHtml(copy)}</span>` : ''}</div>`;
  }

  function img(url, alt='') {
    const src = url || placeholder(alt);
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" onerror="this.onerror=null;this.src='${placeholder(alt).replace(/'/g, '%27')}'">`;
  }

  function cacheTrack(track) {
    if (track?.videoId) S.trackCache.set(track.videoId, track);
    return track;
  }

  function card(track) {
    cacheTrack(track);
    const id = escapeHtml(track.videoId || '');
    return `<article class="music-card" data-play="${id}">
      <div class="card-overlay">${img(track.artworkUrl, track.title)}<button class="card-play" data-play="${id}">▶</button></div>
      <h3 title="${escapeHtml(track.title)}">${escapeHtml(track.title || 'Untitled')}</h3>
      <p title="${escapeHtml(track.artist)}">${escapeHtml(track.artist || 'Unknown artist')}</p>
    </article>`;
  }

  function entityCard(entity) {
    return `<article class="music-card" data-entity-kind="${escapeHtml(entity.kind)}" data-entity-id="${escapeHtml(entity.browseId)}">
      <div class="card-overlay">${img(entity.artworkUrl, entity.title)}</div>
      <h3>${escapeHtml(entity.title || 'Untitled')}</h3>
      <p>${escapeHtml(entity.subtitle || entity.kind || '')}</p>
    </article>`;
  }

  function trackRow(track, index = 0, options = {}) {
    cacheTrack(track);
    const liked = S.local?.liked?.some(x => x.videoId === track.videoId);
    return `<div class="track-row" data-play="${escapeHtml(track.videoId || '')}">
      ${img(track.artworkUrl, track.title)}
      <div class="track-main"><strong>${escapeHtml(track.title || 'Untitled')}</strong><span>${escapeHtml(track.artist || 'Unknown artist')}</span></div>
      <div class="track-album">${escapeHtml(track.album || '')}</div>
      <div class="track-duration">${track.durationSeconds ? fmtTime(track.durationSeconds) : ''}</div>
      <div class="track-actions">
        <button class="tiny-btn ${liked ? 'active':''}" data-like="${escapeHtml(track.videoId || '')}" title="Like">${liked ? '♥':'♡'}</button>
        <button class="tiny-btn" data-context="${escapeHtml(track.videoId || '')}" title="More">•••</button>
      </div>
    </div>`;
  }

  function androidGreeting() {
    const hour = new Date().getHours();
    const greeting = hour >= 5 && hour <= 11 ? 'Good morning'
      : hour >= 12 && hour <= 16 ? 'Good afternoon'
      : hour >= 17 && hour <= 21 ? 'Good evening'
      : 'Good night';
    const date = new Intl.DateTimeFormat(undefined, {
      weekday: 'long', month: 'long', day: 'numeric'
    }).format(new Date());
    return { greeting, date };
  }

  function androidFeedHero(tracks) {
    const first = tracks?.find?.(x => x?.artworkUrl) || tracks?.[0] || null;
    if (first) cacheTrack(first);
    const art = first?.artworkUrl || '';
    return '<div class="android-feed-hero">' +
      (art ? '<div class="android-feed-hero-art" style="background-image:url(&quot;' + escapeHtml(art) + '&quot;)"></div>' : '') +
      '<div class="android-feed-hero-gradient"></div>' +
      '<div class="android-feed-hero-content">' +
        '<div class="android-made-for-you">✦ <span>MADE FOR YOU</span></div>' +
        '<h2>Infinite Radio</h2>' +
        '<p>An endless station shaped by your listening</p>' +
        '<button class="android-hero-play" data-infinite-radio="1" ' + (!tracks?.length ? 'disabled' : '') + '>▶ <span>Play</span></button>' +
      '</div>' +
    '</div>';
  }

  function androidQuickAccessTile({title, subtitle, artworkUrl, kind, action}) {
    const art = artworkUrl
      ? img(artworkUrl, title)
      : '<div class="android-quick-fallback">' + (kind === 'liked' ? '♥' : kind === 'recent' ? '↻' : kind === 'release' ? '◌' : '✦') + '</div>';
    return '<button class="android-quick-card android-quick-' + escapeHtml(kind || 'default') + '" data-quick-action="' + escapeHtml(action || '') + '">' +
      '<div class="android-quick-art">' + art + '</div>' +
      '<strong>' + escapeHtml(title) + '</strong>' +
      '<span>' + escapeHtml(subtitle || '') + '</span>' +
    '</button>';
  }

  function androidQuickPicksColumns(tracks) {
    if (!tracks?.length) return '';
    tracks.forEach(cacheTrack);
    const columns = [];
    for (let i = 0; i < tracks.length; i += 3) columns.push(tracks.slice(i, i + 3));
    return '<div class="android-picks-strip">' + columns.map(function(column){
      return '<div class="android-picks-column">' + column.map(function(track){
        const isCurrent = S.current?.videoId && S.current.videoId === track.videoId;
        return '<div class="android-pick-row ' + (isCurrent ? 'current' : '') + '" data-play="' + escapeHtml(track.videoId || '') + '">' +
          '<div class="android-pick-art">' + img(track.artworkUrl, track.title) + (isCurrent && !audio.paused ? '<span class="android-playing-bars">▮▮▮</span>' : '') + '</div>' +
          '<div class="android-pick-copy"><strong>' + escapeHtml(track.title || 'Untitled') + '</strong><span>' + escapeHtml(track.artist || 'Unknown artist') + '</span></div>' +
          '<button class="tiny-btn" data-context="' + escapeHtml(track.videoId || '') + '" title="More">⋮</button>' +
        '</div>';
      }).join('') + '</div>';
    }).join('') + '</div>';
  }

  function androidTasteStrip() {
    const tags = ['Chill','Focus','Energy','Bollywood','Indie','Workout','Nostalgia','Late night'];
    return '<section class="android-taste-section"><div class="section-head"><div><h2>Your sound</h2><small>Tap a vibe to start instant radio</small></div></div>' +
      '<div class="android-taste-strip">' +
        tags.map(tag => '<button class="android-taste-chip" data-taste-query="' + escapeHtml(tag) + '"><i></i><span>' + escapeHtml(tag) + '</span></button>').join('') +
      '</div></section>';
  }

  function findTrack(videoId) {
    if (!videoId) return null;
    const cached = S.trackCache.get(videoId);
    if (cached) return cached;
    const pools = [
      S.queue,
      S.home?.flatMap?.(x => x.tracks || []) || [],
      S.explore?.tracks || [],
      S.local?.liked || [],
      S.local?.history || [],
      ...(S.local?.playlists || []).map(p => p.tracks || [])
    ];
    for (const pool of pools) {
      const found = pool?.find?.(x => x.videoId === videoId);
      if (found) return found;
    }
    return null;
  }

  function pageHead(title, subtitle='', actions='') {
    const roots = new Set(['feed','stats','playlists']);
    const back = roots.has(S.route) ? '' : '<button class="header-back" data-android-back="1" title="Back">‹</button>';
    const sub = subtitle ? '<p>' + escapeHtml(subtitle) + '</p>' : '';
    return '<div class="page-head">' +
      back +
      '<div class="page-title"><h1>' + escapeHtml(title) + '</h1>' + sub + '</div>' +
      '<div class="page-actions">' + actions + '</div>' +
    '</div>';
  }

  function setConnection(text, kind='online') {
    const el = q('#connectionBadge');
    el.textContent = text;
    el.className = 'connection-badge ' + kind;
  }

  function setTheme() {
    const theme = S.local?.settings?.theme || 'dark';
    document.body.classList.toggle('light', theme === 'light');
    const accent = S.local?.settings?.accent || '#c6f100';
    document.documentElement.style.setProperty('--accent', accent);
  }

  function navigate(route, params = {}, push = true) {
    S.route = route;
    S.routeParams = params || {};
    document.body.dataset.route = route;
    if (push) {
      S.history = S.history.slice(0, S.historyIndex + 1);
      S.history.push({ route, params });
      S.historyIndex = S.history.length - 1;
    }
    qa('.nav-item').forEach(x => x.classList.toggle('active', x.dataset.route === route));
    renderRoute().catch(err => {
      console.error(err);
      page.innerHTML = pageHead('Something went wrong') + empty(err?.message || 'Could not open this screen.');
    });
    q('#backBtn').disabled = S.historyIndex <= 0;
    q('#forwardBtn').disabled = S.historyIndex >= S.history.length - 1;
  }

  async function renderRoute() {
    switch (S.route) {
      case 'feed': return renderFeed();
      case 'stats': return renderStats();
      case 'playlists': return renderPlaylists();
      case 'discover': return renderDiscover();
      case 'genres': return renderGenres();
      case 'search': return renderSearch(S.routeParams.query || '');
      case 'generator': return renderGenerator();
      case 'friends': return renderFriends();
      case 'downloads': return renderDownloads();
      case 'new-releases': return renderNewReleases();
      case 'provider-modules': return renderProviderModules();
      case 'home-sections': return renderHomeSections();
      case 'excluded-songs': return renderExcludedSongs();
      case 'youtube-login': return renderYouTubeLoginPage();
      case 'youtube-import': return renderImportPage('youtube');
      case 'external-import': return renderImportPage('external');
      case 'settings': return renderSettings();
      case 'entity': return renderEntity(S.routeParams.kind, S.routeParams.id, S.routeParams.title);
      case 'playlist-detail': return renderLocalPlaylist(S.routeParams.id);
      default: return renderFeed();
    }
  }

  async function renderFeed() {
    const actions =
      '<button class="secondary header-circle" data-route="downloads" title="Downloads">⇩</button>' +
      '<button class="secondary header-circle" data-route="search" title="Search">⌕</button>' +
      '<button class="secondary header-circle android-profile-action" data-route="settings" title="Settings"><span>●</span></button>';

    const greeting = androidGreeting();
    const heroIntro =
      '<div class="android-greeting"><h2>' + escapeHtml(greeting.greeting) + '</h2><p>' + escapeHtml(greeting.date) + '</p></div>';

    page.innerHTML = pageHead('Home','',actions) + heroIntro + loading('Loading your music');

    try {
      if (!S.home) S.home = await api.youtube.home();
      setConnection('YouTube Music ready');

      const hiddenSections = new Set((S.local?.settings?.homeHiddenSections || []).map(function(x){ return String(x).toLowerCase(); }));
      const excludedIds = new Set((S.local?.excluded || []).map(function(x){ return x.videoId; }));
      const sections = (S.home || [])
        .filter(function(x){ return x && x.tracks && x.tracks.length && !hiddenSections.has(String(x.title || '').toLowerCase()); })
        .map(function(x){ return { ...x, tracks: x.tracks.filter(function(t){ return !excludedIds.has(t.videoId); }) }; })
        .filter(function(x){ return x.tracks.length; });

      const allTracks = sections.flatMap(function(x){ return x.tracks; });
      const quickPicks = sections[0]?.tracks?.slice(0,18) || allTracks.slice(0,18);
      const firstLiked = S.local?.liked?.find?.(x => x?.artworkUrl) || S.local?.liked?.[0];
      const firstRecent = S.local?.history?.find?.(x => x?.artworkUrl) || S.local?.history?.[0];
      const firstFeed = allTracks.find(x => x?.artworkUrl) || allTracks[0];

      const quickTiles =
        '<section class="android-quick-surface">' +
          '<div class="section-head"><div><h2>Quick access</h2></div></div>' +
          '<div class="android-quick-strip">' +
            androidQuickAccessTile({title:'Liked songs',subtitle:(S.local?.liked?.length || 0) + ' tracks',artworkUrl:firstLiked?.artworkUrl,kind:'liked',action:'liked'}) +
            androidQuickAccessTile({title:'Recently played',subtitle:'Jump back in',artworkUrl:firstRecent?.artworkUrl,kind:'recent',action:'recent'}) +
            androidQuickAccessTile({title:'Discover',subtitle:'Radio & mixes',artworkUrl:firstFeed?.artworkUrl,kind:'mix',action:'discover'}) +
            androidQuickAccessTile({title:'New releases',subtitle:'Fresh drops',artworkUrl:sections[1]?.tracks?.[0]?.artworkUrl,kind:'release',action:'new-releases'}) +
          '</div>' +
        '</section>';

      let html = pageHead('Home','',actions) +
        heroIntro +
        androidFeedHero(quickPicks) +
        quickTiles +
        androidTasteStrip();

      if (quickPicks.length) {
        html += '<section class="android-picks-surface"><div class="section-head android-section-actions"><div><h2>Picked for you</h2><small>From your listening · refreshed for you</small></div><div class="android-header-pills"><button class="chip" data-shuffle-picks="1">Shuffle</button><button class="chip active" data-play-picks="1">▶ Play all</button></div></div>' +
          androidQuickPicksColumns(quickPicks) + '</section>';
      }

      sections.slice(1).forEach(function(section){
        html += '<section class="section"><div class="section-head"><div><h2>' + escapeHtml(section.title || 'For you') + '</h2></div></div>' +
          '<div class="card-row">' + section.tracks.slice(0,18).map(card).join('') + '</div></section>';
      });

      if (!sections.length) {
        html += empty('Your feed is empty','Search for a favorite or explore something new.');
      }

      html += '<div class="android-feed-footer">Made for you from your taste</div>';
      page.innerHTML = html;

      q('[data-infinite-radio]')?.addEventListener('click', function(){
        if (quickPicks[0]) playTrack(quickPicks[0], quickPicks);
      });
      q('[data-play-picks]')?.addEventListener('click', function(){
        if (quickPicks[0]) playTrack(quickPicks[0], quickPicks);
      });
      q('[data-shuffle-picks]')?.addEventListener('click', function(){
        if (!quickPicks.length) return;
        const shuffled = [...quickPicks].sort(() => Math.random() - .5);
        playTrack(shuffled[0], shuffled);
      });
      qa('[data-quick-action]').forEach(function(button){
        button.addEventListener('click', function(){
          const action = button.dataset.quickAction;
          if (action === 'liked') navigate('playlists');
          else if (action === 'recent') navigate('stats');
          else if (action === 'discover') navigate('discover');
          else if (action === 'new-releases') navigate('new-releases');
        });
      });
      qa('[data-taste-query]').forEach(function(button){
        button.addEventListener('click', function(){
          navigate('search',{query:button.dataset.tasteQuery + ' music',type:'song'});
        });
      });
    } catch (e) {
      setConnection('Catalog unavailable','error');
      page.innerHTML = pageHead('Home','',actions) + heroIntro + empty('Could not load your music', e.message || 'Try again.');
    }
  }

  async function renderStats() {
    page.innerHTML = pageHead('Statistics','', '<button class="secondary header-circle" data-route="downloads" title="Downloads">⇩</button><button class="secondary header-circle" data-route="search" title="Search">⌕</button><button class="secondary header-circle" data-route="settings" title="Settings">●</button>') + loading('Loading your listening history');
    const stats = await api.library.stats();
    let html = pageHead('Statistics','', '<button class="secondary header-circle" data-route="downloads" title="Downloads">⇩</button><button class="secondary header-circle" data-route="search" title="Search">⌕</button><button class="secondary header-circle" data-route="settings" title="Settings">●</button>');
    html += `<div class="wide-grid">
      <div class="stat-card"><b>${stats.totalPlays}</b><span>Local plays</span></div>
      <div class="stat-card"><b>${stats.uniqueTracks}</b><span>Unique tracks</span></div>
      <div class="stat-card"><b>${stats.activeDays}</b><span>Active listening days</span></div>
    </div>`;
    if (stats.topTracks.length) html += `<section class="section"><div class="section-head"><h2>Top tracks</h2></div><div class="track-list">${stats.topTracks.map(trackRow).join('')}</div></section>`;
    if (stats.topArtists.length) html += `<section class="section"><div class="section-head"><h2>Top artists</h2></div><div class="wide-grid">${stats.topArtists.map(x => `<div class="panel-card"><strong>${escapeHtml(x.artist)}</strong><div class="mini-note">${x.plays} plays</div></div>`).join('')}</div></section>`;
    const username = S.local.settings.lastfm?.username;
    if (username && S.local.settings.lastfm?.apiKey) {
      try {
        const user = await api.lastfm.user(username);
        html += `<section class="section"><div class="section-head"><h2>Last.fm</h2></div><div class="wide-grid"><div class="stat-card"><b>${user.playcount.toLocaleString()}</b><span>Total scrobbles</span></div><div class="stat-card"><b>${escapeHtml(user.username)}</b><span>Connected profile</span></div></div></section>`;
      } catch {}
    }
    page.innerHTML = html;
  }

  function playlistCard(p) {
    const cover = p.tracks?.[0]?.artworkUrl || '';
    return `<article class="music-card" data-local-playlist="${escapeHtml(p.id)}"><div class="card-overlay">${img(cover,p.title)}</div><h3>${escapeHtml(p.title)}</h3><p>${p.tracks?.length || 0} tracks</p></article>`;
  }

  async function refreshLocal() {
    S.local = await api.state();
    setTheme();
    updatePlayerLike();
  }

  async function renderPlaylists() {
    await refreshLocal();
    page.innerHTML = pageHead('Playlist', S.local.playlists.length + ' Playlists · ' + S.local.playlists.reduce((n,p)=>n+(p.tracks?.length||0),0) + ' Tracks',
      `<button class="secondary header-circle" id="importPlaylistBtn" title="Import">⇩</button><button class="primary header-circle" id="createPlaylistBtn" title="Create playlist">＋</button>`) +
      `<section class="section"><div class="section-head"><h2>Liked songs</h2><small>${S.local.liked.length} tracks</small></div>${S.local.liked.length ? `<div class="track-list">${S.local.liked.slice(0,30).map(trackRow).join('')}</div>` : empty('No liked songs yet','Tap the heart while listening.')}</section>
      <section class="section"><div class="section-head"><h2>Your playlists</h2></div>${S.local.playlists.length ? `<div class="grid">${S.local.playlists.map(playlistCard).join('')}</div>` : empty('No playlists yet','Create one or import a playlist.')}</section>`;
    q('#createPlaylistBtn')?.addEventListener('click', createPlaylistDialog);
    q('#importPlaylistBtn')?.addEventListener('click', importDialog);
  }

  async function renderLocalPlaylist(id) {
    await refreshLocal();
    const p = S.local.playlists.find(x => x.id === id);
    if (!p) return navigate('playlists');
    const cover = p.tracks?.[0]?.artworkUrl || '';
    page.innerHTML = `<div class="entity-hero">${img(cover,p.title)}<div><span class="eyebrow">Playlist</span><h1>${escapeHtml(p.title)}</h1><p>${p.tracks.length} tracks • ${escapeHtml(p.source || 'LastWave')}</p><div class="page-actions"><button class="primary" id="playPlaylistBtn">Play</button><button class="secondary" id="renamePlaylistBtn">Rename</button><button class="danger-btn" id="deletePlaylistBtn">Delete</button></div></div></div>` +
      (p.tracks.length ? `<div class="track-list">${p.tracks.map(trackRow).join('')}</div>` : empty('This playlist is empty'));
    q('#playPlaylistBtn')?.addEventListener('click', () => p.tracks[0] && playTrack(p.tracks[0], p.tracks));
    q('#renamePlaylistBtn')?.addEventListener('click', () => renamePlaylistDialog(p));
    q('#deletePlaylistBtn')?.addEventListener('click', async () => {
      if (confirm(`Delete "${p.title}"?`)) { await api.library.deletePlaylist(p.id); navigate('playlists'); }
    });
  }

  async function renderDiscover() {
    page.innerHTML = pageHead('Discover','Explore new music, releases, artists and albums.') + loading('Exploring YouTube Music');
    try {
      if (!S.explore) S.explore = await api.youtube.explore();
      let html = pageHead('Discover','Explore new music, releases, artists and albums.',
        `<button class="secondary" id="newReleasesBtn">New releases</button>`);
      if (S.explore.entities?.length) html += `<section class="section"><div class="section-head"><h2>Explore</h2></div><div class="card-row">${S.explore.entities.slice(0,20).map(entityCard).join('')}</div></section>`;
      for (const sec of S.explore.sections || []) {
        if (sec.tracks?.length) html += `<section class="section"><div class="section-head"><h2>${escapeHtml(sec.title)}</h2></div><div class="card-row">${sec.tracks.map(card).join('')}</div></section>`;
      }
      if (S.explore.tracks?.length) html += `<section class="section"><div class="section-head"><h2>Tracks</h2></div><div class="track-list">${S.explore.tracks.slice(0,35).map(trackRow).join('')}</div></section>`;
      page.innerHTML = html;
      q('#newReleasesBtn')?.addEventListener('click', () => navigate('search',{query:'new music releases 2026'}));
    } catch(e) {
      page.innerHTML = pageHead('Discover') + empty('Discovery is unavailable',e.message);
    }
  }

  const GENRES = ['Pop','Hip-Hop','Rock','R&B','Electronic','Indie','Classical','Jazz','Bollywood','Punjabi','Lo-fi','Metal','Folk','Country','K-Pop','Latin','Afrobeats','Devotional','Ambient','Workout','Chill','Focus','Party','Sleep'];

  async function renderGenres() {
    page.innerHTML = pageHead('Genre DNA','Jump into a genre, mood or activity.') +
      `<section class="section"><div class="chips">${GENRES.map(g => `<button class="chip" data-genre="${escapeHtml(g)}">${escapeHtml(g)}</button>`).join('')}</div></section>
       <section id="genreResults" class="section">${empty('Choose a genre','LastWave will build an instant music shelf.')}</section>`;
    qa('[data-genre]').forEach(btn => btn.addEventListener('click', async () => {
      qa('[data-genre]').forEach(x => x.classList.remove('active')); btn.classList.add('active');
      const container = q('#genreResults');
      container.innerHTML = loading(`Finding ${btn.dataset.genre}`);
      const result = await api.youtube.search(btn.dataset.genre + ' music', 'song').catch(() => ({tracks:[]}));
      container.innerHTML = `<div class="section-head"><h2>${escapeHtml(btn.dataset.genre)}</h2><small>${result.tracks.length} results</small></div>` +
        (result.tracks.length ? `<div class="track-list">${result.tracks.slice(0,40).map(trackRow).join('')}</div>` : empty('Nothing found'));
    }));
  }

  function androidSearchTopResult(item, type) {
    if (!item) return '';
    const isTrack = type === 'song';
    const isUser = type === 'user';
    const title = item.title || item.name || item.username || 'Result';
    const subtitle = item.artist || item.subtitle || item.realname || (isUser ? item.username : '');
    const art = item.artworkUrl || '';
    const badge = type === 'artist' ? 'TOP ARTIST'
      : type === 'album' ? 'TOP ALBUM'
      : type === 'playlist' ? 'TOP PLAYLIST'
      : type === 'user' ? 'USER'
      : 'TOP SONG';
    const actionAttrs = isTrack
      ? 'data-play="' + escapeHtml(item.videoId || '') + '"'
      : isUser
        ? 'data-user-result="' + escapeHtml(item.username || '') + '"'
        : 'data-entity-kind="' + escapeHtml(item.kind || type) + '" data-entity-id="' + escapeHtml(item.browseId || '') + '"';
    if (isTrack) cacheTrack(item);
    return '<article class="android-top-result" ' + actionAttrs + '>' +
      '<div class="android-top-art ' + (type === 'artist' || type === 'user' ? 'round' : '') + '">' + img(art,title) + '</div>' +
      '<div class="android-top-copy"><span>' + badge + '</span><strong>' + escapeHtml(title) + '</strong><small>' + escapeHtml(subtitle) + '</small></div>' +
      '<button class="android-top-action">' + (type === 'playlist' || type === 'artist' || type === 'album' || type === 'user' ? '→' : '▶') + '</button>' +
    '</article>';
  }

  function androidRecentSearchRow(text) {
    return '<button class="android-search-row" data-recent-query="' + escapeHtml(text) + '"><span class="android-search-row-icon">↻</span><strong>' + escapeHtml(text) + '</strong><span class="android-search-row-tail">↗</span></button>';
  }

  async function renderSearch(query='') {
    S.activeSearchType = S.routeParams.type || 'song';

    const tabs = [
      ['song','Tracks'],
      ['artist','Artists'],
      ['album','Albums'],
      ['playlist','Playlists'],
      ['user','Users']
    ];

    page.innerHTML =
      '<div class="android-search-header">' +
        '<div class="android-search-top-row">' +
          '<button class="header-back" data-android-back="1" title="Back">‹</button>' +
          '<div class="android-search-pill"><span>⌕</span><input id="pageSearchInput" value="' + escapeHtml(query) + '" placeholder="' + (S.activeSearchType === 'user' ? 'Search Last.fm users…' : 'Search YouTube Music…') + '" autocomplete="off">' +
          (query ? '<button class="android-search-clear" id="pageSearchClear">×</button>' : '') +
          '</div>' +
        '</div>' +
        '<div class="android-search-tabs">' +
          tabs.map(function(pair){
            const selected = S.activeSearchType === pair[0];
            return '<button class="' + (selected ? 'active' : '') + '" data-search-type="' + pair[0] + '">' + pair[1] + '</button>';
          }).join('') +
        '</div>' +
      '</div>' +
      '<div id="androidSearchSuggestions" class="android-search-suggestions hidden"></div>' +
      '<div id="searchBody">' +
        (query ? loading('Searching') : '') +
      '</div>';

    const input = q('#pageSearchInput');
    let suggestionTimer;

    const submit = function(value){
      const finalValue = String(value ?? input?.value ?? '').trim();
      if (finalValue) navigate('search',{query:finalValue,type:S.activeSearchType},false);
    };

    input?.addEventListener('keydown',function(e){
      if (e.key === 'Enter') submit();
      if (e.key === 'Escape') {
        q('#androidSearchSuggestions')?.classList.add('hidden');
        input.blur();
      }
    });

    input?.addEventListener('input',function(){
      clearTimeout(suggestionTimer);
      const value = input.value.trim();
      const host = q('#androidSearchSuggestions');
      if (!value || S.activeSearchType === 'user') {
        host.classList.add('hidden');
        host.innerHTML = '';
        return;
      }
      suggestionTimer = setTimeout(async function(){
        const suggestions = await api.youtube.suggestions(value).catch(function(){ return []; });
        if (!suggestions.length) {
          host.classList.add('hidden');
          host.innerHTML = '';
          return;
        }
        host.innerHTML = suggestions.slice(0,8).map(function(text){
          return '<button class="android-search-row" data-suggest="' + escapeHtml(text) + '"><span class="android-search-row-icon">⌕</span><strong>' + escapeHtml(text) + '</strong><span class="android-search-row-tail">↗</span></button>';
        }).join('');
        host.classList.remove('hidden');
      },180);
    });

    q('#pageSearchClear')?.addEventListener('click',function(){
      navigate('search',{query:'',type:S.activeSearchType},false);
    });

    qa('[data-search-type]').forEach(function(btn){
      btn.addEventListener('click',function(){
        navigate('search',{query:input?.value?.trim() || query,type:btn.dataset.searchType},false);
      });
    });

    q('#androidSearchSuggestions')?.addEventListener('click',function(e){
      const row = e.target.closest('[data-suggest]');
      if (row) submit(row.dataset.suggest);
    });

    const body = q('#searchBody');

    if (!query) {
      const recent = (S.local?.searchHistory || []).slice(0,8);
      body.innerHTML =
        (recent.length ? '<section class="android-search-section"><div class="android-search-section-head"><strong>Recent searches</strong><button id="searchRecentClear">Clear all</button></div><div class="android-search-list">' + recent.map(androidRecentSearchRow).join('') + '</div></section>' : '') +
        '<section class="android-search-section"><div class="android-search-explore-title"><span>✦</span><strong>Explore genres & moods</strong></div><div class="android-search-explore">' +
          ['Pop','Rock','Hip-Hop','Lo-Fi','Electronic','Indie','R&B','Bollywood','Jazz','Metal','Acoustic','Chill','Anime','Classical','Synthwave'].map(function(g){
            return '<button class="chip" data-explore-query="' + escapeHtml(g) + '">' + escapeHtml(g) + '</button>';
          }).join('') +
        '</div></section>';

      qa('[data-recent-query]').forEach(function(row){ row.addEventListener('click',function(){ submit(row.dataset.recentQuery); }); });
      qa('[data-explore-query]').forEach(function(row){ row.addEventListener('click',function(){ submit(row.dataset.exploreQuery); }); });
      q('#searchRecentClear')?.addEventListener('click',async function(){
        await api.search.clearHistory();
        await refreshLocal();
        renderSearch('');
      });
      input?.focus();
      return;
    }

    try {
      if (S.activeSearchType === 'user') {
        const users = await api.lastfm.searchUsers(query,30);
        if (!users.length) {
          body.innerHTML = empty('No users found','Try another Last.fm username.');
          return;
        }
        body.innerHTML =
          '<section class="android-search-section"><div class="android-search-section-head"><strong>Top result</strong></div>' +
          androidSearchTopResult(users[0],'user') + '</section>' +
          '<section class="android-search-section"><div class="android-search-section-head"><strong>Users</strong></div><div class="android-user-results">' +
          users.slice(1).map(function(u){
            return '<button class="android-user-row" data-user-result="' + escapeHtml(u.username) + '">' +
              '<div class="android-user-avatar">' + img(u.artworkUrl,u.username) + '</div><div><strong>' + escapeHtml(u.realname || u.username) + '</strong><span>@' + escapeHtml(u.username) + (u.playcount ? ' · ' + u.playcount.toLocaleString() + ' scrobbles' : '') + '</span></div><b>›</b></button>';
          }).join('') + '</div></section>';
        qa('[data-user-result]').forEach(function(row){ row.addEventListener('click',function(){ showFriendProfile(row.dataset.userResult); }); });
        return;
      }

      const result = await api.youtube.search(query,S.activeSearchType);
      const tracks = result.tracks || [];
      const entities = result.entities || [];
      const top = S.activeSearchType === 'song' ? tracks[0] : entities[0];
      let html = '';

      if (top) {
        html += '<section class="android-search-section"><div class="android-search-section-head"><strong>Top result</strong></div>' + androidSearchTopResult(top,S.activeSearchType) + '</section>';
      }

      if (S.activeSearchType === 'song' && tracks.length) {
        html += '<section class="android-search-section"><div class="android-search-section-head"><strong>Songs</strong><span>' + tracks.length + ' results</span></div><div class="track-list">' + tracks.map(trackRow).join('') + '</div></section>';
      } else if (entities.length) {
        html += '<section class="android-search-section"><div class="android-search-section-head"><strong>' + (S.activeSearchType === 'artist' ? 'Artists' : S.activeSearchType === 'album' ? 'Albums' : 'Playlists') + '</strong></div><div class="card-row">' + entities.map(entityCard).join('') + '</div></section>';
      }

      body.innerHTML = html || empty('No results found','Try a different search.');
    } catch(e) {
      body.innerHTML = empty('Search failed',e.message || 'Please try again.');
    }
  }

  async function renderGenerator() {
    page.innerHTML = pageHead('Smart Playlist Generator','Build a mix from mood, genre and your local listening signals.') +
      `<div class="panel-card"><div class="form-grid">
        <div class="field"><label>Mood</label><select id="genMood"><option>Energetic</option><option>Chill</option><option>Focus</option><option>Happy</option><option>Melancholic</option><option>Workout</option><option>Party</option><option>Sleep</option></select></div>
        <div class="field"><label>Genre</label><select id="genGenre"><option value="">Any genre</option>${GENRES.slice(0,18).map(x=>`<option>${x}</option>`).join('')}</select></div>
        <div class="field full"><label>Seed artist / track / idea</label><input id="genSeed" placeholder="e.g. Hans Zimmer, Arijit Singh, cinematic bass, 2000s nostalgia"></div>
      </div><div class="page-actions" style="margin-top:16px"><button class="primary" id="generateBtn">Generate mix</button><button class="secondary" id="localMixBtn">Use my listening history</button></div></div>
      <section id="generatedMix" class="section">${empty('Your generated mix will appear here')}</section>`;
    q('#generateBtn').addEventListener('click', async () => {
      const mood=q('#genMood').value, genre=q('#genGenre').value, seed=q('#genSeed').value.trim();
      const q=[mood,genre,seed,'music'].filter(Boolean).join(' ');
      q('#generatedMix').innerHTML=loading('Generating');
      const result=await api.youtube.search(q,'song').catch(()=>({tracks:[]}));
      showGenerated(result.tracks.slice(0,35),`${mood} ${genre || 'mix'}`);
    });
    q('#localMixBtn').addEventListener('click', async () => {
      const tracks=await api.library.smartMix({limit:35});
      showGenerated(tracks,'Your LastWave mix');
    });
  }

  function showGenerated(tracks,title) {
    const host=q('#generatedMix');
    host.innerHTML=`<div class="section-head"><h2>${escapeHtml(title)}</h2><button class="primary" id="playGeneratedBtn">Play mix</button></div>`+
      (tracks.length?`<div class="track-list">${tracks.map(trackRow).join('')}</div>`:empty('Not enough music signals yet'));
    q('#playGeneratedBtn')?.addEventListener('click',()=>tracks[0]&&playTrack(tracks[0],tracks));
  }

  async function renderFriends() {
    const lf=S.local.settings.lastfm||{};
    page.innerHTML=pageHead('Friends','See Last.fm friends and what they are listening to.',
      `<button class="secondary" data-route="settings">Last.fm settings</button>`) + (lf.username&&lf.apiKey?loading('Loading friends'):empty('Connect Last.fm first','Add your API key and username in Settings → Integrations.'));
    if (!lf.username || !lf.apiKey) return;
    try {
      const friends=await api.lastfm.friends(lf.username);
      page.innerHTML=pageHead('Friends',`Last.fm friends for ${lf.username}`,`<button class="secondary" data-route="settings">Last.fm settings</button>`) +
        (friends.length?`<div class="wide-grid">${friends.map(f=>`<div class="friend-card" data-friend="${escapeHtml(f.username)}">${img(f.artworkUrl,f.username)}<div><strong>${escapeHtml(f.realname||f.username)}</strong><span>@${escapeHtml(f.username)}${f.recentTrack?` • ${escapeHtml(f.recentTrack.artist)} — ${escapeHtml(f.recentTrack.title)}`:''}</span></div><button class="secondary" data-friend-open="${escapeHtml(f.username)}">Open</button></div>`).join('')}</div>`:empty('No friends returned'));
      qa('[data-friend-open]').forEach(b=>b.addEventListener('click',()=>showFriendProfile(b.dataset.friendOpen)));
    } catch(e) { page.innerHTML=pageHead('Friends')+empty('Could not load Last.fm friends',e.message); }
  }

  async function showFriendProfile(username) {
    openRightPanel(username,'Last.fm profile',loading('Loading profile'));
    try {
      const [user,recent,top]=await Promise.all([api.lastfm.user(username),api.lastfm.recent(username,20),api.lastfm.top(username,'7day',10)]);
      q('#rightPanelBody').innerHTML=`<div class="panel-card" style="margin-bottom:10px">${img(user.image,user.username)}<h2>${escapeHtml(user.realname||user.username)}</h2><div class="mini-note">${user.playcount.toLocaleString()} scrobbles</div></div>
        <h3>Recent</h3>${recent.map(x=>`<div class="queue-row"><div></div><div><strong>${escapeHtml(x.title)}</strong><span>${escapeHtml(x.artist)}</span></div></div>`).join('')}
        <h3>Top this week</h3>${top.map(x=>`<div class="queue-row"><div></div><div><strong>${escapeHtml(x.title)}</strong><span>${escapeHtml(x.artist)} • ${x.plays} plays</span></div></div>`).join('')}`;
    } catch(e) { q('#rightPanelBody').innerHTML=empty('Could not load profile',e.message); }
  }

  async function renderDownloads() {
    await refreshLocal();
    const rows=S.local.downloads||[];
    page.innerHTML=pageHead('Downloads','Audio saved by LastWave on this PC.',`<button class="secondary" id="openDownloadsBtn">Open folder</button>`) +
      (rows.length?`<div class="wide-grid">${rows.map(x=>`<div class="download-row">${img(x.artworkUrl,x.title)}<div><strong>${escapeHtml(x.title)}</strong><div class="mini-note">${escapeHtml(x.artist||'')} • ${escapeHtml(x.format||'audio')}</div></div><button class="secondary" data-show-file="${escapeHtml(x.file||'')}">Show</button></div>`).join('')}</div>`:empty('No downloads yet','Use ••• on a track and choose Download.'));
    q('#openDownloadsBtn')?.addEventListener('click',()=>api.openDownloads());
    qa('[data-show-file]').forEach(b=>b.addEventListener('click',()=>api.showFile(b.dataset.showFile)));
  }


  async function renderNewReleases() {
    page.innerHTML = pageHead('New releases','Fresh music from YouTube Music.') + loading('Loading new releases');
    try {
      const result = await api.youtube.search('new music releases 2026','album');
      let html = pageHead('New releases','Fresh music from YouTube Music.');
      if(result.entities?.length) html += '<section class="section"><div class="card-row">' + result.entities.slice(0,30).map(entityCard).join('') + '</div></section>';
      if(result.tracks?.length) html += '<section class="section"><div class="section-head"><h2>New tracks</h2></div><div class="track-list">' + result.tracks.slice(0,50).map(trackRow).join('') + '</div></section>';
      page.innerHTML = html || empty('No releases found');
    } catch(e) {
      page.innerHTML = pageHead('New releases') + empty('Could not load new releases',e.message||'');
    }
  }

  async function renderProviderModules() {
    page.innerHTML = pageHead('Modules & Addons','Streaming and metadata providers available on Windows.') +
      '<div class="setting-group"><h2>Installed providers</h2><div class="setting-card">' +
        '<div class="setting-row"><div class="setting-copy"><strong>YouTube Music</strong><span>Catalog, search, playback, albums, artists and playlists</span></div><span class="chip active">Built in</span></div>' +
        '<div class="setting-row"><div class="setting-copy"><strong>LRCLIB</strong><span>Synced and plain lyrics provider</span></div><span class="chip active">Built in</span></div>' +
        '<div class="setting-row"><div class="setting-copy"><strong>Last.fm</strong><span>Scrobbling, statistics and friends</span></div><span class="chip active">Built in</span></div>' +
      '</div></div>' +
      '<div class="setting-group"><h2>Windows note</h2><div class="setting-card"><div class="setting-row"><div class="setting-copy"><strong>Remote lossless modules</strong><span>The Android provider-module ABI depends on Android services. The Windows app exposes equivalent desktop providers here rather than loading Android binaries.</span></div></div></div></div>';
  }

  async function renderHomeSections() {
    if(!S.home) {
      try { S.home = await api.youtube.home(); } catch {}
    }
    const titles = (S.home || []).map(function(x){return x.title||'Untitled section';}).filter(Boolean);
    const unique = [...new Set(titles)];
    const hidden = new Set(S.local?.settings?.homeHiddenSections || []);
    page.innerHTML = pageHead('Home sections','Choose what appears on the Home feed.') +
      '<div class="setting-group"><div class="setting-card">' +
      (unique.length ? unique.map(function(title){
        return '<div class="setting-row"><div class="setting-copy"><strong>' + escapeHtml(title) + '</strong><span>Show this section on Home</span></div><button class="toggle ' + (!hidden.has(title)?'on':'') + '" data-home-section="' + escapeHtml(title) + '"></button></div>';
      }).join('') : '<div class="setting-row"><div class="setting-copy"><strong>No sections loaded</strong><span>Open Home once, then return here.</span></div></div>') +
      '</div></div>';
    qa('[data-home-section]').forEach(function(btn){
      btn.addEventListener('click',async function(){
        const title=btn.dataset.homeSection;
        const next=new Set(S.local?.settings?.homeHiddenSections || []);
        if(next.has(title))next.delete(title);else next.add(title);
        S.local.settings=await api.settings.update({homeHiddenSections:[...next]});
        renderHomeSections();
      });
    });
  }

  async function renderExcludedSongs() {
    await refreshLocal();
    const rows=S.local.excluded||[];
    page.innerHTML=pageHead('Excluded songs','Tracks removed from Home recommendations.') +
      (rows.length ? '<div class="track-list">' + rows.map(function(track){
        cacheTrack(track);
        return '<div class="track-row">' + img(track.artworkUrl,track.title) +
          '<div class="track-main"><strong>' + escapeHtml(track.title||'Untitled') + '</strong><span>' + escapeHtml(track.artist||'Unknown artist') + '</span></div><div class="track-album"></div><div class="track-duration"></div>' +
          '<div class="track-actions"><button class="secondary header-wide" data-restore-excluded="' + escapeHtml(track.videoId) + '">Restore</button></div></div>';
      }).join('') + '</div>' : empty('No excluded songs','Use a track menu and choose Exclude from recommendations.'));
    qa('[data-restore-excluded]').forEach(function(btn){
      btn.addEventListener('click',async function(){await api.library.restoreExcluded(btn.dataset.restoreExcluded);await refreshLocal();renderExcludedSongs();});
    });
  }

  async function renderYouTubeLoginPage() {
    const connected=Boolean(S.local?.settings?.youtubeCookie);
    page.innerHTML=pageHead('YouTube Music','Connect your account to personalize library surfaces.') +
      '<div class="setting-group"><div class="setting-card"><div class="setting-row"><div class="setting-copy"><strong>' + (connected?'Connected':'Not connected') + '</strong><span>' + (connected?'Authenticated session is saved on this PC.':'Guest catalog mode is active.') + '</span></div>' +
      '<div class="page-actions"><button class="primary" id="routeYoutubeLogin">Sign in</button><button class="secondary" id="routeYoutubeLogout">Sign out</button></div></div></div></div>';
    q('#routeYoutubeLogin')?.addEventListener('click',async function(){
      toast('Complete sign-in in the YouTube Music window, then close it.',5000);
      const result=await api.youtube.login();await refreshLocal();S.home=null;S.explore=null;
      toast(result?.connected?'YouTube Music connected':'No authenticated session detected');renderYouTubeLoginPage();
    });
    q('#routeYoutubeLogout')?.addEventListener('click',async function(){await api.youtube.logout();await refreshLocal();S.home=null;S.explore=null;renderYouTubeLoginPage();});
  }

  async function renderImportPage(kind) {
    const youtube = kind==='youtube';
    const title = youtube ? 'YouTube playlist import' : 'External playlist import';
    const subtitle = youtube ? 'Import a YouTube or YouTube Music playlist.' : 'Import a public Spotify or Apple Music playlist.';
    const placeholderText = youtube ? 'https://music.youtube.com/playlist?list=…' : 'Spotify or Apple Music playlist URL';
    page.innerHTML=pageHead(title,subtitle) +
      '<div class="setting-group"><div class="setting-card" style="padding:16px"><div class="field"><label>Playlist URL</label><input id="routeImportUrl" placeholder="' + placeholderText + '"></div>' +
      '<div class="page-actions" style="margin-top:14px"><button class="primary" id="routeImportGo">Import</button><button class="secondary" id="routeImportFile">Choose file</button></div></div></div>';
    q('#routeImportGo')?.addEventListener('click',async function(){
      const value=q('#routeImportUrl').value.trim();if(!value)return;
      toast('Reading and matching playlist…',7000);
      try{const p=await api.imports.externalUrl(value);await refreshLocal();navigate('playlist-detail',{id:p.id});}catch(e){toast(e.message||'Import failed',6000);}
    });
    q('#routeImportFile')?.addEventListener('click',async function(){
      toast('Matching imported tracks…',6000);const p=await api.imports.file();if(p){await refreshLocal();navigate('playlist-detail',{id:p.id});}
    });
  }

  async function renderSettings() {
    await refreshLocal();
    const s=S.local.settings, lf=s.lastfm||{};
    const tab=S.routeParams?.tab || '';
    const tabMeta={
      audio:['Audio & Playback','Streaming quality, Audio engine, Equalizer, Output & Loudness','◉'],
      appearance:['Appearance & Visuals','Themes, Accent colors, Fluid artwork, Canvas, Lyrics','◐'],
      youtube:['YouTube & Sync','Account connection, Library sync, Channels, History','◫'],
      lastfm:['Last.fm','Account connection, Scrobbling sync & API credentials','◌'],
      library:['Library & Content','Home layout, Playlist imports, Downloads, Exclusions','♫'],
      data:['Data & Storage','Backup & Restore, Cache, history and local data','⇄'],
      about:['About & System','App version, community, diagnostics and source code','✦']
    };
    if(!tab){
      page.innerHTML=pageHead('Settings','') +
        '<div class="android-settings-tabs">' +
        Object.entries(tabMeta).map(function(entry){
          const key=entry[0],meta=entry[1];
          return '<button class="android-settings-tab" data-settings-tab="' + key + '"><span class="android-settings-icon">' + meta[2] + '</span><span><strong>' + escapeHtml(meta[0]) + '</strong><small>' + escapeHtml(meta[1]) + '</small></span><b>›</b></button>';
        }).join('') + '</div>';
      qa('[data-settings-tab]').forEach(function(btn){
        btn.addEventListener('click',function(){navigate('settings',{tab:btn.dataset.settingsTab},false);});
      });
      return;
    }
    const tabTitle=tabMeta[tab]?.[0] || 'Settings';
    page.innerHTML=pageHead(tabTitle,'') +
      `<div class="setting-group"><h2>Audio & Playback</h2><div class="setting-card">
        ${settingToggle('DJ Energy','Laya-personalized −2 dB to +5 dB predictive pre-drop + impact shaping','djEnergy',s.djEnergy)}
        ${settingToggle('Loudness normalization','Keep perceived playback level more consistent between tracks','loudnessNormalization',s.loudnessNormalization)}
        <div class="setting-row"><div class="setting-copy"><strong>Crossfade</strong><span>Fade between tracks</span></div><select id="crossfadeSetting"><option value="0">Off</option><option value="2">2 seconds</option><option value="4">4 seconds</option><option value="6">6 seconds</option></select></div>
        <div class="setting-row"><div class="setting-copy"><strong>Audio quality</strong><span>Preferred YouTube Music stream quality</span></div><select id="qualitySetting"><option value="best">Best</option><option value="balanced">Balanced</option><option value="data-saver">Data saver</option></select></div>
      </div></div>
      <div class="setting-group"><h2>Appearance</h2><div class="setting-card">
        <div class="setting-row"><div class="setting-copy"><strong>Theme</strong><span>Choose dark, light or system</span></div><select id="themeSetting"><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select></div>
        <div class="setting-row"><div class="setting-copy"><strong>Accent</strong><span>LastWave highlight color</span></div><input type="color" id="accentSetting" value="${escapeHtml(s.accent||'#c6f100')}"></div>
      </div></div>
      <div class="setting-group"><h2>Library & Content</h2><div class="setting-card">
        <div class="setting-row"><div class="setting-copy"><strong>Home sections</strong><span>Choose which recommendation rows appear on Home</span></div><button class="secondary" data-route="home-sections">Open</button></div>
        <div class="setting-row"><div class="setting-copy"><strong>Excluded songs</strong><span>Restore songs hidden from recommendations</span></div><button class="secondary" data-route="excluded-songs">Open</button></div>
        <div class="setting-row"><div class="setting-copy"><strong>Modules & Addons</strong><span>Streaming and metadata provider modules</span></div><button class="secondary" data-route="provider-modules">Open</button></div>
        <div class="setting-row"><div class="setting-copy"><strong>Download folder</strong><span>${escapeHtml(s.downloadFolder||'Windows Music/LastWave')}</span></div><button class="secondary" id="chooseDownloadFolder">Choose</button></div>
        <div class="setting-row"><div class="setting-copy"><strong>YouTube playlist import</strong><span>Import YouTube and YouTube Music playlists</span></div><button class="secondary" data-route="youtube-import">Open</button></div>
        <div class="setting-row"><div class="setting-copy"><strong>External playlist import</strong><span>Spotify, Apple Music, CSV, JSON and M3U</span></div><button class="secondary" data-route="external-import">Open</button></div>
        <div class="setting-row"><div class="setting-copy"><strong>Downloads</strong><span>Open the downloaded-music manager</span></div><button class="secondary" data-route="downloads">Open</button></div>
      </div></div>
      <div class="setting-group"><h2>YouTube & Sync</h2><div class="setting-card">
        <div class="setting-row"><div class="setting-copy"><strong>YouTube Music account</strong><span>Dedicated Android-parity connection screen</span></div><button class="secondary" data-route="youtube-login">Open</button></div>
        <div class="setting-row"><div class="setting-copy"><strong>Account connection</strong><span>${s.youtubeCookie ? 'Authenticated session saved' : 'Anonymous catalog mode'}</span></div><div class="page-actions"><button class="primary" id="youtubeLoginBtn">Sign in</button><button class="secondary" id="youtubeLogoutBtn">Sign out</button></div></div>
        <div class="field"><label>Advanced: authenticated cookie fallback</label><textarea id="youtubeCookie" placeholder="Optional manual cookie string if browser sign-in is unavailable.">${escapeHtml(s.youtubeCookie||'')}</textarea></div>
        <div class="page-actions" style="margin-top:12px"><button class="secondary" id="saveYouTubeCookie">Save manual connection</button></div>
      </div></div>
      <div class="setting-group"><h2>Last.fm Integration</h2><div class="setting-card"><div class="form-grid">
        <div class="field"><label>Username</label><input id="lfUsername" value="${escapeHtml(lf.username||'')}"></div>
        <div class="field"><label>API key</label><input id="lfApiKey" value="${escapeHtml(lf.apiKey||'')}"></div>
        <div class="field"><label>API secret</label><input id="lfApiSecret" type="password" value="${escapeHtml(lf.apiSecret||'')}"></div>
        <div class="field"><label>Session key (optional)</label><input id="lfSessionKey" type="password" value="${escapeHtml(lf.sessionKey||'')}"></div>
      </div><div class="page-actions" style="margin-top:14px"><button class="primary" id="saveLastFm">Save Last.fm</button><button class="secondary" id="authLastFm">Web sign-in</button></div></div></div>
      <div class="setting-group"><h2>Backup</h2><div class="setting-card"><div class="setting-row"><div class="setting-copy"><strong>Export / restore</strong><span>Playlists, likes, history, settings and friends</span></div><div class="page-actions"><button class="secondary" id="exportBackup">Export</button><button class="secondary" id="importBackup">Restore</button></div></div></div></div>
      <div class="setting-group"><h2>Personal DJ profile</h2><div class="setting-card"><pre class="mini-note" style="white-space:pre-wrap">${escapeHtml(JSON.stringify(S.profile,null,2))}</pre></div></div>`;

    q('#crossfadeSetting').value=String(s.crossfadeSeconds||0);
    q('#qualitySetting').value=s.audioQuality||'best';
    q('#themeSetting').value=s.theme||'dark';

    qa('[data-setting-toggle]').forEach(btn=>btn.addEventListener('click',async()=>{
      const key=btn.dataset.settingToggle, value=!btn.classList.contains('on');
      S.local.settings=await api.settings.update({[key]:value}); btn.classList.toggle('on',value);
      if(key==='djEnergy'){updateDjUi();configureDjDelay();}
    }));
    q('#crossfadeSetting').addEventListener('change',e=>api.settings.update({crossfadeSeconds:Number(e.target.value)}));
    q('#qualitySetting').addEventListener('change',e=>api.settings.update({audioQuality:e.target.value}));
    q('#themeSetting').addEventListener('change',async e=>{S.local.settings=await api.settings.update({theme:e.target.value});setTheme();});
    q('#accentSetting').addEventListener('change',async e=>{S.local.settings=await api.settings.update({accent:e.target.value});setTheme();});
    q('#chooseDownloadFolder').addEventListener('click',async()=>{await api.settings.chooseDownloadFolder();renderSettings();});
    q('#settingsImportBtn')?.addEventListener('click',importDialog);
    q('#youtubeLoginBtn').addEventListener('click',async()=>{
      toast('A YouTube Music sign-in window has opened. Close it after your account is visible.',5000);
      const result=await api.youtube.login();
      await refreshLocal();S.home=null;S.explore=null;
      toast(result?.connected?'YouTube Music account connected':'No authenticated YouTube session was detected');
      renderSettings();
    });
    q('#youtubeLogoutBtn').addEventListener('click',async()=>{
      await api.youtube.logout();await refreshLocal();S.home=null;S.explore=null;toast('YouTube Music account disconnected');renderSettings();
    });
    q('#saveYouTubeCookie').addEventListener('click',async()=>{S.local.settings=await api.settings.update({youtubeCookie:q('#youtubeCookie').value});S.home=null;S.explore=null;toast('YouTube connection saved');});
    q('#saveLastFm').addEventListener('click',saveLastFmSettings);
    q('#authLastFm').addEventListener('click',async()=>{await saveLastFmSettings();const url=await api.lastfm.authUrl();if(url)api.openExternal(url);else toast('Add your Last.fm API key first');});
    q('#exportBackup').addEventListener('click',async()=>{const file=await api.backup.export();if(file)toast('Backup exported');});
    q('#importBackup').addEventListener('click',async()=>{const data=await api.backup.import();if(data){S.local=data;setTheme();toast('Backup restored');renderSettings();}});
    const keep={
      audio:['Audio & Playback','Personal DJ profile'],
      appearance:['Appearance'],
      youtube:['YouTube & Sync'],
      lastfm:['Last.fm Integration'],
      library:['Library & Content'],
      data:['Backup'],
      about:[]
    }[tab] || [];
    qa('.setting-group').forEach(function(group){
      const heading=group.querySelector('h2')?.textContent?.trim() || '';
      group.classList.toggle('hidden',!keep.some(function(name){return heading===name || heading.startsWith(name);}));
    });
    if(tab==='about'){
      page.insertAdjacentHTML('beforeend','<div class="setting-group"><h2>About & System</h2><div class="setting-card"><div class="setting-row"><div class="setting-copy"><strong>LastWave for Windows</strong><span>Android-parity desktop build v4.5.0</span></div></div><div class="setting-row"><div class="setting-copy"><strong>Source code</strong><span>github.com/harshsinghalh/LastWave-Native</span></div><button class="secondary" id="openSourceRepo">Open</button></div></div></div>');
      q('#openSourceRepo')?.addEventListener('click',()=>api.openExternal('https://github.com/harshsinghalh/LastWave-Native'));
    }
  }

  function settingToggle(title,copy,key,on) {
    return `<div class="setting-row"><div class="setting-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(copy)}</span></div><button class="toggle ${on?'on':''}" data-setting-toggle="${escapeHtml(key)}"></button></div>`;
  }

  async function saveLastFmSettings(){
    const patch={username:q('#lfUsername').value.trim(),apiKey:q('#lfApiKey').value.trim(),apiSecret:q('#lfApiSecret').value.trim(),sessionKey:q('#lfSessionKey').value.trim()};
    S.local.settings.lastfm=await api.lastfm.save(patch);toast('Last.fm settings saved');
  }

  async function renderEntity(kind,id,title='') {
    page.innerHTML=loading('Loading details');
    try {
      const data=await api.youtube.entity(kind,id);
      const name=data.title||title||kind;
      const cover=data.tracks?.[0]?.artworkUrl || data.entities?.[0]?.artworkUrl || '';
      page.innerHTML=`<div class="entity-hero">${img(cover,name)}<div><span class="eyebrow">${escapeHtml(kind)}</span><h1>${escapeHtml(name)}</h1><p>${data.tracks.length} playable tracks</p><div class="page-actions"><button class="primary" id="entityPlay">Play</button><button class="secondary" id="entitySave">Save as playlist</button></div></div></div>`+
        (data.tracks.length?`<div class="track-list">${data.tracks.map(trackRow).join('')}</div>`:empty('No playable tracks returned'));
      q('#entityPlay')?.addEventListener('click',()=>data.tracks[0]&&playTrack(data.tracks[0],data.tracks));
      q('#entitySave')?.addEventListener('click',async()=>{if(!data.tracks.length)return;const p=await api.library.createPlaylist(name);await api.library.addToPlaylist(p.id,data.tracks);await refreshLocal();toast('Saved to your playlists');});
    } catch(e){page.innerHTML=pageHead(title||'Details')+empty('Could not load this item',e.message);}
  }

  function modal(title,body,actions) {
    const host=q('#modalHost');
    host.innerHTML=`<div class="modal-wrap"><div class="modal"><h2>${escapeHtml(title)}</h2>${body}<div class="modal-actions">${actions}</div></div></div>`;
    host.querySelector('[data-close-modal]')?.addEventListener('click',()=>host.innerHTML='');
    host.querySelector('.modal-wrap')?.addEventListener('click',e=>{if(e.target.classList.contains('modal-wrap'))host.innerHTML='';});
  }

  function createPlaylistDialog(){
    modal('New playlist',`<div class="field"><label>Name</label><input id="newPlaylistName" autofocus placeholder="Playlist name"></div>`,`<button class="secondary" data-close-modal>Cancel</button><button class="primary" id="confirmCreatePlaylist">Create</button>`);
    q('#confirmCreatePlaylist').addEventListener('click',async()=>{const p=await api.library.createPlaylist(q('#newPlaylistName').value);q('#modalHost').innerHTML='';await refreshLocal();navigate('playlist-detail',{id:p.id});});
  }

  function renamePlaylistDialog(p){
    modal('Rename playlist',`<div class="field"><label>Name</label><input id="renamePlaylistName" value="${escapeHtml(p.title)}"></div>`,`<button class="secondary" data-close-modal>Cancel</button><button class="primary" id="confirmRename">Save</button>`);
    q('#confirmRename').addEventListener('click',async()=>{await api.library.renamePlaylist(p.id,q('#renamePlaylistName').value);q('#modalHost').innerHTML='';renderLocalPlaylist(p.id);});
  }

  function importDialog(){
    modal('Import playlist',`<div class="field"><label>Public playlist URL</label><input id="importYoutubeUrl" placeholder="YouTube Music, Spotify or Apple Music playlist URL"></div><p class="mini-note">LastWave reads public playlist metadata and matches songs to the YouTube Music catalog. You can also import CSV, JSON, M3U or text lists.</p>`,
      `<button class="secondary" data-close-modal>Cancel</button><button class="secondary" id="importFileBtn">Choose file</button><button class="primary" id="importYoutubeBtn">Import URL</button>`);
    q('#importFileBtn').addEventListener('click',async()=>{toast('Matching imported tracks…',6000);const p=await api.imports.file();if(p){q('#modalHost').innerHTML='';await refreshLocal();navigate('playlist-detail',{id:p.id});}});
    q('#importYoutubeBtn').addEventListener('click',async()=>{const input=q('#importYoutubeUrl').value.trim();if(!input)return;toast('Reading and matching playlist…',7000);try{const p=await api.imports.externalUrl(input);q('#modalHost').innerHTML='';await refreshLocal();navigate('playlist-detail',{id:p.id});}catch(e){toast(e.message,6000);}});
  }

  function openRightPanel(title,subtitle,bodyHtml){
    q('#rightPanelTitle').textContent=title;q('#rightPanelSubtitle').textContent=subtitle||'';q('#rightPanelBody').innerHTML=bodyHtml||'';q('#rightPanel').classList.remove('hidden');
  }
  function closeRightPanel(){ q('#rightPanel').classList.add('hidden'); }

  async function showLyrics(){
    if(!S.current)return toast('Play a song first');
    openRightPanel('Lyrics',S.current.title,loading('Finding synced lyrics'));
    try{
      S.lyrics=await api.lyrics.get(S.current);S.parsedLyrics=parseLrc(S.lyrics.synced);
      renderLyricsPanel();
    }catch(e){q('#rightPanelBody').innerHTML=empty('No lyrics available',e.message);}
  }

  function parseLrc(text){
    if(!text)return[];
    const lines=[];
    for(const raw of text.split(/\r?\n/)){
      const matches=[...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
      const content=raw.replace(/\[[^\]]+\]/g,'').trim();
      for(const m of matches)lines.push({time:Number(m[1])*60+Number(m[2]),text:content});
    }
    return lines.sort((a,b)=>a.time-b.time);
  }

  function renderLyricsPanel(){
    const host=q('#rightPanelBody');
    if(S.parsedLyrics.length){
      host.innerHTML=`<div class="lyrics">${S.parsedLyrics.map((x,i)=>`<div class="lyric-line" data-lyric-index="${i}">${escapeHtml(x.text||'♪')}</div>`).join('')}</div><div class="mini-note" style="padding:10px">Provider: ${escapeHtml(S.lyrics.provider||'Unknown')}</div>`;
      qa('[data-lyric-index]').forEach(el=>el.addEventListener('click',()=>{audio.currentTime=S.parsedLyrics[Number(el.dataset.lyricIndex)].time+(djLookahead()/1000);}));
    }else if(S.lyrics?.plain){
      host.innerHTML=`<div class="plain-lyrics">${escapeHtml(S.lyrics.plain)}</div><div class="mini-note" style="margin-top:12px">Provider: ${escapeHtml(S.lyrics.provider||'Unknown')}</div>`;
    }else host.innerHTML=empty(S.lyrics?.instrumental?'Instrumental track':'Lyrics not found');
  }

  function syncLyrics(){
    if(!S.parsedLyrics.length || q('#rightPanel').classList.contains('hidden') || q('#rightPanelTitle').textContent!=='Lyrics')return;
    const t=Math.max(0,audio.currentTime-djLookahead()/1000);
    let idx=-1;
    for(let i=0;i<S.parsedLyrics.length;i++){if(S.parsedLyrics[i].time<=t)idx=i;else break;}
    qa('.lyric-line').forEach((el,i)=>el.classList.toggle('active',i===idx));
    const active=q('.lyric-line.active');if(active)active.scrollIntoView({block:'center',behavior:'smooth'});
  }

  function showQueue(){
    openRightPanel('Queue',`${S.queue.length} tracks`,S.queue.length?S.queue.map((t,i)=>`<div class="queue-row ${i===S.queueIndex?'playing':''}" data-queue-index="${i}">${img(t.artworkUrl,t.title)}<div><strong>${escapeHtml(t.title)}</strong><span>${escapeHtml(t.artist)}</span></div><span>${i===S.queueIndex?'▶':''}</span></div>`).join(''):empty('Queue is empty'));
    qa('[data-queue-index]').forEach(el=>el.addEventListener('click',()=>playIndex(Number(el.dataset.queueIndex))));
  }

  async function playTrack(track,queue=null){
    if(!track?.videoId)return;
    if(queue?.length){S.queue=[...queue];S.queueIndex=Math.max(0,S.queue.findIndex(x=>x.videoId===track.videoId));}
    else if(!S.queue.length||!S.queue.some(x=>x.videoId===track.videoId)){S.queue=[track];S.queueIndex=0;}
    else S.queueIndex=S.queue.findIndex(x=>x.videoId===track.videoId);
    S.current=track;S.lyrics=null;S.parsedLyrics=[];S.playedHistoryFor=null;S.scrobbledFor=null;
    updatePlayerUi();
    await ensureAudioGraph();
    audio.src=S.streamBase+encodeURIComponent(track.videoId);
    audio.load();
    try{await audio.play();setConnection('Playing • YouTube Music');await api.lastfm.nowPlaying(track).catch(()=>{});}catch(e){toast('Playback failed: '+e.message);}
    updateMediaSession();
    if(q('#rightPanelTitle').textContent==='Queue')showQueue();
  }

  function playIndex(index){
    if(!S.queue.length)return;
    if(S.shuffle)index=Math.floor(Math.random()*S.queue.length);
    index=(index+S.queue.length)%S.queue.length;
    S.queueIndex=index;playTrack(S.queue[index]);
  }
  function next(){if(S.repeat&&S.current){audio.currentTime=0;audio.play();return;}if(S.queue.length)playIndex(S.queueIndex+1);}
  function prev(){if(audio.currentTime>4){audio.currentTime=0;return;}if(S.queue.length)playIndex(S.queueIndex-1);}

  async function ensureAudioGraph(){
    if(S.playerReady)return;
    const AC=window.AudioContext||window.webkitAudioContext;S.audioCtx=new AC();
    S.sourceNode=S.audioCtx.createMediaElementSource(audio);
    S.analyser=S.audioCtx.createAnalyser();S.analyser.fftSize=2048;S.analyser.smoothingTimeConstant=.18;
    S.delayNode=S.audioCtx.createDelay(1);S.djGain=S.audioCtx.createGain();S.compressor=S.audioCtx.createDynamicsCompressor();
    S.compressor.threshold.value=-1.5;S.compressor.knee.value=4;S.compressor.ratio.value=20;S.compressor.attack.value=.002;S.compressor.release.value=.16;
    S.sourceNode.connect(S.analyser);S.sourceNode.connect(S.delayNode);S.delayNode.connect(S.djGain);S.djGain.connect(S.compressor);S.compressor.connect(S.audioCtx.destination);
    configureDjDelay();S.playerReady=true;startDjLoop();
  }

  function djLookahead(){return Number(S.profile?.lookahead_ms||80);}
  function configureDjDelay(){if(S.delayNode){const enabled=Boolean(S.local?.settings?.djEnergy);S.delayNode.delayTime.setTargetAtTime(enabled?djLookahead()/1000:0,S.audioCtx.currentTime,.03);}}
  function dbToGain(db){return Math.pow(10,db/20);}

  function startDjLoop(){
    if(S.djTimer)clearInterval(S.djTimer);
    const time=new Float32Array(S.analyser.fftSize),freq=new Float32Array(S.analyser.frequencyBinCount);
    S.djTimer=setInterval(()=>{
      if(audio.paused||!S.current||!S.audioCtx)return;
      S.analyser.getFloatTimeDomainData(time);S.analyser.getFloatFrequencyData(freq);
      let power=0;for(const x of time)power+=x*x;power/=time.length;
      const rmsDb=10*Math.log10(Math.max(power,1e-10));
      const sr=S.audioCtx.sampleRate,binHz=sr/S.analyser.fftSize;
      let vocal=0,full=0,vCount=0,fCount=0;
      for(let i=1;i<freq.length;i++){const hz=i*binHz,lin=Math.pow(10,freq[i]/10);if(Number.isFinite(lin)){full+=lin;fCount++;if(hz>=180&&hz<=4000){vocal+=lin;vCount++;}}}
      const bandRatio=(vocal/Math.max(vCount,1))/(full/Math.max(fCount,1)+1e-12);
      const vocalProb=clamp((bandRatio-.9)/1.6,0,1);
      const energy=clamp((rmsDb+42)/24,0,1);
      let baseDb=(1-vocalProb)*(.75+4.25*energy)-vocalProb*2;
      if(rmsDb<-52)baseDb=0;baseDb=clamp(baseDb,Number(S.profile.minimum_db??-2),Number(S.profile.maximum_db??5));

      const now=performance.now(),enabled=Boolean(S.local?.settings?.djEnergy);
      if(enabled){
        const surge=rmsDb-S.avgDb;
        const strong=surge>=Number(S.profile.strong_surge_db??4.5)&&rmsDb>-24;
        const loud=surge>=Number(S.profile.loud_surge_db??2.5)&&rmsDb>-10;
        if((strong||loud)&&now>S.cooldownUntil&&now>S.impactUntil){
          S.impactAt=now+djLookahead();S.impactUntil=S.impactAt+Number(S.profile.impact_hold_ms||70);S.cooldownUntil=S.impactAt+Number(S.profile.cooldown_ms||420);
        }
      }
      S.avgDb=S.avgDb*.92+rmsDb*.08;
      let target=enabled?baseDb:0;
      if(enabled&&now<S.impactAt)target=Number(S.profile.pre_drop_db??-2);
      else if(enabled&&now<S.impactUntil)target=Number(S.profile.impact_db??5);
      const tau=target<S.djDb?Number(S.profile.pre_duck_ms||22):now<S.impactUntil?Number(S.profile.impact_attack_ms||6):Number(S.profile.impact_release_ms||180);
      const alpha=1-Math.exp(-20/Math.max(tau,1));S.djDb+= (target-S.djDb)*alpha;
      S.djGain.gain.setTargetAtTime(dbToGain(S.djDb),S.audioCtx.currentTime,.012);
      updateDjMeter();
    },20);
  }

  function updateDjMeter(){
    const el=q('#djMeter');if(!el)return;const enabled=Boolean(S.local?.settings?.djEnergy);el.classList.toggle('off',!enabled);el.querySelector('b').textContent=(S.djDb>=0?'+':'')+S.djDb.toFixed(1)+' dB';
  }
  function updateDjUi(){const enabled=Boolean(S.local?.settings?.djEnergy);q('#djQuickToggle').classList.toggle('active',enabled);q('#djQuickToggle').textContent=enabled?'DJ Energy':'DJ Off';updateDjMeter();}

  function updatePlayerUi(){
    const t=S.current;
    q('#playerTitle').textContent=t?.title||'Nothing playing';
    q('#playerArtist').textContent=t?.artist||'Choose a song to start';
    q('#playerArt').src=t?.artworkUrl||placeholder(t?.title||'LW');
    q('.player')?.classList.toggle('android-hidden',!t);
    updatePlayerLike();
    updateDjUi();
    refreshFullPlayer();
  }
  function updatePlayerLike(){
    const liked=S.current&&S.local?.liked?.some(x=>x.videoId===S.current.videoId);q('#likeBtn').textContent=liked?'♥':'♡';q('#likeBtn').classList.toggle('active',Boolean(liked));
  }

  function updateMediaSession(){
    if(!('mediaSession'in navigator)||!S.current)return;
    try{
      navigator.mediaSession.metadata=new MediaMetadata({title:S.current.title||'',artist:S.current.artist||'',album:S.current.album||'',artwork:S.current.artworkUrl?[{src:S.current.artworkUrl,sizes:'512x512'}]:[]});
      navigator.mediaSession.setActionHandler('play',()=>audio.play());navigator.mediaSession.setActionHandler('pause',()=>audio.pause());navigator.mediaSession.setActionHandler('previoustrack',prev);navigator.mediaSession.setActionHandler('nexttrack',next);
      navigator.mediaSession.setActionHandler('seekto',d=>{if(d.seekTime!=null)audio.currentTime=d.seekTime;});
    }catch{}
  }

  function contextMenu(track,x,y){
    if(!track)return;
    const menu=q('#contextMenu');const liked=S.local.liked.some(t=>t.videoId===track.videoId);
    menu.innerHTML=`<button data-cm="play">Play now</button><button data-cm="next">Play next</button><button data-cm="like">${liked?'Remove from liked':'Add to liked'}</button><button data-cm="playlist">Add to playlist…</button><button data-cm="download">Download</button><button data-cm="related">Related tracks</button><button data-cm="exclude">Exclude from recommendations</button>`;
    menu.style.left=Math.min(x,innerWidth-240)+'px';menu.style.top=Math.min(y,innerHeight-280)+'px';menu.classList.remove('hidden');
    menu.querySelectorAll('button').forEach(b=>b.addEventListener('click',async()=>{menu.classList.add('hidden');switch(b.dataset.cm){case'play':playTrack(track);break;case'next':{const i=Math.max(0,S.queueIndex+1);S.queue.splice(i,0,track);toast('Added next');break;}case'like':await toggleLike(track);break;case'playlist':playlistPicker(track);break;case'download':downloadTrack(track);break;case'related':showRelated(track);break;case'exclude':await api.library.excludeTrack(track);await refreshLocal();toast('Excluded from recommendations');if(S.route==='feed')renderFeed();break;}}));
  }

  async function toggleLike(track){const liked=await api.library.toggleLike(track);await refreshLocal();toast(liked?'Added to liked songs':'Removed from liked songs');updatePlayerLike();}
  function playlistPicker(track){
    const rows=S.local.playlists.map(p=>`<button class="secondary" style="width:100%;margin:4px 0" data-pick-playlist="${escapeHtml(p.id)}">${escapeHtml(p.title)} <span class="mini-note">(${p.tracks.length})</span></button>`).join('');
    modal('Add to playlist',rows||empty('No playlists yet'),`<button class="secondary" data-close-modal>Cancel</button><button class="primary" id="pickerNewPlaylist">New playlist</button>`);
    qa('[data-pick-playlist]').forEach(b=>b.addEventListener('click',async()=>{await api.library.addToPlaylist(b.dataset.pickPlaylist,track);q('#modalHost').innerHTML='';await refreshLocal();toast('Added to playlist');}));
    q('#pickerNewPlaylist')?.addEventListener('click',()=>{ q('#modalHost').innerHTML=''; createPlaylistDialog(); });
  }
  async function downloadTrack(track){toast('Downloading '+track.title+'…',6000);try{const r=await api.downloads.track(track);await refreshLocal();toast('Saved '+r.name);}catch(e){toast('Download failed: '+e.message);}}
  async function showRelated(track){openRightPanel('Related',track.title,loading('Finding related music'));const list=await api.youtube.related(track.videoId).catch(()=>[]);q('#rightPanelBody').innerHTML=list.length?`<div class="track-list">${list.slice(0,30).map(trackRow).join('')}</div>`:empty('No related tracks returned');}


  function fullPlayerRoot(){
    return document.getElementById('androidFullPlayer');
  }

  function closeFullPlayer(){
    const el=fullPlayerRoot();
    if(el) el.remove();
  }

  function fullPlayerNowMarkup(){
    const t=S.current;
    if(!t) return '';
    const liked=Boolean(S.local?.liked?.some(function(x){return x.videoId===t.videoId;}));
    return '<div class="android-now-playing">' +
      '<img class="android-player-art" src="' + escapeHtml(t.artworkUrl||placeholder(t.title)) + '" alt="">' +
      '<div class="android-player-meta"><div><h2>' + escapeHtml(t.title||'') + '</h2><p>' + escapeHtml(t.artist||'') + '</p></div>' +
      '<button class="android-player-heart" id="androidFullLike">' + (liked?'♥':'♡') + '</button></div>' +
      '<div class="android-player-progress"><input id="androidFullSeek" type="range" min="0" max="1000" value="0"><div class="android-player-times"><span id="androidFullCurrent">0:00</span><span id="androidFullDuration">0:00</span></div></div>' +
      '<div class="android-player-controls"><button class="side" id="androidFullPrev">⏮</button><button class="main" id="androidFullPlay">' + (audio.paused?'▶':'❚❚') + '</button><button class="side" id="androidFullNext">⏭</button></div>' +
      '<div class="android-player-extras"><button id="androidFullShuffle">Shuffle</button><button id="androidFullDj">' + (S.local?.settings?.djEnergy?'DJ Energy on':'DJ Energy off') + '</button><button id="androidFullRepeat">Repeat</button></div>' +
    '</div>';
  }

  function fullPlayerQueueMarkup(){
    if(!S.queue.length) return '<div class="android-player-pane">' + empty('Queue is empty') + '</div>';
    return '<div class="android-player-pane">' + S.queue.map(function(t,i){
      cacheTrack(t);
      return '<div class="queue-row ' + (i===S.queueIndex?'playing':'') + '" data-full-queue-index="' + i + '">' +
        img(t.artworkUrl,t.title) + '<div><strong>' + escapeHtml(t.title) + '</strong><span>' + escapeHtml(t.artist) + '</span></div><span>' + (i===S.queueIndex?'▶':'') + '</span></div>';
    }).join('') + '</div>';
  }

  async function fullPlayerLyricsMarkup(host){
    host.innerHTML='<div class="android-player-pane">' + loading('Loading lyrics') + '</div>';
    try{
      S.lyrics=await api.lyrics.get(S.current);
      S.parsedLyrics=parseLrc(S.lyrics.synced);
      if(S.parsedLyrics.length){
        host.innerHTML='<div class="android-player-pane lyrics">' + S.parsedLyrics.map(function(x,i){
          return '<div class="lyric-line" data-full-lyric-index="' + i + '">' + escapeHtml(x.text||'♪') + '</div>';
        }).join('') + '</div>';
      }else if(S.lyrics?.plain){
        host.innerHTML='<div class="android-player-pane plain-lyrics">' + escapeHtml(S.lyrics.plain) + '</div>';
      }else{
        host.innerHTML='<div class="android-player-pane">' + empty(S.lyrics?.instrumental?'Instrumental track':'Lyrics not found') + '</div>';
      }
    }catch(e){
      host.innerHTML='<div class="android-player-pane">' + empty('Lyrics not found',e.message||'') + '</div>';
    }
  }

  function bindFullPlayer(){
    q('#androidFullClose')?.addEventListener('click',closeFullPlayer);
    q('#androidFullPrev')?.addEventListener('click',prev);
    q('#androidFullNext')?.addEventListener('click',next);
    q('#androidFullPlay')?.addEventListener('click',async function(){ if(audio.paused) await audio.play(); else audio.pause(); refreshFullPlayer(); });
    q('#androidFullLike')?.addEventListener('click',async function(){ if(S.current) await toggleLike(S.current); refreshFullPlayer(); });
    q('#androidFullShuffle')?.addEventListener('click',function(){S.shuffle=!S.shuffle;toast(S.shuffle?'Shuffle on':'Shuffle off');});
    q('#androidFullRepeat')?.addEventListener('click',function(){S.repeat=!S.repeat;toast(S.repeat?'Repeat on':'Repeat off');});
    q('#androidFullDj')?.addEventListener('click',async function(){
      const value=!S.local.settings.djEnergy;
      S.local.settings=await api.settings.update({djEnergy:value});
      updateDjUi();configureDjDelay();refreshFullPlayer();
    });
    q('#androidFullSeek')?.addEventListener('input',function(e){if(Number.isFinite(audio.duration)&&audio.duration>0)audio.currentTime=Number(e.target.value)/1000*audio.duration;});
    qa('[data-full-queue-index]').forEach(function(el){el.addEventListener('click',function(){playIndex(Number(el.dataset.fullQueueIndex));});});
    qa('[data-full-lyric-index]').forEach(function(el){el.addEventListener('click',function(){const row=S.parsedLyrics[Number(el.dataset.fullLyricIndex)];if(row)audio.currentTime=row.time+(djLookahead()/1000);});});
    qa('[data-full-tab]').forEach(function(btn){btn.addEventListener('click',function(){showFullPlayer(btn.dataset.fullTab);});});
  }

  async function showFullPlayer(tab){
    if(!S.current) return;
    tab=tab||'now';
    closeFullPlayer();
    const root=document.createElement('div');
    root.id='androidFullPlayer';
    root.className='android-full-player';
    const art=escapeHtml(S.current.artworkUrl||placeholder(S.current.title));
    root.innerHTML=
      '<div class="android-player-bg" style="background-image:url(&quot;' + art + '&quot;)"></div><div class="android-player-scrim"></div>' +
      '<div class="android-player-content"><div class="android-player-top"><button id="androidFullClose">⌄</button>' +
      '<div class="android-player-tabs"><button data-full-tab="now" class="' + (tab==='now'?'active':'') + '">Now Playing</button><button data-full-tab="lyrics" class="' + (tab==='lyrics'?'active':'') + '">Lyrics</button><button data-full-tab="queue" class="' + (tab==='queue'?'active':'') + '">Queue</button></div>' +
      '<span></span></div><div id="androidFullBody" class="android-player-body"></div></div>';
    document.body.appendChild(root);
    const host=q('#androidFullBody');
    if(tab==='now') host.innerHTML=fullPlayerNowMarkup();
    else if(tab==='queue') host.innerHTML=fullPlayerQueueMarkup();
    else await fullPlayerLyricsMarkup(host);
    bindFullPlayer();
    updateFullPlayerProgress();
  }

  function refreshFullPlayer(){
    const root=fullPlayerRoot();
    if(!root||!S.current)return;
    const active=root.querySelector('[data-full-tab].active')?.dataset.fullTab||'now';
    if(active==='now'){
      const host=q('#androidFullBody');
      if(host)host.innerHTML=fullPlayerNowMarkup();
      bindFullPlayer();
      updateFullPlayerProgress();
    }
  }

  function updateFullPlayerProgress(){
    const seek=q('#androidFullSeek');
    if(seek&&Number.isFinite(audio.duration)&&audio.duration>0){
      seek.value=String(Math.floor(audio.currentTime/audio.duration*1000));
      const c=q('#androidFullCurrent'),d=q('#androidFullDuration');
      if(c)c.textContent=fmtTime(audio.currentTime);if(d)d.textContent=fmtTime(audio.duration);
    }
    const play=q('#androidFullPlay');if(play)play.textContent=audio.paused?'▶':'❚❚';
    if(S.parsedLyrics.length&&fullPlayerRoot()){
      const t=Math.max(0,audio.currentTime-djLookahead()/1000);
      let idx=-1;for(let i=0;i<S.parsedLyrics.length;i++){if(S.parsedLyrics[i].time<=t)idx=i;else break;}
      qa('#androidFullPlayer .lyric-line').forEach(function(el,i){el.classList.toggle('active',i===idx);});
      const active=q('#androidFullPlayer .lyric-line.active');if(active)active.scrollIntoView({block:'center',behavior:'smooth'});
    }
  }

  document.addEventListener('click',e=>{
    const back=e.target.closest('[data-android-back]');if(back){if(S.route==='settings'&&S.routeParams?.tab){S.routeParams={};renderSettings();return;}if(S.historyIndex>0){S.historyIndex--;const h=S.history[S.historyIndex];S.route=h.route;S.routeParams=h.params;document.body.dataset.route=S.route;renderRoute();}return;}
    const route=e.target.closest('[data-route]');if(route){const params=route.dataset.query?{query:route.dataset.query}:{};navigate(route.dataset.route,params);return;}
    const local=e.target.closest('[data-local-playlist]');if(local){navigate('playlist-detail',{id:local.dataset.localPlaylist});return;}
    const entity=e.target.closest('[data-entity-id]');if(entity){navigate('entity',{kind:entity.dataset.entityKind,id:entity.dataset.entityId,title:entity.querySelector('h3')?.textContent||''});return;}
    const like=e.target.closest('[data-like]');if(like){e.stopPropagation();const t=findTrack(like.dataset.like);if(t)toggleLike(t);return;}
    const more=e.target.closest('[data-context]');if(more){e.stopPropagation();const t=findTrack(more.dataset.context);contextMenu(t,e.clientX,e.clientY);return;}
    const play=e.target.closest('[data-play]');if(play){const t=findTrack(play.dataset.play);if(t){const list=play.closest('.track-list')?qa('.track-row',play.closest('.track-list')).map(el=>findTrack(el.dataset.play)).filter(Boolean):null;playTrack(t,list);}return;}
    if(!e.target.closest('#contextMenu'))q('#contextMenu').classList.add('hidden');
  });

  function installTopbar(){
    q('#nav').addEventListener('click',e=>{const b=e.target.closest('[data-route]');if(b)navigate(b.dataset.route);});
    q('#openSettingsBtn').addEventListener('click',()=>navigate('settings'));
    q('#backBtn').addEventListener('click',()=>{if(S.historyIndex>0){S.historyIndex--;const h=S.history[S.historyIndex];S.route=h.route;S.routeParams=h.params;renderRoute();}});
    q('#forwardBtn').addEventListener('click',()=>{if(S.historyIndex<S.history.length-1){S.historyIndex++;const h=S.history[S.historyIndex];S.route=h.route;S.routeParams=h.params;renderRoute();}});
    const input=q('#globalSearchInput');let timer;
    input.addEventListener('input',()=>{clearTimeout(timer);const query=input.value.trim();if(!query){q('#suggestions').classList.add('hidden');return;}timer=setTimeout(async()=>{const suggestions=await api.youtube.suggestions(query).catch(()=>[]);const host=q('#suggestions');host.innerHTML=suggestions.map(x=>`<div class="suggestion" data-suggest="${escapeHtml(x)}">${escapeHtml(x)}</div>`).join('');host.classList.toggle('hidden',!suggestions.length);},220);});
    input.addEventListener('keydown',e=>{if(e.key==='Enter'){const query=input.value.trim();if(query){q('#suggestions').classList.add('hidden');navigate('search',{query:query});}}});
    q('#suggestions').addEventListener('click',e=>{const s=e.target.closest('[data-suggest]');if(s){input.value=s.dataset.suggest;q('#suggestions').classList.add('hidden');navigate('search',{query:s.dataset.suggest});}});
  }

  function installPlayer(){
    q('#playBtn').addEventListener('click',async()=>{if(!S.current)return navigate('search');if(audio.paused)await audio.play();else audio.pause();});
    q('#nextBtn').addEventListener('click',next);q('#prevBtn').addEventListener('click',prev);
    q('#shuffleBtn').addEventListener('click',()=>{S.shuffle=!S.shuffle;q('#shuffleBtn').classList.toggle('active',S.shuffle);});
    q('#repeatBtn').addEventListener('click',()=>{S.repeat=!S.repeat;q('#repeatBtn').classList.toggle('active',S.repeat);});
    q('#volume').addEventListener('input',e=>{S.volume=Number(e.target.value)/100;audio.volume=S.volume;});
    q('#seek').addEventListener('input',e=>{if(Number.isFinite(audio.duration)&&audio.duration>0)audio.currentTime=Number(e.target.value)/1000*audio.duration;});
    q('#likeBtn').addEventListener('click',()=>S.current&&toggleLike(S.current));
    q('#nowPlayingCard').addEventListener('click',e=>{if(!e.target.closest('#likeBtn')&&S.current)showFullPlayer('now');});
    q('#lyricsBtn').addEventListener('click',showLyrics);q('#queueBtn').addEventListener('click',showQueue);q('#closeRightPanel').addEventListener('click',closeRightPanel);
    q('#djQuickToggle').addEventListener('click',async()=>{const value=!S.local.settings.djEnergy;S.local.settings=await api.settings.update({djEnergy:value});updateDjUi();configureDjDelay();});
    audio.volume=S.volume;
    audio.addEventListener('play',()=>{q('#playBtn').textContent='❚❚';if(S.audioCtx?.state==='suspended')S.audioCtx.resume();});
    audio.addEventListener('pause',()=>q('#playBtn').textContent='▶');
    audio.addEventListener('loadedmetadata',()=>{q('#duration').textContent=fmtTime(audio.duration);});
    audio.addEventListener('timeupdate',async()=>{
      if(Number.isFinite(audio.duration)&&audio.duration>0){q('#seek').value=String(Math.floor(audio.currentTime/audio.duration*1000));q('#currentTime').textContent=fmtTime(audio.currentTime);q('#duration').textContent=fmtTime(audio.duration);}
      syncLyrics();
      updateFullPlayerProgress();
      if(S.current&&audio.currentTime>5&&S.playedHistoryFor!==S.current.videoId){S.playedHistoryFor=S.current.videoId;api.history.add(S.current,audio.currentTime).catch(()=>{});}
      const threshold=Math.min(240,Math.max(30,(audio.duration||180)*.5));
      if(S.current&&audio.currentTime>=threshold&&S.scrobbledFor!==S.current.videoId){S.scrobbledFor=S.current.videoId;api.lastfm.scrobble(S.current,Math.floor(Date.now()/1000-audio.currentTime)).catch(()=>{});}
    });
    audio.addEventListener('ended',next);
    audio.addEventListener('error',()=>toast('The current stream could not be played. Try another track.'));
  }

  api.onLastFmAuth(async result=>{if(result.ok){await refreshLocal();toast('Last.fm connected as '+result.value.username);if(S.route==='settings')renderSettings();}else toast(result.message||'Last.fm sign-in failed');});

  async function init(){
    try{
      S.bootstrap=await api.bootstrap();S.local=S.bootstrap.state;S.profile=S.bootstrap.profile||{};S.streamBase=S.bootstrap.streamBase;
      setTheme();setConnection('Ready');installTopbar();installPlayer();updatePlayerUi();navigate('feed',{},false);
    }catch(e){setConnection('Startup failed','error');page.innerHTML=pageHead('LastWave could not start')+empty(e.message);}
  }

  window.addEventListener('DOMContentLoaded',init);
})();
